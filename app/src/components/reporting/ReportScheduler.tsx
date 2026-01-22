'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock,
  Plus,
  Trash2,
  Mail,
  Calendar,
  Play,
  Pause,
  Edit,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

const FREQUENCIES = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const EXPORT_FORMATS = [
  { value: 'PDF', label: 'PDF' },
  { value: 'CSV', label: 'CSV' },
  { value: 'EXCEL', label: 'Excel' },
];

interface ScheduleFormData {
  name: string;
  savedReportId: string;
  frequency: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
  timezone: string;
  exportFormat: string;
  recipients: string;
  subject: string;
  message: string;
}

const initialFormData: ScheduleFormData = {
  name: '',
  savedReportId: '',
  frequency: 'WEEKLY',
  dayOfWeek: 1,
  timeOfDay: '08:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  exportFormat: 'PDF',
  recipients: '',
  subject: '',
  message: '',
};

export function ReportScheduler() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ScheduleFormData>(initialFormData);

  const utils = trpc.useUtils();

  const { data: schedules, isLoading: schedulesLoading } =
    trpc.reporting.listSchedules.useQuery({});

  const { data: savedReports } = trpc.reporting.listSavedReports.useQuery({});

  const createSchedule = trpc.reporting.scheduleReport.useMutation({
    onSuccess: () => {
      toast.success('Schedule created successfully');
      utils.reporting.listSchedules.invalidate();
      closeDialog();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateSchedule = trpc.reporting.updateSchedule.useMutation({
    onSuccess: () => {
      toast.success('Schedule updated successfully');
      utils.reporting.listSchedules.invalidate();
      closeDialog();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const toggleSchedule = trpc.reporting.toggleScheduleActive.useMutation({
    onSuccess: () => {
      utils.reporting.listSchedules.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteSchedule = trpc.reporting.cancelSchedule.useMutation({
    onSuccess: () => {
      toast.success('Schedule deleted');
      utils.reporting.listSchedules.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setFormData(initialFormData);
  };

  const handleEdit = (schedule: any) => {
    setEditingId(schedule.id);
    setFormData({
      name: schedule.name,
      savedReportId: schedule.savedReportId,
      frequency: schedule.frequency,
      dayOfWeek: schedule.dayOfWeek,
      dayOfMonth: schedule.dayOfMonth,
      timeOfDay: schedule.timeOfDay,
      timezone: schedule.timezone,
      exportFormat: schedule.exportFormat,
      recipients: schedule.recipients.join(', '),
      subject: schedule.subject || '',
      message: schedule.message || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const recipients = formData.recipients
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e);

    if (recipients.length === 0) {
      toast.error('Please enter at least one recipient email');
      return;
    }

    const scheduleData = {
      name: formData.name,
      savedReportId: formData.savedReportId,
      frequency: formData.frequency as any,
      dayOfWeek: formData.frequency === 'WEEKLY' ? formData.dayOfWeek : undefined,
      dayOfMonth:
        formData.frequency === 'MONTHLY' || formData.frequency === 'QUARTERLY'
          ? formData.dayOfMonth
          : undefined,
      timeOfDay: formData.timeOfDay,
      timezone: formData.timezone,
      exportFormat: formData.exportFormat as any,
      recipients,
      subject: formData.subject || undefined,
      message: formData.message || undefined,
    };

    if (editingId) {
      updateSchedule.mutate({ id: editingId, ...scheduleData });
    } else {
      createSchedule.mutate(scheduleData);
    }
  };

  const getFrequencyLabel = (frequency: string, dayOfWeek?: number, dayOfMonth?: number) => {
    switch (frequency) {
      case 'DAILY':
        return 'Daily';
      case 'WEEKLY':
        return `Weekly on ${DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label || 'Monday'}`;
      case 'MONTHLY':
        return `Monthly on day ${dayOfMonth || 1}`;
      case 'QUARTERLY':
        return `Quarterly on day ${dayOfMonth || 1}`;
      default:
        return frequency;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Report Scheduler
            </CardTitle>
            <CardDescription>
              Schedule automatic report generation and email delivery
            </CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Schedule
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {schedulesLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : schedules && schedules.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Report</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">{schedule.name}</TableCell>
                  <TableCell>{schedule.savedReport?.name || '-'}</TableCell>
                  <TableCell>
                    {getFrequencyLabel(
                      schedule.frequency,
                      schedule.dayOfWeek ?? undefined,
                      schedule.dayOfMonth ?? undefined
                    )}
                    <br />
                    <span className="text-xs text-muted-foreground">
                      at {schedule.timeOfDay}
                    </span>
                  </TableCell>
                  <TableCell>
                    {schedule.nextRunAt
                      ? new Date(schedule.nextRunAt).toLocaleString()
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      <span className="text-sm">{schedule.recipients.length}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={schedule.isActive}
                        onCheckedChange={(checked) =>
                          toggleSchedule.mutate({
                            id: schedule.id,
                            isActive: checked,
                          })
                        }
                      />
                      <Badge variant={schedule.isActive ? 'default' : 'secondary'}>
                        {schedule.isActive ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(schedule)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteSchedule.mutate({ id: schedule.id })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No scheduled reports</p>
            <p className="text-sm">Create a schedule to automatically generate and send reports</p>
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Schedule' : 'Create Report Schedule'}
            </DialogTitle>
            <DialogDescription>
              Configure when and how to deliver the report
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <Label>Schedule Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Weekly Revenue Report"
              />
            </div>

            <div className="grid gap-2">
              <Label>Saved Report</Label>
              <Select
                value={formData.savedReportId}
                onValueChange={(v) => setFormData({ ...formData, savedReportId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a saved report" />
                </SelectTrigger>
                <SelectContent>
                  {savedReports?.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Frequency</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(v) => setFormData({ ...formData, frequency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.frequency === 'WEEKLY' && (
                <div className="grid gap-2">
                  <Label>Day of Week</Label>
                  <Select
                    value={String(formData.dayOfWeek)}
                    onValueChange={(v) => setFormData({ ...formData, dayOfWeek: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(formData.frequency === 'MONTHLY' || formData.frequency === 'QUARTERLY') && (
                <div className="grid gap-2">
                  <Label>Day of Month</Label>
                  <Select
                    value={String(formData.dayOfMonth || 1)}
                    onValueChange={(v) => setFormData({ ...formData, dayOfMonth: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={formData.timeOfDay}
                  onChange={(e) => setFormData({ ...formData, timeOfDay: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Format</Label>
                <Select
                  value={formData.exportFormat}
                  onValueChange={(v) => setFormData({ ...formData, exportFormat: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPORT_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Recipients (comma-separated emails)</Label>
              <Input
                value={formData.recipients}
                onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
                placeholder="admin@clinic.com, manager@clinic.com"
              />
            </div>

            <div className="grid gap-2">
              <Label>Email Subject (optional)</Label>
              <Input
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Your Scheduled Report"
              />
            </div>

            <div className="grid gap-2">
              <Label>Email Message (optional)</Label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Please find attached your scheduled report..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createSchedule.isPending || updateSchedule.isPending}
            >
              {createSchedule.isPending || updateSchedule.isPending
                ? 'Saving...'
                : editingId
                ? 'Update Schedule'
                : 'Create Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
