import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  detectLandmarks,
  getLandmarksForView,
  LANDMARK_DEFINITIONS,
  LANDMARK_GROUPS,
  calculateLandmarkAngle,
  calculateLevelDifference,
  type LandmarkName,
  type DetectedLandmark,
} from '@/lib/services/landmarkDetection';
import {
  DEVIATION_TYPES,
  analyzeDeviationsForView,
  analyzeAssessmentDeviations,
  generateDeviationReport,
  calculateSeverity,
  type DeviationMeasurement,
  type SeverityLevel,
} from '@/lib/services/deviationAnalysis';
import {
  compareDeviations,
  calculateImprovementScore,
  generateProgressSummary,
  generateComparisonRecommendations,
  generateComparisonReport,
  generateReportHTML,
  calculateOverlayAlignment,
  type ComparisonResult,
  type ViewComparison,
  type PostureAssessmentSummary,
  type PostureImageData,
} from '@/lib/services/postureComparison';

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

  // ============================================
  // AI LANDMARK DETECTION (US-210)
  // ============================================

  // Run AI landmark detection on an image
  analyzeLandmarks: providerProcedure
    .input(
      z.object({
        imageId: z.string(),
        forceReanalyze: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { imageId, forceReanalyze } = input;

      // Get the image with its assessment
      const image = await ctx.prisma.postureImage.findFirst({
        where: {
          id: imageId,
          assessment: {
            organizationId: ctx.user.organizationId,
          },
        },
        include: {
          assessment: true,
          landmarks: true,
        },
      });

      if (!image) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      // Check if already analyzed (unless force reanalyze)
      if (image.isAnalyzed && !forceReanalyze && image.landmarks.length > 0) {
        return {
          success: true,
          message: 'Image already analyzed. Use forceReanalyze to re-analyze.',
          landmarks: image.landmarks,
          wasReanalyzed: false,
        };
      }

      // Run AI detection
      const result = await detectLandmarks(image.imageUrl, image.view);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to analyze landmarks',
        });
      }

      // Delete existing landmarks if reanalyzing
      if (forceReanalyze && image.landmarks.length > 0) {
        await ctx.prisma.postureLandmark.deleteMany({
          where: { imageId },
        });
      }

      // Store detected landmarks
      const createdLandmarks = await Promise.all(
        result.landmarks.map((landmark) =>
          ctx.prisma.postureLandmark.create({
            data: {
              imageId,
              name: landmark.name,
              x: landmark.x,
              y: landmark.y,
              z: landmark.z || null,
              confidence: landmark.confidence,
              isManual: false,
            },
          })
        )
      );

      // Update image analysis status
      await ctx.prisma.postureImage.update({
        where: { id: imageId },
        data: {
          isAnalyzed: true,
          analyzedAt: new Date(),
          analysisData: {
            method: result.analysisMethod,
            modelVersion: result.modelVersion,
            processingTimeMs: result.processingTimeMs,
            warnings: result.warnings,
          },
        },
      });

      return {
        success: true,
        message: `Detected ${createdLandmarks.length} landmarks`,
        landmarks: createdLandmarks,
        wasReanalyzed: forceReanalyze,
        warnings: result.warnings,
      };
    }),

  // Update a single landmark (manual adjustment)
  updateLandmark: providerProcedure
    .input(
      z.object({
        landmarkId: z.string(),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { landmarkId, x, y } = input;

      // Get landmark and verify access
      const landmark = await ctx.prisma.postureLandmark.findFirst({
        where: {
          id: landmarkId,
          image: {
            assessment: {
              organizationId: ctx.user.organizationId,
            },
          },
        },
      });

      if (!landmark) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Landmark not found',
        });
      }

      // Update landmark, storing original if first manual adjustment
      return ctx.prisma.postureLandmark.update({
        where: { id: landmarkId },
        data: {
          x,
          y,
          isManual: true,
          originalX: landmark.isManual ? landmark.originalX : landmark.x,
          originalY: landmark.isManual ? landmark.originalY : landmark.y,
          confidence: 1.0, // Manual adjustments are considered high confidence
        },
      });
    }),

  // Batch update landmarks
  updateLandmarksBatch: providerProcedure
    .input(
      z.object({
        imageId: z.string(),
        landmarks: z.array(
          z.object({
            id: z.string().optional(), // Optional for new landmarks
            name: z.string(),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { imageId, landmarks } = input;

      // Verify image access
      const image = await ctx.prisma.postureImage.findFirst({
        where: {
          id: imageId,
          assessment: {
            organizationId: ctx.user.organizationId,
          },
        },
        include: {
          landmarks: true,
        },
      });

      if (!image) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      // Process each landmark
      const results = await Promise.all(
        landmarks.map(async (lm) => {
          if (lm.id) {
            // Update existing landmark
            const existing = image.landmarks.find((l) => l.id === lm.id);
            if (existing) {
              return ctx.prisma.postureLandmark.update({
                where: { id: lm.id },
                data: {
                  x: lm.x,
                  y: lm.y,
                  isManual: true,
                  originalX: existing.isManual ? existing.originalX : existing.x,
                  originalY: existing.isManual ? existing.originalY : existing.y,
                  confidence: 1.0,
                },
              });
            }
          }

          // Create new landmark
          return ctx.prisma.postureLandmark.create({
            data: {
              imageId,
              name: lm.name,
              x: lm.x,
              y: lm.y,
              isManual: true,
              confidence: 1.0,
            },
          });
        })
      );

      return {
        success: true,
        updated: results.length,
        landmarks: results,
      };
    }),

  // Add a new landmark manually
  addLandmark: providerProcedure
    .input(
      z.object({
        imageId: z.string(),
        name: z.string(),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { imageId, name, x, y } = input;

      // Verify image access
      const image = await ctx.prisma.postureImage.findFirst({
        where: {
          id: imageId,
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

      return ctx.prisma.postureLandmark.create({
        data: {
          imageId,
          name,
          x,
          y,
          isManual: true,
          confidence: 1.0,
        },
      });
    }),

  // Delete a landmark
  deleteLandmark: providerProcedure
    .input(z.object({ landmarkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const landmark = await ctx.prisma.postureLandmark.findFirst({
        where: {
          id: input.landmarkId,
          image: {
            assessment: {
              organizationId: ctx.user.organizationId,
            },
          },
        },
      });

      if (!landmark) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Landmark not found',
        });
      }

      await ctx.prisma.postureLandmark.delete({
        where: { id: input.landmarkId },
      });

      return { success: true };
    }),

  // Reset landmark to AI-detected position
  resetLandmark: providerProcedure
    .input(z.object({ landmarkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const landmark = await ctx.prisma.postureLandmark.findFirst({
        where: {
          id: input.landmarkId,
          image: {
            assessment: {
              organizationId: ctx.user.organizationId,
            },
          },
        },
      });

      if (!landmark) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Landmark not found',
        });
      }

      if (!landmark.isManual || landmark.originalX === null || landmark.originalY === null) {
        return landmark; // Already at original position
      }

      return ctx.prisma.postureLandmark.update({
        where: { id: input.landmarkId },
        data: {
          x: landmark.originalX,
          y: landmark.originalY,
          isManual: false,
          confidence: 0.5, // Reset to AI confidence
        },
      });
    }),

  // Get landmarks for an image
  getLandmarks: protectedProcedure
    .input(z.object({ imageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const image = await ctx.prisma.postureImage.findFirst({
        where: {
          id: input.imageId,
          assessment: {
            organizationId: ctx.user.organizationId,
          },
        },
        include: {
          landmarks: true,
        },
      });

      if (!image) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      return {
        landmarks: image.landmarks,
        isAnalyzed: image.isAnalyzed,
        analyzedAt: image.analyzedAt,
        analysisData: image.analysisData,
      };
    }),

  // Get landmark definitions for a view
  getLandmarkDefinitions: protectedProcedure
    .input(z.object({ view: postureViewSchema }))
    .query(({ input }) => {
      const applicableLandmarks = getLandmarksForView(input.view);

      return {
        landmarks: applicableLandmarks.map((landmarkKey) => {
          const def = LANDMARK_DEFINITIONS[landmarkKey];
          return {
            key: landmarkKey,
            name: def.name,
            group: def.group,
            views: def.views,
          };
        }),
        groups: LANDMARK_GROUPS,
      };
    }),

  // Analyze all images in an assessment
  analyzeAssessment: providerProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        forceReanalyze: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { assessmentId, forceReanalyze } = input;

      const assessment = await ctx.prisma.postureAssessment.findFirst({
        where: {
          id: assessmentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          images: {
            include: {
              landmarks: true,
            },
          },
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      const results = [];

      for (const image of assessment.images) {
        // Skip if already analyzed and not forcing reanalyze
        if (image.isAnalyzed && !forceReanalyze && image.landmarks.length > 0) {
          results.push({
            imageId: image.id,
            view: image.view,
            skipped: true,
            landmarkCount: image.landmarks.length,
          });
          continue;
        }

        // Run detection
        const result = await detectLandmarks(image.imageUrl, image.view);

        if (result.success) {
          // Delete existing landmarks if reanalyzing
          if (forceReanalyze) {
            await ctx.prisma.postureLandmark.deleteMany({
              where: { imageId: image.id },
            });
          }

          // Store landmarks
          const landmarks = await Promise.all(
            result.landmarks.map((lm) =>
              ctx.prisma.postureLandmark.create({
                data: {
                  imageId: image.id,
                  name: lm.name,
                  x: lm.x,
                  y: lm.y,
                  z: lm.z || null,
                  confidence: lm.confidence,
                  isManual: false,
                },
              })
            )
          );

          // Update image
          await ctx.prisma.postureImage.update({
            where: { id: image.id },
            data: {
              isAnalyzed: true,
              analyzedAt: new Date(),
              analysisData: {
                method: result.analysisMethod,
                modelVersion: result.modelVersion,
                processingTimeMs: result.processingTimeMs,
              },
            },
          });

          results.push({
            imageId: image.id,
            view: image.view,
            success: true,
            landmarkCount: landmarks.length,
          });
        } else {
          results.push({
            imageId: image.id,
            view: image.view,
            success: false,
            error: result.error,
          });
        }
      }

      const successCount = results.filter((r) => r.success || r.skipped).length;
      const totalLandmarks = results.reduce((sum, r) => sum + (r.landmarkCount || 0), 0);

      return {
        success: successCount === results.length,
        message: `Analyzed ${successCount}/${results.length} images with ${totalLandmarks} total landmarks`,
        results,
      };
    }),

  // Get analysis status for assessment
  getAnalysisStatus: protectedProcedure
    .input(z.object({ assessmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const assessment = await ctx.prisma.postureAssessment.findFirst({
        where: {
          id: input.assessmentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          images: {
            select: {
              id: true,
              view: true,
              isAnalyzed: true,
              analyzedAt: true,
              _count: {
                select: { landmarks: true },
              },
            },
          },
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      const totalImages = assessment.images.length;
      const analyzedImages = assessment.images.filter((i) => i.isAnalyzed).length;
      const totalLandmarks = assessment.images.reduce(
        (sum, i) => sum + i._count.landmarks,
        0
      );

      return {
        totalImages,
        analyzedImages,
        totalLandmarks,
        isFullyAnalyzed: totalImages > 0 && analyzedImages === totalImages,
        images: assessment.images.map((img) => ({
          id: img.id,
          view: img.view,
          isAnalyzed: img.isAnalyzed,
          analyzedAt: img.analyzedAt,
          landmarkCount: img._count.landmarks,
        })),
      };
    }),

  // ============================================
  // POSTURAL DEVIATION ANALYSIS (US-211)
  // ============================================

  // Analyze deviations from landmarks - main analysis procedure
  analyzeDeviations: providerProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        patientHeightCm: z.number().min(50).max(250).optional().default(170),
        forceReanalyze: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { assessmentId, patientHeightCm, forceReanalyze } = input;

      // Get assessment with images and landmarks
      const assessment = await ctx.prisma.postureAssessment.findFirst({
        where: {
          id: assessmentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          images: {
            include: {
              landmarks: true,
            },
          },
          deviations: true,
          patient: {
            include: {
              demographics: true,
            },
          },
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      // Check if we have analyzed images
      const analyzedImages = assessment.images.filter(
        (img) => img.isAnalyzed && img.landmarks.length > 0
      );

      if (analyzedImages.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No analyzed images found. Please run landmark detection first.',
        });
      }

      // Check if already has deviations (unless force reanalyze)
      if (assessment.deviations.length > 0 && !forceReanalyze) {
        return {
          success: true,
          message: 'Deviations already calculated. Use forceReanalyze to recalculate.',
          deviations: assessment.deviations,
          wasReanalyzed: false,
        };
      }

      // Delete existing deviations if reanalyzing
      if (forceReanalyze && assessment.deviations.length > 0) {
        await ctx.prisma.postureDeviation.deleteMany({
          where: { assessmentId },
        });
      }

      // Prepare image analyses
      const imageAnalyses = analyzedImages.map((img) => ({
        view: img.view as 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT',
        landmarks: img.landmarks.map((lm) => ({
          name: lm.name as LandmarkName,
          x: lm.x,
          y: lm.y,
          z: lm.z || undefined,
          confidence: lm.confidence ?? 0.5, // Default confidence if null
          isManual: lm.isManual,
        })),
      }));

      // Run deviation analysis
      const analysisResult = analyzeAssessmentDeviations(imageAnalyses, patientHeightCm);

      // Store deviations in database
      const createdDeviations = await Promise.all(
        analysisResult.deviations.map((deviation) =>
          ctx.prisma.postureDeviation.create({
            data: {
              assessmentId,
              deviationType: deviation.deviationType,
              description: deviation.description,
              measurementValue: deviation.measurementValue,
              measurementUnit: deviation.measurementUnit,
              normalRangeMin: deviation.normalRangeMin,
              normalRangeMax: deviation.normalRangeMax,
              deviationAmount: deviation.deviationAmount,
              severity: deviation.severity,
              direction: deviation.direction || null,
              notes: deviation.notes || null,
            },
          })
        )
      );

      // Update assessment with summary
      await ctx.prisma.postureAssessment.update({
        where: { id: assessmentId },
        data: {
          overallAssessment: analysisResult.summaryNotes,
        },
      });

      return {
        success: true,
        message: `Analyzed ${analysisResult.deviations.length} deviations across ${analysisResult.analyzedViews.length} views`,
        deviations: createdDeviations,
        overallSeverity: analysisResult.overallSeverity,
        summaryNotes: analysisResult.summaryNotes,
        warnings: analysisResult.warnings,
        wasReanalyzed: forceReanalyze,
      };
    }),

  // Get deviations for an assessment
  getDeviations: protectedProcedure
    .input(z.object({ assessmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const assessment = await ctx.prisma.postureAssessment.findFirst({
        where: {
          id: input.assessmentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          deviations: {
            orderBy: [
              { severity: 'desc' },
              { deviationType: 'asc' },
            ],
          },
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      // Group deviations by type
      const groupedDeviations = {
        headNeck: assessment.deviations.filter((d) =>
          ['head_forward', 'head_tilt', 'head_rotation'].includes(d.deviationType)
        ),
        shoulders: assessment.deviations.filter((d) =>
          ['shoulder_uneven', 'shoulder_protracted'].includes(d.deviationType)
        ),
        spine: assessment.deviations.filter((d) =>
          ['kyphosis', 'lordosis', 'scoliosis'].includes(d.deviationType)
        ),
        pelvis: assessment.deviations.filter((d) =>
          ['hip_uneven', 'pelvic_tilt_lateral', 'pelvic_tilt_anterior'].includes(d.deviationType)
        ),
        knees: assessment.deviations.filter((d) =>
          ['knee_valgus', 'knee_varus', 'knee_hyperextension'].includes(d.deviationType)
        ),
        ankles: assessment.deviations.filter((d) =>
          ['ankle_pronation', 'ankle_supination'].includes(d.deviationType)
        ),
        overall: assessment.deviations.filter((d) =>
          ['weight_shift'].includes(d.deviationType)
        ),
      };

      // Calculate overall severity
      const severityOrder = ['MINIMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREME'];
      const overallSeverity = assessment.deviations.reduce<string>((highest, dev) => {
        const currentIndex = severityOrder.indexOf(dev.severity);
        const highestIndex = severityOrder.indexOf(highest);
        return currentIndex > highestIndex ? dev.severity : highest;
      }, 'MINIMAL');

      return {
        deviations: assessment.deviations,
        groupedDeviations,
        overallSeverity,
        totalCount: assessment.deviations.length,
        significantCount: assessment.deviations.filter((d) => d.severity !== 'MINIMAL').length,
      };
    }),

  // Create or update a single deviation manually
  createDeviation: providerProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        deviationType: z.string(),
        description: z.string().optional(),
        measurementValue: z.number().optional(),
        measurementUnit: z.string().optional(),
        normalRangeMin: z.number().optional(),
        normalRangeMax: z.number().optional(),
        severity: z.enum(['MINIMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREME']),
        direction: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { assessmentId, ...deviationData } = input;

      // Verify assessment access
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

      // Calculate deviation amount if measurement provided
      let deviationAmount: number | undefined;
      if (
        deviationData.measurementValue !== undefined &&
        deviationData.normalRangeMin !== undefined &&
        deviationData.normalRangeMax !== undefined
      ) {
        if (deviationData.measurementValue < deviationData.normalRangeMin) {
          deviationAmount = deviationData.normalRangeMin - deviationData.measurementValue;
        } else if (deviationData.measurementValue > deviationData.normalRangeMax) {
          deviationAmount = deviationData.measurementValue - deviationData.normalRangeMax;
        } else {
          deviationAmount = 0;
        }
      }

      return ctx.prisma.postureDeviation.create({
        data: {
          assessmentId,
          ...deviationData,
          deviationAmount,
        },
      });
    }),

  // Update an existing deviation
  updateDeviation: providerProcedure
    .input(
      z.object({
        deviationId: z.string(),
        measurementValue: z.number().optional(),
        severity: z.enum(['MINIMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREME']).optional(),
        direction: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { deviationId, ...updateData } = input;

      // Verify deviation access
      const deviation = await ctx.prisma.postureDeviation.findFirst({
        where: {
          id: deviationId,
          assessment: {
            organizationId: ctx.user.organizationId,
          },
        },
      });

      if (!deviation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Deviation not found',
        });
      }

      // Recalculate deviation amount if measurement changed
      let deviationAmount = deviation.deviationAmount;
      if (
        updateData.measurementValue !== undefined &&
        deviation.normalRangeMin !== null &&
        deviation.normalRangeMax !== null
      ) {
        if (updateData.measurementValue < deviation.normalRangeMin) {
          deviationAmount = deviation.normalRangeMin - updateData.measurementValue;
        } else if (updateData.measurementValue > deviation.normalRangeMax) {
          deviationAmount = updateData.measurementValue - deviation.normalRangeMax;
        } else {
          deviationAmount = 0;
        }
      }

      return ctx.prisma.postureDeviation.update({
        where: { id: deviationId },
        data: {
          ...updateData,
          deviationAmount,
        },
      });
    }),

  // Delete a deviation
  deleteDeviation: providerProcedure
    .input(z.object({ deviationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deviation = await ctx.prisma.postureDeviation.findFirst({
        where: {
          id: input.deviationId,
          assessment: {
            organizationId: ctx.user.organizationId,
          },
        },
      });

      if (!deviation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Deviation not found',
        });
      }

      await ctx.prisma.postureDeviation.delete({
        where: { id: input.deviationId },
      });

      return { success: true };
    }),

  // Get deviation type definitions
  getDeviationTypes: protectedProcedure.query(() => {
    return Object.entries(DEVIATION_TYPES).map(([key, value]) => ({
      key,
      ...value,
    }));
  }),

  // Generate deviation report
  generateDeviationReport: protectedProcedure
    .input(z.object({ assessmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const assessment = await ctx.prisma.postureAssessment.findFirst({
        where: {
          id: input.assessmentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          deviations: {
            orderBy: { severity: 'desc' },
          },
          images: true,
          patient: {
            include: {
              demographics: true,
            },
          },
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      if (assessment.deviations.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No deviations found. Please run deviation analysis first.',
        });
      }

      // Convert database deviations to DeviationMeasurement format
      const deviations: DeviationMeasurement[] = assessment.deviations.map((d) => ({
        deviationType: d.deviationType,
        name: DEVIATION_TYPES[d.deviationType as keyof typeof DEVIATION_TYPES]?.name || d.deviationType,
        description: d.description || '',
        measurementValue: d.measurementValue || 0,
        measurementUnit: d.measurementUnit || '',
        normalRangeMin: d.normalRangeMin || 0,
        normalRangeMax: d.normalRangeMax || 0,
        deviationAmount: d.deviationAmount || 0,
        severity: d.severity as SeverityLevel,
        direction: d.direction || undefined,
        clinicalSignificance: '',
        landmarks: [],
        view: 'ANTERIOR' as const,
        notes: d.notes || undefined,
      }));

      // Calculate overall severity
      const severityOrder: SeverityLevel[] = ['MINIMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREME'];
      const overallSeverity = deviations.reduce<SeverityLevel>((highest, dev) => {
        const currentIndex = severityOrder.indexOf(dev.severity);
        const highestIndex = severityOrder.indexOf(highest);
        return currentIndex > highestIndex ? dev.severity : highest;
      }, 'MINIMAL');

      // Generate analysis result for report
      const analysisResult = {
        success: true,
        deviations,
        overallSeverity,
        summaryNotes: assessment.overallAssessment || '',
        warnings: [] as string[],
        analyzedViews: assessment.images
          .filter((i) => i.isAnalyzed)
          .map((i) => i.view as 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT'),
        analysisTimestamp: new Date(),
      };

      const patientName = assessment.patient.demographics
        ? `${assessment.patient.demographics.firstName} ${assessment.patient.demographics.lastName}`
        : `Patient ${assessment.patient.mrn}`;
      const practitionerName = `${ctx.user.firstName} ${ctx.user.lastName}`;
      const report = generateDeviationReport(
        analysisResult,
        patientName,
        practitionerName || 'Provider',
        assessment.assessmentDate
      );

      return {
        report,
        assessment: {
          id: assessment.id,
          date: assessment.assessmentDate,
          isComplete: assessment.isComplete,
        },
      };
    }),

  // Calculate severity for a specific measurement
  calculateDeviationSeverity: protectedProcedure
    .input(
      z.object({
        measurementValue: z.number(),
        normalRangeMin: z.number(),
        normalRangeMax: z.number(),
        unit: z.string(),
      })
    )
    .query(({ input }) => {
      const { measurementValue, normalRangeMin, normalRangeMax, unit } = input;
      return calculateSeverity(measurementValue, normalRangeMin, normalRangeMax, unit);
    }),

  // ============================================
  // POSTURE COMPARISON REPORTS (US-214)
  // ============================================

  // Generate comparison report between two assessments
  generateReport: protectedProcedure
    .input(
      z.object({
        previousAssessmentId: z.string(),
        currentAssessmentId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { previousAssessmentId, currentAssessmentId } = input;

      // Fetch both assessments with all related data
      const [previousAssessment, currentAssessment] = await Promise.all([
        ctx.prisma.postureAssessment.findFirst({
          where: {
            id: previousAssessmentId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            images: {
              include: {
                landmarks: true,
              },
            },
            deviations: true,
            patient: {
              include: {
                demographics: true,
              },
            },
          },
        }),
        ctx.prisma.postureAssessment.findFirst({
          where: {
            id: currentAssessmentId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            images: {
              include: {
                landmarks: true,
              },
            },
            deviations: true,
            patient: {
              include: {
                demographics: true,
              },
            },
          },
        }),
      ]);

      if (!previousAssessment || !currentAssessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'One or both assessments not found',
        });
      }

      if (previousAssessment.patientId !== currentAssessment.patientId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Assessments must belong to the same patient',
        });
      }

      // Ensure previous is actually earlier than current
      if (previousAssessment.assessmentDate > currentAssessment.assessmentDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Previous assessment must be earlier than current assessment',
        });
      }

      // Calculate days between assessments
      const daysBetween = Math.round(
        (currentAssessment.assessmentDate.getTime() - previousAssessment.assessmentDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      // Build view comparisons
      const allViews: Array<'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT'> = [
        'ANTERIOR',
        'POSTERIOR',
        'LATERAL_LEFT',
        'LATERAL_RIGHT',
      ];

      const viewComparisons: ViewComparison[] = allViews.map((view) => {
        const prevImage = previousAssessment.images.find((img) => img.view === view);
        const currImage = currentAssessment.images.find((img) => img.view === view);

        // Get deviations for this view (approximate by matching deviation types to view)
        const viewDeviationTypes: string[] = Object.entries(DEVIATION_TYPES)
          .filter(([, def]) => (def.views as readonly string[]).includes(view))
          .map(([, def]) => def.id);

        const prevDeviations = previousAssessment.deviations.filter((d) =>
          viewDeviationTypes.includes(d.deviationType)
        );
        const currDeviations = currentAssessment.deviations.filter((d) =>
          viewDeviationTypes.includes(d.deviationType)
        );

        // Convert to DeviationMeasurement format for comparison
        const prevDevMeasurements: DeviationMeasurement[] = prevDeviations.map((d) => ({
          deviationType: d.deviationType,
          name: d.description || d.deviationType,
          description: d.description || '',
          measurementValue: d.measurementValue || 0,
          measurementUnit: d.measurementUnit || '',
          normalRangeMin: d.normalRangeMin || 0,
          normalRangeMax: d.normalRangeMax || 0,
          deviationAmount: d.deviationAmount || 0,
          severity: d.severity as SeverityLevel,
          direction: d.direction || undefined,
          clinicalSignificance: '',
          landmarks: [],
          view,
          notes: d.notes || undefined,
        }));

        const currDevMeasurements: DeviationMeasurement[] = currDeviations.map((d) => ({
          deviationType: d.deviationType,
          name: d.description || d.deviationType,
          description: d.description || '',
          measurementValue: d.measurementValue || 0,
          measurementUnit: d.measurementUnit || '',
          normalRangeMin: d.normalRangeMin || 0,
          normalRangeMax: d.normalRangeMax || 0,
          deviationAmount: d.deviationAmount || 0,
          severity: d.severity as SeverityLevel,
          direction: d.direction || undefined,
          clinicalSignificance: '',
          landmarks: [],
          view,
          notes: d.notes || undefined,
        }));

        const deviationComparisons = compareDeviations(prevDevMeasurements, currDevMeasurements, view);

        return {
          view,
          previousImage: prevImage
            ? {
                id: prevImage.id,
                view: prevImage.view as 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT',
                imageUrl: prevImage.imageUrl,
                thumbnailUrl: prevImage.thumbnailUrl || undefined,
                landmarks: prevImage.landmarks.map((l) => ({
                  name: l.name,
                  x: l.x,
                  y: l.y,
                  confidence: l.confidence ?? 0,
                })),
              }
            : null,
          currentImage: currImage
            ? {
                id: currImage.id,
                view: currImage.view as 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT',
                imageUrl: currImage.imageUrl,
                thumbnailUrl: currImage.thumbnailUrl || undefined,
                landmarks: currImage.landmarks.map((l) => ({
                  name: l.name,
                  x: l.x,
                  y: l.y,
                  confidence: l.confidence ?? 0,
                })),
              }
            : null,
          deviations: deviationComparisons,
        };
      });

      // Calculate overall statistics
      const allComparisons = viewComparisons.flatMap((vc) => vc.deviations);
      const improvementScore = calculateImprovementScore(allComparisons);

      const severityOrder: SeverityLevel[] = ['MINIMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREME'];
      const prevOverallSeverity = previousAssessment.deviations.reduce<SeverityLevel>((highest, dev) => {
        const currentIndex = severityOrder.indexOf(dev.severity as SeverityLevel);
        const highestIndex = severityOrder.indexOf(highest);
        return currentIndex > highestIndex ? (dev.severity as SeverityLevel) : highest;
      }, 'MINIMAL');

      const currOverallSeverity = currentAssessment.deviations.reduce<SeverityLevel>((highest, dev) => {
        const currentIndex = severityOrder.indexOf(dev.severity as SeverityLevel);
        const highestIndex = severityOrder.indexOf(highest);
        return currentIndex > highestIndex ? (dev.severity as SeverityLevel) : highest;
      }, 'MINIMAL');

      const summary = generateProgressSummary(improvementScore, allComparisons, daysBetween);
      const recommendations = generateComparisonRecommendations(allComparisons, improvementScore);

      // Build assessment summaries
      const prevSummary: PostureAssessmentSummary = {
        id: previousAssessment.id,
        date: previousAssessment.assessmentDate,
        patientId: previousAssessment.patientId,
        views: previousAssessment.images.map((img) => img.view as 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT'),
        imageCount: previousAssessment.images.length,
        deviationCount: previousAssessment.deviations.length,
        overallSeverity: prevOverallSeverity,
        isComplete: previousAssessment.isComplete,
      };

      const currSummary: PostureAssessmentSummary = {
        id: currentAssessment.id,
        date: currentAssessment.assessmentDate,
        patientId: currentAssessment.patientId,
        views: currentAssessment.images.map((img) => img.view as 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT'),
        imageCount: currentAssessment.images.length,
        deviationCount: currentAssessment.deviations.length,
        overallSeverity: currOverallSeverity,
        isComplete: currentAssessment.isComplete,
      };

      const comparisonResult: ComparisonResult = {
        previousAssessment: prevSummary,
        currentAssessment: currSummary,
        daysBetween,
        viewComparisons,
        overallProgress: {
          totalDeviations: {
            previous: previousAssessment.deviations.length,
            current: currentAssessment.deviations.length,
          },
          significantDeviations: {
            previous: previousAssessment.deviations.filter((d) => d.severity !== 'MINIMAL').length,
            current: currentAssessment.deviations.filter((d) => d.severity !== 'MINIMAL').length,
          },
          overallSeverity: {
            previous: prevOverallSeverity,
            current: currOverallSeverity,
          },
          improvementScore,
          summary,
        },
        recommendations,
      };

      return comparisonResult;
    }),

  // Generate PDF-ready comparison report
  generateComparisonReportPDF: protectedProcedure
    .input(
      z.object({
        previousAssessmentId: z.string(),
        currentAssessmentId: z.string(),
        treatmentGoals: z
          .array(
            z.object({
              goal: z.string(),
              baseline: z.string(),
              target: z.string(),
              current: z.string(),
              progress: z.number(),
            })
          )
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { previousAssessmentId, currentAssessmentId, treatmentGoals } = input;

      // Fetch both assessments with all related data
      const [previousAssessment, currentAssessment, organization] = await Promise.all([
        ctx.prisma.postureAssessment.findFirst({
          where: {
            id: previousAssessmentId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            images: {
              include: {
                landmarks: true,
              },
            },
            deviations: true,
            patient: {
              include: {
                demographics: true,
              },
            },
          },
        }),
        ctx.prisma.postureAssessment.findFirst({
          where: {
            id: currentAssessmentId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            images: {
              include: {
                landmarks: true,
              },
            },
            deviations: true,
            patient: {
              include: {
                demographics: true,
              },
            },
          },
        }),
        ctx.prisma.organization.findUnique({
          where: { id: ctx.user.organizationId },
        }),
      ]);

      if (!previousAssessment || !currentAssessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'One or both assessments not found',
        });
      }

      // Generate the comparison result first
      const daysBetween = Math.round(
        (currentAssessment.assessmentDate.getTime() - previousAssessment.assessmentDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      const allViews: Array<'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT'> = [
        'ANTERIOR',
        'POSTERIOR',
        'LATERAL_LEFT',
        'LATERAL_RIGHT',
      ];

      const viewComparisons: ViewComparison[] = allViews.map((view) => {
        const prevImage = previousAssessment.images.find((img) => img.view === view);
        const currImage = currentAssessment.images.find((img) => img.view === view);

        const viewDeviationTypes: string[] = Object.entries(DEVIATION_TYPES)
          .filter(([, def]) => (def.views as readonly string[]).includes(view))
          .map(([, def]) => def.id);

        const prevDeviations = previousAssessment.deviations.filter((d) =>
          viewDeviationTypes.includes(d.deviationType)
        );
        const currDeviations = currentAssessment.deviations.filter((d) =>
          viewDeviationTypes.includes(d.deviationType)
        );

        const prevDevMeasurements: DeviationMeasurement[] = prevDeviations.map((d) => ({
          deviationType: d.deviationType,
          name: d.description || d.deviationType,
          description: d.description || '',
          measurementValue: d.measurementValue || 0,
          measurementUnit: d.measurementUnit || '',
          normalRangeMin: d.normalRangeMin || 0,
          normalRangeMax: d.normalRangeMax || 0,
          deviationAmount: d.deviationAmount || 0,
          severity: d.severity as SeverityLevel,
          direction: d.direction || undefined,
          clinicalSignificance: '',
          landmarks: [],
          view,
          notes: d.notes || undefined,
        }));

        const currDevMeasurements: DeviationMeasurement[] = currDeviations.map((d) => ({
          deviationType: d.deviationType,
          name: d.description || d.deviationType,
          description: d.description || '',
          measurementValue: d.measurementValue || 0,
          measurementUnit: d.measurementUnit || '',
          normalRangeMin: d.normalRangeMin || 0,
          normalRangeMax: d.normalRangeMax || 0,
          deviationAmount: d.deviationAmount || 0,
          severity: d.severity as SeverityLevel,
          direction: d.direction || undefined,
          clinicalSignificance: '',
          landmarks: [],
          view,
          notes: d.notes || undefined,
        }));

        const deviationComparisons = compareDeviations(prevDevMeasurements, currDevMeasurements, view);

        return {
          view,
          previousImage: prevImage
            ? {
                id: prevImage.id,
                view: prevImage.view as 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT',
                imageUrl: prevImage.imageUrl,
                thumbnailUrl: prevImage.thumbnailUrl || undefined,
                landmarks: prevImage.landmarks.map((l) => ({
                  name: l.name,
                  x: l.x,
                  y: l.y,
                  confidence: l.confidence ?? 0,
                })),
              }
            : null,
          currentImage: currImage
            ? {
                id: currImage.id,
                view: currImage.view as 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT',
                imageUrl: currImage.imageUrl,
                thumbnailUrl: currImage.thumbnailUrl || undefined,
                landmarks: currImage.landmarks.map((l) => ({
                  name: l.name,
                  x: l.x,
                  y: l.y,
                  confidence: l.confidence ?? 0,
                })),
              }
            : null,
          deviations: deviationComparisons,
        };
      });

      const allComparisons = viewComparisons.flatMap((vc) => vc.deviations);
      const improvementScore = calculateImprovementScore(allComparisons);

      const severityOrder: SeverityLevel[] = ['MINIMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREME'];
      const prevOverallSeverity = previousAssessment.deviations.reduce<SeverityLevel>((highest, dev) => {
        const currentIndex = severityOrder.indexOf(dev.severity as SeverityLevel);
        const highestIndex = severityOrder.indexOf(highest);
        return currentIndex > highestIndex ? (dev.severity as SeverityLevel) : highest;
      }, 'MINIMAL');

      const currOverallSeverity = currentAssessment.deviations.reduce<SeverityLevel>((highest, dev) => {
        const currentIndex = severityOrder.indexOf(dev.severity as SeverityLevel);
        const highestIndex = severityOrder.indexOf(highest);
        return currentIndex > highestIndex ? (dev.severity as SeverityLevel) : highest;
      }, 'MINIMAL');

      const summary = generateProgressSummary(improvementScore, allComparisons, daysBetween);
      const recommendations = generateComparisonRecommendations(allComparisons, improvementScore);

      const prevSummary: PostureAssessmentSummary = {
        id: previousAssessment.id,
        date: previousAssessment.assessmentDate,
        patientId: previousAssessment.patientId,
        views: previousAssessment.images.map((img) => img.view as 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT'),
        imageCount: previousAssessment.images.length,
        deviationCount: previousAssessment.deviations.length,
        overallSeverity: prevOverallSeverity,
        isComplete: previousAssessment.isComplete,
      };

      const currSummary: PostureAssessmentSummary = {
        id: currentAssessment.id,
        date: currentAssessment.assessmentDate,
        patientId: currentAssessment.patientId,
        views: currentAssessment.images.map((img) => img.view as 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT'),
        imageCount: currentAssessment.images.length,
        deviationCount: currentAssessment.deviations.length,
        overallSeverity: currOverallSeverity,
        isComplete: currentAssessment.isComplete,
      };

      const comparisonResult: ComparisonResult = {
        previousAssessment: prevSummary,
        currentAssessment: currSummary,
        daysBetween,
        viewComparisons,
        overallProgress: {
          totalDeviations: {
            previous: previousAssessment.deviations.length,
            current: currentAssessment.deviations.length,
          },
          significantDeviations: {
            previous: previousAssessment.deviations.filter((d) => d.severity !== 'MINIMAL').length,
            current: currentAssessment.deviations.filter((d) => d.severity !== 'MINIMAL').length,
          },
          overallSeverity: {
            previous: prevOverallSeverity,
            current: currOverallSeverity,
          },
          improvementScore,
          summary,
        },
        recommendations,
      };

      // Build patient info
      const patient = currentAssessment.patient;
      const patientName = patient.demographics
        ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
        : `Patient ${patient.mrn}`;

      const patientInfo = {
        name: patientName,
        mrn: patient.mrn,
        dateOfBirth: patient.demographics?.dateOfBirth
          ? new Date(patient.demographics.dateOfBirth).toLocaleDateString()
          : undefined,
      };

      const practitionerInfo = {
        name: `${ctx.user.firstName} ${ctx.user.lastName}`,
        title: (ctx.user as { title?: string }).title,
      };

      const organizationInfo = {
        name: organization?.name || 'ChiroFlow Practice',
        address: undefined,
        phone: undefined,
      };

      // Generate the formatted report
      const report = generateComparisonReport(
        comparisonResult,
        patientInfo,
        practitionerInfo,
        organizationInfo,
        treatmentGoals
      );

      // Generate HTML for PDF
      const html = generateReportHTML(report);

      return {
        report,
        html,
      };
    }),

  // Compare assessments across time (trend analysis)
  compareAssessmentHistory: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        deviationType: z.string().optional(),
        limit: z.number().min(2).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, deviationType, limit } = input;

      // Verify patient access
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

      // Fetch assessments with deviations
      const assessments = await ctx.prisma.postureAssessment.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          isComplete: true,
        },
        orderBy: { assessmentDate: 'asc' },
        take: limit,
        include: {
          deviations: deviationType
            ? {
                where: { deviationType },
              }
            : true,
          images: {
            select: {
              id: true,
              view: true,
              thumbnailUrl: true,
            },
          },
        },
      });

      if (assessments.length < 2) {
        return {
          success: false,
          message: 'Need at least 2 completed assessments for comparison',
          trends: [],
          assessments: assessments.map((a) => ({
            id: a.id,
            date: a.assessmentDate,
            deviationCount: a.deviations.length,
          })),
        };
      }

      // Build trend data for each deviation type
      const deviationTypes = new Set<string>();
      assessments.forEach((a) => {
        a.deviations.forEach((d) => deviationTypes.add(d.deviationType));
      });

      const trends = Array.from(deviationTypes).map((dt) => {
        const dataPoints = assessments
          .map((a) => {
            const deviation = a.deviations.find((d) => d.deviationType === dt);
            if (!deviation) return null;
            return {
              date: a.assessmentDate,
              value: deviation.measurementValue || 0,
              severity: deviation.severity as SeverityLevel,
            };
          })
          .filter((dp): dp is NonNullable<typeof dp> => dp !== null);

        if (dataPoints.length < 2) {
          return {
            deviationType: dt,
            name: DEVIATION_TYPES[dt.toUpperCase() as keyof typeof DEVIATION_TYPES]?.name || dt,
            unit: DEVIATION_TYPES[dt.toUpperCase() as keyof typeof DEVIATION_TYPES]?.unit || '',
            dataPoints,
            trend: 'stable' as const,
            changeFromFirst: 0,
            changeFromPrevious: 0,
          };
        }

        const first = dataPoints[0];
        const last = dataPoints[dataPoints.length - 1];
        const previous = dataPoints[dataPoints.length - 2];

        const changeFromFirst = last.value - first.value;
        const changeFromPrevious = last.value - previous.value;

        // Determine trend
        let trend: 'improving' | 'worsening' | 'stable';
        if (Math.abs(changeFromFirst) < 1) {
          trend = 'stable';
        } else if (changeFromFirst < 0) {
          trend = 'improving';
        } else {
          trend = 'worsening';
        }

        return {
          deviationType: dt,
          name: DEVIATION_TYPES[dt.toUpperCase() as keyof typeof DEVIATION_TYPES]?.name || dt,
          unit: DEVIATION_TYPES[dt.toUpperCase() as keyof typeof DEVIATION_TYPES]?.unit || '',
          dataPoints,
          trend,
          changeFromFirst: Math.round(changeFromFirst * 10) / 10,
          changeFromPrevious: Math.round(changeFromPrevious * 10) / 10,
        };
      });

      return {
        success: true,
        message: `Found ${trends.length} deviation trends across ${assessments.length} assessments`,
        trends,
        assessments: assessments.map((a) => ({
          id: a.id,
          date: a.assessmentDate,
          deviationCount: a.deviations.length,
          views: a.images.map((img) => img.view),
        })),
      };
    }),

  // Get overlay alignment data for side-by-side comparison
  getOverlayAlignment: protectedProcedure
    .input(
      z.object({
        previousImageId: z.string(),
        currentImageId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { previousImageId, currentImageId } = input;

      const [previousImage, currentImage] = await Promise.all([
        ctx.prisma.postureImage.findFirst({
          where: {
            id: previousImageId,
            assessment: {
              organizationId: ctx.user.organizationId,
            },
          },
          include: {
            landmarks: true,
          },
        }),
        ctx.prisma.postureImage.findFirst({
          where: {
            id: currentImageId,
            assessment: {
              organizationId: ctx.user.organizationId,
            },
          },
          include: {
            landmarks: true,
          },
        }),
      ]);

      if (!previousImage || !currentImage) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'One or both images not found',
        });
      }

      if (previousImage.view !== currentImage.view) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Images must be of the same view type for overlay comparison',
        });
      }

      const previousLandmarks = previousImage.landmarks.map((l) => ({
        name: l.name,
        x: l.x,
        y: l.y,
      }));

      const currentLandmarks = currentImage.landmarks.map((l) => ({
        name: l.name,
        x: l.x,
        y: l.y,
      }));

      const alignment = calculateOverlayAlignment(previousLandmarks, currentLandmarks);

      return {
        previousImage: {
          id: previousImage.id,
          url: previousImage.imageUrl,
          view: previousImage.view,
        },
        currentImage: {
          id: currentImage.id,
          url: currentImage.imageUrl,
          view: currentImage.view,
        },
        alignment,
        commonLandmarks: previousLandmarks.filter((pl) =>
          currentLandmarks.some((cl) => cl.name === pl.name)
        ).length,
      };
    }),

  // List assessments available for comparison
  listForComparison: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        excludeAssessmentId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, excludeAssessmentId } = input;

      const assessments = await ctx.prisma.postureAssessment.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          isComplete: true,
          ...(excludeAssessmentId ? { id: { not: excludeAssessmentId } } : {}),
        },
        orderBy: { assessmentDate: 'desc' },
        select: {
          id: true,
          assessmentDate: true,
          notes: true,
          _count: {
            select: {
              images: true,
              deviations: true,
            },
          },
          images: {
            select: {
              view: true,
              thumbnailUrl: true,
            },
            take: 4,
          },
        },
      });

      return assessments.map((a) => ({
        id: a.id,
        date: a.assessmentDate,
        notes: a.notes,
        imageCount: a._count.images,
        deviationCount: a._count.deviations,
        views: a.images.map((img) => img.view),
        thumbnails: a.images.map((img) => img.thumbnailUrl).filter(Boolean),
      }));
    }),
});
