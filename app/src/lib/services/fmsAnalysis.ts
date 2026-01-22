/**
 * Functional Movement Screen (FMS) Analysis Service
 *
 * Provides definitions, scoring, asymmetry detection, and exercise recommendations
 * for the standard 7 FMS tests used in movement assessment.
 *
 * Based on the Functional Movement Screen developed by Gray Cook.
 */

// ============================================
// TYPES
// ============================================

export type FMSTestType =
  | 'deep_squat'
  | 'hurdle_step'
  | 'inline_lunge'
  | 'shoulder_mobility'
  | 'active_straight_leg_raise'
  | 'trunk_stability_pushup'
  | 'rotary_stability';

export type FMSScore = 0 | 1 | 2 | 3;

export type MovementCategory = 'mobility' | 'stability' | 'movement_pattern';

export interface FMSTestDefinition {
  name: string;
  shortName: string;
  description: string;
  purpose: string;
  category: MovementCategory;
  bilateral: boolean;
  clearingTest: string | null;
  clearingTestDescription: string | null;
  scoringCriteria: {
    score: FMSScore;
    description: string;
    criteria: string[];
  }[];
  commonCompensations: string[];
  limitingFactors: string[];
  instructions: string[];
  equipment: string[];
}

export interface FMSResult {
  testName: FMSTestType;
  score: FMSScore;
  leftScore: FMSScore | null;
  rightScore: FMSScore | null;
  isAsymmetric: boolean;
  painDuringTest: boolean;
  painLocation: string | null;
  compensations: string[];
  limitingFactors: string[];
  movementQuality: string;
}

export interface FMSSummary {
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  testsWithPain: number;
  asymmetries: number;
  deficits: FMSTestType[];
  strengths: FMSTestType[];
  priorityAreas: {
    test: FMSTestType;
    reason: string;
    exercises: string[];
  }[];
  categoryScores: Record<MovementCategory, {
    score: number;
    maxScore: number;
    percentage: number;
  }>;
}

export interface FMSComparison {
  testName: FMSTestType;
  previousScore: FMSScore;
  currentScore: FMSScore;
  change: number;
  previousDate: Date;
  currentDate: Date;
  improvement: 'improved' | 'declined' | 'stable';
  previousAsymmetric: boolean;
  currentAsymmetric: boolean;
  asymmetryResolved: boolean;
}

// ============================================
// FMS TEST DEFINITIONS
// ============================================

export const FMS_DEFINITIONS: Record<FMSTestType, FMSTestDefinition> = {
  deep_squat: {
    name: 'Deep Squat',
    shortName: 'DS',
    description: 'Assesses bilateral, symmetrical, functional mobility of hips, knees, and ankles',
    purpose: 'Tests the ability to perform a deep squat with the dowel overhead, demonstrating mobility and stability of the lower extremity and core',
    category: 'movement_pattern',
    bilateral: false,
    clearingTest: null,
    clearingTestDescription: null,
    scoringCriteria: [
      {
        score: 3,
        description: 'Optimal squat pattern',
        criteria: [
          'Upper torso is parallel with tibia or toward vertical',
          'Femur below horizontal',
          'Knees aligned over feet',
          'Dowel aligned over feet',
          'Heels on floor'
        ]
      },
      {
        score: 2,
        description: 'Acceptable squat with heel lift',
        criteria: [
          'Upper torso is parallel with tibia or toward vertical',
          'Femur below horizontal',
          'Knees aligned over feet',
          'Dowel aligned over feet',
          'Heels on 2x6 board'
        ]
      },
      {
        score: 1,
        description: 'Unable to perform squat properly',
        criteria: [
          'Cannot achieve position even with heel lift',
          'Tibia and upper torso not parallel',
          'Femur not below horizontal',
          'Knees not aligned over feet',
          'Lumbar flexion noted'
        ]
      },
      {
        score: 0,
        description: 'Pain during test',
        criteria: ['Pain anywhere during the movement']
      }
    ],
    commonCompensations: [
      'Excessive forward lean',
      'Heel rise',
      'Valgus knee collapse',
      'Lumbar flexion',
      'Arms fall forward',
      'Asymmetric weight shift'
    ],
    limitingFactors: [
      'Ankle dorsiflexion restriction',
      'Hip flexion limitation',
      'Thoracic spine extension deficit',
      'Shoulder mobility limitation',
      'Core stability weakness'
    ],
    instructions: [
      'Stand with feet shoulder-width apart, toes pointing forward',
      'Hold dowel overhead with elbows at 90 degrees',
      'Press dowel overhead',
      'Descend as deep as possible',
      'Hold bottom position momentarily',
      'Return to starting position'
    ],
    equipment: ['Dowel', '2x6 board (for modification)']
  },

  hurdle_step: {
    name: 'Hurdle Step',
    shortName: 'HS',
    description: 'Assesses bilateral functional mobility and stability of hips, knees, and ankles',
    purpose: 'Tests the ability to step over an obstacle while maintaining hip and trunk stability',
    category: 'movement_pattern',
    bilateral: true,
    clearingTest: null,
    clearingTestDescription: null,
    scoringCriteria: [
      {
        score: 3,
        description: 'Optimal stepping pattern',
        criteria: [
          'Hips, knees, and ankles remain aligned in sagittal plane',
          'Minimal to no movement in lumbar spine',
          'Dowel and hurdle remain parallel'
        ]
      },
      {
        score: 2,
        description: 'Acceptable with minor compensation',
        criteria: [
          'Alignment is not maintained between hips, knees, and ankles',
          'Movement noted in lumbar spine',
          'Dowel and hurdle remain parallel'
        ]
      },
      {
        score: 1,
        description: 'Unable to maintain balance or alignment',
        criteria: [
          'Contact between foot and hurdle',
          'Loss of balance noted',
          'Dowel and hurdle do not remain parallel'
        ]
      },
      {
        score: 0,
        description: 'Pain during test',
        criteria: ['Pain anywhere during the movement']
      }
    ],
    commonCompensations: [
      'Hip hike',
      'Trunk lean',
      'Hip rotation',
      'Knee valgus',
      'Foot rotation',
      'Loss of balance'
    ],
    limitingFactors: [
      'Hip flexion weakness',
      'Hip stability deficit',
      'Ankle dorsiflexion limitation',
      'Core stability weakness',
      'Balance impairment'
    ],
    instructions: [
      'Stand with feet together, toes touching the base of the hurdle',
      'Hold dowel across shoulders',
      'Hurdle height set at tibial tuberosity',
      'Step over the hurdle, touch heel to floor',
      'Return to starting position without touching hurdle',
      'Repeat on opposite side'
    ],
    equipment: ['Dowel', 'FMS hurdle kit']
  },

  inline_lunge: {
    name: 'Inline Lunge',
    shortName: 'IL',
    description: 'Assesses hip and trunk mobility and stability, quadriceps flexibility, and ankle/knee stability',
    purpose: 'Tests the ability to perform a lunge pattern while maintaining stability',
    category: 'movement_pattern',
    bilateral: true,
    clearingTest: null,
    clearingTestDescription: null,
    scoringCriteria: [
      {
        score: 3,
        description: 'Optimal lunge pattern',
        criteria: [
          'Dowel contacts maintained (head, T-spine, sacrum)',
          'Dowel remains vertical',
          'No torso movement in any plane',
          'Knee touches behind heel of front foot'
        ]
      },
      {
        score: 2,
        description: 'Acceptable with minor compensation',
        criteria: [
          'Dowel contacts not maintained',
          'Dowel does not remain vertical',
          'Movement in torso noted',
          'Knee touches behind heel of front foot'
        ]
      },
      {
        score: 1,
        description: 'Unable to maintain pattern',
        criteria: [
          'Loss of balance noted',
          'Inability to touch knee behind front heel',
          'Cannot maintain dowel position'
        ]
      },
      {
        score: 0,
        description: 'Pain during test',
        criteria: ['Pain anywhere during the movement']
      }
    ],
    commonCompensations: [
      'Trunk rotation',
      'Trunk lateral flexion',
      'Loss of dowel contacts',
      'Valgus knee',
      'Foot rotation',
      'Loss of balance'
    ],
    limitingFactors: [
      'Hip flexor tightness',
      'Quadriceps tightness',
      'Hip mobility deficit',
      'Ankle mobility deficit',
      'Core stability weakness',
      'Balance impairment'
    ],
    instructions: [
      'Place dowel along spine, touching head, T-spine, and sacrum',
      'Grip dowel at cervical spine with one hand and lumbar spine with other',
      'Step distance equals tibia length (using board)',
      'Back foot toes aligned with front foot heel',
      'Lower rear knee to touch board behind front heel',
      'Return to starting position'
    ],
    equipment: ['Dowel', 'FMS board']
  },

  shoulder_mobility: {
    name: 'Shoulder Mobility',
    shortName: 'SM',
    description: 'Assesses bilateral shoulder range of motion combining internal rotation, adduction, and extension',
    purpose: 'Tests the ability to perform a combined movement requiring scapular mobility, thoracic extension, and shoulder mobility',
    category: 'mobility',
    bilateral: true,
    clearingTest: 'Impingement clearing test',
    clearingTestDescription: 'Place palm on opposite shoulder, raise elbow without shrugging. Pain indicates positive clearing test.',
    scoringCriteria: [
      {
        score: 3,
        description: 'Optimal shoulder mobility',
        criteria: [
          'Fists are within one hand length'
        ]
      },
      {
        score: 2,
        description: 'Acceptable shoulder mobility',
        criteria: [
          'Fists are within one and a half hand lengths'
        ]
      },
      {
        score: 1,
        description: 'Limited shoulder mobility',
        criteria: [
          'Fists are not within one and a half hand lengths'
        ]
      },
      {
        score: 0,
        description: 'Pain during test',
        criteria: ['Pain during movement or positive clearing test']
      }
    ],
    commonCompensations: [
      'Trunk lateral flexion',
      'Shoulder elevation',
      'Wrist flexion to close gap',
      'Thoracic flexion'
    ],
    limitingFactors: [
      'Shoulder internal rotation deficit',
      'Shoulder external rotation deficit',
      'Thoracic extension limitation',
      'Scapular mobility deficit',
      'Lat/pec tightness'
    ],
    instructions: [
      'Measure hand length from wrist crease to tip of long finger',
      'Make a fist with both hands (thumbs inside)',
      'In one motion, reach one arm overhead and down the back',
      'Simultaneously reach other arm behind back and up',
      'Measure distance between closest points of fists',
      'Do not walk fists toward each other',
      'Repeat with opposite arm configuration'
    ],
    equipment: ['Measuring tape or ruler']
  },

  active_straight_leg_raise: {
    name: 'Active Straight Leg Raise',
    shortName: 'ASLR',
    description: 'Assesses active hamstring and gastric/soleus flexibility while maintaining a stable pelvis',
    purpose: 'Tests the ability to separate lower extremity movement from core stability',
    category: 'mobility',
    bilateral: true,
    clearingTest: null,
    clearingTestDescription: null,
    scoringCriteria: [
      {
        score: 3,
        description: 'Optimal leg raise mobility',
        criteria: [
          'Vertical line of malleolus resides between mid-thigh and ASIS (anterior superior iliac spine)'
        ]
      },
      {
        score: 2,
        description: 'Acceptable leg raise mobility',
        criteria: [
          'Vertical line of malleolus resides between mid-thigh and mid-patella'
        ]
      },
      {
        score: 1,
        description: 'Limited leg raise mobility',
        criteria: [
          'Vertical line of malleolus resides below mid-patella'
        ]
      },
      {
        score: 0,
        description: 'Pain during test',
        criteria: ['Pain anywhere during the movement']
      }
    ],
    commonCompensations: [
      'Knee flexion of raised leg',
      'External rotation of raised leg',
      'Opposite knee flexion',
      'Pelvic rotation',
      'Lumbar flexion'
    ],
    limitingFactors: [
      'Hamstring tightness',
      'Hip flexor tightness (opposite leg)',
      'Core stability weakness',
      'Neural tension',
      'Hip flexion weakness'
    ],
    instructions: [
      'Lie supine with arms at sides, palms up',
      'Place FMS board under knees',
      'Identify mid-point between ASIS and mid-patella (mid-thigh)',
      'Keep both legs straight, toes pointed up',
      'Raise one leg as high as possible',
      'Keep opposite leg flat on board',
      'Note position of malleolus relative to landmarks'
    ],
    equipment: ['FMS board', 'Dowel for measurement reference']
  },

  trunk_stability_pushup: {
    name: 'Trunk Stability Push-Up',
    shortName: 'TSPU',
    description: 'Assesses trunk stability in the sagittal plane while performing a symmetrical upper extremity pushing movement',
    purpose: 'Tests the ability to stabilize the spine in an anterior and posterior plane during upper body movement',
    category: 'stability',
    bilateral: false,
    clearingTest: 'Spinal extension clearing test',
    clearingTestDescription: 'Perform a press-up (prone press). Pain indicates positive clearing test.',
    scoringCriteria: [
      {
        score: 3,
        description: 'Males: One rep with thumbs at top of forehead. Females: One rep with thumbs at chin level',
        criteria: [
          'Body lifts as a unit',
          'No lag in lumbar spine',
          'Proper hand position maintained'
        ]
      },
      {
        score: 2,
        description: 'Males: One rep with thumbs at chin level. Females: One rep with thumbs at clavicle',
        criteria: [
          'Body lifts as a unit',
          'No lag in lumbar spine',
          'Modified hand position'
        ]
      },
      {
        score: 1,
        description: 'Unable to perform push-up as described',
        criteria: [
          'Cannot complete one rep',
          'Body does not lift as a unit',
          'Sag in lumbar spine noted'
        ]
      },
      {
        score: 0,
        description: 'Pain during test',
        criteria: ['Pain during movement or positive clearing test']
      }
    ],
    commonCompensations: [
      'Lumbar sag',
      'Hip hike',
      'Asymmetric shoulder movement',
      'Cervical hyperextension',
      'Scapular winging'
    ],
    limitingFactors: [
      'Core stability weakness',
      'Upper body strength deficit',
      'Shoulder stability weakness',
      'Hip flexor weakness',
      'Poor motor control'
    ],
    instructions: [
      'Lie prone with hands positioned based on gender criteria',
      'Knees fully extended, ankles dorsiflexed',
      'Perform a push-up, lifting body as a unit',
      'No lag or sag in the spine should occur',
      'If unable, move to modified position',
      'Perform clearing test after scoring'
    ],
    equipment: ['None required']
  },

  rotary_stability: {
    name: 'Rotary Stability',
    shortName: 'RS',
    description: 'Assesses multi-plane trunk stability during a combined upper and lower extremity movement',
    purpose: 'Tests the ability to stabilize the spine in combined motions',
    category: 'stability',
    bilateral: true,
    clearingTest: 'Spinal flexion clearing test',
    clearingTestDescription: 'Assume quadruped position, rock back to heels. Pain indicates positive clearing test.',
    scoringCriteria: [
      {
        score: 3,
        description: 'Unilateral repetition completed',
        criteria: [
          'Same side arm and leg extend and flex',
          'Elbow touches knee over the board',
          'Spine remains parallel to board',
          'No rotation noted'
        ]
      },
      {
        score: 2,
        description: 'Diagonal repetition completed',
        criteria: [
          'Opposite arm and leg extend and flex',
          'Elbow touches knee over the board',
          'Spine remains parallel to board',
          'No rotation noted'
        ]
      },
      {
        score: 1,
        description: 'Unable to complete pattern',
        criteria: [
          'Cannot perform diagonal pattern',
          'Loss of balance',
          'Unable to maintain spine parallel to board'
        ]
      },
      {
        score: 0,
        description: 'Pain during test',
        criteria: ['Pain during movement or positive clearing test']
      }
    ],
    commonCompensations: [
      'Trunk rotation',
      'Trunk lateral flexion',
      'Hip drop',
      'Loss of balance',
      'Asymmetric movement'
    ],
    limitingFactors: [
      'Core stability weakness',
      'Hip stability deficit',
      'Shoulder stability deficit',
      'Poor motor control',
      'Balance impairment'
    ],
    instructions: [
      'Assume quadruped position over the FMS board',
      'Hands under shoulders, knees under hips',
      'Board should be between hand and knee',
      'Unilateral: Extend same side arm and leg, flex to touch elbow to knee over board',
      'Diagonal: Extend opposite arm and leg, flex to touch elbow to knee over board',
      'If unilateral fails, attempt diagonal',
      'Perform clearing test after scoring'
    ],
    equipment: ['FMS board']
  }
};

// ============================================
// EXERCISE RECOMMENDATIONS
// ============================================

export const FMS_EXERCISE_RECOMMENDATIONS: Record<FMSTestType, {
  mobilityExercises: string[];
  stabilityExercises: string[];
  correctiveExercises: string[];
}> = {
  deep_squat: {
    mobilityExercises: [
      'Ankle dorsiflexion stretches',
      'Hip flexor stretches',
      'Thoracic spine extension on foam roller',
      'Lat stretches',
      'Goblet squat holds'
    ],
    stabilityExercises: [
      'Dead bug progressions',
      'Plank variations',
      'Pallof press',
      'Anti-rotation holds'
    ],
    correctiveExercises: [
      'Goblet squats',
      'Box squats',
      'TRX assisted squats',
      'Wall squats',
      'Squat to stand'
    ]
  },
  hurdle_step: {
    mobilityExercises: [
      'Hip flexor stretches',
      'Piriformis stretches',
      'Ankle mobility drills',
      'Hip circles'
    ],
    stabilityExercises: [
      'Single leg balance',
      'Mini band walks',
      'Single leg deadlift',
      'Standing hip hike holds'
    ],
    correctiveExercises: [
      'Wall marches',
      'Standing hip flexion holds',
      'Step-up progressions',
      'Single leg stance with arm reaches'
    ]
  },
  inline_lunge: {
    mobilityExercises: [
      'Hip flexor stretches (kneeling)',
      'Quadriceps stretches',
      'Ankle mobility work',
      'Half-kneeling hip flexor stretch'
    ],
    stabilityExercises: [
      'Half-kneeling chops',
      'Half-kneeling lifts',
      'Split stance pallof press',
      'Inline stance holds'
    ],
    correctiveExercises: [
      'Assisted inline lunge',
      'Split squat progressions',
      'Reverse lunge variations',
      'Walking lunge with rotation'
    ]
  },
  shoulder_mobility: {
    mobilityExercises: [
      'Sleeper stretch',
      'Cross-body shoulder stretch',
      'Doorway pec stretch',
      'Lat stretch',
      'Thoracic spine rotations'
    ],
    stabilityExercises: [
      'YTWL exercises',
      'Face pulls',
      'External rotation exercises',
      'Scapular wall slides'
    ],
    correctiveExercises: [
      'Band pull-aparts',
      'Arm bars',
      'Turkish get-up (partial)',
      'Foam roller thoracic extensions'
    ]
  },
  active_straight_leg_raise: {
    mobilityExercises: [
      'Hamstring stretches (supine)',
      'Hip flexor stretches (opposite leg)',
      'Neural flossing/glides',
      'Active stretching sequences'
    ],
    stabilityExercises: [
      'Dead bugs',
      'Leg lowering progressions',
      'Hollow body holds',
      'Pelvic tilts'
    ],
    correctiveExercises: [
      'Supine leg raises with feedback',
      'Single leg deadlift progressions',
      'Active stretching with engagement',
      'Leg lower with control'
    ]
  },
  trunk_stability_pushup: {
    mobilityExercises: [
      'Cat-cow stretches',
      'Child\'s pose',
      'Thread the needle',
      'Prone press-ups'
    ],
    stabilityExercises: [
      'Plank progressions',
      'Hard style planks',
      'Push-up plus',
      'Stir the pot'
    ],
    correctiveExercises: [
      'Incline push-ups',
      'Hand-release push-ups',
      'Push-up with hip touch',
      'Elevated push-up progressions'
    ]
  },
  rotary_stability: {
    mobilityExercises: [
      'Quadruped rock backs',
      'Cat-cow',
      'Thread the needle',
      'Hip circles in quadruped'
    ],
    stabilityExercises: [
      'Bird dogs',
      'Dead bugs',
      'Pallof press variations',
      'Side planks'
    ],
    correctiveExercises: [
      'Quadruped diagonal reaches',
      'Bear crawl progressions',
      'Rolling patterns',
      'Contralateral limb raises'
    ]
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get test definition by name
 */
export function getTestDefinition(testName: FMSTestType): FMSTestDefinition {
  return FMS_DEFINITIONS[testName];
}

/**
 * Get all test names in order
 */
export function getAllTestNames(): FMSTestType[] {
  return [
    'deep_squat',
    'hurdle_step',
    'inline_lunge',
    'shoulder_mobility',
    'active_straight_leg_raise',
    'trunk_stability_pushup',
    'rotary_stability'
  ];
}

/**
 * Detect asymmetry between left and right scores
 */
export function detectAsymmetry(leftScore: FMSScore | null, rightScore: FMSScore | null): boolean {
  if (leftScore === null || rightScore === null) {
    return false;
  }
  return leftScore !== rightScore;
}

/**
 * Get the final score for a bilateral test (lower of left/right)
 */
export function getBilateralScore(leftScore: FMSScore | null, rightScore: FMSScore | null): FMSScore {
  if (leftScore === null && rightScore === null) {
    return 0;
  }
  if (leftScore === null) return rightScore!;
  if (rightScore === null) return leftScore;
  return Math.min(leftScore, rightScore) as FMSScore;
}

/**
 * Get scoring description for a score
 */
export function getScoringDescription(testName: FMSTestType, score: FMSScore): string {
  const definition = FMS_DEFINITIONS[testName];
  const criterion = definition.scoringCriteria.find(c => c.score === score);
  return criterion?.description || 'Unknown score';
}

/**
 * Calculate total FMS score from results
 */
export function calculateTotalScore(results: FMSResult[]): number {
  return results.reduce((total, result) => {
    // For bilateral tests, use the lower score
    const testDef = FMS_DEFINITIONS[result.testName];
    if (testDef.bilateral && result.leftScore !== null && result.rightScore !== null) {
      return total + Math.min(result.leftScore, result.rightScore);
    }
    return total + result.score;
  }, 0);
}

/**
 * Calculate comprehensive FMS summary
 */
export function calculateFMSSummary(results: FMSResult[]): FMSSummary {
  const totalScore = calculateTotalScore(results);
  const maxPossibleScore = 21; // 7 tests × 3 points max
  const percentage = Math.round((totalScore / maxPossibleScore) * 100);

  const testsWithPain = results.filter(r => r.painDuringTest || r.score === 0).length;
  const asymmetries = results.filter(r => r.isAsymmetric).length;

  const deficits: FMSTestType[] = results
    .filter(r => r.score <= 1)
    .map(r => r.testName);

  const strengths: FMSTestType[] = results
    .filter(r => r.score === 3 && !r.isAsymmetric)
    .map(r => r.testName);

  // Calculate category scores
  const categoryScores: Record<MovementCategory, { score: number; maxScore: number; percentage: number }> = {
    mobility: { score: 0, maxScore: 0, percentage: 0 },
    stability: { score: 0, maxScore: 0, percentage: 0 },
    movement_pattern: { score: 0, maxScore: 0, percentage: 0 }
  };

  results.forEach(result => {
    const testDef = FMS_DEFINITIONS[result.testName];
    categoryScores[testDef.category].score += result.score;
    categoryScores[testDef.category].maxScore += 3;
  });

  Object.keys(categoryScores).forEach(cat => {
    const category = cat as MovementCategory;
    if (categoryScores[category].maxScore > 0) {
      categoryScores[category].percentage = Math.round(
        (categoryScores[category].score / categoryScores[category].maxScore) * 100
      );
    }
  });

  // Determine priority areas (tests with score ≤ 2, prioritizing pain and asymmetry)
  const priorityAreas = results
    .filter(r => r.score <= 2 || r.isAsymmetric)
    .sort((a, b) => {
      // Pain tests first (score 0)
      if (a.score === 0 && b.score !== 0) return -1;
      if (b.score === 0 && a.score !== 0) return 1;
      // Then asymmetries
      if (a.isAsymmetric && !b.isAsymmetric) return -1;
      if (b.isAsymmetric && !a.isAsymmetric) return 1;
      // Then by score (lower first)
      return a.score - b.score;
    })
    .slice(0, 3) // Top 3 priorities
    .map(r => {
      const exercises = FMS_EXERCISE_RECOMMENDATIONS[r.testName];
      let reason = '';
      if (r.score === 0) {
        reason = `Pain during ${FMS_DEFINITIONS[r.testName].name} - requires medical clearance`;
      } else if (r.isAsymmetric) {
        reason = `Asymmetry detected in ${FMS_DEFINITIONS[r.testName].name}`;
      } else if (r.score === 1) {
        reason = `Significant dysfunction in ${FMS_DEFINITIONS[r.testName].name}`;
      } else {
        reason = `Minor compensation in ${FMS_DEFINITIONS[r.testName].name}`;
      }

      return {
        test: r.testName,
        reason,
        exercises: [
          ...exercises.correctiveExercises.slice(0, 2),
          ...exercises.mobilityExercises.slice(0, 1),
          ...exercises.stabilityExercises.slice(0, 1)
        ]
      };
    });

  return {
    totalScore,
    maxPossibleScore,
    percentage,
    testsWithPain,
    asymmetries,
    deficits,
    strengths,
    priorityAreas,
    categoryScores
  };
}

/**
 * Compare FMS assessments between two dates
 */
export function compareFMSAssessments(
  previousResults: FMSResult[],
  currentResults: FMSResult[],
  previousDate: Date,
  currentDate: Date
): FMSComparison[] {
  const comparisons: FMSComparison[] = [];

  for (const current of currentResults) {
    const previous = previousResults.find(p => p.testName === current.testName);
    if (previous) {
      const change = current.score - previous.score;
      let improvement: 'improved' | 'declined' | 'stable' = 'stable';
      if (change > 0) improvement = 'improved';
      if (change < 0) improvement = 'declined';

      const asymmetryResolved = previous.isAsymmetric && !current.isAsymmetric;

      comparisons.push({
        testName: current.testName,
        previousScore: previous.score,
        currentScore: current.score,
        change,
        previousDate,
        currentDate,
        improvement,
        previousAsymmetric: previous.isAsymmetric,
        currentAsymmetric: current.isAsymmetric,
        asymmetryResolved
      });
    }
  }

  return comparisons;
}

/**
 * Get exercise recommendations based on FMS results
 */
export function getExerciseRecommendations(results: FMSResult[]): {
  testName: FMSTestType;
  testScore: FMSScore;
  mobilityExercises: string[];
  stabilityExercises: string[];
  correctiveExercises: string[];
}[] {
  return results
    .filter(r => r.score <= 2 || r.isAsymmetric)
    .map(r => ({
      testName: r.testName,
      testScore: r.score,
      ...FMS_EXERCISE_RECOMMENDATIONS[r.testName]
    }));
}

/**
 * Interpret overall FMS score
 */
export function interpretTotalScore(totalScore: number): {
  level: 'optimal' | 'acceptable' | 'at_risk' | 'high_risk';
  description: string;
  recommendation: string;
} {
  if (totalScore >= 17) {
    return {
      level: 'optimal',
      description: 'Excellent functional movement capacity',
      recommendation: 'Maintain current training with periodic reassessment'
    };
  }
  if (totalScore >= 14) {
    return {
      level: 'acceptable',
      description: 'Good functional movement with minor limitations',
      recommendation: 'Address identified asymmetries and low scores through corrective exercise'
    };
  }
  if (totalScore >= 10) {
    return {
      level: 'at_risk',
      description: 'Functional movement limitations present',
      recommendation: 'Prioritize corrective exercise before progressing to higher intensity training'
    };
  }
  return {
    level: 'high_risk',
    description: 'Significant movement dysfunction',
    recommendation: 'Focus on foundational movement patterns before any athletic training'
  };
}

/**
 * Check if any clearing tests were positive
 */
export function hasPainClearingTests(results: FMSResult[]): boolean {
  return results.some(r => r.score === 0);
}

/**
 * Get tests by category
 */
export function getTestsByCategory(category: MovementCategory): FMSTestType[] {
  return getAllTestNames().filter(test => FMS_DEFINITIONS[test].category === category);
}
