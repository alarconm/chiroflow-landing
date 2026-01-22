// Lead Manager Service
import { prisma } from '@/lib/prisma';
import type { LeadStatus, LeadSource, Prisma } from '@prisma/client';

export interface LeadScoreFactors {
  emailOpened?: number;
  linkClicked?: number;
  formSubmitted?: number;
  phoneCalled?: number;
  appointmentScheduled?: number;
  visitedWebsite?: number;
  respondedToMessage?: number;
  noResponse?: number;
  unsubscribed?: number;
  [key: string]: number | undefined;
}

const DEFAULT_SCORE_FACTORS: LeadScoreFactors = {
  emailOpened: 5,
  linkClicked: 10,
  formSubmitted: 20,
  phoneCalled: 15,
  appointmentScheduled: 50,
  visitedWebsite: 2,
  respondedToMessage: 15,
  noResponse: -5,
  unsubscribed: -50,
};

export interface CreateLeadInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  source?: LeadSource;
  primaryConcern?: string;
  notes?: string;
  preferredContact?: string;
  preferredTimes?: string;
  dateOfBirth?: Date;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPage?: string;
  referrerUrl?: string;
  campaignId?: string;
  referralId?: string;
}

export interface LeadFilters {
  status?: LeadStatus | LeadStatus[];
  source?: LeadSource | LeadSource[];
  minScore?: number;
  maxScore?: number;
  assignedToUserId?: string;
  hasFollowUp?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string;
}

export class LeadManager {
  private organizationId: string;
  private scoreFactors: LeadScoreFactors;

  constructor(organizationId: string, scoreFactors?: LeadScoreFactors) {
    this.organizationId = organizationId;
    this.scoreFactors = { ...DEFAULT_SCORE_FACTORS, ...scoreFactors };
  }

  // Create a new lead
  async createLead(input: CreateLeadInput) {
    // Check for duplicate by email or phone
    if (input.email || input.phone) {
      const existing = await prisma.lead.findFirst({
        where: {
          organizationId: this.organizationId,
          OR: [
            ...(input.email ? [{ email: input.email }] : []),
            ...(input.phone ? [{ phone: input.phone }] : []),
          ],
        },
      });

      if (existing) {
        // Update existing lead with new info
        return prisma.lead.update({
          where: { id: existing.id },
          data: {
            // Only update if new value provided
            ...(input.firstName && { firstName: input.firstName }),
            ...(input.lastName && { lastName: input.lastName }),
            ...(input.primaryConcern && { primaryConcern: input.primaryConcern }),
            ...(input.notes && {
              notes: existing.notes
                ? `${existing.notes}\n\n---\n${new Date().toISOString()}: ${input.notes}`
                : input.notes,
            }),
          },
          include: { activities: { orderBy: { createdAt: 'desc' }, take: 5 } },
        });
      }
    }

    const lead = await prisma.lead.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        source: input.source || 'WEBSITE',
        primaryConcern: input.primaryConcern,
        notes: input.notes,
        preferredContact: input.preferredContact,
        preferredTimes: input.preferredTimes,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        address: input.address,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        utmContent: input.utmContent,
        utmTerm: input.utmTerm,
        landingPage: input.landingPage,
        referrerUrl: input.referrerUrl,
        campaignId: input.campaignId,
        referralId: input.referralId,
        organizationId: this.organizationId,
      },
    });

    // Log creation activity
    await this.addActivity(lead.id, 'lead_created', 'Lead was created', {
      source: input.source,
      campaignId: input.campaignId,
    });

    return lead;
  }

  // Update lead status
  async updateStatus(leadId: string, status: LeadStatus, userId?: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const oldStatus = lead.status;

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: { status },
    });

    await this.addActivity(leadId, 'status_change', `Status changed from ${oldStatus} to ${status}`, {
      oldStatus,
      newStatus: status,
      changedBy: userId,
    });

    return updated;
  }

  // Update lead score
  async updateScore(leadId: string, factor: keyof LeadScoreFactors, customAmount?: number) {
    const amount = customAmount ?? this.scoreFactors[factor] ?? 0;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const currentFactors = (lead.scoreFactors as Record<string, number>) || {};
    const factorCount = currentFactors[factor] || 0;

    const newScore = Math.max(0, lead.score + amount);
    const newFactors = {
      ...currentFactors,
      [factor]: factorCount + amount,
    };

    return prisma.lead.update({
      where: { id: leadId },
      data: {
        score: newScore,
        scoreFactors: newFactors as Prisma.InputJsonValue,
      },
    });
  }

  // Log a contact attempt
  async logContactAttempt(leadId: string, method: string, successful: boolean, notes?: string, userId?: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        lastContactedAt: new Date(),
        contactAttempts: { increment: 1 },
      },
    });

    await this.addActivity(
      leadId,
      `contact_${method}`,
      `${successful ? 'Successful' : 'Attempted'} ${method} contact${notes ? `: ${notes}` : ''}`,
      { method, successful, userId }
    );

    // Update score based on response
    if (successful) {
      await this.updateScore(leadId, 'respondedToMessage');
    } else {
      await this.updateScore(leadId, 'noResponse');
    }

    return lead;
  }

  // Set follow-up reminder
  async setFollowUp(leadId: string, followUpAt: Date, assignToUserId?: string) {
    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        nextFollowUpAt: followUpAt,
        ...(assignToUserId && { assignedToUserId: assignToUserId }),
      },
    });

    await this.addActivity(leadId, 'followup_set', `Follow-up scheduled for ${followUpAt.toLocaleDateString()}`, {
      followUpAt,
      assignedTo: assignToUserId,
    });

    return lead;
  }

  // Convert lead to patient
  async convertToPatient(leadId: string, patientId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: 'CONVERTED',
        convertedToPatientId: patientId,
        convertedAt: new Date(),
      },
    });

    await this.addActivity(leadId, 'converted', `Lead converted to patient ${patientId}`, {
      patientId,
    });

    // Update campaign metrics if from a campaign
    if (lead.campaignId) {
      await prisma.campaign.update({
        where: { id: lead.campaignId },
        data: {
          totalConversions: { increment: 1 },
        },
      });
    }

    return updated;
  }

  // Add activity to lead history
  async addActivity(
    leadId: string,
    activityType: string,
    description: string,
    metadata?: Record<string, unknown>,
    userId?: string
  ) {
    return prisma.leadActivity.create({
      data: {
        leadId,
        activityType,
        description,
        metadata: metadata as Prisma.InputJsonValue,
        performedBy: userId,
      },
    });
  }

  // Add note to lead
  async addNote(leadId: string, note: string, userId?: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const updatedNotes = lead.notes
      ? `${lead.notes}\n\n---\n${new Date().toISOString()}: ${note}`
      : note;

    await prisma.lead.update({
      where: { id: leadId },
      data: { notes: updatedNotes },
    });

    await this.addActivity(leadId, 'note_added', note, { userId });

    return { success: true };
  }

  // Get leads with filters
  async getLeads(filters?: LeadFilters, limit = 50, offset = 0) {
    const where: Prisma.LeadWhereInput = {
      organizationId: this.organizationId,
    };

    if (filters) {
      if (filters.status) {
        where.status = Array.isArray(filters.status)
          ? { in: filters.status }
          : filters.status;
      }
      if (filters.source) {
        where.source = Array.isArray(filters.source)
          ? { in: filters.source }
          : filters.source;
      }
      if (filters.minScore !== undefined) {
        where.score = { ...((where.score as Record<string, number>) || {}), gte: filters.minScore };
      }
      if (filters.maxScore !== undefined) {
        where.score = { ...((where.score as Record<string, number>) || {}), lte: filters.maxScore };
      }
      if (filters.assignedToUserId) {
        where.assignedToUserId = filters.assignedToUserId;
      }
      if (filters.hasFollowUp === true) {
        where.nextFollowUpAt = { not: null };
      } else if (filters.hasFollowUp === false) {
        where.nextFollowUpAt = null;
      }
      if (filters.createdAfter || filters.createdBefore) {
        where.createdAt = {
          ...(filters.createdAfter && { gte: filters.createdAfter }),
          ...(filters.createdBefore && { lte: filters.createdBefore }),
        };
      }
      if (filters.search) {
        where.OR = [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { phone: { contains: filters.search } },
        ];
      }
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          campaign: { select: { id: true, name: true } },
          activities: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.lead.count({ where }),
    ]);

    return { leads, total, limit, offset, hasMore: offset + leads.length < total };
  }

  // Get leads due for follow-up
  async getFollowUpsDue() {
    const now = new Date();

    return prisma.lead.findMany({
      where: {
        organizationId: this.organizationId,
        status: { in: ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED'] },
        nextFollowUpAt: { lte: now },
      },
      include: {
        activities: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { nextFollowUpAt: 'asc' },
    });
  }

  // Get lead statistics
  async getStatistics(startDate?: Date, endDate?: Date) {
    const where: Prisma.LeadWhereInput = {
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

    const [
      total,
      statusCounts,
      sourceCounts,
      converted,
      avgScore,
    ] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      prisma.lead.groupBy({
        by: ['source'],
        where,
        _count: { id: true },
      }),
      prisma.lead.count({
        where: { ...where, status: 'CONVERTED' },
      }),
      prisma.lead.aggregate({
        where,
        _avg: { score: true },
      }),
    ]);

    const statusMap = Object.fromEntries(
      statusCounts.map((s) => [s.status, s._count.id])
    );
    const sourceMap = Object.fromEntries(
      sourceCounts.map((s) => [s.source, s._count.id])
    );

    return {
      total,
      byStatus: statusMap,
      bySource: sourceMap,
      conversionRate: total > 0 ? (converted / total) * 100 : 0,
      averageScore: avgScore._avg.score || 0,
    };
  }

  // Bulk update unresponsive leads
  async markUnresponsive(daysSinceContact = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysSinceContact);

    const result = await prisma.lead.updateMany({
      where: {
        organizationId: this.organizationId,
        status: { in: ['NEW', 'CONTACTED', 'ENGAGED'] },
        lastContactedAt: { lt: cutoffDate },
        contactAttempts: { gte: 3 }, // At least 3 attempts
      },
      data: { status: 'UNRESPONSIVE' },
    });

    return result.count;
  }
}
