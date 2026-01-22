'use client';

import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Shield, Plus, Pencil, Check, X } from 'lucide-react';

interface PatientInsuranceProps {
  patientId: string;
}

type InsurancePolicy = {
  id: string;
  type: string;
  payerName: string | null;
  policyNumber: string;
  groupNumber: string | null;
  planName: string | null;
  subscriberFirstName: string | null;
  subscriberLastName: string | null;
  subscriberRelationship: string | null;
  effectiveDate: Date | null;
  terminationDate: Date | null;
  copay: number | string | null;
  isActive: boolean;
  isVerified: boolean;
  verifiedDate: Date | null;
  insurancePayer: {
    name: string;
  } | null;
};

export function PatientInsurance({ patientId }: PatientInsuranceProps) {
  const { data: insurances, isLoading } = trpc.insurancePolicy.list.useQuery({ patientId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Insurance Policies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const policies = (insurances || []) as unknown as InsurancePolicy[];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Insurance Policies</CardTitle>
            <CardDescription>Manage patient insurance information</CardDescription>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Policy
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {policies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No insurance policies on file</p>
            <p className="text-sm">Add a policy to enable insurance billing</p>
          </div>
        ) : (
          <div className="space-y-4">
            {policies.map((policy) => (
              <Card key={policy.id} className="border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">
                          {policy.insurancePayer?.name || policy.payerName || 'Unknown Payer'}
                        </h4>
                        <Badge variant={policy.type === 'PRIMARY' ? 'default' : 'secondary'}>
                          {policy.type}
                        </Badge>
                        {policy.isActive ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {policy.planName}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Policy Number</p>
                      <p className="font-medium">{policy.policyNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Group Number</p>
                      <p className="font-medium">{policy.groupNumber || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Copay</p>
                      <p className="font-medium">
                        {policy.copay ? `$${Number(policy.copay).toFixed(2)}` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Subscriber</p>
                      <p className="font-medium">
                        {policy.subscriberRelationship === 'SELF'
                          ? 'Self'
                          : `${policy.subscriberFirstName || ''} ${policy.subscriberLastName || ''}`.trim() || '-'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                    <div className="flex items-center gap-1 text-sm">
                      {policy.isVerified ? (
                        <>
                          <Check className="h-4 w-4 text-green-500" />
                          <span className="text-green-600">
                            Verified {policy.verifiedDate && format(new Date(policy.verifiedDate), 'MMM d, yyyy')}
                          </span>
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 text-yellow-500" />
                          <span className="text-yellow-600">Not verified</span>
                        </>
                      )}
                    </div>
                    {policy.effectiveDate && (
                      <span className="text-sm text-muted-foreground">
                        Effective: {format(new Date(policy.effectiveDate), 'MMM d, yyyy')}
                        {policy.terminationDate && (
                          <> - {format(new Date(policy.terminationDate), 'MMM d, yyyy')}</>
                        )}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
