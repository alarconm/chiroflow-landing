/**
 * Imaging Router
 * Epic 22: Imaging & X-Ray Integration
 *
 * API routes for imaging upload, storage, and annotation:
 * - Study creation and management
 * - Image upload (single and bulk)
 * - DICOM and standard image format support
 * - HIPAA-compliant storage
 * - Annotation tools (arrows, lines, text, circles, measurements)
 * - George's line assessment for cervical spine
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { createAuditLog } from '@/lib/audit';
import {
  ImagingModality,
  ImagingStudyStatus,
  ImagingAnnotationType,
  ImagingMeasurementType,
  Prisma,
} from '@prisma/client';
import {
  validateImageFile,
  storeImage,
  storeImages,
  deleteStoredImage,
  isDicomFile,
  parseDicomMetadata,
  SUPPORTED_MIME_TYPES,
  BODY_PARTS,
  VIEW_POSITIONS,
  parseModality,
  type ImageUploadInput,
} from '@/lib/imaging';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const imageUploadSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string(),
  base64Data: z.string().min(1),
  // Optional DICOM metadata
  seriesNumber: z.number().optional(),
  instanceNumber: z.number().optional(),
  seriesInstanceUid: z.string().optional(),
  sopInstanceUid: z.string().optional(),
  // View information
  viewPosition: z.string().optional(),
  bodyPartExamined: z.string().optional(),
  laterality: z.enum(['L', 'R', 'B']).optional(),
  // DICOM window/level
  windowCenter: z.number().optional(),
  windowWidth: z.number().optional(),
});

const createStudySchema = z.object({
  patientId: z.string(),
  studyDate: z.string().datetime().optional(), // Defaults to now
  modality: z.enum(['XRAY', 'MRI', 'CT', 'ULTRASOUND']),
  bodyPart: z.string().min(1),
  description: z.string().optional(),
  indication: z.string().optional(),
  clinicalHistory: z.string().optional(),
  equipment: z.string().optional(),
  technician: z.string().optional(),
  encounterId: z.string().optional(),
});

const uploadStudySchema = z.object({
  // Study info (either existing studyId or create new study)
  studyId: z.string().optional(),
  // If no studyId, these fields are used to create a new study
  patientId: z.string().optional(),
  modality: z.enum(['XRAY', 'MRI', 'CT', 'ULTRASOUND']).optional(),
  bodyPart: z.string().optional(),
  description: z.string().optional(),
  indication: z.string().optional(),
  clinicalHistory: z.string().optional(),
  encounterId: z.string().optional(),
  // Image data
  images: z.array(imageUploadSchema).min(1).max(100),
});

const bulkUploadSchema = z.object({
  studyId: z.string(),
  images: z.array(imageUploadSchema).min(1).max(100),
});

// ============================================
// ROUTER
// ============================================

export const imagingRouter = router({
  // ============================================
  // STUDY MANAGEMENT
  // ============================================

  /**
   * Create a new imaging study
   */
  createStudy: providerProcedure
    .input(createStudySchema)
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        studyDate,
        modality,
        bodyPart,
        description,
        indication,
        clinicalHistory,
        equipment,
        technician,
        encounterId,
      } = input;

      // Verify patient belongs to organization
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

      // Verify encounter if provided
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

      // Get provider ID if user is a provider
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      // Generate unique accession number
      const accessionNumber = `ACC-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      // Create the study
      const study = await ctx.prisma.imagingStudy.create({
        data: {
          patientId,
          organizationId: ctx.user.organizationId,
          studyDate: studyDate ? new Date(studyDate) : new Date(),
          modality,
          bodyPart,
          description,
          indication,
          clinicalHistory,
          equipment,
          technician,
          accessionNumber,
          status: 'SCHEDULED',
          orderingProviderId: provider?.id,
          encounterId,
        },
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          images: true,
        },
      });

      // Audit log
      await createAuditLog({
        action: 'CREATE',
        entityType: 'ImagingStudy',
        entityId: study.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          patientId,
          modality,
          bodyPart,
        },
      });

      return study;
    }),

  /**
   * Get a study by ID
   */
  getStudy: protectedProcedure
    .input(z.object({ studyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const study = await ctx.prisma.imagingStudy.findFirst({
        where: {
          id: input.studyId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  dateOfBirth: true,
                },
              },
            },
          },
          images: {
            include: {
              annotations: true,
              measurements: true,
            },
            orderBy: [
              { seriesNumber: 'asc' },
              { instanceNumber: 'asc' },
            ],
          },
          reports: {
            include: {
              reportedBy: {
                include: {
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          orderingProvider: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          encounter: {
            select: {
              id: true,
              encounterDate: true,
            },
          },
        },
      });

      if (!study) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Study not found',
        });
      }

      return study;
    }),

  /**
   * List studies for a patient
   */
  listByPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        modality: z.enum(['XRAY', 'MRI', 'CT', 'ULTRASOUND']).optional(),
        status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'REPORTED', 'CANCELLED']).optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, modality, status, limit, cursor } = input;

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

      const where: Prisma.ImagingStudyWhereInput = {
        patientId,
        organizationId: ctx.user.organizationId,
        ...(modality && { modality }),
        ...(status && { status }),
      };

      const studies = await ctx.prisma.imagingStudy.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { studyDate: 'desc' },
        include: {
          images: {
            select: {
              id: true,
              thumbnailUrl: true,
              viewPosition: true,
            },
            take: 4, // First 4 thumbnails for preview
          },
          _count: {
            select: {
              images: true,
              reports: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (studies.length > limit) {
        const nextItem = studies.pop();
        nextCursor = nextItem?.id;
      }

      return {
        studies,
        nextCursor,
      };
    }),

  /**
   * Update study status
   */
  updateStudyStatus: providerProcedure
    .input(
      z.object({
        studyId: z.string(),
        status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'REPORTED', 'CANCELLED']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { studyId, status } = input;

      const study = await ctx.prisma.imagingStudy.findFirst({
        where: {
          id: studyId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!study) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Study not found',
        });
      }

      const updatedStudy = await ctx.prisma.imagingStudy.update({
        where: { id: studyId },
        data: { status },
      });

      await createAuditLog({
        action: 'UPDATE',
        entityType: 'ImagingStudy',
        entityId: studyId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          previousStatus: study.status,
          newStatus: status,
        },
      });

      return updatedStudy;
    }),

  // ============================================
  // IMAGE UPLOAD
  // ============================================

  /**
   * Upload images to a study (main upload procedure)
   * Supports both DICOM and standard image formats
   * Handles single and bulk uploads
   */
  uploadStudy: providerProcedure
    .input(uploadStudySchema)
    .mutation(async ({ ctx, input }) => {
      const { studyId, patientId, modality, bodyPart, description, indication, clinicalHistory, encounterId, images } =
        input;

      let targetStudyId = studyId;
      let targetPatientId = patientId;

      // If no studyId provided, create a new study
      if (!targetStudyId) {
        if (!targetPatientId || !modality || !bodyPart) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Either studyId or patientId/modality/bodyPart must be provided',
          });
        }

        // Verify patient
        const patient = await ctx.prisma.patient.findFirst({
          where: {
            id: targetPatientId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!patient) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Patient not found',
          });
        }

        // Get provider
        const provider = await ctx.prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });

        // Create new study
        const accessionNumber = `ACC-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        const newStudy = await ctx.prisma.imagingStudy.create({
          data: {
            patientId: targetPatientId,
            organizationId: ctx.user.organizationId,
            studyDate: new Date(),
            modality,
            bodyPart,
            description,
            indication,
            clinicalHistory,
            accessionNumber,
            status: 'IN_PROGRESS',
            orderingProviderId: provider?.id,
            encounterId,
          },
        });

        targetStudyId = newStudy.id;
      } else {
        // Verify existing study
        const existingStudy = await ctx.prisma.imagingStudy.findFirst({
          where: {
            id: targetStudyId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!existingStudy) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Study not found',
          });
        }

        targetPatientId = existingStudy.patientId;

        // Update study status to in progress if scheduled
        if (existingStudy.status === 'SCHEDULED') {
          await ctx.prisma.imagingStudy.update({
            where: { id: targetStudyId },
            data: { status: 'IN_PROGRESS' },
          });
        }
      }

      // Validate and store images
      const uploadResults: {
        success: boolean;
        imageId?: string;
        fileName: string;
        error?: string;
      }[] = [];

      for (const imageInput of images) {
        // Validate image
        const validation = validateImageFile(imageInput);
        if (!validation.valid) {
          uploadResults.push({
            success: false,
            fileName: imageInput.fileName,
            error: validation.error,
          });
          continue;
        }

        try {
          // Store image
          const storageResult = await storeImage(imageInput, {
            organizationId: ctx.user.organizationId,
            patientId: targetPatientId,
            studyId: targetStudyId,
          });

          // Parse DICOM metadata if applicable
          let dicomMetadata = {};
          if (isDicomFile(imageInput.mimeType)) {
            dicomMetadata = parseDicomMetadata(imageInput.base64Data);
          }

          // Create image record
          const image = await ctx.prisma.imagingImage.create({
            data: {
              studyId: targetStudyId,
              imageUrl: storageResult.imageUrl,
              thumbnailUrl: storageResult.thumbnailUrl,
              originalUrl: storageResult.originalUrl,
              fileName: imageInput.fileName,
              fileSize: imageInput.fileSize,
              mimeType: imageInput.mimeType,
              width: storageResult.width,
              height: storageResult.height,
              // DICOM fields
              seriesNumber: imageInput.seriesNumber,
              instanceNumber: imageInput.instanceNumber,
              seriesInstanceUid: imageInput.seriesInstanceUid,
              sopInstanceUid: imageInput.sopInstanceUid,
              windowCenter: imageInput.windowCenter,
              windowWidth: imageInput.windowWidth,
              // View info
              viewPosition: imageInput.viewPosition,
              bodyPartExamined: imageInput.bodyPartExamined,
              laterality: imageInput.laterality,
            },
          });

          uploadResults.push({
            success: true,
            imageId: image.id,
            fileName: imageInput.fileName,
          });
        } catch (error) {
          uploadResults.push({
            success: false,
            fileName: imageInput.fileName,
            error: error instanceof Error ? error.message : 'Upload failed',
          });
        }
      }

      // Update study image count
      const imageCount = await ctx.prisma.imagingImage.count({
        where: { studyId: targetStudyId },
      });

      await ctx.prisma.imagingStudy.update({
        where: { id: targetStudyId },
        data: { numberOfImages: imageCount },
      });

      // Audit log
      await createAuditLog({
        action: 'DOCUMENT_CREATE',
        entityType: 'ImagingImage',
        entityId: targetStudyId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          studyId: targetStudyId,
          imagesUploaded: uploadResults.filter((r) => r.success).length,
          imagesFailed: uploadResults.filter((r) => !r.success).length,
        },
      });

      // Get updated study
      const study = await ctx.prisma.imagingStudy.findUnique({
        where: { id: targetStudyId },
        include: {
          images: {
            orderBy: [
              { seriesNumber: 'asc' },
              { instanceNumber: 'asc' },
            ],
          },
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      return {
        study,
        uploadResults,
        successCount: uploadResults.filter((r) => r.success).length,
        failureCount: uploadResults.filter((r) => !r.success).length,
      };
    }),

  /**
   * Bulk upload images to an existing study
   */
  bulkUpload: providerProcedure
    .input(bulkUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const { studyId, images } = input;

      // Verify study exists
      const study = await ctx.prisma.imagingStudy.findFirst({
        where: {
          id: studyId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!study) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Study not found',
        });
      }

      // Use the main uploadStudy with the existing study
      const result = await storeImages(
        images.map((img) => ({
          ...img,
        })),
        {
          organizationId: ctx.user.organizationId,
          patientId: study.patientId,
          studyId,
        }
      );

      // Create image records for successful uploads
      const createdImages = [];
      for (let i = 0; i < result.results.length; i++) {
        const storageResult = result.results[i];
        const imageInput = images[i];

        const image = await ctx.prisma.imagingImage.create({
          data: {
            studyId,
            imageUrl: storageResult.imageUrl,
            thumbnailUrl: storageResult.thumbnailUrl,
            originalUrl: storageResult.originalUrl,
            fileName: imageInput.fileName,
            fileSize: imageInput.fileSize,
            mimeType: imageInput.mimeType,
            width: storageResult.width,
            height: storageResult.height,
            seriesNumber: imageInput.seriesNumber,
            instanceNumber: imageInput.instanceNumber,
            seriesInstanceUid: imageInput.seriesInstanceUid,
            sopInstanceUid: imageInput.sopInstanceUid,
            windowCenter: imageInput.windowCenter,
            windowWidth: imageInput.windowWidth,
            viewPosition: imageInput.viewPosition,
            bodyPartExamined: imageInput.bodyPartExamined,
            laterality: imageInput.laterality,
          },
        });

        createdImages.push(image);
      }

      // Update image count
      const imageCount = await ctx.prisma.imagingImage.count({
        where: { studyId },
      });

      await ctx.prisma.imagingStudy.update({
        where: { id: studyId },
        data: {
          numberOfImages: imageCount,
          status: study.status === 'SCHEDULED' ? 'IN_PROGRESS' : study.status,
        },
      });

      // Audit log
      await createAuditLog({
        action: 'DOCUMENT_CREATE',
        entityType: 'ImagingImage',
        entityId: studyId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          studyId,
          bulkUpload: true,
          imagesUploaded: createdImages.length,
          imagesFailed: result.errors.length,
        },
      });

      return {
        images: createdImages,
        errors: result.errors,
        successCount: createdImages.length,
        failureCount: result.errors.length,
      };
    }),

  /**
   * Delete an image from a study
   */
  deleteImage: providerProcedure
    .input(z.object({ imageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const image = await ctx.prisma.imagingImage.findFirst({
        where: {
          id: input.imageId,
        },
        include: {
          study: {
            select: {
              organizationId: true,
              id: true,
            },
          },
        },
      });

      if (!image || image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      // Delete from storage
      await deleteStoredImage(image.imageUrl);
      if (image.originalUrl) {
        await deleteStoredImage(image.originalUrl);
      }
      if (image.thumbnailUrl) {
        await deleteStoredImage(image.thumbnailUrl);
      }

      // Delete from database
      await ctx.prisma.imagingImage.delete({
        where: { id: input.imageId },
      });

      // Update image count
      const imageCount = await ctx.prisma.imagingImage.count({
        where: { studyId: image.study.id },
      });

      await ctx.prisma.imagingStudy.update({
        where: { id: image.study.id },
        data: { numberOfImages: imageCount },
      });

      // Audit log
      await createAuditLog({
        action: 'DOCUMENT_DELETE',
        entityType: 'ImagingImage',
        entityId: input.imageId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          studyId: image.study.id,
          fileName: image.fileName,
        },
      });

      return { success: true };
    }),

  // ============================================
  // UTILITY ENDPOINTS
  // ============================================

  /**
   * Get supported file types
   */
  getSupportedFileTypes: protectedProcedure.query(() => {
    return {
      mimeTypes: Object.keys(SUPPORTED_MIME_TYPES),
      bodyParts: BODY_PARTS,
      viewPositions: VIEW_POSITIONS,
      modalities: ['XRAY', 'MRI', 'CT', 'ULTRASOUND'],
    };
  }),

  /**
   * Get recent studies for the organization
   */
  getRecentStudies: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const studies = await ctx.prisma.imagingStudy.findMany({
        where: {
          organizationId: ctx.user.organizationId,
        },
        take: input.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          images: {
            select: {
              id: true,
              thumbnailUrl: true,
            },
            take: 1,
          },
          _count: {
            select: {
              images: true,
              reports: true,
            },
          },
        },
      });

      return studies;
    }),

  // ============================================
  // ANNOTATION TOOLS (US-227)
  // ============================================

  /**
   * Add annotation to an image
   * Supports: arrows, lines, text, circles, rectangles, angles, Cobb angles, freehand
   */
  addAnnotation: providerProcedure
    .input(
      z.object({
        imageId: z.string(),
        type: z.enum(['ARROW', 'LINE', 'TEXT', 'CIRCLE', 'RECTANGLE', 'ANGLE', 'COBB_ANGLE', 'FREEHAND']),
        coordinates: z.record(z.string(), z.unknown()), // JSON object for flexible coordinate storage
        text: z.string().optional(),
        color: z.string().optional().default('#FF0000'),
        lineWidth: z.number().optional().default(2),
        fontSize: z.number().optional().default(14),
        layer: z.number().optional().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { imageId, type, coordinates, text, color, lineWidth, fontSize, layer } = input;

      // Verify image exists and belongs to organization
      const image = await ctx.prisma.imagingImage.findFirst({
        where: {
          id: imageId,
        },
        include: {
          study: {
            select: {
              organizationId: true,
              id: true,
            },
          },
        },
      });

      if (!image || image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      // Create annotation
      const annotation = await ctx.prisma.imagingAnnotation.create({
        data: {
          imageId,
          type,
          coordinates: coordinates as Prisma.InputJsonValue,
          text,
          color,
          lineWidth,
          fontSize,
          layer,
          createdById: ctx.user.id,
        },
      });

      // Audit log
      await createAuditLog({
        action: 'CREATE',
        entityType: 'ImagingAnnotation',
        entityId: annotation.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          imageId,
          type,
          text: text || null,
        },
      });

      return annotation;
    }),

  /**
   * Bulk add annotations to an image
   * For saving entire annotation layer at once
   */
  addAnnotations: providerProcedure
    .input(
      z.object({
        imageId: z.string(),
        annotations: z.array(
          z.object({
            type: z.enum(['ARROW', 'LINE', 'TEXT', 'CIRCLE', 'RECTANGLE', 'ANGLE', 'COBB_ANGLE', 'FREEHAND']),
            coordinates: z.record(z.string(), z.unknown()),
            text: z.string().optional(),
            color: z.string().optional().default('#FF0000'),
            lineWidth: z.number().optional().default(2),
            fontSize: z.number().optional().default(14),
            layer: z.number().optional().default(0),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { imageId, annotations } = input;

      // Verify image exists and belongs to organization
      const image = await ctx.prisma.imagingImage.findFirst({
        where: {
          id: imageId,
        },
        include: {
          study: {
            select: {
              organizationId: true,
              id: true,
            },
          },
        },
      });

      if (!image || image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      // Create all annotations
      const createdAnnotations = await ctx.prisma.imagingAnnotation.createMany({
        data: annotations.map((ann, index) => ({
          imageId,
          type: ann.type,
          coordinates: ann.coordinates as Prisma.InputJsonValue,
          text: ann.text,
          color: ann.color,
          lineWidth: ann.lineWidth,
          fontSize: ann.fontSize,
          layer: ann.layer ?? index,
          createdById: ctx.user.id,
        })),
      });

      // Audit log
      await createAuditLog({
        action: 'CREATE',
        entityType: 'ImagingAnnotation',
        entityId: imageId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          imageId,
          annotationCount: createdAnnotations.count,
          types: [...new Set(annotations.map((a) => a.type))],
        },
      });

      // Return all annotations for the image
      return ctx.prisma.imagingAnnotation.findMany({
        where: { imageId },
        orderBy: { layer: 'asc' },
      });
    }),

  /**
   * Get annotations for an image
   */
  getAnnotations: protectedProcedure
    .input(z.object({ imageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const image = await ctx.prisma.imagingImage.findFirst({
        where: {
          id: input.imageId,
        },
        include: {
          study: {
            select: {
              organizationId: true,
            },
          },
        },
      });

      if (!image || image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      return ctx.prisma.imagingAnnotation.findMany({
        where: { imageId: input.imageId },
        orderBy: { layer: 'asc' },
      });
    }),

  /**
   * Update an annotation
   */
  updateAnnotation: providerProcedure
    .input(
      z.object({
        annotationId: z.string(),
        coordinates: z.record(z.string(), z.unknown()).optional(),
        text: z.string().optional(),
        color: z.string().optional(),
        lineWidth: z.number().optional(),
        fontSize: z.number().optional(),
        isVisible: z.boolean().optional(),
        layer: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { annotationId, ...updateData } = input;

      // Verify annotation exists and user has access
      const annotation = await ctx.prisma.imagingAnnotation.findFirst({
        where: { id: annotationId },
        include: {
          image: {
            include: {
              study: {
                select: { organizationId: true },
              },
            },
          },
        },
      });

      if (!annotation || annotation.image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Annotation not found',
        });
      }

      const { coordinates, ...restUpdateData } = updateData;

      const updated = await ctx.prisma.imagingAnnotation.update({
        where: { id: annotationId },
        data: {
          ...restUpdateData,
          ...(coordinates !== undefined && { coordinates: coordinates as Prisma.InputJsonValue }),
        },
      });

      await createAuditLog({
        action: 'UPDATE',
        entityType: 'ImagingAnnotation',
        entityId: annotationId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: updateData,
      });

      return updated;
    }),

  /**
   * Delete an annotation
   */
  deleteAnnotation: providerProcedure
    .input(z.object({ annotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const annotation = await ctx.prisma.imagingAnnotation.findFirst({
        where: { id: input.annotationId },
        include: {
          image: {
            include: {
              study: {
                select: { organizationId: true },
              },
            },
          },
        },
      });

      if (!annotation || annotation.image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Annotation not found',
        });
      }

      await ctx.prisma.imagingAnnotation.delete({
        where: { id: input.annotationId },
      });

      await createAuditLog({
        action: 'DELETE',
        entityType: 'ImagingAnnotation',
        entityId: input.annotationId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          type: annotation.type,
          imageId: annotation.imageId,
        },
      });

      return { success: true };
    }),

  /**
   * Clear all annotations for an image
   */
  clearAnnotations: providerProcedure
    .input(z.object({ imageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const image = await ctx.prisma.imagingImage.findFirst({
        where: { id: input.imageId },
        include: {
          study: {
            select: { organizationId: true },
          },
        },
      });

      if (!image || image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      const result = await ctx.prisma.imagingAnnotation.deleteMany({
        where: { imageId: input.imageId },
      });

      await createAuditLog({
        action: 'DELETE',
        entityType: 'ImagingAnnotation',
        entityId: input.imageId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          deletedCount: result.count,
          operation: 'clearAll',
        },
      });

      return { deletedCount: result.count };
    }),

  /**
   * Save annotation layer as a snapshot
   * Creates a JSON export of all annotations for an image
   */
  saveAnnotationLayer: providerProcedure
    .input(
      z.object({
        imageId: z.string(),
        layerName: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const image = await ctx.prisma.imagingImage.findFirst({
        where: { id: input.imageId },
        include: {
          study: {
            select: { organizationId: true, id: true },
          },
          annotations: {
            orderBy: { layer: 'asc' },
          },
          measurements: true,
        },
      });

      if (!image || image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      // Create a snapshot of the annotation layer
      const snapshot = {
        imageId: input.imageId,
        studyId: image.study.id,
        layerName: input.layerName || `Annotations-${new Date().toISOString()}`,
        savedAt: new Date().toISOString(),
        savedBy: ctx.user.id,
        annotations: image.annotations.map((ann) => ({
          type: ann.type,
          coordinates: ann.coordinates,
          text: ann.text,
          color: ann.color,
          lineWidth: ann.lineWidth,
          fontSize: ann.fontSize,
          layer: ann.layer,
        })),
        measurements: image.measurements.map((meas) => ({
          type: meas.type,
          value: meas.value,
          unit: meas.unit,
          coordinates: meas.coordinates,
          label: meas.label,
          description: meas.description,
          normalMin: meas.normalMin,
          normalMax: meas.normalMax,
          deviation: meas.deviation,
        })),
      };

      return snapshot;
    }),

  /**
   * Load annotation layer from a snapshot
   */
  loadAnnotationLayer: providerProcedure
    .input(
      z.object({
        imageId: z.string(),
        snapshot: z.object({
          annotations: z.array(
            z.object({
              type: z.enum(['ARROW', 'LINE', 'TEXT', 'CIRCLE', 'RECTANGLE', 'ANGLE', 'COBB_ANGLE', 'FREEHAND']),
              coordinates: z.record(z.string(), z.unknown()),
              text: z.string().nullable().optional(),
              color: z.string().nullable().optional(),
              lineWidth: z.number().nullable().optional(),
              fontSize: z.number().nullable().optional(),
              layer: z.number().optional(),
            })
          ),
        }),
        clearExisting: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { imageId, snapshot, clearExisting } = input;

      const image = await ctx.prisma.imagingImage.findFirst({
        where: { id: imageId },
        include: {
          study: {
            select: { organizationId: true },
          },
        },
      });

      if (!image || image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      // Clear existing annotations if requested
      if (clearExisting) {
        await ctx.prisma.imagingAnnotation.deleteMany({
          where: { imageId },
        });
      }

      // Create annotations from snapshot
      await ctx.prisma.imagingAnnotation.createMany({
        data: snapshot.annotations.map((ann, index) => ({
          imageId,
          type: ann.type,
          coordinates: ann.coordinates as Prisma.InputJsonValue,
          text: ann.text || null,
          color: ann.color || '#FF0000',
          lineWidth: ann.lineWidth || 2,
          fontSize: ann.fontSize || 14,
          layer: ann.layer ?? index,
          createdById: ctx.user.id,
        })),
      });

      await createAuditLog({
        action: 'CREATE',
        entityType: 'ImagingAnnotation',
        entityId: imageId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          operation: 'loadSnapshot',
          annotationCount: snapshot.annotations.length,
          clearedExisting: clearExisting,
        },
      });

      return ctx.prisma.imagingAnnotation.findMany({
        where: { imageId },
        orderBy: { layer: 'asc' },
      });
    }),

  // ============================================
  // MEASUREMENT TOOLS (US-227)
  // ============================================

  /**
   * Add measurement to an image (for spinal analysis)
   */
  addMeasurement: providerProcedure
    .input(
      z.object({
        imageId: z.string(),
        type: z.enum([
          'LINEAR',
          'ANGLE',
          'COBB_ANGLE',
          'CERVICAL_LORDOSIS',
          'LUMBAR_LORDOSIS',
          'DISC_HEIGHT',
          'VERTEBRAL_HEIGHT',
          'ATLAS_PLANE',
          'GEORGES_LINE',
          'AREA',
        ]),
        value: z.number(),
        unit: z.string(),
        coordinates: z.record(z.string(), z.unknown()),
        label: z.string().optional(),
        description: z.string().optional(),
        normalMin: z.number().optional(),
        normalMax: z.number().optional(),
        color: z.string().optional().default('#00FF00'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { imageId, type, value, unit, coordinates, label, description, normalMin, normalMax, color } = input;

      // Verify image exists and belongs to organization
      const image = await ctx.prisma.imagingImage.findFirst({
        where: { id: imageId },
        include: {
          study: {
            select: { organizationId: true },
          },
        },
      });

      if (!image || image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      // Calculate deviation if normal range provided
      let deviation: number | null = null;
      if (normalMin !== undefined && normalMax !== undefined) {
        const normalMid = (normalMin + normalMax) / 2;
        deviation = value - normalMid;
      }

      // Map extended types to base measurement types
      let measurementType: ImagingMeasurementType;
      switch (type) {
        case 'LINEAR':
        case 'DISC_HEIGHT':
        case 'VERTEBRAL_HEIGHT':
        case 'ATLAS_PLANE':
        case 'GEORGES_LINE':
          measurementType = 'LINEAR';
          break;
        case 'ANGLE':
        case 'CERVICAL_LORDOSIS':
        case 'LUMBAR_LORDOSIS':
          measurementType = 'ANGLE';
          break;
        case 'COBB_ANGLE':
          measurementType = 'COBB_ANGLE';
          break;
        case 'AREA':
          measurementType = 'AREA';
          break;
        default:
          measurementType = 'LINEAR';
      }

      const measurement = await ctx.prisma.imagingMeasurement.create({
        data: {
          imageId,
          type: measurementType,
          value,
          unit,
          coordinates: coordinates as Prisma.InputJsonValue,
          label: label || type,
          description,
          normalMin,
          normalMax,
          deviation,
          color,
          createdById: ctx.user.id,
        },
      });

      await createAuditLog({
        action: 'CREATE',
        entityType: 'ImagingMeasurement',
        entityId: measurement.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          imageId,
          type,
          value,
          unit,
          label,
        },
      });

      return measurement;
    }),

  /**
   * Get measurements for an image
   */
  getMeasurements: protectedProcedure
    .input(z.object({ imageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const image = await ctx.prisma.imagingImage.findFirst({
        where: { id: input.imageId },
        include: {
          study: {
            select: { organizationId: true },
          },
        },
      });

      if (!image || image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      return ctx.prisma.imagingMeasurement.findMany({
        where: { imageId: input.imageId },
        orderBy: { createdAt: 'asc' },
      });
    }),

  /**
   * Delete a measurement
   */
  deleteMeasurement: providerProcedure
    .input(z.object({ measurementId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const measurement = await ctx.prisma.imagingMeasurement.findFirst({
        where: { id: input.measurementId },
        include: {
          image: {
            include: {
              study: {
                select: { organizationId: true },
              },
            },
          },
        },
      });

      if (!measurement || measurement.image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Measurement not found',
        });
      }

      await ctx.prisma.imagingMeasurement.delete({
        where: { id: input.measurementId },
      });

      await createAuditLog({
        action: 'DELETE',
        entityType: 'ImagingMeasurement',
        entityId: input.measurementId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          type: measurement.type,
          value: measurement.value,
          imageId: measurement.imageId,
        },
      });

      return { success: true };
    }),

  // ============================================
  // GEORGE'S LINE ASSESSMENT (US-227)
  // ============================================

  /**
   * Perform George's Line assessment for cervical spine
   * George's line checks posterior vertebral body alignment
   */
  assessGeorgesLine: providerProcedure
    .input(
      z.object({
        imageId: z.string(),
        vertebralPoints: z.array(
          z.object({
            level: z.string(), // e.g., "C2", "C3", etc.
            superior: z.object({ x: z.number(), y: z.number() }),
            inferior: z.object({ x: z.number(), y: z.number() }),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { imageId, vertebralPoints } = input;

      // Verify image
      const image = await ctx.prisma.imagingImage.findFirst({
        where: { id: imageId },
        include: {
          study: {
            select: { organizationId: true },
          },
        },
      });

      if (!image || image.study.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Image not found',
        });
      }

      // Calculate George's line assessment
      // George's line is drawn along the posterior vertebral bodies
      // Any deviation > 2mm suggests subluxation/instability
      const posteriorPoints = vertebralPoints.map((v) => ({
        level: v.level,
        point: {
          x: (v.superior.x + v.inferior.x) / 2,
          y: v.superior.y, // Use superior point for posterior body alignment
        },
      }));

      // Calculate deviations from ideal line
      const assessments: {
        level: string;
        deviation: number;
        finding: string;
      }[] = [];

      for (let i = 1; i < posteriorPoints.length - 1; i++) {
        const prev = posteriorPoints[i - 1].point;
        const curr = posteriorPoints[i].point;
        const next = posteriorPoints[i + 1].point;

        // Calculate expected position on line from prev to next
        const t = 0.5; // midpoint
        const expectedX = prev.x + t * (next.x - prev.x);
        const expectedY = prev.y + t * (next.y - prev.y);

        // Calculate deviation
        const deviation = Math.sqrt(
          Math.pow(curr.x - expectedX, 2) + Math.pow(curr.y - expectedY, 2)
        );

        let finding = 'Normal alignment';
        if (deviation > 2) {
          finding = deviation > 3.5 ? 'Significant subluxation' : 'Mild subluxation';
        }

        assessments.push({
          level: posteriorPoints[i].level,
          deviation: Math.round(deviation * 100) / 100,
          finding,
        });
      }

      // Create measurement records
      const measurements = await Promise.all(
        assessments.map((assessment) =>
          ctx.prisma.imagingMeasurement.create({
            data: {
              imageId,
              type: 'LINEAR',
              value: assessment.deviation,
              unit: 'mm',
              coordinates: {
                type: 'georgesLine',
                level: assessment.level,
                vertebralPoints,
              } as Prisma.InputJsonValue,
              label: `George's Line - ${assessment.level}`,
              description: assessment.finding,
              normalMin: 0,
              normalMax: 2,
              deviation: assessment.deviation > 2 ? assessment.deviation - 2 : null,
              color: assessment.deviation > 2 ? '#FF0000' : '#00FF00',
              createdById: ctx.user.id,
            },
          })
        )
      );

      // Create annotation for visual representation
      await ctx.prisma.imagingAnnotation.create({
        data: {
          imageId,
          type: 'LINE',
          coordinates: {
            type: 'georgesLine',
            points: posteriorPoints.map((p) => p.point),
            levels: posteriorPoints.map((p) => p.level),
          } as Prisma.InputJsonValue,
          text: "George's Line",
          color: '#00FFFF',
          lineWidth: 2,
          createdById: ctx.user.id,
        },
      });

      await createAuditLog({
        action: 'CREATE',
        entityType: 'ImagingMeasurement',
        entityId: imageId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          operation: 'georgesLineAssessment',
          levels: vertebralPoints.map((v) => v.level),
          findings: assessments,
        },
      });

      return {
        assessments,
        measurements,
        overallFinding:
          assessments.every((a) => a.deviation <= 2)
            ? 'Normal posterior vertebral body alignment'
            : 'Abnormal alignment detected - review recommended',
      };
    }),
});

export type ImagingRouter = typeof imagingRouter;
