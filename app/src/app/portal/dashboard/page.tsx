'use client';

/**
 * Epic 14: Patient Portal - Dashboard Page
 * Main dashboard after patient login with warm amber/stone theme
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/trpc/client';
import { format, addDays } from 'date-fns';
import {
  CalendarDays,
  FileText,
  CreditCard,
  MessageSquare,
  FolderOpen,
  ChevronRight,
  Clock,
  AlertCircle,
  Heart,
  Lightbulb,
  User,
  Phone,
  Activity,
} from 'lucide-react';

// Demo data for when API is not available
const DEMO_DATA = {
  upcomingAppointments: 2,
  pendingForms: 1,
  unreadMessages: 3,
  newDocuments: 0,
  outstandingBalance: 125.00,
  nextAppointment: {
    id: 'demo-apt-1',
    startTime: addDays(new Date(), 3).toISOString(),
    endTime: addDays(new Date(), 3).toISOString(),
    appointmentType: { name: 'Adjustment' },
    provider: { title: 'Dr.', firstName: '[DEMO] Sarah', lastName: 'Mitchell' },
  },
  recentVisit: {
    date: addDays(new Date(), -7).toISOString(),
    type: 'Chiropractic Adjustment',
    provider: 'Dr. [DEMO] Sarah Mitchell',
    notes: 'Follow-up adjustment, patient reported significant improvement in lower back pain.',
  },
};

// Health tips for the wellness section
const HEALTH_TIPS = [
  {
    title: 'Stay Hydrated',
    description: 'Drink at least 8 glasses of water daily to keep your spine healthy and maintain joint mobility.',
    icon: Activity,
  },
  {
    title: 'Practice Good Posture',
    description: 'Keep your shoulders back and avoid slouching to reduce strain on your spine.',
    icon: User,
  },
  {
    title: 'Stretch Daily',
    description: 'Take 5-10 minutes each morning to stretch your back, neck, and shoulders.',
    icon: Heart,
  },
];

export default function PortalDashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('[DEMO] Patient');

  useEffect(() => {
    const storedToken = localStorage.getItem('portalToken');
    const storedUser = localStorage.getItem('portalUser');
    setToken(storedToken);

    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUserName(user.patient?.preferredName || user.patient?.firstName || '[DEMO] Patient');
      } catch {
        // Use default name
      }
    }
  }, []);

  const { data: summary, isLoading } = trpc.portal.getDashboardSummary.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Use demo data if no real data
  const displayData = summary || DEMO_DATA;

  if (!token) {
    return null;
  }

  const quickLinks = [
    {
      href: '/portal/appointments',
      icon: CalendarDays,
      label: 'Appointments',
      value: displayData.upcomingAppointments || 0,
      description: 'upcoming',
      color: 'text-[#053e67]',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    {
      href: '/portal/forms',
      icon: FileText,
      label: 'Forms',
      value: displayData.pendingForms || 0,
      description: 'to complete',
      color: 'text-[#053e67]',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    {
      href: '/portal/messages',
      icon: MessageSquare,
      label: 'Messages',
      value: displayData.unreadMessages || 0,
      description: 'unread',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    {
      href: '/portal/documents',
      icon: FolderOpen,
      label: 'Documents',
      value: displayData.newDocuments || 0,
      description: 'new',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Message */}
      <div className="bg-gradient-to-r from-blue-50 to-stone-50 rounded-xl p-6 border border-blue-100">
        <h1 className="text-2xl font-bold text-stone-900">
          Welcome back, {userName}!
        </h1>
        <p className="text-stone-600 mt-1">
          Here is an overview of your health information and upcoming care.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href}>
              <Card className={`hover:shadow-md transition-all cursor-pointer h-full border-stone-200 hover:border-blue-300 hover:bg-blue-50/30`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className={`p-3 rounded-lg ${link.bgColor} ${link.borderColor} border`}>
                      <Icon className={`h-6 w-6 ${link.color}`} />
                    </div>
                    {link.value > 0 && (
                      <Badge className="text-lg font-semibold bg-blue-100 text-blue-800 border-blue-200">
                        {link.value}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-4">
                    <p className="text-sm font-medium text-stone-900">{link.label}</p>
                    <p className="text-sm text-stone-500">
                      {link.value} {link.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Outstanding Balance Alert */}
      {displayData.outstandingBalance > 0 && (
        <Card className="border-blue-300 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-100 rounded-lg border border-blue-200">
                  <CreditCard className="h-6 w-6 text-[#053e67]" />
                </div>
                <div>
                  <p className="font-medium text-blue-900">Outstanding Balance</p>
                  <p className="text-2xl font-bold text-[#053e67]">
                    ${displayData.outstandingBalance.toFixed(2)}
                  </p>
                </div>
              </div>
              <Link href="/portal/billing">
                <Button className="bg-[#053e67] hover:bg-[#053e67] text-white">
                  Make a Payment
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Appointments & Actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Next Appointment */}
          <Card className="border-stone-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center text-stone-900">
                <CalendarDays className="h-5 w-5 mr-2 text-[#053e67]" />
                Your Next Appointment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {displayData.nextAppointment ? (
                <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 bg-stone-50 rounded-lg border border-stone-200">
                  <div className="space-y-2">
                    <div className="flex items-center text-lg font-semibold text-stone-900">
                      <Clock className="h-5 w-5 mr-2 text-stone-500" />
                      {format(new Date(displayData.nextAppointment.startTime), 'EEEE, MMMM d, yyyy')}
                    </div>
                    <p className="text-stone-600">
                      {format(new Date(displayData.nextAppointment.startTime), 'h:mm a')}
                    </p>
                    {displayData.nextAppointment.appointmentType && (
                      <Badge variant="outline" className="border-blue-300 text-[#053e67] bg-blue-50">
                        {displayData.nextAppointment.appointmentType.name}
                      </Badge>
                    )}
                    {displayData.nextAppointment.provider && (
                      <p className="text-sm text-stone-500">
                        with {displayData.nextAppointment.provider.title}{' '}
                        {displayData.nextAppointment.provider.firstName}{' '}
                        {displayData.nextAppointment.provider.lastName}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 md:mt-0 flex gap-2">
                    <Link href="/portal/appointments">
                      <Button variant="outline" className="border-stone-300 hover:bg-stone-100">
                        View All
                      </Button>
                    </Link>
                    <Link href={`/portal/appointments/${displayData.nextAppointment.id}`}>
                      <Button className="bg-[#053e67] hover:bg-[#053e67] text-white">
                        Details
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <CalendarDays className="h-12 w-12 mx-auto text-stone-300 mb-4" />
                  <p className="text-stone-500 mb-4">No upcoming appointments scheduled</p>
                  <Link href="/portal/appointments/request">
                    <Button className="bg-[#053e67] hover:bg-[#053e67] text-white">
                      Request an Appointment
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Items */}
          {((displayData.pendingForms || 0) > 0 || (displayData.unreadMessages || 0) > 0) && (
            <Card className="border-stone-200">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-stone-900">
                  <AlertCircle className="h-5 w-5 mr-2 text-blue-500" />
                  Action Items
                </CardTitle>
                <CardDescription className="text-stone-500">
                  Items that need your attention
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(displayData.pendingForms || 0) > 0 && (
                  <Link href="/portal/forms">
                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200">
                      <div className="flex items-center">
                        <FileText className="h-5 w-5 text-[#053e67] mr-3" />
                        <div>
                          <p className="font-medium text-blue-900">
                            {displayData.pendingForms} form{displayData.pendingForms > 1 ? 's' : ''} to complete
                          </p>
                          <p className="text-sm text-[#053e67]">
                            Please complete your forms before your next visit
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-blue-400" />
                    </div>
                  </Link>
                )}
                {(displayData.unreadMessages || 0) > 0 && (
                  <Link href="/portal/messages">
                    <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors border border-green-200">
                      <div className="flex items-center">
                        <MessageSquare className="h-5 w-5 text-green-600 mr-3" />
                        <div>
                          <p className="font-medium text-green-900">
                            {displayData.unreadMessages} unread message{displayData.unreadMessages > 1 ? 's' : ''}
                          </p>
                          <p className="text-sm text-green-700">
                            You have new messages from your care team
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-green-400" />
                    </div>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent Visit Summary */}
          {DEMO_DATA.recentVisit && (
            <Card className="border-stone-200">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-stone-900">
                  <Activity className="h-5 w-5 mr-2 text-[#053e67]" />
                  Recent Visit Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-stone-50 rounded-lg border border-stone-200">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-stone-900">{DEMO_DATA.recentVisit.type}</p>
                      <p className="text-sm text-stone-500">
                        {format(new Date(DEMO_DATA.recentVisit.date), 'MMMM d, yyyy')}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">
                      Completed
                    </Badge>
                  </div>
                  <p className="text-sm text-stone-600 mb-3">
                    Provider: {DEMO_DATA.recentVisit.provider}
                  </p>
                  <p className="text-sm text-stone-500 italic">
                    {DEMO_DATA.recentVisit.notes}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Quick Actions & Health Tips */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="border-stone-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-stone-900">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/portal/appointments/request">
                <Button variant="outline" className="w-full justify-start border-stone-200 hover:bg-blue-50 hover:border-blue-300 hover:text-[#053e67]">
                  <CalendarDays className="h-4 w-4 mr-3 text-[#053e67]" />
                  Request Appointment
                </Button>
              </Link>
              <Link href="/portal/messages">
                <Button variant="outline" className="w-full justify-start border-stone-200 hover:bg-blue-50 hover:border-blue-300 hover:text-[#053e67]">
                  <MessageSquare className="h-4 w-4 mr-3 text-[#053e67]" />
                  Send Message
                </Button>
              </Link>
              <Link href="/portal/billing">
                <Button variant="outline" className="w-full justify-start border-stone-200 hover:bg-blue-50 hover:border-blue-300 hover:text-[#053e67]">
                  <CreditCard className="h-4 w-4 mr-3 text-[#053e67]" />
                  Make Payment
                </Button>
              </Link>
              <Link href="/portal/documents">
                <Button variant="outline" className="w-full justify-start border-stone-200 hover:bg-blue-50 hover:border-blue-300 hover:text-[#053e67]">
                  <FolderOpen className="h-4 w-4 mr-3 text-[#053e67]" />
                  View Documents
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="border-stone-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center text-stone-900">
                <Phone className="h-5 w-5 mr-2 text-[#053e67]" />
                Contact Us
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
                <p className="font-medium text-stone-900">ChiroFlow Demo Practice</p>
                <p className="text-stone-500">123 Wellness Way</p>
                <p className="text-stone-500">Health City, HC 12345</p>
              </div>
              <div className="flex items-center gap-2 text-stone-600">
                <Phone className="h-4 w-4 text-stone-400" />
                <span>(555) 123-4567</span>
              </div>
              <p className="text-xs text-stone-500">
                For emergencies, please call 911
              </p>
            </CardContent>
          </Card>

          {/* Health Tips */}
          <Card className="border-stone-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center text-stone-900">
                <Lightbulb className="h-5 w-5 mr-2 text-[#053e67]" />
                Wellness Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {HEALTH_TIPS.map((tip, index) => {
                const Icon = tip.icon;
                return (
                  <div key={index} className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-blue-100 rounded-md">
                        <Icon className="h-4 w-4 text-[#053e67]" />
                      </div>
                      <div>
                        <p className="font-medium text-blue-900 text-sm">{tip.title}</p>
                        <p className="text-xs text-[#053e67] mt-1">{tip.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
