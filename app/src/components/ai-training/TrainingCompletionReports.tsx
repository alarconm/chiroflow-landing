'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Download,
  BarChart3,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Filter,
  Printer,
  Mail,
  PieChart,
  Target,
  Award,
} from 'lucide-react';

interface CompletionReport {
  staffName: string;
  role: string;
  moduleName: string;
  moduleType: string;
  status: 'completed' | 'in_progress' | 'not_started' | 'overdue';
  startDate?: string;
  completedDate?: string;
  dueDate?: string;
  score?: number;
  timeSpent?: number; // minutes
  attempts?: number;
}

interface SummaryStats {
  totalModules: number;
  completedModules: number;
  inProgressModules: number;
  overdueModules: number;
  averageScore: number;
  averageCompletionTime: number; // days
  completionRate: number;
  complianceRate: number;
}

interface ModuleStats {
  moduleName: string;
  completions: number;
  averageScore: number;
  averageTime: number;
  failRate: number;
}

// Demo data
const demoCompletionReports: CompletionReport[] = [
  {
    staffName: 'Sarah Johnson',
    role: 'STAFF',
    moduleName: 'HIPAA Privacy Training',
    moduleType: 'COMPLIANCE',
    status: 'completed',
    startDate: '2024-01-10',
    completedDate: '2024-01-12',
    score: 92,
    timeSpent: 48,
    attempts: 1,
  },
  {
    staffName: 'Sarah Johnson',
    role: 'STAFF',
    moduleName: 'Phone Script Mastery',
    moduleType: 'SKILL_BUILDING',
    status: 'completed',
    startDate: '2024-01-14',
    completedDate: '2024-01-16',
    score: 88,
    timeSpent: 65,
    attempts: 1,
  },
  {
    staffName: 'Mike Chen',
    role: 'STAFF',
    moduleName: 'HIPAA Privacy Training',
    moduleType: 'COMPLIANCE',
    status: 'completed',
    startDate: '2024-01-08',
    completedDate: '2024-01-10',
    score: 85,
    timeSpent: 52,
    attempts: 2,
  },
  {
    staffName: 'Mike Chen',
    role: 'STAFF',
    moduleName: 'EHR System Training',
    moduleType: 'SYSTEM',
    status: 'in_progress',
    startDate: '2024-01-18',
    dueDate: '2024-02-01',
    timeSpent: 45,
    attempts: 1,
  },
  {
    staffName: 'Emily Davis',
    role: 'BILLER',
    moduleName: 'Billing Compliance',
    moduleType: 'COMPLIANCE',
    status: 'overdue',
    startDate: '2024-01-05',
    dueDate: '2024-01-20',
    timeSpent: 30,
    attempts: 1,
  },
  {
    staffName: 'Emily Davis',
    role: 'BILLER',
    moduleName: 'Insurance Verification',
    moduleType: 'SKILL_BUILDING',
    status: 'not_started',
    dueDate: '2024-02-15',
  },
  {
    staffName: 'James Wilson',
    role: 'STAFF',
    moduleName: 'HIPAA Privacy Training',
    moduleType: 'COMPLIANCE',
    status: 'in_progress',
    startDate: '2024-01-15',
    dueDate: '2024-01-30',
    timeSpent: 20,
    attempts: 1,
  },
  {
    staffName: 'James Wilson',
    role: 'STAFF',
    moduleName: 'Front Desk Excellence',
    moduleType: 'SKILL_BUILDING',
    status: 'not_started',
    dueDate: '2024-02-10',
  },
];

const demoSummaryStats: SummaryStats = {
  totalModules: 48,
  completedModules: 32,
  inProgressModules: 8,
  overdueModules: 3,
  averageScore: 87,
  averageCompletionTime: 4.2,
  completionRate: 67,
  complianceRate: 85,
};

const demoModuleStats: ModuleStats[] = [
  { moduleName: 'HIPAA Privacy Training', completions: 24, averageScore: 88, averageTime: 48, failRate: 5 },
  { moduleName: 'Billing Compliance', completions: 12, averageScore: 82, averageTime: 62, failRate: 12 },
  { moduleName: 'EHR System Training', completions: 22, averageScore: 85, averageTime: 115, failRate: 8 },
  { moduleName: 'Phone Script Mastery', completions: 18, averageScore: 79, averageTime: 58, failRate: 15 },
  { moduleName: 'Front Desk Excellence', completions: 16, averageScore: 84, averageTime: 82, failRate: 6 },
];

function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(minutes?: number): string {
  if (!minutes) return '-';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function getStatusBadge(status: CompletionReport['status']) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
    case 'in_progress':
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
    case 'overdue':
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
    case 'not_started':
      return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Not Started</Badge>;
  }
}

function getScoreBadge(score?: number) {
  if (!score) return <span className="text-muted-foreground">-</span>;
  if (score >= 90) return <Badge className="bg-green-600">{score}%</Badge>;
  if (score >= 70) return <Badge className="bg-yellow-500 text-white">{score}%</Badge>;
  return <Badge variant="destructive">{score}%</Badge>;
}

function getModuleTypeBadge(type: string) {
  const colors: Record<string, string> = {
    COMPLIANCE: 'bg-blue-100 text-blue-700',
    SKILL_BUILDING: 'bg-green-100 text-green-700',
    ONBOARDING: 'bg-purple-100 text-purple-700',
    SYSTEM: 'bg-orange-100 text-orange-700',
  };

  const labels: Record<string, string> = {
    COMPLIANCE: 'Compliance',
    SKILL_BUILDING: 'Skill Building',
    ONBOARDING: 'Onboarding',
    SYSTEM: 'System',
  };

  return (
    <Badge className={colors[type] || 'bg-gray-100 text-gray-700'}>
      {labels[type] || type}
    </Badge>
  );
}

interface TrainingCompletionReportsProps {
  showDemoData?: boolean;
}

export function TrainingCompletionReports({ showDemoData = true }: TrainingCompletionReportsProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [moduleTypeFilter, setModuleTypeFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState('30');

  // Use demo data
  const reports = showDemoData ? demoCompletionReports : [];
  const stats = showDemoData ? demoSummaryStats : null;
  const moduleStats = showDemoData ? demoModuleStats : [];
  const isLoading = false;

  // Apply filters
  const filteredReports = reports.filter((report) => {
    if (statusFilter !== 'all' && report.status !== statusFilter) return false;
    if (moduleTypeFilter !== 'all' && report.moduleType !== moduleTypeFilter) return false;
    if (roleFilter !== 'all' && report.role !== roleFilter) return false;
    return true;
  });

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
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      {stats && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Completion Rate</p>
                  <p className="text-2xl font-bold">{stats.completionRate}%</p>
                </div>
              </div>
              <Progress value={stats.completionRate} className="mt-2 h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Avg Score</p>
                  <p className="text-2xl font-bold">{stats.averageScore}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Avg Completion</p>
                  <p className="text-2xl font-bold">{stats.averageCompletionTime} days</p>
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
                  <p className="text-2xl font-bold">{stats.overdueModules}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Module Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Module Performance Summary
          </CardTitle>
          <CardDescription>Performance metrics by training module</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Completions</TableHead>
                <TableHead>Avg Score</TableHead>
                <TableHead>Avg Time</TableHead>
                <TableHead>Fail Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moduleStats.map((module) => (
                <TableRow key={module.moduleName}>
                  <TableCell className="font-medium">{module.moduleName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      {module.completions}
                    </div>
                  </TableCell>
                  <TableCell>{getScoreBadge(module.averageScore)}</TableCell>
                  <TableCell>{formatDuration(module.averageTime)}</TableCell>
                  <TableCell>
                    <span className={module.failRate > 10 ? 'text-red-600' : 'text-muted-foreground'}>
                      {module.failRate}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detailed Report */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Training Completion Reports
              </CardTitle>
              <CardDescription>Detailed view of all training completions</CardDescription>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button variant="outline" size="sm">
                <Mail className="h-4 w-4 mr-2" />
                Email Report
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mt-4 flex-wrap">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
              </SelectContent>
            </Select>

            <Select value={moduleTypeFilter} onValueChange={setModuleTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Module Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="COMPLIANCE">Compliance</SelectItem>
                <SelectItem value="SKILL_BUILDING">Skill Building</SelectItem>
                <SelectItem value="ONBOARDING">Onboarding</SelectItem>
                <SelectItem value="SYSTEM">System</SelectItem>
              </SelectContent>
            </Select>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[120px]">
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

            <Button variant="ghost" size="sm" onClick={() => {
              setStatusFilter('all');
              setModuleTypeFilter('all');
              setRoleFilter('all');
            }}>
              <Filter className="h-4 w-4 mr-1" />
              Clear Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Time Spent</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report, index) => (
                <TableRow key={`${report.staffName}-${report.moduleName}-${index}`}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{report.staffName}</p>
                      <Badge variant="outline" className="text-xs">
                        {report.role}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{report.moduleName}</TableCell>
                  <TableCell>{getModuleTypeBadge(report.moduleType)}</TableCell>
                  <TableCell>{getStatusBadge(report.status)}</TableCell>
                  <TableCell>{getScoreBadge(report.score)}</TableCell>
                  <TableCell>{formatDuration(report.timeSpent)}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {report.completedDate ? (
                        <span className="text-green-600">{formatDate(report.completedDate)}</span>
                      ) : report.dueDate ? (
                        <span className={report.status === 'overdue' ? 'text-red-600' : 'text-muted-foreground'}>
                          Due: {formatDate(report.dueDate)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {filteredReports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No reports found matching your filters</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
