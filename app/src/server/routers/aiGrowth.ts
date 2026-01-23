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
});
