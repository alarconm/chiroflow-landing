/**
 * AI Service Layer - 2026 SOTA Edition
 *
 * Provider Priority:
 * - Claude Opus 4.5 (primary) - SOAP generation, code suggestions, compliance
 * - Gemini 3.0 Flash - Fast OCR/transcription tasks
 * - OpenAI Whisper - Audio transcription fallback
 * - Mock - Development/testing without API keys
 */

import { env, getAIProvider } from '@/lib/env';

// Types for AI service
export interface TranscriptionResult {
  text: string;
  confidence: number;
  segments?: {
    start: number;
    end: number;
    text: string;
  }[];
}

export interface SOAPSuggestion {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  confidence: number;
}

export interface CodeSuggestion {
  code: string;
  description: string;
  confidence: number;
  rationale: string;
  isChiroCommon?: boolean;
}

export interface ComplianceIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  section: 'subjective' | 'objective' | 'assessment' | 'plan' | 'general';
  suggestion?: string;
}

export interface ComplianceResult {
  isCompliant: boolean;
  score: number; // 0-100
  issues: ComplianceIssue[];
}

export interface IntakeFormData {
  chiefComplaint?: string;
  painLocation?: string[];
  painScale?: number;
  painDuration?: string;
  painQuality?: string[];
  aggravatingFactors?: string[];
  relievingFactors?: string[];
  medicalHistory?: string[];
  medications?: string[];
  allergies?: string[];
  previousTreatments?: string[];
  functionalLimitations?: string[];
  goals?: string[];
  [key: string]: unknown;
}

// AI Provider interface
interface AIProvider {
  transcribe(audioData: Buffer | string, mimeType: string): Promise<TranscriptionResult>;
  generateSOAP(context: SOAPGenerationContext): Promise<SOAPSuggestion>;
  suggestCodes(soapNote: string, encounterType: string): Promise<{ icd10: CodeSuggestion[]; cpt: CodeSuggestion[] }>;
  checkCompliance(soapNote: SOAPNoteContent, encounterType: string): Promise<ComplianceResult>;
}

interface SOAPGenerationContext {
  patientInfo: {
    name: string;
    age: number;
    gender: string;
  };
  chiefComplaint: string;
  encounterType: string;
  intakeFormData?: IntakeFormData;
  previousVisit?: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  transcription?: string;
}

interface SOAPNoteContent {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

// ============================================
// Claude Provider (Primary - SOTA 2026)
// ============================================
class ClaudeProvider implements AIProvider {
  private anthropic: InstanceType<typeof import('@anthropic-ai/sdk').default> | null = null;

  private async getClient() {
    if (!this.anthropic) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      this.anthropic = new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY || '',
      });
    }
    return this.anthropic;
  }

  async transcribe(audioData: Buffer | string, mimeType: string): Promise<TranscriptionResult> {
    // Claude doesn't do audio transcription directly - use Gemini or OpenAI for this
    // Fallback to Gemini if available, otherwise OpenAI
    if (env.GOOGLE_AI_API_KEY) {
      const gemini = new GeminiProvider();
      return gemini.transcribe(audioData, mimeType);
    } else if (env.OPENAI_API_KEY) {
      const openai = new OpenAIProvider();
      return openai.transcribe(audioData, mimeType);
    }
    // Final fallback to mock
    const mock = new MockAIProvider();
    return mock.transcribe(audioData, mimeType);
  }

  async generateSOAP(context: SOAPGenerationContext): Promise<SOAPSuggestion> {
    try {
      const client = await this.getClient();

      const systemPrompt = `You are a medical documentation assistant for a chiropractic practice.
Generate professional SOAP notes based on the provided patient information.
Focus on musculoskeletal conditions, spinal health, and chiropractic care.
Be thorough but concise. Use proper medical terminology.

IMPORTANT: Respond ONLY with valid JSON, no markdown code blocks.`;

      const userPrompt = `Generate a SOAP note for the following patient encounter:

Patient: ${context.patientInfo.name}, ${context.patientInfo.age} year old ${context.patientInfo.gender}
Encounter Type: ${context.encounterType}
Chief Complaint: ${context.chiefComplaint || 'Not specified'}

${context.transcription ? `Provider Notes/Transcription:\n${context.transcription}\n` : ''}
${context.intakeFormData ? `Intake Form Data:\n${JSON.stringify(context.intakeFormData, null, 2)}\n` : ''}
${context.previousVisit ? `Previous Visit Summary:\nS: ${context.previousVisit.subjective || 'N/A'}\nO: ${context.previousVisit.objective || 'N/A'}\nA: ${context.previousVisit.assessment || 'N/A'}\nP: ${context.previousVisit.plan || 'N/A'}\n` : ''}

Respond with JSON containing these fields:
{
  "subjective": "Patient's reported symptoms and history",
  "objective": "Physical examination findings (use [brackets] for items needing exam)",
  "assessment": "Clinical impression and diagnosis",
  "plan": "Treatment plan, recommendations, and follow-up"
}`;

      const response = await client.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 2000,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        system: systemPrompt,
      });

      const content = response.content[0];
      if (content.type !== 'text') throw new Error('Unexpected response type');

      const parsed = JSON.parse(content.text);
      return {
        subjective: parsed.subjective || '',
        objective: parsed.objective || '',
        assessment: parsed.assessment || '',
        plan: parsed.plan || '',
        confidence: 0.92,
      };
    } catch (error) {
      console.error('Claude SOAP generation error:', error);
      const mock = new MockAIProvider();
      return mock.generateSOAP(context);
    }
  }

  async suggestCodes(soapNote: string, encounterType: string): Promise<{ icd10: CodeSuggestion[]; cpt: CodeSuggestion[] }> {
    try {
      const client = await this.getClient();

      const systemPrompt = `You are a medical coding specialist for chiropractic practices.
Analyze SOAP notes and suggest appropriate ICD-10-CM and CPT codes.
Focus on codes commonly used in chiropractic care.
Provide rationale for each suggestion and confidence level.

IMPORTANT: Respond ONLY with valid JSON, no markdown code blocks.`;

      const userPrompt = `Analyze this ${encounterType} SOAP note and suggest billing codes:

${soapNote}

Respond with JSON:
{
  "icd10": [
    { "code": "M54.5", "description": "...", "confidence": 0.9, "rationale": "...", "isChiroCommon": true }
  ],
  "cpt": [
    { "code": "98941", "description": "...", "confidence": 0.85, "rationale": "...", "isChiroCommon": true }
  ]
}

Include common chiropractic codes:
- ICD-10: M54.x (back pain), M99.x (somatic dysfunction), M62.x (muscle disorders)
- CPT: 98940-98942 (CMT), 97110-97140 (therapeutic procedures), 99213-99215 (E/M)`;

      const response = await client.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 1500,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        system: systemPrompt,
      });

      const content = response.content[0];
      if (content.type !== 'text') throw new Error('Unexpected response type');

      const parsed = JSON.parse(content.text);
      return {
        icd10: parsed.icd10 || [],
        cpt: parsed.cpt || [],
      };
    } catch (error) {
      console.error('Claude code suggestion error:', error);
      const mock = new MockAIProvider();
      return mock.suggestCodes(soapNote, encounterType);
    }
  }

  async checkCompliance(soapNote: SOAPNoteContent, encounterType: string): Promise<ComplianceResult> {
    try {
      const client = await this.getClient();

      const systemPrompt = `You are a healthcare compliance auditor specializing in chiropractic documentation.
Review SOAP notes for completeness, compliance, and best practices.
Check for proper documentation of medical necessity, treatment rationale, and follow-up plans.

IMPORTANT: Respond ONLY with valid JSON, no markdown code blocks.`;

      const userPrompt = `Review this ${encounterType} SOAP note for compliance:

SUBJECTIVE: ${soapNote.subjective || '[MISSING]'}

OBJECTIVE: ${soapNote.objective || '[MISSING]'}

ASSESSMENT: ${soapNote.assessment || '[MISSING]'}

PLAN: ${soapNote.plan || '[MISSING]'}

Respond with JSON:
{
  "isCompliant": boolean,
  "score": number (0-100),
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "category": "string",
      "message": "string",
      "section": "subjective" | "objective" | "assessment" | "plan" | "general",
      "suggestion": "string"
    }
  ]
}

Check for: required elements, medical necessity, treatment justification, pain scale, functional assessments, follow-up recommendations.`;

      const response = await client.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 1500,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        system: systemPrompt,
      });

      const content = response.content[0];
      if (content.type !== 'text') throw new Error('Unexpected response type');

      const parsed = JSON.parse(content.text);
      return {
        isCompliant: parsed.isCompliant ?? false,
        score: parsed.score ?? 0,
        issues: parsed.issues || [],
      };
    } catch (error) {
      console.error('Claude compliance check error:', error);
      const mock = new MockAIProvider();
      return mock.checkCompliance(soapNote, encounterType);
    }
  }
}

// ============================================
// Gemini Provider (Fast OCR/Transcription)
// ============================================
class GeminiProvider implements AIProvider {
  private genai: InstanceType<typeof import('@google/generative-ai').GoogleGenerativeAI> | null = null;

  private async getClient() {
    if (!this.genai) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      this.genai = new GoogleGenerativeAI(env.GOOGLE_AI_API_KEY || '');
    }
    return this.genai;
  }

  async transcribe(audioData: Buffer | string, mimeType: string): Promise<TranscriptionResult> {
    try {
      const client = await this.getClient();
      const model = client.getGenerativeModel({ model: 'gemini-3.0-flash' });

      // Convert to base64 if buffer
      const base64Data = typeof audioData === 'string'
        ? audioData
        : audioData.toString('base64');

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        'Transcribe this audio accurately. Return only the transcribed text, nothing else.',
      ]);

      const text = result.response.text();
      return {
        text,
        confidence: 0.93,
      };
    } catch (error) {
      console.error('Gemini transcription error:', error);
      // Fallback to OpenAI Whisper if available
      if (env.OPENAI_API_KEY) {
        const openai = new OpenAIProvider();
        return openai.transcribe(audioData, mimeType);
      }
      const mock = new MockAIProvider();
      return mock.transcribe(audioData, mimeType);
    }
  }

  async generateSOAP(context: SOAPGenerationContext): Promise<SOAPSuggestion> {
    // Delegate to Claude for SOAP generation (better quality)
    if (env.ANTHROPIC_API_KEY) {
      const claude = new ClaudeProvider();
      return claude.generateSOAP(context);
    }
    const mock = new MockAIProvider();
    return mock.generateSOAP(context);
  }

  async suggestCodes(soapNote: string, encounterType: string): Promise<{ icd10: CodeSuggestion[]; cpt: CodeSuggestion[] }> {
    // Delegate to Claude for code suggestions (better accuracy)
    if (env.ANTHROPIC_API_KEY) {
      const claude = new ClaudeProvider();
      return claude.suggestCodes(soapNote, encounterType);
    }
    const mock = new MockAIProvider();
    return mock.suggestCodes(soapNote, encounterType);
  }

  async checkCompliance(soapNote: SOAPNoteContent, encounterType: string): Promise<ComplianceResult> {
    // Delegate to Claude for compliance (better reasoning)
    if (env.ANTHROPIC_API_KEY) {
      const claude = new ClaudeProvider();
      return claude.checkCompliance(soapNote, encounterType);
    }
    const mock = new MockAIProvider();
    return mock.checkCompliance(soapNote, encounterType);
  }
}

// ============================================
// OpenAI Provider (Legacy/Fallback for Whisper)
// ============================================
class OpenAIProvider implements AIProvider {
  private openai: InstanceType<typeof import('openai').default> | null = null;

  private async getClient() {
    if (!this.openai) {
      const OpenAI = (await import('openai')).default;
      this.openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY || '',
      });
    }
    return this.openai;
  }

  async transcribe(audioData: Buffer | string, mimeType: string): Promise<TranscriptionResult> {
    try {
      const client = await this.getClient();

      // Convert base64 to buffer if needed
      const buffer = typeof audioData === 'string'
        ? Buffer.from(audioData, 'base64')
        : audioData;

      // Create a File object for the API (convert Buffer to Uint8Array for compatibility)
      const file = new File([new Uint8Array(buffer)], 'audio.wav', { type: mimeType });

      const response = await client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
      });

      return {
        text: response.text,
        confidence: 0.95,
        segments: response.segments?.map(seg => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })),
      };
    } catch (error) {
      console.error('OpenAI transcription error:', error);
      const mock = new MockAIProvider();
      return mock.transcribe(audioData, mimeType);
    }
  }

  async generateSOAP(context: SOAPGenerationContext): Promise<SOAPSuggestion> {
    // Delegate to Claude if available
    if (env.ANTHROPIC_API_KEY) {
      const claude = new ClaudeProvider();
      return claude.generateSOAP(context);
    }
    const mock = new MockAIProvider();
    return mock.generateSOAP(context);
  }

  async suggestCodes(soapNote: string, encounterType: string): Promise<{ icd10: CodeSuggestion[]; cpt: CodeSuggestion[] }> {
    if (env.ANTHROPIC_API_KEY) {
      const claude = new ClaudeProvider();
      return claude.suggestCodes(soapNote, encounterType);
    }
    const mock = new MockAIProvider();
    return mock.suggestCodes(soapNote, encounterType);
  }

  async checkCompliance(soapNote: SOAPNoteContent, encounterType: string): Promise<ComplianceResult> {
    if (env.ANTHROPIC_API_KEY) {
      const claude = new ClaudeProvider();
      return claude.checkCompliance(soapNote, encounterType);
    }
    const mock = new MockAIProvider();
    return mock.checkCompliance(soapNote, encounterType);
  }
}

// ============================================
// Mock AI Provider (Development/Testing)
// ============================================
class MockAIProvider implements AIProvider {
  async transcribe(audioData: Buffer | string, mimeType: string): Promise<TranscriptionResult> {
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      text: "[DEMO] Patient reports low back pain for the past two weeks. Pain is described as a dull ache, rated 6 out of 10. Pain worsens with prolonged sitting and improves with movement. No radiating symptoms reported. Patient states they tried over-the-counter ibuprofen with minimal relief.",
      confidence: 0.92,
      segments: [
        { start: 0, end: 5, text: "[DEMO] Patient reports low back pain" },
        { start: 5, end: 10, text: "for the past two weeks" },
      ]
    };
  }

  async generateSOAP(context: SOAPGenerationContext): Promise<SOAPSuggestion> {
    await new Promise(resolve => setTimeout(resolve, 300));

    const { patientInfo, chiefComplaint, intakeFormData, transcription } = context;

    let subjective = '[DEMO] ';
    if (transcription) {
      subjective += transcription;
    } else if (chiefComplaint) {
      subjective += `Patient presents with ${chiefComplaint}.`;
      if (intakeFormData?.painLocation?.length) {
        subjective += ` Pain located in ${intakeFormData.painLocation.join(', ')}.`;
      }
      if (intakeFormData?.painScale) {
        subjective += ` Pain rated ${intakeFormData.painScale}/10.`;
      }
      if (intakeFormData?.painDuration) {
        subjective += ` Duration: ${intakeFormData.painDuration}.`;
      }
    }

    return {
      subjective,
      objective: `[DEMO] Vitals: BP 120/80, HR 72 bpm.\nPosture: Forward head posture noted.\nROM: Lumbar flexion 60%, extension 40%.\nPalpation: Tenderness at L4-L5.\nOrthopedic tests: Kemp's positive on right.`,
      assessment: `[DEMO] 1. Lumbar segmental dysfunction (M99.03)\n2. Low back pain (M54.5)\nChief complaint: ${chiefComplaint || 'as noted'}.`,
      plan: `[DEMO] 1. CMT to lumbar spine\n2. Therapeutic exercises for core stability\n3. Patient education on ergonomics\n4. Follow-up in 3-5 days`,
      confidence: 0.75
    };
  }

  async suggestCodes(soapNote: string, encounterType: string): Promise<{ icd10: CodeSuggestion[]; cpt: CodeSuggestion[] }> {
    await new Promise(resolve => setTimeout(resolve, 400));

    const noteLC = soapNote.toLowerCase();
    const icd10Suggestions: CodeSuggestion[] = [];
    const cptSuggestions: CodeSuggestion[] = [];

    // Common ICD-10 codes based on keywords
    if (noteLC.includes('low back') || noteLC.includes('lumbar')) {
      icd10Suggestions.push({
        code: 'M54.50',
        description: '[DEMO] Low back pain, unspecified',
        confidence: 0.9,
        rationale: 'Patient presents with low back pain symptoms',
        isChiroCommon: true
      });
    }

    if (noteLC.includes('neck') || noteLC.includes('cervical')) {
      icd10Suggestions.push({
        code: 'M54.2',
        description: '[DEMO] Cervicalgia',
        confidence: 0.88,
        rationale: 'Patient presents with neck pain symptoms',
        isChiroCommon: true
      });
    }

    if (icd10Suggestions.length === 0) {
      icd10Suggestions.push({
        code: 'M99.01',
        description: '[DEMO] Segmental dysfunction of cervical region',
        confidence: 0.7,
        rationale: 'Common chiropractic finding',
        isChiroCommon: true
      });
    }

    // CPT suggestions
    if (encounterType === 'INITIAL_EVAL') {
      cptSuggestions.push({
        code: '99203',
        description: '[DEMO] Office visit, new patient, low complexity',
        confidence: 0.85,
        rationale: 'New patient evaluation',
        isChiroCommon: true
      });
    } else {
      cptSuggestions.push({
        code: '99213',
        description: '[DEMO] Office visit, established patient',
        confidence: 0.85,
        rationale: 'Established patient follow-up',
        isChiroCommon: true
      });
    }

    cptSuggestions.push({
      code: '98941',
      description: '[DEMO] CMT, 3-4 spinal regions',
      confidence: 0.9,
      rationale: 'Spinal manipulation performed',
      isChiroCommon: true
    });

    return { icd10: icd10Suggestions, cpt: cptSuggestions };
  }

  async checkCompliance(soapNote: SOAPNoteContent, encounterType: string): Promise<ComplianceResult> {
    await new Promise(resolve => setTimeout(resolve, 200));

    const issues: ComplianceIssue[] = [];
    let score = 100;

    if (!soapNote.subjective || soapNote.subjective.trim().length < 20) {
      issues.push({
        severity: 'error',
        category: 'Documentation',
        message: '[DEMO] Subjective section is missing or too brief',
        section: 'subjective',
        suggestion: 'Include patient\'s chief complaint and history'
      });
      score -= 20;
    }

    if (!soapNote.objective || soapNote.objective.trim().length < 30) {
      issues.push({
        severity: 'error',
        category: 'Documentation',
        message: '[DEMO] Objective section is incomplete',
        section: 'objective',
        suggestion: 'Include ROM, palpation findings, and orthopedic tests'
      });
      score -= 25;
    }

    if (!soapNote.assessment || soapNote.assessment.trim().length < 20) {
      issues.push({
        severity: 'error',
        category: 'Documentation',
        message: '[DEMO] Assessment section is missing',
        section: 'assessment',
        suggestion: 'Include diagnosis codes and clinical impression'
      });
      score -= 20;
    }

    if (!soapNote.plan || soapNote.plan.trim().length < 20) {
      issues.push({
        severity: 'warning',
        category: 'Documentation',
        message: '[DEMO] Plan section needs more detail',
        section: 'plan',
        suggestion: 'Include treatment plan and follow-up recommendations'
      });
      score -= 10;
    }

    score = Math.max(0, score);

    return {
      isCompliant: score >= 70 && !issues.some(i => i.severity === 'error'),
      score,
      issues
    };
  }
}

// ============================================
// AI Service Singleton
// ============================================
class AIService {
  private provider: AIProvider;
  private providerName: string;

  constructor() {
    const providerType = getAIProvider();

    switch (providerType) {
      case 'anthropic':
        this.provider = new ClaudeProvider();
        this.providerName = 'Claude Opus 4.5';
        break;
      case 'google':
        this.provider = new GeminiProvider();
        this.providerName = 'Gemini 3.0 Flash';
        break;
      case 'openai':
        this.provider = new OpenAIProvider();
        this.providerName = 'OpenAI (Legacy)';
        break;
      default:
        this.provider = new MockAIProvider();
        this.providerName = 'Mock (Demo Mode)';
    }

    console.log(`[AI Service] Initialized with provider: ${this.providerName}`);
  }

  /**
   * Get the current provider name
   */
  getProviderName(): string {
    return this.providerName;
  }

  /**
   * Transcribe audio to text
   */
  async transcribeAudio(audioData: Buffer | string, mimeType: string): Promise<TranscriptionResult> {
    return this.provider.transcribe(audioData, mimeType);
  }

  /**
   * Generate SOAP note content based on context
   */
  async generateSOAPSuggestion(context: SOAPGenerationContext): Promise<SOAPSuggestion> {
    return this.provider.generateSOAP(context);
  }

  /**
   * Suggest ICD-10 and CPT codes based on SOAP note content
   */
  async suggestBillingCodes(soapNote: string, encounterType: string): Promise<{ icd10: CodeSuggestion[]; cpt: CodeSuggestion[] }> {
    return this.provider.suggestCodes(soapNote, encounterType);
  }

  /**
   * Check SOAP note compliance and documentation quality
   */
  async checkDocumentationCompliance(soapNote: SOAPNoteContent, encounterType: string): Promise<ComplianceResult> {
    return this.provider.checkCompliance(soapNote, encounterType);
  }

  /**
   * Auto-fill SOAP note from intake form data
   */
  async autoFillFromIntake(intakeData: IntakeFormData, patientInfo: { name: string; age: number; gender: string }): Promise<SOAPSuggestion> {
    return this.generateSOAPSuggestion({
      patientInfo,
      chiefComplaint: intakeData.chiefComplaint || '',
      encounterType: 'INITIAL_EVAL',
      intakeFormData: intakeData
    });
  }

  /**
   * Generate medical necessity documentation
   */
  async generateMedicalNecessity(
    diagnosis: string,
    treatment: string,
    functionalLimitations: string[]
  ): Promise<string> {
    const limitations = functionalLimitations.join(', ');
    return `Medical Necessity Statement:

Patient presents with ${diagnosis} resulting in functional limitations including ${limitations || 'activities of daily living impairment'}.

The proposed treatment (${treatment}) is medically necessary to:
1. Reduce pain and inflammation
2. Restore normal joint function and range of motion
3. Improve functional capacity for daily activities
4. Prevent further degeneration or complications

Without treatment, patient's condition is expected to worsen, potentially leading to chronic pain, permanent disability, and reduced quality of life.

Treatment is conservative in nature and represents the least invasive appropriate intervention for this condition.`;
  }
}

// Export singleton instance
export const aiService = new AIService();

// Export types for use in routers
export type {
  AIProvider,
  SOAPGenerationContext,
  SOAPNoteContent
};
