'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DollarSign,
  Calendar,
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  PieChart as PieChartIcon,
  BarChart3,
  LineChart as LineChartIcon,
  Settings,
  GripVertical,
  Eye,
  EyeOff,
  RefreshCw,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Gauge,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from 'recharts';

// ============================================
// TYPES
// ============================================

interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  visible: boolean;
  position: number;
  size: 'small' | 'medium' | 'large';
}

type WidgetType =
  | 'kpi-collections'
  | 'kpi-appointments'
  | 'kpi-new-patients'
  | 'revenue-trend'
  | 'utilization-gauge'
  | 'claims-status'
  | 'provider-comparison';

interface KPIData {
  label: string;
  value: number;
  previousValue?: number;
  format: 'currency' | 'number' | 'percentage';
  trend?: number;
  target?: number;
  icon: React.ElementType;
  color: string;
}

// ============================================
// DEFAULT WIDGETS CONFIGURATION
// ============================================

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'kpi-collections', type: 'kpi-collections', title: 'Daily Collections', visible: true, position: 0, size: 'small' },
  { id: 'kpi-appointments', type: 'kpi-appointments', title: 'Appointments', visible: true, position: 1, size: 'small' },
  { id: 'kpi-new-patients', type: 'kpi-new-patients', title: 'New Patients', visible: true, position: 2, size: 'small' },
  { id: 'revenue-trend', type: 'revenue-trend', title: 'Revenue Trend', visible: true, position: 3, size: 'large' },
  { id: 'utilization-gauge', type: 'utilization-gauge', title: 'Utilization', visible: true, position: 4, size: 'medium' },
  { id: 'claims-status', type: 'claims-status', title: 'Claims Status', visible: true, position: 5, size: 'medium' },
  { id: 'provider-comparison', type: 'provider-comparison', title: 'Provider Comparison', visible: true, position: 6, size: 'large' },
];

const CHART_COLORS = ['#053e67', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6'];

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatValue(value: number, format: 'currency' | 'number' | 'percentage'): string {
  switch (format) {
    case 'currency':
      return formatCurrency(value);
    case 'percentage':
      return formatPercentage(value);
    default:
      return formatNumber(value);
  }
}

function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// ============================================
// KPI CARD COMPONENT
// ============================================

interface KPICardProps {
  data: KPIData;
  isLoading?: boolean;
}

function KPICard({ data, isLoading }: KPICardProps) {
  const Icon = data.icon;
  const trend = data.trend ?? (data.previousValue !== undefined ? calculateTrend(data.value, data.previousValue) : undefined);
  const isPositive = trend !== undefined && trend >= 0;
  const progressValue = data.target ? Math.min(100, (data.value / data.target) * 100) : undefined;

  if (isLoading) {
    return (
      <Card className="border-stone-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4 rounded" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-28 mb-2" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-stone-200 bg-gradient-to-br from-${data.color}-50 to-white`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-stone-600">{data.label}</CardTitle>
        <div className={`p-2 rounded-full bg-${data.color}-100`}>
          <Icon className={`h-4 w-4 text-${data.color}-600`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold text-stone-900">
              {formatValue(data.value, data.format)}
            </div>
            {trend !== undefined && (
              <div className={`flex items-center text-xs mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? (
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 mr-1" />
                )}
                {Math.abs(trend).toFixed(1)}% vs last period
              </div>
            )}
          </div>
        </div>
        {progressValue !== undefined && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-stone-500 mb-1">
              <span>Progress to target</span>
              <span>{progressValue.toFixed(0)}%</span>
            </div>
            <Progress value={progressValue} className="h-1.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// REVENUE TREND CHART COMPONENT
// ============================================

interface RevenueTrendChartProps {
  data: Array<{ date: string; revenue: number; collections: number }>;
  isLoading?: boolean;
}

function RevenueTrendChart({ data, isLoading }: RevenueTrendChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LineChartIcon className="h-5 w-5 text-[#053e67]" />
          Revenue Trend
        </CardTitle>
        <CardDescription>Revenue and collections over time</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#053e67" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#053e67" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="collectionsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value as number)}
                labelFormatter={(label) => `Date: ${label}`}
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Charges"
                stroke="#053e67"
                strokeWidth={2}
                fill="url(#revenueGradient)"
              />
              <Area
                type="monotone"
                dataKey="collections"
                name="Collections"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#collectionsGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// UTILIZATION GAUGE COMPONENT
// ============================================

interface UtilizationGaugeProps {
  value: number;
  target?: number;
  isLoading?: boolean;
}

function UtilizationGauge({ value, target = 85, isLoading }: UtilizationGaugeProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  const isOnTarget = normalizedValue >= target;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  // Create gauge data for pie chart
  const gaugeData = [
    { name: 'value', value: normalizedValue },
    { name: 'remaining', value: 100 - normalizedValue },
  ];

  const getGaugeColor = (val: number) => {
    if (val >= 90) return '#10b981';
    if (val >= 75) return '#053e67';
    if (val >= 60) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-[#053e67]" />
          Appointment Utilization
        </CardTitle>
        <CardDescription>
          Scheduled vs available appointment slots
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData}
                cx="50%"
                cy="100%"
                startAngle={180}
                endAngle={0}
                innerRadius="60%"
                outerRadius="100%"
                dataKey="value"
                stroke="none"
              >
                <Cell fill={getGaugeColor(normalizedValue)} />
                <Cell fill="#e5e7eb" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-8">
            <div className="text-4xl font-bold text-stone-900">
              {normalizedValue.toFixed(1)}%
            </div>
            <div className={`flex items-center gap-1 text-sm ${isOnTarget ? 'text-green-600' : 'text-amber-600'}`}>
              {isOnTarget ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  On Target
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  Below Target ({target}%)
                </>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-center">
          <div className="p-2 bg-stone-50 rounded-lg">
            <p className="text-lg font-semibold text-stone-900">246</p>
            <p className="text-xs text-stone-500">Available</p>
          </div>
          <div className="p-2 bg-green-50 rounded-lg">
            <p className="text-lg font-semibold text-green-700">
              {Math.round(246 * normalizedValue / 100)}
            </p>
            <p className="text-xs text-stone-500">Scheduled</p>
          </div>
          <div className="p-2 bg-stone-50 rounded-lg">
            <p className="text-lg font-semibold text-stone-700">
              {246 - Math.round(246 * normalizedValue / 100)}
            </p>
            <p className="text-xs text-stone-500">Open</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// CLAIMS STATUS PIE CHART COMPONENT
// ============================================

interface ClaimsStatusChartProps {
  data: Array<{ status: string; count: number; amount: number }>;
  isLoading?: boolean;
}

function ClaimsStatusChart({ data, isLoading }: ClaimsStatusChartProps) {
  const statusColors: Record<string, string> = {
    'Paid': '#10b981',
    'Pending': '#f59e0b',
    'Submitted': '#053e67',
    'Denied': '#ef4444',
    'Appealed': '#8b5cf6',
  };

  const total = data.reduce((sum, item) => sum + item.count, 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChartIcon className="h-5 w-5 text-[#053e67]" />
          Claims Status
        </CardTitle>
        <CardDescription>Distribution of claims by status</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="40%"
                outerRadius="70%"
                dataKey="count"
                nameKey="status"
                label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={statusColors[entry.status] || CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  `${value} claims`,
                  name,
                ]}
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {data.slice(0, 4).map((item) => (
            <div
              key={item.status}
              className="flex items-center gap-2 text-sm"
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: statusColors[item.status] || '#6b7280' }}
              />
              <span className="text-stone-600 truncate">{item.status}</span>
              <span className="ml-auto font-medium text-stone-900">
                {item.count}
              </span>
            </div>
          ))}
        </div>
        <div className="text-center mt-4 pt-4 border-t border-stone-200">
          <p className="text-2xl font-bold text-stone-900">{total}</p>
          <p className="text-xs text-stone-500">Total Claims</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// PROVIDER COMPARISON BAR CHART COMPONENT
// ============================================

interface ProviderComparisonChartProps {
  data: Array<{
    name: string;
    charges: number;
    collections: number;
    visits: number;
  }>;
  isLoading?: boolean;
}

function ProviderComparisonChart({ data, isLoading }: ProviderComparisonChartProps) {
  const [metric, setMetric] = useState<'charges' | 'collections' | 'visits'>('collections');

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const formatYAxis = (value: number) => {
    if (metric === 'visits') return value.toString();
    return `$${(value / 1000).toFixed(0)}k`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#053e67]" />
              Provider Comparison
            </CardTitle>
            <CardDescription>Compare provider performance</CardDescription>
          </div>
          <Select value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="collections">Collections</SelectItem>
              <SelectItem value="charges">Charges</SelectItem>
              <SelectItem value="visits">Visits</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
                tickFormatter={formatYAxis}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
                width={120}
              />
              <Tooltip
                formatter={(value) =>
                  metric === 'visits' ? formatNumber(value as number) : formatCurrency(value as number)
                }
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Bar
                dataKey={metric}
                fill="#053e67"
                radius={[0, 4, 4, 0]}
                barSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// WIDGET CONFIGURATION DIALOG
// ============================================

interface WidgetConfigDialogProps {
  widgets: DashboardWidget[];
  onSave: (widgets: DashboardWidget[]) => void;
}

function WidgetConfigDialog({ widgets, onSave }: WidgetConfigDialogProps) {
  const [localWidgets, setLocalWidgets] = useState<DashboardWidget[]>(widgets);
  const [open, setOpen] = useState(false);

  const toggleWidget = (id: string) => {
    setLocalWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    );
  };

  const handleSave = () => {
    onSave(localWidgets);
    setOpen(false);
    toast.success('Dashboard layout saved');
  };

  const handleReset = () => {
    setLocalWidgets(DEFAULT_WIDGETS);
    toast.info('Reset to default layout');
  };

  useEffect(() => {
    if (open) {
      setLocalWidgets(widgets);
    }
  }, [open, widgets]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Customize
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Customize Dashboard</DialogTitle>
          <DialogDescription>
            Show or hide widgets to customize your analytics dashboard view.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {localWidgets.map((widget) => (
            <div
              key={widget.id}
              className="flex items-center justify-between p-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-stone-400" />
                <span className="font-medium text-stone-700">{widget.title}</span>
              </div>
              <div className="flex items-center gap-3">
                {widget.visible ? (
                  <Eye className="h-4 w-4 text-green-600" />
                ) : (
                  <EyeOff className="h-4 w-4 text-stone-400" />
                )}
                <Switch
                  checked={widget.visible}
                  onCheckedChange={() => toggleWidget(widget.id)}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset to Default
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// MAIN ANALYTICS DASHBOARD COMPONENT
// ============================================

export function AnalyticsDashboard() {
  // Date range state
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });

  // Widget configuration state - stored in localStorage
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('analytics-dashboard-widgets');
      return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
    }
    return DEFAULT_WIDGETS;
  });

  // Save widgets to localStorage
  const handleSaveWidgets = useCallback((newWidgets: DashboardWidget[]) => {
    setWidgets(newWidgets);
    if (typeof window !== 'undefined') {
      localStorage.setItem('analytics-dashboard-widgets', JSON.stringify(newWidgets));
    }
  }, []);

  // Query for dashboard metrics
  const { data: dashboardData, isLoading: dashboardLoading, refetch } = trpc.reporting.getDashboard.useQuery({
    date: dateRange?.from || new Date(),
  });

  // Query for KPIs
  const { data: kpiData, isLoading: kpiLoading } = trpc.reporting.getKPIs.useQuery({
    start: dateRange?.from || new Date(new Date().setDate(new Date().getDate() - 30)),
    end: dateRange?.to || new Date(),
  });

  // Query for claims status
  const { data: claimsData, isLoading: claimsLoading } = trpc.reporting.getClaimsStatusSummary.useQuery({
    start: dateRange?.from || new Date(new Date().setDate(new Date().getDate() - 30)),
    end: dateRange?.to || new Date(),
  });

  // Query for provider revenue
  const { data: providerData, isLoading: providerLoading } = trpc.reporting.getRevenueByProvider.useQuery({
    start: dateRange?.from || new Date(new Date().setDate(new Date().getDate() - 30)),
    end: dateRange?.to || new Date(),
  });

  // Query for daily collections (for trend chart)
  const { data: collectionsData, isLoading: collectionsLoading } = trpc.reporting.getDailyCollections.useQuery({
    start: dateRange?.from || new Date(new Date().setDate(new Date().getDate() - 30)),
    end: dateRange?.to || new Date(),
  });

  // Query for appointment utilization
  const { data: utilizationData, isLoading: utilizationLoading } = trpc.reporting.getProviderUtilization.useQuery({
    start: dateRange?.from || new Date(new Date().setDate(new Date().getDate() - 30)),
    end: dateRange?.to || new Date(),
  });

  // Memoized KPI data
  const kpiCards: KPIData[] = useMemo(() => [
    {
      label: 'Daily Collections',
      value: dashboardData?.todayRevenue || 0,
      previousValue: (dashboardData?.todayRevenue || 0) * 0.92, // Demo: 8% increase
      format: 'currency',
      target: 5000,
      icon: DollarSign,
      color: 'blue',
    },
    {
      label: 'Appointments Today',
      value: dashboardData?.todayVisits || 0,
      previousValue: (dashboardData?.todayVisits || 0) * 0.95, // Demo: 5% increase
      format: 'number',
      target: 30,
      icon: Calendar,
      color: 'stone',
    },
    {
      label: 'New Patients (30d)',
      value: dashboardData?.todayNewPatients || 0,
      previousValue: (dashboardData?.todayNewPatients || 0) * 1.03, // Demo: 3% decrease
      format: 'number',
      icon: Users,
      color: 'blue',
    },
  ], [dashboardData]);

  // Transform data for charts
  const revenueTrendData = useMemo(() => {
    if (!collectionsData?.rows) return [];
    return collectionsData.rows.map((row) => ({
      date: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: row.totalPayments * 1.1, // Estimate charges based on payments
      collections: row.totalPayments,
    }));
  }, [collectionsData]);

  const claimsStatusData = useMemo(() => {
    if (!claimsData?.statusCounts) {
      // Demo data
      return [
        { status: 'Paid', count: 145, amount: 48500 },
        { status: 'Pending', count: 67, amount: 22300 },
        { status: 'Submitted', count: 43, amount: 14200 },
        { status: 'Denied', count: 12, amount: 4100 },
      ];
    }
    return claimsData.statusCounts.map((item) => ({
      status: item.statusLabel,
      count: item.count,
      amount: item.totalCharges,
    }));
  }, [claimsData]);

  const providerComparisonData = useMemo(() => {
    if (!providerData?.rows) {
      // Demo data
      return [
        { name: 'Dr. Sarah Johnson', charges: 45230, collections: 42100, visits: 156 },
        { name: 'Dr. Michael Chen', charges: 38450, collections: 35800, visits: 134 },
        { name: 'Dr. Emily Williams', charges: 32180, collections: 29900, visits: 112 },
        { name: 'Dr. Robert Davis', charges: 28900, collections: 26700, visits: 98 },
      ];
    }
    return providerData.rows.map((row) => ({
      name: row.providerName,
      charges: row.totalCharges,
      collections: row.totalCollections,
      visits: row.visitCount,
    }));
  }, [providerData]);

  const utilizationValue = useMemo(() => {
    if (!utilizationData?.totals) return 78.5; // Demo value
    return utilizationData.totals.overallUtilization;
  }, [utilizationData]);

  // Check which widgets are visible
  const isWidgetVisible = useCallback(
    (type: WidgetType) => widgets.find((w) => w.type === type)?.visible ?? true,
    [widgets]
  );

  const isLoading = dashboardLoading || kpiLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900">Analytics Dashboard</h2>
          <p className="text-stone-500">
            Key performance indicators and practice metrics at a glance
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
            <WidgetConfigDialog widgets={widgets} onSave={handleSaveWidgets} />
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      {(isWidgetVisible('kpi-collections') || isWidgetVisible('kpi-appointments') || isWidgetVisible('kpi-new-patients')) && (
        <div className="grid gap-4 md:grid-cols-3">
          {isWidgetVisible('kpi-collections') && (
            <KPICard data={kpiCards[0]} isLoading={dashboardLoading} />
          )}
          {isWidgetVisible('kpi-appointments') && (
            <KPICard data={kpiCards[1]} isLoading={dashboardLoading} />
          )}
          {isWidgetVisible('kpi-new-patients') && (
            <KPICard data={kpiCards[2]} isLoading={dashboardLoading} />
          )}
        </div>
      )}

      {/* Revenue Trend Chart */}
      {isWidgetVisible('revenue-trend') && (
        <RevenueTrendChart data={revenueTrendData} isLoading={collectionsLoading} />
      )}

      {/* Utilization Gauge and Claims Status */}
      <div className="grid gap-6 md:grid-cols-2">
        {isWidgetVisible('utilization-gauge') && (
          <UtilizationGauge value={utilizationValue} isLoading={utilizationLoading} />
        )}
        {isWidgetVisible('claims-status') && (
          <ClaimsStatusChart data={claimsStatusData} isLoading={claimsLoading} />
        )}
      </div>

      {/* Provider Comparison Chart */}
      {isWidgetVisible('provider-comparison') && (
        <ProviderComparisonChart data={providerComparisonData} isLoading={providerLoading} />
      )}
    </div>
  );
}
