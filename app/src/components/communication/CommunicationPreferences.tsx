'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import {
  Mail,
  MessageSquare,
  Phone,
  Bell,
  BellOff,
  Save,
  Loader2,
} from 'lucide-react';

// Full enum from Prisma
type CommunicationChannel = 'SMS' | 'EMAIL' | 'VOICE' | 'PORTAL' | 'IN_APP';

interface PreferenceState {
  preferredChannel: CommunicationChannel;
  allowSms: boolean;
  allowEmail: boolean;
  allowVoice: boolean;
  allowPortal: boolean;
  optOutMarketing: boolean;
  optOutReminders: boolean;
}

interface CommunicationPreferencesProps {
  patientId: string;
  onSave?: () => void;
}

const defaultPreferences: PreferenceState = {
  preferredChannel: 'SMS',
  allowSms: true,
  allowEmail: true,
  allowVoice: false,
  allowPortal: true,
  optOutMarketing: false,
  optOutReminders: false,
};

export function CommunicationPreferences({ patientId, onSave }: CommunicationPreferencesProps) {
  const [preferences, setPreferences] = useState<PreferenceState>(defaultPreferences);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: savedPreferences, isLoading } = trpc.communication.getPreferences.useQuery({
    patientId,
  });

  const updateMutation = trpc.communication.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success('Preferences saved successfully');
      setHasChanges(false);
      onSave?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (savedPreferences) {
      setPreferences({
        preferredChannel: savedPreferences.preferredChannel,
        allowSms: savedPreferences.allowSms,
        allowEmail: savedPreferences.allowEmail,
        allowVoice: savedPreferences.allowVoice,
        allowPortal: savedPreferences.allowPortal,
        optOutMarketing: savedPreferences.optOutMarketing,
        optOutReminders: savedPreferences.optOutReminders,
      });
    }
  }, [savedPreferences]);

  const updatePreference = <K extends keyof PreferenceState>(
    key: K,
    value: PreferenceState[K]
  ) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      patientId,
      ...preferences,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Communication Preferences
        </CardTitle>
        <CardDescription>
          Manage how and when you receive communications from the practice
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preferred Channel */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Preferred Communication Channel</Label>
          <RadioGroup
            value={preferences.preferredChannel}
            onValueChange={(v) => updatePreference('preferredChannel', v as CommunicationChannel)}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="SMS" id="sms" />
              <Label htmlFor="sms" className="flex items-center gap-2 cursor-pointer">
                <MessageSquare className="h-4 w-4" />
                SMS Text Message
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="EMAIL" id="email" />
              <Label htmlFor="email" className="flex items-center gap-2 cursor-pointer">
                <Mail className="h-4 w-4" />
                Email
              </Label>
            </div>
          </RadioGroup>
        </div>

        <Separator />

        {/* Channel Toggles */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Enabled Channels</Label>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="sms-enabled">SMS Text Messages</Label>
                  <p className="text-xs text-muted-foreground">
                    Receive notifications via text message
                  </p>
                </div>
              </div>
              <Switch
                id="sms-enabled"
                checked={preferences.allowSms}
                onCheckedChange={(v) => updatePreference('allowSms', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="email-enabled">Email</Label>
                  <p className="text-xs text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
              </div>
              <Switch
                id="email-enabled"
                checked={preferences.allowEmail}
                onCheckedChange={(v) => updatePreference('allowEmail', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="voice-enabled">Voice Calls</Label>
                  <p className="text-xs text-muted-foreground">
                    Receive automated voice call reminders
                  </p>
                </div>
              </div>
              <Switch
                id="voice-enabled"
                checked={preferences.allowVoice}
                onCheckedChange={(v) => updatePreference('allowVoice', v)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Opt-outs */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Notification Opt-outs</Label>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellOff className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="opt-out-reminders">Opt out of appointment reminders</Label>
                  <p className="text-xs text-muted-foreground">
                    Stop receiving appointment reminder notifications
                  </p>
                </div>
              </div>
              <Switch
                id="opt-out-reminders"
                checked={preferences.optOutReminders}
                onCheckedChange={(v) => updatePreference('optOutReminders', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellOff className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="opt-out-marketing">Opt out of marketing messages</Label>
                  <p className="text-xs text-muted-foreground">
                    Stop receiving promotions, news, and special offers
                  </p>
                </div>
              </div>
              <Switch
                id="opt-out-marketing"
                checked={preferences.optOutMarketing}
                onCheckedChange={(v) => updatePreference('optOutMarketing', v)}
              />
            </div>
          </div>
        </div>

        {/* Opt-out all */}
        <Separator />
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label>Opt out of all communications</Label>
              <p className="text-xs text-muted-foreground">
                This will disable all non-essential communications
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPreferences({
                ...preferences,
                allowSms: false,
                allowEmail: false,
                allowVoice: false,
                optOutReminders: true,
                optOutMarketing: true,
              });
              setHasChanges(true);
            }}
          >
            Opt Out
          </Button>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Preferences
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
