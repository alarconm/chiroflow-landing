import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { auditLog } from '@/lib/audit';
import type { CareOutreachType, Prisma } from '@prisma/client';

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
});
