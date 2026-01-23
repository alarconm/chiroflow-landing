'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  Check,
  X,
  Bell,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ClinicalAlertPanelProps {
  patientId: string;
  encounterId?: string;
  readOnly?: boolean;
  compact?: boolean;
}

const severityConfig = {
  CRITICAL: {
    icon: AlertOctagon,
    color: 'bg-red-100 text-red-800 border-red-300',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    iconColor: 'text-red-600',
    label: 'Critical',
  },
  HIGH: {
    icon: AlertTriangle,
    color: 'bg-orange-100 text-orange-800 border-orange-300',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
    iconColor: 'text-orange-600',
    label: 'High',
  },
  MODERATE: {
    icon: Bell,
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-300',
    iconColor: 'text-yellow-600',
    label: 'Moderate',
  },
  LOW: {
    icon: Info,
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    iconColor: 'text-blue-600',
    label: 'Low',
  },
};

const alertTypeLabels: Record<string, string> = {
  RED_FLAG: 'Red Flag',
  CONTRAINDICATION: 'Contraindication',
  DRUG_INTERACTION: 'Drug Interaction',
  PRECAUTION: 'Precaution',
  GUIDELINE: 'Guideline Alert',
  OUTCOME_ALERT: 'Outcome Alert',
  REFERRAL_NEEDED: 'Referral Needed',
};

export function ClinicalAlertPanel({
  patientId,
  encounterId,
  readOnly = false,
  compact = false,
}: ClinicalAlertPanelProps) {
  const [expanded, setExpanded] = useState(!compact);
  const [acknowledgeDialogOpen, setAcknowledgeDialogOpen] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [acknowledgeNote, setAcknowledgeNote] = useState('');

  const { data: alerts, refetch, isLoading } = trpc.aiClinical.getPatientAlerts.useQuery({
    patientId,
    encounterId,
    includeAcknowledged: false,
  });

  const acknowledgeMutation = trpc.aiClinical.acknowledgeAlert.useMutation({
    onSuccess: () => {
      toast.success('Alert acknowledged');
      refetch();
      setAcknowledgeDialogOpen(false);
      setSelectedAlertId(null);
      setAcknowledgeNote('');
    },
    onError: (error) => toast.error(error.message),
  });

  const handleAcknowledge = useCallback((alertId: string) => {
    setSelectedAlertId(alertId);
    setAcknowledgeDialogOpen(true);
  }, []);

  const confirmAcknowledge = useCallback(() => {
    if (selectedAlertId) {
      acknowledgeMutation.mutate({
        alertId: selectedAlertId,
        note: acknowledgeNote || undefined,
      });
    }
  }, [selectedAlertId, acknowledgeNote, acknowledgeMutation]);

  const activeAlerts = alerts?.filter((a) => a.status === 'ACTIVE') || [];
  const criticalCount = activeAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const highCount = activeAlerts.filter((a) => a.severity === 'HIGH').length;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (activeAlerts.length === 0) {
    return compact ? null : (
      <Card>
        <CardContent className="py-6 text-center">
          <Check className="h-10 w-10 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No active clinical alerts</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn(
        criticalCount > 0 ? 'border-red-300 bg-red-50/50' :
        highCount > 0 ? 'border-orange-300 bg-orange-50/50' : ''
      )}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className={cn(
                  'h-5 w-5',
                  criticalCount > 0 ? 'text-red-600' : 'text-orange-600'
                )} />
                Clinical Alerts
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {activeAlerts.length} active
              </Badge>
              {criticalCount > 0 && (
                <Badge className="bg-red-600 text-white text-xs">
                  {criticalCount} Critical
                </Badge>
              )}
            </div>
            {compact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          {!compact && (
            <CardDescription>
              Review and address clinical alerts before proceeding with treatment
            </CardDescription>
          )}
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-3 pt-0">
            {activeAlerts.map((alert) => {
              const config = severityConfig[alert.severity as keyof typeof severityConfig];
              const Icon = config.icon;

              return (
                <div
                  key={alert.id}
                  className={cn(
                    'rounded-lg border p-3',
                    config.bgColor,
                    config.borderColor
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <Icon className={cn('h-5 w-5 mt-0.5', config.iconColor)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge className={config.color}>
                            {config.label}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {alertTypeLabels[alert.type] || alert.type}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-gray-900">
                          {alert.message}
                        </p>
                        {alert.recommendation && (
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">Recommendation:</span> {alert.recommendation}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {format(new Date(alert.createdAt), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                    {!readOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAcknowledge(alert.id)}
                        className="shrink-0"
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Acknowledge
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>

      {/* Acknowledge Dialog */}
      <Dialog open={acknowledgeDialogOpen} onOpenChange={setAcknowledgeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge Alert</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Acknowledging this alert indicates you have reviewed and understood the clinical concern.
              Please add any notes about actions taken or reasons for proceeding.
            </p>
            <Textarea
              placeholder="Optional: Add notes about this alert..."
              value={acknowledgeNote}
              onChange={(e) => setAcknowledgeNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAcknowledgeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmAcknowledge}
              disabled={acknowledgeMutation.isPending}
            >
              {acknowledgeMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Acknowledge Alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
