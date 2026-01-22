import { NextRequest, NextResponse } from 'next/server';
import { MOBILE_API_VERSION } from '@/lib/mobile-auth';

// Public endpoint - no authentication required
export async function GET(req: NextRequest) {
  return NextResponse.json({
    success: true,
    data: {
      apiVersion: MOBILE_API_VERSION,
      status: 'operational',
      timestamp: new Date().toISOString(),
      endpoints: {
        auth: {
          login: '/api/mobile/v1/auth/login',
          refresh: '/api/mobile/v1/auth/refresh',
          logout: '/api/mobile/v1/auth/logout',
        },
        devices: '/api/mobile/v1/devices',
        sync: {
          push: '/api/mobile/v1/sync/push',
          pull: '/api/mobile/v1/sync/pull',
        },
        notifications: {
          register: '/api/mobile/v1/notifications/register',
        },
      },
    },
  });
}
