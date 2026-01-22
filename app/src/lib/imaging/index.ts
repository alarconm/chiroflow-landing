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
