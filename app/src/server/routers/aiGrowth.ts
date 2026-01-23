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
});
