'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import { NoShowRiskBadge } from './NoShowRiskBadge';
import { format } from 'date-fns';
import { AlertTriangle, Phone, Mail, RefreshCw, Calendar, User } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HighRiskAppointmentsProps {
  startDate: Date;
  endDate: Date;
}

export function HighRiskAppointments({ startDate, endDate }: HighRiskAppointmentsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, refetch } = trpc.aiScheduling.getHighRiskAppointments.useQuery({
    dateRange: { start: startDate, end: endDate },
    minRiskLevel: 'HIGH',
  });

  const refreshMutation = trpc.aiScheduling.refreshPredictions.useMutation({
    onSuccess: () => {
      refetch();
      setIsRefreshing(false);
    },
    onError: () => {
      setIsRefreshing(false);
    },
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshMutation.mutate({ daysAhead: 7 });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            High-Risk Appointments
          </CardTitle>
          <CardDescription>Loading predictions...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const appointments = data || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              High-Risk Appointments
            </CardTitle>
            <CardDescription>
              {appointments.length} appointment{appointments.length !== 1 ? 's' : ''} with high no-show risk
            </CardDescription>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh no-show predictions</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        {appointments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No high-risk appointments found for this period.</p>
            <p className="text-sm">That's great news!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((item) => (
              <div
                key={item.appointment.id}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-shrink-0">
                  <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                    <User className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {item.appointment.patient.demographics?.firstName}{' '}
                    {item.appointment.patient.demographics?.lastName}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(item.appointment.startTime), 'MMM d, yyyy h:mm a')}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.appointment.appointmentType.name} with{' '}
                    {item.appointment.provider.user.firstName} {item.appointment.provider.user.lastName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <NoShowRiskBadge
                    riskLevel={item.prediction.riskLevel}
                    probability={item.prediction.probability}
                    showProbability
                  />
                </div>
                <div className="flex gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Phone className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Call patient</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Mail className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Send reminder</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
