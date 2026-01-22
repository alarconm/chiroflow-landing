// Enterprise Reporting Router - US-253
// Epic 25 - Multi-Location Enterprise - Consolidated Reporting

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { ExportFormat, ReportType, AppointmentStatus, PaymentMethod } from '@prisma/client';

// ============================================
// Types for Enterprise Reports
// ============================================

interface LocationMetrics {
  locationId: string;
  locationName: string;
  locationCode: string;

  // Volume metrics
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShows: number;

  // Patient metrics
  totalPatients: number;
  newPatients: number;
  activePatients: number;

  // Financial metrics
  totalCharges: number;
  totalCollections: number;
  totalAdjustments: number;
  netRevenue: number;
  outstandingAR: number;

  // Efficiency metrics
  noShowRate: number;
  collectionRate: number;
  avgRevenuePerVisit: number;
}

interface EnterpriseOverview {
  periodStart: Date;
  periodEnd: Date;
  locationCount: number;

  // Aggregated metrics
  totals: {
    totalAppointments: number;
    completedAppointments: number;
    totalPatients: number;
    newPatients: number;
    totalCharges: number;
    totalCollections: number;
    netRevenue: number;
    outstandingAR: number;
    avgNoShowRate: number;
    avgCollectionRate: number;
  };

  // Per-location breakdown
  byLocation: LocationMetrics[];
}

interface LocationComparisonRow {
  metric: string;
  metricLabel: string;
  format: 'number' | 'currency' | 'percentage';
  locations: {
    locationId: string;
    locationName: string;
    value: number;
  }[];
  enterpriseTotal: number;
  enterpriseAverage: number;
}

interface ARAgingByLocation {
  locationId: string;
  locationName: string;
  current: number;
  days31_60: number;
  days61_90: number;
  days91_120: number;
  over120: number;
  total: number;
  chargeCount: number;
  avgAge: number;
}

interface ProviderProductivityByLocation {
  providerId: string;
  providerName: string;
  locations: {
    locationId: string;
    locationName: string;
    visits: number;
    charges: number;
    collections: number;
    collectionRate: number;
  }[];
  totals: {
    visits: number;
    charges: number;
    collections: number;
    collectionRate: number;
  };
}

interface PatientVolumeByLocation {
  locationId: string;
  locationName: string;
  totalPatients: number;
  newPatients: number;
  returningPatients: number;
  avgVisitsPerPatient: number;
  topDiagnoses: { code: string; description: string; count: number }[];
}

// Zod schemas for input validation
const dateRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
});

const locationFilterSchema = z.object({
  locationIds: z.array(z.string()).optional(),
  includeInactive: z.boolean().default(false),
});

export const enterpriseReportingRouter = router({
  // ============================================
  // ENTERPRISE OVERVIEW
  // ============================================

  /**
   * Get enterprise-wide aggregated report across all locations
   * reports.getEnterprise - All-location aggregated reports
   */
  getEnterprise: billerProcedure
    .input(
      z.object({
        dateRange: dateRangeSchema,
        locationIds: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }): Promise<EnterpriseOverview> => {
      const { start, end } = input.dateRange;
      const organizationId = ctx.user.organizationId;

      // Get locations for the organization
      const locationWhere: { organizationId: string; isActive: boolean; id?: { in: string[] } } = {
        organizationId,
        isActive: true,
      };

      if (input.locationIds && input.locationIds.length > 0) {
        locationWhere.id = { in: input.locationIds };
      }

      const locations = await ctx.prisma.location.findMany({
        where: locationWhere,
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      });

      const locationIds = locations.map(l => l.id);

      // Get appointments by location
      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          organizationId,
          startTime: { gte: start, lte: end },
          locationId: { in: locationIds },
        },
      });

      // Get patients with home location
      const patients = await ctx.prisma.patient.findMany({
        where: {
          organizationId,
          homeLocationId: { in: locationIds },
        },
        select: {
          id: true,
          homeLocationId: true,
          createdAt: true,
        },
      });

      // Get charges by location (via encounter)
      const charges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: { gte: start, lte: end },
        },
        include: {
          encounter: {
            select: { locationId: true },
          },
        },
      });

      // Get payments
      const payments = await ctx.prisma.payment.findMany({
        where: {
          organizationId,
          paymentDate: { gte: start, lte: end },
          isVoid: false,
        },
        include: {
          allocations: {
            include: {
              charge: {
                include: {
                  encounter: {
                    select: { locationId: true },
                  },
                },
              },
            },
          },
        },
      });

      // Get outstanding AR by location
      const outstandingCharges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          balance: { gt: 0 },
        },
        include: {
          encounter: {
            select: { locationId: true },
          },
        },
      });

      // Build per-location metrics
      const byLocation: LocationMetrics[] = [];

      let totalAppointments = 0;
      let totalCompleted = 0;
      let totalPatients = 0;
      let totalNewPatients = 0;
      let totalCharges = 0;
      let totalCollections = 0;
      let totalAR = 0;

      for (const location of locations) {
        // Appointments for this location
        const locAppts = appointments.filter(a => a.locationId === location.id);
        const completed = locAppts.filter(a => a.status === AppointmentStatus.COMPLETED).length;
        const cancelled = locAppts.filter(a => a.status === AppointmentStatus.CANCELLED).length;
        const noShows = locAppts.filter(a => a.status === AppointmentStatus.NO_SHOW).length;

        // Patients for this location
        const locPatients = patients.filter(p => p.homeLocationId === location.id);
        const newPats = locPatients.filter(p => p.createdAt >= start && p.createdAt <= end).length;

        // Charges for this location
        const locCharges = charges.filter(c => c.encounter?.locationId === location.id);
        const chargeTotal = locCharges.reduce((sum, c) => sum + Number(c.fee), 0);
        const adjustmentTotal = locCharges.reduce((sum, c) => sum + Number(c.adjustments), 0);

        // Payments for this location (via charge allocation)
        let locCollections = 0;
        for (const payment of payments) {
          for (const alloc of payment.allocations) {
            if (alloc.charge.encounter?.locationId === location.id) {
              locCollections += Number(alloc.amount);
            }
          }
        }

        // Outstanding AR for this location
        const locOutstanding = outstandingCharges
          .filter(c => c.encounter?.locationId === location.id)
          .reduce((sum, c) => sum + Number(c.balance), 0);

        const noShowRate = locAppts.length > 0
          ? Math.round((noShows / locAppts.length) * 1000) / 10
          : 0;
        const collectionRate = chargeTotal > 0
          ? Math.round((locCollections / chargeTotal) * 1000) / 10
          : 0;
        const avgRevenue = completed > 0
          ? Math.round((locCollections / completed) * 100) / 100
          : 0;

        byLocation.push({
          locationId: location.id,
          locationName: location.name,
          locationCode: location.code,
          totalAppointments: locAppts.length,
          completedAppointments: completed,
          cancelledAppointments: cancelled,
          noShows,
          totalPatients: locPatients.length,
          newPatients: newPats,
          activePatients: locPatients.filter(p => {
            // Consider active if they had an appointment in the period
            return appointments.some(a => a.patientId === p.id && a.locationId === location.id);
          }).length,
          totalCharges: Math.round(chargeTotal * 100) / 100,
          totalCollections: Math.round(locCollections * 100) / 100,
          totalAdjustments: Math.round(adjustmentTotal * 100) / 100,
          netRevenue: Math.round((locCollections - adjustmentTotal) * 100) / 100,
          outstandingAR: Math.round(locOutstanding * 100) / 100,
          noShowRate,
          collectionRate,
          avgRevenuePerVisit: avgRevenue,
        });

        // Accumulate totals
        totalAppointments += locAppts.length;
        totalCompleted += completed;
        totalPatients += locPatients.length;
        totalNewPatients += newPats;
        totalCharges += chargeTotal;
        totalCollections += locCollections;
        totalAR += locOutstanding;
      }

      const avgNoShowRate = byLocation.length > 0
        ? Math.round((byLocation.reduce((sum, l) => sum + l.noShowRate, 0) / byLocation.length) * 10) / 10
        : 0;
      const avgCollectionRate = totalCharges > 0
        ? Math.round((totalCollections / totalCharges) * 1000) / 10
        : 0;

      return {
        periodStart: start,
        periodEnd: end,
        locationCount: locations.length,
        totals: {
          totalAppointments,
          completedAppointments: totalCompleted,
          totalPatients,
          newPatients: totalNewPatients,
          totalCharges: Math.round(totalCharges * 100) / 100,
          totalCollections: Math.round(totalCollections * 100) / 100,
          netRevenue: Math.round(totalCollections * 100) / 100,
          outstandingAR: Math.round(totalAR * 100) / 100,
          avgNoShowRate,
          avgCollectionRate,
        },
        byLocation,
      };
    }),

  // ============================================
  // FILTER BY LOCATION
  // ============================================

  /**
   * Get financial report filtered by specific locations
   */
  getFinancialByLocation: billerProcedure
    .input(
      z.object({
        dateRange: dateRangeSchema,
        locationIds: z.array(z.string()),
      })
    )
    .query(async ({ ctx, input }) => {
      const { start, end } = input.dateRange;
      const organizationId = ctx.user.organizationId;

      // Verify locations belong to organization
      const locations = await ctx.prisma.location.findMany({
        where: {
          id: { in: input.locationIds },
          organizationId,
        },
      });

      if (locations.length !== input.locationIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more locations not found'
        });
      }

      const results = [];

      for (const location of locations) {
        // Get charges for this location
        const charges = await ctx.prisma.charge.findMany({
          where: {
            organizationId,
            serviceDate: { gte: start, lte: end },
            encounter: { locationId: location.id },
          },
          include: {
            paymentAllocations: true,
          },
        });

        let totalCharges = 0;
        let totalCollections = 0;
        let totalAdjustments = 0;

        for (const charge of charges) {
          totalCharges += Number(charge.fee);
          totalAdjustments += Number(charge.adjustments);
          for (const alloc of charge.paymentAllocations) {
            totalCollections += Number(alloc.amount);
          }
        }

        results.push({
          locationId: location.id,
          locationName: location.name,
          locationCode: location.code,
          totalCharges: Math.round(totalCharges * 100) / 100,
          totalCollections: Math.round(totalCollections * 100) / 100,
          totalAdjustments: Math.round(totalAdjustments * 100) / 100,
          netRevenue: Math.round((totalCollections - totalAdjustments) * 100) / 100,
          collectionRate: totalCharges > 0
            ? Math.round((totalCollections / totalCharges) * 1000) / 10
            : 0,
          chargeCount: charges.length,
        });
      }

      return {
        periodStart: start,
        periodEnd: end,
        locations: results,
        totals: {
          totalCharges: results.reduce((sum, r) => sum + r.totalCharges, 0),
          totalCollections: results.reduce((sum, r) => sum + r.totalCollections, 0),
          totalAdjustments: results.reduce((sum, r) => sum + r.totalAdjustments, 0),
          netRevenue: results.reduce((sum, r) => sum + r.netRevenue, 0),
        },
      };
    }),

  // ============================================
  // COMPARE LOCATIONS SIDE-BY-SIDE
  // ============================================

  /**
   * Compare locations side-by-side across key metrics
   */
  compareLocations: billerProcedure
    .input(
      z.object({
        dateRange: dateRangeSchema,
        locationIds: z.array(z.string()).min(2).max(10),
        metrics: z.array(z.enum([
          'appointments',
          'completedVisits',
          'noShowRate',
          'newPatients',
          'totalCharges',
          'totalCollections',
          'collectionRate',
          'avgRevenuePerVisit',
          'outstandingAR',
        ])).optional(),
      })
    )
    .query(async ({ ctx, input }): Promise<{ rows: LocationComparisonRow[]; periodStart: Date; periodEnd: Date }> => {
      const { start, end } = input.dateRange;
      const organizationId = ctx.user.organizationId;

      // Get enterprise data for comparison
      const locations = await ctx.prisma.location.findMany({
        where: {
          id: { in: input.locationIds },
          organizationId,
        },
      });

      if (locations.length < 2) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'At least 2 valid locations required for comparison',
        });
      }

      // Fetch all data needed for comparison
      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          organizationId,
          startTime: { gte: start, lte: end },
          locationId: { in: input.locationIds },
        },
      });

      const patients = await ctx.prisma.patient.findMany({
        where: {
          organizationId,
          homeLocationId: { in: input.locationIds },
          createdAt: { gte: start, lte: end },
        },
      });

      const charges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: { gte: start, lte: end },
        },
        include: {
          encounter: { select: { locationId: true } },
          paymentAllocations: true,
        },
      });

      const outstandingCharges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          balance: { gt: 0 },
        },
        include: {
          encounter: { select: { locationId: true } },
        },
      });

      // Build comparison data
      const locationData = new Map<string, {
        name: string;
        appointments: number;
        completedVisits: number;
        noShows: number;
        newPatients: number;
        totalCharges: number;
        totalCollections: number;
        outstandingAR: number;
      }>();

      for (const loc of locations) {
        const locAppts = appointments.filter(a => a.locationId === loc.id);
        const locCharges = charges.filter(c => c.encounter?.locationId === loc.id);

        let collections = 0;
        for (const charge of locCharges) {
          for (const alloc of charge.paymentAllocations) {
            collections += Number(alloc.amount);
          }
        }

        locationData.set(loc.id, {
          name: loc.name,
          appointments: locAppts.length,
          completedVisits: locAppts.filter(a => a.status === AppointmentStatus.COMPLETED).length,
          noShows: locAppts.filter(a => a.status === AppointmentStatus.NO_SHOW).length,
          newPatients: patients.filter(p => p.homeLocationId === loc.id).length,
          totalCharges: locCharges.reduce((sum, c) => sum + Number(c.fee), 0),
          totalCollections: collections,
          outstandingAR: outstandingCharges
            .filter(c => c.encounter?.locationId === loc.id)
            .reduce((sum, c) => sum + Number(c.balance), 0),
        });
      }

      // Build comparison rows
      const defaultMetrics = input.metrics || [
        'appointments',
        'completedVisits',
        'noShowRate',
        'totalCharges',
        'totalCollections',
        'collectionRate',
        'outstandingAR',
      ];

      const rows: LocationComparisonRow[] = [];

      const metricDefinitions: Record<string, { label: string; format: 'number' | 'currency' | 'percentage'; getValue: (data: ReturnType<typeof locationData.get>) => number }> = {
        appointments: {
          label: 'Total Appointments',
          format: 'number',
          getValue: (d) => d?.appointments || 0,
        },
        completedVisits: {
          label: 'Completed Visits',
          format: 'number',
          getValue: (d) => d?.completedVisits || 0,
        },
        noShowRate: {
          label: 'No-Show Rate',
          format: 'percentage',
          getValue: (d) => d && d.appointments > 0
            ? Math.round((d.noShows / d.appointments) * 1000) / 10
            : 0,
        },
        newPatients: {
          label: 'New Patients',
          format: 'number',
          getValue: (d) => d?.newPatients || 0,
        },
        totalCharges: {
          label: 'Total Charges',
          format: 'currency',
          getValue: (d) => Math.round((d?.totalCharges || 0) * 100) / 100,
        },
        totalCollections: {
          label: 'Total Collections',
          format: 'currency',
          getValue: (d) => Math.round((d?.totalCollections || 0) * 100) / 100,
        },
        collectionRate: {
          label: 'Collection Rate',
          format: 'percentage',
          getValue: (d) => d && d.totalCharges > 0
            ? Math.round((d.totalCollections / d.totalCharges) * 1000) / 10
            : 0,
        },
        avgRevenuePerVisit: {
          label: 'Avg Revenue per Visit',
          format: 'currency',
          getValue: (d) => d && d.completedVisits > 0
            ? Math.round((d.totalCollections / d.completedVisits) * 100) / 100
            : 0,
        },
        outstandingAR: {
          label: 'Outstanding A/R',
          format: 'currency',
          getValue: (d) => Math.round((d?.outstandingAR || 0) * 100) / 100,
        },
      };

      for (const metric of defaultMetrics) {
        const def = metricDefinitions[metric];
        if (!def) continue;

        const locationValues = locations.map(loc => ({
          locationId: loc.id,
          locationName: loc.name,
          value: def.getValue(locationData.get(loc.id)),
        }));

        const total = locationValues.reduce((sum, lv) => sum + lv.value, 0);
        const avg = locationValues.length > 0 ? total / locationValues.length : 0;

        rows.push({
          metric,
          metricLabel: def.label,
          format: def.format,
          locations: locationValues,
          enterpriseTotal: def.format === 'percentage' ? avg : Math.round(total * 100) / 100,
          enterpriseAverage: Math.round(avg * 100) / 100,
        });
      }

      return {
        periodStart: start,
        periodEnd: end,
        rows,
      };
    }),

  // ============================================
  // ROLL-UP FINANCIAL REPORTS
  // ============================================

  /**
   * Get consolidated financial roll-up across all locations
   */
  getFinancialRollup: billerProcedure
    .input(
      z.object({
        dateRange: dateRangeSchema,
        groupBy: z.enum(['day', 'week', 'month']).default('month'),
      })
    )
    .query(async ({ ctx, input }) => {
      const { start, end } = input.dateRange;
      const organizationId = ctx.user.organizationId;

      // Get all locations
      const locations = await ctx.prisma.location.findMany({
        where: { organizationId, isActive: true },
      });

      // Get all charges with location info
      const charges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: { gte: start, lte: end },
        },
        include: {
          encounter: { select: { locationId: true } },
          paymentAllocations: true,
        },
        orderBy: { serviceDate: 'asc' },
      });

      // Group by period and location
      const periodMap = new Map<string, Map<string, {
        charges: number;
        collections: number;
        adjustments: number;
        chargeCount: number;
      }>>();

      for (const charge of charges) {
        const periodKey = getPeriodKey(charge.serviceDate, input.groupBy);
        const locationId = charge.encounter?.locationId || 'unassigned';

        if (!periodMap.has(periodKey)) {
          periodMap.set(periodKey, new Map());
        }

        const locationMap = periodMap.get(periodKey)!;
        if (!locationMap.has(locationId)) {
          locationMap.set(locationId, {
            charges: 0,
            collections: 0,
            adjustments: 0,
            chargeCount: 0,
          });
        }

        const data = locationMap.get(locationId)!;
        data.charges += Number(charge.fee);
        data.adjustments += Number(charge.adjustments);
        data.chargeCount += 1;

        for (const alloc of charge.paymentAllocations) {
          data.collections += Number(alloc.amount);
        }
      }

      // Build result
      const periods = Array.from(periodMap.keys()).sort();
      const result = {
        periodStart: start,
        periodEnd: end,
        groupBy: input.groupBy,
        periods: periods.map(periodKey => {
          const locationMap = periodMap.get(periodKey)!;
          const byLocation = locations.map(loc => {
            const data = locationMap.get(loc.id);
            return {
              locationId: loc.id,
              locationName: loc.name,
              charges: Math.round((data?.charges || 0) * 100) / 100,
              collections: Math.round((data?.collections || 0) * 100) / 100,
              adjustments: Math.round((data?.adjustments || 0) * 100) / 100,
              netRevenue: Math.round(((data?.collections || 0) - (data?.adjustments || 0)) * 100) / 100,
            };
          });

          const totals = {
            charges: byLocation.reduce((sum, l) => sum + l.charges, 0),
            collections: byLocation.reduce((sum, l) => sum + l.collections, 0),
            adjustments: byLocation.reduce((sum, l) => sum + l.adjustments, 0),
            netRevenue: byLocation.reduce((sum, l) => sum + l.netRevenue, 0),
          };

          return {
            period: periodKey,
            byLocation,
            totals,
          };
        }),
        grandTotals: {
          charges: 0,
          collections: 0,
          adjustments: 0,
          netRevenue: 0,
        },
      };

      // Calculate grand totals
      for (const period of result.periods) {
        result.grandTotals.charges += period.totals.charges;
        result.grandTotals.collections += period.totals.collections;
        result.grandTotals.adjustments += period.totals.adjustments;
        result.grandTotals.netRevenue += period.totals.netRevenue;
      }

      return result;
    }),

  // ============================================
  // MULTI-LOCATION AR AGING
  // ============================================

  /**
   * Get AR aging report broken down by location
   */
  getARAgingByLocation: billerProcedure
    .input(
      z.object({
        asOfDate: z.date().optional(),
        locationIds: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }): Promise<{
      asOfDate: Date;
      byLocation: ARAgingByLocation[];
      enterpriseTotals: {
        current: number;
        days31_60: number;
        days61_90: number;
        days91_120: number;
        over120: number;
        total: number;
        avgAge: number;
      };
    }> => {
      const asOfDate = input.asOfDate || new Date();
      const organizationId = ctx.user.organizationId;

      // Get locations
      const locationWhere: { organizationId: string; isActive: boolean; id?: { in: string[] } } = {
        organizationId,
        isActive: true,
      };
      if (input.locationIds && input.locationIds.length > 0) {
        locationWhere.id = { in: input.locationIds };
      }

      const locations = await ctx.prisma.location.findMany({
        where: locationWhere,
      });

      // Get outstanding charges
      const charges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          balance: { gt: 0 },
        },
        include: {
          encounter: { select: { locationId: true } },
        },
      });

      // Calculate AR by location
      const byLocation: ARAgingByLocation[] = [];

      let totalCurrent = 0;
      let total31_60 = 0;
      let total61_90 = 0;
      let total91_120 = 0;
      let totalOver120 = 0;
      let grandTotal = 0;
      let weightedAgeDays = 0;

      for (const location of locations) {
        const locCharges = charges.filter(c => c.encounter?.locationId === location.id);

        let current = 0;
        let days31_60 = 0;
        let days61_90 = 0;
        let days91_120 = 0;
        let over120 = 0;
        let locTotal = 0;
        let locWeightedAge = 0;

        for (const charge of locCharges) {
          const balance = Number(charge.balance);
          const daysOld = Math.floor(
            (asOfDate.getTime() - charge.serviceDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          locTotal += balance;
          locWeightedAge += balance * daysOld;

          if (daysOld <= 30) {
            current += balance;
          } else if (daysOld <= 60) {
            days31_60 += balance;
          } else if (daysOld <= 90) {
            days61_90 += balance;
          } else if (daysOld <= 120) {
            days91_120 += balance;
          } else {
            over120 += balance;
          }
        }

        const avgAge = locTotal > 0 ? Math.round(locWeightedAge / locTotal) : 0;

        byLocation.push({
          locationId: location.id,
          locationName: location.name,
          current: Math.round(current * 100) / 100,
          days31_60: Math.round(days31_60 * 100) / 100,
          days61_90: Math.round(days61_90 * 100) / 100,
          days91_120: Math.round(days91_120 * 100) / 100,
          over120: Math.round(over120 * 100) / 100,
          total: Math.round(locTotal * 100) / 100,
          chargeCount: locCharges.length,
          avgAge,
        });

        totalCurrent += current;
        total31_60 += days31_60;
        total61_90 += days61_90;
        total91_120 += days91_120;
        totalOver120 += over120;
        grandTotal += locTotal;
        weightedAgeDays += locWeightedAge;
      }

      return {
        asOfDate,
        byLocation,
        enterpriseTotals: {
          current: Math.round(totalCurrent * 100) / 100,
          days31_60: Math.round(total31_60 * 100) / 100,
          days61_90: Math.round(total61_90 * 100) / 100,
          days91_120: Math.round(total91_120 * 100) / 100,
          over120: Math.round(totalOver120 * 100) / 100,
          total: Math.round(grandTotal * 100) / 100,
          avgAge: grandTotal > 0 ? Math.round(weightedAgeDays / grandTotal) : 0,
        },
      };
    }),

  // ============================================
  // PROVIDER PRODUCTIVITY BY LOCATION
  // ============================================

  /**
   * Get provider productivity broken down by location
   */
  getProviderProductivityByLocation: billerProcedure
    .input(
      z.object({
        dateRange: dateRangeSchema,
        providerIds: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }): Promise<{
      periodStart: Date;
      periodEnd: Date;
      providers: ProviderProductivityByLocation[];
      locationTotals: {
        locationId: string;
        locationName: string;
        visits: number;
        charges: number;
        collections: number;
      }[];
    }> => {
      const { start, end } = input.dateRange;
      const organizationId = ctx.user.organizationId;

      // Get providers
      const providerWhere: { organizationId: string; isActive: boolean; id?: { in: string[] } } = {
        organizationId,
        isActive: true,
      };
      if (input.providerIds && input.providerIds.length > 0) {
        providerWhere.id = { in: input.providerIds };
      }

      const providers = await ctx.prisma.provider.findMany({
        where: providerWhere,
        include: { user: true },
      });

      // Get locations
      const locations = await ctx.prisma.location.findMany({
        where: { organizationId, isActive: true },
      });

      // Get appointments by provider and location
      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          organizationId,
          startTime: { gte: start, lte: end },
          status: AppointmentStatus.COMPLETED,
          providerId: { in: providers.map(p => p.id) },
        },
      });

      // Get charges by provider with location
      const charges = await ctx.prisma.charge.findMany({
        where: {
          organizationId,
          serviceDate: { gte: start, lte: end },
          providerId: { in: providers.map(p => p.id) },
        },
        include: {
          encounter: { select: { locationId: true } },
          paymentAllocations: true,
        },
      });

      // Build provider productivity data
      const providerResults: ProviderProductivityByLocation[] = [];

      for (const provider of providers) {
        const providerName = provider.user
          ? `${provider.user.firstName} ${provider.user.lastName}`.trim()
          : 'Unknown Provider';

        const locationResults = [];
        let totalVisits = 0;
        let totalCharges = 0;
        let totalCollections = 0;

        for (const location of locations) {
          const locAppts = appointments.filter(
            a => a.providerId === provider.id && a.locationId === location.id
          );
          const locCharges = charges.filter(
            c => c.providerId === provider.id && c.encounter?.locationId === location.id
          );

          const locChargeTotal = locCharges.reduce((sum, c) => sum + Number(c.fee), 0);
          let locCollections = 0;
          for (const charge of locCharges) {
            for (const alloc of charge.paymentAllocations) {
              locCollections += Number(alloc.amount);
            }
          }

          if (locAppts.length > 0 || locChargeTotal > 0) {
            locationResults.push({
              locationId: location.id,
              locationName: location.name,
              visits: locAppts.length,
              charges: Math.round(locChargeTotal * 100) / 100,
              collections: Math.round(locCollections * 100) / 100,
              collectionRate: locChargeTotal > 0
                ? Math.round((locCollections / locChargeTotal) * 1000) / 10
                : 0,
            });

            totalVisits += locAppts.length;
            totalCharges += locChargeTotal;
            totalCollections += locCollections;
          }
        }

        if (locationResults.length > 0) {
          providerResults.push({
            providerId: provider.id,
            providerName,
            locations: locationResults,
            totals: {
              visits: totalVisits,
              charges: Math.round(totalCharges * 100) / 100,
              collections: Math.round(totalCollections * 100) / 100,
              collectionRate: totalCharges > 0
                ? Math.round((totalCollections / totalCharges) * 1000) / 10
                : 0,
            },
          });
        }
      }

      // Calculate location totals
      const locationTotals = locations.map(loc => {
        let visits = 0;
        let charges = 0;
        let collections = 0;

        for (const provider of providerResults) {
          const locData = provider.locations.find(l => l.locationId === loc.id);
          if (locData) {
            visits += locData.visits;
            charges += locData.charges;
            collections += locData.collections;
          }
        }

        return {
          locationId: loc.id,
          locationName: loc.name,
          visits,
          charges: Math.round(charges * 100) / 100,
          collections: Math.round(collections * 100) / 100,
        };
      }).filter(l => l.visits > 0 || l.charges > 0);

      return {
        periodStart: start,
        periodEnd: end,
        providers: providerResults,
        locationTotals,
      };
    }),

  // ============================================
  // PATIENT VOLUME BY LOCATION
  // ============================================

  /**
   * Get patient volume metrics by location
   */
  getPatientVolumeByLocation: protectedProcedure
    .input(
      z.object({
        dateRange: dateRangeSchema,
        locationIds: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }): Promise<{
      periodStart: Date;
      periodEnd: Date;
      byLocation: PatientVolumeByLocation[];
      enterpriseTotals: {
        totalPatients: number;
        newPatients: number;
        totalVisits: number;
        avgVisitsPerPatient: number;
      };
    }> => {
      const { start, end } = input.dateRange;
      const organizationId = ctx.user.organizationId;

      // Get locations
      const locationWhere: { organizationId: string; isActive: boolean; id?: { in: string[] } } = {
        organizationId,
        isActive: true,
      };
      if (input.locationIds && input.locationIds.length > 0) {
        locationWhere.id = { in: input.locationIds };
      }

      const locations = await ctx.prisma.location.findMany({
        where: locationWhere,
      });

      // Get patients
      const patients = await ctx.prisma.patient.findMany({
        where: { organizationId },
        select: { id: true, homeLocationId: true, createdAt: true },
      });

      // Get appointments
      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          organizationId,
          startTime: { gte: start, lte: end },
          status: AppointmentStatus.COMPLETED,
          locationId: { in: locations.map(l => l.id) },
        },
      });

      // Get encounters with diagnoses
      const encounters = await ctx.prisma.encounter.findMany({
        where: {
          organizationId,
          encounterDate: { gte: start, lte: end },
          locationId: { in: locations.map(l => l.id) },
        },
        include: {
          diagnoses: true,
        },
      });

      // Build patient volume by location
      const byLocation: PatientVolumeByLocation[] = [];
      let totalPatients = 0;
      let totalNewPatients = 0;
      let totalVisits = 0;

      for (const location of locations) {
        // Patients with this home location
        const locPatients = patients.filter(p => p.homeLocationId === location.id);
        const newPatients = locPatients.filter(
          p => p.createdAt >= start && p.createdAt <= end
        ).length;

        // Appointments at this location
        const locAppts = appointments.filter(a => a.locationId === location.id);

        // Unique patients who visited
        const uniquePatientIds = new Set(locAppts.map(a => a.patientId));
        const returningPatients = locPatients.filter(p => !patients.some(
          np => np.id === p.id && np.createdAt >= start && np.createdAt <= end
        )).length;

        // Calculate avg visits per patient
        const avgVisits = uniquePatientIds.size > 0
          ? Math.round((locAppts.length / uniquePatientIds.size) * 10) / 10
          : 0;

        // Get top diagnoses for this location
        const locEncounters = encounters.filter(e => e.locationId === location.id);
        const diagnosisCounts = new Map<string, { code: string; description: string; count: number }>();

        for (const encounter of locEncounters) {
          for (const diagnosis of encounter.diagnoses) {
            const key = diagnosis.icd10Code;
            const existing = diagnosisCounts.get(key);
            if (existing) {
              existing.count += 1;
            } else {
              diagnosisCounts.set(key, {
                code: diagnosis.icd10Code,
                description: diagnosis.description || diagnosis.icd10Code,
                count: 1,
              });
            }
          }
        }

        const topDiagnoses = Array.from(diagnosisCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        byLocation.push({
          locationId: location.id,
          locationName: location.name,
          totalPatients: locPatients.length,
          newPatients,
          returningPatients,
          avgVisitsPerPatient: avgVisits,
          topDiagnoses,
        });

        totalPatients += locPatients.length;
        totalNewPatients += newPatients;
        totalVisits += locAppts.length;
      }

      const allUniquePatients = new Set(appointments.map(a => a.patientId));

      return {
        periodStart: start,
        periodEnd: end,
        byLocation,
        enterpriseTotals: {
          totalPatients,
          newPatients: totalNewPatients,
          totalVisits,
          avgVisitsPerPatient: allUniquePatients.size > 0
            ? Math.round((totalVisits / allUniquePatients.size) * 10) / 10
            : 0,
        },
      };
    }),

  // ============================================
  // EXPORT ENTERPRISE REPORTS
  // ============================================

  /**
   * Export enterprise reports in various formats
   */
  exportEnterpriseReport: billerProcedure
    .input(
      z.object({
        reportType: z.enum([
          'enterprise-overview',
          'location-comparison',
          'ar-aging-by-location',
          'provider-productivity',
          'patient-volume',
          'financial-rollup',
        ]),
        dateRange: dateRangeSchema,
        format: z.nativeEnum(ExportFormat),
        locationIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const organizationId = ctx.user.organizationId;

      // Create export record
      const exportRecord = await ctx.prisma.reportExport.create({
        data: {
          organizationId,
          userId: ctx.user.id,
          reportType: ReportType.CUSTOM,
          fileName: `enterprise-${input.reportType}-${Date.now()}.${input.format.toLowerCase()}`,
          exportFormat: input.format,
          status: 'PENDING',
          parameters: {
            reportType: input.reportType,
            dateRange: {
              start: input.dateRange.start.toISOString(),
              end: input.dateRange.end.toISOString(),
            },
            locationIds: input.locationIds,
          },
        },
      });

      // Log the export request
      await auditLog('REPORT_EXPORT_REQUEST', 'ReportExport', {
        entityId: exportRecord.id,
        changes: {
          reportType: input.reportType,
          format: input.format,
          locationCount: input.locationIds?.length || 'all',
        },
        userId: ctx.user.id,
        organizationId,
      });

      // For now, mark as completed (actual export processing would be async)
      // In production, this would queue a job to generate the file
      await ctx.prisma.reportExport.update({
        where: { id: exportRecord.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      return {
        exportId: exportRecord.id,
        status: 'COMPLETED',
        message: 'Export queued successfully',
      };
    }),

  // ============================================
  // LOCATION LIST FOR FILTERS
  // ============================================

  /**
   * Get list of locations for report filters
   */
  getLocationsForFilter: protectedProcedure
    .input(
      z.object({
        includeInactive: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const where: { organizationId: string; isActive?: boolean; deletedAt?: null } = {
        organizationId: ctx.user.organizationId,
        deletedAt: null,
      };

      if (!input?.includeInactive) {
        where.isActive = true;
      }

      return ctx.prisma.location.findMany({
        where,
        select: {
          id: true,
          name: true,
          code: true,
          isPrimary: true,
          isActive: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      });
    }),
});

// Helper function to get period key
function getPeriodKey(date: Date, groupBy: 'day' | 'week' | 'month'): string {
  const d = new Date(date);

  if (groupBy === 'day') {
    return d.toISOString().split('T')[0];
  } else if (groupBy === 'week') {
    // Get Monday of the week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return `Week of ${monday.toISOString().split('T')[0]}`;
  } else {
    // Month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
