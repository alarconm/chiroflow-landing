/**
 * Deviation Analysis Service for Posture Assessment
 *
 * This service analyzes detected landmarks to calculate postural deviations
 * from ideal alignment. It provides automatic calculation of:
 * - Head forward posture (craniovertebral angle)
 * - Shoulder level asymmetry
 * - Hip level asymmetry
 * - Scoliotic curves
 * - Kyphosis and lordosis assessment
 * - Weight distribution analysis
 *
 * All measurements can be converted to real-world units when
 * calibration data (known height or reference distance) is provided.
 */

import {
  type LandmarkName,
  type PostureView,
  type DetectedLandmark,
  calculateLandmarkAngle,
  calculateLevelDifference,
  calculateLandmarkDistance,
} from './landmarkDetection';

// ============================================
// DEVIATION TYPE DEFINITIONS
// ============================================

export const DEVIATION_TYPES = {
  // Head and Neck
  HEAD_FORWARD_POSTURE: {
    id: 'head_forward',
    name: 'Forward Head Posture',
    description: 'Head positioned anterior to the plumb line',
    views: ['LATERAL_LEFT', 'LATERAL_RIGHT'],
    unit: 'degrees',
    normalRangeMin: 0,
    normalRangeMax: 8,
    measurementMethod: 'craniovertebral_angle',
  },
  HEAD_TILT: {
    id: 'head_tilt',
    name: 'Head Tilt',
    description: 'Lateral head tilt to one side',
    views: ['ANTERIOR', 'POSTERIOR'],
    unit: 'degrees',
    normalRangeMin: -2,
    normalRangeMax: 2,
    measurementMethod: 'ear_level_angle',
  },
  HEAD_ROTATION: {
    id: 'head_rotation',
    name: 'Head Rotation',
    description: 'Rotation of the head on the cervical spine',
    views: ['ANTERIOR', 'POSTERIOR'],
    unit: 'degrees',
    normalRangeMin: -5,
    normalRangeMax: 5,
    measurementMethod: 'ear_asymmetry',
  },

  // Shoulder Deviations
  SHOULDER_LEVEL_DIFFERENCE: {
    id: 'shoulder_uneven',
    name: 'Uneven Shoulders',
    description: 'Asymmetric shoulder height',
    views: ['ANTERIOR', 'POSTERIOR'],
    unit: 'mm',
    normalRangeMin: -10,
    normalRangeMax: 10,
    measurementMethod: 'shoulder_level',
  },
  SHOULDER_PROTRACTION: {
    id: 'shoulder_protracted',
    name: 'Shoulder Protraction',
    description: 'Shoulders rolled forward',
    views: ['LATERAL_LEFT', 'LATERAL_RIGHT'],
    unit: 'degrees',
    normalRangeMin: 0,
    normalRangeMax: 15,
    measurementMethod: 'shoulder_plumb_angle',
  },

  // Hip and Pelvis Deviations
  HIP_LEVEL_DIFFERENCE: {
    id: 'hip_uneven',
    name: 'Uneven Hips',
    description: 'Asymmetric hip/iliac crest height',
    views: ['ANTERIOR', 'POSTERIOR'],
    unit: 'mm',
    normalRangeMin: -8,
    normalRangeMax: 8,
    measurementMethod: 'hip_level',
  },
  PELVIC_TILT_LATERAL: {
    id: 'pelvic_tilt_lateral',
    name: 'Lateral Pelvic Tilt',
    description: 'Pelvis tilted to one side',
    views: ['POSTERIOR'],
    unit: 'degrees',
    normalRangeMin: -3,
    normalRangeMax: 3,
    measurementMethod: 'psis_angle',
  },
  PELVIC_TILT_ANTERIOR: {
    id: 'pelvic_tilt_anterior',
    name: 'Anterior Pelvic Tilt',
    description: 'Excessive forward tilt of pelvis',
    views: ['LATERAL_LEFT', 'LATERAL_RIGHT'],
    unit: 'degrees',
    normalRangeMin: 7,
    normalRangeMax: 15,
    measurementMethod: 'asis_psis_angle',
  },

  // Spinal Curves
  THORACIC_KYPHOSIS: {
    id: 'kyphosis',
    name: 'Thoracic Kyphosis',
    description: 'Curvature of the thoracic spine (round upper back)',
    views: ['LATERAL_LEFT', 'LATERAL_RIGHT'],
    unit: 'degrees',
    normalRangeMin: 20,
    normalRangeMax: 40,
    measurementMethod: 'thoracic_angle',
  },
  LUMBAR_LORDOSIS: {
    id: 'lordosis',
    name: 'Lumbar Lordosis',
    description: 'Curvature of the lumbar spine (lower back curve)',
    views: ['LATERAL_LEFT', 'LATERAL_RIGHT'],
    unit: 'degrees',
    normalRangeMin: 30,
    normalRangeMax: 50,
    measurementMethod: 'lumbar_angle',
  },
  SCOLIOSIS: {
    id: 'scoliosis',
    name: 'Scoliotic Curve',
    description: 'Lateral curvature of the spine',
    views: ['POSTERIOR'],
    unit: 'degrees',
    normalRangeMin: -5,
    normalRangeMax: 5,
    measurementMethod: 'spinal_curve',
  },

  // Knee Alignment
  KNEE_VALGUS: {
    id: 'knee_valgus',
    name: 'Knee Valgus (Knock-Knees)',
    description: 'Knees angled inward',
    views: ['ANTERIOR'],
    unit: 'degrees',
    normalRangeMin: -3,
    normalRangeMax: 8,
    measurementMethod: 'knee_angle',
  },
  KNEE_VARUS: {
    id: 'knee_varus',
    name: 'Knee Varus (Bow-Legs)',
    description: 'Knees angled outward',
    views: ['ANTERIOR'],
    unit: 'degrees',
    normalRangeMin: -8,
    normalRangeMax: 3,
    measurementMethod: 'knee_angle',
  },
  KNEE_HYPEREXTENSION: {
    id: 'knee_hyperextension',
    name: 'Knee Hyperextension',
    description: 'Excessive backward bending of the knee',
    views: ['LATERAL_LEFT', 'LATERAL_RIGHT'],
    unit: 'degrees',
    normalRangeMin: -5,
    normalRangeMax: 0,
    measurementMethod: 'knee_lateral_angle',
  },

  // Ankle and Foot
  ANKLE_PRONATION: {
    id: 'ankle_pronation',
    name: 'Ankle Pronation',
    description: 'Feet rolling inward',
    views: ['POSTERIOR'],
    unit: 'degrees',
    normalRangeMin: 0,
    normalRangeMax: 6,
    measurementMethod: 'heel_angle',
  },
  ANKLE_SUPINATION: {
    id: 'ankle_supination',
    name: 'Ankle Supination',
    description: 'Feet rolling outward',
    views: ['POSTERIOR'],
    unit: 'degrees',
    normalRangeMin: -6,
    normalRangeMax: 0,
    measurementMethod: 'heel_angle',
  },

  // Overall Alignment
  WEIGHT_SHIFT: {
    id: 'weight_shift',
    name: 'Weight Distribution Shift',
    description: 'Center of mass shifted from midline',
    views: ['ANTERIOR', 'POSTERIOR'],
    unit: '%',
    normalRangeMin: 45,
    normalRangeMax: 55,
    measurementMethod: 'center_of_mass',
  },
} as const;

export type DeviationType = keyof typeof DEVIATION_TYPES;

// ============================================
// SEVERITY CALCULATION
// ============================================

export type SeverityLevel = 'MINIMAL' | 'MILD' | 'MODERATE' | 'SEVERE' | 'EXTREME';

export interface SeverityResult {
  severity: SeverityLevel;
  percentFromNormal: number;
  direction?: 'left' | 'right' | 'anterior' | 'posterior' | 'increased' | 'decreased';
  clinicalSignificance: string;
}

/**
 * Calculate severity based on how far a measurement is from normal range
 */
export function calculateSeverity(
  measurementValue: number,
  normalRangeMin: number,
  normalRangeMax: number,
  unit: string
): SeverityResult {
  const normalMidpoint = (normalRangeMin + normalRangeMax) / 2;
  const normalRange = normalRangeMax - normalRangeMin;

  let deviationFromNormal = 0;
  let direction: SeverityResult['direction'] = undefined;

  if (measurementValue < normalRangeMin) {
    deviationFromNormal = normalRangeMin - measurementValue;
    direction = measurementValue < normalMidpoint ? 'left' : 'decreased';
  } else if (measurementValue > normalRangeMax) {
    deviationFromNormal = measurementValue - normalRangeMax;
    direction = measurementValue > normalMidpoint ? 'right' : 'increased';
  }

  // Calculate percentage deviation
  const percentFromNormal = normalRange > 0 ? (deviationFromNormal / normalRange) * 100 : 0;

  // Determine severity level
  let severity: SeverityLevel;
  let clinicalSignificance: string;

  if (measurementValue >= normalRangeMin && measurementValue <= normalRangeMax) {
    severity = 'MINIMAL';
    clinicalSignificance = 'Within normal limits';
  } else if (deviationFromNormal <= normalRange * 0.25) {
    severity = 'MILD';
    clinicalSignificance = 'Slight deviation, monitor';
  } else if (deviationFromNormal <= normalRange * 0.5) {
    severity = 'MODERATE';
    clinicalSignificance = 'Noticeable deviation, intervention recommended';
  } else if (deviationFromNormal <= normalRange) {
    severity = 'SEVERE';
    clinicalSignificance = 'Significant deviation, treatment needed';
  } else {
    severity = 'EXTREME';
    clinicalSignificance = 'Critical deviation, urgent attention required';
  }

  return {
    severity,
    percentFromNormal,
    direction,
    clinicalSignificance,
  };
}

// ============================================
// DEVIATION CALCULATIONS
// ============================================

export interface DeviationMeasurement {
  deviationType: string;
  name: string;
  description: string;
  measurementValue: number;
  measurementUnit: string;
  normalRangeMin: number;
  normalRangeMax: number;
  deviationAmount: number;
  severity: SeverityLevel;
  direction?: string;
  clinicalSignificance: string;
  landmarks: string[];
  view: PostureView;
  notes?: string;
}

/**
 * Convert normalized landmark difference to real-world measurement
 * Using estimated patient height for calibration (default 170cm)
 */
export function normalizedToMM(
  normalizedDifference: number,
  patientHeightCm: number = 170
): number {
  return normalizedDifference * patientHeightCm * 10; // Convert cm to mm
}

/**
 * Calculate forward head posture (craniovertebral angle)
 * Measured as angle between ear, C7, and vertical
 */
export function calculateForwardHeadPosture(
  landmarks: Map<LandmarkName, DetectedLandmark>,
  view: PostureView
): DeviationMeasurement | null {
  const earKey = view === 'LATERAL_LEFT' ? 'external_auditory_meatus' : 'external_auditory_meatus';
  const ear = landmarks.get(earKey);
  const c7 = landmarks.get('c7_spinous');

  if (!ear || !c7) return null;

  // Create a virtual vertical point above C7
  const verticalPoint: DetectedLandmark = {
    name: 'c7_spinous',
    x: c7.x,
    y: c7.y - 0.2,
    confidence: 1,
  };

  // Calculate craniovertebral angle
  const angle = calculateLandmarkAngle(ear, c7, verticalPoint);
  const forwardAngle = 90 - angle; // Convert to forward angle

  const deviationType = DEVIATION_TYPES.HEAD_FORWARD_POSTURE;
  const severityResult = calculateSeverity(
    forwardAngle,
    deviationType.normalRangeMin,
    deviationType.normalRangeMax,
    deviationType.unit
  );

  return {
    deviationType: deviationType.id,
    name: deviationType.name,
    description: deviationType.description,
    measurementValue: Math.round(forwardAngle * 10) / 10,
    measurementUnit: deviationType.unit,
    normalRangeMin: deviationType.normalRangeMin,
    normalRangeMax: deviationType.normalRangeMax,
    deviationAmount: Math.abs(
      forwardAngle > deviationType.normalRangeMax
        ? forwardAngle - deviationType.normalRangeMax
        : forwardAngle < deviationType.normalRangeMin
          ? deviationType.normalRangeMin - forwardAngle
          : 0
    ),
    severity: severityResult.severity,
    direction: forwardAngle > deviationType.normalRangeMax ? 'anterior' : undefined,
    clinicalSignificance: severityResult.clinicalSignificance,
    landmarks: [earKey, 'c7_spinous'],
    view,
    notes:
      forwardAngle > deviationType.normalRangeMax
        ? `Head is ${Math.round(forwardAngle - deviationType.normalRangeMax)}° forward of ideal position`
        : undefined,
  };
}

/**
 * Calculate shoulder level difference
 */
export function calculateShoulderLevelDifference(
  landmarks: Map<LandmarkName, DetectedLandmark>,
  view: PostureView,
  patientHeightCm: number = 170
): DeviationMeasurement | null {
  const leftShoulder = landmarks.get('left_shoulder');
  const rightShoulder = landmarks.get('right_shoulder');

  if (!leftShoulder || !rightShoulder) return null;

  const levelDiff = calculateLevelDifference(leftShoulder, rightShoulder);
  const levelDiffMM = normalizedToMM(levelDiff, patientHeightCm);

  const deviationType = DEVIATION_TYPES.SHOULDER_LEVEL_DIFFERENCE;
  const severityResult = calculateSeverity(
    levelDiffMM,
    deviationType.normalRangeMin,
    deviationType.normalRangeMax,
    deviationType.unit
  );

  const direction = levelDiffMM > 0 ? 'left' : levelDiffMM < 0 ? 'right' : undefined;

  return {
    deviationType: deviationType.id,
    name: deviationType.name,
    description: deviationType.description,
    measurementValue: Math.round(Math.abs(levelDiffMM) * 10) / 10,
    measurementUnit: deviationType.unit,
    normalRangeMin: deviationType.normalRangeMin,
    normalRangeMax: deviationType.normalRangeMax,
    deviationAmount: Math.max(
      0,
      Math.abs(levelDiffMM) - Math.abs(deviationType.normalRangeMax)
    ),
    severity: severityResult.severity,
    direction: direction === 'left' ? 'left' : direction === 'right' ? 'right' : undefined,
    clinicalSignificance: severityResult.clinicalSignificance,
    landmarks: ['left_shoulder', 'right_shoulder'],
    view,
    notes: direction
      ? `${direction.charAt(0).toUpperCase() + direction.slice(1)} shoulder is higher by ${Math.round(Math.abs(levelDiffMM))}mm`
      : undefined,
  };
}

/**
 * Calculate hip level difference
 */
export function calculateHipLevelDifference(
  landmarks: Map<LandmarkName, DetectedLandmark>,
  view: PostureView,
  patientHeightCm: number = 170
): DeviationMeasurement | null {
  const leftHip = landmarks.get('left_hip') || landmarks.get('left_psis');
  const rightHip = landmarks.get('right_hip') || landmarks.get('right_psis');

  if (!leftHip || !rightHip) return null;

  const levelDiff = calculateLevelDifference(leftHip, rightHip);
  const levelDiffMM = normalizedToMM(levelDiff, patientHeightCm);

  const deviationType = DEVIATION_TYPES.HIP_LEVEL_DIFFERENCE;
  const severityResult = calculateSeverity(
    levelDiffMM,
    deviationType.normalRangeMin,
    deviationType.normalRangeMax,
    deviationType.unit
  );

  const direction = levelDiffMM > 0 ? 'left' : levelDiffMM < 0 ? 'right' : undefined;

  return {
    deviationType: deviationType.id,
    name: deviationType.name,
    description: deviationType.description,
    measurementValue: Math.round(Math.abs(levelDiffMM) * 10) / 10,
    measurementUnit: deviationType.unit,
    normalRangeMin: deviationType.normalRangeMin,
    normalRangeMax: deviationType.normalRangeMax,
    deviationAmount: Math.max(0, Math.abs(levelDiffMM) - Math.abs(deviationType.normalRangeMax)),
    severity: severityResult.severity,
    direction: direction === 'left' ? 'left' : direction === 'right' ? 'right' : undefined,
    clinicalSignificance: severityResult.clinicalSignificance,
    landmarks: [leftHip === landmarks.get('left_hip') ? 'left_hip' : 'left_psis', rightHip === landmarks.get('right_hip') ? 'right_hip' : 'right_psis'],
    view,
    notes: direction
      ? `${direction.charAt(0).toUpperCase() + direction.slice(1)} hip is higher by ${Math.round(Math.abs(levelDiffMM))}mm`
      : undefined,
  };
}

/**
 * Calculate scoliotic curve from spinal landmarks
 */
export function calculateScolioticCurve(
  landmarks: Map<LandmarkName, DetectedLandmark>,
  view: PostureView
): DeviationMeasurement | null {
  // Need at least C7, T8, and L5 for basic assessment
  const c7 = landmarks.get('c7_spinous');
  const t4 = landmarks.get('t4_spinous');
  const t8 = landmarks.get('t8_spinous');
  const t12 = landmarks.get('t12_spinous');
  const l5 = landmarks.get('l5_spinous');

  if (!c7 || !l5) return null;

  // Calculate lateral deviation at mid-spine relative to C7-L5 line
  const midpoint = t8 || t4 || t12;
  if (!midpoint) return null;

  // Calculate how far the midpoint deviates from the ideal C7-L5 line
  const idealMidX = (c7.x + l5.x) / 2;
  const lateralDeviation = midpoint.x - idealMidX;

  // Convert to angle (approximate Cobb angle calculation)
  const spineLength = Math.abs(l5.y - c7.y);
  const deviationAngle = Math.atan2(Math.abs(lateralDeviation), spineLength / 2) * (180 / Math.PI);

  const deviationType = DEVIATION_TYPES.SCOLIOSIS;
  const severityResult = calculateSeverity(
    deviationAngle,
    deviationType.normalRangeMin,
    deviationType.normalRangeMax,
    deviationType.unit
  );

  const direction = lateralDeviation > 0 ? 'right' : lateralDeviation < 0 ? 'left' : undefined;

  return {
    deviationType: deviationType.id,
    name: deviationType.name,
    description: deviationType.description,
    measurementValue: Math.round(deviationAngle * 10) / 10,
    measurementUnit: deviationType.unit,
    normalRangeMin: deviationType.normalRangeMin,
    normalRangeMax: deviationType.normalRangeMax,
    deviationAmount: Math.max(0, deviationAngle - deviationType.normalRangeMax),
    severity: severityResult.severity,
    direction,
    clinicalSignificance: severityResult.clinicalSignificance,
    landmarks: ['c7_spinous', midpoint === t8 ? 't8_spinous' : midpoint === t4 ? 't4_spinous' : 't12_spinous', 'l5_spinous'],
    view,
    notes:
      deviationAngle > deviationType.normalRangeMax
        ? `Lateral curve of approximately ${Math.round(deviationAngle)}° to the ${direction}`
        : undefined,
  };
}

/**
 * Calculate thoracic kyphosis
 */
export function calculateKyphosis(
  landmarks: Map<LandmarkName, DetectedLandmark>,
  view: PostureView
): DeviationMeasurement | null {
  const c7 = landmarks.get('c7_spinous');
  const t12 = landmarks.get('t12_spinous');
  const ear = landmarks.get('external_auditory_meatus');

  if (!c7 || !t12) return null;

  // Calculate thoracic angle relative to vertical
  const thoracicAngle = calculateLandmarkAngle(c7, t12);

  // Adjust based on typical posture - thoracic spine should have some posterior curvature
  const kyphosisAngle = Math.abs(thoracicAngle) + 20; // Add baseline kyphosis

  const deviationType = DEVIATION_TYPES.THORACIC_KYPHOSIS;
  const severityResult = calculateSeverity(
    kyphosisAngle,
    deviationType.normalRangeMin,
    deviationType.normalRangeMax,
    deviationType.unit
  );

  return {
    deviationType: deviationType.id,
    name: deviationType.name,
    description: deviationType.description,
    measurementValue: Math.round(kyphosisAngle * 10) / 10,
    measurementUnit: deviationType.unit,
    normalRangeMin: deviationType.normalRangeMin,
    normalRangeMax: deviationType.normalRangeMax,
    deviationAmount: kyphosisAngle > deviationType.normalRangeMax
      ? kyphosisAngle - deviationType.normalRangeMax
      : kyphosisAngle < deviationType.normalRangeMin
        ? deviationType.normalRangeMin - kyphosisAngle
        : 0,
    severity: severityResult.severity,
    direction: kyphosisAngle > deviationType.normalRangeMax ? 'increased' : kyphosisAngle < deviationType.normalRangeMin ? 'decreased' : undefined,
    clinicalSignificance: severityResult.clinicalSignificance,
    landmarks: ['c7_spinous', 't12_spinous'],
    view,
    notes: kyphosisAngle > deviationType.normalRangeMax
      ? `Increased thoracic kyphosis (hyperkyphosis) of ${Math.round(kyphosisAngle)}°`
      : kyphosisAngle < deviationType.normalRangeMin
        ? `Decreased thoracic kyphosis (flat back) of ${Math.round(kyphosisAngle)}°`
        : undefined,
  };
}

/**
 * Calculate lumbar lordosis
 */
export function calculateLordosis(
  landmarks: Map<LandmarkName, DetectedLandmark>,
  view: PostureView
): DeviationMeasurement | null {
  const t12 = landmarks.get('t12_spinous');
  const l3 = landmarks.get('l3_spinous');
  const s2 = landmarks.get('s2_spinous');

  if (!t12 || !s2) return null;

  // Calculate lumbar curve
  const lumbarAngle = calculateLandmarkAngle(t12, s2);

  // Adjust for typical lordosis
  const lordosisAngle = Math.abs(lumbarAngle) + 30; // Add baseline lordosis

  const deviationType = DEVIATION_TYPES.LUMBAR_LORDOSIS;
  const severityResult = calculateSeverity(
    lordosisAngle,
    deviationType.normalRangeMin,
    deviationType.normalRangeMax,
    deviationType.unit
  );

  return {
    deviationType: deviationType.id,
    name: deviationType.name,
    description: deviationType.description,
    measurementValue: Math.round(lordosisAngle * 10) / 10,
    measurementUnit: deviationType.unit,
    normalRangeMin: deviationType.normalRangeMin,
    normalRangeMax: deviationType.normalRangeMax,
    deviationAmount: lordosisAngle > deviationType.normalRangeMax
      ? lordosisAngle - deviationType.normalRangeMax
      : lordosisAngle < deviationType.normalRangeMin
        ? deviationType.normalRangeMin - lordosisAngle
        : 0,
    severity: severityResult.severity,
    direction: lordosisAngle > deviationType.normalRangeMax ? 'increased' : lordosisAngle < deviationType.normalRangeMin ? 'decreased' : undefined,
    clinicalSignificance: severityResult.clinicalSignificance,
    landmarks: ['t12_spinous', 's2_spinous'],
    view,
    notes: lordosisAngle > deviationType.normalRangeMax
      ? `Increased lumbar lordosis (hyperlordosis) of ${Math.round(lordosisAngle)}°`
      : lordosisAngle < deviationType.normalRangeMin
        ? `Decreased lumbar lordosis (flat back) of ${Math.round(lordosisAngle)}°`
        : undefined,
  };
}

/**
 * Calculate weight distribution shift
 */
export function calculateWeightDistribution(
  landmarks: Map<LandmarkName, DetectedLandmark>,
  view: PostureView
): DeviationMeasurement | null {
  // Need bilateral landmarks to calculate center of mass
  const leftShoulder = landmarks.get('left_shoulder');
  const rightShoulder = landmarks.get('right_shoulder');
  const leftHip = landmarks.get('left_hip');
  const rightHip = landmarks.get('right_hip');
  const leftAnkle = landmarks.get('left_ankle');
  const rightAnkle = landmarks.get('right_ankle');

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  // Calculate average X position (center of mass approximation)
  const leftAvgX = (leftShoulder.x + leftHip.x + (leftAnkle?.x || leftHip.x)) / 3;
  const rightAvgX = (rightShoulder.x + rightHip.x + (rightAnkle?.x || rightHip.x)) / 3;
  const centerX = (leftAvgX + rightAvgX) / 2;

  // Calculate weight distribution as percentage
  // 50% = perfectly centered, <50% = shifted left, >50% = shifted right
  const baseLeft = leftAnkle?.x || leftHip.x;
  const baseRight = rightAnkle?.x || rightHip.x;
  const baseWidth = baseRight - baseLeft;

  const weightPercent = baseWidth > 0
    ? ((centerX - baseLeft) / baseWidth) * 100
    : 50;

  const deviationType = DEVIATION_TYPES.WEIGHT_SHIFT;
  const severityResult = calculateSeverity(
    weightPercent,
    deviationType.normalRangeMin,
    deviationType.normalRangeMax,
    deviationType.unit
  );

  const direction = weightPercent < 45 ? 'left' : weightPercent > 55 ? 'right' : undefined;

  return {
    deviationType: deviationType.id,
    name: deviationType.name,
    description: deviationType.description,
    measurementValue: Math.round(weightPercent * 10) / 10,
    measurementUnit: deviationType.unit,
    normalRangeMin: deviationType.normalRangeMin,
    normalRangeMax: deviationType.normalRangeMax,
    deviationAmount: Math.abs(weightPercent - 50),
    severity: severityResult.severity,
    direction,
    clinicalSignificance: severityResult.clinicalSignificance,
    landmarks: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
    view,
    notes: direction
      ? `Weight shifted ${Math.round(Math.abs(weightPercent - 50))}% to the ${direction}`
      : undefined,
  };
}

// ============================================
// MAIN ANALYSIS FUNCTIONS
// ============================================

export interface AnalysisResult {
  success: boolean;
  deviations: DeviationMeasurement[];
  overallSeverity: SeverityLevel;
  summaryNotes: string;
  warnings: string[];
  analyzedViews: PostureView[];
  analysisTimestamp: Date;
}

/**
 * Analyze all deviations from landmarks for a specific view
 */
export function analyzeDeviationsForView(
  landmarks: DetectedLandmark[],
  view: PostureView,
  patientHeightCm: number = 170
): DeviationMeasurement[] {
  // Convert landmarks array to Map for easier lookup
  const landmarkMap = new Map<LandmarkName, DetectedLandmark>();
  landmarks.forEach((lm) => {
    landmarkMap.set(lm.name, lm);
  });

  const deviations: DeviationMeasurement[] = [];

  // Run applicable analysis based on view
  if (view === 'LATERAL_LEFT' || view === 'LATERAL_RIGHT') {
    // Forward head posture
    const fhp = calculateForwardHeadPosture(landmarkMap, view);
    if (fhp) deviations.push(fhp);

    // Kyphosis
    const kyphosis = calculateKyphosis(landmarkMap, view);
    if (kyphosis) deviations.push(kyphosis);

    // Lordosis
    const lordosis = calculateLordosis(landmarkMap, view);
    if (lordosis) deviations.push(lordosis);
  }

  if (view === 'ANTERIOR' || view === 'POSTERIOR') {
    // Shoulder level
    const shoulderLevel = calculateShoulderLevelDifference(landmarkMap, view, patientHeightCm);
    if (shoulderLevel) deviations.push(shoulderLevel);

    // Hip level
    const hipLevel = calculateHipLevelDifference(landmarkMap, view, patientHeightCm);
    if (hipLevel) deviations.push(hipLevel);

    // Weight distribution
    const weight = calculateWeightDistribution(landmarkMap, view);
    if (weight) deviations.push(weight);
  }

  if (view === 'POSTERIOR') {
    // Scoliosis
    const scoliosis = calculateScolioticCurve(landmarkMap, view);
    if (scoliosis) deviations.push(scoliosis);
  }

  return deviations;
}

/**
 * Analyze all deviations for an assessment with multiple views
 */
export function analyzeAssessmentDeviations(
  imageAnalyses: Array<{
    view: PostureView;
    landmarks: DetectedLandmark[];
  }>,
  patientHeightCm: number = 170
): AnalysisResult {
  const allDeviations: DeviationMeasurement[] = [];
  const warnings: string[] = [];
  const analyzedViews: PostureView[] = [];

  for (const { view, landmarks } of imageAnalyses) {
    if (landmarks.length < 3) {
      warnings.push(`Insufficient landmarks detected for ${view} view (${landmarks.length} found, minimum 3 required)`);
      continue;
    }

    analyzedViews.push(view);
    const viewDeviations = analyzeDeviationsForView(landmarks, view, patientHeightCm);
    allDeviations.push(...viewDeviations);
  }

  // Calculate overall severity (highest severity found)
  const severityOrder: SeverityLevel[] = ['MINIMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREME'];
  const highestSeverity = allDeviations.reduce<SeverityLevel>((highest, dev) => {
    const currentIndex = severityOrder.indexOf(dev.severity);
    const highestIndex = severityOrder.indexOf(highest);
    return currentIndex > highestIndex ? dev.severity : highest;
  }, 'MINIMAL');

  // Generate summary notes
  const significantDeviations = allDeviations.filter(
    (d) => d.severity !== 'MINIMAL'
  );
  const summaryNotes = generateSummaryNotes(significantDeviations, highestSeverity);

  return {
    success: true,
    deviations: allDeviations,
    overallSeverity: highestSeverity,
    summaryNotes,
    warnings,
    analyzedViews,
    analysisTimestamp: new Date(),
  };
}

/**
 * Generate human-readable summary notes
 */
function generateSummaryNotes(
  deviations: DeviationMeasurement[],
  overallSeverity: SeverityLevel
): string {
  if (deviations.length === 0) {
    return 'Posture analysis shows no significant deviations from normal alignment.';
  }

  const notes: string[] = [];

  // Group by body region
  const headNeck = deviations.filter((d) =>
    ['head_forward', 'head_tilt', 'head_rotation'].includes(d.deviationType)
  );
  const shoulders = deviations.filter((d) =>
    ['shoulder_uneven', 'shoulder_protracted'].includes(d.deviationType)
  );
  const spine = deviations.filter((d) =>
    ['kyphosis', 'lordosis', 'scoliosis'].includes(d.deviationType)
  );
  const pelvis = deviations.filter((d) =>
    ['hip_uneven', 'pelvic_tilt_lateral', 'pelvic_tilt_anterior'].includes(d.deviationType)
  );

  if (headNeck.length > 0) {
    const severe = headNeck.filter((d) => d.severity === 'SEVERE' || d.severity === 'EXTREME');
    if (severe.length > 0) {
      notes.push(`Significant head/neck findings: ${severe.map((d) => d.name).join(', ')}`);
    }
  }

  if (shoulders.length > 0) {
    const maxDev = shoulders.reduce((max, d) =>
      d.deviationAmount > max.deviationAmount ? d : max
    );
    if (maxDev.severity !== 'MINIMAL') {
      notes.push(`Shoulder asymmetry noted: ${maxDev.notes || maxDev.description}`);
    }
  }

  if (spine.length > 0) {
    spine.forEach((d) => {
      if (d.severity !== 'MINIMAL') {
        notes.push(`Spinal finding: ${d.notes || d.description}`);
      }
    });
  }

  if (pelvis.length > 0) {
    const maxDev = pelvis.reduce((max, d) =>
      d.deviationAmount > max.deviationAmount ? d : max
    );
    if (maxDev.severity !== 'MINIMAL') {
      notes.push(`Pelvic asymmetry: ${maxDev.notes || maxDev.description}`);
    }
  }

  if (notes.length === 0) {
    return `Mild postural deviations noted. ${deviations.length} findings within acceptable ranges.`;
  }

  return notes.join('\n');
}

// ============================================
// REPORT GENERATION
// ============================================

export interface DeviationReport {
  patientName: string;
  assessmentDate: Date;
  practitionerName: string;
  deviations: DeviationMeasurement[];
  overallSeverity: SeverityLevel;
  summaryNotes: string;
  recommendations: string[];
  viewsAnalyzed: PostureView[];
}

/**
 * Generate formatted deviation report data
 */
export function generateDeviationReport(
  analysisResult: AnalysisResult,
  patientName: string,
  practitionerName: string,
  assessmentDate: Date
): DeviationReport {
  const recommendations = generateRecommendations(analysisResult.deviations);

  return {
    patientName,
    assessmentDate,
    practitionerName,
    deviations: analysisResult.deviations,
    overallSeverity: analysisResult.overallSeverity,
    summaryNotes: analysisResult.summaryNotes,
    recommendations,
    viewsAnalyzed: analysisResult.analyzedViews,
  };
}

/**
 * Generate treatment recommendations based on deviations
 */
function generateRecommendations(deviations: DeviationMeasurement[]): string[] {
  const recommendations: string[] = [];

  // Check for specific conditions and add recommendations
  const fhp = deviations.find((d) => d.deviationType === 'head_forward' && d.severity !== 'MINIMAL');
  if (fhp) {
    recommendations.push('Cervical strengthening exercises (chin tucks, neck retractions)');
    recommendations.push('Ergonomic workstation assessment recommended');
  }

  const kyphosis = deviations.find((d) => d.deviationType === 'kyphosis' && d.severity !== 'MINIMAL');
  if (kyphosis) {
    recommendations.push('Thoracic extension exercises');
    recommendations.push('Postural awareness training');
  }

  const shoulderDev = deviations.find((d) => d.deviationType === 'shoulder_uneven' && d.severity !== 'MINIMAL');
  if (shoulderDev) {
    recommendations.push('Shoulder leveling exercises');
    recommendations.push('Assessment for leg length discrepancy');
  }

  const hipDev = deviations.find((d) => d.deviationType === 'hip_uneven' && d.severity !== 'MINIMAL');
  if (hipDev) {
    recommendations.push('Pelvic balancing exercises');
    recommendations.push('Consider heel lift assessment');
  }

  const scoliosis = deviations.find((d) => d.deviationType === 'scoliosis' && d.severity !== 'MINIMAL');
  if (scoliosis) {
    recommendations.push('Scoliosis-specific exercises (Schroth method may be appropriate)');
    if (scoliosis.severity === 'SEVERE' || scoliosis.severity === 'EXTREME') {
      recommendations.push('Referral for radiographic evaluation recommended');
    }
  }

  const lordosis = deviations.find((d) => d.deviationType === 'lordosis' && d.severity !== 'MINIMAL');
  if (lordosis) {
    recommendations.push('Core strengthening exercises');
    recommendations.push('Hip flexor stretching');
  }

  // General recommendations if any deviations found
  if (deviations.some((d) => d.severity !== 'MINIMAL')) {
    recommendations.push('Follow-up posture assessment in 4-6 weeks to track progress');
  }

  return recommendations.length > 0
    ? recommendations
    : ['Continue current activities with attention to posture'];
}
