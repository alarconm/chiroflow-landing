'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Rocket,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Target,
  ChevronRight,
  BookOpen,
  TrendingUp,
  Eye,
  MessageSquare,
  Play,
} from 'lucide-react';

interface OnboardingEmployee {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  startDate: string;
  expectedCompletionDate: string;
  status: 'in_progress' | 'completed' | 'overdue';
  progress: number;
  currentModule?: {
    id: string;
    name: string;
    progress: number;
  };
  completedModules: number;
  totalModules: number;
  averageScore: number;
  daysInOnboarding: number;
  checkpoints: {
    name: string;
    completedAt?: string;
    score?: number;
  }[];
}

// Demo data for onboarding pipeline
const demoOnboardingEmployees: OnboardingEmployee[] = [
  {
    id: '1',
    name: 'Alex Rodriguez',
    email: 'alex@clinic.com',
    role: 'STAFF',
    startDate: '2024-01-15',
    expectedCompletionDate: '2024-02-15',
    status: 'in_progress',
    progress: 65,
    currentModule: {
      id: 'mod-4',
      name: 'Phone Script Mastery',
      progress: 40,
    },
    completedModules: 5,
    totalModules: 8,
    averageScore: 88,
    daysInOnboarding: 7,
    checkpoints: [
      { name: 'Orientation Complete', completedAt: '2024-01-16', score: 100 },
      { name: 'System Training', completedAt: '2024-01-18', score: 92 },
      { name: 'HIPAA Certification', completedAt: '2024-01-19', score: 88 },
      { name: 'Phone Scripts', completedAt: undefined },
      { name: 'Practice Sessions', completedAt: undefined },
    ],
  },
  {
    id: '2',
    name: 'Jessica Park',
    email: 'jessica@clinic.com',
    role: 'BILLER',
    startDate: '2024-01-08',
    expectedCompletionDate: '2024-02-08',
    status: 'in_progress',
    progress: 85,
    currentModule: {
      id: 'mod-7',
      name: 'Claims Processing',
      progress: 70,
    },
    completedModules: 6,
    totalModules: 7,
    averageScore: 94,
    daysInOnboarding: 14,
    checkpoints: [
      { name: 'Orientation Complete', completedAt: '2024-01-09', score: 100 },
      { name: 'System Training', completedAt: '2024-01-11', score: 95 },
      { name: 'Billing Compliance', completedAt: '2024-01-15', score: 92 },
      { name: 'Insurance Verification', completedAt: '2024-01-18', score: 96 },
      { name: 'Claims Processing', completedAt: undefined },
    ],
  },
  {
    id: '3',
    name: 'David Kim',
    email: 'david@clinic.com',
    role: 'STAFF',
    startDate: '2024-01-02',
    expectedCompletionDate: '2024-01-25',
    status: 'overdue',
    progress: 50,
    currentModule: {
      id: 'mod-3',
      name: 'HIPAA Training',
      progress: 20,
    },
    completedModules: 3,
    totalModules: 8,
    averageScore: 72,
    daysInOnboarding: 20,
    checkpoints: [
      { name: 'Orientation Complete', completedAt: '2024-01-03', score: 85 },
      { name: 'System Training', completedAt: '2024-01-08', score: 78 },
      { name: 'HIPAA Certification', completedAt: undefined },
      { name: 'Phone Scripts', completedAt: undefined },
      { name: 'Practice Sessions', completedAt: undefined },
    ],
  },
  {
    id: '4',
    name: 'Maria Santos',
    email: 'maria@clinic.com',
    role: 'STAFF',
    startDate: '2023-12-15',
    expectedCompletionDate: '2024-01-15',
    status: 'completed',
    progress: 100,
    currentModule: undefined,
    completedModules: 8,
    totalModules: 8,
    averageScore: 91,
    daysInOnboarding: 28,
    checkpoints: [
      { name: 'Orientation Complete', completedAt: '2023-12-16', score: 100 },
      { name: 'System Training', completedAt: '2023-12-20', score: 88 },
      { name: 'HIPAA Certification', completedAt: '2023-12-22', score: 92 },
      { name: 'Phone Scripts', completedAt: '2024-01-02', score: 86 },
      { name: 'Practice Sessions', completedAt: '2024-01-10', score: 95 },
    ],
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusBadge(status: OnboardingEmployee['status']) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
    case 'in_progress':
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
    case 'overdue':
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
  }
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

interface EmployeeDetailsDialogProps {
  employee: OnboardingEmployee;
}

function EmployeeDetailsDialog({ employee }: EmployeeDetailsDialogProps) {
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            {employee.avatar && <AvatarImage src={employee.avatar} alt={employee.name} />}
            <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
          </Avatar>
          {employee.name}
        </DialogTitle>
        <DialogDescription>
          {employee.role} • Started {formatDate(employee.startDate)}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Progress Overview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm font-bold">{employee.progress}%</span>
          </div>
          <Progress value={employee.progress} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{employee.completedModules} of {employee.totalModules} modules completed</span>
            <span>{employee.daysInOnboarding} days in onboarding</span>
          </div>
        </div>

        {/* Current Module */}
        {employee.currentModule && (
          <div className="bg-muted p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="font-medium">Currently Working On</span>
              </div>
              <Button size="sm">
                <Play className="h-4 w-4 mr-1" />
                Continue
              </Button>
            </div>
            <p className="text-sm mb-2">{employee.currentModule.name}</p>
            <Progress value={employee.currentModule.progress} className="h-2" />
          </div>
        )}

        {/* Checkpoints */}
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <Target className="h-4 w-4" />
            Progress Checkpoints
          </h4>

          <div className="space-y-2">
            {employee.checkpoints.map((checkpoint, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  checkpoint.completedAt ? 'bg-green-50 border-green-200' : 'bg-muted'
                }`}
              >
                <div className="flex items-center gap-3">
                  {checkpoint.completedAt ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                  )}
                  <span className={checkpoint.completedAt ? 'text-green-700' : 'text-muted-foreground'}>
                    {checkpoint.name}
                  </span>
                </div>

                {checkpoint.completedAt && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{formatDate(checkpoint.completedAt)}</span>
                    {checkpoint.score && (
                      <Badge variant="outline" className="text-green-600">
                        {checkpoint.score}%
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{employee.averageScore}%</p>
            <p className="text-xs text-muted-foreground">Average Score</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{employee.daysInOnboarding}</p>
            <p className="text-xs text-muted-foreground">Days in Onboarding</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{employee.completedModules}/{employee.totalModules}</p>
            <p className="text-xs text-muted-foreground">Modules Completed</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button variant="outline" className="flex-1">
            <MessageSquare className="h-4 w-4 mr-2" />
            Send Message
          </Button>
          <Button className="flex-1">
            <TrendingUp className="h-4 w-4 mr-2" />
            View Full Report
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

interface OnboardingPipelineProps {
  showDemoData?: boolean;
}

export function OnboardingPipeline({ showDemoData = true }: OnboardingPipelineProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Use demo data
  const employees = showDemoData ? demoOnboardingEmployees : [];
  const isLoading = false;

  // Apply filters
  const filteredEmployees = employees.filter((emp) => {
    if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
    if (roleFilter !== 'all' && emp.role !== roleFilter) return false;
    return true;
  });

  // Calculate summary stats
  const totalInOnboarding = employees.filter((e) => e.status === 'in_progress').length;
  const overdueCount = employees.filter((e) => e.status === 'overdue').length;
  const completedThisMonth = employees.filter((e) => e.status === 'completed').length;
  const avgDaysToComplete = employees
    .filter((e) => e.status === 'completed')
    .reduce((acc, e) => acc + e.daysInOnboarding, 0) / (completedThisMonth || 1);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
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
              <Rocket className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">In Onboarding</p>
                <p className="text-2xl font-bold">{totalInOnboarding}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold">{overdueCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{completedThisMonth}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Days</p>
                <p className="text-2xl font-bold">{Math.round(avgDaysToComplete)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline View */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                Onboarding Pipeline
              </CardTitle>
              <CardDescription>Track new employee onboarding progress</CardDescription>
            </div>

            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="BILLER">Biller</SelectItem>
                  <SelectItem value="PROVIDER">Provider</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredEmployees.map((employee) => (
              <div
                key={employee.id}
                className={`p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                  employee.status === 'overdue' ? 'border-red-200 bg-red-50' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      {employee.avatar && <AvatarImage src={employee.avatar} alt={employee.name} />}
                      <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold">{employee.name}</p>
                        <Badge variant={getRoleBadgeVariant(employee.role)} className="text-xs">
                          {employee.role}
                        </Badge>
                        {getStatusBadge(employee.status)}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Started {formatDate(employee.startDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {employee.daysInOnboarding} days
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {employee.averageScore}% avg
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="max-w-md">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span>{employee.completedModules}/{employee.totalModules} modules</span>
                          <span className="font-medium">{employee.progress}%</span>
                        </div>
                        <Progress
                          value={employee.progress}
                          className={`h-2 ${employee.status === 'overdue' ? '[&>div]:bg-red-500' : ''}`}
                        />
                      </div>

                      {/* Current module */}
                      {employee.currentModule && (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <BookOpen className="h-3 w-3" />
                          Currently: {employee.currentModule.name} ({employee.currentModule.progress}%)
                        </p>
                      )}
                    </div>
                  </div>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <EmployeeDetailsDialog employee={employee} />
                  </Dialog>
                </div>
              </div>
            ))}

            {filteredEmployees.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Rocket className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No employees in onboarding</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
