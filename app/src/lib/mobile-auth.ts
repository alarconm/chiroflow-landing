import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { createHash, randomBytes } from 'crypto';
import type { Role } from '@prisma/client';
import type { AuthUser } from './auth';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'development-secret';
const ACCESS_TOKEN_EXPIRY = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days

// Mobile API version
export const MOBILE_API_VERSION = 'v1';

// Simple JWT implementation (for production, use jose or jsonwebtoken)
interface JWTPayload {
  sub: string; // user ID
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  deviceId?: string;
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

// Base64URL encode/decode
function base64URLEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64URLDecode(str: string): Buffer {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

// Create HMAC signature
function createSignature(data: string, secret: string): string {
  const hmac = createHash('sha256');
  hmac.update(data + secret);
  return base64URLEncode(hmac.digest());
}

// Create JWT token
export function createJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, expiresInMs: number): string {
  const now = Date.now();
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInMs,
  };

  const header = base64URLEncode(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64URLEncode(Buffer.from(JSON.stringify(fullPayload)));
  const signature = createSignature(`${header}.${body}`, JWT_SECRET);

  return `${header}.${body}.${signature}`;
}

// Verify JWT token
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expectedSignature = createSignature(`${header}.${body}`, JWT_SECRET);

    if (signature !== expectedSignature) return null;

    const payload: JWTPayload = JSON.parse(base64URLDecode(body).toString());

    // Check expiration
    if (payload.exp < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

// Hash a refresh token for storage
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Generate a secure refresh token
export function generateRefreshToken(): string {
  return randomBytes(64).toString('base64url');
}

// Generate a token family ID
export function generateTokenFamily(): string {
  return randomBytes(16).toString('hex');
}

// Create access token for mobile
export function createAccessToken(user: AuthUser, deviceId?: string): string {
  return createJWT(
    {
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      deviceId,
      type: 'access',
    },
    ACCESS_TOKEN_EXPIRY
  );
}

// Create and store refresh token
export async function createRefreshToken(
  user: AuthUser,
  deviceId?: string,
  ipAddress?: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateRefreshToken();
  const tokenHash = hashToken(token);
  const family = generateTokenFamily();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY);

  // Find the mobile device if deviceId provided
  let mobileDeviceId: string | undefined;
  if (deviceId) {
    const device = await prisma.mobileDevice.findFirst({
      where: {
        deviceId,
        userId: user.id,
        organizationId: user.organizationId,
      },
    });
    mobileDeviceId = device?.id;
  }

  await prisma.mobileRefreshToken.create({
    data: {
      tokenHash,
      family,
      generation: 0,
      expiresAt,
      issuedIp: ipAddress,
      userId: user.id,
      organizationId: user.organizationId,
      mobileDeviceId,
    },
  });

  return { token, expiresAt };
}

// Rotate refresh token (for refresh token rotation)
export async function rotateRefreshToken(
  oldToken: string,
  ipAddress?: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
  const oldTokenHash = hashToken(oldToken);

  const existingToken = await prisma.mobileRefreshToken.findUnique({
    where: { tokenHash: oldTokenHash },
    include: {
      user: {
        include: { organization: true },
      },
    },
  });

  if (!existingToken || existingToken.isRevoked || existingToken.expiresAt < new Date()) {
    // If token was already used (replay attack), revoke entire family
    if (existingToken?.isRevoked) {
      await prisma.mobileRefreshToken.updateMany({
        where: { family: existingToken.family },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'Refresh token reuse detected - possible theft',
        },
      });
    }
    return null;
  }

  // Revoke old token
  await prisma.mobileRefreshToken.update({
    where: { id: existingToken.id },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: 'Rotated',
      lastUsedAt: new Date(),
      lastUsedIp: ipAddress,
    },
  });

  // Create new refresh token in same family
  const newToken = generateRefreshToken();
  const newTokenHash = hashToken(newToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY);

  await prisma.mobileRefreshToken.create({
    data: {
      tokenHash: newTokenHash,
      family: existingToken.family,
      generation: existingToken.generation + 1,
      expiresAt,
      issuedIp: ipAddress,
      userId: existingToken.userId,
      organizationId: existingToken.organizationId,
      mobileDeviceId: existingToken.mobileDeviceId,
    },
  });

  // Create user object for access token
  const user: AuthUser = {
    id: existingToken.user.id,
    email: existingToken.user.email,
    firstName: existingToken.user.firstName,
    lastName: existingToken.user.lastName,
    role: existingToken.user.role,
    organizationId: existingToken.user.organizationId,
    organizationName: existingToken.user.organization.name,
  };

  const accessToken = createAccessToken(user);

  return {
    accessToken,
    refreshToken: newToken,
    expiresAt,
  };
}

// Revoke a specific refresh token
export async function revokeRefreshToken(token: string, reason?: string): Promise<boolean> {
  const tokenHash = hashToken(token);

  try {
    await prisma.mobileRefreshToken.update({
      where: { tokenHash },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason || 'Manual revocation',
      },
    });
    return true;
  } catch {
    return false;
  }
}

// Revoke all refresh tokens for a user
export async function revokeAllUserTokens(userId: string, organizationId: string, reason?: string): Promise<number> {
  const result = await prisma.mobileRefreshToken.updateMany({
    where: {
      userId,
      organizationId,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: reason || 'All tokens revoked',
    },
  });

  return result.count;
}

// Revoke all refresh tokens for a device
export async function revokeDeviceTokens(deviceId: string, organizationId: string, reason?: string): Promise<number> {
  const device = await prisma.mobileDevice.findFirst({
    where: { deviceId, organizationId },
  });

  if (!device) return 0;

  const result = await prisma.mobileRefreshToken.updateMany({
    where: {
      mobileDeviceId: device.id,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: reason || 'Device tokens revoked',
    },
  });

  return result.count;
}

// Extract bearer token from request
export function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

// Get mobile user from JWT
export function getMobileUser(req: NextRequest): AuthUser | null {
  const token = extractBearerToken(req);
  if (!token) return null;

  const payload = verifyJWT(token);
  if (!payload || payload.type !== 'access') return null;

  return {
    id: payload.sub,
    email: payload.email,
    firstName: payload.firstName,
    lastName: payload.lastName,
    role: payload.role,
    organizationId: payload.organizationId,
    organizationName: payload.organizationName,
  };
}

// Response helpers
export function mobileUnauthorizedResponse(message = 'Unauthorized'): NextResponse {
  return NextResponse.json(
    { error: message, code: 'UNAUTHORIZED' },
    {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    }
  );
}

export function mobileForbiddenResponse(message = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: message, code: 'FORBIDDEN' }, { status: 403 });
}

export function mobileErrorResponse(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message, code: 'ERROR' }, { status });
}

export function mobileSuccessResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data, apiVersion: MOBILE_API_VERSION }, { status });
}

// Type for mobile route handler
type MobileHandler<T = unknown> = (
  req: NextRequest,
  context: { user: AuthUser; params?: T }
) => Promise<NextResponse> | NextResponse;

// Wrapper to require mobile JWT authentication
export function withMobileAuth<T = unknown>(handler: MobileHandler<T>) {
  return async (req: NextRequest, context?: { params?: T }): Promise<NextResponse> => {
    const user = getMobileUser(req);

    if (!user) {
      return mobileUnauthorizedResponse('Invalid or expired token');
    }

    return handler(req, { user, params: context?.params });
  };
}

// Check API version header
export function checkApiVersion(req: NextRequest): string | null {
  const version = req.headers.get('x-api-version');
  // If no version specified, use default
  if (!version) return MOBILE_API_VERSION;
  // Validate version format
  if (!/^v\d+$/.test(version)) return null;
  return version;
}

// Clean up expired tokens (should be run periodically)
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.mobileRefreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { isRevoked: true, revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }],
    },
  });

  return result.count;
}
