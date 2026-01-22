'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DollarSign,
  FileBarChart,
  Activity,
  Calendar,
  Users,
  Stethoscope,
  ClipboardList,
  TrendingUp,
  Clock,
  Download,
  FileText,
  FileSpreadsheet,
  Play,
  RefreshCw,
  Eye,
  Save,
  Trash2,
  Edit,
  Search,
  Filter,
  Plus,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileJson,
  CalendarClock,
  MailCheck,
  Settings2,
  ArrowLeft,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { ReportType, ExportFormat } from '@prisma/client';

// =====================================
// REPORT CATEGORIES CONFIGURATION
// =====================================

interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  reportType: ReportType;
  icon: React.ElementType;
  color: string;
  procedure?: string;
  parameters?: string[];
}

const REPORT_CATEGORIES = [
  {
    id: 'financial',
    name: 'Financial',
    description: 'Revenue, collections, and accounts receivable reports',
    icon: DollarSign,
    color: 'bg-green-100 text-green-700 border-green-200',
    iconColor: 'text-green-600',
  },
  {
    id: 'clinical',
    name: 'Clinical',
    description: 'Diagnosis, treatment plans, and patient outcomes',
    icon: Stethoscope,
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    iconColor: 'text-purple-600',
  },
  {
    id: 'operational',
    name: 'Operational',
    description: 'Scheduling, utilization, and productivity metrics',
    icon: Activity,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    iconColor: 'text-blue-600',
  },
  {
    id: 'claims',
    name: 'Claims & Insurance',
    description: 'Claims status, denials, and payer performance',
    icon: FileBarChart,
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    iconColor: 'text-amber-600',
  },
];

const REPORT_DEFINITIONS: ReportDefinition[] = [
  // Financial Reports
  {
    id: 'daily-collections',
    name: 'Daily Collections',
    description: 'Payments received by date with breakdown by payment method',
    category: 'financial',
    reportType: ReportType.COLLECTIONS,
    icon: DollarSign,
    color: 'green',
    procedure: 'getDailyCollections',
    parameters: ['dateRange'],
  },
  {
    id: 'ar-aging',
    name: 'A/R Aging Report',
    description: 'Outstanding balances by age bucket (0-30, 31-60, 61-90, 91-120, 120+ days)',
    category: 'financial',
    reportType: ReportType.AR_AGING,
    icon: Clock,
    color: 'green',
    procedure: 'getARAgingDetail',
    parameters: ['asOfDate'],
  },
  {
    id: 'revenue-by-provider',
    name: 'Revenue by Provider',
    description: 'Charges and collections breakdown by provider',
    category: 'financial',
    reportType: ReportType.PROVIDER_PRODUCTION,
    icon: Users,
    color: 'green',
    procedure: 'getRevenueByProvider',
    parameters: ['dateRange'],
  },
  {
    id: 'revenue-by-service',
    name: 'Revenue by Service Code',
    description: 'Revenue breakdown by CPT/service code',
    category: 'financial',
    reportType: ReportType.CUSTOM,
    icon: FileBarChart,
    color: 'green',
    procedure: 'getRevenueByServiceCode',
    parameters: ['dateRange'],
  },
  {
    id: 'payment-type-summary',
    name: 'Payment Type Summary',
    description: 'Payment breakdown by type (cash, card, insurance)',
    category: 'financial',
    reportType: ReportType.CUSTOM,
    icon: DollarSign,
    color: 'green',
    procedure: 'getPaymentTypeSummary',
    parameters: ['dateRange'],
  },
  // Clinical Reports
  {
    id: 'diagnosis-frequency',
    name: 'Diagnosis Frequency',
    description: 'Top diagnoses by volume with ICD-10 codes',
    category: 'clinical',
    reportType: ReportType.CUSTOM,
    icon: ClipboardList,
    color: 'purple',
    procedure: 'getDiagnosisFrequency',
    parameters: ['dateRange'],
  },
  {
    id: 'treatment-plan-completion',
    name: 'Treatment Plan Completion',
    description: 'Treatment plan status and completion rates',
    category: 'clinical',
    reportType: ReportType.CUSTOM,
    icon: CheckCircle2,
    color: 'purple',
    procedure: 'getTreatmentPlanCompletion',
    parameters: ['dateRange'],
  },
  {
    id: 'avg-visits-per-case',
    name: 'Average Visits Per Case',
    description: 'Visit frequency analysis by diagnosis and provider',
    category: 'clinical',
    reportType: ReportType.CUSTOM,
    icon: TrendingUp,
    color: 'purple',
    procedure: 'getAverageVisitsPerCase',
    parameters: ['dateRange'],
  },
  {
    id: 'provider-case-mix',
    name: 'Provider Case Mix',
    description: 'Patient demographics and diagnosis mix by provider',
    category: 'clinical',
    reportType: ReportType.CUSTOM,
    icon: Stethoscope,
    color: 'purple',
    procedure: 'getProviderCaseMix',
    parameters: ['dateRange'],
  },
  {
    id: 'outcome-tracking',
    name: 'Outcome Tracking',
    description: 'Patient outcomes and assessment scores',
    category: 'clinical',
    reportType: ReportType.CUSTOM,
    icon: TrendingUp,
    color: 'purple',
    procedure: 'getOutcomeTracking',
    parameters: ['dateRange'],
  },
  {
    id: 'care-plan-adherence',
    name: 'Care Plan Adherence',
    description: 'Patient adherence to prescribed care plans',
    category: 'clinical',
    reportType: ReportType.CUSTOM,
    icon: ClipboardList,
    color: 'purple',
    procedure: 'getCarePlanAdherence',
    parameters: ['dateRange'],
  },
  // Operational Reports
  {
    id: 'appointment-volume',
    name: 'Appointment Volume',
    description: 'Appointment counts by day, week, or month',
    category: 'operational',
    reportType: ReportType.CUSTOM,
    icon: Calendar,
    color: 'blue',
    procedure: 'getAppointmentVolume',
    parameters: ['dateRange', 'groupBy'],
  },
  {
    id: 'no-show-cancellation',
    name: 'No-Show & Cancellation',
    description: 'No-show and cancellation rates with analysis',
    category: 'operational',
    reportType: ReportType.CUSTOM,
    icon: XCircle,
    color: 'blue',
    procedure: 'getNoShowCancellation',
    parameters: ['dateRange'],
  },
  {
    id: 'provider-utilization',
    name: 'Provider Utilization',
    description: 'Scheduled vs available time by provider',
    category: 'operational',
    reportType: ReportType.CUSTOM,
    icon: Activity,
    color: 'blue',
    procedure: 'getProviderUtilization',
    parameters: ['dateRange'],
  },
  {
    id: 'new-patients',
    name: 'New Patient Report',
    description: 'New patient acquisition by referral source',
    category: 'operational',
    reportType: ReportType.CUSTOM,
    icon: Users,
    color: 'blue',
    procedure: 'getNewPatients',
    parameters: ['dateRange'],
  },
  {
    id: 'visit-frequency',
    name: 'Patient Visit Frequency',
    description: 'Visit frequency distribution across patients',
    category: 'operational',
    reportType: ReportType.CUSTOM,
    icon: TrendingUp,
    color: 'blue',
    procedure: 'getPatientVisitFrequency',
    parameters: ['dateRange'],
  },
  {
    id: 'peak-hours',
    name: 'Peak Hours Analysis',
    description: 'Hourly appointment volume and optimization recommendations',
    category: 'operational',
    reportType: ReportType.CUSTOM,
    icon: Clock,
    color: 'blue',
    procedure: 'getPeakHours',
    parameters: ['dateRange'],
  },
  // Claims Reports
  {
    id: 'claims-status',
    name: 'Claims Status Summary',
    description: 'Claims by status (submitted, pending, paid, denied)',
    category: 'claims',
    reportType: ReportType.CUSTOM,
    icon: FileBarChart,
    color: 'amber',
    procedure: 'getClaimsStatusSummary',
    parameters: ['dateRange'],
  },
  {
    id: 'denial-analysis',
    name: 'Denial Analysis',
    description: 'Claim denials by reason code with trends',
    category: 'claims',
    reportType: ReportType.CUSTOM,
    icon: XCircle,
    color: 'amber',
    procedure: 'getDenialAnalysis',
    parameters: ['dateRange'],
  },
  {
    id: 'payer-performance',
    name: 'Payer Performance',
    description: 'Payment rates and timing by insurance payer',
    category: 'claims',
    reportType: ReportType.CUSTOM,
    icon: TrendingUp,
    color: 'amber',
    procedure: 'getPayerPerformance',
    parameters: ['dateRange'],
  },
  {
    id: 'clean-claim-rate',
    name: 'Clean Claim Rate',
    description: 'Percentage of claims paid on first submission',
    category: 'claims',
    reportType: ReportType.CUSTOM,
    icon: CheckCircle2,
    color: 'amber',
    procedure: 'getCleanClaimRate',
    parameters: ['dateRange'],
  },
  {
    id: 'outstanding-claims',
    name: 'Outstanding Claims',
    description: 'Claims awaiting response by age',
    category: 'claims',
    reportType: ReportType.CUSTOM,
    icon: Clock,
    color: 'amber',
    procedure: 'getOutstandingClaims',
    parameters: ['asOfDate'],
  },
  {
    id: 'era-posting',
    name: 'ERA Posting Summary',
    description: 'Auto-posted vs manual posting statistics',
    category: 'claims',
    reportType: ReportType.CUSTOM,
    icon: FileText,
    color: 'amber',
    procedure: 'getERAPostingSummary',
    parameters: ['dateRange'],
  },
];

// =====================================
// MAIN COMPONENT
// =====================================

export function ReportsPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('categories');

  const utils = trpc.useUtils();

  // Fetch saved reports
  const { data: savedReports, isLoading: savedReportsLoading } = trpc.reporting.listSavedReports.useQuery({});

  // Fetch schedules
  const { data: schedules, isLoading: schedulesLoading } = trpc.reporting.listSchedules.useQuery({});

  // Export mutation
  const exportMutation = trpc.reporting.exportReport.useMutation({
    onSuccess: () => {
      toast.success('Export started. You will be notified when ready.');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Generate report mutation
  const generateMutation = trpc.reporting.generateReport.useMutation({
    onSuccess: (data) => {
      setPreviewData(data);
      setPreviewOpen(true);
      setIsGenerating(false);
      toast.success('Report generated successfully');
    },
    onError: (error) => {
      setIsGenerating(false);
      toast.error(error.message);
    },
  });

  // Delete saved report mutation
  const deleteSavedReport = trpc.reporting.deleteSavedReport.useMutation({
    onSuccess: () => {
      toast.success('Report deleted');
      utils.reporting.listSavedReports.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Filter reports by search query
  const filteredReports = useMemo(() => {
    if (!searchQuery) return REPORT_DEFINITIONS;
    const query = searchQuery.toLowerCase();
    return REPORT_DEFINITIONS.filter(
      (report) =>
        report.name.toLowerCase().includes(query) ||
        report.description.toLowerCase().includes(query) ||
        report.category.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group reports by category
  const reportsByCategory = useMemo(() => {
    const filtered = activeCategory
      ? filteredReports.filter((r) => r.category === activeCategory)
      : filteredReports;

    return REPORT_CATEGORIES.map((category) => ({
      ...category,
      reports: filtered.filter((r) => r.category === category.id),
    }));
  }, [filteredReports, activeCategory]);

  // Handle report selection
  const handleSelectReport = (report: ReportDefinition) => {
    setSelectedReport(report);
  };

  // Handle generate/preview
  const handleGenerateReport = () => {
    if (!selectedReport || !dateRange?.from) {
      toast.error('Please select a report and date range');
      return;
    }

    setIsGenerating(true);
    generateMutation.mutate({
      reportType: selectedReport.reportType,
      name: selectedReport.name,
      parameters: {
        dateRange: {
          start: dateRange.from,
          end: dateRange.to || new Date(),
        },
      },
      forceRefresh: true,
    });
  };

  // Handle export
  const handleExport = (format: ExportFormat) => {
    if (!selectedReport || !dateRange?.from) {
      toast.error('Please select a report and date range');
      return;
    }

    exportMutation.mutate({
      reportType: selectedReport.reportType,
      format,
      parameters: {
        reportId: selectedReport.id,
        startDate: dateRange.from.toISOString(),
        endDate: (dateRange.to || new Date()).toISOString(),
      },
    });
  };

  // Handle re-run saved report
  const handleRerunReport = (savedReport: any) => {
    const reportDef = REPORT_DEFINITIONS.find((r) => r.reportType === savedReport.reportType);
    if (reportDef) {
      setSelectedReport(reportDef);
      handleGenerateReport();
    }
  };

  // Go back to categories
  const handleBackToCategories = () => {
    setSelectedReport(null);
    setActiveCategory(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Reports</h1>
          <p className="text-stone-500 mt-1">
            Generate, preview, and export practice reports
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-stone-100">
          <TabsTrigger value="categories" className="data-[state=active]:bg-white">
            <FileBarChart className="h-4 w-4 mr-2" />
            Report Library
          </TabsTrigger>
          <TabsTrigger value="saved" className="data-[state=active]:bg-white">
            <Save className="h-4 w-4 mr-2" />
            Saved Reports
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="data-[state=active]:bg-white">
            <CalendarClock className="h-4 w-4 mr-2" />
            Scheduled
          </TabsTrigger>
        </TabsList>

        {/* Report Library Tab */}
        <TabsContent value="categories" className="mt-6">
          {selectedReport ? (
            // Report Parameter Form & Preview
            <ReportParameterForm
              report={selectedReport}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              onBack={handleBackToCategories}
              onGenerate={handleGenerateReport}
              onExport={handleExport}
              isGenerating={isGenerating}
            />
          ) : (
            // Report Categories Grid
            <div className="space-y-8">
              {/* Category Filter */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={activeCategory === null ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveCategory(null)}
                  className={activeCategory === null ? 'bg-[#053e67]' : ''}
                >
                  All Reports
                </Button>
                {REPORT_CATEGORIES.map((category) => (
                  <Button
                    key={category.id}
                    variant={activeCategory === category.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveCategory(category.id)}
                    className={activeCategory === category.id ? 'bg-[#053e67]' : ''}
                  >
                    <category.icon className="h-4 w-4 mr-2" />
                    {category.name}
                  </Button>
                ))}
              </div>

              {/* Reports by Category */}
              {reportsByCategory
                .filter((cat) => cat.reports.length > 0)
                .map((category) => (
                  <div key={category.id}>
                    <div className="flex items-center gap-2 mb-4">
                      <div className={`p-2 rounded-lg ${category.color}`}>
                        <category.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-stone-900">{category.name}</h2>
                        <p className="text-sm text-stone-500">{category.description}</p>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {category.reports.map((report) => (
                        <ReportCard
                          key={report.id}
                          report={report}
                          onSelect={() => handleSelectReport(report)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </TabsContent>

        {/* Saved Reports Tab */}
        <TabsContent value="saved" className="mt-6">
          <SavedReportsTab
            savedReports={savedReports || []}
            isLoading={savedReportsLoading}
            onRerun={handleRerunReport}
            onDelete={(id) => deleteSavedReport.mutate({ id })}
            onExport={(report, format) => {
              exportMutation.mutate({
                reportType: report.reportType,
                format,
                parameters: report.config as Record<string, unknown>,
                savedReportId: report.id,
              });
            }}
          />
        </TabsContent>

        {/* Scheduled Reports Tab */}
        <TabsContent value="scheduled" className="mt-6">
          <ScheduledReportsTab
            schedules={schedules || []}
            isLoading={schedulesLoading}
          />
        </TabsContent>
      </Tabs>

      {/* Report Preview Sheet */}
      <ReportPreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={previewData}
        report={selectedReport}
        onExport={handleExport}
      />
    </div>
  );
}

// =====================================
// SUB-COMPONENTS
// =====================================

// Report Card Component
function ReportCard({
  report,
  onSelect,
}: {
  report: ReportDefinition;
  onSelect: () => void;
}) {
  const Icon = report.icon;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-stone-200 hover:border-[#053e67]/30"
      onClick={onSelect}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg bg-stone-100`}>
              <Icon className="h-5 w-5 text-stone-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-stone-900">{report.name}</h3>
              <p className="text-sm text-stone-500 mt-1 line-clamp-2">
                {report.description}
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-stone-400" />
        </div>
      </CardContent>
    </Card>
  );
}

// Report Parameter Form Component
function ReportParameterForm({
  report,
  dateRange,
  onDateRangeChange,
  onBack,
  onGenerate,
  onExport,
  isGenerating,
}: {
  report: ReportDefinition;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onBack: () => void;
  onGenerate: () => void;
  onExport: (format: ExportFormat) => void;
  isGenerating: boolean;
}) {
  const Icon = report.icon;
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  return (
    <div className="space-y-6">
      {/* Back Button & Title */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Reports
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-lg bg-stone-100`}>
              <Icon className="h-6 w-6 text-stone-600" />
            </div>
            <div className="flex-1">
              <CardTitle>{report.name}</CardTitle>
              <CardDescription className="mt-1">{report.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Parameters */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Date Range */}
            {report.parameters?.includes('dateRange') && (
              <div className="space-y-2">
                <Label>Date Range</Label>
                <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
              </div>
            )}

            {/* As Of Date */}
            {report.parameters?.includes('asOfDate') && (
              <div className="space-y-2">
                <Label>As Of Date</Label>
                <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
              </div>
            )}

            {/* Group By (for appointment volume) */}
            {report.parameters?.includes('groupBy') && (
              <div className="space-y-2">
                <Label>Group By</Label>
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <Button
              onClick={onGenerate}
              disabled={isGenerating}
              className="bg-[#053e67] hover:bg-[#053e67]/90"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Report
                </>
              )}
            </Button>

            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExport('PDF')}
                      disabled={isGenerating}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export as PDF</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExport('CSV')}
                      disabled={isGenerating}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export as CSV</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExport('EXCEL')}
                      disabled={isGenerating}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Excel
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export as Excel</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Report Preview Sheet Component
function ReportPreviewSheet({
  open,
  onOpenChange,
  data,
  report,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: any;
  report: ReportDefinition | null;
  onExport: (format: ExportFormat) => void;
}) {
  if (!data || !report) return null;

  const reportData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            {report.name} Preview
          </SheetTitle>
          <SheetDescription>
            Generated at {new Date(data.generatedAt).toLocaleString()}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Export Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onExport('PDF')}>
              <FileText className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => onExport('CSV')}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => onExport('EXCEL')}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          </div>

          <Separator />

          {/* Report Preview Content */}
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-4">
              {/* Summary */}
              {reportData?.summary && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(reportData.summary).map(([key, value]) => (
                        <div key={key}>
                          <p className="text-xs text-stone-500 capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </p>
                          <p className="text-sm font-medium">
                            {typeof value === 'number'
                              ? value.toLocaleString()
                              : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Data Table */}
              {reportData?.rows && reportData.rows.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Data ({reportData.rows.length} rows)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(reportData.rows[0]).slice(0, 5).map((key) => (
                              <TableHead key={key} className="capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportData.rows.slice(0, 20).map((row: any, i: number) => (
                            <TableRow key={i}>
                              {Object.values(row).slice(0, 5).map((val: any, j: number) => (
                                <TableCell key={j}>
                                  {typeof val === 'number'
                                    ? val.toLocaleString()
                                    : String(val ?? '-')}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {reportData.rows.length > 20 && (
                        <p className="text-xs text-stone-500 mt-2 text-center">
                          Showing first 20 of {reportData.rows.length} rows
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Raw Data (fallback) */}
              {!reportData?.rows && !reportData?.summary && (
                <Card>
                  <CardContent className="pt-6">
                    <pre className="text-xs bg-stone-50 p-4 rounded-lg overflow-auto max-h-96">
                      {JSON.stringify(reportData, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Saved Reports Tab Component
function SavedReportsTab({
  savedReports,
  isLoading,
  onRerun,
  onDelete,
  onExport,
}: {
  savedReports: any[];
  isLoading: boolean;
  onRerun: (report: any) => void;
  onDelete: (id: string) => void;
  onExport: (report: any, format: ExportFormat) => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (savedReports.length === 0) {
    return (
      <Card>
        <CardContent className="pt-12 pb-12 text-center">
          <Save className="h-12 w-12 mx-auto text-stone-300 mb-4" />
          <h3 className="text-lg font-medium text-stone-900">No saved reports</h3>
          <p className="text-sm text-stone-500 mt-1">
            Use the Custom Report Builder to create and save reports
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Save className="h-5 w-5" />
          Saved Reports
        </CardTitle>
        <CardDescription>
          Your saved report configurations for quick access
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Last Modified</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {savedReports.map((report) => (
              <TableRow key={report.id}>
                <TableCell className="font-medium">{report.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{report.reportType}</Badge>
                </TableCell>
                <TableCell>
                  {new Date(report.updatedAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Badge variant={report.isShared ? 'default' : 'outline'}>
                    {report.isShared ? 'Shared' : 'Private'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onRerun(report)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Re-run report</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onExport(report, 'CSV')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export CSV</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (confirm('Delete this saved report?')) {
                                onDelete(report.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete report</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Scheduled Reports Tab Component
function ScheduledReportsTab({
  schedules,
  isLoading,
}: {
  schedules: any[];
  isLoading: boolean;
}) {
  const utils = trpc.useUtils();

  const toggleSchedule = trpc.reporting.toggleScheduleActive.useMutation({
    onSuccess: () => {
      utils.reporting.listSchedules.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteSchedule = trpc.reporting.cancelSchedule.useMutation({
    onSuccess: () => {
      toast.success('Schedule deleted');
      utils.reporting.listSchedules.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (schedules.length === 0) {
    return (
      <Card>
        <CardContent className="pt-12 pb-12 text-center">
          <CalendarClock className="h-12 w-12 mx-auto text-stone-300 mb-4" />
          <h3 className="text-lg font-medium text-stone-900">No scheduled reports</h3>
          <p className="text-sm text-stone-500 mt-1">
            Create a schedule to automatically generate and deliver reports
          </p>
        </CardContent>
      </Card>
    );
  }

  const getFrequencyLabel = (frequency: string, dayOfWeek?: number, dayOfMonth?: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    switch (frequency) {
      case 'DAILY':
        return 'Daily';
      case 'WEEKLY':
        return `Weekly on ${days[dayOfWeek || 0]}`;
      case 'MONTHLY':
        return `Monthly on day ${dayOfMonth || 1}`;
      case 'QUARTERLY':
        return `Quarterly on day ${dayOfMonth || 1}`;
      default:
        return frequency;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Scheduled Reports
        </CardTitle>
        <CardDescription>
          Automated report generation and email delivery
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Schedule Name</TableHead>
              <TableHead>Report</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Next Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell className="font-medium">{schedule.name}</TableCell>
                <TableCell>{schedule.savedReport?.name || '-'}</TableCell>
                <TableCell>
                  <div>
                    {getFrequencyLabel(
                      schedule.frequency,
                      schedule.dayOfWeek ?? undefined,
                      schedule.dayOfMonth ?? undefined
                    )}
                    <br />
                    <span className="text-xs text-stone-500">at {schedule.timeOfDay}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {schedule.nextRunAt
                    ? new Date(schedule.nextRunAt).toLocaleString()
                    : '-'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={schedule.isActive ? 'default' : 'secondary'}
                    className={schedule.isActive ? 'bg-green-100 text-green-800' : ''}
                  >
                    {schedule.isActive ? 'Active' : 'Paused'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              toggleSchedule.mutate({
                                id: schedule.id,
                                isActive: !schedule.isActive,
                              })
                            }
                          >
                            {schedule.isActive ? (
                              <AlertCircle className="h-4 w-4 text-amber-600" />
                            ) : (
                              <Play className="h-4 w-4 text-green-600" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {schedule.isActive ? 'Pause schedule' : 'Activate schedule'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (confirm('Delete this schedule?')) {
                                deleteSchedule.mutate({ id: schedule.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete schedule</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
