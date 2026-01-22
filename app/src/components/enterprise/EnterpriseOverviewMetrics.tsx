// Enterprise Overview Metrics Component - US-255
// All-locations overview metrics for the enterprise dashboard

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  UserPlus,
  Percent,
  Receipt,
  Activity,
} from 'lucide-react';
import { trpc } from '@/trpc/client';

interface EnterpriseOverviewMetricsProps {
  dateRange: {
    start: Date;
    end: Date;
  };
  selectedLocationIds?: string[];
}

export function EnterpriseOverviewMetrics({
  dateRange,
  selectedLocationIds,
}: EnterpriseOverviewMetricsProps) {
  const { data: enterpriseData, isLoading } = trpc.enterpriseReporting.getEnterprise.useQuery({
    dateRange,
    locationIds: selectedLocationIds,
  });

  const metrics = useMemo(() => {
    if (!enterpriseData) return null;
    return enterpriseData.totals;
  }, [enterpriseData]);

  const locationCount = enterpriseData?.locationCount || 0;

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
      {/* Location Count */}
      <Card className="bg-gradient-to-br from-[#053e67]/10 to-[#053e67]/5 border-[#053e67]/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#053e67]">Locations</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-[#053e67]">{locationCount}</p>
              )}
            </div>
            <div className="p-3 bg-[#053e67]/10 rounded-full">
              <Building2 className="h-6 w-6 text-[#053e67]" />
            </div>
          </div>
          <p className="text-xs text-[#053e67]/70 mt-2">Active practice locations</p>
        </CardContent>
      </Card>

      {/* Total Revenue */}
      <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-700">Total Revenue</p>
              {isLoading ? (
                <Skeleton className="h-8 w-28 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-green-900">
                  ${(metrics?.totalCollections || 0).toLocaleString('en-US', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </p>
              )}
            </div>
            <div className="p-3 bg-green-200/50 rounded-full">
              <DollarSign className="h-6 w-6 text-green-700" />
            </div>
          </div>
          <div className="flex items-center mt-2 text-xs text-green-700">
            <TrendingUp className="h-3 w-3 mr-1" />
            <span>Collections across all locations</span>
          </div>
        </CardContent>
      </Card>

      {/* Total Appointments */}
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#053e67]">Appointments</p>
              {isLoading ? (
                <Skeleton className="h-8 w-20 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-blue-900">
                  {(metrics?.totalAppointments || 0).toLocaleString()}
                </p>
              )}
            </div>
            <div className="p-3 bg-blue-200/50 rounded-full">
              <Calendar className="h-6 w-6 text-[#053e67]" />
            </div>
          </div>
          <div className="flex items-center mt-2 text-xs text-[#053e67]">
            <Activity className="h-3 w-3 mr-1" />
            <span>{metrics?.completedAppointments || 0} completed</span>
          </div>
        </CardContent>
      </Card>

      {/* Total Patients */}
      <Card className="bg-gradient-to-br from-stone-50 to-stone-100 border-stone-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-600">Total Patients</p>
              {isLoading ? (
                <Skeleton className="h-8 w-20 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-stone-900">
                  {(metrics?.totalPatients || 0).toLocaleString()}
                </p>
              )}
            </div>
            <div className="p-3 bg-stone-200/50 rounded-full">
              <Users className="h-6 w-6 text-stone-600" />
            </div>
          </div>
          <div className="flex items-center mt-2 text-xs text-stone-600">
            <UserPlus className="h-3 w-3 mr-1" />
            <span>{metrics?.newPatients || 0} new this period</span>
          </div>
        </CardContent>
      </Card>

      {/* Collection Rate */}
      <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-700">Collection Rate</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-purple-900">
                  {metrics?.avgCollectionRate || 0}%
                </p>
              )}
            </div>
            <div className="p-3 bg-purple-200/50 rounded-full">
              <Percent className="h-6 w-6 text-purple-700" />
            </div>
          </div>
          <div className="flex items-center mt-2 text-xs text-purple-700">
            <Receipt className="h-3 w-3 mr-1" />
            <span>Outstanding: ${(metrics?.outstandingAR || 0).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
