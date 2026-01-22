/**
 * Epic 09: AI Billing Agent - Appeal Letter Generator
 *
 * Generates professional appeal letters for denied claims using
 * templates and AI-enhanced content generation.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  AppealGenerationInput,
  AppealGenerationOutput,
  AppealArgument,
  AppealCitation,
} from './types';
import { COMMON_CARC_CODES, COMMON_RARC_CODES } from './types';

// Appeal letter templates by denial reason category
const APPEAL_TEMPLATES = {
  MEDICAL_NECESSITY: {
    name: 'Medical Necessity Appeal',
    subject: 'Appeal for Claim Denied for Medical Necessity - [CLAIM_NUMBER]',
    opening: `We are writing to formally appeal the denial of the above-referenced claim, which was denied on the basis of medical necessity. We believe this determination was made in error and respectfully request reconsideration.`,
    closing: `Based on the clinical evidence presented above, we respectfully request that you reconsider this denial and process this claim for payment. The services rendered were medically necessary and appropriate for the patient's condition.`,
  },
  TIMELY_FILING: {
    name: 'Timely Filing Appeal',
    subject: 'Appeal for Claim Denied for Timely Filing - [CLAIM_NUMBER]',
    opening: `We are writing to formally appeal the denial of the above-referenced claim on the basis of timely filing. We have evidence that the claim was submitted within the contractual filing timeframe and request immediate reconsideration.`,
    closing: `The enclosed documentation demonstrates that our original claim was submitted timely. We respectfully request that you overturn this denial and process this claim for payment.`,
  },
  AUTHORIZATION: {
    name: 'Prior Authorization Appeal',
    subject: 'Appeal for Claim Denied for Authorization - [CLAIM_NUMBER]',
    opening: `We are writing to formally appeal the denial of the above-referenced claim due to alleged lack of prior authorization. We have documentation supporting that proper authorization was obtained or was not required for these services.`,
    closing: `Based on the authorization documentation provided, we request that you reconsider this denial and process the claim for payment.`,
  },
  CODING: {
    name: 'Coding/Billing Error Appeal',
    subject: 'Appeal for Claim Denied for Coding Error - [CLAIM_NUMBER]',
    opening: `We are writing to formally appeal the denial of the above-referenced claim related to coding. We believe the services were coded appropriately and in accordance with current coding guidelines.`,
    closing: `The supporting documentation confirms that our coding is accurate and compliant with industry standards. We respectfully request reconsideration of this denial.`,
  },
  BUNDLING: {
    name: 'Unbundling/Bundling Appeal',
    subject: 'Appeal for Claim Denied for Bundling - [CLAIM_NUMBER]',
    opening: `We are writing to formally appeal the denial of the above-referenced claim which was denied due to bundling. We believe the services rendered were separate and distinct procedures that warrant individual reimbursement.`,
    closing: `The clinical documentation clearly demonstrates that each service was medically necessary and performed as a distinct procedure. We request that you reconsider this denial.`,
  },
  DUPLICATE: {
    name: 'Duplicate Claim Appeal',
    subject: 'Appeal for Claim Denied as Duplicate - [CLAIM_NUMBER]',
    opening: `We are writing to formally appeal the denial of the above-referenced claim which was incorrectly identified as a duplicate. Our records indicate this is a unique claim for services rendered.`,
    closing: `The documentation provided confirms that this claim is not a duplicate and represents distinct services. We request immediate reconsideration and payment.`,
  },
  ELIGIBILITY: {
    name: 'Eligibility Appeal',
    subject: 'Appeal for Claim Denied for Eligibility - [CLAIM_NUMBER]',
    opening: `We are writing to formally appeal the denial of the above-referenced claim based on patient eligibility. We have documentation confirming the patient was eligible for coverage at the time services were rendered.`,
    closing: `The enclosed eligibility documentation confirms coverage was in effect. We request that you reconsider this denial and process the claim.`,
  },
  GENERAL: {
    name: 'General Appeal',
    subject: 'Appeal for Denied Claim - [CLAIM_NUMBER]',
    opening: `We are writing to formally appeal the denial of the above-referenced claim. After careful review of the denial reason, we believe this determination was made in error and request reconsideration.`,
    closing: `Based on the information provided, we respectfully request that you reconsider this denial and process this claim for payment.`,
  },
};

// Medical necessity citations for chiropractic
const CHIROPRACTIC_CITATIONS: AppealCitation[] = [
  {
    type: 'GUIDELINE',
    source: 'American Chiropractic Association',
    text: 'Spinal manipulation is recommended as a first-line treatment for acute, subacute, and chronic low back pain.',
    reference: 'ACA Clinical Practice Guidelines, 2023',
  },
  {
    type: 'MEDICAL',
    source: 'Journal of Manipulative and Physiological Therapeutics',
    text: 'Chiropractic care has been shown to be effective for the treatment of musculoskeletal conditions.',
    reference: 'JMPT Evidence-Based Guidelines',
  },
  {
    type: 'GUIDELINE',
    source: 'American College of Physicians',
    text: 'Non-pharmacologic treatments, including spinal manipulation, are recommended as first-line therapy for chronic low back pain.',
    reference: 'ACP Clinical Practice Guideline, Annals of Internal Medicine, 2017',
  },
  {
    type: 'POLICY',
    source: 'Centers for Medicare & Medicaid Services',
    text: 'Medicare covers manual manipulation of the spine to correct a subluxation when provided by a chiropractor.',
    reference: 'Medicare Benefit Policy Manual, Chapter 15, Section 30.5',
  },
];

// Denial code to category mapping
const DENIAL_CODE_CATEGORIES: Record<string, string> = {
  '1': 'MEDICAL_NECESSITY',
  '2': 'MEDICAL_NECESSITY',
  '3': 'MEDICAL_NECESSITY',
  '4': 'CODING',
  '5': 'CODING',
  '6': 'CODING',
  '16': 'GENERAL',
  '18': 'DUPLICATE',
  '22': 'ELIGIBILITY',
  '26': 'ELIGIBILITY',
  '27': 'ELIGIBILITY',
  '29': 'TIMELY_FILING',
  '31': 'ELIGIBILITY',
  '45': 'MEDICAL_NECESSITY',
  '50': 'MEDICAL_NECESSITY',
  '96': 'MEDICAL_NECESSITY',
  '97': 'BUNDLING',
  '109': 'ELIGIBILITY',
  '167': 'CODING',
  '197': 'AUTHORIZATION',
  '204': 'ELIGIBILITY',
};

export class AppealGenerator {
  private prisma: PrismaClient;
  private organizationId: string;

  constructor(prisma: PrismaClient, organizationId: string) {
    this.prisma = prisma;
    this.organizationId = organizationId;
  }

  /**
   * Generate an appeal letter for a denial
   */
  async generateAppeal(input: AppealGenerationInput): Promise<AppealGenerationOutput> {
    const startTime = Date.now();

    // Fetch denial with related data
    const denial = await this.prisma.denial.findUnique({
      where: { id: input.denialId },
      include: {
        claim: {
          include: {
            patient: {
              include: {
                demographics: true,
              },
            },
            insurancePolicy: true,
            payer: true,
            encounter: {
              include: {
                provider: true,
                soapNote: true,
                diagnoses: true,
                charges: true,
              },
            },
          },
        },
      },
    });

    if (!denial) {
      throw new Error(`Denial not found: ${input.denialId}`);
    }

    const claim = denial.claim;

    // Determine appeal category from denial code
    const category = this.categorizedenial(denial.denialCode || '');
    const template = APPEAL_TEMPLATES[category as keyof typeof APPEAL_TEMPLATES] || APPEAL_TEMPLATES.GENERAL;

    // Build appeal arguments
    const appealArguments = await this.buildArguments(denial, claim, category);

    // Select relevant citations
    const citations = this.selectCitations(category, claim);

    // Build clinical summary if available
    const clinicalSummary = input.includeClinicSupport
      ? this.buildClinicalSummary(claim)
      : undefined;

    // Build medical necessity statement
    const medicalNecessity = category === 'MEDICAL_NECESSITY'
      ? this.buildMedicalNecessityStatement(claim)
      : undefined;

    // Get recommended supporting documents
    const recommendedDocs = this.getRecommendedDocuments(category);

    // Build the appeal letter
    const subject = template.subject.replace('[CLAIM_NUMBER]', claim.claimNumber || claim.id);
    const body = this.buildLetterBody({
      template,
      denial,
      claim,
      arguments: appealArguments,
      citations,
      clinicalSummary,
      medicalNecessity,
      appealType: input.appealType || 'FIRST_LEVEL',
    });

    return {
      subject,
      body,
      appealType: input.appealType || 'FIRST_LEVEL',
      denialCode: denial.denialCode || undefined,
      denialReason: denial.denialReason || undefined,
      arguments: appealArguments,
      citations,
      clinicalSummary,
      medicalNecessity,
      recommendedDocs,
      templateName: template.name,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Categorize denial based on denial code
   */
  private categorizedenial(denialCode: string): string {
    return DENIAL_CODE_CATEGORIES[denialCode] || 'GENERAL';
  }

  /**
   * Build appeal arguments based on denial category
   */
  private async buildArguments(
    denial: any,
    claim: any,
    category: string
  ): Promise<AppealArgument[]> {
    const args: AppealArgument[] = [];

    // Common arguments
    args.push({
      type: 'CLAIM_FACTS',
      text: `Claim ${claim.claimNumber || claim.id} was submitted for services rendered on ${this.formatDate(claim.encounter?.encounterDate)} for patient ${claim.patient?.demographics?.firstName} ${claim.patient?.demographics?.lastName}.`,
    });

    args.push({
      type: 'DENIAL_DISPUTE',
      text: `The claim was denied with code ${denial.denialCode || 'N/A'}: "${denial.denialReason || COMMON_CARC_CODES[denial.denialCode || ''] || 'Reason not specified'}". We respectfully dispute this determination.`,
    });

    // Category-specific arguments
    switch (category) {
      case 'MEDICAL_NECESSITY':
        args.push({
          type: 'MEDICAL_NECESSITY',
          text: 'The services provided were medically necessary based on the patient\'s presenting condition and symptoms.',
          supporting: this.buildDiagnosisSummary(claim.encounter?.diagnoses),
        });

        if (claim.encounter?.diagnoses?.some((d: any) => d.code?.startsWith('M99'))) {
          args.push({
            type: 'SUBLUXATION',
            text: 'The patient presented with documented vertebral subluxation requiring chiropractic intervention.',
          });
        }
        break;

      case 'TIMELY_FILING':
        args.push({
          type: 'TIMELY_FILING',
          text: `The original claim was submitted within the required timeframe. Service date: ${this.formatDate(claim.encounter?.encounterDate)}, Submission date: ${this.formatDate(claim.createdAt)}.`,
        });
        break;

      case 'BUNDLING':
        args.push({
          type: 'UNBUNDLING',
          text: 'Each procedure was performed as a separate and distinct service with separate medical necessity documentation.',
          supporting: this.buildServicesSummary(claim.encounter?.charges),
        });
        break;

      case 'DUPLICATE':
        args.push({
          type: 'NOT_DUPLICATE',
          text: 'This claim represents unique services and is not a duplicate of any previously submitted claim.',
        });
        break;

      case 'AUTHORIZATION':
        args.push({
          type: 'AUTHORIZATION',
          text: 'Authorization was either properly obtained prior to services or was not required per the plan benefits.',
        });
        break;

      case 'ELIGIBILITY':
        args.push({
          type: 'ELIGIBILITY',
          text: `Patient ${claim.patient?.demographics?.firstName} ${claim.patient?.demographics?.lastName} was an eligible member at the time of service with Member ID: ${claim.insurancePolicy?.policyNumber || 'N/A'}.`,
        });
        break;
    }

    // Provider credentials
    if (claim.encounter?.provider) {
      args.push({
        type: 'PROVIDER_CREDENTIALS',
        text: `Services were rendered by ${claim.encounter.provider.firstName} ${claim.encounter.provider.lastName}, a licensed healthcare provider (NPI: ${claim.encounter.provider.npi || 'N/A'}).`,
      });
    }

    return args;
  }

  /**
   * Select relevant citations for the appeal
   */
  private selectCitations(category: string, claim: any): AppealCitation[] {
    const citations: AppealCitation[] = [];

    // Add chiropractic citations for relevant categories
    if (['MEDICAL_NECESSITY', 'GENERAL'].includes(category)) {
      // Check if claim has chiropractic codes
      const hasChiroCodes = claim.encounter?.charges?.some((c: any) =>
        ['98940', '98941', '98942', '98943'].includes(c.procedure?.cptCode || c.cptCode)
      );

      if (hasChiroCodes) {
        citations.push(...CHIROPRACTIC_CITATIONS.slice(0, 3));
      }
    }

    // Add CMS citation for Medicare claims
    if (claim.insurancePolicy?.payer?.name?.toLowerCase().includes('medicare')) {
      const cmsCitation = CHIROPRACTIC_CITATIONS.find(c => c.source.includes('CMS'));
      if (cmsCitation) {
        citations.push(cmsCitation);
      }
    }

    return citations;
  }

  /**
   * Build clinical summary from encounter/SOAP notes
   */
  private buildClinicalSummary(claim: any): string | undefined {
    const soapNote = claim.encounter?.soapNotes?.[0];
    if (!soapNote) return undefined;

    const parts: string[] = [];

    if (soapNote.subjective) {
      parts.push(`Chief Complaint: ${this.truncate(soapNote.subjective, 200)}`);
    }

    if (soapNote.objective) {
      parts.push(`Objective Findings: ${this.truncate(soapNote.objective, 200)}`);
    }

    if (soapNote.assessment) {
      parts.push(`Assessment: ${this.truncate(soapNote.assessment, 200)}`);
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  /**
   * Build medical necessity statement
   */
  private buildMedicalNecessityStatement(claim: any): string {
    const diagnoses = claim.encounter?.diagnoses || [];
    const procedures = claim.encounter?.charges || [];

    const diagnosisCodes = diagnoses.map((d: any) => d.code).join(', ');
    const procedureCodes = procedures.map((p: any) => p.procedure?.cptCode || p.cptCode).join(', ');

    return `The patient presented with documented conditions (${diagnosisCodes || 'see attached documentation'}) requiring the services rendered (${procedureCodes || 'see attached'}). These services were necessary to diagnose and/or treat the patient's condition, were appropriate for the symptoms and consistent with the diagnosis, and were performed in accordance with accepted standards of medical practice.`;
  }

  /**
   * Get recommended supporting documents
   */
  private getRecommendedDocuments(category: string): string[] {
    const common = [
      'Copy of original claim',
      'Patient demographic information',
      'Insurance ID card (front and back)',
    ];

    switch (category) {
      case 'MEDICAL_NECESSITY':
        return [
          ...common,
          'SOAP notes for date(s) of service',
          'X-ray reports (if applicable)',
          'Treatment plan',
          'Progress notes demonstrating patient improvement',
          'Peer-reviewed literature supporting treatment',
        ];

      case 'TIMELY_FILING':
        return [
          ...common,
          'Proof of original submission (confirmation number/date)',
          'Electronic submission receipt',
          'Clearinghouse transmission report',
        ];

      case 'AUTHORIZATION':
        return [
          ...common,
          'Authorization approval letter/number',
          'Phone authorization log',
          'Online portal screenshot showing authorization',
        ];

      case 'BUNDLING':
        return [
          ...common,
          'Operative/procedure notes',
          'Documentation showing separate medical necessity for each procedure',
          'CCI edits documentation',
        ];

      case 'ELIGIBILITY':
        return [
          ...common,
          'Eligibility verification printout from date of service',
          'Coordination of benefits information',
        ];

      default:
        return [
          ...common,
          'All relevant medical records',
          'Supporting documentation',
        ];
    }
  }

  /**
   * Build the complete letter body
   */
  private buildLetterBody(params: {
    template: typeof APPEAL_TEMPLATES.GENERAL;
    denial: any;
    claim: any;
    arguments: AppealArgument[];
    citations: AppealCitation[];
    clinicalSummary?: string;
    medicalNecessity?: string;
    appealType: string;
  }): string {
    const { template, denial, claim, arguments: args, citations, clinicalSummary, medicalNecessity, appealType } = params;

    const sections: string[] = [];

    // Header information
    sections.push(`Date: ${this.formatDate(new Date())}`);
    sections.push('');
    sections.push(`To: ${claim.insurancePolicy?.payer?.name || 'Insurance Payer'}`);
    sections.push(`Appeals Department`);
    sections.push('');
    sections.push(`RE: ${appealType === 'SECOND_LEVEL' ? 'Second Level ' : appealType === 'EXTERNAL' ? 'External Review ' : ''}Appeal for Denied Claim`);
    sections.push(`Claim Number: ${claim.claimNumber || claim.id}`);
    sections.push(`Patient Name: ${claim.patient?.demographics?.firstName} ${claim.patient?.demographics?.lastName}`);
    sections.push(`Member ID: ${claim.insurancePolicy?.policyNumber || 'N/A'}`);
    sections.push(`Date of Service: ${this.formatDate(claim.encounter?.encounterDate)}`);
    sections.push(`Denial Code: ${denial.denialCode || 'N/A'}`);
    sections.push('');
    sections.push('---');
    sections.push('');

    // Opening
    sections.push('Dear Appeals Committee:');
    sections.push('');
    sections.push(template.opening);
    sections.push('');

    // Arguments
    sections.push('STATEMENT OF FACTS:');
    sections.push('');
    for (const arg of args) {
      sections.push(`- ${arg.text}`);
      if (arg.supporting) {
        sections.push(`  ${arg.supporting}`);
      }
    }
    sections.push('');

    // Clinical summary if available
    if (clinicalSummary) {
      sections.push('CLINICAL DOCUMENTATION SUMMARY:');
      sections.push('');
      sections.push(clinicalSummary);
      sections.push('');
    }

    // Medical necessity statement if applicable
    if (medicalNecessity) {
      sections.push('MEDICAL NECESSITY:');
      sections.push('');
      sections.push(medicalNecessity);
      sections.push('');
    }

    // Citations if available
    if (citations.length > 0) {
      sections.push('SUPPORTING REFERENCES:');
      sections.push('');
      for (const citation of citations) {
        sections.push(`- ${citation.source}: "${citation.text}" (${citation.reference})`);
      }
      sections.push('');
    }

    // Closing
    sections.push('CONCLUSION:');
    sections.push('');
    sections.push(template.closing);
    sections.push('');

    // Signature block
    sections.push('Please contact our office if you require any additional information.');
    sections.push('');
    sections.push('Respectfully submitted,');
    sections.push('');
    sections.push('[Provider Name/Billing Department]');
    sections.push('[Practice Name]');
    sections.push('[Phone Number]');
    sections.push('[Fax Number]');

    return sections.join('\n');
  }

  /**
   * Build diagnosis summary
   */
  private buildDiagnosisSummary(diagnoses: any[]): string {
    if (!diagnoses || diagnoses.length === 0) {
      return 'See attached documentation for diagnosis information.';
    }

    return diagnoses.map(d => `${d.code}: ${d.description || 'Diagnosis'}`).join('; ');
  }

  /**
   * Build services summary
   */
  private buildServicesSummary(charges: any[]): string {
    if (!charges || charges.length === 0) {
      return 'See attached documentation for services rendered.';
    }

    return charges.map(c => {
      const code = c.procedure?.cptCode || c.cptCode;
      const desc = c.procedure?.description || c.description || 'Service';
      return `${code}: ${desc}`;
    }).join('; ');
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date | string | null | undefined): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Truncate text to max length
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get successful appeal rate for similar denials (for analytics)
   */
  async getAppealSuccessRate(denialCode: string): Promise<number | undefined> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const totalAppeals = await this.prisma.appealLetter.count({
      where: {
        organizationId: this.organizationId,
        denial: {
          denialCode,
        },
        createdAt: { gte: sixMonthsAgo },
      },
    });

    if (totalAppeals < 5) return undefined;

    // Note: 'RESPONDED' indicates payer responded - actual success rate would need
    // to be tracked separately based on denial resolution outcome
    const successfulAppeals = await this.prisma.appealLetter.count({
      where: {
        organizationId: this.organizationId,
        denial: {
          denialCode,
        },
        status: 'RESPONDED',
        createdAt: { gte: sixMonthsAgo },
      },
    });

    return Math.round((successfulAppeals / totalAppeals) * 100);
  }

  /**
   * Batch generate appeals for multiple denials
   */
  async batchGenerateAppeals(
    denialIds: string[],
    appealType: 'FIRST_LEVEL' | 'SECOND_LEVEL' | 'EXTERNAL' = 'FIRST_LEVEL'
  ): Promise<Map<string, AppealGenerationOutput>> {
    const results = new Map<string, AppealGenerationOutput>();

    for (const denialId of denialIds) {
      try {
        const appeal = await this.generateAppeal({
          denialId,
          appealType,
          includeClinicSupport: true,
        });
        results.set(denialId, appeal);
      } catch (error) {
        console.error(`Failed to generate appeal for denial ${denialId}:`, error);
      }
    }

    return results;
  }
}
