// Clinical Reports - US-105
// Epic 15 - Reports on clinical metrics and outcomes

import { prisma } from '@/lib/prisma';
import {
  TreatmentPlanStatus,
  GoalStatus,
  AssessmentType,
  EncounterStatus,
} from '@prisma/client';
import type { DateRangeFilter } from './types';

// ============================================
// Types for Clinical Reports
// ============================================

export interface DiagnosisFrequencyReport {
  periodStart: Date;
  periodEnd: Date;
  totalDiagnoses: number;
  uniqueDiagnoses: number;
  diagnoses: DiagnosisFrequencyRow[];
  byBodySite: DiagnosisByBodySite[];
  byProvider: DiagnosisByProvider[];
}

export interface DiagnosisFrequencyRow {
  icd10Code: string;
  description: string;
  count: number;
  percentage: number;
  uniquePatients: number;
  isPrimaryCount: number;
  primaryPercentage: number;
}

export interface DiagnosisByBodySite {
  bodySite: string;
  count: number;
  percentage: number;
  topDiagnoses: { icd10Code: string; description: string; count: number }[];
}

export interface DiagnosisByProvider {
  providerId: string;
  providerName: string;
  totalDiagnoses: number;
  uniqueDiagnoses: number;
  topDiagnoses: { icd10Code: string; description: string; count: number }[];
}

export interface TreatmentPlanCompletionReport {
  periodStart: Date;
  periodEnd: Date;
  summary: {
    totalPlans: number;
    activePlans: number;
    completedPlans: number;
    discontinuedPlans: number;
    draftPlans: number;
    expiredPlans: number;
    completionRate: number;
    avgVisitsToCompletion: number;
    avgDaysToCompletion: number;
  };
  byProvider: TreatmentPlanByProvider[];
  byStatus: TreatmentPlanByStatus[];
  goalAchievement: GoalAchievementSummary;
  recentCompletions: RecentCompletedPlan[];
}

export interface TreatmentPlanByProvider {
  providerId: string;
  providerName: string;
  totalPlans: number;
  completedPlans: number;
  completionRate: number;
  avgVisitsToCompletion: number;
  activePatients: number;
}

export interface TreatmentPlanByStatus {
  status: TreatmentPlanStatus;
  statusLabel: string;
  count: number;
  percentage: number;
  avgPlannedVisits: number;
  avgCompletedVisits: number;
}

export interface GoalAchievementSummary {
  totalGoals: number;
  achievedGoals: number;
  partiallyAchievedGoals: number;
  notAchievedGoals: number;
  inProgressGoals: number;
  notStartedGoals: number;
  achievementRate: number;
}

export interface RecentCompletedPlan {
  planId: string;
  planName: string;
  patientId: string;
  patientName: string;
  providerId: string;
  providerName: string;
  startDate: Date;
  endDate: Date;
  plannedVisits: number | null;
  actualVisits: number;
  daysToCompletion: number;
}

export interface AverageVisitsPerCaseReport {
  periodStart: Date;
  periodEnd: Date;
  summary: {
    totalCases: number;
    totalVisits: number;
    avgVisitsPerCase: number;
    medianVisitsPerCase: number;
    minVisits: number;
    maxVisits: number;
  };
  byDiagnosis: VisitsPerCaseByDiagnosis[];
  byProvider: VisitsPerCaseByProvider[];
  distribution: VisitCountBucket[];
  trends: VisitsPerCaseTrend[];
}

export interface VisitsPerCaseByDiagnosis {
  icd10Code: string;
  description: string;
  caseCount: number;
  totalVisits: number;
  avgVisits: number;
  medianVisits: number;
}

export interface VisitsPerCaseByProvider {
  providerId: string;
  providerName: string;
  caseCount: number;
  totalVisits: number;
  avgVisits: number;
  activeCases: number;
  completedCases: number;
}

export interface VisitCountBucket {
  bucketLabel: string;
  minVisits: number;
  maxVisits: number;
  caseCount: number;
  percentage: number;
}

export interface VisitsPerCaseTrend {
  periodLabel: string;
  periodStart: Date;
  caseCount: number;
  avgVisits: number;
}

export interface ProviderCaseMixReport {
  periodStart: Date;
  periodEnd: Date;
  providers: ProviderCaseMix[];
  organizationTotals: {
    totalPatients: number;
    totalEncounters: number;
    uniqueDiagnoses: number;
    avgPatientsPerProvider: number;
    avgEncountersPerProvider: number;
  };
}

export interface ProviderCaseMix {
  providerId: string;
  providerName: string;
  totalPatients: number;
  newPatients: number;
  totalEncounters: number;
  avgEncountersPerPatient: number;
  topDiagnoses: ProviderDiagnosisMix[];
  encounterTypeBreakdown: EncounterTypeBreakdown[];
  patientDemographics: PatientDemographicMix;
}

export interface ProviderDiagnosisMix {
  icd10Code: string;
  description: string;
  patientCount: number;
  encounterCount: number;
  percentage: number;
}

export interface EncounterTypeBreakdown {
  encounterType: string;
  encounterTypeLabel: string;
  count: number;
  percentage: number;
}

export interface PatientDemographicMix {
  avgAge: number | null;
  maleCount: number;
  femaleCount: number;
  otherCount: number;
}

export interface OutcomeTrackingReport {
  periodStart: Date;
  periodEnd: Date;
  summary: {
    totalAssessments: number;
    uniquePatients: number;
    avgImprovement: number;
    improvementRate: number;
    noChangeRate: number;
    worseningRate: number;
  };
  byAssessmentType: OutcomeByAssessmentType[];
  byProvider: OutcomeByProvider[];
  trends: OutcomeTrendPoint[];
  recentAssessments: RecentOutcomeAssessment[];
}

export interface OutcomeByAssessmentType {
  assessmentType: AssessmentType;
  assessmentTypeLabel: string;
  totalAssessments: number;
  patientsWithMultiple: number;
  avgInitialScore: number;
  avgLatestScore: number;
  avgChange: number;
  avgChangePercent: number;
  improvedCount: number;
  noChangeCount: number;
  worsenedCount: number;
}

export interface OutcomeByProvider {
  providerId: string;
  providerName: string;
  totalAssessments: number;
  uniquePatients: number;
  avgImprovement: number;
  improvementRate: number;
}

export interface OutcomeTrendPoint {
  periodLabel: string;
  periodStart: Date;
  assessmentCount: number;
  avgScore: number;
  avgImprovement: number;
}

export interface RecentOutcomeAssessment {
  assessmentId: string;
  patientId: string;
  patientName: string;
  assessmentType: AssessmentType;
  assessmentTypeLabel: string;
  currentScore: number;
  previousScore: number | null;
  changeScore: number | null;
  interpretation: string | null;
  assessedAt: Date;
}

export interface CarePlanAdherenceReport {
  periodStart: Date;
  periodEnd: Date;
  summary: {
    totalActivePlans: number;
    onTrackPlans: number;
    behindSchedulePlans: number;
    aheadOfSchedulePlans: number;
    adherenceRate: number;
    avgCompletionPercentage: number;
  };
  byProvider: AdherenceByProvider[];
  byPatient: PatientAdherenceDetail[];
  trends: AdherenceTrendPoint[];
}

export interface AdherenceByProvider {
  providerId: string;
  providerName: string;
  activePlans: number;
  onTrackCount: number;
  behindCount: number;
  adherenceRate: number;
  avgCompletionPercentage: number;
}

export interface PatientAdherenceDetail {
  patientId: string;
  patientName: string;
  planId: string;
  planName: string;
  providerId: string;
  providerName: string;
  plannedVisits: number | null;
  completedVisits: number;
  expectedVisitsToDate: number;
  completionPercentage: number;
  adherenceStatus: 'on_track' | 'behind' | 'ahead' | 'unknown';
  daysRemaining: number | null;
}

export interface AdherenceTrendPoint {
  periodLabel: string;
  periodStart: Date;
  totalPlans: number;
  onTrackPercentage: number;
  avgCompletionPercentage: number;
}

// ============================================
// Helper functions
// ============================================

function getStatusLabel(status: TreatmentPlanStatus): string {
  const labels: Record<TreatmentPlanStatus, string> = {
    DRAFT: 'Draft',
    ACTIVE: 'Active',
    COMPLETED: 'Completed',
    DISCONTINUED: 'Discontinued',
    EXPIRED: 'Expired',
  };
  return labels[status] || status;
}

function getAssessmentTypeLabel(type: AssessmentType): string {
  const labels: Record<AssessmentType, string> = {
    ODI: 'Oswestry Disability Index',
    NDI: 'Neck Disability Index',
    VAS_PAIN: 'Visual Analog Scale - Pain',
    NPRS: 'Numeric Pain Rating Scale',
    FABQ: 'Fear-Avoidance Beliefs Questionnaire',
    DASH: 'Disabilities of Arm, Shoulder & Hand',
    SF36: 'Short Form 36',
    CUSTOM: 'Custom Assessment',
  };
  return labels[type] || type;
}

function getEncounterTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    INITIAL_EVAL: 'Initial Evaluation',
    FOLLOW_UP: 'Follow-Up',
    RE_EVALUATION: 'Re-Evaluation',
    DISCHARGE: 'Discharge',
    EMERGENCY: 'Emergency',
  };
  return labels[type] || type;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

// ============================================
// Report Functions
// ============================================

/**
 * Diagnosis Frequency Report - Top diagnoses by volume
 */
export async function getDiagnosisFrequencyReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<DiagnosisFrequencyReport> {
  const { start, end } = dateRange;

  // Get all diagnoses within date range via encounters
  const diagnoses = await prisma.diagnosis.findMany({
    where: {
      encounter: {
        provider: { organizationId },
        encounterDate: {
          gte: start,
          lte: end,
        },
        status: {
          in: [EncounterStatus.COMPLETED, EncounterStatus.SIGNED, EncounterStatus.AMENDED],
        },
      },
    },
    include: {
      encounter: {
        include: {
          patient: { include: { demographics: true } },
          provider: { include: { user: true } },
        },
      },
    },
  });

  const totalDiagnoses = diagnoses.length;

  // Group by ICD-10 code
  const diagnosisByCode = new Map<string, {
    description: string;
    count: number;
    patients: Set<string>;
    isPrimaryCount: number;
  }>();

  diagnoses.forEach(d => {
    const existing = diagnosisByCode.get(d.icd10Code) || {
      description: d.description,
      count: 0,
      patients: new Set<string>(),
      isPrimaryCount: 0,
    };
    existing.count++;
    existing.patients.add(d.encounter.patientId);
    if (d.isPrimary) existing.isPrimaryCount++;
    diagnosisByCode.set(d.icd10Code, existing);
  });

  const diagnosisRows: DiagnosisFrequencyRow[] = Array.from(diagnosisByCode.entries())
    .map(([icd10Code, data]) => ({
      icd10Code,
      description: data.description,
      count: data.count,
      percentage: totalDiagnoses > 0 ? (data.count / totalDiagnoses) * 100 : 0,
      uniquePatients: data.patients.size,
      isPrimaryCount: data.isPrimaryCount,
      primaryPercentage: data.count > 0 ? (data.isPrimaryCount / data.count) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Group by body site
  const byBodySiteMap = new Map<string, {
    count: number;
    diagnoses: Map<string, { description: string; count: number }>;
  }>();

  diagnoses.forEach(d => {
    const site = d.bodySite || 'Unspecified';
    const existing = byBodySiteMap.get(site) || {
      count: 0,
      diagnoses: new Map(),
    };
    existing.count++;
    const diagData = existing.diagnoses.get(d.icd10Code) || {
      description: d.description,
      count: 0,
    };
    diagData.count++;
    existing.diagnoses.set(d.icd10Code, diagData);
    byBodySiteMap.set(site, existing);
  });

  const byBodySite: DiagnosisByBodySite[] = Array.from(byBodySiteMap.entries())
    .map(([bodySite, data]) => ({
      bodySite,
      count: data.count,
      percentage: totalDiagnoses > 0 ? (data.count / totalDiagnoses) * 100 : 0,
      topDiagnoses: Array.from(data.diagnoses.entries())
        .map(([icd10Code, d]) => ({ icd10Code, description: d.description, count: d.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count);

  // Group by provider
  const byProviderMap = new Map<string, {
    providerName: string;
    diagnoses: Map<string, { description: string; count: number }>;
  }>();

  diagnoses.forEach(d => {
    const providerId = d.encounter.providerId;
    const providerName = d.encounter.provider.user
      ? `${d.encounter.provider.user.firstName} ${d.encounter.provider.user.lastName}`
      : 'Unknown Provider';
    const existing = byProviderMap.get(providerId) || {
      providerName,
      diagnoses: new Map(),
    };
    const diagData = existing.diagnoses.get(d.icd10Code) || {
      description: d.description,
      count: 0,
    };
    diagData.count++;
    existing.diagnoses.set(d.icd10Code, diagData);
    byProviderMap.set(providerId, existing);
  });

  const byProvider: DiagnosisByProvider[] = Array.from(byProviderMap.entries())
    .map(([providerId, data]) => ({
      providerId,
      providerName: data.providerName,
      totalDiagnoses: Array.from(data.diagnoses.values()).reduce((sum, d) => sum + d.count, 0),
      uniqueDiagnoses: data.diagnoses.size,
      topDiagnoses: Array.from(data.diagnoses.entries())
        .map(([icd10Code, d]) => ({ icd10Code, description: d.description, count: d.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    }))
    .sort((a, b) => b.totalDiagnoses - a.totalDiagnoses);

  return {
    periodStart: start,
    periodEnd: end,
    totalDiagnoses,
    uniqueDiagnoses: diagnosisByCode.size,
    diagnoses: diagnosisRows.slice(0, 50), // Top 50
    byBodySite,
    byProvider,
  };
}

/**
 * Treatment Plan Completion Report
 */
export async function getTreatmentPlanCompletionReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<TreatmentPlanCompletionReport> {
  const { start, end } = dateRange;

  // Get all treatment plans active or completed in date range
  const plans = await prisma.treatmentPlan.findMany({
    where: {
      organizationId,
      OR: [
        // Plans started in date range
        { startDate: { gte: start, lte: end } },
        // Plans completed in date range
        { endDate: { gte: start, lte: end } },
        // Plans that were active during date range
        {
          AND: [
            { startDate: { lte: end } },
            {
              OR: [
                { endDate: null },
                { endDate: { gte: start } },
              ],
            },
          ],
        },
      ],
    },
    include: {
      patient: { include: { demographics: true } },
      provider: { include: { user: true } },
      goals: true,
      encounters: {
        where: {
          status: { in: [EncounterStatus.COMPLETED, EncounterStatus.SIGNED, EncounterStatus.AMENDED] },
        },
      },
    },
  });

  const totalPlans = plans.length;
  const activePlans = plans.filter(p => p.status === TreatmentPlanStatus.ACTIVE).length;
  const completedPlans = plans.filter(p => p.status === TreatmentPlanStatus.COMPLETED).length;
  const discontinuedPlans = plans.filter(p => p.status === TreatmentPlanStatus.DISCONTINUED).length;
  const draftPlans = plans.filter(p => p.status === TreatmentPlanStatus.DRAFT).length;
  const expiredPlans = plans.filter(p => p.status === TreatmentPlanStatus.EXPIRED).length;

  // Calculate avg visits/days to completion for completed plans
  const completedPlanData = plans
    .filter(p => p.status === TreatmentPlanStatus.COMPLETED && p.endDate)
    .map(p => ({
      visits: p.completedVisits,
      days: Math.round((p.endDate!.getTime() - p.startDate.getTime()) / (1000 * 60 * 60 * 24)),
    }));

  const avgVisitsToCompletion = completedPlanData.length > 0
    ? completedPlanData.reduce((sum, p) => sum + p.visits, 0) / completedPlanData.length
    : 0;

  const avgDaysToCompletion = completedPlanData.length > 0
    ? completedPlanData.reduce((sum, p) => sum + p.days, 0) / completedPlanData.length
    : 0;

  // By provider
  const providerMap = new Map<string, {
    providerName: string;
    totalPlans: number;
    completedPlans: number;
    visitsToCompletion: number[];
    activePatients: Set<string>;
  }>();

  plans.forEach(p => {
    const providerId = p.providerId;
    const providerName = p.provider.user
      ? `${p.provider.user.firstName} ${p.provider.user.lastName}`
      : 'Unknown Provider';
    const existing = providerMap.get(providerId) || {
      providerName,
      totalPlans: 0,
      completedPlans: 0,
      visitsToCompletion: [],
      activePatients: new Set<string>(),
    };
    existing.totalPlans++;
    if (p.status === TreatmentPlanStatus.COMPLETED) {
      existing.completedPlans++;
      existing.visitsToCompletion.push(p.completedVisits);
    }
    if (p.status === TreatmentPlanStatus.ACTIVE) {
      existing.activePatients.add(p.patientId);
    }
    providerMap.set(providerId, existing);
  });

  const byProvider: TreatmentPlanByProvider[] = Array.from(providerMap.entries())
    .map(([providerId, data]) => ({
      providerId,
      providerName: data.providerName,
      totalPlans: data.totalPlans,
      completedPlans: data.completedPlans,
      completionRate: data.totalPlans > 0 ? (data.completedPlans / data.totalPlans) * 100 : 0,
      avgVisitsToCompletion: data.visitsToCompletion.length > 0
        ? data.visitsToCompletion.reduce((a, b) => a + b, 0) / data.visitsToCompletion.length
        : 0,
      activePatients: data.activePatients.size,
    }))
    .sort((a, b) => b.totalPlans - a.totalPlans);

  // By status
  const statusCounts: Record<TreatmentPlanStatus, { count: number; plannedVisits: number[]; completedVisits: number[] }> = {
    [TreatmentPlanStatus.DRAFT]: { count: 0, plannedVisits: [], completedVisits: [] },
    [TreatmentPlanStatus.ACTIVE]: { count: 0, plannedVisits: [], completedVisits: [] },
    [TreatmentPlanStatus.COMPLETED]: { count: 0, plannedVisits: [], completedVisits: [] },
    [TreatmentPlanStatus.DISCONTINUED]: { count: 0, plannedVisits: [], completedVisits: [] },
    [TreatmentPlanStatus.EXPIRED]: { count: 0, plannedVisits: [], completedVisits: [] },
  };

  plans.forEach(p => {
    statusCounts[p.status].count++;
    if (p.plannedVisits) statusCounts[p.status].plannedVisits.push(p.plannedVisits);
    statusCounts[p.status].completedVisits.push(p.completedVisits);
  });

  const byStatus: TreatmentPlanByStatus[] = Object.entries(statusCounts)
    .map(([status, data]) => ({
      status: status as TreatmentPlanStatus,
      statusLabel: getStatusLabel(status as TreatmentPlanStatus),
      count: data.count,
      percentage: totalPlans > 0 ? (data.count / totalPlans) * 100 : 0,
      avgPlannedVisits: data.plannedVisits.length > 0
        ? data.plannedVisits.reduce((a, b) => a + b, 0) / data.plannedVisits.length
        : 0,
      avgCompletedVisits: data.completedVisits.length > 0
        ? data.completedVisits.reduce((a, b) => a + b, 0) / data.completedVisits.length
        : 0,
    }));

  // Goal achievement
  const allGoals = plans.flatMap(p => p.goals);
  const goalAchievement: GoalAchievementSummary = {
    totalGoals: allGoals.length,
    achievedGoals: allGoals.filter(g => g.status === GoalStatus.ACHIEVED).length,
    partiallyAchievedGoals: allGoals.filter(g => g.status === GoalStatus.PARTIALLY_ACHIEVED).length,
    notAchievedGoals: allGoals.filter(g => g.status === GoalStatus.NOT_ACHIEVED).length,
    inProgressGoals: allGoals.filter(g => g.status === GoalStatus.IN_PROGRESS).length,
    notStartedGoals: allGoals.filter(g => g.status === GoalStatus.NOT_STARTED).length,
    achievementRate: allGoals.length > 0
      ? (allGoals.filter(g => g.status === GoalStatus.ACHIEVED).length / allGoals.length) * 100
      : 0,
  };

  // Recent completions
  const recentCompletions: RecentCompletedPlan[] = plans
    .filter(p => p.status === TreatmentPlanStatus.COMPLETED && p.endDate)
    .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime())
    .slice(0, 10)
    .map(p => {
      const providerName = p.provider.user
        ? `${p.provider.user.firstName} ${p.provider.user.lastName}`
        : 'Unknown Provider';
      const patientName = p.patient.demographics
        ? `${p.patient.demographics.firstName} ${p.patient.demographics.lastName}`
        : `Patient ${p.patient.mrn}`;
      return {
        planId: p.id,
        planName: p.name,
        patientId: p.patientId,
        patientName,
        providerId: p.providerId,
        providerName,
        startDate: p.startDate,
        endDate: p.endDate!,
        plannedVisits: p.plannedVisits,
        actualVisits: p.completedVisits,
        daysToCompletion: Math.round((p.endDate!.getTime() - p.startDate.getTime()) / (1000 * 60 * 60 * 24)),
      };
    });

  return {
    periodStart: start,
    periodEnd: end,
    summary: {
      totalPlans,
      activePlans,
      completedPlans,
      discontinuedPlans,
      draftPlans,
      expiredPlans,
      completionRate: totalPlans > 0 ? (completedPlans / totalPlans) * 100 : 0,
      avgVisitsToCompletion,
      avgDaysToCompletion,
    },
    byProvider,
    byStatus,
    goalAchievement,
    recentCompletions,
  };
}

/**
 * Average Visits Per Case Report
 */
export async function getAverageVisitsPerCaseReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<AverageVisitsPerCaseReport> {
  const { start, end } = dateRange;

  // Get treatment plans as "cases"
  const plans = await prisma.treatmentPlan.findMany({
    where: {
      organizationId,
      startDate: { lte: end },
      OR: [
        { endDate: null },
        { endDate: { gte: start } },
      ],
    },
    include: {
      provider: { include: { user: true } },
      encounters: {
        where: {
          encounterDate: { gte: start, lte: end },
          status: { in: [EncounterStatus.COMPLETED, EncounterStatus.SIGNED, EncounterStatus.AMENDED] },
        },
        include: {
          diagnoses: true,
        },
      },
    },
  });

  const totalCases = plans.length;
  const visitCounts = plans.map(p => p.encounters.length);
  const totalVisits = visitCounts.reduce((a, b) => a + b, 0);
  const avgVisitsPerCase = totalCases > 0 ? totalVisits / totalCases : 0;
  const medianVisitsPerCase = calculateMedian(visitCounts);
  const minVisits = visitCounts.length > 0 ? Math.min(...visitCounts) : 0;
  const maxVisits = visitCounts.length > 0 ? Math.max(...visitCounts) : 0;

  // By diagnosis (primary diagnosis from first encounter)
  const diagnosisMap = new Map<string, {
    description: string;
    visitCounts: number[];
  }>();

  plans.forEach(p => {
    if (p.encounters.length > 0) {
      const primaryDiag = p.encounters
        .flatMap(e => e.diagnoses)
        .find(d => d.isPrimary);
      if (primaryDiag) {
        const existing = diagnosisMap.get(primaryDiag.icd10Code) || {
          description: primaryDiag.description,
          visitCounts: [],
        };
        existing.visitCounts.push(p.encounters.length);
        diagnosisMap.set(primaryDiag.icd10Code, existing);
      }
    }
  });

  const byDiagnosis: VisitsPerCaseByDiagnosis[] = Array.from(diagnosisMap.entries())
    .map(([icd10Code, data]) => ({
      icd10Code,
      description: data.description,
      caseCount: data.visitCounts.length,
      totalVisits: data.visitCounts.reduce((a, b) => a + b, 0),
      avgVisits: data.visitCounts.length > 0
        ? data.visitCounts.reduce((a, b) => a + b, 0) / data.visitCounts.length
        : 0,
      medianVisits: calculateMedian(data.visitCounts),
    }))
    .sort((a, b) => b.caseCount - a.caseCount)
    .slice(0, 20);

  // By provider
  const providerMap = new Map<string, {
    providerName: string;
    visitCounts: number[];
    activeCases: number;
    completedCases: number;
  }>();

  plans.forEach(p => {
    const providerId = p.providerId;
    const providerName = p.provider.user
      ? `${p.provider.user.firstName} ${p.provider.user.lastName}`
      : 'Unknown Provider';
    const existing = providerMap.get(providerId) || {
      providerName,
      visitCounts: [],
      activeCases: 0,
      completedCases: 0,
    };
    existing.visitCounts.push(p.encounters.length);
    if (p.status === TreatmentPlanStatus.ACTIVE) existing.activeCases++;
    if (p.status === TreatmentPlanStatus.COMPLETED) existing.completedCases++;
    providerMap.set(providerId, existing);
  });

  const byProvider: VisitsPerCaseByProvider[] = Array.from(providerMap.entries())
    .map(([providerId, data]) => ({
      providerId,
      providerName: data.providerName,
      caseCount: data.visitCounts.length,
      totalVisits: data.visitCounts.reduce((a, b) => a + b, 0),
      avgVisits: data.visitCounts.length > 0
        ? data.visitCounts.reduce((a, b) => a + b, 0) / data.visitCounts.length
        : 0,
      activeCases: data.activeCases,
      completedCases: data.completedCases,
    }))
    .sort((a, b) => b.caseCount - a.caseCount);

  // Distribution buckets
  const buckets = [
    { label: '1-3 visits', min: 1, max: 3 },
    { label: '4-6 visits', min: 4, max: 6 },
    { label: '7-12 visits', min: 7, max: 12 },
    { label: '13-20 visits', min: 13, max: 20 },
    { label: '21+ visits', min: 21, max: Infinity },
  ];

  const distribution: VisitCountBucket[] = buckets.map(b => {
    const count = visitCounts.filter(v => v >= b.min && v <= b.max).length;
    return {
      bucketLabel: b.label,
      minVisits: b.min,
      maxVisits: b.max === Infinity ? 999 : b.max,
      caseCount: count,
      percentage: totalCases > 0 ? (count / totalCases) * 100 : 0,
    };
  });

  // Monthly trends
  const monthlyData = new Map<string, { caseCount: number; totalVisits: number; start: Date }>();
  plans.forEach(p => {
    const monthKey = `${p.startDate.getFullYear()}-${String(p.startDate.getMonth() + 1).padStart(2, '0')}`;
    const existing = monthlyData.get(monthKey) || {
      caseCount: 0,
      totalVisits: 0,
      start: new Date(p.startDate.getFullYear(), p.startDate.getMonth(), 1),
    };
    existing.caseCount++;
    existing.totalVisits += p.encounters.length;
    monthlyData.set(monthKey, existing);
  });

  const trends: VisitsPerCaseTrend[] = Array.from(monthlyData.entries())
    .map(([, data]) => ({
      periodLabel: getMonthLabel(data.start),
      periodStart: data.start,
      caseCount: data.caseCount,
      avgVisits: data.caseCount > 0 ? data.totalVisits / data.caseCount : 0,
    }))
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());

  return {
    periodStart: start,
    periodEnd: end,
    summary: {
      totalCases,
      totalVisits,
      avgVisitsPerCase,
      medianVisitsPerCase,
      minVisits,
      maxVisits,
    },
    byDiagnosis,
    byProvider,
    distribution,
    trends,
  };
}

/**
 * Provider Case Mix Report
 */
export async function getProviderCaseMixReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<ProviderCaseMixReport> {
  const { start, end } = dateRange;

  // Get providers with their encounters
  const providers = await prisma.provider.findMany({
    where: { organizationId },
    include: {
      user: true,
      encounters: {
        where: {
          encounterDate: { gte: start, lte: end },
          status: { in: [EncounterStatus.COMPLETED, EncounterStatus.SIGNED, EncounterStatus.AMENDED] },
        },
        include: {
          patient: { include: { demographics: true } },
          diagnoses: true,
        },
      },
    },
  });

  const providerCaseMixes: ProviderCaseMix[] = providers
    .filter(p => p.encounters.length > 0)
    .map(provider => {
      const providerName = provider.user
        ? `${provider.user.firstName} ${provider.user.lastName}`
        : 'Unknown Provider';

      const uniquePatients = new Set(provider.encounters.map(e => e.patientId));

      // Check for new patients (first encounter in period)
      const patientFirstEncounter = new Map<string, Date>();
      provider.encounters.forEach(e => {
        const existing = patientFirstEncounter.get(e.patientId);
        if (!existing || e.encounterDate < existing) {
          patientFirstEncounter.set(e.patientId, e.encounterDate);
        }
      });

      // Count patients whose first encounter with this provider is in the period
      // (simplified - true new patient logic would check across all time)
      const newPatients = Array.from(patientFirstEncounter.values())
        .filter(d => d >= start && d <= end).length;

      // Top diagnoses
      const diagMap = new Map<string, { description: string; patientIds: Set<string>; encounterCount: number }>();
      provider.encounters.forEach(e => {
        e.diagnoses.forEach(d => {
          const existing = diagMap.get(d.icd10Code) || {
            description: d.description,
            patientIds: new Set(),
            encounterCount: 0,
          };
          existing.patientIds.add(e.patientId);
          existing.encounterCount++;
          diagMap.set(d.icd10Code, existing);
        });
      });

      const topDiagnoses: ProviderDiagnosisMix[] = Array.from(diagMap.entries())
        .map(([icd10Code, data]) => ({
          icd10Code,
          description: data.description,
          patientCount: data.patientIds.size,
          encounterCount: data.encounterCount,
          percentage: provider.encounters.length > 0
            ? (data.encounterCount / provider.encounters.length) * 100
            : 0,
        }))
        .sort((a, b) => b.encounterCount - a.encounterCount)
        .slice(0, 10);

      // Encounter type breakdown
      const encounterTypeMap = new Map<string, number>();
      provider.encounters.forEach(e => {
        const type = e.encounterType;
        encounterTypeMap.set(type, (encounterTypeMap.get(type) || 0) + 1);
      });

      const encounterTypeBreakdown: EncounterTypeBreakdown[] = Array.from(encounterTypeMap.entries())
        .map(([type, count]) => ({
          encounterType: type,
          encounterTypeLabel: getEncounterTypeLabel(type),
          count,
          percentage: provider.encounters.length > 0 ? (count / provider.encounters.length) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Patient demographics (simplified)
      const patients = provider.encounters.map(e => e.patient);
      const ages = patients
        .filter(p => p.demographics?.dateOfBirth)
        .map(p => {
          const today = new Date();
          const birth = new Date(p.demographics!.dateOfBirth);
          return Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
        });

      const genderCounts = { male: 0, female: 0, other: 0 };
      const seenPatients = new Set<string>();
      patients.forEach(p => {
        if (!seenPatients.has(p.id)) {
          seenPatients.add(p.id);
          const gender = p.demographics?.gender;
          if (gender === 'MALE') genderCounts.male++;
          else if (gender === 'FEMALE') genderCounts.female++;
          else genderCounts.other++;
        }
      });

      const patientDemographics: PatientDemographicMix = {
        avgAge: ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
        maleCount: genderCounts.male,
        femaleCount: genderCounts.female,
        otherCount: genderCounts.other,
      };

      return {
        providerId: provider.id,
        providerName,
        totalPatients: uniquePatients.size,
        newPatients,
        totalEncounters: provider.encounters.length,
        avgEncountersPerPatient: uniquePatients.size > 0
          ? provider.encounters.length / uniquePatients.size
          : 0,
        topDiagnoses,
        encounterTypeBreakdown,
        patientDemographics,
      };
    })
    .sort((a, b) => b.totalEncounters - a.totalEncounters);

  const totalPatients = new Set(providers.flatMap(p => p.encounters.map(e => e.patientId))).size;
  const totalEncounters = providers.reduce((sum, p) => sum + p.encounters.length, 0);
  const uniqueDiagnoses = new Set(
    providers.flatMap(p => p.encounters.flatMap(e => e.diagnoses.map(d => d.icd10Code)))
  ).size;
  const providerCount = providerCaseMixes.length;

  return {
    periodStart: start,
    periodEnd: end,
    providers: providerCaseMixes,
    organizationTotals: {
      totalPatients,
      totalEncounters,
      uniqueDiagnoses,
      avgPatientsPerProvider: providerCount > 0 ? totalPatients / providerCount : 0,
      avgEncountersPerProvider: providerCount > 0 ? totalEncounters / providerCount : 0,
    },
  };
}

/**
 * Outcome Tracking Report
 */
export async function getOutcomeTrackingReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<OutcomeTrackingReport> {
  const { start, end } = dateRange;

  const assessments = await prisma.outcomeAssessment.findMany({
    where: {
      organizationId,
      administeredAt: { gte: start, lte: end },
    },
    include: {
      patient: { include: { demographics: true } },
      encounter: {
        include: {
          provider: { include: { user: true } },
        },
      },
    },
    orderBy: { administeredAt: 'desc' },
  });

  const totalAssessments = assessments.length;
  const uniquePatients = new Set(assessments.map(a => a.patientId)).size;

  // Calculate improvement metrics
  const withChange = assessments.filter(a => a.changeScore !== null);
  const improved = withChange.filter(a => Number(a.changeScore) < 0); // Lower score = improvement for disability indices
  const worsened = withChange.filter(a => Number(a.changeScore) > 0);
  const noChange = withChange.filter(a => Number(a.changeScore) === 0);

  const avgImprovement = withChange.length > 0
    ? withChange.reduce((sum, a) => sum + Math.abs(Number(a.changeScore) || 0), 0) / withChange.length
    : 0;

  const improvementRate = withChange.length > 0 ? (improved.length / withChange.length) * 100 : 0;
  const noChangeRate = withChange.length > 0 ? (noChange.length / withChange.length) * 100 : 0;
  const worseningRate = withChange.length > 0 ? (worsened.length / withChange.length) * 100 : 0;

  // By assessment type
  const byTypeMap = new Map<AssessmentType, {
    assessments: typeof assessments;
  }>();

  assessments.forEach(a => {
    const existing = byTypeMap.get(a.assessmentType) || { assessments: [] };
    existing.assessments.push(a);
    byTypeMap.set(a.assessmentType, existing);
  });

  const byAssessmentType: OutcomeByAssessmentType[] = Array.from(byTypeMap.entries())
    .map(([type, data]) => {
      const typeAssessments = data.assessments;
      const withPrevious = typeAssessments.filter(a => a.previousScore !== null);
      const typeImproved = withPrevious.filter(a => Number(a.changeScore) < 0);

      // Get patients with multiple assessments of this type
      const patientCounts = new Map<string, number>();
      typeAssessments.forEach(a => {
        patientCounts.set(a.patientId, (patientCounts.get(a.patientId) || 0) + 1);
      });
      const patientsWithMultiple = Array.from(patientCounts.values()).filter(c => c > 1).length;

      const initialScores = typeAssessments
        .filter(a => a.previousScore === null && a.rawScore !== null)
        .map(a => Number(a.rawScore));
      const latestScores = typeAssessments
        .filter(a => a.rawScore !== null)
        .map(a => Number(a.rawScore));

      return {
        assessmentType: type,
        assessmentTypeLabel: getAssessmentTypeLabel(type),
        totalAssessments: typeAssessments.length,
        patientsWithMultiple,
        avgInitialScore: initialScores.length > 0
          ? initialScores.reduce((a, b) => a + b, 0) / initialScores.length
          : 0,
        avgLatestScore: latestScores.length > 0
          ? latestScores.reduce((a, b) => a + b, 0) / latestScores.length
          : 0,
        avgChange: withPrevious.length > 0
          ? withPrevious.reduce((sum, a) => sum + (Number(a.changeScore) || 0), 0) / withPrevious.length
          : 0,
        avgChangePercent: withPrevious.length > 0
          ? withPrevious.reduce((sum, a) => sum + (Number(a.changePercent) || 0), 0) / withPrevious.length
          : 0,
        improvedCount: typeImproved.length,
        noChangeCount: withPrevious.filter(a => Number(a.changeScore) === 0).length,
        worsenedCount: withPrevious.filter(a => Number(a.changeScore) > 0).length,
      };
    })
    .sort((a, b) => b.totalAssessments - a.totalAssessments);

  // By provider
  const byProviderMap = new Map<string, {
    providerName: string;
    assessments: typeof assessments;
  }>();

  assessments.forEach(a => {
    const providerId = a.encounter.providerId;
    const providerName = a.encounter.provider.user
      ? `${a.encounter.provider.user.firstName} ${a.encounter.provider.user.lastName}`
      : 'Unknown Provider';
    const existing = byProviderMap.get(providerId) || {
      providerName,
      assessments: [],
    };
    existing.assessments.push(a);
    byProviderMap.set(providerId, existing);
  });

  const byProvider: OutcomeByProvider[] = Array.from(byProviderMap.entries())
    .map(([providerId, data]) => {
      const provAssessments = data.assessments;
      const provWithChange = provAssessments.filter(a => a.changeScore !== null);
      const provImproved = provWithChange.filter(a => Number(a.changeScore) < 0);

      return {
        providerId,
        providerName: data.providerName,
        totalAssessments: provAssessments.length,
        uniquePatients: new Set(provAssessments.map(a => a.patientId)).size,
        avgImprovement: provWithChange.length > 0
          ? provWithChange.reduce((sum, a) => sum + Math.abs(Number(a.changeScore) || 0), 0) / provWithChange.length
          : 0,
        improvementRate: provWithChange.length > 0 ? (provImproved.length / provWithChange.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.totalAssessments - a.totalAssessments);

  // Monthly trends
  const monthlyMap = new Map<string, { start: Date; scores: number[]; changes: number[] }>();
  assessments.forEach(a => {
    const monthKey = `${a.administeredAt.getFullYear()}-${String(a.administeredAt.getMonth() + 1).padStart(2, '0')}`;
    const existing = monthlyMap.get(monthKey) || {
      start: new Date(a.administeredAt.getFullYear(), a.administeredAt.getMonth(), 1),
      scores: [],
      changes: [],
    };
    if (a.rawScore !== null) existing.scores.push(Number(a.rawScore));
    if (a.changeScore !== null) existing.changes.push(Number(a.changeScore));
    monthlyMap.set(monthKey, existing);
  });

  const trends: OutcomeTrendPoint[] = Array.from(monthlyMap.entries())
    .map(([, data]) => ({
      periodLabel: getMonthLabel(data.start),
      periodStart: data.start,
      assessmentCount: data.scores.length,
      avgScore: data.scores.length > 0
        ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        : 0,
      avgImprovement: data.changes.length > 0
        ? Math.abs(data.changes.reduce((a, b) => a + b, 0) / data.changes.length)
        : 0,
    }))
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());

  // Recent assessments
  const recentAssessments: RecentOutcomeAssessment[] = assessments
    .slice(0, 20)
    .map(a => {
      const patientName = a.patient.demographics
        ? `${a.patient.demographics.firstName} ${a.patient.demographics.lastName}`
        : `Patient ${a.patient.mrn}`;
      return {
        assessmentId: a.id,
        patientId: a.patientId,
        patientName,
        assessmentType: a.assessmentType,
        assessmentTypeLabel: getAssessmentTypeLabel(a.assessmentType),
        currentScore: Number(a.rawScore) || 0,
        previousScore: a.previousScore !== null ? Number(a.previousScore) : null,
        changeScore: a.changeScore !== null ? Number(a.changeScore) : null,
        interpretation: a.interpretation,
        assessedAt: a.administeredAt,
      };
    });

  return {
    periodStart: start,
    periodEnd: end,
    summary: {
      totalAssessments,
      uniquePatients,
      avgImprovement,
      improvementRate,
      noChangeRate,
      worseningRate,
    },
    byAssessmentType,
    byProvider,
    trends,
    recentAssessments,
  };
}

/**
 * Care Plan Adherence Report
 */
export async function getCarePlanAdherenceReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<CarePlanAdherenceReport> {
  const { start, end } = dateRange;

  // Get active treatment plans
  const plans = await prisma.treatmentPlan.findMany({
    where: {
      organizationId,
      status: TreatmentPlanStatus.ACTIVE,
      startDate: { lte: end },
    },
    include: {
      patient: { include: { demographics: true } },
      provider: { include: { user: true } },
      encounters: {
        where: {
          status: { in: [EncounterStatus.COMPLETED, EncounterStatus.SIGNED, EncounterStatus.AMENDED] },
        },
      },
    },
  });

  const now = new Date();

  // Calculate adherence for each plan
  const planAdherence = plans.map(plan => {
    const daysSinceStart = Math.max(1, Math.round((now.getTime() - plan.startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const totalDuration = plan.endDate
      ? Math.round((plan.endDate.getTime() - plan.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const daysRemaining = plan.endDate
      ? Math.round((plan.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Expected visits based on elapsed time
    let expectedVisitsToDate = 0;
    if (plan.plannedVisits && totalDuration) {
      const progressRatio = Math.min(daysSinceStart / totalDuration, 1);
      expectedVisitsToDate = Math.round(plan.plannedVisits * progressRatio);
    }

    const completedVisits = plan.completedVisits;
    const completionPercentage = plan.plannedVisits
      ? (completedVisits / plan.plannedVisits) * 100
      : 0;

    let adherenceStatus: 'on_track' | 'behind' | 'ahead' | 'unknown' = 'unknown';
    if (expectedVisitsToDate > 0) {
      const variance = completedVisits - expectedVisitsToDate;
      if (variance >= 1) adherenceStatus = 'ahead';
      else if (variance <= -2) adherenceStatus = 'behind';
      else adherenceStatus = 'on_track';
    }

    return {
      plan,
      expectedVisitsToDate,
      completedVisits,
      completionPercentage,
      adherenceStatus,
      daysRemaining,
    };
  });

  const totalActivePlans = planAdherence.length;
  const onTrackPlans = planAdherence.filter(p => p.adherenceStatus === 'on_track').length;
  const behindSchedulePlans = planAdherence.filter(p => p.adherenceStatus === 'behind').length;
  const aheadOfSchedulePlans = planAdherence.filter(p => p.adherenceStatus === 'ahead').length;
  const adherenceRate = totalActivePlans > 0 ? (onTrackPlans / totalActivePlans) * 100 : 0;
  const avgCompletionPercentage = totalActivePlans > 0
    ? planAdherence.reduce((sum, p) => sum + p.completionPercentage, 0) / totalActivePlans
    : 0;

  // By provider
  const providerMap = new Map<string, {
    providerName: string;
    adherenceData: typeof planAdherence;
  }>();

  planAdherence.forEach(p => {
    const providerId = p.plan.providerId;
    const providerName = p.plan.provider.user
      ? `${p.plan.provider.user.firstName} ${p.plan.provider.user.lastName}`
      : 'Unknown Provider';
    const existing = providerMap.get(providerId) || {
      providerName,
      adherenceData: [],
    };
    existing.adherenceData.push(p);
    providerMap.set(providerId, existing);
  });

  const byProvider: AdherenceByProvider[] = Array.from(providerMap.entries())
    .map(([providerId, data]) => {
      const provPlans = data.adherenceData;
      const onTrack = provPlans.filter(p => p.adherenceStatus === 'on_track').length;
      const behind = provPlans.filter(p => p.adherenceStatus === 'behind').length;

      return {
        providerId,
        providerName: data.providerName,
        activePlans: provPlans.length,
        onTrackCount: onTrack,
        behindCount: behind,
        adherenceRate: provPlans.length > 0 ? (onTrack / provPlans.length) * 100 : 0,
        avgCompletionPercentage: provPlans.length > 0
          ? provPlans.reduce((sum, p) => sum + p.completionPercentage, 0) / provPlans.length
          : 0,
      };
    })
    .sort((a, b) => b.activePlans - a.activePlans);

  // Patient details
  const byPatient: PatientAdherenceDetail[] = planAdherence.map(p => {
    const patientName = p.plan.patient.demographics
      ? `${p.plan.patient.demographics.firstName} ${p.plan.patient.demographics.lastName}`
      : `Patient ${p.plan.patient.mrn}`;
    const providerName = p.plan.provider.user
      ? `${p.plan.provider.user.firstName} ${p.plan.provider.user.lastName}`
      : 'Unknown Provider';

    return {
      patientId: p.plan.patientId,
      patientName,
      planId: p.plan.id,
      planName: p.plan.name,
      providerId: p.plan.providerId,
      providerName,
      plannedVisits: p.plan.plannedVisits,
      completedVisits: p.completedVisits,
      expectedVisitsToDate: p.expectedVisitsToDate,
      completionPercentage: p.completionPercentage,
      adherenceStatus: p.adherenceStatus,
      daysRemaining: p.daysRemaining,
    };
  }).sort((a, b) => {
    // Sort behind first, then by completion percentage
    if (a.adherenceStatus === 'behind' && b.adherenceStatus !== 'behind') return -1;
    if (b.adherenceStatus === 'behind' && a.adherenceStatus !== 'behind') return 1;
    return a.completionPercentage - b.completionPercentage;
  });

  // Monthly trends (using plan creation dates for historical context)
  const monthlyMap = new Map<string, {
    start: Date;
    totalPlans: number;
    onTrackCount: number;
    completionSum: number;
  }>();

  // Group by current month for active plans
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  monthlyMap.set(currentMonthKey, {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    totalPlans: totalActivePlans,
    onTrackCount: onTrackPlans,
    completionSum: planAdherence.reduce((sum, p) => sum + p.completionPercentage, 0),
  });

  const trends: AdherenceTrendPoint[] = Array.from(monthlyMap.entries())
    .map(([, data]) => ({
      periodLabel: getMonthLabel(data.start),
      periodStart: data.start,
      totalPlans: data.totalPlans,
      onTrackPercentage: data.totalPlans > 0 ? (data.onTrackCount / data.totalPlans) * 100 : 0,
      avgCompletionPercentage: data.totalPlans > 0 ? data.completionSum / data.totalPlans : 0,
    }))
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());

  return {
    periodStart: start,
    periodEnd: end,
    summary: {
      totalActivePlans,
      onTrackPlans,
      behindSchedulePlans,
      aheadOfSchedulePlans,
      adherenceRate,
      avgCompletionPercentage,
    },
    byProvider,
    byPatient,
    trends,
  };
}
