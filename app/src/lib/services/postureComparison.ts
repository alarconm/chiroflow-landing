/**
 * Posture Comparison Service
 *
 * This service provides functionality for comparing posture assessments
 * over time, generating comparison reports, and tracking progress.
 *
 * Key features:
 * - Side-by-side image comparison
 * - Measurement change tracking
 * - Progress visualization data
 * - Before/after overlay calculations
 * - PDF-ready report generation
 * - Treatment plan goal integration
 */

import {
  type SeverityLevel,
  type DeviationMeasurement,
  DEVIATION_TYPES,
} from './deviationAnalysis';

// ============================================
// TYPES
// ============================================

export type PostureView = 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT';

export interface PostureAssessmentSummary {
  id: string;
  date: Date;
  patientId: string;
  views: PostureView[];
  imageCount: number;
  deviationCount: number;
  overallSeverity: SeverityLevel;
  isComplete: boolean;
}

export interface PostureImageData {
  id: string;
  view: PostureView;
  imageUrl: string;
  thumbnailUrl?: string;
  landmarks: Array<{
    name: string;
    x: number;
    y: number;
    confidence: number;
  }>;
}

export interface DeviationComparison {
  deviationType: string;
  name: string;
  previousValue: number | null;
  currentValue: number | null;
  unit: string;
  change: number;
  changePercent: number;
  previousSeverity: SeverityLevel | null;
  currentSeverity: SeverityLevel | null;
  improvement: 'improved' | 'declined' | 'stable' | 'new' | 'resolved';
  notes: string;
}

export interface ViewComparison {
  view: PostureView;
  previousImage: PostureImageData | null;
  currentImage: PostureImageData | null;
  deviations: DeviationComparison[];
}

export interface ComparisonResult {
  previousAssessment: PostureAssessmentSummary;
  currentAssessment: PostureAssessmentSummary;
  daysBetween: number;
  viewComparisons: ViewComparison[];
  overallProgress: {
    totalDeviations: {
      previous: number;
      current: number;
    };
    significantDeviations: {
      previous: number;
      current: number;
    };
    overallSeverity: {
      previous: SeverityLevel;
      current: SeverityLevel;
    };
    improvementScore: number; // -100 to 100
    summary: string;
  };
  recommendations: string[];
}

export interface ProgressTrend {
  deviationType: string;
  name: string;
  unit: string;
  dataPoints: Array<{
    date: Date;
    value: number;
    severity: SeverityLevel;
  }>;
  trend: 'improving' | 'worsening' | 'stable';
  changeFromFirst: number;
  changeFromPrevious: number;
}

export interface ComparisonReport {
  title: string;
  generatedAt: Date;
  patientInfo: {
    name: string;
    mrn: string;
    dateOfBirth?: string;
  };
  practitionerInfo: {
    name: string;
    title?: string;
  };
  organizationInfo: {
    name: string;
    address?: string;
    phone?: string;
  };
  comparisonDates: {
    previous: Date;
    current: Date;
    daysBetween: number;
  };
  executiveSummary: string;
  viewComparisons: Array<{
    view: PostureView;
    viewLabel: string;
    previousImageUrl: string | null;
    currentImageUrl: string | null;
    findings: Array<{
      finding: string;
      change: string;
      status: 'improved' | 'declined' | 'stable' | 'new' | 'resolved';
    }>;
  }>;
  measurementTable: Array<{
    measurement: string;
    previousValue: string;
    currentValue: string;
    change: string;
    normalRange: string;
    status: 'improved' | 'declined' | 'stable' | 'new' | 'resolved';
  }>;
  progressCharts: Array<{
    title: string;
    type: 'bar' | 'line' | 'gauge';
    data: Record<string, number | string>;
  }>;
  recommendations: string[];
  treatmentGoals?: Array<{
    goal: string;
    baseline: string;
    target: string;
    current: string;
    progress: number;
  }>;
  disclaimer: string;
}

// ============================================
// CONSTANTS
// ============================================

const VIEW_LABELS: Record<PostureView, string> = {
  ANTERIOR: 'Anterior (Front) View',
  POSTERIOR: 'Posterior (Back) View',
  LATERAL_LEFT: 'Left Lateral View',
  LATERAL_RIGHT: 'Right Lateral View',
};

const SEVERITY_ORDER: SeverityLevel[] = ['MINIMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREME'];

// ============================================
// COMPARISON FUNCTIONS
// ============================================

/**
 * Compare two deviation values and determine improvement
 */
export function compareDeviationValues(
  previousValue: number | null,
  currentValue: number | null,
  normalRangeMin: number,
  normalRangeMax: number
): { change: number; changePercent: number; improvement: DeviationComparison['improvement'] } {
  // Handle new or resolved deviations
  if (previousValue === null && currentValue !== null) {
    return { change: currentValue, changePercent: 0, improvement: 'new' };
  }
  if (previousValue !== null && currentValue === null) {
    return { change: -previousValue, changePercent: -100, improvement: 'resolved' };
  }
  if (previousValue === null || currentValue === null) {
    return { change: 0, changePercent: 0, improvement: 'stable' };
  }

  const change = currentValue - previousValue;
  const changePercent = previousValue !== 0 ? (change / previousValue) * 100 : 0;

  // Determine if the change is toward normal (improvement) or away (decline)
  const normalMid = (normalRangeMin + normalRangeMax) / 2;
  const previousDistFromNormal = Math.abs(previousValue - normalMid);
  const currentDistFromNormal = Math.abs(currentValue - normalMid);

  let improvement: DeviationComparison['improvement'];
  if (Math.abs(currentDistFromNormal - previousDistFromNormal) < 0.5) {
    improvement = 'stable';
  } else if (currentDistFromNormal < previousDistFromNormal) {
    improvement = 'improved';
  } else {
    improvement = 'declined';
  }

  return { change, changePercent: Math.round(changePercent * 10) / 10, improvement };
}

/**
 * Compare severity levels
 */
export function compareSeverity(
  previous: SeverityLevel | null,
  current: SeverityLevel | null
): 'improved' | 'declined' | 'stable' | 'new' | 'resolved' {
  if (previous === null && current !== null) return 'new';
  if (previous !== null && current === null) return 'resolved';
  if (previous === null || current === null) return 'stable';

  const prevIndex = SEVERITY_ORDER.indexOf(previous);
  const currIndex = SEVERITY_ORDER.indexOf(current);

  if (currIndex < prevIndex) return 'improved';
  if (currIndex > prevIndex) return 'declined';
  return 'stable';
}

/**
 * Generate comparison for deviations between two assessments
 */
export function compareDeviations(
  previousDeviations: DeviationMeasurement[],
  currentDeviations: DeviationMeasurement[],
  view: PostureView
): DeviationComparison[] {
  const comparisons: DeviationComparison[] = [];

  // Get all unique deviation types from both sets
  const allTypes = new Set<string>();
  previousDeviations.forEach((d) => allTypes.add(d.deviationType));
  currentDeviations.forEach((d) => allTypes.add(d.deviationType));

  for (const deviationType of allTypes) {
    const prevDev = previousDeviations.find((d) => d.deviationType === deviationType);
    const currDev = currentDeviations.find((d) => d.deviationType === deviationType);

    const deviationDef = DEVIATION_TYPES[deviationType.toUpperCase() as keyof typeof DEVIATION_TYPES];
    const name = deviationDef?.name || currDev?.name || prevDev?.name || deviationType;
    const unit = currDev?.measurementUnit || prevDev?.measurementUnit || '';
    const normalMin = currDev?.normalRangeMin ?? prevDev?.normalRangeMin ?? 0;
    const normalMax = currDev?.normalRangeMax ?? prevDev?.normalRangeMax ?? 0;

    const { change, changePercent, improvement } = compareDeviationValues(
      prevDev?.measurementValue ?? null,
      currDev?.measurementValue ?? null,
      normalMin,
      normalMax
    );

    let notes = '';
    if (improvement === 'improved') {
      notes = `Improved by ${Math.abs(change).toFixed(1)}${unit}`;
    } else if (improvement === 'declined') {
      notes = `Worsened by ${Math.abs(change).toFixed(1)}${unit}`;
    } else if (improvement === 'new') {
      notes = 'New finding in current assessment';
    } else if (improvement === 'resolved') {
      notes = 'Finding resolved since previous assessment';
    } else {
      notes = 'No significant change';
    }

    comparisons.push({
      deviationType,
      name,
      previousValue: prevDev?.measurementValue ?? null,
      currentValue: currDev?.measurementValue ?? null,
      unit,
      change,
      changePercent,
      previousSeverity: prevDev?.severity ?? null,
      currentSeverity: currDev?.severity ?? null,
      improvement,
      notes,
    });
  }

  return comparisons;
}

/**
 * Calculate overall improvement score
 * Returns a value from -100 (much worse) to +100 (much better)
 */
export function calculateImprovementScore(comparisons: DeviationComparison[]): number {
  if (comparisons.length === 0) return 0;

  let totalScore = 0;
  let weightedCount = 0;

  for (const comparison of comparisons) {
    // Weight by severity - more severe issues carry more weight
    const severityWeight = comparison.currentSeverity
      ? SEVERITY_ORDER.indexOf(comparison.currentSeverity) + 1
      : comparison.previousSeverity
        ? SEVERITY_ORDER.indexOf(comparison.previousSeverity) + 1
        : 1;

    let score = 0;
    switch (comparison.improvement) {
      case 'improved':
        score = 25 + Math.min(Math.abs(comparison.changePercent) / 2, 25);
        break;
      case 'declined':
        score = -25 - Math.min(Math.abs(comparison.changePercent) / 2, 25);
        break;
      case 'resolved':
        score = 50;
        break;
      case 'new':
        score = -50;
        break;
      default:
        score = 0;
    }

    totalScore += score * severityWeight;
    weightedCount += severityWeight;
  }

  return Math.round((totalScore / weightedCount) * 2);
}

/**
 * Generate progress summary text
 */
export function generateProgressSummary(
  improvementScore: number,
  comparisons: DeviationComparison[],
  daysBetween: number
): string {
  const improved = comparisons.filter((c) => c.improvement === 'improved').length;
  const declined = comparisons.filter((c) => c.improvement === 'declined').length;
  const stable = comparisons.filter((c) => c.improvement === 'stable').length;
  const resolved = comparisons.filter((c) => c.improvement === 'resolved').length;
  const newFindings = comparisons.filter((c) => c.improvement === 'new').length;

  let summary = `Over the ${daysBetween}-day period between assessments, `;

  if (improvementScore > 25) {
    summary += 'significant improvement has been observed. ';
  } else if (improvementScore > 0) {
    summary += 'some improvement has been noted. ';
  } else if (improvementScore === 0) {
    summary += 'the posture has remained relatively stable. ';
  } else if (improvementScore > -25) {
    summary += 'some decline has been observed. ';
  } else {
    summary += 'significant decline has been noted. ';
  }

  const changes: string[] = [];
  if (improved > 0) changes.push(`${improved} finding${improved > 1 ? 's' : ''} improved`);
  if (declined > 0) changes.push(`${declined} finding${declined > 1 ? 's' : ''} worsened`);
  if (resolved > 0) changes.push(`${resolved} finding${resolved > 1 ? 's' : ''} resolved`);
  if (newFindings > 0) changes.push(`${newFindings} new finding${newFindings > 1 ? 's' : ''} identified`);
  if (stable > 0 && changes.length > 0) changes.push(`${stable} remained stable`);

  if (changes.length > 0) {
    summary += changes.join(', ') + '.';
  }

  return summary;
}

/**
 * Generate comparison recommendations
 */
export function generateComparisonRecommendations(
  comparisons: DeviationComparison[],
  improvementScore: number
): string[] {
  const recommendations: string[] = [];

  // Group by improvement status
  const improved = comparisons.filter((c) => c.improvement === 'improved');
  const declined = comparisons.filter((c) => c.improvement === 'declined');
  const newFindings = comparisons.filter((c) => c.improvement === 'new');

  // Add recommendations based on declined or new findings
  for (const comparison of [...declined, ...newFindings]) {
    const deviationDef = DEVIATION_TYPES[comparison.deviationType.toUpperCase() as keyof typeof DEVIATION_TYPES];
    if (!deviationDef) continue;

    switch (comparison.deviationType) {
      case 'head_forward':
        recommendations.push('Increase cervical strengthening exercises frequency');
        recommendations.push('Re-evaluate workstation ergonomics');
        break;
      case 'shoulder_uneven':
      case 'hip_uneven':
        recommendations.push('Assess for any leg length discrepancy changes');
        recommendations.push('Review core stabilization exercises');
        break;
      case 'kyphosis':
        recommendations.push('Intensify thoracic extension exercises');
        recommendations.push('Consider postural bracing evaluation');
        break;
      case 'lordosis':
        recommendations.push('Review hip flexor and core exercise compliance');
        break;
      case 'scoliosis':
        if (comparison.improvement === 'declined') {
          recommendations.push('Consider radiographic follow-up if curve has increased');
        }
        break;
    }
  }

  // Add maintenance recommendations for improved areas
  if (improved.length > 0) {
    recommendations.push('Continue current treatment protocol for maintaining improvements');
  }

  // General recommendations based on overall score
  if (improvementScore >= 25) {
    recommendations.push('Progress to next phase of treatment plan');
    recommendations.push('Consider extending follow-up interval if progress continues');
  } else if (improvementScore <= -25) {
    recommendations.push('Review treatment plan and consider modifications');
    recommendations.push('Assess patient compliance with home exercises');
    recommendations.push('Schedule follow-up assessment in 2-4 weeks');
  } else {
    recommendations.push('Continue current treatment plan with monitoring');
    recommendations.push('Follow up in 4-6 weeks to assess progress');
  }

  // Remove duplicates
  return [...new Set(recommendations)];
}

// ============================================
// TREND ANALYSIS
// ============================================

/**
 * Calculate trend for a deviation type across multiple assessments
 */
export function calculateDeviationTrend(
  dataPoints: Array<{ date: Date; value: number; severity: SeverityLevel }>
): { trend: 'improving' | 'worsening' | 'stable'; changeFromFirst: number; changeFromPrevious: number } {
  if (dataPoints.length < 2) {
    return { trend: 'stable', changeFromFirst: 0, changeFromPrevious: 0 };
  }

  const first = dataPoints[0];
  const last = dataPoints[dataPoints.length - 1];
  const previous = dataPoints[dataPoints.length - 2];

  const changeFromFirst = last.value - first.value;
  const changeFromPrevious = last.value - previous.value;

  // Calculate overall trend using linear regression approximation
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  const n = dataPoints.length;

  dataPoints.forEach((point, index) => {
    sumX += index;
    sumY += point.value;
    sumXY += index * point.value;
    sumX2 += index * index;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Threshold for considering change significant
  const threshold = 0.1;

  let trend: 'improving' | 'worsening' | 'stable';
  if (Math.abs(slope) < threshold) {
    trend = 'stable';
  } else if (slope < 0) {
    // Decreasing values generally mean improvement (closer to normal)
    trend = 'improving';
  } else {
    trend = 'worsening';
  }

  return {
    trend,
    changeFromFirst: Math.round(changeFromFirst * 10) / 10,
    changeFromPrevious: Math.round(changeFromPrevious * 10) / 10,
  };
}

// ============================================
// REPORT GENERATION
// ============================================

/**
 * Format measurement value with unit for display
 */
export function formatMeasurement(value: number | null, unit: string): string {
  if (value === null) return 'N/A';
  return `${value.toFixed(1)}${unit}`;
}

/**
 * Format change with sign and unit
 */
export function formatChange(change: number, unit: string): string {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}${unit}`;
}

/**
 * Get improvement status label
 */
export function getStatusLabel(status: DeviationComparison['improvement']): string {
  switch (status) {
    case 'improved':
      return 'Improved';
    case 'declined':
      return 'Worsened';
    case 'stable':
      return 'Stable';
    case 'new':
      return 'New Finding';
    case 'resolved':
      return 'Resolved';
    default:
      return 'Unknown';
  }
}

/**
 * Get status color classes for UI
 */
export function getStatusColors(status: DeviationComparison['improvement']): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case 'improved':
    case 'resolved':
      return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' };
    case 'declined':
    case 'new':
      return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' };
    case 'stable':
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' };
  }
}

/**
 * Generate comparison report structure
 */
export function generateComparisonReport(
  comparison: ComparisonResult,
  patientInfo: ComparisonReport['patientInfo'],
  practitionerInfo: ComparisonReport['practitionerInfo'],
  organizationInfo: ComparisonReport['organizationInfo'],
  treatmentGoals?: ComparisonReport['treatmentGoals']
): ComparisonReport {
  // Generate executive summary
  const executiveSummary = `
This posture comparison report documents the changes observed between assessments conducted on
${comparison.previousAssessment.date.toLocaleDateString()} and ${comparison.currentAssessment.date.toLocaleDateString()},
a period of ${comparison.daysBetween} days.

${comparison.overallProgress.summary}

Overall Progress Score: ${comparison.overallProgress.improvementScore > 0 ? '+' : ''}${comparison.overallProgress.improvementScore}/100
Previous Overall Severity: ${comparison.overallProgress.overallSeverity.previous}
Current Overall Severity: ${comparison.overallProgress.overallSeverity.current}
`.trim();

  // Build view comparisons
  const viewComparisons: ComparisonReport['viewComparisons'] = comparison.viewComparisons.map((vc) => ({
    view: vc.view,
    viewLabel: VIEW_LABELS[vc.view],
    previousImageUrl: vc.previousImage?.imageUrl ?? null,
    currentImageUrl: vc.currentImage?.imageUrl ?? null,
    findings: vc.deviations.map((d) => ({
      finding: d.name,
      change: d.improvement === 'new' || d.improvement === 'resolved'
        ? getStatusLabel(d.improvement)
        : formatChange(d.change, d.unit),
      status: d.improvement,
    })),
  }));

  // Build measurement table
  const measurementTable: ComparisonReport['measurementTable'] = [];
  for (const vc of comparison.viewComparisons) {
    for (const d of vc.deviations) {
      const deviationDef = DEVIATION_TYPES[d.deviationType.toUpperCase() as keyof typeof DEVIATION_TYPES];
      const normalRange = deviationDef
        ? `${deviationDef.normalRangeMin} - ${deviationDef.normalRangeMax}${d.unit}`
        : 'N/A';

      measurementTable.push({
        measurement: d.name,
        previousValue: formatMeasurement(d.previousValue, d.unit),
        currentValue: formatMeasurement(d.currentValue, d.unit),
        change: formatChange(d.change, d.unit),
        normalRange,
        status: d.improvement,
      });
    }
  }

  // Generate progress charts data
  const progressCharts: ComparisonReport['progressCharts'] = [
    {
      title: 'Overall Progress',
      type: 'gauge',
      data: {
        value: comparison.overallProgress.improvementScore,
        min: -100,
        max: 100,
        label: 'Improvement Score',
      },
    },
    {
      title: 'Deviation Changes',
      type: 'bar',
      data: {
        improved: comparison.viewComparisons.flatMap((vc) =>
          vc.deviations.filter((d) => d.improvement === 'improved')
        ).length,
        stable: comparison.viewComparisons.flatMap((vc) =>
          vc.deviations.filter((d) => d.improvement === 'stable')
        ).length,
        declined: comparison.viewComparisons.flatMap((vc) =>
          vc.deviations.filter((d) => d.improvement === 'declined')
        ).length,
        new: comparison.viewComparisons.flatMap((vc) =>
          vc.deviations.filter((d) => d.improvement === 'new')
        ).length,
        resolved: comparison.viewComparisons.flatMap((vc) =>
          vc.deviations.filter((d) => d.improvement === 'resolved')
        ).length,
      },
    },
  ];

  return {
    title: `Posture Comparison Report - ${patientInfo.name}`,
    generatedAt: new Date(),
    patientInfo,
    practitionerInfo,
    organizationInfo,
    comparisonDates: {
      previous: comparison.previousAssessment.date,
      current: comparison.currentAssessment.date,
      daysBetween: comparison.daysBetween,
    },
    executiveSummary,
    viewComparisons,
    measurementTable,
    progressCharts,
    recommendations: comparison.recommendations,
    treatmentGoals,
    disclaimer: `
This report is generated based on visual posture analysis and AI-assisted landmark detection.
Measurements should be interpreted in conjunction with clinical examination. This report is
for clinical reference only and should not be used as the sole basis for diagnosis or treatment.
`.trim(),
  };
}

// ============================================
// OVERLAY CALCULATIONS
// ============================================

export interface OverlayPosition {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/**
 * Calculate overlay transformation for aligning two images
 * Uses landmark positions to compute optimal alignment
 */
export function calculateOverlayAlignment(
  previousLandmarks: Array<{ name: string; x: number; y: number }>,
  currentLandmarks: Array<{ name: string; x: number; y: number }>
): OverlayPosition {
  // Find common landmarks
  const commonLandmarks = previousLandmarks.filter((prev) =>
    currentLandmarks.some((curr) => curr.name === prev.name)
  );

  if (commonLandmarks.length < 2) {
    return { x: 0, y: 0, scale: 1, rotation: 0 };
  }

  // Use two reference points for alignment (e.g., shoulders or hips)
  const referencePoints = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'];
  const refLandmarks = commonLandmarks.filter((l) => referencePoints.includes(l.name));

  if (refLandmarks.length < 2) {
    // Fallback to any two common landmarks
    const prev1 = commonLandmarks[0];
    const prev2 = commonLandmarks[1];
    const curr1 = currentLandmarks.find((l) => l.name === prev1.name)!;
    const curr2 = currentLandmarks.find((l) => l.name === prev2.name)!;

    // Calculate translation
    const prevCenterX = (prev1.x + prev2.x) / 2;
    const prevCenterY = (prev1.y + prev2.y) / 2;
    const currCenterX = (curr1.x + curr2.x) / 2;
    const currCenterY = (curr1.y + curr2.y) / 2;

    const translateX = currCenterX - prevCenterX;
    const translateY = currCenterY - prevCenterY;

    // Calculate scale
    const prevDist = Math.sqrt(Math.pow(prev2.x - prev1.x, 2) + Math.pow(prev2.y - prev1.y, 2));
    const currDist = Math.sqrt(Math.pow(curr2.x - curr1.x, 2) + Math.pow(curr2.y - curr1.y, 2));
    const scale = prevDist > 0 ? currDist / prevDist : 1;

    // Calculate rotation
    const prevAngle = Math.atan2(prev2.y - prev1.y, prev2.x - prev1.x);
    const currAngle = Math.atan2(curr2.y - curr1.y, curr2.x - curr1.x);
    const rotation = (currAngle - prevAngle) * (180 / Math.PI);

    return {
      x: translateX,
      y: translateY,
      scale,
      rotation,
    };
  }

  // Use shoulder landmarks if available
  const prevLeft = refLandmarks.find((l) => l.name.includes('left'));
  const prevRight = refLandmarks.find((l) => l.name.includes('right'));

  if (!prevLeft || !prevRight) {
    return { x: 0, y: 0, scale: 1, rotation: 0 };
  }

  const currLeft = currentLandmarks.find((l) => l.name === prevLeft.name)!;
  const currRight = currentLandmarks.find((l) => l.name === prevRight.name)!;

  // Calculate transformations
  const prevCenterX = (prevLeft.x + prevRight.x) / 2;
  const prevCenterY = (prevLeft.y + prevRight.y) / 2;
  const currCenterX = (currLeft.x + currRight.x) / 2;
  const currCenterY = (currLeft.y + currRight.y) / 2;

  const translateX = currCenterX - prevCenterX;
  const translateY = currCenterY - prevCenterY;

  const prevWidth = Math.abs(prevRight.x - prevLeft.x);
  const currWidth = Math.abs(currRight.x - currLeft.x);
  const scale = prevWidth > 0 ? currWidth / prevWidth : 1;

  const prevAngle = Math.atan2(prevRight.y - prevLeft.y, prevRight.x - prevLeft.x);
  const currAngle = Math.atan2(currRight.y - currLeft.y, currRight.x - currLeft.x);
  const rotation = (currAngle - prevAngle) * (180 / Math.PI);

  return {
    x: translateX,
    y: translateY,
    scale,
    rotation,
  };
}

// ============================================
// EXPORT UTILITIES
// ============================================

/**
 * Generate HTML structure for PDF export
 */
export function generateReportHTML(report: ComparisonReport): string {
  const statusBadge = (status: DeviationComparison['improvement']) => {
    const colors = {
      improved: 'background-color: #dcfce7; color: #166534;',
      resolved: 'background-color: #dcfce7; color: #166534;',
      declined: 'background-color: #fee2e2; color: #991b1b;',
      new: 'background-color: #fee2e2; color: #991b1b;',
      stable: 'background-color: #f3f4f6; color: #374151;',
    };
    return `<span style="padding: 2px 8px; border-radius: 4px; font-size: 12px; ${colors[status]}">${getStatusLabel(status)}</span>`;
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${report.title}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1f2937; }
    h1 { color: #053e67; border-bottom: 2px solid #053e67; padding-bottom: 10px; }
    h2 { color: #053e67; margin-top: 30px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .header-info { font-size: 14px; }
    .summary-box { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
    .image-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; text-align: center; }
    .image-box img { max-width: 100%; height: auto; }
    .image-label { font-weight: bold; margin-bottom: 10px; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .recommendations { background: #f0f9ff; padding: 15px; border-radius: 8px; border-left: 4px solid #0284c7; }
    .recommendations ul { margin: 10px 0; padding-left: 20px; }
    .disclaimer { font-size: 12px; color: #6b7280; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .page-break { page-break-before: always; }
    @media print {
      body { padding: 0; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
  <h1>${report.title}</h1>

  <div class="header">
    <div class="header-info">
      <strong>Patient:</strong> ${report.patientInfo.name}<br>
      <strong>MRN:</strong> ${report.patientInfo.mrn}<br>
      ${report.patientInfo.dateOfBirth ? `<strong>DOB:</strong> ${report.patientInfo.dateOfBirth}<br>` : ''}
    </div>
    <div class="header-info">
      <strong>Provider:</strong> ${report.practitionerInfo.name}${report.practitionerInfo.title ? `, ${report.practitionerInfo.title}` : ''}<br>
      <strong>Organization:</strong> ${report.organizationInfo.name}<br>
      <strong>Report Generated:</strong> ${report.generatedAt.toLocaleDateString()}
    </div>
  </div>

  <div class="summary-box">
    <h2 style="margin-top: 0;">Executive Summary</h2>
    <p>${report.executiveSummary.replace(/\n/g, '<br>')}</p>
  </div>

  <h2>Comparison Period</h2>
  <p>
    <strong>Previous Assessment:</strong> ${report.comparisonDates.previous.toLocaleDateString()}<br>
    <strong>Current Assessment:</strong> ${report.comparisonDates.current.toLocaleDateString()}<br>
    <strong>Days Between:</strong> ${report.comparisonDates.daysBetween}
  </p>

  ${report.viewComparisons.map((vc) => `
    <div class="page-break">
      <h2>${vc.viewLabel}</h2>
      <div class="comparison-grid">
        <div class="image-box">
          <div class="image-label">Previous (${report.comparisonDates.previous.toLocaleDateString()})</div>
          ${vc.previousImageUrl ? `<img src="${vc.previousImageUrl}" alt="Previous ${vc.viewLabel}">` : '<p>No image available</p>'}
        </div>
        <div class="image-box">
          <div class="image-label">Current (${report.comparisonDates.current.toLocaleDateString()})</div>
          ${vc.currentImageUrl ? `<img src="${vc.currentImageUrl}" alt="Current ${vc.viewLabel}">` : '<p>No image available</p>'}
        </div>
      </div>

      <h3>Findings</h3>
      <table>
        <tr><th>Finding</th><th>Change</th><th>Status</th></tr>
        ${vc.findings.map((f) => `
          <tr>
            <td>${f.finding}</td>
            <td>${f.change}</td>
            <td>${statusBadge(f.status)}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `).join('')}

  <div class="page-break">
    <h2>Measurement Summary</h2>
    <table>
      <tr>
        <th>Measurement</th>
        <th>Previous</th>
        <th>Current</th>
        <th>Change</th>
        <th>Normal Range</th>
        <th>Status</th>
      </tr>
      ${report.measurementTable.map((m) => `
        <tr>
          <td>${m.measurement}</td>
          <td>${m.previousValue}</td>
          <td>${m.currentValue}</td>
          <td>${m.change}</td>
          <td>${m.normalRange}</td>
          <td>${statusBadge(m.status)}</td>
        </tr>
      `).join('')}
    </table>
  </div>

  <div class="recommendations">
    <h2 style="margin-top: 0;">Recommendations</h2>
    <ul>
      ${report.recommendations.map((r) => `<li>${r}</li>`).join('')}
    </ul>
  </div>

  ${report.treatmentGoals && report.treatmentGoals.length > 0 ? `
    <h2>Treatment Goals Progress</h2>
    <table>
      <tr>
        <th>Goal</th>
        <th>Baseline</th>
        <th>Target</th>
        <th>Current</th>
        <th>Progress</th>
      </tr>
      ${report.treatmentGoals.map((g) => `
        <tr>
          <td>${g.goal}</td>
          <td>${g.baseline}</td>
          <td>${g.target}</td>
          <td>${g.current}</td>
          <td>${g.progress}%</td>
        </tr>
      `).join('')}
    </table>
  ` : ''}

  <div class="disclaimer">
    <strong>Disclaimer:</strong> ${report.disclaimer}
  </div>
</body>
</html>
  `.trim();
}
