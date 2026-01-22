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
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import {
  Send,
  Mail,
  MessageSquare,
  Search,
  User,
  Phone,
  Clock,
  FileText,
  AlertCircle,
} from 'lucide-react';

type CommunicationChannel = 'SMS' | 'EMAIL';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
}

interface MessageTemplate {
  id: string;
  name: string;
  channel: string;
  subject?: string | null;
  body: string;
}

interface MessageComposerProps {
  patient?: Patient;
  onClose?: () => void;
  isOpen?: boolean;
}

export function MessageComposer({ patient: initialPatient, onClose, isOpen }: MessageComposerProps) {
  const [channel, setChannel] = useState<CommunicationChannel>('SMS');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initialPatient || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  const { data: patientsData } = trpc.patient.list.useQuery(
    { search: searchQuery, limit: 10 },
    { enabled: searchQuery.length > 2 }
  );
  const patients = patientsData?.patients;

  const { data: templates } = trpc.communication.listTemplates.useQuery({
    channel,
  });

  const sendMutation = trpc.communication.sendMessage.useMutation({
    onSuccess: () => {
      toast.success('Message sent successfully');
      resetForm();
      onClose?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setBody('');
    setSubject('');
    setSelectedTemplateId('');
    if (!initialPatient) {
      setSelectedPatient(null);
      setSearchQuery('');
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates?.find((t: { id: string }) => t.id === templateId);
    if (template) {
      setBody(template.body);
      if (template.subject) {
        setSubject(template.subject);
      }
    }
  };

  const handleSend = async () => {
    if (!selectedPatient) {
      toast.error('Please select a patient');
      return;
    }

    if (!body.trim()) {
      toast.error('Please enter a message');
      return;
    }

    if (channel === 'SMS' && !selectedPatient.phone) {
      toast.error('Patient does not have a phone number');
      return;
    }

    if (channel === 'EMAIL' && !selectedPatient.email) {
      toast.error('Patient does not have an email address');
      return;
    }

    setIsSending(true);
    try {
      await sendMutation.mutateAsync({
        patientId: selectedPatient.id,
        channel,
        subject: channel === 'EMAIL' ? subject : undefined,
        body,
        templateId: selectedTemplateId || undefined,
      });
    } finally {
      setIsSending(false);
    }
  };

  const getRecipientInfo = () => {
    if (!selectedPatient) return null;
    if (channel === 'SMS') return selectedPatient.phone;
    if (channel === 'EMAIL') return selectedPatient.email;
    return null;
  };

  const hasValidRecipient = () => {
    if (!selectedPatient) return false;
    if (channel === 'SMS') return !!selectedPatient.phone;
    if (channel === 'EMAIL') return !!selectedPatient.email;
    return false;
  };

  const content = (
    <div className="space-y-4">
      {/* Channel Selection */}
      <Tabs value={channel} onValueChange={(v) => setChannel(v as CommunicationChannel)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="SMS" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS
          </TabsTrigger>
          <TabsTrigger value="EMAIL" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Patient Selection */}
      {!initialPatient && (
        <div className="space-y-2">
          <Label>Recipient</Label>
          {selectedPatient ? (
            <Card>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {selectedPatient.firstName} {selectedPatient.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {channel === 'SMS' ? selectedPatient.phone : selectedPatient.email}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(null)}>
                  Change
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {patients && patients.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-10 max-h-48 overflow-auto">
                  {patients.map((p) => (
                    <button
                      key={p.id}
                      className="w-full px-4 py-2 text-left hover:bg-muted flex items-center gap-3"
                      onClick={() => {
                        setSelectedPatient(p);
                        setSearchQuery('');
                      }}
                    >
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {p.firstName} {p.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {p.phone || p.email || 'No contact info'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recipient Validation */}
      {selectedPatient && !hasValidRecipient() && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">
            Patient does not have a valid {channel === 'SMS' ? 'phone number' : 'email address'}
          </span>
        </div>
      )}

      {/* Template Selection */}
      {templates && templates.length > 0 && (
        <div className="space-y-2">
          <Label>Template (Optional)</Label>
          <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No template</SelectItem>
              {templates.map((t: { id: string; name: string }) => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {t.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Email Subject */}
      {channel === 'EMAIL' && (
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter email subject..."
          />
        </div>
      )}

      {/* Message Body */}
      <div className="space-y-2">
        <Label htmlFor="body">Message</Label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Enter your message..."
          rows={6}
        />
        {channel === 'SMS' && (
          <p className="text-xs text-muted-foreground">
            {body.length} characters | {Math.ceil(body.length / 160)} SMS segment
            {Math.ceil(body.length / 160) !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Send Button */}
      <div className="flex justify-end gap-2 pt-2">
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSend}
          disabled={!selectedPatient || !body.trim() || !hasValidRecipient() || isSending}
        >
          {isSending ? (
            <>
              <Clock className="h-4 w-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send {channel}
            </>
          )}
        </Button>
      </div>
    </div>
  );

  // If used as a dialog
  if (typeof isOpen !== 'undefined') {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Compose Message</DialogTitle>
            <DialogDescription>
              Send a message to {initialPatient ? `${initialPatient.firstName} ${initialPatient.lastName}` : 'a patient'}
            </DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  // If used inline
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Compose Message
        </CardTitle>
        <CardDescription>Send a message to a patient</CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
