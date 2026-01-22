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
  Loader2,
  RefreshCw,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
  MessageSquare,
  Gavel,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { DenialStatus } from '@prisma/client';

// Type for denials with included relations
type DenialWithRelations = {
  id: string;
  createdAt: Date;
  status: DenialStatus;
  denialCode: string | null;
  denialReason: string | null;
  billedAmount: unknown;
  deniedAmount: unknown;
  category: string | null;
  denialCategory?: string | null;
  appealDeadline: Date | null;
  patient?: {
    firstName?: string;
    lastName?: string;
  };
  claim?: {
    claimNumber?: string;
  };
  notes?: {
    id: string;
    note: string;
    noteType: string;
    createdAt: Date;
  }[];
  [key: string]: unknown;
};

export function DenialManager() {
  const [statusFilter, setStatusFilter] = useState<DenialStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selectedDenial, setSelectedDenial] = useState<string | null>(null);
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const limit = 20;

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.clearinghouse.listDenials.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit,
  });

  const { data: denialDetailRaw } = trpc.clearinghouse.getDenial.useQuery(
    { id: selectedDenial! },
    { enabled: !!selectedDenial }
  );

  // Cast to include relations
  const denialDetail = denialDetailRaw as unknown as DenialWithRelations | undefined;

  const { data: stats } = trpc.clearinghouse.getDenialStats.useQuery();

  const updateMutation = trpc.clearinghouse.updateDenial.useMutation({
    onSuccess: () => {
      utils.clearinghouse.listDenials.invalidate();
      utils.clearinghouse.getDenial.invalidate();
      utils.clearinghouse.getDenialStats.invalidate();
    },
  });

  const addNoteMutation = trpc.clearinghouse.addDenialNote.useMutation({
    onSuccess: () => {
      utils.clearinghouse.getDenial.invalidate();
      setIsAddNoteOpen(false);
      setNoteText('');
    },
  });

  const getStatusIcon = (status: DenialStatus) => {
    switch (status) {
      case 'NEW':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'UNDER_REVIEW':
        return <Eye className="h-4 w-4 text-blue-500" />;
      case 'APPEALED':
        return <Gavel className="h-4 w-4 text-purple-500" />;
      case 'RESOLVED':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'WRITTEN_OFF':
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: DenialStatus) => {
    switch (status) {
      case 'NEW':
        return <Badge className="bg-orange-500">New</Badge>;
      case 'UNDER_REVIEW':
        return <Badge className="bg-blue-500">In Review</Badge>;
      case 'APPEALED':
        return <Badge className="bg-purple-500">Appealed</Badge>;
      case 'RESOLVED':
        return <Badge className="bg-green-500">Resolved</Badge>;
      case 'WRITTEN_OFF':
        return <Badge variant="secondary">Written Off</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount));
  };

  const handleStatusChange = (denialId: string, newStatus: DenialStatus) => {
    updateMutation.mutate({ id: denialId, status: newStatus });
  };

  const handleAddNote = () => {
    if (!selectedDenial || !noteText.trim()) return;
    addNoteMutation.mutate({
      denialId: selectedDenial,
      note: noteText,
    });
  };

  return (
    <>
      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Denials</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          {stats.byStatus.slice(0, 3).map((s) => (
            <Card key={s.status}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{s.status}</p>
                    <p className="text-2xl font-bold">{s.count}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(s.totalDenied)}
                    </p>
                  </div>
                  {getStatusIcon(s.status as DenialStatus)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Denial Management
              </CardTitle>
              <CardDescription>
                Track and manage claim denials and appeals
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as DenialStatus | 'all');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="UNDER_REVIEW">In Review</SelectItem>
                  <SelectItem value="APPEALED">Appealed</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="WRITTEN_OFF">Written Off</SelectItem>
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
          ) : data?.denials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-medium">No Denials Found</h3>
              <p className="text-sm text-muted-foreground max-w-md mt-2">
                {statusFilter === 'all'
                  ? 'Great news! No claim denials have been recorded.'
                  : `No denials with status "${statusFilter}" found.`}
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
                    <TableHead>Denial Code</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Appeal Deadline</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.denials.map((rawDenial) => {
                    const denial = rawDenial as unknown as DenialWithRelations;
                    return (
                    <TableRow key={denial.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(denial.status)}
                          {getStatusBadge(denial.status)}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {denial.claim?.claimNumber || '-'}
                      </TableCell>
                      <TableCell>
                        {denial.patient
                          ? `${denial.patient.firstName} ${denial.patient.lastName}`
                          : '-'}
                      </TableCell>
                      <TableCell className="font-mono">{denial.denialCode || '-'}</TableCell>
                      <TableCell>{denial.category || '-'}</TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {formatCurrency(Number(denial.deniedAmount))}
                      </TableCell>
                      <TableCell>
                        {denial.appealDeadline ? (
                          <span
                            className={
                              new Date(denial.appealDeadline) < new Date()
                                ? 'text-red-600'
                                : ''
                            }
                          >
                            {format(new Date(denial.appealDeadline), 'MM/dd/yyyy')}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedDenial(denial.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );})}
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

      {/* Denial Detail Dialog */}
      <Dialog open={!!selectedDenial} onOpenChange={() => setSelectedDenial(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Denial Detail
              {denialDetail && getStatusBadge(denialDetail.status)}
            </DialogTitle>
            <DialogDescription>
              Claim #{denialDetail?.claim?.claimNumber} - {denialDetail?.denialCode}
            </DialogDescription>
          </DialogHeader>

          {denialDetail && (
            <div className="space-y-6">
              {/* Denial Info */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Denial Reason</Label>
                  <p className="font-medium">{denialDetail.denialReason}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Category</Label>
                  <p className="font-medium">{denialDetail.denialCategory || denialDetail.category || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Denied Amount</Label>
                  <p className="font-medium text-red-600">
                    {formatCurrency(Number(denialDetail.deniedAmount))}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Billed Amount</Label>
                  <p className="font-medium">
                    {formatCurrency(Number(denialDetail.billedAmount))}
                  </p>
                </div>
                {denialDetail.appealDeadline && (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Appeal Deadline</Label>
                    <p
                      className={`font-medium ${
                        new Date(denialDetail.appealDeadline) < new Date()
                          ? 'text-red-600'
                          : ''
                      }`}
                    >
                      {format(new Date(denialDetail.appealDeadline), 'MM/dd/yyyy')}
                    </p>
                  </div>
                )}
              </div>

              {/* Status Actions */}
              <div>
                <Label className="text-muted-foreground">Update Status</Label>
                <div className="flex gap-2 mt-2">
                  {denialDetail.status === 'NEW' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange(denialDetail.id, DenialStatus.UNDER_REVIEW)}
                    >
                      Mark In Review
                    </Button>
                  )}
                  {(denialDetail.status === 'NEW' || denialDetail.status === 'UNDER_REVIEW') && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(denialDetail.id, DenialStatus.APPEALED)}
                      >
                        <Gavel className="h-4 w-4 mr-2" />
                        Mark as Appealed
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleStatusChange(denialDetail.id, DenialStatus.WRITTEN_OFF)
                        }
                      >
                        Write Off
                      </Button>
                    </>
                  )}
                  {denialDetail.status === 'APPEALED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange(denialDetail.id, DenialStatus.RESOLVED)}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Mark as Resolved
                    </Button>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-muted-foreground">Notes</Label>
                  <Button variant="outline" size="sm" onClick={() => setIsAddNoteOpen(true)}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Add Note
                  </Button>
                </div>
                {denialDetail.notes && denialDetail.notes.length > 0 ? (
                  <div className="space-y-2">
                    {denialDetail.notes.map((note) => (
                      <div key={note.id} className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">{note.note}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(note.createdAt), 'MM/dd/yyyy HH:mm')} -{' '}
                          {note.noteType}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={isAddNoteOpen} onOpenChange={setIsAddNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>Add a note to this denial for tracking purposes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Enter your note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddNoteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNote} disabled={!noteText.trim() || addNoteMutation.isPending}>
              {addNoteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
