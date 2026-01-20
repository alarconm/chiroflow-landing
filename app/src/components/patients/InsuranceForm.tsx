'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  CalendarIcon,
  Shield,
  User,
  DollarSign,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Form validation schema
const insuranceSchema = z.object({
  type: z.enum(['PRIMARY', 'SECONDARY', 'TERTIARY']),
  payerName: z.string().min(1, 'Insurance company name is required'),
  payerId: z.string().optional(),
  planName: z.string().optional(),
  planType: z.string().optional(),
  policyNumber: z.string().min(1, 'Policy number is required'),
  groupNumber: z.string().optional(),
  subscriberRelationship: z.enum(['SELF', 'SPOUSE', 'CHILD', 'OTHER']),
  subscriberId: z.string().optional(),
  subscriberFirstName: z.string().optional(),
  subscriberLastName: z.string().optional(),
  subscriberDob: z.date().optional().nullable(),
  effectiveDate: z.date().optional().nullable(),
  terminationDate: z.date().optional().nullable(),
  copay: z.number().min(0).optional().nullable(),
  deductible: z.number().min(0).optional().nullable(),
  deductibleMet: z.number().min(0).optional().nullable(),
  outOfPocketMax: z.number().min(0).optional().nullable(),
  outOfPocketMet: z.number().min(0).optional().nullable(),
});

export type InsuranceFormData = z.infer<typeof insuranceSchema>;

interface InsuranceFormProps {
  initialData?: Partial<InsuranceFormData>;
  onSubmit: (data: InsuranceFormData) => void | Promise<void>;
  isLoading?: boolean;
  mode?: 'create' | 'edit';
  insuranceType?: 'PRIMARY' | 'SECONDARY' | 'TERTIARY';
}

// Insurance type options
const insuranceTypeOptions = [
  { value: 'PRIMARY', label: 'Primary Insurance' },
  { value: 'SECONDARY', label: 'Secondary Insurance' },
  { value: 'TERTIARY', label: 'Tertiary Insurance' },
];

// Plan type options
const planTypeOptions = [
  { value: 'PPO', label: 'PPO (Preferred Provider Organization)' },
  { value: 'HMO', label: 'HMO (Health Maintenance Organization)' },
  { value: 'EPO', label: 'EPO (Exclusive Provider Organization)' },
  { value: 'POS', label: 'POS (Point of Service)' },
  { value: 'HDHP', label: 'HDHP (High Deductible Health Plan)' },
  { value: 'Medicare', label: 'Medicare' },
  { value: 'Medicaid', label: 'Medicaid' },
  { value: 'Workers Comp', label: "Workers' Compensation" },
  { value: 'Auto', label: 'Auto/PIP Insurance' },
  { value: 'Other', label: 'Other' },
];

// Subscriber relationship options
const subscriberRelationshipOptions = [
  { value: 'SELF', label: 'Self' },
  { value: 'SPOUSE', label: 'Spouse' },
  { value: 'CHILD', label: 'Child' },
  { value: 'OTHER', label: 'Other' },
];

// Common insurance payers
const commonPayers = [
  'Aetna',
  'Anthem',
  'Blue Cross Blue Shield',
  'Cigna',
  'Humana',
  'Kaiser Permanente',
  'Medicare',
  'Medicaid',
  'UnitedHealthcare',
  'Other',
];

export function InsuranceForm({
  initialData,
  onSubmit,
  isLoading = false,
  mode = 'create',
  insuranceType = 'PRIMARY',
}: InsuranceFormProps) {
  const [showSubscriberInfo, setShowSubscriberInfo] = useState(
    initialData?.subscriberRelationship
      ? initialData.subscriberRelationship !== 'SELF'
      : false
  );

  const form = useForm<InsuranceFormData>({
    resolver: zodResolver(insuranceSchema),
    defaultValues: {
      type: initialData?.type ?? insuranceType,
      payerName: initialData?.payerName ?? '',
      payerId: initialData?.payerId ?? '',
      planName: initialData?.planName ?? '',
      planType: initialData?.planType ?? '',
      policyNumber: initialData?.policyNumber ?? '',
      groupNumber: initialData?.groupNumber ?? '',
      subscriberRelationship: initialData?.subscriberRelationship ?? 'SELF',
      subscriberId: initialData?.subscriberId ?? '',
      subscriberFirstName: initialData?.subscriberFirstName ?? '',
      subscriberLastName: initialData?.subscriberLastName ?? '',
      subscriberDob: initialData?.subscriberDob ?? null,
      effectiveDate: initialData?.effectiveDate ?? null,
      terminationDate: initialData?.terminationDate ?? null,
      copay: initialData?.copay ?? null,
      deductible: initialData?.deductible ?? null,
      deductibleMet: initialData?.deductibleMet ?? null,
      outOfPocketMax: initialData?.outOfPocketMax ?? null,
      outOfPocketMet: initialData?.outOfPocketMet ?? null,
    },
  });

  const watchedRelationship = form.watch('subscriberRelationship');
  const watchedEffectiveDate = form.watch('effectiveDate');
  const watchedTerminationDate = form.watch('terminationDate');
  const watchedSubscriberDob = form.watch('subscriberDob');
  const watchedDeductible = form.watch('deductible');
  const watchedDeductibleMet = form.watch('deductibleMet');
  const watchedOutOfPocketMax = form.watch('outOfPocketMax');
  const watchedOutOfPocketMet = form.watch('outOfPocketMet');

  // Calculate deductible progress
  const deductibleProgress = useMemo(() => {
    if (!watchedDeductible || watchedDeductible === 0) return null;
    const met = watchedDeductibleMet ?? 0;
    return Math.min(100, (met / watchedDeductible) * 100);
  }, [watchedDeductible, watchedDeductibleMet]);

  // Calculate out of pocket progress
  const outOfPocketProgress = useMemo(() => {
    if (!watchedOutOfPocketMax || watchedOutOfPocketMax === 0) return null;
    const met = watchedOutOfPocketMet ?? 0;
    return Math.min(100, (met / watchedOutOfPocketMax) * 100);
  }, [watchedOutOfPocketMax, watchedOutOfPocketMet]);

  // Update subscriber info visibility when relationship changes
  const handleRelationshipChange = (value: string) => {
    form.setValue('subscriberRelationship', value as InsuranceFormData['subscriberRelationship']);
    setShowSubscriberInfo(value !== 'SELF');
    if (value === 'SELF') {
      // Clear subscriber info if self
      form.setValue('subscriberFirstName', '');
      form.setValue('subscriberLastName', '');
      form.setValue('subscriberDob', null);
    }
  };

  const handleSubmit = form.handleSubmit(onSubmit);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Insurance Type & Payer */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-cyan-500" />
            Insurance Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type">Insurance Type</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(value) =>
                  form.setValue('type', value as InsuranceFormData['type'])
                }
                disabled={isLoading}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {insuranceTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="planType">Plan Type</Label>
              <Select
                value={form.watch('planType') || ''}
                onValueChange={(value) => form.setValue('planType', value)}
                disabled={isLoading}
              >
                <SelectTrigger id="planType">
                  <SelectValue placeholder="Select plan type" />
                </SelectTrigger>
                <SelectContent>
                  {planTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payerName">
                Insurance Company <span className="text-red-500">*</span>
              </Label>
              <Input
                id="payerName"
                list="payers"
                {...form.register('payerName')}
                placeholder="e.g., Blue Cross Blue Shield"
                disabled={isLoading}
              />
              <datalist id="payers">
                {commonPayers.map((payer) => (
                  <option key={payer} value={payer} />
                ))}
              </datalist>
              {form.formState.errors.payerName && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.payerName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="planName">Plan Name</Label>
              <Input
                id="planName"
                {...form.register('planName')}
                placeholder="e.g., Gold PPO 500"
                disabled={isLoading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Policy Details */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5 text-cyan-500" />
            Policy Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="policyNumber">
                Policy/Member ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="policyNumber"
                {...form.register('policyNumber')}
                placeholder="XXX123456789"
                disabled={isLoading}
              />
              {form.formState.errors.policyNumber && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.policyNumber.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="groupNumber">Group Number</Label>
              <Input
                id="groupNumber"
                {...form.register('groupNumber')}
                placeholder="GRP12345"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payerId">Payer ID (EDI)</Label>
              <Input
                id="payerId"
                {...form.register('payerId')}
                placeholder="12345"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                For electronic claims
              </p>
            </div>
          </div>

          {/* Coverage Dates */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Effective Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !watchedEffectiveDate && 'text-muted-foreground'
                    )}
                    disabled={isLoading}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {watchedEffectiveDate
                      ? format(watchedEffectiveDate, 'PPP')
                      : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={watchedEffectiveDate || undefined}
                    onSelect={(date) =>
                      form.setValue('effectiveDate', date || null)
                    }
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Termination Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !watchedTerminationDate && 'text-muted-foreground'
                    )}
                    disabled={isLoading}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {watchedTerminationDate
                      ? format(watchedTerminationDate, 'PPP')
                      : 'Select date (if known)'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={watchedTerminationDate || undefined}
                    onSelect={(date) =>
                      form.setValue('terminationDate', date || null)
                    }
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscriber Information */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-cyan-500" />
            Subscriber Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="subscriberRelationship">
                Subscriber Relationship
              </Label>
              <Select
                value={watchedRelationship}
                onValueChange={handleRelationshipChange}
                disabled={isLoading}
              >
                <SelectTrigger id="subscriberRelationship">
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  {subscriberRelationshipOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Patient&apos;s relationship to the policy holder
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subscriberId">Subscriber ID</Label>
              <Input
                id="subscriberId"
                {...form.register('subscriberId')}
                placeholder="If different from Policy ID"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Show subscriber details if not self */}
          {showSubscriberInfo && (
            <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t">
              <div className="space-y-2">
                <Label htmlFor="subscriberFirstName">
                  Subscriber First Name
                </Label>
                <Input
                  id="subscriberFirstName"
                  {...form.register('subscriberFirstName')}
                  placeholder="Policy holder first name"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subscriberLastName">Subscriber Last Name</Label>
                <Input
                  id="subscriberLastName"
                  {...form.register('subscriberLastName')}
                  placeholder="Policy holder last name"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label>Subscriber DOB</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !watchedSubscriberDob && 'text-muted-foreground'
                      )}
                      disabled={isLoading}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {watchedSubscriberDob
                        ? format(watchedSubscriberDob, 'PPP')
                        : 'Select DOB'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={watchedSubscriberDob || undefined}
                      onSelect={(date) =>
                        form.setValue('subscriberDob', date || null)
                      }
                      disabled={(date) => date > new Date()}
                      autoFocus
                      captionLayout="dropdown"
                      startMonth={new Date(1920, 0)}
                      endMonth={new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Benefits & Costs */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-cyan-500" />
            Benefits & Costs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="copay">Copay ($)</Label>
              <Input
                id="copay"
                type="number"
                min="0"
                step="0.01"
                {...form.register('copay', { valueAsNumber: true })}
                placeholder="0.00"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deductible">Annual Deductible ($)</Label>
              <Input
                id="deductible"
                type="number"
                min="0"
                step="0.01"
                {...form.register('deductible', { valueAsNumber: true })}
                placeholder="0.00"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deductibleMet">Deductible Met ($)</Label>
              <Input
                id="deductibleMet"
                type="number"
                min="0"
                step="0.01"
                {...form.register('deductibleMet', { valueAsNumber: true })}
                placeholder="0.00"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Deductible Progress */}
          {deductibleProgress !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Deductible Progress</span>
                <span className="text-muted-foreground">
                  ${watchedDeductibleMet?.toFixed(2) || '0.00'} / $
                  {watchedDeductible?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    deductibleProgress >= 100
                      ? 'bg-green-500'
                      : 'bg-cyan-500'
                  )}
                  style={{ width: `${deductibleProgress}%` }}
                />
              </div>
              {deductibleProgress >= 100 && (
                <div className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Deductible met!
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="outOfPocketMax">Out-of-Pocket Max ($)</Label>
              <Input
                id="outOfPocketMax"
                type="number"
                min="0"
                step="0.01"
                {...form.register('outOfPocketMax', { valueAsNumber: true })}
                placeholder="0.00"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="outOfPocketMet">Out-of-Pocket Met ($)</Label>
              <Input
                id="outOfPocketMet"
                type="number"
                min="0"
                step="0.01"
                {...form.register('outOfPocketMet', { valueAsNumber: true })}
                placeholder="0.00"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Out of Pocket Progress */}
          {outOfPocketProgress !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Out-of-Pocket Progress</span>
                <span className="text-muted-foreground">
                  ${watchedOutOfPocketMet?.toFixed(2) || '0.00'} / $
                  {watchedOutOfPocketMax?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    outOfPocketProgress >= 100
                      ? 'bg-green-500'
                      : 'bg-teal-500'
                  )}
                  style={{ width: `${outOfPocketProgress}%` }}
                />
              </div>
              {outOfPocketProgress >= 100 && (
                <div className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Out-of-pocket max reached!
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end gap-3">
        <Button
          type="submit"
          disabled={isLoading}
          className="bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600"
        >
          {isLoading
            ? 'Saving...'
            : mode === 'create'
            ? 'Add Insurance'
            : 'Update Insurance'}
        </Button>
      </div>
    </form>
  );
}

export default InsuranceForm;
