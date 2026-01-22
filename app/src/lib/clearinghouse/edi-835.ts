/**
 * Epic 08: Clearinghouse Integration - EDI 835 ERA/Remittance Parser
 *
 * Parse ANSI X12 835 (Electronic Remittance Advice) files for auto-posting.
 * Implements 005010X221A1 version of the 835 standard.
 */

import type {
  RemittanceData,
  RemittanceClaimData,
  RemittanceServiceData,
} from './types';

// ============================================
// Types
// ============================================

export interface EDI835ParseResult {
  success: boolean;
  remittance: RemittanceData | null;
  errors: string[];
  warnings: string[];
  segmentCount: number;
  rawContent?: string;
}

export interface ParsedSegment {
  id: string;
  elements: string[];
  raw: string;
}

export interface Adjustment {
  groupCode: string; // CO, PR, OA, PI, CR
  reasonCode: string; // CARC code
  amount: number;
}

// CAS (Claim Adjustment Segment) group codes
export const CAS_GROUP_CODES = {
  CO: 'Contractual Obligation',
  PI: 'Payer Initiated Reduction',
  PR: 'Patient Responsibility',
  OA: 'Other Adjustment',
  CR: 'Correction/Reversal',
} as const;

// Common CARC codes for reference
export const CARC_CODES: Record<string, string> = {
  '1': 'Deductible Amount',
  '2': 'Coinsurance Amount',
  '3': 'Co-payment Amount',
  '4': 'Procedure code inconsistent with modifier',
  '5': 'Procedure code inconsistent with diagnosis code',
  '16': 'Claim lacks information or submitted late',
  '18': 'Duplicate claim/service',
  '22': 'Care not authorized',
  '27': 'Expenses incurred after coverage terminated',
  '29': 'Time limit for filing expired',
  '45': 'Charges exceed fee schedule/maximum allowable',
  '50': 'Non-covered services',
  '96': 'Non-covered charge(s)',
  '97': 'Payment included in another service',
  '119': 'Benefit maximum reached',
  '151': 'Prior authorization not obtained',
  '197': 'Precertification/authorization absent',
  '204': 'Specific condition not met',
  '253': 'Sequestration adjustment',
};

// ============================================
// EDI 835 Parser Class
// ============================================

export class EDI835Parser {
  private segmentDelimiter = '~';
  private elementDelimiter = '*';
  private subElementDelimiter = ':';
  private segments: ParsedSegment[] = [];
  private errors: string[] = [];
  private warnings: string[] = [];
  private currentIndex = 0;

  /**
   * Parse an 835 EDI file content.
   */
  parse(ediContent: string): EDI835ParseResult {
    this.reset();

    if (!ediContent || ediContent.trim().length === 0) {
      return {
        success: false,
        remittance: null,
        errors: ['Empty EDI content provided'],
        warnings: [],
        segmentCount: 0,
      };
    }

    try {
      // Detect delimiters from ISA segment
      this.detectDelimiters(ediContent);

      // Parse all segments
      this.parseSegments(ediContent);

      if (this.segments.length === 0) {
        return {
          success: false,
          remittance: null,
          errors: ['No segments found in EDI content'],
          warnings: [],
          segmentCount: 0,
        };
      }

      // Validate transaction type
      const stSegment = this.segments.find((s) => s.id === 'ST');
      if (!stSegment || stSegment.elements[1] !== '835') {
        return {
          success: false,
          remittance: null,
          errors: ['Not a valid 835 (Electronic Remittance Advice) transaction'],
          warnings: this.warnings,
          segmentCount: this.segments.length,
        };
      }

      // Parse the 835 structure
      const remittance = this.parseRemittance();

      return {
        success: this.errors.length === 0,
        remittance,
        errors: this.errors,
        warnings: this.warnings,
        segmentCount: this.segments.length,
        rawContent: ediContent,
      };
    } catch (error) {
      return {
        success: false,
        remittance: null,
        errors: [`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: this.warnings,
        segmentCount: this.segments.length,
      };
    }
  }

  private reset(): void {
    this.segments = [];
    this.errors = [];
    this.warnings = [];
    this.currentIndex = 0;
  }

  /**
   * Detect delimiters from the ISA segment (positions are fixed in ISA).
   */
  private detectDelimiters(content: string): void {
    // ISA is fixed-width: element delimiter is at position 3, segment at position 105
    if (content.length >= 106) {
      this.elementDelimiter = content.charAt(3);
      this.subElementDelimiter = content.charAt(104);
      this.segmentDelimiter = content.charAt(105);
    }
  }

  /**
   * Parse EDI content into segments.
   */
  private parseSegments(content: string): void {
    // Normalize line endings and split by segment delimiter
    const normalized = content.replace(/\r\n|\r|\n/g, '');
    const rawSegments = normalized.split(this.segmentDelimiter);

    for (const raw of rawSegments) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const elements = trimmed.split(this.elementDelimiter);
      if (elements.length > 0) {
        this.segments.push({
          id: elements[0],
          elements,
          raw: trimmed,
        });
      }
    }
  }

  /**
   * Get next segment, optionally filtering by ID.
   */
  private getNextSegment(id?: string): ParsedSegment | null {
    while (this.currentIndex < this.segments.length) {
      const segment = this.segments[this.currentIndex++];
      if (!id || segment.id === id) {
        return segment;
      }
    }
    return null;
  }

  /**
   * Peek at the next segment without advancing.
   */
  private peekSegment(): ParsedSegment | null {
    if (this.currentIndex < this.segments.length) {
      return this.segments[this.currentIndex];
    }
    return null;
  }

  /**
   * Find all segments with a given ID starting from current position.
   */
  private getAllSegmentsUntil(until: string[]): ParsedSegment[] {
    const result: ParsedSegment[] = [];
    while (this.currentIndex < this.segments.length) {
      const segment = this.segments[this.currentIndex];
      if (until.includes(segment.id)) {
        break;
      }
      result.push(segment);
      this.currentIndex++;
    }
    return result;
  }

  /**
   * Parse the entire remittance structure.
   */
  private parseRemittance(): RemittanceData {
    const remittance: RemittanceData = {
      checkNumber: '',
      checkDate: new Date(),
      payerName: '',
      payerId: undefined,
      totalPaid: 0,
      totalAdjusted: 0,
      totalCharges: 0,
      claims: [],
      ediContent: this.segments.map((s) => s.raw).join(this.segmentDelimiter),
    };

    this.currentIndex = 0;

    // Parse header segments
    this.parseHeader(remittance);

    // Parse claims (CLP loops)
    this.parseClaims(remittance);

    // Calculate totals from claims if not in BPR
    if (remittance.totalPaid === 0 && remittance.claims.length > 0) {
      remittance.totalPaid = remittance.claims.reduce(
        (sum, claim) =>
          sum + claim.services.reduce((s, svc) => s + svc.paidAmount, 0),
        0
      );
      remittance.totalAdjusted = remittance.claims.reduce(
        (sum, claim) =>
          sum + claim.services.reduce((s, svc) => s + svc.adjustedAmount, 0),
        0
      );
      remittance.totalCharges = remittance.claims.reduce(
        (sum, claim) =>
          sum + claim.services.reduce((s, svc) => s + svc.chargedAmount, 0),
        0
      );
    }

    return remittance;
  }

  /**
   * Parse header segments (ISA, GS, ST, BPR, TRN, DTM, N1).
   */
  private parseHeader(remittance: RemittanceData): void {
    while (this.currentIndex < this.segments.length) {
      const segment = this.peekSegment();
      if (!segment) break;

      switch (segment.id) {
        case 'ISA':
          this.currentIndex++;
          break;

        case 'GS':
          this.currentIndex++;
          break;

        case 'ST':
          this.currentIndex++;
          break;

        case 'BPR': {
          // Financial Information
          const bpr = this.getNextSegment('BPR')!;
          // BPR02 = Total Actual Provider Payment Amount
          remittance.totalPaid = this.parseAmount(bpr.elements[2]);
          // BPR16 = Check/EFT date (CCYYMMDD)
          if (bpr.elements[16]) {
            remittance.checkDate = this.parseDate(bpr.elements[16]);
          }
          break;
        }

        case 'TRN': {
          // Reassociation Trace Number
          const trn = this.getNextSegment('TRN')!;
          // TRN02 = Check/EFT number
          remittance.checkNumber = trn.elements[2] || '';
          break;
        }

        case 'DTM': {
          // Date/Time Reference
          const dtm = this.getNextSegment('DTM')!;
          // DTM01 = Date/Time Qualifier (405 = Production Date)
          if (dtm.elements[1] === '405' && dtm.elements[2]) {
            remittance.checkDate = this.parseDate(dtm.elements[2]);
          }
          break;
        }

        case 'N1': {
          // Name
          const n1 = this.getNextSegment('N1')!;
          // N101 = Entity Identifier Code (PR = Payer, PE = Payee)
          if (n1.elements[1] === 'PR') {
            remittance.payerName = n1.elements[2] || '';
            // N104 = Identification Code (Payer ID)
            remittance.payerId = n1.elements[4] || undefined;
          }
          break;
        }

        case 'CLP':
          // Start of claims - stop header parsing
          return;

        case 'PLB':
          // Provider Level Adjustment - skip for now
          this.currentIndex++;
          break;

        case 'SE':
        case 'GE':
        case 'IEA':
          // End segments
          return;

        default:
          this.currentIndex++;
      }
    }
  }

  /**
   * Parse all claims (CLP loops).
   */
  private parseClaims(remittance: RemittanceData): void {
    while (this.currentIndex < this.segments.length) {
      const segment = this.peekSegment();
      if (!segment) break;

      if (segment.id === 'CLP') {
        const claim = this.parseClaim();
        if (claim) {
          remittance.claims.push(claim);
        }
      } else if (['SE', 'GE', 'IEA', 'PLB'].includes(segment.id)) {
        // End of claims or trailer
        break;
      } else {
        this.currentIndex++;
      }
    }
  }

  /**
   * Parse a single claim (CLP loop).
   */
  private parseClaim(): RemittanceClaimData | null {
    const clp = this.getNextSegment('CLP');
    if (!clp) return null;

    const claim: RemittanceClaimData = {
      patientName: '',
      patientAccountNumber: clp.elements[1] || undefined, // CLP01 = Patient Control Number
      payerClaimNumber: clp.elements[7] || undefined, // CLP07 = Payer Claim Control Number
      services: [],
    };

    // CLP02 = Claim Status Code (1=Processed Primary, 2=Processed Secondary, etc.)
    // CLP03 = Total Claim Charge Amount
    // CLP04 = Total Claim Payment Amount
    // CLP05 = Total Patient Responsibility Amount

    // Parse claim-level segments and services
    while (this.currentIndex < this.segments.length) {
      const segment = this.peekSegment();
      if (!segment) break;

      switch (segment.id) {
        case 'CAS': {
          // Claim-level adjustment - we'll apply to services
          this.currentIndex++;
          break;
        }

        case 'NM1': {
          // Name
          const nm1 = this.getNextSegment('NM1')!;
          // NM101 = QC (Patient), IL (Subscriber), 74 (Corrected Insured)
          if (['QC', 'IL'].includes(nm1.elements[1])) {
            const lastName = nm1.elements[3] || '';
            const firstName = nm1.elements[4] || '';
            claim.patientName = `${lastName}, ${firstName}`.trim();
          }
          break;
        }

        case 'SVC': {
          // Service Line
          const service = this.parseService();
          if (service) {
            claim.services.push(service);
          }
          break;
        }

        case 'CLP':
        case 'SE':
        case 'PLB':
          // Next claim or trailer
          return claim;

        default:
          this.currentIndex++;
      }
    }

    return claim;
  }

  /**
   * Parse a service line (SVC loop).
   */
  private parseService(): RemittanceServiceData | null {
    const svc = this.getNextSegment('SVC');
    if (!svc) return null;

    // SVC01 = Composite Medical Procedure Identifier (HC:CPT:Mod1:Mod2:...)
    const procedureInfo = (svc.elements[1] || '').split(this.subElementDelimiter);
    const cptCode = procedureInfo[1] || '';
    const modifiers: string[] = procedureInfo.slice(2).filter(Boolean);

    // SVC02 = Line Item Charge Amount
    const chargedAmount = this.parseAmount(svc.elements[2]);

    // SVC03 = Line Item Provider Payment Amount
    const paidAmount = this.parseAmount(svc.elements[3]);

    // SVC05 = Units of Service Paid Count
    const units = parseInt(svc.elements[5] || '1', 10) || 1;

    const service: RemittanceServiceData = {
      lineNumber: 0, // Will be set later based on order
      serviceDate: undefined,
      cptCode,
      modifiers,
      units,
      chargedAmount,
      allowedAmount: 0, // Will be calculated from adjustments
      paidAmount,
      adjustedAmount: 0,
      patientAmount: 0,
      adjustmentReasonCodes: [],
      adjustmentAmounts: {},
      remarkCodes: [],
    };

    // Parse service-level segments
    while (this.currentIndex < this.segments.length) {
      const segment = this.peekSegment();
      if (!segment) break;

      switch (segment.id) {
        case 'DTM': {
          // Date/Time Reference
          const dtm = this.getNextSegment('DTM')!;
          // DTM01 = 472 (Service Date)
          if (dtm.elements[1] === '472' && dtm.elements[2]) {
            service.serviceDate = this.parseDate(dtm.elements[2]);
          }
          break;
        }

        case 'CAS': {
          // Claim Adjustment
          const cas = this.getNextSegment('CAS')!;
          this.parseAdjustments(cas, service);
          break;
        }

        case 'AMT': {
          // Monetary Amount
          const amt = this.getNextSegment('AMT')!;
          // AMT01 = B6 (Allowed Amount)
          if (amt.elements[1] === 'B6') {
            service.allowedAmount = this.parseAmount(amt.elements[2]);
          }
          break;
        }

        case 'LQ': {
          // Remark Code
          const lq = this.getNextSegment('LQ')!;
          // LQ01 = RX (Remark Codes), HE (Claim Payment Remark Codes)
          if (['RX', 'HE'].includes(lq.elements[1]) && lq.elements[2]) {
            service.remarkCodes.push(lq.elements[2]);
          }
          break;
        }

        case 'SVC':
        case 'CLP':
        case 'SE':
        case 'PLB':
          // Next service, claim, or trailer
          return this.finalizeService(service);

        default:
          this.currentIndex++;
      }
    }

    return this.finalizeService(service);
  }

  /**
   * Parse CAS (Claim Adjustment Segment) into service adjustments.
   */
  private parseAdjustments(cas: ParsedSegment, service: RemittanceServiceData): void {
    const groupCode = cas.elements[1]; // CO, PR, OA, PI, CR

    // CAS has up to 6 adjustment groups (reason, amount, quantity) triplets
    for (let i = 2; i < cas.elements.length; i += 3) {
      const reasonCode = cas.elements[i];
      const amount = this.parseAmount(cas.elements[i + 1]);

      if (!reasonCode || amount === 0) continue;

      const fullCode = `${groupCode}-${reasonCode}`;
      service.adjustmentReasonCodes.push(fullCode);
      service.adjustmentAmounts[fullCode] = amount;

      // Categorize adjustments
      if (groupCode === 'PR') {
        // Patient Responsibility
        service.patientAmount += amount;
      } else {
        // Contractual or other adjustment
        service.adjustedAmount += amount;
      }
    }
  }

  /**
   * Finalize service calculations.
   */
  private finalizeService(service: RemittanceServiceData): RemittanceServiceData {
    // If allowed amount not set, calculate from charges - adjustments
    if (service.allowedAmount === 0 && service.chargedAmount > 0) {
      service.allowedAmount = service.chargedAmount - service.adjustedAmount;
    }

    // Verify: charged = paid + adjusted + patient
    const calculatedTotal = service.paidAmount + service.adjustedAmount + service.patientAmount;
    if (Math.abs(service.chargedAmount - calculatedTotal) > 0.01) {
      this.warnings.push(
        `Service ${service.cptCode}: Amounts don't balance. ` +
          `Charged: ${service.chargedAmount}, Calculated: ${calculatedTotal}`
      );
    }

    return service;
  }

  /**
   * Parse amount string to number.
   */
  private parseAmount(value: string | undefined): number {
    if (!value) return 0;
    const amount = parseFloat(value);
    return isNaN(amount) ? 0 : amount;
  }

  /**
   * Parse date string (CCYYMMDD) to Date.
   */
  private parseDate(value: string): Date {
    if (!value || value.length < 8) return new Date();
    const year = parseInt(value.substring(0, 4), 10);
    const month = parseInt(value.substring(4, 6), 10) - 1;
    const day = parseInt(value.substring(6, 8), 10);
    return new Date(year, month, day);
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Parse an 835 EDI file.
 */
export function parseERA(ediContent: string): EDI835ParseResult {
  const parser = new EDI835Parser();
  return parser.parse(ediContent);
}

/**
 * Validate that content appears to be an 835 file.
 */
export function isERAContent(content: string): boolean {
  if (!content || content.length < 100) return false;

  // Check for ISA header
  if (!content.startsWith('ISA')) return false;

  // Check for 835 transaction identifier in ST segment
  const stMatch = content.match(/ST\*.?835/);
  return stMatch !== null;
}

/**
 * Match remittance line items to internal claims/charges.
 */
export interface MatchResult {
  lineItem: RemittanceServiceData;
  claimInfo: RemittanceClaimData;
  matchedClaimId: string | null;
  matchedChargeId: string | null;
  matchConfidence: 'high' | 'medium' | 'low' | 'none';
  matchReason: string;
}

export interface AutoPostResult {
  success: boolean;
  totalPosted: number;
  totalPayments: number;
  totalAdjustments: number;
  postedLines: Array<{
    lineNumber: number;
    cptCode: string;
    paidAmount: number;
    adjustedAmount: number;
    claimId: string | null;
    chargeId: string | null;
    status: 'posted' | 'skipped' | 'error';
    message?: string;
  }>;
  errors: string[];
  warnings: string[];
}

/**
 * Generate a posting report from an ERA.
 */
export interface PostingReport {
  remittanceId?: string;
  checkNumber: string;
  checkDate: Date;
  payerName: string;
  summary: {
    totalClaims: number;
    totalServiceLines: number;
    totalCharged: number;
    totalPaid: number;
    totalContractualAdjustment: number;
    totalPatientResponsibility: number;
    totalDenied: number;
  };
  claimDetails: Array<{
    patientName: string;
    patientAccountNumber?: string;
    payerClaimNumber?: string;
    services: Array<{
      cptCode: string;
      modifiers: string[];
      serviceDate?: Date;
      chargedAmount: number;
      allowedAmount: number;
      paidAmount: number;
      adjustedAmount: number;
      patientAmount: number;
      adjustmentCodes: string[];
      remarkCodes: string[];
    }>;
    claimTotal: {
      charged: number;
      paid: number;
      adjusted: number;
      patientAmount: number;
    };
  }>;
  adjustmentBreakdown: Array<{
    code: string;
    description: string;
    category: string;
    totalAmount: number;
    occurrences: number;
  }>;
  generatedAt: Date;
}

export function generatePostingReport(remittance: RemittanceData): PostingReport {
  const adjustmentTotals = new Map<string, { amount: number; count: number }>();

  const claimDetails = remittance.claims.map((claim) => {
    const services = claim.services.map((svc) => {
      // Track adjustments
      for (const code of svc.adjustmentReasonCodes) {
        const amount = svc.adjustmentAmounts[code] || 0;
        const existing = adjustmentTotals.get(code) || { amount: 0, count: 0 };
        adjustmentTotals.set(code, {
          amount: existing.amount + amount,
          count: existing.count + 1,
        });
      }

      return {
        cptCode: svc.cptCode,
        modifiers: svc.modifiers,
        serviceDate: svc.serviceDate,
        chargedAmount: svc.chargedAmount,
        allowedAmount: svc.allowedAmount,
        paidAmount: svc.paidAmount,
        adjustedAmount: svc.adjustedAmount,
        patientAmount: svc.patientAmount,
        adjustmentCodes: svc.adjustmentReasonCodes,
        remarkCodes: svc.remarkCodes,
      };
    });

    const claimTotal = services.reduce(
      (acc, svc) => ({
        charged: acc.charged + svc.chargedAmount,
        paid: acc.paid + svc.paidAmount,
        adjusted: acc.adjusted + svc.adjustedAmount,
        patientAmount: acc.patientAmount + svc.patientAmount,
      }),
      { charged: 0, paid: 0, adjusted: 0, patientAmount: 0 }
    );

    return {
      patientName: claim.patientName,
      patientAccountNumber: claim.patientAccountNumber,
      payerClaimNumber: claim.payerClaimNumber,
      services,
      claimTotal,
    };
  });

  const summary = claimDetails.reduce(
    (acc, claim) => ({
      totalClaims: acc.totalClaims + 1,
      totalServiceLines: acc.totalServiceLines + claim.services.length,
      totalCharged: acc.totalCharged + claim.claimTotal.charged,
      totalPaid: acc.totalPaid + claim.claimTotal.paid,
      totalContractualAdjustment: acc.totalContractualAdjustment + claim.claimTotal.adjusted,
      totalPatientResponsibility: acc.totalPatientResponsibility + claim.claimTotal.patientAmount,
      totalDenied: acc.totalDenied, // Will calculate below
    }),
    {
      totalClaims: 0,
      totalServiceLines: 0,
      totalCharged: 0,
      totalPaid: 0,
      totalContractualAdjustment: 0,
      totalPatientResponsibility: 0,
      totalDenied: 0,
    }
  );

  // Calculate total denied (services with $0 paid but charges present)
  summary.totalDenied = claimDetails.reduce(
    (acc, claim) =>
      acc +
      claim.services
        .filter((svc) => svc.paidAmount === 0 && svc.chargedAmount > 0)
        .reduce((s, svc) => s + svc.chargedAmount, 0),
    0
  );

  // Build adjustment breakdown
  const adjustmentBreakdown = Array.from(adjustmentTotals.entries()).map(([code, data]) => {
    const [groupCode, reasonCode] = code.split('-');
    return {
      code,
      description: CARC_CODES[reasonCode] || 'Unknown',
      category: CAS_GROUP_CODES[groupCode as keyof typeof CAS_GROUP_CODES] || groupCode,
      totalAmount: data.amount,
      occurrences: data.count,
    };
  });

  // Sort by total amount descending
  adjustmentBreakdown.sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    checkNumber: remittance.checkNumber,
    checkDate: remittance.checkDate,
    payerName: remittance.payerName || 'Unknown Payer',
    summary,
    claimDetails,
    adjustmentBreakdown,
    generatedAt: new Date(),
  };
}
