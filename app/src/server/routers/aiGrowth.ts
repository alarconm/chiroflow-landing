/**
 * Epic 37: AI Practice Growth Agent - Router
 *
 * tRPC router for AI-powered practice growth operations including:
 * - Intelligent lead scoring and management (US-356)
 * - Auto-capture leads from website, calls, referrals
 * - Lead source tracking and conversion prediction
 * - Priority ranking and auto-assignment
 * - Nurturing sequence triggers and conversion tracking
 * - Automated lead nurturing (US-357)
 * - Personalized email sequences
 * - SMS follow-up campaigns
 * - Content delivery based on interest
 * - Response handling and hot lead escalation
 * - Reputation management (US-358)
 * - Smart review requests after positive experiences
 * - Multi-platform review monitoring (Google, Yelp, Facebook)
 * - Negative review alerts and response suggestions
 * - Reputation score tracking and trending
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
// US-357: Automated Lead Nurturing Types
// ============================================

interface NurtureSequenceTemplate {
  id: string;
  name: string;
  description: string;
  steps: NurtureStep[];
  targetAudience: string;
  averageConversionRate: number;
}

interface NurtureStep {
  stepNumber: number;
  delayDays: number;
  channel: 'EMAIL' | 'SMS';
  subject?: string;
  content: string;
  contentType: 'educational' | 'promotional' | 'testimonial' | 'offer' | 'reminder';
  dynamicContent?: boolean;
  abVariant?: 'A' | 'B';
}

interface NurtureMessage {
  leadId: string;
  channel: 'EMAIL' | 'SMS';
  subject?: string;
  body: string;
  scheduledAt: Date;
  stepNumber: number;
  sequenceId: string;
}

interface NurtureEngagement {
  emailsOpened: number;
  linksClicked: number;
  replies: number;
  optOuts: number;
  lastEngagementDate: Date | null;
  engagementScore: number;
}

interface LeadResponse {
  leadId: string;
  responseType: 'email_reply' | 'sms_reply' | 'call_request' | 'booking_attempt' | 'unsubscribe';
  content?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  urgency: 'high' | 'medium' | 'low';
  requiresHumanFollowUp: boolean;
  suggestedAction: string;
}

interface OptimalTiming {
  bestDayOfWeek: string;
  bestTimeOfDay: string;
  timezone: string;
  nextOptimalSendTime: Date;
  reasoning: string;
}

// ============================================
// US-358: Reputation Management Types
// ============================================

type ReviewPlatformType = 'GOOGLE' | 'YELP' | 'FACEBOOK' | 'HEALTHGRADES' | 'ZOCDOC' | 'OTHER';

interface ReviewCandidate {
  patientId: string;
  patientName: string;
  satisfactionScore: number;
  lastVisitDate: Date;
  totalVisits: number;
  hasReviewedBefore: boolean;
  recommendedPlatform: ReviewPlatformType;
  optimalRequestTime: Date;
  reasoning: string[];
}

interface ReviewRequestResult {
  requestId: string;
  patientId: string;
  platform: ReviewPlatformType;
  sentVia: 'email' | 'sms';
  scheduledAt: Date;
  reviewUrl: string;
}

interface PlatformMetrics {
  platform: string;
  averageRating: number;
  totalReviews: number;
  newReviewsCount: number;
  responseRate: number;
  sentimentScore: number;
  ratingBreakdown: {
    fiveStar: number;
    fourStar: number;
    threeStar: number;
    twoStar: number;
    oneStar: number;
  };
  trend: 'improving' | 'stable' | 'declining';
  competitorComparison: number | null;
}

interface ReputationScore {
  overallScore: number; // 0-100
  platformScores: Record<string, number>;
  trend: 'improving' | 'stable' | 'declining';
  riskLevel: 'low' | 'medium' | 'high';
  keyStrengths: string[];
  areasForImprovement: string[];
  recommendedActions: string[];
}

interface NegativeReviewAlert {
  id: string;
  platform: string;
  rating: number;
  reviewDate: Date;
  severity: 'critical' | 'warning' | 'notice';
  requiresResponse: boolean;
  suggestedResponses: string[];
  escalatedTo: string | null;
}

interface ReviewResponseSuggestion {
  tone: 'professional' | 'empathetic' | 'apologetic' | 'grateful';
  response: string;
  keyPoints: string[];
  avoidTopics: string[];
}

// ============================================
// US-359: Referral Optimization Types
// ============================================

interface ReferralCandidate {
  patientId: string;
  patientName: string;
  email: string | null;
  phone: string | null;
  npsScore: number; // 0-10
  referralScore: number; // 0-100 likelihood to refer
  satisfactionScore: number;
  loyaltyScore: number;
  visitCount: number;
  consecutiveVisits: number;
  previousReferrals: number;
  hasLeftReview: boolean;
  reviewRating: number | null;
  lastVisitDate: Date | null;
  optimalOutreachDate: Date;
  optimalChannel: 'email' | 'sms' | 'in_person';
  scoreFactors: {
    visit_frequency: number;
    positive_reviews: number;
    tenure: number;
    treatment_success: number;
    engagement: number;
  };
  reasoning: string[];
}

interface ReferralProgramInfo {
  programId: string;
  programName: string;
  referrerRewardType: string;
  referrerRewardValue: number;
  refereeRewardType: string | null;
  refereeRewardValue: number | null;
  isActive: boolean;
  termsAndConditions: string | null;
}

interface ReferralPromotion {
  patientId: string;
  programId: string;
  channel: 'email' | 'sms';
  message: { subject?: string; body: string };
  scheduledAt: Date;
  referralCode: string;
}

interface ReferralSource {
  source: string;
  totalReferrals: number;
  convertedReferrals: number;
  conversionRate: number;
  totalValue: number;
  averageValue: number;
  topReferrers: Array<{
    patientId: string;
    patientName: string;
    referralCount: number;
    convertedCount: number;
  }>;
}

interface ReferralThankYou {
  patientId: string;
  referralId: string;
  channel: 'email' | 'sms';
  message: { subject?: string; body: string };
  rewardInfo: {
    rewardType: string;
    rewardValue: number;
    rewardNote: string | null;
  } | null;
}

interface ReferralIncentiveStatus {
  patientId: string;
  patientName: string;
  referralId: string;
  referralCode: string;
  refereeStatus: string;
  rewardEligible: boolean;
  rewardIssued: boolean;
  rewardAmount: number | null;
  rewardType: string | null;
  rewardIssuedAt: Date | null;
  qualifiedAt: Date | null;
  expiresAt: Date | null;
}

interface ProviderReferralRelationship {
  providerId: string;
  providerName: string;
  providerType: string; // "MD", "DO", "PT", "DC", etc.
  practice: string | null;
  referralsReceived: number;
  referralsSent: number;
  lastReferralDate: Date | null;
  relationshipStrength: 'strong' | 'moderate' | 'developing' | 'new';
  nurturingActions: string[];
  lastContactDate: Date | null;
  nextOutreachDate: Date | null;
}

// ============================================
// US-360: Patient Reactivation Types
// ============================================

type ReactivationStatus = 'IDENTIFIED' | 'CONTACTED' | 'ENGAGED' | 'REACTIVATED' | 'DECLINED' | 'LOST';

type LapseReason =
  | 'no_perceived_need'
  | 'financial'
  | 'scheduling'
  | 'moved_away'
  | 'dissatisfied'
  | 'switched_provider'
  | 'insurance_change'
  | 'health_improved'
  | 'forgot'
  | 'life_event'
  | 'unknown';

interface ReactivationCandidate {
  patientId: string;
  patientName: string;
  email: string | null;
  phone: string | null;
  lastVisitDate: Date;
  daysSinceLastVisit: number;
  daysOverdue: number | null;
  lifetimeValue: number;
  averageVisitValue: number;
  potentialRecovery: number;
  reactivationScore: number; // 0-100 likelihood of reactivation
  likelyReason: LapseReason;
  reasonConfidence: number;
  reasonFactors: Array<{
    factor: string;
    weight: number;
    evidence: string;
  }>;
  recommendedApproach: 'special_offer' | 'wellness_check' | 'personal_outreach' | 'reminder' | 'win_back';
  recommendedOffer: string | null;
  recommendedChannel: 'email' | 'sms' | 'phone';
  recommendedTiming: Date;
  priorityRank: number;
}

interface ReactivationOutreach {
  opportunityId: string;
  patientId: string;
  patientName: string;
  channel: 'email' | 'sms' | 'phone';
  message: {
    subject?: string;
    body: string;
  };
  offer: {
    type: string;
    value: string;
    expiresAt: Date;
    code: string;
  } | null;
  scheduledAt: Date;
  status: 'scheduled' | 'sent' | 'delivered' | 'failed';
}

interface ReactivationOffer {
  offerId: string;
  name: string;
  type: 'percentage_discount' | 'dollar_discount' | 'free_service' | 'complimentary_exam' | 'package_deal';
  value: string;
  description: string;
  validDays: number;
  targetReason: LapseReason[];
  minDaysLapsed: number;
  maxDaysLapsed: number | null;
  isActive: boolean;
}

interface ReactivationAnalysis {
  patientId: string;
  likelyReason: LapseReason;
  confidence: number;
  factors: Array<{
    factor: string;
    weight: number;
    evidence: string;
  }>;
  recommendations: string[];
  suggestedApproach: 'special_offer' | 'wellness_check' | 'personal_outreach' | 'reminder' | 'win_back';
  suggestedOffer: ReactivationOffer | null;
  suggestedChannel: 'email' | 'sms' | 'phone';
  optimalTiming: {
    bestDayOfWeek: string;
    bestTimeOfDay: string;
    nextOptimalDate: Date;
    reasoning: string;
  };
}

interface ReactivationMetrics {
  totalCandidates: number;
  totalOutreaches: number;
  totalResponses: number;
  totalReactivated: number;
  reactivationRate: number;
  averageTimeToReactivate: number; // days
  valueRecovered: number;
  byReason: Record<LapseReason, {
    count: number;
    reactivated: number;
    rate: number;
  }>;
  byChannel: Record<string, {
    outreaches: number;
    responses: number;
    reactivated: number;
    rate: number;
  }>;
  byOffer: Array<{
    offerType: string;
    sent: number;
    redeemed: number;
    redemptionRate: number;
    valueRecovered: number;
  }>;
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
// US-357: Lead Nurturing Helper Functions
// ============================================

/**
 * Get nurture sequence templates based on lead characteristics
 */
function getNurtureSequenceTemplates(): NurtureSequenceTemplate[] {
  return [
    {
      id: 'awareness',
      name: 'Awareness Sequence',
      description: 'Educational content about chiropractic care benefits for new leads',
      targetAudience: 'New leads with low engagement',
      averageConversionRate: 0.15,
      steps: [
        {
          stepNumber: 1,
          delayDays: 0,
          channel: 'EMAIL',
          subject: 'Welcome! Here\'s what chiropractic care can do for you',
          content: 'Hi {{firstName}},\n\nThank you for your interest in {{practiceName}}. We\'re excited to share how chiropractic care can help you live a healthier, pain-free life.\n\nChiropractic care offers:\n- Natural pain relief without medications\n- Improved mobility and flexibility\n- Better posture and spinal alignment\n- Enhanced overall wellness\n\nWould you like to learn more? Reply to this email or call us at {{practicePhone}}.\n\nBest,\n{{practiceName}} Team',
          contentType: 'educational',
          dynamicContent: true,
        },
        {
          stepNumber: 2,
          delayDays: 3,
          channel: 'EMAIL',
          subject: 'Common conditions we treat',
          content: 'Hi {{firstName}},\n\nDid you know chiropractic care can help with:\n\n• Back pain and sciatica\n• Neck pain and headaches\n• Sports injuries\n• Work-related strain\n• Poor posture\n\nMany of our patients find relief after just a few visits. If you\'re experiencing any of these issues, we\'re here to help.\n\nSchedule a consultation: {{bookingLink}}\n\nBest,\n{{practiceName}} Team',
          contentType: 'educational',
          dynamicContent: true,
        },
        {
          stepNumber: 3,
          delayDays: 7,
          channel: 'SMS',
          content: 'Hi {{firstName}}! Quick reminder from {{practiceName}} - we offer free 15-min consultations to discuss your health goals. Interested? Reply YES to learn more!',
          contentType: 'offer',
          dynamicContent: true,
        },
        {
          stepNumber: 4,
          delayDays: 10,
          channel: 'EMAIL',
          subject: 'See what our patients are saying',
          content: 'Hi {{firstName}},\n\nDon\'t just take our word for it! Here\'s what our patients say:\n\n"After years of back pain, I finally found relief. The team at {{practiceName}} changed my life!" - Sarah M.\n\n"I was skeptical at first, but now I can\'t imagine life without regular adjustments." - Mike T.\n\nReady to start your journey? Book your first appointment today: {{bookingLink}}\n\nBest,\n{{practiceName}} Team',
          contentType: 'testimonial',
          dynamicContent: true,
        },
        {
          stepNumber: 5,
          delayDays: 14,
          channel: 'EMAIL',
          subject: 'Special offer just for you',
          content: 'Hi {{firstName}},\n\nWe\'d love to welcome you to {{practiceName}}! For a limited time, new patients receive:\n\n✓ Free initial consultation\n✓ Comprehensive health assessment\n✓ Personalized treatment plan\n\nDon\'t miss this opportunity to invest in your health.\n\nBook now: {{bookingLink}}\n\nBest,\n{{practiceName}} Team',
          contentType: 'offer',
          dynamicContent: true,
        },
      ],
    },
    {
      id: 'consideration',
      name: 'Consideration Sequence',
      description: 'Case studies and testimonials for engaged leads',
      targetAudience: 'Leads showing interest but not yet converted',
      averageConversionRate: 0.25,
      steps: [
        {
          stepNumber: 1,
          delayDays: 0,
          channel: 'EMAIL',
          subject: 'Your personalized care plan awaits',
          content: 'Hi {{firstName}},\n\nThank you for exploring {{practiceName}}! Based on your interest, we\'ve put together some resources just for you.\n\nWhat to expect at your first visit:\n1. Health history review\n2. Physical examination\n3. Digital X-rays (if needed)\n4. Treatment plan discussion\n\nMost patients feel improvement within the first few visits. Ready to get started?\n\nBook your appointment: {{bookingLink}}\n\nBest,\n{{practiceName}} Team',
          contentType: 'educational',
          dynamicContent: true,
        },
        {
          stepNumber: 2,
          delayDays: 2,
          channel: 'SMS',
          content: 'Hi {{firstName}}, noticed you\'ve been looking into chiropractic care. Have questions? Text back and our team will help! - {{practiceName}}',
          contentType: 'reminder',
          dynamicContent: true,
        },
        {
          stepNumber: 3,
          delayDays: 5,
          channel: 'EMAIL',
          subject: 'Real results: Patient success story',
          content: 'Hi {{firstName}},\n\nMeet John, a 45-year-old office worker who suffered from chronic lower back pain for over 5 years.\n\nAfter starting treatment at {{practiceName}}:\n• Week 1: 30% pain reduction\n• Week 4: Able to sit without discomfort\n• Week 8: Back to playing golf!\n\n"I wish I had come in sooner," John says.\n\nYour success story could be next. Schedule your first appointment: {{bookingLink}}\n\nBest,\n{{practiceName}} Team',
          contentType: 'testimonial',
          dynamicContent: true,
        },
        {
          stepNumber: 4,
          delayDays: 8,
          channel: 'EMAIL',
          subject: 'Your questions answered',
          content: 'Hi {{firstName}},\n\nStill considering chiropractic care? Here are answers to common questions:\n\nQ: Is chiropractic treatment safe?\nA: Yes! Chiropractic care is one of the safest drug-free, non-invasive therapies available.\n\nQ: How many visits will I need?\nA: This varies by condition. Most patients see improvement in 4-8 visits.\n\nQ: Do you accept my insurance?\nA: We accept most major insurance plans. Contact us to verify your coverage.\n\nReady to take the next step? {{bookingLink}}\n\nBest,\n{{practiceName}} Team',
          contentType: 'educational',
          dynamicContent: true,
        },
      ],
    },
    {
      id: 'decision',
      name: 'Decision Sequence',
      description: 'Special offers and appointment incentives for ready-to-book leads',
      targetAudience: 'Hot leads ready to convert',
      averageConversionRate: 0.45,
      steps: [
        {
          stepNumber: 1,
          delayDays: 0,
          channel: 'EMAIL',
          subject: 'We\'re holding a spot for you',
          content: 'Hi {{firstName}},\n\nWe noticed you\'ve been exploring treatment options at {{practiceName}}. Great news - we have availability this week!\n\n🗓️ Available appointments:\n• Tomorrow at 10:00 AM\n• Thursday at 2:00 PM\n• Friday at 11:00 AM\n\nBook now to secure your preferred time: {{bookingLink}}\n\nLimited spots available!\n\nBest,\n{{practiceName}} Team',
          contentType: 'offer',
          dynamicContent: true,
        },
        {
          stepNumber: 2,
          delayDays: 1,
          channel: 'SMS',
          content: '⏰ {{firstName}}, your exclusive appointment slot is waiting! Book today and get a FREE consultation. Call {{practicePhone}} or book online.',
          contentType: 'offer',
          dynamicContent: true,
        },
        {
          stepNumber: 3,
          delayDays: 3,
          channel: 'EMAIL',
          subject: 'Last chance: Special offer expires soon',
          content: 'Hi {{firstName}},\n\nThis is your final reminder about our new patient special:\n\n🎁 FREE initial consultation (Value: $75)\n🎁 Complimentary posture analysis\n🎁 10% off your first treatment\n\nOffer expires in 48 hours!\n\nDon\'t let this opportunity pass: {{bookingLink}}\n\nWe hope to see you soon!\n\n{{practiceName}} Team',
          contentType: 'offer',
          dynamicContent: true,
        },
      ],
    },
    {
      id: 're_engagement',
      name: 'Re-engagement Sequence',
      description: 'Win-back campaign for cold or inactive leads',
      targetAudience: 'Leads who have gone cold or stopped engaging',
      averageConversionRate: 0.10,
      steps: [
        {
          stepNumber: 1,
          delayDays: 0,
          channel: 'EMAIL',
          subject: 'We miss you, {{firstName}}!',
          content: 'Hi {{firstName}},\n\nIt\'s been a while since we heard from you, and we wanted to check in.\n\nLife gets busy, but your health shouldn\'t wait. If you\'re still dealing with:\n• Persistent pain\n• Limited mobility\n• Poor sleep due to discomfort\n\n...we\'re here to help when you\'re ready.\n\nAs a returning visitor, enjoy 15% off your first treatment.\n\nBook when you\'re ready: {{bookingLink}}\n\nBest,\n{{practiceName}} Team',
          contentType: 'promotional',
          dynamicContent: true,
        },
        {
          stepNumber: 2,
          delayDays: 7,
          channel: 'EMAIL',
          subject: 'Something new at {{practiceName}}',
          content: 'Hi {{firstName}},\n\nSince you last visited our website, we\'ve added:\n\n✨ Extended evening hours\n✨ Online booking for your convenience\n✨ New treatment modalities\n\nWe\'d love to show you what\'s new. Your first visit includes a comprehensive assessment at no extra charge.\n\nSee you soon? {{bookingLink}}\n\nBest,\n{{practiceName}} Team',
          contentType: 'promotional',
          dynamicContent: true,
        },
        {
          stepNumber: 3,
          delayDays: 14,
          channel: 'SMS',
          content: '{{firstName}}, we haven\'t forgotten about you! Ready to feel better? Reply READY and we\'ll call you to schedule. - {{practiceName}}',
          contentType: 'reminder',
          dynamicContent: true,
        },
      ],
    },
  ];
}

/**
 * Get the appropriate nurture sequence based on lead characteristics
 */
function selectNurtureSequence(
  qualityScore: number,
  urgencyScore: number,
  conversionProbability: number,
  daysSinceCreated: number,
  engagement: NurtureEngagement | null,
): NurtureSequenceTemplate {
  const templates = getNurtureSequenceTemplates();

  // Re-engagement for cold leads
  if (daysSinceCreated > 21 && (engagement?.engagementScore || 0) < 20) {
    return templates.find(t => t.id === 're_engagement')!;
  }

  // Decision sequence for hot leads
  if (qualityScore >= 70 && urgencyScore >= 50) {
    return templates.find(t => t.id === 'decision')!;
  }

  // Consideration sequence for warm leads
  if (qualityScore >= 40 || conversionProbability >= 0.3) {
    return templates.find(t => t.id === 'consideration')!;
  }

  // Default to awareness sequence
  return templates.find(t => t.id === 'awareness')!;
}

/**
 * Calculate optimal send time based on lead behavior and general patterns
 */
function calculateOptimalTiming(
  leadData: {
    lastPageViewed: string | null;
    websiteVisits: number;
    timeOnSite: number | null;
    emailsOpened: number;
    linksClicked: number;
  },
  timezone: string = 'America/Los_Angeles',
): OptimalTiming {
  const now = new Date();

  // Default optimal times based on industry research
  // Best days: Tuesday, Wednesday, Thursday
  // Best times: 10am, 2pm, 8pm

  const dayOfWeek = now.getDay();
  let bestDayOfWeek = 'Tuesday';
  let daysToAdd = 0;

  // Find next Tuesday, Wednesday, or Thursday
  if (dayOfWeek === 0) daysToAdd = 2; // Sunday -> Tuesday
  else if (dayOfWeek === 1) daysToAdd = 1; // Monday -> Tuesday
  else if (dayOfWeek === 2) daysToAdd = 0; // Tuesday -> Tuesday
  else if (dayOfWeek === 3) daysToAdd = 0; // Wednesday -> Wednesday
  else if (dayOfWeek === 4) daysToAdd = 0; // Thursday -> Thursday
  else if (dayOfWeek === 5) daysToAdd = 4; // Friday -> Tuesday
  else if (dayOfWeek === 6) daysToAdd = 3; // Saturday -> Tuesday

  const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetDay = (dayOfWeek + daysToAdd) % 7;
  bestDayOfWeek = weekDays[targetDay];

  // Determine best time of day based on engagement patterns
  let bestTimeOfDay = '10:00 AM';
  let reasoning = 'Default mid-morning time for professional communications';

  // If lead has shown evening engagement (e.g., visited after 6pm), schedule for evening
  const timeOnSiteSeconds = leadData.timeOnSite || 0;
  if (timeOnSiteSeconds > 300 && leadData.emailsOpened > 0) {
    bestTimeOfDay = '2:00 PM';
    reasoning = 'Lead shows strong engagement; optimal afternoon timing for follow-up';
  }

  if (leadData.linksClicked > 2) {
    bestTimeOfDay = '10:00 AM';
    reasoning = 'High-engagement lead; morning timing for immediate action';
  }

  // Calculate next optimal send time
  const nextOptimalSendTime = new Date(now);
  nextOptimalSendTime.setDate(nextOptimalSendTime.getDate() + daysToAdd);

  const timeParts = bestTimeOfDay.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (timeParts) {
    let hours = parseInt(timeParts[1]);
    if (timeParts[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (timeParts[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
    nextOptimalSendTime.setHours(hours, parseInt(timeParts[2]), 0, 0);
  }

  // If the calculated time is in the past, move to next week
  if (nextOptimalSendTime <= now) {
    nextOptimalSendTime.setDate(nextOptimalSendTime.getDate() + 7);
  }

  return {
    bestDayOfWeek,
    bestTimeOfDay,
    timezone,
    nextOptimalSendTime,
    reasoning,
  };
}

/**
 * Process template variables in nurture content
 */
function processNurtureContent(
  content: string,
  variables: {
    firstName: string;
    lastName: string;
    practiceName: string;
    practicePhone: string;
    bookingLink: string;
  },
): string {
  return content
    .replace(/\{\{firstName\}\}/g, variables.firstName)
    .replace(/\{\{lastName\}\}/g, variables.lastName)
    .replace(/\{\{practiceName\}\}/g, variables.practiceName)
    .replace(/\{\{practicePhone\}\}/g, variables.practicePhone)
    .replace(/\{\{bookingLink\}\}/g, variables.bookingLink);
}

/**
 * Analyze response sentiment and determine urgency
 */
function analyzeResponseSentiment(
  content: string,
): { sentiment: 'positive' | 'neutral' | 'negative'; urgency: 'high' | 'medium' | 'low' } {
  const lowerContent = content.toLowerCase();

  // Positive indicators
  const positiveWords = ['yes', 'interested', 'ready', 'book', 'schedule', 'appointment', 'great', 'thanks', 'perfect', 'love'];
  const positiveCount = positiveWords.filter(w => lowerContent.includes(w)).length;

  // Negative indicators
  const negativeWords = ['no', 'not interested', 'unsubscribe', 'stop', 'remove', 'cancel', 'spam'];
  const negativeCount = negativeWords.filter(w => lowerContent.includes(w)).length;

  // Urgency indicators
  const urgentWords = ['pain', 'hurt', 'urgent', 'asap', 'soon', 'today', 'tomorrow', 'emergency'];
  const urgentCount = urgentWords.filter(w => lowerContent.includes(w)).length;

  let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (positiveCount > negativeCount) sentiment = 'positive';
  else if (negativeCount > positiveCount) sentiment = 'negative';

  let urgency: 'high' | 'medium' | 'low' = 'low';
  if (urgentCount >= 2 || (positiveCount >= 2 && urgentCount >= 1)) urgency = 'high';
  else if (positiveCount >= 1 || urgentCount >= 1) urgency = 'medium';

  return { sentiment, urgency };
}

/**
 * Calculate engagement score from nurture interactions
 */
function calculateEngagementScore(
  emailsOpened: number,
  linksClicked: number,
  replies: number,
  stepNumber: number,
): number {
  // Score out of 100
  let score = 0;

  // Email opens: up to 30 points
  score += Math.min(30, emailsOpened * 10);

  // Link clicks: up to 40 points (more valuable than opens)
  score += Math.min(40, linksClicked * 15);

  // Replies: up to 30 points (most valuable)
  score += Math.min(30, replies * 20);

  // Bonus for early engagement (engaged quickly in sequence)
  if (stepNumber <= 2 && score >= 30) {
    score = Math.min(100, score + 10);
  }

  return Math.min(100, score);
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
// US-357: Lead Nurturing Input Schemas
// ============================================

const nurtureLeadInputSchema = z.object({
  leadId: z.string(),
  sequenceType: z.enum(['awareness', 'consideration', 'decision', 're_engagement']).optional(),
  customContent: z.string().optional(),
  immediateStart: z.boolean().default(true),
});

const advanceNurtureStepInputSchema = z.object({
  leadId: z.string(),
  skipToStep: z.number().min(1).optional(),
  markEngaged: z.boolean().default(false),
});

const recordNurtureEngagementInputSchema = z.object({
  leadId: z.string(),
  engagementType: z.enum(['email_opened', 'link_clicked', 'reply_received', 'sms_reply', 'opt_out']),
  metadata: z.object({
    stepNumber: z.number().optional(),
    linkUrl: z.string().optional(),
    replyContent: z.string().optional(),
  }).optional(),
});

const handleLeadResponseInputSchema = z.object({
  leadId: z.string(),
  responseType: z.enum(['email_reply', 'sms_reply', 'call_request', 'booking_attempt', 'unsubscribe']),
  content: z.string().optional(),
});

const getOptimalTimingInputSchema = z.object({
  leadId: z.string(),
  channel: z.enum(['EMAIL', 'SMS']).default('EMAIL'),
});

const getNurtureSequencesInputSchema = z.object({
  leadId: z.string().optional(),
});

const pauseNurtureInputSchema = z.object({
  leadId: z.string(),
  reason: z.string().optional(),
});

const resumeNurtureInputSchema = z.object({
  leadId: z.string(),
  restartSequence: z.boolean().default(false),
});

const escalateHotLeadInputSchema = z.object({
  leadId: z.string(),
  urgency: z.enum(['high', 'medium', 'low']).default('high'),
  reason: z.string(),
  preferredStaffId: z.string().optional(),
});

const getNurtureAnalyticsInputSchema = z.object({
  sequenceType: z.enum(['awareness', 'consideration', 'decision', 're_engagement']).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

// ============================================
// US-358: Reputation Management Input Schemas
// ============================================

const requestReviewInputSchema = z.object({
  patientId: z.string(),
  platform: z.enum(['GOOGLE', 'YELP', 'FACEBOOK', 'HEALTHGRADES', 'ZOCDOC', 'OTHER']).default('GOOGLE'),
  channel: z.enum(['email', 'sms']).default('email'),
  customMessage: z.string().optional(),
  scheduleFor: z.date().optional(), // Optional: schedule for specific time
  triggeredByAppointmentId: z.string().optional(),
});

const identifySatisfiedPatientsInputSchema = z.object({
  minVisits: z.number().min(1).default(2),
  minDaysSinceLastVisit: z.number().min(0).default(1),
  maxDaysSinceLastVisit: z.number().min(1).default(14),
  excludeRecentlyRequested: z.boolean().default(true),
  recentRequestDays: z.number().min(1).default(90),
  limit: z.number().min(1).max(100).default(20),
});

const getReviewRequestsInputSchema = z.object({
  status: z.enum(['PENDING', 'SENT', 'CLICKED', 'REVIEWED', 'DECLINED', 'FAILED']).optional(),
  platform: z.enum(['GOOGLE', 'YELP', 'FACEBOOK', 'HEALTHGRADES', 'ZOCDOC', 'OTHER']).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const updatePlatformMetricsInputSchema = z.object({
  platform: z.enum(['google', 'yelp', 'facebook', 'healthgrades']),
  averageRating: z.number().min(0).max(5),
  totalReviews: z.number().min(0),
  newReviewsCount: z.number().min(0).optional(),
  responseRate: z.number().min(0).max(1).optional(),
  ratingBreakdown: z.object({
    fiveStar: z.number().min(0).default(0),
    fourStar: z.number().min(0).default(0),
    threeStar: z.number().min(0).default(0),
    twoStar: z.number().min(0).default(0),
    oneStar: z.number().min(0).default(0),
  }).optional(),
  sentimentScore: z.number().min(-1).max(1).optional(),
  platformUrl: z.string().url().optional(),
});

const getPlatformMetricsInputSchema = z.object({
  platform: z.enum(['google', 'yelp', 'facebook', 'healthgrades']).optional(),
  includeHistory: z.boolean().default(false),
  historyDays: z.number().min(1).max(365).default(30),
});

const alertNegativeReviewInputSchema = z.object({
  platform: z.string(),
  rating: z.number().min(1).max(5),
  reviewContent: z.string().optional(),
  reviewerName: z.string().optional(),
  reviewDate: z.date().optional(),
  reviewUrl: z.string().url().optional(),
});

const getReviewResponseSuggestionInputSchema = z.object({
  platform: z.string(),
  rating: z.number().min(1).max(5),
  reviewContent: z.string(),
  reviewerName: z.string().optional(),
  tone: z.enum(['professional', 'empathetic', 'apologetic', 'grateful']).optional(),
});

const getReputationScoreInputSchema = z.object({
  includeRecommendations: z.boolean().default(true),
  includeTrends: z.boolean().default(true),
});

const getReputationTrendsInputSchema = z.object({
  days: z.number().min(7).max(365).default(30),
  platform: z.enum(['google', 'yelp', 'facebook', 'healthgrades']).optional(),
});

const bulkRequestReviewsInputSchema = z.object({
  patientIds: z.array(z.string()),
  platform: z.enum(['GOOGLE', 'YELP', 'FACEBOOK', 'HEALTHGRADES', 'ZOCDOC', 'OTHER']).default('GOOGLE'),
  channel: z.enum(['email', 'sms']).default('email'),
  spreadOverDays: z.number().min(1).max(14).default(1), // Spread requests over N days
});

const acknowledgeNegativeReviewInputSchema = z.object({
  alertId: z.string(),
  action: z.enum(['acknowledged', 'responded', 'escalated', 'dismissed']),
  responseContent: z.string().optional(),
  escalateTo: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================
// US-359: Referral Optimization Input Schemas
// ============================================

const identifyReferrersInputSchema = z.object({
  minNpsScore: z.number().min(0).max(10).default(8), // Promoters are 9-10, but 8+ are good candidates
  minVisits: z.number().min(1).default(3),
  minSatisfactionScore: z.number().min(0).max(100).default(70),
  excludeRecentlyContacted: z.boolean().default(true),
  recentContactDays: z.number().min(1).default(30),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['referral_score', 'nps_score', 'visit_count', 'previous_referrals']).default('referral_score'),
});

const calculateNpsScoreInputSchema = z.object({
  patientId: z.string(),
  surveyResponse: z.number().min(0).max(10).optional(), // Direct NPS survey response
  calculateFromBehavior: z.boolean().default(true), // Infer from behavior if no survey
});

const promoteReferralProgramInputSchema = z.object({
  patientIds: z.array(z.string()),
  programId: z.string().optional(), // Use default active program if not specified
  channel: z.enum(['email', 'sms']).default('email'),
  customMessage: z.string().optional(),
  spreadOverDays: z.number().min(1).max(14).default(1),
});

const getReferralSourcesInputSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  includeDetails: z.boolean().default(true),
});

const trackReferralInputSchema = z.object({
  referrerId: z.string(),
  refereeName: z.string(),
  refereeEmail: z.string().email().optional(),
  refereePhone: z.string().optional(),
  refereeNotes: z.string().optional(),
  programId: z.string().optional(),
  source: z.enum(['patient_referral', 'provider_referral', 'online', 'walk_in', 'other']).default('patient_referral'),
});

const sendReferralThankYouInputSchema = z.object({
  referralId: z.string(),
  channel: z.enum(['email', 'sms']).default('email'),
  customMessage: z.string().optional(),
  includeRewardInfo: z.boolean().default(true),
});

const getReferralIncentivesInputSchema = z.object({
  patientId: z.string().optional(),
  status: z.enum(['pending', 'qualified', 'issued', 'expired']).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().min(1).max(100).default(50),
});

const issueReferralRewardInputSchema = z.object({
  referralId: z.string(),
  recipientType: z.enum(['referrer', 'referee']),
  rewardAmount: z.number().min(0).optional(), // Override program default
  notes: z.string().optional(),
});

const getProviderRelationshipsInputSchema = z.object({
  providerType: z.string().optional(),
  relationshipStrength: z.enum(['strong', 'moderate', 'developing', 'new']).optional(),
  limit: z.number().min(1).max(100).default(20),
});

const nurtureProviderRelationshipInputSchema = z.object({
  providerId: z.string(),
  action: z.enum(['send_update', 'schedule_meeting', 'send_thank_you', 'request_feedback']),
  customMessage: z.string().optional(),
  channel: z.enum(['email', 'phone', 'mail']).default('email'),
});

const createProviderRelationshipInputSchema = z.object({
  providerName: z.string(),
  providerType: z.string(),
  practice: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================
// US-360: Patient Reactivation Input Schemas
// ============================================

const identifyReactivationCandidatesInputSchema = z.object({
  minDaysSinceVisit: z.number().int().min(30).default(90),
  maxDaysSinceVisit: z.number().int().optional(),
  minLifetimeValue: z.number().optional(),
  minReactivationScore: z.number().int().min(0).max(100).default(30),
  limit: z.number().int().min(1).max(100).default(50),
  excludeDeclined: z.boolean().default(true),
  excludeRecentOutreach: z.boolean().default(true),
  recentOutreachDays: z.number().int().default(14),
});

const analyzePatientLapseInputSchema = z.object({
  patientId: z.string(),
  forceReanalysis: z.boolean().default(false),
});

const reactivatePatientInputSchema = z.object({
  patientId: z.string(),
  approach: z.enum(['special_offer', 'wellness_check', 'personal_outreach', 'reminder', 'win_back']).optional(),
  channel: z.enum(['email', 'sms', 'phone']).optional(),
  offerId: z.string().optional(),
  customMessage: z.string().optional(),
  scheduledAt: z.date().optional(),
});

const sendReactivationOfferInputSchema = z.object({
  patientId: z.string(),
  offerId: z.string(),
  channel: z.enum(['email', 'sms']),
  customMessage: z.string().optional(),
  scheduledAt: z.date().optional(),
});

const getReactivationOffersInputSchema = z.object({
  patientId: z.string().optional(),
  lapseReason: z.enum([
    'no_perceived_need',
    'financial',
    'scheduling',
    'moved_away',
    'dissatisfied',
    'switched_provider',
    'insurance_change',
    'health_improved',
    'forgot',
    'life_event',
    'unknown',
  ]).optional(),
  isActive: z.boolean().default(true),
});

const trackReactivationResponseInputSchema = z.object({
  opportunityId: z.string(),
  responseType: z.enum(['replied', 'booked', 'declined', 'unsubscribed', 'no_response']),
  responseContent: z.string().optional(),
  bookedAppointmentId: z.string().optional(),
});

const recordReactivationSuccessInputSchema = z.object({
  opportunityId: z.string(),
  appointmentId: z.string(),
  notes: z.string().optional(),
});

const getReactivationMetricsInputSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

const bulkReactivationOutreachInputSchema = z.object({
  patientIds: z.array(z.string()).min(1).max(100),
  approach: z.enum(['special_offer', 'wellness_check', 'personal_outreach', 'reminder', 'win_back']),
  channel: z.enum(['email', 'sms']),
  offerId: z.string().optional(),
  spreadOverDays: z.number().int().min(1).max(14).default(1),
});

const getOptimalReactivationTimingInputSchema = z.object({
  patientId: z.string(),
});

const getReactivationOpportunitiesInputSchema = z.object({
  status: z.enum(['IDENTIFIED', 'CONTACTED', 'ENGAGED', 'REACTIVATED', 'DECLINED', 'LOST']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['reactivationScore', 'daysSinceLastVisit', 'lifetimeValue', 'createdAt']).default('reactivationScore'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================
// US-358: Reputation Management Helper Functions
// ============================================

/**
 * Calculate patient satisfaction score based on visit history
 */
function calculatePatientSatisfactionScore(
  totalVisits: number,
  appointmentHistory: Array<{ status: string; rating?: number | null }>,
  hasComplaintsOrCancellations: boolean,
): number {
  let score = 50; // Base score

  // Visit frequency bonus (up to 25 points)
  if (totalVisits >= 10) score += 25;
  else if (totalVisits >= 5) score += 20;
  else if (totalVisits >= 3) score += 15;
  else if (totalVisits >= 2) score += 10;

  // Completion rate (up to 15 points)
  const completedAppointments = appointmentHistory.filter(a => a.status === 'COMPLETED').length;
  const completionRate = appointmentHistory.length > 0 ? completedAppointments / appointmentHistory.length : 0;
  score += Math.floor(completionRate * 15);

  // Rating bonus if available (up to 10 points)
  const ratings = appointmentHistory
    .filter(a => a.rating !== null && a.rating !== undefined)
    .map(a => a.rating as number);
  if (ratings.length > 0) {
    const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    score += Math.floor((avgRating / 5) * 10);
  }

  // Penalty for complaints/cancellations
  if (hasComplaintsOrCancellations) {
    score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate optimal time to request a review
 */
function calculateOptimalReviewRequestTime(
  lastAppointmentDate: Date,
  preferredContactTime: string | null,
): Date {
  // Best to request 1-3 days after appointment
  const optimalTime = new Date(lastAppointmentDate);
  optimalTime.setDate(optimalTime.getDate() + 2); // 2 days later

  // Set to preferred time or default to 10 AM
  if (preferredContactTime) {
    const [hours, minutes] = preferredContactTime.split(':').map(Number);
    optimalTime.setHours(hours || 10, minutes || 0, 0, 0);
  } else {
    optimalTime.setHours(10, 0, 0, 0); // 10 AM default
  }

  // Don't schedule in the past
  const now = new Date();
  if (optimalTime < now) {
    optimalTime.setDate(now.getDate() + 1);
    optimalTime.setHours(10, 0, 0, 0);
  }

  return optimalTime;
}

/**
 * Generate review request message
 */
function generateReviewRequestMessage(
  patientFirstName: string,
  practiceName: string,
  platform: string,
  reviewUrl: string,
  channel: 'email' | 'sms',
): { subject?: string; body: string } {
  const platformNames: Record<string, string> = {
    GOOGLE: 'Google',
    YELP: 'Yelp',
    FACEBOOK: 'Facebook',
    HEALTHGRADES: 'Healthgrades',
    ZOCDOC: 'ZocDoc',
    OTHER: 'online',
  };
  const platformName = platformNames[platform] || platform;

  if (channel === 'sms') {
    return {
      body: `Hi ${patientFirstName}! Thank you for choosing ${practiceName}. We'd love to hear about your experience! Please leave us a review: ${reviewUrl} - ${practiceName} Team`,
    };
  }

  return {
    subject: `How was your visit to ${practiceName}?`,
    body: `Hi ${patientFirstName},

Thank you for your recent visit to ${practiceName}! We hope you're feeling great.

Your feedback helps us improve and helps others find quality chiropractic care. Would you take a moment to share your experience on ${platformName}?

Leave a Review: ${reviewUrl}

It only takes a minute, and we truly appreciate it!

Thank you for being part of the ${practiceName} family.

Best regards,
The ${practiceName} Team

P.S. If you have any concerns about your care, please reach out to us directly. We want to make things right!`,
  };
}

/**
 * Generate response suggestion for a review
 */
function generateReviewResponseSuggestions(
  rating: number,
  reviewContent: string,
  reviewerName: string | null,
  practiceName: string,
  tone: 'professional' | 'empathetic' | 'apologetic' | 'grateful',
): ReviewResponseSuggestion {
  const name = reviewerName || 'there';
  const isPositive = rating >= 4;
  const isNeutral = rating === 3;
  const isNegative = rating <= 2;

  // Analyze review content for key themes
  const contentLower = reviewContent.toLowerCase();
  const themes = {
    waitTime: contentLower.includes('wait') || contentLower.includes('waiting'),
    staff: contentLower.includes('staff') || contentLower.includes('team') || contentLower.includes('reception'),
    treatment: contentLower.includes('treatment') || contentLower.includes('adjustment') || contentLower.includes('care'),
    communication: contentLower.includes('explain') || contentLower.includes('communicate') || contentLower.includes('listen'),
    billing: contentLower.includes('billing') || contentLower.includes('cost') || contentLower.includes('insurance'),
    results: contentLower.includes('feel better') || contentLower.includes('pain') || contentLower.includes('relief'),
  };

  const keyPoints: string[] = [];
  const avoidTopics: string[] = ['specific medical details', 'other patients', 'HIPAA-protected information'];

  let response = '';

  if (isPositive) {
    keyPoints.push('Express gratitude', 'Acknowledge specific praise', 'Reinforce positive experience');

    if (tone === 'grateful') {
      response = `Dear ${name},\n\nThank you so much for your wonderful review! We're thrilled to hear about your positive experience at ${practiceName}.\n\n`;
      if (themes.results) response += `It's incredibly rewarding to know that you're feeling better. Your health and well-being are our top priorities.\n\n`;
      if (themes.staff) response += `We'll be sure to share your kind words with our team - they'll be delighted!\n\n`;
      response += `We look forward to continuing to support your health journey. Thank you for choosing ${practiceName}!\n\nWarm regards,\nThe ${practiceName} Team`;
    } else {
      response = `Hello ${name},\n\nThank you for taking the time to share your feedback. We're pleased that you had a positive experience at ${practiceName}.\n\n`;
      response += `Your satisfaction is important to us, and we're committed to maintaining the high standard of care you experienced.\n\n`;
      response += `We look forward to your next visit!\n\nBest regards,\nThe ${practiceName} Team`;
    }
  } else if (isNeutral) {
    keyPoints.push('Thank for feedback', 'Acknowledge both positive and concerns', 'Invite further discussion');
    avoidTopics.push('dismissing concerns');

    response = `Hello ${name},\n\nThank you for your honest feedback. We appreciate you taking the time to share your experience.\n\n`;
    response += `We're always looking for ways to improve, and your input helps us do that. `;
    if (themes.waitTime) response += `We understand that wait times can be frustrating, and we're working to improve our scheduling efficiency. `;
    response += `\n\nWe'd love the opportunity to discuss your experience further. Please don't hesitate to reach out to us directly.\n\n`;
    response += `Thank you for choosing ${practiceName}.\n\nSincerely,\nThe ${practiceName} Team`;
  } else { // Negative
    keyPoints.push('Apologize sincerely', 'Take responsibility', 'Offer to make it right', 'Move conversation offline');
    avoidTopics.push('being defensive', 'making excuses', 'blaming the patient');

    if (tone === 'apologetic') {
      response = `Dear ${name},\n\nWe sincerely apologize that your experience at ${practiceName} did not meet your expectations. This is not the standard of care we strive to provide.\n\n`;
    } else {
      response = `Hello ${name},\n\nThank you for bringing this to our attention. We're sorry to hear that your experience was not what you hoped for.\n\n`;
    }

    response += `Your feedback is valuable and helps us improve. We take all concerns seriously and would like the opportunity to address this directly.\n\n`;
    response += `Please contact our office at your earliest convenience so we can discuss how to make this right. Your satisfaction matters to us.\n\n`;
    response += `Sincerely,\nThe ${practiceName} Team`;
  }

  return {
    tone,
    response,
    keyPoints,
    avoidTopics,
  };
}

/**
 * Calculate overall reputation score
 */
function calculateReputationScore(
  platformMetrics: Array<{
    platform: string;
    averageRating: number;
    totalReviews: number;
    responseRate: number | null;
    sentimentScore: number | null;
  }>,
): ReputationScore {
  if (platformMetrics.length === 0) {
    return {
      overallScore: 0,
      platformScores: {},
      trend: 'stable',
      riskLevel: 'high',
      keyStrengths: [],
      areasForImprovement: ['No reputation data available'],
      recommendedActions: ['Set up profiles on Google and Yelp', 'Start requesting reviews from satisfied patients'],
    };
  }

  const platformScores: Record<string, number> = {};
  let totalWeightedScore = 0;
  let totalWeight = 0;

  // Platform weights (Google is most important)
  const weights: Record<string, number> = {
    google: 0.4,
    yelp: 0.25,
    facebook: 0.2,
    healthgrades: 0.15,
  };

  for (const metric of platformMetrics) {
    const platformKey = metric.platform.toLowerCase();
    const weight = weights[platformKey] || 0.1;

    // Calculate platform score (0-100)
    let platformScore = (metric.averageRating / 5) * 60; // Rating: 60%
    platformScore += Math.min(20, Math.log10(metric.totalReviews + 1) * 10); // Volume: 20%
    platformScore += (metric.responseRate || 0) * 10; // Response rate: 10%
    platformScore += ((metric.sentimentScore || 0) + 1) / 2 * 10; // Sentiment: 10%

    platformScores[platformKey] = Math.round(platformScore);
    totalWeightedScore += platformScore * weight;
    totalWeight += weight;
  }

  const overallScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (overallScore < 50) riskLevel = 'high';
  else if (overallScore < 70) riskLevel = 'medium';

  // Identify strengths and areas for improvement
  const keyStrengths: string[] = [];
  const areasForImprovement: string[] = [];
  const recommendedActions: string[] = [];

  for (const metric of platformMetrics) {
    if (metric.averageRating >= 4.5) {
      keyStrengths.push(`Excellent ${metric.platform} rating (${metric.averageRating.toFixed(1)} stars)`);
    } else if (metric.averageRating < 4) {
      areasForImprovement.push(`${metric.platform} rating could improve (${metric.averageRating.toFixed(1)} stars)`);
      recommendedActions.push(`Focus on improving ${metric.platform} rating through better patient experiences`);
    }

    if (metric.totalReviews < 20) {
      recommendedActions.push(`Increase review volume on ${metric.platform}`);
    }

    if ((metric.responseRate || 0) < 0.5) {
      areasForImprovement.push(`Low response rate on ${metric.platform}`);
      recommendedActions.push(`Respond to more reviews on ${metric.platform}`);
    }
  }

  if (keyStrengths.length === 0 && overallScore >= 70) {
    keyStrengths.push('Consistent positive presence across platforms');
  }

  return {
    overallScore,
    platformScores,
    trend: 'stable', // Would need historical data to calculate
    riskLevel,
    keyStrengths,
    areasForImprovement,
    recommendedActions: recommendedActions.slice(0, 5), // Top 5 actions
  };
}

/**
 * Get platform-specific response guidelines
 */
function getPlatformGuidelines(platform: string): string[] {
  const guidelines: Record<string, string[]> = {
    google: [
      'Respond within 24-48 hours',
      'Keep responses professional and helpful',
      'Thank reviewers for their feedback',
      'Address concerns without being defensive',
      'Avoid disclosing personal health information',
    ],
    yelp: [
      'Yelp allows public and private responses',
      'Consider reaching out privately for negative reviews',
      'Focus on the specific experience mentioned',
      'Invite them back to resolve issues',
    ],
    facebook: [
      'Responses are highly visible to friends and followers',
      'Keep it brief and friendly',
      'Use the reviewer\'s name for personalization',
      'Consider private messaging for sensitive issues',
    ],
    healthgrades: [
      'Medical professionals often respond on this platform',
      'Maintain HIPAA compliance at all times',
      'Focus on practice policies rather than individual cases',
      'Emphasize quality of care and patient safety',
    ],
  };

  return guidelines[platform.toLowerCase()] || [
    'Respond promptly and professionally',
    'Thank the reviewer for their feedback',
    'Address any concerns raised',
    'Maintain patient confidentiality',
  ];
}

// ============================================
// US-359: Referral Optimization Helper Functions
// ============================================

/**
 * Calculate NPS score from patient behavior if no survey data available
 */
function calculateBehavioralNpsScore(
  visitCount: number,
  consecutiveVisits: number,
  hasLeftReview: boolean,
  reviewRating: number | null,
  previousReferrals: number,
  appointmentCompletionRate: number,
  treatmentSuccess: boolean | null,
): number {
  let score = 5; // Start neutral

  // Visit frequency (up to +2)
  if (visitCount >= 10) score += 2;
  else if (visitCount >= 5) score += 1.5;
  else if (visitCount >= 3) score += 1;

  // Consecutive visits without missing (up to +1)
  if (consecutiveVisits >= 5) score += 1;
  else if (consecutiveVisits >= 3) score += 0.5;

  // Review behavior (up to +2/-2)
  if (hasLeftReview) {
    if (reviewRating !== null) {
      if (reviewRating >= 5) score += 2;
      else if (reviewRating >= 4) score += 1;
      else if (reviewRating <= 2) score -= 2;
      else if (reviewRating <= 3) score -= 1;
    } else {
      score += 0.5; // Left review, unknown rating
    }
  }

  // Previous referrals (strong indicator, up to +2)
  if (previousReferrals >= 3) score += 2;
  else if (previousReferrals >= 1) score += 1;

  // Appointment completion rate (up to +1/-1)
  if (appointmentCompletionRate >= 0.95) score += 1;
  else if (appointmentCompletionRate < 0.7) score -= 1;

  // Treatment success (up to +1/-1)
  if (treatmentSuccess === true) score += 1;
  else if (treatmentSuccess === false) score -= 1;

  return Math.max(0, Math.min(10, Math.round(score)));
}

/**
 * Calculate referral score (0-100) based on various factors
 */
function calculateReferralScore(
  npsScore: number,
  visitCount: number,
  previousReferrals: number,
  hasLeftReview: boolean,
  reviewRating: number | null,
  treatmentSuccess: boolean | null,
  tenure: number, // months as patient
): { score: number; factors: Record<string, number> } {
  const factors: Record<string, number> = {
    visit_frequency: 0,
    positive_reviews: 0,
    tenure: 0,
    treatment_success: 0,
    engagement: 0,
  };

  // Visit frequency (up to 25 points)
  if (visitCount >= 10) factors.visit_frequency = 25;
  else if (visitCount >= 5) factors.visit_frequency = 20;
  else if (visitCount >= 3) factors.visit_frequency = 15;
  else if (visitCount >= 2) factors.visit_frequency = 10;
  else factors.visit_frequency = 5;

  // Review behavior (up to 30 points)
  if (hasLeftReview && reviewRating !== null && reviewRating >= 4) {
    factors.positive_reviews = reviewRating >= 5 ? 30 : 20;
  } else if (hasLeftReview) {
    factors.positive_reviews = 10;
  }

  // Tenure (up to 20 points)
  if (tenure >= 24) factors.tenure = 20;
  else if (tenure >= 12) factors.tenure = 15;
  else if (tenure >= 6) factors.tenure = 10;
  else if (tenure >= 3) factors.tenure = 5;

  // Treatment success (up to 15 points)
  if (treatmentSuccess === true) factors.treatment_success = 15;
  else if (treatmentSuccess === null) factors.treatment_success = 7;

  // Previous referral engagement (up to 10 points)
  if (previousReferrals >= 3) factors.engagement = 10;
  else if (previousReferrals >= 1) factors.engagement = 7;
  else if (npsScore >= 9) factors.engagement = 5; // High NPS but no referrals yet

  const score = Object.values(factors).reduce((sum, val) => sum + val, 0);
  return { score: Math.min(100, score), factors };
}

/**
 * Calculate optimal outreach date for referral request
 */
function calculateOptimalReferralOutreachDate(
  lastVisitDate: Date | null,
  previousOutreachDate: Date | null,
): Date {
  const now = new Date();
  let optimalDate = new Date(now);

  if (lastVisitDate) {
    // Best to reach out 1-3 days after a positive visit
    const daysSinceVisit = Math.floor((now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceVisit < 1) {
      optimalDate.setDate(optimalDate.getDate() + 1);
    } else if (daysSinceVisit <= 3) {
      // Good timing, can reach out now
    } else {
      // If it's been a while, wait for next visit or schedule soon
      optimalDate.setDate(optimalDate.getDate() + 1);
    }
  }

  // Don't reach out too soon after previous outreach (min 14 days)
  if (previousOutreachDate) {
    const daysSinceOutreach = Math.floor((now.getTime() - previousOutreachDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceOutreach < 14) {
      optimalDate = new Date(previousOutreachDate);
      optimalDate.setDate(optimalDate.getDate() + 14);
    }
  }

  // Set to 10 AM for email, optimal engagement time
  optimalDate.setHours(10, 0, 0, 0);

  // Don't schedule in the past
  if (optimalDate < now) {
    optimalDate = new Date(now);
    optimalDate.setDate(optimalDate.getDate() + 1);
    optimalDate.setHours(10, 0, 0, 0);
  }

  return optimalDate;
}

/**
 * Generate referral program promotion message
 */
function generateReferralProgramMessage(
  patientFirstName: string,
  practiceName: string,
  referralCode: string,
  referrerReward: string,
  refereeReward: string | null,
  channel: 'email' | 'sms',
): { subject?: string; body: string } {
  if (channel === 'sms') {
    return {
      body: `Hi ${patientFirstName}! Love your care at ${practiceName}? Share it! Give friends ${refereeReward || 'great care'} with your code: ${referralCode}. You'll get ${referrerReward}! Reply STOP to opt out.`,
    };
  }

  return {
    subject: `Share the Gift of Great Care - ${practiceName} Referral Program`,
    body: `Hi ${patientFirstName},

We hope you're feeling great! As one of our valued patients, we'd like to invite you to our referral program.

When you refer a friend or family member to ${practiceName}:
✓ YOU receive: ${referrerReward}
${refereeReward ? `✓ THEY receive: ${refereeReward}` : ''}

It's easy to share:
1. Share your personal referral code: ${referralCode}
2. Your friend mentions your code when booking
3. After their first completed visit, rewards are issued!

There's no limit to how many people you can refer. Help your friends and family get the care they deserve!

Your Referral Code: ${referralCode}

Thank you for being part of the ${practiceName} family!

Best regards,
The ${practiceName} Team

P.S. Questions? Just reply to this email - we're here to help!`,
  };
}

/**
 * Generate thank you message for referrer
 */
function generateReferralThankYouMessage(
  patientFirstName: string,
  practiceName: string,
  refereeName: string,
  rewardInfo: { rewardType: string; rewardValue: number; rewardNote: string | null } | null,
  channel: 'email' | 'sms',
): { subject?: string; body: string } {
  const rewardText = rewardInfo
    ? `As a thank you, you've earned ${rewardInfo.rewardNote || `$${rewardInfo.rewardValue} in ${rewardInfo.rewardType.toLowerCase()}`}!`
    : 'We truly appreciate you spreading the word!';

  if (channel === 'sms') {
    return {
      body: `Thank you, ${patientFirstName}! ${refereeName} is now part of the ${practiceName} family because of you. ${rewardText} - ${practiceName} Team`,
    };
  }

  return {
    subject: `Thank You for Your Referral! - ${practiceName}`,
    body: `Dear ${patientFirstName},

We wanted to personally thank you for referring ${refereeName} to ${practiceName}. They've completed their first visit, and we're so grateful you shared your positive experience with them!

${rewardText}

${rewardInfo ? `Your reward will be applied to your next visit automatically. Just check in as usual!` : ''}

Referrals from patients like you are the highest compliment we can receive. Your trust in us means everything.

Thank you for being an amazing part of our practice family!

Warm regards,
The ${practiceName} Team`,
  };
}

/**
 * Determine relationship strength based on referral history
 */
function calculateRelationshipStrength(
  referralsReceived: number,
  referralsSent: number,
  lastReferralDate: Date | null,
  lastContactDate: Date | null,
): 'strong' | 'moderate' | 'developing' | 'new' {
  const totalReferrals = referralsReceived + referralsSent;
  const now = new Date();
  const daysSinceLastReferral = lastReferralDate
    ? Math.floor((now.getTime() - lastReferralDate.getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const daysSinceLastContact = lastContactDate
    ? Math.floor((now.getTime() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  if (totalReferrals >= 10 && daysSinceLastReferral <= 90) return 'strong';
  if (totalReferrals >= 5 || (totalReferrals >= 2 && daysSinceLastReferral <= 60)) return 'moderate';
  if (totalReferrals >= 1 || daysSinceLastContact <= 30) return 'developing';
  return 'new';
}

/**
 * Generate nurturing action for provider relationship
 */
function generateProviderNurturingActions(
  relationshipStrength: 'strong' | 'moderate' | 'developing' | 'new',
  daysSinceLastContact: number,
  daysSinceLastReferral: number,
): string[] {
  const actions: string[] = [];

  if (relationshipStrength === 'new') {
    actions.push('Send introductory letter with practice overview');
    actions.push('Share patient success stories (with consent)');
    actions.push('Offer to meet for coffee or lunch');
  } else if (relationshipStrength === 'developing') {
    actions.push('Send quarterly update on shared patients');
    actions.push('Invite to practice open house or event');
    actions.push('Share relevant case studies');
  } else if (relationshipStrength === 'moderate') {
    actions.push('Schedule periodic check-in call');
    actions.push('Send thank you notes for referrals');
    actions.push('Share patient outcome reports');
  } else if (relationshipStrength === 'strong') {
    actions.push('Maintain regular communication');
    actions.push('Consider co-marketing opportunities');
    actions.push('Invite to CE events or seminars');
  }

  // Time-based actions
  if (daysSinceLastContact > 60) {
    actions.push('Schedule follow-up communication (over 60 days since contact)');
  }
  if (daysSinceLastReferral > 90 && relationshipStrength !== 'new') {
    actions.push('Reach out to maintain relationship (90+ days since last referral)');
  }

  return actions;
}

// ============================================
// US-360: Patient Reactivation Helper Functions
// ============================================

/**
 * Analyze lapse reason based on patient history and behavior
 */
function analyzeLapseReason(
  daysSinceLastVisit: number,
  appointmentHistory: Array<{ status: string; cancelReason?: string | null }>,
  treatmentPlanStatus: string | null,
  insuranceStatus: string | null,
  hasAddressChanged: boolean,
  lastVisitNotes: string | null,
): {
  likelyReason: LapseReason;
  confidence: number;
  factors: Array<{ factor: string; weight: number; evidence: string }>;
} {
  const factors: Array<{ factor: string; weight: number; evidence: string }> = [];
  const reasonScores: Record<LapseReason, number> = {
    no_perceived_need: 0,
    financial: 0,
    scheduling: 0,
    moved_away: 0,
    dissatisfied: 0,
    switched_provider: 0,
    insurance_change: 0,
    health_improved: 0,
    forgot: 0,
    life_event: 0,
    unknown: 10, // Base score for unknown
  };

  // Check for address change (moved away)
  if (hasAddressChanged) {
    reasonScores.moved_away += 40;
    factors.push({ factor: 'address_changed', weight: 40, evidence: 'Patient address has changed' });
  }

  // Check for insurance changes
  if (insuranceStatus === 'expired' || insuranceStatus === 'changed') {
    reasonScores.insurance_change += 35;
    factors.push({ factor: 'insurance_status', weight: 35, evidence: `Insurance status: ${insuranceStatus}` });
  }

  // Check cancellation history for financial reasons
  const financialCancellations = appointmentHistory.filter(
    (a) => a.status === 'CANCELLED' && a.cancelReason?.toLowerCase().includes('financial')
  ).length;
  if (financialCancellations > 0) {
    reasonScores.financial += financialCancellations * 20;
    factors.push({
      factor: 'financial_cancellations',
      weight: financialCancellations * 20,
      evidence: `${financialCancellations} cancellation(s) citing financial reasons`,
    });
  }

  // Check for scheduling-related cancellations
  const schedulingCancellations = appointmentHistory.filter(
    (a) =>
      a.status === 'CANCELLED' &&
      (a.cancelReason?.toLowerCase().includes('schedule') ||
        a.cancelReason?.toLowerCase().includes('time') ||
        a.cancelReason?.toLowerCase().includes('busy'))
  ).length;
  if (schedulingCancellations > 1) {
    reasonScores.scheduling += schedulingCancellations * 15;
    factors.push({
      factor: 'scheduling_issues',
      weight: schedulingCancellations * 15,
      evidence: `${schedulingCancellations} scheduling-related cancellations`,
    });
  }

  // Check for completed treatment plan (health improved)
  if (treatmentPlanStatus === 'completed') {
    reasonScores.health_improved += 30;
    reasonScores.no_perceived_need += 20;
    factors.push({
      factor: 'treatment_complete',
      weight: 30,
      evidence: 'Treatment plan was completed',
    });
  }

  // Check no-show pattern (forgot or life event)
  const noShows = appointmentHistory.filter((a) => a.status === 'NO_SHOW').length;
  if (noShows > 1) {
    reasonScores.forgot += noShows * 10;
    reasonScores.life_event += noShows * 8;
    factors.push({
      factor: 'no_show_pattern',
      weight: noShows * 10,
      evidence: `${noShows} no-show appointment(s)`,
    });
  }

  // Check for time-based patterns
  if (daysSinceLastVisit > 365) {
    reasonScores.forgot += 15;
    reasonScores.switched_provider += 10;
    factors.push({
      factor: 'long_absence',
      weight: 15,
      evidence: `Over 1 year since last visit (${daysSinceLastVisit} days)`,
    });
  } else if (daysSinceLastVisit > 180) {
    reasonScores.forgot += 10;
    factors.push({
      factor: 'moderate_absence',
      weight: 10,
      evidence: `Over 6 months since last visit (${daysSinceLastVisit} days)`,
    });
  }

  // Check last visit notes for clues
  if (lastVisitNotes) {
    const notesLower = lastVisitNotes.toLowerCase();
    if (notesLower.includes('moving') || notesLower.includes('relocat')) {
      reasonScores.moved_away += 25;
      factors.push({ factor: 'notes_moving', weight: 25, evidence: 'Notes mention moving/relocation' });
    }
    if (notesLower.includes('complaint') || notesLower.includes('unhappy') || notesLower.includes('dissatisfied')) {
      reasonScores.dissatisfied += 30;
      factors.push({ factor: 'notes_complaint', weight: 30, evidence: 'Notes indicate patient dissatisfaction' });
    }
    if (notesLower.includes('feeling better') || notesLower.includes('resolved') || notesLower.includes('improved')) {
      reasonScores.health_improved += 25;
      factors.push({ factor: 'notes_improved', weight: 25, evidence: 'Notes indicate health improvement' });
    }
  }

  // Find the most likely reason
  const sortedReasons = Object.entries(reasonScores)
    .sort(([, a], [, b]) => b - a)
    .filter(([, score]) => score > 0);

  const topReason = sortedReasons[0];
  const totalScore = sortedReasons.reduce((sum, [, score]) => sum + score, 0);

  return {
    likelyReason: (topReason?.[0] as LapseReason) || 'unknown',
    confidence: totalScore > 0 ? Math.min(topReason[1] / totalScore, 0.95) : 0.1,
    factors: factors.sort((a, b) => b.weight - a.weight),
  };
}

/**
 * Calculate reactivation score based on patient value and likelihood
 */
function calculateReactivationScore(
  lifetimeValue: number,
  daysSinceLastVisit: number,
  totalVisits: number,
  lapseReason: LapseReason,
  engagementHistory: { emailOpens: number; linkClicks: number; websiteVisits: number },
): number {
  let score = 50; // Base score

  // Lifetime value factor (0-25 points)
  if (lifetimeValue >= 5000) score += 25;
  else if (lifetimeValue >= 2000) score += 20;
  else if (lifetimeValue >= 1000) score += 15;
  else if (lifetimeValue >= 500) score += 10;
  else if (lifetimeValue >= 100) score += 5;

  // Visit frequency factor (0-15 points)
  if (totalVisits >= 20) score += 15;
  else if (totalVisits >= 10) score += 10;
  else if (totalVisits >= 5) score += 5;

  // Recency penalty (-10 to 0 points)
  if (daysSinceLastVisit > 730) score -= 10; // Over 2 years
  else if (daysSinceLastVisit > 365) score -= 5; // Over 1 year

  // Lapse reason factor (-10 to +5 points)
  const reasonModifiers: Record<LapseReason, number> = {
    forgot: 5, // Easy to reactivate
    no_perceived_need: 0,
    health_improved: 0,
    scheduling: 0,
    life_event: -2,
    financial: -5, // May need incentive
    insurance_change: -5,
    dissatisfied: -8, // Harder to win back
    switched_provider: -10, // Very hard
    moved_away: -10, // Not possible
    unknown: 0,
  };
  score += reasonModifiers[lapseReason] || 0;

  // Engagement factor (0-10 points)
  if (engagementHistory.emailOpens > 0) score += 3;
  if (engagementHistory.linkClicks > 0) score += 4;
  if (engagementHistory.websiteVisits > 0) score += 3;

  return Math.max(0, Math.min(100, score));
}

/**
 * Determine the best reactivation approach based on lapse reason
 */
function determineReactivationApproach(
  lapseReason: LapseReason,
  daysSinceLastVisit: number,
  lifetimeValue: number,
): 'special_offer' | 'wellness_check' | 'personal_outreach' | 'reminder' | 'win_back' {
  // High-value patients get personal outreach
  if (lifetimeValue >= 2000) {
    return 'personal_outreach';
  }

  // Based on lapse reason
  switch (lapseReason) {
    case 'forgot':
    case 'life_event':
      return daysSinceLastVisit < 180 ? 'reminder' : 'wellness_check';
    case 'financial':
      return 'special_offer';
    case 'no_perceived_need':
    case 'health_improved':
      return 'wellness_check';
    case 'dissatisfied':
    case 'switched_provider':
      return 'win_back';
    case 'scheduling':
      return 'reminder';
    case 'insurance_change':
      return 'special_offer';
    default:
      return daysSinceLastVisit > 365 ? 'win_back' : 'reminder';
  }
}

/**
 * Generate personalized reactivation message
 */
function generateReactivationMessage(
  patientFirstName: string,
  practiceName: string,
  approach: 'special_offer' | 'wellness_check' | 'personal_outreach' | 'reminder' | 'win_back',
  channel: 'email' | 'sms',
  offer: { type: string; value: string; code: string; expiresAt: Date } | null,
  daysSinceLastVisit: number,
): { subject?: string; body: string } {
  const monthsSinceVisit = Math.floor(daysSinceLastVisit / 30);

  if (channel === 'sms') {
    switch (approach) {
      case 'special_offer':
        return {
          body: `Hi ${patientFirstName}! We miss you at ${practiceName}! Here's a special offer just for you: ${offer?.value || '20% off'} your next visit. Use code: ${offer?.code || 'WELCOME'}. Book now: [link] - ${practiceName}`,
        };
      case 'wellness_check':
        return {
          body: `Hi ${patientFirstName}! It's been a while since your last visit to ${practiceName}. Time for a wellness check-up? We'd love to see how you're doing. Schedule here: [link]`,
        };
      case 'reminder':
        return {
          body: `Hi ${patientFirstName}! Just a friendly reminder from ${practiceName} - it's been ${monthsSinceVisit} months since your last visit. Ready to schedule? [link]`,
        };
      case 'win_back':
        return {
          body: `Hi ${patientFirstName}! We'd love another chance to serve you at ${practiceName}. ${offer ? `Special offer: ${offer.value}. ` : ''}Let us know how we can help: [link]`,
        };
      default:
        return {
          body: `Hi ${patientFirstName}! The team at ${practiceName} would love to see you again. Schedule your visit: [link]`,
        };
    }
  }

  // Email messages
  switch (approach) {
    case 'special_offer':
      return {
        subject: `${patientFirstName}, a Special Offer Just for You!`,
        body: `Dear ${patientFirstName},

We've missed seeing you at ${practiceName}! It's been ${monthsSinceVisit} months since your last visit, and we wanted to reach out with a special offer.

${offer ? `As a valued patient, enjoy ${offer.value} on your next visit. Use code: ${offer.code} (valid until ${offer.expiresAt.toLocaleDateString()})` : 'As a valued patient, we\'d like to offer you 20% off your next visit.'}

Your health is our priority, and we'd love to help you stay on track with your wellness goals.

Click here to schedule: [Schedule Now]

We look forward to seeing you soon!

Warm regards,
The ${practiceName} Team`,
      };

    case 'wellness_check':
      return {
        subject: `${patientFirstName}, Time for Your Wellness Check-Up?`,
        body: `Dear ${patientFirstName},

We hope this message finds you well! It's been ${monthsSinceVisit} months since your last visit to ${practiceName}, and we wanted to check in.

Regular wellness check-ups help ensure your spine and nervous system are functioning at their best. Even if you're feeling great, preventive care can help you stay that way!

Would you like to schedule a wellness evaluation? We'd love to see how you're doing and discuss any health goals you may have.

Click here to schedule: [Schedule Now]

Take care,
The ${practiceName} Team`,
      };

    case 'personal_outreach':
      return {
        subject: `${patientFirstName}, We've Been Thinking of You`,
        body: `Dear ${patientFirstName},

I wanted to personally reach out because we've truly missed seeing you at ${practiceName}. You've been such a valued member of our patient family, and it's been ${monthsSinceVisit} months since your last visit.

I understand that life gets busy, and circumstances change. If there's anything we can do to better serve you, or if you have any questions about your care, please don't hesitate to reach out directly.

We're here for you whenever you're ready to come back.

${offer ? `P.S. We'd like to offer you ${offer.value} on your next visit. Just mention code ${offer.code} when you book.` : ''}

Warmly,
The ${practiceName} Team`,
      };

    case 'reminder':
      return {
        subject: `${patientFirstName}, It's Been a While!`,
        body: `Hi ${patientFirstName},

Just a friendly reminder from your friends at ${practiceName} - it's been ${monthsSinceVisit} months since your last visit!

Maintaining regular chiropractic care helps keep your body functioning at its best. Ready to get back on schedule?

Click here to schedule: [Schedule Now]

See you soon!
The ${practiceName} Team`,
      };

    case 'win_back':
      return {
        subject: `${patientFirstName}, We'd Love Another Chance`,
        body: `Dear ${patientFirstName},

It's been ${monthsSinceVisit} months since we last saw you at ${practiceName}, and we wanted to reach out personally.

We truly value every patient who walks through our doors, and if your last experience wasn't everything you hoped for, we'd love the opportunity to make it right.

${offer ? `As a gesture of goodwill, we'd like to offer you ${offer.value}. Use code: ${offer.code}` : 'We\'d like to offer you a complimentary consultation to discuss your health goals.'}

Your health matters to us, and we're committed to providing you with the best possible care.

Would you give us another chance? Click here to schedule: [Schedule Now]

Sincerely,
The ${practiceName} Team`,
      };

    default:
      return {
        subject: `${patientFirstName}, We Miss You at ${practiceName}!`,
        body: `Hi ${patientFirstName},

We noticed it's been a while since your last visit to ${practiceName}. We'd love to see you again!

Click here to schedule: [Schedule Now]

Best,
The ${practiceName} Team`,
      };
  }
}

/**
 * Calculate optimal timing for reactivation outreach
 */
function calculateOptimalReactivationTiming(
  dayOfWeekEngagement: Record<string, number>,
  timeOfDayEngagement: Record<string, number>,
  lapseReason: LapseReason,
): {
  bestDayOfWeek: string;
  bestTimeOfDay: string;
  nextOptimalDate: Date;
  reasoning: string;
} {
  // Default engagement patterns if no data
  const defaultDayEngagement: Record<string, number> = {
    Monday: 15,
    Tuesday: 20,
    Wednesday: 18,
    Thursday: 17,
    Friday: 12,
    Saturday: 10,
    Sunday: 8,
  };

  const defaultTimeEngagement: Record<string, number> = {
    morning: 25, // 8am-12pm
    afternoon: 20, // 12pm-5pm
    evening: 15, // 5pm-8pm
  };

  const dayEngagement =
    Object.keys(dayOfWeekEngagement).length > 0 ? dayOfWeekEngagement : defaultDayEngagement;
  const timeEngagement =
    Object.keys(timeOfDayEngagement).length > 0 ? timeOfDayEngagement : defaultTimeEngagement;

  // Find best day
  const bestDay = Object.entries(dayEngagement).sort(([, a], [, b]) => b - a)[0][0];

  // Find best time
  const bestTime = Object.entries(timeEngagement).sort(([, a], [, b]) => b - a)[0][0];

  // Calculate next optimal date
  const now = new Date();
  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const targetDayNum = dayMap[bestDay] ?? 2; // Default to Tuesday
  const currentDayNum = now.getDay();
  let daysUntilTarget = targetDayNum - currentDayNum;
  if (daysUntilTarget <= 0) daysUntilTarget += 7;

  const nextOptimalDate = new Date(now);
  nextOptimalDate.setDate(now.getDate() + daysUntilTarget);

  // Set time based on best time period
  if (bestTime === 'morning') {
    nextOptimalDate.setHours(10, 0, 0, 0);
  } else if (bestTime === 'afternoon') {
    nextOptimalDate.setHours(14, 0, 0, 0);
  } else {
    nextOptimalDate.setHours(18, 0, 0, 0);
  }

  // Adjust based on lapse reason
  let reasoning = `Based on engagement patterns, ${bestDay} ${bestTime} shows the highest open/response rates.`;

  if (lapseReason === 'scheduling') {
    reasoning += ' For scheduling-related lapses, evening times may work better for busy patients.';
  } else if (lapseReason === 'financial') {
    reasoning +=
      ' For financial concerns, early-month timing (after paychecks) may improve response rates.';
  }

  return {
    bestDayOfWeek: bestDay,
    bestTimeOfDay: bestTime,
    nextOptimalDate,
    reasoning,
  };
}

/**
 * Get predefined reactivation offers based on lapse reason and patient value
 */
function getReactivationOffers(
  lapseReason: LapseReason,
  lifetimeValue: number,
  daysSinceLastVisit: number,
): ReactivationOffer[] {
  const offers: ReactivationOffer[] = [];
  const now = new Date();

  // Base offers available to all
  offers.push({
    offerId: 'COMEBACK-20',
    name: 'Welcome Back Discount',
    type: 'percentage_discount',
    value: '20% off',
    description: '20% off your next visit',
    validDays: 30,
    targetReason: ['forgot', 'no_perceived_need', 'scheduling', 'life_event', 'unknown'],
    minDaysLapsed: 90,
    maxDaysLapsed: null,
    isActive: true,
  });

  // Financial-focused offers
  if (lapseReason === 'financial' || lifetimeValue < 500) {
    offers.push({
      offerId: 'BUDGET-FRIENDLY',
      name: 'Budget-Friendly Package',
      type: 'package_deal',
      value: '3 visits for the price of 2',
      description: 'Save on a 3-visit package',
      validDays: 45,
      targetReason: ['financial', 'insurance_change'],
      minDaysLapsed: 60,
      maxDaysLapsed: null,
      isActive: true,
    });
  }

  // High-value patient offers
  if (lifetimeValue >= 2000) {
    offers.push({
      offerId: 'VIP-RETURN',
      name: 'VIP Patient Return',
      type: 'complimentary_exam',
      value: 'Complimentary wellness exam',
      description: 'Free comprehensive wellness evaluation',
      validDays: 60,
      targetReason: ['no_perceived_need', 'health_improved', 'forgot', 'life_event'],
      minDaysLapsed: 180,
      maxDaysLapsed: null,
      isActive: true,
    });
  }

  // Win-back offers for dissatisfied patients
  if (lapseReason === 'dissatisfied' || lapseReason === 'switched_provider') {
    offers.push({
      offerId: 'SECOND-CHANCE',
      name: 'Second Chance Special',
      type: 'free_service',
      value: 'Free consultation + 50% off first adjustment',
      description: 'Let us show you the care you deserve',
      validDays: 45,
      targetReason: ['dissatisfied', 'switched_provider'],
      minDaysLapsed: 60,
      maxDaysLapsed: null,
      isActive: true,
    });
  }

  // Long-term lapsed offers
  if (daysSinceLastVisit > 365) {
    offers.push({
      offerId: 'REUNION',
      name: 'Patient Reunion Special',
      type: 'dollar_discount',
      value: '$50 off',
      description: '$50 off your return visit',
      validDays: 30,
      targetReason: ['forgot', 'no_perceived_need', 'life_event', 'unknown'],
      minDaysLapsed: 365,
      maxDaysLapsed: null,
      isActive: true,
    });
  }

  return offers;
}

// ============================================
// US-361: Marketing Campaign Automation Helper Functions
// ============================================

/**
 * Generate AI content strategy based on campaign type
 */
function generateContentStrategy(
  campaignType: string,
  messagingTone: string,
  channels: string[]
): {
  approach: string;
  themes: string[];
  contentTypes: string[];
  frequencyRecommendation: string;
  keyMessages: string[];
} {
  const strategies: Record<string, {
    approach: string;
    themes: string[];
    contentTypes: string[];
    frequencyRecommendation: string;
    keyMessages: string[];
  }> = {
    LEAD_GENERATION: {
      approach: 'Educational content with clear value proposition and calls-to-action',
      themes: ['Pain relief', 'Wellness benefits', 'Local expertise', 'Patient success stories'],
      contentTypes: ['Educational articles', 'Video testimonials', 'Free consultation offers', 'Health tips'],
      frequencyRecommendation: '2-3 touchpoints over 2 weeks',
      keyMessages: [
        'Expert chiropractic care in your neighborhood',
        'Start your journey to pain-free living',
        'New patient special: Free consultation',
      ],
    },
    REACTIVATION: {
      approach: 'Personal reconnection with incentives and wellness reminders',
      themes: ['We miss you', 'Health check-in', 'New services', 'Special welcome back offers'],
      contentTypes: ['Personal emails', 'Special offers', 'Wellness reminders', 'Service updates'],
      frequencyRecommendation: '3 touchpoints over 3 weeks with increasing urgency',
      keyMessages: [
        'We miss seeing you!',
        "It's been a while - time for a wellness check",
        'Special offer just for returning patients',
      ],
    },
    REFERRAL: {
      approach: 'Gratitude-based messaging emphasizing mutual benefits',
      themes: ['Thank you', 'Share the wellness', 'Rewards for referring', 'Community building'],
      contentTypes: ['Thank you messages', 'Referral program details', 'Success stories', 'Reward updates'],
      frequencyRecommendation: 'Post-visit touchpoint + quarterly reminders',
      keyMessages: [
        'Thank you for being a valued patient',
        'Share the gift of wellness with friends and family',
        'Earn rewards when you refer',
      ],
    },
    REVIEW: {
      approach: 'Appreciation-focused requests at optimal moments',
      themes: ['Your feedback matters', 'Help others discover us', 'Share your experience'],
      contentTypes: ['Review requests', 'Satisfaction surveys', 'Thank you messages'],
      frequencyRecommendation: '1-2 days post-positive experience',
      keyMessages: [
        'We hope you had a great experience',
        'Your review helps others find quality care',
        'Share your story',
      ],
    },
    RETENTION: {
      approach: 'Value reinforcement and proactive wellness engagement',
      themes: ['Ongoing wellness', 'Preventive care', 'Appointment reminders', 'Health tips'],
      contentTypes: ['Wellness tips', 'Appointment reminders', 'Educational content', 'Loyalty rewards'],
      frequencyRecommendation: 'Monthly touchpoints with appointment-based triggers',
      keyMessages: [
        'Stay on track with your wellness goals',
        'Preventive care keeps you feeling great',
        'Your next appointment is coming up',
      ],
    },
    UPSELL: {
      approach: 'Value-add recommendations based on patient history',
      themes: ['Complementary services', 'Enhanced care options', 'Package deals', 'New offerings'],
      contentTypes: ['Service recommendations', 'Package offers', 'Educational content on services'],
      frequencyRecommendation: 'Post-treatment recommendations + quarterly service highlights',
      keyMessages: [
        'Take your wellness to the next level',
        'Services that complement your care plan',
        'Save with our wellness packages',
      ],
    },
    SEASONAL: {
      approach: 'Timely messaging tied to seasonal health needs',
      themes: ['Seasonal health tips', 'Holiday wellness', 'Back-to-school', 'Sports season prep'],
      contentTypes: ['Seasonal tips', 'Holiday specials', 'Timely health advice'],
      frequencyRecommendation: 'Campaign duration: 2-4 weeks around seasonal event',
      keyMessages: [
        'Stay healthy this season',
        'Prepare your body for the season ahead',
        'Limited-time seasonal special',
      ],
    },
    EVENT: {
      approach: 'Event-focused urgency with clear value proposition',
      themes: ['Community event', 'Free screening', 'Workshop', 'Open house'],
      contentTypes: ['Event invitations', 'RSVP requests', 'Event reminders', 'Follow-up'],
      frequencyRecommendation: '3 touchpoints: Announcement, reminder, last chance',
      keyMessages: [
        "You're invited to our special event",
        'Limited spots available - RSVP today',
        "Don't miss out on this opportunity",
      ],
    },
  };

  const strategy = strategies[campaignType] || strategies.LEAD_GENERATION;

  // Adjust for messaging tone
  if (messagingTone === 'urgent') {
    strategy.keyMessages = strategy.keyMessages.map(
      (msg) => msg.replace(/!$/, ' - Act now!').replace(/today$/, 'today!')
    );
  } else if (messagingTone === 'empathetic') {
    strategy.approach = `Empathetic, understanding approach: ${strategy.approach}`;
  }

  return strategy;
}

/**
 * Estimate audience size based on targeting criteria
 */
async function estimateAudienceSize(
  prisma: any,
  organizationId: string,
  targetAudience: Record<string, unknown>
): Promise<number> {
  const where: any = {
    organizationId,
    isActive: true,
  };

  if (targetAudience.minVisits || targetAudience.maxVisits) {
    // Would need to join with appointments for accurate count
    // For now, estimate based on active patients
  }

  if (targetAudience.excludeActive) {
    // Exclude patients with recent appointments
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  }

  try {
    const count = await prisma.patient.count({ where });
    // Apply estimated reduction based on criteria
    let reductionFactor = 1;
    if (targetAudience.minAge || targetAudience.maxAge) reductionFactor *= 0.7;
    if (targetAudience.gender && targetAudience.gender !== 'all') reductionFactor *= 0.5;
    if (targetAudience.insuranceTypes) reductionFactor *= 0.6;
    if (targetAudience.diagnosisCodes) reductionFactor *= 0.4;
    if (targetAudience.engagementLevel && targetAudience.engagementLevel !== 'all') reductionFactor *= 0.5;

    return Math.max(1, Math.floor(count * reductionFactor));
  } catch {
    return 100; // Default estimate
  }
}

/**
 * Generate campaign sequences based on type and channels
 */
function generateCampaignSequences(
  campaignType: string,
  channels: string[],
  messagingTone: string
): Array<{
  stepNumber: number;
  delayDays: number;
  channel: string;
  contentType: string;
  subject?: string;
  previewText?: string;
}> {
  const sequences: Array<{
    stepNumber: number;
    delayDays: number;
    channel: string;
    contentType: string;
    subject?: string;
    previewText?: string;
  }> = [];

  const primaryChannel = channels[0] || 'email';
  const secondaryChannel = channels[1] || primaryChannel;

  switch (campaignType) {
    case 'LEAD_GENERATION':
      sequences.push(
        { stepNumber: 1, delayDays: 0, channel: primaryChannel, contentType: 'introduction', subject: 'Welcome to [Practice Name]' },
        { stepNumber: 2, delayDays: 3, channel: primaryChannel, contentType: 'educational', subject: 'How chiropractic care can help you' },
        { stepNumber: 3, delayDays: 7, channel: secondaryChannel, contentType: 'testimonial', subject: 'See what our patients say' },
        { stepNumber: 4, delayDays: 10, channel: primaryChannel, contentType: 'offer', subject: 'Special offer just for you' }
      );
      break;
    case 'REACTIVATION':
      sequences.push(
        { stepNumber: 1, delayDays: 0, channel: primaryChannel, contentType: 'reconnect', subject: 'We miss you!' },
        { stepNumber: 2, delayDays: 5, channel: secondaryChannel, contentType: 'wellness_check', subject: 'How have you been feeling?' },
        { stepNumber: 3, delayDays: 12, channel: primaryChannel, contentType: 'offer', subject: 'Welcome back offer' }
      );
      break;
    case 'REFERRAL':
      sequences.push(
        { stepNumber: 1, delayDays: 0, channel: primaryChannel, contentType: 'thank_you', subject: 'Thank you for being a valued patient' },
        { stepNumber: 2, delayDays: 3, channel: primaryChannel, contentType: 'referral_ask', subject: 'Share the wellness' }
      );
      break;
    case 'REVIEW':
      sequences.push(
        { stepNumber: 1, delayDays: 1, channel: primaryChannel, contentType: 'review_request', subject: 'How was your visit?' }
      );
      break;
    case 'RETENTION':
      sequences.push(
        { stepNumber: 1, delayDays: 0, channel: primaryChannel, contentType: 'wellness_tip', subject: 'Your wellness tip of the month' },
        { stepNumber: 2, delayDays: 14, channel: secondaryChannel, contentType: 'check_in', subject: 'Checking in on your wellness journey' }
      );
      break;
    default:
      sequences.push(
        { stepNumber: 1, delayDays: 0, channel: primaryChannel, contentType: 'announcement', subject: 'Exciting news from [Practice Name]' },
        { stepNumber: 2, delayDays: 5, channel: primaryChannel, contentType: 'reminder', subject: "Don't miss out" }
      );
  }

  return sequences;
}

/**
 * Get segment criteria based on segment type
 */
function getSegmentCriteria(
  segmentType: string,
  customCriteria?: Record<string, unknown>
): { patientFilters: Record<string, unknown> } {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  switch (segmentType) {
    case 'high_value':
      return {
        patientFilters: {
          // Patients with high visit frequency or high lifetime value
          // In production, would filter by actual financial data
        },
      };
    case 'at_risk':
      return {
        patientFilters: {
          // Patients showing signs of disengagement
          // Would filter by appointment gaps, missed appointments
        },
      };
    case 'new_patients':
      return {
        patientFilters: {
          createdAt: { gte: thirtyDaysAgo },
        },
      };
    case 'loyal':
      return {
        patientFilters: {
          createdAt: { lte: oneYearAgo },
        },
      };
    case 'lapsed':
      return {
        patientFilters: {
          // Would filter by last appointment date > 90 days
        },
      };
    case 'engaged':
      return {
        patientFilters: {
          // Recent activity, multiple appointments
        },
      };
    case 'unengaged':
      return {
        patientFilters: {
          // No recent activity, few appointments
        },
      };
    case 'custom':
      return {
        patientFilters: customCriteria || {},
      };
    default:
      return { patientFilters: {} };
  }
}

/**
 * Calculate segment score for a patient
 */
function calculateSegmentScore(patient: any, segmentType: string): number {
  let score = 50; // Base score

  const appointmentCount = patient.appointments?.length || 0;
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(patient.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const lastAppointment = patient.appointments?.[0];
  const daysSinceLastVisit = lastAppointment
    ? Math.floor(
        (Date.now() - new Date(lastAppointment.startTime).getTime()) / (1000 * 60 * 60 * 24)
      )
    : 999;

  switch (segmentType) {
    case 'high_value':
      score += Math.min(30, appointmentCount * 5);
      score += daysSinceCreated > 365 ? 20 : daysSinceCreated / 365 * 20;
      break;
    case 'at_risk':
      if (daysSinceLastVisit > 60) score += 30;
      if (daysSinceLastVisit > 90) score += 20;
      break;
    case 'new_patients':
      score = daysSinceCreated < 30 ? 100 : Math.max(0, 100 - daysSinceCreated);
      break;
    case 'loyal':
      score = Math.min(100, (daysSinceCreated / 365) * 50 + appointmentCount * 5);
      break;
    case 'lapsed':
      score = daysSinceLastVisit > 90 ? Math.min(100, 50 + (daysSinceLastVisit - 90) / 10) : 0;
      break;
    case 'engaged':
      score = Math.min(100, 50 + appointmentCount * 10 - daysSinceLastVisit);
      break;
    case 'unengaged':
      score = daysSinceLastVisit > 60 && appointmentCount < 3 ? 80 : 20;
      break;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get patient characteristics for segmentation
 */
function getPatientCharacteristics(
  patient: any,
  segmentType: string
): string[] {
  const characteristics: string[] = [];
  const appointmentCount = patient.appointments?.length || 0;
  const lastAppointment = patient.appointments?.[0];
  const daysSinceLastVisit = lastAppointment
    ? Math.floor(
        (Date.now() - new Date(lastAppointment.startTime).getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  if (appointmentCount >= 10) characteristics.push('Frequent visitor');
  else if (appointmentCount >= 5) characteristics.push('Regular patient');
  else if (appointmentCount <= 2) characteristics.push('New or infrequent');

  if (daysSinceLastVisit !== null) {
    if (daysSinceLastVisit <= 30) characteristics.push('Recently active');
    else if (daysSinceLastVisit <= 90) characteristics.push('Moderately active');
    else characteristics.push('Inactive');
  }

  if (patient.demographics?.dateOfBirth) {
    const age = Math.floor(
      (Date.now() - new Date(patient.demographics.dateOfBirth).getTime()) /
        (1000 * 60 * 60 * 24 * 365)
    );
    if (age < 30) characteristics.push('Young adult');
    else if (age < 50) characteristics.push('Middle-aged');
    else if (age < 65) characteristics.push('Mature adult');
    else characteristics.push('Senior');
  }

  return characteristics;
}

/**
 * Generate insights for a segment
 */
function generateSegmentInsights(
  patients: Array<{ segmentScore: number; totalVisits: number; lastVisitDate: Date | null }>,
  segmentType: string
): {
  averageScore: number;
  averageVisits: number;
  activePercentage: number;
  topCharacteristics: string[];
  recommendations: string[];
} {
  const avgScore = patients.length > 0
    ? patients.reduce((sum, p) => sum + p.segmentScore, 0) / patients.length
    : 0;
  const avgVisits = patients.length > 0
    ? patients.reduce((sum, p) => sum + p.totalVisits, 0) / patients.length
    : 0;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const activeCount = patients.filter(
    (p) => p.lastVisitDate && new Date(p.lastVisitDate) >= thirtyDaysAgo
  ).length;
  const activePercentage = patients.length > 0 ? (activeCount / patients.length) * 100 : 0;

  return {
    averageScore: Math.round(avgScore),
    averageVisits: Math.round(avgVisits * 10) / 10,
    activePercentage: Math.round(activePercentage),
    topCharacteristics: ['Regular visitors', 'Email responsive'],
    recommendations: [
      `${segmentType} segment shows ${avgScore > 60 ? 'strong' : 'moderate'} engagement potential`,
      avgVisits > 5 ? 'Consider loyalty rewards for this segment' : 'Focus on increasing visit frequency',
    ],
  };
}

/**
 * Get recommendations for a segment
 */
function getSegmentRecommendations(segmentType: string, patientCount: number): string[] {
  const recommendations: string[] = [];

  if (patientCount < 10) {
    recommendations.push('Consider broadening your targeting criteria for larger reach');
  } else if (patientCount > 500) {
    recommendations.push('Consider splitting into smaller, more targeted segments');
  }

  switch (segmentType) {
    case 'high_value':
      recommendations.push('Send personalized appreciation and loyalty rewards');
      recommendations.push('Invite to VIP events or early access programs');
      break;
    case 'at_risk':
      recommendations.push('Send re-engagement campaign with special offers');
      recommendations.push('Conduct satisfaction survey to identify issues');
      break;
    case 'new_patients':
      recommendations.push('Send welcome series with educational content');
      recommendations.push('Request feedback after first few visits');
      break;
    case 'lapsed':
      recommendations.push('Send win-back campaign with compelling offer');
      recommendations.push('Highlight new services or improvements');
      break;
    case 'engaged':
      recommendations.push('Request reviews and referrals');
      recommendations.push('Upsell complementary services');
      break;
  }

  return recommendations;
}

/**
 * Generate marketing content based on parameters
 */
function generateMarketingContent(params: {
  campaignType: string;
  channel: string;
  tone: string;
  contentType: string;
  includeOffer: boolean;
  offerDetails?: { type: string; value: string; expiresInDays: number };
  practiceName: string;
  practicePhone: string;
  abVariant?: string;
}): { subject?: string; body: string; cta: string } {
  const { campaignType, channel, tone, contentType, includeOffer, offerDetails, practiceName, practicePhone, abVariant } = params;

  let subject: string | undefined;
  let body: string;
  let cta: string;

  // Base content by type
  switch (contentType) {
    case 'promotional':
      subject = abVariant === 'B'
        ? `{{firstName}}, Your Exclusive Offer Awaits`
        : `Special Offer from ${practiceName}`;
      body = `Hi {{firstName}},\n\nWe have a special offer just for you! ${includeOffer && offerDetails ? `Enjoy ${offerDetails.value} on your next visit.` : ''}\n\nTake the first step toward better health today.\n\nBest regards,\n${practiceName}`;
      cta = 'Book Now';
      break;
    case 'educational':
      subject = `Health Tips from ${practiceName}`;
      body = `Hi {{firstName}},\n\nDid you know that regular chiropractic care can help with more than just back pain? Here are some benefits you might not know about:\n\n• Improved posture\n• Better sleep quality\n• Enhanced immune function\n• Reduced stress\n\nLearn more about how we can help you achieve optimal wellness.\n\nBest regards,\n${practiceName}`;
      cta = 'Learn More';
      break;
    case 'testimonial':
      subject = `See What Our Patients Say About ${practiceName}`;
      body = `Hi {{firstName}},\n\n"I was skeptical at first, but after just a few visits, I noticed a huge difference in my daily comfort and energy levels. The team at ${practiceName} truly cares about their patients." - Happy Patient\n\nWe'd love to help you achieve similar results.\n\nBest regards,\n${practiceName}`;
      cta = 'Read More Stories';
      break;
    case 'offer':
      subject = abVariant === 'B'
        ? `Don't Miss Out, {{firstName}}!`
        : `Your Special Offer from ${practiceName}`;
      body = `Hi {{firstName}},\n\n${includeOffer && offerDetails ? `For a limited time, enjoy ${offerDetails.value}!` : 'We have a special offer waiting for you!'}\n\n${offerDetails ? `Use code: {{offerCode}}\nExpires: {{expiryDate}}` : ''}\n\nDon't miss this opportunity to prioritize your health.\n\nBest regards,\n${practiceName}`;
      cta = 'Claim Your Offer';
      break;
    case 'reminder':
      subject = `Reminder: Your Health Matters`;
      body = `Hi {{firstName}},\n\nJust a friendly reminder that staying on top of your wellness routine is important for long-term health.\n\nWhen was your last visit? If it's been a while, we'd love to see you again.\n\nCall us at ${practicePhone} or book online.\n\nBest regards,\n${practiceName}`;
      cta = 'Schedule Now';
      break;
    case 'announcement':
      subject = `Exciting News from ${practiceName}!`;
      body = `Hi {{firstName}},\n\nWe have exciting news to share with you!\n\n[Announcement details here]\n\nWe're committed to providing you with the best care possible.\n\nBest regards,\n${practiceName}`;
      cta = 'Learn More';
      break;
    default:
      subject = `A Message from ${practiceName}`;
      body = `Hi {{firstName}},\n\nThank you for being a valued member of our practice family.\n\nWe're here to support your health journey.\n\nBest regards,\n${practiceName}`;
      cta = 'Contact Us';
  }

  // Adjust tone
  if (tone === 'urgent') {
    subject = subject ? `⚡ ${subject}` : undefined;
    cta = `${cta} - Limited Time!`;
  } else if (tone === 'friendly') {
    body = body.replace(/Best regards/g, 'Warmly');
  } else if (tone === 'empathetic') {
    body = body.replace('Hi {{firstName}},', 'Dear {{firstName}},\n\nWe hope this message finds you well.');
  }

  // Channel-specific adjustments
  if (channel === 'sms') {
    // Shorten for SMS
    body = body.split('\n\n')[0] + ` ${includeOffer && offerDetails ? `${offerDetails.value}! ` : ''}Reply YES to book or call ${practicePhone}`;
    subject = undefined;
  }

  return { subject, body, cta };
}

/**
 * Get target patients based on audience criteria
 */
async function getTargetPatients(
  prisma: any,
  organizationId: string,
  targetAudience: Record<string, unknown>,
  limit: number
): Promise<Array<{
  id: string;
  demographics: any;
  contacts: any[];
}>> {
  const where: any = {
    organizationId,
    isActive: true,
  };

  // Apply filters from targetAudience
  // In production, would build comprehensive query based on all criteria

  return prisma.patient.findMany({
    where,
    take: limit,
    include: {
      demographics: true,
      contacts: { where: { isPrimary: true }, take: 1 },
    },
  });
}

/**
 * Calculate statistical significance for A/B test
 */
function calculateStatisticalSignificance(
  variants: Array<{
    variant: string;
    recipients: number;
    openRate: number;
    clickRate: number;
    conversionRate: number;
  }>,
  winnerMetric: string
): {
  isSignificant: boolean;
  confidenceLevel: number;
  betterVariant: string;
  improvement: number;
} {
  if (variants.length < 2) {
    return { isSignificant: false, confidenceLevel: 0, betterVariant: 'A', improvement: 0 };
  }

  const [a, b] = variants;
  const metricKey = winnerMetric === 'open_rate' ? 'openRate'
    : winnerMetric === 'click_rate' ? 'clickRate'
    : 'conversionRate';

  const aMetric = (a as any)[metricKey] as number;
  const bMetric = (b as any)[metricKey] as number;

  const betterVariant = bMetric > aMetric ? 'B' : 'A';
  const improvement = aMetric > 0 ? Math.abs(bMetric - aMetric) / aMetric * 100 : 0;

  // Simplified significance calculation (in production, use proper statistical test)
  const totalSamples = a.recipients + b.recipients;
  const minSamples = 200;
  const significantDifference = 10; // 10% relative difference

  const isSignificant = totalSamples >= minSamples && improvement >= significantDifference;
  const confidenceLevel = isSignificant
    ? Math.min(99, 80 + Math.min(19, improvement))
    : Math.min(80, 50 + totalSamples / 10);

  return {
    isSignificant,
    confidenceLevel: Math.round(confidenceLevel),
    betterVariant,
    improvement: Math.round(improvement * 10) / 10,
  };
}

/**
 * Generate optimization recommendations for a campaign
 */
function generateOptimizationRecommendations(
  campaign: any,
  performance: {
    ctr: number;
    conversionRate: number;
    costPerLead: number | null;
    roi: number | null;
  }
): Array<{
  category: string;
  priority: 'high' | 'medium' | 'low';
  recommendation: string;
  action: string;
  expectedImpact: string;
}> {
  const recommendations: Array<{
    category: string;
    priority: 'high' | 'medium' | 'low';
    recommendation: string;
    action: string;
    expectedImpact: string;
  }> = [];

  const benchmarks = getCampaignBenchmarks(campaign.campaignType);

  // CTR recommendations
  if (performance.ctr < benchmarks.ctr) {
    recommendations.push({
      category: 'Engagement',
      priority: performance.ctr < benchmarks.ctr * 0.5 ? 'high' : 'medium',
      recommendation: 'Click-through rate is below industry benchmark',
      action: 'Test different subject lines and preview text; consider A/B testing',
      expectedImpact: `+${Math.round((benchmarks.ctr - performance.ctr) * 10) / 10}% CTR improvement potential`,
    });
  }

  // Conversion recommendations
  if (performance.conversionRate < benchmarks.conversionRate) {
    recommendations.push({
      category: 'Conversion',
      priority: 'high',
      recommendation: 'Conversion rate needs improvement',
      action: 'Review landing pages; strengthen calls-to-action; simplify booking process',
      expectedImpact: `+${Math.round((benchmarks.conversionRate - performance.conversionRate) * 10) / 10}% conversion potential`,
    });
  }

  // Cost efficiency
  if (performance.costPerLead !== null && performance.costPerLead > benchmarks.costPerLead) {
    recommendations.push({
      category: 'Cost Efficiency',
      priority: 'medium',
      recommendation: 'Cost per lead is higher than target',
      action: 'Refine audience targeting; remove underperforming segments',
      expectedImpact: `$${Math.round(performance.costPerLead - benchmarks.costPerLead)} savings per lead`,
    });
  }

  // ROI recommendations
  if (performance.roi !== null && performance.roi < benchmarks.roi) {
    recommendations.push({
      category: 'ROI',
      priority: performance.roi < 0 ? 'high' : 'medium',
      recommendation: 'Campaign ROI is below target',
      action: 'Focus on high-value segments; increase conversion-focused content',
      expectedImpact: `${Math.round(benchmarks.roi - performance.roi)}% ROI improvement potential`,
    });
  }

  // Timing optimization
  recommendations.push({
    category: 'Timing',
    priority: 'low',
    recommendation: 'Consider send time optimization',
    action: 'Test sending at different times; analyze engagement patterns',
    expectedImpact: '+5-15% open rate improvement',
  });

  // Content freshness
  if (campaign.status === 'ACTIVE') {
    const daysSinceStart = campaign.startDate
      ? Math.floor((Date.now() - new Date(campaign.startDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    if (daysSinceStart > 30) {
      recommendations.push({
        category: 'Content',
        priority: 'medium',
        recommendation: 'Campaign content may need refresh',
        action: 'Update messaging; introduce new offers or content angles',
        expectedImpact: 'Prevent audience fatigue',
      });
    }
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Get benchmark metrics for campaign type
 */
function getCampaignBenchmarks(campaignType: string): {
  ctr: number;
  conversionRate: number;
  costPerLead: number;
  roi: number;
} {
  const benchmarks: Record<string, {
    ctr: number;
    conversionRate: number;
    costPerLead: number;
    roi: number;
  }> = {
    LEAD_GENERATION: { ctr: 2.5, conversionRate: 3, costPerLead: 50, roi: 200 },
    REACTIVATION: { ctr: 3.5, conversionRate: 5, costPerLead: 30, roi: 300 },
    REFERRAL: { ctr: 4, conversionRate: 8, costPerLead: 20, roi: 500 },
    REVIEW: { ctr: 5, conversionRate: 15, costPerLead: 10, roi: 400 },
    RETENTION: { ctr: 3, conversionRate: 4, costPerLead: 25, roi: 350 },
    UPSELL: { ctr: 3.5, conversionRate: 6, costPerLead: 35, roi: 250 },
    SEASONAL: { ctr: 2.8, conversionRate: 4, costPerLead: 40, roi: 220 },
    EVENT: { ctr: 4.5, conversionRate: 10, costPerLead: 25, roi: 300 },
  };

  return benchmarks[campaignType] || benchmarks.LEAD_GENERATION;
}

/**
 * Calculate optimization score for campaign
 */
function calculateOptimizationScore(
  performance: {
    ctr: number;
    conversionRate: number;
    costPerLead: number | null;
    roi: number | null;
  },
  campaignType: string
): number {
  const benchmarks = getCampaignBenchmarks(campaignType);
  let score = 50; // Base score

  // CTR score (up to 25 points)
  if (performance.ctr >= benchmarks.ctr) {
    score += 25;
  } else {
    score += Math.round((performance.ctr / benchmarks.ctr) * 25);
  }

  // Conversion score (up to 30 points)
  if (performance.conversionRate >= benchmarks.conversionRate) {
    score += 30;
  } else {
    score += Math.round((performance.conversionRate / benchmarks.conversionRate) * 30);
  }

  // Cost efficiency score (up to 20 points)
  if (performance.costPerLead !== null) {
    if (performance.costPerLead <= benchmarks.costPerLead) {
      score += 20;
    } else {
      score += Math.max(0, 20 - Math.round((performance.costPerLead - benchmarks.costPerLead) / 5));
    }
  }

  // ROI score (up to 25 points)
  if (performance.roi !== null) {
    if (performance.roi >= benchmarks.roi) {
      score += 25;
    } else if (performance.roi > 0) {
      score += Math.round((performance.roi / benchmarks.roi) * 25);
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate ROI insights from campaign data
 */
function generateROIInsights(
  campaigns: Array<{ metrics: { roi: number; spend: number; revenue: number }; campaignType: string }>,
  totals: { overallROI: number; totalSpend: number; totalRevenue: number }
): string[] {
  const insights: string[] = [];

  if (totals.overallROI > 200) {
    insights.push(`Strong overall ROI of ${Math.round(totals.overallROI)}% - marketing efforts are highly effective`);
  } else if (totals.overallROI > 100) {
    insights.push(`Good ROI of ${Math.round(totals.overallROI)}% - room for optimization`);
  } else if (totals.overallROI > 0) {
    insights.push(`Positive but modest ROI of ${Math.round(totals.overallROI)}% - consider refining strategy`);
  } else {
    insights.push('ROI is negative - urgent optimization needed');
  }

  // Find best performing campaign type
  const byType: Record<string, { revenue: number; spend: number }> = {};
  campaigns.forEach((c) => {
    if (!byType[c.campaignType]) {
      byType[c.campaignType] = { revenue: 0, spend: 0 };
    }
    byType[c.campaignType].revenue += c.metrics.revenue;
    byType[c.campaignType].spend += c.metrics.spend;
  });

  let bestType = '';
  let bestROI = -999;
  Object.entries(byType).forEach(([type, data]) => {
    const roi = data.spend > 0 ? ((data.revenue - data.spend) / data.spend) * 100 : 0;
    if (roi > bestROI) {
      bestROI = roi;
      bestType = type;
    }
  });

  if (bestType) {
    insights.push(`${bestType.replace('_', ' ')} campaigns show highest ROI at ${Math.round(bestROI)}%`);
  }

  return insights;
}

/**
 * Generate ROI recommendations
 */
function generateROIRecommendations(
  campaigns: Array<{ metrics: { roi: number }; campaignType: string; status: string }>,
  totals: { overallROI: number }
): string[] {
  const recommendations: string[] = [];

  if (totals.overallROI < 100) {
    recommendations.push('Consider pausing underperforming campaigns and reallocating budget');
  }

  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
  if (activeCampaigns.length > 5) {
    recommendations.push('Many active campaigns - consider consolidating for better focus');
  }

  const negativeROI = campaigns.filter((c) => c.metrics.roi < 0);
  if (negativeROI.length > 0) {
    recommendations.push(`${negativeROI.length} campaign(s) with negative ROI - review and optimize or pause`);
  }

  recommendations.push('Test new audience segments to find untapped opportunities');
  recommendations.push('Implement A/B testing on top-performing campaigns to maximize results');

  return recommendations;
}

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

  // ============================================
  // US-357: Automated Lead Nurturing
  // ============================================

  /**
   * Start or continue nurturing a lead with personalized sequences
   */
  nurtureLead: protectedProcedure
    .input(nurtureLeadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, sequenceType, customContent, immediateStart } = input;

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

      // Get organization settings for message personalization
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      const orgSettings = (org?.settings || {}) as Record<string, unknown>;
      const practiceName = org?.name || 'Our Practice';
      const practicePhone = (orgSettings.phone as string) || '';
      const bookingLink = (orgSettings.bookingUrl as string) || `https://booking.${org?.subdomain || 'practice'}.com`;

      // Calculate engagement metrics
      const engagement: NurtureEngagement = {
        emailsOpened: lead.emailsOpened,
        linksClicked: lead.linksClicked,
        replies: 0, // Would track separately
        optOuts: 0,
        lastEngagementDate: lead.lastAnalyzedAt,
        engagementScore: calculateEngagementScore(
          lead.emailsOpened,
          lead.linksClicked,
          0,
          lead.nurtureStepNumber || 0,
        ),
      };

      // Select appropriate sequence
      const daysSinceCreated = Math.floor(
        (Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      const selectedSequence = sequenceType
        ? getNurtureSequenceTemplates().find(t => t.id === sequenceType)!
        : selectNurtureSequence(
            lead.qualityScore,
            lead.urgencyScore,
            Number(lead.conversionProbability),
            daysSinceCreated,
            engagement,
          );

      // Calculate optimal timing
      const optimalTiming = calculateOptimalTiming({
        lastPageViewed: lead.lastPageViewed,
        websiteVisits: lead.websiteVisits,
        timeOnSite: lead.timeOnSite,
        emailsOpened: lead.emailsOpened,
        linksClicked: lead.linksClicked,
      });

      // Determine starting step (continue from where they left off or start fresh)
      const startStep = lead.nurtureStepNumber && lead.nurtureSequenceId === selectedSequence.id
        ? Math.min(lead.nurtureStepNumber + 1, selectedSequence.steps.length)
        : 1;

      const currentStep = selectedSequence.steps.find(s => s.stepNumber === startStep);
      if (!currentStep) {
        return {
          success: true,
          message: 'Nurture sequence completed',
          sequenceCompleted: true,
          lead,
        };
      }

      // Process content with personalization
      const processedContent = processNurtureContent(currentStep.content, {
        firstName: lead.firstName || 'there',
        lastName: lead.lastName || '',
        practiceName,
        practicePhone,
        bookingLink,
      });

      const processedSubject = currentStep.subject
        ? processNurtureContent(currentStep.subject, {
            firstName: lead.firstName || 'there',
            lastName: lead.lastName || '',
            practiceName,
            practicePhone,
            bookingLink,
          })
        : undefined;

      // Calculate next send time
      const nextSendTime = immediateStart && startStep === 1
        ? new Date()
        : new Date(Date.now() + currentStep.delayDays * 24 * 60 * 60 * 1000);

      // Update lead with nurture info
      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: {
          status: 'NURTURING',
          nurtureSequenceId: selectedSequence.id,
          nurtureStepNumber: startStep,
          nurtureStartedAt: lead.nurtureStartedAt || new Date(),
          nextAction: `Send ${selectedSequence.name} step ${startStep}`,
          nextActionDate: nextSendTime,
        },
      });

      // Log activity
      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: 'nurture_step_scheduled',
          description: `${selectedSequence.name} step ${startStep} scheduled for ${nextSendTime.toLocaleDateString()}`,
          performedBy: ctx.user.id,
          isAutomated: false,
          metadata: {
            sequenceId: selectedSequence.id,
            sequenceName: selectedSequence.name,
            stepNumber: startStep,
            channel: currentStep.channel,
            scheduledAt: nextSendTime.toISOString(),
            contentType: currentStep.contentType,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await auditLog('AI_GROWTH_NURTURE_STARTED', 'GrowthLead', {
        entityId: leadId,
        changes: {
          sequenceId: selectedSequence.id,
          stepNumber: startStep,
          channel: currentStep.channel,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        message: `Lead added to ${selectedSequence.name} nurture sequence`,
        sequenceCompleted: false,
        lead: updatedLead,
        currentStep: {
          stepNumber: startStep,
          totalSteps: selectedSequence.steps.length,
          channel: currentStep.channel,
          contentType: currentStep.contentType,
          scheduledAt: nextSendTime,
          subject: processedSubject,
          content: processedContent,
        },
        sequence: {
          id: selectedSequence.id,
          name: selectedSequence.name,
          description: selectedSequence.description,
          expectedConversionRate: selectedSequence.averageConversionRate,
        },
        optimalTiming,
        engagement,
      };
    }),

  /**
   * Advance a lead to the next nurture step
   */
  advanceNurtureStep: protectedProcedure
    .input(advanceNurtureStepInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, skipToStep, markEngaged } = input;

      const lead = await ctx.prisma.growthLead.findFirst({
        where: {
          id: leadId,
          organizationId: ctx.user.organizationId,
          status: 'NURTURING',
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found or not in nurturing status',
        });
      }

      if (!lead.nurtureSequenceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Lead is not in a nurture sequence',
        });
      }

      const sequence = getNurtureSequenceTemplates().find(t => t.id === lead.nurtureSequenceId);
      if (!sequence) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Nurture sequence not found',
        });
      }

      const currentStep = lead.nurtureStepNumber || 1;
      const nextStep = skipToStep || currentStep + 1;

      // Check if sequence is complete
      if (nextStep > sequence.steps.length) {
        const updatedLead = await ctx.prisma.growthLead.update({
          where: { id: leadId },
          data: {
            status: lead.qualityScore >= 70 ? 'HOT' : 'WARM',
            nurtureStepNumber: sequence.steps.length,
            nextAction: 'Nurture sequence completed - manual follow-up recommended',
            aiNotes: `Completed ${sequence.name}. Consider direct outreach.`,
          },
        });

        await ctx.prisma.growthLeadActivity.create({
          data: {
            growthLeadId: leadId,
            activityType: 'nurture_completed',
            description: `Completed ${sequence.name} (${sequence.steps.length} steps)`,
            performedBy: 'AI',
            isAutomated: true,
          },
        });

        return {
          success: true,
          sequenceCompleted: true,
          lead: updatedLead,
          message: 'Nurture sequence completed',
        };
      }

      const nextStepData = sequence.steps.find(s => s.stepNumber === nextStep);
      const nextSendTime = new Date(Date.now() + (nextStepData?.delayDays || 0) * 24 * 60 * 60 * 1000);

      // Update engagement if marked
      const engagementUpdate = markEngaged
        ? {
            emailsOpened: { increment: 1 },
            lastAnalyzedAt: new Date(),
          }
        : {};

      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: {
          nurtureStepNumber: nextStep,
          nextActionDate: nextSendTime,
          nextAction: `Send ${sequence.name} step ${nextStep}`,
          ...engagementUpdate,
        },
      });

      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: 'nurture_step_advanced',
          description: `Advanced to ${sequence.name} step ${nextStep}`,
          oldValue: currentStep.toString(),
          newValue: nextStep.toString(),
          performedBy: markEngaged ? 'AI' : ctx.user.id,
          isAutomated: markEngaged,
        },
      });

      await auditLog('AI_GROWTH_NURTURE_ADVANCED', 'GrowthLead', {
        entityId: leadId,
        changes: { fromStep: currentStep, toStep: nextStep },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        sequenceCompleted: false,
        lead: updatedLead,
        currentStep: nextStep,
        totalSteps: sequence.steps.length,
        nextSendTime,
        message: `Advanced to step ${nextStep} of ${sequence.steps.length}`,
      };
    }),

  /**
   * Record engagement with nurture content (email opens, link clicks, replies)
   */
  recordNurtureEngagement: protectedProcedure
    .input(recordNurtureEngagementInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, engagementType, metadata } = input;

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

      // Update engagement metrics
      const updateData: Record<string, unknown> = {
        lastAnalyzedAt: new Date(),
      };

      let activityDescription = '';
      let shouldEscalate = false;

      switch (engagementType) {
        case 'email_opened':
          updateData.emailsOpened = { increment: 1 };
          activityDescription = `Opened email (step ${metadata?.stepNumber || 'unknown'})`;
          break;
        case 'link_clicked':
          updateData.linksClicked = { increment: 1 };
          activityDescription = `Clicked link: ${metadata?.linkUrl || 'unknown'}`;
          // Link clicks are high-value engagement
          if (lead.linksClicked >= 2) {
            updateData.urgencyScore = Math.min(100, lead.urgencyScore + 15);
            shouldEscalate = true;
          }
          break;
        case 'reply_received':
        case 'sms_reply':
          activityDescription = `Replied to ${engagementType === 'sms_reply' ? 'SMS' : 'email'}`;
          // Replies are very high-value - escalate immediately
          shouldEscalate = true;
          updateData.status = 'HOT';
          updateData.urgencyScore = Math.min(100, lead.urgencyScore + 25);
          break;
        case 'opt_out':
          activityDescription = 'Opted out of communications';
          updateData.status = 'LOST';
          break;
      }

      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: updateData as Prisma.GrowthLeadUpdateInput,
      });

      // Log activity
      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: `nurture_${engagementType}`,
          description: activityDescription,
          performedBy: 'SYSTEM',
          isAutomated: true,
          metadata: metadata as unknown as Prisma.InputJsonValue,
        },
      });

      // Calculate new engagement score
      const engagementScore = calculateEngagementScore(
        updatedLead.emailsOpened,
        updatedLead.linksClicked,
        engagementType === 'reply_received' || engagementType === 'sms_reply' ? 1 : 0,
        updatedLead.nurtureStepNumber || 1,
      );

      await auditLog('AI_GROWTH_NURTURE_ENGAGEMENT', 'GrowthLead', {
        entityId: leadId,
        changes: { engagementType, engagementScore },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        lead: updatedLead,
        engagementScore,
        shouldEscalate,
        escalationReason: shouldEscalate
          ? `High engagement detected: ${engagementType}`
          : null,
      };
    }),

  /**
   * Handle lead response (email reply, SMS reply, etc.) and determine next action
   */
  handleLeadResponse: protectedProcedure
    .input(handleLeadResponseInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, responseType, content } = input;

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

      // Handle unsubscribe immediately
      if (responseType === 'unsubscribe') {
        const updatedLead = await ctx.prisma.growthLead.update({
          where: { id: leadId },
          data: {
            status: 'LOST',
            aiNotes: 'Lead opted out of communications',
            nextAction: 'Respect opt-out - no further outreach',
          },
        });

        await ctx.prisma.growthLeadActivity.create({
          data: {
            growthLeadId: leadId,
            activityType: 'lead_opted_out',
            description: 'Lead unsubscribed from communications',
            performedBy: 'SYSTEM',
            isAutomated: true,
          },
        });

        return {
          success: true,
          lead: updatedLead,
          response: {
            leadId,
            responseType,
            sentiment: 'negative' as const,
            urgency: 'low' as const,
            requiresHumanFollowUp: false,
            suggestedAction: 'Lead has opted out. Respect their preference.',
          },
        };
      }

      // Analyze sentiment if content provided
      const { sentiment, urgency } = content
        ? analyzeResponseSentiment(content)
        : { sentiment: 'neutral' as const, urgency: 'medium' as const };

      // Determine if human follow-up is needed
      const requiresHumanFollowUp =
        urgency === 'high' ||
        sentiment === 'positive' ||
        responseType === 'call_request' ||
        responseType === 'booking_attempt';

      // Generate suggested action
      let suggestedAction = '';
      if (responseType === 'booking_attempt') {
        suggestedAction = 'Lead attempted to book - call immediately to complete booking';
      } else if (responseType === 'call_request') {
        suggestedAction = 'Lead requested a call - respond within 1 hour';
      } else if (sentiment === 'positive' && urgency === 'high') {
        suggestedAction = 'Hot lead with urgent need - call immediately';
      } else if (sentiment === 'positive') {
        suggestedAction = 'Positive response - schedule follow-up call within 24 hours';
      } else if (sentiment === 'negative') {
        suggestedAction = 'Address concerns - personalized response needed';
      } else {
        suggestedAction = 'Continue nurture sequence with personalized touch';
      }

      // Update lead status based on response
      let newStatus: GrowthLeadStatus = lead.status;
      if (sentiment === 'positive' && urgency === 'high') {
        newStatus = 'HOT';
      } else if (sentiment === 'positive' || responseType === 'booking_attempt') {
        newStatus = 'READY';
      }

      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: {
          status: newStatus,
          urgencyScore: urgency === 'high' ? Math.min(100, lead.urgencyScore + 30) : lead.urgencyScore,
          nextAction: suggestedAction,
          aiNotes: content ? `Last response (${sentiment}): ${content.substring(0, 200)}...` : lead.aiNotes,
        },
      });

      // Log activity
      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: `response_${responseType}`,
          description: `Lead responded via ${responseType}: ${sentiment} sentiment, ${urgency} urgency`,
          performedBy: 'SYSTEM',
          isAutomated: true,
          metadata: {
            content: content?.substring(0, 500),
            sentiment,
            urgency,
            requiresHumanFollowUp,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await auditLog('AI_GROWTH_RESPONSE_HANDLED', 'GrowthLead', {
        entityId: leadId,
        changes: { responseType, sentiment, urgency, newStatus },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      const response: LeadResponse = {
        leadId,
        responseType,
        content,
        sentiment,
        urgency,
        requiresHumanFollowUp,
        suggestedAction,
      };

      return {
        success: true,
        lead: updatedLead,
        response,
      };
    }),

  /**
   * Get optimal timing for next outreach
   */
  getOptimalTiming: protectedProcedure
    .input(getOptimalTimingInputSchema)
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

      const optimalTiming = calculateOptimalTiming({
        lastPageViewed: lead.lastPageViewed,
        websiteVisits: lead.websiteVisits,
        timeOnSite: lead.timeOnSite,
        emailsOpened: lead.emailsOpened,
        linksClicked: lead.linksClicked,
      });

      return {
        leadId: lead.id,
        channel: input.channel,
        ...optimalTiming,
        leadEngagement: {
          emailsOpened: lead.emailsOpened,
          linksClicked: lead.linksClicked,
          websiteVisits: lead.websiteVisits,
        },
      };
    }),

  /**
   * Get available nurture sequences with personalized recommendations
   */
  getNurtureSequences: protectedProcedure
    .input(getNurtureSequencesInputSchema)
    .query(async ({ ctx, input }) => {
      const templates = getNurtureSequenceTemplates();

      // If leadId provided, recommend the best sequence
      if (input.leadId) {
        const lead = await ctx.prisma.growthLead.findFirst({
          where: {
            id: input.leadId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (lead) {
          const daysSinceCreated = Math.floor(
            (Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24),
          );

          const engagement: NurtureEngagement = {
            emailsOpened: lead.emailsOpened,
            linksClicked: lead.linksClicked,
            replies: 0,
            optOuts: 0,
            lastEngagementDate: lead.lastAnalyzedAt,
            engagementScore: calculateEngagementScore(
              lead.emailsOpened,
              lead.linksClicked,
              0,
              lead.nurtureStepNumber || 0,
            ),
          };

          const recommended = selectNurtureSequence(
            lead.qualityScore,
            lead.urgencyScore,
            Number(lead.conversionProbability),
            daysSinceCreated,
            engagement,
          );

          return {
            sequences: templates.map(t => ({
              ...t,
              isRecommended: t.id === recommended.id,
              currentStep: t.id === lead.nurtureSequenceId ? lead.nurtureStepNumber : null,
            })),
            recommendedSequenceId: recommended.id,
            leadStatus: lead.status,
            leadEngagement: engagement,
          };
        }
      }

      return {
        sequences: templates.map(t => ({
          ...t,
          isRecommended: false,
          currentStep: null,
        })),
        recommendedSequenceId: null,
      };
    }),

  /**
   * Pause nurturing for a lead
   */
  pauseNurture: protectedProcedure
    .input(pauseNurtureInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, reason } = input;

      const lead = await ctx.prisma.growthLead.findFirst({
        where: {
          id: leadId,
          organizationId: ctx.user.organizationId,
          status: 'NURTURING',
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found or not in nurturing status',
        });
      }

      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: {
          status: 'WARM',
          nextAction: 'Nurturing paused - manual follow-up may be needed',
          aiNotes: reason ? `Nurturing paused: ${reason}` : 'Nurturing paused by user',
        },
      });

      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: 'nurture_paused',
          description: reason || 'Nurturing paused',
          performedBy: ctx.user.id,
          isAutomated: false,
        },
      });

      await auditLog('AI_GROWTH_NURTURE_PAUSED', 'GrowthLead', {
        entityId: leadId,
        changes: { reason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        lead: updatedLead,
        message: 'Nurturing paused',
      };
    }),

  /**
   * Resume nurturing for a lead
   */
  resumeNurture: protectedProcedure
    .input(resumeNurtureInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, restartSequence } = input;

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

      if (!lead.nurtureSequenceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Lead was not previously in a nurture sequence',
        });
      }

      const sequence = getNurtureSequenceTemplates().find(t => t.id === lead.nurtureSequenceId);
      if (!sequence) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Previous nurture sequence not found',
        });
      }

      const stepNumber = restartSequence ? 1 : (lead.nurtureStepNumber || 1);
      const nextStep = sequence.steps.find(s => s.stepNumber === stepNumber);
      const nextSendTime = new Date(Date.now() + (nextStep?.delayDays || 0) * 24 * 60 * 60 * 1000);

      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: {
          status: 'NURTURING',
          nurtureStepNumber: stepNumber,
          nurtureStartedAt: restartSequence ? new Date() : lead.nurtureStartedAt,
          nextActionDate: nextSendTime,
          nextAction: `Send ${sequence.name} step ${stepNumber}`,
        },
      });

      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: 'nurture_resumed',
          description: restartSequence
            ? `Restarted ${sequence.name} from beginning`
            : `Resumed ${sequence.name} at step ${stepNumber}`,
          performedBy: ctx.user.id,
          isAutomated: false,
        },
      });

      await auditLog('AI_GROWTH_NURTURE_RESUMED', 'GrowthLead', {
        entityId: leadId,
        changes: { sequenceId: sequence.id, stepNumber, restartSequence },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        lead: updatedLead,
        sequence: {
          id: sequence.id,
          name: sequence.name,
          currentStep: stepNumber,
          totalSteps: sequence.steps.length,
        },
        message: restartSequence
          ? `Nurturing restarted from step 1`
          : `Nurturing resumed at step ${stepNumber}`,
      };
    }),

  /**
   * Escalate a hot lead to staff for immediate follow-up
   */
  escalateHotLead: protectedProcedure
    .input(escalateHotLeadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { leadId, urgency, reason, preferredStaffId } = input;

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

      // Find best staff to assign
      let assignedUserId = preferredStaffId;
      let assignmentReason = preferredStaffId ? 'Assigned to preferred staff member' : '';

      if (!assignedUserId) {
        const bestMatch = await findBestStaffAssignment(
          ctx.prisma,
          ctx.user.organizationId,
          lead.source,
          lead.qualityScore,
        );

        if (bestMatch) {
          assignedUserId = bestMatch.userId;
          assignmentReason = `Auto-assigned to ${bestMatch.userName} based on availability and performance`;
        }
      }

      // Update lead
      const updatedLead = await ctx.prisma.growthLead.update({
        where: { id: leadId },
        data: {
          status: 'HOT',
          assignedToUserId: assignedUserId,
          urgencyScore: urgency === 'high' ? 100 : urgency === 'medium' ? 75 : 50,
          nextAction: `URGENT: ${reason}`,
          nextActionDate: new Date(), // Immediate
          aiNotes: `Escalated (${urgency} urgency): ${reason}`,
        },
      });

      // Log activity
      await ctx.prisma.growthLeadActivity.create({
        data: {
          growthLeadId: leadId,
          activityType: 'lead_escalated',
          description: `Lead escalated with ${urgency} urgency: ${reason}`,
          performedBy: ctx.user.id,
          isAutomated: false,
          metadata: {
            urgency,
            reason,
            assignedTo: assignedUserId,
            assignmentReason,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await auditLog('AI_GROWTH_LEAD_ESCALATED', 'GrowthLead', {
        entityId: leadId,
        changes: { urgency, reason, assignedUserId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        lead: updatedLead,
        assignedTo: assignedUserId,
        assignmentReason,
        message: `Lead escalated with ${urgency} urgency`,
      };
    }),

  /**
   * Get nurture sequence analytics
   */
  getNurtureAnalytics: protectedProcedure
    .input(getNurtureAnalyticsInputSchema)
    .query(async ({ ctx, input }) => {
      const { sequenceType, startDate, endDate } = input;

      const where: Prisma.GrowthLeadWhereInput = {
        organizationId: ctx.user.organizationId,
        nurtureSequenceId: { not: null },
        ...(sequenceType && { nurtureSequenceId: sequenceType }),
        ...(startDate && { nurtureStartedAt: { gte: startDate } }),
        ...(endDate && { nurtureStartedAt: { lte: endDate } }),
      };

      const leads = await ctx.prisma.growthLead.findMany({
        where,
        select: {
          id: true,
          nurtureSequenceId: true,
          nurtureStepNumber: true,
          status: true,
          qualityScore: true,
          conversionProbability: true,
          emailsOpened: true,
          linksClicked: true,
          nurtureStartedAt: true,
          convertedAt: true,
        },
      });

      // Aggregate by sequence
      const sequenceStats: Record<string, {
        totalLeads: number;
        completedLeads: number;
        convertedLeads: number;
        avgEmailsOpened: number;
        avgLinksClicked: number;
        avgStepsCompleted: number;
        conversionRate: number;
        dropoffByStep: Record<number, number>;
      }> = {};

      const templates = getNurtureSequenceTemplates();

      for (const template of templates) {
        sequenceStats[template.id] = {
          totalLeads: 0,
          completedLeads: 0,
          convertedLeads: 0,
          avgEmailsOpened: 0,
          avgLinksClicked: 0,
          avgStepsCompleted: 0,
          conversionRate: 0,
          dropoffByStep: {},
        };
      }

      for (const lead of leads) {
        const seqId = lead.nurtureSequenceId || 'unknown';
        if (!sequenceStats[seqId]) continue;

        sequenceStats[seqId].totalLeads++;
        sequenceStats[seqId].avgEmailsOpened += lead.emailsOpened;
        sequenceStats[seqId].avgLinksClicked += lead.linksClicked;
        sequenceStats[seqId].avgStepsCompleted += lead.nurtureStepNumber || 0;

        if (lead.status === 'CONVERTED') {
          sequenceStats[seqId].convertedLeads++;
        }

        const template = templates.find(t => t.id === seqId);
        if (template && (lead.nurtureStepNumber || 0) >= template.steps.length) {
          sequenceStats[seqId].completedLeads++;
        }

        // Track dropoff
        const step = lead.nurtureStepNumber || 1;
        sequenceStats[seqId].dropoffByStep[step] =
          (sequenceStats[seqId].dropoffByStep[step] || 0) + 1;
      }

      // Calculate averages
      for (const seqId of Object.keys(sequenceStats)) {
        const stats = sequenceStats[seqId];
        if (stats.totalLeads > 0) {
          stats.avgEmailsOpened = stats.avgEmailsOpened / stats.totalLeads;
          stats.avgLinksClicked = stats.avgLinksClicked / stats.totalLeads;
          stats.avgStepsCompleted = stats.avgStepsCompleted / stats.totalLeads;
          stats.conversionRate = stats.convertedLeads / stats.totalLeads;
        }
      }

      return {
        sequences: Object.entries(sequenceStats).map(([id, stats]) => {
          const template = templates.find(t => t.id === id);
          return {
            sequenceId: id,
            sequenceName: template?.name || id,
            ...stats,
            benchmarkConversionRate: template?.averageConversionRate || 0,
            performanceVsBenchmark: stats.conversionRate - (template?.averageConversionRate || 0),
          };
        }),
        totalLeadsNurtured: leads.length,
        overallConversionRate: leads.filter(l => l.status === 'CONVERTED').length / (leads.length || 1),
        dateRange: { startDate, endDate },
      };
    }),

  // ============================================
  // US-358: Reputation Management
  // ============================================

  /**
   * Request a review from a patient - smart review request
   */
  requestReview: protectedProcedure
    .input(requestReviewInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { patientId, platform, channel, customMessage, scheduleFor, triggeredByAppointmentId } = input;

      // Get patient with organization details and demographics
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          organization: true,
          demographics: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check for recent review requests to avoid spamming
      const recentRequest = await ctx.prisma.reviewRequest.findFirst({
        where: {
          patientId,
          createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // Last 90 days
          status: { notIn: ['DECLINED', 'FAILED'] },
        },
      });

      if (recentRequest) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A review request was already sent to this patient recently',
        });
      }

      // Generate review URL (would integrate with actual platform URLs in production)
      const platformUrls: Record<string, string> = {
        GOOGLE: `https://g.page/review/${ctx.user.organizationId}`,
        YELP: `https://www.yelp.com/writeareview/biz/${ctx.user.organizationId}`,
        FACEBOOK: `https://www.facebook.com/${ctx.user.organizationId}/reviews`,
        HEALTHGRADES: `https://www.healthgrades.com/review/${ctx.user.organizationId}`,
        ZOCDOC: `https://www.zocdoc.com/review/${ctx.user.organizationId}`,
        OTHER: `/review`, // Would be configured in organization settings
      };

      const reviewUrl = platformUrls[platform] || platformUrls.OTHER;

      // Generate message using patient demographics
      const patientFirstName = patient.demographics?.firstName || 'Valued Patient';
      const message = customMessage
        ? { body: customMessage }
        : generateReviewRequestMessage(
            patientFirstName,
            patient.organization.name,
            platform,
            reviewUrl,
            channel,
          );

      // Create review request
      const scheduledTime = scheduleFor || calculateOptimalReviewRequestTime(new Date(), null);

      const reviewRequest = await ctx.prisma.reviewRequest.create({
        data: {
          patientId,
          organizationId: ctx.user.organizationId,
          platform: platform as any,
          status: scheduleFor && scheduleFor > new Date() ? 'PENDING' : 'SENT',
          sentVia: channel,
          scheduledFor: scheduledTime,
          sentAt: scheduleFor && scheduleFor > new Date() ? null : new Date(),
          reviewUrl,
          triggeredByAppointmentId,
        },
      });

      // Log activity
      await auditLog('AI_GROWTH_REVIEW_REQUESTED', 'ReviewRequest', {
        entityId: reviewRequest.id,
        changes: { patientId, platform, channel, scheduledFor: scheduledTime },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        requestId: reviewRequest.id,
        patientId,
        platform,
        sentVia: channel,
        scheduledAt: scheduledTime,
        reviewUrl,
        message,
        status: reviewRequest.status,
      } as ReviewRequestResult & { message: { subject?: string; body: string }; status: string };
    }),

  /**
   * Identify satisfied patients who are good candidates for review requests
   */
  identifySatisfiedPatients: protectedProcedure
    .input(identifySatisfiedPatientsInputSchema)
    .query(async ({ ctx, input }) => {
      const {
        minVisits,
        minDaysSinceLastVisit,
        maxDaysSinceLastVisit,
        excludeRecentlyRequested,
        recentRequestDays,
        limit,
      } = input;

      const now = new Date();
      const minDate = new Date(now.getTime() - maxDaysSinceLastVisit * 24 * 60 * 60 * 1000);
      const maxDate = new Date(now.getTime() - minDaysSinceLastVisit * 24 * 60 * 60 * 1000);

      // Get patients with recent completed appointments
      const patients = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
          appointments: {
            some: {
              status: 'COMPLETED',
              endTime: {
                gte: minDate,
                lte: maxDate,
              },
            },
          },
        },
        include: {
          demographics: true,
          appointments: {
            where: { status: 'COMPLETED' },
            orderBy: { endTime: 'desc' },
            take: 20,
          },
        },
        take: limit * 3, // Get extra to filter
      });

      const candidates: ReviewCandidate[] = [];

      for (const patient of patients) {
        // Check for recent review requests if needed
        if (excludeRecentlyRequested) {
          const recentRequest = await ctx.prisma.reviewRequest.findFirst({
            where: {
              patientId: patient.id,
              createdAt: { gte: new Date(now.getTime() - recentRequestDays * 24 * 60 * 60 * 1000) },
            },
          });
          if (recentRequest) continue;
        }

        // Check min visits
        if (patient.appointments.length < minVisits) {
          continue;
        }

        const lastVisit = patient.appointments[0];
        if (!lastVisit) continue;

        // Calculate satisfaction score
        const satisfactionScore = calculatePatientSatisfactionScore(
          patient.appointments.length,
          patient.appointments.map(a => ({ status: a.status, rating: null })),
          false, // Would need to check for complaints
        );

        // Only include patients with high satisfaction
        if (satisfactionScore < 60) continue;

        // Check if already reviewed
        const hasReviewed = await ctx.prisma.reviewRequest.findFirst({
          where: {
            patientId: patient.id,
            status: 'REVIEWED',
          },
        });

        const optimalTime = calculateOptimalReviewRequestTime(lastVisit.endTime || new Date(), null);

        const reasoning: string[] = [];
        if (patient.appointments.length >= 5) reasoning.push('Loyal patient with multiple visits');
        if (satisfactionScore >= 80) reasoning.push('High satisfaction score');
        if (!hasReviewed) reasoning.push('Has not left a review yet');

        const patientName = patient.demographics
          ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
          : `Patient ${patient.mrn}`;

        candidates.push({
          patientId: patient.id,
          patientName,
          satisfactionScore,
          lastVisitDate: lastVisit.endTime || lastVisit.startTime,
          totalVisits: patient.appointments.length,
          hasReviewedBefore: !!hasReviewed,
          recommendedPlatform: 'GOOGLE', // Default to Google as primary
          optimalRequestTime: optimalTime,
          reasoning,
        });
      }

      // Sort by satisfaction score and return top candidates
      candidates.sort((a, b) => b.satisfactionScore - a.satisfactionScore);

      return {
        candidates: candidates.slice(0, limit),
        totalEligible: candidates.length,
        criteria: {
          minVisits,
          minDaysSinceLastVisit,
          maxDaysSinceLastVisit,
          excludeRecentlyRequested,
        },
      };
    }),

  /**
   * Get review requests with filtering
   */
  getReviewRequests: protectedProcedure
    .input(getReviewRequestsInputSchema)
    .query(async ({ ctx, input }) => {
      const { status, platform, startDate, endDate, limit, offset } = input;

      const where: Prisma.ReviewRequestWhereInput = {
        patient: {
          organizationId: ctx.user.organizationId,
        },
        ...(status && { status }),
        ...(platform && { platform }),
        ...(startDate && { createdAt: { gte: startDate } }),
        ...(endDate && { createdAt: { lte: endDate } }),
      };

      const [requests, total] = await Promise.all([
        ctx.prisma.reviewRequest.findMany({
          where,
          include: {
            patient: {
              select: {
                id: true,
                mrn: true,
                demographics: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
                contacts: {
                  where: { isPrimary: true },
                  select: {
                    email: true,
                    mobilePhone: true,
                    homePhone: true,
                  },
                  take: 1,
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.reviewRequest.count({ where }),
      ]);

      // Calculate stats
      const stats = await ctx.prisma.reviewRequest.groupBy({
        by: ['status'],
        where: {
          patient: { organizationId: ctx.user.organizationId },
          createdAt: startDate ? { gte: startDate } : undefined,
        },
        _count: true,
      });

      const statsByStatus: Record<string, number> = {};
      for (const stat of stats) {
        statsByStatus[stat.status] = stat._count;
      }

      const sent = statsByStatus['SENT'] || 0;
      const clicked = statsByStatus['CLICKED'] || 0;
      const reviewed = statsByStatus['REVIEWED'] || 0;

      return {
        requests,
        total,
        limit,
        offset,
        hasMore: offset + requests.length < total,
        stats: {
          ...statsByStatus,
          clickRate: sent > 0 ? clicked / sent : 0,
          conversionRate: sent > 0 ? reviewed / sent : 0,
        },
      };
    }),

  /**
   * Update platform metrics (from monitoring)
   */
  updatePlatformMetrics: adminProcedure
    .input(updatePlatformMetricsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        platform,
        averageRating,
        totalReviews,
        newReviewsCount,
        responseRate,
        ratingBreakdown,
        sentimentScore,
        platformUrl,
      } = input;

      // Get existing metrics for comparison
      const existingMetric = await ctx.prisma.reputationMetric.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          platform,
        },
        orderBy: { snapshotDate: 'desc' },
      });

      // Calculate new reviews count if not provided
      const calculatedNewReviews = newReviewsCount ?? (existingMetric
        ? totalReviews - existingMetric.totalReviews
        : 0);

      // Check for negative reviews (decrease in rating or new low ratings)
      const hasNewNegative = ratingBreakdown
        ? (ratingBreakdown.oneStar + ratingBreakdown.twoStar) >
          (existingMetric
            ? (existingMetric.oneStarCount + existingMetric.twoStarCount)
            : 0)
        : false;

      // Create new metric snapshot
      const metric = await ctx.prisma.reputationMetric.create({
        data: {
          organizationId: ctx.user.organizationId,
          platform,
          platformUrl,
          averageRating,
          totalReviews,
          newReviewsCount: Math.max(0, calculatedNewReviews),
          responseRate,
          fiveStarCount: ratingBreakdown?.fiveStar || 0,
          fourStarCount: ratingBreakdown?.fourStar || 0,
          threeStarCount: ratingBreakdown?.threeStar || 0,
          twoStarCount: ratingBreakdown?.twoStar || 0,
          oneStarCount: ratingBreakdown?.oneStar || 0,
          sentimentScore,
          hasNewNegative,
          snapshotDate: new Date(),
        },
      });

      await auditLog('AI_GROWTH_METRICS_UPDATED', 'ReputationMetric', {
        entityId: metric.id,
        changes: { platform, averageRating, totalReviews, hasNewNegative },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        metric,
        changes: existingMetric
          ? {
              ratingChange: Number(averageRating) - Number(existingMetric.averageRating),
              newReviews: calculatedNewReviews,
              hasNewNegative,
            }
          : null,
      };
    }),

  /**
   * Get platform metrics (current and historical)
   */
  getPlatformMetrics: protectedProcedure
    .input(getPlatformMetricsInputSchema)
    .query(async ({ ctx, input }) => {
      const { platform, includeHistory, historyDays } = input;

      const where: Prisma.ReputationMetricWhereInput = {
        organizationId: ctx.user.organizationId,
        ...(platform && { platform }),
      };

      // Get latest metrics for each platform
      const latestMetrics = await ctx.prisma.reputationMetric.findMany({
        where,
        orderBy: { snapshotDate: 'desc' },
        distinct: ['platform'],
      });

      // Get historical data if requested
      let history: any[] = [];
      if (includeHistory) {
        const historyStartDate = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000);
        history = await ctx.prisma.reputationMetric.findMany({
          where: {
            ...where,
            snapshotDate: { gte: historyStartDate },
          },
          orderBy: { snapshotDate: 'asc' },
        });
      }

      // Transform to PlatformMetrics format
      const metrics: PlatformMetrics[] = latestMetrics.map(m => {
        // Calculate trend from history
        const platformHistory = history.filter(h => h.platform === m.platform);
        let trend: 'improving' | 'stable' | 'declining' = 'stable';

        if (platformHistory.length >= 2) {
          const oldest = platformHistory[0];
          const ratingChange = Number(m.averageRating) - Number(oldest.averageRating);
          if (ratingChange > 0.1) trend = 'improving';
          else if (ratingChange < -0.1) trend = 'declining';
        }

        return {
          platform: m.platform,
          averageRating: Number(m.averageRating),
          totalReviews: m.totalReviews,
          newReviewsCount: m.newReviewsCount,
          responseRate: Number(m.responseRate) || 0,
          sentimentScore: Number(m.sentimentScore) || 0,
          ratingBreakdown: {
            fiveStar: m.fiveStarCount,
            fourStar: m.fourStarCount,
            threeStar: m.threeStarCount,
            twoStar: m.twoStarCount,
            oneStar: m.oneStarCount,
          },
          trend,
          competitorComparison: m.competitorAverage ? Number(m.competitorAverage) : null,
        };
      });

      return {
        metrics,
        history: includeHistory ? history : undefined,
        lastUpdated: latestMetrics[0]?.snapshotDate || null,
      };
    }),

  /**
   * Alert on negative review
   */
  alertNegativeReview: protectedProcedure
    .input(alertNegativeReviewInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { platform, rating, reviewContent, reviewerName, reviewDate, reviewUrl } = input;

      // Determine severity
      let severity: 'critical' | 'warning' | 'notice' = 'notice';
      if (rating === 1) severity = 'critical';
      else if (rating === 2) severity = 'warning';

      // Generate response suggestions
      const suggestions = generateReviewResponseSuggestions(
        rating,
        reviewContent || '',
        reviewerName || null,
        'Your Practice', // Would get actual name from org
        rating <= 2 ? 'apologetic' : 'empathetic',
      );

      // Get organization settings for notification preferences
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Update reputation metrics to flag negative review
      await ctx.prisma.reputationMetric.updateMany({
        where: {
          organizationId: ctx.user.organizationId,
          platform: platform.toLowerCase(),
        },
        data: {
          hasNewNegative: true,
          unrepliedCount: { increment: 1 },
        },
      });

      await auditLog('AI_GROWTH_NEGATIVE_REVIEW_ALERT', 'ReputationMetric', {
        changes: { platform, rating, severity, reviewContent },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      const alert: NegativeReviewAlert = {
        id: `alert_${Date.now()}`,
        platform,
        rating,
        reviewDate: reviewDate || new Date(),
        severity,
        requiresResponse: rating <= 3,
        suggestedResponses: [suggestions.response],
        escalatedTo: severity === 'critical' ? 'admin' : null,
      };

      return {
        alert,
        suggestions,
        organizationName: org?.name || 'Unknown',
        reviewUrl,
      };
    }),

  /**
   * Get review response suggestions
   */
  getReviewResponseSuggestion: protectedProcedure
    .input(getReviewResponseSuggestionInputSchema)
    .query(async ({ ctx, input }) => {
      const { platform, rating, reviewContent, reviewerName, tone } = input;

      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      const practiceName = org?.name || 'Our Practice';

      // Generate suggestions for multiple tones
      const tones: Array<'professional' | 'empathetic' | 'apologetic' | 'grateful'> =
        rating >= 4
          ? ['grateful', 'professional']
          : rating === 3
            ? ['empathetic', 'professional']
            : ['apologetic', 'empathetic'];

      const suggestions = tones.map(t =>
        generateReviewResponseSuggestions(rating, reviewContent, reviewerName || null, practiceName, t),
      );

      // If a specific tone was requested, put it first
      if (tone) {
        const requested = suggestions.find(s => s.tone === tone);
        if (requested) {
          const others = suggestions.filter(s => s.tone !== tone);
          return {
            primary: requested,
            alternatives: others,
            guidelines: {
              dos: requested.keyPoints,
              donts: requested.avoidTopics,
              platformSpecific: getPlatformGuidelines(platform),
            },
          };
        }
      }

      return {
        primary: suggestions[0],
        alternatives: suggestions.slice(1),
        guidelines: {
          dos: suggestions[0].keyPoints,
          donts: suggestions[0].avoidTopics,
          platformSpecific: getPlatformGuidelines(platform),
        },
      };
    }),

  /**
   * Get overall reputation score and analysis
   */
  getReputationScore: protectedProcedure
    .input(getReputationScoreInputSchema)
    .query(async ({ ctx, input }) => {
      const { includeRecommendations, includeTrends } = input;

      // Get latest metrics for all platforms
      const latestMetrics = await ctx.prisma.reputationMetric.findMany({
        where: { organizationId: ctx.user.organizationId },
        orderBy: { snapshotDate: 'desc' },
        distinct: ['platform'],
      });

      const score = calculateReputationScore(
        latestMetrics.map(m => ({
          platform: m.platform,
          averageRating: Number(m.averageRating),
          totalReviews: m.totalReviews,
          responseRate: m.responseRate ? Number(m.responseRate) : null,
          sentimentScore: m.sentimentScore ? Number(m.sentimentScore) : null,
        })),
      );

      // Get trend data if requested
      let trends = null;
      if (includeTrends) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const oldestMetrics = await ctx.prisma.reputationMetric.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            snapshotDate: { lte: thirtyDaysAgo },
          },
          orderBy: { snapshotDate: 'asc' },
          distinct: ['platform'],
        });

        if (oldestMetrics.length > 0) {
          const oldScore = calculateReputationScore(
            oldestMetrics.map(m => ({
              platform: m.platform,
              averageRating: Number(m.averageRating),
              totalReviews: m.totalReviews,
              responseRate: m.responseRate ? Number(m.responseRate) : null,
              sentimentScore: m.sentimentScore ? Number(m.sentimentScore) : null,
            })),
          );

          const scoreDiff = score.overallScore - oldScore.overallScore;
          score.trend = scoreDiff > 5 ? 'improving' : scoreDiff < -5 ? 'declining' : 'stable';

          trends = {
            scoreChange: scoreDiff,
            reviewsGained: latestMetrics.reduce((sum, m) => sum + m.totalReviews, 0) -
              oldestMetrics.reduce((sum, m) => sum + m.totalReviews, 0),
            ratingChange: latestMetrics.reduce((sum, m) => sum + Number(m.averageRating), 0) / (latestMetrics.length || 1) -
              oldestMetrics.reduce((sum, m) => sum + Number(m.averageRating), 0) / (oldestMetrics.length || 1),
          };
        }
      }

      return {
        score,
        platforms: latestMetrics.map(m => ({
          platform: m.platform,
          score: score.platformScores[m.platform.toLowerCase()] || 0,
          rating: Number(m.averageRating),
          reviews: m.totalReviews,
          hasUnrepliedReviews: m.unrepliedCount > 0,
          needsAttention: m.hasNewNegative || Number(m.averageRating) < 4,
        })),
        trends,
        lastUpdated: latestMetrics[0]?.snapshotDate || null,
      };
    }),

  /**
   * Get reputation trends over time
   */
  getReputationTrends: protectedProcedure
    .input(getReputationTrendsInputSchema)
    .query(async ({ ctx, input }) => {
      const { days, platform } = input;

      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const metrics = await ctx.prisma.reputationMetric.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          snapshotDate: { gte: startDate },
          ...(platform && { platform }),
        },
        orderBy: { snapshotDate: 'asc' },
      });

      // Group by date and platform
      const groupedData: Record<string, Record<string, { rating: number; reviews: number }>> = {};

      for (const metric of metrics) {
        const dateKey = metric.snapshotDate.toISOString().split('T')[0];
        if (!groupedData[dateKey]) {
          groupedData[dateKey] = {};
        }
        groupedData[dateKey][metric.platform] = {
          rating: Number(metric.averageRating),
          reviews: metric.totalReviews,
        };
      }

      // Calculate overall trend
      const sortedDates = Object.keys(groupedData).sort();
      const firstDate = sortedDates[0];
      const lastDate = sortedDates[sortedDates.length - 1];

      let overallTrend: 'improving' | 'stable' | 'declining' = 'stable';
      if (firstDate && lastDate && firstDate !== lastDate) {
        const firstMetrics = groupedData[firstDate];
        const lastMetrics = groupedData[lastDate];

        const firstAvg = Object.values(firstMetrics).reduce((sum, m) => sum + m.rating, 0) /
          Object.values(firstMetrics).length;
        const lastAvg = Object.values(lastMetrics).reduce((sum, m) => sum + m.rating, 0) /
          Object.values(lastMetrics).length;

        if (lastAvg - firstAvg > 0.1) overallTrend = 'improving';
        else if (lastAvg - firstAvg < -0.1) overallTrend = 'declining';
      }

      return {
        data: groupedData,
        dateRange: { start: startDate, end: new Date() },
        overallTrend,
        dataPoints: metrics.length,
      };
    }),

  /**
   * Bulk request reviews from multiple patients
   */
  bulkRequestReviews: adminProcedure
    .input(bulkRequestReviewsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { patientIds, platform, channel, spreadOverDays } = input;

      const results = {
        total: patientIds.length,
        scheduled: 0,
        skipped: 0,
        errors: 0,
        requests: [] as Array<{ patientId: string; scheduledAt: Date; status: string }>,
      };

      // Calculate time slots
      const now = new Date();
      const hoursPerRequest = (spreadOverDays * 24) / patientIds.length;

      for (let i = 0; i < patientIds.length; i++) {
        const patientId = patientIds[i];

        try {
          // Check for recent requests
          const recentRequest = await ctx.prisma.reviewRequest.findFirst({
            where: {
              patientId,
              createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
              status: { notIn: ['DECLINED', 'FAILED'] },
            },
          });

          if (recentRequest) {
            results.skipped++;
            continue;
          }

          // Schedule the request
          const scheduledAt = new Date(now.getTime() + i * hoursPerRequest * 60 * 60 * 1000);
          // Set to 10 AM if scheduled for future day
          if (scheduledAt.getDate() !== now.getDate()) {
            scheduledAt.setHours(10, 0, 0, 0);
          }

          const reviewRequest = await ctx.prisma.reviewRequest.create({
            data: {
              patientId,
              organizationId: ctx.user.organizationId,
              platform: platform as any,
              status: 'PENDING',
              sentVia: channel,
              scheduledFor: scheduledAt,
            },
          });

          results.scheduled++;
          results.requests.push({
            patientId,
            scheduledAt,
            status: 'PENDING',
          });
        } catch (error) {
          results.errors++;
        }
      }

      await auditLog('AI_GROWTH_BULK_REVIEW_REQUEST', 'ReviewRequest', {
        changes: { total: results.total, scheduled: results.scheduled, skipped: results.skipped },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return results;
    }),

  /**
   * Acknowledge/respond to negative review alert
   */
  acknowledgeNegativeReview: protectedProcedure
    .input(acknowledgeNegativeReviewInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { alertId, action, responseContent, escalateTo, notes } = input;

      // In a real system, this would update an alerts table
      // For now, we'll update the reputation metrics and log the action

      // Clear the negative flag if responded
      if (action === 'responded') {
        await ctx.prisma.reputationMetric.updateMany({
          where: {
            organizationId: ctx.user.organizationId,
            hasNewNegative: true,
          },
          data: {
            hasNewNegative: false,
            unrepliedCount: { decrement: 1 },
          },
        });
      }

      await auditLog('AI_GROWTH_REVIEW_ALERT_ACTION', 'ReputationMetric', {
        entityId: alertId,
        changes: { action, responseContent: responseContent?.substring(0, 100), escalateTo, notes },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        action,
        alertId,
        message: action === 'responded'
          ? 'Review response recorded'
          : action === 'escalated'
            ? `Escalated to ${escalateTo}`
            : action === 'acknowledged'
              ? 'Alert acknowledged'
              : 'Alert dismissed',
      };
    }),

  // ============================================
  // US-359: Referral Optimization Procedures
  // ============================================

  /**
   * Identify potential referrers based on NPS, satisfaction, and behavior
   */
  identifyReferrers: protectedProcedure
    .input(identifyReferrersInputSchema)
    .query(async ({ ctx, input }) => {
      const {
        minNpsScore,
        minVisits,
        minSatisfactionScore,
        excludeRecentlyContacted,
        recentContactDays,
        limit,
        sortBy,
      } = input;

      // Get patients with sufficient visit history
      const patients = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
        },
        include: {
          demographics: true,
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
          appointments: {
            where: { status: 'COMPLETED' },
            orderBy: { startTime: 'desc' },
            take: 20,
          },
          referralOpportunities: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      const now = new Date();
      const recentContactCutoff = new Date(now);
      recentContactCutoff.setDate(recentContactCutoff.getDate() - recentContactDays);

      const candidates: ReferralCandidate[] = [];

      for (const patient of patients) {
        const visitCount = patient.appointments.length;
        if (visitCount < minVisits) continue;

        // Check if recently contacted
        const lastOpportunity = patient.referralOpportunities[0];
        if (
          excludeRecentlyContacted &&
          lastOpportunity?.outreachDate &&
          lastOpportunity.outreachDate > recentContactCutoff
        ) {
          continue;
        }

        // Calculate consecutive visits (no missed appointments)
        let consecutiveVisits = 0;
        for (let i = 0; i < patient.appointments.length; i++) {
          const apt = patient.appointments[i];
          if (apt.status === 'COMPLETED') {
            consecutiveVisits++;
          } else {
            break;
          }
        }

        // Get review data (simplified - would check review requests)
        const hasLeftReview = lastOpportunity?.hasLeftReview || false;
        const reviewRating = lastOpportunity?.reviewRating || null;
        const previousReferrals = lastOpportunity?.previousReferrals || 0;
        const treatmentSuccess = lastOpportunity?.treatmentSuccess || null;

        // Calculate completion rate
        const completedCount = patient.appointments.filter(a => a.status === 'COMPLETED').length;
        const completionRate = patient.appointments.length > 0 ? completedCount / patient.appointments.length : 0;

        // Calculate NPS score
        const existingNps = lastOpportunity?.npsScore;
        const npsScore = existingNps ?? calculateBehavioralNpsScore(
          visitCount,
          consecutiveVisits,
          hasLeftReview,
          reviewRating,
          previousReferrals,
          completionRate,
          treatmentSuccess,
        );

        if (npsScore < minNpsScore) continue;

        // Calculate referral score
        const firstVisit = patient.appointments[patient.appointments.length - 1];
        const tenure = firstVisit
          ? Math.floor((now.getTime() - new Date(firstVisit.startTime).getTime()) / (1000 * 60 * 60 * 24 * 30))
          : 0;

        const { score: referralScore, factors: scoreFactors } = calculateReferralScore(
          npsScore,
          visitCount,
          previousReferrals,
          hasLeftReview,
          reviewRating,
          treatmentSuccess,
          tenure,
        );

        // Calculate satisfaction score
        const satisfactionScore = calculatePatientSatisfactionScore(
          visitCount,
          patient.appointments.map(a => ({ status: a.status, rating: null })),
          false,
        );

        if (satisfactionScore < minSatisfactionScore) continue;

        // Calculate optimal outreach
        const lastVisit = patient.appointments[0];
        const optimalOutreachDate = calculateOptimalReferralOutreachDate(
          lastVisit ? new Date(lastVisit.startTime) : null,
          lastOpportunity?.outreachDate || null,
        );

        // Get contact info from demographics and contacts
        const email = patient.contacts[0]?.email || null;
        const phone = patient.contacts[0]?.mobilePhone || patient.contacts[0]?.homePhone || null;
        const firstName = patient.demographics?.firstName || 'Unknown';
        const lastName = patient.demographics?.lastName || 'Patient';

        // Determine optimal channel
        let optimalChannel: 'email' | 'sms' | 'in_person' = 'email';
        if (!email && phone) optimalChannel = 'sms';
        if (npsScore >= 9 && visitCount >= 10) optimalChannel = 'in_person'; // High value patients

        // Generate reasoning
        const reasoning: string[] = [];
        if (npsScore >= 9) reasoning.push('Promoter NPS score (9-10)');
        else if (npsScore >= 8) reasoning.push('High NPS score (8)');
        if (visitCount >= 10) reasoning.push(`Highly engaged patient (${visitCount} visits)`);
        if (previousReferrals > 0) reasoning.push(`Previous referrer (${previousReferrals} referrals)`);
        if (hasLeftReview && reviewRating && reviewRating >= 4) reasoning.push('Left positive review');
        if (treatmentSuccess) reasoning.push('Successful treatment outcomes');
        if (consecutiveVisits >= 5) reasoning.push('Consistently attends appointments');

        candidates.push({
          patientId: patient.id,
          patientName: `${firstName} ${lastName}`,
          email,
          phone,
          npsScore,
          referralScore,
          satisfactionScore,
          loyaltyScore: Math.floor((visitCount / 10) * 100), // Simple loyalty calculation
          visitCount,
          consecutiveVisits,
          previousReferrals,
          hasLeftReview,
          reviewRating,
          lastVisitDate: lastVisit ? new Date(lastVisit.startTime) : null,
          optimalOutreachDate,
          optimalChannel,
          scoreFactors: scoreFactors as ReferralCandidate['scoreFactors'],
          reasoning,
        });
      }

      // Sort candidates
      const sortFunctions: Record<string, (a: ReferralCandidate, b: ReferralCandidate) => number> = {
        referral_score: (a, b) => b.referralScore - a.referralScore,
        nps_score: (a, b) => b.npsScore - a.npsScore,
        visit_count: (a, b) => b.visitCount - a.visitCount,
        previous_referrals: (a, b) => b.previousReferrals - a.previousReferrals,
      };
      candidates.sort(sortFunctions[sortBy] || sortFunctions.referral_score);

      return {
        candidates: candidates.slice(0, limit),
        total: candidates.length,
        criteria: {
          minNpsScore,
          minVisits,
          minSatisfactionScore,
        },
      };
    }),

  /**
   * Calculate or update NPS score for a patient
   */
  calculateNpsScore: protectedProcedure
    .input(calculateNpsScoreInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { patientId, surveyResponse, calculateFromBehavior } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          appointments: {
            where: { status: 'COMPLETED' },
          },
          referralOpportunities: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      }

      let npsScore: number;
      let source: 'survey' | 'behavioral';

      if (surveyResponse !== undefined) {
        npsScore = surveyResponse;
        source = 'survey';
      } else if (calculateFromBehavior) {
        const existingOpportunity = patient.referralOpportunities[0];
        const visitCount = patient.appointments.length;
        const completedCount = patient.appointments.filter(a => a.status === 'COMPLETED').length;
        const completionRate = patient.appointments.length > 0 ? completedCount / patient.appointments.length : 0;

        npsScore = calculateBehavioralNpsScore(
          visitCount,
          existingOpportunity?.consecutiveVisits || 0,
          existingOpportunity?.hasLeftReview || false,
          existingOpportunity?.reviewRating || null,
          existingOpportunity?.previousReferrals || 0,
          completionRate,
          existingOpportunity?.treatmentSuccess || null,
        );
        source = 'behavioral';
      } else {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Either surveyResponse or calculateFromBehavior must be provided',
        });
      }

      // Determine NPS category
      const category = npsScore >= 9 ? 'promoter' : npsScore >= 7 ? 'passive' : 'detractor';

      // Upsert referral opportunity
      const existingOpportunity = patient.referralOpportunities[0];
      if (existingOpportunity) {
        await ctx.prisma.referralOpportunity.update({
          where: { id: existingOpportunity.id },
          data: {
            npsScore,
            lastAnalyzed: new Date(),
          },
        });
      } else {
        await ctx.prisma.referralOpportunity.create({
          data: {
            patientId,
            organizationId: ctx.user.organizationId,
            npsScore,
            visitCount: patient.appointments.length,
            lastAnalyzed: new Date(),
          },
        });
      }

      await auditLog('AI_GROWTH_NPS_CALCULATED', 'ReferralOpportunity', {
        entityId: patientId,
        changes: { npsScore, source, category },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        patientId,
        npsScore,
        source,
        category,
        recommendations:
          category === 'promoter'
            ? ['Perfect referral candidate', 'Request a review', 'Enroll in referral program']
            : category === 'passive'
              ? ['Follow up to improve experience', 'Ask for feedback', 'Address any concerns']
              : ['Urgent attention needed', 'Personal outreach recommended', 'Service recovery process'],
      };
    }),

  /**
   * Promote referral program to selected patients
   */
  promoteReferralProgram: protectedProcedure
    .input(promoteReferralProgramInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { patientIds, programId, channel, customMessage, spreadOverDays } = input;

      // Get active referral program
      const program = programId
        ? await ctx.prisma.referralProgram.findFirst({
            where: { id: programId, organizationId: ctx.user.organizationId },
          })
        : await ctx.prisma.referralProgram.findFirst({
            where: { organizationId: ctx.user.organizationId, isActive: true },
            orderBy: { createdAt: 'desc' },
          });

      if (!program) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active referral program found',
        });
      }

      // Get organization info
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Get patients
      const patients = await ctx.prisma.patient.findMany({
        where: {
          id: { in: patientIds },
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      });

      const results: {
        total: number;
        scheduled: number;
        skipped: number;
        errors: number;
        promotions: ReferralPromotion[];
      } = {
        total: patientIds.length,
        scheduled: 0,
        skipped: 0,
        errors: 0,
        promotions: [],
      };

      const now = new Date();
      const msPerSlot = (spreadOverDays * 24 * 60 * 60 * 1000) / patients.length;

      for (let i = 0; i < patients.length; i++) {
        const patient = patients[i];
        const patientEmail = patient.contacts[0]?.email;
        const patientPhone = patient.contacts[0]?.mobilePhone || patient.contacts[0]?.homePhone;
        const patientFirstName = patient.demographics?.firstName;

        // Check contact preference
        if (channel === 'email' && !patientEmail) {
          results.skipped++;
          continue;
        }
        if (channel === 'sms' && !patientPhone) {
          results.skipped++;
          continue;
        }

        try {
          // Generate unique referral code
          const referralCode = `${patientFirstName?.substring(0, 3).toUpperCase() || 'REF'}${Date.now().toString(36).toUpperCase()}`;

          // Calculate send time
          const scheduledAt = new Date(now.getTime() + i * msPerSlot);
          scheduledAt.setHours(10, 0, 0, 0); // 10 AM

          // Format reward info
          const referrerReward =
            program.referrerRewardType === 'CREDIT'
              ? `$${program.referrerRewardValue} store credit`
              : program.referrerRewardType === 'DISCOUNT_PERCENT'
                ? `${program.referrerRewardValue}% off`
                : `$${program.referrerRewardValue}`;

          const refereeReward = program.refereeRewardType
            ? program.refereeRewardType === 'CREDIT'
              ? `$${program.refereeRewardValue} credit`
              : program.refereeRewardType === 'DISCOUNT_PERCENT'
                ? `${program.refereeRewardValue}% off`
                : `$${program.refereeRewardValue}`
            : null;

          // Generate message
          const message =
            customMessage !== undefined
              ? { subject: 'Referral Program Invitation', body: customMessage }
              : generateReferralProgramMessage(
                  patientFirstName || 'Patient',
                  org?.name || 'Our Practice',
                  referralCode,
                  referrerReward,
                  refereeReward,
                  channel,
                );

          // Create referral record
          await ctx.prisma.referral.create({
            data: {
              referralCode,
              referrerId: patient.id,
              programId: program.id,
              organizationId: ctx.user.organizationId,
              status: 'PENDING',
              expiresAt: program.expirationDays
                ? new Date(now.getTime() + program.expirationDays * 24 * 60 * 60 * 1000)
                : null,
            },
          });

          results.scheduled++;
          results.promotions.push({
            patientId: patient.id,
            programId: program.id,
            channel,
            message,
            scheduledAt,
            referralCode,
          });
        } catch (error) {
          results.errors++;
        }
      }

      await auditLog('AI_GROWTH_REFERRAL_PROGRAM_PROMOTED', 'ReferralProgram', {
        entityId: program.id,
        changes: { total: results.total, scheduled: results.scheduled, channel },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return results;
    }),

  /**
   * Get referral sources and analytics
   */
  getReferralSources: protectedProcedure
    .input(getReferralSourcesInputSchema)
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, includeDetails } = input;

      const whereClause: Prisma.ReferralWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = startDate;
        if (endDate) whereClause.createdAt.lte = endDate;
      }

      const referrals = await ctx.prisma.referral.findMany({
        where: whereClause,
        include: {
          referrer: {
            include: {
              demographics: true,
            },
          },
          referee: true,
          program: true,
        },
      });

      // Group by source (simplified - using program name as source)
      const sourceMap = new Map<string, ReferralSource>();

      for (const referral of referrals) {
        const source = referral.program?.name || 'Direct';
        const existing = sourceMap.get(source) || {
          source,
          totalReferrals: 0,
          convertedReferrals: 0,
          conversionRate: 0,
          totalValue: 0,
          averageValue: 0,
          topReferrers: [],
        };

        existing.totalReferrals++;
        if (referral.status === 'COMPLETED') {
          existing.convertedReferrals++;
          if (referral.referrerRewardAmount) {
            existing.totalValue += Number(referral.referrerRewardAmount);
          }
        }

        // Track top referrers
        if (includeDetails && referral.referrer) {
          const referrerIndex = existing.topReferrers.findIndex(r => r.patientId === referral.referrerId);
          const referrerName = `${referral.referrer.demographics?.firstName || 'Unknown'} ${referral.referrer.demographics?.lastName || 'Patient'}`;
          if (referrerIndex >= 0) {
            existing.topReferrers[referrerIndex].referralCount++;
            if (referral.status === 'COMPLETED') {
              existing.topReferrers[referrerIndex].convertedCount++;
            }
          } else {
            existing.topReferrers.push({
              patientId: referral.referrerId,
              patientName: referrerName,
              referralCount: 1,
              convertedCount: referral.status === 'COMPLETED' ? 1 : 0,
            });
          }
        }

        sourceMap.set(source, existing);
      }

      // Calculate rates and sort
      const sources = Array.from(sourceMap.values()).map(source => ({
        ...source,
        conversionRate: source.totalReferrals > 0 ? source.convertedReferrals / source.totalReferrals : 0,
        averageValue: source.convertedReferrals > 0 ? source.totalValue / source.convertedReferrals : 0,
        topReferrers: source.topReferrers.sort((a, b) => b.referralCount - a.referralCount).slice(0, 5),
      }));

      sources.sort((a, b) => b.totalReferrals - a.totalReferrals);

      return {
        sources,
        summary: {
          totalReferrals: referrals.length,
          totalConverted: referrals.filter(r => r.status === 'COMPLETED').length,
          overallConversionRate:
            referrals.length > 0
              ? referrals.filter(r => r.status === 'COMPLETED').length / referrals.length
              : 0,
          totalValue: sources.reduce((sum, s) => sum + s.totalValue, 0),
        },
      };
    }),

  /**
   * Track a new referral
   */
  trackReferral: protectedProcedure
    .input(trackReferralInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { referrerId, refereeName, refereeEmail, refereePhone, refereeNotes, programId, source } = input;

      // Get referrer
      const referrer = await ctx.prisma.patient.findFirst({
        where: {
          id: referrerId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!referrer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Referrer patient not found' });
      }

      // Get program
      const program = programId
        ? await ctx.prisma.referralProgram.findFirst({
            where: { id: programId, organizationId: ctx.user.organizationId },
          })
        : await ctx.prisma.referralProgram.findFirst({
            where: { organizationId: ctx.user.organizationId, isActive: true },
            orderBy: { createdAt: 'desc' },
          });

      if (!program) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active referral program found' });
      }

      // Generate referral code
      const referralCode = `REF${Date.now().toString(36).toUpperCase()}`;

      // Create referral
      const referral = await ctx.prisma.referral.create({
        data: {
          referralCode,
          referrerId,
          programId: program.id,
          organizationId: ctx.user.organizationId,
          status: 'PENDING',
          refereeName,
          refereeEmail,
          refereePhone,
          refereeNotes,
          utmSource: source,
          expiresAt: program.expirationDays
            ? new Date(Date.now() + program.expirationDays * 24 * 60 * 60 * 1000)
            : null,
        },
      });

      // Update referrer's referral opportunity stats
      await ctx.prisma.referralOpportunity.updateMany({
        where: {
          patientId: referrerId,
          organizationId: ctx.user.organizationId,
        },
        data: {
          previousReferrals: { increment: 1 },
          lastReferralDate: new Date(),
          referralMade: true,
        },
      });

      await auditLog('AI_GROWTH_REFERRAL_TRACKED', 'Referral', {
        entityId: referral.id,
        changes: { referrerId, refereeName, source },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        referralId: referral.id,
        referralCode,
        referrerId,
        refereeName,
        programId: program.id,
        status: 'PENDING',
        expiresAt: referral.expiresAt,
      };
    }),

  /**
   * Send thank you message to referrer
   */
  sendReferralThankYou: protectedProcedure
    .input(sendReferralThankYouInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { referralId, channel, customMessage, includeRewardInfo } = input;

      const referral = await ctx.prisma.referral.findFirst({
        where: {
          id: referralId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          referrer: {
            include: {
              demographics: true,
            },
          },
          referee: {
            include: {
              demographics: true,
            },
          },
          program: true,
        },
      });

      if (!referral) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Referral not found' });
      }

      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Prepare reward info
      const rewardInfo =
        includeRewardInfo && referral.program
          ? {
              rewardType: referral.program.referrerRewardType,
              rewardValue: Number(referral.program.referrerRewardValue),
              rewardNote: referral.program.referrerRewardNote,
            }
          : null;

      // Generate message
      const refereeName = referral.referee?.demographics
        ? `${referral.referee.demographics.firstName} ${referral.referee.demographics.lastName}`
        : referral.refereeName || 'your friend';

      const referrerFirstName = referral.referrer.demographics?.firstName || 'Patient';

      const message =
        customMessage !== undefined
          ? { subject: 'Thank You for Your Referral!', body: customMessage }
          : generateReferralThankYouMessage(
              referrerFirstName,
              org?.name || 'Our Practice',
              refereeName,
              rewardInfo,
              channel,
            );

      await auditLog('AI_GROWTH_REFERRAL_THANKYOU_SENT', 'Referral', {
        entityId: referralId,
        changes: { channel, includeRewardInfo },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        referralId,
        patientId: referral.referrerId,
        channel,
        message,
        rewardInfo,
        sentAt: new Date(),
      };
    }),

  /**
   * Get referral incentives status
   */
  getReferralIncentives: protectedProcedure
    .input(getReferralIncentivesInputSchema)
    .query(async ({ ctx, input }) => {
      const { patientId, status, startDate, endDate, limit } = input;

      const whereClause: Prisma.ReferralWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (patientId) {
        whereClause.referrerId = patientId;
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = startDate;
        if (endDate) whereClause.createdAt.lte = endDate;
      }

      // Filter by status
      if (status) {
        if (status === 'pending') {
          whereClause.status = 'PENDING';
        } else if (status === 'qualified') {
          whereClause.qualifiedAt = { not: null };
          whereClause.referrerRewardIssued = false;
        } else if (status === 'issued') {
          whereClause.referrerRewardIssued = true;
        } else if (status === 'expired') {
          whereClause.expiresAt = { lt: new Date() };
          whereClause.referrerRewardIssued = false;
        }
      }

      const referrals = await ctx.prisma.referral.findMany({
        where: whereClause,
        include: {
          referrer: {
            include: {
              demographics: true,
            },
          },
          program: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      const incentives: ReferralIncentiveStatus[] = referrals.map(referral => ({
        patientId: referral.referrerId,
        patientName: `${referral.referrer.demographics?.firstName || 'Unknown'} ${referral.referrer.demographics?.lastName || 'Patient'}`,
        referralId: referral.id,
        referralCode: referral.referralCode,
        refereeStatus: referral.status,
        rewardEligible: referral.qualifiedAt !== null,
        rewardIssued: referral.referrerRewardIssued,
        rewardAmount: referral.referrerRewardAmount ? Number(referral.referrerRewardAmount) : null,
        rewardType: referral.program?.referrerRewardType || null,
        rewardIssuedAt: referral.referrerRewardIssuedAt,
        qualifiedAt: referral.qualifiedAt,
        expiresAt: referral.expiresAt,
      }));

      return {
        incentives,
        summary: {
          total: incentives.length,
          pending: incentives.filter(i => !i.rewardEligible && !i.rewardIssued).length,
          qualified: incentives.filter(i => i.rewardEligible && !i.rewardIssued).length,
          issued: incentives.filter(i => i.rewardIssued).length,
          totalIssued: incentives
            .filter(i => i.rewardIssued && i.rewardAmount)
            .reduce((sum, i) => sum + (i.rewardAmount || 0), 0),
        },
      };
    }),

  /**
   * Issue referral reward
   */
  issueReferralReward: protectedProcedure
    .input(issueReferralRewardInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { referralId, recipientType, rewardAmount, notes } = input;

      const referral = await ctx.prisma.referral.findFirst({
        where: {
          id: referralId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          program: true,
          referrer: true,
          referee: true,
        },
      });

      if (!referral) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Referral not found' });
      }

      const isReferrer = recipientType === 'referrer';
      const alreadyIssued = isReferrer ? referral.referrerRewardIssued : referral.refereeRewardIssued;

      if (alreadyIssued) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Reward already issued to ${recipientType}`,
        });
      }

      // Determine reward amount
      const finalAmount =
        rewardAmount ??
        (isReferrer
          ? Number(referral.program?.referrerRewardValue || 0)
          : Number(referral.program?.refereeRewardValue || 0));

      // Update referral
      const updateData: Prisma.ReferralUpdateInput = {};
      if (isReferrer) {
        updateData.referrerRewardIssued = true;
        updateData.referrerRewardAmount = finalAmount;
        updateData.referrerRewardIssuedAt = new Date();
        updateData.referrerRewardNotes = notes;
      } else {
        updateData.refereeRewardIssued = true;
        updateData.refereeRewardAmount = finalAmount;
        updateData.refereeRewardIssuedAt = new Date();
        updateData.refereeRewardNotes = notes;
      }

      // Check if both rewards are now issued
      if (
        (isReferrer && referral.refereeRewardIssued) ||
        (!isReferrer && referral.referrerRewardIssued) ||
        (!referral.program?.refereeRewardType && isReferrer)
      ) {
        updateData.status = 'COMPLETED';
        updateData.completedAt = new Date();
      }

      await ctx.prisma.referral.update({
        where: { id: referralId },
        data: updateData,
      });

      await auditLog('AI_GROWTH_REFERRAL_REWARD_ISSUED', 'Referral', {
        entityId: referralId,
        changes: { recipientType, amount: finalAmount, notes },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        referralId,
        recipientType,
        recipientId: isReferrer ? referral.referrerId : referral.refereeId,
        rewardAmount: finalAmount,
        rewardType: isReferrer
          ? referral.program?.referrerRewardType
          : referral.program?.refereeRewardType,
        issuedAt: new Date(),
      };
    }),

  /**
   * Get provider referral relationships
   */
  getProviderRelationships: protectedProcedure
    .input(getProviderRelationshipsInputSchema)
    .query(async ({ ctx, input }) => {
      const { providerType, relationshipStrength, limit } = input;

      // Get referring providers from GrowthLead source data
      // Note: Provider relationships are tracked via scoreFactors JSON field
      const leads = await ctx.prisma.growthLead.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          source: 'provider_referral',
        },
        select: {
          scoreFactors: true,
          createdAt: true,
          status: true,
        },
      });

      // Aggregate provider relationships
      const providerMap = new Map<string, {
        providerId: string;
        providerName: string;
        providerType: string;
        practice: string | null;
        referralsReceived: number;
        referralsSent: number;
        lastReferralDate: Date | null;
        lastContactDate: Date | null;
      }>();

      for (const lead of leads) {
        const details = lead.scoreFactors as Record<string, unknown> | null;
        if (!details?.providerId) continue;

        const providerId = String(details.providerId);
        const existing = providerMap.get(providerId) || {
          providerId,
          providerName: String(details.providerName || 'Unknown Provider'),
          providerType: String(details.providerType || 'MD'),
          practice: details.practice ? String(details.practice) : null,
          referralsReceived: 0,
          referralsSent: 0,
          lastReferralDate: null,
          lastContactDate: null,
        };

        existing.referralsReceived++;
        if (!existing.lastReferralDate || lead.createdAt > existing.lastReferralDate) {
          existing.lastReferralDate = lead.createdAt;
        }

        providerMap.set(providerId, existing);
      }

      const now = new Date();
      const relationships: ProviderReferralRelationship[] = Array.from(providerMap.values())
        .filter(p => !providerType || p.providerType === providerType)
        .map(provider => {
          const daysSinceLastReferral = provider.lastReferralDate
            ? Math.floor((now.getTime() - provider.lastReferralDate.getTime()) / (1000 * 60 * 60 * 24))
            : 999;
          const daysSinceLastContact = provider.lastContactDate
            ? Math.floor((now.getTime() - provider.lastContactDate.getTime()) / (1000 * 60 * 60 * 24))
            : 999;

          const strength = calculateRelationshipStrength(
            provider.referralsReceived,
            provider.referralsSent,
            provider.lastReferralDate,
            provider.lastContactDate,
          );

          return {
            ...provider,
            relationshipStrength: strength,
            nurturingActions: generateProviderNurturingActions(
              strength,
              daysSinceLastContact,
              daysSinceLastReferral,
            ),
            nextOutreachDate: new Date(now.getTime() + (strength === 'strong' ? 30 : 14) * 24 * 60 * 60 * 1000),
          };
        })
        .filter(r => !relationshipStrength || r.relationshipStrength === relationshipStrength)
        .sort((a, b) => b.referralsReceived - a.referralsReceived)
        .slice(0, limit);

      return {
        relationships,
        summary: {
          total: relationships.length,
          strong: relationships.filter(r => r.relationshipStrength === 'strong').length,
          moderate: relationships.filter(r => r.relationshipStrength === 'moderate').length,
          developing: relationships.filter(r => r.relationshipStrength === 'developing').length,
          new: relationships.filter(r => r.relationshipStrength === 'new').length,
          totalReferralsReceived: relationships.reduce((sum, r) => sum + r.referralsReceived, 0),
        },
      };
    }),

  /**
   * Nurture provider referral relationship
   */
  nurtureProviderRelationship: protectedProcedure
    .input(nurtureProviderRelationshipInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { providerId, action, customMessage, channel } = input;

      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Generate appropriate message based on action
      let subject: string;
      let body: string;

      switch (action) {
        case 'send_update':
          subject = `Patient Care Update from ${org?.name || 'Our Practice'}`;
          body =
            customMessage ||
            `Dear Colleague,\n\nWe wanted to provide you with an update on the patients you've referred to our practice. We're committed to collaborative care and keeping you informed of patient progress.\n\nPlease don't hesitate to reach out if you have any questions.\n\nBest regards,\n${org?.name || 'Our Practice'}`;
          break;
        case 'schedule_meeting':
          subject = `Meeting Request - ${org?.name || 'Our Practice'}`;
          body =
            customMessage ||
            `Dear Colleague,\n\nWe'd love to meet with you to discuss how we can better serve our shared patients. Would you be available for a brief meeting in the coming weeks?\n\nPlease let us know your availability.\n\nBest regards,\n${org?.name || 'Our Practice'}`;
          break;
        case 'send_thank_you':
          subject = `Thank You for Your Referrals - ${org?.name || 'Our Practice'}`;
          body =
            customMessage ||
            `Dear Colleague,\n\nWe wanted to express our sincere gratitude for the patients you've referred to our practice. Your trust in our care is greatly appreciated.\n\nWe're committed to providing excellent care and keeping you updated on patient progress.\n\nThank you for this collaborative relationship.\n\nBest regards,\n${org?.name || 'Our Practice'}`;
          break;
        case 'request_feedback':
          subject = `Feedback Request - ${org?.name || 'Our Practice'}`;
          body =
            customMessage ||
            `Dear Colleague,\n\nWe value your professional opinion and would appreciate any feedback on the care we've provided to your referred patients.\n\nYour insights help us continuously improve our services.\n\nThank you for your time.\n\nBest regards,\n${org?.name || 'Our Practice'}`;
          break;
        default:
          subject = `Message from ${org?.name || 'Our Practice'}`;
          body = customMessage || 'Thank you for your partnership in patient care.';
      }

      await auditLog('AI_GROWTH_PROVIDER_NURTURED', 'GrowthLead', {
        changes: { providerId, action, channel },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        providerId,
        action,
        channel,
        message: { subject, body },
        scheduledAt: new Date(),
        status: 'scheduled',
      };
    }),

  /**
   * Create new provider relationship
   */
  createProviderRelationship: protectedProcedure
    .input(createProviderRelationshipInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { providerName, providerType, practice, email, phone, address, notes } = input;

      // Store as a contact or in a custom provider tracking system
      // For now, we'll return the relationship info that would be created
      const providerId = `PROV${Date.now().toString(36).toUpperCase()}`;

      await auditLog('AI_GROWTH_PROVIDER_CREATED', 'GrowthLead', {
        changes: { providerId, providerName, providerType, practice },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        providerId,
        providerName,
        providerType,
        practice,
        email,
        phone,
        address,
        notes,
        relationshipStrength: 'new' as const,
        nurturingActions: generateProviderNurturingActions('new', 999, 999),
        createdAt: new Date(),
      };
    }),

  // ============================================
  // US-360: Patient Reactivation Procedures
  // ============================================

  /**
   * Identify reactivation candidates - Find lapsed patients who could be reactivated
   */
  identifyReactivationCandidates: protectedProcedure
    .input(identifyReactivationCandidatesInputSchema)
    .query(async ({ ctx, input }) => {
      const {
        minDaysSinceVisit,
        maxDaysSinceVisit,
        minLifetimeValue,
        minReactivationScore,
        limit,
        excludeDeclined,
        excludeRecentOutreach,
        recentOutreachDays,
      } = input;

      const now = new Date();
      const minDate = new Date(now.getTime() - minDaysSinceVisit * 24 * 60 * 60 * 1000);
      const maxDate = maxDaysSinceVisit
        ? new Date(now.getTime() - maxDaysSinceVisit * 24 * 60 * 60 * 1000)
        : new Date('1900-01-01');
      const recentOutreachCutoff = new Date(now.getTime() - recentOutreachDays * 24 * 60 * 60 * 1000);

      // Find patients with no recent appointments
      const lapsedPatients = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
          appointments: {
            some: {
              status: 'COMPLETED',
              endTime: {
                lte: minDate,
                gte: maxDate,
              },
            },
          },
          // Exclude patients with recent appointments
          NOT: {
            appointments: {
              some: {
                endTime: {
                  gte: minDate,
                },
              },
            },
          },
        },
        include: {
          demographics: true,
          appointments: {
            where: { status: 'COMPLETED' },
            orderBy: { endTime: 'desc' },
            take: 20,
          },
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
          insurances: {
            where: { isActive: true },
            take: 1,
          },
          reactivationOpportunities: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      const candidates: ReactivationCandidate[] = [];

      for (const patient of lapsedPatients) {
        // Skip if already has a recent outreach
        if (excludeRecentOutreach) {
          const recentOpportunity = patient.reactivationOpportunities[0];
          if (
            recentOpportunity &&
            recentOpportunity.lastOutreachDate &&
            recentOpportunity.lastOutreachDate >= recentOutreachCutoff
          ) {
            continue;
          }
        }

        // Skip declined patients
        if (excludeDeclined) {
          const recentOpportunity = patient.reactivationOpportunities[0];
          if (recentOpportunity && recentOpportunity.status === 'DECLINED') {
            continue;
          }
        }

        const lastVisit = patient.appointments[0];
        if (!lastVisit?.endTime) continue;

        const daysSinceLastVisit = Math.floor(
          (now.getTime() - lastVisit.endTime.getTime()) / (24 * 60 * 60 * 1000)
        );

        // Calculate lifetime value
        const lifetimeValue = patient.appointments.reduce((sum, apt) => {
          return sum + 150; // Estimated average visit value
        }, 0);

        if (minLifetimeValue && lifetimeValue < minLifetimeValue) continue;

        // Analyze lapse reason
        const appointmentHistory = patient.appointments.map((a) => ({
          status: a.status,
          cancelReason: null as string | null,
        }));

        const insuranceStatus = patient.insurances[0]?.isActive ? 'active' : 'expired';

        const lapseAnalysis = analyzeLapseReason(
          daysSinceLastVisit,
          appointmentHistory,
          null, // Treatment plan status
          insuranceStatus,
          false, // Address changed - would need to compare
          null // Last visit notes
        );

        // Calculate reactivation score
        const reactivationScore = calculateReactivationScore(
          lifetimeValue,
          daysSinceLastVisit,
          patient.appointments.length,
          lapseAnalysis.likelyReason,
          { emailOpens: 0, linkClicks: 0, websiteVisits: 0 }
        );

        if (reactivationScore < minReactivationScore) continue;

        // Determine best approach
        const approach = determineReactivationApproach(
          lapseAnalysis.likelyReason,
          daysSinceLastVisit,
          lifetimeValue
        );

        // Get primary contact
        const contact = patient.contacts[0];

        candidates.push({
          patientId: patient.id,
          patientName: patient.demographics
            ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
            : patient.mrn,
          email: contact?.email || null,
          phone: contact?.mobilePhone || contact?.homePhone || null,
          lastVisitDate: lastVisit.endTime,
          daysSinceLastVisit,
          daysOverdue: null,
          lifetimeValue,
          averageVisitValue: lifetimeValue / patient.appointments.length,
          potentialRecovery: lifetimeValue * 0.5,
          reactivationScore,
          likelyReason: lapseAnalysis.likelyReason,
          reasonConfidence: lapseAnalysis.confidence,
          reasonFactors: lapseAnalysis.factors,
          recommendedApproach: approach,
          recommendedOffer: null,
          recommendedChannel: contact?.email ? 'email' : contact?.mobilePhone ? 'sms' : 'phone',
          recommendedTiming: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Tomorrow
          priorityRank: 0, // Will be set below
        });
      }

      // Sort by reactivation score and assign priority ranks
      candidates.sort((a, b) => b.reactivationScore - a.reactivationScore);
      candidates.forEach((c, i) => {
        c.priorityRank = i + 1;
      });

      await auditLog('AI_GROWTH_REACTIVATION_IDENTIFIED', 'ReactivationOpportunity', {
        changes: { candidatesFound: candidates.length, criteria: input },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        candidates: candidates.slice(0, limit),
        totalFound: candidates.length,
        criteria: {
          minDaysSinceVisit,
          maxDaysSinceVisit,
          minLifetimeValue,
          minReactivationScore,
        },
      };
    }),

  /**
   * Analyze patient lapse - Deep analysis of why a patient stopped coming
   */
  analyzePatientLapse: protectedProcedure
    .input(analyzePatientLapseInputSchema)
    .query(async ({ ctx, input }) => {
      const { patientId, forceReanalysis } = input;

      // Check for existing analysis
      const existingOpportunity = await ctx.prisma.reactivationOpportunity.findFirst({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingOpportunity && !forceReanalysis && existingOpportunity.likelyReason) {
        // Return cached analysis
        return {
          patientId,
          likelyReason: existingOpportunity.likelyReason as LapseReason,
          confidence: Number(existingOpportunity.reasonConfidence || 0),
          factors: (existingOpportunity.reasonFactors as Array<{
            factor: string;
            weight: number;
            evidence: string;
          }>) || [],
          recommendations: [],
          suggestedApproach: existingOpportunity.recommendedApproach as 'special_offer' | 'wellness_check' | 'personal_outreach' | 'reminder' | 'win_back',
          suggestedOffer: null,
          suggestedChannel: existingOpportunity.recommendedChannel as 'email' | 'sms' | 'phone',
          optimalTiming: calculateOptimalReactivationTiming({}, {}, existingOpportunity.likelyReason as LapseReason),
          fromCache: true,
        };
      }

      // Get patient with full history
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          appointments: {
            orderBy: { startTime: 'desc' },
            take: 50,
          },
          insurances: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const lastVisit = patient.appointments.find((a) => a.status === 'COMPLETED');
      if (!lastVisit?.endTime) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Patient has no completed visits',
        });
      }

      const now = new Date();
      const daysSinceLastVisit = Math.floor(
        (now.getTime() - lastVisit.endTime.getTime()) / (24 * 60 * 60 * 1000)
      );

      // Calculate lifetime value
      const lifetimeValue = patient.appointments
        .filter((a) => a.status === 'COMPLETED')
        .reduce((sum) => sum + 150, 0);

      // Build appointment history
      const appointmentHistory = patient.appointments.map((a) => ({
        status: a.status,
        cancelReason: null as string | null,
      }));

      // Check insurance status
      const currentInsurance = patient.insurances[0];
      const insuranceStatus = currentInsurance?.isActive ? 'active' : 'expired';

      // Analyze lapse
      const lapseAnalysis = analyzeLapseReason(
        daysSinceLastVisit,
        appointmentHistory,
        null,
        insuranceStatus,
        false,
        null
      );

      // Get recommended approach
      const approach = determineReactivationApproach(
        lapseAnalysis.likelyReason,
        daysSinceLastVisit,
        lifetimeValue
      );

      // Get recommended offers
      const offers = getReactivationOffers(lapseAnalysis.likelyReason, lifetimeValue, daysSinceLastVisit);
      const bestOffer = offers[0] || null;

      // Get contact info
      const contact = patient.contacts[0];
      const channel: 'email' | 'sms' | 'phone' = contact?.email
        ? 'email'
        : contact?.mobilePhone
        ? 'sms'
        : 'phone';

      // Calculate optimal timing
      const timing = calculateOptimalReactivationTiming({}, {}, lapseAnalysis.likelyReason);

      // Generate recommendations
      const recommendations: string[] = [];
      if (lapseAnalysis.likelyReason === 'financial') {
        recommendations.push('Offer a discounted package or payment plan');
        recommendations.push('Highlight any insurance benefits they may not be using');
      } else if (lapseAnalysis.likelyReason === 'scheduling') {
        recommendations.push('Offer extended hours or online booking');
        recommendations.push('Emphasize flexible scheduling options');
      } else if (lapseAnalysis.likelyReason === 'dissatisfied') {
        recommendations.push('Personal outreach from provider recommended');
        recommendations.push('Address specific concerns if known');
      } else if (lapseAnalysis.likelyReason === 'forgot') {
        recommendations.push('Simple reminder with easy booking link');
        recommendations.push('Consider automated reminder system enrollment');
      }

      // Save or update opportunity
      const opportunityData = {
        status: 'IDENTIFIED',
        lastVisitDate: lastVisit.endTime,
        daysSinceLastVisit,
        lifetimeValue,
        averageVisitValue: lifetimeValue / patient.appointments.filter((a) => a.status === 'COMPLETED').length,
        potentialRecovery: lifetimeValue * 0.5,
        likelyReason: lapseAnalysis.likelyReason,
        reasonConfidence: lapseAnalysis.confidence,
        reasonFactors: lapseAnalysis.factors,
        recommendedApproach: approach,
        recommendedOffer: bestOffer?.offerId || null,
        recommendedChannel: channel,
        recommendedTiming: timing.nextOptimalDate,
        reactivationScore: calculateReactivationScore(
          lifetimeValue,
          daysSinceLastVisit,
          patient.appointments.length,
          lapseAnalysis.likelyReason,
          { emailOpens: 0, linkClicks: 0, websiteVisits: 0 }
        ),
      };

      if (existingOpportunity) {
        await ctx.prisma.reactivationOpportunity.update({
          where: { id: existingOpportunity.id },
          data: opportunityData,
        });
      } else {
        await ctx.prisma.reactivationOpportunity.create({
          data: {
            ...opportunityData,
            patientId,
            organizationId: ctx.user.organizationId,
          },
        });
      }

      await auditLog('AI_GROWTH_REACTIVATION_ANALYSIS', 'ReactivationOpportunity', {
        entityId: patientId,
        changes: { likelyReason: lapseAnalysis.likelyReason, confidence: lapseAnalysis.confidence },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        patientId,
        likelyReason: lapseAnalysis.likelyReason,
        confidence: lapseAnalysis.confidence,
        factors: lapseAnalysis.factors,
        recommendations,
        suggestedApproach: approach,
        suggestedOffer: bestOffer,
        suggestedChannel: channel,
        optimalTiming: timing,
        fromCache: false,
      } as ReactivationAnalysis & { fromCache: boolean };
    }),

  /**
   * Reactivate patient - Send reactivation outreach
   */
  reactivate: protectedProcedure
    .input(reactivatePatientInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { patientId, approach, channel, offerId, customMessage, scheduledAt } = input;

      // Get patient
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          contacts: { where: { isPrimary: true }, take: 1 },
          appointments: {
            where: { status: 'COMPLETED' },
            orderBy: { endTime: 'desc' },
            take: 1,
          },
          reactivationOpportunities: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get or create reactivation opportunity
      let opportunity = patient.reactivationOpportunities[0];
      const lastVisit = patient.appointments[0];
      const now = new Date();
      const daysSinceLastVisit = lastVisit?.endTime
        ? Math.floor((now.getTime() - lastVisit.endTime.getTime()) / (24 * 60 * 60 * 1000))
        : 365;

      if (!opportunity) {
        // Create opportunity
        opportunity = await ctx.prisma.reactivationOpportunity.create({
          data: {
            patientId,
            organizationId: ctx.user.organizationId,
            status: 'IDENTIFIED',
            lastVisitDate: lastVisit?.endTime || new Date(),
            daysSinceLastVisit,
            likelyReason: 'unknown',
          },
        });
      }

      // Get organization
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
        select: { name: true },
      });

      // Determine approach and channel
      const lifetimeValue = patient.appointments.length * 150;
      const lapseReason = (opportunity.likelyReason as LapseReason) || 'unknown';
      const finalApproach = approach || determineReactivationApproach(lapseReason, daysSinceLastVisit, lifetimeValue);
      const contact = patient.contacts[0];
      const finalChannel = channel || (contact?.email ? 'email' : contact?.mobilePhone ? 'sms' : 'phone');

      // Get offer details
      let offer: { type: string; value: string; code: string; expiresAt: Date } | null = null;
      if (offerId) {
        const offers = getReactivationOffers(lapseReason, lifetimeValue, daysSinceLastVisit);
        const matchedOffer = offers.find((o) => o.offerId === offerId);
        if (matchedOffer) {
          offer = {
            type: matchedOffer.type,
            value: matchedOffer.value,
            code: offerId,
            expiresAt: new Date(now.getTime() + matchedOffer.validDays * 24 * 60 * 60 * 1000),
          };
        }
      } else if (finalApproach === 'special_offer' || finalApproach === 'win_back') {
        // Auto-select best offer
        const offers = getReactivationOffers(lapseReason, lifetimeValue, daysSinceLastVisit);
        if (offers[0]) {
          offer = {
            type: offers[0].type,
            value: offers[0].value,
            code: offers[0].offerId,
            expiresAt: new Date(now.getTime() + offers[0].validDays * 24 * 60 * 60 * 1000),
          };
        }
      }

      // Generate message
      const patientFirstName = patient.demographics?.firstName || 'Patient';
      const practiceName = org?.name || 'Our Practice';
      let message: { subject?: string; body: string };
      if (customMessage) {
        message = { body: customMessage };
      } else if (finalChannel === 'phone') {
        // Phone calls don't use generated messages - provide call script
        message = {
          subject: 'Phone Reactivation Call Script',
          body: `Call Script for ${patientFirstName}:\n\n1. Introduce yourself from ${practiceName}\n2. Mention it's been a while since their last visit\n3. Ask how they've been feeling\n4. ${offer ? `Offer: ${offer.value}` : 'Offer a wellness check-up'}\n5. Attempt to schedule an appointment`,
        };
      } else {
        message = generateReactivationMessage(
          patientFirstName,
          practiceName,
          finalApproach,
          finalChannel,
          offer,
          daysSinceLastVisit
        );
      }

      // Update opportunity
      await ctx.prisma.reactivationOpportunity.update({
        where: { id: opportunity.id },
        data: {
          status: 'CONTACTED',
          outreachAttempts: { increment: 1 },
          lastOutreachDate: scheduledAt || new Date(),
          lastOutreachMethod: finalChannel,
          recommendedOffer: offer?.code || null,
        },
      });

      await auditLog('AI_GROWTH_REACTIVATION_OUTREACH', 'ReactivationOpportunity', {
        entityId: opportunity.id,
        changes: { patientId, approach: finalApproach, channel: finalChannel, hasOffer: !!offer },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        opportunityId: opportunity.id,
        patientId,
        patientName: `${patientFirstName} ${patient.demographics?.lastName || ''}`.trim(),
        channel: finalChannel,
        message,
        offer,
        scheduledAt: scheduledAt || new Date(),
        status: 'scheduled',
      } as ReactivationOutreach;
    }),

  /**
   * Send reactivation offer - Send a specific offer to a lapsed patient
   */
  sendReactivationOffer: protectedProcedure
    .input(sendReactivationOfferInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { patientId, offerId, channel, customMessage, scheduledAt } = input;

      // Get patient
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          contacts: { where: { isPrimary: true }, take: 1 },
          appointments: {
            where: { status: 'COMPLETED' },
            orderBy: { endTime: 'desc' },
            take: 1,
          },
          reactivationOpportunities: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get organization
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
        select: { name: true },
      });

      const now = new Date();
      const lastVisit = patient.appointments[0];
      const daysSinceLastVisit = lastVisit?.endTime
        ? Math.floor((now.getTime() - lastVisit.endTime.getTime()) / (24 * 60 * 60 * 1000))
        : 365;
      const lifetimeValue = patient.appointments.length * 150;
      const lapseReason =
        (patient.reactivationOpportunities[0]?.likelyReason as LapseReason) || 'unknown';

      // Get offer
      const offers = getReactivationOffers(lapseReason, lifetimeValue, daysSinceLastVisit);
      const matchedOffer = offers.find((o) => o.offerId === offerId);

      if (!matchedOffer) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Offer not found or not applicable',
        });
      }

      const offer = {
        type: matchedOffer.type,
        value: matchedOffer.value,
        code: offerId,
        expiresAt: new Date(now.getTime() + matchedOffer.validDays * 24 * 60 * 60 * 1000),
      };

      // Generate message
      const patientFirstName = patient.demographics?.firstName || 'Patient';
      const practiceName = org?.name || 'Our Practice';
      const message = customMessage
        ? { body: customMessage }
        : generateReactivationMessage(
            patientFirstName,
            practiceName,
            'special_offer',
            channel,
            offer,
            daysSinceLastVisit
          );

      // Update or create opportunity
      let opportunity = patient.reactivationOpportunities[0];
      if (opportunity) {
        await ctx.prisma.reactivationOpportunity.update({
          where: { id: opportunity.id },
          data: {
            status: 'CONTACTED',
            outreachAttempts: { increment: 1 },
            lastOutreachDate: scheduledAt || new Date(),
            lastOutreachMethod: channel,
            recommendedOffer: offerId,
          },
        });
      } else {
        opportunity = await ctx.prisma.reactivationOpportunity.create({
          data: {
            patientId,
            organizationId: ctx.user.organizationId,
            status: 'CONTACTED',
            lastVisitDate: lastVisit?.endTime || new Date(),
            daysSinceLastVisit,
            outreachAttempts: 1,
            lastOutreachDate: scheduledAt || new Date(),
            lastOutreachMethod: channel,
            recommendedOffer: offerId,
          },
        });
      }

      await auditLog('AI_GROWTH_REACTIVATION_OFFER_SENT', 'ReactivationOpportunity', {
        entityId: opportunity.id,
        changes: { patientId, offerId, channel },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        opportunityId: opportunity.id,
        patientId,
        patientName: `${patientFirstName} ${patient.demographics?.lastName || ''}`.trim(),
        channel,
        message,
        offer,
        scheduledAt: scheduledAt || new Date(),
        status: 'scheduled',
      } as ReactivationOutreach;
    }),

  /**
   * Get reactivation offers - List available offers for a patient
   */
  getReactivationOffers: protectedProcedure
    .input(getReactivationOffersInputSchema)
    .query(async ({ ctx, input }) => {
      const { patientId, lapseReason, isActive } = input;

      let reason: LapseReason = lapseReason || 'unknown';
      let lifetimeValue = 500;
      let daysSinceLastVisit = 180;

      if (patientId) {
        const patient = await ctx.prisma.patient.findFirst({
          where: {
            id: patientId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            appointments: {
              where: { status: 'COMPLETED' },
              orderBy: { endTime: 'desc' },
              take: 1,
            },
            reactivationOpportunities: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        if (patient) {
          lifetimeValue = patient.appointments.length * 150;
          const lastVisit = patient.appointments[0];
          if (lastVisit?.endTime) {
            daysSinceLastVisit = Math.floor(
              (new Date().getTime() - lastVisit.endTime.getTime()) / (24 * 60 * 60 * 1000)
            );
          }
          reason = (patient.reactivationOpportunities[0]?.likelyReason as LapseReason) || reason;
        }
      }

      const offers = getReactivationOffers(reason, lifetimeValue, daysSinceLastVisit);
      return offers.filter((o) => o.isActive === isActive);
    }),

  /**
   * Track reactivation response - Record patient response to outreach
   */
  trackReactivationResponse: protectedProcedure
    .input(trackReactivationResponseInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { opportunityId, responseType, responseContent, bookedAppointmentId } = input;

      const opportunity = await ctx.prisma.reactivationOpportunity.findFirst({
        where: {
          id: opportunityId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
            },
          },
        },
      });

      if (!opportunity) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Reactivation opportunity not found',
        });
      }

      // Determine new status based on response
      let newStatus: ReactivationStatus = 'ENGAGED';
      if (responseType === 'booked') {
        newStatus = 'REACTIVATED';
      } else if (responseType === 'declined' || responseType === 'unsubscribed') {
        newStatus = 'DECLINED';
      } else if (responseType === 'no_response') {
        newStatus = opportunity.outreachAttempts >= 3 ? 'LOST' : 'CONTACTED';
      }

      // Update opportunity
      await ctx.prisma.reactivationOpportunity.update({
        where: { id: opportunityId },
        data: {
          status: newStatus,
          responseReceived: responseType !== 'no_response',
          responseDate: responseType !== 'no_response' ? new Date() : undefined,
          responseContent,
          reactivated: responseType === 'booked',
          reactivationDate: responseType === 'booked' ? new Date() : undefined,
          reactivationVisitId: bookedAppointmentId,
        },
      });

      await auditLog('AI_GROWTH_REACTIVATION_RESPONSE', 'ReactivationOpportunity', {
        entityId: opportunityId,
        changes: { responseType, newStatus, bookedAppointmentId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        opportunityId,
        patientId: opportunity.patientId,
        patientName: opportunity.patient.demographics
          ? `${opportunity.patient.demographics.firstName} ${opportunity.patient.demographics.lastName}`
          : opportunity.patientId,
        responseType,
        newStatus,
        reactivated: responseType === 'booked',
      };
    }),

  /**
   * Record reactivation success - Mark successful reactivation
   */
  recordReactivationSuccess: protectedProcedure
    .input(recordReactivationSuccessInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { opportunityId, appointmentId, notes } = input;

      const opportunity = await ctx.prisma.reactivationOpportunity.findFirst({
        where: {
          id: opportunityId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: { demographics: true },
          },
        },
      });

      if (!opportunity) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Reactivation opportunity not found',
        });
      }

      // Verify appointment exists
      const appointment = await ctx.prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          patientId: opportunity.patientId,
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found or does not belong to this patient',
        });
      }

      // Update opportunity
      await ctx.prisma.reactivationOpportunity.update({
        where: { id: opportunityId },
        data: {
          status: 'REACTIVATED',
          reactivated: true,
          reactivationDate: new Date(),
          reactivationVisitId: appointmentId,
        },
      });

      // Calculate value recovered
      const lifetimeValue = Number(opportunity.lifetimeValue || 0);
      const potentialRecovery = lifetimeValue * 0.5;

      await auditLog('AI_GROWTH_REACTIVATION_SUCCESS', 'ReactivationOpportunity', {
        entityId: opportunityId,
        changes: { appointmentId, notes, valueRecovered: potentialRecovery },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        opportunityId,
        patientId: opportunity.patientId,
        patientName: opportunity.patient.demographics
          ? `${opportunity.patient.demographics.firstName} ${opportunity.patient.demographics.lastName}`
          : opportunity.patientId,
        appointmentId,
        reactivationDate: new Date(),
        daysSinceLastVisit: opportunity.daysSinceLastVisit,
        valueRecovered: potentialRecovery,
        lapseReason: opportunity.likelyReason,
      };
    }),

  /**
   * Get reactivation metrics - Analytics on reactivation efforts
   */
  getReactivationMetrics: protectedProcedure
    .input(getReactivationMetricsInputSchema)
    .query(async ({ ctx, input }) => {
      const { startDate, endDate } = input;

      const dateFilter: Prisma.ReactivationOpportunityWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.gte = startDate;
        if (endDate) dateFilter.createdAt.lte = endDate;
      }

      const opportunities = await ctx.prisma.reactivationOpportunity.findMany({
        where: dateFilter,
      });

      // Calculate metrics
      const totalCandidates = opportunities.length;
      const totalOutreaches = opportunities.reduce((sum, o) => sum + o.outreachAttempts, 0);
      const totalResponses = opportunities.filter((o) => o.responseReceived).length;
      const totalReactivated = opportunities.filter((o) => o.reactivated).length;
      const reactivationRate = totalCandidates > 0 ? (totalReactivated / totalCandidates) * 100 : 0;

      // Calculate average time to reactivate
      const reactivatedOpportunities = opportunities.filter((o) => o.reactivated && o.reactivationDate);
      const avgTimeToReactivate =
        reactivatedOpportunities.length > 0
          ? reactivatedOpportunities.reduce((sum, o) => {
              const days = Math.floor(
                (o.reactivationDate!.getTime() - o.createdAt.getTime()) / (24 * 60 * 60 * 1000)
              );
              return sum + days;
            }, 0) / reactivatedOpportunities.length
          : 0;

      // Calculate value recovered
      const valueRecovered = opportunities
        .filter((o) => o.reactivated)
        .reduce((sum, o) => sum + Number(o.potentialRecovery || 0), 0);

      // Group by reason
      const byReason: Record<LapseReason, { count: number; reactivated: number; rate: number }> = {
        no_perceived_need: { count: 0, reactivated: 0, rate: 0 },
        financial: { count: 0, reactivated: 0, rate: 0 },
        scheduling: { count: 0, reactivated: 0, rate: 0 },
        moved_away: { count: 0, reactivated: 0, rate: 0 },
        dissatisfied: { count: 0, reactivated: 0, rate: 0 },
        switched_provider: { count: 0, reactivated: 0, rate: 0 },
        insurance_change: { count: 0, reactivated: 0, rate: 0 },
        health_improved: { count: 0, reactivated: 0, rate: 0 },
        forgot: { count: 0, reactivated: 0, rate: 0 },
        life_event: { count: 0, reactivated: 0, rate: 0 },
        unknown: { count: 0, reactivated: 0, rate: 0 },
      };

      for (const opp of opportunities) {
        const reason = (opp.likelyReason as LapseReason) || 'unknown';
        if (byReason[reason]) {
          byReason[reason].count++;
          if (opp.reactivated) byReason[reason].reactivated++;
        }
      }

      for (const reason of Object.keys(byReason) as LapseReason[]) {
        byReason[reason].rate =
          byReason[reason].count > 0
            ? (byReason[reason].reactivated / byReason[reason].count) * 100
            : 0;
      }

      // Group by channel
      const byChannel: Record<string, { outreaches: number; responses: number; reactivated: number; rate: number }> = {};
      for (const opp of opportunities) {
        const channel = opp.lastOutreachMethod || 'none';
        if (!byChannel[channel]) {
          byChannel[channel] = { outreaches: 0, responses: 0, reactivated: 0, rate: 0 };
        }
        byChannel[channel].outreaches += opp.outreachAttempts;
        if (opp.responseReceived) byChannel[channel].responses++;
        if (opp.reactivated) byChannel[channel].reactivated++;
      }

      for (const channel of Object.keys(byChannel)) {
        byChannel[channel].rate =
          byChannel[channel].outreaches > 0
            ? (byChannel[channel].reactivated / byChannel[channel].outreaches) * 100
            : 0;
      }

      // Group by offer
      const offerStats = new Map<string, { sent: number; redeemed: number; valueRecovered: number }>();
      for (const opp of opportunities) {
        if (opp.recommendedOffer) {
          const stats = offerStats.get(opp.recommendedOffer) || { sent: 0, redeemed: 0, valueRecovered: 0 };
          stats.sent++;
          if (opp.reactivated) {
            stats.redeemed++;
            stats.valueRecovered += Number(opp.potentialRecovery || 0);
          }
          offerStats.set(opp.recommendedOffer, stats);
        }
      }

      const byOffer = Array.from(offerStats.entries()).map(([offerType, stats]) => ({
        offerType,
        sent: stats.sent,
        redeemed: stats.redeemed,
        redemptionRate: stats.sent > 0 ? (stats.redeemed / stats.sent) * 100 : 0,
        valueRecovered: stats.valueRecovered,
      }));

      return {
        totalCandidates,
        totalOutreaches,
        totalResponses,
        totalReactivated,
        reactivationRate,
        averageTimeToReactivate: avgTimeToReactivate,
        valueRecovered,
        byReason,
        byChannel,
        byOffer,
      } as ReactivationMetrics;
    }),

  /**
   * Bulk reactivation outreach - Send outreach to multiple patients
   */
  bulkReactivationOutreach: protectedProcedure
    .input(bulkReactivationOutreachInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { patientIds, approach, channel, offerId, spreadOverDays } = input;

      const now = new Date();
      const results: Array<{
        patientId: string;
        success: boolean;
        opportunityId?: string;
        error?: string;
        scheduledAt?: Date;
      }> = [];

      // Get organization
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
        select: { name: true },
      });

      // Process each patient
      for (let i = 0; i < patientIds.length; i++) {
        const patientId = patientIds[i];

        try {
          const patient = await ctx.prisma.patient.findFirst({
            where: {
              id: patientId,
              organizationId: ctx.user.organizationId,
            },
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true }, take: 1 },
              appointments: {
                where: { status: 'COMPLETED' },
                orderBy: { endTime: 'desc' },
                take: 1,
              },
              reactivationOpportunities: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          });

          if (!patient) {
            results.push({ patientId, success: false, error: 'Patient not found' });
            continue;
          }

          // Calculate scheduled time with spread
          const scheduledAt = new Date(
            now.getTime() + Math.floor(i / Math.ceil(patientIds.length / spreadOverDays)) * 24 * 60 * 60 * 1000
          );

          const lastVisit = patient.appointments[0];
          const daysSinceLastVisit = lastVisit?.endTime
            ? Math.floor((now.getTime() - lastVisit.endTime.getTime()) / (24 * 60 * 60 * 1000))
            : 365;
          const lifetimeValue = patient.appointments.length * 150;
          const lapseReason =
            (patient.reactivationOpportunities[0]?.likelyReason as LapseReason) || 'unknown';

          // Get offer
          let offer: { type: string; value: string; code: string; expiresAt: Date } | null = null;
          if (offerId || approach === 'special_offer' || approach === 'win_back') {
            const offers = getReactivationOffers(lapseReason, lifetimeValue, daysSinceLastVisit);
            const matchedOffer = offerId ? offers.find((o) => o.offerId === offerId) : offers[0];
            if (matchedOffer) {
              offer = {
                type: matchedOffer.type,
                value: matchedOffer.value,
                code: matchedOffer.offerId,
                expiresAt: new Date(now.getTime() + matchedOffer.validDays * 24 * 60 * 60 * 1000),
              };
            }
          }

          // Update or create opportunity
          let opportunity = patient.reactivationOpportunities[0];
          if (opportunity) {
            await ctx.prisma.reactivationOpportunity.update({
              where: { id: opportunity.id },
              data: {
                status: 'CONTACTED',
                outreachAttempts: { increment: 1 },
                lastOutreachDate: scheduledAt,
                lastOutreachMethod: channel,
                recommendedOffer: offer?.code || null,
              },
            });
          } else {
            opportunity = await ctx.prisma.reactivationOpportunity.create({
              data: {
                patientId,
                organizationId: ctx.user.organizationId,
                status: 'CONTACTED',
                lastVisitDate: lastVisit?.endTime || new Date(),
                daysSinceLastVisit,
                outreachAttempts: 1,
                lastOutreachDate: scheduledAt,
                lastOutreachMethod: channel,
                recommendedOffer: offer?.code || null,
              },
            });
          }

          results.push({
            patientId,
            success: true,
            opportunityId: opportunity.id,
            scheduledAt,
          });
        } catch (error) {
          results.push({
            patientId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      await auditLog('AI_GROWTH_REACTIVATION_BULK_OUTREACH', 'ReactivationOpportunity', {
        changes: {
          totalPatients: patientIds.length,
          successful: results.filter((r) => r.success).length,
          approach,
          channel,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        totalProcessed: patientIds.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
        spreadOverDays,
      };
    }),

  /**
   * Get optimal reactivation timing - Calculate best time to reach out
   */
  getOptimalReactivationTiming: protectedProcedure
    .input(getOptimalReactivationTimingInputSchema)
    .query(async ({ ctx, input }) => {
      const { patientId } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          reactivationOpportunities: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const lapseReason =
        (patient.reactivationOpportunities[0]?.likelyReason as LapseReason) || 'unknown';

      // Calculate timing based on available data
      // In production, this would use actual engagement data
      const timing = calculateOptimalReactivationTiming({}, {}, lapseReason);

      return {
        patientId,
        ...timing,
      };
    }),

  /**
   * Get reactivation opportunities - List all opportunities with filtering
   */
  getReactivationOpportunities: protectedProcedure
    .input(getReactivationOpportunitiesInputSchema)
    .query(async ({ ctx, input }) => {
      const { status, limit, offset, sortBy, sortOrder } = input;

      const where: Prisma.ReactivationOpportunityWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (status) {
        where.status = status;
      }

      const orderBy: Prisma.ReactivationOpportunityOrderByWithRelationInput = {};
      orderBy[sortBy] = sortOrder;

      const [opportunities, total] = await Promise.all([
        ctx.prisma.reactivationOpportunity.findMany({
          where,
          orderBy,
          take: limit,
          skip: offset,
          include: {
            patient: {
              include: {
                demographics: true,
                contacts: { where: { isPrimary: true }, take: 1 },
              },
            },
          },
        }),
        ctx.prisma.reactivationOpportunity.count({ where }),
      ]);

      return {
        opportunities: opportunities.map((opp) => ({
          id: opp.id,
          patientId: opp.patientId,
          patientName: opp.patient.demographics
            ? `${opp.patient.demographics.firstName} ${opp.patient.demographics.lastName}`
            : opp.patientId,
          email: opp.patient.contacts[0]?.email || null,
          phone: opp.patient.contacts[0]?.mobilePhone || opp.patient.contacts[0]?.homePhone || null,
          status: opp.status,
          lastVisitDate: opp.lastVisitDate,
          daysSinceLastVisit: opp.daysSinceLastVisit,
          lifetimeValue: Number(opp.lifetimeValue || 0),
          reactivationScore: opp.reactivationScore,
          likelyReason: opp.likelyReason,
          recommendedApproach: opp.recommendedApproach,
          outreachAttempts: opp.outreachAttempts,
          lastOutreachDate: opp.lastOutreachDate,
          responseReceived: opp.responseReceived,
          reactivated: opp.reactivated,
          reactivationDate: opp.reactivationDate,
          createdAt: opp.createdAt,
        })),
        total,
        limit,
        offset,
        hasMore: offset + opportunities.length < total,
      };
    }),

  // ============================================
  // US-361: Marketing Campaign Automation
  // ============================================

  /**
   * Create a marketing campaign - AI generates campaign with targeting and content
   */
  createCampaign: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        campaignType: z.enum([
          'LEAD_GENERATION',
          'REACTIVATION',
          'REFERRAL',
          'REVIEW',
          'RETENTION',
          'UPSELL',
          'SEASONAL',
          'EVENT',
        ]),
        description: z.string().optional(),
        targetAudience: z
          .object({
            minAge: z.number().optional(),
            maxAge: z.number().optional(),
            gender: z.enum(['male', 'female', 'all']).optional(),
            insuranceTypes: z.array(z.string()).optional(),
            diagnosisCodes: z.array(z.string()).optional(),
            minVisits: z.number().optional(),
            maxVisits: z.number().optional(),
            daysSinceLastVisit: z
              .object({
                min: z.number().optional(),
                max: z.number().optional(),
              })
              .optional(),
            lifetimeValueRange: z
              .object({
                min: z.number().optional(),
                max: z.number().optional(),
              })
              .optional(),
            engagementLevel: z.enum(['high', 'medium', 'low', 'all']).optional(),
            excludeActive: z.boolean().optional(),
            customSegment: z.string().optional(),
          })
          .optional(),
        channels: z.array(z.enum(['email', 'sms', 'social', 'direct_mail'])),
        messagingTone: z.enum(['professional', 'friendly', 'urgent', 'empathetic']),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        budget: z.number().optional(),
        targetLeads: z.number().optional(),
        targetConversions: z.number().optional(),
        targetROI: z.number().optional(),
        enableABTesting: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        name,
        campaignType,
        description,
        targetAudience,
        channels,
        messagingTone,
        startDate,
        endDate,
        budget,
        targetLeads,
        targetConversions,
        targetROI,
        enableABTesting,
      } = input;

      // AI-generated content strategy based on campaign type
      const contentStrategy = generateContentStrategy(campaignType, messagingTone, channels);

      // Calculate estimated target patient count
      const estimatedReach = await estimateAudienceSize(
        ctx.prisma,
        ctx.user.organizationId,
        targetAudience || {}
      );

      // Generate campaign sequences
      const sequences = generateCampaignSequences(campaignType, channels, messagingTone);

      // A/B test configuration if enabled
      const abTestConfig = enableABTesting
        ? {
            enabled: true,
            variants: ['A', 'B'],
            splitRatio: 50,
            winnerMetric: 'conversion_rate',
            minimumSampleSize: Math.min(100, Math.floor(estimatedReach / 4)),
            testDuration: 7, // days
          }
        : null;

      const campaign = await ctx.prisma.growthCampaign.create({
        data: {
          organizationId: ctx.user.organizationId,
          name,
          description,
          campaignType,
          status: startDate && startDate > new Date() ? 'SCHEDULED' : 'DRAFT',
          startDate,
          endDate,
          targetAudience: targetAudience || {},
          targetPatientCount: estimatedReach,
          targetLeads,
          targetConversions,
          targetROI,
          budget,
          contentStrategy,
          messagingTone,
          channels,
          sequences,
          abTestConfig: abTestConfig as Prisma.InputJsonValue | undefined,
        },
      });

      await auditLog('AI_GROWTH_CAMPAIGN_CREATED', 'GrowthCampaign', {
        entityId: campaign.id,
        changes: {
          name,
          campaignType,
          channels,
          estimatedReach,
          enableABTesting,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        campaignId: campaign.id,
        name,
        campaignType,
        status: campaign.status,
        estimatedReach,
        contentStrategy,
        sequences,
        abTestConfig,
        createdAt: campaign.createdAt,
      };
    }),

  /**
   * Segment audience - AI-powered audience segmentation for targeting
   */
  segmentAudience: protectedProcedure
    .input(
      z.object({
        segmentType: z.enum([
          'high_value',
          'at_risk',
          'new_patients',
          'loyal',
          'lapsed',
          'engaged',
          'unengaged',
          'custom',
        ]),
        customCriteria: z
          .object({
            minAge: z.number().optional(),
            maxAge: z.number().optional(),
            gender: z.enum(['male', 'female', 'all']).optional(),
            insuranceTypes: z.array(z.string()).optional(),
            diagnosisCodes: z.array(z.string()).optional(),
            minVisits: z.number().optional(),
            maxVisits: z.number().optional(),
            daysSinceLastVisit: z
              .object({
                min: z.number().optional(),
                max: z.number().optional(),
              })
              .optional(),
            lifetimeValueRange: z
              .object({
                min: z.number().optional(),
                max: z.number().optional(),
              })
              .optional(),
            appointmentTypes: z.array(z.string()).optional(),
            excludePatientIds: z.array(z.string()).optional(),
          })
          .optional(),
        limit: z.number().min(1).max(1000).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const { segmentType, customCriteria, limit } = input;

      // Get segment criteria based on type
      const segmentCriteria = getSegmentCriteria(segmentType, customCriteria);

      // Build query
      const patients = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
          ...(segmentCriteria.patientFilters || {}),
        },
        take: limit,
        include: {
          demographics: true,
          contacts: { where: { isPrimary: true }, take: 1 },
          appointments: {
            orderBy: { startTime: 'desc' },
            take: 10,
          },
        },
      });

      // Calculate segment scores for each patient
      const segmentedPatients = patients.map((patient) => {
        const patientWithAppts = patient as typeof patient & { appointments: Array<{ startTime: Date }> };
        const score = calculateSegmentScore(patientWithAppts, segmentType);
        const lastVisit = patientWithAppts.appointments[0]?.startTime || null;
        const totalVisits = patientWithAppts.appointments.length;

        return {
          patientId: patient.id,
          patientName: patient.demographics
            ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
            : patient.id,
          email: patient.contacts[0]?.email || null,
          phone: patient.contacts[0]?.mobilePhone || patient.contacts[0]?.homePhone || null,
          segmentScore: score,
          lastVisitDate: lastVisit,
          totalVisits,
          characteristics: getPatientCharacteristics(patientWithAppts, segmentType),
        };
      });

      // Sort by segment score descending
      segmentedPatients.sort((a, b) => b.segmentScore - a.segmentScore);

      await auditLog('AI_GROWTH_AUDIENCE_SEGMENTED', 'Patient', {
        changes: {
          segmentType,
          totalPatients: segmentedPatients.length,
          criteria: customCriteria,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        segmentType,
        totalPatients: segmentedPatients.length,
        patients: segmentedPatients,
        segmentInsights: generateSegmentInsights(segmentedPatients, segmentType),
        recommendedActions: getSegmentRecommendations(segmentType, segmentedPatients.length),
      };
    }),

  /**
   * Generate campaign content - AI assists with content creation
   */
  generateCampaignContent: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().optional(),
        campaignType: z.enum([
          'LEAD_GENERATION',
          'REACTIVATION',
          'REFERRAL',
          'REVIEW',
          'RETENTION',
          'UPSELL',
          'SEASONAL',
          'EVENT',
        ]),
        channel: z.enum(['email', 'sms', 'social', 'direct_mail']),
        tone: z.enum(['professional', 'friendly', 'urgent', 'empathetic']),
        contentType: z.enum([
          'promotional',
          'educational',
          'testimonial',
          'offer',
          'reminder',
          'announcement',
        ]),
        customPrompt: z.string().optional(),
        includeOffer: z.boolean().default(false),
        offerDetails: z
          .object({
            type: z.enum(['percentage', 'dollar', 'free_service', 'complimentary']),
            value: z.string(),
            expiresInDays: z.number(),
          })
          .optional(),
        abVariant: z.enum(['A', 'B']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { campaignType, channel, tone, contentType, includeOffer, offerDetails, abVariant } =
        input;

      // Get organization info for personalization
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
        select: { name: true, primaryContactPhone: true },
      });

      const practiceName = org?.name || 'Our Practice';
      const practicePhone = org?.primaryContactPhone || '';

      // Generate content based on parameters
      const content = generateMarketingContent({
        campaignType,
        channel,
        tone,
        contentType,
        includeOffer,
        offerDetails,
        practiceName,
        practicePhone,
        abVariant,
      });

      await auditLog('AI_GROWTH_CONTENT_GENERATED', 'GrowthCampaign', {
        entityId: input.campaignId,
        changes: {
          campaignType,
          channel,
          tone,
          contentType,
          abVariant,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        channel,
        contentType,
        tone,
        abVariant,
        content,
        personalizationVariables: [
          '{{firstName}}',
          '{{lastName}}',
          '{{lastVisitDate}}',
          '{{offerCode}}',
          '{{expiryDate}}',
        ],
        characterCount: content.body.length,
        estimatedReadTime:
          channel === 'email' ? `${Math.ceil(content.body.length / 1000)} min` : 'N/A',
      };
    }),

  /**
   * Execute multi-channel campaign - Run campaign across channels
   */
  executeCampaign: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        testMode: z.boolean().default(false),
        testRecipients: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { campaignId, testMode, testRecipients } = input;

      const campaign = await ctx.prisma.growthCampaign.findFirst({
        where: {
          id: campaignId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!campaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      if (campaign.status === 'ACTIVE' && !testMode) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Campaign is already active',
        });
      }

      // Get target audience
      const targetAudience = (campaign.targetAudience as Record<string, unknown>) || {};
      const patients = testMode
        ? await ctx.prisma.patient.findMany({
            where: {
              organizationId: ctx.user.organizationId,
              id: { in: testRecipients },
            },
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true }, take: 1 },
            },
          })
        : await getTargetPatients(ctx.prisma, ctx.user.organizationId, targetAudience, 1000);

      // Activate campaign if not test mode
      if (!testMode) {
        await ctx.prisma.growthCampaign.update({
          where: { id: campaignId },
          data: {
            status: 'ACTIVE',
            startDate: new Date(),
            actualReach: patients.length,
          },
        });
      }

      await auditLog('AI_GROWTH_CAMPAIGN_ACTIVATED', 'GrowthCampaign', {
        entityId: campaignId,
        changes: {
          testMode,
          recipientCount: patients.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        campaignId,
        status: testMode ? 'TEST_SENT' : 'ACTIVE',
        recipientCount: patients.length,
        estimatedDeliveryTime: testMode ? 'Immediate' : 'Within 24 hours',
        channels: campaign.channels as string[],
        sequences: campaign.sequences as unknown[],
      };
    }),

  /**
   * Create A/B test - Set up A/B testing for campaign
   */
  createABTest: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        testName: z.string(),
        testElement: z.enum(['subject', 'content', 'cta', 'timing', 'offer']),
        variantA: z.object({
          name: z.string(),
          content: z.string(),
        }),
        variantB: z.object({
          name: z.string(),
          content: z.string(),
        }),
        splitRatio: z.number().min(10).max(90).default(50),
        winnerMetric: z.enum(['open_rate', 'click_rate', 'conversion_rate', 'revenue']),
        testDuration: z.number().min(1).max(30).default(7), // days
        minimumSampleSize: z.number().min(50).default(100),
        autoSelectWinner: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        campaignId,
        testName,
        testElement,
        variantA,
        variantB,
        splitRatio,
        winnerMetric,
        testDuration,
        minimumSampleSize,
        autoSelectWinner,
      } = input;

      const campaign = await ctx.prisma.growthCampaign.findFirst({
        where: {
          id: campaignId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!campaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      const abTestConfig = {
        testId: `abtest_${Date.now()}`,
        testName,
        testElement,
        variants: {
          A: { ...variantA, recipients: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0 },
          B: { ...variantB, recipients: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0 },
        },
        splitRatio,
        winnerMetric,
        testDuration,
        minimumSampleSize,
        autoSelectWinner,
        startedAt: new Date(),
        endsAt: new Date(Date.now() + testDuration * 24 * 60 * 60 * 1000),
        winner: null,
        statisticalSignificance: null,
      };

      await ctx.prisma.growthCampaign.update({
        where: { id: campaignId },
        data: {
          abTestConfig,
        },
      });

      await auditLog('AI_GROWTH_ABTEST_CREATED', 'GrowthCampaign', {
        entityId: campaignId,
        changes: {
          testName,
          testElement,
          splitRatio,
          winnerMetric,
          testDuration,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        campaignId,
        testId: abTestConfig.testId,
        testName,
        testElement,
        variants: ['A', 'B'],
        splitRatio,
        winnerMetric,
        endsAt: abTestConfig.endsAt,
      };
    }),

  /**
   * Get A/B test results - Analyze test performance
   */
  getABTestResults: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { campaignId } = input;

      const campaign = await ctx.prisma.growthCampaign.findFirst({
        where: {
          id: campaignId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!campaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      const abTestConfig = campaign.abTestConfig as Record<string, unknown> | null;

      if (!abTestConfig) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No A/B test configured for this campaign',
        });
      }

      const variants = abTestConfig.variants as Record<
        string,
        { recipients: number; opens: number; clicks: number; conversions: number; revenue: number }
      >;

      // Calculate metrics for each variant
      const variantMetrics = Object.entries(variants).map(([variant, data]) => {
        const openRate = data.recipients > 0 ? (data.opens / data.recipients) * 100 : 0;
        const clickRate = data.opens > 0 ? (data.clicks / data.opens) * 100 : 0;
        const conversionRate = data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0;
        const revenuePerRecipient = data.recipients > 0 ? data.revenue / data.recipients : 0;

        return {
          variant,
          recipients: data.recipients,
          opens: data.opens,
          clicks: data.clicks,
          conversions: data.conversions,
          revenue: data.revenue,
          openRate: Math.round(openRate * 100) / 100,
          clickRate: Math.round(clickRate * 100) / 100,
          conversionRate: Math.round(conversionRate * 100) / 100,
          revenuePerRecipient: Math.round(revenuePerRecipient * 100) / 100,
        };
      });

      // Calculate statistical significance
      const significance = calculateStatisticalSignificance(variantMetrics, abTestConfig.winnerMetric as string);

      // Determine winner if significant
      const winner =
        significance.isSignificant && significance.confidenceLevel >= 95
          ? significance.betterVariant
          : null;

      await auditLog('AI_GROWTH_ABTEST_RESULT', 'GrowthCampaign', {
        entityId: campaignId,
        changes: {
          testComplete: !!winner,
          winner,
          significance: significance.confidenceLevel,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        campaignId,
        testName: abTestConfig.testName,
        testElement: abTestConfig.testElement,
        variantMetrics,
        comparison: {
          winnerMetric: abTestConfig.winnerMetric,
          isSignificant: significance.isSignificant,
          confidenceLevel: significance.confidenceLevel,
          betterVariant: significance.betterVariant,
          improvement: significance.improvement,
        },
        winner,
        recommendation:
          winner != null
            ? `Variant ${winner} is the clear winner with ${significance.confidenceLevel}% confidence`
            : significance.isSignificant
              ? `Variant ${significance.betterVariant} is trending better, but more data needed`
              : 'No significant difference yet - continue testing',
        endsAt: abTestConfig.endsAt,
        testComplete: !!winner,
      };
    }),

  /**
   * Optimize campaign performance - AI optimization recommendations
   */
  optimizeCampaign: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { campaignId } = input;

      const campaign = await ctx.prisma.growthCampaign.findFirst({
        where: {
          id: campaignId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!campaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      // Calculate current performance metrics
      const currentPerformance = {
        impressions: campaign.totalImpressions,
        clicks: campaign.totalClicks,
        leads: campaign.totalLeads,
        conversions: campaign.totalConversions,
        revenue: Number(campaign.totalRevenue),
        ctr: campaign.totalImpressions > 0
          ? (campaign.totalClicks / campaign.totalImpressions) * 100
          : 0,
        conversionRate: campaign.totalClicks > 0
          ? (campaign.totalConversions / campaign.totalClicks) * 100
          : 0,
        costPerLead: campaign.actualSpend && campaign.totalLeads > 0
          ? Number(campaign.actualSpend) / campaign.totalLeads
          : null,
        roi: campaign.actualSpend && Number(campaign.actualSpend) > 0
          ? ((Number(campaign.totalRevenue) - Number(campaign.actualSpend)) / Number(campaign.actualSpend)) * 100
          : null,
      };

      // Generate optimization recommendations
      const recommendations = generateOptimizationRecommendations(
        campaign,
        currentPerformance
      );

      await auditLog('AI_GROWTH_CAMPAIGN_OPTIMIZED', 'GrowthCampaign', {
        entityId: campaignId,
        changes: {
          currentPerformance,
          recommendationsCount: recommendations.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        campaignId,
        campaignName: campaign.name,
        status: campaign.status,
        currentPerformance,
        benchmarks: getCampaignBenchmarks(campaign.campaignType),
        recommendations,
        optimizationScore: calculateOptimizationScore(currentPerformance, campaign.campaignType),
        nextSteps: recommendations.slice(0, 3).map((r) => r.action),
      };
    }),

  /**
   * Get campaign ROI report - Comprehensive ROI analysis
   */
  getCampaignROI: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().optional(),
        dateRange: z.object({
          start: z.date(),
          end: z.date(),
        }).optional(),
        groupBy: z.enum(['campaign', 'channel', 'type']).default('campaign'),
      })
    )
    .query(async ({ ctx, input }) => {
      const { campaignId, dateRange, groupBy } = input;

      const where: Prisma.GrowthCampaignWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (campaignId) {
        where.id = campaignId;
      }

      if (dateRange) {
        where.createdAt = {
          gte: dateRange.start,
          lte: dateRange.end,
        };
      }

      const campaigns = await ctx.prisma.growthCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      // Calculate ROI for each campaign
      const campaignROIs = campaigns.map((c) => {
        const spend = Number(c.actualSpend || 0);
        const revenue = Number(c.totalRevenue || 0);
        const profit = revenue - spend;
        const roi = spend > 0 ? (profit / spend) * 100 : 0;
        const costPerLead = c.totalLeads > 0 ? spend / c.totalLeads : 0;
        const costPerConversion = c.totalConversions > 0 ? spend / c.totalConversions : 0;
        const revenuePerConversion = c.totalConversions > 0 ? revenue / c.totalConversions : 0;

        return {
          campaignId: c.id,
          campaignName: c.name,
          campaignType: c.campaignType,
          channels: c.channels as string[],
          status: c.status,
          metrics: {
            spend,
            revenue,
            profit,
            roi: Math.round(roi * 100) / 100,
            costPerLead: Math.round(costPerLead * 100) / 100,
            costPerConversion: Math.round(costPerConversion * 100) / 100,
            revenuePerConversion: Math.round(revenuePerConversion * 100) / 100,
            impressions: c.totalImpressions,
            clicks: c.totalClicks,
            leads: c.totalLeads,
            conversions: c.totalConversions,
          },
          performance: {
            ctr: c.clickThroughRate ? Number(c.clickThroughRate) * 100 : 0,
            conversionRate: c.conversionRate ? Number(c.conversionRate) * 100 : 0,
            reachVsTarget: c.targetPatientCount
              ? (c.actualReach / c.targetPatientCount) * 100
              : 0,
            leadsVsTarget: c.targetLeads
              ? (c.totalLeads / c.targetLeads) * 100
              : 0,
            roiVsTarget: c.targetROI
              ? (roi / Number(c.targetROI)) * 100
              : 0,
          },
          startDate: c.startDate,
          endDate: c.endDate,
        };
      });

      // Aggregate by groupBy dimension
      let aggregated: Record<string, {
        count: number;
        totalSpend: number;
        totalRevenue: number;
        totalProfit: number;
        totalLeads: number;
        totalConversions: number;
        avgROI: number;
        avgCostPerLead: number;
        avgCostPerConversion: number;
      }> = {};

      if (groupBy === 'type') {
        aggregated = campaignROIs.reduce((acc, c) => {
          const key = c.campaignType;
          if (!acc[key]) {
            acc[key] = {
              count: 0,
              totalSpend: 0,
              totalRevenue: 0,
              totalProfit: 0,
              totalLeads: 0,
              totalConversions: 0,
              avgROI: 0,
              avgCostPerLead: 0,
              avgCostPerConversion: 0,
            };
          }
          acc[key].count++;
          acc[key].totalSpend += c.metrics.spend;
          acc[key].totalRevenue += c.metrics.revenue;
          acc[key].totalProfit += c.metrics.profit;
          acc[key].totalLeads += c.metrics.leads;
          acc[key].totalConversions += c.metrics.conversions;
          return acc;
        }, {} as typeof aggregated);

        // Calculate averages
        Object.keys(aggregated).forEach((key) => {
          const a = aggregated[key];
          a.avgROI = a.totalSpend > 0 ? (a.totalProfit / a.totalSpend) * 100 : 0;
          a.avgCostPerLead = a.totalLeads > 0 ? a.totalSpend / a.totalLeads : 0;
          a.avgCostPerConversion = a.totalConversions > 0 ? a.totalSpend / a.totalConversions : 0;
        });
      } else if (groupBy === 'channel') {
        campaignROIs.forEach((c) => {
          c.channels.forEach((channel) => {
            if (!aggregated[channel]) {
              aggregated[channel] = {
                count: 0,
                totalSpend: 0,
                totalRevenue: 0,
                totalProfit: 0,
                totalLeads: 0,
                totalConversions: 0,
                avgROI: 0,
                avgCostPerLead: 0,
                avgCostPerConversion: 0,
              };
            }
            const channelShare = 1 / c.channels.length;
            aggregated[channel].count++;
            aggregated[channel].totalSpend += c.metrics.spend * channelShare;
            aggregated[channel].totalRevenue += c.metrics.revenue * channelShare;
            aggregated[channel].totalProfit += c.metrics.profit * channelShare;
            aggregated[channel].totalLeads += Math.floor(c.metrics.leads * channelShare);
            aggregated[channel].totalConversions += Math.floor(c.metrics.conversions * channelShare);
          });
        });

        // Calculate averages
        Object.keys(aggregated).forEach((key) => {
          const a = aggregated[key];
          a.avgROI = a.totalSpend > 0 ? (a.totalProfit / a.totalSpend) * 100 : 0;
          a.avgCostPerLead = a.totalLeads > 0 ? a.totalSpend / a.totalLeads : 0;
          a.avgCostPerConversion = a.totalConversions > 0 ? a.totalSpend / a.totalConversions : 0;
        });
      }

      // Calculate totals
      const totals = {
        totalCampaigns: campaigns.length,
        totalSpend: campaignROIs.reduce((sum, c) => sum + c.metrics.spend, 0),
        totalRevenue: campaignROIs.reduce((sum, c) => sum + c.metrics.revenue, 0),
        totalProfit: campaignROIs.reduce((sum, c) => sum + c.metrics.profit, 0),
        totalLeads: campaignROIs.reduce((sum, c) => sum + c.metrics.leads, 0),
        totalConversions: campaignROIs.reduce((sum, c) => sum + c.metrics.conversions, 0),
        overallROI: 0,
        avgCostPerLead: 0,
        avgCostPerConversion: 0,
      };

      totals.overallROI = totals.totalSpend > 0
        ? (totals.totalProfit / totals.totalSpend) * 100
        : 0;
      totals.avgCostPerLead = totals.totalLeads > 0
        ? totals.totalSpend / totals.totalLeads
        : 0;
      totals.avgCostPerConversion = totals.totalConversions > 0
        ? totals.totalSpend / totals.totalConversions
        : 0;

      await auditLog('AI_GROWTH_ROI_CALCULATED', 'GrowthCampaign', {
        changes: {
          campaignCount: campaigns.length,
          dateRange,
          groupBy,
          overallROI: totals.overallROI,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        campaigns: campaignROIs,
        aggregated: groupBy !== 'campaign' ? aggregated : undefined,
        totals,
        insights: generateROIInsights(campaignROIs, totals),
        recommendations: generateROIRecommendations(campaignROIs, totals),
      };
    }),

  /**
   * Update campaign status - Pause, resume, or complete campaign
   */
  updateCampaignStatus: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { campaignId, status, reason } = input;

      const campaign = await ctx.prisma.growthCampaign.findFirst({
        where: {
          id: campaignId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!campaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      const updateData: Prisma.GrowthCampaignUpdateInput = {
        status,
      };

      if (status === 'COMPLETED' || status === 'CANCELLED') {
        updateData.endDate = new Date();
      }

      const updated = await ctx.prisma.growthCampaign.update({
        where: { id: campaignId },
        data: updateData,
      });

      const auditAction =
        status === 'ACTIVE'
          ? 'AI_GROWTH_CAMPAIGN_ACTIVATED'
          : status === 'PAUSED'
            ? 'AI_GROWTH_CAMPAIGN_PAUSED'
            : status === 'COMPLETED'
              ? 'AI_GROWTH_CAMPAIGN_COMPLETED'
              : 'AI_GROWTH_CAMPAIGN_CANCELLED';

      await auditLog(auditAction, 'GrowthCampaign', {
        entityId: campaignId,
        changes: {
          previousStatus: campaign.status,
          newStatus: status,
          reason,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        campaignId,
        name: updated.name,
        previousStatus: campaign.status,
        newStatus: status,
        updatedAt: updated.updatedAt,
      };
    }),

  /**
   * List campaigns - Get all campaigns with filtering
   */
  listCampaigns: protectedProcedure
    .input(
      z.object({
        status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
        campaignType: z.enum([
          'LEAD_GENERATION',
          'REACTIVATION',
          'REFERRAL',
          'REVIEW',
          'RETENTION',
          'UPSELL',
          'SEASONAL',
          'EVENT',
        ]).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        sortBy: z.enum(['createdAt', 'startDate', 'totalRevenue', 'totalConversions']).default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      })
    )
    .query(async ({ ctx, input }) => {
      const { status, campaignType, limit, offset, sortBy, sortOrder } = input;

      const where: Prisma.GrowthCampaignWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (status) {
        where.status = status;
      }

      if (campaignType) {
        where.campaignType = campaignType;
      }

      const orderBy: Prisma.GrowthCampaignOrderByWithRelationInput = {};
      orderBy[sortBy] = sortOrder;

      const [campaigns, total] = await Promise.all([
        ctx.prisma.growthCampaign.findMany({
          where,
          orderBy,
          take: limit,
          skip: offset,
        }),
        ctx.prisma.growthCampaign.count({ where }),
      ]);

      return {
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          campaignType: c.campaignType,
          status: c.status,
          channels: c.channels as string[],
          startDate: c.startDate,
          endDate: c.endDate,
          budget: c.budget ? Number(c.budget) : null,
          actualSpend: c.actualSpend ? Number(c.actualSpend) : null,
          targetLeads: c.targetLeads,
          targetConversions: c.targetConversions,
          actualReach: c.actualReach,
          totalImpressions: c.totalImpressions,
          totalClicks: c.totalClicks,
          totalLeads: c.totalLeads,
          totalConversions: c.totalConversions,
          totalRevenue: Number(c.totalRevenue),
          roi: c.roi ? Number(c.roi) * 100 : null,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        total,
        limit,
        offset,
        hasMore: offset + campaigns.length < total,
      };
    }),

  /**
   * Get campaign details - Full campaign information
   */
  getCampaign: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { campaignId } = input;

      const campaign = await ctx.prisma.growthCampaign.findFirst({
        where: {
          id: campaignId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!campaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      return {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        campaignType: campaign.campaignType,
        status: campaign.status,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        targetAudience: campaign.targetAudience,
        targetPatientCount: campaign.targetPatientCount,
        actualReach: campaign.actualReach,
        targetLeads: campaign.targetLeads,
        targetConversions: campaign.targetConversions,
        targetRevenue: campaign.targetRevenue ? Number(campaign.targetRevenue) : null,
        targetROI: campaign.targetROI ? Number(campaign.targetROI) : null,
        budget: campaign.budget ? Number(campaign.budget) : null,
        actualSpend: campaign.actualSpend ? Number(campaign.actualSpend) : null,
        contentStrategy: campaign.contentStrategy,
        messagingTone: campaign.messagingTone,
        channels: campaign.channels as string[],
        sequences: campaign.sequences,
        abTestConfig: campaign.abTestConfig,
        metrics: {
          totalImpressions: campaign.totalImpressions,
          totalClicks: campaign.totalClicks,
          totalLeads: campaign.totalLeads,
          totalConversions: campaign.totalConversions,
          totalRevenue: Number(campaign.totalRevenue),
          clickThroughRate: campaign.clickThroughRate ? Number(campaign.clickThroughRate) * 100 : null,
          conversionRate: campaign.conversionRate ? Number(campaign.conversionRate) * 100 : null,
          costPerLead: campaign.costPerLead ? Number(campaign.costPerLead) : null,
          costPerConversion: campaign.costPerConversion ? Number(campaign.costPerConversion) : null,
          roi: campaign.roi ? Number(campaign.roi) * 100 : null,
        },
        optimizationScore: campaign.optimizationScore,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      };
    }),

  // ============================================
  // US-362: Practice Growth Dashboard Endpoints
  // ============================================

  /**
   * Get dashboard summary - Overview of all growth metrics
   */
  getDashboardSummary: protectedProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.organizationId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Get lead counts and conversions
    const [
      totalLeads,
      newLeadsCurrent,
      newLeadsPrevious,
      hotLeads,
      convertedLeadsCurrent,
      convertedLeadsPrevious,
    ] = await Promise.all([
      ctx.prisma.growthLead.count({ where: { organizationId: orgId } }),
      ctx.prisma.growthLead.count({
        where: { organizationId: orgId, createdAt: { gte: thirtyDaysAgo } },
      }),
      ctx.prisma.growthLead.count({
        where: { organizationId: orgId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
      ctx.prisma.growthLead.count({
        where: { organizationId: orgId, status: 'HOT' },
      }),
      ctx.prisma.growthLead.count({
        where: { organizationId: orgId, status: 'CONVERTED', convertedAt: { gte: thirtyDaysAgo } },
      }),
      ctx.prisma.growthLead.count({
        where: { organizationId: orgId, status: 'CONVERTED', convertedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
    ]);

    // Get reputation metrics
    const reputationMetrics = await ctx.prisma.reputationMetric.findMany({
      where: { organizationId: orgId },
      orderBy: { snapshotDate: 'desc' },
      take: 10,
    });

    const avgRating = reputationMetrics.length > 0
      ? reputationMetrics.reduce((sum, m) => sum + Number(m.averageRating), 0) / reputationMetrics.length
      : 0;

    // Get referral counts
    const [referralsCurrent, referralsPrevious] = await Promise.all([
      ctx.prisma.referralOpportunity.count({
        where: { organizationId: orgId, referralMade: true, referralDate: { gte: thirtyDaysAgo } },
      }),
      ctx.prisma.referralOpportunity.count({
        where: { organizationId: orgId, referralMade: true, referralDate: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
    ]);

    // Get active campaigns
    const activeCampaigns = await ctx.prisma.growthCampaign.count({
      where: { organizationId: orgId, status: 'ACTIVE' },
    });

    // Get campaign performance
    const campaigns = await ctx.prisma.growthCampaign.findMany({
      where: { organizationId: orgId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: {
        totalRevenue: true,
        actualSpend: true,
        totalConversions: true,
        totalLeads: true,
      },
    });

    const totalCampaignRevenue = campaigns.reduce((sum, c) => sum + Number(c.totalRevenue || 0), 0);
    const totalCampaignSpend = campaigns.reduce((sum, c) => sum + Number(c.actualSpend || 0), 0);
    const overallROI = totalCampaignSpend > 0 ? ((totalCampaignRevenue - totalCampaignSpend) / totalCampaignSpend) * 100 : 0;

    // Calculate trends
    const leadsTrend = newLeadsPrevious > 0
      ? ((newLeadsCurrent - newLeadsPrevious) / newLeadsPrevious) * 100
      : newLeadsCurrent > 0 ? 100 : 0;

    const conversionTrend = convertedLeadsPrevious > 0
      ? ((convertedLeadsCurrent - convertedLeadsPrevious) / convertedLeadsPrevious) * 100
      : convertedLeadsCurrent > 0 ? 100 : 0;

    const referralTrend = referralsPrevious > 0
      ? ((referralsCurrent - referralsPrevious) / referralsPrevious) * 100
      : referralsCurrent > 0 ? 100 : 0;

    return {
      leads: {
        total: totalLeads,
        new: newLeadsCurrent,
        hot: hotLeads,
        trend: leadsTrend,
      },
      conversions: {
        current: convertedLeadsCurrent,
        trend: conversionTrend,
        rate: newLeadsCurrent > 0 ? (convertedLeadsCurrent / newLeadsCurrent) * 100 : 0,
      },
      reputation: {
        averageRating: Math.round(avgRating * 10) / 10,
        totalReviews: reputationMetrics.reduce((sum, m) => sum + m.totalReviews, 0),
      },
      referrals: {
        current: referralsCurrent,
        trend: referralTrend,
      },
      campaigns: {
        active: activeCampaigns,
        totalRevenue: totalCampaignRevenue,
        totalSpend: totalCampaignSpend,
        roi: Math.round(overallROI * 10) / 10,
      },
    };
  }),

  /**
   * Get lead pipeline - Leads by status for funnel visualization
   */
  getLeadPipeline: protectedProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.organizationId;

    const statusCounts = await ctx.prisma.growthLead.groupBy({
      by: ['status'],
      where: { organizationId: orgId },
      _count: { id: true },
      _sum: { conversionValue: true },
    });

    const pipeline = [
      { stage: 'NEW', label: 'New Leads', count: 0, value: 0 },
      { stage: 'SCORING', label: 'Scoring', count: 0, value: 0 },
      { stage: 'HOT', label: 'Hot', count: 0, value: 0 },
      { stage: 'WARM', label: 'Warm', count: 0, value: 0 },
      { stage: 'COLD', label: 'Cold', count: 0, value: 0 },
      { stage: 'NURTURING', label: 'Nurturing', count: 0, value: 0 },
      { stage: 'READY', label: 'Ready', count: 0, value: 0 },
      { stage: 'CONVERTED', label: 'Converted', count: 0, value: 0 },
      { stage: 'LOST', label: 'Lost', count: 0, value: 0 },
    ];

    statusCounts.forEach((sc) => {
      const stage = pipeline.find((p) => p.stage === sc.status);
      if (stage && sc._count) {
        stage.count = sc._count.id;
        stage.value = Number(sc._sum?.conversionValue || 0);
      }
    });

    // Calculate conversion funnel metrics
    const totalLeads = pipeline.reduce((sum, p) => sum + p.count, 0);
    const convertedCount = pipeline.find((p) => p.stage === 'CONVERTED')?.count || 0;
    const hotCount = pipeline.find((p) => p.stage === 'HOT')?.count || 0;
    const readyCount = pipeline.find((p) => p.stage === 'READY')?.count || 0;

    return {
      pipeline,
      metrics: {
        totalLeads,
        conversionRate: totalLeads > 0 ? (convertedCount / totalLeads) * 100 : 0,
        hotLeadRate: totalLeads > 0 ? (hotCount / totalLeads) * 100 : 0,
        readyToConvertRate: totalLeads > 0 ? (readyCount / totalLeads) * 100 : 0,
      },
    };
  }),

  /**
   * Get conversion funnel - Detailed conversion metrics
   */
  getConversionFunnel: protectedProcedure
    .input(
      z.object({
        dateRange: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      const { dateRange } = input;

      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get leads created in date range
      const leads = await ctx.prisma.growthLead.findMany({
        where: {
          organizationId: orgId,
          createdAt: { gte: startDate },
        },
        select: {
          status: true,
          source: true,
          qualityScore: true,
          createdAt: true,
          convertedAt: true,
          conversionValue: true,
        },
      });

      // Calculate funnel stages
      const totalLeads = leads.length;
      const qualifiedLeads = leads.filter((l) => (l.qualityScore || 0) >= 50).length;
      const nurturingLeads = leads.filter((l) => l.status === 'NURTURING' || l.status === 'HOT' || l.status === 'WARM').length;
      const readyLeads = leads.filter((l) => l.status === 'READY' || l.status === 'CONVERTED').length;
      const convertedLeads = leads.filter((l) => l.status === 'CONVERTED').length;

      // Calculate time to conversion
      const convertedWithTime = leads.filter((l) => l.status === 'CONVERTED' && l.convertedAt);
      const avgTimeToConvert = convertedWithTime.length > 0
        ? convertedWithTime.reduce((sum, l) => {
            const diff = l.convertedAt!.getTime() - l.createdAt.getTime();
            return sum + diff / (1000 * 60 * 60 * 24); // days
          }, 0) / convertedWithTime.length
        : 0;

      // Calculate value
      const totalValue = convertedWithTime.reduce((sum, l) => sum + Number(l.conversionValue || 0), 0);

      return {
        funnel: [
          { stage: 'Total Leads', count: totalLeads, percentage: 100 },
          { stage: 'Qualified', count: qualifiedLeads, percentage: totalLeads > 0 ? (qualifiedLeads / totalLeads) * 100 : 0 },
          { stage: 'Engaged', count: nurturingLeads, percentage: totalLeads > 0 ? (nurturingLeads / totalLeads) * 100 : 0 },
          { stage: 'Ready', count: readyLeads, percentage: totalLeads > 0 ? (readyLeads / totalLeads) * 100 : 0 },
          { stage: 'Converted', count: convertedLeads, percentage: totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0 },
        ],
        metrics: {
          overallConversionRate: totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0,
          qualifiedConversionRate: qualifiedLeads > 0 ? (convertedLeads / qualifiedLeads) * 100 : 0,
          avgTimeToConvert: Math.round(avgTimeToConvert * 10) / 10,
          totalValue,
          avgDealValue: convertedLeads > 0 ? totalValue / convertedLeads : 0,
        },
        dateRange,
      };
    }),

  /**
   * Get growth KPIs - Key performance indicators
   */
  getGrowthKPIs: protectedProcedure
    .input(
      z.object({
        dateRange: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      const { dateRange } = input;

      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - days);

      // New patients (converted leads)
      const [newPatientsCurrent, newPatientsPrevious] = await Promise.all([
        ctx.prisma.growthLead.count({
          where: { organizationId: orgId, status: 'CONVERTED', convertedAt: { gte: startDate } },
        }),
        ctx.prisma.growthLead.count({
          where: { organizationId: orgId, status: 'CONVERTED', convertedAt: { gte: previousStartDate, lt: startDate } },
        }),
      ]);

      // Leads generated
      const [leadsCurrent, leadsPrevious] = await Promise.all([
        ctx.prisma.growthLead.count({
          where: { organizationId: orgId, createdAt: { gte: startDate } },
        }),
        ctx.prisma.growthLead.count({
          where: { organizationId: orgId, createdAt: { gte: previousStartDate, lt: startDate } },
        }),
      ]);

      // Referrals
      const [referralsCurrent, referralsPrevious] = await Promise.all([
        ctx.prisma.referralOpportunity.count({
          where: { organizationId: orgId, referralMade: true, referralDate: { gte: startDate } },
        }),
        ctx.prisma.referralOpportunity.count({
          where: { organizationId: orgId, referralMade: true, referralDate: { gte: previousStartDate, lt: startDate } },
        }),
      ]);

      // Reactivations
      const [reactivationsCurrent, reactivationsPrevious] = await Promise.all([
        ctx.prisma.reactivationOpportunity.count({
          where: { organizationId: orgId, reactivated: true, reactivationDate: { gte: startDate } },
        }),
        ctx.prisma.reactivationOpportunity.count({
          where: { organizationId: orgId, reactivated: true, reactivationDate: { gte: previousStartDate, lt: startDate } },
        }),
      ]);

      // Reviews
      const [reviewsCurrent, reviewsPrevious] = await Promise.all([
        ctx.prisma.reviewRequest.count({
          where: { organizationId: orgId, reviewedAt: { gte: startDate } },
        }),
        ctx.prisma.reviewRequest.count({
          where: { organizationId: orgId, reviewedAt: { gte: previousStartDate, lt: startDate } },
        }),
      ]);

      // Campaign metrics
      const campaigns = await ctx.prisma.growthCampaign.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { startDate: { gte: startDate } },
            { status: 'ACTIVE' },
          ],
        },
        select: {
          totalRevenue: true,
          actualSpend: true,
          totalConversions: true,
          totalLeads: true,
        },
      });

      const totalRevenue = campaigns.reduce((sum, c) => sum + Number(c.totalRevenue || 0), 0);
      const totalSpend = campaigns.reduce((sum, c) => sum + Number(c.actualSpend || 0), 0);

      // Helper to calculate trend
      const calcTrend = (current: number, previous: number) =>
        previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;

      return {
        kpis: [
          {
            id: 'new_patients',
            label: 'New Patients',
            value: newPatientsCurrent,
            previousValue: newPatientsPrevious,
            trend: calcTrend(newPatientsCurrent, newPatientsPrevious),
            target: null,
          },
          {
            id: 'leads_generated',
            label: 'Leads Generated',
            value: leadsCurrent,
            previousValue: leadsPrevious,
            trend: calcTrend(leadsCurrent, leadsPrevious),
            target: null,
          },
          {
            id: 'conversion_rate',
            label: 'Conversion Rate',
            value: leadsCurrent > 0 ? Math.round((newPatientsCurrent / leadsCurrent) * 100 * 10) / 10 : 0,
            previousValue: leadsPrevious > 0 ? Math.round((newPatientsPrevious / leadsPrevious) * 100 * 10) / 10 : 0,
            trend: null,
            target: 25, // 25% target
            unit: '%',
          },
          {
            id: 'referrals',
            label: 'Referrals',
            value: referralsCurrent,
            previousValue: referralsPrevious,
            trend: calcTrend(referralsCurrent, referralsPrevious),
            target: null,
          },
          {
            id: 'reactivations',
            label: 'Reactivations',
            value: reactivationsCurrent,
            previousValue: reactivationsPrevious,
            trend: calcTrend(reactivationsCurrent, reactivationsPrevious),
            target: null,
          },
          {
            id: 'reviews',
            label: 'New Reviews',
            value: reviewsCurrent,
            previousValue: reviewsPrevious,
            trend: calcTrend(reviewsCurrent, reviewsPrevious),
            target: null,
          },
          {
            id: 'campaign_revenue',
            label: 'Campaign Revenue',
            value: totalRevenue,
            previousValue: null,
            trend: null,
            target: null,
            unit: '$',
          },
          {
            id: 'roi',
            label: 'Overall ROI',
            value: totalSpend > 0 ? Math.round(((totalRevenue - totalSpend) / totalSpend) * 100 * 10) / 10 : 0,
            previousValue: null,
            trend: null,
            target: 300, // 300% ROI target
            unit: '%',
          },
        ],
        dateRange,
      };
    }),

  /**
   * Get patient acquisition cost - CAC by channel
   */
  getPatientAcquisitionCost: protectedProcedure
    .input(
      z.object({
        dateRange: z.enum(['30d', '90d', '1y']).default('90d'),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      const { dateRange } = input;

      const days = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get converted leads by source
      const convertedLeads = await ctx.prisma.growthLead.findMany({
        where: {
          organizationId: orgId,
          status: 'CONVERTED',
          convertedAt: { gte: startDate },
        },
        select: {
          source: true,
          conversionValue: true,
        },
      });

      // Get campaign spend by channel
      const campaigns = await ctx.prisma.growthCampaign.findMany({
        where: {
          organizationId: orgId,
          startDate: { gte: startDate },
        },
        select: {
          channels: true,
          actualSpend: true,
          totalConversions: true,
        },
      });

      // Aggregate by source
      const sourceMap: Record<string, { conversions: number; value: number; spend: number }> = {};
      const sources = ['website', 'referral', 'phone', 'walk_in', 'social', 'email', 'ads', 'other'];

      sources.forEach((s) => {
        sourceMap[s] = { conversions: 0, value: 0, spend: 0 };
      });

      // Count conversions by source
      convertedLeads.forEach((lead) => {
        const source = lead.source?.toLowerCase() || 'other';
        const key = sources.includes(source) ? source : 'other';
        sourceMap[key].conversions++;
        sourceMap[key].value += Number(lead.conversionValue || 0);
      });

      // Allocate campaign spend to channels
      campaigns.forEach((c) => {
        const channelList = c.channels as string[] || [];
        const spendPerChannel = Number(c.actualSpend || 0) / (channelList.length || 1);

        channelList.forEach((channel) => {
          // Map campaign channels to sources
          let source = 'other';
          if (channel.toLowerCase().includes('email')) source = 'email';
          else if (channel.toLowerCase().includes('social')) source = 'social';
          else if (channel.toLowerCase().includes('sms')) source = 'phone';
          else if (channel.toLowerCase().includes('ads') || channel.toLowerCase().includes('ppc')) source = 'ads';
          else if (channel.toLowerCase().includes('direct')) source = 'direct_mail';

          if (sourceMap[source]) {
            sourceMap[source].spend += spendPerChannel;
          }
        });
      });

      // Calculate CAC for each source
      const acquisitionCosts = Object.entries(sourceMap)
        .filter(([_, data]) => data.conversions > 0 || data.spend > 0)
        .map(([source, data]) => ({
          source,
          conversions: data.conversions,
          spend: data.spend,
          cac: data.conversions > 0 ? data.spend / data.conversions : 0,
          ltv: data.conversions > 0 ? data.value / data.conversions : 0,
          ltvCacRatio: data.spend > 0 && data.conversions > 0
            ? (data.value / data.conversions) / (data.spend / data.conversions)
            : 0,
        }))
        .sort((a, b) => b.conversions - a.conversions);

      // Calculate overall metrics
      const totalConversions = acquisitionCosts.reduce((sum, a) => sum + a.conversions, 0);
      const totalSpend = acquisitionCosts.reduce((sum, a) => sum + a.spend, 0);
      const totalValue = acquisitionCosts.reduce((sum, a) => sum + (a.ltv * a.conversions), 0);

      return {
        bySource: acquisitionCosts,
        overall: {
          totalConversions,
          totalSpend,
          avgCAC: totalConversions > 0 ? totalSpend / totalConversions : 0,
          avgLTV: totalConversions > 0 ? totalValue / totalConversions : 0,
          ltvCacRatio: totalSpend > 0 && totalConversions > 0
            ? (totalValue / totalConversions) / (totalSpend / totalConversions)
            : 0,
        },
        dateRange,
      };
    }),

  /**
   * Get campaign performance summary - For dashboard
   */
  getCampaignPerformanceSummary: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(10).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      const { limit } = input;

      // Get recent active/completed campaigns
      const campaigns = await ctx.prisma.growthCampaign.findMany({
        where: {
          organizationId: orgId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
        },
        orderBy: { startDate: 'desc' },
        take: limit,
      });

      // Get campaign type summary
      const typeSummary = await ctx.prisma.growthCampaign.groupBy({
        by: ['campaignType'],
        where: { organizationId: orgId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        _count: { id: true },
        _sum: { totalRevenue: true, actualSpend: true, totalConversions: true },
      });

      return {
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.campaignType,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
          budget: c.budget ? Number(c.budget) : null,
          spend: c.actualSpend ? Number(c.actualSpend) : 0,
          revenue: Number(c.totalRevenue || 0),
          conversions: c.totalConversions || 0,
          roi: c.actualSpend && Number(c.actualSpend) > 0
            ? ((Number(c.totalRevenue || 0) - Number(c.actualSpend)) / Number(c.actualSpend)) * 100
            : 0,
        })),
        byType: typeSummary.map((ts) => ({
          type: ts.campaignType,
          count: ts._count.id,
          revenue: Number(ts._sum.totalRevenue || 0),
          spend: Number(ts._sum.actualSpend || 0),
          conversions: ts._sum.totalConversions || 0,
          roi: Number(ts._sum.actualSpend || 0) > 0
            ? ((Number(ts._sum.totalRevenue || 0) - Number(ts._sum.actualSpend || 0)) / Number(ts._sum.actualSpend || 0)) * 100
            : 0,
        })),
      };
    }),

  /**
   * Get ROI by marketing channel - For dashboard chart
   */
  getROIByChannel: protectedProcedure
    .input(
      z.object({
        dateRange: z.enum(['30d', '90d', '1y']).default('90d'),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      const { dateRange } = input;

      const days = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const campaigns = await ctx.prisma.growthCampaign.findMany({
        where: {
          organizationId: orgId,
          startDate: { gte: startDate },
          status: { in: ['ACTIVE', 'COMPLETED'] },
        },
        select: {
          channels: true,
          totalRevenue: true,
          actualSpend: true,
          totalConversions: true,
          totalLeads: true,
        },
      });

      // Aggregate by channel
      const channelMap: Record<string, {
        spend: number;
        revenue: number;
        conversions: number;
        leads: number;
        campaigns: number;
      }> = {};

      campaigns.forEach((c) => {
        const channelList = c.channels as string[] || ['other'];
        const sharePerChannel = 1 / channelList.length;

        channelList.forEach((channel) => {
          const key = channel.toLowerCase();
          if (!channelMap[key]) {
            channelMap[key] = { spend: 0, revenue: 0, conversions: 0, leads: 0, campaigns: 0 };
          }
          channelMap[key].spend += Number(c.actualSpend || 0) * sharePerChannel;
          channelMap[key].revenue += Number(c.totalRevenue || 0) * sharePerChannel;
          channelMap[key].conversions += Math.floor((c.totalConversions || 0) * sharePerChannel);
          channelMap[key].leads += Math.floor((c.totalLeads || 0) * sharePerChannel);
          channelMap[key].campaigns++;
        });
      });

      const channels = Object.entries(channelMap)
        .map(([channel, data]) => ({
          channel,
          ...data,
          roi: data.spend > 0 ? ((data.revenue - data.spend) / data.spend) * 100 : 0,
          costPerConversion: data.conversions > 0 ? data.spend / data.conversions : 0,
          conversionRate: data.leads > 0 ? (data.conversions / data.leads) * 100 : 0,
        }))
        .sort((a, b) => b.roi - a.roi);

      return {
        channels,
        dateRange,
      };
    }),
});
