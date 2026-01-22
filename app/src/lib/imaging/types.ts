/**
 * Imaging Types
 * Epic 22: Imaging & X-Ray Integration
 *
 * Type definitions for imaging upload and storage
 */

import type { ImagingModality } from '@prisma/client';

// Supported MIME types for imaging
export const SUPPORTED_MIME_TYPES = {
  // DICOM
  'application/dicom': {
    extension: '.dcm',
    isDicom: true,
  },
  // Standard image formats
  'image/jpeg': {
    extension: '.jpg',
    isDicom: false,
  },
  'image/png': {
    extension: '.png',
    isDicom: false,
  },
  'image/webp': {
    extension: '.webp',
    isDicom: false,
  },
} as const;

export type SupportedMimeType = keyof typeof SUPPORTED_MIME_TYPES;

// Image upload input
export interface ImageUploadInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  base64Data: string;
  // Optional DICOM metadata
  seriesNumber?: number;
  instanceNumber?: number;
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  // View information
  viewPosition?: string;
  bodyPartExamined?: string;
  laterality?: string;
  // DICOM window/level
  windowCenter?: number;
  windowWidth?: number;
}

// Bulk upload input for multi-image studies
export interface BulkImageUploadInput {
  images: ImageUploadInput[];
}

// Storage result
export interface StorageResult {
  imageUrl: string;
  thumbnailUrl: string | null;
  originalUrl: string;
  width: number | null;
  height: number | null;
  compressedSize: number | null;
}

// DICOM metadata extracted from file
export interface DicomMetadata {
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  modality?: string;
  patientName?: string;
  patientId?: string;
  studyDate?: Date;
  bodyPartExamined?: string;
  viewPosition?: string;
  laterality?: string;
  rows?: number;
  columns?: number;
  windowCenter?: number;
  windowWidth?: number;
}

// Image processing options
export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  thumbnailSize?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

// Default processing options
export const DEFAULT_PROCESSING_OPTIONS: ImageProcessingOptions = {
  maxWidth: 2048,
  maxHeight: 2048,
  thumbnailSize: 256,
  quality: 85,
  format: 'webp',
};

// Upload status for bulk uploads
export interface ImageUploadStatus {
  fileName: string;
  success: boolean;
  imageId?: string;
  error?: string;
}

// Body parts for imaging
export const BODY_PARTS = [
  'Cervical Spine',
  'Thoracic Spine',
  'Lumbar Spine',
  'Sacrum',
  'Full Spine',
  'Pelvis',
  'Hip',
  'Knee',
  'Ankle',
  'Foot',
  'Shoulder',
  'Elbow',
  'Wrist',
  'Hand',
  'Skull',
  'Chest',
  'Abdomen',
  'Other',
] as const;

export type BodyPart = (typeof BODY_PARTS)[number];

// View positions
export const VIEW_POSITIONS = [
  'AP', // Anterior-Posterior
  'PA', // Posterior-Anterior
  'LAT', // Lateral
  'OBL', // Oblique
  'LLAT', // Left Lateral
  'RLAT', // Right Lateral
  'LOBL', // Left Oblique
  'ROBL', // Right Oblique
  'FLEX', // Flexion
  'EXT', // Extension
  'AX', // Axial
  'OTHER',
] as const;

export type ViewPosition = (typeof VIEW_POSITIONS)[number];

// Laterality
export const LATERALITY_OPTIONS = ['L', 'R', 'B'] as const; // Left, Right, Bilateral

export type Laterality = (typeof LATERALITY_OPTIONS)[number];

// Map modality string to enum
export function parseModality(modality?: string): ImagingModality {
  if (!modality) return 'XRAY';
  const upper = modality.toUpperCase();
  if (upper === 'MR' || upper === 'MRI') return 'MRI';
  if (upper === 'CT') return 'CT';
  if (upper === 'US' || upper === 'ULTRASOUND') return 'ULTRASOUND';
  return 'XRAY'; // Default to X-Ray
}
