/**
 * Patient Mapping Utilities
 * Epic 04: Digital Intake System
 * US-040: Auto-populate patient record from form submissions
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// ============================================
// TYPES
// ============================================

/**
 * Mapping path for patient fields
 * Dot notation for nested fields (e.g., 'address.street', 'emergencyContact.phone')
 */
export type PatientMappingPath =
  // Demographics
  | 'firstName'
  | 'lastName'
  | 'middleName'
  | 'preferredName'
  | 'dateOfBirth'
  | 'gender'
  | 'ssn'
  // Contact
  | 'email'
  | 'phone'
  | 'mobilePhone'
  | 'homePhone'
  | 'workPhone'
  // Address
  | 'address.street'
  | 'address.street2'
  | 'address.city'
  | 'address.state'
  | 'address.zip'
  | 'address.country'
  // Emergency Contact
  | 'emergencyContact.name'
  | 'emergencyContact.phone'
  | 'emergencyContact.relationship'
  // Insurance
  | 'insurance.provider'
  | 'insurance.policyNumber'
  | 'insurance.groupNumber'
  | 'insurance.subscriberFirstName'
  | 'insurance.subscriberLastName'
  | 'insurance.subscriberDOB'
  | 'insurance.relationship';

export interface FieldMapping {
  fieldId: string;
  fieldName: string;
  mapsTo: PatientMappingPath;
  currentValue?: string;
  newValue?: string;
}

export interface PatientUpdatePreview {
  isNewPatient: boolean;
  patientId?: string;
  patientName?: string;
  mappings: FieldMapping[];
  demographicsChanges: Record<string, { old?: string; new: string }>;
  contactChanges: Record<string, { old?: string; new: string }>;
  emergencyContactChanges: Record<string, { old?: string; new: string }>;
  insuranceChanges: Record<string, { old?: string; new: string }>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse a mapping path to get the category and field
 */
function parseMappingPath(path: PatientMappingPath): { category: string; field: string } {
  const parts = path.split('.');
  if (parts.length === 2) {
    return { category: parts[0], field: parts[1] };
  }
  return { category: 'demographics', field: path };
}

// ============================================
// PREVIEW GENERATION
// ============================================

/**
 * Generate a preview of what patient data will be created/updated
 */
export async function generatePatientUpdatePreview(
  submissionId: string,
  organizationId: string
): Promise<PatientUpdatePreview> {
  // Get submission with responses and fields
  const submission = await prisma.formSubmission.findFirst({
    where: { id: submissionId, organizationId },
    include: {
      patient: {
        include: {
          demographics: true,
          contacts: true,
          emergencyContacts: true,
          insurances: {
            where: { type: 'PRIMARY' },
            take: 1,
          },
        },
      },
      responses: {
        include: {
          field: true,
        },
      },
    },
  });

  if (!submission) {
    throw new Error('Submission not found');
  }

  const isNewPatient = !submission.patientId;
  const mappings: FieldMapping[] = [];
  const demographicsChanges: Record<string, { old?: string; new: string }> = {};
  const contactChanges: Record<string, { old?: string; new: string }> = {};
  const emergencyContactChanges: Record<string, { old?: string; new: string }> = {};
  const insuranceChanges: Record<string, { old?: string; new: string }> = {};

  // Process each response that has a patient mapping
  for (const response of submission.responses) {
    if (!response.field.mapsToPatient || !response.value) continue;

    const mapping: FieldMapping = {
      fieldId: response.fieldId,
      fieldName: response.field.name,
      mapsTo: response.field.mapsToPatient as PatientMappingPath,
      newValue: response.value,
    };

    const { category, field } = parseMappingPath(mapping.mapsTo);

    // Get current value if patient exists
    if (submission.patient) {
      let currentValue: string | undefined;

      switch (category) {
        case 'demographics':
          const demoVal = submission.patient.demographics?.[field as keyof typeof submission.patient.demographics];
          currentValue = demoVal ? String(demoVal) : undefined;
          break;
        case 'address':
          const primaryContact = submission.patient.contacts.find((c) => c.isPrimary);
          if (primaryContact) {
            switch (field) {
              case 'street': currentValue = primaryContact.addressLine1 || undefined; break;
              case 'street2': currentValue = primaryContact.addressLine2 || undefined; break;
              case 'city': currentValue = primaryContact.city || undefined; break;
              case 'state': currentValue = primaryContact.state || undefined; break;
              case 'zip': currentValue = primaryContact.zipCode || undefined; break;
              case 'country': currentValue = primaryContact.country || undefined; break;
            }
          }
          break;
        case 'emergencyContact':
          const emContact = submission.patient.emergencyContacts[0];
          if (emContact) {
            currentValue = emContact[field as keyof typeof emContact] as string | undefined;
          }
          break;
        case 'insurance':
          const ins = submission.patient.insurances[0];
          if (ins) {
            switch (field) {
              case 'provider': currentValue = ins.payerName; break;
              case 'policyNumber': currentValue = ins.policyNumber; break;
              case 'groupNumber': currentValue = ins.groupNumber || undefined; break;
              case 'subscriberFirstName': currentValue = ins.subscriberFirstName || undefined; break;
              case 'subscriberLastName': currentValue = ins.subscriberLastName || undefined; break;
              case 'subscriberDOB': currentValue = ins.subscriberDob?.toISOString().split('T')[0]; break;
              case 'relationship': currentValue = ins.subscriberRelationship; break;
            }
          }
          break;
        default:
          // Contact info
          const contact = submission.patient.contacts.find((c) => c.isPrimary);
          if (contact) {
            switch (field) {
              case 'email': currentValue = contact.email || undefined; break;
              case 'phone':
              case 'mobilePhone': currentValue = contact.mobilePhone || undefined; break;
              case 'homePhone': currentValue = contact.homePhone || undefined; break;
              case 'workPhone': currentValue = contact.workPhone || undefined; break;
            }
          }
      }

      mapping.currentValue = currentValue;
    }

    mappings.push(mapping);

    // Categorize changes
    const changeEntry = {
      old: mapping.currentValue,
      new: response.value,
    };

    switch (category) {
      case 'address':
        contactChanges[`address.${field}`] = changeEntry;
        break;
      case 'emergencyContact':
        emergencyContactChanges[field] = changeEntry;
        break;
      case 'insurance':
        insuranceChanges[field] = changeEntry;
        break;
      case 'demographics':
        demographicsChanges[field] = changeEntry;
        break;
      default:
        contactChanges[field] = changeEntry;
    }
  }

  return {
    isNewPatient,
    patientId: submission.patientId || undefined,
    patientName: submission.patient?.demographics
      ? `${submission.patient.demographics.firstName} ${submission.patient.demographics.lastName}`
      : undefined,
    mappings,
    demographicsChanges,
    contactChanges,
    emergencyContactChanges,
    insuranceChanges,
  };
}

// ============================================
// PATIENT CREATION/UPDATE
// ============================================

/**
 * Apply mapped form data to patient record
 */
export async function applyPatientMapping(
  submissionId: string,
  organizationId: string,
  createIfNotExists: boolean = false
): Promise<{ patientId: string; created: boolean }> {
  const preview = await generatePatientUpdatePreview(submissionId, organizationId);

  if (preview.isNewPatient && !createIfNotExists) {
    throw new Error('No patient linked to this submission');
  }

  // Build update data from mappings
  const demographicsData: Record<string, unknown> = {};
  const addressData: Record<string, string> = {};
  const contactData: Record<string, string> = {};
  const emergencyContactData: Record<string, string> = {};
  const insuranceData: Record<string, string> = {};

  for (const mapping of preview.mappings) {
    const { category, field } = parseMappingPath(mapping.mapsTo);
    const value = mapping.newValue;

    if (!value) continue;

    switch (category) {
      case 'demographics':
        if (field === 'dateOfBirth') {
          demographicsData[field] = new Date(value);
        } else {
          demographicsData[field] = value;
        }
        break;
      case 'address':
        addressData[field] = value;
        break;
      case 'emergencyContact':
        emergencyContactData[field] = value;
        break;
      case 'insurance':
        insuranceData[field] = value;
        break;
      default:
        contactData[field] = value;
    }
  }

  let patientId: string;
  let created = false;

  if (preview.isNewPatient) {
    // Create new patient
    const patient = await prisma.patient.create({
      data: {
        organizationId,
        mrn: `P${Date.now()}`, // Generate MRN
        status: 'ACTIVE',
        demographics: {
          create: {
            firstName: (demographicsData.firstName as string) || 'Unknown',
            lastName: (demographicsData.lastName as string) || 'Unknown',
            dateOfBirth: (demographicsData.dateOfBirth as Date) || new Date(),
            gender: (demographicsData.gender as 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER' | 'PREFER_NOT_TO_SAY') || 'PREFER_NOT_TO_SAY',
            ssn: demographicsData.ssn as string | undefined,
            middleName: demographicsData.middleName as string | undefined,
            preferredName: demographicsData.preferredName as string | undefined,
          },
        },
        contacts: (contactData.email || contactData.phone || contactData.mobilePhone || Object.keys(addressData).length > 0)
          ? {
              create: {
                email: contactData.email || null,
                mobilePhone: contactData.phone || contactData.mobilePhone || null,
                homePhone: contactData.homePhone || null,
                workPhone: contactData.workPhone || null,
                addressLine1: addressData.street || null,
                addressLine2: addressData.street2 || null,
                city: addressData.city || null,
                state: addressData.state || null,
                zipCode: addressData.zip || null,
                country: addressData.country || 'US',
                isPrimary: true,
              },
            }
          : undefined,
        emergencyContacts: Object.keys(emergencyContactData).length > 0
          ? {
              create: {
                name: emergencyContactData.name || 'Unknown',
                phone: emergencyContactData.phone || '',
                relationship: emergencyContactData.relationship || 'Other',
                isPrimary: true,
              },
            }
          : undefined,
        insurances: Object.keys(insuranceData).length > 0
          ? {
              create: {
                type: 'PRIMARY',
                payerName: insuranceData.provider || '',
                policyNumber: insuranceData.policyNumber || '',
                groupNumber: insuranceData.groupNumber || null,
                subscriberFirstName: insuranceData.subscriberFirstName || null,
                subscriberLastName: insuranceData.subscriberLastName || null,
                subscriberDob: insuranceData.subscriberDOB
                  ? new Date(insuranceData.subscriberDOB)
                  : null,
                subscriberRelationship: (insuranceData.relationship as 'SELF' | 'SPOUSE' | 'CHILD' | 'OTHER') || 'SELF',
              },
            }
          : undefined,
      },
    });

    patientId = patient.id;
    created = true;

    // Link submission to patient
    await prisma.formSubmission.update({
      where: { id: submissionId },
      data: { patientId: patient.id },
    });
  } else {
    // Update existing patient
    patientId = preview.patientId!;

    // Update demographics
    if (Object.keys(demographicsData).length > 0) {
      await prisma.patientDemographics.update({
        where: { patientId },
        data: demographicsData as Prisma.PatientDemographicsUpdateInput,
      });
    }

    // Update or create contact
    if (Object.keys(contactData).length > 0 || Object.keys(addressData).length > 0) {
      const existingContact = await prisma.patientContact.findFirst({
        where: { patientId, isPrimary: true },
      });

      const contactUpdateData: Prisma.PatientContactUpdateInput = {};
      if (contactData.email) contactUpdateData.email = contactData.email;
      if (contactData.phone || contactData.mobilePhone) contactUpdateData.mobilePhone = contactData.phone || contactData.mobilePhone;
      if (contactData.homePhone) contactUpdateData.homePhone = contactData.homePhone;
      if (contactData.workPhone) contactUpdateData.workPhone = contactData.workPhone;
      if (addressData.street) contactUpdateData.addressLine1 = addressData.street;
      if (addressData.street2) contactUpdateData.addressLine2 = addressData.street2;
      if (addressData.city) contactUpdateData.city = addressData.city;
      if (addressData.state) contactUpdateData.state = addressData.state;
      if (addressData.zip) contactUpdateData.zipCode = addressData.zip;
      if (addressData.country) contactUpdateData.country = addressData.country;

      if (existingContact) {
        await prisma.patientContact.update({
          where: { id: existingContact.id },
          data: contactUpdateData,
        });
      } else {
        await prisma.patientContact.create({
          data: {
            patientId,
            email: contactData.email || null,
            mobilePhone: contactData.phone || contactData.mobilePhone || null,
            homePhone: contactData.homePhone || null,
            workPhone: contactData.workPhone || null,
            addressLine1: addressData.street || null,
            addressLine2: addressData.street2 || null,
            city: addressData.city || null,
            state: addressData.state || null,
            zipCode: addressData.zip || null,
            country: addressData.country || 'US',
            isPrimary: true,
          },
        });
      }
    }

    // Update or create emergency contact
    if (Object.keys(emergencyContactData).length > 0) {
      const existingEmergencyContact = await prisma.emergencyContact.findFirst({
        where: { patientId, isPrimary: true },
      });

      if (existingEmergencyContact) {
        await prisma.emergencyContact.update({
          where: { id: existingEmergencyContact.id },
          data: {
            name: emergencyContactData.name || existingEmergencyContact.name,
            phone: emergencyContactData.phone || existingEmergencyContact.phone,
            relationship: emergencyContactData.relationship || existingEmergencyContact.relationship,
          },
        });
      } else {
        await prisma.emergencyContact.create({
          data: {
            patientId,
            name: emergencyContactData.name || 'Unknown',
            phone: emergencyContactData.phone || '',
            relationship: emergencyContactData.relationship || 'Other',
            isPrimary: true,
          },
        });
      }
    }

    // Update or create insurance
    if (Object.keys(insuranceData).length > 0) {
      const existingInsurance = await prisma.patientInsurance.findFirst({
        where: { patientId, type: 'PRIMARY' },
      });

      if (existingInsurance) {
        const insUpdateData: Prisma.PatientInsuranceUpdateInput = {};
        if (insuranceData.provider) insUpdateData.payerName = insuranceData.provider;
        if (insuranceData.policyNumber) insUpdateData.policyNumber = insuranceData.policyNumber;
        if (insuranceData.groupNumber) insUpdateData.groupNumber = insuranceData.groupNumber;
        if (insuranceData.subscriberFirstName) insUpdateData.subscriberFirstName = insuranceData.subscriberFirstName;
        if (insuranceData.subscriberLastName) insUpdateData.subscriberLastName = insuranceData.subscriberLastName;
        if (insuranceData.subscriberDOB) insUpdateData.subscriberDob = new Date(insuranceData.subscriberDOB);
        if (insuranceData.relationship) insUpdateData.subscriberRelationship = insuranceData.relationship as 'SELF' | 'SPOUSE' | 'CHILD' | 'OTHER';

        await prisma.patientInsurance.update({
          where: { id: existingInsurance.id },
          data: insUpdateData,
        });
      } else {
        await prisma.patientInsurance.create({
          data: {
            patientId,
            type: 'PRIMARY',
            payerName: insuranceData.provider || '',
            policyNumber: insuranceData.policyNumber || '',
            groupNumber: insuranceData.groupNumber || null,
            subscriberFirstName: insuranceData.subscriberFirstName || null,
            subscriberLastName: insuranceData.subscriberLastName || null,
            subscriberDob: insuranceData.subscriberDOB
              ? new Date(insuranceData.subscriberDOB)
              : null,
            subscriberRelationship: (insuranceData.relationship as 'SELF' | 'SPOUSE' | 'CHILD' | 'OTHER') || 'SELF',
          },
        });
      }
    }
  }

  return { patientId, created };
}
