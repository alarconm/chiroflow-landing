import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { auditLog } from '@/lib/audit';
import type { CareOutreachType, CareOutreachStatus, Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';

// Types for treatment plan monitoring
interface TreatmentPlanComplianceData {
  patientId: string;
  patientName: string;
  treatmentPlanId: string;
  treatmentPlanName: string;
  plannedVisits: number | null;
  completedVisits: number;
  frequency: string | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
  complianceRate: number;
  isOnTrack: boolean;
  daysInPlan: number;
  expectedVisits: number;
  visitDeficit: number;
  lastVisitDate: Date | null;
  daysSinceLastVisit: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  alerts: string[];
}

interface OutcomeTrend {
  patientId: string;
  patientName: string;
  assessmentType: string;
  dataPoints: Array<{
    date: Date;
    score: number;
    encounterId: string;
  }>;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  changePercent: number;
  latestScore: number;
  baselineScore: number | null;
  goalScore: number | null;
}

interface AtRiskPatient {
  patientId: string;
  patientName: string;
  riskScore: number;
  riskFactors: string[];
  treatmentPlanId: string | null;
  treatmentPlanName: string | null;
  lastVisitDate: Date | null;
  daysSinceLastVisit: number | null;
  missedAppointments: number;
  complianceRate: number;
  recommendedActions: string[];
}

interface MilestoneProgress {
  treatmentPlanId: string;
  patientId: string;
  patientName: string;
  milestones: Array<{
    name: string;
    targetDate: Date | null;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'ACHIEVED' | 'MISSED';
    achievedDate: Date | null;
    progress: number;
  }>;
  overallProgress: number;
  nextMilestone: string | null;
  nextMilestoneDate: Date | null;
}

// Helper function to calculate risk level
function calculateRiskLevel(complianceRate: number, daysSinceLastVisit: number | null, missedAppointments: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  let riskScore = 0;

  // Compliance rate factor
  if (complianceRate < 50) riskScore += 3;
  else if (complianceRate < 70) riskScore += 2;
  else if (complianceRate < 85) riskScore += 1;

  // Days since last visit factor
  if (daysSinceLastVisit !== null) {
    if (daysSinceLastVisit > 30) riskScore += 3;
    else if (daysSinceLastVisit > 14) riskScore += 2;
    else if (daysSinceLastVisit > 7) riskScore += 1;
  }

  // Missed appointments factor
  if (missedAppointments >= 3) riskScore += 3;
  else if (missedAppointments >= 2) riskScore += 2;
  else if (missedAppointments >= 1) riskScore += 1;

  if (riskScore >= 7) return 'CRITICAL';
  if (riskScore >= 5) return 'HIGH';
  if (riskScore >= 3) return 'MEDIUM';
  return 'LOW';
}

// Helper to calculate trend from data points
function calculateTrend(dataPoints: Array<{ score: number; date: Date }>): 'IMPROVING' | 'STABLE' | 'DECLINING' {
  if (dataPoints.length < 2) return 'STABLE';

  const sorted = [...dataPoints].sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
  const secondHalf = sorted.slice(Math.ceil(sorted.length / 2));

  const firstAvg = firstHalf.reduce((sum, p) => sum + p.score, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, p) => sum + p.score, 0) / secondHalf.length;

  const changePercent = ((secondAvg - firstAvg) / Math.max(firstAvg, 1)) * 100;

  if (changePercent > 5) return 'IMPROVING';
  if (changePercent < -5) return 'DECLINING';
  return 'STABLE';
}

// Helper to get patient name from relations
function getPatientName(patient: { demographics?: { firstName: string; lastName: string } | null }): string {
  return patient.demographics
    ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
    : 'Unknown Patient';
}

// Types for intelligent reminders
interface ReminderTiming {
  hoursBeforeAppointment: number;
  isOptimal: boolean;
  reason: string;
}

interface NoShowRisk {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  riskScore: number; // 0-100
  factors: string[];
  recommendedActions: string[];
}

interface PersonalizedReminder {
  appointmentId: string;
  patientId: string;
  patientName: string;
  appointmentDate: Date;
  appointmentTime: string;
  appointmentType: string;
  providerName: string;
  channel: 'sms' | 'email' | 'phone' | 'portal';
  message: string;
  subject?: string;
  preparationInstructions: string[];
  timing: ReminderTiming;
  noShowRisk: NoShowRisk;
  reminderSequence: number;
}

interface ReminderResponse {
  outreachId: string;
  appointmentId: string;
  responseType: 'CONFIRMED' | 'RESCHEDULE_REQUESTED' | 'CANCEL_REQUESTED' | 'NO_RESPONSE' | 'OTHER';
  responseText?: string;
  responseChannel: string;
  processedAt: Date;
  actionTaken?: string;
  newAppointmentId?: string; // If rescheduled
}

// Helper to calculate no-show risk for a patient
function calculateNoShowRisk(
  missedAppointments: number,
  totalAppointments: number,
  daysSinceLastVisit: number | null,
  hasActiveTreatmentPlan: boolean,
  reminderResponses: number,
  totalReminders: number
): NoShowRisk {
  let riskScore = 0;
  const factors: string[] = [];
  const recommendedActions: string[] = [];

  // No-show history (0-40 points)
  if (totalAppointments > 0) {
    const noShowRate = (missedAppointments / totalAppointments) * 100;
    if (noShowRate > 30) {
      riskScore += 40;
      factors.push(`High no-show rate: ${noShowRate.toFixed(0)}%`);
    } else if (noShowRate > 20) {
      riskScore += 30;
      factors.push(`Moderate no-show rate: ${noShowRate.toFixed(0)}%`);
    } else if (noShowRate > 10) {
      riskScore += 15;
      factors.push(`Some missed appointments: ${noShowRate.toFixed(0)}%`);
    } else if (missedAppointments > 0) {
      riskScore += 5;
      factors.push(`Occasional missed appointments`);
    }
  }

  // Days since last visit (0-25 points)
  if (daysSinceLastVisit !== null) {
    if (daysSinceLastVisit > 60) {
      riskScore += 25;
      factors.push(`Long gap since last visit: ${daysSinceLastVisit} days`);
    } else if (daysSinceLastVisit > 30) {
      riskScore += 15;
      factors.push(`Moderate gap since last visit: ${daysSinceLastVisit} days`);
    } else if (daysSinceLastVisit > 14) {
      riskScore += 5;
      factors.push(`${daysSinceLastVisit} days since last visit`);
    }
  }

  // Treatment plan engagement (0-15 points)
  if (!hasActiveTreatmentPlan) {
    riskScore += 10;
    factors.push('No active treatment plan');
  }

  // Reminder response rate (0-20 points)
  if (totalReminders > 2) {
    const responseRate = (reminderResponses / totalReminders) * 100;
    if (responseRate < 20) {
      riskScore += 20;
      factors.push(`Low reminder response rate: ${responseRate.toFixed(0)}%`);
    } else if (responseRate < 50) {
      riskScore += 10;
      factors.push(`Moderate reminder response rate: ${responseRate.toFixed(0)}%`);
    }
  }

  // Determine risk level and recommendations
  let riskLevel: NoShowRisk['riskLevel'];
  if (riskScore >= 70) {
    riskLevel = 'VERY_HIGH';
    recommendedActions.push('Call patient directly to confirm');
    recommendedActions.push('Send multiple reminders across channels');
    recommendedActions.push('Consider overbooking this slot');
  } else if (riskScore >= 50) {
    riskLevel = 'HIGH';
    recommendedActions.push('Send additional reminder 1 day before');
    recommendedActions.push('Request confirmation via multiple channels');
  } else if (riskScore >= 30) {
    riskLevel = 'MEDIUM';
    recommendedActions.push('Send standard reminders');
    recommendedActions.push('Follow up if no confirmation received');
  } else {
    riskLevel = 'LOW';
    recommendedActions.push('Standard reminder sequence');
  }

  return { riskLevel, riskScore, factors, recommendedActions };
}

// Helper to determine optimal send time based on patient behavior
function calculateOptimalTiming(
  appointmentDate: Date,
  patientPreferredTime: string | null,
  patientTimezone: string | null,
  reminderSequence: number,
  noShowRisk: NoShowRisk
): ReminderTiming {
  const now = new Date();
  const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Default timing based on sequence
  let hoursBeforeAppointment: number;
  let reason: string;

  if (reminderSequence === 1) {
    // First reminder: 48-72 hours before (adjust for high-risk)
    if (noShowRisk.riskLevel === 'VERY_HIGH' || noShowRisk.riskLevel === 'HIGH') {
      hoursBeforeAppointment = 72;
      reason = 'Early reminder for high-risk patient';
    } else {
      hoursBeforeAppointment = 48;
      reason = 'Standard first reminder';
    }
  } else if (reminderSequence === 2) {
    // Second reminder: 24 hours before
    hoursBeforeAppointment = 24;
    reason = 'Day-before reminder';
  } else {
    // Final reminder: 2-4 hours before
    if (noShowRisk.riskLevel === 'VERY_HIGH') {
      hoursBeforeAppointment = 4;
      reason = 'Same-day reminder for high-risk patient';
    } else {
      hoursBeforeAppointment = 2;
      reason = 'Same-day reminder';
    }
  }

  // Adjust if appointment is too soon
  if (hoursUntilAppointment < hoursBeforeAppointment) {
    hoursBeforeAppointment = Math.max(1, Math.floor(hoursUntilAppointment / 2));
    reason = 'Adjusted timing due to imminent appointment';
  }

  // Consider patient's preferred communication time
  let isOptimal = true;
  if (patientPreferredTime) {
    // Simple check - if preferred time is set, we'd use it
    isOptimal = true;
    reason += ' (using patient preference)';
  }

  return { hoursBeforeAppointment, isOptimal, reason };
}

// Helper to generate personalized message
function generatePersonalizedMessage(
  patientFirstName: string,
  appointmentType: string,
  appointmentDate: Date,
  providerName: string,
  channel: string,
  preparationInstructions: string[],
  noShowRisk: NoShowRisk
): { message: string; subject?: string } {
  const dateStr = appointmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = appointmentDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  // Adjust tone based on no-show risk
  const urgencyPrefix = noShowRisk.riskLevel === 'VERY_HIGH' || noShowRisk.riskLevel === 'HIGH'
    ? 'Important reminder: '
    : '';

  if (channel === 'sms') {
    let message = `${urgencyPrefix}Hi ${patientFirstName}, this is a reminder about your ${appointmentType} appointment on ${dateStr} at ${timeStr} with ${providerName}.`;

    if (preparationInstructions.length > 0) {
      message += ` Prep: ${preparationInstructions[0]}`;
    }

    message += ' Reply CONFIRM to confirm, RESCHEDULE to reschedule, or CANCEL to cancel.';

    return { message };
  }

  // Email format
  const subject = `${urgencyPrefix}Appointment Reminder - ${dateStr} at ${timeStr}`;

  let message = `Dear ${patientFirstName},\n\n`;
  message += `This is a friendly reminder about your upcoming appointment:\n\n`;
  message += `📅 Date: ${dateStr}\n`;
  message += `⏰ Time: ${timeStr}\n`;
  message += `🏥 Type: ${appointmentType}\n`;
  message += `👨‍⚕️ Provider: ${providerName}\n\n`;

  if (preparationInstructions.length > 0) {
    message += `**Preparation Instructions:**\n`;
    preparationInstructions.forEach((instruction, i) => {
      message += `${i + 1}. ${instruction}\n`;
    });
    message += '\n';
  }

  message += `Please confirm your attendance by replying to this email or clicking the link below.\n\n`;
  message += `[CONFIRM] [RESCHEDULE] [CANCEL]\n\n`;
  message += `If you need to reschedule or have any questions, please contact us.\n\n`;
  message += `Thank you!\n`;

  return { message, subject };
}

// Helper to get preparation instructions based on appointment type
function getPreparationInstructions(appointmentType: string): string[] {
  const typeNormalized = appointmentType.toLowerCase();

  if (typeNormalized.includes('initial') || typeNormalized.includes('new patient')) {
    return [
      'Please arrive 15 minutes early to complete paperwork',
      'Bring a valid photo ID and insurance card',
      'Bring any relevant medical records or imaging',
      'Wear comfortable clothing that allows easy movement',
    ];
  }

  if (typeNormalized.includes('x-ray') || typeNormalized.includes('imaging')) {
    return [
      'Remove any jewelry or metal objects before your appointment',
      'Wear loose, comfortable clothing without metal fasteners',
      'Inform us if there is any possibility of pregnancy',
    ];
  }

  if (typeNormalized.includes('adjustment') || typeNormalized.includes('treatment')) {
    return [
      'Wear comfortable, loose-fitting clothing',
      'Stay hydrated before your appointment',
      'Avoid eating a heavy meal 1 hour before',
    ];
  }

  if (typeNormalized.includes('exam') || typeNormalized.includes('evaluation')) {
    return [
      'Wear clothing that allows easy movement and examination',
      'Note any new symptoms or changes since your last visit',
      'Bring a list of current medications if changed',
    ];
  }

  if (typeNormalized.includes('follow') || typeNormalized.includes('recheck')) {
    return [
      'Be prepared to discuss your progress since the last visit',
      'Note any changes in symptoms or new concerns',
    ];
  }

  // Default instructions
  return [
    'Please arrive 5-10 minutes before your scheduled time',
    'Bring your insurance card if coverage has changed',
  ];
}

export const aiCareRouter = router({
  // Monitor treatment plan progress and compliance
  monitorPlan: protectedProcedure
    .input(
      z.object({
        treatmentPlanId: z.string().optional(),
        patientId: z.string().optional(),
        providerId: z.string().optional(),
        includeCompleted: z.boolean().default(false),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { treatmentPlanId, patientId, providerId, includeCompleted, limit } = input;

      // Build where clause
      const where: Prisma.TreatmentPlanWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (treatmentPlanId) where.id = treatmentPlanId;
      if (patientId) where.patientId = patientId;
      if (providerId) where.providerId = providerId;
      if (!includeCompleted) {
        where.status = { in: ['DRAFT', 'ACTIVE'] };
      }

      // Get treatment plans with related data
      const plans = await ctx.prisma.treatmentPlan.findMany({
        where,
        take: limit,
        orderBy: { startDate: 'desc' },
        include: {
          patient: {
            include: {
              demographics: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          goals: true,
          encounters: {
            orderBy: { encounterDate: 'desc' },
            select: {
              id: true,
              encounterDate: true,
              status: true,
            },
          },
        },
      });

      // Get missed appointments for patients in the last 90 days
      const patientIds = [...new Set(plans.map(p => p.patientId))];
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const missedAppointments = await ctx.prisma.appointment.groupBy({
        by: ['patientId'],
        where: {
          patientId: { in: patientIds },
          organizationId: ctx.user.organizationId,
          status: 'NO_SHOW',
          startTime: { gte: ninetyDaysAgo },
        },
        _count: true,
      });

      const missedMap = new Map(missedAppointments.map(m => [m.patientId, m._count]));

      // Process each plan
      const complianceData: TreatmentPlanComplianceData[] = plans.map(plan => {
        const patientName = getPatientName(plan.patient);

        const now = new Date();
        const startDate = new Date(plan.startDate);
        const daysInPlan = Math.max(1, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

        // Calculate expected visits based on frequency
        let expectedVisits = 0;
        if (plan.frequency) {
          const freq = plan.frequency.toLowerCase();
          if (freq.includes('3x') || freq.includes('3 times')) {
            expectedVisits = Math.floor(daysInPlan / 7) * 3;
          } else if (freq.includes('2x') || freq.includes('2 times') || freq.includes('twice')) {
            expectedVisits = Math.floor(daysInPlan / 7) * 2;
          } else if (freq.includes('1x') || freq.includes('weekly') || freq.includes('once')) {
            expectedVisits = Math.floor(daysInPlan / 7);
          } else if (freq.includes('daily')) {
            expectedVisits = daysInPlan;
          }
        } else if (plan.plannedVisits && plan.endDate) {
          const totalDays = Math.max(1, Math.floor((plan.endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
          expectedVisits = Math.floor((daysInPlan / totalDays) * plan.plannedVisits);
        }

        expectedVisits = Math.max(expectedVisits, 1);
        const complianceRate = Math.min(100, Math.round((plan.completedVisits / expectedVisits) * 100));
        const visitDeficit = Math.max(0, expectedVisits - plan.completedVisits);
        const isOnTrack = complianceRate >= 80;

        const completedEncounters = plan.encounters.filter(e =>
          ['SIGNED', 'COMPLETED', 'AMENDED'].includes(e.status)
        );
        const lastVisitDate = completedEncounters[0]?.encounterDate || null;
        const daysSinceLastVisit = lastVisitDate
          ? Math.floor((now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const missedCount = missedMap.get(plan.patientId) || 0;
        const riskLevel = calculateRiskLevel(complianceRate, daysSinceLastVisit, missedCount);

        // Generate alerts
        const alerts: string[] = [];
        if (visitDeficit >= 3) {
          alerts.push(`${visitDeficit} visits behind schedule`);
        }
        if (daysSinceLastVisit !== null && daysSinceLastVisit > 14) {
          alerts.push(`No visit in ${daysSinceLastVisit} days`);
        }
        if (missedCount >= 2) {
          alerts.push(`${missedCount} missed appointments in last 90 days`);
        }
        if (plan.endDate && plan.endDate < now && plan.status === 'ACTIVE') {
          alerts.push('Treatment plan has exceeded end date');
        }
        if (complianceRate < 50) {
          alerts.push('Critical: Compliance rate below 50%');
        }

        return {
          patientId: plan.patientId,
          patientName,
          treatmentPlanId: plan.id,
          treatmentPlanName: plan.name,
          plannedVisits: plan.plannedVisits,
          completedVisits: plan.completedVisits,
          frequency: plan.frequency,
          startDate: plan.startDate,
          endDate: plan.endDate,
          status: plan.status,
          complianceRate,
          isOnTrack,
          daysInPlan,
          expectedVisits,
          visitDeficit,
          lastVisitDate,
          daysSinceLastVisit,
          riskLevel,
          alerts,
        };
      });

      // Log AI care monitoring action
      await auditLog('AI_CARE_MONITOR_PLAN', 'TreatmentPlan', {
        changes: {
          action: 'monitor_plans',
          plansAnalyzed: plans.length,
          atRiskCount: complianceData.filter(d => d.riskLevel === 'HIGH' || d.riskLevel === 'CRITICAL').length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        plans: complianceData,
        summary: {
          total: complianceData.length,
          onTrack: complianceData.filter(d => d.isOnTrack).length,
          atRisk: complianceData.filter(d => d.riskLevel === 'HIGH' || d.riskLevel === 'CRITICAL').length,
          averageCompliance: complianceData.length > 0
            ? Math.round(complianceData.reduce((sum, d) => sum + d.complianceRate, 0) / complianceData.length)
            : 0,
        },
      };
    }),

  // Track visit frequency compliance
  getVisitFrequencyCompliance: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        providerId: z.string().optional(),
        dateRange: z.object({
          start: z.coerce.date(),
          end: z.coerce.date(),
        }).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, providerId, dateRange } = input;

      const start = dateRange?.start || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const end = dateRange?.end || new Date();

      // Get active treatment plans
      const planWhere: Prisma.TreatmentPlanWhereInput = {
        organizationId: ctx.user.organizationId,
        status: 'ACTIVE',
      };
      if (patientId) planWhere.patientId = patientId;
      if (providerId) planWhere.providerId = providerId;

      const plans = await ctx.prisma.treatmentPlan.findMany({
        where: planWhere,
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      // Get appointments in date range
      const appointmentWhere: Prisma.AppointmentWhereInput = {
        organizationId: ctx.user.organizationId,
        startTime: { gte: start, lte: end },
        status: { in: ['COMPLETED', 'CHECKED_IN'] },
      };
      if (patientId) appointmentWhere.patientId = patientId;
      if (providerId) appointmentWhere.providerId = providerId;

      const appointments = await ctx.prisma.appointment.findMany({
        where: appointmentWhere,
        select: {
          patientId: true,
          startTime: true,
          status: true,
        },
        orderBy: { startTime: 'asc' },
      });

      // Group appointments by patient and week
      const patientVisits = new Map<string, Date[]>();
      for (const apt of appointments) {
        const visits = patientVisits.get(apt.patientId) || [];
        visits.push(apt.startTime);
        patientVisits.set(apt.patientId, visits);
      }

      // Calculate compliance for each plan
      const compliance = plans.map(plan => {
        const visits = patientVisits.get(plan.patientId) || [];
        const patientName = getPatientName(plan.patient);

        // Parse frequency
        let expectedPerWeek = 1;
        if (plan.frequency) {
          const freq = plan.frequency.toLowerCase();
          if (freq.includes('3x') || freq.includes('3 times')) expectedPerWeek = 3;
          else if (freq.includes('2x') || freq.includes('2 times') || freq.includes('twice')) expectedPerWeek = 2;
          else if (freq.includes('daily')) expectedPerWeek = 5;
        }

        // Calculate weeks in range
        const weeksInRange = Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const expectedVisits = weeksInRange * expectedPerWeek;
        const actualVisits = visits.length;
        const complianceRate = Math.min(100, Math.round((actualVisits / Math.max(1, expectedVisits)) * 100));

        // Calculate visit intervals
        const intervals: number[] = [];
        for (let i = 1; i < visits.length; i++) {
          const days = Math.floor((visits[i].getTime() - visits[i - 1].getTime()) / (1000 * 60 * 60 * 24));
          intervals.push(days);
        }
        const avgInterval = intervals.length > 0
          ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
          : null;

        return {
          patientId: plan.patientId,
          patientName,
          treatmentPlanId: plan.id,
          treatmentPlanName: plan.name,
          frequency: plan.frequency,
          expectedPerWeek,
          actualVisits,
          expectedVisits,
          complianceRate,
          averageIntervalDays: avgInterval,
          targetIntervalDays: Math.round(7 / expectedPerWeek),
          isCompliant: complianceRate >= 80,
        };
      });

      return {
        dateRange: { start, end },
        compliance,
        summary: {
          totalPatients: compliance.length,
          compliant: compliance.filter(c => c.isCompliant).length,
          nonCompliant: compliance.filter(c => !c.isCompliant).length,
          averageComplianceRate: compliance.length > 0
            ? Math.round(compliance.reduce((sum, c) => sum + c.complianceRate, 0) / compliance.length)
            : 0,
        },
      };
    }),

  // Get outcome measure trends
  getOutcomeTrends: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        assessmentType: z.string().optional(),
        dateRange: z.object({
          start: z.coerce.date(),
          end: z.coerce.date(),
        }).optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, assessmentType, dateRange, limit } = input;

      const start = dateRange?.start || new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const end = dateRange?.end || new Date();

      // Get outcome assessments in date range
      const where: Prisma.OutcomeAssessmentWhereInput = {
        organizationId: ctx.user.organizationId,
        administeredAt: { gte: start, lte: end },
        completedAt: { not: null },
      };
      if (patientId) {
        where.patientId = patientId;
      }
      if (assessmentType) {
        where.assessmentType = assessmentType as any;
      }

      const assessments = await ctx.prisma.outcomeAssessment.findMany({
        where,
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { administeredAt: 'asc' },
        take: limit * 10, // Get more to group by patient
      });

      // Group by patient and assessment type
      const patientAssessments = new Map<string, Map<string, Array<{
        date: Date;
        score: number;
        encounterId: string;
        patientName: string;
      }>>>();

      for (const assessment of assessments) {
        const pid = assessment.patientId;
        const atype = assessment.assessmentType;
        const patientName = getPatientName(assessment.patient);

        if (!patientAssessments.has(pid)) {
          patientAssessments.set(pid, new Map());
        }
        const patientMap = patientAssessments.get(pid)!;
        if (!patientMap.has(atype)) {
          patientMap.set(atype, []);
        }

        const score = assessment.percentScore
          ? Number(assessment.percentScore)
          : assessment.rawScore
            ? Number(assessment.rawScore)
            : 0;

        patientMap.get(atype)!.push({
          date: assessment.completedAt || assessment.administeredAt,
          score,
          encounterId: assessment.encounterId,
          patientName,
        });
      }

      // Calculate trends
      const trends: OutcomeTrend[] = [];
      for (const [pid, assessmentMap] of patientAssessments) {
        for (const [atype, dataPoints] of assessmentMap) {
          if (dataPoints.length < 1) continue;

          const sorted = [...dataPoints].sort((a, b) => a.date.getTime() - b.date.getTime());
          const trend = calculateTrend(sorted);
          const latestScore = sorted[sorted.length - 1].score;
          const baselineScore = sorted.length > 1 ? sorted[0].score : null;
          const changePercent = baselineScore !== null && baselineScore !== 0
            ? Math.round(((latestScore - baselineScore) / baselineScore) * 100)
            : 0;

          trends.push({
            patientId: pid,
            patientName: sorted[0].patientName,
            assessmentType: atype,
            dataPoints: sorted.map(d => ({
              date: d.date,
              score: d.score,
              encounterId: d.encounterId,
            })),
            trend,
            changePercent,
            latestScore,
            baselineScore,
            goalScore: null, // Would need treatment plan goals
          });
        }
      }

      // Limit results
      const limitedTrends = trends.slice(0, limit);

      return {
        trends: limitedTrends,
        summary: {
          total: limitedTrends.length,
          improving: limitedTrends.filter(t => t.trend === 'IMPROVING').length,
          stable: limitedTrends.filter(t => t.trend === 'STABLE').length,
          declining: limitedTrends.filter(t => t.trend === 'DECLINING').length,
        },
      };
    }),

  // Alert on missed appointments
  getMissedAppointmentAlerts: protectedProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        daysBack: z.number().min(1).max(90).default(30),
        minMissed: z.number().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, daysBack, minMissed } = input;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);

      // Get patients with missed appointments
      const where: Prisma.AppointmentWhereInput = {
        organizationId: ctx.user.organizationId,
        status: 'NO_SHOW',
        startTime: { gte: cutoffDate },
      };
      if (providerId) where.providerId = providerId;

      const missedAppointments = await ctx.prisma.appointment.findMany({
        where,
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
              contacts: {
                where: { isPrimary: true },
                select: { email: true, mobilePhone: true },
                take: 1,
              },
              treatmentPlans: {
                where: { status: 'ACTIVE' },
                take: 1,
              },
            },
          },
          provider: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          appointmentType: { select: { name: true } },
        },
        orderBy: { startTime: 'desc' },
      });

      // Group by patient
      const patientMissed = new Map<string, typeof missedAppointments>();
      for (const apt of missedAppointments) {
        const list = patientMissed.get(apt.patientId) || [];
        list.push(apt);
        patientMissed.set(apt.patientId, list);
      }

      // Filter by minimum missed count
      const alerts = Array.from(patientMissed.entries())
        .filter(([, apts]) => apts.length >= minMissed)
        .map(([patientId, apts]) => {
          const patient = apts[0].patient;
          const patientName = getPatientName(patient);
          const hasActivePlan = patient.treatmentPlans.length > 0;
          const primaryContact = patient.contacts[0];

          return {
            patientId,
            patientName,
            email: primaryContact?.email || null,
            phone: primaryContact?.mobilePhone || null,
            missedCount: apts.length,
            hasActiveTreatmentPlan: hasActivePlan,
            missedAppointments: apts.map(a => ({
              id: a.id,
              date: a.startTime,
              appointmentType: a.appointmentType?.name || 'Unknown',
              providerName: a.provider?.user
                ? `${a.provider.user.firstName} ${a.provider.user.lastName}`
                : 'Unknown',
            })),
            lastMissedDate: apts[0].startTime,
            urgency: apts.length >= 3 ? 'HIGH' : apts.length >= 2 ? 'MEDIUM' : 'LOW' as const,
            recommendedAction: apts.length >= 3
              ? 'Immediate phone call to patient'
              : apts.length >= 2
                ? 'Send personalized outreach email'
                : 'Schedule follow-up reminder',
          };
        })
        .sort((a, b) => b.missedCount - a.missedCount);

      return {
        alerts,
        summary: {
          totalPatientsWithMissed: alerts.length,
          totalMissedAppointments: missedAppointments.length,
          highUrgency: alerts.filter(a => a.urgency === 'HIGH').length,
          mediumUrgency: alerts.filter(a => a.urgency === 'MEDIUM').length,
          lowUrgency: alerts.filter(a => a.urgency === 'LOW').length,
          patientsWithActivePlans: alerts.filter(a => a.hasActiveTreatmentPlan).length,
        },
      };
    }),

  // Identify patients falling behind plan
  getPatientsBehindPlan: protectedProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        minDeficit: z.number().min(1).default(2),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, minDeficit, limit } = input;

      // Get active treatment plans
      const planWhere: Prisma.TreatmentPlanWhereInput = {
        organizationId: ctx.user.organizationId,
        status: 'ACTIVE',
      };
      if (providerId) planWhere.providerId = providerId;

      const plans = await ctx.prisma.treatmentPlan.findMany({
        where: planWhere,
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
              contacts: {
                where: { isPrimary: true },
                select: { email: true, mobilePhone: true },
                take: 1,
              },
            },
          },
          provider: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          encounters: {
            where: { status: { in: ['SIGNED', 'COMPLETED', 'AMENDED'] } },
            orderBy: { encounterDate: 'desc' },
            take: 1,
          },
        },
      });

      // Get missed appointments for these patients
      const patientIds = plans.map(p => p.patientId);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const missedCounts = await ctx.prisma.appointment.groupBy({
        by: ['patientId'],
        where: {
          patientId: { in: patientIds },
          organizationId: ctx.user.organizationId,
          status: 'NO_SHOW',
          startTime: { gte: thirtyDaysAgo },
        },
        _count: true,
      });
      const missedMap = new Map(missedCounts.map(m => [m.patientId, m._count]));

      // Calculate which patients are behind
      const behindPlan: AtRiskPatient[] = [];
      const now = new Date();

      for (const plan of plans) {
        const startDate = new Date(plan.startDate);
        const daysInPlan = Math.max(1, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

        // Calculate expected visits
        let expectedVisits = 0;
        if (plan.frequency) {
          const freq = plan.frequency.toLowerCase();
          if (freq.includes('3x') || freq.includes('3 times')) expectedVisits = Math.floor(daysInPlan / 7) * 3;
          else if (freq.includes('2x') || freq.includes('2 times') || freq.includes('twice')) expectedVisits = Math.floor(daysInPlan / 7) * 2;
          else if (freq.includes('1x') || freq.includes('weekly') || freq.includes('once')) expectedVisits = Math.floor(daysInPlan / 7);
          else if (freq.includes('daily')) expectedVisits = daysInPlan;
        } else if (plan.plannedVisits && plan.endDate) {
          const totalDays = Math.max(1, Math.floor((plan.endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
          expectedVisits = Math.floor((daysInPlan / totalDays) * plan.plannedVisits);
        }

        const deficit = expectedVisits - plan.completedVisits;
        if (deficit < minDeficit) continue;

        const patientName = getPatientName(plan.patient);

        const lastVisit = plan.encounters[0]?.encounterDate || null;
        const daysSinceLastVisit = lastVisit
          ? Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const missedAppointments = missedMap.get(plan.patientId) || 0;
        const complianceRate = Math.min(100, Math.round((plan.completedVisits / Math.max(1, expectedVisits)) * 100));

        // Calculate risk score (0-100)
        let riskScore = 0;
        riskScore += Math.min(40, deficit * 10); // Up to 40 points for deficit
        riskScore += Math.min(30, missedAppointments * 15); // Up to 30 points for missed
        if (daysSinceLastVisit !== null) {
          riskScore += Math.min(30, Math.floor(daysSinceLastVisit / 7) * 10); // Up to 30 for days since visit
        }

        // Build risk factors
        const riskFactors: string[] = [];
        if (deficit >= 3) riskFactors.push(`${deficit} visits behind schedule`);
        else if (deficit >= 2) riskFactors.push(`${deficit} visits behind schedule`);
        if (missedAppointments >= 2) riskFactors.push(`${missedAppointments} no-shows in 30 days`);
        if (daysSinceLastVisit !== null && daysSinceLastVisit > 14) {
          riskFactors.push(`${daysSinceLastVisit} days since last visit`);
        }
        if (complianceRate < 50) riskFactors.push(`Only ${complianceRate}% compliance rate`);

        // Recommended actions
        const recommendedActions: string[] = [];
        if (riskScore >= 70) {
          recommendedActions.push('Schedule immediate phone call with patient');
          recommendedActions.push('Review treatment plan with provider');
        } else if (riskScore >= 50) {
          recommendedActions.push('Send personalized care gap notification');
          recommendedActions.push('Offer flexible scheduling options');
        } else {
          recommendedActions.push('Send friendly reminder to schedule');
        }

        behindPlan.push({
          patientId: plan.patientId,
          patientName,
          riskScore,
          riskFactors,
          treatmentPlanId: plan.id,
          treatmentPlanName: plan.name,
          lastVisitDate: lastVisit,
          daysSinceLastVisit,
          missedAppointments,
          complianceRate,
          recommendedActions,
        });
      }

      // Sort by risk score
      behindPlan.sort((a, b) => b.riskScore - a.riskScore);

      return {
        patients: behindPlan.slice(0, limit),
        summary: {
          totalBehind: behindPlan.length,
          highRisk: behindPlan.filter(p => p.riskScore >= 70).length,
          mediumRisk: behindPlan.filter(p => p.riskScore >= 50 && p.riskScore < 70).length,
          lowRisk: behindPlan.filter(p => p.riskScore < 50).length,
        },
      };
    }),

  // Get progress milestone tracking
  getMilestoneProgress: protectedProcedure
    .input(
      z.object({
        treatmentPlanId: z.string().optional(),
        patientId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { treatmentPlanId, patientId, limit } = input;

      const where: Prisma.TreatmentPlanWhereInput = {
        organizationId: ctx.user.organizationId,
        status: { in: ['ACTIVE', 'DRAFT'] },
      };
      if (treatmentPlanId) where.id = treatmentPlanId;
      if (patientId) where.patientId = patientId;

      const plans = await ctx.prisma.treatmentPlan.findMany({
        where,
        take: limit,
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
          goals: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      const milestoneProgress: MilestoneProgress[] = plans.map(plan => {
        const patientName = getPatientName(plan.patient);

        // Convert goals to milestones
        const milestones = plan.goals.map(goal => ({
          name: goal.description,
          targetDate: goal.targetDate,
          status: goal.status as 'NOT_STARTED' | 'IN_PROGRESS' | 'ACHIEVED' | 'MISSED',
          achievedDate: goal.achievedAt,
          progress: goal.progress,
        }));

        // Calculate overall progress
        const overallProgress = milestones.length > 0
          ? Math.round(milestones.reduce((sum, m) => sum + m.progress, 0) / milestones.length)
          : 0;

        // Find next milestone
        const pendingMilestones = milestones
          .filter(m => m.status === 'NOT_STARTED' || m.status === 'IN_PROGRESS')
          .sort((a, b) => {
            if (!a.targetDate) return 1;
            if (!b.targetDate) return -1;
            return a.targetDate.getTime() - b.targetDate.getTime();
          });

        return {
          treatmentPlanId: plan.id,
          patientId: plan.patientId,
          patientName,
          milestones,
          overallProgress,
          nextMilestone: pendingMilestones[0]?.name || null,
          nextMilestoneDate: pendingMilestones[0]?.targetDate || null,
        };
      });

      return {
        progress: milestoneProgress,
        summary: {
          totalPlans: milestoneProgress.length,
          averageProgress: milestoneProgress.length > 0
            ? Math.round(milestoneProgress.reduce((sum, p) => sum + p.overallProgress, 0) / milestoneProgress.length)
            : 0,
          plansWithAllMilestonesComplete: milestoneProgress.filter(p => p.overallProgress === 100).length,
        },
      };
    }),

  // Auto-adjust outreach based on adherence
  getOutreachRecommendations: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        providerId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, providerId, limit } = input;

      // Get active treatment plans with compliance data
      const planWhere: Prisma.TreatmentPlanWhereInput = {
        organizationId: ctx.user.organizationId,
        status: 'ACTIVE',
      };
      if (patientId) planWhere.patientId = patientId;
      if (providerId) planWhere.providerId = providerId;

      const plans = await ctx.prisma.treatmentPlan.findMany({
        where: planWhere,
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
              contacts: {
                where: { isPrimary: true },
                select: { email: true, mobilePhone: true },
                take: 1,
              },
              careOutreach: {
                orderBy: { createdAt: 'desc' },
                take: 5,
              },
            },
          },
          encounters: {
            where: { status: { in: ['SIGNED', 'COMPLETED', 'AMENDED'] } },
            orderBy: { encounterDate: 'desc' },
            take: 1,
          },
        },
        take: limit,
      });

      // Get missed appointments
      const patientIds = plans.map(p => p.patientId);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const missedCounts = await ctx.prisma.appointment.groupBy({
        by: ['patientId'],
        where: {
          patientId: { in: patientIds },
          organizationId: ctx.user.organizationId,
          status: 'NO_SHOW',
          startTime: { gte: thirtyDaysAgo },
        },
        _count: true,
      });
      const missedMap = new Map(missedCounts.map(m => [m.patientId, m._count]));

      const now = new Date();
      const recommendations = plans.map(plan => {
        const patientName = getPatientName(plan.patient);

        const lastVisit = plan.encounters[0]?.encounterDate || null;
        const daysSinceLastVisit = lastVisit
          ? Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const startDate = new Date(plan.startDate);
        const daysInPlan = Math.max(1, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

        // Calculate expected visits
        let expectedVisits = Math.max(1, Math.floor(daysInPlan / 7));
        if (plan.frequency) {
          const freq = plan.frequency.toLowerCase();
          if (freq.includes('3x')) expectedVisits = Math.floor(daysInPlan / 7) * 3;
          else if (freq.includes('2x') || freq.includes('twice')) expectedVisits = Math.floor(daysInPlan / 7) * 2;
        }

        const complianceRate = Math.min(100, Math.round((plan.completedVisits / expectedVisits) * 100));
        const missedAppointments = missedMap.get(plan.patientId) || 0;

        // Check recent outreach
        const recentOutreach = plan.patient.careOutreach;
        const lastOutreachDate = recentOutreach[0]?.createdAt || null;
        const daysSinceOutreach = lastOutreachDate
          ? Math.floor((now.getTime() - lastOutreachDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        // Determine recommended outreach
        let outreachType: CareOutreachType = 'FOLLOWUP_SCHEDULING';
        let channel = 'email';
        let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' = 'LOW';
        let message = '';
        let delay = 0; // Days to wait before sending

        if (complianceRate < 50 || missedAppointments >= 2) {
          outreachType = 'CARE_GAP_NOTIFICATION';
          channel = 'phone';
          priority = 'URGENT';
          message = 'Personal phone call to discuss barriers to care and reschedule appointments';
          delay = 0;
        } else if (complianceRate < 70 || (daysSinceLastVisit !== null && daysSinceLastVisit > 14)) {
          outreachType = 'CARE_GAP_NOTIFICATION';
          channel = 'sms';
          priority = 'HIGH';
          message = 'SMS reminder with easy booking link and personalized message';
          delay = 1;
        } else if (daysSinceLastVisit !== null && daysSinceLastVisit > 7) {
          outreachType = 'FOLLOWUP_SCHEDULING';
          channel = 'email';
          priority = 'MEDIUM';
          message = 'Email reminder to schedule next visit with available times';
          delay = 2;
        } else {
          outreachType = 'TREATMENT_PROGRESS';
          channel = 'portal';
          priority = 'LOW';
          message = 'Portal notification with progress update and encouragement';
          delay = 7;
        }

        // Skip if outreach was sent recently
        const shouldSend = daysSinceOutreach === null || daysSinceOutreach >= 3;

        return {
          patientId: plan.patientId,
          patientName,
          treatmentPlanId: plan.id,
          treatmentPlanName: plan.name,
          complianceRate,
          daysSinceLastVisit,
          missedAppointments,
          lastOutreachDate,
          recommendation: {
            type: outreachType,
            channel,
            priority,
            message,
            scheduledDelay: delay,
            shouldSend,
            skipReason: !shouldSend ? `Recent outreach sent ${daysSinceOutreach} days ago` : null,
          },
        };
      });

      // Sort by priority
      const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      recommendations.sort((a, b) =>
        priorityOrder[a.recommendation.priority] - priorityOrder[b.recommendation.priority]
      );

      return {
        recommendations,
        summary: {
          total: recommendations.length,
          urgent: recommendations.filter(r => r.recommendation.priority === 'URGENT').length,
          high: recommendations.filter(r => r.recommendation.priority === 'HIGH').length,
          medium: recommendations.filter(r => r.recommendation.priority === 'MEDIUM').length,
          low: recommendations.filter(r => r.recommendation.priority === 'LOW').length,
          readyToSend: recommendations.filter(r => r.recommendation.shouldSend).length,
        },
      };
    }),

  // Provider notifications for at-risk patients
  getAtRiskPatientNotifications: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        riskThreshold: z.enum(['ALL', 'HIGH', 'CRITICAL']).default('HIGH'),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, riskThreshold } = input;

      // Get the monitorPlan data internally
      const planWhere: Prisma.TreatmentPlanWhereInput = {
        organizationId: ctx.user.organizationId,
        status: 'ACTIVE',
      };
      if (providerId) planWhere.providerId = providerId;

      const plans = await ctx.prisma.treatmentPlan.findMany({
        where: planWhere,
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
              contacts: {
                where: { isPrimary: true },
                select: { email: true, mobilePhone: true },
                take: 1,
              },
            },
          },
          provider: {
            include: {
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
          encounters: {
            where: { status: { in: ['SIGNED', 'COMPLETED', 'AMENDED'] } },
            orderBy: { encounterDate: 'desc' },
            take: 1,
          },
        },
      });

      // Get missed appointments
      const patientIds = plans.map(p => p.patientId);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const missedCounts = await ctx.prisma.appointment.groupBy({
        by: ['patientId'],
        where: {
          patientId: { in: patientIds },
          organizationId: ctx.user.organizationId,
          status: 'NO_SHOW',
          startTime: { gte: ninetyDaysAgo },
        },
        _count: true,
      });
      const missedMap = new Map(missedCounts.map(m => [m.patientId, m._count]));

      const now = new Date();
      const notifications = plans.map(plan => {
        const patientName = getPatientName(plan.patient);
        const providerName = plan.provider?.user
          ? `${plan.provider.user.firstName} ${plan.provider.user.lastName}`
          : 'Unknown';

        const lastVisit = plan.encounters[0]?.encounterDate || null;
        const daysSinceLastVisit = lastVisit
          ? Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const startDate = new Date(plan.startDate);
        const daysInPlan = Math.max(1, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

        let expectedVisits = Math.max(1, Math.floor(daysInPlan / 7));
        if (plan.frequency) {
          const freq = plan.frequency.toLowerCase();
          if (freq.includes('3x')) expectedVisits = Math.floor(daysInPlan / 7) * 3;
          else if (freq.includes('2x') || freq.includes('twice')) expectedVisits = Math.floor(daysInPlan / 7) * 2;
        }

        const complianceRate = Math.min(100, Math.round((plan.completedVisits / expectedVisits) * 100));
        const missedAppointments = missedMap.get(plan.patientId) || 0;
        const riskLevel = calculateRiskLevel(complianceRate, daysSinceLastVisit, missedAppointments);

        // Build notification
        const alerts: string[] = [];
        if (complianceRate < 50) alerts.push(`Critically low compliance: ${complianceRate}%`);
        if (missedAppointments >= 2) alerts.push(`${missedAppointments} missed appointments`);
        if (daysSinceLastVisit !== null && daysSinceLastVisit > 21) {
          alerts.push(`No visit in ${daysSinceLastVisit} days`);
        }

        return {
          patientId: plan.patientId,
          patientName,
          providerId: plan.providerId,
          providerName,
          providerEmail: plan.provider?.user?.email || null,
          treatmentPlanId: plan.id,
          treatmentPlanName: plan.name,
          riskLevel,
          complianceRate,
          daysSinceLastVisit,
          missedAppointments,
          alerts,
          suggestedAction: riskLevel === 'CRITICAL'
            ? 'Review patient immediately and consider care plan adjustment'
            : riskLevel === 'HIGH'
              ? 'Contact patient to discuss treatment adherence'
              : 'Monitor and send engagement reminder',
        };
      });

      // Filter by risk threshold
      const filteredNotifications = notifications.filter(n => {
        if (riskThreshold === 'ALL') return true;
        if (riskThreshold === 'HIGH') return n.riskLevel === 'HIGH' || n.riskLevel === 'CRITICAL';
        if (riskThreshold === 'CRITICAL') return n.riskLevel === 'CRITICAL';
        return true;
      });

      // Sort by risk level
      const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      filteredNotifications.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

      // Log notification generation
      await auditLog('AI_CARE_RISK_NOTIFICATION', 'Patient', {
        changes: {
          action: 'generate_risk_notifications',
          totalNotifications: filteredNotifications.length,
          criticalCount: filteredNotifications.filter(n => n.riskLevel === 'CRITICAL').length,
          highCount: filteredNotifications.filter(n => n.riskLevel === 'HIGH').length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        notifications: filteredNotifications,
        summary: {
          total: filteredNotifications.length,
          critical: filteredNotifications.filter(n => n.riskLevel === 'CRITICAL').length,
          high: filteredNotifications.filter(n => n.riskLevel === 'HIGH').length,
          medium: filteredNotifications.filter(n => n.riskLevel === 'MEDIUM').length,
          low: filteredNotifications.filter(n => n.riskLevel === 'LOW').length,
        },
      };
    }),

  // ==================== US-325: Intelligent Appointment Reminders ====================

  // Send smart reminders - Main endpoint for sending intelligent reminders
  sendReminders: protectedProcedure
    .input(
      z.object({
        appointmentIds: z.array(z.string()).optional(),
        patientId: z.string().optional(),
        providerId: z.string().optional(),
        dateRange: z.object({
          start: z.coerce.date(),
          end: z.coerce.date(),
        }).optional(),
        reminderSequence: z.number().min(1).max(3).default(1),
        channels: z.array(z.enum(['sms', 'email', 'phone', 'portal'])).optional(),
        dryRun: z.boolean().default(false), // Preview without sending
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { appointmentIds, patientId, providerId, dateRange, reminderSequence, channels, dryRun } = input;

      const now = new Date();
      const defaultStart = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
      const defaultEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours from now

      // Build appointment query
      const appointmentWhere: Prisma.AppointmentWhereInput = {
        organizationId: ctx.user.organizationId,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startTime: {
          gte: dateRange?.start || defaultStart,
          lte: dateRange?.end || defaultEnd,
        },
      };

      if (appointmentIds?.length) {
        appointmentWhere.id = { in: appointmentIds };
      }
      if (patientId) appointmentWhere.patientId = patientId;
      if (providerId) appointmentWhere.providerId = providerId;

      // Get appointments with patient and provider details
      const appointments = await ctx.prisma.appointment.findMany({
        where: appointmentWhere,
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
              contacts: {
                where: { isPrimary: true },
                take: 1,
              },
              communicationPreference: true,
              treatmentPlans: {
                where: { status: 'ACTIVE' },
                take: 1,
              },
              careOutreach: {
                where: {
                  type: 'APPOINTMENT_REMINDER',
                  createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
                },
                orderBy: { createdAt: 'desc' },
              },
            },
          },
          provider: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          appointmentType: true,
        },
        orderBy: { startTime: 'asc' },
      });

      if (appointments.length === 0) {
        return {
          reminders: [],
          summary: {
            total: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
          },
        };
      }

      // Get historical data for no-show risk calculation
      const patientIds = [...new Set(appointments.map(a => a.patientId))];
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Get appointment history
      const appointmentHistory = await ctx.prisma.appointment.groupBy({
        by: ['patientId', 'status'],
        where: {
          patientId: { in: patientIds },
          organizationId: ctx.user.organizationId,
          startTime: { gte: ninetyDaysAgo, lt: now },
        },
        _count: true,
      });

      // Build patient stats map
      const patientStats = new Map<string, {
        totalAppointments: number;
        missedAppointments: number;
        completedAppointments: number;
      }>();

      for (const hist of appointmentHistory) {
        const stats = patientStats.get(hist.patientId) || {
          totalAppointments: 0,
          missedAppointments: 0,
          completedAppointments: 0,
        };

        stats.totalAppointments += hist._count;
        if (hist.status === 'NO_SHOW') {
          stats.missedAppointments += hist._count;
        } else if (hist.status === 'COMPLETED' || hist.status === 'CHECKED_IN') {
          stats.completedAppointments += hist._count;
        }

        patientStats.set(hist.patientId, stats);
      }

      // Get last visit dates
      const lastVisits = await ctx.prisma.encounter.groupBy({
        by: ['patientId'],
        where: {
          patientId: { in: patientIds },
          organizationId: ctx.user.organizationId,
          status: { in: ['SIGNED', 'COMPLETED', 'AMENDED'] },
        },
        _max: { encounterDate: true },
      });

      const lastVisitMap = new Map(lastVisits.map(v => [v.patientId, v._max.encounterDate]));

      // Process each appointment
      const reminders: PersonalizedReminder[] = [];
      const results: Array<{
        appointmentId: string;
        patientId: string;
        status: 'sent' | 'skipped' | 'failed';
        reason?: string;
        outreachId?: string;
      }> = [];

      for (const appointment of appointments) {
        const patient = appointment.patient;
        const patientName = getPatientName(patient);
        const providerName = appointment.provider?.user
          ? `${appointment.provider.title || 'Dr.'} ${appointment.provider.user.firstName} ${appointment.provider.user.lastName}`.trim()
          : 'your provider';

        // Check if patient has opted out of reminders
        const prefs = patient.communicationPreference;
        if (prefs?.optOutReminders) {
          results.push({
            appointmentId: appointment.id,
            patientId: patient.id,
            status: 'skipped',
            reason: 'Patient opted out of reminders',
          });
          continue;
        }

        // Check if reminder was already sent for this sequence
        const existingReminder = patient.careOutreach.find(
          o => o.appointmentId === appointment.id && o.reminderSequence === reminderSequence
        );
        if (existingReminder) {
          results.push({
            appointmentId: appointment.id,
            patientId: patient.id,
            status: 'skipped',
            reason: `Reminder sequence ${reminderSequence} already sent`,
          });
          continue;
        }

        // Get patient contact info
        const contact = patient.contacts[0];
        if (!contact) {
          results.push({
            appointmentId: appointment.id,
            patientId: patient.id,
            status: 'skipped',
            reason: 'No contact information available',
          });
          continue;
        }

        // Calculate no-show risk
        const stats = patientStats.get(patient.id) || {
          totalAppointments: 0,
          missedAppointments: 0,
          completedAppointments: 0,
        };
        const lastVisitDate = lastVisitMap.get(patient.id);
        const daysSinceLastVisit = lastVisitDate
          ? Math.floor((now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const hasActiveTreatmentPlan = patient.treatmentPlans.length > 0;

        // Count reminder responses
        const totalReminders = patient.careOutreach.length;
        const reminderResponses = patient.careOutreach.filter(o => o.respondedAt).length;

        const noShowRisk = calculateNoShowRisk(
          stats.missedAppointments,
          stats.totalAppointments,
          daysSinceLastVisit,
          hasActiveTreatmentPlan,
          reminderResponses,
          totalReminders
        );

        // Determine optimal timing
        const timing = calculateOptimalTiming(
          appointment.startTime,
          prefs?.preferredTimeStart || null,
          prefs?.timezone || null,
          reminderSequence,
          noShowRisk
        );

        // Determine channel (respect patient preferences and provided channels)
        let channel: 'sms' | 'email' | 'phone' | 'portal' = 'sms';
        const preferredChannel = prefs?.preferredChannel?.toLowerCase();

        if (channels?.length) {
          // Use first available channel from provided list
          if (channels.includes('sms') && contact.mobilePhone && prefs?.allowSms !== false) {
            channel = 'sms';
          } else if (channels.includes('email') && contact.email && prefs?.allowEmail !== false) {
            channel = 'email';
          } else if (channels.includes('portal') && prefs?.allowPortal !== false) {
            channel = 'portal';
          } else if (channels.includes('phone')) {
            channel = 'phone';
          }
        } else if (preferredChannel === 'sms' && contact.mobilePhone) {
          channel = 'sms';
        } else if (preferredChannel === 'email' && contact.email) {
          channel = 'email';
        } else if (contact.mobilePhone && prefs?.allowSms !== false) {
          channel = 'sms';
        } else if (contact.email && prefs?.allowEmail !== false) {
          channel = 'email';
        }

        // Get preparation instructions
        const preparationInstructions = getPreparationInstructions(
          appointment.appointmentType?.name || 'Appointment'
        );

        // Generate personalized message
        const { message, subject } = generatePersonalizedMessage(
          patient.demographics?.firstName || 'Patient',
          appointment.appointmentType?.name || 'Appointment',
          appointment.startTime,
          providerName,
          channel,
          preparationInstructions,
          noShowRisk
        );

        const reminder: PersonalizedReminder = {
          appointmentId: appointment.id,
          patientId: patient.id,
          patientName,
          appointmentDate: appointment.startTime,
          appointmentTime: appointment.startTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          }),
          appointmentType: appointment.appointmentType?.name || 'Appointment',
          providerName,
          channel,
          message,
          subject,
          preparationInstructions,
          timing,
          noShowRisk,
          reminderSequence,
        };

        reminders.push(reminder);

        // Create CareOutreach record (send if not dry run)
        if (!dryRun) {
          try {
            const outreach = await ctx.prisma.careOutreach.create({
              data: {
                type: 'APPOINTMENT_REMINDER',
                status: 'SENT',
                channel,
                subject,
                content: message,
                scheduledAt: now,
                sentAt: now,
                appointmentId: appointment.id,
                reminderSequence,
                includeInstructions: preparationInstructions.length > 0,
                personalizationData: {
                  noShowRisk: noShowRisk.riskScore,
                  timing: timing.hoursBeforeAppointment,
                  preparationInstructions,
                } as Prisma.InputJsonValue,
                optimalTimeUsed: timing.isOptimal,
                noShowRiskLevel: noShowRisk.riskScore,
                patientId: patient.id,
                organizationId: ctx.user.organizationId,
              },
            });

            results.push({
              appointmentId: appointment.id,
              patientId: patient.id,
              status: 'sent',
              outreachId: outreach.id,
            });
          } catch (error) {
            results.push({
              appointmentId: appointment.id,
              patientId: patient.id,
              status: 'failed',
              reason: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        } else {
          results.push({
            appointmentId: appointment.id,
            patientId: patient.id,
            status: 'sent',
            reason: 'Dry run - not actually sent',
          });
        }
      }

      // Log the action
      await auditLog('AI_CARE_OUTREACH_RECOMMEND', 'CareOutreach', {
        changes: {
          action: 'send_reminders',
          reminderSequence,
          dryRun,
          totalAppointments: appointments.length,
          remindersSent: results.filter(r => r.status === 'sent').length,
          remindersSkipped: results.filter(r => r.status === 'skipped').length,
          remindersFailed: results.filter(r => r.status === 'failed').length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        reminders,
        results,
        summary: {
          total: appointments.length,
          sent: results.filter(r => r.status === 'sent').length,
          skipped: results.filter(r => r.status === 'skipped').length,
          failed: results.filter(r => r.status === 'failed').length,
          byNoShowRisk: {
            veryHigh: reminders.filter(r => r.noShowRisk.riskLevel === 'VERY_HIGH').length,
            high: reminders.filter(r => r.noShowRisk.riskLevel === 'HIGH').length,
            medium: reminders.filter(r => r.noShowRisk.riskLevel === 'MEDIUM').length,
            low: reminders.filter(r => r.noShowRisk.riskLevel === 'LOW').length,
          },
          byChannel: {
            sms: reminders.filter(r => r.channel === 'sms').length,
            email: reminders.filter(r => r.channel === 'email').length,
            phone: reminders.filter(r => r.channel === 'phone').length,
            portal: reminders.filter(r => r.channel === 'portal').length,
          },
        },
      };
    }),

  // Handle confirmation responses from patients
  handleReminderResponse: protectedProcedure
    .input(
      z.object({
        outreachId: z.string(),
        responseType: z.enum(['CONFIRMED', 'RESCHEDULE_REQUESTED', 'CANCEL_REQUESTED', 'OTHER']),
        responseText: z.string().optional(),
        responseChannel: z.string().default('sms'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { outreachId, responseType, responseText, responseChannel } = input;

      // Get the outreach record
      const outreach = await ctx.prisma.careOutreach.findFirst({
        where: {
          id: outreachId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!outreach) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Outreach record not found',
        });
      }

      // Update outreach with response
      const updatedOutreach = await ctx.prisma.careOutreach.update({
        where: { id: outreachId },
        data: {
          respondedAt: new Date(),
          response: responseText,
          responseChannel,
          outcome: responseType,
          status: 'RESPONDED' as CareOutreachStatus,
        },
      });

      // Handle based on response type
      let actionTaken: string | undefined;
      let newAppointmentId: string | undefined;

      if (outreach.appointmentId) {
        if (responseType === 'CONFIRMED') {
          // Update appointment status to confirmed
          await ctx.prisma.appointment.update({
            where: { id: outreach.appointmentId },
            data: { status: 'CONFIRMED' },
          });
          actionTaken = 'Appointment confirmed';
        } else if (responseType === 'CANCEL_REQUESTED') {
          // Mark appointment as cancelled
          await ctx.prisma.appointment.update({
            where: { id: outreach.appointmentId },
            data: { status: 'CANCELLED' },
          });
          actionTaken = 'Appointment cancelled per patient request';
        } else if (responseType === 'RESCHEDULE_REQUESTED') {
          // Don't auto-cancel, but flag for staff follow-up
          actionTaken = 'Reschedule requested - staff follow-up needed';

          // Create a care coordinator action for follow-up
          await ctx.prisma.careCoordinatorAction.create({
            data: {
              actionType: 'APPOINTMENT_SCHEDULED',
              title: `Reschedule requested for ${getPatientName(outreach.patient)}`,
              description: `Patient responded to reminder requesting to reschedule. Original appointment: ${outreach.appointmentId}. ${responseText ? `Patient message: ${responseText}` : ''}`,
              result: 'pending',
              patientId: outreach.patientId,
              organizationId: ctx.user.organizationId,
            },
          });
        }
      }

      // Update outreach with action taken
      await ctx.prisma.careOutreach.update({
        where: { id: outreachId },
        data: {
          convertedAction: actionTaken,
        },
      });

      const response: ReminderResponse = {
        outreachId,
        appointmentId: outreach.appointmentId || '',
        responseType,
        responseText,
        responseChannel,
        processedAt: new Date(),
        actionTaken,
        newAppointmentId,
      };

      return response;
    }),

  // Auto-reschedule from patient replies
  processRescheduleRequest: protectedProcedure
    .input(
      z.object({
        outreachId: z.string(),
        preferredDates: z.array(z.coerce.date()).optional(),
        preferredTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { outreachId, preferredDates, preferredTimeOfDay, notes } = input;

      // Get the outreach and original appointment
      const outreach = await ctx.prisma.careOutreach.findFirst({
        where: {
          id: outreachId,
          organizationId: ctx.user.organizationId,
          outcome: 'RESCHEDULE_REQUESTED',
        },
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!outreach) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Outreach record not found or not a reschedule request',
        });
      }

      if (!outreach.appointmentId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No appointment associated with this outreach',
        });
      }

      // Get the original appointment
      const originalAppointment = await ctx.prisma.appointment.findFirst({
        where: {
          id: outreach.appointmentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          appointmentType: true,
          provider: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!originalAppointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Original appointment not found',
        });
      }

      // Find available slots based on preferences
      const searchStart = preferredDates?.[0] || new Date();
      const searchEnd = new Date(searchStart.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks

      // Get provider's existing appointments to find gaps
      const existingAppointments = await ctx.prisma.appointment.findMany({
        where: {
          providerId: originalAppointment.providerId,
          organizationId: ctx.user.organizationId,
          startTime: { gte: searchStart, lte: searchEnd },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
        orderBy: { startTime: 'asc' },
      });

      // Find available slots (simplified - in production would check provider schedule)
      const availableSlots: Date[] = [];
      // Calculate duration from start/end time, or use appointment type default
      const originalDuration = originalAppointment.endTime && originalAppointment.startTime
        ? Math.round((originalAppointment.endTime.getTime() - originalAppointment.startTime.getTime()) / (1000 * 60))
        : 30;
      const duration = originalAppointment.appointmentType?.duration || originalDuration;

      // Generate potential slots
      const currentDate = new Date(searchStart);
      currentDate.setHours(9, 0, 0, 0); // Start at 9 AM

      while (currentDate < searchEnd && availableSlots.length < 5) {
        // Skip weekends
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          // Check time of day preference
          const hour = currentDate.getHours();
          let isPreferredTime = true;

          if (preferredTimeOfDay === 'morning' && (hour < 9 || hour >= 12)) {
            isPreferredTime = false;
          } else if (preferredTimeOfDay === 'afternoon' && (hour < 12 || hour >= 17)) {
            isPreferredTime = false;
          } else if (preferredTimeOfDay === 'evening' && hour < 17) {
            isPreferredTime = false;
          }

          if (isPreferredTime) {
            // Check if slot conflicts with existing appointments
            const slotEnd = new Date(currentDate.getTime() + duration * 60 * 1000);
            const hasConflict = existingAppointments.some(apt => {
              // Calculate appointment duration from start/end times
              const aptDuration = apt.endTime && apt.startTime
                ? Math.round((apt.endTime.getTime() - apt.startTime.getTime()) / (1000 * 60))
                : 30;
              const aptEnd = new Date(apt.startTime.getTime() + aptDuration * 60 * 1000);
              return (currentDate < aptEnd && slotEnd > apt.startTime);
            });

            if (!hasConflict) {
              availableSlots.push(new Date(currentDate));
            }
          }
        }

        // Move to next slot
        currentDate.setMinutes(currentDate.getMinutes() + 30);
        if (currentDate.getHours() >= 18) {
          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
          currentDate.setHours(9, 0, 0, 0);
        }
      }

      // Create a care coordinator action to offer these slots
      const action = await ctx.prisma.careCoordinatorAction.create({
        data: {
          actionType: 'APPOINTMENT_SCHEDULED',
          title: `Reschedule options for ${getPatientName(outreach.patient)}`,
          description: `Found ${availableSlots.length} available slots. Patient notes: ${notes || 'None'}`,
          result: 'pending',
          resultData: {
            originalAppointmentId: originalAppointment.id,
            availableSlots: availableSlots.map(s => s.toISOString()),
            preferredTimeOfDay,
            patientNotes: notes,
          } as Prisma.InputJsonValue,
          patientId: outreach.patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      return {
        success: true,
        availableSlots,
        actionId: action.id,
        originalAppointment: {
          id: originalAppointment.id,
          date: originalAppointment.startTime,
          type: originalAppointment.appointmentType?.name,
          provider: originalAppointment.provider?.user
            ? `${originalAppointment.provider.user.firstName} ${originalAppointment.provider.user.lastName}`
            : 'Provider',
        },
      };
    }),

  // Get reminder queue - appointments that need reminders
  getReminderQueue: protectedProcedure
    .input(
      z.object({
        hoursAhead: z.number().min(1).max(168).default(72), // Up to 1 week
        reminderSequence: z.number().min(1).max(3).default(1),
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const { hoursAhead, reminderSequence, limit } = input;

      const now = new Date();
      const endDate = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

      // Get appointments in the time window
      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          startTime: { gte: now, lte: endDate },
        },
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
              contacts: { where: { isPrimary: true }, take: 1 },
              communicationPreference: true,
              careOutreach: {
                where: {
                  type: 'APPOINTMENT_REMINDER',
                  createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
                },
              },
            },
          },
          provider: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          appointmentType: true,
        },
        orderBy: { startTime: 'asc' },
        take: limit,
      });

      // Filter out appointments that already have this reminder sequence
      const needsReminder = appointments.filter(apt => {
        const hasReminder = apt.patient.careOutreach.some(
          o => o.appointmentId === apt.id && o.reminderSequence === reminderSequence
        );
        const hasOptedOut = apt.patient.communicationPreference?.optOutReminders;
        return !hasReminder && !hasOptedOut;
      });

      // Group by urgency
      const queue = needsReminder.map(apt => {
        const hoursUntil = (apt.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        let urgency: 'IMMEDIATE' | 'SOON' | 'SCHEDULED' = 'SCHEDULED';

        if (hoursUntil < 4) urgency = 'IMMEDIATE';
        else if (hoursUntil < 24) urgency = 'SOON';

        return {
          appointmentId: apt.id,
          patientId: apt.patientId,
          patientName: getPatientName(apt.patient),
          appointmentDate: apt.startTime,
          appointmentType: apt.appointmentType?.name || 'Appointment',
          providerName: apt.provider?.user
            ? `${apt.provider.user.firstName} ${apt.provider.user.lastName}`
            : 'Provider',
          hoursUntilAppointment: Math.round(hoursUntil * 10) / 10,
          urgency,
          hasContactInfo: !!(apt.patient.contacts[0]?.mobilePhone || apt.patient.contacts[0]?.email),
          preferredChannel: apt.patient.communicationPreference?.preferredChannel || 'SMS',
          reminderSequence,
        };
      });

      return {
        queue,
        summary: {
          total: queue.length,
          immediate: queue.filter(q => q.urgency === 'IMMEDIATE').length,
          soon: queue.filter(q => q.urgency === 'SOON').length,
          scheduled: queue.filter(q => q.urgency === 'SCHEDULED').length,
          noContactInfo: queue.filter(q => !q.hasContactInfo).length,
        },
      };
    }),

  // Get reminder effectiveness stats
  getReminderStats: protectedProcedure
    .input(
      z.object({
        dateRange: z.object({
          start: z.coerce.date(),
          end: z.coerce.date(),
        }).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const start = input?.dateRange?.start || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const end = input?.dateRange?.end || now;

      // Get all appointment reminders in date range
      const reminders = await ctx.prisma.careOutreach.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          type: 'APPOINTMENT_REMINDER',
          sentAt: { gte: start, lte: end },
        },
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      // Get appointment outcomes for reminders
      const appointmentIds = reminders
        .filter(r => r.appointmentId)
        .map(r => r.appointmentId as string);

      const appointmentOutcomes = await ctx.prisma.appointment.findMany({
        where: {
          id: { in: appointmentIds },
          organizationId: ctx.user.organizationId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      const outcomeMap = new Map(appointmentOutcomes.map(a => [a.id, a.status]));

      // Calculate stats
      const stats = {
        totalSent: reminders.length,
        byChannel: {
          sms: reminders.filter(r => r.channel === 'sms').length,
          email: reminders.filter(r => r.channel === 'email').length,
          phone: reminders.filter(r => r.channel === 'phone').length,
          portal: reminders.filter(r => r.channel === 'portal').length,
        },
        byOutcome: {
          confirmed: reminders.filter(r => r.appointmentId && outcomeMap.get(r.appointmentId) === 'CONFIRMED').length,
          completed: reminders.filter(r => r.appointmentId && outcomeMap.get(r.appointmentId) === 'COMPLETED').length,
          noShow: reminders.filter(r => r.appointmentId && outcomeMap.get(r.appointmentId) === 'NO_SHOW').length,
          cancelled: reminders.filter(r => r.appointmentId && outcomeMap.get(r.appointmentId) === 'CANCELLED').length,
        },
        responses: {
          total: reminders.filter(r => r.respondedAt).length,
          confirmed: reminders.filter(r => r.outcome === 'CONFIRMED').length,
          rescheduleRequested: reminders.filter(r => r.outcome === 'RESCHEDULE_REQUESTED').length,
          cancelRequested: reminders.filter(r => r.outcome === 'CANCEL_REQUESTED').length,
        },
        timing: {
          usedOptimalTime: reminders.filter(r => r.optimalTimeUsed).length,
          averageNoShowRiskScore: reminders.length > 0
            ? Math.round(reminders.reduce((sum, r) => sum + (r.noShowRiskLevel || 0), 0) / reminders.length)
            : 0,
        },
        effectiveness: {
          responseRate: reminders.length > 0
            ? Math.round((reminders.filter(r => r.respondedAt).length / reminders.length) * 100)
            : 0,
          confirmationRate: reminders.length > 0
            ? Math.round((reminders.filter(r => r.outcome === 'CONFIRMED').length / reminders.length) * 100)
            : 0,
          showRate: appointmentIds.length > 0
            ? Math.round(
                ((appointmentOutcomes.filter(a => a.status === 'COMPLETED' || a.status === 'CHECKED_IN').length) /
                  appointmentIds.length) * 100
              )
            : 0,
        },
      };

      return {
        dateRange: { start, end },
        stats,
      };
    }),
});
