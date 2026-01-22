'use client';

/**
 * Epic 14: Patient Portal - Treatment Plan View Component
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import {
  Target,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  AlertCircle,
} from 'lucide-react';

export function TreatmentPlanView() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const { data: planData, isLoading } = trpc.portal.getTreatmentPlan.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  if (!token) return null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!planData || !planData.treatmentPlan) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Treatment Plan</h1>
          <p className="text-gray-600">View your personalized treatment plan</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-2">No active treatment plan</p>
            <p className="text-sm text-gray-400">
              Your provider will create a treatment plan after your initial assessment.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const plan = planData.treatmentPlan;
  const completedVisits = plan.completedVisits ?? 0;
  const totalVisits = plan.plannedVisits ?? 0;
  const progress = totalVisits > 0
    ? Math.round((completedVisits / totalVisits) * 100)
    : 0;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      ACTIVE: { label: 'Active', variant: 'default' },
      COMPLETED: { label: 'Completed', variant: 'secondary' },
      ON_HOLD: { label: 'On Hold', variant: 'outline' },
      DISCONTINUED: { label: 'Discontinued', variant: 'destructive' },
    };
    const config = variants[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getGoalIcon = (status: string) => {
    switch (status) {
      case 'ACHIEVED':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'IN_PROGRESS':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'NOT_STARTED':
        return <Circle className="h-5 w-5 text-gray-300" />;
      default:
        return <Circle className="h-5 w-5 text-gray-300" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Treatment Plan</h1>
        <p className="text-gray-600">View your personalized treatment plan</p>
      </div>

      {/* Plan Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>
                Started {format(new Date(plan.startDate), 'MMMM d, yyyy')}
              </CardDescription>
            </div>
            {getStatusBadge(plan.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Treatment Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3" />
            <p className="text-sm text-gray-500">
              {plan.completedVisits || 0} of {plan.plannedVisits || 0} visits completed
            </p>
          </div>

          {/* Key Dates */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Calendar className="h-4 w-4" />
                Start Date
              </div>
              <p className="font-medium">
                {format(new Date(plan.startDate), 'MMM d, yyyy')}
              </p>
            </div>
            {plan.endDate && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Target className="h-4 w-4" />
                  Target End
                </div>
                <p className="font-medium">
                  {format(new Date(plan.endDate), 'MMM d, yyyy')}
                </p>
              </div>
            )}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Clock className="h-4 w-4" />
                Frequency
              </div>
              <p className="font-medium">{plan.frequency || 'As needed'}</p>
            </div>
          </div>

          {/* Description */}
          {plan.description && (
            <div>
              <h3 className="font-medium mb-2">Plan Description</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{plan.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Treatment Goals */}
      {plan.goals && plan.goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Treatment Goals
            </CardTitle>
            <CardDescription>
              Goals we&apos;re working toward together
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {plan.goals.map((goal, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 border rounded-lg"
                >
                  {getGoalIcon(goal.status)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium">{goal.description}</h4>
                      <Badge
                        variant={goal.status === 'ACHIEVED' ? 'default' : 'outline'}
                        className="text-xs"
                      >
                        {goal.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {goal.progress !== null && goal.progress !== undefined && (
                      <p className="text-sm text-gray-600">Progress: {goal.progress}%</p>
                    )}
                    {goal.targetDate && (
                      <p className="text-xs text-gray-400 mt-2">
                        Target: {format(new Date(goal.targetDate), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Important Notice */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#053e67] mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Questions about your treatment?</p>
              <p>
                Please reach out through our secure messaging system or call our
                office directly. We&apos;re here to help you on your path to wellness.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
