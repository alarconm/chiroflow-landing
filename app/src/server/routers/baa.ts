import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog, getRequestMetadata } from '@/lib/audit';
import type { PrismaClient, BAAStatus, Prisma } from '@prisma/client';

// Risk level definitions
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

// Helper to log security events for BAA operations
async function logBAASecurityEvent(
  prisma: PrismaClient,
  eventType: 'CONFIG_CHANGED',
  userId: string | null,
  organizationId: string,
  success: boolean,
  metadata?: Record<string, unknown>
) {
  const { ipAddress, userAgent } = await getRequestMetadata();

  await prisma.securityEvent.create({
    data: {
      eventType,
      userId,
      organizationId,
      ipAddress,
      userAgent,
      success,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      severity: success ? 'INFO' : 'WARNING',
      entityType: 'BAA',
    },
  });
}

// Calculate days until expiration or renewal
function calculateDaysUntil(date: Date | null): number | null {
  if (!date) return null;
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Determine risk score based on multiple factors
function calculateRiskScore(baa: {
  riskLevel: string | null;
  expirationDate: Date | null;
  lastRiskAssessment: Date | null;
  status: BAAStatus;
}): number {
  let score = 0;

  // Base risk level score
  switch (baa.riskLevel) {
    case 'CRITICAL':
      score += 40;
      break;
    case 'HIGH':
      score += 30;
      break;
    case 'MEDIUM':
      score += 20;
      break;
    case 'LOW':
      score += 10;
      break;
  }

  // Expiration proximity
  const daysUntilExpiration = calculateDaysUntil(baa.expirationDate);
  if (daysUntilExpiration !== null) {
    if (daysUntilExpiration < 0) score += 30; // Expired
    else if (daysUntilExpiration < 30) score += 20;
    else if (daysUntilExpiration < 90) score += 10;
  }

  // Risk assessment staleness
  if (baa.lastRiskAssessment) {
    const daysSinceAssessment = Math.abs(
      calculateDaysUntil(baa.lastRiskAssessment) || 0
    );
    if (daysSinceAssessment > 365) score += 15;
    else if (daysSinceAssessment > 180) score += 10;
    else if (daysSinceAssessment > 90) score += 5;
  } else {
    score += 15; // Never assessed
  }

  // Status penalty
  if (baa.status === 'EXPIRED') score += 20;
  else if (baa.status === 'DRAFT') score += 10;

  return Math.min(score, 100);
}

export const baaRouter = router({
  // ============================================
  // BAA CRUD Operations
  // ============================================

  // Create a new BAA
  create: adminProcedure
    .input(
      z.object({
        vendorName: z.string().min(1, 'Vendor name is required'),
        vendorContact: z.string().optional(),
        vendorEmail: z.string().email().optional().or(z.literal('')),
        vendorPhone: z.string().optional(),
        vendorAddress: z.string().optional(),
        documentUrl: z.string().url().optional().or(z.literal('')),
        version: z.string().optional(),
        effectiveDate: z.date().optional(),
        expirationDate: z.date().optional(),
        renewalDate: z.date().optional(),
        riskLevel: z.enum(RISK_LEVELS).optional(),
        riskNotes: z.string().optional(),
        servicesCovered: z.array(z.string()).default([]),
        dataTypes: z.array(z.string()).default([]),
        notes: z.string().optional(),
        // Link to existing vendor if available
        vendorId: z.string().cuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // If vendorId provided, verify it exists and belongs to org
      if (input.vendorId) {
        const vendor = await ctx.prisma.vendor.findFirst({
          where: {
            id: input.vendorId,
            organizationId: ctx.user.organizationId,
          },
        });
        if (!vendor) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Vendor not found',
          });
        }
      }

      const baa = await ctx.prisma.bAADocument.create({
        data: {
          vendorName: input.vendorName,
          vendorContact: input.vendorContact,
          vendorEmail: input.vendorEmail || null,
          vendorPhone: input.vendorPhone,
          vendorAddress: input.vendorAddress,
          documentUrl: input.documentUrl || null,
          version: input.version,
          effectiveDate: input.effectiveDate,
          expirationDate: input.expirationDate,
          renewalDate: input.renewalDate,
          riskLevel: input.riskLevel,
          riskNotes: input.riskNotes,
          servicesCovered: input.servicesCovered,
          dataTypes: input.dataTypes,
          notes: input.notes,
          status: 'DRAFT',
          organizationId: ctx.user.organizationId,
          vendorId: input.vendorId,
        },
      });

      await auditLog('CREATE', 'BAADocument', {
        entityId: baa.id,
        changes: { vendorName: input.vendorName, status: 'DRAFT' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logBAASecurityEvent(
        ctx.prisma,
        'CONFIG_CHANGED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { action: 'BAA_CREATED', baaId: baa.id, vendorName: input.vendorName }
      );

      return baa;
    }),

  // Get a single BAA
  get: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const baa = await ctx.prisma.bAADocument.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          vendor: true,
        },
      });

      if (!baa) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BAA not found',
        });
      }

      return {
        ...baa,
        daysUntilExpiration: calculateDaysUntil(baa.expirationDate),
        daysUntilRenewal: calculateDaysUntil(baa.renewalDate),
        riskScore: calculateRiskScore(baa),
      };
    }),

  // List all BAAs with filtering
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'EXPIRED', 'TERMINATED']).optional(),
        riskLevel: z.enum(RISK_LEVELS).optional(),
        vendorId: z.string().cuid().optional(),
        search: z.string().optional(),
        expiringWithinDays: z.number().optional(),
        renewalDueWithinDays: z.number().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        sortBy: z.enum(['vendorName', 'expirationDate', 'riskLevel', 'status', 'createdAt']).default('vendorName'),
        sortOrder: z.enum(['asc', 'desc']).default('asc'),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.BAADocumentWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (input.status) {
        where.status = input.status;
      }

      if (input.riskLevel) {
        where.riskLevel = input.riskLevel;
      }

      if (input.vendorId) {
        where.vendorId = input.vendorId;
      }

      if (input.search) {
        where.OR = [
          { vendorName: { contains: input.search, mode: 'insensitive' } },
          { vendorContact: { contains: input.search, mode: 'insensitive' } },
          { vendorEmail: { contains: input.search, mode: 'insensitive' } },
          { notes: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      if (input.expiringWithinDays) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + input.expiringWithinDays);
        where.expirationDate = {
          lte: futureDate,
          gte: new Date(),
        };
        where.status = { in: ['ACTIVE', 'PENDING_SIGNATURE'] };
      }

      if (input.renewalDueWithinDays) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + input.renewalDueWithinDays);
        where.renewalDate = {
          lte: futureDate,
          gte: new Date(),
        };
      }

      const [baas, total] = await Promise.all([
        ctx.prisma.bAADocument.findMany({
          where,
          include: {
            vendor: {
              select: { id: true, name: true, code: true },
            },
          },
          orderBy: { [input.sortBy]: input.sortOrder },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.prisma.bAADocument.count({ where }),
      ]);

      // Enrich with calculated fields
      const enrichedBaas = baas.map((baa) => ({
        ...baa,
        daysUntilExpiration: calculateDaysUntil(baa.expirationDate),
        daysUntilRenewal: calculateDaysUntil(baa.renewalDate),
        riskScore: calculateRiskScore(baa),
      }));

      return {
        baas: enrichedBaas,
        total,
        hasMore: input.offset + baas.length < total,
      };
    }),

  // Update a BAA
  update: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        vendorName: z.string().min(1).optional(),
        vendorContact: z.string().optional(),
        vendorEmail: z.string().email().optional().or(z.literal('')),
        vendorPhone: z.string().optional(),
        vendorAddress: z.string().optional(),
        documentUrl: z.string().url().optional().or(z.literal('')),
        documentHash: z.string().optional(),
        version: z.string().optional(),
        signedDate: z.date().optional().nullable(),
        effectiveDate: z.date().optional().nullable(),
        expirationDate: z.date().optional().nullable(),
        renewalDate: z.date().optional().nullable(),
        riskLevel: z.enum(RISK_LEVELS).optional().nullable(),
        riskNotes: z.string().optional().nullable(),
        servicesCovered: z.array(z.string()).optional(),
        dataTypes: z.array(z.string()).optional(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.prisma.bAADocument.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BAA not found',
        });
      }

      const baa = await ctx.prisma.bAADocument.update({
        where: { id },
        data: {
          ...updateData,
          vendorEmail: updateData.vendorEmail || null,
          documentUrl: updateData.documentUrl || null,
        },
      });

      await auditLog('UPDATE', 'BAADocument', {
        entityId: baa.id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logBAASecurityEvent(
        ctx.prisma,
        'CONFIG_CHANGED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { action: 'BAA_UPDATED', baaId: baa.id, changes: Object.keys(updateData) }
      );

      return baa;
    }),

  // Update BAA status
  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        status: z.enum(['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'EXPIRED', 'TERMINATED']),
        terminationReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.bAADocument.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BAA not found',
        });
      }

      const updateData: Prisma.BAADocumentUpdateInput = {
        status: input.status,
      };

      // Set appropriate dates based on status
      if (input.status === 'ACTIVE' && !existing.signedDate) {
        updateData.signedDate = new Date();
      }
      if (input.status === 'ACTIVE' && !existing.effectiveDate) {
        updateData.effectiveDate = new Date();
      }
      if (input.status === 'TERMINATED') {
        updateData.terminatedDate = new Date();
        updateData.terminationReason = input.terminationReason;
      }

      const baa = await ctx.prisma.bAADocument.update({
        where: { id: input.id },
        data: updateData,
      });

      await auditLog('UPDATE', 'BAADocument', {
        entityId: baa.id,
        changes: { status: input.status, previousStatus: existing.status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logBAASecurityEvent(
        ctx.prisma,
        'CONFIG_CHANGED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        {
          action: 'BAA_STATUS_CHANGED',
          baaId: baa.id,
          previousStatus: existing.status,
          newStatus: input.status,
        }
      );

      return baa;
    }),

  // Delete a BAA (soft delete by setting status to TERMINATED)
  delete: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.bAADocument.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BAA not found',
        });
      }

      // Soft delete by setting status to TERMINATED
      await ctx.prisma.bAADocument.update({
        where: { id: input.id },
        data: {
          status: 'TERMINATED',
          terminatedDate: new Date(),
          terminationReason: input.reason || 'Deleted by administrator',
        },
      });

      await auditLog('DELETE', 'BAADocument', {
        entityId: input.id,
        changes: { action: 'soft_delete', reason: input.reason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logBAASecurityEvent(
        ctx.prisma,
        'CONFIG_CHANGED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        { action: 'BAA_DELETED', baaId: input.id, vendorName: existing.vendorName }
      );

      return { success: true };
    }),

  // ============================================
  // Risk Assessment
  // ============================================

  // Perform vendor risk assessment
  performRiskAssessment: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        riskLevel: z.enum(RISK_LEVELS),
        riskNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.bAADocument.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BAA not found',
        });
      }

      const baa = await ctx.prisma.bAADocument.update({
        where: { id: input.id },
        data: {
          riskLevel: input.riskLevel,
          riskNotes: input.riskNotes,
          lastRiskAssessment: new Date(),
        },
      });

      await auditLog('UPDATE', 'BAADocument', {
        entityId: baa.id,
        changes: {
          action: 'risk_assessment',
          previousRiskLevel: existing.riskLevel,
          newRiskLevel: input.riskLevel,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logBAASecurityEvent(
        ctx.prisma,
        'CONFIG_CHANGED',
        ctx.user.id,
        ctx.user.organizationId,
        true,
        {
          action: 'BAA_RISK_ASSESSMENT',
          baaId: baa.id,
          vendorName: existing.vendorName,
          riskLevel: input.riskLevel,
        }
      );

      return baa;
    }),

  // ============================================
  // Expiration & Renewal Tracking
  // ============================================

  // Get BAAs expiring soon
  getExpiringBaas: protectedProcedure
    .input(
      z.object({
        daysAhead: z.number().min(1).max(365).default(90),
      })
    )
    .query(async ({ ctx, input }) => {
      const daysAhead = input.daysAhead;
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      const baas = await ctx.prisma.bAADocument.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['ACTIVE', 'PENDING_SIGNATURE'] },
          expirationDate: {
            lte: futureDate,
            gte: new Date(),
          },
        },
        orderBy: { expirationDate: 'asc' },
      });

      return baas.map((baa) => ({
        ...baa,
        daysUntilExpiration: calculateDaysUntil(baa.expirationDate),
      }));
    }),

  // Get BAAs due for renewal
  getRenewalDue: protectedProcedure
    .input(
      z.object({
        daysAhead: z.number().min(1).max(365).default(90),
      })
    )
    .query(async ({ ctx, input }) => {
      const daysAhead = input.daysAhead;
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      const baas = await ctx.prisma.bAADocument.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['ACTIVE'] },
          renewalDate: {
            lte: futureDate,
            gte: new Date(),
          },
        },
        orderBy: { renewalDate: 'asc' },
      });

      return baas.map((baa) => ({
        ...baa,
        daysUntilRenewal: calculateDaysUntil(baa.renewalDate),
      }));
    }),

  // Get already expired BAAs
  getExpiredBaas: protectedProcedure.query(async ({ ctx }) => {
    const baas = await ctx.prisma.bAADocument.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        OR: [
          { status: 'EXPIRED' },
          {
            status: { in: ['ACTIVE', 'PENDING_SIGNATURE'] },
            expirationDate: { lt: new Date() },
          },
        ],
      },
      orderBy: { expirationDate: 'desc' },
    });

    // Auto-update status if expired but not marked as such
    const expiredButNotMarked = baas.filter(
      (baa) =>
        baa.status !== 'EXPIRED' &&
        baa.expirationDate &&
        baa.expirationDate < new Date()
    );

    if (expiredButNotMarked.length > 0) {
      await ctx.prisma.bAADocument.updateMany({
        where: {
          id: { in: expiredButNotMarked.map((b) => b.id) },
        },
        data: { status: 'EXPIRED' },
      });
    }

    return baas.map((baa) => ({
      ...baa,
      status: baa.expirationDate && baa.expirationDate < new Date() ? 'EXPIRED' : baa.status,
      daysSinceExpiration: baa.expirationDate
        ? Math.abs(calculateDaysUntil(baa.expirationDate) || 0)
        : null,
    }));
  }),

  // ============================================
  // Compliance Dashboard
  // ============================================

  // Get compliance dashboard summary
  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    const [
      totalBaas,
      activeBaas,
      pendingBaas,
      expiredBaas,
      draftBaas,
      terminatedBaas,
      expiringIn30Days,
      expiringIn90Days,
      renewalDueIn30Days,
      highRiskBaas,
      criticalRiskBaas,
      needsAssessment,
    ] = await Promise.all([
      ctx.prisma.bAADocument.count({
        where: { organizationId: ctx.user.organizationId },
      }),
      ctx.prisma.bAADocument.count({
        where: { organizationId: ctx.user.organizationId, status: 'ACTIVE' },
      }),
      ctx.prisma.bAADocument.count({
        where: { organizationId: ctx.user.organizationId, status: 'PENDING_SIGNATURE' },
      }),
      ctx.prisma.bAADocument.count({
        where: {
          organizationId: ctx.user.organizationId,
          OR: [
            { status: 'EXPIRED' },
            {
              status: { in: ['ACTIVE', 'PENDING_SIGNATURE'] },
              expirationDate: { lt: new Date() },
            },
          ],
        },
      }),
      ctx.prisma.bAADocument.count({
        where: { organizationId: ctx.user.organizationId, status: 'DRAFT' },
      }),
      ctx.prisma.bAADocument.count({
        where: { organizationId: ctx.user.organizationId, status: 'TERMINATED' },
      }),
      ctx.prisma.bAADocument.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['ACTIVE', 'PENDING_SIGNATURE'] },
          expirationDate: {
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            gte: new Date(),
          },
        },
      }),
      ctx.prisma.bAADocument.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['ACTIVE', 'PENDING_SIGNATURE'] },
          expirationDate: {
            lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            gte: new Date(),
          },
        },
      }),
      ctx.prisma.bAADocument.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
          renewalDate: {
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            gte: new Date(),
          },
        },
      }),
      ctx.prisma.bAADocument.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['ACTIVE', 'PENDING_SIGNATURE'] },
          riskLevel: 'HIGH',
        },
      }),
      ctx.prisma.bAADocument.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['ACTIVE', 'PENDING_SIGNATURE'] },
          riskLevel: 'CRITICAL',
        },
      }),
      ctx.prisma.bAADocument.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
          OR: [
            { lastRiskAssessment: null },
            {
              lastRiskAssessment: {
                lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      }),
    ]);

    // Calculate compliance score (0-100)
    let complianceScore = 100;
    if (totalBaas > 0) {
      // Deduct for expired BAAs
      complianceScore -= Math.min(30, (expiredBaas / totalBaas) * 100);
      // Deduct for missing risk assessments
      complianceScore -= Math.min(20, (needsAssessment / Math.max(activeBaas, 1)) * 100);
      // Deduct for high/critical risk
      complianceScore -= Math.min(20, ((highRiskBaas + criticalRiskBaas * 2) / Math.max(activeBaas, 1)) * 50);
      // Deduct for pending/draft
      complianceScore -= Math.min(15, ((pendingBaas + draftBaas) / totalBaas) * 50);
    }

    return {
      total: totalBaas,
      byStatus: {
        active: activeBaas,
        pending: pendingBaas,
        expired: expiredBaas,
        draft: draftBaas,
        terminated: terminatedBaas,
      },
      expirations: {
        expiredCount: expiredBaas,
        expiringIn30Days,
        expiringIn90Days,
      },
      renewals: {
        dueIn30Days: renewalDueIn30Days,
      },
      riskSummary: {
        highRisk: highRiskBaas,
        criticalRisk: criticalRiskBaas,
        needsAssessment,
      },
      complianceScore: Math.max(0, Math.round(complianceScore)),
    };
  }),

  // Get compliance alerts
  getComplianceAlerts: protectedProcedure.query(async ({ ctx }) => {
    const alerts: Array<{
      type: string;
      severity: 'INFO' | 'WARNING' | 'CRITICAL';
      message: string;
      baaId?: string;
      vendorName?: string;
    }> = [];

    // Get expired BAAs
    const expiredBaas = await ctx.prisma.bAADocument.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        OR: [
          { status: 'EXPIRED' },
          {
            status: { in: ['ACTIVE', 'PENDING_SIGNATURE'] },
            expirationDate: { lt: new Date() },
          },
        ],
      },
      select: { id: true, vendorName: true, expirationDate: true },
    });

    for (const baa of expiredBaas) {
      alerts.push({
        type: 'EXPIRED_BAA',
        severity: 'CRITICAL',
        message: `BAA with ${baa.vendorName} has expired`,
        baaId: baa.id,
        vendorName: baa.vendorName,
      });
    }

    // Get BAAs expiring within 30 days
    const expiringBaas = await ctx.prisma.bAADocument.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        status: { in: ['ACTIVE', 'PENDING_SIGNATURE'] },
        expirationDate: {
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          gt: new Date(),
        },
      },
      select: { id: true, vendorName: true, expirationDate: true },
    });

    for (const baa of expiringBaas) {
      const days = calculateDaysUntil(baa.expirationDate);
      alerts.push({
        type: 'EXPIRING_BAA',
        severity: days && days <= 7 ? 'CRITICAL' : 'WARNING',
        message: `BAA with ${baa.vendorName} expires in ${days} days`,
        baaId: baa.id,
        vendorName: baa.vendorName,
      });
    }

    // Get BAAs needing risk assessment
    const needsAssessment = await ctx.prisma.bAADocument.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        status: 'ACTIVE',
        OR: [
          { lastRiskAssessment: null },
          {
            lastRiskAssessment: {
              lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
      select: { id: true, vendorName: true, lastRiskAssessment: true },
    });

    for (const baa of needsAssessment) {
      alerts.push({
        type: 'RISK_ASSESSMENT_NEEDED',
        severity: 'WARNING',
        message: `BAA with ${baa.vendorName} needs risk assessment`,
        baaId: baa.id,
        vendorName: baa.vendorName,
      });
    }

    // Get critical risk BAAs
    const criticalBaas = await ctx.prisma.bAADocument.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        status: { in: ['ACTIVE', 'PENDING_SIGNATURE'] },
        riskLevel: 'CRITICAL',
      },
      select: { id: true, vendorName: true },
    });

    for (const baa of criticalBaas) {
      alerts.push({
        type: 'CRITICAL_RISK',
        severity: 'CRITICAL',
        message: `BAA with ${baa.vendorName} has critical risk level`,
        baaId: baa.id,
        vendorName: baa.vendorName,
      });
    }

    // Sort by severity
    const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return alerts;
  }),

  // ============================================
  // Vendor Lookup
  // ============================================

  // Get available vendors for BAA linking
  getAvailableVendors: protectedProcedure.query(async ({ ctx }) => {
    const vendors = await ctx.prisma.vendor.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        email: true,
        phone: true,
        baaDocuments: {
          where: { status: { in: ['ACTIVE', 'PENDING_SIGNATURE', 'DRAFT'] } },
          select: { id: true, status: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return vendors.map((v) => ({
      id: v.id,
      name: v.name,
      code: v.code,
      email: v.email,
      phone: v.phone,
      hasActiveBAA: v.baaDocuments.some((b) => b.status === 'ACTIVE'),
      existingBaaCount: v.baaDocuments.length,
    }));
  }),
});
