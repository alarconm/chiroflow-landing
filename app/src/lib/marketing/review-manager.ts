// Review Manager Service - Review Solicitation
import { prisma } from '@/lib/prisma';
import type { ReviewPlatform, ReviewRequestStatus, Prisma } from '@prisma/client';

export interface ReviewPlatformConfig {
  platform: ReviewPlatform;
  reviewUrl: string;
  enabled: boolean;
  priority: number; // Lower = higher priority
}

const DEFAULT_PLATFORMS: ReviewPlatformConfig[] = [
  { platform: 'GOOGLE', reviewUrl: '', enabled: true, priority: 1 },
  { platform: 'YELP', reviewUrl: '', enabled: false, priority: 2 },
  { platform: 'FACEBOOK', reviewUrl: '', enabled: false, priority: 3 },
  { platform: 'HEALTHGRADES', reviewUrl: '', enabled: false, priority: 4 },
];

export interface ReviewRequestInput {
  patientId: string;
  platform: ReviewPlatform;
  triggeredByAppointmentId?: string;
  scheduledFor?: Date;
}

export interface ReviewStatistics {
  total: number;
  byStatus: Record<ReviewRequestStatus, number>;
  byPlatform: Record<ReviewPlatform, number>;
  responseRate: number;
  averageRating: number | null;
}

export class ReviewManager {
  private organizationId: string;
  private platforms: ReviewPlatformConfig[];

  constructor(organizationId: string, platforms?: ReviewPlatformConfig[]) {
    this.organizationId = organizationId;
    this.platforms = platforms || DEFAULT_PLATFORMS;
  }

  // Configure review platforms
  configurePlatforms(platforms: ReviewPlatformConfig[]) {
    this.platforms = platforms;
  }

  // Get enabled platforms sorted by priority
  getEnabledPlatforms(): ReviewPlatformConfig[] {
    return this.platforms
      .filter((p) => p.enabled && p.reviewUrl)
      .sort((a, b) => a.priority - b.priority);
  }

  // Get the primary platform for reviews
  getPrimaryPlatform(): ReviewPlatformConfig | null {
    const enabled = this.getEnabledPlatforms();
    return enabled[0] || null;
  }

  // Create a review request
  async createReviewRequest(input: ReviewRequestInput) {
    // Check if patient has recent review request
    const recentRequest = await prisma.reviewRequest.findFirst({
      where: {
        patientId: input.patientId,
        organizationId: this.organizationId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30 days
        status: { in: ['PENDING', 'SENT', 'CLICKED'] },
      },
    });

    if (recentRequest) {
      throw new Error('Patient already has a pending review request within the last 30 days');
    }

    // Get platform config for review URL
    const platformConfig = this.platforms.find((p) => p.platform === input.platform);
    const reviewUrl = platformConfig?.reviewUrl || null;

    // Set expiration (7 days default)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return prisma.reviewRequest.create({
      data: {
        patientId: input.patientId,
        platform: input.platform,
        triggeredByAppointmentId: input.triggeredByAppointmentId,
        scheduledFor: input.scheduledFor,
        expiresAt,
        reviewUrl,
        organizationId: this.organizationId,
      },
      include: {
        patient: {
          include: {
            demographics: { select: { firstName: true, lastName: true } },
            contacts: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
    });
  }

  // Send a review request (mark as sent)
  async sendReviewRequest(requestId: string, sentVia: 'email' | 'sms', messageId?: string) {
    const request = await prisma.reviewRequest.findFirst({
      where: {
        id: requestId,
        organizationId: this.organizationId,
        status: 'PENDING',
      },
    });

    if (!request) {
      throw new Error('Review request not found or already sent');
    }

    return prisma.reviewRequest.update({
      where: { id: requestId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentVia,
        messageId,
      },
    });
  }

  // Track review link click
  async trackClick(requestId: string) {
    const request = await prisma.reviewRequest.findFirst({
      where: {
        id: requestId,
        organizationId: this.organizationId,
        status: { in: ['SENT', 'CLICKED'] },
      },
    });

    if (!request) {
      throw new Error('Review request not found');
    }

    return prisma.reviewRequest.update({
      where: { id: requestId },
      data: {
        status: 'CLICKED',
        clickedAt: new Date(),
      },
    });
  }

  // Record that review was completed
  async recordReview(requestId: string, rating?: number) {
    const request = await prisma.reviewRequest.findFirst({
      where: {
        id: requestId,
        organizationId: this.organizationId,
      },
    });

    if (!request) {
      throw new Error('Review request not found');
    }

    return prisma.reviewRequest.update({
      where: { id: requestId },
      data: {
        status: 'REVIEWED',
        reviewedAt: new Date(),
        rating,
      },
    });
  }

  // Mark request as declined
  async markDeclined(requestId: string) {
    return prisma.reviewRequest.update({
      where: { id: requestId },
      data: { status: 'DECLINED' },
    });
  }

  // Mark request as failed
  async markFailed(requestId: string, reason: string) {
    return prisma.reviewRequest.update({
      where: { id: requestId },
      data: {
        status: 'FAILED',
        failureReason: reason,
      },
    });
  }

  // Get pending requests to send
  async getPendingRequests(limit = 50) {
    const now = new Date();

    return prisma.reviewRequest.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'PENDING',
        OR: [
          { scheduledFor: null },
          { scheduledFor: { lte: now } },
        ],
        expiresAt: { gt: now },
      },
      include: {
        patient: {
          include: {
            demographics: { select: { firstName: true, lastName: true } },
            contacts: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  // Get review requests for a patient
  async getPatientRequests(patientId: string) {
    return prisma.reviewRequest.findMany({
      where: {
        patientId,
        organizationId: this.organizationId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get all requests with filters
  async getRequests(
    filters?: {
      status?: ReviewRequestStatus | ReviewRequestStatus[];
      platform?: ReviewPlatform;
      startDate?: Date;
      endDate?: Date;
    },
    limit = 50,
    offset = 0
  ) {
    const where: Prisma.ReviewRequestWhereInput = {
      organizationId: this.organizationId,
    };

    if (filters) {
      if (filters.status) {
        where.status = Array.isArray(filters.status)
          ? { in: filters.status }
          : filters.status;
      }
      if (filters.platform) {
        where.platform = filters.platform;
      }
      if (filters.startDate || filters.endDate) {
        where.createdAt = {
          ...(filters.startDate && { gte: filters.startDate }),
          ...(filters.endDate && { lte: filters.endDate }),
        };
      }
    }

    const [requests, total] = await Promise.all([
      prisma.reviewRequest.findMany({
        where,
        include: {
          patient: {
            include: {
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.reviewRequest.count({ where }),
    ]);

    return { requests, total, limit, offset, hasMore: offset + requests.length < total };
  }

  // Get review statistics
  async getStatistics(startDate?: Date, endDate?: Date): Promise<ReviewStatistics> {
    const where: Prisma.ReviewRequestWhereInput = {
      organizationId: this.organizationId,
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    };

    const [total, statusCounts, platformCounts, reviewed, avgRating] = await Promise.all([
      prisma.reviewRequest.count({ where }),
      prisma.reviewRequest.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      prisma.reviewRequest.groupBy({
        by: ['platform'],
        where,
        _count: { id: true },
      }),
      prisma.reviewRequest.count({ where: { ...where, status: 'REVIEWED' } }),
      prisma.reviewRequest.aggregate({
        where: { ...where, rating: { not: null } },
        _avg: { rating: true },
      }),
    ]);

    const sent = await prisma.reviewRequest.count({
      where: { ...where, status: { in: ['SENT', 'CLICKED', 'REVIEWED', 'DECLINED'] } },
    });

    const byStatus = Object.fromEntries(
      statusCounts.map((s) => [s.status, s._count.id])
    ) as Record<ReviewRequestStatus, number>;

    const byPlatform = Object.fromEntries(
      platformCounts.map((p) => [p.platform, p._count.id])
    ) as Record<ReviewPlatform, number>;

    return {
      total,
      byStatus,
      byPlatform,
      responseRate: sent > 0 ? (reviewed / sent) * 100 : 0,
      averageRating: avgRating._avg.rating,
    };
  }

  // Auto-request reviews after appointments
  async processAppointmentReviews(delayHours = 2) {
    // Get completed appointments from the last day that haven't had review requests
    const cutoffTime = new Date(Date.now() - delayHours * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const completedAppointments = await prisma.appointment.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'COMPLETED',
        endTime: {
          gte: yesterday,
          lte: cutoffTime,
        },
      },
      include: {
        patient: {
          include: {
            demographics: true,
            communicationPreference: true,
            reviewRequests: {
              where: {
                createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                status: { in: ['PENDING', 'SENT', 'CLICKED'] },
              },
            },
          },
        },
      },
    });

    const primaryPlatform = this.getPrimaryPlatform();
    if (!primaryPlatform) {
      return { created: 0, error: 'No primary platform configured' };
    }

    let created = 0;
    for (const appointment of completedAppointments) {
      // Skip if patient already has pending review request
      if (appointment.patient.reviewRequests.length > 0) continue;

      // Skip if patient opted out of marketing
      if (appointment.patient.communicationPreference?.optOutMarketing) continue;

      try {
        await this.createReviewRequest({
          patientId: appointment.patientId,
          platform: primaryPlatform.platform,
          triggeredByAppointmentId: appointment.id,
        });
        created++;
      } catch (error) {
        // Log error but continue processing
        console.error(`[ReviewManager] Error creating review request:`, error);
      }
    }

    return { created };
  }

  // Clean up expired requests
  async processExpiredRequests() {
    const now = new Date();

    const expired = await prisma.reviewRequest.updateMany({
      where: {
        organizationId: this.organizationId,
        status: { in: ['PENDING', 'SENT'] },
        expiresAt: { lt: now },
      },
      data: {
        status: 'FAILED',
        failureReason: 'Request expired',
      },
    });

    return expired.count;
  }
}
