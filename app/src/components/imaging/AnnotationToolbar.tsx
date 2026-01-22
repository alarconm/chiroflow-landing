'use client';

/**
 * Annotation Toolbar Component
 * Epic 22: Imaging & X-Ray Integration (US-227)
 *
 * Toolbar for X-ray annotation tools including:
 * - Arrow and line drawing tools
 * - Text labels with leader lines
 * - Highlight/circle regions of interest
 * - Cobb angle measurement
 * - George's line assessment
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  ArrowUpRight,
  Minus,
  CircleDot,
  Pencil,
  Type,
  Spline,
  Triangle,
  Ruler,
  Compass,
  Circle,
  Square,
  Palette,
  Settings2,
  Undo2,
  Redo2,
  Trash2,
  Save,
  Download,
  Upload,
} from 'lucide-react';
import type { ViewerTool } from './types';

export interface AnnotationToolbarProps {
  activeTool: ViewerTool;
  onToolChange: (tool: ViewerTool) => void;
  lineWidth: number;
  onLineWidthChange: (width: number) => void;
  color: string;
  onColorChange: (color: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onSave: () => void;
  onExport?: () => void;
  onImport?: () => void;
  className?: string;
  disabled?: boolean;
}

// Predefined annotation colors
const ANNOTATION_COLORS = [
  { name: 'Red', value: '#FF0000' },
  { name: 'Green', value: '#00FF00' },
  { name: 'Blue', value: '#0000FF' },
  { name: 'Yellow', value: '#FFFF00' },
  { name: 'Cyan', value: '#00FFFF' },
  { name: 'Magenta', value: '#FF00FF' },
  { name: 'Orange', value: '#FF8800' },
  { name: 'White', value: '#FFFFFF' },
];

// Tool groups for organization
const DRAWING_TOOLS: { tool: ViewerTool; icon: typeof ArrowUpRight; label: string; shortcut: string }[] = [
  { tool: 'arrow', icon: ArrowUpRight, label: 'Arrow', shortcut: 'I' },
  { tool: 'line', icon: Minus, label: 'Line', shortcut: 'L' },
  { tool: 'circle', icon: CircleDot, label: 'Circle', shortcut: 'O' },
  { tool: 'freehand', icon: Pencil, label: 'Freehand', shortcut: 'F' },
];

const TEXT_TOOLS: { tool: ViewerTool; icon: typeof Type; label: string; shortcut: string }[] = [
  { tool: 'text', icon: Type, label: 'Text', shortcut: 'T' },
];

const MEASUREMENT_TOOLS: { tool: ViewerTool; icon: typeof Ruler; label: string; shortcut: string }[] = [
  { tool: 'ruler', icon: Ruler, label: 'Ruler', shortcut: 'R' },
  { tool: 'angle', icon: Compass, label: 'Angle', shortcut: 'A' },
  { tool: 'cobbAngle', icon: Triangle, label: 'Cobb Angle', shortcut: 'C' },
];

const SHAPE_TOOLS: { tool: ViewerTool; icon: typeof Circle; label: string; shortcut: string }[] = [
  { tool: 'ellipse', icon: Circle, label: 'Ellipse', shortcut: 'E' },
  { tool: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'Q' },
];

const SPINAL_TOOLS: { tool: ViewerTool; icon: typeof Spline; label: string; shortcut: string }[] = [
  { tool: 'georgesLine', icon: Spline, label: "George's Line", shortcut: 'G' },
];

export function AnnotationToolbar({
  activeTool,
  onToolChange,
  lineWidth,
  onLineWidthChange,
  color,
  onColorChange,
  fontSize,
  onFontSizeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onSave,
  onExport,
  onImport,
  className,
  disabled = false,
}: AnnotationToolbarProps) {
  const [showSettings, setShowSettings] = useState(false);

  const renderToolButton = (
    tool: ViewerTool,
    Icon: typeof ArrowUpRight,
    label: string,
    shortcut: string
  ) => (
    <TooltipProvider key={tool}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={activeTool === tool ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onToolChange(tool)}
            disabled={disabled}
            className={cn(
              'h-8 w-8 p-0',
              activeTool === tool && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {label} ({shortcut})
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div
      className={cn(
        'flex items-center gap-1 p-1 bg-gray-800 rounded-lg border border-gray-700',
        className
      )}
    >
      {/* Drawing Tools */}
      <div className="flex items-center gap-0.5">
        {DRAWING_TOOLS.map(({ tool, icon, label, shortcut }) =>
          renderToolButton(tool, icon, label, shortcut)
        )}
      </div>

      <Separator orientation="vertical" className="h-6 bg-gray-600" />

      {/* Text Tools */}
      <div className="flex items-center gap-0.5">
        {TEXT_TOOLS.map(({ tool, icon, label, shortcut }) =>
          renderToolButton(tool, icon, label, shortcut)
        )}
      </div>

      <Separator orientation="vertical" className="h-6 bg-gray-600" />

      {/* Measurement Tools */}
      <div className="flex items-center gap-0.5">
        {MEASUREMENT_TOOLS.map(({ tool, icon, label, shortcut }) =>
          renderToolButton(tool, icon, label, shortcut)
        )}
      </div>

      <Separator orientation="vertical" className="h-6 bg-gray-600" />

      {/* Shape Tools */}
      <div className="flex items-center gap-0.5">
        {SHAPE_TOOLS.map(({ tool, icon, label, shortcut }) =>
          renderToolButton(tool, icon, label, shortcut)
        )}
      </div>

      <Separator orientation="vertical" className="h-6 bg-gray-600" />

      {/* Spinal Assessment Tools */}
      <div className="flex items-center gap-0.5">
        {SPINAL_TOOLS.map(({ tool, icon, label, shortcut }) =>
          renderToolButton(tool, icon, label, shortcut)
        )}
      </div>

      <Separator orientation="vertical" className="h-6 bg-gray-600" />

      {/* Color Picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <div
              className="h-4 w-4 rounded-full border-2 border-white"
              style={{ backgroundColor: color }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Color</Label>
            <div className="grid grid-cols-4 gap-2">
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c.value}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                    color === c.value ? 'border-white' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c.value }}
                  onClick={() => onColorChange(c.value)}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Settings Popover */}
      <Popover open={showSettings} onOpenChange={setShowSettings}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs font-medium">Line Width</Label>
                <span className="text-xs text-gray-500">{lineWidth}px</span>
              </div>
              <Slider
                value={[lineWidth]}
                onValueChange={(values: number[]) => onLineWidthChange(values[0])}
                min={1}
                max={10}
                step={1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs font-medium">Font Size</Label>
                <span className="text-xs text-gray-500">{fontSize}px</span>
              </div>
              <Slider
                value={[fontSize]}
                onValueChange={(values: number[]) => onFontSizeChange(values[0])}
                min={10}
                max={32}
                step={2}
                className="w-full"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6 bg-gray-600" />

      {/* Actions */}
      <div className="flex items-center gap-0.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onUndo}
                disabled={disabled || !canUndo}
                className="h-8 w-8 p-0"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRedo}
                disabled={disabled || !canRedo}
                className="h-8 w-8 p-0"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                disabled={disabled}
                className="h-8 w-8 p-0 text-red-500 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear All</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Separator orientation="vertical" className="h-6 bg-gray-600" />

      {/* Save/Export */}
      <div className="flex items-center gap-0.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onSave}
                disabled={disabled}
                className="h-8 w-8 p-0 text-green-500 hover:text-green-400"
              >
                <Save className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save Annotations</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {onExport && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onExport}
                  disabled={disabled}
                  className="h-8 w-8 p-0"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export Annotations</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {onImport && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onImport}
                  disabled={disabled}
                  className="h-8 w-8 p-0"
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import Annotations</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

export default AnnotationToolbar;
