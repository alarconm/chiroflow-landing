/**
 * Imaging Components
 * Epic 22: Imaging & X-Ray Integration
 *
 * Export all imaging components for use throughout the application
 */

export { DICOMViewer, type DICOMViewerProps } from './DICOMViewer';
export { AnnotationToolbar, type AnnotationToolbarProps } from './AnnotationToolbar';
export { AnnotationCanvas, drawAnnotations, type AnnotationCanvasProps } from './AnnotationCanvas';
export {
  SpinalMeasurementTools,
  type SpinalMeasurementToolsProps,
  type SpinalMeasurementType,
  type SpinalMeasurement,
} from './SpinalMeasurementTools';

export {
  type ViewportState,
  type ViewerTool,
  type ViewerImage,
  type ViewerSeries,
  type Point,
  type Measurement,
  type RulerMeasurement,
  type AngleMeasurement,
  type CobbAngleMeasurement,
  type EllipseMeasurement,
  type RectangleMeasurement,
  type TextAnnotation,
  type ArrowAnnotation,
  type LineAnnotation,
  type CircleAnnotation,
  type FreehandAnnotation,
  type TextWithLeaderAnnotation,
  type GeorgesLineAnnotation,
  type ToolConfig,
  type WindowPreset,
  DEFAULT_VIEWPORT_STATE,
  VIEWER_TOOLS,
  WINDOW_PRESETS,
  MEASUREMENT_COLORS,
  calculateDistance,
  calculateAngle,
  calculateCobbAngle,
  calculateEllipseArea,
  calculateRectangleArea,
  pixelsToMm,
  generateMeasurementId,
} from './types';
