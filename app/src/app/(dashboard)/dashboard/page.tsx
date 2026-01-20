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
  TrendingUp,
  Clock,
} from 'lucide-react';
import type { AuthUser } from '@/lib/auth';

// Mock data for dashboard
const mockStats = {
  todayAppointments: 12,
  pendingClaims: 8,
  outstandingBalance: 4250.0,
  recentPatients: 24,
};

const mockQuickActions = [
  { label: 'New Appointment', icon: Calendar, href: '/schedule/new' },
  { label: 'New Patient', icon: Users, href: '/patients/new' },
  { label: 'Create Claim', icon: FileText, href: '/billing/claims/new' },
  { label: 'Record Payment', icon: DollarSign, href: '/billing/payments/new' },
];

const mockUpcomingAppointments = [
  { time: '9:00 AM', patient: 'John Smith', type: 'Adjustment', status: 'confirmed' },
  { time: '10:00 AM', patient: 'Sarah Johnson', type: 'New Patient', status: 'confirmed' },
  { time: '11:00 AM', patient: 'Michael Brown', type: 'Follow-up', status: 'pending' },
  { time: '2:00 PM', patient: 'Emily Davis', type: 'Adjustment', status: 'confirmed' },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as AuthUser | undefined;

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.firstName ?? 'there'}!
        </h1>
        <p className="text-gray-500 mt-1">
          Here&apos;s what&apos;s happening at your practice today.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Today&apos;s Appointments
            </CardTitle>
            <Calendar className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockStats.todayAppointments}</div>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <span className="text-green-500">+2</span> from yesterday
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Pending Claims</CardTitle>
            <FileText className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockStats.pendingClaims}</div>
            <p className="text-xs text-gray-500 mt-1">3 ready to submit</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Outstanding Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${mockStats.outstandingBalance.toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">From 15 patients</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Recent Patients (30d)
            </CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockStats.recentPatients}</div>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <span className="text-green-500">+8%</span> from last month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions and upcoming appointments */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {mockQuickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.label}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-cyan-50 hover:border-cyan-200"
                    asChild
                  >
                    <a href={action.href}>
                      <Icon className="h-5 w-5 text-cyan-600" />
                      <span className="text-sm">{action.label}</span>
                    </a>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming appointments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming Appointments</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <a href="/schedule" className="text-cyan-600 hover:text-cyan-700">
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockUpcomingAppointments.map((apt, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Clock className="h-4 w-4" />
                      {apt.time}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{apt.patient}</p>
                      <p className="text-sm text-gray-500">{apt.type}</p>
                    </div>
                  </div>
                  <Badge
                    variant={apt.status === 'confirmed' ? 'default' : 'secondary'}
                    className={
                      apt.status === 'confirmed'
                        ? 'bg-green-100 text-green-700 hover:bg-green-100'
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100'
                    }
                  >
                    {apt.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add new patient CTA */}
      <Card className="bg-gradient-to-r from-cyan-500 to-teal-500 text-white">
        <CardContent className="flex items-center justify-between py-6">
          <div>
            <h3 className="text-xl font-semibold">Ready to add a new patient?</h3>
            <p className="text-cyan-100 mt-1">
              Start building your patient roster with our easy onboarding process.
            </p>
          </div>
          <Button variant="secondary" size="lg" asChild>
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
