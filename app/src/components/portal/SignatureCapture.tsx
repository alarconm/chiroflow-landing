'use client';

/**
 * Epic 14: Patient Portal - Signature Capture Component
 * US-096: Patient form completion portal
 *
 * Canvas-based signature capture with:
 * - Touch and mouse support
 * - Clear functionality
 * - Export as base64 image
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eraser, Check } from 'lucide-react';

interface SignatureCaptureProps {
  onSignatureChange: (signature: string | null) => void;
  disabled?: boolean;
  existingSignature?: string;
  width?: number;
  height?: number;
}

export function SignatureCapture({
  onSignatureChange,
  disabled = false,
  existingSignature,
  width = 500,
  height = 200,
}: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Style the canvas
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw existing signature if provided
    if (existingSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasSignature(true);
      };
      img.src = existingSignature;
    }
  }, [existingSignature]);

  // Get coordinates from event
  const getCoordinates = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width / (window.devicePixelRatio || 1);
      const scaleY = canvas.height / rect.height / (window.devicePixelRatio || 1);

      if ('touches' in e) {
        const touch = e.touches[0] || e.changedTouches[0];
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      } else {
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY,
        };
      }
    },
    []
  );

  // Start drawing
  const handleStart = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (disabled) return;

      e.preventDefault();
      const point = getCoordinates(e);
      if (!point) return;

      setIsDrawing(true);
      setLastPoint(point);
    },
    [disabled, getCoordinates]
  );

  // Draw line
  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawing || disabled) return;

      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !lastPoint) return;

      const point = getCoordinates(e);
      if (!point) return;

      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();

      setLastPoint(point);
      setHasSignature(true);
    },
    [isDrawing, disabled, lastPoint, getCoordinates]
  );

  // End drawing
  const handleEnd = useCallback(() => {
    if (!isDrawing) return;

    setIsDrawing(false);
    setLastPoint(null);

    // Export signature
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      const dataUrl = canvas.toDataURL('image/png');
      onSignatureChange(dataUrl);
    }
  }, [isDrawing, hasSignature, onSignatureChange]);

  // Clear signature
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();

    // Clear and fill with white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    setHasSignature(false);
    onSignatureChange(null);
  }, [onSignatureChange]);

  return (
    <Card className={`border-stone-200 ${disabled ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div
          className="relative border-2 border-dashed border-stone-300 rounded-lg overflow-hidden bg-white"
          style={{ maxWidth: width }}
        >
          <canvas
            ref={canvasRef}
            className="w-full touch-none cursor-crosshair"
            style={{ height }}
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
          />

          {/* Signature line */}
          <div className="absolute bottom-8 left-4 right-4 border-b border-stone-300" />

          {/* X mark */}
          <span className="absolute bottom-9 left-2 text-stone-400 text-lg">X</span>

          {/* Placeholder text */}
          {!hasSignature && !disabled && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-stone-400 text-sm">Sign here</span>
            </div>
          )}

          {/* Signed indicator */}
          {hasSignature && (
            <div className="absolute top-2 right-2">
              <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                <Check className="h-3 w-3" />
                Signed
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!disabled && (
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-stone-500">
              Use your mouse or finger to sign above
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={!hasSignature}
              className="border-stone-200"
            >
              <Eraser className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        )}

        {/* Legal text */}
        <p className="text-xs text-stone-500 mt-3">
          By signing above, I agree that my electronic signature is legally binding and has the
          same effect as a handwritten signature.
        </p>
      </CardContent>
    </Card>
  );
}
