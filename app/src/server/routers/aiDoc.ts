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
