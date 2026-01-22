'use client';

import { useState, useMemo } from 'react';
import { addDays, startOfDay, format, subDays, subHours } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  HighRiskAppointments,
  OverbookingRecommendations,
  GapFillSuggestions,
  UtilizationChart,
  OptimalSlotFinder,
  RecallSequenceManager,
  RecallCandidates,
  SchedulingInsightsPanel,
} from '@/components/ai-scheduling';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { trpc } from '@/trpc/client';
import {
  Brain,
  Calendar,
  Clock,
  RotateCcw,
  BarChart3,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  Zap,
  Bell,
  Phone,
  Mail,
  MessageSquare,
  Search,
  CalendarPlus,
  CalendarX,
  RefreshCw,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  Timer,
  MapPin,
  Building2,
  ListTodo,
  Settings,
  Plus,
  Filter,
  Download,
  Activity,
  Gauge,
  ClipboardList,
  UserPlus,
  CalendarCheck,
  CalendarClock,
  Loader2,
  Star,
  AlertCircle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Demo data for the dashboard
const demoMetrics = {
  dailyEfficiency: 87,
  avgWaitTime: 12,
  noShowRate: 8.5,
  utilizationRate: 78,
  cancelRate: 5.2,
  fillRate: 92,
  gapsToday: 3,
  waitlistCount: 14,
};

const demoHighRiskAppointments = [
  {
    id: '1',
    patientName: '[DEMO] Sarah Johnson',
    time: '9:00 AM',
    date: 'Today',
    provider: 'Dr. Smith',
    riskScore: 85,
    riskLevel: 'high' as const,
    factors: ['2 previous no-shows', 'Booked via phone', 'New patient'],
    appointmentType: 'Initial Consultation',
  },
  {
    id: '2',
    patientName: '[DEMO] Michael Chen',
    time: '10:30 AM',
    date: 'Today',
    provider: 'Dr. Williams',
    riskScore: 72,
    riskLevel: 'high' as const,
    factors: ['1 late cancellation', 'Long travel distance'],
    appointmentType: 'Follow-up Adjustment',
  },
  {
    id: '3',
    patientName: '[DEMO] Jennifer Davis',
    time: '2:00 PM',
    date: 'Tomorrow',
    provider: 'Dr. Smith',
    riskScore: 68,
    riskLevel: 'medium' as const,
    factors: ['Evening appointment', 'First visit in 6 months'],
    appointmentType: 'Spinal Assessment',
  },
];

const demoCancellationPatterns = [
  { day: 'Monday', rate: 12, count: 8 },
  { day: 'Tuesday', rate: 6, count: 4 },
  { day: 'Wednesday', rate: 4, count: 3 },
  { day: 'Thursday', rate: 8, count: 5 },
  { day: 'Friday', rate: 15, count: 10 },
];

const demoPeakHours = [
  { hour: '8:00 AM', utilization: 65, appointments: 4 },
  { hour: '9:00 AM', utilization: 95, appointments: 8 },
  { hour: '10:00 AM', utilization: 100, appointments: 9 },
  { hour: '11:00 AM', utilization: 88, appointments: 7 },
  { hour: '12:00 PM', utilization: 45, appointments: 3 },
  { hour: '1:00 PM', utilization: 78, appointments: 6 },
  { hour: '2:00 PM', utilization: 92, appointments: 8 },
  { hour: '3:00 PM', utilization: 85, appointments: 7 },
  { hour: '4:00 PM', utilization: 72, appointments: 5 },
  { hour: '5:00 PM', utilization: 55, appointments: 4 },
];

const demoWaitlistPatients = [
  {
    id: '1',
    name: '[DEMO] Robert Wilson',
    priority: 'urgent',
    waitingSince: subDays(new Date(), 2),
    preferredTimes: 'Mornings',
    appointmentType: 'Emergency Care',
    phone: '(555) 123-4567',
    aiScore: 95,
  },
  {
    id: '2',
    name: '[DEMO] Amanda Martinez',
    priority: 'high',
    waitingSince: subDays(new Date(), 3),
    preferredTimes: 'Tue/Thu afternoons',
    appointmentType: 'Follow-up Adjustment',
    phone: '(555) 234-5678',
    aiScore: 82,
  },
  {
    id: '3',
    name: '[DEMO] James Thompson',
    priority: 'normal',
    waitingSince: subDays(new Date(), 5),
    preferredTimes: 'Any afternoon',
    appointmentType: 'Initial Consultation',
    phone: '(555) 345-6789',
    aiScore: 68,
  },
  {
    id: '4',
    name: '[DEMO] Emily Brown',
    priority: 'normal',
    waitingSince: subDays(new Date(), 7),
    preferredTimes: 'Fridays only',
    appointmentType: 'Wellness Check',
    phone: '(555) 456-7890',
    aiScore: 55,
  },
];

const demoSlotSuggestions = [
  {
    time: '11:30 AM',
    date: 'Today',
    provider: 'Dr. Smith',
    reason: 'Cancellation opening',
    matchingPatients: 3,
    score: 92,
  },
  {
    time: '3:00 PM',
    date: 'Tomorrow',
    provider: 'Dr. Williams',
    reason: 'Gap detected',
    matchingPatients: 5,
    score: 85,
  },
  {
    time: '9:30 AM',
    date: format(addDays(new Date(), 2), 'MMM d'),
    provider: 'Dr. Smith',
    reason: 'Optimal utilization slot',
    matchingPatients: 4,
    score: 78,
  },
];

const demoProviderUtilization = [
  { provider: 'Dr. Sarah Smith', utilization: 92, appointments: 28, gaps: 1, color: 'bg-green-500' },
  { provider: 'Dr. Michael Williams', utilization: 78, appointments: 24, gaps: 3, color: 'bg-blue-500' },
  { provider: 'Dr. Lisa Chen', utilization: 85, appointments: 26, gaps: 2, color: 'bg-green-500' },
  { provider: 'Dr. James Brown', utilization: 65, appointments: 20, gaps: 5, color: 'bg-red-500' },
];

const demoQuickSlots = [
  { time: '10:00 AM', date: 'Today', provider: 'Dr. Williams', available: true },
  { time: '2:30 PM', date: 'Today', provider: 'Dr. Smith', available: true },
  { time: '9:00 AM', date: 'Tomorrow', provider: 'Dr. Chen', available: true },
  { time: '11:00 AM', date: 'Tomorrow', provider: 'Dr. Smith', available: true },
  { time: '3:30 PM', date: 'Tomorrow', provider: 'Dr. Brown', available: true },
];

const demoLocations = [
  { id: '1', name: 'Main Clinic', address: '123 Health Ave', travelTime: 0 },
  { id: '2', name: 'Downtown Office', address: '456 Wellness St', travelTime: 15 },
  { id: '3', name: 'West Side Clinic', address: '789 Care Blvd', travelTime: 25 },
];

const demoHolidays = [
  { date: addDays(new Date(), 14), name: 'Office Closure - Staff Training' },
  { date: addDays(new Date(), 45), name: 'Holiday - Memorial Day' },
];

export default function AISchedulingPage() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfDay(new Date()),
    to: addDays(startOfDay(new Date()), 7),
  });
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [showHolidayDialog, setShowHolidayDialog] = useState(false);
  const [selectedWaitlistPatient, setSelectedWaitlistPatient] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch providers for the filter
  const { data: providers } = trpc.scheduling.listProviders.useQuery();

  const handleRefreshPredictions = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-blue-100 text-[#053e67] border-blue-200';
      case 'low':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityBadgeColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-700';
      case 'high':
        return 'bg-blue-100 text-[#053e67]';
      case 'normal':
        return 'bg-blue-100 text-[#053e67]';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-[#053e67]" />
            AI Scheduling Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Intelligent scheduling optimization, analytics, and automation
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Providers</SelectItem>
              {providers?.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.user.firstName} {provider.user.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker
            value={dateRange}
            onChange={(range) => range && setDateRange(range)}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefreshPredictions}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh AI predictions</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Key Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card className="py-4">
          <CardContent className="px-4 py-0">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-[#053e67]" />
              <span className="text-xs text-muted-foreground">Efficiency</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold">{demoMetrics.dailyEfficiency}%</span>
              <ArrowUpRight className="h-4 w-4 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 py-0">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#053e67]" />
              <span className="text-xs text-muted-foreground">Utilization</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold">{demoMetrics.utilizationRate}%</span>
              <ArrowUpRight className="h-4 w-4 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 py-0">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">No-Show Rate</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold">{demoMetrics.noShowRate}%</span>
              <ArrowDownRight className="h-4 w-4 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 py-0">
            <div className="flex items-center gap-2">
              <CalendarX className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Cancel Rate</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold">{demoMetrics.cancelRate}%</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 py-0">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Avg Wait</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold">{demoMetrics.avgWaitTime}</span>
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 py-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Fill Rate</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold">{demoMetrics.fillRate}%</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 py-0">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-stone-500" />
              <span className="text-xs text-muted-foreground">Gaps Today</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold">{demoMetrics.gapsToday}</span>
              <span className="text-sm text-muted-foreground">slots</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 py-0">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-indigo-500" />
              <span className="text-xs text-muted-foreground">Waitlist</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold">{demoMetrics.waitlistCount}</span>
              <span className="text-sm text-muted-foreground">patients</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="smart-assistant" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="smart-assistant" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Smart Assistant
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="waitlist" className="flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Waitlist
          </TabsTrigger>
          <TabsTrigger value="optimization" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Optimization
          </TabsTrigger>
          <TabsTrigger value="quick-actions" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Quick Actions
          </TabsTrigger>
          <TabsTrigger value="recall" className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Patient Recall
          </TabsTrigger>
        </TabsList>

        {/* Smart Scheduling Assistant Tab */}
        <TabsContent value="smart-assistant" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* AI Recommendations */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-[#053e67]" />
                      AI-Powered Suggestions
                    </CardTitle>
                    <CardDescription>
                      Optimal appointment times based on provider availability and patient preferences
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-blue-50 text-[#053e67] border-blue-200">
                    {demoSlotSuggestions.length} suggestions
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {demoSlotSuggestions.map((slot, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'flex items-center gap-4 p-4 border rounded-lg transition-colors hover:bg-muted/50',
                        idx === 0 && 'border-blue-300 bg-blue-50/50'
                      )}
                    >
                      <div
                        className={cn(
                          'h-12 w-12 rounded-lg flex items-center justify-center',
                          idx === 0 ? 'bg-blue-200' : 'bg-muted'
                        )}
                      >
                        {idx === 0 ? (
                          <Star className="h-6 w-6 text-[#053e67]" />
                        ) : (
                          <span className="text-lg font-bold text-muted-foreground">{idx + 1}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{slot.time}</span>
                          <span className="text-muted-foreground">on</span>
                          <span className="font-medium">{slot.date}</span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {slot.provider}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {slot.reason} - {slot.matchingPatients} waitlist matches
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-medium">Score: {slot.score}</div>
                          <Progress value={slot.score} className="w-20 h-2" />
                        </div>
                        <Button size="sm" className="bg-[#053e67] hover:bg-[#053e67]">
                          Book Slot
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Patient Preference Learning */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#053e67]" />
                  Patient Preferences
                </CardTitle>
                <CardDescription>AI-learned scheduling patterns</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="h-4 w-4 text-[#053e67]" />
                      <span className="font-medium text-sm text-blue-900">Morning Preference</span>
                    </div>
                    <p className="text-sm text-[#053e67]">
                      68% of patients prefer appointments before 11 AM
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-sm text-green-900">Attendance Pattern</span>
                    </div>
                    <p className="text-sm text-green-700">
                      Tuesday appointments have 12% higher show rate
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-[#053e67]" />
                      <span className="font-medium text-sm text-blue-900">Lead Time</span>
                    </div>
                    <p className="text-sm text-[#053e67]">
                      Appointments booked 3-5 days ahead have best attendance
                    </p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-4 w-4 text-purple-600" />
                      <span className="font-medium text-sm text-purple-900">Location Insight</span>
                    </div>
                    <p className="text-sm text-purple-700">
                      Patients within 5 miles have 95% show rate
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Conflict Detection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-blue-500" />
                Conflict Detection & Resolution
              </CardTitle>
              <CardDescription>
                AI-identified scheduling conflicts and suggested resolutions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-[#053e67]" />
                    <span className="font-medium">[DEMO] Double Booking Risk</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Dr. Smith has overlapping appointments at 2:00 PM today
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1">
                      Reschedule
                    </Button>
                    <Button size="sm" className="flex-1 bg-[#053e67] hover:bg-[#053e67]">
                      Auto-Resolve
                    </Button>
                  </div>
                </div>
                <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Timer className="h-5 w-5 text-[#053e67]" />
                    <span className="font-medium">[DEMO] Buffer Time Needed</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Complex procedure at 10:30 AM needs 15 min extra buffer
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1">
                      Ignore
                    </Button>
                    <Button size="sm" className="flex-1 bg-[#053e67] hover:bg-[#053e67]">
                      Add Buffer
                    </Button>
                  </div>
                </div>
                <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-medium">No Conflicts</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Tomorrow's schedule has no detected conflicts
                  </p>
                  <Button size="sm" variant="outline" className="w-full" disabled>
                    All Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* No-Show Prediction */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                      No-Show Predictions
                    </CardTitle>
                    <CardDescription>
                      High-risk appointments with AI confidence scores
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    {demoHighRiskAppointments.length} at risk
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {demoHighRiskAppointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{apt.patientName}</span>
                            <Badge
                              variant="outline"
                              className={cn('text-xs', getRiskBadgeColor(apt.riskLevel))}
                            >
                              {apt.riskScore}% risk
                            </Badge>
                          </div>
                          <div className="flex gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <Phone className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Call to confirm</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Send reminder</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {apt.time} {apt.date} • {apt.appointmentType} • {apt.provider}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {apt.factors.map((factor, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {factor}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Cancellation Patterns */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarX className="h-5 w-5 text-blue-500" />
                  Cancellation Patterns
                </CardTitle>
                <CardDescription>
                  Weekly cancellation trends to optimize scheduling
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {demoCancellationPatterns.map((day) => (
                    <div key={day.day} className="flex items-center gap-4">
                      <div className="w-24 text-sm font-medium">{day.day}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Progress
                            value={day.rate}
                            className={cn(
                              'h-3 flex-1',
                              day.rate > 10 ? '[&>*]:bg-red-500' : day.rate > 6 ? '[&>*]:bg-blue-500' : '[&>*]:bg-green-500'
                            )}
                          />
                          <span className="text-sm font-medium w-12">{day.rate}%</span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground w-20">
                        {day.count} cancelled
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-[#053e67]" />
                    <span className="text-sm font-medium text-blue-900">AI Insight</span>
                  </div>
                  <p className="text-sm text-[#053e67] mt-1">
                    Consider overbooking by 10% on Fridays to compensate for higher cancellation rate
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Peak Hours Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Peak Hours Analysis
              </CardTitle>
              <CardDescription>
                Hourly utilization patterns and demand forecasting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                {demoPeakHours.map((hour) => (
                  <div key={hour.hour} className="text-center">
                    <div
                      className={cn(
                        'h-24 rounded-lg flex items-end justify-center pb-2 relative',
                        hour.utilization >= 90
                          ? 'bg-red-100'
                          : hour.utilization >= 70
                          ? 'bg-blue-100'
                          : 'bg-green-100'
                      )}
                    >
                      <div
                        className={cn(
                          'absolute bottom-0 left-0 right-0 rounded-b-lg transition-all',
                          hour.utilization >= 90
                            ? 'bg-red-500'
                            : hour.utilization >= 70
                            ? 'bg-blue-500'
                            : 'bg-green-500'
                        )}
                        style={{ height: `${hour.utilization}%` }}
                      />
                      <span className="relative z-10 text-xs font-bold text-white">
                        {hour.utilization}%
                      </span>
                    </div>
                    <div className="text-xs mt-1 text-muted-foreground">{hour.hour}</div>
                    <div className="text-xs font-medium">{hour.appointments} apt</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Provider Utilization */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Provider Utilization
              </CardTitle>
              <CardDescription>
                Weekly provider performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {demoProviderUtilization.map((provider) => (
                  <div key={provider.provider} className="flex items-center gap-4">
                    <div className="w-48 font-medium text-sm">[DEMO] {provider.provider}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={provider.utilization}
                          className={cn(
                            'h-3 flex-1',
                            provider.utilization >= 85
                              ? '[&>*]:bg-green-500'
                              : provider.utilization >= 70
                              ? '[&>*]:bg-blue-500'
                              : '[&>*]:bg-red-500'
                          )}
                        />
                        <span className="text-sm font-medium w-12">{provider.utilization}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{provider.appointments} appts</span>
                      <span>{provider.gaps} gaps</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Waitlist Management Tab */}
        <TabsContent value="waitlist" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Waitlist Queue */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ListTodo className="h-5 w-5 text-indigo-600" />
                      AI-Prioritized Waitlist
                    </CardTitle>
                    <CardDescription>
                      Patients sorted by urgency, wait time, and availability match
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-2" />
                      Filter
                    </Button>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add to Waitlist
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {demoWaitlistPatients.map((patient, idx) => (
                    <div
                      key={patient.id}
                      className={cn(
                        'p-4 border rounded-lg transition-all',
                        selectedWaitlistPatient === patient.id
                          ? 'border-indigo-300 bg-indigo-50'
                          : 'hover:bg-muted/50'
                      )}
                      onClick={() => setSelectedWaitlistPatient(patient.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            'h-10 w-10 rounded-full flex items-center justify-center text-white font-bold',
                            patient.priority === 'urgent'
                              ? 'bg-red-500'
                              : patient.priority === 'high'
                              ? 'bg-blue-500'
                              : 'bg-blue-500'
                          )}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{patient.name}</span>
                            <Badge
                              variant="outline"
                              className={cn('text-xs', getPriorityBadgeColor(patient.priority))}
                            >
                              {patient.priority}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                              AI Score: {patient.aiScore}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {patient.appointmentType} • Prefers: {patient.preferredTimes}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Waiting since {format(patient.waitingSince, 'MMM d')} ({Math.floor((new Date().getTime() - patient.waitingSince.getTime()) / (1000 * 60 * 60 * 24))} days)
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Phone className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{patient.phone}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700">
                            <CalendarPlus className="h-4 w-4 mr-1" />
                            Schedule
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Auto-Fill Suggestions */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-blue-500" />
                    Auto-Fill Suggestions
                  </CardTitle>
                  <CardDescription>
                    Match open slots to waitlist patients
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {demoSlotSuggestions.slice(0, 2).map((slot, idx) => (
                      <div key={idx} className="p-3 border rounded-lg bg-blue-50/50 border-blue-200">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="font-medium text-sm">{slot.time} - {slot.date}</div>
                            <div className="text-xs text-muted-foreground">{slot.provider}</div>
                          </div>
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                            {slot.matchingPatients} matches
                          </Badge>
                        </div>
                        <Button size="sm" variant="outline" className="w-full">
                          View Matches
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-blue-500" />
                    Notification Triggers
                  </CardTitle>
                  <CardDescription>
                    Automatic patient notifications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Email on slot open</span>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">SMS for urgent</span>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Call for priority</span>
                      </div>
                      <Switch />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Schedule Optimization Tab */}
        <TabsContent value="optimization" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Efficiency Score */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="h-5 w-5 text-green-600" />
                  Daily Schedule Efficiency
                </CardTitle>
                <CardDescription>
                  Overall schedule optimization score
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-8">
                  <div className="relative">
                    <div className="h-40 w-40 rounded-full border-8 border-muted flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-green-600">{demoMetrics.dailyEfficiency}%</div>
                        <div className="text-sm text-muted-foreground">Efficiency</div>
                      </div>
                    </div>
                    <div
                      className="absolute inset-0 rounded-full border-8 border-green-500"
                      style={{
                        clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.sin(demoMetrics.dailyEfficiency * 3.6 * Math.PI / 180)}% ${50 - 50 * Math.cos(demoMetrics.dailyEfficiency * 3.6 * Math.PI / 180)}%, 50% 50%)`,
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-bold text-green-600">{demoMetrics.fillRate}%</div>
                    <div className="text-xs text-muted-foreground">Fill Rate</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-bold text-[#053e67]">{demoMetrics.gapsToday}</div>
                    <div className="text-xs text-muted-foreground">Open Gaps</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-bold text-[#053e67]">{demoMetrics.avgWaitTime}m</div>
                    <div className="text-xs text-muted-foreground">Avg Wait</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gap Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  Gap Analysis
                </CardTitle>
                <CardDescription>
                  Unfilled time slots and recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Today's Gaps</span>
                      <Badge variant="outline" className="bg-blue-100 text-[#053e67]">
                        45 min unfilled
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>11:30 AM - 12:00 PM</span>
                        <span className="text-muted-foreground">Dr. Williams</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>3:30 PM - 4:00 PM</span>
                        <span className="text-muted-foreground">Dr. Smith</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">AI Recommendation</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Contact 3 waitlist patients who prefer afternoon appointments to fill gaps
                    </p>
                    <Button size="sm" className="mt-3 w-full bg-[#053e67] hover:bg-[#053e67]">
                      Auto-Contact Patients
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Overbooking Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarPlus className="h-5 w-5 text-[#053e67]" />
                Overbooking Recommendations
              </CardTitle>
              <CardDescription>
                AI-suggested overbooking based on historical no-show patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium">[DEMO] Dr. Smith</span>
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      Recommended
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Friday 9:00 AM - 10:00 AM slot
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Suggestion:</span> Book 1 extra patient
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Based on 25% historical no-show rate for this slot
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="flex-1">
                      Dismiss
                    </Button>
                    <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700">
                      Accept
                    </Button>
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium">[DEMO] Dr. Williams</span>
                    <Badge variant="outline" className="bg-blue-50 text-[#053e67]">
                      Consider
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Monday 2:00 PM - 3:00 PM slot
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Suggestion:</span> Book 1 extra patient
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Based on 18% historical no-show rate for this slot
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="flex-1">
                      Dismiss
                    </Button>
                    <Button size="sm" className="flex-1 bg-[#053e67] hover:bg-[#053e67]">
                      Accept
                    </Button>
                  </div>
                </div>
                <div className="p-4 border border-dashed rounded-lg bg-muted/30">
                  <div className="flex items-center justify-center h-full py-8">
                    <div className="text-center text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No more recommendations</p>
                      <p className="text-xs">All other slots are optimized</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Multi-Location Travel Time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-purple-600" />
                Multi-Location Scheduling
              </CardTitle>
              <CardDescription>
                Travel time considerations for providers working at multiple locations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {demoLocations.map((location) => (
                  <div key={location.id} className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-5 w-5 text-purple-600" />
                      <span className="font-medium">{location.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{location.address}</p>
                    {location.travelTime > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {location.travelTime} min from main
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-900">Travel Buffer Applied</span>
                </div>
                <p className="text-sm text-purple-700 mt-1">
                  30-minute buffer automatically added between locations for [DEMO] Dr. Chen
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quick Actions Tab */}
        <TabsContent value="quick-actions" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Find Next Available */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-[#053e67]" />
                  Find Next Available Slot
                </CardTitle>
                <CardDescription>
                  Quick search for immediate availability
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="quick-provider">Provider</Label>
                      <Select>
                        <SelectTrigger id="quick-provider">
                          <SelectValue placeholder="Any provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any Provider</SelectItem>
                          <SelectItem value="smith">[DEMO] Dr. Smith</SelectItem>
                          <SelectItem value="williams">[DEMO] Dr. Williams</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="quick-type">Appointment Type</Label>
                      <Select>
                        <SelectTrigger id="quick-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="initial">Initial Consultation</SelectItem>
                          <SelectItem value="followup">Follow-up Adjustment</SelectItem>
                          <SelectItem value="wellness">Wellness Check</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button className="w-full bg-[#053e67] hover:bg-[#053e67]">
                    <Search className="h-4 w-4 mr-2" />
                    Find Available Slots
                  </Button>
                  <div className="space-y-2 mt-4">
                    <div className="text-sm font-medium text-muted-foreground">Quick Results</div>
                    {demoQuickSlots.slice(0, 3).map((slot, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                      >
                        <div>
                          <div className="font-medium text-sm">{slot.time} - {slot.date}</div>
                          <div className="text-xs text-muted-foreground">[DEMO] {slot.provider}</div>
                        </div>
                        <Button size="sm" variant="outline">
                          Book
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Reschedule */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-[#053e67]" />
                  Reschedule with AI
                </CardTitle>
                <CardDescription>
                  AI-powered alternative time suggestions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="reschedule-patient">Search Patient or Appointment</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reschedule-patient"
                        placeholder="Enter patient name or appointment ID..."
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">[DEMO] Selected Appointment</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sarah Johnson - Tomorrow 2:00 PM with Dr. Smith
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">AI Suggested Alternatives</div>
                    <div className="space-y-2">
                      {demoQuickSlots.slice(0, 3).map((slot, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            'flex items-center justify-between p-3 border rounded-lg',
                            idx === 0 ? 'border-blue-300 bg-blue-50' : 'hover:bg-muted/50'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {idx === 0 && <Star className="h-4 w-4 text-blue-500" />}
                            <div>
                              <div className="font-medium text-sm">{slot.time} - {slot.date}</div>
                              <div className="text-xs text-muted-foreground">[DEMO] {slot.provider}</div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className={idx === 0 ? 'bg-[#053e67] hover:bg-[#053e67]' : ''}
                            variant={idx === 0 ? 'default' : 'outline'}
                          >
                            Select
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Batch Actions Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Batch Appointment Creation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarPlus className="h-5 w-5 text-green-600" />
                  Batch Appointment Creation
                </CardTitle>
                <CardDescription>
                  Create recurring or multiple appointments at once
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Patient</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select patient" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="demo1">[DEMO] Sarah Johnson</SelectItem>
                          <SelectItem value="demo2">[DEMO] Michael Chen</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Recurrence</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select pattern" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Number of Appointments</Label>
                      <Input type="number" defaultValue={4} min={2} max={12} />
                    </div>
                    <div>
                      <Label>Preferred Time</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="morning">Morning (8-12)</SelectItem>
                          <SelectItem value="afternoon">Afternoon (12-5)</SelectItem>
                          <SelectItem value="any">Any Available</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    disabled={isCreatingBatch}
                    onClick={() => {
                      setIsCreatingBatch(true);
                      setTimeout(() => setIsCreatingBatch(false), 2000);
                    }}
                  >
                    {isCreatingBatch ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CalendarPlus className="h-4 w-4 mr-2" />
                    )}
                    Create Batch Appointments
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Holiday/Closure Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarX className="h-5 w-5 text-red-600" />
                  Holiday & Closure Management
                </CardTitle>
                <CardDescription>
                  Manage office closures and affected appointments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    {demoHolidays.map((holiday, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <div className="font-medium text-sm">{holiday.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(holiday.date, 'EEEE, MMMM d, yyyy')}
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-red-50 text-red-700">
                          Closed
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <Dialog open={showHolidayDialog} onOpenChange={setShowHolidayDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Closure Date
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Office Closure</DialogTitle>
                        <DialogDescription>
                          Schedule a closure date and manage affected appointments
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label>Closure Date</Label>
                          <Input type="date" />
                        </div>
                        <div>
                          <Label>Reason</Label>
                          <Input placeholder="e.g., Holiday, Staff Training" />
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="notify" />
                          <label htmlFor="notify" className="text-sm">
                            Notify affected patients automatically
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="reschedule" />
                          <label htmlFor="reschedule" className="text-sm">
                            Auto-reschedule to nearest available
                          </label>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowHolidayDialog(false)}>
                          Cancel
                        </Button>
                        <Button className="bg-red-600 hover:bg-red-700">
                          Add Closure
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-[#053e67]" />
                      <span className="text-sm font-medium text-blue-900">Upcoming Alert</span>
                    </div>
                    <p className="text-sm text-[#053e67] mt-1">
                      12 appointments need rescheduling for Staff Training on {format(demoHolidays[0].date, 'MMM d')}
                    </p>
                    <Button size="sm" variant="outline" className="mt-2">
                      View & Reschedule
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Patient Recall Tab */}
        <TabsContent value="recall" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecallSequenceManager />
            <RecallCandidates />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
