// Enterprise Dashboard Component - US-255
// Main dashboard for enterprise-wide visibility

'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  LayoutDashboard,
  BarChart3,
  Settings,
  Activity,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { LocationSwitcher } from './LocationSwitcher';
import { EnterpriseOverviewMetrics } from './EnterpriseOverviewMetrics';
import { LocationComparisonChart } from './LocationComparisonChart';
import { LocationDashboardCards } from './LocationDashboardCards';
import { EnterpriseSettingsPanel } from './EnterpriseSettingsPanel';
import { LocationHealthIndicators } from './LocationHealthIndicators';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import type { AuthUser } from '@/lib/auth';

export function EnterpriseDashboard() {
  const { data: session } = useSession();
  const user = session?.user as AuthUser | undefined;

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });
  const [isExporting, setIsExporting] = useState(false);

  // Fetch locations for the comparison chart
  const { data: locations, isLoading: locationsLoading } = trpc.location.list.useQuery({
    includeInactive: false,
  });

  // Get all location IDs for comparison
  const allLocationIds = useMemo(() => {
    if (!locations) return [];
    return locations.map((l) => l.id);
  }, [locations]);

  // Selected location IDs for filtering
  const selectedLocationIds = useMemo(() => {
    if (selectedLocationId === null) return undefined;
    return [selectedLocationId];
  }, [selectedLocationId]);

  // Comparison location IDs (need at least 2 for comparison)
  const comparisonLocationIds = useMemo(() => {
    if (selectedLocationId === null && allLocationIds.length >= 2) {
      return allLocationIds.slice(0, 5); // Limit to 5 for comparison
    }
    return allLocationIds.slice(0, 5);
  }, [selectedLocationId, allLocationIds]);

  // Export mutation
  const exportMutation = trpc.enterpriseReporting.exportEnterpriseReport.useMutation({
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
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Please select a date range');
      return;
    }
    setIsExporting(true);
    exportMutation.mutate({
      reportType: 'enterprise-overview',
      dateRange: {
        start: dateRange.from,
        end: dateRange.to,
      },
      format,
      locationIds: selectedLocationIds,
    });
  };

  const dateRangeObj = useMemo(() => {
    return {
      start: dateRange?.from || new Date(new Date().setDate(new Date().getDate() - 30)),
      end: dateRange?.to || new Date(),
    };
  }, [dateRange]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#053e67]/10 rounded-lg">
              <Building2 className="h-6 w-6 text-[#053e67]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                Enterprise Dashboard
              </h1>
              <p className="text-stone-500 mt-0.5">
                Multi-location overview for {user?.organizationName || 'your organization'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <LocationSwitcher
            selectedLocationId={selectedLocationId}
            onLocationChange={setSelectedLocationId}
            showAllLocations={true}
          />
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
          </div>
        </div>
      </div>

      {/* Enterprise Overview Metrics */}
      <EnterpriseOverviewMetrics
        dateRange={dateRangeObj}
        selectedLocationIds={selectedLocationIds}
      />

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 bg-stone-100">
          <TabsTrigger
            value="overview"
            className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger
            value="comparison"
            className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Comparison</span>
          </TabsTrigger>
          <TabsTrigger
            value="health"
            className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900"
          >
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Health</span>
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab - Location Dashboard Cards */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <LocationDashboardCards dateRange={dateRangeObj} />
        </TabsContent>

        {/* Comparison Tab - Location Comparison Charts */}
        <TabsContent value="comparison" className="space-y-6 mt-6">
          <LocationComparisonChart
            dateRange={dateRangeObj}
            locationIds={comparisonLocationIds}
          />

          {/* Additional comparison insights */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue by Location</CardTitle>
                <CardDescription>Total revenue breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] bg-gradient-to-br from-stone-50 to-stone-100 rounded-lg flex items-center justify-center border border-dashed border-stone-300">
                  <div className="text-center text-stone-500">
                    <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Revenue Chart</p>
                    <p className="text-xs text-stone-400">Bar chart visualization</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Patient Volume by Location</CardTitle>
                <CardDescription>Patient distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] bg-gradient-to-br from-stone-50 to-stone-100 rounded-lg flex items-center justify-center border border-dashed border-stone-300">
                  <div className="text-center text-stone-500">
                    <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Patient Volume Chart</p>
                    <p className="text-xs text-stone-400">Pie chart visualization</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Health Tab - Location Health Indicators */}
        <TabsContent value="health" className="space-y-6 mt-6">
          <LocationHealthIndicators dateRange={dateRangeObj} />
        </TabsContent>

        {/* Settings Tab - Enterprise Settings Panel */}
        <TabsContent value="settings" className="space-y-6 mt-6">
          <EnterpriseSettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
