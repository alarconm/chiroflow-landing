'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import {
  CalendarPlus,
  DollarSign,
  Check,
  X,
  RefreshCw,
  Calendar,
  User,
  TrendingUp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface OverbookingRecommendationsProps {
  providerId?: string;
}

export function OverbookingRecommendations({ providerId }: OverbookingRecommendationsProps) {
  const [selectedRec, setSelectedRec] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);

  const { data, isLoading, refetch } = trpc.aiScheduling.getPendingOverbookingRecommendations.useQuery(
    providerId ? { providerId } : undefined
  );

  const applyDecisionMutation = trpc.aiScheduling.applyOverbookingDecision.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedRec(null);
      setDeclineReason('');
      setShowDeclineDialog(false);
    },
  });

  const handleAccept = (recommendationId: string) => {
    applyDecisionMutation.mutate({
      recommendationId,
      accepted: true,
    });
  };

  const handleDeclineClick = (recommendationId: string) => {
    setSelectedRec(recommendationId);
    setShowDeclineDialog(true);
  };

  const handleDeclineConfirm = () => {
    if (selectedRec) {
      applyDecisionMutation.mutate({
        recommendationId: selectedRec,
        accepted: false,
        declineReason: declineReason || undefined,
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-blue-500" />
            Overbooking Recommendations
          </CardTitle>
          <CardDescription>Loading recommendations...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 border rounded-lg space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const recommendations = data || [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarPlus className="h-5 w-5 text-blue-500" />
                Overbooking Recommendations
              </CardTitle>
              <CardDescription>
                {recommendations.length} strategic overbooking opportunit{recommendations.length !== 1 ? 'ies' : 'y'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {recommendations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarPlus className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No overbooking recommendations at this time.</p>
              <p className="text-sm">Recommendations appear when no-show probability is high enough.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{rec.providerName}</span>
                        <span className="text-muted-foreground">-</span>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(rec.suggestedDate), 'MMM d, yyyy')} at {rec.suggestedTime}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{rec.reason}</p>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className="bg-blue-50 text-[#053e67] border-0">
                          {Math.round(rec.riskAssessment * 100)}% no-show probability
                        </Badge>
                        {rec.expectedValue && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-0">
                                  <DollarSign className="h-3 w-3 mr-1" />
                                  ${rec.expectedValue} expected value
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Potential revenue if overbooking fills a no-show slot</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => handleAccept(rec.id)}
                              disabled={applyDecisionMutation.isPending}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Accept
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Approve this overbooking</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeclineClick(rec.id)}
                              disabled={applyDecisionMutation.isPending}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Decline
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Decline this recommendation</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Recommendation</DialogTitle>
            <DialogDescription>
              Optionally provide a reason for declining this overbooking recommendation.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="decline-reason">Reason (optional)</Label>
            <Textarea
              id="decline-reason"
              placeholder="e.g., Provider prefers not to overbook on this day"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeclineDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeclineConfirm}
              disabled={applyDecisionMutation.isPending}
            >
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
