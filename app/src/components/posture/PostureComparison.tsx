'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Download,
  Layers,
  Grid,
  ChevronDown,
  ChevronUp,
  FileText,
  ImageIcon,
  BarChart3,
  Calendar,
} from 'lucide-react';
import {
  getStatusColors,
  getStatusLabel,
  type ComparisonResult,
  type DeviationComparison,
  type ViewComparison,
} from '@/lib/services/postureComparison';

// ============================================
// TYPES
// ============================================

interface PostureComparisonProps {
  comparison: ComparisonResult;
  onExportPDF?: () => void;
  className?: string;
}

interface ViewComparisonCardProps {
  viewComparison: ViewComparison;
  previousDate: Date;
  currentDate: Date;
  showOverlay?: boolean;
  overlayOpacity?: number;
}

interface DeviationComparisonRowProps {
  comparison: DeviationComparison;
  showDetails?: boolean;
}

interface ProgressSummaryProps {
  improvementScore: number;
  totalDeviations: { previous: number; current: number };
  significantDeviations: { previous: number; current: number };
  overallSeverity: { previous: string; current: string };
  summary: string;
}

interface TrendChartProps {
  comparisons: DeviationComparison[];
}

// ============================================
// VIEW LABELS
// ============================================

const VIEW_LABELS: Record<string, string> = {
  ANTERIOR: 'Anterior (Front)',
  POSTERIOR: 'Posterior (Back)',
  LATERAL_LEFT: 'Left Lateral',
  LATERAL_RIGHT: 'Right Lateral',
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  MINIMAL: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  MILD: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  MODERATE: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  SEVERE: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  EXTREME: { bg: 'bg-red-200', text: 'text-red-800', border: 'border-red-400' },
};

// ============================================
// PROGRESS SUMMARY COMPONENT
// ============================================

function ProgressSummary({
  improvementScore,
  totalDeviations,
  significantDeviations,
  overallSeverity,
  summary,
}: ProgressSummaryProps) {
  const getScoreColor = (score: number) => {
    if (score >= 25) return 'text-green-600';
    if (score > 0) return 'text-green-500';
    if (score === 0) return 'text-gray-600';
    if (score > -25) return 'text-orange-500';
    return 'text-red-600';
  };

  const getScoreIcon = (score: number) => {
    if (score > 0) return <TrendingUp className="w-5 h-5" />;
    if (score < 0) return <TrendingDown className="w-5 h-5" />;
    return <Minus className="w-5 h-5" />;
  };

  const prevSeverityColors = SEVERITY_COLORS[overallSeverity.previous] || SEVERITY_COLORS.MINIMAL;
  const currSeverityColors = SEVERITY_COLORS[overallSeverity.current] || SEVERITY_COLORS.MINIMAL;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Progress Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Improvement Score */}
          <div className="text-center p-4 rounded-lg bg-gray-50">
            <div className={cn('text-3xl font-bold flex items-center justify-center gap-2', getScoreColor(improvementScore))}>
              {getScoreIcon(improvementScore)}
              {improvementScore > 0 ? '+' : ''}{improvementScore}
            </div>
            <div className="text-sm text-gray-500 mt-1">Improvement Score</div>
          </div>

          {/* Total Deviations */}
          <div className="text-center p-4 rounded-lg bg-gray-50">
            <div className="flex items-center justify-center gap-2 text-2xl font-bold">
              <span className="text-gray-500">{totalDeviations.previous}</span>
              <ArrowRight className="w-4 h-4 text-gray-400" />
              <span>{totalDeviations.current}</span>
            </div>
            <div className="text-sm text-gray-500 mt-1">Total Findings</div>
          </div>

          {/* Significant Deviations */}
          <div className="text-center p-4 rounded-lg bg-gray-50">
            <div className="flex items-center justify-center gap-2 text-2xl font-bold">
              <span className="text-gray-500">{significantDeviations.previous}</span>
              <ArrowRight className="w-4 h-4 text-gray-400" />
              <span className={significantDeviations.current < significantDeviations.previous ? 'text-green-600' : significantDeviations.current > significantDeviations.previous ? 'text-red-600' : ''}>
                {significantDeviations.current}
              </span>
            </div>
            <div className="text-sm text-gray-500 mt-1">Significant Findings</div>
          </div>

          {/* Overall Severity */}
          <div className="text-center p-4 rounded-lg bg-gray-50">
            <div className="flex items-center justify-center gap-2">
              <Badge className={cn(prevSeverityColors.bg, prevSeverityColors.text, 'text-xs')}>
                {overallSeverity.previous}
              </Badge>
              <ArrowRight className="w-4 h-4 text-gray-400" />
              <Badge className={cn(currSeverityColors.bg, currSeverityColors.text, 'text-xs')}>
                {overallSeverity.current}
              </Badge>
            </div>
            <div className="text-sm text-gray-500 mt-1">Overall Severity</div>
          </div>
        </div>

        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">{summary}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// DEVIATION COMPARISON ROW COMPONENT
// ============================================

function DeviationComparisonRow({ comparison, showDetails = false }: DeviationComparisonRowProps) {
  const [expanded, setExpanded] = useState(showDetails);
  const colors = getStatusColors(comparison.improvement);

  const getIcon = () => {
    switch (comparison.improvement) {
      case 'improved':
      case 'resolved':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'declined':
      case 'new':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      default:
        return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className={cn('border rounded-lg', colors.border)}>
      <div
        className={cn('flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50', colors.bg)}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {getIcon()}
          <span className="font-medium">{comparison.name}</span>
          <Badge className={cn(colors.bg, colors.text, colors.border, 'border text-xs')}>
            {getStatusLabel(comparison.improvement)}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            {comparison.previousValue !== null && (
              <span className="text-gray-400">{comparison.previousValue.toFixed(1)}{comparison.unit}</span>
            )}
            {comparison.previousValue !== null && comparison.currentValue !== null && (
              <ArrowRight className="w-3 h-3 inline mx-2 text-gray-400" />
            )}
            {comparison.currentValue !== null && (
              <span className="font-medium">{comparison.currentValue.toFixed(1)}{comparison.unit}</span>
            )}
          </div>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="p-3 border-t bg-white">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Previous</div>
              <div className="font-medium">
                {comparison.previousValue !== null
                  ? `${comparison.previousValue.toFixed(1)}${comparison.unit}`
                  : 'N/A'}
                {comparison.previousSeverity && (
                  <Badge className={cn('ml-2 text-xs', SEVERITY_COLORS[comparison.previousSeverity]?.bg, SEVERITY_COLORS[comparison.previousSeverity]?.text)}>
                    {comparison.previousSeverity}
                  </Badge>
                )}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Current</div>
              <div className="font-medium">
                {comparison.currentValue !== null
                  ? `${comparison.currentValue.toFixed(1)}${comparison.unit}`
                  : 'N/A'}
                {comparison.currentSeverity && (
                  <Badge className={cn('ml-2 text-xs', SEVERITY_COLORS[comparison.currentSeverity]?.bg, SEVERITY_COLORS[comparison.currentSeverity]?.text)}>
                    {comparison.currentSeverity}
                  </Badge>
                )}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Change</div>
              <div className={cn('font-medium', colors.text)}>
                {comparison.change > 0 ? '+' : ''}{comparison.change.toFixed(1)}{comparison.unit}
                ({comparison.changePercent > 0 ? '+' : ''}{comparison.changePercent.toFixed(1)}%)
              </div>
            </div>
            <div>
              <div className="text-gray-500">Notes</div>
              <div className="text-gray-700">{comparison.notes}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// VIEW COMPARISON CARD COMPONENT
// ============================================

function ViewComparisonCard({
  viewComparison,
  previousDate,
  currentDate,
  showOverlay = false,
  overlayOpacity = 50,
}: ViewComparisonCardProps) {
  const hasImages = viewComparison.previousImage || viewComparison.currentImage;
  const hasDeviations = viewComparison.deviations.length > 0;

  if (!hasImages && !hasDeviations) {
    return (
      <Card className="opacity-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{VIEW_LABELS[viewComparison.view]}</CardTitle>
          <CardDescription>No data available for this view</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          {VIEW_LABELS[viewComparison.view]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Image Comparison */}
        {hasImages && (
          <div className="mb-4">
            {showOverlay && viewComparison.previousImage && viewComparison.currentImage ? (
              <div className="relative aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={viewComparison.previousImage.imageUrl}
                  alt={`Previous ${viewComparison.view}`}
                  className="absolute inset-0 w-full h-full object-contain"
                />
                <img
                  src={viewComparison.currentImage.imageUrl}
                  alt={`Current ${viewComparison.view}`}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ opacity: overlayOpacity / 100 }}
                />
                <div className="absolute bottom-2 left-2 right-2 bg-black/50 text-white text-xs p-2 rounded">
                  Overlay Mode - {overlayOpacity}% current over previous
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 text-center">
                    Previous ({previousDate.toLocaleDateString()})
                  </div>
                  {viewComparison.previousImage ? (
                    <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                      <img
                        src={viewComparison.previousImage.thumbnailUrl || viewComparison.previousImage.imageUrl}
                        alt={`Previous ${viewComparison.view}`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[3/4] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                      No image
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 text-center">
                    Current ({currentDate.toLocaleDateString()})
                  </div>
                  {viewComparison.currentImage ? (
                    <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                      <img
                        src={viewComparison.currentImage.thumbnailUrl || viewComparison.currentImage.imageUrl}
                        alt={`Current ${viewComparison.view}`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[3/4] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                      No image
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Deviation Comparisons */}
        {hasDeviations && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700 mb-2">Findings</div>
            {viewComparison.deviations.map((deviation, idx) => (
              <DeviationComparisonRow key={idx} comparison={deviation} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// TREND CHART COMPONENT
// ============================================

function TrendChart({ comparisons }: TrendChartProps) {
  const improved = comparisons.filter((c) => c.improvement === 'improved' || c.improvement === 'resolved').length;
  const stable = comparisons.filter((c) => c.improvement === 'stable').length;
  const declined = comparisons.filter((c) => c.improvement === 'declined' || c.improvement === 'new').length;
  const total = comparisons.length;

  if (total === 0) return null;

  const improvedPercent = (improved / total) * 100;
  const stablePercent = (stable / total) * 100;
  const declinedPercent = (declined / total) * 100;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Change Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-8 rounded-full overflow-hidden flex bg-gray-100">
          {improvedPercent > 0 && (
            <div
              className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${improvedPercent}%` }}
            >
              {improved}
            </div>
          )}
          {stablePercent > 0 && (
            <div
              className="bg-gray-400 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${stablePercent}%` }}
            >
              {stable}
            </div>
          )}
          {declinedPercent > 0 && (
            <div
              className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${declinedPercent}%` }}
            >
              {declined}
            </div>
          )}
        </div>
        <div className="flex justify-between mt-2 text-sm">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Improved ({improved})</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            <span>Stable ({stable})</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>Declined ({declined})</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// RECOMMENDATIONS CARD COMPONENT
// ============================================

function RecommendationsCard({ recommendations }: { recommendations: string[] }) {
  if (recommendations.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {recommendations.map((rec, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm">
              <span className="text-blue-500 mt-1">*</span>
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN POSTURE COMPARISON COMPONENT
// ============================================

export function PostureComparison({
  comparison,
  onExportPDF,
  className,
}: PostureComparisonProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'overlay'>('grid');
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [selectedView, setSelectedView] = useState<string | null>(null);

  const allComparisons = useMemo(
    () => comparison.viewComparisons.flatMap((vc) => vc.deviations),
    [comparison.viewComparisons]
  );

  const filteredViewComparisons = selectedView
    ? comparison.viewComparisons.filter((vc) => vc.view === selectedView)
    : comparison.viewComparisons;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Posture Comparison Report
          </h2>
          <p className="text-gray-500 mt-1">
            Comparing {comparison.previousAssessment.date.toLocaleDateString()} to{' '}
            {comparison.currentAssessment.date.toLocaleDateString()} ({comparison.daysBetween} days)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onExportPDF && (
            <Button onClick={onExportPDF} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
          )}
        </div>
      </div>

      {/* Progress Summary */}
      <ProgressSummary
        improvementScore={comparison.overallProgress.improvementScore}
        totalDeviations={comparison.overallProgress.totalDeviations}
        significantDeviations={comparison.overallProgress.significantDeviations}
        overallSeverity={comparison.overallProgress.overallSeverity}
        summary={comparison.overallProgress.summary}
      />

      {/* Trend Chart */}
      <TrendChart comparisons={allComparisons} />

      {/* View Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">View:</span>
          <Select value={selectedView || 'all'} onValueChange={(v) => setSelectedView(v === 'all' ? null : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All views" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Views</SelectItem>
              <SelectItem value="ANTERIOR">Anterior</SelectItem>
              <SelectItem value="POSTERIOR">Posterior</SelectItem>
              <SelectItem value="LATERAL_LEFT">Left Lateral</SelectItem>
              <SelectItem value="LATERAL_RIGHT">Right Lateral</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Mode:</span>
          <div className="flex rounded-md overflow-hidden border">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-none"
            >
              <Grid className="w-4 h-4 mr-1" />
              Side by Side
            </Button>
            <Button
              variant={viewMode === 'overlay' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('overlay')}
              className="rounded-none"
            >
              <Layers className="w-4 h-4 mr-1" />
              Overlay
            </Button>
          </div>
        </div>

        {viewMode === 'overlay' && (
          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <span className="text-sm text-gray-500">Opacity:</span>
            <Slider
              value={[overlayOpacity]}
              onValueChange={(values: number[]) => setOverlayOpacity(values[0])}
              min={0}
              max={100}
              step={5}
              className="flex-1"
            />
            <span className="text-sm text-gray-600 w-12">{overlayOpacity}%</span>
          </div>
        )}
      </div>

      {/* View Comparisons */}
      <div className={cn(
        'grid gap-6',
        selectedView ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
      )}>
        {filteredViewComparisons.map((vc) => (
          <ViewComparisonCard
            key={vc.view}
            viewComparison={vc}
            previousDate={comparison.previousAssessment.date}
            currentDate={comparison.currentAssessment.date}
            showOverlay={viewMode === 'overlay'}
            overlayOpacity={overlayOpacity}
          />
        ))}
      </div>

      {/* Recommendations */}
      <RecommendationsCard recommendations={comparison.recommendations} />

      {/* All Findings Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Findings</CardTitle>
          <CardDescription>
            Detailed comparison of all measurements across all views
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {allComparisons.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No deviation findings to compare</p>
          ) : (
            allComparisons.map((comp, idx) => (
              <DeviationComparisonRow key={idx} comparison={comp} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// ASSESSMENT SELECTOR COMPONENT
// ============================================

interface AssessmentSelectorProps {
  assessments: Array<{
    id: string;
    date: Date;
    notes?: string | null;
    imageCount: number;
    deviationCount: number;
    views: string[];
    thumbnails: (string | null)[];
  }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: string;
  excludeId?: string;
}

export function AssessmentSelector({
  assessments,
  selectedId,
  onSelect,
  label,
  excludeId,
}: AssessmentSelectorProps) {
  const filteredAssessments = excludeId
    ? assessments.filter((a) => a.id !== excludeId)
    : assessments;

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-2 block">{label}</label>
      <Select value={selectedId || ''} onValueChange={onSelect}>
        <SelectTrigger>
          <SelectValue placeholder="Select an assessment" />
        </SelectTrigger>
        <SelectContent>
          {filteredAssessments.map((assessment) => (
            <SelectItem key={assessment.id} value={assessment.id}>
              <div className="flex items-center gap-2">
                <span>{assessment.date.toLocaleDateString()}</span>
                <Badge variant="outline" className="text-xs">
                  {assessment.imageCount} images
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {assessment.deviationCount} findings
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================
// HISTORY TREND VIEW COMPONENT
// ============================================

interface HistoryTrendViewProps {
  trends: Array<{
    deviationType: string;
    name: string;
    unit: string;
    dataPoints: Array<{
      date: Date;
      value: number;
      severity: string;
    }>;
    trend: 'improving' | 'worsening' | 'stable';
    changeFromFirst: number;
    changeFromPrevious: number;
  }>;
  assessments: Array<{
    id: string;
    date: Date;
    deviationCount: number;
  }>;
}

export function HistoryTrendView({ trends, assessments }: HistoryTrendViewProps) {
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'worsening':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      default:
        return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving':
        return 'text-green-600';
      case 'worsening':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assessment History</CardTitle>
          <CardDescription>
            {assessments.length} assessments analyzed for trend patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {assessments.map((a, idx) => (
              <div
                key={a.id}
                className="flex-shrink-0 p-3 border rounded-lg text-center min-w-[100px]"
              >
                <div className="text-xs text-gray-500">#{idx + 1}</div>
                <div className="text-sm font-medium">{a.date.toLocaleDateString()}</div>
                <div className="text-xs text-gray-500">{a.deviationCount} findings</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deviation Trends</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {trends.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No trend data available</p>
          ) : (
            trends.map((trend, idx) => (
              <div key={idx} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getTrendIcon(trend.trend)}
                    <span className="font-medium">{trend.name}</span>
                    <Badge variant="outline" className={getTrendColor(trend.trend)}>
                      {trend.trend}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-600">
                    Overall: {trend.changeFromFirst > 0 ? '+' : ''}{trend.changeFromFirst}{trend.unit}
                  </div>
                </div>

                {/* Simple line visualization */}
                <div className="h-16 flex items-end gap-1 mt-4">
                  {trend.dataPoints.map((dp, dpIdx) => {
                    const maxValue = Math.max(...trend.dataPoints.map((d) => d.value));
                    const height = maxValue > 0 ? (dp.value / maxValue) * 100 : 50;
                    const severityColors = SEVERITY_COLORS[dp.severity] || SEVERITY_COLORS.MINIMAL;

                    return (
                      <div
                        key={dpIdx}
                        className={cn('flex-1 rounded-t', severityColors.bg)}
                        style={{ height: `${height}%`, minHeight: '10%' }}
                        title={`${dp.date.toLocaleDateString()}: ${dp.value}${trend.unit}`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{trend.dataPoints[0]?.date.toLocaleDateString()}</span>
                  <span>{trend.dataPoints[trend.dataPoints.length - 1]?.date.toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PostureComparison;
