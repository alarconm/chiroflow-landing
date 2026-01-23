'use client';

import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  FileText,
  DollarSign,
  Users,
  Plus,
  ArrowRight,
  Clock,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import type { AuthUser } from '@/lib/auth';
import { trpc } from '@/trpc/client';

const quickActions = [
  { label: 'New Appointment', icon: Calendar, href: '/schedule?new=true' },
  { label: 'New Patient', icon: Users, href: '/patients/new' },
  { label: 'Create Claim', icon: FileText, href: '/billing?tab=claims' },
  { label: 'Record Payment', icon: DollarSign, href: '/billing?tab=payments' },
];

function formatTime(date: Date | string) {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getStatusBadge(status: string) {
  const statusMap: Record<string, { bg: string; text: string; label: string }> = {
    scheduled: { bg: 'bg-stone-100', text: 'text-stone-700', label: 'Scheduled' },
    confirmed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Confirmed' },
    checked_in: { bg: 'bg-blue-100', text: 'text-[#053e67]', label: 'Checked In' },
    in_progress: { bg: 'bg-blue-100', text: 'text-[#053e67]', label: 'In Progress' },
  };
  const config = statusMap[status] || statusMap.scheduled;
  return (
    <Badge variant="secondary" className={`${config.bg} ${config.text} hover:${config.bg}`}>
      {config.label}
    </Badge>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as AuthUser | undefined;

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.getStats.useQuery();

  // Fetch upcoming appointments
  const { data: appointments, isLoading: appointmentsLoading } =
    trpc.dashboard.getUpcomingAppointments.useQuery();

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900">
          Welcome back, {user?.firstName ?? 'there'}!
        </h1>
        <p className="text-stone-500 mt-1">
          Here&apos;s what&apos;s happening at your practice today.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-stone-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-stone-500">
              Today&apos;s Appointments
            </CardTitle>
            <Calendar className="h-4 w-4 text-[#053e67]" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
            ) : (
              <>
                <div className="text-2xl font-bold text-stone-900">
                  {stats?.todayAppointments ?? 0}
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  {stats?.totalPatients ?? 0} total patients
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-stone-500">Pending Claims</CardTitle>
            <FileText className="h-4 w-4 text-[#053e67]" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
            ) : (
              <>
                <div className="text-2xl font-bold text-stone-900">{stats?.pendingClaims ?? 0}</div>
                <p className="text-xs text-stone-500 mt-1">Awaiting processing</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-stone-500">Outstanding Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
            ) : (
              <>
                <div className="text-2xl font-bold text-stone-900">
                  ${(stats?.outstandingBalance ?? 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-stone-500 mt-1">From unpaid charges</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-stone-500">
              New Patients (30d)
            </CardTitle>
            <Users className="h-4 w-4 text-[#053e67]" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
            ) : (
              <>
                <div className="text-2xl font-bold text-stone-900">
                  {stats?.recentPatients ?? 0}
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  {stats?.totalPatients ?? 0} total active
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions and upcoming appointments */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick actions */}
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="text-stone-900">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.label}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-stone-200 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    asChild
                  >
                    <a href={action.href}>
                      <Icon className="h-5 w-5 text-[#053e67]" />
                      <span className="text-sm text-stone-700">{action.label}</span>
                    </a>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming appointments */}
        <Card className="border-stone-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-stone-900">Upcoming Appointments</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <a href="/schedule" className="text-[#053e67] hover:text-[#053e67]">
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            {appointmentsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
              </div>
            ) : appointments && appointments.length > 0 ? (
              <div className="space-y-3">
                {appointments.map((apt) => (
                  <Link
                    key={apt.id}
                    href={`/schedule?appointment=${apt.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-sm text-stone-500 min-w-[80px]">
                        <Clock className="h-4 w-4" />
                        {formatTime(apt.time)}
                      </div>
                      <div>
                        <p className="font-medium text-stone-900">{apt.patientName}</p>
                        <p className="text-sm text-stone-500">{apt.type}</p>
                      </div>
                    </div>
                    {getStatusBadge(apt.status)}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-stone-500">
                <Calendar className="h-12 w-12 mx-auto mb-2 text-stone-300" />
                <p>No upcoming appointments today</p>
                <Button variant="link" className="text-[#053e67] mt-2" asChild>
                  <a href="/schedule?new=true">Schedule one now</a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add new patient CTA */}
      <Card className="bg-gradient-to-r from-[#053e67]/80 to-[#053e67] text-white border-0">
        <CardContent className="flex items-center justify-between py-6">
          <div>
            <h3 className="text-xl font-semibold">Ready to add a new patient?</h3>
            <p className="text-blue-100 mt-1">
              Start building your patient roster with our easy onboarding process.
            </p>
          </div>
          <Button
            variant="secondary"
            size="lg"
            className="bg-white text-[#053e67] hover:bg-blue-50"
            asChild
          >
            <a href="/patients/new" className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Patient
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
