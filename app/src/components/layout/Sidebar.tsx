'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  DollarSign,
  Settings,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  CreditCard,
  BarChart3,
  Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group?: string;
};

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'main' },
  { title: 'Patients', href: '/patients', icon: Users, group: 'main' },
  { title: 'Schedule', href: '/schedule', icon: Calendar, group: 'main' },
  { title: 'Clinical', href: '/dashboard/clinical', icon: Stethoscope, group: 'clinical' },
  { title: 'Documents', href: '/documents', icon: FileText, group: 'clinical' },
  { title: 'Billing', href: '/billing', icon: DollarSign, group: 'financial' },
  { title: 'Payments', href: '/payments', icon: CreditCard, group: 'financial' },
  { title: 'Reports', href: '/reporting', icon: BarChart3, group: 'financial' },
  { title: 'Messages', href: '/communication', icon: MessageSquare, group: 'other' },
  { title: 'Settings', href: '/settings', icon: Settings, group: 'other' },
];

type SidebarProps = {
  className?: string;
};

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const groupedItems = {
    main: navItems.filter((item) => item.group === 'main'),
    clinical: navItems.filter((item) => item.group === 'clinical'),
    financial: navItems.filter((item) => item.group === 'financial'),
    other: navItems.filter((item) => item.group === 'other'),
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
          isActive
            ? 'bg-blue-50 text-blue-900 font-medium shadow-sm'
            : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
        )}
      >
        <Icon className={cn('h-5 w-5 flex-shrink-0', isActive ? 'text-[#053e67]' : 'text-stone-400')} />
        {!collapsed && <span className="text-sm">{item.title}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-white border-r border-stone-200 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Logo - Central Oregon Chiropractic */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-stone-100">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#053e67] flex items-center justify-center">
              <span className="text-white font-bold text-xs">COC</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-stone-800 leading-tight">Central Oregon</span>
              <span className="text-xs text-stone-500 leading-tight">Chiropractic</span>
            </div>
          </Link>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-[#053e67] flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-xs">COC</span>
          </div>
        )}
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="text-stone-400 hover:text-stone-600 hover:bg-stone-100 -mr-2"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {collapsed && (
        <div className="p-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-full text-stone-400 hover:text-stone-600 hover:bg-stone-100"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-6 overflow-y-auto">
        {/* Main Navigation */}
        <div className="space-y-1">
          {groupedItems.main.map(renderNavItem)}
        </div>

        {/* Clinical */}
        {!collapsed && (
          <div>
            <p className="px-3 mb-2 text-xs font-medium text-stone-400 uppercase tracking-wider">
              Clinical
            </p>
            <div className="space-y-1">{groupedItems.clinical.map(renderNavItem)}</div>
          </div>
        )}
        {collapsed && <div className="space-y-1">{groupedItems.clinical.map(renderNavItem)}</div>}

        {/* Financial */}
        {!collapsed && (
          <div>
            <p className="px-3 mb-2 text-xs font-medium text-stone-400 uppercase tracking-wider">
              Financial
            </p>
            <div className="space-y-1">{groupedItems.financial.map(renderNavItem)}</div>
          </div>
        )}
        {collapsed && <div className="space-y-1">{groupedItems.financial.map(renderNavItem)}</div>}

        {/* Other */}
        {!collapsed && (
          <div>
            <p className="px-3 mb-2 text-xs font-medium text-stone-400 uppercase tracking-wider">
              Other
            </p>
            <div className="space-y-1">{groupedItems.other.map(renderNavItem)}</div>
          </div>
        )}
        {collapsed && <div className="space-y-1">{groupedItems.other.map(renderNavItem)}</div>}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-stone-100">
        {!collapsed && (
          <p className="text-xs text-stone-400 text-center">
            ChiroFlow v1.0
          </p>
        )}
      </div>
    </aside>
  );
}
