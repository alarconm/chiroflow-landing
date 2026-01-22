/**
 * Epic 14: Patient Portal - Authentication Service
 * Handles portal user authentication, registration, and password management
 */

import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { PortalLoginResponse, PortalUserInfo } from './types';

// Configuration
const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;
const SESSION_DURATION_HOURS = 24;
const PASSWORD_RESET_EXPIRY_HOURS = 24;
const EMAIL_VERIFY_EXPIRY_HOURS = 48;

/**
 * Register a new portal user for a patient
 */
export async function registerPortalUser(
  patientId: string,
  email: string,
  password: string,
  organizationId: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  // Check if patient already has a portal account
  const existingUser = await prisma.portalUser.findUnique({
    where: { patientId },
  });

  if (existingUser) {
    return { success: false, error: 'Patient already has a portal account' };
  }

  // Check if email is already in use for this organization
  const emailInUse = await prisma.portalUser.findFirst({
    where: { email, organizationId },
  });

  if (emailInUse) {
    return { success: false, error: 'Email is already registered' };
  }

  // Verify patient exists and belongs to organization
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId },
  });

  if (!patient) {
    return { success: false, error: 'Patient not found' };
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Generate email verification token
  const emailVerifyToken = crypto.randomBytes(32).toString('hex');
  const emailVerifyExpires = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_HOURS * 60 * 60 * 1000);

  // Create portal user
  const portalUser = await prisma.portalUser.create({
    data: {
      email,
      passwordHash,
      patientId,
      organizationId,
      status: 'PENDING',
      emailVerifyToken,
      emailVerifyExpires,
    },
  });

  // TODO: Send verification email

  return { success: true, userId: portalUser.id };
}

/**
 * Verify email address using token
 */
export async function verifyEmail(
  token: string
): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.portalUser.findFirst({
    where: {
      emailVerifyToken: token,
      emailVerifyExpires: { gt: new Date() },
    },
  });

  if (!user) {
    return { success: false, error: 'Invalid or expired verification token' };
  }

  await prisma.portalUser.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpires: null,
      status: 'ACTIVE',
      activatedAt: new Date(),
    },
  });

  return { success: true };
}

/**
 * Login to portal
 */
export async function loginPortalUser(
  email: string,
  password: string,
  organizationId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<PortalLoginResponse> {
  const user = await prisma.portalUser.findFirst({
    where: { email, organizationId },
    include: {
      patient: {
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
              preferredName: true,
              dateOfBirth: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    // Log failed attempt
    await logPortalAccess({
      action: 'PORTAL_LOGIN_FAILED',
      organizationId,
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'User not found',
      metadata: { email },
    });
    return { success: false, error: 'Invalid email or password' };
  }

  // Check if account is locked
  if (user.status === 'LOCKED' && user.lockedUntil && user.lockedUntil > new Date()) {
    return { success: false, error: 'Account is temporarily locked. Please try again later.' };
  }

  // Check account status
  if (user.status === 'DEACTIVATED') {
    return { success: false, error: 'Account has been deactivated' };
  }

  if (user.status === 'SUSPENDED') {
    return { success: false, error: 'Account has been suspended. Please contact the practice.' };
  }

  if (user.status === 'PENDING' && !user.emailVerified) {
    return { success: false, error: 'Please verify your email before logging in', requiresVerification: true };
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    // Increment failed login attempts
    const newAttempts = user.failedLoginAttempts + 1;
    const updateData: Record<string, unknown> = {
      failedLoginAttempts: newAttempts,
      lastFailedLogin: new Date(),
    };

    // Lock account if too many attempts
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      updateData.status = 'LOCKED';
      updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
    }

    await prisma.portalUser.update({
      where: { id: user.id },
      data: updateData,
    });

    // Log failed attempt
    await logPortalAccess({
      action: 'PORTAL_LOGIN_FAILED',
      portalUserId: user.id,
      organizationId,
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Invalid password',
    });

    return { success: false, error: 'Invalid email or password' };
  }

  // Create session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  // Detect device type from user agent
  let deviceType = 'desktop';
  if (userAgent) {
    if (/mobile/i.test(userAgent)) deviceType = 'mobile';
    else if (/tablet/i.test(userAgent)) deviceType = 'tablet';
  }

  // Create session
  await prisma.portalSession.create({
    data: {
      token,
      portalUserId: user.id,
      expiresAt,
      ipAddress,
      userAgent,
      deviceType,
    },
  });

  // Update user login info and reset failed attempts
  await prisma.portalUser.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
      failedLoginAttempts: 0,
      status: user.status === 'LOCKED' ? 'ACTIVE' : user.status,
      lockedUntil: null,
    },
  });

  // Log successful login
  await logPortalAccess({
    action: 'PORTAL_LOGIN',
    portalUserId: user.id,
    organizationId,
    ipAddress,
    userAgent,
    success: true,
  });

  // Build user info response
  const userInfo: PortalUserInfo = {
    id: user.id,
    email: user.email,
    status: user.status as PortalUserInfo['status'],
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt ?? undefined,
    patientId: user.patientId,
    organizationId: user.organizationId,
    patient: {
      id: user.patient.id,
      mrn: user.patient.mrn,
      firstName: user.patient.demographics?.firstName ?? '',
      lastName: user.patient.demographics?.lastName ?? '',
      preferredName: user.patient.demographics?.preferredName ?? undefined,
      dateOfBirth: user.patient.demographics?.dateOfBirth,
    },
  };

  return { success: true, token, user: userInfo };
}

/**
 * Validate session token and return user info
 */
export async function validateSession(
  token: string
): Promise<{ valid: boolean; user?: PortalUserInfo; error?: string }> {
  const session = await prisma.portalSession.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
      revokedAt: null,
    },
    include: {
      portalUser: {
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                  dateOfBirth: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session) {
    return { valid: false, error: 'Invalid or expired session' };
  }

  const user = session.portalUser;

  // Check user status
  if (user.status !== 'ACTIVE') {
    return { valid: false, error: 'Account is not active' };
  }

  // Update last activity
  await prisma.portalSession.update({
    where: { id: session.id },
    data: { lastActivityAt: new Date() },
  });

  const userInfo: PortalUserInfo = {
    id: user.id,
    email: user.email,
    status: user.status as PortalUserInfo['status'],
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt ?? undefined,
    patientId: user.patientId,
    organizationId: user.organizationId,
    patient: {
      id: user.patient.id,
      mrn: user.patient.mrn,
      firstName: user.patient.demographics?.firstName ?? '',
      lastName: user.patient.demographics?.lastName ?? '',
      preferredName: user.patient.demographics?.preferredName ?? undefined,
      dateOfBirth: user.patient.demographics?.dateOfBirth,
    },
  };

  return { valid: true, user: userInfo };
}

/**
 * Logout - revoke session
 */
export async function logoutPortalUser(
  token: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean }> {
  const session = await prisma.portalSession.findFirst({
    where: { token },
    include: { portalUser: true },
  });

  if (session) {
    await prisma.portalSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    // Log logout
    await logPortalAccess({
      action: 'PORTAL_LOGOUT',
      portalUserId: session.portalUserId,
      organizationId: session.portalUser.organizationId,
      ipAddress,
      userAgent,
      success: true,
    });
  }

  return { success: true };
}

/**
 * Request password reset
 */
export async function requestPasswordReset(
  email: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.portalUser.findFirst({
    where: { email, organizationId },
  });

  if (!user) {
    // Don't reveal if email exists
    return { success: true };
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.portalUser.update({
    where: { id: user.id },
    data: {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
    },
  });

  // TODO: Send password reset email with token

  return { success: true };
}

/**
 * Reset password using token
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.portalUser.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpires: { gt: new Date() },
    },
  });

  if (!user) {
    return { success: false, error: 'Invalid or expired reset token' };
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.portalUser.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      failedLoginAttempts: 0,
      status: user.status === 'LOCKED' ? 'ACTIVE' : user.status,
      lockedUntil: null,
    },
  });

  // Revoke all existing sessions for security
  await prisma.portalSession.updateMany({
    where: { portalUserId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return { success: true };
}

/**
 * Change password (when logged in)
 */
export async function changePassword(
  portalUserId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.portalUser.findUnique({
    where: { id: portalUserId },
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return { success: false, error: 'Current password is incorrect' };
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.portalUser.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  // Revoke other sessions (keep current)
  // Note: In a real implementation, we'd pass the current session token to keep

  return { success: true };
}

/**
 * Log portal access for HIPAA compliance
 */
async function logPortalAccess(params: {
  action: string;
  portalUserId?: string;
  organizationId: string;
  resource?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const {
    action,
    portalUserId,
    organizationId,
    resource,
    resourceId,
    ipAddress,
    userAgent,
    success,
    errorMessage,
    metadata,
  } = params;

  // Only log if we have a user ID
  if (portalUserId) {
    await prisma.portalAccessLog.create({
      data: {
        action,
        portalUserId,
        organizationId,
        resource,
        resourceId,
        ipAddress,
        userAgent,
        success,
        errorMessage,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    });
  }
}

export { logPortalAccess };
