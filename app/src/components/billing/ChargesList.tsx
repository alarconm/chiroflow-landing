'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { FileText, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ChargeItem = {
  id: string;
  patientId: string;
  serviceDate: Date;
  cptCode: string;
  description: string | null;
  units: number;
  fee: number | string;
  insurancePolicyId: string | null;
  patient: {
    demographics: {
      firstName: string;
      lastName: string;
    } | null;
  };
};

export function ChargesList() {
  const [selectedCharges, setSelectedCharges] = useState<string[]>([]);
  const { toast } = useToast();

  const { data, isLoading } = trpc.charge.list.useQuery({
    unbilledOnly: true,
    page: 1,
    limit: 50,
  });
  const utils = trpc.useUtils();

  const createClaim = trpc.claim.create.useMutation({
    onSuccess: () => {
      utils.charge.list.invalidate();
      utils.claim.list.invalidate();
      setSelectedCharges([]);
      toast({
        title: 'Claim created',
        description: 'A new claim has been created from the selected charges.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const charges = (data?.charges || []) as unknown as ChargeItem[];

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCharges(charges.map((c) => c.id));
    } else {
      setSelectedCharges([]);
    }
  };

  const handleSelectCharge = (chargeId: string, checked: boolean) => {
    if (checked) {
      setSelectedCharges((prev) => [...prev, chargeId]);
    } else {
      setSelectedCharges((prev) => prev.filter((id) => id !== chargeId));
    }
  };

  const handleCreateClaim = () => {
    if (selectedCharges.length === 0) return;

    const chargeData = charges.filter((c) => selectedCharges.includes(c.id));
    const firstCharge = chargeData[0];

    if (!firstCharge?.insurancePolicyId) {
      toast({
        title: 'Cannot create claim',
        description: 'Selected charges must have insurance information',
        variant: 'destructive',
      });
      return;
    }

    createClaim.mutate({
      patientId: firstCharge.patientId,
      insurancePolicyId: firstCharge.insurancePolicyId,
      chargeIds: selectedCharges,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unbilled Charges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Unbilled Charges</CardTitle>
            <CardDescription>
              {charges.length} charge{charges.length !== 1 ? 's' : ''} ready to bill
            </CardDescription>
          </div>
          {selectedCharges.length > 0 && (
            <Button onClick={handleCreateClaim} disabled={createClaim.isPending}>
              <FileText className="mr-2 h-4 w-4" />
              Create Claim ({selectedCharges.length})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedCharges.length === charges.length && charges.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>CPT</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {charges.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-8 w-8" />
                    <p>No unbilled charges</p>
                    <p className="text-sm">All charges have been billed or are pending</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              charges.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedCharges.includes(charge.id)}
                      onCheckedChange={(checked) =>
                        handleSelectCharge(charge.id, checked as boolean)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {format(new Date(charge.serviceDate), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="font-medium">
                    {charge.patient.demographics
                      ? `${charge.patient.demographics.lastName}, ${charge.patient.demographics.firstName}`
                      : 'Patient'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{charge.cptCode}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{charge.description || '-'}</TableCell>
                  <TableCell className="text-right">{charge.units}</TableCell>
                  <TableCell className="text-right">
                    ${Number(charge.fee).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${(Number(charge.fee) * charge.units).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
