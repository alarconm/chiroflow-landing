'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  GraduationCap,
  Award,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Star,
} from 'lucide-react';
interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  onboardingProgress: number;
  completedModules: number;
  totalModules: number;
  averageScore: number;
  lastActivity?: string;
  certificationStatus: 'current' | 'expiring' | 'expired';
}

// Demo data for training progress
const demoStaffProgress: StaffMember[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    email: 'sarah@clinic.com',
    role: 'STAFF',
    onboardingProgress: 100,
    completedModules: 12,
    totalModules: 12,
    averageScore: 92,
    lastActivity: '2 hours ago',
    certificationStatus: 'current',
  },
  {
    id: '2',
    name: 'Mike Chen',
    email: 'mike@clinic.com',
    role: 'STAFF',
    onboardingProgress: 75,
    completedModules: 9,
    totalModules: 12,
    averageScore: 85,
    lastActivity: '1 day ago',
    certificationStatus: 'current',
  },
  {
    id: '3',
    name: 'Emily Davis',
    email: 'emily@clinic.com',
    role: 'BILLER',
    onboardingProgress: 45,
    completedModules: 5,
    totalModules: 10,
    averageScore: 78,
    lastActivity: '3 days ago',
    certificationStatus: 'expiring',
  },
  {
    id: '4',
    name: 'James Wilson',
    email: 'james@clinic.com',
    role: 'STAFF',
    onboardingProgress: 20,
    completedModules: 2,
    totalModules: 12,
    averageScore: 65,
    lastActivity: '1 week ago',
    certificationStatus: 'expired',
  },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getRoleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'PROVIDER':
    case 'OWNER':
      return 'default';
    case 'ADMIN':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getCertificationBadge(status: StaffMember['certificationStatus']) {
  switch (status) {
    case 'current':
      return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Current</Badge>;
    case 'expiring':
      return <Badge variant="secondary" className="bg-yellow-500 text-white"><AlertTriangle className="h-3 w-3 mr-1" />Expiring</Badge>;
    case 'expired':
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Expired</Badge>;
  }
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  return 'text-red-600';
}

interface StaffProgressOverviewProps {
  showDemoData?: boolean;
}

export function StaffProgressOverview({ showDemoData = true }: StaffProgressOverviewProps) {
  // Use demo data for now - in production, this would fetch from getStats
  const staffData = showDemoData ? demoStaffProgress : [];
  const isLoading = false;

  // Calculate summary stats
  const totalStaff = staffData.length;
  const fullyTrained = staffData.filter((s) => s.onboardingProgress === 100).length;
  const avgScore = staffData.length > 0
    ? Math.round(staffData.reduce((acc, s) => acc + s.averageScore, 0) / staffData.length)
    : 0;
  const needsAttention = staffData.filter(
    (s) => s.certificationStatus !== 'current' || s.onboardingProgress < 50
  ).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Staff</p>
                <p className="text-2xl font-bold">{totalStaff}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Fully Trained</p>
                <p className="text-2xl font-bold">{fullyTrained}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Score</p>
                <p className="text-2xl font-bold">{avgScore}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">Need Attention</p>
                <p className="text-2xl font-bold">{needsAttention}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff Training Progress
          </CardTitle>
          <CardDescription>Overview of all staff members training status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {staffData.map((staff) => (
              <div
                key={staff.id}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Avatar className="h-10 w-10">
                  {staff.avatar && <AvatarImage src={staff.avatar} alt={staff.name} />}
                  <AvatarFallback>{getInitials(staff.name)}</AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate">{staff.name}</p>
                    <Badge variant={getRoleBadgeVariant(staff.role)} className="text-xs">
                      {staff.role}
                    </Badge>
                    {getCertificationBadge(staff.certificationStatus)}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      {staff.completedModules}/{staff.totalModules} modules
                    </span>
                    <span className={`flex items-center gap-1 ${getScoreColor(staff.averageScore)}`}>
                      <TrendingUp className="h-3 w-3" />
                      {staff.averageScore}% avg
                    </span>
                    {staff.lastActivity && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {staff.lastActivity}
                      </span>
                    )}
                  </div>

                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>Onboarding Progress</span>
                      <span>{staff.onboardingProgress}%</span>
                    </div>
                    <Progress value={staff.onboardingProgress} className="h-2" />
                  </div>
                </div>
              </div>
            ))}

            {staffData.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No staff members found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
