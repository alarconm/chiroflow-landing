/**
 * Epic 12: AI Communication Agent - Campaign Engine
 *
 * Handles recall and reactivation campaign automation.
 */

import type {
  PrismaClient,
  CampaignStatus,
  CampaignType,
  PatientCampaignStatus,
  CommunicationChannel,
  Prisma,
} from '@prisma/client';
import type {
  RecallCampaignCriteria,
  ReactivationCampaignCriteria,
  CampaignSequenceStep,
  CampaignStats,
  CampaignPatientResult,
} from './types';

/**
 * Campaign Engine for managing recall and reactivation campaigns
 */
export class CampaignEngine {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // ==================== Recall Campaigns ====================

  /**
   * Create a new recall campaign
   */
  async createRecallCampaign(
    organizationId: string,
    data: {
      name: string;
      description?: string;
      criteria: RecallCampaignCriteria;
      sequence: CampaignSequenceStep[];
      scheduledStartDate?: Date;
    }
  ): Promise<{ id: string; patientCount: number }> {
    const { name, description, criteria, sequence, scheduledStartDate } = data;

    // Find matching patients
    const patients = await this.findRecallCandidates(organizationId, criteria);

    // Create the campaign
    const campaign = await this.prisma.recallCampaign.create({
      data: {
        organizationId,
        name,
        description,
        status: scheduledStartDate ? 'SCHEDULED' : 'DRAFT',
        type: 'RECALL',
        targetCriteria: criteria as unknown as Prisma.InputJsonValue,
        sequenceConfig: sequence as unknown as Prisma.InputJsonValue,
        scheduledStartAt: scheduledStartDate,
        patients: {
          create: patients.map(p => ({
            patientId: p.id,
            status: 'PENDING',
          })),
        },
      },
    });

    return {
      id: campaign.id,
      patientCount: patients.length,
    };
  }

  /**
   * Find patients matching recall criteria
   */
  async findRecallCandidates(
    organizationId: string,
    criteria: RecallCampaignCriteria
  ): Promise<{ id: string; firstName: string; lastName: string; lastVisit?: Date }[]> {
    const { lastVisitDateRange, appointmentTypes, providers, excludePatientIds, minVisits, maxVisits } = criteria;

    // Build appointment filter
    const appointmentWhere: Record<string, unknown> = {
      organizationId,
      status: 'COMPLETED',
    };

    if (lastVisitDateRange?.start || lastVisitDateRange?.end) {
      appointmentWhere.startTime = {};
      if (lastVisitDateRange.start) {
        (appointmentWhere.startTime as Record<string, Date>).gte = lastVisitDateRange.start;
      }
      if (lastVisitDateRange.end) {
        (appointmentWhere.startTime as Record<string, Date>).lte = lastVisitDateRange.end;
      }
    }

    if (appointmentTypes?.length) {
      appointmentWhere.appointmentTypeId = { in: appointmentTypes };
    }

    if (providers?.length) {
      appointmentWhere.providerId = { in: providers };
    }

    // Get patients with their last visit
    const patientsWithAppointments = await this.prisma.patient.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        id: excludePatientIds?.length ? { notIn: excludePatientIds } : undefined,
        appointments: {
          some: appointmentWhere,
        },
      },
      include: {
        demographics: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        appointments: {
          where: { status: 'COMPLETED' },
          orderBy: { startTime: 'desc' },
          take: 1,
          select: { startTime: true },
        },
        _count: {
          select: {
            appointments: {
              where: { status: 'COMPLETED' },
            },
          },
        },
      },
    });

    // Filter by visit count if specified
    let filteredPatients = patientsWithAppointments;

    if (minVisits !== undefined) {
      filteredPatients = filteredPatients.filter(p => p._count.appointments >= minVisits);
    }

    if (maxVisits !== undefined) {
      filteredPatients = filteredPatients.filter(p => p._count.appointments <= maxVisits);
    }

    return filteredPatients.map(p => ({
      id: p.id,
      firstName: p.demographics?.firstName || 'Unknown',
      lastName: p.demographics?.lastName || 'Patient',
      lastVisit: p.appointments[0]?.startTime,
    }));
  }

  /**
   * Start a recall campaign
   */
  async startRecallCampaign(campaignId: string): Promise<void> {
    await this.prisma.recallCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'ACTIVE',
        startedAt: new Date(),
      },
    });

    // Queue first step for all patients
    await this.queueCampaignStep(campaignId, 1, 'recall');
  }

  /**
   * Pause a recall campaign
   */
  async pauseRecallCampaign(campaignId: string): Promise<void> {
    await this.prisma.recallCampaign.update({
      where: { id: campaignId },
      data: { status: 'PAUSED' },
    });
  }

  /**
   * Resume a recall campaign
   */
  async resumeRecallCampaign(campaignId: string): Promise<void> {
    await this.prisma.recallCampaign.update({
      where: { id: campaignId },
      data: { status: 'ACTIVE' },
    });
  }

  /**
   * Complete a recall campaign
   */
  async completeRecallCampaign(campaignId: string): Promise<void> {
    await this.prisma.recallCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }

  /**
   * Get recall campaign statistics
   */
  async getRecallCampaignStats(campaignId: string): Promise<CampaignStats> {
    const patients = await this.prisma.recallCampaignPatient.findMany({
      where: { campaignId },
    });

    const totalTargeted = patients.length;
    const totalSent = patients.filter(p => p.sentAt).length;
    const totalDelivered = patients.filter(p => p.deliveredAt).length;
    const totalResponded = patients.filter(p => p.respondedAt).length;
    const totalConverted = patients.filter(p => p.convertedAt).length;

    return {
      totalTargeted,
      totalSent,
      totalDelivered,
      totalResponded,
      totalConverted,
      deliveryRate: totalSent > 0 ? totalDelivered / totalSent : 0,
      responseRate: totalDelivered > 0 ? totalResponded / totalDelivered : 0,
      conversionRate: totalTargeted > 0 ? totalConverted / totalTargeted : 0,
    };
  }

  // ==================== Reactivation Campaigns ====================

  /**
   * Create a new reactivation campaign
   */
  async createReactivationCampaign(
    organizationId: string,
    data: {
      name: string;
      description?: string;
      criteria: ReactivationCampaignCriteria;
      sequence: CampaignSequenceStep[];
      scheduledStartDate?: Date;
    }
  ): Promise<{ id: string; patientCount: number }> {
    const { name, description, criteria, sequence, scheduledStartDate } = data;

    // Find matching patients
    const patients = await this.findReactivationCandidates(organizationId, criteria);

    // Create the campaign
    const campaign = await this.prisma.reactivationCampaign.create({
      data: {
        organizationId,
        name,
        description,
        status: scheduledStartDate ? 'SCHEDULED' : 'DRAFT',
        minDaysSinceVisit: criteria.minDaysSinceVisit,
        maxDaysSinceVisit: criteria.maxDaysSinceVisit,
        excludeActivePatients: criteria.excludeActivePatients,
        additionalCriteria: {
          appointmentTypes: criteria.appointmentTypes,
          providers: criteria.providers,
          sequenceConfig: sequence,
        } as unknown as Prisma.InputJsonValue,
        scheduledStartAt: scheduledStartDate,
        patients: {
          create: patients.map(p => ({
            patientId: p.id,
            status: 'PENDING',
            lastVisitDate: p.lastVisit,
            daysSinceVisit: p.daysSinceVisit,
          })),
        },
      },
    });

    return {
      id: campaign.id,
      patientCount: patients.length,
    };
  }

  /**
   * Find patients matching reactivation criteria (lapsed patients)
   */
  async findReactivationCandidates(
    organizationId: string,
    criteria: ReactivationCampaignCriteria
  ): Promise<{ id: string; firstName: string; lastName: string; lastVisit: Date; daysSinceVisit: number }[]> {
    const { minDaysSinceVisit, maxDaysSinceVisit, excludeActivePatients, appointmentTypes, providers } = criteria;

    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() - (maxDaysSinceVisit || 365));

    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() - minDaysSinceVisit);

    // Build appointment filter
    const appointmentWhere: Record<string, unknown> = {
      organizationId,
      status: 'COMPLETED',
    };

    if (appointmentTypes?.length) {
      appointmentWhere.appointmentTypeId = { in: appointmentTypes };
    }

    if (providers?.length) {
      appointmentWhere.providerId = { in: providers };
    }

    // Get patients with their last completed appointment
    const patientsWithAppointments = await this.prisma.patient.findMany({
      where: {
        organizationId,
        status: excludeActivePatients ? { not: 'ACTIVE' } : undefined,
        appointments: {
          some: appointmentWhere,
        },
      },
      include: {
        demographics: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        appointments: {
          where: { status: 'COMPLETED' },
          orderBy: { startTime: 'desc' },
          take: 1,
          select: { startTime: true },
        },
      },
    });

    // Filter by days since last visit
    const candidates = patientsWithAppointments
      .filter(p => {
        if (!p.appointments[0]) return false;
        const lastVisit = new Date(p.appointments[0].startTime);
        return lastVisit >= minDate && lastVisit <= maxDate;
      })
      .map(p => {
        const lastVisit = new Date(p.appointments[0].startTime);
        const daysSinceVisit = Math.floor((today.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: p.id,
          firstName: p.demographics?.firstName || 'Unknown',
          lastName: p.demographics?.lastName || 'Patient',
          lastVisit,
          daysSinceVisit,
        };
      });

    return candidates;
  }

  /**
   * Start a reactivation campaign
   */
  async startReactivationCampaign(campaignId: string): Promise<void> {
    await this.prisma.reactivationCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'ACTIVE',
        startedAt: new Date(),
      },
    });

    // Queue first step for all patients
    await this.queueCampaignStep(campaignId, 1, 'reactivation');
  }

  /**
   * Get reactivation campaign statistics
   */
  async getReactivationCampaignStats(campaignId: string): Promise<CampaignStats> {
    const patients = await this.prisma.reactivationCampaignPatient.findMany({
      where: { campaignId },
    });

    const totalTargeted = patients.length;
    const totalSent = patients.filter(p => p.sentAt).length;
    const totalDelivered = patients.filter(p => p.deliveredAt).length;
    const totalResponded = patients.filter(p => p.respondedAt).length;
    const totalConverted = patients.filter(p => p.reactivatedAt).length;

    return {
      totalTargeted,
      totalSent,
      totalDelivered,
      totalResponded,
      totalConverted,
      deliveryRate: totalSent > 0 ? totalDelivered / totalSent : 0,
      responseRate: totalDelivered > 0 ? totalResponded / totalDelivered : 0,
      conversionRate: totalTargeted > 0 ? totalConverted / totalTargeted : 0,
    };
  }

  // ==================== Shared Campaign Operations ====================

  /**
   * Queue a campaign step for execution
   */
  private async queueCampaignStep(
    campaignId: string,
    stepNumber: number,
    campaignType: 'recall' | 'reactivation'
  ): Promise<void> {
    // This would integrate with a job queue in production
    // For now, mark patients as ready for the step
    if (campaignType === 'recall') {
      await this.prisma.recallCampaignPatient.updateMany({
        where: {
          campaignId,
          status: 'PENDING',
          currentStep: { lt: stepNumber },
        },
        data: {
          currentStep: stepNumber,
        },
      });
    } else {
      // Reactivation campaigns don't have step tracking - just ensure patients are pending
      // In production, this would integrate with a job queue
      await this.prisma.reactivationCampaignPatient.updateMany({
        where: {
          campaignId,
          status: 'PENDING',
        },
        data: {
          // Mark for processing by updating the timestamp
          updatedAt: new Date(),
        },
      });
    }
  }

  /**
   * Process a campaign step for a patient
   */
  async processCampaignStep(
    campaignId: string,
    patientId: string,
    campaignType: 'recall' | 'reactivation',
    stepNumber: number
  ): Promise<{ success: boolean; channel: CommunicationChannel; messageId?: string }> {
    // Get campaign and step configuration
    const campaign = campaignType === 'recall'
      ? await this.prisma.recallCampaign.findUnique({ where: { id: campaignId } })
      : await this.prisma.reactivationCampaign.findUnique({ where: { id: campaignId } });

    if (!campaign || campaign.status !== 'ACTIVE') {
      return { success: false, channel: 'EMAIL' };
    }

    // Get sequence from appropriate field based on campaign type
    const sequenceData = campaignType === 'recall'
      ? (campaign as { sequenceConfig?: unknown }).sequenceConfig
      : ((campaign as { additionalCriteria?: { sequenceConfig?: unknown } }).additionalCriteria as { sequenceConfig?: unknown })?.sequenceConfig;
    const sequence = (sequenceData || []) as CampaignSequenceStep[];
    const step = sequence.find(s => s.stepNumber === stepNumber);

    if (!step) {
      return { success: false, channel: 'EMAIL' };
    }

    // Get patient info
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        demographics: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        contacts: {
          select: {
            email: true,
            mobilePhone: true,
            homePhone: true,
            isPrimary: true,
          },
        },
        communicationPreference: true,
      },
    });

    if (!patient) {
      return { success: false, channel: step.channel };
    }

    // This would send actual communication in production
    // For now, simulate success and update status
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (campaignType === 'recall') {
      await this.prisma.recallCampaignPatient.update({
        where: {
          campaignId_patientId: {
            campaignId,
            patientId,
          },
        },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          currentStep: stepNumber,
        },
      });
    } else {
      await this.prisma.reactivationCampaignPatient.update({
        where: {
          campaignId_patientId: {
            campaignId,
            patientId,
          },
        },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });
    }

    return {
      success: true,
      channel: step.channel,
      messageId,
    };
  }

  /**
   * Record patient response to campaign
   */
  async recordResponse(
    campaignId: string,
    patientId: string,
    campaignType: 'recall' | 'reactivation',
    response: string
  ): Promise<void> {
    const model = campaignType === 'recall'
      ? this.prisma.recallCampaignPatient
      : this.prisma.reactivationCampaignPatient;

    await (model as typeof this.prisma.recallCampaignPatient).update({
      where: {
        campaignId_patientId: {
          campaignId,
          patientId,
        },
      },
      data: {
        status: 'RESPONDED',
        respondedAt: new Date(),
        response,
      },
    });
  }

  /**
   * Record patient conversion (booked appointment)
   */
  async recordConversion(
    campaignId: string,
    patientId: string,
    campaignType: 'recall' | 'reactivation',
    appointmentId: string
  ): Promise<void> {
    if (campaignType === 'recall') {
      await this.prisma.recallCampaignPatient.update({
        where: {
          campaignId_patientId: {
            campaignId,
            patientId,
          },
        },
        data: {
          status: 'CONVERTED',
          convertedAt: new Date(),
          appointmentId,
        },
      });
    } else {
      await this.prisma.reactivationCampaignPatient.update({
        where: {
          campaignId_patientId: {
            campaignId,
            patientId,
          },
        },
        data: {
          status: 'CONVERTED',
          reactivatedAt: new Date(),
          appointmentId,
        },
      });
    }
  }

  /**
   * Get campaign patient results
   */
  async getCampaignPatientResults(
    campaignId: string,
    campaignType: 'recall' | 'reactivation',
    options: {
      status?: PatientCampaignStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<CampaignPatientResult[]> {
    const { status, limit = 50, offset = 0 } = options;

    if (campaignType === 'recall') {
      const results = await this.prisma.recallCampaignPatient.findMany({
        where: {
          campaignId,
          status: status || undefined,
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      });

      return results.map(r => ({
        patientId: r.patientId,
        status: r.status,
        sentAt: r.sentAt || undefined,
        deliveredAt: r.deliveredAt || undefined,
        respondedAt: r.respondedAt || undefined,
        convertedAt: r.convertedAt || undefined,
        response: r.response || undefined,
        failureReason: r.failureReason || undefined,
      }));
    } else {
      const results = await this.prisma.reactivationCampaignPatient.findMany({
        where: {
          campaignId,
          status: status || undefined,
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      });

      return results.map(r => ({
        patientId: r.patientId,
        status: r.status,
        sentAt: r.sentAt || undefined,
        deliveredAt: r.deliveredAt || undefined,
        respondedAt: r.respondedAt || undefined,
        convertedAt: r.reactivatedAt || undefined,
        response: r.response || undefined,
        failureReason: r.failureReason || undefined,
      }));
    }
  }

  /**
   * List campaigns for organization
   */
  async listCampaigns(
    organizationId: string,
    options: {
      type?: 'recall' | 'reactivation';
      status?: CampaignStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    id: string;
    name: string;
    type: string;
    status: CampaignStatus;
    patientCount: number;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
  }[]> {
    const { type, status, limit = 20, offset = 0 } = options;

    interface CampaignResult {
      id: string;
      name: string;
      type: string;
      status: CampaignStatus;
      patientCount: number;
      createdAt: Date;
      startedAt?: Date;
      completedAt?: Date;
    }

    const campaigns: CampaignResult[] = [];

    if (!type || type === 'recall') {
      const recallCampaigns = await this.prisma.recallCampaign.findMany({
        where: {
          organizationId,
          status: status || undefined,
        },
        include: {
          _count: { select: { patients: true } },
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      });
      campaigns.push(...recallCampaigns.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        patientCount: c._count.patients,
        createdAt: c.createdAt,
        startedAt: c.startedAt || undefined,
        completedAt: c.completedAt || undefined,
      })));
    }

    if (!type || type === 'reactivation') {
      const reactivationCampaigns = await this.prisma.reactivationCampaign.findMany({
        where: {
          organizationId,
          status: status || undefined,
        },
        include: {
          _count: { select: { patients: true } },
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      });
      campaigns.push(...reactivationCampaigns.map(c => ({
        id: c.id,
        name: c.name,
        type: 'REACTIVATION' as const,
        status: c.status,
        patientCount: c._count.patients,
        createdAt: c.createdAt,
        startedAt: c.startedAt || undefined,
        completedAt: c.completedAt || undefined,
      })));
    }

    return campaigns
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Delete a draft campaign
   */
  async deleteCampaign(
    campaignId: string,
    campaignType: 'recall' | 'reactivation'
  ): Promise<void> {
    if (campaignType === 'recall') {
      const campaign = await this.prisma.recallCampaign.findUnique({
        where: { id: campaignId },
      });

      if (campaign?.status !== 'DRAFT') {
        throw new Error('Can only delete draft campaigns');
      }

      await this.prisma.recallCampaignPatient.deleteMany({
        where: { campaignId },
      });

      await this.prisma.recallCampaign.delete({
        where: { id: campaignId },
      });
    } else {
      const campaign = await this.prisma.reactivationCampaign.findUnique({
        where: { id: campaignId },
      });

      if (campaign?.status !== 'DRAFT') {
        throw new Error('Can only delete draft campaigns');
      }

      await this.prisma.reactivationCampaignPatient.deleteMany({
        where: { campaignId },
      });

      await this.prisma.reactivationCampaign.delete({
        where: { id: campaignId },
      });
    }
  }
}

/**
 * Create a campaign engine instance
 */
export function createCampaignEngine(prisma: PrismaClient): CampaignEngine {
  return new CampaignEngine(prisma);
}

export default CampaignEngine;
