'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { DateRange } from 'react-day-picker';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Search, FileText, Send, Eye, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClaimStatus } from '@prisma/client';

interface ClaimsListProps {
  dateRange: DateRange | undefined;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  READY: 'bg-blue-100 text-blue-800',
  SUBMITTED: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  DENIED: 'bg-red-100 text-red-800',
  PAID: 'bg-green-100 text-green-800',
  PARTIAL: 'bg-orange-100 text-orange-800',
  APPEALED: 'bg-purple-100 text-purple-800',
  VOID: 'bg-gray-100 text-gray-500',
};

type ClaimItem = {
  id: string;
  claimNumber: string;
  status: string;
  totalCharges: number | string;
  totalPaid: number | string;
  createdAt: Date;
  patient: {
    demographics: {
      firstName: string;
      lastName: string;
    } | null;
  };
  payer: {
    name: string;
  } | null;
};

export function ClaimsList({ dateRange }: ClaimsListProps) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading } = trpc.claim.list.useQuery({
    startDate: dateRange?.from || new Date(),
    endDate: dateRange?.to || new Date(),
    status: status !== 'all' ? (status as ClaimStatus) : undefined,
    page,
    limit: 10,
  });

  const utils = trpc.useUtils();
  const submitClaim = trpc.claim.submit.useMutation({
    onSuccess: () => {
      utils.claim.list.invalidate();
    },
  });

  const claims = (data?.claims || []) as unknown as ClaimItem[];
  const pagination = data?.pagination;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Claims</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
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
          <CardTitle>Claims</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search claims..."
                className="pl-8 w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="READY">Ready</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="DENIED">Denied</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Claim #</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Charges</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No claims found for the selected period
                </TableCell>
              </TableRow>
            ) : (
              claims.map((claim) => {
                const patientName = claim.patient.demographics
                  ? `${claim.patient.demographics.lastName}, ${claim.patient.demographics.firstName}`
                  : 'Patient';
                const payerName = claim.payer?.name || 'N/A';
                const charges = Number(claim.totalCharges);
                const paid = Number(claim.totalPaid);
                const balance = charges - paid;

                return (
                  <TableRow key={claim.id}>
                    <TableCell className="font-medium">{claim.claimNumber}</TableCell>
                    <TableCell>{patientName}</TableCell>
                    <TableCell>{format(new Date(claim.createdAt), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{payerName}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[claim.status] || 'bg-gray-100'}>
                        {claim.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      ${charges.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${paid.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${balance.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <FileText className="mr-2 h-4 w-4" />
                            Generate CMS-1500
                          </DropdownMenuItem>
                          {claim.status === 'READY' && (
                            <DropdownMenuItem
                              onClick={() => submitClaim.mutate({ id: claim.id })}
                              disabled={submitClaim.isPending}
                            >
                              <Send className="mr-2 h-4 w-4" />
                              Submit Claim
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, pagination.total)} of{' '}
              {pagination.total} claims
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
