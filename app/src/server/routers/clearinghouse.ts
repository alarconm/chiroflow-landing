/**
 * Epic 08: Clearinghouse Integration - tRPC Router
 *
 * Handles all clearinghouse operations including claim submission,
 * eligibility verification, claim status checks, and remittance processing.
 */

import { z } from 'zod';
import { router, protectedProcedure, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import {
  ClearinghouseProvider,
  SubmissionStatus,
  EligibilityStatus,
  DenialStatus,
  ClaimStatus,
  ChargeStatus,
  PaymentMethod,
} from '@prisma/client';
import {
  createClearinghouseProvider,
  validateClearinghouseConfig,
  getAvailableProviders,
  getClearinghouseProviderName,
  COMMON_CARC_CODES,
  COMMON_RARC_CODES,
  generate837P,
  validateClaim as validateClaimFor837,
  parseERA,
  isERAContent,
  generatePostingReport,
  CARC_CODES,
  CAS_GROUP_CODES,
} from '@/lib/clearinghouse';
import type {
  ClearinghouseConfigData,
  ClaimSubmissionRequest,
  EligibilityRequest,
  ClaimStatusRequest,
  EDI837Config,
} from '@/lib/clearinghouse';

// Zod schemas for validation
const credentialsSchema = z.object({
  submitterId: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  apiKey: z.string().optional(),
  siteId: z.string().optional(),
});

const endpointsSchema = z.object({
  baseUrl: z.string().url().optional(),
  claimEndpoint: z.string().optional(),
  eligibilityEndpoint: z.string().optional(),
  statusEndpoint: z.string().optional(),
  eraEndpoint: z.string().optional(),
});

const settingsSchema = z.object({
  batchSize: z.number().min(1).max(100).default(25),
  autoSubmit: z.boolean().default(false),
  autoPostEra: z.boolean().default(false),
  billingNpi: z.string().optional(),
  billingTaxId: z.string().optional(),
});

export const clearinghouseRouter = router({
  // ============================================
  // Configuration Management
  // ============================================

  // Get available clearinghouse providers
  getProviders: protectedProcedure.query(() => {
    return {
      providers: getAvailableProviders(),
      carcCodes: COMMON_CARC_CODES,
      rarcCodes: COMMON_RARC_CODES,
    };
  }),

  // Create clearinghouse configuration
  createConfig: billerProcedure
    .input(
      z.object({
        provider: z.nativeEnum(ClearinghouseProvider),
        name: z.string().min(1, 'Name is required'),
        credentials: credentialsSchema.optional(),
        endpoints: endpointsSchema.optional(),
        settings: settingsSchema.optional(),
        isPrimary: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { provider, name, credentials, endpoints, settings, isPrimary } = input;

      // Validate configuration
      const validation = validateClearinghouseConfig({
        provider,
        name,
        credentials: credentials || {},
      });

      if (!validation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Configuration validation failed: ${validation.errors.join(', ')}`,
        });
      }

      // If setting as primary, unset any existing primary
      if (isPrimary) {
        await ctx.prisma.clearinghouseConfig.updateMany({
          where: { organizationId: ctx.user.organizationId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const config = await ctx.prisma.clearinghouseConfig.create({
        data: {
          organizationId: ctx.user.organizationId,
          provider,
          name,
          // Credentials
          submitterId: credentials?.submitterId,
          username: credentials?.username,
          password: credentials?.password,
          apiKey: credentials?.apiKey,
          siteId: credentials?.siteId,
          // Endpoints
          baseUrl: endpoints?.baseUrl,
          claimEndpoint: endpoints?.claimEndpoint,
          eligibilityEndpoint: endpoints?.eligibilityEndpoint,
          statusEndpoint: endpoints?.statusEndpoint,
          eraEndpoint: endpoints?.eraEndpoint,
          // Settings
          settings: settings || {},
          batchSize: settings?.batchSize ?? 25,
          autoSubmit: settings?.autoSubmit ?? false,
          autoPostEra: settings?.autoPostEra ?? false,
          billingNpi: settings?.billingNpi,
          billingTaxId: settings?.billingTaxId,
          isPrimary,
          isActive: true,
        },
      });

      await auditLog('CLEARINGHOUSE_CONFIG_CREATE', 'ClearinghouseConfig', {
        entityId: config.id,
        changes: { provider, name, isPrimary },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return config;
    }),

  // Update clearinghouse configuration
  updateConfig: billerProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        credentials: credentialsSchema.optional(),
        endpoints: endpointsSchema.optional(),
        settings: settingsSchema.optional(),
        isActive: z.boolean().optional(),
        isPrimary: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, isPrimary, name, credentials, endpoints, settings, isActive } = input;

      const existing = await ctx.prisma.clearinghouseConfig.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Configuration not found' });
      }

      // If setting as primary, unset any existing primary
      if (isPrimary) {
        await ctx.prisma.clearinghouseConfig.updateMany({
          where: {
            organizationId: ctx.user.organizationId,
            isPrimary: true,
            id: { not: id },
          },
          data: { isPrimary: false },
        });
      }

      // Build update data with flattened fields
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (isPrimary !== undefined) updateData.isPrimary = isPrimary;

      // Credentials fields
      if (credentials) {
        if (credentials.submitterId !== undefined) updateData.submitterId = credentials.submitterId;
        if (credentials.username !== undefined) updateData.username = credentials.username;
        if (credentials.password !== undefined) updateData.password = credentials.password;
        if (credentials.apiKey !== undefined) updateData.apiKey = credentials.apiKey;
        if (credentials.siteId !== undefined) updateData.siteId = credentials.siteId;
      }

      // Endpoints fields
      if (endpoints) {
        if (endpoints.baseUrl !== undefined) updateData.baseUrl = endpoints.baseUrl;
        if (endpoints.claimEndpoint !== undefined) updateData.claimEndpoint = endpoints.claimEndpoint;
        if (endpoints.eligibilityEndpoint !== undefined) updateData.eligibilityEndpoint = endpoints.eligibilityEndpoint;
        if (endpoints.statusEndpoint !== undefined) updateData.statusEndpoint = endpoints.statusEndpoint;
        if (endpoints.eraEndpoint !== undefined) updateData.eraEndpoint = endpoints.eraEndpoint;
      }

      // Settings fields
      if (settings) {
        updateData.settings = settings;
        if (settings.batchSize !== undefined) updateData.batchSize = settings.batchSize;
        if (settings.autoSubmit !== undefined) updateData.autoSubmit = settings.autoSubmit;
        if (settings.autoPostEra !== undefined) updateData.autoPostEra = settings.autoPostEra;
        if (settings.billingNpi !== undefined) updateData.billingNpi = settings.billingNpi;
        if (settings.billingTaxId !== undefined) updateData.billingTaxId = settings.billingTaxId;
      }

      const config = await ctx.prisma.clearinghouseConfig.update({
        where: { id },
        data: updateData,
      });

      await auditLog('CLEARINGHOUSE_CONFIG_UPDATE', 'ClearinghouseConfig', {
        entityId: id,
        changes: { name, credentials, endpoints, settings, isActive, isPrimary },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return config;
    }),

  // Delete clearinghouse configuration
  deleteConfig: billerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.clearinghouseConfig.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Configuration not found' });
      }

      // Check for active submissions
      const activeSubmissions = await ctx.prisma.claimSubmission.count({
        where: {
          clearinghouseConfigId: input.id,
          status: { in: [SubmissionStatus.PENDING, SubmissionStatus.SUBMITTED] },
        },
      });

      if (activeSubmissions > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete configuration with ${activeSubmissions} active submission(s)`,
        });
      }

      await ctx.prisma.clearinghouseConfig.delete({ where: { id: input.id } });

      await auditLog('CLEARINGHOUSE_CONFIG_DELETE', 'ClearinghouseConfig', {
        entityId: input.id,
        changes: { name: existing.name, provider: existing.provider },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // List clearinghouse configurations
  listConfigs: protectedProcedure.query(async ({ ctx }) => {
    const configs = await ctx.prisma.clearinghouseConfig.findMany({
      where: { organizationId: ctx.user.organizationId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });

    return configs.map((c) => ({
      ...c,
      providerName: getClearinghouseProviderName(c.provider),
      // Reconstruct credentials object from flat fields, masking sensitive data
      credentials: {
        submitterId: c.submitterId,
        username: c.username,
        password: c.password ? '********' : undefined,
        apiKey: c.apiKey ? '********' : undefined,
        siteId: c.siteId,
      },
      // Reconstruct endpoints object from flat fields
      endpoints: {
        baseUrl: c.baseUrl,
        claimEndpoint: c.claimEndpoint,
        eligibilityEndpoint: c.eligibilityEndpoint,
        statusEndpoint: c.statusEndpoint,
        eraEndpoint: c.eraEndpoint,
      },
    }));
  }),

  // Get primary clearinghouse configuration
  getPrimaryConfig: protectedProcedure.query(async ({ ctx }) => {
    const config = await ctx.prisma.clearinghouseConfig.findFirst({
      where: { organizationId: ctx.user.organizationId, isPrimary: true, isActive: true },
    });

    if (!config) {
      return null;
    }

    return {
      ...config,
      providerName: getClearinghouseProviderName(config.provider),
    };
  }),

  // Test clearinghouse connection
  testConnection: billerProcedure
    .input(z.object({ configId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const config = await ctx.prisma.clearinghouseConfig.findFirst({
        where: { id: input.configId, organizationId: ctx.user.organizationId },
      });

      if (!config) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Configuration not found' });
      }

      const provider = await createClearinghouseProvider(config as unknown as ClearinghouseConfigData);
      const result = await provider.testConnection();

      return result;
    }),

  // ============================================
  // Claim Submission (837P)
  // ============================================

  // Submit a single claim
  submitClaim: billerProcedure
    .input(
      z.object({
        claimId: z.string(),
        clearinghouseConfigId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get claim with all related data
      const claim = await ctx.prisma.claim.findFirst({
        where: { id: input.claimId, organizationId: ctx.user.organizationId },
        include: {
          patient: { include: { demographics: true, contacts: { where: { isPrimary: true }, take: 1 } } },
          payer: true,
          insurancePolicy: true,
          encounter: { include: { diagnoses: true, provider: { include: { user: true } } } },
          claimLines: { include: { charge: true }, orderBy: { lineNumber: 'asc' } },
        },
      });

      if (!claim) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      if (claim.status !== ClaimStatus.DRAFT && claim.status !== ClaimStatus.READY) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot submit claim with status ${claim.status}`,
        });
      }

      // Get clearinghouse config
      let configId = input.clearinghouseConfigId;
      if (!configId) {
        const primary = await ctx.prisma.clearinghouseConfig.findFirst({
          where: { organizationId: ctx.user.organizationId, isPrimary: true, isActive: true },
        });
        if (!primary) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No clearinghouse configuration found. Please set up a clearinghouse first.',
          });
        }
        configId = primary.id;
      }

      const config = await ctx.prisma.clearinghouseConfig.findFirst({
        where: { id: configId, organizationId: ctx.user.organizationId },
      });

      if (!config) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Clearinghouse configuration not found' });
      }

      // Build submission request
      const submissionRequest: ClaimSubmissionRequest = {
        claimId: claim.id,
        clearinghouseConfigId: configId,
        patient: {
          id: claim.patient.id,
          firstName: claim.patient.demographics?.firstName || '',
          lastName: claim.patient.demographics?.lastName || '',
          dateOfBirth: claim.patient.demographics?.dateOfBirth || new Date(),
          gender: claim.patient.demographics?.gender || 'U',
          address: claim.patient.contacts[0]
            ? {
                line1: claim.patient.contacts[0].addressLine1 || '',
                line2: claim.patient.contacts[0].addressLine2 || undefined,
                city: claim.patient.contacts[0].city || '',
                state: claim.patient.contacts[0].state || '',
                zip: claim.patient.contacts[0].zipCode || '',
              }
            : undefined,
        },
        insurance: {
          payerId: claim.payer?.payerId || '',
          payerName: claim.payer?.name || '',
          subscriberId: claim.insurancePolicy?.subscriberId || claim.insurancePolicy?.policyNumber || '',
          groupNumber: claim.insurancePolicy?.groupNumber || undefined,
          relationshipCode: claim.insurancePolicy?.subscriberRelationship || '18',
        },
        provider: {
          npi: claim.encounter?.provider?.npiNumber || (config.settings as Record<string, unknown>)?.billingNpi as string || '',
          taxId: (config.settings as Record<string, unknown>)?.billingTaxId as string || undefined,
          name: claim.encounter?.provider?.user
            ? `${claim.encounter.provider.user.firstName} ${claim.encounter.provider.user.lastName}`
            : 'Provider',
        },
        claim: {
          id: claim.id,
          claimNumber: claim.claimNumber || claim.id,
          totalCharges: Number(claim.totalCharges),
          claimType: claim.claimType,
          placeOfService: claim.claimLines[0]?.placeOfService || '11',
          diagnoses:
            claim.encounter?.diagnoses.map((d, i) => ({
              code: d.icd10Code,
              sequence: i + 1,
              isPrimary: i === 0,
            })) || [],
          services: claim.claimLines.map((line) => ({
            lineNumber: line.lineNumber,
            cptCode: line.cptCode,
            modifiers: line.modifiers as string[],
            description: line.description || '',
            units: line.units,
            chargeAmount: Number(line.chargedAmount),
            serviceDateFrom: line.serviceDateFrom,
            serviceDateTo: line.serviceDateTo,
            diagnosisPointers: line.diagnosisPointers as number[],
            placeOfService: line.placeOfService || '11',
          })),
        },
      };

      // Create submission record
      const submission = await ctx.prisma.claimSubmission.create({
        data: {
          claimId: claim.id,
          organizationId: ctx.user.organizationId,
          clearinghouseConfigId: configId,
          status: SubmissionStatus.PENDING,
        },
      });

      try {
        // Submit to clearinghouse
        const provider = await createClearinghouseProvider(config as unknown as ClearinghouseConfigData);
        const response = await provider.submitClaim(submissionRequest);

        // Update submission with response
        await ctx.prisma.claimSubmission.update({
          where: { id: submission.id },
          data: {
            status: response.status,
            batchId: response.batchId,
            controlNumber: response.controlNumber,
            responseCode: response.responseCode,
            responseMessage: response.responseMessage,
            ediContent: response.ediContent,
            acceptedAt: response.success ? new Date() : undefined,
          },
        });

        // Update claim status if successful
        if (response.success) {
          await ctx.prisma.claim.update({
            where: { id: claim.id },
            data: {
              status: ClaimStatus.SUBMITTED,
              submittedDate: new Date(),
              submissionMethod: 'electronic',
              batchId: response.batchId,
            },
          });
        }

        await auditLog('CLAIM_SUBMIT_TO_CLEARINGHOUSE', 'ClaimSubmission', {
          entityId: submission.id,
          changes: {
            claimId: claim.id,
            success: response.success,
            controlNumber: response.controlNumber,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return {
          submission,
          response,
        };
      } catch (error) {
        // Update submission with error
        await ctx.prisma.claimSubmission.update({
          where: { id: submission.id },
          data: {
            status: SubmissionStatus.ERROR,
            responseMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Claim submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Submit batch of claims
  submitClaimBatch: billerProcedure
    .input(
      z.object({
        claimIds: z.array(z.string()).min(1, 'At least one claim is required'),
        clearinghouseConfigId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get clearinghouse config
      let configId = input.clearinghouseConfigId;
      if (!configId) {
        const primary = await ctx.prisma.clearinghouseConfig.findFirst({
          where: { organizationId: ctx.user.organizationId, isPrimary: true, isActive: true },
        });
        if (!primary) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No clearinghouse configuration found',
          });
        }
        configId = primary.id;
      }

      const config = await ctx.prisma.clearinghouseConfig.findFirst({
        where: { id: configId, organizationId: ctx.user.organizationId },
      });

      if (!config) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Clearinghouse configuration not found' });
      }

      const provider = await createClearinghouseProvider(config as unknown as ClearinghouseConfigData);
      const response = await provider.submitClaimBatch({
        clearinghouseConfigId: configId,
        claimIds: input.claimIds,
      });

      // Create submission records for each claim
      for (const result of response.results) {
        await ctx.prisma.claimSubmission.create({
          data: {
            claimId: result.claimId,
            organizationId: ctx.user.organizationId,
            clearinghouseConfigId: configId,
            status: result.success ? SubmissionStatus.SUBMITTED : SubmissionStatus.ERROR,
            batchId: response.batchId,
            controlNumber: result.controlNumber,
            responseMessage: result.error,
          },
        });

        // Update claim status
        if (result.success) {
          await ctx.prisma.claim.update({
            where: { id: result.claimId },
            data: {
              status: ClaimStatus.SUBMITTED,
              submittedDate: new Date(),
              submissionMethod: 'electronic',
              batchId: response.batchId,
            },
          });
        }
      }

      await auditLog('CLAIM_SUBMIT_TO_CLEARINGHOUSE', 'ClaimSubmission', {
        entityId: response.batchId,
        changes: {
          batchId: response.batchId,
          totalClaims: response.totalClaims,
          submittedClaims: response.submittedClaims,
          failedClaims: response.failedClaims,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return response;
    }),

  // Generate 837P EDI file for a claim (without submitting)
  generate837: billerProcedure
    .input(
      z.object({
        claimId: z.string(),
        clearinghouseConfigId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get claim with all related data
      const claim = await ctx.prisma.claim.findFirst({
        where: { id: input.claimId, organizationId: ctx.user.organizationId },
        include: {
          patient: { include: { demographics: true, contacts: { where: { isPrimary: true }, take: 1 } } },
          payer: true,
          insurancePolicy: true,
          encounter: { include: { diagnoses: true, provider: { include: { user: true } } } },
          claimLines: { include: { charge: true }, orderBy: { lineNumber: 'asc' } },
        },
      });

      if (!claim) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      // Get organization for billing info
      const organization = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      const settings = (organization?.settings || {}) as Record<string, unknown>;

      // Get clearinghouse config for sender/receiver IDs
      let configId = input.clearinghouseConfigId;
      if (!configId) {
        const primary = await ctx.prisma.clearinghouseConfig.findFirst({
          where: { organizationId: ctx.user.organizationId, isPrimary: true, isActive: true },
        });
        if (primary) {
          configId = primary.id;
        }
      }

      let edi837Config: Partial<EDI837Config> = {
        senderId: (settings.submitterId as string) || organization?.subdomain || 'CHIROFLOW',
        receiverId: claim.payer?.payerId || 'PAYER',
        submitterName: organization?.name || 'Provider',
        submitterId: (settings.taxId as string) || '',
        submitterContactName: (settings.contactName as string) || undefined,
        submitterContactPhone: (settings.phone as string) || undefined,
        submitterContactEmail: (settings.email as string) || undefined,
        usageIndicator: 'P',
      };

      if (configId) {
        const config = await ctx.prisma.clearinghouseConfig.findFirst({
          where: { id: configId, organizationId: ctx.user.organizationId },
        });

        if (config) {
          edi837Config = {
            ...edi837Config,
            senderId: config.submitterId || edi837Config.senderId,
            receiverId: claim.payer?.payerId || edi837Config.receiverId,
          };
        }
      }

      // Build submission request
      const submissionRequest: ClaimSubmissionRequest = {
        claimId: claim.id,
        clearinghouseConfigId: configId || '',
        patient: {
          id: claim.patient.id,
          firstName: claim.patient.demographics?.firstName || '',
          lastName: claim.patient.demographics?.lastName || '',
          dateOfBirth: claim.patient.demographics?.dateOfBirth || new Date(),
          gender: claim.patient.demographics?.gender || 'U',
          address: claim.patient.contacts[0]
            ? {
                line1: claim.patient.contacts[0].addressLine1 || '',
                line2: claim.patient.contacts[0].addressLine2 || undefined,
                city: claim.patient.contacts[0].city || '',
                state: claim.patient.contacts[0].state || '',
                zip: claim.patient.contacts[0].zipCode || '',
              }
            : undefined,
        },
        insurance: {
          payerId: claim.payer?.payerId || '',
          payerName: claim.payer?.name || '',
          subscriberId: claim.insurancePolicy?.subscriberId || claim.insurancePolicy?.policyNumber || '',
          groupNumber: claim.insurancePolicy?.groupNumber || undefined,
          relationshipCode: claim.insurancePolicy?.subscriberRelationship || '18',
          subscriber: claim.insurancePolicy?.subscriberRelationship !== 'SELF'
            ? {
                firstName: claim.insurancePolicy?.subscriberFirstName || '',
                lastName: claim.insurancePolicy?.subscriberLastName || '',
                dateOfBirth: claim.insurancePolicy?.subscriberDob || undefined,
              }
            : undefined,
        },
        provider: {
          npi: claim.renderingNpi || claim.encounter?.provider?.npiNumber || (settings.billingNpi as string) || '',
          taxId: (settings.taxId as string) || undefined,
          name: organization?.name || 'Provider',
          address: {
            line1: (settings.address as string) || '',
            city: (settings.city as string) || '',
            state: (settings.state as string) || '',
            zip: (settings.zip as string) || '',
          },
        },
        claim: {
          id: claim.id,
          claimNumber: claim.claimNumber || claim.id,
          totalCharges: Number(claim.totalCharges),
          claimType: claim.claimType,
          placeOfService: claim.claimLines[0]?.placeOfService || '11',
          diagnoses:
            claim.encounter?.diagnoses.map((d, i) => ({
              code: d.icd10Code,
              sequence: i + 1,
              isPrimary: d.isPrimary || i === 0,
            })) || [],
          services: claim.claimLines.map((line) => ({
            lineNumber: line.lineNumber,
            cptCode: line.cptCode,
            modifiers: line.modifiers as string[],
            description: line.description || '',
            units: line.units,
            chargeAmount: Number(line.chargedAmount),
            serviceDateFrom: line.serviceDateFrom,
            serviceDateTo: line.serviceDateTo,
            diagnosisPointers: line.diagnosisPointers as number[],
            placeOfService: line.placeOfService || '11',
          })),
        },
      };

      // Validate claim data
      const validation = validateClaimFor837(submissionRequest);

      // Generate 837P EDI content
      const result = generate837P(
        submissionRequest,
        edi837Config as EDI837Config
      );

      await auditLog('EDI_837_GENERATE', 'Claim', {
        entityId: claim.id,
        changes: {
          claimNumber: claim.claimNumber,
          controlNumber: result.controlNumber,
          success: result.success,
          segmentCount: result.segmentCount,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: result.success,
        ediContent: result.ediContent,
        controlNumber: result.controlNumber,
        segmentCount: result.segmentCount,
        errors: [...validation.errors, ...result.errors],
        warnings: [...validation.warnings, ...result.warnings],
        claim: {
          id: claim.id,
          claimNumber: claim.claimNumber,
          totalCharges: claim.totalCharges,
        },
      };
    }),

  // Validate claim for 837P generation
  validate837: billerProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get claim with all related data
      const claim = await ctx.prisma.claim.findFirst({
        where: { id: input.claimId, organizationId: ctx.user.organizationId },
        include: {
          patient: { include: { demographics: true, contacts: { where: { isPrimary: true }, take: 1 } } },
          payer: true,
          insurancePolicy: true,
          encounter: { include: { diagnoses: true, provider: { include: { user: true } } } },
          claimLines: { include: { charge: true }, orderBy: { lineNumber: 'asc' } },
        },
      });

      if (!claim) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      // Get organization for billing info
      const organization = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      const settings = (organization?.settings || {}) as Record<string, unknown>;

      // Build submission request for validation
      const submissionRequest: ClaimSubmissionRequest = {
        claimId: claim.id,
        clearinghouseConfigId: '',
        patient: {
          id: claim.patient.id,
          firstName: claim.patient.demographics?.firstName || '',
          lastName: claim.patient.demographics?.lastName || '',
          dateOfBirth: claim.patient.demographics?.dateOfBirth || new Date(),
          gender: claim.patient.demographics?.gender || 'U',
          address: claim.patient.contacts[0]
            ? {
                line1: claim.patient.contacts[0].addressLine1 || '',
                line2: claim.patient.contacts[0].addressLine2 || undefined,
                city: claim.patient.contacts[0].city || '',
                state: claim.patient.contacts[0].state || '',
                zip: claim.patient.contacts[0].zipCode || '',
              }
            : undefined,
        },
        insurance: {
          payerId: claim.payer?.payerId || '',
          payerName: claim.payer?.name || '',
          subscriberId: claim.insurancePolicy?.subscriberId || claim.insurancePolicy?.policyNumber || '',
          groupNumber: claim.insurancePolicy?.groupNumber || undefined,
          relationshipCode: claim.insurancePolicy?.subscriberRelationship || '18',
        },
        provider: {
          npi: claim.renderingNpi || claim.encounter?.provider?.npiNumber || (settings.billingNpi as string) || '',
          taxId: (settings.taxId as string) || undefined,
          name: organization?.name || 'Provider',
        },
        claim: {
          id: claim.id,
          claimNumber: claim.claimNumber || claim.id,
          totalCharges: Number(claim.totalCharges),
          claimType: claim.claimType,
          placeOfService: claim.claimLines[0]?.placeOfService || '11',
          diagnoses:
            claim.encounter?.diagnoses.map((d, i) => ({
              code: d.icd10Code,
              sequence: i + 1,
              isPrimary: d.isPrimary || i === 0,
            })) || [],
          services: claim.claimLines.map((line) => ({
            lineNumber: line.lineNumber,
            cptCode: line.cptCode,
            modifiers: line.modifiers as string[],
            description: line.description || '',
            units: line.units,
            chargeAmount: Number(line.chargedAmount),
            serviceDateFrom: line.serviceDateFrom,
            serviceDateTo: line.serviceDateTo,
            diagnosisPointers: line.diagnosisPointers as number[],
            placeOfService: line.placeOfService || '11',
          })),
        },
      };

      // Validate claim data
      const validation = validateClaimFor837(submissionRequest);

      return {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        claim: {
          id: claim.id,
          claimNumber: claim.claimNumber,
          status: claim.status,
          totalCharges: claim.totalCharges,
          serviceLineCount: claim.claimLines.length,
          diagnosisCount: claim.encounter?.diagnoses.length || 0,
        },
      };
    }),

  // List claim submissions
  listSubmissions: protectedProcedure
    .input(
      z.object({
        claimId: z.string().optional(),
        status: z.nativeEnum(SubmissionStatus).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { claimId, status, startDate, endDate, page, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (claimId) where.claimId = claimId;
      if (status) where.status = status;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
        if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
      }

      const [submissions, total] = await Promise.all([
        ctx.prisma.claimSubmission.findMany({
          where,
          include: {
            claim: {
              include: {
                patient: { include: { demographics: { select: { firstName: true, lastName: true } } } },
                payer: { select: { name: true } },
              },
            },
            clearinghouseConfig: { select: { name: true, provider: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.claimSubmission.count({ where }),
      ]);

      return {
        submissions,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }),

  // ============================================
  // Eligibility Verification (270/271)
  // ============================================

  // Check eligibility
  checkEligibility: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        insurancePolicyId: z.string().optional(),
        clearinghouseConfigId: z.string().optional(),
        serviceDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get patient with insurance
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: input.patientId, organizationId: ctx.user.organizationId },
        include: {
          demographics: true,
          insurances: {
            where: input.insurancePolicyId
              ? { id: input.insurancePolicyId }
              : { type: 'PRIMARY', isActive: true },
            include: { insurancePayer: true },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      }

      const insurance = patient.insurances[0];
      if (!insurance) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active insurance found for patient' });
      }

      // Get clearinghouse config
      let configId = input.clearinghouseConfigId;
      if (!configId) {
        const primary = await ctx.prisma.clearinghouseConfig.findFirst({
          where: { organizationId: ctx.user.organizationId, isPrimary: true, isActive: true },
        });
        if (!primary) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No clearinghouse configuration found',
          });
        }
        configId = primary.id;
      }

      const config = await ctx.prisma.clearinghouseConfig.findFirst({
        where: { id: configId, organizationId: ctx.user.organizationId },
      });

      if (!config) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Clearinghouse configuration not found' });
      }

      // Build eligibility request
      const eligibilityRequest: EligibilityRequest = {
        clearinghouseConfigId: configId,
        patientId: patient.id,
        insuranceId: insurance.id,
        patient: {
          firstName: patient.demographics?.firstName || '',
          lastName: patient.demographics?.lastName || '',
          dateOfBirth: patient.demographics?.dateOfBirth || new Date(),
          gender: patient.demographics?.gender,
        },
        subscriber:
          insurance.subscriberRelationship !== 'SELF'
            ? {
                memberId: insurance.subscriberId || '',
                firstName: insurance.subscriberFirstName || patient.demographics?.firstName || '',
                lastName: insurance.subscriberLastName || patient.demographics?.lastName || '',
                dateOfBirth: insurance.subscriberDob || undefined,
                relationshipCode: insurance.subscriberRelationship || 'SELF',
              }
            : undefined,
        payer: {
          payerId: insurance.insurancePayer?.payerId || '',
          payerName: insurance.insurancePayer?.name || '',
        },
        serviceDate: input.serviceDate,
        serviceTypes: ['30'], // Chiropractic service type
      };

      // Create eligibility check record
      const eligibilityCheck = await ctx.prisma.eligibilityCheck.create({
        data: {
          patientId: patient.id,
          insuranceId: insurance.id,
          organizationId: ctx.user.organizationId,
          clearinghouseConfigId: configId,
          payerId: insurance.insurancePayer?.payerId,
          payerName: insurance.insurancePayer?.name,
          serviceDate: input.serviceDate || new Date(),
          serviceTypes: eligibilityRequest.serviceTypes,
          subscriberId: insurance.subscriberId,
          subscriberName: insurance.subscriberFirstName && insurance.subscriberLastName
            ? `${insurance.subscriberFirstName} ${insurance.subscriberLastName}`
            : null,
          subscriberDob: insurance.subscriberDob,
          relationshipCode: insurance.subscriberRelationship,
          status: EligibilityStatus.PENDING,
        },
      });

      try {
        // Check eligibility via clearinghouse
        const provider = await createClearinghouseProvider(config as unknown as ClearinghouseConfigData);
        const response = await provider.checkEligibility(eligibilityRequest);

        // Update eligibility check with response
        await ctx.prisma.eligibilityCheck.update({
          where: { id: eligibilityCheck.id },
          data: {
            status: response.status,
            responseDate: new Date(),
            coverageStatus: response.coverage.status,
            planName: response.coverage.planName,
            planType: response.coverage.planType,
            // Benefits
            deductible: response.benefits.deductible,
            deductibleMet: response.benefits.deductibleMet,
            outOfPocketMax: response.benefits.outOfPocketMax,
            outOfPocketMet: response.benefits.outOfPocketMet,
            copay: response.benefits.copay,
            coinsurance: response.benefits.coinsurance,
            // Visit limits
            visitsRemaining: response.visitLimits?.remaining,
            visitsUsed: response.visitLimits?.used,
            visitsMax: response.visitLimits?.max,
            // Authorization
            authRequired: response.authorization?.required || false,
            authNumber: response.authorization?.number,
            // Raw response
            responseJson: response as unknown as object,
            ediRequest: response.ediRequest,
            ediResponse: response.ediResponse,
          },
        });

        await auditLog('ELIGIBILITY_CHECK', 'EligibilityCheck', {
          entityId: eligibilityCheck.id,
          changes: {
            patientId: patient.id,
            status: response.status,
            planName: response.coverage.planName,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return {
          eligibilityCheck,
          response,
        };
      } catch (error) {
        await ctx.prisma.eligibilityCheck.update({
          where: { id: eligibilityCheck.id },
          data: {
            status: EligibilityStatus.ERROR,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Eligibility check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // List eligibility checks for a patient
  listEligibilityChecks: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        status: z.nativeEnum(EligibilityStatus).optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (input.patientId) where.patientId = input.patientId;
      if (input.status) where.status = input.status;

      const checks = await ctx.prisma.eligibilityCheck.findMany({
        where,
        include: {
          patient: { include: { demographics: { select: { firstName: true, lastName: true } } } },
          insurance: { include: { insurancePayer: true } },
        },
        orderBy: { checkDate: 'desc' },
        take: input.limit,
      });

      return checks;
    }),

  // Get latest eligibility for a patient (with caching support)
  getLatestEligibility: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        insuranceId: z.string().optional(),
        maxAgeDays: z.number().min(1).max(90).default(7), // Cache validity in days
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, insuranceId, maxAgeDays } = input;

      // Calculate cache expiry date
      const cacheExpiryDate = new Date();
      cacheExpiryDate.setDate(cacheExpiryDate.getDate() - maxAgeDays);

      // Build where clause for finding latest eligibility check
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        patientId,
        checkDate: { gte: cacheExpiryDate },
        status: { in: [EligibilityStatus.ACTIVE, EligibilityStatus.INACTIVE] },
      };

      if (insuranceId) {
        where.insuranceId = insuranceId;
      }

      // Get the most recent eligibility check within cache period
      const latestCheck = await ctx.prisma.eligibilityCheck.findFirst({
        where,
        include: {
          insurance: {
            include: { insurancePayer: true },
          },
        },
        orderBy: { checkDate: 'desc' },
      });

      // If no insurance specified, also get checks for each active insurance
      let allInsuranceChecks: typeof latestCheck[] = [];
      if (!insuranceId) {
        const patient = await ctx.prisma.patient.findFirst({
          where: { id: patientId, organizationId: ctx.user.organizationId },
          include: {
            insurances: {
              where: { isActive: true },
              orderBy: { type: 'asc' }, // PRIMARY first
            },
          },
        });

        if (patient?.insurances) {
          for (const ins of patient.insurances) {
            const check = await ctx.prisma.eligibilityCheck.findFirst({
              where: {
                organizationId: ctx.user.organizationId,
                patientId,
                insuranceId: ins.id,
                checkDate: { gte: cacheExpiryDate },
                status: { in: [EligibilityStatus.ACTIVE, EligibilityStatus.INACTIVE] },
              },
              include: {
                insurance: {
                  include: { insurancePayer: true },
                },
              },
              orderBy: { checkDate: 'desc' },
            });
            if (check) allInsuranceChecks.push(check);
          }
        }
      }

      const cacheAgeHours = latestCheck
        ? Math.floor((Date.now() - new Date(latestCheck.checkDate).getTime()) / (1000 * 60 * 60))
        : null;

      return {
        latestCheck,
        allInsuranceChecks,
        isCached: latestCheck !== null,
        cacheAgeHours,
        cacheExpiryDays: maxAgeDays,
        needsRefresh: latestCheck === null || cacheAgeHours === null || cacheAgeHours > maxAgeDays * 24,
      };
    }),

  // Check if cached eligibility exists and is valid
  getCachedEligibility: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        insuranceId: z.string(),
        maxAgeHours: z.number().min(1).max(720).default(24), // Default 24 hours
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, insuranceId, maxAgeHours } = input;

      const cacheExpiryDate = new Date();
      cacheExpiryDate.setHours(cacheExpiryDate.getHours() - maxAgeHours);

      const cachedCheck = await ctx.prisma.eligibilityCheck.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          patientId,
          insuranceId,
          checkDate: { gte: cacheExpiryDate },
          status: { in: [EligibilityStatus.ACTIVE, EligibilityStatus.INACTIVE] },
        },
        include: {
          insurance: {
            include: { insurancePayer: true },
          },
        },
        orderBy: { checkDate: 'desc' },
      });

      if (!cachedCheck) {
        return {
          isCached: false,
          cachedCheck: null,
          cacheAgeMinutes: null,
          expiresInMinutes: null,
        };
      }

      const cacheAgeMs = Date.now() - new Date(cachedCheck.checkDate).getTime();
      const cacheAgeMinutes = Math.floor(cacheAgeMs / (1000 * 60));
      const expiresInMinutes = Math.max(0, maxAgeHours * 60 - cacheAgeMinutes);

      return {
        isCached: true,
        cachedCheck,
        cacheAgeMinutes,
        expiresInMinutes,
      };
    }),

  // Check eligibility with optional cache bypass
  checkEligibilityWithCache: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        insurancePolicyId: z.string().optional(),
        clearinghouseConfigId: z.string().optional(),
        serviceDate: z.date().optional(),
        forceRefresh: z.boolean().default(false), // Bypass cache if true
        cacheHours: z.number().min(1).max(168).default(24), // Cache validity (default 24 hours)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, forceRefresh, cacheHours } = input;

      // Check for cached result first (unless force refresh)
      if (!forceRefresh) {
        const cacheExpiryDate = new Date();
        cacheExpiryDate.setHours(cacheExpiryDate.getHours() - cacheHours);

        const where: Record<string, unknown> = {
          organizationId: ctx.user.organizationId,
          patientId,
          checkDate: { gte: cacheExpiryDate },
          status: { in: [EligibilityStatus.ACTIVE, EligibilityStatus.INACTIVE] },
        };

        if (input.insurancePolicyId) {
          where.insuranceId = input.insurancePolicyId;
        }

        const cachedCheck = await ctx.prisma.eligibilityCheck.findFirst({
          where,
          include: {
            insurance: { include: { insurancePayer: true } },
          },
          orderBy: { checkDate: 'desc' },
        });

        if (cachedCheck) {
          // Return cached result
          return {
            fromCache: true,
            cacheAgeMinutes: Math.floor((Date.now() - new Date(cachedCheck.checkDate).getTime()) / (1000 * 60)),
            eligibilityCheck: cachedCheck,
            response: {
              success: true,
              status: cachedCheck.status,
              responseDate: cachedCheck.responseDate,
              coverage: {
                status: cachedCheck.coverageStatus || 'Unknown',
                planName: cachedCheck.planName,
                planType: cachedCheck.planType,
              },
              benefits: {
                deductible: cachedCheck.deductible ? Number(cachedCheck.deductible) : undefined,
                deductibleMet: cachedCheck.deductibleMet ? Number(cachedCheck.deductibleMet) : undefined,
                outOfPocketMax: cachedCheck.outOfPocketMax ? Number(cachedCheck.outOfPocketMax) : undefined,
                outOfPocketMet: cachedCheck.outOfPocketMet ? Number(cachedCheck.outOfPocketMet) : undefined,
                copay: cachedCheck.copay ? Number(cachedCheck.copay) : undefined,
                coinsurance: cachedCheck.coinsurance ? Number(cachedCheck.coinsurance) : undefined,
              },
              visitLimits: cachedCheck.visitsMax
                ? {
                    max: cachedCheck.visitsMax,
                    used: cachedCheck.visitsUsed || 0,
                    remaining: cachedCheck.visitsRemaining || 0,
                  }
                : undefined,
              authorization: {
                required: cachedCheck.authRequired || false,
                number: cachedCheck.authNumber || undefined,
              },
            },
          };
        }
      }

      // No cache or force refresh - perform actual eligibility check
      // Get patient with insurance
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
        include: {
          demographics: true,
          insurances: {
            where: input.insurancePolicyId
              ? { id: input.insurancePolicyId }
              : { type: 'PRIMARY', isActive: true },
            include: { insurancePayer: true },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      }

      const insurance = patient.insurances[0];
      if (!insurance) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active insurance found for patient' });
      }

      // Get clearinghouse config
      let configId = input.clearinghouseConfigId;
      if (!configId) {
        const primary = await ctx.prisma.clearinghouseConfig.findFirst({
          where: { organizationId: ctx.user.organizationId, isPrimary: true, isActive: true },
        });
        if (!primary) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No clearinghouse configuration found',
          });
        }
        configId = primary.id;
      }

      const config = await ctx.prisma.clearinghouseConfig.findFirst({
        where: { id: configId, organizationId: ctx.user.organizationId },
      });

      if (!config) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Clearinghouse configuration not found' });
      }

      // Build eligibility request
      const eligibilityRequest: EligibilityRequest = {
        clearinghouseConfigId: configId,
        patientId: patient.id,
        insuranceId: insurance.id,
        patient: {
          firstName: patient.demographics?.firstName || '',
          lastName: patient.demographics?.lastName || '',
          dateOfBirth: patient.demographics?.dateOfBirth || new Date(),
          gender: patient.demographics?.gender,
        },
        subscriber:
          insurance.subscriberRelationship !== 'SELF'
            ? {
                memberId: insurance.subscriberId || '',
                firstName: insurance.subscriberFirstName || patient.demographics?.firstName || '',
                lastName: insurance.subscriberLastName || patient.demographics?.lastName || '',
                dateOfBirth: insurance.subscriberDob || undefined,
                relationshipCode: insurance.subscriberRelationship || 'SELF',
              }
            : undefined,
        payer: {
          payerId: insurance.insurancePayer?.payerId || '',
          payerName: insurance.insurancePayer?.name || '',
        },
        serviceDate: input.serviceDate,
        serviceTypes: ['30'], // Chiropractic service type
      };

      // Create eligibility check record
      const eligibilityCheck = await ctx.prisma.eligibilityCheck.create({
        data: {
          patientId: patient.id,
          insuranceId: insurance.id,
          organizationId: ctx.user.organizationId,
          clearinghouseConfigId: configId,
          payerId: insurance.insurancePayer?.payerId,
          payerName: insurance.insurancePayer?.name,
          serviceDate: input.serviceDate || new Date(),
          serviceTypes: eligibilityRequest.serviceTypes,
          subscriberId: insurance.subscriberId,
          subscriberName: insurance.subscriberFirstName && insurance.subscriberLastName
            ? `${insurance.subscriberFirstName} ${insurance.subscriberLastName}`
            : null,
          subscriberDob: insurance.subscriberDob,
          relationshipCode: insurance.subscriberRelationship,
          status: EligibilityStatus.PENDING,
        },
      });

      try {
        // Check eligibility via clearinghouse
        const provider = await createClearinghouseProvider(config as unknown as ClearinghouseConfigData);
        const response = await provider.checkEligibility(eligibilityRequest);

        // Update eligibility check with response
        const updatedCheck = await ctx.prisma.eligibilityCheck.update({
          where: { id: eligibilityCheck.id },
          data: {
            status: response.status,
            responseDate: new Date(),
            coverageStatus: response.coverage.status,
            planName: response.coverage.planName,
            planType: response.coverage.planType,
            // Benefits
            deductible: response.benefits.deductible,
            deductibleMet: response.benefits.deductibleMet,
            outOfPocketMax: response.benefits.outOfPocketMax,
            outOfPocketMet: response.benefits.outOfPocketMet,
            copay: response.benefits.copay,
            coinsurance: response.benefits.coinsurance,
            // Visit limits
            visitsRemaining: response.visitLimits?.remaining,
            visitsUsed: response.visitLimits?.used,
            visitsMax: response.visitLimits?.max,
            // Authorization
            authRequired: response.authorization?.required || false,
            authNumber: response.authorization?.number,
            // Raw response
            responseJson: response as unknown as object,
            ediRequest: response.ediRequest,
            ediResponse: response.ediResponse,
          },
          include: {
            insurance: { include: { insurancePayer: true } },
          },
        });

        await auditLog('ELIGIBILITY_CHECK', 'EligibilityCheck', {
          entityId: eligibilityCheck.id,
          changes: {
            patientId: patient.id,
            status: response.status,
            planName: response.coverage.planName,
            fromCache: false,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return {
          fromCache: false,
          cacheAgeMinutes: 0,
          eligibilityCheck: updatedCheck,
          response,
        };
      } catch (error) {
        await ctx.prisma.eligibilityCheck.update({
          where: { id: eligibilityCheck.id },
          data: {
            status: EligibilityStatus.ERROR,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Eligibility check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // ============================================
  // Claim Status (276/277)
  // ============================================

  // Check claim status
  checkClaimStatus: billerProcedure
    .input(
      z.object({
        claimId: z.string(),
        clearinghouseConfigId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.prisma.claim.findFirst({
        where: { id: input.claimId, organizationId: ctx.user.organizationId },
        include: {
          patient: { include: { demographics: true } },
          payer: true,
          insurancePolicy: true,
          claimLines: { orderBy: { lineNumber: 'asc' } },
        },
      });

      if (!claim) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      // Get clearinghouse config
      let configId = input.clearinghouseConfigId;
      if (!configId) {
        const primary = await ctx.prisma.clearinghouseConfig.findFirst({
          where: { organizationId: ctx.user.organizationId, isPrimary: true, isActive: true },
        });
        if (!primary) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No clearinghouse configuration found',
          });
        }
        configId = primary.id;
      }

      const config = await ctx.prisma.clearinghouseConfig.findFirst({
        where: { id: configId, organizationId: ctx.user.organizationId },
      });

      if (!config) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Clearinghouse configuration not found' });
      }

      // Build status request
      const statusRequest: ClaimStatusRequest = {
        clearinghouseConfigId: configId,
        claimId: claim.id,
        claimNumber: claim.claimNumber || undefined,
        payerClaimNumber: claim.payerClaimNumber || undefined,
        patient: {
          firstName: claim.patient.demographics?.firstName || '',
          lastName: claim.patient.demographics?.lastName || '',
          dateOfBirth: claim.patient.demographics?.dateOfBirth || new Date(),
          memberId: claim.insurancePolicy?.subscriberId || undefined,
        },
        payer: {
          payerId: claim.payer?.payerId || '',
          payerName: claim.payer?.name || '',
        },
        serviceDateFrom: claim.claimLines[0]?.serviceDateFrom,
        serviceDateTo: claim.claimLines[claim.claimLines.length - 1]?.serviceDateTo,
      };

      // Create status check record
      const statusCheck = await ctx.prisma.claimStatusCheck.create({
        data: {
          claimId: claim.id,
          organizationId: ctx.user.organizationId,
          clearinghouseConfigId: configId,
        },
      });

      try {
        // Check status via clearinghouse
        const provider = await createClearinghouseProvider(config as unknown as ClearinghouseConfigData);
        const response = await provider.checkClaimStatus(statusRequest);

        // Update status check with response
        await ctx.prisma.claimStatusCheck.update({
          where: { id: statusCheck.id },
          data: {
            status: 'ACCEPTED',
            responseDate: new Date(),
            claimStatus: response.claimStatus.categoryCode,
            statusCode: response.claimStatus.statusCode,
            statusDescription: response.claimStatus.statusDescription,
            payerClaimNumber: response.payerClaimNumber,
            traceNumber: response.traceNumber,
            // Financial info
            totalPaid: response.financial?.totalPaid,
            totalCharged: response.financial?.totalCharged,
            checkNumber: response.financial?.checkNumber,
            adjudicationDate: response.financial?.adjudicationDate,
            paymentDate: response.financial?.paymentDate,
            // Raw response
            responseJson: response as unknown as object,
            ediRequest: response.ediRequest,
            ediResponse: response.ediResponse,
          },
        });

        // Update claim with payer claim number if provided
        if (response.payerClaimNumber && !claim.payerClaimNumber) {
          await ctx.prisma.claim.update({
            where: { id: claim.id },
            data: { payerClaimNumber: response.payerClaimNumber },
          });
        }

        await auditLog('CLAIM_STATUS_CHECK', 'ClaimStatusCheck', {
          entityId: statusCheck.id,
          changes: {
            claimId: claim.id,
            categoryCode: response.claimStatus.categoryCode,
            categoryDescription: response.claimStatus.categoryDescription,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return {
          statusCheck,
          response,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Claim status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // ============================================
  // Remittance Processing (835)
  // ============================================

  // Fetch remittances
  fetchRemittances: billerProcedure
    .input(
      z.object({
        clearinghouseConfigId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        checkNumber: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get clearinghouse config
      let configId = input.clearinghouseConfigId;
      if (!configId) {
        const primary = await ctx.prisma.clearinghouseConfig.findFirst({
          where: { organizationId: ctx.user.organizationId, isPrimary: true, isActive: true },
        });
        if (!primary) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No clearinghouse configuration found',
          });
        }
        configId = primary.id;
      }

      const config = await ctx.prisma.clearinghouseConfig.findFirst({
        where: { id: configId, organizationId: ctx.user.organizationId },
      });

      if (!config) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Clearinghouse configuration not found' });
      }

      // Fetch remittances
      const provider = await createClearinghouseProvider(config as unknown as ClearinghouseConfigData);
      const remittances = await provider.fetchRemittances({
        clearinghouseConfigId: configId,
        startDate: input.startDate,
        endDate: input.endDate,
        checkNumber: input.checkNumber,
      });

      // Store remittances in database
      const stored = [];
      for (const remittance of remittances) {
        const existing = await ctx.prisma.remittance.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            checkNumber: remittance.checkNumber,
          },
        });

        if (!existing) {
          const newRemittance = await ctx.prisma.remittance.create({
            data: {
              organizationId: ctx.user.organizationId,
              clearinghouseConfigId: configId,
              checkNumber: remittance.checkNumber,
              checkDate: remittance.checkDate,
              payerName: remittance.payerName,
              payerId: remittance.payerId,
              totalPaid: remittance.totalPaid,
              totalAdjusted: remittance.totalAdjusted,
              totalCharges: remittance.totalCharges,
              ediContent: remittance.ediContent,
              parsedData: remittance as unknown as object,
              claimCount: remittance.claims?.length || 0,
            },
          });

          stored.push(newRemittance);

          await auditLog('REMITTANCE_RECEIVE', 'Remittance', {
            entityId: newRemittance.id,
            changes: {
              checkNumber: remittance.checkNumber,
              totalPaid: remittance.totalPaid,
              claimCount: remittance.claims.length,
            },
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          });
        }
      }

      return {
        fetched: remittances.length,
        stored: stored.length,
        remittances: stored,
      };
    }),

  // List remittances
  listRemittances: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { status, startDate, endDate, page, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (status) where.status = status;

      if (startDate || endDate) {
        where.checkDate = {};
        if (startDate) (where.checkDate as Record<string, Date>).gte = startDate;
        if (endDate) (where.checkDate as Record<string, Date>).lte = endDate;
      }

      const [remittances, total] = await Promise.all([
        ctx.prisma.remittance.findMany({
          where,
          include: {
            _count: { select: { lineItems: true } },
          },
          orderBy: { checkDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.remittance.count({ where }),
      ]);

      return {
        remittances,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }),

  // Get remittance details
  getRemittance: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const remittance = await ctx.prisma.remittance.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
        include: {
          lineItems: {
            include: {
              claim: { select: { claimNumber: true } },
              charge: { select: { cptCode: true, description: true } },
            },
          },
        },
      });

      if (!remittance) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Remittance not found' });
      }

      return remittance;
    }),

  // ============================================
  // Denial Management
  // ============================================

  // List denials
  listDenials: protectedProcedure
    .input(
      z.object({
        status: z.nativeEnum(DenialStatus).optional(),
        patientId: z.string().optional(),
        claimId: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { status, patientId, claimId, page, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (status) where.status = status;
      if (patientId) where.patientId = patientId;
      if (claimId) where.claimId = claimId;

      const [denials, total] = await Promise.all([
        ctx.prisma.denial.findMany({
          where,
          include: {
            patient: { include: { demographics: { select: { firstName: true, lastName: true } } } },
            claim: { select: { claimNumber: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.denial.count({ where }),
      ]);

      return {
        denials,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }),

  // Get denial details
  getDenial: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const denial = await ctx.prisma.denial.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
        include: {
          patient: { include: { demographics: { select: { firstName: true, lastName: true } } } },
          claim: {
            include: {
              claimLines: true,
              payer: true,
            },
          },
          notes: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!denial) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Denial not found' });
      }

      // Add CARC description if available
      const carcInfo = denial.denialCode ? COMMON_CARC_CODES[denial.denialCode] : null;

      return {
        ...denial,
        denialCodeDescription: carcInfo?.description,
        denialCategory: carcInfo?.category,
      };
    }),

  // Update denial status
  updateDenial: billerProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(DenialStatus),
        notes: z.string().optional(),
        appealDeadline: z.date().optional(),
        appealDate: z.date().optional(),
        appealNumber: z.string().optional(),
        resolution: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, notes, ...updateData } = input;

      const existing = await ctx.prisma.denial.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Denial not found' });
      }

      const denial = await ctx.prisma.$transaction(async (tx) => {
        const updated = await tx.denial.update({
          where: { id },
          data: {
            ...updateData,
            resolvedAt:
              updateData.status === DenialStatus.RESOLVED ||
              updateData.status === DenialStatus.WRITTEN_OFF
                ? new Date()
                : existing.resolvedAt,
          },
        });

        if (notes) {
          await tx.denialNote.create({
            data: {
              denialId: id,
              noteType: 'status_change',
              note: notes,
              createdBy: ctx.user.id,
            },
          });
        }

        return updated;
      });

      const action =
        updateData.status === DenialStatus.APPEALED
          ? 'DENIAL_APPEAL'
          : updateData.status === DenialStatus.RESOLVED
            ? 'DENIAL_RESOLVE'
            : 'DENIAL_UPDATE';

      await auditLog(action, 'Denial', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return denial;
    }),

  // Add note to denial
  addDenialNote: billerProcedure
    .input(
      z.object({
        denialId: z.string(),
        noteType: z.string().default('general'),
        note: z.string().min(1, 'Note is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const denial = await ctx.prisma.denial.findFirst({
        where: { id: input.denialId, organizationId: ctx.user.organizationId },
      });

      if (!denial) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Denial not found' });
      }

      const note = await ctx.prisma.denialNote.create({
        data: {
          denialId: input.denialId,
          noteType: input.noteType,
          note: input.note,
          createdBy: ctx.user.id,
        },
      });

      return note;
    }),

  // Get denial statistics
  getDenialStats: protectedProcedure.query(async ({ ctx }) => {
    const [total, byStatus, byCategory] = await Promise.all([
      ctx.prisma.denial.count({
        where: { organizationId: ctx.user.organizationId },
      }),
      ctx.prisma.denial.groupBy({
        by: ['status'],
        where: { organizationId: ctx.user.organizationId },
        _count: true,
        _sum: { deniedAmount: true },
      }),
      ctx.prisma.denial.groupBy({
        by: ['category'],
        where: { organizationId: ctx.user.organizationId },
        _count: true,
        _sum: { deniedAmount: true },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count,
        totalDenied: Number(s._sum.deniedAmount || 0),
      })),
      byCategory: byCategory.map((c) => ({
        category: c.category || 'Uncategorized',
        count: c._count,
        totalDenied: Number(c._sum.deniedAmount || 0),
      })),
    };
  }),

  // ============================================
  // EDI 835 ERA Processing (US-074)
  // ============================================

  // Parse 835 EDI content and extract payment/adjustment data
  parseERA: billerProcedure
    .input(
      z.object({
        ediContent: z.string().min(1, 'EDI content is required'),
        remittanceId: z.string().optional(), // If updating existing remittance
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { ediContent, remittanceId } = input;

      // Validate content appears to be an 835
      if (!isERAContent(ediContent)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Content does not appear to be a valid EDI 835 remittance file',
        });
      }

      // Parse the 835
      const parseResult = parseERA(ediContent);

      if (!parseResult.success || !parseResult.remittance) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Failed to parse ERA: ${parseResult.errors.join(', ')}`,
        });
      }

      const remittance = parseResult.remittance;

      // Generate posting report
      const postingReport = generatePostingReport(remittance);

      // Match remittance lines to claims/charges
      const matchResults = await Promise.all(
        remittance.claims.flatMap((claim, claimIdx) =>
          claim.services.map(async (service, svcIdx) => {
            const lineNumber = claimIdx * 100 + svcIdx + 1;
            let matchedClaimId: string | null = null;
            let matchedChargeId: string | null = null;
            let matchConfidence: 'high' | 'medium' | 'low' | 'none' = 'none';
            let matchReason = 'No match found';

            // Try to find matching claim by patient account number (our claim number)
            if (claim.patientAccountNumber) {
              const matchedClaim = await ctx.prisma.claim.findFirst({
                where: {
                  organizationId: ctx.user.organizationId,
                  claimNumber: claim.patientAccountNumber,
                },
                include: {
                  claimLines: true,
                },
              });

              if (matchedClaim) {
                matchedClaimId = matchedClaim.id;
                matchConfidence = 'high';
                matchReason = `Matched by claim number: ${claim.patientAccountNumber}`;

                // Try to match specific charge by CPT code and date
                const matchedLine = matchedClaim.claimLines.find(
                  (line) =>
                    line.cptCode === service.cptCode &&
                    (!service.serviceDate ||
                      line.serviceDateFrom?.toDateString() === service.serviceDate.toDateString())
                );

                if (matchedLine) {
                  // Find the actual charge via claim line's chargeId
                  if (matchedLine.chargeId) {
                    matchedChargeId = matchedLine.chargeId;
                    matchConfidence = 'high';
                    matchReason = `Matched by claim number and CPT: ${service.cptCode}`;
                  } else {
                    // Try to find charge by CPT code and patient
                    const charge = await ctx.prisma.charge.findFirst({
                      where: {
                        organizationId: ctx.user.organizationId,
                        cptCode: service.cptCode,
                        patientId: matchedClaim.patientId,
                        serviceDate: service.serviceDate
                          ? {
                              gte: new Date(service.serviceDate.getTime() - 86400000),
                              lte: new Date(service.serviceDate.getTime() + 86400000),
                            }
                          : undefined,
                      },
                    });

                    if (charge) {
                      matchedChargeId = charge.id;
                      matchConfidence = 'medium';
                      matchReason = `Matched by CPT and patient: ${service.cptCode}`;
                    }
                  }
                }
              }
            }

            // Fallback: Try to match by payer claim number
            if (!matchedClaimId && claim.payerClaimNumber) {
              const matchedClaim = await ctx.prisma.claim.findFirst({
                where: {
                  organizationId: ctx.user.organizationId,
                  payerClaimNumber: claim.payerClaimNumber,
                },
              });

              if (matchedClaim) {
                matchedClaimId = matchedClaim.id;
                matchConfidence = 'medium';
                matchReason = `Matched by payer claim number: ${claim.payerClaimNumber}`;
              }
            }

            return {
              lineNumber,
              claimInfo: {
                patientName: claim.patientName,
                patientAccountNumber: claim.patientAccountNumber,
                payerClaimNumber: claim.payerClaimNumber,
              },
              service: {
                cptCode: service.cptCode,
                modifiers: service.modifiers,
                units: service.units,
                serviceDate: service.serviceDate,
                chargedAmount: service.chargedAmount,
                allowedAmount: service.allowedAmount,
                paidAmount: service.paidAmount,
                adjustedAmount: service.adjustedAmount,
                patientAmount: service.patientAmount,
                adjustmentReasonCodes: service.adjustmentReasonCodes,
                remarkCodes: service.remarkCodes,
              },
              matchedClaimId,
              matchedChargeId,
              matchConfidence,
              matchReason,
            };
          })
        )
      );

      // Create/update remittance record
      let savedRemittanceId = remittanceId;

      if (!savedRemittanceId) {
        // Check if remittance with this check number already exists
        const existing = await ctx.prisma.remittance.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            checkNumber: remittance.checkNumber,
          },
        });

        if (existing) {
          savedRemittanceId = existing.id;
        }
      }

      // Get primary clearinghouse config for new remittances
      let clearinghouseConfigId: string | undefined;
      if (!savedRemittanceId) {
        const primaryConfig = await ctx.prisma.clearinghouseConfig.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            isPrimary: true,
            isActive: true,
          },
        });
        clearinghouseConfigId = primaryConfig?.id;

        if (!clearinghouseConfigId) {
          // Use any active config
          const anyConfig = await ctx.prisma.clearinghouseConfig.findFirst({
            where: {
              organizationId: ctx.user.organizationId,
              isActive: true,
            },
          });
          clearinghouseConfigId = anyConfig?.id;
        }
      }

      // Upsert remittance
      const savedRemittance = savedRemittanceId
        ? await ctx.prisma.remittance.update({
            where: { id: savedRemittanceId },
            data: {
              payerName: remittance.payerName,
              payerId: remittance.payerId,
              checkDate: remittance.checkDate,
              totalPaid: remittance.totalPaid,
              totalAdjusted: remittance.totalAdjusted,
              totalCharges: remittance.totalCharges,
              claimCount: remittance.claims.length,
              ediContent: ediContent,
              parsedData: remittance as unknown as object,
            },
          })
        : clearinghouseConfigId
          ? await ctx.prisma.remittance.create({
              data: {
                organizationId: ctx.user.organizationId,
                clearinghouseConfigId,
                checkNumber: remittance.checkNumber || `ERA-${Date.now()}`,
                checkDate: remittance.checkDate,
                payerName: remittance.payerName,
                payerId: remittance.payerId,
                totalPaid: remittance.totalPaid,
                totalAdjusted: remittance.totalAdjusted,
                totalCharges: remittance.totalCharges,
                claimCount: remittance.claims.length,
                ediContent: ediContent,
                parsedData: remittance as unknown as object,
              },
            })
          : null;

      // Store line items
      if (savedRemittance) {
        // Delete existing line items if updating
        if (savedRemittanceId) {
          await ctx.prisma.remittanceLineItem.deleteMany({
            where: { remittanceId: savedRemittance.id },
          });
        }

        // Create line items
        for (const match of matchResults) {
          await ctx.prisma.remittanceLineItem.create({
            data: {
              remittanceId: savedRemittance.id,
              lineNumber: match.lineNumber,
              patientName: match.claimInfo.patientName,
              patientAccountNumber: match.claimInfo.patientAccountNumber,
              payerClaimNumber: match.claimInfo.payerClaimNumber,
              serviceDate: match.service.serviceDate,
              cptCode: match.service.cptCode,
              modifiers: match.service.modifiers,
              units: match.service.units,
              chargedAmount: match.service.chargedAmount,
              allowedAmount: match.service.allowedAmount,
              paidAmount: match.service.paidAmount,
              adjustedAmount: match.service.adjustedAmount,
              patientAmount: match.service.patientAmount,
              adjustmentReasonCodes: match.service.adjustmentReasonCodes,
              adjustmentAmounts: match.service.adjustmentReasonCodes.reduce(
                (acc, code) => ({
                  ...acc,
                  [code]: match.service.adjustmentReasonCodes.includes(code)
                    ? match.service.adjustedAmount / match.service.adjustmentReasonCodes.length
                    : 0,
                }),
                {}
              ),
              remarkCodes: match.service.remarkCodes,
              claimId: match.matchedClaimId,
              chargeId: match.matchedChargeId,
            },
          });
        }
      }

      await auditLog('REMITTANCE_PROCESS', 'Remittance', {
        entityId: savedRemittance?.id,
        changes: {
          checkNumber: remittance.checkNumber,
          totalPaid: remittance.totalPaid,
          totalAdjusted: remittance.totalAdjusted,
          lineItemCount: matchResults.length,
          matchedCount: matchResults.filter((m) => m.matchedClaimId).length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        remittanceId: savedRemittance?.id,
        parseResult: {
          checkNumber: remittance.checkNumber,
          checkDate: remittance.checkDate,
          payerName: remittance.payerName,
          totalPaid: remittance.totalPaid,
          totalAdjusted: remittance.totalAdjusted,
          totalCharges: remittance.totalCharges,
          claimCount: remittance.claims.length,
        },
        matchResults,
        postingReport,
        warnings: parseResult.warnings,
      };
    }),

  // Auto-post payments from ERA
  autoPost: billerProcedure
    .input(
      z.object({
        remittanceId: z.string(),
        lineItemIds: z.array(z.string()).optional(), // Specific lines to post, or all if empty
        postAdjustments: z.boolean().default(true), // Also post contractual adjustments
        createPatientResponsibility: z.boolean().default(true), // Create patient balance from PR adjustments
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { remittanceId, lineItemIds, postAdjustments, createPatientResponsibility } = input;

      // Get remittance with line items
      const remittance = await ctx.prisma.remittance.findFirst({
        where: { id: remittanceId, organizationId: ctx.user.organizationId },
        include: {
          lineItems: {
            where: lineItemIds ? { id: { in: lineItemIds } } : undefined,
            include: {
              claim: { include: { patient: true } },
              charge: true,
            },
          },
        },
      });

      if (!remittance) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Remittance not found' });
      }

      // Filter to unposted line items
      const unpostedItems = remittance.lineItems.filter((item) => !item.isPosted);

      if (unpostedItems.length === 0) {
        return {
          success: true,
          message: 'No unposted line items to process',
          totalPosted: 0,
          totalPayments: 0,
          totalAdjustments: 0,
          postedLines: [],
          errors: [],
        };
      }

      const postedLines: Array<{
        lineItemId: string;
        lineNumber: number;
        cptCode: string | null;
        paidAmount: number;
        adjustedAmount: number;
        claimId: string | null;
        chargeId: string | null;
        status: 'posted' | 'skipped' | 'error';
        message?: string;
      }> = [];
      const errors: string[] = [];
      let totalPayments = 0;
      let totalAdjustments = 0;

      // Process each line item in a transaction
      await ctx.prisma.$transaction(async (tx) => {
        for (const item of unpostedItems) {
          const paidAmount = Number(item.paidAmount);
          const adjustedAmount = Number(item.adjustedAmount);
          const patientAmount = Number(item.patientAmount);

          // Skip if no matched charge and we're posting to charges
          if (!item.chargeId) {
            postedLines.push({
              lineItemId: item.id,
              lineNumber: item.lineNumber,
              cptCode: item.cptCode,
              paidAmount,
              adjustedAmount,
              claimId: item.claimId,
              chargeId: null,
              status: 'skipped',
              message: 'No matched charge - manual posting required',
            });
            continue;
          }

          try {
            const charge = await tx.charge.findUnique({ where: { id: item.chargeId } });
            if (!charge) {
              postedLines.push({
                lineItemId: item.id,
                lineNumber: item.lineNumber,
                cptCode: item.cptCode,
                paidAmount,
                adjustedAmount,
                claimId: item.claimId,
                chargeId: item.chargeId,
                status: 'error',
                message: 'Charge not found',
              });
              errors.push(`Line ${item.lineNumber}: Charge not found`);
              continue;
            }

            // Create insurance payment if paid amount > 0
            if (paidAmount > 0) {
              const payment = await tx.payment.create({
                data: {
                  patientId: charge.patientId,
                  organizationId: ctx.user.organizationId,
                  amount: paidAmount,
                  paymentMethod: PaymentMethod.INSURANCE,
                  payerType: 'insurance',
                  payerName: remittance.payerName || 'Insurance',
                  checkNumber: remittance.checkNumber,
                  checkDate: remittance.checkDate,
                  paymentDate: new Date(),
                  claimId: item.claimId,
                  eobDate: remittance.checkDate,
                  notes: `Auto-posted from ERA ${remittance.checkNumber} - Line ${item.lineNumber}`,
                  unappliedAmount: 0, // Will be fully applied
                },
              });

              // Create allocation to charge
              await tx.paymentAllocation.create({
                data: {
                  paymentId: payment.id,
                  chargeId: item.chargeId,
                  amount: paidAmount,
                },
              });

              totalPayments += paidAmount;
            }

            // Apply contractual adjustments
            if (postAdjustments && adjustedAmount > 0) {
              // Parse adjustment reason codes to determine adjustment type
              const adjustmentCodes = item.adjustmentReasonCodes || [];
              const isContractual = adjustmentCodes.some(
                (code) => code.startsWith('CO-') || code === 'CO-45'
              );

              if (isContractual) {
                totalAdjustments += adjustedAmount;
              }
            }

            // Update charge balances
            const currentPayments = Number(charge.payments);
            const currentAdjustments = Number(charge.adjustments);
            const fee = Number(charge.fee) * charge.units;

            const newPayments = currentPayments + paidAmount;
            const newAdjustments = postAdjustments
              ? currentAdjustments + adjustedAmount
              : currentAdjustments;
            const newBalance = Math.max(
              0,
              fee - newPayments - newAdjustments + (createPatientResponsibility ? patientAmount : 0)
            );

            await tx.charge.update({
              where: { id: item.chargeId },
              data: {
                payments: newPayments,
                adjustments: newAdjustments,
                balance: newBalance,
                status:
                  newBalance <= 0
                    ? ChargeStatus.PAID
                    : paidAmount > 0
                      ? ChargeStatus.BILLED
                      : charge.status,
              },
            });

            // Mark line item as posted
            await tx.remittanceLineItem.update({
              where: { id: item.id },
              data: {
                isPosted: true,
                postedAt: new Date(),
                postedBy: ctx.user.id,
              },
            });

            postedLines.push({
              lineItemId: item.id,
              lineNumber: item.lineNumber,
              cptCode: item.cptCode,
              paidAmount,
              adjustedAmount,
              claimId: item.claimId,
              chargeId: item.chargeId,
              status: 'posted',
              message: `Posted $${paidAmount.toFixed(2)} payment, $${adjustedAmount.toFixed(2)} adjustment`,
            });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            postedLines.push({
              lineItemId: item.id,
              lineNumber: item.lineNumber,
              cptCode: item.cptCode,
              paidAmount,
              adjustedAmount,
              claimId: item.claimId,
              chargeId: item.chargeId,
              status: 'error',
              message: errorMsg,
            });
            errors.push(`Line ${item.lineNumber}: ${errorMsg}`);
          }
        }

        // Update remittance processed status
        const allPosted = postedLines.every(
          (p) => p.status === 'posted' || p.status === 'skipped'
        );
        if (allPosted && postedLines.some((p) => p.status === 'posted')) {
          await tx.remittance.update({
            where: { id: remittanceId },
            data: {
              isProcessed: true,
              processedDate: new Date(),
            },
          });
        }
      });

      await auditLog('REMITTANCE_POST', 'Remittance', {
        entityId: remittanceId,
        changes: {
          postedCount: postedLines.filter((p) => p.status === 'posted').length,
          skippedCount: postedLines.filter((p) => p.status === 'skipped').length,
          errorCount: postedLines.filter((p) => p.status === 'error').length,
          totalPayments,
          totalAdjustments,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: errors.length === 0,
        message:
          errors.length === 0
            ? `Successfully posted ${postedLines.filter((p) => p.status === 'posted').length} line items`
            : `Posted with ${errors.length} error(s)`,
        totalPosted: postedLines.filter((p) => p.status === 'posted').length,
        totalPayments,
        totalAdjustments,
        postedLines,
        errors,
      };
    }),

  // Get posting report for a remittance
  getPostingReport: protectedProcedure
    .input(z.object({ remittanceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const remittance = await ctx.prisma.remittance.findFirst({
        where: { id: input.remittanceId, organizationId: ctx.user.organizationId },
        include: {
          lineItems: {
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      if (!remittance) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Remittance not found' });
      }

      // Build posting report from stored data
      const lineItems = remittance.lineItems;

      // Aggregate adjustment codes
      const adjustmentTotals = new Map<string, { amount: number; count: number }>();
      for (const item of lineItems) {
        for (const code of item.adjustmentReasonCodes || []) {
          const existing = adjustmentTotals.get(code) || { amount: 0, count: 0 };
          const amounts = (item.adjustmentAmounts as Record<string, number>) || {};
          adjustmentTotals.set(code, {
            amount: existing.amount + (amounts[code] || 0),
            count: existing.count + 1,
          });
        }
      }

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
        remittanceId: remittance.id,
        checkNumber: remittance.checkNumber || '',
        checkDate: remittance.checkDate || new Date(),
        payerName: remittance.payerName || 'Unknown',
        summary: {
          totalClaims: remittance.claimCount,
          totalServiceLines: lineItems.length,
          totalCharged: Number(remittance.totalCharges),
          totalPaid: Number(remittance.totalPaid),
          totalContractualAdjustment: Number(remittance.totalAdjusted),
          totalPatientResponsibility: lineItems.reduce(
            (sum, item) => sum + Number(item.patientAmount),
            0
          ),
          totalDenied: lineItems
            .filter((item) => Number(item.paidAmount) === 0 && Number(item.chargedAmount) > 0)
            .reduce((sum, item) => sum + Number(item.chargedAmount), 0),
          postedCount: lineItems.filter((item) => item.isPosted).length,
          unpostedCount: lineItems.filter((item) => !item.isPosted).length,
        },
        lineItems: lineItems.map((item) => ({
          id: item.id,
          lineNumber: item.lineNumber,
          patientName: item.patientName,
          patientAccountNumber: item.patientAccountNumber,
          payerClaimNumber: item.payerClaimNumber,
          cptCode: item.cptCode,
          modifiers: item.modifiers,
          serviceDate: item.serviceDate,
          chargedAmount: Number(item.chargedAmount),
          allowedAmount: Number(item.allowedAmount),
          paidAmount: Number(item.paidAmount),
          adjustedAmount: Number(item.adjustedAmount),
          patientAmount: Number(item.patientAmount),
          adjustmentReasonCodes: item.adjustmentReasonCodes,
          remarkCodes: item.remarkCodes,
          isPosted: item.isPosted,
          postedAt: item.postedAt,
          claimId: item.claimId,
          chargeId: item.chargeId,
        })),
        adjustmentBreakdown,
        generatedAt: new Date(),
      };
    }),
});
