// No-Show Prediction - Epic 40: AI Predictive Analytics Agent
// Advanced appointment no-show prediction with proactive management

import { prisma } from '@/lib/prisma';
import {
  PatientStatus,
  RiskType,
  TrendDirection,
  PredictionType,
  PredictionStatus,
  AppointmentStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type {
  NoShowPredictionConfig,
  NoShowPredictionResult,
  NoShowRiskFactor,
  PatientNoShowHistory,
  AppointmentCharacteristics,
  ExternalFactor,
  NoShowIntervention,
  OverbookingSuggestion,
  ConfirmationStrategy,
  BatchNoShowPredictionOptions,
  BatchNoShowPredictionResult,
  NoShowAccuracyMetrics,
} from './types';

// Default configuration
const DEFAULT_CONFIG: NoShowPredictionConfig = {
  criticalThreshold: 80,
  highThreshold: 60,
  mediumThreshold: 40,
  lowThreshold: 20,
  factorWeights: {
    historicalNoShowRate: 0.25,
    daysSinceLastVisit: 0.10,
    appointmentLeadTime: 0.12,
    appointmentTimeOfDay: 0.08,
    dayOfWeek: 0.08,
    appointmentType: 0.10,
    weatherForecast: 0.05,
    patientAge: 0.05,
    outstandingBalance: 0.08,
    confirmationStatus: 0.09,
  },
  lookbackMonths: 12,
  minAppointments: 3,
  overbookingThreshold: 15,
};

const MODEL_VERSION = '1.0.0';

// Day names for display
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Get risk level from no-show probability
 */
function getRiskLevel(
  probability: number,
  config: NoShowPredictionConfig
): 'critical' | 'high' | 'medium' | 'low' | 'minimal' {
  if (probability >= config.criticalThreshold) return 'critical';
  if (probability >= config.highThreshold) return 'high';
  if (probability >= config.mediumThreshold) return 'medium';
  if (probability >= config.lowThreshold) return 'low';
  return 'minimal';
}

/**
 * Get time of day category
 */
function getTimeOfDay(hour: number): 'morning' | 'midday' | 'afternoon' | 'evening' {
  if (hour < 10) return 'morning';
  if (hour < 13) return 'midday';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Calculate historical no-show rate factor
 */
function calculateHistoricalNoShowFactor(
  noShowRate: number,
  recentNoShowRate: number,
  totalAppointments: number,
  minAppointments: number
): NoShowRiskFactor {
  // Weight recent rate more heavily
  const weightedRate = totalAppointments >= minAppointments
    ? (noShowRate * 0.4 + recentNoShowRate * 0.6)
    : noShowRate;

  let normalizedScore: number;
  let description: string;
  let impact: 'increases_risk' | 'neutral' | 'decreases_risk';

  if (weightedRate === 0) {
    normalizedScore = 0;
    description = 'No history of no-shows';
    impact = 'decreases_risk';
  } else if (weightedRate <= 5) {
    normalizedScore = 15;
    description = 'Very low no-show history (<5%)';
    impact = 'decreases_risk';
  } else if (weightedRate <= 10) {
    normalizedScore = 35;
    description = 'Low no-show history (5-10%)';
    impact = 'neutral';
  } else if (weightedRate <= 20) {
    normalizedScore = 55;
    description = 'Moderate no-show history (10-20%)';
    impact = 'increases_risk';
  } else if (weightedRate <= 35) {
    normalizedScore = 75;
    description = 'High no-show history (20-35%)';
    impact = 'increases_risk';
  } else {
    normalizedScore = 95;
    description = 'Very high no-show history (>35%)';
    impact = 'increases_risk';
  }

  // Adjust for insufficient data
  if (totalAppointments < minAppointments) {
    normalizedScore = Math.max(30, normalizedScore * 0.7); // Regress toward mean
    description += ' (limited history)';
  }

  return {
    name: 'Historical No-Show Rate',
    weight: DEFAULT_CONFIG.factorWeights.historicalNoShowRate,
    rawValue: `${weightedRate.toFixed(1)}%`,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.historicalNoShowRate,
    description,
  };
}

/**
 * Calculate days since last visit factor
 */
function calculateRecencyFactor(daysSinceLastVisit: number | null): NoShowRiskFactor {
  if (daysSinceLastVisit === null) {
    return {
      name: 'Days Since Last Visit',
      weight: DEFAULT_CONFIG.factorWeights.daysSinceLastVisit,
      rawValue: 'N/A',
      normalizedScore: 50, // Unknown - regress to mean
      impact: 'neutral',
      contribution: 50 * DEFAULT_CONFIG.factorWeights.daysSinceLastVisit,
      description: 'New patient - no visit history',
    };
  }

  let normalizedScore: number;
  let description: string;
  let impact: 'increases_risk' | 'neutral' | 'decreases_risk';

  if (daysSinceLastVisit <= 14) {
    normalizedScore = 10;
    description = 'Very recent visitor (within 2 weeks)';
    impact = 'decreases_risk';
  } else if (daysSinceLastVisit <= 30) {
    normalizedScore = 20;
    description = 'Recent visitor (within 1 month)';
    impact = 'decreases_risk';
  } else if (daysSinceLastVisit <= 60) {
    normalizedScore = 35;
    description = 'Moderate gap since last visit';
    impact = 'neutral';
  } else if (daysSinceLastVisit <= 120) {
    normalizedScore = 55;
    description = 'Extended gap since last visit (2-4 months)';
    impact = 'increases_risk';
  } else {
    normalizedScore = 75;
    description = 'Very long gap since last visit (>4 months)';
    impact = 'increases_risk';
  }

  return {
    name: 'Days Since Last Visit',
    weight: DEFAULT_CONFIG.factorWeights.daysSinceLastVisit,
    rawValue: daysSinceLastVisit,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.daysSinceLastVisit,
    description,
  };
}

/**
 * Calculate appointment lead time factor
 */
function calculateLeadTimeFactor(leadTimeDays: number): NoShowRiskFactor {
  let normalizedScore: number;
  let description: string;
  let impact: 'increases_risk' | 'neutral' | 'decreases_risk';

  if (leadTimeDays <= 2) {
    normalizedScore = 10;
    description = 'Booked within 2 days - high urgency';
    impact = 'decreases_risk';
  } else if (leadTimeDays <= 7) {
    normalizedScore = 20;
    description = 'Booked within 1 week - good commitment';
    impact = 'decreases_risk';
  } else if (leadTimeDays <= 14) {
    normalizedScore = 35;
    description = 'Booked 1-2 weeks ahead';
    impact = 'neutral';
  } else if (leadTimeDays <= 30) {
    normalizedScore = 50;
    description = 'Booked 2-4 weeks ahead';
    impact = 'neutral';
  } else if (leadTimeDays <= 60) {
    normalizedScore = 70;
    description = 'Booked 1-2 months ahead - may forget';
    impact = 'increases_risk';
  } else {
    normalizedScore = 85;
    description = 'Booked >2 months ahead - high forget risk';
    impact = 'increases_risk';
  }

  return {
    name: 'Appointment Lead Time',
    weight: DEFAULT_CONFIG.factorWeights.appointmentLeadTime,
    rawValue: `${leadTimeDays} days`,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.appointmentLeadTime,
    description,
  };
}

/**
 * Calculate time of day factor
 */
function calculateTimeOfDayFactor(
  hour: number,
  preferredTime: string | null
): NoShowRiskFactor {
  const timeOfDay = getTimeOfDay(hour);
  let baseScore: number;
  let description: string;

  // Research shows early morning and late afternoon have higher no-show rates
  switch (timeOfDay) {
    case 'morning':
      baseScore = hour < 8 ? 55 : 35;
      description = hour < 8 ? 'Very early morning slot' : 'Morning slot';
      break;
    case 'midday':
      baseScore = 25;
      description = 'Midday slot - typically low no-show';
      break;
    case 'afternoon':
      baseScore = 30;
      description = 'Afternoon slot';
      break;
    case 'evening':
      baseScore = hour >= 18 ? 60 : 45;
      description = hour >= 18 ? 'Late evening slot' : 'Evening slot';
      break;
    default:
      baseScore = 35;
      description = 'Standard time slot';
  }

  // Adjust if we know patient's preferred time
  if (preferredTime && preferredTime === timeOfDay) {
    baseScore = Math.max(10, baseScore - 15);
    description += ' (matches preference)';
  }

  const impact: 'increases_risk' | 'neutral' | 'decreases_risk' =
    baseScore <= 30 ? 'decreases_risk' : baseScore <= 50 ? 'neutral' : 'increases_risk';

  return {
    name: 'Appointment Time',
    weight: DEFAULT_CONFIG.factorWeights.appointmentTimeOfDay,
    rawValue: `${hour}:00 (${timeOfDay})`,
    normalizedScore: baseScore,
    impact,
    contribution: baseScore * DEFAULT_CONFIG.factorWeights.appointmentTimeOfDay,
    description,
  };
}

/**
 * Calculate day of week factor
 */
function calculateDayOfWeekFactor(dayOfWeek: number): NoShowRiskFactor {
  // Research shows Mondays and Fridays have higher no-show rates
  const noShowRatesByDay: Record<number, { score: number; note: string }> = {
    0: { score: 65, note: 'Sundays have high no-show rates' },
    1: { score: 55, note: 'Mondays have elevated no-show rates' },
    2: { score: 30, note: 'Tuesdays have low no-show rates' },
    3: { score: 25, note: 'Wednesdays have lowest no-show rates' },
    4: { score: 35, note: 'Thursdays have average no-show rates' },
    5: { score: 50, note: 'Fridays have elevated no-show rates' },
    6: { score: 60, note: 'Saturdays have high no-show rates' },
  };

  const dayData = noShowRatesByDay[dayOfWeek] || { score: 40, note: 'Unknown day' };
  const impact: 'increases_risk' | 'neutral' | 'decreases_risk' =
    dayData.score <= 35 ? 'decreases_risk' : dayData.score <= 50 ? 'neutral' : 'increases_risk';

  return {
    name: 'Day of Week',
    weight: DEFAULT_CONFIG.factorWeights.dayOfWeek,
    rawValue: DAY_NAMES[dayOfWeek],
    normalizedScore: dayData.score,
    impact,
    contribution: dayData.score * DEFAULT_CONFIG.factorWeights.dayOfWeek,
    description: dayData.note,
  };
}

/**
 * Calculate appointment type factor
 */
function calculateAppointmentTypeFactor(
  isNewPatient: boolean,
  appointmentTypeName: string
): NoShowRiskFactor {
  let normalizedScore: number;
  let description: string;
  let impact: 'increases_risk' | 'neutral' | 'decreases_risk';

  // New patients have higher no-show rates
  if (isNewPatient) {
    normalizedScore = 65;
    description = 'New patient appointment - higher no-show risk';
    impact = 'increases_risk';
  } else {
    const lowerType = appointmentTypeName.toLowerCase();
    if (lowerType.includes('follow') || lowerType.includes('established')) {
      normalizedScore = 25;
      description = 'Follow-up appointment - lower no-show risk';
      impact = 'decreases_risk';
    } else if (lowerType.includes('urgent') || lowerType.includes('same day')) {
      normalizedScore = 15;
      description = 'Urgent appointment - very low no-show risk';
      impact = 'decreases_risk';
    } else if (lowerType.includes('wellness') || lowerType.includes('maintenance')) {
      normalizedScore = 45;
      description = 'Wellness/maintenance appointment';
      impact = 'neutral';
    } else {
      normalizedScore = 35;
      description = 'Standard appointment type';
      impact = 'neutral';
    }
  }

  return {
    name: 'Appointment Type',
    weight: DEFAULT_CONFIG.factorWeights.appointmentType,
    rawValue: appointmentTypeName,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.appointmentType,
    description,
  };
}

/**
 * Calculate weather impact (simplified - could integrate weather API)
 */
function calculateWeatherFactor(): NoShowRiskFactor {
  // In production, this would integrate with a weather API
  // For now, return neutral score
  return {
    name: 'Weather Forecast',
    weight: DEFAULT_CONFIG.factorWeights.weatherForecast,
    rawValue: 'N/A',
    normalizedScore: 35, // Neutral baseline
    impact: 'neutral',
    contribution: 35 * DEFAULT_CONFIG.factorWeights.weatherForecast,
    description: 'Weather data not available - using baseline',
  };
}

/**
 * Calculate patient age factor
 */
function calculateAgeFactor(age: number | null): NoShowRiskFactor {
  if (age === null) {
    return {
      name: 'Patient Age',
      weight: DEFAULT_CONFIG.factorWeights.patientAge,
      rawValue: 'Unknown',
      normalizedScore: 40,
      impact: 'neutral',
      contribution: 40 * DEFAULT_CONFIG.factorWeights.patientAge,
      description: 'Age unknown',
    };
  }

  let normalizedScore: number;
  let description: string;
  let impact: 'increases_risk' | 'neutral' | 'decreases_risk';

  // Research shows younger patients (18-35) have higher no-show rates
  if (age < 18) {
    normalizedScore = 30;
    description = 'Minor patient (parent involvement helps)';
    impact = 'neutral';
  } else if (age < 30) {
    normalizedScore = 60;
    description = 'Young adult - higher no-show tendency';
    impact = 'increases_risk';
  } else if (age < 45) {
    normalizedScore = 45;
    description = 'Working age adult';
    impact = 'neutral';
  } else if (age < 65) {
    normalizedScore = 30;
    description = 'Established adult - reliable attendance';
    impact = 'decreases_risk';
  } else {
    normalizedScore = 25;
    description = 'Senior patient - very reliable attendance';
    impact = 'decreases_risk';
  }

  return {
    name: 'Patient Age',
    weight: DEFAULT_CONFIG.factorWeights.patientAge,
    rawValue: age,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.patientAge,
    description,
  };
}

/**
 * Calculate outstanding balance factor
 */
function calculateBalanceFactor(balance: number, avgVisitCost: number): NoShowRiskFactor {
  if (balance <= 0) {
    return {
      name: 'Outstanding Balance',
      weight: DEFAULT_CONFIG.factorWeights.outstandingBalance,
      rawValue: '$0',
      normalizedScore: 10,
      impact: 'decreases_risk',
      contribution: 10 * DEFAULT_CONFIG.factorWeights.outstandingBalance,
      description: 'No outstanding balance',
    };
  }

  const visitsWorth = avgVisitCost > 0 ? balance / avgVisitCost : balance / 100;
  let normalizedScore: number;
  let description: string;
  let impact: 'increases_risk' | 'neutral' | 'decreases_risk';

  if (visitsWorth <= 0.5) {
    normalizedScore = 20;
    description = 'Small outstanding balance';
    impact = 'neutral';
  } else if (visitsWorth <= 1) {
    normalizedScore = 35;
    description = 'Moderate outstanding balance';
    impact = 'neutral';
  } else if (visitsWorth <= 2) {
    normalizedScore = 55;
    description = 'Significant outstanding balance';
    impact = 'increases_risk';
  } else {
    normalizedScore = 75;
    description = 'Large outstanding balance - financial barrier';
    impact = 'increases_risk';
  }

  return {
    name: 'Outstanding Balance',
    weight: DEFAULT_CONFIG.factorWeights.outstandingBalance,
    rawValue: `$${balance.toFixed(2)}`,
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.outstandingBalance,
    description,
  };
}

/**
 * Calculate confirmation status factor
 */
function calculateConfirmationFactor(
  isConfirmed: boolean,
  confirmationMethod: string | null,
  daysUntilAppointment: number
): NoShowRiskFactor {
  let normalizedScore: number;
  let description: string;
  let impact: 'increases_risk' | 'neutral' | 'decreases_risk';

  if (isConfirmed) {
    if (confirmationMethod === 'phone') {
      normalizedScore = 10;
      description = 'Confirmed by phone - very low risk';
      impact = 'decreases_risk';
    } else if (confirmationMethod === 'sms') {
      normalizedScore = 20;
      description = 'Confirmed by SMS';
      impact = 'decreases_risk';
    } else {
      normalizedScore = 25;
      description = 'Confirmed (method: ' + (confirmationMethod || 'unknown') + ')';
      impact = 'decreases_risk';
    }
  } else {
    if (daysUntilAppointment > 7) {
      normalizedScore = 50;
      description = 'Not yet confirmed (appointment >1 week out)';
      impact = 'neutral';
    } else if (daysUntilAppointment > 2) {
      normalizedScore = 65;
      description = 'Not confirmed with appointment soon';
      impact = 'increases_risk';
    } else {
      normalizedScore = 80;
      description = 'Not confirmed - appointment imminent';
      impact = 'increases_risk';
    }
  }

  return {
    name: 'Confirmation Status',
    weight: DEFAULT_CONFIG.factorWeights.confirmationStatus,
    rawValue: isConfirmed ? 'Confirmed' : 'Not Confirmed',
    normalizedScore,
    impact,
    contribution: normalizedScore * DEFAULT_CONFIG.factorWeights.confirmationStatus,
    description,
  };
}

/**
 * Generate interventions based on risk factors
 */
function generateInterventions(
  riskFactors: NoShowRiskFactor[],
  riskLevel: string,
  daysUntilAppointment: number
): NoShowIntervention[] {
  const interventions: NoShowIntervention[] = [];
  const topFactors = riskFactors
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  // Always add appropriate reminder strategy based on risk
  if (riskLevel === 'critical' || riskLevel === 'high') {
    interventions.push({
      intervention: 'Multi-channel confirmation',
      description: 'Send reminders via SMS, email, AND phone call',
      timing: daysUntilAppointment > 3 ? 'week_before' : 'immediate',
      channel: 'multiple',
      expectedImpact: 'high',
      priority: 1,
      automatable: false, // Phone call requires staff
    });
  }

  // Add factor-specific interventions
  for (const factor of topFactors) {
    if (factor.impact === 'increases_risk') {
      switch (factor.name) {
        case 'Historical No-Show Rate':
          interventions.push({
            intervention: 'Personal outreach call',
            description: 'Have staff personally call to confirm and address any concerns',
            timing: 'day_before',
            channel: 'phone',
            expectedImpact: 'high',
            priority: 2,
            automatable: false,
          });
          break;
        case 'Appointment Lead Time':
          interventions.push({
            intervention: 'Multiple reminder sequence',
            description: 'Send reminders at 1 week, 2 days, and 1 day before',
            timing: 'week_before',
            channel: 'automated',
            expectedImpact: 'medium',
            priority: 3,
            automatable: true,
          });
          break;
        case 'Confirmation Status':
          interventions.push({
            intervention: 'Confirmation request',
            description: 'Send immediate confirmation request with easy response option',
            timing: 'immediate',
            channel: 'sms',
            expectedImpact: 'high',
            priority: 1,
            automatable: true,
          });
          break;
        case 'Outstanding Balance':
          interventions.push({
            intervention: 'Financial assistance offer',
            description: 'Proactively offer payment plan or discuss financial options',
            timing: 'day_before',
            channel: 'phone',
            expectedImpact: 'medium',
            priority: 4,
            automatable: false,
          });
          break;
        case 'Days Since Last Visit':
          interventions.push({
            intervention: 'Re-engagement message',
            description: 'Send personalized message acknowledging the gap and offering support',
            timing: 'week_before',
            channel: 'email',
            expectedImpact: 'medium',
            priority: 4,
            automatable: true,
          });
          break;
      }
    }
  }

  // Add standard reminder if not already covered
  if (riskLevel === 'medium' && !interventions.some(i => i.timing === 'day_before')) {
    interventions.push({
      intervention: 'Standard SMS reminder',
      description: 'Send automated SMS reminder 1 day before',
      timing: 'day_before',
      channel: 'sms',
      expectedImpact: 'medium',
      priority: 5,
      automatable: true,
    });
  }

  // Remove duplicates and sort by priority
  const uniqueInterventions = interventions.filter(
    (intervention, index, self) =>
      index === self.findIndex((i) => i.intervention === intervention.intervention)
  );

  return uniqueInterventions.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

/**
 * Generate overbooking suggestion
 */
function generateOverbookingSuggestion(
  noShowProbability: number,
  timeSlotStats: { expectedNoShows: number; totalSlots: number },
  riskLevel: string
): OverbookingSuggestion {
  const shouldOverbook = noShowProbability >= DEFAULT_CONFIG.overbookingThreshold;
  let overbookSlots = 0;
  let riskLevelOverbook: 'safe' | 'moderate' | 'risky' = 'safe';

  if (shouldOverbook) {
    // Calculate slots based on expected no-shows
    overbookSlots = Math.min(2, Math.round(timeSlotStats.expectedNoShows));
    riskLevelOverbook = overbookSlots > 1 ? 'moderate' : 'safe';
  }

  return {
    recommendedOverbook: shouldOverbook,
    overbookSlots,
    confidence: riskLevel === 'critical' || riskLevel === 'high' ? 0.8 : 0.6,
    expectedNoShows: timeSlotStats.expectedNoShows,
    timeSlot: 'current slot',
    riskLevel: riskLevelOverbook,
    reasoning: shouldOverbook
      ? `Based on ${noShowProbability.toFixed(0)}% no-show probability, consider overbooking by ${overbookSlots} slot(s)`
      : 'No-show risk is low enough that overbooking is not recommended',
  };
}

/**
 * Generate confirmation strategy
 */
function generateConfirmationStrategy(
  riskLevel: string,
  daysUntilAppointment: number,
  isCurrentlyConfirmed: boolean
): ConfirmationStrategy {
  const isHighRisk = riskLevel === 'critical' || riskLevel === 'high';
  const isMediumRisk = riskLevel === 'medium';

  const reminderTiming: string[] = [];
  const reminderChannels: ('sms' | 'email' | 'phone')[] = [];

  if (daysUntilAppointment >= 7) reminderTiming.push('7 days');
  if (daysUntilAppointment >= 3) reminderTiming.push('3 days');
  if (daysUntilAppointment >= 1) reminderTiming.push('1 day');
  if (isHighRisk && daysUntilAppointment >= 0.25) reminderTiming.push('2 hours');

  // Channels based on risk
  if (isHighRisk) {
    reminderChannels.push('sms', 'email', 'phone');
  } else if (isMediumRisk) {
    reminderChannels.push('sms', 'email');
  } else {
    reminderChannels.push('sms');
  }

  return {
    recommendedReminders: reminderTiming.length,
    reminderTiming,
    reminderChannels,
    requireConfirmation: isHighRisk || isMediumRisk,
    confirmationDeadline: isHighRisk ? 24 : isMediumRisk ? 48 : undefined,
    escalateIfNoConfirmation: isHighRisk,
    personalizedMessage: isHighRisk,
    includeReschedulingOption: true,
  };
}

/**
 * Get external factors affecting no-show risk
 */
function getExternalFactors(appointmentDate: Date): ExternalFactor[] {
  const factors: ExternalFactor[] = [];

  // Check for holidays (simplified - US federal holidays)
  const month = appointmentDate.getMonth();
  const day = appointmentDate.getDate();
  const dayOfWeek = appointmentDate.getDay();

  // Christmas/New Year period
  if (month === 11 && day >= 20) {
    factors.push({
      factor: 'holiday',
      name: 'Holiday Season',
      impactScore: 25,
      confidence: 0.85,
      description: 'Christmas/New Year period - higher no-show rates',
    });
  }

  // Thanksgiving week
  if (month === 10 && day >= 20 && day <= 30 && dayOfWeek >= 3) {
    factors.push({
      factor: 'holiday',
      name: 'Thanksgiving Week',
      impactScore: 20,
      confidence: 0.8,
      description: 'Thanksgiving week - elevated no-show rates',
    });
  }

  // Summer vacation (July-August)
  if (month === 6 || month === 7) {
    factors.push({
      factor: 'season',
      name: 'Summer Vacation Season',
      impactScore: 15,
      confidence: 0.7,
      description: 'Summer months have slightly elevated no-show rates',
    });
  }

  // Weather would be added here with API integration
  // factors.push({
  //   factor: 'weather',
  //   name: 'Weather Forecast',
  //   impactScore: weatherImpact,
  //   confidence: 0.6,
  //   description: weatherDescription,
  //   dataSource: 'Weather API',
  // });

  return factors;
}

/**
 * Predict no-show risk for a single appointment
 */
export async function predictNoShow(
  organizationId: string,
  appointmentId: string,
  config: Partial<NoShowPredictionConfig> = {}
): Promise<NoShowPredictionResult | null> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const lookbackDate = new Date();
  lookbackDate.setMonth(lookbackDate.getMonth() - finalConfig.lookbackMonths);
  const recentDate = new Date();
  recentDate.setMonth(recentDate.getMonth() - 6);

  // Fetch appointment with all relevant data
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      organizationId,
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
    },
    include: {
      patient: {
        include: {
          demographics: true,
          appointments: {
            where: { startTime: { gte: lookbackDate } },
            orderBy: { startTime: 'desc' },
          },
          charges: {
            where: { chargeDate: { gte: lookbackDate } },
          },
        },
      },
      provider: {
        include: {
          user: true,
        },
      },
      appointmentType: true,
    },
  });

  if (!appointment || !appointment.patient || !appointment.patient.demographics) {
    return null;
  }

  const patient = appointment.patient;
  const demographics = patient.demographics!;
  const appointmentType = appointment.appointmentType;

  // Calculate patient history
  const allAppointments = patient.appointments;
  const completedAppointments = allAppointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.CHECKED_IN
  );
  const noShowAppointments = allAppointments.filter((a) => a.status === AppointmentStatus.NO_SHOW);
  const cancelledAppointments = allAppointments.filter((a) => a.status === AppointmentStatus.CANCELLED);

  const totalAppointments = completedAppointments.length + noShowAppointments.length;
  const noShowRate = totalAppointments > 0 ? (noShowAppointments.length / totalAppointments) * 100 : 0;

  // Recent no-show rate (last 6 months)
  const recentAppointments = allAppointments.filter((a) => new Date(a.startTime) >= recentDate);
  const recentCompleted = recentAppointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.CHECKED_IN
  ).length;
  const recentNoShows = recentAppointments.filter((a) => a.status === AppointmentStatus.NO_SHOW).length;
  const recentTotal = recentCompleted + recentNoShows;
  const recentNoShowRate = recentTotal > 0 ? (recentNoShows / recentTotal) * 100 : 0;

  // Last visit and no-show dates
  const lastCompletedVisit = completedAppointments[0]?.startTime;
  const daysSinceLastVisit = lastCompletedVisit
    ? Math.floor((Date.now() - new Date(lastCompletedVisit).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const lastNoShow = noShowAppointments[0]?.startTime;
  const daysSinceLastNoShow = lastNoShow
    ? Math.floor((Date.now() - new Date(lastNoShow).getTime()) / (1000 * 60 * 60 * 24))
    : undefined;

  // Calculate streak
  let currentStreak = 0;
  let streakType: 'attendance' | 'no_shows' | 'mixed' = 'mixed';
  const sortedAppointments = allAppointments
    .filter((a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.NO_SHOW)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  if (sortedAppointments.length > 0) {
    const firstStatus = sortedAppointments[0].status;
    streakType = firstStatus === AppointmentStatus.COMPLETED ? 'attendance' : 'no_shows';
    for (const appt of sortedAppointments) {
      if (appt.status === firstStatus || (appt.status === AppointmentStatus.CHECKED_IN && firstStatus === AppointmentStatus.COMPLETED)) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Appointment characteristics
  const scheduledDate = new Date(appointment.startTime);
  const dayOfWeek = scheduledDate.getDay();
  const hour = scheduledDate.getHours();
  const bookingDate = new Date(appointment.createdAt);
  const leadTimeDays = Math.floor(
    (scheduledDate.getTime() - bookingDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysUntilAppointment = Math.max(
    0,
    Math.floor((scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  // Patient age
  const birthDate = demographics.dateOfBirth;
  const age = birthDate
    ? Math.floor((Date.now() - new Date(birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365))
    : null;

  // Financial data
  const outstandingBalance = patient.charges.reduce((sum, c) => sum + Number(c.balance), 0);
  const totalCharges = patient.charges.reduce((sum, c) => sum + Number(c.fee), 0);
  const avgVisitCost = completedAppointments.length > 0 ? totalCharges / completedAppointments.length : 100;

  // Confirmation status (simplified - check for confirmed status)
  const isConfirmed = appointment.status === AppointmentStatus.CONFIRMED;

  // Is this patient new?
  const isNewPatient = totalAppointments === 0;
  const isFirstAppointment = allAppointments.length <= 1;

  // Preferred time of day
  const appointmentHours = completedAppointments.map((a) => new Date(a.startTime).getHours());
  const preferredTime = appointmentHours.length > 0
    ? getTimeOfDay(appointmentHours.reduce((sum, h) => sum + h, 0) / appointmentHours.length)
    : null;

  // Calculate all risk factors
  const riskFactors: NoShowRiskFactor[] = [
    calculateHistoricalNoShowFactor(noShowRate, recentNoShowRate, totalAppointments, finalConfig.minAppointments),
    calculateRecencyFactor(daysSinceLastVisit),
    calculateLeadTimeFactor(leadTimeDays),
    calculateTimeOfDayFactor(hour, preferredTime),
    calculateDayOfWeekFactor(dayOfWeek),
    calculateAppointmentTypeFactor(isNewPatient, appointmentType?.name || 'Standard'),
    calculateWeatherFactor(),
    calculateAgeFactor(age),
    calculateBalanceFactor(outstandingBalance, avgVisitCost),
    calculateConfirmationFactor(isConfirmed, null, daysUntilAppointment),
  ];

  // Calculate no-show probability
  const noShowProbability = riskFactors.reduce((sum, f) => sum + f.contribution, 0);
  const riskLevel = getRiskLevel(noShowProbability, finalConfig);

  // Calculate confidence
  let confidence = 0.5;
  if (totalAppointments >= finalConfig.minAppointments) confidence += 0.15;
  if (totalAppointments >= 10) confidence += 0.10;
  if (daysSinceLastVisit !== null && daysSinceLastVisit < 90) confidence += 0.10;
  confidence = Math.min(0.95, confidence);

  // Top risk factors
  const sortedFactors = [...riskFactors].sort((a, b) => b.contribution - a.contribution);
  const topRiskFactors = sortedFactors.slice(0, 3).map((f) => f.name);

  // Build history object
  const patientHistory: PatientNoShowHistory = {
    totalAppointments,
    completedAppointments: completedAppointments.length,
    noShowAppointments: noShowAppointments.length,
    cancelledAppointments: cancelledAppointments.length,
    noShowRate,
    recentNoShowRate,
    lastNoShowDate: lastNoShow ? new Date(lastNoShow) : undefined,
    daysSinceLastNoShow,
    streakType,
    currentStreak,
    averageLeadTime: leadTimeDays, // Simplified
    preferredTimeOfDay: preferredTime,
  };

  // Build appointment characteristics
  const appointmentDetails: AppointmentCharacteristics = {
    appointmentId: appointment.id,
    appointmentType: appointmentType?.name || 'Standard',
    appointmentTypeId: appointmentType?.id || '',
    scheduledDateTime: scheduledDate,
    dayOfWeek,
    dayName: DAY_NAMES[dayOfWeek],
    timeOfDay: getTimeOfDay(hour),
    hour,
    leadTimeDays,
    providerId: appointment.providerId,
    providerName: `${appointment.provider.user.firstName} ${appointment.provider.user.lastName}`,
    isNewPatient,
    isFirstAppointment,
    duration: appointmentType?.duration ?? 30,
  };

  // External factors
  const externalFactors = getExternalFactors(scheduledDate);

  // Adjust probability for external factors
  const externalImpact = externalFactors.reduce((sum, f) => sum + f.impactScore * 0.1, 0);
  const adjustedProbability = Math.min(100, noShowProbability + externalImpact);

  // Generate interventions
  const interventions = generateInterventions(riskFactors, riskLevel, daysUntilAppointment);

  // Overbooking suggestion
  const overbookingSuggestion = generateOverbookingSuggestion(
    adjustedProbability,
    { expectedNoShows: adjustedProbability / 100, totalSlots: 1 },
    riskLevel
  );

  // Confirmation strategy
  const confirmationStrategy = generateConfirmationStrategy(riskLevel, daysUntilAppointment, isConfirmed);

  const patientName = `${demographics.firstName} ${demographics.lastName}`;

  return {
    appointmentId: appointment.id,
    patientId: patient.id,
    patientName,
    noShowProbability: adjustedProbability,
    confidenceScore: confidence,
    riskLevel,
    riskFactors,
    topRiskFactors,
    patientHistory,
    appointmentDetails,
    externalFactors,
    interventions,
    overbookingSuggestion,
    confirmationStrategy,
    predictionDate: new Date(),
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // Valid for 24 hours
    modelVersion: MODEL_VERSION,
  };
}

/**
 * Batch predict no-shows for upcoming appointments
 */
export async function batchPredictNoShow(
  options: BatchNoShowPredictionOptions
): Promise<BatchNoShowPredictionResult> {
  const startTime = Date.now();
  const {
    organizationId,
    startDate = new Date(),
    endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
    providerId,
    appointmentTypeId,
    minRiskLevel = 'low',
    limit = 100,
    saveResults = false,
  } = options;

  // Get upcoming appointments
  const whereClause: {
    organizationId: string;
    startTime: { gte: Date; lte: Date };
    status: { in: AppointmentStatus[] };
    providerId?: string;
    appointmentTypeId?: string;
  } = {
    organizationId,
    startTime: {
      gte: startDate,
      lte: endDate,
    },
    status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
  };

  if (providerId) whereClause.providerId = providerId;
  if (appointmentTypeId) whereClause.appointmentTypeId = appointmentTypeId;

  const appointments = await prisma.appointment.findMany({
    where: whereClause,
    select: { id: true },
    take: 500, // Process max 500 at a time
    orderBy: { startTime: 'asc' },
  });

  const results: NoShowPredictionResult[] = [];
  const byRiskLevel = { critical: 0, high: 0, medium: 0, low: 0, minimal: 0 };
  let errorCount = 0;
  let totalProbability = 0;

  // Analyze each appointment
  for (const apt of appointments) {
    try {
      const prediction = await predictNoShow(organizationId, apt.id);
      if (prediction) {
        byRiskLevel[prediction.riskLevel]++;
        totalProbability += prediction.noShowProbability;

        // Filter by minimum risk level
        const riskOrder = { critical: 5, high: 4, medium: 3, low: 2, minimal: 1 };
        if (riskOrder[prediction.riskLevel] >= riskOrder[minRiskLevel]) {
          results.push(prediction);
        }

        // Save if requested
        if (saveResults && riskOrder[prediction.riskLevel] >= riskOrder.medium) {
          await saveNoShowPrediction(organizationId, prediction);
        }
      }
    } catch {
      errorCount++;
    }
  }

  // Sort by risk and limit
  const sortedResults = results
    .sort((a, b) => b.noShowProbability - a.noShowProbability)
    .slice(0, limit);

  // Generate aggregate overbooking recommendations
  const overbookingRecommendations: OverbookingSuggestion[] = [];
  const avgNoShowRisk = appointments.length > 0 ? totalProbability / appointments.length : 0;
  const expectedNoShows = Math.round((totalProbability / 100));
  const expectedAttendance = appointments.length - expectedNoShows;

  // Overall overbooking recommendation
  if (avgNoShowRisk >= 15) {
    overbookingRecommendations.push({
      recommendedOverbook: true,
      overbookSlots: Math.min(5, Math.ceil(expectedNoShows * 0.3)),
      confidence: 0.7,
      expectedNoShows,
      timeSlot: 'Overall period',
      riskLevel: avgNoShowRisk > 25 ? 'moderate' : 'safe',
      reasoning: `Expected ${expectedNoShows} no-shows out of ${appointments.length} appointments (${avgNoShowRisk.toFixed(1)}% average risk)`,
    });
  }

  return {
    processedCount: appointments.length,
    atRiskCount: byRiskLevel.critical + byRiskLevel.high + byRiskLevel.medium,
    errorCount,
    byRiskLevel,
    processingTimeMs: Date.now() - startTime,
    atRiskAppointments: sortedResults.slice(0, 20),
    overbookingRecommendations,
    aggregateStats: {
      averageNoShowRisk: avgNoShowRisk,
      expectedNoShows,
      expectedAttendance,
    },
  };
}

/**
 * Save no-show prediction to database
 */
export async function saveNoShowPrediction(
  organizationId: string,
  prediction: NoShowPredictionResult
): Promise<void> {
  const predictionJson = {
    noShowProbability: prediction.noShowProbability,
    riskLevel: prediction.riskLevel,
    topRiskFactors: prediction.topRiskFactors,
    interventions: prediction.interventions.map((i) => ({
      intervention: i.intervention,
      description: i.description,
      timing: i.timing,
      channel: i.channel,
      priority: i.priority,
    })),
    overbookingSuggestion: prediction.overbookingSuggestion,
    confirmationStrategy: prediction.confirmationStrategy,
  } as unknown as Prisma.InputJsonValue;

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
      id: `noshow-${prediction.appointmentId}`,
    },
    create: {
      id: `noshow-${prediction.appointmentId}`,
      organizationId,
      patientId: prediction.patientId,
      predictionType: PredictionType.NO_SHOW,
      status: PredictionStatus.PENDING,
      targetEntityType: 'Appointment',
      targetEntityId: prediction.appointmentId,
      prediction: predictionJson,
      confidence: prediction.confidenceScore,
      confidenceLevel: prediction.confidenceScore >= 0.8 ? 'high' : prediction.confidenceScore >= 0.6 ? 'medium' : 'low',
      modelName: 'noshow-predictor',
      modelVersion: prediction.modelVersion,
      features: featuresJson,
      featureImportance: featureImportanceJson,
      validUntil: prediction.validUntil,
      horizon: '24h',
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
        riskType: RiskType.NO_SHOW,
        organizationId,
      },
    },
    create: {
      organizationId,
      patientId: prediction.patientId,
      riskType: RiskType.NO_SHOW,
      score: Math.round(prediction.noShowProbability),
      scoreLevel: prediction.riskLevel,
      confidence: prediction.confidenceScore,
      factors: factorsJson,
      topFactors: prediction.topRiskFactors,
      alertThreshold: 60,
      isAboveThreshold: prediction.noShowProbability >= 60,
      interventionRecommended: prediction.interventions[0]?.description || '',
      expiresAt: prediction.validUntil,
    },
    update: {
      score: Math.round(prediction.noShowProbability),
      scoreLevel: prediction.riskLevel,
      confidence: prediction.confidenceScore,
      factors: factorsJson,
      topFactors: prediction.topRiskFactors,
      isAboveThreshold: prediction.noShowProbability >= 60,
      interventionRecommended: prediction.interventions[0]?.description || '',
      calculatedAt: new Date(),
      expiresAt: prediction.validUntil,
    },
  });
}

/**
 * Track no-show prediction accuracy
 */
export async function trackNoShowPredictionAccuracy(
  organizationId: string,
  appointmentId: string,
  actuallyNoShowed: boolean
): Promise<void> {
  const prediction = await prisma.prediction.findFirst({
    where: {
      organizationId,
      targetEntityId: appointmentId,
      predictionType: PredictionType.NO_SHOW,
      status: PredictionStatus.PENDING,
    },
    orderBy: { predictionDate: 'desc' },
  });

  if (!prediction) return;

  const predictionData = prediction.prediction as { noShowProbability?: number };
  const predictedNoShow = (predictionData.noShowProbability || 0) >= 50;
  const wasAccurate = predictedNoShow === actuallyNoShowed;

  await prisma.prediction.update({
    where: { id: prediction.id },
    data: {
      status: PredictionStatus.VALIDATED,
      actualOutcome: { noShowed: actuallyNoShowed },
      outcomeDate: new Date(),
      wasAccurate,
      accuracyScore: wasAccurate ? 1 : 0,
      accuracyNotes: actuallyNoShowed
        ? 'Patient no-showed'
        : 'Patient attended',
    },
  });
}

/**
 * Get no-show prediction accuracy metrics
 */
export async function getNoShowPredictionAccuracy(
  organizationId: string
): Promise<NoShowAccuracyMetrics> {
  const predictions = await prisma.prediction.findMany({
    where: {
      organizationId,
      predictionType: PredictionType.NO_SHOW,
      status: PredictionStatus.VALIDATED,
    },
    select: {
      prediction: true,
      actualOutcome: true,
      wasAccurate: true,
    },
  });

  const totalPredictions = await prisma.prediction.count({
    where: { organizationId, predictionType: PredictionType.NO_SHOW },
  });

  const validatedPredictions = predictions.length;
  const accuratePredictions = predictions.filter((p) => p.wasAccurate).length;

  // Calculate classification metrics
  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const pred of predictions) {
    const predData = pred.prediction as { noShowProbability?: number };
    const outcomeData = pred.actualOutcome as { noShowed?: boolean };
    const predictedNoShow = (predData.noShowProbability || 0) >= 50;
    const actualNoShow = outcomeData.noShowed || false;

    if (predictedNoShow && actualNoShow) truePositives++;
    else if (!predictedNoShow && !actualNoShow) trueNegatives++;
    else if (predictedNoShow && !actualNoShow) falsePositives++;
    else falseNegatives++;
  }

  const accuracy = validatedPredictions > 0 ? accuratePredictions / validatedPredictions : 0;
  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Group by risk level
  const byRiskLevel: { level: string; predictions: number; actualNoShows: number; accuracy: number }[] = [];
  const levels = ['critical', 'high', 'medium', 'low', 'minimal'];

  for (const level of levels) {
    const levelPredictions = predictions.filter((p) => {
      const data = p.prediction as { riskLevel?: string };
      return data.riskLevel === level;
    });
    const levelAccurate = levelPredictions.filter((p) => p.wasAccurate).length;
    const levelNoShows = levelPredictions.filter((p) => {
      const outcome = p.actualOutcome as { noShowed?: boolean };
      return outcome.noShowed;
    }).length;

    byRiskLevel.push({
      level,
      predictions: levelPredictions.length,
      actualNoShows: levelNoShows,
      accuracy: levelPredictions.length > 0 ? levelAccurate / levelPredictions.length : 0,
    });
  }

  // Placeholder for day of week and time of day analysis
  const byDayOfWeek: { day: string; predictions: number; accuracy: number }[] = DAY_NAMES.map((day) => ({
    day,
    predictions: 0,
    accuracy: 0,
  }));

  const byTimeOfDay: { timeSlot: string; predictions: number; accuracy: number }[] = [
    { timeSlot: 'Morning (8-10)', predictions: 0, accuracy: 0 },
    { timeSlot: 'Midday (10-13)', predictions: 0, accuracy: 0 },
    { timeSlot: 'Afternoon (13-17)', predictions: 0, accuracy: 0 },
    { timeSlot: 'Evening (17+)', predictions: 0, accuracy: 0 },
  ];

  return {
    totalPredictions,
    validatedPredictions,
    accuratePredictions,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
    accuracy,
    precision,
    recall,
    f1Score,
    byRiskLevel,
    byDayOfWeek,
    byTimeOfDay,
  };
}
