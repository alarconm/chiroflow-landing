/**
 * Mock ML Module for AI Scheduling
 * Provides realistic predictions based on simple heuristics for development
 */

import type { NoShowRiskLevel } from '@prisma/client';
import type {
  NoShowFactors,
  NoShowPredictionResult,
  PatientNoShowHistory,
  PredictionInput,
  MLModelConfig,
} from './types';

// Model configuration
export const MODEL_CONFIG: MLModelConfig = {
  version: '1.0-mock',
  features: [
    'dayOfWeek',
    'timeSlot',
    'patientHistory',
    'appointmentType',
    'leadTime',
    'weatherRisk',
    'seasonality',
  ],
  threshold: {
    low: 0.15,
    moderate: 0.30,
    high: 0.50,
  },
};

// Day of week risk factors (Monday = 1, Sunday = 0)
const DAY_OF_WEEK_RISK: Record<number, number> = {
  0: 0.25, // Sunday - higher no-show
  1: 0.15, // Monday - moderate
  2: 0.10, // Tuesday - lower
  3: 0.10, // Wednesday - lower
  4: 0.12, // Thursday - slightly higher
  5: 0.20, // Friday - higher
  6: 0.30, // Saturday - highest
};

// Time slot risk factors
const TIME_SLOT_RISK: Record<string, number> = {
  early_morning: 0.20,    // Before 9am
  morning: 0.08,          // 9am - 12pm
  lunch: 0.25,            // 12pm - 2pm
  afternoon: 0.10,        // 2pm - 5pm
  late_afternoon: 0.18,   // 5pm - 7pm
  evening: 0.22,          // After 7pm
};

// Appointment type risk factors (generic)
const APPOINTMENT_TYPE_RISK: Record<string, number> = {
  new_patient: 0.25,      // New patients more likely to no-show
  follow_up: 0.12,        // Regular follow-ups
  adjustment: 0.08,       // Quick adjustments - lowest risk
  exam: 0.15,             // Exams
  therapy: 0.10,          // Therapy sessions
  consultation: 0.20,     // Consultations
  default: 0.12,
};

// Lead time risk (days between booking and appointment)
function calculateLeadTimeRisk(leadTimeDays: number): number {
  if (leadTimeDays <= 1) return 0.08;      // Same/next day - low risk
  if (leadTimeDays <= 3) return 0.10;      // 2-3 days
  if (leadTimeDays <= 7) return 0.12;      // Within a week
  if (leadTimeDays <= 14) return 0.15;     // 1-2 weeks
  if (leadTimeDays <= 30) return 0.20;     // 2-4 weeks
  return 0.25;                              // More than a month - higher risk
}

// Get time slot category
function getTimeSlotCategory(time: string): keyof typeof TIME_SLOT_RISK {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour < 9) return 'early_morning';
  if (hour < 12) return 'morning';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'afternoon';
  if (hour < 19) return 'late_afternoon';
  return 'evening';
}

// Calculate patient history risk
function calculatePatientHistoryRisk(history: PatientNoShowHistory | undefined): number {
  if (!history || history.totalAppointments === 0) {
    return 0.15; // Unknown patient - moderate baseline
  }

  // Weight recent behavior more heavily
  const overallNoShowRate = history.noShowRate;
  const recentFactor = history.totalAppointments >= 6
    ? history.recentNoShows / Math.min(6, history.totalAppointments)
    : overallNoShowRate;

  // Combine overall and recent
  const combinedRate = (overallNoShowRate * 0.4) + (recentFactor * 0.6);

  // Cap at 0.5 to not over-predict
  return Math.min(combinedRate, 0.5);
}

// Map appointment type name to risk category
function mapAppointmentTypeToRisk(appointmentTypeName: string): number {
  const lowerName = appointmentTypeName.toLowerCase();

  if (lowerName.includes('new patient') || lowerName.includes('initial')) {
    return APPOINTMENT_TYPE_RISK.new_patient;
  }
  if (lowerName.includes('follow') || lowerName.includes('routine')) {
    return APPOINTMENT_TYPE_RISK.follow_up;
  }
  if (lowerName.includes('adjustment') || lowerName.includes('quick')) {
    return APPOINTMENT_TYPE_RISK.adjustment;
  }
  if (lowerName.includes('exam') || lowerName.includes('evaluation')) {
    return APPOINTMENT_TYPE_RISK.exam;
  }
  if (lowerName.includes('therapy') || lowerName.includes('rehab')) {
    return APPOINTMENT_TYPE_RISK.therapy;
  }
  if (lowerName.includes('consult')) {
    return APPOINTMENT_TYPE_RISK.consultation;
  }

  return APPOINTMENT_TYPE_RISK.default;
}

// Get risk level from probability
export function getRiskLevel(probability: number): NoShowRiskLevel {
  if (probability < MODEL_CONFIG.threshold.low) return 'LOW';
  if (probability < MODEL_CONFIG.threshold.moderate) return 'MODERATE';
  if (probability < MODEL_CONFIG.threshold.high) return 'HIGH';
  return 'VERY_HIGH';
}

// Calculate confidence score based on data availability
function calculateConfidence(
  hasHistory: boolean,
  historyCount: number
): number {
  let confidence = 0.6; // Base confidence for mock model

  if (hasHistory) {
    confidence += 0.2;
    // More history = more confidence
    if (historyCount >= 10) confidence += 0.1;
    if (historyCount >= 20) confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}

/**
 * Predict no-show probability for an appointment
 */
export function predictNoShow(
  input: PredictionInput,
  appointmentTypeName: string = 'default'
): NoShowPredictionResult {
  const scheduledDate = new Date(input.scheduledDate);
  const dayOfWeek = scheduledDate.getDay();
  const timeSlot = getTimeSlotCategory(input.scheduledTime);

  // Calculate individual factor contributions
  const factors: NoShowFactors = {
    dayOfWeek: DAY_OF_WEEK_RISK[dayOfWeek] || 0.15,
    timeSlot: TIME_SLOT_RISK[timeSlot],
    patientHistory: calculatePatientHistoryRisk(input.patientHistory),
    appointmentType: mapAppointmentTypeToRisk(appointmentTypeName),
    leadTime: calculateLeadTimeRisk(
      Math.floor((scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    ),
  };

  // Weight the factors
  const weights = {
    dayOfWeek: 0.10,
    timeSlot: 0.10,
    patientHistory: 0.45,  // Patient history is most important
    appointmentType: 0.15,
    leadTime: 0.20,
  };

  // Calculate weighted probability
  let probability =
    factors.dayOfWeek * weights.dayOfWeek +
    factors.timeSlot * weights.timeSlot +
    factors.patientHistory * weights.patientHistory +
    factors.appointmentType * weights.appointmentType +
    factors.leadTime * weights.leadTime;

  // Add some randomness to simulate real model variation (within 5%)
  const noise = (Math.random() - 0.5) * 0.05;
  probability = Math.max(0, Math.min(1, probability + noise));

  const riskLevel = getRiskLevel(probability);
  const confidenceScore = calculateConfidence(
    !!input.patientHistory,
    input.patientHistory?.totalAppointments || 0
  );

  // Generate recommendations based on risk level
  const recommendations: string[] = [];
  if (riskLevel === 'HIGH' || riskLevel === 'VERY_HIGH') {
    recommendations.push('Send additional reminder 24 hours before appointment');
    recommendations.push('Consider confirmation call');
    if (probability > 0.5) {
      recommendations.push('Consider overbooking this time slot');
    }
  } else if (riskLevel === 'MODERATE') {
    recommendations.push('Send reminder 48 hours before appointment');
  }

  return {
    probability: Math.round(probability * 100) / 100,
    riskLevel,
    factors,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    recommendations,
  };
}

/**
 * Predict no-show probability for multiple appointments
 */
export function batchPredictNoShow(
  inputs: Array<PredictionInput & { appointmentTypeName?: string }>
): Array<{ appointmentId: string; prediction: NoShowPredictionResult }> {
  return inputs.map((input) => ({
    appointmentId: input.appointmentId || '',
    prediction: predictNoShow(input, input.appointmentTypeName),
  }));
}

/**
 * Calculate combined no-show probability for overbooking analysis
 * Uses probability theory: at least one no-show
 */
export function calculateCombinedNoShowProbability(
  probabilities: number[]
): number {
  if (probabilities.length === 0) return 0;
  if (probabilities.length === 1) return probabilities[0];

  // P(at least one no-show) = 1 - P(all show up)
  // P(all show up) = product of (1 - p) for each appointment
  const allShowUp = probabilities.reduce(
    (acc, p) => acc * (1 - p),
    1
  );

  return Math.round((1 - allShowUp) * 100) / 100;
}

/**
 * Generate mock patient no-show history
 * Used for testing when real history is not available
 */
export function generateMockPatientHistory(): PatientNoShowHistory {
  const total = Math.floor(Math.random() * 20) + 5;
  const noShowRate = Math.random() * 0.3; // 0-30% no-show rate
  const noShowCount = Math.floor(total * noShowRate);
  const cancelledCount = Math.floor(total * Math.random() * 0.15);
  const lateCount = Math.floor(total * Math.random() * 0.2);
  const recentNoShows = Math.floor(Math.min(6, total) * noShowRate);

  return {
    totalAppointments: total,
    noShowCount,
    cancelledCount,
    lateCount,
    recentNoShows,
    noShowRate: Math.round(noShowRate * 100) / 100,
  };
}
