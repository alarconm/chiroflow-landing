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
});
