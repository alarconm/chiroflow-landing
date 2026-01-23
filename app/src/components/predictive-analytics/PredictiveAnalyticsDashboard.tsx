'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Brain,
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  AlertTriangle,
  Target,
  RefreshCw,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { ChurnRiskPatientList } from './ChurnRiskPatientList';
import { DemandForecastVisualization } from './DemandForecastVisualization';
import { RevenueProjectionCharts } from './RevenueProjectionCharts';
import { NoShowRiskCalendar } from './NoShowRiskCalendar';
import { TrendIndicators } from './TrendIndicators';
import { PredictionAccuracyMetrics } from './PredictionAccuracyMetrics';
import { ActionableInsightCards } from './ActionableInsightCards';
import { ScenarioComparisonTool } from './ScenarioComparisonTool';
import { DashboardSummaryCards } from './DashboardSummaryCards';

export function PredictiveAnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  // Refresh all predictive data
  const utils = trpc.useUtils();

  const handleRefreshAll = () => {
    utils.aiPredict.getChurnSummary.invalidate();
    utils.aiPredict.getDemandSummary.invalidate();
    utils.aiPredict.getRevenueSummary.invalidate();
    utils.aiPredict.getNoShowSummary.invalidate();
    utils.aiPredict.getTrendSummary.invalidate();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-8 w-8 text-[#053e67]" />
            Predictive Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered insights to optimize your practice operations
          </p>
        </div>
        <Button onClick={handleRefreshAll} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      {/* Dashboard Summary Cards */}
      <DashboardSummaryCards />

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden lg:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="churn" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span className="hidden lg:inline">Churn Risk</span>
          </TabsTrigger>
          <TabsTrigger value="demand" className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span className="hidden lg:inline">Demand</span>
          </TabsTrigger>
          <TabsTrigger value="revenue" className="flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            <span className="hidden lg:inline">Revenue</span>
          </TabsTrigger>
          <TabsTrigger value="no-shows" className="flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden lg:inline">No-Shows</span>
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden lg:inline">Trends</span>
          </TabsTrigger>
          <TabsTrigger value="accuracy" className="flex items-center gap-1">
            <Target className="h-4 w-4" />
            <span className="hidden lg:inline">Accuracy</span>
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="flex items-center gap-1">
            <Brain className="h-4 w-4" />
            <span className="hidden lg:inline">Scenarios</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Actionable Insights */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Actionable Insights</CardTitle>
                <CardDescription>
                  Priority actions based on AI predictions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ActionableInsightCards />
              </CardContent>
            </Card>

            {/* Quick Trend View */}
            <Card>
              <CardHeader>
                <CardTitle>Key Trends</CardTitle>
                <CardDescription>Performance indicators over time</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendIndicators compact />
              </CardContent>
            </Card>

            {/* Quick Revenue Forecast */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Outlook</CardTitle>
                <CardDescription>Next 30-day projection</CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueProjectionCharts compact />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Churn Risk Tab */}
        <TabsContent value="churn" className="space-y-6">
          <ChurnRiskPatientList />
        </TabsContent>

        {/* Demand Forecasting Tab */}
        <TabsContent value="demand" className="space-y-6">
          <DemandForecastVisualization />
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-6">
          <RevenueProjectionCharts />
        </TabsContent>

        {/* No-Shows Tab */}
        <TabsContent value="no-shows" className="space-y-6">
          <NoShowRiskCalendar />
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          <TrendIndicators />
        </TabsContent>

        {/* Accuracy Tab */}
        <TabsContent value="accuracy" className="space-y-6">
          <PredictionAccuracyMetrics />
        </TabsContent>

        {/* Scenarios Tab */}
        <TabsContent value="scenarios" className="space-y-6">
          <ScenarioComparisonTool />
        </TabsContent>
      </Tabs>
    </div>
  );
}
