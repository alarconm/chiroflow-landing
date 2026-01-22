'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { trpc } from '@/trpc/client';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { toast } from 'sonner';
import {
  Mail,
  MessageSquare,
  Phone,
  Bell,
  FileText,
  Settings,
  Send,
  Inbox,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Users,
  Calendar,
  Search,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  Eye,
  Copy,
  Play,
  Pause,
  Download,
  RefreshCw,
  Filter,
  Megaphone,
  Radio,
  BarChart3,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  User,
  Check,
  CheckCheck,
  X,
  Sparkles,
  Zap,
} from 'lucide-react';
import { MessageTemplateManager } from './MessageTemplateManager';
import { MessageComposer } from './MessageComposer';
import { MessageInbox } from './MessageInbox';
import { ReminderRuleManager } from './ReminderRuleManager';
import { cn } from '@/lib/utils';

// Types
type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'PAUSED' | 'CANCELLED';
type CommunicationChannel = 'SMS' | 'EMAIL';
type MessageStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'READ' | 'BOUNCED';

interface Campaign {
  id: string;
  name: string;
  channel: CommunicationChannel;
  status: CampaignStatus;
  subject?: string;
  body: string;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  scheduledAt?: Date;
  createdAt: Date;
  completedAt?: Date;
}

interface Broadcast {
  id: string;
  title: string;
  message: string;
  type: 'ANNOUNCEMENT' | 'HOLIDAY' | 'PROMOTION' | 'EMERGENCY';
  channels: CommunicationChannel[];
  recipientCount: number;
  sentAt: Date;
  status: 'SENT' | 'FAILED' | 'PARTIAL';
}

interface CommunicationLog {
  id: string;
  channel: CommunicationChannel;
  direction: 'INBOUND' | 'OUTBOUND';
  patientName: string;
  patientId: string;
  subject?: string;
  body: string;
  status: MessageStatus;
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
}

// Demo data
const demoCampaigns: Campaign[] = [
  {
    id: '1',
    name: '[DEMO] January Wellness Check-up Reminder',
    channel: 'SMS',
    status: 'COMPLETED',
    body: 'Hi {{firstName}}, it\'s time for your wellness check-up! Call us at (555) 123-4567 to schedule.',
    recipientCount: 245,
    sentCount: 245,
    deliveredCount: 238,
    failedCount: 7,
    scheduledAt: subDays(new Date(), 3),
    createdAt: subDays(new Date(), 5),
    completedAt: subDays(new Date(), 3),
  },
  {
    id: '2',
    name: '[DEMO] New Year Special Promotion',
    channel: 'EMAIL',
    status: 'SENDING',
    subject: 'Start 2026 with Better Health - 20% Off Your First Visit!',
    body: '<p>Dear {{firstName}},</p><p>Kick off the new year with a focus on your health...</p>',
    recipientCount: 892,
    sentCount: 567,
    deliveredCount: 534,
    failedCount: 12,
    scheduledAt: new Date(),
    createdAt: subDays(new Date(), 2),
  },
  {
    id: '3',
    name: '[DEMO] Valentine\'s Day Couples Massage',
    channel: 'EMAIL',
    status: 'SCHEDULED',
    subject: 'Treat Your Valentine to a Relaxing Experience',
    body: '<p>Show your loved one you care with our special couples massage package...</p>',
    recipientCount: 456,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    scheduledAt: new Date(2026, 1, 10, 9, 0),
    createdAt: subDays(new Date(), 1),
  },
  {
    id: '4',
    name: '[DEMO] Appointment Confirmation Follow-up',
    channel: 'SMS',
    status: 'DRAFT',
    body: 'Your appointment is confirmed for {{appointmentDate}} at {{appointmentTime}}. Reply C to confirm or R to reschedule.',
    recipientCount: 0,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    createdAt: new Date(),
  },
];

const demoBroadcasts: Broadcast[] = [
  {
    id: '1',
    title: '[DEMO] Office Closure - Martin Luther King Jr. Day',
    message: 'Our office will be closed on Monday, January 20th in observance of MLK Day. We will resume normal hours on Tuesday.',
    type: 'HOLIDAY',
    channels: ['SMS', 'EMAIL'],
    recipientCount: 1234,
    sentAt: subDays(new Date(), 5),
    status: 'SENT',
  },
  {
    id: '2',
    title: '[DEMO] New Extended Hours',
    message: 'Great news! We now offer extended evening hours on Wednesdays until 8 PM. Book your after-work appointment today!',
    type: 'ANNOUNCEMENT',
    channels: ['EMAIL'],
    recipientCount: 1456,
    sentAt: subDays(new Date(), 10),
    status: 'SENT',
  },
  {
    id: '3',
    title: '[DEMO] Spring Special - Free Consultation',
    message: 'Refer a friend and you both receive a FREE 30-minute consultation. Use code SPRING2026.',
    type: 'PROMOTION',
    channels: ['SMS', 'EMAIL'],
    recipientCount: 2100,
    sentAt: subDays(new Date(), 15),
    status: 'PARTIAL',
  },
];

const demoCommunicationLogs: CommunicationLog[] = [
  {
    id: '1',
    channel: 'SMS',
    direction: 'OUTBOUND',
    patientName: '[DEMO] John Smith',
    patientId: 'p1',
    body: 'Reminder: Your appointment is tomorrow at 2:30 PM. Reply C to confirm.',
    status: 'DELIVERED',
    sentAt: subDays(new Date(), 0),
    deliveredAt: subDays(new Date(), 0),
  },
  {
    id: '2',
    channel: 'SMS',
    direction: 'INBOUND',
    patientName: '[DEMO] John Smith',
    patientId: 'p1',
    body: 'C',
    status: 'READ',
    sentAt: subDays(new Date(), 0),
    readAt: subDays(new Date(), 0),
  },
  {
    id: '3',
    channel: 'EMAIL',
    direction: 'OUTBOUND',
    patientName: '[DEMO] Sarah Johnson',
    patientId: 'p2',
    subject: 'Your Treatment Plan Summary',
    body: 'Dear Sarah, please find attached your treatment plan summary from your recent visit...',
    status: 'READ',
    sentAt: subDays(new Date(), 1),
    deliveredAt: subDays(new Date(), 1),
    readAt: subDays(new Date(), 1),
  },
  {
    id: '4',
    channel: 'SMS',
    direction: 'OUTBOUND',
    patientName: '[DEMO] Michael Brown',
    patientId: 'p3',
    body: 'Your prescription is ready for pickup at our office.',
    status: 'FAILED',
    sentAt: subDays(new Date(), 1),
  },
  {
    id: '5',
    channel: 'EMAIL',
    direction: 'OUTBOUND',
    patientName: '[DEMO] Emily Davis',
    patientId: 'p4',
    subject: 'Appointment Reminder',
    body: 'This is a friendly reminder of your upcoming appointment on Friday...',
    status: 'DELIVERED',
    sentAt: subDays(new Date(), 2),
    deliveredAt: subDays(new Date(), 2),
  },
  {
    id: '6',
    channel: 'SMS',
    direction: 'OUTBOUND',
    patientName: '[DEMO] Robert Wilson',
    patientId: 'p5',
    body: 'Hi Robert, your lab results are in. Please call us to schedule a follow-up.',
    status: 'DELIVERED',
    sentAt: subDays(new Date(), 2),
    deliveredAt: subDays(new Date(), 2),
  },
  {
    id: '7',
    channel: 'EMAIL',
    direction: 'OUTBOUND',
    patientName: '[DEMO] Lisa Anderson',
    patientId: 'p6',
    subject: 'Welcome to Our Practice!',
    body: 'Welcome Lisa! We are excited to have you as a new patient...',
    status: 'READ',
    sentAt: subDays(new Date(), 3),
    deliveredAt: subDays(new Date(), 3),
    readAt: subDays(new Date(), 2),
  },
  {
    id: '8',
    channel: 'SMS',
    direction: 'OUTBOUND',
    patientName: '[DEMO] James Taylor',
    patientId: 'p7',
    body: 'Don\'t forget your appointment tomorrow at 10:00 AM.',
    status: 'BOUNCED',
    sentAt: subDays(new Date(), 4),
  },
];

// Status configurations
const campaignStatusConfig: Record<CampaignStatus, { color: string; label: string }> = {
  DRAFT: { color: 'bg-stone-500', label: 'Draft' },
  SCHEDULED: { color: 'bg-blue-500', label: 'Scheduled' },
  SENDING: { color: 'bg-blue-500', label: 'Sending' },
  COMPLETED: { color: 'bg-green-500', label: 'Completed' },
  PAUSED: { color: 'bg-yellow-500', label: 'Paused' },
  CANCELLED: { color: 'bg-red-500', label: 'Cancelled' },
};

const messageStatusConfig: Record<MessageStatus, { icon: React.ReactNode; color: string; label: string }> = {
  PENDING: { icon: <Clock className="h-3 w-3" />, color: 'bg-yellow-500', label: 'Pending' },
  SENT: { icon: <Check className="h-3 w-3" />, color: 'bg-blue-500', label: 'Sent' },
  DELIVERED: { icon: <CheckCheck className="h-3 w-3" />, color: 'bg-green-500', label: 'Delivered' },
  FAILED: { icon: <AlertCircle className="h-3 w-3" />, color: 'bg-red-500', label: 'Failed' },
  READ: { icon: <CheckCheck className="h-3 w-3" />, color: 'bg-purple-500', label: 'Read' },
  BOUNCED: { icon: <AlertCircle className="h-3 w-3" />, color: 'bg-orange-500', label: 'Bounced' },
};

const broadcastTypeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  ANNOUNCEMENT: { icon: <Megaphone className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' },
  HOLIDAY: { icon: <Calendar className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' },
  PROMOTION: { icon: <Sparkles className="h-4 w-4" />, color: 'bg-green-100 text-green-800' },
  EMERGENCY: { icon: <Zap className="h-4 w-4" />, color: 'bg-red-100 text-red-800' },
};

export function CommunicationDashboard() {
  const [activeTab, setActiveTab] = useState('inbox');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isCampaignWizardOpen, setIsCampaignWizardOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [campaignType, setCampaignType] = useState<CommunicationChannel>('SMS');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Campaign wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [campaignName, setCampaignName] = useState('');
  const [campaignSubject, setCampaignSubject] = useState('');
  const [campaignBody, setCampaignBody] = useState('');
  const [scheduleType, setScheduleType] = useState<'now' | 'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [selectedRecipients, setSelectedRecipients] = useState<'all' | 'active' | 'custom'>('active');

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState<'ANNOUNCEMENT' | 'HOLIDAY' | 'PROMOTION' | 'EMERGENCY'>('ANNOUNCEMENT');
  const [broadcastChannels, setBroadcastChannels] = useState<CommunicationChannel[]>(['SMS', 'EMAIL']);

  // History filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyChannel, setHistoryChannel] = useState<CommunicationChannel | 'ALL'>('ALL');
  const [historyStatus, setHistoryStatus] = useState<MessageStatus | 'ALL'>('ALL');
  const [historyDirection, setHistoryDirection] = useState<'INBOUND' | 'OUTBOUND' | 'ALL'>('ALL');
  const [historyPage, setHistoryPage] = useState(0);
  const pageSize = 10;

  const { data: status } = trpc.communication.getStatus.useQuery();

  // Stats (demo data)
  const stats = {
    totalSent: 1234,
    delivered: 1180,
    failed: 12,
    pending: 42,
    smsCount: 890,
    emailCount: 344,
    openRate: 68.5,
    clickRate: 12.3,
  };

  const deliveryRate = ((stats.delivered / stats.totalSent) * 100).toFixed(1);

  // Filter communication logs
  const filteredLogs = demoCommunicationLogs.filter((log) => {
    if (historyChannel !== 'ALL' && log.channel !== historyChannel) return false;
    if (historyStatus !== 'ALL' && log.status !== historyStatus) return false;
    if (historyDirection !== 'ALL' && log.direction !== historyDirection) return false;
    if (historySearch) {
      const search = historySearch.toLowerCase();
      return (
        log.patientName.toLowerCase().includes(search) ||
        log.body.toLowerCase().includes(search) ||
        (log.subject?.toLowerCase().includes(search) ?? false)
      );
    }
    return true;
  });

  const paginatedLogs = filteredLogs.slice(historyPage * pageSize, (historyPage + 1) * pageSize);

  // Campaign wizard handlers
  const resetCampaignWizard = () => {
    setWizardStep(1);
    setCampaignName('');
    setCampaignSubject('');
    setCampaignBody('');
    setScheduleType('now');
    setScheduledDate('');
    setScheduledTime('09:00');
    setSelectedRecipients('active');
  };

  const handleCreateCampaign = () => {
    toast.success(`Campaign "${campaignName}" created successfully!`);
    setIsCampaignWizardOpen(false);
    resetCampaignWizard();
  };

  const handleSendBroadcast = () => {
    toast.success(`Broadcast "${broadcastTitle}" sent to ${broadcastChannels.join(' & ')}!`);
    setIsBroadcastOpen(false);
    setBroadcastTitle('');
    setBroadcastMessage('');
    setBroadcastType('ANNOUNCEMENT');
    setBroadcastChannels(['SMS', 'EMAIL']);
  };

  const handleExportHistory = () => {
    toast.success('Communication history exported to CSV');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Communication Center</h1>
          <p className="text-stone-500">
            Manage patient communications, campaigns, and notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-[#053e67] hover:bg-[#053e67]">
                <Plus className="h-4 w-4 mr-2" />
                New Message
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsComposeOpen(true)}>
                <Send className="h-4 w-4 mr-2" />
                Quick Message
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setCampaignType('SMS'); setIsCampaignWizardOpen(true); }}>
                <MessageSquare className="h-4 w-4 mr-2" />
                SMS Campaign
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setCampaignType('EMAIL'); setIsCampaignWizardOpen(true); }}>
                <Mail className="h-4 w-4 mr-2" />
                Email Campaign
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsBroadcastOpen(true)}>
                <Megaphone className="h-4 w-4 mr-2" />
                Broadcast Message
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500">Total Sent</p>
                <p className="text-2xl font-bold text-stone-900">{stats.totalSent.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Send className="h-6 w-6 text-[#053e67]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500">Delivery Rate</p>
                <p className="text-2xl font-bold text-stone-900">{deliveryRate}%</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500">SMS Messages</p>
                <p className="text-2xl font-bold text-stone-900">{stats.smsCount.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-[#053e67]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500">Email Messages</p>
                <p className="text-2xl font-bold text-stone-900">{stats.emailCount.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Mail className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Provider Status */}
      {status && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Provider Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-stone-500" />
                <span className="text-sm">SMS:</span>
                <Badge variant={status.sms.configured ? 'default' : 'secondary'}>
                  {status.sms.configured ? (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  ) : (
                    <AlertCircle className="h-3 w-3 mr-1" />
                  )}
                  {status.sms.provider}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-stone-500" />
                <span className="text-sm">Email:</span>
                <Badge variant={status.email.configured ? 'default' : 'secondary'}>
                  {status.email.configured ? (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  ) : (
                    <AlertCircle className="h-3 w-3 mr-1" />
                  )}
                  {status.email.provider}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="inbox" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Inbox</span>
          </TabsTrigger>
          <TabsTrigger value="sms-campaigns" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">SMS</span>
          </TabsTrigger>
          <TabsTrigger value="email-campaigns" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="reminders" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Reminders</span>
          </TabsTrigger>
          <TabsTrigger value="broadcasts" className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">Broadcasts</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
        </TabsList>

        {/* Inbox Tab */}
        <TabsContent value="inbox" className="mt-6">
          <MessageInbox />
        </TabsContent>

        {/* SMS Campaigns Tab */}
        <TabsContent value="sms-campaigns" className="mt-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">SMS Campaigns</h3>
                <p className="text-sm text-stone-500">
                  Create and manage SMS marketing campaigns
                </p>
              </div>
              <Button onClick={() => { setCampaignType('SMS'); setIsCampaignWizardOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                New SMS Campaign
              </Button>
            </div>

            <div className="grid gap-4">
              {demoCampaigns.filter(c => c.channel === 'SMS').map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onView={() => setSelectedCampaign(campaign)}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Email Campaigns Tab */}
        <TabsContent value="email-campaigns" className="mt-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Email Campaigns</h3>
                <p className="text-sm text-stone-500">
                  Create and manage email marketing campaigns
                </p>
              </div>
              <Button onClick={() => { setCampaignType('EMAIL'); setIsCampaignWizardOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Email Campaign
              </Button>
            </div>

            <div className="grid gap-4">
              {demoCampaigns.filter(c => c.channel === 'EMAIL').map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onView={() => setSelectedCampaign(campaign)}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders" className="mt-6">
          <ReminderRuleManager />
        </TabsContent>

        {/* Broadcasts Tab */}
        <TabsContent value="broadcasts" className="mt-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Broadcast Messages</h3>
                <p className="text-sm text-stone-500">
                  Office announcements, holiday closures, and emergency notifications
                </p>
              </div>
              <Button onClick={() => setIsBroadcastOpen(true)}>
                <Megaphone className="h-4 w-4 mr-2" />
                New Broadcast
              </Button>
            </div>

            <div className="grid gap-4">
              {demoBroadcasts.map((broadcast) => (
                <Card key={broadcast.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center",
                          broadcastTypeConfig[broadcast.type].color
                        )}>
                          {broadcastTypeConfig[broadcast.type].icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-stone-900">{broadcast.title}</h4>
                            <Badge variant="outline" className={broadcastTypeConfig[broadcast.type].color}>
                              {broadcast.type}
                            </Badge>
                          </div>
                          <p className="text-sm text-stone-500 mt-1 line-clamp-2">{broadcast.message}</p>
                          <div className="flex items-center gap-4 mt-2 text-sm text-stone-500">
                            <span className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {broadcast.recipientCount.toLocaleString()} recipients
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {formatDistanceToNow(broadcast.sentAt, { addSuffix: true })}
                            </span>
                            <span className="flex items-center gap-1">
                              {broadcast.channels.map(ch => (
                                ch === 'SMS' ? <MessageSquare key={ch} className="h-4 w-4" /> : <Mail key={ch} className="h-4 w-4" />
                              ))}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge variant={broadcast.status === 'SENT' ? 'default' : broadcast.status === 'PARTIAL' ? 'secondary' : 'destructive'}>
                        {broadcast.status === 'SENT' ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
                        {broadcast.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Communication History</h3>
                <p className="text-sm text-stone-500">
                  Complete log of all patient communications
                </p>
              </div>
              <Button variant="outline" onClick={handleExportHistory}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                      <Input
                        placeholder="Search by patient or message..."
                        value={historySearch}
                        onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(0); }}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Select value={historyChannel} onValueChange={(v) => { setHistoryChannel(v as any); setHistoryPage(0); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Channels</SelectItem>
                      <SelectItem value="SMS">SMS</SelectItem>
                      <SelectItem value="EMAIL">Email</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={historyDirection} onValueChange={(v) => { setHistoryDirection(v as any); setHistoryPage(0); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Direction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      <SelectItem value="OUTBOUND">Outbound</SelectItem>
                      <SelectItem value="INBOUND">Inbound</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={historyStatus} onValueChange={(v) => { setHistoryStatus(v as any); setHistoryPage(0); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Status</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="SENT">Sent</SelectItem>
                      <SelectItem value="DELIVERED">Delivered</SelectItem>
                      <SelectItem value="READ">Read</SelectItem>
                      <SelectItem value="FAILED">Failed</SelectItem>
                      <SelectItem value="BOUNCED">Bounced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Communication Log Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-stone-500">
                          No communications found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap">
                            <div>
                              <p className="text-sm">{format(log.sentAt, 'MMM d, yyyy')}</p>
                              <p className="text-xs text-stone-500">{format(log.sentAt, 'h:mm a')}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center">
                                <User className="h-4 w-4 text-stone-500" />
                              </div>
                              <span className="font-medium">{log.patientName}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="flex items-center gap-1 w-fit">
                              {log.channel === 'SMS' ? <MessageSquare className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                              {log.channel}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(
                              "flex items-center gap-1 w-fit",
                              log.direction === 'OUTBOUND' ? 'text-[#053e67]' : 'text-green-700'
                            )}>
                              {log.direction === 'OUTBOUND' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                              {log.direction}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            {log.subject && <p className="text-sm font-medium truncate">{log.subject}</p>}
                            <p className="text-sm text-stone-500 truncate">{log.body}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="flex items-center gap-1 w-fit">
                              <span className={cn("h-2 w-2 rounded-full", messageStatusConfig[log.status].color)} />
                              {messageStatusConfig[log.status].label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
              {filteredLogs.length > pageSize && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-stone-500">
                    Showing {historyPage * pageSize + 1} to {Math.min((historyPage + 1) * pageSize, filteredLogs.length)} of {filteredLogs.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                      disabled={historyPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {historyPage + 1} of {Math.ceil(filteredLogs.length / pageSize)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((p) => p + 1)}
                      disabled={(historyPage + 1) * pageSize >= filteredLogs.length}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-6">
          <MessageTemplateManager />
        </TabsContent>
      </Tabs>

      {/* Compose Message Dialog */}
      <MessageComposer isOpen={isComposeOpen} onClose={() => setIsComposeOpen(false)} />

      {/* Campaign Wizard Dialog */}
      <Dialog open={isCampaignWizardOpen} onOpenChange={(open) => { if (!open) { setIsCampaignWizardOpen(false); resetCampaignWizard(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {campaignType === 'SMS' ? <MessageSquare className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
              Create {campaignType} Campaign
            </DialogTitle>
            <DialogDescription>
              Step {wizardStep} of 3: {wizardStep === 1 ? 'Campaign Details' : wizardStep === 2 ? 'Recipients' : 'Schedule'}
            </DialogDescription>
          </DialogHeader>

          {/* Progress */}
          <div className="flex items-center gap-2 py-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium",
                  step <= wizardStep ? "bg-[#053e67] text-white" : "bg-stone-100 text-stone-500"
                )}>
                  {step}
                </div>
                {step < 3 && (
                  <div className={cn(
                    "h-1 flex-1 mx-2",
                    step < wizardStep ? "bg-[#053e67]" : "bg-stone-100"
                  )} />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Campaign Details */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name</Label>
                <Input
                  id="campaign-name"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., January Wellness Reminder"
                />
              </div>

              {campaignType === 'EMAIL' && (
                <div className="space-y-2">
                  <Label htmlFor="campaign-subject">Email Subject</Label>
                  <Input
                    id="campaign-subject"
                    value={campaignSubject}
                    onChange={(e) => setCampaignSubject(e.target.value)}
                    placeholder="e.g., It's Time for Your Wellness Check-up!"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="campaign-body">Message</Label>
                {campaignType === 'EMAIL' ? (
                  <div className="border rounded-lg p-4 bg-stone-50">
                    <p className="text-sm text-stone-500 mb-2">HTML Template Editor</p>
                    <Textarea
                      id="campaign-body"
                      value={campaignBody}
                      onChange={(e) => setCampaignBody(e.target.value)}
                      placeholder="Enter your email content or paste HTML..."
                      rows={8}
                    />
                    <p className="text-xs text-stone-400 mt-2">
                      Tip: Use merge fields like {'{{firstName}}'}, {'{{lastName}}'}, {'{{appointmentDate}}'}
                    </p>
                  </div>
                ) : (
                  <>
                    <Textarea
                      id="campaign-body"
                      value={campaignBody}
                      onChange={(e) => setCampaignBody(e.target.value)}
                      placeholder="Enter your SMS message..."
                      rows={4}
                    />
                    <p className="text-xs text-stone-500">
                      {campaignBody.length} characters | {Math.ceil(campaignBody.length / 160) || 1} SMS segment{Math.ceil(campaignBody.length / 160) !== 1 ? 's' : ''}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Recipients */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Select Recipients</Label>
                <div className="grid gap-3">
                  <Card
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedRecipients === 'all' ? "border-[#053e67] bg-blue-50" : "hover:bg-stone-50"
                    )}
                    onClick={() => setSelectedRecipients('all')}
                  >
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-stone-100 flex items-center justify-center">
                        <Users className="h-5 w-5 text-stone-600" />
                      </div>
                      <div>
                        <p className="font-medium">All Patients</p>
                        <p className="text-sm text-stone-500">Send to all patients in your database (1,234 recipients)</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedRecipients === 'active' ? "border-[#053e67] bg-blue-50" : "hover:bg-stone-50"
                    )}
                    onClick={() => setSelectedRecipients('active')}
                  >
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">Active Patients Only</p>
                        <p className="text-sm text-stone-500">Send to patients with recent activity (892 recipients)</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedRecipients === 'custom' ? "border-[#053e67] bg-blue-50" : "hover:bg-stone-50"
                    )}
                    onClick={() => setSelectedRecipients('custom')}
                  >
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Filter className="h-5 w-5 text-[#053e67]" />
                      </div>
                      <div>
                        <p className="font-medium">Custom Selection</p>
                        <p className="text-sm text-stone-500">Build a custom recipient list with filters</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {selectedRecipients === 'custom' && (
                <Card className="bg-stone-50">
                  <CardContent className="py-4">
                    <p className="text-sm text-stone-500">
                      Custom recipient filtering will be available in a future update.
                      For now, you can select All Patients or Active Patients Only.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 3: Schedule */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>When to Send</Label>
                <div className="grid gap-3">
                  <Card
                    className={cn(
                      "cursor-pointer transition-colors",
                      scheduleType === 'now' ? "border-[#053e67] bg-blue-50" : "hover:bg-stone-50"
                    )}
                    onClick={() => setScheduleType('now')}
                  >
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Zap className="h-5 w-5 text-[#053e67]" />
                      </div>
                      <div>
                        <p className="font-medium">Send Now</p>
                        <p className="text-sm text-stone-500">Start sending immediately after confirmation</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className={cn(
                      "cursor-pointer transition-colors",
                      scheduleType === 'scheduled' ? "border-[#053e67] bg-blue-50" : "hover:bg-stone-50"
                    )}
                    onClick={() => setScheduleType('scheduled')}
                  >
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-[#053e67]" />
                      </div>
                      <div>
                        <p className="font-medium">Schedule for Later</p>
                        <p className="text-sm text-stone-500">Choose a specific date and time</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {scheduleType === 'scheduled' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="schedule-date">Date</Label>
                    <Input
                      id="schedule-date"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="schedule-time">Time</Label>
                    <Input
                      id="schedule-time"
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Summary */}
              <Card className="bg-stone-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Campaign Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Campaign Name:</span>
                    <span className="font-medium">{campaignName || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Channel:</span>
                    <span className="font-medium">{campaignType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Recipients:</span>
                    <span className="font-medium">
                      {selectedRecipients === 'all' ? '1,234' : selectedRecipients === 'active' ? '892' : 'Custom'} patients
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Schedule:</span>
                    <span className="font-medium">
                      {scheduleType === 'now' ? 'Send immediately' : `${scheduledDate} at ${scheduledTime}`}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <div className="flex justify-between w-full">
              <Button
                variant="outline"
                onClick={() => wizardStep === 1 ? setIsCampaignWizardOpen(false) : setWizardStep(s => s - 1)}
              >
                {wizardStep === 1 ? 'Cancel' : 'Back'}
              </Button>
              <Button
                onClick={() => wizardStep === 3 ? handleCreateCampaign() : setWizardStep(s => s + 1)}
                disabled={wizardStep === 1 && (!campaignName || !campaignBody)}
              >
                {wizardStep === 3 ? (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {scheduleType === 'now' ? 'Send Now' : 'Schedule Campaign'}
                  </>
                ) : 'Next'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Broadcast Dialog */}
      <Dialog open={isBroadcastOpen} onOpenChange={setIsBroadcastOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              New Broadcast Message
            </DialogTitle>
            <DialogDescription>
              Send an announcement to all patients instantly
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="broadcast-type">Broadcast Type</Label>
              <Select value={broadcastType} onValueChange={(v) => setBroadcastType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANNOUNCEMENT">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4" />
                      Announcement
                    </div>
                  </SelectItem>
                  <SelectItem value="HOLIDAY">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Holiday Closure
                    </div>
                  </SelectItem>
                  <SelectItem value="PROMOTION">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Special Promotion
                    </div>
                  </SelectItem>
                  <SelectItem value="EMERGENCY">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Emergency Notice
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="broadcast-title">Title</Label>
              <Input
                id="broadcast-title"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="e.g., Office Closure Notice"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="broadcast-message">Message</Label>
              <Textarea
                id="broadcast-message"
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Enter your broadcast message..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Send Via</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="channel-sms"
                    checked={broadcastChannels.includes('SMS')}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setBroadcastChannels([...broadcastChannels, 'SMS']);
                      } else {
                        setBroadcastChannels(broadcastChannels.filter(c => c !== 'SMS'));
                      }
                    }}
                  />
                  <Label htmlFor="channel-sms" className="flex items-center gap-1">
                    <MessageSquare className="h-4 w-4" />
                    SMS
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="channel-email"
                    checked={broadcastChannels.includes('EMAIL')}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setBroadcastChannels([...broadcastChannels, 'EMAIL']);
                      } else {
                        setBroadcastChannels(broadcastChannels.filter(c => c !== 'EMAIL'));
                      }
                    }}
                  />
                  <Label htmlFor="channel-email" className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                </div>
              </div>
            </div>

            {broadcastType === 'EMERGENCY' && (
              <Card className="bg-red-50 border-red-200">
                <CardContent className="py-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-red-800">
                    Emergency broadcasts are sent immediately to all patients.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBroadcastOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendBroadcast}
              disabled={!broadcastTitle || !broadcastMessage || broadcastChannels.length === 0}
              className={broadcastType === 'EMERGENCY' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              <Send className="h-4 w-4 mr-2" />
              Send Broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Detail Dialog */}
      <Dialog open={!!selectedCampaign} onOpenChange={(open) => !open && setSelectedCampaign(null)}>
        <DialogContent className="max-w-2xl">
          {selectedCampaign && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedCampaign.channel === 'SMS' ? <MessageSquare className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
                  {selectedCampaign.name}
                </DialogTitle>
                <DialogDescription>
                  Campaign details and analytics
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Status and Stats */}
                <div className="flex items-center gap-4">
                  <Badge className={cn(
                    "px-3 py-1",
                    campaignStatusConfig[selectedCampaign.status].color,
                    "text-white"
                  )}>
                    {campaignStatusConfig[selectedCampaign.status].label}
                  </Badge>
                  {selectedCampaign.scheduledAt && (
                    <span className="text-sm text-stone-500 flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {format(selectedCampaign.scheduledAt, 'PPp')}
                    </span>
                  )}
                </div>

                {/* Progress (for sending campaigns) */}
                {selectedCampaign.status === 'SENDING' && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Sending progress</span>
                      <span className="font-medium">
                        {selectedCampaign.sentCount} / {selectedCampaign.recipientCount}
                      </span>
                    </div>
                    <Progress value={(selectedCampaign.sentCount / selectedCampaign.recipientCount) * 100} />
                  </div>
                )}

                {/* Analytics */}
                <div className="grid grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold">{selectedCampaign.recipientCount}</p>
                      <p className="text-sm text-stone-500">Recipients</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold text-green-600">{selectedCampaign.deliveredCount}</p>
                      <p className="text-sm text-stone-500">Delivered</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold text-red-600">{selectedCampaign.failedCount}</p>
                      <p className="text-sm text-stone-500">Failed</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold">
                        {selectedCampaign.sentCount > 0
                          ? ((selectedCampaign.deliveredCount / selectedCampaign.sentCount) * 100).toFixed(1)
                          : '0'}%
                      </p>
                      <p className="text-sm text-stone-500">Delivery Rate</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Message Preview */}
                <div className="space-y-2">
                  <Label>Message Content</Label>
                  {selectedCampaign.subject && (
                    <p className="text-sm font-medium">Subject: {selectedCampaign.subject}</p>
                  )}
                  <Card className="bg-stone-50">
                    <CardContent className="py-3">
                      <p className="text-sm whitespace-pre-wrap">{selectedCampaign.body}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedCampaign(null)}>
                  Close
                </Button>
                {selectedCampaign.status === 'DRAFT' && (
                  <Button>
                    <Send className="h-4 w-4 mr-2" />
                    Send Campaign
                  </Button>
                )}
                {selectedCampaign.status === 'SENDING' && (
                  <Button variant="secondary">
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Campaign Card Component
function CampaignCard({ campaign, onView }: { campaign: Campaign; onView: () => void }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center",
              campaign.channel === 'SMS' ? 'bg-blue-100' : 'bg-purple-100'
            )}>
              {campaign.channel === 'SMS'
                ? <MessageSquare className="h-5 w-5 text-[#053e67]" />
                : <Mail className="h-5 w-5 text-purple-600" />
              }
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-stone-900">{campaign.name}</h4>
                <Badge className={cn(
                  "text-xs",
                  campaignStatusConfig[campaign.status].color,
                  "text-white"
                )}>
                  {campaignStatusConfig[campaign.status].label}
                </Badge>
              </div>
              {campaign.subject && (
                <p className="text-sm text-stone-600 mt-0.5">{campaign.subject}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm text-stone-500">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {campaign.recipientCount.toLocaleString()} recipients
                </span>
                {campaign.status === 'COMPLETED' && (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    {campaign.deliveredCount.toLocaleString()} delivered
                  </span>
                )}
                {campaign.status === 'SENDING' && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-[#053e67]" />
                    {campaign.sentCount.toLocaleString()} sent
                  </span>
                )}
                {campaign.scheduledAt && campaign.status === 'SCHEDULED' && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {format(campaign.scheduledAt, 'MMM d, h:mm a')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {campaign.status === 'SENDING' && (
              <div className="w-24">
                <Progress value={(campaign.sentCount / campaign.recipientCount) * 100} className="h-2" />
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onView}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analytics
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                {campaign.status === 'DRAFT' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
                {campaign.status === 'SCHEDULED' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-600">
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </DropdownMenuItem>
                  </>
                )}
                {campaign.status === 'SENDING' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
