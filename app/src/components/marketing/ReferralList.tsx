'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/trpc/client';
import {
  Plus,
  MoreHorizontal,
  UserPlus,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Gift,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type ReferralStatus = 'PENDING' | 'QUALIFIED' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

const statusConfig: Record<
  ReferralStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }
> = {
  PENDING: { label: 'Pending', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  QUALIFIED: { label: 'Qualified', variant: 'outline', icon: <UserPlus className="h-3 w-3" /> },
  COMPLETED: { label: 'Completed', variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
  EXPIRED: { label: 'Expired', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
  CANCELLED: { label: 'Cancelled', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
};

export function ReferralList() {
  const [statusFilter, setStatusFilter] = useState<ReferralStatus | 'ALL'>('ALL');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    referrerId: '',
    programId: '',
    refereeName: '',
    refereeEmail: '',
    refereePhone: '',
  });

  const utils = trpc.useUtils();

  const { data: referrals, isLoading } = trpc.marketing.listReferrals.useQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    limit: 50,
  });

  const { data: programs } = trpc.marketing.listReferralPrograms.useQuery({
    includeInactive: false,
  });

  const { data: patients } = trpc.patient.list.useQuery({
    limit: 100,
  });

  const createReferral = trpc.marketing.createReferral.useMutation({
    onSuccess: () => {
      utils.marketing.listReferrals.invalidate();
      setIsCreateDialogOpen(false);
      setFormData({
        referrerId: '',
        programId: '',
        refereeName: '',
        refereeEmail: '',
        refereePhone: '',
      });
      toast.success('Referral created successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Note: updateReferralStatus and completeReferral mutations not yet implemented in router
  // These will be added in a future update
  const updateStatus = {
    mutate: (_data: { id: string; status: string }) => {
      toast.info('Status update functionality will be available in a future update');
    },
    isPending: false,
  };

  const completeReferral = {
    mutate: (_data: { referralId: string }) => {
      toast.info('Referral completion functionality will be available in a future update');
    },
    isPending: false,
  };

  const handleCreateReferral = () => {
    createReferral.mutate(formData);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
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
          <h2 className="text-xl font-semibold">Patient Referrals</h2>
          <p className="text-sm text-muted-foreground">
            Track and manage patient referrals
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as ReferralStatus | 'ALL')}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter status" />
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
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Referral
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Referral</DialogTitle>
                <DialogDescription>
                  Record a new patient referral
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Referring Patient</Label>
                  <Select
                    value={formData.referrerId}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, referrerId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select patient" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients?.patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.firstName} {patient.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Referral Program</Label>
                  <Select
                    value={formData.programId}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, programId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select program" />
                    </SelectTrigger>
                    <SelectContent>
                      {programs?.map((program) => (
                        <SelectItem key={program.id} value={program.id}>
                          {program.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refereeName">Referred Person Name</Label>
                  <Input
                    id="refereeName"
                    value={formData.refereeName}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, refereeName: e.target.value }))
                    }
                    placeholder="Full name"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="refereeEmail">Email</Label>
                    <Input
                      id="refereeEmail"
                      type="email"
                      value={formData.refereeEmail}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, refereeEmail: e.target.value }))
                      }
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="refereePhone">Phone</Label>
                    <Input
                      id="refereePhone"
                      type="tel"
                      value={formData.refereePhone}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, refereePhone: e.target.value }))
                      }
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateReferral}
                  disabled={
                    createReferral.isPending ||
                    !formData.referrerId ||
                    !formData.programId ||
                    !formData.refereeName
                  }
                >
                  {createReferral.isPending ? 'Creating...' : 'Create Referral'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {referrals?.referrals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Gift className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No referrals yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start tracking patient referrals
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Referral
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referred Person</TableHead>
                  <TableHead>Referring Patient</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Rewards</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals?.referrals.map((referral) => {
                  const status = statusConfig[referral.status as ReferralStatus];
                  return (
                    <TableRow key={referral.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{referral.refereeName}</p>
                          <p className="text-xs text-muted-foreground">
                            {referral.refereeEmail || referral.refereePhone}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {referral.referrer?.demographics?.firstName}{' '}
                        {referral.referrer?.demographics?.lastName}
                      </TableCell>
                      <TableCell>{referral.program?.name}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          {status.icon}
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(referral.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {referral.referrerRewardIssued && (
                            <Badge variant="outline" className="mr-1">
                              Referrer: ${Number(referral.referrerRewardAmount || 0).toFixed(2)}
                            </Badge>
                          )}
                          {referral.refereeRewardIssued && (
                            <Badge variant="outline">
                              Referee: ${Number(referral.refereeRewardAmount || 0).toFixed(2)}
                            </Badge>
                          )}
                          {!referral.referrerRewardIssued && !referral.refereeRewardIssued && (
                            <span className="text-muted-foreground">Pending</span>
                          )}
                        </div>
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
                                updateStatus.mutate({
                                  id: referral.id,
                                  status: 'CONTACTED',
                                })
                              }
                            >
                              Mark as Contacted
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                updateStatus.mutate({
                                  id: referral.id,
                                  status: 'SCHEDULED',
                                })
                              }
                            >
                              Mark as Scheduled
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => completeReferral.mutate({ referralId: referral.id })}
                            >
                              Complete & Issue Rewards
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                updateStatus.mutate({
                                  id: referral.id,
                                  status: 'CANCELLED',
                                })
                              }
                              className="text-destructive"
                            >
                              Cancel Referral
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
