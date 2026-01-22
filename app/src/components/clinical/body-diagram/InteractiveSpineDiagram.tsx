'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface SpineSegmentData {
  segment: string;
  name: string;
  region: 'CERVICAL' | 'THORACIC' | 'LUMBAR' | 'SACRAL' | 'PELVIS';
  index: number;
  y: number;
  xOffset: number;
  hasFinding: boolean;
  severityLevel: number;
  severityColor: string;
  subluxation: {
    id: string;
    listing: string;
    severity: string;
    notes: string | null;
  } | null;
  listing: {
    id: string;
    listing: string;
    laterality: string | null;
    rotation: string | null;
    fixation: boolean;
    tenderness: number | null;
  } | null;
  adjustmentCount: number;
  lastAdjustment: {
    date: Date;
    technique: string | undefined;
    response: string;
  } | null;
}

export interface InteractiveSpineDiagramProps {
  segments: SpineSegmentData[];
  view: 'coronal' | 'sagittal';
  onViewChange?: (view: 'coronal' | 'sagittal') => void;
  onSegmentClick?: (segment: SpineSegmentData) => void;
  onDocumentFinding?: (segment: string) => void;
  readOnly?: boolean;
  showLegend?: boolean;
  showSummary?: boolean;
  className?: string;
}

const REGION_COLORS = {
  CERVICAL: '#3b82f6', // blue
  THORACIC: '#8b5cf6', // purple
  LUMBAR: '#f59e0b', // amber
  SACRAL: '#ec4899', // pink
  PELVIS: '#14b8a6', // teal
};

const SEVERITY_LABELS = ['', 'Normal', 'Mild', 'Moderate', 'Severe', 'Extreme'];

export function InteractiveSpineDiagram({
  segments,
  view,
  onViewChange,
  onSegmentClick,
  onDocumentFinding,
  readOnly = false,
  showLegend = true,
  showSummary = true,
  className,
}: InteractiveSpineDiagramProps) {
  const [selectedSegment, setSelectedSegment] = useState<SpineSegmentData | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Group segments by region
  const segmentsByRegion = useMemo(() => {
    return {
      CERVICAL: segments.filter((s) => s.region === 'CERVICAL'),
      THORACIC: segments.filter((s) => s.region === 'THORACIC'),
      LUMBAR: segments.filter((s) => s.region === 'LUMBAR'),
      SACRAL: segments.filter((s) => s.region === 'SACRAL'),
      PELVIS: segments.filter((s) => s.region === 'PELVIS'),
    };
  }, [segments]);

  // Summary stats
  const summary = useMemo(() => {
    const findings = segments.filter((s) => s.hasFinding);
    return {
      total: findings.length,
      bySeverity: {
        mild: findings.filter((s) => s.severityLevel === 2).length,
        moderate: findings.filter((s) => s.severityLevel === 3).length,
        severe: findings.filter((s) => s.severityLevel >= 4).length,
      },
      byRegion: Object.entries(segmentsByRegion).map(([region, segs]) => ({
        region,
        count: segs.filter((s) => s.hasFinding).length,
        total: segs.length,
      })),
    };
  }, [segments, segmentsByRegion]);

  const handleSegmentClick = useCallback(
    (segment: SpineSegmentData) => {
      setSelectedSegment(segment);
      setDetailsOpen(true);
      onSegmentClick?.(segment);
    },
    [onSegmentClick]
  );

  const handleDocumentClick = useCallback(
    (segment: string) => {
      setDetailsOpen(false);
      onDocumentFinding?.(segment);
    },
    [onDocumentFinding]
  );

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* View Toggle */}
      {onViewChange && (
        <div className="flex justify-center">
          <Tabs value={view} onValueChange={(v) => onViewChange(v as 'coronal' | 'sagittal')}>
            <TabsList>
              <TabsTrigger value="coronal">Front View (Coronal)</TabsTrigger>
              <TabsTrigger value="sagittal">Side View (Sagittal)</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      <div className="flex gap-6">
        {/* Spine Diagram */}
        <div className="flex-1">
          <div className="relative bg-gray-50 rounded-lg border-2 border-gray-200 p-4">
            {/* Region Labels - Left Side */}
            <div className="absolute left-2 top-0 bottom-0 w-16 flex flex-col justify-between py-4 text-xs font-medium">
              <div className="text-blue-600">Cervical</div>
              <div className="text-purple-600 -mt-24">Thoracic</div>
              <div className="text-amber-600 -mt-8">Lumbar</div>
              <div className="text-pink-600">Sacral</div>
            </div>

            {/* Spine Column */}
            <div className="ml-20 relative" style={{ height: '600px', width: '120px' }}>
              {/* Center Line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-300 transform -translate-x-1/2" />

              {/* Vertebrae */}
              <TooltipProvider>
                {segments.map((segment) => {
                  const isHovered = hoveredSegment === segment.segment;
                  const isSelected = selectedSegment?.segment === segment.segment;

                  return (
                    <Tooltip key={segment.segment}>
                      <TooltipTrigger asChild>
                        <button
                          className={cn(
                            'absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200',
                            'w-10 h-5 rounded-md border-2 flex items-center justify-center text-[10px] font-medium',
                            !readOnly && 'cursor-pointer hover:scale-110',
                            isHovered && 'scale-110 z-10',
                            isSelected && 'ring-2 ring-offset-2 ring-blue-500',
                            segment.hasFinding
                              ? 'border-current'
                              : 'border-gray-300 bg-white text-gray-500'
                          )}
                          style={{
                            top: `${segment.y * 0.95}%`,
                            left: `${50 + segment.xOffset}%`,
                            backgroundColor: segment.hasFinding
                              ? `${segment.severityColor}20`
                              : undefined,
                            borderColor: segment.hasFinding
                              ? segment.severityColor
                              : undefined,
                            color: segment.hasFinding
                              ? segment.severityColor
                              : undefined,
                          }}
                          onClick={() => handleSegmentClick(segment)}
                          onMouseEnter={() => setHoveredSegment(segment.segment)}
                          onMouseLeave={() => setHoveredSegment(null)}
                        >
                          {segment.segment}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="space-y-1">
                          <p className="font-semibold">{segment.name}</p>
                          {segment.hasFinding ? (
                            <>
                              {segment.subluxation && (
                                <p className="text-xs">
                                  Subluxation: {segment.subluxation.listing} (
                                  {segment.subluxation.severity.toLowerCase()})
                                </p>
                              )}
                              {segment.listing && (
                                <p className="text-xs">
                                  Listing: {segment.listing.listing}
                                  {segment.listing.fixation && ' - Fixation'}
                                </p>
                              )}
                              {segment.adjustmentCount > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {segment.adjustmentCount} adjustment(s) recorded
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground">No findings</p>
                          )}
                          {!readOnly && (
                            <p className="text-xs text-blue-600">Click to view details or document</p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </div>

            {/* View Label */}
            <div className="absolute bottom-2 right-2 text-xs text-gray-500">
              {view === 'coronal' ? 'Front View' : 'Side View'}
            </div>
          </div>
        </div>

        {/* Summary Panel */}
        {showSummary && (
          <Card className="w-64">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Findings Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-bold text-center">
                {summary.total}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  finding{summary.total !== 1 ? 's' : ''}
                </span>
              </div>

              {/* By Severity */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">By Severity</p>
                <div className="flex gap-2 flex-wrap">
                  {summary.bySeverity.severe > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      Severe: {summary.bySeverity.severe}
                    </Badge>
                  )}
                  {summary.bySeverity.moderate > 0 && (
                    <Badge className="bg-amber-500 text-xs">
                      Moderate: {summary.bySeverity.moderate}
                    </Badge>
                  )}
                  {summary.bySeverity.mild > 0 && (
                    <Badge className="bg-lime-500 text-xs">
                      Mild: {summary.bySeverity.mild}
                    </Badge>
                  )}
                </div>
              </div>

              {/* By Region */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">By Region</p>
                <div className="space-y-1">
                  {summary.byRegion.map(({ region, count }) =>
                    count > 0 ? (
                      <div
                        key={region}
                        className="flex justify-between text-xs"
                        style={{ color: REGION_COLORS[region as keyof typeof REGION_COLORS] }}
                      >
                        <span>{region.charAt(0) + region.slice(1).toLowerCase()}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap gap-4 justify-center text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium">Severity:</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-500" />
            <span>Normal</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-lime-500" />
            <span>Mild</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-500" />
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-orange-500" />
            <span>Severe</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-500" />
            <span>Extreme</span>
          </div>
        </div>
      )}

      {/* Segment Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedSegment?.name || selectedSegment?.segment}
            </DialogTitle>
            <DialogDescription>
              {selectedSegment?.region.charAt(0)}
              {selectedSegment?.region.slice(1).toLowerCase()} Spine
            </DialogDescription>
          </DialogHeader>

          {selectedSegment && (
            <div className="space-y-4">
              {/* Current Status */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Current Status</h4>
                {selectedSegment.hasFinding ? (
                  <div className="space-y-2">
                    {selectedSegment.subluxation && (
                      <div className="p-3 rounded-md bg-muted">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">Subluxation</span>
                          <Badge
                            style={{
                              backgroundColor: selectedSegment.severityColor,
                            }}
                          >
                            {selectedSegment.subluxation.severity.toLowerCase()}
                          </Badge>
                        </div>
                        <p className="text-sm mt-1">
                          Listing: {selectedSegment.subluxation.listing}
                        </p>
                        {selectedSegment.subluxation.notes && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {selectedSegment.subluxation.notes}
                          </p>
                        )}
                      </div>
                    )}

                    {selectedSegment.listing && (
                      <div className="p-3 rounded-md bg-muted">
                        <span className="text-sm font-medium">Vertebral Listing</span>
                        <p className="text-sm mt-1">
                          {selectedSegment.listing.listing}
                          {selectedSegment.listing.laterality &&
                            ` (${selectedSegment.listing.laterality})`}
                        </p>
                        <div className="flex gap-2 mt-2 text-xs">
                          {selectedSegment.listing.fixation && (
                            <Badge variant="outline">Fixation</Badge>
                          )}
                          {selectedSegment.listing.tenderness && (
                            <Badge variant="outline">
                              Tenderness: {selectedSegment.listing.tenderness}/10
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No findings documented for this segment.
                  </p>
                )}
              </div>

              {/* History */}
              {selectedSegment.adjustmentCount > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Adjustment History</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedSegment.adjustmentCount} adjustment(s) recorded
                  </p>
                  {selectedSegment.lastAdjustment && (
                    <div className="text-xs text-muted-foreground">
                      Last: {new Date(selectedSegment.lastAdjustment.date).toLocaleDateString()}
                      {selectedSegment.lastAdjustment.technique &&
                        ` - ${selectedSegment.lastAdjustment.technique}`}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              {!readOnly && (
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleDocumentClick(selectedSegment.segment)}
                  >
                    {selectedSegment.hasFinding ? 'Update Finding' : 'Document Finding'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDetailsOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Export for use in other components
export { SEVERITY_LABELS, REGION_COLORS };
