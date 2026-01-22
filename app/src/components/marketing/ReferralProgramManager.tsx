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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/trpc/client';
import { Plus, Edit, Trash2, Gift, DollarSign, Percent, Users } from 'lucide-react';
import { toast } from 'sonner';

type ReferralRewardType = 'DISCOUNT_PERCENT' | 'DISCOUNT_FIXED' | 'CREDIT' | 'FREE_SERVICE' | 'GIFT_CARD';

interface ProgramFormData {
  name: string;
  description: string;
  referrerRewardType: ReferralRewardType;
  referrerRewardValue: number;
  refereeRewardType: ReferralRewardType;
  refereeRewardValue: number;
  qualificationCriteria: string;
  expirationDays: number | null;
  maxReferralsPerPatient: number | null;
  termsAndConditions: string;
}

const defaultFormData: ProgramFormData = {
  name: '',
  description: '',
  referrerRewardType: 'CREDIT',
  referrerRewardValue: 25,
  refereeRewardType: 'DISCOUNT_PERCENT',
  refereeRewardValue: 20,
  qualificationCriteria: 'First completed appointment',
  expirationDays: 90,
  maxReferralsPerPatient: null,
  termsAndConditions: '',
};

const rewardTypeLabels: Record<ReferralRewardType, string> = {
  DISCOUNT_PERCENT: 'Percentage Discount',
  DISCOUNT_FIXED: 'Fixed Discount',
  CREDIT: 'Account Credit',
  FREE_SERVICE: 'Free Service',
  GIFT_CARD: 'Gift Card',
};

export function ReferralProgramManager() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProgramFormData>(defaultFormData);

  const utils = trpc.useUtils();
  const { data: programs, isLoading } = trpc.marketing.listReferralPrograms.useQuery({});

  const createProgram = trpc.marketing.createReferralProgram.useMutation({
    onSuccess: () => {
      utils.marketing.listReferralPrograms.invalidate();
      setIsCreateDialogOpen(false);
      setFormData(defaultFormData);
      toast.success('Referral program created successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateProgram = trpc.marketing.updateReferralProgram.useMutation({
    onSuccess: () => {
      utils.marketing.listReferralPrograms.invalidate();
      setEditingProgram(null);
      setFormData(defaultFormData);
      toast.success('Referral program updated successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Note: deleteReferralProgram mutation not yet implemented in router
  // Programs can be deactivated instead of deleted
  const deleteProgram = {
    mutate: (_data: { id: string }) => {
      toast.info('Program deletion will be available in a future update. Consider deactivating the program instead.');
    },
    isPending: false,
  };

  const handleSubmit = () => {
    // Convert null to undefined for API compatibility
    const apiFormData = {
      ...formData,
      expirationDays: formData.expirationDays ?? undefined,
      maxReferralsPerPatient: formData.maxReferralsPerPatient ?? undefined,
    };

    if (editingProgram) {
      updateProgram.mutate({
        id: editingProgram,
        ...apiFormData,
      });
    } else {
      createProgram.mutate(apiFormData);
    }
  };

  const handleEdit = (program: NonNullable<typeof programs>[0]) => {
    setFormData({
      name: program.name,
      description: program.description || '',
      referrerRewardType: program.referrerRewardType as ReferralRewardType,
      referrerRewardValue: Number(program.referrerRewardValue),
      refereeRewardType: (program.refereeRewardType as ReferralRewardType) || 'DISCOUNT_PERCENT',
      refereeRewardValue: program.refereeRewardValue ? Number(program.refereeRewardValue) : 0,
      qualificationCriteria: program.qualificationCriteria || '',
      expirationDays: program.expirationDays,
      maxReferralsPerPatient: program.maxReferralsPerPatient,
      termsAndConditions: program.termsAndConditions || '',
    });
    setEditingProgram(program.id);
  };

  const formatReward = (type: string, value: number) => {
    if (type === 'DISCOUNT_PERCENT') return `${value}% off`;
    if (type === 'DISCOUNT_FIXED' || type === 'CREDIT' || type === 'GIFT_CARD') return `$${value}`;
    return value.toString();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Referral Programs</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage patient referral incentive programs
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Program
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Referral Program</DialogTitle>
              <DialogDescription>
                Set up a new patient referral program with rewards
              </DialogDescription>
            </DialogHeader>
            <ProgramForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              isSubmitting={createProgram.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingProgram} onOpenChange={(open) => !open && setEditingProgram(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Referral Program</DialogTitle>
            <DialogDescription>
              Update the referral program settings
            </DialogDescription>
          </DialogHeader>
          <ProgramForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            isSubmitting={updateProgram.isPending}
            isEditing
          />
        </DialogContent>
      </Dialog>

      {/* Programs List */}
      <div className="space-y-4">
        {programs?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Gift className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No referral programs yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first referral program to start rewarding patient referrals
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Program
              </Button>
            </CardContent>
          </Card>
        ) : (
          programs?.map((program) => (
            <Card key={program.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{program.name}</CardTitle>
                    <Badge variant={program.isActive ? 'default' : 'secondary'}>
                      {program.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <CardDescription>{program.description}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEdit(program)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this program?')) {
                        deleteProgram.mutate({ id: program.id });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <Gift className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Referrer Reward</p>
                      <p className="font-medium">
                        {formatReward(program.referrerRewardType, Number(program.referrerRewardValue))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <DollarSign className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">New Patient Reward</p>
                      <p className="font-medium">
                        {program.refereeRewardType && program.refereeRewardValue
                          ? formatReward(program.refereeRewardType, Number(program.refereeRewardValue))
                          : 'None'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <Users className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Qualification</p>
                      <p className="font-medium">{program.qualificationCriteria || 'First visit'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <Percent className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Expiration</p>
                      <p className="font-medium">
                        {program.expirationDays ? `${program.expirationDays} days` : 'Never'}
                      </p>
                    </div>
                  </div>
                </div>
                {program._count && (
                  <div className="mt-4 pt-4 border-t flex items-center gap-6 text-sm text-muted-foreground">
                    <span>{program._count.referrals} total referrals</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

interface ProgramFormProps {
  formData: ProgramFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProgramFormData>>;
  onSubmit: () => void;
  isSubmitting: boolean;
  isEditing?: boolean;
}

function ProgramForm({
  formData,
  setFormData,
  onSubmit,
  isSubmitting,
  isEditing = false,
}: ProgramFormProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Program Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Friend Referral Program"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Describe your referral program..."
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">Referrer Rewards (Existing Patient)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Reward Type</Label>
            <Select
              value={formData.referrerRewardType}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  referrerRewardType: value as ReferralRewardType,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(rewardTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="referrerRewardValue">Reward Value</Label>
            <Input
              id="referrerRewardValue"
              type="number"
              min="0"
              value={formData.referrerRewardValue}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  referrerRewardValue: parseFloat(e.target.value) || 0,
                }))
              }
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">Referee Rewards (New Patient)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Reward Type</Label>
            <Select
              value={formData.refereeRewardType}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  refereeRewardType: value as ReferralRewardType,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(rewardTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="refereeRewardValue">Reward Value</Label>
            <Input
              id="refereeRewardValue"
              type="number"
              min="0"
              value={formData.refereeRewardValue}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  refereeRewardValue: parseFloat(e.target.value) || 0,
                }))
              }
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">Program Settings</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="qualificationCriteria">Qualification Criteria</Label>
            <Input
              id="qualificationCriteria"
              value={formData.qualificationCriteria}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  qualificationCriteria: e.target.value,
                }))
              }
              placeholder="e.g., First completed appointment"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expirationDays">Expiration (Days)</Label>
            <Input
              id="expirationDays"
              type="number"
              min="0"
              value={formData.expirationDays || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  expirationDays: e.target.value ? parseInt(e.target.value) : null,
                }))
              }
              placeholder="Never expires"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxReferralsPerPatient">Max Referrals per Patient</Label>
            <Input
              id="maxReferralsPerPatient"
              type="number"
              min="0"
              value={formData.maxReferralsPerPatient || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  maxReferralsPerPatient: e.target.value ? parseInt(e.target.value) : null,
                }))
              }
              placeholder="Unlimited"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="termsAndConditions">Terms & Conditions</Label>
        <Textarea
          id="termsAndConditions"
          value={formData.termsAndConditions}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, termsAndConditions: e.target.value }))
          }
          placeholder="Enter any terms and conditions..."
          rows={3}
        />
      </div>

      <DialogFooter>
        <Button onClick={onSubmit} disabled={isSubmitting || !formData.name}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Program' : 'Create Program'}
        </Button>
      </DialogFooter>
    </div>
  );
}
