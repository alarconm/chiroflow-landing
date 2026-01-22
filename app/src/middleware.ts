import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require tenant validation
const publicRoutes = [
  '/api/health',
  '/login',
  '/register',
  '/_next',
  '/favicon.ico',
];

// Check if path matches any public route
function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );
}

// Extract tenant from subdomain
function extractTenantFromHost(host: string | null): string | null {
  if (!host) return null;

  // Remove port if present
  const hostWithoutPort = host.split(':')[0];
  const parts = hostWithoutPort.split('.');

  // Development mode: default to "demo" tenant for localhost
  if (hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1') {
    return 'demo';
  }

  // Check for subdomain patterns
  // e.g., demo.chiroflow.app -> demo
  // e.g., demo.localhost -> demo
  if (parts.length >= 2) {
    const potentialSubdomain = parts[0];
    // Don't treat 'www' or 'app' as tenant subdomains
    if (potentialSubdomain !== 'www' && potentialSubdomain !== 'app') {
      // If it's localhost or a known domain structure
      if (
        parts.includes('localhost') ||
        parts.slice(-2).join('.') === 'chiroflow.app'
      ) {
        return potentialSubdomain;
      }
    }
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Get tenant from header or subdomain
  const tenantHeader = request.headers.get('x-tenant-id');
  const tenantFromSubdomain = extractTenantFromHost(request.headers.get('host'));
  const tenantId = tenantHeader || tenantFromSubdomain;

  // For API routes, require tenant
  if (pathname.startsWith('/api/')) {
    if (!tenantId) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Tenant identification required. Include x-tenant-id header or use subdomain.',
          code: 'TENANT_REQUIRED',
        },
        { status: 401 }
      );
    }

    // Add tenant ID to request headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', tenantId);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // For page routes on root domain without tenant, could redirect to marketing site
  // For now, we'll allow it through (landing page scenario)
  if (!tenantId) {
    return NextResponse.next();
  }

  // Add tenant ID to headers for page routes too
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-id', tenantId);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|_next).*)',
  ],
};
