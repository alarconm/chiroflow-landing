'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Search,
  Shield,
  Calendar,
  DollarSign,
  Activity,
  User,
} from 'lucide-react';
import { format } from 'date-fns';
import type { EligibilityStatus } from '@prisma/client';

interface EligibilityCheckerProps {
  patientId?: string;
}

export function EligibilityChecker({ patientId: initialPatientId }: EligibilityCheckerProps) {
  const [patientId, setPatientId] = useState(initialPatientId || '');
  const [insurancePolicyId, setInsurancePolicyId] = useState('');
  const [lastResult, setLastResult] = useState<{
    status: EligibilityStatus;
    coverage: {
      status: string;
      planName?: string;
      planType?: string;
      effectiveDate?: Date;
      terminationDate?: Date;
    };
    benefits: {
      deductible?: number;
      deductibleMet?: number;
      outOfPocketMax?: number;
      outOfPocketMet?: number;
      copay?: number;
      coinsurance?: number;
    };
    visitLimits?: {
      remaining?: number;
      used?: number;
      max?: number;
    };
    authorization?: {
      required: boolean;
      number?: string;
    };
  } | null>(null);

  const checkMutation = trpc.clearinghouse.checkEligibility.useMutation({
    onSuccess: (data) => {
      setLastResult(data.response);
    },
  });

  // Get patient list for selection if no patient provided
  const { data: patients } = trpc.patient.list.useQuery(
    { limit: 100 },
    { enabled: !initialPatientId }
  );

  // Get insurance policies for selected patient
  const { data: patient } = trpc.patient.get.useQuery(
    { id: patientId },
    { enabled: !!patientId }
  );

  const handleCheck = () => {
    if (!patientId) return;
    checkMutation.mutate({
      patientId,
      insurancePolicyId: insurancePolicyId || undefined,
    });
  };

  const getStatusIcon = (status?: EligibilityStatus) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'INACTIVE':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'PENDING':
      case 'CHECKING':
        return <AlertCircle className="h-5 w-5 text-blue-500" />;
      case 'UNKNOWN':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'ERROR':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status?: EligibilityStatus) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-500">Active</Badge>;
      case 'INACTIVE':
        return <Badge variant="destructive">Inactive</Badge>;
      case 'PENDING':
        return <Badge variant="secondary">Pending</Badge>;
      case 'CHECKING':
        return <Badge className="bg-blue-500">Checking</Badge>;
      case 'UNKNOWN':
        return <Badge variant="secondary">Unknown</Badge>;
      case 'ERROR':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Insurance Eligibility Check
          </CardTitle>
          <CardDescription>
            Verify patient insurance eligibility and benefits in real-time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {!initialPatientId && (
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients?.patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Insurance Policy</Label>
              <Select
                value={insurancePolicyId}
                onValueChange={setInsurancePolicyId}
                disabled={!patientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Primary insurance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__primary__">Primary Insurance</SelectItem>
                  {patient?.insurances?.map((ins) => (
                    <SelectItem key={ins.id} value={ins.id}>
                      {ins.payerName || 'Unknown'} - {ins.policyNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleCheck}
                disabled={!patientId || checkMutation.isPending}
                className="w-full"
              >
                {checkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Check Eligibility
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {checkMutation.error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>{checkMutation.error.message}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {lastResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {getStatusIcon(lastResult.status as EligibilityStatus)}
                Eligibility Results
              </CardTitle>
              {getStatusBadge(lastResult.status as EligibilityStatus)}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Coverage Info */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Coverage Information
              </h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">Plan Name</span>
                  <span className="font-medium">{lastResult.coverage.planName || 'N/A'}</span>
                </div>
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">Plan Type</span>
                  <span className="font-medium">{lastResult.coverage.planType || 'N/A'}</span>
                </div>
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">Effective Date</span>
                  <span className="font-medium">
                    {lastResult.coverage.effectiveDate
                      ? format(new Date(lastResult.coverage.effectiveDate), 'MM/dd/yyyy')
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">Termination Date</span>
                  <span className="font-medium">
                    {lastResult.coverage.terminationDate
                      ? format(new Date(lastResult.coverage.terminationDate), 'MM/dd/yyyy')
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Benefits Info */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Benefits Summary
              </h4>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Deductible</div>
                  <div className="text-2xl font-bold">
                    ${lastResult.benefits.deductible?.toFixed(2) || '0.00'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Met: ${lastResult.benefits.deductibleMet?.toFixed(2) || '0.00'}
                  </div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Out-of-Pocket Max</div>
                  <div className="text-2xl font-bold">
                    ${lastResult.benefits.outOfPocketMax?.toFixed(2) || '0.00'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Met: ${lastResult.benefits.outOfPocketMet?.toFixed(2) || '0.00'}
                  </div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Patient Cost Share</div>
                  <div className="text-2xl font-bold">
                    {lastResult.benefits.copay
                      ? `$${lastResult.benefits.copay}`
                      : lastResult.benefits.coinsurance
                        ? `${lastResult.benefits.coinsurance}%`
                        : 'N/A'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {lastResult.benefits.copay ? 'Copay' : 'Coinsurance'}
                  </div>
                </div>
              </div>
            </div>

            {/* Visit Limits (Chiropractic specific) */}
            {lastResult.visitLimits && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Chiropractic Visit Limits
                  </h4>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground">Visits Remaining</div>
                      <div className="text-2xl font-bold text-green-600">
                        {lastResult.visitLimits.remaining ?? 'N/A'}
                      </div>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground">Visits Used</div>
                      <div className="text-2xl font-bold">
                        {lastResult.visitLimits.used ?? 'N/A'}
                      </div>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground">Annual Maximum</div>
                      <div className="text-2xl font-bold">
                        {lastResult.visitLimits.max ?? 'Unlimited'}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Authorization Info */}
            {lastResult.authorization && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Authorization
                  </h4>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      {lastResult.authorization.required ? (
                        <AlertCircle className="h-5 w-5 text-orange-500" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      <span className="font-medium">
                        {lastResult.authorization.required
                          ? 'Prior Authorization Required'
                          : 'No Prior Authorization Required'}
                      </span>
                    </div>
                    {lastResult.authorization.number && (
                      <div className="mt-2 text-sm">
                        Authorization #: <span className="font-mono">{lastResult.authorization.number}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
