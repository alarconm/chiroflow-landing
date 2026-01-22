import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { getMobileUser, mobileErrorResponse } from './mobile-auth';

// Rate limit configurations
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// Default rate limits by endpoint type
const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Auth endpoints - more restrictive
  'auth/login': { maxRequests: 5, windowMs: 60 * 1000 }, // 5 per minute
  'auth/refresh': { maxRequests: 10, windowMs: 60 * 1000 }, // 10 per minute
  'auth/register-device': { maxRequests: 3, windowMs: 60 * 1000 }, // 3 per minute

  // Read endpoints - more permissive
  'patients/list': { maxRequests: 60, windowMs: 60 * 1000 }, // 60 per minute
  'appointments/list': { maxRequests: 60, windowMs: 60 * 1000 }, // 60 per minute
  'sync/pull': { maxRequests: 30, windowMs: 60 * 1000 }, // 30 per minute

  // Write endpoints - moderate
  'sync/push': { maxRequests: 30, windowMs: 60 * 1000 }, // 30 per minute
  'appointments/create': { maxRequests: 20, windowMs: 60 * 1000 }, // 20 per minute

  // Default for unspecified endpoints
  default: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 per minute
};

// Get rate limit config for an endpoint
function getRateLimitConfig(endpoint: string): RateLimitConfig {
  return DEFAULT_RATE_LIMITS[endpoint] || DEFAULT_RATE_LIMITS.default;
}

// Get the rate limit key (user ID, device ID, or IP)
function getRateLimitKey(
  req: NextRequest
): { keyType: 'user' | 'device' | 'ip'; keyValue: string; organizationId: string | null } {
  // Try to get user from JWT
  const user = getMobileUser(req);
  if (user) {
    return {
      keyType: 'user',
      keyValue: user.id,
      organizationId: user.organizationId,
    };
  }

  // Try device ID from header
  const deviceId = req.headers.get('x-device-id');
  if (deviceId) {
    return {
      keyType: 'device',
      keyValue: deviceId,
      organizationId: null,
    };
  }

  // Fall back to IP address
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return {
    keyType: 'ip',
    keyValue: ip,
    organizationId: null,
  };
}

// Check if request is rate limited
export async function checkRateLimit(
  req: NextRequest,
  endpoint: string
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}> {
  const { keyType, keyValue, organizationId } = getRateLimitKey(req);
  const config = getRateLimitConfig(endpoint);
  const now = new Date();

  // Find or create rate limit record
  const rateLimit = await prisma.mobileRateLimit.findUnique({
    where: {
      keyType_keyValue_endpoint_organizationId: {
        keyType,
        keyValue,
        endpoint,
        organizationId: organizationId || '',
      },
    },
  });

  // Check if blocked
  if (rateLimit?.isBlocked && rateLimit.blockedUntil && rateLimit.blockedUntil > now) {
    const retryAfter = Math.ceil((rateLimit.blockedUntil.getTime() - now.getTime()) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: rateLimit.blockedUntil,
      retryAfter,
    };
  }

  // Check if within current window
  if (rateLimit) {
    const windowEnd = new Date(rateLimit.windowStart.getTime() + rateLimit.windowDurationMs);

    if (now < windowEnd) {
      // Still in current window
      if (rateLimit.requestCount >= config.maxRequests) {
        // Rate limited - calculate retry time
        const retryAfter = Math.ceil((windowEnd.getTime() - now.getTime()) / 1000);

        // Update block status if repeatedly hitting limit
        if (rateLimit.requestCount > config.maxRequests * 2) {
          // Block for escalating time if abusing
          const blockDuration = Math.min(rateLimit.requestCount * 60 * 1000, 60 * 60 * 1000); // Max 1 hour
          await prisma.mobileRateLimit.update({
            where: { id: rateLimit.id },
            data: {
              isBlocked: true,
              blockedUntil: new Date(now.getTime() + blockDuration),
              blockReason: `Rate limit exceeded: ${rateLimit.requestCount} requests in window`,
            },
          });
        }

        return {
          allowed: false,
          remaining: 0,
          resetAt: windowEnd,
          retryAfter,
        };
      }

      // Increment counter
      await prisma.mobileRateLimit.update({
        where: { id: rateLimit.id },
        data: { requestCount: { increment: 1 } },
      });

      return {
        allowed: true,
        remaining: config.maxRequests - rateLimit.requestCount - 1,
        resetAt: windowEnd,
      };
    }

    // Window expired, reset
    await prisma.mobileRateLimit.update({
      where: { id: rateLimit.id },
      data: {
        requestCount: 1,
        windowStart: now,
        windowDurationMs: config.windowMs,
        isBlocked: false,
        blockedUntil: null,
        blockReason: null,
      },
    });

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: new Date(now.getTime() + config.windowMs),
    };
  }

  // Create new rate limit record
  await prisma.mobileRateLimit.create({
    data: {
      keyType,
      keyValue,
      endpoint,
      requestCount: 1,
      windowStart: now,
      windowDurationMs: config.windowMs,
      organizationId: organizationId || '',
    },
  });

  return {
    allowed: true,
    remaining: config.maxRequests - 1,
    resetAt: new Date(now.getTime() + config.windowMs),
  };
}

// Add rate limit headers to response
export function addRateLimitHeaders(
  response: NextResponse,
  limit: number,
  remaining: number,
  resetAt: Date
): NextResponse {
  response.headers.set('X-RateLimit-Limit', limit.toString());
  response.headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(resetAt.getTime() / 1000).toString());
  return response;
}

// Rate limit middleware wrapper
export function withMobileRateLimit(endpoint: string) {
  return function <T>(
    handler: (req: NextRequest, context?: { params?: T }) => Promise<NextResponse>
  ) {
    return async (req: NextRequest, context?: { params?: T }): Promise<NextResponse> => {
      const result = await checkRateLimit(req, endpoint);
      const config = getRateLimitConfig(endpoint);

      if (!result.allowed) {
        const response = mobileErrorResponse('Rate limit exceeded. Please try again later.', 429);
        addRateLimitHeaders(response, config.maxRequests, 0, result.resetAt);
        if (result.retryAfter) {
          response.headers.set('Retry-After', result.retryAfter.toString());
        }
        return response;
      }

      // Call handler and add rate limit headers to response
      const response = await handler(req, context);
      addRateLimitHeaders(response, config.maxRequests, result.remaining, result.resetAt);
      return response;
    };
  };
}

// Clean up old rate limit records (should be run periodically)
export async function cleanupRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

  const result = await prisma.mobileRateLimit.deleteMany({
    where: {
      windowStart: { lt: cutoff },
      isBlocked: false,
    },
  });

  return result.count;
}

// Unblock a specific key
export async function unblockRateLimitKey(keyType: string, keyValue: string, endpoint: string): Promise<boolean> {
  try {
    await prisma.mobileRateLimit.updateMany({
      where: {
        keyType,
        keyValue,
        endpoint,
      },
      data: {
        isBlocked: false,
        blockedUntil: null,
        blockReason: null,
        requestCount: 0,
        windowStart: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}
