import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog, getRequestMetadata } from '@/lib/audit';
import {
  generateTOTPSecret,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  generateOTP,
  generateTOTPUri,
  generateDeviceFingerprint,
  generateSessionToken,
  hashSessionToken,
} from '@/lib/security';
import type { PrismaClient, SecurityEventType, Role, Prisma } from '@prisma/client';

// MFA lockout constants
const MAX_MFA_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const BACKUP_CODES_COUNT = 10;
const OTP_EXPIRY_MINUTES = 10;

// Helper to log security events
async function logSecurityEvent(
  prisma: PrismaClient,
  eventType: SecurityEventType,
  userId: string | null,
  organizationId: string,
  success: boolean,
  metadata?: Record<string, unknown>
) {
  const { ipAddress, userAgent } = await getRequestMetadata();

  await prisma.securityEvent.create({
    data: {
      eventType,
      userId,
      organizationId,
      ipAddress,
      userAgent,
      success,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      severity: success ? 'INFO' : 'WARNING',
    },
  });
}

export const securityRouter = router({
  // ============================================
  // MFA Setup Procedures
  // ============================================

  // Get MFA status for current user
  getMFAStatus: protectedProcedure.query(async ({ ctx }) => {
    const mfaConfigs = await ctx.prisma.mFAConfiguration.findMany({
      where: { userId: ctx.user.id },
      select: {
        id: true,
        method: true,
        verified: true,
        verifiedAt: true,
        lastUsedAt: true,
        backupCodesUsed: true,
        createdAt: true,
      },
    });

    const hasVerifiedMFA = mfaConfigs.some(c => c.verified);
    const totpConfig = mfaConfigs.find(c => c.method === 'TOTP');

    return {
      enabled: hasVerifiedMFA,
      methods: mfaConfigs,
      backupCodesRemaining: totpConfig
        ? BACKUP_CODES_COUNT - totpConfig.backupCodesUsed
        : null,
    };
  }),

  // Initialize TOTP MFA setup
  setupMFA: protectedProcedure
    .input(
      z.object({
        method: z.enum(['TOTP', 'SMS', 'EMAIL']),
        phoneNumber: z.string().optional(), // For SMS
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for existing unverified setup
      const existing = await ctx.prisma.mFAConfiguration.findFirst({
        where: {
          userId: ctx.user.id,
          method: input.method,
        },
      });

      if (existing?.verified) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${input.method} MFA is already configured and verified`,
        });
      }

      let secret: string;
      let qrCodeUri: string | null = null;

      if (input.method === 'TOTP') {
        // Generate TOTP secret
        secret = generateTOTPSecret();
        qrCodeUri = generateTOTPUri(secret, ctx.user.email, 'ChiroFlow');
      } else if (input.method === 'SMS') {
        if (!input.phoneNumber) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Phone number is required for SMS MFA',
          });
        }
        secret = input.phoneNumber;
      } else {
        // EMAIL - use user's email
        secret = ctx.user.email;
      }

      // Generate backup codes
      const backupCodes = generateBackupCodes(BACKUP_CODES_COUNT);
      const hashedBackupCodes = backupCodes.map(hashBackupCode);

      // Create or update MFA configuration
      const mfaConfig = existing
        ? await ctx.prisma.mFAConfiguration.update({
            where: { id: existing.id },
            data: {
              secret,
              verified: false,
              backupCodes: hashedBackupCodes,
              backupCodesUsed: 0,
              failedAttempts: 0,
              lockedUntil: null,
            },
          })
        : await ctx.prisma.mFAConfiguration.create({
            data: {
              userId: ctx.user.id,
              method: input.method,
              secret,
              verified: false,
              backupCodes: hashedBackupCodes,
            },
          });

      await auditLog('CREATE', 'MFAConfiguration', {
        entityId: mfaConfig.id,
        changes: { method: input.method, action: 'setup_initiated' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // For SMS/Email, send initial verification code
      if (input.method === 'SMS' || input.method === 'EMAIL') {
        const otp = generateOTP();
        // Store OTP temporarily (using metadata or a separate mechanism)
        await ctx.prisma.mFAConfiguration.update({
          where: { id: mfaConfig.id },
          data: {
            // Store OTP hash and expiry in a way we can verify
            secret: `${secret}|${hashBackupCode(otp)}|${Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000}`,
          },
        });

        // In production, send SMS/Email here
        // For now, return the OTP in development
        if (process.env.NODE_ENV === 'development') {
          return {
            mfaId: mfaConfig.id,
            method: input.method,
            qrCodeUri: null,
            backupCodes: null,
            devOtp: otp, // Only in development
          };
        }

        return {
          mfaId: mfaConfig.id,
          method: input.method,
          qrCodeUri: null,
          backupCodes: null,
        };
      }

      // For TOTP, return QR code and backup codes
      return {
        mfaId: mfaConfig.id,
        method: input.method,
        secret, // Only for TOTP - user needs this to add to authenticator
        qrCodeUri,
        backupCodes, // Only shown once during setup
      };
    }),

  // Verify MFA setup with initial code
  verifyMFASetup: protectedProcedure
    .input(
      z.object({
        mfaId: z.string(),
        code: z.string().length(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const mfaConfig = await ctx.prisma.mFAConfiguration.findFirst({
        where: {
          id: input.mfaId,
          userId: ctx.user.id,
        },
      });

      if (!mfaConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MFA configuration not found',
        });
      }

      if (mfaConfig.verified) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'MFA is already verified',
        });
      }

      // Check lockout
      if (mfaConfig.lockedUntil && mfaConfig.lockedUntil > new Date()) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many failed attempts. Try again after ${mfaConfig.lockedUntil.toISOString()}`,
        });
      }

      let isValid = false;

      if (mfaConfig.method === 'TOTP') {
        isValid = verifyTOTP(mfaConfig.secret, input.code);
      } else {
        // SMS/Email - verify OTP
        const parts = mfaConfig.secret.split('|');
        if (parts.length >= 3) {
          const hashedOtp = parts[1];
          const expiry = parseInt(parts[2]);
          if (Date.now() > expiry) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Verification code has expired. Please request a new one.',
            });
          }
          isValid = hashBackupCode(input.code) === hashedOtp;
        }
      }

      if (!isValid) {
        const newAttempts = mfaConfig.failedAttempts + 1;
        const lockout = newAttempts >= MAX_MFA_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
          : null;

        await ctx.prisma.mFAConfiguration.update({
          where: { id: mfaConfig.id },
          data: {
            failedAttempts: newAttempts,
            lockedUntil: lockout,
          },
        });

        await logSecurityEvent(
          ctx.prisma as unknown as PrismaClient,
          'LOGIN_MFA_FAILURE',
          ctx.user.id,
          ctx.user.organizationId,
          false,
          { mfaId: mfaConfig.id, method: mfaConfig.method }
        );

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: lockout
            ? `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`
            : `Invalid verification code. ${MAX_MFA_ATTEMPTS - newAttempts} attempts remaining.`,
        });
      }

      // Update to verified
      const secretToStore = mfaConfig.method === 'TOTP'
        ? mfaConfig.secret
        : mfaConfig.secret.split('|')[0]; // For SMS/Email, store just the phone/email

      await ctx.prisma.mFAConfiguration.update({
        where: { id: mfaConfig.id },
        data: {
          verified: true,
          verifiedAt: new Date(),
          failedAttempts: 0,
          lockedUntil: null,
          secret: secretToStore,
        },
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'MFA_ENABLED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { mfaId: mfaConfig.id, method: mfaConfig.method }
      );

      await auditLog('UPDATE', 'MFAConfiguration', {
        entityId: mfaConfig.id,
        changes: { action: 'verified', method: mfaConfig.method },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true, method: mfaConfig.method };
    }),

  // ============================================
  // MFA Verification (at login)
  // ============================================

  // Verify MFA code during login
  verifyMFA: protectedProcedure
    .input(
      z.object({
        code: z.string().min(6).max(8),
        rememberDevice: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get verified MFA configurations
      const mfaConfigs = await ctx.prisma.mFAConfiguration.findMany({
        where: {
          userId: ctx.user.id,
          verified: true,
        },
      });

      if (mfaConfigs.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No MFA configured for this account',
        });
      }

      // Try TOTP first
      const totpConfig = mfaConfigs.find(c => c.method === 'TOTP');

      // Check lockout on any config
      const lockedConfig = mfaConfigs.find(c => c.lockedUntil && c.lockedUntil > new Date());
      if (lockedConfig) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Account locked. Try again after ${lockedConfig.lockedUntil!.toISOString()}`,
        });
      }

      let verified = false;
      let usedConfig: typeof totpConfig = undefined;
      let usedBackupCode = false;

      // Try TOTP verification
      if (totpConfig && input.code.length === 6) {
        if (verifyTOTP(totpConfig.secret, input.code)) {
          verified = true;
          usedConfig = totpConfig;
        }
      }

      // Try backup code if TOTP failed and code is 8 chars
      if (!verified && totpConfig && input.code.length === 8) {
        const backupIndex = verifyBackupCode(input.code, totpConfig.backupCodes);
        if (backupIndex !== -1) {
          verified = true;
          usedConfig = totpConfig;
          usedBackupCode = true;

          // Remove used backup code
          const newBackupCodes = [...totpConfig.backupCodes];
          newBackupCodes[backupIndex] = 'USED';

          await ctx.prisma.mFAConfiguration.update({
            where: { id: totpConfig.id },
            data: {
              backupCodes: newBackupCodes,
              backupCodesUsed: totpConfig.backupCodesUsed + 1,
            },
          });

          await logSecurityEvent(
            ctx.prisma as unknown as PrismaClient,
            'MFA_RECOVERY_USED',
            ctx.user.id,
            ctx.user.organizationId,
            true,
            { method: 'backup_code', codesRemaining: BACKUP_CODES_COUNT - totpConfig.backupCodesUsed - 1 }
          );
        }
      }

      if (!verified) {
        // Increment failed attempts on primary config
        const primaryConfig = totpConfig || mfaConfigs[0];
        const newAttempts = primaryConfig.failedAttempts + 1;
        const lockout = newAttempts >= MAX_MFA_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
          : null;

        await ctx.prisma.mFAConfiguration.update({
          where: { id: primaryConfig.id },
          data: {
            failedAttempts: newAttempts,
            lockedUntil: lockout,
          },
        });

        await logSecurityEvent(
          ctx.prisma as unknown as PrismaClient,
          'LOGIN_MFA_FAILURE',
          ctx.user.id,
          ctx.user.organizationId,
          false,
          { attempts: newAttempts }
        );

        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: lockout
            ? `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`
            : `Invalid code. ${MAX_MFA_ATTEMPTS - newAttempts} attempts remaining.`,
        });
      }

      // Reset failed attempts
      if (usedConfig) {
        await ctx.prisma.mFAConfiguration.update({
          where: { id: usedConfig.id },
          data: {
            failedAttempts: 0,
            lockedUntil: null,
            lastUsedAt: new Date(),
          },
        });
      }

      // Handle remember device
      let deviceToken: string | null = null;
      if (input.rememberDevice) {
        const { ipAddress, userAgent } = await getRequestMetadata();
        const fingerprint = generateDeviceFingerprint(userAgent, ipAddress);
        deviceToken = generateSessionToken();

        await ctx.prisma.userSession.create({
          data: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
            sessionToken: hashSessionToken(deviceToken),
            deviceFingerprint: fingerprint,
            deviceType: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
            browser: extractBrowser(userAgent),
            os: extractOS(userAgent),
            ipAddress,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            rememberDevice: true,
            mfaVerified: true,
          },
        });
      }

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'LOGIN_MFA_SUCCESS',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        {
          method: usedConfig?.method,
          usedBackupCode,
          rememberDevice: input.rememberDevice,
        }
      );

      return {
        success: true,
        usedBackupCode,
        backupCodesRemaining: usedBackupCode && usedConfig
          ? BACKUP_CODES_COUNT - (usedConfig.backupCodesUsed + 1)
          : undefined,
        deviceToken: input.rememberDevice ? deviceToken : undefined,
      };
    }),

  // ============================================
  // MFA Management
  // ============================================

  // Disable MFA
  disableMFA: protectedProcedure
    .input(
      z.object({
        method: z.enum(['TOTP', 'SMS', 'EMAIL']),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify password first
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const bcrypt = await import('bcryptjs');
      const isValid = await bcrypt.compare(input.password, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid password',
        });
      }

      // Check if this is required by organization policy
      const securitySetting = await ctx.prisma.securitySetting.findUnique({
        where: { organizationId: ctx.user.organizationId },
      });

      if (securitySetting) {
        if (securitySetting.mfaRequired) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'MFA is required by organization policy and cannot be disabled',
          });
        }
        // Check if user's role requires MFA
        const rolesRequiringMfa = securitySetting.mfaRequiredForRoles as Role[];
        if (rolesRequiringMfa && rolesRequiringMfa.includes(ctx.user.role as Role)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'MFA is required for your role by organization policy',
          });
        }
      }

      // Delete MFA configuration
      const deleted = await ctx.prisma.mFAConfiguration.deleteMany({
        where: {
          userId: ctx.user.id,
          method: input.method,
        },
      });

      if (deleted.count === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'MFA configuration not found',
        });
      }

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'MFA_DISABLED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { method: input.method }
      );

      await auditLog('DELETE', 'MFAConfiguration', {
        changes: { method: input.method, action: 'disabled' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Regenerate backup codes
  regenerateBackupCodes: protectedProcedure
    .input(
      z.object({
        password: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify password
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const bcrypt = await import('bcryptjs');
      const isValid = await bcrypt.compare(input.password, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid password',
        });
      }

      // Get TOTP config
      const totpConfig = await ctx.prisma.mFAConfiguration.findFirst({
        where: {
          userId: ctx.user.id,
          method: 'TOTP',
          verified: true,
        },
      });

      if (!totpConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No verified TOTP MFA found',
        });
      }

      // Generate new backup codes
      const backupCodes = generateBackupCodes(BACKUP_CODES_COUNT);
      const hashedBackupCodes = backupCodes.map(hashBackupCode);

      await ctx.prisma.mFAConfiguration.update({
        where: { id: totpConfig.id },
        data: {
          backupCodes: hashedBackupCodes,
          backupCodesUsed: 0,
        },
      });

      await auditLog('UPDATE', 'MFAConfiguration', {
        entityId: totpConfig.id,
        changes: { action: 'backup_codes_regenerated' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { backupCodes };
    }),

  // ============================================
  // Recovery Flow
  // ============================================

  // Request MFA recovery (for lost device)
  requestMFARecovery: protectedProcedure.mutation(async ({ ctx }) => {
    // Generate recovery token and send to user's email
    const recoveryToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Store recovery request (using metadata in security event)
    await ctx.prisma.securityEvent.create({
      data: {
        eventType: 'MFA_RECOVERY_USED',
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        success: false, // Not yet completed
        metadata: {
          type: 'recovery_request',
          tokenHash: hashSessionToken(recoveryToken),
          expiresAt: expiresAt.toISOString(),
        },
        severity: 'WARNING',
      },
    });

    // In production, send recovery email here
    // For now, return success message

    return {
      success: true,
      message: 'Recovery instructions have been sent to your email',
      // In dev, include token
      ...(process.env.NODE_ENV === 'development' && { devToken: recoveryToken }),
    };
  }),

  // Complete MFA recovery
  completeMFARecovery: protectedProcedure
    .input(
      z.object({
        recoveryToken: z.string(),
        newPassword: z.string().min(8),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find valid recovery request
      const recoveryEvent = await ctx.prisma.securityEvent.findFirst({
        where: {
          userId: ctx.user.id,
          eventType: 'MFA_RECOVERY_USED',
          success: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!recoveryEvent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No pending recovery request found',
        });
      }

      const metadata = recoveryEvent.metadata as { tokenHash: string; expiresAt: string } | null;

      if (!metadata) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid recovery request',
        });
      }

      if (new Date(metadata.expiresAt) < new Date()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Recovery token has expired',
        });
      }

      if (hashSessionToken(input.recoveryToken) !== metadata.tokenHash) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid recovery token',
        });
      }

      // Delete all MFA configurations
      await ctx.prisma.mFAConfiguration.deleteMany({
        where: { userId: ctx.user.id },
      });

      // Update password
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash(input.newPassword, 12);

      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { passwordHash },
      });

      // Mark recovery as complete
      await ctx.prisma.securityEvent.update({
        where: { id: recoveryEvent.id },
        data: { success: true },
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'MFA_DISABLED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { reason: 'recovery_completed' }
      );

      return { success: true, message: 'MFA has been reset. Please set up MFA again.' };
    }),

  // ============================================
  // MFA Policy (Admin)
  // ============================================

  // Get organization MFA policy
  getMFAPolicy: adminProcedure.query(async ({ ctx }) => {
    const securitySetting = await ctx.prisma.securitySetting.findUnique({
      where: { organizationId: ctx.user.organizationId },
    });

    if (!securitySetting) {
      return {
        mfaRequired: false,
        mfaRequiredForRoles: [] as Role[],
        mfaGracePeriodDays: 7,
      };
    }

    return {
      mfaRequired: securitySetting.mfaRequired,
      mfaRequiredForRoles: securitySetting.mfaRequiredForRoles as Role[],
      mfaGracePeriodDays: securitySetting.mfaGracePeriodDays,
    };
  }),

  // Update organization MFA policy
  updateMFAPolicy: adminProcedure
    .input(
      z.object({
        mfaRequired: z.boolean(),
        mfaRequiredForRoles: z.array(z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER'])),
        mfaGracePeriodDays: z.number().min(0).max(30).default(7),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const securitySetting = await ctx.prisma.securitySetting.upsert({
        where: { organizationId: ctx.user.organizationId },
        update: {
          mfaRequired: input.mfaRequired,
          mfaRequiredForRoles: input.mfaRequiredForRoles,
          mfaGracePeriodDays: input.mfaGracePeriodDays,
        },
        create: {
          organizationId: ctx.user.organizationId,
          mfaRequired: input.mfaRequired,
          mfaRequiredForRoles: input.mfaRequiredForRoles,
          mfaGracePeriodDays: input.mfaGracePeriodDays,
        },
      });

      await auditLog('UPDATE', 'SecuritySetting', {
        entityId: securitySetting.id,
        changes: {
          mfaRequired: input.mfaRequired,
          mfaRequiredForRoles: input.mfaRequiredForRoles,
          mfaGracePeriodDays: input.mfaGracePeriodDays,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'CONFIG_CHANGED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { type: 'mfa_policy', ...input }
      );

      return { success: true };
    }),

  // ============================================
  // Trusted Devices
  // ============================================

  // List trusted devices
  listTrustedDevices: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.prisma.userSession.findMany({
      where: {
        userId: ctx.user.id,
        rememberDevice: true,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceType: true,
        browser: true,
        os: true,
        ipAddress: true,
        city: true,
        country: true,
        lastActivityAt: true,
        createdAt: true,
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    return sessions;
  }),

  // Remove trusted device
  removeTrustedDevice: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.userSession.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.user.id,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device not found',
        });
      }

      await ctx.prisma.userSession.update({
        where: { id: session.id },
        data: {
          status: 'TERMINATED',
          terminatedAt: new Date(),
          terminatedReason: 'User removed trusted device',
        },
      });

      return { success: true };
    }),

  // Remove all trusted devices
  removeAllTrustedDevices: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.userSession.updateMany({
      where: {
        userId: ctx.user.id,
        rememberDevice: true,
        status: 'ACTIVE',
      },
      data: {
        status: 'TERMINATED',
        terminatedAt: new Date(),
        terminatedReason: 'User removed all trusted devices',
      },
    });

    return { success: true };
  }),

  // Check if device is trusted (for login flow)
  checkTrustedDevice: protectedProcedure
    .input(z.object({ deviceToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const { ipAddress, userAgent } = await getRequestMetadata();
      const fingerprint = generateDeviceFingerprint(userAgent, ipAddress);
      const hashedToken = hashSessionToken(input.deviceToken);

      const session = await ctx.prisma.userSession.findFirst({
        where: {
          userId: ctx.user.id,
          sessionToken: hashedToken,
          deviceFingerprint: fingerprint,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          rememberDevice: true,
        },
      });

      if (session) {
        // Update last activity
        await ctx.prisma.userSession.update({
          where: { id: session.id },
          data: { lastActivityAt: new Date() },
        });

        return { trusted: true, mfaVerified: session.mfaVerified };
      }

      return { trusted: false, mfaVerified: false };
    }),

  // ============================================
  // Send SMS/Email OTP
  // ============================================

  // Resend OTP for SMS/Email MFA
  resendOTP: protectedProcedure
    .input(
      z.object({
        method: z.enum(['SMS', 'EMAIL']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const mfaConfig = await ctx.prisma.mFAConfiguration.findFirst({
        where: {
          userId: ctx.user.id,
          method: input.method,
        },
      });

      if (!mfaConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No ${input.method} MFA configuration found`,
        });
      }

      const otp = generateOTP();
      const destination = mfaConfig.secret.split('|')[0];

      // Update with new OTP
      await ctx.prisma.mFAConfiguration.update({
        where: { id: mfaConfig.id },
        data: {
          secret: `${destination}|${hashBackupCode(otp)}|${Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000}`,
        },
      });

      // In production, send SMS/Email here

      return {
        success: true,
        message: `Verification code sent to your ${input.method.toLowerCase()}`,
        ...(process.env.NODE_ENV === 'development' && { devOtp: otp }),
      };
    }),

  // ============================================
  // Check if MFA is required for user
  // ============================================

  // Check if current user needs MFA
  checkMFARequired: protectedProcedure.query(async ({ ctx }) => {
    const securitySetting = await ctx.prisma.securitySetting.findUnique({
      where: { organizationId: ctx.user.organizationId },
    });

    if (!securitySetting) {
      return { required: false, hasVerifiedMFA: false };
    }

    // Check if MFA is required for this user
    const required =
      securitySetting.mfaRequired ||
      (securitySetting.mfaRequiredForRoles as Role[]).includes(ctx.user.role as Role);

    // Check if user has verified MFA
    const verifiedMFA = await ctx.prisma.mFAConfiguration.findFirst({
      where: {
        userId: ctx.user.id,
        verified: true,
      },
    });

    return {
      required,
      hasVerifiedMFA: !!verifiedMFA,
      gracePeriodDays: securitySetting.mfaGracePeriodDays,
    };
  }),
});

// Helper functions
function extractBrowser(userAgent: string): string {
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  return 'Unknown';
}

function extractOS(userAgent: string): string {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS')) return 'iOS';
  return 'Unknown';
}
