/**
 * Imaging Router
 * Epic 22: Imaging & X-Ray Integration
 *
 * API routes for imaging upload and storage:
 * - Study creation and management
 * - Image upload (single and bulk)
 * - DICOM and standard image format support
 * - HIPAA-compliant storage
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { createAuditLog } from '@/lib/audit';
import {
  ImagingModality,
  ImagingStudyStatus,
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
});

export type ImagingRouter = typeof imagingRouter;
