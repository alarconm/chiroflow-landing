// Recommendation Engine - AI Insights Agent
// Generates actionable recommendations based on practice data and insights

import { prisma } from '@/lib/prisma';
import { InsightPriority } from '@prisma/client';
import type { Recommendation, RecommendationType, BenchmarkComparison } from './types';
import { detectAnomalies } from './anomaly-detector';
import { analyzeAllPatientsChurnRisk } from './churn-predictor';
import { findRevenueOpportunities } from './opportunity-finder';

// Industry benchmarks for chiropractic practices
const INDUSTRY_BENCHMARKS = {
  collectionRate: { median: 95, p25: 88, p75: 98, p90: 99 },
  noShowRate: { median: 8, p25: 5, p75: 12, p90: 15 },
  patientRetention: { median: 65, p25: 50, p75: 78, p90: 85 },
  avgVisitValue: { median: 85, p25: 65, p75: 110, p90: 135 },
  avgDaysToCollect: { median: 35, p25: 25, p75: 50, p90: 70 },
  denialRate: { median: 8, p25: 4, p75: 12, p90: 18 },
  newPatientRate: { median: 12, p25: 8, p75: 18, p90: 25 }, // % of visits from new patients
  visitCompletionRate: { median: 88, p25: 82, p75: 93, p90: 96 },
};

/**
 * Calculate percentile rank for a value
 */
function calculatePercentileRank(
  value: number,
  benchmark: { median: number; p25: number; p75: number; p90: number }
): number {
  if (value <= benchmark.p25) {
    return (value / benchmark.p25) * 25;
  }
  if (value <= benchmark.median) {
    return 25 + ((value - benchmark.p25) / (benchmark.median - benchmark.p25)) * 25;
  }
  if (value <= benchmark.p75) {
    return 50 + ((value - benchmark.median) / (benchmark.p75 - benchmark.median)) * 25;
  }
  if (value <= benchmark.p90) {
    return 75 + ((value - benchmark.p75) / (benchmark.p90 - benchmark.p75)) * 15;
  }
  return Math.min(99, 90 + ((value - benchmark.p90) / benchmark.p90) * 9);
}

/**
 * Get practice metrics for comparison
 */
async function getPracticeMetrics(
  organizationId: string
): Promise<Record<string, number>> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    payments,
    charges,
    appointments,
    completedAppointments,
    noShows,
    newPatients,
    claims,
    deniedClaims,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: thirtyDaysAgo },
        isVoid: false,
      },
      _sum: { amount: true },
    }),
    prisma.charge.aggregate({
      where: {
        organizationId,
        chargeDate: { gte: thirtyDaysAgo },
        status: { not: 'VOID' },
      },
      _sum: { fee: true },
    }),
    prisma.appointment.count({
      where: {
        organizationId,
        startTime: { gte: thirtyDaysAgo },
      },
    }),
    prisma.appointment.count({
      where: {
        organizationId,
        startTime: { gte: thirtyDaysAgo },
        status: { in: ['COMPLETED', 'CHECKED_IN'] },
      },
    }),
    prisma.appointment.count({
      where: {
        organizationId,
        startTime: { gte: thirtyDaysAgo },
        status: 'NO_SHOW',
      },
    }),
    prisma.patient.count({
      where: {
        organizationId,
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.claim.count({
      where: {
        organizationId,
        submittedDate: { gte: thirtyDaysAgo },
        status: { in: ['SUBMITTED', 'ACCEPTED', 'PAID', 'DENIED'] },
      },
    }),
    prisma.claim.count({
      where: {
        organizationId,
        submittedDate: { gte: thirtyDaysAgo },
        status: 'DENIED',
      },
    }),
  ]);

  const totalPayments = Number(payments._sum.amount || 0);
  const totalCharges = Number(charges._sum.fee || 0);

  return {
    collectionRate: totalCharges > 0 ? (totalPayments / totalCharges) * 100 : 0,
    noShowRate: appointments > 0 ? (noShows / appointments) * 100 : 0,
    visitCompletionRate: appointments > 0 ? (completedAppointments / appointments) * 100 : 0,
    avgVisitValue: completedAppointments > 0 ? totalPayments / completedAppointments : 0,
    newPatientRate: completedAppointments > 0 ? (newPatients / completedAppointments) * 100 : 0,
    denialRate: claims > 0 ? (deniedClaims / claims) * 100 : 0,
    totalVisits: completedAppointments,
    totalRevenue: totalPayments,
    newPatients,
  };
}

/**
 * Compare practice metrics to benchmarks
 */
export async function compareToBenchmarks(
  organizationId: string
): Promise<BenchmarkComparison[]> {
  const metrics = await getPracticeMetrics(organizationId);
  const comparisons: BenchmarkComparison[] = [];

  // Collection Rate
  const collectionBenchmark = INDUSTRY_BENCHMARKS.collectionRate;
  const collectionRank = calculatePercentileRank(metrics.collectionRate, collectionBenchmark);
  comparisons.push({
    metricName: 'Collection Rate',
    practiceValue: metrics.collectionRate,
    industryMedian: collectionBenchmark.median,
    industryPercentile25: collectionBenchmark.p25,
    industryPercentile75: collectionBenchmark.p75,
    industryPercentile90: collectionBenchmark.p90,
    percentileRank: collectionRank,
    performance:
      metrics.collectionRate >= collectionBenchmark.median
        ? 'above'
        : metrics.collectionRate >= collectionBenchmark.p25
          ? 'at'
          : 'below',
    gap: metrics.collectionRate - collectionBenchmark.median,
    gapPercent: ((metrics.collectionRate - collectionBenchmark.median) / collectionBenchmark.median) * 100,
    trendDirection: 'stable',
    recommendation:
      metrics.collectionRate < collectionBenchmark.median
        ? 'Focus on reducing A/R days and following up on unpaid claims promptly.'
        : undefined,
  });

  // No-Show Rate (lower is better)
  const noShowBenchmark = INDUSTRY_BENCHMARKS.noShowRate;
  const noShowRank = 100 - calculatePercentileRank(metrics.noShowRate, noShowBenchmark);
  comparisons.push({
    metricName: 'No-Show Rate',
    practiceValue: metrics.noShowRate,
    industryMedian: noShowBenchmark.median,
    industryPercentile25: noShowBenchmark.p25,
    industryPercentile75: noShowBenchmark.p75,
    industryPercentile90: noShowBenchmark.p90,
    percentileRank: noShowRank,
    performance:
      metrics.noShowRate <= noShowBenchmark.median
        ? 'above'
        : metrics.noShowRate <= noShowBenchmark.p75
          ? 'at'
          : 'below',
    gap: noShowBenchmark.median - metrics.noShowRate,
    gapPercent: ((noShowBenchmark.median - metrics.noShowRate) / noShowBenchmark.median) * 100,
    trendDirection: 'stable',
    recommendation:
      metrics.noShowRate > noShowBenchmark.median
        ? 'Implement automated reminders (text/email) and consider a cancellation policy.'
        : undefined,
  });

  // Average Visit Value
  const avgVisitBenchmark = INDUSTRY_BENCHMARKS.avgVisitValue;
  const avgVisitRank = calculatePercentileRank(metrics.avgVisitValue, avgVisitBenchmark);
  comparisons.push({
    metricName: 'Average Visit Value',
    practiceValue: metrics.avgVisitValue,
    industryMedian: avgVisitBenchmark.median,
    industryPercentile25: avgVisitBenchmark.p25,
    industryPercentile75: avgVisitBenchmark.p75,
    industryPercentile90: avgVisitBenchmark.p90,
    percentileRank: avgVisitRank,
    performance:
      metrics.avgVisitValue >= avgVisitBenchmark.median
        ? 'above'
        : metrics.avgVisitValue >= avgVisitBenchmark.p25
          ? 'at'
          : 'below',
    gap: metrics.avgVisitValue - avgVisitBenchmark.median,
    gapPercent: ((metrics.avgVisitValue - avgVisitBenchmark.median) / avgVisitBenchmark.median) * 100,
    trendDirection: 'stable',
    recommendation:
      metrics.avgVisitValue < avgVisitBenchmark.median
        ? 'Review fee schedules and consider adding ancillary services like therapeutic exercises.'
        : undefined,
  });

  // Denial Rate (lower is better)
  const denialBenchmark = INDUSTRY_BENCHMARKS.denialRate;
  const denialRank = 100 - calculatePercentileRank(metrics.denialRate, denialBenchmark);
  comparisons.push({
    metricName: 'Claim Denial Rate',
    practiceValue: metrics.denialRate,
    industryMedian: denialBenchmark.median,
    industryPercentile25: denialBenchmark.p25,
    industryPercentile75: denialBenchmark.p75,
    industryPercentile90: denialBenchmark.p90,
    percentileRank: denialRank,
    performance:
      metrics.denialRate <= denialBenchmark.median
        ? 'above'
        : metrics.denialRate <= denialBenchmark.p75
          ? 'at'
          : 'below',
    gap: denialBenchmark.median - metrics.denialRate,
    gapPercent: ((denialBenchmark.median - metrics.denialRate) / denialBenchmark.median) * 100,
    trendDirection: 'stable',
    recommendation:
      metrics.denialRate > denialBenchmark.median
        ? 'Review denial reasons and ensure proper coding and eligibility verification.'
        : undefined,
  });

  // New Patient Rate
  const newPatientBenchmark = INDUSTRY_BENCHMARKS.newPatientRate;
  const newPatientRank = calculatePercentileRank(metrics.newPatientRate, newPatientBenchmark);
  comparisons.push({
    metricName: 'New Patient Rate',
    practiceValue: metrics.newPatientRate,
    industryMedian: newPatientBenchmark.median,
    industryPercentile25: newPatientBenchmark.p25,
    industryPercentile75: newPatientBenchmark.p75,
    industryPercentile90: newPatientBenchmark.p90,
    percentileRank: newPatientRank,
    performance:
      metrics.newPatientRate >= newPatientBenchmark.median
        ? 'above'
        : metrics.newPatientRate >= newPatientBenchmark.p25
          ? 'at'
          : 'below',
    gap: metrics.newPatientRate - newPatientBenchmark.median,
    gapPercent: ((metrics.newPatientRate - newPatientBenchmark.median) / newPatientBenchmark.median) * 100,
    trendDirection: 'stable',
    recommendation:
      metrics.newPatientRate < newPatientBenchmark.median
        ? 'Review marketing effectiveness and referral programs. Consider online presence improvements.'
        : undefined,
  });

  return comparisons;
}

/**
 * Generate recommendations based on insights
 */
export async function generateRecommendations(
  organizationId: string
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];
  const recommendationId = () => `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Get data for analysis
  const [anomalies, churnRisks, opportunities, benchmarks] = await Promise.all([
    detectAnomalies(organizationId).catch(() => []),
    analyzeAllPatientsChurnRisk(organizationId, {}, { limit: 50 }).catch(() => []),
    findRevenueOpportunities(organizationId).catch(() => []),
    compareToBenchmarks(organizationId).catch(() => []),
  ]);

  // Recommendations from anomalies
  const criticalAnomalies = anomalies.filter(
    (a) => a.priority === InsightPriority.CRITICAL || a.priority === InsightPriority.HIGH
  );

  if (criticalAnomalies.length > 0) {
    const revenueAnomalies = criticalAnomalies.filter(
      (a) => a.type === 'REVENUE_DROP' || a.type === 'COLLECTION_DROP'
    );
    if (revenueAnomalies.length > 0) {
      recommendations.push({
        id: recommendationId(),
        type: 'improve_collections',
        title: 'Address revenue anomalies',
        description: `${revenueAnomalies.length} revenue-related anomalies detected that need attention.`,
        impact: `Potential impact: $${revenueAnomalies.reduce((sum, a) => sum + Math.abs(a.actualValue - a.expectedValue), 0).toFixed(0)} per day`,
        priority: InsightPriority.HIGH,
        confidence: 85,
        actionSteps: [
          'Review the detailed anomaly reports in the dashboard',
          'Check for billing issues or payment delays',
          'Verify scheduling is at expected capacity',
          'Follow up on outstanding claims',
        ],
        estimatedEffort: 'medium',
        estimatedImpact: revenueAnomalies.reduce(
          (sum, a) => sum + Math.abs(a.actualValue - a.expectedValue),
          0
        ),
        supportingMetrics: revenueAnomalies.map((a) => ({
          metricName: a.metric,
          currentValue: a.actualValue,
          targetValue: a.expectedValue,
        })),
      });
    }
  }

  // Recommendations from churn risks
  const highChurnPatients = churnRisks.filter(
    (c) => c.riskLevel === 'VERY_HIGH' || c.riskLevel === 'HIGH'
  );

  if (highChurnPatients.length > 0) {
    const totalAtRiskValue = highChurnPatients.length * 1200; // Estimate annual patient value
    recommendations.push({
      id: recommendationId(),
      type: 'improve_retention',
      title: `${highChurnPatients.length} patients at high churn risk`,
      description:
        'These patients show signs of disengagement and may stop visiting without intervention.',
      impact: `Estimated annual value at risk: $${totalAtRiskValue.toLocaleString()}`,
      priority: highChurnPatients.length > 10 ? InsightPriority.HIGH : InsightPriority.MEDIUM,
      confidence: 75,
      actionSteps: [
        'Review the churn risk list and prioritize outreach',
        'Contact high-risk patients with personalized messages',
        'Address any outstanding concerns or balance issues',
        'Offer convenient scheduling options',
      ],
      estimatedEffort: 'medium',
      estimatedImpact: totalAtRiskValue * 0.3, // Assume 30% can be retained
      supportingMetrics: [
        {
          metricName: 'High-risk patients',
          currentValue: highChurnPatients.length,
        },
        {
          metricName: 'Value at risk',
          currentValue: totalAtRiskValue,
        },
      ],
    });
  }

  // Recommendations from opportunities
  const totalOpportunityValue = opportunities.reduce((sum, o) => sum + o.estimatedValue, 0);

  if (opportunities.length > 0) {
    // Recall opportunities
    const recallOpportunities = opportunities.filter((o) => o.opportunityType === 'recall_due');
    if (recallOpportunities.length > 5) {
      recommendations.push({
        id: recommendationId(),
        type: 'increase_revenue',
        title: `${recallOpportunities.length} patients due for recall visits`,
        description: 'These patients are past their recommended visit interval.',
        impact: `Potential revenue: $${recallOpportunities.reduce((sum, o) => sum + o.estimatedValue, 0).toFixed(0)}`,
        priority: InsightPriority.MEDIUM,
        confidence: 70,
        actionSteps: [
          'Run an automated recall campaign',
          'Personalize messages based on last visit type',
          'Track response rates and follow up',
        ],
        estimatedEffort: 'low',
        estimatedImpact: recallOpportunities.reduce((sum, o) => sum + o.estimatedValue, 0) * 0.2,
        supportingMetrics: [
          {
            metricName: 'Recall candidates',
            currentValue: recallOpportunities.length,
          },
        ],
      });
    }

    // Treatment plan completion
    const treatmentOpps = opportunities.filter(
      (o) => o.opportunityType === 'treatment_plan_incomplete'
    );
    if (treatmentOpps.length > 3) {
      recommendations.push({
        id: recommendationId(),
        type: 'increase_revenue',
        title: `${treatmentOpps.length} incomplete treatment plans`,
        description: 'Patients with active treatment plans who have remaining recommended visits.',
        impact: `Potential revenue: $${treatmentOpps.reduce((sum, o) => sum + o.estimatedValue, 0).toFixed(0)}`,
        priority: InsightPriority.MEDIUM,
        confidence: 80,
        actionSteps: [
          'Review each incomplete treatment plan',
          'Contact patients to discuss continuing care',
          'Address any barriers to treatment completion',
        ],
        estimatedEffort: 'medium',
        estimatedImpact: treatmentOpps.reduce((sum, o) => sum + o.estimatedValue, 0) * 0.4,
        supportingMetrics: [
          {
            metricName: 'Incomplete plans',
            currentValue: treatmentOpps.length,
          },
        ],
      });
    }
  }

  // Recommendations from benchmarks
  const underperformingMetrics = benchmarks.filter((b) => b.performance === 'below');

  for (const metric of underperformingMetrics) {
    let recommendationType: RecommendationType = 'operational_efficiency';
    let actionSteps: string[] = [];

    switch (metric.metricName) {
      case 'Collection Rate':
        recommendationType = 'improve_collections';
        actionSteps = [
          'Review A/R aging report weekly',
          'Follow up on claims over 30 days',
          'Verify patient insurance eligibility at check-in',
          'Consider implementing payment at time of service',
        ];
        break;
      case 'No-Show Rate':
        recommendationType = 'reduce_no_shows';
        actionSteps = [
          'Implement automated text/email reminders',
          'Send reminders 24 hours and 2 hours before appointments',
          'Consider a no-show policy with consequences',
          'Offer easy online rescheduling',
        ];
        break;
      case 'Average Visit Value':
        recommendationType = 'increase_revenue';
        actionSteps = [
          'Review and update fee schedules',
          'Ensure all billable services are captured',
          'Consider adding ancillary services',
          'Train staff on proper coding',
        ];
        break;
      case 'Claim Denial Rate':
        recommendationType = 'billing_opportunity';
        actionSteps = [
          'Analyze top denial reasons',
          'Improve eligibility verification process',
          'Review coding practices',
          'Consider claims scrubbing software',
        ];
        break;
      case 'New Patient Rate':
        recommendationType = 'patient_engagement';
        actionSteps = [
          'Review and improve online presence',
          'Implement a referral program',
          'Optimize Google My Business listing',
          'Consider targeted local marketing',
        ];
        break;
    }

    recommendations.push({
      id: recommendationId(),
      type: recommendationType,
      title: `Improve ${metric.metricName.toLowerCase()}`,
      description: `Your ${metric.metricName.toLowerCase()} is below the industry median. ${metric.recommendation || ''}`,
      impact: `Currently at ${metric.practiceValue.toFixed(1)}%, industry median is ${metric.industryMedian}%`,
      priority: metric.gapPercent < -20 ? InsightPriority.HIGH : InsightPriority.MEDIUM,
      confidence: 85,
      actionSteps,
      estimatedEffort: 'medium',
      estimatedImpact: Math.abs(metric.gap) * 100, // Rough estimate
      supportingMetrics: [
        {
          metricName: metric.metricName,
          currentValue: metric.practiceValue,
          targetValue: metric.industryMedian,
          benchmarkValue: metric.industryPercentile75,
        },
      ],
    });
  }

  // Sort by priority and return top recommendations
  const priorityOrder = {
    [InsightPriority.CRITICAL]: 0,
    [InsightPriority.HIGH]: 1,
    [InsightPriority.MEDIUM]: 2,
    [InsightPriority.LOW]: 3,
    [InsightPriority.INFO]: 4,
  };

  return recommendations
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, 10);
}

/**
 * Get a quick summary of recommendations
 */
export async function getRecommendationSummary(
  organizationId: string
): Promise<{
  totalRecommendations: number;
  highPriority: number;
  estimatedTotalImpact: number;
  topActions: string[];
}> {
  const recommendations = await generateRecommendations(organizationId);

  return {
    totalRecommendations: recommendations.length,
    highPriority: recommendations.filter(
      (r) => r.priority === InsightPriority.CRITICAL || r.priority === InsightPriority.HIGH
    ).length,
    estimatedTotalImpact: recommendations.reduce((sum, r) => sum + (r.estimatedImpact || 0), 0),
    topActions: recommendations.slice(0, 3).map((r) => r.actionSteps[0]),
  };
}
