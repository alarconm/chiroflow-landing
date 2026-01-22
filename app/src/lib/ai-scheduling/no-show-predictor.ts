/**
 * No-Show Prediction Service
 * Predicts likelihood of patient no-shows based on historical data and ML models
 */

import { prisma } from '@/lib/prisma';
import type { NoShowRiskLevel } from '@prisma/client';
import type {
  NoShowPredictionResult,
  PatientNoShowHistory,
  PredictionInput,
  BatchPredictionResult,
} from './types';
import { predictNoShow as mockPredict, getRiskLevel } from './mock-ml';

/**
 * Get patient's no-show history from the database
 */
export async function getPatientNoShowHistory(
  patientId: string,
  organizationId: string
): Promise<PatientNoShowHistory> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Get all completed appointments (past and with outcome)
  const appointments = await prisma.appointment.findMany({
    where: {
      patientId,
      organizationId,
      startTime: { lt: new Date() },
      status: { in: ['COMPLETED', 'NO_SHOW', 'CANCELLED'] },
    },
    select: {
      id: true,
      status: true,
      startTime: true,
      checkedInAt: true,
    },
  });

  const totalAppointments = appointments.length;
  const noShowCount = appointments.filter((a) => a.status === 'NO_SHOW').length;
  const cancelledCount = appointments.filter((a) => a.status === 'CANCELLED').length;

  // Late = checked in more than 10 minutes after start time
  const lateCount = appointments.filter((a) => {
    if (!a.checkedInAt || a.status !== 'COMPLETED') return false;
    const diff = a.checkedInAt.getTime() - a.startTime.getTime();
    return diff > 10 * 60 * 1000; // 10 minutes in ms
  }).length;

  // Recent no-shows (last 6 months)
  const recentAppointments = appointments.filter(
    (a) => a.startTime >= sixMonthsAgo
  );
  const recentNoShows = recentAppointments.filter(
    (a) => a.status === 'NO_SHOW'
  ).length;

  const noShowRate =
    totalAppointments > 0 ? noShowCount / totalAppointments : 0;

  return {
    totalAppointments,
    noShowCount,
    cancelledCount,
    lateCount,
    recentNoShows,
    noShowRate: Math.round(noShowRate * 100) / 100,
  };
}

/**
 * Predict no-show probability for a single appointment
 */
export async function predictNoShow(
  appointmentId: string,
  organizationId: string
): Promise<NoShowPredictionResult> {
  // Fetch appointment with related data
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      organizationId,
    },
    include: {
      patient: true,
      appointmentType: true,
      provider: true,
    },
  });

  if (!appointment) {
    throw new Error('Appointment not found');
  }

  // Get patient history
  const history = await getPatientNoShowHistory(
    appointment.patientId,
    organizationId
  );

  // Build prediction input
  const input: PredictionInput = {
    patientId: appointment.patientId,
    appointmentId: appointment.id,
    appointmentTypeId: appointment.appointmentTypeId,
    providerId: appointment.providerId,
    scheduledDate: appointment.startTime,
    scheduledTime: appointment.startTime.toTimeString().slice(0, 5),
    patientHistory: history,
  };

  // Use mock ML model for prediction
  const prediction = mockPredict(input, appointment.appointmentType.name);

  return prediction;
}

/**
 * Predict no-show probability for multiple appointments
 */
export async function batchPredictNoShows(
  appointmentIds: string[],
  organizationId: string
): Promise<BatchPredictionResult[]> {
  // Fetch all appointments with related data
  const appointments = await prisma.appointment.findMany({
    where: {
      id: { in: appointmentIds },
      organizationId,
    },
    include: {
      patient: true,
      appointmentType: true,
      provider: true,
    },
  });

  // Get unique patient IDs
  const patientIds = [...new Set(appointments.map((a) => a.patientId))];

  // Fetch all patient histories in parallel
  const histories = await Promise.all(
    patientIds.map(async (patientId) => ({
      patientId,
      history: await getPatientNoShowHistory(patientId, organizationId),
    }))
  );

  const historyMap = new Map(
    histories.map((h) => [h.patientId, h.history])
  );

  // Generate predictions
  return appointments.map((appointment) => {
    const input: PredictionInput = {
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      appointmentTypeId: appointment.appointmentTypeId,
      providerId: appointment.providerId,
      scheduledDate: appointment.startTime,
      scheduledTime: appointment.startTime.toTimeString().slice(0, 5),
      patientHistory: historyMap.get(appointment.patientId),
    };

    return {
      appointmentId: appointment.id,
      prediction: mockPredict(input, appointment.appointmentType.name),
    };
  });
}

/**
 * Store a prediction in the database
 */
export async function storePrediction(
  appointmentId: string,
  prediction: NoShowPredictionResult
): Promise<void> {
  // Cast factors to JSON-compatible type for Prisma
  const factorsJson = prediction.factors as unknown as Record<string, number>;

  await prisma.noShowPrediction.upsert({
    where: { appointmentId },
    create: {
      appointmentId,
      probability: prediction.probability,
      riskLevel: prediction.riskLevel,
      factors: factorsJson,
      confidenceScore: prediction.confidenceScore,
      modelVersion: '1.0-mock',
    },
    update: {
      probability: prediction.probability,
      riskLevel: prediction.riskLevel,
      factors: factorsJson,
      confidenceScore: prediction.confidenceScore,
      modelVersion: '1.0-mock',
      updatedAt: new Date(),
    },
  });
}

/**
 * Record actual outcome for model improvement
 */
export async function recordOutcome(
  appointmentId: string,
  outcome: 'ATTENDED' | 'NO_SHOW' | 'CANCELLED'
): Promise<void> {
  const prediction = await prisma.noShowPrediction.findUnique({
    where: { appointmentId },
  });

  if (!prediction) return;

  // Determine if prediction was accurate
  const wasNoShow = outcome === 'NO_SHOW';
  const predictedNoShow = prediction.probability >= 0.3; // Using moderate threshold
  const wasAccurate = wasNoShow === predictedNoShow;

  await prisma.noShowPrediction.update({
    where: { appointmentId },
    data: {
      actualOutcome: outcome,
      wasAccurate,
    },
  });
}

/**
 * Get high-risk appointments for a date range
 */
export async function getHighRiskAppointments(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  minRiskLevel: NoShowRiskLevel = 'HIGH'
): Promise<
  Array<{
    appointment: {
      id: string;
      startTime: Date;
      patient: { id: string; demographics: { firstName: string; lastName: string } | null };
      provider: { id: string; user: { firstName: string; lastName: string } };
      appointmentType: { id: string; name: string };
    };
    prediction: {
      probability: number;
      riskLevel: NoShowRiskLevel;
    };
  }>
> {
  const riskLevels: NoShowRiskLevel[] =
    minRiskLevel === 'MODERATE'
      ? ['MODERATE', 'HIGH', 'VERY_HIGH']
      : minRiskLevel === 'HIGH'
      ? ['HIGH', 'VERY_HIGH']
      : ['VERY_HIGH'];

  const predictions = await prisma.noShowPrediction.findMany({
    where: {
      riskLevel: { in: riskLevels },
      appointment: {
        organizationId,
        startTime: {
          gte: startDate,
          lte: endDate,
        },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
    },
    include: {
      appointment: {
        include: {
          patient: {
            include: {
              demographics: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          provider: {
            include: {
              user: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          appointmentType: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { probability: 'desc' },
  });

  return predictions.map((p) => ({
    appointment: {
      id: p.appointment.id,
      startTime: p.appointment.startTime,
      patient: {
        id: p.appointment.patient.id,
        demographics: p.appointment.patient.demographics,
      },
      provider: {
        id: p.appointment.provider.id,
        user: p.appointment.provider.user,
      },
      appointmentType: p.appointment.appointmentType,
    },
    prediction: {
      probability: p.probability,
      riskLevel: p.riskLevel,
    },
  }));
}

/**
 * Refresh predictions for upcoming appointments
 * Run this periodically (e.g., daily) to keep predictions current
 */
export async function refreshUpcomingPredictions(
  organizationId: string,
  daysAhead: number = 7
): Promise<number> {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysAhead);

  // Get appointments without predictions or with old predictions
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: {
        gte: new Date(),
        lte: endDate,
      },
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      OR: [
        { noShowPrediction: null },
        {
          noShowPrediction: {
            updatedAt: {
              lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Older than 24 hours
            },
          },
        },
      ],
    },
    select: { id: true },
  });

  if (appointments.length === 0) return 0;

  const predictions = await batchPredictNoShows(
    appointments.map((a) => a.id),
    organizationId
  );

  // Store all predictions
  await Promise.all(
    predictions.map(({ appointmentId, prediction }) =>
      storePrediction(appointmentId, prediction)
    )
  );

  return predictions.length;
}
