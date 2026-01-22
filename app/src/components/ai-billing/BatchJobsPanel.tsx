'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock,
  PlayCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus,
  Loader2,
  StopCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type JobType =
  | 'CLAIM_SCRUB'
  | 'DENIAL_PREDICTION'
  | 'APPEAL_GENERATION'
  | 'PAYMENT_MATCHING'
  | 'UNDERPAYMENT_SCAN'
  | 'STATUS_CHECK';

// Type for job from router query
interface JobFromRouter {
  id: string;
  jobType: string;
  status: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  scheduledFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

interface BatchJob {
  id: string;
  jobType: JobType;
  status: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  scheduledFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

const JOB_TYPE_LABELS: Record<JobType, string> = {
  CLAIM_SCRUB: 'Claim Scrubbing',
  DENIAL_PREDICTION: 'Denial Prediction',
  APPEAL_GENERATION: 'Appeal Generation',
  PAYMENT_MATCHING: 'Payment Matching',
  UNDERPAYMENT_SCAN: 'Underpayment Scan',
  STATUS_CHECK: 'Status Check',
};

const JOB_TYPE_DESCRIPTIONS: Record<JobType, string> = {
  CLAIM_SCRUB: 'Validate all pending claims',
  DENIAL_PREDICTION: 'Predict denial risk for claims',
  APPEAL_GENERATION: 'Generate appeals for denials',
  PAYMENT_MATCHING: 'Match ERA payments to charges',
  UNDERPAYMENT_SCAN: 'Scan for underpaid claims',
  STATUS_CHECK: 'Check claim status overnight',
};

export function BatchJobsPanel() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedJobType, setSelectedJobType] = useState<JobType | ''>('');

  const { data: jobs, isLoading, refetch } = trpc.aiBilling.getBatchJobs.useQuery({
    limit: 10,
  });

  const createJobMutation = trpc.aiBilling.createBatchJob.useMutation({
    onSuccess: () => {
      refetch();
      setIsDialogOpen(false);
      setSelectedJobType('');
    },
  });

  const cancelJobMutation = trpc.aiBilling.cancelBatchJob.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleCreateJob = async () => {
    if (!selectedJobType) return;
    await createJobMutation.mutateAsync({
      jobType: selectedJobType,
    });
  };

  const handleCancelJob = async (jobId: string) => {
    await cancelJobMutation.mutateAsync({ jobId });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'RUNNING':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'CANCELLED':
        return <StopCircle className="h-4 w-4 text-gray-500" />;
      case 'QUEUED':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'RUNNING':
        return <Badge className="bg-blue-500">Running</Badge>;
      case 'FAILED':
        return <Badge variant="destructive">Failed</Badge>;
      case 'CANCELLED':
        return <Badge variant="secondary">Cancelled</Badge>;
      case 'QUEUED':
        return <Badge className="bg-yellow-500 text-white">Queued</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Batch Jobs
            </CardTitle>
            <CardDescription>
              Schedule and monitor AI billing operations
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Job
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Batch Job</DialogTitle>
                <DialogDescription>
                  Schedule an AI billing operation to run
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Job Type</label>
                  <Select value={selectedJobType} onValueChange={(v) => setSelectedJobType(v as JobType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select job type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex flex-col">
                            <span>{label}</span>
                            <span className="text-xs text-muted-foreground">
                              {JOB_TYPE_DESCRIPTIONS[value as JobType]}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateJob}
                    disabled={!selectedJobType || createJobMutation.isPending}
                  >
                    {createJobMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4 mr-1" />
                        Start Job
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {jobs && jobs.length > 0 ? (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {(jobs as JobFromRouter[]).map((job) => {
                const progress = job.totalItems > 0
                  ? Math.round((job.processedItems / job.totalItems) * 100)
                  : 0;

                return (
                  <div
                    key={job.id}
                    className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(job.status)}
                        <span className="font-medium text-sm">
                          {JOB_TYPE_LABELS[job.jobType as JobType] || job.jobType}
                        </span>
                        {getStatusBadge(job.status)}
                      </div>
                      {(job.status === 'QUEUED' || job.status === 'RUNNING') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelJob(job.id)}
                          disabled={cancelJobMutation.isPending}
                        >
                          <StopCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Progress */}
                    {job.status === 'RUNNING' && job.totalItems > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>{job.processedItems} / {job.totalItems}</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-1" />
                      </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Created: {formatDate(job.createdAt)}</span>
                      {job.status === 'COMPLETED' && (
                        <>
                          <span className="text-green-600">{job.successCount} success</span>
                          {job.failureCount > 0 && (
                            <span className="text-red-600">{job.failureCount} failed</span>
                          )}
                        </>
                      )}
                      {job.status === 'FAILED' && job.errorMessage && (
                        <span className="text-red-600 truncate max-w-[200px]">
                          {job.errorMessage}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No batch jobs yet</p>
            <p className="text-xs">Create a job to run AI operations</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
