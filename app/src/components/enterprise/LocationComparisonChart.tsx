// Location Comparison Chart Component - US-255
// Compare locations side-by-side with key metrics

'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { trpc } from '@/trpc/client';

interface LocationComparisonChartProps {
  dateRange: {
    start: Date;
    end: Date;
  };
  locationIds: string[];
}

type MetricKey =
  | 'appointments'
  | 'completedVisits'
  | 'noShowRate'
  | 'newPatients'
  | 'totalCharges'
  | 'totalCollections'
  | 'collectionRate'
  | 'avgRevenuePerVisit'
  | 'outstandingAR';

const metricOptions: { value: MetricKey; label: string }[] = [
  { value: 'appointments', label: 'Total Appointments' },
  { value: 'completedVisits', label: 'Completed Visits' },
  { value: 'noShowRate', label: 'No-Show Rate' },
  { value: 'newPatients', label: 'New Patients' },
  { value: 'totalCharges', label: 'Total Charges' },
  { value: 'totalCollections', label: 'Collections' },
  { value: 'collectionRate', label: 'Collection Rate' },
  { value: 'avgRevenuePerVisit', label: 'Avg Revenue/Visit' },
  { value: 'outstandingAR', label: 'Outstanding A/R' },
];

export function LocationComparisonChart({
  dateRange,
  locationIds,
}: LocationComparisonChartProps) {
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>([
    'totalCollections',
    'completedVisits',
    'collectionRate',
  ]);

  const { data: comparison, isLoading } = trpc.enterpriseReporting.compareLocations.useQuery(
    {
      dateRange,
      locationIds,
      metrics: selectedMetrics,
    },
    {
      enabled: locationIds.length >= 2,
    }
  );

  const formatValue = (value: number, format: 'number' | 'currency' | 'percentage') => {
    switch (format) {
      case 'currency':
        return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      case 'percentage':
        return `${value.toFixed(1)}%`;
      default:
        return value.toLocaleString();
    }
  };

  const getMaxForMetric = (metricIndex: number) => {
    if (!comparison?.rows[metricIndex]) return 0;
    return Math.max(...comparison.rows[metricIndex].locations.map((l) => l.value));
  };

  const getTrendIcon = (value: number, avg: number) => {
    if (value > avg * 1.1) return <TrendingUp className="h-3 w-3 text-green-600" />;
    if (value < avg * 0.9) return <TrendingDown className="h-3 w-3 text-red-600" />;
    return <Minus className="h-3 w-3 text-stone-400" />;
  };

  if (locationIds.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#053e67]" />
            Location Comparison
          </CardTitle>
          <CardDescription>Select at least 2 locations to compare</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-stone-500">
            <p>Please select multiple locations to enable comparison</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#053e67]" />
              Location Comparison
            </CardTitle>
            <CardDescription>
              Compare key metrics across {locationIds.length} locations
            </CardDescription>
          </div>
          <Select
            value={selectedMetrics[0]}
            onValueChange={(value) => {
              const metrics = [value as MetricKey, ...selectedMetrics.slice(1)];
              setSelectedMetrics(metrics);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Primary metric" />
            </SelectTrigger>
            <SelectContent>
              {metricOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : comparison ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead className="w-[180px]">Metric</TableHead>
                {comparison.rows[0]?.locations.map((loc) => (
                  <TableHead key={loc.locationId} className="text-center">
                    {loc.locationName}
                  </TableHead>
                ))}
                <TableHead className="text-center">Enterprise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.rows.map((row, rowIndex) => {
                const maxValue = getMaxForMetric(rowIndex);
                return (
                  <TableRow key={row.metric}>
                    <TableCell className="font-medium">{row.metricLabel}</TableCell>
                    {row.locations.map((loc) => {
                      const progress = maxValue > 0 ? (loc.value / maxValue) * 100 : 0;
                      const isLeader = loc.value === maxValue && maxValue > 0;
                      return (
                        <TableCell key={loc.locationId} className="text-center">
                          <div className="space-y-1">
                            <div className="flex items-center justify-center gap-1">
                              <span className={isLeader ? 'font-bold text-[#053e67]' : ''}>
                                {formatValue(loc.value, row.format)}
                              </span>
                              {getTrendIcon(loc.value, row.enterpriseAverage)}
                              {isLeader && (
                                <Badge
                                  variant="secondary"
                                  className="text-xs bg-green-100 text-green-800 ml-1"
                                >
                                  Top
                                </Badge>
                              )}
                            </div>
                            {row.format !== 'percentage' && (
                              <Progress value={progress} className="h-1.5" />
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center bg-stone-50">
                      <div className="text-sm">
                        <div className="font-medium">
                          {formatValue(row.enterpriseTotal, row.format)}
                        </div>
                        <div className="text-xs text-stone-500">
                          Avg: {formatValue(row.enterpriseAverage, row.format)}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-stone-500">
            <p>No comparison data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
