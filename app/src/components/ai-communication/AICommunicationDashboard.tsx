'use client';

/**
 * Epic 12: AI Communication Agent - Main Dashboard
 *
 * Central dashboard for all AI communication features including:
 * - AI Chatbot interface for patient communication
 * - Automated appointment reminders with AI-personalized messaging
 * - Patient follow-up automation
 * - Review request campaigns
 * - Birthday/anniversary automated messages
 * - No-show follow-up automation
 * - Treatment plan reminder sequences
 * - Campaign analytics with open/response rates
 */

import React, { useState } from 'react';
import { format, addDays } from 'date-fns';
import { toast } from 'sonner';
import {
  Bot,
  MessageSquare,
  RefreshCcw,
  UserPlus,
  TrendingUp,
  Calendar,
  Settings,
  Bell,
  Star,
  Cake,
  UserX,
  ClipboardList,
  BarChart3,
  Send,
  Sparkles,
  Mail,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  ArrowUpRight,
  Target,
  Heart,
  Zap,
  Plus,
  MoreHorizontal,
  Play,
  Pause,
  Edit,
  Copy,
  Eye,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import { ChatbotWidget } from './ChatbotWidget';
import { ChatHistory } from './ChatHistory';
import { RecallCampaignManager } from './RecallCampaignManager';
import { ReactivationCampaignManager } from './ReactivationCampaignManager';
import { FeedbackAnalytics } from './FeedbackAnalytics';

interface AICommunicationDashboardProps {
  className?: string;
}

// Demo data for features not yet backed by API
const demoAppointmentReminders = [
  {
    id: '1',
    patientName: '[DEMO] Sarah Johnson',
    appointmentDate: addDays(new Date(), 1),
    appointmentType: 'Adjustment',
    reminderStatus: 'sent',
    channel: 'sms',
    openedAt: new Date(),
    confirmedAt: new Date(),
  },
  {
    id: '2',
    patientName: '[DEMO] Michael Chen',
    appointmentDate: addDays(new Date(), 2),
    appointmentType: 'New Patient Exam',
    reminderStatus: 'pending',
    channel: 'email',
    openedAt: null,
    confirmedAt: null,
  },
  {
    id: '3',
    patientName: '[DEMO] Emily Williams',
    appointmentDate: addDays(new Date(), 3),
    appointmentType: 'Follow-up',
    reminderStatus: 'scheduled',
    channel: 'sms',
    openedAt: null,
    confirmedAt: null,
  },
];

const demoReviewRequests = [
  {
    id: '1',
    patientName: '[DEMO] Robert Brown',
    visitDate: addDays(new Date(), -2),
    requestSentAt: addDays(new Date(), -1),
    status: 'completed',
    rating: 5,
    platform: 'Google',
  },
  {
    id: '2',
    patientName: '[DEMO] Jennifer Davis',
    visitDate: addDays(new Date(), -3),
    requestSentAt: addDays(new Date(), -2),
    status: 'pending',
    rating: null,
    platform: 'Google',
  },
  {
    id: '3',
    patientName: '[DEMO] David Wilson',
    visitDate: addDays(new Date(), -1),
    requestSentAt: null,
    status: 'scheduled',
    rating: null,
    platform: 'Yelp',
  },
];

const demoBirthdayMessages = [
  {
    id: '1',
    patientName: '[DEMO] Lisa Anderson',
    birthday: addDays(new Date(), 2),
    messageStatus: 'scheduled',
    includesOffer: true,
    offerType: '20% off next visit',
  },
  {
    id: '2',
    patientName: '[DEMO] James Taylor',
    birthday: new Date(),
    messageStatus: 'sent',
    includesOffer: true,
    offerType: 'Free add-on service',
  },
  {
    id: '3',
    patientName: '[DEMO] Patricia Martinez',
    birthday: addDays(new Date(), -1),
    messageStatus: 'delivered',
    includesOffer: false,
    offerType: null,
  },
];

const demoNoShowFollowups = [
  {
    id: '1',
    patientName: '[DEMO] Christopher Lee',
    missedDate: addDays(new Date(), -1),
    appointmentType: 'Adjustment',
    followUpStatus: 'first_attempt',
    rescheduleLink: true,
    responseReceived: false,
  },
  {
    id: '2',
    patientName: '[DEMO] Amanda White',
    missedDate: addDays(new Date(), -3),
    appointmentType: 'Follow-up',
    followUpStatus: 'second_attempt',
    rescheduleLink: true,
    responseReceived: true,
  },
  {
    id: '3',
    patientName: '[DEMO] Daniel Harris',
    missedDate: addDays(new Date(), -7),
    appointmentType: 'New Patient',
    followUpStatus: 'final_attempt',
    rescheduleLink: true,
    responseReceived: false,
  },
];

const demoTreatmentPlanReminders = [
  {
    id: '1',
    patientName: '[DEMO] Michelle Thompson',
    planName: 'Spinal Correction Phase 1',
    visitsCompleted: 8,
    visitsTotal: 12,
    nextReminder: addDays(new Date(), 1),
    status: 'active',
  },
  {
    id: '2',
    patientName: '[DEMO] Kevin Garcia',
    planName: 'Maintenance Care',
    visitsCompleted: 3,
    visitsTotal: 6,
    nextReminder: addDays(new Date(), 3),
    status: 'active',
  },
  {
    id: '3',
    patientName: '[DEMO] Sandra Robinson',
    planName: 'Intensive Relief Care',
    visitsCompleted: 10,
    visitsTotal: 10,
    nextReminder: null,
    status: 'completed',
  },
];

const demoMessageTemplates = [
  {
    id: '1',
    name: 'Appointment Reminder - 24 Hour',
    category: 'reminders',
    channel: 'sms',
    subject: null,
    body: 'Hi {{patient_first_name}}, this is a friendly reminder about your {{appointment_type}} appointment tomorrow at {{appointment_time}} with Dr. {{provider_name}}. Reply C to confirm or call us to reschedule.',
    aiGenerated: false,
    usageCount: 1250,
  },
  {
    id: '2',
    name: 'Review Request - Post Visit',
    category: 'reviews',
    channel: 'email',
    subject: 'How was your visit with us?',
    body: 'Hi {{patient_first_name}},\n\nThank you for visiting us today! We hope your experience was excellent.\n\nIf you have a moment, wed love to hear your feedback. Your reviews help others find quality chiropractic care.\n\n{{review_link}}\n\nThank you for being a valued patient!',
    aiGenerated: true,
    usageCount: 856,
  },
  {
    id: '3',
    name: 'Birthday Greeting',
    category: 'engagement',
    channel: 'email',
    subject: 'Happy Birthday from ChiroFlow Wellness!',
    body: 'Happy Birthday, {{patient_first_name}}!\n\nWishing you a wonderful day filled with joy and good health. As a special birthday gift, enjoy {{birthday_offer}} on your next visit!\n\nThis offer is valid for 30 days.\n\nWarm wishes,\nThe ChiroFlow Wellness Team',
    aiGenerated: true,
    usageCount: 423,
  },
  {
    id: '4',
    name: 'No-Show Follow Up - First',
    category: 'follow-up',
    channel: 'sms',
    body: 'Hi {{patient_first_name}}, we missed you at your appointment today. We hope everything is okay! Would you like to reschedule? {{reschedule_link}}',
    aiGenerated: false,
    usageCount: 312,
  },
  {
    id: '5',
    name: 'Treatment Plan Progress',
    category: 'clinical',
    channel: 'email',
    subject: 'Your Treatment Progress Update',
    body: 'Hi {{patient_first_name}},\n\nGreat job on completing {{visits_completed}} of {{visits_total}} visits in your {{plan_name}}!\n\nYoure making excellent progress. Keep up the great work and remember, consistency is key to achieving your health goals.\n\nSee you at your next appointment!\n\nDr. {{provider_name}}',
    aiGenerated: true,
    usageCount: 189,
  },
];

const demoCampaignAnalytics = {
  overview: {
    totalMessagesSent: 12456,
    totalOpened: 9234,
    totalClicked: 3456,
    totalResponded: 2187,
    totalConverted: 1543,
    openRate: 74.1,
    clickRate: 27.7,
    responseRate: 17.6,
    conversionRate: 12.4,
  },
  byChannel: {
    sms: { sent: 6234, opened: 5892, clicked: 2345, responseRate: 22.3 },
    email: { sent: 5123, opened: 2984, clicked: 987, responseRate: 11.2 },
    voice: { sent: 1099, opened: 358, clicked: 124, responseRate: 8.5 },
  },
  byCampaignType: {
    reminders: { sent: 4523, openRate: 89.2, conversionRate: 78.5 },
    recall: { sent: 3234, openRate: 45.3, conversionRate: 18.7 },
    reactivation: { sent: 2156, openRate: 32.1, conversionRate: 8.3 },
    reviews: { sent: 1543, openRate: 62.4, conversionRate: 34.2 },
    birthday: { sent: 1000, openRate: 78.9, conversionRate: 45.6 },
  },
  trends: [
    { date: 'Week 1', sent: 2800, opened: 2100, converted: 340 },
    { date: 'Week 2', sent: 3100, opened: 2400, converted: 410 },
    { date: 'Week 3', sent: 2900, opened: 2200, converted: 380 },
    { date: 'Week 4', sent: 3656, opened: 2534, converted: 413 },
  ],
};

export function AICommunicationDashboard({ className }: AICommunicationDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof demoMessageTemplates[0] | null>(null);
  const [aiSuggestionLoading, setAiSuggestionLoading] = useState(false);

  // Fetch summary data
  const { data: campaigns, isLoading: campaignsLoading } = trpc.aiCommunication.listCampaigns.useQuery({
    limit: 5,
  });

  const { data: feedbackSummary, isLoading: feedbackLoading } =
    trpc.aiCommunication.getFeedbackSummary.useQuery({});

  const { data: chatHistory, isLoading: chatLoading } =
    trpc.aiCommunication.getChatHistory.useQuery({ limit: 5 });

  const activeCampaigns = campaigns?.filter(c => c.status === 'ACTIVE').length || 0;
  const totalChatSessions = chatHistory?.total || 0;

  const handleGenerateAISuggestion = () => {
    setAiSuggestionLoading(true);
    // Simulate AI generation
    setTimeout(() => {
      setAiSuggestionLoading(false);
    }, 2000);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
      sent: { variant: 'default', className: 'bg-green-500 hover:bg-green-600' },
      delivered: { variant: 'default', className: 'bg-blue-500 hover:bg-[#053e67]' },
      pending: { variant: 'secondary' },
      scheduled: { variant: 'outline' },
      completed: { variant: 'default', className: 'bg-green-500 hover:bg-green-600' },
      first_attempt: { variant: 'secondary' },
      second_attempt: { variant: 'outline', className: 'border-blue-500 text-[#053e67]' },
      final_attempt: { variant: 'destructive' },
      active: { variant: 'default' },
    };
    const config = variants[status] || { variant: 'secondary' as const };
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 text-stone-900">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Bot className="h-6 w-6 text-[#053e67]" />
            </div>
            AI Communication Agent
          </h1>
          <p className="text-stone-500 mt-1">
            Intelligent patient communication, engagement, and follow-up automation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-stone-300" onClick={() => setActiveTab('analytics')}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </Button>
          <Button variant="outline" className="border-stone-300" onClick={() => toast.info('Settings coming soon')}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="border-stone-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-[#053e67]" />
              </div>
              <div>
                <p className="text-sm text-stone-500">Chat Sessions</p>
                {chatLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-xl font-bold text-stone-900">{totalChatSessions}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                <RefreshCcw className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-stone-500">Active Campaigns</p>
                {campaignsLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-xl font-bold text-stone-900">{activeCampaigns}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Send className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-stone-500">Messages Sent</p>
                <p className="text-xl font-bold text-stone-900">
                  {demoCampaignAnalytics.overview.totalMessagesSent.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Eye className="h-4 w-4 text-[#053e67]" />
              </div>
              <div>
                <p className="text-sm text-stone-500">Open Rate</p>
                <p className="text-xl font-bold text-stone-900">
                  {demoCampaignAnalytics.overview.openRate}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-rose-100 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-rose-600" />
              </div>
              <div>
                <p className="text-sm text-stone-500">Response Rate</p>
                <p className="text-xl font-bold text-stone-900">
                  {demoCampaignAnalytics.overview.responseRate}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Target className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-stone-500">Conversion Rate</p>
                <p className="text-xl font-bold text-stone-900">
                  {demoCampaignAnalytics.overview.conversionRate}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-10 bg-stone-100">
          <TabsTrigger value="overview" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <Bot className="h-4 w-4" />
            <span className="hidden lg:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="chatbot" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden lg:inline">Chatbot</span>
          </TabsTrigger>
          <TabsTrigger value="reminders" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <Bell className="h-4 w-4" />
            <span className="hidden lg:inline">Reminders</span>
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <Star className="h-4 w-4" />
            <span className="hidden lg:inline">Reviews</span>
          </TabsTrigger>
          <TabsTrigger value="birthday" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <Cake className="h-4 w-4" />
            <span className="hidden lg:inline">Birthday</span>
          </TabsTrigger>
          <TabsTrigger value="noshow" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <UserX className="h-4 w-4" />
            <span className="hidden lg:inline">No-Show</span>
          </TabsTrigger>
          <TabsTrigger value="treatment" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden lg:inline">Treatment</span>
          </TabsTrigger>
          <TabsTrigger value="recall" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <RefreshCcw className="h-4 w-4" />
            <span className="hidden lg:inline">Recall</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <Sparkles className="h-4 w-4" />
            <span className="hidden lg:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden lg:inline">Analytics</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Quick Actions */}
          <Card className="border-stone-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#053e67]" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-stone-200 hover:border-blue-500 hover:bg-blue-50" onClick={() => toast.info('Send Broadcast feature coming soon')}>
                  <MessageSquare className="h-5 w-5 text-[#053e67]" />
                  <span className="text-xs">Send Broadcast</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-stone-200 hover:border-blue-500 hover:bg-blue-50" onClick={() => toast.info('Send Reminders feature coming soon')}>
                  <Bell className="h-5 w-5 text-green-600" />
                  <span className="text-xs">Send Reminders</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-stone-200 hover:border-blue-500 hover:bg-blue-50" onClick={() => toast.info('Request Reviews feature coming soon')}>
                  <Star className="h-5 w-5 text-[#053e67]" />
                  <span className="text-xs">Request Reviews</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-stone-200 hover:border-blue-500 hover:bg-blue-50" onClick={() => toast.info('No-Show Follow-up feature coming soon')}>
                  <UserX className="h-5 w-5 text-red-600" />
                  <span className="text-xs">No-Show Follow-up</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-stone-200 hover:border-blue-500 hover:bg-blue-50" onClick={() => setActiveTab('recall')}>
                  <RefreshCcw className="h-5 w-5 text-purple-600" />
                  <span className="text-xs">Start Recall</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-stone-200 hover:border-blue-500 hover:bg-blue-50" onClick={() => toast.info('New Campaign feature coming soon')}>
                  <Plus className="h-5 w-5 text-stone-600" />
                  <span className="text-xs">New Campaign</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recent Chat Sessions */}
            <Card className="border-stone-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-[#053e67]" />
                      Recent Chat Sessions
                    </CardTitle>
                    <CardDescription>Latest patient conversations</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('chatbot')}
                    className="text-[#053e67] hover:text-[#053e67] hover:bg-blue-50"
                  >
                    View All
                    <ArrowUpRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {chatLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : !chatHistory?.sessions?.length ? (
                  <div className="text-center py-8">
                    <MessageSquare className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                    <p className="text-stone-500">No chat sessions yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {chatHistory.sessions.slice(0, 3).map((session) => {
                      const sessionWithRelations = session as typeof session & {
                        patient?: { demographics?: { firstName?: string; lastName?: string } };
                        messages?: { content?: string }[];
                      };
                      return (
                        <div
                          key={session.id}
                          className="flex items-start justify-between p-3 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center">
                              <Bot className="h-5 w-5 text-[#053e67]" />
                            </div>
                            <div>
                              <p className="font-medium text-stone-900">
                                {sessionWithRelations.patient?.demographics
                                  ? `${sessionWithRelations.patient.demographics.firstName || ''} ${sessionWithRelations.patient.demographics.lastName || ''}`
                                  : 'Anonymous'}
                              </p>
                              <p className="text-sm text-stone-500 truncate max-w-[200px]">
                                {sessionWithRelations.messages?.[0]?.content || 'No messages'}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant={session.status === 'ACTIVE' ? 'default' : 'secondary'}
                            className={session.status === 'ACTIVE' ? 'bg-green-500' : ''}
                          >
                            {session.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Campaigns */}
            <Card className="border-stone-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCcw className="h-5 w-5 text-green-600" />
                      Active Campaigns
                    </CardTitle>
                    <CardDescription>Currently running campaigns</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('recall')}
                    className="text-[#053e67] hover:text-[#053e67] hover:bg-blue-50"
                  >
                    View All
                    <ArrowUpRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {campaignsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : !campaigns?.length ? (
                  <div className="text-center py-8">
                    <RefreshCcw className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                    <p className="text-stone-500">No campaigns yet</p>
                    <Button variant="outline" className="mt-4 border-stone-300" onClick={() => setActiveTab('recall')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Campaign
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {campaigns.slice(0, 3).map((campaign) => (
                      <div
                        key={campaign.id}
                        className="flex items-start justify-between p-3 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center">
                            <RefreshCcw className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium text-stone-900">{campaign.name}</p>
                            <p className="text-sm text-stone-500">
                              {campaign.patientCount} patients - {campaign.type.toLowerCase()}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={campaign.status === 'ACTIVE' ? 'default' : 'secondary'}
                          className={campaign.status === 'ACTIVE' ? 'bg-green-500' : ''}
                        >
                          {campaign.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Upcoming Automated Messages */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#053e67]" />
                Upcoming Automated Messages
              </CardTitle>
              <CardDescription>Messages scheduled to be sent in the next 24 hours</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border border-stone-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Bell className="h-4 w-4 text-[#053e67]" />
                    <span className="font-medium text-stone-900">Appointment Reminders</span>
                  </div>
                  <p className="text-2xl font-bold text-stone-900">24</p>
                  <p className="text-sm text-stone-500">scheduled for tomorrow</p>
                </div>
                <div className="p-4 border border-stone-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Cake className="h-4 w-4 text-pink-600" />
                    <span className="font-medium text-stone-900">Birthday Messages</span>
                  </div>
                  <p className="text-2xl font-bold text-stone-900">3</p>
                  <p className="text-sm text-stone-500">birthdays this week</p>
                </div>
                <div className="p-4 border border-stone-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="h-4 w-4 text-[#053e67]" />
                    <span className="font-medium text-stone-900">Review Requests</span>
                  </div>
                  <p className="text-2xl font-bold text-stone-900">12</p>
                  <p className="text-sm text-stone-500">to be sent today</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feedback Overview */}
          <Card className="border-stone-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                    Patient Sentiment
                  </CardTitle>
                  <CardDescription>Feedback analysis at a glance</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab('analytics')}
                  className="text-[#053e67] hover:text-[#053e67] hover:bg-blue-50"
                >
                  View Details
                  <ArrowUpRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {feedbackLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : feedbackSummary ? (
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 border border-stone-200 rounded-lg bg-green-50">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <ThumbsUp className="h-5 w-5 text-green-600" />
                    </div>
                    <p className="text-3xl font-bold text-green-600">
                      {feedbackSummary.sentimentBreakdown.positive}
                    </p>
                    <p className="text-sm text-stone-500">Positive</p>
                  </div>
                  <div className="text-center p-4 border border-stone-200 rounded-lg bg-blue-50">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <AlertCircle className="h-5 w-5 text-[#053e67]" />
                    </div>
                    <p className="text-3xl font-bold text-[#053e67]">
                      {feedbackSummary.sentimentBreakdown.neutral}
                    </p>
                    <p className="text-sm text-stone-500">Neutral</p>
                  </div>
                  <div className="text-center p-4 border border-stone-200 rounded-lg bg-red-50">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <ThumbsDown className="h-5 w-5 text-red-600" />
                    </div>
                    <p className="text-3xl font-bold text-red-600">
                      {feedbackSummary.sentimentBreakdown.negative}
                    </p>
                    <p className="text-sm text-stone-500">Negative</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <TrendingUp className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                  <p className="text-stone-500">No feedback data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chatbot Tab */}
        <TabsContent value="chatbot">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-stone-200">
              <CardHeader>
                <CardTitle>Live Chatbot Demo</CardTitle>
                <CardDescription>
                  Test the AI chatbot functionality
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChatbotWidget embedded source="dashboard" />
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle>Chatbot Features</CardTitle>
                  <CardDescription>
                    AI-powered patient communication capabilities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 border border-stone-200 rounded-lg">
                      <h4 className="font-medium flex items-center gap-2 text-stone-900">
                        <Calendar className="h-4 w-4 text-[#053e67]" />
                        Appointment Scheduling
                      </h4>
                      <p className="text-sm text-stone-500 mt-1">
                        Book, reschedule, or cancel appointments using natural language
                      </p>
                    </div>
                    <div className="p-4 border border-stone-200 rounded-lg">
                      <h4 className="font-medium flex items-center gap-2 text-stone-900">
                        <MessageSquare className="h-4 w-4 text-green-600" />
                        FAQ Answering
                      </h4>
                      <p className="text-sm text-stone-500 mt-1">
                        Answer questions about insurance, services, hours, and location
                      </p>
                    </div>
                    <div className="p-4 border border-stone-200 rounded-lg">
                      <h4 className="font-medium flex items-center gap-2 text-stone-900">
                        <Bot className="h-4 w-4 text-purple-600" />
                        Intent Detection
                      </h4>
                      <p className="text-sm text-stone-500 mt-1">
                        Automatically understand patient needs and route appropriately
                      </p>
                    </div>
                    <div className="p-4 border border-stone-200 rounded-lg">
                      <h4 className="font-medium flex items-center gap-2 text-stone-900">
                        <TrendingUp className="h-4 w-4 text-[#053e67]" />
                        Sentiment Analysis
                      </h4>
                      <p className="text-sm text-stone-500 mt-1">
                        Detect patient satisfaction and escalate when needed
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle>Chat History</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full border-stone-300"
                    onClick={() => setActiveTab('history')}
                  >
                    View All Chat History
                    <ArrowUpRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Appointment Reminders Tab */}
        <TabsContent value="reminders" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-stone-900">
                <Bell className="h-6 w-6 text-[#053e67]" />
                Appointment Reminders
              </h2>
              <p className="text-stone-500">
                AI-personalized appointment reminders with smart timing
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="border-stone-300" onClick={() => toast.info('Reminder settings coming soon')}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button className="bg-[#053e67] hover:bg-[#053e67]" onClick={() => toast.info('Send reminders feature coming soon')}>
                <Send className="h-4 w-4 mr-2" />
                Send Now
              </Button>
            </div>
          </div>

          {/* Reminder Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Sent Today</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">47</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-stone-500">Confirmed</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">38</p>
                <p className="text-xs text-stone-500">80.9% rate</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Opened</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">44</p>
                <p className="text-xs text-stone-500">93.6% rate</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-600" />
                  <span className="text-sm text-stone-500">Pending</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">24</p>
                <p className="text-xs text-stone-500">tomorrow</p>
              </CardContent>
            </Card>
          </div>

          {/* Reminder Settings Card */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Reminder Automation Settings</CardTitle>
              <CardDescription>Configure when and how reminders are sent</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">24-hour reminder</p>
                      <p className="text-sm text-stone-500">Day before appointment</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">2-hour reminder</p>
                      <p className="text-sm text-stone-500">Same day reminder</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">SMS channel</p>
                      <p className="text-sm text-stone-500">Text message reminders</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">Email channel</p>
                      <p className="text-sm text-stone-500">Email reminders</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">AI personalization</p>
                      <p className="text-sm text-stone-500">Personalized messages</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">Confirmation reply</p>
                      <p className="text-sm text-stone-500">Allow text confirmation</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Reminders */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Upcoming Reminders</CardTitle>
              <CardDescription>Reminders scheduled for the next 48 hours</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Appointment</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Confirmed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoAppointmentReminders.map((reminder) => (
                    <TableRow key={reminder.id}>
                      <TableCell className="font-medium">{reminder.patientName}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{reminder.appointmentType}</p>
                          <p className="text-sm text-stone-500">
                            {format(reminder.appointmentDate, 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {reminder.channel === 'sms' ? (
                            <MessageSquare className="h-3 w-3" />
                          ) : (
                            <Mail className="h-3 w-3" />
                          )}
                          {reminder.channel.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(reminder.reminderStatus)}</TableCell>
                      <TableCell>
                        {reminder.openedAt ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <span className="text-stone-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {reminder.confirmedAt ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <span className="text-stone-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Send className="h-4 w-4 mr-2" />
                              Send Now
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Message
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600">
                              Cancel Reminder
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Review Requests Tab */}
        <TabsContent value="reviews" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-stone-900">
                <Star className="h-6 w-6 text-[#053e67]" />
                Review Request Campaigns
              </h2>
              <p className="text-stone-500">
                Automated review requests after patient visits
              </p>
            </div>
            <Button className="bg-[#053e67] hover:bg-[#053e67]" onClick={() => toast.info('New review campaign feature coming soon')}>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </div>

          {/* Review Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Requests Sent</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">1,543</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Reviews Received</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">528</p>
                <p className="text-xs text-stone-500">34.2% conversion</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-stone-500">Avg Rating</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">4.8</p>
                <div className="flex items-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={cn(
                        'h-3 w-3',
                        star <= 4 ? 'text-blue-400 fill-blue-400' : 'text-blue-400'
                      )}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-purple-600" />
                  <span className="text-sm text-stone-500">Google Reviews</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">412</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-stone-500">Yelp Reviews</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">116</p>
              </CardContent>
            </Card>
          </div>

          {/* Review Settings */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Review Request Settings</CardTitle>
              <CardDescription>Configure automatic review requests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label>Send request after</Label>
                    <Select defaultValue="2">
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 hour after visit</SelectItem>
                        <SelectItem value="2">2 hours after visit</SelectItem>
                        <SelectItem value="24">24 hours after visit</SelectItem>
                        <SelectItem value="48">48 hours after visit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Primary platform</Label>
                    <Select defaultValue="google">
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google">Google</SelectItem>
                        <SelectItem value="yelp">Yelp</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">Skip unhappy patients</p>
                      <p className="text-sm text-stone-500">Detect negative sentiment first</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">Follow-up reminder</p>
                      <p className="text-sm text-stone-500">Send reminder if no response</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Review Requests */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Recent Review Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Visit Date</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoReviewRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.patientName}</TableCell>
                      <TableCell>{format(request.visitDate, 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{request.platform}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell>
                        {request.rating ? (
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={cn(
                                  'h-3 w-3',
                                  star <= request.rating!
                                    ? 'text-blue-400 fill-blue-400'
                                    : 'text-stone-300'
                                )}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-stone-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => toast.info('Review request options coming soon')}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Birthday/Anniversary Tab */}
        <TabsContent value="birthday" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-stone-900">
                <Cake className="h-6 w-6 text-pink-600" />
                Birthday & Anniversary Messages
              </h2>
              <p className="text-stone-500">
                Automated celebratory messages with special offers
              </p>
            </div>
            <Button className="bg-[#053e67] hover:bg-[#053e67]" onClick={() => toast.info('Birthday message configuration coming soon')}>
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
          </div>

          {/* Birthday Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Cake className="h-4 w-4 text-pink-600" />
                  <span className="text-sm text-stone-500">This Week</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">12</p>
                <p className="text-xs text-stone-500">birthdays coming up</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Sent This Month</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">89</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-stone-500">Offers Redeemed</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">34</p>
                <p className="text-xs text-stone-500">38.2% redemption</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-stone-500">Anniversaries</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">8</p>
                <p className="text-xs text-stone-500">patient anniversaries</p>
              </CardContent>
            </Card>
          </div>

          {/* Birthday Settings */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Birthday Message Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">Auto-send birthday messages</p>
                      <p className="text-sm text-stone-500">Send on patients birthday</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">Include special offer</p>
                      <p className="text-sm text-stone-500">Add discount or free service</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>Offer type</Label>
                    <Select defaultValue="percent">
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">20% off next visit</SelectItem>
                        <SelectItem value="addon">Free add-on service</SelectItem>
                        <SelectItem value="product">Free product</SelectItem>
                        <SelectItem value="custom">Custom offer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Offer validity</Label>
                    <Select defaultValue="30">
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Birthdays */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Upcoming Birthday Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Birthday</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Includes Offer</TableHead>
                    <TableHead>Offer</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoBirthdayMessages.map((msg) => (
                    <TableRow key={msg.id}>
                      <TableCell className="font-medium">{msg.patientName}</TableCell>
                      <TableCell>{format(msg.birthday, 'MMM d')}</TableCell>
                      <TableCell>{getStatusBadge(msg.messageStatus)}</TableCell>
                      <TableCell>
                        {msg.includesOffer ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <span className="text-stone-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>{msg.offerType || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => toast.info('Message options coming soon')}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* No-Show Follow-up Tab */}
        <TabsContent value="noshow" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-stone-900">
                <UserX className="h-6 w-6 text-red-600" />
                No-Show Follow-up Automation
              </h2>
              <p className="text-stone-500">
                Automated outreach to patients who missed appointments
              </p>
            </div>
            <Button className="bg-[#053e67] hover:bg-[#053e67]" onClick={() => toast.info('Send follow-ups feature coming soon')}>
              <Send className="h-4 w-4 mr-2" />
              Send Follow-ups
            </Button>
          </div>

          {/* No-Show Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-stone-500">No-Shows Today</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">3</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Follow-ups Sent</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">12</p>
                <p className="text-xs text-stone-500">this week</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-stone-500">Rescheduled</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">8</p>
                <p className="text-xs text-stone-500">66.7% success rate</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Pending Response</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">4</p>
              </CardContent>
            </Card>
          </div>

          {/* No-Show Follow-up Settings */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Follow-up Sequence Settings</CardTitle>
              <CardDescription>Configure automatic follow-up messages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 border border-stone-200 rounded-lg">
                  <Badge variant="outline">Step 1</Badge>
                  <div className="flex-1">
                    <p className="font-medium text-stone-900">First follow-up</p>
                    <p className="text-sm text-stone-500">SMS 1 hour after missed appointment</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center gap-4 p-4 border border-stone-200 rounded-lg">
                  <Badge variant="outline">Step 2</Badge>
                  <div className="flex-1">
                    <p className="font-medium text-stone-900">Second follow-up</p>
                    <p className="text-sm text-stone-500">Email 24 hours after first message</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center gap-4 p-4 border border-stone-200 rounded-lg">
                  <Badge variant="outline">Step 3</Badge>
                  <div className="flex-1">
                    <p className="font-medium text-stone-900">Final attempt</p>
                    <p className="text-sm text-stone-500">Phone call 3 days after no response</p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* No-Show Follow-ups List */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Recent No-Show Follow-ups</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Missed Date</TableHead>
                    <TableHead>Appointment Type</TableHead>
                    <TableHead>Follow-up Status</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoNoShowFollowups.map((followup) => (
                    <TableRow key={followup.id}>
                      <TableCell className="font-medium">{followup.patientName}</TableCell>
                      <TableCell>{format(followup.missedDate, 'MMM d')}</TableCell>
                      <TableCell>{followup.appointmentType}</TableCell>
                      <TableCell>{getStatusBadge(followup.followUpStatus)}</TableCell>
                      <TableCell>
                        {followup.responseReceived ? (
                          <Badge variant="default" className="bg-green-500">Responded</Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => toast.info('Reschedule feature coming soon')}>
                          <Calendar className="h-4 w-4 mr-1" />
                          Reschedule
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Treatment Plan Reminders Tab */}
        <TabsContent value="treatment" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-stone-900">
                <ClipboardList className="h-6 w-6 text-purple-600" />
                Treatment Plan Reminders
              </h2>
              <p className="text-stone-500">
                Automated progress updates and appointment reminders for active treatment plans
              </p>
            </div>
            <Button className="bg-[#053e67] hover:bg-[#053e67]" onClick={() => toast.info('New sequence feature coming soon')}>
              <Plus className="h-4 w-4 mr-2" />
              New Sequence
            </Button>
          </div>

          {/* Treatment Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-purple-600" />
                  <span className="text-sm text-stone-500">Active Plans</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">156</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Reminders Sent</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">423</p>
                <p className="text-xs text-stone-500">this month</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-stone-500">Completion Rate</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">78%</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Avg Progress</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">67%</p>
              </CardContent>
            </Card>
          </div>

          {/* Active Treatment Plans */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Active Treatment Plan Reminders</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Plan Name</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Next Reminder</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoTreatmentPlanReminders.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.patientName}</TableCell>
                      <TableCell>{plan.planName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={(plan.visitsCompleted / plan.visitsTotal) * 100}
                            className="w-20"
                          />
                          <span className="text-sm text-stone-500">
                            {plan.visitsCompleted}/{plan.visitsTotal}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {plan.nextReminder ? format(plan.nextReminder, 'MMM d') : '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(plan.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => toast.info('Treatment plan options coming soon')}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recall Tab */}
        <TabsContent value="recall">
          <RecallCampaignManager />
        </TabsContent>

        {/* Message Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-stone-900">
                <Sparkles className="h-6 w-6 text-[#053e67]" />
                Message Templates
              </h2>
              <p className="text-stone-500">
                AI-enhanced message templates with personalization
              </p>
            </div>
            <Button
              className="bg-[#053e67] hover:bg-[#053e67]"
              onClick={() => {
                setSelectedTemplate(null);
                setShowTemplateDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>

          {/* Template Categories */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {['reminders', 'reviews', 'engagement', 'follow-up', 'clinical'].map((category) => (
              <Card
                key={category}
                className="border-stone-200 cursor-pointer hover:border-blue-500 transition-colors"
              >
                <CardContent className="pt-6 text-center">
                  <p className="font-medium text-stone-900 capitalize">{category}</p>
                  <p className="text-sm text-stone-500">
                    {demoMessageTemplates.filter((t) => t.category === category).length} templates
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Templates List */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>All Templates</CardTitle>
              <CardDescription>Click a template to view or edit</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>AI Generated</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoMessageTemplates.map((template) => (
                    <TableRow
                      key={template.id}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setShowTemplateDialog(true);
                      }}
                    >
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {template.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1">
                          {template.channel === 'sms' ? (
                            <MessageSquare className="h-3 w-3" />
                          ) : (
                            <Mail className="h-3 w-3" />
                          )}
                          {template.channel.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {template.aiGenerated ? (
                          <Badge variant="default" className="bg-purple-500 gap-1">
                            <Sparkles className="h-3 w-3" />
                            AI
                          </Badge>
                        ) : (
                          <span className="text-stone-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>{template.usageCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Sparkles className="h-4 w-4 mr-2" />
                              AI Improve
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-stone-900">
                <BarChart3 className="h-6 w-6 text-[#053e67]" />
                Campaign Analytics
              </h2>
              <p className="text-stone-500">
                Comprehensive analytics across all communication campaigns
              </p>
            </div>
            <Select defaultValue="30">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Total Sent</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">
                  {demoCampaignAnalytics.overview.totalMessagesSent.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-[#053e67]" />
                  <span className="text-sm text-stone-500">Open Rate</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">
                  {demoCampaignAnalytics.overview.openRate}%
                </p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-purple-600" />
                  <span className="text-sm text-stone-500">Click Rate</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">
                  {demoCampaignAnalytics.overview.clickRate}%
                </p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-stone-500">Response Rate</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">
                  {demoCampaignAnalytics.overview.responseRate}%
                </p>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-stone-500">Conversion Rate</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 mt-1">
                  {demoCampaignAnalytics.overview.conversionRate}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Analytics by Channel */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Performance by Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-4 border border-stone-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-stone-900">SMS</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-stone-500">Sent</span>
                      <span className="font-medium">{demoCampaignAnalytics.byChannel.sms.sent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-stone-500">Opened</span>
                      <span className="font-medium">{demoCampaignAnalytics.byChannel.sms.opened.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-stone-500">Response Rate</span>
                      <span className="font-medium text-green-600">{demoCampaignAnalytics.byChannel.sms.responseRate}%</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 border border-stone-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <Mail className="h-5 w-5 text-[#053e67]" />
                    <span className="font-medium text-stone-900">Email</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-stone-500">Sent</span>
                      <span className="font-medium">{demoCampaignAnalytics.byChannel.email.sent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-stone-500">Opened</span>
                      <span className="font-medium">{demoCampaignAnalytics.byChannel.email.opened.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-stone-500">Response Rate</span>
                      <span className="font-medium text-[#053e67]">{demoCampaignAnalytics.byChannel.email.responseRate}%</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 border border-stone-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <Phone className="h-5 w-5 text-purple-600" />
                    <span className="font-medium text-stone-900">Voice</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-stone-500">Sent</span>
                      <span className="font-medium">{demoCampaignAnalytics.byChannel.voice.sent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-stone-500">Answered</span>
                      <span className="font-medium">{demoCampaignAnalytics.byChannel.voice.opened.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-stone-500">Response Rate</span>
                      <span className="font-medium text-purple-600">{demoCampaignAnalytics.byChannel.voice.responseRate}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Analytics by Campaign Type */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Performance by Campaign Type</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign Type</TableHead>
                    <TableHead>Messages Sent</TableHead>
                    <TableHead>Open Rate</TableHead>
                    <TableHead>Conversion Rate</TableHead>
                    <TableHead>Performance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(demoCampaignAnalytics.byCampaignType).map(([type, data]) => (
                    <TableRow key={type}>
                      <TableCell className="font-medium capitalize">{type}</TableCell>
                      <TableCell>{data.sent.toLocaleString()}</TableCell>
                      <TableCell>{data.openRate}%</TableCell>
                      <TableCell>{data.conversionRate}%</TableCell>
                      <TableCell>
                        <Progress value={data.conversionRate} className="w-24" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Trends */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Weekly Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {demoCampaignAnalytics.trends.map((week, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <span className="w-16 text-sm text-stone-500">{week.date}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 bg-blue-100 rounded-full h-4 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full"
                          style={{ width: `${(week.sent / 4000) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 text-sm text-stone-600">{week.sent}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 bg-green-100 rounded-full h-4 overflow-hidden">
                        <div
                          className="bg-green-500 h-full"
                          style={{ width: `${(week.opened / 3000) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 text-sm text-stone-600">{week.opened}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 bg-blue-100 rounded-full h-4 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full"
                          style={{ width: `${(week.converted / 500) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 text-sm text-stone-600">{week.converted}</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-4 pt-2 border-t">
                  <span className="w-16"></span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-500 rounded" />
                    <span className="text-sm text-stone-500">Sent</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-500 rounded" />
                    <span className="text-sm text-stone-500">Opened</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-500 rounded" />
                    <span className="text-sm text-stone-500">Converted</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedTemplate ? 'Edit Template' : 'Create New Template'}
            </DialogTitle>
            <DialogDescription>
              Create or edit message templates with AI assistance
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Template Name</Label>
                <Input
                  defaultValue={selectedTemplate?.name}
                  placeholder="e.g., Appointment Reminder"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select defaultValue={selectedTemplate?.category || 'reminders'}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reminders">Reminders</SelectItem>
                    <SelectItem value="reviews">Reviews</SelectItem>
                    <SelectItem value="engagement">Engagement</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="clinical">Clinical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Channel</Label>
              <Select defaultValue={selectedTemplate?.channel || 'email'}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="voice">Voice</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedTemplate?.channel === 'email' && (
              <div>
                <Label>Subject Line</Label>
                <Input
                  defaultValue={selectedTemplate?.subject || ''}
                  placeholder="Email subject"
                  className="mt-1"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Message Body</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateAISuggestion}
                  disabled={aiSuggestionLoading}
                  className="gap-1"
                >
                  <Sparkles className="h-4 w-4" />
                  {aiSuggestionLoading ? 'Generating...' : 'AI Suggest'}
                </Button>
              </div>
              <Textarea
                defaultValue={selectedTemplate?.body}
                placeholder="Write your message here. Use {{variable}} for personalization."
                className="mt-1 min-h-[200px]"
              />
              <p className="text-xs text-stone-500 mt-1">
                Available variables: {`{{patient_first_name}}, {{patient_last_name}}, {{appointment_date}}, {{appointment_time}}, {{provider_name}}, {{appointment_type}}`}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-[#053e67] hover:bg-[#053e67]" onClick={() => {
              toast.success(selectedTemplate ? 'Template saved' : 'Template created');
              setShowTemplateDialog(false);
            }}>
              {selectedTemplate ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AICommunicationDashboard;
