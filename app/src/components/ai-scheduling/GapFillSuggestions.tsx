'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import {
  Clock,
  User,
  Calendar,
  Phone,
  ArrowRight,
  CheckCircle,
  ListFilter,
  Inbox,
  RefreshCw,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface GapFillSuggestionsProps {
  providerId?: string;
  startDate?: Date;
  endDate?: Date;
}

const suggestionTypeLabels: Record<string, { label: string; color: string }> = {
  WAITLIST: { label: 'Waitlist', color: 'bg-blue-100 text-[#053e67]' },
  RECALL: { label: 'Recall', color: 'bg-purple-100 text-purple-700' },
  RESCHEDULE: { label: 'Reschedule', color: 'bg-orange-100 text-orange-700' },
};

export function GapFillSuggestions({
  providerId,
  startDate,
  endDate,
}: GapFillSuggestionsProps) {
  const [minPriority, setMinPriority] = useState<number>(5);

  const { data, isLoading, refetch } = trpc.aiScheduling.getOpenGaps.useQuery({
    providerId,
    dateRange: startDate && endDate ? { start: startDate, end: endDate } : undefined,
    minPriority,
  });

  const markFilledMutation = trpc.aiScheduling.markGapFilled.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-purple-500" />
            Schedule Gaps
          </CardTitle>
          <CardDescription>Loading gaps...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 border rounded-lg space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const gaps = data || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-500" />
              Schedule Gaps
            </CardTitle>
            <CardDescription>
              {gaps.length} gap{gaps.length !== 1 ? 's' : ''} with fill suggestions
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={minPriority.toString()}
              onValueChange={(v) => setMinPriority(parseInt(v))}
            >
              <SelectTrigger className="w-36">
                <ListFilter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">All Priorities</SelectItem>
                <SelectItem value="5">Medium+</SelectItem>
                <SelectItem value="7">High+</SelectItem>
                <SelectItem value="9">Urgent Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {gaps.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No schedule gaps found for the selected criteria.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {gaps.map((gap) => (
              <div key={gap.id} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 p-4 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{gap.providerName}</span>
                      </div>
                      <span className="text-muted-foreground">|</span>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {format(new Date(gap.startTime), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <span className="text-muted-foreground">|</span>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {format(new Date(gap.startTime), 'h:mm a')} -{' '}
                          {format(new Date(gap.endTime), 'h:mm a')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-0">
                        {gap.durationMinutes} min
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`border-0 ${
                          gap.fillPriority >= 8
                            ? 'bg-red-100 text-red-700'
                            : gap.fillPriority >= 6
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        Priority {gap.fillPriority}
                      </Badge>
                      <Badge variant="outline" className="border-0 bg-gray-100">
                        {gap.gapType.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  {gap.suggestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No fill suggestions available for this gap.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-muted-foreground">
                        Suggested patients to fill this gap:
                      </p>
                      {gap.suggestions.map((suggestion, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center border">
                              <User className="h-5 w-5 text-gray-400" />
                            </div>
                            <div>
                              <p className="font-medium">{suggestion.patientName}</p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>{suggestion.appointmentTypeName}</span>
                                <span className="text-muted-foreground">-</span>
                                <span>{suggestion.reason}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className={`border-0 ${suggestionTypeLabels[suggestion.suggestionType]?.color || ''}`}
                            >
                              {suggestionTypeLabels[suggestion.suggestionType]?.label || suggestion.suggestionType}
                            </Badge>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-0">
                              {Math.round(suggestion.matchScore * 100)}% match
                            </Badge>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Phone className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Contact patient</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  >
                                    <Calendar className="h-4 w-4 mr-1" />
                                    Book
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Schedule this patient</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
