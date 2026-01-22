/**
 * Telehealth Router
 * Epic 21: Telehealth & Virtual Care
 *
 * API routes for telehealth video integration:
 * - Room creation and management
 * - Token generation
 * - Provider status checking
 * - Session management
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { createAuditLog, type AuditAction } from '@/lib/audit';
import {
  TelehealthProvider,
  TelehealthSessionStatus,
  WaitingRoomStatus,
  Prisma,
} from '@prisma/client';
import {
  getVideoService,
  initializeVideoService,
  createTelehealthRoom,
} from '@/lib/telehealth';

// ============================================
// INPUT SCHEMAS
// ============================================

const telehealthProviderSchema = z.nativeEnum(TelehealthProvider);
const sessionStatusSchema = z.nativeEnum(TelehealthSessionStatus);

// ============================================
// TELEHEALTH ROUTER
// ============================================

export const telehealthRouter = router({
  // ==========================================
  // PROVIDER MANAGEMENT
  // ==========================================

  /**
   * Get available video providers and their status
   */
  getProviderStatus: protectedProcedure.query(async ({ ctx }) => {
    try {
      const service = await initializeVideoService();
      const statuses = await service.checkAllProviders();

      return {
        defaultProvider: TelehealthProvider.TWILIO,
        providers: statuses,
        fallbackEnabled: process.env.VIDEO_ENABLE_FALLBACK === 'true',
      };
    } catch (error) {
      return {
        defaultProvider: TelehealthProvider.TWILIO,
        providers: [],
        fallbackEnabled: false,
        error: 'Video service not available',
      };
    }
  }),

  /**
   * Get provider capabilities
   */
  getProviderCapabilities: protectedProcedure
    .input(
      z.object({
        provider: telehealthProviderSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const service = await initializeVideoService();
        const providerType = input.provider || TelehealthProvider.TWILIO;
        const provider = service.getProvider(providerType);

        if (!provider) {
          return null;
        }

        return provider.getCapabilities();
      } catch (error) {
        return null;
      }
    }),

  // ==========================================
  // ROOM MANAGEMENT
  // ==========================================

  /**
   * Create a video room for an appointment
   */
  createRoom: protectedProcedure
    .input(
      z.object({
        appointmentId: z.string(),
        provider: telehealthProviderSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify appointment exists and belongs to org
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      // Check if telehealth session already exists
      const existingSession = await prisma.telehealthSession.findUnique({
        where: { appointmentId: input.appointmentId },
      });

      if (existingSession) {
        return {
          sessionId: existingSession.id,
          roomUrl: existingSession.roomUrl,
          provider: existingSession.provider,
          status: existingSession.status,
          alreadyExists: true,
        };
      }

      // Create video room
      const result = await createTelehealthRoom(
        input.appointmentId,
        appointment.startTime,
        appointment.endTime,
        input.provider
      );

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.errorMessage || 'Failed to create video room',
        });
      }

      // Create telehealth session record
      const service = await initializeVideoService();
      const sessionId = await service.createTelehealthSession(
        ctx.user.organizationId,
        input.appointmentId,
        input.provider || TelehealthProvider.TWILIO,
        result.participantUrl || result.roomName || '',
        appointment.startTime,
        appointment.endTime
      );

      // Mark appointment as telehealth
      await service.markAppointmentAsTelehealth(input.appointmentId);

      // Audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'CREATE' as AuditAction,
        entityType: 'TelehealthSession',
        entityId: sessionId,
        metadata: {
          appointmentId: input.appointmentId,
          provider: input.provider || TelehealthProvider.TWILIO,
          roomName: result.roomName,
        },
      });

      return {
        sessionId,
        roomUrl: result.participantUrl,
        hostUrl: result.hostUrl,
        roomName: result.roomName,
        provider: input.provider || TelehealthProvider.TWILIO,
        status: 'SCHEDULED',
        alreadyExists: false,
      };
    }),

  /**
   * Get room status
   */
  getRoomStatus: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const session = await prisma.telehealthSession.findFirst({
        where: {
          id: input.sessionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          appointment: {
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
              provider: {
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
          },
          waitingRoom: true,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      return session;
    }),

  /**
   * End a telehealth session
   */
  endSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        technicalNotes: z.string().optional(),
        connectionQuality: z.enum(['good', 'fair', 'poor']).optional(),
        audioQuality: z.enum(['good', 'fair', 'poor']).optional(),
        videoQuality: z.enum(['good', 'fair', 'poor']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.telehealthSession.findFirst({
        where: {
          id: input.sessionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      // Update session
      const updated = await prisma.telehealthSession.update({
        where: { id: input.sessionId },
        data: {
          status: TelehealthSessionStatus.COMPLETED,
          actualEndTime: new Date(),
          technicalNotes: input.technicalNotes,
          connectionQuality: input.connectionQuality,
          audioQuality: input.audioQuality,
          videoQuality: input.videoQuality,
        },
      });

      // Audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'UPDATE' as AuditAction,
        entityType: 'TelehealthSession',
        entityId: input.sessionId,
        metadata: {
          previousStatus: session.status,
          newStatus: 'COMPLETED',
        },
      });

      return updated;
    }),

  // ==========================================
  // TOKEN GENERATION
  // ==========================================

  /**
   * Generate access token for joining a video room
   */
  generateToken: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        isHost: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.telehealthSession.findFirst({
        where: {
          id: input.sessionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          appointment: {
            include: {
              provider: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      // Determine if user is provider (host) or patient
      const isProvider = session.appointment.provider?.userId === ctx.user.id;
      const isHost = input.isHost || isProvider;

      // Get display name
      const user = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { firstName: true, lastName: true },
      });

      const displayName = user
        ? `${user.firstName} ${user.lastName}`
        : 'Participant';

      // Generate token
      const service = await initializeVideoService();
      const roomName = session.roomUrl.split('/').pop() || session.id;

      const result = await service.generateAccessToken(
        roomName,
        ctx.user.id,
        displayName,
        isHost,
        session.provider
      );

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.errorMessage || 'Failed to generate token',
        });
      }

      return {
        token: result.token,
        expiresAt: result.expiresAt,
        joinUrl: result.joinUrl,
        roomName,
        isHost,
      };
    }),

  // ==========================================
  // SESSION LISTING
  // ==========================================

  /**
   * List telehealth sessions for an organization
   */
  listSessions: protectedProcedure
    .input(
      z.object({
        status: sessionStatusSchema.optional(),
        providerId: z.string().optional(),
        patientId: z.string().optional(),
        fromDate: z.date().optional(),
        toDate: z.date().optional(),
        limit: z.number().min(1).max(100).optional().default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.TelehealthSessionWhereInput = {
        organizationId: ctx.user.organizationId,
        ...(input.status && { status: input.status }),
        ...(input.fromDate && {
          scheduledStartTime: { gte: input.fromDate },
        }),
        ...(input.toDate && {
          scheduledEndTime: { lte: input.toDate },
        }),
        ...(input.providerId && {
          appointment: { providerId: input.providerId },
        }),
        ...(input.patientId && {
          appointment: { patientId: input.patientId },
        }),
      };

      const sessions = await prisma.telehealthSession.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { scheduledStartTime: 'desc' },
        include: {
          appointment: {
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
              provider: {
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
          },
        },
      });

      let nextCursor: string | undefined;
      if (sessions.length > input.limit) {
        const nextItem = sessions.pop();
        nextCursor = nextItem?.id;
      }

      return {
        sessions,
        nextCursor,
      };
    }),

  /**
   * Get upcoming telehealth sessions for current user
   */
  getUpcoming: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).optional().default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      // Get sessions where user is the provider
      const sessions = await prisma.telehealthSession.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: [TelehealthSessionStatus.SCHEDULED, TelehealthSessionStatus.WAITING] },
          scheduledStartTime: { gte: now },
          appointment: {
            provider: {
              userId: ctx.user.id,
            },
          },
        },
        take: input.limit,
        orderBy: { scheduledStartTime: 'asc' },
        include: {
          appointment: {
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
              appointmentType: {
                select: {
                  name: true,
                  color: true,
                },
              },
            },
          },
          waitingRoom: true,
        },
      });

      return sessions;
    }),

  // ==========================================
  // SESSION STATUS UPDATES
  // ==========================================

  /**
   * Start a telehealth session
   */
  startSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        patientLocation: z.string().optional(),
        providerLocation: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.telehealthSession.findFirst({
        where: {
          id: input.sessionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      const updated = await prisma.telehealthSession.update({
        where: { id: input.sessionId },
        data: {
          status: TelehealthSessionStatus.IN_PROGRESS,
          actualStartTime: new Date(),
          patientLocation: input.patientLocation,
          providerLocation: input.providerLocation,
        },
      });

      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'UPDATE' as AuditAction,
        entityType: 'TelehealthSession',
        entityId: input.sessionId,
        metadata: {
          previousStatus: session.status,
          newStatus: 'IN_PROGRESS',
        },
      });

      return updated;
    }),

  /**
   * Mark session as no-show
   */
  markNoShow: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.telehealthSession.findFirst({
        where: {
          id: input.sessionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      const updated = await prisma.telehealthSession.update({
        where: { id: input.sessionId },
        data: {
          status: TelehealthSessionStatus.NO_SHOW,
          technicalNotes: input.notes,
        },
      });

      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'UPDATE' as AuditAction,
        entityType: 'TelehealthSession',
        entityId: input.sessionId,
        metadata: {
          previousStatus: session.status,
          newStatus: 'NO_SHOW',
        },
      });

      return updated;
    }),

  /**
   * Report technical issues
   */
  reportTechnicalIssue: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        issueType: z.enum(['audio', 'video', 'connection', 'other']),
        description: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.telehealthSession.findFirst({
        where: {
          id: input.sessionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      const existingNotes = session.technicalNotes || '';
      const timestamp = new Date().toISOString();
      const newNote = `[${timestamp}] ${input.issueType}: ${input.description}`;

      const updated = await prisma.telehealthSession.update({
        where: { id: input.sessionId },
        data: {
          technicalNotes: existingNotes ? `${existingNotes}\n${newNote}` : newNote,
          ...(input.issueType === 'connection' && { connectionQuality: 'poor' }),
          ...(input.issueType === 'audio' && { audioQuality: 'poor' }),
          ...(input.issueType === 'video' && { videoQuality: 'poor' }),
        },
      });

      return updated;
    }),

  // ==========================================
  // VIRTUAL WAITING ROOM
  // ==========================================

  /**
   * Patient joins the virtual waiting room
   */
  joinWaitingRoom: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        deviceType: z.enum(['mobile', 'desktop', 'tablet']).optional(),
        browserInfo: z.string().optional(),
        connectionType: z.enum(['wifi', 'cellular', 'ethernet']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify session exists and is for a telehealth appointment
      const session = await prisma.telehealthSession.findFirst({
        where: {
          id: input.sessionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          appointment: {
            include: {
              patient: true,
            },
          },
          waitingRoom: true,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telehealth session not found',
        });
      }

      // Check if patient already in waiting room
      if (session.waitingRoom) {
        // Update existing waiting room entry
        const updated = await prisma.virtualWaitingRoom.update({
          where: { id: session.waitingRoom.id },
          data: {
            status: WaitingRoomStatus.WAITING,
            joinTime: new Date(),
            leaveTime: null,
            deviceType: input.deviceType,
            browserInfo: input.browserInfo,
            connectionType: input.connectionType,
          },
        });

        // Update session status to WAITING
        await prisma.telehealthSession.update({
          where: { id: input.sessionId },
          data: { status: TelehealthSessionStatus.WAITING },
        });

        return {
          waitingRoomId: updated.id,
          joinTime: updated.joinTime,
          status: updated.status,
          isRejoining: true,
        };
      }

      // Create new waiting room entry
      const waitingRoom = await prisma.virtualWaitingRoom.create({
        data: {
          patientId: session.appointment.patientId,
          sessionId: input.sessionId,
          organizationId: ctx.user.organizationId,
          status: WaitingRoomStatus.WAITING,
          deviceType: input.deviceType,
          browserInfo: input.browserInfo,
          connectionType: input.connectionType,
        },
      });

      // Update session status to WAITING
      await prisma.telehealthSession.update({
        where: { id: input.sessionId },
        data: { status: TelehealthSessionStatus.WAITING },
      });

      // Audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'CREATE' as AuditAction,
        entityType: 'VirtualWaitingRoom',
        entityId: waitingRoom.id,
        metadata: {
          sessionId: input.sessionId,
          patientId: session.appointment.patientId,
        },
      });

      return {
        waitingRoomId: waitingRoom.id,
        joinTime: waitingRoom.joinTime,
        status: waitingRoom.status,
        isRejoining: false,
      };
    }),

  /**
   * Get waiting room for provider (shows waiting patients)
   */
  getWaitingRoom: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // If sessionId provided, get specific waiting room
      if (input.sessionId) {
        const waitingRoom = await prisma.virtualWaitingRoom.findFirst({
          where: {
            sessionId: input.sessionId,
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
            session: {
              include: {
                appointment: {
                  include: {
                    appointmentType: {
                      select: {
                        name: true,
                        color: true,
                      },
                    },
                    provider: {
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
                },
              },
            },
          },
        });

        if (!waitingRoom) {
          return null;
        }

        // Calculate wait time
        const waitSeconds = waitingRoom.status === WaitingRoomStatus.WAITING
          ? Math.floor((new Date().getTime() - waitingRoom.joinTime.getTime()) / 1000)
          : waitingRoom.waitSeconds;

        return {
          ...waitingRoom,
          currentWaitSeconds: waitSeconds,
        };
      }

      // Get all waiting patients for provider's sessions
      const waitingPatients = await prisma.virtualWaitingRoom.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: WaitingRoomStatus.WAITING,
          session: {
            appointment: {
              provider: {
                userId: ctx.user.id,
              },
            },
          },
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
          session: {
            include: {
              appointment: {
                include: {
                  appointmentType: {
                    select: {
                      name: true,
                      color: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { joinTime: 'asc' },
      });

      // Add wait time calculation
      return waitingPatients.map((wr) => ({
        ...wr,
        currentWaitSeconds: Math.floor(
          (new Date().getTime() - wr.joinTime.getTime()) / 1000
        ),
      }));
    }),

  /**
   * Provider admits patient from waiting room to session
   */
  admitPatient: protectedProcedure
    .input(
      z.object({
        waitingRoomId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const waitingRoom = await prisma.virtualWaitingRoom.findFirst({
        where: {
          id: input.waitingRoomId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          session: {
            include: {
              appointment: {
                include: {
                  provider: true,
                },
              },
            },
          },
        },
      });

      if (!waitingRoom) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Waiting room entry not found',
        });
      }

      // Verify user is the provider for this appointment
      if (waitingRoom.session.appointment.provider?.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the assigned provider can admit patients',
        });
      }

      // Calculate wait time
      const waitSeconds = Math.floor(
        (new Date().getTime() - waitingRoom.joinTime.getTime()) / 1000
      );

      // Update waiting room status
      const updated = await prisma.virtualWaitingRoom.update({
        where: { id: input.waitingRoomId },
        data: {
          status: WaitingRoomStatus.ADMITTED,
          admitTime: new Date(),
          waitSeconds,
        },
      });

      // Update session status to IN_PROGRESS
      await prisma.telehealthSession.update({
        where: { id: waitingRoom.sessionId },
        data: {
          status: TelehealthSessionStatus.IN_PROGRESS,
          actualStartTime: new Date(),
        },
      });

      // Audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'UPDATE' as AuditAction,
        entityType: 'VirtualWaitingRoom',
        entityId: input.waitingRoomId,
        metadata: {
          previousStatus: waitingRoom.status,
          newStatus: 'ADMITTED',
          waitSeconds,
        },
      });

      return {
        ...updated,
        waitSeconds,
        sessionId: waitingRoom.sessionId,
      };
    }),

  /**
   * Patient leaves waiting room
   */
  leaveWaitingRoom: protectedProcedure
    .input(
      z.object({
        waitingRoomId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const waitingRoom = await prisma.virtualWaitingRoom.findFirst({
        where: {
          id: input.waitingRoomId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!waitingRoom) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Waiting room entry not found',
        });
      }

      const waitSeconds = Math.floor(
        (new Date().getTime() - waitingRoom.joinTime.getTime()) / 1000
      );

      const updated = await prisma.virtualWaitingRoom.update({
        where: { id: input.waitingRoomId },
        data: {
          status: WaitingRoomStatus.LEFT,
          leaveTime: new Date(),
          waitSeconds,
        },
      });

      return updated;
    }),

  /**
   * Update pre-visit technical check status
   */
  updateTechnicalCheck: protectedProcedure
    .input(
      z.object({
        waitingRoomId: z.string(),
        cameraChecked: z.boolean().optional(),
        microphoneChecked: z.boolean().optional(),
        connectionChecked: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const waitingRoom = await prisma.virtualWaitingRoom.findFirst({
        where: {
          id: input.waitingRoomId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!waitingRoom) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Waiting room entry not found',
        });
      }

      const updated = await prisma.virtualWaitingRoom.update({
        where: { id: input.waitingRoomId },
        data: {
          ...(input.cameraChecked !== undefined && { cameraChecked: input.cameraChecked }),
          ...(input.microphoneChecked !== undefined && { microphoneChecked: input.microphoneChecked }),
          ...(input.connectionChecked !== undefined && { connectionChecked: input.connectionChecked }),
        },
      });

      return updated;
    }),

  /**
   * Submit pre-visit questionnaire responses
   */
  submitPreVisitQuestionnaire: protectedProcedure
    .input(
      z.object({
        waitingRoomId: z.string(),
        responses: z.record(z.string(), z.string().optional()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const waitingRoom = await prisma.virtualWaitingRoom.findFirst({
        where: {
          id: input.waitingRoomId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!waitingRoom) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Waiting room entry not found',
        });
      }

      const updated = await prisma.virtualWaitingRoom.update({
        where: { id: input.waitingRoomId },
        data: {
          preVisitQuestionnaireCompleted: true,
          preVisitResponses: input.responses as Prisma.InputJsonValue,
        },
      });

      return updated;
    }),

  /**
   * Get waiting room status for patient (includes wait time and provider ready status)
   */
  getWaitingRoomStatus: protectedProcedure
    .input(
      z.object({
        waitingRoomId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const waitingRoom = await prisma.virtualWaitingRoom.findFirst({
        where: {
          id: input.waitingRoomId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          session: {
            include: {
              appointment: {
                include: {
                  provider: {
                    include: {
                      user: {
                        select: {
                          firstName: true,
                          lastName: true,
                        },
                      },
                    },
                  },
                  appointmentType: {
                    select: {
                      name: true,
                      duration: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!waitingRoom) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Waiting room entry not found',
        });
      }

      // Calculate wait time
      const currentWaitSeconds = waitingRoom.status === WaitingRoomStatus.WAITING
        ? Math.floor((new Date().getTime() - waitingRoom.joinTime.getTime()) / 1000)
        : waitingRoom.waitSeconds || 0;

      // Format wait time for display
      const waitMinutes = Math.floor(currentWaitSeconds / 60);
      const waitSecondsDisplay = currentWaitSeconds % 60;

      // Check if provider is ready (session status is IN_PROGRESS or patient was ADMITTED)
      const isProviderReady = waitingRoom.status === WaitingRoomStatus.ADMITTED ||
        waitingRoom.session.status === TelehealthSessionStatus.IN_PROGRESS;

      return {
        id: waitingRoom.id,
        status: waitingRoom.status,
        joinTime: waitingRoom.joinTime,
        admitTime: waitingRoom.admitTime,
        currentWaitSeconds,
        waitTimeDisplay: `${waitMinutes}:${waitSecondsDisplay.toString().padStart(2, '0')}`,
        isProviderReady,
        preChecks: {
          camera: waitingRoom.cameraChecked,
          microphone: waitingRoom.microphoneChecked,
          connection: waitingRoom.connectionChecked,
        },
        questionnaireCompleted: waitingRoom.preVisitQuestionnaireCompleted,
        sessionId: waitingRoom.sessionId,
        scheduledTime: waitingRoom.session.scheduledStartTime,
        provider: waitingRoom.session.appointment.provider?.user
          ? {
              firstName: waitingRoom.session.appointment.provider.user.firstName,
              lastName: waitingRoom.session.appointment.provider.user.lastName,
            }
          : null,
        appointmentType: waitingRoom.session.appointment.appointmentType?.name || 'Telehealth Visit',
      };
    }),
});
