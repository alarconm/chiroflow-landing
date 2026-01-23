'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/trpc/client';
import {
  Calendar,
  AlertTriangle,
  Phone,
  Mail,
  MessageSquare,
  Clock,
  User,
  ChevronRight,
} from 'lucide-react';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import Link from 'next/link';

const riskColors: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
  minimal: 'bg-green-500 text-white',
};

const riskLabels: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  minimal: 'Minimal',
};

export function NoShowRiskCalendar() {
  const [minRiskLevel, setMinRiskLevel] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { data: noShowSummary, isLoading: summaryLoading } = trpc.aiPredict.getNoShowSummary.useQuery(
    { forecastDays: 14 },
    { refetchOnWindowFocus: false }
  );

  const { data: atRiskAppointments, isLoading: appointmentsLoading } = trpc.aiPredict.getAtRiskAppointments.useQuery(
    {
      startDate: selectedDate || new Date(),
      endDate: selectedDate ? addDays(selectedDate, 1) : addDays(new Date(), 14),
      minRiskLevel,
      limit: 50,
    },
    { refetchOnWindowFocus: false }
  );

  const { data: overbookingSuggestions, isLoading: overbookingLoading } = trpc.aiPredict.getOverbookingSuggestions.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: confirmationStrategies, isLoading: strategiesLoading } = trpc.aiPredict.getConfirmationStrategies.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // Generate calendar days
  const calendarDays = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(new Date()), i));

  // Get risk data for each day from overbooking suggestions
  const getDayRisk = (date: Date) => {
    if (!overbookingSuggestions?.dailyRecommendations) return null;
    return overbookingSuggestions.dailyRecommendations.find(
      (d) => isSameDay(new Date(d.date), date)
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">
                {noShowSummary?.totalAppointments ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">Upcoming Appointments</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-500">
                {noShowSummary?.atRiskAppointments ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">At-Risk Appointments</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">
                {noShowSummary?.aggregateStats?.expectedNoShows?.toFixed(1) ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">Expected No-Shows</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-[#053e67]">
                {noShowSummary?.aggregateStats?.averageNoShowRisk?.toFixed(1) ?? 0}%
              </div>
              <div className="text-sm text-muted-foreground">Avg No-Show Risk</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar View */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                No-Show Risk Calendar
              </CardTitle>
              <CardDescription>
                Click on a day to view at-risk appointments
              </CardDescription>
            </div>
            <Select
              value={minRiskLevel}
              onValueChange={(v) => setMinRiskLevel(v as typeof minRiskLevel)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical Only</SelectItem>
                <SelectItem value="high">High and Above</SelectItem>
                <SelectItem value="medium">Medium and Above</SelectItem>
                <SelectItem value="low">All Risks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((date, i) => {
              const dayRisk = getDayRisk(date);
              const isSelected = selectedDate && isSameDay(date, selectedDate);
              const isToday = isSameDay(date, new Date());

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(isSelected ? null : date)}
                  className={`
                    p-2 rounded-lg border text-center transition-colors
                    ${isSelected ? 'ring-2 ring-[#053e67] bg-[#053e67]/5' : ''}
                    ${isToday ? 'border-[#053e67]' : 'border-transparent'}
                    hover:bg-muted/50
                  `}
                >
                  <div className="text-sm font-medium">{format(date, 'd')}</div>
                  <div className="text-xs text-muted-foreground">{format(date, 'EEE')}</div>
                  {dayRisk && (
                    <div className="mt-1">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          dayRisk.riskLevel === 'high'
                            ? 'text-red-600 border-red-300'
                            : dayRisk.riskLevel === 'moderate'
                            ? 'text-orange-600 border-orange-300'
                            : 'text-green-600 border-green-300'
                        }`}
                      >
                        {dayRisk.appointmentCount} appts
                      </Badge>
                      {dayRisk.expectedNoShows >= 1 && (
                        <div className="text-xs text-red-600 mt-1">
                          ~{dayRisk.expectedNoShows.toFixed(1)} no-shows
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-red-500" />
              <span>High Risk</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-orange-500" />
              <span>Medium Risk</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>Low Risk</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* At-Risk Appointments List */}
      {atRiskAppointments?.appointments && atRiskAppointments.appointments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              At-Risk Appointments
              {selectedDate && (
                <Badge variant="outline" className="ml-2">
                  {format(selectedDate, 'MMM d, yyyy')}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {atRiskAppointments.total} appointments identified as at-risk for no-show
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {atRiskAppointments.appointments.map((apt) => (
                <div
                  key={apt.appointmentId}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/patients/${apt.patientId}`}
                          className="font-medium hover:underline"
                        >
                          {apt.patientName}
                        </Link>
                        <Badge className={riskColors[apt.riskLevel]}>
                          {riskLabels[apt.riskLevel]} Risk
                        </Badge>
                      </div>

                      <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {format(new Date(apt.appointmentDetails.scheduledDateTime), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>
                            {format(new Date(apt.appointmentDetails.scheduledDateTime), 'h:mm a')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          <span>{apt.appointmentDetails.providerName}</span>
                        </div>
                      </div>

                      <div className="mt-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">No-Show Risk:</span>
                          <Progress value={apt.noShowProbability} className="w-32 h-2" />
                          <span className="font-medium">{apt.noShowProbability.toFixed(0)}%</span>
                        </div>
                      </div>

                      {/* Top risk factors */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {apt.topRiskFactors.slice(0, 3).map((factor, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {factor}
                          </Badge>
                        ))}
                      </div>

                      {/* Patient history */}
                      <div className="mt-3 text-xs text-muted-foreground">
                        History: {apt.patientHistory.noShowRate.toFixed(0)}% no-show rate (
                        {apt.patientHistory.noShowAppointments} of {apt.patientHistory.totalAppointments} appointments)
                      </div>

                      {/* Recommended intervention */}
                      {apt.interventions.length > 0 && (
                        <div className="mt-3 p-2 bg-muted rounded text-sm">
                          <strong>Recommended:</strong> {apt.interventions[0].description}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      <Button size="sm" variant="outline">
                        <Phone className="h-4 w-4 mr-1" />
                        Call
                      </Button>
                      <Button size="sm" variant="outline">
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Text
                      </Button>
                      <Button size="sm" variant="outline">
                        <Mail className="h-4 w-4 mr-1" />
                        Email
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overbooking Suggestions */}
      {overbookingSuggestions && overbookingSuggestions.summary.totalRecommendedOverbooking > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Overbooking Recommendations</CardTitle>
            <CardDescription>
              Suggested additional bookings based on expected no-shows
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {overbookingSuggestions.dailyRecommendations
                .filter((d) => d.recommendedOverbooking > 0)
                .slice(0, 6)
                .map((day, i) => (
                  <div key={i} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">
                        {format(new Date(day.date), 'EEE, MMM d')}
                      </span>
                      <Badge variant="outline">
                        +{day.recommendedOverbooking} slots
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <div>{day.appointmentCount} scheduled</div>
                      <div className="text-red-600">
                        ~{day.expectedNoShows.toFixed(1)} expected no-shows
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Strategy Summary */}
      {confirmationStrategies && (
        <Card>
          <CardHeader>
            <CardTitle>Confirmation Strategy Summary</CardTitle>
            <CardDescription>
              Breakdown of appointments by confirmation needs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-orange-500">
                  {confirmationStrategies.summary.needsPhoneCall}
                </div>
                <div className="text-sm text-muted-foreground">Need Phone Call</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-blue-500">
                  {confirmationStrategies.summary.needsMultiChannelReminders}
                </div>
                <div className="text-sm text-muted-foreground">Need Multi-Channel</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {confirmationStrategies.summary.needsConfirmation}
                </div>
                <div className="text-sm text-muted-foreground">Need Confirmation</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-red-500">
                  {confirmationStrategies.summary.needsEscalation}
                </div>
                <div className="text-sm text-muted-foreground">Need Escalation</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
