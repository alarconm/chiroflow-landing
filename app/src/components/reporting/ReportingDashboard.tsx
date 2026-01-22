'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  LayoutDashboard,
  User,
  DollarSign,
  Clock,
  Target,
  TableProperties,
  Calendar,
  Download,
  FileText,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Users,
  Activity,
  Stethoscope,
  ClipboardList,
  BarChart3,
  PieChart,
  LineChart,
  CheckCircle2,
  XCircle,
  Percent,
  UserPlus,
  UserCheck,
  CalendarCheck,
  CalendarX,
  Receipt,
  CreditCard,
  FileBarChart,
  RefreshCw,
} from 'lucide-react';
import { DashboardOverview } from './DashboardOverview';
import { WidgetConfigurator } from './WidgetConfigurator';
import { ProviderProductionReport } from './ProviderProductionReport';
import { CollectionsReport } from './CollectionsReport';
import { ARAgingReport } from './ARAgingReport';
import { KPIDashboard } from './KPIDashboard';
import { CustomReportBuilder } from './CustomReportBuilder';
import { ReportScheduler } from './ReportScheduler';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';

// Demo data for charts and reports
const DEMO_REVENUE_BY_PROVIDER = [
  { provider: '[DEMO] Dr. Sarah Johnson', revenue: 45230, visits: 312, avgPerVisit: 145.00 },
  { provider: '[DEMO] Dr. Michael Chen', revenue: 38450, visits: 276, avgPerVisit: 139.31 },
  { provider: '[DEMO] Dr. Emily Williams', revenue: 32180, visits: 234, avgPerVisit: 137.52 },
  { provider: '[DEMO] Dr. Robert Davis', revenue: 28900, visits: 198, avgPerVisit: 145.96 },
];

const DEMO_REVENUE_BY_SERVICE = [
  { service: '[DEMO] Chiropractic Adjustment', revenue: 68420, count: 856, percentage: 47.2 },
  { service: '[DEMO] Therapeutic Exercise', revenue: 32150, count: 412, percentage: 22.2 },
  { service: '[DEMO] Manual Therapy', revenue: 24680, count: 287, percentage: 17.0 },
  { service: '[DEMO] Initial Evaluation', revenue: 12340, count: 89, percentage: 8.5 },
  { service: '[DEMO] Re-evaluation', revenue: 7170, count: 76, percentage: 5.1 },
];

const DEMO_DIAGNOSIS_FREQUENCY = [
  { diagnosis: '[DEMO] M54.5 - Low back pain', count: 234, percentage: 28.5 },
  { diagnosis: '[DEMO] M54.2 - Cervicalgia', count: 189, percentage: 23.0 },
  { diagnosis: '[DEMO] M25.511 - Shoulder pain', count: 145, percentage: 17.6 },
  { diagnosis: '[DEMO] M79.3 - Extremity pain', count: 112, percentage: 13.6 },
  { diagnosis: '[DEMO] M62.830 - Muscle spasm', count: 98, percentage: 11.9 },
  { diagnosis: '[DEMO] G89.29 - Chronic pain', count: 44, percentage: 5.4 },
];

const DEMO_APPOINTMENT_UTILIZATION = [
  { day: 'Monday', scheduled: 48, completed: 44, noShow: 3, cancelled: 1, utilization: 91.7 },
  { day: 'Tuesday', scheduled: 52, completed: 48, noShow: 2, cancelled: 2, utilization: 92.3 },
  { day: 'Wednesday', scheduled: 50, completed: 47, noShow: 2, cancelled: 1, utilization: 94.0 },
  { day: 'Thursday', scheduled: 45, completed: 41, noShow: 3, cancelled: 1, utilization: 91.1 },
  { day: 'Friday', scheduled: 40, completed: 38, noShow: 1, cancelled: 1, utilization: 95.0 },
];

const DEMO_MONTHLY_TRENDS = [
  { month: 'Jul', revenue: 128450, visits: 892, newPatients: 45, retention: 82 },
  { month: 'Aug', revenue: 134200, visits: 923, newPatients: 52, retention: 84 },
  { month: 'Sep', revenue: 141800, visits: 978, newPatients: 48, retention: 83 },
  { month: 'Oct', revenue: 138900, visits: 945, newPatients: 51, retention: 85 },
  { month: 'Nov', revenue: 145600, visits: 1012, newPatients: 56, retention: 86 },
  { month: 'Dec', revenue: 144760, visits: 1020, newPatients: 54, retention: 85 },
];

export function ReportingDashboard() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });
  const [isExporting, setIsExporting] = useState(false);

  // Fetch dashboard metrics
  const { data: dashboardData, isLoading: dashboardLoading } = trpc.reporting.getDashboard.useQuery({
    date: dateRange?.from || new Date(),
  });

  // Export mutation
  const exportMutation = trpc.reporting.exportReport.useMutation({
    onSuccess: () => {
      toast.success('Export started. You will be notified when ready.');
      setIsExporting(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsExporting(false);
    },
  });

  const handleExport = (format: 'CSV' | 'PDF' | 'EXCEL') => {
    setIsExporting(true);
    exportMutation.mutate({
      reportType: 'DASHBOARD',
      format,
      parameters: {
        startDate: dateRange?.from?.toISOString(),
        endDate: dateRange?.to?.toISOString(),
        tab: activeTab,
      },
    });
  };

  // Summary metrics from dashboard data or demo
  const summaryMetrics = useMemo(() => {
    if (dashboardData) {
      return {
        totalRevenue: dashboardData.todayRevenue || 144760,
        totalVisits: dashboardData.todayVisits || 1020,
        newPatients: dashboardData.todayNewPatients || 54,
        collectionRate: dashboardData.collectionRate || 92.5,
        outstandingAR: dashboardData.totalAR || 48230,
        noShowRate: 4.2,
        avgDaysToCollect: dashboardData.avgDaysToCollect || 32,
        pendingClaims: dashboardData.pendingClaims || 127,
      };
    }
    return {
      totalRevenue: 144760,
      totalVisits: 1020,
      newPatients: 54,
      collectionRate: 92.5,
      outstandingAR: 48230,
      noShowRate: 4.2,
      avgDaysToCollect: 32,
      pendingClaims: 127,
    };
  }, [dashboardData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Reporting & Analytics</h1>
          <p className="text-stone-500 mt-1">
            Track performance metrics, generate reports, and monitor practice KPIs
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('CSV')}
              disabled={isExporting}
              className="border-stone-300 hover:bg-stone-100"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('PDF')}
              disabled={isExporting}
              className="border-stone-300 hover:bg-stone-100"
            >
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <WidgetConfigurator />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        <Card className="col-span-2 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#053e67]">Monthly Revenue</p>
                {dashboardLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-blue-900">
                    ${summaryMetrics.totalRevenue.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="p-3 bg-blue-200/50 rounded-full">
                <DollarSign className="h-6 w-6 text-[#053e67]" />
              </div>
            </div>
            <div className="flex items-center mt-3 text-xs text-[#053e67]">
              <TrendingUp className="h-3 w-3 mr-1" />
              <span>+8.2% from last month [DEMO]</span>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 bg-gradient-to-br from-stone-50 to-stone-100 border-stone-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-stone-600">Total Visits</p>
                {dashboardLoading ? (
                  <Skeleton className="h-8 w-20 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-stone-900">{summaryMetrics.totalVisits}</p>
                )}
              </div>
              <div className="p-3 bg-stone-200/50 rounded-full">
                <Users className="h-6 w-6 text-stone-600" />
              </div>
            </div>
            <div className="flex items-center mt-3 text-xs text-stone-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              <span>+5.4% from last month [DEMO]</span>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">Collection Rate</p>
                {dashboardLoading ? (
                  <Skeleton className="h-8 w-20 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-green-900">
                    {summaryMetrics.collectionRate.toFixed(1)}%
                  </p>
                )}
              </div>
              <div className="p-3 bg-green-200/50 rounded-full">
                <Percent className="h-6 w-6 text-green-700" />
              </div>
            </div>
            <Progress value={summaryMetrics.collectionRate} className="mt-3 h-1.5" />
          </CardContent>
        </Card>

        <Card className="col-span-2 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#053e67]">New Patients</p>
                {dashboardLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-blue-900">{summaryMetrics.newPatients}</p>
                )}
              </div>
              <div className="p-3 bg-blue-200/50 rounded-full">
                <UserPlus className="h-6 w-6 text-[#053e67]" />
              </div>
            </div>
            <div className="flex items-center mt-3 text-xs text-[#053e67]">
              <TrendingDown className="h-3 w-3 mr-1" />
              <span>-3.6% from last month [DEMO]</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 lg:grid-cols-9 bg-stone-100">
          <TabsTrigger value="analytics" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="financial" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Financial</span>
          </TabsTrigger>
          <TabsTrigger value="clinical" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
            <Stethoscope className="h-4 w-4" />
            <span className="hidden sm:inline">Clinical</span>
          </TabsTrigger>
          <TabsTrigger value="operational" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Operational</span>
          </TabsTrigger>
          <TabsTrigger value="kpis" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">KPIs</span>
          </TabsTrigger>
          <TabsTrigger value="builder" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
            <TableProperties className="h-4 w-4" />
            <span className="hidden sm:inline">Builder</span>
          </TabsTrigger>
          <TabsTrigger value="scheduler" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Scheduler</span>
          </TabsTrigger>
          <TabsTrigger value="saved" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
            <FileBarChart className="h-4 w-4" />
            <span className="hidden sm:inline">Saved</span>
          </TabsTrigger>
        </TabsList>

        {/* Analytics Tab (US-107) */}
        <TabsContent value="analytics" className="space-y-6 mt-6">
          <AnalyticsDashboard />
        </TabsContent>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <DashboardOverview startDate={dateRange?.from} endDate={dateRange?.to} />

          {/* Quick Stats Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Monthly Revenue Trend Chart Placeholder */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChart className="h-5 w-5 text-[#053e67]" />
                  Revenue Trend
                </CardTitle>
                <CardDescription>[DEMO] Monthly revenue over the last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] bg-gradient-to-br from-stone-50 to-stone-100 rounded-lg flex items-center justify-center border border-dashed border-stone-300">
                  <div className="text-center text-stone-500">
                    <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Revenue Chart</p>
                    <p className="text-xs text-stone-400">[DEMO] Chart visualization area</p>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-2 mt-4">
                  {DEMO_MONTHLY_TRENDS.map((month) => (
                    <div key={month.month} className="text-center">
                      <p className="text-xs text-stone-500">{month.month}</p>
                      <p className="text-sm font-semibold text-stone-700">
                        ${(month.revenue / 1000).toFixed(0)}k
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Visits by Type Chart Placeholder */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-[#053e67]" />
                  Revenue by Service
                </CardTitle>
                <CardDescription>[DEMO] Distribution of revenue across service types</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] bg-gradient-to-br from-stone-50 to-stone-100 rounded-lg flex items-center justify-center border border-dashed border-stone-300">
                  <div className="text-center text-stone-500">
                    <PieChart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Service Distribution</p>
                    <p className="text-xs text-stone-400">[DEMO] Pie chart visualization</p>
                  </div>
                </div>
                <div className="space-y-2 mt-4">
                  {DEMO_REVENUE_BY_SERVICE.slice(0, 3).map((service, idx) => (
                    <div key={service.service} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                          idx === 0 ? 'bg-blue-500' : idx === 1 ? 'bg-blue-400' : 'bg-blue-300'
                        }`} />
                        <span className="text-stone-600 truncate max-w-[200px]">{service.service}</span>
                      </div>
                      <span className="font-medium text-stone-900">{service.percentage}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Financial Reports Tab */}
        <TabsContent value="financial" className="space-y-6 mt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-[#053e67] mb-2">
                  <Receipt className="h-4 w-4" />
                  <span className="text-sm font-medium">Outstanding A/R</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">
                  ${summaryMetrics.outstandingAR.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-700 mb-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Avg Days to Collect</span>
                </div>
                <p className="text-2xl font-bold text-green-900">{summaryMetrics.avgDaysToCollect} days</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-[#053e67] mb-2">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">Pending Claims</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">{summaryMetrics.pendingClaims}</p>
              </CardContent>
            </Card>
            <Card className="bg-stone-50 border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-stone-600 mb-2">
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm font-medium">Payment Methods</span>
                </div>
                <p className="text-2xl font-bold text-stone-900">4 types</p>
              </CardContent>
            </Card>
          </div>

          {/* Provider Production Report */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-[#053e67]" />
                    Revenue by Provider
                  </CardTitle>
                  <CardDescription>[DEMO] Provider production for the selected period</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleExport('CSV')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-stone-50">
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Avg/Visit</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DEMO_REVENUE_BY_PROVIDER.map((provider) => {
                    const totalRevenue = DEMO_REVENUE_BY_PROVIDER.reduce((sum, p) => sum + p.revenue, 0);
                    const percentage = (provider.revenue / totalRevenue) * 100;
                    return (
                      <TableRow key={provider.provider}>
                        <TableCell className="font-medium">{provider.provider}</TableCell>
                        <TableCell className="text-right">
                          ${provider.revenue.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">{provider.visits}</TableCell>
                        <TableCell className="text-right">${provider.avgPerVisit.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={percentage} className="w-16 h-2" />
                            <span className="w-12 text-right">{percentage.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Collections Report */}
          <CollectionsReport />

          {/* A/R Aging Report */}
          <ARAgingReport />
        </TabsContent>

        {/* Clinical Reports Tab */}
        <TabsContent value="clinical" className="space-y-6 mt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-purple-700 mb-2">
                  <Stethoscope className="h-4 w-4" />
                  <span className="text-sm font-medium">Total Encounters</span>
                </div>
                <p className="text-2xl font-bold text-purple-900">1,248 [DEMO]</p>
              </CardContent>
            </Card>
            <Card className="bg-indigo-50 border-indigo-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-indigo-700 mb-2">
                  <ClipboardList className="h-4 w-4" />
                  <span className="text-sm font-medium">Unique Diagnoses</span>
                </div>
                <p className="text-2xl font-bold text-indigo-900">42 [DEMO]</p>
              </CardContent>
            </Card>
            <Card className="bg-[#053e67]/5 border-[#053e67]/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-[#053e67] mb-2">
                  <Target className="h-4 w-4" />
                  <span className="text-sm font-medium">Avg Treatment Sessions</span>
                </div>
                <p className="text-2xl font-bold text-[#053e67]">8.4 [DEMO]</p>
              </CardContent>
            </Card>
          </div>

          {/* Diagnosis Frequency Report */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-[#053e67]" />
                    Diagnosis Frequency
                  </CardTitle>
                  <CardDescription>[DEMO] Most common diagnoses for the selected period</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleExport('CSV')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-stone-50">
                    <TableHead>Diagnosis Code & Description</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                    <TableHead className="w-[200px]">Distribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DEMO_DIAGNOSIS_FREQUENCY.map((diagnosis) => (
                    <TableRow key={diagnosis.diagnosis}>
                      <TableCell className="font-medium">{diagnosis.diagnosis}</TableCell>
                      <TableCell className="text-right">{diagnosis.count}</TableCell>
                      <TableCell className="text-right">{diagnosis.percentage.toFixed(1)}%</TableCell>
                      <TableCell>
                        <Progress value={diagnosis.percentage} className="h-2" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Treatment Effectiveness Chart Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#053e67]" />
                Treatment Effectiveness
              </CardTitle>
              <CardDescription>[DEMO] Patient outcomes and progress metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] bg-gradient-to-br from-stone-50 to-stone-100 rounded-lg flex items-center justify-center border border-dashed border-stone-300">
                <div className="text-center text-stone-500">
                  <BarChart3 className="h-16 w-16 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">Treatment Outcomes Chart</p>
                  <p className="text-sm text-stone-400">[DEMO] Visualization showing patient progress metrics</p>
                  <div className="flex justify-center gap-6 mt-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">78%</p>
                      <p className="text-xs text-stone-500">Goals Met</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-[#053e67]">6.2</p>
                      <p className="text-xs text-stone-500">Avg Sessions to Goal</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-[#053e67]">92%</p>
                      <p className="text-xs text-stone-500">Patient Satisfaction</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Provider Productivity */}
          <ProviderProductionReport />
        </TabsContent>

        {/* Operational Reports Tab */}
        <TabsContent value="operational" className="space-y-6 mt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-700 mb-2">
                  <CalendarCheck className="h-4 w-4" />
                  <span className="text-sm font-medium">Appointment Utilization</span>
                </div>
                <p className="text-2xl font-bold text-green-900">92.8% [DEMO]</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-700 mb-2">
                  <CalendarX className="h-4 w-4" />
                  <span className="text-sm font-medium">No-Show Rate</span>
                </div>
                <p className="text-2xl font-bold text-red-900">{summaryMetrics.noShowRate}% [DEMO]</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-[#053e67] mb-2">
                  <UserPlus className="h-4 w-4" />
                  <span className="text-sm font-medium">New Patient Acquisition</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">{summaryMetrics.newPatients} [DEMO]</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-[#053e67] mb-2">
                  <UserCheck className="h-4 w-4" />
                  <span className="text-sm font-medium">Patient Retention</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">85% [DEMO]</p>
              </CardContent>
            </Card>
          </div>

          {/* Appointment Utilization Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-[#053e67]" />
                    Weekly Appointment Utilization
                  </CardTitle>
                  <CardDescription>[DEMO] Appointment metrics by day of week</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleExport('CSV')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-stone-50">
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Scheduled</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">No-Shows</TableHead>
                    <TableHead className="text-right">Cancelled</TableHead>
                    <TableHead className="text-right">Utilization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DEMO_APPOINTMENT_UTILIZATION.map((day) => (
                    <TableRow key={day.day}>
                      <TableCell className="font-medium">{day.day}</TableCell>
                      <TableCell className="text-right">{day.scheduled}</TableCell>
                      <TableCell className="text-right">
                        <span className="text-green-600">{day.completed}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-red-600">{day.noShow}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-[#053e67]">{day.cancelled}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={day.utilization >= 93 ? 'default' : 'secondary'} className={
                          day.utilization >= 93 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }>
                          {day.utilization.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* No-Show Analysis Chart Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-[#053e67]" />
                No-Show Analysis
              </CardTitle>
              <CardDescription>[DEMO] Patterns and trends in patient no-shows</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] bg-gradient-to-br from-stone-50 to-stone-100 rounded-lg flex items-center justify-center border border-dashed border-stone-300">
                <div className="text-center text-stone-500">
                  <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No-Show Trend Analysis</p>
                  <p className="text-xs text-stone-400">[DEMO] Chart showing no-show patterns by time, day, and patient type</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="text-center p-3 bg-stone-50 rounded-lg">
                  <p className="text-lg font-bold text-stone-900">Tuesdays</p>
                  <p className="text-xs text-stone-500">Lowest No-Show Day</p>
                </div>
                <div className="text-center p-3 bg-stone-50 rounded-lg">
                  <p className="text-lg font-bold text-stone-900">8:00 AM</p>
                  <p className="text-xs text-stone-500">Highest No-Show Time</p>
                </div>
                <div className="text-center p-3 bg-stone-50 rounded-lg">
                  <p className="text-lg font-bold text-stone-900">New Patients</p>
                  <p className="text-xs text-stone-500">Highest Risk Group</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Patient Retention Chart Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#053e67]" />
                Patient Retention & Acquisition
              </CardTitle>
              <CardDescription>[DEMO] Monthly patient retention and new patient trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] bg-gradient-to-br from-stone-50 to-stone-100 rounded-lg flex items-center justify-center border border-dashed border-stone-300">
                <div className="text-center text-stone-500">
                  <LineChart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Retention & Acquisition Chart</p>
                  <p className="text-xs text-stone-400">[DEMO] Dual-axis chart showing retention % and new patient count</p>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2 mt-4">
                {DEMO_MONTHLY_TRENDS.map((month) => (
                  <div key={month.month} className="text-center">
                    <p className="text-xs text-stone-500">{month.month}</p>
                    <p className="text-sm font-semibold text-green-600">{month.retention}%</p>
                    <p className="text-xs text-[#053e67]">+{month.newPatients}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* KPIs Tab */}
        <TabsContent value="kpis" className="space-y-6 mt-6">
          <KPIDashboard />
        </TabsContent>

        {/* Custom Report Builder Tab */}
        <TabsContent value="builder" className="space-y-6 mt-6">
          <CustomReportBuilder />
        </TabsContent>

        {/* Report Scheduler Tab */}
        <TabsContent value="scheduler" className="space-y-6 mt-6">
          <ReportScheduler />
        </TabsContent>

        {/* Saved Reports Tab */}
        <TabsContent value="saved" className="space-y-6 mt-6">
          <SavedReportsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Saved Reports Section Component
function SavedReportsSection() {
  const { data: savedReports, isLoading } = trpc.reporting.listSavedReports.useQuery({});

  const exportReport = trpc.reporting.exportReport.useMutation({
    onSuccess: () => {
      toast.success('Export started. You will be notified when ready.');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteReport = trpc.reporting.deleteSavedReport.useMutation({
    onSuccess: () => {
      toast.success('Report deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saved Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const reports = savedReports || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5 text-[#053e67]" />
              Saved Reports
            </CardTitle>
            <CardDescription>Your saved report configurations</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <div className="text-center py-12 text-stone-500">
            <FileBarChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">No saved reports yet</p>
            <p className="text-sm text-stone-400 mt-1">
              Use the Custom Report Builder to create and save your first report
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>Report Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead>Shared</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">{report.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{report.reportType}</Badge>
                  </TableCell>
                  <TableCell>{new Date(report.updatedAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {report.isShared ? (
                      <Badge className="bg-green-100 text-green-800">Shared</Badge>
                    ) : (
                      <Badge variant="outline">Private</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => exportReport.mutate({
                          reportType: report.reportType,
                          format: 'CSV',
                          parameters: {},
                          savedReportId: report.id,
                        })}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this report?')) {
                            deleteReport.mutate({ id: report.id });
                          }
                        }}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
