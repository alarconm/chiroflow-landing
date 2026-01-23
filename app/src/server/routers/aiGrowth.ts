/**
 * Epic 37: AI Practice Growth Agent - Router
 *
 * tRPC router for AI-powered practice growth operations including:
 * - Intelligent lead scoring and management (US-356)
 * - Auto-capture leads from website, calls, referrals
 * - Lead source tracking and conversion prediction
 * - Priority ranking and auto-assignment
 * - Nurturing sequence triggers and conversion tracking
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { auditLog } from '@/lib/audit';
import type { GrowthLeadStatus, Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';

// ============================================
// Types for Lead Scoring
// ============================================

interface LeadScoreFactors {
  website_visits: number;
  page_views: number;
  time_on_site: number;
  form_interaction: number;
  email_engagement: number;
  source_quality: number;
  urgency_signals: number;
  demographic_fit: number;
}

interface LeadPriorityRanking {
  leadId: string;
  name: string;
  email: string | null;
  phone: string | null;
  qualityScore: number;
  conversionProbability: number;
  urgencyScore: number;
  priorityRank: number;
  status: GrowthLeadStatus;
  source: string | null;
  daysSinceCreated: number;
  lastActivityDate: Date | null;
  nextAction: string | null;
  assignedTo: string | null;
}

interface ConversionPrediction {
  leadId: string;
  probability: number;
  confidence: number;
  factors: Array<{
    factor: string;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    weight: number;
    description: string;
  }>;
  estimatedTimeToConvert: string;
  estimatedLifetimeValue: number;
  recommendedActions: string[];
}

interface StaffAssignment {
  userId: string;
  userName: string;
  currentLeadCount: number;
  conversionRate: number;
  averageResponseTime: number;
  matchScore: number;
  specialties: string[];
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate lead quality score based on behavioral and demographic factors
 */
function calculateLeadQualityScore(
  websiteVisits: number,
  pageViews: number,
  timeOnSite: number | null,
  formAbandoned: boolean,
  emailsOpened: number,
  linksClicked: number,
  source: string | null,
): LeadScoreFactors {
  const factors: LeadScoreFactors = {
    website_visits: 0,
    page_views: 0,
    time_on_site: 0,
    form_interaction: 0,
    email_engagement: 0,
    source_quality: 0,
    urgency_signals: 0,
    demographic_fit: 0,
  };

  // Website visits (0-20 points)
  if (websiteVisits >= 5) factors.website_visits = 20;
  else if (websiteVisits >= 3) factors.website_visits = 15;
  else if (websiteVisits >= 2) factors.website_visits = 10;
  else if (websiteVisits >= 1) factors.website_visits = 5;

  // Page views (0-15 points)
  if (pageViews >= 10) factors.page_views = 15;
  else if (pageViews >= 5) factors.page_views = 10;
  else if (pageViews >= 3) factors.page_views = 5;

  // Time on site (0-15 points)
  const timeSeconds = timeOnSite || 0;
  if (timeSeconds >= 300) factors.time_on_site = 15; // 5+ minutes
  else if (timeSeconds >= 120) factors.time_on_site = 10; // 2+ minutes
  else if (timeSeconds >= 60) factors.time_on_site = 5; // 1+ minute

  // Form interaction (0-15 points)
  if (formAbandoned) {
    factors.form_interaction = 10; // Started but didn't complete - still high intent
  }

  // Email engagement (0-15 points)
  if (emailsOpened >= 3 && linksClicked >= 2) factors.email_engagement = 15;
  else if (emailsOpened >= 2 && linksClicked >= 1) factors.email_engagement = 10;
  else if (emailsOpened >= 1) factors.email_engagement = 5;

  // Source quality (0-20 points)
  const sourceScores: Record<string, number> = {
    referral: 20,
    provider_referral: 20,
    google_search: 15,
    google_ads: 12,
    facebook_ads: 10,
    website: 10,
    phone_call: 15,
    walk_in: 18,
    insurance_directory: 8,
    social_media: 5,
    other: 5,
  };
  factors.source_quality = sourceScores[source || 'other'] || 5;

  return factors;
}

/**
 * Calculate urgency score based on behavioral signals
 */
function calculateUrgencyScore(
  websiteVisits: number,
  pageViews: number,
  timeOnSite: number | null,
  formAbandoned: boolean,
  daysSinceCreated: number,
): number {
  let urgency = 0;

  // Recent high activity
  if (websiteVisits >= 3 && daysSinceCreated <= 3) urgency += 30;
  else if (websiteVisits >= 2 && daysSinceCreated <= 7) urgency += 20;

  // Multiple page views indicate research
  if (pageViews >= 5) urgency += 20;

  // Long time on site indicates serious interest
  const timeSeconds = timeOnSite || 0;
  if (timeSeconds >= 300) urgency += 20;
  else if (timeSeconds >= 120) urgency += 10;

  // Form abandonment indicates intent but friction
  if (formAbandoned) urgency += 15;

  // Lead age penalty (older leads are less urgent)
  if (daysSinceCreated > 14) urgency -= 20;
  else if (daysSinceCreated > 7) urgency -= 10;

  return Math.max(0, Math.min(100, urgency));
}

/**
 * Detect intent signals from lead behavior
 */
function detectIntentSignals(
  websiteVisits: number,
  pageViews: number,
  timeOnSite: number | null,
  formAbandoned: boolean,
  lastPageViewed: string | null,
  emailsOpened: number,
  linksClicked: number,
): string[] {
  const signals: string[] = [];

  if (websiteVisits >= 3) signals.push('Multiple site visits indicate active interest');
  if (pageViews >= 5) signals.push('Extensive page browsing shows research behavior');
  if ((timeOnSite || 0) >= 300) signals.push('Long session time indicates serious consideration');
  if (formAbandoned) signals.push('Form started but not completed - high intent with friction');
  if (emailsOpened >= 2 && linksClicked >= 1) signals.push('Email engagement shows ongoing interest');

  // Page-specific signals
  if (lastPageViewed) {
    const page = lastPageViewed.toLowerCase();
    if (page.includes('pricing') || page.includes('cost')) {
      signals.push('Viewed pricing page - evaluating costs');
    }
    if (page.includes('insurance') || page.includes('coverage')) {
      signals.push('Viewed insurance page - checking coverage');
    }
    if (page.includes('appointment') || page.includes('schedule') || page.includes('book')) {
      signals.push('Viewed scheduling page - ready to book');
    }
    if (page.includes('service') || page.includes('treatment')) {
      signals.push('Viewed services page - evaluating treatment options');
    }
    if (page.includes('testimonial') || page.includes('review')) {
      signals.push('Viewed reviews - seeking social proof');
    }
  }

  return signals;
}

/**
 * Calculate conversion probability based on scoring factors
 */
function calculateConversionProbability(
  qualityScore: number,
  urgencyScore: number,
  source: string | null,
  daysSinceCreated: number,
): number {
  // Base probability from quality score (0-50%)
  let probability = (qualityScore / 100) * 0.5;

  // Urgency boost (0-20%)
  probability += (urgencyScore / 100) * 0.2;

  // Source multiplier
  const sourceMultipliers: Record<string, number> = {
    referral: 1.5,
    provider_referral: 1.6,
    walk_in: 1.4,
    phone_call: 1.3,
    google_search: 1.2,
    google_ads: 1.1,
    website: 1.0,
    facebook_ads: 0.9,
    social_media: 0.8,
    insurance_directory: 0.85,
    other: 0.7,
  };
  probability *= sourceMultipliers[source || 'other'] || 0.7;

  // Time decay
  if (daysSinceCreated > 30) probability *= 0.5;
  else if (daysSinceCreated > 14) probability *= 0.7;
  else if (daysSinceCreated > 7) probability *= 0.85;

  return Math.min(0.95, Math.max(0.01, probability));
}

/**
 * Generate action recommendation based on lead status and score
 */
function generateRecommendation(
  qualityScore: number,
  urgencyScore: number,
  conversionProbability: number,
  status: GrowthLeadStatus,
  daysSinceCreated: number,
): { recommendation: string; suggestedAction: string } {
  // Hot leads (high quality + high urgency)
  if (qualityScore >= 70 && urgencyScore >= 60) {
    return {
      recommendation: 'HOT LEAD - Immediate personal outreach recommended',
      suggestedAction: 'Call immediately within 5 minutes',
    };
  }

  // High quality but lower urgency
  if (qualityScore >= 70) {
    return {
      recommendation: 'High-value lead - Personalized follow-up recommended',
      suggestedAction: 'Send personalized email and schedule call',
    };
  }

  // High urgency but lower quality
  if (urgencyScore >= 60) {
    return {
      recommendation: 'Active lead showing urgency - Quick response needed',
      suggestedAction: 'Respond within 1 hour with appointment offer',
    };
  }

  // Warm leads
  if (qualityScore >= 40 || conversionProbability >= 0.3) {
    return {
      recommendation: 'Warm lead - Continue nurturing',
      suggestedAction: 'Add to automated nurture sequence',
    };
  }

  // Cold leads
  if (daysSinceCreated > 14) {
    return {
      recommendation: 'Aging lead - Consider re-engagement campaign',
      suggestedAction: 'Send re-engagement email with special offer',
    };
  }

  return {
    recommendation: 'New lead - Monitor engagement and nurture',
    suggestedAction: 'Add to awareness nurture sequence',
  };
}

/**
 * Get the best staff member to assign a lead to
 */
async function findBestStaffAssignment(
  prisma: any,
  organizationId: string,
  leadSource: string | null,
  leadQualityScore: number,
): Promise<StaffAssignment | null> {
  // Get all staff members with their lead stats
  const staffMembers = await prisma.user.findMany({
    where: {
      organizationId,
      role: { in: ['STAFF', 'PROVIDER', 'ADMIN'] },
      isActive: true,
    },
  });

  if (staffMembers.length === 0) return null;

  // Get lead counts and conversion rates for each staff member
  const staffStats = await Promise.all(
    staffMembers.map(async (staff: any) => {
      const assignedLeads = await prisma.growthLead.count({
        where: {
          organizationId,
          assignedToUserId: staff.id,
          status: { notIn: ['CONVERTED', 'LOST'] },
        },
      });

      const convertedLeads = await prisma.growthLead.count({
        where: {
          organizationId,
          assignedToUserId: staff.id,
          status: 'CONVERTED',
        },
      });

      const totalLeads = await prisma.growthLead.count({
        where: {
          organizationId,
          assignedToUserId: staff.id,
        },
      });

      const conversionRate = totalLeads > 0 ? convertedLeads / totalLeads : 0;

      // Calculate match score (lower load + higher conversion = better)
      let matchScore = 100;
      matchScore -= assignedLeads * 5; // Penalty for current load
      matchScore += conversionRate * 50; // Bonus for conversion rate

      // High-value leads should go to high performers
      if (leadQualityScore >= 70 && conversionRate >= 0.3) {
        matchScore += 20;
      }

      return {
        userId: staff.id,
        userName: staff.name || staff.email,
        currentLeadCount: assignedLeads,
        conversionRate,
        averageResponseTime: 0, // Would need activity tracking
        matchScore: Math.max(0, matchScore),
        specialties: [],
      };
    }),
  );

  // Sort by match score and return the best match
  staffStats.sort((a, b) => b.matchScore - a.matchScore);
  return staffStats[0] || null;
}

// ============================================
// Input Schemas
// ============================================

const scoreLeadInputSchema = z.object({
  leadId: z.string(),
  forceRecalculate: z.boolean().default(false),
});

const captureLeadInputSchema = z.object({
  source: z
    .enum([
      'website',
      'phone_call',
      'walk_in',
      'referral',
      'provider_referral',
      'google_search',
      'google_ads',
      'facebook_ads',
      'social_media',
      'insurance_directory',
      'other',
    ])
    .default('website'),
  sourceDetail: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  // Website behavioral data
  websiteVisits: z.number().default(1),
  pageViews: z.number().default(1),
  timeOnSite: z.number().optional(),
  lastPageViewed: z.string().optional(),
  formAbandoned: z.boolean().default(false),
  // Additional context
  notes: z.string().optional(),
  referredByPatientId: z.string().optional(),
  referredByProviderId: z.string().optional(),
  campaignId: z.string().optional(),
});

const listLeadsInputSchema = z.object({
  status: z
    .enum(['NEW', 'SCORING', 'HOT', 'WARM', 'COLD', 'NURTURING', 'READY', 'CONVERTED', 'LOST'])
    .optional(),
  minQualityScore: z.number().min(0).max(100).optional(),
  assignedToUserId: z.string().optional(),
  source: z.string().optional(),
  sortBy: z.enum(['qualityScore', 'conversionProbability', 'urgencyScore', 'createdAt', 'priorityRank']).default('priorityRank'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const getPriorityRankingsInputSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  includeConverted: z.boolean().default(false),
});

const getConversionPredictionInputSchema = z.object({
  leadId: z.string(),
});

const autoAssignLeadInputSchema = z.object({
  leadId: z.string(),
  preferUserId: z.string().optional(),
});

const triggerNurturingInputSchema = z.object({
  leadId: z.string(),
  sequenceType: z.enum(['awareness', 'consideration', 'decision', 're_engagement']).default('awareness'),
  customMessage: z.string().optional(),
});

const trackConversionInputSchema = z.object({
  leadId: z.string(),
  patientId: z.string(),
  conversionValue: z.number().optional(),
  notes: z.string().optional(),
});

const updateLeadStatusInputSchema = z.object({
  leadId: z.string(),
  status: z.enum(['NEW', 'SCORING', 'HOT', 'WARM', 'COLD', 'NURTURING', 'READY', 'CONVERTED', 'LOST']),
  notes: z.string().optional(),
});

const bulkScoreLeadsInputSchema = z.object({
  leadIds: z.array(z.string()).optional(),
  statusFilter: z
    .array(z.enum(['NEW', 'SCORING', 'HOT', 'WARM', 'COLD', 'NURTURING', 'READY']))
    .optional(),
  maxLeads: z.number().min(1).max(500).default(100),
});

// ============================================
// Router
// ============================================

export const aiGrowthRouter = router({
  // ============================================
  // US-356: Intelligent Lead Management
  // ============================================

  /**
   * Score a single lead - Calculate quality score, conversion probability, and urgency
   */
  scoreLead: protectedProcedure
    .input(scoreLeadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, forceRecalculate } = input;

      // Find the lead
      const lead = await ctx.prisma.growthLead.findFirst({
        where: {
          id: leadId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      // Check if we need to recalculate
      const hoursSinceAnalysis = lead.lastAnalyzedAt
        ? (Date.now() - lead.lastAnalyzedAt.getTime()) / (1000 * 60 * 60)
        : 999;

      if (!forceRecalculate && hoursSinceAnalysis < 24 && lead.qualityScore > 0) {
        const cachedFactors = lead.scoreFactors as Record<string, number> | null;
        return {
          leadId: lead.id,
          qualityScore: lead.qualityScore,
          conversionProbability: Number(lead.conversionProbability),
          urgencyScore: lead.urgencyScore,
          scoreFactors: cachedFactors || {},
          intentSignals: (lead.intentSignals as string[]) || [],
          recommendation: lead.aiNotes || '',
          priorityRank: lead.priorityRank || 0,
          suggestedAction: lead.nextAction || '',
          cached: true,
        };
      }

      // Calculate days since created
      const daysSinceCreated = Math.floor(
        (Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Calculate score factors
      const scoreFactors = calculateLeadQualityScore(
        lead.websiteVisits,
        lead.pageViews,
        lead.timeOnSite,
        lead.formAbandoned,
        lead.emailsOpened,
        lead.linksClicked,
        lead.source,
      );

      // Calculate total quality score
      const qualityScore = Math.min(
        100,
        Object.values(scoreFactors).reduce((sum, val) => sum + val, 0),
      );

      // Calculate urgency score
      const urgencyScore = calculateUrgencyScore(
        lead.websiteVisits,
        lead.pageViews,
        lead.timeOnSite,
        lead.formAbandoned,
        daysSinceCreated,
      );

      // Detect intent signals
      const intentSignals = detectIntentSignals(
        lead.websiteVisits,
        lead.pageViews,
        lead.timeOnSite,
        lead.formAbandoned,
        lead.lastPageViewed,
        lead.emailsOpened,
        lead.linksClicked,
      );

      // Calculate conversion probability
      const conversionProbability = calculateConversionProbability(
        qualityScore,
        urgencyScore,
        lead.source,
        daysSinceCreated,
      );

      // Generate recommendation
      const { recommendation, suggestedAction } = generateRecommendation(
        qualityScore,
        urgencyScore,
        conversionProbability,
        lead.status,
        daysSinceCreated,
      );

      // Determine new status based on score
      let newStatus: GrowthLeadStatus = lead.status;
      if (lead.status === 'NEW' || lead.status === 'SCORING') {
        if (qualityScore >= 70 && urgencyScore >= 60) {
          newStatus = 'HOT';
        } else if (qualityScore >= 50 || conversionProbability >= 0.4) {
          newStatus = 'WARM';
        } else if (qualityScore < 30 && daysSinceCreated > 14) {
          newStatus = 'COLD';
        }
      }

      // Calculate priority rank among all active leads
      const higherRankedLeads = await ctx.prisma.growthLead.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: { notIn: ['CONVERTED', 'LOST'] },
          OR: [
            { qualityScore: { gt: qualityScore } },
            {
              qualityScore: qualityScore,
              conversionProbability: { gt: conversionProbability },
            },
          ],
        },
      });
      const priorityRank = higherRankedLeads + 1;

      // Store score history
      const currentHistory = (lead.scoreHistory as Array<any>) || [];
      const scoreHistory = [
        ...currentHistory,
        {
          date: new Date().toISOString(),
          qualityScore,
          urgencyScore,
          conversionProbability,
        },
      ].slice(-30); // Keep last 30 entries

      // Update the lead
      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: {
          qualityScore,
          urgencyScore,
          conversionProbability,
          scoreFactors: scoreFactors as unknown as Prisma.InputJsonValue,
          intentSignals: intentSignals as unknown as Prisma.InputJsonValue,
          scoreHistory: scoreHistory as unknown as Prisma.InputJsonValue,
          status: newStatus,
          priorityRank,
          nextAction: suggestedAction,
          aiNotes: recommendation,
          lastAnalyzedAt: new Date(),
        },
      });

      // Log activity
      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: 'score_updated',
          description: `Lead scored: Quality=${qualityScore}, Urgency=${urgencyScore}, Conversion=${(conversionProbability * 100).toFixed(1)}%`,
          oldValue: lead.qualityScore.toString(),
          newValue: qualityScore.toString(),
          performedBy: 'AI',
          isAutomated: true,
          metadata: { scoreFactors, intentSignals } as unknown as Prisma.InputJsonValue,
        },
      });

      // Log status change if changed
      if (newStatus !== lead.status) {
        await ctx.prisma.growthLeadActivity.create({
          data: {
            growthLeadId: leadId,
            activityType: 'status_changed',
            description: `Status changed from ${lead.status} to ${newStatus}`,
            oldValue: lead.status,
            newValue: newStatus,
            performedBy: 'AI',
            isAutomated: true,
          },
        });
      }

      await auditLog('AI_GROWTH_LEAD_SCORED', 'GrowthLead', {
        entityId: leadId,
        changes: { qualityScore, conversionProbability, urgencyScore },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        leadId: updatedLead.id,
        qualityScore,
        conversionProbability,
        urgencyScore,
        scoreFactors,
        intentSignals,
        recommendation,
        priorityRank,
        suggestedAction,
        cached: false,
      };
    }),

  /**
   * Capture a new lead from various sources (website, calls, referrals)
   */
  captureLead: protectedProcedure
    .input(captureLeadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        source,
        sourceDetail,
        firstName,
        lastName,
        email,
        phone,
        websiteVisits,
        pageViews,
        timeOnSite,
        lastPageViewed,
        formAbandoned,
        notes,
        referredByPatientId,
        referredByProviderId,
        campaignId,
      } = input;

      // Check for duplicate lead (by email or phone)
      if (email || phone) {
        const existingLead = await ctx.prisma.growthLead.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            OR: [
              ...(email ? [{ email }] : []),
              ...(phone ? [{ phone }] : []),
            ],
            status: { notIn: ['CONVERTED', 'LOST'] },
          },
        });

        if (existingLead) {
          // Update existing lead instead of creating duplicate
          const updatedLead = await ctx.prisma.growthLead.update({
            where: { id: existingLead.id },
            data: {
              websiteVisits: existingLead.websiteVisits + websiteVisits,
              pageViews: existingLead.pageViews + pageViews,
              timeOnSite: (existingLead.timeOnSite || 0) + (timeOnSite || 0),
              lastPageViewed: lastPageViewed || existingLead.lastPageViewed,
              formAbandoned: formAbandoned || existingLead.formAbandoned,
            },
          });

          // Log activity
          await ctx.prisma.growthLeadActivity.create({
            data: {
              growthLeadId: existingLead.id,
              activityType: 'activity_updated',
              description: `Additional activity captured from ${source}`,
              performedBy: ctx.user.id,
              isAutomated: true,
              metadata: { source, websiteVisits, pageViews } as unknown as Prisma.InputJsonValue,
            },
          });

          return { lead: updatedLead, isNew: false, merged: true };
        }
      }

      // Create new lead
      const lead = await ctx.prisma.growthLead.create({
        data: {
          organizationId: ctx.user.organizationId,
          status: 'NEW',
          firstName,
          lastName,
          email,
          phone,
          source,
          sourceDetail,
          websiteVisits,
          pageViews,
          timeOnSite,
          lastPageViewed,
          formAbandoned,
          campaignId,
          aiNotes: notes,
          qualityScore: 0,
          conversionProbability: 0,
          urgencyScore: 0,
        },
      });

      // Log initial activity
      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: lead.id,
          activityType: 'lead_created',
          description: `New lead captured from ${source}${sourceDetail ? ` (${sourceDetail})` : ''}`,
          performedBy: source === 'website' ? 'SYSTEM' : ctx.user.id,
          isAutomated: source === 'website',
          metadata: {
            source,
            sourceDetail,
            referredByPatientId,
            referredByProviderId,
            campaignId,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Auto-score the new lead
      const scoreFactors = calculateLeadQualityScore(
        websiteVisits,
        pageViews,
        timeOnSite || null,
        formAbandoned,
        0,
        0,
        source,
      );

      const qualityScore = Math.min(
        100,
        Object.values(scoreFactors).reduce((sum, val) => sum + val, 0),
      );

      const urgencyScore = calculateUrgencyScore(websiteVisits, pageViews, timeOnSite || null, formAbandoned, 0);

      const conversionProbability = calculateConversionProbability(qualityScore, urgencyScore, source, 0);

      const intentSignals = detectIntentSignals(
        websiteVisits,
        pageViews,
        timeOnSite || null,
        formAbandoned,
        lastPageViewed || null,
        0,
        0,
      );

      // Determine initial status
      let initialStatus: GrowthLeadStatus = 'NEW';
      if (qualityScore >= 70 && urgencyScore >= 60) {
        initialStatus = 'HOT';
      } else if (qualityScore >= 50) {
        initialStatus = 'WARM';
      }

      const { recommendation, suggestedAction } = generateRecommendation(
        qualityScore,
        urgencyScore,
        conversionProbability,
        initialStatus,
        0,
      );

      // Update with scores
      const scoredLead = await ctx.prisma.growthLead.update({
        where: { id: lead.id },
        data: {
          qualityScore,
          urgencyScore,
          conversionProbability,
          scoreFactors: scoreFactors as unknown as Prisma.InputJsonValue,
          intentSignals: intentSignals as unknown as Prisma.InputJsonValue,
          status: initialStatus,
          nextAction: suggestedAction,
          aiNotes: recommendation,
          lastAnalyzedAt: new Date(),
        },
      });

      await auditLog('AI_GROWTH_LEAD_CAPTURED', 'GrowthLead', {
        entityId: lead.id,
        changes: { source, qualityScore, firstName, lastName },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        lead: scoredLead,
        isNew: true,
        merged: false,
        initialScore: {
          qualityScore,
          urgencyScore,
          conversionProbability,
          recommendation,
          suggestedAction,
        },
      };
    }),

  /**
   * List leads with filtering and sorting
   */
  listLeads: protectedProcedure
    .input(listLeadsInputSchema)
    .query(async ({ ctx, input }) => {
      const { status, minQualityScore, assignedToUserId, source, sortBy, sortOrder, limit, offset } = input;

      const where: Prisma.GrowthLeadWhereInput = {
        organizationId: ctx.user.organizationId,
        ...(status && { status }),
        ...(minQualityScore && { qualityScore: { gte: minQualityScore } }),
        ...(assignedToUserId && { assignedToUserId }),
        ...(source && { source }),
      };

      const [leads, totalCount] = await Promise.all([
        ctx.prisma.growthLead.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          take: limit,
          skip: offset,
          include: {
            campaign: { select: { id: true, name: true } },
            activities: {
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
          },
        }),
        ctx.prisma.growthLead.count({ where }),
      ]);

      return {
        leads: leads.map((lead) => ({
          ...lead,
          conversionProbability: Number(lead.conversionProbability),
          name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
          daysSinceCreated: Math.floor((Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        })),
        totalCount,
        hasMore: offset + leads.length < totalCount,
      };
    }),

  /**
   * Get priority rankings for follow-up
   */
  getPriorityRankings: protectedProcedure
    .input(getPriorityRankingsInputSchema)
    .query(async ({ ctx, input }) => {
      const { limit, includeConverted } = input;

      const statusFilter: GrowthLeadStatus[] = includeConverted
        ? ['NEW', 'SCORING', 'HOT', 'WARM', 'COLD', 'NURTURING', 'READY', 'CONVERTED']
        : ['NEW', 'SCORING', 'HOT', 'WARM', 'COLD', 'NURTURING', 'READY'];

      const leads = await ctx.prisma.growthLead.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: statusFilter },
        },
        orderBy: [
          { urgencyScore: 'desc' },
          { qualityScore: 'desc' },
          { conversionProbability: 'desc' },
        ],
        take: limit,
        include: {
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      const rankings: LeadPriorityRanking[] = leads.map((lead, index) => ({
        leadId: lead.id,
        name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
        email: lead.email,
        phone: lead.phone,
        qualityScore: lead.qualityScore,
        conversionProbability: Number(lead.conversionProbability),
        urgencyScore: lead.urgencyScore,
        priorityRank: index + 1,
        status: lead.status,
        source: lead.source,
        daysSinceCreated: Math.floor((Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        lastActivityDate: lead.activities[0]?.createdAt || null,
        nextAction: lead.nextAction,
        assignedTo: lead.assignedToUserId,
      }));

      return { rankings };
    }),

  /**
   * Get detailed conversion prediction for a lead
   */
  getConversionPrediction: protectedProcedure
    .input(getConversionPredictionInputSchema)
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.growthLead.findFirst({
        where: {
          id: input.leadId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      const probability = Number(lead.conversionProbability);
      const scoreFactors = lead.scoreFactors as Record<string, number> | null;

      // Build factor analysis
      const factors: ConversionPrediction['factors'] = [];

      if (scoreFactors) {
        if ((scoreFactors.website_visits || 0) >= 15) {
          factors.push({
            factor: 'Website Engagement',
            impact: 'POSITIVE',
            weight: (scoreFactors.website_visits || 0) / 20,
            description: 'Multiple site visits indicate strong interest',
          });
        }
        if ((scoreFactors.source_quality || 0) >= 15) {
          factors.push({
            factor: 'Lead Source',
            impact: 'POSITIVE',
            weight: (scoreFactors.source_quality || 0) / 20,
            description: 'High-quality lead source with good conversion history',
          });
        }
        if ((scoreFactors.email_engagement || 0) >= 10) {
          factors.push({
            factor: 'Email Engagement',
            impact: 'POSITIVE',
            weight: (scoreFactors.email_engagement || 0) / 15,
            description: 'Active engagement with email communications',
          });
        }
        if ((scoreFactors.form_interaction || 0) >= 10) {
          factors.push({
            factor: 'Form Interaction',
            impact: 'POSITIVE',
            weight: 0.5,
            description: 'Started booking/contact form showing intent',
          });
        }
      }

      // Negative factors
      const daysSinceCreated = Math.floor((Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceCreated > 14) {
        factors.push({
          factor: 'Lead Age',
          impact: 'NEGATIVE',
          weight: Math.min(0.8, daysSinceCreated / 30),
          description: `Lead is ${daysSinceCreated} days old, conversion likelihood decreases over time`,
        });
      }

      if (!lead.email && !lead.phone) {
        factors.push({
          factor: 'Contact Information',
          impact: 'NEGATIVE',
          weight: 0.6,
          description: 'Missing contact information limits follow-up options',
        });
      }

      // Estimate time to convert
      let estimatedTimeToConvert = 'Unknown';
      if (probability >= 0.7) {
        estimatedTimeToConvert = '1-3 days';
      } else if (probability >= 0.5) {
        estimatedTimeToConvert = '1-2 weeks';
      } else if (probability >= 0.3) {
        estimatedTimeToConvert = '2-4 weeks';
      } else {
        estimatedTimeToConvert = '4+ weeks or unlikely';
      }

      // Estimate lifetime value (based on average patient value - configurable)
      const averagePatientValue = 2500; // Could come from organization settings
      const estimatedLifetimeValue = Math.round(probability * averagePatientValue);

      // Generate recommendations
      const recommendedActions: string[] = [];
      if (probability >= 0.6) {
        recommendedActions.push('Schedule immediate phone call');
        recommendedActions.push('Prepare personalized appointment offer');
      }
      if (lead.formAbandoned) {
        recommendedActions.push('Send form completion reminder with incentive');
      }
      if (daysSinceCreated > 7 && lead.emailsOpened === 0) {
        recommendedActions.push('Try alternative communication channel (SMS or phone)');
      }
      if (probability < 0.3) {
        recommendedActions.push('Add to long-term nurture sequence');
        recommendedActions.push('Consider re-engagement campaign in 30 days');
      }

      const prediction: ConversionPrediction = {
        leadId: lead.id,
        probability,
        confidence: probability >= 0.5 ? 0.8 : 0.6, // Higher confidence for higher scores
        factors,
        estimatedTimeToConvert,
        estimatedLifetimeValue,
        recommendedActions,
      };

      return prediction;
    }),

  /**
   * Auto-assign lead to the best available staff member
   */
  autoAssignLead: protectedProcedure
    .input(autoAssignLeadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, preferUserId } = input;

      const lead = await ctx.prisma.growthLead.findFirst({
        where: {
          id: leadId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      let assignedUserId: string | null = preferUserId || null;
      let assignmentReason = '';

      if (preferUserId) {
        // Verify the user exists and is active
        const user = await ctx.prisma.user.findFirst({
          where: {
            id: preferUserId,
            organizationId: ctx.user.organizationId,
            isActive: true,
          },
        });
        if (user) {
          assignmentReason = 'Manually assigned to preferred user';
        } else {
          assignedUserId = null;
        }
      }

      if (!assignedUserId) {
        // Find the best staff member
        const bestMatch = await findBestStaffAssignment(
          ctx.prisma,
          ctx.user.organizationId,
          lead.source,
          lead.qualityScore,
        );

        if (bestMatch) {
          assignedUserId = bestMatch.userId;
          assignmentReason = `Auto-assigned based on availability (${bestMatch.currentLeadCount} current leads) and conversion rate (${(bestMatch.conversionRate * 100).toFixed(0)}%)`;
        } else {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No available staff members for lead assignment',
          });
        }
      }

      // Update the lead
      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: {
          assignedToUserId: assignedUserId,
          nextActionDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Default: follow up within 24 hours
        },
      });

      // Log activity
      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: 'lead_assigned',
          description: assignmentReason,
          oldValue: lead.assignedToUserId || 'unassigned',
          newValue: assignedUserId,
          performedBy: ctx.user.id,
          isAutomated: !preferUserId,
        },
      });

      await auditLog('AI_GROWTH_LEAD_ASSIGNED', 'GrowthLead', {
        entityId: leadId,
        changes: { assignedUserId, reason: assignmentReason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        lead: updatedLead,
        assignedToUserId: assignedUserId,
        assignmentReason,
      };
    }),

  /**
   * Trigger nurturing sequence for a lead
   */
  triggerNurturing: protectedProcedure
    .input(triggerNurturingInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, sequenceType, customMessage } = input;

      const lead = await ctx.prisma.growthLead.findFirst({
        where: {
          id: leadId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      // Define nurture sequence templates
      const sequences: Record<string, { steps: number; description: string }> = {
        awareness: { steps: 5, description: 'Educational content about chiropractic care benefits' },
        consideration: { steps: 4, description: 'Case studies and testimonials' },
        decision: { steps: 3, description: 'Special offers and appointment incentives' },
        re_engagement: { steps: 3, description: 'Win-back campaign with exclusive offer' },
      };

      const sequence = sequences[sequenceType];

      // Update lead with nurturing info
      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: {
          status: 'NURTURING',
          nurtureSequenceId: `${sequenceType}_${Date.now()}`,
          nurtureStepNumber: 1,
          nurtureStartedAt: new Date(),
          nextAction: `Send ${sequenceType} sequence step 1`,
          nextActionDate: new Date(), // Start immediately
        },
      });

      // Log activity
      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: 'nurture_started',
          description: `Started ${sequenceType} nurture sequence (${sequence.steps} steps): ${sequence.description}`,
          performedBy: ctx.user.id,
          isAutomated: false,
          metadata: {
            sequenceType,
            totalSteps: sequence.steps,
            customMessage,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await auditLog('AI_GROWTH_NURTURE_STARTED', 'GrowthLead', {
        entityId: leadId,
        changes: { sequenceType, totalSteps: sequence.steps },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        lead: updatedLead,
        sequenceType,
        totalSteps: sequence.steps,
        description: sequence.description,
        message: `Nurturing sequence "${sequenceType}" has been started for this lead`,
      };
    }),

  /**
   * Track lead conversion to patient
   */
  trackConversion: protectedProcedure
    .input(trackConversionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, patientId, conversionValue, notes } = input;

      const lead = await ctx.prisma.growthLead.findFirst({
        where: {
          id: leadId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      // Verify patient exists
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Calculate conversion time
      const conversionTimeMs = Date.now() - lead.createdAt.getTime();
      const conversionTimeDays = Math.floor(conversionTimeMs / (1000 * 60 * 60 * 24));

      // Update lead
      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: {
          status: 'CONVERTED',
          convertedToPatientId: patientId,
          convertedAt: new Date(),
          conversionValue: conversionValue || null,
        },
      });

      // Log activity
      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: 'lead_converted',
          description: `Lead converted to patient after ${conversionTimeDays} days`,
          newValue: patientId,
          performedBy: ctx.user.id,
          isAutomated: false,
          metadata: {
            patientId,
            patientName: patient.demographics
              ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
              : 'Unknown',
            conversionTimeDays,
            conversionValue,
            notes,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Update campaign stats if applicable
      if (lead.campaignId) {
        await ctx.prisma.growthCampaign.update({
          where: { id: lead.campaignId },
          data: {
            totalConversions: { increment: 1 },
            totalRevenue: conversionValue
              ? { increment: conversionValue }
              : undefined,
          },
        });
      }

      await auditLog('AI_GROWTH_LEAD_CONVERTED', 'GrowthLead', {
        entityId: leadId,
        changes: { patientId, conversionTimeDays, conversionValue },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        lead: updatedLead,
        conversionTimeDays,
        message: `Lead successfully converted to patient after ${conversionTimeDays} day(s)`,
      };
    }),

  /**
   * Update lead status manually
   */
  updateLeadStatus: protectedProcedure
    .input(updateLeadStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, status, notes } = input;

      const lead = await ctx.prisma.growthLead.findFirst({
        where: {
          id: leadId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: { status },
      });

      // Log activity
      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: 'status_changed',
          description: notes || `Status manually changed from ${lead.status} to ${status}`,
          oldValue: lead.status,
          newValue: status,
          performedBy: ctx.user.id,
          isAutomated: false,
        },
      });

      await auditLog('AI_GROWTH_LEAD_STATUS_UPDATED', 'GrowthLead', {
        entityId: leadId,
        changes: { oldStatus: lead.status, newStatus: status, notes },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { lead: updatedLead };
    }),

  /**
   * Bulk score multiple leads
   */
  bulkScoreLeads: adminProcedure
    .input(bulkScoreLeadsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadIds, statusFilter, maxLeads } = input;

      // Build query
      const where: Prisma.GrowthLeadWhereInput = {
        organizationId: ctx.user.organizationId,
        ...(leadIds?.length ? { id: { in: leadIds } } : {}),
        ...(statusFilter?.length ? { status: { in: statusFilter } } : { status: { notIn: ['CONVERTED', 'LOST'] } }),
      };

      const leads = await ctx.prisma.growthLead.findMany({
        where,
        take: maxLeads,
        orderBy: { lastAnalyzedAt: 'asc' }, // Score oldest first
      });

      const results = {
        total: leads.length,
        scored: 0,
        errors: 0,
        statusChanges: { hot: 0, warm: 0, cold: 0 },
      };

      for (const lead of leads) {
        try {
          const daysSinceCreated = Math.floor(
            (Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24),
          );

          const scoreFactors = calculateLeadQualityScore(
            lead.websiteVisits,
            lead.pageViews,
            lead.timeOnSite,
            lead.formAbandoned,
            lead.emailsOpened,
            lead.linksClicked,
            lead.source,
          );

          const qualityScore = Math.min(
            100,
            Object.values(scoreFactors).reduce((sum, val) => sum + val, 0),
          );

          const urgencyScore = calculateUrgencyScore(
            lead.websiteVisits,
            lead.pageViews,
            lead.timeOnSite,
            lead.formAbandoned,
            daysSinceCreated,
          );

          const intentSignals = detectIntentSignals(
            lead.websiteVisits,
            lead.pageViews,
            lead.timeOnSite,
            lead.formAbandoned,
            lead.lastPageViewed,
            lead.emailsOpened,
            lead.linksClicked,
          );

          const conversionProbability = calculateConversionProbability(
            qualityScore,
            urgencyScore,
            lead.source,
            daysSinceCreated,
          );

          // Determine new status
          let newStatus: GrowthLeadStatus = lead.status;
          if (lead.status === 'NEW' || lead.status === 'SCORING') {
            if (qualityScore >= 70 && urgencyScore >= 60) {
              newStatus = 'HOT';
              results.statusChanges.hot++;
            } else if (qualityScore >= 50 || conversionProbability >= 0.4) {
              newStatus = 'WARM';
              results.statusChanges.warm++;
            } else if (qualityScore < 30 && daysSinceCreated > 14) {
              newStatus = 'COLD';
              results.statusChanges.cold++;
            }
          }

          const { recommendation, suggestedAction } = generateRecommendation(
            qualityScore,
            urgencyScore,
            conversionProbability,
            newStatus,
            daysSinceCreated,
          );

          await ctx.prisma.growthLead.update({
            where: { id: lead.id },
            data: {
              qualityScore,
              urgencyScore,
              conversionProbability,
              scoreFactors: scoreFactors as unknown as Prisma.InputJsonValue,
              intentSignals: intentSignals as unknown as Prisma.InputJsonValue,
              status: newStatus,
              nextAction: suggestedAction,
              aiNotes: recommendation,
              lastAnalyzedAt: new Date(),
            },
          });

          results.scored++;
        } catch (error) {
          results.errors++;
        }
      }

      await auditLog('AI_GROWTH_BULK_SCORE', 'GrowthLead', {
        changes: results,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return results;
    }),

  /**
   * Get lead activity history
   */
  getLeadActivity: protectedProcedure
    .input(z.object({
      leadId: z.string(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.growthLead.findFirst({
        where: {
          id: input.leadId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      const activities = await ctx.prisma.growthLeadActivity.findMany({
        where: { growthLeadId: input.leadId },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });

      return { activities };
    }),

  /**
   * Get lead source analytics
   */
  getSourceAnalytics: protectedProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { startDate, endDate } = input;

      const dateFilter: Prisma.GrowthLeadWhereInput = {
        organizationId: ctx.user.organizationId,
        ...(startDate && { createdAt: { gte: startDate } }),
        ...(endDate && { createdAt: { lte: endDate } }),
      };

      // Get leads grouped by source
      const leads = await ctx.prisma.growthLead.findMany({
        where: dateFilter,
        select: {
          source: true,
          status: true,
          qualityScore: true,
          conversionProbability: true,
        },
      });

      // Aggregate by source
      const sourceStats: Record<string, {
        totalLeads: number;
        convertedLeads: number;
        avgQualityScore: number;
        avgConversionProbability: number;
        conversionRate: number;
      }> = {};

      for (const lead of leads) {
        const source = lead.source || 'unknown';
        if (!sourceStats[source]) {
          sourceStats[source] = {
            totalLeads: 0,
            convertedLeads: 0,
            avgQualityScore: 0,
            avgConversionProbability: 0,
            conversionRate: 0,
          };
        }
        sourceStats[source].totalLeads++;
        if (lead.status === 'CONVERTED') {
          sourceStats[source].convertedLeads++;
        }
        sourceStats[source].avgQualityScore += lead.qualityScore;
        sourceStats[source].avgConversionProbability += Number(lead.conversionProbability);
      }

      // Calculate averages and conversion rates
      const analytics = Object.entries(sourceStats).map(([source, stats]) => ({
        source,
        totalLeads: stats.totalLeads,
        convertedLeads: stats.convertedLeads,
        avgQualityScore: Math.round(stats.avgQualityScore / stats.totalLeads),
        avgConversionProbability: stats.avgConversionProbability / stats.totalLeads,
        conversionRate: stats.convertedLeads / stats.totalLeads,
      }));

      // Sort by total leads
      analytics.sort((a, b) => b.totalLeads - a.totalLeads);

      return { analytics };
    }),
});
