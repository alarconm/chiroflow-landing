'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import {
  Shield,
  AlertTriangle,
  Activity,
  Clock,
  User,
  Key,
  FileText,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  Eye,
  Settings,
  Monitor,
  Smartphone,
  Laptop,
  Globe,
  ShieldCheck,
  ShieldAlert,
  Users,
  LogOut,
  BarChart3,
  ClipboardList,
  ExternalLink,
  Trash2,
  Calendar,
} from 'lucide-react';
import { formatDistanceToNow, format, subDays, subHours } from 'date-fns';
import Link from 'next/link';

// Event type display configuration
const eventTypeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  LOGIN_SUCCESS: { label: 'Login Success', icon: <CheckCircle className="h-4 w-4" />, color: 'bg-green-100 text-green-800' },
  LOGIN_FAILURE: { label: 'Login Failed', icon: <XCircle className="h-4 w-4" />, color: 'bg-red-100 text-red-800' },
  LOGIN_MFA_REQUIRED: { label: 'MFA Required', icon: <Key className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' },
  LOGIN_MFA_SUCCESS: { label: 'MFA Success', icon: <CheckCircle className="h-4 w-4" />, color: 'bg-green-100 text-green-800' },
  LOGIN_MFA_FAILURE: { label: 'MFA Failed', icon: <XCircle className="h-4 w-4" />, color: 'bg-red-100 text-red-800' },
  LOGOUT: { label: 'Logout', icon: <User className="h-4 w-4" />, color: 'bg-gray-100 text-gray-800' },
  PASSWORD_CHANGE: { label: 'Password Changed', icon: <Key className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' },
  PASSWORD_RESET_REQUEST: { label: 'Password Reset Requested', icon: <Key className="h-4 w-4" />, color: 'bg-yellow-100 text-yellow-800' },
  PASSWORD_RESET_COMPLETE: { label: 'Password Reset Complete', icon: <Key className="h-4 w-4" />, color: 'bg-green-100 text-green-800' },
  MFA_ENABLED: { label: 'MFA Enabled', icon: <Lock className="h-4 w-4" />, color: 'bg-green-100 text-green-800' },
  MFA_DISABLED: { label: 'MFA Disabled', icon: <Unlock className="h-4 w-4" />, color: 'bg-yellow-100 text-yellow-800' },
  MFA_RECOVERY_USED: { label: 'MFA Recovery Used', icon: <Key className="h-4 w-4" />, color: 'bg-orange-100 text-orange-800' },
  PERMISSION_GRANTED: { label: 'Permission Granted', icon: <CheckCircle className="h-4 w-4" />, color: 'bg-green-100 text-green-800' },
  PERMISSION_REVOKED: { label: 'Permission Revoked', icon: <XCircle className="h-4 w-4" />, color: 'bg-red-100 text-red-800' },
  ROLE_CHANGED: { label: 'Role Changed', icon: <User className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' },
  PHI_ACCESSED: { label: 'PHI Accessed', icon: <Eye className="h-4 w-4" />, color: 'bg-purple-100 text-purple-800' },
  PHI_EXPORTED: { label: 'PHI Exported', icon: <Download className="h-4 w-4" />, color: 'bg-purple-100 text-purple-800' },
  PHI_MODIFIED: { label: 'PHI Modified', icon: <FileText className="h-4 w-4" />, color: 'bg-purple-100 text-purple-800' },
  ACCOUNT_LOCKED: { label: 'Account Locked', icon: <Lock className="h-4 w-4" />, color: 'bg-red-100 text-red-800' },
  ACCOUNT_UNLOCKED: { label: 'Account Unlocked', icon: <Unlock className="h-4 w-4" />, color: 'bg-green-100 text-green-800' },
  CONFIG_CHANGED: { label: 'Config Changed', icon: <Settings className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' },
  SUSPICIOUS_ACTIVITY: { label: 'Suspicious Activity', icon: <AlertTriangle className="h-4 w-4" />, color: 'bg-red-100 text-red-800' },
  SESSION_CREATED: { label: 'Session Created', icon: <Monitor className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' },
  SESSION_TERMINATED: { label: 'Session Terminated', icon: <LogOut className="h-4 w-4" />, color: 'bg-gray-100 text-gray-800' },
  EMERGENCY_ACCESS_USED: { label: 'Emergency Access', icon: <ShieldAlert className="h-4 w-4" />, color: 'bg-red-100 text-red-800' },
};

const severityColors: Record<string, string> = {
  INFO: 'bg-blue-100 text-blue-800',
  WARNING: 'bg-yellow-100 text-yellow-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

// Device icon helper
function getDeviceIcon(userAgent: string | null) {
  if (!userAgent) return <Monitor className="h-4 w-4" />;
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return <Smartphone className="h-4 w-4" />;
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return <Laptop className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
}

export default function SecurityAdminDashboard() {
  const { isAtLeast, isLoading: permissionsLoading } = usePermissions();
  const isAdmin = isAtLeast('ADMIN');

  const [timeRange, setTimeRange] = useState<string>('24');
  const [searchFilter, setSearchFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [isPolicyDialogOpen, setIsPolicyDialogOpen] = useState(false);
  const [isTerminateAllDialogOpen, setIsTerminateAllDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Policy form state
  const [policyForm, setPolicyForm] = useState({
    sessionTimeoutMinutes: 60,
    idleTimeoutMinutes: 30,
    maxConcurrentSessions: 3,
    mfaRequired: false,
    mfaRequiredForRoles: [] as string[],
    mfaGracePeriodDays: 7,
    ipWhitelistEnabled: false,
    ipWhitelist: '',
    ipBlacklist: '',
    accessHoursEnabled: false,
    accessHoursStart: '09:00',
    accessHoursEnd: '17:00',
    accessHoursTimezone: 'America/New_York',
  });

  // Fetch security stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.security.getSecurityEventStats.useQuery(
    { hours: parseInt(timeRange) },
    { enabled: isAdmin }
  );

  // Fetch suspicious activity detection
  const { data: alerts, isLoading: alertsLoading, refetch: refetchAlerts } = trpc.security.detectSuspiciousActivity.useQuery(
    { hours: parseInt(timeRange) },
    { enabled: isAdmin }
  );

  // Fetch security events
  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = trpc.security.listSecurityEvents.useQuery(
    {
      limit: 100,
      eventTypes: eventTypeFilter !== 'all' ? [eventTypeFilter] : undefined,
    },
    { enabled: isAdmin }
  );

  // Fetch failed login attempts
  const { data: failedLogins } = trpc.security.getFailedLoginAttempts.useQuery(
    { hours: parseInt(timeRange) },
    { enabled: isAdmin }
  );

  // Fetch active sessions (org-wide for admin)
  const { data: orgSessions, isLoading: sessionsLoading, refetch: refetchSessions } = trpc.security.adminListOrgSessions.useQuery(
    { status: 'ACTIVE' },
    { enabled: isAdmin }
  );

  // Fetch session settings
  const { data: sessionSettings, refetch: refetchSessionSettings } = trpc.security.getSessionSettings.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  // Fetch MFA policy
  const { data: mfaPolicy, refetch: refetchMfaPolicy } = trpc.security.getMFAPolicy.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  // Fetch BAA stats
  const { data: baaStats } = trpc.baa.getDashboardStats.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  // Fetch access control settings
  const { data: ipSettings } = trpc.accessControl.getIpSettings.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  const { data: timeAccessSettings } = trpc.accessControl.getTimeAccessSettings.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  const { data: pendingAccessRequests } = trpc.accessControl.getPendingRequestCount.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  // Mutations
  const updateSessionSettingsMutation = trpc.security.updateSessionSettings.useMutation({
    onSuccess: () => {
      toast.success('Session settings updated');
      refetchSessionSettings();
      setIsPolicyDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update settings');
    },
  });

  const updateMfaPolicyMutation = trpc.security.updateMFAPolicy.useMutation({
    onSuccess: () => {
      toast.success('MFA policy updated');
      refetchMfaPolicy();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update MFA policy');
    },
  });

  const updateIpSettingsMutation = trpc.accessControl.updateIpSettings.useMutation({
    onSuccess: () => {
      toast.success('IP settings updated');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update IP settings');
    },
  });

  const terminateSessionMutation = trpc.security.terminateSession.useMutation({
    onSuccess: () => {
      toast.success('Session terminated');
      refetchSessions();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to terminate session');
    },
  });

  const adminTerminateAllMutation = trpc.security.adminTerminateUserSessions.useMutation({
    onSuccess: () => {
      toast.success('All sessions terminated for user');
      refetchSessions();
      setIsTerminateAllDialogOpen(false);
      setSelectedUserId(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to terminate sessions');
    },
  });

  // Export mutation
  const exportMutation = trpc.security.exportSecurityEvents.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.content], {
        type: data.format === 'csv' ? 'text/csv' : 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.eventCount} events`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to export events');
    },
  });

  const handleRefresh = () => {
    refetchStats();
    refetchAlerts();
    refetchEvents();
    refetchSessions();
  };

  const handleExport = (format: 'json' | 'csv') => {
    const endDate = new Date();
    const startDate = new Date(Date.now() - parseInt(timeRange) * 60 * 60 * 1000);
    exportMutation.mutate({ startDate, endDate, format });
  };

  const handleSavePolicy = () => {
    // Update session settings
    updateSessionSettingsMutation.mutate({
      sessionTimeoutMinutes: policyForm.sessionTimeoutMinutes,
      idleTimeoutMinutes: policyForm.idleTimeoutMinutes,
      maxConcurrentSessions: policyForm.maxConcurrentSessions,
      ipWhitelistEnabled: policyForm.ipWhitelistEnabled,
      ipWhitelist: policyForm.ipWhitelist.split('\n').filter(Boolean),
      ipBlacklist: policyForm.ipBlacklist.split('\n').filter(Boolean),
    });

    // Update MFA policy
    const mfaRoles: ('OWNER' | 'ADMIN' | 'PROVIDER' | 'STAFF' | 'BILLER')[] = policyForm.mfaRequired
      ? ['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER']
      : policyForm.mfaRequiredForRoles.includes('ADMIN')
        ? ['OWNER', 'ADMIN']
        : [];
    updateMfaPolicyMutation.mutate({
      mfaRequired: policyForm.mfaRequired,
      mfaRequiredForRoles: mfaRoles,
      mfaGracePeriodDays: policyForm.mfaGracePeriodDays,
    });
  };

  // Initialize policy form when data loads
  const initializePolicyForm = () => {
    setPolicyForm({
      sessionTimeoutMinutes: sessionSettings?.sessionTimeoutMinutes ?? 60,
      idleTimeoutMinutes: sessionSettings?.idleTimeoutMinutes ?? 30,
      maxConcurrentSessions: sessionSettings?.maxConcurrentSessions ?? 3,
      mfaRequired: mfaPolicy?.mfaRequired ?? false,
      mfaRequiredForRoles: mfaPolicy?.mfaRequiredForRoles ?? [],
      mfaGracePeriodDays: mfaPolicy?.mfaGracePeriodDays ?? 7,
      ipWhitelistEnabled: ipSettings?.ipWhitelistEnabled ?? false,
      ipWhitelist: ipSettings?.ipWhitelist?.join('\n') ?? '',
      ipBlacklist: ipSettings?.ipBlacklist?.join('\n') ?? '',
      accessHoursEnabled: timeAccessSettings?.accessHoursEnabled ?? false,
      accessHoursStart: timeAccessSettings?.accessHoursStart ?? '09:00',
      accessHoursEnd: timeAccessSettings?.accessHoursEnd ?? '17:00',
      accessHoursTimezone: timeAccessSettings?.accessHoursTimezone ?? 'America/New_York',
    });
  };

  // Calculate compliance score
  const calculateComplianceScore = () => {
    let score = 0;
    let total = 0;

    // MFA Policy (20 points)
    total += 20;
    if (mfaPolicy?.mfaRequired || (mfaPolicy?.mfaRequiredForRoles && mfaPolicy.mfaRequiredForRoles.length > 0)) score += 20;

    // Session Security (20 points)
    total += 20;
    if (sessionSettings?.sessionTimeoutMinutes && sessionSettings.sessionTimeoutMinutes <= 60) score += 10;
    if (sessionSettings?.idleTimeoutMinutes && sessionSettings.idleTimeoutMinutes <= 30) score += 10;

    // BAA Compliance (20 points)
    total += 20;
    if (baaStats?.complianceScore) score += Math.round(baaStats.complianceScore * 0.2);

    // Access Controls (20 points)
    total += 20;
    if (ipSettings?.ipWhitelistEnabled || (ipSettings?.ipBlacklist && ipSettings.ipBlacklist.length > 0)) score += 10;
    if (timeAccessSettings?.accessHoursEnabled) score += 10;

    // No critical alerts (20 points)
    total += 20;
    const criticalAlerts = alerts?.alerts.filter(a => a.severity === 'CRITICAL').length ?? 0;
    if (criticalAlerts === 0) score += 20;
    else if (criticalAlerts <= 2) score += 10;

    return Math.round((score / total) * 100);
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#053e67]/50"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
              <p>You don&apos;t have permission to access security administration.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const complianceScore = calculateComplianceScore();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-[#053e67]" />
            Security Administration
          </h1>
          <p className="text-gray-500 mt-1">Comprehensive security management and compliance monitoring.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last hour</SelectItem>
              <SelectItem value="24">Last 24 hours</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
              <SelectItem value="720">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm" onClick={() => { initializePolicyForm(); setIsPolicyDialogOpen(true); }}>
            <Settings className="h-4 w-4 mr-2" />
            Security Policy
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      {alerts && alerts.alerts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-800 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Security Alerts ({alerts.alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.alerts.slice(0, 3).map((alert, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg ${
                    alert.severity === 'CRITICAL' ? 'bg-red-100' : 'bg-yellow-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Badge className={alert.severity === 'CRITICAL' ? 'bg-red-600' : 'bg-yellow-600'}>
                      {alert.severity}
                    </Badge>
                    <span className="font-medium">{alert.type.replace(/_/g, ' ')}</span>
                    <span className="text-gray-500 text-sm">
                      {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm mt-1 text-gray-700">{alert.message}</p>
                </div>
              ))}
              {alerts.alerts.length > 3 && (
                <p className="text-sm text-gray-600">
                  And {alerts.alerts.length - 3} more alerts...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compliance Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Compliance Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Compliance Score</CardDescription>
            <CardTitle className={`text-3xl ${
              complianceScore >= 80 ? 'text-green-600' :
              complianceScore >= 60 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {complianceScore}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {complianceScore >= 80 ? (
                <ShieldCheck className="h-4 w-4 text-green-500" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-yellow-500" />
              )}
              <span>Overall health</span>
            </div>
          </CardContent>
        </Card>

        {/* Security Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Security Events</CardDescription>
            <CardTitle className="text-3xl">
              {statsLoading ? '...' : stats?.totalEvents.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Activity className="h-4 w-4" />
              <span>Last {timeRange}h</span>
            </div>
          </CardContent>
        </Card>

        {/* Failed Logins */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed Logins</CardDescription>
            <CardTitle className="text-3xl text-red-600">
              {failedLogins ? failedLogins.totalAttempts : '...'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <XCircle className="h-4 w-4" />
              <span>{failedLogins?.suspiciousIPs.length || 0} suspicious IPs</span>
            </div>
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Sessions</CardDescription>
            <CardTitle className="text-3xl text-blue-600">
              {sessionsLoading ? '...' : orgSessions?.length ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Users className="h-4 w-4" />
              <span>Across all users</span>
            </div>
          </CardContent>
        </Card>

        {/* MFA Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>MFA Policy</CardDescription>
            <CardTitle className="text-xl">
              {mfaPolicy?.mfaRequired ? (
                <Badge className="bg-green-100 text-green-800">Required</Badge>
              ) : mfaPolicy?.mfaRequiredForRoles && mfaPolicy.mfaRequiredForRoles.includes('ADMIN') ? (
                <Badge className="bg-yellow-100 text-yellow-800">Admins Only</Badge>
              ) : (
                <Badge className="bg-gray-100 text-gray-800">Optional</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Key className="h-4 w-4" />
              <span>Two-factor auth</span>
            </div>
          </CardContent>
        </Card>

        {/* BAA Compliance */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>BAA Compliance</CardDescription>
            <CardTitle className={`text-3xl ${
              (baaStats?.complianceScore ?? 0) >= 80 ? 'text-green-600' :
              (baaStats?.complianceScore ?? 0) >= 60 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {baaStats?.complianceScore ?? 0}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/compliance" className="flex items-center gap-2 text-sm text-[#053e67] hover:underline">
              <FileText className="h-4 w-4" />
              <span>View BAAs</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <Monitor className="h-4 w-4 mr-2" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="mfa">
            <Key className="h-4 w-4 mr-2" />
            MFA
          </TabsTrigger>
          <TabsTrigger value="events">
            <FileText className="h-4 w-4 mr-2" />
            Events
          </TabsTrigger>
          <TabsTrigger value="access">
            <Lock className="h-4 w-4 mr-2" />
            Access Control
          </TabsTrigger>
          <TabsTrigger value="reports">
            <ClipboardList className="h-4 w-4 mr-2" />
            Reports
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Security Status Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Security Status Summary</CardTitle>
                <CardDescription>Current security posture at a glance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${mfaPolicy?.mfaRequired || (mfaPolicy?.mfaRequiredForRoles && mfaPolicy.mfaRequiredForRoles.length > 0) ? 'bg-green-100' : 'bg-yellow-100'}`}>
                        <Key className={`h-4 w-4 ${mfaPolicy?.mfaRequired || (mfaPolicy?.mfaRequiredForRoles && mfaPolicy.mfaRequiredForRoles.length > 0) ? 'text-green-600' : 'text-yellow-600'}`} />
                      </div>
                      <div>
                        <p className="font-medium">Multi-Factor Authentication</p>
                        <p className="text-sm text-gray-500">
                          {mfaPolicy?.mfaRequired ? 'Required for all users' :
                           (mfaPolicy?.mfaRequiredForRoles && mfaPolicy.mfaRequiredForRoles.includes('ADMIN')) ? 'Required for admins' : 'Not enforced'}
                        </p>
                      </div>
                    </div>
                    <Badge className={mfaPolicy?.mfaRequired || (mfaPolicy?.mfaRequiredForRoles && mfaPolicy.mfaRequiredForRoles.length > 0) ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                      {mfaPolicy?.mfaRequired ? 'Enforced' : (mfaPolicy?.mfaRequiredForRoles && mfaPolicy.mfaRequiredForRoles.includes('ADMIN')) ? 'Partial' : 'Not Set'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${sessionSettings?.sessionTimeoutMinutes && sessionSettings.sessionTimeoutMinutes <= 60 ? 'bg-green-100' : 'bg-yellow-100'}`}>
                        <Clock className={`h-4 w-4 ${sessionSettings?.sessionTimeoutMinutes && sessionSettings.sessionTimeoutMinutes <= 60 ? 'text-green-600' : 'text-yellow-600'}`} />
                      </div>
                      <div>
                        <p className="font-medium">Session Timeout</p>
                        <p className="text-sm text-gray-500">
                          {sessionSettings?.sessionTimeoutMinutes ? `${sessionSettings.sessionTimeoutMinutes} minutes` : 'Not configured'}
                        </p>
                      </div>
                    </div>
                    <Badge className={sessionSettings?.sessionTimeoutMinutes && sessionSettings.sessionTimeoutMinutes <= 60 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                      {sessionSettings?.sessionTimeoutMinutes && sessionSettings.sessionTimeoutMinutes <= 60 ? 'Secure' : 'Review'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${ipSettings?.ipWhitelistEnabled || (ipSettings?.ipBlacklist && ipSettings.ipBlacklist.length > 0) ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <Globe className={`h-4 w-4 ${ipSettings?.ipWhitelistEnabled || (ipSettings?.ipBlacklist && ipSettings.ipBlacklist.length > 0) ? 'text-green-600' : 'text-gray-600'}`} />
                      </div>
                      <div>
                        <p className="font-medium">IP Restrictions</p>
                        <p className="text-sm text-gray-500">
                          {ipSettings?.ipWhitelistEnabled ? 'Whitelist active' :
                           (ipSettings?.ipBlacklist && ipSettings.ipBlacklist.length > 0) ? 'Blacklist active' : 'No restrictions'}
                        </p>
                      </div>
                    </div>
                    <Badge className={ipSettings?.ipWhitelistEnabled || (ipSettings?.ipBlacklist && ipSettings.ipBlacklist.length > 0) ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {ipSettings?.ipWhitelistEnabled || (ipSettings?.ipBlacklist && ipSettings.ipBlacklist.length > 0) ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${timeAccessSettings?.accessHoursEnabled ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <Calendar className={`h-4 w-4 ${timeAccessSettings?.accessHoursEnabled ? 'text-green-600' : 'text-gray-600'}`} />
                      </div>
                      <div>
                        <p className="font-medium">Time-Based Access</p>
                        <p className="text-sm text-gray-500">
                          {timeAccessSettings?.accessHoursEnabled ?
                            `${timeAccessSettings.accessHoursStart} - ${timeAccessSettings.accessHoursEnd}` :
                            'No time restrictions'}
                        </p>
                      </div>
                    </div>
                    <Badge className={timeAccessSettings?.accessHoursEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {timeAccessSettings?.accessHoursEnabled ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Authentication Statistics</CardTitle>
                <CardDescription>Login activity in the last {timeRange} hours</CardDescription>
              </CardHeader>
              <CardContent>
                {stats && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-2 border-b">
                      <span className="text-gray-600">Successful Logins</span>
                      <span className="font-medium text-green-600">{stats.authEvents.loginSuccess}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 border-b">
                      <span className="text-gray-600">Failed Logins</span>
                      <span className="font-medium text-red-600">{stats.authEvents.loginFailure}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 border-b">
                      <span className="text-gray-600">MFA Verifications</span>
                      <span className="font-medium">{stats.authEvents.mfaSuccess}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 border-b">
                      <span className="text-gray-600">MFA Failures</span>
                      <span className="font-medium text-orange-600">{stats.authEvents.mfaFailure}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 border-b">
                      <span className="text-gray-600">Logouts</span>
                      <span className="font-medium">{stats.authEvents.logout}</span>
                    </div>
                    <div className="flex justify-between items-center p-2">
                      <span className="text-gray-600">Password Changes</span>
                      <span className="font-medium">{stats.authEvents.passwordChanges}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Pending Access Requests */}
          {pendingAccessRequests && pendingAccessRequests.count > 0 && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader>
                <CardTitle className="text-yellow-800 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Pending Access Requests ({pendingAccessRequests.count})
                </CardTitle>
                <CardDescription>Users requesting elevated permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/admin/access-requests">
                  <Button variant="outline" size="sm">
                    Review Requests
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Active Sessions</CardTitle>
                  <CardDescription>All active user sessions across the organization</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search sessions..."
                      className="pl-10 w-[200px]"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#053e67]/50"></div>
                </div>
              ) : orgSessions?.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Monitor className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No active sessions found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgSessions
                      ?.filter(session =>
                        !searchFilter ||
                        session.user.email.toLowerCase().includes(searchFilter.toLowerCase()) ||
                        session.ipAddress?.includes(searchFilter)
                      )
                      .map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-400" />
                              <div>
                                <p className="font-medium">{`${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || 'Unknown'}</p>
                                <p className="text-sm text-gray-500">{session.user.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getDeviceIcon(session.browser || '')}
                              <span className="text-sm">
                                {session.browser || 'Unknown'} / {session.os || 'Unknown'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{session.ipAddress || 'Unknown'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Globe className="h-3 w-3 text-gray-400" />
                              <span className="text-sm">
                                {session.city && session.country
                                  ? `${session.city}, ${session.country}`
                                  : 'Unknown'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(session.createdAt), 'MMM d, h:mm a')}
                          </TableCell>
                          <TableCell className="text-sm">
                            {session.lastActivityAt
                              ? formatDistanceToNow(new Date(session.lastActivityAt), { addSuffix: true })
                              : 'Never'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge className={
                                session.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                                session.status === 'SUSPICIOUS' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }>
                                {session.status}
                              </Badge>
                              {session.mfaVerified && (
                                <Badge className="bg-blue-100 text-blue-800">MFA</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => terminateSessionMutation.mutate({ sessionId: session.id })}
                              >
                                <LogOut className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  setSelectedUserId(session.userId);
                                  setIsTerminateAllDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MFA Management Tab */}
        <TabsContent value="mfa" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>MFA Policy Configuration</CardTitle>
                <CardDescription>Configure organization-wide MFA requirements</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Require MFA for All Users</p>
                      <p className="text-sm text-gray-500">All users must enable MFA to access the system</p>
                    </div>
                    <Switch
                      checked={mfaPolicy?.mfaRequired ?? false}
                      onCheckedChange={(checked) => {
                        updateMfaPolicyMutation.mutate({
                          mfaRequired: checked,
                          mfaRequiredForRoles: checked ? ['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER'] : [],
                        });
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Require MFA for Admins Only</p>
                      <p className="text-sm text-gray-500">Only admin users must enable MFA</p>
                    </div>
                    <Switch
                      checked={mfaPolicy?.mfaRequiredForRoles?.includes('ADMIN') && !mfaPolicy?.mfaRequired}
                      disabled={mfaPolicy?.mfaRequired}
                      onCheckedChange={(checked) => {
                        updateMfaPolicyMutation.mutate({
                          mfaRequired: false,
                          mfaRequiredForRoles: checked ? ['OWNER', 'ADMIN'] : [],
                        });
                      }}
                    />
                  </div>

                  <div className="p-4 border rounded-lg">
                    <p className="font-medium mb-2">Grace Period</p>
                    <p className="text-sm text-gray-500 mb-3">Days allowed to set up MFA after policy enforcement</p>
                    <Select
                      value={String(mfaPolicy?.mfaGracePeriodDays ?? 7)}
                      onValueChange={(value) => {
                        updateMfaPolicyMutation.mutate({
                          mfaGracePeriodDays: parseInt(value),
                          mfaRequired: mfaPolicy?.mfaRequired ?? false,
                          mfaRequiredForRoles: mfaPolicy?.mfaRequiredForRoles ?? [],
                        });
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">No grace period</SelectItem>
                        <SelectItem value="3">3 days</SelectItem>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>MFA Statistics</CardTitle>
                <CardDescription>MFA adoption across your organization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 border-b">
                    <span className="text-gray-600">MFA Success Rate</span>
                    <span className="font-medium text-green-600">
                      {stats?.authEvents.mfaSuccess && stats.authEvents.mfaFailure
                        ? `${Math.round((stats.authEvents.mfaSuccess / (stats.authEvents.mfaSuccess + stats.authEvents.mfaFailure)) * 100)}%`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 border-b">
                    <span className="text-gray-600">MFA Failures (Last {timeRange}h)</span>
                    <span className="font-medium text-red-600">{stats?.authEvents.mfaFailure ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 border-b">
                    <span className="text-gray-600">Recovery Codes Used</span>
                    <span className="font-medium text-orange-600">
                      {eventsData?.events.filter(e => e.eventType === 'MFA_RECOVERY_USED').length ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3">
                    <span className="text-gray-600">MFA Enabled Events</span>
                    <span className="font-medium text-green-600">
                      {eventsData?.events.filter(e => e.eventType === 'MFA_ENABLED').length ?? 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Security Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Security Event Log</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search events..."
                      className="pl-10 w-[200px]"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                    />
                  </div>
                  <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="LOGIN_SUCCESS">Login Success</SelectItem>
                      <SelectItem value="LOGIN_FAILURE">Login Failure</SelectItem>
                      <SelectItem value="PHI_ACCESSED">PHI Accessed</SelectItem>
                      <SelectItem value="CONFIG_CHANGED">Config Changed</SelectItem>
                      <SelectItem value="SUSPICIOUS_ACTIVITY">Suspicious Activity</SelectItem>
                      <SelectItem value="SESSION_CREATED">Session Created</SelectItem>
                      <SelectItem value="SESSION_TERMINATED">Session Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#053e67]/50"></div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {eventsData?.events
                    .filter(
                      (event) =>
                        !searchFilter ||
                        event.user?.email?.toLowerCase().includes(searchFilter.toLowerCase()) ||
                        event.ipAddress?.includes(searchFilter) ||
                        event.eventType.toLowerCase().includes(searchFilter.toLowerCase())
                    )
                    .map((event) => {
                      const config = eventTypeConfig[event.eventType] || {
                        label: event.eventType,
                        icon: <Activity className="h-4 w-4" />,
                        color: 'bg-gray-100 text-gray-800',
                      };

                      return (
                        <div
                          key={event.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${config.color}`}>
                              {config.icon}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{config.label}</span>
                                <Badge className={severityColors[event.severity]} variant="outline">
                                  {event.severity}
                                </Badge>
                                {!event.success && (
                                  <Badge variant="destructive">Failed</Badge>
                                )}
                              </div>
                              <div className="text-sm text-gray-500 flex items-center gap-2">
                                {event.user && (
                                  <>
                                    <User className="h-3 w-3" />
                                    <span>{event.user.email}</span>
                                    <span>|</span>
                                  </>
                                )}
                                <span>{event.ipAddress || 'Unknown IP'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                          </div>
                        </div>
                      );
                    })}
                  {eventsData?.events.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No security events found
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Access Control Tab */}
        <TabsContent value="access" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>IP Restrictions</CardTitle>
                <CardDescription>Control access based on IP addresses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">IP Whitelist</p>
                      <p className="text-sm text-gray-500">Only allow access from specified IPs</p>
                    </div>
                    <Switch
                      checked={ipSettings?.ipWhitelistEnabled ?? false}
                      onCheckedChange={(checked) => {
                        updateIpSettingsMutation.mutate({
                          ipWhitelistEnabled: checked,
                        });
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">IP Blacklist</p>
                      <p className="text-sm text-gray-500">Block access from specified IPs</p>
                    </div>
                    <Switch
                      checked={(ipSettings?.ipBlacklist && ipSettings.ipBlacklist.length > 0) ?? false}
                      onCheckedChange={(checked) => {
                        // Note: blacklist is managed via the list, not a toggle
                        toast.info('Configure blacklist IPs in Security Policy settings');
                      }}
                    />
                  </div>

                  {(ipSettings?.ipWhitelistEnabled || (ipSettings?.ipBlacklist && ipSettings.ipBlacklist.length > 0)) && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-700">
                        <AlertTriangle className="h-4 w-4 inline mr-1" />
                        Configure IP lists in Security Policy settings
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Time-Based Access</CardTitle>
                <CardDescription>Restrict access to specific hours</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Enable Time Restrictions</p>
                      <p className="text-sm text-gray-500">Limit access to business hours</p>
                    </div>
                    <Badge className={timeAccessSettings?.accessHoursEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {timeAccessSettings?.accessHoursEnabled ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {timeAccessSettings?.accessHoursEnabled && (
                    <div className="p-4 border rounded-lg">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Start Time</p>
                          <p className="text-lg">{timeAccessSettings.accessHoursStart}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">End Time</p>
                          <p className="text-lg">{timeAccessSettings.accessHoursEnd}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-sm font-medium text-gray-600">Timezone</p>
                          <p>{timeAccessSettings.accessHoursTimezone}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-sm font-medium text-gray-600">Active Days</p>
                          <p className="text-sm">
                            {timeAccessSettings.accessHoursDays?.length === 7
                              ? 'All days'
                              : timeAccessSettings.accessHoursDays?.map(d =>
                                  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]
                                ).join(', ')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Emergency Access */}
          <Card>
            <CardHeader>
              <CardTitle>Emergency Access (Break Glass)</CardTitle>
              <CardDescription>Configure emergency override access for critical situations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-6 w-6 text-red-600" />
                  <div>
                    <p className="font-medium text-red-800">Emergency access provides temporary elevated permissions</p>
                    <p className="text-sm text-red-600">All emergency access is logged and triggers notifications</p>
                  </div>
                </div>
                <div className="mt-4">
                  <Link href="/admin/emergency-access">
                    <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-100">
                      Configure Emergency Access
                      <ExternalLink className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Security Reports</CardTitle>
                <CardDescription>Generate compliance and security reports</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button variant="outline" className="w-full justify-start" onClick={() => handleExport('csv')}>
                    <FileText className="h-4 w-4 mr-3" />
                    Security Events Report (CSV)
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => handleExport('json')}>
                    <FileText className="h-4 w-4 mr-3" />
                    Security Events Report (JSON)
                  </Button>
                  <Link href="/admin/compliance">
                    <Button variant="outline" className="w-full justify-start">
                      <Shield className="h-4 w-4 mr-3" />
                      BAA Compliance Report
                      <ExternalLink className="h-4 w-4 ml-auto" />
                    </Button>
                  </Link>
                  <Link href="/settings/security">
                    <Button variant="outline" className="w-full justify-start">
                      <Eye className="h-4 w-4 mr-3" />
                      PHI Access Report
                      <ExternalLink className="h-4 w-4 ml-auto" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Compliance Summary</CardTitle>
                <CardDescription>Key compliance metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border-b">
                    <span className="text-gray-600">Overall Compliance Score</span>
                    <Badge className={
                      complianceScore >= 80 ? 'bg-green-100 text-green-800' :
                      complianceScore >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                    }>
                      {complianceScore}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border-b">
                    <span className="text-gray-600">Active BAAs</span>
                    <span className="font-medium">{baaStats?.byStatus.active ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border-b">
                    <span className="text-gray-600">Expired BAAs</span>
                    <span className="font-medium text-red-600">{baaStats?.expirations.expiredCount ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border-b">
                    <span className="text-gray-600">Critical Security Alerts</span>
                    <span className="font-medium text-red-600">
                      {alerts?.alerts.filter(a => a.severity === 'CRITICAL').length ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3">
                    <span className="text-gray-600">PHI Access Events (24h)</span>
                    <span className="font-medium">
                      {eventsData?.events.filter(e =>
                        ['PHI_ACCESSED', 'PHI_EXPORTED', 'PHI_MODIFIED'].includes(e.eventType)
                      ).length ?? 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Security Policy Dialog */}
      <Dialog open={isPolicyDialogOpen} onOpenChange={setIsPolicyDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Security Policy Configuration</DialogTitle>
            <DialogDescription>
              Configure organization-wide security policies
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            {/* Session Settings */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg">Session Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeoutMinutes">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeoutMinutes"
                    type="number"
                    min={5}
                    max={1440}
                    value={policyForm.sessionTimeoutMinutes}
                    onChange={(e) => setPolicyForm({ ...policyForm, sessionTimeoutMinutes: parseInt(e.target.value) || 60 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="idleTimeoutMinutes">Idle Timeout (minutes)</Label>
                  <Input
                    id="idleTimeoutMinutes"
                    type="number"
                    min={5}
                    max={1440}
                    value={policyForm.idleTimeoutMinutes}
                    onChange={(e) => setPolicyForm({ ...policyForm, idleTimeoutMinutes: parseInt(e.target.value) || 30 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxConcurrentSessions">Max Concurrent Sessions</Label>
                  <Input
                    id="maxConcurrentSessions"
                    type="number"
                    min={1}
                    max={10}
                    value={policyForm.maxConcurrentSessions}
                    onChange={(e) => setPolicyForm({ ...policyForm, maxConcurrentSessions: parseInt(e.target.value) || 3 })}
                  />
                </div>
              </div>
            </div>

            {/* MFA Settings */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg">MFA Settings</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mfaRequired">Require MFA for All Users</Label>
                  <Switch
                    id="mfaRequired"
                    checked={policyForm.mfaRequired}
                    onCheckedChange={(checked) => setPolicyForm({ ...policyForm, mfaRequired: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="mfaRequiredForAdmins">Require MFA for Admins Only</Label>
                  <Switch
                    id="mfaRequiredForAdmins"
                    checked={policyForm.mfaRequiredForRoles.includes('ADMIN')}
                    disabled={policyForm.mfaRequired}
                    onCheckedChange={(checked) => setPolicyForm({
                      ...policyForm,
                      mfaRequiredForRoles: checked ? ['ADMIN'] : []
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mfaGracePeriodDays">Grace Period (days)</Label>
                  <Input
                    id="mfaGracePeriodDays"
                    type="number"
                    min={0}
                    max={30}
                    value={policyForm.mfaGracePeriodDays}
                    onChange={(e) => setPolicyForm({ ...policyForm, mfaGracePeriodDays: parseInt(e.target.value) || 7 })}
                  />
                </div>
              </div>
            </div>

            {/* IP Restrictions */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg">IP Restrictions</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ipWhitelistEnabled">Enable IP Whitelist</Label>
                  <Switch
                    id="ipWhitelistEnabled"
                    checked={policyForm.ipWhitelistEnabled}
                    onCheckedChange={(checked) => setPolicyForm({ ...policyForm, ipWhitelistEnabled: checked })}
                  />
                </div>
                {policyForm.ipWhitelistEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="ipWhitelist">Whitelist IPs (one per line, CIDR supported)</Label>
                    <textarea
                      id="ipWhitelist"
                      className="w-full h-24 p-2 border rounded-md text-sm font-mono"
                      placeholder="192.168.1.0/24&#10;10.0.0.1"
                      value={policyForm.ipWhitelist}
                      onChange={(e) => setPolicyForm({ ...policyForm, ipWhitelist: e.target.value })}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="ipBlacklist">Blacklist IPs (one per line, CIDR supported)</Label>
                  <textarea
                    id="ipBlacklist"
                    className="w-full h-24 p-2 border rounded-md text-sm font-mono"
                    placeholder="192.168.1.100&#10;10.0.0.0/8"
                    value={policyForm.ipBlacklist}
                    onChange={(e) => setPolicyForm({ ...policyForm, ipBlacklist: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPolicyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePolicy} disabled={updateSessionSettingsMutation.isPending}>
              {updateSessionSettingsMutation.isPending ? 'Saving...' : 'Save Policy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminate All Sessions Dialog */}
      <Dialog open={isTerminateAllDialogOpen} onOpenChange={setIsTerminateAllDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminate All Sessions</DialogTitle>
            <DialogDescription>
              This will force logout the user from all devices. They will need to log in again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to terminate all sessions for this user?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTerminateAllDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedUserId) {
                  adminTerminateAllMutation.mutate({ userId: selectedUserId });
                }
              }}
              disabled={adminTerminateAllMutation.isPending}
            >
              {adminTerminateAllMutation.isPending ? 'Terminating...' : 'Terminate All Sessions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
