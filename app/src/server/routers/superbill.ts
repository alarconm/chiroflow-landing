import { z } from 'zod';
import { router, protectedProcedure, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';

export const superbillRouter = router({
  // Generate superbill from encounter
  generate: billerProcedure
    .input(z.object({ encounterId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true } },
              insurances: {
                where: { isActive: true },
                orderBy: { type: 'asc' },
                include: { insurancePayer: true },
              },
            },
          },
          provider: {
            include: { user: true },
          },
          diagnoses: {
            orderBy: { sequence: 'asc' },
          },
          procedures: {
            orderBy: { createdAt: 'asc' },
          },
          appointment: {
            include: { appointmentType: true },
          },
        },
      });

      if (!encounter) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Encounter not found' });
      }

      // Get organization info
      const organization = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Get fee schedule for pricing
      const defaultFeeSchedule = await ctx.prisma.feeSchedule.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          isDefault: true,
        },
        include: { items: true },
      });

      const feeMap = new Map(defaultFeeSchedule?.items.map((i) => [i.cptCode, i]) || []);

      // Build superbill data
      const superbill = {
        id: `SB-${encounter.id}`,
        generatedAt: new Date(),
        encounterDate: encounter.encounterDate,
        encounterType: encounter.encounterType,

        // Practice/Facility Info
        facility: {
          name: organization?.name || 'Practice',
          // Settings would include address, phone, NPI, tax ID
          settings: organization?.settings,
        },

        // Patient Info
        patient: {
          id: encounter.patientId,
          mrn: encounter.patient.mrn,
          name: encounter.patient.demographics
            ? `${encounter.patient.demographics.firstName} ${encounter.patient.demographics.lastName}`
            : 'Patient',
          dateOfBirth: encounter.patient.demographics?.dateOfBirth,
          address: encounter.patient.contacts[0]
            ? {
                line1: encounter.patient.contacts[0].addressLine1,
                line2: encounter.patient.contacts[0].addressLine2,
                city: encounter.patient.contacts[0].city,
                state: encounter.patient.contacts[0].state,
                zip: encounter.patient.contacts[0].zipCode,
              }
            : null,
          phone: encounter.patient.contacts[0]?.mobilePhone ||
            encounter.patient.contacts[0]?.homePhone || null,
        },

        // Insurance Info
        insurance: {
          primary: encounter.patient.insurances[0]
            ? {
                payerName:
                  encounter.patient.insurances[0].insurancePayer?.name ||
                  encounter.patient.insurances[0].payerName,
                payerId: encounter.patient.insurances[0].payerId,
                policyNumber: encounter.patient.insurances[0].policyNumber,
                groupNumber: encounter.patient.insurances[0].groupNumber,
                copay: encounter.patient.insurances[0].copay,
                subscriberRelationship: encounter.patient.insurances[0].subscriberRelationship,
              }
            : null,
          secondary: encounter.patient.insurances[1]
            ? {
                payerName:
                  encounter.patient.insurances[1].insurancePayer?.name ||
                  encounter.patient.insurances[1].payerName,
                policyNumber: encounter.patient.insurances[1].policyNumber,
              }
            : null,
        },

        // Provider Info
        provider: {
          id: encounter.providerId,
          name: encounter.provider.user
            ? `${encounter.provider.title || ''} ${encounter.provider.user.firstName} ${encounter.provider.user.lastName}`.trim()
            : 'Provider',
          npi: encounter.provider.npiNumber,
          licenseNumber: encounter.provider.licenseNumber,
        },

        // Diagnoses (ICD-10)
        diagnoses: encounter.diagnoses.map((d, index) => ({
          sequence: d.sequence,
          letter: String.fromCharCode(65 + index), // A, B, C, D
          code: d.icd10Code,
          description: d.description,
          isPrimary: d.isPrimary,
        })),

        // Procedures (CPT)
        procedures: encounter.procedures.map((p) => {
          const feeItem = feeMap.get(p.cptCode);
          const fee = feeItem?.fee ?? p.chargeAmount ?? 0;
          const total = Number(fee) * p.units;

          return {
            code: p.cptCode,
            description: p.description,
            modifiers: [p.modifier1, p.modifier2, p.modifier3, p.modifier4].filter(Boolean),
            units: p.units,
            fee: Number(fee),
            total,
            diagnosisPointers: p.diagnosisPointers,
          };
        }),

        // Totals
        totals: {
          procedureCount: encounter.procedures.length,
          totalFees: encounter.procedures.reduce((sum, p) => {
            const feeItem = feeMap.get(p.cptCode);
            const fee = feeItem?.fee ?? p.chargeAmount ?? 0;
            return sum + Number(fee) * p.units;
          }, 0),
          estimatedCopay: encounter.patient.insurances[0]?.copay
            ? Number(encounter.patient.insurances[0].copay)
            : null,
        },

        // Visit Info
        visit: {
          chiefComplaint: encounter.chiefComplaint,
          visitNumber: encounter.visitNumber,
          appointmentType: encounter.appointment?.appointmentType?.name || null,
        },
      };

      await auditLog('SUPERBILL_GENERATE', 'Encounter', {
        entityId: encounter.id,
        changes: {
          diagnoseCount: superbill.diagnoses.length,
          procedureCount: superbill.procedures.length,
          totalFees: superbill.totals.totalFees,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return superbill;
    }),

  // Get superbill (retrieve previously generated or generate new)
  get: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true } },
              insurances: {
                where: { isActive: true },
                orderBy: { type: 'asc' },
                include: { insurancePayer: true },
              },
            },
          },
          provider: { include: { user: true } },
          diagnoses: { orderBy: { sequence: 'asc' } },
          procedures: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!encounter) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Encounter not found' });
      }

      // Get fees
      const defaultFeeSchedule = await ctx.prisma.feeSchedule.findFirst({
        where: { organizationId: ctx.user.organizationId, isDefault: true },
        include: { items: true },
      });

      const feeMap = new Map(defaultFeeSchedule?.items.map((i) => [i.cptCode, i]) || []);

      return {
        encounterDate: encounter.encounterDate,
        patient: {
          name: encounter.patient.demographics
            ? `${encounter.patient.demographics.firstName} ${encounter.patient.demographics.lastName}`
            : 'Patient',
          dob: encounter.patient.demographics?.dateOfBirth,
          mrn: encounter.patient.mrn,
        },
        provider: {
          name: encounter.provider.user
            ? `${encounter.provider.title || ''} ${encounter.provider.user.firstName} ${encounter.provider.user.lastName}`.trim()
            : 'Provider',
          npi: encounter.provider.npiNumber,
        },
        diagnoses: encounter.diagnoses.map((d) => ({
          code: d.icd10Code,
          description: d.description,
          isPrimary: d.isPrimary,
        })),
        procedures: encounter.procedures.map((p) => {
          const feeItem = feeMap.get(p.cptCode);
          return {
            code: p.cptCode,
            description: p.description,
            units: p.units,
            fee: feeItem?.fee ? Number(feeItem.fee) : Number(p.chargeAmount) || 0,
            modifiers: [p.modifier1, p.modifier2, p.modifier3, p.modifier4].filter(Boolean),
          };
        }),
        insurance: encounter.patient.insurances[0]
          ? {
              payer: encounter.patient.insurances[0].payerName,
              policyNumber: encounter.patient.insurances[0].policyNumber,
              copay: encounter.patient.insurances[0].copay,
            }
          : null,
      };
    }),

  // List superbills by date range
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        providerId: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, providerId, page, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        encounterDate: {
          gte: startDate,
          lte: endDate,
        },
        // Only include encounters with procedures (billable)
        procedures: { some: {} },
      };

      if (providerId) where.providerId = providerId;

      const [encounters, total] = await Promise.all([
        ctx.prisma.encounter.findMany({
          where,
          include: {
            patient: { include: { demographics: true } },
            provider: { include: { user: true } },
            procedures: true,
            diagnoses: true,
            charges: true,
          },
          orderBy: { encounterDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.encounter.count({ where }),
      ]);

      // Get fee schedule for totals
      const defaultFeeSchedule = await ctx.prisma.feeSchedule.findFirst({
        where: { organizationId: ctx.user.organizationId, isDefault: true },
        include: { items: true },
      });
      const feeMap = new Map(defaultFeeSchedule?.items.map((i) => [i.cptCode, i]) || []);

      const superbills = encounters.map((enc) => ({
        encounterId: enc.id,
        encounterDate: enc.encounterDate,
        patient: enc.patient.demographics
          ? `${enc.patient.demographics.lastName}, ${enc.patient.demographics.firstName}`
          : 'Patient',
        patientId: enc.patientId,
        provider: enc.provider.user
          ? `${enc.provider.user.lastName}, ${enc.provider.user.firstName}`
          : 'Provider',
        procedureCount: enc.procedures.length,
        diagnoseCount: enc.diagnoses.length,
        totalFees: enc.procedures.reduce((sum, p) => {
          const feeItem = feeMap.get(p.cptCode);
          const fee = feeItem?.fee ?? p.chargeAmount ?? 0;
          return sum + Number(fee) * p.units;
        }, 0),
        hasBilled: enc.charges.length > 0,
        status: enc.status,
      }));

      return {
        superbills,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }),

  // Get superbill PDF data (formatted for printing/PDF generation)
  getPDF: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true } },
              insurances: {
                where: { isActive: true },
                orderBy: { type: 'asc' },
                include: { insurancePayer: true },
              },
            },
          },
          provider: { include: { user: true } },
          diagnoses: { orderBy: { sequence: 'asc' } },
          procedures: { orderBy: { createdAt: 'asc' } },
          appointment: { include: { appointmentType: true } },
        },
      });

      if (!encounter) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Encounter not found' });
      }

      // Get organization info with settings (for practice details)
      const organization = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Get fee schedule for pricing
      const defaultFeeSchedule = await ctx.prisma.feeSchedule.findFirst({
        where: { organizationId: ctx.user.organizationId, isDefault: true },
        include: { items: true },
      });
      const feeMap = new Map(defaultFeeSchedule?.items.map((i) => [i.cptCode, i]) || []);

      // Parse organization settings for address/phone
      const orgSettings = (organization?.settings as Record<string, unknown>) || {};

      // Format date for display
      const formatDate = (date: Date | null | undefined) => {
        if (!date) return '';
        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      };

      // Build diagnoses with letters (A, B, C, D) for pointers
      const diagnoses = encounter.diagnoses.map((d, index) => ({
        pointer: String.fromCharCode(65 + index), // A, B, C, D...
        code: d.icd10Code,
        description: d.description,
        isPrimary: d.isPrimary,
        status: d.status,
        onsetDate: d.onsetDate ? formatDate(d.onsetDate) : null,
      }));

      // Build procedures with fees and totals
      let totalFees = 0;
      const procedures = encounter.procedures.map((p) => {
        const feeItem = feeMap.get(p.cptCode);
        const fee = Number(feeItem?.fee ?? p.chargeAmount ?? 0);
        const total = fee * p.units;
        totalFees += total;

        // Map diagnosis pointers (1, 2, 3...) to letters (A, B, C...)
        const pointers = (p.diagnosisPointers as number[] | null)?.map(
          (idx) => String.fromCharCode(64 + idx) // 1 -> A, 2 -> B
        ) || [];

        return {
          code: p.cptCode,
          description: p.description,
          modifiers: [p.modifier1, p.modifier2, p.modifier3, p.modifier4].filter(Boolean),
          units: p.units,
          fee,
          total,
          diagnosisPointers: pointers.join(', '),
        };
      });

      // Get patient address
      const contact = encounter.patient.contacts[0];
      const patientAddress = contact
        ? {
            line1: contact.addressLine1 || '',
            line2: contact.addressLine2 || '',
            city: contact.city || '',
            state: contact.state || '',
            zip: contact.zipCode || '',
            full: [
              contact.addressLine1,
              contact.addressLine2,
              [contact.city, contact.state, contact.zipCode].filter(Boolean).join(' '),
            ].filter(Boolean).join(', '),
          }
        : null;

      // Insurance details
      const primaryInsurance = encounter.patient.insurances[0];
      const secondaryInsurance = encounter.patient.insurances[1];

      // PDF-optimized structure for standard superbill layout
      const pdfData = {
        // Document header
        header: {
          title: 'SUPERBILL / ENCOUNTER FORM',
          superbillNumber: `SB-${encounter.id.substring(0, 8).toUpperCase()}`,
          generatedAt: new Date().toISOString(),
          generatedDate: formatDate(new Date()),
        },

        // Practice/Facility information (Box 32, 33 on CMS-1500)
        practice: {
          name: organization?.name || 'Practice Name',
          address: (orgSettings.address as string) || '',
          city: (orgSettings.city as string) || '',
          state: (orgSettings.state as string) || '',
          zip: (orgSettings.zip as string) || '',
          phone: (orgSettings.phone as string) || '',
          fax: (orgSettings.fax as string) || '',
          taxId: (orgSettings.taxId as string) || '',
          npi: (orgSettings.npi as string) || '', // Group NPI
        },

        // Provider information (Box 24J, 31 on CMS-1500)
        provider: {
          name: encounter.provider.user
            ? `${encounter.provider.title || ''} ${encounter.provider.user.firstName} ${encounter.provider.user.lastName}`.trim()
            : 'Provider',
          title: encounter.provider.title || '',
          npi: encounter.provider.npiNumber || '', // Individual NPI
          licenseNumber: encounter.provider.licenseNumber || '',
          credentials: encounter.provider.specialty || '',
          signature: '_____________________________', // Placeholder for signature
          signatureDate: formatDate(new Date()),
        },

        // Patient information (Box 2, 3, 5 on CMS-1500)
        patient: {
          name: encounter.patient.demographics
            ? `${encounter.patient.demographics.lastName}, ${encounter.patient.demographics.firstName}`
            : 'Patient',
          firstName: encounter.patient.demographics?.firstName || '',
          lastName: encounter.patient.demographics?.lastName || '',
          middleName: encounter.patient.demographics?.middleName || '',
          dateOfBirth: formatDate(encounter.patient.demographics?.dateOfBirth),
          gender: encounter.patient.demographics?.gender || '',
          mrn: encounter.patient.mrn,
          address: patientAddress,
          phone: contact?.mobilePhone || contact?.homePhone || '',
          email: contact?.email || '',
        },

        // Primary insurance (Box 1, 1a, 4, 7, 11 on CMS-1500)
        primaryInsurance: primaryInsurance
          ? {
              payerName: primaryInsurance.insurancePayer?.name || primaryInsurance.payerName || '',
              payerId: primaryInsurance.payerId || '',
              policyNumber: primaryInsurance.policyNumber || '',
              groupNumber: primaryInsurance.groupNumber || '',
              subscriberName: primaryInsurance.subscriberRelationship === 'SELF'
                ? `${encounter.patient.demographics?.firstName || ''} ${encounter.patient.demographics?.lastName || ''}`.trim()
                : `${primaryInsurance.subscriberFirstName || ''} ${primaryInsurance.subscriberLastName || ''}`.trim(),
              subscriberDob: formatDate(
                primaryInsurance.subscriberRelationship === 'SELF'
                  ? encounter.patient.demographics?.dateOfBirth
                  : primaryInsurance.subscriberDob
              ),
              relationship: primaryInsurance.subscriberRelationship || 'SELF',
              copay: primaryInsurance.copay ? Number(primaryInsurance.copay) : null,
              deductible: primaryInsurance.deductible ? Number(primaryInsurance.deductible) : null,
            }
          : null,

        // Secondary insurance
        secondaryInsurance: secondaryInsurance
          ? {
              payerName: secondaryInsurance.insurancePayer?.name || secondaryInsurance.payerName || '',
              policyNumber: secondaryInsurance.policyNumber || '',
              groupNumber: secondaryInsurance.groupNumber || '',
            }
          : null,

        // Visit/Encounter information
        visit: {
          date: formatDate(encounter.encounterDate),
          dateRaw: encounter.encounterDate,
          type: encounter.encounterType,
          chiefComplaint: encounter.chiefComplaint || '',
          visitNumber: encounter.visitNumber || 1,
          appointmentType: encounter.appointment?.appointmentType?.name || '',
          placeOfService: '11', // Office (default for chiropractic)
          placeOfServiceName: 'Office',
          status: encounter.status,
        },

        // Diagnoses section (Box 21 on CMS-1500)
        diagnoses: {
          items: diagnoses,
          count: diagnoses.length,
          primaryDiagnosis: diagnoses.find((d) => d.isPrimary) || diagnoses[0] || null,
        },

        // Procedures/Services section (Box 24 on CMS-1500)
        procedures: {
          items: procedures,
          count: procedures.length,
        },

        // Financial summary
        totals: {
          totalFees,
          formattedTotal: `$${totalFees.toFixed(2)}`,
          copay: primaryInsurance?.copay ? Number(primaryInsurance.copay) : null,
          formattedCopay: primaryInsurance?.copay
            ? `$${Number(primaryInsurance.copay).toFixed(2)}`
            : null,
          estimatedPatientResponsibility: primaryInsurance?.copay
            ? Number(primaryInsurance.copay)
            : totalFees,
          formattedPatientResponsibility: `$${(primaryInsurance?.copay ? Number(primaryInsurance.copay) : totalFees).toFixed(2)}`,
        },

        // Footer/Payment section
        footer: {
          paymentInstructions: 'Payment is due at time of service. We accept cash, check, and major credit cards.',
          officeNotes: '',
          nextAppointment: '____________________',
        },

        // Print metadata
        printSettings: {
          paperSize: 'letter',
          orientation: 'portrait',
          margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
          fontSize: 10,
        },
      };

      await auditLog('SUPERBILL_PDF_GENERATE', 'Encounter', {
        entityId: encounter.id,
        changes: {
          superbillNumber: pdfData.header.superbillNumber,
          diagnoseCount: diagnoses.length,
          procedureCount: procedures.length,
          totalFees,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return pdfData;
    }),

  // Generate walkout statement (patient portion only)
  getWalkoutStatement: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              insurances: {
                where: { isActive: true, type: 'PRIMARY' },
              },
            },
          },
          provider: { include: { user: true } },
          procedures: true,
          charges: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Encounter not found' });
      }

      const organization = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Get fee schedule
      const defaultFeeSchedule = await ctx.prisma.feeSchedule.findFirst({
        where: { organizationId: ctx.user.organizationId, isDefault: true },
        include: { items: true },
      });
      const feeMap = new Map(defaultFeeSchedule?.items.map((i) => [i.cptCode, i]) || []);

      // Calculate totals
      const totalFees = encounter.procedures.reduce((sum, p) => {
        const feeItem = feeMap.get(p.cptCode);
        const fee = feeItem?.fee ?? p.chargeAmount ?? 0;
        return sum + Number(fee) * p.units;
      }, 0);

      const copay = encounter.patient.insurances[0]?.copay
        ? Number(encounter.patient.insurances[0].copay)
        : 0;

      // Get any existing payments for today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const todayPayments = await ctx.prisma.payment.findMany({
        where: {
          patientId: encounter.patientId,
          organizationId: ctx.user.organizationId,
          paymentDate: { gte: todayStart, lte: todayEnd },
          isVoid: false,
        },
      });

      const paidToday = todayPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      // Get patient balance
      const balanceResult = await ctx.prisma.charge.aggregate({
        where: {
          patientId: encounter.patientId,
          organizationId: ctx.user.organizationId,
          status: { not: 'VOID' },
        },
        _sum: { balance: true },
      });

      const previousBalance = Number(balanceResult._sum.balance || 0);
      const todaysCharges = encounter.charges.reduce(
        (sum, c) => sum + Number(c.fee) * c.units,
        0
      );

      return {
        date: new Date(),
        practice: {
          name: organization?.name || 'Practice',
        },
        patient: {
          name: encounter.patient.demographics
            ? `${encounter.patient.demographics.firstName} ${encounter.patient.demographics.lastName}`
            : 'Patient',
          mrn: encounter.patient.mrn,
        },
        provider: encounter.provider.user
          ? `${encounter.provider.title || ''} ${encounter.provider.user.firstName} ${encounter.provider.user.lastName}`.trim()
          : 'Provider',
        services: encounter.procedures.map((p) => {
          const feeItem = feeMap.get(p.cptCode);
          return {
            code: p.cptCode,
            description: p.description,
            fee: Number(feeItem?.fee ?? p.chargeAmount ?? 0),
          };
        }),
        financial: {
          previousBalance: Math.max(0, previousBalance - todaysCharges),
          todaysCharges: totalFees,
          copay,
          paidToday,
          amountDue: Math.max(0, copay - paidToday),
          newBalance: previousBalance + totalFees - paidToday,
        },
        message: copay > paidToday
          ? `Your copay of $${copay.toFixed(2)} is due today.`
          : 'Thank you! Your copay has been received.',
      };
    }),
});
