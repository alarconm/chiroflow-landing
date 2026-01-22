import { z } from 'zod';
import { router, protectedProcedure, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';

// Place of service codes for CMS-1500
const placeOfServiceMap: Record<string, string> = {
  OFFICE: '11',
  HOME: '12',
  TELEHEALTH: '02',
  URGENT_CARE: '20',
  INPATIENT: '21',
  OUTPATIENT: '22',
  EMERGENCY: '23',
  OTHER: '99',
};

export const cms1500Router = router({
  // Generate CMS-1500 data structure for a claim
  generate: billerProcedure
    .input(z.object({ claimId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.prisma.claim.findFirst({
        where: {
          id: input.claimId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true } },
            },
          },
          insurancePolicy: {
            include: { insurancePayer: true },
          },
          payer: true,
          encounter: {
            include: {
              diagnoses: { orderBy: { sequence: 'asc' } },
              provider: { include: { user: true } },
            },
          },
          claimLines: {
            include: { charge: true },
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      if (!claim) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      // Get organization info
      const organization = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      const settings = (organization?.settings || {}) as Record<string, unknown>;

      // Helper to format date as MMDDYY
      const formatDate = (date: Date | null | undefined): string => {
        if (!date) return '';
        const d = new Date(date);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${mm}${dd}${yy}`;
      };

      // Get diagnoses from encounter or claim lines
      const diagnoses =
        claim.encounter?.diagnoses.slice(0, 12).map((d) => d.icd10Code) ||
        [...new Set(claim.claimLines.flatMap((l) => l.charge?.icd10Codes || []))].slice(0, 12);

      // Build CMS-1500 form data (all 33 boxes)
      const cms1500 = {
        // Box 1: Type of insurance
        box1_insuranceType: claim.insurancePolicy?.planType || 'Other',
        box1a_insuredIdNumber: claim.insurancePolicy?.policyNumber || '',

        // Box 2: Patient's Name
        box2_patientName: claim.patient.demographics
          ? `${claim.patient.demographics.lastName}, ${claim.patient.demographics.firstName}${
              claim.patient.demographics.middleName
                ? ' ' + claim.patient.demographics.middleName.charAt(0)
                : ''
            }`
          : '',

        // Box 3: Patient's Birth Date & Sex
        box3_patientBirthDate: formatDate(claim.patient.demographics?.dateOfBirth),
        box3_patientSex:
          claim.patient.demographics?.gender === 'MALE'
            ? 'M'
            : claim.patient.demographics?.gender === 'FEMALE'
              ? 'F'
              : '',

        // Box 4: Insured's Name (if different)
        box4_insuredName:
          claim.insurancePolicy?.subscriberRelationship === 'SELF'
            ? 'SAME'
            : `${claim.insurancePolicy?.subscriberLastName || ''}, ${claim.insurancePolicy?.subscriberFirstName || ''}`,

        // Box 5: Patient's Address
        box5_patientAddress: {
          street: claim.patient.contacts[0]?.addressLine1 || '',
          city: claim.patient.contacts[0]?.city || '',
          state: claim.patient.contacts[0]?.state || '',
          zip: claim.patient.contacts[0]?.zipCode || '',
          phone: claim.patient.contacts[0]?.mobilePhone || claim.patient.contacts[0]?.homePhone || '',
        },

        // Box 6: Patient Relationship to Insured
        box6_patientRelationship: claim.insurancePolicy?.subscriberRelationship || 'SELF',

        // Box 7: Insured's Address
        box7_insuredAddress:
          claim.insurancePolicy?.subscriberRelationship === 'SELF' ? 'SAME' : '',

        // Box 8: Reserved for NUCC use (leave blank)
        box8_reserved: '',

        // Box 9: Other Insured's Name (for secondary)
        box9_otherInsuredName: claim.isSecondary ? '' : '', // Would need secondary insurance info

        // Box 9a: Other Insured's Policy Number
        box9a_otherInsuredPolicy: '',

        // Box 9b: Reserved
        box9b_reserved: '',

        // Box 9c: Reserved
        box9c_reserved: '',

        // Box 9d: Insurance Plan Name
        box9d_otherInsurancePlan: '',

        // Box 10: Patient's Condition Related To
        box10a_employmentRelated: 'NO',
        box10b_autoAccident: 'NO',
        box10b_state: '',
        box10c_otherAccident: 'NO',

        // Box 10d: Claim Codes (reserved)
        box10d_claimCodes: '',

        // Box 11: Insured's Policy Group or FECA Number
        box11_insuredPolicyGroup: claim.insurancePolicy?.groupNumber || '',
        box11a_insuredBirthDate: formatDate(claim.insurancePolicy?.subscriberDob),
        box11a_insuredSex: '',
        box11b_otherClaimId: '',
        box11c_insurancePlanName: claim.insurancePolicy?.planName || claim.payer?.name || '',
        box11d_anotherBenefitPlan: 'NO',

        // Box 12: Patient's or Authorized Signature
        box12_patientSignature: 'SIGNATURE ON FILE',
        box12_date: formatDate(new Date()),

        // Box 13: Insured's or Authorized Signature
        box13_insuredSignature: 'SIGNATURE ON FILE',

        // Box 14: Date of Current Illness
        box14_dateOfIllness: formatDate(claim.claimLines[0]?.serviceDateFrom),

        // Box 15: Other Date (not typically used)
        box15_otherDate: '',

        // Box 16: Dates Unable to Work (for disability)
        box16_unableToWorkFrom: '',
        box16_unableToWorkTo: '',

        // Box 17: Name of Referring Provider
        box17_referringProvider: '',
        box17a_referringProviderNpi: '',
        box17b_referringProviderNpi: '',

        // Box 18: Hospitalization Dates
        box18_hospitalizedFrom: '',
        box18_hospitalizedTo: '',

        // Box 19: Additional Claim Information
        box19_additionalInfo: '',

        // Box 20: Outside Lab
        box20_outsideLab: 'NO',
        box20_charges: '',

        // Box 21: Diagnosis Codes (ICD-10)
        box21_diagnoses: {
          A: diagnoses[0] || '',
          B: diagnoses[1] || '',
          C: diagnoses[2] || '',
          D: diagnoses[3] || '',
          E: diagnoses[4] || '',
          F: diagnoses[5] || '',
          G: diagnoses[6] || '',
          H: diagnoses[7] || '',
          I: diagnoses[8] || '',
          J: diagnoses[9] || '',
          K: diagnoses[10] || '',
          L: diagnoses[11] || '',
        },
        box21_icdIndicator: '0', // ICD-10

        // Box 22: Resubmission Code
        box22_resubmissionCode: '',
        box22_originalRefNo: claim.originalClaimId || '',

        // Box 23: Prior Authorization Number
        box23_priorAuth: '',

        // Box 24: Service Lines (up to 6)
        box24_serviceLines: claim.claimLines.slice(0, 6).map((line) => ({
          dateFrom: formatDate(line.serviceDateFrom),
          dateTo: formatDate(line.serviceDateTo),
          placeOfService: placeOfServiceMap[line.placeOfService] || '11',
          emg: '', // Emergency indicator
          cptCode: line.cptCode,
          modifiers: line.modifiers.slice(0, 4).join(' '),
          diagnosisPointer: line.diagnosisPointers
            ?.map((p) => String.fromCharCode(64 + p))
            .join('') || 'A',
          charges: Number(line.chargedAmount).toFixed(2),
          units: line.units.toString(),
          epsdt: '', // EPSDT/Family Plan
          ndc: '', // NDC qualifier
          renderingProviderNpi: claim.renderingNpi || claim.encounter?.provider?.npiNumber || '',
        })),

        // Box 25: Federal Tax ID
        box25_taxId: (settings.taxId as string) || '',
        box25_taxIdType: 'EIN',

        // Box 26: Patient's Account Number
        box26_patientAccountNo: claim.patient.mrn,

        // Box 27: Accept Assignment
        box27_acceptAssignment: 'YES',

        // Box 28: Total Charge
        box28_totalCharge: Number(claim.totalCharges).toFixed(2),

        // Box 29: Amount Paid
        box29_amountPaid: Number(claim.totalPaid).toFixed(2),

        // Box 30: Reserved (Balance Due)
        box30_balanceDue: (Number(claim.totalCharges) - Number(claim.totalPaid)).toFixed(2),

        // Box 31: Signature of Provider
        box31_providerSignature: claim.encounter?.provider?.user
          ? `${claim.encounter.provider.user.firstName} ${claim.encounter.provider.user.lastName}`
          : 'Provider',
        box31_date: formatDate(new Date()),

        // Box 32: Service Facility Location
        box32_serviceFacility: {
          name: organization?.name || '',
          address: (settings.address as string) || '',
          city: (settings.city as string) || '',
          state: (settings.state as string) || '',
          zip: (settings.zip as string) || '',
          npi: (settings.facilityNpi as string) || '',
        },

        // Box 33: Billing Provider Info
        box33_billingProvider: {
          name: organization?.name || '',
          address: (settings.address as string) || '',
          city: (settings.city as string) || '',
          state: (settings.state as string) || '',
          zip: (settings.zip as string) || '',
          phone: (settings.phone as string) || '',
          npi: (settings.billingNpi as string) || claim.billingNpi || '',
        },
      };

      await auditLog('CMS1500_GENERATE', 'Claim', {
        entityId: claim.id,
        changes: { claimNumber: claim.claimNumber },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return cms1500;
    }),

  // Get CMS-1500 as structured data for PDF generation
  getPdf: billerProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      const claim = await ctx.prisma.claim.findFirst({
        where: {
          id: input.claimId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true } },
            },
          },
          insurancePolicy: {
            include: { insurancePayer: true },
          },
          payer: true,
          encounter: {
            include: {
              diagnoses: { orderBy: { sequence: 'asc' } },
              provider: { include: { user: true } },
            },
          },
          claimLines: {
            include: { charge: true },
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      if (!claim) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      // Simplified structure for PDF template
      return {
        claimId: claim.id,
        claimNumber: claim.claimNumber,
        patient: {
          name: claim.patient.demographics
            ? `${claim.patient.demographics.lastName}, ${claim.patient.demographics.firstName}`
            : 'Patient',
          dob: claim.patient.demographics?.dateOfBirth,
          address: claim.patient.contacts[0],
          mrn: claim.patient.mrn,
        },
        insured: {
          name:
            claim.insurancePolicy?.subscriberRelationship === 'SELF'
              ? 'Same'
              : `${claim.insurancePolicy?.subscriberLastName}, ${claim.insurancePolicy?.subscriberFirstName}`,
          policyNumber: claim.insurancePolicy?.policyNumber,
          groupNumber: claim.insurancePolicy?.groupNumber,
        },
        payer: {
          name: claim.payer?.name || claim.insurancePolicy?.payerName,
          address: claim.payer
            ? `${claim.payer.address1 || ''}, ${claim.payer.city || ''} ${claim.payer.state || ''} ${claim.payer.zip || ''}`
            : '',
        },
        diagnoses: claim.encounter?.diagnoses.map((d) => ({
          code: d.icd10Code,
          description: d.description,
        })) || [],
        services: claim.claimLines.map((line) => ({
          dateOfService: line.serviceDateFrom,
          placeOfService: placeOfServiceMap[line.placeOfService] || '11',
          cpt: line.cptCode,
          modifiers: line.modifiers,
          diagnoses: line.diagnosisPointers,
          charges: line.chargedAmount,
          units: line.units,
        })),
        provider: {
          name: claim.encounter?.provider?.user
            ? `${claim.encounter.provider.user.firstName} ${claim.encounter.provider.user.lastName}`
            : '',
          npi: claim.renderingNpi || claim.encounter?.provider?.npiNumber,
        },
        totals: {
          charges: claim.totalCharges,
          paid: claim.totalPaid,
          balance: Number(claim.totalCharges) - Number(claim.totalPaid),
        },
      };
    }),

  // Validate CMS-1500 data completeness
  validate: billerProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      const claim = await ctx.prisma.claim.findFirst({
        where: {
          id: input.claimId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true } },
            },
          },
          insurancePolicy: true,
          payer: true,
          encounter: {
            include: {
              diagnoses: true,
              provider: { include: { user: true } },
            },
          },
          claimLines: true,
        },
      });

      if (!claim) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      // Required boxes validation
      // Box 1a: Insured ID
      if (!claim.insurancePolicy?.policyNumber) {
        errors.push('Box 1a: Missing insured ID number');
      }

      // Box 2: Patient Name
      if (!claim.patient.demographics?.firstName || !claim.patient.demographics?.lastName) {
        errors.push('Box 2: Patient name is incomplete');
      }

      // Box 3: Patient DOB
      if (!claim.patient.demographics?.dateOfBirth) {
        errors.push('Box 3: Patient date of birth is missing');
      }

      // Box 5: Patient Address
      if (!claim.patient.contacts[0]?.addressLine1) {
        warnings.push('Box 5: Patient address is incomplete');
      }

      // Box 11c: Insurance Plan Name
      if (!claim.insurancePolicy?.planName && !claim.payer?.name) {
        warnings.push('Box 11c: Insurance plan name is missing');
      }

      // Box 21: Diagnoses
      const hasDiagnoses =
        claim.encounter?.diagnoses.length ||
        claim.claimLines.some((l) => l.diagnosisPointers?.length);
      if (!hasDiagnoses) {
        errors.push('Box 21: No diagnosis codes');
      }

      // Box 24: Service Lines
      if (claim.claimLines.length === 0) {
        errors.push('Box 24: No service lines');
      } else if (claim.claimLines.length > 6) {
        warnings.push('Box 24: More than 6 service lines (may need continuation form)');
      }

      // Provider NPI
      if (!claim.renderingNpi && !claim.encounter?.provider?.npiNumber) {
        errors.push('Box 24J: Rendering provider NPI is missing');
      }

      // Box 33: Billing Provider
      if (!claim.billingNpi) {
        warnings.push('Box 33: Billing provider NPI not set on claim');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        boxesCompleted: {
          box1a: !!claim.insurancePolicy?.policyNumber,
          box2: !!(claim.patient.demographics?.firstName && claim.patient.demographics?.lastName),
          box3: !!claim.patient.demographics?.dateOfBirth,
          box5: !!claim.patient.contacts[0]?.addressLine1,
          box21: hasDiagnoses,
          box24: claim.claimLines.length > 0,
          box33: !!claim.billingNpi,
        },
      };
    }),
});
