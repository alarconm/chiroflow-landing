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
} from 'lucide-react';
import Link from 'next/link';

const riskColors = {
  VERY_HIGH: 'bg-red-500 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-black',
  LOW: 'bg-blue-500 text-white',
  VERY_LOW: 'bg-green-500 text-white',
};

const riskLabels = {
  VERY_HIGH: 'Very High Risk',
  HIGH: 'High Risk',
  MEDIUM: 'Medium Risk',
  LOW: 'Low Risk',
  VERY_LOW: 'Very Low Risk',
};

export function ChurnRiskList() {
  const [minRiskLevel, setMinRiskLevel] = useState<'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');

  const { data: churnData, isLoading } = trpc.aiInsights.getChurnPredictions.useQuery(
    { minRiskLevel, limit: 20 },
    { refetchOnWindowFocus: false }
  );

  const { data: counts } = trpc.aiInsights.getChurnCounts.useQuery();

  const updateStatus = trpc.aiInsights.updateChurnStatus.useMutation();

  const handleContact = async (patientId: string) => {
    await updateStatus.mutateAsync({
      patientId,
      status: 'contacted',
      notes: 'Contacted via outreach campaign',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Churn Risk Analysis
          </CardTitle>
          <CardDescription>
            Patients at risk of not returning to your practice
          </CardDescription>
          {counts && (
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-red-600">
                Very High: {counts.veryHigh}
              </span>
              <span className="text-orange-600">
                High: {counts.high}
              </span>
              <span className="text-yellow-600">
                Medium: {counts.medium}
              </span>
            </div>
          )}
        </div>
        <Select
          value={minRiskLevel}
          onValueChange={(v) => setMinRiskLevel(v as typeof minRiskLevel)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="VERY_HIGH">Very High Only</SelectItem>
            <SelectItem value="HIGH">High and Above</SelectItem>
            <SelectItem value="MEDIUM">Medium and Above</SelectItem>
            <SelectItem value="LOW">All Risks</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!churnData || churnData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No patients at risk</p>
            <p className="text-sm">Your patient retention looks healthy</p>
          </div>
        ) : (
          <div className="space-y-4">
            {churnData.map((patient) => (
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
                    </div>

                    <div className="mt-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Risk Score:</span>
                        <Progress value={patient.riskScore} className="w-32 h-2" />
                        <span>{patient.riskScore.toFixed(0)}%</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{patient.daysSinceLastVisit} days since visit</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{patient.totalVisits} total visits</span>
                      </div>
                      {patient.missedAppointments > 0 && (
                        <div className="flex items-center gap-2 text-orange-600">
                          <AlertTriangle className="h-4 w-4" />
                          <span>{patient.missedAppointments} missed</span>
                        </div>
                      )}
                      {patient.outstandingBalance > 0 && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>${patient.outstandingBalance.toFixed(0)} balance</span>
                        </div>
                      )}
                    </div>

                    {/* Top risk factors */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {patient.riskFactors
                        .filter((f) => f.impact === 'negative')
                        .slice(0, 3)
                        .map((factor, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {factor.description}
                          </Badge>
                        ))}
                    </div>

                    <div className="mt-3 p-2 bg-muted rounded text-sm">
                      <strong>Suggested:</strong> {patient.suggestedAction}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleContact(patient.patientId)}
                      disabled={updateStatus.isPending}
                    >
                      <Phone className="h-4 w-4 mr-1" />
                      Call
                    </Button>
                    <Button size="sm" variant="outline">
                      <Mail className="h-4 w-4 mr-1" />
                      Email
                    </Button>
                    <Link href={`/patients/${patient.patientId}`}>
                      <Button size="sm" variant="ghost">
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
  );
}
