import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  mobileErrorResponse,
  mobileSuccessResponse,
  withMobileAuth,
} from '@/lib/mobile-auth';

async function registerPushHandler(
  req: NextRequest,
  context: { user: { id: string; organizationId: string } }
) {
  try {
    const { user } = context;
    const body = await req.json();
    const { deviceId, fcmToken, apnsToken } = body;

    if (!deviceId) {
      return mobileErrorResponse('Device ID is required', 400);
    }

    if (!fcmToken && !apnsToken) {
      return mobileErrorResponse('Either FCM token or APNS token is required', 400);
    }

    const device = await prisma.mobileDevice.findFirst({
      where: {
        deviceId,
        userId: user.id,
        organizationId: user.organizationId,
      },
    });

    if (!device) {
      return mobileErrorResponse('Device not found. Please register the device first.', 404);
    }

    await prisma.mobileDevice.update({
      where: { id: device.id },
      data: {
        fcmToken,
        apnsToken,
        lastActiveAt: new Date(),
      },
    });

    return mobileSuccessResponse({
      registered: true,
      deviceId,
    });
  } catch (error) {
    console.error('Push notification registration error:', error);
    return mobileErrorResponse('Registration failed', 500);
  }
}

export const POST = withMobileAuth(registerPushHandler);
