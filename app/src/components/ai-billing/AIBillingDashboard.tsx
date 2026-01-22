'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bot,
  RefreshCw,
  FileCheck,
  AlertTriangle,
  FileText,
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import { ClaimScrubQueue } from './ClaimScrubQueue';
import { DenialPredictionPanel } from './DenialPredictionPanel';
import { AppealGeneratorPanel } from './AppealGeneratorPanel';
import { PaymentMatchingPanel } from './PaymentMatchingPanel';
import { UnderpaymentAlerts } from './UnderpaymentAlerts';
import { BatchJobsPanel } from './BatchJobsPanel';

// Type for job from router query
interface JobFromRouter {
  id: string;
  jobType: string;
  status: string;
}

export function AIBillingDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } =
    trpc.aiBilling.getDashboardSummary.useQuery();

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-8 w-8" />
            AI Billing Agent
          </h1>
          <p className="text-muted-foreground mt-1">
            Autonomous billing operations with AI-powered capabilities
          </p>
        </div>
        <Button onClick={() => refetchSummary()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Scrub Queue */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === 'scrubbing' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('scrubbing')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scrub Queue</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.scrubQueue.count || 0}</div>
            <p className="text-xs text-muted-foreground">
              Claims need pre-submission validation
            </p>
          </CardContent>
        </Card>

        {/* High Risk Claims */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === 'predictions' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('predictions')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{summary?.highRiskClaims.count || 0}</div>
            <p className="text-xs text-muted-foreground">
              Claims with denial risk
            </p>
          </CardContent>
        </Card>

        {/* Pending Appeals */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === 'appeals' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('appeals')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Appeals</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.pendingAppeals.count || 0}</div>
            <p className="text-xs text-muted-foreground">
              Appeals ready to send
            </p>
          </CardContent>
        </Card>

        {/* Unmatched Payments */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === 'matching' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('matching')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unmatched</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.unmatchedPayments.count || 0}</div>
            <p className="text-xs text-muted-foreground">
              Payments need matching
            </p>
          </CardContent>
        </Card>

        {/* Underpayments */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === 'underpayments' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('underpayments')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recovery</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${summary?.underpayments.potentialRecovery?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Potential recovery ({summary?.underpayments.count || 0} claims)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Jobs Status */}
      {summary?.recentJobs && summary.recentJobs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent AI Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(summary.recentJobs as JobFromRouter[]).map((job) => (
                <Badge
                  key={job.id}
                  variant={
                    job.status === 'COMPLETED' ? 'default' :
                    job.status === 'RUNNING' ? 'secondary' :
                    job.status === 'FAILED' ? 'destructive' : 'outline'
                  }
                  className="flex items-center gap-1"
                >
                  {job.status === 'COMPLETED' && <CheckCircle className="h-3 w-3" />}
                  {job.status === 'RUNNING' && <RefreshCw className="h-3 w-3 animate-spin" />}
                  {job.status === 'FAILED' && <XCircle className="h-3 w-3" />}
                  {job.status === 'QUEUED' && <Clock className="h-3 w-3" />}
                  {job.jobType.replace('_', ' ')}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="scrubbing" className="flex items-center gap-1">
            <FileCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Scrubbing</span>
          </TabsTrigger>
          <TabsTrigger value="predictions" className="flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Predictions</span>
          </TabsTrigger>
          <TabsTrigger value="appeals" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Appeals</span>
          </TabsTrigger>
          <TabsTrigger value="matching" className="flex items-center gap-1">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Matching</span>
          </TabsTrigger>
          <TabsTrigger value="underpayments" className="flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Recovery</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AI Capabilities Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  AI Capabilities
                </CardTitle>
                <CardDescription>
                  Automated billing operations powered by AI
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FileCheck className="h-5 w-5 text-[#053e67]" />
                  </div>
                  <div>
                    <h4 className="font-medium">Claim Scrubbing</h4>
                    <p className="text-sm text-muted-foreground">
                      Pre-submission validation with 30+ rules for chiropractic billing
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Denial Prediction</h4>
                    <p className="text-sm text-muted-foreground">
                      ML-based risk scoring with historical pattern analysis
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <FileText className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Appeal Generation</h4>
                    <p className="text-sm text-muted-foreground">
                      Template-based appeal letters with clinical citations
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CreditCard className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Payment Matching</h4>
                    <p className="text-sm text-muted-foreground">
                      Intelligent ERA/EOB matching with confidence scoring
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Underpayment Detection</h4>
                    <p className="text-sm text-muted-foreground">
                      Compare payments against fee schedules and contracts
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Batch Jobs Panel */}
            <BatchJobsPanel />
          </div>
        </TabsContent>

        <TabsContent value="scrubbing">
          <ClaimScrubQueue />
        </TabsContent>

        <TabsContent value="predictions">
          <DenialPredictionPanel />
        </TabsContent>

        <TabsContent value="appeals">
          <AppealGeneratorPanel />
        </TabsContent>

        <TabsContent value="matching">
          <PaymentMatchingPanel />
        </TabsContent>

        <TabsContent value="underpayments">
          <UnderpaymentAlerts />
        </TabsContent>
      </Tabs>
    </div>
  );
}
