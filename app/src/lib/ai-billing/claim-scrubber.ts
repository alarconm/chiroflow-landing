/**
 * Epic 09: AI Billing Agent - Claim Scrubber
 *
 * Pre-submission claim validation to detect errors before sending to payers.
 * Validates claims against payer rules, CMS guidelines, and best practices.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  ClaimData,
  ClaimScrubInput,
  ClaimScrubOutput,
  ClaimScrubIssueInput,
  ScrubRule,
  ScrubRuleResult,
} from './types';

// ============================================
// Scrub Rules Definition
// ============================================

const scrubRules: ScrubRule[] = [
  // Patient Information Rules
  {
    code: 'PAT_001',
    category: 'Patient',
    severity: 'ERROR',
    description: 'Patient first name is required',
    validate: (claim) => ({
      passed: !!claim.patient?.firstName?.trim(),
      message: 'Patient first name is missing',
      suggestion: 'Add patient first name to the claim',
      field: 'patient.firstName',
    }),
  },
  {
    code: 'PAT_002',
    category: 'Patient',
    severity: 'ERROR',
    description: 'Patient last name is required',
    validate: (claim) => ({
      passed: !!claim.patient?.lastName?.trim(),
      message: 'Patient last name is missing',
      suggestion: 'Add patient last name to the claim',
      field: 'patient.lastName',
    }),
  },
  {
    code: 'PAT_003',
    category: 'Patient',
    severity: 'ERROR',
    description: 'Patient date of birth is required',
    validate: (claim) => ({
      passed: !!claim.patient?.dateOfBirth,
      message: 'Patient date of birth is missing',
      suggestion: 'Add patient date of birth to the claim',
      field: 'patient.dateOfBirth',
    }),
  },
  {
    code: 'PAT_004',
    category: 'Patient',
    severity: 'WARNING',
    description: 'Patient address should be complete',
    validate: (claim) => {
      const addr = claim.patient?.address;
      const hasAddress = addr && addr.line1 && addr.city && addr.state && addr.zip;
      return {
        passed: !!hasAddress,
        message: 'Patient address is incomplete',
        suggestion: 'Verify patient address includes street, city, state, and ZIP',
        field: 'patient.address',
      };
    },
  },
  {
    code: 'PAT_005',
    category: 'Patient',
    severity: 'WARNING',
    description: 'Patient gender should be specified',
    validate: (claim) => ({
      passed: !!claim.patient?.gender && claim.patient.gender !== 'UNKNOWN',
      message: 'Patient gender is not specified',
      suggestion: 'Select patient gender for accurate claim processing',
      field: 'patient.gender',
    }),
  },

  // Insurance Information Rules
  {
    code: 'INS_001',
    category: 'Insurance',
    severity: 'ERROR',
    description: 'Insurance payer ID is required for electronic claims',
    validate: (claim) => ({
      passed: !!claim.insurance?.payerId?.trim(),
      message: 'Insurance payer ID is missing',
      suggestion: 'Add the payer ID from the insurance card or payer list',
      field: 'insurance.payerId',
    }),
  },
  {
    code: 'INS_002',
    category: 'Insurance',
    severity: 'ERROR',
    description: 'Subscriber ID is required',
    validate: (claim) => ({
      passed: !!claim.insurance?.subscriberId?.trim(),
      message: 'Subscriber/member ID is missing',
      suggestion: 'Add the subscriber ID from the insurance card',
      field: 'insurance.subscriberId',
    }),
  },
  {
    code: 'INS_003',
    category: 'Insurance',
    severity: 'WARNING',
    description: 'Group number recommended for employer-sponsored plans',
    validate: (claim) => ({
      passed: !!claim.insurance?.groupNumber?.trim(),
      message: 'Insurance group number is missing',
      suggestion: 'Add group number if available on insurance card',
      field: 'insurance.groupNumber',
    }),
  },

  // Provider Information Rules
  {
    code: 'PRV_001',
    category: 'Provider',
    severity: 'ERROR',
    description: 'Billing NPI is required',
    validate: (claim) => ({
      passed: !!claim.billingNpi?.trim() && claim.billingNpi.length === 10,
      message: 'Billing NPI is missing or invalid',
      suggestion: 'Add the 10-digit billing NPI',
      field: 'billingNpi',
    }),
  },
  {
    code: 'PRV_002',
    category: 'Provider',
    severity: 'WARNING',
    description: 'Rendering NPI should be specified',
    validate: (claim) => ({
      passed: !!claim.renderingNpi?.trim() && claim.renderingNpi.length === 10,
      message: 'Rendering NPI is missing or invalid',
      suggestion: 'Add the 10-digit rendering provider NPI',
      field: 'renderingNpi',
    }),
  },
  {
    code: 'PRV_003',
    category: 'Provider',
    severity: 'INFO',
    description: 'NPI should pass Luhn check',
    validate: (claim) => {
      const npi = claim.billingNpi;
      if (!npi || npi.length !== 10) return { passed: false, message: 'Invalid NPI format' };
      // Luhn algorithm check for NPI validation
      const luhnCheck = (num: string): boolean => {
        const arr = ('80840' + num).split('').reverse().map(Number);
        const sum = arr.reduce((acc, digit, idx) => {
          if (idx % 2 === 1) {
            digit *= 2;
            if (digit > 9) digit -= 9;
          }
          return acc + digit;
        }, 0);
        return sum % 10 === 0;
      };
      return {
        passed: luhnCheck(npi),
        message: 'Billing NPI fails validation check',
        suggestion: 'Verify the NPI is correct',
        field: 'billingNpi',
      };
    },
  },

  // Diagnosis Rules
  {
    code: 'DX_001',
    category: 'Diagnosis',
    severity: 'ERROR',
    description: 'At least one diagnosis is required',
    validate: (claim) => ({
      passed: claim.diagnoses?.length > 0,
      message: 'No diagnosis codes on claim',
      suggestion: 'Add at least one ICD-10 diagnosis code',
      field: 'diagnoses',
    }),
  },
  {
    code: 'DX_002',
    category: 'Diagnosis',
    severity: 'ERROR',
    description: 'Primary diagnosis must be designated',
    validate: (claim) => ({
      passed: claim.diagnoses?.some(d => d.isPrimary),
      message: 'No primary diagnosis designated',
      suggestion: 'Mark one diagnosis as primary',
      field: 'diagnoses',
    }),
  },
  {
    code: 'DX_003',
    category: 'Diagnosis',
    severity: 'WARNING',
    description: 'Diagnosis codes should be in ICD-10 format',
    validate: (claim) => {
      const icd10Pattern = /^[A-TV-Z][0-9][0-9AB]\.?[0-9A-TV-Z]{0,4}$/;
      const invalidCodes = claim.diagnoses?.filter(d => !icd10Pattern.test(d.code));
      return {
        passed: !invalidCodes?.length,
        message: `Invalid ICD-10 format: ${invalidCodes?.map(d => d.code).join(', ')}`,
        suggestion: 'Verify diagnosis codes are valid ICD-10 format',
        field: 'diagnoses',
      };
    },
  },
  {
    code: 'DX_004',
    category: 'Diagnosis',
    severity: 'WARNING',
    description: 'Maximum 12 diagnosis codes per claim',
    validate: (claim) => ({
      passed: (claim.diagnoses?.length || 0) <= 12,
      message: `Claim has ${claim.diagnoses?.length} diagnoses, maximum is 12`,
      suggestion: 'Remove less relevant diagnoses to meet 12-code limit',
      field: 'diagnoses',
    }),
  },

  // Procedure/Service Rules
  {
    code: 'SVC_001',
    category: 'Service',
    severity: 'ERROR',
    description: 'At least one service line is required',
    validate: (claim) => ({
      passed: claim.lines?.length > 0,
      message: 'No service lines on claim',
      suggestion: 'Add at least one procedure/service',
      field: 'lines',
    }),
  },
  {
    code: 'SVC_002',
    category: 'Service',
    severity: 'ERROR',
    description: 'CPT codes are required for all service lines',
    validate: (claim) => {
      const missingCpt = claim.lines?.filter(l => !l.cptCode?.trim());
      return {
        passed: !missingCpt?.length,
        message: `Service line(s) missing CPT code: ${missingCpt?.map(l => l.lineNumber).join(', ')}`,
        suggestion: 'Add CPT code to all service lines',
        field: 'lines.cptCode',
      };
    },
  },
  {
    code: 'SVC_003',
    category: 'Service',
    severity: 'ERROR',
    description: 'Service dates are required',
    validate: (claim) => {
      const missingDates = claim.lines?.filter(l => !l.serviceDateFrom);
      return {
        passed: !missingDates?.length,
        message: `Service line(s) missing date: ${missingDates?.map(l => l.lineNumber).join(', ')}`,
        suggestion: 'Add service date to all lines',
        field: 'lines.serviceDateFrom',
      };
    },
  },
  {
    code: 'SVC_004',
    category: 'Service',
    severity: 'ERROR',
    description: 'Charge amounts must be positive',
    validate: (claim) => {
      const zeroCharges = claim.lines?.filter(l => !l.chargeAmount || l.chargeAmount <= 0);
      return {
        passed: !zeroCharges?.length,
        message: `Service line(s) with zero/negative charges: ${zeroCharges?.map(l => l.lineNumber).join(', ')}`,
        suggestion: 'Enter valid charge amounts for all services',
        field: 'lines.chargeAmount',
      };
    },
  },
  {
    code: 'SVC_005',
    category: 'Service',
    severity: 'ERROR',
    description: 'Each service line must have at least one diagnosis pointer',
    validate: (claim) => {
      const noDxPointer = claim.lines?.filter(l => !l.diagnosisPointers?.length);
      return {
        passed: !noDxPointer?.length,
        message: `Service line(s) missing diagnosis pointer: ${noDxPointer?.map(l => l.lineNumber).join(', ')}`,
        suggestion: 'Link each service to at least one diagnosis',
        field: 'lines.diagnosisPointers',
      };
    },
  },
  {
    code: 'SVC_006',
    category: 'Service',
    severity: 'WARNING',
    description: 'Diagnosis pointers must reference valid diagnoses',
    validate: (claim) => {
      const maxDx = claim.diagnoses?.length || 0;
      const invalidPointers = claim.lines?.filter(l =>
        l.diagnosisPointers?.some(p => p < 1 || p > maxDx)
      );
      return {
        passed: !invalidPointers?.length,
        message: `Invalid diagnosis pointers on line(s): ${invalidPointers?.map(l => l.lineNumber).join(', ')}`,
        suggestion: 'Ensure diagnosis pointers reference valid diagnoses (1 to number of diagnoses)',
        field: 'lines.diagnosisPointers',
      };
    },
  },
  {
    code: 'SVC_007',
    category: 'Service',
    severity: 'WARNING',
    description: 'Units should be reasonable',
    validate: (claim) => {
      const highUnits = claim.lines?.filter(l => l.units > 99);
      return {
        passed: !highUnits?.length,
        message: `Unusually high units on line(s): ${highUnits?.map(l => `${l.lineNumber} (${l.units} units)`).join(', ')}`,
        suggestion: 'Verify unit counts are correct',
        field: 'lines.units',
      };
    },
  },
  {
    code: 'SVC_008',
    category: 'Service',
    severity: 'INFO',
    description: 'Place of service should be specified',
    validate: (claim) => {
      const noPos = claim.lines?.filter(l => !l.placeOfService);
      return {
        passed: !noPos?.length,
        message: `Place of service not specified for line(s): ${noPos?.map(l => l.lineNumber).join(', ')}`,
        suggestion: 'Specify place of service (e.g., 11 for office)',
        field: 'lines.placeOfService',
      };
    },
  },

  // Chiropractic-Specific Rules
  {
    code: 'CHI_001',
    category: 'Chiropractic',
    severity: 'WARNING',
    description: 'CMT codes typically require modifier AT',
    validate: (claim) => {
      const cmtCodes = ['98940', '98941', '98942', '98943'];
      const cmtLines = claim.lines?.filter(l => cmtCodes.includes(l.cptCode));
      const missingAT = cmtLines?.filter(l => !l.modifiers?.includes('AT'));
      return {
        passed: !missingAT?.length,
        message: `CMT code(s) may require AT modifier: line(s) ${missingAT?.map(l => l.lineNumber).join(', ')}`,
        suggestion: 'Add modifier AT for active treatment on CMT codes',
        field: 'lines.modifiers',
      };
    },
  },
  {
    code: 'CHI_002',
    category: 'Chiropractic',
    severity: 'WARNING',
    description: 'CMT codes require spinal subluxation diagnosis',
    validate: (claim) => {
      const cmtCodes = ['98940', '98941', '98942', '98943'];
      const hasCmt = claim.lines?.some(l => cmtCodes.includes(l.cptCode));
      if (!hasCmt) return { passed: true };

      // M99.0x codes are subluxation codes
      const hasSubLux = claim.diagnoses?.some(d =>
        d.code.startsWith('M99.0') || d.code.startsWith('M99.1')
      );
      return {
        passed: !!hasSubLux,
        message: 'CMT codes typically require M99.0x subluxation diagnosis',
        suggestion: 'Add appropriate subluxation diagnosis (M99.00-M99.05)',
        field: 'diagnoses',
      };
    },
  },
  {
    code: 'CHI_003',
    category: 'Chiropractic',
    severity: 'INFO',
    description: 'E/M with CMT on same day typically needs modifier 25',
    validate: (claim) => {
      const cmtCodes = ['98940', '98941', '98942', '98943'];
      const emCodes = ['99201', '99202', '99203', '99204', '99205', '99211', '99212', '99213', '99214', '99215'];

      const hasCmt = claim.lines?.some(l => cmtCodes.includes(l.cptCode));
      const emLines = claim.lines?.filter(l => emCodes.includes(l.cptCode));

      if (!hasCmt || !emLines?.length) return { passed: true };

      const emWithout25 = emLines.filter(l => !l.modifiers?.includes('25'));
      return {
        passed: !emWithout25?.length,
        message: `E/M code(s) on same day as CMT may need modifier 25: line(s) ${emWithout25?.map(l => l.lineNumber).join(', ')}`,
        suggestion: 'Add modifier 25 for separately identifiable E/M service',
        field: 'lines.modifiers',
      };
    },
  },

  // Timing Rules
  {
    code: 'TIME_001',
    category: 'Timing',
    severity: 'ERROR',
    description: 'Service dates cannot be in the future',
    validate: (claim) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const futureDates = claim.lines?.filter(l => new Date(l.serviceDateFrom) > today);
      return {
        passed: !futureDates?.length,
        message: `Future service dates on line(s): ${futureDates?.map(l => l.lineNumber).join(', ')}`,
        suggestion: 'Correct service dates to be on or before today',
        field: 'lines.serviceDateFrom',
      };
    },
  },
  {
    code: 'TIME_002',
    category: 'Timing',
    severity: 'WARNING',
    description: 'Service dates older than 90 days may be denied',
    validate: (claim) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const oldDates = claim.lines?.filter(l => new Date(l.serviceDateFrom) < cutoff);
      return {
        passed: !oldDates?.length,
        message: `Service dates older than 90 days on line(s): ${oldDates?.map(l => l.lineNumber).join(', ')}`,
        suggestion: 'Check payer timely filing limits',
        field: 'lines.serviceDateFrom',
      };
    },
  },

  // Totals Rules
  {
    code: 'TOT_001',
    category: 'Totals',
    severity: 'ERROR',
    description: 'Total charges must match sum of line charges',
    validate: (claim) => {
      const lineTotal = claim.lines?.reduce((sum, l) => sum + (l.chargeAmount || 0), 0) || 0;
      const diff = Math.abs(claim.totalCharges - lineTotal);
      return {
        passed: diff < 0.01, // Allow for small rounding differences
        message: `Total charges ($${claim.totalCharges}) don't match line sum ($${lineTotal.toFixed(2)})`,
        suggestion: 'Recalculate total charges',
        field: 'totalCharges',
      };
    },
  },
];

// ============================================
// Claim Scrubber Class
// ============================================

export class ClaimScrubber {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Scrub a claim for errors before submission
   */
  async scrubClaim(input: ClaimScrubInput): Promise<ClaimScrubOutput> {
    const startTime = Date.now();

    // Fetch claim data with all necessary relations
    const claim = await this.prisma.claim.findUnique({
      where: { id: input.claimId },
      include: {
        patient: {
          include: {
            demographics: true,
            contacts: { where: { isPrimary: true }, take: 1 },
          },
        },
        insurancePolicy: true,
        payer: true,
        claimLines: true,
        encounter: {
          include: {
            diagnoses: { orderBy: { sequence: 'asc' } },
          },
        },
        organization: true,
      },
    });

    if (!claim) {
      throw new Error(`Claim not found: ${input.claimId}`);
    }

    // Transform to ClaimData format
    const claimData = this.transformClaimData(claim);

    // Run all scrub rules
    const issues: ClaimScrubIssueInput[] = [];
    let passedChecks = 0;
    let failedChecks = 0;
    let warningChecks = 0;

    for (const rule of scrubRules) {
      // Skip warning/info rules if not requested
      if (!input.includeWarnings && rule.severity !== 'ERROR') {
        continue;
      }

      try {
        const result = rule.validate(claimData);

        if (result.passed) {
          passedChecks++;
        } else {
          if (rule.severity === 'ERROR') {
            failedChecks++;
          } else if (rule.severity === 'WARNING') {
            warningChecks++;
          }

          issues.push({
            severity: rule.severity,
            code: rule.code,
            category: rule.category,
            field: result.field,
            message: result.message || rule.description,
            suggestion: result.suggestion,
            claimLineNumber: result.claimLineNumber,
            cptCode: result.cptCode,
          });
        }
      } catch (err) {
        // Log but don't fail on individual rule errors
        console.error(`Error running rule ${rule.code}:`, err);
      }
    }

    // Determine overall status and recommendation
    let status: ClaimScrubOutput['status'] = 'PASSED';
    let recommendation: ClaimScrubOutput['recommendation'] = 'SUBMIT';

    if (failedChecks > 0) {
      status = 'FAILED';
      recommendation = 'FIX_REQUIRED';
    } else if (warningChecks > 0) {
      status = 'WARNINGS';
      recommendation = 'REVIEW';
    }

    // Calculate overall score
    const totalChecks = passedChecks + failedChecks + warningChecks;
    const overallScore = totalChecks > 0
      ? Math.round(((passedChecks + warningChecks * 0.5) / totalChecks) * 100)
      : 100;

    // Generate summary
    const summary = this.generateSummary(issues, overallScore, status);

    return {
      status,
      overallScore,
      passedChecks,
      failedChecks,
      warningChecks,
      summary,
      recommendation,
      issues,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Transform Prisma claim data to ClaimData format
   */
  private transformClaimData(claim: any): ClaimData {
    const demographics = claim.patient?.demographics;
    const address = claim.patient?.addresses?.[0];

    return {
      id: claim.id,
      claimNumber: claim.claimNumber,
      status: claim.status,
      totalCharges: Number(claim.totalCharges),
      claimType: claim.claimType,
      patient: {
        id: claim.patient?.id || '',
        firstName: demographics?.firstName || '',
        lastName: demographics?.lastName || '',
        dateOfBirth: demographics?.dateOfBirth,
        gender: demographics?.gender || 'UNKNOWN',
        address: address ? {
          line1: address.line1 || '',
          city: address.city || '',
          state: address.state || '',
          zip: address.zip || '',
        } : undefined,
      },
      insurance: claim.insurancePolicy ? {
        payerId: claim.insurancePolicy.payer?.payerId,
        payerName: claim.insurancePolicy.payer?.name,
        subscriberId: claim.insurancePolicy.subscriberId,
        groupNumber: claim.insurancePolicy.groupNumber,
        relationshipCode: claim.insurancePolicy.relationship,
      } : undefined,
      provider: {
        npi: claim.billingNpi,
        name: claim.organization?.name,
      },
      billingNpi: claim.billingNpi,
      renderingNpi: claim.renderingNpi,
      facilityNpi: claim.facilityNpi,
      diagnoses: claim.encounter?.diagnoses?.map((d: any, idx: number) => ({
        code: d.icd10Code,
        sequence: d.sequence || idx + 1,
        isPrimary: d.isPrimary,
      })) || [],
      lines: claim.claimLines?.map((l: any) => ({
        lineNumber: l.lineNumber,
        cptCode: l.cptCode,
        modifiers: l.modifiers || [],
        description: l.description,
        units: l.units,
        chargeAmount: Number(l.chargedAmount),
        serviceDateFrom: l.serviceDateFrom,
        serviceDateTo: l.serviceDateTo || l.serviceDateFrom,
        diagnosisPointers: l.diagnosisPointers || [],
        placeOfService: l.placeOfService,
      })) || [],
      organizationId: claim.organizationId,
    };
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(
    issues: ClaimScrubIssueInput[],
    score: number,
    status: ClaimScrubOutput['status']
  ): string {
    if (status === 'PASSED') {
      return `Claim passed all validation checks. Score: ${score}/100. Ready for submission.`;
    }

    const errorCount = issues.filter(i => i.severity === 'ERROR').length;
    const warningCount = issues.filter(i => i.severity === 'WARNING').length;
    const infoCount = issues.filter(i => i.severity === 'INFO').length;

    const parts = [];
    if (errorCount > 0) parts.push(`${errorCount} error(s)`);
    if (warningCount > 0) parts.push(`${warningCount} warning(s)`);
    if (infoCount > 0) parts.push(`${infoCount} info item(s)`);

    const categories = [...new Set(issues.map(i => i.category))];

    return `Claim has ${parts.join(', ')} in: ${categories.join(', ')}. Score: ${score}/100. ${
      errorCount > 0 ? 'Fix errors before submitting.' : 'Review warnings before submitting.'
    }`;
  }
}

export const createClaimScrubber = (prisma: PrismaClient) => new ClaimScrubber(prisma);
