'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Send,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { SubmissionStatus } from '@prisma/client';

// Type for submissions with included relations
type SubmissionWithRelations = {
  id: string;
  createdAt: Date;
  status: SubmissionStatus;
  controlNumber: string | null;
  responseMessage: string | null;
  claim?: {
    claimNumber?: string;
    patient?: {
      firstName?: string;
      lastName?: string;
    };
    payer?: {
      name?: string;
    };
  };
  [key: string]: unknown;
};

export function ClaimSubmissionList() {
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, refetch } = trpc.clearinghouse.listSubmissions.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit,
  });

  const getStatusIcon = (status: SubmissionStatus) => {
    switch (status) {
      case 'ACCEPTED':
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'REJECTED':
      case 'ERROR':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'PENDING':
      case 'SUBMITTED':
      case 'PROCESSING':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: SubmissionStatus) => {
    switch (status) {
      case 'ACCEPTED':
        return <Badge className="bg-green-500">Accepted</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'REJECTED':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'ERROR':
        return <Badge variant="destructive">Error</Badge>;
      case 'PENDING':
        return <Badge variant="secondary">Pending</Badge>;
      case 'SUBMITTED':
        return <Badge className="bg-blue-500">Submitted</Badge>;
      case 'PROCESSING':
        return <Badge className="bg-blue-500">Processing</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Claim Submissions
            </CardTitle>
            <CardDescription>
              Track electronic claim submissions to clearinghouses
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as SubmissionStatus | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
                <SelectItem value="PROCESSING">Processing</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data?.submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Submissions Found</h3>
            <p className="text-sm text-muted-foreground max-w-md mt-2">
              {statusFilter === 'all'
                ? 'No claim submissions have been made yet. Submit claims to see them here.'
                : `No submissions with status "${statusFilter}" found.`}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Claim #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Control #</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.submissions?.map((rawSubmission) => {
                  // Cast to SubmissionWithRelations to access included relations
                  const submission = rawSubmission as unknown as SubmissionWithRelations;
                  return (
                    <TableRow key={submission.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(submission.status)}
                          {getStatusBadge(submission.status)}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {submission.claim?.claimNumber || '-'}
                      </TableCell>
                      <TableCell>
                        {submission.claim?.patient
                          ? `${submission.claim.patient.firstName || ''} ${submission.claim.patient.lastName || ''}`
                          : '-'}
                      </TableCell>
                      <TableCell>{submission.claim?.payer?.name || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {submission.controlNumber || '-'}
                      </TableCell>
                      <TableCell>
                        {format(new Date(submission.createdAt), 'MM/dd/yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {submission.responseMessage || '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {data?.pagination && data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {(page - 1) * limit + 1} to{' '}
                  {Math.min(page * limit, data.pagination.total)} of {data.pagination.total}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {page} of {data.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= data.pagination.totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
