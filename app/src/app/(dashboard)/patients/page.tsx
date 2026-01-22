'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, differenceInYears } from 'date-fns';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Edit,
  Archive,
  ArrowUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PatientSearchCommand, usePatientSearchShortcut } from '@/components/patients';

type SortBy = 'name' | 'mrn' | 'dateOfBirth' | 'createdAt';
type SortOrder = 'asc' | 'desc';
type PatientStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'DECEASED';

const statusColors: Record<PatientStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-yellow-100 text-yellow-800',
  ARCHIVED: 'bg-stone-100 text-gray-800',
  DECEASED: 'bg-red-100 text-red-800',
};

export default function PatientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<PatientStatus | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  // Global search command with Cmd+K shortcut
  const { open: searchOpen, setOpen: setSearchOpen } = usePatientSearchShortcut();

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    // Simple debounce
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data, isLoading, refetch } = trpc.patient.list.useQuery({
    search: debouncedSearch || undefined,
    status: status !== 'ALL' ? status : undefined,
    sortBy,
    sortOrder,
    limit: pageSize,
    offset: page * pageSize,
  });

  const archiveMutation = trpc.patient.archive.useMutation({
    onSuccess: () => {
      toast.success('Patient archived');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(0);
  };

  const calculateAge = (dob: Date | string | null | undefined) => {
    if (!dob) return '-';
    const date = typeof dob === 'string' ? new Date(dob) : dob;
    return differenceInYears(new Date(), date);
  };

  const formatDOB = (dob: Date | string | null | undefined) => {
    if (!dob) return '-';
    const date = typeof dob === 'string' ? new Date(dob) : dob;
    return format(date, 'MM/dd/yyyy');
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-6">
      {/* Global Patient Search Command */}
      <PatientSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Patients</h1>
          <p className="text-stone-500 mt-1">
            Manage your patient database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            Quick Search
            <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-muted rounded border">
              {typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+K
            </kbd>
          </Button>
          <Link href="/patients/new">
            <Button className="bg-[#053e67] hover:bg-[#053e67] text-white">
              <Plus className="h-4 w-4 mr-2" />
              Add Patient
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                placeholder="Search by name, MRN, phone, or email..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as PatientStatus | 'ALL');
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Patients</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>

            {/* Page Size */}
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                setPageSize(parseInt(value));
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Patient Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium">
            {data?.total ?? 0} Patient{data?.total !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#053e67]" />
            </div>
          ) : !data?.patients.length ? (
            <div className="text-center py-10">
              <p className="text-stone-500">No patients found</p>
              <Link href="/patients/new">
                <Button variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first patient
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium">
                        <button
                          onClick={() => handleSort('name')}
                          className="flex items-center gap-1 hover:text-[#053e67]"
                        >
                          Name
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="pb-3 font-medium">
                        <button
                          onClick={() => handleSort('mrn')}
                          className="flex items-center gap-1 hover:text-[#053e67]"
                        >
                          MRN
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="pb-3 font-medium">
                        <button
                          onClick={() => handleSort('dateOfBirth')}
                          className="flex items-center gap-1 hover:text-[#053e67]"
                        >
                          DOB / Age
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="pb-3 font-medium">Phone</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.patients.map((patient) => (
                      <tr
                        key={patient.id}
                        className="border-b last:border-0 hover:bg-stone-50 cursor-pointer"
                        onClick={() => router.push(`/patients/${patient.id}`)}
                      >
                        <td className="py-4">
                          <div>
                            <p className="font-medium text-stone-900">
                              {patient.lastName}, {patient.firstName}
                            </p>
                            {patient.preferredName && (
                              <p className="text-sm text-stone-500">
                                &quot;{patient.preferredName}&quot;
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-4">
                          <code className="text-sm bg-stone-100 px-2 py-1 rounded">
                            {patient.mrn}
                          </code>
                        </td>
                        <td className="py-4">
                          <div>
                            <p className="text-sm">{formatDOB(patient.dateOfBirth)}</p>
                            <p className="text-xs text-stone-500">
                              {calculateAge(patient.dateOfBirth)} years
                            </p>
                          </div>
                        </td>
                        <td className="py-4">
                          <p className="text-sm">{patient.phone || '-'}</p>
                        </td>
                        <td className="py-4">
                          <Badge
                            className={cn(
                              'font-medium',
                              statusColors[patient.status as PatientStatus]
                            )}
                          >
                            {patient.status}
                          </Badge>
                        </td>
                        <td className="py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/patients/${patient.id}`);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/patients/${patient.id}/edit`);
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {patient.status !== 'ARCHIVED' && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('Are you sure you want to archive this patient?')) {
                                      archiveMutation.mutate({ id: patient.id });
                                    }
                                  }}
                                  className="text-red-600"
                                >
                                  <Archive className="h-4 w-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-stone-500">
                  Showing {page * pageSize + 1} to{' '}
                  {Math.min((page + 1) * pageSize, data.total)} of {data.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {page + 1} of {totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data.hasMore}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
