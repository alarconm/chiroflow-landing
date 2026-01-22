'use client';

/**
 * Epic 12: AI Communication Agent - Feedback Analytics
 *
 * Displays sentiment analysis and feedback insights.
 */

import React, { useState } from 'react';
import { format, subDays } from 'date-fns';
import {
  SmilePlus,
  Frown,
  Meh,
  TrendingUp,
  TrendingDown,
  MessageCircle,
  AlertCircle,
  CheckCircle,
  Flag,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import type { FeedbackSentiment } from '@prisma/client';

interface FeedbackAnalyticsProps {
  className?: string;
}

export function FeedbackAnalytics({ className }: FeedbackAnalyticsProps) {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [followUpNotes, setFollowUpNotes] = useState('');

  const utils = trpc.useUtils();

  // Calculate date range
  const getDateRange = () => {
    const endDate = new Date();
    let startDate: Date;
    switch (dateRange) {
      case '7d':
        startDate = subDays(endDate, 7);
        break;
      case '30d':
        startDate = subDays(endDate, 30);
        break;
      case '90d':
        startDate = subDays(endDate, 90);
        break;
      default:
        startDate = subDays(endDate, 30);
    }
    return { startDate, endDate };
  };

  const { startDate, endDate } = getDateRange();

  // Fetch feedback summary
  const { data: summary, isLoading: summaryLoading } = trpc.aiCommunication.getFeedbackSummary.useQuery({
    startDate,
    endDate,
  });

  // Fetch sentiment trends
  const { data: trends, isLoading: trendsLoading } = trpc.aiCommunication.getSentimentTrends.useQuery({
    startDate,
    endDate,
    groupBy: dateRange === '7d' ? 'day' : dateRange === '30d' ? 'week' : 'month',
  });

  // Fetch feedback requiring follow-up
  const { data: pendingFollowUp, isLoading: followUpLoading } =
    trpc.aiCommunication.getFeedbackRequiringFollowUp.useQuery({ limit: 10 });

  // Mark follow-up complete mutation
  const markFollowUp = trpc.aiCommunication.markFeedbackFollowedUp.useMutation({
    onSuccess: () => {
      toast.success('Follow-up marked as complete');
      setSelectedFeedbackId(null);
      setFollowUpNotes('');
      utils.aiCommunication.getFeedbackRequiringFollowUp.invalidate();
      utils.aiCommunication.getFeedbackSummary.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const getSentimentIcon = (sentiment: FeedbackSentiment) => {
    switch (sentiment) {
      case 'POSITIVE':
        return <SmilePlus className="h-4 w-4 text-green-500" />;
      case 'NEUTRAL':
        return <Meh className="h-4 w-4 text-yellow-500" />;
      case 'NEGATIVE':
        return <Frown className="h-4 w-4 text-red-500" />;
    }
  };

  const getSentimentBadge = (sentiment: FeedbackSentiment) => {
    const variants: Record<FeedbackSentiment, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      POSITIVE: { variant: 'default', label: 'Positive' },
      NEUTRAL: { variant: 'secondary', label: 'Neutral' },
      NEGATIVE: { variant: 'destructive', label: 'Negative' },
    };
    const config = variants[sentiment];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Calculate sentiment trend direction
  const getTrendDirection = () => {
    if (!trends || trends.length < 2) return null;
    const recent = trends[trends.length - 1];
    const previous = trends[trends.length - 2];
    const diff = recent.averageScore - previous.averageScore;
    if (diff > 0.1) return 'up';
    if (diff < -0.1) return 'down';
    return 'stable';
  };

  const trendDirection = getTrendDirection();

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6" />
            Feedback Analytics
          </h2>
          <p className="text-muted-foreground">
            Patient sentiment analysis and feedback insights
          </p>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as '7d' | '30d' | '90d')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total feedback */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Feedback</span>
              </div>
              <p className="text-3xl font-bold mt-2">{summary.totalFeedback}</p>
              {trendDirection && (
                <div className="flex items-center gap-1 mt-1 text-sm">
                  {trendDirection === 'up' ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : trendDirection === 'down' ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  ) : (
                    <Meh className="h-4 w-4 text-yellow-500" />
                  )}
                  <span className="text-muted-foreground">
                    {trendDirection === 'up' ? 'Improving' : trendDirection === 'down' ? 'Declining' : 'Stable'}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Average sentiment */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                {summary.averageSentiment >= 0.3 ? (
                  <SmilePlus className="h-4 w-4 text-green-500" />
                ) : summary.averageSentiment <= -0.3 ? (
                  <Frown className="h-4 w-4 text-red-500" />
                ) : (
                  <Meh className="h-4 w-4 text-yellow-500" />
                )}
                <span className="text-sm text-muted-foreground">Avg Sentiment</span>
              </div>
              <p className="text-3xl font-bold mt-2">
                {summary.averageSentiment.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Range: -1 (negative) to 1 (positive)
              </p>
            </CardContent>
          </Card>

          {/* Sentiment breakdown */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-muted-foreground">Sentiment Breakdown</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <SmilePlus className="h-4 w-4 text-green-500" />
                  <Progress
                    value={(summary.sentimentBreakdown.positive / summary.totalFeedback) * 100}
                    className="h-2 flex-1"
                  />
                  <span className="text-sm w-8">{summary.sentimentBreakdown.positive}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Meh className="h-4 w-4 text-yellow-500" />
                  <Progress
                    value={(summary.sentimentBreakdown.neutral / summary.totalFeedback) * 100}
                    className="h-2 flex-1"
                  />
                  <span className="text-sm w-8">{summary.sentimentBreakdown.neutral}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Frown className="h-4 w-4 text-red-500" />
                  <Progress
                    value={(summary.sentimentBreakdown.negative / summary.totalFeedback) * 100}
                    className="h-2 flex-1"
                  />
                  <span className="text-sm w-8">{summary.sentimentBreakdown.negative}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Requires follow-up */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-muted-foreground">Needs Follow-up</span>
              </div>
              <p className="text-3xl font-bold mt-2">{summary.requiresFollowUp}</p>
              {summary.requiresFollowUp > 0 && (
                <p className="text-xs text-orange-600 mt-1">
                  Action required
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Top topics */}
      {summary?.topTopics && summary.topTopics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Topics</CardTitle>
            <CardDescription>Most frequently mentioned topics in feedback</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {summary.topTopics.map((topic, index) => (
                <Badge key={index} variant="outline" className="text-sm">
                  {topic.topic.replace('_', ' ')} ({topic.count})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent negative feedback */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Frown className="h-5 w-5 text-red-500" />
              Recent Negative Feedback
            </CardTitle>
            <CardDescription>
              Feedback requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : !summary?.recentNegative?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <SmilePlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No negative feedback to show</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-4">
                  {summary.recentNegative.map((feedback) => (
                    <div key={feedback.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{feedback.patientName}</span>
                            {getSentimentBadge(feedback.sentiment)}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {feedback.content}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <span>{format(new Date(feedback.createdAt), 'MMM d, yyyy')}</span>
                            <span>-</span>
                            <span className="capitalize">{feedback.source}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Pending follow-ups */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Flag className="h-5 w-5 text-orange-500" />
              Pending Follow-ups
            </CardTitle>
            <CardDescription>
              Feedback that needs your attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            {followUpLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : !pendingFollowUp?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                <p>All caught up!</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-4">
                  {pendingFollowUp.map((feedback) => (
                    <div key={feedback.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getSentimentIcon(feedback.sentiment)}
                            <span className="font-medium">{feedback.patientName}</span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {feedback.content}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <span>{format(new Date(feedback.createdAt), 'MMM d, yyyy')}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedFeedbackId(feedback.id)}
                        >
                          Complete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Follow-up dialog */}
      <Dialog
        open={!!selectedFeedbackId}
        onOpenChange={() => setSelectedFeedbackId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Follow-up</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Add notes about how this was resolved..."
              value={followUpNotes}
              onChange={(e) => setFollowUpNotes(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedFeedbackId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedFeedbackId) {
                  markFollowUp.mutate({
                    feedbackId: selectedFeedbackId,
                    notes: followUpNotes || undefined,
                  });
                }
              }}
              disabled={markFollowUp.isPending}
            >
              {markFollowUp.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Mark Complete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FeedbackAnalytics;
