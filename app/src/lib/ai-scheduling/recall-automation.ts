/**
 * Recall Automation Service
 * Manages automated recall sequences for patient re-engagement
 */

import { prisma } from '@/lib/prisma';
import type { RecallStatus, RecallStepType } from '@prisma/client';
import type {
  RecallSequenceConfig,
  RecallStepConfig,
  RecallCandidate,
  RecallExecutionResult,
  SchedulingInsight,
} from './types';

// Configuration
const RECALL_CONFIG = {
  defaultDaysSinceVisit: 30,    // Default recall trigger
  maxAttempts: 5,               // Max contact attempts
  cooldownDays: 7,              // Days between contact attempts
  batchSize: 50,                // Patients per batch
};

/**
 * Create a new recall sequence
 */
export async function createRecallSequence(
  organizationId: string,
  config: RecallSequenceConfig
): Promise<string> {
  const sequence = await prisma.recallSequence.create({
    data: {
      organizationId,
      name: config.name,
      description: config.description,
      appointmentTypes: config.appointmentTypes,
      daysSinceLastVisit: config.daysSinceLastVisit,
      maxAttempts: config.maxAttempts,
      stopOnSchedule: config.stopOnSchedule,
      status: 'ACTIVE',
    },
  });

  // Create steps
  for (const step of config.steps) {
    await prisma.recallSequenceStep.create({
      data: {
        sequenceId: sequence.id,
        stepNumber: step.stepNumber,
        stepType: step.stepType,
        daysFromStart: step.daysFromStart,
        templateId: step.templateId,
        subject: step.subject,
        body: step.body,
      },
    });
  }

  return sequence.id;
}

/**
 * Update a recall sequence
 */
export async function updateRecallSequence(
  sequenceId: string,
  updates: Partial<RecallSequenceConfig>
): Promise<void> {
  await prisma.recallSequence.update({
    where: { id: sequenceId },
    data: {
      name: updates.name,
      description: updates.description,
      appointmentTypes: updates.appointmentTypes,
      daysSinceLastVisit: updates.daysSinceLastVisit,
      maxAttempts: updates.maxAttempts,
      stopOnSchedule: updates.stopOnSchedule,
    },
  });

  // Update steps if provided
  if (updates.steps) {
    // Delete existing steps
    await prisma.recallSequenceStep.deleteMany({
      where: { sequenceId },
    });

    // Create new steps
    for (const step of updates.steps) {
      await prisma.recallSequenceStep.create({
        data: {
          sequenceId,
          stepNumber: step.stepNumber,
          stepType: step.stepType,
          daysFromStart: step.daysFromStart,
          templateId: step.templateId,
          subject: step.subject,
          body: step.body,
        },
      });
    }
  }
}

/**
 * Get all recall sequences for an organization
 */
export async function getRecallSequences(
  organizationId: string,
  includeInactive: boolean = false
): Promise<
  Array<{
    id: string;
    name: string;
    description: string | null;
    appointmentTypes: string[];
    daysSinceLastVisit: number;
    maxAttempts: number;
    isActive: boolean;
    steps: Array<{
      stepNumber: number;
      stepType: RecallStepType;
      daysFromStart: number;
    }>;
    enrollmentCount: number;
  }>
> {
  const where: Record<string, unknown> = { organizationId };
  if (!includeInactive) {
    where.status = 'ACTIVE';
  }

  const sequences = await prisma.recallSequence.findMany({
    where,
    include: {
      steps: {
        orderBy: { stepNumber: 'asc' },
      },
      _count: {
        select: { enrollments: true },
      },
    },
  });

  return sequences.map((seq) => ({
    id: seq.id,
    name: seq.name,
    description: seq.description,
    appointmentTypes: seq.appointmentTypes,
    daysSinceLastVisit: seq.daysSinceLastVisit,
    maxAttempts: seq.maxAttempts,
    isActive: seq.status === 'ACTIVE',
    steps: seq.steps.map((step) => ({
      stepNumber: step.stepNumber,
      stepType: step.stepType,
      daysFromStart: step.daysFromStart,
    })),
    enrollmentCount: seq._count.enrollments,
  }));
}

/**
 * Find patients eligible for recall
 */
export async function findRecallCandidates(
  organizationId: string,
  options?: {
    sequenceId?: string;
    limit?: number;
  }
): Promise<RecallCandidate[]> {
  const limit = options?.limit || RECALL_CONFIG.batchSize;

  // Get active sequences
  const sequenceWhere: Record<string, unknown> = {
    organizationId,
    status: 'ACTIVE',
  };
  if (options?.sequenceId) {
    sequenceWhere.id = options.sequenceId;
  }

  const sequences = await prisma.recallSequence.findMany({
    where: sequenceWhere,
  });

  if (sequences.length === 0) {
    return [];
  }

  const candidates: RecallCandidate[] = [];

  for (const sequence of sequences) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - sequence.daysSinceLastVisit);

    // Find patients who:
    // 1. Had their last completed appointment before the cutoff
    // 2. Don't have any future scheduled appointments
    // 3. Aren't already enrolled in this sequence
    // 4. Match the appointment type filter (if any)
    const patients = await prisma.patient.findMany({
      where: {
        organizationId,
        appointments: {
          some: {
            status: 'COMPLETED',
            startTime: { lt: cutoffDate },
            ...(sequence.appointmentTypes.length > 0 && {
              appointmentTypeId: { in: sequence.appointmentTypes },
            }),
          },
          none: {
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
            startTime: { gt: new Date() },
          },
        },
        recallEnrollments: {
          none: {
            sequenceId: sequence.id,
            status: { in: ['ACTIVE', 'PAUSED'] },
          },
        },
      },
      include: {
        demographics: {
          select: { firstName: true, lastName: true },
        },
        contacts: {
          where: { isPrimary: true },
          take: 1,
        },
        appointments: {
          where: { status: 'COMPLETED' },
          orderBy: { startTime: 'desc' },
          take: 1,
          include: { appointmentType: true },
        },
      },
      take: limit,
    });

    for (const patient of patients) {
      const lastAppt = patient.appointments[0];
      if (!lastAppt) continue;

      const daysSinceLastVisit = Math.floor(
        (Date.now() - lastAppt.startTime.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determine best contact method from primary contact
      let contactMethod: 'email' | 'sms' | 'phone' = 'phone';
      let contactInfo = '';
      const primaryContact = patient.contacts[0];

      if (primaryContact?.email) {
        contactMethod = 'email';
        contactInfo = primaryContact.email;
      } else if (primaryContact?.mobilePhone) {
        contactMethod = 'sms';
        contactInfo = primaryContact.mobilePhone;
      } else if (primaryContact?.homePhone) {
        contactMethod = 'phone';
        contactInfo = primaryContact.homePhone;
      }

      candidates.push({
        patientId: patient.id,
        patientName: patient.demographics
          ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
          : 'Unknown',
        lastVisitDate: lastAppt.startTime,
        daysSinceLastVisit,
        lastAppointmentType: lastAppt.appointmentType.name,
        contactMethod,
        contactInfo,
        eligibleSequences: [sequence.id],
      });
    }
  }

  // Deduplicate by patient and merge eligible sequences
  const candidateMap = new Map<string, RecallCandidate>();
  for (const candidate of candidates) {
    if (candidateMap.has(candidate.patientId)) {
      const existing = candidateMap.get(candidate.patientId)!;
      existing.eligibleSequences.push(...candidate.eligibleSequences);
    } else {
      candidateMap.set(candidate.patientId, candidate);
    }
  }

  return Array.from(candidateMap.values()).slice(0, limit);
}

/**
 * Enroll a patient in a recall sequence
 */
export async function enrollPatient(
  organizationId: string,
  patientId: string,
  sequenceId: string
): Promise<string> {
  // Check if already enrolled
  const existing = await prisma.recallEnrollment.findFirst({
    where: {
      patientId,
      sequenceId,
      status: { in: ['ACTIVE', 'PAUSED'] },
    },
  });

  if (existing) {
    return existing.id;
  }

  const enrollment = await prisma.recallEnrollment.create({
    data: {
      patientId,
      sequenceId,
      status: 'ACTIVE',
      lastStepNumber: 0,
      nextStepDue: new Date(),
    },
  });

  return enrollment.id;
}

/**
 * Batch enroll patients
 */
export async function batchEnrollPatients(
  organizationId: string,
  candidates: Array<{ patientId: string; sequenceId: string }>
): Promise<string[]> {
  const ids: string[] = [];

  for (const candidate of candidates) {
    const id = await enrollPatient(
      organizationId,
      candidate.patientId,
      candidate.sequenceId
    );
    ids.push(id);
  }

  return ids;
}

/**
 * Get pending recall steps to execute
 */
export async function getPendingRecallSteps(
  organizationId: string,
  limit: number = 50
): Promise<
  Array<{
    enrollmentId: string;
    patientId: string;
    patientName: string;
    sequenceName: string;
    stepNumber: number;
    stepType: RecallStepType;
    contactInfo: { email?: string; phone?: string };
    subject?: string;
    body?: string;
    templateId?: string;
  }>
> {
  // Get enrollments with their sequence's organization
  const enrollments = await prisma.recallEnrollment.findMany({
    where: {
      sequence: { organizationId },
      status: 'ACTIVE',
      nextStepDue: { lte: new Date() },
    },
    include: {
      patient: {
        include: {
          demographics: {
            select: { firstName: true, lastName: true },
          },
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      },
      sequence: {
        include: {
          steps: true,
        },
      },
    },
    take: limit,
  });

  const pending: Array<{
    enrollmentId: string;
    patientId: string;
    patientName: string;
    sequenceName: string;
    stepNumber: number;
    stepType: RecallStepType;
    contactInfo: { email?: string; phone?: string };
    subject?: string;
    body?: string;
    templateId?: string;
  }> = [];

  for (const enrollment of enrollments) {
    // Next step is lastStepNumber + 1
    const nextStepNumber = enrollment.lastStepNumber + 1;
    const step = enrollment.sequence.steps.find(
      (s) => s.stepNumber === nextStepNumber
    );

    if (!step) continue;

    const primaryContact = enrollment.patient.contacts[0];

    pending.push({
      enrollmentId: enrollment.id,
      patientId: enrollment.patientId,
      patientName: enrollment.patient.demographics
        ? `${enrollment.patient.demographics.firstName} ${enrollment.patient.demographics.lastName}`
        : 'Unknown',
      sequenceName: enrollment.sequence.name,
      stepNumber: step.stepNumber,
      stepType: step.stepType,
      contactInfo: {
        email: primaryContact?.email || undefined,
        phone: primaryContact?.mobilePhone || primaryContact?.homePhone || undefined,
      },
      subject: step.subject || undefined,
      body: step.body || undefined,
      templateId: step.templateId || undefined,
    });
  }

  return pending;
}

/**
 * Record a recall step execution
 */
export async function recordStepExecution(
  enrollmentId: string,
  stepId: string,
  result: RecallExecutionResult
): Promise<void> {
  // Create execution record
  await prisma.recallStepExecution.create({
    data: {
      enrollmentId,
      stepId,
      executedAt: new Date(),
      success: result.success,
      messageId: result.messageId,
      errorMessage: result.error,
    },
  });

  // Update enrollment
  const enrollment = await prisma.recallEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      sequence: {
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      },
    },
  });

  if (!enrollment) return;

  const currentStepNumber = enrollment.lastStepNumber + 1;
  const currentStepIndex = enrollment.sequence.steps.findIndex(
    (s) => s.stepNumber === currentStepNumber
  );
  const nextStep = enrollment.sequence.steps[currentStepIndex + 1];

  if (result.success) {
    if (nextStep) {
      // Move to next step
      const nextDue = new Date();
      nextDue.setDate(nextDue.getDate() + nextStep.daysFromStart);

      await prisma.recallEnrollment.update({
        where: { id: enrollmentId },
        data: {
          lastStepNumber: currentStepNumber,
          nextStepDue: nextDue,
        },
      });
    } else {
      // Sequence complete
      await prisma.recallEnrollment.update({
        where: { id: enrollmentId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          lastStepNumber: currentStepNumber,
        },
      });
    }
  } else {
    // Failed - check if we've exceeded max attempts via executions count
    const executionCount = await prisma.recallStepExecution.count({
      where: { enrollmentId, stepId },
    });

    if (executionCount >= enrollment.sequence.maxAttempts) {
      await prisma.recallEnrollment.update({
        where: { id: enrollmentId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
          completedReason: 'MAX_ATTEMPTS',
        },
      });
    } else {
      // Schedule retry
      const retryDate = new Date();
      retryDate.setDate(retryDate.getDate() + RECALL_CONFIG.cooldownDays);

      await prisma.recallEnrollment.update({
        where: { id: enrollmentId },
        data: {
          nextStepDue: retryDate,
        },
      });
    }
  }
}

/**
 * Handle patient response (scheduled, opted out, etc.)
 */
export async function handlePatientResponse(
  enrollmentId: string,
  response: 'SCHEDULED' | 'OPTED_OUT' | 'NO_RESPONSE'
): Promise<void> {
  const enrollment = await prisma.recallEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { sequence: true },
  });

  if (!enrollment) return;

  if (response === 'SCHEDULED') {
    await prisma.recallEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedReason: 'SCHEDULED',
        didSchedule: true,
      },
    });
  } else if (response === 'OPTED_OUT') {
    await prisma.recallEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        completedReason: 'OPTED_OUT',
      },
    });
  }
}

/**
 * Get recall statistics
 */
export async function getRecallStatistics(
  organizationId: string,
  dateRange?: { start: Date; end: Date }
): Promise<{
  totalEnrollments: number;
  activeEnrollments: number;
  completed: number;
  scheduled: number;
  optedOut: number;
  failed: number;
  successRate: number;
  bySequence: Array<{
    sequenceId: string;
    sequenceName: string;
    enrollments: number;
    scheduled: number;
    successRate: number;
  }>;
}> {
  const dateFilter = dateRange
    ? { createdAt: { gte: dateRange.start, lte: dateRange.end } }
    : {};

  const enrollments = await prisma.recallEnrollment.groupBy({
    by: ['status'],
    where: {
      sequence: { organizationId },
      ...dateFilter,
    },
    _count: { id: true },
  });

  const statusCounts = enrollments.reduce(
    (acc, e) => {
      acc[e.status] = e._count.id;
      return acc;
    },
    {} as Record<string, number>
  );

  const total = enrollments.reduce((sum, e) => sum + e._count.id, 0);
  // SCHEDULED is now stored via completedReason, not status
  const completed = statusCounts['COMPLETED'] || 0;
  const cancelled = statusCounts['CANCELLED'] || 0;
  const active = statusCounts['ACTIVE'] || 0;
  const paused = statusCounts['PAUSED'] || 0;

  // Get scheduled count from completedReason
  const scheduledCount = await prisma.recallEnrollment.count({
    where: {
      sequence: { organizationId },
      ...dateFilter,
      completedReason: 'SCHEDULED',
    },
  });

  // Get opted out count from completedReason
  const optedOutCount = await prisma.recallEnrollment.count({
    where: {
      sequence: { organizationId },
      ...dateFilter,
      completedReason: 'OPTED_OUT',
    },
  });

  const successRate = total > 0 ? (scheduledCount + completed) / total : 0;

  // By sequence statistics
  const bySequence = await prisma.recallEnrollment.groupBy({
    by: ['sequenceId', 'status'],
    where: {
      sequence: { organizationId },
      ...dateFilter,
    },
    _count: { id: true },
  });

  const sequenceStats = new Map<
    string,
    { total: number; scheduled: number }
  >();

  for (const item of bySequence) {
    if (!sequenceStats.has(item.sequenceId)) {
      sequenceStats.set(item.sequenceId, { total: 0, scheduled: 0 });
    }
    const stats = sequenceStats.get(item.sequenceId)!;
    stats.total += item._count.id;
  }

  // Add scheduled counts per sequence
  const scheduledBySequence = await prisma.recallEnrollment.groupBy({
    by: ['sequenceId'],
    where: {
      sequence: { organizationId },
      ...dateFilter,
      completedReason: 'SCHEDULED',
    },
    _count: { id: true },
  });

  for (const item of scheduledBySequence) {
    const stats = sequenceStats.get(item.sequenceId);
    if (stats) {
      stats.scheduled = item._count.id;
    }
  }

  // Get sequence names
  const sequences = await prisma.recallSequence.findMany({
    where: { id: { in: Array.from(sequenceStats.keys()) } },
    select: { id: true, name: true },
  });

  const sequenceNameMap = new Map(sequences.map((s) => [s.id, s.name]));

  const bySequenceStats = Array.from(sequenceStats.entries()).map(
    ([sequenceId, stats]) => ({
      sequenceId,
      sequenceName: sequenceNameMap.get(sequenceId) || 'Unknown',
      enrollments: stats.total,
      scheduled: stats.scheduled,
      successRate: stats.total > 0 ? stats.scheduled / stats.total : 0,
    })
  );

  return {
    totalEnrollments: total,
    activeEnrollments: active,
    completed,
    scheduled: scheduledCount,
    optedOut: optedOutCount,
    failed: cancelled,
    successRate: Math.round(successRate * 100) / 100,
    bySequence: bySequenceStats,
  };
}

/**
 * Generate recall insights
 */
export async function generateRecallInsights(
  organizationId: string
): Promise<SchedulingInsight[]> {
  const insights: SchedulingInsight[] = [];

  const stats = await getRecallStatistics(organizationId);

  // Check for active campaigns with low success rate
  for (const seq of stats.bySequence) {
    if (seq.enrollments >= 10 && seq.successRate < 0.2) {
      insights.push({
        id: `recall-low-success-${seq.sequenceId}-${Date.now()}`,
        type: 'warning',
        category: 'recall',
        title: `Low Success: ${seq.sequenceName}`,
        description: `Only ${Math.round(seq.successRate * 100)}% of patients contacted have scheduled. Consider revising the messaging or timing.`,
        priority: 7,
        actionable: true,
        suggestedAction: 'Review and update recall sequence messaging and timing.',
        createdAt: new Date(),
      });
    }
  }

  // Check for patients due for recall
  const candidates = await findRecallCandidates(organizationId, { limit: 100 });
  if (candidates.length >= 20) {
    insights.push({
      id: `recall-candidates-${Date.now()}`,
      type: 'opportunity',
      category: 'recall',
      title: 'Patients Due for Recall',
      description: `${candidates.length} patients are due for recall but not yet enrolled in any sequence.`,
      priority: 8,
      actionable: true,
      suggestedAction: 'Enroll these patients in an appropriate recall sequence.',
      data: { candidateCount: candidates.length },
      createdAt: new Date(),
    });
  }

  // Check for stalled enrollments
  const stalledCount = await prisma.recallEnrollment.count({
    where: {
      sequence: { organizationId },
      status: 'ACTIVE',
      nextStepDue: {
        lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // More than 7 days overdue
      },
    },
  });

  if (stalledCount > 0) {
    insights.push({
      id: `recall-stalled-${Date.now()}`,
      type: 'warning',
      category: 'recall',
      title: 'Stalled Recall Enrollments',
      description: `${stalledCount} recall enrollments have been stalled for more than 7 days.`,
      priority: 6,
      actionable: true,
      suggestedAction: 'Review and process pending recall steps.',
      createdAt: new Date(),
    });
  }

  return insights;
}
