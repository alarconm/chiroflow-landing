/**
 * Epic 35: AI Revenue Optimizer Agent - Router
 *
 * tRPC router for AI-powered revenue optimization capabilities.
 * Provides leakage detection, fee schedule analysis, service mix optimization,
 * coding optimization, contract analysis, and revenue forecasting.
 */

import { z } from 'zod';
import { router, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================
// Types
// ============================================

type LeakageType =
  | 'unbilled_service'
  | 'undercoding'
  | 'missed_modifier'
  | 'unbilled_supplies'
  | 'write_off'
  | 'collection_issue';

interface LeakageDetail {
  type: LeakageType;
  source: string;
  description: string;
  amount: number;
  frequency: string;
  annualImpact: number;
  entityType?: string;
  entityId?: string;
  cptCode?: string;
  payerName?: string;
  providerId?: string;
  recommendation: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  effortLevel: 'easy' | 'moderate' | 'complex';
}

interface LeakageSummary {
  totalLeakage: number;
  annualizedLeakage: number;
  byCategory: Record<LeakageType, { count: number; amount: number; annualImpact: number }>;
  topOpportunities: LeakageDetail[];
  quickWins: LeakageDetail[];
}

// ============================================
// Input Schemas
// ============================================

const detectLeakageInputSchema = z.object({
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  providerId: z.string().optional(),
  payerId: z.string().optional(),
  categories: z
    .array(
      z.enum([
        'unbilled_service',
        'undercoding',
        'missed_modifier',
        'unbilled_supplies',
        'write_off',
        'collection_issue',
      ])
    )
    .optional(),
  minAmount: z.number().optional(),
  includeResolved: z.boolean().default(false),
});

const resolveLeakageInputSchema = z.object({
  leakageId: z.string(),
  resolution: z.string(),
  capturedAmount: z.number().optional(),
});

// ============================================
// Helper Functions
// ============================================

function calculateAnnualImpact(amount: number, frequency: string): number {
  switch (frequency) {
    case 'daily':
      return amount * 260; // ~260 working days
    case 'weekly':
      return amount * 52;
    case 'monthly':
      return amount * 12;
    case 'quarterly':
      return amount * 4;
    case 'one_time':
      return amount;
    default:
      return amount * 12; // Assume monthly as default
  }
}

function determinePriority(amount: number, frequency: string): 'low' | 'medium' | 'high' | 'critical' {
  const annualImpact = calculateAnnualImpact(amount, frequency);
  if (annualImpact >= 10000) return 'critical';
  if (annualImpact >= 5000) return 'high';
  if (annualImpact >= 1000) return 'medium';
  return 'low';
}

// ============================================
// Router
// ============================================

export const aiRevenueRouter = router({
  // ============================================
  // US-340: Revenue Leakage Detection
  // ============================================

  /**
   * Detect revenue leakage across the organization
   * Analyzes unbilled services, undercoding, missed modifiers,
   * unbilled supplies, write-offs, and collection issues
   */
  detectLeakage: billerProcedure.input(detectLeakageInputSchema).mutation(async ({ ctx, input }) => {
    const { dateFrom, dateTo, providerId, categories, minAmount } = input;
    const organizationId = ctx.user.organizationId;

    // Default date range: last 90 days
    const endDate = dateTo || new Date();
    const startDate = dateFrom || new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

    const leakages: LeakageDetail[] = [];

    // ============================================
    // 1. Unbilled Services Detection
    // ============================================
    if (!categories || categories.includes('unbilled_service')) {
      // Find completed encounters without associated charges
      const unbilledEncounters = await ctx.prisma.encounter.findMany({
        where: {
          organizationId,
          status: 'COMPLETED',
          encounterDate: {
            gte: startDate,
            lte: endDate,
          },
          ...(providerId && { providerId }),
          charges: {
            none: {},
          },
        },
        include: {
          patient: {
            include: {
              demographics: true,
            },
          },
          provider: true,
          soapNote: true,
        },
        take: 100,
      });

      for (const encounter of unbilledEncounters) {
        // Estimate value based on encounter type and typical billing
        const estimatedValue = encounter.encounterType === 'INITIAL_EVAL' ? 150 : 85;
        const patientName = encounter.patient.demographics
          ? `${encounter.patient.demographics.firstName} ${encounter.patient.demographics.lastName}`
          : `Patient ${encounter.patient.mrn}`;

        leakages.push({
          type: 'unbilled_service',
          source: 'Completed encounters',
          description: `Encounter on ${encounter.encounterDate.toLocaleDateString()} for ${patientName} has no charges`,
          amount: estimatedValue,
          frequency: 'one_time',
          annualImpact: estimatedValue,
          entityType: 'Encounter',
          entityId: encounter.id,
          providerId: encounter.providerId,
          recommendation: 'Review encounter documentation and create appropriate charges',
          priority: determinePriority(estimatedValue, 'one_time'),
          effortLevel: 'easy',
        });
      }
    }

    // ============================================
    // 2. Undercoding Identification
    // ============================================
    if (!categories || categories.includes('undercoding')) {
      // Find charges that may be undercoded (low-level E&M codes with extensive documentation)
      const potentialUndercoding = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: {
            gte: startDate,
            lte: endDate,
          },
          ...(providerId && { providerId }),
          // Look for basic office visit codes
          cptCode: {
            in: ['99211', '99212', '99201', '99202'],
          },
          status: 'BILLED',
        },
        include: {
          encounter: {
            include: {
              soapNote: true,
              diagnoses: true,
            },
          },
          patient: true,
        },
        take: 100,
      });

      for (const charge of potentialUndercoding) {
        // Check if documentation supports higher level coding
        const hasSoapNote = charge.encounter?.soapNote !== null;
        const diagnosisCount = charge.encounter?.diagnoses?.length || 0;

        if (hasSoapNote && diagnosisCount >= 2) {
          // Potential for higher level code
          const currentFee = Number(charge.fee);
          const potentialFee = charge.cptCode.startsWith('992') ? 120 : 150; // Higher level code
          const difference = potentialFee - currentFee;

          if (difference > 0) {
            leakages.push({
              type: 'undercoding',
              source: 'E&M code analysis',
              description: `Charge ${charge.cptCode} on ${charge.serviceDate.toLocaleDateString()} may qualify for higher level code based on documentation complexity`,
              amount: difference,
              frequency: 'one_time',
              annualImpact: difference,
              entityType: 'Charge',
              entityId: charge.id,
              cptCode: charge.cptCode,
              providerId: charge.providerId || undefined,
              recommendation: `Review documentation to determine if higher level code (99213-99215) is supported`,
              priority: determinePriority(difference, 'one_time'),
              effortLevel: 'moderate',
            });
          }
        }
      }
    }

    // ============================================
    // 3. Missed Modifier Opportunities
    // ============================================
    if (!categories || categories.includes('missed_modifier')) {
      // Find chiropractic adjustments without modifiers that may need them
      const chargesNeedingModifiers = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: {
            gte: startDate,
            lte: endDate,
          },
          ...(providerId && { providerId }),
          // CMT codes that often need modifiers
          cptCode: {
            in: ['98940', '98941', '98942', '98943'],
          },
          modifiers: {
            isEmpty: true,
          },
        },
        include: {
          encounter: {
            include: {
              diagnoses: true,
            },
          },
          patient: true,
        },
        take: 100,
      });

      for (const charge of chargesNeedingModifiers) {
        // Check if E&M was billed same day (would need -25 modifier on E&M)
        const sameDayEM = await ctx.prisma.charge.findFirst({
          where: {
            encounterId: charge.encounterId,
            cptCode: {
              in: ['99211', '99212', '99213', '99214', '99215', '99201', '99202', '99203', '99204', '99205'],
            },
            modifiers: {
              has: '-25',
            },
          },
        });

        if (!sameDayEM) {
          // Check if there's an E&M without -25 that should have it
          const emWithoutModifier = await ctx.prisma.charge.findFirst({
            where: {
              encounterId: charge.encounterId,
              cptCode: {
                in: ['99211', '99212', '99213', '99214', '99215', '99201', '99202', '99203', '99204', '99205'],
              },
              modifiers: {
                isEmpty: true,
              },
            },
          });

          if (emWithoutModifier) {
            const potentialIncrease = Number(emWithoutModifier.fee) * 0.25; // E&M often paid 25% less without modifier
            leakages.push({
              type: 'missed_modifier',
              source: 'Modifier analysis',
              description: `E&M code ${emWithoutModifier.cptCode} billed same day as CMT may need -25 modifier for separate service documentation`,
              amount: potentialIncrease,
              frequency: 'one_time',
              annualImpact: potentialIncrease,
              entityType: 'Charge',
              entityId: emWithoutModifier.id,
              cptCode: emWithoutModifier.cptCode,
              providerId: charge.providerId || undefined,
              recommendation: 'Add -25 modifier to E&M code when billing with CMT to indicate separate, identifiable service',
              priority: determinePriority(potentialIncrease, 'one_time'),
              effortLevel: 'easy',
            });
          }
        }
      }
    }

    // ============================================
    // 4. Unbilled Supplies Detection
    // ============================================
    if (!categories || categories.includes('unbilled_supplies')) {
      // Find encounters with procedures that typically use supplies but no supply charges
      const encountersWithProcedures = await ctx.prisma.encounter.findMany({
        where: {
          organizationId,
          encounterDate: {
            gte: startDate,
            lte: endDate,
          },
          ...(providerId && { providerId }),
          status: 'COMPLETED',
          charges: {
            some: {
              // Procedures that typically use supplies
              cptCode: {
                in: [
                  '97140', // Manual therapy
                  '97530', // Therapeutic activities
                  '97110', // Therapeutic exercise
                  '97112', // Neuromuscular re-education
                ],
              },
            },
            none: {
              // No supply codes billed
              cptCode: {
                in: ['99070', 'A4550', 'A4570'], // Supply codes
              },
            },
          },
        },
        include: {
          charges: true,
          patient: true,
        },
        take: 50,
      });

      // Estimate supply usage patterns
      const avgSupplyCharge = 15; // Average supply charge
      const encounterCount = encountersWithProcedures.length;

      if (encounterCount > 10) {
        // Only flag if pattern is significant
        leakages.push({
          type: 'unbilled_supplies',
          source: 'Supply billing analysis',
          description: `${encounterCount} encounters with therapeutic procedures but no supply charges billed`,
          amount: avgSupplyCharge * encounterCount,
          frequency: 'monthly',
          annualImpact: calculateAnnualImpact(avgSupplyCharge * (encounterCount / 3), 'monthly'),
          entityType: 'Pattern',
          recommendation:
            'Review supply usage during therapeutic procedures and implement supply tracking/billing workflow',
          priority: determinePriority(avgSupplyCharge * encounterCount, 'monthly'),
          effortLevel: 'easy',
        });
      }
    }

    // ============================================
    // 5. Write-off Pattern Analysis
    // ============================================
    if (!categories || categories.includes('write_off')) {
      // Analyze write-off/adjustment patterns
      const chargesWithAdjustments = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: {
            gte: startDate,
            lte: endDate,
          },
          adjustments: {
            gt: 0,
          },
        },
        include: {
          claimLines: {
            include: {
              claim: {
                include: {
                  payer: true,
                },
              },
            },
          },
        },
        take: 500,
      });

      // Group by payer and analyze patterns
      const payerWriteoffs: Record<string, { total: number; count: number; charges: number }> = {};

      for (const charge of chargesWithAdjustments) {
        // Get payer from claim lines if available
        const payerName = charge.claimLines?.[0]?.claim?.payer?.name || 'Unknown';
        if (!payerWriteoffs[payerName]) {
          payerWriteoffs[payerName] = { total: 0, count: 0, charges: 0 };
        }
        payerWriteoffs[payerName].total += Number(charge.adjustments);
        payerWriteoffs[payerName].count++;
        payerWriteoffs[payerName].charges += Number(charge.fee);
      }

      // Flag payers with excessive write-off rates
      for (const [payer, data] of Object.entries(payerWriteoffs)) {
        const writeoffRate = data.charges > 0 ? (data.total / data.charges) * 100 : 0;

        if (writeoffRate > 30 && data.count > 10) {
          // Over 30% write-off rate is concerning
          leakages.push({
            type: 'write_off',
            source: 'Write-off pattern analysis',
            description: `${payer} has ${writeoffRate.toFixed(1)}% write-off rate across ${data.count} charges`,
            amount: data.total,
            frequency: 'monthly',
            annualImpact: calculateAnnualImpact(data.total / 3, 'monthly'),
            payerName: payer,
            recommendation: `Review fee schedule alignment with ${payer}. Consider contract renegotiation or fee adjustment.`,
            priority: determinePriority(data.total, 'monthly'),
            effortLevel: 'complex',
          });
        }
      }
    }

    // ============================================
    // 6. Collection Rate Issues
    // ============================================
    if (!categories || categories.includes('collection_issue')) {
      // Find aged receivables
      const agedReceivables = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          status: 'BILLED',
          balance: {
            gt: 0,
          },
          chargeDate: {
            lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // Over 60 days old
          },
        },
        include: {
          patient: true,
          claimLines: {
            include: {
              claim: {
                include: {
                  payer: true,
                },
              },
            },
          },
        },
        take: 200,
      });

      // Group by aging bucket
      const aging: Record<string, { amount: number; count: number }> = {
        '60-90': { amount: 0, count: 0 },
        '90-120': { amount: 0, count: 0 },
        '120+': { amount: 0, count: 0 },
      };

      const now = Date.now();
      for (const charge of agedReceivables) {
        const ageInDays = Math.floor((now - charge.chargeDate.getTime()) / (24 * 60 * 60 * 1000));
        const balance = Number(charge.balance);

        if (ageInDays >= 120) {
          aging['120+'].amount += balance;
          aging['120+'].count++;
        } else if (ageInDays >= 90) {
          aging['90-120'].amount += balance;
          aging['90-120'].count++;
        } else {
          aging['60-90'].amount += balance;
          aging['60-90'].count++;
        }
      }

      // Create leakage entries for significant aging buckets
      for (const [bucket, data] of Object.entries(aging)) {
        if (data.amount > 500) {
          // Only flag significant amounts
          const collectibility = bucket === '120+' ? 0.3 : bucket === '90-120' ? 0.5 : 0.7;
          const expectedLoss = data.amount * (1 - collectibility);

          leakages.push({
            type: 'collection_issue',
            source: 'A/R aging analysis',
            description: `${data.count} charges totaling $${data.amount.toFixed(2)} are ${bucket} days old with declining collectibility`,
            amount: expectedLoss,
            frequency: 'monthly',
            annualImpact: calculateAnnualImpact(expectedLoss, 'monthly'),
            entityType: 'Pattern',
            recommendation: `Implement aggressive follow-up for ${bucket} day aging bucket. Consider collection agency for 120+ days.`,
            priority: bucket === '120+' ? 'critical' : bucket === '90-120' ? 'high' : 'medium',
            effortLevel: 'complex',
          });
        }
      }
    }

    // ============================================
    // Filter and Sort Results
    // ============================================

    // Filter by minimum amount if specified
    let filteredLeakages = minAmount ? leakages.filter((l) => l.amount >= minAmount) : leakages;

    // Sort by priority and amount
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    filteredLeakages.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.annualImpact - a.annualImpact;
    });

    // ============================================
    // Calculate Summary
    // ============================================

    const summary: LeakageSummary = {
      totalLeakage: filteredLeakages.reduce((sum, l) => sum + l.amount, 0),
      annualizedLeakage: filteredLeakages.reduce((sum, l) => sum + l.annualImpact, 0),
      byCategory: {
        unbilled_service: { count: 0, amount: 0, annualImpact: 0 },
        undercoding: { count: 0, amount: 0, annualImpact: 0 },
        missed_modifier: { count: 0, amount: 0, annualImpact: 0 },
        unbilled_supplies: { count: 0, amount: 0, annualImpact: 0 },
        write_off: { count: 0, amount: 0, annualImpact: 0 },
        collection_issue: { count: 0, amount: 0, annualImpact: 0 },
      },
      topOpportunities: filteredLeakages.slice(0, 10),
      quickWins: filteredLeakages.filter((l) => l.effortLevel === 'easy').slice(0, 5),
    };

    for (const leakage of filteredLeakages) {
      summary.byCategory[leakage.type].count++;
      summary.byCategory[leakage.type].amount += leakage.amount;
      summary.byCategory[leakage.type].annualImpact += leakage.annualImpact;
    }

    // ============================================
    // Persist Leakages to Database
    // ============================================

    // Save identified leakages
    for (const leakage of filteredLeakages) {
      await ctx.prisma.revenueLeakage.create({
        data: {
          leakageType: leakage.type,
          source: leakage.source,
          description: leakage.description,
          amount: new Decimal(leakage.amount),
          frequency: leakage.frequency,
          annualImpact: new Decimal(leakage.annualImpact),
          entityType: leakage.entityType,
          entityId: leakage.entityId,
          cptCode: leakage.cptCode,
          payerName: leakage.payerName,
          providerId: leakage.providerId,
          recommendation: leakage.recommendation,
          priority: leakage.priority,
          effortLevel: leakage.effortLevel,
          status: 'identified',
          organizationId,
        },
      });
    }

    return {
      success: true,
      summary,
      leakages: filteredLeakages,
      dateRange: {
        from: startDate,
        to: endDate,
      },
      analyzedAt: new Date(),
    };
  }),

  // ============================================
  // Get Leakage List
  // ============================================

  getLeakages: billerProcedure
    .input(
      z.object({
        status: z.enum(['identified', 'investigating', 'fixing', 'resolved', 'ignored']).optional(),
        type: z
          .enum([
            'unbilled_service',
            'undercoding',
            'missed_modifier',
            'unbilled_supplies',
            'write_off',
            'collection_issue',
          ])
          .optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { status, type, priority, limit, offset } = input;

      const where = {
        organizationId: ctx.user.organizationId,
        ...(status && { status }),
        ...(type && { leakageType: type }),
        ...(priority && { priority }),
      };

      const [leakages, total] = await Promise.all([
        ctx.prisma.revenueLeakage.findMany({
          where,
          orderBy: [{ priority: 'asc' }, { amount: 'desc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.revenueLeakage.count({ where }),
      ]);

      return {
        leakages,
        total,
        hasMore: offset + leakages.length < total,
      };
    }),

  // ============================================
  // Resolve Leakage
  // ============================================

  resolveLeakage: billerProcedure.input(resolveLeakageInputSchema).mutation(async ({ ctx, input }) => {
    const { leakageId, resolution, capturedAmount } = input;

    const leakage = await ctx.prisma.revenueLeakage.findFirst({
      where: {
        id: leakageId,
        organizationId: ctx.user.organizationId,
      },
    });

    if (!leakage) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Leakage not found',
      });
    }

    const updated = await ctx.prisma.revenueLeakage.update({
      where: { id: leakageId },
      data: {
        status: 'resolved',
        resolution,
        resolvedAt: new Date(),
        resolvedBy: ctx.user.id,
      },
    });

    // If revenue was captured, create an optimization action
    if (capturedAmount && capturedAmount > 0) {
      await ctx.prisma.optimizationAction.create({
        data: {
          actionType: 'leakage_resolution',
          action: `Resolved ${leakage.leakageType} leakage: ${resolution}`,
          projectedImpact: new Decimal(leakage.amount),
          actualImpact: new Decimal(capturedAmount),
          status: 'completed',
          completedAt: new Date(),
          completedBy: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });
    }

    return {
      success: true,
      leakage: updated,
    };
  }),

  // ============================================
  // Get Leakage Summary
  // ============================================

  getLeakageSummary: billerProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.user.organizationId;

    // Get open leakages grouped by type
    const leakages = await ctx.prisma.revenueLeakage.findMany({
      where: {
        organizationId,
        status: {
          in: ['identified', 'investigating', 'fixing'],
        },
      },
    });

    const summary = {
      totalOpen: leakages.length,
      totalAmount: leakages.reduce((sum, l) => sum + Number(l.amount), 0),
      totalAnnualImpact: leakages.reduce((sum, l) => sum + Number(l.annualImpact || 0), 0),
      byType: {} as Record<string, { count: number; amount: number }>,
      byPriority: {} as Record<string, { count: number; amount: number }>,
      byStatus: {} as Record<string, { count: number; amount: number }>,
    };

    for (const leakage of leakages) {
      // By type
      if (!summary.byType[leakage.leakageType]) {
        summary.byType[leakage.leakageType] = { count: 0, amount: 0 };
      }
      summary.byType[leakage.leakageType].count++;
      summary.byType[leakage.leakageType].amount += Number(leakage.amount);

      // By priority
      if (!summary.byPriority[leakage.priority]) {
        summary.byPriority[leakage.priority] = { count: 0, amount: 0 };
      }
      summary.byPriority[leakage.priority].count++;
      summary.byPriority[leakage.priority].amount += Number(leakage.amount);

      // By status
      if (!summary.byStatus[leakage.status]) {
        summary.byStatus[leakage.status] = { count: 0, amount: 0 };
      }
      summary.byStatus[leakage.status].count++;
      summary.byStatus[leakage.status].amount += Number(leakage.amount);
    }

    // Get resolved leakages in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentResolutions = await ctx.prisma.revenueLeakage.findMany({
      where: {
        organizationId,
        status: 'resolved',
        resolvedAt: {
          gte: thirtyDaysAgo,
        },
      },
    });

    return {
      ...summary,
      recentResolutions: {
        count: recentResolutions.length,
        amount: recentResolutions.reduce((sum, l) => sum + Number(l.amount), 0),
      },
    };
  }),

  // ============================================
  // US-341: Fee Schedule Optimization
  // ============================================

  /**
   * Analyze fee schedule and recommend optimal pricing
   * Compares to Medicare rates, regional benchmarks, and payer reimbursement patterns
   */
  analyzeFees: billerProcedure
    .input(
      z.object({
        feeScheduleId: z.string().optional(),
        cptCodes: z.array(z.string()).optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        minUtilization: z.number().default(5), // Minimum uses to include in analysis
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { feeScheduleId, cptCodes, dateFrom, dateTo, minUtilization } = input;
      const organizationId = ctx.user.organizationId;

      // Default date range: last 12 months
      const endDate = dateTo || new Date();
      const startDate = dateFrom || new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);

      // Get the fee schedule (default or specified)
      const feeSchedule = await ctx.prisma.feeSchedule.findFirst({
        where: {
          organizationId,
          ...(feeScheduleId ? { id: feeScheduleId } : { isDefault: true }),
        },
        include: {
          items: true,
        },
      });

      if (!feeSchedule) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Fee schedule not found',
        });
      }

      // Medicare rates for common chiropractic codes (2024 national average)
      // In production, this would come from a regularly updated data source
      const MEDICARE_RATES: Record<string, { rate: number; name: string }> = {
        // E&M Codes
        '99201': { rate: 45.0, name: 'Office Visit, New Patient, Level 1' },
        '99202': { rate: 76.0, name: 'Office Visit, New Patient, Level 2' },
        '99203': { rate: 110.0, name: 'Office Visit, New Patient, Level 3' },
        '99204': { rate: 167.0, name: 'Office Visit, New Patient, Level 4' },
        '99205': { rate: 211.0, name: 'Office Visit, New Patient, Level 5' },
        '99211': { rate: 23.0, name: 'Office Visit, Established, Level 1' },
        '99212': { rate: 46.0, name: 'Office Visit, Established, Level 2' },
        '99213': { rate: 77.0, name: 'Office Visit, Established, Level 3' },
        '99214': { rate: 113.0, name: 'Office Visit, Established, Level 4' },
        '99215': { rate: 151.0, name: 'Office Visit, Established, Level 5' },
        // CMT Codes
        '98940': { rate: 28.0, name: 'CMT 1-2 Regions' },
        '98941': { rate: 40.0, name: 'CMT 3-4 Regions' },
        '98942': { rate: 52.0, name: 'CMT 5 Regions' },
        '98943': { rate: 28.0, name: 'CMT Extraspinal' },
        // Therapy Codes
        '97110': { rate: 32.0, name: 'Therapeutic Exercise' },
        '97112': { rate: 35.0, name: 'Neuromuscular Re-education' },
        '97140': { rate: 33.0, name: 'Manual Therapy' },
        '97530': { rate: 38.0, name: 'Therapeutic Activities' },
        '97014': { rate: 14.0, name: 'Electrical Stimulation (unattended)' },
        '97032': { rate: 19.0, name: 'Electrical Stimulation (manual)' },
        '97035': { rate: 15.0, name: 'Ultrasound' },
        // X-ray Codes
        '72040': { rate: 28.0, name: 'X-ray Cervical Spine, 2-3 views' },
        '72050': { rate: 37.0, name: 'X-ray Cervical Spine, 4+ views' },
        '72070': { rate: 26.0, name: 'X-ray Thoracic Spine, 2 views' },
        '72100': { rate: 30.0, name: 'X-ray Lumbar Spine, 2-3 views' },
        '72110': { rate: 40.0, name: 'X-ray Lumbar Spine, 4+ views' },
        // Exam Codes
        '97161': { rate: 88.0, name: 'PT Eval, Low Complexity' },
        '97162': { rate: 108.0, name: 'PT Eval, Moderate Complexity' },
        '97163': { rate: 128.0, name: 'PT Eval, High Complexity' },
      };

      // Regional multiplier (would come from geographic adjustment factors)
      const REGIONAL_MULTIPLIER = 1.05; // 5% above national average

      // Analyze charges to get utilization and reimbursement data
      const chargeAnalysis = await ctx.prisma.charge.groupBy({
        by: ['cptCode'],
        where: {
          organizationId,
          serviceDate: {
            gte: startDate,
            lte: endDate,
          },
          ...(cptCodes && { cptCode: { in: cptCodes } }),
        },
        _count: { id: true },
        _sum: { fee: true, adjustments: true },
        _avg: { fee: true },
      });

      // Get actual reimbursements from claims
      const reimbursementData = await ctx.prisma.claimLine.groupBy({
        by: ['cptCode'],
        where: {
          claim: {
            organizationId,
            status: 'PAID',
            paidDate: {
              gte: startDate,
              lte: endDate,
            },
          },
          ...(cptCodes && { cptCode: { in: cptCodes } }),
        },
        _count: { id: true },
        _sum: { chargedAmount: true, paidAmount: true, allowedAmount: true },
        _avg: { paidAmount: true, allowedAmount: true },
      });

      // Get top payer reimbursements per code
      const payerReimbursements = await ctx.prisma.claimLine.findMany({
        where: {
          claim: {
            organizationId,
            status: 'PAID',
            paidDate: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
        include: {
          claim: {
            include: {
              payer: true,
            },
          },
        },
        take: 5000,
      });

      // Group reimbursements by CPT code and payer
      const payerByCode: Record<string, Record<string, { total: number; count: number }>> = {};
      for (const line of payerReimbursements) {
        const payerName = line.claim.payer?.name || 'Unknown';
        if (!payerByCode[line.cptCode]) {
          payerByCode[line.cptCode] = {};
        }
        if (!payerByCode[line.cptCode][payerName]) {
          payerByCode[line.cptCode][payerName] = { total: 0, count: 0 };
        }
        payerByCode[line.cptCode][payerName].total += Number(line.paidAmount || 0);
        payerByCode[line.cptCode][payerName].count++;
      }

      // Build analysis for each CPT code
      interface FeeAnalysis {
        cptCode: string;
        cptName: string;
        currentFee: number;
        medicareRate: number | null;
        regionalAverage: number | null;
        percentOfMedicare: number | null;
        avgReimbursement: number;
        topPayerRate: number | null;
        topPayerName: string | null;
        utilizationCount: number;
        recommendedFee: number;
        feeChange: number;
        changePercent: number;
        projectedAnnualImpact: number;
        reasoning: string;
        confidence: number;
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      const analyses: FeeAnalysis[] = [];

      // Build a map of current fees from fee schedule
      const currentFees: Record<string, number> = {};
      for (const item of feeSchedule.items) {
        currentFees[item.cptCode] = Number(item.fee);
      }

      // Analyze each CPT code with sufficient utilization
      for (const chargeData of chargeAnalysis) {
        const code = chargeData.cptCode;
        const utilization = chargeData._count.id;

        if (utilization < minUtilization) continue;

        const currentFee = currentFees[code] || Number(chargeData._avg.fee) || 0;
        const medicareData = MEDICARE_RATES[code];
        const medicareRate = medicareData?.rate || null;
        const regionalAverage = medicareRate ? medicareRate * REGIONAL_MULTIPLIER : null;
        const cptName = medicareData?.name || `CPT ${code}`;

        // Get reimbursement data for this code
        const reimbData = reimbursementData.find((r) => r.cptCode === code);
        const avgReimbursement = reimbData?._avg.paidAmount ? Number(reimbData._avg.paidAmount) : 0;
        const avgAllowed = reimbData?._avg.allowedAmount ? Number(reimbData._avg.allowedAmount) : avgReimbursement;

        // Find top paying payer for this code
        let topPayerRate: number | null = null;
        let topPayerName: string | null = null;
        if (payerByCode[code]) {
          for (const [payer, data] of Object.entries(payerByCode[code])) {
            const avgPayerRate = data.total / data.count;
            if (topPayerRate === null || avgPayerRate > topPayerRate) {
              topPayerRate = avgPayerRate;
              topPayerName = payer;
            }
          }
        }

        // Calculate percent of Medicare
        const percentOfMedicare = medicareRate && currentFee > 0 ? (currentFee / medicareRate) * 100 : null;

        // Determine recommended fee and reasoning
        let recommendedFee = currentFee;
        const reasoningParts: string[] = [];
        let confidence = 50; // Base confidence

        // Compare to Medicare benchmark
        if (medicareRate) {
          const idealPercentOfMedicare = 200; // Target 200% of Medicare for cash/standard fee schedule
          const idealFee = medicareRate * (idealPercentOfMedicare / 100);

          if (currentFee < medicareRate * 1.25) {
            // Below 125% of Medicare - significantly underpriced
            recommendedFee = Math.max(recommendedFee, medicareRate * 1.5);
            reasoningParts.push(
              `Current fee is only ${percentOfMedicare?.toFixed(0)}% of Medicare rate ($${medicareRate.toFixed(2)}). Minimum recommended: 150% of Medicare.`
            );
            confidence += 20;
          } else if (currentFee < medicareRate * 1.75) {
            // Below 175% - likely underpriced
            recommendedFee = Math.max(recommendedFee, medicareRate * 1.75);
            reasoningParts.push(
              `Fee is ${percentOfMedicare?.toFixed(0)}% of Medicare. Industry standard for chiropractic is 150-250% of Medicare.`
            );
            confidence += 15;
          } else if (currentFee > medicareRate * 3.0) {
            // Above 300% - may be overpriced
            reasoningParts.push(
              `Fee is ${percentOfMedicare?.toFixed(0)}% of Medicare - higher than typical. Review if justified by market or specialty.`
            );
          }
        }

        // Compare to actual reimbursements
        if (avgReimbursement > 0) {
          if (currentFee < avgReimbursement * 1.2) {
            // Fee is close to what payers actually pay - leaving money on table
            recommendedFee = Math.max(recommendedFee, avgReimbursement * 1.5);
            reasoningParts.push(
              `Current fee ($${currentFee.toFixed(2)}) is close to avg reimbursement ($${avgReimbursement.toFixed(2)}). Raise fee to maximize contractual adjustments.`
            );
            confidence += 15;
          }
        }

        // Compare to top payer rate
        if (topPayerRate && topPayerRate > 0) {
          if (currentFee < topPayerRate * 1.3) {
            recommendedFee = Math.max(recommendedFee, topPayerRate * 1.5);
            reasoningParts.push(
              `Top payer (${topPayerName}) pays $${topPayerRate.toFixed(2)}. Fee should be at least 150% of best reimbursement.`
            );
            confidence += 10;
          }
        }

        // Regional benchmark comparison
        if (regionalAverage) {
          if (recommendedFee < regionalAverage * 1.5) {
            recommendedFee = Math.max(recommendedFee, regionalAverage * 1.75);
            reasoningParts.push(
              `Regional average (based on geographic adjustment) is $${regionalAverage.toFixed(2)}.`
            );
          }
        }

        // Cap confidence at 95
        confidence = Math.min(confidence, 95);

        // If no significant change needed
        if (Math.abs(recommendedFee - currentFee) < 5) {
          recommendedFee = currentFee;
          reasoningParts.push('Current fee is within acceptable range based on benchmarks and reimbursement data.');
        }

        const feeChange = recommendedFee - currentFee;
        const changePercent = currentFee > 0 ? (feeChange / currentFee) * 100 : 0;

        // Calculate projected annual impact
        // Assume fee increase would apply to a portion of payers (cash and some commercial)
        const cashRatio = 0.3; // Assume 30% of volume is cash or fee-schedule sensitive
        const projectedAnnualImpact = feeChange * utilization * cashRatio * (12 / ((endDate.getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)));

        // Determine priority based on impact
        let priority: 'low' | 'medium' | 'high' | 'critical' = 'low';
        if (projectedAnnualImpact >= 5000) priority = 'critical';
        else if (projectedAnnualImpact >= 2000) priority = 'high';
        else if (projectedAnnualImpact >= 500) priority = 'medium';

        analyses.push({
          cptCode: code,
          cptName,
          currentFee,
          medicareRate,
          regionalAverage,
          percentOfMedicare,
          avgReimbursement,
          topPayerRate,
          topPayerName,
          utilizationCount: utilization,
          recommendedFee: Math.round(recommendedFee * 100) / 100,
          feeChange: Math.round(feeChange * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          projectedAnnualImpact: Math.round(projectedAnnualImpact * 100) / 100,
          reasoning: reasoningParts.join(' ') || 'No significant pricing adjustments recommended.',
          confidence,
          priority,
        });
      }

      // Sort by projected impact
      analyses.sort((a, b) => b.projectedAnnualImpact - a.projectedAnnualImpact);

      // Persist analysis results
      for (const analysis of analyses) {
        await ctx.prisma.feeScheduleAnalysis.create({
          data: {
            cptCode: analysis.cptCode,
            cptName: analysis.cptName,
            currentFee: new Decimal(analysis.currentFee),
            recommendedFee: new Decimal(analysis.recommendedFee),
            feeChange: new Decimal(analysis.feeChange),
            changePercent: new Decimal(analysis.changePercent),
            reasoning: analysis.reasoning,
            medicareRate: analysis.medicareRate ? new Decimal(analysis.medicareRate) : null,
            regionalAverage: analysis.regionalAverage ? new Decimal(analysis.regionalAverage) : null,
            percentOfMedicare: analysis.percentOfMedicare ? new Decimal(analysis.percentOfMedicare) : null,
            topPayerRate: analysis.topPayerRate ? new Decimal(analysis.topPayerRate) : null,
            avgReimbursement: analysis.avgReimbursement ? new Decimal(analysis.avgReimbursement) : null,
            utilizationCount: analysis.utilizationCount,
            projectedAnnualImpact: new Decimal(analysis.projectedAnnualImpact),
            confidence: new Decimal(analysis.confidence),
            status: 'pending',
            organizationId,
          },
        });
      }

      // Calculate summary
      const summary = {
        totalCodesAnalyzed: analyses.length,
        codesWithRecommendations: analyses.filter((a) => a.feeChange !== 0).length,
        totalProjectedImpact: analyses.reduce((sum, a) => sum + a.projectedAnnualImpact, 0),
        avgChangePercent:
          analyses.length > 0 ? analyses.reduce((sum, a) => sum + a.changePercent, 0) / analyses.length : 0,
        topOpportunities: analyses.slice(0, 10),
        byPriority: {
          critical: analyses.filter((a) => a.priority === 'critical').length,
          high: analyses.filter((a) => a.priority === 'high').length,
          medium: analyses.filter((a) => a.priority === 'medium').length,
          low: analyses.filter((a) => a.priority === 'low').length,
        },
      };

      return {
        success: true,
        summary,
        analyses,
        feeSchedule: {
          id: feeSchedule.id,
          name: feeSchedule.name,
        },
        dateRange: {
          from: startDate,
          to: endDate,
        },
        analyzedAt: new Date(),
      };
    }),

  /**
   * Get fee schedule analysis results
   */
  getFeeAnalyses: billerProcedure
    .input(
      z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'implemented']).optional(),
        minImpact: z.number().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { status, minImpact, limit, offset } = input;

      const where = {
        organizationId: ctx.user.organizationId,
        ...(status && { status }),
        ...(minImpact && { projectedAnnualImpact: { gte: minImpact } }),
      };

      const [analyses, total] = await Promise.all([
        ctx.prisma.feeScheduleAnalysis.findMany({
          where,
          orderBy: [{ projectedAnnualImpact: 'desc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.feeScheduleAnalysis.count({ where }),
      ]);

      return {
        analyses,
        total,
        hasMore: offset + analyses.length < total,
      };
    }),

  /**
   * Approve/reject fee recommendation
   */
  reviewFeeRecommendation: billerProcedure
    .input(
      z.object({
        analysisId: z.string(),
        action: z.enum(['approve', 'reject']),
        effectiveDate: z.date().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { analysisId, action, effectiveDate, notes } = input;

      const analysis = await ctx.prisma.feeScheduleAnalysis.findFirst({
        where: {
          id: analysisId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!analysis) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Analysis not found',
        });
      }

      const updated = await ctx.prisma.feeScheduleAnalysis.update({
        where: { id: analysisId },
        data: {
          status: action === 'approve' ? 'approved' : 'rejected',
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
          effectiveDate: action === 'approve' ? effectiveDate : null,
        },
      });

      // If approved, create an optimization action to track
      if (action === 'approve') {
        await ctx.prisma.optimizationAction.create({
          data: {
            actionType: 'fee_update',
            action: `Approved fee change for ${analysis.cptCode}: $${analysis.currentFee} → $${analysis.recommendedFee}`,
            projectedImpact: analysis.projectedAnnualImpact,
            status: 'pending',
            organizationId: ctx.user.organizationId,
          },
        });
      }

      return {
        success: true,
        analysis: updated,
      };
    }),

  /**
   * Implement approved fee changes
   */
  implementFeeChanges: billerProcedure
    .input(
      z.object({
        analysisIds: z.array(z.string()),
        feeScheduleId: z.string(),
        effectiveDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { analysisIds, feeScheduleId, effectiveDate } = input;
      const organizationId = ctx.user.organizationId;

      // Get approved analyses
      const analyses = await ctx.prisma.feeScheduleAnalysis.findMany({
        where: {
          id: { in: analysisIds },
          organizationId,
          status: 'approved',
        },
      });

      if (analyses.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No approved analyses found to implement',
        });
      }

      // Update fee schedule items
      const results: { cptCode: string; oldFee: number; newFee: number; success: boolean }[] = [];

      for (const analysis of analyses) {
        try {
          // Try to update existing item
          const existingItem = await ctx.prisma.feeScheduleItem.findFirst({
            where: {
              feeScheduleId,
              cptCode: analysis.cptCode,
            },
          });

          if (existingItem) {
            await ctx.prisma.feeScheduleItem.update({
              where: { id: existingItem.id },
              data: {
                fee: analysis.recommendedFee,
              },
            });
          } else {
            // Create new item
            await ctx.prisma.feeScheduleItem.create({
              data: {
                feeScheduleId,
                cptCode: analysis.cptCode,
                fee: analysis.recommendedFee,
                description: analysis.cptName,
              },
            });
          }

          // Mark analysis as implemented
          await ctx.prisma.feeScheduleAnalysis.update({
            where: { id: analysis.id },
            data: {
              status: 'implemented',
              effectiveDate: effectiveDate || new Date(),
            },
          });

          results.push({
            cptCode: analysis.cptCode,
            oldFee: Number(analysis.currentFee),
            newFee: Number(analysis.recommendedFee),
            success: true,
          });
        } catch {
          results.push({
            cptCode: analysis.cptCode,
            oldFee: Number(analysis.currentFee),
            newFee: Number(analysis.recommendedFee),
            success: false,
          });
        }
      }

      // Create optimization action record
      const successCount = results.filter((r) => r.success).length;
      const totalImpact = analyses.reduce((sum, a) => sum + Number(a.projectedAnnualImpact || 0), 0);

      await ctx.prisma.optimizationAction.create({
        data: {
          actionType: 'fee_update',
          action: `Implemented ${successCount} fee schedule changes`,
          projectedImpact: new Decimal(totalImpact),
          status: 'completed',
          completedAt: new Date(),
          completedBy: ctx.user.id,
          organizationId,
        },
      });

      return {
        success: true,
        implemented: successCount,
        failed: results.length - successCount,
        results,
        totalProjectedImpact: totalImpact,
      };
    }),

  /**
   * Track effectiveness of fee changes
   */
  trackFeeEffectiveness: billerProcedure
    .input(
      z.object({
        cptCode: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { cptCode, dateFrom, dateTo } = input;
      const organizationId = ctx.user.organizationId;

      // Get implemented fee changes
      const implementedChanges = await ctx.prisma.feeScheduleAnalysis.findMany({
        where: {
          organizationId,
          status: 'implemented',
          ...(cptCode && { cptCode }),
          effectiveDate: {
            ...(dateFrom && { gte: dateFrom }),
            ...(dateTo && { lte: dateTo }),
          },
        },
        orderBy: { effectiveDate: 'desc' },
      });

      // Analyze actual impact for each implemented change
      const effectiveness: {
        cptCode: string;
        cptName: string | null;
        implementedDate: Date | null;
        projectedImpact: number;
        actualImpact: number;
        variance: number;
        effectivenessPercent: number;
      }[] = [];

      for (const change of implementedChanges) {
        if (!change.effectiveDate) continue;

        // Get revenue before and after the change
        const beforePeriodStart = new Date(change.effectiveDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        const afterPeriodEnd = new Date();

        // Revenue before change
        const beforeCharges = await ctx.prisma.charge.aggregate({
          where: {
            organizationId,
            cptCode: change.cptCode,
            serviceDate: {
              gte: beforePeriodStart,
              lt: change.effectiveDate,
            },
          },
          _sum: { fee: true },
          _count: { id: true },
        });

        // Revenue after change
        const afterCharges = await ctx.prisma.charge.aggregate({
          where: {
            organizationId,
            cptCode: change.cptCode,
            serviceDate: {
              gte: change.effectiveDate,
              lte: afterPeriodEnd,
            },
          },
          _sum: { fee: true },
          _count: { id: true },
        });

        const beforeAvgFee = beforeCharges._count.id > 0
          ? Number(beforeCharges._sum.fee || 0) / beforeCharges._count.id
          : 0;
        const afterAvgFee = afterCharges._count.id > 0
          ? Number(afterCharges._sum.fee || 0) / afterCharges._count.id
          : 0;

        // Calculate actual impact (annualized)
        const feeIncrease = afterAvgFee - beforeAvgFee;
        const avgMonthlyVolume = afterCharges._count.id / Math.max(1, (afterPeriodEnd.getTime() - change.effectiveDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
        const actualAnnualImpact = feeIncrease * avgMonthlyVolume * 12 * 0.3; // 30% cash ratio

        const projectedImpact = Number(change.projectedAnnualImpact || 0);
        const variance = actualAnnualImpact - projectedImpact;
        const effectivenessPercent = projectedImpact > 0 ? (actualAnnualImpact / projectedImpact) * 100 : 0;

        effectiveness.push({
          cptCode: change.cptCode,
          cptName: change.cptName,
          implementedDate: change.effectiveDate,
          projectedImpact,
          actualImpact: Math.round(actualAnnualImpact * 100) / 100,
          variance: Math.round(variance * 100) / 100,
          effectivenessPercent: Math.round(effectivenessPercent * 100) / 100,
        });
      }

      // Calculate summary
      const summary = {
        totalChangesTracked: effectiveness.length,
        totalProjectedImpact: effectiveness.reduce((sum, e) => sum + e.projectedImpact, 0),
        totalActualImpact: effectiveness.reduce((sum, e) => sum + e.actualImpact, 0),
        avgEffectiveness: effectiveness.length > 0
          ? effectiveness.reduce((sum, e) => sum + e.effectivenessPercent, 0) / effectiveness.length
          : 0,
        underperforming: effectiveness.filter((e) => e.effectivenessPercent < 80).length,
        overperforming: effectiveness.filter((e) => e.effectivenessPercent > 120).length,
      };

      return {
        effectiveness,
        summary,
      };
    }),

  /**
   * Get fee optimization summary
   */
  getFeeOptimizationSummary: billerProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.user.organizationId;

    // Get pending recommendations
    const pendingAnalyses = await ctx.prisma.feeScheduleAnalysis.findMany({
      where: {
        organizationId,
        status: 'pending',
      },
    });

    // Get implemented changes in last 12 months
    const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const implementedAnalyses = await ctx.prisma.feeScheduleAnalysis.findMany({
      where: {
        organizationId,
        status: 'implemented',
        effectiveDate: {
          gte: twelveMonthsAgo,
        },
      },
    });

    // Get optimization actions
    const feeActions = await ctx.prisma.optimizationAction.findMany({
      where: {
        organizationId,
        actionType: 'fee_update',
        createdAt: {
          gte: twelveMonthsAgo,
        },
      },
    });

    const summary = {
      pending: {
        count: pendingAnalyses.length,
        totalProjectedImpact: pendingAnalyses.reduce((sum, a) => sum + Number(a.projectedAnnualImpact || 0), 0),
      },
      implemented: {
        count: implementedAnalyses.length,
        totalProjectedImpact: implementedAnalyses.reduce((sum, a) => sum + Number(a.projectedAnnualImpact || 0), 0),
      },
      actions: {
        total: feeActions.length,
        completed: feeActions.filter((a) => a.status === 'completed').length,
        totalActualImpact: feeActions.reduce((sum, a) => sum + Number(a.actualImpact || 0), 0),
      },
      topOpportunities: pendingAnalyses
        .sort((a, b) => Number(b.projectedAnnualImpact || 0) - Number(a.projectedAnnualImpact || 0))
        .slice(0, 5)
        .map((a) => ({
          cptCode: a.cptCode,
          cptName: a.cptName,
          currentFee: Number(a.currentFee),
          recommendedFee: Number(a.recommendedFee),
          projectedImpact: Number(a.projectedAnnualImpact || 0),
        })),
    };

    return summary;
  }),

  // ============================================
  // US-342: Service Mix Optimization
  // ============================================

  /**
   * Analyze service mix for optimal profitability
   * Evaluates profitability by service type, identifies high-margin services,
   * recommends service expansion/reduction, analyzes payer mix, and capacity utilization
   */
  analyzeServiceMix: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        providerId: z.string().optional(),
        minVolumeThreshold: z.number().default(10), // Minimum procedures to include
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { dateFrom, dateTo, providerId, minVolumeThreshold } = input;
      const organizationId = ctx.user.organizationId;

      // Default date range: last 12 months
      const endDate = dateTo || new Date();
      const startDate = dateFrom || new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);

      // Service category definitions for chiropractic
      const SERVICE_CATEGORIES: Record<string, { name: string; codes: string[]; avgTimeMinutes: number }> = {
        cmt: {
          name: 'Chiropractic Manipulation',
          codes: ['98940', '98941', '98942', '98943'],
          avgTimeMinutes: 15,
        },
        em_new: {
          name: 'E&M - New Patient',
          codes: ['99201', '99202', '99203', '99204', '99205'],
          avgTimeMinutes: 30,
        },
        em_established: {
          name: 'E&M - Established',
          codes: ['99211', '99212', '99213', '99214', '99215'],
          avgTimeMinutes: 15,
        },
        therapy_manual: {
          name: 'Manual Therapy',
          codes: ['97140'],
          avgTimeMinutes: 15,
        },
        therapy_exercise: {
          name: 'Therapeutic Exercise',
          codes: ['97110', '97530'],
          avgTimeMinutes: 15,
        },
        therapy_neuro: {
          name: 'Neuromuscular Re-education',
          codes: ['97112'],
          avgTimeMinutes: 15,
        },
        modalities_attended: {
          name: 'Attended Modalities',
          codes: ['97032', '97035', '97033'],
          avgTimeMinutes: 8,
        },
        modalities_unattended: {
          name: 'Unattended Modalities',
          codes: ['97014', 'G0283'],
          avgTimeMinutes: 0, // No provider time
        },
        evaluation: {
          name: 'PT Evaluation',
          codes: ['97161', '97162', '97163'],
          avgTimeMinutes: 45,
        },
        xray: {
          name: 'X-Ray',
          codes: ['72040', '72050', '72070', '72100', '72110'],
          avgTimeMinutes: 10,
        },
        acupuncture: {
          name: 'Acupuncture',
          codes: ['97810', '97811', '97813', '97814'],
          avgTimeMinutes: 20,
        },
        supplies: {
          name: 'Supplies',
          codes: ['99070', 'A4550', 'A4570'],
          avgTimeMinutes: 0,
        },
      };

      // Get all charges with claim/payment data for the period
      const charges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: {
            gte: startDate,
            lte: endDate,
          },
          ...(providerId && { providerId }),
          status: {
            in: ['BILLED', 'PAID'],
          },
        },
        include: {
          claimLines: {
            include: {
              claim: {
                include: {
                  payer: true,
                },
              },
            },
          },
          provider: true,
          encounter: true,
        },
      });

      // Get all encounters to analyze time utilization
      const encounters = await ctx.prisma.encounter.findMany({
        where: {
          organizationId,
          encounterDate: {
            gte: startDate,
            lte: endDate,
          },
          ...(providerId && { providerId }),
          status: 'COMPLETED',
        },
        include: {
          provider: {
            include: {
              user: true,
            },
          },
          charges: true,
        },
      });

      // ============================================
      // 1. Profitability by Service Type
      // ============================================

      interface ServiceAnalysis {
        category: string;
        categoryName: string;
        cptCodes: string[];
        volume: number;
        totalRevenue: number;
        totalReimbursement: number;
        totalAdjustments: number;
        avgFee: number;
        avgReimbursement: number;
        reimbursementRate: number; // % of fee collected
        profitMargin: number; // Estimated based on reimbursement vs cost
        timeMinutes: number;
        revenuePerMinute: number;
        highMargin: boolean;
        unprofitable: boolean;
        recommendation: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      const serviceAnalysisByCategory: Record<string, ServiceAnalysis> = {};

      // Initialize categories
      for (const [key, category] of Object.entries(SERVICE_CATEGORIES)) {
        serviceAnalysisByCategory[key] = {
          category: key,
          categoryName: category.name,
          cptCodes: [],
          volume: 0,
          totalRevenue: 0,
          totalReimbursement: 0,
          totalAdjustments: 0,
          avgFee: 0,
          avgReimbursement: 0,
          reimbursementRate: 0,
          profitMargin: 0,
          timeMinutes: 0,
          revenuePerMinute: 0,
          highMargin: false,
          unprofitable: false,
          recommendation: '',
          priority: 'low',
        };
      }

      // Analyze each charge
      for (const charge of charges) {
        // Find which category this CPT belongs to
        let categoryKey = 'other';
        for (const [key, category] of Object.entries(SERVICE_CATEGORIES)) {
          if (category.codes.includes(charge.cptCode)) {
            categoryKey = key;
            break;
          }
        }

        // Create 'other' category if needed
        if (!serviceAnalysisByCategory[categoryKey]) {
          serviceAnalysisByCategory[categoryKey] = {
            category: categoryKey,
            categoryName: 'Other Services',
            cptCodes: [],
            volume: 0,
            totalRevenue: 0,
            totalReimbursement: 0,
            totalAdjustments: 0,
            avgFee: 0,
            avgReimbursement: 0,
            reimbursementRate: 0,
            profitMargin: 0,
            timeMinutes: 0,
            revenuePerMinute: 0,
            highMargin: false,
            unprofitable: false,
            recommendation: '',
            priority: 'low',
          };
        }

        const analysis = serviceAnalysisByCategory[categoryKey];

        // Track unique CPT codes
        if (!analysis.cptCodes.includes(charge.cptCode)) {
          analysis.cptCodes.push(charge.cptCode);
        }

        // Accumulate metrics
        analysis.volume += charge.units;
        analysis.totalRevenue += Number(charge.fee) * charge.units;
        analysis.totalAdjustments += Number(charge.adjustments || 0);

        // Get reimbursement from claim lines
        const reimbursement = charge.claimLines?.reduce((sum: number, cl: { paidAmount: unknown }) => sum + Number(cl.paidAmount || 0), 0) || 0;
        analysis.totalReimbursement += reimbursement;

        // Calculate time (based on units and category average)
        const categoryConfig = SERVICE_CATEGORIES[categoryKey];
        if (categoryConfig) {
          analysis.timeMinutes += categoryConfig.avgTimeMinutes * charge.units;
        } else {
          analysis.timeMinutes += 15 * charge.units; // Default 15 minutes
        }
      }

      // Calculate derived metrics for each category
      const analysisResults: ServiceAnalysis[] = [];

      for (const [key, analysis] of Object.entries(serviceAnalysisByCategory)) {
        if (analysis.volume < minVolumeThreshold) continue; // Skip low-volume services

        // Calculate averages and rates
        analysis.avgFee = analysis.volume > 0 ? analysis.totalRevenue / analysis.volume : 0;
        analysis.avgReimbursement = analysis.volume > 0 ? analysis.totalReimbursement / analysis.volume : 0;
        analysis.reimbursementRate = analysis.totalRevenue > 0
          ? (analysis.totalReimbursement / analysis.totalRevenue) * 100
          : 0;

        // Revenue per minute (key efficiency metric)
        analysis.revenuePerMinute = analysis.timeMinutes > 0
          ? analysis.totalReimbursement / analysis.timeMinutes
          : 0;

        // Estimate profit margin (reimbursement rate minus estimated overhead)
        // Assume ~40% overhead for direct costs (staff, supplies, etc.)
        const estimatedOverheadRate = 0.4;
        analysis.profitMargin = analysis.reimbursementRate * (1 - estimatedOverheadRate);

        // Classify as high-margin or unprofitable
        analysis.highMargin = analysis.revenuePerMinute > 3.0 && analysis.reimbursementRate > 60;
        analysis.unprofitable = analysis.revenuePerMinute < 1.5 || analysis.reimbursementRate < 30;

        // Generate recommendations
        if (analysis.unprofitable) {
          analysis.recommendation = `Consider reducing or eliminating ${analysis.categoryName}. Revenue per minute ($${analysis.revenuePerMinute.toFixed(2)}) is below threshold. Review payer contracts for this service.`;
          analysis.priority = analysis.totalRevenue > 5000 ? 'high' : 'medium';
        } else if (analysis.highMargin) {
          analysis.recommendation = `Expand ${analysis.categoryName} - high profitability with $${analysis.revenuePerMinute.toFixed(2)}/minute. Consider adding capacity or marketing this service.`;
          analysis.priority = 'medium';
        } else if (analysis.reimbursementRate < 50) {
          analysis.recommendation = `Review payer contracts for ${analysis.categoryName}. Reimbursement rate of ${analysis.reimbursementRate.toFixed(1)}% indicates potential fee schedule or coding issues.`;
          analysis.priority = 'medium';
        } else {
          analysis.recommendation = `${analysis.categoryName} is performing within normal parameters. Continue monitoring.`;
          analysis.priority = 'low';
        }

        analysisResults.push(analysis);
      }

      // Sort by revenue per minute (descending)
      analysisResults.sort((a, b) => b.revenuePerMinute - a.revenuePerMinute);

      // ============================================
      // 2. Payer Mix Analysis
      // ============================================

      interface PayerMixAnalysis {
        payerName: string;
        payerId?: string;
        claimCount: number;
        totalBilled: number;
        totalReimbursed: number;
        reimbursementRate: number;
        avgDaysToPayment: number;
        denialRate: number;
        volumePercent: number;
        recommendation: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      const payerStats: Record<string, {
        name: string;
        id?: string;
        claims: number;
        billed: number;
        reimbursed: number;
        denials: number;
        paymentDays: number[];
      }> = {};

      // Get claims for payer analysis
      const claims = await ctx.prisma.claim.findMany({
        where: {
          organizationId,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          payer: true,
          claimLines: true,
        },
      });

      for (const claim of claims) {
        const payerName = claim.payer?.name || 'Self-Pay/Unknown';
        const payerId = claim.payerId || 'unknown';

        if (!payerStats[payerName]) {
          payerStats[payerName] = {
            name: payerName,
            id: payerId,
            claims: 0,
            billed: 0,
            reimbursed: 0,
            denials: 0,
            paymentDays: [],
          };
        }

        payerStats[payerName].claims++;
        payerStats[payerName].billed += Number(claim.totalCharges || 0);
        payerStats[payerName].reimbursed += Number(claim.totalPaid || 0);

        if (claim.status === 'DENIED') {
          payerStats[payerName].denials++;
        }

        // Calculate days to payment
        if (claim.paidDate && claim.submittedDate) {
          const daysToPayment = Math.floor(
            (claim.paidDate.getTime() - claim.submittedDate.getTime()) / (24 * 60 * 60 * 1000)
          );
          payerStats[payerName].paymentDays.push(daysToPayment);
        }
      }

      const totalClaims = Object.values(payerStats).reduce((sum, p) => sum + p.claims, 0);
      const payerMixAnalysis: PayerMixAnalysis[] = [];

      for (const [name, stats] of Object.entries(payerStats)) {
        const reimbursementRate = stats.billed > 0 ? (stats.reimbursed / stats.billed) * 100 : 0;
        const denialRate = stats.claims > 0 ? (stats.denials / stats.claims) * 100 : 0;
        const avgDaysToPayment = stats.paymentDays.length > 0
          ? stats.paymentDays.reduce((a, b) => a + b, 0) / stats.paymentDays.length
          : 0;
        const volumePercent = totalClaims > 0 ? (stats.claims / totalClaims) * 100 : 0;

        let recommendation = '';
        let priority: 'low' | 'medium' | 'high' | 'critical' = 'low';

        if (reimbursementRate < 40) {
          recommendation = `${name} has very low reimbursement rate (${reimbursementRate.toFixed(1)}%). Consider contract renegotiation or dropping this payer.`;
          priority = volumePercent > 10 ? 'critical' : 'high';
        } else if (denialRate > 20) {
          recommendation = `${name} has high denial rate (${denialRate.toFixed(1)}%). Review coding and authorization processes for this payer.`;
          priority = 'high';
        } else if (avgDaysToPayment > 60) {
          recommendation = `${name} slow payment (avg ${avgDaysToPayment.toFixed(0)} days). Implement follow-up protocols for this payer.`;
          priority = 'medium';
        } else if (reimbursementRate > 70 && volumePercent < 10) {
          recommendation = `Consider increasing volume with ${name} - high reimbursement rate (${reimbursementRate.toFixed(1)}%) suggests favorable contracts.`;
          priority = 'medium';
        } else {
          recommendation = `${name} performing normally. Monitor for changes.`;
        }

        payerMixAnalysis.push({
          payerName: name,
          payerId: stats.id,
          claimCount: stats.claims,
          totalBilled: stats.billed,
          totalReimbursed: stats.reimbursed,
          reimbursementRate,
          avgDaysToPayment,
          denialRate,
          volumePercent,
          recommendation,
          priority,
        });
      }

      // Sort by volume
      payerMixAnalysis.sort((a, b) => b.claimCount - a.claimCount);

      // ============================================
      // 3. Time vs Revenue Analysis
      // ============================================

      interface TimeRevenueAnalysis {
        providerId?: string;
        providerName: string;
        totalEncounters: number;
        totalTimeMinutes: number;
        totalRevenue: number;
        revenuePerHour: number;
        avgEncounterMinutes: number;
        avgRevenuePerEncounter: number;
        utilizationPercent: number; // % of available time used
        recommendation: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      const providerTimeStats: Record<string, {
        id?: string;
        name: string;
        encounters: number;
        totalMinutes: number;
        totalRevenue: number;
      }> = {};

      for (const encounter of encounters) {
        const providerName = encounter.provider?.user
          ? `${encounter.provider.user.firstName || ''} ${encounter.provider.user.lastName || ''}`.trim() || 'Unknown Provider'
          : 'Unknown Provider';
        const provId = encounter.providerId || 'unknown';

        if (!providerTimeStats[provId]) {
          providerTimeStats[provId] = {
            id: provId === 'unknown' ? undefined : provId,
            name: providerName,
            encounters: 0,
            totalMinutes: 0,
            totalRevenue: 0,
          };
        }

        providerTimeStats[provId].encounters++;

        // Estimate encounter time based on charges
        let encounterMinutes = 0;
        let encounterRevenue = 0;
        for (const charge of encounter.charges) {
          // Find time for this CPT
          let timePerUnit = 15; // Default
          for (const category of Object.values(SERVICE_CATEGORIES)) {
            if (category.codes.includes(charge.cptCode)) {
              timePerUnit = category.avgTimeMinutes;
              break;
            }
          }
          encounterMinutes += timePerUnit * charge.units;
          encounterRevenue += Number(charge.fee) * charge.units;
        }

        providerTimeStats[provId].totalMinutes += encounterMinutes;
        providerTimeStats[provId].totalRevenue += encounterRevenue;
      }

      const timeRevenueAnalysis: TimeRevenueAnalysis[] = [];
      const workingHoursPerMonth = 160; // 40 hours * 4 weeks
      const analysisMonths = Math.max(1, (endDate.getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000));

      for (const [id, stats] of Object.entries(providerTimeStats)) {
        if (stats.encounters < 10) continue; // Skip providers with minimal activity

        const revenuePerHour = stats.totalMinutes > 0
          ? (stats.totalRevenue / stats.totalMinutes) * 60
          : 0;
        const avgEncounterMinutes = stats.encounters > 0
          ? stats.totalMinutes / stats.encounters
          : 0;
        const avgRevenuePerEncounter = stats.encounters > 0
          ? stats.totalRevenue / stats.encounters
          : 0;

        // Calculate utilization (% of available time used)
        const availableMinutes = workingHoursPerMonth * 60 * analysisMonths;
        const utilizationPercent = (stats.totalMinutes / availableMinutes) * 100;

        let recommendation = '';
        let priority: 'low' | 'medium' | 'high' | 'critical' = 'low';

        if (revenuePerHour < 150) {
          recommendation = `${stats.name}: Revenue/hour ($${revenuePerHour.toFixed(0)}) is below benchmark. Review service mix or scheduling efficiency.`;
          priority = 'high';
        } else if (utilizationPercent < 50) {
          recommendation = `${stats.name}: Low utilization (${utilizationPercent.toFixed(0)}%). Opportunity to increase patient volume or add services.`;
          priority = 'medium';
        } else if (utilizationPercent > 90) {
          recommendation = `${stats.name}: Near capacity (${utilizationPercent.toFixed(0)}%). Consider adding provider coverage or extending hours.`;
          priority = 'medium';
        } else if (revenuePerHour > 300) {
          recommendation = `${stats.name}: Excellent revenue/hour ($${revenuePerHour.toFixed(0)}). Consider this provider's practices as a model.`;
          priority = 'low';
        } else {
          recommendation = `${stats.name}: Operating within normal parameters.`;
        }

        timeRevenueAnalysis.push({
          providerId: stats.id,
          providerName: stats.name,
          totalEncounters: stats.encounters,
          totalTimeMinutes: stats.totalMinutes,
          totalRevenue: stats.totalRevenue,
          revenuePerHour,
          avgEncounterMinutes,
          avgRevenuePerEncounter,
          utilizationPercent,
          recommendation,
          priority,
        });
      }

      // Sort by revenue per hour
      timeRevenueAnalysis.sort((a, b) => b.revenuePerHour - a.revenuePerHour);

      // ============================================
      // 4. Capacity Utilization Analysis
      // ============================================

      interface CapacityRecommendation {
        type: 'expansion' | 'reduction' | 'optimization' | 'rebalance';
        title: string;
        description: string;
        projectedImpact: number;
        effortLevel: 'easy' | 'moderate' | 'complex';
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      const capacityRecommendations: CapacityRecommendation[] = [];

      // Analyze high-margin services for expansion
      const highMarginServices = analysisResults.filter(a => a.highMargin);
      if (highMarginServices.length > 0) {
        const topService = highMarginServices[0];
        const expansionImpact = topService.totalReimbursement * 0.25; // 25% growth potential

        capacityRecommendations.push({
          type: 'expansion',
          title: `Expand ${topService.categoryName} Services`,
          description: `${topService.categoryName} generates $${topService.revenuePerMinute.toFixed(2)}/minute with ${topService.reimbursementRate.toFixed(1)}% collection rate. Marketing and capacity expansion could increase revenue by ~$${expansionImpact.toFixed(0)}/year.`,
          projectedImpact: expansionImpact,
          effortLevel: 'moderate',
          priority: 'high',
        });
      }

      // Analyze unprofitable services for reduction
      const unprofitableServices = analysisResults.filter(a => a.unprofitable);
      for (const service of unprofitableServices.slice(0, 3)) {
        const savingsImpact = service.totalRevenue * (1 - service.reimbursementRate / 100) * 0.5;

        capacityRecommendations.push({
          type: 'reduction',
          title: `Review ${service.categoryName} Viability`,
          description: `${service.categoryName} has low revenue/minute ($${service.revenuePerMinute.toFixed(2)}) and ${service.reimbursementRate.toFixed(1)}% collection. Consider reducing or repricing this service.`,
          projectedImpact: savingsImpact,
          effortLevel: 'easy',
          priority: service.totalRevenue > 10000 ? 'high' : 'medium',
        });
      }

      // Analyze payer mix for rebalancing
      const problematicPayers = payerMixAnalysis.filter(p => p.reimbursementRate < 50 && p.volumePercent > 5);
      if (problematicPayers.length > 0) {
        const totalLoss = problematicPayers.reduce((sum, p) =>
          sum + (p.totalBilled - p.totalReimbursed), 0);

        capacityRecommendations.push({
          type: 'rebalance',
          title: 'Optimize Payer Mix',
          description: `${problematicPayers.length} payers have <50% reimbursement rates, representing $${totalLoss.toFixed(0)} in potential lost revenue. Consider contract renegotiation or shifting volume to better-paying payers.`,
          projectedImpact: totalLoss * 0.3, // 30% recovery potential
          effortLevel: 'complex',
          priority: 'critical',
        });
      }

      // Analyze provider utilization
      const underutilizedProviders = timeRevenueAnalysis.filter(p => p.utilizationPercent < 60);
      if (underutilizedProviders.length > 0) {
        const potentialRevenue = underutilizedProviders.reduce((sum, p) => {
          const capacityGap = (70 - p.utilizationPercent) / 100; // Target 70% utilization
          return sum + (p.totalRevenue * capacityGap);
        }, 0);

        capacityRecommendations.push({
          type: 'optimization',
          title: 'Increase Provider Utilization',
          description: `${underutilizedProviders.length} providers are below 60% utilization. Improving scheduling and patient volume could generate ~$${potentialRevenue.toFixed(0)} additional annual revenue.`,
          projectedImpact: potentialRevenue,
          effortLevel: 'moderate',
          priority: 'high',
        });
      }

      // Sort recommendations by projected impact
      capacityRecommendations.sort((a, b) => b.projectedImpact - a.projectedImpact);

      // ============================================
      // 5. Generate Summary & Persist Results
      // ============================================

      // Calculate overall metrics
      const totalRevenue = analysisResults.reduce((sum, a) => sum + a.totalRevenue, 0);
      const totalReimbursement = analysisResults.reduce((sum, a) => sum + a.totalReimbursement, 0);
      const overallReimbursementRate = totalRevenue > 0 ? (totalReimbursement / totalRevenue) * 100 : 0;
      const totalTimeMinutes = analysisResults.reduce((sum, a) => sum + a.timeMinutes, 0);
      const overallRevenuePerMinute = totalTimeMinutes > 0 ? totalReimbursement / totalTimeMinutes : 0;

      // Create revenue opportunity for top recommendations
      for (const rec of capacityRecommendations.slice(0, 5)) {
        if (rec.projectedImpact > 1000) {
          await ctx.prisma.revenueOpportunity.create({
            data: {
              opportunityType: `service_mix_${rec.type}`,
              title: rec.title,
              description: rec.description,
              estimatedValue: new Decimal(rec.projectedImpact),
              confidence: new Decimal(70),
              status: 'identified',
              organizationId,
            },
          });
        }
      }

      const summary = {
        dateRange: { from: startDate, to: endDate },
        overallMetrics: {
          totalRevenue,
          totalReimbursement,
          reimbursementRate: overallReimbursementRate,
          totalTimeMinutes,
          revenuePerMinute: overallRevenuePerMinute,
          revenuePerHour: overallRevenuePerMinute * 60,
        },
        serviceCount: analysisResults.length,
        highMarginServices: analysisResults.filter(a => a.highMargin).length,
        unprofitableServices: analysisResults.filter(a => a.unprofitable).length,
        payerCount: payerMixAnalysis.length,
        problematicPayers: payerMixAnalysis.filter(p => p.reimbursementRate < 50).length,
        providerCount: timeRevenueAnalysis.length,
        totalOpportunities: capacityRecommendations.length,
        totalProjectedImpact: capacityRecommendations.reduce((sum, r) => sum + r.projectedImpact, 0),
      };

      return {
        success: true,
        summary,
        serviceAnalysis: analysisResults,
        payerMixAnalysis,
        timeRevenueAnalysis,
        capacityRecommendations,
        analyzedAt: new Date(),
      };
    }),

  /**
   * Get service mix analysis summary
   */
  getServiceMixSummary: billerProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.user.organizationId;

    // Get recent service mix opportunities
    const opportunities = await ctx.prisma.revenueOpportunity.findMany({
      where: {
        organizationId,
        opportunityType: {
          startsWith: 'service_mix_',
        },
        status: {
          in: ['identified', 'in_progress'],
        },
      },
      orderBy: { estimatedValue: 'desc' },
      take: 10,
    });

    // Get captured value from service mix optimizations
    const capturedOpportunities = await ctx.prisma.revenueOpportunity.findMany({
      where: {
        organizationId,
        opportunityType: {
          startsWith: 'service_mix_',
        },
        status: 'captured',
        capturedAt: {
          gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const totalCaptured = capturedOpportunities.reduce(
      (sum, o) => sum + Number(o.capturedValue || 0), 0
    );

    return {
      activeOpportunities: opportunities.length,
      totalEstimatedValue: opportunities.reduce((sum, o) => sum + Number(o.estimatedValue), 0),
      capturedThisYear: totalCaptured,
      topOpportunities: opportunities.slice(0, 5).map(o => ({
        id: o.id,
        type: o.opportunityType,
        title: o.title,
        estimatedValue: Number(o.estimatedValue),
        status: o.status,
      })),
    };
  }),

  /**
   * Act on a service mix recommendation
   */
  actOnServiceMixRecommendation: billerProcedure
    .input(
      z.object({
        opportunityId: z.string(),
        action: z.enum(['start', 'complete', 'decline']),
        capturedValue: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { opportunityId, action, capturedValue, notes } = input;

      const opportunity = await ctx.prisma.revenueOpportunity.findFirst({
        where: {
          id: opportunityId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!opportunity) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Opportunity not found',
        });
      }

      let newStatus: string;
      switch (action) {
        case 'start':
          newStatus = 'in_progress';
          break;
        case 'complete':
          newStatus = 'captured';
          break;
        case 'decline':
          newStatus = 'declined';
          break;
      }

      const updated = await ctx.prisma.revenueOpportunity.update({
        where: { id: opportunityId },
        data: {
          status: newStatus,
          ...(action === 'complete' && {
            capturedValue: capturedValue ? new Decimal(capturedValue) : null,
            capturedAt: new Date(),
            capturedBy: ctx.user.id,
          }),
          notes: notes || opportunity.notes,
        },
      });

      // Create optimization action record
      if (action === 'complete') {
        await ctx.prisma.optimizationAction.create({
          data: {
            actionType: 'service_mix_optimization',
            action: `Completed: ${opportunity.title}`,
            projectedImpact: opportunity.estimatedValue,
            actualImpact: capturedValue ? new Decimal(capturedValue) : null,
            status: 'completed',
            completedAt: new Date(),
            completedBy: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });
      }

      return {
        success: true,
        opportunity: updated,
      };
    }),

  // ============================================
  // US-343: Coding Optimization
  // ============================================

  /**
   * Analyze coding patterns and identify optimization opportunities
   * Reviews E&M levels, modifier usage, bundling, and provider coding patterns
   */
  optimizeCoding: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        providerId: z.string().optional(),
        minVolumeThreshold: z.number().default(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { dateFrom, dateTo, providerId, minVolumeThreshold } = input;
      const organizationId = ctx.user.organizationId;

      // Default date range: last 6 months
      const endDate = dateTo || new Date();
      const startDate = dateFrom || new Date(endDate.getTime() - 180 * 24 * 60 * 60 * 1000);

      // ============================================
      // E&M Level Distribution Benchmarks
      // ============================================
      const EM_BENCHMARKS = {
        // Typical E&M distribution for chiropractic (Medicare audit guidelines)
        newPatient: {
          '99201': 0.02, // 2%
          '99202': 0.08, // 8%
          '99203': 0.35, // 35%
          '99204': 0.40, // 40%
          '99205': 0.15, // 15%
        },
        established: {
          '99211': 0.02, // 2%
          '99212': 0.10, // 10%
          '99213': 0.45, // 45%
          '99214': 0.35, // 35%
          '99215': 0.08, // 8%
        },
      };

      // Modifier definitions for chiropractic
      const MODIFIER_GUIDANCE: Record<string, { description: string; whenToUse: string; revenueImpact: string }> = {
        '-25': {
          description: 'Significant, Separately Identifiable E&M Service',
          whenToUse: 'When E&M is billed same day as CMT with separate documentation',
          revenueImpact: 'Prevents denial of E&M when billed with CMT',
        },
        '-59': {
          description: 'Distinct Procedural Service',
          whenToUse: 'When procedures are performed on different anatomic sites',
          revenueImpact: 'Prevents bundling denials',
        },
        '-GP': {
          description: 'Services under Physical Therapy Plan',
          whenToUse: 'For therapy services under PT supervision',
          revenueImpact: 'Required by some payers for therapy codes',
        },
        '-AT': {
          description: 'Acute Treatment',
          whenToUse: 'For CMT codes billed to Medicare',
          revenueImpact: 'Required for Medicare coverage of CMT',
        },
        '-XE': {
          description: 'Separate Encounter',
          whenToUse: 'When service is distinct because performed during separate encounter',
          revenueImpact: 'Alternative to -59 for unbundling',
        },
        '-XS': {
          description: 'Separate Structure',
          whenToUse: 'When service is distinct because performed on separate organ/structure',
          revenueImpact: 'Alternative to -59 for anatomic distinction',
        },
      };

      // Bundling rules for common chiropractic services
      const BUNDLING_RULES: Array<{ codes: string[]; rule: string; action: string }> = [
        {
          codes: ['97140', '98941'],
          rule: 'Manual therapy (97140) may be bundled with CMT if same spinal region',
          action: 'Ensure documentation supports separate anatomic sites or use -59 modifier',
        },
        {
          codes: ['97110', '97530'],
          rule: 'Therapeutic exercise and activities may be considered duplicative',
          action: 'Document distinct goals and activities for each code',
        },
        {
          codes: ['97112', '97530'],
          rule: 'Neuromuscular re-education may overlap with therapeutic activities',
          action: 'Ensure documentation shows different therapeutic purposes',
        },
        {
          codes: ['97014', '97032'],
          rule: 'Cannot bill unattended and attended electrical stim same session',
          action: 'Choose one based on supervision level provided',
        },
      ];

      // ============================================
      // 1. E&M Level Optimization Analysis
      // ============================================

      interface EMAnalysis {
        codeType: 'new' | 'established';
        distribution: Record<string, number>;
        benchmark: Record<string, number>;
        totalVolume: number;
        avgLevel: number;
        benchmarkAvgLevel: number;
        variance: number;
        undercoding: boolean;
        overcoding: boolean;
        potentialRevenue: number;
        recommendations: string[];
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      // Get E&M charge distribution
      const emCharges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: {
            gte: startDate,
            lte: endDate,
          },
          ...(providerId && { providerId }),
          cptCode: {
            in: [
              '99201', '99202', '99203', '99204', '99205', // New patient
              '99211', '99212', '99213', '99214', '99215', // Established
            ],
          },
        },
        include: {
          provider: {
            include: {
              user: true,
            },
          },
          encounter: {
            include: {
              diagnoses: true,
              soapNote: true,
            },
          },
        },
      });

      // Separate new patient vs established
      const newPatientCodes = ['99201', '99202', '99203', '99204', '99205'];
      const establishedCodes = ['99211', '99212', '99213', '99214', '99215'];

      const newPatientCharges = emCharges.filter(c => newPatientCodes.includes(c.cptCode));
      const establishedCharges = emCharges.filter(c => establishedCodes.includes(c.cptCode));

      function analyzeEMDistribution(
        charges: typeof emCharges,
        benchmark: Record<string, number>,
        codeType: 'new' | 'established'
      ): EMAnalysis {
        const distribution: Record<string, number> = {};
        const codes = codeType === 'new' ? newPatientCodes : establishedCodes;
        const totalVolume = charges.length;

        // Count by code
        for (const code of codes) {
          const count = charges.filter(c => c.cptCode === code).length;
          distribution[code] = totalVolume > 0 ? count / totalVolume : 0;
        }

        // Calculate average level (1-5)
        const levelMap: Record<string, number> = codeType === 'new'
          ? { '99201': 1, '99202': 2, '99203': 3, '99204': 4, '99205': 5 }
          : { '99211': 1, '99212': 2, '99213': 3, '99214': 4, '99215': 5 };

        let avgLevel = 0;
        let benchmarkAvgLevel = 0;
        for (const [code, count] of Object.entries(distribution)) {
          avgLevel += levelMap[code] * count;
          benchmarkAvgLevel += levelMap[code] * (benchmark[code] || 0);
        }

        const variance = avgLevel - benchmarkAvgLevel;
        const undercoding = variance < -0.3;
        const overcoding = variance > 0.5;

        // Estimate potential revenue from optimized coding
        // Average revenue increase per level is ~$30-40
        const revenuePerLevelIncrease = 35;
        const potentialRevenue = undercoding
          ? Math.abs(variance) * totalVolume * revenuePerLevelIncrease * (12 / 6) // Annualized
          : 0;

        const recommendations: string[] = [];
        let priority: 'low' | 'medium' | 'high' | 'critical' = 'low';

        if (undercoding) {
          recommendations.push(`E&M levels are ${Math.abs(variance).toFixed(2)} levels below benchmark. Review documentation to support higher level coding.`);
          recommendations.push('Ensure medical decision making complexity is fully documented.');
          recommendations.push('Review time-based billing options for complex cases.');
          priority = potentialRevenue > 5000 ? 'high' : 'medium';
        } else if (overcoding) {
          recommendations.push(`E&M levels are ${variance.toFixed(2)} levels above benchmark. Review documentation support to ensure compliance.`);
          recommendations.push('Audit charts for documentation completeness to avoid downcoding on audit.');
          priority = 'critical'; // Compliance risk
        } else {
          recommendations.push('E&M level distribution is within normal parameters.');
        }

        return {
          codeType,
          distribution,
          benchmark,
          totalVolume,
          avgLevel,
          benchmarkAvgLevel,
          variance,
          undercoding,
          overcoding,
          potentialRevenue,
          recommendations,
          priority,
        };
      }

      const newPatientAnalysis = analyzeEMDistribution(
        newPatientCharges,
        EM_BENCHMARKS.newPatient,
        'new'
      );
      const establishedAnalysis = analyzeEMDistribution(
        establishedCharges,
        EM_BENCHMARKS.established,
        'established'
      );

      // ============================================
      // 2. Modifier Usage Analysis
      // ============================================

      interface ModifierAnalysis {
        modifier: string;
        description: string;
        currentUsage: number;
        missedOpportunities: number;
        potentialRevenue: number;
        recommendations: string[];
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      const modifierAnalysis: ModifierAnalysis[] = [];

      // Analyze -25 modifier usage on E&M codes billed with CMT
      const cmtCodes = ['98940', '98941', '98942', '98943'];
      const encountersWithCMT = await ctx.prisma.encounter.findMany({
        where: {
          organizationId,
          encounterDate: {
            gte: startDate,
            lte: endDate,
          },
          ...(providerId && { providerId }),
          charges: {
            some: {
              cptCode: { in: cmtCodes },
            },
          },
        },
        include: {
          charges: true,
        },
      });

      let mod25Used = 0;
      let mod25Missed = 0;
      let mod25MissedRevenue = 0;

      for (const encounter of encountersWithCMT) {
        const hasCMT = encounter.charges.some(c => cmtCodes.includes(c.cptCode));
        const hasEM = encounter.charges.find(c =>
          [...newPatientCodes, ...establishedCodes].includes(c.cptCode)
        );

        if (hasCMT && hasEM) {
          const emHasMod25 = hasEM.modifiers?.includes('-25') || hasEM.modifiers?.includes('25');
          if (emHasMod25) {
            mod25Used++;
          } else {
            mod25Missed++;
            // Estimate revenue impact (E&M often denied without -25)
            mod25MissedRevenue += Number(hasEM.fee) * 0.5; // 50% denial risk
          }
        }
      }

      if (mod25Missed > 0 || mod25Used > 0) {
        modifierAnalysis.push({
          modifier: '-25',
          description: MODIFIER_GUIDANCE['-25'].description,
          currentUsage: mod25Used,
          missedOpportunities: mod25Missed,
          potentialRevenue: mod25MissedRevenue * (12 / 6), // Annualized
          recommendations: mod25Missed > 0
            ? [
                `Found ${mod25Missed} E&M services billed same day as CMT without -25 modifier.`,
                'Review documentation to ensure E&M is separately identifiable.',
                'Add -25 modifier when documentation supports separate E&M service.',
              ]
            : ['Good -25 modifier usage on E&M + CMT encounters.'],
          priority: mod25Missed > 10 ? 'high' : mod25Missed > 0 ? 'medium' : 'low',
        });
      }

      // Analyze -AT modifier for Medicare CMT
      const medicareClaims = await ctx.prisma.claim.findMany({
        where: {
          organizationId,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
          payer: {
            name: { contains: 'Medicare' },
          },
        },
        include: {
          claimLines: {
            where: {
              cptCode: { in: cmtCodes },
            },
          },
        },
      });

      let modATUsed = 0;
      let modATMissed = 0;

      for (const claim of medicareClaims) {
        for (const line of claim.claimLines) {
          const hasAT = line.modifiers?.includes('-AT') || line.modifiers?.includes('AT');
          if (hasAT) {
            modATUsed++;
          } else if (line.cptCode && cmtCodes.includes(line.cptCode)) {
            modATMissed++;
          }
        }
      }

      if (modATMissed > 0 || modATUsed > 0) {
        modifierAnalysis.push({
          modifier: '-AT',
          description: MODIFIER_GUIDANCE['-AT'].description,
          currentUsage: modATUsed,
          missedOpportunities: modATMissed,
          potentialRevenue: modATMissed * 40, // Average Medicare CMT rate
          recommendations: modATMissed > 0
            ? [
                `Found ${modATMissed} Medicare CMT claims without -AT modifier.`,
                '-AT modifier is required for Medicare coverage of CMT.',
                'Ensure -AT is added to all Medicare CMT claims.',
              ]
            : ['Good -AT modifier usage on Medicare CMT claims.'],
          priority: modATMissed > 5 ? 'critical' : modATMissed > 0 ? 'high' : 'low',
        });
      }

      // ============================================
      // 3. Bundling/Unbundling Review
      // ============================================

      interface BundlingIssue {
        rule: string;
        codes: string[];
        occurrences: number;
        action: string;
        riskLevel: 'potential_denial' | 'compliance_risk' | 'unbundling_opportunity';
        potentialImpact: number;
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      const bundlingIssues: BundlingIssue[] = [];

      // Check for bundling issues in same-day encounters
      const encountersForBundling = await ctx.prisma.encounter.findMany({
        where: {
          organizationId,
          encounterDate: {
            gte: startDate,
            lte: endDate,
          },
          ...(providerId && { providerId }),
        },
        include: {
          charges: true,
        },
      });

      const bundlingCounts: Record<string, number> = {};

      for (const encounter of encountersForBundling) {
        const codes = encounter.charges.map(c => c.cptCode);

        for (const rule of BUNDLING_RULES) {
          const hasAllCodes = rule.codes.every(c => codes.includes(c));
          if (hasAllCodes) {
            const key = rule.codes.join('+');
            bundlingCounts[key] = (bundlingCounts[key] || 0) + 1;
          }
        }
      }

      for (const rule of BUNDLING_RULES) {
        const key = rule.codes.join('+');
        const count = bundlingCounts[key] || 0;

        if (count >= minVolumeThreshold) {
          bundlingIssues.push({
            rule: rule.rule,
            codes: rule.codes,
            occurrences: count,
            action: rule.action,
            riskLevel: 'potential_denial',
            potentialImpact: count * 25, // Average denial/reduction per occurrence
            priority: count > 50 ? 'high' : count > 20 ? 'medium' : 'low',
          });
        }
      }

      // Check for potential unbundling opportunities (97110 without units)
      const therapyCharges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: {
            gte: startDate,
            lte: endDate,
          },
          cptCode: { in: ['97110', '97112', '97140', '97530'] },
          units: 1,
        },
        include: {
          encounter: true,
        },
      });

      // Count encounters where therapy could potentially support more units
      const therapyEncounterIds = new Set(therapyCharges.map(c => c.encounterId));
      if (therapyEncounterIds.size > minVolumeThreshold) {
        bundlingIssues.push({
          rule: 'Therapy services billed at single unit may support additional units',
          codes: ['97110', '97112', '97140', '97530'],
          occurrences: therapyCharges.length,
          action: 'Review encounter documentation for time spent on therapeutic services. Each 15-minute interval supports one unit.',
          riskLevel: 'unbundling_opportunity',
          potentialImpact: therapyCharges.length * 15 * (12 / 6), // $15 per additional unit, annualized
          priority: therapyCharges.length > 100 ? 'high' : 'medium',
        });
      }

      // ============================================
      // 4. Provider Coding Comparison
      // ============================================

      interface ProviderCodingAnalysis {
        providerId: string;
        providerName: string;
        totalCharges: number;
        emDistribution: {
          avgLevel: number;
          variance: number;
        };
        modifierUsageRate: number;
        avgUnitsPerEncounter: number;
        avgRevenuePerEncounter: number;
        complianceScore: number; // 0-100
        recommendations: string[];
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      // Get all providers with charges in the period
      const providerCharges = await ctx.prisma.charge.groupBy({
        by: ['providerId'],
        where: {
          organizationId,
          serviceDate: {
            gte: startDate,
            lte: endDate,
          },
          providerId: { not: null },
        },
        _count: { id: true },
        _sum: { fee: true, units: true },
      });

      const providerCodingAnalysis: ProviderCodingAnalysis[] = [];

      for (const provData of providerCharges) {
        if (!provData.providerId) continue;
        if (provData._count.id < minVolumeThreshold) continue;

        // Get provider details
        const provider = await ctx.prisma.provider.findUnique({
          where: { id: provData.providerId },
          include: { user: true },
        });

        const providerName = provider?.user
          ? `${provider.user.firstName || ''} ${provider.user.lastName || ''}`.trim()
          : 'Unknown Provider';

        // Get E&M distribution for this provider
        const providerEM = emCharges.filter(c => c.providerId === provData.providerId);
        const providerEstablished = providerEM.filter(c => establishedCodes.includes(c.cptCode));

        let avgLevel = 0;
        if (providerEstablished.length > 0) {
          const levelMap: Record<string, number> = {
            '99211': 1, '99212': 2, '99213': 3, '99214': 4, '99215': 5,
          };
          avgLevel = providerEstablished.reduce((sum, c) => sum + (levelMap[c.cptCode] || 3), 0) / providerEstablished.length;
        }
        const variance = avgLevel - establishedAnalysis.benchmarkAvgLevel;

        // Calculate modifier usage rate
        const providerChargesWithModifiers = await ctx.prisma.charge.count({
          where: {
            organizationId,
            providerId: provData.providerId,
            serviceDate: { gte: startDate, lte: endDate },
            modifiers: { isEmpty: false },
          },
        });
        const modifierUsageRate = provData._count.id > 0
          ? (providerChargesWithModifiers / provData._count.id) * 100
          : 0;

        // Calculate avg units and revenue per encounter
        const providerEncounterCount = await ctx.prisma.encounter.count({
          where: {
            organizationId,
            providerId: provData.providerId,
            encounterDate: { gte: startDate, lte: endDate },
          },
        });

        const avgUnitsPerEncounter = providerEncounterCount > 0
          ? (provData._sum.units || 0) / providerEncounterCount
          : 0;
        const avgRevenuePerEncounter = providerEncounterCount > 0
          ? Number(provData._sum.fee || 0) / providerEncounterCount
          : 0;

        // Calculate compliance score (0-100)
        let complianceScore = 100;
        if (Math.abs(variance) > 1.0) complianceScore -= 30; // Large variance from benchmark
        else if (Math.abs(variance) > 0.5) complianceScore -= 15;
        if (modifierUsageRate < 10) complianceScore -= 10; // Low modifier usage
        if (variance > 0.5) complianceScore -= 20; // Potential upcoding

        const recommendations: string[] = [];
        let priority: 'low' | 'medium' | 'high' | 'critical' = 'low';

        if (variance < -0.5) {
          recommendations.push('E&M coding is significantly below benchmark. Consider education on documentation requirements for higher levels.');
          priority = 'medium';
        } else if (variance > 0.5) {
          recommendations.push('E&M coding is above benchmark. Audit documentation to ensure compliance.');
          priority = 'high';
        }

        if (modifierUsageRate < 10) {
          recommendations.push('Low modifier usage. Review modifier guidelines and implement training.');
          priority = priority === 'low' ? 'medium' : priority;
        }

        if (avgUnitsPerEncounter < 3) {
          recommendations.push('Low average units per encounter. Review documentation of time-based services.');
        }

        if (recommendations.length === 0) {
          recommendations.push('Coding patterns are within normal parameters.');
        }

        providerCodingAnalysis.push({
          providerId: provData.providerId,
          providerName,
          totalCharges: provData._count.id,
          emDistribution: {
            avgLevel,
            variance,
          },
          modifierUsageRate,
          avgUnitsPerEncounter,
          avgRevenuePerEncounter,
          complianceScore: Math.max(0, complianceScore),
          recommendations,
          priority,
        });
      }

      // Sort by compliance score (lowest first for attention)
      providerCodingAnalysis.sort((a, b) => a.complianceScore - b.complianceScore);

      // ============================================
      // 5. Documentation Improvement Suggestions
      // ============================================

      interface DocumentationSuggestion {
        category: string;
        issue: string;
        frequency: number;
        recommendation: string;
        potentialImpact: number;
        trainingResource?: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      const documentationSuggestions: DocumentationSuggestion[] = [];

      // Check for encounters with low documentation
      const encountersWithSOAP = await ctx.prisma.encounter.findMany({
        where: {
          organizationId,
          encounterDate: { gte: startDate, lte: endDate },
          ...(providerId && { providerId }),
        },
        include: {
          soapNote: true,
          diagnoses: true,
          charges: true,
        },
      });

      let noSoapCount = 0;
      let minimalDiagnosisCount = 0;
      let highEMWithLowDocCount = 0;

      for (const encounter of encountersWithSOAP) {
        if (!encounter.soapNote) {
          noSoapCount++;
        }

        if (encounter.diagnoses.length < 2) {
          minimalDiagnosisCount++;
        }

        // Check for high-level E&M with minimal documentation
        const highLevelEM = encounter.charges.find(c =>
          ['99204', '99205', '99214', '99215'].includes(c.cptCode)
        );
        if (highLevelEM && (!encounter.soapNote || encounter.diagnoses.length < 2)) {
          highEMWithLowDocCount++;
        }
      }

      if (noSoapCount > 10) {
        documentationSuggestions.push({
          category: 'SOAP Notes',
          issue: `${noSoapCount} encounters without SOAP documentation`,
          frequency: noSoapCount,
          recommendation: 'Implement required SOAP note completion before charge entry. Consider voice-to-text or templates.',
          potentialImpact: noSoapCount * 50, // Risk of denials and audits
          trainingResource: 'SOAP Note Documentation Guidelines',
          priority: noSoapCount > 50 ? 'critical' : 'high',
        });
      }

      if (minimalDiagnosisCount > encountersWithSOAP.length * 0.3) {
        documentationSuggestions.push({
          category: 'Diagnosis Coding',
          issue: `${minimalDiagnosisCount} encounters with fewer than 2 diagnosis codes`,
          frequency: minimalDiagnosisCount,
          recommendation: 'Document all relevant diagnoses to support medical necessity and optimize coding.',
          potentialImpact: minimalDiagnosisCount * 20,
          trainingResource: 'ICD-10 Coding for Chiropractic',
          priority: 'medium',
        });
      }

      if (highEMWithLowDocCount > 10) {
        documentationSuggestions.push({
          category: 'E&M Documentation',
          issue: `${highEMWithLowDocCount} high-level E&M codes with minimal documentation`,
          frequency: highEMWithLowDocCount,
          recommendation: 'High-level E&M (99214/99215) requires comprehensive documentation. Implement documentation review before claim submission.',
          potentialImpact: highEMWithLowDocCount * 75, // High audit risk
          trainingResource: 'E&M Documentation Requirements 2023',
          priority: 'critical',
        });
      }

      // ============================================
      // 6. Compliant Revenue Increase Opportunities
      // ============================================

      interface RevenueOpportunity {
        category: string;
        title: string;
        description: string;
        estimatedAnnualRevenue: number;
        complianceRisk: 'none' | 'low' | 'medium' | 'high';
        implementationEffort: 'easy' | 'moderate' | 'complex';
        steps: string[];
        priority: 'low' | 'medium' | 'high' | 'critical';
      }

      const revenueOpportunities: RevenueOpportunity[] = [];

      // Opportunity from E&M optimization
      if (newPatientAnalysis.undercoding || establishedAnalysis.undercoding) {
        const totalPotential = newPatientAnalysis.potentialRevenue + establishedAnalysis.potentialRevenue;
        if (totalPotential > 1000) {
          revenueOpportunities.push({
            category: 'E&M Optimization',
            title: 'Optimize E&M Level Coding',
            description: 'E&M levels are below benchmark, suggesting potential undercoding.',
            estimatedAnnualRevenue: totalPotential,
            complianceRisk: 'none',
            implementationEffort: 'moderate',
            steps: [
              'Review E&M documentation requirements for each level',
              'Implement documentation templates that capture MDM elements',
              'Consider time-based billing for complex encounters',
              'Provide coding education to providers',
            ],
            priority: totalPotential > 5000 ? 'high' : 'medium',
          });
        }
      }

      // Opportunity from modifier usage
      const modifierPotential = modifierAnalysis.reduce((sum, m) => sum + m.potentialRevenue, 0);
      if (modifierPotential > 1000) {
        revenueOpportunities.push({
          category: 'Modifier Usage',
          title: 'Improve Modifier Application',
          description: 'Missed modifier opportunities are causing preventable denials.',
          estimatedAnnualRevenue: modifierPotential,
          complianceRisk: 'none',
          implementationEffort: 'easy',
          steps: [
            'Create modifier decision tree for common scenarios',
            'Add modifier prompts to charge entry workflow',
            'Train billing staff on modifier requirements',
            'Implement automated modifier checks before claim submission',
          ],
          priority: modifierPotential > 3000 ? 'high' : 'medium',
        });
      }

      // Opportunity from therapy unit optimization
      const unbundlingIssue = bundlingIssues.find(b => b.riskLevel === 'unbundling_opportunity');
      if (unbundlingIssue && unbundlingIssue.potentialImpact > 1000) {
        revenueOpportunities.push({
          category: 'Therapy Billing',
          title: 'Optimize Therapy Unit Billing',
          description: 'Many therapy services billed at single unit may support additional units based on time.',
          estimatedAnnualRevenue: unbundlingIssue.potentialImpact,
          complianceRisk: 'low',
          implementationEffort: 'moderate',
          steps: [
            'Implement time tracking for therapy services',
            'Train providers on time documentation requirements',
            'Update charge entry to prompt for time spent',
            'Review 8-minute rule for unit calculation',
          ],
          priority: 'medium',
        });
      }

      // Sort by estimated revenue
      revenueOpportunities.sort((a, b) => b.estimatedAnnualRevenue - a.estimatedAnnualRevenue);

      // ============================================
      // 7. Persist Results and Generate Summary
      // ============================================

      // Create revenue opportunities in database
      for (const opp of revenueOpportunities.slice(0, 5)) {
        await ctx.prisma.revenueOpportunity.create({
          data: {
            opportunityType: `coding_${opp.category.toLowerCase().replace(/\s+/g, '_')}`,
            title: opp.title,
            description: opp.description,
            estimatedValue: new Decimal(opp.estimatedAnnualRevenue),
            confidence: new Decimal(opp.complianceRisk === 'none' ? 85 : opp.complianceRisk === 'low' ? 75 : 60),
            status: 'identified',
            notes: opp.steps.join('\n'),
            organizationId,
          },
        });
      }

      // Calculate summary metrics
      const totalPotentialRevenue = revenueOpportunities.reduce((sum, o) => sum + o.estimatedAnnualRevenue, 0);
      const criticalIssues = [
        ...providerCodingAnalysis.filter(p => p.priority === 'critical'),
        ...documentationSuggestions.filter(d => d.priority === 'critical'),
        ...modifierAnalysis.filter(m => m.priority === 'critical'),
      ].length;

      const summary = {
        dateRange: { from: startDate, to: endDate },
        chargesAnalyzed: emCharges.length + therapyCharges.length,
        encountersAnalyzed: encountersWithSOAP.length,
        providersAnalyzed: providerCodingAnalysis.length,
        criticalIssuesFound: criticalIssues,
        totalPotentialRevenue,
        emOptimization: {
          newPatient: {
            avgLevel: newPatientAnalysis.avgLevel,
            variance: newPatientAnalysis.variance,
            undercoding: newPatientAnalysis.undercoding,
          },
          established: {
            avgLevel: establishedAnalysis.avgLevel,
            variance: establishedAnalysis.variance,
            undercoding: establishedAnalysis.undercoding,
          },
        },
        modifierIssues: modifierAnalysis.filter(m => m.missedOpportunities > 0).length,
        bundlingIssues: bundlingIssues.length,
        documentationIssues: documentationSuggestions.length,
      };

      return {
        success: true,
        summary,
        emAnalysis: {
          newPatient: newPatientAnalysis,
          established: establishedAnalysis,
        },
        modifierAnalysis,
        bundlingIssues,
        providerCodingAnalysis,
        documentationSuggestions,
        revenueOpportunities,
        analyzedAt: new Date(),
      };
    }),

  /**
   * Get coding optimization summary
   */
  getCodingOptimizationSummary: billerProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.user.organizationId;

    // Get coding-related opportunities
    const opportunities = await ctx.prisma.revenueOpportunity.findMany({
      where: {
        organizationId,
        opportunityType: {
          startsWith: 'coding_',
        },
        status: {
          in: ['identified', 'in_progress'],
        },
      },
      orderBy: { estimatedValue: 'desc' },
    });

    // Get captured value from coding optimizations in last 12 months
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const capturedOpportunities = await ctx.prisma.revenueOpportunity.findMany({
      where: {
        organizationId,
        opportunityType: {
          startsWith: 'coding_',
        },
        status: 'captured',
        capturedAt: {
          gte: yearAgo,
        },
      },
    });

    return {
      activeOpportunities: opportunities.length,
      totalEstimatedValue: opportunities.reduce((sum, o) => sum + Number(o.estimatedValue), 0),
      capturedThisYear: capturedOpportunities.reduce((sum, o) => sum + Number(o.capturedValue || 0), 0),
      opportunities: opportunities.slice(0, 10).map(o => ({
        id: o.id,
        type: o.opportunityType,
        title: o.title,
        estimatedValue: Number(o.estimatedValue),
        status: o.status,
      })),
    };
  }),

  /**
   * Get provider coding comparison
   */
  getProviderCodingComparison: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { dateFrom, dateTo } = input;
      const organizationId = ctx.user.organizationId;

      const endDate = dateTo || new Date();
      const startDate = dateFrom || new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Get E&M distribution by provider
      const providers = await ctx.prisma.provider.findMany({
        where: { organizationId },
        include: { user: true },
      });

      const comparison: Array<{
        providerId: string;
        providerName: string;
        emVolume: number;
        avgLevel: number;
        modifierUsage: number;
        avgChargeAmount: number;
      }> = [];

      for (const provider of providers) {
        const providerCharges = await ctx.prisma.charge.findMany({
          where: {
            organizationId,
            providerId: provider.id,
            serviceDate: { gte: startDate, lte: endDate },
            cptCode: {
              in: ['99211', '99212', '99213', '99214', '99215'],
            },
          },
        });

        if (providerCharges.length < 10) continue;

        const levelMap: Record<string, number> = {
          '99211': 1, '99212': 2, '99213': 3, '99214': 4, '99215': 5,
        };
        const avgLevel = providerCharges.reduce(
          (sum, c) => sum + (levelMap[c.cptCode] || 3), 0
        ) / providerCharges.length;

        const withModifiers = providerCharges.filter(c => c.modifiers && c.modifiers.length > 0).length;
        const modifierUsage = (withModifiers / providerCharges.length) * 100;

        const avgChargeAmount = providerCharges.reduce(
          (sum, c) => sum + Number(c.fee), 0
        ) / providerCharges.length;

        comparison.push({
          providerId: provider.id,
          providerName: provider.user
            ? `${provider.user.firstName || ''} ${provider.user.lastName || ''}`.trim()
            : 'Unknown',
          emVolume: providerCharges.length,
          avgLevel,
          modifierUsage,
          avgChargeAmount,
        });
      }

      // Calculate benchmarks
      const avgLevelBenchmark = comparison.length > 0
        ? comparison.reduce((sum, c) => sum + c.avgLevel, 0) / comparison.length
        : 3.0;

      return {
        comparison: comparison.sort((a, b) => b.emVolume - a.emVolume),
        benchmark: {
          avgLevel: avgLevelBenchmark,
          modifierUsage: 15, // Industry benchmark
        },
        dateRange: { from: startDate, to: endDate },
      };
    }),

  /**
   * Act on a coding optimization recommendation
   */
  actOnCodingRecommendation: billerProcedure
    .input(
      z.object({
        opportunityId: z.string(),
        action: z.enum(['start', 'complete', 'decline']),
        capturedValue: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { opportunityId, action, capturedValue, notes } = input;

      const opportunity = await ctx.prisma.revenueOpportunity.findFirst({
        where: {
          id: opportunityId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!opportunity) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Opportunity not found',
        });
      }

      let newStatus: string;
      switch (action) {
        case 'start':
          newStatus = 'in_progress';
          break;
        case 'complete':
          newStatus = 'captured';
          break;
        case 'decline':
          newStatus = 'declined';
          break;
      }

      const updated = await ctx.prisma.revenueOpportunity.update({
        where: { id: opportunityId },
        data: {
          status: newStatus,
          ...(action === 'complete' && {
            capturedValue: capturedValue ? new Decimal(capturedValue) : null,
            capturedAt: new Date(),
            capturedBy: ctx.user.id,
          }),
          notes: notes || opportunity.notes,
        },
      });

      // Create optimization action record
      if (action === 'complete') {
        await ctx.prisma.optimizationAction.create({
          data: {
            actionType: 'coding_optimization',
            action: `Completed: ${opportunity.title}`,
            projectedImpact: opportunity.estimatedValue,
            actualImpact: capturedValue ? new Decimal(capturedValue) : null,
            status: 'completed',
            completedAt: new Date(),
            completedBy: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });
      }

      return {
        success: true,
        opportunity: updated,
      };
    }),

  // ============================================
  // US-344: Contract Analysis
  // ============================================

  /**
   * Analyze payer contracts for optimization
   * Reviews reimbursement rates, compares to market, identifies renegotiation opportunities
   */
  analyzeContracts: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        payerIds: z.array(z.string()).optional(),
        minClaimVolume: z.number().default(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { dateFrom, dateTo, payerIds, minClaimVolume } = input;
      const organizationId = ctx.user.organizationId;

      const endDate = dateTo || new Date();
      const startDate = dateFrom || new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000); // Default 1 year

      // Market benchmark rates (typical Medicare % and regional variations)
      const MARKET_BENCHMARKS: Record<string, {
        medicarePercent: number; // Expected % of Medicare
        minAcceptable: number;
        regional: { low: number; mid: number; high: number };
      }> = {
        // E&M Codes
        '99201': { medicarePercent: 120, minAcceptable: 100, regional: { low: 95, mid: 120, high: 145 } },
        '99202': { medicarePercent: 125, minAcceptable: 100, regional: { low: 100, mid: 125, high: 150 } },
        '99203': { medicarePercent: 130, minAcceptable: 105, regional: { low: 105, mid: 130, high: 155 } },
        '99204': { medicarePercent: 135, minAcceptable: 110, regional: { low: 110, mid: 135, high: 160 } },
        '99205': { medicarePercent: 140, minAcceptable: 115, regional: { low: 115, mid: 140, high: 165 } },
        '99211': { medicarePercent: 115, minAcceptable: 95, regional: { low: 90, mid: 115, high: 140 } },
        '99212': { medicarePercent: 120, minAcceptable: 100, regional: { low: 95, mid: 120, high: 145 } },
        '99213': { medicarePercent: 125, minAcceptable: 105, regional: { low: 100, mid: 125, high: 150 } },
        '99214': { medicarePercent: 130, minAcceptable: 110, regional: { low: 105, mid: 130, high: 155 } },
        '99215': { medicarePercent: 135, minAcceptable: 115, regional: { low: 110, mid: 135, high: 160 } },
        // CMT Codes
        '98940': { medicarePercent: 130, minAcceptable: 100, regional: { low: 100, mid: 130, high: 160 } },
        '98941': { medicarePercent: 135, minAcceptable: 105, regional: { low: 105, mid: 135, high: 165 } },
        '98942': { medicarePercent: 140, minAcceptable: 110, regional: { low: 110, mid: 140, high: 170 } },
        '98943': { medicarePercent: 130, minAcceptable: 100, regional: { low: 100, mid: 130, high: 160 } },
        // Therapy Codes
        '97110': { medicarePercent: 125, minAcceptable: 100, regional: { low: 95, mid: 125, high: 155 } },
        '97112': { medicarePercent: 125, minAcceptable: 100, regional: { low: 95, mid: 125, high: 155 } },
        '97140': { medicarePercent: 125, minAcceptable: 100, regional: { low: 95, mid: 125, high: 155 } },
        '97530': { medicarePercent: 130, minAcceptable: 105, regional: { low: 100, mid: 130, high: 160 } },
        // Exam Codes
        '97161': { medicarePercent: 135, minAcceptable: 110, regional: { low: 105, mid: 135, high: 165 } },
        '97162': { medicarePercent: 140, minAcceptable: 115, regional: { low: 110, mid: 140, high: 170 } },
        '97163': { medicarePercent: 145, minAcceptable: 120, regional: { low: 115, mid: 145, high: 175 } },
      };

      // Medicare base rates (2024 approximate)
      const MEDICARE_RATES: Record<string, number> = {
        '99201': 45, '99202': 65, '99203': 95, '99204': 145, '99205': 185,
        '99211': 22, '99212': 45, '99213': 75, '99214': 110, '99215': 150,
        '98940': 32, '98941': 42, '98942': 52, '98943': 30,
        '97110': 33, '97112': 35, '97140': 32, '97530': 38,
        '97161': 95, '97162': 125, '97163': 145,
      };

      // Get payers
      const payerFilter = payerIds && payerIds.length > 0 ? { id: { in: payerIds } } : {};
      const payers = await ctx.prisma.insurancePayer.findMany({
        where: {
          ...payerFilter,
          claims: {
            some: {
              organizationId,
              createdDate: {
                gte: startDate,
                lte: endDate,
              },
            },
          },
        },
      });

      // Analyze each payer's contract performance
      interface ContractAnalysis {
        payerId: string;
        payerName: string;
        claimVolume: number;
        totalBilled: number;
        totalAllowed: number;
        totalPaid: number;
        avgReimbursementRate: number;
        avgDaysToPayment: number;
        denialRate: number;
        cptAnalysis: Array<{
          cptCode: string;
          volume: number;
          avgBilled: number;
          avgAllowed: number;
          avgPaid: number;
          reimbursementPercent: number;
          medicarePercent: number;
          marketComparison: 'below_market' | 'at_market' | 'above_market';
          annualImpact: number;
        }>;
        overallRating: 'poor' | 'below_average' | 'average' | 'good' | 'excellent';
        renegotiationPriority: 'low' | 'medium' | 'high' | 'critical';
        estimatedAnnualOpportunity: number;
        recommendations: string[];
        negotiationTalkingPoints: string[];
      }

      const contractAnalyses: ContractAnalysis[] = [];

      for (const payer of payers) {
        // Get claims for this payer
        const claims = await ctx.prisma.claim.findMany({
          where: {
            organizationId,
            payerId: payer.id,
            createdDate: {
              gte: startDate,
              lte: endDate,
            },
            status: {
              in: ['PAID', 'DENIED', 'ACCEPTED'],
            },
          },
          include: {
            claimLines: true,
          },
        });

        if (claims.length < minClaimVolume) continue;

        // Calculate overall metrics
        const totalBilled = claims.reduce((sum, c) => sum + Number(c.totalCharges), 0);
        const totalAllowed = claims.reduce((sum, c) => sum + Number(c.totalAllowed), 0);
        const totalPaid = claims.reduce((sum, c) => sum + Number(c.totalPaid), 0);
        const deniedClaims = claims.filter(c => c.status === 'DENIED').length;
        const denialRate = (deniedClaims / claims.length) * 100;

        // Calculate days to payment
        const paymentDays: number[] = [];
        for (const claim of claims) {
          if (claim.paidDate && claim.submittedDate) {
            const days = Math.floor(
              (claim.paidDate.getTime() - claim.submittedDate.getTime()) / (24 * 60 * 60 * 1000)
            );
            if (days > 0 && days < 365) paymentDays.push(days);
          }
        }
        const avgDaysToPayment = paymentDays.length > 0
          ? paymentDays.reduce((a, b) => a + b, 0) / paymentDays.length
          : 0;

        // Analyze by CPT code
        const cptStats: Record<string, {
          volume: number;
          totalBilled: number;
          totalAllowed: number;
          totalPaid: number;
        }> = {};

        for (const claim of claims) {
          for (const line of claim.claimLines) {
            if (!cptStats[line.cptCode]) {
              cptStats[line.cptCode] = { volume: 0, totalBilled: 0, totalAllowed: 0, totalPaid: 0 };
            }
            cptStats[line.cptCode].volume += line.units;
            cptStats[line.cptCode].totalBilled += Number(line.chargedAmount) * line.units;
            cptStats[line.cptCode].totalAllowed += Number(line.allowedAmount) * line.units;
            cptStats[line.cptCode].totalPaid += Number(line.paidAmount) * line.units;
          }
        }

        const cptAnalysis: ContractAnalysis['cptAnalysis'] = [];
        let totalOpportunity = 0;

        for (const [cptCode, stats] of Object.entries(cptStats)) {
          if (stats.volume < 5) continue;

          const avgBilled = stats.totalBilled / stats.volume;
          const avgAllowed = stats.totalAllowed / stats.volume;
          const avgPaid = stats.totalPaid / stats.volume;
          const reimbursementPercent = avgBilled > 0 ? (avgPaid / avgBilled) * 100 : 0;

          // Compare to Medicare
          const medicareRate = MEDICARE_RATES[cptCode] || 0;
          const medicarePercent = medicareRate > 0 ? (avgPaid / medicareRate) * 100 : 0;

          // Compare to market benchmarks
          const benchmark = MARKET_BENCHMARKS[cptCode];
          let marketComparison: 'below_market' | 'at_market' | 'above_market' = 'at_market';
          let opportunity = 0;

          if (benchmark && medicareRate > 0) {
            const expectedRate = (benchmark.medicarePercent / 100) * medicareRate;
            if (avgPaid < expectedRate * 0.9) {
              marketComparison = 'below_market';
              opportunity = (expectedRate - avgPaid) * stats.volume;
            } else if (avgPaid > expectedRate * 1.1) {
              marketComparison = 'above_market';
            }
          }

          totalOpportunity += opportunity;

          cptAnalysis.push({
            cptCode,
            volume: stats.volume,
            avgBilled,
            avgAllowed,
            avgPaid,
            reimbursementPercent,
            medicarePercent,
            marketComparison,
            annualImpact: opportunity,
          });
        }

        // Sort by opportunity
        cptAnalysis.sort((a, b) => b.annualImpact - a.annualImpact);

        // Calculate overall rating
        const avgReimbursementRate = totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0;
        let overallRating: ContractAnalysis['overallRating'] = 'average';
        let renegotiationPriority: ContractAnalysis['renegotiationPriority'] = 'low';

        if (avgReimbursementRate < 40) {
          overallRating = 'poor';
          renegotiationPriority = 'critical';
        } else if (avgReimbursementRate < 50) {
          overallRating = 'below_average';
          renegotiationPriority = 'high';
        } else if (avgReimbursementRate < 60) {
          overallRating = 'average';
          renegotiationPriority = totalOpportunity > 10000 ? 'high' : 'medium';
        } else if (avgReimbursementRate < 70) {
          overallRating = 'good';
          renegotiationPriority = totalOpportunity > 20000 ? 'medium' : 'low';
        } else {
          overallRating = 'excellent';
          renegotiationPriority = 'low';
        }

        // Adjust for denial rate and payment speed
        if (denialRate > 15) {
          if (renegotiationPriority === 'low') renegotiationPriority = 'medium';
          else if (renegotiationPriority === 'medium') renegotiationPriority = 'high';
        }
        if (avgDaysToPayment > 45) {
          if (renegotiationPriority === 'low') renegotiationPriority = 'medium';
        }

        // Generate recommendations
        const recommendations: string[] = [];
        const negotiationTalkingPoints: string[] = [];

        // Low reimbursement codes
        const lowCodes = cptAnalysis.filter(c => c.marketComparison === 'below_market').slice(0, 5);
        if (lowCodes.length > 0) {
          recommendations.push(
            `Request fee increase for ${lowCodes.length} underpriced CPT codes with ${lowCodes.reduce((s, c) => s + c.annualImpact, 0).toFixed(0)} annual opportunity`
          );
          for (const code of lowCodes) {
            const benchmark = MARKET_BENCHMARKS[code.cptCode];
            const medicareRate = MEDICARE_RATES[code.cptCode];
            if (benchmark && medicareRate) {
              const targetRate = (benchmark.regional.mid / 100) * medicareRate;
              negotiationTalkingPoints.push(
                `${code.cptCode}: Currently paying $${code.avgPaid.toFixed(2)} (${code.medicarePercent.toFixed(0)}% Medicare). Market mid-point is $${targetRate.toFixed(2)} (${benchmark.regional.mid}% Medicare). Request increase to at least $${targetRate.toFixed(2)}.`
              );
            }
          }
        }

        // Denial rate issues
        if (denialRate > 10) {
          recommendations.push(
            `Address ${denialRate.toFixed(1)}% denial rate - request clear denial criteria and pre-authorization guidelines`
          );
          negotiationTalkingPoints.push(
            `Denial rate of ${denialRate.toFixed(1)}% exceeds industry standard of 5-10%. Request specific documentation requirements and simplified pre-authorization process.`
          );
        }

        // Payment speed issues
        if (avgDaysToPayment > 30) {
          recommendations.push(
            `Negotiate faster payment terms - current ${avgDaysToPayment.toFixed(0)} days exceeds 30-day standard`
          );
          negotiationTalkingPoints.push(
            `Current average payment time of ${avgDaysToPayment.toFixed(0)} days impacts practice cash flow. Request contract amendment for 30-day clean claim payment.`
          );
        }

        // Volume leverage
        if (claims.length > 100) {
          negotiationTalkingPoints.push(
            `Practice submitted ${claims.length} claims worth $${totalBilled.toFixed(2)} in the analysis period, demonstrating significant patient volume with ${payer.name}.`
          );
        }

        // Overall contract health
        if (overallRating === 'poor' || overallRating === 'below_average') {
          recommendations.push(
            `Consider dropping ${payer.name} if renegotiation fails - overall reimbursement rate of ${avgReimbursementRate.toFixed(1)}% is unsustainable`
          );
        }

        contractAnalyses.push({
          payerId: payer.id,
          payerName: payer.name,
          claimVolume: claims.length,
          totalBilled,
          totalAllowed,
          totalPaid,
          avgReimbursementRate,
          avgDaysToPayment,
          denialRate,
          cptAnalysis: cptAnalysis.slice(0, 20),
          overallRating,
          renegotiationPriority,
          estimatedAnnualOpportunity: totalOpportunity,
          recommendations,
          negotiationTalkingPoints,
        });
      }

      // Sort by opportunity
      contractAnalyses.sort((a, b) => b.estimatedAnnualOpportunity - a.estimatedAnnualOpportunity);

      // Create revenue opportunities for top contracts needing renegotiation
      const opportunitiesToCreate = contractAnalyses
        .filter(c => c.renegotiationPriority === 'critical' || c.renegotiationPriority === 'high')
        .slice(0, 5);

      for (const analysis of opportunitiesToCreate) {
        // Check if opportunity already exists
        const existing = await ctx.prisma.revenueOpportunity.findFirst({
          where: {
            organizationId,
            opportunityType: 'contract_renegotiation',
            payerName: analysis.payerName,
            status: { in: ['identified', 'in_progress'] },
          },
        });

        if (!existing) {
          await ctx.prisma.revenueOpportunity.create({
            data: {
              opportunityType: 'contract_renegotiation',
              title: `Renegotiate ${analysis.payerName} contract`,
              description: `Current reimbursement rate of ${analysis.avgReimbursementRate.toFixed(1)}% is ${analysis.overallRating}. ${analysis.recommendations[0] || 'Review contract terms.'}`,
              estimatedValue: new Decimal(analysis.estimatedAnnualOpportunity),
              confidence: new Decimal(70),
              payerName: analysis.payerName,
              status: 'identified',
              organizationId,
            },
          });
        }
      }

      // Summary
      const summary = {
        payersAnalyzed: contractAnalyses.length,
        totalAnnualOpportunity: contractAnalyses.reduce((s, c) => s + c.estimatedAnnualOpportunity, 0),
        criticalContracts: contractAnalyses.filter(c => c.renegotiationPriority === 'critical').length,
        highPriorityContracts: contractAnalyses.filter(c => c.renegotiationPriority === 'high').length,
        avgReimbursementRate: contractAnalyses.length > 0
          ? contractAnalyses.reduce((s, c) => s + c.avgReimbursementRate, 0) / contractAnalyses.length
          : 0,
        avgDaysToPayment: contractAnalyses.length > 0
          ? contractAnalyses.reduce((s, c) => s + c.avgDaysToPayment, 0) / contractAnalyses.length
          : 0,
      };

      return {
        success: true,
        summary,
        contracts: contractAnalyses,
        dateRange: { from: startDate, to: endDate },
        analyzedAt: new Date(),
      };
    }),

  /**
   * Get contract performance summary
   */
  getContractPerformance: billerProcedure
    .input(
      z.object({
        payerId: z.string(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { payerId, dateFrom, dateTo } = input;
      const organizationId = ctx.user.organizationId;

      const endDate = dateTo || new Date();
      const startDate = dateFrom || new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);

      // Get payer details
      const payer = await ctx.prisma.insurancePayer.findUnique({
        where: { id: payerId },
      });

      if (!payer) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payer not found',
        });
      }

      // Get performance over time (by month)
      const claims = await ctx.prisma.claim.findMany({
        where: {
          organizationId,
          payerId,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { createdDate: 'asc' },
      });

      // Group by month
      const monthlyPerformance: Array<{
        month: string;
        claimCount: number;
        totalBilled: number;
        totalPaid: number;
        reimbursementRate: number;
        denialCount: number;
        denialRate: number;
      }> = [];

      const byMonth: Record<string, {
        claims: number;
        billed: number;
        paid: number;
        denials: number;
      }> = {};

      for (const claim of claims) {
        const monthKey = `${claim.createdDate.getFullYear()}-${String(claim.createdDate.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonth[monthKey]) {
          byMonth[monthKey] = { claims: 0, billed: 0, paid: 0, denials: 0 };
        }
        byMonth[monthKey].claims++;
        byMonth[monthKey].billed += Number(claim.totalCharges);
        byMonth[monthKey].paid += Number(claim.totalPaid);
        if (claim.status === 'DENIED') byMonth[monthKey].denials++;
      }

      for (const [month, data] of Object.entries(byMonth).sort()) {
        monthlyPerformance.push({
          month,
          claimCount: data.claims,
          totalBilled: data.billed,
          totalPaid: data.paid,
          reimbursementRate: data.billed > 0 ? (data.paid / data.billed) * 100 : 0,
          denialCount: data.denials,
          denialRate: data.claims > 0 ? (data.denials / data.claims) * 100 : 0,
        });
      }

      // Calculate trends
      const trend = {
        reimbursementTrend: 'stable' as 'improving' | 'stable' | 'declining',
        denialTrend: 'stable' as 'improving' | 'stable' | 'worsening',
      };

      if (monthlyPerformance.length >= 3) {
        const recent = monthlyPerformance.slice(-3);
        const earlier = monthlyPerformance.slice(0, Math.min(3, monthlyPerformance.length - 3));

        if (earlier.length > 0) {
          const recentAvgRate = recent.reduce((s, m) => s + m.reimbursementRate, 0) / recent.length;
          const earlierAvgRate = earlier.reduce((s, m) => s + m.reimbursementRate, 0) / earlier.length;

          if (recentAvgRate > earlierAvgRate + 5) trend.reimbursementTrend = 'improving';
          else if (recentAvgRate < earlierAvgRate - 5) trend.reimbursementTrend = 'declining';

          const recentAvgDenial = recent.reduce((s, m) => s + m.denialRate, 0) / recent.length;
          const earlierAvgDenial = earlier.reduce((s, m) => s + m.denialRate, 0) / earlier.length;

          if (recentAvgDenial < earlierAvgDenial - 3) trend.denialTrend = 'improving';
          else if (recentAvgDenial > earlierAvgDenial + 3) trend.denialTrend = 'worsening';
        }
      }

      // Calculate overall stats
      const totalBilled = claims.reduce((s, c) => s + Number(c.totalCharges), 0);
      const totalPaid = claims.reduce((s, c) => s + Number(c.totalPaid), 0);
      const totalDenials = claims.filter(c => c.status === 'DENIED').length;

      return {
        payer: {
          id: payer.id,
          name: payer.name,
          payerId: payer.payerId,
        },
        overall: {
          claimCount: claims.length,
          totalBilled,
          totalPaid,
          reimbursementRate: totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0,
          denialCount: totalDenials,
          denialRate: claims.length > 0 ? (totalDenials / claims.length) * 100 : 0,
        },
        monthlyPerformance,
        trend,
        dateRange: { from: startDate, to: endDate },
      };
    }),

  /**
   * Get contract analysis summary for dashboard
   */
  getContractAnalysisSummary: billerProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.user.organizationId;

    // Get contract-related opportunities
    const opportunities = await ctx.prisma.revenueOpportunity.findMany({
      where: {
        organizationId,
        opportunityType: 'contract_renegotiation',
        status: { in: ['identified', 'in_progress'] },
      },
      orderBy: { estimatedValue: 'desc' },
    });

    // Get captured value from contract negotiations in last 12 months
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const capturedOpportunities = await ctx.prisma.revenueOpportunity.findMany({
      where: {
        organizationId,
        opportunityType: 'contract_renegotiation',
        status: 'captured',
        capturedAt: { gte: yearAgo },
      },
    });

    // Get payer count with recent claims
    const payerCount = await ctx.prisma.insurancePayer.count({
      where: {
        claims: {
          some: {
            organizationId,
            createdDate: { gte: yearAgo },
          },
        },
      },
    });

    return {
      payersWithActivity: payerCount,
      activeOpportunities: opportunities.length,
      totalEstimatedValue: opportunities.reduce((sum, o) => sum + Number(o.estimatedValue), 0),
      capturedThisYear: capturedOpportunities.reduce((sum, o) => sum + Number(o.capturedValue || 0), 0),
      topOpportunities: opportunities.slice(0, 5).map(o => ({
        id: o.id,
        payerName: o.payerName,
        estimatedValue: Number(o.estimatedValue),
        status: o.status,
      })),
    };
  }),

  /**
   * Model the impact of a proposed contract change
   */
  modelContractChange: billerProcedure
    .input(
      z.object({
        payerId: z.string(),
        proposedChanges: z.array(
          z.object({
            cptCode: z.string(),
            currentRate: z.number(),
            proposedRate: z.number(),
          })
        ),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { payerId, proposedChanges, dateFrom, dateTo } = input;
      const organizationId = ctx.user.organizationId;

      const endDate = dateTo || new Date();
      const startDate = dateFrom || new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);

      // Get historical volume by CPT code
      const claims = await ctx.prisma.claim.findMany({
        where: {
          organizationId,
          payerId,
          createdDate: { gte: startDate, lte: endDate },
          status: { in: ['PAID', 'ACCEPTED'] },
        },
        include: {
          claimLines: true,
        },
      });

      // Calculate volume by CPT
      const volumeByCpt: Record<string, number> = {};
      for (const claim of claims) {
        for (const line of claim.claimLines) {
          volumeByCpt[line.cptCode] = (volumeByCpt[line.cptCode] || 0) + line.units;
        }
      }

      // Model impact
      const impactByCode: Array<{
        cptCode: string;
        volume: number;
        currentRate: number;
        proposedRate: number;
        changePercent: number;
        currentAnnualRevenue: number;
        projectedAnnualRevenue: number;
        annualImpact: number;
      }> = [];

      let totalCurrentRevenue = 0;
      let totalProjectedRevenue = 0;

      for (const change of proposedChanges) {
        const volume = volumeByCpt[change.cptCode] || 0;
        if (volume === 0) continue;

        const currentAnnual = change.currentRate * volume;
        const projectedAnnual = change.proposedRate * volume;
        const impact = projectedAnnual - currentAnnual;
        const changePercent = change.currentRate > 0
          ? ((change.proposedRate - change.currentRate) / change.currentRate) * 100
          : 0;

        totalCurrentRevenue += currentAnnual;
        totalProjectedRevenue += projectedAnnual;

        impactByCode.push({
          cptCode: change.cptCode,
          volume,
          currentRate: change.currentRate,
          proposedRate: change.proposedRate,
          changePercent,
          currentAnnualRevenue: currentAnnual,
          projectedAnnualRevenue: projectedAnnual,
          annualImpact: impact,
        });
      }

      // Sort by impact
      impactByCode.sort((a, b) => b.annualImpact - a.annualImpact);

      return {
        summary: {
          codesAnalyzed: impactByCode.length,
          currentAnnualRevenue: totalCurrentRevenue,
          projectedAnnualRevenue: totalProjectedRevenue,
          totalAnnualImpact: totalProjectedRevenue - totalCurrentRevenue,
          percentChange: totalCurrentRevenue > 0
            ? ((totalProjectedRevenue - totalCurrentRevenue) / totalCurrentRevenue) * 100
            : 0,
        },
        impactByCode,
        dateRange: { from: startDate, to: endDate },
        modeledAt: new Date(),
      };
    }),

  /**
   * Act on a contract renegotiation opportunity
   */
  actOnContractOpportunity: billerProcedure
    .input(
      z.object({
        opportunityId: z.string(),
        action: z.enum(['start', 'complete', 'decline']),
        capturedValue: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { opportunityId, action, capturedValue, notes } = input;

      const opportunity = await ctx.prisma.revenueOpportunity.findFirst({
        where: {
          id: opportunityId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!opportunity) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Opportunity not found',
        });
      }

      let newStatus: string;
      switch (action) {
        case 'start':
          newStatus = 'in_progress';
          break;
        case 'complete':
          newStatus = 'captured';
          break;
        case 'decline':
          newStatus = 'declined';
          break;
      }

      const updated = await ctx.prisma.revenueOpportunity.update({
        where: { id: opportunityId },
        data: {
          status: newStatus,
          ...(action === 'complete' && {
            capturedValue: capturedValue ? new Decimal(capturedValue) : null,
            capturedAt: new Date(),
            capturedBy: ctx.user.id,
          }),
          notes: notes || opportunity.notes,
        },
      });

      // Create optimization action record
      if (action === 'complete') {
        await ctx.prisma.optimizationAction.create({
          data: {
            actionType: 'contract_renegotiation',
            action: `Completed: ${opportunity.title}`,
            projectedImpact: opportunity.estimatedValue,
            actualImpact: capturedValue ? new Decimal(capturedValue) : null,
            status: 'completed',
            completedAt: new Date(),
            completedBy: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });
      }

      return {
        success: true,
        opportunity: updated,
      };
    }),

  // ============================================
  // US-345: Revenue Forecasting
  // ============================================

  /**
   * Forecast future revenue with recommendations
   * Analyzes historical trends, seasonality, pipeline, and goals
   */
  forecast: billerProcedure
    .input(
      z.object({
        forecastMonths: z.number().min(1).max(24).default(12),
        historicalMonths: z.number().min(3).max(36).default(12),
        includeSeasonality: z.boolean().default(true),
        includePipeline: z.boolean().default(true),
        scenarios: z.array(z.enum(['conservative', 'baseline', 'optimistic'])).default(['baseline']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        forecastMonths,
        historicalMonths,
        includeSeasonality,
        includePipeline,
        scenarios,
      } = input;
      const organizationId = ctx.user.organizationId;

      const now = new Date();
      const startDate = new Date(now.getTime() - historicalMonths * 30 * 24 * 60 * 60 * 1000);

      // ============================================
      // 1. Gather Historical Revenue Data
      // ============================================

      // Get charges grouped by month
      const charges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: { gte: startDate, lte: now },
          status: { in: ['BILLED', 'PAID'] },
        },
        select: {
          serviceDate: true,
          fee: true,
          payments: true,
          adjustments: true,
        },
      });

      // Group by month
      interface MonthlyData {
        month: string; // YYYY-MM
        year: number;
        monthNum: number;
        revenue: number;
        collections: number;
        encounterCount: number;
        avgRevenuePerEncounter: number;
      }

      const monthlyMap: Record<string, MonthlyData> = {};

      for (const charge of charges) {
        const month = charge.serviceDate.toISOString().slice(0, 7);
        const year = charge.serviceDate.getFullYear();
        const monthNum = charge.serviceDate.getMonth() + 1;

        if (!monthlyMap[month]) {
          monthlyMap[month] = {
            month,
            year,
            monthNum,
            revenue: 0,
            collections: 0,
            encounterCount: 0,
            avgRevenuePerEncounter: 0,
          };
        }

        monthlyMap[month].revenue += Number(charge.fee);
        monthlyMap[month].collections += Number(charge.payments);
        monthlyMap[month].encounterCount++;
      }

      // Calculate averages
      const monthlyData = Object.values(monthlyMap)
        .sort((a, b) => a.month.localeCompare(b.month));

      for (const data of monthlyData) {
        data.avgRevenuePerEncounter = data.encounterCount > 0
          ? data.revenue / data.encounterCount
          : 0;
      }

      // ============================================
      // 2. Calculate Historical Trend
      // ============================================

      interface TrendAnalysis {
        monthlyGrowthRate: number;
        annualizedGrowthRate: number;
        avgMonthlyRevenue: number;
        avgMonthlyCollections: number;
        collectionRate: number;
        revenueVolatility: number;
        trendDirection: 'increasing' | 'stable' | 'decreasing';
      }

      const revenues = monthlyData.map(d => d.revenue);
      const totalRevenue = revenues.reduce((a, b) => a + b, 0);
      const avgMonthlyRevenue = revenues.length > 0 ? totalRevenue / revenues.length : 0;

      const collections = monthlyData.map(d => d.collections);
      const totalCollections = collections.reduce((a, b) => a + b, 0);
      const avgMonthlyCollections = collections.length > 0 ? totalCollections / collections.length : 0;

      // Calculate month-over-month growth rates
      const growthRates: number[] = [];
      for (let i = 1; i < revenues.length; i++) {
        if (revenues[i - 1] > 0) {
          growthRates.push((revenues[i] - revenues[i - 1]) / revenues[i - 1]);
        }
      }

      const monthlyGrowthRate = growthRates.length > 0
        ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length
        : 0;
      const annualizedGrowthRate = Math.pow(1 + monthlyGrowthRate, 12) - 1;

      // Calculate volatility (standard deviation)
      const mean = avgMonthlyRevenue;
      const squaredDiffs = revenues.map(r => Math.pow(r - mean, 2));
      const variance = squaredDiffs.length > 0
        ? squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length
        : 0;
      const revenueVolatility = Math.sqrt(variance) / (mean || 1);

      const trendDirection: 'increasing' | 'stable' | 'decreasing' =
        monthlyGrowthRate > 0.02 ? 'increasing' :
        monthlyGrowthRate < -0.02 ? 'decreasing' : 'stable';

      const trendAnalysis: TrendAnalysis = {
        monthlyGrowthRate,
        annualizedGrowthRate,
        avgMonthlyRevenue,
        avgMonthlyCollections,
        collectionRate: totalRevenue > 0 ? (totalCollections / totalRevenue) * 100 : 0,
        revenueVolatility,
        trendDirection,
      };

      // ============================================
      // 3. Calculate Seasonality Factors
      // ============================================

      interface SeasonalityFactor {
        month: number;
        monthName: string;
        factor: number; // 1.0 = average, 1.1 = 10% above average
        historicalAvg: number;
      }

      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];

      const seasonalityFactors: SeasonalityFactor[] = [];

      if (includeSeasonality && monthlyData.length >= 6) {
        // Group revenue by month number
        const monthRevenues: Record<number, number[]> = {};
        for (const data of monthlyData) {
          if (!monthRevenues[data.monthNum]) {
            monthRevenues[data.monthNum] = [];
          }
          monthRevenues[data.monthNum].push(data.revenue);
        }

        // Calculate seasonality factor for each month
        for (let m = 1; m <= 12; m++) {
          const monthData = monthRevenues[m] || [];
          const monthAvg = monthData.length > 0
            ? monthData.reduce((a, b) => a + b, 0) / monthData.length
            : avgMonthlyRevenue;

          const factor = avgMonthlyRevenue > 0 ? monthAvg / avgMonthlyRevenue : 1;

          seasonalityFactors.push({
            month: m,
            monthName: monthNames[m - 1],
            factor,
            historicalAvg: monthAvg,
          });
        }
      } else {
        // No seasonality - all months equal
        for (let m = 1; m <= 12; m++) {
          seasonalityFactors.push({
            month: m,
            monthName: monthNames[m - 1],
            factor: 1,
            historicalAvg: avgMonthlyRevenue,
          });
        }
      }

      // ============================================
      // 4. Pipeline-Based Adjustments
      // ============================================

      interface PipelineData {
        scheduledAppointments: number;
        avgValuePerAppointment: number;
        pipelineValue: number;
        pipelineMonths: number;
        conversionRate: number;
      }

      let pipelineData: PipelineData = {
        scheduledAppointments: 0,
        avgValuePerAppointment: 0,
        pipelineValue: 0,
        pipelineMonths: 3,
        conversionRate: 0.85, // Default 85% of scheduled appointments generate charges
      };

      if (includePipeline) {
        // Get scheduled appointments for next 3 months
        const futureDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const appointments = await ctx.prisma.appointment.count({
          where: {
            organizationId,
            startTime: { gte: now, lte: futureDate },
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
          },
        });

        // Calculate average revenue per encounter from recent data
        const avgPerEncounter = monthlyData.length > 0
          ? monthlyData.reduce((sum, d) => sum + d.avgRevenuePerEncounter, 0) / monthlyData.length
          : 85; // Default $85

        pipelineData = {
          scheduledAppointments: appointments,
          avgValuePerAppointment: avgPerEncounter,
          pipelineValue: appointments * avgPerEncounter * 0.85, // 85% conversion
          pipelineMonths: 3,
          conversionRate: 0.85,
        };
      }

      // ============================================
      // 5. Generate Forecasts by Scenario
      // ============================================

      interface ForecastMonth {
        month: string;
        monthName: string;
        year: number;
        monthNum: number;
        baseRevenue: number;
        seasonalityAdjustment: number;
        pipelineAdjustment: number;
        scenarioAdjustment: number;
        forecastedRevenue: number;
        forecastedCollections: number;
        cumulativeRevenue: number;
      }

      interface ScenarioForecast {
        scenario: string;
        description: string;
        assumptions: string[];
        growthMultiplier: number;
        months: ForecastMonth[];
        totalForecastedRevenue: number;
        totalForecastedCollections: number;
        monthlyAverage: number;
        vsCurrentAverage: number;
      }

      const scenarioConfigs: Record<string, { multiplier: number; description: string; assumptions: string[] }> = {
        conservative: {
          multiplier: 0.9,
          description: 'Conservative outlook assuming slower growth',
          assumptions: [
            'Growth rate reduced by 10%',
            'Higher patient churn expected',
            'Economic headwinds may reduce visits',
            'New patient acquisition slower than trend',
          ],
        },
        baseline: {
          multiplier: 1.0,
          description: 'Baseline forecast based on current trends',
          assumptions: [
            'Current growth patterns continue',
            'Seasonality remains consistent',
            'No major market changes',
            'Staffing and capacity unchanged',
          ],
        },
        optimistic: {
          multiplier: 1.15,
          description: 'Optimistic outlook with growth initiatives',
          assumptions: [
            'Growth rate increased by 15%',
            'Marketing initiatives successful',
            'New services gaining traction',
            'Improved patient retention',
          ],
        },
      };

      const scenarioForecasts: ScenarioForecast[] = [];

      for (const scenario of scenarios) {
        const config = scenarioConfigs[scenario];
        const adjustedGrowthRate = monthlyGrowthRate * config.multiplier;

        const forecastMonthsData: ForecastMonth[] = [];
        let cumulativeRevenue = 0;

        for (let i = 0; i < forecastMonths; i++) {
          const forecastDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
          const monthNum = forecastDate.getMonth() + 1;
          const year = forecastDate.getFullYear();
          const monthStr = forecastDate.toISOString().slice(0, 7);

          // Base revenue with trend growth
          const baseRevenue = avgMonthlyRevenue * Math.pow(1 + adjustedGrowthRate, i + 1);

          // Seasonality adjustment
          const seasonFactor = seasonalityFactors.find(s => s.month === monthNum)?.factor || 1;
          const seasonalityAdjustment = baseRevenue * (seasonFactor - 1);

          // Pipeline adjustment (only for first 3 months)
          let pipelineAdjustment = 0;
          if (includePipeline && i < pipelineData.pipelineMonths) {
            const monthlyPipelineShare = pipelineData.pipelineValue / pipelineData.pipelineMonths;
            const baseExpected = avgMonthlyRevenue * seasonFactor;
            pipelineAdjustment = monthlyPipelineShare - baseExpected;
            if (pipelineAdjustment < 0) pipelineAdjustment = 0; // Only add if pipeline is above baseline
          }

          // Scenario adjustment
          const scenarioAdjustment = baseRevenue * (config.multiplier - 1);

          const forecastedRevenue = Math.max(0, baseRevenue + seasonalityAdjustment + pipelineAdjustment);
          const forecastedCollections = forecastedRevenue * (trendAnalysis.collectionRate / 100);
          cumulativeRevenue += forecastedRevenue;

          forecastMonthsData.push({
            month: monthStr,
            monthName: monthNames[monthNum - 1],
            year,
            monthNum,
            baseRevenue,
            seasonalityAdjustment,
            pipelineAdjustment,
            scenarioAdjustment,
            forecastedRevenue,
            forecastedCollections,
            cumulativeRevenue,
          });
        }

        const totalForecastedRevenue = forecastMonthsData.reduce((sum, m) => sum + m.forecastedRevenue, 0);
        const totalForecastedCollections = forecastMonthsData.reduce((sum, m) => sum + m.forecastedCollections, 0);
        const monthlyAverage = totalForecastedRevenue / forecastMonths;

        scenarioForecasts.push({
          scenario,
          description: config.description,
          assumptions: config.assumptions,
          growthMultiplier: config.multiplier,
          months: forecastMonthsData,
          totalForecastedRevenue,
          totalForecastedCollections,
          monthlyAverage,
          vsCurrentAverage: avgMonthlyRevenue > 0
            ? ((monthlyAverage - avgMonthlyRevenue) / avgMonthlyRevenue) * 100
            : 0,
        });
      }

      // ============================================
      // 6. Goal vs Forecast Variance Analysis
      // ============================================

      interface GoalVariance {
        goalId: string;
        period: string;
        goalType: string;
        target: number;
        forecasted: number;
        variance: number;
        variancePercent: number;
        onTrack: boolean;
        gapToClose: number;
        recommendation: string;
      }

      const goalVariances: GoalVariance[] = [];

      // Get active revenue goals
      const futureEndDate = new Date(now.getTime() + forecastMonths * 30 * 24 * 60 * 60 * 1000);
      const goals = await ctx.prisma.revenueGoal.findMany({
        where: {
          organizationId,
          endDate: { gte: now },
          startDate: { lte: futureEndDate },
        },
        orderBy: { startDate: 'asc' },
      });

      // Match goals to baseline forecast
      const baselineForecast = scenarioForecasts.find(s => s.scenario === 'baseline') || scenarioForecasts[0];

      for (const goal of goals) {
        // Find forecasted revenue for the goal period
        const goalStart = goal.startDate;
        const goalEnd = goal.endDate;

        const relevantMonths = baselineForecast?.months.filter(m => {
          const monthDate = new Date(m.year, m.monthNum - 1, 15);
          return monthDate >= goalStart && monthDate <= goalEnd;
        }) || [];

        const forecastedForPeriod = relevantMonths.reduce((sum, m) => sum + m.forecastedRevenue, 0);
        const target = Number(goal.target);
        const variance = forecastedForPeriod - target;
        const variancePercent = target > 0 ? (variance / target) * 100 : 0;
        const onTrack = variance >= 0;
        const gapToClose = Math.max(0, -variance);

        let recommendation = '';
        if (variancePercent >= 10) {
          recommendation = `On track to exceed ${goal.goalType} goal by ${variancePercent.toFixed(1)}%. Consider setting stretch targets.`;
        } else if (variancePercent >= 0) {
          recommendation = `Marginally on track for ${goal.goalType} goal. Maintain current trajectory.`;
        } else if (variancePercent >= -10) {
          recommendation = `Slightly behind on ${goal.goalType} goal (${variancePercent.toFixed(1)}%). Focus on scheduling efficiency and reducing no-shows.`;
        } else if (variancePercent >= -25) {
          recommendation = `Behind on ${goal.goalType} goal (${variancePercent.toFixed(1)}%). Consider marketing push, recall campaigns, or expanded hours.`;
        } else {
          recommendation = `Significantly behind on ${goal.goalType} goal (${variancePercent.toFixed(1)}%). Major intervention needed - review pricing, capacity, and marketing strategy.`;
        }

        goalVariances.push({
          goalId: goal.id,
          period: goal.period,
          goalType: goal.goalType,
          target,
          forecasted: forecastedForPeriod,
          variance,
          variancePercent,
          onTrack,
          gapToClose,
          recommendation,
        });
      }

      // ============================================
      // 7. Action Recommendations
      // ============================================

      interface ActionRecommendation {
        priority: 'low' | 'medium' | 'high' | 'critical';
        category: string;
        title: string;
        description: string;
        projectedImpact: number;
        effortLevel: 'easy' | 'moderate' | 'complex';
        timeframe: string;
      }

      const actionRecommendations: ActionRecommendation[] = [];

      // Analyze gaps and generate recommendations
      const behindGoals = goalVariances.filter(g => !g.onTrack);
      const totalGap = behindGoals.reduce((sum, g) => sum + g.gapToClose, 0);

      if (totalGap > 0) {
        // Scheduling optimization
        const schedulingImpact = totalGap * 0.15; // 15% of gap
        actionRecommendations.push({
          priority: schedulingImpact > 5000 ? 'high' : 'medium',
          category: 'scheduling',
          title: 'Optimize Scheduling Efficiency',
          description: `Reduce gaps between appointments and minimize no-shows. Target: fill 10-15% more appointment slots.`,
          projectedImpact: schedulingImpact,
          effortLevel: 'easy',
          timeframe: '1-2 months',
        });

        // Patient recall campaign
        const recallImpact = totalGap * 0.2; // 20% of gap
        actionRecommendations.push({
          priority: recallImpact > 10000 ? 'critical' : 'high',
          category: 'marketing',
          title: 'Launch Patient Recall Campaign',
          description: `Contact patients overdue for visits. Estimated ${Math.floor(recallImpact / 100)} additional visits needed.`,
          projectedImpact: recallImpact,
          effortLevel: 'moderate',
          timeframe: '2-3 months',
        });
      }

      // Trend-based recommendations
      if (trendAnalysis.trendDirection === 'decreasing') {
        actionRecommendations.push({
          priority: 'critical',
          category: 'retention',
          title: 'Address Declining Revenue Trend',
          description: `Revenue has been declining at ${(trendAnalysis.monthlyGrowthRate * 100).toFixed(1)}% monthly. Investigate patient churn and competition.`,
          projectedImpact: Math.abs(trendAnalysis.monthlyGrowthRate * avgMonthlyRevenue * 12),
          effortLevel: 'complex',
          timeframe: '3-6 months',
        });
      }

      // Collection rate optimization
      if (trendAnalysis.collectionRate < 70) {
        const collectionImprovement = avgMonthlyRevenue * 0.1 * 12; // 10% improvement annualized
        actionRecommendations.push({
          priority: 'high',
          category: 'collections',
          title: 'Improve Collection Rate',
          description: `Current collection rate is ${trendAnalysis.collectionRate.toFixed(1)}%. Target 75%+ through better follow-up and payer contract review.`,
          projectedImpact: collectionImprovement,
          effortLevel: 'moderate',
          timeframe: '3-6 months',
        });
      }

      // Seasonality preparation
      const lowSeasonMonths = seasonalityFactors.filter(s => s.factor < 0.85);
      if (lowSeasonMonths.length > 0) {
        const lowMonthNames = lowSeasonMonths.map(s => s.monthName).join(', ');
        actionRecommendations.push({
          priority: 'medium',
          category: 'planning',
          title: 'Plan for Low Season Months',
          description: `${lowMonthNames} historically show lower revenue. Consider promotions or wellness programs for these periods.`,
          projectedImpact: lowSeasonMonths.reduce((sum, s) => sum + (1 - s.factor) * avgMonthlyRevenue * 0.25, 0),
          effortLevel: 'moderate',
          timeframe: 'Ongoing',
        });
      }

      // New services recommendation
      if (trendAnalysis.trendDirection !== 'increasing') {
        actionRecommendations.push({
          priority: 'medium',
          category: 'growth',
          title: 'Evaluate New Service Lines',
          description: `Consider adding complementary services (massage therapy, nutritional counseling, etc.) to drive growth.`,
          projectedImpact: avgMonthlyRevenue * 0.15 * 12, // 15% potential increase
          effortLevel: 'complex',
          timeframe: '6-12 months',
        });
      }

      // Sort recommendations by projected impact
      actionRecommendations.sort((a, b) => b.projectedImpact - a.projectedImpact);

      // ============================================
      // 8. Create Revenue Goal if None Exists
      // ============================================

      // If no goals exist for next period, suggest creating one
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextMonthStr = nextMonth.toISOString().slice(0, 7);

      const existingNextMonthGoal = await ctx.prisma.revenueGoal.findFirst({
        where: {
          organizationId,
          period: nextMonthStr,
        },
      });

      let suggestedGoal = null;
      if (!existingNextMonthGoal && baselineForecast && baselineForecast.months.length > 0) {
        const nextMonthForecast = baselineForecast.months[0];
        suggestedGoal = {
          period: nextMonthStr,
          periodType: 'monthly',
          target: Math.round(nextMonthForecast.forecastedRevenue * 1.05), // 5% above forecast
          forecast: nextMonthForecast.forecastedRevenue,
          rationale: `Based on historical trends and seasonality. Target set 5% above baseline forecast.`,
        };
      }

      // ============================================
      // 9. Return Complete Forecast
      // ============================================

      return {
        success: true,
        historicalAnalysis: {
          monthsAnalyzed: monthlyData.length,
          dateRange: { from: startDate, to: now },
          monthlyData: monthlyData.slice(-12), // Last 12 months only
          trend: trendAnalysis,
        },
        seasonality: {
          enabled: includeSeasonality,
          factors: seasonalityFactors,
          highSeasonMonths: seasonalityFactors.filter(s => s.factor > 1.1).map(s => s.monthName),
          lowSeasonMonths: seasonalityFactors.filter(s => s.factor < 0.9).map(s => s.monthName),
        },
        pipeline: includePipeline ? pipelineData : null,
        forecasts: scenarioForecasts,
        goalAnalysis: {
          goalsFound: goals.length,
          variances: goalVariances,
          onTrackCount: goalVariances.filter(g => g.onTrack).length,
          totalGapToClose: totalGap,
        },
        recommendations: actionRecommendations,
        suggestedGoal,
        forecastedAt: new Date(),
      };
    }),

  /**
   * Get forecast summary for dashboard
   */
  getForecastSummary: billerProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.user.organizationId;
    const now = new Date();

    // Get last 3 months of actual data
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const recentCharges = await ctx.prisma.charge.aggregate({
      where: {
        organizationId,
        serviceDate: { gte: threeMonthsAgo, lte: now },
        status: { in: ['BILLED', 'PAID'] },
      },
      _sum: { fee: true, payments: true },
      _count: true,
    });

    const monthlyAvgRevenue = Number(recentCharges._sum.fee || 0) / 3;
    const monthlyAvgCollections = Number(recentCharges._sum.payments || 0) / 3;

    // Get current month goal
    const currentMonthStr = now.toISOString().slice(0, 7);
    const currentGoal = await ctx.prisma.revenueGoal.findFirst({
      where: {
        organizationId,
        period: currentMonthStr,
      },
    });

    // Get current month actual
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthCharges = await ctx.prisma.charge.aggregate({
      where: {
        organizationId,
        serviceDate: { gte: monthStart, lte: now },
        status: { in: ['BILLED', 'PAID'] },
      },
      _sum: { fee: true },
    });

    const currentMonthActual = Number(currentMonthCharges._sum.fee || 0);

    // Calculate days remaining in month
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();
    const daysRemaining = daysInMonth - daysPassed;

    // Project end of month
    const dailyRate = daysPassed > 0 ? currentMonthActual / daysPassed : 0;
    const projectedMonthEnd = currentMonthActual + (dailyRate * daysRemaining);

    return {
      recentPerformance: {
        monthlyAvgRevenue,
        monthlyAvgCollections,
        collectionRate: monthlyAvgRevenue > 0
          ? (monthlyAvgCollections / monthlyAvgRevenue) * 100
          : 0,
      },
      currentMonth: {
        period: currentMonthStr,
        actual: currentMonthActual,
        projected: projectedMonthEnd,
        target: currentGoal ? Number(currentGoal.target) : null,
        variance: currentGoal
          ? projectedMonthEnd - Number(currentGoal.target)
          : null,
        daysRemaining,
        onTrack: currentGoal ? projectedMonthEnd >= Number(currentGoal.target) : null,
      },
      nextActions: currentGoal && projectedMonthEnd < Number(currentGoal.target)
        ? ['Run patient recall', 'Check for unbilled encounters', 'Review scheduling capacity']
        : ['Maintain current performance', 'Review next month goals'],
    };
  }),

  /**
   * Create or update revenue goal
   */
  upsertRevenueGoal: billerProcedure
    .input(
      z.object({
        period: z.string(), // YYYY-MM, YYYY-QN, or YYYY
        periodType: z.enum(['monthly', 'quarterly', 'annual']),
        goalType: z.string().default('total_revenue'),
        target: z.number().min(0),
        name: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { period, periodType, goalType, target, name, notes } = input;
      const organizationId = ctx.user.organizationId;

      // Calculate start and end dates based on period
      let startDate: Date;
      let endDate: Date;

      if (periodType === 'monthly') {
        const [year, month] = period.split('-').map(Number);
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 0);
      } else if (periodType === 'quarterly') {
        const [year, qStr] = period.split('-Q');
        const quarter = parseInt(qStr);
        startDate = new Date(parseInt(year), (quarter - 1) * 3, 1);
        endDate = new Date(parseInt(year), quarter * 3, 0);
      } else {
        const year = parseInt(period);
        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 11, 31);
      }

      // Upsert the goal
      const goal = await ctx.prisma.revenueGoal.upsert({
        where: {
          organizationId_period_goalType: {
            organizationId,
            period,
            goalType,
          },
        },
        create: {
          period,
          periodType,
          goalType,
          name,
          target: new Decimal(target),
          actual: new Decimal(0),
          variance: new Decimal(-target),
          percentAchieved: new Decimal(0),
          onTrack: true,
          notes,
          startDate,
          endDate,
          createdBy: ctx.user.id,
          organizationId,
        },
        update: {
          target: new Decimal(target),
          variance: new Decimal(Number(await ctx.prisma.revenueGoal.findFirst({
            where: { organizationId, period, goalType },
            select: { actual: true },
          }).then(g => g?.actual || 0)) - target),
          name,
          notes,
          lastUpdated: new Date(),
        },
      });

      return {
        success: true,
        goal,
      };
    }),

  /**
   * Get revenue goals with current progress
   */
  getRevenueGoals: billerProcedure
    .input(
      z.object({
        periodType: z.enum(['monthly', 'quarterly', 'annual']).optional(),
        includeCompleted: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { periodType, includeCompleted } = input;
      const organizationId = ctx.user.organizationId;
      const now = new Date();

      const goals = await ctx.prisma.revenueGoal.findMany({
        where: {
          organizationId,
          ...(periodType && { periodType }),
          ...(!includeCompleted && { endDate: { gte: now } }),
        },
        orderBy: [{ startDate: 'desc' }, { goalType: 'asc' }],
      });

      // Update actual values for active goals
      const updatedGoals = await Promise.all(
        goals.map(async (goal) => {
          const charges = await ctx.prisma.charge.aggregate({
            where: {
              organizationId,
              serviceDate: { gte: goal.startDate, lte: goal.endDate },
              status: { in: ['BILLED', 'PAID'] },
            },
            _sum: { fee: true },
          });

          const actual = Number(charges._sum.fee || 0);
          const target = Number(goal.target);
          const variance = actual - target;
          const percentAchieved = target > 0 ? (actual / target) * 100 : 0;

          // Check if on track (need at least time-proportional progress)
          const totalDays = (goal.endDate.getTime() - goal.startDate.getTime()) / (24 * 60 * 60 * 1000);
          const daysPassed = Math.max(0, (now.getTime() - goal.startDate.getTime()) / (24 * 60 * 60 * 1000));
          const expectedProgress = totalDays > 0 ? (daysPassed / totalDays) * 100 : 0;
          const onTrack = percentAchieved >= expectedProgress * 0.9; // 90% of expected is "on track"

          // Project final value
          const dailyRate = daysPassed > 0 ? actual / daysPassed : 0;
          const daysRemaining = Math.max(0, totalDays - daysPassed);
          const projectedFinal = actual + (dailyRate * daysRemaining);

          return {
            ...goal,
            actual,
            variance,
            percentAchieved,
            onTrack,
            projectedFinal,
            target: Number(goal.target),
            daysRemaining: Math.ceil(daysRemaining),
            expectedProgress,
          };
        })
      );

      return {
        goals: updatedGoals,
        summary: {
          total: updatedGoals.length,
          onTrack: updatedGoals.filter(g => g.onTrack).length,
          behind: updatedGoals.filter(g => !g.onTrack).length,
          totalTarget: updatedGoals.reduce((sum, g) => sum + g.target, 0),
          totalActual: updatedGoals.reduce((sum, g) => sum + g.actual, 0),
        },
      };
    }),
});
