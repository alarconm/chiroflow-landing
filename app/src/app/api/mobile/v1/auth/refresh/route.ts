import { NextRequest } from 'next/server';
import {
  rotateRefreshToken,
  mobileErrorResponse,
  mobileSuccessResponse,
  mobileUnauthorizedResponse,
  MOBILE_API_VERSION,
} from '@/lib/mobile-auth';
import { withMobileRateLimit } from '@/lib/mobile-rate-limit';

async function refreshHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return mobileErrorResponse('Refresh token is required', 400);
    }

    // Get IP address for security tracking
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined;

    const result = await rotateRefreshToken(refreshToken, ipAddress);

    if (!result) {
      return mobileUnauthorizedResponse('Invalid or expired refresh token');
    }

    return mobileSuccessResponse({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt.toISOString(),
      apiVersion: MOBILE_API_VERSION,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return mobileErrorResponse('Token refresh failed', 500);
  }
}

export const POST = withMobileRateLimit('auth/refresh')(refreshHandler);
