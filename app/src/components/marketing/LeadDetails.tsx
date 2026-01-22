'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/trpc/client';
import {
  Phone,
  Mail,
  Calendar,
  Target,
  Clock,
  MessageSquare,
  User,
  ArrowLeft,
  Edit,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import Link from 'next/link';

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'NURTURING' | 'SCHEDULED' | 'CONVERTED' | 'LOST' | 'UNRESPONSIVE';

const statusConfig: Record<
  LeadStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  NEW: { label: 'New', variant: 'default' },
  CONTACTED: { label: 'Contacted', variant: 'outline' },
  QUALIFIED: { label: 'Qualified', variant: 'default' },
  NURTURING: { label: 'Nurturing', variant: 'secondary' },
  SCHEDULED: { label: 'Scheduled', variant: 'default' },
  CONVERTED: { label: 'Converted', variant: 'default' },
  LOST: { label: 'Lost', variant: 'destructive' },
  UNRESPONSIVE: { label: 'Unresponsive', variant: 'secondary' },
};

interface LeadDetailsProps {
  leadId: string;
}

export function LeadDetails({ leadId }: LeadDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [note, setNote] = useState('');

  const utils = trpc.useUtils();

  const { data: lead, isLoading } = trpc.marketing.getLead.useQuery({ id: leadId });

  const updateStatus = trpc.marketing.updateLeadStatus.useMutation({
    onSuccess: () => {
      utils.marketing.getLead.invalidate({ id: leadId });
      toast.success('Status updated');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const addNote = trpc.marketing.addLeadNote.useMutation({
    onSuccess: () => {
      utils.marketing.getLead.invalidate({ id: leadId });
      setNote('');
      toast.success('Note added');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const logContact = trpc.marketing.logLeadContact.useMutation({
    onSuccess: () => {
      utils.marketing.getLead.invalidate({ id: leadId });
      toast.success('Contact logged');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const setFollowUp = trpc.marketing.setLeadFollowUp.useMutation({
    onSuccess: () => {
      utils.marketing.getLead.invalidate({ id: leadId });
      toast.success('Follow-up scheduled');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Note: convertLeadToPatient mutation requires both leadId and patientId
  // This would need a proper implementation to create a patient first
  const handleConvertToPatient = () => {
    toast.error('Patient conversion requires manual patient creation first. This feature will be automated in a future update.');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium">Lead not found</h2>
        <Link href="/marketing?tab=leads">
          <Button variant="link">Back to leads</Button>
        </Link>
      </div>
    );
  }

  const status = statusConfig[lead.status as LeadStatus];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/marketing?tab=leads">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">
              {lead.firstName} {lead.lastName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={status.variant}>{status.label}</Badge>
              <span className="text-sm text-muted-foreground">
                Added {format(new Date(lead.createdAt), 'MMMM d, yyyy')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lead.status !== 'CONVERTED' && (
            <Button onClick={handleConvertToPatient}>
              <User className="mr-2 h-4 w-4" />
              Convert to Patient
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{lead.email || 'Not provided'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{lead.phone || 'Not provided'}</p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    logContact.mutate({ leadId, method: 'phone', successful: true })
                  }
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Log Call
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    logContact.mutate({ leadId, method: 'email', successful: true })
                  }
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Log Email
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setFollowUp.mutate({
                      leadId,
                      followUpAt: tomorrow,
                    });
                  }}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Follow-up
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Activity & Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Activity & Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="activity">
                <TabsList>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="space-y-4 mt-4">
                  {lead.activities && lead.activities.length > 0 ? (
                    <div className="space-y-4">
                      {lead.activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex gap-3 p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex-shrink-0">
                            {activity.activityType === 'CALL' && (
                              <Phone className="h-4 w-4 text-muted-foreground" />
                            )}
                            {activity.activityType === 'EMAIL' && (
                              <Mail className="h-4 w-4 text-muted-foreground" />
                            )}
                            {activity.activityType === 'NOTE' && (
                              <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            )}
                            {activity.activityType === 'STATUS_CHANGE' && (
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium capitalize">
                              {activity.activityType.toLowerCase().replace('_', ' ')}
                            </p>
                            {activity.description && (
                              <p className="text-sm text-muted-foreground">
                                {activity.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(activity.createdAt), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No activity recorded yet
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="notes" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Add a note..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                    />
                    <Button
                      size="sm"
                      onClick={() => addNote.mutate({ leadId, note })}
                      disabled={!note.trim() || addNote.isPending}
                    >
                      Add Note
                    </Button>
                  </div>

                  {lead.notes && (
                    <div className="p-3 bg-muted/50 rounded-lg mt-4">
                      <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Lead Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Lead Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div
                  className={`text-4xl font-bold ${
                    lead.score >= 80
                      ? 'text-green-600'
                      : lead.score >= 50
                      ? 'text-yellow-600'
                      : 'text-red-600'
                  }`}
                >
                  {lead.score}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {lead.score >= 80
                    ? 'Hot Lead'
                    : lead.score >= 50
                    ? 'Warm Lead'
                    : 'Cold Lead'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={lead.status}
                onValueChange={(value) =>
                  updateStatus.mutate({ leadId, status: value as 'NEW' | 'CONVERTED' | 'QUALIFIED' | 'CONTACTED' | 'ENGAGED' | 'LOST' | 'UNRESPONSIVE' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Source & Attribution */}
          <Card>
            <CardHeader>
              <CardTitle>Source & Attribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Lead Source</p>
                <p className="font-medium capitalize">
                  {lead.source.toLowerCase().replace('_', ' ')}
                </p>
              </div>

              {(lead.utmSource || lead.utmMedium || lead.utmCampaign) && (
                <div className="pt-4 border-t space-y-2">
                  <p className="text-sm font-medium">UTM Parameters</p>
                  {lead.utmSource && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Source:</span> {lead.utmSource}
                    </div>
                  )}
                  {lead.utmMedium && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Medium:</span> {lead.utmMedium}
                    </div>
                  )}
                  {lead.utmCampaign && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Campaign:</span> {lead.utmCampaign}
                    </div>
                  )}
                </div>
              )}

              {lead.campaign && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Marketing Campaign</p>
                  <p className="font-medium">{lead.campaign.name}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Follow-up */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Follow-up
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.nextFollowUpAt ? (
                <div>
                  <p className="font-medium">
                    {format(new Date(lead.nextFollowUpAt), 'MMMM d, yyyy')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(lead.nextFollowUpAt), 'h:mm a')}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No follow-up scheduled</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
