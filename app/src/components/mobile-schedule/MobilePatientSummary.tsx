'use client';

import { format, parseISO, differenceInYears } from 'date-fns';
import {
  User,
  Phone,
  Mail,
  Calendar,
  AlertTriangle,
  FileText,
  ChevronLeft,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';

interface MobilePatientSummaryProps {
  appointmentId?: string;
  patientId?: string;
  onBack?: () => void;
  onViewFullRecord?: (patientId: string) => void;
}

export function MobilePatientSummary({
  appointmentId,
  patientId,
  onBack,
  onViewFullRecord,
}: MobilePatientSummaryProps) {
  const { data, isLoading, error } = trpc.mobileSchedule.getPatientSummary.useQuery(
    {
      appointmentId,
      patientId,
    },
    {
      enabled: !!(appointmentId || patientId),
    }
  );

  if (isLoading) {
    return <MobilePatientSummarySkeleton onBack={onBack} />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-full bg-stone-50">
        <div className="sticky top-0 z-10 bg-[#053e67] text-white px-4 py-3 flex items-center gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="text-white hover:bg-white/10"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <h1 className="text-lg font-semibold">Patient Summary</h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardContent className="py-8 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
              <p className="text-stone-600">
                {error?.message || 'Failed to load patient summary'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { patient, alerts, activeTreatmentPlans, recentVisits, totalVisits } = data;
  const demographics = patient.demographics;

  const age = demographics?.dateOfBirth
    ? differenceInYears(new Date(), parseISO(demographics.dateOfBirth))
    : null;

  const initials = demographics
    ? `${demographics.firstName?.[0] || ''}${demographics.lastName?.[0] || ''}`.toUpperCase()
    : 'PT';

  return (
    <div className="flex flex-col h-full bg-stone-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#053e67] text-white px-4 py-3 flex items-center gap-3">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <h1 className="text-lg font-semibold">Patient Summary</h1>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Patient Info Card */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-[#053e67] text-white text-xl">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold">
                    {demographics?.preferredName || demographics?.firstName}{' '}
                    {demographics?.lastName}
                  </h2>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline">MRN: {patient.mrn}</Badge>
                    {age !== null && (
                      <Badge variant="outline">{age} years old</Badge>
                    )}
                    {demographics?.gender && (
                      <Badge variant="outline">{demographics.gender}</Badge>
                    )}
                    <Badge
                      className={cn(
                        patient.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-stone-100 text-stone-600'
                      )}
                    >
                      {patient.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              {patient.contact && (
                <div className="mt-4 space-y-2">
                  {patient.contact.phone && (
                    <a
                      href={`tel:${patient.contact.phone}`}
                      className="flex items-center gap-2 text-sm text-[#053e67] hover:underline"
                    >
                      <Phone className="h-4 w-4" />
                      {patient.contact.phone}
                    </a>
                  )}
                  {patient.contact.email && (
                    <a
                      href={`mailto:${patient.contact.email}`}
                      className="flex items-center gap-2 text-sm text-[#053e67] hover:underline"
                    >
                      <Mail className="h-4 w-4" />
                      {patient.contact.email}
                    </a>
                  )}
                </div>
              )}

              {/* Emergency Contact */}
              {patient.emergencyContact && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-stone-500 mb-1">Emergency Contact</p>
                  <p className="font-medium">{patient.emergencyContact.name}</p>
                  <p className="text-sm text-stone-600">
                    {patient.emergencyContact.relationship} •{' '}
                    <a
                      href={`tel:${patient.emergencyContact.phone}`}
                      className="text-[#053e67] hover:underline"
                    >
                      {patient.emergencyContact.phone}
                    </a>
                  </p>
                </div>
              )}

              {/* Insurance */}
              {patient.insurance && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-stone-500 mb-1">Insurance</p>
                  <p className="font-medium">{patient.insurance.payerName}</p>
                  <p className="text-sm text-stone-600">
                    Policy #: {patient.insurance.policyNumber}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alerts */}
          {alerts.length > 0 && (
            <Card className="border-amber-300 bg-amber-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-1">
                  {alerts.map((alert, idx) => (
                    <li key={idx} className="text-sm text-amber-800">
                      • {alert}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Active Treatment Plans */}
          {activeTreatmentPlans.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Active Treatment Plans
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {activeTreatmentPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="p-3 bg-stone-50 rounded-lg"
                    >
                      <p className="font-medium">{plan.name}</p>
                      {plan.startDate && (
                        <p className="text-sm text-stone-500">
                          Started {format(parseISO(plan.startDate), 'MMM d, yyyy')}
                        </p>
                      )}
                      {plan.goals != null && (
                        <p className="text-sm text-stone-600 mt-1 line-clamp-2">
                          {typeof plan.goals === 'string' ? plan.goals : JSON.stringify(plan.goals)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Visits */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Visit History
                </span>
                <Badge variant="outline">{totalVisits} total</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {recentVisits.length > 0 ? (
                <div className="space-y-2">
                  {recentVisits.map((visit) => (
                    <div
                      key={visit.id}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div>
                        <p className="font-medium text-sm">{visit.type}</p>
                        <p className="text-xs text-stone-500">{visit.provider}</p>
                      </div>
                      <p className="text-sm text-stone-600">
                        {format(parseISO(visit.date), 'MMM d, yyyy')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500">No previous visits</p>
              )}
            </CardContent>
          </Card>

          {/* View Full Record Button */}
          {onViewFullRecord && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onViewFullRecord(patient.id)}
            >
              <FileText className="h-4 w-4 mr-2" />
              View Full Patient Record
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MobilePatientSummarySkeleton({ onBack }: { onBack?: () => void }) {
  return (
    <div className="flex flex-col h-full bg-stone-50">
      <div className="sticky top-0 z-10 bg-[#053e67] text-white px-4 py-3 flex items-center gap-3">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <h1 className="text-lg font-semibold">Patient Summary</h1>
      </div>
      <div className="p-4 space-y-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-6 w-40 mb-2" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-48" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default MobilePatientSummary;
