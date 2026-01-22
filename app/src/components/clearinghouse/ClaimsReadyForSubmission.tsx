'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2,
  RefreshCw,
  Send,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ClaimStatus } from '@prisma/client';

interface ClaimsReadyForSubmissionProps {
  onSubmitComplete?: () => void;
}

export function ClaimsReadyForSubmission({ onSubmitComplete }: ClaimsReadyForSubmissionProps) {
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set());
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [submitResults, setSubmitResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const utils = trpc.useUtils();

  const { data: claims, isLoading, refetch } = trpc.claim.getPending.useQuery({ limit: 50 });

  const submitMutation = trpc.clearinghouse.submitClaimBatch.useMutation({
    onSuccess: (data) => {
      // Extract errors from failed results
      const errors = data.results
        .filter((r) => !r.success && r.error)
        .map((r) => r.error as string);
      setSubmitResults({
        success: data.submittedClaims,
        failed: data.failedClaims,
        errors,
      });
      setSelectedClaims(new Set());
      utils.claim.getPending.invalidate();
      utils.clearinghouse.listSubmissions.invalidate();
      onSubmitComplete?.();
    },
    onError: (error) => {
      setSubmitResults({
        success: 0,
        failed: selectedClaims.size,
        errors: [error.message],
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked && claims) {
      setSelectedClaims(new Set(claims.map((c) => c.id)));
    } else {
      setSelectedClaims(new Set());
    }
  };

  const handleSelectClaim = (claimId: string, checked: boolean) => {
    const newSelected = new Set(selectedClaims);
    if (checked) {
      newSelected.add(claimId);
    } else {
      newSelected.delete(claimId);
    }
    setSelectedClaims(newSelected);
  };

  const handleSubmitSelected = () => {
    if (selectedClaims.size === 0) return;
    setIsSubmitDialogOpen(true);
  };

  const confirmSubmit = () => {
    setIsSubmitDialogOpen(false);
    setSubmitResults(null);
    submitMutation.mutate({ claimIds: Array.from(selectedClaims) });
  };

  const getStatusBadge = (status: ClaimStatus) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="outline">Draft</Badge>;
      case 'READY':
        return <Badge className="bg-blue-500">Ready</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Claims Ready for Submission
            </CardTitle>
            <CardDescription>
              Select claims to submit electronically to the clearinghouse
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {selectedClaims.size > 0 && (
              <Button
                onClick={handleSubmitSelected}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit {selectedClaims.size} Claim{selectedClaims.size !== 1 ? 's' : ''}
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !claims || claims.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-medium">All Caught Up!</h3>
            <p className="text-sm text-muted-foreground max-w-md mt-2">
              No claims are waiting to be submitted. Create claims from patient encounters to see
              them here.
            </p>
          </div>
        ) : (
          <>
            {/* Submit Results Alert */}
            {submitResults && (
              <div
                className={`mb-4 p-4 rounded-lg ${
                  submitResults.failed > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {submitResults.failed > 0 ? (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                  <span className="font-medium">
                    {submitResults.success} claim{submitResults.success !== 1 ? 's' : ''} submitted
                    successfully
                    {submitResults.failed > 0 &&
                      `, ${submitResults.failed} failed`}
                  </span>
                </div>
                {submitResults.errors.length > 0 && (
                  <ul className="mt-2 text-sm text-red-600 list-disc list-inside">
                    {submitResults.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={claims.length > 0 && selectedClaims.size === claims.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Claim #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Lines</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                  <TableRow
                    key={claim.id}
                    className={selectedClaims.has(claim.id) ? 'bg-muted/50' : ''}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedClaims.has(claim.id)}
                        onCheckedChange={(checked) =>
                          handleSelectClaim(claim.id, checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell>{getStatusBadge(claim.status)}</TableCell>
                    <TableCell className="font-mono">{claim.claimNumber}</TableCell>
                    <TableCell>
                      {claim.patient.demographics
                        ? `${claim.patient.demographics.firstName} ${claim.patient.demographics.lastName}`
                        : '-'}
                    </TableCell>
                    <TableCell>{claim.payer?.name || '-'}</TableCell>
                    <TableCell>
                      {claim.createdDate
                        ? format(new Date(claim.createdDate), 'MM/dd/yyyy')
                        : claim.createdAt
                          ? format(new Date(claim.createdAt), 'MM/dd/yyyy')
                          : '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(claim.totalCharges))}
                    </TableCell>
                    <TableCell>{claim._count.claimLines}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 text-sm text-muted-foreground">
              {claims.length} claim{claims.length !== 1 ? 's' : ''} pending submission
            </div>
          </>
        )}
      </CardContent>

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Claims to Clearinghouse?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to submit {selectedClaims.size} claim
              {selectedClaims.size !== 1 ? 's' : ''} electronically. This action will transmit the
              claims to the clearinghouse for processing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmit}>
              <Send className="h-4 w-4 mr-2" />
              Submit Claims
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
