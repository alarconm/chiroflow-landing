'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import {
  Plus,
  Edit,
  Trash2,
  Mail,
  MessageSquare,
  Phone,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle,
  Eye,
} from 'lucide-react';

type CommunicationChannel = 'SMS' | 'EMAIL' | 'VOICE' | 'PORTAL' | 'IN_APP';
type CommunicationType =
  | 'APPOINTMENT_REMINDER'
  | 'APPOINTMENT_CONFIRMATION'
  | 'APPOINTMENT_CANCELLATION'
  | 'APPOINTMENT_RESCHEDULE'
  | 'FORM_REQUEST'
  | 'PAYMENT_REMINDER'
  | 'BIRTHDAY'
  | 'RECALL'
  | 'MARKETING'
  | 'GENERAL'
  | 'CUSTOM';

interface MessageTemplate {
  id: string;
  name: string;
  type: CommunicationType;
  channel: CommunicationChannel;
  subject?: string | null;
  body: string;
  isActive: boolean;
  createdAt: Date;
}

const channelIcons: Record<CommunicationChannel, React.ReactNode> = {
  SMS: <MessageSquare className="h-4 w-4" />,
  EMAIL: <Mail className="h-4 w-4" />,
  VOICE: <Phone className="h-4 w-4" />,
  PORTAL: <FileText className="h-4 w-4" />,
  IN_APP: <AlertCircle className="h-4 w-4" />,
};

const typeLabels: Record<CommunicationType, string> = {
  APPOINTMENT_REMINDER: 'Appointment Reminder',
  APPOINTMENT_CONFIRMATION: 'Appointment Confirmation',
  APPOINTMENT_CANCELLATION: 'Appointment Cancellation',
  APPOINTMENT_RESCHEDULE: 'Appointment Reschedule',
  FORM_REQUEST: 'Form Request',
  PAYMENT_REMINDER: 'Payment Reminder',
  BIRTHDAY: 'Birthday',
  RECALL: 'Recall',
  MARKETING: 'Marketing',
  GENERAL: 'General',
  CUSTOM: 'Custom',
};

const templateVariables = [
  { variable: '{{patient.firstName}}', description: 'Patient first name' },
  { variable: '{{patient.lastName}}', description: 'Patient last name' },
  { variable: '{{patient.fullName}}', description: 'Patient full name' },
  { variable: '{{appointment.date}}', description: 'Appointment date' },
  { variable: '{{appointment.time}}', description: 'Appointment time' },
  { variable: '{{appointment.type}}', description: 'Appointment type' },
  { variable: '{{appointment.provider}}', description: 'Provider name' },
  { variable: '{{practice.name}}', description: 'Practice name' },
  { variable: '{{practice.phone}}', description: 'Practice phone' },
  { variable: '{{practice.address}}', description: 'Practice address' },
];

export function MessageTemplateManager() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<CommunicationType>('APPOINTMENT_REMINDER');
  const [channel, setChannel] = useState<CommunicationChannel>('SMS');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isActive, setIsActive] = useState(true);

  const utils = trpc.useUtils();

  const { data: templates, isLoading } = trpc.communication.listTemplates.useQuery({});

  const createMutation = trpc.communication.createTemplate.useMutation({
    onSuccess: () => {
      toast.success('Template created successfully');
      setIsCreateOpen(false);
      resetForm();
      utils.communication.listTemplates.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.communication.updateTemplate.useMutation({
    onSuccess: () => {
      toast.success('Template updated successfully');
      setEditingTemplate(null);
      resetForm();
      utils.communication.listTemplates.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setName('');
    setType('APPOINTMENT_REMINDER');
    setChannel('SMS');
    setSubject('');
    setBody('');
    setIsActive(true);
  };

  const openEditDialog = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setType(template.type);
    setChannel(template.channel);
    setSubject(template.subject || '');
    setBody(template.body);
    setIsActive(template.isActive);
  };

  const handleCreate = () => {
    createMutation.mutate({
      name,
      type,
      channel,
      subject: channel === 'EMAIL' ? subject : undefined,
      body,
    });
  };

  const handleUpdate = () => {
    if (!editingTemplate) return;
    updateMutation.mutate({
      id: editingTemplate.id,
      name,
      subject: channel === 'EMAIL' ? subject : undefined,
      body,
      isActive,
    });
  };

  const insertVariable = (variable: string, targetField: 'subject' | 'body') => {
    if (targetField === 'subject') {
      setSubject((prev) => prev + variable);
    } else {
      setBody((prev) => prev + variable);
    }
  };

  const renderPreview = (template: MessageTemplate) => {
    const sampleData = {
      'patient.firstName': 'John',
      'patient.lastName': 'Smith',
      'patient.fullName': 'John Smith',
      'appointment.date': 'Monday, January 20, 2026',
      'appointment.time': '2:30 PM',
      'appointment.type': 'Follow-up Visit',
      'appointment.provider': 'Dr. Johnson',
      'practice.name': 'ChiroFlow Practice',
      'practice.phone': '(555) 123-4567',
      'practice.address': '123 Main St, Suite 100',
    };

    let previewText = template.body;
    for (const [key, value] of Object.entries(sampleData)) {
      previewText = previewText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    return previewText;
  };

  const TemplateForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Template Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., 24-Hour Reminder"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="type">Type</Label>
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
              <SelectItem value="SMS">SMS</SelectItem>
              <SelectItem value="EMAIL">Email</SelectItem>
              <SelectItem value="VOICE">Voice</SelectItem>
              <SelectItem value="PORTAL">Portal</SelectItem>
              <SelectItem value="IN_APP">In-App</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {channel === 'EMAIL' && (
        <div className="grid gap-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., Appointment Reminder - {{appointment.date}}"
          />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="body">Message Body</Label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Enter your message template..."
          rows={5}
        />
      </div>

      <div className="border rounded-lg p-3 bg-muted/50">
        <Label className="text-sm font-medium">Available Variables</Label>
        <div className="flex flex-wrap gap-1 mt-2">
          {templateVariables.map((v) => (
            <Button
              key={v.variable}
              variant="outline"
              size="sm"
              className="text-xs h-6"
              onClick={() => insertVariable(v.variable, 'body')}
              title={v.description}
            >
              {v.variable}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
        <Label htmlFor="active">Template is active</Label>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">Loading templates...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Message Templates</h3>
          <p className="text-sm text-muted-foreground">
            Create and manage reusable message templates for patient communication
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Message Template</DialogTitle>
              <DialogDescription>
                Create a new template for patient communications
              </DialogDescription>
            </DialogHeader>
            <TemplateForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {templates?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No templates yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first message template to get started
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates?.map((template: MessageTemplate) => (
            <Card key={template.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <Badge variant={template.isActive ? 'default' : 'secondary'}>
                      {template.isActive ? (
                        <CheckCircle className="h-3 w-3 mr-1" />
                      ) : (
                        <AlertCircle className="h-3 w-3 mr-1" />
                      )}
                      {template.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreviewTemplate(template)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(template)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="flex items-center gap-2">
                  {channelIcons[template.channel]}
                  <span>{template.channel}</span>
                  <span className="mx-1">|</span>
                  <Calendar className="h-4 w-4" />
                  <span>{typeLabels[template.type]}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">{template.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>Update the message template</DialogDescription>
          </DialogHeader>
          <TemplateForm isEdit />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>
              Preview with sample data
            </DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {channelIcons[previewTemplate.channel]}
                <Badge variant="outline">{previewTemplate.channel}</Badge>
              </div>
              {previewTemplate.subject && (
                <div>
                  <Label className="text-sm text-muted-foreground">Subject</Label>
                  <p className="font-medium">{previewTemplate.subject}</p>
                </div>
              )}
              <div>
                <Label className="text-sm text-muted-foreground">Message</Label>
                <div className="p-4 bg-muted rounded-lg mt-1 whitespace-pre-wrap">
                  {renderPreview(previewTemplate)}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
