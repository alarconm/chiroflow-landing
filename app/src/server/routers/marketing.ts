// Marketing & Referrals Router - Epic 18
import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import {
  ReferralProgram,
  generateReferralCode,
  LeadManager,
  NurtureEngine,
  ReviewManager,
  CampaignTracker,
} from '@/lib/marketing';
import type { Prisma } from '@prisma/client';

// Enums as Zod schemas
const referralRewardTypeSchema = z.enum([
  'DISCOUNT_PERCENT',
  'DISCOUNT_FIXED',
  'CREDIT',
  'CASH',
  'GIFT_CARD',
  'FREE_SERVICE',
]);

const referralStatusSchema = z.enum([
  'PENDING',
  'QUALIFIED',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
]);

const leadStatusSchema = z.enum([
  'NEW',
  'CONTACTED',
  'ENGAGED',
  'QUALIFIED',
  'CONVERTED',
  'LOST',
  'UNRESPONSIVE',
]);

const leadSourceSchema = z.enum([
  'WEBSITE',
  'REFERRAL',
  'GOOGLE_ADS',
  'FACEBOOK_ADS',
  'INSTAGRAM',
  'WALK_IN',
  'PHONE_CALL',
  'SOCIAL_MEDIA',
  'EVENT',
  'PARTNER',
  'DIRECTORY',
  'OTHER',
]);

const nurtureSequenceStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
]);

const reviewPlatformSchema = z.enum([
  'GOOGLE',
  'YELP',
  'FACEBOOK',
  'HEALTHGRADES',
  'ZOCDOC',
  'OTHER',
]);

const reviewRequestStatusSchema = z.enum([
  'PENDING',
  'SENT',
  'CLICKED',
  'REVIEWED',
  'DECLINED',
  'FAILED',
]);

const campaignStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
]);

const campaignTypeSchema = z.enum([
  'EMAIL',
  'SMS',
  'SOCIAL',
  'REFERRAL',
  'REVIEW',
  'REACTIVATION',
  'RETENTION',
]);

export const marketingRouter = router({
  // ==================== REFERRAL PROGRAMS ====================

  // Create referral program
  createReferralProgram: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        referrerRewardType: referralRewardTypeSchema,
        referrerRewardValue: z.number().positive(),
        referrerRewardMax: z.number().positive().optional(),
        referrerRewardNote: z.string().optional(),
        refereeRewardType: referralRewardTypeSchema.optional(),
        refereeRewardValue: z.number().positive().optional(),
        refereeRewardMax: z.number().positive().optional(),
        refereeRewardNote: z.string().optional(),
        qualificationCriteria: z.string().optional(),
        expirationDays: z.number().int().positive().optional(),
        maxReferralsPerPatient: z.number().int().positive().optional(),
        requireNewPatient: z.boolean().default(true),
        termsAndConditions: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new ReferralProgram(ctx.user.organizationId);
      const program = await service.createProgram(input);

      await auditLog('CREATE', 'ReferralProgram', {
        entityId: program.id,
        changes: { name: input.name, referrerRewardType: input.referrerRewardType },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return program;
    }),

  // List referral programs
  listReferralPrograms: protectedProcedure
    .input(
      z.object({
        includeInactive: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.ReferralProgramWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (!input?.includeInactive) {
        where.isActive = true;
      }

      return ctx.prisma.referralProgram.findMany({
        where,
        include: {
          _count: { select: { referrals: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }),

  // Get referral program
  getReferralProgram: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const program = await ctx.prisma.referralProgram.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          referrals: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              referrer: {
                include: { demographics: { select: { firstName: true, lastName: true } } },
              },
            },
          },
          _count: { select: { referrals: true } },
        },
      });

      if (!program) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Referral program not found' });
      }

      return program;
    }),

  // Update referral program
  updateReferralProgram: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        referrerRewardValue: z.number().positive().optional(),
        refereeRewardValue: z.number().positive().optional(),
        expirationDays: z.number().int().positive().optional(),
        termsAndConditions: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const program = await ctx.prisma.referralProgram.update({
        where: { id },
        data: updateData,
      });

      await auditLog('UPDATE', 'ReferralProgram', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return program;
    }),

  // ==================== REFERRALS ====================

  // Create referral
  createReferral: protectedProcedure
    .input(
      z.object({
        programId: z.string(),
        referrerId: z.string(),
        refereeName: z.string().optional(),
        refereeEmail: z.string().email().optional(),
        refereePhone: z.string().optional(),
        refereeNotes: z.string().optional(),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmCampaign: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new ReferralProgram(ctx.user.organizationId);
      const referral = await service.createReferral(input);

      await auditLog('CREATE', 'Referral', {
        entityId: referral.id,
        changes: { programId: input.programId, referrerId: input.referrerId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return referral;
    }),

  // List referrals
  listReferrals: protectedProcedure
    .input(
      z.object({
        programId: z.string().optional(),
        status: referralStatusSchema.optional(),
        referrerId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { programId, status, referrerId, limit = 50, offset = 0 } = input || {};

      const where: Prisma.ReferralWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (programId) where.programId = programId;
      if (status) where.status = status;
      if (referrerId) where.referrerId = referrerId;

      const [referrals, total] = await Promise.all([
        ctx.prisma.referral.findMany({
          where,
          include: {
            referrer: {
              include: { demographics: { select: { firstName: true, lastName: true } } },
            },
            referee: {
              include: { demographics: { select: { firstName: true, lastName: true } } },
            },
            program: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.referral.count({ where }),
      ]);

      return { referrals, total, limit, offset, hasMore: offset + referrals.length < total };
    }),

  // Get referral by code
  getReferralByCode: protectedProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ ctx, input }) => {
      const referral = await ctx.prisma.referral.findFirst({
        where: {
          referralCode: input.code,
          organizationId: ctx.user.organizationId,
        },
        include: {
          referrer: {
            include: { demographics: { select: { firstName: true, lastName: true } } },
          },
          program: true,
        },
      });

      if (!referral) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Referral not found' });
      }

      return referral;
    }),

  // Link referee patient
  linkRefereePatient: protectedProcedure
    .input(
      z.object({
        referralCode: z.string(),
        patientId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new ReferralProgram(ctx.user.organizationId);
      const referral = await service.linkRefereePatient(input.referralCode, input.patientId);

      await auditLog('UPDATE', 'Referral', {
        entityId: referral.id,
        changes: { status: 'QUALIFIED', refereeId: input.patientId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return referral;
    }),

  // Issue referral rewards
  issueReferralRewards: adminProcedure
    .input(
      z.object({
        referralId: z.string(),
        referrerNotes: z.string().optional(),
        refereeNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new ReferralProgram(ctx.user.organizationId);
      const results = await service.completeReferral(input.referralId);

      await auditLog('UPDATE', 'Referral', {
        entityId: input.referralId,
        changes: { status: 'COMPLETED', rewardsIssued: true },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return results;
    }),

  // Get referral statistics
  getReferralStats: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const service = new ReferralProgram(ctx.user.organizationId);
      return service.getStatistics(input?.startDate, input?.endDate);
    }),

  // Get top referrers
  getTopReferrers: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      const service = new ReferralProgram(ctx.user.organizationId);
      return service.getTopReferrers(input?.limit);
    }),

  // ==================== LEADS ====================

  // Create lead
  createLead: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        source: leadSourceSchema.default('WEBSITE'),
        primaryConcern: z.string().optional(),
        notes: z.string().optional(),
        preferredContact: z.string().optional(),
        preferredTimes: z.string().optional(),
        dateOfBirth: z.coerce.date().optional(),
        gender: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmCampaign: z.string().optional(),
        utmContent: z.string().optional(),
        utmTerm: z.string().optional(),
        landingPage: z.string().optional(),
        referrerUrl: z.string().optional(),
        campaignId: z.string().optional(),
        referralId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new LeadManager(ctx.user.organizationId);
      const lead = await service.createLead(input);

      // Track campaign lead if applicable
      if (input.campaignId) {
        const campaignTracker = new CampaignTracker(ctx.user.organizationId);
        await campaignTracker.recordLead(input.campaignId);
      }

      await auditLog('CREATE', 'Lead', {
        entityId: lead.id,
        changes: { source: input.source, email: input.email },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return lead;
    }),

  // List leads
  listLeads: protectedProcedure
    .input(
      z.object({
        status: z.union([leadStatusSchema, z.array(leadStatusSchema)]).optional(),
        source: z.union([leadSourceSchema, z.array(leadSourceSchema)]).optional(),
        minScore: z.number().optional(),
        maxScore: z.number().optional(),
        assignedToUserId: z.string().optional(),
        hasFollowUp: z.boolean().optional(),
        createdAfter: z.coerce.date().optional(),
        createdBefore: z.coerce.date().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const service = new LeadManager(ctx.user.organizationId);
      return service.getLeads(input, input?.limit, input?.offset);
    }),

  // Get lead by ID
  getLead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          campaign: { select: { id: true, name: true } },
          activities: { orderBy: { createdAt: 'desc' }, take: 20 },
          currentSequence: { select: { id: true, name: true } },
        },
      });

      if (!lead) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
      }

      return lead;
    }),

  // Update lead status
  updateLeadStatus: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        status: leadStatusSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new LeadManager(ctx.user.organizationId);
      const lead = await service.updateStatus(input.leadId, input.status, ctx.user.id);

      await auditLog('UPDATE', 'Lead', {
        entityId: input.leadId,
        changes: { status: input.status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return lead;
    }),

  // Log lead contact
  logLeadContact: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        method: z.enum(['phone', 'email', 'sms', 'in_person']),
        successful: z.boolean(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new LeadManager(ctx.user.organizationId);
      return service.logContactAttempt(
        input.leadId,
        input.method,
        input.successful,
        input.notes,
        ctx.user.id
      );
    }),

  // Set lead follow-up
  setLeadFollowUp: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        followUpAt: z.coerce.date(),
        assignToUserId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new LeadManager(ctx.user.organizationId);
      return service.setFollowUp(input.leadId, input.followUpAt, input.assignToUserId);
    }),

  // Add note to lead
  addLeadNote: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        note: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new LeadManager(ctx.user.organizationId);
      return service.addNote(input.leadId, input.note, ctx.user.id);
    }),

  // Convert lead to patient
  convertLeadToPatient: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        patientId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new LeadManager(ctx.user.organizationId);
      const lead = await service.convertToPatient(input.leadId, input.patientId);

      await auditLog('UPDATE', 'Lead', {
        entityId: input.leadId,
        changes: { status: 'CONVERTED', patientId: input.patientId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return lead;
    }),

  // Get leads due for follow-up
  getFollowUpsDue: protectedProcedure.query(async ({ ctx }) => {
    const service = new LeadManager(ctx.user.organizationId);
    return service.getFollowUpsDue();
  }),

  // Get lead statistics
  getLeadStats: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const service = new LeadManager(ctx.user.organizationId);
      return service.getStatistics(input?.startDate, input?.endDate);
    }),

  // ==================== NURTURE SEQUENCES ====================

  // Create nurture sequence
  createNurtureSequence: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        triggerType: z.string(),
        triggerValue: z.string().optional(),
        leadSources: z.array(leadSourceSchema).optional(),
        minScore: z.number().optional(),
        maxScore: z.number().optional(),
        exitOnConversion: z.boolean().default(true),
        exitOnUnsubscribe: z.boolean().default(true),
        maxDays: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new NurtureEngine(ctx.user.organizationId);
      const sequence = await service.createSequence(input);

      await auditLog('CREATE', 'NurtureSequence', {
        entityId: sequence.id,
        changes: { name: input.name, triggerType: input.triggerType },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return sequence;
    }),

  // List nurture sequences
  listNurtureSequences: protectedProcedure
    .input(
      z.object({
        status: nurtureSequenceStatusSchema.optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const service = new NurtureEngine(ctx.user.organizationId);
      return service.getSequences(input?.status);
    }),

  // Get nurture sequence
  getNurtureSequence: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const service = new NurtureEngine(ctx.user.organizationId);
      const sequence = await service.getSequence(input.id);

      if (!sequence) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sequence not found' });
      }

      return sequence;
    }),

  // Add step to sequence
  addNurtureStep: adminProcedure
    .input(
      z.object({
        sequenceId: z.string(),
        name: z.string().min(1),
        delayDays: z.number().int().min(0).default(0),
        delayHours: z.number().int().min(0).default(0),
        sendTime: z.string().optional(),
        actionType: z.enum(['send_email', 'send_sms', 'create_task', 'update_score']),
        templateId: z.string().optional(),
        taskTitle: z.string().optional(),
        taskDescription: z.string().optional(),
        taskAssignTo: z.string().optional(),
        scoreChange: z.number().int().optional(),
        condition: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new NurtureEngine(ctx.user.organizationId);
      return service.addStep(input);
    }),

  // Activate sequence
  activateNurtureSequence: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const service = new NurtureEngine(ctx.user.organizationId);
      return service.activateSequence(input.id);
    }),

  // Enroll lead in sequence
  enrollLeadInSequence: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        sequenceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new NurtureEngine(ctx.user.organizationId);
      return service.enrollLead(input.leadId, input.sequenceId);
    }),

  // ==================== REVIEWS ====================

  // Create review request
  createReviewRequest: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        platform: reviewPlatformSchema,
        triggeredByAppointmentId: z.string().optional(),
        scheduledFor: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new ReviewManager(ctx.user.organizationId);
      const request = await service.createReviewRequest(input);

      await auditLog('CREATE', 'ReviewRequest', {
        entityId: request.id,
        changes: { patientId: input.patientId, platform: input.platform },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return request;
    }),

  // List review requests
  listReviewRequests: protectedProcedure
    .input(
      z.object({
        status: z.union([reviewRequestStatusSchema, z.array(reviewRequestStatusSchema)]).optional(),
        platform: reviewPlatformSchema.optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const service = new ReviewManager(ctx.user.organizationId);
      return service.getRequests(
        {
          status: input?.status,
          platform: input?.platform,
          startDate: input?.startDate,
          endDate: input?.endDate,
        },
        input?.limit,
        input?.offset
      );
    }),

  // Send review request
  sendReviewRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
        sentVia: z.enum(['email', 'sms']),
        messageId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new ReviewManager(ctx.user.organizationId);
      return service.sendReviewRequest(input.requestId, input.sentVia, input.messageId);
    }),

  // Track review click
  trackReviewClick: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const service = new ReviewManager(ctx.user.organizationId);
      return service.trackClick(input.requestId);
    }),

  // Record review completion
  recordReview: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
        rating: z.number().int().min(1).max(5).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new ReviewManager(ctx.user.organizationId);
      return service.recordReview(input.requestId, input.rating);
    }),

  // Get review statistics
  getReviewStats: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const service = new ReviewManager(ctx.user.organizationId);
      return service.getStatistics(input?.startDate, input?.endDate);
    }),

  // ==================== CAMPAIGNS ====================

  // Create campaign
  createCampaign: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        campaignType: campaignTypeSchema,
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        budget: z.number().positive().optional(),
        targetLeads: z.number().int().positive().optional(),
        targetConversions: z.number().int().positive().optional(),
        targetRevenue: z.number().positive().optional(),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmContent: z.string().optional(),
        targetAudience: z.record(z.string(), z.unknown()).optional(),
        content: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new CampaignTracker(ctx.user.organizationId);
      const campaign = await service.createCampaign(input, ctx.user.id);

      await auditLog('CREATE', 'Campaign', {
        entityId: campaign.id,
        changes: { name: input.name, campaignType: input.campaignType },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return campaign;
    }),

  // List campaigns
  listCampaigns: protectedProcedure
    .input(
      z.object({
        status: z.union([campaignStatusSchema, z.array(campaignStatusSchema)]).optional(),
        campaignType: z.union([campaignTypeSchema, z.array(campaignTypeSchema)]).optional(),
        startAfter: z.coerce.date().optional(),
        startBefore: z.coerce.date().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const service = new CampaignTracker(ctx.user.organizationId);
      return service.getCampaigns(
        {
          status: input?.status,
          campaignType: input?.campaignType,
          startAfter: input?.startAfter,
          startBefore: input?.startBefore,
          search: input?.search,
        },
        input?.limit,
        input?.offset
      );
    }),

  // Get campaign
  getCampaign: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const service = new CampaignTracker(ctx.user.organizationId);
      const campaign = await service.getCampaign(input.id);

      if (!campaign) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
      }

      return campaign;
    }),

  // Update campaign
  updateCampaign: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        budget: z.number().positive().optional(),
        targetLeads: z.number().int().positive().optional(),
        targetConversions: z.number().int().positive().optional(),
        targetRevenue: z.number().positive().optional(),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmContent: z.string().optional(),
        targetAudience: z.record(z.string(), z.unknown()).optional(),
        content: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const service = new CampaignTracker(ctx.user.organizationId);
      const campaign = await service.updateCampaign(id, updates);

      await auditLog('UPDATE', 'Campaign', {
        entityId: id,
        changes: updates,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return campaign;
    }),

  // Update campaign status
  updateCampaignStatus: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: campaignStatusSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new CampaignTracker(ctx.user.organizationId);
      const campaign = await service.updateStatus(input.id, input.status);

      await auditLog('UPDATE', 'Campaign', {
        entityId: input.id,
        changes: { status: input.status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return campaign;
    }),

  // Record campaign metrics
  recordCampaignMetrics: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        impressions: z.number().int().min(0).optional(),
        clicks: z.number().int().min(0).optional(),
        spend: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new CampaignTracker(ctx.user.organizationId);

      if (input.impressions) {
        await service.recordImpression(input.campaignId, input.impressions);
      }
      if (input.clicks) {
        await service.recordClick(input.campaignId, input.clicks);
      }
      if (input.spend !== undefined) {
        await service.updateSpend(input.campaignId, input.spend);
      }

      return service.getCampaign(input.campaignId);
    }),

  // Get campaign metrics
  getCampaignMetrics: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const service = new CampaignTracker(ctx.user.organizationId);
      return service.getMetrics(input.id);
    }),

  // Get campaign statistics
  getCampaignStats: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const service = new CampaignTracker(ctx.user.organizationId);
      return service.getStatistics(input?.startDate, input?.endDate);
    }),

  // Get top campaigns
  getTopCampaigns: protectedProcedure
    .input(
      z.object({
        metric: z.enum(['leads', 'conversions', 'revenue', 'roi']).default('conversions'),
        limit: z.number().min(1).max(20).default(5),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const service = new CampaignTracker(ctx.user.organizationId);
      return service.getTopCampaigns(input?.metric, input?.limit);
    }),

  // ==================== LANDING PAGES ====================

  // Create landing page
  createLandingPage: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1),
        headline: z.string().optional(),
        subheadline: z.string().optional(),
        bodyContent: z.string().optional(),
        ctaText: z.string().optional(),
        ctaLink: z.string().optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        formEnabled: z.boolean().default(true),
        formFields: z.record(z.string(), z.unknown()).optional(),
        successMessage: z.string().optional(),
        redirectUrl: z.string().optional(),
        defaultUtmSource: z.string().optional(),
        defaultUtmMedium: z.string().optional(),
        defaultCampaignId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const landingPage = await ctx.prisma.landingPage.create({
        data: {
          ...input,
          formFields: input.formFields as Prisma.InputJsonValue,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'LandingPage', {
        entityId: landingPage.id,
        changes: { name: input.name, slug: input.slug },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return landingPage;
    }),

  // List landing pages
  listLandingPages: protectedProcedure
    .input(
      z.object({
        includeInactive: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.LandingPageWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (!input?.includeInactive) {
        where.isActive = true;
      }

      return ctx.prisma.landingPage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    }),

  // Get landing page
  getLandingPage: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        slug: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!input.id && !input.slug) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Must provide id or slug' });
      }

      const landingPage = await ctx.prisma.landingPage.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input.id ? { id: input.id } : { slug: input.slug }),
        },
      });

      if (!landingPage) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Landing page not found' });
      }

      return landingPage;
    }),

  // Track landing page view
  trackLandingPageView: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.landingPage.update({
        where: { id: input.id },
        data: {
          totalViews: { increment: 1 },
        },
      });
    }),

  // Track landing page submission
  trackLandingPageSubmission: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await ctx.prisma.landingPage.findUnique({
        where: { id: input.id },
      });

      if (!page) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Landing page not found' });
      }

      const totalSubmissions = page.totalSubmissions + 1;
      const conversionRate = page.totalViews > 0 ? totalSubmissions / page.totalViews : 0;

      return ctx.prisma.landingPage.update({
        where: { id: input.id },
        data: {
          totalSubmissions,
          conversionRate,
        },
      });
    }),

  // ==================== MARKETING DASHBOARD ====================

  // Get marketing dashboard summary
  getDashboardSummary: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const referralService = new ReferralProgram(ctx.user.organizationId);
      const leadService = new LeadManager(ctx.user.organizationId);
      const reviewService = new ReviewManager(ctx.user.organizationId);
      const campaignService = new CampaignTracker(ctx.user.organizationId);

      const [
        referralStats,
        leadStats,
        reviewStats,
        campaignStats,
        topReferrers,
        topCampaigns,
      ] = await Promise.all([
        referralService.getStatistics(input?.startDate, input?.endDate),
        leadService.getStatistics(input?.startDate, input?.endDate),
        reviewService.getStatistics(input?.startDate, input?.endDate),
        campaignService.getStatistics(input?.startDate, input?.endDate),
        referralService.getTopReferrers(5),
        campaignService.getTopCampaigns('conversions', 5),
      ]);

      return {
        referrals: referralStats,
        leads: leadStats,
        reviews: reviewStats,
        campaigns: campaignStats,
        topReferrers,
        topCampaigns,
      };
    }),
});
