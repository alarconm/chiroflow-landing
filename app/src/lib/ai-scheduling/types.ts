/**
 * AI Scheduling Agent Types
 * Epic 13: AI-powered scheduling optimization for ChiroFlow
 */

import type {
  NoShowRiskLevel,
  OverbookingStatus,
  RecallStatus,
  RecallStepType,
  SuggestionType,
  DayOfWeek,
} from '@prisma/client';

// ============================================
// No-Show Prediction Types
// ============================================

export interface NoShowFactors {
  dayOfWeek: number;           // 0-1 contribution from day of week
  timeSlot: number;            // 0-1 contribution from time of day
  patientHistory: number;      // 0-1 contribution from past behavior
  appointmentType: number;     // 0-1 contribution from appointment type
  leadTime: number;            // 0-1 contribution from booking lead time
  weatherRisk?: number;        // 0-1 contribution from weather (if available)
  seasonality?: number;        // 0-1 contribution from season/holidays
}

export interface NoShowPredictionResult {
  probability: number;         // 0.0 to 1.0
  riskLevel: NoShowRiskLevel;
  factors: NoShowFactors;
  confidenceScore: number;     // Model confidence
  recommendations?: string[];  // Suggested actions
}

export interface PatientNoShowHistory {
  totalAppointments: number;
  noShowCount: number;
  cancelledCount: number;
  lateCount: number;
  recentNoShows: number;       // In last 6 months
  noShowRate: number;          // 0.0 to 1.0
}

// ============================================
// Overbooking Types
// ============================================

export interface OverbookingCandidate {
  date: Date;
  time: string;               // "09:00" format
  providerId: string;
  existingAppointments: {
    id: string;
    noShowProbability: number;
  }[];
  combinedNoShowProbability: number;
  expectedValue: number;
  reason: string;
}

export interface OverbookingDecision {
  recommendationId: string;
  accepted: boolean;
  userId: string;
  declineReason?: string;
}

// ============================================
// Gap Analysis Types
// ============================================

export interface ScheduleGap {
  start: Date;
  end: Date;
  durationMinutes: number;
  providerId: string;
  gapType: 'CANCELLATION' | 'NATURAL' | 'BETWEEN_BLOCKS';
  fillPriority: number;
  estimatedValue?: number;
}

export interface GapFillSuggestion {
  gapId: string;
  suggestionType: 'WAITLIST' | 'RECALL' | 'RESCHEDULE';
  patientId?: string;
  patientName?: string;
  appointmentTypeId?: string;
  appointmentTypeName?: string;
  matchScore: number;          // How well this fills the gap
  reason: string;
}

// ============================================
// Utilization Types
// ============================================

export interface UtilizationMetrics {
  date: Date;
  providerId: string;
  providerName: string;

  // Time metrics
  availableMinutes: number;
  bookedMinutes: number;
  utilizedMinutes: number;     // Actually attended

  // Rates
  bookingRate: number;         // booked / available
  utilizationRate: number;     // utilized / booked
  overallRate: number;         // utilized / available

  // Counts
  scheduledCount: number;
  completedCount: number;
  noShowCount: number;
  cancelledCount: number;

  // Revenue
  potentialRevenue?: number;
  actualRevenue?: number;
  lostRevenue?: number;
}

export interface UtilizationTrend {
  period: 'day' | 'week' | 'month';
  data: {
    date: Date;
    bookingRate: number;
    utilizationRate: number;
    overallRate: number;
  }[];
  averages: {
    bookingRate: number;
    utilizationRate: number;
    overallRate: number;
  };
  trend: 'improving' | 'stable' | 'declining';
}

// ============================================
// Scheduling Optimization Types
// ============================================

export interface OptimalSlot {
  date: Date;
  time: string;               // "09:00" format
  providerId: string;
  providerName: string;
  score: number;              // 0-100 optimization score
  factors: {
    providerUtilization: number;
    patientPreference: number;
    appointmentTypeMatch: number;
    travelEfficiency?: number;
  };
}

export interface SchedulingPreferences {
  preferredDays?: DayOfWeek[];
  preferredTimeStart?: string;
  preferredTimeEnd?: string;
  preferredProviderIds?: string[];
  avoidDays?: DayOfWeek[];
}

export interface OptimalScheduleRequest {
  patientId: string;
  appointmentTypeId: string;
  duration: number;
  dateRange: {
    start: Date;
    end: Date;
  };
  preferences?: SchedulingPreferences;
  urgency?: 'low' | 'normal' | 'high' | 'urgent';
}

// ============================================
// Recall Sequence Types
// ============================================

export interface RecallSequenceConfig {
  name: string;
  description?: string;
  appointmentTypes: string[];
  daysSinceLastVisit: number;
  steps: RecallStepConfig[];
  maxAttempts: number;
  stopOnSchedule: boolean;
}

export interface RecallStepConfig {
  stepNumber: number;
  stepType: RecallStepType;
  daysFromStart: number;
  templateId?: string;
  subject?: string;
  body?: string;
}

export interface RecallCandidate {
  patientId: string;
  patientName: string;
  lastVisitDate: Date;
  daysSinceLastVisit: number;
  lastAppointmentType: string;
  contactMethod: 'email' | 'sms' | 'phone';
  contactInfo: string;
  eligibleSequences: string[];
}

export interface RecallExecutionResult {
  enrollmentId: string;
  stepId: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================
// Scheduling Insights Types
// ============================================

export interface SchedulingInsight {
  id: string;
  type: 'warning' | 'opportunity' | 'info';
  category: 'utilization' | 'no_show' | 'gap' | 'recall' | 'overbooking';
  title: string;
  description: string;
  priority: number;
  actionable: boolean;
  suggestedAction?: string;
  data?: Record<string, unknown>;
  createdAt: Date;
}

export interface DailyScheduleAnalysis {
  date: Date;
  providers: {
    providerId: string;
    providerName: string;
    appointmentCount: number;
    totalMinutes: number;
    utilizationRate: number;
    highRiskAppointments: number;
    gaps: ScheduleGap[];
  }[];
  insights: SchedulingInsight[];
  overallUtilization: number;
  totalAppointments: number;
  totalHighRisk: number;
  totalGaps: number;
}

// ============================================
// ML Model Types (for mock and future real models)
// ============================================

export interface MLModelConfig {
  version: string;
  features: string[];
  threshold: {
    low: number;
    moderate: number;
    high: number;
  };
}

export interface PredictionInput {
  patientId: string;
  appointmentId?: string;
  appointmentTypeId: string;
  providerId: string;
  scheduledDate: Date;
  scheduledTime: string;
  patientHistory?: PatientNoShowHistory;
}

export interface BatchPredictionResult {
  appointmentId: string;
  prediction: NoShowPredictionResult;
}
