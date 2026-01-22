// Location Health Status Indicators Component - US-255
// Visual health status indicators for each location

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { trpc } from '@/trpc/client';

interface LocationHealthIndicatorsProps {
  dateRange: {
    start: Date;
    end: Date;
  };
}

type HealthLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

interface HealthMetric {
  name: string;
  value: number;
  target: number;
  unit: string;
  level: HealthLevel;
  trend: 'up' | 'down' | 'stable';
}

interface LocationHealthData {
  locationId: string;
  locationName: string;
  locationCode: string;
  isPrimary: boolean;
  overallHealth: HealthLevel;
  metrics: HealthMetric[];
}

function getHealthLevel(
  metricType: 'collectionRate' | 'noShowRate' | 'appointmentUtilization',
  value: number
): HealthLevel {
  switch (metricType) {
    case 'collectionRate':
      if (value >= 95) return 'excellent';
      if (value >= 90) return 'good';
      if (value >= 80) return 'fair';
      if (value >= 70) return 'poor';
      return 'critical';

    case 'noShowRate':
      if (value <= 3) return 'excellent';
      if (value <= 5) return 'good';
      if (value <= 10) return 'fair';
      if (value <= 15) return 'poor';
      return 'critical';

    case 'appointmentUtilization':
      if (value >= 90) return 'excellent';
      if (value >= 80) return 'good';
      if (value >= 70) return 'fair';
      if (value >= 60) return 'poor';
      return 'critical';

    default:
      return 'fair';
  }
}

function getOverallHealth(metrics: HealthMetric[]): HealthLevel {
  const levels: HealthLevel[] = ['excellent', 'good', 'fair', 'poor', 'critical'];
  const avgIndex =
    metrics.reduce((sum, m) => sum + levels.indexOf(m.level), 0) / metrics.length;
  return levels[Math.round(avgIndex)] || 'fair';
}

function HealthBadge({ level }: { level: HealthLevel }) {
  const config = {
    excellent: { bg: 'bg-green-100', text: 'text-green-800', label: 'Excellent' },
    good: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Good' },
    fair: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Fair' },
    poor: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Poor' },
    critical: { bg: 'bg-red-100', text: 'text-red-800', label: 'Critical' },
  };

  const c = config[level];

  return (
    <Badge className={`${c.bg} ${c.text} border-0`}>
      {c.label}
    </Badge>
  );
}

function HealthIcon({ level }: { level: HealthLevel }) {
  const iconClass = 'h-5 w-5';

  switch (level) {
    case 'excellent':
    case 'good':
      return <CheckCircle2 className={`${iconClass} text-green-600`} />;
    case 'fair':
      return <AlertTriangle className={`${iconClass} text-amber-600`} />;
    case 'poor':
    case 'critical':
      return <XCircle className={`${iconClass} text-red-600`} />;
  }
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  const iconClass = 'h-3 w-3';

  switch (trend) {
    case 'up':
      return <TrendingUp className={`${iconClass} text-green-600`} />;
    case 'down':
      return <TrendingDown className={`${iconClass} text-red-600`} />;
    case 'stable':
      return <Minus className={`${iconClass} text-stone-400`} />;
  }
}

function getHealthBarColor(level: HealthLevel): string {
  switch (level) {
    case 'excellent':
      return 'bg-green-500';
    case 'good':
      return 'bg-blue-500';
    case 'fair':
      return 'bg-amber-500';
    case 'poor':
      return 'bg-orange-500';
    case 'critical':
      return 'bg-red-500';
  }
}

export function LocationHealthIndicators({ dateRange }: LocationHealthIndicatorsProps) {
  const { data: enterpriseData, isLoading } = trpc.enterpriseReporting.getEnterprise.useQuery({
    dateRange,
  });

  const { data: locations } = trpc.location.list.useQuery({
    includeInactive: false,
  });

  const healthData = useMemo((): LocationHealthData[] => {
    if (!enterpriseData?.byLocation || !locations) return [];

    return enterpriseData.byLocation.map((locMetrics) => {
      const locationInfo = locations.find((l) => l.id === locMetrics.locationId);

      // Calculate utilization (completed / total appointments)
      const utilization =
        locMetrics.totalAppointments > 0
          ? (locMetrics.completedAppointments / locMetrics.totalAppointments) * 100
          : 0;

      const metrics: HealthMetric[] = [
        {
          name: 'Collection Rate',
          value: locMetrics.collectionRate,
          target: 90,
          unit: '%',
          level: getHealthLevel('collectionRate', locMetrics.collectionRate),
          trend: 'stable', // Would compare with previous period
        },
        {
          name: 'No-Show Rate',
          value: locMetrics.noShowRate,
          target: 5,
          unit: '%',
          level: getHealthLevel('noShowRate', locMetrics.noShowRate),
          trend: 'stable',
        },
        {
          name: 'Appointment Completion',
          value: Math.round(utilization * 10) / 10,
          target: 85,
          unit: '%',
          level: getHealthLevel('appointmentUtilization', utilization),
          trend: 'stable',
        },
      ];

      return {
        locationId: locMetrics.locationId,
        locationName: locMetrics.locationName,
        locationCode: locMetrics.locationCode,
        isPrimary: locationInfo?.isPrimary || false,
        overallHealth: getOverallHealth(metrics),
        metrics,
      };
    });
  }, [enterpriseData, locations]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Location Health Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by health level (worst first)
  const sortedData = [...healthData].sort((a, b) => {
    const levels: HealthLevel[] = ['critical', 'poor', 'fair', 'good', 'excellent'];
    return levels.indexOf(a.overallHealth) - levels.indexOf(b.overallHealth);
  });

  // Count by health level
  const healthCounts = {
    excellent: healthData.filter((l) => l.overallHealth === 'excellent').length,
    good: healthData.filter((l) => l.overallHealth === 'good').length,
    fair: healthData.filter((l) => l.overallHealth === 'fair').length,
    poor: healthData.filter((l) => l.overallHealth === 'poor').length,
    critical: healthData.filter((l) => l.overallHealth === 'critical').length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#053e67]" />
              Location Health Status
            </CardTitle>
            <CardDescription>
              Key performance indicators across all locations
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {healthCounts.critical > 0 && (
              <Badge variant="destructive">{healthCounts.critical} Critical</Badge>
            )}
            {healthCounts.poor > 0 && (
              <Badge className="bg-orange-100 text-orange-800 border-0">
                {healthCounts.poor} Need Attention
              </Badge>
            )}
            {healthCounts.excellent + healthCounts.good === healthData.length && (
              <Badge className="bg-green-100 text-green-800 border-0">
                All Healthy
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedData.map((location) => (
            <div
              key={location.locationId}
              className={`p-4 rounded-lg border ${
                location.overallHealth === 'critical'
                  ? 'bg-red-50 border-red-200'
                  : location.overallHealth === 'poor'
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-stone-50 border-stone-200'
              }`}
            >
              {/* Location Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <HealthIcon level={location.overallHealth} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{location.locationName}</span>
                      {location.isPrimary && (
                        <Badge
                          variant="secondary"
                          className="text-xs bg-blue-100 text-[#053e67]"
                        >
                          HQ
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-stone-500">{location.locationCode}</p>
                  </div>
                </div>
                <HealthBadge level={location.overallHealth} />
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-3">
                {location.metrics.map((metric) => (
                  <div key={metric.name} className="bg-white rounded-lg p-3 border border-stone-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-stone-500">{metric.name}</span>
                      <TrendIcon trend={metric.trend} />
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold text-stone-900">
                        {metric.value}
                      </span>
                      <span className="text-xs text-stone-500">{metric.unit}</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getHealthBarColor(metric.level)} rounded-full`}
                        style={{
                          width: `${Math.min(
                            (metric.value / metric.target) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-stone-400 mt-1">
                      Target: {metric.target}
                      {metric.unit}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
