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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/trpc/client';
import {
  Plus,
  MoreHorizontal,
  Megaphone,
  Play,
  Pause,
  Eye,
  MousePointer,
  Users,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
type CampaignType = 'EMAIL' | 'SMS' | 'SOCIAL' | 'REFERRAL' | 'REVIEW' | 'REACTIVATION' | 'RETENTION';

const statusConfig: Record<
  CampaignStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  ACTIVE: { label: 'Active', variant: 'default' },
  PAUSED: { label: 'Paused', variant: 'outline' },
  COMPLETED: { label: 'Completed', variant: 'default' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
};

const typeLabels: Record<CampaignType, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  SOCIAL: 'Social Media',
  REFERRAL: 'Referral',
  REVIEW: 'Review',
  REACTIVATION: 'Reactivation',
  RETENTION: 'Retention',
};

interface CampaignFormData {
  name: string;
  description: string;
  campaignType: CampaignType;
  budget: number | null;
  startDate: string;
  endDate: string;
  targetAudience: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

const defaultFormData: CampaignFormData = {
  name: '',
  description: '',
  campaignType: 'EMAIL',
  budget: null,
  startDate: '',
  endDate: '',
  targetAudience: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
};

export function CampaignList() {
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<CampaignType | 'ALL'>('ALL');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<CampaignFormData>(defaultFormData);

  const utils = trpc.useUtils();

  const { data: campaigns, isLoading } = trpc.marketing.listCampaigns.useQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    campaignType: typeFilter === 'ALL' ? undefined : typeFilter,
    limit: 50,
  });

  const createCampaign = trpc.marketing.createCampaign.useMutation({
    onSuccess: () => {
      utils.marketing.listCampaigns.invalidate();
      setIsCreateDialogOpen(false);
      setFormData(defaultFormData);
      toast.success('Campaign created successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateCampaignStatus = trpc.marketing.updateCampaignStatus.useMutation({
    onSuccess: () => {
      utils.marketing.listCampaigns.invalidate();
      toast.success('Campaign status updated');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const startCampaign = (id: string) => {
    updateCampaignStatus.mutate({ id, status: 'ACTIVE' });
  };

  const pauseCampaign = (id: string) => {
    updateCampaignStatus.mutate({ id, status: 'PAUSED' });
  };

  const handleCreateCampaign = () => {
    createCampaign.mutate({
      name: formData.name,
      description: formData.description || undefined,
      campaignType: formData.campaignType,
      budget: formData.budget || undefined,
      startDate: formData.startDate ? new Date(formData.startDate) : undefined,
      endDate: formData.endDate ? new Date(formData.endDate) : undefined,
      utmSource: formData.utmSource || undefined,
      utmMedium: formData.utmMedium || undefined,
      targetAudience: formData.targetAudience ? { description: formData.targetAudience } : undefined,
    });
  };

  const calculateROI = (campaign: NonNullable<typeof campaigns>['campaigns'][0]) => {
    const budget = campaign.budget ? Number(campaign.budget) : 0;
    if (!budget || budget === 0) return null;
    const totalRevenue = campaign.totalRevenue ? Number(campaign.totalRevenue) : 0;
    const roi = ((totalRevenue - budget) / budget) * 100;
    return roi;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Marketing Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            Track and manage marketing campaigns
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as CampaignStatus | 'ALL')}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              {Object.entries(statusConfig).map(([value, config]) => (
                <SelectItem key={value} value={value}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value as CampaignType | 'ALL')}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              {Object.entries(typeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Campaign</DialogTitle>
                <DialogDescription>
                  Set up a new marketing campaign
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="e.g., Summer Wellness Campaign"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Describe your campaign..."
                    rows={2}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Campaign Type *</Label>
                    <Select
                      value={formData.campaignType}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          campaignType: value as CampaignType,
                        }))
                      }
                    >
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
                  <div className="space-y-2">
                    <Label htmlFor="budget">Budget ($)</Label>
                    <Input
                      id="budget"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.budget || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          budget: e.target.value ? parseFloat(e.target.value) : null,
                        }))
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, startDate: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, endDate: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetAudience">Target Audience</Label>
                  <Textarea
                    id="targetAudience"
                    value={formData.targetAudience}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, targetAudience: e.target.value }))
                    }
                    placeholder="Describe your target audience..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">UTM Parameters</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      placeholder="Source"
                      value={formData.utmSource}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, utmSource: e.target.value }))
                      }
                    />
                    <Input
                      placeholder="Medium"
                      value={formData.utmMedium}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, utmMedium: e.target.value }))
                      }
                    />
                    <Input
                      placeholder="Campaign"
                      value={formData.utmCampaign}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, utmCampaign: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateCampaign}
                  disabled={createCampaign.isPending || !formData.name}
                >
                  {createCampaign.isPending ? 'Creating...' : 'Create Campaign'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {campaigns?.campaigns?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No campaigns yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first marketing campaign
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Campaign
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Performance</TableHead>
                  <TableHead>Budget/Spend</TableHead>
                  <TableHead>ROI</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns?.campaigns?.map((campaign) => {
                  const status = statusConfig[campaign.status as CampaignStatus];
                  const roi = calculateROI(campaign);
                  const conversionRate =
                    campaign.totalClicks > 0
                      ? ((campaign.totalConversions / campaign.totalClicks) * 100).toFixed(1)
                      : '0';
                  const clickRate =
                    campaign.totalImpressions > 0
                      ? ((campaign.totalClicks / campaign.totalImpressions) * 100).toFixed(1)
                      : '0';

                  return (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{campaign.name}</p>
                          {campaign.startDate && campaign.endDate && (
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(campaign.startDate), 'MMM d')} -{' '}
                              {format(new Date(campaign.endDate), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {typeLabels[campaign.campaignType as CampaignType]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Eye className="h-3 w-3 text-muted-foreground" />
                            <span>{campaign.totalImpressions.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MousePointer className="h-3 w-3 text-muted-foreground" />
                            <span>
                              {campaign.totalClicks.toLocaleString()} ({clickRate}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span>
                              {campaign.totalConversions} ({conversionRate}%)
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {campaign.budget ? (
                            <>
                              <div className="text-sm font-medium">
                                ${Number(campaign.actualSpend || 0).toFixed(2)} / ${Number(campaign.budget).toFixed(2)}
                              </div>
                              <Progress
                                value={(Number(campaign.actualSpend || 0) / Number(campaign.budget)) * 100}
                                className="h-1.5"
                              />
                            </>
                          ) : (
                            <span className="text-sm text-muted-foreground">No budget set</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {roi !== null ? (
                          <div
                            className={`flex items-center gap-1 font-medium ${
                              roi >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            <TrendingUp className="h-4 w-4" />
                            {roi.toFixed(0)}%
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {campaign.status === 'DRAFT' && (
                              <DropdownMenuItem
                                onClick={() => startCampaign(campaign.id)}
                              >
                                <Play className="mr-2 h-4 w-4" />
                                Start Campaign
                              </DropdownMenuItem>
                            )}
                            {campaign.status === 'ACTIVE' && (
                              <DropdownMenuItem
                                onClick={() => pauseCampaign(campaign.id)}
                              >
                                <Pause className="mr-2 h-4 w-4" />
                                Pause Campaign
                              </DropdownMenuItem>
                            )}
                            {campaign.status === 'PAUSED' && (
                              <DropdownMenuItem
                                onClick={() => startCampaign(campaign.id)}
                              >
                                <Play className="mr-2 h-4 w-4" />
                                Resume Campaign
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
