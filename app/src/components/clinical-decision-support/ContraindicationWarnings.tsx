'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Check,
  FileText,
  Clock,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ContraindicationWarningsProps {
  patientId: string;
  encounterId?: string;
  procedureToCheck?: string;
  onSafetyCleared?: () => void;
  readOnly?: boolean;
}

const typeConfig = {
  ABSOLUTE: {
    icon: ShieldX,
    color: 'bg-red-100 text-red-800 border-red-300',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    iconColor: 'text-red-600',
    label: 'Absolute',
    description: 'Treatment should NOT proceed',
  },
  RELATIVE: {
    icon: ShieldAlert,
    color: 'bg-orange-100 text-orange-800 border-orange-300',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
    iconColor: 'text-orange-600',
    label: 'Relative',
    description: 'Proceed with caution, may override with documentation',
  },
  PRECAUTION: {
    icon: Shield,
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-300',
    iconColor: 'text-yellow-600',
    label: 'Precaution',
    description: 'Be aware and modify approach if needed',
  },
};

const severityPriority = {
  CRITICAL: 0,
  HIGH: 1,
  MODERATE: 2,
  LOW: 3,
};

export function ContraindicationWarnings({
  patientId,
  encounterId,
  procedureToCheck,
  onSafetyCleared,
  readOnly = false,
}: ContraindicationWarningsProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [selectedContraindicationId, setSelectedContraindicationId] = useState<string | null>(null);
  const [overrideData, setOverrideData] = useState({
    riskAcknowledged: false,
    patientConsent: false,
    alternativesConsidered: '',
    precautionsTaken: '',
  });
  const [safetyResult, setSafetyResult] = useState<{
    safetyStatus: string;
    contraindications: {
      detected: Array<{
        id: string;
        name: string;
        type: string;
        severity: string;
        reason: string;
        recommendation: string;
        overridable: boolean;
      }>;
      existing: Array<{
        id: string;
        procedure: string;
        type: string;
        reason: string;
        source: string | null;
        isOverridden: boolean;
      }>;
    };
  } | null>(null);

  // Get existing contraindications
  const { data: contraindications, refetch } = trpc.aiClinical.getPatientContraindications.useQuery({
    patientId,
    procedureFilter: procedureToCheck,
    includeOverridden: false,
  });

  // Check contraindications mutation
  const checkMutation = trpc.aiClinical.checkContraindications.useMutation({
    onMutate: () => setIsChecking(true),
    onSuccess: (data) => {
      setSafetyResult(data);
      refetch();
      if (data.safetyStatus === 'CLEAR') {
        toast.success('Safety check passed - no contraindications found');
        onSafetyCleared?.();
      } else {
        const totalCount = data.contraindications.detected.length + data.contraindications.existing.length;
        toast.warning(`Safety check: ${totalCount} contraindication(s) found`);
      }
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setIsChecking(false),
  });

  // Override mutation
  const overrideMutation = trpc.aiClinical.overrideContraindication.useMutation({
    onSuccess: () => {
      toast.success('Contraindication override documented');
      refetch();
      setOverrideDialogOpen(false);
      setSelectedContraindicationId(null);
      setOverrideData({
        riskAcknowledged: false,
        patientConsent: false,
        alternativesConsidered: '',
        precautionsTaken: '',
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const handleCheckSafety = useCallback(() => {
    checkMutation.mutate({
      patientId,
      encounterId,
      procedure: procedureToCheck || 'spinal_manipulation',
    });
  }, [patientId, encounterId, procedureToCheck, checkMutation]);

  const handleOverride = useCallback((contraindicationId: string) => {
    setSelectedContraindicationId(contraindicationId);
    setOverrideDialogOpen(true);
  }, []);

  const confirmOverride = useCallback(() => {
    if (!selectedContraindicationId) return;
    if (!overrideData.riskAcknowledged) {
      toast.error('You must acknowledge the risk before proceeding');
      return;
    }
    // Build the reason string from override data
    let reasonParts: string[] = [];
    if (overrideData.alternativesConsidered) {
      reasonParts.push(`Alternatives considered: ${overrideData.alternativesConsidered}`);
    }
    if (overrideData.precautionsTaken) {
      reasonParts.push(`Precautions taken: ${overrideData.precautionsTaken}`);
    }
    const reason = reasonParts.length > 0
      ? reasonParts.join('. ')
      : 'Provider has acknowledged risk and determined benefit outweighs potential harm.';

    overrideMutation.mutate({
      contraindicationId: selectedContraindicationId,
      reason,
      riskAcknowledged: overrideData.riskAcknowledged,
      patientConsent: overrideData.patientConsent,
      alternativesConsidered: overrideData.alternativesConsidered ? [overrideData.alternativesConsidered] : undefined,
      precautionsTaken: overrideData.precautionsTaken ? [overrideData.precautionsTaken] : undefined,
    });
  }, [selectedContraindicationId, overrideData, overrideMutation]);

  // Combine and sort contraindications - convert to unified format
  interface UnifiedContraindication {
    id?: string;
    type: string;
    severity?: string;
    procedure?: string;
    reason: string;
    source?: string | null;
    isOverridden?: boolean;
    recommendation?: string;
    overridable?: boolean;
  }

  const allContraindications: UnifiedContraindication[] = [
    // Existing contraindications from patient record
    ...(contraindications || []).map((c): UnifiedContraindication => ({
      id: c.id,
      type: c.type,
      procedure: c.procedure,
      reason: c.reason,
      source: c.source,
      isOverridden: c.isOverridden,
    })),
    // Detected contraindications from safety check
    ...(safetyResult?.contraindications.detected || []).map((c): UnifiedContraindication => ({
      id: c.id,
      type: c.type,
      severity: c.severity,
      reason: c.reason,
      recommendation: c.recommendation,
      overridable: c.overridable,
    })),
    // Existing from safety result (deduplicated)
    ...(safetyResult?.contraindications.existing || [])
      .filter(c => !contraindications?.some(ec => ec.id === c.id))
      .map((c): UnifiedContraindication => ({
        id: c.id,
        type: c.type,
        procedure: c.procedure,
        reason: c.reason,
        source: c.source,
        isOverridden: c.isOverridden,
      })),
  ].sort((a, b) => {
    const aType = a.type as keyof typeof typeConfig;
    const bType = b.type as keyof typeof typeConfig;
    if (aType === 'ABSOLUTE' && bType !== 'ABSOLUTE') return -1;
    if (bType === 'ABSOLUTE' && aType !== 'ABSOLUTE') return 1;
    const aSeverity = a.severity || 'MODERATE';
    const bSeverity = b.severity || 'MODERATE';
    return (severityPriority[aSeverity as keyof typeof severityPriority] || 3) -
           (severityPriority[bSeverity as keyof typeof severityPriority] || 3);
  });

  const hasAbsolute = allContraindications.some(c => c.type === 'ABSOLUTE');
  const safetyStatus = safetyResult?.safetyStatus || (allContraindications.length > 0 ?
    (hasAbsolute ? 'ABSOLUTE' : 'PRECAUTION') : 'CLEAR');

  return (
    <>
      <Card className={cn(
        hasAbsolute ? 'border-red-300 bg-red-50/50' :
        allContraindications.length > 0 ? 'border-orange-300 bg-orange-50/50' : ''
      )}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              {safetyStatus === 'CLEAR' ? (
                <ShieldCheck className="h-5 w-5 text-green-600" />
              ) : hasAbsolute ? (
                <ShieldX className="h-5 w-5 text-red-600" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-orange-600" />
              )}
              Safety & Contraindications
            </CardTitle>
            {!readOnly && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCheckSafety}
                disabled={isChecking}
              >
                {isChecking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          <CardDescription className="text-xs">
            {safetyStatus === 'CLEAR'
              ? 'No contraindications identified for this patient'
              : 'Review contraindications before proceeding with treatment'}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          {/* Safety Status Banner */}
          {safetyResult && (
            <div className={cn(
              'rounded-lg p-3 mb-4 flex items-center gap-3',
              safetyStatus === 'CLEAR' ? 'bg-green-100 text-green-800' :
              safetyStatus === 'ABSOLUTE' ? 'bg-red-100 text-red-800' :
              'bg-orange-100 text-orange-800'
            )}>
              {safetyStatus === 'CLEAR' ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
              <div>
                <p className="font-medium">
                  {safetyStatus === 'CLEAR' ? 'Safety Check Passed' :
                   safetyStatus === 'ABSOLUTE' ? 'Treatment Not Recommended' :
                   'Proceed With Caution'}
                </p>
                <p className="text-sm opacity-90">
                  {safetyStatus === 'CLEAR'
                    ? 'No contraindications identified based on patient history'
                    : `${allContraindications.length} contraindication(s) require attention`}
                </p>
              </div>
            </div>
          )}

          {/* Contraindications List */}
          {allContraindications.length > 0 ? (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {allContraindications.map((contra, index) => {
                  const config = typeConfig[contra.type as keyof typeof typeConfig];
                  const Icon = config?.icon || Shield;
                  const isOverridden = 'isOverridden' in contra && contra.isOverridden;

                  return (
                    <div
                      key={contra.id || `new-${index}`}
                      className={cn(
                        'rounded-lg border p-3',
                        isOverridden ? 'opacity-60 bg-gray-50 border-gray-200' :
                        config?.bgColor,
                        config?.borderColor
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <Icon className={cn('h-5 w-5 mt-0.5', config?.iconColor)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge className={config?.color}>
                                {config?.label || contra.type}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {contra.procedure}
                              </Badge>
                              {isOverridden && (
                                <Badge variant="secondary" className="text-xs">
                                  Overridden
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium text-gray-900">
                              {contra.reason}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Source: {contra.source}
                            </p>
                          </div>
                        </div>
                        {!readOnly && !isOverridden && contra.type !== 'ABSOLUTE' && contra.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOverride(contra.id!)}
                            className="shrink-0"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Override
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : !safetyResult ? (
            <div className="text-center py-6">
              <Shield className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-3">
                Run a safety check to identify potential contraindications
              </p>
              {!readOnly && (
                <Button onClick={handleCheckSafety} disabled={isChecking}>
                  {isChecking ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  Check Safety
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <ShieldCheck className="h-10 w-10 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-gray-600">All clear - proceed with treatment</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Override Contraindication
            </DialogTitle>
            <DialogDescription>
              You are about to override a clinical contraindication. This action will be documented
              in the patient record. Please provide the required information.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Risk Acknowledgment */}
            <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
              <Checkbox
                id="riskAcknowledged"
                checked={overrideData.riskAcknowledged}
                onCheckedChange={(checked) =>
                  setOverrideData(d => ({ ...d, riskAcknowledged: checked === true }))
                }
              />
              <label htmlFor="riskAcknowledged" className="text-sm text-gray-700 cursor-pointer">
                <span className="font-medium text-orange-800">Required:</span> I acknowledge the clinical risk
                and have determined that the benefit outweighs the potential harm in this specific case.
              </label>
            </div>

            {/* Patient Consent */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="patientConsent"
                checked={overrideData.patientConsent}
                onCheckedChange={(checked) =>
                  setOverrideData(d => ({ ...d, patientConsent: checked === true }))
                }
              />
              <label htmlFor="patientConsent" className="text-sm text-gray-700 cursor-pointer">
                Patient has been informed of the risk and has given verbal/written consent
              </label>
            </div>

            {/* Alternatives Considered */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Alternatives Considered
              </label>
              <Textarea
                placeholder="What alternatives were considered and why they were not chosen..."
                value={overrideData.alternativesConsidered}
                onChange={(e) =>
                  setOverrideData(d => ({ ...d, alternativesConsidered: e.target.value }))
                }
                rows={2}
              />
            </div>

            {/* Precautions Taken */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Precautions Being Taken
              </label>
              <Textarea
                placeholder="What precautions will be taken to minimize risk..."
                value={overrideData.precautionsTaken}
                onChange={(e) =>
                  setOverrideData(d => ({ ...d, precautionsTaken: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmOverride}
              disabled={!overrideData.riskAcknowledged || overrideMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {overrideMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Document Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
