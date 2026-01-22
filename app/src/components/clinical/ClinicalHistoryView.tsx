'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format, subMonths, startOfDay, endOfDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar,
  FileText,
  Stethoscope,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  ChevronRight,
  Clock,
  User,
  Loader2,
  Download,
  BarChart3,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ClinicalHistoryViewProps {
  patientId: string;
}

const encounterTypeLabels: Record<string, string> = {
  INITIAL_EVAL: 'Initial Evaluation',
  FOLLOW_UP: 'Follow-up',
  RE_EVALUATION: 'Re-evaluation',
  DISCHARGE: 'Discharge',
  MAINTENANCE: 'Maintenance',
  ACUTE: 'Acute',
};

const statusColors: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-green-100 text-green-800',
  SIGNED: 'bg-purple-100 text-purple-800',
  AMENDED: 'bg-orange-100 text-orange-800',
};

export function ClinicalHistoryView({ patientId }: ClinicalHistoryViewProps) {
  const [activeTab, setActiveTab] = useState('timeline');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>(
    format(subMonths(new Date(), 12), 'yyyy-MM-dd')
  );
  const [dateTo, setDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Fetch encounters
  const { data: encountersData, isLoading: loadingEncounters } = trpc.encounter.list.useQuery({
    patientId,
    startDate: dateFrom ? startOfDay(new Date(dateFrom)) : undefined,
    endDate: dateTo ? endOfDay(new Date(dateTo)) : undefined,
    encounterType: filterType !== 'all' ? filterType as 'INITIAL_EVAL' | 'FOLLOW_UP' | 'RE_EVALUATION' | 'DISCHARGE' : undefined,
    status: filterStatus !== 'all' ? filterStatus as 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'SIGNED' | 'AMENDED' : undefined,
    limit: 100,
    sortOrder: 'desc',
  });

  // Fetch treatment plans
  const { data: treatmentPlans, isLoading: loadingPlans } = trpc.treatmentPlan.getByPatient.useQuery({
    patientId,
    includeInactive: true,
  });

  // Fetch assessment history
  const { data: assessmentHistory, isLoading: loadingAssessments } = trpc.assessment.getHistory.useQuery({
    patientId,
    limit: 50,
  });

  // Fetch all diagnoses for patient
  const { data: diagnosisHistory } = trpc.diagnosis.getPatientHistory.useQuery({
    patientId,
  });

  const encounters = encountersData?.encounters || [];

  // Group encounters by month for timeline
  const encountersByMonth = useMemo(() => {
    const groups: Record<string, typeof encounters> = {};
    encounters.forEach((encounter) => {
      const monthKey = format(new Date(encounter.encounterDate), 'MMMM yyyy');
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(encounter);
    });
    return groups;
  }, [encounters]);

  // Calculate assessment trends
  const assessmentTrends = useMemo(() => {
    if (!assessmentHistory?.assessments) return [];

    const byType: Record<string, { date: Date; score: number }[]> = {};
    assessmentHistory.assessments.forEach((a) => {
      if (!byType[a.assessmentType]) {
        byType[a.assessmentType] = [];
      }
      if (a.rawScore !== null) {
        byType[a.assessmentType].push({
          date: new Date(a.administeredAt),
          score: Number(a.rawScore),
        });
      }
    });

    return Object.entries(byType).map(([type, scores]) => {
      const sorted = scores.sort((a, b) => a.date.getTime() - b.date.getTime());
      const latest = sorted[sorted.length - 1]?.score;
      const first = sorted[0]?.score;
      const trend = latest !== undefined && first !== undefined ? latest - first : 0;
      return {
        type,
        scores: sorted,
        latestScore: latest,
        trend,
      };
    });
  }, [assessmentHistory]);

  const handleExportPDF = () => {
    toast.info('PDF export coming soon');
  };

  const isLoading = loadingEncounters || loadingPlans || loadingAssessments;

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-[#053e67]/50" />
                Clinical History
              </CardTitle>
              <CardDescription>
                Comprehensive view of encounters, treatment plans, and outcomes
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleExportPDF}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Filter className="h-4 w-4" />
              Filters:
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="INITIAL_EVAL">Initial Eval</SelectItem>
                  <SelectItem value="FOLLOW_UP">Follow-up</SelectItem>
                  <SelectItem value="RE_EVALUATION">Re-evaluation</SelectItem>
                  <SelectItem value="DISCHARGE">Discharge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="SIGNED">Signed</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[140px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[140px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Treatment Plans
          </TabsTrigger>
          <TabsTrigger value="assessments" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Assessments
          </TabsTrigger>
          <TabsTrigger value="diagnoses" className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            Diagnoses
          </TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : encounters.length > 0 ? (
            <div className="space-y-6">
              {Object.entries(encountersByMonth).map(([month, monthEncounters]) => (
                <div key={month}>
                  <h3 className="text-sm font-medium text-gray-500 mb-3">{month}</h3>
                  <div className="space-y-3">
                    {monthEncounters.map((encounter) => (
                      <Link
                        key={encounter.id}
                        href={`/patients/${patientId}/encounters/${encounter.id}`}
                      >
                        <Card className="hover:shadow-md transition-shadow cursor-pointer">
                          <CardContent className="py-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-full bg-[#053e67]/10 flex items-center justify-center">
                                  <FileText className="h-5 w-5 text-[#053e67]" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium">
                                      {encounterTypeLabels[encounter.encounterType] || encounter.encounterType}
                                    </p>
                                    <Badge className={cn('text-xs', statusColors[encounter.status])}>
                                      {encounter.status}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-3 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {format(new Date(encounter.encounterDate), 'MMM d, yyyy')}
                                    </span>
                                    {encounter.provider && (
                                      <span className="flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        Dr. {(encounter.provider as { user?: { lastName: string } }).user?.lastName || 'Provider'}
                                      </span>
                                    )}
                                  </div>
                                  {encounter.chiefComplaint && (
                                    <p className="text-sm text-gray-600 mt-1 line-clamp-1">
                                      {encounter.chiefComplaint}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="h-5 w-5 text-gray-400" />
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No encounters found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Treatment Plans Tab */}
        <TabsContent value="plans" className="space-y-4">
          {loadingPlans ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : treatmentPlans && treatmentPlans.length > 0 ? (
            <div className="space-y-4">
              {treatmentPlans.map((plan) => {
                const plannedVisits = plan.plannedVisits ?? 0;
                const completedVisits = plan.completedVisits ?? 0;
                const progress = plannedVisits > 0
                  ? Math.round((completedVisits / plannedVisits) * 100)
                  : 0;

                return (
                  <Card key={plan.id}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium">{plan.name}</h4>
                            <Badge
                              variant={plan.status === 'ACTIVE' ? 'default' : 'secondary'}
                              className={plan.status === 'ACTIVE' ? 'bg-green-500' : ''}
                            >
                              {plan.status}
                            </Badge>
                          </div>
                          {plan.description && (
                            <p className="text-sm text-gray-600 mb-3">{plan.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                            <span>
                              Started: {format(new Date(plan.startDate), 'MMM d, yyyy')}
                            </span>
                            {plan.endDate && (
                              <span>
                                Ends: {format(new Date(plan.endDate), 'MMM d, yyyy')}
                              </span>
                            )}
                            <span>Frequency: {plan.frequency}</span>
                          </div>
                          {/* Progress bar */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Visit Progress</span>
                              <span className="font-medium">
                                {completedVisits} / {plannedVisits} visits
                              </span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#053e67]/50 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center">
                <Target className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No treatment plans found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Assessments Tab */}
        <TabsContent value="assessments" className="space-y-4">
          {loadingAssessments ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : assessmentTrends.length > 0 ? (
            <div className="space-y-4">
              {/* Trend cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {assessmentTrends.map(({ type, latestScore, trend, scores }) => {
                  const TrendIcon = trend < 0 ? TrendingDown : trend > 0 ? TrendingUp : Minus;
                  const trendColor = trend < 0 ? 'text-green-500' : trend > 0 ? 'text-red-500' : 'text-gray-400';

                  return (
                    <Card key={type}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm text-gray-500">{type}</p>
                            <p className="text-3xl font-bold mt-1">
                              {latestScore?.toFixed(1) ?? '-'}
                            </p>
                          </div>
                          <div className={cn('flex items-center gap-1', trendColor)}>
                            <TrendIcon className="h-5 w-5" />
                            <span className="text-sm font-medium">
                              {Math.abs(trend).toFixed(1)}
                            </span>
                          </div>
                        </div>
                        {/* Mini sparkline representation */}
                        <div className="mt-4 h-8 flex items-end gap-1">
                          {scores.slice(-10).map((s, i) => (
                            <div
                              key={i}
                              className="flex-1 bg-[#053e67]/20 rounded-t"
                              style={{
                                height: `${(s.score / 10) * 100}%`,
                                minHeight: '4px',
                              }}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          {scores.length} assessments recorded
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Full assessment list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Assessment History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {assessmentHistory?.assessments.slice(0, 20).map((assessment) => (
                      <div
                        key={assessment.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-center min-w-[50px]">
                            <p className="text-xl font-bold text-gray-900">
                              {assessment.rawScore ? Number(assessment.rawScore).toFixed(0) : '-'}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium">{assessment.assessmentType}</p>
                            <p className="text-sm text-gray-500">
                              {format(new Date(assessment.administeredAt), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                        {assessment.interpretation && (
                          <Badge variant="outline">{assessment.interpretation}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center">
                <TrendingUp className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No assessments recorded</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Diagnoses Tab */}
        <TabsContent value="diagnoses" className="space-y-4">
          {diagnosisHistory?.diagnoses && diagnosisHistory.diagnoses.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Diagnosis History</CardTitle>
                <CardDescription>
                  All diagnoses across encounters with onset dates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {diagnosisHistory.diagnoses.map((dx) => (
                    <div
                      key={dx.id}
                      className="flex items-start justify-between py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                          {dx.icd10Code}
                        </div>
                        <div>
                          <p className="font-medium">{dx.description}</p>
                          <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                            {dx.onsetDate && (
                              <span>Onset: {format(new Date(dx.onsetDate), 'MMM d, yyyy')}</span>
                            )}
                            <span>
                              Documented: {format(new Date(dx.createdAt), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {dx.isPrimary && (
                          <Badge variant="secondary">Primary</Badge>
                        )}
                        <Badge
                          variant={dx.status === 'ACTIVE' ? 'default' : 'outline'}
                          className={dx.status === 'ACTIVE' ? 'bg-green-500' : ''}
                        >
                          {dx.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10 text-center">
                <Stethoscope className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No diagnoses recorded</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
