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

  // ==================== US-326: Proactive Follow-up Scheduling ====================

  // Get follow-up recommendations based on condition and treatment plan
  getFollowUpRecommendation: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(), // If available, use encounter context
        conditionType: z.string().optional(), // e.g., 'acute', 'chronic', 'maintenance'
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId, conditionType } = input;

      // Get patient with treatment plan and recent encounters
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: { select: { firstName: true, lastName: true } },
          treatmentPlans: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              goals: true,
            },
          },
          encounters: {
            orderBy: { encounterDate: 'desc' },
            take: 5,
            include: {
              diagnoses: true,
            },
          },
          appointments: {
            where: {
              status: { in: ['SCHEDULED', 'CONFIRMED'] },
              startTime: { gte: new Date() },
            },
            orderBy: { startTime: 'asc' },
            take: 1,
          },
          communicationPreference: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const patientName = getPatientName(patient);
      const activePlan = patient.treatmentPlans[0];
      const recentEncounter = encounterId
        ? patient.encounters.find(e => e.id === encounterId)
        : patient.encounters[0];
      const hasUpcomingAppointment = patient.appointments.length > 0;

      // Determine follow-up timing based on condition type and treatment plan
      let recommendedDays = 7; // Default to 1 week
      let reasoning: string[] = [];
      let urgency: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
      let appointmentType = 'Follow-up';

      // Analyze treatment plan frequency
      if (activePlan?.frequency) {
        const freq = activePlan.frequency.toLowerCase();
        if (freq.includes('3x') || freq.includes('3 times')) {
          recommendedDays = 2;
          reasoning.push(`Treatment plan frequency: ${activePlan.frequency} (every 2-3 days)`);
        } else if (freq.includes('2x') || freq.includes('2 times') || freq.includes('twice')) {
          recommendedDays = 3;
          reasoning.push(`Treatment plan frequency: ${activePlan.frequency} (every 3-4 days)`);
        } else if (freq.includes('1x') || freq.includes('weekly') || freq.includes('once')) {
          recommendedDays = 7;
          reasoning.push(`Treatment plan frequency: ${activePlan.frequency} (weekly)`);
        } else if (freq.includes('biweekly') || freq.includes('bi-weekly')) {
          recommendedDays = 14;
          reasoning.push(`Treatment plan frequency: ${activePlan.frequency} (bi-weekly)`);
        } else if (freq.includes('monthly')) {
          recommendedDays = 30;
          reasoning.push(`Treatment plan frequency: ${activePlan.frequency} (monthly)`);
        }
      }

      // Adjust based on condition type
      const effectiveConditionType = conditionType || (activePlan ? 'active_care' : 'maintenance');

      if (effectiveConditionType === 'acute' || effectiveConditionType.includes('acute')) {
        recommendedDays = Math.min(recommendedDays, 3);
        urgency = 'HIGH';
        reasoning.push('Acute condition requires more frequent follow-up');
        appointmentType = 'Acute Follow-up';
      } else if (effectiveConditionType === 'chronic' || effectiveConditionType.includes('chronic')) {
        urgency = 'MEDIUM';
        reasoning.push('Chronic condition - maintaining scheduled frequency');
        appointmentType = 'Treatment Follow-up';
      } else if (effectiveConditionType === 'maintenance' || effectiveConditionType.includes('maintenance')) {
        recommendedDays = Math.max(recommendedDays, 14);
        urgency = 'LOW';
        reasoning.push('Maintenance care - extended follow-up interval');
        appointmentType = 'Maintenance Visit';
      } else if (effectiveConditionType === 'wellness') {
        recommendedDays = 30;
        urgency = 'LOW';
        reasoning.push('Wellness care - monthly check-in recommended');
        appointmentType = 'Wellness Check';
      }

      // Analyze recent encounter diagnoses for severity
      if (recentEncounter?.diagnoses && recentEncounter.diagnoses.length > 0) {
        const hasSevereDiagnosis = recentEncounter.diagnoses.some(d => {
          const desc = (d.description || '').toLowerCase();
          return desc.includes('severe') || desc.includes('acute') || desc.includes('significant');
        });
        if (hasSevereDiagnosis) {
          recommendedDays = Math.min(recommendedDays, 3);
          urgency = 'HIGH';
          reasoning.push('Recent diagnosis indicates higher severity');
        }
      }

      // Check treatment plan progress
      if (activePlan) {
        const completionRate = activePlan.plannedVisits
          ? (activePlan.completedVisits / activePlan.plannedVisits) * 100
          : 0;

        if (completionRate > 80) {
          reasoning.push(`Near completion of treatment plan (${Math.round(completionRate)}%)`);
          appointmentType = 'Progress Evaluation';
        } else if (completionRate < 30) {
          reasoning.push(`Early in treatment plan (${Math.round(completionRate)}%)`);
        }

        // Check if near end date
        if (activePlan.endDate) {
          const daysToEnd = Math.floor((activePlan.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysToEnd <= 14 && daysToEnd > 0) {
            reasoning.push(`Treatment plan ends in ${daysToEnd} days - re-evaluation needed`);
            appointmentType = 'Plan Re-evaluation';
          }
        }
      }

      // Calculate recommended date
      const recommendedDate = new Date();
      recommendedDate.setDate(recommendedDate.getDate() + recommendedDays);

      // Skip weekends
      while (recommendedDate.getDay() === 0 || recommendedDate.getDay() === 6) {
        recommendedDate.setDate(recommendedDate.getDate() + 1);
      }

      return {
        patientId,
        patientName,
        hasUpcomingAppointment,
        upcomingAppointmentDate: patient.appointments[0]?.startTime || null,
        recommendation: {
          days: recommendedDays,
          date: recommendedDate,
          urgency,
          appointmentType,
          reasoning,
          basedOn: {
            treatmentPlan: activePlan ? {
              id: activePlan.id,
              name: activePlan.name,
              frequency: activePlan.frequency,
              completedVisits: activePlan.completedVisits,
              plannedVisits: activePlan.plannedVisits,
            } : null,
            conditionType: effectiveConditionType,
            recentEncounterId: recentEncounter?.id || null,
          },
        },
        patientPreferences: {
          preferredTimeStart: patient.communicationPreference?.preferredTimeStart || null,
          preferredTimeEnd: patient.communicationPreference?.preferredTimeEnd || null,
        },
      };
    }),

  // Schedule a follow-up appointment
  scheduleFollowUp: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        providerId: z.string(),
        appointmentTypeId: z.string().optional(),
        preferredDate: z.coerce.date(),
        preferredTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']).default('any'),
        notes: z.string().optional(),
        autoSelectSlot: z.boolean().default(false), // Auto-pick the best available slot
        withPatientConsent: z.boolean().default(false), // If true, patient has consented
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        providerId,
        appointmentTypeId,
        preferredDate,
        preferredTimeOfDay,
        notes,
        autoSelectSlot,
        withPatientConsent,
      } = input;

      // Verify patient exists
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: { select: { firstName: true, lastName: true } },
          communicationPreference: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get appointment type
      let appointmentType = null;
      if (appointmentTypeId) {
        appointmentType = await ctx.prisma.appointmentType.findFirst({
          where: {
            id: appointmentTypeId,
            organizationId: ctx.user.organizationId,
            isActive: true,
          },
        });
      } else {
        // Default to a follow-up type
        appointmentType = await ctx.prisma.appointmentType.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            isActive: true,
            name: { contains: 'follow', mode: 'insensitive' },
          },
        });
        if (!appointmentType) {
          // Just get any active type
          appointmentType = await ctx.prisma.appointmentType.findFirst({
            where: {
              organizationId: ctx.user.organizationId,
              isActive: true,
            },
          });
        }
      }

      const duration = appointmentType?.duration || 30;

      // Define time ranges based on preference
      let startHour = 9;
      let endHour = 17;

      if (preferredTimeOfDay === 'morning') {
        startHour = 9;
        endHour = 12;
      } else if (preferredTimeOfDay === 'afternoon') {
        startHour = 12;
        endHour = 17;
      } else if (preferredTimeOfDay === 'evening') {
        startHour = 17;
        endHour = 19;
      }

      // Search window: preferred date +/- 3 days
      const searchStart = new Date(preferredDate);
      searchStart.setDate(searchStart.getDate() - 3);
      if (searchStart < new Date()) {
        searchStart.setTime(Date.now());
      }

      const searchEnd = new Date(preferredDate);
      searchEnd.setDate(searchEnd.getDate() + 7);

      // Get provider's existing appointments
      const existingAppointments = await ctx.prisma.appointment.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          startTime: { gte: searchStart, lte: searchEnd },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] },
        },
        orderBy: { startTime: 'asc' },
      });

      // Get schedule blocks (lunch, meetings, etc.)
      const scheduleBlocks = await ctx.prisma.scheduleBlock.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          OR: [
            { providerId },
            { providerId: null }, // Org-wide blocks
          ],
          startTime: { lte: searchEnd },
          endTime: { gte: searchStart },
        },
      });

      // Find available slots
      const availableSlots: Array<{
        date: Date;
        isPreferredDate: boolean;
        isPreferredTime: boolean;
        score: number;
      }> = [];

      const currentDate = new Date(searchStart);
      currentDate.setHours(startHour, 0, 0, 0);

      while (currentDate < searchEnd && availableSlots.length < 20) {
        // Skip weekends
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          const hour = currentDate.getHours();

          // Check if within preferred time range
          if (hour >= startHour && hour < endHour) {
            const slotEnd = new Date(currentDate.getTime() + duration * 60 * 1000);

            // Check for appointment conflicts
            const hasAppointmentConflict = existingAppointments.some(apt => {
              const aptEnd = new Date(apt.startTime.getTime() + duration * 60 * 1000);
              return currentDate < aptEnd && slotEnd > apt.startTime;
            });

            // Check for schedule block conflicts
            const hasBlockConflict = scheduleBlocks.some(block => {
              return currentDate < block.endTime && slotEnd > block.startTime;
            });

            if (!hasAppointmentConflict && !hasBlockConflict) {
              const isPreferredDate =
                currentDate.toDateString() === preferredDate.toDateString();
              const isPreferredTime =
                preferredTimeOfDay === 'any' ||
                (preferredTimeOfDay === 'morning' && hour >= 9 && hour < 12) ||
                (preferredTimeOfDay === 'afternoon' && hour >= 12 && hour < 17) ||
                (preferredTimeOfDay === 'evening' && hour >= 17);

              // Calculate score (higher is better)
              let score = 50; // Base score
              if (isPreferredDate) score += 30;
              if (isPreferredTime) score += 20;
              // Prefer earlier slots on preferred date
              if (isPreferredDate) {
                score -= Math.abs(hour - 10) * 2; // Prefer 10am
              }

              availableSlots.push({
                date: new Date(currentDate),
                isPreferredDate,
                isPreferredTime,
                score,
              });
            }
          }
        }

        // Move to next slot
        currentDate.setMinutes(currentDate.getMinutes() + 30);
        if (currentDate.getHours() >= endHour) {
          currentDate.setDate(currentDate.getDate() + 1);
          currentDate.setHours(startHour, 0, 0, 0);
        }
      }

      // Sort by score
      availableSlots.sort((a, b) => b.score - a.score);

      // If autoSelectSlot and patient consented, book the best slot
      if (autoSelectSlot && withPatientConsent && availableSlots.length > 0) {
        if (!appointmentType) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No valid appointment type found. Cannot auto-schedule.',
          });
        }

        const selectedSlot = availableSlots[0];
        const endTime = new Date(selectedSlot.date.getTime() + duration * 60 * 1000);

        const newAppointment = await ctx.prisma.appointment.create({
          data: {
            startTime: selectedSlot.date,
            endTime,
            status: 'SCHEDULED',
            notes: notes || 'AI-scheduled follow-up appointment',
            patientId,
            providerId,
            appointmentTypeId: appointmentType.id,
            organizationId: ctx.user.organizationId,
          },
        });

        // Log the action
        await ctx.prisma.careCoordinatorAction.create({
          data: {
            actionType: 'APPOINTMENT_SCHEDULED',
            title: `Follow-up scheduled for ${getPatientName(patient)}`,
            description: `AI auto-scheduled follow-up appointment on ${selectedSlot.date.toLocaleDateString()} at ${selectedSlot.date.toLocaleTimeString()}`,
            result: 'success',
            resultData: {
              appointmentId: newAppointment.id,
              autoSelected: true,
              slotScore: selectedSlot.score,
            } as Prisma.InputJsonValue,
            patientId,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_CARE_OUTREACH_RECOMMEND', 'Appointment', {
          changes: {
            action: 'schedule_followup',
            appointmentId: newAppointment.id,
            autoSelected: true,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return {
          success: true,
          scheduled: true,
          appointment: {
            id: newAppointment.id,
            startTime: newAppointment.startTime,
            endTime: newAppointment.endTime,
            appointmentType: appointmentType?.name,
          },
          availableSlots: availableSlots.slice(0, 5).map(s => ({
            date: s.date,
            isPreferredDate: s.isPreferredDate,
            isPreferredTime: s.isPreferredTime,
          })),
          message: `Follow-up appointment scheduled for ${selectedSlot.date.toLocaleDateString()} at ${selectedSlot.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
        };
      }

      // Return available slots for manual selection
      return {
        success: true,
        scheduled: false,
        appointment: null,
        availableSlots: availableSlots.slice(0, 10).map(s => ({
          date: s.date,
          isPreferredDate: s.isPreferredDate,
          isPreferredTime: s.isPreferredTime,
        })),
        message: availableSlots.length > 0
          ? `Found ${availableSlots.length} available slots. Patient consent required for auto-scheduling.`
          : 'No available slots found in the requested time range.',
      };
    }),

  // Auto-schedule at checkout with patient consent
  autoScheduleAtCheckout: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string(),
        providerId: z.string(),
        patientConsent: z.boolean(),
        appointmentTypeId: z.string().optional(),
        preferredTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']).default('any'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, encounterId, providerId, patientConsent, appointmentTypeId, preferredTimeOfDay } = input;

      if (!patientConsent) {
        return {
          success: false,
          scheduled: false,
          message: 'Patient consent required for auto-scheduling',
          recommendation: null,
        };
      }

      // Get the encounter with diagnosis information
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          diagnoses: true,
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
              treatmentPlans: {
                where: { status: 'ACTIVE' },
                take: 1,
              },
            },
          },
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Determine condition type from diagnoses
      let conditionType = 'active_care';
      if (encounter.diagnoses.length > 0) {
        const diagDescriptions = encounter.diagnoses.map(d => (d.description || '').toLowerCase());
        if (diagDescriptions.some(d => d.includes('acute'))) {
          conditionType = 'acute';
        } else if (diagDescriptions.some(d => d.includes('chronic'))) {
          conditionType = 'chronic';
        } else if (diagDescriptions.some(d => d.includes('maintenance') || d.includes('wellness'))) {
          conditionType = 'maintenance';
        }
      }

      // Get follow-up recommendation
      let recommendedDays = 7;
      const activePlan = encounter.patient.treatmentPlans[0];

      if (activePlan?.frequency) {
        const freq = activePlan.frequency.toLowerCase();
        if (freq.includes('3x')) recommendedDays = 2;
        else if (freq.includes('2x') || freq.includes('twice')) recommendedDays = 3;
        else if (freq.includes('weekly') || freq.includes('1x')) recommendedDays = 7;
        else if (freq.includes('biweekly')) recommendedDays = 14;
      }

      if (conditionType === 'acute') {
        recommendedDays = Math.min(recommendedDays, 3);
      } else if (conditionType === 'maintenance') {
        recommendedDays = Math.max(recommendedDays, 14);
      }

      const preferredDate = new Date();
      preferredDate.setDate(preferredDate.getDate() + recommendedDays);

      // Get appointment type
      let appointmentType = null;
      if (appointmentTypeId) {
        appointmentType = await ctx.prisma.appointmentType.findFirst({
          where: {
            id: appointmentTypeId,
            organizationId: ctx.user.organizationId,
            isActive: true,
          },
        });
      } else {
        appointmentType = await ctx.prisma.appointmentType.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            isActive: true,
            name: { contains: 'follow', mode: 'insensitive' },
          },
        });
      }

      const duration = appointmentType?.duration || 30;

      // Define time range
      let startHour = 9, endHour = 17;
      if (preferredTimeOfDay === 'morning') { startHour = 9; endHour = 12; }
      else if (preferredTimeOfDay === 'afternoon') { startHour = 12; endHour = 17; }
      else if (preferredTimeOfDay === 'evening') { startHour = 17; endHour = 19; }

      // Search for available slot
      const searchStart = new Date(preferredDate);
      const searchEnd = new Date(preferredDate);
      searchEnd.setDate(searchEnd.getDate() + 7);

      const existingAppointments = await ctx.prisma.appointment.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          startTime: { gte: searchStart, lte: searchEnd },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
      });

      // Find first available slot
      const currentDate = new Date(searchStart);
      currentDate.setHours(startHour, 0, 0, 0);

      let selectedSlot: Date | null = null;

      while (currentDate < searchEnd && !selectedSlot) {
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          const hour = currentDate.getHours();
          if (hour >= startHour && hour < endHour) {
            const slotEnd = new Date(currentDate.getTime() + duration * 60 * 1000);
            const hasConflict = existingAppointments.some(apt => {
              const aptEnd = new Date(apt.startTime.getTime() + duration * 60 * 1000);
              return currentDate < aptEnd && slotEnd > apt.startTime;
            });

            if (!hasConflict) {
              selectedSlot = new Date(currentDate);
            }
          }
        }

        currentDate.setMinutes(currentDate.getMinutes() + 30);
        if (currentDate.getHours() >= endHour) {
          currentDate.setDate(currentDate.getDate() + 1);
          currentDate.setHours(startHour, 0, 0, 0);
        }
      }

      if (!selectedSlot) {
        // Add to waitlist instead
        const waitlistEntry = await ctx.prisma.waitlistEntry.create({
          data: {
            patientId,
            appointmentTypeId: appointmentType?.id || '',
            preferredProviderId: providerId,
            preferredDays: [],
            preferredTimeStart: `${startHour.toString().padStart(2, '0')}:00`,
            preferredTimeEnd: `${endHour.toString().padStart(2, '0')}:00`,
            notes: `Auto-added from checkout. Preferred date: ${preferredDate.toLocaleDateString()}`,
            priority: conditionType === 'acute' ? 'HIGH' : 'NORMAL',
            organizationId: ctx.user.organizationId,
          },
        });

        return {
          success: true,
          scheduled: false,
          addedToWaitlist: true,
          waitlistEntryId: waitlistEntry.id,
          message: 'No slots available. Patient added to waitlist.',
          recommendation: {
            days: recommendedDays,
            conditionType,
            preferredDate,
          },
        };
      }

      // Create the appointment
      if (!appointmentType) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No valid appointment type found. Cannot auto-schedule.',
        });
      }

      const endTime = new Date(selectedSlot.getTime() + duration * 60 * 1000);
      const newAppointment = await ctx.prisma.appointment.create({
        data: {
          startTime: selectedSlot,
          endTime,
          status: 'SCHEDULED',
          notes: `Follow-up scheduled at checkout (${conditionType})`,
          patientId,
          providerId,
          appointmentTypeId: appointmentType.id,
          organizationId: ctx.user.organizationId,
        },
      });

      // Log the action
      await ctx.prisma.careCoordinatorAction.create({
        data: {
          actionType: 'APPOINTMENT_SCHEDULED',
          title: `Checkout auto-schedule for ${getPatientName(encounter.patient)}`,
          description: `Follow-up appointment auto-scheduled at checkout for ${selectedSlot.toLocaleDateString()} at ${selectedSlot.toLocaleTimeString()}`,
          result: 'success',
          resultData: {
            appointmentId: newAppointment.id,
            encounterId,
            conditionType,
            recommendedDays,
          } as Prisma.InputJsonValue,
          patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      return {
        success: true,
        scheduled: true,
        appointment: {
          id: newAppointment.id,
          startTime: newAppointment.startTime,
          endTime: newAppointment.endTime,
          appointmentType: appointmentType?.name,
        },
        message: `Follow-up scheduled for ${selectedSlot.toLocaleDateString()} at ${selectedSlot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
        recommendation: {
          days: recommendedDays,
          conditionType,
          preferredDate,
        },
      };
    }),

  // Manage waitlist for preferred times
  manageWaitlist: protectedProcedure
    .input(
      z.object({
        action: z.enum(['add', 'remove', 'getMatches', 'notify']),
        patientId: z.string().optional(),
        waitlistEntryId: z.string().optional(),
        providerId: z.string().optional(),
        appointmentTypeId: z.string().optional(),
        preferredDays: z.array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'])).optional(),
        preferredTimeStart: z.string().optional(),
        preferredTimeEnd: z.string().optional(),
        priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        action,
        patientId,
        waitlistEntryId,
        providerId,
        appointmentTypeId,
        preferredDays,
        preferredTimeStart,
        preferredTimeEnd,
        priority,
        notes,
      } = input;

      if (action === 'add') {
        if (!patientId || !appointmentTypeId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Patient ID and appointment type ID required to add to waitlist',
          });
        }

        const entry = await ctx.prisma.waitlistEntry.create({
          data: {
            patientId,
            appointmentTypeId,
            preferredProviderId: providerId,
            preferredDays: preferredDays || [],
            preferredTimeStart: preferredTimeStart || '09:00',
            preferredTimeEnd: preferredTimeEnd || '17:00',
            priority: priority || 'NORMAL',
            notes,
            organizationId: ctx.user.organizationId,
          },
        });

        return {
          success: true,
          action: 'added',
          entry: {
            id: entry.id,
            patientId: entry.patientId,
            priority: entry.priority,
          },
        };
      }

      if (action === 'remove') {
        if (!waitlistEntryId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Waitlist entry ID required to remove',
          });
        }

        await ctx.prisma.waitlistEntry.update({
          where: { id: waitlistEntryId },
          data: { isActive: false },
        });

        return {
          success: true,
          action: 'removed',
          entryId: waitlistEntryId,
        };
      }

      if (action === 'getMatches') {
        // Find waitlist entries that match available slots
        const activeEntries = await ctx.prisma.waitlistEntry.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            isActive: true,
            ...(providerId && { preferredProviderId: providerId }),
            ...(appointmentTypeId && { appointmentTypeId }),
          },
          include: {
            patient: {
              include: {
                demographics: { select: { firstName: true, lastName: true } },
                contacts: { where: { isPrimary: true }, take: 1 },
              },
            },
            appointmentType: true,
            preferredProvider: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        });

        // For each entry, find potential matching slots in the next 2 weeks
        const now = new Date();
        const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

        const matches = await Promise.all(activeEntries.map(async (entry) => {
          const provId = entry.preferredProviderId;
          if (!provId) return { entry, matchingSlots: [] };

          // Get existing appointments for the provider
          const existing = await ctx.prisma.appointment.findMany({
            where: {
              providerId: provId,
              organizationId: ctx.user.organizationId,
              startTime: { gte: now, lte: twoWeeksOut },
              status: { in: ['SCHEDULED', 'CONFIRMED'] },
            },
          });

          const matchingSlots: Date[] = [];
          const duration = entry.appointmentType?.duration || 30;
          const startHour = parseInt(entry.preferredTimeStart?.split(':')[0] || '9');
          const endHour = parseInt(entry.preferredTimeEnd?.split(':')[0] || '17');
          const preferredDayNames = entry.preferredDays as string[];

          const currentSlot = new Date(now);
          currentSlot.setHours(startHour, 0, 0, 0);

          while (currentSlot < twoWeeksOut && matchingSlots.length < 3) {
            const dayName = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][currentSlot.getDay()];

            if (currentSlot.getDay() !== 0 && currentSlot.getDay() !== 6) {
              // Check if day matches preference (or no preference set)
              if (preferredDayNames.length === 0 || preferredDayNames.includes(dayName)) {
                const hour = currentSlot.getHours();
                if (hour >= startHour && hour < endHour) {
                  const slotEnd = new Date(currentSlot.getTime() + duration * 60 * 1000);
                  const hasConflict = existing.some(apt => {
                    const aptEnd = new Date(apt.startTime.getTime() + duration * 60 * 1000);
                    return currentSlot < aptEnd && slotEnd > apt.startTime;
                  });

                  if (!hasConflict) {
                    matchingSlots.push(new Date(currentSlot));
                  }
                }
              }
            }

            currentSlot.setMinutes(currentSlot.getMinutes() + 30);
            if (currentSlot.getHours() >= endHour) {
              currentSlot.setDate(currentSlot.getDate() + 1);
              currentSlot.setHours(startHour, 0, 0, 0);
            }
          }

          return {
            entry: {
              id: entry.id,
              patientId: entry.patientId,
              patientName: getPatientName(entry.patient),
              appointmentType: entry.appointmentType?.name,
              preferredProvider: entry.preferredProvider?.user
                ? `${entry.preferredProvider.user.firstName} ${entry.preferredProvider.user.lastName}`
                : null,
              priority: entry.priority,
              preferredDays: entry.preferredDays,
              preferredTimeRange: `${entry.preferredTimeStart} - ${entry.preferredTimeEnd}`,
              createdAt: entry.createdAt,
            },
            matchingSlots,
          };
        }));

        return {
          success: true,
          action: 'getMatches',
          matches: matches.filter(m => m.matchingSlots.length > 0),
          noMatches: matches.filter(m => m.matchingSlots.length === 0).map(m => m.entry),
          summary: {
            totalEntries: activeEntries.length,
            withMatches: matches.filter(m => m.matchingSlots.length > 0).length,
            withoutMatches: matches.filter(m => m.matchingSlots.length === 0).length,
          },
        };
      }

      if (action === 'notify') {
        // Notify waitlist patients about available slots
        if (!waitlistEntryId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Waitlist entry ID required for notification',
          });
        }

        const entry = await ctx.prisma.waitlistEntry.findFirst({
          where: {
            id: waitlistEntryId,
            organizationId: ctx.user.organizationId,
            isActive: true,
          },
          include: {
            patient: {
              include: {
                demographics: { select: { firstName: true, lastName: true } },
                contacts: { where: { isPrimary: true }, take: 1 },
              },
            },
          },
        });

        if (!entry) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Waitlist entry not found',
          });
        }

        // Create outreach record
        const outreach = await ctx.prisma.careOutreach.create({
          data: {
            type: 'FOLLOWUP_SCHEDULING',
            status: 'SENT',
            channel: 'sms',
            content: `Hi ${entry.patient.demographics?.firstName || 'there'}! A slot matching your preferences is now available. Reply YES to book or call us to schedule.`,
            sentAt: new Date(),
            patientId: entry.patientId,
            organizationId: ctx.user.organizationId,
          },
        });

        return {
          success: true,
          action: 'notify',
          outreachId: outreach.id,
          patientName: getPatientName(entry.patient),
        };
      }

      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid action',
      });
    }),

  // Schedule recall appointments for maintenance care
  scheduleRecall: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        recallType: z.enum(['maintenance', 'annual', 'recheck', 'preventive']),
        intervalDays: z.number().min(1).max(365).default(30),
        providerId: z.string(),
        appointmentTypeId: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, recallType, intervalDays, providerId, appointmentTypeId, notes } = input;

      // Get patient
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: { select: { firstName: true, lastName: true } },
          appointments: {
            where: {
              status: { in: ['COMPLETED', 'CHECKED_IN'] },
            },
            orderBy: { startTime: 'desc' },
            take: 1,
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Calculate recall date from last completed appointment
      const lastVisit = patient.appointments[0]?.startTime || new Date();
      const recallDate = new Date(lastVisit);
      recallDate.setDate(recallDate.getDate() + intervalDays);

      // If recall date is in the past, schedule from today
      if (recallDate < new Date()) {
        recallDate.setTime(Date.now());
        recallDate.setDate(recallDate.getDate() + 1);
      }

      // Skip weekends
      while (recallDate.getDay() === 0 || recallDate.getDay() === 6) {
        recallDate.setDate(recallDate.getDate() + 1);
      }

      // Get appointment type
      let appointmentType = null;
      if (appointmentTypeId) {
        appointmentType = await ctx.prisma.appointmentType.findFirst({
          where: {
            id: appointmentTypeId,
            organizationId: ctx.user.organizationId,
            isActive: true,
          },
        });
      } else {
        // Find maintenance/recall type
        appointmentType = await ctx.prisma.appointmentType.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            isActive: true,
            OR: [
              { name: { contains: 'maintenance', mode: 'insensitive' } },
              { name: { contains: 'recall', mode: 'insensitive' } },
              { name: { contains: 'wellness', mode: 'insensitive' } },
            ],
          },
        });
      }

      const duration = appointmentType?.duration || 30;

      // Find available slot on or near the recall date
      const searchEnd = new Date(recallDate);
      searchEnd.setDate(searchEnd.getDate() + 14);

      const existingAppointments = await ctx.prisma.appointment.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          startTime: { gte: recallDate, lte: searchEnd },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
      });

      // Find first available slot
      const currentSlot = new Date(recallDate);
      currentSlot.setHours(10, 0, 0, 0); // Default to 10am

      let selectedSlot: Date | null = null;

      while (currentSlot < searchEnd && !selectedSlot) {
        if (currentSlot.getDay() !== 0 && currentSlot.getDay() !== 6) {
          const hour = currentSlot.getHours();
          if (hour >= 9 && hour < 17) {
            const slotEnd = new Date(currentSlot.getTime() + duration * 60 * 1000);
            const hasConflict = existingAppointments.some(apt => {
              const aptEnd = new Date(apt.startTime.getTime() + duration * 60 * 1000);
              return currentSlot < aptEnd && slotEnd > apt.startTime;
            });

            if (!hasConflict) {
              selectedSlot = new Date(currentSlot);
            }
          }
        }

        currentSlot.setMinutes(currentSlot.getMinutes() + 30);
        if (currentSlot.getHours() >= 17) {
          currentSlot.setDate(currentSlot.getDate() + 1);
          currentSlot.setHours(9, 0, 0, 0);
        }
      }

      // Create care journey entry for recall tracking
      const journey = await ctx.prisma.careJourney.create({
        data: {
          journeyType: 'MAINTENANCE',
          name: `${recallType.charAt(0).toUpperCase() + recallType.slice(1)} Recall Journey`,
          currentStage: 'RECALL_SCHEDULED',
          completedStages: [] as Prisma.InputJsonValue,
          nextMilestone: `${recallType} recall scheduled`,
          milestones: [{
            name: `${recallType} recall`,
            scheduledDate: selectedSlot?.toISOString() || recallDate.toISOString(),
            status: selectedSlot ? 'scheduled' : 'pending',
          }] as Prisma.InputJsonValue,
          patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!selectedSlot) {
        // Add to waitlist
        const waitlistEntry = await ctx.prisma.waitlistEntry.create({
          data: {
            patientId,
            appointmentTypeId: appointmentType?.id || '',
            preferredProviderId: providerId,
            preferredDays: [],
            preferredTimeStart: '10:00',
            preferredTimeEnd: '15:00',
            notes: `${recallType} recall - target date ${recallDate.toLocaleDateString()}. ${notes || ''}`,
            priority: 'NORMAL',
            organizationId: ctx.user.organizationId,
          },
        });

        return {
          success: true,
          scheduled: false,
          addedToWaitlist: true,
          waitlistEntryId: waitlistEntry.id,
          journeyId: journey.id,
          recallInfo: {
            type: recallType,
            targetDate: recallDate,
            intervalDays,
            lastVisit,
          },
          message: `No immediate slots available. Patient added to waitlist for ${recallType} recall around ${recallDate.toLocaleDateString()}.`,
        };
      }

      // Create the recall appointment
      if (!appointmentType) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No valid appointment type found. Cannot schedule recall.',
        });
      }

      const endTime = new Date(selectedSlot.getTime() + duration * 60 * 1000);
      const appointment = await ctx.prisma.appointment.create({
        data: {
          startTime: selectedSlot,
          endTime,
          status: 'SCHEDULED',
          notes: `${recallType.charAt(0).toUpperCase() + recallType.slice(1)} recall appointment. ${notes || ''}`,
          patientId,
          providerId,
          appointmentTypeId: appointmentType.id,
          organizationId: ctx.user.organizationId,
        },
      });

      // Log action
      await ctx.prisma.careCoordinatorAction.create({
        data: {
          actionType: 'APPOINTMENT_SCHEDULED',
          title: `${recallType} recall scheduled for ${getPatientName(patient)}`,
          description: `Recall appointment scheduled for ${selectedSlot.toLocaleDateString()} (${intervalDays} days after last visit)`,
          result: 'success',
          resultData: {
            appointmentId: appointment.id,
            recallType,
            intervalDays,
            lastVisitDate: lastVisit.toISOString(),
          } as Prisma.InputJsonValue,
          patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      return {
        success: true,
        scheduled: true,
        appointment: {
          id: appointment.id,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          appointmentType: appointmentType?.name || `${recallType} Recall`,
        },
        journeyId: journey.id,
        recallInfo: {
          type: recallType,
          scheduledDate: selectedSlot,
          intervalDays,
          lastVisit,
        },
        message: `${recallType.charAt(0).toUpperCase() + recallType.slice(1)} recall scheduled for ${selectedSlot.toLocaleDateString()} at ${selectedSlot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      };
    }),

  // Get patient scheduling preferences
  getPatientSchedulingPreferences: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: { select: { firstName: true, lastName: true } },
          communicationPreference: true,
          appointments: {
            where: { status: 'COMPLETED' },
            orderBy: { startTime: 'desc' },
            take: 20,
          },
          waitlistEntries: {
            where: { isActive: true },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Analyze appointment history to determine implicit preferences
      const completedAppointments = patient.appointments;
      const dayFrequency: Record<number, number> = {};
      const hourFrequency: Record<number, number> = {};

      for (const apt of completedAppointments) {
        const day = apt.startTime.getDay();
        const hour = apt.startTime.getHours();

        dayFrequency[day] = (dayFrequency[day] || 0) + 1;
        hourFrequency[hour] = (hourFrequency[hour] || 0) + 1;
      }

      // Find preferred days and times based on history
      const sortedDays = Object.entries(dayFrequency)
        .sort(([, a], [, b]) => b - a)
        .map(([day]) => parseInt(day));

      const sortedHours = Object.entries(hourFrequency)
        .sort(([, a], [, b]) => b - a)
        .map(([hour]) => parseInt(hour));

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      // Determine time preference
      const morningCount = Object.entries(hourFrequency)
        .filter(([h]) => parseInt(h) >= 9 && parseInt(h) < 12)
        .reduce((sum, [, count]) => sum + count, 0);
      const afternoonCount = Object.entries(hourFrequency)
        .filter(([h]) => parseInt(h) >= 12 && parseInt(h) < 17)
        .reduce((sum, [, count]) => sum + count, 0);
      const eveningCount = Object.entries(hourFrequency)
        .filter(([h]) => parseInt(h) >= 17)
        .reduce((sum, [, count]) => sum + count, 0);

      let impliedTimePreference = 'any';
      if (morningCount > afternoonCount && morningCount > eveningCount) {
        impliedTimePreference = 'morning';
      } else if (afternoonCount > morningCount && afternoonCount > eveningCount) {
        impliedTimePreference = 'afternoon';
      } else if (eveningCount > morningCount && eveningCount > afternoonCount) {
        impliedTimePreference = 'evening';
      }

      return {
        patientId,
        patientName: getPatientName(patient),
        explicit: {
          preferredTimeStart: patient.communicationPreference?.preferredTimeStart || null,
          preferredTimeEnd: patient.communicationPreference?.preferredTimeEnd || null,
          allowSms: patient.communicationPreference?.allowSms !== false,
          allowEmail: patient.communicationPreference?.allowEmail !== false,
          allowPortal: patient.communicationPreference?.allowPortal !== false,
        },
        implied: {
          preferredDays: sortedDays.slice(0, 3).map(d => dayNames[d]),
          preferredHours: sortedHours.slice(0, 3),
          timePreference: impliedTimePreference,
          basedOnAppointments: completedAppointments.length,
        },
        waitlistEntries: patient.waitlistEntries.length,
        summary: {
          hasExplicitPreferences: !!patient.communicationPreference?.preferredTimeStart,
          topDays: sortedDays.slice(0, 2).map(d => dayNames[d]),
          topTimeOfDay: impliedTimePreference,
          appointmentHistoryCount: completedAppointments.length,
        },
      };
    }),

  // Optimize provider schedule utilization
  optimizeScheduleUtilization: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        dateRange: z.object({
          start: z.coerce.date(),
          end: z.coerce.date(),
        }),
        targetUtilization: z.number().min(50).max(100).default(85), // Target % booked
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, dateRange, targetUtilization } = input;

      // Get provider info
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          id: providerId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Get appointments in date range
      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          startTime: { gte: dateRange.start, lte: dateRange.end },
          status: { notIn: ['CANCELLED'] },
        },
        include: {
          appointmentType: true,
        },
        orderBy: { startTime: 'asc' },
      });

      // Get schedule blocks
      const blocks = await ctx.prisma.scheduleBlock.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          OR: [{ providerId }, { providerId: null }],
          startTime: { lte: dateRange.end },
          endTime: { gte: dateRange.start },
        },
      });

      // Calculate utilization by day
      const dailyStats: Array<{
        date: string;
        totalSlots: number;
        bookedSlots: number;
        blockedSlots: number;
        availableSlots: number;
        utilization: number;
        gaps: Array<{ start: Date; end: Date; duration: number }>;
      }> = [];

      // Assume 8 hours work day (9am-5pm) = 480 minutes
      const workdayMinutes = 480;
      const slotDuration = 30; // 30-minute slots
      const totalSlotsPerDay = workdayMinutes / slotDuration;

      const currentDate = new Date(dateRange.start);
      while (currentDate <= dateRange.end) {
        // Skip weekends
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          const dateStr = currentDate.toISOString().split('T')[0];
          const dayStart = new Date(currentDate);
          dayStart.setHours(9, 0, 0, 0);
          const dayEnd = new Date(currentDate);
          dayEnd.setHours(17, 0, 0, 0);

          // Get appointments for this day
          const dayAppointments = appointments.filter(a => {
            const aptDate = a.startTime.toISOString().split('T')[0];
            return aptDate === dateStr;
          });

          // Get blocks for this day
          const dayBlocks = blocks.filter(b => {
            return b.startTime < dayEnd && b.endTime > dayStart;
          });

          // Calculate booked minutes
          let bookedMinutes = 0;
          for (const apt of dayAppointments) {
            const duration = apt.appointmentType?.duration || 30;
            bookedMinutes += duration;
          }

          // Calculate blocked minutes
          let blockedMinutes = 0;
          for (const block of dayBlocks) {
            const blockStart = block.startTime > dayStart ? block.startTime : dayStart;
            const blockEnd = block.endTime < dayEnd ? block.endTime : dayEnd;
            blockedMinutes += (blockEnd.getTime() - blockStart.getTime()) / (1000 * 60);
          }

          const bookedSlots = Math.round(bookedMinutes / slotDuration);
          const blockedSlots = Math.round(blockedMinutes / slotDuration);
          const availableSlots = Math.max(0, totalSlotsPerDay - bookedSlots - blockedSlots);
          const utilization = Math.round((bookedSlots / (totalSlotsPerDay - blockedSlots)) * 100);

          // Find gaps (available time between appointments)
          const gaps: Array<{ start: Date; end: Date; duration: number }> = [];
          const sortedApts = [...dayAppointments].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

          let lastEnd = dayStart;
          for (const apt of sortedApts) {
            if (apt.startTime.getTime() - lastEnd.getTime() >= 30 * 60 * 1000) {
              // Gap of 30+ minutes
              gaps.push({
                start: new Date(lastEnd),
                end: new Date(apt.startTime),
                duration: Math.round((apt.startTime.getTime() - lastEnd.getTime()) / (1000 * 60)),
              });
            }
            const duration = apt.appointmentType?.duration || 30;
            lastEnd = new Date(apt.startTime.getTime() + duration * 60 * 1000);
          }

          // Check for gap at end of day
          if (dayEnd.getTime() - lastEnd.getTime() >= 30 * 60 * 1000) {
            gaps.push({
              start: new Date(lastEnd),
              end: dayEnd,
              duration: Math.round((dayEnd.getTime() - lastEnd.getTime()) / (1000 * 60)),
            });
          }

          dailyStats.push({
            date: dateStr,
            totalSlots: totalSlotsPerDay,
            bookedSlots,
            blockedSlots,
            availableSlots,
            utilization,
            gaps,
          });
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Get waitlist entries that could fill gaps
      const waitlistMatches = await ctx.prisma.waitlistEntry.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          preferredProviderId: providerId,
        },
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
          appointmentType: true,
        },
        take: 10,
      });

      // Calculate overall metrics
      const totalDays = dailyStats.length;
      const averageUtilization = totalDays > 0
        ? Math.round(dailyStats.reduce((sum, d) => sum + d.utilization, 0) / totalDays)
        : 0;
      const underutilizedDays = dailyStats.filter(d => d.utilization < targetUtilization);
      const totalGaps = dailyStats.reduce((sum, d) => sum + d.gaps.length, 0);
      const totalGapMinutes = dailyStats.reduce((sum, d) =>
        sum + d.gaps.reduce((gapSum, g) => gapSum + g.duration, 0), 0);

      // Generate recommendations
      const recommendations: string[] = [];

      if (averageUtilization < targetUtilization) {
        const gap = targetUtilization - averageUtilization;
        recommendations.push(`Schedule utilization is ${gap}% below target. Consider filling ${Math.round(gap * totalDays * totalSlotsPerDay / 100)} additional slots.`);
      }

      if (waitlistMatches.length > 0) {
        recommendations.push(`${waitlistMatches.length} patients on waitlist could fill available gaps.`);
      }

      if (totalGapMinutes > 120) {
        recommendations.push(`${Math.round(totalGapMinutes / 60)} hours of fragmented time could be consolidated or filled with shorter appointments.`);
      }

      return {
        providerId,
        providerName: provider.user ? `${provider.user.firstName} ${provider.user.lastName}` : 'Provider',
        dateRange,
        dailyStats,
        summary: {
          totalDays,
          averageUtilization,
          targetUtilization,
          meetsTarget: averageUtilization >= targetUtilization,
          underutilizedDays: underutilizedDays.length,
          totalGaps,
          totalGapMinutes,
          waitlistPatientsAvailable: waitlistMatches.length,
        },
        waitlistMatches: waitlistMatches.map(w => ({
          entryId: w.id,
          patientName: getPatientName(w.patient),
          appointmentType: w.appointmentType?.name,
          duration: w.appointmentType?.duration || 30,
          preferredDays: w.preferredDays,
          preferredTime: `${w.preferredTimeStart} - ${w.preferredTimeEnd}`,
        })),
        recommendations,
      };
    }),

  // ===== CARE GAP IDENTIFICATION (US-327) =====

  // Main procedure to identify all care gaps for patients
  identifyGaps: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        gapTypes: z.array(z.enum([
          'OVERDUE_FOLLOWUP',
          'MISSED_APPOINTMENT',
          'INCOMPLETE_TREATMENT',
          'MISSING_ASSESSMENT',
          'LAPSED_PATIENT',
          'OVERDUE_RECALL',
          'INCOMPLETE_DOCUMENTATION',
          'MISSED_MILESTONE',
        ])).optional(),
        minPriority: z.number().min(1).max(10).default(1),
        includeResolved: z.boolean().default(false),
        createRecords: z.boolean().default(true), // Create CareGap records for new gaps
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, gapTypes, minPriority, includeResolved, createRecords, limit } = input;

      // Get all patients or specific patient
      const patients = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(patientId ? { id: patientId } : {}),
          status: 'ACTIVE',
        },
        take: limit,
        include: {
          demographics: {
            select: { firstName: true, lastName: true },
          },
          treatmentPlans: {
            where: { status: { in: ['ACTIVE', 'DRAFT'] } },
            include: {
              goals: true,
              encounters: {
                orderBy: { encounterDate: 'desc' },
                take: 10,
              },
            },
          },
          appointments: {
            orderBy: { startTime: 'desc' },
            take: 20,
            include: {
              appointmentType: true,
            },
          },
          outcomeAssessments: {
            orderBy: { assessmentDate: 'desc' },
            take: 10,
          },
          careGaps: includeResolved ? undefined : {
            where: { status: { not: 'RESOLVED' } },
          },
        },
      });

      const identifiedGaps: Array<{
        patientId: string;
        patientName: string;
        gapType: string;
        title: string;
        description: string;
        priority: number;
        dueDate: Date | null;
        relatedId: string | null;
        relatedType: string | null;
        detectionScore: number;
        existingGapId: string | null;
        isNew: boolean;
      }> = [];

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      for (const patient of patients) {
        const patientName = getPatientName(patient);
        const existingGapTypes = new Set(patient.careGaps?.map(g => `${g.gapType}:${g.treatmentPlanId || g.appointmentId || g.encounterId || 'general'}`) || []);

        // 1. OVERDUE_FOLLOWUP - Check for patients needing follow-up based on treatment plan
        if (!gapTypes || gapTypes.includes('OVERDUE_FOLLOWUP')) {
          for (const plan of patient.treatmentPlans) {
            if (plan.status !== 'ACTIVE') continue;

            const lastEncounter = plan.encounters[0];
            const lastVisitDate = lastEncounter?.encounterDate;
            const daysSinceVisit = lastVisitDate
              ? Math.floor((now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24))
              : 999;

            // Determine expected frequency (days between visits)
            let expectedDays = 14; // Default bi-weekly
            if (plan.frequency?.toLowerCase().includes('3x')) expectedDays = 3;
            else if (plan.frequency?.toLowerCase().includes('2x')) expectedDays = 4;
            else if (plan.frequency?.toLowerCase().includes('weekly')) expectedDays = 7;
            else if (plan.frequency?.toLowerCase().includes('monthly')) expectedDays = 30;

            // Check if overdue (more than 50% past expected interval)
            const overdueThreshold = Math.floor(expectedDays * 1.5);
            if (daysSinceVisit > overdueThreshold) {
              const gapKey = `OVERDUE_FOLLOWUP:${plan.id}`;
              const isNew = !existingGapTypes.has(gapKey);
              const priority = calculateGapPriority('OVERDUE_FOLLOWUP', daysSinceVisit, expectedDays);

              if (priority >= minPriority) {
                identifiedGaps.push({
                  patientId: patient.id,
                  patientName,
                  gapType: 'OVERDUE_FOLLOWUP',
                  title: `Overdue for follow-up visit`,
                  description: `Patient is ${daysSinceVisit} days since last visit (expected every ${expectedDays} days). Treatment plan: ${plan.name || 'Active Plan'}`,
                  priority,
                  dueDate: new Date(now.getTime() - (daysSinceVisit - expectedDays) * 24 * 60 * 60 * 1000),
                  relatedId: plan.id,
                  relatedType: 'treatmentPlan',
                  detectionScore: Math.min(0.99, 0.7 + (daysSinceVisit / overdueThreshold - 1) * 0.3),
                  existingGapId: patient.careGaps?.find(g => g.gapType === 'OVERDUE_FOLLOWUP' && g.treatmentPlanId === plan.id)?.id || null,
                  isNew,
                });
              }
            }
          }
        }

        // 2. MISSED_APPOINTMENT - Check for recent no-shows
        if (!gapTypes || gapTypes.includes('MISSED_APPOINTMENT')) {
          const missedAppts = patient.appointments.filter(
            a => a.status === 'NO_SHOW' && a.startTime >= thirtyDaysAgo
          );

          for (const appt of missedAppts) {
            const gapKey = `MISSED_APPOINTMENT:${appt.id}`;
            const isNew = !existingGapTypes.has(gapKey);
            const daysSinceMissed = Math.floor((now.getTime() - appt.startTime.getTime()) / (1000 * 60 * 60 * 24));
            const priority = calculateGapPriority('MISSED_APPOINTMENT', daysSinceMissed, 7);

            if (priority >= minPriority) {
              identifiedGaps.push({
                patientId: patient.id,
                patientName,
                gapType: 'MISSED_APPOINTMENT',
                title: `Missed appointment on ${appt.startTime.toLocaleDateString()}`,
                description: `Patient missed ${appt.appointmentType?.name || 'scheduled'} appointment. No reschedule on file.`,
                priority,
                dueDate: appt.startTime,
                relatedId: appt.id,
                relatedType: 'appointment',
                detectionScore: 0.95,
                existingGapId: patient.careGaps?.find(g => g.gapType === 'MISSED_APPOINTMENT' && g.appointmentId === appt.id)?.id || null,
                isNew,
              });
            }
          }
        }

        // 3. INCOMPLETE_TREATMENT - Treatment plans not progressing
        if (!gapTypes || gapTypes.includes('INCOMPLETE_TREATMENT')) {
          for (const plan of patient.treatmentPlans) {
            if (plan.status !== 'ACTIVE') continue;

            const plannedVisits = plan.plannedVisits || 0;
            const completedVisits = plan.encounters.filter(e => e.status === 'COMPLETED').length;
            const completionRate = plannedVisits > 0 ? completedVisits / plannedVisits : 0;

            // Check if plan is significantly behind (less than 50% complete when more than 50% of time elapsed)
            const planDuration = plan.endDate
              ? (plan.endDate.getTime() - plan.startDate.getTime()) / (1000 * 60 * 60 * 24)
              : 90; // Default 90 day plan
            const daysElapsed = (now.getTime() - plan.startDate.getTime()) / (1000 * 60 * 60 * 24);
            const expectedCompletion = Math.min(1, daysElapsed / planDuration);

            if (completionRate < expectedCompletion * 0.5 && daysElapsed > 14) {
              const gapKey = `INCOMPLETE_TREATMENT:${plan.id}`;
              const isNew = !existingGapTypes.has(gapKey);
              const priority = calculateGapPriority('INCOMPLETE_TREATMENT', completionRate, 0.5);

              if (priority >= minPriority) {
                identifiedGaps.push({
                  patientId: patient.id,
                  patientName,
                  gapType: 'INCOMPLETE_TREATMENT',
                  title: `Treatment plan falling behind`,
                  description: `${(completionRate * 100).toFixed(0)}% complete but ${(expectedCompletion * 100).toFixed(0)}% of plan time elapsed. Plan: ${plan.name || 'Active Plan'}`,
                  priority,
                  dueDate: plan.endDate,
                  relatedId: plan.id,
                  relatedType: 'treatmentPlan',
                  detectionScore: Math.min(0.95, 0.6 + (expectedCompletion - completionRate) * 0.5),
                  existingGapId: patient.careGaps?.find(g => g.gapType === 'INCOMPLETE_TREATMENT' && g.treatmentPlanId === plan.id)?.id || null,
                  isNew,
                });
              }
            }

            // Check for missed milestones/goals
            if (!gapTypes || gapTypes.includes('MISSED_MILESTONE')) {
              for (const goal of plan.goals) {
                if (goal.status === 'ACHIEVED' || !goal.targetDate) continue;

                if (goal.targetDate < now && goal.status !== 'ACHIEVED') {
                  const gapKey = `MISSED_MILESTONE:${goal.id}`;
                  const isNew = !existingGapTypes.has(gapKey);
                  const daysOverdue = Math.floor((now.getTime() - goal.targetDate.getTime()) / (1000 * 60 * 60 * 24));
                  const priority = calculateGapPriority('MISSED_MILESTONE', daysOverdue, 14);

                  if (priority >= minPriority) {
                    identifiedGaps.push({
                      patientId: patient.id,
                      patientName,
                      gapType: 'MISSED_MILESTONE',
                      title: `Missed treatment goal: ${goal.description}`,
                      description: `Goal was due ${goal.targetDate.toLocaleDateString()} (${daysOverdue} days ago). Current progress: ${goal.progress || 0}%`,
                      priority,
                      dueDate: goal.targetDate,
                      relatedId: plan.id,
                      relatedType: 'treatmentPlan',
                      detectionScore: 0.9,
                      existingGapId: patient.careGaps?.find(g => g.gapType === 'MISSED_MILESTONE' && g.treatmentPlanId === plan.id)?.id || null,
                      isNew,
                    });
                  }
                }
              }
            }
          }
        }

        // 4. MISSING_ASSESSMENT - Outcome assessments not completed
        if (!gapTypes || gapTypes.includes('MISSING_ASSESSMENT')) {
          // Check if patient has active plan but no recent outcome assessments
          const hasActivePlan = patient.treatmentPlans.some(p => p.status === 'ACTIVE');
          const recentAssessments = patient.outcomeAssessments || [];
          const lastAssessmentDate = recentAssessments.length > 0
            ? new Date(Math.max(...recentAssessments.map(a => a.assessmentDate.getTime())))
            : null;
          const daysSinceAssessment = lastAssessmentDate
            ? Math.floor((now.getTime() - lastAssessmentDate.getTime()) / (1000 * 60 * 60 * 24))
            : 999;

          // Should have assessment at least every 30 days if on active treatment
          if (hasActivePlan && daysSinceAssessment > 30) {
            const gapKey = `MISSING_ASSESSMENT:general`;
            const isNew = !existingGapTypes.has(gapKey);
            const priority = calculateGapPriority('MISSING_ASSESSMENT', daysSinceAssessment, 30);

            if (priority >= minPriority) {
              identifiedGaps.push({
                patientId: patient.id,
                patientName,
                gapType: 'MISSING_ASSESSMENT',
                title: `Overdue for outcome assessment`,
                description: lastAssessmentDate
                  ? `Last assessment was ${daysSinceAssessment} days ago (expected every 30 days)`
                  : `No outcome assessments on record for patient with active treatment plan`,
                priority,
                dueDate: lastAssessmentDate
                  ? new Date(lastAssessmentDate.getTime() + 30 * 24 * 60 * 60 * 1000)
                  : new Date(),
                relatedId: null,
                relatedType: null,
                detectionScore: Math.min(0.95, 0.7 + (daysSinceAssessment / 60) * 0.25),
                existingGapId: patient.careGaps?.find(g => g.gapType === 'MISSING_ASSESSMENT')?.id || null,
                isNew,
              });
            }
          }
        }

        // 5. LAPSED_PATIENT - No visits in extended period
        if (!gapTypes || gapTypes.includes('LAPSED_PATIENT')) {
          const lastCompletedAppt = patient.appointments.find(a => a.status === 'COMPLETED');
          const daysSinceLastVisit = lastCompletedAppt
            ? Math.floor((now.getTime() - lastCompletedAppt.startTime.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          // No upcoming appointments scheduled
          const hasUpcoming = patient.appointments.some(a =>
            a.status === 'SCHEDULED' && a.startTime > now
          );

          // Lapsed if no visit in 60+ days and no upcoming
          if (daysSinceLastVisit && daysSinceLastVisit > 60 && !hasUpcoming) {
            const gapKey = `LAPSED_PATIENT:general`;
            const isNew = !existingGapTypes.has(gapKey);
            const priority = calculateGapPriority('LAPSED_PATIENT', daysSinceLastVisit, 60);

            if (priority >= minPriority) {
              identifiedGaps.push({
                patientId: patient.id,
                patientName,
                gapType: 'LAPSED_PATIENT',
                title: `Lapsed patient - ${daysSinceLastVisit} days since last visit`,
                description: `Patient has not visited in ${daysSinceLastVisit} days and has no upcoming appointments scheduled.`,
                priority,
                dueDate: new Date(now.getTime() - (daysSinceLastVisit - 60) * 24 * 60 * 60 * 1000),
                relatedId: null,
                relatedType: null,
                detectionScore: Math.min(0.99, 0.6 + (daysSinceLastVisit / 180) * 0.4),
                existingGapId: patient.careGaps?.find(g => g.gapType === 'LAPSED_PATIENT')?.id || null,
                isNew,
              });
            }
          }
        }

        // 6. OVERDUE_RECALL - Due for maintenance/recall visit
        if (!gapTypes || gapTypes.includes('OVERDUE_RECALL')) {
          // Check for completed treatment plans that should have recall
          const completedPlans = await ctx.prisma.treatmentPlan.findMany({
            where: {
              patientId: patient.id,
              organizationId: ctx.user.organizationId,
              status: 'COMPLETED',
            },
            orderBy: { endDate: 'desc' },
            take: 1,
          });

          if (completedPlans.length > 0) {
            const lastPlan = completedPlans[0];
            const planEndDate = lastPlan.endDate || lastPlan.updatedAt;
            const daysSincePlanEnd = Math.floor((now.getTime() - planEndDate.getTime()) / (1000 * 60 * 60 * 24));

            // Should have recall/maintenance every 60-90 days after completing treatment
            if (daysSincePlanEnd > 60) {
              const hasUpcoming = patient.appointments.some(a =>
                a.status === 'SCHEDULED' && a.startTime > now
              );

              if (!hasUpcoming) {
                const gapKey = `OVERDUE_RECALL:${lastPlan.id}`;
                const isNew = !existingGapTypes.has(gapKey);
                const priority = calculateGapPriority('OVERDUE_RECALL', daysSincePlanEnd, 60);

                if (priority >= minPriority) {
                  identifiedGaps.push({
                    patientId: patient.id,
                    patientName,
                    gapType: 'OVERDUE_RECALL',
                    title: `Due for maintenance/recall visit`,
                    description: `${daysSincePlanEnd} days since completing treatment plan. Recommended recall interval: 60-90 days.`,
                    priority,
                    dueDate: new Date(planEndDate.getTime() + 60 * 24 * 60 * 60 * 1000),
                    relatedId: lastPlan.id,
                    relatedType: 'treatmentPlan',
                    detectionScore: Math.min(0.9, 0.6 + (daysSincePlanEnd / 120) * 0.3),
                    existingGapId: patient.careGaps?.find(g => g.gapType === 'OVERDUE_RECALL' && g.treatmentPlanId === lastPlan.id)?.id || null,
                    isNew,
                  });
                }
              }
            }
          }
        }
      }

      // Sort gaps by priority (highest first) and then by detection score
      identifiedGaps.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.detectionScore - a.detectionScore;
      });

      // Create CareGap records for new gaps if requested
      const createdGaps: string[] = [];
      if (createRecords) {
        for (const gap of identifiedGaps.filter(g => g.isNew)) {
          const created = await ctx.prisma.careGap.create({
            data: {
              organizationId: ctx.user.organizationId,
              patientId: gap.patientId,
              gapType: gap.gapType as any,
              status: 'IDENTIFIED',
              title: gap.title,
              description: gap.description,
              priority: gap.priority,
              dueDate: gap.dueDate,
              treatmentPlanId: gap.relatedType === 'treatmentPlan' ? gap.relatedId : null,
              appointmentId: gap.relatedType === 'appointment' ? gap.relatedId : null,
              detectedBy: 'aiCare.identifyGaps',
              detectionScore: gap.detectionScore,
              detectionData: {
                timestamp: now.toISOString(),
                userId: ctx.user.id,
              },
            },
          });
          createdGaps.push(created.id);

          // Create CareCoordinatorAction record
          await ctx.prisma.careCoordinatorAction.create({
            data: {
              organizationId: ctx.user.organizationId,
              patientId: gap.patientId,
              actionType: 'GAP_IDENTIFIED',
              title: `Identified care gap: ${gap.gapType}`,
              description: gap.description,
              result: 'success',
              careGapId: created.id,
              aiInitiated: true,
              aiConfidence: gap.detectionScore,
              aiReasoning: `Detected ${gap.gapType} gap with priority ${gap.priority}/10`,
            },
          });
        }
      }

      // Log audit
      await auditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'AI_CARE_GAP_IDENTIFY',
        resourceType: 'CareGap',
        details: {
          totalPatientsScanned: patients.length,
          totalGapsFound: identifiedGaps.length,
          newGapsCreated: createdGaps.length,
          gapsByType: identifiedGaps.reduce((acc, g) => {
            acc[g.gapType] = (acc[g.gapType] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
      });

      return {
        totalPatientsScanned: patients.length,
        totalGapsFound: identifiedGaps.length,
        newGapsCreated: createdGaps.length,
        gaps: identifiedGaps,
        summary: {
          byType: identifiedGaps.reduce((acc, g) => {
            acc[g.gapType] = (acc[g.gapType] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          byPriority: {
            critical: identifiedGaps.filter(g => g.priority >= 9).length,
            high: identifiedGaps.filter(g => g.priority >= 7 && g.priority < 9).length,
            medium: identifiedGaps.filter(g => g.priority >= 4 && g.priority < 7).length,
            low: identifiedGaps.filter(g => g.priority < 4).length,
          },
          newVsExisting: {
            new: identifiedGaps.filter(g => g.isNew).length,
            existing: identifiedGaps.filter(g => !g.isNew).length,
          },
        },
      };
    }),

  // Get overdue follow-up patients
  getOverdueFollowups: protectedProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        minDaysOverdue: z.number().default(7),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, minDaysOverdue, limit } = input;
      const now = new Date();
      const overdueThreshold = new Date(now.getTime() - minDaysOverdue * 24 * 60 * 60 * 1000);

      // Find active treatment plans with no recent encounters
      const overduePlans = await ctx.prisma.treatmentPlan.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
          ...(providerId ? { providerId } : {}),
          encounters: {
            none: {
              encounterDate: { gte: overdueThreshold },
              status: 'COMPLETED',
            },
          },
        },
        take: limit,
        include: {
          patient: {
            include: {
              demographics: {
                select: { firstName: true, lastName: true, phone: true, email: true },
              },
              appointments: {
                where: {
                  status: 'SCHEDULED',
                  startTime: { gt: now },
                },
                orderBy: { startTime: 'asc' },
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
            orderBy: { encounterDate: 'desc' },
            take: 1,
            select: { encounterDate: true },
          },
        },
      });

      return overduePlans.map(plan => {
        const lastVisit = plan.encounters[0]?.encounterDate;
        const daysSinceVisit = lastVisit
          ? Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const hasUpcomingAppt = plan.patient.appointments.length > 0;

        return {
          patientId: plan.patientId,
          patientName: getPatientName(plan.patient),
          phone: plan.patient.demographics?.phone,
          email: plan.patient.demographics?.email,
          treatmentPlanId: plan.id,
          treatmentPlanName: plan.name,
          providerId: plan.providerId,
          providerName: plan.provider?.user
            ? `${plan.provider.user.firstName} ${plan.provider.user.lastName}`
            : 'Unknown',
          lastVisitDate: lastVisit,
          daysSinceVisit,
          hasUpcomingAppointment: hasUpcomingAppt,
          nextAppointmentDate: plan.patient.appointments[0]?.startTime || null,
          frequency: plan.frequency,
          urgency: daysSinceVisit && daysSinceVisit > 30 ? 'HIGH'
            : daysSinceVisit && daysSinceVisit > 14 ? 'MEDIUM'
            : 'LOW',
        };
      });
    }),

  // Get patients with incomplete treatment plans
  getIncompleteTreatments: protectedProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        maxCompletionRate: z.number().min(0).max(1).default(0.5),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, maxCompletionRate, limit } = input;
      const now = new Date();

      const plans = await ctx.prisma.treatmentPlan.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
          ...(providerId ? { providerId } : {}),
          plannedVisits: { gt: 0 },
        },
        take: limit * 2, // Get extra to filter by completion rate
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
              user: { select: { firstName: true, lastName: true } },
            },
          },
          encounters: {
            where: { status: 'COMPLETED' },
            select: { id: true },
          },
          goals: {
            select: { id: true, name: true, status: true, progress: true },
          },
        },
      });

      const incompletePlans = plans
        .map(plan => {
          const completedVisits = plan.encounters.length;
          const plannedVisits = plan.plannedVisits || 1;
          const completionRate = completedVisits / plannedVisits;

          // Calculate time elapsed
          const planDuration = plan.endDate
            ? (plan.endDate.getTime() - plan.startDate.getTime()) / (1000 * 60 * 60 * 24)
            : 90;
          const daysElapsed = (now.getTime() - plan.startDate.getTime()) / (1000 * 60 * 60 * 24);
          const expectedCompletionRate = Math.min(1, daysElapsed / planDuration);

          // Calculate goal progress
          const totalGoals = plan.goals.length;
          const achievedGoals = plan.goals.filter(g => g.status === 'ACHIEVED').length;
          const avgGoalProgress = totalGoals > 0
            ? plan.goals.reduce((sum, g) => sum + (g.progress || 0), 0) / totalGoals
            : 0;

          return {
            patientId: plan.patientId,
            patientName: getPatientName(plan.patient),
            treatmentPlanId: plan.id,
            treatmentPlanName: plan.name,
            providerId: plan.providerId,
            providerName: plan.provider?.user
              ? `${plan.provider.user.firstName} ${plan.provider.user.lastName}`
              : 'Unknown',
            startDate: plan.startDate,
            endDate: plan.endDate,
            plannedVisits,
            completedVisits,
            completionRate,
            expectedCompletionRate,
            behindBy: Math.round((expectedCompletionRate - completionRate) * plannedVisits),
            totalGoals,
            achievedGoals,
            avgGoalProgress,
            riskLevel: completionRate < expectedCompletionRate * 0.3 ? 'CRITICAL'
              : completionRate < expectedCompletionRate * 0.5 ? 'HIGH'
              : completionRate < expectedCompletionRate * 0.75 ? 'MEDIUM'
              : 'LOW',
          };
        })
        .filter(p => p.completionRate <= maxCompletionRate)
        .sort((a, b) => a.completionRate - b.completionRate)
        .slice(0, limit);

      return incompletePlans;
    }),

  // Get patients missing outcome assessments
  getMissingAssessments: protectedProcedure
    .input(
      z.object({
        assessmentType: z.string().optional(),
        minDaysSinceAssessment: z.number().default(30),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { assessmentType, minDaysSinceAssessment, limit } = input;
      const now = new Date();
      const threshold = new Date(now.getTime() - minDaysSinceAssessment * 24 * 60 * 60 * 1000);

      // Get patients with active treatment plans
      const patients = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          treatmentPlans: {
            some: { status: 'ACTIVE' },
          },
        },
        take: limit * 2,
        include: {
          demographics: {
            select: { firstName: true, lastName: true },
          },
          treatmentPlans: {
            where: { status: 'ACTIVE' },
            select: { id: true, name: true },
          },
          encounters: {
            orderBy: { encounterDate: 'desc' },
            take: 10,
            include: {
              outcomeAssessments: {
                ...(assessmentType ? { where: { type: assessmentType } } : {}),
                orderBy: { assessmentDate: 'desc' },
              },
            },
          },
        },
      });

      const missingAssessments = patients
        .map(patient => {
          const allAssessments = patient.encounters.flatMap(e => e.outcomeAssessments);
          const lastAssessment = allAssessments.length > 0
            ? allAssessments.reduce((latest, a) =>
                a.assessmentDate > latest.assessmentDate ? a : latest
              )
            : null;

          const daysSinceAssessment = lastAssessment
            ? Math.floor((now.getTime() - lastAssessment.assessmentDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          return {
            patientId: patient.id,
            patientName: getPatientName(patient),
            activeTreatmentPlans: patient.treatmentPlans.map(p => ({
              id: p.id,
              name: p.name,
            })),
            lastAssessmentDate: lastAssessment?.assessmentDate || null,
            lastAssessmentType: lastAssessment?.type || null,
            lastAssessmentScore: lastAssessment?.score || null,
            daysSinceAssessment,
            totalAssessmentsOnRecord: allAssessments.length,
            needsAssessment: !lastAssessment || daysSinceAssessment! > minDaysSinceAssessment,
            urgency: !lastAssessment ? 'HIGH'
              : daysSinceAssessment! > 60 ? 'HIGH'
              : daysSinceAssessment! > 45 ? 'MEDIUM'
              : 'LOW',
          };
        })
        .filter(p => p.needsAssessment)
        .sort((a, b) => (b.daysSinceAssessment || 999) - (a.daysSinceAssessment || 999))
        .slice(0, limit);

      return missingAssessments;
    }),

  // Get lapsed patients
  getLapsedPatients: protectedProcedure
    .input(
      z.object({
        minDaysLapsed: z.number().default(60),
        maxDaysLapsed: z.number().default(365),
        excludeCompletedPlans: z.boolean().default(false),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { minDaysLapsed, maxDaysLapsed, excludeCompletedPlans, limit } = input;
      const now = new Date();
      const minThreshold = new Date(now.getTime() - maxDaysLapsed * 24 * 60 * 60 * 1000);
      const maxThreshold = new Date(now.getTime() - minDaysLapsed * 24 * 60 * 60 * 1000);

      // Find patients with last completed appointment in the lapsed window
      const lapsedPatients = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          appointments: {
            some: {
              status: 'COMPLETED',
              startTime: {
                gte: minThreshold,
                lte: maxThreshold,
              },
            },
            none: {
              status: 'SCHEDULED',
              startTime: { gt: now },
            },
          },
          ...(excludeCompletedPlans
            ? {
                treatmentPlans: {
                  none: {
                    status: 'COMPLETED',
                    endDate: { gte: maxThreshold },
                  },
                },
              }
            : {}),
        },
        take: limit,
        include: {
          demographics: {
            select: { firstName: true, lastName: true, phone: true, email: true },
          },
          appointments: {
            where: { status: 'COMPLETED' },
            orderBy: { startTime: 'desc' },
            take: 1,
          },
          treatmentPlans: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: { id: true, name: true, status: true },
          },
          careOutreaches: {
            where: { type: 'REACTIVATION' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      return lapsedPatients.map(patient => {
        const lastVisit = patient.appointments[0]?.startTime;
        const daysSinceVisit = lastVisit
          ? Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const lastOutreach = patient.careOutreaches[0];

        return {
          patientId: patient.id,
          patientName: getPatientName(patient),
          phone: patient.demographics?.phone,
          email: patient.demographics?.email,
          lastVisitDate: lastVisit,
          daysSinceVisit,
          lastTreatmentPlan: patient.treatmentPlans[0] || null,
          lastReactivationOutreach: lastOutreach
            ? {
                date: lastOutreach.createdAt,
                status: lastOutreach.status,
                responded: !!lastOutreach.respondedAt,
              }
            : null,
          reactivationPriority: daysSinceVisit && daysSinceVisit > 180 ? 'LOW'
            : daysSinceVisit && daysSinceVisit > 120 ? 'MEDIUM'
            : 'HIGH',
          suggestedAction: !lastOutreach || (lastOutreach.createdAt < maxThreshold)
            ? 'SEND_REACTIVATION'
            : lastOutreach.status === 'SENT' && !lastOutreach.respondedAt
            ? 'FOLLOW_UP_CALL'
            : 'MONITOR',
        };
      });
    }),

  // Get condition-specific care gaps
  getConditionSpecificGaps: protectedProcedure
    .input(
      z.object({
        conditionCode: z.string().optional(), // ICD-10 code filter
        conditionCategory: z.enum(['ACUTE', 'CHRONIC', 'MAINTENANCE', 'WELLNESS']).optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { conditionCode, conditionCategory, limit } = input;
      const now = new Date();

      // Get patients with diagnoses matching the condition
      const encounters = await ctx.prisma.encounter.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          diagnoses: {
            some: {
              ...(conditionCode ? { code: { contains: conditionCode } } : {}),
            },
          },
        },
        orderBy: { encounterDate: 'desc' },
        take: limit * 3,
        include: {
          patient: {
            include: {
              demographics: {
                select: { firstName: true, lastName: true },
              },
              treatmentPlans: {
                where: { status: 'ACTIVE' },
              },
              appointments: {
                where: {
                  status: 'SCHEDULED',
                  startTime: { gt: now },
                },
                orderBy: { startTime: 'asc' },
                take: 1,
              },
            },
          },
          diagnoses: true,
        },
      });

      // Group by patient and analyze gaps based on condition
      const patientMap = new Map<string, typeof encounters[0]>();
      for (const enc of encounters) {
        if (!patientMap.has(enc.patientId)) {
          patientMap.set(enc.patientId, enc);
        }
      }

      const conditionGaps = Array.from(patientMap.values())
        .map(enc => {
          const diagnosis = enc.diagnoses[0];
          const daysSinceEncounter = Math.floor(
            (now.getTime() - enc.encounterDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Determine expected follow-up based on condition characteristics
          // This is a simplified heuristic - real implementation would use condition-specific protocols
          const isAcute = diagnosis?.code?.startsWith('S') || diagnosis?.code?.startsWith('M54');
          const isChronic = diagnosis?.code?.startsWith('M') && !isAcute;

          let expectedFollowupDays: number;
          let conditionType: string;

          if (isAcute) {
            expectedFollowupDays = 7;
            conditionType = 'ACUTE';
          } else if (isChronic) {
            expectedFollowupDays = 14;
            conditionType = 'CHRONIC';
          } else {
            expectedFollowupDays = 30;
            conditionType = 'MAINTENANCE';
          }

          // Filter by condition category if specified
          if (conditionCategory && conditionType !== conditionCategory) {
            return null;
          }

          const isOverdue = daysSinceEncounter > expectedFollowupDays;
          const hasUpcoming = enc.patient.appointments.length > 0;
          const hasActivePlan = enc.patient.treatmentPlans.length > 0;

          if (!isOverdue || hasUpcoming) {
            return null;
          }

          return {
            patientId: enc.patientId,
            patientName: getPatientName(enc.patient),
            conditionCode: diagnosis?.code,
            conditionDescription: diagnosis?.description,
            conditionType,
            lastEncounterDate: enc.encounterDate,
            daysSinceEncounter,
            expectedFollowupDays,
            daysOverdue: daysSinceEncounter - expectedFollowupDays,
            hasActiveTreatmentPlan: hasActivePlan,
            hasUpcomingAppointment: hasUpcoming,
            recommendedAction: !hasActivePlan
              ? 'CREATE_TREATMENT_PLAN'
              : daysSinceEncounter > expectedFollowupDays * 2
              ? 'URGENT_OUTREACH'
              : 'SCHEDULE_FOLLOWUP',
            priority: daysSinceEncounter > expectedFollowupDays * 3 ? 10
              : daysSinceEncounter > expectedFollowupDays * 2 ? 8
              : daysSinceEncounter > expectedFollowupDays * 1.5 ? 6
              : 4,
          };
        })
        .filter((g): g is NonNullable<typeof g> => g !== null)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, limit);

      return conditionGaps;
    }),

  // Auto-generate outreach tasks for care gaps
  generateOutreachTasks: protectedProcedure
    .input(
      z.object({
        gapIds: z.array(z.string()).optional(), // Specific gaps to process
        gapTypes: z.array(z.string()).optional(),
        minPriority: z.number().min(1).max(10).default(5),
        maxTasks: z.number().min(1).max(50).default(20),
        scheduleOutreach: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { gapIds, gapTypes, minPriority, maxTasks, scheduleOutreach } = input;

      // Get unaddressed care gaps
      const gaps = await ctx.prisma.careGap.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['IDENTIFIED', 'ESCALATED'] },
          priority: { gte: minPriority },
          ...(gapIds ? { id: { in: gapIds } } : {}),
          ...(gapTypes ? { gapType: { in: gapTypes as any } } : {}),
        },
        take: maxTasks,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          patient: {
            include: {
              demographics: {
                select: { firstName: true, lastName: true, phone: true, email: true },
              },
              communicationPreferences: true,
            },
          },
        },
      });

      const tasks: Array<{
        gapId: string;
        patientId: string;
        patientName: string;
        outreachType: string;
        channel: string;
        scheduledAt: Date;
        message: string;
        outreachId: string | null;
      }> = [];

      const now = new Date();

      for (const gap of gaps) {
        const patientName = getPatientName(gap.patient);
        const firstName = gap.patient.demographics?.firstName || 'there';

        // Determine outreach type based on gap type
        let outreachType: CareOutreachType;
        let message: string;

        switch (gap.gapType) {
          case 'OVERDUE_FOLLOWUP':
            outreachType = 'FOLLOWUP_SCHEDULING';
            message = `Hi ${firstName}, we noticed it's been a while since your last visit. We'd like to schedule a follow-up to check on your progress. Please call us or reply to schedule your next appointment.`;
            break;
          case 'MISSED_APPOINTMENT':
            outreachType = 'FOLLOWUP_SCHEDULING';
            message = `Hi ${firstName}, we missed you at your recent appointment. Your health is important to us - please call or reply to reschedule at your earliest convenience.`;
            break;
          case 'LAPSED_PATIENT':
            outreachType = 'REACTIVATION';
            message = `Hi ${firstName}, we hope you're doing well! It's been a while since we've seen you. If you're experiencing any issues or would like a check-up, we'd love to have you back. Reply or call to schedule.`;
            break;
          case 'MISSING_ASSESSMENT':
            outreachType = 'OUTCOME_ASSESSMENT';
            message = `Hi ${firstName}, we'd like to track your progress with a quick assessment at your next visit. This helps us ensure your treatment is on track. Please schedule your next appointment.`;
            break;
          case 'OVERDUE_RECALL':
            outreachType = 'RECALL_REMINDER';
            message = `Hi ${firstName}, you're due for your maintenance visit. Regular check-ups help maintain your progress. Call or reply to schedule your appointment.`;
            break;
          default:
            outreachType = 'CARE_GAP_NOTIFICATION';
            message = `Hi ${firstName}, we'd like to follow up with you about your care. Please contact us to schedule your next appointment.`;
        }

        // Determine preferred channel
        const prefs = gap.patient.communicationPreferences;
        const prefersSMS = prefs?.find(p => p.channel === 'sms' && p.optIn);
        const prefersEmail = prefs?.find(p => p.channel === 'email' && p.optIn);
        const channel = prefersSMS ? 'sms' : prefersEmail ? 'email' : 'sms';

        // Schedule outreach for tomorrow morning by default
        const scheduledAt = new Date(now);
        scheduledAt.setDate(scheduledAt.getDate() + 1);
        scheduledAt.setHours(9, 0, 0, 0);

        let outreachId: string | null = null;

        if (scheduleOutreach) {
          // Create outreach record
          const outreach = await ctx.prisma.careOutreach.create({
            data: {
              organizationId: ctx.user.organizationId,
              patientId: gap.patientId,
              type: outreachType,
              status: 'SCHEDULED',
              scheduledAt,
              channel,
              content: message,
              personalizationData: {
                gapType: gap.gapType,
                gapPriority: gap.priority,
              },
            },
          });
          outreachId = outreach.id;

          // Update gap status
          await ctx.prisma.careGap.update({
            where: { id: gap.id },
            data: {
              status: 'OUTREACH_SCHEDULED',
              outreachCount: { increment: 1 },
              nextOutreachAt: scheduledAt,
            },
          });

          // Create action record
          await ctx.prisma.careCoordinatorAction.create({
            data: {
              organizationId: ctx.user.organizationId,
              patientId: gap.patientId,
              actionType: 'TASK_CREATED',
              title: `Scheduled ${outreachType} outreach`,
              description: `Auto-generated outreach task for ${gap.gapType} care gap`,
              result: 'success',
              careGapId: gap.id,
              outreachId: outreach.id,
              aiInitiated: true,
              aiReasoning: `Gap priority ${gap.priority}/10 triggered automatic outreach scheduling`,
            },
          });
        }

        tasks.push({
          gapId: gap.id,
          patientId: gap.patientId,
          patientName,
          outreachType,
          channel,
          scheduledAt,
          message,
          outreachId,
        });
      }

      // Log audit
      await auditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'AI_CARE_OUTREACH_RECOMMEND',
        resourceType: 'CareOutreach',
        details: {
          gapsProcessed: gaps.length,
          tasksGenerated: tasks.length,
          outreachScheduled: scheduleOutreach,
        },
      });

      return {
        gapsProcessed: gaps.length,
        tasksGenerated: tasks.length,
        tasks,
      };
    }),

  // Get prioritized care gaps summary
  getCareGapsSummary: protectedProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        includeResolved: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, includeResolved } = input;

      // Build base where clause
      const whereBase: Prisma.CareGapWhereInput = {
        organizationId: ctx.user.organizationId,
        ...(includeResolved ? {} : { status: { not: 'RESOLVED' } }),
      };

      // Get counts by type and priority
      const gapsByType = await ctx.prisma.careGap.groupBy({
        by: ['gapType'],
        where: whereBase,
        _count: true,
      });

      const gapsByStatus = await ctx.prisma.careGap.groupBy({
        by: ['status'],
        where: whereBase,
        _count: true,
      });

      const gapsByPriority = await ctx.prisma.careGap.groupBy({
        by: ['priority'],
        where: whereBase,
        _count: true,
      });

      // Get critical gaps (priority >= 8)
      const criticalGaps = await ctx.prisma.careGap.findMany({
        where: {
          ...whereBase,
          priority: { gte: 8 },
        },
        take: 10,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          patient: {
            include: {
              demographics: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });

      // Get recent resolutions
      const recentResolutions = await ctx.prisma.careGap.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'RESOLVED',
          resolvedDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        take: 5,
        orderBy: { resolvedDate: 'desc' },
      });

      // Calculate totals
      const totalOpen = gapsByStatus
        .filter(g => g.status !== 'RESOLVED' && g.status !== 'DISMISSED')
        .reduce((sum, g) => sum + g._count, 0);

      const priorityCounts = {
        critical: gapsByPriority.filter(g => g.priority >= 9).reduce((sum, g) => sum + g._count, 0),
        high: gapsByPriority.filter(g => g.priority >= 7 && g.priority < 9).reduce((sum, g) => sum + g._count, 0),
        medium: gapsByPriority.filter(g => g.priority >= 4 && g.priority < 7).reduce((sum, g) => sum + g._count, 0),
        low: gapsByPriority.filter(g => g.priority < 4).reduce((sum, g) => sum + g._count, 0),
      };

      return {
        totalOpenGaps: totalOpen,
        byType: Object.fromEntries(gapsByType.map(g => [g.gapType, g._count])),
        byStatus: Object.fromEntries(gapsByStatus.map(g => [g.status, g._count])),
        byPriority: priorityCounts,
        criticalGaps: criticalGaps.map(g => ({
          id: g.id,
          patientId: g.patientId,
          patientName: getPatientName(g.patient),
          gapType: g.gapType,
          title: g.title,
          priority: g.priority,
          dueDate: g.dueDate,
          daysSinceIdentified: Math.floor(
            (Date.now() - g.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          ),
        })),
        recentResolutions: recentResolutions.length,
        resolutionRate: totalOpen > 0
          ? Math.round((recentResolutions.length / (totalOpen + recentResolutions.length)) * 100)
          : 100,
      };
    }),
});

// Helper function to calculate gap priority based on type and severity
function calculateGapPriority(gapType: string, value: number, threshold: number): number {
  const ratio = value / threshold;

  let basePriority: number;
  switch (gapType) {
    case 'MISSED_APPOINTMENT':
      basePriority = 7;
      break;
    case 'OVERDUE_FOLLOWUP':
      basePriority = 6;
      break;
    case 'INCOMPLETE_TREATMENT':
      basePriority = 6;
      break;
    case 'LAPSED_PATIENT':
      basePriority = 5;
      break;
    case 'MISSING_ASSESSMENT':
      basePriority = 4;
      break;
    case 'OVERDUE_RECALL':
      basePriority = 4;
      break;
    case 'MISSED_MILESTONE':
      basePriority = 5;
      break;
    default:
      basePriority = 5;
  }

  // Adjust priority based on how far past threshold
  if (ratio >= 3) return Math.min(10, basePriority + 3);
  if (ratio >= 2) return Math.min(10, basePriority + 2);
  if (ratio >= 1.5) return Math.min(10, basePriority + 1);
  return basePriority;
}
