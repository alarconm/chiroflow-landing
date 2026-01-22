/**
 * Imaging Reports Library
 * Epic 22 - US-229: Imaging reports
 *
 * Provides structured finding templates, report generation utilities,
 * and workflow management for imaging reports.
 */

import { ImagingReportStatus } from '@prisma/client';

// ============================================
// TYPES
// ============================================

/**
 * Structured finding categories for imaging reports
 */
export type FindingCategory =
  | 'alignment'
  | 'boneStructure'
  | 'discSpace'
  | 'jointSpace'
  | 'softTissue'
  | 'spineCurvature'
  | 'degenerativeChanges'
  | 'fracture'
  | 'subluxation'
  | 'other';

/**
 * Severity levels for findings
 */
export type FindingSeverity = 'normal' | 'mild' | 'moderate' | 'severe';

/**
 * Individual finding in a structured report
 */
export interface StructuredFinding {
  id: string;
  category: FindingCategory;
  location: string; // e.g., "C5-C6", "L4-L5", "Right SI joint"
  description: string;
  severity: FindingSeverity;
  measurementId?: string; // Link to ImagingMeasurement if applicable
  notes?: string;
}

/**
 * Template for common findings
 */
export interface FindingTemplate {
  id: string;
  name: string;
  category: FindingCategory;
  description: string;
  locations: string[]; // Applicable locations
  severityOptions: FindingSeverity[];
  defaultSeverity: FindingSeverity;
}

/**
 * Report section template
 */
export interface ReportSectionTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string; // Guiding question for the section
  required: boolean;
  order: number;
}

/**
 * Complete report template
 */
export interface ReportTemplate {
  id: string;
  name: string;
  modality: 'XRAY' | 'MRI' | 'CT' | 'ULTRASOUND';
  bodyPart: string;
  sections: ReportSectionTemplate[];
  commonFindings: FindingTemplate[];
}

/**
 * Report status transition
 */
export interface ReportStatusTransition {
  from: ImagingReportStatus;
  to: ImagingReportStatus;
  action: string;
  requiresSignature: boolean;
}

/**
 * Report generation context
 */
export interface ReportContext {
  patientName: string;
  patientDOB: string;
  studyDate: string;
  modality: string;
  bodyPart: string;
  indication?: string;
  clinicalHistory?: string;
  priorStudyDate?: string;
  measurements?: Array<{
    type: string;
    value: number;
    unit: string;
    label?: string;
    deviation?: number;
    normalMin?: number;
    normalMax?: number;
  }>;
}

// ============================================
// FINDING CATEGORIES
// ============================================

export const FINDING_CATEGORIES: Record<FindingCategory, { label: string; description: string }> = {
  alignment: {
    label: 'Alignment',
    description: 'Vertebral and spinal alignment findings',
  },
  boneStructure: {
    label: 'Bone Structure',
    description: 'Bone density, morphology, and structural findings',
  },
  discSpace: {
    label: 'Disc Space',
    description: 'Intervertebral disc findings',
  },
  jointSpace: {
    label: 'Joint Space',
    description: 'Facet joint and SI joint findings',
  },
  softTissue: {
    label: 'Soft Tissue',
    description: 'Soft tissue abnormalities',
  },
  spineCurvature: {
    label: 'Spine Curvature',
    description: 'Lordosis, kyphosis, and scoliosis findings',
  },
  degenerativeChanges: {
    label: 'Degenerative Changes',
    description: 'Osteoarthritis and degenerative findings',
  },
  fracture: {
    label: 'Fracture',
    description: 'Fracture and bone injury findings',
  },
  subluxation: {
    label: 'Subluxation',
    description: 'Vertebral subluxation findings',
  },
  other: {
    label: 'Other',
    description: 'Other findings',
  },
};

// ============================================
// SEVERITY DEFINITIONS
// ============================================

export const SEVERITY_DEFINITIONS: Record<FindingSeverity, { label: string; color: string; description: string }> = {
  normal: {
    label: 'Normal',
    color: '#22c55e', // Green
    description: 'Within normal limits',
  },
  mild: {
    label: 'Mild',
    color: '#eab308', // Yellow
    description: 'Slight deviation from normal',
  },
  moderate: {
    label: 'Moderate',
    color: '#f97316', // Orange
    description: 'Significant but manageable finding',
  },
  severe: {
    label: 'Severe',
    color: '#ef4444', // Red
    description: 'Significant finding requiring attention',
  },
};

// ============================================
// STRUCTURED FINDING TEMPLATES
// ============================================

/**
 * Common finding templates for chiropractic imaging
 */
export const FINDING_TEMPLATES: FindingTemplate[] = [
  // Alignment findings
  {
    id: 'loss-of-lordosis',
    name: 'Loss of Lordosis',
    category: 'alignment',
    description: 'Decreased or reversed cervical/lumbar lordotic curve',
    locations: ['Cervical spine', 'Lumbar spine'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },
  {
    id: 'anterolisthesis',
    name: 'Anterolisthesis',
    category: 'alignment',
    description: 'Anterior displacement of vertebra relative to the segment below',
    locations: ['L4', 'L5', 'L3', 'C4', 'C5', 'C6'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },
  {
    id: 'retrolisthesis',
    name: 'Retrolisthesis',
    category: 'alignment',
    description: 'Posterior displacement of vertebra relative to the segment below',
    locations: ['L4', 'L5', 'L3', 'C4', 'C5', 'C6'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },
  {
    id: 'lateral-deviation',
    name: 'Lateral Deviation',
    category: 'alignment',
    description: 'Lateral shift of vertebral body',
    locations: ['Cervical spine', 'Thoracic spine', 'Lumbar spine'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },

  // Spine curvature findings
  {
    id: 'scoliosis',
    name: 'Scoliosis',
    category: 'spineCurvature',
    description: 'Lateral curvature of the spine',
    locations: ['Cervical spine', 'Thoracic spine', 'Lumbar spine', 'Thoracolumbar'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },
  {
    id: 'hyperkyphosis',
    name: 'Hyperkyphosis',
    category: 'spineCurvature',
    description: 'Excessive thoracic kyphosis',
    locations: ['Thoracic spine'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },
  {
    id: 'hyperlordosis',
    name: 'Hyperlordosis',
    category: 'spineCurvature',
    description: 'Excessive lumbar lordosis',
    locations: ['Lumbar spine'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },

  // Disc space findings
  {
    id: 'disc-space-narrowing',
    name: 'Disc Space Narrowing',
    category: 'discSpace',
    description: 'Decreased intervertebral disc height',
    locations: ['C4-C5', 'C5-C6', 'C6-C7', 'L3-L4', 'L4-L5', 'L5-S1'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },
  {
    id: 'vacuum-phenomenon',
    name: 'Vacuum Phenomenon',
    category: 'discSpace',
    description: 'Gas within the disc space indicating disc degeneration',
    locations: ['L3-L4', 'L4-L5', 'L5-S1'],
    severityOptions: ['mild', 'moderate'],
    defaultSeverity: 'mild',
  },

  // Degenerative changes
  {
    id: 'osteophytes',
    name: 'Osteophytes',
    category: 'degenerativeChanges',
    description: 'Bone spurs at vertebral margins',
    locations: ['Cervical spine', 'Thoracic spine', 'Lumbar spine'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },
  {
    id: 'facet-arthrosis',
    name: 'Facet Arthrosis',
    category: 'degenerativeChanges',
    description: 'Degenerative changes of the facet joints',
    locations: ['C4-C5', 'C5-C6', 'C6-C7', 'L3-L4', 'L4-L5', 'L5-S1'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },
  {
    id: 'endplate-sclerosis',
    name: 'Endplate Sclerosis',
    category: 'degenerativeChanges',
    description: 'Increased bone density at vertebral endplates',
    locations: ['Cervical spine', 'Lumbar spine'],
    severityOptions: ['mild', 'moderate'],
    defaultSeverity: 'mild',
  },
  {
    id: 'uncovertebral-arthrosis',
    name: 'Uncovertebral Arthrosis',
    category: 'degenerativeChanges',
    description: 'Degenerative changes of the uncovertebral joints',
    locations: ['C4-C5', 'C5-C6', 'C6-C7'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },

  // Bone structure findings
  {
    id: 'osteopenia',
    name: 'Osteopenia',
    category: 'boneStructure',
    description: 'Decreased bone density',
    locations: ['Spine', 'Hip', 'Generalized'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },
  {
    id: 'compression-fracture',
    name: 'Compression Fracture',
    category: 'fracture',
    description: 'Vertebral body compression',
    locations: ['T11', 'T12', 'L1', 'L2', 'L3'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'moderate',
  },

  // Subluxation findings
  {
    id: 'rotational-malposition',
    name: 'Rotational Malposition',
    category: 'subluxation',
    description: 'Rotation of vertebral body',
    locations: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'L4', 'L5'],
    severityOptions: ['mild', 'moderate'],
    defaultSeverity: 'mild',
  },
  {
    id: 'flexion-malposition',
    name: 'Flexion Malposition',
    category: 'subluxation',
    description: 'Flexion fixation of vertebral segment',
    locations: ['Cervical spine', 'Lumbar spine'],
    severityOptions: ['mild', 'moderate'],
    defaultSeverity: 'mild',
  },
  {
    id: 'extension-malposition',
    name: 'Extension Malposition',
    category: 'subluxation',
    description: 'Extension fixation of vertebral segment',
    locations: ['Cervical spine', 'Lumbar spine'],
    severityOptions: ['mild', 'moderate'],
    defaultSeverity: 'mild',
  },

  // Joint findings
  {
    id: 'si-joint-dysfunction',
    name: 'SI Joint Dysfunction',
    category: 'jointSpace',
    description: 'Sacroiliac joint abnormality',
    locations: ['Right SI joint', 'Left SI joint', 'Bilateral SI joints'],
    severityOptions: ['mild', 'moderate', 'severe'],
    defaultSeverity: 'mild',
  },
];

// ============================================
// REPORT SECTION TEMPLATES
// ============================================

/**
 * Standard sections for imaging reports
 */
export const REPORT_SECTIONS: ReportSectionTemplate[] = [
  {
    id: 'clinical-history',
    name: 'Clinical History',
    description: 'Patient history and reason for examination',
    prompt: 'Summarize the relevant clinical history and indication for this imaging study.',
    required: false,
    order: 1,
  },
  {
    id: 'technique',
    name: 'Technique',
    description: 'Imaging technique and views obtained',
    prompt: 'Describe the imaging technique, views obtained, and any limitations.',
    required: false,
    order: 2,
  },
  {
    id: 'comparison',
    name: 'Comparison',
    description: 'Comparison with prior studies',
    prompt: 'List any prior studies available for comparison and significant interval changes.',
    required: false,
    order: 3,
  },
  {
    id: 'findings',
    name: 'Findings',
    description: 'Detailed radiographic findings',
    prompt: 'Document all significant radiographic findings systematically.',
    required: true,
    order: 4,
  },
  {
    id: 'measurements',
    name: 'Measurements',
    description: 'Quantitative measurements and angles',
    prompt: 'List all measurements performed with normal reference ranges.',
    required: false,
    order: 5,
  },
  {
    id: 'impression',
    name: 'Impression',
    description: 'Summary diagnosis and conclusions',
    prompt: 'Provide a concise summary of the most significant findings and diagnoses.',
    required: true,
    order: 6,
  },
  {
    id: 'recommendations',
    name: 'Recommendations',
    description: 'Clinical recommendations based on findings',
    prompt: 'List any recommendations for further imaging, treatment, or follow-up.',
    required: false,
    order: 7,
  },
];

// ============================================
// REPORT TEMPLATES BY BODY PART
// ============================================

/**
 * Pre-built report templates for common chiropractic imaging studies
 */
export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'cervical-xray',
    name: 'Cervical Spine X-Ray',
    modality: 'XRAY',
    bodyPart: 'Cervical Spine',
    sections: REPORT_SECTIONS,
    commonFindings: FINDING_TEMPLATES.filter((f) =>
      f.locations.some((l) => l.toLowerCase().includes('cervical') || l.startsWith('C'))
    ),
  },
  {
    id: 'lumbar-xray',
    name: 'Lumbar Spine X-Ray',
    modality: 'XRAY',
    bodyPart: 'Lumbar Spine',
    sections: REPORT_SECTIONS,
    commonFindings: FINDING_TEMPLATES.filter((f) =>
      f.locations.some(
        (l) => l.toLowerCase().includes('lumbar') || l.startsWith('L') || l.toLowerCase().includes('si joint')
      )
    ),
  },
  {
    id: 'thoracic-xray',
    name: 'Thoracic Spine X-Ray',
    modality: 'XRAY',
    bodyPart: 'Thoracic Spine',
    sections: REPORT_SECTIONS,
    commonFindings: FINDING_TEMPLATES.filter((f) =>
      f.locations.some((l) => l.toLowerCase().includes('thoracic') || l.startsWith('T'))
    ),
  },
  {
    id: 'full-spine-xray',
    name: 'Full Spine X-Ray',
    modality: 'XRAY',
    bodyPart: 'Full Spine',
    sections: REPORT_SECTIONS,
    commonFindings: FINDING_TEMPLATES,
  },
  {
    id: 'pelvis-xray',
    name: 'Pelvis X-Ray',
    modality: 'XRAY',
    bodyPart: 'Pelvis',
    sections: REPORT_SECTIONS,
    commonFindings: FINDING_TEMPLATES.filter((f) =>
      f.locations.some((l) => l.toLowerCase().includes('si joint') || l.toLowerCase().includes('hip'))
    ),
  },
];

// ============================================
// STATUS WORKFLOW
// ============================================

/**
 * Valid status transitions for imaging reports
 */
export const STATUS_TRANSITIONS: ReportStatusTransition[] = [
  {
    from: 'DRAFT',
    to: 'PENDING_REVIEW',
    action: 'Submit for Review',
    requiresSignature: false,
  },
  {
    from: 'PENDING_REVIEW',
    to: 'DRAFT',
    action: 'Return to Draft',
    requiresSignature: false,
  },
  {
    from: 'PENDING_REVIEW',
    to: 'FINAL',
    action: 'Sign and Finalize',
    requiresSignature: true,
  },
  {
    from: 'FINAL',
    to: 'AMENDED',
    action: 'Amend Report',
    requiresSignature: true,
  },
  {
    from: 'FINAL',
    to: 'ADDENDUM',
    action: 'Add Addendum',
    requiresSignature: true,
  },
  {
    from: 'AMENDED',
    to: 'FINAL',
    action: 'Finalize Amendment',
    requiresSignature: true,
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get valid status transitions for a given status
 */
export function getValidTransitions(currentStatus: ImagingReportStatus): ReportStatusTransition[] {
  return STATUS_TRANSITIONS.filter((t) => t.from === currentStatus);
}

/**
 * Check if a status transition is valid
 */
export function isValidTransition(from: ImagingReportStatus, to: ImagingReportStatus): boolean {
  return STATUS_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/**
 * Get template for a body part and modality
 */
export function getReportTemplate(bodyPart: string, modality: string): ReportTemplate | null {
  // Try exact match first
  let template = REPORT_TEMPLATES.find(
    (t) => t.bodyPart.toLowerCase() === bodyPart.toLowerCase() && t.modality === modality
  );

  // Fall back to partial match
  if (!template) {
    template = REPORT_TEMPLATES.find(
      (t) => bodyPart.toLowerCase().includes(t.bodyPart.toLowerCase()) && t.modality === modality
    );
  }

  // Fall back to full spine if no match
  if (!template && modality === 'XRAY') {
    template = REPORT_TEMPLATES.find((t) => t.id === 'full-spine-xray');
  }

  return template || null;
}

/**
 * Get finding templates for a category
 */
export function getFindingsByCategory(category: FindingCategory): FindingTemplate[] {
  return FINDING_TEMPLATES.filter((f) => f.category === category);
}

/**
 * Get finding templates for a location
 */
export function getFindingsByLocation(location: string): FindingTemplate[] {
  return FINDING_TEMPLATES.filter((f) =>
    f.locations.some((l) => l.toLowerCase().includes(location.toLowerCase()) || location.toLowerCase().includes(l.toLowerCase()))
  );
}

/**
 * Generate unique ID for a structured finding
 */
export function generateFindingId(): string {
  return `finding-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Create a structured finding from a template
 */
export function createFindingFromTemplate(
  template: FindingTemplate,
  location: string,
  severity?: FindingSeverity,
  notes?: string,
  measurementId?: string
): StructuredFinding {
  return {
    id: generateFindingId(),
    category: template.category,
    location,
    description: template.description,
    severity: severity || template.defaultSeverity,
    measurementId,
    notes,
  };
}

/**
 * Format measurements for report
 */
export function formatMeasurementsForReport(
  measurements: Array<{
    type: string;
    value: number;
    unit: string;
    label?: string;
    deviation?: number | null;
    normalMin?: number | null;
    normalMax?: number | null;
  }>
): string {
  if (measurements.length === 0) {
    return 'No measurements recorded.';
  }

  const lines = measurements.map((m) => {
    let line = `${m.label || m.type}: ${m.value.toFixed(1)}${m.unit}`;

    if (m.normalMin !== null && m.normalMax !== null && m.normalMin !== undefined && m.normalMax !== undefined) {
      line += ` (Normal: ${m.normalMin}-${m.normalMax}${m.unit})`;
    }

    if (m.deviation !== null && m.deviation !== undefined && m.deviation !== 0) {
      const direction = m.deviation > 0 ? 'above' : 'below';
      line += ` - ${Math.abs(m.deviation).toFixed(1)}${m.unit} ${direction} normal`;
    }

    return line;
  });

  return lines.join('\n');
}

/**
 * Format structured findings for report
 */
export function formatFindingsForReport(findings: StructuredFinding[]): string {
  if (findings.length === 0) {
    return 'No significant findings.';
  }

  // Group by category
  const byCategory = findings.reduce(
    (acc, f) => {
      if (!acc[f.category]) {
        acc[f.category] = [];
      }
      acc[f.category].push(f);
      return acc;
    },
    {} as Record<FindingCategory, StructuredFinding[]>
  );

  const lines: string[] = [];

  for (const [category, categoryFindings] of Object.entries(byCategory)) {
    const categoryInfo = FINDING_CATEGORIES[category as FindingCategory];
    lines.push(`**${categoryInfo.label}:**`);

    for (const finding of categoryFindings) {
      const severityInfo = SEVERITY_DEFINITIONS[finding.severity];
      let line = `- ${finding.location}: ${finding.description}`;

      if (finding.severity !== 'normal') {
        line += ` (${severityInfo.label})`;
      }

      if (finding.notes) {
        line += ` - ${finding.notes}`;
      }

      lines.push(line);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate impression from findings
 */
export function generateImpression(findings: StructuredFinding[]): string {
  if (findings.length === 0) {
    return 'No significant radiographic abnormality.';
  }

  // Sort by severity (severe first)
  const sortedFindings = [...findings].sort((a, b) => {
    const severityOrder: FindingSeverity[] = ['severe', 'moderate', 'mild', 'normal'];
    return severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
  });

  // Filter to significant findings (non-normal)
  const significantFindings = sortedFindings.filter((f) => f.severity !== 'normal');

  if (significantFindings.length === 0) {
    return 'No significant radiographic abnormality.';
  }

  const impressionLines: string[] = [];

  // Group similar findings
  const uniqueDescriptions = new Set<string>();
  for (const finding of significantFindings) {
    const key = `${finding.description}-${finding.severity}`;
    if (!uniqueDescriptions.has(key)) {
      uniqueDescriptions.add(key);

      // Find all locations for this finding
      const locations = significantFindings
        .filter((f) => f.description === finding.description && f.severity === finding.severity)
        .map((f) => f.location);

      const locationText = locations.length > 1 ? locations.join(', ') : locations[0];
      const severityText = finding.severity !== 'mild' ? ` (${SEVERITY_DEFINITIONS[finding.severity].label.toLowerCase()})` : '';

      impressionLines.push(`${impressionLines.length + 1}. ${finding.description} at ${locationText}${severityText}`);
    }
  }

  return impressionLines.join('\n');
}

/**
 * Generate default recommendations based on findings
 */
export function generateRecommendations(findings: StructuredFinding[]): string[] {
  const recommendations: string[] = [];

  // Check for severe findings
  const severeFindings = findings.filter((f) => f.severity === 'severe');
  if (severeFindings.length > 0) {
    recommendations.push('Clinical correlation recommended for severe findings.');
  }

  // Check for fractures
  const fractures = findings.filter((f) => f.category === 'fracture');
  if (fractures.length > 0) {
    recommendations.push('Consider CT or MRI for further evaluation of suspected fracture.');
  }

  // Check for scoliosis
  const scoliosis = findings.filter((f) => f.description.toLowerCase().includes('scoliosis'));
  if (scoliosis.length > 0) {
    recommendations.push('Standing full spine radiographs recommended for Cobb angle measurement.');
  }

  // Check for progressive degenerative changes
  const degenerative = findings.filter((f) => f.category === 'degenerativeChanges' && f.severity !== 'normal');
  if (degenerative.length >= 3) {
    recommendations.push('Consider MRI if symptoms persist despite conservative treatment.');
  }

  return recommendations;
}

/**
 * Validate report before status transition
 */
export function validateReportForTransition(
  report: {
    findings: string | null;
    impression: string | null;
    signatureData: string | null;
    status: ImagingReportStatus;
  },
  targetStatus: ImagingReportStatus
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if transition is valid
  if (!isValidTransition(report.status, targetStatus)) {
    errors.push(`Cannot transition from ${report.status} to ${targetStatus}`);
    return { valid: false, errors };
  }

  // Get transition details
  const transition = STATUS_TRANSITIONS.find((t) => t.from === report.status && t.to === targetStatus);

  if (!transition) {
    errors.push('Invalid transition');
    return { valid: false, errors };
  }

  // Check required fields for final status
  if (targetStatus === 'FINAL' || targetStatus === 'AMENDED') {
    if (!report.findings || report.findings.trim().length === 0) {
      errors.push('Findings are required for final report');
    }

    if (!report.impression || report.impression.trim().length === 0) {
      errors.push('Impression is required for final report');
    }

    if (transition.requiresSignature && !report.signatureData) {
      errors.push('Electronic signature is required');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Export types and constants
export type {
  FindingCategory as ImagingFindingCategory,
  FindingSeverity as ImagingFindingSeverity,
  StructuredFinding as ImagingStructuredFinding,
  FindingTemplate as ImagingFindingTemplate,
  ReportTemplate as ImagingReportTemplate,
  ReportContext as ImagingReportContext,
};
