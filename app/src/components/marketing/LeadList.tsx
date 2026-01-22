'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/trpc/client';
import {
  Plus,
  MoreHorizontal,
  UserPlus,
  Phone,
  Mail,
  Calendar,
  Target,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'ENGAGED' | 'CONVERTED' | 'LOST' | 'UNRESPONSIVE';
type LeadSource = 'WEBSITE' | 'REFERRAL' | 'SOCIAL_MEDIA' | 'GOOGLE_ADS' | 'FACEBOOK_ADS' | 'INSTAGRAM' | 'WALK_IN' | 'PHONE_CALL' | 'EVENT' | 'PARTNER' | 'DIRECTORY' | 'OTHER';

const statusConfig: Record<
  LeadStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  NEW: { label: 'New', variant: 'default' },
  CONTACTED: { label: 'Contacted', variant: 'outline' },
  QUALIFIED: { label: 'Qualified', variant: 'default' },
  ENGAGED: { label: 'Engaged', variant: 'secondary' },
  CONVERTED: { label: 'Converted', variant: 'default' },
  LOST: { label: 'Lost', variant: 'destructive' },
  UNRESPONSIVE: { label: 'Unresponsive', variant: 'secondary' },
};

const sourceLabels: Record<LeadSource, string> = {
  WEBSITE: 'Website',
  REFERRAL: 'Referral',
  SOCIAL_MEDIA: 'Social Media',
  GOOGLE_ADS: 'Google Ads',
  FACEBOOK_ADS: 'Facebook Ads',
  INSTAGRAM: 'Instagram',
  WALK_IN: 'Walk-In',
  PHONE_CALL: 'Phone Call',
  EVENT: 'Event',
  PARTNER: 'Partner',
  DIRECTORY: 'Directory',
  OTHER: 'Other',
};

interface LeadFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: LeadSource;
  interestedServices: string[];
  notes: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

const defaultFormData: LeadFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  source: 'WEBSITE',
  interestedServices: [],
  notes: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
};

export function LeadList() {
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'ALL'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'ALL'>('ALL');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<LeadFormData>(defaultFormData);

  const utils = trpc.useUtils();

  const { data: leads, isLoading } = trpc.marketing.listLeads.useQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    source: sourceFilter === 'ALL' ? undefined : sourceFilter,
    limit: 50,
  });

  const createLead = trpc.marketing.createLead.useMutation({
    onSuccess: () => {
      utils.marketing.listLeads.invalidate();
      setIsCreateDialogOpen(false);
      setFormData(defaultFormData);
      toast.success('Lead created successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateLeadStatus = trpc.marketing.updateLeadStatus.useMutation({
    onSuccess: () => {
      utils.marketing.listLeads.invalidate();
      toast.success('Lead status updated');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const logContactAttempt = trpc.marketing.logLeadContact.useMutation({
    onSuccess: () => {
      utils.marketing.listLeads.invalidate();
      toast.success('Contact attempt logged');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreateLead = () => {
    createLead.mutate(formData);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
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
          <h2 className="text-xl font-semibold">Leads</h2>
          <p className="text-sm text-muted-foreground">
            Track and convert potential patients
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as LeadStatus | 'ALL')}
          >
            <SelectTrigger className="w-[140px]">
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
            value={sourceFilter}
            onValueChange={(value) => setSourceFilter(value as LeadSource | 'ALL')}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sources</SelectItem>
              {Object.entries(sourceLabels).map(([value, label]) => (
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
                Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
                <DialogDescription>
                  Enter lead information to start tracking
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, firstName: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, lastName: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, email: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, phone: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Lead Source *</Label>
                  <Select
                    value={formData.source}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, source: value as LeadSource }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(sourceLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Initial notes about this lead..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">UTM Parameters (Optional)</Label>
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
                  onClick={handleCreateLead}
                  disabled={
                    createLead.isPending || !formData.firstName || !formData.lastName
                  }
                >
                  {createLead.isPending ? 'Creating...' : 'Add Lead'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {leads?.leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No leads yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start capturing potential patients
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Lead
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Contact</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads?.leads.map((lead) => {
                  const status = statusConfig[lead.status as LeadStatus];
                  return (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="font-medium">
                          {lead.firstName} {lead.lastName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          {lead.email && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {lead.email}
                            </div>
                          )}
                          {lead.phone && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {sourceLabels[lead.source as LeadSource] || lead.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-1 font-medium ${getScoreColor(lead.score)}`}>
                          <Target className="h-4 w-4" />
                          {lead.score}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {lead.lastContactedAt ? (
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(lead.lastContactedAt), 'MMM d, yyyy')}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {lead.nextFollowUpAt ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(lead.nextFollowUpAt), 'MMM d')}
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
                            <DropdownMenuItem
                              onClick={() =>
                                logContactAttempt.mutate({
                                  leadId: lead.id,
                                  method: 'phone',
                                  successful: true,
                                })
                              }
                            >
                              <Phone className="mr-2 h-4 w-4" />
                              Log Phone Call
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                logContactAttempt.mutate({
                                  leadId: lead.id,
                                  method: 'email',
                                  successful: true,
                                })
                              }
                            >
                              <Mail className="mr-2 h-4 w-4" />
                              Log Email Sent
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                updateLeadStatus.mutate({
                                  leadId: lead.id,
                                  status: 'QUALIFIED',
                                })
                              }
                            >
                              <TrendingUp className="mr-2 h-4 w-4" />
                              Mark Qualified
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                updateLeadStatus.mutate({
                                  leadId: lead.id,
                                  status: 'ENGAGED',
                                })
                              }
                            >
                              <Calendar className="mr-2 h-4 w-4" />
                              Mark Engaged
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                updateLeadStatus.mutate({
                                  leadId: lead.id,
                                  status: 'CONVERTED',
                                })
                              }
                            >
                              <ArrowUpRight className="mr-2 h-4 w-4" />
                              Mark Converted
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                updateLeadStatus.mutate({
                                  leadId: lead.id,
                                  status: 'LOST',
                                })
                              }
                              className="text-destructive"
                            >
                              Mark Lost
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
