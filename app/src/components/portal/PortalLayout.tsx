'use client';

/**
 * Epic 14: Patient Portal - Layout Wrapper
 * Patient-friendly layout with ChiroFlow branding and warm amber/stone theme
 */

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import {
  CalendarDays,
  FileText,
  CreditCard,
  MessageSquare,
  FolderOpen,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  Bell,
  User,
  Dumbbell,
} from 'lucide-react';

interface PortalLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function PortalLayout({ children }: PortalLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [token, setToken] = useState<string | null>(null);

  // Get session token
  useEffect(() => {
    const storedToken = localStorage.getItem('portalToken');
    const storedUser = localStorage.getItem('portalUser');

    if (!storedToken) {
      router.push('/portal');
      return;
    }

    setToken(storedToken);

    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUserName(user.patient?.preferredName || user.patient?.firstName || '[DEMO] Patient');
      } catch {
        setUserName('[DEMO] Patient');
      }
    }
  }, [router]);

  // Get dashboard summary for badges
  const { data: summary } = trpc.portal.getDashboardSummary.useQuery(
    { sessionToken: token! },
    { enabled: !!token, refetchInterval: 60000 } // Refetch every minute
  );

  const logoutMutation = trpc.portal.logout.useMutation({
    onSuccess: () => {
      localStorage.removeItem('portalToken');
      localStorage.removeItem('portalUser');
      router.push('/portal');
    },
  });

  const handleLogout = () => {
    if (token) {
      logoutMutation.mutate({ sessionToken: token });
    } else {
      localStorage.removeItem('portalToken');
      localStorage.removeItem('portalUser');
      router.push('/portal');
    }
  };

  const navItems: NavItem[] = [
    { href: '/portal/dashboard', label: 'Dashboard', icon: Home },
    {
      href: '/portal/appointments',
      label: 'Appointments',
      icon: CalendarDays,
      badge: summary?.upcomingAppointments,
    },
    { href: '/portal/exercises', label: 'My Exercises', icon: Dumbbell },
    {
      href: '/portal/forms',
      label: 'Forms',
      icon: FileText,
      badge: summary?.pendingForms,
    },
    { href: '/portal/billing', label: 'Billing', icon: CreditCard },
    {
      href: '/portal/messages',
      label: 'Messages',
      icon: MessageSquare,
      badge: summary?.unreadMessages,
    },
    {
      href: '/portal/documents',
      label: 'Documents',
      icon: FolderOpen,
      badge: summary?.newDocuments,
    },
    { href: '/portal/records', label: 'Health Records', icon: ClipboardList },
    { href: '/portal/notifications', label: 'Notifications', icon: Bell },
    { href: '/portal/settings', label: 'Settings', icon: Settings },
  ];

  const totalNotifications =
    (summary?.pendingForms || 0) +
    (summary?.unreadMessages || 0) +
    (summary?.newDocuments || 0);

  if (!token) {
    return null;
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo / Brand */}
            <div className="flex items-center gap-3">
              <Link href="/portal/dashboard" className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-[#053e67] flex items-center justify-center">
                  <svg
                    className="h-5 w-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                    />
                  </svg>
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-lg font-bold text-stone-900">ChiroFlow</h1>
                  <p className="text-xs text-stone-500">Patient Portal</p>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-1">
              {navItems.slice(0, 7).map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={isActive ? 'secondary' : 'ghost'}
                      size="sm"
                      className={cn(
                        'relative',
                        isActive
                          ? 'bg-blue-100 text-[#053e67] hover:bg-blue-100'
                          : 'text-stone-600 hover:text-[#053e67] hover:bg-blue-50'
                      )}
                    >
                      <Icon className="h-4 w-4 mr-1.5" />
                      <span className="hidden xl:inline">{item.label}</span>
                      {item.badge && item.badge > 0 && (
                        <Badge
                          className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-xs bg-[#053e67] text-white border-0"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Button>
                  </Link>
                );
              })}
            </nav>

            {/* User Menu */}
            <div className="hidden md:flex items-center space-x-4">
              <button className="relative p-2 rounded-full hover:bg-stone-100 transition-colors">
                {totalNotifications > 0 && (
                  <span className="absolute top-0 right-0 h-4 w-4 bg-[#053e67] rounded-full text-[10px] text-white flex items-center justify-center">
                    {totalNotifications > 9 ? '9+' : totalNotifications}
                  </span>
                )}
                <Bell className="h-5 w-5 text-stone-500" />
              </button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100">
                <User className="h-4 w-4 text-stone-500" />
                <span className="text-sm text-stone-700">{userName}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-stone-600 hover:text-[#053e67] hover:bg-blue-50"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Sign Out
              </Button>
            </div>

            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 rounded-md hover:bg-stone-100 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6 text-stone-600" />
              ) : (
                <Menu className="h-6 w-6 text-stone-600" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-stone-200 bg-white">
            <nav className="px-4 py-2 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <div
                      className={cn(
                        'flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors',
                        isActive
                          ? 'bg-blue-100 text-[#053e67]'
                          : 'text-stone-700 hover:bg-stone-100'
                      )}
                    >
                      <div className="flex items-center">
                        <Icon className="h-5 w-5 mr-3" />
                        {item.label}
                      </div>
                      {item.badge && item.badge > 0 && (
                        <Badge className="bg-[#053e67] text-white border-0">{item.badge}</Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
              <div className="border-t border-stone-200 mt-2 pt-2">
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600">
                  <User className="h-5 w-5 text-stone-400" />
                  Signed in as {userName}
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full px-3 py-2.5 text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                >
                  <LogOut className="h-5 w-5 mr-3" />
                  Sign Out
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-stone-500">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-[#053e67] flex items-center justify-center">
                <svg
                  className="h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <p>Your health information is protected and secure.</p>
            </div>
            <div className="flex space-x-6">
              <Link href="/portal/privacy" className="hover:text-[#053e67] transition-colors">
                Privacy Policy
              </Link>
              <Link href="/portal/terms" className="hover:text-[#053e67] transition-colors">
                Terms of Use
              </Link>
              <Link href="/portal/help" className="hover:text-[#053e67] transition-colors">
                Help
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
