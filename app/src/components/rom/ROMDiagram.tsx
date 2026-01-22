'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  ROM_REGIONS,
  ROM_DEFINITIONS,
  type ROMJointType,
  type JointRegion,
  type ROMDiagramData,
} from '@/lib/services/romAnalysis';

// ============================================
// TYPES
// ============================================

interface ROMDiagramProps {
  data: ROMDiagramData[];
  selectedRegion?: JointRegion | null;
  onRegionClick?: (region: JointRegion) => void;
  onJointClick?: (joint: ROMJointType, side?: string) => void;
  showLabels?: boolean;
  compact?: boolean;
  className?: string;
}

interface SpineViewProps {
  data: ROMDiagramData[];
  onRegionClick?: (region: JointRegion) => void;
  showLabels?: boolean;
}

interface RegionCardProps {
  region: JointRegion;
  data: ROMDiagramData | undefined;
  onJointClick?: (joint: ROMJointType, side?: string) => void;
  showLabels?: boolean;
  compact?: boolean;
}

// ============================================
// SEVERITY COLORS
// ============================================

const severityColors = {
  normal: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
    fill: '#22c55e',
  },
  mild: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-300',
    fill: '#eab308',
  },
  moderate: {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-300',
    fill: '#f97316',
  },
  severe: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
    fill: '#ef4444',
  },
};

// ============================================
// SPINE VIEW COMPONENT
// ============================================

function SpineView({ data, onRegionClick, showLabels = true }: SpineViewProps) {
  const getRegionColor = (region: JointRegion): string => {
    const regionData = data.find((d) => d.region === region);
    if (!regionData) return '#e5e7eb'; // gray-200

    const avgSeverity = regionData.measurements.reduce((acc, m) => {
      const severityOrder = ['normal', 'mild', 'moderate', 'severe'];
      return Math.max(acc, severityOrder.indexOf(m.severity));
    }, 0);

    const severityKey = ['normal', 'mild', 'moderate', 'severe'][avgSeverity] as keyof typeof severityColors;
    return severityColors[severityKey].fill;
  };

  return (
    <div className="relative w-48 mx-auto">
      <svg viewBox="0 0 100 200" className="w-full h-auto">
        {/* Background silhouette */}
        <ellipse cx="50" cy="25" rx="15" ry="20" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1" />

        {/* Cervical spine */}
        <g
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onRegionClick?.('cervical')}
        >
          <rect x="45" y="45" width="10" height="20" rx="2" fill={getRegionColor('cervical')} />
          {showLabels && (
            <text x="62" y="57" fontSize="6" fill="#374151">
              C
            </text>
          )}
        </g>

        {/* Thoracic spine */}
        <g
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onRegionClick?.('thoracic')}
        >
          <rect x="44" y="67" width="12" height="45" rx="2" fill={getRegionColor('thoracic')} />
          {showLabels && (
            <text x="62" y="92" fontSize="6" fill="#374151">
              T
            </text>
          )}
        </g>

        {/* Lumbar spine */}
        <g
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onRegionClick?.('lumbar')}
        >
          <rect x="43" y="114" width="14" height="26" rx="2" fill={getRegionColor('lumbar')} />
          {showLabels && (
            <text x="62" y="130" fontSize="6" fill="#374151">
              L
            </text>
          )}
        </g>

        {/* Shoulders */}
        <g
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onRegionClick?.('shoulder')}
        >
          {/* Left shoulder */}
          <ellipse cx="25" cy="65" rx="12" ry="8" fill={getRegionColor('shoulder')} />
          {/* Right shoulder */}
          <ellipse cx="75" cy="65" rx="12" ry="8" fill={getRegionColor('shoulder')} />
          {showLabels && (
            <>
              <text x="10" y="65" fontSize="5" fill="#374151">
                Sh
              </text>
              <text x="82" y="65" fontSize="5" fill="#374151">
                Sh
              </text>
            </>
          )}
        </g>

        {/* Elbows */}
        <g
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onRegionClick?.('elbow')}
        >
          <circle cx="15" cy="100" r="5" fill={getRegionColor('elbow')} />
          <circle cx="85" cy="100" r="5" fill={getRegionColor('elbow')} />
        </g>

        {/* Hips */}
        <g
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onRegionClick?.('hip')}
        >
          <ellipse cx="35" cy="145" rx="10" ry="8" fill={getRegionColor('hip')} />
          <ellipse cx="65" cy="145" rx="10" ry="8" fill={getRegionColor('hip')} />
          {showLabels && (
            <>
              <text x="25" y="148" fontSize="5" fill="#374151">
                Hip
              </text>
              <text x="75" y="148" fontSize="5" fill="#374151">
                Hip
              </text>
            </>
          )}
        </g>

        {/* Knees */}
        <g
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onRegionClick?.('knee')}
        >
          <circle cx="35" cy="168" r="5" fill={getRegionColor('knee')} />
          <circle cx="65" cy="168" r="5" fill={getRegionColor('knee')} />
        </g>

        {/* Ankles */}
        <g
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onRegionClick?.('ankle')}
        >
          <circle cx="35" cy="192" r="4" fill={getRegionColor('ankle')} />
          <circle cx="65" cy="192" r="4" fill={getRegionColor('ankle')} />
        </g>
      </svg>

      {/* Legend */}
      <div className="mt-4 flex justify-center gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Normal</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>Mild</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-orange-500" />
          <span>Moderate</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>Severe</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// REGION CARD COMPONENT
// ============================================

function RegionCard({
  region,
  data,
  onJointClick,
  showLabels = true,
  compact = false,
}: RegionCardProps) {
  const regionInfo = ROM_REGIONS[region];

  if (!data) {
    return (
      <div className={cn('border rounded-lg p-4', compact ? 'p-2' : 'p-4')}>
        <h3 className="font-medium text-gray-500">{regionInfo.name}</h3>
        <p className="text-sm text-gray-400 mt-1">No measurements</p>
      </div>
    );
  }

  return (
    <div className={cn('border rounded-lg', compact ? 'p-2' : 'p-4')}>
      <h3 className={cn('font-medium', compact ? 'text-sm' : 'text-base')}>
        {regionInfo.name}
      </h3>

      <div className={cn('mt-2 space-y-2', compact ? 'space-y-1' : 'space-y-2')}>
        {data.measurements.map((m, idx) => {
          const colors = severityColors[m.severity];

          return (
            <div
              key={idx}
              className={cn(
                'flex items-center justify-between rounded px-2 py-1 cursor-pointer hover:opacity-80 transition-opacity',
                colors.bg,
                colors.border,
                'border'
              )}
              onClick={() => onJointClick?.(m.joint, m.leftDegrees ? 'left' : m.rightDegrees ? 'right' : undefined)}
            >
              <div className="flex-1">
                <span className={cn('text-sm font-medium', colors.text)}>
                  {showLabels ? m.movement : m.name}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                {m.leftDegrees !== undefined && (
                  <span className={colors.text}>L: {m.leftDegrees}°</span>
                )}
                {m.rightDegrees !== undefined && (
                  <span className={colors.text}>R: {m.rightDegrees}°</span>
                )}
                {m.degrees !== undefined && m.leftDegrees === undefined && (
                  <span className={colors.text}>{m.degrees}°</span>
                )}
                <span className="text-gray-500">/ {m.normalDegrees}°</span>
                <span className={cn('font-medium', colors.text)}>
                  {m.percentOfNormal}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// ROM BAR CHART
// ============================================

interface ROMBarChartProps {
  data: ROMDiagramData[];
  selectedRegion?: JointRegion | null;
}

function ROMBarChart({ data, selectedRegion }: ROMBarChartProps) {
  const filteredData = selectedRegion
    ? data.filter((d) => d.region === selectedRegion)
    : data;

  const allMeasurements = filteredData.flatMap((d) => d.measurements);

  if (allMeasurements.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        No ROM measurements to display
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {allMeasurements.map((m, idx) => {
        const colors = severityColors[m.severity];
        const maxPercent = Math.min(Math.max(m.percentOfNormal, 0), 150);

        return (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{m.name}</span>
              <span className={colors.text}>
                {m.degrees !== undefined ? `${m.degrees}° ` : ''}
                ({m.percentOfNormal}%)
              </span>
            </div>

            <div className="h-4 bg-gray-100 rounded-full overflow-hidden relative">
              {/* Normal range indicator */}
              <div
                className="absolute top-0 bottom-0 bg-green-200 opacity-50"
                style={{ left: '0%', width: '100%' }}
              />

              {/* Actual value bar */}
              <div
                className={cn('h-full rounded-full transition-all', colors.bg)}
                style={{ width: `${Math.min(maxPercent, 100)}%` }}
              />

              {/* 100% marker */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-gray-400" style={{ left: '100%' }} />
            </div>

            {/* Bilateral display */}
            {(m.leftDegrees !== undefined || m.rightDegrees !== undefined) && (
              <div className="flex gap-4 text-xs text-gray-600 pl-2">
                {m.leftDegrees !== undefined && (
                  <span>
                    Left: {m.leftDegrees}° ({m.leftPercentOfNormal}%)
                  </span>
                )}
                {m.rightDegrees !== undefined && (
                  <span>
                    Right: {m.rightDegrees}° ({m.rightPercentOfNormal}%)
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// MAIN ROM DIAGRAM COMPONENT
// ============================================

export function ROMDiagram({
  data,
  selectedRegion,
  onRegionClick,
  onJointClick,
  showLabels = true,
  compact = false,
  className,
}: ROMDiagramProps) {
  const dataByRegion = useMemo(() => {
    const map = new Map<JointRegion, ROMDiagramData>();
    for (const d of data) {
      map.set(d.region, d);
    }
    return map;
  }, [data]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Body diagram */}
      <SpineView data={data} onRegionClick={onRegionClick} showLabels={showLabels} />

      {/* Region detail cards */}
      {selectedRegion ? (
        <RegionCard
          region={selectedRegion}
          data={dataByRegion.get(selectedRegion)}
          onJointClick={onJointClick}
          showLabels={showLabels}
          compact={compact}
        />
      ) : (
        <div className={cn('grid gap-4', compact ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2')}>
          {(Object.keys(ROM_REGIONS) as JointRegion[]).map((region) => (
            <RegionCard
              key={region}
              region={region}
              data={dataByRegion.get(region)}
              onJointClick={onJointClick}
              showLabels={showLabels}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// ROM SUMMARY CARD
// ============================================

interface ROMSummaryCardProps {
  summary: {
    totalMeasurements: number;
    restrictedCount: number;
    normalCount: number;
    averagePercentOfNormal: number;
    mostRestricted: {
      joint: ROMJointType;
      side: string | null;
      percentOfNormal: number;
      degrees: number;
    } | null;
  };
  className?: string;
}

export function ROMSummaryCard({ summary, className }: ROMSummaryCardProps) {
  const overallSeverity =
    summary.averagePercentOfNormal >= 90
      ? 'normal'
      : summary.averagePercentOfNormal >= 75
        ? 'mild'
        : summary.averagePercentOfNormal >= 50
          ? 'moderate'
          : 'severe';

  const colors = severityColors[overallSeverity];

  return (
    <div className={cn('border rounded-lg p-4', className)}>
      <h3 className="font-medium mb-3">ROM Summary</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-2xl font-bold">{summary.totalMeasurements}</div>
          <div className="text-sm text-gray-500">Measurements</div>
        </div>

        <div>
          <div className={cn('text-2xl font-bold', colors.text)}>
            {summary.averagePercentOfNormal}%
          </div>
          <div className="text-sm text-gray-500">Avg of Normal</div>
        </div>

        <div>
          <div className="text-2xl font-bold text-green-600">{summary.normalCount}</div>
          <div className="text-sm text-gray-500">Normal</div>
        </div>

        <div>
          <div className="text-2xl font-bold text-red-600">{summary.restrictedCount}</div>
          <div className="text-sm text-gray-500">Restricted</div>
        </div>
      </div>

      {summary.mostRestricted && (
        <div className="mt-4 pt-4 border-t">
          <div className="text-sm text-gray-500">Most Restricted</div>
          <div className="font-medium">
            {ROM_DEFINITIONS[summary.mostRestricted.joint]?.name}
            {summary.mostRestricted.side && ` (${summary.mostRestricted.side})`}
          </div>
          <div className="text-sm text-red-600">
            {summary.mostRestricted.degrees}° ({summary.mostRestricted.percentOfNormal}% of normal)
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// ROM COMPARISON VIEW
// ============================================

interface ROMComparisonViewProps {
  comparisons: Array<{
    joint: ROMJointType;
    side: string | null;
    previousDegrees: number;
    currentDegrees: number;
    change: number;
    changePercent: number;
    improvement: 'improved' | 'declined' | 'stable';
  }>;
  previousDate: Date;
  currentDate: Date;
  className?: string;
}

export function ROMComparisonView({
  comparisons,
  previousDate,
  currentDate,
  className,
}: ROMComparisonViewProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex justify-between text-sm text-gray-500">
        <span>{previousDate.toLocaleDateString()}</span>
        <span>→</span>
        <span>{currentDate.toLocaleDateString()}</span>
      </div>

      <div className="space-y-2">
        {comparisons.map((c, idx) => {
          const definition = ROM_DEFINITIONS[c.joint];
          const improvementColor =
            c.improvement === 'improved'
              ? 'text-green-600'
              : c.improvement === 'declined'
                ? 'text-red-600'
                : 'text-gray-600';

          return (
            <div
              key={idx}
              className="flex items-center justify-between py-2 border-b last:border-0"
            >
              <div>
                <div className="font-medium text-sm">
                  {definition?.name}
                  {c.side && ` (${c.side})`}
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">{c.previousDegrees}°</span>
                <span>→</span>
                <span className="font-medium">{c.currentDegrees}°</span>
                <span className={cn('font-medium', improvementColor)}>
                  {c.change > 0 ? '+' : ''}
                  {c.change}° ({c.changePercent > 0 ? '+' : ''}
                  {c.changePercent}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ROMBarChart, SpineView };
