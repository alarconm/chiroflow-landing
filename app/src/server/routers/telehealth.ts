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
// HELPER FUNCTIONS
// ============================================

/**
 * Get default consent text based on consent type
 */
function getDefaultConsentText(
  consentType: 'GENERAL' | 'HIPAA' | 'RECORDING' | 'STATE_SPECIFIC',
  stateCode?: string
): string {
  const consentTexts: Record<string, string> = {
    GENERAL: `TELEHEALTH INFORMED CONSENT

I hereby consent to receiving healthcare services via telehealth (video/audio communication technology).

I understand that:

1. NATURE OF TELEHEALTH
   - Telehealth involves the use of electronic communications to enable healthcare providers to provide care remotely.
   - The types of services that may be provided include consultation, evaluation, diagnosis, and treatment planning.
   - Technical difficulties may occur, and there may be limitations to the examination compared to an in-person visit.

2. EXPECTED BENEFITS
   - Improved access to care by enabling patients to receive services without traveling to the provider's office.
   - More efficient evaluation and management of care.
   - Ability to obtain health care expertise from a distance.

3. POTENTIAL RISKS
   - Information transmitted may not be sufficient to allow for appropriate medical decision making.
   - Delays in evaluation or treatment could occur due to technology failures.
   - Lack of access to complete medical records may result in adverse drug interactions or allergic reactions.
   - Security measures may fail, resulting in a breach of privacy.

4. MY RIGHTS
   - I have the right to withhold or withdraw consent at any time without affecting my right to future care.
   - I have the right to request that no information be shared if I am not comfortable with the security.
   - I have the right to access my medical information transmitted during a telehealth interaction.

5. PATIENT RESPONSIBILITIES
   - I agree to provide accurate information about my medical history and current health status.
   - I will follow the treatment plan developed with my provider.
   - I will be located in a private, secure location during my telehealth visit.

By signing below, I acknowledge that I have read and understand this consent form, and I agree to receive telehealth services.`,

    HIPAA: `HIPAA NOTICE FOR TELEHEALTH SERVICES

This notice describes how medical information about you may be used and disclosed during telehealth services.

USES AND DISCLOSURES OF HEALTH INFORMATION DURING TELEHEALTH:
We will use reasonable safeguards to protect the privacy of your health information during telehealth sessions, including:
- Using encrypted video/audio communication platforms
- Ensuring all staff accessing your information are properly trained on HIPAA requirements
- Maintaining secure records of all telehealth encounters

YOUR RIGHTS REGARDING YOUR HEALTH INFORMATION:
- You have the right to request restrictions on how we use or disclose your information
- You have the right to receive confidential communications
- You have the right to inspect and copy your health information
- You have the right to amend your health information
- You have the right to an accounting of disclosures

ACKNOWLEDGMENT:
By signing below, I acknowledge that I have received and understand this HIPAA notice for telehealth services, and I consent to the use and disclosure of my protected health information as described.`,

    RECORDING: `CONSENT TO RECORD TELEHEALTH SESSION

I hereby give my consent for [PRACTICE NAME] to record my telehealth session(s).

I understand that:

1. PURPOSE OF RECORDING
   - Recordings may be used for quality assurance and training purposes.
   - Recordings may become part of my medical record.
   - Recordings will be stored securely and accessed only by authorized personnel.

2. MY RIGHTS
   - I may revoke this consent at any time.
   - Revoking consent will not affect recordings made prior to revocation.
   - I may request a copy of any recording in accordance with applicable law.

3. STORAGE AND RETENTION
   - Recordings will be stored securely using encryption.
   - Recordings will be retained in accordance with medical record retention policies.
   - Recordings will be disposed of securely when no longer needed.

By signing below, I consent to the recording of my telehealth session(s).`,

    STATE_SPECIFIC: stateCode
      ? getStateSpecificConsentText(stateCode)
      : `STATE-SPECIFIC TELEHEALTH CONSENT

Additional consent requirements may apply based on your state of residence. Please consult with your healthcare provider for state-specific telehealth regulations and consent requirements.`,
  };

  return consentTexts[consentType] || consentTexts.GENERAL;
}

/**
 * Get state-specific consent text
 */
function getStateSpecificConsentText(stateCode: string): string {
  // States with specific telehealth consent requirements
  const stateTexts: Record<string, string> = {
    CA: `CALIFORNIA TELEHEALTH CONSENT ADDENDUM

In accordance with California Business and Professions Code Section 2290.5, I acknowledge the following:

1. I have been informed of the nature and benefits of telehealth.
2. I understand that telehealth involves the communication of my medical information using electronic means.
3. I have been informed of the potential risks of telehealth.
4. I understand my rights regarding telehealth services.
5. I understand that I may be required to provide my location at the beginning of each telehealth session.
6. I consent to receive telehealth services from my healthcare provider.`,

    TX: `TEXAS TELEHEALTH CONSENT ADDENDUM

In accordance with Texas Occupations Code Chapter 111, I acknowledge:

1. I understand the nature of telehealth services being provided.
2. I understand there may be limitations compared to in-person services.
3. I have been informed about the security measures in place.
4. I understand my right to refuse telehealth services.
5. I consent to receive telehealth services.`,

    NY: `NEW YORK TELEHEALTH CONSENT ADDENDUM

In accordance with New York Public Health Law Article 29-G, I acknowledge:

1. I have been provided with information about telehealth.
2. I understand the differences between telehealth and in-person care.
3. I have been informed about privacy and security measures.
4. I understand my rights as a patient receiving telehealth services.
5. I consent to participate in telehealth services.`,

    FL: `FLORIDA TELEHEALTH CONSENT ADDENDUM

In accordance with Florida Statutes Section 456.47, I acknowledge:

1. I have been informed about the nature of telehealth services.
2. I understand the potential benefits and limitations.
3. I am aware of my rights regarding telehealth.
4. I consent to receive telehealth services from my provider.`,
  };

  return (
    stateTexts[stateCode] ||
    `STATE-SPECIFIC TELEHEALTH CONSENT FOR ${stateCode}

I acknowledge that I am receiving telehealth services while located in ${stateCode}, and I consent to receive such services in accordance with applicable state laws and regulations.`
  );
}

/**
 * Get state-specific requirements for telehealth
 */
function getStateSpecificRequirements(stateCode: string): {
  stateCode: string;
  stateName: string;
  requiresSpecificConsent: boolean;
  consentRequirements: string[];
  restrictions: string[];
  notes: string;
} {
  const stateNames: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    DC: 'District of Columbia',
  };

  // States with specific consent requirements
  const stateRequirements: Record<
    string,
    {
      requiresSpecificConsent: boolean;
      consentRequirements: string[];
      restrictions: string[];
      notes: string;
    }
  > = {
    CA: {
      requiresSpecificConsent: true,
      consentRequirements: [
        'Written or verbal consent required',
        'Patient must be informed of alternatives to telehealth',
        'Consent must be documented in medical record',
      ],
      restrictions: [
        'Initial patient encounter may require in-person visit for some specialties',
      ],
      notes: 'California has comprehensive telehealth regulations under Business and Professions Code Section 2290.5',
    },
    TX: {
      requiresSpecificConsent: true,
      consentRequirements: [
        'Consent required before each telehealth service',
        'Patient must be informed of limitations',
      ],
      restrictions: [
        'Certain controlled substance prescriptions have restrictions',
      ],
      notes: 'Texas Occupations Code Chapter 111 governs telehealth services',
    },
    NY: {
      requiresSpecificConsent: true,
      consentRequirements: [
        'Written or oral consent required',
        'Consent must be documented',
        'Patient must be informed about security measures',
      ],
      restrictions: [],
      notes: 'New York Public Health Law Article 29-G applies to telehealth',
    },
    FL: {
      requiresSpecificConsent: false,
      consentRequirements: [
        'Standard informed consent applies',
      ],
      restrictions: [
        'Prescribing controlled substances has specific requirements',
      ],
      notes: 'Florida has relatively permissive telehealth regulations',
    },
  };

  const defaultRequirements = {
    requiresSpecificConsent: false,
    consentRequirements: ['Standard informed consent for telehealth services'],
    restrictions: [],
    notes: 'Consult state-specific regulations for the most current requirements',
  };

  const requirements = stateRequirements[stateCode] || defaultRequirements;

  return {
    stateCode,
    stateName: stateNames[stateCode] || stateCode,
    ...requirements,
  };
}

/**
 * Get recommendations based on consent status
 */
function getConsentRecommendations(
  consentStatus: Record<
    string,
    {
      hasConsent: boolean;
      isValid: boolean;
      requiresRenewal: boolean;
      daysUntilExpiration?: number;
    }
  >,
  stateCode?: string
): string[] {
  const recommendations: string[] = [];

  for (const [type, status] of Object.entries(consentStatus)) {
    if (!status.hasConsent) {
      recommendations.push(`Request ${type} consent from patient`);
    } else if (!status.isValid) {
      recommendations.push(`${type} consent is invalid - request new consent`);
    } else if (status.requiresRenewal) {
      if (status.daysUntilExpiration !== undefined && status.daysUntilExpiration > 0) {
        recommendations.push(
          `${type} consent expires in ${status.daysUntilExpiration} days - consider renewal`
        );
      } else {
        recommendations.push(`${type} consent has expired - renewal required`);
      }
    }
  }

  if (stateCode) {
    const stateReqs = getStateSpecificRequirements(stateCode);
    if (stateReqs.requiresSpecificConsent && !consentStatus['STATE_SPECIFIC']?.isValid) {
      recommendations.push(`State-specific consent required for ${stateReqs.stateName}`);
    }
  }

  return recommendations;
}

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

  // ==========================================
  // TELEHEALTH DOCUMENTATION (US-220)
  // ==========================================

  /**
   * Create telehealth-specific SOAP note with auto-populated telehealth fields
   */
  createTelehealthNote: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        encounterId: z.string().optional(), // If not provided, creates new encounter
        // Telehealth-specific documentation
        technologyUsed: z.enum(['audio_video', 'audio_only', 'store_and_forward', 'remote_monitoring']),
        connectionQuality: z.enum(['excellent', 'good', 'fair', 'poor']),
        technicalIssues: z.string().optional(),
        // Patient location (required for billing)
        patientLocation: z.object({
          city: z.string().min(1, 'Patient city is required'),
          state: z.string().min(2).max(2, 'State must be 2-letter code'),
          isPatientHome: z.boolean(),
        }),
        // Provider location
        providerLocation: z.object({
          city: z.string().min(1, 'Provider city is required'),
          state: z.string().min(2).max(2, 'State must be 2-letter code'),
        }),
        // Consent verification
        consentVerified: z.boolean(),
        consentId: z.string().optional(),
        // SOAP content
        subjective: z.string().optional(),
        objective: z.string().optional(),
        assessment: z.string().optional(),
        plan: z.string().optional(),
        // Whether patient could be adequately assessed via telehealth
        adequateAssessment: z.boolean().default(true),
        inadequateAssessmentReason: z.string().optional(),
        // Follow-up recommendation
        followUpRecommendation: z.enum(['telehealth', 'in_person', 'either']).default('either'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify session exists
      const session = await prisma.telehealthSession.findFirst({
        where: {
          id: input.sessionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          appointment: {
            include: {
              patient: { include: { demographics: true } },
              provider: { include: { user: true } },
            },
          },
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telehealth session not found',
        });
      }

      // Verify consent if required
      if (input.consentVerified && !input.consentId) {
        // Check if patient has valid telehealth consent
        const validConsent = await prisma.telehealthConsent.findFirst({
          where: {
            patientId: session.appointment.patientId,
            organizationId: ctx.user.organizationId,
            status: 'SIGNED',
            OR: [
              { expirationDate: null },
              { expirationDate: { gt: new Date() } },
            ],
          },
        });

        if (!validConsent) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No valid telehealth consent found for this patient',
          });
        }
      }

      // Determine place of service code
      const placeOfServiceCode = input.patientLocation.isPatientHome ? '10' : '02';

      // Determine telehealth modifier based on technology
      const telehealthModifier = input.technologyUsed === 'audio_only' ? '93' : '95';

      // Update session with documentation details
      await prisma.telehealthSession.update({
        where: { id: input.sessionId },
        data: {
          patientLocation: `${input.patientLocation.city}, ${input.patientLocation.state}`,
          providerLocation: `${input.providerLocation.city}, ${input.providerLocation.state}`,
          placeOfServiceCode,
          telehealthModifier,
          technicalNotes: input.technicalIssues,
          connectionQuality: input.connectionQuality,
        },
      });

      // Create or get encounter
      let encounterId = input.encounterId;
      if (!encounterId) {
        // Get user's provider record
        const provider = await prisma.provider.findFirst({
          where: { userId: ctx.user.id, organizationId: ctx.user.organizationId },
        });

        if (!provider) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'User is not a provider',
          });
        }

        // Create encounter for this telehealth session
        const encounter = await prisma.encounter.create({
          data: {
            patientId: session.appointment.patientId,
            providerId: provider.id,
            appointmentId: session.appointment.id,
            encounterType: 'FOLLOW_UP',
            encounterDate: session.actualStartTime || session.scheduledStartTime,
            status: 'IN_PROGRESS',
            organizationId: ctx.user.organizationId,
            createdBy: ctx.user.id,
            location: 'Telehealth',
          },
        });
        encounterId = encounter.id;
      }

      // Build telehealth-specific SOAP content
      const telehealthObjectivePrefix = `
TELEHEALTH VISIT DOCUMENTATION
==============================
Visit conducted via: ${input.technologyUsed === 'audio_video' ? 'Real-time audio and video' : input.technologyUsed === 'audio_only' ? 'Audio only' : input.technologyUsed}
Technology used: ${input.technologyUsed.replace(/_/g, ' ')}
Connection quality: ${input.connectionQuality}
${input.technicalIssues ? `Technical issues noted: ${input.technicalIssues}` : 'No technical issues during visit'}

Patient Location: ${input.patientLocation.city}, ${input.patientLocation.state} (${input.patientLocation.isPatientHome ? 'Patient\'s home' : 'Other location'})
Provider Location: ${input.providerLocation.city}, ${input.providerLocation.state}

Telehealth consent verified: ${input.consentVerified ? 'Yes' : 'No'}
Adequate assessment via telehealth: ${input.adequateAssessment ? 'Yes' : 'No'}${!input.adequateAssessment && input.inadequateAssessmentReason ? ` - ${input.inadequateAssessmentReason}` : ''}

EXAMINATION (via telehealth):
`;

      const objectiveContent = `${telehealthObjectivePrefix}
${input.objective || 'Visual observation performed via video. Physical examination limited by telehealth modality.'}`;

      const planSuffix = `
FOLLOW-UP RECOMMENDATION:
${input.followUpRecommendation === 'telehealth' ? 'Continue with telehealth visits' : input.followUpRecommendation === 'in_person' ? 'In-person visit recommended for next appointment' : 'Either telehealth or in-person appropriate'}

BILLING INFORMATION:
- Place of Service: ${placeOfServiceCode} (${input.patientLocation.isPatientHome ? 'Patient\'s home' : 'Telehealth - other location'})
- Telehealth Modifier: ${telehealthModifier} (${telehealthModifier === '95' ? 'Synchronous telemedicine' : 'Audio-only'})
`;

      const planContent = `${input.plan || ''}${planSuffix}`;

      // Create or update SOAP note
      const existingNote = await prisma.sOAPNote.findFirst({
        where: { encounterId },
      });

      let soapNote;
      if (existingNote) {
        soapNote = await prisma.sOAPNote.update({
          where: { id: existingNote.id },
          data: {
            subjective: input.subjective || existingNote.subjective,
            objective: objectiveContent,
            assessment: input.assessment || existingNote.assessment,
            plan: planContent,
            version: { increment: 1 },
            objectiveJson: {
              telehealthDetails: {
                technologyUsed: input.technologyUsed,
                connectionQuality: input.connectionQuality,
                technicalIssues: input.technicalIssues,
                patientLocation: input.patientLocation,
                providerLocation: input.providerLocation,
                adequateAssessment: input.adequateAssessment,
                inadequateAssessmentReason: input.inadequateAssessmentReason,
                followUpRecommendation: input.followUpRecommendation,
                consentVerified: input.consentVerified,
              },
            } as Prisma.InputJsonValue,
          },
        });
      } else {
        soapNote = await prisma.sOAPNote.create({
          data: {
            encounterId,
            subjective: input.subjective || '',
            objective: objectiveContent,
            assessment: input.assessment || '',
            plan: planContent,
            version: 1,
            objectiveJson: {
              telehealthDetails: {
                technologyUsed: input.technologyUsed,
                connectionQuality: input.connectionQuality,
                technicalIssues: input.technicalIssues,
                patientLocation: input.patientLocation,
                providerLocation: input.providerLocation,
                adequateAssessment: input.adequateAssessment,
                inadequateAssessmentReason: input.inadequateAssessmentReason,
                followUpRecommendation: input.followUpRecommendation,
                consentVerified: input.consentVerified,
              },
            } as Prisma.InputJsonValue,
          },
        });
      }

      // Audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'CREATE' as AuditAction,
        entityType: 'SOAPNote',
        entityId: soapNote.id,
        metadata: {
          sessionId: input.sessionId,
          encounterId,
          isTelehealth: true,
          technologyUsed: input.technologyUsed,
          placeOfServiceCode,
          telehealthModifier,
        },
      });

      return {
        soapNoteId: soapNote.id,
        encounterId,
        sessionId: input.sessionId,
        billingInfo: {
          placeOfServiceCode,
          telehealthModifier,
          patientLocation: `${input.patientLocation.city}, ${input.patientLocation.state}`,
          providerLocation: `${input.providerLocation.city}, ${input.providerLocation.state}`,
        },
      };
    }),

  /**
   * Add telehealth modifier to procedure billing codes
   */
  addTelehealthModifierToProcedures: protectedProcedure
    .input(
      z.object({
        encounterId: z.string(),
        modifier: z.enum(['95', 'GT', 'FQ', '93', 'GQ']).default('95'),
        procedureIds: z.array(z.string()).optional(), // If not provided, updates all procedures
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify encounter exists and is linked to a telehealth session
      const encounter = await prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          appointment: {
            include: {
              telehealthSession: true,
            },
          },
          procedures: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      if (!encounter.appointment?.telehealthSession) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This encounter is not linked to a telehealth session',
        });
      }

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify procedures on a signed encounter',
        });
      }

      // Get procedures to update
      const proceduresToUpdate = input.procedureIds
        ? encounter.procedures.filter((p) => input.procedureIds!.includes(p.id))
        : encounter.procedures;

      const updatedProcedures = [];
      for (const proc of proceduresToUpdate) {
        // Add telehealth modifier to first available modifier slot
        const updated = await prisma.procedure.update({
          where: { id: proc.id },
          data: {
            modifier1: proc.modifier1 || input.modifier,
            modifier2: proc.modifier1 && !proc.modifier2 ? input.modifier : proc.modifier2,
            modifier3:
              proc.modifier1 && proc.modifier2 && !proc.modifier3
                ? input.modifier
                : proc.modifier3,
            modifier4:
              proc.modifier1 && proc.modifier2 && proc.modifier3 && !proc.modifier4
                ? input.modifier
                : proc.modifier4,
          },
        });
        updatedProcedures.push(updated);
      }

      // Audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'UPDATE' as AuditAction,
        entityType: 'Procedure',
        entityId: input.encounterId,
        metadata: {
          action: 'add_telehealth_modifier',
          modifier: input.modifier,
          procedureCount: updatedProcedures.length,
        },
      });

      return {
        updatedCount: updatedProcedures.length,
        procedures: updatedProcedures,
        modifier: input.modifier,
      };
    }),

  /**
   * Get telehealth documentation status for a session
   */
  getDocumentationStatus: protectedProcedure
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
              encounter: {
                include: {
                  soapNote: true,
                  diagnoses: { where: { isPrimary: true }, take: 1 },
                  procedures: true,
                },
              },
              patient: {
                include: {
                  demographics: { select: { firstName: true, lastName: true } },
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

      const encounter = session.appointment.encounter;
      const hasSOAPNote = !!encounter?.soapNote;
      const hasDiagnosis = (encounter?.diagnoses?.length ?? 0) > 0;
      const hasProcedures = (encounter?.procedures?.length ?? 0) > 0;
      const hasPatientLocation = !!session.patientLocation;
      const hasProviderLocation = !!session.providerLocation;
      const hasPlaceOfService = !!session.placeOfServiceCode;
      const hasTelehealthModifier = !!session.telehealthModifier;

      // Check if procedures have telehealth modifier
      const proceduresWithModifier =
        encounter?.procedures?.filter(
          (p) =>
            p.modifier1 === '95' ||
            p.modifier1 === 'GT' ||
            p.modifier1 === '93' ||
            p.modifier2 === '95' ||
            p.modifier2 === 'GT' ||
            p.modifier2 === '93'
        ).length ?? 0;

      const documentationComplete =
        hasSOAPNote &&
        hasDiagnosis &&
        hasProcedures &&
        hasPatientLocation &&
        hasProviderLocation &&
        hasPlaceOfService &&
        proceduresWithModifier === (encounter?.procedures?.length ?? 0);

      return {
        sessionId: input.sessionId,
        encounterId: encounter?.id,
        patientName: session.appointment.patient.demographics
          ? `${session.appointment.patient.demographics.firstName} ${session.appointment.patient.demographics.lastName}`
          : 'Unknown',
        sessionStatus: session.status,

        documentationStatus: {
          complete: documentationComplete,
          hasSOAPNote,
          hasDiagnosis,
          hasProcedures,
          hasPatientLocation,
          hasProviderLocation,
          hasPlaceOfService,
          hasTelehealthModifier,
          proceduresWithModifier,
          totalProcedures: encounter?.procedures?.length ?? 0,
        },

        billingInfo: {
          placeOfServiceCode: session.placeOfServiceCode,
          telehealthModifier: session.telehealthModifier,
          patientLocation: session.patientLocation,
          providerLocation: session.providerLocation,
        },

        missingItems: [
          !hasSOAPNote && 'SOAP note',
          !hasDiagnosis && 'Diagnosis',
          !hasProcedures && 'Procedures',
          !hasPatientLocation && 'Patient location',
          !hasProviderLocation && 'Provider location',
          !hasPlaceOfService && 'Place of service code',
          proceduresWithModifier < (encounter?.procedures?.length ?? 0) &&
            'Telehealth modifier on all procedures',
        ].filter(Boolean) as string[],
      };
    }),

  /**
   * Verify telehealth consent for a patient before session
   */
  verifyConsent: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        consentTypes: z
          .array(z.enum(['GENERAL', 'HIPAA', 'RECORDING', 'STATE_SPECIFIC']))
          .default(['GENERAL']),
      })
    )
    .query(async ({ ctx, input }) => {
      const consents = await prisma.telehealthConsent.findMany({
        where: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          consentType: { in: input.consentTypes },
          status: 'SIGNED',
          OR: [
            { expirationDate: null },
            { expirationDate: { gt: new Date() } },
          ],
        },
        orderBy: { signedAt: 'desc' },
      });

      const consentStatus: Record<
        string,
        { valid: boolean; consentId?: string; signedAt?: Date; expiresAt?: Date | null }
      > = {};

      for (const type of input.consentTypes) {
        const consent = consents.find((c) => c.consentType === type);
        consentStatus[type] = {
          valid: !!consent,
          consentId: consent?.id,
          signedAt: consent?.signedAt || undefined,
          expiresAt: consent?.expirationDate,
        };
      }

      const allConsentsValid = input.consentTypes.every(
        (type) => consentStatus[type]?.valid
      );

      return {
        patientId: input.patientId,
        allConsentsValid,
        consents: consentStatus,
        missingConsents: input.consentTypes.filter(
          (type) => !consentStatus[type]?.valid
        ),
      };
    }),

  /**
   * Get telehealth SOAP template
   */
  getSOAPTemplate: protectedProcedure.query(async () => {
    // Import the default template from types
    const {
      DEFAULT_TELEHEALTH_SOAP_TEMPLATE,
    } = await import('@/lib/telehealth/types');

    return DEFAULT_TELEHEALTH_SOAP_TEMPLATE;
  }),

  /**
   * Update session billing information
   */
  updateBillingInfo: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        placeOfServiceCode: z.enum(['10', '02', '11', '12']),
        telehealthModifier: z.enum(['95', 'GT', 'FQ', '93', 'GQ']),
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
          placeOfServiceCode: input.placeOfServiceCode,
          telehealthModifier: input.telehealthModifier,
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
          action: 'update_billing_info',
          placeOfServiceCode: input.placeOfServiceCode,
          telehealthModifier: input.telehealthModifier,
        },
      });

      return {
        sessionId: updated.id,
        placeOfServiceCode: updated.placeOfServiceCode,
        telehealthModifier: updated.telehealthModifier,
        patientLocation: updated.patientLocation,
        providerLocation: updated.providerLocation,
      };
    }),

  // ==========================================
  // TELEHEALTH CONSENT MANAGEMENT (US-221)
  // ==========================================

  /**
   * Send telehealth consent form to patient
   * Creates a pending consent record and optionally sends notification
   */
  sendConsent: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        consentType: z.enum(['GENERAL', 'HIPAA', 'RECORDING', 'STATE_SPECIFIC']),
        /** State code for state-specific consent */
        stateCode: z.string().optional(),
        /** Custom expiration in days from now (default: 365) */
        expirationDays: z.number().min(1).max(730).optional().default(365),
        /** Send email notification to patient */
        sendNotification: z.boolean().optional().default(true),
        /** Custom consent text override */
        customConsentText: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify patient exists
      const patient = await prisma.patient.findFirst({
        where: {
          id: input.patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: { select: { firstName: true, lastName: true } },
          contacts: { where: { isPrimary: true }, select: { email: true }, take: 1 },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check if there's already a pending consent of this type
      const existingPending = await prisma.telehealthConsent.findFirst({
        where: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          consentType: input.consentType,
          status: 'PENDING',
        },
      });

      if (existingPending) {
        // Update the existing pending consent
        const updated = await prisma.telehealthConsent.update({
          where: { id: existingPending.id },
          data: {
            sentAt: new Date(),
            remindedAt: new Date(),
            stateCode: input.stateCode,
            consentText: input.customConsentText || existingPending.consentText,
          },
        });

        // Audit log
        await createAuditLog({
          organizationId: ctx.user.organizationId,
          userId: ctx.user.id,
          action: 'UPDATE' as AuditAction,
          entityType: 'TelehealthConsent',
          entityId: updated.id,
          metadata: {
            action: 'resend_consent',
            patientId: input.patientId,
            consentType: input.consentType,
          },
        });

        return {
          consentId: updated.id,
          status: 'PENDING',
          wasResent: true,
          patientEmail: patient.contacts?.[0]?.email,
        };
      }

      // Get default consent text based on type
      const consentText = input.customConsentText || getDefaultConsentText(input.consentType, input.stateCode);

      // Calculate expiration date
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + input.expirationDays);

      // Create consent record
      const consent = await prisma.telehealthConsent.create({
        data: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          consentType: input.consentType,
          status: 'PENDING',
          consentFormVersion: '1.0',
          consentText,
          effectiveDate: new Date(),
          expirationDate,
          stateCode: input.stateCode,
          stateRequirements: input.stateCode
            ? (getStateSpecificRequirements(input.stateCode) as Prisma.InputJsonValue)
            : undefined,
          sentAt: new Date(),
        },
      });

      // Audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'CREATE' as AuditAction,
        entityType: 'TelehealthConsent',
        entityId: consent.id,
        metadata: {
          action: 'send_consent',
          patientId: input.patientId,
          consentType: input.consentType,
          expirationDate: expirationDate.toISOString(),
        },
      });

      return {
        consentId: consent.id,
        status: 'PENDING',
        wasResent: false,
        expirationDate,
        patientEmail: patient.contacts?.[0]?.email,
      };
    }),

  /**
   * Check consent status for a patient
   * Returns detailed consent information and validity
   */
  checkConsent: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        consentTypes: z
          .array(z.enum(['GENERAL', 'HIPAA', 'RECORDING', 'STATE_SPECIFIC']))
          .optional()
          .default(['GENERAL']),
        /** Check state-specific consent for this state */
        stateCode: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      // Get all consents for patient
      const consents = await prisma.telehealthConsent.findMany({
        where: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          consentType: { in: input.consentTypes },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Build consent status for each type
      const consentStatus: Record<
        string,
        {
          hasConsent: boolean;
          isValid: boolean;
          consentId?: string;
          status?: string;
          signedAt?: Date;
          expiresAt?: Date | null;
          daysUntilExpiration?: number;
          requiresRenewal: boolean;
          stateCode?: string | null;
        }
      > = {};

      for (const type of input.consentTypes) {
        // Find the most recent consent of this type
        const consent = consents.find((c) => c.consentType === type);

        if (!consent) {
          consentStatus[type] = {
            hasConsent: false,
            isValid: false,
            requiresRenewal: true,
          };
          continue;
        }

        // Check if consent is valid
        const isExpired = consent.expirationDate && consent.expirationDate < now;
        const isRevoked = consent.status === 'REVOKED';
        const isDeclined = consent.status === 'DECLINED';
        const isSigned = consent.status === 'SIGNED';
        const isValid = isSigned && !isExpired && !isRevoked;

        // Calculate days until expiration
        let daysUntilExpiration: number | undefined;
        if (consent.expirationDate && !isExpired) {
          daysUntilExpiration = Math.ceil(
            (consent.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        // Check if renewal is needed (within 30 days of expiration)
        const requiresRenewal =
          !isValid ||
          isExpired ||
          (daysUntilExpiration !== undefined && daysUntilExpiration <= 30);

        consentStatus[type] = {
          hasConsent: true,
          isValid,
          consentId: consent.id,
          status: consent.status,
          signedAt: consent.signedAt || undefined,
          expiresAt: consent.expirationDate,
          daysUntilExpiration,
          requiresRenewal,
          stateCode: consent.stateCode,
        };
      }

      // Check state-specific requirements if stateCode provided
      let stateRequirementsMet = true;
      let missingStateRequirements: string[] = [];

      if (input.stateCode) {
        const stateReqs = getStateSpecificRequirements(input.stateCode);
        if (stateReqs.requiresSpecificConsent) {
          const stateConsent = consents.find(
            (c) =>
              c.consentType === 'STATE_SPECIFIC' &&
              c.stateCode === input.stateCode &&
              c.status === 'SIGNED' &&
              (!c.expirationDate || c.expirationDate > now)
          );
          if (!stateConsent) {
            stateRequirementsMet = false;
            missingStateRequirements.push(`State-specific consent for ${input.stateCode}`);
          }
        }
      }

      // Determine overall validity
      const allConsentsValid = input.consentTypes.every(
        (type) => consentStatus[type]?.isValid
      );
      const canProceedWithTelehealth = allConsentsValid && stateRequirementsMet;

      return {
        patientId: input.patientId,
        canProceedWithTelehealth,
        allConsentsValid,
        stateRequirementsMet,
        missingStateRequirements,
        consents: consentStatus,
        recommendations: getConsentRecommendations(consentStatus, input.stateCode),
      };
    }),

  /**
   * Sign telehealth consent with digital signature
   */
  signConsent: protectedProcedure
    .input(
      z.object({
        consentId: z.string(),
        /** Base64 encoded signature image or signature data */
        signatureData: z.string(),
        /** Type of signature capture */
        signatureType: z.enum(['electronic', 'typed', 'drawn']),
        /** Name as typed by signer */
        signerName: z.string().min(1, 'Signer name is required'),
        /** IP address of signer (for audit) */
        signerIpAddress: z.string().optional(),
        /** Acknowledgment that consent was read */
        acknowledgedReading: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.acknowledgedReading) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You must acknowledge that you have read and understand the consent',
        });
      }

      const consent = await prisma.telehealthConsent.findFirst({
        where: {
          id: input.consentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!consent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Consent not found',
        });
      }

      if (consent.status === 'SIGNED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Consent has already been signed',
        });
      }

      if (consent.status === 'REVOKED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Consent has been revoked and cannot be signed',
        });
      }

      // Update consent with signature
      const updated = await prisma.telehealthConsent.update({
        where: { id: input.consentId },
        data: {
          status: 'SIGNED',
          signatureData: input.signatureData,
          signatureType: input.signatureType,
          signedAt: new Date(),
          signerName: input.signerName,
          signerIpAddress: input.signerIpAddress,
          viewedAt: consent.viewedAt || new Date(), // Mark as viewed if not already
        },
      });

      // Audit log with full details for compliance
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'UPDATE' as AuditAction,
        entityType: 'TelehealthConsent',
        entityId: input.consentId,
        metadata: {
          action: 'sign_consent',
          patientId: consent.patientId,
          consentType: consent.consentType,
          signatureType: input.signatureType,
          signerName: input.signerName,
          signerIpAddress: input.signerIpAddress,
          signedAt: new Date().toISOString(),
          consentFormVersion: consent.consentFormVersion,
        },
      });

      return {
        consentId: updated.id,
        status: 'SIGNED',
        signedAt: updated.signedAt,
        expirationDate: updated.expirationDate,
        patientName: consent.patient.demographics
          ? `${consent.patient.demographics.firstName} ${consent.patient.demographics.lastName}`
          : 'Unknown',
      };
    }),

  /**
   * Get consent details including full text and signature
   */
  getConsentDetails: protectedProcedure
    .input(
      z.object({
        consentId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const consent = await prisma.telehealthConsent.findFirst({
        where: {
          id: input.consentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: {
                select: { firstName: true, lastName: true, dateOfBirth: true },
              },
            },
          },
        },
      });

      if (!consent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Consent not found',
        });
      }

      // Mark as viewed if not already
      if (!consent.viewedAt) {
        await prisma.telehealthConsent.update({
          where: { id: input.consentId },
          data: { viewedAt: new Date() },
        });
      }

      return {
        id: consent.id,
        consentType: consent.consentType,
        status: consent.status,
        consentText: consent.consentText,
        consentFormVersion: consent.consentFormVersion,
        effectiveDate: consent.effectiveDate,
        expirationDate: consent.expirationDate,
        signedAt: consent.signedAt,
        signerName: consent.signerName,
        signatureType: consent.signatureType,
        // Don't expose raw signature data for security
        hasSignature: !!consent.signatureData,
        stateCode: consent.stateCode,
        stateRequirements: consent.stateRequirements,
        sentAt: consent.sentAt,
        viewedAt: consent.viewedAt || new Date(),
        patient: {
          id: consent.patientId,
          firstName: consent.patient.demographics?.firstName,
          lastName: consent.patient.demographics?.lastName,
          dateOfBirth: consent.patient.demographics?.dateOfBirth,
        },
      };
    }),

  /**
   * Renew an expiring or expired consent
   */
  renewConsent: protectedProcedure
    .input(
      z.object({
        consentId: z.string(),
        /** New expiration in days from now (default: 365) */
        expirationDays: z.number().min(1).max(730).optional().default(365),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const consent = await prisma.telehealthConsent.findFirst({
        where: {
          id: input.consentId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!consent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Consent not found',
        });
      }

      // Calculate new expiration date
      const newExpirationDate = new Date();
      newExpirationDate.setDate(newExpirationDate.getDate() + input.expirationDays);

      // Create a new consent record (preserve old one for audit trail)
      const newConsent = await prisma.telehealthConsent.create({
        data: {
          patientId: consent.patientId,
          organizationId: ctx.user.organizationId,
          consentType: consent.consentType,
          status: 'PENDING',
          consentFormVersion: consent.consentFormVersion,
          consentText: consent.consentText,
          effectiveDate: new Date(),
          expirationDate: newExpirationDate,
          stateCode: consent.stateCode,
          stateRequirements: consent.stateRequirements as Prisma.InputJsonValue | undefined,
          sentAt: new Date(),
        },
      });

      // Mark old consent as expired if it wasn't already
      if (consent.status === 'SIGNED') {
        await prisma.telehealthConsent.update({
          where: { id: consent.id },
          data: { status: 'EXPIRED' },
        });
      }

      // Audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'CREATE' as AuditAction,
        entityType: 'TelehealthConsent',
        entityId: newConsent.id,
        metadata: {
          action: 'renew_consent',
          previousConsentId: consent.id,
          patientId: consent.patientId,
          consentType: consent.consentType,
          newExpirationDate: newExpirationDate.toISOString(),
        },
      });

      return {
        consentId: newConsent.id,
        previousConsentId: consent.id,
        status: 'PENDING',
        expirationDate: newExpirationDate,
      };
    }),

  /**
   * Revoke a telehealth consent
   */
  revokeConsent: protectedProcedure
    .input(
      z.object({
        consentId: z.string(),
        reason: z.string().min(1, 'Revocation reason is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const consent = await prisma.telehealthConsent.findFirst({
        where: {
          id: input.consentId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!consent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Consent not found',
        });
      }

      if (consent.status === 'REVOKED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Consent has already been revoked',
        });
      }

      const updated = await prisma.telehealthConsent.update({
        where: { id: input.consentId },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: input.reason,
        },
      });

      // Audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'UPDATE' as AuditAction,
        entityType: 'TelehealthConsent',
        entityId: input.consentId,
        metadata: {
          action: 'revoke_consent',
          patientId: consent.patientId,
          consentType: consent.consentType,
          reason: input.reason,
          previousStatus: consent.status,
        },
      });

      return {
        consentId: updated.id,
        status: 'REVOKED',
        revokedAt: updated.revokedAt,
      };
    }),

  /**
   * List all consents for a patient
   */
  listPatientConsents: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        status: z.enum(['PENDING', 'SIGNED', 'DECLINED', 'EXPIRED', 'REVOKED']).optional(),
        includeExpired: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      const consents = await prisma.telehealthConsent.findMany({
        where: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          ...(input.status && { status: input.status }),
          ...(!input.includeExpired && {
            OR: [
              { expirationDate: null },
              { expirationDate: { gt: now } },
            ],
          }),
        },
        orderBy: { createdAt: 'desc' },
      });

      return consents.map((c) => ({
        id: c.id,
        consentType: c.consentType,
        status: c.status,
        effectiveDate: c.effectiveDate,
        expirationDate: c.expirationDate,
        signedAt: c.signedAt,
        signerName: c.signerName,
        stateCode: c.stateCode,
        isExpired: c.expirationDate ? c.expirationDate < now : false,
        createdAt: c.createdAt,
      }));
    }),

  /**
   * Block telehealth session if consent is invalid
   * Should be called before starting a telehealth session
   */
  validateSessionConsent: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        /** Required consent types for this session */
        requiredConsentTypes: z
          .array(z.enum(['GENERAL', 'HIPAA', 'RECORDING', 'STATE_SPECIFIC']))
          .optional()
          .default(['GENERAL']),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get session with patient info
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
                  demographics: { select: { firstName: true, lastName: true } },
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

      const patientId = session.appointment.patientId;
      const patientName = session.appointment.patient.demographics
        ? `${session.appointment.patient.demographics.firstName} ${session.appointment.patient.demographics.lastName}`
        : 'Unknown Patient';

      // Check all required consents
      const now = new Date();
      const validConsents: string[] = [];
      const invalidConsents: string[] = [];
      const missingConsents: string[] = [];

      for (const consentType of input.requiredConsentTypes) {
        const consent = await prisma.telehealthConsent.findFirst({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            consentType,
            status: 'SIGNED',
            OR: [
              { expirationDate: null },
              { expirationDate: { gt: now } },
            ],
          },
          orderBy: { signedAt: 'desc' },
        });

        if (!consent) {
          missingConsents.push(consentType);
        } else {
          validConsents.push(consentType);
        }
      }

      const canProceed = missingConsents.length === 0 && invalidConsents.length === 0;

      return {
        sessionId: input.sessionId,
        patientId,
        patientName,
        canProceed,
        validConsents,
        invalidConsents,
        missingConsents,
        message: canProceed
          ? 'All required consents are valid. Session can proceed.'
          : `Cannot proceed: Missing consent(s): ${missingConsents.join(', ')}`,
        blockReason: !canProceed
          ? missingConsents.length > 0
            ? 'missing_consent'
            : 'invalid_consent'
          : null,
      };
    }),

  /**
   * Get state-specific telehealth requirements
   */
  getStateRequirements: protectedProcedure
    .input(
      z.object({
        stateCode: z.string().length(2),
      })
    )
    .query(async ({ input }) => {
      return getStateSpecificRequirements(input.stateCode);
    }),
});
