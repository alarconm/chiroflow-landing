/**
 * AI Imaging Analysis Library
 * Epic 22: Imaging & X-Ray Integration (US-230)
 *
 * AI-assisted analysis of spinal X-rays including:
 * - Auto-detection of vertebral levels
 * - Suggested Cobb angle measurements
 * - Identification of potential abnormalities
 * - Degenerative change detection
 * - Preliminary findings generation
 * - Confidence scores for AI findings
 */

import type { ImagingMeasurementType } from '@prisma/client';

// ============================================
// TYPES
// ============================================

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type VertebralLevel =
  | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7'
  | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9' | 'T10' | 'T11' | 'T12'
  | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
  | 'S1' | 'S2' | 'S3' | 'S4' | 'S5'
  | 'Coccyx';

export type SpinalRegion = 'cervical' | 'thoracic' | 'lumbar' | 'sacral' | 'coccygeal';

export type AbnormalityType =
  | 'degenerative_disc_disease'
  | 'disc_herniation'
  | 'osteophyte'
  | 'facet_arthrosis'
  | 'spondylolisthesis'
  | 'spondylolysis'
  | 'compression_fracture'
  | 'vertebral_wedging'
  | 'endplate_sclerosis'
  | 'vacuum_phenomenon'
  | 'ossification'
  | 'stenosis'
  | 'scoliosis'
  | 'kyphosis'
  | 'lordosis_abnormality'
  | 'subluxation'
  | 'joint_space_narrowing'
  | 'bone_density_change'
  | 'alignment_abnormality'
  | 'soft_tissue_abnormality';

export type AbnormalitySeverity = 'mild' | 'moderate' | 'severe';

export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very_high';

export interface DetectedVertebra {
  level: VertebralLevel;
  region: SpinalRegion;
  boundingBox: BoundingBox;
  centerPoint: Point;
  superiorEndplate: {
    left: Point;
    right: Point;
  };
  inferiorEndplate: {
    left: Point;
    right: Point;
  };
  anteriorMargin: Point;
  posteriorMargin: Point;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
}

export interface DetectedAbnormality {
  id: string;
  type: AbnormalityType;
  location: VertebralLevel | string;
  region: SpinalRegion;
  severity: AbnormalitySeverity;
  description: string;
  boundingBox?: BoundingBox;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  suggestedActions: string[];
  clinicalCorrelation: string;
}

export interface SuggestedMeasurement {
  id: string;
  type: ImagingMeasurementType | string;
  label: string;
  description: string;
  suggestedPoints: {
    name: string;
    point: Point;
    confidence: number;
  }[];
  estimatedValue?: number;
  unit?: string;
  normalRange?: {
    min: number;
    max: number;
  };
  priority: 'recommended' | 'optional' | 'critical';
  rationale: string;
}

export interface AIFinding {
  id: string;
  category: 'anatomy' | 'alignment' | 'degeneration' | 'abnormality' | 'measurement';
  summary: string;
  details: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  severity?: AbnormalitySeverity;
  relatedAbnormalities?: string[];
  relatedMeasurements?: string[];
  clinicalSignificance: 'normal' | 'variant' | 'mild' | 'moderate' | 'significant';
}

export interface AIAnalysisResult {
  imageId: string;
  analysisId: string;
  timestamp: Date;
  modelVersion: string;
  processingTimeMs: number;

  // Detected vertebrae
  detectedVertebrae: DetectedVertebra[];
  vertebraeDetectionConfidence: number;
  spinalRegionsIdentified: SpinalRegion[];

  // Suggested measurements
  suggestedMeasurements: SuggestedMeasurement[];
  cobbAngleSuggestions: SuggestedMeasurement[];
  lordosisSuggestions: SuggestedMeasurement[];

  // Detected abnormalities
  detectedAbnormalities: DetectedAbnormality[];
  degenerativeChanges: DetectedAbnormality[];

  // Preliminary findings
  preliminaryFindings: AIFinding[];
  overallAssessment: string;

  // Metadata
  imageQualityScore: number;
  imageQualityIssues: string[];
  requiresProviderReview: boolean;
  reviewPriority: 'routine' | 'expedited' | 'urgent';

  // Disclaimers
  disclaimers: string[];
}

export interface AIAnalysisInput {
  imageId: string;
  imageUrl: string;
  imageBase64?: string;
  bodyPart: string;
  viewPosition?: string;
  modality: string;
  patientAge?: number;
  patientSex?: 'M' | 'F';
  clinicalHistory?: string;
  indication?: string;
  priorStudyFindings?: string[];
}

export interface AIAnalysisOptions {
  detectVertebrae?: boolean;
  suggestMeasurements?: boolean;
  detectAbnormalities?: boolean;
  detectDegenerativeChanges?: boolean;
  generateFindings?: boolean;
  confidenceThreshold?: number;
  includeDisclaimer?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

export const VERTEBRAL_LEVELS: Record<SpinalRegion, VertebralLevel[]> = {
  cervical: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
  thoracic: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'],
  lumbar: ['L1', 'L2', 'L3', 'L4', 'L5'],
  sacral: ['S1', 'S2', 'S3', 'S4', 'S5'],
  coccygeal: ['Coccyx'],
};

export const ABNORMALITY_DESCRIPTIONS: Record<AbnormalityType, string> = {
  degenerative_disc_disease: 'Degenerative disc disease characterized by disc space narrowing and signal changes',
  disc_herniation: 'Disc material extending beyond normal confines of the disc space',
  osteophyte: 'Bony outgrowth (bone spur) at vertebral body margins',
  facet_arthrosis: 'Degenerative changes of the facet joints',
  spondylolisthesis: 'Forward displacement of one vertebra over another',
  spondylolysis: 'Defect in the pars interarticularis',
  compression_fracture: 'Loss of vertebral body height due to compression',
  vertebral_wedging: 'Asymmetric loss of vertebral body height',
  endplate_sclerosis: 'Increased density of vertebral endplates',
  vacuum_phenomenon: 'Gas within a degenerated disc space',
  ossification: 'Abnormal bone formation in ligaments or soft tissues',
  stenosis: 'Narrowing of the spinal canal or neural foramina',
  scoliosis: 'Lateral curvature of the spine',
  kyphosis: 'Excessive posterior convexity of the spine',
  lordosis_abnormality: 'Abnormal anterior convexity (hyper or hypo lordosis)',
  subluxation: 'Partial dislocation or misalignment of vertebrae',
  joint_space_narrowing: 'Reduced space between articulating surfaces',
  bone_density_change: 'Abnormal bone density (osteopenia/osteoporosis)',
  alignment_abnormality: 'Deviation from normal spinal alignment',
  soft_tissue_abnormality: 'Abnormality in paraspinal soft tissues',
};

export const SEVERITY_THRESHOLDS = {
  cobb_angle: {
    mild: 10,
    moderate: 25,
    severe: 40,
  },
  disc_height_loss: {
    mild: 25,
    moderate: 50,
    severe: 75,
  },
  vertebral_height_loss: {
    mild: 20,
    moderate: 40,
    severe: 60,
  },
  lordosis_deviation: {
    mild: 10,
    moderate: 20,
    severe: 30,
  },
};

export const CONFIDENCE_THRESHOLDS = {
  very_high: 0.9,
  high: 0.75,
  medium: 0.5,
  low: 0,
};

export const AI_MODEL_VERSION = 'chiroflow-ai-imaging-v1.0.0';

export const AI_DISCLAIMERS = [
  'AI-generated findings require provider review and approval before clinical use.',
  'This analysis is intended to assist, not replace, clinical judgment.',
  'Confidence scores indicate algorithm certainty, not clinical significance.',
  'Always correlate findings with clinical presentation and patient history.',
  'Some abnormalities may not be detected by the AI system.',
  'Final interpretation and diagnosis must be made by a qualified healthcare provider.',
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get confidence level from numeric confidence score
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= CONFIDENCE_THRESHOLDS.very_high) return 'very_high';
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Generate unique ID for AI findings
 */
export function generateAIFindingId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Determine spinal region from vertebral level
 */
export function getSpinalRegion(level: VertebralLevel): SpinalRegion {
  if (level.startsWith('C')) return 'cervical';
  if (level.startsWith('T')) return 'thoracic';
  if (level.startsWith('L')) return 'lumbar';
  if (level.startsWith('S')) return 'sacral';
  return 'coccygeal';
}

/**
 * Calculate distance between two points
 */
export function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Calculate angle between two lines (in degrees)
 */
export function calculateAngle(
  line1Start: Point,
  line1End: Point,
  line2Start: Point,
  line2End: Point
): number {
  const angle1 = Math.atan2(line1End.y - line1Start.y, line1End.x - line1Start.x);
  const angle2 = Math.atan2(line2End.y - line2Start.y, line2End.x - line2Start.x);
  let angle = Math.abs((angle1 - angle2) * (180 / Math.PI));
  if (angle > 90) angle = 180 - angle;
  return angle;
}

/**
 * Classify scoliosis severity based on Cobb angle
 */
export function classifyScoliosisSeverity(cobbAngle: number): AbnormalitySeverity | null {
  if (cobbAngle < SEVERITY_THRESHOLDS.cobb_angle.mild) return null;
  if (cobbAngle < SEVERITY_THRESHOLDS.cobb_angle.moderate) return 'mild';
  if (cobbAngle < SEVERITY_THRESHOLDS.cobb_angle.severe) return 'moderate';
  return 'severe';
}

// ============================================
// AI ANALYSIS FUNCTIONS
// ============================================

/**
 * Simulate vertebral level detection
 * In production, this would call a trained ML model
 */
export function detectVertebralLevels(
  input: AIAnalysisInput,
  imageWidth: number,
  imageHeight: number
): DetectedVertebra[] {
  const detectedVertebrae: DetectedVertebra[] = [];
  const bodyPart = input.bodyPart.toLowerCase();

  let levelsToDetect: VertebralLevel[] = [];

  if (bodyPart.includes('cervical') || bodyPart.includes('neck')) {
    levelsToDetect = VERTEBRAL_LEVELS.cervical;
  } else if (bodyPart.includes('thoracic') || bodyPart.includes('chest')) {
    levelsToDetect = VERTEBRAL_LEVELS.thoracic;
  } else if (bodyPart.includes('lumbar') || bodyPart.includes('lower back')) {
    levelsToDetect = VERTEBRAL_LEVELS.lumbar;
  } else if (bodyPart.includes('full spine') || bodyPart.includes('whole spine')) {
    levelsToDetect = [
      ...VERTEBRAL_LEVELS.cervical,
      ...VERTEBRAL_LEVELS.thoracic,
      ...VERTEBRAL_LEVELS.lumbar,
    ];
  } else if (bodyPart.includes('pelvis') || bodyPart.includes('sacrum')) {
    levelsToDetect = ['L4', 'L5', ...VERTEBRAL_LEVELS.sacral] as VertebralLevel[];
  } else {
    // Default to lumbar for general spine
    levelsToDetect = VERTEBRAL_LEVELS.lumbar;
  }

  // Simulate detection with realistic positioning
  const verticalSpacing = imageHeight / (levelsToDetect.length + 2);
  const centerX = imageWidth / 2;
  const vertebraWidth = imageWidth * 0.2;
  const vertebraHeight = verticalSpacing * 0.7;

  levelsToDetect.forEach((level, index) => {
    const centerY = verticalSpacing * (index + 1);
    const confidence = 0.75 + Math.random() * 0.2; // 0.75-0.95

    const vertebra: DetectedVertebra = {
      level,
      region: getSpinalRegion(level),
      boundingBox: {
        x: centerX - vertebraWidth / 2,
        y: centerY - vertebraHeight / 2,
        width: vertebraWidth,
        height: vertebraHeight,
      },
      centerPoint: { x: centerX, y: centerY },
      superiorEndplate: {
        left: { x: centerX - vertebraWidth / 3, y: centerY - vertebraHeight / 2 },
        right: { x: centerX + vertebraWidth / 3, y: centerY - vertebraHeight / 2 },
      },
      inferiorEndplate: {
        left: { x: centerX - vertebraWidth / 3, y: centerY + vertebraHeight / 2 },
        right: { x: centerX + vertebraWidth / 3, y: centerY + vertebraHeight / 2 },
      },
      anteriorMargin: { x: centerX - vertebraWidth / 2, y: centerY },
      posteriorMargin: { x: centerX + vertebraWidth / 2, y: centerY },
      confidence,
      confidenceLevel: getConfidenceLevel(confidence),
    };

    detectedVertebrae.push(vertebra);
  });

  return detectedVertebrae;
}

/**
 * Suggest measurements based on detected vertebrae
 */
export function suggestMeasurements(
  detectedVertebrae: DetectedVertebra[],
  bodyPart: string
): SuggestedMeasurement[] {
  const suggestions: SuggestedMeasurement[] = [];
  const bodyPartLower = bodyPart.toLowerCase();

  if (detectedVertebrae.length < 2) {
    return suggestions;
  }

  // Suggest Cobb angle measurements if scoliosis is suspected
  if (detectedVertebrae.length >= 4) {
    const firstVert = detectedVertebrae[0];
    const lastVert = detectedVertebrae[detectedVertebrae.length - 1];

    suggestions.push({
      id: generateAIFindingId('cobb'),
      type: 'COBB_ANGLE',
      label: `Cobb Angle (${firstVert.level}-${lastVert.level})`,
      description: 'Measure curvature between superior and inferior endplates',
      suggestedPoints: [
        { name: 'Superior endplate left', point: firstVert.superiorEndplate.left, confidence: firstVert.confidence },
        { name: 'Superior endplate right', point: firstVert.superiorEndplate.right, confidence: firstVert.confidence },
        { name: 'Inferior endplate left', point: lastVert.inferiorEndplate.left, confidence: lastVert.confidence },
        { name: 'Inferior endplate right', point: lastVert.inferiorEndplate.right, confidence: lastVert.confidence },
      ],
      normalRange: { min: 0, max: 10 },
      unit: 'degrees',
      priority: 'recommended',
      rationale: 'Standard measurement for spinal curvature assessment',
    });
  }

  // Suggest lordosis measurements
  if (bodyPartLower.includes('cervical') || bodyPartLower.includes('neck')) {
    const c2 = detectedVertebrae.find(v => v.level === 'C2');
    const c7 = detectedVertebrae.find(v => v.level === 'C7');

    if (c2 && c7) {
      suggestions.push({
        id: generateAIFindingId('cerv-lord'),
        type: 'CERVICAL_LORDOSIS',
        label: 'Cervical Lordosis (C2-C7)',
        description: 'Measure cervical spine curvature angle',
        suggestedPoints: [
          { name: 'C2 inferior endplate anterior', point: c2.inferiorEndplate.left, confidence: c2.confidence },
          { name: 'C2 inferior endplate posterior', point: c2.inferiorEndplate.right, confidence: c2.confidence },
          { name: 'C7 inferior endplate anterior', point: c7.inferiorEndplate.left, confidence: c7.confidence },
          { name: 'C7 inferior endplate posterior', point: c7.inferiorEndplate.right, confidence: c7.confidence },
        ],
        normalRange: { min: 31, max: 40 },
        unit: 'degrees',
        priority: 'recommended',
        rationale: 'Essential for cervical spine alignment assessment',
      });
    }
  }

  if (bodyPartLower.includes('lumbar') || bodyPartLower.includes('lower')) {
    const l1 = detectedVertebrae.find(v => v.level === 'L1');
    const l5 = detectedVertebrae.find(v => v.level === 'L5');

    if (l1 && l5) {
      suggestions.push({
        id: generateAIFindingId('lumb-lord'),
        type: 'LUMBAR_LORDOSIS',
        label: 'Lumbar Lordosis (L1-L5)',
        description: 'Measure lumbar spine curvature angle',
        suggestedPoints: [
          { name: 'L1 superior endplate anterior', point: l1.superiorEndplate.left, confidence: l1.confidence },
          { name: 'L1 superior endplate posterior', point: l1.superiorEndplate.right, confidence: l1.confidence },
          { name: 'L5 inferior endplate anterior', point: l5.inferiorEndplate.left, confidence: l5.confidence },
          { name: 'L5 inferior endplate posterior', point: l5.inferiorEndplate.right, confidence: l5.confidence },
        ],
        normalRange: { min: 40, max: 60 },
        unit: 'degrees',
        priority: 'recommended',
        rationale: 'Essential for lumbar spine alignment assessment',
      });
    }
  }

  // Suggest disc height measurements between adjacent vertebrae
  for (let i = 0; i < detectedVertebrae.length - 1; i++) {
    const superior = detectedVertebrae[i];
    const inferior = detectedVertebrae[i + 1];

    suggestions.push({
      id: generateAIFindingId('disc'),
      type: 'DISC_HEIGHT',
      label: `Disc Height (${superior.level}-${inferior.level})`,
      description: `Measure disc space between ${superior.level} and ${inferior.level}`,
      suggestedPoints: [
        { name: `${superior.level} inferior anterior`, point: superior.inferiorEndplate.left, confidence: superior.confidence },
        { name: `${inferior.level} superior anterior`, point: inferior.superiorEndplate.left, confidence: inferior.confidence },
        { name: `${superior.level} inferior posterior`, point: superior.inferiorEndplate.right, confidence: superior.confidence },
        { name: `${inferior.level} superior posterior`, point: inferior.superiorEndplate.right, confidence: inferior.confidence },
      ],
      normalRange: bodyPartLower.includes('cervical') ? { min: 3, max: 7 } : { min: 8, max: 14 },
      unit: 'mm',
      priority: 'optional',
      rationale: 'Assess disc health and degeneration',
    });
  }

  return suggestions;
}

/**
 * Detect potential abnormalities in the image
 * In production, this would use a trained classification model
 */
export function detectAbnormalities(
  detectedVertebrae: DetectedVertebra[],
  input: AIAnalysisInput
): DetectedAbnormality[] {
  const abnormalities: DetectedAbnormality[] = [];

  // Simulate abnormality detection based on vertebrae positioning
  // In production, this would analyze image features directly

  // Check for alignment abnormalities (scoliosis)
  if (detectedVertebrae.length >= 4) {
    const centerPoints = detectedVertebrae.map(v => v.centerPoint);
    const avgX = centerPoints.reduce((sum, p) => sum + p.x, 0) / centerPoints.length;

    let maxDeviation = 0;
    let deviatingLevel: VertebralLevel | null = null;

    centerPoints.forEach((point, index) => {
      const deviation = Math.abs(point.x - avgX);
      if (deviation > maxDeviation) {
        maxDeviation = deviation;
        deviatingLevel = detectedVertebrae[index].level;
      }
    });

    // If significant lateral deviation detected
    if (maxDeviation > 20 && deviatingLevel) {
      const severity = maxDeviation > 50 ? 'severe' : maxDeviation > 35 ? 'moderate' : 'mild';
      const confidence = 0.7 + Math.random() * 0.2;

      abnormalities.push({
        id: generateAIFindingId('abn'),
        type: 'scoliosis',
        location: deviatingLevel,
        region: getSpinalRegion(deviatingLevel),
        severity,
        description: `Lateral spinal curvature detected with apex at ${deviatingLevel}`,
        confidence,
        confidenceLevel: getConfidenceLevel(confidence),
        suggestedActions: [
          'Measure Cobb angle for quantification',
          'Compare with prior studies if available',
          'Consider standing full-spine radiographs',
        ],
        clinicalCorrelation: 'Correlate with clinical examination for postural asymmetry',
      });
    }
  }

  // Simulate degenerative change detection at random levels
  const degenerativeLevels = detectedVertebrae
    .slice(Math.floor(detectedVertebrae.length / 2))
    .slice(0, 2);

  degenerativeLevels.forEach((vertebra, index) => {
    if (index > 0 && Math.random() > 0.5) {
      const confidence = 0.65 + Math.random() * 0.25;
      const severity: AbnormalitySeverity = Math.random() > 0.7 ? 'moderate' : 'mild';

      abnormalities.push({
        id: generateAIFindingId('deg'),
        type: 'degenerative_disc_disease',
        location: `${degenerativeLevels[index - 1].level}-${vertebra.level}`,
        region: vertebra.region,
        severity,
        description: `Degenerative disc changes at ${degenerativeLevels[index - 1].level}-${vertebra.level} level`,
        boundingBox: {
          x: vertebra.boundingBox.x,
          y: vertebra.boundingBox.y - vertebra.boundingBox.height * 0.3,
          width: vertebra.boundingBox.width,
          height: vertebra.boundingBox.height * 0.3,
        },
        confidence,
        confidenceLevel: getConfidenceLevel(confidence),
        suggestedActions: [
          'Measure disc height',
          'Evaluate for osteophytes',
          'Compare with prior studies',
        ],
        clinicalCorrelation: 'Correlate with patient symptoms and range of motion',
      });

      // Add osteophyte detection
      if (Math.random() > 0.6) {
        const osteophyteConfidence = 0.6 + Math.random() * 0.25;
        abnormalities.push({
          id: generateAIFindingId('ost'),
          type: 'osteophyte',
          location: vertebra.level,
          region: vertebra.region,
          severity: 'mild',
          description: `Marginal osteophyte formation at ${vertebra.level}`,
          confidence: osteophyteConfidence,
          confidenceLevel: getConfidenceLevel(osteophyteConfidence),
          suggestedActions: [
            'Note size and location',
            'Evaluate for neural impingement',
          ],
          clinicalCorrelation: 'May contribute to reduced range of motion',
        });
      }
    }
  });

  return abnormalities;
}

/**
 * Generate preliminary findings from analysis
 */
export function generatePreliminaryFindings(
  detectedVertebrae: DetectedVertebra[],
  suggestedMeasurements: SuggestedMeasurement[],
  detectedAbnormalities: DetectedAbnormality[]
): AIFinding[] {
  const findings: AIFinding[] = [];

  // Anatomy finding
  if (detectedVertebrae.length > 0) {
    const regions = [...new Set(detectedVertebrae.map(v => v.region))];
    const avgConfidence = detectedVertebrae.reduce((sum, v) => sum + v.confidence, 0) / detectedVertebrae.length;

    findings.push({
      id: generateAIFindingId('find'),
      category: 'anatomy',
      summary: `${detectedVertebrae.length} vertebral levels identified`,
      details: `Vertebral levels ${detectedVertebrae[0].level} through ${detectedVertebrae[detectedVertebrae.length - 1].level} are visualized. ${regions.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')} spine region(s) included in the study.`,
      confidence: avgConfidence,
      confidenceLevel: getConfidenceLevel(avgConfidence),
      clinicalSignificance: 'normal',
    });
  }

  // Alignment findings
  const alignmentAbnormalities = detectedAbnormalities.filter(
    a => a.type === 'scoliosis' || a.type === 'alignment_abnormality' || a.type === 'subluxation'
  );

  if (alignmentAbnormalities.length > 0) {
    const mostSevere = alignmentAbnormalities.sort((a, b) => {
      const severityOrder = { severe: 3, moderate: 2, mild: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    })[0];

    findings.push({
      id: generateAIFindingId('find'),
      category: 'alignment',
      summary: `Spinal alignment abnormality detected`,
      details: `${mostSevere.description}. ${alignmentAbnormalities.length > 1 ? `${alignmentAbnormalities.length - 1} additional alignment finding(s) noted.` : ''}`,
      confidence: mostSevere.confidence,
      confidenceLevel: mostSevere.confidenceLevel,
      severity: mostSevere.severity,
      relatedAbnormalities: alignmentAbnormalities.map(a => a.id),
      clinicalSignificance: mostSevere.severity === 'severe' ? 'significant' : mostSevere.severity === 'moderate' ? 'moderate' : 'mild',
    });
  } else if (detectedVertebrae.length > 0) {
    findings.push({
      id: generateAIFindingId('find'),
      category: 'alignment',
      summary: 'No significant alignment abnormality detected',
      details: 'Spinal alignment appears grossly preserved on this view.',
      confidence: 0.75,
      confidenceLevel: 'high',
      clinicalSignificance: 'normal',
    });
  }

  // Degenerative findings
  const degenerativeAbnormalities = detectedAbnormalities.filter(
    a => a.type === 'degenerative_disc_disease' || a.type === 'osteophyte' ||
         a.type === 'facet_arthrosis' || a.type === 'endplate_sclerosis'
  );

  if (degenerativeAbnormalities.length > 0) {
    const locations = [...new Set(degenerativeAbnormalities.map(a => a.location))];
    const avgConfidence = degenerativeAbnormalities.reduce((sum, a) => sum + a.confidence, 0) / degenerativeAbnormalities.length;

    findings.push({
      id: generateAIFindingId('find'),
      category: 'degeneration',
      summary: `Degenerative changes at ${locations.length} level(s)`,
      details: `Degenerative changes are noted at ${locations.join(', ')}. Findings include ${[...new Set(degenerativeAbnormalities.map(a => ABNORMALITY_DESCRIPTIONS[a.type].split(' ').slice(0, 3).join(' ')))].join(', ')}.`,
      confidence: avgConfidence,
      confidenceLevel: getConfidenceLevel(avgConfidence),
      severity: degenerativeAbnormalities.some(a => a.severity === 'severe') ? 'severe' :
                degenerativeAbnormalities.some(a => a.severity === 'moderate') ? 'moderate' : 'mild',
      relatedAbnormalities: degenerativeAbnormalities.map(a => a.id),
      clinicalSignificance: 'moderate',
    });
  }

  // Measurement recommendations
  const criticalMeasurements = suggestedMeasurements.filter(m => m.priority === 'critical' || m.priority === 'recommended');
  if (criticalMeasurements.length > 0) {
    findings.push({
      id: generateAIFindingId('find'),
      category: 'measurement',
      summary: `${criticalMeasurements.length} measurement(s) recommended`,
      details: `Recommended measurements: ${criticalMeasurements.map(m => m.label).join(', ')}. AI has suggested measurement points for provider verification.`,
      confidence: 0.8,
      confidenceLevel: 'high',
      relatedMeasurements: criticalMeasurements.map(m => m.id),
      clinicalSignificance: 'normal',
    });
  }

  return findings;
}

/**
 * Generate overall assessment from findings
 */
export function generateOverallAssessment(
  findings: AIFinding[],
  abnormalities: DetectedAbnormality[]
): string {
  const parts: string[] = [];

  // Count significant findings
  const significantFindings = findings.filter(
    f => f.clinicalSignificance === 'significant' || f.clinicalSignificance === 'moderate'
  );
  const severeAbnormalities = abnormalities.filter(a => a.severity === 'severe');
  const moderateAbnormalities = abnormalities.filter(a => a.severity === 'moderate');

  if (severeAbnormalities.length > 0) {
    parts.push(`SIGNIFICANT FINDINGS: ${severeAbnormalities.length} severe abnormality(ies) detected requiring attention.`);
  }

  if (moderateAbnormalities.length > 0) {
    parts.push(`Moderate findings at ${moderateAbnormalities.length} level(s).`);
  }

  if (significantFindings.length === 0 && abnormalities.length === 0) {
    parts.push('No significant abnormalities detected on AI analysis.');
  }

  parts.push('All AI findings require provider review and correlation with clinical presentation.');

  return parts.join(' ');
}

/**
 * Assess image quality
 */
export function assessImageQuality(
  imageWidth: number,
  imageHeight: number,
  bodyPart: string
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 1.0;

  // Check resolution
  const minDimension = Math.min(imageWidth, imageHeight);
  if (minDimension < 500) {
    issues.push('Low resolution may affect detection accuracy');
    score -= 0.2;
  } else if (minDimension < 800) {
    issues.push('Moderate resolution - some fine details may not be detected');
    score -= 0.1;
  }

  // Check aspect ratio
  const aspectRatio = imageWidth / imageHeight;
  if (aspectRatio > 3 || aspectRatio < 0.3) {
    issues.push('Unusual aspect ratio may indicate cropped or panoramic image');
    score -= 0.15;
  }

  // Simulated quality checks that would use image analysis in production
  if (Math.random() < 0.1) {
    issues.push('Potential patient motion detected');
    score -= 0.1;
  }

  if (Math.random() < 0.05) {
    issues.push('Suboptimal positioning noted');
    score -= 0.1;
  }

  return {
    score: Math.max(0.3, score),
    issues,
  };
}

/**
 * Determine review priority based on findings
 */
export function determineReviewPriority(
  abnormalities: DetectedAbnormality[]
): 'routine' | 'expedited' | 'urgent' {
  const severeCount = abnormalities.filter(a => a.severity === 'severe').length;
  const moderateCount = abnormalities.filter(a => a.severity === 'moderate').length;

  // Check for specific urgent findings
  const urgentTypes: AbnormalityType[] = ['compression_fracture', 'spondylolisthesis', 'stenosis'];
  const hasUrgent = abnormalities.some(a => urgentTypes.includes(a.type) && a.severity !== 'mild');

  if (hasUrgent || severeCount >= 2) {
    return 'urgent';
  }

  if (severeCount > 0 || moderateCount >= 3) {
    return 'expedited';
  }

  return 'routine';
}

// ============================================
// MAIN AI ANALYSIS FUNCTION
// ============================================

/**
 * Perform AI analysis on an imaging study
 * Returns comprehensive analysis with findings requiring provider review
 */
export async function analyzeImage(
  input: AIAnalysisInput,
  options: AIAnalysisOptions = {}
): Promise<AIAnalysisResult> {
  const startTime = Date.now();
  const analysisId = generateAIFindingId('analysis');

  const {
    detectVertebrae = true,
    suggestMeasurements: shouldSuggestMeasurements = true,
    detectAbnormalities: shouldDetectAbnormalities = true,
    detectDegenerativeChanges = true,
    generateFindings: shouldGenerateFindings = true,
    confidenceThreshold = 0.5,
    includeDisclaimer = true,
  } = options;

  // Simulate image dimensions (in production, these would come from the actual image)
  const imageWidth = 1024;
  const imageHeight = 1280;

  // Assess image quality
  const qualityAssessment = assessImageQuality(imageWidth, imageHeight, input.bodyPart);

  // Detect vertebral levels
  let detectedVertebrae: DetectedVertebra[] = [];
  if (detectVertebrae) {
    detectedVertebrae = detectVertebralLevels(input, imageWidth, imageHeight);
    // Filter by confidence threshold
    detectedVertebrae = detectedVertebrae.filter(v => v.confidence >= confidenceThreshold);
  }

  // Get unique spinal regions
  const spinalRegionsIdentified = [...new Set(detectedVertebrae.map(v => v.region))];

  // Suggest measurements
  let measurements: SuggestedMeasurement[] = [];
  let cobbAngleSuggestions: SuggestedMeasurement[] = [];
  let lordosisSuggestions: SuggestedMeasurement[] = [];

  if (shouldSuggestMeasurements && detectedVertebrae.length > 0) {
    measurements = suggestMeasurements(detectedVertebrae, input.bodyPart);
    cobbAngleSuggestions = measurements.filter(m => m.type === 'COBB_ANGLE');
    lordosisSuggestions = measurements.filter(
      m => m.type === 'CERVICAL_LORDOSIS' || m.type === 'LUMBAR_LORDOSIS'
    );
  }

  // Detect abnormalities
  let abnormalities: DetectedAbnormality[] = [];
  let degenerativeChanges: DetectedAbnormality[] = [];

  if (shouldDetectAbnormalities && detectedVertebrae.length > 0) {
    abnormalities = detectAbnormalities(detectedVertebrae, input);
    abnormalities = abnormalities.filter(a => a.confidence >= confidenceThreshold);

    if (detectDegenerativeChanges) {
      degenerativeChanges = abnormalities.filter(
        a => a.type === 'degenerative_disc_disease' ||
             a.type === 'osteophyte' ||
             a.type === 'facet_arthrosis' ||
             a.type === 'endplate_sclerosis'
      );
    }
  }

  // Generate preliminary findings
  let preliminaryFindings: AIFinding[] = [];
  let overallAssessment = '';

  if (shouldGenerateFindings) {
    preliminaryFindings = generatePreliminaryFindings(
      detectedVertebrae,
      measurements,
      abnormalities
    );
    overallAssessment = generateOverallAssessment(preliminaryFindings, abnormalities);
  }

  // Calculate overall vertebrae detection confidence
  const vertebraeDetectionConfidence = detectedVertebrae.length > 0
    ? detectedVertebrae.reduce((sum, v) => sum + v.confidence, 0) / detectedVertebrae.length
    : 0;

  // Determine review priority
  const reviewPriority = determineReviewPriority(abnormalities);

  const processingTimeMs = Date.now() - startTime;

  return {
    imageId: input.imageId,
    analysisId,
    timestamp: new Date(),
    modelVersion: AI_MODEL_VERSION,
    processingTimeMs,

    detectedVertebrae,
    vertebraeDetectionConfidence,
    spinalRegionsIdentified,

    suggestedMeasurements: measurements,
    cobbAngleSuggestions,
    lordosisSuggestions,

    detectedAbnormalities: abnormalities,
    degenerativeChanges,

    preliminaryFindings,
    overallAssessment,

    imageQualityScore: qualityAssessment.score,
    imageQualityIssues: qualityAssessment.issues,
    requiresProviderReview: true,
    reviewPriority,

    disclaimers: includeDisclaimer ? AI_DISCLAIMERS : [],
  };
}

/**
 * Validate AI analysis before saving
 */
export function validateAnalysisResult(result: AIAnalysisResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!result.imageId) {
    errors.push('Image ID is required');
  }

  if (!result.analysisId) {
    errors.push('Analysis ID is required');
  }

  if (!result.modelVersion) {
    errors.push('Model version is required');
  }

  if (result.detectedVertebrae.length === 0 && result.suggestedMeasurements.length === 0 && result.detectedAbnormalities.length === 0) {
    errors.push('Analysis produced no findings - image may not be suitable for AI analysis');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
