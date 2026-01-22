// Referral Program Service
import { prisma } from '@/lib/prisma';
import type {
  ReferralRewardType,
  ReferralStatus,
  Prisma,
} from '@prisma/client';
import { nanoid } from 'nanoid';

// Generate a unique referral code
export function generateReferralCode(prefix?: string): string {
  const code = nanoid(8).toUpperCase();
  return prefix ? `${prefix}-${code}` : code;
}

// Types
export interface ReferralProgramConfig {
  name: string;
  description?: string;
  referrerRewardType: ReferralRewardType;
  referrerRewardValue: number;
  referrerRewardMax?: number;
  referrerRewardNote?: string;
  refereeRewardType?: ReferralRewardType;
  refereeRewardValue?: number;
  refereeRewardMax?: number;
  refereeRewardNote?: string;
  qualificationCriteria?: string;
  expirationDays?: number;
  maxReferralsPerPatient?: number;
  requireNewPatient?: boolean;
  termsAndConditions?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface CreateReferralInput {
  programId: string;
  referrerId: string;
  refereeName?: string;
  refereeEmail?: string;
  refereePhone?: string;
  refereeNotes?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface ReferralRewardResult {
  success: boolean;
  rewardType: ReferralRewardType;
  rewardAmount: number;
  notes?: string;
  error?: string;
}

export class ReferralProgram {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  // Create a new referral program
  async createProgram(config: ReferralProgramConfig) {
    return prisma.referralProgram.create({
      data: {
        name: config.name,
        description: config.description,
        referrerRewardType: config.referrerRewardType,
        referrerRewardValue: config.referrerRewardValue,
        referrerRewardMax: config.referrerRewardMax,
        referrerRewardNote: config.referrerRewardNote,
        refereeRewardType: config.refereeRewardType,
        refereeRewardValue: config.refereeRewardValue,
        refereeRewardMax: config.refereeRewardMax,
        refereeRewardNote: config.refereeRewardNote,
        qualificationCriteria: config.qualificationCriteria,
        expirationDays: config.expirationDays,
        maxReferralsPerPatient: config.maxReferralsPerPatient,
        requireNewPatient: config.requireNewPatient ?? true,
        termsAndConditions: config.termsAndConditions,
        startDate: config.startDate,
        endDate: config.endDate,
        organizationId: this.organizationId,
      },
    });
  }

  // Get active program(s)
  async getActivePrograms() {
    const now = new Date();
    return prisma.referralProgram.findMany({
      where: {
        organizationId: this.organizationId,
        isActive: true,
        OR: [
          { startDate: null },
          { startDate: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endDate: null },
              { endDate: { gte: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get the default/primary program
  async getDefaultProgram() {
    const programs = await this.getActivePrograms();
    return programs[0] || null;
  }

  // Create a new referral
  async createReferral(input: CreateReferralInput) {
    // Check if program exists and is active
    const program = await prisma.referralProgram.findFirst({
      where: {
        id: input.programId,
        organizationId: this.organizationId,
        isActive: true,
      },
    });

    if (!program) {
      throw new Error('Referral program not found or inactive');
    }

    // Check max referrals limit
    if (program.maxReferralsPerPatient) {
      const existingReferrals = await prisma.referral.count({
        where: {
          referrerId: input.referrerId,
          programId: input.programId,
          organizationId: this.organizationId,
          status: { notIn: ['CANCELLED', 'EXPIRED'] },
        },
      });

      if (existingReferrals >= program.maxReferralsPerPatient) {
        throw new Error('Maximum referrals limit reached for this program');
      }
    }

    // Generate referral code
    const referralCode = generateReferralCode();

    // Calculate expiration date
    let expiresAt: Date | null = null;
    if (program.expirationDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + program.expirationDays);
    }

    return prisma.referral.create({
      data: {
        referralCode,
        referrerId: input.referrerId,
        programId: input.programId,
        refereeName: input.refereeName,
        refereeEmail: input.refereeEmail,
        refereePhone: input.refereePhone,
        refereeNotes: input.refereeNotes,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        expiresAt,
        organizationId: this.organizationId,
      },
      include: {
        referrer: {
          include: {
            demographics: { select: { firstName: true, lastName: true } },
          },
        },
        program: true,
      },
    });
  }

  // Link a new patient to a referral
  async linkRefereePatient(referralCode: string, patientId: string) {
    const referral = await prisma.referral.findFirst({
      where: {
        referralCode,
        organizationId: this.organizationId,
        status: 'PENDING',
      },
      include: { program: true },
    });

    if (!referral) {
      throw new Error('Referral not found or not pending');
    }

    // Check if referral has expired
    if (referral.expiresAt && referral.expiresAt < new Date()) {
      await prisma.referral.update({
        where: { id: referral.id },
        data: { status: 'EXPIRED' },
      });
      throw new Error('Referral has expired');
    }

    // Check if patient is truly new (if required)
    if (referral.program.requireNewPatient) {
      const existingAppointments = await prisma.appointment.count({
        where: {
          patientId,
          organizationId: this.organizationId,
          status: { in: ['COMPLETED', 'CHECKED_IN'] },
        },
      });

      if (existingAppointments > 0) {
        throw new Error('Referral requires a new patient');
      }
    }

    return prisma.referral.update({
      where: { id: referral.id },
      data: {
        refereeId: patientId,
        status: 'QUALIFIED',
        qualifiedAt: new Date(),
      },
      include: {
        referrer: {
          include: {
            demographics: { select: { firstName: true, lastName: true } },
          },
        },
        referee: {
          include: {
            demographics: { select: { firstName: true, lastName: true } },
          },
        },
        program: true,
      },
    });
  }

  // Calculate reward amount based on program rules
  calculateReward(
    rewardType: ReferralRewardType,
    rewardValue: number,
    rewardMax: number | null,
    serviceAmount?: number
  ): number {
    let amount = 0;

    switch (rewardType) {
      case 'DISCOUNT_PERCENT':
        // Apply percentage discount to service amount
        if (serviceAmount) {
          amount = serviceAmount * (rewardValue / 100);
        }
        break;

      case 'DISCOUNT_FIXED':
      case 'CREDIT':
      case 'CASH':
      case 'GIFT_CARD':
        amount = rewardValue;
        break;

      case 'FREE_SERVICE':
        // Value represents the service value
        amount = rewardValue;
        break;
    }

    // Apply max cap if set
    if (rewardMax && amount > rewardMax) {
      amount = rewardMax;
    }

    return amount;
  }

  // Issue referrer reward
  async issueReferrerReward(
    referralId: string,
    notes?: string
  ): Promise<ReferralRewardResult> {
    const referral = await prisma.referral.findFirst({
      where: {
        id: referralId,
        organizationId: this.organizationId,
        status: 'QUALIFIED',
        referrerRewardIssued: false,
      },
      include: { program: true },
    });

    if (!referral) {
      return {
        success: false,
        rewardType: 'CREDIT',
        rewardAmount: 0,
        error: 'Referral not found, not qualified, or reward already issued',
      };
    }

    const rewardAmount = this.calculateReward(
      referral.program.referrerRewardType,
      Number(referral.program.referrerRewardValue),
      referral.program.referrerRewardMax ? Number(referral.program.referrerRewardMax) : null
    );

    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        referrerRewardIssued: true,
        referrerRewardAmount: rewardAmount,
        referrerRewardIssuedAt: new Date(),
        referrerRewardNotes: notes,
      },
    });

    return {
      success: true,
      rewardType: referral.program.referrerRewardType,
      rewardAmount,
      notes,
    };
  }

  // Issue referee reward
  async issueRefereeReward(
    referralId: string,
    notes?: string
  ): Promise<ReferralRewardResult> {
    const referral = await prisma.referral.findFirst({
      where: {
        id: referralId,
        organizationId: this.organizationId,
        status: 'QUALIFIED',
        refereeRewardIssued: false,
      },
      include: { program: true },
    });

    if (!referral) {
      return {
        success: false,
        rewardType: 'CREDIT',
        rewardAmount: 0,
        error: 'Referral not found, not qualified, or reward already issued',
      };
    }

    if (!referral.program.refereeRewardType || !referral.program.refereeRewardValue) {
      return {
        success: false,
        rewardType: 'CREDIT',
        rewardAmount: 0,
        error: 'No referee reward configured for this program',
      };
    }

    const rewardAmount = this.calculateReward(
      referral.program.refereeRewardType,
      Number(referral.program.refereeRewardValue),
      referral.program.refereeRewardMax ? Number(referral.program.refereeRewardMax) : null
    );

    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        refereeRewardIssued: true,
        refereeRewardAmount: rewardAmount,
        refereeRewardIssuedAt: new Date(),
        refereeRewardNotes: notes,
      },
    });

    return {
      success: true,
      rewardType: referral.program.refereeRewardType,
      rewardAmount,
      notes,
    };
  }

  // Complete a referral (issue all rewards)
  async completeReferral(referralId: string) {
    const referral = await prisma.referral.findFirst({
      where: {
        id: referralId,
        organizationId: this.organizationId,
        status: 'QUALIFIED',
      },
      include: { program: true },
    });

    if (!referral) {
      throw new Error('Referral not found or not qualified');
    }

    const results = {
      referrerReward: await this.issueReferrerReward(referralId),
      refereeReward: referral.program.refereeRewardType
        ? await this.issueRefereeReward(referralId)
        : null,
    };

    // Mark referral as completed
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    return results;
  }

  // Get referral statistics
  async getStatistics(startDate?: Date, endDate?: Date) {
    const where: Prisma.ReferralWhereInput = {
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

    const [total, pending, qualified, completed, expired, cancelled] = await Promise.all([
      prisma.referral.count({ where }),
      prisma.referral.count({ where: { ...where, status: 'PENDING' } }),
      prisma.referral.count({ where: { ...where, status: 'QUALIFIED' } }),
      prisma.referral.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.referral.count({ where: { ...where, status: 'EXPIRED' } }),
      prisma.referral.count({ where: { ...where, status: 'CANCELLED' } }),
    ]);

    // Calculate total rewards issued
    const rewards = await prisma.referral.aggregate({
      where: {
        ...where,
        referrerRewardIssued: true,
      },
      _sum: {
        referrerRewardAmount: true,
        refereeRewardAmount: true,
      },
    });

    const conversionRate = total > 0 ? ((qualified + completed) / total) * 100 : 0;
    const completionRate = qualified + completed > 0 ? (completed / (qualified + completed)) * 100 : 0;

    return {
      total,
      pending,
      qualified,
      completed,
      expired,
      cancelled,
      conversionRate: Math.round(conversionRate * 100) / 100,
      completionRate: Math.round(completionRate * 100) / 100,
      totalReferrerRewards: Number(rewards._sum.referrerRewardAmount || 0),
      totalRefereeRewards: Number(rewards._sum.refereeRewardAmount || 0),
    };
  }

  // Get top referrers
  async getTopReferrers(limit = 10) {
    const referrers = await prisma.referral.groupBy({
      by: ['referrerId'],
      where: {
        organizationId: this.organizationId,
        status: { in: ['QUALIFIED', 'COMPLETED'] },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    // Get patient details for top referrers
    const patientIds = referrers.map((r) => r.referrerId);
    const patients = await prisma.patient.findMany({
      where: { id: { in: patientIds } },
      include: {
        demographics: { select: { firstName: true, lastName: true } },
      },
    });

    const patientMap = new Map(patients.map((p) => [p.id, p]));

    return referrers.map((r) => ({
      patientId: r.referrerId,
      patient: patientMap.get(r.referrerId),
      referralCount: r._count.id,
    }));
  }

  // Check for expired referrals and update their status
  async processExpiredReferrals() {
    const now = new Date();

    const expired = await prisma.referral.updateMany({
      where: {
        organizationId: this.organizationId,
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    return expired.count;
  }
}
