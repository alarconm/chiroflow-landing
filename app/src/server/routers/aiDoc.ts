/**
 * AI Documentation Agent Router (Epic 32)
 *
 * Real-time AI documentation assistant that:
 * - Transcribes patient encounters with speaker diarization
 * - Generates SOAP notes from transcripts
 * - Suggests diagnosis and procedure codes
 * - Checks compliance
 * - Learns provider preferences
 */

import { z } from 'zod';
import { router, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { aiService } from '@/lib/ai-service';
import { Prisma } from '@prisma/client';

// ============================================
// US-316: Real-time encounter transcription
// ============================================

export const aiDocRouter = router({
  /**
   * Start a new transcription session for an encounter
   * Creates an AITranscription record in RECORDING status
   */
  startTranscription: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        mode: z.enum(['AMBIENT', 'DICTATION']).default('AMBIENT'),
        language: z.string().default('en-US'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, mode, language } = input;

      // Verify encounter exists and belongs to organization
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
            },
          },
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Check if there's already an active transcription for this encounter
      const existingActive = await ctx.prisma.aITranscription.findFirst({
        where: {
          encounterId,
          status: { in: ['RECORDING', 'PAUSED'] },
        },
      });

      if (existingActive) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An active transcription session already exists for this encounter',
        });
      }

      // Create new transcription record
      const transcription = await ctx.prisma.aITranscription.create({
        data: {
          encounterId,
          organizationId: ctx.user.organizationId,
          status: 'RECORDING',
          language,
          speakerCount: 2, // Default: provider + patient
          speakerLabels: {
            SPEAKER_1: 'provider',
            SPEAKER_2: 'patient',
          },
          segments: [],
          startedAt: new Date(),
        },
      });

      // Log the action
      await auditLog('AI_TRANSCRIPTION_START', 'AITranscription', {
        entityId: transcription.id,
        changes: { encounterId, mode, language },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        transcriptionId: transcription.id,
        status: 'RECORDING',
        mode,
        startedAt: transcription.startedAt,
        patientName: encounter.patient.demographics
          ? `${encounter.patient.demographics.firstName} ${encounter.patient.demographics.lastName}`
          : 'Patient',
      };
    }),

  /**
   * Stop transcription and finalize
   * Processes remaining audio and marks transcription as COMPLETED
   */
  stopTranscription: providerProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
        finalAudioData: z.string().optional(), // Base64 encoded final audio chunk
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { transcriptionId, finalAudioData } = input;

      // Get transcription
      const transcription = await ctx.prisma.aITranscription.findFirst({
        where: {
          id: transcriptionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!transcription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Transcription not found',
        });
      }

      if (transcription.status === 'COMPLETED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Transcription is already completed',
        });
      }

      // Process final audio if provided
      let finalTranscript = transcription.transcript || '';
      if (finalAudioData) {
        try {
          const result = await aiService.transcribeAudio(finalAudioData, 'audio/wav');
          if (result.text) {
            finalTranscript = finalTranscript
              ? `${finalTranscript}\n\n${result.text}`
              : result.text;
          }
        } catch (error) {
          console.error('Final transcription chunk error:', error);
        }
      }

      // Calculate duration
      const endedAt = new Date();
      const audioDuration = Math.round(
        (endedAt.getTime() - transcription.startedAt.getTime()) / 1000
      );

      // Update transcription record
      const updated = await ctx.prisma.aITranscription.update({
        where: { id: transcriptionId },
        data: {
          status: 'COMPLETED',
          transcript: finalTranscript,
          audioDuration,
          endedAt,
          processingMs: audioDuration * 1000,
        },
      });

      // Log the action
      await auditLog('AI_TRANSCRIPTION_STOP', 'AITranscription', {
        entityId: transcriptionId,
        changes: { audioDuration, transcriptLength: finalTranscript.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        transcriptionId: updated.id,
        status: 'COMPLETED',
        transcript: updated.transcript,
        audioDuration,
        endedAt,
      };
    }),

  /**
   * Pause an active transcription
   */
  pauseTranscription: providerProcedure
    .input(z.object({ transcriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { transcriptionId } = input;

      const transcription = await ctx.prisma.aITranscription.findFirst({
        where: {
          id: transcriptionId,
          organizationId: ctx.user.organizationId,
          status: 'RECORDING',
        },
      });

      if (!transcription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active transcription not found',
        });
      }

      const updated = await ctx.prisma.aITranscription.update({
        where: { id: transcriptionId },
        data: { status: 'PAUSED' },
      });

      return { transcriptionId: updated.id, status: 'PAUSED' };
    }),

  /**
   * Resume a paused transcription
   */
  resumeTranscription: providerProcedure
    .input(z.object({ transcriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { transcriptionId } = input;

      const transcription = await ctx.prisma.aITranscription.findFirst({
        where: {
          id: transcriptionId,
          organizationId: ctx.user.organizationId,
          status: 'PAUSED',
        },
      });

      if (!transcription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Paused transcription not found',
        });
      }

      const updated = await ctx.prisma.aITranscription.update({
        where: { id: transcriptionId },
        data: { status: 'RECORDING' },
      });

      return { transcriptionId: updated.id, status: 'RECORDING' };
    }),

  /**
   * Process an audio chunk during live transcription
   * Supports real-time transcription with speaker identification
   */
  processAudioChunk: providerProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
        audioData: z.string(), // Base64 encoded audio
        mimeType: z.string().default('audio/wav'),
        chunkIndex: z.number(),
        speakerHint: z.enum(['provider', 'patient', 'unknown']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { transcriptionId, audioData, mimeType, chunkIndex, speakerHint } = input;

      // Verify transcription is active
      const transcription = await ctx.prisma.aITranscription.findFirst({
        where: {
          id: transcriptionId,
          organizationId: ctx.user.organizationId,
          status: 'RECORDING',
        },
      });

      if (!transcription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active transcription not found',
        });
      }

      // Transcribe the audio chunk
      let transcriptText = '';
      let confidence = 0;
      try {
        const result = await aiService.transcribeAudio(audioData, mimeType);
        transcriptText = result.text;
        confidence = result.confidence;
      } catch (error) {
        console.error('Chunk transcription error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to transcribe audio chunk',
        });
      }

      // Determine speaker (simple heuristic - could be enhanced with ML)
      const speaker = speakerHint || detectSpeaker(transcriptText);

      // Create segment
      const segments = (transcription.segments as Array<{
        speaker: string;
        text: string;
        startTime: number;
        endTime: number;
        confidence: number;
        chunkIndex: number;
      }>) || [];

      const newSegment = {
        speaker,
        text: transcriptText,
        startTime: chunkIndex * 5, // Approximate timing
        endTime: (chunkIndex + 1) * 5,
        confidence,
        chunkIndex,
      };
      segments.push(newSegment);

      // Update transcript
      const currentTranscript = transcription.transcript || '';
      const updatedTranscript = currentTranscript
        ? `${currentTranscript}\n[${speaker.toUpperCase()}]: ${transcriptText}`
        : `[${speaker.toUpperCase()}]: ${transcriptText}`;

      // Detect medical terms in the new segment
      const medicalTerms = detectMedicalTerms(transcriptText);
      const existingTerms = (transcription.medicalTermsFound as string[]) || [];
      const allTerms = [...new Set([...existingTerms, ...medicalTerms])];

      // Update transcription record
      await ctx.prisma.aITranscription.update({
        where: { id: transcriptionId },
        data: {
          transcript: updatedTranscript,
          segments,
          medicalTermsFound: allTerms,
          accuracy: (transcription.accuracy || confidence + confidence) / 2, // Running average
        },
      });

      return {
        segment: newSegment,
        fullTranscript: updatedTranscript,
        medicalTermsDetected: medicalTerms,
      };
    }),

  /**
   * Get current transcription state
   */
  getTranscription: providerProcedure
    .input(z.object({ transcriptionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const transcription = await ctx.prisma.aITranscription.findFirst({
        where: {
          id: input.transcriptionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: {
            include: {
              patient: {
                include: {
                  demographics: true,
                },
              },
            },
          },
          draftNotes: {
            where: { status: { not: 'REJECTED' } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!transcription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Transcription not found',
        });
      }

      return transcription;
    }),

  /**
   * Get active transcription for an encounter
   */
  getActiveTranscription: providerProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const transcription = await ctx.prisma.aITranscription.findFirst({
        where: {
          encounterId: input.encounterId,
          organizationId: ctx.user.organizationId,
          status: { in: ['RECORDING', 'PAUSED'] },
        },
      });

      return transcription;
    }),

  /**
   * List transcriptions for an encounter
   */
  listTranscriptions: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        status: z.enum(['RECORDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PAUSED']).optional(),
        limit: z.number().min(1).max(100).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const transcriptions = await ctx.prisma.aITranscription.findMany({
        where: {
          encounterId: input.encounterId,
          organizationId: ctx.user.organizationId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });

      return transcriptions;
    }),

  /**
   * Update/edit transcript text
   * Allows provider to correct transcription errors
   */
  updateTranscript: providerProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
        transcript: z.string(),
        correctedTerms: z
          .array(
            z.object({
              original: z.string(),
              corrected: z.string(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { transcriptionId, transcript, correctedTerms } = input;

      const transcription = await ctx.prisma.aITranscription.findFirst({
        where: {
          id: transcriptionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!transcription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Transcription not found',
        });
      }

      // Merge corrections with existing
      const existingCorrections = (transcription.correctedTerms as Array<{ original: string; corrected: string }>) || [];
      const allCorrections = correctedTerms
        ? [...existingCorrections, ...correctedTerms]
        : existingCorrections;

      const updated = await ctx.prisma.aITranscription.update({
        where: { id: transcriptionId },
        data: {
          transcript,
          correctedTerms: allCorrections,
        },
      });

      // Log the edit
      await auditLog('AI_TRANSCRIPTION_EDIT', 'AITranscription', {
        entityId: transcriptionId,
        changes: {
          action: 'edit_transcript',
          correctedTermsCount: correctedTerms?.length || 0,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Update speaker labels for diarization
   */
  updateSpeakerLabels: providerProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
        speakerLabels: z.record(z.string(), z.string()), // { "SPEAKER_1": "Dr. Smith", "SPEAKER_2": "John Doe" }
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { transcriptionId, speakerLabels } = input;

      const transcription = await ctx.prisma.aITranscription.findFirst({
        where: {
          id: transcriptionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!transcription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Transcription not found',
        });
      }

      const updated = await ctx.prisma.aITranscription.update({
        where: { id: transcriptionId },
        data: {
          speakerLabels,
          speakerCount: Object.keys(speakerLabels).length,
        },
      });

      return updated;
    }),

  /**
   * Toggle ambient listening mode
   * Ambient mode continuously listens without explicit start/stop
   */
  toggleAmbientMode: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, enabled } = input;

      // Verify encounter
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

      if (enabled) {
        // Start ambient transcription
        const existing = await ctx.prisma.aITranscription.findFirst({
          where: {
            encounterId,
            status: { in: ['RECORDING', 'PAUSED'] },
          },
        });

        if (existing) {
          // Resume if paused, otherwise already active
          if (existing.status === 'PAUSED') {
            await ctx.prisma.aITranscription.update({
              where: { id: existing.id },
              data: { status: 'RECORDING' },
            });
          }
          return { transcriptionId: existing.id, ambientMode: true };
        }

        // Create new ambient transcription
        const transcription = await ctx.prisma.aITranscription.create({
          data: {
            encounterId,
            organizationId: ctx.user.organizationId,
            status: 'RECORDING',
            language: 'en-US',
            speakerCount: 2,
            speakerLabels: {
              SPEAKER_1: 'provider',
              SPEAKER_2: 'patient',
            },
            segments: [],
            startedAt: new Date(),
          },
        });

        await auditLog('AI_AMBIENT_MODE_START', 'AITranscription', {
          entityId: transcription.id,
          changes: { encounterId },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return { transcriptionId: transcription.id, ambientMode: true };
      } else {
        // Stop ambient transcription
        const active = await ctx.prisma.aITranscription.findFirst({
          where: {
            encounterId,
            status: 'RECORDING',
          },
        });

        if (active) {
          await ctx.prisma.aITranscription.update({
            where: { id: active.id },
            data: {
              status: 'COMPLETED',
              endedAt: new Date(),
            },
          });

          await auditLog('AI_AMBIENT_MODE_STOP', 'AITranscription', {
            entityId: active.id,
            changes: { encounterId },
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          });

          return { transcriptionId: active.id, ambientMode: false };
        }

        return { transcriptionId: null, ambientMode: false };
      }
    }),

  /**
   * Get transcription statistics for an organization
   */
  getStats: providerProcedure.query(async ({ ctx }) => {
    const [total, completed, avgDuration, avgAccuracy] = await Promise.all([
      ctx.prisma.aITranscription.count({
        where: { organizationId: ctx.user.organizationId },
      }),
      ctx.prisma.aITranscription.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
        },
      }),
      ctx.prisma.aITranscription.aggregate({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
        },
        _avg: { audioDuration: true },
      }),
      ctx.prisma.aITranscription.aggregate({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          accuracy: { not: null },
        },
        _avg: { accuracy: true },
      }),
    ]);

    return {
      totalTranscriptions: total,
      completedTranscriptions: completed,
      averageDurationSeconds: avgDuration._avg.audioDuration || 0,
      averageAccuracy: avgAccuracy._avg.accuracy || 0,
    };
  }),

  // ============================================
  // US-317: AI SOAP note generation
  // ============================================

  /**
   * Generate SOAP note from encounter transcript
   * Main entry point for AI SOAP note generation
   */
  generateSOAP: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        transcriptionId: z.string().optional(), // If not provided, uses latest completed transcription
        includeStyleMatching: z.boolean().default(true), // Match provider's documentation style
        previousNoteId: z.string().optional(), // For pull-forward functionality
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, transcriptionId, includeStyleMatching, previousNoteId } = input;
      const startTime = Date.now();

      // Get encounter with patient info
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
            },
          },
          provider: true,
          soapNote: true,
          appointment: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Get transcription (specified or latest completed)
      let transcription;
      if (transcriptionId) {
        transcription = await ctx.prisma.aITranscription.findFirst({
          where: {
            id: transcriptionId,
            encounterId,
            organizationId: ctx.user.organizationId,
          },
        });
      } else {
        transcription = await ctx.prisma.aITranscription.findFirst({
          where: {
            encounterId,
            organizationId: ctx.user.organizationId,
            status: 'COMPLETED',
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (!transcription?.transcript) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No completed transcription found for this encounter',
        });
      }

      // Get previous visit note for context (if requested)
      let previousNote = null;
      if (previousNoteId) {
        previousNote = await ctx.prisma.sOAPNote.findFirst({
          where: {
            id: previousNoteId,
            encounter: {
              organizationId: ctx.user.organizationId,
            },
          },
        });
      } else {
        // Get most recent previous SOAP note for this patient
        const previousEncounter = await ctx.prisma.encounter.findFirst({
          where: {
            patientId: encounter.patientId,
            organizationId: ctx.user.organizationId,
            id: { not: encounterId },
            status: { in: ['COMPLETED', 'SIGNED'] },
          },
          orderBy: { encounterDate: 'desc' },
          include: { soapNote: true },
        });
        previousNote = previousEncounter?.soapNote ?? null;
      }

      // Get provider preferences if style matching enabled
      let providerPreferences: Record<string, unknown>[] = [];
      if (includeStyleMatching && encounter.providerId) {
        const preferences = await ctx.prisma.providerPreference.findMany({
          where: {
            providerId: encounter.providerId,
            isActive: true,
            confidenceScore: { gte: 0.5 },
          },
          orderBy: { confidenceScore: 'desc' },
        });
        providerPreferences = preferences.map(p => ({
          category: p.category,
          key: p.preferenceKey,
          value: p.preferenceValue,
        }));
      }

      // Build patient info
      const patientInfo = {
        name: encounter.patient.demographics
          ? `${encounter.patient.demographics.firstName} ${encounter.patient.demographics.lastName}`
          : 'Patient',
        age: encounter.patient.demographics?.dateOfBirth
          ? calculateAge(encounter.patient.demographics.dateOfBirth)
          : 0,
        gender: encounter.patient.demographics?.gender || 'Unknown',
      };

      // Generate SOAP note using AI service
      const soapResult = await aiService.generateSOAPSuggestion({
        patientInfo,
        chiefComplaint: encounter.chiefComplaint || '',
        encounterType: encounter.encounterType,
        transcription: transcription.transcript,
        previousVisit: previousNote
          ? {
              subjective: previousNote.subjective || undefined,
              objective: previousNote.objective || undefined,
              assessment: previousNote.assessment || undefined,
              plan: previousNote.plan || undefined,
            }
          : undefined,
      });

      // Apply provider style preferences if available
      let styleMatchScore = 0;
      const styleElements: string[] = [];
      if (includeStyleMatching && providerPreferences.length > 0) {
        const styleResult = applyProviderStyle(soapResult, providerPreferences);
        styleMatchScore = styleResult.matchScore;
        styleElements.push(...styleResult.appliedElements);
        // Update the SOAP result with styled content
        if (styleResult.subjective) soapResult.subjective = styleResult.subjective;
        if (styleResult.objective) soapResult.objective = styleResult.objective;
        if (styleResult.assessment) soapResult.assessment = styleResult.assessment;
        if (styleResult.plan) soapResult.plan = styleResult.plan;
      }

      const processingTime = Date.now() - startTime;

      // Create draft note record
      const draftNote = await ctx.prisma.aIDraftNote.create({
        data: {
          encounterId,
          organizationId: ctx.user.organizationId,
          transcriptionId: transcription.id,
          status: 'PENDING_REVIEW',
          subjective: soapResult.subjective || null,
          objective: soapResult.objective || null,
          assessment: soapResult.assessment || null,
          plan: soapResult.plan || null,
          soapJson: {
            subjective: soapResult.subjective || null,
            objective: soapResult.objective || null,
            assessment: soapResult.assessment || null,
            plan: soapResult.plan || null,
          },
          subjectiveConfidence: soapResult.confidence,
          objectiveConfidence: soapResult.confidence,
          assessmentConfidence: soapResult.confidence,
          planConfidence: soapResult.confidence,
          overallConfidence: soapResult.confidence,
          styleMatchScore: styleMatchScore || null,
          styleElements: styleElements.length > 0 ? styleElements : undefined,
          aiModelUsed: aiService.getProviderName(),
          processingTimeMs: processingTime,
        },
      });

      // Log the action
      await auditLog('AI_SOAP_GENERATE', 'AIDraftNote', {
        entityId: draftNote.id,
        changes: {
          encounterId,
          transcriptionId: transcription.id,
          confidence: soapResult.confidence,
          styleMatchScore,
          processingTimeMs: processingTime,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        draftNoteId: draftNote.id,
        status: 'PENDING_REVIEW',
        subjective: draftNote.subjective,
        objective: draftNote.objective,
        assessment: draftNote.assessment,
        plan: draftNote.plan,
        confidence: soapResult.confidence,
        styleMatchScore,
        processingTimeMs: processingTime,
      };
    }),

  /**
   * Get a draft SOAP note by ID
   */
  getDraftNote: providerProcedure
    .input(z.object({ draftNoteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const draftNote = await ctx.prisma.aIDraftNote.findFirst({
        where: {
          id: input.draftNoteId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: {
            include: {
              patient: {
                include: {
                  demographics: true,
                },
              },
              provider: true,
            },
          },
          transcription: true,
        },
      });

      if (!draftNote) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft note not found',
        });
      }

      return draftNote;
    }),

  /**
   * List draft SOAP notes for an encounter
   */
  listDraftNotes: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        status: z
          .enum(['GENERATING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EDITED', 'APPLIED'])
          .optional(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const draftNotes = await ctx.prisma.aIDraftNote.findMany({
        where: {
          encounterId: input.encounterId,
          organizationId: ctx.user.organizationId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: {
          transcription: {
            select: {
              id: true,
              createdAt: true,
              audioDuration: true,
            },
          },
        },
      });

      return draftNotes;
    }),

  /**
   * Update/edit a draft SOAP note
   * Tracks edits for provider preference learning
   */
  updateDraftNote: providerProcedure
    .input(
      z.object({
        draftNoteId: z.string(),
        subjective: z.string().optional(),
        objective: z.string().optional(),
        assessment: z.string().optional(),
        plan: z.string().optional(),
        editReason: z.string().optional(), // Optional reason for the edit
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { draftNoteId, subjective, objective, assessment, plan, editReason } = input;

      const draftNote = await ctx.prisma.aIDraftNote.findFirst({
        where: {
          id: draftNoteId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!draftNote) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft note not found',
        });
      }

      // Track what was edited for learning
      const edits: { section: string; original: string | null; edited: string | null }[] = [];
      if (subjective !== undefined && subjective !== draftNote.subjective) {
        edits.push({ section: 'subjective', original: draftNote.subjective, edited: subjective });
      }
      if (objective !== undefined && objective !== draftNote.objective) {
        edits.push({ section: 'objective', original: draftNote.objective, edited: objective });
      }
      if (assessment !== undefined && assessment !== draftNote.assessment) {
        edits.push({ section: 'assessment', original: draftNote.assessment, edited: assessment });
      }
      if (plan !== undefined && plan !== draftNote.plan) {
        edits.push({ section: 'plan', original: draftNote.plan, edited: plan });
      }

      // Update edit reasons array
      const existingReasons = (draftNote.editReasons as string[]) || [];
      if (editReason) {
        existingReasons.push(editReason);
      }

      // Update edited content tracking
      const editedContent = (draftNote.editedContent as Record<string, unknown>) || {};
      for (const edit of edits) {
        editedContent[edit.section] = {
          original: edit.original,
          edited: edit.edited,
          editedAt: new Date().toISOString(),
        };
      }

      const updated = await ctx.prisma.aIDraftNote.update({
        where: { id: draftNoteId },
        data: {
          ...(subjective !== undefined ? { subjective } : {}),
          ...(objective !== undefined ? { objective } : {}),
          ...(assessment !== undefined ? { assessment } : {}),
          ...(plan !== undefined ? { plan } : {}),
          status: 'EDITED',
          editCount: draftNote.editCount + 1,
          editedContent: editedContent as Prisma.InputJsonValue,
          editReasons: existingReasons,
          soapJson: {
            subjective: subjective ?? draftNote.subjective,
            objective: objective ?? draftNote.objective,
            assessment: assessment ?? draftNote.assessment,
            plan: plan ?? draftNote.plan,
          },
        },
      });

      // Log the edit for learning purposes
      await auditLog('AI_SOAP_EDIT', 'AIDraftNote', {
        entityId: draftNoteId,
        changes: {
          editedSections: edits.map(e => e.section),
          editReason,
          editCount: updated.editCount,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Approve a draft SOAP note
   * Marks it ready for application to the encounter
   */
  approveDraftNote: providerProcedure
    .input(
      z.object({
        draftNoteId: z.string(),
        reviewNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { draftNoteId, reviewNotes } = input;

      const draftNote = await ctx.prisma.aIDraftNote.findFirst({
        where: {
          id: draftNoteId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!draftNote) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft note not found',
        });
      }

      const updated = await ctx.prisma.aIDraftNote.update({
        where: { id: draftNoteId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedByUserId: ctx.user.id,
          reviewNotes,
        },
      });

      await auditLog('AI_SOAP_APPROVE', 'AIDraftNote', {
        entityId: draftNoteId,
        changes: { status: 'APPROVED', reviewNotes },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Reject a draft SOAP note
   */
  rejectDraftNote: providerProcedure
    .input(
      z.object({
        draftNoteId: z.string(),
        rejectionReason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { draftNoteId, rejectionReason } = input;

      const draftNote = await ctx.prisma.aIDraftNote.findFirst({
        where: {
          id: draftNoteId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!draftNote) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft note not found',
        });
      }

      const updated = await ctx.prisma.aIDraftNote.update({
        where: { id: draftNoteId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedByUserId: ctx.user.id,
          reviewNotes: rejectionReason,
        },
      });

      await auditLog('AI_SOAP_REJECT', 'AIDraftNote', {
        entityId: draftNoteId,
        changes: { status: 'REJECTED', rejectionReason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Apply approved draft SOAP note to the encounter
   * Creates or updates the SOAPNote record on the encounter
   */
  applyDraftNote: providerProcedure
    .input(z.object({ draftNoteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { draftNoteId } = input;

      const draftNote = await ctx.prisma.aIDraftNote.findFirst({
        where: {
          id: draftNoteId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: {
            include: { soapNote: true },
          },
        },
      });

      if (!draftNote) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft note not found',
        });
      }

      if (draftNote.status !== 'APPROVED' && draftNote.status !== 'EDITED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Draft note must be approved or edited before applying',
        });
      }

      // Update or create SOAP note on the encounter
      let soapNote;
      if (draftNote.encounter.soapNote) {
        // Update existing
        soapNote = await ctx.prisma.sOAPNote.update({
          where: { id: draftNote.encounter.soapNote.id },
          data: {
            subjective: draftNote.subjective,
            objective: draftNote.objective,
            assessment: draftNote.assessment,
            plan: draftNote.plan,
            subjectiveJson: draftNote.soapJson as Prisma.InputJsonValue || undefined,
          },
        });
      } else {
        // Create new
        soapNote = await ctx.prisma.sOAPNote.create({
          data: {
            encounterId: draftNote.encounterId,
            subjective: draftNote.subjective,
            objective: draftNote.objective,
            assessment: draftNote.assessment,
            plan: draftNote.plan,
            subjectiveJson: draftNote.soapJson as Prisma.InputJsonValue || undefined,
          },
        });
      }

      // Mark draft note as applied
      await ctx.prisma.aIDraftNote.update({
        where: { id: draftNoteId },
        data: { status: 'APPLIED' },
      });

      await auditLog('AI_SOAP_APPLY', 'SOAPNote', {
        entityId: soapNote.id,
        changes: {
          draftNoteId,
          encounterId: draftNote.encounterId,
          action: draftNote.encounter.soapNote ? 'updated' : 'created',
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        soapNoteId: soapNote.id,
        applied: true,
        draftNoteStatus: 'APPLIED',
      };
    }),

  /**
   * Regenerate SOAP note with different parameters
   * Useful when provider wants a fresh generation
   */
  regenerateSOAP: providerProcedure
    .input(
      z.object({
        draftNoteId: z.string(),
        additionalContext: z.string().optional(), // Extra instructions for generation
        focusAreas: z.array(z.enum(['subjective', 'objective', 'assessment', 'plan'])).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { draftNoteId, additionalContext, focusAreas } = input;

      const existingDraft = await ctx.prisma.aIDraftNote.findFirst({
        where: {
          id: draftNoteId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          transcription: true,
          encounter: {
            include: {
              patient: {
                include: { demographics: true },
              },
              provider: true,
            },
          },
        },
      });

      if (!existingDraft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft note not found',
        });
      }

      if (!existingDraft.transcription?.transcript) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Original transcription not found',
        });
      }

      const startTime = Date.now();

      // Build enhanced context
      const patientInfo = {
        name: existingDraft.encounter.patient.demographics
          ? `${existingDraft.encounter.patient.demographics.firstName} ${existingDraft.encounter.patient.demographics.lastName}`
          : 'Patient',
        age: existingDraft.encounter.patient.demographics?.dateOfBirth
          ? calculateAge(existingDraft.encounter.patient.demographics.dateOfBirth)
          : 0,
        gender: existingDraft.encounter.patient.demographics?.gender || 'Unknown',
      };

      // Add additional context to transcription if provided
      let enhancedTranscript = existingDraft.transcription.transcript;
      if (additionalContext) {
        enhancedTranscript += `\n\n[Additional Provider Notes]: ${additionalContext}`;
      }

      // Generate new SOAP
      const soapResult = await aiService.generateSOAPSuggestion({
        patientInfo,
        chiefComplaint: existingDraft.encounter.chiefComplaint || '',
        encounterType: existingDraft.encounter.encounterType,
        transcription: enhancedTranscript,
      });

      const processingTime = Date.now() - startTime;

      // Determine which sections to update based on focusAreas
      const updateData: Record<string, unknown> = {
        status: 'PENDING_REVIEW',
        aiModelUsed: aiService.getProviderName(),
        processingTimeMs: processingTime,
        overallConfidence: soapResult.confidence,
      };

      if (!focusAreas || focusAreas.length === 0 || focusAreas.includes('subjective')) {
        updateData.subjective = soapResult.subjective;
        updateData.subjectiveConfidence = soapResult.confidence;
      }
      if (!focusAreas || focusAreas.length === 0 || focusAreas.includes('objective')) {
        updateData.objective = soapResult.objective;
        updateData.objectiveConfidence = soapResult.confidence;
      }
      if (!focusAreas || focusAreas.length === 0 || focusAreas.includes('assessment')) {
        updateData.assessment = soapResult.assessment;
        updateData.assessmentConfidence = soapResult.confidence;
      }
      if (!focusAreas || focusAreas.length === 0 || focusAreas.includes('plan')) {
        updateData.plan = soapResult.plan;
        updateData.planConfidence = soapResult.confidence;
      }

      // Update SOAP JSON with current values
      updateData.soapJson = {
        subjective: (updateData.subjective as string) ?? existingDraft.subjective,
        objective: (updateData.objective as string) ?? existingDraft.objective,
        assessment: (updateData.assessment as string) ?? existingDraft.assessment,
        plan: (updateData.plan as string) ?? existingDraft.plan,
      };

      const updated = await ctx.prisma.aIDraftNote.update({
        where: { id: draftNoteId },
        data: updateData,
      });

      await auditLog('AI_SOAP_REGENERATE', 'AIDraftNote', {
        entityId: draftNoteId,
        changes: {
          focusAreas,
          additionalContext: additionalContext ? 'provided' : 'none',
          processingTimeMs: processingTime,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        draftNoteId: updated.id,
        status: 'PENDING_REVIEW',
        subjective: updated.subjective,
        objective: updated.objective,
        assessment: updated.assessment,
        plan: updated.plan,
        confidence: soapResult.confidence,
        processingTimeMs: processingTime,
        regeneratedSections: focusAreas || ['subjective', 'objective', 'assessment', 'plan'],
      };
    }),

  /**
   * Get SOAP generation statistics
   */
  getSOAPStats: providerProcedure.query(async ({ ctx }) => {
    const [total, approved, rejected, avgConfidence, avgEdits] = await Promise.all([
      ctx.prisma.aIDraftNote.count({
        where: { organizationId: ctx.user.organizationId },
      }),
      ctx.prisma.aIDraftNote.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['APPROVED', 'APPLIED'] },
        },
      }),
      ctx.prisma.aIDraftNote.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'REJECTED',
        },
      }),
      ctx.prisma.aIDraftNote.aggregate({
        where: {
          organizationId: ctx.user.organizationId,
          overallConfidence: { not: null },
        },
        _avg: { overallConfidence: true },
      }),
      ctx.prisma.aIDraftNote.aggregate({
        where: {
          organizationId: ctx.user.organizationId,
        },
        _avg: { editCount: true },
      }),
    ]);

    const acceptanceRate = total > 0 ? ((approved / total) * 100).toFixed(1) : '0';

    return {
      totalDraftNotes: total,
      approvedCount: approved,
      rejectedCount: rejected,
      acceptanceRate: `${acceptanceRate}%`,
      averageConfidence: avgConfidence._avg.overallConfidence || 0,
      averageEditsPerNote: avgEdits._avg.editCount || 0,
    };
  }),

  // ============================================
  // US-318: Intelligent code suggestion
  // ============================================

  /**
   * Suggest diagnosis and procedure codes based on documentation
   * Main entry point for AI code suggestion
   */
  suggestCodes: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        draftNoteId: z.string().optional(), // If not provided, uses encounter's SOAP note
        includeModifiers: z.boolean().default(true),
        optimizeSpecificity: z.boolean().default(true), // Suggest more specific codes
        learnFromProvider: z.boolean().default(true), // Learn from acceptance patterns
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, draftNoteId, includeModifiers, optimizeSpecificity, learnFromProvider } = input;
      const startTime = Date.now();

      // Get encounter with SOAP note
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
            },
          },
          provider: true,
          soapNote: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Get SOAP content (from draft or encounter)
      let soapContent = '';
      if (draftNoteId) {
        const draftNote = await ctx.prisma.aIDraftNote.findFirst({
          where: {
            id: draftNoteId,
            organizationId: ctx.user.organizationId,
          },
        });
        if (draftNote) {
          soapContent = buildSOAPString(draftNote);
        }
      } else if (encounter.soapNote) {
        soapContent = buildSOAPString(encounter.soapNote);
      }

      if (!soapContent) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No SOAP note found for this encounter. Generate or create a SOAP note first.',
        });
      }

      // Get provider's past acceptance patterns for learning
      let providerAcceptancePatterns: Record<string, { accepted: number; rejected: number }> = {};
      if (learnFromProvider && encounter.providerId) {
        const pastSuggestions = await ctx.prisma.aICodeSuggestion.findMany({
          where: {
            encounter: {
              providerId: encounter.providerId,
              organizationId: ctx.user.organizationId,
            },
            status: { in: ['ACCEPTED', 'REJECTED', 'MODIFIED'] },
          },
          select: {
            suggestedCode: true,
            status: true,
            codeType: true,
          },
          take: 500, // Last 500 suggestions
        });

        // Build acceptance patterns
        for (const suggestion of pastSuggestions) {
          const key = `${suggestion.codeType}:${suggestion.suggestedCode}`;
          if (!providerAcceptancePatterns[key]) {
            providerAcceptancePatterns[key] = { accepted: 0, rejected: 0 };
          }
          if (suggestion.status === 'ACCEPTED' || suggestion.status === 'MODIFIED') {
            providerAcceptancePatterns[key].accepted++;
          } else {
            providerAcceptancePatterns[key].rejected++;
          }
        }
      }

      // Call AI service for code suggestions
      const codeResult = await aiService.suggestBillingCodes(soapContent, encounter.encounterType);
      const processingTime = Date.now() - startTime;

      // Process ICD-10 suggestions
      const icd10Suggestions: AICodeSuggestionData[] = [];
      for (let i = 0; i < codeResult.icd10.length; i++) {
        const suggestion = codeResult.icd10[i];
        const patternKey = `ICD10:${suggestion.code}`;
        const pattern = providerAcceptancePatterns[patternKey];

        // Adjust confidence based on provider patterns
        let adjustedConfidence = suggestion.confidence;
        if (pattern) {
          const acceptanceRate = pattern.accepted / (pattern.accepted + pattern.rejected);
          adjustedConfidence = suggestion.confidence * 0.7 + acceptanceRate * 0.3;
        }

        // Check specificity
        const specificityIssue = optimizeSpecificity ? checkCodeSpecificity(suggestion.code, 'ICD10') : null;

        // Check for upcoding/downcoding risk
        const codingRisk = assessCodingRisk(suggestion.code, soapContent, 'ICD10');

        icd10Suggestions.push({
          codeType: 'ICD10',
          suggestedCode: suggestion.code,
          codeDescription: suggestion.description,
          reasoning: suggestion.rationale,
          confidence: adjustedConfidence,
          rank: i + 1,
          codeValid: true,
          specificityOk: !specificityIssue,
          alternatives: specificityIssue?.alternatives || [],
          upcodingRisk: codingRisk.upcodingRisk,
          downcodingRisk: codingRisk.downcodingRisk,
          auditRisk: codingRisk.auditRisk,
          isChiroCommon: suggestion.isChiroCommon || false,
          relevantText: extractRelevantText(soapContent, suggestion.code),
        });
      }

      // Process CPT suggestions
      const cptSuggestions: AICodeSuggestionData[] = [];
      for (let i = 0; i < codeResult.cpt.length; i++) {
        const suggestion = codeResult.cpt[i];
        const patternKey = `CPT:${suggestion.code}`;
        const pattern = providerAcceptancePatterns[patternKey];

        // Adjust confidence based on provider patterns
        let adjustedConfidence = suggestion.confidence;
        if (pattern) {
          const acceptanceRate = pattern.accepted / (pattern.accepted + pattern.rejected);
          adjustedConfidence = suggestion.confidence * 0.7 + acceptanceRate * 0.3;
        }

        // Get modifier suggestions if enabled
        const modifiers = includeModifiers ? suggestModifiers(suggestion.code, soapContent) : [];

        // Check for coding risk
        const codingRisk = assessCodingRisk(suggestion.code, soapContent, 'CPT');

        cptSuggestions.push({
          codeType: 'CPT',
          suggestedCode: suggestion.code,
          codeDescription: suggestion.description,
          reasoning: suggestion.rationale,
          confidence: adjustedConfidence,
          rank: i + 1,
          codeValid: true,
          specificityOk: true,
          modifiersNeeded: modifiers,
          alternatives: [],
          upcodingRisk: codingRisk.upcodingRisk,
          downcodingRisk: codingRisk.downcodingRisk,
          auditRisk: codingRisk.auditRisk,
          isChiroCommon: suggestion.isChiroCommon || false,
          relevantText: extractRelevantText(soapContent, suggestion.code),
        });
      }

      // Store suggestions in database
      const createdSuggestions = [];
      for (const icd of icd10Suggestions) {
        const created = await ctx.prisma.aICodeSuggestion.create({
          data: {
            encounterId,
            organizationId: ctx.user.organizationId,
            status: 'PENDING',
            codeType: icd.codeType,
            suggestedCode: icd.suggestedCode,
            codeDescription: icd.codeDescription,
            reasoning: icd.reasoning,
            confidence: icd.confidence,
            rank: icd.rank,
            codeValid: icd.codeValid,
            specificityOk: icd.specificityOk,
            alternatives: icd.alternatives.length > 0 ? icd.alternatives : undefined,
            upcodingRisk: icd.upcodingRisk,
            downcodingRisk: icd.downcodingRisk,
            auditRisk: icd.auditRisk,
            relevantText: icd.relevantText,
            aiModelUsed: aiService.getProviderName(),
            processingTimeMs: processingTime,
          },
        });
        createdSuggestions.push(created);
      }

      for (const cpt of cptSuggestions) {
        const created = await ctx.prisma.aICodeSuggestion.create({
          data: {
            encounterId,
            organizationId: ctx.user.organizationId,
            status: 'PENDING',
            codeType: cpt.codeType,
            suggestedCode: cpt.suggestedCode,
            codeDescription: cpt.codeDescription,
            reasoning: cpt.reasoning,
            confidence: cpt.confidence,
            rank: cpt.rank,
            codeValid: cpt.codeValid,
            specificityOk: cpt.specificityOk,
            modifiersNeeded: cpt.modifiersNeeded && cpt.modifiersNeeded.length > 0 ? cpt.modifiersNeeded : undefined,
            alternatives: cpt.alternatives.length > 0 ? cpt.alternatives : undefined,
            upcodingRisk: cpt.upcodingRisk,
            downcodingRisk: cpt.downcodingRisk,
            auditRisk: cpt.auditRisk,
            relevantText: cpt.relevantText,
            aiModelUsed: aiService.getProviderName(),
            processingTimeMs: processingTime,
          },
        });
        createdSuggestions.push(created);
      }

      // Log the action
      await auditLog('AI_CODE_SUGGEST', 'AICodeSuggestion', {
        entityId: encounterId,
        changes: {
          icd10Count: icd10Suggestions.length,
          cptCount: cptSuggestions.length,
          processingTimeMs: processingTime,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        encounterId,
        icd10: icd10Suggestions,
        cpt: cptSuggestions,
        processingTimeMs: processingTime,
        suggestionIds: createdSuggestions.map(s => s.id),
      };
    }),

  /**
   * Get code suggestions for an encounter
   */
  getCodeSuggestions: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'MODIFIED']).optional(),
        codeType: z.enum(['ICD10', 'CPT', 'MODIFIER']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const suggestions = await ctx.prisma.aICodeSuggestion.findMany({
        where: {
          encounterId: input.encounterId,
          organizationId: ctx.user.organizationId,
          ...(input.status ? { status: input.status } : {}),
          ...(input.codeType ? { codeType: input.codeType } : {}),
        },
        orderBy: [{ codeType: 'asc' }, { rank: 'asc' }],
      });

      return suggestions;
    }),

  /**
   * Accept a code suggestion
   * Tracks acceptance for provider learning
   */
  acceptCodeSuggestion: providerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suggestionId } = input;

      const suggestion = await ctx.prisma.aICodeSuggestion.findFirst({
        where: {
          id: suggestionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Code suggestion not found',
        });
      }

      const updated = await ctx.prisma.aICodeSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });

      await auditLog('AI_CODE_ACCEPT', 'AICodeSuggestion', {
        entityId: suggestionId,
        changes: {
          code: suggestion.suggestedCode,
          codeType: suggestion.codeType,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Reject a code suggestion
   * Tracks rejection for provider learning
   */
  rejectCodeSuggestion: providerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suggestionId, reason } = input;

      const suggestion = await ctx.prisma.aICodeSuggestion.findFirst({
        where: {
          id: suggestionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Code suggestion not found',
        });
      }

      const updated = await ctx.prisma.aICodeSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          modifyReason: reason,
        },
      });

      await auditLog('AI_CODE_REJECT', 'AICodeSuggestion', {
        entityId: suggestionId,
        changes: {
          code: suggestion.suggestedCode,
          codeType: suggestion.codeType,
          reason,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Modify and accept a code suggestion
   * Provider accepts but uses a different code
   */
  modifyCodeSuggestion: providerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        modifiedCode: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suggestionId, modifiedCode, reason } = input;

      const suggestion = await ctx.prisma.aICodeSuggestion.findFirst({
        where: {
          id: suggestionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Code suggestion not found',
        });
      }

      const updated = await ctx.prisma.aICodeSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: 'MODIFIED',
          acceptedAt: new Date(),
          modifiedCode,
          modifyReason: reason,
        },
      });

      await auditLog('AI_CODE_MODIFY', 'AICodeSuggestion', {
        entityId: suggestionId,
        changes: {
          originalCode: suggestion.suggestedCode,
          modifiedCode,
          codeType: suggestion.codeType,
          reason,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Bulk accept all pending code suggestions for an encounter
   */
  acceptAllCodeSuggestions: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        codeType: z.enum(['ICD10', 'CPT', 'MODIFIER']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, codeType } = input;

      const result = await ctx.prisma.aICodeSuggestion.updateMany({
        where: {
          encounterId,
          organizationId: ctx.user.organizationId,
          status: 'PENDING',
          ...(codeType ? { codeType } : {}),
        },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });

      await auditLog('AI_CODE_ACCEPT_ALL', 'AICodeSuggestion', {
        entityId: encounterId,
        changes: {
          count: result.count,
          codeType: codeType || 'all',
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { acceptedCount: result.count };
    }),

  /**
   * Get code suggestion statistics
   */
  getCodeStats: providerProcedure.query(async ({ ctx }) => {
    const [total, accepted, rejected, modified, avgConfidence] = await Promise.all([
      ctx.prisma.aICodeSuggestion.count({
        where: { organizationId: ctx.user.organizationId },
      }),
      ctx.prisma.aICodeSuggestion.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'ACCEPTED',
        },
      }),
      ctx.prisma.aICodeSuggestion.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'REJECTED',
        },
      }),
      ctx.prisma.aICodeSuggestion.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'MODIFIED',
        },
      }),
      ctx.prisma.aICodeSuggestion.aggregate({
        where: {
          organizationId: ctx.user.organizationId,
        },
        _avg: { confidence: true },
      }),
    ]);

    // Get ICD-10 vs CPT breakdown
    const [icd10Count, cptCount] = await Promise.all([
      ctx.prisma.aICodeSuggestion.count({
        where: { organizationId: ctx.user.organizationId, codeType: 'ICD10' },
      }),
      ctx.prisma.aICodeSuggestion.count({
        where: { organizationId: ctx.user.organizationId, codeType: 'CPT' },
      }),
    ]);

    // Count flagged suggestions
    const flaggedCount = await ctx.prisma.aICodeSuggestion.count({
      where: {
        organizationId: ctx.user.organizationId,
        OR: [
          { upcodingRisk: true },
          { downcodingRisk: true },
          { auditRisk: 'high' },
        ],
      },
    });

    const acceptanceRate = total > 0 ? (((accepted + modified) / total) * 100).toFixed(1) : '0';

    return {
      totalSuggestions: total,
      acceptedCount: accepted,
      rejectedCount: rejected,
      modifiedCount: modified,
      acceptanceRate: `${acceptanceRate}%`,
      averageConfidence: avgConfidence._avg.confidence || 0,
      icd10Count,
      cptCount,
      flaggedCount,
    };
  }),

  /**
   * Get provider's most commonly accepted codes
   * Useful for quick code selection
   */
  getProviderTopCodes: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        codeType: z.enum(['ICD10', 'CPT']),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, codeType, limit } = input;

      // Get accepted codes grouped by code
      const acceptedCodes = await ctx.prisma.aICodeSuggestion.groupBy({
        by: ['suggestedCode', 'codeDescription'],
        where: {
          organizationId: ctx.user.organizationId,
          codeType,
          status: { in: ['ACCEPTED', 'MODIFIED'] },
          ...(providerId
            ? {
                encounter: {
                  providerId,
                },
              }
            : {}),
        },
        _count: { suggestedCode: true },
        orderBy: { _count: { suggestedCode: 'desc' } },
        take: limit,
      });

      return acceptedCodes.map(code => ({
        code: code.suggestedCode,
        description: code.codeDescription,
        usageCount: code._count.suggestedCode,
      }));
    }),

  /**
   * Flag a code suggestion for upcoding/downcoding concern
   */
  flagCodeSuggestion: providerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        flagType: z.enum(['upcoding', 'downcoding', 'audit']),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suggestionId, flagType, notes } = input;

      const suggestion = await ctx.prisma.aICodeSuggestion.findFirst({
        where: {
          id: suggestionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Code suggestion not found',
        });
      }

      const updateData: Record<string, unknown> = {};
      if (flagType === 'upcoding') {
        updateData.upcodingRisk = true;
        updateData.auditRisk = 'high';
      } else if (flagType === 'downcoding') {
        updateData.downcodingRisk = true;
        updateData.auditRisk = 'medium';
      } else {
        updateData.auditRisk = 'high';
      }

      const updated = await ctx.prisma.aICodeSuggestion.update({
        where: { id: suggestionId },
        data: updateData,
      });

      await auditLog('AI_CODE_FLAG', 'AICodeSuggestion', {
        entityId: suggestionId,
        changes: {
          flagType,
          notes,
          code: suggestion.suggestedCode,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // ============================================
  // US-319: Compliance checking
  // ============================================

  /**
   * Check SOAP note compliance for an encounter
   * Main entry point for compliance validation
   */
  checkCompliance: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        draftNoteId: z.string().optional(),
        payerType: z.string().optional(), // MEDICARE, BLUE_CROSS, UNITED, AETNA, WORKERS_COMP, AUTO_PIP
        includePayerSpecific: z.boolean().default(true),
        preBillingGate: z.boolean().default(false), // If true, block billing on critical issues
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, draftNoteId, payerType, includePayerSpecific, preBillingGate } = input;
      const startTime = Date.now();

      // Get encounter with SOAP note
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              insuranceInfo: true,
            },
          },
          provider: true,
          soapNote: true,
          aiCodeSuggestions: {
            where: { status: { in: ['ACCEPTED', 'MODIFIED'] } },
          },
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Get SOAP content
      let soapContent: { subjective?: string | null; objective?: string | null; assessment?: string | null; plan?: string | null } = {};
      if (draftNoteId) {
        const draftNote = await ctx.prisma.aIDraftNote.findFirst({
          where: {
            id: draftNoteId,
            organizationId: ctx.user.organizationId,
          },
        });
        if (draftNote) {
          soapContent = {
            subjective: draftNote.subjective,
            objective: draftNote.objective,
            assessment: draftNote.assessment,
            plan: draftNote.plan,
          };
        }
      } else if (encounter.soapNote) {
        soapContent = {
          subjective: encounter.soapNote.subjective,
          objective: encounter.soapNote.objective,
          assessment: encounter.soapNote.assessment,
          plan: encounter.soapNote.plan,
        };
      }

      if (!soapContent.subjective && !soapContent.objective && !soapContent.assessment && !soapContent.plan) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No SOAP note found for this encounter',
        });
      }

      // Run compliance checks
      const issues: ComplianceIssue[] = [];
      let auditRiskScore = 0;

      // 1. Check for missing required elements
      const encounterType = encounter.encounterType || 'FOLLOW_UP';
      const requiredElements = REQUIRED_ELEMENTS[encounterType] || REQUIRED_ELEMENTS.FOLLOW_UP;

      const missingElements = checkRequiredElements(soapContent, requiredElements, encounterType);
      issues.push(...missingElements);
      auditRiskScore += missingElements.filter(i => i.severity === 'ERROR').length * AUDIT_RISK_FACTORS.missingElements;

      // 2. Check medical necessity documentation
      const medicalNecessityIssues = checkMedicalNecessity(soapContent, encounter.encounterType);
      issues.push(...medicalNecessityIssues);
      if (medicalNecessityIssues.some(i => i.severity === 'ERROR' || i.severity === 'CRITICAL')) {
        auditRiskScore += AUDIT_RISK_FACTORS.insufficientMedicalNecessity;
      }

      // 3. Check payer-specific requirements
      if (includePayerSpecific && payerType) {
        const payerIssues = checkPayerRequirements(soapContent, payerType);
        issues.push(...payerIssues);
        auditRiskScore += payerIssues.filter(i => i.severity === 'CRITICAL').length * 10;
      }

      // 4. Check for cloned/duplicate note indicators
      const clonedNoteIssues = await checkForClonedNote(ctx.prisma, encounter, soapContent);
      issues.push(...clonedNoteIssues);
      if (clonedNoteIssues.length > 0) {
        auditRiskScore += AUDIT_RISK_FACTORS.clonedNote;
      }

      // 5. Check documentation supports billing codes
      const codeIssues = checkCodeDocumentation(soapContent, encounter.aiCodeSuggestions);
      issues.push(...codeIssues);
      if (codeIssues.some(i => i.severity === 'ERROR')) {
        auditRiskScore += AUDIT_RISK_FACTORS.highCodeComplexity;
      }

      // 6. Call AI service for additional compliance check
      const aiComplianceResult = await aiService.checkDocumentationCompliance(
        {
          subjective: soapContent.subjective || undefined,
          objective: soapContent.objective || undefined,
          assessment: soapContent.assessment || undefined,
          plan: soapContent.plan || undefined,
        },
        encounterType
      );

      // Convert AI issues to our format
      for (const aiIssue of aiComplianceResult.issues) {
        issues.push({
          issueType: 'AI_DETECTED',
          severity: mapAISeverity(aiIssue.severity),
          title: aiIssue.message.substring(0, 100),
          description: aiIssue.message,
          soapSection: aiIssue.section || undefined,
          suggestion: aiIssue.suggestion,
          autoFixable: false,
        });
      }

      const processingTime = Date.now() - startTime;

      // Calculate overall compliance score
      const complianceScore = calculateComplianceScore(issues);

      // Determine if billing should be blocked (pre-billing gate)
      const hasCriticalIssues = issues.some(i => i.severity === 'CRITICAL');
      const hasErrors = issues.some(i => i.severity === 'ERROR');
      const billingBlocked = preBillingGate && (hasCriticalIssues || (hasErrors && auditRiskScore > 50));

      // Store compliance checks in database
      const createdChecks = [];
      for (const issue of issues) {
        const check = await ctx.prisma.aIComplianceCheck.create({
          data: {
            encounterId,
            organizationId: ctx.user.organizationId,
            noteId: encounter.soapNote?.id || null,
            issueType: issue.issueType,
            severity: issue.severity,
            title: issue.title,
            description: issue.description,
            soapSection: issue.soapSection,
            fieldPath: issue.fieldPath,
            requirementSource: issue.requirementSource,
            requirementCode: issue.requirementCode,
            payerSpecific: issue.payerSpecific,
            suggestion: issue.suggestion,
            exampleFix: issue.exampleFix,
            autoFixable: issue.autoFixable,
            suggestedText: issue.suggestedText,
            auditRiskImpact: issue.auditRiskImpact,
            denialRisk: issue.denialRisk,
            aiModelUsed: aiService.getProviderName(),
            processingTimeMs: processingTime,
          },
        });
        createdChecks.push(check);
      }

      // Log the action
      await auditLog('AI_COMPLIANCE_CHECK', 'AIComplianceCheck', {
        entityId: encounterId,
        changes: {
          issueCount: issues.length,
          criticalCount: issues.filter(i => i.severity === 'CRITICAL').length,
          errorCount: issues.filter(i => i.severity === 'ERROR').length,
          warningCount: issues.filter(i => i.severity === 'WARNING').length,
          complianceScore,
          auditRiskScore,
          billingBlocked,
          processingTimeMs: processingTime,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        encounterId,
        complianceScore,
        auditRiskScore: Math.min(auditRiskScore, 100),
        issues: issues.map((issue, index) => ({
          id: createdChecks[index]?.id,
          ...issue,
        })),
        summary: {
          total: issues.length,
          critical: issues.filter(i => i.severity === 'CRITICAL').length,
          errors: issues.filter(i => i.severity === 'ERROR').length,
          warnings: issues.filter(i => i.severity === 'WARNING').length,
          info: issues.filter(i => i.severity === 'INFO').length,
        },
        billingBlocked,
        billingBlockReason: billingBlocked
          ? hasCriticalIssues
            ? 'Critical compliance issues must be resolved before billing'
            : 'High audit risk - review errors before billing'
          : null,
        processingTimeMs: processingTime,
      };
    }),

  /**
   * Get compliance issues for an encounter
   */
  getComplianceIssues: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        noteId: z.string().optional(),
        resolved: z.boolean().optional(),
        severity: z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const issues = await ctx.prisma.aIComplianceCheck.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input.encounterId ? { encounterId: input.encounterId } : {}),
          ...(input.noteId ? { noteId: input.noteId } : {}),
          ...(input.resolved !== undefined ? { resolved: input.resolved } : {}),
          ...(input.severity ? { severity: input.severity } : {}),
        },
        orderBy: [
          { severity: 'desc' }, // CRITICAL first
          { createdAt: 'desc' },
        ],
      });

      return issues;
    }),

  /**
   * Resolve a compliance issue
   */
  resolveComplianceIssue: providerProcedure
    .input(
      z.object({
        issueId: z.string(),
        resolution: z.string(),
        dismiss: z.boolean().default(false), // Dismiss without fixing
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { issueId, resolution, dismiss } = input;

      const issue = await ctx.prisma.aIComplianceCheck.findFirst({
        where: {
          id: issueId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!issue) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Compliance issue not found',
        });
      }

      const updated = await ctx.prisma.aIComplianceCheck.update({
        where: { id: issueId },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
          resolution,
          wasDismissed: dismiss,
        },
      });

      await auditLog('AI_COMPLIANCE_RESOLVE', 'AIComplianceCheck', {
        entityId: issueId,
        changes: {
          resolution,
          wasDismissed: dismiss,
          severity: issue.severity,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Apply auto-fix suggestion for a compliance issue
   */
  applyComplianceFix: providerProcedure
    .input(
      z.object({
        issueId: z.string(),
        applyToSection: z.enum(['subjective', 'objective', 'assessment', 'plan']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { issueId, applyToSection } = input;

      const issue = await ctx.prisma.aIComplianceCheck.findFirst({
        where: {
          id: issueId,
          organizationId: ctx.user.organizationId,
          autoFixable: true,
        },
        include: {
          encounter: {
            include: { soapNote: true },
          },
        },
      });

      if (!issue) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Auto-fixable compliance issue not found',
        });
      }

      if (!issue.suggestedText) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No suggested fix text available',
        });
      }

      if (!issue.encounter?.soapNote) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No SOAP note found to apply fix',
        });
      }

      // Apply the fix to the appropriate section
      const currentContent = issue.encounter.soapNote[applyToSection] || '';
      const updatedContent = currentContent + '\n\n' + issue.suggestedText;

      await ctx.prisma.sOAPNote.update({
        where: { id: issue.encounter.soapNote.id },
        data: {
          [applyToSection]: updatedContent,
        },
      });

      // Mark issue as resolved
      await ctx.prisma.aIComplianceCheck.update({
        where: { id: issueId },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
          resolution: 'Auto-fix applied',
        },
      });

      await auditLog('AI_COMPLIANCE_AUTOFIX', 'AIComplianceCheck', {
        entityId: issueId,
        changes: {
          section: applyToSection,
          fixApplied: issue.suggestedText.substring(0, 100),
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true, section: applyToSection };
    }),

  /**
   * Check if encounter passes pre-billing compliance gate
   */
  checkPreBillingGate: providerProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { encounterId } = input;

      // Get unresolved compliance issues
      const unresolvedIssues = await ctx.prisma.aIComplianceCheck.findMany({
        where: {
          encounterId,
          organizationId: ctx.user.organizationId,
          resolved: false,
        },
      });

      const hasCritical = unresolvedIssues.some(i => i.severity === 'CRITICAL');
      const errorCount = unresolvedIssues.filter(i => i.severity === 'ERROR').length;
      const warningCount = unresolvedIssues.filter(i => i.severity === 'WARNING').length;

      // Calculate risk score from unresolved issues
      const auditRiskScore = unresolvedIssues.reduce((sum, issue) => {
        return sum + (issue.auditRiskImpact || 0);
      }, 0);

      // Determine if billing should proceed
      const canProceed = !hasCritical && errorCount === 0;
      const requiresReview = errorCount > 0 || warningCount > 2 || auditRiskScore > 30;

      return {
        canProceed,
        requiresReview,
        blockedReason: hasCritical
          ? 'Critical compliance issues must be resolved'
          : errorCount > 0
          ? 'Compliance errors should be addressed'
          : null,
        unresolvedCount: unresolvedIssues.length,
        criticalCount: hasCritical ? unresolvedIssues.filter(i => i.severity === 'CRITICAL').length : 0,
        errorCount,
        warningCount,
        auditRiskScore: Math.min(auditRiskScore, 100),
      };
    }),

  /**
   * Get compliance statistics for the organization
   */
  getComplianceStats: providerProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, providerId } = input;

      const dateFilter = {
        ...(startDate ? { createdAt: { gte: startDate } } : {}),
        ...(endDate ? { createdAt: { lte: endDate } } : {}),
      };

      const encounterFilter = providerId
        ? { encounter: { providerId } }
        : {};

      const [total, resolved, critical, errors, warnings, avgRisk] = await Promise.all([
        ctx.prisma.aIComplianceCheck.count({
          where: {
            organizationId: ctx.user.organizationId,
            ...dateFilter,
            ...encounterFilter,
          },
        }),
        ctx.prisma.aIComplianceCheck.count({
          where: {
            organizationId: ctx.user.organizationId,
            resolved: true,
            ...dateFilter,
            ...encounterFilter,
          },
        }),
        ctx.prisma.aIComplianceCheck.count({
          where: {
            organizationId: ctx.user.organizationId,
            severity: 'CRITICAL',
            ...dateFilter,
            ...encounterFilter,
          },
        }),
        ctx.prisma.aIComplianceCheck.count({
          where: {
            organizationId: ctx.user.organizationId,
            severity: 'ERROR',
            ...dateFilter,
            ...encounterFilter,
          },
        }),
        ctx.prisma.aIComplianceCheck.count({
          where: {
            organizationId: ctx.user.organizationId,
            severity: 'WARNING',
            ...dateFilter,
            ...encounterFilter,
          },
        }),
        ctx.prisma.aIComplianceCheck.aggregate({
          where: {
            organizationId: ctx.user.organizationId,
            auditRiskImpact: { not: null },
            ...dateFilter,
            ...encounterFilter,
          },
          _avg: { auditRiskImpact: true },
        }),
      ]);

      // Get most common issue types
      const commonIssues = await ctx.prisma.aIComplianceCheck.groupBy({
        by: ['issueType'],
        where: {
          organizationId: ctx.user.organizationId,
          ...dateFilter,
          ...encounterFilter,
        },
        _count: { issueType: true },
        orderBy: { _count: { issueType: 'desc' } },
        take: 5,
      });

      const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) : '0';

      return {
        totalIssues: total,
        resolvedIssues: resolved,
        resolutionRate: `${resolutionRate}%`,
        criticalCount: critical,
        errorCount: errors,
        warningCount: warnings,
        averageAuditRisk: avgRisk._avg.auditRiskImpact || 0,
        commonIssueTypes: commonIssues.map(ci => ({
          type: ci.issueType,
          count: ci._count.issueType,
        })),
      };
    }),

  /**
   * Get compliance tips based on common issues
   */
  getComplianceTips: providerProcedure
    .input(z.object({ encounterType: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { encounterType } = input;

      // Get recent compliance issues for this organization
      const recentIssues = await ctx.prisma.aIComplianceCheck.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
          ...(encounterType
            ? {
                encounter: {
                  encounterType,
                },
              }
            : {}),
        },
        select: {
          issueType: true,
          suggestion: true,
          severity: true,
        },
      });

      // Aggregate and deduplicate tips
      const tipMap = new Map<string, { count: number; suggestion: string; severity: string }>();
      for (const issue of recentIssues) {
        if (issue.suggestion) {
          const existing = tipMap.get(issue.issueType);
          if (existing) {
            existing.count++;
          } else {
            tipMap.set(issue.issueType, {
              count: 1,
              suggestion: issue.suggestion,
              severity: issue.severity,
            });
          }
        }
      }

      // Sort by frequency and return top tips
      const tips = Array.from(tipMap.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([issueType, data]) => ({
          issueType,
          frequency: data.count,
          tip: data.suggestion,
          severity: data.severity,
        }));

      // Add general tips based on encounter type
      const generalTips = getGeneralComplianceTips(encounterType || 'FOLLOW_UP');

      return {
        organizationTips: tips,
        generalTips,
      };
    }),

  // ============================================
  // US-320: Provider Preference Learning
  // ============================================

  /**
   * Track edits to AI-generated content to learn provider preferences
   * Analyzes the changes between original and edited content
   */
  trackProviderEdit: providerProcedure
    .input(
      z.object({
        draftNoteId: z.string(),
        // Additional context for learning
        editContext: z.object({
          section: z.enum(['subjective', 'objective', 'assessment', 'plan']),
          originalText: z.string(),
          editedText: z.string(),
          editReason: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { draftNoteId, editContext } = input;

      // Get the draft note with edit history
      const draftNote = await ctx.prisma.aIDraftNote.findFirst({
        where: {
          id: draftNoteId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: {
            include: {
              provider: true,
            },
          },
        },
      });

      if (!draftNote) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft note not found',
        });
      }

      const providerId = draftNote.encounter.providerId;
      const learnedPreferences: Array<{
        category: string;
        key: string;
        value: Record<string, unknown>;
        description: string;
      }> = [];

      // If explicit edit context provided, analyze that
      if (editContext) {
        const analysis = analyzeEdit(
          editContext.section,
          editContext.originalText,
          editContext.editedText,
          editContext.editReason
        );
        learnedPreferences.push(...analysis);
      }

      // Also analyze the stored edit history in the draft note
      const editedContent = draftNote.editedContent as Record<string, {
        original: string;
        edited: string;
        editedAt: string;
      }> | null;

      if (editedContent) {
        for (const [section, edit] of Object.entries(editedContent)) {
          if (edit.original && edit.edited) {
            const analysis = analyzeEdit(
              section as 'subjective' | 'objective' | 'assessment' | 'plan',
              edit.original,
              edit.edited
            );
            learnedPreferences.push(...analysis);
          }
        }
      }

      // Store or update learned preferences
      const savedPreferences = [];
      for (const pref of learnedPreferences) {
        const saved = await upsertProviderPreference(
          ctx.prisma,
          providerId,
          ctx.user.organizationId,
          pref.category,
          pref.key,
          pref.value,
          pref.description,
          'edit_tracking'
        );
        savedPreferences.push(saved);
      }

      // Log the learning action
      await auditLog('AI_PREFERENCE_LEARN', 'ProviderPreference', {
        entityId: draftNoteId,
        changes: {
          learnedCount: learnedPreferences.length,
          categories: [...new Set(learnedPreferences.map(p => p.category))],
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        learnedPreferences: savedPreferences.length,
        categories: [...new Set(learnedPreferences.map(p => p.category))],
        details: learnedPreferences.map(p => ({
          category: p.category,
          key: p.key,
          description: p.description,
        })),
      };
    }),

  /**
   * Get provider preferences for a specific provider
   */
  getProviderPreferences: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(), // Defaults to current user's provider
        category: z.string().optional(),
        activeOnly: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, category, activeOnly } = input;

      // Get provider ID - either specified or current user
      let targetProviderId = providerId;
      if (!targetProviderId) {
        const provider = await ctx.prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });
        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider not found for current user',
          });
        }
        targetProviderId = provider.id;
      }

      const preferences = await ctx.prisma.providerPreference.findMany({
        where: {
          providerId: targetProviderId,
          organizationId: ctx.user.organizationId,
          ...(category ? { category } : {}),
          ...(activeOnly ? { isActive: true } : {}),
        },
        orderBy: [
          { category: 'asc' },
          { confidenceScore: 'desc' },
        ],
      });

      // Group by category
      const grouped: Record<string, typeof preferences> = {};
      for (const pref of preferences) {
        if (!grouped[pref.category]) {
          grouped[pref.category] = [];
        }
        grouped[pref.category].push(pref);
      }

      return {
        preferences,
        byCategory: grouped,
        summary: {
          total: preferences.length,
          categories: Object.keys(grouped),
          avgConfidence: preferences.length > 0
            ? preferences.reduce((sum, p) => sum + p.confidenceScore, 0) / preferences.length
            : 0,
        },
      };
    }),

  /**
   * Set an explicit provider preference
   * Allows providers to manually configure their preferences
   */
  setProviderPreference: providerProcedure
    .input(
      z.object({
        category: z.enum(['terminology', 'style', 'format', 'template', 'phrases', 'depth']),
        preferenceKey: z.string(),
        preferenceValue: z.record(z.string(), z.unknown()),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { category, preferenceKey, preferenceValue, description } = input;

      // Get current user's provider
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found for current user',
        });
      }

      const saved = await upsertProviderPreference(
        ctx.prisma,
        provider.id,
        ctx.user.organizationId,
        category,
        preferenceKey,
        preferenceValue,
        description,
        'explicit_setting'
      );

      await auditLog('AI_PREFERENCE_SET', 'ProviderPreference', {
        entityId: saved.id,
        changes: { category, preferenceKey },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return saved;
    }),

  /**
   * Delete or deactivate a provider preference
   */
  removeProviderPreference: providerProcedure
    .input(
      z.object({
        preferenceId: z.string(),
        permanent: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { preferenceId, permanent } = input;

      const preference = await ctx.prisma.providerPreference.findFirst({
        where: {
          id: preferenceId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!preference) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Preference not found',
        });
      }

      if (permanent) {
        await ctx.prisma.providerPreference.delete({
          where: { id: preferenceId },
        });
      } else {
        await ctx.prisma.providerPreference.update({
          where: { id: preferenceId },
          data: { isActive: false },
        });
      }

      await auditLog('AI_PREFERENCE_REMOVE', 'ProviderPreference', {
        entityId: preferenceId,
        changes: { permanent },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true, permanent };
    }),

  /**
   * Track when an AI suggestion is accepted or rejected
   * Used to update preference confidence scores
   */
  recordPreferenceFeedback: providerProcedure
    .input(
      z.object({
        preferenceId: z.string(),
        accepted: z.boolean(),
        context: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { preferenceId, accepted, context } = input;

      const preference = await ctx.prisma.providerPreference.findFirst({
        where: {
          id: preferenceId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!preference) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Preference not found',
        });
      }

      // Update usage tracking
      const updates: Prisma.ProviderPreferenceUpdateInput = {
        timesApplied: preference.timesApplied + 1,
        lastUpdated: new Date(),
      };

      if (accepted) {
        updates.timesAccepted = preference.timesAccepted + 1;
        // Increase confidence when accepted
        updates.confidenceScore = Math.min(1.0, preference.confidenceScore + 0.05);
      } else {
        updates.timesRejected = preference.timesRejected + 1;
        // Decrease confidence when rejected
        updates.confidenceScore = Math.max(0.1, preference.confidenceScore - 0.1);
      }

      const updated = await ctx.prisma.providerPreference.update({
        where: { id: preferenceId },
        data: updates,
      });

      return {
        preferenceId: updated.id,
        newConfidence: updated.confidenceScore,
        acceptanceRate: updated.timesApplied > 0
          ? updated.timesAccepted / updated.timesApplied
          : 0,
      };
    }),

  /**
   * Analyze provider's documentation style from historical notes
   * Used to bootstrap preferences for new providers or enhance learning
   */
  analyzeDocumentationStyle: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        noteCount: z.number().default(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { noteCount } = input;

      // Get provider
      let providerId = input.providerId;
      if (!providerId) {
        const provider = await ctx.prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });
        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider not found',
          });
        }
        providerId = provider.id;
      }

      // Get recent SOAP notes by this provider
      const notes = await ctx.prisma.sOAPNote.findMany({
        where: {
          encounter: {
            providerId,
            organizationId: ctx.user.organizationId,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: noteCount,
        select: {
          subjective: true,
          objective: true,
          assessment: true,
          plan: true,
        },
      });

      if (notes.length < 3) {
        return {
          success: false,
          message: 'Not enough notes to analyze (minimum 3 required)',
          noteCount: notes.length,
          preferences: [],
        };
      }

      // Analyze patterns
      const learnedPreferences: Array<{
        category: string;
        key: string;
        value: Record<string, unknown>;
        description: string;
      }> = [];

      // Analyze style patterns
      const styleAnalysis = analyzeStylePatterns(notes);
      learnedPreferences.push(...styleAnalysis);

      // Analyze terminology patterns
      const terminologyAnalysis = analyzeTerminologyPatterns(notes);
      learnedPreferences.push(...terminologyAnalysis);

      // Analyze depth/detail level
      const depthAnalysis = analyzeDocumentationDepth(notes);
      learnedPreferences.push(...depthAnalysis);

      // Analyze phrase patterns
      const phraseAnalysis = analyzePhrasePatterns(notes);
      learnedPreferences.push(...phraseAnalysis);

      // Save learned preferences
      const savedPreferences = [];
      for (const pref of learnedPreferences) {
        const saved = await upsertProviderPreference(
          ctx.prisma,
          providerId,
          ctx.user.organizationId,
          pref.category,
          pref.key,
          pref.value,
          pref.description,
          'style_analysis'
        );
        savedPreferences.push(saved);
      }

      await auditLog('AI_STYLE_ANALYSIS', 'ProviderPreference', {
        entityId: providerId,
        changes: {
          notesAnalyzed: notes.length,
          preferencesLearned: savedPreferences.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        notesAnalyzed: notes.length,
        preferencesLearned: savedPreferences.length,
        preferences: savedPreferences.map(p => ({
          id: p.id,
          category: p.category,
          key: p.preferenceKey,
          confidence: p.confidenceScore,
          description: p.description,
        })),
      };
    }),

  /**
   * Get learning statistics for a provider
   */
  getPreferenceLearningStats: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get provider
      let providerId = input.providerId;
      if (!providerId) {
        const provider = await ctx.prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });
        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider not found',
          });
        }
        providerId = provider.id;
      }

      // Get all preferences
      const preferences = await ctx.prisma.providerPreference.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
        },
      });

      // Get draft notes to calculate edit rate
      const draftNotes = await ctx.prisma.aIDraftNote.findMany({
        where: {
          encounter: {
            providerId,
          },
          organizationId: ctx.user.organizationId,
        },
        select: {
          status: true,
          editCount: true,
          styleMatchScore: true,
        },
      });

      // Calculate statistics
      const totalPreferences = preferences.length;
      const activePreferences = preferences.filter(p => p.isActive).length;
      const avgConfidence = preferences.length > 0
        ? preferences.reduce((sum, p) => sum + p.confidenceScore, 0) / preferences.length
        : 0;

      const totalApplications = preferences.reduce((sum, p) => sum + p.timesApplied, 0);
      const totalAccepted = preferences.reduce((sum, p) => sum + p.timesAccepted, 0);
      const overallAcceptanceRate = totalApplications > 0
        ? totalAccepted / totalApplications
        : 0;

      const categoryStats: Record<string, {
        count: number;
        avgConfidence: number;
        acceptanceRate: number;
      }> = {};

      for (const pref of preferences) {
        if (!categoryStats[pref.category]) {
          categoryStats[pref.category] = { count: 0, avgConfidence: 0, acceptanceRate: 0 };
        }
        categoryStats[pref.category].count++;
        categoryStats[pref.category].avgConfidence += pref.confidenceScore;
      }

      // Finalize category averages
      for (const cat of Object.keys(categoryStats)) {
        const catPrefs = preferences.filter(p => p.category === cat);
        categoryStats[cat].avgConfidence /= categoryStats[cat].count;
        const catApplied = catPrefs.reduce((sum, p) => sum + p.timesApplied, 0);
        const catAccepted = catPrefs.reduce((sum, p) => sum + p.timesAccepted, 0);
        categoryStats[cat].acceptanceRate = catApplied > 0 ? catAccepted / catApplied : 0;
      }

      // Draft note stats
      const totalDrafts = draftNotes.length;
      const editedDrafts = draftNotes.filter(d => d.editCount > 0).length;
      const avgEditsPerDraft = totalDrafts > 0
        ? draftNotes.reduce((sum, d) => sum + d.editCount, 0) / totalDrafts
        : 0;
      const avgStyleMatch = draftNotes.filter(d => d.styleMatchScore !== null).length > 0
        ? draftNotes
            .filter(d => d.styleMatchScore !== null)
            .reduce((sum, d) => sum + (d.styleMatchScore || 0), 0) /
          draftNotes.filter(d => d.styleMatchScore !== null).length
        : 0;

      return {
        preferences: {
          total: totalPreferences,
          active: activePreferences,
          avgConfidence,
          overallAcceptanceRate,
        },
        byCategory: categoryStats,
        drafts: {
          total: totalDrafts,
          edited: editedDrafts,
          editRate: totalDrafts > 0 ? editedDrafts / totalDrafts : 0,
          avgEditsPerDraft,
          avgStyleMatch,
        },
        learningProgress: {
          hasEnoughData: totalPreferences >= 5,
          suggestedAction: totalPreferences < 5
            ? 'Run style analysis to bootstrap preferences'
            : avgConfidence < 0.6
            ? 'Continue using AI to improve confidence scores'
            : 'Preferences well-established',
        },
      };
    }),

  /**
   * Apply preferences to transform content
   * Used internally but exposed for testing/preview
   */
  applyPreferencesToContent: providerProcedure
    .input(
      z.object({
        content: z.object({
          subjective: z.string().optional(),
          objective: z.string().optional(),
          assessment: z.string().optional(),
          plan: z.string().optional(),
        }),
        providerId: z.string().optional(),
        preview: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { content, preview } = input;

      // Get provider
      let providerId = input.providerId;
      if (!providerId) {
        const provider = await ctx.prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });
        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider not found',
          });
        }
        providerId = provider.id;
      }

      // Get active preferences
      const preferences = await ctx.prisma.providerPreference.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          confidenceScore: { gte: 0.3 }, // Only apply confident preferences
        },
        orderBy: { confidenceScore: 'desc' },
      });

      if (preferences.length === 0) {
        return {
          transformed: content,
          appliedPreferences: [],
          matchScore: 0,
        };
      }

      // Convert to format expected by applyProviderStyle
      const formattedPrefs = preferences.map(p => ({
        category: p.category,
        key: p.preferenceKey,
        value: p.preferenceValue as Record<string, unknown>,
      }));

      const result = applyProviderStyle(
        { ...content, confidence: 1.0 },
        formattedPrefs
      );

      // If not preview, record preference applications
      if (!preview) {
        for (const pref of preferences) {
          if (result.appliedElements.some(e => e.includes(pref.preferenceKey) || e.includes(pref.category))) {
            await ctx.prisma.providerPreference.update({
              where: { id: pref.id },
              data: { timesApplied: pref.timesApplied + 1 },
            });
          }
        }
      }

      return {
        transformed: {
          subjective: result.subjective || content.subjective,
          objective: result.objective || content.objective,
          assessment: result.assessment || content.assessment,
          plan: result.plan || content.plan,
        },
        appliedPreferences: result.appliedElements,
        matchScore: result.matchScore,
      };
    }),

  /**
   * Get template preferences based on encounter type
   */
  getTemplatePreferences: providerProcedure
    .input(
      z.object({
        encounterType: z.string(),
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { encounterType } = input;

      // Get provider
      let providerId = input.providerId;
      if (!providerId) {
        const provider = await ctx.prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });
        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider not found',
          });
        }
        providerId = provider.id;
      }

      // Get template preferences for this encounter type
      const preferences = await ctx.prisma.providerPreference.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          category: 'template',
          isActive: true,
          preferenceKey: { startsWith: encounterType },
        },
      });

      // Get depth preference
      const depthPref = await ctx.prisma.providerPreference.findFirst({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          category: 'depth',
          isActive: true,
        },
        orderBy: { confidenceScore: 'desc' },
      });

      return {
        templatePreferences: preferences.map(p => ({
          id: p.id,
          key: p.preferenceKey,
          value: p.preferenceValue,
          confidence: p.confidenceScore,
        })),
        depthPreference: depthPref ? {
          level: (depthPref.preferenceValue as Record<string, unknown>).level || 'standard',
          avgWordCount: (depthPref.preferenceValue as Record<string, unknown>).avgWordCount,
          confidence: depthPref.confidenceScore,
        } : {
          level: 'standard',
          avgWordCount: null,
          confidence: 0,
        },
      };
    }),

  // ============================================
  // US-321: Documentation Templates and Macros
  // ============================================

  /**
   * Suggest template based on appointment type
   * Analyzes the encounter context and suggests the best template
   */
  suggestTemplate: providerProcedure
    .input(
      z.object({
        encounterId: z.string().optional(),
        appointmentType: z.string().optional(),
        encounterType: z.enum([
          'INITIAL_EVAL',
          'FOLLOW_UP',
          'RE_EVALUATION',
          'DISCHARGE',
          'MAINTENANCE',
          'ACUTE',
          'WORKERS_COMP',
          'PERSONAL_INJURY',
        ]),
        patientId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, appointmentType, encounterType, patientId } = input;

      // Get provider
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Find templates for this encounter type
      const templates = await ctx.prisma.noteTemplate.findMany({
        where: {
          category: encounterType,
          isActive: true,
          OR: [
            { organizationId: ctx.user.organizationId },
            { organizationId: null }, // System templates
          ],
        },
        orderBy: { sortOrder: 'asc' },
      });

      if (templates.length === 0) {
        return {
          suggestion: null,
          message: 'No templates found for this encounter type',
        };
      }

      // Check provider's template preferences
      const templatePref = await ctx.prisma.providerPreference.findFirst({
        where: {
          providerId: provider.id,
          organizationId: ctx.user.organizationId,
          category: 'template',
          preferenceKey: `preferred_${encounterType}`,
          isActive: true,
        },
      });

      let suggestedTemplate = templates[0];
      let reasoning = 'Default template for this encounter type';
      let confidence = 0.7;

      // If provider has a preference, use it
      if (templatePref) {
        const prefTemplateId = (templatePref.preferenceValue as Record<string, unknown>).templateId as string;
        const preferredTemplate = templates.find(t => t.id === prefTemplateId);
        if (preferredTemplate) {
          suggestedTemplate = preferredTemplate;
          reasoning = 'Based on your previous template selections';
          confidence = templatePref.confidenceScore;
        }
      }

      // If appointment type specified, look for more specific match
      if (appointmentType) {
        const appointmentMatch = templates.find(t =>
          t.name.toLowerCase().includes(appointmentType.toLowerCase())
        );
        if (appointmentMatch) {
          suggestedTemplate = appointmentMatch;
          reasoning = `Matched to appointment type: ${appointmentType}`;
          confidence = 0.85;
        }
      }

      // Check for pull-forward data from previous notes
      let pullForwardData = null;
      let pullForwardFromId = null;

      if (patientId) {
        const previousNote = await ctx.prisma.sOAPNote.findFirst({
          where: {
            encounter: {
              patientId,
              organizationId: ctx.user.organizationId,
            },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            encounter: true,
          },
        });

        if (previousNote) {
          // Pull forward relevant data (maintaining patient continuity)
          pullForwardData = {
            previousDiagnoses: previousNote.assessment,
            previousPlan: previousNote.plan,
            lastVisitDate: previousNote.encounter.createdAt,
          };
          pullForwardFromId = previousNote.id;
        }
      }

      // Create suggestion record
      const suggestion = await ctx.prisma.aITemplateSuggestion.create({
        data: {
          encounterId,
          appointmentType: appointmentType || 'general',
          encounterType,
          suggestedTemplateId: suggestedTemplate.id,
          reasoning,
          confidence,
          pullForwardData: pullForwardData as Prisma.InputJsonValue,
          pullForwardFrom: pullForwardFromId,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('AI_TEMPLATE_SUGGEST', 'AITemplateSuggestion', {
        entityId: suggestion.id,
        changes: {
          templateId: suggestedTemplate.id,
          templateName: suggestedTemplate.name,
          encounterType,
          confidence,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        suggestionId: suggestion.id,
        template: {
          id: suggestedTemplate.id,
          name: suggestedTemplate.name,
          description: suggestedTemplate.description,
          subjectiveTemplate: suggestedTemplate.subjectiveTemplate,
          objectiveTemplate: suggestedTemplate.objectiveTemplate,
          assessmentTemplate: suggestedTemplate.assessmentTemplate,
          planTemplate: suggestedTemplate.planTemplate,
        },
        reasoning,
        confidence,
        pullForwardData,
        alternatives: templates.filter(t => t.id !== suggestedTemplate.id).slice(0, 3).map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
        })),
      };
    }),

  /**
   * Accept a template suggestion
   * Tracks for provider preference learning
   */
  acceptTemplateSuggestion: providerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const suggestion = await ctx.prisma.aITemplateSuggestion.findFirst({
        where: {
          id: input.suggestionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Suggestion not found',
        });
      }

      const updated = await ctx.prisma.aITemplateSuggestion.update({
        where: { id: input.suggestionId },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });

      // Update provider preference for this encounter type
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (provider) {
        await ctx.prisma.providerPreference.upsert({
          where: {
            providerId_category_preferenceKey: {
              providerId: provider.id,
              category: 'template',
              preferenceKey: `preferred_${suggestion.encounterType}`,
            },
          },
          update: {
            preferenceValue: { templateId: suggestion.suggestedTemplateId },
            confidenceScore: Math.min(1, (suggestion.confidence || 0.8) + 0.05),
            timesApplied: { increment: 1 },
            timesAccepted: { increment: 1 },
          },
          create: {
            providerId: provider.id,
            organizationId: ctx.user.organizationId,
            category: 'template',
            preferenceKey: `preferred_${suggestion.encounterType}`,
            preferenceValue: { templateId: suggestion.suggestedTemplateId },
            confidenceScore: 0.8,
            timesApplied: 1,
            timesAccepted: 1,
          },
        });
      }

      await auditLog('AI_TEMPLATE_ACCEPT', 'AITemplateSuggestion', {
        entityId: input.suggestionId,
        changes: { templateId: suggestion.suggestedTemplateId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Reject a template suggestion (use a different template)
   */
  rejectTemplateSuggestion: providerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        selectedTemplateId: z.string().optional(), // What they chose instead
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suggestionId, selectedTemplateId, reason } = input;

      const suggestion = await ctx.prisma.aITemplateSuggestion.findFirst({
        where: {
          id: suggestionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Suggestion not found',
        });
      }

      const updated = await ctx.prisma.aITemplateSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          modifyNotes: reason,
        },
      });

      // If they selected a different template, learn from it
      if (selectedTemplateId) {
        const provider = await ctx.prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });

        if (provider) {
          // Update preference to their actual choice
          await ctx.prisma.providerPreference.upsert({
            where: {
              providerId_category_preferenceKey: {
                providerId: provider.id,
                category: 'template',
                preferenceKey: `preferred_${suggestion.encounterType}`,
              },
            },
            update: {
              preferenceValue: { templateId: selectedTemplateId },
              confidenceScore: 0.75,
              timesApplied: { increment: 1 },
              timesRejected: { increment: 1 },
            },
            create: {
              providerId: provider.id,
              organizationId: ctx.user.organizationId,
              category: 'template',
              preferenceKey: `preferred_${suggestion.encounterType}`,
              preferenceValue: { templateId: selectedTemplateId },
              confidenceScore: 0.75,
              timesApplied: 1,
              timesRejected: 1,
            },
          });
        }
      }

      await auditLog('AI_TEMPLATE_REJECT', 'AITemplateSuggestion', {
        entityId: suggestionId,
        changes: { selectedTemplateId, reason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Pull forward content from previous note
   * Gets relevant content from patient's previous visits
   */
  pullForwardContent: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterType: z.string(),
        sections: z.array(z.enum(['subjective', 'objective', 'assessment', 'plan'])).default(['assessment', 'plan']),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterType, sections } = input;

      // Get patient's recent notes
      const recentNotes = await ctx.prisma.sOAPNote.findMany({
        where: {
          encounter: {
            patientId,
            organizationId: ctx.user.organizationId,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          encounter: {
            include: {
              diagnoses: true,
            },
          },
        },
      });

      if (recentNotes.length === 0) {
        return {
          available: false,
          message: 'No previous notes found for this patient',
          pullForwardContent: null,
        };
      }

      const mostRecent = recentNotes[0];

      // Build pull-forward content based on requested sections
      const pullForward: Record<string, unknown> = {
        noteId: mostRecent.id,
        noteDate: mostRecent.encounter.createdAt,
        encounterType: mostRecent.encounter.encounterType,
      };

      if (sections.includes('subjective')) {
        pullForward.subjective = {
          chiefComplaint: mostRecent.subjective,
          tip: 'Update with current symptoms and changes since last visit',
        };
      }

      if (sections.includes('objective')) {
        pullForward.objective = {
          previousFindings: mostRecent.objective,
          tip: 'Document current examination findings - compare to these previous findings',
        };
      }

      if (sections.includes('assessment')) {
        pullForward.assessment = {
          diagnoses: mostRecent.encounter.diagnoses.map(d => ({
            code: d.icd10Code,
            description: d.description,
          })),
          previousAssessment: mostRecent.assessment,
          tip: 'Update diagnosis status and add any new diagnoses',
        };
      }

      if (sections.includes('plan')) {
        pullForward.plan = {
          previousPlan: mostRecent.plan,
          tip: 'Document current treatment plan and any modifications',
        };
      }

      await auditLog('AI_TEMPLATE_PULL_FORWARD', 'SOAPNote', {
        entityId: mostRecent.id,
        changes: { patientId, sections },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        available: true,
        pullForwardContent: pullForward,
        recentNoteCount: recentNotes.length,
      };
    }),

  // ============================================
  // Smart Text Macros
  // ============================================

  /**
   * Create a new text macro
   */
  createMacro: providerProcedure
    .input(
      z.object({
        trigger: z.string().min(2).max(20),
        expansion: z.string().min(1),
        description: z.string().optional(),
        category: z.enum(['general', 'subjective', 'objective', 'assessment', 'plan', 'common_phrases']),
        scope: z.enum(['provider', 'organization']).default('provider'),
        encounterTypes: z.array(z.string()).default([]),
        soapSections: z.array(z.string()).default([]),
        variables: z.array(z.object({
          name: z.string(),
          placeholder: z.string(),
          defaultValue: z.string().optional(),
        })).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { trigger, expansion, description, category, scope, encounterTypes, soapSections, variables } = input;

      // Get provider
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Check for duplicate trigger
      const existing = await ctx.prisma.textMacro.findFirst({
        where: {
          trigger,
          OR: [
            { providerId: provider.id },
            { organizationId: ctx.user.organizationId, scope: 'organization' },
          ],
          isActive: true,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A macro with trigger "${trigger}" already exists`,
        });
      }

      const macro = await ctx.prisma.textMacro.create({
        data: {
          trigger: trigger.startsWith('.') ? trigger : `.${trigger}`,
          expansion,
          description,
          category,
          scope,
          encounterTypes,
          soapSections,
          variables: variables as Prisma.InputJsonValue,
          providerId: scope === 'provider' ? provider.id : null,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('AI_MACRO_CREATE', 'TextMacro', {
        entityId: macro.id,
        changes: { trigger, category, scope },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return macro;
    }),

  /**
   * Update an existing macro
   */
  updateMacro: providerProcedure
    .input(
      z.object({
        id: z.string(),
        trigger: z.string().min(2).max(20).optional(),
        expansion: z.string().min(1).optional(),
        description: z.string().optional(),
        category: z.enum(['general', 'subjective', 'objective', 'assessment', 'plan', 'common_phrases']).optional(),
        encounterTypes: z.array(z.string()).optional(),
        soapSections: z.array(z.string()).optional(),
        variables: z.array(z.object({
          name: z.string(),
          placeholder: z.string(),
          defaultValue: z.string().optional(),
        })).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const macro = await ctx.prisma.textMacro.findFirst({
        where: {
          id,
          OR: [
            { providerId: { not: null }, provider: { userId: ctx.user.id } },
            { organizationId: ctx.user.organizationId, scope: 'organization' },
          ],
        },
      });

      if (!macro) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Macro not found or you do not have permission to edit it',
        });
      }

      if (macro.isSystem) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'System macros cannot be edited',
        });
      }

      // Format trigger if provided
      if (updateData.trigger && !updateData.trigger.startsWith('.')) {
        updateData.trigger = `.${updateData.trigger}`;
      }

      const updated = await ctx.prisma.textMacro.update({
        where: { id },
        data: {
          ...updateData,
          variables: updateData.variables as Prisma.InputJsonValue,
        },
      });

      await auditLog('AI_MACRO_UPDATE', 'TextMacro', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Delete a macro
   */
  deleteMacro: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const macro = await ctx.prisma.textMacro.findFirst({
        where: {
          id: input.id,
          OR: [
            { providerId: { not: null }, provider: { userId: ctx.user.id } },
            { organizationId: ctx.user.organizationId, scope: 'organization' },
          ],
        },
      });

      if (!macro) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Macro not found',
        });
      }

      if (macro.isSystem) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'System macros cannot be deleted',
        });
      }

      await ctx.prisma.textMacro.delete({
        where: { id: input.id },
      });

      await auditLog('AI_MACRO_DELETE', 'TextMacro', {
        entityId: input.id,
        changes: { trigger: macro.trigger },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  /**
   * List macros available to the provider
   */
  listMacros: providerProcedure
    .input(
      z.object({
        category: z.string().optional(),
        soapSection: z.string().optional(),
        encounterType: z.string().optional(),
        search: z.string().optional(),
        includeSystem: z.boolean().default(true),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { category, soapSection, encounterType, search, includeSystem = true } = input ?? {};

      // Get provider
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      const whereConditions: Prisma.TextMacroWhereInput[] = [];

      // Provider's own macros
      if (provider) {
        whereConditions.push({ providerId: provider.id });
      }

      // Organization macros
      whereConditions.push({
        organizationId: ctx.user.organizationId,
        scope: 'organization',
      });

      // System macros
      if (includeSystem) {
        whereConditions.push({ isSystem: true });
      }

      const where: Prisma.TextMacroWhereInput = {
        OR: whereConditions,
        isActive: true,
      };

      if (category) {
        where.category = category;
      }

      if (soapSection) {
        where.OR = [
          { soapSections: { has: soapSection } },
          { soapSections: { isEmpty: true } },
        ];
      }

      if (encounterType) {
        // Include macros that apply to all encounter types or this specific one
        where.AND = [
          {
            OR: [
              { encounterTypes: { has: encounterType } },
              { encounterTypes: { isEmpty: true } },
            ],
          },
        ];
      }

      if (search) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : []),
          {
            OR: [
              { trigger: { contains: search, mode: 'insensitive' } },
              { expansion: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      const macros = await ctx.prisma.textMacro.findMany({
        where,
        orderBy: [
          { usageCount: 'desc' },
          { trigger: 'asc' },
        ],
      });

      // Group by category
      const grouped = macros.reduce((acc, macro) => {
        const cat = macro.category;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(macro);
        return acc;
      }, {} as Record<string, typeof macros>);

      return {
        macros,
        grouped,
        total: macros.length,
      };
    }),

  /**
   * Expand a macro trigger
   * Replaces trigger with expansion and tracks usage
   */
  expandMacro: providerProcedure
    .input(
      z.object({
        trigger: z.string(),
        variables: z.record(z.string(), z.string()).optional(), // Variable replacements
        context: z.object({
          soapSection: z.string().optional(),
          encounterType: z.string().optional(),
          encounterId: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { trigger, variables } = input;

      // Get provider
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      // Find matching macro
      const macro = await ctx.prisma.textMacro.findFirst({
        where: {
          trigger: trigger.startsWith('.') ? trigger : `.${trigger}`,
          isActive: true,
          OR: [
            { providerId: provider?.id },
            { organizationId: ctx.user.organizationId, scope: 'organization' },
            { isSystem: true },
          ],
        },
        orderBy: [
          // Prefer provider-specific, then org, then system
          { providerId: 'desc' },
          { scope: 'desc' },
        ],
      });

      if (!macro) {
        return {
          found: false,
          expansion: null,
          message: `No macro found for trigger "${trigger}"`,
        };
      }

      // Build expansion with variable replacement
      let expansion = macro.expansion;

      if (variables) {
        for (const [key, value] of Object.entries(variables)) {
          expansion = expansion.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
      }

      // Update usage stats
      await ctx.prisma.textMacro.update({
        where: { id: macro.id },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });

      await auditLog('AI_MACRO_EXPAND', 'TextMacro', {
        entityId: macro.id,
        changes: { trigger, context: input.context },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        found: true,
        expansion,
        macroId: macro.id,
        hasVariables: macro.variables !== null,
        variables: macro.variables,
      };
    }),

  /**
   * Auto-complete text with common phrases
   * Returns phrase suggestions based on partial input
   */
  autocomplete: providerProcedure
    .input(
      z.object({
        text: z.string().min(2),
        soapSection: z.enum(['subjective', 'objective', 'assessment', 'plan']).optional(),
        encounterType: z.string().optional(),
        limit: z.number().min(1).max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const { text, soapSection, encounterType, limit } = input;

      // Get provider
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      // Search macros that match
      const macros = await ctx.prisma.textMacro.findMany({
        where: {
          isActive: true,
          OR: [
            { trigger: { startsWith: text, mode: 'insensitive' } },
            { expansion: { contains: text, mode: 'insensitive' } },
          ],
          AND: [
            {
              OR: [
                { providerId: provider?.id },
                { organizationId: ctx.user.organizationId },
                { isSystem: true },
              ],
            },
          ],
        },
        take: limit,
        orderBy: { usageCount: 'desc' },
      });

      // Also get provider's phrase preferences
      const phrasePrefs = provider ? await ctx.prisma.providerPreference.findMany({
        where: {
          providerId: provider.id,
          category: 'phrases',
          isActive: true,
          preferenceKey: { contains: soapSection || '' },
        },
        take: 5,
      }) : [];

      // Common clinical phrases (system defaults)
      const commonPhrases = getCommonPhrases(text, soapSection);

      await auditLog('AI_AUTOCOMPLETE', 'TextMacro', {
        entityId: 'autocomplete',
        changes: { text, soapSection, resultCount: macros.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        suggestions: [
          ...macros.map(m => ({
            type: 'macro' as const,
            trigger: m.trigger,
            text: m.expansion,
            description: m.description,
          })),
          ...phrasePrefs.map(p => ({
            type: 'preference' as const,
            trigger: null,
            text: (p.preferenceValue as Record<string, unknown>).phrase as string,
            description: 'Your commonly used phrase',
          })),
          ...commonPhrases.map(phrase => ({
            type: 'common' as const,
            trigger: null,
            text: phrase,
            description: 'Common clinical phrase',
          })),
        ].slice(0, limit),
      };
    }),

  /**
   * Generate quick normal exam text
   * Creates standard "within normal limits" text for objective section
   */
  generateQuickNormal: providerProcedure
    .input(
      z.object({
        examType: z.enum(['general', 'cervical', 'thoracic', 'lumbar', 'extremity', 'neurological']),
        encounterType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { examType, encounterType } = input;

      // Get provider preferences for normal exam text
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      let normalText = '';

      // Check for provider's custom normal template
      if (provider) {
        const customNormal = await ctx.prisma.providerPreference.findFirst({
          where: {
            providerId: provider.id,
            category: 'template',
            preferenceKey: `normal_exam_${examType}`,
            isActive: true,
          },
        });

        if (customNormal) {
          normalText = (customNormal.preferenceValue as Record<string, unknown>).text as string;
        }
      }

      // Use defaults if no custom template
      if (!normalText) {
        normalText = getDefaultNormalExam(examType);
      }

      await auditLog('AI_QUICK_NORMAL', 'ProviderPreference', {
        entityId: provider?.id || 'system',
        changes: { examType, encounterType },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        text: normalText,
        examType,
        isCustom: normalText !== getDefaultNormalExam(examType),
      };
    }),

  /**
   * Learn macro from provider's text patterns
   * Analyzes frequently typed text and suggests macros
   */
  learnMacroFromPattern: providerProcedure
    .input(
      z.object({
        text: z.string(),
        soapSection: z.string().optional(),
        encounterType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { text, soapSection, encounterType } = input;

      // Get provider
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Check if we already have a similar macro
      const existingMacros = await ctx.prisma.textMacro.findMany({
        where: {
          providerId: provider.id,
          isActive: true,
        },
      });

      for (const macro of existingMacros) {
        if (calculateTextSimilarity(macro.expansion, text) > 0.85) {
          return {
            created: false,
            existingMacro: macro,
            message: `Similar macro already exists: ${macro.trigger}`,
          };
        }
      }

      // Generate trigger suggestion
      const triggerSuggestion = generateTriggerSuggestion(text, soapSection);

      // Create the learned macro
      const newMacro = await ctx.prisma.textMacro.create({
        data: {
          trigger: triggerSuggestion,
          expansion: text,
          description: 'Learned from your documentation patterns',
          category: soapSection || 'general',
          scope: 'provider',
          encounterTypes: encounterType ? [encounterType] : [],
          soapSections: soapSection ? [soapSection] : [],
          learnedFromProvider: true,
          confidence: 0.7,
          providerId: provider.id,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('AI_MACRO_LEARN', 'TextMacro', {
        entityId: newMacro.id,
        changes: { trigger: triggerSuggestion, soapSection, textLength: text.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        created: true,
        macro: newMacro,
        message: `Created new macro with trigger "${triggerSuggestion}"`,
      };
    }),

  /**
   * Get macro library (organized collection)
   */
  getMacroLibrary: providerProcedure.query(async ({ ctx }) => {
    // Get provider
    const provider = await ctx.prisma.provider.findFirst({
      where: {
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      },
    });

    // Get all available macros
    const macros = await ctx.prisma.textMacro.findMany({
      where: {
        isActive: true,
        OR: [
          { providerId: provider?.id },
          { organizationId: ctx.user.organizationId, scope: 'organization' },
          { isSystem: true },
        ],
      },
      orderBy: [{ category: 'asc' }, { trigger: 'asc' }],
    });

    // Organize into library structure
    const library: Record<string, {
      category: string;
      macros: typeof macros;
      count: number;
    }> = {};

    for (const macro of macros) {
      if (!library[macro.category]) {
        library[macro.category] = {
          category: macro.category,
          macros: [],
          count: 0,
        };
      }
      library[macro.category].macros.push(macro);
      library[macro.category].count++;
    }

    // Get usage stats
    const stats = await ctx.prisma.textMacro.aggregate({
      where: {
        providerId: provider?.id,
      },
      _sum: { usageCount: true },
      _count: true,
    });

    return {
      library,
      categories: Object.keys(library),
      totalMacros: macros.length,
      providerMacroCount: provider ? macros.filter(m => m.providerId === provider.id).length : 0,
      totalUsage: stats._sum.usageCount || 0,
    };
  }),

  /**
   * Get template suggestion statistics
   */
  getTemplateStats: providerProcedure.query(async ({ ctx }) => {
    const [total, accepted, rejected] = await Promise.all([
      ctx.prisma.aITemplateSuggestion.count({
        where: { organizationId: ctx.user.organizationId },
      }),
      ctx.prisma.aITemplateSuggestion.count({
        where: { organizationId: ctx.user.organizationId, status: 'ACCEPTED' },
      }),
      ctx.prisma.aITemplateSuggestion.count({
        where: { organizationId: ctx.user.organizationId, status: 'REJECTED' },
      }),
    ]);

    // Most used templates
    const topTemplates = await ctx.prisma.aITemplateSuggestion.groupBy({
      by: ['suggestedTemplateId'],
      where: {
        organizationId: ctx.user.organizationId,
        status: 'ACCEPTED',
      },
      _count: true,
      orderBy: { _count: { suggestedTemplateId: 'desc' } },
      take: 5,
    });

    return {
      totalSuggestions: total,
      acceptedCount: accepted,
      rejectedCount: rejected,
      acceptanceRate: total > 0 ? `${((accepted / total) * 100).toFixed(1)}%` : '0%',
      topTemplateIds: topTemplates.map(t => t.suggestedTemplateId),
    };
  }),
});

// ============================================
// US-321: Template and Macro Helpers
// ============================================

/**
 * Get common clinical phrases based on partial text and section
 */
function getCommonPhrases(text: string, section?: string): string[] {
  const phrases: Record<string, string[]> = {
    subjective: [
      'Patient reports improvement since last visit.',
      'Pain is described as sharp/dull and localized to',
      'Symptoms are aggravated by prolonged sitting/standing.',
      'Patient denies numbness, tingling, or radiating pain.',
      'Activity level has been modified due to pain.',
    ],
    objective: [
      'Range of motion within normal limits.',
      'Palpatory tenderness noted at',
      'Muscle spasm present in paraspinal musculature.',
      'Orthopedic tests negative for radiculopathy.',
      'Gait and posture observed to be',
    ],
    assessment: [
      'Patient is responding well to treatment.',
      'Condition is improving as evidenced by',
      'Medical necessity continues due to functional limitations.',
      'Progress is consistent with expected outcomes.',
      'Treatment plan modifications indicated.',
    ],
    plan: [
      'Continue current treatment frequency.',
      'Re-evaluate in 4 visits.',
      'Patient to continue home exercises.',
      'Next visit: CMT to affected regions.',
      'Follow up PRN if symptoms worsen.',
    ],
  };

  const sectionPhrases = section ? phrases[section] || [] : Object.values(phrases).flat();

  // Filter by partial text match
  return sectionPhrases.filter(phrase =>
    phrase.toLowerCase().includes(text.toLowerCase())
  ).slice(0, 5);
}

/**
 * Get default normal exam text
 */
function getDefaultNormalExam(examType: string): string {
  const defaults: Record<string, string> = {
    general: `GENERAL: Alert and oriented, no acute distress.
POSTURE: Within normal limits.
GAIT: Normal, symmetric.`,
    cervical: `CERVICAL SPINE:
ROM: Flexion, extension, lateral flexion, and rotation within normal limits.
Palpation: No tenderness or spasm.
Orthopedic: Cervical compression negative, Spurling's negative.
Neurological: Upper extremity sensation, motor, and reflexes intact.`,
    thoracic: `THORACIC SPINE:
ROM: Within normal limits.
Palpation: No tenderness or spasm.
Respiration: Symmetric chest expansion.`,
    lumbar: `LUMBAR SPINE:
ROM: Flexion, extension, lateral flexion, and rotation within normal limits.
Palpation: No tenderness or spasm.
Orthopedic: SLR negative bilaterally, Kemp's negative.
Neurological: Lower extremity sensation, motor, and reflexes intact.`,
    extremity: `EXTREMITIES:
Upper: ROM WNL bilaterally, strength 5/5, no edema.
Lower: ROM WNL bilaterally, strength 5/5, no edema.`,
    neurological: `NEUROLOGICAL:
Cranial Nerves: II-XII intact.
Motor: 5/5 all major muscle groups.
Sensory: Intact to light touch.
Reflexes: 2+ and symmetric.
Coordination: Finger-to-nose and heel-to-shin normal.`,
  };

  return defaults[examType] || defaults.general;
}

/**
 * Calculate text similarity (simple word overlap)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Generate trigger suggestion from text
 */
function generateTriggerSuggestion(text: string, section?: string): string {
  // Get first few meaningful words
  const words = text.toLowerCase().split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'was'].includes(w));

  let trigger = '.';

  if (section) {
    trigger += section.charAt(0); // s, o, a, p
  }

  // Add first letters of first 2-3 words
  trigger += words.slice(0, 3).map(w => w.charAt(0)).join('');

  // Add a number if needed to make unique
  trigger += Math.floor(Math.random() * 10);

  return trigger;
}

// ============================================
// US-320: Provider Preference Learning Helpers
// ============================================

/**
 * Analyze an edit to extract learning patterns
 */
function analyzeEdit(
  section: 'subjective' | 'objective' | 'assessment' | 'plan',
  original: string,
  edited: string,
  reason?: string
): Array<{
  category: string;
  key: string;
  value: Record<string, unknown>;
  description: string;
}> {
  const preferences: Array<{
    category: string;
    key: string;
    value: Record<string, unknown>;
    description: string;
  }> = [];

  if (!original || !edited || original === edited) {
    return preferences;
  }

  // Detect terminology changes
  const termChanges = detectTerminologyChanges(original, edited);
  if (termChanges.length > 0) {
    preferences.push({
      category: 'terminology',
      key: `${section}_replacements`,
      value: { replacements: Object.fromEntries(termChanges) },
      description: `Learned terminology preferences from ${section} edits`,
    });
  }

  // Detect style changes (bullet points vs paragraphs)
  const styleChange = detectStyleChange(original, edited);
  if (styleChange) {
    preferences.push({
      category: 'style',
      key: `${section}_format`,
      value: styleChange,
      description: `Learned ${section} formatting preference`,
    });
  }

  // Detect phrase additions
  const addedPhrases = detectAddedPhrases(original, edited);
  if (addedPhrases.length > 0) {
    preferences.push({
      category: 'phrases',
      key: `${section}_additions`,
      value: { phrases: addedPhrases },
      description: `Learned preferred phrases for ${section}`,
    });
  }

  return preferences;
}

/**
 * Detect terminology replacements in an edit
 */
function detectTerminologyChanges(original: string, edited: string): [string, string][] {
  const changes: [string, string][] = [];

  // Simple word-level diff
  const originalWords = original.toLowerCase().split(/\s+/);
  const editedWords = edited.toLowerCase().split(/\s+/);

  // Build word frequency maps
  const originalFreq = new Map<string, number>();
  const editedFreq = new Map<string, number>();

  for (const word of originalWords) {
    originalFreq.set(word, (originalFreq.get(word) || 0) + 1);
  }
  for (const word of editedWords) {
    editedFreq.set(word, (editedFreq.get(word) || 0) + 1);
  }

  // Find words that decreased in original and increased in edited
  const removedWords = new Set<string>();
  const addedWords = new Set<string>();

  for (const [word, count] of originalFreq) {
    const editedCount = editedFreq.get(word) || 0;
    if (editedCount < count && word.length > 3) {
      removedWords.add(word);
    }
  }

  for (const [word, count] of editedFreq) {
    const originalCount = originalFreq.get(word) || 0;
    if (count > originalCount && word.length > 3) {
      addedWords.add(word);
    }
  }

  // Try to match removed words with added words (potential replacements)
  for (const removed of removedWords) {
    for (const added of addedWords) {
      // Simple heuristic: similar length or medical-sounding
      if (Math.abs(removed.length - added.length) <= 3) {
        changes.push([removed, added]);
        addedWords.delete(added);
        break;
      }
    }
  }

  return changes;
}

/**
 * Detect style changes (e.g., bullet points vs paragraphs)
 */
function detectStyleChange(original: string, edited: string): Record<string, unknown> | null {
  const originalHasBullets = /^[\s]*[•\-\*]/m.test(original);
  const editedHasBullets = /^[\s]*[•\-\*]/m.test(edited);

  if (!originalHasBullets && editedHasBullets) {
    return { useBulletPoints: true, enabled: true };
  }

  if (originalHasBullets && !editedHasBullets) {
    return { useBulletPoints: false, enabled: false };
  }

  // Check for numbered lists
  const originalHasNumbers = /^\s*\d+[.)]/m.test(original);
  const editedHasNumbers = /^\s*\d+[.)]/m.test(edited);

  if (!originalHasNumbers && editedHasNumbers) {
    return { useNumberedLists: true, enabled: true };
  }

  return null;
}

/**
 * Detect phrases that were added to the edited version
 */
function detectAddedPhrases(original: string, edited: string): string[] {
  const addedPhrases: string[] = [];

  // Split into sentences
  const originalSentences = new Set(
    original.split(/[.!?]\s+/).map(s => s.trim().toLowerCase())
  );
  const editedSentences = edited.split(/[.!?]\s+/).map(s => s.trim());

  for (const sentence of editedSentences) {
    if (sentence.length > 10 && !originalSentences.has(sentence.toLowerCase())) {
      // This sentence was added
      addedPhrases.push(sentence);
    }
  }

  // Also look for specific phrase patterns (closing phrases, standard notes)
  const closingPatterns = [
    /will follow up/i,
    /return in/i,
    /patient tolerated/i,
    /continue current/i,
    /as needed/i,
    /prn/i,
  ];

  for (const pattern of closingPatterns) {
    if (!pattern.test(original) && pattern.test(edited)) {
      const match = edited.match(pattern);
      if (match) {
        // Extract the full sentence containing this pattern
        const idx = edited.toLowerCase().indexOf(match[0].toLowerCase());
        const start = edited.lastIndexOf('.', idx) + 1;
        const end = edited.indexOf('.', idx);
        if (end > start) {
          addedPhrases.push(edited.slice(start, end).trim());
        }
      }
    }
  }

  return [...new Set(addedPhrases)].slice(0, 5); // Limit to 5 phrases
}

/**
 * Analyze style patterns from historical notes
 */
function analyzeStylePatterns(
  notes: Array<{
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
  }>
): Array<{
  category: string;
  key: string;
  value: Record<string, unknown>;
  description: string;
}> {
  const preferences: Array<{
    category: string;
    key: string;
    value: Record<string, unknown>;
    description: string;
  }> = [];

  // Count bullet point usage
  let bulletCount = 0;
  let numberedCount = 0;
  let totalSections = 0;

  for (const note of notes) {
    for (const section of [note.subjective, note.objective, note.assessment, note.plan]) {
      if (section) {
        totalSections++;
        if (/^[\s]*[•\-\*]/m.test(section)) bulletCount++;
        if (/^\s*\d+[.)]/m.test(section)) numberedCount++;
      }
    }
  }

  if (totalSections > 0) {
    if (bulletCount / totalSections > 0.5) {
      preferences.push({
        category: 'style',
        key: 'useBulletPoints',
        value: { enabled: true, frequency: bulletCount / totalSections },
        description: 'Prefers bullet point formatting',
      });
    }

    if (numberedCount / totalSections > 0.5) {
      preferences.push({
        category: 'style',
        key: 'useNumberedLists',
        value: { enabled: true, frequency: numberedCount / totalSections },
        description: 'Prefers numbered list formatting',
      });
    }
  }

  return preferences;
}

/**
 * Analyze terminology patterns from historical notes
 */
function analyzeTerminologyPatterns(
  notes: Array<{
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
  }>
): Array<{
  category: string;
  key: string;
  value: Record<string, unknown>;
  description: string;
}> {
  const preferences: Array<{
    category: string;
    key: string;
    value: Record<string, unknown>;
    description: string;
  }> = [];

  // Common medical abbreviations and their full forms
  const abbreviationPairs: [string, string][] = [
    ['c/o', 'complains of'],
    ['pt', 'patient'],
    ['hx', 'history'],
    ['dx', 'diagnosis'],
    ['tx', 'treatment'],
    ['rx', 'prescription'],
    ['rom', 'range of motion'],
    ['wdwn', 'well-developed, well-nourished'],
    ['wnl', 'within normal limits'],
    ['nad', 'no acute distress'],
  ];

  // Count usage
  const usageCount: Record<string, { abbr: number; full: number }> = {};

  for (const [abbr, full] of abbreviationPairs) {
    usageCount[abbr] = { abbr: 0, full: 0 };
    for (const note of notes) {
      const allText = [note.subjective, note.objective, note.assessment, note.plan]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (new RegExp(`\\b${abbr}\\b`, 'i').test(allText)) usageCount[abbr].abbr++;
      if (allText.includes(full.toLowerCase())) usageCount[abbr].full++;
    }
  }

  // Determine preferences
  const replacements: Record<string, string> = {};
  for (const [abbr, full] of abbreviationPairs) {
    const counts = usageCount[abbr];
    if (counts.abbr > counts.full && counts.abbr >= 3) {
      // Provider prefers abbreviations
      replacements[full] = abbr;
    } else if (counts.full > counts.abbr && counts.full >= 3) {
      // Provider prefers full forms
      replacements[abbr] = full;
    }
  }

  if (Object.keys(replacements).length > 0) {
    preferences.push({
      category: 'terminology',
      key: 'abbreviation_preferences',
      value: { replacements },
      description: 'Learned abbreviation vs full form preferences',
    });
  }

  return preferences;
}

/**
 * Analyze documentation depth preferences
 */
function analyzeDocumentationDepth(
  notes: Array<{
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
  }>
): Array<{
  category: string;
  key: string;
  value: Record<string, unknown>;
  description: string;
}> {
  const preferences: Array<{
    category: string;
    key: string;
    value: Record<string, unknown>;
    description: string;
  }> = [];

  // Calculate average word counts per section
  const wordCounts: Record<string, number[]> = {
    subjective: [],
    objective: [],
    assessment: [],
    plan: [],
  };

  for (const note of notes) {
    if (note.subjective) wordCounts.subjective.push(note.subjective.split(/\s+/).length);
    if (note.objective) wordCounts.objective.push(note.objective.split(/\s+/).length);
    if (note.assessment) wordCounts.assessment.push(note.assessment.split(/\s+/).length);
    if (note.plan) wordCounts.plan.push(note.plan.split(/\s+/).length);
  }

  const avgCounts: Record<string, number> = {};
  for (const [section, counts] of Object.entries(wordCounts)) {
    if (counts.length > 0) {
      avgCounts[section] = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
    }
  }

  const totalAvg = Object.values(avgCounts).reduce((a, b) => a + b, 0);

  // Classify depth level
  let level: 'brief' | 'standard' | 'detailed' | 'comprehensive';
  if (totalAvg < 100) {
    level = 'brief';
  } else if (totalAvg < 200) {
    level = 'standard';
  } else if (totalAvg < 350) {
    level = 'detailed';
  } else {
    level = 'comprehensive';
  }

  preferences.push({
    category: 'depth',
    key: 'documentation_depth',
    value: {
      level,
      avgWordCount: totalAvg,
      sectionCounts: avgCounts,
    },
    description: `Documentation depth: ${level} (avg ${totalAvg} words)`,
  });

  return preferences;
}

/**
 * Analyze common phrase patterns
 */
function analyzePhrasePatterns(
  notes: Array<{
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
  }>
): Array<{
  category: string;
  key: string;
  value: Record<string, unknown>;
  description: string;
}> {
  const preferences: Array<{
    category: string;
    key: string;
    value: Record<string, unknown>;
    description: string;
  }> = [];

  // Look for common closing phrases in plan
  const closingPhrases: Record<string, number> = {};
  const planRegex = /(?:will|should|recommend|advised|instructed)[^.!?]*[.!?]/gi;

  for (const note of notes) {
    if (note.plan) {
      const matches = note.plan.match(planRegex);
      if (matches) {
        for (const match of matches) {
          const normalized = match.toLowerCase().trim();
          closingPhrases[normalized] = (closingPhrases[normalized] || 0) + 1;
        }
      }
    }
  }

  // Find phrases used in >30% of notes
  const threshold = Math.max(2, notes.length * 0.3);
  const commonPhrases = Object.entries(closingPhrases)
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase]) => phrase);

  if (commonPhrases.length > 0) {
    preferences.push({
      category: 'phrases',
      key: 'common_closing_phrases',
      value: { phrases: commonPhrases },
      description: 'Commonly used closing phrases',
    });
  }

  // Look for opening phrases in subjective
  const openingPhrases: Record<string, number> = {};

  for (const note of notes) {
    if (note.subjective) {
      // Get first sentence
      const firstSentence = note.subjective.split(/[.!?]/)[0].toLowerCase().trim();
      if (firstSentence.length > 10 && firstSentence.length < 100) {
        openingPhrases[firstSentence] = (openingPhrases[firstSentence] || 0) + 1;
      }
    }
  }

  const commonOpenings = Object.entries(openingPhrases)
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([phrase]) => phrase);

  if (commonOpenings.length > 0) {
    preferences.push({
      category: 'phrases',
      key: 'common_opening_phrases',
      value: { phrases: commonOpenings },
      description: 'Commonly used opening phrases in subjective',
    });
  }

  return preferences;
}

/**
 * Upsert a provider preference
 */
async function upsertProviderPreference(
  prisma: import('@prisma/client').PrismaClient,
  providerId: string,
  organizationId: string,
  category: string,
  preferenceKey: string,
  preferenceValue: Record<string, unknown>,
  description: string | undefined,
  source: string
): Promise<{
  id: string;
  category: string;
  preferenceKey: string;
  preferenceValue: Prisma.JsonValue;
  confidenceScore: number;
  description: string | null;
}> {
  // Check if preference already exists
  const existing = await prisma.providerPreference.findFirst({
    where: {
      providerId,
      category,
      preferenceKey,
    },
  });

  if (existing) {
    // Update existing preference
    const currentExamples = (existing.examples as unknown[] | null) || [];
    const newExamples = [...currentExamples, preferenceValue].slice(-10); // Keep last 10

    return prisma.providerPreference.update({
      where: { id: existing.id },
      data: {
        preferenceValue: preferenceValue as Prisma.InputJsonValue,
        learnedFrom: existing.learnedFrom + 1,
        confidenceScore: Math.min(1.0, existing.confidenceScore + 0.05),
        lastUpdated: new Date(),
        examples: newExamples as Prisma.InputJsonValue,
        source,
        isActive: true,
      },
      select: {
        id: true,
        category: true,
        preferenceKey: true,
        preferenceValue: true,
        confidenceScore: true,
        description: true,
      },
    });
  }

  // Create new preference
  return prisma.providerPreference.create({
    data: {
      providerId,
      organizationId,
      category,
      preferenceKey,
      preferenceValue: preferenceValue as Prisma.InputJsonValue,
      description,
      source,
      learnedFrom: 1,
      confidenceScore: 0.5,
      examples: [preferenceValue] as Prisma.InputJsonValue,
      isActive: true,
    },
    select: {
      id: true,
      category: true,
      preferenceKey: true,
      preferenceValue: true,
      confidenceScore: true,
      description: true,
    },
  });
}

// ============================================
// Helper Functions
// ============================================

/**
 * Simple speaker detection based on content patterns
 * In production, this would use ML-based speaker diarization
 */
function detectSpeaker(text: string): 'provider' | 'patient' | 'unknown' {
  const lowerText = text.toLowerCase();

  // Provider indicators
  const providerPatterns = [
    'i recommend',
    'my assessment',
    'let me examine',
    'i\'ll adjust',
    'the diagnosis',
    'your x-ray shows',
    'based on my examination',
    'i\'m going to',
    'treatment plan',
  ];

  // Patient indicators
  const patientPatterns = [
    'it hurts',
    'i feel',
    'my pain',
    'i\'ve been having',
    'it started',
    'when i',
    'i can\'t',
    'i noticed',
    'my symptoms',
  ];

  for (const pattern of providerPatterns) {
    if (lowerText.includes(pattern)) return 'provider';
  }

  for (const pattern of patientPatterns) {
    if (lowerText.includes(pattern)) return 'patient';
  }

  return 'unknown';
}

/**
 * Detect medical terms in text
 * Uses a simple pattern matching approach
 */
function detectMedicalTerms(text: string): string[] {
  const lowerText = text.toLowerCase();
  const foundTerms: string[] = [];

  // Common chiropractic and medical terms
  const medicalTerms = [
    'subluxation',
    'vertebra',
    'cervical',
    'thoracic',
    'lumbar',
    'sacral',
    'sciatica',
    'herniated',
    'disc',
    'spinal',
    'adjustment',
    'manipulation',
    'radiculopathy',
    'stenosis',
    'scoliosis',
    'kyphosis',
    'lordosis',
    'facet',
    'palpation',
    'range of motion',
    'rom',
    'flexion',
    'extension',
    'rotation',
    'lateral bend',
    'paresthesia',
    'numbness',
    'tingling',
    'weakness',
    'myalgia',
    'arthralgia',
    'inflammation',
    'edema',
    'spasm',
    'trigger point',
    'referred pain',
    'acute',
    'chronic',
    'bilateral',
    'unilateral',
  ];

  for (const term of medicalTerms) {
    if (lowerText.includes(term)) {
      foundTerms.push(term);
    }
  }

  return foundTerms;
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// Type for code suggestion data before DB insertion
interface AICodeSuggestionData {
  codeType: string;
  suggestedCode: string;
  codeDescription: string | null;
  reasoning: string;
  confidence: number;
  rank: number;
  codeValid: boolean;
  specificityOk: boolean;
  modifiersNeeded?: { modifier: string; description: string; reason: string }[];
  alternatives: { code: string; description: string; reason: string }[];
  upcodingRisk: boolean;
  downcodingRisk: boolean;
  auditRisk: string;
  isChiroCommon: boolean;
  relevantText: string | null;
}

/**
 * Build a string representation of SOAP note content
 */
function buildSOAPString(note: { subjective?: string | null; objective?: string | null; assessment?: string | null; plan?: string | null }): string {
  const parts: string[] = [];
  if (note.subjective) parts.push(`SUBJECTIVE:\n${note.subjective}`);
  if (note.objective) parts.push(`OBJECTIVE:\n${note.objective}`);
  if (note.assessment) parts.push(`ASSESSMENT:\n${note.assessment}`);
  if (note.plan) parts.push(`PLAN:\n${note.plan}`);
  return parts.join('\n\n');
}

/**
 * Check code specificity and suggest more specific alternatives
 */
function checkCodeSpecificity(code: string, codeType: string): { issue: string; alternatives: { code: string; description: string; reason: string }[] } | null {
  // Common unspecified codes that need more specificity
  const unspecifiedCodes: Record<string, { issue: string; alternatives: { code: string; description: string; reason: string }[] }> = {
    // ICD-10 low back pain codes
    'M54.50': {
      issue: 'Unspecified low back pain - consider more specific laterality',
      alternatives: [
        { code: 'M54.51', description: 'Vertebrogenic low back pain', reason: 'If related to vertebral origin' },
        { code: 'M54.59', description: 'Other low back pain', reason: 'If not vertebrogenic' },
      ],
    },
    'M54.5': {
      issue: 'Unspecified low back pain - needs 5th character',
      alternatives: [
        { code: 'M54.50', description: 'Low back pain, unspecified', reason: 'Default unspecified' },
        { code: 'M54.51', description: 'Vertebrogenic low back pain', reason: 'If related to vertebral origin' },
      ],
    },
    // Neck pain
    'M54.2': {
      issue: 'Cervicalgia - consider specific segment if known',
      alternatives: [
        { code: 'M54.2', description: 'Cervicalgia', reason: 'Appropriate if segment not specified' },
      ],
    },
    // Somatic dysfunction codes
    'M99.00': {
      issue: 'Segmental dysfunction - specify region',
      alternatives: [
        { code: 'M99.01', description: 'Segmental dysfunction - cervical', reason: 'For cervical findings' },
        { code: 'M99.02', description: 'Segmental dysfunction - thoracic', reason: 'For thoracic findings' },
        { code: 'M99.03', description: 'Segmental dysfunction - lumbar', reason: 'For lumbar findings' },
        { code: 'M99.04', description: 'Segmental dysfunction - sacral', reason: 'For sacral findings' },
      ],
    },
  };

  if (codeType === 'ICD10' && unspecifiedCodes[code]) {
    return unspecifiedCodes[code];
  }

  return null;
}

/**
 * Assess upcoding/downcoding risk for a code
 */
function assessCodingRisk(code: string, soapContent: string, codeType: string): { upcodingRisk: boolean; downcodingRisk: boolean; auditRisk: string } {
  let upcodingRisk = false;
  let downcodingRisk = false;
  let auditRisk = 'low';
  const soapLower = soapContent.toLowerCase();

  if (codeType === 'CPT') {
    // Check CMT codes against documentation
    if (code === '98942') {
      // 5+ regions - check if documentation supports
      const regionCount = countSpinalRegions(soapLower);
      if (regionCount < 5) {
        upcodingRisk = true;
        auditRisk = 'high';
      }
    } else if (code === '98941') {
      // 3-4 regions
      const regionCount = countSpinalRegions(soapLower);
      if (regionCount < 3) {
        upcodingRisk = true;
        auditRisk = 'medium';
      } else if (regionCount >= 5) {
        downcodingRisk = true;
        auditRisk = 'low';
      }
    } else if (code === '98940') {
      // 1-2 regions
      const regionCount = countSpinalRegions(soapLower);
      if (regionCount >= 3) {
        downcodingRisk = true;
        auditRisk = 'low';
      }
    }

    // E/M code checks
    if (code === '99215') {
      // High complexity - check for complex documentation
      if (!soapLower.includes('complex') && !soapLower.includes('multiple') && soapLower.length < 500) {
        upcodingRisk = true;
        auditRisk = 'high';
      }
    }
  } else if (codeType === 'ICD10') {
    // Check for specificity issues that could be considered upcoding
    if (code.includes('acute') && !soapLower.includes('acute')) {
      upcodingRisk = true;
      auditRisk = 'medium';
    }
    if (code.includes('chronic') && soapLower.includes('acute') && !soapLower.includes('chronic')) {
      upcodingRisk = true;
      auditRisk = 'medium';
    }
  }

  return { upcodingRisk, downcodingRisk, auditRisk };
}

/**
 * Count spinal regions mentioned in documentation
 */
function countSpinalRegions(text: string): number {
  let count = 0;
  const regions = ['cervical', 'thoracic', 'lumbar', 'sacral', 'pelvic'];
  for (const region of regions) {
    if (text.includes(region)) count++;
  }
  // Also check for C, T, L, S notations
  if (/\bc\d/.test(text) || text.includes('c-spine')) count = Math.max(count, 1);
  if (/\bt\d/.test(text) || text.includes('t-spine')) count = Math.max(count, 2);
  if (/\bl\d/.test(text) || text.includes('l-spine')) count = Math.max(count, 3);
  if (/\bs\d/.test(text) || text.includes('sacrum') || text.includes('si joint')) count = Math.max(count, 4);
  return count;
}

/**
 * Suggest modifiers for CPT codes
 */
function suggestModifiers(cptCode: string, soapContent: string): { modifier: string; description: string; reason: string }[] {
  const modifiers: { modifier: string; description: string; reason: string }[] = [];
  const soapLower = soapContent.toLowerCase();

  // Check for laterality modifiers
  if (['97110', '97140', '97530', '97112'].includes(cptCode)) {
    if (soapLower.includes('bilateral') || (soapLower.includes('left') && soapLower.includes('right'))) {
      modifiers.push({
        modifier: '50',
        description: 'Bilateral procedure',
        reason: 'Documentation indicates bilateral treatment',
      });
    }
  }

  // Check for distinct procedural service
  if (soapLower.includes('separate') || soapLower.includes('distinct')) {
    modifiers.push({
      modifier: '59',
      description: 'Distinct procedural service',
      reason: 'May need if performed during same session as another procedure',
    });
  }

  // GP modifier for Medicare PT/chiro
  if (cptCode.startsWith('971') || cptCode.startsWith('989')) {
    modifiers.push({
      modifier: 'GP',
      description: 'Services delivered under physical therapy plan',
      reason: 'Required for Medicare claims for therapy services',
    });
  }

  // AT modifier for CMT (active treatment)
  if (['98940', '98941', '98942'].includes(cptCode)) {
    modifiers.push({
      modifier: 'AT',
      description: 'Acute treatment',
      reason: 'Required for Medicare chiropractic manipulation claims',
    });
  }

  return modifiers;
}

/**
 * Extract relevant text from SOAP that supports a code
 */
function extractRelevantText(soapContent: string, code: string): string | null {
  // Common keywords associated with codes
  const codeKeywords: Record<string, string[]> = {
    // ICD-10 codes
    'M54.50': ['low back', 'lumbar', 'lumbago'],
    'M54.51': ['vertebrogenic', 'vertebral', 'spinal'],
    'M54.2': ['neck', 'cervical', 'cervicalgia'],
    'M99.01': ['cervical', 'c-spine', 'subluxation'],
    'M99.02': ['thoracic', 't-spine'],
    'M99.03': ['lumbar', 'l-spine'],
    'M99.04': ['sacral', 'sacrum', 'si joint'],
    'M62.830': ['spasm', 'muscle spasm'],
    // CPT codes
    '98940': ['adjustment', 'manipulation', '1-2 region'],
    '98941': ['adjustment', 'manipulation', '3-4 region'],
    '98942': ['adjustment', 'manipulation', '5+ region'],
    '97110': ['exercise', 'therapeutic exercise'],
    '97140': ['manual therapy', 'mobilization'],
    '99213': ['established', 'follow-up'],
    '99203': ['new patient', 'initial'],
  };

  const keywords = codeKeywords[code];
  if (!keywords) return null;

  const soapLower = soapContent.toLowerCase();
  const sentences = soapContent.split(/[.!?]+/);

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    for (const keyword of keywords) {
      if (sentenceLower.includes(keyword)) {
        return sentence.trim().slice(0, 200); // Return first 200 chars of matching sentence
      }
    }
  }

  return null;
}

/**
 * Apply provider style preferences to generated SOAP note
 * Modifies content based on learned preferences for terminology, format, etc.
 */
function applyProviderStyle(
  soapResult: { subjective?: string; objective?: string; assessment?: string; plan?: string; confidence: number },
  preferences: Record<string, unknown>[]
): {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  matchScore: number;
  appliedElements: string[];
} {
  const result: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    matchScore: number;
    appliedElements: string[];
  } = {
    matchScore: 0,
    appliedElements: [],
  };

  let appliedCount = 0;
  const totalPreferences = preferences.length;

  for (const pref of preferences) {
    const category = pref.category as string;
    const key = pref.key as string;
    const value = pref.value as Record<string, unknown>;

    switch (category) {
      case 'terminology':
        // Replace standard terms with provider's preferred terminology
        if (value.replacements && typeof value.replacements === 'object') {
          const replacements = value.replacements as Record<string, string>;
          for (const [original, replacement] of Object.entries(replacements)) {
            if (soapResult.subjective?.includes(original)) {
              result.subjective = (result.subjective || soapResult.subjective).replace(
                new RegExp(original, 'gi'),
                replacement
              );
              appliedCount++;
              result.appliedElements.push(`terminology:${key}`);
            }
            if (soapResult.objective?.includes(original)) {
              result.objective = (result.objective || soapResult.objective).replace(
                new RegExp(original, 'gi'),
                replacement
              );
            }
            if (soapResult.assessment?.includes(original)) {
              result.assessment = (result.assessment || soapResult.assessment).replace(
                new RegExp(original, 'gi'),
                replacement
              );
            }
            if (soapResult.plan?.includes(original)) {
              result.plan = (result.plan || soapResult.plan).replace(
                new RegExp(original, 'gi'),
                replacement
              );
            }
          }
        }
        break;

      case 'style':
        // Apply style preferences (e.g., bullet points vs paragraphs)
        if (key === 'useBulletPoints' && value.enabled) {
          // Convert paragraph text to bullet points where appropriate
          if (soapResult.plan && !soapResult.plan.includes('•') && !soapResult.plan.includes('-')) {
            const sentences = soapResult.plan.split(/\. (?=[A-Z])/);
            if (sentences.length > 1) {
              result.plan = sentences.map(s => `• ${s.trim()}`).join('\n');
              appliedCount++;
              result.appliedElements.push('style:bulletPoints');
            }
          }
        }
        break;

      case 'format':
        // Apply formatting preferences
        if (key === 'objectiveFormat' && value.template) {
          // Provider has a specific objective format they prefer
          appliedCount++;
          result.appliedElements.push('format:objective');
        }
        break;

      case 'phrases':
        // Add preferred phrases or signatures
        if (value.closingPhrase && typeof value.closingPhrase === 'string') {
          if (soapResult.plan) {
            result.plan = (result.plan || soapResult.plan) + `\n\n${value.closingPhrase}`;
            appliedCount++;
            result.appliedElements.push('phrases:closing');
          }
        }
        break;
    }
  }

  // Calculate match score based on how many preferences were successfully applied
  result.matchScore = totalPreferences > 0 ? appliedCount / totalPreferences : 0;

  return result;
}

// ============================================
// Compliance Types and Constants
// ============================================

interface ComplianceIssue {
  issueType: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  title: string;
  description: string;
  soapSection?: string;
  fieldPath?: string;
  requirementSource?: string;
  requirementCode?: string;
  payerSpecific?: string;
  suggestion?: string;
  exampleFix?: string;
  autoFixable: boolean;
  suggestedText?: string;
  auditRiskImpact?: number;
  denialRisk?: number;
}

// Required elements by encounter type for chiropractic documentation
const REQUIRED_ELEMENTS: Record<string, {
  subjective: string[];
  objective: string[];
  assessment: string[];
  plan: string[];
}> = {
  INITIAL_EVAL: {
    subjective: ['chief complaint', 'history', 'duration', 'pain level', 'mechanism of injury'],
    objective: ['examination findings', 'range of motion', 'palpation', 'neurological', 'orthopedic tests'],
    assessment: ['diagnosis', 'prognosis', 'medical necessity'],
    plan: ['treatment plan', 'frequency', 'duration', 'goals'],
  },
  FOLLOW_UP: {
    subjective: ['progress', 'pain level', 'functional status'],
    objective: ['examination findings', 'range of motion', 'palpation'],
    assessment: ['response to treatment', 'modified assessment'],
    plan: ['continued treatment', 'modifications', 'progress notes'],
  },
  RE_EVALUATION: {
    subjective: ['progress since initial', 'current complaints', 'functional changes'],
    objective: ['comparative findings', 'range of motion', 'outcome measures'],
    assessment: ['progress assessment', 'continued necessity'],
    plan: ['updated goals', 'revised plan', 'discharge criteria'],
  },
  DISCHARGE: {
    subjective: ['final status', 'patient satisfaction', 'residual symptoms'],
    objective: ['final examination', 'outcome measurements'],
    assessment: ['treatment outcomes', 'goal achievement'],
    plan: ['home exercise program', 'maintenance recommendations', 'follow-up'],
  },
};

// Medical necessity keywords that should be present
const MEDICAL_NECESSITY_KEYWORDS = [
  'medical necessity',
  'medically necessary',
  'functional limitation',
  'functional deficit',
  'daily activities',
  'activities of daily living',
  'adl',
  'work restriction',
  'disability',
  'impairment',
  'pain prevents',
  'unable to',
  'difficulty with',
  'limited in',
  'improvement expected',
  'prognosis',
];

// Payer-specific requirements
const PAYER_REQUIREMENTS: Record<string, {
  name: string;
  requirements: {
    element: string;
    section: string;
    description: string;
    isCritical: boolean;
  }[];
}> = {
  MEDICARE: {
    name: 'Medicare',
    requirements: [
      { element: 'subluxation', section: 'assessment', description: 'Must document subluxation with specific level', isCritical: true },
      { element: 'medical necessity', section: 'assessment', description: 'Must establish medical necessity for CMT', isCritical: true },
      { element: 'functional improvement', section: 'objective', description: 'Must document functional improvement or plateau', isCritical: true },
      { element: 'active treatment', section: 'plan', description: 'Must be active corrective treatment, not maintenance', isCritical: true },
      { element: 'x-ray findings', section: 'objective', description: 'X-ray findings must support subluxation (if applicable)', isCritical: false },
    ],
  },
  BLUE_CROSS: {
    name: 'Blue Cross Blue Shield',
    requirements: [
      { element: 'diagnosis codes', section: 'assessment', description: 'Must include specific ICD-10 codes', isCritical: true },
      { element: 'treatment goals', section: 'plan', description: 'Must include measurable treatment goals', isCritical: true },
      { element: 'prior auth', section: 'plan', description: 'May require prior authorization after initial visits', isCritical: false },
    ],
  },
  UNITED: {
    name: 'United Healthcare',
    requirements: [
      { element: 'outcome measures', section: 'objective', description: 'Must include standardized outcome measures', isCritical: true },
      { element: 'visit limits', section: 'plan', description: 'Document awareness of visit limits', isCritical: false },
    ],
  },
  AETNA: {
    name: 'Aetna',
    requirements: [
      { element: 'treatment frequency', section: 'plan', description: 'Must justify treatment frequency', isCritical: true },
      { element: 'duration', section: 'plan', description: 'Must specify expected treatment duration', isCritical: true },
    ],
  },
  WORKERS_COMP: {
    name: 'Workers Compensation',
    requirements: [
      { element: 'mechanism of injury', section: 'subjective', description: 'Must document work-related mechanism of injury', isCritical: true },
      { element: 'work status', section: 'plan', description: 'Must document work restrictions and return to work plan', isCritical: true },
      { element: 'causation', section: 'assessment', description: 'Must establish causal relationship to work injury', isCritical: true },
      { element: 'maximum medical improvement', section: 'assessment', description: 'Must address MMI if applicable', isCritical: false },
    ],
  },
  AUTO_PIP: {
    name: 'Auto/PIP Insurance',
    requirements: [
      { element: 'accident details', section: 'subjective', description: 'Must document accident mechanism and date', isCritical: true },
      { element: 'causation', section: 'assessment', description: 'Must establish injuries are accident-related', isCritical: true },
      { element: 'functional impact', section: 'objective', description: 'Must document functional limitations from accident', isCritical: true },
    ],
  },
};

// Audit risk factors
const AUDIT_RISK_FACTORS = {
  missingElements: 10,
  vagueDiagnosis: 15,
  insufficientMedicalNecessity: 20,
  missingOutcomeMeasures: 10,
  frequencyNotJustified: 15,
  clonedNote: 25,
  missingGoals: 10,
  highCodeComplexity: 15,
  missingSignature: 5,
};

// ============================================
// Compliance Helper Functions
// ============================================

/**
 * Check for required elements in SOAP note
 */
function checkRequiredElements(
  soapContent: { subjective?: string | null; objective?: string | null; assessment?: string | null; plan?: string | null },
  requiredElements: { subjective: string[]; objective: string[]; assessment: string[]; plan: string[] },
  encounterType: string
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  const sections: Array<'subjective' | 'objective' | 'assessment' | 'plan'> = ['subjective', 'objective', 'assessment', 'plan'];

  for (const section of sections) {
    const content = soapContent[section]?.toLowerCase() || '';
    const required = requiredElements[section] || [];

    // Check if section is empty
    if (!content || content.trim().length < 10) {
      issues.push({
        issueType: 'MISSING_SECTION',
        severity: section === 'assessment' || section === 'plan' ? 'ERROR' : 'WARNING',
        title: `Missing ${section.charAt(0).toUpperCase() + section.slice(1)} Section`,
        description: `The ${section} section is missing or too brief for a ${encounterType.replace(/_/g, ' ').toLowerCase()} encounter.`,
        soapSection: section,
        requirementSource: 'CMS Documentation Guidelines',
        suggestion: `Add detailed ${section} documentation including: ${required.join(', ')}.`,
        autoFixable: false,
        auditRiskImpact: 15,
        denialRisk: section === 'assessment' ? 0.6 : 0.3,
      });
      continue;
    }

    // Check for required elements within section
    for (const element of required) {
      const elementVariations = getElementVariations(element);
      const found = elementVariations.some(variation => content.includes(variation.toLowerCase()));

      if (!found) {
        issues.push({
          issueType: 'MISSING_ELEMENT',
          severity: isElementCritical(element, encounterType) ? 'ERROR' : 'WARNING',
          title: `Missing: ${element.charAt(0).toUpperCase() + element.slice(1)}`,
          description: `The ${section} section should document ${element} for a ${encounterType.replace(/_/g, ' ').toLowerCase()} encounter.`,
          soapSection: section,
          fieldPath: element,
          requirementSource: 'CMS Documentation Guidelines',
          suggestion: getSuggestionForElement(element, section),
          exampleFix: getExampleForElement(element),
          autoFixable: false,
          auditRiskImpact: isElementCritical(element, encounterType) ? 15 : 8,
          denialRisk: isElementCritical(element, encounterType) ? 0.4 : 0.2,
        });
      }
    }
  }

  return issues;
}

/**
 * Check medical necessity documentation
 */
function checkMedicalNecessity(
  soapContent: { subjective?: string | null; objective?: string | null; assessment?: string | null; plan?: string | null },
  encounterType: string
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const fullContent = Object.values(soapContent).filter(Boolean).join(' ').toLowerCase();

  // Check for medical necessity keywords
  const foundKeywords = MEDICAL_NECESSITY_KEYWORDS.filter(kw => fullContent.includes(kw.toLowerCase()));

  if (foundKeywords.length === 0) {
    issues.push({
      issueType: 'MEDICAL_NECESSITY',
      severity: 'CRITICAL',
      title: 'Missing Medical Necessity Documentation',
      description: 'The note does not clearly establish medical necessity for treatment. This is required for insurance reimbursement.',
      requirementSource: 'CMS/Payer Guidelines',
      suggestion: 'Document specific functional limitations, impact on daily activities, and expected improvement with treatment.',
      exampleFix: 'Example: "Patient reports difficulty with daily activities including dressing, driving, and work duties due to cervical pain. Treatment is medically necessary to restore function and reduce disability."',
      autoFixable: true,
      suggestedText: 'Treatment is medically necessary to address functional limitations affecting activities of daily living. Patient demonstrates objective deficits that are expected to improve with continued care.',
      auditRiskImpact: 25,
      denialRisk: 0.7,
    });
  } else if (foundKeywords.length < 2) {
    issues.push({
      issueType: 'MEDICAL_NECESSITY',
      severity: 'WARNING',
      title: 'Weak Medical Necessity Documentation',
      description: 'Medical necessity documentation could be strengthened with additional functional impact details.',
      requirementSource: 'CMS/Payer Guidelines',
      suggestion: 'Add more specific functional limitations and treatment goals.',
      autoFixable: false,
      auditRiskImpact: 10,
      denialRisk: 0.3,
    });
  }

  // Check for functional goals if this is not a discharge
  if (encounterType !== 'DISCHARGE') {
    const goalKeywords = ['goal', 'objective', 'target', 'aim', 'improve', 'restore', 'return to'];
    const hasGoals = goalKeywords.some(kw => fullContent.includes(kw));

    if (!hasGoals) {
      issues.push({
        issueType: 'MISSING_GOALS',
        severity: 'ERROR',
        title: 'Missing Treatment Goals',
        description: 'The note should include specific, measurable treatment goals.',
        soapSection: 'plan',
        requirementSource: 'CMS Documentation Guidelines',
        suggestion: 'Add measurable goals such as: "Goal: Reduce pain from 7/10 to 3/10 and restore cervical ROM to 80% of normal within 4 weeks."',
        autoFixable: true,
        suggestedText: 'Treatment Goals:\n- Reduce pain to functional level (≤3/10)\n- Restore normal range of motion\n- Return to full work/ADL activities',
        auditRiskImpact: 12,
        denialRisk: 0.4,
      });
    }
  }

  return issues;
}

/**
 * Check payer-specific requirements
 */
function checkPayerRequirements(
  soapContent: { subjective?: string | null; objective?: string | null; assessment?: string | null; plan?: string | null },
  payerType: string
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const payerReqs = PAYER_REQUIREMENTS[payerType];

  if (!payerReqs) {
    return issues;
  }

  const sectionContent: Record<string, string> = {
    subjective: (soapContent.subjective || '').toLowerCase(),
    objective: (soapContent.objective || '').toLowerCase(),
    assessment: (soapContent.assessment || '').toLowerCase(),
    plan: (soapContent.plan || '').toLowerCase(),
  };

  for (const req of payerReqs.requirements) {
    const content = sectionContent[req.section] || '';
    const elementVariations = getElementVariations(req.element);
    const found = elementVariations.some(variation => content.includes(variation.toLowerCase()));

    if (!found) {
      issues.push({
        issueType: 'PAYER_REQUIREMENT',
        severity: req.isCritical ? 'CRITICAL' : 'WARNING',
        title: `${payerReqs.name}: Missing ${req.element}`,
        description: req.description,
        soapSection: req.section,
        requirementSource: payerReqs.name,
        payerSpecific: payerType,
        suggestion: `Add documentation of ${req.element} in the ${req.section} section for ${payerReqs.name} compliance.`,
        autoFixable: false,
        auditRiskImpact: req.isCritical ? 20 : 10,
        denialRisk: req.isCritical ? 0.6 : 0.3,
      });
    }
  }

  return issues;
}

/**
 * Check for cloned/duplicate note indicators
 */
async function checkForClonedNote(
  prisma: unknown,
  encounter: { id: string; patientId: string; organizationId: string; providerId?: string | null },
  soapContent: { subjective?: string | null; objective?: string | null; assessment?: string | null; plan?: string | null }
): Promise<ComplianceIssue[]> {
  const issues: ComplianceIssue[] = [];

  try {
    // Get recent SOAP notes for the same patient
    const db = prisma as { sOAPNote: { findMany: (args: unknown) => Promise<Array<{ id: string; subjective?: string | null; objective?: string | null; assessment?: string | null; plan?: string | null; encounter: { id: string } }>> } };
    const recentNotes = await db.sOAPNote.findMany({
      where: {
        encounter: {
          patientId: encounter.patientId,
          organizationId: encounter.organizationId,
          id: { not: encounter.id },
        },
      },
      orderBy: { createdAt: 'desc' as const },
      take: 5,
      select: {
        id: true,
        subjective: true,
        objective: true,
        assessment: true,
        plan: true,
        encounter: { select: { id: true } },
      },
    });

    // Check for high similarity with recent notes
    for (const note of recentNotes) {
      const currentObjective = (soapContent.objective || '').trim();
      const previousObjective = (note.objective || '').trim();

      // Simple similarity check (exact match or very similar)
      if (currentObjective.length > 50 && previousObjective.length > 50) {
        const similarity = calculateSimilarity(currentObjective, previousObjective);

        if (similarity > 0.85) {
          issues.push({
            issueType: 'CLONED_NOTE',
            severity: 'WARNING',
            title: 'Possible Cloned Documentation',
            description: `The objective section appears very similar (${Math.round(similarity * 100)}% match) to a previous encounter note. This may indicate cloned documentation.`,
            soapSection: 'objective',
            requirementSource: 'OIG Audit Guidelines',
            suggestion: 'Ensure documentation is unique to this encounter and reflects current findings. Modify cloned sections to reflect visit-specific observations.',
            autoFixable: false,
            auditRiskImpact: 25,
            denialRisk: 0.5,
          });
          break; // Only flag once
        }
      }
    }
  } catch (error) {
    // If comparison fails, don't add an issue
    console.error('Cloned note check error:', error);
  }

  return issues;
}

/**
 * Check if documentation supports billing codes
 */
function checkCodeDocumentation(
  soapContent: { subjective?: string | null; objective?: string | null; assessment?: string | null; plan?: string | null },
  codes: Array<{ suggestedCode: string; codeType: string; codeDescription?: string | null }>
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const fullContent = Object.values(soapContent).filter(Boolean).join(' ').toLowerCase();

  // Check CMT codes against documentation
  const cmtCodes = codes.filter(c => ['98940', '98941', '98942'].includes(c.suggestedCode));

  for (const code of cmtCodes) {
    // Check if spinal regions are documented
    const regionCount = countSpinalRegions(fullContent);

    if (code.suggestedCode === '98942' && regionCount < 5) {
      issues.push({
        issueType: 'CODE_DOCUMENTATION',
        severity: 'ERROR',
        title: 'Insufficient Documentation for 98942',
        description: `Code 98942 (5+ regions CMT) requires documentation of at least 5 spinal regions. Only ${regionCount} regions documented.`,
        requirementSource: 'CPT Guidelines',
        suggestion: `Document all spinal regions treated. Consider using 98941 (3-4 regions) or 98940 (1-2 regions) if fewer regions were treated.`,
        autoFixable: false,
        auditRiskImpact: 20,
        denialRisk: 0.5,
      });
    } else if (code.suggestedCode === '98941' && regionCount < 3) {
      issues.push({
        issueType: 'CODE_DOCUMENTATION',
        severity: 'ERROR',
        title: 'Insufficient Documentation for 98941',
        description: `Code 98941 (3-4 regions CMT) requires documentation of at least 3 spinal regions. Only ${regionCount} regions documented.`,
        requirementSource: 'CPT Guidelines',
        suggestion: `Document all spinal regions treated. Consider using 98940 (1-2 regions) if fewer regions were treated.`,
        autoFixable: false,
        auditRiskImpact: 15,
        denialRisk: 0.4,
      });
    }
  }

  // Check E/M codes against documentation complexity
  const emCodes = codes.filter(c => c.suggestedCode.startsWith('992'));

  for (const code of emCodes) {
    if (['99214', '99215'].includes(code.suggestedCode)) {
      // Higher level E/M codes require more complex documentation
      const wordCount = fullContent.split(/\s+/).length;
      const hasHistory = fullContent.includes('history') || fullContent.includes('hx');
      const hasExam = fullContent.includes('examination') || fullContent.includes('exam') || fullContent.includes('findings');
      const hasMDM = fullContent.includes('diagnosis') || fullContent.includes('assessment') || fullContent.includes('differential');

      if (wordCount < 200 || !hasHistory || !hasExam || !hasMDM) {
        issues.push({
          issueType: 'CODE_DOCUMENTATION',
          severity: 'WARNING',
          title: `Documentation May Not Support ${code.suggestedCode}`,
          description: `Higher-level E/M code ${code.suggestedCode} typically requires comprehensive documentation including detailed history, examination, and medical decision-making.`,
          requirementSource: 'CPT E/M Guidelines',
          suggestion: 'Ensure documentation includes: detailed history of present illness, comprehensive examination findings, and documented medical decision-making complexity.',
          autoFixable: false,
          auditRiskImpact: 15,
          denialRisk: 0.35,
        });
      }
    }
  }

  return issues;
}

/**
 * Map AI severity to our severity type
 */
function mapAISeverity(severity: string): 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' {
  switch (severity.toLowerCase()) {
    case 'error':
    case 'critical':
      return 'ERROR';
    case 'warning':
      return 'WARNING';
    default:
      return 'INFO';
  }
}

/**
 * Calculate compliance score based on issues
 */
function calculateComplianceScore(issues: ComplianceIssue[]): number {
  let score = 100;

  for (const issue of issues) {
    switch (issue.severity) {
      case 'CRITICAL':
        score -= 25;
        break;
      case 'ERROR':
        score -= 15;
        break;
      case 'WARNING':
        score -= 5;
        break;
      case 'INFO':
        score -= 1;
        break;
    }
  }

  return Math.max(0, score);
}

/**
 * Get variations of an element name for searching
 */
function getElementVariations(element: string): string[] {
  const variations: Record<string, string[]> = {
    'chief complaint': ['chief complaint', 'cc', 'presenting complaint', 'reason for visit'],
    'history': ['history', 'hx', 'hpi', 'history of present illness'],
    'pain level': ['pain level', 'pain scale', '/10', 'vas', 'nprs', 'numeric pain'],
    'range of motion': ['range of motion', 'rom', 'motion', 'flexion', 'extension', 'rotation'],
    'palpation': ['palpation', 'palpated', 'tenderness', 'spasm', 'trigger point'],
    'diagnosis': ['diagnosis', 'dx', 'assessment', 'impression'],
    'treatment plan': ['treatment plan', 'plan', 'recommendation', 'treatment'],
    'goals': ['goal', 'objective', 'target', 'outcome'],
    'subluxation': ['subluxation', 'segmental dysfunction', 'vertebral', 'spinal'],
    'medical necessity': ['medical necessity', 'medically necessary', 'functional limitation'],
    'mechanism of injury': ['mechanism of injury', 'moi', 'how injury occurred', 'accident', 'incident'],
    'work status': ['work status', 'work restrictions', 'return to work', 'rtw', 'light duty'],
    'outcome measures': ['outcome', 'oswestry', 'ndis', 'sf-36', 'dash', 'functional assessment'],
  };

  return variations[element.toLowerCase()] || [element];
}

/**
 * Check if an element is critical for the encounter type
 */
function isElementCritical(element: string, encounterType: string): boolean {
  const criticalElements: Record<string, string[]> = {
    INITIAL_EVAL: ['chief complaint', 'diagnosis', 'treatment plan', 'medical necessity'],
    FOLLOW_UP: ['progress', 'examination findings'],
    RE_EVALUATION: ['progress assessment', 'outcome measures', 'continued necessity'],
    DISCHARGE: ['treatment outcomes', 'goal achievement'],
  };

  const critical = criticalElements[encounterType] || [];
  return critical.some(c => element.toLowerCase().includes(c.toLowerCase()));
}

/**
 * Get suggestion for a missing element
 */
function getSuggestionForElement(element: string, section: string): string {
  const suggestions: Record<string, string> = {
    'chief complaint': 'Document the primary reason for the visit in the patient\'s own words.',
    'pain level': 'Include numeric pain rating (0-10 scale) and location.',
    'range of motion': 'Document specific ROM measurements with degrees and any limitations.',
    'diagnosis': 'Include specific ICD-10 diagnoses that support medical necessity.',
    'treatment plan': 'Detail specific treatments, frequency, and duration.',
    'goals': 'Include measurable, time-bound treatment goals.',
    'medical necessity': 'Document functional limitations and expected improvement.',
  };

  return suggestions[element.toLowerCase()] || `Add documentation of ${element} to the ${section} section.`;
}

/**
 * Get example fix for a missing element
 */
function getExampleForElement(element: string): string {
  const examples: Record<string, string> = {
    'pain level': 'Example: "Pain: 7/10 at cervical spine, 5/10 at upper trapezius"',
    'range of motion': 'Example: "Cervical ROM: Flexion 35° (N: 45°), Extension 30° (N: 45°), Rotation R 60°/L 55° (N: 80°)"',
    'diagnosis': 'Example: "1. M54.2 - Cervicalgia 2. M99.01 - Segmental dysfunction, cervical"',
    'goals': 'Example: "Goals: 1) Reduce pain to 3/10 within 4 weeks 2) Restore cervical ROM to 80% of normal"',
  };

  return examples[element.toLowerCase()] || '';
}

/**
 * Calculate text similarity (simple Jaccard-like)
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);

  return intersection.size / union.size;
}

/**
 * Get general compliance tips based on encounter type
 */
function getGeneralComplianceTips(encounterType: string): string[] {
  const tips: Record<string, string[]> = {
    INITIAL_EVAL: [
      'Document complete history including onset, mechanism, duration, and aggravating/relieving factors',
      'Include comprehensive examination findings with objective measurements',
      'Establish medical necessity with clear functional limitations',
      'Set specific, measurable treatment goals',
      'Document diagnosis with appropriate ICD-10 specificity',
    ],
    FOLLOW_UP: [
      'Compare findings to previous visit to show progress or lack thereof',
      'Update pain levels and functional status each visit',
      'Document patient response to treatment',
      'Modify treatment plan if not progressing as expected',
      'Include objective findings that support continued treatment',
    ],
    RE_EVALUATION: [
      'Include outcome measure scores and compare to initial',
      'Justify continued treatment with objective findings',
      'Document progress toward goals and revise as needed',
      'Consider discharge criteria and timeline',
      'Address any new complaints or changes',
    ],
    DISCHARGE: [
      'Document achievement of treatment goals',
      'Include final outcome measurements',
      'Provide home exercise program instructions',
      'Give maintenance care recommendations',
      'Document patient education provided',
    ],
  };

  return tips[encounterType] || tips.FOLLOW_UP;
}
