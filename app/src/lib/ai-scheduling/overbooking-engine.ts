/**
 * Smart Overbooking Engine
 * Recommends strategic overbooking based on no-show predictions
 */

import { prisma } from '@/lib/prisma';
import type { OverbookingStatus } from '@prisma/client';
import type { OverbookingCandidate, OverbookingDecision } from './types';
import { batchPredictNoShows, getPatientNoShowHistory } from './no-show-predictor';
import { calculateCombinedNoShowProbability } from './mock-ml';

// Configuration
const OVERBOOKING_CONFIG = {
  minNoShowProbability: 0.35,    // Minimum combined no-show probability to suggest overbooking
  maxOverbookingSlots: 2,        // Maximum overbookings per time slot
  lookAheadDays: 14,             // How far ahead to analyze
  expirationHours: 48,           // Recommendations expire after this time
  revenuePerSlot: 75,            // Estimated average revenue per appointment slot
};

/**
 * Analyze a time slot for overbooking potential
 */
async function analyzeTimeSlot(
  organizationId: string,
  providerId: string,
  date: Date,
  startTime: string,
  endTime: string
): Promise<OverbookingCandidate | null> {
  // Get appointments in this time slot
  const slotStart = new Date(date);
  const [startHour, startMin] = startTime.split(':').map(Number);
  slotStart.setHours(startHour, startMin, 0, 0);

  const slotEnd = new Date(date);
  const [endHour, endMin] = endTime.split(':').map(Number);
  slotEnd.setHours(endHour, endMin, 0, 0);

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      providerId,
      startTime: {
        gte: slotStart,
        lt: slotEnd,
      },
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
    },
    include: {
      noShowPrediction: true,
    },
  });

  if (appointments.length === 0) return null;

  // Get predictions for appointments that don't have them
  const appointmentsNeedingPredictions = appointments.filter(
    (a) => !a.noShowPrediction
  );

  let predictions: Map<string, number> = new Map();

  if (appointmentsNeedingPredictions.length > 0) {
    const newPredictions = await batchPredictNoShows(
      appointmentsNeedingPredictions.map((a) => a.id),
      organizationId
    );
    newPredictions.forEach((p) => {
      predictions.set(p.appointmentId, p.prediction.probability);
    });
  }

  // Collect all probabilities
  const probabilities = appointments.map((a) => {
    if (a.noShowPrediction) {
      return a.noShowPrediction.probability;
    }
    return predictions.get(a.id) || 0;
  });

  // Calculate combined probability
  const combinedProbability = calculateCombinedNoShowProbability(probabilities);

  // Only suggest if probability is high enough
  if (combinedProbability < OVERBOOKING_CONFIG.minNoShowProbability) {
    return null;
  }

  // Calculate expected value
  const expectedNoShows = combinedProbability * appointments.length;
  const expectedValue = expectedNoShows * OVERBOOKING_CONFIG.revenuePerSlot;

  return {
    date,
    time: startTime,
    providerId,
    existingAppointments: appointments.map((a) => ({
      id: a.id,
      noShowProbability: a.noShowPrediction?.probability || predictions.get(a.id) || 0,
    })),
    combinedNoShowProbability: combinedProbability,
    expectedValue: Math.round(expectedValue),
    reason: `${appointments.length} appointments with ${Math.round(combinedProbability * 100)}% combined no-show probability. Expected ${expectedNoShows.toFixed(1)} no-shows.`,
  };
}

/**
 * Generate overbooking recommendations for a provider
 */
export async function generateOverbookingRecommendations(
  organizationId: string,
  providerId: string
): Promise<OverbookingCandidate[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + OVERBOOKING_CONFIG.lookAheadDays);

  // Get provider's schedule
  const provider = await prisma.provider.findFirst({
    where: { id: providerId, organizationId },
    include: {
      schedules: { where: { isActive: true } },
    },
  });

  if (!provider) {
    throw new Error('Provider not found');
  }

  const recommendations: OverbookingCandidate[] = [];

  // Analyze each day
  for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const daySchedule = provider.schedules.find(
      (s) => s.dayOfWeek === getDayOfWeekEnum(dayOfWeek)
    );

    if (!daySchedule) continue;

    // Analyze morning and afternoon slots
    const slots = getTimeSlots(daySchedule.startTime, daySchedule.endTime);

    for (const slot of slots) {
      const candidate = await analyzeTimeSlot(
        organizationId,
        providerId,
        new Date(d),
        slot.start,
        slot.end
      );

      if (candidate) {
        recommendations.push(candidate);
      }
    }
  }

  // Sort by expected value
  return recommendations.sort((a, b) => (b.expectedValue || 0) - (a.expectedValue || 0));
}

/**
 * Store overbooking recommendations in the database
 */
export async function storeOverbookingRecommendations(
  organizationId: string,
  recommendations: OverbookingCandidate[]
): Promise<string[]> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + OVERBOOKING_CONFIG.expirationHours);

  const ids: string[] = [];

  for (const rec of recommendations) {
    // Check if similar recommendation already exists
    const existing = await prisma.overbookingRecommendation.findFirst({
      where: {
        organizationId,
        providerId: rec.providerId,
        suggestedDate: rec.date,
        suggestedTime: rec.time,
        status: 'PENDING',
      },
    });

    if (existing) {
      // Update existing
      await prisma.overbookingRecommendation.update({
        where: { id: existing.id },
        data: {
          riskAssessment: rec.combinedNoShowProbability,
          expectedValue: rec.expectedValue,
          reason: rec.reason,
          expiresAt,
        },
      });
      ids.push(existing.id);
    } else {
      // Create new
      const created = await prisma.overbookingRecommendation.create({
        data: {
          organizationId,
          providerId: rec.providerId,
          suggestedDate: rec.date,
          suggestedTime: rec.time,
          reason: rec.reason,
          riskAssessment: rec.combinedNoShowProbability,
          expectedValue: rec.expectedValue,
          expiresAt,
        },
      });
      ids.push(created.id);
    }
  }

  return ids;
}

/**
 * Get pending overbooking recommendations
 */
export async function getPendingRecommendations(
  organizationId: string,
  providerId?: string
): Promise<
  Array<{
    id: string;
    suggestedDate: Date;
    suggestedTime: string;
    providerId: string;
    providerName: string;
    reason: string;
    riskAssessment: number;
    expectedValue: number | null;
    expiresAt: Date | null;
  }>
> {
  const recommendations = await prisma.overbookingRecommendation.findMany({
    where: {
      organizationId,
      status: 'PENDING',
      ...(providerId && { providerId }),
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: {
      provider: {
        include: {
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      },
    },
    orderBy: [{ suggestedDate: 'asc' }, { suggestedTime: 'asc' }],
  });

  return recommendations.map((r) => ({
    id: r.id,
    suggestedDate: r.suggestedDate,
    suggestedTime: r.suggestedTime,
    providerId: r.providerId,
    providerName: `${r.provider.user.firstName} ${r.provider.user.lastName}`,
    reason: r.reason,
    riskAssessment: r.riskAssessment,
    expectedValue: r.expectedValue,
    expiresAt: r.expiresAt,
  }));
}

/**
 * Apply an overbooking decision
 */
export async function applyOverbookingDecision(
  decision: OverbookingDecision
): Promise<void> {
  const status: OverbookingStatus = decision.accepted ? 'ACCEPTED' : 'DECLINED';

  await prisma.overbookingRecommendation.update({
    where: { id: decision.recommendationId },
    data: {
      status,
      decidedAt: new Date(),
      decidedBy: decision.userId,
      declineReason: decision.declineReason,
    },
  });
}

/**
 * Record that an overbooking was successfully booked
 */
export async function recordOverbooking(
  recommendationId: string,
  appointmentId: string
): Promise<void> {
  await prisma.overbookingRecommendation.update({
    where: { id: recommendationId },
    data: {
      bookedAppointmentId: appointmentId,
    },
  });
}

/**
 * Expire old recommendations
 */
export async function expireOldRecommendations(
  organizationId: string
): Promise<number> {
  const result = await prisma.overbookingRecommendation.updateMany({
    where: {
      organizationId,
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: {
      status: 'EXPIRED',
    },
  });

  return result.count;
}

// Helper functions

function getDayOfWeekEnum(day: number): string {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[day];
}

function getTimeSlots(
  startTime: string,
  endTime: string
): Array<{ start: string; end: string }> {
  const slots: Array<{ start: string; end: string }> = [];
  const [startHour] = startTime.split(':').map(Number);
  const [endHour] = endTime.split(':').map(Number);

  // Create 2-hour slots
  for (let hour = startHour; hour < endHour; hour += 2) {
    const slotEnd = Math.min(hour + 2, endHour);
    slots.push({
      start: `${hour.toString().padStart(2, '0')}:00`,
      end: `${slotEnd.toString().padStart(2, '0')}:00`,
    });
  }

  return slots;
}
