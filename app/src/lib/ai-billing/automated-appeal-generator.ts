/**
 * Epic 31: AI Billing Agent - Automated Appeal Generator
 *
 * US-310: Automated appeal generation
 *
 * AI agent that generates appeal letters for denied claims with:
 * - Payer-specific appeal templates
 * - Medical necessity arguments from clinical documentation
 * - Supporting documentation selection
 * - Clinical rationale extraction from notes
 * - Compliance with appeal deadlines
 * - Track appeal success rates
 * - Learn from successful appeals
 */

import type { PrismaClient, AIAppealStatus } from '@prisma/client';
import type { AppealArgument, AppealCitation } from './types';
import { COMMON_CARC_CODES } from './types';

// ============================================
// Types
// ============================================

export type AppealType = 'FIRST_LEVEL' | 'SECOND_LEVEL' | 'EXTERNAL';

export interface AutomatedAppealInput {
  denialId?: string;
  claimId: string;
  denialCode?: string;
  denialReason?: string;
  denialAmount?: number;
  appealType?: AppealType;
  payerId?: string;
  includeAllDocumentation?: boolean;
}

export interface AutomatedAppealOutput {
  appealId: string;
  subject: string;
  body: string;
  appealType: AppealType;
  denialCode?: string;
  denialReason?: string;
  arguments: AppealArgument[];
  citations: AppealCitation[];
  medicalNecessity?: string;
  clinicalRationale?: string;
  clinicalSummary?: string;
  requiredDocuments: string[];
  attachments: AppealAttachment[];
  payerTemplate?: string;
  appealDeadline?: Date;
  successLikelihood: number;
  processingTimeMs: number;
}

export interface AppealAttachment {
  name: string;
  type: 'clinical_note' | 'x_ray' | 'treatment_plan' | 'eligibility' | 'authorization' | 'other';
  description: string;
  required: boolean;
  available: boolean;
  documentId?: string;
}

export interface AppealSuccessMetrics {
  payerId?: string;
  denialCode?: string;
  appealType: AppealType;
  totalAppeals: number;
  successfulAppeals: number;
  successRate: number;
  averageRecovery: number;
  averageResponseDays: number;
  topSuccessFactors: string[];
}

export interface PayerAppealTemplate {
  payerId: string;
  payerName: string;
  templateName: string;
  appealAddress?: string;
  faxNumber?: string;
  portalUrl?: string;
  preferredMethod: 'mail' | 'fax' | 'portal' | 'electronic';
  timelyFilingDays: number;
  requiredDocuments: string[];
  specialInstructions?: string;
  openingTemplate: string;
  closingTemplate: string;
  successFactors: string[];
}

export interface LearnedAppealPattern {
  denialCode: string;
  payerId?: string;
  successfulArguments: Array<{ argument: string; successCount: number }>;
  successfulCitations: Array<{ citation: string; successCount: number }>;
  averageSuccessRate: number;
  recommendedTemplate: string;
}

// ============================================
// Default Payer Templates
// ============================================

const DEFAULT_PAYER_TEMPLATES: Record<string, Partial<PayerAppealTemplate>> = {
  // Medicare
  'MEDICARE': {
    templateName: 'Medicare Standard Appeal',
    preferredMethod: 'mail',
    timelyFilingDays: 120,
    requiredDocuments: [
      'CMS-1500 claim form',
      'Medical records',
      'Physician attestation',
      'Any prior authorization documentation',
    ],
    openingTemplate: 'We are submitting this appeal pursuant to the Medicare appeals process outlined in 42 CFR Part 405. We respectfully request a Qualified Independent Contractor (QIC) review of this claim denial.',
    closingTemplate: 'We request that Medicare reconsider this denial based on the clinical evidence and supporting documentation provided. The services rendered were medically necessary and appropriate according to Medicare coverage guidelines.',
    successFactors: ['Clinical documentation', 'LCD/NCD citations', 'Medical necessity evidence'],
  },
  // Blue Cross Blue Shield (generic)
  'BCBS': {
    templateName: 'BCBS Standard Appeal',
    preferredMethod: 'portal',
    timelyFilingDays: 180,
    requiredDocuments: [
      'Original claim copy',
      'Medical records',
      'Authorization documentation if applicable',
    ],
    openingTemplate: 'We are submitting this appeal in accordance with your member appeal guidelines. We request a full and fair review of this denial determination.',
    closingTemplate: 'Based on the clinical evidence and supporting documentation, we respectfully request that you overturn this denial and process this claim for payment in accordance with the member\'s plan benefits.',
    successFactors: ['Plan benefit citations', 'Clinical documentation', 'Prior authorization proof'],
  },
  // United Healthcare
  'UHC': {
    templateName: 'UnitedHealthcare Appeal',
    preferredMethod: 'portal',
    timelyFilingDays: 180,
    requiredDocuments: [
      'UHC Claim Reconsideration Form',
      'Medical records',
      'Clinical notes',
    ],
    openingTemplate: 'We are submitting this claim appeal through the UnitedHealthcare appeals process. This letter formally disputes the denial of the above-referenced claim.',
    closingTemplate: 'We request that UnitedHealthcare reconsider this determination and process payment for the services rendered. The enclosed documentation demonstrates the medical necessity and appropriateness of care.',
    successFactors: ['Complete documentation', 'Timely submission', 'Medical necessity evidence'],
  },
  // Aetna
  'AETNA': {
    templateName: 'Aetna Appeal',
    preferredMethod: 'portal',
    timelyFilingDays: 180,
    requiredDocuments: [
      'Aetna Appeal Form',
      'Medical records',
      'Physician statement',
    ],
    openingTemplate: 'We are submitting this formal appeal of the denial for the above-referenced claim in accordance with Aetna\'s appeals procedures.',
    closingTemplate: 'Based on the evidence provided, we respectfully request that Aetna overturn this denial decision and authorize payment for these medically necessary services.',
    successFactors: ['Complete appeal form', 'Physician attestation', 'Clinical evidence'],
  },
  // Cigna
  'CIGNA': {
    templateName: 'Cigna Appeal',
    preferredMethod: 'mail',
    timelyFilingDays: 180,
    requiredDocuments: [
      'Copy of denial letter',
      'Medical records',
      'Physician statement of medical necessity',
    ],
    openingTemplate: 'This letter serves as a formal appeal of the denial for the referenced claim. We request a full review of the clinical circumstances.',
    closingTemplate: 'The enclosed documentation supports the medical necessity of the services provided. We request that Cigna reconsider this denial and process the claim for payment.',
    successFactors: ['Detailed clinical notes', 'Medical necessity documentation', 'Timely appeal'],
  },
  // Default/Generic
  'DEFAULT': {
    templateName: 'Standard Appeal Template',
    preferredMethod: 'mail',
    timelyFilingDays: 60,
    requiredDocuments: [
      'Copy of original claim',
      'Medical records',
      'Provider documentation',
    ],
    openingTemplate: 'We are submitting this formal appeal of the claim denial referenced above. We respectfully request a full review of this determination.',
    closingTemplate: 'Based on the clinical documentation provided, we believe this denial was made in error. We respectfully request that you reconsider this determination and process the claim for payment.',
    successFactors: ['Complete documentation', 'Clear medical necessity', 'Timely submission'],
  },
};

// ============================================
// Denial Code to Appeal Strategy Mapping
// ============================================

const DENIAL_APPEAL_STRATEGIES: Record<string, {
  category: string;
  primaryArguments: string[];
  requiredDocs: string[];
  citations: AppealCitation[];
  successLikelihood: number;
}> = {
  // Medical Necessity
  '50': {
    category: 'MEDICAL_NECESSITY',
    primaryArguments: [
      'Clinical documentation demonstrates medical necessity',
      'Treatment aligns with established clinical guidelines',
      'Patient history and symptoms support the service rendered',
      'Conservative treatment was appropriate for the condition',
    ],
    requiredDocs: ['Clinical notes', 'Treatment plan', 'Diagnostic imaging', 'Progress notes'],
    citations: [
      { type: 'GUIDELINE', source: 'American Chiropractic Association', text: 'Spinal manipulation is recommended for acute and chronic low back pain', reference: 'ACA Clinical Guidelines 2023' },
      { type: 'MEDICAL', source: 'Journal of Manipulative and Physiological Therapeutics', text: 'Chiropractic care is effective for musculoskeletal conditions', reference: 'JMPT Evidence Review' },
    ],
    successLikelihood: 0.45,
  },
  '96': {
    category: 'MEDICAL_NECESSITY',
    primaryArguments: [
      'Service is covered under the patient\'s benefit plan',
      'Condition diagnosed requires the treatment provided',
      'No exclusion applies to this service',
    ],
    requiredDocs: ['Diagnosis documentation', 'Treatment records', 'Benefit plan summary'],
    citations: [],
    successLikelihood: 0.40,
  },
  // Timely Filing
  '29': {
    category: 'TIMELY_FILING',
    primaryArguments: [
      'Original claim was submitted within the filing deadline',
      'Extenuating circumstances prevented timely resubmission',
      'Proof of original submission is attached',
    ],
    requiredDocs: ['Submission confirmation', 'Clearinghouse report', 'Date stamps'],
    citations: [],
    successLikelihood: 0.25,
  },
  // Authorization
  '197': {
    category: 'AUTHORIZATION',
    primaryArguments: [
      'Prior authorization was obtained as required',
      'Authorization number is documented',
      'Services fell within the authorized scope',
    ],
    requiredDocs: ['Authorization approval', 'Authorization tracking', 'Communication records'],
    citations: [],
    successLikelihood: 0.35,
  },
  // Duplicate
  '18': {
    category: 'DUPLICATE',
    primaryArguments: [
      'This is not a duplicate claim',
      'Services were rendered on different dates',
      'Each service was distinct and medically necessary',
    ],
    requiredDocs: ['Service date documentation', 'Unique encounter records'],
    citations: [],
    successLikelihood: 0.50,
  },
  // Bundling
  '97': {
    category: 'BUNDLING',
    primaryArguments: [
      'Procedures were performed as distinct services',
      'Modifier usage is appropriate per coding guidelines',
      'Each procedure had separate medical necessity',
    ],
    requiredDocs: ['Operative notes', 'Procedure documentation', 'Coding rationale'],
    citations: [
      { type: 'GUIDELINE', source: 'AMA CPT Guidelines', text: 'Modifier 59 or X modifiers indicate distinct procedural services', reference: 'CPT Professional Edition' },
    ],
    successLikelihood: 0.45,
  },
  // Eligibility
  '26': {
    category: 'ELIGIBILITY',
    primaryArguments: [
      'Patient was eligible at time of service',
      'Coverage was verified prior to service',
      'Eligibility documentation is attached',
    ],
    requiredDocs: ['Eligibility verification', 'Insurance card copy', 'Coverage confirmation'],
    citations: [],
    successLikelihood: 0.40,
  },
  // Coding
  '4': {
    category: 'CODING',
    primaryArguments: [
      'Procedure code is appropriate for the service',
      'Modifier usage follows current coding guidelines',
      'Documentation supports the code billed',
    ],
    requiredDocs: ['Clinical notes', 'Coding rationale', 'Modifier justification'],
    citations: [],
    successLikelihood: 0.55,
  },
};

// ============================================
// AutomatedAppealGenerator Class
// ============================================

export class AutomatedAppealGenerator {
  private prisma: PrismaClient;
  private organizationId: string;

  constructor(prisma: PrismaClient, organizationId: string) {
    this.prisma = prisma;
    this.organizationId = organizationId;
  }

  /**
   * Generate an automated appeal letter
   */
  async generateAppeal(input: AutomatedAppealInput): Promise<AutomatedAppealOutput> {
    const startTime = Date.now();

    // Fetch claim with related data
    const claim = await this.prisma.claim.findFirst({
      where: {
        id: input.claimId,
        organizationId: this.organizationId,
      },
      include: {
        patient: {
          include: {
            demographics: true,
          },
        },
        payer: true,
        insurancePolicy: true,
        encounter: {
          include: {
            provider: { include: { user: { select: { firstName: true, lastName: true } } } },
            soapNote: true,
            diagnoses: true,
            charges: true,
          },
        },
        claimLines: true,
        denials: input.denialId ? { where: { id: input.denialId } } : { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!claim) {
      throw new Error(`Claim not found: ${input.claimId}`);
    }

    const denial = claim.denials?.[0];
    const denialCode = input.denialCode || denial?.denialCode || '';
    const denialReason = input.denialReason || denial?.denialReason || '';
    const denialAmount = input.denialAmount || denial?.deniedAmount?.toNumber() || 0;
    const appealType = input.appealType || 'FIRST_LEVEL';

    // Get payer-specific template
    const payerTemplate = await this.getPayerTemplate(claim.payerId || undefined);

    // Get appeal strategy based on denial code
    const strategy = DENIAL_APPEAL_STRATEGIES[denialCode] || DENIAL_APPEAL_STRATEGIES['50']; // Default to medical necessity

    // Build arguments from clinical documentation
    const arguments_ = await this.buildAppealArguments(claim, denial, strategy);

    // Get medical necessity statement from clinical notes
    const medicalNecessity = this.extractMedicalNecessity(claim);

    // Extract clinical rationale from SOAP notes
    const clinicalRationale = this.extractClinicalRationale(claim);

    // Build clinical summary
    const clinicalSummary = this.buildClinicalSummary(claim);

    // Select and build citations
    const citations = await this.selectCitations(denialCode, claim);

    // Determine required documents
    const requiredDocuments = this.getRequiredDocuments(strategy, payerTemplate);

    // Select available attachments
    const attachments = await this.selectAttachments(claim, requiredDocuments);

    // Calculate appeal deadline
    const appealDeadline = this.calculateAppealDeadline(denial, payerTemplate);

    // Calculate success likelihood based on historical data
    const successLikelihood = await this.calculateSuccessLikelihood(denialCode, claim.payerId || undefined, appealType);

    // Build the appeal letter body
    const subject = this.buildSubject(claim, appealType, denialCode);
    const body = this.buildAppealBody({
      claim,
      denial,
      denialCode,
      denialReason,
      appealType,
      payerTemplate,
      arguments: arguments_,
      citations,
      medicalNecessity,
      clinicalRationale,
      clinicalSummary,
    });

    // Create AIAppeal record
    const aiAppeal = await this.createAppealRecord({
      claimId: claim.id,
      subject,
      body,
      appealType,
      denialCode,
      denialReason,
      denialAmount,
      arguments: arguments_,
      citations,
      medicalNecessity,
      clinicalSummary,
      attachments,
      appealDeadline,
      payerTemplate: payerTemplate?.templateName,
      processingTimeMs: Date.now() - startTime,
    });

    // Create AI billing task record
    await this.createTaskRecord(claim.id, aiAppeal.id, appealType, successLikelihood);

    return {
      appealId: aiAppeal.id,
      subject,
      body,
      appealType,
      denialCode: denialCode || undefined,
      denialReason: denialReason || undefined,
      arguments: arguments_,
      citations,
      medicalNecessity,
      clinicalRationale,
      clinicalSummary,
      requiredDocuments,
      attachments,
      payerTemplate: payerTemplate?.templateName,
      appealDeadline,
      successLikelihood,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get payer-specific appeal template
   */
  private async getPayerTemplate(payerId?: string): Promise<PayerAppealTemplate | undefined> {
    if (!payerId) {
      return this.buildTemplateFromDefaults('DEFAULT');
    }

    // Check for custom template in database
    const customRule = await this.prisma.aIBillingRule.findFirst({
      where: {
        organizationId: this.organizationId,
        category: 'appeal',
        payerIds: { has: payerId },
        isActive: true,
      },
    });

    if (customRule) {
      const actions = customRule.actions as Record<string, unknown>;
      return {
        payerId,
        payerName: (actions.payerName as string) || 'Unknown Payer',
        templateName: customRule.name,
        appealAddress: actions.appealAddress as string | undefined,
        faxNumber: actions.faxNumber as string | undefined,
        portalUrl: actions.portalUrl as string | undefined,
        preferredMethod: (actions.preferredMethod as 'mail' | 'fax' | 'portal' | 'electronic') || 'mail',
        timelyFilingDays: (actions.timelyFilingDays as number) || 60,
        requiredDocuments: (actions.requiredDocuments as string[]) || [],
        specialInstructions: actions.specialInstructions as string | undefined,
        openingTemplate: (actions.openingTemplate as string) || DEFAULT_PAYER_TEMPLATES.DEFAULT!.openingTemplate!,
        closingTemplate: (actions.closingTemplate as string) || DEFAULT_PAYER_TEMPLATES.DEFAULT!.closingTemplate!,
        successFactors: (actions.successFactors as string[]) || [],
      };
    }

    // Fetch payer details
    const payer = await this.prisma.insurancePayer.findUnique({
      where: { id: payerId },
    });

    if (!payer) {
      return this.buildTemplateFromDefaults('DEFAULT');
    }

    // Match payer to default template
    const payerName = payer.name.toUpperCase();
    let templateKey = 'DEFAULT';

    if (payerName.includes('MEDICARE')) {
      templateKey = 'MEDICARE';
    } else if (payerName.includes('BLUE CROSS') || payerName.includes('BCBS') || payerName.includes('ANTHEM')) {
      templateKey = 'BCBS';
    } else if (payerName.includes('UNITED') || payerName.includes('UHC')) {
      templateKey = 'UHC';
    } else if (payerName.includes('AETNA')) {
      templateKey = 'AETNA';
    } else if (payerName.includes('CIGNA')) {
      templateKey = 'CIGNA';
    }

    return this.buildTemplateFromDefaults(templateKey, payerId, payer.name);
  }

  /**
   * Build template from defaults
   */
  private buildTemplateFromDefaults(key: string, payerId?: string, payerName?: string): PayerAppealTemplate {
    const defaults = DEFAULT_PAYER_TEMPLATES[key] || DEFAULT_PAYER_TEMPLATES.DEFAULT!;
    return {
      payerId: payerId || 'default',
      payerName: payerName || 'Insurance Payer',
      templateName: defaults.templateName!,
      preferredMethod: defaults.preferredMethod!,
      timelyFilingDays: defaults.timelyFilingDays!,
      requiredDocuments: defaults.requiredDocuments!,
      openingTemplate: defaults.openingTemplate!,
      closingTemplate: defaults.closingTemplate!,
      successFactors: defaults.successFactors!,
    };
  }

  /**
   * Build appeal arguments from clinical documentation
   */
  private async buildAppealArguments(
    claim: Record<string, unknown>,
    denial: { denialCode: string | null; denialReason: string | null } | null,
    strategy: typeof DENIAL_APPEAL_STRATEGIES[string]
  ): Promise<AppealArgument[]> {
    const arguments_: AppealArgument[] = [];

    // Add primary arguments from strategy
    for (const arg of strategy.primaryArguments) {
      arguments_.push({
        type: strategy.category,
        text: arg,
      });
    }

    // Add diagnosis-based arguments
    const encounter = claim.encounter as { diagnoses?: Array<{ icd10Code: string; description: string | null }>; charges?: Array<{ cptCode: string | null }> } | null;
    if (encounter?.diagnoses?.length) {
      const diagnoses = encounter.diagnoses.map(d => `${d.icd10Code}: ${d.description || 'Diagnosis'}`).join(', ');
      arguments_.push({
        type: 'DIAGNOSIS',
        text: `The patient was diagnosed with ${diagnoses}, which required the treatment provided.`,
        supporting: diagnoses,
      });
    }

    // Add procedure-based arguments
    const claimLines = claim.claimLines as Array<{ cptCode: string }> | undefined;
    if (claimLines?.length) {
      const procedures = claimLines.map(l => l.cptCode).join(', ');
      arguments_.push({
        type: 'PROCEDURES',
        text: `The procedures performed (${procedures}) were medically necessary and appropriate for the patient's condition.`,
        supporting: procedures,
      });
    }

    // Add denial-specific counter-argument
    if (denial?.denialCode && denial.denialReason) {
      arguments_.push({
        type: 'DENIAL_DISPUTE',
        text: `We dispute the denial reason "${denial.denialReason}" (Code: ${denial.denialCode}). The enclosed documentation demonstrates that the services were provided appropriately and in accordance with clinical guidelines.`,
      });
    }

    // Learn from successful appeals and add proven arguments
    const claimForPatterns = { payerId: (claim as { payerId?: string | null }).payerId };
    const learnedPatterns = await this.getLearnedPatterns(denial?.denialCode || '', claimForPatterns);
    for (const pattern of learnedPatterns?.successfulArguments?.slice(0, 2) || []) {
      arguments_.push({
        type: 'LEARNED',
        text: pattern.argument,
        supporting: `Previously successful in ${pattern.successCount} appeals`,
      });
    }

    return arguments_;
  }

  /**
   * Extract medical necessity statement from clinical notes
   */
  private extractMedicalNecessity(claim: Record<string, unknown>): string {
    const encounter = claim.encounter as { soapNote?: { subjective?: string | null; objective?: string | null } | null; diagnoses?: Array<{ icd10Code: string; description: string | null }> } | null;
    const soapNote = encounter?.soapNote;
    const diagnoses = encounter?.diagnoses || [];

    const parts: string[] = [];

    // Start with standard medical necessity statement
    parts.push('The services rendered were medically necessary based on the following clinical findings:');

    // Add subjective findings
    if (soapNote?.subjective) {
      const subjective = soapNote.subjective.substring(0, 300);
      parts.push(`\nPatient Presentation: ${subjective}${soapNote.subjective.length > 300 ? '...' : ''}`);
    }

    // Add objective findings
    if (soapNote?.objective) {
      const objective = soapNote.objective.substring(0, 300);
      parts.push(`\nClinical Findings: ${objective}${soapNote.objective.length > 300 ? '...' : ''}`);
    }

    // Add diagnosis information
    if (diagnoses.length > 0) {
      const diagnosisList = diagnoses.map(d => `${d.icd10Code} (${d.description || 'Diagnosis'})`).join('; ');
      parts.push(`\nDiagnoses: ${diagnosisList}`);
    }

    // Add standard conclusion
    parts.push('\nThese findings demonstrate clear medical necessity for the treatment provided. The services were appropriate, not experimental, and consistent with accepted standards of care.');

    return parts.join('');
  }

  /**
   * Extract clinical rationale from SOAP notes
   */
  private extractClinicalRationale(claim: Record<string, unknown>): string | undefined {
    const encounter = claim.encounter as { soapNote?: { assessment?: string | null; plan?: string | null } | null } | null;
    const soapNote = encounter?.soapNote;
    if (!soapNote) return undefined;

    const parts: string[] = [];

    // Assessment provides clinical reasoning
    if (soapNote.assessment) {
      parts.push(`Clinical Assessment: ${soapNote.assessment.substring(0, 400)}${soapNote.assessment.length > 400 ? '...' : ''}`);
    }

    // Treatment plan explains rationale
    if (soapNote.plan) {
      parts.push(`Treatment Plan: ${soapNote.plan.substring(0, 400)}${soapNote.plan.length > 400 ? '...' : ''}`);
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  /**
   * Build clinical summary
   */
  private buildClinicalSummary(claim: Record<string, unknown>): string | undefined {
    const encounter = claim.encounter as { encounterDate?: Date | null; soapNote?: { chiefComplaint?: string | null } | null; diagnoses?: Array<{ icd10Code: string }>; charges?: Array<{ cptCode?: string | null }> } | null;
    if (!encounter) return undefined;

    const parts: string[] = [];
    const patient = claim.patient as { demographics?: { firstName?: string | null; lastName?: string | null } | null } | null;
    const patientName = patient?.demographics ? `${patient.demographics.firstName} ${patient.demographics.lastName}` : 'the patient';

    // Visit information
    if (encounter.encounterDate) {
      const dateStr = new Date(encounter.encounterDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      parts.push(`On ${dateStr}, ${patientName} presented for chiropractic care.`);
    }

    // Chief complaint
    const soapNote = encounter.soapNote;
    if (soapNote?.chiefComplaint) {
      parts.push(`Chief Complaint: ${soapNote.chiefComplaint}`);
    }

    // Diagnoses
    if (encounter.diagnoses?.length && encounter.diagnoses.length > 0) {
      const codes = encounter.diagnoses.map(d => d.icd10Code).join(', ');
      parts.push(`Diagnoses: ${codes}`);
    }

    // Procedures
    if (encounter.charges?.length && encounter.charges.length > 0) {
      const procedures = encounter.charges.filter(c => c.cptCode).map(c => c.cptCode).join(', ');
      if (procedures) {
        parts.push(`Procedures Performed: ${procedures}`);
      }
    }

    return parts.length > 0 ? parts.join('\n') : undefined;
  }

  /**
   * Select appropriate citations
   */
  private async selectCitations(denialCode: string, claim: Record<string, unknown>): Promise<AppealCitation[]> {
    const citations: AppealCitation[] = [];
    const strategy = DENIAL_APPEAL_STRATEGIES[denialCode];

    // Add strategy-specific citations
    if (strategy?.citations) {
      citations.push(...strategy.citations);
    }

    // Check for chiropractic procedures and add relevant citations
    const encounter = claim.encounter as { charges?: Array<{ cptCode?: string | null }> } | null;
    const hasChiroCodes = encounter?.charges?.some(c =>
      ['98940', '98941', '98942', '98943'].includes(c.cptCode || '')
    );

    if (hasChiroCodes) {
      citations.push({
        type: 'GUIDELINE',
        source: 'American College of Physicians',
        text: 'Non-pharmacologic treatments including spinal manipulation are recommended as first-line therapy for chronic low back pain',
        reference: 'ACP Clinical Practice Guideline, Annals of Internal Medicine, 2017',
      });

      citations.push({
        type: 'GUIDELINE',
        source: 'American Chiropractic Association',
        text: 'Chiropractic care is safe, effective, and drug-free treatment for musculoskeletal conditions',
        reference: 'ACA Position Statements',
      });
    }

    // Add learned citations from successful appeals
    const learnedPatterns = await this.getLearnedPatterns(denialCode, claim);
    if (learnedPatterns?.successfulCitations) {
      for (const learned of learnedPatterns.successfulCitations.slice(0, 2)) {
        if (!citations.some(c => c.text === learned.citation)) {
          citations.push({
            type: 'GUIDELINE',
            source: 'Previously Successful Citation',
            text: learned.citation,
            reference: `Used in ${learned.successCount} successful appeals`,
          });
        }
      }
    }

    return citations;
  }

  /**
   * Get required documents based on strategy and payer template
   */
  private getRequiredDocuments(
    strategy: typeof DENIAL_APPEAL_STRATEGIES[string],
    payerTemplate: PayerAppealTemplate | undefined
  ): string[] {
    const docs = new Set<string>();

    // Add strategy-required documents
    for (const doc of strategy.requiredDocs) {
      docs.add(doc);
    }

    // Add payer-required documents
    if (payerTemplate?.requiredDocuments) {
      for (const doc of payerTemplate.requiredDocuments) {
        docs.add(doc);
      }
    }

    // Always include basics
    docs.add('Copy of original claim');
    docs.add('Copy of denial letter');
    docs.add('This appeal letter');

    return Array.from(docs);
  }

  /**
   * Select available attachments
   */
  private async selectAttachments(
    _claim: { id: string; encounter: { id: string } | null },
    requiredDocuments: string[]
  ): Promise<AppealAttachment[]> {
    const attachments: AppealAttachment[] = [];

    // Map required documents to attachments
    // Note: Document availability would be checked against a document management system
    // For now, we mark all as potentially available pending manual verification
    for (const reqDoc of requiredDocuments) {
      const docLower = reqDoc.toLowerCase();
      let type: AppealAttachment['type'] = 'other';

      // Determine type
      if (docLower.includes('clinical') || docLower.includes('soap') || docLower.includes('note')) {
        type = 'clinical_note';
      } else if (docLower.includes('x-ray') || docLower.includes('imaging') || docLower.includes('x ray')) {
        type = 'x_ray';
      } else if (docLower.includes('treatment plan') || docLower.includes('plan')) {
        type = 'treatment_plan';
      } else if (docLower.includes('eligibility') || docLower.includes('coverage')) {
        type = 'eligibility';
      } else if (docLower.includes('authorization') || docLower.includes('auth')) {
        type = 'authorization';
      }

      attachments.push({
        name: reqDoc,
        type,
        description: `Required: ${reqDoc}`,
        required: true,
        available: false, // Marked as unavailable pending manual verification
        documentId: undefined,
      });
    }

    return attachments;
  }

  /**
   * Calculate appeal deadline
   */
  private calculateAppealDeadline(
    denial: { appealDeadline: Date | null; createdAt: Date } | null,
    payerTemplate: PayerAppealTemplate | undefined
  ): Date | undefined {
    // Use denial's appeal deadline if set
    if (denial?.appealDeadline) {
      return denial.appealDeadline;
    }

    // Calculate from denial date and payer's timely filing requirement
    if (denial?.createdAt && payerTemplate?.timelyFilingDays) {
      const deadline = new Date(denial.createdAt);
      deadline.setDate(deadline.getDate() + payerTemplate.timelyFilingDays);
      return deadline;
    }

    // Default to 60 days from denial
    if (denial?.createdAt) {
      const deadline = new Date(denial.createdAt);
      deadline.setDate(deadline.getDate() + 60);
      return deadline;
    }

    return undefined;
  }

  /**
   * Calculate success likelihood based on historical data
   */
  private async calculateSuccessLikelihood(
    denialCode: string,
    payerId: string | undefined,
    appealType: AppealType
  ): Promise<number> {
    // Base likelihood from strategy
    const strategy = DENIAL_APPEAL_STRATEGIES[denialCode];
    let likelihood = strategy?.successLikelihood || 0.30;

    // Get historical success rate
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const where: Record<string, unknown> = {
      organizationId: this.organizationId,
      createdAt: { gte: sixMonthsAgo },
      denialCode,
    };

    if (payerId) {
      where.claim = { payerId };
    }

    const [totalAppeals, successfulAppeals] = await Promise.all([
      this.prisma.aIAppeal.count({ where }),
      this.prisma.aIAppeal.count({
        where: {
          ...where,
          status: { in: ['APPROVED', 'PARTIAL'] },
        },
      }),
    ]);

    if (totalAppeals >= 5) {
      const historicalRate = successfulAppeals / totalAppeals;
      // Weight historical rate more heavily if we have enough data
      likelihood = (likelihood * 0.3) + (historicalRate * 0.7);
    }

    // Adjust for appeal type
    if (appealType === 'SECOND_LEVEL') {
      likelihood *= 0.8; // Second level appeals typically have lower success
    } else if (appealType === 'EXTERNAL') {
      likelihood *= 0.6; // External reviews are even less likely
    }

    return Math.min(1, Math.max(0, likelihood));
  }

  /**
   * Get learned patterns from successful appeals
   */
  private async getLearnedPatterns(
    denialCode: string,
    claim: { payerId?: string | null }
  ): Promise<LearnedAppealPattern | undefined> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Find successful appeals with same denial code
    const successfulAppeals = await this.prisma.aIAppeal.findMany({
      where: {
        organizationId: this.organizationId,
        denialCode,
        status: { in: ['APPROVED', 'PARTIAL'] },
        createdAt: { gte: sixMonthsAgo },
      },
      select: {
        arguments: true,
        citations: true,
        successFactors: true,
      },
      take: 20,
    });

    if (successfulAppeals.length < 2) {
      return undefined;
    }

    // Extract and count arguments
    const argumentCounts = new Map<string, number>();
    const citationCounts = new Map<string, number>();

    for (const appeal of successfulAppeals) {
      const args = appeal.arguments as AppealArgument[] | null;
      if (args) {
        for (const arg of args) {
          argumentCounts.set(arg.text, (argumentCounts.get(arg.text) || 0) + 1);
        }
      }

      const cites = appeal.citations as AppealCitation[] | null;
      if (cites) {
        for (const cite of cites) {
          citationCounts.set(cite.text, (citationCounts.get(cite.text) || 0) + 1);
        }
      }
    }

    // Sort by frequency
    const successfulArguments = Array.from(argumentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([argument, successCount]) => ({ argument, successCount }));

    const successfulCitations = Array.from(citationCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([citation, successCount]) => ({ citation, successCount }));

    return {
      denialCode,
      payerId: claim.payerId || undefined,
      successfulArguments,
      successfulCitations,
      averageSuccessRate: successfulAppeals.length / 20, // Rough estimate
      recommendedTemplate: 'Standard',
    };
  }

  /**
   * Build appeal subject line
   */
  private buildSubject(
    claim: { claimNumber: string | null; id: string },
    appealType: AppealType,
    denialCode: string
  ): string {
    const claimRef = claim.claimNumber || claim.id;
    const typePrefix = appealType === 'SECOND_LEVEL' ? 'Second Level ' : appealType === 'EXTERNAL' ? 'External Review ' : '';
    return `${typePrefix}Appeal for Denied Claim ${claimRef}${denialCode ? ` - Code ${denialCode}` : ''}`;
  }

  /**
   * Build the complete appeal body
   */
  private buildAppealBody(params: {
    claim: Record<string, unknown>;
    denial: { denialCode: string | null; denialReason: string | null } | null;
    denialCode: string;
    denialReason: string;
    appealType: AppealType;
    payerTemplate: PayerAppealTemplate | undefined;
    arguments: AppealArgument[];
    citations: AppealCitation[];
    medicalNecessity?: string;
    clinicalRationale?: string;
    clinicalSummary?: string;
  }): string {
    const { claim: claimRaw, denialCode, denialReason, appealType, payerTemplate, arguments: args, citations, medicalNecessity, clinicalRationale, clinicalSummary } = params;

    // Cast claim fields for type safety
    const claim = {
      claimNumber: claimRaw.claimNumber as string | null,
      id: claimRaw.id as string,
      patient: claimRaw.patient as { demographics?: { firstName?: string | null; lastName?: string | null } | null } | null,
      insurancePolicy: claimRaw.insurancePolicy as { policyNumber?: string | null } | null,
      payer: claimRaw.payer as { name?: string } | null,
      encounter: claimRaw.encounter as { encounterDate?: Date | null; provider?: { user?: { firstName?: string | null; lastName?: string | null } | null; npi?: string | null } | null } | null,
    };

    const sections: string[] = [];

    // Date and header
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    sections.push(`Date: ${today}`);
    sections.push('');

    // Addressee
    sections.push(`To: ${claim.payer?.name || payerTemplate?.payerName || 'Insurance Payer'}`);
    sections.push('Appeals Department');
    if (payerTemplate?.appealAddress) {
      sections.push(payerTemplate.appealAddress);
    }
    sections.push('');

    // Reference information
    const appealTypeLabel = appealType === 'SECOND_LEVEL' ? 'Second Level Appeal' : appealType === 'EXTERNAL' ? 'External Review Request' : 'First Level Appeal';
    sections.push(`RE: ${appealTypeLabel}`);
    sections.push(`Claim Number: ${claim.claimNumber || claim.id}`);
    sections.push(`Patient: ${claim.patient?.demographics?.firstName || ''} ${claim.patient?.demographics?.lastName || ''}`);
    sections.push(`Member ID: ${claim.insurancePolicy?.policyNumber || 'N/A'}`);
    if (claim.encounter?.encounterDate) {
      sections.push(`Date of Service: ${new Date(claim.encounter.encounterDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    }
    sections.push(`Denial Code: ${denialCode || 'N/A'}`);
    if (denialReason) {
      sections.push(`Denial Reason: ${denialReason}`);
    }
    sections.push('');
    sections.push('---');
    sections.push('');

    // Salutation
    sections.push('Dear Appeals Committee:');
    sections.push('');

    // Opening paragraph (from template)
    sections.push(payerTemplate?.openingTemplate || DEFAULT_PAYER_TEMPLATES.DEFAULT!.openingTemplate!);
    sections.push('');

    // Clinical summary
    if (clinicalSummary) {
      sections.push('CLINICAL SUMMARY');
      sections.push('-'.repeat(40));
      sections.push(clinicalSummary);
      sections.push('');
    }

    // Arguments
    sections.push('STATEMENT OF FACTS AND ARGUMENTS');
    sections.push('-'.repeat(40));
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      sections.push(`${i + 1}. ${arg.text}`);
      if (arg.supporting) {
        sections.push(`   Supporting: ${arg.supporting}`);
      }
    }
    sections.push('');

    // Medical necessity (if applicable)
    if (medicalNecessity) {
      sections.push('MEDICAL NECESSITY');
      sections.push('-'.repeat(40));
      sections.push(medicalNecessity);
      sections.push('');
    }

    // Clinical rationale
    if (clinicalRationale) {
      sections.push('CLINICAL RATIONALE');
      sections.push('-'.repeat(40));
      sections.push(clinicalRationale);
      sections.push('');
    }

    // Citations
    if (citations.length > 0) {
      sections.push('SUPPORTING REFERENCES');
      sections.push('-'.repeat(40));
      for (const citation of citations) {
        sections.push(`• ${citation.source}: "${citation.text}"`);
        if (citation.reference) {
          sections.push(`  Reference: ${citation.reference}`);
        }
      }
      sections.push('');
    }

    // Closing paragraph (from template)
    sections.push('CONCLUSION');
    sections.push('-'.repeat(40));
    sections.push(payerTemplate?.closingTemplate || DEFAULT_PAYER_TEMPLATES.DEFAULT!.closingTemplate!);
    sections.push('');

    // Request
    sections.push('We respectfully request that you reconsider this denial and process the claim for payment. Please contact our office if additional information is required.');
    sections.push('');

    // Signature block
    sections.push('Respectfully submitted,');
    sections.push('');
    if (claim.encounter?.provider?.user) {
      sections.push(`${claim.encounter.provider.user.firstName || ''} ${claim.encounter.provider.user.lastName || ''}`);
      if (claim.encounter.provider.npi) {
        sections.push(`NPI: ${claim.encounter.provider.npi}`);
      }
    } else {
      sections.push('[Provider Name]');
    }
    sections.push('[Practice Name]');
    sections.push('[Phone Number]');
    sections.push('[Fax Number]');
    sections.push('');

    // Attachments note
    sections.push('Enclosures:');
    sections.push('- Copy of original claim');
    sections.push('- Copy of denial letter');
    sections.push('- Supporting clinical documentation');
    sections.push('- Any additional documentation as referenced');

    return sections.join('\n');
  }

  /**
   * Create AIAppeal record in database
   */
  private async createAppealRecord(data: {
    claimId: string;
    subject: string;
    body: string;
    appealType: AppealType;
    denialCode?: string;
    denialReason?: string;
    denialAmount?: number;
    arguments: AppealArgument[];
    citations: AppealCitation[];
    medicalNecessity?: string;
    clinicalSummary?: string;
    attachments: AppealAttachment[];
    appealDeadline?: Date;
    payerTemplate?: string;
    processingTimeMs: number;
  }): Promise<{ id: string }> {
    return this.prisma.aIAppeal.create({
      data: {
        claimId: data.claimId,
        organizationId: this.organizationId,
        status: 'DRAFT',
        appealType: data.appealType,
        subject: data.subject,
        body: data.body,
        denialCode: data.denialCode,
        denialReason: data.denialReason,
        denialAmount: data.denialAmount,
        arguments: data.arguments as unknown as object,
        citations: data.citations as unknown as object,
        medicalNecessity: data.medicalNecessity,
        clinicalSummary: data.clinicalSummary,
        attachments: data.attachments as unknown as object,
        appealDeadline: data.appealDeadline,
        templateVersion: data.payerTemplate,
        generatedByAI: true,
        processingTimeMs: data.processingTimeMs,
      },
      select: { id: true },
    });
  }

  /**
   * Create AI billing task record
   */
  private async createTaskRecord(
    claimId: string,
    appealId: string,
    appealType: AppealType,
    successLikelihood: number
  ): Promise<void> {
    const task = await this.prisma.aIBillingTask.create({
      data: {
        taskType: 'APPEAL',
        status: 'COMPLETED',
        claimId,
        organizationId: this.organizationId,
        result: {
          appealId,
          appealType,
          successLikelihood,
        },
        resultSummary: `Generated ${appealType} appeal letter. Success likelihood: ${(successLikelihood * 100).toFixed(0)}%`,
        completedAt: new Date(),
        attempts: 1,
      },
    });

    // Create decision record
    await this.prisma.aIBillingDecision.create({
      data: {
        taskId: task.id,
        decision: 'GENERATE_APPEAL',
        reasoning: `Generated ${appealType} appeal based on denial analysis. Estimated success rate: ${(successLikelihood * 100).toFixed(0)}%`,
        confidence: successLikelihood,
        organizationId: this.organizationId,
      },
    });
  }

  /**
   * Get appeal success metrics for reporting
   */
  async getAppealSuccessMetrics(filters?: {
    payerId?: string;
    denialCode?: string;
    appealType?: AppealType;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<AppealSuccessMetrics> {
    const where: Record<string, unknown> = {
      organizationId: this.organizationId,
    };

    if (filters?.payerId) {
      where.claim = { payerId: filters.payerId };
    }
    if (filters?.denialCode) {
      where.denialCode = filters.denialCode;
    }
    if (filters?.appealType) {
      where.appealType = filters.appealType;
    }
    if (filters?.dateFrom) {
      where.createdAt = { ...(where.createdAt as object || {}), gte: filters.dateFrom };
    }
    if (filters?.dateTo) {
      where.createdAt = { ...(where.createdAt as object || {}), lte: filters.dateTo };
    }

    const appeals = await this.prisma.aIAppeal.findMany({
      where,
      select: {
        status: true,
        recoveredAmount: true,
        responseDate: true,
        submittedAt: true,
        successFactors: true,
      },
    });

    const totalAppeals = appeals.length;
    const successfulAppeals = appeals.filter(a => a.status === 'APPROVED' || a.status === 'PARTIAL').length;
    const successRate = totalAppeals > 0 ? successfulAppeals / totalAppeals : 0;

    // Calculate average recovery
    const recoveries = appeals
      .filter(a => a.recoveredAmount)
      .map(a => a.recoveredAmount!.toNumber());
    const averageRecovery = recoveries.length > 0
      ? recoveries.reduce((sum, r) => sum + r, 0) / recoveries.length
      : 0;

    // Calculate average response time
    const responseTimes = appeals
      .filter(a => a.responseDate && a.submittedAt)
      .map(a => {
        const diff = a.responseDate!.getTime() - a.submittedAt!.getTime();
        return diff / (1000 * 60 * 60 * 24); // Convert to days
      });
    const averageResponseDays = responseTimes.length > 0
      ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
      : 0;

    // Extract top success factors
    const factorCounts = new Map<string, number>();
    for (const appeal of appeals.filter(a => a.status === 'APPROVED' || a.status === 'PARTIAL')) {
      const factors = appeal.successFactors as string[] | null;
      if (factors) {
        for (const factor of factors) {
          factorCounts.set(factor, (factorCounts.get(factor) || 0) + 1);
        }
      }
    }
    const topSuccessFactors = Array.from(factorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([factor]) => factor);

    return {
      payerId: filters?.payerId,
      denialCode: filters?.denialCode,
      appealType: filters?.appealType || 'FIRST_LEVEL',
      totalAppeals,
      successfulAppeals,
      successRate,
      averageRecovery,
      averageResponseDays,
      topSuccessFactors,
    };
  }

  /**
   * Submit an appeal (update status and record submission)
   */
  async submitAppeal(appealId: string, submissionDetails: {
    submissionMethod: 'mail' | 'fax' | 'portal' | 'electronic';
    confirmationNumber?: string;
    notes?: string;
  }): Promise<{ id: string; status: AIAppealStatus }> {
    const appeal = await this.prisma.aIAppeal.findFirst({
      where: {
        id: appealId,
        organizationId: this.organizationId,
      },
    });

    if (!appeal) {
      throw new Error(`Appeal not found: ${appealId}`);
    }

    return this.prisma.aIAppeal.update({
      where: { id: appealId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        submissionMethod: submissionDetails.submissionMethod,
        confirmationNumber: submissionDetails.confirmationNumber,
      },
      select: { id: true, status: true },
    });
  }

  /**
   * Record appeal outcome for learning
   */
  async recordAppealOutcome(appealId: string, outcome: {
    status: 'APPROVED' | 'DENIED' | 'PARTIAL';
    responseDetails?: string;
    recoveredAmount?: number;
    adjustmentCodes?: string[];
    successFactors?: string[];
  }): Promise<{ id: string; status: AIAppealStatus }> {
    const appeal = await this.prisma.aIAppeal.findFirst({
      where: {
        id: appealId,
        organizationId: this.organizationId,
      },
    });

    if (!appeal) {
      throw new Error(`Appeal not found: ${appealId}`);
    }

    return this.prisma.aIAppeal.update({
      where: { id: appealId },
      data: {
        status: outcome.status,
        responseDate: new Date(),
        responseDetails: outcome.responseDetails,
        recoveredAmount: outcome.recoveredAmount,
        adjustmentCodes: outcome.adjustmentCodes,
        successFactors: outcome.successFactors,
      },
      select: { id: true, status: true },
    });
  }

  /**
   * Get appeals pending submission (checking deadlines)
   */
  async getAppealsPendingSubmission(limit = 20): Promise<Array<{
    id: string;
    claimId: string;
    subject: string;
    appealDeadline: Date | null;
    daysUntilDeadline: number | null;
    status: AIAppealStatus;
  }>> {
    const appeals = await this.prisma.aIAppeal.findMany({
      where: {
        organizationId: this.organizationId,
        status: { in: ['DRAFT', 'READY'] },
      },
      select: {
        id: true,
        claimId: true,
        subject: true,
        appealDeadline: true,
        status: true,
      },
      orderBy: [
        { appealDeadline: 'asc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });

    return appeals.map(a => {
      let daysUntilDeadline: number | null = null;
      if (a.appealDeadline) {
        const diffMs = a.appealDeadline.getTime() - Date.now();
        daysUntilDeadline = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }
      return {
        ...a,
        daysUntilDeadline,
      };
    });
  }

  /**
   * Batch generate appeals for multiple claims
   */
  async batchGenerateAppeals(
    claimIds: string[],
    appealType: AppealType = 'FIRST_LEVEL'
  ): Promise<Map<string, AutomatedAppealOutput | { error: string }>> {
    const results = new Map<string, AutomatedAppealOutput | { error: string }>();

    for (const claimId of claimIds) {
      try {
        const appeal = await this.generateAppeal({
          claimId,
          appealType,
          includeAllDocumentation: true,
        });
        results.set(claimId, appeal);
      } catch (error) {
        console.error(`Failed to generate appeal for claim ${claimId}:`, error);
        results.set(claimId, { error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return results;
  }
}

export const createAutomatedAppealGenerator = (prisma: PrismaClient, organizationId: string) =>
  new AutomatedAppealGenerator(prisma, organizationId);
