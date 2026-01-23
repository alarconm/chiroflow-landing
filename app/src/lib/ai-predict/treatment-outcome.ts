// Treatment Outcome Prediction - Epic 40: AI Predictive Analytics Agent
// Predicts patient treatment outcomes using patient data, condition, and similar cases

import { prisma } from '@/lib/prisma';
import { TrendDirection, PredictionType, PredictionStatus } from '@prisma/client';
import {
  TreatmentOutcomePredictionConfig,
  TreatmentOutcomePredictionResult,
  BatchOutcomePredictionOptions,
  BatchOutcomePredictionResult,
  OutcomePredictionAccuracyMetrics,
  OutcomePredictionFactor,
  TreatmentResponsePrediction,
  ImprovementTimeline,
  NonResponseRisk,
  OptimalTreatmentDuration,
  SimilarPatientOutcome,
  PatientOutcomeComparison,
  OutcomeValidationResult,
  TreatmentResponseLevel,
} from './types';

// Default configuration
const DEFAULT_CONFIG: TreatmentOutcomePredictionConfig = {
  confidenceThreshold: 0.5,
  minSimilarCases: 5,
  excellentThreshold: 80,
  goodThreshold: 60,
  moderateThreshold: 40,
  includeComorbidities: true,
  includeSimilarCases: true,
  includeHistoricalOutcomes: true,
  shortTermWeeks: 4,
  mediumTermWeeks: 12,
  longTermWeeks: 26,
};

const MODEL_VERSION = '1.0.0';

// ============================================
// MAIN PREDICTION FUNCTIONS
// ============================================

/**
 * Predict treatment outcome for a patient
 */
export async function predictOutcome(
  organizationId: string,
  patientId: string,
  treatmentPlanId?: string,
  config?: Partial<TreatmentOutcomePredictionConfig>
): Promise<TreatmentOutcomePredictionResult | null> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Fetch patient data with related information
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId,
      status: 'ACTIVE',
    },
    include: {
      demographics: true,
      treatmentPlans: {
        where: treatmentPlanId ? { id: treatmentPlanId } : { status: { in: ['ACTIVE', 'DRAFT'] } },
        orderBy: { startDate: 'desc' },
        take: 1,
        include: {
          goals: true,
          provider: true,
          encounters: {
            orderBy: { encounterDate: 'desc' },
            take: 20,
            include: {
              diagnoses: true,
              assessments: true,
              soapNote: true,
            },
          },
        },
      },
      encounters: {
        orderBy: { encounterDate: 'desc' },
        take: 30,
        include: {
          diagnoses: true,
          assessments: true,
        },
      },
      appointments: {
        where: {
          status: { in: ['COMPLETED', 'NO_SHOW', 'CANCELLED'] },
        },
        orderBy: { startTime: 'desc' },
        take: 50,
      },
    },
  });

  if (!patient) return null;

  const patientName = patient.demographics
    ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
    : 'Unknown Patient';

  // Get treatment plan or use latest
  const treatmentPlan = patient.treatmentPlans[0];

  // Get primary diagnosis
  const primaryDiagnosis = treatmentPlan?.encounters?.[0]?.diagnoses?.[0] ||
    patient.encounters?.[0]?.diagnoses?.[0];

  const conditionCode = primaryDiagnosis?.icd10Code || 'M99.00';
  const conditionDescription = primaryDiagnosis?.description || 'General musculoskeletal condition';

  // Calculate patient factors
  const patientAge = patient.demographics?.dateOfBirth
    ? calculateAge(patient.demographics.dateOfBirth)
    : null;

  // Analyze condition characteristics
  const conditionAnalysis = analyzeCondition(conditionCode, patient.encounters);

  // Calculate outcome factors
  const outcomeFactors = calculateOutcomeFactors(
    patient,
    patientAge,
    conditionAnalysis,
    treatmentPlan,
    mergedConfig
  );

  // Get similar cases if enabled
  let similarCasesAnalysis: SimilarPatientOutcome | null = null;
  if (mergedConfig.includeSimilarCases) {
    similarCasesAnalysis = await analyzeSimilarCases(
      organizationId,
      conditionCode,
      patientAge,
      conditionAnalysis.symptomDuration,
      mergedConfig.minSimilarCases
    );
  }

  // Calculate predicted improvement
  const { improvement, confidence, responseLevel } = calculatePredictedImprovement(
    outcomeFactors,
    similarCasesAnalysis,
    mergedConfig
  );

  // Generate response predictions
  const responsePredictions = generateResponsePredictions(
    improvement,
    confidence,
    conditionAnalysis.symptomDuration
  );

  // Calculate timeline
  const improvementTimeline = generateImprovementTimeline(
    improvement,
    conditionAnalysis.symptomDuration,
    mergedConfig
  );

  // Assess non-response risk
  const nonResponseRisk = assessNonResponseRisk(outcomeFactors, similarCasesAnalysis);

  // Calculate optimal treatment duration
  const optimalDuration = calculateOptimalDuration(
    conditionCode,
    conditionAnalysis.symptomDuration,
    improvement,
    similarCasesAnalysis
  );

  // Calculate risk of chronicity
  const riskOfChronicity = calculateChronicityRisk(
    conditionAnalysis.symptomDuration,
    outcomeFactors,
    patientAge
  );

  // Patient comparison analysis
  const patientComparison = similarCasesAnalysis ? {
    age: patientAge ? calculateComparison('Age', patientAge, 45, 15) : null,
    symptomDuration: calculateComparison(
      'Symptom Duration',
      conditionAnalysis.symptomDuration === 'acute' ? 2 :
        conditionAnalysis.symptomDuration === 'subacute' ? 6 : 12,
      6,
      4
    ),
    comorbidityCount: calculateComparison(
      'Comorbidities',
      conditionAnalysis.comorbidityCount,
      2,
      1.5
    ),
    baseline: null, // Would need baseline assessment scores
  } : {
    age: null,
    symptomDuration: null,
    comorbidityCount: null,
    baseline: null,
  };

  // Generate patient communication content
  const patientExplanation = generatePatientExplanation(
    responseLevel,
    improvement,
    improvementTimeline,
    optimalDuration
  );

  const expectationPoints = generateExpectationPoints(
    responseLevel,
    optimalDuration,
    nonResponseRisk
  );

  const homeInstructions = generateHomeInstructions(
    conditionCode,
    outcomeFactors.filter(f => f.modifiable)
  );

  // Get top factors
  const sortedFactors = [...outcomeFactors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const topPositiveFactors = sortedFactors
    .filter(f => f.impact === 'positive')
    .slice(0, 3)
    .map(f => f.name);
  const topNegativeFactors = sortedFactors
    .filter(f => f.impact === 'negative')
    .slice(0, 3)
    .map(f => f.name);
  const modifiableFactors = outcomeFactors.filter(f => f.modifiable);

  // Calculate expected timeline in weeks
  const expectedTimelineWeeks = responseLevel === 'excellent' ? mergedConfig.shortTermWeeks :
    responseLevel === 'good' ? mergedConfig.mediumTermWeeks :
    mergedConfig.longTermWeeks;

  const confidenceLevel = confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low';

  return {
    patientId,
    patientName,
    treatmentPlanId: treatmentPlan?.id || null,
    conditionCode,
    conditionDescription,
    treatmentApproach: treatmentPlan?.name || 'Standard chiropractic care',

    predictedOutcome: responseLevel,
    predictedImprovement: Math.round(improvement),
    confidenceScore: confidence,
    confidenceLevel,

    responsePredictions,
    expectedTimelineWeeks,
    improvementTimeline,

    nonResponseRisk,
    riskOfChronicity: Math.round(riskOfChronicity),

    optimalDuration,
    outcomeFactors,
    topPositiveFactors,
    topNegativeFactors,
    modifiableFactors,

    similarCasesAnalysis,
    patientComparison,

    patientExplanation,
    expectationPoints,
    homeInstructions,

    predictionDate: new Date(),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Valid for 30 days
    modelVersion: MODEL_VERSION,
  };
}

/**
 * Batch predict outcomes for multiple patients
 */
export async function batchPredictOutcome(
  options: BatchOutcomePredictionOptions
): Promise<BatchOutcomePredictionResult> {
  const startTime = Date.now();
  const results: TreatmentOutcomePredictionResult[] = [];
  let errorCount = 0;

  // Get patients to analyze
  const whereClause: {
    organizationId: string;
    status: 'ACTIVE';
    id?: { in: string[] };
    treatmentPlans?: { some: { id: { in: string[] } } };
  } = {
    organizationId: options.organizationId,
    status: 'ACTIVE',
  };

  if (options.patientIds?.length) {
    whereClause.id = { in: options.patientIds };
  }

  if (options.treatmentPlanIds?.length) {
    whereClause.treatmentPlans = { some: { id: { in: options.treatmentPlanIds } } };
  }

  const patients = await prisma.patient.findMany({
    where: whereClause,
    select: { id: true },
    take: options.limit || 100,
  });

  // Process each patient
  for (const patient of patients) {
    try {
      const prediction = await predictOutcome(
        options.organizationId,
        patient.id,
        options.treatmentPlanIds?.[0],
        { confidenceThreshold: options.minConfidence || 0.5 }
      );

      if (prediction) {
        // Filter by confidence if specified
        if (!options.minConfidence || prediction.confidenceScore >= options.minConfidence) {
          results.push(prediction);

          // Save if requested
          if (options.saveResults) {
            await saveOutcomePrediction(options.organizationId, prediction);
          }
        }
      }
    } catch (error) {
      console.error(`Error predicting outcome for patient ${patient.id}:`, error);
      errorCount++;
    }
  }

  // Calculate summary stats
  const byResponseLevel = {
    excellent: results.filter(r => r.predictedOutcome === 'excellent').length,
    good: results.filter(r => r.predictedOutcome === 'good').length,
    moderate: results.filter(r => r.predictedOutcome === 'moderate').length,
    poor: results.filter(r => r.predictedOutcome === 'poor').length,
    unknown: results.filter(r => r.predictedOutcome === 'unknown').length,
  };

  const avgConfidence = results.length > 0
    ? results.reduce((sum, r) => sum + r.confidenceScore, 0) / results.length
    : 0;

  const avgImprovement = results.length > 0
    ? results.reduce((sum, r) => sum + r.predictedImprovement, 0) / results.length
    : 0;

  return {
    processedCount: patients.length,
    savedCount: options.saveResults ? results.length : 0,
    errorCount,
    byResponseLevel,
    averageConfidence: Math.round(avgConfidence * 100) / 100,
    averagePredictedImprovement: Math.round(avgImprovement),
    processingTimeMs: Date.now() - startTime,
    predictions: results,
  };
}

/**
 * Save outcome prediction to database
 */
export async function saveOutcomePrediction(
  organizationId: string,
  prediction: TreatmentOutcomePredictionResult
): Promise<void> {
  // Save to generic Prediction model
  await prisma.prediction.create({
    data: {
      organizationId,
      patientId: prediction.patientId,
      predictionType: PredictionType.OUTCOME,
      status: PredictionStatus.PENDING,
      targetEntityType: 'TreatmentPlan',
      targetEntityId: prediction.treatmentPlanId,
      prediction: JSON.parse(JSON.stringify({
        predictedOutcome: prediction.predictedOutcome,
        predictedImprovement: prediction.predictedImprovement,
        conditionCode: prediction.conditionCode,
        conditionDescription: prediction.conditionDescription,
        treatmentApproach: prediction.treatmentApproach,
        expectedTimelineWeeks: prediction.expectedTimelineWeeks,
        nonResponseRisk: prediction.nonResponseRisk,
        optimalDuration: prediction.optimalDuration,
        topPositiveFactors: prediction.topPositiveFactors,
        topNegativeFactors: prediction.topNegativeFactors,
      })),
      confidence: prediction.confidenceScore,
      confidenceLevel: prediction.confidenceLevel,
      modelName: 'treatment-outcome-predictor',
      modelVersion: prediction.modelVersion,
      features: {
        factorCount: prediction.outcomeFactors.length,
        similarCasesUsed: !!prediction.similarCasesAnalysis,
      },
      featureImportance: prediction.outcomeFactors.reduce((acc, f) => {
        acc[f.name] = f.contribution;
        return acc;
      }, {} as Record<string, number>),
      predictionDate: prediction.predictionDate,
      validUntil: prediction.validUntil,
      horizon: `${prediction.expectedTimelineWeeks}w`,
    },
  });

  // Also save to OutcomePrediction model for clinical use (if encounter exists)
  if (prediction.treatmentPlanId) {
    const treatmentPlan = await prisma.treatmentPlan.findFirst({
      where: { id: prediction.treatmentPlanId },
      include: { encounters: { take: 1, orderBy: { encounterDate: 'desc' } } },
    });

    if (treatmentPlan?.encounters[0]) {
      await prisma.outcomePrediction.create({
        data: {
          organizationId,
          patientId: prediction.patientId,
          encounterId: treatmentPlan.encounters[0].id,
          conditionCode: prediction.conditionCode,
          conditionDescription: prediction.conditionDescription,
          treatmentApproach: prediction.treatmentApproach,
          techniquesSuggested: [],
          predictedOutcome: generateOutcomeDescription(prediction),
          confidenceScore: prediction.confidenceScore * 100,
          expectedTimeline: `${prediction.expectedTimelineWeeks} weeks`,
          improvementPercent: prediction.predictedImprovement,
          riskOfChronicity: prediction.riskOfChronicity,
          treatmentResponse: prediction.predictedOutcome.toUpperCase(),
          prognosticFactors: prediction.outcomeFactors.map(f => ({
            name: f.name,
            impact: f.impact,
            contribution: f.contribution,
          })),
          similarCasesCount: prediction.similarCasesAnalysis?.caseCount || 0,
          similarCasesAvgOutcome: prediction.similarCasesAnalysis?.averageImprovement,
          patientAge: prediction.patientComparison.age
            ? parseInt(String(prediction.patientComparison.age.patientValue))
            : null,
          symptomDuration: prediction.patientComparison.symptomDuration
            ? String(prediction.patientComparison.symptomDuration.patientValue) + ' weeks'
            : null,
          comorbidities: prediction.outcomeFactors
            .filter(f => f.category === 'condition' && f.name.includes('comorbid'))
            .map(f => String(f.value)),
          riskFactors: prediction.topNegativeFactors,
          patientExplanation: prediction.patientExplanation,
          expectationSetting: {
            points: prediction.expectationPoints,
            instructions: prediction.homeInstructions,
          },
        },
      });
    }
  }
}

/**
 * Track actual outcome for accuracy measurement
 */
export async function trackOutcomePredictionAccuracy(
  organizationId: string,
  patientId: string,
  treatmentPlanId: string,
  actualImprovement: number,
  notes?: string
): Promise<OutcomeValidationResult | null> {
  // Find the prediction
  const prediction = await prisma.prediction.findFirst({
    where: {
      organizationId,
      patientId,
      targetEntityId: treatmentPlanId,
      predictionType: PredictionType.OUTCOME,
      wasAccurate: null, // Not yet validated
    },
    orderBy: { predictionDate: 'desc' },
  });

  if (!prediction) return null;

  const predictedImprovement = (prediction.prediction as { predictedImprovement?: number })?.predictedImprovement || 0;
  const variance = Math.abs(actualImprovement - predictedImprovement);
  const accuracyScore = Math.max(0, 1 - variance / 100);
  const wasAccurate = variance <= 20; // Within 20% is considered accurate

  // Update the prediction with actual outcome
  await prisma.prediction.update({
    where: { id: prediction.id },
    data: {
      status: wasAccurate ? PredictionStatus.VALIDATED : PredictionStatus.INVALIDATED,
      actualOutcome: {
        actualImprovement,
        measuredAt: new Date(),
        notes,
      },
      outcomeDate: new Date(),
      wasAccurate,
      accuracyScore,
      accuracyNotes: notes,
    },
  });

  // Also update OutcomePrediction if exists
  await prisma.outcomePrediction.updateMany({
    where: {
      organizationId,
      patientId,
      wasAccurate: null,
    },
    data: {
      actualOutcome: `${actualImprovement}% improvement measured`,
      actualImprovement,
      outcomeMeasuredAt: new Date(),
      wasAccurate,
      accuracyNotes: notes,
    },
  });

  return {
    predictionId: prediction.id,
    predictedImprovement,
    actualImprovement,
    variance,
    wasAccurate,
    accuracyScore,
    timeToOutcome: Math.floor(
      (Date.now() - prediction.predictionDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ),
    notes: notes || null,
  };
}

/**
 * Get outcome prediction accuracy metrics
 */
export async function getOutcomePredictionAccuracy(
  organizationId: string
): Promise<OutcomePredictionAccuracyMetrics> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const predictions = await prisma.prediction.findMany({
    where: {
      organizationId,
      predictionType: PredictionType.OUTCOME,
      wasAccurate: { not: null },
    },
  });

  if (predictions.length === 0) {
    return {
      totalPredictions: 0,
      validatedPredictions: 0,
      mape: 0,
      rmse: 0,
      correlationCoefficient: 0,
      byResponseLevel: [],
      byConfidenceLevel: [],
      byCondition: [],
      last30Days: { predictions: 0, accuracy: 0 },
      last90Days: { predictions: 0, accuracy: 0 },
      overall: { predictions: 0, accuracy: 0 },
    };
  }

  // Calculate MAPE and RMSE
  let totalAbsoluteError = 0;
  let totalSquaredError = 0;

  for (const pred of predictions) {
    const predImprovement = (pred.prediction as { predictedImprovement?: number })?.predictedImprovement || 0;
    const actImprovement = (pred.actualOutcome as { actualImprovement?: number })?.actualImprovement || 0;
    const error = Math.abs(predImprovement - actImprovement);
    totalAbsoluteError += error;
    totalSquaredError += error * error;
  }

  const mape = totalAbsoluteError / predictions.length;
  const rmse = Math.sqrt(totalSquaredError / predictions.length);

  // Group by response level
  const byResponseLevel: { level: TreatmentResponseLevel; predictions: number; accurate: number; accuracy: number }[] = [
    { level: 'excellent', predictions: 0, accurate: 0, accuracy: 0 },
    { level: 'good', predictions: 0, accurate: 0, accuracy: 0 },
    { level: 'moderate', predictions: 0, accurate: 0, accuracy: 0 },
    { level: 'poor', predictions: 0, accurate: 0, accuracy: 0 },
  ];

  for (const pred of predictions) {
    const outcome = (pred.prediction as { predictedOutcome?: string })?.predictedOutcome || 'unknown';
    const levelEntry = byResponseLevel.find(l => l.level === outcome);
    if (levelEntry) {
      levelEntry.predictions++;
      if (pred.wasAccurate) levelEntry.accurate++;
    }
  }

  for (const level of byResponseLevel) {
    level.accuracy = level.predictions > 0 ? level.accurate / level.predictions : 0;
  }

  // Group by confidence level
  const byConfidenceLevel = [
    { level: 'high', predictions: 0, accurate: 0, accuracy: 0 },
    { level: 'medium', predictions: 0, accurate: 0, accuracy: 0 },
    { level: 'low', predictions: 0, accurate: 0, accuracy: 0 },
  ];

  for (const pred of predictions) {
    const conf = Number(pred.confidence);
    const level = conf >= 0.7 ? 'high' : conf >= 0.4 ? 'medium' : 'low';
    const levelEntry = byConfidenceLevel.find(l => l.level === level);
    if (levelEntry) {
      levelEntry.predictions++;
      if (pred.wasAccurate) levelEntry.accurate++;
    }
  }

  for (const level of byConfidenceLevel) {
    level.accuracy = level.predictions > 0 ? level.accurate / level.predictions : 0;
  }

  // Time-based metrics
  const last30DaysPreds = predictions.filter(p => p.outcomeDate && p.outcomeDate >= thirtyDaysAgo);
  const last90DaysPreds = predictions.filter(p => p.outcomeDate && p.outcomeDate >= ninetyDaysAgo);

  const accurateCount = predictions.filter(p => p.wasAccurate).length;
  const last30Accurate = last30DaysPreds.filter(p => p.wasAccurate).length;
  const last90Accurate = last90DaysPreds.filter(p => p.wasAccurate).length;

  return {
    totalPredictions: predictions.length,
    validatedPredictions: predictions.length,
    mape,
    rmse,
    correlationCoefficient: 0, // Would need actual vs predicted arrays to calculate
    byResponseLevel: byResponseLevel.filter(l => l.predictions > 0),
    byConfidenceLevel: byConfidenceLevel.filter(l => l.predictions > 0),
    byCondition: [], // Would need to group by condition
    last30Days: {
      predictions: last30DaysPreds.length,
      accuracy: last30DaysPreds.length > 0 ? last30Accurate / last30DaysPreds.length : 0,
    },
    last90Days: {
      predictions: last90DaysPreds.length,
      accuracy: last90DaysPreds.length > 0 ? last90Accurate / last90DaysPreds.length : 0,
    },
    overall: {
      predictions: predictions.length,
      accuracy: predictions.length > 0 ? accurateCount / predictions.length : 0,
    },
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}

interface ConditionAnalysis {
  symptomDuration: 'acute' | 'subacute' | 'chronic';
  severity: 'mild' | 'moderate' | 'severe';
  complexity: 'simple' | 'moderate' | 'complex';
  comorbidityCount: number;
  isRecurrent: boolean;
}

function analyzeCondition(
  conditionCode: string,
  encounters: { diagnoses: { icd10Code: string }[]; encounterDate: Date }[]
): ConditionAnalysis {
  // Get all diagnosis codes
  const allDiagnoses = encounters.flatMap(e => e.diagnoses.map(d => d.icd10Code));
  const uniqueDiagnoses = [...new Set(allDiagnoses)];

  // Determine symptom duration based on first encounter with this condition
  const firstEncounter = encounters.find(e =>
    e.diagnoses.some(d => d.icd10Code === conditionCode)
  );

  let symptomDuration: 'acute' | 'subacute' | 'chronic' = 'acute';
  if (firstEncounter) {
    const weeksSinceFirst = Math.floor(
      (Date.now() - firstEncounter.encounterDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    if (weeksSinceFirst > 12) {
      symptomDuration = 'chronic';
    } else if (weeksSinceFirst > 4) {
      symptomDuration = 'subacute';
    }
  }

  // Count comorbidities
  const comorbidityCount = Math.max(0, uniqueDiagnoses.length - 1);

  // Determine complexity
  const complexity = comorbidityCount >= 3 ? 'complex' :
    comorbidityCount >= 1 ? 'moderate' : 'simple';

  // Check for recurrence
  const conditionOccurrences = encounters.filter(e =>
    e.diagnoses.some(d => d.icd10Code === conditionCode)
  ).length;
  const isRecurrent = conditionOccurrences > 2;

  return {
    symptomDuration,
    severity: 'moderate', // Would need more data to determine
    complexity,
    comorbidityCount,
    isRecurrent,
  };
}

function calculateOutcomeFactors(
  patient: {
    demographics?: { dateOfBirth?: Date } | null;
    appointments?: { status: string }[];
    encounters?: { encounterDate: Date }[];
  },
  patientAge: number | null,
  conditionAnalysis: ConditionAnalysis,
  treatmentPlan: { completedVisits: number; plannedVisits?: number | null } | null,
  _config: TreatmentOutcomePredictionConfig
): OutcomePredictionFactor[] {
  const factors: OutcomePredictionFactor[] = [];

  // Age factor
  if (patientAge !== null) {
    const ageImpact = patientAge < 40 ? 'positive' : patientAge > 65 ? 'negative' : 'neutral';
    const ageScore = patientAge < 40 ? 0.8 : patientAge > 65 ? 0.4 : 0.6;
    factors.push({
      name: 'Patient Age',
      category: 'patient',
      weight: 0.1,
      value: patientAge,
      impact: ageImpact,
      contribution: ageScore * 0.1,
      description: `Patient is ${patientAge} years old. ${
        patientAge < 40 ? 'Younger patients typically recover faster.' :
        patientAge > 65 ? 'Older patients may need longer treatment duration.' :
        'Age is not a significant factor.'
      }`,
      modifiable: false,
    });
  }

  // Symptom duration factor
  const durationScore = conditionAnalysis.symptomDuration === 'acute' ? 0.9 :
    conditionAnalysis.symptomDuration === 'subacute' ? 0.6 : 0.3;
  factors.push({
    name: 'Symptom Duration',
    category: 'condition',
    weight: 0.2,
    value: conditionAnalysis.symptomDuration,
    impact: conditionAnalysis.symptomDuration === 'acute' ? 'positive' : 'negative',
    contribution: durationScore * 0.2,
    description: `Condition is ${conditionAnalysis.symptomDuration}. ${
      conditionAnalysis.symptomDuration === 'acute' ? 'Early intervention improves outcomes.' :
      conditionAnalysis.symptomDuration === 'chronic' ? 'Chronic conditions require longer treatment.' :
      'Subacute phase still has good prognosis.'
    }`,
    modifiable: false,
  });

  // Complexity factor
  const complexityScore = conditionAnalysis.complexity === 'simple' ? 0.9 :
    conditionAnalysis.complexity === 'moderate' ? 0.6 : 0.35;
  factors.push({
    name: 'Case Complexity',
    category: 'condition',
    weight: 0.15,
    value: conditionAnalysis.complexity,
    impact: conditionAnalysis.complexity === 'simple' ? 'positive' : 'negative',
    contribution: complexityScore * 0.15,
    description: `Case complexity is ${conditionAnalysis.complexity} with ${conditionAnalysis.comorbidityCount} comorbidities.`,
    modifiable: false,
  });

  // Attendance factor
  if (patient.appointments && patient.appointments.length > 0) {
    const completedCount = patient.appointments.filter(a => a.status === 'COMPLETED').length;
    const noShowCount = patient.appointments.filter(a => a.status === 'NO_SHOW').length;
    const attendanceRate = completedCount / (completedCount + noShowCount) || 1;
    const attendanceScore = attendanceRate;
    factors.push({
      name: 'Appointment Attendance',
      category: 'adherence',
      weight: 0.15,
      value: Math.round(attendanceRate * 100),
      impact: attendanceRate >= 0.9 ? 'positive' : attendanceRate < 0.7 ? 'negative' : 'neutral',
      contribution: attendanceScore * 0.15,
      description: `${Math.round(attendanceRate * 100)}% attendance rate. ${
        attendanceRate >= 0.9 ? 'Excellent adherence supports outcomes.' :
        attendanceRate < 0.7 ? 'Improving attendance would benefit outcomes.' :
        'Good attendance history.'
      }`,
      modifiable: true,
      improvementSuggestion: 'Maintain regular attendance and avoid cancellations.',
    });
  }

  // Treatment adherence factor (based on completed visits)
  if (treatmentPlan && treatmentPlan.plannedVisits && treatmentPlan.plannedVisits > 0) {
    const adherence = treatmentPlan.completedVisits / treatmentPlan.plannedVisits;
    factors.push({
      name: 'Treatment Plan Adherence',
      category: 'adherence',
      weight: 0.15,
      value: Math.round(adherence * 100),
      impact: adherence >= 0.8 ? 'positive' : adherence < 0.5 ? 'negative' : 'neutral',
      contribution: adherence * 0.15,
      description: `${treatmentPlan.completedVisits} of ${treatmentPlan.plannedVisits} planned visits completed.`,
      modifiable: true,
      improvementSuggestion: 'Complete remaining scheduled visits as planned.',
    });
  }

  // Recurrence factor
  if (conditionAnalysis.isRecurrent) {
    factors.push({
      name: 'Recurrent Condition',
      category: 'condition',
      weight: 0.1,
      value: 'Yes',
      impact: 'negative',
      contribution: 0.4 * 0.1,
      description: 'This condition has recurred multiple times. Maintenance care may be beneficial.',
      modifiable: false,
    });
  }

  // Lifestyle factors (placeholder - would need actual data)
  factors.push({
    name: 'Home Exercise Compliance',
    category: 'adherence',
    weight: 0.1,
    value: 'Unknown',
    impact: 'neutral',
    contribution: 0.5 * 0.1,
    description: 'Home exercise compliance affects outcomes significantly.',
    modifiable: true,
    improvementSuggestion: 'Follow prescribed home exercise program daily.',
  });

  return factors;
}

async function analyzeSimilarCases(
  organizationId: string,
  conditionCode: string,
  patientAge: number | null,
  symptomDuration: 'acute' | 'subacute' | 'chronic',
  minCases: number
): Promise<SimilarPatientOutcome | null> {
  // Find similar outcome predictions with actual outcomes
  const similarPredictions = await prisma.outcomePrediction.findMany({
    where: {
      organizationId,
      conditionCode,
      wasAccurate: { not: null },
      actualImprovement: { not: null },
      ...(symptomDuration === 'chronic' ? { symptomDuration: { contains: 'chronic' } } : {}),
    },
    take: 100,
  });

  if (similarPredictions.length < minCases) {
    return null;
  }

  const improvements = similarPredictions.map(p => Number(p.actualImprovement) || 0);
  const avgImprovement = improvements.reduce((a, b) => a + b, 0) / improvements.length;

  // Calculate outcome distribution
  const excellent = improvements.filter(i => i >= 80).length;
  const good = improvements.filter(i => i >= 60 && i < 80).length;
  const moderate = improvements.filter(i => i >= 40 && i < 60).length;
  const poor = improvements.filter(i => i < 40).length;

  return {
    caseCount: similarPredictions.length,
    averageImprovement: Math.round(avgImprovement),
    averageVisits: 12, // Would calculate from data
    averageWeeks: 8,  // Would calculate from data
    successRate: Math.round(((excellent + good) / similarPredictions.length) * 100),
    outcomeDistribution: {
      excellent: Math.round((excellent / similarPredictions.length) * 100),
      good: Math.round((good / similarPredictions.length) * 100),
      moderate: Math.round((moderate / similarPredictions.length) * 100),
      poor: Math.round((poor / similarPredictions.length) * 100),
    },
    keySuccessFactors: [
      'Early intervention (acute phase)',
      'High attendance rate (>90%)',
      'Home exercise compliance',
    ],
    keyFailureFactors: [
      'Chronic symptom duration',
      'Multiple comorbidities',
      'Poor attendance',
    ],
  };
}

function calculatePredictedImprovement(
  factors: OutcomePredictionFactor[],
  similarCases: SimilarPatientOutcome | null,
  config: TreatmentOutcomePredictionConfig
): { improvement: number; confidence: number; responseLevel: TreatmentResponseLevel } {
  // Sum weighted contributions from factors
  let improvement = factors.reduce((sum, f) => sum + f.contribution, 0) * 100;

  // Adjust based on similar cases if available
  if (similarCases) {
    improvement = (improvement + similarCases.averageImprovement) / 2;
  }

  // Clamp to 0-100
  improvement = Math.max(0, Math.min(100, improvement));

  // Calculate confidence based on factor completeness and similar cases
  let confidence = 0.5; // Base confidence

  // More factors = more confidence
  confidence += Math.min(0.2, factors.length * 0.02);

  // Similar cases add confidence
  if (similarCases && similarCases.caseCount >= config.minSimilarCases) {
    confidence += 0.2;
  }

  // High variance in factors reduces confidence
  const contributions = factors.map(f => f.contribution);
  const avgContribution = contributions.reduce((a, b) => a + b, 0) / contributions.length;
  const variance = contributions.reduce((sum, c) => sum + Math.pow(c - avgContribution, 2), 0) / contributions.length;
  confidence -= Math.min(0.2, variance);

  confidence = Math.max(0.1, Math.min(0.95, confidence));

  // Determine response level
  let responseLevel: TreatmentResponseLevel;
  if (improvement >= config.excellentThreshold) {
    responseLevel = 'excellent';
  } else if (improvement >= config.goodThreshold) {
    responseLevel = 'good';
  } else if (improvement >= config.moderateThreshold) {
    responseLevel = 'moderate';
  } else if (improvement > 0) {
    responseLevel = 'poor';
  } else {
    responseLevel = 'unknown';
  }

  return { improvement, confidence, responseLevel };
}

function generateResponsePredictions(
  expectedImprovement: number,
  confidence: number,
  symptomDuration: 'acute' | 'subacute' | 'chronic'
): TreatmentResponsePrediction[] {
  const baseWeeks = symptomDuration === 'acute' ? 4 :
    symptomDuration === 'subacute' ? 8 : 16;

  return [
    {
      responseLevel: 'excellent',
      probability: expectedImprovement >= 80 ? confidence * 0.8 :
        expectedImprovement >= 60 ? confidence * 0.3 : confidence * 0.1,
      timeToResponseWeeks: Math.round(baseWeeks * 0.75),
      description: 'Significant symptom relief with full functional recovery',
    },
    {
      responseLevel: 'good',
      probability: expectedImprovement >= 60 && expectedImprovement < 80 ? confidence * 0.7 :
        expectedImprovement >= 40 ? confidence * 0.5 : confidence * 0.2,
      timeToResponseWeeks: baseWeeks,
      description: 'Substantial improvement with minor residual symptoms',
    },
    {
      responseLevel: 'moderate',
      probability: expectedImprovement >= 40 && expectedImprovement < 60 ? confidence * 0.6 :
        confidence * 0.3,
      timeToResponseWeeks: Math.round(baseWeeks * 1.5),
      description: 'Noticeable improvement but symptoms persist',
    },
    {
      responseLevel: 'poor',
      probability: expectedImprovement < 40 ? confidence * 0.6 : confidence * 0.1,
      timeToResponseWeeks: Math.round(baseWeeks * 2),
      description: 'Minimal response, may need alternative approaches',
    },
  ];
}

function generateImprovementTimeline(
  expectedImprovement: number,
  symptomDuration: 'acute' | 'subacute' | 'chronic',
  config: TreatmentOutcomePredictionConfig
): ImprovementTimeline[] {
  const timeline: ImprovementTimeline[] = [];
  const totalWeeks = symptomDuration === 'acute' ? config.shortTermWeeks :
    symptomDuration === 'subacute' ? config.mediumTermWeeks : config.longTermWeeks;

  // Generate weekly milestones
  for (let week = 1; week <= totalWeeks; week++) {
    // Improvement follows logarithmic curve - faster early, slows down
    const weekProgress = Math.log(week + 1) / Math.log(totalWeeks + 1);
    const weekImprovement = Math.round(expectedImprovement * weekProgress);

    const isKeyWeek = week === 1 || week === 4 || week === 8 || week === 12 || week === totalWeeks;

    let milestone: string | null = null;
    if (week === 1) milestone = 'Initial response assessment';
    else if (week === 4) milestone = 'Short-term progress evaluation';
    else if (week === 8) milestone = 'Mid-treatment review';
    else if (week === 12) milestone = 'Long-term progress assessment';
    else if (week === totalWeeks) milestone = 'Treatment completion';

    timeline.push({
      week,
      expectedImprovement: weekImprovement,
      confidenceInterval: {
        min: Math.max(0, weekImprovement - 15),
        max: Math.min(100, weekImprovement + 15),
      },
      milestone,
      isKeyWeek,
    });
  }

  return timeline;
}

function assessNonResponseRisk(
  factors: OutcomePredictionFactor[],
  similarCases: SimilarPatientOutcome | null
): NonResponseRisk {
  // Calculate risk score based on negative factors
  const negativeFactors = factors.filter(f => f.impact === 'negative');
  let riskScore = negativeFactors.reduce((sum, f) => sum + (1 - f.contribution) * f.weight * 100, 0);

  // Adjust based on similar cases poor outcome rate
  if (similarCases) {
    riskScore = (riskScore + similarCases.outcomeDistribution.poor) / 2;
  }

  riskScore = Math.min(100, Math.max(0, riskScore));

  const riskLevel = riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low';

  const riskFactors = negativeFactors.map(f => f.name);

  const mitigationStrategies = [
    'Maintain consistent appointment attendance',
    'Complete prescribed home exercises daily',
    'Report any worsening symptoms immediately',
    'Follow lifestyle modification recommendations',
  ];

  const alternativeTreatments = riskScore >= 50 ? [
    'Consider multimodal approach with physical therapy',
    'Evaluate need for diagnostic imaging',
    'Discuss specialist referral options',
  ] : [];

  return {
    riskScore: Math.round(riskScore),
    riskLevel,
    riskFactors,
    mitigationStrategies,
    alternativeTreatments,
  };
}

function calculateOptimalDuration(
  _conditionCode: string,
  symptomDuration: 'acute' | 'subacute' | 'chronic',
  expectedImprovement: number,
  similarCases: SimilarPatientOutcome | null
): OptimalTreatmentDuration {
  // Base recommendations by symptom duration
  let baseVisits = symptomDuration === 'acute' ? 8 :
    symptomDuration === 'subacute' ? 12 : 18;
  let baseWeeks = symptomDuration === 'acute' ? 4 :
    symptomDuration === 'subacute' ? 8 : 16;

  // Adjust based on similar cases
  if (similarCases) {
    baseVisits = Math.round((baseVisits + similarCases.averageVisits) / 2);
    baseWeeks = Math.round((baseWeeks + similarCases.averageWeeks) / 2);
  }

  // Adjust based on expected improvement
  if (expectedImprovement < 50) {
    baseVisits = Math.round(baseVisits * 1.25);
    baseWeeks = Math.round(baseWeeks * 1.25);
  }

  const frequency = symptomDuration === 'acute' ? '2-3x/week' :
    symptomDuration === 'subacute' ? '2x/week' : '1-2x/week';

  return {
    recommendedVisits: baseVisits,
    recommendedWeeks: baseWeeks,
    confidenceInterval: {
      minVisits: Math.round(baseVisits * 0.75),
      maxVisits: Math.round(baseVisits * 1.25),
      minWeeks: Math.round(baseWeeks * 0.75),
      maxWeeks: Math.round(baseWeeks * 1.25),
    },
    rationale: `Based on ${symptomDuration} symptom duration and expected ${expectedImprovement}% improvement`,
    diminishingReturnsAt: Math.round(baseVisits * 0.8),
    frequency,
    phasedPlan: [
      {
        phase: 'Acute/Intensive',
        visits: Math.round(baseVisits * 0.4),
        weeks: Math.round(baseWeeks * 0.3),
        frequency: '2-3x/week',
        goals: ['Pain reduction', 'Restore mobility', 'Reduce inflammation'],
      },
      {
        phase: 'Corrective',
        visits: Math.round(baseVisits * 0.4),
        weeks: Math.round(baseWeeks * 0.4),
        frequency: '1-2x/week',
        goals: ['Strengthen supporting structures', 'Improve function', 'Address underlying issues'],
      },
      {
        phase: 'Maintenance',
        visits: Math.round(baseVisits * 0.2),
        weeks: Math.round(baseWeeks * 0.3),
        frequency: '1x/week to 2x/month',
        goals: ['Maintain improvements', 'Prevent recurrence', 'Optimize wellness'],
      },
    ],
  };
}

function calculateChronicityRisk(
  symptomDuration: 'acute' | 'subacute' | 'chronic',
  factors: OutcomePredictionFactor[],
  patientAge: number | null
): number {
  let risk = symptomDuration === 'acute' ? 10 :
    symptomDuration === 'subacute' ? 30 : 60;

  // Adjust for negative factors
  const negativeCount = factors.filter(f => f.impact === 'negative').length;
  risk += negativeCount * 5;

  // Age adjustment
  if (patientAge && patientAge > 65) {
    risk += 10;
  }

  return Math.min(100, Math.max(0, risk));
}

function calculateComparison(
  name: string,
  patientValue: number,
  averageValue: number,
  stdDev: number
): PatientOutcomeComparison {
  const zScore = (patientValue - averageValue) / stdDev;
  // Convert z-score to percentile (approximate)
  const percentile = Math.round(50 + zScore * 34);

  return {
    patientValue,
    averageValue,
    percentile: Math.max(0, Math.min(100, percentile)),
    interpretation: percentile > 75 ? 'Above average' :
      percentile < 25 ? 'Below average' : 'Within normal range',
    isAboveAverage: percentile > 50,
  };
}

function generatePatientExplanation(
  responseLevel: TreatmentResponseLevel,
  improvement: number,
  timeline: ImprovementTimeline[],
  optimalDuration: OptimalTreatmentDuration
): string {
  const keyWeeks = timeline.filter(t => t.isKeyWeek);
  const milestones = keyWeeks.map(t => `Week ${t.week}: ${t.milestone}`).join('; ');

  if (responseLevel === 'excellent') {
    return `Based on your condition and history, you have an excellent prognosis with an expected ${improvement}% improvement. ` +
      `We recommend a treatment plan of approximately ${optimalDuration.recommendedVisits} visits over ${optimalDuration.recommendedWeeks} weeks. ` +
      `Key checkpoints: ${milestones}. Most patients with similar conditions respond very well to care.`;
  } else if (responseLevel === 'good') {
    return `Your prognosis is good with an expected ${improvement}% improvement. ` +
      `A treatment plan of ${optimalDuration.recommendedVisits} visits over ${optimalDuration.recommendedWeeks} weeks is recommended. ` +
      `You should see noticeable improvement by week ${keyWeeks[1]?.week || 4}. Following home care instructions will help optimize results.`;
  } else if (responseLevel === 'moderate') {
    return `Based on our analysis, moderate improvement of about ${improvement}% is expected. ` +
      `This will require consistent care over ${optimalDuration.recommendedWeeks} weeks. ` +
      `Adherence to the treatment plan and home exercises is especially important for your case.`;
  } else {
    return `Your condition presents some challenges, and we'll work together closely to achieve the best possible outcome. ` +
      `Regular attendance and following all recommendations will be crucial. ` +
      `We'll reassess progress at week 4 and adjust the plan as needed.`;
  }
}

function generateExpectationPoints(
  responseLevel: TreatmentResponseLevel,
  optimalDuration: OptimalTreatmentDuration,
  nonResponseRisk: NonResponseRisk
): string[] {
  const points: string[] = [];

  points.push(`Treatment duration: approximately ${optimalDuration.recommendedWeeks} weeks with ${optimalDuration.recommendedVisits} visits`);
  points.push(`Visit frequency: ${optimalDuration.frequency}`);

  if (responseLevel === 'excellent' || responseLevel === 'good') {
    points.push('Expect to see improvement within the first 2-4 weeks');
    points.push('Some mild soreness after initial treatments is normal');
  } else {
    points.push('Progress may be gradual; patience is important');
    points.push('We will reassess and adjust the plan regularly');
  }

  if (nonResponseRisk.riskLevel !== 'low') {
    points.push('Consistent attendance is especially important for your condition');
    points.push('Home exercises between visits will significantly impact your results');
  }

  return points;
}

function generateHomeInstructions(
  conditionCode: string,
  modifiableFactors: OutcomePredictionFactor[]
): string[] {
  const instructions: string[] = [];

  // Generic instructions based on modifiable factors
  for (const factor of modifiableFactors) {
    if (factor.improvementSuggestion) {
      instructions.push(factor.improvementSuggestion);
    }
  }

  // Condition-specific instructions (based on ICD-10 categories)
  if (conditionCode.startsWith('M54')) { // Back pain
    instructions.push('Apply ice for 15-20 minutes after activities that aggravate symptoms');
    instructions.push('Avoid prolonged sitting; take breaks every 30-45 minutes');
    instructions.push('Practice proper lifting technique: bend at knees, not waist');
  } else if (conditionCode.startsWith('M53')) { // Cervical conditions
    instructions.push('Maintain proper posture especially when using devices');
    instructions.push('Use a supportive pillow that keeps neck aligned with spine');
    instructions.push('Take regular breaks from screen time');
  }

  // Always include these
  instructions.push('Stay adequately hydrated (8+ glasses of water daily)');
  instructions.push('Get 7-9 hours of quality sleep each night');

  return instructions;
}

function generateOutcomeDescription(prediction: TreatmentOutcomePredictionResult): string {
  return `Expected ${prediction.predictedOutcome} response with ${prediction.predictedImprovement}% improvement ` +
    `over ${prediction.expectedTimelineWeeks} weeks. ` +
    `Key positive factors: ${prediction.topPositiveFactors.join(', ') || 'None identified'}. ` +
    `Areas for attention: ${prediction.topNegativeFactors.join(', ') || 'None identified'}.`;
}
