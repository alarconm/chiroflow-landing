// Location Dashboard Cards Component - US-255
// Quick access cards to individual location dashboards with health indicators

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  MapPin,
  ArrowRight,
  Users,
  Calendar,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Building2,
  Clock,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import Link from 'next/link';

interface LocationDashboardCardsProps {
  dateRange: {
    start: Date;
    end: Date;
  };
}

type HealthStatus = 'healthy' | 'warning' | 'critical';

interface LocationHealth {
  status: HealthStatus;
  issues: string[];
}

function getHealthStatus(metrics: {
  noShowRate?: number;
  collectionRate?: number;
  outstandingAR?: number;
  totalAppointments?: number;
}): LocationHealth {
  const issues: string[] = [];

  // Check no-show rate (warning > 10%, critical > 20%)
  if (metrics.noShowRate !== undefined) {
    if (metrics.noShowRate > 20) {
      issues.push('High no-show rate');
    } else if (metrics.noShowRate > 10) {
      issues.push('Elevated no-show rate');
    }
  }

  // Check collection rate (warning < 85%, critical < 70%)
  if (metrics.collectionRate !== undefined) {
    if (metrics.collectionRate < 70) {
      issues.push('Low collection rate');
    } else if (metrics.collectionRate < 85) {
      issues.push('Below target collection rate');
    }
  }

  // Determine overall status
  const criticalCount = issues.filter((i) =>
    i.includes('High') || i.includes('Low')
  ).length;

  if (criticalCount > 0) {
    return { status: 'critical', issues };
  } else if (issues.length > 0) {
    return { status: 'warning', issues };
  }
  return { status: 'healthy', issues: [] };
}

function HealthIndicator({ health }: { health: LocationHealth }) {
  const iconClass = 'h-4 w-4';

  switch (health.status) {
    case 'healthy':
      return (
        <div className="flex items-center gap-1">
          <CheckCircle2 className={`${iconClass} text-green-600`} />
          <span className="text-xs text-green-600 font-medium">Healthy</span>
        </div>
      );
    case 'warning':
      return (
        <div className="flex items-center gap-1">
          <AlertTriangle className={`${iconClass} text-amber-600`} />
          <span className="text-xs text-amber-600 font-medium">Attention</span>
        </div>
      );
    case 'critical':
      return (
        <div className="flex items-center gap-1">
          <XCircle className={`${iconClass} text-red-600`} />
          <span className="text-xs text-red-600 font-medium">Critical</span>
        </div>
      );
  }
}

export function LocationDashboardCards({ dateRange }: LocationDashboardCardsProps) {
  const { data: enterpriseData, isLoading } = trpc.enterpriseReporting.getEnterprise.useQuery({
    dateRange,
  });

  const { data: locations } = trpc.location.list.useQuery({
    includeInactive: false,
  });

  const locationCards = useMemo(() => {
    if (!enterpriseData?.byLocation || !locations) return [];

    return enterpriseData.byLocation.map((locMetrics) => {
      const locationInfo = locations.find((l) => l.id === locMetrics.locationId);
      const health = getHealthStatus({
        noShowRate: locMetrics.noShowRate,
        collectionRate: locMetrics.collectionRate,
        outstandingAR: locMetrics.outstandingAR,
        totalAppointments: locMetrics.totalAppointments,
      });

      return {
        ...locMetrics,
        locationInfo,
        health,
      };
    });
  }, [enterpriseData, locations]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-900">Location Overview</h2>
        <Badge variant="outline" className="text-stone-600">
          {locationCards.length} Locations
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {locationCards.map((location) => (
          <Card
            key={location.locationId}
            className={`hover:shadow-md transition-shadow ${
              location.health.status === 'critical'
                ? 'border-red-200'
                : location.health.status === 'warning'
                ? 'border-amber-200'
                : 'border-stone-200'
            }`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#053e67]/10 rounded-lg">
                    <MapPin className="h-4 w-4 text-[#053e67]" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      {location.locationName}
                    </CardTitle>
                    <p className="text-xs text-stone-500">{location.locationCode}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {location.locationInfo?.isPrimary && (
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-[#053e67]">
                      HQ
                    </Badge>
                  )}
                  <HealthIndicator health={location.health} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-stone-50 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-stone-500 mb-1">
                    <Calendar className="h-3 w-3" />
                    <span className="text-xs">Appointments</span>
                  </div>
                  <p className="text-lg font-bold text-stone-900">
                    {location.totalAppointments}
                  </p>
                  <p className="text-xs text-green-600">
                    {location.completedAppointments} completed
                  </p>
                </div>
                <div className="bg-stone-50 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-stone-500 mb-1">
                    <DollarSign className="h-3 w-3" />
                    <span className="text-xs">Revenue</span>
                  </div>
                  <p className="text-lg font-bold text-stone-900">
                    ${location.totalCollections.toLocaleString('en-US', {
                      maximumFractionDigits: 0,
                    })}
                  </p>
                  <p className="text-xs text-stone-500">
                    {location.collectionRate}% collected
                  </p>
                </div>
              </div>

              {/* Collection Progress */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-stone-500">Collection Rate</span>
                  <span className="text-xs font-medium">{location.collectionRate}%</span>
                </div>
                <Progress
                  value={location.collectionRate}
                  className={`h-1.5 ${
                    location.collectionRate >= 85
                      ? '[&>div]:bg-green-500'
                      : location.collectionRate >= 70
                      ? '[&>div]:bg-amber-500'
                      : '[&>div]:bg-red-500'
                  }`}
                />
              </div>

              {/* Health Issues */}
              {location.health.issues.length > 0 && (
                <div className="bg-amber-50 rounded-lg p-2 border border-amber-100">
                  <p className="text-xs font-medium text-amber-800 mb-1">
                    Attention needed:
                  </p>
                  <ul className="text-xs text-amber-700 space-y-0.5">
                    {location.health.issues.map((issue, i) => (
                      <li key={i}>- {issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Quick Stats Row */}
              <div className="flex items-center justify-between text-xs text-stone-500 pt-2 border-t border-stone-100">
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{location.totalPatients} patients</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{location.noShowRate}% no-show</span>
                </div>
              </div>

              {/* Action Button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full border-stone-300 hover:bg-blue-50 hover:border-blue-300"
                asChild
              >
                <Link href={`/dashboard?locationId=${location.locationId}`}>
                  View Dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
