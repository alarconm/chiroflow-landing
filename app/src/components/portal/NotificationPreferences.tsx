'use client';

/**
 * Epic 14: Patient Portal - US-100 Portal Notification Preferences
 *
 * Comprehensive notification preferences management allowing patients to control:
 * - Email notification preferences (reminders, messages, billing)
 * - SMS notification preferences
 * - Appointment reminder timing preferences
 * - Marketing communication opt-in/out
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/trpc/client';
import {
  Bell,
  Mail,
  MessageSquare,
  Calendar,
  CreditCard,
  FileText,
  Megaphone,
  CheckCircle,
  AlertCircle,
  Clock,
  Shield,
  Smartphone,
  Info,
} from 'lucide-react';

// Reminder timing options (hours before appointment)
const REMINDER_TIMING_OPTIONS = [
  { value: 1, label: '1 hour before' },
  { value: 2, label: '2 hours before' },
  { value: 4, label: '4 hours before' },
  { value: 12, label: '12 hours before' },
  { value: 24, label: '24 hours before (1 day)' },
  { value: 48, label: '48 hours before (2 days)' },
  { value: 72, label: '72 hours before (3 days)' },
  { value: 168, label: '168 hours before (1 week)' },
];

interface PreferencesState {
  // Email notifications
  emailNotifications: boolean;
  // SMS notifications
  smsNotifications: boolean;
  // Notification types
  notifyAppointmentReminders: boolean;
  notifyAppointmentChanges: boolean;
  notifyNewMessages: boolean;
  notifyNewDocuments: boolean;
  notifyBillingStatements: boolean;
  notifyFormRequests: boolean;
  // Reminder timing
  reminderTiming1: number;
  reminderTiming2: number | null;
  reminderTiming3: number | null;
  // Marketing preferences
  marketingEmailOptIn: boolean;
  marketingSmsOptIn: boolean;
  marketingCallOptIn: boolean;
}

export function NotificationPreferences() {
  const [token, setToken] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PreferencesState>({
    emailNotifications: true,
    smsNotifications: false,
    notifyAppointmentReminders: true,
    notifyAppointmentChanges: true,
    notifyNewMessages: true,
    notifyNewDocuments: true,
    notifyBillingStatements: true,
    notifyFormRequests: true,
    reminderTiming1: 24,
    reminderTiming2: null,
    reminderTiming3: null,
    marketingEmailOptIn: false,
    marketingSmsOptIn: false,
    marketingCallOptIn: false,
  });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialPreferences, setInitialPreferences] = useState<PreferencesState | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const { data: preferencesData, isLoading } = trpc.portal.getPreferences.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Initialize preferences from server data
  useEffect(() => {
    if (preferencesData) {
      const serverPrefs: PreferencesState = {
        emailNotifications: preferencesData.emailNotifications ?? true,
        smsNotifications: preferencesData.smsNotifications ?? false,
        notifyAppointmentReminders: preferencesData.notifyAppointmentReminders ?? true,
        notifyAppointmentChanges: preferencesData.notifyAppointmentChanges ?? true,
        notifyNewMessages: preferencesData.notifyNewMessages ?? true,
        notifyNewDocuments: preferencesData.notifyNewDocuments ?? true,
        notifyBillingStatements: preferencesData.notifyBillingStatements ?? true,
        notifyFormRequests: preferencesData.notifyFormRequests ?? true,
        reminderTiming1: preferencesData.reminderTiming1 ?? 24,
        reminderTiming2: preferencesData.reminderTiming2 ?? null,
        reminderTiming3: preferencesData.reminderTiming3 ?? null,
        marketingEmailOptIn: preferencesData.marketingEmailOptIn ?? false,
        marketingSmsOptIn: preferencesData.marketingSmsOptIn ?? false,
        marketingCallOptIn: preferencesData.marketingCallOptIn ?? false,
      };
      setPreferences(serverPrefs);
      setInitialPreferences(serverPrefs);
    }
  }, [preferencesData]);

  // Check for changes
  useEffect(() => {
    if (initialPreferences) {
      const changed = JSON.stringify(preferences) !== JSON.stringify(initialPreferences);
      setHasChanges(changed);
    }
  }, [preferences, initialPreferences]);

  const updatePreferencesMutation = trpc.portal.updatePreferences.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      setSaveError(null);
      setHasChanges(false);
      setInitialPreferences(preferences);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err) => {
      setSaveError(err.message);
      setSaveSuccess(false);
    },
  });

  const handleSave = useCallback(() => {
    if (!token) return;

    updatePreferencesMutation.mutate({
      sessionToken: token,
      ...preferences,
    });
  }, [token, preferences, updatePreferencesMutation]);

  const updatePreference = <K extends keyof PreferencesState>(
    key: K,
    value: PreferencesState[K]
  ) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  if (!token) return null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 animate-pulse rounded" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Notification Preferences
          </h1>
          <p className="text-gray-600 mt-1">
            Choose how and when you want to receive updates from us
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updatePreferencesMutation.isPending}
        >
          {updatePreferencesMutation.isPending ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>

      {/* Success/Error Messages */}
      {saveSuccess && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Your notification preferences have been saved successfully.
          </AlertDescription>
        </Alert>
      )}

      {saveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {hasChanges && (
        <Alert className="bg-amber-50 border-amber-200">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            You have unsaved changes. Click &quot;Save Preferences&quot; to apply them.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="channels" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="channels" className="flex items-center gap-2">
            <Mail className="h-4 w-4 hidden sm:block" />
            Channels
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4 hidden sm:block" />
            Types
          </TabsTrigger>
          <TabsTrigger value="reminders" className="flex items-center gap-2">
            <Clock className="h-4 w-4 hidden sm:block" />
            Timing
          </TabsTrigger>
          <TabsTrigger value="marketing" className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 hidden sm:block" />
            Marketing
          </TabsTrigger>
        </TabsList>

        {/* Communication Channels Tab */}
        <TabsContent value="channels">
          <Card>
            <CardHeader>
              <CardTitle>Communication Channels</CardTitle>
              <CardDescription>
                Choose how you prefer to receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Email Notifications */}
              <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Mail className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Email Notifications</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Receive notifications via email. We&apos;ll use the email address on your account.
                    </p>
                    {preferences.emailNotifications && (
                      <Badge variant="outline" className="mt-2 text-green-700 border-green-300 bg-green-50">
                        Active
                      </Badge>
                    )}
                  </div>
                </div>
                <Switch
                  checked={preferences.emailNotifications}
                  onCheckedChange={(checked) => updatePreference('emailNotifications', checked)}
                />
              </div>

              {/* SMS Notifications */}
              <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Smartphone className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">SMS/Text Notifications</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Receive text message notifications. Standard messaging rates may apply.
                    </p>
                    {preferences.smsNotifications && (
                      <Badge variant="outline" className="mt-2 text-green-700 border-green-300 bg-green-50">
                        Active
                      </Badge>
                    )}
                  </div>
                </div>
                <Switch
                  checked={preferences.smsNotifications}
                  onCheckedChange={(checked) => updatePreference('smsNotifications', checked)}
                />
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <Shield className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  We respect your privacy. Your contact information is never shared and you can change these settings at any time.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Types Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Types</CardTitle>
              <CardDescription>
                Select which types of updates you want to receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Appointments Section */}
              <div>
                <h3 className="font-medium text-lg flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  Appointments
                </h3>
                <div className="space-y-4 pl-7">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="appt-reminders" className="font-medium">Appointment Reminders</Label>
                      <p className="text-sm text-gray-500">
                        Receive reminders before your scheduled appointments
                      </p>
                    </div>
                    <Switch
                      id="appt-reminders"
                      checked={preferences.notifyAppointmentReminders}
                      onCheckedChange={(checked) => updatePreference('notifyAppointmentReminders', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="appt-changes" className="font-medium">Appointment Changes</Label>
                      <p className="text-sm text-gray-500">
                        Get notified when appointments are scheduled, rescheduled, or cancelled
                      </p>
                    </div>
                    <Switch
                      id="appt-changes"
                      checked={preferences.notifyAppointmentChanges}
                      onCheckedChange={(checked) => updatePreference('notifyAppointmentChanges', checked)}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Messages Section */}
              <div>
                <h3 className="font-medium text-lg flex items-center gap-2 mb-4">
                  <MessageSquare className="h-5 w-5 text-green-600" />
                  Messages
                </h3>
                <div className="space-y-4 pl-7">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="new-messages" className="font-medium">New Messages</Label>
                      <p className="text-sm text-gray-500">
                        Get notified when you receive a new secure message
                      </p>
                    </div>
                    <Switch
                      id="new-messages"
                      checked={preferences.notifyNewMessages}
                      onCheckedChange={(checked) => updatePreference('notifyNewMessages', checked)}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Documents Section */}
              <div>
                <h3 className="font-medium text-lg flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-orange-600" />
                  Documents & Forms
                </h3>
                <div className="space-y-4 pl-7">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="new-docs" className="font-medium">New Documents</Label>
                      <p className="text-sm text-gray-500">
                        Get notified when new documents are available in your portal
                      </p>
                    </div>
                    <Switch
                      id="new-docs"
                      checked={preferences.notifyNewDocuments}
                      onCheckedChange={(checked) => updatePreference('notifyNewDocuments', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="form-requests" className="font-medium">Form Requests</Label>
                      <p className="text-sm text-gray-500">
                        Get notified when you need to complete forms online
                      </p>
                    </div>
                    <Switch
                      id="form-requests"
                      checked={preferences.notifyFormRequests}
                      onCheckedChange={(checked) => updatePreference('notifyFormRequests', checked)}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Billing Section */}
              <div>
                <h3 className="font-medium text-lg flex items-center gap-2 mb-4">
                  <CreditCard className="h-5 w-5 text-purple-600" />
                  Billing
                </h3>
                <div className="space-y-4 pl-7">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="billing-statements" className="font-medium">Billing Statements</Label>
                      <p className="text-sm text-gray-500">
                        Get notified when new statements are available
                      </p>
                    </div>
                    <Switch
                      id="billing-statements"
                      checked={preferences.notifyBillingStatements}
                      onCheckedChange={(checked) => updatePreference('notifyBillingStatements', checked)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reminder Timing Tab */}
        <TabsContent value="reminders">
          <Card>
            <CardHeader>
              <CardTitle>Appointment Reminder Timing</CardTitle>
              <CardDescription>
                Choose when you want to receive appointment reminders
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert className="bg-blue-50 border-blue-200">
                <Clock className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  You can set up to 3 reminders before your appointment. Leave empty if you don&apos;t want additional reminders.
                </AlertDescription>
              </Alert>

              {/* First Reminder (Required) */}
              <div className="space-y-2">
                <Label className="font-medium">First Reminder *</Label>
                <Select
                  value={String(preferences.reminderTiming1)}
                  onValueChange={(value) => updatePreference('reminderTiming1', Number(value))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select timing" />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_TIMING_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500">Your primary appointment reminder</p>
              </div>

              {/* Second Reminder (Optional) */}
              <div className="space-y-2">
                <Label className="font-medium">Second Reminder (Optional)</Label>
                <Select
                  value={preferences.reminderTiming2 ? String(preferences.reminderTiming2) : 'none'}
                  onValueChange={(value) =>
                    updatePreference('reminderTiming2', value === 'none' ? null : Number(value))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select timing or none" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No second reminder</SelectItem>
                    {REMINDER_TIMING_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500">An additional reminder if you want one</p>
              </div>

              {/* Third Reminder (Optional) */}
              <div className="space-y-2">
                <Label className="font-medium">Third Reminder (Optional)</Label>
                <Select
                  value={preferences.reminderTiming3 ? String(preferences.reminderTiming3) : 'none'}
                  onValueChange={(value) =>
                    updatePreference('reminderTiming3', value === 'none' ? null : Number(value))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select timing or none" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No third reminder</SelectItem>
                    {REMINDER_TIMING_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500">A third reminder for extra assurance</p>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Reminder Preview</h4>
                <p className="text-sm text-gray-600">
                  For an appointment at <strong>10:00 AM on Monday</strong>, you will receive reminders:
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    {REMINDER_TIMING_OPTIONS.find(o => o.value === preferences.reminderTiming1)?.label || '24 hours before'}
                  </li>
                  {preferences.reminderTiming2 && (
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {REMINDER_TIMING_OPTIONS.find(o => o.value === preferences.reminderTiming2)?.label}
                    </li>
                  )}
                  {preferences.reminderTiming3 && (
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {REMINDER_TIMING_OPTIONS.find(o => o.value === preferences.reminderTiming3)?.label}
                    </li>
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Marketing Tab */}
        <TabsContent value="marketing">
          <Card>
            <CardHeader>
              <CardTitle>Marketing Communications</CardTitle>
              <CardDescription>
                Control promotional and marketing messages from our practice
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert className="bg-amber-50 border-amber-200">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  Marketing communications are separate from healthcare-related notifications.
                  Opting out of marketing will not affect your appointment reminders, billing notices, or medical messages.
                </AlertDescription>
              </Alert>

              {/* Marketing Email */}
              <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Mail className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Email Marketing</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Receive newsletters, health tips, special promotions, and practice updates
                    </p>
                  </div>
                </div>
                <Switch
                  checked={preferences.marketingEmailOptIn}
                  onCheckedChange={(checked) => updatePreference('marketingEmailOptIn', checked)}
                />
              </div>

              {/* Marketing SMS */}
              <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <MessageSquare className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Text Message Marketing</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Receive promotional text messages and special offers
                    </p>
                  </div>
                </div>
                <Switch
                  checked={preferences.marketingSmsOptIn}
                  onCheckedChange={(checked) => updatePreference('marketingSmsOptIn', checked)}
                />
              </div>

              {/* Marketing Phone */}
              <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Smartphone className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Phone Calls</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Receive promotional phone calls about services and events
                    </p>
                  </div>
                </div>
                <Switch
                  checked={preferences.marketingCallOptIn}
                  onCheckedChange={(checked) => updatePreference('marketingCallOptIn', checked)}
                />
              </div>

              <Separator />

              {/* Current Status Summary */}
              <div className="bg-gray-100 rounded-lg p-4">
                <h4 className="font-medium mb-3">Your Marketing Preferences Summary</h4>
                <div className="flex flex-wrap gap-2">
                  {preferences.marketingEmailOptIn ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                      <Mail className="h-3 w-3 mr-1" />
                      Email: Subscribed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-300">
                      <Mail className="h-3 w-3 mr-1" />
                      Email: Unsubscribed
                    </Badge>
                  )}
                  {preferences.marketingSmsOptIn ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      SMS: Subscribed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-300">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      SMS: Unsubscribed
                    </Badge>
                  )}
                  {preferences.marketingCallOptIn ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                      <Smartphone className="h-3 w-3 mr-1" />
                      Calls: Allowed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-300">
                      <Smartphone className="h-3 w-3 mr-1" />
                      Calls: Not Allowed
                    </Badge>
                  )}
                </div>
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <Shield className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  You can update your marketing preferences at any time. We will honor your choices
                  and update our systems within 24-48 hours of saving your changes.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sticky Save Button for Mobile */}
      {hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg sm:hidden">
          <Button
            onClick={handleSave}
            disabled={updatePreferencesMutation.isPending}
            className="w-full"
          >
            {updatePreferencesMutation.isPending ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      )}
    </div>
  );
}
