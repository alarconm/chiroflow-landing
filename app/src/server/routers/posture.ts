import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

// Validation schemas
const postureViewSchema = z.enum(['ANTERIOR', 'POSTERIOR', 'LATERAL_LEFT', 'LATERAL_RIGHT']);

export const postureRouter = router({
  // Create a new posture assessment
  createAssessment: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, encounterId, notes } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // If encounterId provided, verify it exists
      if (encounterId) {
        const encounter = await ctx.prisma.encounter.findFirst({
          where: {
            id: encounterId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!encounter) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Encounter not found',
          });
        }
      }

      return ctx.prisma.postureAssessment.create({
        data: {
          patientId,
          organizationId: ctx.user.organizationId,
          encounterId: encounterId || null,
          notes: notes || null,
        },
        include: {
          images: true,
        },
      });
    }),

  // Get assessment by ID
  getAssessment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const assessment = await ctx.prisma.postureAssessment.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          images: {
            include: {
              landmarks: true,
            },
            orderBy: { captureDate: 'desc' },
          },
          deviations: {
            orderBy: { severity: 'desc' },
          },
          patient: true,
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      return assessment;
    }),

  // List assessments for a patient
  listByPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        includeComplete: z.boolean().default(true),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, includeComplete, limit, cursor } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where = {
        patientId,
        organizationId: ctx.user.organizationId,
        ...(includeComplete ? {} : { isComplete: false }),
      };

      const assessments = await ctx.prisma.postureAssessment.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { assessmentDate: 'desc' },
        include: {
          images: {
            select: {
              id: true,
              view: true,
              thumbnailUrl: true,
            },
          },
          _count: {
            select: {
              images: true,
              deviations: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (assessments.length > limit) {
        const nextItem = assessments.pop();
        nextCursor = nextItem?.id;
      }

      return {
        assessments,
        nextCursor,
      };
    }),

  // Delete an image from assessment
  deleteImage: providerProcedure
    .input(z.object({ imageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const image = await ctx.prisma.postureImage.findFirst({
        where: {
          id: input.imageId,
          assessment: {
            organizationId: ctx.user.organizationId,
          },
        },
        include: {
          assessment: true,
        },
      });

      if (!image) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      if (image.assessment.isComplete) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete images from a completed assessment',
        });
      }

      await ctx.prisma.postureImage.delete({
        where: { id: input.imageId },
      });

      return { success: true };
    }),

  // Update image notes
  updateImageNotes: providerProcedure
    .input(
      z.object({
        imageId: z.string(),
        notes: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const image = await ctx.prisma.postureImage.findFirst({
        where: {
          id: input.imageId,
          assessment: {
            organizationId: ctx.user.organizationId,
          },
        },
      });

      if (!image) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      return ctx.prisma.postureImage.update({
        where: { id: input.imageId },
        data: { notes: input.notes },
      });
    }),

  // Get available view types with metadata
  getViewTypes: protectedProcedure.query(() => {
    return [
      {
        value: 'ANTERIOR',
        label: 'Anterior (Front)',
        description: 'Front-facing view for shoulder, hip level assessment',
        guidePoints: ['Align feet on marks', 'Face camera directly', 'Arms at sides'],
      },
      {
        value: 'POSTERIOR',
        label: 'Posterior (Back)',
        description: 'Back view for spinal alignment and shoulder assessment',
        guidePoints: ['Align feet on marks', 'Face away from camera', 'Arms at sides'],
      },
      {
        value: 'LATERAL_LEFT',
        label: 'Left Lateral',
        description: 'Left side view for forward head posture, kyphosis assessment',
        guidePoints: ['Left side to camera', 'Feet together', 'Arms at sides'],
      },
      {
        value: 'LATERAL_RIGHT',
        label: 'Right Lateral',
        description: 'Right side view for forward head posture, kyphosis assessment',
        guidePoints: ['Right side to camera', 'Feet together', 'Arms at sides'],
      },
    ];
  }),

  // Get images for an assessment by view
  getImagesByView: protectedProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        view: postureViewSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const assessment = await ctx.prisma.postureAssessment.findFirst({
        where: {
          id: input.assessmentId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      return ctx.prisma.postureImage.findMany({
        where: {
          assessmentId: input.assessmentId,
          ...(input.view ? { view: input.view } : {}),
        },
        include: {
          landmarks: true,
        },
        orderBy: { captureDate: 'desc' },
      });
    }),

  // Mark assessment as complete
  completeAssessment: providerProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        overallAssessment: z.string().optional(),
        recommendations: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const assessment = await ctx.prisma.postureAssessment.findFirst({
        where: {
          id: input.assessmentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          _count: {
            select: { images: true },
          },
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      if (assessment._count.images === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot complete assessment without any images',
        });
      }

      return ctx.prisma.postureAssessment.update({
        where: { id: input.assessmentId },
        data: {
          isComplete: true,
          completedAt: new Date(),
          overallAssessment: input.overallAssessment || null,
          recommendations: input.recommendations || null,
        },
      });
    }),

  // Update assessment notes
  updateAssessment: providerProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        notes: z.string().optional(),
        overallAssessment: z.string().optional(),
        recommendations: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { assessmentId, ...data } = input;

      const assessment = await ctx.prisma.postureAssessment.findFirst({
        where: {
          id: assessmentId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      return ctx.prisma.postureAssessment.update({
        where: { id: assessmentId },
        data,
      });
    }),

  // Delete assessment
  deleteAssessment: providerProcedure
    .input(z.object({ assessmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const assessment = await ctx.prisma.postureAssessment.findFirst({
        where: {
          id: input.assessmentId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      // Cascade delete will handle images and landmarks
      await ctx.prisma.postureAssessment.delete({
        where: { id: input.assessmentId },
      });

      return { success: true };
    }),

  // Get assessment summary for patient (for dashboard/quick view)
  getPatientSummary: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: input.patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const [totalAssessments, completedAssessments, recentAssessment] = await Promise.all([
        ctx.prisma.postureAssessment.count({
          where: {
            patientId: input.patientId,
            organizationId: ctx.user.organizationId,
          },
        }),
        ctx.prisma.postureAssessment.count({
          where: {
            patientId: input.patientId,
            organizationId: ctx.user.organizationId,
            isComplete: true,
          },
        }),
        ctx.prisma.postureAssessment.findFirst({
          where: {
            patientId: input.patientId,
            organizationId: ctx.user.organizationId,
          },
          orderBy: { assessmentDate: 'desc' },
          include: {
            images: {
              select: {
                id: true,
                view: true,
                thumbnailUrl: true,
              },
              take: 4,
            },
          },
        }),
      ]);

      return {
        totalAssessments,
        completedAssessments,
        recentAssessment,
      };
    }),
});
