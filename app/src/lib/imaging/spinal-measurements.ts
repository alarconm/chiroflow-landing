/**
 * Spinal Measurement Tools
 * Epic 22: Imaging & X-Ray Integration (US-228)
 *
 * Specialized measurement tools for chiropractic X-ray analysis:
 * - Cobb angle measurement for scoliosis
 * - Cervical lordosis angle
 * - Lumbar lordosis angle
 * - Disc space height measurement
 * - Vertebral body height ratio
 * - Atlas plane line
 * - Auto-calculate deviation from normal
 */

// ============================================
// TYPES
// ============================================

export interface Point {
  x: number;
  y: number;
}

// Normal ranges for spinal measurements
export interface NormalRange {
  min: number;
  max: number;
  unit: string;
  description: string;
}

// Classification of deviation severity
export type DeviationSeverity = 'normal' | 'mild' | 'moderate' | 'severe';

// Result of a spinal measurement
export interface SpinalMeasurementResult {
  value: number;
  unit: string;
  normalRange: NormalRange;
  deviation: number; // Deviation from normal midpoint
  deviationPercent: number; // Percentage deviation
  severity: DeviationSeverity;
  finding: string; // Clinical interpretation
  coordinates: Record<string, unknown>;
}

// Cobb angle input (two line segments on endplates)
export interface CobbAngleInput {
  // Superior endplate line
  superiorLine: {
    left: Point;
    right: Point;
    vertebralLevel: string; // e.g., "T5"
  };
  // Inferior endplate line
  inferiorLine: {
    left: Point;
    right: Point;
    vertebralLevel: string; // e.g., "L2"
  };
}

// Lordosis/kyphosis measurement input
export interface LordosisInput {
  // Superior vertebra endplate
  superiorEndplate: {
    anterior: Point;
    posterior: Point;
    vertebralLevel: string;
  };
  // Inferior vertebra endplate
  inferiorEndplate: {
    anterior: Point;
    posterior: Point;
    vertebralLevel: string;
  };
}

// Disc height input
export interface DiscHeightInput {
  level: string; // e.g., "L4-L5"
  // Anterior disc height points
  anteriorSuperior: Point;
  anteriorInferior: Point;
  // Posterior disc height points
  posteriorSuperior: Point;
  posteriorInferior: Point;
  // Adjacent level for comparison (optional)
  adjacentLevel?: {
    level: string;
    anteriorHeight: number;
    posteriorHeight: number;
  };
}

// Vertebral height input (for compression ratio)
export interface VertebralHeightInput {
  level: string; // e.g., "L1"
  anteriorHeight: {
    superior: Point;
    inferior: Point;
  };
  posteriorHeight: {
    superior: Point;
    inferior: Point;
  };
  // Reference vertebra for comparison (usually adjacent)
  referenceVertebra?: {
    level: string;
    anteriorHeight: number;
    posteriorHeight: number;
  };
}

// Atlas plane line input
export interface AtlasPlaneInput {
  // Lateral margins of the atlas (C1)
  leftLateralMass: Point;
  rightLateralMass: Point;
  // Occipital condyles for reference
  leftOccipitalCondyle?: Point;
  rightOccipitalCondyle?: Point;
  // Axis (C2) for alignment check
  axisOdontoid?: Point;
}

// ============================================
// NORMAL RANGES
// ============================================

/**
 * Evidence-based normal ranges for spinal measurements
 * References: Harrison et al., Spine 2000; Gore et al., Spine 1986
 */
export const NORMAL_RANGES: Record<string, NormalRange> = {
  // Cobb Angle (Scoliosis)
  cobbAngle: {
    min: 0,
    max: 10,
    unit: 'degrees',
    description: 'Cobb angle < 10° is considered normal/insignificant',
  },

  // Cervical Lordosis (C2-C7)
  cervicalLordosis: {
    min: 31,
    max: 40,
    unit: 'degrees',
    description: 'Normal cervical lordosis ranges from 31° to 40° (Absolute Rotation Angle method)',
  },

  // Lumbar Lordosis (L1-S1)
  lumbarLordosis: {
    min: 40,
    max: 60,
    unit: 'degrees',
    description: 'Normal lumbar lordosis ranges from 40° to 60° (Cobb method)',
  },

  // Thoracic Kyphosis (T1-T12)
  thoracicKyphosis: {
    min: 20,
    max: 40,
    unit: 'degrees',
    description: 'Normal thoracic kyphosis ranges from 20° to 40°',
  },

  // Disc Height Ratio (posterior/anterior)
  discHeightRatio: {
    min: 0.6,
    max: 0.8,
    unit: 'ratio',
    description: 'Normal posterior/anterior disc height ratio is 0.6-0.8',
  },

  // Cervical Disc Height (mm)
  cervicalDiscHeight: {
    min: 3,
    max: 7,
    unit: 'mm',
    description: 'Normal cervical disc height is 3-7mm',
  },

  // Lumbar Disc Height (mm)
  lumbarDiscHeight: {
    min: 8,
    max: 14,
    unit: 'mm',
    description: 'Normal lumbar disc height is 8-14mm',
  },

  // Vertebral Body Height Ratio (anterior/posterior)
  vertebralHeightRatio: {
    min: 0.85,
    max: 1.15,
    unit: 'ratio',
    description: 'Normal vertebral height ratio is 0.85-1.15 (>15% loss indicates compression)',
  },

  // Atlas Plane Angle
  atlasPlaneAngle: {
    min: -2,
    max: 2,
    unit: 'degrees',
    description: 'Atlas plane should be horizontal (within ±2° of horizontal)',
  },

  // Atlas Lateral Mass Offset
  atlasLateralOffset: {
    min: 0,
    max: 2,
    unit: 'mm',
    description: 'Lateral mass offset should be ≤2mm (Rule of Spence)',
  },
};

// ============================================
// CLASSIFICATION THRESHOLDS
// ============================================

/**
 * Scoliosis severity classification (SRS)
 */
export const SCOLIOSIS_CLASSIFICATION = {
  normal: { min: 0, max: 10, label: 'Normal/Postural' },
  mild: { min: 10, max: 25, label: 'Mild Scoliosis' },
  moderate: { min: 25, max: 40, label: 'Moderate Scoliosis' },
  severe: { min: 40, max: Infinity, label: 'Severe Scoliosis' },
};

/**
 * Lordosis/Kyphosis classification
 */
export const CURVATURE_CLASSIFICATION = {
  hypolordosis: { threshold: -20, label: 'Hypolordosis (decreased curve)' },
  normal: { label: 'Normal lordosis' },
  hyperlordosis: { threshold: 20, label: 'Hyperlordosis (increased curve)' },
};

/**
 * Disc degeneration grading based on height loss
 */
export const DISC_DEGENERATION_GRADES = {
  grade0: { percentLoss: 0, label: 'Normal disc height' },
  grade1: { percentLoss: 25, label: 'Mild height loss (<25%)' },
  grade2: { percentLoss: 50, label: 'Moderate height loss (25-50%)' },
  grade3: { percentLoss: 75, label: 'Severe height loss (50-75%)' },
  grade4: { percentLoss: 100, label: 'Complete collapse (>75%)' },
};

/**
 * Vertebral compression grading
 */
export const COMPRESSION_GRADES = {
  grade0: { percentLoss: 0, label: 'Normal vertebral height' },
  grade1: { percentLoss: 25, label: 'Mild compression (<25%)' },
  grade2: { percentLoss: 40, label: 'Moderate compression (25-40%)' },
  grade3: { percentLoss: Infinity, label: 'Severe compression (>40%)' },
};

// ============================================
// CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate distance between two points (in pixels)
 */
export function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Convert pixel distance to mm using pixel spacing
 * @param pixels Distance in pixels
 * @param pixelSpacing mm per pixel (from DICOM header or calibration)
 */
export function pixelsToMm(pixels: number, pixelSpacing: number = 0.3): number {
  return pixels * pixelSpacing;
}

/**
 * Calculate angle of a line from horizontal (in degrees)
 */
function lineAngleFromHorizontal(start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Calculate angle between two lines (perpendicular method for Cobb angle)
 */
function angleBetweenLines(line1Start: Point, line1End: Point, line2Start: Point, line2End: Point): number {
  const angle1 = lineAngleFromHorizontal(line1Start, line1End);
  const angle2 = lineAngleFromHorizontal(line2Start, line2End);

  let angle = Math.abs(angle1 - angle2);

  // Cobb angle is the acute angle
  if (angle > 90) {
    angle = 180 - angle;
  }

  return angle;
}

/**
 * Classify severity based on deviation from normal
 */
function classifyDeviation(value: number, normalRange: NormalRange): DeviationSeverity {
  const normalMid = (normalRange.min + normalRange.max) / 2;
  const normalSpan = (normalRange.max - normalRange.min) / 2;

  if (value >= normalRange.min && value <= normalRange.max) {
    return 'normal';
  }

  const deviationFromRange = value < normalRange.min ? normalRange.min - value : value - normalRange.max;

  const deviationPercent = (deviationFromRange / normalSpan) * 100;

  if (deviationPercent <= 50) return 'mild';
  if (deviationPercent <= 100) return 'moderate';
  return 'severe';
}

// ============================================
// MAIN MEASUREMENT FUNCTIONS
// ============================================

/**
 * Measure Cobb Angle for Scoliosis Assessment
 *
 * The Cobb angle is measured between:
 * - The superior endplate of the most tilted vertebra above the apex
 * - The inferior endplate of the most tilted vertebra below the apex
 *
 * @param input Superior and inferior endplate lines
 * @returns Measurement result with clinical interpretation
 */
export function measureCobbAngle(input: CobbAngleInput): SpinalMeasurementResult {
  const { superiorLine, inferiorLine } = input;

  // Calculate angle between the two endplate lines
  const cobbAngle = angleBetweenLines(superiorLine.left, superiorLine.right, inferiorLine.left, inferiorLine.right);

  const normalRange = NORMAL_RANGES.cobbAngle;
  const deviation = cobbAngle - (normalRange.min + normalRange.max) / 2;
  const deviationPercent = (Math.abs(deviation) / ((normalRange.max - normalRange.min) / 2)) * 100;

  // Classify scoliosis severity
  let severity: DeviationSeverity = 'normal';
  let finding = 'No significant scoliosis';

  if (cobbAngle >= SCOLIOSIS_CLASSIFICATION.severe.min) {
    severity = 'severe';
    finding = `${SCOLIOSIS_CLASSIFICATION.severe.label} (${superiorLine.vertebralLevel}-${inferiorLine.vertebralLevel}): Surgical consultation recommended`;
  } else if (cobbAngle >= SCOLIOSIS_CLASSIFICATION.moderate.min) {
    severity = 'moderate';
    finding = `${SCOLIOSIS_CLASSIFICATION.moderate.label} (${superiorLine.vertebralLevel}-${inferiorLine.vertebralLevel}): Bracing may be indicated`;
  } else if (cobbAngle >= SCOLIOSIS_CLASSIFICATION.mild.min) {
    severity = 'mild';
    finding = `${SCOLIOSIS_CLASSIFICATION.mild.label} (${superiorLine.vertebralLevel}-${inferiorLine.vertebralLevel}): Observation recommended`;
  }

  return {
    value: Math.round(cobbAngle * 10) / 10,
    unit: 'degrees',
    normalRange,
    deviation: Math.round(deviation * 10) / 10,
    deviationPercent: Math.round(deviationPercent),
    severity,
    finding,
    coordinates: {
      type: 'cobbAngle',
      superiorLine: {
        left: superiorLine.left,
        right: superiorLine.right,
        level: superiorLine.vertebralLevel,
      },
      inferiorLine: {
        left: inferiorLine.left,
        right: inferiorLine.right,
        level: inferiorLine.vertebralLevel,
      },
    },
  };
}

/**
 * Measure Cervical Lordosis Angle (C2-C7)
 *
 * Uses the Cobb method (posterior tangent method):
 * - Line along inferior endplate of C2
 * - Line along inferior endplate of C7
 *
 * @param input Lordosis measurement input
 * @returns Measurement result with clinical interpretation
 */
export function measureCervicalLordosis(input: LordosisInput): SpinalMeasurementResult {
  const { superiorEndplate, inferiorEndplate } = input;

  // Calculate angle using Cobb method
  const lordosisAngle = angleBetweenLines(
    superiorEndplate.anterior,
    superiorEndplate.posterior,
    inferiorEndplate.anterior,
    inferiorEndplate.posterior
  );

  const normalRange = NORMAL_RANGES.cervicalLordosis;
  const normalMid = (normalRange.min + normalRange.max) / 2;
  const deviation = lordosisAngle - normalMid;
  const deviationPercent = (Math.abs(deviation) / ((normalRange.max - normalRange.min) / 2)) * 100;
  const severity = classifyDeviation(lordosisAngle, normalRange);

  // Generate clinical finding
  let finding: string;
  if (lordosisAngle < normalRange.min) {
    const deficit = normalRange.min - lordosisAngle;
    if (deficit > 20) {
      finding = `Significant loss of cervical lordosis (${Math.round(lordosisAngle)}°): Consider cervical kyphosis. May indicate degenerative changes or muscular imbalance`;
    } else {
      finding = `Reduced cervical lordosis (${Math.round(lordosisAngle)}°): Mild straightening of normal curve. Monitor for progression`;
    }
  } else if (lordosisAngle > normalRange.max) {
    finding = `Hyperlordosis (${Math.round(lordosisAngle)}°): Excessive cervical curve. May be compensatory for thoracic kyphosis`;
  } else {
    finding = `Normal cervical lordosis (${Math.round(lordosisAngle)}°): Within expected range of ${normalRange.min}°-${normalRange.max}°`;
  }

  return {
    value: Math.round(lordosisAngle * 10) / 10,
    unit: 'degrees',
    normalRange,
    deviation: Math.round(deviation * 10) / 10,
    deviationPercent: Math.round(deviationPercent),
    severity,
    finding,
    coordinates: {
      type: 'cervicalLordosis',
      superiorEndplate: {
        anterior: superiorEndplate.anterior,
        posterior: superiorEndplate.posterior,
        level: superiorEndplate.vertebralLevel,
      },
      inferiorEndplate: {
        anterior: inferiorEndplate.anterior,
        posterior: inferiorEndplate.posterior,
        level: inferiorEndplate.vertebralLevel,
      },
    },
  };
}

/**
 * Measure Lumbar Lordosis Angle (L1-S1)
 *
 * Uses the Cobb method:
 * - Line along superior endplate of L1
 * - Line along superior endplate of S1
 *
 * @param input Lordosis measurement input
 * @returns Measurement result with clinical interpretation
 */
export function measureLumbarLordosis(input: LordosisInput): SpinalMeasurementResult {
  const { superiorEndplate, inferiorEndplate } = input;

  // Calculate angle using Cobb method
  const lordosisAngle = angleBetweenLines(
    superiorEndplate.anterior,
    superiorEndplate.posterior,
    inferiorEndplate.anterior,
    inferiorEndplate.posterior
  );

  const normalRange = NORMAL_RANGES.lumbarLordosis;
  const normalMid = (normalRange.min + normalRange.max) / 2;
  const deviation = lordosisAngle - normalMid;
  const deviationPercent = (Math.abs(deviation) / ((normalRange.max - normalRange.min) / 2)) * 100;
  const severity = classifyDeviation(lordosisAngle, normalRange);

  // Generate clinical finding
  let finding: string;
  if (lordosisAngle < normalRange.min) {
    const deficit = normalRange.min - lordosisAngle;
    if (deficit > 15) {
      finding = `Significant lumbar hypolordosis (${Math.round(lordosisAngle)}°): Flat back posture. May contribute to sagittal imbalance`;
    } else {
      finding = `Reduced lumbar lordosis (${Math.round(lordosisAngle)}°): Below normal range. Consider muscular or degenerative etiology`;
    }
  } else if (lordosisAngle > normalRange.max) {
    finding = `Lumbar hyperlordosis (${Math.round(lordosisAngle)}°): Excessive curve. May cause facet joint stress and foraminal stenosis`;
  } else {
    finding = `Normal lumbar lordosis (${Math.round(lordosisAngle)}°): Within expected range of ${normalRange.min}°-${normalRange.max}°`;
  }

  return {
    value: Math.round(lordosisAngle * 10) / 10,
    unit: 'degrees',
    normalRange,
    deviation: Math.round(deviation * 10) / 10,
    deviationPercent: Math.round(deviationPercent),
    severity,
    finding,
    coordinates: {
      type: 'lumbarLordosis',
      superiorEndplate: {
        anterior: superiorEndplate.anterior,
        posterior: superiorEndplate.posterior,
        level: superiorEndplate.vertebralLevel,
      },
      inferiorEndplate: {
        anterior: inferiorEndplate.anterior,
        posterior: inferiorEndplate.posterior,
        level: inferiorEndplate.vertebralLevel,
      },
    },
  };
}

/**
 * Measure Disc Space Height
 *
 * Measures anterior and posterior disc heights, calculates ratio
 * Compares to adjacent levels if provided
 *
 * @param input Disc height input
 * @param pixelSpacing mm per pixel for conversion
 * @returns Measurement result with clinical interpretation
 */
export function measureDiscHeight(input: DiscHeightInput, pixelSpacing: number = 0.3): SpinalMeasurementResult {
  // Calculate anterior height (in pixels then convert to mm)
  const anteriorHeightPx = calculateDistance(input.anteriorSuperior, input.anteriorInferior);
  const anteriorHeightMm = pixelsToMm(anteriorHeightPx, pixelSpacing);

  // Calculate posterior height
  const posteriorHeightPx = calculateDistance(input.posteriorSuperior, input.posteriorInferior);
  const posteriorHeightMm = pixelsToMm(posteriorHeightPx, pixelSpacing);

  // Average disc height
  const avgHeightMm = (anteriorHeightMm + posteriorHeightMm) / 2;

  // Posterior/anterior ratio
  const heightRatio = posteriorHeightMm / anteriorHeightMm;

  // Determine if cervical or lumbar based on level prefix
  const isCervical = input.level.startsWith('C');
  const normalRange = isCervical ? NORMAL_RANGES.cervicalDiscHeight : NORMAL_RANGES.lumbarDiscHeight;

  const normalMid = (normalRange.min + normalRange.max) / 2;
  const deviation = avgHeightMm - normalMid;
  const deviationPercent = (Math.abs(deviation) / normalMid) * 100;
  const severity = classifyDeviation(avgHeightMm, normalRange);

  // Calculate height loss if adjacent level provided
  let heightLossPercent = 0;
  let adjacentComparison = '';
  if (input.adjacentLevel) {
    const adjacentAvg = (input.adjacentLevel.anteriorHeight + input.adjacentLevel.posteriorHeight) / 2;
    heightLossPercent = ((adjacentAvg - avgHeightMm) / adjacentAvg) * 100;
    if (heightLossPercent > 0) {
      adjacentComparison = ` ${Math.round(heightLossPercent)}% height loss compared to ${input.adjacentLevel.level}.`;
    }
  }

  // Classify disc degeneration
  let finding: string;
  if (avgHeightMm < normalRange.min) {
    if (heightLossPercent >= 50) {
      finding = `Severe disc height loss at ${input.level} (${avgHeightMm.toFixed(1)}mm).${adjacentComparison} Grade III-IV disc degeneration`;
    } else if (heightLossPercent >= 25) {
      finding = `Moderate disc height loss at ${input.level} (${avgHeightMm.toFixed(1)}mm).${adjacentComparison} Grade II disc degeneration`;
    } else {
      finding = `Mild disc height loss at ${input.level} (${avgHeightMm.toFixed(1)}mm).${adjacentComparison} Early degenerative changes`;
    }
  } else {
    finding = `Normal disc height at ${input.level} (${avgHeightMm.toFixed(1)}mm). Anterior: ${anteriorHeightMm.toFixed(1)}mm, Posterior: ${posteriorHeightMm.toFixed(1)}mm`;
  }

  return {
    value: Math.round(avgHeightMm * 10) / 10,
    unit: 'mm',
    normalRange,
    deviation: Math.round(deviation * 10) / 10,
    deviationPercent: Math.round(deviationPercent),
    severity,
    finding,
    coordinates: {
      type: 'discHeight',
      level: input.level,
      anteriorSuperior: input.anteriorSuperior,
      anteriorInferior: input.anteriorInferior,
      posteriorSuperior: input.posteriorSuperior,
      posteriorInferior: input.posteriorInferior,
      measurements: {
        anteriorHeight: Math.round(anteriorHeightMm * 10) / 10,
        posteriorHeight: Math.round(posteriorHeightMm * 10) / 10,
        ratio: Math.round(heightRatio * 100) / 100,
      },
    },
  };
}

/**
 * Measure Vertebral Body Height Ratio
 *
 * Compares anterior and posterior heights of a vertebra
 * Used to detect compression fractures
 *
 * @param input Vertebral height input
 * @param pixelSpacing mm per pixel for conversion
 * @returns Measurement result with clinical interpretation
 */
export function measureVertebralHeightRatio(
  input: VertebralHeightInput,
  pixelSpacing: number = 0.3
): SpinalMeasurementResult {
  // Calculate heights in pixels then convert to mm
  const anteriorHeightPx = calculateDistance(input.anteriorHeight.superior, input.anteriorHeight.inferior);
  const anteriorHeightMm = pixelsToMm(anteriorHeightPx, pixelSpacing);

  const posteriorHeightPx = calculateDistance(input.posteriorHeight.superior, input.posteriorHeight.inferior);
  const posteriorHeightMm = pixelsToMm(posteriorHeightPx, pixelSpacing);

  // Calculate anterior/posterior ratio
  const heightRatio = anteriorHeightMm / posteriorHeightMm;

  const normalRange = NORMAL_RANGES.vertebralHeightRatio;
  const normalMid = (normalRange.min + normalRange.max) / 2;
  const deviation = heightRatio - normalMid;
  const deviationPercent = ((1 - heightRatio) * 100); // Height loss percent
  const severity = classifyDeviation(heightRatio, normalRange);

  // Calculate height loss compared to reference if provided
  let referenceComparison = '';
  let compressionPercent = 0;
  if (input.referenceVertebra) {
    const refAnterior = input.referenceVertebra.anteriorHeight;
    compressionPercent = ((refAnterior - anteriorHeightMm) / refAnterior) * 100;
    if (compressionPercent > 15) {
      referenceComparison = ` ${Math.round(compressionPercent)}% height loss compared to ${input.referenceVertebra.level}.`;
    }
  }

  // Classify compression fracture severity
  let finding: string;
  if (heightRatio < 0.75 || compressionPercent > 40) {
    finding = `Severe vertebral compression at ${input.level} (ratio: ${heightRatio.toFixed(2)}).${referenceComparison} Grade 3 compression fracture`;
  } else if (heightRatio < 0.85 || compressionPercent > 25) {
    finding = `Moderate vertebral compression at ${input.level} (ratio: ${heightRatio.toFixed(2)}).${referenceComparison} Grade 2 compression`;
  } else if (heightRatio < 0.90 || compressionPercent > 15) {
    finding = `Mild anterior wedging at ${input.level} (ratio: ${heightRatio.toFixed(2)}).${referenceComparison} Grade 1 compression or normal variant`;
  } else {
    finding = `Normal vertebral body height at ${input.level} (ratio: ${heightRatio.toFixed(2)}). Anterior: ${anteriorHeightMm.toFixed(1)}mm, Posterior: ${posteriorHeightMm.toFixed(1)}mm`;
  }

  return {
    value: Math.round(heightRatio * 100) / 100,
    unit: 'ratio',
    normalRange,
    deviation: Math.round(deviation * 100) / 100,
    deviationPercent: Math.round(deviationPercent),
    severity,
    finding,
    coordinates: {
      type: 'vertebralHeight',
      level: input.level,
      anteriorHeight: {
        superior: input.anteriorHeight.superior,
        inferior: input.anteriorHeight.inferior,
      },
      posteriorHeight: {
        superior: input.posteriorHeight.superior,
        inferior: input.posteriorHeight.inferior,
      },
      measurements: {
        anteriorHeightMm: Math.round(anteriorHeightMm * 10) / 10,
        posteriorHeightMm: Math.round(posteriorHeightMm * 10) / 10,
        ratio: Math.round(heightRatio * 100) / 100,
      },
    },
  };
}

/**
 * Measure Atlas Plane Line
 *
 * Assesses the horizontal alignment of C1 (atlas)
 * Important for upper cervical analysis
 *
 * @param input Atlas plane input
 * @returns Measurement result with clinical interpretation
 */
export function measureAtlasPlane(input: AtlasPlaneInput): SpinalMeasurementResult {
  // Calculate angle of atlas plane from horizontal
  const atlasAngle = lineAngleFromHorizontal(input.leftLateralMass, input.rightLateralMass);

  // Normalize angle to be relative to horizontal (0 degrees)
  const normalizedAngle = atlasAngle > 90 ? atlasAngle - 180 : atlasAngle < -90 ? atlasAngle + 180 : atlasAngle;

  const normalRange = NORMAL_RANGES.atlasPlaneAngle;
  const deviation = normalizedAngle - 0; // Deviation from horizontal
  const deviationPercent = (Math.abs(normalizedAngle) / 5) * 100; // 5 degrees = 100% deviation
  const severity = classifyDeviation(normalizedAngle, { ...normalRange, min: -normalRange.max, max: normalRange.max });

  // Calculate lateral mass offset if axis odontoid provided
  let lateralOffset = 0;
  let offsetFinding = '';
  if (input.axisOdontoid) {
    const atlasMidpoint = {
      x: (input.leftLateralMass.x + input.rightLateralMass.x) / 2,
      y: (input.leftLateralMass.y + input.rightLateralMass.y) / 2,
    };
    lateralOffset = Math.abs(atlasMidpoint.x - input.axisOdontoid.x);
    if (lateralOffset > 2) {
      offsetFinding = ` Lateral mass offset: ${lateralOffset.toFixed(1)}mm (>2mm suggests atlantoaxial instability).`;
    }
  }

  // Generate finding
  let finding: string;
  if (Math.abs(normalizedAngle) > 5) {
    finding = `Significant atlas tilt (${normalizedAngle.toFixed(1)}°): Upper cervical dysfunction present. Consider atlas adjustment.${offsetFinding}`;
  } else if (Math.abs(normalizedAngle) > 2) {
    finding = `Mild atlas tilt (${normalizedAngle.toFixed(1)}°): Minor upper cervical misalignment.${offsetFinding}`;
  } else {
    finding = `Atlas plane within normal limits (${normalizedAngle.toFixed(1)}°): Good upper cervical alignment.${offsetFinding}`;
  }

  return {
    value: Math.round(normalizedAngle * 10) / 10,
    unit: 'degrees',
    normalRange,
    deviation: Math.round(deviation * 10) / 10,
    deviationPercent: Math.round(deviationPercent),
    severity,
    finding,
    coordinates: {
      type: 'atlasPlane',
      leftLateralMass: input.leftLateralMass,
      rightLateralMass: input.rightLateralMass,
      leftOccipitalCondyle: input.leftOccipitalCondyle,
      rightOccipitalCondyle: input.rightOccipitalCondyle,
      axisOdontoid: input.axisOdontoid,
      measurements: {
        planeAngle: Math.round(normalizedAngle * 10) / 10,
        lateralOffset: Math.round(lateralOffset * 10) / 10,
      },
    },
  };
}

// ============================================
// EXPORT ALL
// ============================================

export const SpinalMeasurements = {
  measureCobbAngle,
  measureCervicalLordosis,
  measureLumbarLordosis,
  measureDiscHeight,
  measureVertebralHeightRatio,
  measureAtlasPlane,
  // Utility functions
  calculateDistance,
  pixelsToMm,
  // Constants
  NORMAL_RANGES,
  SCOLIOSIS_CLASSIFICATION,
  CURVATURE_CLASSIFICATION,
  DISC_DEGENERATION_GRADES,
  COMPRESSION_GRADES,
};
