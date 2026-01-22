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
  Phone,
  MessageSquare,
  AlertTriangle,
  BookOpen,
  Settings,
  Clock,
  CheckCircle,
  PhoneCall,
  PhoneOff,
  Mic,
  BarChart3,
  Activity,
  Users,
} from 'lucide-react';
import { LiveConversationsPanel } from './LiveConversationsPanel';
import { ConversationHistoryPanel } from './ConversationHistoryPanel';
import { EscalationQueuePanel } from './EscalationQueuePanel';
import { PerformanceMetricsPanel } from './PerformanceMetricsPanel';
import { KnowledgeBasePanel } from './KnowledgeBasePanel';
import { VoiceConfigPanel } from './VoiceConfigPanel';
import { BusinessHoursPanel } from './BusinessHoursPanel';

export function AIReceptionistDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  // Get active calls
  const { data: activeCalls, isLoading: activeCallsLoading, refetch: refetchActiveCalls } =
    trpc.aiReceptionist.getActiveCalls.useQuery(undefined, {
      refetchInterval: 5000, // Poll every 5 seconds for live updates
    });

  // Get pending escalations
  const { data: pendingEscalations, isLoading: escalationsLoading, refetch: refetchEscalations } =
    trpc.aiReceptionist.getPendingEscalations.useQuery({ limit: 10 });

  // Get recent conversations
  const { data: recentConversations, isLoading: conversationsLoading } =
    trpc.aiReceptionist.getConversations.useQuery({ limit: 5 });

  // Get voice metrics for the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: metrics, isLoading: metricsLoading } =
    trpc.aiReceptionist.getVoiceMetrics.useQuery({
      startDate: sevenDaysAgo,
      endDate: new Date(),
    });

  // Get voice config
  const { data: voiceConfig, isLoading: configLoading } =
    trpc.aiReceptionist.getVoiceConfig.useQuery();

  const isLoading = activeCallsLoading || escalationsLoading || conversationsLoading || metricsLoading || configLoading;

  const handleRefresh = () => {
    refetchActiveCalls();
    refetchEscalations();
  };

  if (isLoading) {
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

  const activeCallCount = activeCalls?.length || 0;
  const pendingEscalationCount = pendingEscalations?.length || 0;
  const totalCallsToday = metrics?.totalCalls || 0;
  const resolutionRate = metrics?.resolutionRate ? Math.round(metrics.resolutionRate * 100) : 0;
  const appointmentsBooked = metrics?.appointmentsBooked || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-8 w-8" />
            AI Receptionist
          </h1>
          <p className="text-muted-foreground mt-1">
            24/7 intelligent phone handling and patient communication
          </p>
        </div>
        <div className="flex items-center gap-2">
          {voiceConfig ? (
            <Badge variant="default" className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Configured
            </Badge>
          ) : (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Not Configured
            </Badge>
          )}
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Active Calls */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === 'live' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
            <PhoneCall className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeCallCount}</div>
            <p className="text-xs text-muted-foreground">
              Conversations in progress
            </p>
          </CardContent>
        </Card>

        {/* Pending Escalations */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === 'escalations' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('escalations')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Escalations</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${pendingEscalationCount > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${pendingEscalationCount > 0 ? 'text-yellow-600' : ''}`}>
              {pendingEscalationCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Needs human attention
            </p>
          </CardContent>
        </Card>

        {/* Calls Today */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === 'metrics' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('metrics')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calls (7 days)</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCallsToday}</div>
            <p className="text-xs text-muted-foreground">
              Total conversations
            </p>
          </CardContent>
        </Card>

        {/* Resolution Rate */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === 'history' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolution Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{resolutionRate}%</div>
            <p className="text-xs text-muted-foreground">
              Handled without escalation
            </p>
          </CardContent>
        </Card>

        {/* Appointments Booked */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === 'history' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Booked</CardTitle>
            <Users className="h-4 w-4 text-[#053e67]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#053e67]">{appointmentsBooked}</div>
            <p className="text-xs text-muted-foreground">
              Appointments scheduled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Status Bar */}
      {activeCallCount > 0 && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="py-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-600 animate-pulse" />
                <span className="text-sm font-medium text-green-800">
                  {activeCallCount} active {activeCallCount === 1 ? 'call' : 'calls'}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-green-700 border-green-300 hover:bg-green-100"
                onClick={() => setActiveTab('live')}
              >
                Monitor Live
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="live" className="flex items-center gap-1">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Live</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger value="escalations" className="flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Escalations</span>
          </TabsTrigger>
          <TabsTrigger value="metrics" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Metrics</span>
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="flex items-center gap-1">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Knowledge</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AI Capabilities Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  AI Capabilities
                </CardTitle>
                <CardDescription>
                  Automated phone handling powered by AI
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Phone className="h-5 w-5 text-[#053e67]" />
                  </div>
                  <div>
                    <h4 className="font-medium">Intelligent Call Handling</h4>
                    <p className="text-sm text-muted-foreground">
                      Natural voice AI with Twilio and OpenAI integration
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Appointment Scheduling</h4>
                    <p className="text-sm text-muted-foreground">
                      Book, reschedule, and cancel appointments via voice
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <BookOpen className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Knowledge Base FAQ</h4>
                    <p className="text-sm text-muted-foreground">
                      Answer questions about hours, insurance, services, and more
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Smart Escalation</h4>
                    <p className="text-sm text-muted-foreground">
                      Detect frustration, clinical questions, and complex requests
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <MessageSquare className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Multi-Channel Support</h4>
                    <p className="text-sm text-muted-foreground">
                      Phone, chat widget, SMS, and email conversations
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent Conversations
                </CardTitle>
                <CardDescription>Latest AI receptionist activity</CardDescription>
              </CardHeader>
              <CardContent>
                {recentConversations?.conversations && recentConversations.conversations.length > 0 ? (
                  <div className="space-y-3">
                    {recentConversations.conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${
                            conv.channel === 'PHONE' ? 'bg-blue-100' :
                            conv.channel === 'CHAT' ? 'bg-green-100' :
                            conv.channel === 'SMS' ? 'bg-purple-100' : 'bg-gray-100'
                          }`}>
                            {conv.channel === 'PHONE' && <Phone className="h-4 w-4 text-blue-600" />}
                            {conv.channel === 'CHAT' && <MessageSquare className="h-4 w-4 text-green-600" />}
                            {conv.channel === 'SMS' && <Mic className="h-4 w-4 text-purple-600" />}
                            {conv.channel === 'EMAIL' && <MessageSquare className="h-4 w-4 text-gray-600" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {conv.patient?.demographics
                                ? `${conv.patient.demographics.firstName} ${conv.patient.demographics.lastName}`
                                : conv.phoneNumber || 'Unknown Caller'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {conv.summary || `${conv.channel} conversation`}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            conv.status === 'COMPLETED' ? 'default' :
                            conv.status === 'ESCALATED' ? 'destructive' :
                            conv.status === 'ACTIVE' ? 'secondary' : 'outline'
                          }
                        >
                          {conv.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <PhoneOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No recent conversations</p>
                    <p className="text-xs">Conversations will appear here when callers connect</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="live">
          <LiveConversationsPanel />
        </TabsContent>

        <TabsContent value="history">
          <ConversationHistoryPanel />
        </TabsContent>

        <TabsContent value="escalations">
          <EscalationQueuePanel />
        </TabsContent>

        <TabsContent value="metrics">
          <PerformanceMetricsPanel />
        </TabsContent>

        <TabsContent value="knowledge">
          <KnowledgeBasePanel />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <VoiceConfigPanel />
          <BusinessHoursPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
