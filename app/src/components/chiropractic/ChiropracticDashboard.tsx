'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import { SpinalRegion, SubluxationSeverity, AdjustmentResponse, TechniqueCategory } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InteractiveSpineDiagram, SpineSegmentData } from '../clinical/body-diagram';

interface ChiropracticDashboardProps {
  patientId: string;
  encounterId?: string;
  onDocumentSubluxation?: (segment: string) => void;
  onDocumentAdjustment?: (subluxationId: string, segment: string) => void;
  onViewEncounter?: (encounterId: string) => void;
  className?: string;
}

// Region colors
const REGION_COLORS: Record<SpinalRegion, string> = {
  CERVICAL: '#3b82f6',
  THORACIC: '#8b5cf6',
  LUMBAR: '#f59e0b',
  SACRAL: '#ec4899',
  PELVIS: '#14b8a6',
};

// Severity colors
const SEVERITY_COLORS: Record<SubluxationSeverity, string> = {
  MINIMAL: '#22c55e',
  MILD: '#84cc16',
  MODERATE: '#f59e0b',
  SEVERE: '#f97316',
  EXTREME: '#ef4444',
};

// Response colors
const RESPONSE_COLORS: Record<AdjustmentResponse, string> = {
  EXCELLENT: '#22c55e',
  GOOD: '#84cc16',
  FAIR: '#f59e0b',
  GUARDED: '#f97316',
  POOR: '#ef4444',
};

// Severity numeric values
const SEVERITY_VALUES: Record<SubluxationSeverity, number> = {
  MINIMAL: 1,
  MILD: 2,
  MODERATE: 3,
  SEVERE: 4,
  EXTREME: 5,
};

export function ChiropracticDashboard({
  patientId,
  encounterId,
  onDocumentSubluxation,
  onDocumentAdjustment,
  onViewEncounter,
  className,
}: ChiropracticDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [diagramView, setDiagramView] = useState<'coronal' | 'sagittal'>('coronal');
  const [trendMonths, setTrendMonths] = useState(6);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);

  // Fetch patient spine overview
  const { data: spineOverview, isLoading: isLoadingOverview } =
    trpc.chiropracticDashboard.getPatientSpineOverview.useQuery(
      { patientId },
      { enabled: !!patientId }
    );

  // Fetch adjustment timeline
  const { data: adjustmentTimeline, isLoading: isLoadingTimeline } =
    trpc.chiropracticDashboard.getAdjustmentTimeline.useQuery(
      { patientId, limit: 50 },
      { enabled: !!patientId }
    );

  // Fetch treatment response trends
  const { data: trends, isLoading: isLoadingTrends } =
    trpc.chiropracticDashboard.getTreatmentResponseTrends.useQuery(
      { patientId, months: trendMonths },
      { enabled: !!patientId }
    );

  // Fetch subluxation progress
  const { data: subluxationProgress, isLoading: isLoadingProgress } =
    trpc.chiropracticDashboard.getSubluxationProgress.useQuery(
      { patientId },
      { enabled: !!patientId }
    );

  // Fetch technique stats
  const { data: techniqueStats, isLoading: isLoadingTechniques } =
    trpc.chiropracticDashboard.getTechniqueUsageStats.useQuery(
      { patientId },
      { enabled: !!patientId }
    );

  // Fetch quick entry data if encounter is active
  const { data: quickEntryData, isLoading: isLoadingQuickEntry } =
    trpc.chiropracticDashboard.getQuickEntryData.useQuery(
      { patientId, encounterId: encounterId || '' },
      { enabled: !!patientId && !!encounterId }
    );

  // Transform subluxations into SpineSegmentData for diagram
  const spineSegments = useMemo<SpineSegmentData[]>(() => {
    if (!spineOverview) return [];

    const allSegments = [
      // Cervical
      { segment: 'C1', name: 'Atlas', region: 'CERVICAL' as const, index: 1, y: 3 },
      { segment: 'C2', name: 'Axis', region: 'CERVICAL' as const, index: 2, y: 5 },
      { segment: 'C3', name: 'C3 Vertebra', region: 'CERVICAL' as const, index: 3, y: 7 },
      { segment: 'C4', name: 'C4 Vertebra', region: 'CERVICAL' as const, index: 4, y: 9 },
      { segment: 'C5', name: 'C5 Vertebra', region: 'CERVICAL' as const, index: 5, y: 11 },
      { segment: 'C6', name: 'C6 Vertebra', region: 'CERVICAL' as const, index: 6, y: 13 },
      { segment: 'C7', name: 'C7 Vertebra', region: 'CERVICAL' as const, index: 7, y: 15 },
      // Thoracic
      { segment: 'T1', name: 'T1 Vertebra', region: 'THORACIC' as const, index: 8, y: 19 },
      { segment: 'T2', name: 'T2 Vertebra', region: 'THORACIC' as const, index: 9, y: 23 },
      { segment: 'T3', name: 'T3 Vertebra', region: 'THORACIC' as const, index: 10, y: 27 },
      { segment: 'T4', name: 'T4 Vertebra', region: 'THORACIC' as const, index: 11, y: 31 },
      { segment: 'T5', name: 'T5 Vertebra', region: 'THORACIC' as const, index: 12, y: 35 },
      { segment: 'T6', name: 'T6 Vertebra', region: 'THORACIC' as const, index: 13, y: 39 },
      { segment: 'T7', name: 'T7 Vertebra', region: 'THORACIC' as const, index: 14, y: 43 },
      { segment: 'T8', name: 'T8 Vertebra', region: 'THORACIC' as const, index: 15, y: 47 },
      { segment: 'T9', name: 'T9 Vertebra', region: 'THORACIC' as const, index: 16, y: 51 },
      { segment: 'T10', name: 'T10 Vertebra', region: 'THORACIC' as const, index: 17, y: 55 },
      { segment: 'T11', name: 'T11 Vertebra', region: 'THORACIC' as const, index: 18, y: 59 },
      { segment: 'T12', name: 'T12 Vertebra', region: 'THORACIC' as const, index: 19, y: 63 },
      // Lumbar
      { segment: 'L1', name: 'L1 Vertebra', region: 'LUMBAR' as const, index: 20, y: 69 },
      { segment: 'L2', name: 'L2 Vertebra', region: 'LUMBAR' as const, index: 21, y: 75 },
      { segment: 'L3', name: 'L3 Vertebra', region: 'LUMBAR' as const, index: 22, y: 81 },
      { segment: 'L4', name: 'L4 Vertebra', region: 'LUMBAR' as const, index: 23, y: 87 },
      { segment: 'L5', name: 'L5 Vertebra', region: 'LUMBAR' as const, index: 24, y: 93 },
      // Sacral
      { segment: 'SACRUM', name: 'Sacrum', region: 'SACRAL' as const, index: 25, y: 98 },
      // Pelvis
      { segment: 'LEFT ILIUM', name: 'Left Ilium', region: 'PELVIS' as const, index: 26, y: 100 },
      { segment: 'RIGHT ILIUM', name: 'Right Ilium', region: 'PELVIS' as const, index: 27, y: 100 },
    ];

    return allSegments.map((seg) => {
      const subluxation = spineOverview.subluxations.find(
        (s) => s.vertebra.toUpperCase() === seg.segment.toUpperCase()
      );
      const listing = spineOverview.listings.find(
        (l) => l.segment.toUpperCase() === seg.segment.toUpperCase()
      );

      // Calculate xOffset based on listing laterality
      let xOffset = 0;
      if (listing) {
        if (listing.laterality === 'LEFT' || listing.listing.includes('L')) {
          xOffset = diagramView === 'coronal' ? -10 : 0;
        } else if (listing.laterality === 'RIGHT' || listing.listing.includes('R')) {
          xOffset = diagramView === 'coronal' ? 10 : 0;
        }
        if (diagramView === 'sagittal') {
          if (listing.listing.includes('AS') || listing.listing.includes('A')) {
            xOffset = -10;
          } else if (listing.listing.includes('PI') || listing.listing.includes('P')) {
            xOffset = 10;
          }
        }
      }

      const severityLevel = subluxation
        ? SEVERITY_VALUES[subluxation.severity as SubluxationSeverity]
        : 0;
      const severityColor = subluxation
        ? SEVERITY_COLORS[subluxation.severity as SubluxationSeverity]
        : '#22c55e';

      return {
        segment: seg.segment,
        name: seg.name,
        region: seg.region,
        index: seg.index,
        y: seg.y,
        xOffset,
        hasFinding: !!subluxation || !!listing,
        severityLevel,
        severityColor,
        subluxation: subluxation
          ? {
              id: subluxation.id,
              listing: subluxation.listing,
              severity: subluxation.severity,
              notes: subluxation.notes,
            }
          : null,
        listing: listing
          ? {
              id: listing.id,
              listing: listing.listing,
              laterality: listing.laterality,
              rotation: listing.rotation,
              fixation: listing.fixation,
              tenderness: listing.tenderness,
            }
          : null,
        adjustmentCount: 0, // Would need additional data
        lastAdjustment: null,
      };
    });
  }, [spineOverview, diagramView]);

  // Handle segment click
  const handleSegmentClick = (segment: SpineSegmentData) => {
    if (segment.subluxation && onDocumentAdjustment) {
      onDocumentAdjustment(segment.subluxation.id, segment.segment);
    }
  };

  // Handle document finding
  const handleDocumentFinding = (segment: string) => {
    if (onDocumentSubluxation) {
      onDocumentSubluxation(segment);
    }
  };

  if (isLoadingOverview) {
    return (
      <div className={cn('space-y-4', className)}>
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-[#053e67]">Chiropractic Dashboard</h2>
          {spineOverview?.patient && (
            <p className="text-sm text-muted-foreground">
              {spineOverview.patient.firstName} {spineOverview.patient.lastName}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {encounterId && (
            <Dialog open={quickEntryOpen} onOpenChange={setQuickEntryOpen}>
              <DialogTrigger asChild>
                <Button>Quick Adjustment Entry</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Quick Adjustment Entry</DialogTitle>
                  <DialogDescription>
                    Select subluxations to adjust
                  </DialogDescription>
                </DialogHeader>
                {quickEntryData && (
                  <QuickAdjustmentEntry
                    data={quickEntryData}
                    onSelect={(subluxationId, segment) => {
                      setQuickEntryOpen(false);
                      onDocumentAdjustment?.(subluxationId, segment);
                    }}
                  />
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-[#053e67]">
              {spineOverview?.stats.total || 0}
            </div>
            <p className="text-xs text-muted-foreground">Active Subluxations</p>
          </CardContent>
        </Card>
        {(['CERVICAL', 'THORACIC', 'LUMBAR', 'SACRAL'] as const).map((region) => (
          <Card key={region}>
            <CardContent className="pt-4 text-center">
              <div
                className="text-2xl font-bold"
                style={{ color: REGION_COLORS[region] }}
              >
                {spineOverview?.stats.byRegion[region] || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {region.charAt(0) + region.slice(1).toLowerCase()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Spine Overview</TabsTrigger>
          <TabsTrigger value="timeline">Adjustment History</TabsTrigger>
          <TabsTrigger value="trends">Response Trends</TabsTrigger>
          <TabsTrigger value="progress">Subluxation Progress</TabsTrigger>
          <TabsTrigger value="techniques">Technique Stats</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="flex gap-6">
            <div className="flex-1">
              <InteractiveSpineDiagram
                segments={spineSegments}
                view={diagramView}
                onViewChange={(v) => setDiagramView(v)}
                onSegmentClick={handleSegmentClick}
                onDocumentFinding={handleDocumentFinding}
                readOnly={!encounterId}
                showLegend={true}
                showSummary={true}
              />
            </div>
            <Card className="w-80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Active Subluxations</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {spineOverview?.subluxations.map((sub) => (
                      <div
                        key={sub.id}
                        className="p-3 rounded-md border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleSegmentClick({
                          segment: sub.vertebra,
                          subluxation: {
                            id: sub.id,
                            listing: sub.listing,
                            severity: sub.severity,
                            notes: sub.notes,
                          },
                        } as SpineSegmentData)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-medium">{sub.vertebra}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {sub.listing}
                            </span>
                          </div>
                          <Badge
                            style={{
                              backgroundColor: SEVERITY_COLORS[sub.severity as keyof typeof SEVERITY_COLORS],
                            }}
                          >
                            {sub.severity.toLowerCase()}
                          </Badge>
                        </div>
                        {sub.notes && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {sub.notes}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Since: {new Date(sub.encounter.encounterDate).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                    {(!spineOverview?.subluxations || spineOverview.subluxations.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No active subluxations
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Adjustment History Timeline</CardTitle>
              <CardDescription>
                {adjustmentTimeline?.total || 0} total adjustments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-6">
                  {adjustmentTimeline?.timeline.map((visit, idx) => (
                    <div key={idx} className="relative">
                      {idx > 0 && (
                        <div className="absolute left-3 -top-6 w-0.5 h-6 bg-gray-200" />
                      )}
                      <div className="flex gap-4">
                        <div className="w-6 h-6 rounded-full bg-[#053e67] flex items-center justify-center text-white text-xs">
                          {visit.adjustments.length}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">
                                {new Date(visit.date).toLocaleDateString()}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {visit.provider}
                              </p>
                            </div>
                            {onViewEncounter && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onViewEncounter(visit.encounterId)}
                              >
                                View
                              </Button>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {visit.adjustments.map((adj) => (
                              <TooltipProvider key={adj.id}>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge
                                      variant="outline"
                                      style={{
                                        borderColor: RESPONSE_COLORS[adj.response as keyof typeof RESPONSE_COLORS],
                                      }}
                                    >
                                      {adj.vertebra}
                                      {adj.technique && (
                                        <span className="ml-1 text-muted-foreground">
                                          ({adj.technique.name.substring(0, 3)})
                                        </span>
                                      )}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="space-y-1">
                                      <p className="font-medium">{adj.vertebra}</p>
                                      {adj.technique && (
                                        <p className="text-xs">Technique: {adj.technique.name}</p>
                                      )}
                                      <p className="text-xs">Response: {adj.response.toLowerCase()}</p>
                                      {adj.prePain !== null && adj.postPain !== null && (
                                        <p className="text-xs">
                                          Pain: {adj.prePain} → {adj.postPain}
                                        </p>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!adjustmentTimeline?.timeline || adjustmentTimeline.timeline.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No adjustment history
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="mt-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Treatment Response Trends</h3>
              <Select
                value={trendMonths.toString()}
                onValueChange={(v) => setTrendMonths(parseInt(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 months</SelectItem>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Overall Trend Card */}
            {trends && (
              <Card>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-[#053e67]">
                        {trends.overallTrend.totalAdjustments}
                      </div>
                      <p className="text-xs text-muted-foreground">Total Adjustments</p>
                    </div>
                    <div>
                      <div
                        className={cn(
                          'text-2xl font-bold',
                          trends.overallTrend.trending === 'improving' && 'text-green-500',
                          trends.overallTrend.trending === 'declining' && 'text-red-500',
                          trends.overallTrend.trending === 'stable' && 'text-amber-500'
                        )}
                      >
                        {trends.overallTrend.trending === 'improving' && '↑'}
                        {trends.overallTrend.trending === 'declining' && '↓'}
                        {trends.overallTrend.trending === 'stable' && '→'}
                      </div>
                      <p className="text-xs text-muted-foreground">Trend</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-500">
                        {trends.overallTrend.recentAvgResponse.toFixed(1)}
                      </div>
                      <p className="text-xs text-muted-foreground">Avg Response (1-5)</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-500">
                        {trends.overallTrend.avgPainReduction.toFixed(1)}
                      </div>
                      <p className="text-xs text-muted-foreground">Avg Pain Reduction</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Monthly Response Chart (Simplified) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Monthly Response Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {trends?.responseByMonth.map((month) => (
                    <div key={month.month} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{month.month}</span>
                        <span>{month.total} adjustments</span>
                      </div>
                      <div className="h-4 rounded-full bg-gray-100 overflow-hidden flex">
                        {month.excellent > 0 && (
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${(month.excellent / month.total) * 100}%` }}
                          />
                        )}
                        {month.good > 0 && (
                          <div
                            className="h-full bg-lime-500"
                            style={{ width: `${(month.good / month.total) * 100}%` }}
                          />
                        )}
                        {month.fair > 0 && (
                          <div
                            className="h-full bg-amber-500"
                            style={{ width: `${(month.fair / month.total) * 100}%` }}
                          />
                        )}
                        {month.guarded > 0 && (
                          <div
                            className="h-full bg-orange-500"
                            style={{ width: `${(month.guarded / month.total) * 100}%` }}
                          />
                        )}
                        {month.poor > 0 && (
                          <div
                            className="h-full bg-red-500"
                            style={{ width: `${(month.poor / month.total) * 100}%` }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Progress Tab */}
        <TabsContent value="progress" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Subluxation Progress</CardTitle>
              <CardDescription>
                Track how subluxations are improving over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              {subluxationProgress && (
                <div className="space-y-4">
                  {/* Overall Progress */}
                  <div className="grid grid-cols-5 gap-4 text-center p-4 bg-muted rounded-lg">
                    <div>
                      <div className="text-2xl font-bold">{subluxationProgress.overallProgress.totalVertebrae}</div>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-500">
                        {subluxationProgress.overallProgress.resolved}
                      </div>
                      <p className="text-xs text-muted-foreground">Resolved</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-lime-500">
                        {subluxationProgress.overallProgress.improved}
                      </div>
                      <p className="text-xs text-muted-foreground">Improved</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-amber-500">
                        {subluxationProgress.overallProgress.unchanged}
                      </div>
                      <p className="text-xs text-muted-foreground">Unchanged</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-500">
                        {subluxationProgress.overallProgress.worsened}
                      </div>
                      <p className="text-xs text-muted-foreground">Worsened</p>
                    </div>
                  </div>

                  {/* Severity Trend */}
                  <div className="flex items-center gap-4 justify-center">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Initial Avg</p>
                      <p className="text-xl font-bold">
                        {subluxationProgress.overallProgress.avgInitialSeverity.toFixed(1)}
                      </p>
                    </div>
                    <div className="text-2xl">→</div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Current Avg</p>
                      <p
                        className={cn(
                          'text-xl font-bold',
                          subluxationProgress.overallProgress.avgCurrentSeverity <
                            subluxationProgress.overallProgress.avgInitialSeverity
                            ? 'text-green-500'
                            : 'text-red-500'
                        )}
                      >
                        {subluxationProgress.overallProgress.avgCurrentSeverity.toFixed(1)}
                      </p>
                    </div>
                  </div>

                  {/* Individual vertebra progress */}
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {Object.values(subluxationProgress.byVertebra).map((v) => (
                        <div key={v.vertebra} className="p-3 border rounded-md">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{v.vertebra}</span>
                              <Badge variant="outline" style={{ borderColor: REGION_COLORS[v.region] }}>
                                {v.region.toLowerCase()}
                              </Badge>
                              {v.isResolved && <Badge className="bg-green-500">Resolved</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge style={{ backgroundColor: SEVERITY_COLORS[v.firstSeverity] }}>
                                {v.firstSeverity.toLowerCase()}
                              </Badge>
                              <span>→</span>
                              <Badge style={{ backgroundColor: SEVERITY_COLORS[v.currentSeverity] }}>
                                {v.currentSeverity.toLowerCase()}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {v.history.length} change(s), {v.improvements} improvement(s)
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Techniques Tab */}
        <TabsContent value="techniques" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Technique Usage</CardTitle>
                <CardDescription>
                  {techniqueStats?.uniqueTechniques || 0} techniques used
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {techniqueStats?.byTechnique.map((tech) => (
                      <div key={tech.techniqueId} className="p-3 border rounded-md">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{tech.name}</span>
                          <span className="text-muted-foreground">{tech.count}x</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <Badge variant="outline">{tech.category.toLowerCase()}</Badge>
                          <span className="text-xs text-green-600">
                            {tech.successRate.toFixed(0)}% success
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">By Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {techniqueStats?.byCategory.map((cat) => (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">
                          {cat.category.charAt(0) + cat.category.slice(1).toLowerCase().replace('_', ' ')}
                        </span>
                        <span className="text-muted-foreground">{cat.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full bg-[#053e67]"
                          style={{
                            width: `${techniqueStats?.totalAdjustments
                              ? (cat.count / techniqueStats.totalAdjustments) * 100
                              : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Quick Adjustment Entry Component
interface QuickAdjustmentEntryProps {
  data: {
    subluxations: Array<{
      id: string;
      vertebra: string;
      region: string;
      listing: string;
      severity: string;
      alreadyAdjusted: boolean;
      severityInfo?: { color: string } | null;
    }>;
    favorites: Array<{ id: string; name: string; category: string }>;
    frequentTechniques: Array<{ id: string; name: string; category: string }>;
    adjustedSegments: string[];
    encounterStatus: string;
  };
  onSelect: (subluxationId: string, segment: string) => void;
}

function QuickAdjustmentEntry({ data, onSelect }: QuickAdjustmentEntryProps) {
  const unadjusted = data.subluxations.filter((s) => !s.alreadyAdjusted);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-2">Active Subluxations</h4>
        {unadjusted.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {unadjusted.map((sub) => (
              <Button
                key={sub.id}
                variant="outline"
                className="justify-start h-auto py-2"
                onClick={() => onSelect(sub.id, sub.vertebra)}
              >
                <div className="text-left">
                  <div className="font-medium">{sub.vertebra}</div>
                  <div className="text-xs text-muted-foreground">
                    {sub.listing} - {sub.severity.toLowerCase()}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            All subluxations have been adjusted this visit
          </p>
        )}
      </div>

      {data.favorites.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Favorite Techniques</h4>
          <div className="flex flex-wrap gap-2">
            {data.favorites.map((tech) => (
              <Badge key={tech.id} variant="outline">
                {tech.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {data.frequentTechniques.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Frequently Used</h4>
          <div className="flex flex-wrap gap-2">
            {data.frequentTechniques.map((tech) => (
              <Badge key={tech.id} variant="secondary">
                {tech.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
