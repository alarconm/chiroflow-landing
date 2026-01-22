import { NextRequest } from 'next/server';
import {
  revokeRefreshToken,
  revokeAllUserTokens,
  getMobileUser,
  mobileErrorResponse,
  mobileSuccessResponse,
  mobileUnauthorizedResponse,
} from '@/lib/mobile-auth';
import { createAuditLog } from '@/lib/audit';

// Logout single session (revoke refresh token)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken, all } = body;

    // If logging out all devices, need to be authenticated
    if (all) {
      const user = getMobileUser(req);
      if (!user) {
        return mobileUnauthorizedResponse('Authentication required for logout all');
      }

      const count = await revokeAllUserTokens(user.id, user.organizationId, 'User logout all devices');

      await createAuditLog({
        action: 'AUTH_LOGOUT',
        entityType: 'MobileAuth',
        entityId: user.id,
        userId: user.id,
        organizationId: user.organizationId,
        metadata: { revokedTokenCount: count, scope: 'all_devices' },
      });

      return mobileSuccessResponse({ success: true, revokedCount: count });
    }

    // Single logout - just revoke the provided token
    if (!refreshToken) {
      return mobileErrorResponse('Refresh token is required', 400);
    }

    await revokeRefreshToken(refreshToken, 'User logout');

    return mobileSuccessResponse({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return mobileErrorResponse('Logout failed', 500);
  }
}
