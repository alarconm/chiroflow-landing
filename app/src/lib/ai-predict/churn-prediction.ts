// Churn Prediction - Epic 40: AI Predictive Analytics Agent
// Advanced patient churn prediction with behavioral analysis

import { prisma } from '@/lib/prisma';
import { PatientStatus, RiskType, TrendDirection, PredictionType, PredictionStatus, AppointmentStatus, TreatmentPlanStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type {
  ChurnPredictionConfig,
  ChurnPredictionResult,
  ChurnRiskFactor,
  ChurnBehavioralSignal,
  VisitPatternChange,
  EngagementScoreDetails,
  RetentionAction,
  BatchChurnPredictionOptions,
  BatchChurnPredictionResult,
} from './types';

// Default configuration
const DEFAULT_CONFIG: ChurnPredictionConfig = {
  criticalThreshold: 80,
  highThreshold: 60,
  mediumThreshold: 40,
  lowThreshold: 20,
  factorWeights: {
    visitRecency: 0.25,
    visitFrequency: 0.20,
    noShowRate: 0.15,
    cancellationRate: 0.10,
    engagementScore: 0.10,
    outstandingBalance: 0.10,
    treatmentCompletion: 0.10,
  },
  lookbackMonths: 12,
  maxInactiveDays: 90,
  minDataPoints: 3,
};

const MODEL_VERSION = '1.0.0';

/**
 * Get risk level from churn probability
 */
function getRiskLevel(
  probability: number,
  config: ChurnPredictionConfig
): 'critical' | 'high' | 'medium' | 'low' | 'minimal' {
  if (probability >= config.criticalThreshold) return 'critical';
  if (probability >= config.highThreshold) return 'high';
  if (probability >= config.mediumThreshold) return 'medium';
  if (probability >= config.lowThreshold) return 'low';
  return 'minimal';
}

/**
 * Calculate visit recency factor
 */
function calculateVisitRecencyFactor(daysSinceLastVisit: number, maxDays: number): ChurnRiskFactor {
  let normalizedScore: number;
  let description: string;
  let impact: 'positive' | 'neutral' | 'negative';

  if (daysSinceLastVisit <= 14) {
    normalizedScore = 0;
    description = 'Very recent visit (within 2 weeks)';
    impact = 'positive';
  } else if (daysSinceLastVisit <= 30) {
    normalizedScore = 10;
    description = 'Recent visit (within 1 month)';
    impact = 'positive';
  } else if (daysSinceLastVisit <= 60) {
    normalizedScore = 35;
    description = 'Visit within past 2 months';
    impact = 'neutral';
  } else if (daysSinceLastVisit <= maxDays) {
    normalizedScore = 60;
    description = `Visit within past ${maxDays} days`;
    impact = 'negative';
  } else if (daysSinceLastVisit <= maxDays * 1.5) {
    normalizedScore = 80;
    description = 'Extended gap since last visit';
    impact = 'negative';
  } else {
    normalizedScore = 100;
    description = 'Very long time since last visit';
    impact = 'negative';
  }

  return {
    name: 'Visit Recency',
    weight: DEFAULT_CONFIG.factorWeights.visitRecency,
    rawValue: daysSinceLastVisit,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.visitRecency,
    description,
  };
}

/**
 * Calculate visit frequency change factor
 */
function calculateVisitFrequencyFactor(
  previousVisits: number,
  currentVisits: number,
  periodDays: number
): ChurnRiskFactor {
  const previousFreq = previousVisits / periodDays;
  const currentFreq = currentVisits / periodDays;

  let changePercent = 0;
  if (previousFreq > 0) {
    changePercent = ((previousFreq - currentFreq) / previousFreq) * 100;
  } else if (currentVisits === 0) {
    changePercent = 100; // No visits in either period but had none before
  }

  let normalizedScore: number;
  let description: string;
  let impact: 'positive' | 'neutral' | 'negative';
  let trend: TrendDirection;

  if (changePercent <= -25) {
    normalizedScore = 0;
    description = 'Visit frequency increased significantly';
    impact = 'positive';
    trend = TrendDirection.INCREASING;
  } else if (changePercent <= 0) {
    normalizedScore = 15;
    description = 'Visit frequency stable or improving';
    impact = 'positive';
    trend = TrendDirection.STABLE;
  } else if (changePercent <= 25) {
    normalizedScore = 40;
    description = 'Slight decrease in visit frequency';
    impact = 'neutral';
    trend = TrendDirection.DECREASING;
  } else if (changePercent <= 50) {
    normalizedScore = 65;
    description = 'Moderate decrease in visit frequency';
    impact = 'negative';
    trend = TrendDirection.DECREASING;
  } else {
    normalizedScore = 90;
    description = 'Significant decrease in visit frequency';
    impact = 'negative';
    trend = TrendDirection.DECREASING;
  }

  return {
    name: 'Visit Frequency Change',
    weight: DEFAULT_CONFIG.factorWeights.visitFrequency,
    rawValue: `${changePercent.toFixed(1)}%`,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.visitFrequency,
    description,
    trend,
  };
}

/**
 * Calculate no-show rate factor
 */
function calculateNoShowFactor(noShows: number, totalAppointments: number): ChurnRiskFactor {
  if (totalAppointments === 0) {
    return {
      name: 'No-Show Rate',
      weight: DEFAULT_CONFIG.factorWeights.noShowRate,
      rawValue: 0,
      normalizedScore: 0,
      impact: 'neutral',
      contribution: 0,
      description: 'No appointment history',
    };
  }

  const noShowRate = (noShows / totalAppointments) * 100;
  let normalizedScore: number;
  let description: string;
  let impact: 'positive' | 'neutral' | 'negative';

  if (noShowRate === 0) {
    normalizedScore = 0;
    description = 'No missed appointments';
    impact = 'positive';
  } else if (noShowRate <= 5) {
    normalizedScore = 15;
    description = 'Very rare no-shows (<5%)';
    impact = 'positive';
  } else if (noShowRate <= 15) {
    normalizedScore = 40;
    description = 'Occasional no-shows (5-15%)';
    impact = 'neutral';
  } else if (noShowRate <= 30) {
    normalizedScore = 70;
    description = 'Frequent no-shows (15-30%)';
    impact = 'negative';
  } else {
    normalizedScore = 95;
    description = 'Very high no-show rate (>30%)';
    impact = 'negative';
  }

  return {
    name: 'No-Show Rate',
    weight: DEFAULT_CONFIG.factorWeights.noShowRate,
    rawValue: noShowRate,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.noShowRate,
    description,
  };
}

/**
 * Calculate cancellation rate factor
 */
function calculateCancellationFactor(cancellations: number, totalAppointments: number): ChurnRiskFactor {
  if (totalAppointments === 0) {
    return {
      name: 'Cancellation Rate',
      weight: DEFAULT_CONFIG.factorWeights.cancellationRate,
      rawValue: 0,
      normalizedScore: 0,
      impact: 'neutral',
      contribution: 0,
      description: 'No appointment history',
    };
  }

  const cancellationRate = (cancellations / totalAppointments) * 100;
  let normalizedScore: number;
  let description: string;
  let impact: 'positive' | 'neutral' | 'negative';

  if (cancellationRate <= 5) {
    normalizedScore = 0;
    description = 'Very low cancellation rate';
    impact = 'positive';
  } else if (cancellationRate <= 15) {
    normalizedScore = 25;
    description = 'Normal cancellation rate';
    impact = 'positive';
  } else if (cancellationRate <= 30) {
    normalizedScore = 50;
    description = 'Elevated cancellation rate';
    impact = 'neutral';
  } else if (cancellationRate <= 50) {
    normalizedScore = 75;
    description = 'High cancellation rate';
    impact = 'negative';
  } else {
    normalizedScore = 95;
    description = 'Very high cancellation rate';
    impact = 'negative';
  }

  return {
    name: 'Cancellation Rate',
    weight: DEFAULT_CONFIG.factorWeights.cancellationRate,
    rawValue: cancellationRate,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.cancellationRate,
    description,
  };
}

/**
 * Calculate engagement score
 */
function calculateEngagementScore(
  hasPortal: boolean,
  recentForms: number,
  recentMessages: number,
  appointmentAttendance: number,
  paymentTimeliness: number
): { factor: ChurnRiskFactor; details: EngagementScoreDetails } {
  // Component scores (0-100)
  const portalActivity = hasPortal ? 80 : 20;
  const formCompletions = Math.min(100, recentForms * 25);
  const messageResponsiveness = Math.min(100, recentMessages * 20);
  const attendanceScore = appointmentAttendance * 100;
  const paymentScore = paymentTimeliness * 100;

  // Overall engagement score (weighted average)
  const overallScore =
    portalActivity * 0.15 +
    formCompletions * 0.20 +
    messageResponsiveness * 0.15 +
    attendanceScore * 0.30 +
    paymentScore * 0.20;

  // Invert for risk (high engagement = low risk)
  const riskScore = 100 - overallScore;

  let description: string;
  let impact: 'positive' | 'neutral' | 'negative';

  if (overallScore >= 70) {
    description = 'Highly engaged patient';
    impact = 'positive';
  } else if (overallScore >= 50) {
    description = 'Moderately engaged patient';
    impact = 'neutral';
  } else if (overallScore >= 30) {
    description = 'Low engagement';
    impact = 'negative';
  } else {
    description = 'Very low engagement';
    impact = 'negative';
  }

  const details: EngagementScoreDetails = {
    overallScore,
    components: {
      portalActivity,
      formCompletions,
      messageResponsiveness,
      appointmentAttendance: attendanceScore,
      paymentTimeliness: paymentScore,
    },
    trend: TrendDirection.STABLE,
    lastEngagementDate: new Date(),
  };

  const factor: ChurnRiskFactor = {
    name: 'Engagement Score',
    weight: DEFAULT_CONFIG.factorWeights.engagementScore,
    rawValue: overallScore,
    normalizedScore: riskScore,
    impact,
    contribution: riskScore * DEFAULT_CONFIG.factorWeights.engagementScore,
    description,
  };

  return { factor, details };
}

/**
 * Calculate outstanding balance factor
 */
function calculateBalanceFactor(balance: number, avgVisitValue: number): ChurnRiskFactor {
  if (balance <= 0) {
    return {
      name: 'Outstanding Balance',
      weight: DEFAULT_CONFIG.factorWeights.outstandingBalance,
      rawValue: 0,
      normalizedScore: 0,
      impact: 'positive',
      contribution: 0,
      description: 'No outstanding balance',
    };
  }

  const visitsWorth = avgVisitValue > 0 ? balance / avgVisitValue : balance / 100;
  let normalizedScore: number;
  let description: string;
  let impact: 'positive' | 'neutral' | 'negative';

  if (visitsWorth <= 0.5) {
    normalizedScore = 10;
    description = 'Minimal outstanding balance';
    impact = 'positive';
  } else if (visitsWorth <= 1) {
    normalizedScore = 25;
    description = 'Small outstanding balance';
    impact = 'neutral';
  } else if (visitsWorth <= 2) {
    normalizedScore = 50;
    description = 'Moderate outstanding balance';
    impact = 'neutral';
  } else if (visitsWorth <= 4) {
    normalizedScore = 75;
    description = 'Significant outstanding balance';
    impact = 'negative';
  } else {
    normalizedScore = 95;
    description = 'Large outstanding balance';
    impact = 'negative';
  }

  return {
    name: 'Outstanding Balance',
    weight: DEFAULT_CONFIG.factorWeights.outstandingBalance,
    rawValue: balance,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.outstandingBalance,
    description,
  };
}

/**
 * Calculate treatment completion factor
 */
function calculateTreatmentCompletionFactor(
  completedVisits: number,
  plannedVisits: number
): ChurnRiskFactor {
  if (plannedVisits === 0) {
    return {
      name: 'Treatment Completion',
      weight: DEFAULT_CONFIG.factorWeights.treatmentCompletion,
      rawValue: 0,
      normalizedScore: 30,
      impact: 'neutral',
      contribution: 30 * DEFAULT_CONFIG.factorWeights.treatmentCompletion,
      description: 'No active treatment plan',
    };
  }

  const completionRate = (completedVisits / plannedVisits) * 100;
  let normalizedScore: number;
  let description: string;
  let impact: 'positive' | 'neutral' | 'negative';

  if (completionRate >= 90) {
    normalizedScore = 0;
    description = 'Excellent treatment plan adherence';
    impact = 'positive';
  } else if (completionRate >= 70) {
    normalizedScore = 20;
    description = 'Good treatment plan adherence';
    impact = 'positive';
  } else if (completionRate >= 50) {
    normalizedScore = 45;
    description = 'Moderate treatment plan adherence';
    impact = 'neutral';
  } else if (completionRate >= 30) {
    normalizedScore = 70;
    description = 'Low treatment plan adherence';
    impact = 'negative';
  } else {
    normalizedScore = 90;
    description = 'Very low treatment plan adherence';
    impact = 'negative';
  }

  return {
    name: 'Treatment Completion',
    weight: DEFAULT_CONFIG.factorWeights.treatmentCompletion,
    rawValue: completionRate,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.treatmentCompletion,
    description,
  };
}

/**
 * Detect behavioral signals
 */
function detectBehavioralSignals(
  daysSinceLastVisit: number,
  noShowRate: number,
  cancellationRate: number,
  visitTrend: TrendDirection,
  hasUpcoming: boolean,
  engagementScore: number,
  balanceRatio: number
): ChurnBehavioralSignal[] {
  const signals: ChurnBehavioralSignal[] = [];

  // Extended absence
  if (daysSinceLastVisit > 60) {
    signals.push({
      signal: 'extended_absence',
      detected: true,
      severity: daysSinceLastVisit > 120 ? 'critical' : daysSinceLastVisit > 90 ? 'high' : 'medium',
      description: `No visit in ${daysSinceLastVisit} days`,
      detectedAt: new Date(),
    });
  }

  // Declining visit frequency
  if (visitTrend === TrendDirection.DECREASING) {
    signals.push({
      signal: 'declining_frequency',
      detected: true,
      severity: 'medium',
      description: 'Visit frequency is declining',
      detectedAt: new Date(),
    });
  }

  // High no-show pattern
  if (noShowRate > 20) {
    signals.push({
      signal: 'high_no_show',
      detected: true,
      severity: noShowRate > 40 ? 'high' : 'medium',
      description: `No-show rate of ${noShowRate.toFixed(0)}%`,
      detectedAt: new Date(),
    });
  }

  // High cancellation pattern
  if (cancellationRate > 30) {
    signals.push({
      signal: 'high_cancellation',
      detected: true,
      severity: cancellationRate > 50 ? 'high' : 'medium',
      description: `Cancellation rate of ${cancellationRate.toFixed(0)}%`,
      detectedAt: new Date(),
    });
  }

  // No upcoming appointments
  if (!hasUpcoming && daysSinceLastVisit > 30) {
    signals.push({
      signal: 'no_upcoming_appointment',
      detected: true,
      severity: daysSinceLastVisit > 60 ? 'high' : 'medium',
      description: 'No scheduled upcoming appointments',
      detectedAt: new Date(),
    });
  }

  // Low engagement
  if (engagementScore < 30) {
    signals.push({
      signal: 'low_engagement',
      detected: true,
      severity: engagementScore < 15 ? 'high' : 'medium',
      description: 'Very low patient engagement',
      detectedAt: new Date(),
    });
  }

  // Balance concerns
  if (balanceRatio > 3) {
    signals.push({
      signal: 'balance_barrier',
      detected: true,
      severity: balanceRatio > 5 ? 'high' : 'medium',
      description: 'Outstanding balance may be a barrier',
      detectedAt: new Date(),
    });
  }

  return signals;
}

/**
 * Generate retention actions based on risk factors
 */
function generateRetentionActions(
  riskFactors: ChurnRiskFactor[],
  behavioralSignals: ChurnBehavioralSignal[],
  riskLevel: string
): RetentionAction[] {
  const actions: RetentionAction[] = [];
  const topFactor = riskFactors.sort((a, b) => b.contribution - a.contribution)[0];

  // Always recommend based on top risk factor
  if (topFactor) {
    switch (topFactor.name) {
      case 'Visit Recency':
        actions.push({
          action: 'Send reactivation outreach',
          description: 'Contact patient with a personalized message about resuming care',
          priority: riskLevel === 'critical' ? 'immediate' : 'soon',
          expectedImpact: 'high',
          suggestedBy: 'Visit Recency',
          automatable: true,
        });
        break;
      case 'Visit Frequency Change':
        actions.push({
          action: 'Review and adjust treatment plan',
          description: 'Schedule a care consultation to discuss treatment progress and adjustments',
          priority: 'soon',
          expectedImpact: 'high',
          suggestedBy: 'Visit Frequency Change',
          automatable: false,
        });
        break;
      case 'No-Show Rate':
        actions.push({
          action: 'Implement enhanced reminders',
          description: 'Set up multiple reminder touchpoints (SMS, email, call) before appointments',
          priority: 'scheduled',
          expectedImpact: 'medium',
          suggestedBy: 'No-Show Rate',
          automatable: true,
        });
        break;
      case 'Outstanding Balance':
        actions.push({
          action: 'Offer payment plan',
          description: 'Proactively reach out to discuss payment options and financial assistance',
          priority: 'soon',
          expectedImpact: 'high',
          suggestedBy: 'Outstanding Balance',
          automatable: false,
        });
        break;
      case 'Engagement Score':
        actions.push({
          action: 'Increase engagement touchpoints',
          description: 'Send educational content and encourage portal registration',
          priority: 'scheduled',
          expectedImpact: 'medium',
          suggestedBy: 'Engagement Score',
          automatable: true,
        });
        break;
    }
  }

  // Add signal-based actions
  for (const signal of behavioralSignals) {
    if (signal.severity === 'critical' || signal.severity === 'high') {
      if (signal.signal === 'no_upcoming_appointment') {
        actions.push({
          action: 'Proactive scheduling call',
          description: 'Call patient to schedule their next appointment',
          priority: 'immediate',
          expectedImpact: 'high',
          suggestedBy: 'No Upcoming Appointment',
          automatable: false,
        });
      }
      if (signal.signal === 'extended_absence') {
        actions.push({
          action: 'Wellness check-in',
          description: 'Personal outreach to check on patient wellbeing and address any concerns',
          priority: 'immediate',
          expectedImpact: 'high',
          suggestedBy: 'Extended Absence',
          automatable: false,
        });
      }
    }
  }

  // Remove duplicates and limit to top 5
  const uniqueActions = actions.filter(
    (action, index, self) => index === self.findIndex((a) => a.action === action.action)
  );

  return uniqueActions.slice(0, 5);
}

/**
 * Predict churn risk for a single patient
 */
export async function predictChurn(
  organizationId: string,
  patientId: string,
  config: Partial<ChurnPredictionConfig> = {}
): Promise<ChurnPredictionResult | null> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const lookbackDate = new Date();
  lookbackDate.setMonth(lookbackDate.getMonth() - finalConfig.lookbackMonths);
  const halfwayDate = new Date();
  halfwayDate.setMonth(halfwayDate.getMonth() - finalConfig.lookbackMonths / 2);
  const recentDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Fetch patient data with all relevant relations
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
      },
      payments: {
        where: { paymentDate: { gte: lookbackDate } },
      },
      formSubmissions: {
        where: { submittedAt: { gte: recentDate } },
      },
      messageThreads: {
        where: { createdAt: { gte: recentDate } },
      },
      treatmentPlans: {
        where: { status: TreatmentPlanStatus.ACTIVE },
      },
      portalUser: true,
    },
  });

  if (!patient || !patient.demographics) return null;

  // Calculate basic metrics
  const appointments = patient.appointments;
  const completedAppointments = appointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.CHECKED_IN
  );
  const noShowAppointments = appointments.filter((a) => a.status === AppointmentStatus.NO_SHOW);
  const cancelledAppointments = appointments.filter((a) => a.status === AppointmentStatus.CANCELLED);
  const upcomingAppointments = appointments.filter(
    (a) => new Date(a.startTime) > new Date() && a.status === AppointmentStatus.SCHEDULED
  );

  // Visit timing
  const lastVisit = completedAppointments[0]?.startTime;
  const daysSinceLastVisit = lastVisit
    ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24))
    : 365;

  // Visit frequency (split by period)
  const firstPeriodVisits = completedAppointments.filter(
    (a) => new Date(a.startTime) < halfwayDate
  ).length;
  const secondPeriodVisits = completedAppointments.filter(
    (a) => new Date(a.startTime) >= halfwayDate
  ).length;
  const periodDays = (finalConfig.lookbackMonths / 2) * 30;

  // Financial metrics
  const outstandingBalance = patient.charges.reduce((sum, c) => sum + Number(c.balance), 0);
  const totalCharges = patient.charges.reduce((sum, c) => sum + Number(c.fee), 0);
  const avgVisitValue = completedAppointments.length > 0 ? totalCharges / completedAppointments.length : 100;

  // Payment timeliness (simplified)
  const paymentTimeliness = outstandingBalance <= 0 ? 1 : outstandingBalance < avgVisitValue ? 0.7 : 0.4;

  // Treatment plan
  const activePlan = patient.treatmentPlans[0];
  const plannedVisits = activePlan?.plannedVisits || 0;
  const completedVisits = activePlan?.completedVisits || 0;

  // Appointment attendance rate
  const totalScheduled = completedAppointments.length + noShowAppointments.length;
  const attendanceRate = totalScheduled > 0 ? completedAppointments.length / totalScheduled : 1;

  // Calculate all risk factors
  const visitRecencyFactor = calculateVisitRecencyFactor(daysSinceLastVisit, finalConfig.maxInactiveDays);
  const visitFrequencyFactor = calculateVisitFrequencyFactor(firstPeriodVisits, secondPeriodVisits, periodDays);
  const noShowFactor = calculateNoShowFactor(noShowAppointments.length, appointments.length);
  const cancellationFactor = calculateCancellationFactor(cancelledAppointments.length, appointments.length);
  const { factor: engagementFactor, details: engagementDetails } = calculateEngagementScore(
    !!patient.portalUser,
    patient.formSubmissions.length,
    patient.messageThreads.length,
    attendanceRate,
    paymentTimeliness
  );
  const balanceFactor = calculateBalanceFactor(outstandingBalance, avgVisitValue);
  const treatmentFactor = calculateTreatmentCompletionFactor(completedVisits, plannedVisits);

  const riskFactors: ChurnRiskFactor[] = [
    visitRecencyFactor,
    visitFrequencyFactor,
    noShowFactor,
    cancellationFactor,
    engagementFactor,
    balanceFactor,
    treatmentFactor,
  ];

  // Calculate churn probability
  const churnProbability = riskFactors.reduce((sum, f) => sum + f.contribution, 0);
  const riskLevel = getRiskLevel(churnProbability, finalConfig);

  // Calculate confidence
  let confidence = 0.5;
  if (completedAppointments.length >= finalConfig.minDataPoints) confidence += 0.15;
  if (completedAppointments.length >= 10) confidence += 0.10;
  if (appointments.length >= 5) confidence += 0.10;
  if (patient.portalUser) confidence += 0.05;
  if (patient.treatmentPlans.length > 0) confidence += 0.05;
  confidence = Math.min(0.95, confidence);

  // Behavioral signals
  const behavioralSignals = detectBehavioralSignals(
    daysSinceLastVisit,
    noShowFactor.rawValue as number,
    cancellationFactor.rawValue as number,
    visitFrequencyFactor.trend || TrendDirection.STABLE,
    upcomingAppointments.length > 0,
    engagementDetails.overallScore,
    outstandingBalance / avgVisitValue
  );

  // Visit pattern analysis
  const avgDaysBetweenVisits =
    completedAppointments.length > 1
      ? daysSinceLastVisit / completedAppointments.length
      : daysSinceLastVisit;

  const visitPatternChange: VisitPatternChange = {
    previousPeriodVisits: firstPeriodVisits,
    currentPeriodVisits: secondPeriodVisits,
    changePercent: firstPeriodVisits > 0
      ? ((firstPeriodVisits - secondPeriodVisits) / firstPeriodVisits) * 100
      : 0,
    trend: visitFrequencyFactor.trend || TrendDirection.STABLE,
    averageDaysBetweenVisits: avgDaysBetweenVisits,
    expectedNextVisitDate: lastVisit
      ? new Date(new Date(lastVisit).getTime() + avgDaysBetweenVisits * 24 * 60 * 60 * 1000)
      : undefined,
    daysOverdue: Math.max(0, daysSinceLastVisit - avgDaysBetweenVisits),
  };

  // Generate retention actions
  const retentionActions = generateRetentionActions(riskFactors, behavioralSignals, riskLevel);

  // Top risk factors
  const sortedFactors = [...riskFactors].sort((a, b) => b.contribution - a.contribution);
  const topRiskFactors = sortedFactors.slice(0, 3).map((f) => f.name);

  // Priority score (for ranking)
  const priorityScore =
    churnProbability * 0.6 +
    (riskLevel === 'critical' ? 30 : riskLevel === 'high' ? 20 : riskLevel === 'medium' ? 10 : 0) +
    behavioralSignals.filter((s) => s.severity === 'critical' || s.severity === 'high').length * 5;

  const patientName = `${patient.demographics.firstName} ${patient.demographics.lastName}`;

  return {
    patientId: patient.id,
    patientName,
    churnProbability,
    confidenceScore: confidence,
    riskLevel,
    riskFactors,
    topRiskFactors,
    behavioralSignals,
    visitPatternChange,
    engagementDetails,
    retentionActions,
    priorityScore,
    predictionDate: new Date(),
    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    modelVersion: MODEL_VERSION,
  };
}

/**
 * Batch predict churn for all patients
 */
export async function batchPredictChurn(
  options: BatchChurnPredictionOptions
): Promise<BatchChurnPredictionResult> {
  const startTime = Date.now();
  const { organizationId, minRiskLevel = 'low', limit = 100 } = options;

  // Get all active patients
  const patients = await prisma.patient.findMany({
    where: { organizationId, status: PatientStatus.ACTIVE },
    select: { id: true },
    take: 500, // Process max 500 at a time
  });

  const results: ChurnPredictionResult[] = [];
  const byRiskLevel = { critical: 0, high: 0, medium: 0, low: 0, minimal: 0 };
  let errorCount = 0;

  // Analyze each patient
  for (const patient of patients) {
    try {
      const prediction = await predictChurn(organizationId, patient.id);
      if (prediction) {
        byRiskLevel[prediction.riskLevel]++;

        // Filter by minimum risk level
        const riskOrder = { critical: 5, high: 4, medium: 3, low: 2, minimal: 1 };
        if (riskOrder[prediction.riskLevel] >= riskOrder[minRiskLevel]) {
          results.push(prediction);
        }
      }
    } catch {
      errorCount++;
    }
  }

  // Sort by priority and limit
  const sortedResults = results
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit);

  return {
    processedCount: patients.length,
    savedCount: sortedResults.length,
    errorCount,
    byRiskLevel,
    processingTimeMs: Date.now() - startTime,
    topAtRiskPatients: sortedResults.slice(0, 10),
  };
}

/**
 * Save churn prediction to database using new Epic 40 models
 */
export async function saveChurnPrediction(
  organizationId: string,
  prediction: ChurnPredictionResult
): Promise<void> {
  // Prepare JSON-safe data
  const predictionJson = {
    churnProbability: prediction.churnProbability,
    riskLevel: prediction.riskLevel,
    topRiskFactors: prediction.topRiskFactors,
    retentionActions: prediction.retentionActions.map((a) => ({
      action: a.action,
      description: a.description,
      priority: a.priority,
      expectedImpact: a.expectedImpact,
    })),
    behavioralSignals: prediction.behavioralSignals.map((s) => s.signal),
  } as Prisma.InputJsonValue;

  const featuresJson = prediction.riskFactors.map((f) => ({
    name: f.name,
    weight: f.weight,
    rawValue: f.rawValue,
    normalizedScore: f.normalizedScore,
    impact: f.impact,
    contribution: f.contribution,
    description: f.description,
  })) as Prisma.InputJsonValue;

  const featureImportanceJson = Object.fromEntries(
    prediction.riskFactors.map((f) => [f.name, f.contribution])
  ) as Prisma.InputJsonValue;

  // Save to Prediction model
  await prisma.prediction.upsert({
    where: {
      id: `churn-${prediction.patientId}`,
    },
    create: {
      id: `churn-${prediction.patientId}`,
      organizationId,
      patientId: prediction.patientId,
      predictionType: PredictionType.CHURN,
      status: PredictionStatus.PENDING,
      targetEntityType: 'Patient',
      targetEntityId: prediction.patientId,
      prediction: predictionJson,
      confidence: prediction.confidenceScore,
      confidenceLevel: prediction.confidenceScore >= 0.8 ? 'high' : prediction.confidenceScore >= 0.6 ? 'medium' : 'low',
      modelName: 'churn-predictor',
      modelVersion: prediction.modelVersion,
      features: featuresJson,
      featureImportance: featureImportanceJson,
      validUntil: prediction.validUntil,
      horizon: '7d',
    },
    update: {
      status: PredictionStatus.PENDING,
      prediction: predictionJson,
      confidence: prediction.confidenceScore,
      confidenceLevel: prediction.confidenceScore >= 0.8 ? 'high' : prediction.confidenceScore >= 0.6 ? 'medium' : 'low',
      features: featuresJson,
      featureImportance: featureImportanceJson,
      validUntil: prediction.validUntil,
      predictionDate: new Date(),
    },
  });

  // Save to PatientRiskScore model
  const factorsJson = prediction.riskFactors.map((f) => ({
    name: f.name,
    weight: f.weight,
    rawValue: f.rawValue,
    normalizedScore: f.normalizedScore,
    impact: f.impact,
    contribution: f.contribution,
    description: f.description,
  })) as Prisma.InputJsonValue;

  await prisma.patientRiskScore.upsert({
    where: {
      patientId_riskType_organizationId: {
        patientId: prediction.patientId,
        riskType: RiskType.CHURN,
        organizationId,
      },
    },
    create: {
      organizationId,
      patientId: prediction.patientId,
      riskType: RiskType.CHURN,
      score: Math.round(prediction.churnProbability),
      scoreLevel: prediction.riskLevel,
      confidence: prediction.confidenceScore,
      factors: factorsJson,
      topFactors: prediction.topRiskFactors,
      alertThreshold: 60,
      isAboveThreshold: prediction.churnProbability >= 60,
      interventionRecommended: prediction.retentionActions[0]?.description || '',
      expiresAt: prediction.validUntil,
    },
    update: {
      score: Math.round(prediction.churnProbability),
      scoreLevel: prediction.riskLevel,
      confidence: prediction.confidenceScore,
      factors: factorsJson,
      topFactors: prediction.topRiskFactors,
      isAboveThreshold: prediction.churnProbability >= 60,
      interventionRecommended: prediction.retentionActions[0]?.description || '',
      calculatedAt: new Date(),
      expiresAt: prediction.validUntil,
    },
  });
}

/**
 * Track prediction accuracy
 */
export async function trackChurnPredictionAccuracy(
  organizationId: string,
  patientId: string,
  actuallyChurned: boolean
): Promise<void> {
  const prediction = await prisma.prediction.findFirst({
    where: {
      organizationId,
      patientId,
      predictionType: PredictionType.CHURN,
      status: PredictionStatus.PENDING,
    },
    orderBy: { predictionDate: 'desc' },
  });

  if (!prediction) return;

  const predictionData = prediction.prediction as { churnProbability?: number };
  const predictedChurn = (predictionData.churnProbability || 0) >= 50;
  const wasAccurate = predictedChurn === actuallyChurned;

  await prisma.prediction.update({
    where: { id: prediction.id },
    data: {
      status: PredictionStatus.VALIDATED,
      actualOutcome: { churned: actuallyChurned },
      outcomeDate: new Date(),
      wasAccurate,
      accuracyScore: wasAccurate ? 1 : 0,
      accuracyNotes: actuallyChurned
        ? 'Patient confirmed churned'
        : 'Patient still active',
    },
  });
}

/**
 * Get churn prediction accuracy metrics
 */
export async function getChurnPredictionAccuracy(
  organizationId: string
): Promise<{
  totalPredictions: number;
  validatedPredictions: number;
  accuracy: number;
  byRiskLevel: { level: string; predictions: number; accuracy: number }[];
}> {
  const predictions = await prisma.prediction.findMany({
    where: {
      organizationId,
      predictionType: PredictionType.CHURN,
      status: PredictionStatus.VALIDATED,
    },
    select: {
      prediction: true,
      wasAccurate: true,
    },
  });

  const totalPredictions = await prisma.prediction.count({
    where: { organizationId, predictionType: PredictionType.CHURN },
  });

  const validatedPredictions = predictions.length;
  const accuratePredictions = predictions.filter((p) => p.wasAccurate).length;
  const accuracy = validatedPredictions > 0 ? accuratePredictions / validatedPredictions : 0;

  // Group by risk level
  const byRiskLevel: { level: string; predictions: number; accuracy: number }[] = [];
  const levels = ['critical', 'high', 'medium', 'low', 'minimal'];

  for (const level of levels) {
    const levelPredictions = predictions.filter((p) => {
      const data = p.prediction as { riskLevel?: string };
      return data.riskLevel === level;
    });
    const levelAccurate = levelPredictions.filter((p) => p.wasAccurate).length;

    byRiskLevel.push({
      level,
      predictions: levelPredictions.length,
      accuracy: levelPredictions.length > 0 ? levelAccurate / levelPredictions.length : 0,
    });
  }

  return {
    totalPredictions,
    validatedPredictions,
    accuracy,
    byRiskLevel,
  };
}
