import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { Prisma } from '@prisma/client';
import type { PatientStatus, Gender, ContactPreference } from '@prisma/client';

// Validation schemas
const genderSchema = z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY']);
const patientStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'DECEASED']);
const contactPreferenceSchema = z.enum(['EMAIL', 'PHONE', 'SMS', 'MAIL']);

const demographicsInputSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  preferredName: z.string().optional(),
  dateOfBirth: z.coerce.date(),
  gender: genderSchema.optional(),
  pronouns: z.string().optional(),
  ssn: z.string().optional(), // Will be encrypted before storage
  language: z.string().default('en'),
  ethnicity: z.string().optional(),
  race: z.string().optional(),
  maritalStatus: z.string().optional(),
  occupation: z.string().optional(),
  employer: z.string().optional(),
  notes: z.string().optional(),
});

const contactInputSchema = z.object({
  isPrimary: z.boolean().default(false),
  contactPreference: contactPreferenceSchema.default('PHONE'),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().default('US'),
  homePhone: z.string().optional(),
  mobilePhone: z.string().optional(),
  workPhone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  allowSms: z.boolean().default(true),
  allowEmail: z.boolean().default(true),
  allowVoicemail: z.boolean().default(true),
});

const emergencyContactInputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  relationship: z.string().min(1, 'Relationship is required'),
  phone: z.string().min(1, 'Phone is required'),
  altPhone: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

// Helper to generate MRN
function generateMRN(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `P${timestamp}${random}`;
}

// Helper to compute Soundex code for phonetic matching
function soundex(str: string): string {
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';

  const codes: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };

  let result = s[0];
  let prevCode = codes[s[0]] || '';

  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = codes[s[i]] || '';
    if (code && code !== prevCode) {
      result += code;
    }
    prevCode = code || prevCode;
  }

  return result.padEnd(4, '0');
}

// Helper to mask SSN (show only last 4)
function extractSSNLast4(ssn: string | null | undefined): string | null {
  if (!ssn) return null;
  const cleaned = ssn.replace(/\D/g, '');
  return cleaned.length >= 4 ? cleaned.slice(-4) : null;
}

export const patientRouter = router({
  // List patients with pagination and filters
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: patientStatusSchema.optional(),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
        sortBy: z.enum(['name', 'mrn', 'dateOfBirth', 'createdAt']).default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { search, status, limit = 25, offset = 0, sortBy = 'createdAt', sortOrder = 'desc' } = input ?? {};

      // Build where clause
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (status) {
        where.status = status;
      } else {
        // Default to not showing archived
        where.status = { not: 'ARCHIVED' };
      }

      // Search across multiple fields
      if (search) {
        where.OR = [
          { mrn: { contains: search, mode: 'insensitive' } },
          {
            demographics: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { preferredName: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
          {
            contacts: {
              some: {
                OR: [
                  { email: { contains: search, mode: 'insensitive' } },
                  { mobilePhone: { contains: search, mode: 'insensitive' } },
                  { homePhone: { contains: search, mode: 'insensitive' } },
                ],
              },
            },
          },
        ];
      }

      // Build orderBy
      let orderBy: Record<string, unknown> = {};
      if (sortBy === 'name') {
        orderBy = { demographics: { lastName: sortOrder } };
      } else if (sortBy === 'dateOfBirth') {
        orderBy = { demographics: { dateOfBirth: sortOrder } };
      } else {
        orderBy = { [sortBy]: sortOrder };
      }

      const [patients, total] = await Promise.all([
        ctx.prisma.patient.findMany({
          where,
          orderBy,
          take: limit,
          skip: offset,
          include: {
            demographics: {
              select: {
                firstName: true,
                lastName: true,
                preferredName: true,
                dateOfBirth: true,
                gender: true,
              },
            },
            contacts: {
              where: { isPrimary: true },
              take: 1,
              select: {
                mobilePhone: true,
                homePhone: true,
                email: true,
              },
            },
          },
        }),
        ctx.prisma.patient.count({ where }),
      ]);

      return {
        patients: patients.map((p) => ({
          id: p.id,
          mrn: p.mrn,
          status: p.status,
          firstName: p.demographics?.firstName ?? '',
          lastName: p.demographics?.lastName ?? '',
          preferredName: p.demographics?.preferredName,
          dateOfBirth: p.demographics?.dateOfBirth,
          gender: p.demographics?.gender,
          phone: p.contacts[0]?.mobilePhone ?? p.contacts[0]?.homePhone ?? null,
          email: p.contacts[0]?.email ?? null,
          createdAt: p.createdAt,
        })),
        total,
        limit,
        offset,
        hasMore: offset + patients.length < total,
      };
    }),

  // Get single patient with all details
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          contacts: {
            orderBy: { isPrimary: 'desc' },
          },
          emergencyContacts: {
            orderBy: { isPrimary: 'desc' },
          },
          insurances: {
            orderBy: [{ type: 'asc' }, { isActive: 'desc' }],
          },
          documents: {
            orderBy: { uploadedAt: 'desc' },
            take: 10,
          },
          householdMembers: {
            include: {
              household: {
                include: {
                  members: {
                    include: {
                      patient: {
                        include: {
                          demographics: {
                            select: {
                              firstName: true,
                              lastName: true,
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
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Log view action
      await auditLog('PATIENT_VIEW', 'Patient', {
        entityId: patient.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Mask SSN in response
      return {
        ...patient,
        demographics: patient.demographics
          ? {
              ...patient.demographics,
              ssn: null, // Never return full SSN
            }
          : null,
      };
    }),

  // Create new patient
  create: protectedProcedure
    .input(
      z.object({
        demographics: demographicsInputSchema,
        contact: contactInputSchema.optional(),
        emergencyContact: emergencyContactInputSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { demographics, contact, emergencyContact } = input;

      // Generate unique MRN
      let mrn = generateMRN();
      let attempts = 0;
      while (attempts < 10) {
        const existing = await ctx.prisma.patient.findUnique({
          where: { mrn_organizationId: { mrn, organizationId: ctx.user.organizationId } },
        });
        if (!existing) break;
        mrn = generateMRN();
        attempts++;
      }

      // Compute Soundex codes for phonetic search
      const firstNameSoundex = soundex(demographics.firstName);
      const lastNameSoundex = soundex(demographics.lastName);

      // Create patient with demographics
      const patient = await ctx.prisma.patient.create({
        data: {
          mrn,
          status: 'ACTIVE',
          organizationId: ctx.user.organizationId,
          demographics: {
            create: {
              ...demographics,
              ssn: demographics.ssn ?? null, // In production, encrypt this
              ssnLast4: extractSSNLast4(demographics.ssn),
              firstNameSoundex,
              lastNameSoundex,
            },
          },
          ...(contact && {
            contacts: {
              create: {
                ...contact,
                isPrimary: true,
                email: contact.email || null,
              },
            },
          }),
          ...(emergencyContact && {
            emergencyContacts: {
              create: {
                ...emergencyContact,
                isPrimary: true,
              },
            },
          }),
        },
        include: {
          demographics: true,
          contacts: true,
          emergencyContacts: true,
        },
      });

      // Log creation
      await auditLog('PATIENT_CREATE', 'Patient', {
        entityId: patient.id,
        changes: { mrn, firstName: demographics.firstName, lastName: demographics.lastName },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        ...patient,
        demographics: patient.demographics
          ? { ...patient.demographics, ssn: null }
          : null,
      };
    }),

  // Update patient demographics
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        demographics: demographicsInputSchema.partial().optional(),
        status: patientStatusSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, demographics, status } = input;

      // Verify patient exists and belongs to org
      const existing = await ctx.prisma.patient.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
        include: { demographics: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Prepare demographics update
      const demographicsUpdate = demographics
        ? {
            ...demographics,
            ...(demographics.ssn !== undefined && {
              ssnLast4: extractSSNLast4(demographics.ssn),
            }),
            ...(demographics.firstName && {
              firstNameSoundex: soundex(demographics.firstName),
            }),
            ...(demographics.lastName && {
              lastNameSoundex: soundex(demographics.lastName),
            }),
          }
        : undefined;

      // Update patient
      const patient = await ctx.prisma.patient.update({
        where: { id },
        data: {
          ...(status && { status }),
          ...(demographicsUpdate && {
            demographics: {
              update: demographicsUpdate,
            },
          }),
        },
        include: {
          demographics: true,
          contacts: true,
        },
      });

      // Log update
      await auditLog('PATIENT_UPDATE', 'Patient', {
        entityId: patient.id,
        changes: { demographics, status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        ...patient,
        demographics: patient.demographics
          ? { ...patient.demographics, ssn: null }
          : null,
      };
    }),

  // Archive patient (soft delete)
  archive: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, reason } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      if (patient.status === 'ARCHIVED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Patient is already archived',
        });
      }

      const updated = await ctx.prisma.patient.update({
        where: { id },
        data: {
          status: 'ARCHIVED',
          archivedAt: new Date(),
        },
      });

      // Log archive
      await auditLog('PATIENT_DELETE', 'Patient', {
        entityId: id,
        changes: { reason, previousStatus: patient.status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Restore archived patient
  restore: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      if (patient.status !== 'ARCHIVED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Patient is not archived',
        });
      }

      const updated = await ctx.prisma.patient.update({
        where: { id: input.id },
        data: {
          status: 'ACTIVE',
          archivedAt: null,
        },
      });

      // Log restore
      await auditLog('PATIENT_UPDATE', 'Patient', {
        entityId: input.id,
        changes: { action: 'restored' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Add/update contact
  addContact: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        contact: contactInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, contact } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // If this is primary, unset other primary contacts
      if (contact.isPrimary) {
        await ctx.prisma.patientContact.updateMany({
          where: { patientId },
          data: { isPrimary: false },
        });
      }

      const newContact = await ctx.prisma.patientContact.create({
        data: {
          ...contact,
          email: contact.email || null,
          patientId,
        },
      });

      return newContact;
    }),

  // Add emergency contact
  addEmergencyContact: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        emergencyContact: emergencyContactInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, emergencyContact } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // If this is primary, unset other primary emergency contacts
      if (emergencyContact.isPrimary) {
        await ctx.prisma.emergencyContact.updateMany({
          where: { patientId },
          data: { isPrimary: false },
        });
      }

      const newContact = await ctx.prisma.emergencyContact.create({
        data: {
          ...emergencyContact,
          patientId,
        },
      });

      return newContact;
    }),

  // Add/update insurance
  addInsurance: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        insurance: z.object({
          type: z.enum(['PRIMARY', 'SECONDARY', 'TERTIARY']).default('PRIMARY'),
          payerName: z.string().min(1, 'Payer name is required'),
          payerId: z.string().optional(),
          planName: z.string().optional(),
          planType: z.string().optional(),
          policyNumber: z.string().min(1, 'Policy number is required'),
          groupNumber: z.string().optional(),
          subscriberRelationship: z.enum(['SELF', 'SPOUSE', 'CHILD', 'OTHER']).default('SELF'),
          subscriberId: z.string().optional(),
          subscriberFirstName: z.string().optional(),
          subscriberLastName: z.string().optional(),
          subscriberDob: z.coerce.date().optional(),
          effectiveDate: z.coerce.date().optional(),
          terminationDate: z.coerce.date().optional(),
          copay: z.number().optional(),
          deductible: z.number().optional(),
          deductibleMet: z.number().optional(),
          outOfPocketMax: z.number().optional(),
          outOfPocketMet: z.number().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, insurance } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check for existing insurance of same type
      const existingOfType = await ctx.prisma.patientInsurance.findFirst({
        where: { patientId, type: insurance.type, isActive: true },
      });

      // If there's an existing active insurance of this type, deactivate it
      if (existingOfType) {
        await ctx.prisma.patientInsurance.update({
          where: { id: existingOfType.id },
          data: { isActive: false },
        });
      }

      const newInsurance = await ctx.prisma.patientInsurance.create({
        data: {
          ...insurance,
          isActive: true,
          patientId,
        },
      });

      // Log insurance addition
      await auditLog('PATIENT_UPDATE', 'PatientInsurance', {
        entityId: newInsurance.id,
        changes: { action: 'insurance_added', type: insurance.type },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return newInsurance;
    }),

  // Update insurance
  updateInsurance: protectedProcedure
    .input(
      z.object({
        insuranceId: z.string(),
        updates: z.object({
          payerName: z.string().optional(),
          payerId: z.string().optional(),
          planName: z.string().optional(),
          planType: z.string().optional(),
          policyNumber: z.string().optional(),
          groupNumber: z.string().optional(),
          subscriberRelationship: z.enum(['SELF', 'SPOUSE', 'CHILD', 'OTHER']).optional(),
          subscriberId: z.string().optional(),
          subscriberFirstName: z.string().optional(),
          subscriberLastName: z.string().optional(),
          subscriberDob: z.coerce.date().optional(),
          effectiveDate: z.coerce.date().optional(),
          terminationDate: z.coerce.date().optional(),
          copay: z.number().optional(),
          deductible: z.number().optional(),
          deductibleMet: z.number().optional(),
          outOfPocketMax: z.number().optional(),
          outOfPocketMet: z.number().optional(),
          isActive: z.boolean().optional(),
          verifiedAt: z.coerce.date().optional(),
          verifiedBy: z.string().optional(),
          verificationNotes: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { insuranceId, updates } = input;

      // Verify insurance belongs to a patient in this org
      const insurance = await ctx.prisma.patientInsurance.findFirst({
        where: {
          id: insuranceId,
          patient: { organizationId: ctx.user.organizationId },
        },
      });

      if (!insurance) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insurance not found',
        });
      }

      const updatedInsurance = await ctx.prisma.patientInsurance.update({
        where: { id: insuranceId },
        data: updates,
      });

      return updatedInsurance;
    }),

  // Delete (deactivate) insurance
  removeInsurance: protectedProcedure
    .input(z.object({ insuranceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const insurance = await ctx.prisma.patientInsurance.findFirst({
        where: {
          id: input.insuranceId,
          patient: { organizationId: ctx.user.organizationId },
        },
      });

      if (!insurance) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insurance not found',
        });
      }

      // Soft delete by setting isActive to false
      const updated = await ctx.prisma.patientInsurance.update({
        where: { id: input.insuranceId },
        data: { isActive: false },
      });

      // Log removal
      await auditLog('PATIENT_UPDATE', 'PatientInsurance', {
        entityId: input.insuranceId,
        changes: { action: 'insurance_removed' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Verify insurance
  verifyInsurance: protectedProcedure
    .input(
      z.object({
        insuranceId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { insuranceId, notes } = input;

      const insurance = await ctx.prisma.patientInsurance.findFirst({
        where: {
          id: insuranceId,
          patient: { organizationId: ctx.user.organizationId },
        },
      });

      if (!insurance) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insurance not found',
        });
      }

      const updated = await ctx.prisma.patientInsurance.update({
        where: { id: insuranceId },
        data: {
          verifiedAt: new Date(),
          verifiedBy: ctx.user.id,
          verificationNotes: notes,
        },
      });

      return updated;
    }),

  // ============================================
  // HOUSEHOLD / FAMILY LINKING
  // ============================================

  // Create a new household with an initial patient
  createHousehold: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        householdName: z.string().optional(),
        relationship: z.enum(['SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'GUARDIAN', 'OTHER']),
        isHeadOfHouse: z.boolean().default(true),
        isGuarantor: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, householdName, relationship, isHeadOfHouse, isGuarantor } = input;

      // Verify patient exists and belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
        include: { demographics: true },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check if patient is already in a household
      const existingMembership = await ctx.prisma.householdMember.findFirst({
        where: { patientId },
      });

      if (existingMembership) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Patient is already part of a household',
        });
      }

      // Create household and add patient as member
      const household = await ctx.prisma.household.create({
        data: {
          name: householdName || `${patient.demographics?.lastName || 'New'} Household`,
          organizationId: ctx.user.organizationId,
          members: {
            create: {
              patientId,
              relationship,
              isHeadOfHouse,
              isGuarantor,
            },
          },
        },
        include: {
          members: {
            include: {
              patient: {
                include: { demographics: true },
              },
            },
          },
        },
      });

      return household;
    }),

  // Add existing patient to household
  addToHousehold: protectedProcedure
    .input(
      z.object({
        householdId: z.string(),
        patientId: z.string(),
        relationship: z.enum(['SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'GUARDIAN', 'OTHER']),
        isHeadOfHouse: z.boolean().default(false),
        isGuarantor: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { householdId, patientId, relationship, isHeadOfHouse, isGuarantor } = input;

      // Verify household exists and belongs to org
      const household = await ctx.prisma.household.findFirst({
        where: { id: householdId, organizationId: ctx.user.organizationId },
      });

      if (!household) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Household not found',
        });
      }

      // Verify patient exists and belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check if patient is already in a household
      const existingMembership = await ctx.prisma.householdMember.findFirst({
        where: { patientId },
      });

      if (existingMembership) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Patient is already part of a household',
        });
      }

      // If making this person head of house, unset others
      if (isHeadOfHouse) {
        await ctx.prisma.householdMember.updateMany({
          where: { householdId },
          data: { isHeadOfHouse: false },
        });
      }

      // If making this person guarantor, unset others
      if (isGuarantor) {
        await ctx.prisma.householdMember.updateMany({
          where: { householdId },
          data: { isGuarantor: false },
        });
      }

      // Add patient to household
      const member = await ctx.prisma.householdMember.create({
        data: {
          householdId,
          patientId,
          relationship,
          isHeadOfHouse,
          isGuarantor,
        },
        include: {
          patient: {
            include: { demographics: true },
          },
        },
      });

      return member;
    }),

  // Get household for a patient
  getHousehold: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await ctx.prisma.householdMember.findFirst({
        where: {
          patientId: input.patientId,
          patient: { organizationId: ctx.user.organizationId },
        },
        include: {
          household: {
            include: {
              members: {
                include: {
                  patient: {
                    include: {
                      demographics: {
                        select: {
                          firstName: true,
                          lastName: true,
                          preferredName: true,
                          dateOfBirth: true,
                        },
                      },
                    },
                  },
                },
                orderBy: { isHeadOfHouse: 'desc' },
              },
            },
          },
        },
      });

      return membership?.household ?? null;
    }),

  // Update household member
  updateHouseholdMember: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
        relationship: z.enum(['SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'GUARDIAN', 'OTHER']).optional(),
        isHeadOfHouse: z.boolean().optional(),
        isGuarantor: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { memberId, ...updates } = input;

      // Verify member exists and belongs to org
      const member = await ctx.prisma.householdMember.findFirst({
        where: {
          id: memberId,
          household: { organizationId: ctx.user.organizationId },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Household member not found',
        });
      }

      // If making this person head of house, unset others
      if (updates.isHeadOfHouse) {
        await ctx.prisma.householdMember.updateMany({
          where: { householdId: member.householdId, id: { not: memberId } },
          data: { isHeadOfHouse: false },
        });
      }

      // If making this person guarantor, unset others
      if (updates.isGuarantor) {
        await ctx.prisma.householdMember.updateMany({
          where: { householdId: member.householdId, id: { not: memberId } },
          data: { isGuarantor: false },
        });
      }

      const updated = await ctx.prisma.householdMember.update({
        where: { id: memberId },
        data: updates,
      });

      return updated;
    }),

  // Remove patient from household
  removeFromHousehold: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.prisma.householdMember.findFirst({
        where: {
          id: input.memberId,
          household: { organizationId: ctx.user.organizationId },
        },
        include: { household: { include: { members: true } } },
      });

      if (!member) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Household member not found',
        });
      }

      await ctx.prisma.householdMember.delete({
        where: { id: input.memberId },
      });

      // If this was the last member, delete the household
      if (member.household.members.length === 1) {
        await ctx.prisma.household.delete({
          where: { id: member.householdId },
        });
      }

      return { success: true };
    }),

  // Search patients to add as family member
  searchForFamilyMember: protectedProcedure
    .input(
      z.object({
        search: z.string().min(1),
        excludePatientId: z.string().optional(),
        excludeHouseholdId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { search, excludePatientId, excludeHouseholdId } = input;

      // Get patients already in the household to exclude
      let excludePatientIds: string[] = excludePatientId ? [excludePatientId] : [];

      if (excludeHouseholdId) {
        const householdMembers = await ctx.prisma.householdMember.findMany({
          where: { householdId: excludeHouseholdId },
          select: { patientId: true },
        });
        excludePatientIds = [
          ...excludePatientIds,
          ...householdMembers.map((m) => m.patientId),
        ];
      }

      const patients = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { not: 'ARCHIVED' },
          id: { notIn: excludePatientIds },
          OR: [
            { mrn: { contains: search, mode: 'insensitive' } },
            {
              demographics: {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                ],
              },
            },
          ],
        },
        take: 10,
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
            },
          },
        },
      });

      return patients.map((p) => ({
        id: p.id,
        mrn: p.mrn,
        firstName: p.demographics?.firstName ?? '',
        lastName: p.demographics?.lastName ?? '',
        dateOfBirth: p.demographics?.dateOfBirth,
      }));
    }),

  // ============================================
  // DOCUMENT MANAGEMENT
  // ============================================

  // List documents for a patient
  listDocuments: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        type: z.enum([
          'INSURANCE_CARD_FRONT',
          'INSURANCE_CARD_BACK',
          'PHOTO_ID',
          'CONSENT_FORM',
          'INTAKE_FORM',
          'CLINICAL_NOTE',
          'LAB_RESULT',
          'IMAGING',
          'REFERRAL',
          'OTHER',
        ]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, type, limit, offset } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Record<string, unknown> = { patientId };
      if (type) {
        where.type = type;
      }

      const [documents, total] = await Promise.all([
        ctx.prisma.patientDocument.findMany({
          where,
          orderBy: { uploadedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.patientDocument.count({ where }),
      ]);

      // Log document list view
      await auditLog('DOCUMENT_LIST', 'PatientDocument', {
        entityId: patientId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        documents,
        total,
        hasMore: offset + documents.length < total,
      };
    }),

  // Get single document
  getDocument: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const document = await ctx.prisma.patientDocument.findFirst({
        where: {
          id: input.documentId,
          patient: { organizationId: ctx.user.organizationId },
        },
        include: {
          patient: {
            select: { id: true, mrn: true },
          },
        },
      });

      if (!document) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      // Check access for confidential documents
      if (document.isConfidential) {
        const allowedRoles = ['OWNER', 'ADMIN', 'PROVIDER'];
        if (!allowedRoles.includes(ctx.user.role)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to view this confidential document',
          });
        }
      }

      // Log document view
      await auditLog('DOCUMENT_VIEW', 'PatientDocument', {
        entityId: document.id,
        changes: { fileName: document.fileName, type: document.type },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return document;
    }),

  // Create document record (called after file upload)
  createDocument: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        type: z.enum([
          'INSURANCE_CARD_FRONT',
          'INSURANCE_CARD_BACK',
          'PHOTO_ID',
          'CONSENT_FORM',
          'INTAKE_FORM',
          'CLINICAL_NOTE',
          'LAB_RESULT',
          'IMAGING',
          'REFERRAL',
          'OTHER',
        ]),
        fileName: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        storageKey: z.string(),
        description: z.string().optional(),
        isConfidential: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, ...documentData } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const document = await ctx.prisma.patientDocument.create({
        data: {
          ...documentData,
          patientId,
          uploadedById: ctx.user.id,
        },
      });

      // Log document creation
      await auditLog('DOCUMENT_CREATE', 'PatientDocument', {
        entityId: document.id,
        changes: { fileName: document.fileName, type: document.type },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return document;
    }),

  // Update document metadata
  updateDocument: protectedProcedure
    .input(
      z.object({
        documentId: z.string(),
        type: z.enum([
          'INSURANCE_CARD_FRONT',
          'INSURANCE_CARD_BACK',
          'PHOTO_ID',
          'CONSENT_FORM',
          'INTAKE_FORM',
          'CLINICAL_NOTE',
          'LAB_RESULT',
          'IMAGING',
          'REFERRAL',
          'OTHER',
        ]).optional(),
        description: z.string().optional(),
        isConfidential: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { documentId, ...updates } = input;

      const document = await ctx.prisma.patientDocument.findFirst({
        where: {
          id: documentId,
          patient: { organizationId: ctx.user.organizationId },
        },
      });

      if (!document) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      const updated = await ctx.prisma.patientDocument.update({
        where: { id: documentId },
        data: updates,
      });

      // Log document update
      await auditLog('DOCUMENT_UPDATE', 'PatientDocument', {
        entityId: documentId,
        changes: updates,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Delete document (soft delete by removing from DB, file remains for audit)
  deleteDocument: adminProcedure
    .input(z.object({ documentId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { documentId, reason } = input;

      const document = await ctx.prisma.patientDocument.findFirst({
        where: {
          id: documentId,
          patient: { organizationId: ctx.user.organizationId },
        },
      });

      if (!document) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      // Log before deletion for audit trail
      await auditLog('DOCUMENT_DELETE', 'PatientDocument', {
        entityId: documentId,
        changes: {
          fileName: document.fileName,
          type: document.type,
          reason,
          storageKey: document.storageKey, // Keep for recovery if needed
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Delete the document record (file remains in storage for audit)
      await ctx.prisma.patientDocument.delete({
        where: { id: documentId },
      });

      return { success: true };
    }),

  // ============================================
  // ENHANCED PATIENT SEARCH (US-019)
  // ============================================

  // Advanced search with fuzzy matching and phonetic search
  searchAdvanced: protectedProcedure
    .input(
      z.object({
        query: z.string().optional(),
        filters: z.object({
          status: patientStatusSchema.optional(),
          insuranceType: z.string().optional(),
          hasInsurance: z.boolean().optional(),
          dateOfBirthFrom: z.coerce.date().optional(),
          dateOfBirthTo: z.coerce.date().optional(),
        }).optional(),
        useFuzzy: z.boolean().default(true),
        usePhonetic: z.boolean().default(true),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, filters, useFuzzy, usePhonetic, limit, offset } = input;

      // Build base where clause
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      // Apply status filter
      if (filters?.status) {
        where.status = filters.status;
      } else {
        where.status = { not: 'ARCHIVED' };
      }

      // Apply date of birth range filter
      if (filters?.dateOfBirthFrom || filters?.dateOfBirthTo) {
        where.demographics = {
          ...((where.demographics as Record<string, unknown>) || {}),
          dateOfBirth: {
            ...(filters.dateOfBirthFrom && { gte: filters.dateOfBirthFrom }),
            ...(filters.dateOfBirthTo && { lte: filters.dateOfBirthTo }),
          },
        };
      }

      // Apply insurance filter
      if (filters?.hasInsurance !== undefined) {
        if (filters.hasInsurance) {
          where.insurances = { some: { isActive: true } };
        } else {
          where.insurances = { none: { isActive: true } };
        }
      }

      if (filters?.insuranceType) {
        where.insurances = {
          some: {
            payerName: { contains: filters.insuranceType, mode: 'insensitive' },
            isActive: true,
          },
        };
      }

      // Apply search query
      if (query && query.trim()) {
        const searchTerms = query.trim();
        const orConditions: Record<string, unknown>[] = [];

        // Exact/contains matches
        orConditions.push(
          { mrn: { contains: searchTerms, mode: 'insensitive' } },
          {
            demographics: {
              OR: [
                { firstName: { contains: searchTerms, mode: 'insensitive' } },
                { lastName: { contains: searchTerms, mode: 'insensitive' } },
                { preferredName: { contains: searchTerms, mode: 'insensitive' } },
                { ssnLast4: { contains: searchTerms } },
              ],
            },
          },
          {
            contacts: {
              some: {
                OR: [
                  { email: { contains: searchTerms, mode: 'insensitive' } },
                  { mobilePhone: { contains: searchTerms } },
                  { homePhone: { contains: searchTerms } },
                  { workPhone: { contains: searchTerms } },
                ],
              },
            },
          }
        );

        // Phonetic search (Soundex)
        if (usePhonetic) {
          const searchSoundex = soundex(searchTerms);
          if (searchSoundex) {
            orConditions.push(
              {
                demographics: {
                  OR: [
                    { firstNameSoundex: searchSoundex },
                    { lastNameSoundex: searchSoundex },
                  ],
                },
              }
            );
          }
        }

        // Check if query looks like a date (for DOB search)
        const dateMatch = searchTerms.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
        if (dateMatch) {
          try {
            const [, month, day, year] = dateMatch;
            const fullYear = year.length === 2 ? (parseInt(year) > 50 ? `19${year}` : `20${year}`) : year;
            const searchDate = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
            if (!isNaN(searchDate.getTime())) {
              // Search within a day range
              const nextDay = new Date(searchDate);
              nextDay.setDate(nextDay.getDate() + 1);
              orConditions.push({
                demographics: {
                  dateOfBirth: {
                    gte: searchDate,
                    lt: nextDay,
                  },
                },
              });
            }
          } catch {
            // Invalid date, ignore
          }
        }

        where.OR = orConditions;
      }

      const [patients, total] = await Promise.all([
        ctx.prisma.patient.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            demographics: {
              select: {
                firstName: true,
                lastName: true,
                preferredName: true,
                dateOfBirth: true,
                gender: true,
                firstNameSoundex: true,
                lastNameSoundex: true,
              },
            },
            contacts: {
              where: { isPrimary: true },
              take: 1,
              select: {
                mobilePhone: true,
                homePhone: true,
                email: true,
              },
            },
            insurances: {
              where: { isActive: true },
              take: 1,
              select: {
                type: true,
                payerName: true,
              },
            },
          },
        }),
        ctx.prisma.patient.count({ where }),
      ]);

      // Calculate relevance scores for fuzzy matching
      const results = patients.map((p) => {
        let relevanceScore = 0;
        const firstName = p.demographics?.firstName?.toLowerCase() ?? '';
        const lastName = p.demographics?.lastName?.toLowerCase() ?? '';
        const searchLower = query?.toLowerCase() ?? '';

        if (searchLower) {
          // Exact match gets highest score
          if (firstName === searchLower || lastName === searchLower) {
            relevanceScore = 100;
          }
          // Starts with gets high score
          else if (firstName.startsWith(searchLower) || lastName.startsWith(searchLower)) {
            relevanceScore = 80;
          }
          // Contains gets medium score
          else if (firstName.includes(searchLower) || lastName.includes(searchLower)) {
            relevanceScore = 60;
          }
          // MRN match
          else if (p.mrn.toLowerCase().includes(searchLower)) {
            relevanceScore = 70;
          }
          // Soundex match gets lower score
          else if (
            p.demographics?.firstNameSoundex === soundex(query ?? '') ||
            p.demographics?.lastNameSoundex === soundex(query ?? '')
          ) {
            relevanceScore = 40;
          }
        }

        return {
          id: p.id,
          mrn: p.mrn,
          status: p.status,
          firstName: p.demographics?.firstName ?? '',
          lastName: p.demographics?.lastName ?? '',
          preferredName: p.demographics?.preferredName,
          dateOfBirth: p.demographics?.dateOfBirth,
          gender: p.demographics?.gender,
          phone: p.contacts[0]?.mobilePhone ?? p.contacts[0]?.homePhone ?? null,
          email: p.contacts[0]?.email ?? null,
          primaryInsurance: p.insurances[0]?.payerName ?? null,
          createdAt: p.createdAt,
          relevanceScore,
        };
      });

      // Sort by relevance if searching
      if (query) {
        results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      }

      return {
        patients: results,
        total,
        limit,
        offset,
        hasMore: offset + patients.length < total,
      };
    }),

  // Get recently viewed patients
  recentPatients: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      // Get recent patient view audit logs for this user
      const recentViews = await ctx.prisma.auditLog.findMany({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          action: 'PATIENT_VIEW',
          entityType: 'Patient',
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit * 2, // Get more to handle duplicates
        select: {
          entityId: true,
          createdAt: true,
        },
      });

      // Get unique patient IDs in order
      const seen = new Set<string>();
      const uniquePatientIds: string[] = [];
      for (const view of recentViews) {
        if (view.entityId && !seen.has(view.entityId)) {
          seen.add(view.entityId);
          uniquePatientIds.push(view.entityId);
          if (uniquePatientIds.length >= input.limit) break;
        }
      }

      if (uniquePatientIds.length === 0) {
        return [];
      }

      // Fetch patient details
      const patients = await ctx.prisma.patient.findMany({
        where: {
          id: { in: uniquePatientIds },
          organizationId: ctx.user.organizationId,
          status: { not: 'ARCHIVED' },
        },
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
              preferredName: true,
              dateOfBirth: true,
            },
          },
        },
      });

      // Sort by the order in uniquePatientIds
      const patientMap = new Map(patients.map((p) => [p.id, p]));
      return uniquePatientIds
        .map((id) => patientMap.get(id))
        .filter(Boolean)
        .map((p) => ({
          id: p!.id,
          mrn: p!.mrn,
          firstName: p!.demographics?.firstName ?? '',
          lastName: p!.demographics?.lastName ?? '',
          preferredName: p!.demographics?.preferredName,
          dateOfBirth: p!.demographics?.dateOfBirth,
        }));
    }),

  // ============================================
  // PATIENT MERGE / DEDUPLICATION (US-020)
  // ============================================

  // Find potential duplicate patients
  findDuplicates: adminProcedure
    .input(
      z.object({
        patientId: z.string().optional(), // Find duplicates for specific patient
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, limit } = input;

      if (patientId) {
        // Find duplicates for a specific patient
        const patient = await ctx.prisma.patient.findFirst({
          where: { id: patientId, organizationId: ctx.user.organizationId },
          include: {
            demographics: true,
            contacts: { where: { isPrimary: true }, take: 1 },
          },
        });

        if (!patient) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Patient not found',
          });
        }

        // Find patients with similar name, DOB, or phone
        const orConditions: Record<string, unknown>[] = [];

        if (patient.demographics) {
          // Similar first name (soundex)
          if (patient.demographics.firstNameSoundex) {
            orConditions.push({
              demographics: { firstNameSoundex: patient.demographics.firstNameSoundex },
            });
          }

          // Similar last name (soundex)
          if (patient.demographics.lastNameSoundex) {
            orConditions.push({
              demographics: { lastNameSoundex: patient.demographics.lastNameSoundex },
            });
          }

          // Same date of birth
          orConditions.push({
            demographics: { dateOfBirth: patient.demographics.dateOfBirth },
          });

          // Same exact name
          orConditions.push({
            demographics: {
              firstName: { equals: patient.demographics.firstName, mode: 'insensitive' },
              lastName: { equals: patient.demographics.lastName, mode: 'insensitive' },
            },
          });
        }

        // Same phone
        const phone = patient.contacts[0]?.mobilePhone ?? patient.contacts[0]?.homePhone;
        if (phone) {
          orConditions.push({
            contacts: {
              some: {
                OR: [
                  { mobilePhone: phone },
                  { homePhone: phone },
                ],
              },
            },
          });
        }

        const potentialDuplicates = await ctx.prisma.patient.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            id: { not: patientId },
            status: { not: 'ARCHIVED' },
            OR: orConditions,
          },
          include: {
            demographics: true,
            contacts: { where: { isPrimary: true }, take: 1 },
          },
          take: limit,
        });

        // Calculate similarity scores
        return potentialDuplicates.map((dup) => {
          let score = 0;
          const reasons: string[] = [];

          if (patient.demographics && dup.demographics) {
            // Same DOB = high score
            if (
              patient.demographics.dateOfBirth?.getTime() ===
              dup.demographics.dateOfBirth?.getTime()
            ) {
              score += 40;
              reasons.push('Same date of birth');
            }

            // Same first name = medium score
            if (
              patient.demographics.firstName?.toLowerCase() ===
              dup.demographics.firstName?.toLowerCase()
            ) {
              score += 25;
              reasons.push('Same first name');
            } else if (
              patient.demographics.firstNameSoundex === dup.demographics.firstNameSoundex
            ) {
              score += 10;
              reasons.push('Similar sounding first name');
            }

            // Same last name = medium-high score
            if (
              patient.demographics.lastName?.toLowerCase() ===
              dup.demographics.lastName?.toLowerCase()
            ) {
              score += 30;
              reasons.push('Same last name');
            } else if (
              patient.demographics.lastNameSoundex === dup.demographics.lastNameSoundex
            ) {
              score += 15;
              reasons.push('Similar sounding last name');
            }
          }

          // Same phone = high score
          const dupPhone = dup.contacts[0]?.mobilePhone ?? dup.contacts[0]?.homePhone;
          if (phone && dupPhone && phone === dupPhone) {
            score += 35;
            reasons.push('Same phone number');
          }

          return {
            patient: {
              id: dup.id,
              mrn: dup.mrn,
              firstName: dup.demographics?.firstName ?? '',
              lastName: dup.demographics?.lastName ?? '',
              dateOfBirth: dup.demographics?.dateOfBirth,
              phone: dupPhone,
            },
            similarityScore: Math.min(score, 100),
            reasons,
          };
        }).filter((d) => d.similarityScore >= 25) // Only return meaningful matches
          .sort((a, b) => b.similarityScore - a.similarityScore);
      } else {
        // Find all potential duplicates in the system
        // This is more complex - we'll look for patients with same DOB + similar names
        const patients = await ctx.prisma.patient.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            status: { not: 'ARCHIVED' },
          },
          include: {
            demographics: {
              select: {
                firstName: true,
                lastName: true,
                dateOfBirth: true,
                firstNameSoundex: true,
                lastNameSoundex: true,
              },
            },
            contacts: {
              where: { isPrimary: true },
              take: 1,
              select: { mobilePhone: true, homePhone: true },
            },
          },
        });

        // Group by potential duplicate keys
        const dobGroups = new Map<string, typeof patients>();
        const phoneGroups = new Map<string, typeof patients>();

        for (const p of patients) {
          // Group by DOB
          const dob = p.demographics?.dateOfBirth?.toISOString().split('T')[0];
          if (dob) {
            const group = dobGroups.get(dob) ?? [];
            group.push(p);
            dobGroups.set(dob, group);
          }

          // Group by phone
          const phone = p.contacts[0]?.mobilePhone ?? p.contacts[0]?.homePhone;
          if (phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            const group = phoneGroups.get(cleanPhone) ?? [];
            group.push(p);
            phoneGroups.set(cleanPhone, group);
          }
        }

        // Find groups with multiple patients
        const duplicateGroups: {
          patients: { id: string; mrn: string; firstName: string; lastName: string; dateOfBirth: Date | null; phone: string | null }[];
          reason: string;
        }[] = [];

        // Check DOB groups for name similarity
        for (const [dob, group] of dobGroups) {
          if (group.length >= 2) {
            // Check for similar names within the group
            for (let i = 0; i < group.length; i++) {
              for (let j = i + 1; j < group.length; j++) {
                const p1 = group[i];
                const p2 = group[j];

                // Check if names are similar
                const sameLastName =
                  p1.demographics?.lastName?.toLowerCase() ===
                  p2.demographics?.lastName?.toLowerCase();
                const similarLastName =
                  p1.demographics?.lastNameSoundex === p2.demographics?.lastNameSoundex;

                if (sameLastName || similarLastName) {
                  duplicateGroups.push({
                    patients: [p1, p2].map((p) => ({
                      id: p.id,
                      mrn: p.mrn,
                      firstName: p.demographics?.firstName ?? '',
                      lastName: p.demographics?.lastName ?? '',
                      dateOfBirth: p.demographics?.dateOfBirth ?? null,
                      phone: p.contacts[0]?.mobilePhone ?? p.contacts[0]?.homePhone ?? null,
                    })),
                    reason: `Same DOB (${dob}) and ${sameLastName ? 'same' : 'similar'} last name`,
                  });
                }
              }
            }
          }
        }

        // Check phone groups
        for (const [phone, group] of phoneGroups) {
          if (group.length >= 2) {
            duplicateGroups.push({
              patients: group.map((p) => ({
                id: p.id,
                mrn: p.mrn,
                firstName: p.demographics?.firstName ?? '',
                lastName: p.demographics?.lastName ?? '',
                dateOfBirth: p.demographics?.dateOfBirth ?? null,
                phone: p.contacts[0]?.mobilePhone ?? p.contacts[0]?.homePhone ?? null,
              })),
              reason: `Same phone number`,
            });
          }
        }

        return duplicateGroups.slice(0, limit);
      }
    }),

  // Get comparison data for two patients
  comparePatients: adminProcedure
    .input(z.object({ patientId1: z.string(), patientId2: z.string() }))
    .query(async ({ ctx, input }) => {
      const { patientId1, patientId2 } = input;

      const [patient1, patient2] = await Promise.all([
        ctx.prisma.patient.findFirst({
          where: { id: patientId1, organizationId: ctx.user.organizationId },
          include: {
            demographics: true,
            contacts: true,
            emergencyContacts: true,
            insurances: { where: { isActive: true } },
            documents: { select: { id: true, type: true, fileName: true } },
            householdMembers: true,
          },
        }),
        ctx.prisma.patient.findFirst({
          where: { id: patientId2, organizationId: ctx.user.organizationId },
          include: {
            demographics: true,
            contacts: true,
            emergencyContacts: true,
            insurances: { where: { isActive: true } },
            documents: { select: { id: true, type: true, fileName: true } },
            householdMembers: true,
          },
        }),
      ]);

      if (!patient1 || !patient2) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'One or both patients not found',
        });
      }

      return {
        patient1: {
          ...patient1,
          demographics: patient1.demographics
            ? { ...patient1.demographics, ssn: null }
            : null,
        },
        patient2: {
          ...patient2,
          demographics: patient2.demographics
            ? { ...patient2.demographics, ssn: null }
            : null,
        },
      };
    }),

  // Merge two patients
  mergePatients: adminProcedure
    .input(
      z.object({
        sourcePatientId: z.string(), // Patient to merge FROM (will be archived)
        targetPatientId: z.string(), // Patient to merge INTO (will be kept)
        fieldsToKeepFromSource: z.object({
          demographics: z.array(z.string()).default([]), // Field names to copy from source
          contacts: z.boolean().default(false), // Merge all contacts
          emergencyContacts: z.boolean().default(false),
          insurances: z.boolean().default(false),
          documents: z.boolean().default(true), // Usually want to keep all documents
        }),
        reason: z.string().min(1, 'Merge reason is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sourcePatientId, targetPatientId, fieldsToKeepFromSource, reason } = input;

      // Fetch both patients with all related data
      const [sourcePatient, targetPatient] = await Promise.all([
        ctx.prisma.patient.findFirst({
          where: { id: sourcePatientId, organizationId: ctx.user.organizationId },
          include: {
            demographics: true,
            contacts: true,
            emergencyContacts: true,
            insurances: true,
            documents: true,
            householdMembers: true,
          },
        }),
        ctx.prisma.patient.findFirst({
          where: { id: targetPatientId, organizationId: ctx.user.organizationId },
          include: { demographics: true },
        }),
      ]);

      if (!sourcePatient || !targetPatient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'One or both patients not found',
        });
      }

      if (sourcePatient.status === 'ARCHIVED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot merge an archived patient',
        });
      }

      // Create snapshot of source patient before merge
      const sourceSnapshot = {
        id: sourcePatient.id,
        mrn: sourcePatient.mrn,
        demographics: sourcePatient.demographics,
        contacts: sourcePatient.contacts,
        emergencyContacts: sourcePatient.emergencyContacts,
        insurances: sourcePatient.insurances.map((i) => ({ ...i, copay: i.copay?.toString(), deductible: i.deductible?.toString(), deductibleMet: i.deductibleMet?.toString(), outOfPocketMax: i.outOfPocketMax?.toString(), outOfPocketMet: i.outOfPocketMet?.toString() })),
        documentCount: sourcePatient.documents.length,
      };

      // Start transaction for merge
      const result = await ctx.prisma.$transaction(async (tx) => {
        // 1. Copy selected demographics fields from source to target
        if (fieldsToKeepFromSource.demographics.length > 0 && sourcePatient.demographics && targetPatient.demographics) {
          const demographicsUpdate: Record<string, unknown> = {};
          for (const field of fieldsToKeepFromSource.demographics) {
            const sourceValue = (sourcePatient.demographics as Record<string, unknown>)[field];
            if (sourceValue !== undefined && sourceValue !== null) {
              demographicsUpdate[field] = sourceValue;
            }
          }

          if (Object.keys(demographicsUpdate).length > 0) {
            await tx.patientDemographics.update({
              where: { id: targetPatient.demographics.id },
              data: demographicsUpdate,
            });
          }
        }

        // 2. Transfer contacts
        if (fieldsToKeepFromSource.contacts && sourcePatient.contacts.length > 0) {
          // Set all source contacts to non-primary and transfer
          await tx.patientContact.updateMany({
            where: { patientId: sourcePatientId },
            data: { patientId: targetPatientId, isPrimary: false },
          });
        }

        // 3. Transfer emergency contacts
        if (fieldsToKeepFromSource.emergencyContacts && sourcePatient.emergencyContacts.length > 0) {
          await tx.emergencyContact.updateMany({
            where: { patientId: sourcePatientId },
            data: { patientId: targetPatientId, isPrimary: false },
          });
        }

        // 4. Transfer insurances (deactivate source insurances of same type)
        if (fieldsToKeepFromSource.insurances && sourcePatient.insurances.length > 0) {
          await tx.patientInsurance.updateMany({
            where: { patientId: sourcePatientId },
            data: { patientId: targetPatientId, isActive: false },
          });
        }

        // 5. Transfer documents (always recommended)
        if (fieldsToKeepFromSource.documents && sourcePatient.documents.length > 0) {
          await tx.patientDocument.updateMany({
            where: { patientId: sourcePatientId },
            data: { patientId: targetPatientId },
          });
        }

        // 6. Handle household membership
        if (sourcePatient.householdMembers.length > 0) {
          // Remove source from any households (don't transfer - target may have own household)
          await tx.householdMember.deleteMany({
            where: { patientId: sourcePatientId },
          });
        }

        // 7. Create merge record for audit trail
        const mergeRecord = await tx.patientMerge.create({
          data: {
            sourcePatientId,
            targetPatientId,
            mergedBy: ctx.user.id,
            reason,
            sourceSnapshot: sourceSnapshot as Prisma.InputJsonValue,
            fieldsKept: fieldsToKeepFromSource as Prisma.InputJsonValue,
          },
        });

        // 8. Archive the source patient
        await tx.patient.update({
          where: { id: sourcePatientId },
          data: {
            status: 'ARCHIVED',
            archivedAt: new Date(),
          },
        });

        return mergeRecord;
      });

      // Log the merge
      await auditLog('PATIENT_MERGE', 'Patient', {
        entityId: targetPatientId,
        changes: {
          action: 'merge',
          sourcePatientId,
          targetPatientId,
          mergeRecordId: result.id,
          reason,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        mergeId: result.id,
        targetPatientId,
        sourcePatientArchived: true,
      };
    }),

  // Get merge history for a patient
  getMergeHistory: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const merges = await ctx.prisma.patientMerge.findMany({
        where: {
          OR: [
            { targetPatientId: input.patientId },
            { sourcePatientId: input.patientId },
          ],
          targetPatient: { organizationId: ctx.user.organizationId },
        },
        orderBy: { mergedAt: 'desc' },
      });

      return merges;
    }),
});
