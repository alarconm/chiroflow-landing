'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Plus,
  Edit,
  Trash2,
  Clock,
  Calendar,
  Mail,
  MessageSquare,
  Bell,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

type CommunicationChannel = 'SMS' | 'EMAIL';
type TimeUnit = 'HOURS' | 'DAYS' | 'WEEKS';
type CommunicationType = 'APPOINTMENT_REMINDER' | 'APPOINTMENT_CONFIRMATION' | 'RECALL_REMINDER';

interface ReminderRule {
  id: string;
  name: string;
  type: CommunicationType;
  channel: CommunicationChannel;
  timeBefore: number;
  timeUnit: TimeUnit;
  isActive: boolean;
  templateId?: string;
}

// Mock data for now - in production this would come from tRPC
const mockRules: ReminderRule[] = [
  {
    id: '1',
    name: '24 Hour SMS Reminder',
    type: 'APPOINTMENT_REMINDER',
    channel: 'SMS',
    timeBefore: 24,
    timeUnit: 'HOURS',
    isActive: true,
  },
  {
    id: '2',
    name: '1 Week Email Reminder',
    type: 'APPOINTMENT_REMINDER',
    channel: 'EMAIL',
    timeBefore: 1,
    timeUnit: 'WEEKS',
    isActive: true,
  },
  {
    id: '3',
    name: '2 Hour SMS Reminder',
    type: 'APPOINTMENT_REMINDER',
    channel: 'SMS',
    timeBefore: 2,
    timeUnit: 'HOURS',
    isActive: false,
  },
];

const typeLabels: Record<CommunicationType, string> = {
  APPOINTMENT_REMINDER: 'Appointment Reminder',
  APPOINTMENT_CONFIRMATION: 'Appointment Confirmation',
  RECALL_REMINDER: 'Recall Reminder',
};

const timeUnitLabels: Record<TimeUnit, string> = {
  HOURS: 'hours',
  DAYS: 'days',
  WEEKS: 'weeks',
};

const channelIcons: Record<CommunicationChannel, React.ReactNode> = {
  SMS: <MessageSquare className="h-4 w-4" />,
  EMAIL: <Mail className="h-4 w-4" />,
};

export function ReminderRuleManager() {
  const [rules, setRules] = useState<ReminderRule[]>(mockRules);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ReminderRule | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<CommunicationType>('APPOINTMENT_REMINDER');
  const [channel, setChannel] = useState<CommunicationChannel>('SMS');
  const [timeBefore, setTimeBefore] = useState(24);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('HOURS');
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => {
    setName('');
    setType('APPOINTMENT_REMINDER');
    setChannel('SMS');
    setTimeBefore(24);
    setTimeUnit('HOURS');
    setIsActive(true);
  };

  const openEditDialog = (rule: ReminderRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setType(rule.type);
    setChannel(rule.channel);
    setTimeBefore(rule.timeBefore);
    setTimeUnit(rule.timeUnit);
    setIsActive(rule.isActive);
  };

  const handleCreate = () => {
    const newRule: ReminderRule = {
      id: Date.now().toString(),
      name,
      type,
      channel,
      timeBefore,
      timeUnit,
      isActive,
    };
    setRules((prev) => [...prev, newRule]);
    setIsCreateOpen(false);
    resetForm();
    toast.success('Reminder rule created');
  };

  const handleUpdate = () => {
    if (!editingRule) return;
    setRules((prev) =>
      prev.map((r) =>
        r.id === editingRule.id
          ? { ...r, name, type, channel, timeBefore, timeUnit, isActive }
          : r
      )
    );
    setEditingRule(null);
    resetForm();
    toast.success('Reminder rule updated');
  };

  const handleDelete = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast.success('Reminder rule deleted');
  };

  const handleToggleActive = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
  };

  const RuleForm = () => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Rule Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., 24 Hour SMS Reminder"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="type">Reminder Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as CommunicationType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(typeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="channel">Channel</Label>
        <Select value={channel} onValueChange={(v) => setChannel(v as CommunicationChannel)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SMS">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                SMS
              </div>
            </SelectItem>
            <SelectItem value="EMAIL">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="timeBefore">Time Before</Label>
          <Input
            id="timeBefore"
            type="number"
            min={1}
            value={timeBefore}
            onChange={(e) => setTimeBefore(parseInt(e.target.value) || 1)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="timeUnit">Unit</Label>
          <Select value={timeUnit} onValueChange={(v) => setTimeUnit(v as TimeUnit)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HOURS">Hours</SelectItem>
              <SelectItem value="DAYS">Days</SelectItem>
              <SelectItem value="WEEKS">Weeks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
        <Label htmlFor="active">Rule is active</Label>
      </div>
    </div>
  );

  const formatTimeBefore = (rule: ReminderRule) => {
    const unit = timeUnitLabels[rule.timeUnit];
    return `${rule.timeBefore} ${rule.timeBefore === 1 ? unit.slice(0, -1) : unit}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Reminder Rules</h3>
          <p className="text-sm text-muted-foreground">
            Configure automated appointment reminder schedules
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Reminder Rule</DialogTitle>
              <DialogDescription>
                Set up automated reminder timing
              </DialogDescription>
            </DialogHeader>
            <RuleForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim()}>
                Create Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No reminder rules</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first reminder rule to automate patient notifications
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rules.map((rule) => (
            <Card key={rule.id} className={!rule.isActive ? 'opacity-60' : ''}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      {channelIcons[rule.channel]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{rule.name}</h4>
                        <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                          {rule.isActive ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <AlertCircle className="h-3 w-3 mr-1" />
                          )}
                          {rule.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Clock className="h-4 w-4" />
                        <span>{formatTimeBefore(rule)} before appointment</span>
                        <span className="mx-1">|</span>
                        <span>{typeLabels[rule.type]}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => handleToggleActive(rule.id)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(rule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(rule.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingRule} onOpenChange={(open) => !open && setEditingRule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Reminder Rule</DialogTitle>
            <DialogDescription>Update the reminder rule settings</DialogDescription>
          </DialogHeader>
          <RuleForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRule(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={!name.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">How reminder rules work</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Rules are evaluated automatically when appointments are created</li>
                <li>Reminders are sent based on the configured time before the appointment</li>
                <li>Patients who have opted out of reminders will not receive messages</li>
                <li>Multiple rules can be active for the same appointment type</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
