'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { trpc } from '@/trpc/client';
import {
  FileText,
  Search,
  Filter,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';

type FilterStatus = 'PENDING' | 'COMPLETED' | 'DRAFT' | 'REJECTED' | 'EXPIRED' | 'ALL';

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-green-100 text-green-800',
  DRAFT: 'bg-gray-100 text-gray-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-orange-100 text-orange-800',
};

const statusIcons: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-3 w-3" />,
  COMPLETED: <CheckCircle className="h-3 w-3" />,
  DRAFT: <FileText className="h-3 w-3" />,
  REJECTED: <AlertCircle className="h-3 w-3" />,
  EXPIRED: <AlertCircle className="h-3 w-3" />,
};

export default function SubmissionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [templateFilter, setTemplateFilter] = useState<string>('ALL');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: templates } = trpc.formTemplate.list.useQuery({
    includeInactive: false,
  });

  const { data: submissionsData, isLoading } = trpc.formSubmission.list.useQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    templateId: templateFilter === 'ALL' ? undefined : templateFilter,
    limit: pageSize,
    offset: page * pageSize,
  });

  const filteredSubmissions = submissionsData?.submissions.filter((s) => {
    const patientName = `${s.patient?.firstName || ''} ${s.patient?.lastName || ''}`.toLowerCase();
    const templateName = s.template?.name.toLowerCase() || '';
    return (
      patientName.includes(searchQuery.toLowerCase()) ||
      templateName.includes(searchQuery.toLowerCase())
    );
  });

  const totalPages = Math.ceil((submissionsData?.total || 0) / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Form Submissions</h1>
          <p className="text-gray-500 mt-1">Review and process completed patient forms</p>
        </div>
        <Link href="/settings/forms">
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Manage Templates
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by patient name or form..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>

            {/* Template Filter */}
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="w-[200px]">
                <FileText className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by form" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Forms</SelectItem>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Submissions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Submissions
          </CardTitle>
          <CardDescription>
            {submissionsData?.total || 0} total submissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#053e67]/50" />
            </div>
          ) : filteredSubmissions && filteredSubmissions.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Form</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.map((submission) => (
                    <TableRow key={submission.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-[#053e67]/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-[#053e67]" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {submission.patient
                                ? `${submission.patient.firstName} ${submission.patient.lastName}`
                                : 'Anonymous'}
                            </p>
                            {submission.patient?.mrn && (
                              <p className="text-xs text-gray-500">MRN: {submission.patient.mrn}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{submission.template?.name}</p>
                          <p className="text-xs text-gray-500">v{submission.template?.version || 1}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[submission.status] || 'bg-gray-100'}>
                          <span className="flex items-center gap-1">
                            {statusIcons[submission.status]}
                            {submission.status}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{submission.source}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Calendar className="h-3 w-3" />
                          {submission.submittedAt
                            ? format(new Date(submission.submittedAt), 'MMM d, yyyy')
                            : format(new Date(submission.createdAt), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/settings/forms/submissions/${submission.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">
                    Page {page + 1} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No submissions found</h3>
              <p className="text-gray-500 mt-1">
                {searchQuery || statusFilter !== 'ALL' || templateFilter !== 'ALL'
                  ? 'Try adjusting your filters'
                  : 'Submissions will appear here when patients complete forms'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
