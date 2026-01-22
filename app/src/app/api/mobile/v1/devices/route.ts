import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getMobileUser,
  revokeDeviceTokens,
  mobileErrorResponse,
  mobileSuccessResponse,
  mobileUnauthorizedResponse,
  withMobileAuth,
} from '@/lib/mobile-auth';
import { withMobileRateLimit } from '@/lib/mobile-rate-limit';
import { DevicePlatform } from '@prisma/client';

// List registered devices
async function listDevicesHandler(req: NextRequest, context: { user: { id: string; organizationId: string } }) {
  const { user } = context;

  const devices = await prisma.mobileDevice.findMany({
    where: {
      userId: user.id,
      organizationId: user.organizationId,
      isActive: true,
    },
    select: {
      id: true,
      deviceId: true,
      deviceName: true,
      platform: true,
      osVersion: true,
      appVersion: true,
      lastActiveAt: true,
      createdAt: true,
      isTrusted: true,
    },
    orderBy: { lastActiveAt: 'desc' },
  });

  return mobileSuccessResponse({ devices });
}

// Register a new device
async function registerDeviceHandler(req: NextRequest, context: { user: { id: string; organizationId: string } }) {
  try {
    const { user } = context;
    const body = await req.json();
    const { deviceId, deviceName, platform, osVersion, appVersion, fcmToken, apnsToken } = body;

    if (!deviceId || !platform) {
      return mobileErrorResponse('Device ID and platform are required', 400);
    }

    const validPlatforms = ['IOS', 'ANDROID', 'WEB'];
    if (!validPlatforms.includes(platform)) {
      return mobileErrorResponse('Invalid platform. Must be IOS, ANDROID, or WEB', 400);
    }

    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined;

    const device = await prisma.mobileDevice.upsert({
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

    return mobileSuccessResponse({
      id: device.id,
      deviceId: device.deviceId,
      registered: true,
    });
  } catch (error) {
    console.error('Device registration error:', error);
    return mobileErrorResponse('Device registration failed', 500);
  }
}

// Unregister a device
async function unregisterDeviceHandler(req: NextRequest, context: { user: { id: string; organizationId: string } }) {
  try {
    const { user } = context;
    const body = await req.json();
    const { deviceId } = body;

    if (!deviceId) {
      return mobileErrorResponse('Device ID is required', 400);
    }

    // Revoke all tokens for this device
    await revokeDeviceTokens(deviceId, user.organizationId, 'Device unregistered');

    // Deactivate device
    await prisma.mobileDevice.updateMany({
      where: {
        deviceId,
        userId: user.id,
        organizationId: user.organizationId,
      },
      data: {
        isActive: false,
        fcmToken: null,
        apnsToken: null,
      },
    });

    return mobileSuccessResponse({ success: true });
  } catch (error) {
    console.error('Device unregistration error:', error);
    return mobileErrorResponse('Device unregistration failed', 500);
  }
}

export const GET = withMobileAuth(listDevicesHandler);
export const POST = withMobileRateLimit('auth/register-device')(withMobileAuth(registerDeviceHandler));
export const DELETE = withMobileAuth(unregisterDeviceHandler);
