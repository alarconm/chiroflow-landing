/**
 * AI Clinical Decision Support Agent Router (Epic 39)
 *
 * Provides real-time clinical decision support including:
 * - Diagnosis suggestions based on symptoms and findings
 * - Treatment recommendations with evidence-based guidance
 * - Contraindication alerts for patient safety
 * - Clinical guidelines integration
 * - Outcome prediction and referral recommendations
 */

import { z } from 'zod';
import { router, providerProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { env } from '@/lib/env';
import type { Prisma } from '@prisma/client';

// ============================================
// Constants and Types
// ============================================

// Common chiropractic red flags
const RED_FLAGS = {
  // Serious spinal pathology indicators
  cauda_equina: {
    keywords: ['bladder dysfunction', 'bowel dysfunction', 'saddle anesthesia', 'bilateral leg weakness', 'urinary retention', 'fecal incontinence'],
    severity: 'CRITICAL' as const,
    message: 'URGENT: Potential cauda equina syndrome. Immediate referral required.',
    recommendation: 'Immediate emergency department referral for MRI and surgical consultation.',
  },
  malignancy: {
    keywords: ['unexplained weight loss', 'history of cancer', 'night pain', 'progressive symptoms', 'age over 50 with new onset'],
    severity: 'HIGH' as const,
    message: 'Red flag for potential malignancy. Further investigation needed.',
    recommendation: 'Consider imaging and laboratory workup. Refer to oncology if suspicion persists.',
  },
  fracture: {
    keywords: ['trauma', 'osteoporosis', 'steroid use', 'severe pain', 'point tenderness'],
    severity: 'HIGH' as const,
    message: 'Potential fracture risk. Imaging recommended before manipulation.',
    recommendation: 'X-ray or advanced imaging before proceeding with spinal manipulation.',
  },
  infection: {
    keywords: ['fever', 'recent infection', 'immunocompromised', 'iv drug use', 'night sweats', 'chills'],
    severity: 'HIGH' as const,
    message: 'Red flag for potential spinal infection.',
    recommendation: 'Consider laboratory workup (CBC, ESR, CRP) and imaging. Refer to primary care.',
  },
  vascular: {
    keywords: ['tearing pain', 'pulsatile mass', 'history of vascular disease', 'abdominal aneurysm'],
    severity: 'CRITICAL' as const,
    message: 'URGENT: Potential vascular emergency.',
    recommendation: 'Immediate emergency department referral for vascular evaluation.',
  },
  cervical_artery: {
    keywords: ['dizziness with neck movement', 'vertigo', 'diplopia', 'dysarthria', 'dysphagia', 'drop attacks', 'nystagmus'],
    severity: 'HIGH' as const,
    message: 'Cervical artery dysfunction risk factors present.',
    recommendation: 'Perform cervical artery screening tests. Consider modified treatment approach.',
  },
};

// Common chiropractic ICD-10 codes with descriptions
const CHIRO_ICD10_CODES = [
  { code: 'M54.5', description: 'Low back pain', region: 'lumbar', common: true },
  { code: 'M54.50', description: 'Low back pain, unspecified', region: 'lumbar', common: true },
  { code: 'M54.51', description: 'Vertebrogenic low back pain', region: 'lumbar', common: true },
  { code: 'M54.2', description: 'Cervicalgia', region: 'cervical', common: true },
  { code: 'M54.6', description: 'Pain in thoracic spine', region: 'thoracic', common: true },
  { code: 'M54.9', description: 'Dorsalgia, unspecified', region: 'general', common: true },
  { code: 'M99.01', description: 'Segmental and somatic dysfunction of cervical region', region: 'cervical', common: true },
  { code: 'M99.02', description: 'Segmental and somatic dysfunction of thoracic region', region: 'thoracic', common: true },
  { code: 'M99.03', description: 'Segmental and somatic dysfunction of lumbar region', region: 'lumbar', common: true },
  { code: 'M99.04', description: 'Segmental and somatic dysfunction of sacral region', region: 'sacral', common: true },
  { code: 'M99.05', description: 'Segmental and somatic dysfunction of pelvic region', region: 'pelvic', common: true },
  { code: 'M53.0', description: 'Cervicocranial syndrome', region: 'cervical', common: true },
  { code: 'M53.1', description: 'Cervicobrachial syndrome', region: 'cervical', common: true },
  { code: 'M53.2X1', description: 'Spinal instability, occipito-atlanto-axial region', region: 'cervical', common: false },
  { code: 'M47.812', description: 'Spondylosis without myelopathy, cervical region', region: 'cervical', common: true },
  { code: 'M47.816', description: 'Spondylosis without myelopathy, lumbar region', region: 'lumbar', common: true },
  { code: 'M51.16', description: 'Intervertebral disc degeneration, lumbar region', region: 'lumbar', common: true },
  { code: 'M51.26', description: 'Other intervertebral disc degeneration, lumbar region', region: 'lumbar', common: true },
  { code: 'G89.29', description: 'Other chronic pain', region: 'general', common: true },
  { code: 'M62.830', description: 'Muscle spasm of back', region: 'general', common: true },
  { code: 'M79.3', description: 'Panniculitis, unspecified', region: 'general', common: false },
  { code: 'S13.4XXA', description: 'Sprain of ligaments of cervical spine, initial encounter', region: 'cervical', common: true },
  { code: 'S33.5XXA', description: 'Sprain of ligaments of lumbar spine, initial encounter', region: 'lumbar', common: true },
  { code: 'M79.1', description: 'Myalgia, unspecified', region: 'general', common: true },
  { code: 'R51.9', description: 'Headache, unspecified', region: 'cervical', common: true },
  { code: 'M54.41', description: 'Lumbago with sciatica, right side', region: 'lumbar', common: true },
  { code: 'M54.42', description: 'Lumbago with sciatica, left side', region: 'lumbar', common: true },
];

// Evidence level schema
const evidenceLevelSchema = z.enum(['HIGH', 'MODERATE', 'LOW', 'VERY_LOW', 'EXPERT']);

// ============================================
// Helper Functions
// ============================================

/**
 * Analyze text for red flags
 */
function detectRedFlags(text: string): Array<{
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  message: string;
  recommendation: string;
  matchedKeywords: string[];
}> {
  const normalizedText = text.toLowerCase();
  const detectedFlags: Array<{
    type: string;
    severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
    message: string;
    recommendation: string;
    matchedKeywords: string[];
  }> = [];

  for (const [flagType, flagData] of Object.entries(RED_FLAGS)) {
    const matchedKeywords = flagData.keywords.filter(keyword =>
      normalizedText.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      detectedFlags.push({
        type: flagType,
        severity: flagData.severity,
        message: flagData.message,
        recommendation: flagData.recommendation,
        matchedKeywords,
      });
    }
  }

  return detectedFlags;
}

/**
 * Extract keywords from clinical text for matching
 */
function extractClinicalKeywords(text: string): string[] {
  const normalizedText = text.toLowerCase();
  const keywords: string[] = [];

  // Body regions
  const regions = ['cervical', 'thoracic', 'lumbar', 'sacral', 'pelvic', 'neck', 'back', 'lower back', 'upper back', 'mid back'];
  regions.forEach(region => {
    if (normalizedText.includes(region)) keywords.push(region);
  });

  // Symptoms
  const symptoms = ['pain', 'stiffness', 'numbness', 'tingling', 'weakness', 'spasm', 'tension', 'headache', 'radiating', 'shooting'];
  symptoms.forEach(symptom => {
    if (normalizedText.includes(symptom)) keywords.push(symptom);
  });

  // Conditions
  const conditions = ['sciatica', 'radiculopathy', 'disc', 'spondylosis', 'subluxation', 'dysfunction', 'sprain', 'strain'];
  conditions.forEach(condition => {
    if (normalizedText.includes(condition)) keywords.push(condition);
  });

  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Score a diagnosis code based on keyword matching
 */
function scoreDiagnosisMatch(
  code: typeof CHIRO_ICD10_CODES[0],
  keywords: string[],
  chiefComplaint: string
): number {
  let score = 0;
  const description = code.description.toLowerCase();
  const complaint = chiefComplaint.toLowerCase();

  // Direct match with chief complaint words
  const complaintWords = complaint.split(/\s+/);
  complaintWords.forEach(word => {
    if (word.length > 3 && description.includes(word)) {
      score += 20;
    }
  });

  // Keyword matches
  keywords.forEach(keyword => {
    if (description.includes(keyword)) {
      score += 15;
    }
    // Region-based matching
    if (code.region === 'lumbar' && (keyword === 'lower back' || keyword === 'lumbar')) {
      score += 25;
    }
    if (code.region === 'cervical' && (keyword === 'neck' || keyword === 'cervical')) {
      score += 25;
    }
    if (code.region === 'thoracic' && (keyword === 'upper back' || keyword === 'mid back' || keyword === 'thoracic')) {
      score += 25;
    }
  });

  // Bonus for common codes
  if (code.common) {
    score += 10;
  }

  return Math.min(score, 100); // Cap at 100
}

/**
 * Generate AI diagnosis suggestions using Claude API
 */
async function generateAIDiagnosisSuggestions(context: {
  chiefComplaint: string;
  subjective?: string;
  objective?: string;
  patientHistory?: string;
  existingCodes?: string[];
}): Promise<Array<{
  code: string;
  description: string;
  confidence: number;
  reasoning: string;
  supportingFindings: string[];
}>> {
  // If no API key, use rule-based suggestions
  if (!env.ANTHROPIC_API_KEY) {
    return [];
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    const systemPrompt = `You are a clinical decision support system for chiropractic practices.
Analyze patient information and suggest appropriate ICD-10 diagnosis codes.
Focus on musculoskeletal conditions common in chiropractic care.
Be thorough but conservative - only suggest codes with clear clinical support.

IMPORTANT: Respond ONLY with valid JSON array, no markdown code blocks.`;

    const userPrompt = `Analyze this patient encounter and suggest appropriate ICD-10 diagnoses:

Chief Complaint: ${context.chiefComplaint || 'Not specified'}

${context.subjective ? `Patient Reports (Subjective):\n${context.subjective}\n` : ''}
${context.objective ? `Examination Findings (Objective):\n${context.objective}\n` : ''}
${context.patientHistory ? `Relevant History:\n${context.patientHistory}\n` : ''}
${context.existingCodes?.length ? `Previously Used Codes: ${context.existingCodes.join(', ')}\n` : ''}

Respond with a JSON array of diagnosis suggestions:
[
  {
    "code": "M54.5",
    "description": "Low back pain",
    "confidence": 85,
    "reasoning": "Clinical explanation for why this code is appropriate",
    "supportingFindings": ["specific finding 1", "specific finding 2"]
  }
]

Focus on common chiropractic ICD-10 codes:
- M54.x (back pain categories)
- M99.0x (segmental/somatic dysfunction)
- M53.x (other dorsopathies)
- M47.x (spondylosis)
- M51.x (disc disorders)
- S13.4/S33.5 (sprains)`;

    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1500,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return [];
    }

    // Parse the JSON response
    const parsed = JSON.parse(content.text);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(item => ({
      code: item.code || '',
      description: item.description || '',
      confidence: Math.min(Math.max(Number(item.confidence) || 0, 0), 100),
      reasoning: item.reasoning || '',
      supportingFindings: Array.isArray(item.supportingFindings) ? item.supportingFindings : [],
    }));
  } catch (error) {
    console.error('AI diagnosis suggestion error:', error);
    return [];
  }
}

// ============================================
// US-372: Diagnosis Suggestion Router
// ============================================

export const aiClinicalRouter = router({
  /**
   * Get diagnosis suggestions based on encounter data
   * Analyzes subjective complaints, examination findings, and patient history
   */
  suggestDiagnosis: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        // Optional override inputs if not pulling from encounter
        chiefComplaint: z.string().optional(),
        subjective: z.string().optional(),
        objective: z.string().optional(),
        includeAI: z.boolean().default(true), // Whether to use AI suggestions
        maxSuggestions: z.number().min(1).max(20).default(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, maxSuggestions, includeAI } = input;

      // Fetch encounter with related data
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          soapNote: true,
          patient: {
            include: {
              demographics: true,
            },
          },
          diagnoses: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          chiropracticExam: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Gather clinical information
      const chiefComplaint = input.chiefComplaint || encounter.chiefComplaint || '';
      const subjective = input.subjective || encounter.soapNote?.subjective || '';
      const objective = input.objective || encounter.soapNote?.objective || '';

      // Combine all text for analysis
      const combinedText = `${chiefComplaint} ${subjective} ${objective}`;

      // Detect red flags
      const redFlags = detectRedFlags(combinedText);
      const hasRedFlags = redFlags.length > 0;
      const hasCriticalFlags = redFlags.some(flag => flag.severity === 'CRITICAL');

      // Extract keywords for matching
      const keywords = extractClinicalKeywords(combinedText);

      // Get existing codes used for this patient
      const existingCodes = encounter.diagnoses.map(d => d.icd10Code);

      // Rule-based suggestions
      const ruleBasedSuggestions = CHIRO_ICD10_CODES
        .map(code => ({
          code: code.code,
          description: code.description,
          confidence: scoreDiagnosisMatch(code, keywords, chiefComplaint),
          reasoning: `Matched based on: ${keywords.filter(k =>
            code.description.toLowerCase().includes(k) || code.region === k
          ).join(', ') || 'general clinical presentation'}`,
          supportingFindings: keywords,
          source: 'rule-based' as const,
        }))
        .filter(s => s.confidence > 20)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxSuggestions);

      // AI-based suggestions (if enabled)
      let aiSuggestions: Array<{
        code: string;
        description: string;
        confidence: number;
        reasoning: string;
        supportingFindings: string[];
        source: 'ai';
      }> = [];

      if (includeAI) {
        const aiResults = await generateAIDiagnosisSuggestions({
          chiefComplaint,
          subjective,
          objective,
          existingCodes,
        });

        aiSuggestions = aiResults.map(r => ({
          ...r,
          source: 'ai' as const,
        }));
      }

      // Merge and deduplicate suggestions
      const allSuggestions = [...aiSuggestions, ...ruleBasedSuggestions];
      const uniqueSuggestions = allSuggestions.reduce((acc, curr) => {
        const existing = acc.find(s => s.code === curr.code);
        if (!existing) {
          acc.push(curr);
        } else if (curr.source === 'ai' && existing.source !== 'ai') {
          // Prefer AI suggestions for reasoning
          const idx = acc.indexOf(existing);
          acc[idx] = {
            ...curr,
            confidence: Math.max(curr.confidence, existing.confidence),
          };
        }
        return acc;
      }, [] as typeof allSuggestions);

      // Sort by confidence and limit
      const finalSuggestions = uniqueSuggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxSuggestions);

      // Store suggestions in database
      const storedSuggestions = await ctx.prisma.$transaction(
        finalSuggestions.map(suggestion =>
          ctx.prisma.diagnosisSuggestion.create({
            data: {
              encounterId,
              organizationId: ctx.user.organizationId,
              suggestedCode: suggestion.code,
              suggestedDescription: suggestion.description,
              confidence: suggestion.confidence,
              reasoning: suggestion.reasoning,
              supportingFindings: suggestion.supportingFindings,
              hasRedFlags,
              redFlagDetails: hasRedFlags
                ? redFlags.map(f => `${f.type}: ${f.message}`).join('\n')
                : null,
              evidenceLevel: suggestion.source === 'ai' ? 'MODERATE' : 'LOW',
              guidelines: [],
            },
          })
        )
      );

      // Create alerts for red flags
      if (hasRedFlags) {
        await ctx.prisma.$transaction(
          redFlags.map(flag =>
            ctx.prisma.clinicalAlert.create({
              data: {
                patientId: encounter.patientId,
                encounterId,
                organizationId: ctx.user.organizationId,
                alertType: 'RED_FLAG',
                severity: flag.severity,
                message: flag.message,
                description: `Detected keywords: ${flag.matchedKeywords.join(', ')}`,
                recommendation: flag.recommendation,
                triggeredBy: 'AI Clinical Decision Support',
                relatedData: { flagType: flag.type, keywords: flag.matchedKeywords },
              },
            })
          )
        );
      }

      // Log the action
      await auditLog('AI_DIAGNOSIS_SUGGESTION', 'DiagnosisSuggestion', {
        entityId: encounterId,
        changes: {
          suggestionsCount: finalSuggestions.length,
          hasRedFlags,
          redFlagTypes: redFlags.map(f => f.type),
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        suggestions: storedSuggestions.map(s => ({
          id: s.id,
          code: s.suggestedCode,
          description: s.suggestedDescription,
          confidence: Number(s.confidence),
          reasoning: s.reasoning,
          supportingFindings: s.supportingFindings as string[] | null,
          hasRedFlags: s.hasRedFlags,
        })),
        redFlags: redFlags.map(flag => ({
          type: flag.type,
          severity: flag.severity,
          message: flag.message,
          recommendation: flag.recommendation,
        })),
        hasCriticalFlags,
        analyzedText: {
          chiefComplaint: chiefComplaint || null,
          hasSubjective: !!subjective,
          hasObjective: !!objective,
        },
        keywords,
      };
    }),

  /**
   * Accept a diagnosis suggestion and add it to the encounter
   */
  acceptSuggestion: providerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        isPrimary: z.boolean().default(false),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suggestionId, isPrimary, notes } = input;

      // Get the suggestion
      const suggestion = await ctx.prisma.diagnosisSuggestion.findFirst({
        where: {
          id: suggestionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: true,
        },
      });

      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Suggestion not found',
        });
      }

      if (suggestion.isAccepted || suggestion.isRejected) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Suggestion has already been processed',
        });
      }

      // Get current highest sequence
      const highestSeq = await ctx.prisma.diagnosis.findFirst({
        where: { encounterId: suggestion.encounterId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });

      const sequence = (highestSeq?.sequence ?? 0) + 1;

      // If setting as primary, unset others
      if (isPrimary) {
        await ctx.prisma.diagnosis.updateMany({
          where: { encounterId: suggestion.encounterId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      // Create the diagnosis
      const diagnosis = await ctx.prisma.diagnosis.create({
        data: {
          encounterId: suggestion.encounterId,
          icd10Code: suggestion.suggestedCode,
          description: suggestion.suggestedDescription,
          isPrimary,
          status: 'ACTIVE',
          notes: notes || `AI-suggested: ${suggestion.reasoning}`,
          sequence,
        },
      });

      // Mark suggestion as accepted
      await ctx.prisma.diagnosisSuggestion.update({
        where: { id: suggestionId },
        data: {
          isAccepted: true,
          selectedAt: new Date(),
          selectedBy: ctx.user.id,
        },
      });

      // Log for learning
      await auditLog('AI_SUGGESTION_ACCEPTED', 'DiagnosisSuggestion', {
        entityId: suggestionId,
        changes: {
          diagnosisId: diagnosis.id,
          code: suggestion.suggestedCode,
          confidence: Number(suggestion.confidence),
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        diagnosis,
        suggestion: {
          id: suggestion.id,
          code: suggestion.suggestedCode,
          confidence: Number(suggestion.confidence),
        },
      };
    }),

  /**
   * Reject a diagnosis suggestion with optional reason
   */
  rejectSuggestion: providerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suggestionId, reason } = input;

      // Get the suggestion
      const suggestion = await ctx.prisma.diagnosisSuggestion.findFirst({
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

      if (suggestion.isAccepted || suggestion.isRejected) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Suggestion has already been processed',
        });
      }

      // Mark as rejected
      const updated = await ctx.prisma.diagnosisSuggestion.update({
        where: { id: suggestionId },
        data: {
          isRejected: true,
          rejectionReason: reason,
          selectedAt: new Date(),
          selectedBy: ctx.user.id,
        },
      });

      // Log for learning
      await auditLog('AI_SUGGESTION_REJECTED', 'DiagnosisSuggestion', {
        entityId: suggestionId,
        changes: {
          code: suggestion.suggestedCode,
          confidence: Number(suggestion.confidence),
          reason,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        code: updated.suggestedCode,
        rejected: true,
      };
    }),

  /**
   * Get pending suggestions for an encounter
   */
  getPendingSuggestions: protectedProcedure
    .input(
      z.object({
        encounterId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { encounterId } = input;

      // Verify encounter access
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

      const suggestions = await ctx.prisma.diagnosisSuggestion.findMany({
        where: {
          encounterId,
          isAccepted: false,
          isRejected: false,
        },
        orderBy: { confidence: 'desc' },
      });

      return suggestions.map(s => ({
        id: s.id,
        code: s.suggestedCode,
        description: s.suggestedDescription,
        confidence: Number(s.confidence),
        reasoning: s.reasoning,
        supportingFindings: s.supportingFindings as string[] | null,
        hasRedFlags: s.hasRedFlags,
        redFlagDetails: s.redFlagDetails,
        evidenceLevel: s.evidenceLevel,
        createdAt: s.createdAt,
      }));
    }),

  /**
   * Get active clinical alerts for a patient
   */
  getPatientAlerts: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        includeAcknowledged: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId, includeAcknowledged } = input;

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

      const where: Prisma.ClinicalAlertWhereInput = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (encounterId) {
        where.encounterId = encounterId;
      }

      if (!includeAcknowledged) {
        where.status = 'ACTIVE';
      }

      const alerts = await ctx.prisma.clinicalAlert.findMany({
        where,
        orderBy: [
          { severity: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      return alerts.map(alert => ({
        id: alert.id,
        type: alert.alertType,
        severity: alert.severity,
        status: alert.status,
        message: alert.message,
        description: alert.description,
        recommendation: alert.recommendation,
        createdAt: alert.createdAt,
        acknowledgedAt: alert.acknowledgedAt,
        encounterId: alert.encounterId,
      }));
    }),

  /**
   * Acknowledge a clinical alert
   */
  acknowledgeAlert: providerProcedure
    .input(
      z.object({
        alertId: z.string(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { alertId, note } = input;

      const alert = await ctx.prisma.clinicalAlert.findFirst({
        where: {
          id: alertId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Alert not found',
        });
      }

      const updated = await ctx.prisma.clinicalAlert.update({
        where: { id: alertId },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
          acknowledgedBy: ctx.user.id,
          resolutionNote: note,
        },
      });

      await auditLog('CLINICAL_ALERT_ACKNOWLEDGED', 'ClinicalAlert', {
        entityId: alertId,
        changes: {
          alertType: alert.alertType,
          severity: alert.severity,
          note,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        status: updated.status,
        acknowledgedAt: updated.acknowledgedAt,
      };
    }),

  /**
   * Get suggestion acceptance rate for learning/analytics
   */
  getSuggestionStats: protectedProcedure
    .input(
      z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { dateFrom, dateTo, providerId } = input;

      const where: Prisma.DiagnosisSuggestionWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
      }

      if (providerId) {
        where.encounter = { providerId };
      }

      const [total, accepted, rejected] = await Promise.all([
        ctx.prisma.diagnosisSuggestion.count({ where }),
        ctx.prisma.diagnosisSuggestion.count({
          where: { ...where, isAccepted: true },
        }),
        ctx.prisma.diagnosisSuggestion.count({
          where: { ...where, isRejected: true },
        }),
      ]);

      // Get top accepted codes
      const topAccepted = await ctx.prisma.diagnosisSuggestion.groupBy({
        by: ['suggestedCode'],
        where: { ...where, isAccepted: true },
        _count: { suggestedCode: true },
        orderBy: { _count: { suggestedCode: 'desc' } },
        take: 10,
      });

      // Get top rejected codes
      const topRejected = await ctx.prisma.diagnosisSuggestion.groupBy({
        by: ['suggestedCode'],
        where: { ...where, isRejected: true },
        _count: { suggestedCode: true },
        orderBy: { _count: { suggestedCode: 'desc' } },
        take: 10,
      });

      return {
        total,
        accepted,
        rejected,
        pending: total - accepted - rejected,
        acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
        topAcceptedCodes: topAccepted.map(t => ({
          code: t.suggestedCode,
          count: t._count.suggestedCode,
        })),
        topRejectedCodes: topRejected.map(t => ({
          code: t.suggestedCode,
          count: t._count.suggestedCode,
        })),
      };
    }),
});
