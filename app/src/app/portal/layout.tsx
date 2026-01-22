'use client';

/**
 * Epic 14: Patient Portal - Layout
 *
 * This is a separate layout from the main dashboard.
 * Portal uses its own authentication mechanism (not NextAuth).
 */

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { PortalLayout as PortalLayoutComponent } from '@/components/portal';

// Pages that don't require authentication
const PUBLIC_PATHS = [
  '/portal',
  '/portal/login',
  '/portal/register',
  '/portal/forgot-password',
  '/portal/activate',
  '/portal/reset-password',
];

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Check for portal token
    const token = localStorage.getItem('portalToken');

    // Public pages don't require authentication
    if (PUBLIC_PATHS.includes(pathname || '')) {
      setIsAuthenticated(true); // Allow rendering public pages
      return;
    }

    if (!token) {
      router.push('/portal');
      return;
    }

    setIsAuthenticated(true);
  }, [pathname, router]);

  // Show loading while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#053e67]" />
      </div>
    );
  }

  // Public pages have their own minimal layout (like login)
  if (PUBLIC_PATHS.includes(pathname || '')) {
    return <>{children}</>;
  }

  // All other pages use the portal layout with navigation
  return <PortalLayoutComponent>{children}</PortalLayoutComponent>;
}
