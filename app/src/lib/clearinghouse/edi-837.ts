/**
 * Epic 08: Clearinghouse Integration - EDI 837P Generator
 *
 * Generates ANSI X12 837P (Professional) claim files from internal claim data.
 * Compliant with HIPAA 837P 005010X222A1 implementation guide.
 */

import { ClaimSubmissionRequest, X12Delimiters, RELATIONSHIP_CODES, GENDER_CODES } from './types';

// ============================================
// Constants and Configuration
// ============================================

/**
 * Default X12 delimiters for 837P files.
 */
export const DEFAULT_DELIMITERS: X12Delimiters = {
  segment: '~',
  element: '*',
  subelement: ':',
};

/**
 * Claim frequency codes for Box 22.
 */
export const CLAIM_FREQUENCY = {
  ORIGINAL: '1',
  CORRECTED: '7',
  REPLACEMENT: '8',
} as const;

/**
 * Place of service codes.
 */
export const PLACE_OF_SERVICE = {
  TELEHEALTH: '02',
  OFFICE: '11',
  HOME: '12',
  ASSISTED_LIVING: '13',
  SKILLED_NURSING: '31',
  URGENT_CARE: '20',
  INPATIENT_HOSPITAL: '21',
  OUTPATIENT_HOSPITAL: '22',
  EMERGENCY: '23',
  OTHER: '99',
} as const;

/**
 * Entity identifier codes for NM1 segments.
 */
export const ENTITY_IDENTIFIER = {
  SUBMITTER: '41',       // Submitter
  RECEIVER: '40',        // Receiver
  BILLING_PROVIDER: '85',
  PAY_TO_PROVIDER: '87',
  SUBSCRIBER: 'IL',      // Insured/Subscriber
  PATIENT: 'QC',         // Patient
  PAYER: 'PR',           // Payer
  RENDERING_PROVIDER: '82',
  REFERRING_PROVIDER: 'DN',
  SERVICE_FACILITY: '77',
} as const;

/**
 * Entity type qualifiers.
 */
export const ENTITY_TYPE = {
  PERSON: '1',
  NON_PERSON: '2',
} as const;

/**
 * Reference identification qualifiers.
 */
export const REFERENCE_QUALIFIER = {
  NPI: 'XX',
  EMPLOYER_ID: 'EI',
  SSN: 'SY',
  MEMBER_ID: 'MI',
  PAYER_ID: 'PI',
  CLAIM_CONTROL: 'D9',
  PRIOR_AUTH: 'G1',
} as const;

// ============================================
// Types
// ============================================

export interface EDI837Config {
  /** Interchange sender ID (ISA06) */
  senderId: string;
  /** Interchange sender ID qualifier (ISA05) */
  senderIdQualifier: string;
  /** Interchange receiver ID (ISA08) */
  receiverId: string;
  /** Interchange receiver ID qualifier (ISA07) */
  receiverIdQualifier: string;
  /** Application sender code (GS02) */
  appSenderId: string;
  /** Application receiver code (GS03) */
  appReceiverId: string;
  /** Submitter name (Loop 1000A) */
  submitterName: string;
  /** Submitter identifier (EIN or NPI) */
  submitterId: string;
  /** Submitter contact name */
  submitterContactName?: string;
  /** Submitter contact phone */
  submitterContactPhone?: string;
  /** Submitter contact email */
  submitterContactEmail?: string;
  /** Production (P) or Test (T) */
  usageIndicator: 'P' | 'T';
  /** Version/Release/Industry ID Code */
  versionId?: string;
}

export interface EDI837Result {
  success: boolean;
  ediContent: string;
  controlNumber: string;
  segmentCount: number;
  errors: string[];
  warnings: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================
// Utility Functions
// ============================================

/**
 * Pad string to specified length with spaces on the right.
 */
function padRight(value: string, length: number): string {
  return value.padEnd(length, ' ').substring(0, length);
}

/**
 * Pad string to specified length with zeros on the left.
 */
function padLeft(value: string, length: number, char = '0'): string {
  return value.padStart(length, char).substring(0, length);
}

/**
 * Format date as CCYYMMDD (8 digits).
 */
function formatDate8(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format time as HHMM (4 digits).
 */
function formatTime4(date: Date): string {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}${minutes}`;
}

/**
 * Clean and validate string for EDI (remove special characters).
 */
function cleanString(value: string | undefined | null): string {
  if (!value) return '';
  // Remove characters that could break EDI parsing
  return value
    .replace(/[~*:^]/g, '')
    .replace(/[\r\n]/g, ' ')
    .trim();
}

/**
 * Format phone number as 10 digits.
 */
function formatPhone(phone: string | undefined | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  // Remove country code if present
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  return digits.substring(0, 10);
}

/**
 * Convert gender to X12 code.
 */
function genderToCode(gender: string | undefined | null): string {
  if (!gender) return GENDER_CODES.UNKNOWN;
  const g = gender.toUpperCase();
  if (g === 'MALE' || g === 'M') return GENDER_CODES.MALE;
  if (g === 'FEMALE' || g === 'F') return GENDER_CODES.FEMALE;
  return GENDER_CODES.UNKNOWN;
}

/**
 * Convert relationship to X12 code.
 */
function relationshipToCode(relationship: string | undefined | null): string {
  if (!relationship) return RELATIONSHIP_CODES.SELF;
  const r = relationship.toUpperCase();
  if (r === 'SELF' || r === '18') return RELATIONSHIP_CODES.SELF;
  if (r === 'SPOUSE' || r === '01') return RELATIONSHIP_CODES.SPOUSE;
  if (r === 'CHILD' || r === '19') return RELATIONSHIP_CODES.CHILD;
  return RELATIONSHIP_CODES.OTHER;
}

/**
 * Generate unique control number.
 */
function generateControlNumber(): string {
  const timestamp = Date.now().toString().substring(4);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${timestamp}${random}`.substring(0, 9);
}

// ============================================
// Validation
// ============================================

/**
 * Validate claim data before 837P generation.
 */
export function validateClaim(request: ClaimSubmissionRequest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Patient validation
  if (!request.patient.firstName) errors.push('Patient first name is required');
  if (!request.patient.lastName) errors.push('Patient last name is required');
  if (!request.patient.dateOfBirth) errors.push('Patient date of birth is required');
  if (!request.patient.gender) warnings.push('Patient gender is missing');
  if (!request.patient.address?.line1) warnings.push('Patient address is missing');
  if (!request.patient.address?.city) warnings.push('Patient city is missing');
  if (!request.patient.address?.state) warnings.push('Patient state is missing');
  if (!request.patient.address?.zip) warnings.push('Patient ZIP code is missing');

  // Insurance validation
  if (!request.insurance.payerId) errors.push('Payer ID is required');
  if (!request.insurance.payerName) errors.push('Payer name is required');
  if (!request.insurance.subscriberId) errors.push('Subscriber ID is required');
  if (!request.insurance.relationshipCode) {
    warnings.push('Relationship code is missing, defaulting to SELF');
  }

  // Provider validation
  if (!request.provider.npi) errors.push('Provider NPI is required');
  if (!request.provider.name) errors.push('Provider name is required');
  if (!request.provider.taxId) warnings.push('Provider Tax ID is missing');
  if (!request.provider.address?.line1) warnings.push('Provider address is missing');

  // Claim validation
  if (!request.claim.claimNumber) errors.push('Claim number is required');
  if (!request.claim.diagnoses || request.claim.diagnoses.length === 0) {
    errors.push('At least one diagnosis code is required');
  }
  if (!request.claim.services || request.claim.services.length === 0) {
    errors.push('At least one service line is required');
  }
  if (request.claim.totalCharges <= 0) {
    warnings.push('Total charges should be greater than zero');
  }

  // Service line validation
  request.claim.services.forEach((service, index) => {
    if (!service.cptCode) {
      errors.push(`Service line ${index + 1}: CPT code is required`);
    }
    if (!service.serviceDateFrom) {
      errors.push(`Service line ${index + 1}: Service date is required`);
    }
    if (service.chargeAmount <= 0) {
      warnings.push(`Service line ${index + 1}: Charge amount should be greater than zero`);
    }
    if (!service.diagnosisPointers || service.diagnosisPointers.length === 0) {
      errors.push(`Service line ${index + 1}: At least one diagnosis pointer is required`);
    }
  });

  // Diagnosis pointers validation
  const maxDxIndex = request.claim.diagnoses.length;
  request.claim.services.forEach((service, svcIndex) => {
    service.diagnosisPointers?.forEach((pointer) => {
      if (pointer < 1 || pointer > maxDxIndex) {
        errors.push(
          `Service line ${svcIndex + 1}: Invalid diagnosis pointer ${pointer} ` +
          `(must be 1-${maxDxIndex})`
        );
      }
    });
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// EDI 837P Generator Class
// ============================================

/**
 * EDI 837P file generator.
 */
export class EDI837Generator {
  private config: EDI837Config;
  private delimiters: X12Delimiters;
  private segments: string[] = [];
  private segmentCount = 0;
  private hlCounter = 0;

  constructor(config: EDI837Config, delimiters?: Partial<X12Delimiters>) {
    this.config = config;
    this.delimiters = { ...DEFAULT_DELIMITERS, ...delimiters };
  }

  /**
   * Add a segment to the EDI file.
   */
  private addSegment(segmentId: string, ...elements: (string | number | undefined)[]): void {
    const cleanElements = elements.map((e) =>
      e !== undefined && e !== null ? String(e) : ''
    );
    const segment = [segmentId, ...cleanElements].join(this.delimiters.element);
    this.segments.push(segment + this.delimiters.segment);
    this.segmentCount++;
  }

  /**
   * Get next hierarchical level counter.
   */
  private nextHL(): number {
    return ++this.hlCounter;
  }

  /**
   * Generate ISA (Interchange Control Header) segment.
   */
  private generateISA(controlNumber: string): void {
    const now = new Date();
    this.addSegment(
      'ISA',
      '00',                                    // ISA01: Authorization Information Qualifier
      padRight('', 10),                        // ISA02: Authorization Information
      '00',                                    // ISA03: Security Information Qualifier
      padRight('', 10),                        // ISA04: Security Information
      this.config.senderIdQualifier,           // ISA05: Interchange ID Qualifier (Sender)
      padRight(this.config.senderId, 15),      // ISA06: Interchange Sender ID
      this.config.receiverIdQualifier,         // ISA07: Interchange ID Qualifier (Receiver)
      padRight(this.config.receiverId, 15),    // ISA08: Interchange Receiver ID
      formatDate8(now).substring(2),           // ISA09: Interchange Date (YYMMDD)
      formatTime4(now),                        // ISA10: Interchange Time
      '^',                                     // ISA11: Repetition Separator
      '00501',                                 // ISA12: Interchange Control Version Number
      padLeft(controlNumber, 9),               // ISA13: Interchange Control Number
      '0',                                     // ISA14: Acknowledgment Requested
      this.config.usageIndicator,              // ISA15: Usage Indicator (P=Production, T=Test)
      this.delimiters.subelement               // ISA16: Component Element Separator
    );
  }

  /**
   * Generate GS (Functional Group Header) segment.
   */
  private generateGS(controlNumber: string): void {
    const now = new Date();
    this.addSegment(
      'GS',
      'HC',                                    // GS01: Functional Identifier Code (Healthcare Claim)
      this.config.appSenderId,                 // GS02: Application Sender's Code
      this.config.appReceiverId,               // GS03: Application Receiver's Code
      formatDate8(now),                        // GS04: Date (CCYYMMDD)
      formatTime4(now),                        // GS05: Time (HHMM)
      controlNumber,                           // GS06: Group Control Number
      'X',                                     // GS07: Responsible Agency Code
      this.config.versionId || '005010X222A1'  // GS08: Version/Release/Industry ID Code
    );
  }

  /**
   * Generate ST (Transaction Set Header) segment.
   */
  private generateST(controlNumber: string): void {
    this.addSegment(
      'ST',
      '837',                                   // ST01: Transaction Set Identifier Code
      padLeft(controlNumber, 4),               // ST02: Transaction Set Control Number
      '005010X222A1'                           // ST03: Implementation Convention Reference
    );
  }

  /**
   * Generate BHT (Beginning of Hierarchical Transaction) segment.
   */
  private generateBHT(request: ClaimSubmissionRequest, controlNumber: string): void {
    const now = new Date();
    this.addSegment(
      'BHT',
      '0019',                                  // BHT01: Hierarchical Structure Code
      '00',                                    // BHT02: Transaction Set Purpose Code (Original)
      controlNumber,                           // BHT03: Reference Identification
      formatDate8(now),                        // BHT04: Date
      formatTime4(now),                        // BHT05: Time
      'CH'                                     // BHT06: Transaction Type Code (Chargeable)
    );
  }

  /**
   * Generate Loop 1000A - Submitter Name.
   */
  private generateLoop1000A(): void {
    // NM1 - Submitter Name
    this.addSegment(
      'NM1',
      ENTITY_IDENTIFIER.SUBMITTER,             // NM101: Entity Identifier Code
      ENTITY_TYPE.NON_PERSON,                  // NM102: Entity Type Qualifier
      cleanString(this.config.submitterName),  // NM103: Name Last or Organization Name
      '',                                      // NM104: Name First (not used for organization)
      '',                                      // NM105: Name Middle
      '',                                      // NM106: Name Prefix
      '',                                      // NM107: Name Suffix
      '46',                                    // NM108: Identification Code Qualifier (ETIN)
      cleanString(this.config.submitterId)     // NM109: Identification Code
    );

    // PER - Submitter Contact Information
    const phone = formatPhone(this.config.submitterContactPhone);
    const email = cleanString(this.config.submitterContactEmail);

    const perElements: (string | undefined)[] = [
      'IC',                                    // PER01: Contact Function Code
      cleanString(this.config.submitterContactName) || 'BILLING DEPT', // PER02
    ];

    if (phone) {
      perElements.push('TE', phone);           // PER03-04: Phone
    }
    if (email) {
      perElements.push('EM', email);           // PER05-06: Email
    }

    this.addSegment('PER', ...perElements);
  }

  /**
   * Generate Loop 1000B - Receiver Name.
   */
  private generateLoop1000B(request: ClaimSubmissionRequest): void {
    // NM1 - Receiver Name
    this.addSegment(
      'NM1',
      ENTITY_IDENTIFIER.RECEIVER,              // NM101: Entity Identifier Code
      ENTITY_TYPE.NON_PERSON,                  // NM102: Entity Type Qualifier
      cleanString(request.insurance.payerName), // NM103: Name (Payer)
      '',                                      // NM104-107: Not used
      '',
      '',
      '',
      REFERENCE_QUALIFIER.PAYER_ID,            // NM108: ID Code Qualifier
      cleanString(request.insurance.payerId)   // NM109: Identification Code
    );
  }

  /**
   * Generate Loop 2000A - Billing Provider Hierarchical Level.
   */
  private generateLoop2000A(request: ClaimSubmissionRequest): number {
    const hlId = this.nextHL();

    // HL - Hierarchical Level
    this.addSegment(
      'HL',
      String(hlId),                            // HL01: Hierarchical ID Number
      '',                                      // HL02: Hierarchical Parent ID (none for billing provider)
      '20',                                    // HL03: Hierarchical Level Code (Information Source)
      '1'                                      // HL04: Hierarchical Child Code (has children)
    );

    // PRV - Billing Provider Specialty
    this.addSegment(
      'PRV',
      'BI',                                    // PRV01: Provider Code (Billing)
      'PXC',                                   // PRV02: Reference ID Qualifier (Healthcare Provider Taxonomy)
      '111N00000X'                             // PRV03: Taxonomy Code (Chiropractic)
    );

    // Loop 2010AA - Billing Provider Name
    this.generateLoop2010AA(request);

    // Loop 2010AB - Pay-to Address (if different)
    // For simplicity, using same as billing address

    return hlId;
  }

  /**
   * Generate Loop 2010AA - Billing Provider Name.
   */
  private generateLoop2010AA(request: ClaimSubmissionRequest): void {
    // NM1 - Billing Provider Name
    this.addSegment(
      'NM1',
      ENTITY_IDENTIFIER.BILLING_PROVIDER,      // NM101: Entity Identifier Code
      ENTITY_TYPE.NON_PERSON,                  // NM102: Entity Type Qualifier (Organization)
      cleanString(request.provider.name),      // NM103: Organization Name
      '',                                      // NM104-107: Not used for organization
      '',
      '',
      '',
      REFERENCE_QUALIFIER.NPI,                 // NM108: ID Code Qualifier
      cleanString(request.provider.npi)        // NM109: NPI
    );

    // N3 - Billing Provider Address
    if (request.provider.address) {
      this.addSegment(
        'N3',
        cleanString(request.provider.address.line1),
        cleanString(request.provider.address.line2)
      );

      // N4 - Billing Provider City/State/ZIP
      this.addSegment(
        'N4',
        cleanString(request.provider.address.city),
        cleanString(request.provider.address.state),
        cleanString(request.provider.address.zip)?.replace(/[^0-9]/g, '')
      );
    }

    // REF - Billing Provider Tax ID
    if (request.provider.taxId) {
      this.addSegment(
        'REF',
        REFERENCE_QUALIFIER.EMPLOYER_ID,       // REF01: Reference ID Qualifier (EIN)
        cleanString(request.provider.taxId).replace(/[^0-9]/g, '')
      );
    }
  }

  /**
   * Generate Loop 2000B - Subscriber Hierarchical Level.
   */
  private generateLoop2000B(request: ClaimSubmissionRequest, parentHL: number): number {
    const hlId = this.nextHL();
    const isPatientSubscriber = request.insurance.relationshipCode === '18' ||
                                 request.insurance.relationshipCode === 'SELF';

    // HL - Hierarchical Level
    this.addSegment(
      'HL',
      String(hlId),                            // HL01: Hierarchical ID Number
      String(parentHL),                        // HL02: Hierarchical Parent ID
      '22',                                    // HL03: Hierarchical Level Code (Subscriber)
      isPatientSubscriber ? '0' : '1'          // HL04: Hierarchical Child Code
    );

    // SBR - Subscriber Information
    this.addSegment(
      'SBR',
      'P',                                     // SBR01: Payer Responsibility Sequence (Primary)
      relationshipToCode(request.insurance.relationshipCode), // SBR02: Individual Relationship Code
      cleanString(request.insurance.groupNumber), // SBR03: Reference Identification (Group Number)
      '',                                      // SBR04: Name (not used)
      '',                                      // SBR05: Insurance Type Code
      '',                                      // SBR06-08: Not used
      '',
      '',
      'CI'                                     // SBR09: Claim Filing Indicator Code (Commercial Insurance)
    );

    // Loop 2010BA - Subscriber Name
    this.generateLoop2010BA(request, isPatientSubscriber);

    // Loop 2010BB - Payer Name
    this.generateLoop2010BB(request);

    return hlId;
  }

  /**
   * Generate Loop 2010BA - Subscriber Name.
   */
  private generateLoop2010BA(request: ClaimSubmissionRequest, isPatientSubscriber: boolean): void {
    const subscriber = request.insurance.subscriber;
    const firstName = isPatientSubscriber ? request.patient.firstName : (subscriber?.firstName || '');
    const lastName = isPatientSubscriber ? request.patient.lastName : (subscriber?.lastName || '');

    // NM1 - Subscriber Name
    this.addSegment(
      'NM1',
      ENTITY_IDENTIFIER.SUBSCRIBER,            // NM101: Entity Identifier Code
      ENTITY_TYPE.PERSON,                      // NM102: Entity Type Qualifier
      cleanString(lastName),                   // NM103: Last Name
      cleanString(firstName),                  // NM104: First Name
      '',                                      // NM105: Middle Name
      '',                                      // NM106: Prefix
      '',                                      // NM107: Suffix
      REFERENCE_QUALIFIER.MEMBER_ID,           // NM108: ID Code Qualifier
      cleanString(request.insurance.subscriberId) // NM109: Member ID
    );

    // N3 - Subscriber Address (if patient is subscriber)
    if (isPatientSubscriber && request.patient.address) {
      this.addSegment(
        'N3',
        cleanString(request.patient.address.line1),
        cleanString(request.patient.address.line2)
      );

      // N4 - Subscriber City/State/ZIP
      this.addSegment(
        'N4',
        cleanString(request.patient.address.city),
        cleanString(request.patient.address.state),
        cleanString(request.patient.address.zip)?.replace(/[^0-9]/g, '')
      );
    }

    // DMG - Subscriber Demographics
    if (isPatientSubscriber) {
      this.addSegment(
        'DMG',
        'D8',                                  // DMG01: Date Time Period Format Qualifier
        formatDate8(request.patient.dateOfBirth),
        genderToCode(request.patient.gender)
      );
    } else if (subscriber?.dateOfBirth) {
      this.addSegment(
        'DMG',
        'D8',
        formatDate8(subscriber.dateOfBirth)
      );
    }
  }

  /**
   * Generate Loop 2010BB - Payer Name.
   */
  private generateLoop2010BB(request: ClaimSubmissionRequest): void {
    // NM1 - Payer Name
    this.addSegment(
      'NM1',
      ENTITY_IDENTIFIER.PAYER,                 // NM101: Entity Identifier Code
      ENTITY_TYPE.NON_PERSON,                  // NM102: Entity Type Qualifier
      cleanString(request.insurance.payerName), // NM103: Organization Name
      '',                                      // NM104-107: Not used
      '',
      '',
      '',
      REFERENCE_QUALIFIER.PAYER_ID,            // NM108: ID Code Qualifier
      cleanString(request.insurance.payerId)   // NM109: Payer ID
    );
  }

  /**
   * Generate Loop 2000C - Patient Hierarchical Level (if different from subscriber).
   */
  private generateLoop2000C(request: ClaimSubmissionRequest, parentHL: number): number {
    const hlId = this.nextHL();

    // HL - Hierarchical Level
    this.addSegment(
      'HL',
      String(hlId),
      String(parentHL),
      '23',                                    // HL03: Hierarchical Level Code (Dependent/Patient)
      '0'                                      // HL04: No children
    );

    // PAT - Patient Information
    this.addSegment(
      'PAT',
      relationshipToCode(request.insurance.relationshipCode) // PAT01: Individual Relationship Code
    );

    // Loop 2010CA - Patient Name
    this.generateLoop2010CA(request);

    return hlId;
  }

  /**
   * Generate Loop 2010CA - Patient Name.
   */
  private generateLoop2010CA(request: ClaimSubmissionRequest): void {
    // NM1 - Patient Name
    this.addSegment(
      'NM1',
      ENTITY_IDENTIFIER.PATIENT,               // NM101: Entity Identifier Code
      ENTITY_TYPE.PERSON,                      // NM102: Entity Type Qualifier
      cleanString(request.patient.lastName),   // NM103: Last Name
      cleanString(request.patient.firstName),  // NM104: First Name
      '',                                      // NM105-107: Not used
      '',
      ''
      // NM108-109: Not required for patient
    );

    // N3 - Patient Address
    if (request.patient.address) {
      this.addSegment(
        'N3',
        cleanString(request.patient.address.line1),
        cleanString(request.patient.address.line2)
      );

      // N4 - Patient City/State/ZIP
      this.addSegment(
        'N4',
        cleanString(request.patient.address.city),
        cleanString(request.patient.address.state),
        cleanString(request.patient.address.zip)?.replace(/[^0-9]/g, '')
      );
    }

    // DMG - Patient Demographics
    this.addSegment(
      'DMG',
      'D8',                                    // DMG01: Date Time Period Format Qualifier
      formatDate8(request.patient.dateOfBirth),
      genderToCode(request.patient.gender)
    );
  }

  /**
   * Generate Loop 2300 - Claim Information.
   */
  private generateLoop2300(request: ClaimSubmissionRequest): void {
    // CLM - Claim Information
    this.addSegment(
      'CLM',
      cleanString(request.claim.claimNumber),  // CLM01: Patient Control Number
      request.claim.totalCharges.toFixed(2),   // CLM02: Total Claim Charge Amount
      '',                                      // CLM03: Not used
      '',                                      // CLM04: Not used
      `${request.claim.placeOfService || PLACE_OF_SERVICE.OFFICE}${this.delimiters.subelement}B${this.delimiters.subelement}1`, // CLM05: Place of Service, Facility Code Qualifier, Claim Frequency
      'Y',                                     // CLM06: Provider Signature Indicator
      'A',                                     // CLM07: Assignment Code (Assigned)
      'Y',                                     // CLM08: Benefits Assignment Certification
      'Y'                                      // CLM09: Release of Information Code
    );

    // DTP - Date of Service (Claim level, if all services on same date)
    const firstService = request.claim.services[0];
    if (firstService) {
      this.addSegment(
        'DTP',
        '431',                                 // DTP01: Date/Time Qualifier (Onset of Current Symptoms)
        'D8',                                  // DTP02: Date Time Period Format Qualifier
        formatDate8(firstService.serviceDateFrom)
      );
    }

    // HI - Health Care Diagnosis Code (ICD-10)
    this.generateDiagnosisCodes(request);

    // Loop 2400 - Service Lines
    request.claim.services.forEach((service, index) => {
      this.generateLoop2400(request, service, index + 1);
    });
  }

  /**
   * Generate HI segments for diagnosis codes.
   */
  private generateDiagnosisCodes(request: ClaimSubmissionRequest): void {
    const diagnoses = request.claim.diagnoses;
    if (!diagnoses || diagnoses.length === 0) return;

    // First HI segment contains principal and up to 11 additional diagnoses
    // ABK = Principal Diagnosis (ICD-10-CM)
    // ABF = Additional Diagnosis (ICD-10-CM)

    const primaryDx = diagnoses.find((d) => d.isPrimary) || diagnoses[0];
    const otherDx = diagnoses.filter((d) => d.code !== primaryDx.code);

    // Build HI segment elements
    const hiElements: string[] = [];

    // Principal diagnosis (required)
    hiElements.push(`ABK${this.delimiters.subelement}${cleanString(primaryDx.code).replace(/\./g, '')}`);

    // Additional diagnoses (up to 11 more, max 12 total)
    otherDx.slice(0, 11).forEach((dx) => {
      hiElements.push(`ABF${this.delimiters.subelement}${cleanString(dx.code).replace(/\./g, '')}`);
    });

    this.addSegment('HI', ...hiElements);
  }

  /**
   * Generate Loop 2400 - Service Line.
   */
  private generateLoop2400(
    request: ClaimSubmissionRequest,
    service: ClaimSubmissionRequest['claim']['services'][0],
    lineNumber: number
  ): void {
    // LX - Service Line Number
    this.addSegment(
      'LX',
      String(lineNumber)
    );

    // SV1 - Professional Service
    const modifiers = service.modifiers?.slice(0, 4).join(this.delimiters.subelement) || '';
    const diagnosisPointers = service.diagnosisPointers?.map((p) => String(p)).join(this.delimiters.subelement) || '1';

    this.addSegment(
      'SV1',
      // SV101: Composite Medical Procedure Identifier
      `HC${this.delimiters.subelement}${cleanString(service.cptCode)}${modifiers ? this.delimiters.subelement + modifiers : ''}`,
      service.chargeAmount.toFixed(2),         // SV102: Line Item Charge Amount
      'UN',                                    // SV103: Unit or Basis for Measurement Code (Unit)
      String(service.units),                   // SV104: Service Unit Count
      service.placeOfService || request.claim.placeOfService || PLACE_OF_SERVICE.OFFICE, // SV105: Place of Service
      '',                                      // SV106: Not used
      diagnosisPointers                        // SV107: Composite Diagnosis Code Pointer
    );

    // DTP - Service Date
    if (service.serviceDateFrom.getTime() === service.serviceDateTo.getTime()) {
      // Single date
      this.addSegment(
        'DTP',
        '472',                                 // DTP01: Date/Time Qualifier (Service)
        'D8',                                  // DTP02: Date Time Period Format Qualifier
        formatDate8(service.serviceDateFrom)
      );
    } else {
      // Date range
      this.addSegment(
        'DTP',
        '472',
        'RD8',                                 // DTP02: Range of Dates
        `${formatDate8(service.serviceDateFrom)}-${formatDate8(service.serviceDateTo)}`
      );
    }
  }

  /**
   * Generate SE (Transaction Set Trailer) segment.
   */
  private generateSE(controlNumber: string, startSegment: number): void {
    const segmentCount = this.segmentCount - startSegment + 1;
    this.addSegment(
      'SE',
      String(segmentCount),                    // SE01: Number of Included Segments
      padLeft(controlNumber, 4)                // SE02: Transaction Set Control Number
    );
  }

  /**
   * Generate GE (Functional Group Trailer) segment.
   */
  private generateGE(controlNumber: string): void {
    this.addSegment(
      'GE',
      '1',                                     // GE01: Number of Transaction Sets Included
      controlNumber                            // GE02: Group Control Number
    );
  }

  /**
   * Generate IEA (Interchange Control Trailer) segment.
   */
  private generateIEA(controlNumber: string): void {
    this.addSegment(
      'IEA',
      '1',                                     // IEA01: Number of Included Functional Groups
      padLeft(controlNumber, 9)                // IEA02: Interchange Control Number
    );
  }

  /**
   * Generate complete 837P file for a single claim.
   */
  public generate(request: ClaimSubmissionRequest, controlNumber?: string): EDI837Result {
    // Reset state
    this.segments = [];
    this.segmentCount = 0;
    this.hlCounter = 0;

    // Validate claim
    const validation = validateClaim(request);
    if (!validation.isValid) {
      return {
        success: false,
        ediContent: '',
        controlNumber: '',
        segmentCount: 0,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    const ctrlNum = controlNumber || generateControlNumber();

    try {
      // ISA/GS - Interchange and Functional Group Headers
      this.generateISA(ctrlNum);
      this.generateGS(ctrlNum);

      // ST - Transaction Set Header
      const stStartSegment = this.segmentCount;
      this.generateST(ctrlNum);

      // BHT - Beginning of Hierarchical Transaction
      this.generateBHT(request, ctrlNum);

      // Loop 1000A - Submitter
      this.generateLoop1000A();

      // Loop 1000B - Receiver
      this.generateLoop1000B(request);

      // Loop 2000A - Billing Provider
      const billingHL = this.generateLoop2000A(request);

      // Loop 2000B - Subscriber
      const subscriberHL = this.generateLoop2000B(request, billingHL);

      // Loop 2000C - Patient (if different from subscriber)
      const isPatientSubscriber = request.insurance.relationshipCode === '18' ||
                                   request.insurance.relationshipCode === 'SELF';
      if (!isPatientSubscriber) {
        this.generateLoop2000C(request, subscriberHL);
      }

      // Loop 2300 - Claim Information
      this.generateLoop2300(request);

      // SE - Transaction Set Trailer
      this.generateSE(ctrlNum, stStartSegment);

      // GE - Functional Group Trailer
      this.generateGE(ctrlNum);

      // IEA - Interchange Control Trailer
      this.generateIEA(ctrlNum);

      return {
        success: true,
        ediContent: this.segments.join('\n'),
        controlNumber: ctrlNum,
        segmentCount: this.segmentCount,
        errors: [],
        warnings: validation.warnings,
      };
    } catch (error) {
      return {
        success: false,
        ediContent: '',
        controlNumber: ctrlNum,
        segmentCount: this.segmentCount,
        errors: [error instanceof Error ? error.message : 'Unknown error during EDI generation'],
        warnings: validation.warnings,
      };
    }
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an EDI 837P generator with the given configuration.
 */
export function createEDI837Generator(
  config: EDI837Config,
  delimiters?: Partial<X12Delimiters>
): EDI837Generator {
  return new EDI837Generator(config, delimiters);
}

/**
 * Generate 837P file content from a claim submission request.
 * Convenience function that creates a generator with default config.
 */
export function generate837P(
  request: ClaimSubmissionRequest,
  config: Partial<EDI837Config> & Pick<EDI837Config, 'senderId' | 'receiverId' | 'submitterName' | 'submitterId'>,
  controlNumber?: string
): EDI837Result {
  const fullConfig: EDI837Config = {
    senderIdQualifier: 'ZZ',
    receiverIdQualifier: 'ZZ',
    appSenderId: config.senderId,
    appReceiverId: config.receiverId,
    usageIndicator: 'P',
    ...config,
  };

  const generator = new EDI837Generator(fullConfig);
  return generator.generate(request, controlNumber);
}
