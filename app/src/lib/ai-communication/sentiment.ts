/**
 * Epic 12: AI Communication Agent - Sentiment Analysis Service
 *
 * Analyzes patient feedback and communications for sentiment.
 */

import type { PrismaClient, FeedbackSentiment } from '@prisma/client';
import type {
  SentimentAnalysisRequest,
  SentimentAnalysisResult,
  FeedbackSummary,
  PatientFeedbackSummary,
  SentimentTrend,
} from './types';
import { mockLLM } from './mock-llm';

/**
 * Sentiment Analysis Service
 */
export class SentimentAnalysisService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Analyze sentiment of text
   */
  async analyzeSentiment(request: SentimentAnalysisRequest): Promise<SentimentAnalysisResult> {
    const { text, source } = request;

    // Use mock LLM for sentiment analysis
    const result = mockLLM.analyzeSentiment(text);

    return {
      sentiment: this.scoreToSentiment(result.score),
      score: result.score,
      confidence: result.confidence,
      keyPhrases: result.keyPhrases,
      topics: this.extractTopics(text),
      suggestedActions: this.getSuggestedActions(result.score, result.keyPhrases),
    };
  }

  /**
   * Convert numeric score to sentiment enum
   */
  private scoreToSentiment(score: number): FeedbackSentiment {
    if (score >= 0.3) return 'POSITIVE';
    if (score <= -0.3) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  /**
   * Extract topics from text
   */
  private extractTopics(text: string): string[] {
    const topics: string[] = [];
    const lower = text.toLowerCase();

    const topicPatterns: Record<string, string[]> = {
      'wait_time': ['wait', 'waiting', 'took too long', 'delayed', 'late'],
      'staff': ['staff', 'receptionist', 'front desk', 'employee', 'assistant'],
      'treatment': ['treatment', 'adjustment', 'therapy', 'care', 'procedure'],
      'billing': ['bill', 'billing', 'charge', 'payment', 'insurance', 'cost', 'price'],
      'scheduling': ['appointment', 'schedule', 'book', 'reschedule', 'cancel'],
      'facility': ['office', 'facility', 'clean', 'parking', 'location'],
      'communication': ['call', 'email', 'message', 'communication', 'response'],
      'results': ['better', 'improvement', 'relief', 'pain', 'feeling'],
      'doctor': ['doctor', 'dr', 'chiropractor', 'provider', 'physician'],
    };

    for (const [topic, keywords] of Object.entries(topicPatterns)) {
      if (keywords.some(keyword => lower.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * Get suggested actions based on sentiment
   */
  private getSuggestedActions(score: number, keyPhrases?: string[]): string[] {
    const actions: string[] = [];

    if (score <= -0.3) {
      actions.push('Flag for immediate follow-up');
      actions.push('Schedule callback with patient care coordinator');

      // Specific actions based on detected issues
      if (keyPhrases?.some(p => p.toLowerCase().includes('wait'))) {
        actions.push('Review scheduling efficiency');
      }
      if (keyPhrases?.some(p => p.toLowerCase().includes('billing') || p.toLowerCase().includes('charge'))) {
        actions.push('Connect with billing department');
      }
      if (keyPhrases?.some(p => p.toLowerCase().includes('staff') || p.toLowerCase().includes('rude'))) {
        actions.push('Review incident with staff member');
      }
    } else if (score >= 0.5) {
      actions.push('Consider requesting Google review');
      actions.push('Add to testimonial candidates');
      actions.push('Thank patient for positive feedback');
    }

    return actions;
  }

  /**
   * Store feedback with sentiment analysis
   */
  async storeFeedback(
    organizationId: string,
    patientId: string,
    content: string,
    source: string
  ): Promise<{ id: string; sentiment: FeedbackSentiment; score: number }> {
    const analysis = await this.analyzeSentiment({ text: content, source });

    const feedback = await this.prisma.patientFeedback.create({
      data: {
        organizationId,
        patientId,
        content,
        source,
        sentiment: analysis.sentiment,
        sentimentScore: analysis.score,
        keyTopics: analysis.topics || [],
        requiresFollowUp: analysis.sentiment === 'NEGATIVE',
      },
    });

    return {
      id: feedback.id,
      sentiment: feedback.sentiment!,
      score: feedback.sentimentScore!,
    };
  }

  /**
   * Get feedback summary for organization
   */
  async getFeedbackSummary(
    organizationId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      sources?: string[];
    } = {}
  ): Promise<FeedbackSummary> {
    const { startDate, endDate, sources } = options;

    const where: Record<string, unknown> = { organizationId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
    }

    if (sources?.length) {
      where.source = { in: sources };
    }

    // Get all feedback
    const feedback = await this.prisma.patientFeedback.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            demographics: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate sentiment breakdown
    const sentimentBreakdown = {
      positive: feedback.filter(f => f.sentiment === 'POSITIVE').length,
      neutral: feedback.filter(f => f.sentiment === 'NEUTRAL').length,
      negative: feedback.filter(f => f.sentiment === 'NEGATIVE').length,
    };

    // Calculate average sentiment
    const totalScore = feedback.reduce((sum, f) => sum + (f.sentimentScore ?? 0), 0);
    const averageSentiment = feedback.length > 0 ? totalScore / feedback.length : 0;

    // Get top topics
    const topicCounts: Record<string, number> = {};
    for (const f of feedback) {
      for (const topic of f.keyTopics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }
    const topTopics = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Get recent negative feedback
    const recentNegative: PatientFeedbackSummary[] = feedback
      .filter(f => f.sentiment === 'NEGATIVE')
      .slice(0, 10)
      .map(f => ({
        id: f.id,
        patientName: f.patient?.demographics
          ? `${f.patient.demographics.firstName} ${f.patient.demographics.lastName}`
          : 'Unknown Patient',
        content: f.content,
        sentiment: f.sentiment!,
        sentimentScore: f.sentimentScore!,
        source: f.source,
        createdAt: f.createdAt,
      }));

    // Count requiring follow-up
    const requiresFollowUp = feedback.filter(f => f.requiresFollowUp && !f.followedUpAt).length;

    return {
      totalFeedback: feedback.length,
      averageSentiment,
      sentimentBreakdown,
      topTopics,
      recentNegative,
      requiresFollowUp,
    };
  }

  /**
   * Get sentiment trends over time
   */
  async getSentimentTrends(
    organizationId: string,
    options: {
      startDate: Date;
      endDate: Date;
      groupBy: 'day' | 'week' | 'month';
    }
  ): Promise<SentimentTrend[]> {
    const { startDate, endDate, groupBy } = options;

    const feedback = await this.prisma.patientFeedback.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group feedback by time period
    const groups: Record<string, { scores: number[]; count: number }> = {};

    for (const f of feedback) {
      const date = new Date(f.createdAt);
      let key: string;

      switch (groupBy) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      if (!groups[key]) {
        groups[key] = { scores: [], count: 0 };
      }
      groups[key].scores.push(f.sentimentScore ?? 0);
      groups[key].count++;
    }

    // Calculate averages and create trends
    const trends: SentimentTrend[] = Object.entries(groups).map(([dateStr, data]) => ({
      date: new Date(dateStr),
      averageScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
      count: data.count,
    }));

    return trends.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Mark feedback as followed up
   */
  async markFollowUpComplete(
    feedbackId: string,
    notes?: string
  ): Promise<void> {
    await this.prisma.patientFeedback.update({
      where: { id: feedbackId },
      data: {
        requiresFollowUp: false,
        followedUpAt: new Date(),
        followUpNotes: notes,
      },
    });
  }

  /**
   * Get feedback requiring follow-up
   */
  async getFeedbackRequiringFollowUp(
    organizationId: string,
    limit: number = 20
  ): Promise<PatientFeedbackSummary[]> {
    const feedback = await this.prisma.patientFeedback.findMany({
      where: {
        organizationId,
        requiresFollowUp: true,
        followedUpAt: null,
      },
      include: {
        patient: {
          select: {
            id: true,
            demographics: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return feedback.map(f => ({
      id: f.id,
      patientName: f.patient?.demographics
        ? `${f.patient.demographics.firstName} ${f.patient.demographics.lastName}`
        : 'Unknown Patient',
      content: f.content,
      sentiment: f.sentiment!,
      sentimentScore: f.sentimentScore!,
      source: f.source,
      createdAt: f.createdAt,
    }));
  }

  /**
   * Batch analyze multiple texts
   */
  async batchAnalyze(texts: { text: string; source?: string }[]): Promise<SentimentAnalysisResult[]> {
    return Promise.all(
      texts.map(({ text, source }) => this.analyzeSentiment({ text, source }))
    );
  }
}

/**
 * Create a sentiment analysis service instance
 */
export function createSentimentService(prisma: PrismaClient): SentimentAnalysisService {
  return new SentimentAnalysisService(prisma);
}

export default SentimentAnalysisService;
