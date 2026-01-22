/**
 * Epic 30: AI Receptionist Agent - Patient Identification Agent
 * US-304: Patient identification
 *
 * AI agent that identifies callers through caller ID lookup, voice verification,
 * DOB/name verification, and handles family member calling scenarios.
 */

import type { PrismaClient } from '@prisma/client';
import type { AIActionResult } from '@prisma/client';
import type { CallState, CallContext } from './types';

// ==================== Types ====================

export interface PatientIdentificationRequest {
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  voiceVerificationData?: VoiceVerificationData;
  verificationMethod?: 'caller_id' | 'voice' | 'dob_name';
}

export interface PatientIdentificationResponse {
  success: boolean;
  message: string;
  patientId?: string;
  patientName?: string;
  verified: boolean;
  verificationMethod?: 'caller_id' | 'voice' | 'dob_name' | 'new_patient';
  needsInfo?: ('name' | 'dob' | 'phone' | 'confirm' | 'voice')[];
  matchedPatients?: PatientMatch[];
  familyContext?: FamilyContext;
  actionResult: AIActionResult;
}

export interface PatientMatch {
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  phone?: string;
  confidence: number;
  matchType: 'exact' | 'partial' | 'soundex';
}

export interface VoiceVerificationData {
  voicePrint?: string;
  voiceId?: string;
  confidence?: number;
  enrolled?: boolean;
}

export interface FamilyContext {
  householdId?: string;
  callerPatientId?: string;
  callerName?: string;
  callerRelationship?: string;
  callingFor?: {
    patientId: string;
    patientName: string;
    relationship: string;
  };
}

export interface NewPatientInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  phone: string;
  email?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  insuranceProvider?: string;
  insuranceMemberId?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  referralSource?: string;
}

export interface PatientIdentificationConfig {
  organizationId: string;
  requireVerification?: boolean;
  verificationMethods?: ('caller_id' | 'voice' | 'dob_name')[];
  allowNewPatientCreation?: boolean;
  autoLinkConversation?: boolean;
  maxMatchResults?: number;
  soundexEnabled?: boolean;
}

// ==================== Patient Identification Agent ====================

export class PatientIdentificationAgent {
  private prisma: PrismaClient;
  private config: PatientIdentificationConfig;

  constructor(prisma: PrismaClient, config: PatientIdentificationConfig) {
    this.prisma = prisma;
    this.config = {
      requireVerification: config.requireVerification ?? true,
      verificationMethods: config.verificationMethods ?? ['caller_id', 'dob_name'],
      allowNewPatientCreation: config.allowNewPatientCreation ?? true,
      autoLinkConversation: config.autoLinkConversation ?? true,
      maxMatchResults: config.maxMatchResults ?? 5,
      soundexEnabled: config.soundexEnabled ?? true,
      ...config,
    };
  }

  // ==================== Caller ID Lookup ====================

  /**
   * Look up patient by caller ID (phone number)
   */
  async lookupByCallerId(
    phoneNumber: string,
    callState: CallState
  ): Promise<PatientIdentificationResponse> {
    // Normalize phone number
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    // Search for patients with this phone number
    const patientContacts = await this.prisma.patientContact.findMany({
      where: {
        patient: {
          organizationId: this.config.organizationId,
          status: { in: ['ACTIVE', 'INACTIVE'] },
        },
        OR: [
          { homePhone: { contains: normalizedPhone } },
          { mobilePhone: { contains: normalizedPhone } },
          { workPhone: { contains: normalizedPhone } },
        ],
      },
      include: {
        patient: {
          include: {
            demographics: true,
            householdMembers: {
              include: {
                household: {
                  include: {
                    members: {
                      include: {
                        patient: {
                          include: { demographics: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      take: this.config.maxMatchResults,
    });

    if (patientContacts.length === 0) {
      // No match found
      return {
        success: false,
        message: "I don't recognize this phone number. Could you please tell me your name?",
        verified: false,
        needsInfo: ['name'],
        actionResult: 'PENDING',
      };
    }

    if (patientContacts.length === 1) {
      const contact = patientContacts[0];
      const patient = contact.patient;
      const demographics = patient.demographics;
      const patientName = demographics
        ? `${demographics.firstName} ${demographics.lastName}`
        : 'Unknown';

      // Check if this might be a family member calling
      const householdMembers = patient.householdMembers;
      const familyContext = this.buildFamilyContext(patient, householdMembers);

      if (this.config.requireVerification) {
        // Require verification before confirming identity
        return {
          success: true,
          message: `Hi, I see this number is registered to ${patientName}. Is this ${demographics?.firstName}?`,
          patientId: patient.id,
          patientName,
          verified: false,
          verificationMethod: 'caller_id',
          needsInfo: ['confirm'],
          familyContext,
          actionResult: 'PENDING',
        };
      }

      // Auto-link conversation if configured
      if (this.config.autoLinkConversation && callState.conversationId) {
        await this.linkConversationToPatient(callState.conversationId, patient.id);
      }

      return {
        success: true,
        message: `Hi ${demographics?.firstName}! How can I help you today?`,
        patientId: patient.id,
        patientName,
        verified: true,
        verificationMethod: 'caller_id',
        familyContext,
        actionResult: 'SUCCESS',
      };
    }

    // Multiple patients share this phone number (family/household)
    const matches: PatientMatch[] = patientContacts.map((c) => ({
      patientId: c.patient.id,
      firstName: c.patient.demographics?.firstName || 'Unknown',
      lastName: c.patient.demographics?.lastName || '',
      dateOfBirth: c.patient.demographics?.dateOfBirth || undefined,
      phone: normalizedPhone,
      confidence: 0.8,
      matchType: 'exact' as const,
    }));

    return {
      success: true,
      message: `I see this phone number is associated with multiple patients. Who am I speaking with today?`,
      verified: false,
      verificationMethod: 'caller_id',
      needsInfo: ['name'],
      matchedPatients: matches,
      actionResult: 'PARTIAL',
    };
  }

  // ==================== Name/DOB Verification ====================

  /**
   * Verify patient identity using name and date of birth
   */
  async verifyByNameAndDOB(
    firstName: string,
    lastName: string,
    dateOfBirth: Date,
    callState: CallState
  ): Promise<PatientIdentificationResponse> {
    // Search for exact matches first
    const exactMatches = await this.prisma.patient.findMany({
      where: {
        organizationId: this.config.organizationId,
        status: { in: ['ACTIVE', 'INACTIVE'] },
        demographics: {
          firstName: { equals: firstName, mode: 'insensitive' },
          lastName: { equals: lastName, mode: 'insensitive' },
          dateOfBirth: dateOfBirth,
        },
      },
      include: {
        demographics: true,
        contacts: { where: { isPrimary: true }, take: 1 },
      },
    });

    if (exactMatches.length === 1) {
      const patient = exactMatches[0];
      const demographics = patient.demographics;
      const patientName = `${demographics?.firstName} ${demographics?.lastName}`;

      // Auto-link conversation if configured
      if (this.config.autoLinkConversation && callState.conversationId) {
        await this.linkConversationToPatient(callState.conversationId, patient.id);
      }

      return {
        success: true,
        message: `Thank you, ${demographics?.firstName}. I've verified your identity. How can I help you today?`,
        patientId: patient.id,
        patientName,
        verified: true,
        verificationMethod: 'dob_name',
        actionResult: 'SUCCESS',
      };
    }

    if (exactMatches.length > 1) {
      // Multiple matches - need additional verification
      const matches: PatientMatch[] = exactMatches.map((p) => ({
        patientId: p.id,
        firstName: p.demographics?.firstName || firstName,
        lastName: p.demographics?.lastName || lastName,
        dateOfBirth: p.demographics?.dateOfBirth || dateOfBirth,
        phone: p.contacts[0]?.mobilePhone || p.contacts[0]?.homePhone || undefined,
        confidence: 1.0,
        matchType: 'exact' as const,
      }));

      return {
        success: true,
        message: "I found multiple records matching that information. Can you confirm the last 4 digits of your phone number on file?",
        verified: false,
        verificationMethod: 'dob_name',
        needsInfo: ['phone'],
        matchedPatients: matches,
        actionResult: 'PARTIAL',
      };
    }

    // Try soundex matching if enabled
    if (this.config.soundexEnabled) {
      const soundexMatches = await this.findBySoundex(firstName, lastName, dateOfBirth);
      if (soundexMatches.length > 0) {
        return {
          success: false,
          message: `I couldn't find an exact match. Did you mean ${soundexMatches.map((m) => m.firstName + ' ' + m.lastName).join(' or ')}?`,
          verified: false,
          matchedPatients: soundexMatches,
          needsInfo: ['confirm'],
          actionResult: 'PARTIAL',
        };
      }
    }

    // No match found
    return {
      success: false,
      message: "I couldn't find a patient record with that information. Are you a new patient?",
      verified: false,
      needsInfo: ['confirm'],
      actionResult: 'FAILED',
    };
  }

  /**
   * Parse name and DOB from natural language input
   */
  parseVerificationInfo(
    userInput: string,
    currentInfo: Partial<PatientIdentificationRequest>
  ): { info: Partial<PatientIdentificationRequest>; nextQuestion?: string; complete: boolean } {
    const info = { ...currentInfo };
    let nextQuestion: string | undefined;

    // Extract name
    const namePatterns = [
      /(?:my name is|i'm|i am|this is)\s+(\w+)\s+(\w+)/i,
      /^(\w+)\s+(\w+)$/i,
    ];

    for (const pattern of namePatterns) {
      const match = userInput.match(pattern);
      if (match) {
        info.firstName = match[1];
        info.lastName = match[2];
        break;
      }
    }

    // Single first name mention
    if (!info.firstName) {
      const firstNameMatch = userInput.match(/(?:my )?name(?:'s| is)\s+(\w+)/i);
      if (firstNameMatch) {
        info.firstName = firstNameMatch[1];
      }
    }

    // Extract date of birth
    const dobPatterns = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
      /(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/i,
    ];

    for (const pattern of dobPatterns) {
      const match = userInput.match(pattern);
      if (match) {
        if (pattern === dobPatterns[0]) {
          const month = parseInt(match[1], 10) - 1;
          const day = parseInt(match[2], 10);
          let year = parseInt(match[3], 10);
          if (year < 100) year += year > 30 ? 1900 : 2000;
          info.dateOfBirth = new Date(year, month, day);
        } else {
          const monthNames = [
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december',
          ];
          const monthIndex = monthNames.findIndex((m) =>
            m.startsWith(match[1].toLowerCase())
          );
          if (monthIndex !== -1) {
            info.dateOfBirth = new Date(
              parseInt(match[3], 10),
              monthIndex,
              parseInt(match[2], 10)
            );
          }
        }
        break;
      }
    }

    // Determine what's missing
    if (!info.firstName || !info.lastName) {
      nextQuestion = 'Could you please tell me your full name?';
    } else if (!info.dateOfBirth) {
      nextQuestion = `Thank you, ${info.firstName}. And what is your date of birth?`;
    }

    const complete = !!(info.firstName && info.lastName && info.dateOfBirth);

    return { info, nextQuestion, complete };
  }

  // ==================== Voice Verification ====================

  /**
   * Verify patient identity using voice print (placeholder for future implementation)
   */
  async verifyByVoice(
    voiceData: VoiceVerificationData,
    callState: CallState
  ): Promise<PatientIdentificationResponse> {
    // Voice verification would integrate with a voice biometrics service
    // This is a placeholder implementation
    if (!voiceData.enrolled) {
      return {
        success: false,
        message: "You haven't enrolled in voice verification yet. Would you like to set it up for faster identification in the future?",
        verified: false,
        needsInfo: ['name', 'dob'],
        actionResult: 'PENDING',
      };
    }

    if (voiceData.confidence && voiceData.confidence >= 0.85) {
      // High confidence voice match
      // In a real implementation, we would look up the patient by voiceId
      return {
        success: true,
        message: "I've verified your identity by voice. How can I help you today?",
        verified: true,
        verificationMethod: 'voice',
        actionResult: 'SUCCESS',
      };
    }

    // Low confidence - fall back to other verification
    return {
      success: false,
      message: "I couldn't verify your voice clearly. Let me verify your identity another way. What is your name and date of birth?",
      verified: false,
      needsInfo: ['name', 'dob'],
      actionResult: 'PENDING',
    };
  }

  /**
   * Enroll patient in voice verification (placeholder)
   */
  async enrollVoiceVerification(
    patientId: string,
    voiceData: VoiceVerificationData
  ): Promise<{ success: boolean; message: string }> {
    // Placeholder for voice enrollment
    // Would store voice print data securely
    return {
      success: true,
      message: "Great! I've enrolled your voice for faster identification in future calls.",
    };
  }

  // ==================== New Patient Creation ====================

  /**
   * Create a new patient record during call
   */
  async createNewPatient(
    patientInfo: NewPatientInfo,
    callState: CallState
  ): Promise<PatientIdentificationResponse> {
    if (!this.config.allowNewPatientCreation) {
      return {
        success: false,
        message: "I'm not able to create new patient records. Please visit our office or website to register.",
        verified: false,
        actionResult: 'FAILED',
      };
    }

    // Generate MRN
    const mrn = await this.generateMRN();

    // Create patient with demographics and contact
    const patient = await this.prisma.patient.create({
      data: {
        organizationId: this.config.organizationId,
        mrn,
        status: 'ACTIVE',
        demographics: {
          create: {
            firstName: patientInfo.firstName,
            lastName: patientInfo.lastName,
            dateOfBirth: patientInfo.dateOfBirth,
            // Soundex values for fuzzy matching
            firstNameSoundex: this.soundex(patientInfo.firstName),
            lastNameSoundex: this.soundex(patientInfo.lastName),
          },
        },
        contacts: {
          create: {
            isPrimary: true,
            mobilePhone: this.normalizePhoneNumber(patientInfo.phone),
            email: patientInfo.email,
            addressLine1: patientInfo.address?.street,
            city: patientInfo.address?.city,
            state: patientInfo.address?.state,
            zipCode: patientInfo.address?.zip,
          },
        },
      },
      include: {
        demographics: true,
        contacts: true,
      },
    });

    const patientName = `${patientInfo.firstName} ${patientInfo.lastName}`;

    // Link conversation to new patient
    if (this.config.autoLinkConversation && callState.conversationId) {
      await this.linkConversationToPatient(callState.conversationId, patient.id);
    }

    return {
      success: true,
      message: `Welcome to our practice, ${patientInfo.firstName}! I've created your patient record. How can I help you today?`,
      patientId: patient.id,
      patientName,
      verified: true,
      verificationMethod: 'new_patient',
      actionResult: 'SUCCESS',
    };
  }

  /**
   * Collect new patient information from conversation
   */
  async collectNewPatientInfo(
    userInput: string,
    currentInfo: Partial<NewPatientInfo>
  ): Promise<{ info: Partial<NewPatientInfo>; nextQuestion?: string; complete: boolean }> {
    const info = { ...currentInfo };
    let nextQuestion: string | undefined;

    // Extract name
    const nameMatch = userInput.match(/(?:my name is|i'm|i am)\s+(\w+)\s+(\w+)/i);
    if (nameMatch) {
      info.firstName = nameMatch[1];
      info.lastName = nameMatch[2];
    }

    // Extract date of birth
    const dobMatch = userInput.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dobMatch) {
      const month = parseInt(dobMatch[1], 10) - 1;
      const day = parseInt(dobMatch[2], 10);
      let year = parseInt(dobMatch[3], 10);
      if (year < 100) year += year > 30 ? 1900 : 2000;
      info.dateOfBirth = new Date(year, month, day);
    }

    // Extract phone
    const phoneMatch = userInput.match(/(\d{3})[.\-\s]?(\d{3})[.\-\s]?(\d{4})/);
    if (phoneMatch) {
      info.phone = `${phoneMatch[1]}-${phoneMatch[2]}-${phoneMatch[3]}`;
    }

    // Extract email
    const emailMatch = userInput.match(/[\w.-]+@[\w.-]+\.\w+/i);
    if (emailMatch) {
      info.email = emailMatch[0];
    }

    // Determine what's missing
    if (!info.firstName || !info.lastName) {
      nextQuestion = 'Could you please tell me your full name?';
    } else if (!info.dateOfBirth) {
      nextQuestion = 'What is your date of birth?';
    } else if (!info.phone) {
      nextQuestion = 'What is the best phone number to reach you?';
    } else if (!info.email) {
      nextQuestion = 'And your email address?';
    }

    const complete = !!(
      info.firstName &&
      info.lastName &&
      info.dateOfBirth &&
      info.phone
    );

    return { info, nextQuestion, complete };
  }

  // ==================== Family Member Handling ====================

  /**
   * Handle family members calling on behalf of patient
   */
  async handleFamilyMemberCalling(
    callerPatientId: string,
    callingForPatientId: string,
    callState: CallState
  ): Promise<PatientIdentificationResponse> {
    // Verify family relationship
    const relationship = await this.verifyFamilyRelationship(
      callerPatientId,
      callingForPatientId
    );

    if (!relationship) {
      return {
        success: false,
        message: "I couldn't verify your relationship to this patient. For privacy reasons, I can only discuss patient information with authorized family members.",
        verified: false,
        actionResult: 'FAILED',
      };
    }

    // Get patient info
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: callingForPatientId,
        organizationId: this.config.organizationId,
      },
      include: { demographics: true },
    });

    if (!patient) {
      return {
        success: false,
        message: "I couldn't find the patient record.",
        verified: false,
        actionResult: 'FAILED',
      };
    }

    const callerPatient = await this.prisma.patient.findFirst({
      where: { id: callerPatientId },
      include: { demographics: true },
    });

    const patientName = patient.demographics
      ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
      : 'Unknown';
    const callerName = callerPatient?.demographics
      ? `${callerPatient.demographics.firstName}`
      : 'Unknown';

    // Link conversation to the patient being called about
    if (this.config.autoLinkConversation && callState.conversationId) {
      await this.linkConversationToPatient(callState.conversationId, callingForPatientId);
    }

    return {
      success: true,
      message: `Hi ${callerName}. I see you're calling about ${patient.demographics?.firstName}. How can I help?`,
      patientId: callingForPatientId,
      patientName,
      verified: true,
      verificationMethod: 'dob_name',
      familyContext: {
        callerPatientId,
        callerName,
        callerRelationship: relationship.relationship,
        callingFor: {
          patientId: callingForPatientId,
          patientName,
          relationship: relationship.relationship,
        },
      },
      actionResult: 'SUCCESS',
    };
  }

  /**
   * Ask who the caller is calling about (for family/household scenarios)
   */
  async promptForFamilyMember(
    callerPatientId: string
  ): Promise<PatientIdentificationResponse> {
    // Get household members
    const householdMembers = await this.prisma.householdMember.findMany({
      where: {
        patientId: callerPatientId,
      },
      include: {
        household: {
          include: {
            members: {
              include: {
                patient: {
                  include: { demographics: true },
                },
              },
            },
          },
        },
      },
    });

    if (householdMembers.length === 0) {
      return {
        success: true,
        message: "Are you calling for yourself today?",
        verified: false,
        needsInfo: ['confirm'],
        actionResult: 'PENDING',
      };
    }

    // Get all household members
    const allMembers: string[] = [];
    for (const hm of householdMembers) {
      for (const member of hm.household.members) {
        if (member.patientId !== callerPatientId) {
          const name = member.patient?.demographics?.firstName || 'Unknown';
          if (!allMembers.includes(name)) {
            allMembers.push(name);
          }
        }
      }
    }

    if (allMembers.length === 0) {
      return {
        success: true,
        message: "Are you calling for yourself today?",
        verified: false,
        needsInfo: ['confirm'],
        actionResult: 'PENDING',
      };
    }

    return {
      success: true,
      message: `Are you calling for yourself, or for ${allMembers.join(' or ')}?`,
      verified: false,
      needsInfo: ['confirm'],
      actionResult: 'PENDING',
    };
  }

  // ==================== Conversation Linking ====================

  /**
   * Link conversation to patient record
   */
  async linkConversationToPatient(
    conversationId: string,
    patientId: string
  ): Promise<void> {
    await this.prisma.aIReceptionistConversation.update({
      where: { id: conversationId },
      data: { patientId },
    });
  }

  // ==================== Privacy Compliance ====================

  /**
   * Verify caller is authorized to access patient information
   * (HIPAA-compliant identification)
   */
  async verifyAuthorization(
    callerId: string,
    patientId: string
  ): Promise<{
    authorized: boolean;
    reason?: string;
    relationship?: string;
  }> {
    // Same patient
    if (callerId === patientId) {
      return { authorized: true, relationship: 'self' };
    }

    // Check for family/guardian relationship
    const relationship = await this.verifyFamilyRelationship(callerId, patientId);
    if (relationship) {
      // Check if the relationship type allows access
      const authorizedRelationships = [
        'PARENT',
        'GUARDIAN',
        'SPOUSE',
        'POWER_OF_ATTORNEY',
        'EMERGENCY_CONTACT',
      ];

      if (authorizedRelationships.includes(relationship.relationship)) {
        return {
          authorized: true,
          relationship: relationship.relationship,
        };
      }
    }

    // Check patient age - minors have different rules
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId },
      include: { demographics: true },
    });

    if (patient?.demographics?.dateOfBirth) {
      const age = this.calculateAge(patient.demographics.dateOfBirth);
      if (age < 18 && relationship) {
        // Parent/guardian can access minor's records
        return {
          authorized: true,
          relationship: relationship.relationship,
        };
      }
    }

    return {
      authorized: false,
      reason: 'Unable to verify authorization to access this patient\'s information',
    };
  }

  /**
   * Get privacy-safe patient info (for verification without revealing details)
   */
  async getPrivacySafePatientInfo(patientId: string): Promise<{
    exists: boolean;
    initials?: string;
    dobMonth?: number;
    lastFourPhone?: string;
  }> {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        organizationId: this.config.organizationId,
      },
      include: {
        demographics: true,
        contacts: { where: { isPrimary: true }, take: 1 },
      },
    });

    if (!patient) {
      return { exists: false };
    }

    const initials = patient.demographics
      ? `${patient.demographics.firstName[0]}${patient.demographics.lastName[0]}`
      : undefined;

    const dobMonth = patient.demographics?.dateOfBirth?.getMonth();

    const phone = patient.contacts[0]?.mobilePhone || patient.contacts[0]?.homePhone;
    const lastFourPhone = phone?.slice(-4);

    return {
      exists: true,
      initials,
      dobMonth,
      lastFourPhone,
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Normalize phone number to standard format
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    // Remove country code if present
    if (digits.length === 11 && digits[0] === '1') {
      return digits.slice(1);
    }

    return digits;
  }

  /**
   * Generate Soundex code for fuzzy name matching
   */
  private soundex(name: string): string {
    const s = name.toUpperCase().split('');
    const f = s[0];

    const codes: { [key: string]: string } = {
      A: '', E: '', I: '', O: '', U: '', Y: '', H: '', W: '',
      B: '1', F: '1', P: '1', V: '1',
      C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
      D: '3', T: '3',
      L: '4',
      M: '5', N: '5',
      R: '6',
    };

    const result = f + s
      .slice(1)
      .map((c) => codes[c])
      .filter((c, i, a) => c !== '' && c !== a[i - 1])
      .join('');

    return (result + '000').slice(0, 4);
  }

  /**
   * Find patients by soundex (fuzzy name matching)
   */
  private async findBySoundex(
    firstName: string,
    lastName: string,
    dateOfBirth: Date
  ): Promise<PatientMatch[]> {
    const firstNameSoundex = this.soundex(firstName);
    const lastNameSoundex = this.soundex(lastName);

    const patients = await this.prisma.patient.findMany({
      where: {
        organizationId: this.config.organizationId,
        status: { in: ['ACTIVE', 'INACTIVE'] },
        demographics: {
          firstNameSoundex,
          lastNameSoundex,
          dateOfBirth,
        },
      },
      include: {
        demographics: true,
        contacts: { where: { isPrimary: true }, take: 1 },
      },
      take: this.config.maxMatchResults,
    });

    return patients.map((p) => ({
      patientId: p.id,
      firstName: p.demographics?.firstName || '',
      lastName: p.demographics?.lastName || '',
      dateOfBirth: p.demographics?.dateOfBirth || undefined,
      phone: p.contacts[0]?.mobilePhone || p.contacts[0]?.homePhone || undefined,
      confidence: 0.7,
      matchType: 'soundex' as const,
    }));
  }

  /**
   * Generate unique MRN (Medical Record Number)
   */
  private async generateMRN(): Promise<string> {
    const prefix = 'MRN';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  /**
   * Calculate age from date of birth
   */
  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * Verify family relationship between two patients
   */
  private async verifyFamilyRelationship(
    callerPatientId: string,
    targetPatientId: string
  ): Promise<{ relationship: string } | null> {
    // Check if they're in the same household
    const callerHouseholds = await this.prisma.householdMember.findMany({
      where: { patientId: callerPatientId },
      select: { householdId: true, relationship: true },
    });

    const targetHouseholds = await this.prisma.householdMember.findMany({
      where: { patientId: targetPatientId },
      select: { householdId: true, relationship: true },
    });

    // Find common household
    for (const callerHH of callerHouseholds) {
      for (const targetHH of targetHouseholds) {
        if (callerHH.householdId === targetHH.householdId) {
          return { relationship: callerHH.relationship };
        }
      }
    }

    return null;
  }

  /**
   * Build family context from household members
   */
  private buildFamilyContext(
    patient: {
      id: string;
      demographics?: { firstName: string | null; lastName: string | null } | null;
    },
    householdMembers: Array<{
      relationship: string;
      household: {
        members: Array<{
          patientId: string;
          relationship: string;
          patient: {
            demographics: { firstName: string | null; lastName: string | null } | null;
          } | null;
        }>;
      };
    }>
  ): FamilyContext | undefined {
    if (householdMembers.length === 0) {
      return undefined;
    }

    return {
      householdId: householdMembers[0]?.household ? undefined : undefined, // Simplified - would include actual household ID
      callerPatientId: patient.id,
      callerName: patient.demographics
        ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
        : undefined,
    };
  }

  // ==================== Main Identification Flow ====================

  /**
   * Main identification flow - orchestrates the verification process
   */
  async identifyPatient(
    request: PatientIdentificationRequest,
    callState: CallState
  ): Promise<PatientIdentificationResponse> {
    // Step 1: Try caller ID lookup
    if (request.phoneNumber && this.config.verificationMethods?.includes('caller_id')) {
      const callerIdResult = await this.lookupByCallerId(
        request.phoneNumber,
        callState
      );

      if (callerIdResult.verified) {
        return callerIdResult;
      }

      // If we got partial match, return it for further verification
      if (callerIdResult.patientId || callerIdResult.matchedPatients) {
        return callerIdResult;
      }
    }

    // Step 2: Try name/DOB verification if we have the info
    if (
      request.firstName &&
      request.lastName &&
      request.dateOfBirth &&
      this.config.verificationMethods?.includes('dob_name')
    ) {
      return this.verifyByNameAndDOB(
        request.firstName,
        request.lastName,
        request.dateOfBirth,
        callState
      );
    }

    // Step 3: Voice verification if configured
    if (
      request.voiceVerificationData &&
      this.config.verificationMethods?.includes('voice')
    ) {
      return this.verifyByVoice(request.voiceVerificationData, callState);
    }

    // Need more information
    return {
      success: false,
      message: "I'd like to verify your identity. Could you please tell me your full name and date of birth?",
      verified: false,
      needsInfo: ['name', 'dob'],
      actionResult: 'PENDING',
    };
  }
}

// ==================== Factory ====================

export function createPatientIdentificationAgent(
  prisma: PrismaClient,
  config: PatientIdentificationConfig
): PatientIdentificationAgent {
  return new PatientIdentificationAgent(prisma, config);
}
