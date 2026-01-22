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
  // Field-level encryption imports
  generateEncryptionKey,
  generateKeyIdentifier,
  encrypt,
  decrypt,
  isEncrypted,
  extractKeyId,
  reencrypt,
  encryptSSN,
  validateEncryptionKey,
  keyFingerprint,
  type EncryptionKeyPurpose,
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

  // ============================================
  // Field-Level Encryption
  // ============================================

  // Create a new encryption key for the organization
  createEncryptionKey: adminProcedure
    .input(
      z.object({
        purpose: z.enum([
          'PHI_ENCRYPTION',
          'SSN_ENCRYPTION',
          'PAYMENT_CREDENTIAL_ENCRYPTION',
          'API_KEY_ENCRYPTION',
          'SECRET_ENCRYPTION',
        ]),
        rotationSchedule: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
        allowedRoles: z.array(z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER'])).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Generate a new encryption key
      const rawKey = generateEncryptionKey();
      const keyIdentifier = generateKeyIdentifier(input.purpose as EncryptionKeyPurpose);

      // Get master key from environment (in production, use HSM/KMS)
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption master key not configured',
        });
      }

      // Store the key metadata (actual key should be stored in HSM/KMS)
      // For this implementation, we encrypt the DEK with the master key
      const encryptedKey = encrypt(rawKey, masterKey, 'master');

      // Calculate next rotation date
      let nextRotationAt: Date | null = null;
      if (input.rotationSchedule) {
        const now = new Date();
        switch (input.rotationSchedule) {
          case 'MONTHLY':
            nextRotationAt = new Date(now.setMonth(now.getMonth() + 1));
            break;
          case 'QUARTERLY':
            nextRotationAt = new Date(now.setMonth(now.getMonth() + 3));
            break;
          case 'YEARLY':
            nextRotationAt = new Date(now.setFullYear(now.getFullYear() + 1));
            break;
        }
      }

      const encryptionKey = await ctx.prisma.encryptionKey.create({
        data: {
          keyIdentifier,
          status: 'ACTIVE',
          algorithm: 'AES-256-GCM',
          keyVersion: 1,
          purpose: input.purpose,
          organizationId: ctx.user.organizationId,
          activatedAt: new Date(),
          rotationSchedule: input.rotationSchedule,
          nextRotationAt,
          allowedRoles: input.allowedRoles || ['OWNER', 'ADMIN'],
          // Store encrypted key in metadata (in production, reference KMS key ID)
          allowedUsers: [encryptedKey], // Using allowedUsers to store encrypted key temporarily
        },
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'CONFIG_CHANGED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { type: 'encryption_key_created', keyId: keyIdentifier, purpose: input.purpose }
      );

      await auditLog('CREATE', 'EncryptionKey', {
        entityId: encryptionKey.id,
        changes: { purpose: input.purpose, keyIdentifier },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: encryptionKey.id,
        keyIdentifier,
        purpose: input.purpose,
        fingerprint: keyFingerprint(rawKey),
      };
    }),

  // List encryption keys for the organization
  listEncryptionKeys: adminProcedure
    .input(
      z.object({
        purpose: z.string().optional(),
        status: z.enum(['ACTIVE', 'ROTATING', 'RETIRED', 'COMPROMISED']).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (input?.purpose) {
        where.purpose = input.purpose;
      }

      if (input?.status) {
        where.status = input.status;
      }

      const keys = await ctx.prisma.encryptionKey.findMany({
        where,
        select: {
          id: true,
          keyIdentifier: true,
          status: true,
          algorithm: true,
          keyVersion: true,
          purpose: true,
          createdAt: true,
          activatedAt: true,
          rotatedAt: true,
          retiredAt: true,
          expiresAt: true,
          rotationSchedule: true,
          nextRotationAt: true,
          allowedRoles: true,
          lastAccessedAt: true,
          accessCount: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return keys;
    }),

  // Get encryption key for use (returns key only to authorized users)
  getEncryptionKey: protectedProcedure
    .input(
      z.object({
        keyIdentifier: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const encryptionKey = await ctx.prisma.encryptionKey.findFirst({
        where: {
          keyIdentifier: input.keyIdentifier,
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
        },
      });

      if (!encryptionKey) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encryption key not found or not active',
        });
      }

      // Check role authorization
      const allowedRoles = encryptionKey.allowedRoles as Role[];
      if (!allowedRoles.includes(ctx.user.role as Role)) {
        await logSecurityEvent(
          ctx.prisma as unknown as PrismaClient,
          'PHI_ACCESSED',
          ctx.user.id,
          ctx.user.organizationId,
          false,
          { type: 'encryption_key_access_denied', keyId: input.keyIdentifier }
        );

        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this encryption key',
        });
      }

      // Get master key from environment
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption master key not configured',
        });
      }

      // Decrypt the data encryption key
      const encryptedKey = encryptionKey.allowedUsers[0]; // Stored in allowedUsers temporarily
      if (!encryptedKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption key data not found',
        });
      }

      const decryptedKey = decrypt(encryptedKey, masterKey);

      // Update access tracking
      await ctx.prisma.encryptionKey.update({
        where: { id: encryptionKey.id },
        data: {
          lastAccessedAt: new Date(),
          accessCount: { increment: 1 },
        },
      });

      // Log access
      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'PHI_ACCESSED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { type: 'encryption_key_accessed', keyId: input.keyIdentifier, purpose: encryptionKey.purpose }
      );

      return {
        keyIdentifier: encryptionKey.keyIdentifier,
        key: decryptedKey,
        algorithm: encryptionKey.algorithm,
        purpose: encryptionKey.purpose,
      };
    }),

  // Rotate encryption key
  rotateEncryptionKey: adminProcedure
    .input(
      z.object({
        keyIdentifier: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existingKey = await ctx.prisma.encryptionKey.findFirst({
        where: {
          keyIdentifier: input.keyIdentifier,
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
        },
      });

      if (!existingKey) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encryption key not found or not active',
        });
      }

      // Get master key
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption master key not configured',
        });
      }

      // Generate new key
      const newRawKey = generateEncryptionKey();
      const newKeyIdentifier = generateKeyIdentifier(existingKey.purpose as EncryptionKeyPurpose);
      const encryptedNewKey = encrypt(newRawKey, masterKey, 'master');

      // Calculate next rotation date
      let nextRotationAt: Date | null = null;
      if (existingKey.rotationSchedule) {
        const now = new Date();
        switch (existingKey.rotationSchedule) {
          case 'MONTHLY':
            nextRotationAt = new Date(now.setMonth(now.getMonth() + 1));
            break;
          case 'QUARTERLY':
            nextRotationAt = new Date(now.setMonth(now.getMonth() + 3));
            break;
          case 'YEARLY':
            nextRotationAt = new Date(now.setFullYear(now.getFullYear() + 1));
            break;
        }
      }

      // Mark old key as rotating, create new key
      const [_updatedOldKey, newKey] = await ctx.prisma.$transaction([
        ctx.prisma.encryptionKey.update({
          where: { id: existingKey.id },
          data: {
            status: 'ROTATING',
            rotatedAt: new Date(),
          },
        }),
        ctx.prisma.encryptionKey.create({
          data: {
            keyIdentifier: newKeyIdentifier,
            status: 'ACTIVE',
            algorithm: existingKey.algorithm,
            keyVersion: existingKey.keyVersion + 1,
            purpose: existingKey.purpose,
            organizationId: ctx.user.organizationId,
            activatedAt: new Date(),
            rotationSchedule: existingKey.rotationSchedule,
            nextRotationAt,
            previousKeyId: existingKey.id,
            allowedRoles: existingKey.allowedRoles,
            allowedUsers: [encryptedNewKey],
          },
        }),
      ]);

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'CONFIG_CHANGED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        {
          type: 'encryption_key_rotated',
          oldKeyId: input.keyIdentifier,
          newKeyId: newKeyIdentifier,
          purpose: existingKey.purpose,
        }
      );

      await auditLog('UPDATE', 'EncryptionKey', {
        entityId: existingKey.id,
        changes: { action: 'key_rotated', newKeyIdentifier },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        oldKeyIdentifier: input.keyIdentifier,
        newKeyIdentifier,
        newKeyId: newKey.id,
        fingerprint: keyFingerprint(newRawKey),
      };
    }),

  // Retire an encryption key
  retireEncryptionKey: adminProcedure
    .input(
      z.object({
        keyIdentifier: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const encryptionKey = await ctx.prisma.encryptionKey.findFirst({
        where: {
          keyIdentifier: input.keyIdentifier,
          organizationId: ctx.user.organizationId,
          status: { in: ['ACTIVE', 'ROTATING'] },
        },
      });

      if (!encryptionKey) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encryption key not found',
        });
      }

      await ctx.prisma.encryptionKey.update({
        where: { id: encryptionKey.id },
        data: {
          status: 'RETIRED',
          retiredAt: new Date(),
        },
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'CONFIG_CHANGED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { type: 'encryption_key_retired', keyId: input.keyIdentifier }
      );

      await auditLog('UPDATE', 'EncryptionKey', {
        entityId: encryptionKey.id,
        changes: { action: 'key_retired' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Mark key as compromised
  markKeyCompromised: adminProcedure
    .input(
      z.object({
        keyIdentifier: z.string(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const encryptionKey = await ctx.prisma.encryptionKey.findFirst({
        where: {
          keyIdentifier: input.keyIdentifier,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encryptionKey) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encryption key not found',
        });
      }

      await ctx.prisma.encryptionKey.update({
        where: { id: encryptionKey.id },
        data: {
          status: 'COMPROMISED',
          retiredAt: new Date(),
        },
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'PHI_EXPORTED',
        ctx.user.id,
        ctx.user.organizationId,
        false,
        {
          type: 'encryption_key_compromised',
          keyId: input.keyIdentifier,
          reason: input.reason,
          severity: 'CRITICAL',
        }
      );

      await auditLog('UPDATE', 'EncryptionKey', {
        entityId: encryptionKey.id,
        changes: { action: 'key_compromised', reason: input.reason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ============================================
  // Encrypt/Decrypt Operations
  // ============================================

  // Encrypt a value (for API use)
  encryptValue: protectedProcedure
    .input(
      z.object({
        value: z.string(),
        keyIdentifier: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the key
      const encryptionKey = await ctx.prisma.encryptionKey.findFirst({
        where: {
          keyIdentifier: input.keyIdentifier,
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
        },
      });

      if (!encryptionKey) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encryption key not found or not active',
        });
      }

      // Check authorization
      const allowedRoles = encryptionKey.allowedRoles as Role[];
      if (!allowedRoles.includes(ctx.user.role as Role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to use this encryption key',
        });
      }

      // Get and decrypt the DEK
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption master key not configured',
        });
      }

      const encryptedDEK = encryptionKey.allowedUsers[0];
      if (!encryptedDEK) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption key data not found',
        });
      }

      const dek = decrypt(encryptedDEK, masterKey);
      const encryptedValue = encrypt(input.value, dek, input.keyIdentifier);

      // Log the operation
      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'PHI_ACCESSED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { type: 'data_encrypted', keyId: input.keyIdentifier }
      );

      return { encryptedValue };
    }),

  // Decrypt a value (for API use)
  decryptValue: protectedProcedure
    .input(
      z.object({
        encryptedValue: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Extract key ID from encrypted value
      const keyId = extractKeyId(input.encryptedValue);
      if (!keyId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Value is not encrypted or has invalid format',
        });
      }

      // Find the key
      const encryptionKey = await ctx.prisma.encryptionKey.findFirst({
        where: {
          keyIdentifier: keyId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encryptionKey) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encryption key not found',
        });
      }

      // Check authorization
      const allowedRoles = encryptionKey.allowedRoles as Role[];
      if (!allowedRoles.includes(ctx.user.role as Role)) {
        await logSecurityEvent(
          ctx.prisma as unknown as PrismaClient,
          'PHI_ACCESSED',
          ctx.user.id,
          ctx.user.organizationId,
          false,
          { type: 'decrypt_access_denied', keyId }
        );

        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to decrypt this data',
        });
      }

      // Get and decrypt the DEK
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption master key not configured',
        });
      }

      const encryptedDEK = encryptionKey.allowedUsers[0];
      if (!encryptedDEK) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption key data not found',
        });
      }

      const dek = decrypt(encryptedDEK, masterKey);
      const decryptedValue = decrypt(input.encryptedValue, dek);

      // Log the operation
      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'PHI_ACCESSED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { type: 'data_decrypted', keyId }
      );

      return { value: decryptedValue };
    }),

  // Encrypt SSN with last 4 extraction
  encryptSSN: protectedProcedure
    .input(
      z.object({
        ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/, 'Invalid SSN format'),
        keyIdentifier: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the key
      const encryptionKey = await ctx.prisma.encryptionKey.findFirst({
        where: {
          keyIdentifier: input.keyIdentifier,
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
          purpose: { in: ['SSN_ENCRYPTION', 'PHI_ENCRYPTION'] },
        },
      });

      if (!encryptionKey) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encryption key not found or not suitable for SSN encryption',
        });
      }

      // Check authorization
      const allowedRoles = encryptionKey.allowedRoles as Role[];
      if (!allowedRoles.includes(ctx.user.role as Role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to encrypt SSN data',
        });
      }

      // Get and decrypt the DEK
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption master key not configured',
        });
      }

      const encryptedDEK = encryptionKey.allowedUsers[0];
      if (!encryptedDEK) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Encryption key data not found',
        });
      }

      const dek = decrypt(encryptedDEK, masterKey);
      const result = encryptSSN(input.ssn, dek, input.keyIdentifier);

      // Log the operation
      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'PHI_ACCESSED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { type: 'ssn_encrypted', keyId: input.keyIdentifier }
      );

      return {
        encrypted: result.encrypted,
        last4: result.last4,
      };
    }),

  // Get encryption key audit log
  getEncryptionKeyAuditLog: adminProcedure
    .input(
      z.object({
        keyIdentifier: z.string(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify key belongs to organization
      const encryptionKey = await ctx.prisma.encryptionKey.findFirst({
        where: {
          keyIdentifier: input.keyIdentifier,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encryptionKey) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encryption key not found',
        });
      }

      // Get security events related to this key
      const events = await ctx.prisma.securityEvent.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          eventType: { in: ['PHI_ACCESSED', 'CONFIG_CHANGED', 'PHI_EXPORTED'] },
          metadata: {
            path: ['keyId'],
            equals: input.keyIdentifier,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return events;
    }),

  // Get keys due for rotation
  getKeysForRotation: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();

    const keysDueForRotation = await ctx.prisma.encryptionKey.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        status: 'ACTIVE',
        nextRotationAt: {
          lte: now,
        },
      },
      select: {
        id: true,
        keyIdentifier: true,
        purpose: true,
        rotationSchedule: true,
        nextRotationAt: true,
        keyVersion: true,
        createdAt: true,
      },
      orderBy: { nextRotationAt: 'asc' },
    });

    return keysDueForRotation;
  }),

  // ============================================
  // Session Security (US-259)
  // ============================================

  // Get session security settings
  getSessionSettings: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.prisma.securitySetting.findUnique({
      where: { organizationId: ctx.user.organizationId },
    });

    return {
      sessionTimeoutMinutes: settings?.sessionTimeoutMinutes ?? 60,
      idleTimeoutMinutes: settings?.idleTimeoutMinutes ?? 15,
      maxConcurrentSessions: settings?.maxConcurrentSessions ?? 3,
      ipWhitelistEnabled: settings?.ipWhitelistEnabled ?? false,
      ipWhitelist: settings?.ipWhitelist ?? [],
      ipBlacklist: settings?.ipBlacklist ?? [],
    };
  }),

  // Update session security settings (configurable timeout)
  updateSessionSettings: adminProcedure
    .input(
      z.object({
        sessionTimeoutMinutes: z.number().min(5).max(1440).optional(), // 5 min to 24 hours
        idleTimeoutMinutes: z.number().min(1).max(120).optional(), // 1 min to 2 hours
        maxConcurrentSessions: z.number().min(1).max(10).optional(),
        ipWhitelistEnabled: z.boolean().optional(),
        ipWhitelist: z.array(z.string()).optional(),
        ipBlacklist: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.prisma.securitySetting.upsert({
        where: { organizationId: ctx.user.organizationId },
        update: {
          ...(input.sessionTimeoutMinutes !== undefined && {
            sessionTimeoutMinutes: input.sessionTimeoutMinutes,
          }),
          ...(input.idleTimeoutMinutes !== undefined && {
            idleTimeoutMinutes: input.idleTimeoutMinutes,
          }),
          ...(input.maxConcurrentSessions !== undefined && {
            maxConcurrentSessions: input.maxConcurrentSessions,
          }),
          ...(input.ipWhitelistEnabled !== undefined && {
            ipWhitelistEnabled: input.ipWhitelistEnabled,
          }),
          ...(input.ipWhitelist !== undefined && {
            ipWhitelist: input.ipWhitelist,
          }),
          ...(input.ipBlacklist !== undefined && {
            ipBlacklist: input.ipBlacklist,
          }),
        },
        create: {
          organizationId: ctx.user.organizationId,
          sessionTimeoutMinutes: input.sessionTimeoutMinutes ?? 60,
          idleTimeoutMinutes: input.idleTimeoutMinutes ?? 15,
          maxConcurrentSessions: input.maxConcurrentSessions ?? 3,
          ipWhitelistEnabled: input.ipWhitelistEnabled ?? false,
          ipWhitelist: input.ipWhitelist ?? [],
          ipBlacklist: input.ipBlacklist ?? [],
        },
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'CONFIG_CHANGED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { type: 'session_settings_updated', changes: input }
      );

      await auditLog('UPDATE', 'SecuritySetting', {
        entityId: settings.id,
        changes: { action: 'session_settings_updated', ...input },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Create a new session with all tracking
  createSession: protectedProcedure
    .input(
      z.object({
        rememberDevice: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { ipAddress, userAgent } = await getRequestMetadata();

      // Check IP restrictions
      const settings = await ctx.prisma.securitySetting.findUnique({
        where: { organizationId: ctx.user.organizationId },
      });

      if (settings?.ipWhitelistEnabled) {
        // Check if IP is in whitelist
        const isWhitelisted = settings.ipWhitelist.some(ip =>
          isIpInRange(ipAddress, ip)
        );
        if (!isWhitelisted) {
          await logSecurityEvent(
            ctx.prisma as unknown as PrismaClient,
            'LOGIN_FAILURE',
            ctx.user.id,
            ctx.user.organizationId,
            false,
            { reason: 'ip_not_whitelisted', ip: ipAddress }
          );
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied: IP address not authorized',
          });
        }
      }

      // Check if IP is blacklisted
      if (settings?.ipBlacklist.some(ip => isIpInRange(ipAddress, ip))) {
        await logSecurityEvent(
          ctx.prisma as unknown as PrismaClient,
          'LOGIN_FAILURE',
          ctx.user.id,
          ctx.user.organizationId,
          false,
          { reason: 'ip_blacklisted', ip: ipAddress }
        );
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied: IP address blocked',
        });
      }

      // Check concurrent session limit
      const activeSessions = await ctx.prisma.userSession.count({
        where: {
          userId: ctx.user.id,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
      });

      const maxSessions = settings?.maxConcurrentSessions ?? 3;
      if (activeSessions >= maxSessions) {
        // Terminate oldest session to make room
        const oldestSession = await ctx.prisma.userSession.findFirst({
          where: {
            userId: ctx.user.id,
            status: 'ACTIVE',
          },
          orderBy: { createdAt: 'asc' },
        });

        if (oldestSession) {
          await ctx.prisma.userSession.update({
            where: { id: oldestSession.id },
            data: {
              status: 'TERMINATED',
              terminatedAt: new Date(),
              terminatedReason: 'Exceeded concurrent session limit',
            },
          });

          await logSecurityEvent(
            ctx.prisma as unknown as PrismaClient,
            'LOGOUT',
            ctx.user.id,
            ctx.user.organizationId,
            true,
            { reason: 'concurrent_session_limit', sessionId: oldestSession.id }
          );
        }
      }

      // Generate session token and fingerprint
      const sessionToken = generateSessionToken();
      const fingerprint = generateDeviceFingerprint(userAgent, ipAddress);
      const sessionTimeout = settings?.sessionTimeoutMinutes ?? 60;
      const idleTimeout = settings?.idleTimeoutMinutes ?? 15;

      // Create the session
      const session = await ctx.prisma.userSession.create({
        data: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          sessionToken: hashSessionToken(sessionToken),
          deviceFingerprint: fingerprint,
          deviceType: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
          browser: extractBrowser(userAgent),
          browserVersion: extractBrowserVersion(userAgent),
          os: extractOS(userAgent),
          osVersion: extractOSVersion(userAgent),
          ipAddress,
          expiresAt: new Date(Date.now() + sessionTimeout * 60 * 1000),
          idleTimeoutAt: new Date(Date.now() + idleTimeout * 60 * 1000),
          rememberDevice: input.rememberDevice,
          trustScore: 100,
        },
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'LOGIN_SUCCESS',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        {
          sessionId: session.id,
          deviceType: session.deviceType,
          browser: session.browser,
          rememberDevice: input.rememberDevice,
        }
      );

      return {
        sessionId: session.id,
        sessionToken,
        expiresAt: session.expiresAt,
        idleTimeoutAt: session.idleTimeoutAt,
      };
    }),

  // Get current session info with idle timeout warning
  getSessionInfo: protectedProcedure
    .input(
      z.object({
        sessionToken: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const hashedToken = hashSessionToken(input.sessionToken);

      const session = await ctx.prisma.userSession.findFirst({
        where: {
          sessionToken: hashedToken,
          userId: ctx.user.id,
          status: 'ACTIVE',
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found or expired',
        });
      }

      const now = new Date();
      const idleWarningThreshold = 2 * 60 * 1000; // 2 minutes before idle timeout

      // Check if session is expired
      if (session.expiresAt < now) {
        await ctx.prisma.userSession.update({
          where: { id: session.id },
          data: {
            status: 'EXPIRED',
            terminatedAt: now,
            terminatedReason: 'Session expired',
          },
        });

        return {
          valid: false,
          reason: 'session_expired',
        };
      }

      // Check if idle timeout exceeded
      if (session.idleTimeoutAt && session.idleTimeoutAt < now) {
        await ctx.prisma.userSession.update({
          where: { id: session.id },
          data: {
            status: 'EXPIRED',
            terminatedAt: now,
            terminatedReason: 'Idle timeout',
          },
        });

        await logSecurityEvent(
          ctx.prisma as unknown as PrismaClient,
          'LOGOUT',
          ctx.user.id,
          ctx.user.organizationId,
          true,
          { reason: 'idle_timeout', sessionId: session.id }
        );

        return {
          valid: false,
          reason: 'idle_timeout',
        };
      }

      // Calculate idle warning
      const idleTimeRemaining = session.idleTimeoutAt
        ? session.idleTimeoutAt.getTime() - now.getTime()
        : null;
      const showIdleWarning = idleTimeRemaining !== null && idleTimeRemaining < idleWarningThreshold;

      return {
        valid: true,
        sessionId: session.id,
        expiresAt: session.expiresAt,
        idleTimeoutAt: session.idleTimeoutAt,
        idleTimeRemaining,
        showIdleWarning,
        lastActivityAt: session.lastActivityAt,
        trustScore: session.trustScore,
        deviceType: session.deviceType,
        browser: session.browser,
      };
    }),

  // Extend session / record activity (heartbeat)
  recordSessionActivity: protectedProcedure
    .input(
      z.object({
        sessionToken: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const hashedToken = hashSessionToken(input.sessionToken);
      const { ipAddress, userAgent } = await getRequestMetadata();

      const session = await ctx.prisma.userSession.findFirst({
        where: {
          sessionToken: hashedToken,
          userId: ctx.user.id,
          status: 'ACTIVE',
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      // Get security settings for timeout values
      const settings = await ctx.prisma.securitySetting.findUnique({
        where: { organizationId: ctx.user.organizationId },
      });

      const idleTimeout = settings?.idleTimeoutMinutes ?? 15;

      // Validate IP consistency (IP-based session validation)
      let trustScore = session.trustScore;
      if (session.ipAddress && session.ipAddress !== ipAddress) {
        // IP changed - decrease trust score
        trustScore = Math.max(0, trustScore - 20);

        await logSecurityEvent(
          ctx.prisma as unknown as PrismaClient,
          'SUSPICIOUS_ACTIVITY',
          ctx.user.id,
          ctx.user.organizationId,
          false,
          {
            reason: 'ip_changed',
            originalIp: session.ipAddress,
            newIp: ipAddress,
            sessionId: session.id,
          }
        );

        // If trust score drops too low, mark session as suspicious
        if (trustScore < 50) {
          await ctx.prisma.userSession.update({
            where: { id: session.id },
            data: {
              status: 'SUSPICIOUS',
              trustScore,
            },
          });

          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Session flagged as suspicious due to unusual activity',
          });
        }
      }

      // Validate device fingerprint
      const currentFingerprint = generateDeviceFingerprint(userAgent, ipAddress);
      if (session.deviceFingerprint && session.deviceFingerprint !== currentFingerprint) {
        trustScore = Math.max(0, trustScore - 10);

        await logSecurityEvent(
          ctx.prisma as unknown as PrismaClient,
          'SUSPICIOUS_ACTIVITY',
          ctx.user.id,
          ctx.user.organizationId,
          false,
          {
            reason: 'device_fingerprint_changed',
            sessionId: session.id,
          }
        );
      }

      // Update session activity
      const updatedSession = await ctx.prisma.userSession.update({
        where: { id: session.id },
        data: {
          lastActivityAt: new Date(),
          idleTimeoutAt: new Date(Date.now() + idleTimeout * 60 * 1000),
          trustScore,
        },
      });

      return {
        success: true,
        idleTimeoutAt: updatedSession.idleTimeoutAt,
        trustScore,
      };
    }),

  // List all active sessions for current user
  listActiveSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.prisma.userSession.findMany({
      where: {
        userId: ctx.user.id,
        status: { in: ['ACTIVE', 'SUSPICIOUS'] },
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceType: true,
        browser: true,
        browserVersion: true,
        os: true,
        osVersion: true,
        ipAddress: true,
        city: true,
        country: true,
        lastActivityAt: true,
        createdAt: true,
        status: true,
        trustScore: true,
        rememberDevice: true,
        mfaVerified: true,
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    return sessions;
  }),

  // Terminate a specific session
  terminateSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
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
          message: 'Session not found',
        });
      }

      await ctx.prisma.userSession.update({
        where: { id: session.id },
        data: {
          status: 'TERMINATED',
          terminatedAt: new Date(),
          terminatedReason: 'User terminated session',
        },
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'LOGOUT',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { reason: 'user_terminated', sessionId: session.id }
      );

      return { success: true };
    }),

  // Force logout from all devices
  terminateAllSessions: protectedProcedure
    .input(
      z.object({
        exceptCurrent: z.boolean().default(true),
        currentSessionToken: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        userId: ctx.user.id,
        status: { in: ['ACTIVE', 'SUSPICIOUS'] },
      };

      // Exclude current session if requested
      if (input.exceptCurrent && input.currentSessionToken) {
        const hashedToken = hashSessionToken(input.currentSessionToken);
        where.sessionToken = { not: hashedToken };
      }

      const result = await ctx.prisma.userSession.updateMany({
        where,
        data: {
          status: 'TERMINATED',
          terminatedAt: new Date(),
          terminatedReason: 'Force logout from all devices',
        },
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'LOGOUT',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        {
          reason: 'force_logout_all',
          sessionsTerminated: result.count,
          exceptCurrent: input.exceptCurrent,
        }
      );

      return {
        success: true,
        terminatedCount: result.count,
      };
    }),

  // Admin: Force logout a specific user from all devices
  adminTerminateUserSessions: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user belongs to organization
      const targetUser = await ctx.prisma.user.findFirst({
        where: {
          id: input.userId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!targetUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const result = await ctx.prisma.userSession.updateMany({
        where: {
          userId: input.userId,
          status: { in: ['ACTIVE', 'SUSPICIOUS'] },
        },
        data: {
          status: 'TERMINATED',
          terminatedAt: new Date(),
          terminatedReason: input.reason || 'Admin force logout',
        },
      });

      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'ACCOUNT_LOCKED',
        input.userId,
        ctx.user.organizationId,
        true,
        {
          action: 'admin_force_logout',
          adminId: ctx.user.id,
          reason: input.reason,
          sessionsTerminated: result.count,
        }
      );

      await auditLog('UPDATE', 'UserSession', {
        changes: {
          action: 'admin_force_logout',
          targetUserId: input.userId,
          reason: input.reason,
          sessionsTerminated: result.count,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        terminatedCount: result.count,
      };
    }),

  // Get session activity log for current user
  getSessionActivityLog: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        includeExpired: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.userSession.findMany({
        where: {
          userId: ctx.user.id,
          ...(input.includeExpired
            ? {}
            : { status: { in: ['ACTIVE', 'TERMINATED'] } }),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        select: {
          id: true,
          status: true,
          deviceType: true,
          browser: true,
          os: true,
          ipAddress: true,
          city: true,
          country: true,
          createdAt: true,
          lastActivityAt: true,
          terminatedAt: true,
          terminatedReason: true,
        },
      });

      return sessions;
    }),

  // Admin: List all active sessions for organization
  adminListOrgSessions: adminProcedure
    .input(
      z.object({
        status: z.enum(['ACTIVE', 'EXPIRED', 'TERMINATED', 'SUSPICIOUS']).optional(),
        userId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.userSession.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input.status && { status: input.status }),
          ...(input.userId && { userId: input.userId }),
        },
        orderBy: { lastActivityAt: 'desc' },
        take: input.limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      return sessions;
    }),

  // Validate session token (for middleware use)
  validateSession: protectedProcedure
    .input(
      z.object({
        sessionToken: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { ipAddress, userAgent } = await getRequestMetadata();
      const hashedToken = hashSessionToken(input.sessionToken);

      const session = await ctx.prisma.userSession.findFirst({
        where: {
          sessionToken: hashedToken,
          userId: ctx.user.id,
        },
      });

      if (!session) {
        return { valid: false, reason: 'session_not_found' };
      }

      if (session.status !== 'ACTIVE') {
        return { valid: false, reason: `session_${session.status.toLowerCase()}` };
      }

      const now = new Date();

      if (session.expiresAt < now) {
        return { valid: false, reason: 'session_expired' };
      }

      if (session.idleTimeoutAt && session.idleTimeoutAt < now) {
        return { valid: false, reason: 'idle_timeout' };
      }

      // IP-based validation
      if (session.ipAddress && session.ipAddress !== ipAddress) {
        // Log but don't invalidate - just flag
        await logSecurityEvent(
          ctx.prisma as unknown as PrismaClient,
          'SUSPICIOUS_ACTIVITY',
          ctx.user.id,
          ctx.user.organizationId,
          false,
          { reason: 'ip_mismatch_on_validate', sessionId: session.id }
        );
      }

      // Device fingerprint validation
      const currentFingerprint = generateDeviceFingerprint(userAgent, ipAddress);
      const fingerprintMatch = !session.deviceFingerprint ||
        session.deviceFingerprint === currentFingerprint;

      return {
        valid: true,
        sessionId: session.id,
        mfaVerified: session.mfaVerified,
        trustScore: session.trustScore,
        fingerprintMatch,
        expiresAt: session.expiresAt,
        idleTimeoutAt: session.idleTimeoutAt,
      };
    }),

  // Get device fingerprint for current request
  getDeviceFingerprint: protectedProcedure.query(async () => {
    const { ipAddress, userAgent } = await getRequestMetadata();
    const fingerprint = generateDeviceFingerprint(userAgent, ipAddress);

    return {
      fingerprint,
      deviceType: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      browser: extractBrowser(userAgent),
      browserVersion: extractBrowserVersion(userAgent),
      os: extractOS(userAgent),
      osVersion: extractOSVersion(userAgent),
      ipAddress,
    };
  }),

  // ============================================
  // Security Event Logging (US-260)
  // ============================================

  // List security events with filtering
  listSecurityEvents: adminProcedure
    .input(
      z.object({
        eventTypes: z.array(z.string()).optional(),
        severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
        success: z.boolean().optional(),
        userId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        ipAddress: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (input?.eventTypes && input.eventTypes.length > 0) {
        where.eventType = { in: input.eventTypes };
      }
      if (input?.severity) {
        where.severity = input.severity;
      }
      if (input?.success !== undefined) {
        where.success = input.success;
      }
      if (input?.userId) {
        where.userId = input.userId;
      }
      if (input?.ipAddress) {
        where.ipAddress = input.ipAddress;
      }
      if (input?.startDate || input?.endDate) {
        where.createdAt = {};
        if (input?.startDate) {
          (where.createdAt as Record<string, unknown>).gte = input.startDate;
        }
        if (input?.endDate) {
          (where.createdAt as Record<string, unknown>).lte = input.endDate;
        }
      }

      const [events, total] = await Promise.all([
        ctx.prisma.securityEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: input?.limit ?? 100,
          skip: input?.offset ?? 0,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        }),
        ctx.prisma.securityEvent.count({ where }),
      ]);

      return {
        events,
        total,
        hasMore: (input?.offset ?? 0) + events.length < total,
      };
    }),

  // Get security event by ID
  getSecurityEvent: adminProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      const event = await ctx.prisma.securityEvent.findFirst({
        where: {
          id: input.eventId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      if (!event) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Security event not found',
        });
      }

      return event;
    }),

  // Get failed login attempts for a user
  getFailedLoginAttempts: adminProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        ipAddress: z.string().optional(),
        hours: z.number().min(1).max(168).default(24), // Up to 1 week
      })
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.hours * 60 * 60 * 1000);

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        eventType: 'LOGIN_FAILURE',
        createdAt: { gte: since },
      };

      if (input.userId) {
        where.userId = input.userId;
      }
      if (input.ipAddress) {
        where.ipAddress = input.ipAddress;
      }

      const failedAttempts = await ctx.prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Group by IP address for pattern detection
      const byIP: Record<string, typeof failedAttempts> = {};
      for (const attempt of failedAttempts) {
        const ip = attempt.ipAddress || 'unknown';
        if (!byIP[ip]) byIP[ip] = [];
        byIP[ip].push(attempt);
      }

      // Identify suspicious IPs (more than 5 failures in the period)
      const suspiciousIPs = Object.entries(byIP)
        .filter(([, attempts]) => attempts.length >= 5)
        .map(([ip, attempts]) => ({
          ipAddress: ip,
          attemptCount: attempts.length,
          firstAttempt: attempts[attempts.length - 1].createdAt,
          lastAttempt: attempts[0].createdAt,
          targetUsers: [...new Set(attempts.map(a => a.userId).filter(Boolean))],
        }));

      return {
        totalAttempts: failedAttempts.length,
        attempts: failedAttempts,
        suspiciousIPs,
        periodHours: input.hours,
      };
    }),

  // Get PHI access events (HIPAA compliance)
  getPHIAccessEvents: adminProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        eventType: { in: ['PHI_ACCESSED', 'PHI_EXPORTED', 'PHI_MODIFIED'] },
      };

      if (input.userId) where.userId = input.userId;
      if (input.entityType) where.entityType = input.entityType;
      if (input.entityId) where.entityId = input.entityId;
      if (input.startDate || input.endDate) {
        where.createdAt = {};
        if (input.startDate) {
          (where.createdAt as Record<string, unknown>).gte = input.startDate;
        }
        if (input.endDate) {
          (where.createdAt as Record<string, unknown>).lte = input.endDate;
        }
      }

      const events = await ctx.prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      return events;
    }),

  // Get permission change events (audit trail)
  getPermissionChanges: adminProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        eventType: { in: ['PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'ROLE_CHANGED'] },
      };

      if (input.userId) where.userId = input.userId;
      if (input.startDate || input.endDate) {
        where.createdAt = {};
        if (input.startDate) {
          (where.createdAt as Record<string, unknown>).gte = input.startDate;
        }
        if (input.endDate) {
          (where.createdAt as Record<string, unknown>).lte = input.endDate;
        }
      }

      const events = await ctx.prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      return events;
    }),

  // Get configuration change events
  getConfigurationChanges: adminProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        eventType: 'CONFIG_CHANGED',
      };

      if (input.startDate || input.endDate) {
        where.createdAt = {};
        if (input.startDate) {
          (where.createdAt as Record<string, unknown>).gte = input.startDate;
        }
        if (input.endDate) {
          (where.createdAt as Record<string, unknown>).lte = input.endDate;
        }
      }

      const events = await ctx.prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      return events;
    }),

  // Detect suspicious activity patterns
  detectSuspiciousActivity: adminProcedure
    .input(
      z.object({
        hours: z.number().min(1).max(168).default(24),
      })
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.hours * 60 * 60 * 1000);

      // Get all recent security events
      const events = await ctx.prisma.securityEvent.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      const alerts: Array<{
        type: string;
        severity: 'WARNING' | 'CRITICAL';
        message: string;
        details: Record<string, unknown>;
        timestamp: Date;
      }> = [];

      // Pattern 1: Multiple failed logins from same IP
      const failedLoginsByIP: Record<string, typeof events> = {};
      for (const event of events) {
        if (event.eventType === 'LOGIN_FAILURE' && event.ipAddress) {
          if (!failedLoginsByIP[event.ipAddress]) {
            failedLoginsByIP[event.ipAddress] = [];
          }
          failedLoginsByIP[event.ipAddress].push(event);
        }
      }

      for (const [ip, attempts] of Object.entries(failedLoginsByIP)) {
        if (attempts.length >= 10) {
          alerts.push({
            type: 'BRUTE_FORCE_ATTEMPT',
            severity: 'CRITICAL',
            message: `Potential brute force attack: ${attempts.length} failed login attempts from IP ${ip}`,
            details: {
              ipAddress: ip,
              attemptCount: attempts.length,
              targetUsers: [...new Set(attempts.map(a => a.userId).filter(Boolean))],
            },
            timestamp: attempts[0].createdAt,
          });
        } else if (attempts.length >= 5) {
          alerts.push({
            type: 'MULTIPLE_FAILED_LOGINS',
            severity: 'WARNING',
            message: `Multiple failed login attempts (${attempts.length}) from IP ${ip}`,
            details: {
              ipAddress: ip,
              attemptCount: attempts.length,
            },
            timestamp: attempts[0].createdAt,
          });
        }
      }

      // Pattern 2: Unusual access patterns (many PHI accesses in short time)
      const phiAccessByUser: Record<string, typeof events> = {};
      for (const event of events) {
        if (['PHI_ACCESSED', 'PHI_EXPORTED'].includes(event.eventType) && event.userId) {
          if (!phiAccessByUser[event.userId]) {
            phiAccessByUser[event.userId] = [];
          }
          phiAccessByUser[event.userId].push(event);
        }
      }

      for (const [userId, accesses] of Object.entries(phiAccessByUser)) {
        // More than 100 PHI accesses in the period - unusual
        if (accesses.length >= 100) {
          const user = accesses[0].user;
          alerts.push({
            type: 'UNUSUAL_PHI_ACCESS_VOLUME',
            severity: 'WARNING',
            message: `Unusual PHI access volume: ${accesses.length} accesses by ${user?.email || 'Unknown user'}`,
            details: {
              userId,
              accessCount: accesses.length,
              userEmail: user?.email,
            },
            timestamp: accesses[0].createdAt,
          });
        }
      }

      // Pattern 3: Account lockouts
      const lockouts = events.filter(e => e.eventType === 'ACCOUNT_LOCKED');
      if (lockouts.length >= 3) {
        alerts.push({
          type: 'MULTIPLE_ACCOUNT_LOCKOUTS',
          severity: 'WARNING',
          message: `${lockouts.length} accounts have been locked in the past ${input.hours} hours`,
          details: {
            lockoutCount: lockouts.length,
            affectedUsers: lockouts.map(l => l.userId).filter(Boolean),
          },
          timestamp: lockouts[0].createdAt,
        });
      }

      // Pattern 4: Suspicious activity events
      const suspiciousEvents = events.filter(e => e.eventType === 'SUSPICIOUS_ACTIVITY');
      for (const event of suspiciousEvents) {
        alerts.push({
          type: 'FLAGGED_SUSPICIOUS_ACTIVITY',
          severity: 'WARNING',
          message: event.description || 'Suspicious activity detected',
          details: {
            eventId: event.id,
            userId: event.userId,
            ipAddress: event.ipAddress,
            metadata: event.metadata,
          },
          timestamp: event.createdAt,
        });
      }

      // Pattern 5: MFA bypass attempts
      const mfaFailures = events.filter(e => e.eventType === 'LOGIN_MFA_FAILURE');
      const mfaFailuresByUser: Record<string, typeof events> = {};
      for (const event of mfaFailures) {
        if (event.userId) {
          if (!mfaFailuresByUser[event.userId]) {
            mfaFailuresByUser[event.userId] = [];
          }
          mfaFailuresByUser[event.userId].push(event);
        }
      }

      for (const [userId, failures] of Object.entries(mfaFailuresByUser)) {
        if (failures.length >= 5) {
          const user = failures[0].user;
          alerts.push({
            type: 'MFA_BYPASS_ATTEMPT',
            severity: 'CRITICAL',
            message: `Potential MFA bypass attempt: ${failures.length} failed MFA verifications for ${user?.email || 'Unknown user'}`,
            details: {
              userId,
              failureCount: failures.length,
              userEmail: user?.email,
            },
            timestamp: failures[0].createdAt,
          });
        }
      }

      // Sort alerts by severity and timestamp
      alerts.sort((a, b) => {
        if (a.severity !== b.severity) {
          return a.severity === 'CRITICAL' ? -1 : 1;
        }
        return b.timestamp.getTime() - a.timestamp.getTime();
      });

      return {
        alerts,
        totalEvents: events.length,
        periodHours: input.hours,
        analyzedAt: new Date(),
      };
    }),

  // Get security event statistics for dashboard
  getSecurityEventStats: adminProcedure
    .input(
      z.object({
        hours: z.number().min(1).max(720).default(24), // Up to 30 days
      })
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.hours * 60 * 60 * 1000);

      const events = await ctx.prisma.securityEvent.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          createdAt: { gte: since },
        },
        select: {
          eventType: true,
          severity: true,
          success: true,
          createdAt: true,
        },
      });

      // Count by event type
      const byEventType: Record<string, number> = {};
      const bySeverity: Record<string, number> = { INFO: 0, WARNING: 0, CRITICAL: 0 };
      let successCount = 0;
      let failureCount = 0;

      // Hourly distribution for the last 24 hours
      const hourlyDistribution: Record<string, number> = {};
      const now = new Date();

      for (const event of events) {
        // By event type
        byEventType[event.eventType] = (byEventType[event.eventType] || 0) + 1;

        // By severity
        bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;

        // Success/Failure
        if (event.success) {
          successCount++;
        } else {
          failureCount++;
        }

        // Hourly distribution (last 24 hours)
        const hoursDiff = Math.floor((now.getTime() - event.createdAt.getTime()) / (60 * 60 * 1000));
        if (hoursDiff < 24) {
          const hourKey = `${hoursDiff}`;
          hourlyDistribution[hourKey] = (hourlyDistribution[hourKey] || 0) + 1;
        }
      }

      // Get authentication events breakdown
      const authEvents = {
        loginSuccess: byEventType['LOGIN_SUCCESS'] || 0,
        loginFailure: byEventType['LOGIN_FAILURE'] || 0,
        mfaSuccess: byEventType['LOGIN_MFA_SUCCESS'] || 0,
        mfaFailure: byEventType['LOGIN_MFA_FAILURE'] || 0,
        logout: byEventType['LOGOUT'] || 0,
        passwordChanges: byEventType['PASSWORD_CHANGE'] || 0,
      };

      return {
        totalEvents: events.length,
        byEventType,
        bySeverity,
        successCount,
        failureCount,
        authEvents,
        hourlyDistribution,
        periodHours: input.hours,
      };
    }),

  // Log a custom security event (for use by other procedures)
  logSecurityEvent: protectedProcedure
    .input(
      z.object({
        eventType: z.string(),
        severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('INFO'),
        description: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        success: z.boolean().default(true),
        failureReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { ipAddress, userAgent } = await getRequestMetadata();

      const event = await ctx.prisma.securityEvent.create({
        data: {
          eventType: input.eventType as SecurityEventType,
          severity: input.severity,
          description: input.description,
          ipAddress,
          userAgent,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          success: input.success,
          failureReason: input.failureReason,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      return { id: event.id };
    }),

  // Get authentication events timeline
  getAuthEventsTimeline: adminProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        hours: z.number().min(1).max(168).default(24),
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.hours * 60 * 60 * 1000);

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        eventType: {
          in: [
            'LOGIN_SUCCESS',
            'LOGIN_FAILURE',
            'LOGIN_MFA_REQUIRED',
            'LOGIN_MFA_SUCCESS',
            'LOGIN_MFA_FAILURE',
            'LOGOUT',
            'PASSWORD_CHANGE',
            'PASSWORD_RESET_REQUEST',
            'PASSWORD_RESET_COMPLETE',
            'MFA_ENABLED',
            'MFA_DISABLED',
            'MFA_RECOVERY_USED',
            'ACCOUNT_LOCKED',
            'ACCOUNT_UNLOCKED',
          ],
        },
        createdAt: { gte: since },
      };

      if (input.userId) {
        where.userId = input.userId;
      }

      const events = await ctx.prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return events;
    }),

  // Export security events (for compliance reporting)
  exportSecurityEvents: adminProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        eventTypes: z.array(z.string()).optional(),
        format: z.enum(['json', 'csv']).default('json'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        createdAt: {
          gte: input.startDate,
          lte: input.endDate,
        },
      };

      if (input.eventTypes && input.eventTypes.length > 0) {
        where.eventType = { in: input.eventTypes };
      }

      const events = await ctx.prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      // Log the export for audit
      await logSecurityEvent(
        ctx.prisma as unknown as PrismaClient,
        'PHI_EXPORTED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        {
          type: 'security_events_export',
          format: input.format,
          startDate: input.startDate.toISOString(),
          endDate: input.endDate.toISOString(),
          eventCount: events.length,
        }
      );

      if (input.format === 'csv') {
        // Generate CSV format
        const headers = [
          'ID',
          'Timestamp',
          'Event Type',
          'Severity',
          'User Email',
          'User Name',
          'Success',
          'IP Address',
          'Description',
          'Failure Reason',
        ];

        const rows = events.map((e) => [
          e.id,
          e.createdAt.toISOString(),
          e.eventType,
          e.severity,
          e.user?.email || '',
          e.user ? `${e.user.firstName} ${e.user.lastName}` : '',
          e.success ? 'Yes' : 'No',
          e.ipAddress || '',
          e.description || '',
          e.failureReason || '',
        ]);

        const csvContent = [headers, ...rows]
          .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
          .join('\n');

        return {
          format: 'csv',
          content: csvContent,
          filename: `security-events-${input.startDate.toISOString().split('T')[0]}-to-${input.endDate.toISOString().split('T')[0]}.csv`,
          eventCount: events.length,
        };
      }

      // JSON format
      return {
        format: 'json',
        content: JSON.stringify(events, null, 2),
        filename: `security-events-${input.startDate.toISOString().split('T')[0]}-to-${input.endDate.toISOString().split('T')[0]}.json`,
        eventCount: events.length,
      };
    }),
});

// Helper functions
function extractBrowser(userAgent: string): string {
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Edg')) return 'Edge'; // Edge uses "Edg" in UA
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
  return 'Unknown';
}

function extractBrowserVersion(userAgent: string): string {
  const patterns = [
    /Firefox\/(\d+(?:\.\d+)?)/,
    /Edg\/(\d+(?:\.\d+)?)/,
    /Chrome\/(\d+(?:\.\d+)?)/,
    /Safari\/(\d+(?:\.\d+)?)/,
    /OPR\/(\d+(?:\.\d+)?)/,
    /Opera\/(\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = userAgent.match(pattern);
    if (match) return match[1];
  }
  return 'Unknown';
}

function extractOS(userAgent: string): string {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS')) return 'macOS';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('Linux')) return 'Linux';
  return 'Unknown';
}

function extractOSVersion(userAgent: string): string {
  const patterns = [
    /Windows NT (\d+(?:\.\d+)?)/,
    /Mac OS X (\d+[._]\d+(?:[._]\d+)?)/,
    /iPhone OS (\d+[._]\d+)/,
    /Android (\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = userAgent.match(pattern);
    if (match) return match[1].replace(/_/g, '.');
  }
  return 'Unknown';
}

// Simple IP range check (supports exact match and CIDR notation)
function isIpInRange(ip: string, range: string): boolean {
  // Exact match
  if (ip === range) return true;

  // CIDR notation check (simplified - only handles /24, /16, /8 for IPv4)
  if (range.includes('/')) {
    const [rangeIp, cidrStr] = range.split('/');
    const cidr = parseInt(cidrStr, 10);

    if (cidr === 24) {
      // /24 - match first 3 octets
      const ipParts = ip.split('.').slice(0, 3).join('.');
      const rangeParts = rangeIp.split('.').slice(0, 3).join('.');
      return ipParts === rangeParts;
    } else if (cidr === 16) {
      // /16 - match first 2 octets
      const ipParts = ip.split('.').slice(0, 2).join('.');
      const rangeParts = rangeIp.split('.').slice(0, 2).join('.');
      return ipParts === rangeParts;
    } else if (cidr === 8) {
      // /8 - match first octet
      const ipParts = ip.split('.')[0];
      const rangeParts = rangeIp.split('.')[0];
      return ipParts === rangeParts;
    }
  }

  // Wildcard support (e.g., 192.168.*)
  if (range.includes('*')) {
    const rangePattern = range.replace(/\./g, '\\.').replace(/\*/g, '.*');
    return new RegExp(`^${rangePattern}$`).test(ip);
  }

  return false;
}
