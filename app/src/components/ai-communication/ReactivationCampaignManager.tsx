'use client';

/**
 * Epic 12: AI Communication Agent - Reactivation Campaign Manager
 *
 * Manages campaigns to bring back lapsed patients.
 */

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  UserPlus,
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
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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

interface ReactivationCampaignManagerProps {
  className?: string;
}

export function ReactivationCampaignManager({ className }: ReactivationCampaignManagerProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    minDaysSinceVisit: '90',
    maxDaysSinceVisit: '365',
    excludeActivePatients: true,
    scheduledStartDate: '',
    sequence: [
      { stepNumber: 1, delayDays: 0, channel: 'EMAIL' as CommunicationChannel },
      { stepNumber: 2, delayDays: 5, channel: 'SMS' as CommunicationChannel },
      { stepNumber: 3, delayDays: 14, channel: 'EMAIL' as CommunicationChannel },
    ],
  });

  const utils = trpc.useUtils();

  // Fetch campaigns
  const { data: campaigns, isLoading } = trpc.aiCommunication.listCampaigns.useQuery({
    type: 'reactivation',
    limit: 50,
  });

  // Fetch stats for selected campaign
  const { data: stats, isLoading: statsLoading } = trpc.aiCommunication.getReactivationCampaignStats.useQuery(
    { campaignId: selectedCampaignId! },
    { enabled: !!selectedCampaignId }
  );

  // Mutations
  const createCampaign = trpc.aiCommunication.createReactivationCampaign.useMutation({
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

  const startCampaign = trpc.aiCommunication.startReactivationCampaign.useMutation({
    onSuccess: () => {
      toast.success('Campaign started');
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
      minDaysSinceVisit: '90',
      maxDaysSinceVisit: '365',
      excludeActivePatients: true,
      scheduledStartDate: '',
      sequence: [
        { stepNumber: 1, delayDays: 0, channel: 'EMAIL' },
        { stepNumber: 2, delayDays: 5, channel: 'SMS' },
        { stepNumber: 3, delayDays: 14, channel: 'EMAIL' },
      ],
    });
  };

  const handleCreateCampaign = () => {
    createCampaign.mutate({
      name: formData.name,
      description: formData.description || undefined,
      criteria: {
        minDaysSinceVisit: parseInt(formData.minDaysSinceVisit),
        maxDaysSinceVisit: formData.maxDaysSinceVisit
          ? parseInt(formData.maxDaysSinceVisit)
          : undefined,
        excludeActivePatients: formData.excludeActivePatients,
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
            <UserPlus className="h-6 w-6" />
            Reactivation Campaigns
          </h2>
          <p className="text-muted-foreground">
            Re-engage patients who haven&apos;t visited in a while
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
                <span className="text-sm text-muted-foreground">Reactivated</span>
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
          <CardTitle>All Reactivation Campaigns</CardTitle>
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
              <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No reactivation campaigns yet</p>
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
            <DialogTitle>Create Reactivation Campaign</DialogTitle>
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
                  placeholder="e.g., 90-Day Lapsed Patient Outreach"
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
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="minDays" className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Minimum Days Since Visit
                    </Label>
                    <Input
                      id="minDays"
                      type="number"
                      min="1"
                      value={formData.minDaysSinceVisit}
                      onChange={(e) => setFormData({ ...formData, minDaysSinceVisit: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Patients who haven&apos;t visited in at least this many days
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="maxDays" className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Maximum Days Since Visit
                    </Label>
                    <Input
                      id="maxDays"
                      type="number"
                      min="1"
                      value={formData.maxDaysSinceVisit}
                      onChange={(e) => setFormData({ ...formData, maxDaysSinceVisit: e.target.value })}
                      placeholder="Optional"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Don&apos;t include very old patients (optional)
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="excludeActive"
                    checked={formData.excludeActivePatients}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, excludeActivePatients: checked })
                    }
                  />
                  <Label htmlFor="excludeActive">
                    Exclude patients with upcoming appointments
                  </Label>
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
              disabled={!formData.name || !formData.minDaysSinceVisit || createCampaign.isPending}
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

export default ReactivationCampaignManager;
