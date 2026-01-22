'use client';

/**
 * Epic 12: AI Communication Agent - Recall Campaign Manager
 *
 * Manages automated recall campaigns for patient outreach.
 */

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  RefreshCcw,
  Plus,
  Play,
  Pause,
  BarChart3,
  Users,
  Mail,
  MessageSquare,
  Phone,
  Calendar,
  Target,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import type { CampaignStatus, CommunicationChannel } from '@prisma/client';

interface RecallCampaignManagerProps {
  className?: string;
}

export function RecallCampaignManager({ className }: RecallCampaignManagerProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    lastVisitStart: '',
    lastVisitEnd: '',
    minVisits: '',
    maxVisits: '',
    scheduledStartDate: '',
    sequence: [
      { stepNumber: 1, delayDays: 0, channel: 'EMAIL' as CommunicationChannel },
      { stepNumber: 2, delayDays: 3, channel: 'SMS' as CommunicationChannel },
      { stepNumber: 3, delayDays: 7, channel: 'EMAIL' as CommunicationChannel },
    ],
  });

  const utils = trpc.useUtils();

  // Fetch campaigns
  const { data: campaigns, isLoading } = trpc.aiCommunication.listCampaigns.useQuery({
    type: 'recall',
    limit: 50,
  });

  // Fetch stats for selected campaign
  const { data: stats, isLoading: statsLoading } = trpc.aiCommunication.getRecallCampaignStats.useQuery(
    { campaignId: selectedCampaignId! },
    { enabled: !!selectedCampaignId }
  );

  // Mutations
  const createCampaign = trpc.aiCommunication.createRecallCampaign.useMutation({
    onSuccess: (data) => {
      toast.success(`Campaign created with ${data.patientCount} patients targeted`);
      setShowCreateDialog(false);
      resetForm();
      utils.aiCommunication.listCampaigns.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const startCampaign = trpc.aiCommunication.startRecallCampaign.useMutation({
    onSuccess: () => {
      toast.success('Campaign started');
      utils.aiCommunication.listCampaigns.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const pauseCampaign = trpc.aiCommunication.pauseRecallCampaign.useMutation({
    onSuccess: () => {
      toast.success('Campaign paused');
      utils.aiCommunication.listCampaigns.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      lastVisitStart: '',
      lastVisitEnd: '',
      minVisits: '',
      maxVisits: '',
      scheduledStartDate: '',
      sequence: [
        { stepNumber: 1, delayDays: 0, channel: 'EMAIL' },
        { stepNumber: 2, delayDays: 3, channel: 'SMS' },
        { stepNumber: 3, delayDays: 7, channel: 'EMAIL' },
      ],
    });
  };

  const handleCreateCampaign = () => {
    createCampaign.mutate({
      name: formData.name,
      description: formData.description || undefined,
      criteria: {
        lastVisitDateRange: {
          start: formData.lastVisitStart ? new Date(formData.lastVisitStart) : undefined,
          end: formData.lastVisitEnd ? new Date(formData.lastVisitEnd) : undefined,
        },
        minVisits: formData.minVisits ? parseInt(formData.minVisits) : undefined,
        maxVisits: formData.maxVisits ? parseInt(formData.maxVisits) : undefined,
      },
      sequence: formData.sequence,
      scheduledStartDate: formData.scheduledStartDate
        ? new Date(formData.scheduledStartDate)
        : undefined,
    });
  };

  const getStatusBadge = (status: CampaignStatus) => {
    const variants: Record<CampaignStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      DRAFT: { variant: 'secondary', label: 'Draft' },
      SCHEDULED: { variant: 'outline', label: 'Scheduled' },
      ACTIVE: { variant: 'default', label: 'Active' },
      PAUSED: { variant: 'secondary', label: 'Paused' },
      COMPLETED: { variant: 'outline', label: 'Completed' },
      CANCELLED: { variant: 'destructive', label: 'Cancelled' },
    };
    const config = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getChannelIcon = (channel: CommunicationChannel) => {
    switch (channel) {
      case 'EMAIL':
        return <Mail className="h-4 w-4" />;
      case 'SMS':
        return <MessageSquare className="h-4 w-4" />;
      case 'VOICE':
        return <Phone className="h-4 w-4" />;
      default:
        return <Mail className="h-4 w-4" />;
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <RefreshCcw className="h-6 w-6" />
            Recall Campaigns
          </h2>
          <p className="text-muted-foreground">
            Automated outreach to bring patients back for regular care
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {/* Campaign stats summary */}
      {stats && selectedCampaignId && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Targeted</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.totalTargeted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Sent</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.totalSent}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Responded</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.totalResponded}</p>
              <p className="text-xs text-muted-foreground">
                {(stats.responseRate * 100).toFixed(1)}% rate
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Converted</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.totalConverted}</p>
              <p className="text-xs text-muted-foreground">
                {(stats.conversionRate * 100).toFixed(1)}% rate
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Delivery</span>
              </div>
              <Progress value={stats.deliveryRate * 100} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {(stats.deliveryRate * 100).toFixed(1)}% delivered
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Campaigns table */}
      <Card>
        <CardHeader>
          <CardTitle>All Recall Campaigns</CardTitle>
          <CardDescription>
            Click a campaign to view detailed statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !campaigns?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recall campaigns yet</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowCreateDialog(true)}
              >
                Create your first campaign
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Patients</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow
                    key={campaign.id}
                    className={cn(
                      'cursor-pointer',
                      selectedCampaignId === campaign.id && 'bg-muted'
                    )}
                    onClick={() => setSelectedCampaignId(campaign.id)}
                  >
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell>{campaign.patientCount}</TableCell>
                    <TableCell>
                      {format(new Date(campaign.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {campaign.status === 'COMPLETED' ? (
                        <Badge variant="outline">Complete</Badge>
                      ) : campaign.startedAt ? (
                        <span className="text-sm text-muted-foreground">
                          Started {format(new Date(campaign.startedAt), 'MMM d')}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not started</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            startCampaign.mutate({ campaignId: campaign.id });
                          }}
                          disabled={startCampaign.isPending}
                        >
                          {startCampaign.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              Start
                            </>
                          )}
                        </Button>
                      )}
                      {campaign.status === 'ACTIVE' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            pauseCampaign.mutate({ campaignId: campaign.id });
                          }}
                          disabled={pauseCampaign.isPending}
                        >
                          {pauseCampaign.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Pause className="h-4 w-4 mr-1" />
                              Pause
                            </>
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create campaign dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Recall Campaign</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Q1 Wellness Checkup Recall"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description..."
                />
              </div>
            </div>

            {/* Criteria */}
            <div>
              <h4 className="font-medium mb-3">Patient Criteria</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="lastVisitStart">Last Visit After</Label>
                  <Input
                    id="lastVisitStart"
                    type="date"
                    value={formData.lastVisitStart}
                    onChange={(e) => setFormData({ ...formData, lastVisitStart: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="lastVisitEnd">Last Visit Before</Label>
                  <Input
                    id="lastVisitEnd"
                    type="date"
                    value={formData.lastVisitEnd}
                    onChange={(e) => setFormData({ ...formData, lastVisitEnd: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="minVisits">Min Visits</Label>
                  <Input
                    id="minVisits"
                    type="number"
                    min="0"
                    value={formData.minVisits}
                    onChange={(e) => setFormData({ ...formData, minVisits: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label htmlFor="maxVisits">Max Visits</Label>
                  <Input
                    id="maxVisits"
                    type="number"
                    min="0"
                    value={formData.maxVisits}
                    onChange={(e) => setFormData({ ...formData, maxVisits: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            {/* Sequence */}
            <div>
              <h4 className="font-medium mb-3">Communication Sequence</h4>
              <div className="space-y-2">
                {formData.sequence.map((step, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                  >
                    <span className="text-sm font-medium w-16">Step {step.stepNumber}</span>
                    <div className="flex items-center gap-2 flex-1">
                      {getChannelIcon(step.channel)}
                      <Select
                        value={step.channel}
                        onValueChange={(value) => {
                          const newSequence = [...formData.sequence];
                          newSequence[index].channel = value as CommunicationChannel;
                          setFormData({ ...formData, sequence: newSequence });
                        }}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EMAIL">Email</SelectItem>
                          <SelectItem value="SMS">SMS</SelectItem>
                          <SelectItem value="VOICE">Voice</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`delay-${index}`} className="text-sm whitespace-nowrap">
                        After
                      </Label>
                      <Input
                        id={`delay-${index}`}
                        type="number"
                        min="0"
                        className="w-20"
                        value={step.delayDays}
                        onChange={(e) => {
                          const newSequence = [...formData.sequence];
                          newSequence[index].delayDays = parseInt(e.target.value) || 0;
                          setFormData({ ...formData, sequence: newSequence });
                        }}
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <Label htmlFor="scheduledStartDate">Scheduled Start Date (Optional)</Label>
              <Input
                id="scheduledStartDate"
                type="datetime-local"
                value={formData.scheduledStartDate}
                onChange={(e) => setFormData({ ...formData, scheduledStartDate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to start manually
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCampaign}
              disabled={!formData.name || createCampaign.isPending}
            >
              {createCampaign.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Campaign'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RecallCampaignManager;
