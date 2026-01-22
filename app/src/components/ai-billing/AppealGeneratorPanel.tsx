'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  Wand2,
  Send,
  Copy,
  CheckCircle,
  Clock,
  Loader2,
  FileCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Type for denial from router query (getDenialsForAppeal includes claim relation)
interface DenialFromRouter {
  id: string;
  denialCode: string | null;
  denialReason: string | null;
  deniedAmount: number | { toNumber(): number } | null;
  status: string;
  claim?: {
    id: string;
    claimNumber: string | null;
    patient?: {
      demographics?: {
        firstName: string;
        lastName: string;
      } | null;
    };
    insurancePolicy?: {
      payer?: {
        name: string;
      } | null;
    } | null;
  } | null;
}

interface Denial {
  id: string;
  denialCode: string | null;
  denialReason: string | null;
  amount: number;
  status: string;
  claim: {
    id: string;
    claimNumber: string | null;
    patient: {
      demographics: {
        firstName: string;
        lastName: string;
      } | null;
    };
    insurancePolicy: {
      payer: {
        name: string;
      } | null;
    } | null;
  };
}

interface AppealLetter {
  id: string;
  subject: string;
  body: string;
  appealType: string | null;
  denialCode: string | null;
  denialReason: string | null;
  templateName: string | null;
  status: string;
  recommendedDocs: string[] | null;
}

export function AppealGeneratorPanel() {
  const [selectedDenial, setSelectedDenial] = useState<Denial | null>(null);
  const [appealLetter, setAppealLetter] = useState<AppealLetter | null>(null);
  const [appealType, setAppealType] = useState<'FIRST_LEVEL' | 'SECOND_LEVEL' | 'EXTERNAL'>('FIRST_LEVEL');
  const [copied, setCopied] = useState(false);

  const { data: denials, isLoading, refetch } = trpc.aiBilling.getDenialsForAppeal.useQuery({
    limit: 20,
  });

  const generateMutation = trpc.aiBilling.generateAppeal.useMutation({
    onSuccess: (data) => {
      setAppealLetter(data as unknown as AppealLetter);
      refetch();
    },
  });

  const updateStatusMutation = trpc.aiBilling.updateAppealStatus.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleGenerate = async (denial: Denial) => {
    setSelectedDenial(denial);
    setAppealLetter(null);
    await generateMutation.mutateAsync({
      denialId: denial.id,
      appealType,
      includeClinicSupport: true,
    });
  };

  const handleCopy = () => {
    if (appealLetter) {
      navigator.clipboard.writeText(appealLetter.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleMarkSent = async () => {
    if (appealLetter) {
      await updateStatusMutation.mutateAsync({
        appealId: appealLetter.id,
        status: 'SENT',
      });
      setAppealLetter(null);
      setSelectedDenial(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline">Pending</Badge>;
      case 'UNDER_REVIEW':
        return <Badge className="bg-blue-500">Under Review</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Appeal Generator
          </CardTitle>
          <CardDescription>
            Generate professional appeal letters for denied claims
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Appeal Type Selector */}
          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block">Appeal Type</label>
            <Select value={appealType} onValueChange={(v) => setAppealType(v as typeof appealType)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select appeal type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIRST_LEVEL">First Level Appeal</SelectItem>
                <SelectItem value="SECOND_LEVEL">Second Level Appeal</SelectItem>
                <SelectItem value="EXTERNAL">External Review</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {denials && denials.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {(denials as DenialFromRouter[]).map((denial) => {
                  const denialAmount = denial.deniedAmount
                    ? (typeof denial.deniedAmount === 'number' ? denial.deniedAmount : denial.deniedAmount.toNumber())
                    : 0;
                  return (
                    <div
                      key={denial.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {denial.claim?.patient?.demographics?.lastName},{' '}
                            {denial.claim?.patient?.demographics?.firstName}
                          </span>
                          {getStatusBadge(denial.status)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {denial.claim?.insurancePolicy?.payer?.name || 'Unknown Payer'}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline">Code: {denial.denialCode || 'N/A'}</Badge>
                          <span className="text-sm">${denialAmount.toFixed(2)}</span>
                        </div>
                        {denial.denialReason && (
                          <p className="text-sm text-red-600 mt-1 truncate max-w-md">
                            {denial.denialReason}
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={() => handleGenerate(denial as unknown as Denial)}
                        disabled={generateMutation.isPending && selectedDenial?.id === denial.id}
                      >
                        {generateMutation.isPending && selectedDenial?.id === denial.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4 mr-1" />
                            Generate
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileCheck className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">No denials awaiting appeal</p>
              <p className="text-sm">Denials will appear here when they need attention.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appeal Letter Dialog */}
      <Dialog open={!!appealLetter} onOpenChange={() => setAppealLetter(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Generated Appeal Letter
            </DialogTitle>
            <DialogDescription>
              Review and customize the appeal letter before sending
            </DialogDescription>
          </DialogHeader>

          {appealLetter && (
            <div className="space-y-4">
              {/* Header Info */}
              <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-4">
                  <Badge>{appealLetter.appealType || 'Appeal'}</Badge>
                  <span className="text-sm text-muted-foreground">
                    Template: {appealLetter.templateName}
                  </span>
                </div>
                <Badge variant="outline">{appealLetter.status}</Badge>
              </div>

              {/* Subject */}
              <div>
                <label className="text-sm font-medium">Subject</label>
                <p className="p-2 border rounded-lg bg-muted/30 mt-1">
                  {appealLetter.subject}
                </p>
              </div>

              {/* Body */}
              <div>
                <label className="text-sm font-medium">Letter Body</label>
                <Textarea
                  value={appealLetter.body}
                  className="min-h-[400px] font-mono text-sm mt-1"
                  readOnly
                />
              </div>

              {/* Recommended Documents */}
              {appealLetter.recommendedDocs && (appealLetter.recommendedDocs as string[]).length > 0 && (
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Recommended Supporting Documents
                  </label>
                  <ul className="mt-2 space-y-1">
                    {(appealLetter.recommendedDocs as string[]).map((doc, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        {doc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy to Clipboard
                    </>
                  )}
                </Button>
                <Button onClick={handleMarkSent} disabled={updateStatusMutation.isPending}>
                  {updateStatusMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" />
                      Mark as Sent
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
