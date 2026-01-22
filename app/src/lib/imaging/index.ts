/**
 * Imaging Library
 * Epic 22: Imaging & X-Ray Integration
 *
 * Main exports for imaging functionality
 */

// Types
export * from './types';

// Storage
export {
  isSupportedMimeType,
  isDicomFile,
  validateImageFile,
  parseDicomMetadata,
  compressImage,
  generateThumbnail,
  storeImage,
  storeImages,
  deleteStoredImage,
  generateSignedUrl,
} from './storage';

// Spinal Measurements (US-228)
export {
  SpinalMeasurements,
  measureCobbAngle,
  measureCervicalLordosis,
  measureLumbarLordosis,
  measureDiscHeight,
  measureVertebralHeightRatio,
  measureAtlasPlane,
  NORMAL_RANGES,
  SCOLIOSIS_CLASSIFICATION,
  CURVATURE_CLASSIFICATION,
  DISC_DEGENERATION_GRADES,
  COMPRESSION_GRADES,
  type Point as SpinalPoint,
  type NormalRange,
  type DeviationSeverity,
  type SpinalMeasurementResult,
  type CobbAngleInput,
  type LordosisInput,
  type DiscHeightInput,
  type VertebralHeightInput,
  type AtlasPlaneInput,
} from './spinal-measurements';

// Imaging Reports (US-229)
export {
  // Types
  type ImagingFindingCategory,
  type ImagingFindingSeverity,
  type ImagingStructuredFinding,
  type ImagingFindingTemplate,
  type ImagingReportTemplate,
  type ImagingReportContext,
  // Constants
  FINDING_CATEGORIES,
  SEVERITY_DEFINITIONS,
  FINDING_TEMPLATES,
  REPORT_SECTIONS,
  REPORT_TEMPLATES,
  STATUS_TRANSITIONS,
  // Functions
  getValidTransitions,
  isValidTransition,
  getReportTemplate,
  getFindingsByCategory,
  getFindingsByLocation,
  generateFindingId,
  createFindingFromTemplate,
  formatMeasurementsForReport,
  formatFindingsForReport,
  generateImpression,
  generateRecommendations,
  validateReportForTransition,
} from './reports';

// AI Imaging Analysis (US-230)
export {
  // Types
  type Point as AIPoint,
  type BoundingBox,
  type VertebralLevel,
  type SpinalRegion,
  type AbnormalityType,
  type AbnormalitySeverity,
  type ConfidenceLevel,
  type DetectedVertebra,
  type DetectedAbnormality,
  type SuggestedMeasurement,
  type AIFinding,
  type AIAnalysisResult,
  type AIAnalysisInput,
  type AIAnalysisOptions,
  // Constants
  VERTEBRAL_LEVELS,
  ABNORMALITY_DESCRIPTIONS,
  SEVERITY_THRESHOLDS,
  CONFIDENCE_THRESHOLDS,
  AI_MODEL_VERSION,
  AI_DISCLAIMERS,
  // Helper Functions
  getConfidenceLevel,
  generateAIFindingId,
  getSpinalRegion,
  calculateDistance as aiCalculateDistance,
  calculateAngle as aiCalculateAngle,
  classifyScoliosisSeverity,
  // Analysis Functions
  detectVertebralLevels,
  suggestMeasurements,
  detectAbnormalities,
  generatePreliminaryFindings,
  generateOverallAssessment,
  assessImageQuality,
  determineReviewPriority,
  analyzeImage,
  validateAnalysisResult,
} from './ai-analysis';
