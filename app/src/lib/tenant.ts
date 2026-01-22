import { headers } from 'next/headers';
import { prisma } from './prisma';
import type { Organization } from '@prisma/client';

export type TenantInfo = {
  id: string;
  name: string;
  subdomain: string;
  settings: Record<string, unknown>;
};

/**
 * Extract tenant identifier from request headers or subdomain
 */
export async function getTenantFromRequest(): Promise<string | null> {
  const headersList = await headers();

  // First check for explicit tenant header (useful for API calls)
  const tenantHeader = headersList.get('x-tenant-id');
  if (tenantHeader) {
    return tenantHeader;
  }

  // Fall back to subdomain extraction from host
  const host = headersList.get('host');
  if (host) {
    // Extract subdomain from host (e.g., "demo.chiroflow.app" -> "demo")
    const parts = host.split('.');
    if (parts.length >= 3) {
      // Has subdomain (e.g., demo.chiroflow.app or demo.localhost)
      return parts[0];
    }
    // Check for localhost with port (e.g., demo.localhost:3000)
    if (parts.length >= 2 && parts[1].includes('localhost')) {
      return parts[0];
    }

    // Development mode: use "demo" as default tenant for localhost
    if (process.env.NODE_ENV === 'development' && (host.includes('localhost') || host.includes('127.0.0.1'))) {
      return 'demo';
    }
  }

  return null;
}

/**
 * Get tenant organization by subdomain or ID
 */
export async function getTenantByIdentifier(
  identifier: string
): Promise<Organization | null> {
  // First try to find by subdomain
  let org = await prisma.organization.findUnique({
    where: { subdomain: identifier },
  });

  // If not found, try by ID (for direct API calls)
  if (!org) {
    org = await prisma.organization.findUnique({
      where: { id: identifier },
    });
  }

  return org;
}

/**
 * Get current tenant from request context
 * Returns null if no tenant found
 */
export async function getCurrentTenant(): Promise<TenantInfo | null> {
  const identifier = await getTenantFromRequest();
  if (!identifier) {
    return null;
  }

  const org = await getTenantByIdentifier(identifier);
  if (!org) {
    return null;
  }

  return {
    id: org.id,
    name: org.name,
    subdomain: org.subdomain,
    settings: org.settings as Record<string, unknown>,
  };
}

/**
 * Require tenant - throws if not found
 * Use this in API routes that require a tenant
 */
export async function requireTenant(): Promise<TenantInfo> {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    throw new Error('Tenant not found. Include x-tenant-id header or use subdomain.');
  }
  return tenant;
}
