import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { aiService, type IntakeFormData } from '@/lib/ai-service';
import type { EncounterType, Prisma } from '@prisma/client';

// Input schemas
const soapNoteContentSchema = z.object({
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
});

const intakeFormDataSchema = z.object({
  chiefComplaint: z.string().optional(),
  painLocation: z.array(z.string()).optional(),
  painScale: z.number().min(0).max(10).optional(),
  painDuration: z.string().optional(),
  painQuality: z.array(z.string()).optional(),
  aggravatingFactors: z.array(z.string()).optional(),
  relievingFactors: z.array(z.string()).optional(),
  medicalHistory: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  previousTreatments: z.array(z.string()).optional(),
  functionalLimitations: z.array(z.string()).optional(),
  goals: z.array(z.string()).optional(),
}).passthrough();

export const aiDocumentationRouter = router({
  // Transcribe audio to text
  transcribe: providerProcedure
    .input(
      z.object({
        audioData: z.string(), // Base64 encoded audio
        mimeType: z.string().default('audio/wav'),
        encounterId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { audioData, mimeType, encounterId } = input;

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

      try {
        const result = await aiService.transcribeAudio(audioData, mimeType);

        // Log transcription use
        await auditLog('AI_TRANSCRIPTION', 'Encounter', {
          entityId: encounterId,
          changes: { action: 'transcribe', confidence: result.confidence },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to transcribe audio',
          cause: error,
        });
      }
    }),

  // Generate SOAP note suggestions
  generateSOAPSuggestion: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        transcription: z.string().optional(),
        useIntakeForm: z.boolean().default(true),
        usePreviousVisit: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, transcription, useIntakeForm, usePreviousVisit } = input;

      // Get encounter with related data
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              formSubmissions: {
                where: { status: 'COMPLETED' },
                orderBy: { submittedAt: 'desc' },
                take: 1,
                include: {
                  responses: {
                    include: {
                      field: true,
                    },
                  },
                },
              },
            },
          },
          soapNote: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Build patient info
      const demographics = encounter.patient.demographics;
      const patientInfo = {
        name: demographics
          ? `${demographics.firstName} ${demographics.lastName}`
          : 'Patient',
        age: demographics?.dateOfBirth
          ? Math.floor((Date.now() - new Date(demographics.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : 0,
        gender: demographics?.gender || 'PREFER_NOT_TO_SAY',
      };

      // Extract intake form data if available
      let intakeFormData: IntakeFormData | undefined;
      if (useIntakeForm && encounter.patient.formSubmissions.length > 0) {
        const submission = encounter.patient.formSubmissions[0];
        intakeFormData = {};

        for (const response of submission.responses) {
          const fieldName = response.field.name;
          const value = response.valueJson
            ? response.valueJson
            : response.value;

          if (fieldName && value !== null && value !== undefined) {
            (intakeFormData as Record<string, unknown>)[fieldName] = value;
          }
        }
      }

      // Get previous visit SOAP note if requested
      let previousVisit: { subjective?: string; objective?: string; assessment?: string; plan?: string } | undefined;
      if (usePreviousVisit) {
        const previousEncounter = await ctx.prisma.encounter.findFirst({
          where: {
            patientId: encounter.patientId,
            organizationId: ctx.user.organizationId,
            id: { not: encounterId },
            status: { in: ['SIGNED', 'COMPLETED', 'AMENDED'] },
          },
          orderBy: { encounterDate: 'desc' },
          include: { soapNote: true },
        });

        if (previousEncounter?.soapNote) {
          previousVisit = {
            subjective: previousEncounter.soapNote.subjective || undefined,
            objective: previousEncounter.soapNote.objective || undefined,
            assessment: previousEncounter.soapNote.assessment || undefined,
            plan: previousEncounter.soapNote.plan || undefined,
          };
        }
      }

      try {
        const suggestion = await aiService.generateSOAPSuggestion({
          patientInfo,
          chiefComplaint: encounter.chiefComplaint || '',
          encounterType: encounter.encounterType,
          intakeFormData,
          previousVisit,
          transcription,
        });

        // Log AI suggestion use
        await auditLog('AI_SOAP_GENERATION', 'Encounter', {
          entityId: encounterId,
          changes: {
            action: 'generate_soap',
            usedTranscription: !!transcription,
            usedIntakeForm: !!intakeFormData,
            usedPreviousVisit: !!previousVisit,
            confidence: suggestion.confidence,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return suggestion;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate SOAP suggestion',
          cause: error,
        });
      }
    }),

  // Suggest billing codes based on SOAP note
  suggestCodes: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        soapContent: soapNoteContentSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, soapContent } = input;

      // Get encounter and SOAP note
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: { soapNote: true },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Use provided content or fetch from SOAP note
      const content = soapContent || {
        subjective: encounter.soapNote?.subjective || undefined,
        objective: encounter.soapNote?.objective || undefined,
        assessment: encounter.soapNote?.assessment || undefined,
        plan: encounter.soapNote?.plan || undefined,
      };

      // Combine all sections for analysis
      const fullNote = [
        content.subjective,
        content.objective,
        content.assessment,
        content.plan,
      ]
        .filter(Boolean)
        .join('\n\n');

      if (!fullNote.trim()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No SOAP note content available for code suggestion',
        });
      }

      try {
        const suggestions = await aiService.suggestBillingCodes(fullNote, encounter.encounterType);

        // Log code suggestion use
        await auditLog('AI_CODE_SUGGESTION', 'Encounter', {
          entityId: encounterId,
          changes: {
            action: 'suggest_codes',
            icd10Count: suggestions.icd10.length,
            cptCount: suggestions.cpt.length,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return suggestions;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to suggest billing codes',
          cause: error,
        });
      }
    }),

  // Check documentation compliance
  checkCompliance: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        soapContent: soapNoteContentSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { encounterId, soapContent } = input;

      // Get encounter and SOAP note
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: { soapNote: true },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Use provided content or fetch from SOAP note
      const content = soapContent || {
        subjective: encounter.soapNote?.subjective || undefined,
        objective: encounter.soapNote?.objective || undefined,
        assessment: encounter.soapNote?.assessment || undefined,
        plan: encounter.soapNote?.plan || undefined,
      };

      try {
        const result = await aiService.checkDocumentationCompliance(content, encounter.encounterType);

        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to check compliance',
          cause: error,
        });
      }
    }),

  // Auto-fill SOAP note from intake form
  autoFillFromIntake: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        formSubmissionId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, formSubmissionId } = input;

      // Get encounter
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

      // Get form submission
      let submission;
      if (formSubmissionId) {
        submission = await ctx.prisma.formSubmission.findFirst({
          where: {
            id: formSubmissionId,
            patientId: encounter.patientId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            responses: {
              include: { field: true },
            },
          },
        });
      } else {
        // Get most recent completed submission
        submission = await ctx.prisma.formSubmission.findFirst({
          where: {
            patientId: encounter.patientId,
            organizationId: ctx.user.organizationId,
            status: 'COMPLETED',
          },
          orderBy: { submittedAt: 'desc' },
          include: {
            responses: {
              include: { field: true },
            },
          },
        });
      }

      if (!submission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No intake form submission found for this patient',
        });
      }

      // Extract form data
      const intakeData: IntakeFormData = {};
      for (const response of submission.responses) {
        const fieldName = response.field.name;
        const value = response.valueJson ? response.valueJson : response.value;
        if (fieldName && value !== null && value !== undefined) {
          (intakeData as Record<string, unknown>)[fieldName] = value;
        }
      }

      // Build patient info
      const demographics = encounter.patient.demographics;
      const patientInfo = {
        name: demographics
          ? `${demographics.firstName} ${demographics.lastName}`
          : 'Patient',
        age: demographics?.dateOfBirth
          ? Math.floor((Date.now() - new Date(demographics.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : 0,
        gender: demographics?.gender || 'PREFER_NOT_TO_SAY',
      };

      try {
        const suggestion = await aiService.autoFillFromIntake(intakeData, patientInfo);

        // Log auto-fill use
        await auditLog('AI_AUTOFILL', 'Encounter', {
          entityId: encounterId,
          changes: {
            action: 'autofill_from_intake',
            formSubmissionId: submission.id,
            confidence: suggestion.confidence,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return {
          suggestion,
          formSubmissionId: submission.id,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to auto-fill from intake',
          cause: error,
        });
      }
    }),

  // Generate medical necessity documentation
  generateMedicalNecessity: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        diagnosisCode: z.string().optional(),
        treatmentDescription: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, diagnosisCode, treatmentDescription } = input;

      // Get encounter with diagnoses
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          diagnoses: {
            where: { status: 'ACTIVE' },
            orderBy: { sequence: 'asc' },
          },
          procedures: true,
          patient: {
            include: {
              formSubmissions: {
                where: { status: 'COMPLETED' },
                orderBy: { submittedAt: 'desc' },
                take: 1,
                include: {
                  responses: {
                    include: { field: true },
                  },
                },
              },
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

      // Get diagnosis description
      let diagnosis = '';
      if (diagnosisCode) {
        const matchingDiagnosis = encounter.diagnoses.find(d => d.icd10Code === diagnosisCode);
        diagnosis = matchingDiagnosis?.description || diagnosisCode;
      } else if (encounter.diagnoses.length > 0) {
        const primaryDiagnosis = encounter.diagnoses.find(d => d.isPrimary) || encounter.diagnoses[0];
        diagnosis = `${primaryDiagnosis.icd10Code} - ${primaryDiagnosis.description}`;
      }

      if (!diagnosis) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No diagnosis available for medical necessity',
        });
      }

      // Get treatment description
      let treatment = treatmentDescription || '';
      if (!treatment && encounter.procedures.length > 0) {
        treatment = encounter.procedures.map(p => `${p.cptCode} - ${p.description}`).join('; ');
      }

      // Extract functional limitations from intake form
      const functionalLimitations: string[] = [];
      if (encounter.patient.formSubmissions.length > 0) {
        const submission = encounter.patient.formSubmissions[0];
        for (const response of submission.responses) {
          if (response.field.name === 'functionalLimitations' && response.valueJson) {
            const limitations = response.valueJson as string[];
            functionalLimitations.push(...limitations);
          }
        }
      }

      try {
        const necessityDoc = await aiService.generateMedicalNecessity(
          diagnosis,
          treatment || 'Chiropractic manipulative treatment',
          functionalLimitations
        );

        // Log medical necessity generation
        await auditLog('AI_MEDICAL_NECESSITY', 'Encounter', {
          entityId: encounterId,
          changes: {
            action: 'generate_medical_necessity',
            diagnosis,
            treatment,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return { documentation: necessityDoc };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate medical necessity',
          cause: error,
        });
      }
    }),

  // Get AI feature status/availability
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    // Check which AI provider is available (priority: Claude > Gemini > OpenAI)
    const hasClaude = !!process.env.ANTHROPIC_API_KEY;
    const hasGemini = !!process.env.GOOGLE_AI_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    let provider = 'mock';
    if (hasClaude) provider = 'claude-opus-4.5';
    else if (hasGemini) provider = 'gemini-3.0-flash';
    else if (hasOpenAI) provider = 'openai-legacy';

    return {
      enabled: true, // Always enabled with mock fallback
      provider,
      providers: {
        claude: hasClaude,
        gemini: hasGemini,
        openai: hasOpenAI,
      },
      features: {
        transcription: true,
        soapGeneration: true,
        codeSuggestion: true,
        complianceCheck: true,
        autoFill: true,
        medicalNecessity: true,
      },
    };
  }),
});
