/**
 * Kiosk Router
 * Epic 04: Digital Intake System
 * US-042: Kiosk mode tRPC endpoints
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { TRPCError } from '@trpc/server';

export const kioskRouter = router({
  // ==========================================
  // SEARCH PATIENTS - Public search for kiosk
  // ==========================================
  searchPatients: publicProcedure
    .input(
      z.object({
        organizationId: z.string(), // Passed from kiosk config
        firstName: z.string().optional(),
        lastName: z.string().min(1, 'Last name is required'),
        dateOfBirth: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { organizationId, firstName, lastName, dateOfBirth } = input;

      // Build search criteria
      const whereClause: Record<string, unknown> = {
        organizationId,
        status: 'ACTIVE',
        demographics: {
          lastName: {
            contains: lastName,
            mode: 'insensitive',
          },
        },
      };

      // Add first name filter if provided
      if (firstName) {
        (whereClause.demographics as Record<string, unknown>).firstName = {
          contains: firstName,
          mode: 'insensitive',
        };
      }

      // Add DOB filter if provided
      if (dateOfBirth) {
        const dob = new Date(dateOfBirth);
        (whereClause.demographics as Record<string, unknown>).dateOfBirth = dob;
      }

      const patients = await prisma.patient.findMany({
        where: whereClause,
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
            },
          },
        },
        take: 10, // Limit results for kiosk
      });

      return patients.map((p) => ({
        id: p.id,
        mrn: p.mrn,
        firstName: p.demographics?.firstName || '',
        lastName: p.demographics?.lastName || '',
        dateOfBirth: p.demographics?.dateOfBirth?.toISOString().split('T')[0] || '',
      }));
    }),

  // ==========================================
  // GET PENDING FORMS - Get patient's pending forms
  // ==========================================
  getPendingForms: publicProcedure
    .input(
      z.object({
        patientId: z.string(),
        organizationId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { patientId, organizationId } = input;

      // Verify patient belongs to organization
      const patient = await prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get pending form submissions
      const submissions = await prisma.formSubmission.findMany({
        where: {
          patientId,
          status: 'PENDING',
          template: {
            organizationId,
            isActive: true,
            publishedAt: { not: null },
          },
        },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Also get forms that need to be completed (from form deliveries)
      const pendingDeliveries = await prisma.formDelivery.findMany({
        where: {
          patientId,
          completedAt: null,
          template: {
            organizationId,
            isActive: true,
            publishedAt: { not: null },
          },
        },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      });

      // Create submissions for pending deliveries if needed (those without existing submissions)
      const createdSubmissions = [];
      for (const delivery of pendingDeliveries) {
        // Check if a submission already exists for this delivery
        const existingSubmission = await prisma.formSubmission.findFirst({
          where: { deliveryId: delivery.id },
        });

        if (!existingSubmission) {
          const submission = await prisma.formSubmission.create({
            data: {
              organizationId,
              templateId: delivery.templateId,
              patientId,
              source: 'KIOSK',
              status: 'PENDING',
              deliveryId: delivery.id,
            },
            include: {
              template: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                },
              },
            },
          });
          createdSubmissions.push(submission);
        }
      }

      // Combine existing and newly created submissions
      const allSubmissions = [...submissions, ...createdSubmissions];

      return allSubmissions.map((s) => ({
        id: s.id,
        accessToken: s.accessToken,
        status: s.status,
        template: {
          id: s.template.id,
          name: s.template.name,
          description: s.template.description,
        },
        createdAt: s.createdAt,
      }));
    }),

  // ==========================================
  // CREATE WALK-IN SUBMISSION - For new patients at kiosk
  // ==========================================
  createWalkInSubmission: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        templateId: z.string(),
        patientId: z.string().optional(), // Optional - for existing patients
      })
    )
    .mutation(async ({ input }) => {
      const { organizationId, templateId, patientId } = input;

      // Verify template exists and is published
      const template = await prisma.formTemplate.findFirst({
        where: {
          id: templateId,
          organizationId,
          isActive: true,
          publishedAt: { not: null },
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      // If patientId provided, verify patient exists
      if (patientId) {
        const patient = await prisma.patient.findFirst({
          where: {
            id: patientId,
            organizationId,
          },
        });

        if (!patient) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Patient not found',
          });
        }
      }

      // Create submission
      const submission = await prisma.formSubmission.create({
        data: {
          organizationId,
          templateId,
          patientId,
          source: 'KIOSK',
          status: 'PENDING',
        },
      });

      return {
        id: submission.id,
        accessToken: submission.accessToken,
      };
    }),

  // ==========================================
  // GET AVAILABLE TEMPLATES - Templates available at kiosk
  // ==========================================
  getAvailableTemplates: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const templates = await prisma.formTemplate.findMany({
        where: {
          organizationId: input.organizationId,
          isActive: true,
          publishedAt: { not: null },
        },
        select: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: { name: 'asc' },
      });

      return templates;
    }),
});
