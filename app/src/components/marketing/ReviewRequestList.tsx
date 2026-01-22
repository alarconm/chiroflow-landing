'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/trpc/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Star,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';

type ReviewRequestStatus = 'PENDING' | 'SENT' | 'FAILED' | 'DECLINED' | 'CLICKED' | 'REVIEWED';

const statusConfig: Record<ReviewRequestStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3.5 w-3.5" /> },
  SENT: { label: 'Sent', color: 'bg-blue-100 text-blue-800', icon: <Send className="h-3.5 w-3.5" /> },
  FAILED: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-3.5 w-3.5" /> },
  DECLINED: { label: 'Declined', color: 'bg-gray-100 text-gray-800', icon: <XCircle className="h-3.5 w-3.5" /> },
  CLICKED: { label: 'Clicked', color: 'bg-purple-100 text-purple-800', icon: <Star className="h-3.5 w-3.5" /> },
  REVIEWED: { label: 'Reviewed', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3.5 w-3.5" /> },
};

export function ReviewRequestList() {
  const [statusFilter, setStatusFilter] = useState<ReviewRequestStatus | 'ALL'>('ALL');

  const { data: requests, isLoading, refetch } = trpc.marketing.listReviewRequests.useQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    limit: 50,
  });

  // Note: sendReviewReminder mutation not yet implemented in router
  const sendReminder = {
    mutate: (_data: { requestId: string }) => {
      toast.info('Review reminder functionality will be available in a future update');
    },
    isPending: false,
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Requests</CardTitle>
          <CardDescription>Manage patient review solicitations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
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
              <Star className="h-5 w-5" />
              Review Requests
            </CardTitle>
            <CardDescription>
              Track and manage patient review solicitations
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Status filters */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            size="sm"
            variant={statusFilter === 'ALL' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('ALL')}
          >
            All
          </Button>
          {(Object.keys(statusConfig) as ReviewRequestStatus[]).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={statusFilter === status ? 'default' : 'outline'}
              onClick={() => setStatusFilter(status)}
            >
              {statusConfig[status].label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {!requests?.requests || requests.requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Star className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No review requests</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Review requests will appear here when created
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.requests.map((request) => {
                const status = statusConfig[request.status as ReviewRequestStatus] || statusConfig.PENDING;
                return (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {request.patient?.demographics?.firstName} {request.patient?.demographics?.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground">Patient ID: {request.patient?.mrn}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{request.platform || 'Google'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={status.color}>
                        <span className="flex items-center gap-1">
                          {status.icon}
                          {status.label}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {request.sentAt ? new Date(request.sentAt).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>
                      {request.rating ? (
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span>{request.rating}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {(request.status === 'SENT' || request.status === 'CLICKED') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => sendReminder.mutate({ requestId: request.id })}
                          disabled={sendReminder.isPending}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
