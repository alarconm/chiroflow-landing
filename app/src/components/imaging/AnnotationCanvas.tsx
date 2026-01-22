'use client';

/**
 * Annotation Canvas Component
 * Epic 22: Imaging & X-Ray Integration (US-227)
 *
 * Canvas-based annotation component for drawing:
 * - Arrows pointing to areas of interest
 * - Lines and measurement lines
 * - Text labels with leader lines
 * - Circles and ellipses for highlighting regions
 * - Freehand drawing
 * - George's line for cervical spine assessment
 */

import { useRef, useCallback, useEffect } from 'react';
import {
  type Point,
  type Measurement,
  type ArrowAnnotation,
  type LineAnnotation,
  type CircleAnnotation,
  type FreehandAnnotation,
  type TextWithLeaderAnnotation,
  type GeorgesLineAnnotation,
  type TextAnnotation,
  type RulerMeasurement,
  type AngleMeasurement,
  type CobbAngleMeasurement,
  MEASUREMENT_COLORS,
} from './types';

export interface AnnotationCanvasProps {
  width: number;
  height: number;
  annotations: Measurement[];
  color: string;
  lineWidth: number;
  fontSize: number;
  imageToCanvas: (x: number, y: number) => Point;
}

/**
 * Draw an arrow from start to end point with arrowhead
 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  lineWidth: number,
  headSize: number = 15
) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw line
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headSize * Math.cos(angle - Math.PI / 6),
    end.y - headSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    end.x - headSize * Math.cos(angle + Math.PI / 6),
    end.y - headSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw a line with optional label
 */
function drawLine(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  lineWidth: number,
  label?: string,
  fontSize: number = 14
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Draw endpoints
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(start.x, start.y, lineWidth + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(end.x, end.y, lineWidth + 2, 0, Math.PI * 2);
  ctx.fill();

  // Draw label if provided
  if (label) {
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(label, midX + 5, midY - 5);
  }
}

/**
 * Draw a circle highlight
 */
function drawCircle(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  color: string,
  lineWidth: number,
  fillOpacity: number = 0.1,
  label?: string,
  fontSize: number = 14
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Fill with transparency
  if (fillOpacity > 0) {
    ctx.fillStyle = color + Math.round(fillOpacity * 255).toString(16).padStart(2, '0');
    ctx.fill();
  }

  // Draw label if provided
  if (label) {
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(label, center.x + radius + 5, center.y);
  }
}

/**
 * Draw freehand path
 */
function drawFreehand(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  lineWidth: number,
  isClosed: boolean = false
) {
  if (points.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  if (isClosed && points.length > 2) {
    ctx.closePath();
  }

  ctx.stroke();
}

/**
 * Draw text with leader line
 */
function drawTextWithLeader(
  ctx: CanvasRenderingContext2D,
  anchor: Point,
  textPos: Point,
  text: string,
  color: string,
  lineWidth: number,
  fontSize: number
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  // Draw leader line
  ctx.beginPath();
  ctx.moveTo(anchor.x, anchor.y);
  ctx.lineTo(textPos.x, textPos.y);
  ctx.stroke();

  // Draw anchor point
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 4, 0, Math.PI * 2);
  ctx.fill();

  // Draw text with background
  ctx.font = `${fontSize}px sans-serif`;
  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = fontSize;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(textPos.x - 2, textPos.y - textHeight, textWidth + 4, textHeight + 4);

  // Text
  ctx.fillStyle = color;
  ctx.fillText(text, textPos.x, textPos.y);
}

/**
 * Draw George's line for cervical spine assessment
 */
function drawGeorgesLine(
  ctx: CanvasRenderingContext2D,
  vertebralLevels: { level: string; point: Point; deviation?: number }[],
  color: string,
  lineWidth: number,
  fontSize: number
) {
  if (vertebralLevels.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([5, 5]);

  // Draw connecting line
  ctx.beginPath();
  ctx.moveTo(vertebralLevels[0].point.x, vertebralLevels[0].point.y);
  for (let i = 1; i < vertebralLevels.length; i++) {
    ctx.lineTo(vertebralLevels[i].point.x, vertebralLevels[i].point.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw vertebral level markers
  ctx.font = `${fontSize}px sans-serif`;
  vertebralLevels.forEach(({ level, point, deviation }) => {
    // Point marker
    ctx.fillStyle = deviation && deviation > 2 ? '#FF0000' : color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Level label
    ctx.fillStyle = color;
    ctx.fillText(level, point.x + 10, point.y - 5);

    // Deviation indicator if abnormal
    if (deviation && deviation > 2) {
      ctx.fillStyle = '#FF0000';
      ctx.fillText(`${deviation.toFixed(1)}mm`, point.x + 10, point.y + 12);
    }
  });
}

/**
 * Main drawing function for all annotations
 */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: Measurement[],
  imageToCanvas: (x: number, y: number) => Point,
  defaultColor: string = '#FF0000',
  defaultLineWidth: number = 2,
  defaultFontSize: number = 14
) {
  annotations.forEach((annotation) => {
    const color = annotation.color || defaultColor;
    const lineWidth = defaultLineWidth;
    const fontSize = defaultFontSize;

    if (!annotation.isVisible) return;

    switch (annotation.type) {
      case 'arrow': {
        const arrow = annotation as ArrowAnnotation;
        const start = imageToCanvas(arrow.startPoint.x, arrow.startPoint.y);
        const end = imageToCanvas(arrow.endPoint.x, arrow.endPoint.y);
        drawArrow(ctx, start, end, color, lineWidth, arrow.arrowHeadSize || 15);
        if (arrow.label) {
          ctx.font = `${fontSize}px sans-serif`;
          ctx.fillStyle = color;
          ctx.fillText(arrow.label, start.x + 5, start.y - 5);
        }
        break;
      }

      case 'line': {
        const line = annotation as LineAnnotation;
        const start = imageToCanvas(line.startPoint.x, line.startPoint.y);
        const end = imageToCanvas(line.endPoint.x, line.endPoint.y);
        drawLine(ctx, start, end, color, lineWidth, line.label, fontSize);
        break;
      }

      case 'circle': {
        const circle = annotation as CircleAnnotation;
        const center = imageToCanvas(circle.center.x, circle.center.y);
        // Scale radius based on viewport zoom would need additional context
        drawCircle(ctx, center, circle.radius, color, lineWidth, circle.fillOpacity, circle.label, fontSize);
        break;
      }

      case 'freehand': {
        const freehand = annotation as FreehandAnnotation;
        const canvasPoints = freehand.points.map((p) => imageToCanvas(p.x, p.y));
        drawFreehand(ctx, canvasPoints, color, lineWidth, freehand.isClosed);
        break;
      }

      case 'textWithLeader': {
        const textLeader = annotation as TextWithLeaderAnnotation;
        const anchor = imageToCanvas(textLeader.anchorPoint.x, textLeader.anchorPoint.y);
        const textPos = imageToCanvas(textLeader.textPosition.x, textLeader.textPosition.y);
        drawTextWithLeader(ctx, anchor, textPos, textLeader.text, color, lineWidth, textLeader.fontSize);
        break;
      }

      case 'georgesLine': {
        const georges = annotation as GeorgesLineAnnotation;
        const canvasLevels = georges.vertebralLevels.map((v) => ({
          ...v,
          point: imageToCanvas(v.point.x, v.point.y),
        }));
        drawGeorgesLine(ctx, canvasLevels, color, lineWidth, fontSize);
        break;
      }

      case 'text': {
        const text = annotation as TextAnnotation;
        const pos = imageToCanvas(text.position.x, text.position.y);
        ctx.font = `${text.fontSize}px sans-serif`;
        ctx.fillStyle = color;
        ctx.fillText(text.text, pos.x, pos.y);
        break;
      }

      case 'ruler': {
        const ruler = annotation as RulerMeasurement;
        const start = imageToCanvas(ruler.startPoint.x, ruler.startPoint.y);
        const end = imageToCanvas(ruler.endPoint.x, ruler.endPoint.y);

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        // Endpoints
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(start.x, start.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Label
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillText(`${ruler.value.toFixed(1)} ${ruler.unit}`, midX + 5, midY - 5);
        break;
      }

      case 'angle': {
        const angle = annotation as AngleMeasurement;
        const [p1, vertex, p3] = angle.points.map((p) => imageToCanvas(p.x, p.y));

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(vertex.x, vertex.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.stroke();

        // Points
        ctx.fillStyle = color;
        [p1, vertex, p3].forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });

        // Arc
        const angle1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
        const angle2 = Math.atan2(p3.y - vertex.y, p3.x - vertex.x);
        ctx.beginPath();
        ctx.arc(vertex.x, vertex.y, 30, angle1, angle2);
        ctx.stroke();

        // Label
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillText(`${angle.value.toFixed(1)}°`, vertex.x + 35, vertex.y);
        break;
      }

      case 'cobbAngle': {
        const cobb = annotation as CobbAngleMeasurement;
        const l1Start = imageToCanvas(cobb.line1.start.x, cobb.line1.start.y);
        const l1End = imageToCanvas(cobb.line1.end.x, cobb.line1.end.y);
        const l2Start = imageToCanvas(cobb.line2.start.x, cobb.line2.start.y);
        const l2End = imageToCanvas(cobb.line2.end.x, cobb.line2.end.y);

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;

        // Line 1
        ctx.beginPath();
        ctx.moveTo(l1Start.x, l1Start.y);
        ctx.lineTo(l1End.x, l1End.y);
        ctx.stroke();

        // Line 2
        ctx.beginPath();
        ctx.moveTo(l2Start.x, l2Start.y);
        ctx.lineTo(l2End.x, l2End.y);
        ctx.stroke();

        // Points
        ctx.fillStyle = color;
        [l1Start, l1End, l2Start, l2End].forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });

        // Label
        const midY = (l1Start.y + l2Start.y) / 2;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillText(
          `Cobb: ${cobb.value.toFixed(1)}°${cobb.label ? ` (${cobb.label})` : ''}`,
          Math.max(l1Start.x, l2Start.x) + 10,
          midY
        );
        break;
      }
    }
  });
}

/**
 * Annotation Canvas Component
 */
export function AnnotationCanvas({
  width,
  height,
  annotations,
  color,
  lineWidth,
  fontSize,
  imageToCanvas,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw all annotations
    drawAnnotations(ctx, annotations, imageToCanvas, color, lineWidth, fontSize);
  }, [width, height, annotations, color, lineWidth, fontSize, imageToCanvas]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ width, height }}
    />
  );
}

export default AnnotationCanvas;
