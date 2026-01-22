// Opportunity Finder - AI Insights Agent
// Identifies revenue opportunities across patients, services, and payers

import { prisma } from '@/lib/prisma';
import { PatientStatus } from '@prisma/client';
import type { OpportunityConfig, OpportunityType, RevenueOpportunityAnalysis } from './types';

// Default configuration
const DEFAULT_CONFIG: OpportunityConfig = {
  minOpportunityValue: 50,
  enabledTypes: [
    'recall_due',
    'treatment_plan_incomplete',
    'reactivation_candidate',
    'upsell_opportunity',
    'insurance_benefit_unused',
  ],
  recallIntervalDays: 180, // 6 months
  missedServiceLookbackDays: 90,
};

/**
 * Find patients due for recall visits
 */
async function findRecallOpportunities(
  organizationId: string,
  config: OpportunityConfig
): Promise<RevenueOpportunityAnalysis[]> {
  const recallDate = new Date();
  recallDate.setDate(recallDate.getDate() - config.recallIntervalDays);

  // Find patients who haven't visited in the recall period
  const patients = await prisma.patient.findMany({
    where: {
      organizationId,
      status: PatientStatus.ACTIVE,
      appointments: {
        none: {
          startTime: { gte: recallDate },
          status: { in: ['COMPLETED', 'CHECKED_IN', 'SCHEDULED'] },
        },
      },
    },
    include: {
      demographics: true,
      appointments: {
        orderBy: { startTime: 'desc' },
        take: 1,
        where: { status: { in: ['COMPLETED', 'CHECKED_IN'] } },
      },
      charges: {
        take: 10,
        orderBy: { chargeDate: 'desc' },
      },
    },
    take: 100,
  });

  const opportunities: RevenueOpportunityAnalysis[] = [];

  for (const patient of patients) {
    if (!patient.demographics) continue;

    const lastVisit = patient.appointments[0];
    const avgChargeValue =
      patient.charges.length > 0
        ? patient.charges.reduce((sum, c) => sum + Number(c.fee), 0) / patient.charges.length
        : 100;

    if (avgChargeValue < config.minOpportunityValue) continue;

    const daysSinceLastVisit = lastVisit
      ? Math.floor((Date.now() - new Date(lastVisit.startTime).getTime()) / (1000 * 60 * 60 * 24))
      : 365;

    opportunities.push({
      opportunityType: 'recall_due',
      title: `Recall due: ${patient.demographics.firstName} ${patient.demographics.lastName}`,
      description: `Patient hasn't been seen in ${daysSinceLastVisit} days. Based on their visit history, they're due for a follow-up.`,
      estimatedValue: avgChargeValue,
      confidence: Math.min(95, 60 + Math.min(35, daysSinceLastVisit / 10)),
      entityType: 'Patient',
      entityId: patient.id,
      entityName: `${patient.demographics.firstName} ${patient.demographics.lastName}`,
      suggestedAction: 'Send recall reminder via their preferred communication method',
      actionSteps: [
        'Review patient history before outreach',
        'Send personalized recall message',
        'Offer convenient scheduling options',
        'Follow up if no response in 7 days',
      ],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  return opportunities;
}

/**
 * Find patients with incomplete treatment plans
 */
async function findTreatmentPlanOpportunities(
  organizationId: string,
  config: OpportunityConfig
): Promise<RevenueOpportunityAnalysis[]> {
  // Find active treatment plans with remaining visits
  const treatmentPlans = await prisma.treatmentPlan.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
    },
    include: {
      patient: {
        include: { demographics: true },
      },
      encounters: {
        where: { status: 'COMPLETED' },
      },
    },
  });

  const opportunities: RevenueOpportunityAnalysis[] = [];

  for (const plan of treatmentPlans) {
    if (!plan.patient.demographics) continue;

    const completedVisits = plan.encounters.length;
    const recommendedVisits = plan.plannedVisits || 12;
    const remainingVisits = recommendedVisits - completedVisits;

    if (remainingVisits <= 0) continue;

    const estimatedValue = remainingVisits * 75; // Default visit fee
    if (estimatedValue < config.minOpportunityValue) continue;

    const completionPercent = Math.round((completedVisits / recommendedVisits) * 100);

    opportunities.push({
      opportunityType: 'treatment_plan_incomplete',
      title: `Incomplete treatment: ${plan.patient.demographics.firstName} ${plan.patient.demographics.lastName}`,
      description: `Treatment plan is ${completionPercent}% complete with ${remainingVisits} visits remaining. Patient may benefit from completing their recommended care.`,
      estimatedValue,
      confidence: 75 + Math.min(20, completionPercent / 5),
      entityType: 'Patient',
      entityId: plan.patient.id,
      entityName: `${plan.patient.demographics.firstName} ${plan.patient.demographics.lastName}`,
      suggestedAction: 'Contact patient to discuss continuing their treatment plan',
      actionSteps: [
        'Review treatment progress and outcomes',
        'Prepare talking points about benefits of completion',
        'Discuss any barriers to care',
        'Offer flexible scheduling',
      ],
    });
  }

  return opportunities.sort((a, b) => b.estimatedValue - a.estimatedValue);
}

/**
 * Find reactivation candidates (inactive patients)
 */
async function findReactivationOpportunities(
  organizationId: string,
  config: OpportunityConfig
): Promise<RevenueOpportunityAnalysis[]> {
  const inactiveDate = new Date();
  inactiveDate.setMonth(inactiveDate.getMonth() - 6);

  const maxInactiveDate = new Date();
  maxInactiveDate.setFullYear(maxInactiveDate.getFullYear() - 2);

  // Find patients who were active but haven't visited in 6+ months
  const patients = await prisma.patient.findMany({
    where: {
      organizationId,
      status: PatientStatus.ACTIVE,
      appointments: {
        some: {
          startTime: { gte: maxInactiveDate, lt: inactiveDate },
          status: { in: ['COMPLETED', 'CHECKED_IN'] },
        },
        none: {
          startTime: { gte: inactiveDate },
          status: { in: ['COMPLETED', 'CHECKED_IN', 'SCHEDULED'] },
        },
      },
    },
    include: {
      demographics: true,
      appointments: {
        orderBy: { startTime: 'desc' },
        take: 5,
        where: { status: { in: ['COMPLETED', 'CHECKED_IN'] } },
      },
      charges: {
        take: 20,
        orderBy: { chargeDate: 'desc' },
      },
    },
    take: 50,
  });

  const opportunities: RevenueOpportunityAnalysis[] = [];

  for (const patient of patients) {
    if (!patient.demographics) continue;

    const lastVisit = patient.appointments[0];
    const visitCount = patient.appointments.length;
    const totalCharges = patient.charges.reduce((sum, c) => sum + Number(c.fee), 0);
    const avgChargeValue = visitCount > 0 ? totalCharges / visitCount : 100;

    // Estimate annual value based on past behavior
    const estimatedAnnualValue = avgChargeValue * Math.min(12, visitCount);
    if (estimatedAnnualValue < config.minOpportunityValue) continue;

    const daysSinceLastVisit = lastVisit
      ? Math.floor((Date.now() - new Date(lastVisit.startTime).getTime()) / (1000 * 60 * 60 * 24))
      : 365;

    opportunities.push({
      opportunityType: 'reactivation_candidate',
      title: `Reactivation: ${patient.demographics.firstName} ${patient.demographics.lastName}`,
      description: `Former patient with ${visitCount} visits hasn't been seen in ${daysSinceLastVisit} days. Historical value: $${totalCharges.toFixed(0)}.`,
      estimatedValue: estimatedAnnualValue,
      confidence: Math.max(40, 70 - Math.min(30, daysSinceLastVisit / 20)),
      entityType: 'Patient',
      entityId: patient.id,
      entityName: `${patient.demographics.firstName} ${patient.demographics.lastName}`,
      suggestedAction: 'Send personalized reactivation campaign',
      actionSteps: [
        'Review patient history and reason for last visit',
        'Craft personalized outreach message',
        'Offer a special return visit incentive',
        'Track response and follow up',
      ],
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    });
  }

  return opportunities.sort((a, b) => b.estimatedValue - a.estimatedValue);
}

/**
 * Find upsell opportunities (services patients could benefit from)
 */
async function findUpsellOpportunities(
  organizationId: string,
  config: OpportunityConfig
): Promise<RevenueOpportunityAnalysis[]> {
  // Find patients with recent visits who may benefit from additional services
  const recentVisitDate = new Date();
  recentVisitDate.setDate(recentVisitDate.getDate() - config.missedServiceLookbackDays);

  const patients = await prisma.patient.findMany({
    where: {
      organizationId,
      status: PatientStatus.ACTIVE,
      appointments: {
        some: {
          startTime: { gte: recentVisitDate },
          status: { in: ['COMPLETED', 'CHECKED_IN'] },
        },
      },
    },
    include: {
      demographics: true,
      encounters: {
        take: 5,
        orderBy: { encounterDate: 'desc' },
        include: {
          procedures: true,
        },
      },
      treatmentPlans: {
        where: { status: 'ACTIVE' },
      },
    },
    take: 100,
  });

  const opportunities: RevenueOpportunityAnalysis[] = [];

  for (const patient of patients) {
    if (!patient.demographics) continue;

    // Check for patients with chronic conditions who might benefit from maintenance care
    const recentProcedures = patient.encounters.flatMap((e) => e.procedures);
    const hasManipulation = recentProcedures.some(
      (p) => p.cptCode?.startsWith('9894') || p.cptCode?.startsWith('9804')
    );

    if (hasManipulation && patient.treatmentPlans.length === 0) {
      opportunities.push({
        opportunityType: 'upsell_opportunity',
        title: `Wellness plan candidate: ${patient.demographics.firstName} ${patient.demographics.lastName}`,
        description: `Patient receives regular adjustments but has no active treatment plan. Consider discussing a wellness maintenance program.`,
        estimatedValue: 600, // Typical wellness plan annual value
        confidence: 65,
        entityType: 'Patient',
        entityId: patient.id,
        entityName: `${patient.demographics.firstName} ${patient.demographics.lastName}`,
        suggestedAction: 'Present wellness maintenance plan options',
        actionSteps: [
          'Review patient care history and outcomes',
          'Prepare wellness plan options and pricing',
          'Discuss benefits of proactive care',
          'Set up recurring appointments if interested',
        ],
      });
    }

    // Check for patients who might benefit from additional modalities
    const hasTherapeuticExercise = recentProcedures.some((p) => p.cptCode === '97110');
    const hasManualTherapy = recentProcedures.some((p) => p.cptCode === '97140');

    if (hasManipulation && !hasTherapeuticExercise) {
      opportunities.push({
        opportunityType: 'upsell_opportunity',
        title: `Add therapeutic exercise: ${patient.demographics.firstName} ${patient.demographics.lastName}`,
        description: `Patient may benefit from therapeutic exercises to complement their adjustments and improve outcomes.`,
        estimatedValue: 150,
        confidence: 55,
        entityType: 'Patient',
        entityId: patient.id,
        entityName: `${patient.demographics.firstName} ${patient.demographics.lastName}`,
        serviceCode: '97110',
        suggestedAction: 'Discuss therapeutic exercise benefits',
        actionSteps: [
          'Evaluate patient for exercise therapy',
          'Explain how exercises complement adjustments',
          'Create personalized exercise program',
        ],
      });
    }
  }

  return opportunities
    .filter((o) => o.estimatedValue >= config.minOpportunityValue)
    .sort((a, b) => b.estimatedValue - a.estimatedValue);
}

/**
 * Find underutilized insurance benefits
 */
async function findInsuranceBenefitOpportunities(
  organizationId: string,
  config: OpportunityConfig
): Promise<RevenueOpportunityAnalysis[]> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  // Find patients with insurance who haven't fully utilized benefits
  const patients = await prisma.patient.findMany({
    where: {
      organizationId,
      status: PatientStatus.ACTIVE,
      insurances: {
        some: {
          isActive: true,
          type: 'PRIMARY',
        },
      },
    },
    include: {
      demographics: true,
      insurances: {
        where: { isActive: true, type: 'PRIMARY' },
      },
      appointments: {
        where: {
          startTime: { gte: yearStart },
          status: { in: ['COMPLETED', 'CHECKED_IN'] },
        },
      },
    },
    take: 100,
  });

  const opportunities: RevenueOpportunityAnalysis[] = [];
  const currentMonth = new Date().getMonth();
  const monthsLeft = 12 - currentMonth;

  for (const patient of patients) {
    if (!patient.demographics || patient.insurances.length === 0) continue;

    const insurance = patient.insurances[0];
    const visitsThisYear = patient.appointments.length;

    // Estimate typical annual visit allowance (20-30 visits)
    const estimatedAllowance = 24;
    const remainingVisits = Math.max(0, estimatedAllowance - visitsThisYear);

    // Only flag if significant benefits remaining and year is not ending soon
    if (remainingVisits < 6 || monthsLeft < 3) continue;

    const avgVisitValue = 75;
    const estimatedValue = remainingVisits * avgVisitValue * 0.8; // 80% of value accounts for deductibles/copays

    if (estimatedValue < config.minOpportunityValue) continue;

    opportunities.push({
      opportunityType: 'insurance_benefit_unused',
      title: `Unused benefits: ${patient.demographics.firstName} ${patient.demographics.lastName}`,
      description: `Patient has used ${visitsThisYear} of estimated ${estimatedAllowance} covered visits this year. ${remainingVisits} visits may be available before year-end.`,
      estimatedValue,
      confidence: 60,
      entityType: 'Patient',
      entityId: patient.id,
      entityName: `${patient.demographics.firstName} ${patient.demographics.lastName}`,
      payerName: insurance.payerName,
      suggestedAction: 'Contact patient about available insurance benefits',
      actionSteps: [
        'Verify exact remaining benefits with payer',
        'Contact patient about year-end scheduling',
        'Explain use-it-or-lose-it benefits',
        'Offer convenient appointment times',
      ],
      expiresAt: new Date(new Date().getFullYear(), 11, 31),
    });
  }

  return opportunities.sort((a, b) => b.estimatedValue - a.estimatedValue);
}

/**
 * Main function to find all revenue opportunities
 */
export async function findRevenueOpportunities(
  organizationId: string,
  config: Partial<OpportunityConfig> = {}
): Promise<RevenueOpportunityAnalysis[]> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const allOpportunities: RevenueOpportunityAnalysis[] = [];

  // Run enabled opportunity finders
  if (finalConfig.enabledTypes.includes('recall_due')) {
    const recallOps = await findRecallOpportunities(organizationId, finalConfig);
    allOpportunities.push(...recallOps);
  }

  if (finalConfig.enabledTypes.includes('treatment_plan_incomplete')) {
    const treatmentOps = await findTreatmentPlanOpportunities(organizationId, finalConfig);
    allOpportunities.push(...treatmentOps);
  }

  if (finalConfig.enabledTypes.includes('reactivation_candidate')) {
    const reactivationOps = await findReactivationOpportunities(organizationId, finalConfig);
    allOpportunities.push(...reactivationOps);
  }

  if (finalConfig.enabledTypes.includes('upsell_opportunity')) {
    const upsellOps = await findUpsellOpportunities(organizationId, finalConfig);
    allOpportunities.push(...upsellOps);
  }

  if (finalConfig.enabledTypes.includes('insurance_benefit_unused')) {
    const insuranceOps = await findInsuranceBenefitOpportunities(organizationId, finalConfig);
    allOpportunities.push(...insuranceOps);
  }

  // Sort by estimated value descending
  return allOpportunities.sort((a, b) => b.estimatedValue - a.estimatedValue);
}

/**
 * Get opportunity summary
 */
export async function getOpportunitySummary(
  organizationId: string
): Promise<{
  totalOpportunities: number;
  totalEstimatedValue: number;
  byType: Record<OpportunityType, { count: number; value: number }>;
  topOpportunities: RevenueOpportunityAnalysis[];
}> {
  const opportunities = await findRevenueOpportunities(organizationId);

  const byType: Record<OpportunityType, { count: number; value: number }> = {
    underbilled_service: { count: 0, value: 0 },
    missed_modifier: { count: 0, value: 0 },
    recall_due: { count: 0, value: 0 },
    treatment_plan_incomplete: { count: 0, value: 0 },
    reactivation_candidate: { count: 0, value: 0 },
    upsell_opportunity: { count: 0, value: 0 },
    insurance_benefit_unused: { count: 0, value: 0 },
    cash_patient_conversion: { count: 0, value: 0 },
  };

  for (const opp of opportunities) {
    if (byType[opp.opportunityType]) {
      byType[opp.opportunityType].count++;
      byType[opp.opportunityType].value += opp.estimatedValue;
    }
  }

  return {
    totalOpportunities: opportunities.length,
    totalEstimatedValue: opportunities.reduce((sum, o) => sum + o.estimatedValue, 0),
    byType,
    topOpportunities: opportunities.slice(0, 10),
  };
}

/**
 * Save opportunities to database
 */
export async function saveOpportunities(
  organizationId: string,
  opportunities: RevenueOpportunityAnalysis[]
): Promise<number> {
  let savedCount = 0;

  for (const opp of opportunities) {
    await prisma.revenueOpportunity.create({
      data: {
        organizationId,
        opportunityType: opp.opportunityType,
        title: opp.title,
        description: opp.description,
        estimatedValue: opp.estimatedValue,
        confidence: opp.confidence,
        entityType: opp.entityType,
        entityId: opp.entityId,
        serviceCode: opp.serviceCode,
        payerName: opp.payerName,
        expiresAt: opp.expiresAt,
      },
    });
    savedCount++;
  }

  return savedCount;
}
