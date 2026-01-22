'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Shield,
  DollarSign,
  Activity,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { EligibilityStatus } from '@prisma/client';

interface PatientEligibilityCardProps {
  patientId: string;
  insuranceId?: string;
  insuranceName?: string;
  insuranceType?: 'PRIMARY' | 'SECONDARY' | 'TERTIARY';
  compact?: boolean;
  showCheckButton?: boolean;
  cacheHours?: number;
}

export function PatientEligibilityCard({
  patientId,
  insuranceId,
  insuranceName,
  insuranceType = 'PRIMARY',
  compact = false,
  showCheckButton = true,
  cacheHours = 24,
}: PatientEligibilityCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get cached eligibility data
  const {
    data: eligibilityData,
    isLoading,
    refetch,
  } = trpc.clearinghouse.getLatestEligibility.useQuery(
    {
      patientId,
      insuranceId,
      maxAgeDays: Math.ceil(cacheHours / 24),
    },
    { enabled: !!patientId }
  );

  // Mutation to check eligibility with cache support
  const checkMutation = trpc.clearinghouse.checkEligibilityWithCache.useMutation({
    onSuccess: () => {
      refetch();
      setIsRefreshing(false);
    },
    onError: () => {
      setIsRefreshing(false);
    },
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    checkMutation.mutate({
      patientId,
      insurancePolicyId: insuranceId,
      forceRefresh: true,
      cacheHours,
    });
  };

  const getStatusIcon = (status?: EligibilityStatus | string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'INACTIVE':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'PENDING':
      case 'CHECKING':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'UNKNOWN':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'ERROR':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status?: EligibilityStatus | string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>;
      case 'INACTIVE':
        return <Badge variant="destructive">Inactive</Badge>;
      case 'PENDING':
        return <Badge variant="secondary">Pending</Badge>;
      case 'CHECKING':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Checking</Badge>;
      case 'UNKNOWN':
        return <Badge variant="secondary">Unknown</Badge>;
      case 'ERROR':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Not Checked</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const latestCheck = eligibilityData?.latestCheck;
  const needsRefresh = eligibilityData?.needsRefresh;
  const cacheAgeHours = eligibilityData?.cacheAgeHours;

  // Compact mode - just show status badge
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {latestCheck ? (
          <>
            {getStatusIcon(latestCheck.status)}
            {getStatusBadge(latestCheck.status)}
            {cacheAgeHours !== null && (
              <span className="text-xs text-muted-foreground">
                ({formatDistanceToNow(new Date(latestCheck.checkDate))} ago)
              </span>
            )}
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Not verified</span>
          </>
        )}
        {showCheckButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || checkMutation.isPending}
            className="h-6 px-2"
          >
            {isRefreshing || checkMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    );
  }

  // Full card mode
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#053e67]" />
            <CardTitle className="text-base">
              {insuranceType} Eligibility
              {insuranceName && (
                <span className="font-normal text-muted-foreground ml-2">
                  ({insuranceName})
                </span>
              )}
            </CardTitle>
          </div>
          {latestCheck && getStatusBadge(latestCheck.status)}
        </div>
        {latestCheck && (
          <CardDescription className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last checked {formatDistanceToNow(new Date(latestCheck.checkDate))} ago
            {needsRefresh && (
              <Badge variant="outline" className="ml-2 text-xs">
                Refresh recommended
              </Badge>
            )}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {latestCheck ? (
          <>
            {/* Coverage Info */}
            {latestCheck.planName && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{latestCheck.planName}</span>
              </div>
            )}

            {/* Benefits Summary */}
            <div className="grid gap-2 md:grid-cols-3">
              {(latestCheck.copay || latestCheck.coinsurance) && (
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-xs text-muted-foreground">Cost Share</div>
                  <div className="font-bold">
                    {latestCheck.copay
                      ? `$${Number(latestCheck.copay).toFixed(2)}`
                      : `${Number(latestCheck.coinsurance)}%`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {latestCheck.copay ? 'Copay' : 'Coinsurance'}
                  </div>
                </div>
              )}

              {latestCheck.deductible && (
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-xs text-muted-foreground">Deductible</div>
                  <div className="font-bold">
                    ${Number(latestCheck.deductible).toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Met: ${Number(latestCheck.deductibleMet || 0).toFixed(2)}
                  </div>
                </div>
              )}

              {latestCheck.visitsRemaining !== null && (
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-xs text-muted-foreground">Visits</div>
                  <div className="font-bold text-green-600">
                    {latestCheck.visitsRemaining} left
                  </div>
                  <div className="text-xs text-muted-foreground">
                    of {latestCheck.visitsMax || '?'}
                  </div>
                </div>
              )}
            </div>

            {/* Authorization Warning */}
            {latestCheck.authRequired && (
              <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="text-orange-700">
                  Prior authorization required
                  {latestCheck.authNumber && (
                    <span className="font-mono ml-1">#{latestCheck.authNumber}</span>
                  )}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4">
            <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              Eligibility has not been verified
            </p>
          </div>
        )}

        {/* Actions */}
        {showCheckButton && (
          <Button
            variant={latestCheck ? 'outline' : 'default'}
            className="w-full"
            onClick={handleRefresh}
            disabled={isRefreshing || checkMutation.isPending}
          >
            {isRefreshing || checkMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {latestCheck ? 'Refresh Eligibility' : 'Verify Eligibility'}
              </>
            )}
          </Button>
        )}

        {checkMutation.error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {checkMutation.error.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Displays eligibility status for all of a patient's active insurances
 */
interface PatientEligibilitySummaryProps {
  patientId: string;
  insurances: Array<{
    id: string;
    type: 'PRIMARY' | 'SECONDARY' | 'TERTIARY';
    payerName?: string | null;
    isActive: boolean;
  }>;
}

export function PatientEligibilitySummary({
  patientId,
  insurances,
}: PatientEligibilitySummaryProps) {
  const activeInsurances = insurances.filter((i) => i.isActive);

  if (activeInsurances.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {activeInsurances.map((insurance) => (
        <PatientEligibilityCard
          key={insurance.id}
          patientId={patientId}
          insuranceId={insurance.id}
          insuranceName={insurance.payerName || undefined}
          insuranceType={insurance.type}
        />
      ))}
    </div>
  );
}
