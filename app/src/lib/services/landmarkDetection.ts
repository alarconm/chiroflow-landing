/**
 * Landmark Detection Service for Posture Analysis
 *
 * This service provides AI-powered landmark detection for posture photos.
 * It uses predefined landmark configurations and can process images to
 * detect body landmarks for postural analysis.
 *
 * In production, this would integrate with MediaPipe Pose or similar
 * computer vision models. For now, it provides the structure for
 * manual entry and future AI integration.
 */

// Landmark definitions for different body views
export const LANDMARK_DEFINITIONS = {
  // Head and neck landmarks
  left_ear: { name: 'Left Ear', group: 'head', views: ['ANTERIOR', 'LATERAL_LEFT'] },
  right_ear: { name: 'Right Ear', group: 'head', views: ['ANTERIOR', 'LATERAL_RIGHT'] },
  nose: { name: 'Nose', group: 'head', views: ['ANTERIOR', 'POSTERIOR'] },
  chin: { name: 'Chin', group: 'head', views: ['ANTERIOR', 'LATERAL_LEFT', 'LATERAL_RIGHT'] },

  // Spine landmarks (typically visible in posterior/lateral views)
  c7_spinous: { name: 'C7 Spinous Process', group: 'spine', views: ['POSTERIOR', 'LATERAL_LEFT', 'LATERAL_RIGHT'] },
  t1_spinous: { name: 'T1 Spinous Process', group: 'spine', views: ['POSTERIOR'] },
  t4_spinous: { name: 'T4 Spinous Process', group: 'spine', views: ['POSTERIOR'] },
  t8_spinous: { name: 'T8 Spinous Process', group: 'spine', views: ['POSTERIOR'] },
  t12_spinous: { name: 'T12 Spinous Process', group: 'spine', views: ['POSTERIOR'] },
  l3_spinous: { name: 'L3 Spinous Process', group: 'spine', views: ['POSTERIOR'] },
  l5_spinous: { name: 'L5 Spinous Process', group: 'spine', views: ['POSTERIOR'] },
  s2_spinous: { name: 'S2 Spinous Process', group: 'spine', views: ['POSTERIOR'] },

  // Shoulder landmarks
  left_shoulder: { name: 'Left Shoulder (Acromion)', group: 'shoulder', views: ['ANTERIOR', 'POSTERIOR', 'LATERAL_LEFT'] },
  right_shoulder: { name: 'Right Shoulder (Acromion)', group: 'shoulder', views: ['ANTERIOR', 'POSTERIOR', 'LATERAL_RIGHT'] },
  left_clavicle: { name: 'Left Clavicle', group: 'shoulder', views: ['ANTERIOR'] },
  right_clavicle: { name: 'Right Clavicle', group: 'shoulder', views: ['ANTERIOR'] },

  // Hip and pelvis landmarks
  left_hip: { name: 'Left Hip (ASIS)', group: 'pelvis', views: ['ANTERIOR', 'LATERAL_LEFT'] },
  right_hip: { name: 'Right Hip (ASIS)', group: 'pelvis', views: ['ANTERIOR', 'LATERAL_RIGHT'] },
  left_psis: { name: 'Left PSIS', group: 'pelvis', views: ['POSTERIOR', 'LATERAL_LEFT'] },
  right_psis: { name: 'Right PSIS', group: 'pelvis', views: ['POSTERIOR', 'LATERAL_RIGHT'] },
  left_iliac_crest: { name: 'Left Iliac Crest', group: 'pelvis', views: ['POSTERIOR'] },
  right_iliac_crest: { name: 'Right Iliac Crest', group: 'pelvis', views: ['POSTERIOR'] },

  // Knee landmarks
  left_knee: { name: 'Left Knee', group: 'knee', views: ['ANTERIOR', 'LATERAL_LEFT'] },
  right_knee: { name: 'Right Knee', group: 'knee', views: ['ANTERIOR', 'LATERAL_RIGHT'] },
  left_patella: { name: 'Left Patella', group: 'knee', views: ['ANTERIOR'] },
  right_patella: { name: 'Right Patella', group: 'knee', views: ['ANTERIOR'] },

  // Ankle landmarks
  left_ankle: { name: 'Left Ankle (Lateral Malleolus)', group: 'ankle', views: ['ANTERIOR', 'LATERAL_LEFT'] },
  right_ankle: { name: 'Right Ankle (Lateral Malleolus)', group: 'ankle', views: ['ANTERIOR', 'LATERAL_RIGHT'] },
  left_medial_malleolus: { name: 'Left Medial Malleolus', group: 'ankle', views: ['ANTERIOR', 'POSTERIOR'] },
  right_medial_malleolus: { name: 'Right Medial Malleolus', group: 'ankle', views: ['ANTERIOR', 'POSTERIOR'] },

  // Foot landmarks
  left_heel: { name: 'Left Heel', group: 'foot', views: ['POSTERIOR', 'LATERAL_LEFT'] },
  right_heel: { name: 'Right Heel', group: 'foot', views: ['POSTERIOR', 'LATERAL_RIGHT'] },

  // External auditory meatus (for lateral views)
  external_auditory_meatus: { name: 'External Auditory Meatus', group: 'head', views: ['LATERAL_LEFT', 'LATERAL_RIGHT'] },

  // Greater trochanter (for lateral views)
  greater_trochanter: { name: 'Greater Trochanter', group: 'pelvis', views: ['LATERAL_LEFT', 'LATERAL_RIGHT'] },
} as const;

export type LandmarkName = keyof typeof LANDMARK_DEFINITIONS;
export type PostureView = 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT';

// Get landmarks applicable to a specific view
export function getLandmarksForView(view: PostureView): LandmarkName[] {
  return (Object.entries(LANDMARK_DEFINITIONS) as [LandmarkName, typeof LANDMARK_DEFINITIONS[LandmarkName]][])
    .filter(([, def]) => (def.views as readonly string[]).includes(view))
    .map(([name]) => name);
}

// Landmark groups for organized display
export const LANDMARK_GROUPS = {
  head: { label: 'Head & Neck', color: '#ef4444' },
  spine: { label: 'Spine', color: '#f97316' },
  shoulder: { label: 'Shoulders', color: '#eab308' },
  pelvis: { label: 'Pelvis & Hips', color: '#22c55e' },
  knee: { label: 'Knees', color: '#3b82f6' },
  ankle: { label: 'Ankles', color: '#8b5cf6' },
  foot: { label: 'Feet', color: '#ec4899' },
} as const;

export type LandmarkGroup = keyof typeof LANDMARK_GROUPS;

// Detected landmark result
export interface DetectedLandmark {
  name: LandmarkName;
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  z?: number; // Optional depth
  confidence: number; // 0-1
  isManual?: boolean;
}

// Analysis result structure
export interface LandmarkAnalysisResult {
  success: boolean;
  landmarks: DetectedLandmark[];
  analysisMethod: 'ai' | 'manual';
  processingTimeMs?: number;
  modelVersion?: string;
  warnings?: string[];
  error?: string;
}

/**
 * Simulated AI landmark detection
 *
 * In production, this would:
 * 1. Load the image
 * 2. Run it through MediaPipe Pose or BlazePose
 * 3. Map the detected keypoints to our clinical landmarks
 *
 * For now, returns placeholder positions that can be adjusted manually.
 */
export async function detectLandmarks(
  imageUrl: string,
  view: PostureView
): Promise<LandmarkAnalysisResult> {
  const startTime = Date.now();

  try {
    // Get landmarks applicable to this view
    const applicableLandmarks = getLandmarksForView(view);

    // Generate initial landmark positions based on typical body proportions
    // These serve as starting points for manual adjustment
    const landmarks: DetectedLandmark[] = applicableLandmarks.map((name) => {
      const position = getDefaultLandmarkPosition(name, view);
      return {
        name,
        x: position.x,
        y: position.y,
        confidence: 0.5, // Medium confidence - requires verification
        isManual: false,
      };
    });

    return {
      success: true,
      landmarks,
      analysisMethod: 'ai',
      processingTimeMs: Date.now() - startTime,
      modelVersion: 'placeholder-v1.0',
      warnings: ['AI detection is in development. Please verify and adjust landmark positions.'],
    };
  } catch (error) {
    return {
      success: false,
      landmarks: [],
      analysisMethod: 'ai',
      processingTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error during detection',
    };
  }
}

/**
 * Get default landmark position based on typical body proportions
 * These are approximate positions that serve as starting points
 */
function getDefaultLandmarkPosition(
  landmark: LandmarkName,
  view: PostureView
): { x: number; y: number } {
  // Default positions based on normalized coordinates (0-1)
  // These approximate typical adult proportions

  const defaults: Record<LandmarkName, { x: number; y: number }> = {
    // Head landmarks
    left_ear: { x: 0.42, y: 0.08 },
    right_ear: { x: 0.58, y: 0.08 },
    nose: { x: 0.50, y: 0.10 },
    chin: { x: 0.50, y: 0.13 },
    external_auditory_meatus: { x: 0.50, y: 0.08 },

    // Spine landmarks
    c7_spinous: { x: 0.50, y: 0.15 },
    t1_spinous: { x: 0.50, y: 0.17 },
    t4_spinous: { x: 0.50, y: 0.23 },
    t8_spinous: { x: 0.50, y: 0.30 },
    t12_spinous: { x: 0.50, y: 0.38 },
    l3_spinous: { x: 0.50, y: 0.43 },
    l5_spinous: { x: 0.50, y: 0.47 },
    s2_spinous: { x: 0.50, y: 0.50 },

    // Shoulder landmarks
    left_shoulder: { x: 0.35, y: 0.18 },
    right_shoulder: { x: 0.65, y: 0.18 },
    left_clavicle: { x: 0.40, y: 0.17 },
    right_clavicle: { x: 0.60, y: 0.17 },

    // Hip and pelvis landmarks
    left_hip: { x: 0.40, y: 0.48 },
    right_hip: { x: 0.60, y: 0.48 },
    left_psis: { x: 0.42, y: 0.47 },
    right_psis: { x: 0.58, y: 0.47 },
    left_iliac_crest: { x: 0.38, y: 0.45 },
    right_iliac_crest: { x: 0.62, y: 0.45 },
    greater_trochanter: { x: 0.50, y: 0.50 },

    // Knee landmarks
    left_knee: { x: 0.42, y: 0.70 },
    right_knee: { x: 0.58, y: 0.70 },
    left_patella: { x: 0.43, y: 0.68 },
    right_patella: { x: 0.57, y: 0.68 },

    // Ankle landmarks
    left_ankle: { x: 0.42, y: 0.92 },
    right_ankle: { x: 0.58, y: 0.92 },
    left_medial_malleolus: { x: 0.44, y: 0.92 },
    right_medial_malleolus: { x: 0.56, y: 0.92 },

    // Foot landmarks
    left_heel: { x: 0.42, y: 0.96 },
    right_heel: { x: 0.58, y: 0.96 },
  };

  // Adjust for lateral views
  if (view === 'LATERAL_LEFT' || view === 'LATERAL_RIGHT') {
    // In lateral view, most landmarks are centered horizontally
    const lateral = { ...defaults[landmark] };
    if (lateral) {
      lateral.x = 0.50;
    }
    return lateral || { x: 0.50, y: 0.50 };
  }

  return defaults[landmark] || { x: 0.50, y: 0.50 };
}

/**
 * Calculate angles between landmarks for postural analysis
 */
export function calculateLandmarkAngle(
  landmark1: DetectedLandmark,
  landmark2: DetectedLandmark,
  landmark3?: DetectedLandmark
): number {
  if (!landmark3) {
    // Two-point angle (from vertical)
    const dx = landmark2.x - landmark1.x;
    const dy = landmark2.y - landmark1.y;
    return Math.atan2(dx, -dy) * (180 / Math.PI);
  }

  // Three-point angle
  const v1x = landmark1.x - landmark2.x;
  const v1y = landmark1.y - landmark2.y;
  const v2x = landmark3.x - landmark2.x;
  const v2y = landmark3.y - landmark2.y;

  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

/**
 * Calculate distance between two landmarks (normalized units)
 */
export function calculateLandmarkDistance(
  landmark1: DetectedLandmark,
  landmark2: DetectedLandmark
): number {
  const dx = landmark2.x - landmark1.x;
  const dy = landmark2.y - landmark1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate vertical level difference between bilateral landmarks
 * Positive = left is higher, Negative = right is higher
 */
export function calculateLevelDifference(
  leftLandmark: DetectedLandmark,
  rightLandmark: DetectedLandmark
): number {
  return rightLandmark.y - leftLandmark.y; // In image coordinates, y increases downward
}
