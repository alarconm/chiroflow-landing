'use client';

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import SignaturePadLib from 'signature_pad';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Eraser, Undo2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SignaturePadRef {
  getSignatureData: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  label?: string;
  helpText?: string;
  consentText?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  onSignatureChange?: (hasSignature: boolean) => void;
  className?: string;
}

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  ({ label, helpText, consentText, required, error, disabled, onSignatureChange, className }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const signaturePadRef = useRef<SignaturePadLib | null>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    // Initialize signature pad
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Set up high-DPI canvas
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);

      const signaturePad = new SignaturePadLib(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
      });

      signaturePad.addEventListener('endStroke', () => {
        const isEmpty = signaturePad.isEmpty();
        setIsEmpty(isEmpty);
        onSignatureChange?.(!isEmpty);
      });

      signaturePadRef.current = signaturePad;

      // Handle resize
      const handleResize = () => {
        const data = signaturePad.toData();
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext('2d')?.scale(ratio, ratio);
        signaturePad.clear();
        if (data) {
          signaturePad.fromData(data);
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        signaturePad.off();
      };
    }, [onSignatureChange]);

    // Disable signature pad when disabled prop changes
    useEffect(() => {
      if (signaturePadRef.current) {
        if (disabled) {
          signaturePadRef.current.off();
        } else {
          signaturePadRef.current.on();
        }
      }
    }, [disabled]);

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      getSignatureData: () => {
        if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
          return null;
        }
        return signaturePadRef.current.toDataURL('image/png');
      },
      clear: () => {
        signaturePadRef.current?.clear();
        setIsEmpty(true);
        onSignatureChange?.(false);
      },
      isEmpty: () => {
        return signaturePadRef.current?.isEmpty() ?? true;
      },
    }));

    const handleClear = () => {
      signaturePadRef.current?.clear();
      setIsEmpty(true);
      onSignatureChange?.(false);
    };

    const handleUndo = () => {
      const data = signaturePadRef.current?.toData();
      if (data && data.length > 0) {
        data.pop();
        signaturePadRef.current?.fromData(data);
        const newIsEmpty = data.length === 0;
        setIsEmpty(newIsEmpty);
        onSignatureChange?.(!newIsEmpty);
      }
    };

    return (
      <div className={cn('space-y-2', className)}>
        {label && (
          <Label>
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
        )}

        {consentText && (
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md border">
            {consentText}
          </div>
        )}

        <div
          className={cn(
            'relative border-2 rounded-lg overflow-hidden bg-white',
            error ? 'border-red-500' : 'border-gray-200',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-40 touch-none"
            style={{ touchAction: 'none' }}
          />

          {/* Signature line */}
          <div className="absolute bottom-8 left-4 right-4 border-b border-gray-300" />
          <div className="absolute bottom-2 left-4 text-xs text-gray-400">
            Sign above the line
          </div>

          {/* Status indicator */}
          {!isEmpty && (
            <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <Check className="h-3 w-3" />
              Signed
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={disabled || isEmpty}
          >
            <Undo2 className="h-4 w-4 mr-1" />
            Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={disabled || isEmpty}
          >
            <Eraser className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>

        {helpText && !error && (
          <p className="text-xs text-gray-500">{helpText}</p>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

SignaturePad.displayName = 'SignaturePad';

export { SignaturePad };
