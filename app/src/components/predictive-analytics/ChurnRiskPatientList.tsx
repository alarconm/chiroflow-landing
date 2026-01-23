'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  AlertTriangle,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

const riskColors: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
  minimal: 'bg-green-500 text-white',
};

const riskLabels: Record<string, string> = {
  critical: 'Critical Risk',
  high: 'High Risk',
  medium: 'Medium Risk',
  low: 'Low Risk',
  minimal: 'Minimal Risk',
};

export function ChurnRiskPatientList() {
  const [minRiskLevel, setMinRiskLevel] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');

  const { data: atRiskPatients, isLoading } = trpc.aiPredict.getAtRiskPatients.useQuery(
    { minRiskLevel, limit: 25 },
    { refetchOnWindowFocus: false }
  );

  const { data: summary } = trpc.aiPredict.getChurnSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const recordIntervention = trpc.aiPredict.recordIntervention.useMutation();

  const handleContact = async (riskScoreId: string, method: string) => {
    await recordIntervention.mutateAsync({
      riskScoreId,
      intervention: `Contacted via ${method}`,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">
                {summary?.byRiskLevel?.critical ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">Critical Risk</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-500">
                {summary?.byRiskLevel?.high ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">High Risk</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600">
                {summary?.byRiskLevel?.medium ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">Medium Risk</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {(summary?.totalPatients ?? 0) - (summary?.atRiskPatients ?? 0)}
              </div>
              <div className="text-sm text-muted-foreground">Healthy Retention</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Patient List */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              At-Risk Patients
            </CardTitle>
            <CardDescription>
              Patients identified as likely to churn based on AI analysis
            </CardDescription>
          </div>
          <Select
            value={minRiskLevel}
            onValueChange={(v) => setMinRiskLevel(v as typeof minRiskLevel)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by risk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical Only</SelectItem>
              <SelectItem value="high">High and Above</SelectItem>
              <SelectItem value="medium">Medium and Above</SelectItem>
              <SelectItem value="low">All Risks</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {!atRiskPatients?.patients || atRiskPatients.patients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No patients at risk</p>
              <p className="text-sm">Your patient retention looks healthy</p>
            </div>
          ) : (
            <div className="space-y-4">
              {atRiskPatients.patients.map((patient) => (
                <div
                  key={patient.patientId}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/patients/${patient.patientId}`}
                          className="font-medium hover:underline"
                        >
                          {patient.patientName}
                        </Link>
                        <Badge className={riskColors[patient.riskLevel]}>
                          {riskLabels[patient.riskLevel]}
                        </Badge>
                        {patient.riskFactors.some((f) => f.trend === 'DECREASING') && (
                          <Badge variant="outline" className="text-red-600">
                            <TrendingDown className="h-3 w-3 mr-1" />
                            Declining
                          </Badge>
                        )}
                      </div>

                      <div className="mt-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Churn Risk:</span>
                          <Progress value={patient.churnProbability} className="w-32 h-2" />
                          <span className="font-medium">{patient.churnProbability.toFixed(0)}%</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{patient.visitPatternChange.daysOverdue} days since visit</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{patient.visitPatternChange.previousPeriodVisits} recent visits</span>
                        </div>
                        {patient.visitPatternChange.changePercent !== 0 && (
                          <div className="flex items-center gap-2 text-orange-600">
                            <AlertTriangle className="h-4 w-4" />
                            <span>{Math.abs(patient.visitPatternChange.changePercent).toFixed(0)}% fewer visits</span>
                          </div>
                        )}
                        {patient.engagementDetails.overallScore < 50 && (
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-muted-foreground" />
                            <span>Low engagement ({patient.engagementDetails.overallScore.toFixed(0)}%)</span>
                          </div>
                        )}
                      </div>

                      {/* Top risk factors */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {patient.topRiskFactors.slice(0, 3).map((factor, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {factor}
                          </Badge>
                        ))}
                      </div>

                      {/* Recommended actions */}
                      {patient.retentionActions.length > 0 && (
                        <div className="mt-3 p-2 bg-muted rounded text-sm">
                          <strong>Suggested:</strong> {patient.retentionActions[0].description}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleContact(patient.patientId, 'phone')}
                        disabled={recordIntervention.isPending}
                      >
                        <Phone className="h-4 w-4 mr-1" />
                        Call
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleContact(patient.patientId, 'email')}
                        disabled={recordIntervention.isPending}
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Email
                      </Button>
                      <Link href={`/patients/${patient.patientId}`}>
                        <Button size="sm" variant="ghost" className="w-full">
                          View <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
