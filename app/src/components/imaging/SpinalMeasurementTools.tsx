'use client';

/**
 * Spinal Measurement Tools Component
 * Epic 22: Imaging & X-Ray Integration (US-228)
 *
 * Specialized measurement tools for chiropractic X-ray analysis:
 * - Cobb angle measurement for scoliosis
 * - Cervical lordosis angle
 * - Lumbar lordosis angle
 * - Disc space height measurement
 * - Vertebral body height ratio
 * - Atlas plane line
 */

import React, { useState, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Info,
  Ruler,
  Spline,
  Target,
  Triangle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { NORMAL_RANGES, type DeviationSeverity } from '@/lib/imaging/spinal-measurements';

// ============================================
// TYPES
// ============================================

export type SpinalMeasurementType =
  | 'cobbAngle'
  | 'cervicalLordosis'
  | 'lumbarLordosis'
  | 'discHeight'
  | 'vertebralHeight'
  | 'atlasPlane';

export interface SpinalMeasurement {
  id: string;
  type: SpinalMeasurementType;
  value: number;
  unit: string;
  label: string;
  description?: string;
  normalMin?: number;
  normalMax?: number;
  deviation?: number;
  severity: DeviationSeverity;
  createdAt: Date;
}

export interface SpinalMeasurementToolsProps {
  imageId: string;
  measurements: SpinalMeasurement[];
  activeTool: SpinalMeasurementType | null;
  onToolSelect: (tool: SpinalMeasurementType | null) => void;
  onMeasurementDelete?: (measurementId: string) => void;
  disabled?: boolean;
  className?: string;
}

// ============================================
// TOOL DEFINITIONS
// ============================================

interface SpinalToolConfig {
  id: SpinalMeasurementType;
  name: string;
  shortName: string;
  icon: React.ReactNode;
  description: string;
  instructions: string[];
  normalRange: { min: number; max: number; unit: string };
}

const SPINAL_TOOLS: SpinalToolConfig[] = [
  {
    id: 'cobbAngle',
    name: 'Cobb Angle',
    shortName: 'Cobb',
    icon: <Triangle className="h-4 w-4" />,
    description: 'Measure scoliosis curve severity',
    instructions: [
      'Click on the left edge of the superior endplate',
      'Click on the right edge of the superior endplate',
      'Click on the left edge of the inferior endplate',
      'Click on the right edge of the inferior endplate',
    ],
    normalRange: { min: 0, max: 10, unit: 'degrees' },
  },
  {
    id: 'cervicalLordosis',
    name: 'Cervical Lordosis',
    shortName: 'C-Lord',
    icon: <Spline className="h-4 w-4" />,
    description: 'Measure C2-C7 curve angle',
    instructions: [
      'Click on the anterior point of C2 inferior endplate',
      'Click on the posterior point of C2 inferior endplate',
      'Click on the anterior point of C7 inferior endplate',
      'Click on the posterior point of C7 inferior endplate',
    ],
    normalRange: { min: 31, max: 40, unit: 'degrees' },
  },
  {
    id: 'lumbarLordosis',
    name: 'Lumbar Lordosis',
    shortName: 'L-Lord',
    icon: <Spline className="h-4 w-4" />,
    description: 'Measure L1-S1 curve angle',
    instructions: [
      'Click on the anterior point of L1 superior endplate',
      'Click on the posterior point of L1 superior endplate',
      'Click on the anterior point of S1 superior endplate',
      'Click on the posterior point of S1 superior endplate',
    ],
    normalRange: { min: 40, max: 60, unit: 'degrees' },
  },
  {
    id: 'discHeight',
    name: 'Disc Height',
    shortName: 'Disc',
    icon: <Ruler className="h-4 w-4" />,
    description: 'Measure disc space height',
    instructions: [
      'Click on the anterior-superior corner of disc space',
      'Click on the anterior-inferior corner of disc space',
      'Click on the posterior-superior corner of disc space',
      'Click on the posterior-inferior corner of disc space',
    ],
    normalRange: { min: 8, max: 14, unit: 'mm' },
  },
  {
    id: 'vertebralHeight',
    name: 'Vertebral Height',
    shortName: 'VH Ratio',
    icon: <Activity className="h-4 w-4" />,
    description: 'Measure compression ratio',
    instructions: [
      'Click on the anterior-superior corner of vertebra',
      'Click on the anterior-inferior corner of vertebra',
      'Click on the posterior-superior corner of vertebra',
      'Click on the posterior-inferior corner of vertebra',
    ],
    normalRange: { min: 0.85, max: 1.15, unit: 'ratio' },
  },
  {
    id: 'atlasPlane',
    name: 'Atlas Plane',
    shortName: 'Atlas',
    icon: <Target className="h-4 w-4" />,
    description: 'Assess C1 alignment',
    instructions: [
      'Click on the left lateral mass of C1',
      'Click on the right lateral mass of C1',
      '(Optional) Click on axis (C2) odontoid process',
    ],
    normalRange: { min: -2, max: 2, unit: 'degrees' },
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function getSeverityColor(severity: DeviationSeverity): string {
  switch (severity) {
    case 'normal':
      return 'text-green-600 dark:text-green-400';
    case 'mild':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'moderate':
      return 'text-orange-600 dark:text-orange-400';
    case 'severe':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
}

function getSeverityBadgeVariant(severity: DeviationSeverity): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (severity) {
    case 'normal':
      return 'secondary';
    case 'mild':
      return 'outline';
    case 'moderate':
      return 'default';
    case 'severe':
      return 'destructive';
    default:
      return 'outline';
  }
}

function getSeverityIcon(severity: DeviationSeverity) {
  switch (severity) {
    case 'normal':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'mild':
      return <Info className="h-4 w-4 text-yellow-500" />;
    case 'moderate':
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case 'severe':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <CircleDot className="h-4 w-4 text-gray-500" />;
  }
}

function calculateDeviationProgress(value: number, normalMin: number, normalMax: number): number {
  const normalMid = (normalMin + normalMax) / 2;
  const normalRange = normalMax - normalMin;

  if (value >= normalMin && value <= normalMax) {
    // Within normal range, show 0-50%
    const positionInRange = (value - normalMin) / normalRange;
    return 25 + (positionInRange - 0.5) * 50; // Center at 25%
  }

  // Outside normal range
  const deviation = value < normalMin ? normalMin - value : value - normalMax;
  const deviationPercent = (deviation / (normalRange / 2)) * 50;
  return Math.min(100, 50 + deviationPercent);
}

// ============================================
// COMPONENT
// ============================================

export function SpinalMeasurementTools({
  imageId,
  measurements,
  activeTool,
  onToolSelect,
  onMeasurementDelete,
  disabled = false,
  className,
}: SpinalMeasurementToolsProps) {
  const [expandedMeasurements, setExpandedMeasurements] = useState<Record<string, boolean>>({});
  const [showInstructions, setShowInstructions] = useState(true);

  const toggleMeasurementExpanded = useCallback((id: string) => {
    setExpandedMeasurements((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const activeMeasurementTool = SPINAL_TOOLS.find((tool) => tool.id === activeTool);

  // Group measurements by type
  const measurementsByType = measurements.reduce(
    (acc, measurement) => {
      if (!acc[measurement.type]) {
        acc[measurement.type] = [];
      }
      acc[measurement.type].push(measurement);
      return acc;
    },
    {} as Record<SpinalMeasurementType, SpinalMeasurement[]>
  );

  // Calculate summary statistics
  const totalMeasurements = measurements.length;
  const abnormalMeasurements = measurements.filter((m) => m.severity !== 'normal').length;
  const severeMeasurements = measurements.filter((m) => m.severity === 'severe').length;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Tool Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Spinal Measurement Tools</CardTitle>
          <CardDescription className="text-xs">
            Select a tool to measure spinal structures
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Tool Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <TooltipProvider>
              {SPINAL_TOOLS.map((tool) => (
                <Tooltip key={tool.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === tool.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => onToolSelect(activeTool === tool.id ? null : tool.id)}
                      disabled={disabled}
                      className="h-auto py-2 px-2 flex flex-col items-center gap-1"
                    >
                      {tool.icon}
                      <span className="text-xs">{tool.shortName}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-medium">{tool.name}</p>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                    <p className="text-xs mt-1">
                      Normal: {tool.normalRange.min}-{tool.normalRange.max} {tool.normalRange.unit}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          </div>

          {/* Active Tool Instructions */}
          {activeMeasurementTool && (
            <Collapsible open={showInstructions} onOpenChange={setShowInstructions}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="text-xs">Instructions: {activeMeasurementTool.name}</span>
                  {showInstructions ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="bg-muted/50 rounded-md p-2 mt-2">
                  <ol className="list-decimal list-inside space-y-1">
                    {activeMeasurementTool.instructions.map((instruction, index) => (
                      <li key={index} className="text-xs text-muted-foreground">
                        {instruction}
                      </li>
                    ))}
                  </ol>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* Measurement Summary */}
      {totalMeasurements > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Measurement Summary</span>
              <Badge variant={severeMeasurements > 0 ? 'destructive' : 'secondary'}>
                {totalMeasurements} measurements
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Abnormal findings:</span>
              <span className={abnormalMeasurements > 0 ? 'text-orange-600' : 'text-green-600'}>
                {abnormalMeasurements} of {totalMeasurements}
              </span>
            </div>
            <Progress
              value={(abnormalMeasurements / totalMeasurements) * 100}
              className="h-2"
            />
            {severeMeasurements > 0 && (
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" />
                <span>{severeMeasurements} severe deviation(s) detected</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Measurements List */}
      {measurements.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Measurements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {measurements.map((measurement) => {
              const tool = SPINAL_TOOLS.find((t) => t.id === measurement.type);
              const isExpanded = expandedMeasurements[measurement.id];

              return (
                <Collapsible
                  key={measurement.id}
                  open={isExpanded}
                  onOpenChange={() => toggleMeasurementExpanded(measurement.id)}
                >
                  <div
                    className={cn(
                      'border rounded-lg p-2',
                      measurement.severity === 'severe' && 'border-red-300 bg-red-50/50 dark:bg-red-900/10',
                      measurement.severity === 'moderate' && 'border-orange-300 bg-orange-50/50 dark:bg-orange-900/10',
                      measurement.severity === 'mild' && 'border-yellow-300 bg-yellow-50/50 dark:bg-yellow-900/10',
                      measurement.severity === 'normal' && 'border-green-300 bg-green-50/50 dark:bg-green-900/10'
                    )}
                  >
                    <CollapsibleTrigger asChild>
                      <button className="w-full">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getSeverityIcon(measurement.severity)}
                            <div className="text-left">
                              <p className="text-sm font-medium">{measurement.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {tool?.name || measurement.type}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'text-lg font-bold',
                                getSeverityColor(measurement.severity)
                              )}
                            >
                              {measurement.value}
                              <span className="text-xs ml-1">{measurement.unit}</span>
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </div>
                        </div>
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="mt-3 pt-3 border-t space-y-2">
                        {/* Normal Range Visualization */}
                        {measurement.normalMin !== undefined && measurement.normalMax !== undefined && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Normal Range</span>
                              <span>
                                {measurement.normalMin} - {measurement.normalMax} {measurement.unit}
                              </span>
                            </div>
                            <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                              {/* Normal range zone */}
                              <div
                                className="absolute h-full bg-green-200 dark:bg-green-900/50"
                                style={{
                                  left: '25%',
                                  width: '50%',
                                }}
                              />
                              {/* Value indicator */}
                              <div
                                className={cn(
                                  'absolute top-0 w-1 h-full',
                                  measurement.severity === 'normal' ? 'bg-green-600' : 'bg-red-600'
                                )}
                                style={{
                                  left: `${calculateDeviationProgress(
                                    measurement.value,
                                    measurement.normalMin,
                                    measurement.normalMax
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Deviation */}
                        {measurement.deviation !== undefined && measurement.deviation !== 0 && (
                          <div className="flex justify-between text-xs">
                            <span>Deviation from normal:</span>
                            <span className={getSeverityColor(measurement.severity)}>
                              {measurement.deviation > 0 ? '+' : ''}
                              {measurement.deviation} {measurement.unit}
                            </span>
                          </div>
                        )}

                        {/* Severity Badge */}
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Severity:</span>
                          <Badge variant={getSeverityBadgeVariant(measurement.severity)}>
                            {measurement.severity.charAt(0).toUpperCase() + measurement.severity.slice(1)}
                          </Badge>
                        </div>

                        {/* Description/Finding */}
                        {measurement.description && (
                          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                            {measurement.description}
                          </div>
                        )}

                        {/* Delete Button */}
                        {onMeasurementDelete && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full mt-2"
                            onClick={() => onMeasurementDelete(measurement.id)}
                          >
                            Delete Measurement
                          </Button>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {measurements.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <Ruler className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No measurements yet</p>
              <p className="text-xs mt-1">Select a tool above to start measuring</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reference Values */}
      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Normal Reference Values</span>
                <ChevronDown className="h-4 w-4" />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {Object.entries(NORMAL_RANGES).map(([key, range]) => (
                  <div key={key} className="flex justify-between text-xs py-1 border-b last:border-0">
                    <span className="text-muted-foreground capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span>
                      {range.min} - {range.max} {range.unit}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

export default SpinalMeasurementTools;
