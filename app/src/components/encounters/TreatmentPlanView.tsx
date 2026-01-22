'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Target, Plus, Calendar } from 'lucide-react';
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TreatmentPlanViewProps {
  patientId: string;
  encounterId: string;
  readOnly?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800 border-green-200',
  ON_HOLD: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  COMPLETED: 'bg-blue-100 text-blue-800 border-blue-200',
  CANCELLED: 'bg-gray-100 text-gray-800 border-gray-200',
};

export function TreatmentPlanView({
  patientId,
  readOnly = false,
}: TreatmentPlanViewProps) {
  const { data: plans } = trpc.treatmentPlan.getByPatient.useQuery({
    patientId,
    includeInactive: true,
  });

  const activePlans = plans?.filter((p) => p.status === 'ACTIVE') || [];
  const completedPlans = plans?.filter((p) => p.status === 'COMPLETED') || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-[#053e67]/50" />
              Treatment Plans
            </CardTitle>
            <CardDescription>
              Long-term treatment goals and visit frequency
            </CardDescription>
          </div>
          {!readOnly && (
            <Button onClick={() => {}}>
              <Plus className="h-4 w-4 mr-2" />
              New Plan
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active Plans */}
        {activePlans.length > 0 ? (
          <div className="space-y-4">
            {activePlans.map((plan) => {
              const plannedVisits = plan.plannedVisits ?? 0;
              const completedVisits = plan.completedVisits ?? 0;
              const visitProgress =
                plannedVisits > 0
                  ? Math.round((completedVisits / plannedVisits) * 100)
                  : 0;

              return (
                <div
                  key={plan.id}
                  className="p-4 rounded-lg border border-gray-200 space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{plan.name}</h4>
                        <Badge className={cn('font-medium', STATUS_COLORS[plan.status] || STATUS_COLORS.ACTIVE)}>
                          {plan.status}
                        </Badge>
                      </div>
                      {plan.description && (
                        <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(plan.startDate), 'MMM d, yyyy')}
                          {plan.endDate && ` - ${format(new Date(plan.endDate), 'MMM d, yyyy')}`}
                        </span>
                        <span>Frequency: {plan.frequency}</span>
                      </div>
                    </div>
                  </div>

                  {/* Visit Progress */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Visit Progress</span>
                      <span className="font-medium">
                        {completedVisits} / {plannedVisits} visits
                      </span>
                    </div>
                    <Progress value={visitProgress} className="h-2" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Target className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No active treatment plans</p>
          </div>
        )}

        {/* Completed Plans */}
        {completedPlans.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-500">Completed Plans</p>
            {completedPlans.map((plan) => (
              <div
                key={plan.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-700">{plan.name}</p>
                  <p className="text-xs text-gray-400">
                    {plan.completedVisits} visits completed
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Completed
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
