'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  TrendingUp,
  Info,
  CheckCircle,
  Lightbulb,
  ChevronRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RiskFactor {
  factor: string;
  weight: number;
  description: string;
  value?: string | number;
}

// Type for prediction from router query
interface PredictionFromRouter {
  id: string;
  riskLevel: string;
  riskScore: number;
  confidenceScore: number;
  primaryReason: string | null;
  riskFactors: unknown;
  historicalDenialRate: number | null;
  payerDenialRate: number | null;
  recommendations: unknown;
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

interface DenialPrediction {
  id: string;
  riskLevel: string;
  riskScore: number;
  confidenceScore: number;
  primaryReason: string | null;
  riskFactors: RiskFactor[] | null;
  historicalDenialRate: number | null;
  payerDenialRate: number | null;
  recommendations: string[] | null;
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

export function DenialPredictionPanel() {
  const [selectedPrediction, setSelectedPrediction] = useState<DenialPrediction | null>(null);

  const { data: highRiskClaims, isLoading } = trpc.aiBilling.getHighRiskClaims.useQuery({
    minRiskScore: 40,
    limit: 20,
  });

  const getRiskBadge = (riskLevel: string) => {
    switch (riskLevel) {
      case 'CRITICAL':
        return <Badge variant="destructive">Critical</Badge>;
      case 'HIGH':
        return <Badge className="bg-orange-500">High</Badge>;
      case 'MEDIUM':
        return <Badge className="bg-yellow-500 text-white">Medium</Badge>;
      case 'LOW':
        return <Badge className="bg-green-500">Low</Badge>;
      default:
        return <Badge variant="outline">{riskLevel}</Badge>;
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'bg-red-500';
    if (score >= 50) return 'bg-orange-500';
    if (score >= 25) return 'bg-yellow-500';
    return 'bg-green-500';
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
            <AlertTriangle className="h-5 w-5" />
            Denial Risk Predictions
          </CardTitle>
          <CardDescription>
            AI-powered analysis of claims likely to be denied
          </CardDescription>
        </CardHeader>
        <CardContent>
          {highRiskClaims && highRiskClaims.length > 0 ? (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {(highRiskClaims as PredictionFromRouter[]).map((prediction) => (
                  <div
                    key={prediction.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedPrediction(prediction as unknown as DenialPrediction)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {prediction.claim?.patient?.demographics?.lastName},{' '}
                          {prediction.claim?.patient?.demographics?.firstName}
                        </span>
                        {getRiskBadge(prediction.riskLevel)}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {prediction.claim?.insurancePolicy?.payer?.name || 'Unknown Payer'}
                      </div>
                      {prediction.primaryReason && (
                        <div className="text-sm mt-1 text-orange-600">
                          {prediction.primaryReason}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold">{prediction.riskScore}%</div>
                        <div className="text-xs text-muted-foreground">Risk Score</div>
                      </div>
                      <Progress
                        value={prediction.riskScore}
                        className={`w-16 h-2 ${getRiskColor(prediction.riskScore)}`}
                      />
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">No high-risk claims detected</p>
              <p className="text-sm">All current claims have low denial risk.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prediction Details Dialog */}
      <Dialog open={!!selectedPrediction} onOpenChange={() => setSelectedPrediction(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Denial Risk Analysis
            </DialogTitle>
            <DialogDescription>
              Detailed breakdown of denial risk factors
            </DialogDescription>
          </DialogHeader>

          {selectedPrediction && (
            <div className="space-y-6">
              {/* Risk Score Summary */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Patient</p>
                  <p className="font-medium">
                    {selectedPrediction.claim?.patient?.demographics?.lastName},{' '}
                    {selectedPrediction.claim?.patient?.demographics?.firstName}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedPrediction.claim?.insurancePolicy?.payer?.name || 'Unknown Payer'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold">{selectedPrediction.riskScore}%</div>
                  {getRiskBadge(selectedPrediction.riskLevel)}
                  <p className="text-xs text-muted-foreground mt-1">
                    Confidence: {Math.round(selectedPrediction.confidenceScore * 100)}%
                  </p>
                </div>
              </div>

              {/* Primary Reason */}
              {selectedPrediction.primaryReason && (
                <div className="p-4 border rounded-lg bg-orange-50 dark:bg-orange-950/20">
                  <p className="text-sm font-medium text-orange-600">Primary Risk Factor</p>
                  <p className="mt-1">{selectedPrediction.primaryReason}</p>
                </div>
              )}

              {/* Historical Rates */}
              <div className="grid grid-cols-2 gap-4">
                {selectedPrediction.historicalDenialRate !== null && (
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Historical Denial Rate</p>
                    <p className="text-2xl font-bold">{selectedPrediction.historicalDenialRate}%</p>
                    <p className="text-xs text-muted-foreground">For similar claims</p>
                  </div>
                )}
                {selectedPrediction.payerDenialRate !== null && (
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Payer Denial Rate</p>
                    <p className="text-2xl font-bold">{selectedPrediction.payerDenialRate}%</p>
                    <p className="text-xs text-muted-foreground">This payer overall</p>
                  </div>
                )}
              </div>

              {/* Risk Factors */}
              {selectedPrediction.riskFactors && selectedPrediction.riskFactors.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Risk Factors
                  </h4>
                  <div className="space-y-2">
                    {(selectedPrediction.riskFactors as RiskFactor[]).map((factor, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{factor.factor.replace(/_/g, ' ')}</p>
                          <p className="text-sm text-muted-foreground">{factor.description}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">{Math.round(factor.weight * 100)}%</Badge>
                          {factor.value && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Value: {String(factor.value)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {selectedPrediction.recommendations && (selectedPrediction.recommendations as string[]).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Recommendations
                  </h4>
                  <div className="space-y-2">
                    {(selectedPrediction.recommendations as string[]).map((rec, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                        <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                        <p className="text-sm">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
