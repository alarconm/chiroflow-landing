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
});

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
