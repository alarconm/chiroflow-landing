import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import {
  createAccessToken,
  createRefreshToken,
  mobileErrorResponse,
  mobileSuccessResponse,
  mobileUnauthorizedResponse,
  MOBILE_API_VERSION,
} from '@/lib/mobile-auth';
import { withMobileRateLimit } from '@/lib/mobile-rate-limit';
import { createAuditLog } from '@/lib/audit';
import { DevicePlatform } from '@prisma/client';

async function loginHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, tenantId, deviceId, deviceName, platform, osVersion, appVersion, fcmToken, apnsToken } =
      body;

    if (!email || !password) {
      return mobileErrorResponse('Email and password are required', 400);
    }

    // Find user
    const whereClause = tenantId ? { email, organizationId: tenantId } : { email };
    const user = await prisma.user.findFirst({
      where: whereClause,
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      return mobileUnauthorizedResponse('Invalid email or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return mobileUnauthorizedResponse('Invalid email or password');
    }

    // Build auth user object
    const authUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
    };

    // Get IP address
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined;

    // Register or update device if device info provided
    if (deviceId && platform) {
      await prisma.mobileDevice.upsert({
        where: {
          deviceId_userId_organizationId: {
            deviceId,
            userId: user.id,
            organizationId: user.organizationId,
          },
        },
        create: {
          deviceId,
          deviceName,
          platform: platform as DevicePlatform,
          osVersion,
          appVersion,
          fcmToken,
          apnsToken,
          userId: user.id,
          organizationId: user.organizationId,
          lastActiveAt: new Date(),
          lastIpAddress: ipAddress,
        },
        update: {
          deviceName,
          osVersion,
          appVersion,
          fcmToken,
          apnsToken,
          lastActiveAt: new Date(),
          lastIpAddress: ipAddress,
          isActive: true,
        },
      });
    }

    // Create tokens
    const accessToken = createAccessToken(authUser, deviceId);
    const refreshTokenResult = await createRefreshToken(authUser, deviceId, ipAddress);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Audit log
    await createAuditLog({
      action: 'AUTH_LOGIN',
      entityType: 'MobileAuth',
      entityId: user.id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      metadata: {
        deviceId,
        platform,
        method: 'mobile_rest_api',
      },
    });

    return mobileSuccessResponse({
      accessToken,
      refreshToken: refreshTokenResult.token,
      expiresAt: refreshTokenResult.expiresAt.toISOString(),
      user: authUser,
      apiVersion: MOBILE_API_VERSION,
    });
  } catch (error) {
    console.error('Mobile login error:', error);
    return mobileErrorResponse('Login failed', 500);
  }
}

export const POST = withMobileRateLimit('auth/login')(loginHandler);
