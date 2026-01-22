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
});
