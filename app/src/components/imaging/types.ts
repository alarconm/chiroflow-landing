/**
 * DICOM Viewer Types
 * Epic 22: Imaging & X-Ray Integration
 *
 * Type definitions for the DICOM viewer component
 */

// Viewport transformation state
export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  windowCenter: number;
  windowWidth: number;
  invert: boolean;
}

// Default viewport state
export const DEFAULT_VIEWPORT_STATE: ViewportState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  windowCenter: 128,
  windowWidth: 256,
  invert: false,
};

// Tool types for the viewer
export type ViewerTool =
  | 'pan'
  | 'zoom'
  | 'windowLevel'
  | 'ruler'
  | 'angle'
  | 'cobbAngle'
  | 'ellipse'
  | 'rectangle'
  | 'text';

// Measurement point
export interface Point {
  x: number;
  y: number;
}

// Base measurement
export interface BaseMeasurement {
  id: string;
  imageId: string;
  color: string;
  isVisible: boolean;
  createdAt: Date;
}

// Ruler measurement (distance between two points)
export interface RulerMeasurement extends BaseMeasurement {
  type: 'ruler';
  startPoint: Point;
  endPoint: Point;
  value: number; // in mm
  unit: string;
}

// Angle measurement (three points)
export interface AngleMeasurement extends BaseMeasurement {
  type: 'angle';
  points: [Point, Point, Point]; // vertex is middle point
  value: number; // in degrees
}

// Cobb angle measurement (four points - two line segments)
export interface CobbAngleMeasurement extends BaseMeasurement {
  type: 'cobbAngle';
  line1: { start: Point; end: Point };
  line2: { start: Point; end: Point };
  value: number; // in degrees
  label?: string;
}

// Ellipse measurement (area)
export interface EllipseMeasurement extends BaseMeasurement {
  type: 'ellipse';
  center: Point;
  radiusX: number;
  radiusY: number;
  area: number; // in mm^2
}

// Rectangle measurement (area)
export interface RectangleMeasurement extends BaseMeasurement {
  type: 'rectangle';
  topLeft: Point;
  width: number;
  height: number;
  area: number; // in mm^2
}

// Text annotation
export interface TextAnnotation extends BaseMeasurement {
  type: 'text';
  position: Point;
  text: string;
  fontSize: number;
}

// Union of all measurement types
export type Measurement =
  | RulerMeasurement
  | AngleMeasurement
  | CobbAngleMeasurement
  | EllipseMeasurement
  | RectangleMeasurement
  | TextAnnotation;

// Image data for the viewer
export interface ViewerImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  pixelSpacing?: { x: number; y: number }; // mm per pixel
  windowCenter?: number;
  windowWidth?: number;
  seriesNumber?: number;
  instanceNumber?: number;
  viewPosition?: string;
  bodyPart?: string;
}

// Series of images
export interface ViewerSeries {
  id: string;
  seriesNumber: number;
  description?: string;
  images: ViewerImage[];
}

// DICOM viewer props
export interface DICOMViewerProps {
  images: ViewerImage[];
  initialImageIndex?: number;
  measurements?: Measurement[];
  onMeasurementsChange?: (measurements: Measurement[]) => void;
  onImageChange?: (imageIndex: number) => void;
  readOnly?: boolean;
  showToolbar?: boolean;
  showThumbnails?: boolean;
  className?: string;
}

// Tool configuration
export interface ToolConfig {
  id: ViewerTool;
  name: string;
  icon: string;
  shortcut?: string;
  description: string;
}

// Viewer tools configuration
export const VIEWER_TOOLS: ToolConfig[] = [
  { id: 'pan', name: 'Pan', icon: 'Move', shortcut: 'P', description: 'Pan the image' },
  { id: 'zoom', name: 'Zoom', icon: 'ZoomIn', shortcut: 'Z', description: 'Zoom in/out' },
  { id: 'windowLevel', name: 'Window/Level', icon: 'SunMedium', shortcut: 'W', description: 'Adjust brightness/contrast' },
  { id: 'ruler', name: 'Ruler', icon: 'Ruler', shortcut: 'R', description: 'Measure distance' },
  { id: 'angle', name: 'Angle', icon: 'Compass', shortcut: 'A', description: 'Measure angle' },
  { id: 'cobbAngle', name: 'Cobb Angle', icon: 'Triangle', shortcut: 'C', description: 'Measure Cobb angle for scoliosis' },
  { id: 'ellipse', name: 'Ellipse', icon: 'Circle', shortcut: 'E', description: 'Measure ellipse area' },
  { id: 'rectangle', name: 'Rectangle', icon: 'Square', shortcut: 'Q', description: 'Measure rectangle area' },
  { id: 'text', name: 'Text', icon: 'Type', shortcut: 'T', description: 'Add text annotation' },
];

// Preset window/level values for different imaging types
export const WINDOW_PRESETS = {
  default: { center: 128, width: 256, name: 'Default' },
  bone: { center: 300, width: 1500, name: 'Bone' },
  softTissue: { center: 50, width: 400, name: 'Soft Tissue' },
  lung: { center: -600, width: 1500, name: 'Lung' },
  brain: { center: 40, width: 80, name: 'Brain' },
  abdomen: { center: 60, width: 400, name: 'Abdomen' },
  spine: { center: 200, width: 1000, name: 'Spine' },
} as const;

export type WindowPreset = keyof typeof WINDOW_PRESETS;

// Measurement colors
export const MEASUREMENT_COLORS = {
  ruler: '#00ff00',
  angle: '#00ffff',
  cobbAngle: '#ff00ff',
  ellipse: '#ffff00',
  rectangle: '#ff8800',
  text: '#ffffff',
} as const;

// Calculate distance between two points in pixels
export function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Calculate angle from three points (vertex is middle point)
export function calculateAngle(p1: Point, vertex: Point, p3: Point): number {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p3.x - vertex.x, y: p3.y - vertex.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

// Calculate Cobb angle from two line segments
export function calculateCobbAngle(
  line1: { start: Point; end: Point },
  line2: { start: Point; end: Point }
): number {
  // Direction vectors
  const v1 = { x: line1.end.x - line1.start.x, y: line1.end.y - line1.start.y };
  const v2 = { x: line2.end.x - line2.start.x, y: line2.end.y - line2.start.y };

  // Calculate angle between vectors
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  const angle = Math.acos(cosAngle) * (180 / Math.PI);

  // Cobb angle is the acute angle
  return angle > 90 ? 180 - angle : angle;
}

// Calculate ellipse area
export function calculateEllipseArea(radiusX: number, radiusY: number): number {
  return Math.PI * radiusX * radiusY;
}

// Calculate rectangle area
export function calculateRectangleArea(width: number, height: number): number {
  return width * height;
}

// Convert pixel distance to mm using pixel spacing
export function pixelsToMm(pixels: number, pixelSpacing: number): number {
  return pixels * pixelSpacing;
}

// Generate unique ID for measurements
export function generateMeasurementId(): string {
  return `meas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
