/**
 * Epic 14: Patient Portal - Session Management Service
 * Handles portal session creation, validation, and cleanup
 */

import { prisma } from '@/lib/prisma';
import type { PortalSession, PortalUserInfo } from './types';

// Session configuration
const SESSION_DURATION_HOURS = 24;
const SESSION_IDLE_TIMEOUT_MINUTES = 60;

/**
 * Get all active sessions for a portal user
 */
export async function getUserSessions(portalUserId: string): Promise<PortalSession[]> {
  const sessions = await prisma.portalSession.findMany({
    where: {
      portalUserId,
      expiresAt: { gt: new Date() },
      revokedAt: null,
    },
    orderBy: { lastActivityAt: 'desc' },
  });

  return sessions.map((s) => ({
    id: s.id,
    token: s.token,
    portalUserId: s.portalUserId,
    userAgent: s.userAgent ?? undefined,
    ipAddress: s.ipAddress ?? undefined,
    deviceType: s.deviceType ?? undefined,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    lastActivityAt: s.lastActivityAt,
  }));
}

/**
 * Revoke a specific session
 */
export async function revokeSession(
  sessionId: string,
  portalUserId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await prisma.portalSession.findFirst({
    where: { id: sessionId, portalUserId },
  });

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  await prisma.portalSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });

  return { success: true };
}

/**
 * Revoke all sessions except the current one
 */
export async function revokeOtherSessions(
  currentToken: string,
  portalUserId: string
): Promise<{ count: number }> {
  const result = await prisma.portalSession.updateMany({
    where: {
      portalUserId,
      token: { not: currentToken },
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return { count: result.count };
}

/**
 * Revoke all sessions for a user (e.g., on password change)
 */
export async function revokeAllSessions(portalUserId: string): Promise<{ count: number }> {
  const result = await prisma.portalSession.updateMany({
    where: {
      portalUserId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return { count: result.count };
}

/**
 * Extend session expiry (called on activity)
 */
export async function extendSession(token: string): Promise<{ success: boolean }> {
  const session = await prisma.portalSession.findFirst({
    where: { token, revokedAt: null },
  });

  if (!session) {
    return { success: false };
  }

  const newExpiry = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  await prisma.portalSession.update({
    where: { id: session.id },
    data: {
      lastActivityAt: new Date(),
      expiresAt: newExpiry,
    },
  });

  return { success: true };
}

/**
 * Check if session has been idle too long
 */
export async function checkSessionIdle(token: string): Promise<{ idle: boolean }> {
  const session = await prisma.portalSession.findFirst({
    where: { token, revokedAt: null },
  });

  if (!session) {
    return { idle: true };
  }

  const idleTimeout = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
  const timeSinceActivity = Date.now() - session.lastActivityAt.getTime();

  return { idle: timeSinceActivity > idleTimeout };
}

/**
 * Clean up expired sessions (run as background job)
 */
export async function cleanupExpiredSessions(): Promise<{ deleted: number }> {
  const result = await prisma.portalSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
      // Only delete sessions older than 30 days (keep for audit)
      createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  return { deleted: result.count };
}

/**
 * Get session info by token
 */
export async function getSessionByToken(token: string): Promise<{
  session: PortalSession | null;
  user: PortalUserInfo | null;
}> {
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
    return { session: null, user: null };
  }

  const user = session.portalUser;

  return {
    session: {
      id: session.id,
      token: session.token,
      portalUserId: session.portalUserId,
      userAgent: session.userAgent ?? undefined,
      ipAddress: session.ipAddress ?? undefined,
      deviceType: session.deviceType ?? undefined,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastActivityAt: session.lastActivityAt,
    },
    user: {
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
    },
  };
}

/**
 * Record session activity for audit trail
 */
export async function recordSessionActivity(
  token: string,
  activity: string
): Promise<void> {
  await prisma.portalSession.updateMany({
    where: { token, revokedAt: null },
    data: { lastActivityAt: new Date() },
  });
}
