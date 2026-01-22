/**
 * Range of Motion Analysis Service
 *
 * Provides normal range reference values, calculations, and analysis
 * for all spinal regions and extremity joints used in chiropractic assessments.
 */

// ============================================
// TYPES
// ============================================

export type ROMJointType =
  // Cervical spine
  | 'CERVICAL_FLEXION'
  | 'CERVICAL_EXTENSION'
  | 'CERVICAL_LATERAL_LEFT'
  | 'CERVICAL_LATERAL_RIGHT'
  | 'CERVICAL_ROTATION_LEFT'
  | 'CERVICAL_ROTATION_RIGHT'
  // Thoracic spine
  | 'THORACIC_FLEXION'
  | 'THORACIC_EXTENSION'
  | 'THORACIC_ROTATION_LEFT'
  | 'THORACIC_ROTATION_RIGHT'
  // Lumbar spine
  | 'LUMBAR_FLEXION'
  | 'LUMBAR_EXTENSION'
  | 'LUMBAR_LATERAL_LEFT'
  | 'LUMBAR_LATERAL_RIGHT'
  // Shoulder
  | 'SHOULDER_FLEXION'
  | 'SHOULDER_EXTENSION'
  | 'SHOULDER_ABDUCTION'
  | 'SHOULDER_ADDUCTION'
  | 'SHOULDER_INTERNAL_ROTATION'
  | 'SHOULDER_EXTERNAL_ROTATION'
  // Elbow
  | 'ELBOW_FLEXION'
  | 'ELBOW_EXTENSION'
  // Hip
  | 'HIP_FLEXION'
  | 'HIP_EXTENSION'
  | 'HIP_ABDUCTION'
  | 'HIP_ADDUCTION'
  | 'HIP_INTERNAL_ROTATION'
  | 'HIP_EXTERNAL_ROTATION'
  // Knee
  | 'KNEE_FLEXION'
  | 'KNEE_EXTENSION'
  // Ankle
  | 'ANKLE_DORSIFLEXION'
  | 'ANKLE_PLANTARFLEXION'
  | 'ANKLE_INVERSION'
  | 'ANKLE_EVERSION';

export type JointRegion = 'cervical' | 'thoracic' | 'lumbar' | 'shoulder' | 'elbow' | 'hip' | 'knee' | 'ankle';

export interface ROMDefinition {
  name: string;
  movement: string;
  region: JointRegion;
  normalDegrees: number;
  minNormal: number;
  maxNormal: number;
  unit: string;
  description: string;
  testPosition: string;
  bilateralRequired: boolean;
}

export interface ROMComparison {
  joint: ROMJointType;
  side: string | null;
  previousDegrees: number;
  currentDegrees: number;
  change: number;
  changePercent: number;
  percentOfNormal: number;
  previousPercentOfNormal: number;
  improvement: 'improved' | 'declined' | 'stable';
  previousDate: Date;
  currentDate: Date;
}

export interface ROMSummary {
  totalMeasurements: number;
  restrictedCount: number;
  normalCount: number;
  averagePercentOfNormal: number;
  mostRestricted: {
    joint: ROMJointType;
    side: string | null;
    percentOfNormal: number;
    degrees: number;
  } | null;
  byRegion: Record<JointRegion, {
    measurementCount: number;
    restrictedCount: number;
    averagePercentOfNormal: number;
  }>;
}

// ============================================
// NORMAL RANGE REFERENCE VALUES
// ============================================

/**
 * Normal range of motion values based on AMA Guides to the Evaluation
 * of Permanent Impairment and standard clinical references.
 *
 * Values represent typical healthy adult ranges.
 */
export const ROM_DEFINITIONS: Record<ROMJointType, ROMDefinition> = {
  // ============================================
  // CERVICAL SPINE
  // ============================================
  CERVICAL_FLEXION: {
    name: 'Cervical Flexion',
    movement: 'Flexion',
    region: 'cervical',
    normalDegrees: 45,
    minNormal: 40,
    maxNormal: 50,
    unit: 'degrees',
    description: 'Chin to chest movement',
    testPosition: 'Seated or standing, neutral spine',
    bilateralRequired: false,
  },
  CERVICAL_EXTENSION: {
    name: 'Cervical Extension',
    movement: 'Extension',
    region: 'cervical',
    normalDegrees: 45,
    minNormal: 40,
    maxNormal: 55,
    unit: 'degrees',
    description: 'Looking up toward ceiling',
    testPosition: 'Seated or standing, neutral spine',
    bilateralRequired: false,
  },
  CERVICAL_LATERAL_LEFT: {
    name: 'Cervical Lateral Flexion (Left)',
    movement: 'Lateral Flexion',
    region: 'cervical',
    normalDegrees: 45,
    minNormal: 40,
    maxNormal: 50,
    unit: 'degrees',
    description: 'Ear toward left shoulder',
    testPosition: 'Seated or standing, neutral spine',
    bilateralRequired: true,
  },
  CERVICAL_LATERAL_RIGHT: {
    name: 'Cervical Lateral Flexion (Right)',
    movement: 'Lateral Flexion',
    region: 'cervical',
    normalDegrees: 45,
    minNormal: 40,
    maxNormal: 50,
    unit: 'degrees',
    description: 'Ear toward right shoulder',
    testPosition: 'Seated or standing, neutral spine',
    bilateralRequired: true,
  },
  CERVICAL_ROTATION_LEFT: {
    name: 'Cervical Rotation (Left)',
    movement: 'Rotation',
    region: 'cervical',
    normalDegrees: 80,
    minNormal: 70,
    maxNormal: 90,
    unit: 'degrees',
    description: 'Turn head to left',
    testPosition: 'Seated or standing, neutral spine',
    bilateralRequired: true,
  },
  CERVICAL_ROTATION_RIGHT: {
    name: 'Cervical Rotation (Right)',
    movement: 'Rotation',
    region: 'cervical',
    normalDegrees: 80,
    minNormal: 70,
    maxNormal: 90,
    unit: 'degrees',
    description: 'Turn head to right',
    testPosition: 'Seated or standing, neutral spine',
    bilateralRequired: true,
  },

  // ============================================
  // THORACIC SPINE
  // ============================================
  THORACIC_FLEXION: {
    name: 'Thoracic Flexion',
    movement: 'Flexion',
    region: 'thoracic',
    normalDegrees: 45,
    minNormal: 35,
    maxNormal: 50,
    unit: 'degrees',
    description: 'Forward bending of upper back',
    testPosition: 'Seated, lumbar stabilized',
    bilateralRequired: false,
  },
  THORACIC_EXTENSION: {
    name: 'Thoracic Extension',
    movement: 'Extension',
    region: 'thoracic',
    normalDegrees: 20,
    minNormal: 15,
    maxNormal: 25,
    unit: 'degrees',
    description: 'Backward bending of upper back',
    testPosition: 'Seated or prone, lumbar stabilized',
    bilateralRequired: false,
  },
  THORACIC_ROTATION_LEFT: {
    name: 'Thoracic Rotation (Left)',
    movement: 'Rotation',
    region: 'thoracic',
    normalDegrees: 30,
    minNormal: 25,
    maxNormal: 35,
    unit: 'degrees',
    description: 'Upper body rotation to left',
    testPosition: 'Seated, pelvis stabilized',
    bilateralRequired: true,
  },
  THORACIC_ROTATION_RIGHT: {
    name: 'Thoracic Rotation (Right)',
    movement: 'Rotation',
    region: 'thoracic',
    normalDegrees: 30,
    minNormal: 25,
    maxNormal: 35,
    unit: 'degrees',
    description: 'Upper body rotation to right',
    testPosition: 'Seated, pelvis stabilized',
    bilateralRequired: true,
  },

  // ============================================
  // LUMBAR SPINE
  // ============================================
  LUMBAR_FLEXION: {
    name: 'Lumbar Flexion',
    movement: 'Flexion',
    region: 'lumbar',
    normalDegrees: 60,
    minNormal: 50,
    maxNormal: 70,
    unit: 'degrees',
    description: 'Forward bending from hips',
    testPosition: 'Standing, knees straight',
    bilateralRequired: false,
  },
  LUMBAR_EXTENSION: {
    name: 'Lumbar Extension',
    movement: 'Extension',
    region: 'lumbar',
    normalDegrees: 25,
    minNormal: 20,
    maxNormal: 30,
    unit: 'degrees',
    description: 'Backward bending',
    testPosition: 'Standing, pelvis stabilized',
    bilateralRequired: false,
  },
  LUMBAR_LATERAL_LEFT: {
    name: 'Lumbar Lateral Flexion (Left)',
    movement: 'Lateral Flexion',
    region: 'lumbar',
    normalDegrees: 25,
    minNormal: 20,
    maxNormal: 30,
    unit: 'degrees',
    description: 'Side bending to left',
    testPosition: 'Standing, knees straight',
    bilateralRequired: true,
  },
  LUMBAR_LATERAL_RIGHT: {
    name: 'Lumbar Lateral Flexion (Right)',
    movement: 'Lateral Flexion',
    region: 'lumbar',
    normalDegrees: 25,
    minNormal: 20,
    maxNormal: 30,
    unit: 'degrees',
    description: 'Side bending to right',
    testPosition: 'Standing, knees straight',
    bilateralRequired: true,
  },

  // ============================================
  // SHOULDER
  // ============================================
  SHOULDER_FLEXION: {
    name: 'Shoulder Flexion',
    movement: 'Flexion',
    region: 'shoulder',
    normalDegrees: 180,
    minNormal: 165,
    maxNormal: 180,
    unit: 'degrees',
    description: 'Arm raised forward and overhead',
    testPosition: 'Standing or supine, arm at side',
    bilateralRequired: true,
  },
  SHOULDER_EXTENSION: {
    name: 'Shoulder Extension',
    movement: 'Extension',
    region: 'shoulder',
    normalDegrees: 60,
    minNormal: 50,
    maxNormal: 65,
    unit: 'degrees',
    description: 'Arm moved backward',
    testPosition: 'Standing or prone, arm at side',
    bilateralRequired: true,
  },
  SHOULDER_ABDUCTION: {
    name: 'Shoulder Abduction',
    movement: 'Abduction',
    region: 'shoulder',
    normalDegrees: 180,
    minNormal: 165,
    maxNormal: 180,
    unit: 'degrees',
    description: 'Arm raised sideways and overhead',
    testPosition: 'Standing or supine, arm at side',
    bilateralRequired: true,
  },
  SHOULDER_ADDUCTION: {
    name: 'Shoulder Adduction',
    movement: 'Adduction',
    region: 'shoulder',
    normalDegrees: 50,
    minNormal: 40,
    maxNormal: 55,
    unit: 'degrees',
    description: 'Arm moved across body',
    testPosition: 'Standing or supine',
    bilateralRequired: true,
  },
  SHOULDER_INTERNAL_ROTATION: {
    name: 'Shoulder Internal Rotation',
    movement: 'Internal Rotation',
    region: 'shoulder',
    normalDegrees: 70,
    minNormal: 60,
    maxNormal: 80,
    unit: 'degrees',
    description: 'Arm rotated inward',
    testPosition: 'Supine, shoulder abducted 90°',
    bilateralRequired: true,
  },
  SHOULDER_EXTERNAL_ROTATION: {
    name: 'Shoulder External Rotation',
    movement: 'External Rotation',
    region: 'shoulder',
    normalDegrees: 90,
    minNormal: 80,
    maxNormal: 100,
    unit: 'degrees',
    description: 'Arm rotated outward',
    testPosition: 'Supine, shoulder abducted 90°',
    bilateralRequired: true,
  },

  // ============================================
  // ELBOW
  // ============================================
  ELBOW_FLEXION: {
    name: 'Elbow Flexion',
    movement: 'Flexion',
    region: 'elbow',
    normalDegrees: 145,
    minNormal: 135,
    maxNormal: 150,
    unit: 'degrees',
    description: 'Bending elbow to bring hand toward shoulder',
    testPosition: 'Seated or standing, arm at side',
    bilateralRequired: true,
  },
  ELBOW_EXTENSION: {
    name: 'Elbow Extension',
    movement: 'Extension',
    region: 'elbow',
    normalDegrees: 0,
    minNormal: -5,
    maxNormal: 5,
    unit: 'degrees',
    description: 'Straightening elbow fully',
    testPosition: 'Seated or standing, arm at side',
    bilateralRequired: true,
  },

  // ============================================
  // HIP
  // ============================================
  HIP_FLEXION: {
    name: 'Hip Flexion',
    movement: 'Flexion',
    region: 'hip',
    normalDegrees: 120,
    minNormal: 110,
    maxNormal: 130,
    unit: 'degrees',
    description: 'Knee brought toward chest',
    testPosition: 'Supine, opposite leg straight',
    bilateralRequired: true,
  },
  HIP_EXTENSION: {
    name: 'Hip Extension',
    movement: 'Extension',
    region: 'hip',
    normalDegrees: 30,
    minNormal: 20,
    maxNormal: 35,
    unit: 'degrees',
    description: 'Leg moved backward',
    testPosition: 'Prone or standing',
    bilateralRequired: true,
  },
  HIP_ABDUCTION: {
    name: 'Hip Abduction',
    movement: 'Abduction',
    region: 'hip',
    normalDegrees: 45,
    minNormal: 40,
    maxNormal: 50,
    unit: 'degrees',
    description: 'Leg moved away from midline',
    testPosition: 'Supine, leg straight',
    bilateralRequired: true,
  },
  HIP_ADDUCTION: {
    name: 'Hip Adduction',
    movement: 'Adduction',
    region: 'hip',
    normalDegrees: 30,
    minNormal: 25,
    maxNormal: 35,
    unit: 'degrees',
    description: 'Leg moved toward and across midline',
    testPosition: 'Supine, leg straight',
    bilateralRequired: true,
  },
  HIP_INTERNAL_ROTATION: {
    name: 'Hip Internal Rotation',
    movement: 'Internal Rotation',
    region: 'hip',
    normalDegrees: 35,
    minNormal: 30,
    maxNormal: 45,
    unit: 'degrees',
    description: 'Leg rotated inward',
    testPosition: 'Seated or prone, knee flexed 90°',
    bilateralRequired: true,
  },
  HIP_EXTERNAL_ROTATION: {
    name: 'Hip External Rotation',
    movement: 'External Rotation',
    region: 'hip',
    normalDegrees: 45,
    minNormal: 40,
    maxNormal: 60,
    unit: 'degrees',
    description: 'Leg rotated outward',
    testPosition: 'Seated or prone, knee flexed 90°',
    bilateralRequired: true,
  },

  // ============================================
  // KNEE
  // ============================================
  KNEE_FLEXION: {
    name: 'Knee Flexion',
    movement: 'Flexion',
    region: 'knee',
    normalDegrees: 135,
    minNormal: 130,
    maxNormal: 145,
    unit: 'degrees',
    description: 'Bending knee to bring heel toward buttock',
    testPosition: 'Prone or supine',
    bilateralRequired: true,
  },
  KNEE_EXTENSION: {
    name: 'Knee Extension',
    movement: 'Extension',
    region: 'knee',
    normalDegrees: 0,
    minNormal: -5,
    maxNormal: 5,
    unit: 'degrees',
    description: 'Straightening knee fully',
    testPosition: 'Supine, leg straight',
    bilateralRequired: true,
  },

  // ============================================
  // ANKLE
  // ============================================
  ANKLE_DORSIFLEXION: {
    name: 'Ankle Dorsiflexion',
    movement: 'Dorsiflexion',
    region: 'ankle',
    normalDegrees: 20,
    minNormal: 15,
    maxNormal: 25,
    unit: 'degrees',
    description: 'Toes pulled toward shin',
    testPosition: 'Seated or supine, knee flexed',
    bilateralRequired: true,
  },
  ANKLE_PLANTARFLEXION: {
    name: 'Ankle Plantarflexion',
    movement: 'Plantarflexion',
    region: 'ankle',
    normalDegrees: 50,
    minNormal: 45,
    maxNormal: 55,
    unit: 'degrees',
    description: 'Pointing toes downward',
    testPosition: 'Seated or supine',
    bilateralRequired: true,
  },
  ANKLE_INVERSION: {
    name: 'Ankle Inversion',
    movement: 'Inversion',
    region: 'ankle',
    normalDegrees: 35,
    minNormal: 30,
    maxNormal: 40,
    unit: 'degrees',
    description: 'Sole of foot turned inward',
    testPosition: 'Seated, foot hanging freely',
    bilateralRequired: true,
  },
  ANKLE_EVERSION: {
    name: 'Ankle Eversion',
    movement: 'Eversion',
    region: 'ankle',
    normalDegrees: 15,
    minNormal: 10,
    maxNormal: 20,
    unit: 'degrees',
    description: 'Sole of foot turned outward',
    testPosition: 'Seated, foot hanging freely',
    bilateralRequired: true,
  },
};

// ============================================
// JOINT REGION GROUPINGS
// ============================================

export const ROM_REGIONS: Record<JointRegion, {
  name: string;
  description: string;
  joints: ROMJointType[];
}> = {
  cervical: {
    name: 'Cervical Spine',
    description: 'Neck movements',
    joints: [
      'CERVICAL_FLEXION',
      'CERVICAL_EXTENSION',
      'CERVICAL_LATERAL_LEFT',
      'CERVICAL_LATERAL_RIGHT',
      'CERVICAL_ROTATION_LEFT',
      'CERVICAL_ROTATION_RIGHT',
    ],
  },
  thoracic: {
    name: 'Thoracic Spine',
    description: 'Upper and mid back movements',
    joints: [
      'THORACIC_FLEXION',
      'THORACIC_EXTENSION',
      'THORACIC_ROTATION_LEFT',
      'THORACIC_ROTATION_RIGHT',
    ],
  },
  lumbar: {
    name: 'Lumbar Spine',
    description: 'Lower back movements',
    joints: [
      'LUMBAR_FLEXION',
      'LUMBAR_EXTENSION',
      'LUMBAR_LATERAL_LEFT',
      'LUMBAR_LATERAL_RIGHT',
    ],
  },
  shoulder: {
    name: 'Shoulder',
    description: 'Shoulder joint movements',
    joints: [
      'SHOULDER_FLEXION',
      'SHOULDER_EXTENSION',
      'SHOULDER_ABDUCTION',
      'SHOULDER_ADDUCTION',
      'SHOULDER_INTERNAL_ROTATION',
      'SHOULDER_EXTERNAL_ROTATION',
    ],
  },
  elbow: {
    name: 'Elbow',
    description: 'Elbow joint movements',
    joints: ['ELBOW_FLEXION', 'ELBOW_EXTENSION'],
  },
  hip: {
    name: 'Hip',
    description: 'Hip joint movements',
    joints: [
      'HIP_FLEXION',
      'HIP_EXTENSION',
      'HIP_ABDUCTION',
      'HIP_ADDUCTION',
      'HIP_INTERNAL_ROTATION',
      'HIP_EXTERNAL_ROTATION',
    ],
  },
  knee: {
    name: 'Knee',
    description: 'Knee joint movements',
    joints: ['KNEE_FLEXION', 'KNEE_EXTENSION'],
  },
  ankle: {
    name: 'Ankle',
    description: 'Ankle joint movements',
    joints: [
      'ANKLE_DORSIFLEXION',
      'ANKLE_PLANTARFLEXION',
      'ANKLE_INVERSION',
      'ANKLE_EVERSION',
    ],
  },
};

// ============================================
// CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate percentage of normal ROM
 */
export function calculatePercentOfNormal(degrees: number, normalDegrees: number): number {
  if (normalDegrees === 0) return 100; // Avoid division by zero for extension movements
  return Math.round((degrees / normalDegrees) * 100);
}

/**
 * Determine if ROM is restricted
 */
export function isRestricted(degrees: number, joint: ROMJointType): boolean {
  const definition = ROM_DEFINITIONS[joint];
  if (!definition) return false;

  // For extension movements (normal is 0), check against minNormal
  if (definition.normalDegrees === 0) {
    return degrees > definition.maxNormal || degrees < definition.minNormal;
  }

  // For other movements, check if below minimum normal
  return degrees < definition.minNormal;
}

/**
 * Get restriction severity
 */
export function getRestrictionSeverity(
  degrees: number,
  joint: ROMJointType
): 'normal' | 'mild' | 'moderate' | 'severe' {
  const definition = ROM_DEFINITIONS[joint];
  if (!definition) return 'normal';

  const percentOfNormal = calculatePercentOfNormal(degrees, definition.normalDegrees);

  if (percentOfNormal >= 90) return 'normal';
  if (percentOfNormal >= 75) return 'mild';
  if (percentOfNormal >= 50) return 'moderate';
  return 'severe';
}

/**
 * Compare two ROM measurements and determine improvement
 */
export function compareROMReadings(
  previousDegrees: number,
  currentDegrees: number,
  joint: ROMJointType,
  previousDate: Date,
  currentDate: Date,
  side: string | null = null
): ROMComparison {
  const definition = ROM_DEFINITIONS[joint];
  const change = currentDegrees - previousDegrees;
  const changePercent =
    previousDegrees !== 0 ? Math.round((change / previousDegrees) * 100) : 0;

  const percentOfNormal = calculatePercentOfNormal(currentDegrees, definition.normalDegrees);
  const previousPercentOfNormal = calculatePercentOfNormal(previousDegrees, definition.normalDegrees);

  // Determine if improved (considering significant change threshold of 5%)
  let improvement: 'improved' | 'declined' | 'stable';
  if (change > 0 && changePercent >= 5) {
    improvement = 'improved';
  } else if (change < 0 && changePercent <= -5) {
    improvement = 'declined';
  } else {
    improvement = 'stable';
  }

  return {
    joint,
    side,
    previousDegrees,
    currentDegrees,
    change,
    changePercent,
    percentOfNormal,
    previousPercentOfNormal,
    improvement,
    previousDate,
    currentDate,
  };
}

/**
 * Calculate summary statistics from ROM measurements
 */
export function calculateROMSummary(
  measurements: Array<{
    joint: ROMJointType;
    side: string | null;
    degrees: number;
    normalDegrees: number;
    isRestricted: boolean;
  }>
): ROMSummary {
  const totalMeasurements = measurements.length;
  const restrictedCount = measurements.filter((m) => m.isRestricted).length;
  const normalCount = totalMeasurements - restrictedCount;

  // Calculate average percent of normal
  const percentages = measurements.map((m) =>
    calculatePercentOfNormal(m.degrees, m.normalDegrees)
  );
  const averagePercentOfNormal =
    percentages.length > 0
      ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
      : 100;

  // Find most restricted
  let mostRestricted: ROMSummary['mostRestricted'] = null;
  if (measurements.length > 0) {
    const withPercents = measurements.map((m) => ({
      ...m,
      percentOfNormal: calculatePercentOfNormal(m.degrees, m.normalDegrees),
    }));
    const sorted = withPercents.sort((a, b) => a.percentOfNormal - b.percentOfNormal);
    const most = sorted[0];
    if (most.percentOfNormal < 100) {
      mostRestricted = {
        joint: most.joint,
        side: most.side,
        percentOfNormal: most.percentOfNormal,
        degrees: most.degrees,
      };
    }
  }

  // Calculate by region
  const byRegion = {} as ROMSummary['byRegion'];
  for (const region of Object.keys(ROM_REGIONS) as JointRegion[]) {
    const regionJoints = ROM_REGIONS[region].joints;
    const regionMeasurements = measurements.filter((m) =>
      regionJoints.includes(m.joint)
    );

    const regionRestricted = regionMeasurements.filter((m) => m.isRestricted).length;
    const regionPercents = regionMeasurements.map((m) =>
      calculatePercentOfNormal(m.degrees, m.normalDegrees)
    );
    const regionAvgPercent =
      regionPercents.length > 0
        ? Math.round(regionPercents.reduce((a, b) => a + b, 0) / regionPercents.length)
        : 100;

    byRegion[region] = {
      measurementCount: regionMeasurements.length,
      restrictedCount: regionRestricted,
      averagePercentOfNormal: regionAvgPercent,
    };
  }

  return {
    totalMeasurements,
    restrictedCount,
    normalCount,
    averagePercentOfNormal,
    mostRestricted,
    byRegion,
  };
}

/**
 * Get joints for a specific region
 */
export function getJointsForRegion(region: JointRegion): ROMJointType[] {
  return ROM_REGIONS[region]?.joints || [];
}

/**
 * Get definition for a specific joint
 */
export function getJointDefinition(joint: ROMJointType): ROMDefinition | null {
  return ROM_DEFINITIONS[joint] || null;
}

/**
 * Get all joints grouped by region
 */
export function getAllJointsGrouped(): Record<
  JointRegion,
  Array<{ joint: ROMJointType; definition: ROMDefinition }>
> {
  const grouped = {} as Record<
    JointRegion,
    Array<{ joint: ROMJointType; definition: ROMDefinition }>
  >;

  for (const region of Object.keys(ROM_REGIONS) as JointRegion[]) {
    grouped[region] = ROM_REGIONS[region].joints.map((joint) => ({
      joint,
      definition: ROM_DEFINITIONS[joint],
    }));
  }

  return grouped;
}

/**
 * Generate visual diagram data for ROM measurements
 */
export interface ROMDiagramData {
  region: JointRegion;
  measurements: Array<{
    joint: ROMJointType;
    name: string;
    movement: string;
    leftDegrees?: number;
    rightDegrees?: number;
    degrees?: number;
    normalDegrees: number;
    percentOfNormal: number;
    leftPercentOfNormal?: number;
    rightPercentOfNormal?: number;
    isRestricted: boolean;
    severity: 'normal' | 'mild' | 'moderate' | 'severe';
  }>;
}

export function generateROMDiagramData(
  measurements: Array<{
    joint: ROMJointType;
    side: string | null;
    degrees: number;
    isRestricted: boolean;
  }>
): ROMDiagramData[] {
  const diagramData: ROMDiagramData[] = [];

  for (const region of Object.keys(ROM_REGIONS) as JointRegion[]) {
    const regionInfo = ROM_REGIONS[region];
    const regionMeasurements: ROMDiagramData['measurements'] = [];

    // Group by movement type (for bilateral joints)
    const movements = new Map<string, typeof measurements>();

    for (const joint of regionInfo.joints) {
      const jointMeasurements = measurements.filter((m) => m.joint === joint);
      if (jointMeasurements.length === 0) continue;

      const definition = ROM_DEFINITIONS[joint];
      const movement = definition.movement;

      if (!movements.has(movement)) {
        movements.set(movement, []);
      }
      movements.get(movement)!.push(...jointMeasurements);
    }

    // Process each movement
    for (const [movement, movementMeasurements] of movements.entries()) {
      if (movementMeasurements.length === 0) continue;

      const joint = movementMeasurements[0].joint;
      const definition = ROM_DEFINITIONS[joint];

      const leftMeasurement = movementMeasurements.find((m) => m.side === 'left');
      const rightMeasurement = movementMeasurements.find((m) => m.side === 'right');
      const bilateralMeasurement = movementMeasurements.find(
        (m) => m.side === 'bilateral' || m.side === null
      );

      const measurement: ROMDiagramData['measurements'][0] = {
        joint,
        name: definition.name,
        movement,
        normalDegrees: definition.normalDegrees,
        percentOfNormal: 100,
        isRestricted: false,
        severity: 'normal',
      };

      if (leftMeasurement) {
        measurement.leftDegrees = leftMeasurement.degrees;
        measurement.leftPercentOfNormal = calculatePercentOfNormal(
          leftMeasurement.degrees,
          definition.normalDegrees
        );
      }

      if (rightMeasurement) {
        measurement.rightDegrees = rightMeasurement.degrees;
        measurement.rightPercentOfNormal = calculatePercentOfNormal(
          rightMeasurement.degrees,
          definition.normalDegrees
        );
      }

      if (bilateralMeasurement) {
        measurement.degrees = bilateralMeasurement.degrees;
        measurement.percentOfNormal = calculatePercentOfNormal(
          bilateralMeasurement.degrees,
          definition.normalDegrees
        );
      }

      // Calculate overall restricted status and severity
      const allDegrees = [
        leftMeasurement?.degrees,
        rightMeasurement?.degrees,
        bilateralMeasurement?.degrees,
      ].filter((d): d is number => d !== undefined);

      if (allDegrees.length > 0) {
        const avgDegrees = allDegrees.reduce((a, b) => a + b, 0) / allDegrees.length;
        measurement.percentOfNormal = calculatePercentOfNormal(avgDegrees, definition.normalDegrees);
        measurement.isRestricted = isRestricted(avgDegrees, joint);
        measurement.severity = getRestrictionSeverity(avgDegrees, joint);
      }

      regionMeasurements.push(measurement);
    }

    if (regionMeasurements.length > 0) {
      diagramData.push({
        region,
        measurements: regionMeasurements,
      });
    }
  }

  return diagramData;
}
