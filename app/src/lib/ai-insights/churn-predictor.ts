// Churn Predictor - AI Insights Agent
// Predicts which patients are at risk of churning based on visit patterns and behavior

import { prisma } from '@/lib/prisma';
import { ChurnRiskLevel, InsightPriority, PatientStatus } from '@prisma/client';
import type { ChurnPredictionConfig, PatientChurnAnalysis, ChurnRiskFactor } from './types';

// Default configuration
const DEFAULT_CONFIG: ChurnPredictionConfig = {
  veryHighRiskThreshold: 80,
  highRiskThreshold: 60,
  mediumRiskThreshold: 40,
  lowRiskThreshold: 20,
  factorWeights: {
    daysSinceLastVisit: 0.35,
    visitFrequencyChange: 0.25,
    missedAppointments: 0.15,
    outstandingBalance: 0.15,
    engagementScore: 0.10,
  },
  maxDaysSinceVisit: 90,
  lookbackMonths: 12,
};

/**
 * Determine risk level from score
 */
function getRiskLevel(score: number, config: ChurnPredictionConfig): ChurnRiskLevel {
  if (score >= config.veryHighRiskThreshold) return ChurnRiskLevel.VERY_HIGH;
  if (score >= config.highRiskThreshold) return ChurnRiskLevel.HIGH;
  if (score >= config.mediumRiskThreshold) return ChurnRiskLevel.MEDIUM;
  if (score >= config.lowRiskThreshold) return ChurnRiskLevel.LOW;
  return ChurnRiskLevel.VERY_LOW;
}

/**
 * Get priority from risk level
 */
function getPriorityFromRiskLevel(riskLevel: ChurnRiskLevel): InsightPriority {
  switch (riskLevel) {
    case ChurnRiskLevel.VERY_HIGH:
      return InsightPriority.CRITICAL;
    case ChurnRiskLevel.HIGH:
      return InsightPriority.HIGH;
    case ChurnRiskLevel.MEDIUM:
      return InsightPriority.MEDIUM;
    case ChurnRiskLevel.LOW:
      return InsightPriority.LOW;
    default:
      return InsightPriority.INFO;
  }
}

/**
 * Calculate days since last visit risk factor
 */
function calculateDaysSinceLastVisitFactor(
  daysSinceLastVisit: number,
  maxDays: number
): { score: number; description: string } {
  if (daysSinceLastVisit <= 30) {
    return { score: 0, description: 'Recent visit within 30 days' };
  }
  if (daysSinceLastVisit <= 60) {
    return { score: 25, description: '31-60 days since last visit' };
  }
  if (daysSinceLastVisit <= maxDays) {
    return { score: 50, description: `61-${maxDays} days since last visit` };
  }
  if (daysSinceLastVisit <= maxDays * 1.5) {
    return { score: 75, description: `${maxDays + 1}-${Math.floor(maxDays * 1.5)} days since last visit` };
  }
  return { score: 100, description: `Over ${Math.floor(maxDays * 1.5)} days since last visit` };
}

/**
 * Calculate visit frequency change factor
 */
function calculateFrequencyChangeFactor(
  currentFrequency: number,
  previousFrequency: number
): { score: number; changePercent: number; description: string } {
  if (previousFrequency === 0 || currentFrequency === 0) {
    return {
      score: currentFrequency === 0 ? 75 : 0,
      changePercent: 0,
      description: currentFrequency === 0 ? 'No recent visits' : 'New patient pattern',
    };
  }

  const changePercent = ((previousFrequency - currentFrequency) / previousFrequency) * 100;

  if (changePercent <= -20) {
    return { score: 0, changePercent, description: 'Visit frequency increased significantly' };
  }
  if (changePercent <= 0) {
    return { score: 10, changePercent, description: 'Visit frequency stable or improving' };
  }
  if (changePercent <= 25) {
    return { score: 40, changePercent, description: 'Visit frequency slightly decreased' };
  }
  if (changePercent <= 50) {
    return { score: 60, changePercent, description: 'Visit frequency moderately decreased' };
  }
  return { score: 90, changePercent, description: 'Visit frequency significantly decreased' };
}

/**
 * Calculate missed appointments factor
 */
function calculateMissedAppointmentsFactor(
  missed: number,
  total: number
): { score: number; description: string } {
  if (total === 0) return { score: 0, description: 'No appointment history' };

  const missedRate = (missed / total) * 100;

  if (missedRate === 0) {
    return { score: 0, description: 'No missed appointments' };
  }
  if (missedRate <= 10) {
    return { score: 20, description: 'Occasional missed appointments (<10%)' };
  }
  if (missedRate <= 25) {
    return { score: 50, description: 'Some missed appointments (10-25%)' };
  }
  if (missedRate <= 50) {
    return { score: 75, description: 'Frequent missed appointments (25-50%)' };
  }
  return { score: 100, description: 'Very frequent missed appointments (>50%)' };
}

/**
 * Calculate outstanding balance factor
 */
function calculateBalanceFactor(
  balance: number,
  avgVisitValue: number
): { score: number; description: string } {
  if (balance <= 0) {
    return { score: 0, description: 'No outstanding balance' };
  }

  const visitsWorth = avgVisitValue > 0 ? balance / avgVisitValue : balance / 100;

  if (visitsWorth <= 1) {
    return { score: 15, description: 'Small outstanding balance' };
  }
  if (visitsWorth <= 3) {
    return { score: 35, description: 'Moderate outstanding balance' };
  }
  if (visitsWorth <= 5) {
    return { score: 60, description: 'Significant outstanding balance' };
  }
  return { score: 85, description: 'Large outstanding balance' };
}

/**
 * Calculate engagement score factor (forms, messages, portal)
 */
function calculateEngagementFactor(
  hasPortalAccess: boolean,
  recentFormSubmissions: number,
  recentMessages: number
): { score: number; description: string } {
  let engagementPoints = 0;

  if (hasPortalAccess) engagementPoints += 2;
  if (recentFormSubmissions > 0) engagementPoints += 2;
  if (recentMessages > 0) engagementPoints += 2;

  if (engagementPoints >= 5) {
    return { score: 0, description: 'Highly engaged patient' };
  }
  if (engagementPoints >= 3) {
    return { score: 20, description: 'Moderately engaged patient' };
  }
  if (engagementPoints >= 1) {
    return { score: 50, description: 'Low engagement' };
  }
  return { score: 75, description: 'No engagement signals' };
}

/**
 * Get suggested action based on risk factors
 */
function getSuggestedAction(analysis: Partial<PatientChurnAnalysis>): string {
  const factors = analysis.riskFactors || [];
  const topFactor = factors.sort((a, b) => b.contribution - a.contribution)[0];

  if (!topFactor) return 'Schedule a wellness check call';

  switch (topFactor.factor) {
    case 'daysSinceLastVisit':
      if (analysis.daysSinceLastVisit && analysis.daysSinceLastVisit > 90) {
        return 'Send a reactivation campaign and offer a complimentary consultation';
      }
      return 'Send a friendly reminder about scheduling their next visit';

    case 'visitFrequencyChange':
      return 'Review treatment plan and reach out to discuss care continuity';

    case 'missedAppointments':
      return 'Implement automated reminders and consider offering flexible scheduling';

    case 'outstandingBalance':
      return 'Offer a payment plan and discuss financial options';

    case 'engagementScore':
      return 'Encourage portal registration and send educational content';

    default:
      return 'Schedule a follow-up call to check on patient satisfaction';
  }
}

/**
 * Analyze churn risk for a single patient
 */
export async function analyzePatientChurnRisk(
  organizationId: string,
  patientId: string,
  config: Partial<ChurnPredictionConfig> = {}
): Promise<PatientChurnAnalysis | null> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const lookbackDate = new Date();
  lookbackDate.setMonth(lookbackDate.getMonth() - finalConfig.lookbackMonths);

  // Fetch patient data
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId, status: PatientStatus.ACTIVE },
    include: {
      demographics: true,
      appointments: {
        where: { startTime: { gte: lookbackDate } },
        orderBy: { startTime: 'desc' },
      },
      charges: {
        where: { chargeDate: { gte: lookbackDate } },
        select: { fee: true, balance: true },
      },
      formSubmissions: {
        where: { submittedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
        select: { id: true },
      },
      messageThreads: {
        where: { createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
        select: { id: true },
      },
      portalUser: { select: { id: true } },
    },
  });

  if (!patient || !patient.demographics) return null;

  // Calculate basic metrics
  const appointments = patient.appointments;
  const completedAppointments = appointments.filter(
    (a) => a.status === 'COMPLETED' || a.status === 'CHECKED_IN'
  );
  const missedAppointments = appointments.filter((a) => a.status === 'NO_SHOW');
  const cancelledAppointments = appointments.filter((a) => a.status === 'CANCELLED');
  const upcomingAppointments = appointments.filter(
    (a) => new Date(a.startTime) > new Date() && a.status === 'SCHEDULED'
  );

  // Last visit date
  const lastVisit = completedAppointments[0]?.startTime;
  const daysSinceLastVisit = lastVisit
    ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24))
    : 365;

  // Visit frequency calculation
  const totalVisits = completedAppointments.length;
  const midpoint = new Date();
  midpoint.setMonth(midpoint.getMonth() - finalConfig.lookbackMonths / 2);

  const firstHalfVisits = completedAppointments.filter((a) => new Date(a.startTime) < midpoint).length;
  const secondHalfVisits = completedAppointments.filter((a) => new Date(a.startTime) >= midpoint).length;

  const halfPeriodDays = (finalConfig.lookbackMonths / 2) * 30;
  const previousFrequency = firstHalfVisits / halfPeriodDays;
  const currentFrequency = secondHalfVisits / halfPeriodDays;

  // Financial metrics
  const outstandingBalance = patient.charges.reduce((sum, c) => sum + Number(c.balance), 0);
  const totalCharges = patient.charges.reduce((sum, c) => sum + Number(c.fee), 0);
  const avgVisitValue = totalVisits > 0 ? totalCharges / totalVisits : 100;

  // Payment history assessment
  let paymentHistory: 'good' | 'fair' | 'poor' = 'good';
  if (outstandingBalance > avgVisitValue * 3) {
    paymentHistory = 'poor';
  } else if (outstandingBalance > avgVisitValue) {
    paymentHistory = 'fair';
  }

  // Calculate individual factors
  const daysFactor = calculateDaysSinceLastVisitFactor(daysSinceLastVisit, finalConfig.maxDaysSinceVisit);
  const frequencyFactor = calculateFrequencyChangeFactor(currentFrequency, previousFrequency);
  const missedFactor = calculateMissedAppointmentsFactor(
    missedAppointments.length,
    appointments.length
  );
  const balanceFactor = calculateBalanceFactor(outstandingBalance, avgVisitValue);
  const engagementFactor = calculateEngagementFactor(
    !!patient.portalUser,
    patient.formSubmissions.length,
    patient.messageThreads.length
  );

  // Build risk factors array
  const riskFactors: ChurnRiskFactor[] = [
    {
      factor: 'daysSinceLastVisit',
      weight: finalConfig.factorWeights.daysSinceLastVisit,
      value: daysSinceLastVisit,
      impact: daysFactor.score > 50 ? 'negative' : daysFactor.score > 25 ? 'neutral' : 'positive',
      contribution: daysFactor.score * finalConfig.factorWeights.daysSinceLastVisit,
      description: daysFactor.description,
    },
    {
      factor: 'visitFrequencyChange',
      weight: finalConfig.factorWeights.visitFrequencyChange,
      value: `${frequencyFactor.changePercent.toFixed(0)}%`,
      impact: frequencyFactor.score > 50 ? 'negative' : frequencyFactor.score > 25 ? 'neutral' : 'positive',
      contribution: frequencyFactor.score * finalConfig.factorWeights.visitFrequencyChange,
      description: frequencyFactor.description,
    },
    {
      factor: 'missedAppointments',
      weight: finalConfig.factorWeights.missedAppointments,
      value: missedAppointments.length,
      impact: missedFactor.score > 50 ? 'negative' : missedFactor.score > 25 ? 'neutral' : 'positive',
      contribution: missedFactor.score * finalConfig.factorWeights.missedAppointments,
      description: missedFactor.description,
    },
    {
      factor: 'outstandingBalance',
      weight: finalConfig.factorWeights.outstandingBalance,
      value: outstandingBalance,
      impact: balanceFactor.score > 50 ? 'negative' : balanceFactor.score > 25 ? 'neutral' : 'positive',
      contribution: balanceFactor.score * finalConfig.factorWeights.outstandingBalance,
      description: balanceFactor.description,
    },
    {
      factor: 'engagementScore',
      weight: finalConfig.factorWeights.engagementScore,
      value: engagementFactor.score,
      impact: engagementFactor.score > 50 ? 'negative' : engagementFactor.score > 25 ? 'neutral' : 'positive',
      contribution: engagementFactor.score * finalConfig.factorWeights.engagementScore,
      description: engagementFactor.description,
    },
  ];

  // Calculate total risk score (0-100)
  const riskScore = riskFactors.reduce((sum, f) => sum + f.contribution, 0);
  const riskLevel = getRiskLevel(riskScore, finalConfig);

  // Calculate confidence based on data availability
  let confidence = 50;
  if (totalVisits >= 5) confidence += 15;
  if (totalVisits >= 10) confidence += 10;
  if (appointments.length >= 3) confidence += 10;
  if (patient.portalUser) confidence += 5;
  confidence = Math.min(99, confidence);

  const patientName = `${patient.demographics.firstName} ${patient.demographics.lastName}`;

  const analysis: PatientChurnAnalysis = {
    patientId: patient.id,
    patientName,
    riskScore,
    riskLevel,
    confidence,
    riskFactors,
    daysSinceLastVisit,
    avgVisitFrequency: currentFrequency * 30, // Convert to visits per month
    visitFrequencyChange: frequencyFactor.changePercent,
    totalVisits,
    missedAppointments: missedAppointments.length,
    cancelledAppointments: cancelledAppointments.length,
    hasUpcomingAppointment: upcomingAppointments.length > 0,
    outstandingBalance,
    paymentHistory,
    suggestedAction: '',
    priority: getPriorityFromRiskLevel(riskLevel),
  };

  analysis.suggestedAction = getSuggestedAction(analysis);

  return analysis;
}

/**
 * Analyze churn risk for all active patients
 */
export async function analyzeAllPatientsChurnRisk(
  organizationId: string,
  config: Partial<ChurnPredictionConfig> = {},
  options: {
    minRiskLevel?: ChurnRiskLevel;
    limit?: number;
  } = {}
): Promise<PatientChurnAnalysis[]> {
  const { minRiskLevel = ChurnRiskLevel.LOW, limit = 100 } = options;

  // Get all active patients
  const patients = await prisma.patient.findMany({
    where: { organizationId, status: PatientStatus.ACTIVE },
    select: { id: true },
  });

  const analyses: PatientChurnAnalysis[] = [];

  // Analyze each patient
  for (const patient of patients) {
    const analysis = await analyzePatientChurnRisk(organizationId, patient.id, config);
    if (analysis) {
      const riskOrder = {
        [ChurnRiskLevel.VERY_HIGH]: 5,
        [ChurnRiskLevel.HIGH]: 4,
        [ChurnRiskLevel.MEDIUM]: 3,
        [ChurnRiskLevel.LOW]: 2,
        [ChurnRiskLevel.VERY_LOW]: 1,
      };

      if (riskOrder[analysis.riskLevel] >= riskOrder[minRiskLevel]) {
        analyses.push(analysis);
      }
    }
  }

  // Sort by risk score descending and apply limit
  return analyses.sort((a, b) => b.riskScore - a.riskScore).slice(0, limit);
}

/**
 * Get high-risk patients count
 */
export async function getHighRiskPatientCount(organizationId: string): Promise<{
  veryHigh: number;
  high: number;
  medium: number;
  total: number;
}> {
  const predictions = await prisma.churnPrediction.findMany({
    where: {
      organizationId,
      status: 'active',
      riskLevel: { in: [ChurnRiskLevel.VERY_HIGH, ChurnRiskLevel.HIGH, ChurnRiskLevel.MEDIUM] },
    },
    select: { riskLevel: true },
  });

  return {
    veryHigh: predictions.filter((p) => p.riskLevel === ChurnRiskLevel.VERY_HIGH).length,
    high: predictions.filter((p) => p.riskLevel === ChurnRiskLevel.HIGH).length,
    medium: predictions.filter((p) => p.riskLevel === ChurnRiskLevel.MEDIUM).length,
    total: predictions.length,
  };
}

/**
 * Save churn predictions to database
 */
export async function saveChurnPredictions(
  organizationId: string,
  analyses: PatientChurnAnalysis[]
): Promise<number> {
  let savedCount = 0;

  for (const analysis of analyses) {
    await prisma.churnPrediction.upsert({
      where: {
        patientId: analysis.patientId,
      },
      create: {
        patientId: analysis.patientId,
        organizationId,
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        confidence: analysis.confidence,
        riskFactors: analysis.riskFactors as unknown as object,
        daysSinceLastVisit: analysis.daysSinceLastVisit,
        avgVisitFrequency: analysis.avgVisitFrequency,
        visitFrequencyChange: analysis.visitFrequencyChange,
        totalVisits: analysis.totalVisits,
        missedAppointments: analysis.missedAppointments,
        cancelledAppointments: analysis.cancelledAppointments,
        hasUpcomingAppointment: analysis.hasUpcomingAppointment,
        outstandingBalance: analysis.outstandingBalance,
        paymentHistory: analysis.paymentHistory,
        suggestedAction: analysis.suggestedAction,
        priority: analysis.priority,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
      update: {
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        confidence: analysis.confidence,
        riskFactors: analysis.riskFactors as unknown as object,
        daysSinceLastVisit: analysis.daysSinceLastVisit,
        avgVisitFrequency: analysis.avgVisitFrequency,
        visitFrequencyChange: analysis.visitFrequencyChange,
        totalVisits: analysis.totalVisits,
        missedAppointments: analysis.missedAppointments,
        cancelledAppointments: analysis.cancelledAppointments,
        hasUpcomingAppointment: analysis.hasUpcomingAppointment,
        outstandingBalance: analysis.outstandingBalance,
        paymentHistory: analysis.paymentHistory,
        suggestedAction: analysis.suggestedAction,
        priority: analysis.priority,
        calculatedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    savedCount++;
  }

  return savedCount;
}
