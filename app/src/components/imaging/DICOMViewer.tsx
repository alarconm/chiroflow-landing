'use client';

/**
 * DICOM Viewer Component
 * Epic 22: Imaging & X-Ray Integration (US-226)
 *
 * Web-based DICOM viewer with:
 * - Zoom, pan, rotate controls
 * - Window/level adjustment
 * - Measurement tools (ruler, angle, Cobb angle)
 * - Multi-frame support for series
 * - Full-screen viewing mode
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Move,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Minimize2,
  SunMedium,
  Ruler,
  Compass,
  Triangle,
  Circle,
  Square,
  Type,
  Undo2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  RefreshCw,
  Download,
  Settings,
} from 'lucide-react';
import {
  type ViewportState,
  type ViewerTool,
  type ViewerImage,
  type Measurement,
  type Point,
  type RulerMeasurement,
  type AngleMeasurement,
  type CobbAngleMeasurement,
  type TextAnnotation,
  DEFAULT_VIEWPORT_STATE,
  VIEWER_TOOLS,
  WINDOW_PRESETS,
  MEASUREMENT_COLORS,
  calculateDistance,
  calculateAngle,
  calculateCobbAngle,
  generateMeasurementId,
  pixelsToMm,
} from './types';

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

export function DICOMViewer({
  images,
  initialImageIndex = 0,
  measurements: externalMeasurements,
  onMeasurementsChange,
  onImageChange,
  readOnly = false,
  showToolbar = true,
  showThumbnails = true,
  className,
}: DICOMViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // State
  const [currentImageIndex, setCurrentImageIndex] = useState(initialImageIndex);
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT_STATE);
  const [activeTool, setActiveTool] = useState<ViewerTool>('pan');
  const [measurements, setMeasurements] = useState<Measurement[]>(externalMeasurements || []);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Drawing state for measurements
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [pendingTextAnnotation, setPendingTextAnnotation] = useState<Point | null>(null);
  const [textInput, setTextInput] = useState('');

  // Mouse state for pan/zoom/window-level
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState<Point>({ x: 0, y: 0 });

  const currentImage = images[currentImageIndex];

  // Update external measurements when internal changes
  useEffect(() => {
    if (onMeasurementsChange && measurements !== externalMeasurements) {
      onMeasurementsChange(measurements);
    }
  }, [measurements, onMeasurementsChange, externalMeasurements]);

  // Sync with external measurements
  useEffect(() => {
    if (externalMeasurements) {
      setMeasurements(externalMeasurements);
    }
  }, [externalMeasurements]);

  // Load image
  useEffect(() => {
    if (!currentImage) return;

    setIsLoading(true);
    setImageLoaded(false);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
      setIsLoading(false);
      // Reset viewport on new image but keep window settings if DICOM
      setViewport((prev) => ({
        ...DEFAULT_VIEWPORT_STATE,
        windowCenter: currentImage.windowCenter ?? prev.windowCenter,
        windowWidth: currentImage.windowWidth ?? prev.windowWidth,
      }));
    };
    img.onerror = () => {
      setIsLoading(false);
    };
    img.src = currentImage.url;
  }, [currentImage]);

  // Draw canvas
  useEffect(() => {
    if (!canvasRef.current || !imageRef.current || !imageLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply transformations
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    ctx.translate(centerX + viewport.panX, centerY + viewport.panY);
    ctx.rotate((viewport.rotation * Math.PI) / 180);
    ctx.scale(
      viewport.zoom * (viewport.flipH ? -1 : 1),
      viewport.zoom * (viewport.flipV ? -1 : 1)
    );

    // Draw image centered
    const img = imageRef.current;
    ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);

    // Restore context for measurements
    ctx.restore();

    // Apply window/level (simplified simulation for non-DICOM)
    if (viewport.invert) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Draw measurements
    drawMeasurements(ctx, canvas);

    // Draw pending measurement
    if (isDrawing && drawingPoints.length > 0) {
      drawPendingMeasurement(ctx, canvas);
    }
  }, [
    viewport,
    imageLoaded,
    measurements,
    isDrawing,
    drawingPoints,
    currentImageIndex,
  ]);

  // Convert canvas coordinates to image coordinates
  const canvasToImage = useCallback(
    (canvasX: number, canvasY: number): Point => {
      if (!canvasRef.current || !imageRef.current) return { x: 0, y: 0 };

      const canvas = canvasRef.current;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Reverse transformations
      let x = canvasX - centerX - viewport.panX;
      let y = canvasY - centerY - viewport.panY;

      // Reverse rotation
      const rad = (-viewport.rotation * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const rx = x * cosR - y * sinR;
      const ry = x * sinR + y * cosR;

      // Reverse zoom and flip
      x = rx / viewport.zoom / (viewport.flipH ? -1 : 1);
      y = ry / viewport.zoom / (viewport.flipV ? -1 : 1);

      // Add image center offset
      const img = imageRef.current;
      x += img.width / 2;
      y += img.height / 2;

      return { x, y };
    },
    [viewport]
  );

  // Convert image coordinates to canvas coordinates
  const imageToCanvas = useCallback(
    (imageX: number, imageY: number): Point => {
      if (!canvasRef.current || !imageRef.current) return { x: 0, y: 0 };

      const canvas = canvasRef.current;
      const img = imageRef.current;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Subtract image center offset
      let x = imageX - img.width / 2;
      let y = imageY - img.height / 2;

      // Apply zoom and flip
      x = x * viewport.zoom * (viewport.flipH ? -1 : 1);
      y = y * viewport.zoom * (viewport.flipV ? -1 : 1);

      // Apply rotation
      const rad = (viewport.rotation * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const rx = x * cosR - y * sinR;
      const ry = x * sinR + y * cosR;

      // Apply pan and center
      return {
        x: rx + centerX + viewport.panX,
        y: ry + centerY + viewport.panY,
      };
    },
    [viewport]
  );

  // Draw measurements on canvas
  const drawMeasurements = useCallback(
    (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      const imageMeasurements = measurements.filter(
        (m) => m.imageId === currentImage?.id && m.isVisible
      );

      for (const measurement of imageMeasurements) {
        ctx.strokeStyle = measurement.color;
        ctx.fillStyle = measurement.color;
        ctx.lineWidth = 2;
        ctx.font = '14px sans-serif';

        switch (measurement.type) {
          case 'ruler':
            drawRuler(ctx, measurement);
            break;
          case 'angle':
            drawAngle(ctx, measurement);
            break;
          case 'cobbAngle':
            drawCobbAngle(ctx, measurement);
            break;
          case 'text':
            drawText(ctx, measurement);
            break;
        }
      }
    },
    [measurements, currentImage, imageToCanvas]
  );

  // Draw ruler measurement
  const drawRuler = useCallback(
    (ctx: CanvasRenderingContext2D, measurement: RulerMeasurement) => {
      const start = imageToCanvas(measurement.startPoint.x, measurement.startPoint.y);
      const end = imageToCanvas(measurement.endPoint.x, measurement.endPoint.y);

      // Draw line
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Draw endpoints
      ctx.beginPath();
      ctx.arc(start.x, start.y, 4, 0, Math.PI * 2);
      ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw label
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const label = `${measurement.value.toFixed(1)} ${measurement.unit}`;
      ctx.fillText(label, midX + 5, midY - 5);
    },
    [imageToCanvas]
  );

  // Draw angle measurement
  const drawAngle = useCallback(
    (ctx: CanvasRenderingContext2D, measurement: AngleMeasurement) => {
      const [p1, vertex, p3] = measurement.points.map((p) => imageToCanvas(p.x, p.y));

      // Draw lines
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(vertex.x, vertex.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.stroke();

      // Draw points
      [p1, vertex, p3].forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw arc
      const angle1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
      const angle2 = Math.atan2(p3.y - vertex.y, p3.x - vertex.x);
      ctx.beginPath();
      ctx.arc(vertex.x, vertex.y, 30, angle1, angle2);
      ctx.stroke();

      // Draw label
      const label = `${measurement.value.toFixed(1)}°`;
      ctx.fillText(label, vertex.x + 35, vertex.y);
    },
    [imageToCanvas]
  );

  // Draw Cobb angle measurement
  const drawCobbAngle = useCallback(
    (ctx: CanvasRenderingContext2D, measurement: CobbAngleMeasurement) => {
      const l1Start = imageToCanvas(measurement.line1.start.x, measurement.line1.start.y);
      const l1End = imageToCanvas(measurement.line1.end.x, measurement.line1.end.y);
      const l2Start = imageToCanvas(measurement.line2.start.x, measurement.line2.start.y);
      const l2End = imageToCanvas(measurement.line2.end.x, measurement.line2.end.y);

      // Draw lines
      ctx.beginPath();
      ctx.moveTo(l1Start.x, l1Start.y);
      ctx.lineTo(l1End.x, l1End.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(l2Start.x, l2Start.y);
      ctx.lineTo(l2End.x, l2End.y);
      ctx.stroke();

      // Draw endpoints
      [l1Start, l1End, l2Start, l2End].forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw perpendicular lines (dotted)
      ctx.setLineDash([5, 5]);
      // Simplified - just show the angle value
      ctx.setLineDash([]);

      // Draw label
      const midY = (l1Start.y + l2Start.y) / 2;
      const label = `Cobb: ${measurement.value.toFixed(1)}°${measurement.label ? ` (${measurement.label})` : ''}`;
      ctx.fillText(label, Math.max(l1Start.x, l2Start.x) + 10, midY);
    },
    [imageToCanvas]
  );

  // Draw text annotation
  const drawText = useCallback(
    (ctx: CanvasRenderingContext2D, measurement: TextAnnotation) => {
      const pos = imageToCanvas(measurement.position.x, measurement.position.y);
      ctx.font = `${measurement.fontSize}px sans-serif`;
      ctx.fillText(measurement.text, pos.x, pos.y);
    },
    [imageToCanvas]
  );

  // Draw pending measurement while user is drawing
  const drawPendingMeasurement = useCallback(
    (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      if (drawingPoints.length === 0) return;

      ctx.strokeStyle = MEASUREMENT_COLORS[activeTool as keyof typeof MEASUREMENT_COLORS] || '#ffffff';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      const points = drawingPoints.map((p) => imageToCanvas(p.x, p.y));

      if (activeTool === 'ruler' && points.length >= 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        if (points.length > 1) {
          ctx.lineTo(points[1].x, points[1].y);
        }
        ctx.stroke();
        points.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (activeTool === 'angle' && points.length >= 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
        points.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (activeTool === 'cobbAngle' && points.length >= 1) {
        // Draw first line
        if (points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          ctx.lineTo(points[1].x, points[1].y);
          ctx.stroke();
        }
        // Draw second line
        if (points.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(points[2].x, points[2].y);
          ctx.lineTo(points[3].x, points[3].y);
          ctx.stroke();
        } else if (points.length === 3) {
          ctx.beginPath();
          ctx.moveTo(points[2].x, points[2].y);
          ctx.stroke();
        }
        points.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      ctx.setLineDash([]);
    },
    [drawingPoints, activeTool, imageToCanvas]
  );

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      const imagePoint = canvasToImage(canvasX, canvasY);

      setLastMousePos({ x: e.clientX, y: e.clientY });

      if (activeTool === 'pan' || activeTool === 'zoom' || activeTool === 'windowLevel') {
        setIsDragging(true);
      } else if (!readOnly && ['ruler', 'angle', 'cobbAngle'].includes(activeTool)) {
        if (!isDrawing) {
          setIsDrawing(true);
          setDrawingPoints([imagePoint]);
        } else {
          const newPoints = [...drawingPoints, imagePoint];
          setDrawingPoints(newPoints);

          // Check if measurement is complete
          const isComplete =
            (activeTool === 'ruler' && newPoints.length === 2) ||
            (activeTool === 'angle' && newPoints.length === 3) ||
            (activeTool === 'cobbAngle' && newPoints.length === 4);

          if (isComplete) {
            finalizeMeasurement(newPoints);
          }
        }
      } else if (!readOnly && activeTool === 'text') {
        setPendingTextAnnotation(imagePoint);
      }
    },
    [activeTool, readOnly, isDrawing, drawingPoints, canvasToImage]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging) return;

      const deltaX = e.clientX - lastMousePos.x;
      const deltaY = e.clientY - lastMousePos.y;

      if (activeTool === 'pan') {
        setViewport((prev) => ({
          ...prev,
          panX: prev.panX + deltaX,
          panY: prev.panY + deltaY,
        }));
      } else if (activeTool === 'zoom') {
        const zoomDelta = -deltaY * 0.01;
        setViewport((prev) => ({
          ...prev,
          zoom: Math.max(0.1, Math.min(10, prev.zoom + zoomDelta)),
        }));
      } else if (activeTool === 'windowLevel') {
        setViewport((prev) => ({
          ...prev,
          windowCenter: prev.windowCenter + deltaY,
          windowWidth: Math.max(1, prev.windowWidth + deltaX),
        }));
      }

      setLastMousePos({ x: e.clientX, y: e.clientY });
    },
    [isDragging, lastMousePos, activeTool]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle wheel for zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomDelta = -e.deltaY * 0.001;
    setViewport((prev) => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(10, prev.zoom + zoomDelta)),
    }));
  }, []);

  // Finalize measurement
  const finalizeMeasurement = useCallback(
    (points: Point[]) => {
      if (!currentImage) return;

      const pixelSpacing = currentImage.pixelSpacing?.x ?? 1;
      let newMeasurement: Measurement;

      if (activeTool === 'ruler' && points.length === 2) {
        const distPx = calculateDistance(points[0], points[1]);
        newMeasurement = {
          id: generateMeasurementId(),
          type: 'ruler',
          imageId: currentImage.id,
          color: MEASUREMENT_COLORS.ruler,
          isVisible: true,
          createdAt: new Date(),
          startPoint: points[0],
          endPoint: points[1],
          value: pixelsToMm(distPx, pixelSpacing),
          unit: 'mm',
        };
      } else if (activeTool === 'angle' && points.length === 3) {
        newMeasurement = {
          id: generateMeasurementId(),
          type: 'angle',
          imageId: currentImage.id,
          color: MEASUREMENT_COLORS.angle,
          isVisible: true,
          createdAt: new Date(),
          points: [points[0], points[1], points[2]],
          value: calculateAngle(points[0], points[1], points[2]),
        };
      } else if (activeTool === 'cobbAngle' && points.length === 4) {
        const line1 = { start: points[0], end: points[1] };
        const line2 = { start: points[2], end: points[3] };
        newMeasurement = {
          id: generateMeasurementId(),
          type: 'cobbAngle',
          imageId: currentImage.id,
          color: MEASUREMENT_COLORS.cobbAngle,
          isVisible: true,
          createdAt: new Date(),
          line1,
          line2,
          value: calculateCobbAngle(line1, line2),
        };
      } else {
        setIsDrawing(false);
        setDrawingPoints([]);
        return;
      }

      setMeasurements((prev) => [...prev, newMeasurement]);
      setIsDrawing(false);
      setDrawingPoints([]);
    },
    [activeTool, currentImage]
  );

  // Add text annotation
  const handleAddTextAnnotation = useCallback(() => {
    if (!pendingTextAnnotation || !textInput.trim() || !currentImage) return;

    const newMeasurement: TextAnnotation = {
      id: generateMeasurementId(),
      type: 'text',
      imageId: currentImage.id,
      color: MEASUREMENT_COLORS.text,
      isVisible: true,
      createdAt: new Date(),
      position: pendingTextAnnotation,
      text: textInput.trim(),
      fontSize: 14,
    };

    setMeasurements((prev) => [...prev, newMeasurement]);
    setPendingTextAnnotation(null);
    setTextInput('');
  }, [pendingTextAnnotation, textInput, currentImage]);

  // Navigation
  const goToPrevImage = useCallback(() => {
    const newIndex = Math.max(0, currentImageIndex - 1);
    setCurrentImageIndex(newIndex);
    onImageChange?.(newIndex);
  }, [currentImageIndex, onImageChange]);

  const goToNextImage = useCallback(() => {
    const newIndex = Math.min(images.length - 1, currentImageIndex + 1);
    setCurrentImageIndex(newIndex);
    onImageChange?.(newIndex);
  }, [currentImageIndex, images.length, onImageChange]);

  const goToImage = useCallback(
    (index: number) => {
      setCurrentImageIndex(index);
      onImageChange?.(index);
    },
    [onImageChange]
  );

  // Reset viewport
  const resetViewport = useCallback(() => {
    setViewport({
      ...DEFAULT_VIEWPORT_STATE,
      windowCenter: currentImage?.windowCenter ?? DEFAULT_VIEWPORT_STATE.windowCenter,
      windowWidth: currentImage?.windowWidth ?? DEFAULT_VIEWPORT_STATE.windowWidth,
    });
  }, [currentImage]);

  // Rotate
  const rotate = useCallback((degrees: number) => {
    setViewport((prev) => ({
      ...prev,
      rotation: (prev.rotation + degrees) % 360,
    }));
  }, []);

  // Delete last measurement
  const undoMeasurement = useCallback(() => {
    setMeasurements((prev) => prev.slice(0, -1));
  }, []);

  // Clear all measurements for current image
  const clearMeasurements = useCallback(() => {
    if (!currentImage) return;
    setMeasurements((prev) => prev.filter((m) => m.imageId !== currentImage.id));
  }, [currentImage]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Apply window preset
  const applyWindowPreset = useCallback((preset: keyof typeof WINDOW_PRESETS) => {
    const { center, width } = WINDOW_PRESETS[preset];
    setViewport((prev) => ({
      ...prev,
      windowCenter: center,
      windowWidth: width,
    }));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'p':
          setActiveTool('pan');
          break;
        case 'z':
          setActiveTool('zoom');
          break;
        case 'w':
          setActiveTool('windowLevel');
          break;
        case 'r':
          if (!readOnly) setActiveTool('ruler');
          break;
        case 'a':
          if (!readOnly) setActiveTool('angle');
          break;
        case 'c':
          if (!readOnly) setActiveTool('cobbAngle');
          break;
        case 't':
          if (!readOnly) setActiveTool('text');
          break;
        case 'escape':
          setIsDrawing(false);
          setDrawingPoints([]);
          setPendingTextAnnotation(null);
          break;
        case 'arrowleft':
          goToPrevImage();
          break;
        case 'arrowright':
          goToNextImage();
          break;
        case 'f':
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readOnly, goToPrevImage, goToNextImage, toggleFullscreen]);

  // Resize canvas to match container
  useEffect(() => {
    const resizeCanvas = () => {
      if (!canvasRef.current || !containerRef.current) return;
      const container = containerRef.current;
      canvasRef.current.width = container.clientWidth;
      canvasRef.current.height = container.clientHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const viewerContent = (
    <div className={cn('flex flex-col h-full bg-black', className)}>
      {/* Toolbar */}
      {showToolbar && (
        <div className="flex items-center gap-2 p-2 bg-gray-900 border-b border-gray-700">
          {/* Navigation Tools */}
          <div className="flex items-center gap-1 border-r border-gray-700 pr-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeTool === 'pan' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTool('pan')}
                    className="text-white"
                  >
                    <Move className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pan (P)</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeTool === 'zoom' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTool('zoom')}
                    className="text-white"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom (Z)</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeTool === 'windowLevel' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTool('windowLevel')}
                    className="text-white"
                  >
                    <SunMedium className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Window/Level (W)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Rotation/Flip Tools */}
          <div className="flex items-center gap-1 border-r border-gray-700 pr-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={() => rotate(-90)} className="text-white">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rotate Left</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={() => rotate(90)} className="text-white">
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rotate Right</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewport.flipH ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewport((prev) => ({ ...prev, flipH: !prev.flipH }))}
                    className="text-white"
                  >
                    <FlipHorizontal className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Flip Horizontal</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewport.flipV ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewport((prev) => ({ ...prev, flipV: !prev.flipV }))}
                    className="text-white"
                  >
                    <FlipVertical className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Flip Vertical</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Measurement Tools */}
          {!readOnly && (
            <div className="flex items-center gap-1 border-r border-gray-700 pr-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === 'ruler' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setActiveTool('ruler')}
                      className="text-white"
                    >
                      <Ruler className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ruler (R)</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === 'angle' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setActiveTool('angle')}
                      className="text-white"
                    >
                      <Compass className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Angle (A)</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === 'cobbAngle' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setActiveTool('cobbAngle')}
                      className="text-white"
                    >
                      <Triangle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cobb Angle (C)</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === 'text' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setActiveTool('text')}
                      className="text-white"
                    >
                      <Type className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Text (T)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* Window Presets */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-white">
                <Settings className="h-4 w-4 mr-1" />
                Presets
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Window Presets</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(WINDOW_PRESETS).map(([key, preset]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => applyWindowPreset(key as keyof typeof WINDOW_PRESETS)}
                >
                  {preset.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Actions */}
          <div className="flex items-center gap-1 border-r border-gray-700 pr-2">
            {!readOnly && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={undoMeasurement}
                        disabled={measurements.length === 0}
                        className="text-white"
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Undo</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearMeasurements}
                        disabled={
                          !currentImage ||
                          measurements.filter((m) => m.imageId === currentImage.id).length === 0
                        }
                        className="text-white"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Clear Measurements</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={resetViewport} className="text-white">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset View</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Fullscreen */}
          <div className="flex items-center gap-1 ml-auto">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={toggleFullscreen} className="text-white">
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Zoom indicator */}
          <div className="text-xs text-gray-400 ml-2">
            {Math.round(viewport.zoom * 100)}%
          </div>
        </div>
      )}

      {/* Main viewer area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Thumbnails sidebar */}
        {showThumbnails && images.length > 1 && (
          <ScrollArea className="w-24 bg-gray-900 border-r border-gray-700">
            <div className="p-2 space-y-2">
              {images.map((image, index) => (
                <div
                  key={image.id}
                  className={cn(
                    'cursor-pointer border-2 rounded overflow-hidden',
                    index === currentImageIndex
                      ? 'border-blue-500'
                      : 'border-transparent hover:border-gray-500'
                  )}
                  onClick={() => goToImage(index)}
                >
                  <img
                    src={image.thumbnailUrl || image.url}
                    alt={`Image ${index + 1}`}
                    className="w-full h-16 object-cover"
                  />
                  <div className="text-[10px] text-gray-400 text-center py-0.5">
                    {image.viewPosition || index + 1}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Canvas viewer */}
        <div ref={containerRef} className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="text-white">Loading...</div>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />

          {/* Image navigation overlay */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 rounded-lg px-3 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToPrevImage}
                disabled={currentImageIndex === 0}
                className="text-white h-7 w-7 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-white text-sm">
                {currentImageIndex + 1} / {images.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={goToNextImage}
                disabled={currentImageIndex === images.length - 1}
                className="text-white h-7 w-7 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Image info overlay */}
          {currentImage && (
            <div className="absolute top-2 left-2 text-xs text-white bg-black/50 rounded px-2 py-1">
              <div>{currentImage.bodyPart}</div>
              <div>{currentImage.viewPosition}</div>
              {currentImage.width && currentImage.height && (
                <div>
                  {currentImage.width} x {currentImage.height}
                </div>
              )}
            </div>
          )}

          {/* Window/Level indicator */}
          <div className="absolute top-2 right-2 text-xs text-white bg-black/50 rounded px-2 py-1">
            <div>WC: {viewport.windowCenter.toFixed(0)}</div>
            <div>WW: {viewport.windowWidth.toFixed(0)}</div>
          </div>

          {/* Drawing instructions */}
          {isDrawing && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-xs text-white bg-black/70 rounded px-3 py-1.5">
              {activeTool === 'ruler' && `Click ${2 - drawingPoints.length} more point(s) to complete`}
              {activeTool === 'angle' && `Click ${3 - drawingPoints.length} more point(s) to complete`}
              {activeTool === 'cobbAngle' &&
                `Click ${4 - drawingPoints.length} more point(s) to complete (2 lines)`}
            </div>
          )}

          {/* Text annotation input */}
          {pendingTextAnnotation && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Enter annotation text"
                className="w-48 h-8 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTextAnnotation();
                  if (e.key === 'Escape') setPendingTextAnnotation(null);
                }}
              />
              <Button size="sm" onClick={handleAddTextAnnotation}>
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPendingTextAnnotation(null)}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render in fullscreen dialog or inline
  if (isFullscreen) {
    return (
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[100vw] max-h-[100vh] w-[100vw] h-[100vh] p-0">
          {viewerContent}
        </DialogContent>
      </Dialog>
    );
  }

  return viewerContent;
}

export default DICOMViewer;
