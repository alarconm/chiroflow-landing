'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import {
  Settings,
  Shield,
  Send,
  DollarSign,
  AlertTriangle,
  Activity,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import {
  ClearinghouseConfigManager,
  EligibilityChecker,
  ClaimSubmissionList,
  RemittanceList,
  DenialManager,
} from '@/components/clearinghouse';

export default function ClearinghouseDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: primaryConfig } = trpc.clearinghouse.getPrimaryConfig.useQuery();
  const { data: denialStats } = trpc.clearinghouse.getDenialStats.useQuery();

  // Get submission counts by status
  const { data: submissions } = trpc.clearinghouse.listSubmissions.useQuery({
    limit: 100, // Get recent submissions for stats
  });

  const submissionStats = submissions?.submissions.reduce(
    (acc, sub) => {
      acc[sub.status] = (acc[sub.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ) || {};

  const totalSubmissions = submissions?.pagination.total || 0;
  const acceptedCount = submissionStats['ACCEPTED'] || 0;
  const pendingCount = (submissionStats['PENDING'] || 0) + (submissionStats['SUBMITTED'] || 0);
  const rejectedCount = (submissionStats['REJECTED'] || 0) + (submissionStats['FAILED'] || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Clearinghouse</h1>
          <p className="text-muted-foreground">
            Electronic claims submission, eligibility verification, and remittance processing
          </p>
        </div>
        {primaryConfig && (
          <Badge variant="outline" className="text-sm">
            <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
            {primaryConfig.providerName} Connected
          </Badge>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Claims</p>
                <p className="text-2xl font-bold">{totalSubmissions}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Accepted</p>
                <p className="text-2xl font-bold text-green-600">{acceptedCount}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-[#053e67]">{pendingCount}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Denials</p>
                <p className="text-2xl font-bold text-orange-600">
                  {denialStats?.byStatus.find((s) => s.status === 'NEW')?.count || 0}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="submissions" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Submissions
          </TabsTrigger>
          <TabsTrigger value="eligibility" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Eligibility
          </TabsTrigger>
          <TabsTrigger value="remittances" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Remittances
          </TabsTrigger>
          <TabsTrigger value="denials" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Denials
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Overview content */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Connection Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Connection Status</CardTitle>
                <CardDescription>Primary clearinghouse configuration</CardDescription>
              </CardHeader>
              <CardContent>
                {primaryConfig ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Provider</span>
                      <span className="font-medium">{primaryConfig.providerName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className="bg-green-500">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Configuration</span>
                      <span className="font-medium">{primaryConfig.name}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <AlertTriangle className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No clearinghouse configured. Go to Settings to set up.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Denial Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Denial Summary</CardTitle>
                <CardDescription>Open denials requiring attention</CardDescription>
              </CardHeader>
              <CardContent>
                {denialStats ? (
                  <div className="space-y-3">
                    {denialStats.byStatus.map((s) => (
                      <div key={s.status} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{s.status}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{s.count}</Badge>
                          <span className="text-sm text-muted-foreground">
                            ${s.totalDenied.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">No denial data available</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Submissions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Submissions</CardTitle>
              <CardDescription>Latest claim submissions to clearinghouse</CardDescription>
            </CardHeader>
            <CardContent>
              <ClaimSubmissionList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submissions" className="mt-6">
          <ClaimSubmissionList />
        </TabsContent>

        <TabsContent value="eligibility" className="mt-6">
          <EligibilityChecker />
        </TabsContent>

        <TabsContent value="remittances" className="mt-6">
          <RemittanceList />
        </TabsContent>

        <TabsContent value="denials" className="mt-6">
          <DenialManager />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <ClearinghouseConfigManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
