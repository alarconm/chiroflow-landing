// Campaign Tracker Service - Marketing Campaign Management
import { prisma } from '@/lib/prisma';
import type {
  MarketingCampaignType,
  MarketingCampaignStatus,
  Prisma,
} from '@prisma/client';
import { nanoid } from 'nanoid';

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
  ctr: number; // Click-through rate
  conversionRate: number;
  costPerLead: number | null;
  costPerConversion: number | null;
  roi: number | null;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  campaignType: MarketingCampaignType;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  targetLeads?: number;
  targetConversions?: number;
  targetRevenue?: number;
  utmSource?: string;
  utmMedium?: string;
  utmContent?: string;
  targetAudience?: Record<string, unknown>;
  content?: Record<string, unknown>;
}

export interface CampaignFilters {
  status?: MarketingCampaignStatus | MarketingCampaignStatus[];
  campaignType?: MarketingCampaignType | MarketingCampaignType[];
  startAfter?: Date;
  startBefore?: Date;
  search?: string;
}

export class CampaignTracker {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  // Generate unique UTM campaign code
  private generateUtmCampaign(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
    const suffix = nanoid(6).toLowerCase();
    return `${slug}-${suffix}`;
  }

  // Create a new campaign
  async createCampaign(input: CreateCampaignInput, userId?: string) {
    const utmCampaign = this.generateUtmCampaign(input.name);

    return prisma.campaign.create({
      data: {
        name: input.name,
        description: input.description,
        campaignType: input.campaignType,
        startDate: input.startDate,
        endDate: input.endDate,
        budget: input.budget,
        targetLeads: input.targetLeads,
        targetConversions: input.targetConversions,
        targetRevenue: input.targetRevenue,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign,
        utmContent: input.utmContent,
        targetAudience: input.targetAudience as Prisma.InputJsonValue,
        content: input.content as Prisma.InputJsonValue,
        createdBy: userId,
        organizationId: this.organizationId,
      },
    });
  }

  // Update campaign
  async updateCampaign(
    campaignId: string,
    updates: Partial<Omit<CreateCampaignInput, 'campaignType'>>
  ) {
    return prisma.campaign.update({
      where: { id: campaignId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.startDate !== undefined && { startDate: updates.startDate }),
        ...(updates.endDate !== undefined && { endDate: updates.endDate }),
        ...(updates.budget !== undefined && { budget: updates.budget }),
        ...(updates.targetLeads !== undefined && { targetLeads: updates.targetLeads }),
        ...(updates.targetConversions !== undefined && { targetConversions: updates.targetConversions }),
        ...(updates.targetRevenue !== undefined && { targetRevenue: updates.targetRevenue }),
        ...(updates.utmSource !== undefined && { utmSource: updates.utmSource }),
        ...(updates.utmMedium !== undefined && { utmMedium: updates.utmMedium }),
        ...(updates.utmContent !== undefined && { utmContent: updates.utmContent }),
        ...(updates.targetAudience && { targetAudience: updates.targetAudience as Prisma.InputJsonValue }),
        ...(updates.content && { content: updates.content as Prisma.InputJsonValue }),
      },
    });
  }

  // Update campaign status
  async updateStatus(campaignId: string, status: MarketingCampaignStatus) {
    return prisma.campaign.update({
      where: { id: campaignId },
      data: { status },
    });
  }

  // Start a campaign (schedule to active)
  async startCampaign(campaignId: string) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: this.organizationId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status === 'ACTIVE') {
      throw new Error('Campaign is already active');
    }

    if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
      throw new Error('Cannot start a completed or cancelled campaign');
    }

    return prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'ACTIVE',
        startDate: campaign.startDate || new Date(),
      },
    });
  }

  // Pause a campaign
  async pauseCampaign(campaignId: string) {
    return this.updateStatus(campaignId, 'PAUSED');
  }

  // Resume a paused campaign
  async resumeCampaign(campaignId: string) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: this.organizationId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'PAUSED') {
      throw new Error('Campaign is not paused');
    }

    return this.updateStatus(campaignId, 'ACTIVE');
  }

  // Complete a campaign
  async completeCampaign(campaignId: string) {
    return prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'COMPLETED',
        endDate: new Date(),
      },
    });
  }

  // Cancel a campaign
  async cancelCampaign(campaignId: string) {
    return this.updateStatus(campaignId, 'CANCELLED');
  }

  // Record an impression
  async recordImpression(campaignId: string, count = 1) {
    return prisma.campaign.update({
      where: { id: campaignId },
      data: {
        totalImpressions: { increment: count },
      },
    });
  }

  // Record a click
  async recordClick(campaignId: string, count = 1) {
    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        totalClicks: { increment: count },
      },
    });

    // Recalculate CTR
    await this.recalculateMetrics(campaignId);

    return campaign;
  }

  // Record a lead
  async recordLead(campaignId: string) {
    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        totalLeads: { increment: 1 },
      },
    });

    await this.recalculateMetrics(campaignId);
    return campaign;
  }

  // Record a conversion
  async recordConversion(campaignId: string, revenue = 0) {
    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        totalConversions: { increment: 1 },
        totalRevenue: { increment: revenue },
      },
    });

    await this.recalculateMetrics(campaignId);
    return campaign;
  }

  // Update actual spend
  async updateSpend(campaignId: string, amount: number) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: this.organizationId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        actualSpend: amount,
      },
    });

    await this.recalculateMetrics(campaignId);
    return updated;
  }

  // Recalculate campaign metrics
  async recalculateMetrics(campaignId: string) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: this.organizationId },
    });

    if (!campaign) return;

    const impressions = campaign.totalImpressions;
    const clicks = campaign.totalClicks;
    const leads = campaign.totalLeads;
    const conversions = campaign.totalConversions;
    const spend = campaign.actualSpend ? Number(campaign.actualSpend) : null;
    const revenue = Number(campaign.totalRevenue);

    const ctr = impressions > 0 ? clicks / impressions : null;
    const conversionRate = leads > 0 ? conversions / leads : null;
    const costPerLead = spend && leads > 0 ? spend / leads : null;
    const costPerConversion = spend && conversions > 0 ? spend / conversions : null;
    const roi = spend && spend > 0 ? (revenue - spend) / spend : null;

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        clickThroughRate: ctr,
        conversionRate,
        costPerLead,
        costPerConversion,
        roi,
      },
    });
  }

  // Get campaign metrics
  async getMetrics(campaignId: string): Promise<CampaignMetrics | null> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: this.organizationId },
    });

    if (!campaign) return null;

    return {
      impressions: campaign.totalImpressions,
      clicks: campaign.totalClicks,
      leads: campaign.totalLeads,
      conversions: campaign.totalConversions,
      revenue: Number(campaign.totalRevenue),
      ctr: campaign.clickThroughRate ? Number(campaign.clickThroughRate) * 100 : 0,
      conversionRate: campaign.conversionRate ? Number(campaign.conversionRate) * 100 : 0,
      costPerLead: campaign.costPerLead ? Number(campaign.costPerLead) : null,
      costPerConversion: campaign.costPerConversion ? Number(campaign.costPerConversion) : null,
      roi: campaign.roi ? Number(campaign.roi) * 100 : null,
    };
  }

  // Get campaigns with filters
  async getCampaigns(filters?: CampaignFilters, limit = 50, offset = 0) {
    const where: Prisma.CampaignWhereInput = {
      organizationId: this.organizationId,
    };

    if (filters) {
      if (filters.status) {
        where.status = Array.isArray(filters.status)
          ? { in: filters.status }
          : filters.status;
      }
      if (filters.campaignType) {
        where.campaignType = Array.isArray(filters.campaignType)
          ? { in: filters.campaignType }
          : filters.campaignType;
      }
      if (filters.startAfter || filters.startBefore) {
        where.startDate = {
          ...(filters.startAfter && { gte: filters.startAfter }),
          ...(filters.startBefore && { lte: filters.startBefore }),
        };
      }
      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { utmCampaign: { contains: filters.search, mode: 'insensitive' } },
        ];
      }
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        include: {
          _count: { select: { leads: true } },
        },
        orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.campaign.count({ where }),
    ]);

    return { campaigns, total, limit, offset, hasMore: offset + campaigns.length < total };
  }

  // Get campaign by ID
  async getCampaign(campaignId: string) {
    return prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: this.organizationId },
      include: {
        leads: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
  }

  // Get campaign by UTM
  async getCampaignByUtm(utmCampaign: string) {
    return prisma.campaign.findFirst({
      where: {
        organizationId: this.organizationId,
        utmCampaign,
      },
    });
  }

  // Attribution: Find campaign from UTM parameters
  async attributeLead(utmParams: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
  }) {
    if (!utmParams.utmCampaign) return null;

    const campaign = await prisma.campaign.findFirst({
      where: {
        organizationId: this.organizationId,
        utmCampaign: utmParams.utmCampaign,
        status: { in: ['ACTIVE', 'SCHEDULED'] },
      },
    });

    return campaign;
  }

  // Get aggregated statistics
  async getStatistics(startDate?: Date, endDate?: Date) {
    const where: Prisma.CampaignWhereInput = {
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
      totalCampaigns,
      activeCampaigns,
      statusCounts,
      typeCounts,
      aggregates,
    ] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.campaign.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      prisma.campaign.groupBy({
        by: ['campaignType'],
        where,
        _count: { id: true },
      }),
      prisma.campaign.aggregate({
        where,
        _sum: {
          totalImpressions: true,
          totalClicks: true,
          totalLeads: true,
          totalConversions: true,
          totalRevenue: true,
          actualSpend: true,
          budget: true,
        },
      }),
    ]);

    const statusMap = Object.fromEntries(
      statusCounts.map((s) => [s.status, s._count.id])
    );
    const typeMap = Object.fromEntries(
      typeCounts.map((t) => [t.campaignType, t._count.id])
    );

    const totalSpend = Number(aggregates._sum.actualSpend || 0);
    const totalRevenue = Number(aggregates._sum.totalRevenue || 0);
    const totalLeads = aggregates._sum.totalLeads || 0;
    const totalConversions = aggregates._sum.totalConversions || 0;

    return {
      totalCampaigns,
      activeCampaigns,
      byStatus: statusMap,
      byType: typeMap,
      totalBudget: Number(aggregates._sum.budget || 0),
      totalSpend,
      totalImpressions: aggregates._sum.totalImpressions || 0,
      totalClicks: aggregates._sum.totalClicks || 0,
      totalLeads,
      totalConversions,
      totalRevenue,
      overallCostPerLead: totalLeads > 0 ? totalSpend / totalLeads : null,
      overallCostPerConversion: totalConversions > 0 ? totalSpend / totalConversions : null,
      overallRoi: totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : null,
    };
  }

  // Process scheduled campaigns (called by scheduler)
  async processScheduledCampaigns() {
    const now = new Date();

    // Activate campaigns that should start
    const toActivate = await prisma.campaign.updateMany({
      where: {
        organizationId: this.organizationId,
        status: 'SCHEDULED',
        startDate: { lte: now },
      },
      data: { status: 'ACTIVE' },
    });

    // Complete campaigns that have ended
    const toComplete = await prisma.campaign.updateMany({
      where: {
        organizationId: this.organizationId,
        status: 'ACTIVE',
        endDate: { lte: now },
      },
      data: { status: 'COMPLETED' },
    });

    return {
      activated: toActivate.count,
      completed: toComplete.count,
    };
  }

  // Get top performing campaigns
  async getTopCampaigns(metric: 'leads' | 'conversions' | 'revenue' | 'roi' = 'conversions', limit = 5) {
    const orderBy: Record<string, 'desc'> = {};

    switch (metric) {
      case 'leads':
        orderBy.totalLeads = 'desc';
        break;
      case 'conversions':
        orderBy.totalConversions = 'desc';
        break;
      case 'revenue':
        orderBy.totalRevenue = 'desc';
        break;
      case 'roi':
        orderBy.roi = 'desc';
        break;
    }

    return prisma.campaign.findMany({
      where: {
        organizationId: this.organizationId,
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      orderBy,
      take: limit,
      select: {
        id: true,
        name: true,
        campaignType: true,
        status: true,
        totalImpressions: true,
        totalClicks: true,
        totalLeads: true,
        totalConversions: true,
        totalRevenue: true,
        actualSpend: true,
        roi: true,
      },
    });
  }
}
