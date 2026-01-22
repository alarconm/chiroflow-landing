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
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

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
};

const severityColors: Record<string, string> = {
  INFO: 'bg-blue-100 text-blue-800',
  WARNING: 'bg-yellow-100 text-yellow-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

export default function SecurityDashboardPage() {
  const { isAtLeast, isLoading: permissionsLoading } = usePermissions();
  const isAdmin = isAtLeast('ADMIN');

  const [timeRange, setTimeRange] = useState<string>('24');
  const [searchFilter, setSearchFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');

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

  // Export mutation
  const exportMutation = trpc.security.exportSecurityEvents.useMutation({
    onSuccess: (data) => {
      // Create download
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
  };

  const handleExport = (format: 'json' | 'csv') => {
    const endDate = new Date();
    const startDate = new Date(Date.now() - parseInt(timeRange) * 60 * 60 * 1000);
    exportMutation.mutate({ startDate, endDate, format });
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
              <p>You don&apos;t have permission to view security settings.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-[#053e67]" />
            Security Dashboard
          </h1>
          <p className="text-gray-500 mt-1">Monitor security events and detect threats.</p>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Events</CardDescription>
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
              <span>
                {failedLogins?.suspiciousIPs.length || 0} suspicious IPs
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Critical Events</CardDescription>
            <CardTitle className="text-3xl text-orange-600">
              {statsLoading ? '...' : stats?.bySeverity.CRITICAL || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <AlertTriangle className="h-4 w-4" />
              <span>{stats?.bySeverity.WARNING || 0} warnings</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Auth Success Rate</CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {statsLoading
                ? '...'
                : stats && stats.authEvents.loginSuccess + stats.authEvents.loginFailure > 0
                ? `${Math.round(
                    (stats.authEvents.loginSuccess /
                      (stats.authEvents.loginSuccess + stats.authEvents.loginFailure)) *
                      100
                  )}%`
                : 'N/A'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <CheckCircle className="h-4 w-4" />
              <span>
                {stats?.authEvents.loginSuccess || 0} successful logins
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events">
            <FileText className="h-4 w-4 mr-2" />
            Event Log
          </TabsTrigger>
          <TabsTrigger value="auth">
            <Key className="h-4 w-4 mr-2" />
            Authentication
          </TabsTrigger>
          <TabsTrigger value="phi">
            <Eye className="h-4 w-4 mr-2" />
            PHI Access
          </TabsTrigger>
          <TabsTrigger value="threats">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Threats
          </TabsTrigger>
        </TabsList>

        {/* Event Log Tab */}
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
                <div className="space-y-2">
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

        {/* Authentication Tab */}
        <TabsContent value="auth" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Authentication Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                {stats && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Successful Logins</span>
                      <span className="font-medium text-green-600">
                        {stats.authEvents.loginSuccess}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Failed Logins</span>
                      <span className="font-medium text-red-600">
                        {stats.authEvents.loginFailure}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">MFA Verifications</span>
                      <span className="font-medium">
                        {stats.authEvents.mfaSuccess} / {stats.authEvents.mfaSuccess + stats.authEvents.mfaFailure}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Logouts</span>
                      <span className="font-medium">{stats.authEvents.logout}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Password Changes</span>
                      <span className="font-medium">{stats.authEvents.passwordChanges}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Suspicious IPs</CardTitle>
                <CardDescription>
                  IPs with 5+ failed login attempts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {failedLogins?.suspiciousIPs.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    No suspicious IPs detected
                  </div>
                ) : (
                  <div className="space-y-3">
                    {failedLogins?.suspiciousIPs.map((ip, index) => (
                      <div
                        key={index}
                        className="p-3 bg-red-50 rounded-lg border border-red-200"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-medium">{ip.ipAddress}</span>
                          <Badge variant="destructive">{ip.attemptCount} attempts</Badge>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {format(new Date(ip.firstAttempt), 'MMM d, h:mm a')} -{' '}
                          {format(new Date(ip.lastAttempt), 'h:mm a')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PHI Access Tab */}
        <TabsContent value="phi" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PHI Access Log</CardTitle>
              <CardDescription>
                Track access to Protected Health Information for HIPAA compliance
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventsData?.events
                .filter((e) => ['PHI_ACCESSED', 'PHI_EXPORTED', 'PHI_MODIFIED'].includes(e.eventType))
                .map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 border-b last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-100 text-purple-800">
                        <Eye className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium">
                          {eventTypeConfig[event.eventType]?.label || event.eventType}
                        </div>
                        <div className="text-sm text-gray-500">
                          {event.user?.email || 'Unknown'} |{' '}
                          {event.entityType && `${event.entityType} `}
                          {event.entityId && `#${event.entityId.slice(0, 8)}`}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-gray-500">
                      {format(new Date(event.createdAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                ))}
              {eventsData?.events.filter((e) =>
                ['PHI_ACCESSED', 'PHI_EXPORTED', 'PHI_MODIFIED'].includes(e.eventType)
              ).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No PHI access events in the selected period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Threats Tab */}
        <TabsContent value="threats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Threat Detection</CardTitle>
              <CardDescription>
                Automated analysis of suspicious patterns and potential threats
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#053e67]/50"></div>
                </div>
              ) : alerts?.alerts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p className="text-gray-600 font-medium">No threats detected</p>
                  <p className="text-sm text-gray-500">
                    Analyzed {alerts?.totalEvents} events in the last {alerts?.periodHours} hours
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {alerts?.alerts.map((alert, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-red-50 border-red-200'
                          : 'bg-yellow-50 border-yellow-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle
                            className={`h-5 w-5 ${
                              alert.severity === 'CRITICAL' ? 'text-red-600' : 'text-yellow-600'
                            }`}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {alert.type.replace(/_/g, ' ')}
                              </span>
                              <Badge
                                className={
                                  alert.severity === 'CRITICAL' ? 'bg-red-600' : 'bg-yellow-600'
                                }
                              >
                                {alert.severity}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">{alert.message}</p>
                          </div>
                        </div>
                        <span className="text-sm text-gray-500">
                          {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                        </span>
                      </div>
                      {alert.details && Object.keys(alert.details).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="text-sm text-gray-600">
                            {Object.entries(alert.details).map(([key, value]) => (
                              <span key={key} className="mr-4">
                                <span className="font-medium">{key}:</span>{' '}
                                {typeof value === 'object'
                                  ? JSON.stringify(value)
                                  : String(value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
