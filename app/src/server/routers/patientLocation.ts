import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog, getRequestMetadata } from '@/lib/audit';
import type { CrossLocationAccessType } from '@prisma/client';

// =============================================================================
// US-251: Cross-location patient access
// =============================================================================

// Schema for cross-location access type
const crossLocationAccessTypeSchema = z.enum([
  'VIEW_RECORD',
  'VIEW_ENCOUNTERS',
  'VIEW_BALANCE',
  'VIEW_DOCUMENTS',
  'CREATE_ENCOUNTER',
  'CREATE_APPOINTMENT',
  'UPDATE_RECORD',
]);

export const patientLocationRouter = router({
  // -------------------------------------------------------------------------
  // Set patient home location
  // -------------------------------------------------------------------------
  setHomeLocation: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        locationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, locationId } = input;

      // Verify patient exists and belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        select: {
          id: true,
          homeLocationId: true,
          demographics: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Verify location exists and belongs to organization
      const location = await ctx.prisma.location.findFirst({
        where: {
          id: locationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found or inactive',
        });
      }

      const previousLocationId = patient.homeLocationId;

      // Update patient's home location
      const updated = await ctx.prisma.patient.update({
        where: { id: patientId },
        data: { homeLocationId: locationId },
        include: {
          homeLocation: { select: { id: true, name: true, code: true } },
          demographics: { select: { firstName: true, lastName: true } },
        },
      });

      // Audit log
      await auditLog(
        previousLocationId ? 'PATIENT_HOME_LOCATION_CHANGE' : 'PATIENT_HOME_LOCATION_SET',
        'Patient',
        {
          entityId: patientId,
          changes: {
            previousLocationId,
            newLocationId: locationId,
            locationName: location.name,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        }
      );

      return {
        success: true,
        patient: {
          id: updated.id,
          firstName: updated.demographics?.firstName,
          lastName: updated.demographics?.lastName,
          homeLocation: updated.homeLocation,
        },
      };
    }),

  // -------------------------------------------------------------------------
  // Update cross-location sharing consent
  // -------------------------------------------------------------------------
  updateCrossLocationConsent: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        consent: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, consent } = input;

      // Verify patient exists and belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        select: {
          id: true,
          consentForCrossLocationSharing: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const updated = await ctx.prisma.patient.update({
        where: { id: patientId },
        data: {
          consentForCrossLocationSharing: consent,
          crossLocationConsentDate: consent ? new Date() : null,
        },
      });

      // Audit log
      await auditLog('PATIENT_CROSS_LOCATION_CONSENT', 'Patient', {
        entityId: patientId,
        changes: {
          previousConsent: patient.consentForCrossLocationSharing,
          newConsent: consent,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        consent: updated.consentForCrossLocationSharing,
        consentDate: updated.crossLocationConsentDate,
      };
    }),

  // -------------------------------------------------------------------------
  // Get patient with cross-location access check
  // -------------------------------------------------------------------------
  getCrossLocation: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        accessingLocationId: z.string(),
        reason: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, accessingLocationId, reason } = input;

      // Verify the accessing location exists and user has access
      const accessingLocation = await ctx.prisma.location.findFirst({
        where: {
          id: accessingLocationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
        include: {
          locationSettings: true,
        },
      });

      if (!accessingLocation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Accessing location not found',
        });
      }

      // Get patient with full details
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          contacts: { where: { isPrimary: true }, take: 1 },
          insurances: { where: { isActive: true } },
          homeLocation: { select: { id: true, name: true, code: true } },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check if this is a cross-location access (patient's home location differs from accessing location)
      const isCrossLocationAccess =
        patient.homeLocationId !== null && patient.homeLocationId !== accessingLocationId;

      // If cross-location access, verify it's allowed
      if (isCrossLocationAccess) {
        // Check if location settings allow cross-location access
        const locationSettings = accessingLocation.locationSettings;
        if (locationSettings && !locationSettings.allowCrossLocationAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cross-location access is not enabled for this location',
          });
        }

        // Check if patient has consented to cross-location sharing
        if (!patient.consentForCrossLocationSharing) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Patient has not consented to cross-location record sharing',
          });
        }

        // Log the cross-location access
        const { ipAddress, userAgent } = await getRequestMetadata();
        await ctx.prisma.crossLocationAccessLog.create({
          data: {
            patientId,
            userId: ctx.user.id,
            accessingLocationId,
            accessType: 'VIEW_RECORD',
            entityType: 'Patient',
            reason,
            ipAddress,
            userAgent,
            organizationId: ctx.user.organizationId,
          },
        });

        // Audit log
        await auditLog('PATIENT_CROSS_LOCATION_VIEW', 'Patient', {
          entityId: patientId,
          changes: {
            accessingLocationId,
            homeLocationId: patient.homeLocationId,
            reason,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });
      }

      return {
        patient: {
          id: patient.id,
          mrn: patient.mrn,
          status: patient.status,
          demographics: patient.demographics,
          primaryContact: patient.contacts[0] || null,
          insurances: patient.insurances,
          homeLocation: patient.homeLocation,
          consentForCrossLocationSharing: patient.consentForCrossLocationSharing,
          crossLocationConsentDate: patient.crossLocationConsentDate,
        },
        isCrossLocationAccess,
        accessingLocation: {
          id: accessingLocation.id,
          name: accessingLocation.name,
        },
      };
    }),

  // -------------------------------------------------------------------------
  // Get patient visit history with location information
  // -------------------------------------------------------------------------
  getVisitHistory: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        accessingLocationId: z.string(),
        includeAllLocations: z.boolean().default(true),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, accessingLocationId, includeAllLocations, limit, offset } = input;

      // Verify patient and access
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        select: {
          id: true,
          homeLocationId: true,
          consentForCrossLocationSharing: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const isCrossLocationAccess =
        patient.homeLocationId !== null && patient.homeLocationId !== accessingLocationId;

      // For cross-location access, check consent
      if (isCrossLocationAccess && !patient.consentForCrossLocationSharing) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Patient has not consented to cross-location record sharing',
        });
      }

      // Build where clause for encounters
      const whereClause: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      // If not including all locations, filter to accessing location only
      if (!includeAllLocations) {
        whereClause.locationId = accessingLocationId;
      }

      const [encounters, total] = await Promise.all([
        ctx.prisma.encounter.findMany({
          where: whereClause,
          orderBy: { encounterDate: 'desc' },
          take: limit,
          skip: offset,
          include: {
            location_: { select: { id: true, name: true, code: true } },
            provider: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
        ctx.prisma.encounter.count({ where: whereClause }),
      ]);

      // Log cross-location access if applicable
      if (isCrossLocationAccess && includeAllLocations) {
        const { ipAddress, userAgent } = await getRequestMetadata();
        await ctx.prisma.crossLocationAccessLog.create({
          data: {
            patientId,
            userId: ctx.user.id,
            accessingLocationId,
            accessType: 'VIEW_ENCOUNTERS',
            entityType: 'Encounter',
            ipAddress,
            userAgent,
            organizationId: ctx.user.organizationId,
          },
        });
      }

      return {
        encounters: encounters.map((e) => ({
          id: e.id,
          encounterDate: e.encounterDate,
          status: e.status,
          encounterType: e.encounterType,
          chiefComplaint: e.chiefComplaint,
          location: e.location_
            ? { id: e.location_.id, name: e.location_.name, code: e.location_.code }
            : null,
          provider: e.provider
            ? {
                id: e.provider.id,
                name: `${e.provider.user.firstName} ${e.provider.user.lastName}`,
              }
            : null,
        })),
        total,
        limit,
        offset,
        hasMore: offset + encounters.length < total,
      };
    }),

  // -------------------------------------------------------------------------
  // Get patient balance by location
  // -------------------------------------------------------------------------
  getBalanceByLocation: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        accessingLocationId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, accessingLocationId } = input;

      // Verify patient
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        select: {
          id: true,
          homeLocationId: true,
          consentForCrossLocationSharing: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const isCrossLocationAccess =
        patient.homeLocationId !== null && patient.homeLocationId !== accessingLocationId;

      // For cross-location access, check consent
      if (isCrossLocationAccess && !patient.consentForCrossLocationSharing) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Patient has not consented to cross-location record sharing',
        });
      }

      // Get balances by location
      const balances = await ctx.prisma.patientLocationBalance.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          location: { select: { id: true, name: true, code: true } },
        },
        orderBy: { location: { name: 'asc' } },
      });

      // Calculate consolidated balance
      const consolidated = balances.reduce(
        (acc, b) => ({
          totalCharges: acc.totalCharges + Number(b.totalCharges),
          totalPayments: acc.totalPayments + Number(b.totalPayments),
          totalAdjustments: acc.totalAdjustments + Number(b.totalAdjustments),
          currentBalance: acc.currentBalance + Number(b.currentBalance),
        }),
        { totalCharges: 0, totalPayments: 0, totalAdjustments: 0, currentBalance: 0 }
      );

      // Log cross-location access if viewing balances from different location
      if (isCrossLocationAccess) {
        const { ipAddress, userAgent } = await getRequestMetadata();
        await ctx.prisma.crossLocationAccessLog.create({
          data: {
            patientId,
            userId: ctx.user.id,
            accessingLocationId,
            accessType: 'VIEW_BALANCE',
            entityType: 'PatientLocationBalance',
            ipAddress,
            userAgent,
            organizationId: ctx.user.organizationId,
          },
        });
      }

      return {
        byLocation: balances.map((b) => ({
          location: b.location,
          totalCharges: Number(b.totalCharges),
          totalPayments: Number(b.totalPayments),
          totalAdjustments: Number(b.totalAdjustments),
          currentBalance: Number(b.currentBalance),
          lastChargeDate: b.lastChargeDate,
          lastPaymentDate: b.lastPaymentDate,
        })),
        consolidated,
      };
    }),

  // -------------------------------------------------------------------------
  // Get cross-location access log for a patient
  // -------------------------------------------------------------------------
  getAccessLog: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        accessType: crossLocationAccessTypeSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, limit, offset, accessType } = input;

      // Verify patient exists
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        select: { id: true },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (accessType) {
        where.accessType = accessType;
      }

      const [logs, total] = await Promise.all([
        ctx.prisma.crossLocationAccessLog.findMany({
          where,
          orderBy: { accessedAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            accessingLocation: { select: { id: true, name: true, code: true } },
          },
        }),
        ctx.prisma.crossLocationAccessLog.count({ where }),
      ]);

      return {
        logs: logs.map((l) => ({
          id: l.id,
          accessedAt: l.accessedAt,
          accessType: l.accessType,
          entityType: l.entityType,
          entityId: l.entityId,
          reason: l.reason,
          user: {
            id: l.user.id,
            name: `${l.user.firstName} ${l.user.lastName}`,
            email: l.user.email,
          },
          accessingLocation: l.accessingLocation,
        })),
        total,
        limit,
        offset,
        hasMore: offset + logs.length < total,
      };
    }),

  // -------------------------------------------------------------------------
  // Log cross-location access (for use by other routers)
  // -------------------------------------------------------------------------
  logAccess: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        accessingLocationId: z.string(),
        accessType: crossLocationAccessTypeSchema,
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        reason: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, accessingLocationId, accessType, entityType, entityId, reason, notes } =
        input;

      // Verify patient
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        select: { id: true, homeLocationId: true },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Only log if this is actually a cross-location access
      const isCrossLocationAccess =
        patient.homeLocationId !== null && patient.homeLocationId !== accessingLocationId;

      if (!isCrossLocationAccess) {
        return { logged: false, reason: 'Not a cross-location access' };
      }

      const { ipAddress, userAgent } = await getRequestMetadata();

      const log = await ctx.prisma.crossLocationAccessLog.create({
        data: {
          patientId,
          userId: ctx.user.id,
          accessingLocationId,
          accessType: accessType as CrossLocationAccessType,
          entityType: entityType || 'Patient',
          entityId,
          reason,
          notes,
          ipAddress,
          userAgent,
          organizationId: ctx.user.organizationId,
        },
      });

      return { logged: true, logId: log.id };
    }),

  // -------------------------------------------------------------------------
  // List patients at a specific location (home location)
  // -------------------------------------------------------------------------
  listByLocation: protectedProcedure
    .input(
      z.object({
        locationId: z.string(),
        includeNoHomeLocation: z.boolean().default(false),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { locationId, includeNoHomeLocation, search, limit, offset } = input;

      // Build where clause
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        status: { not: 'ARCHIVED' },
      };

      if (includeNoHomeLocation) {
        where.OR = [{ homeLocationId: locationId }, { homeLocationId: null }];
      } else {
        where.homeLocationId = locationId;
      }

      // Search
      if (search) {
        where.AND = [
          {
            OR: [
              { mrn: { contains: search, mode: 'insensitive' } },
              {
                demographics: {
                  OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          },
        ];
      }

      const [patients, total] = await Promise.all([
        ctx.prisma.patient.findMany({
          where,
          orderBy: { demographics: { lastName: 'asc' } },
          take: limit,
          skip: offset,
          include: {
            demographics: {
              select: { firstName: true, lastName: true, dateOfBirth: true },
            },
            homeLocation: { select: { id: true, name: true, code: true } },
          },
        }),
        ctx.prisma.patient.count({ where }),
      ]);

      return {
        patients: patients.map((p) => ({
          id: p.id,
          mrn: p.mrn,
          status: p.status,
          firstName: p.demographics?.firstName,
          lastName: p.demographics?.lastName,
          dateOfBirth: p.demographics?.dateOfBirth,
          homeLocation: p.homeLocation,
          consentForCrossLocationSharing: p.consentForCrossLocationSharing,
        })),
        total,
        limit,
        offset,
        hasMore: offset + patients.length < total,
      };
    }),

  // -------------------------------------------------------------------------
  // Update patient location balance (called by billing module)
  // -------------------------------------------------------------------------
  updateLocationBalance: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        locationId: z.string(),
        chargeAmount: z.number().optional(),
        paymentAmount: z.number().optional(),
        adjustmentAmount: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, locationId, chargeAmount, paymentAmount, adjustmentAmount } = input;

      // Verify patient and location
      const [patient, location] = await Promise.all([
        ctx.prisma.patient.findFirst({
          where: { id: patientId, organizationId: ctx.user.organizationId },
          select: { id: true },
        }),
        ctx.prisma.location.findFirst({
          where: { id: locationId, organizationId: ctx.user.organizationId },
          select: { id: true },
        }),
      ]);

      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      }
      if (!location) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Location not found' });
      }

      // Upsert the balance record
      const existing = await ctx.prisma.patientLocationBalance.findUnique({
        where: { patientId_locationId: { patientId, locationId } },
      });

      const updates: Record<string, unknown> = {};

      if (chargeAmount !== undefined) {
        updates.totalCharges = { increment: chargeAmount };
        updates.currentBalance = { increment: chargeAmount };
        updates.lastChargeDate = new Date();
      }
      if (paymentAmount !== undefined) {
        updates.totalPayments = { increment: paymentAmount };
        updates.currentBalance = { decrement: paymentAmount };
        updates.lastPaymentDate = new Date();
      }
      if (adjustmentAmount !== undefined) {
        updates.totalAdjustments = { increment: adjustmentAmount };
        updates.currentBalance = { decrement: adjustmentAmount };
      }

      let balance;
      if (existing) {
        balance = await ctx.prisma.patientLocationBalance.update({
          where: { id: existing.id },
          data: updates,
        });
      } else {
        balance = await ctx.prisma.patientLocationBalance.create({
          data: {
            patientId,
            locationId,
            organizationId: ctx.user.organizationId,
            totalCharges: chargeAmount || 0,
            totalPayments: paymentAmount || 0,
            totalAdjustments: adjustmentAmount || 0,
            currentBalance: (chargeAmount || 0) - (paymentAmount || 0) - (adjustmentAmount || 0),
            lastChargeDate: chargeAmount ? new Date() : null,
            lastPaymentDate: paymentAmount ? new Date() : null,
          },
        });
      }

      // Audit log
      await auditLog('PATIENT_BALANCE_BY_LOCATION_UPDATE', 'PatientLocationBalance', {
        entityId: balance.id,
        changes: { chargeAmount, paymentAmount, adjustmentAmount, locationId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        balance: {
          totalCharges: Number(balance.totalCharges),
          totalPayments: Number(balance.totalPayments),
          totalAdjustments: Number(balance.totalAdjustments),
          currentBalance: Number(balance.currentBalance),
        },
      };
    }),
});
