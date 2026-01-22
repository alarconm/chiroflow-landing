'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Download,
  Play,
  Save,
  Plus,
  X,
  Filter,
  SortAsc,
  SortDesc,
  TableProperties,
} from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const DATA_SOURCES = [
  { value: 'appointments', label: 'Appointments' },
  { value: 'charges', label: 'Charges' },
  { value: 'payments', label: 'Payments' },
  { value: 'claims', label: 'Claims' },
  { value: 'patients', label: 'Patients' },
  { value: 'encounters', label: 'Encounters' },
];

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'between', label: 'Between' },
  { value: 'is_null', label: 'Is Empty' },
  { value: 'is_not_null', label: 'Is Not Empty' },
];

interface ReportFilter {
  field: string;
  operator: string;
  value: string;
}

type DataSourceType = 'patients' | 'appointments' | 'encounters' | 'charges' | 'payments' | 'claims';

export function CustomReportBuilder() {
  const [dataSource, setDataSource] = useState<DataSourceType>('appointments');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(1)),
    to: new Date(),
  });
  const [reportName, setReportName] = useState('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [shouldRunReport, setShouldRunReport] = useState(false);

  const { data: availableColumns, isLoading: columnsLoading } =
    trpc.reporting.getAvailableColumns.useQuery({
      dataSource,
    });

  // Map operator from UI to schema
  const mapOperator = (op: string): 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'between' => {
    const mapping: Record<string, 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'between'> = {
      equals: 'eq',
      not_equals: 'neq',
      greater_than: 'gt',
      less_than: 'lt',
      contains: 'contains',
      between: 'between',
      is_null: 'eq',
      is_not_null: 'neq',
    };
    return mapping[op] || 'eq';
  };

  // Build report config for query
  const reportConfig = {
    reportType: 'CUSTOM' as const,
    name: 'Custom Report',
    dataSource,
    columns: selectedColumns.map((field) => {
      const col = availableColumns?.find((c) => c.field === field);
      return {
        field,
        label: col?.label || field,
        type: (col?.type || 'string') as 'string' | 'number' | 'date' | 'currency' | 'percentage' | 'boolean',
      };
    }),
    filters: filters
      .filter((f) => f.field && f.operator)
      .map((f) => ({
        field: f.field,
        operator: mapOperator(f.operator),
        value: f.value,
      })),
    sortBy: sortField || undefined,
    sortOrder: sortDirection,
    dateRange: dateRange?.from
      ? {
          field: 'createdAt',
          start: dateRange.from,
          end: dateRange.to || new Date(),
        }
      : undefined,
  };

  const {
    data: results,
    isLoading: isRunningReport,
    error: reportError,
  } = trpc.reporting.buildCustomReport.useQuery(reportConfig, {
    enabled: shouldRunReport && selectedColumns.length > 0,
    staleTime: 0,
  });

  // Handle report completion
  if (results && shouldRunReport) {
    setShouldRunReport(false);
    toast.success(`Report generated with ${results.rowCount} rows`);
  }
  if (reportError && shouldRunReport) {
    setShouldRunReport(false);
    toast.error(reportError.message);
  }

  const saveReport = trpc.reporting.saveReport.useMutation({
    onSuccess: () => {
      toast.success('Report saved successfully');
      setSaveDialogOpen(false);
      setReportName('');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const exportReport = trpc.reporting.exportReport.useMutation({
    onSuccess: () => {
      toast.success('Export started. You will be notified when ready.');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleColumnToggle = (columnField: string) => {
    setSelectedColumns((prev) =>
      prev.includes(columnField)
        ? prev.filter((c) => c !== columnField)
        : [...prev, columnField]
    );
  };

  const handleAddFilter = () => {
    setFilters([...filters, { field: '', operator: 'equals', value: '' }]);
  };

  const handleRemoveFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const handleFilterChange = (index: number, field: keyof ReportFilter, value: string) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], [field]: value };
    setFilters(newFilters);
  };

  const handleRunReport = () => {
    if (selectedColumns.length === 0) {
      toast.error('Please select at least one column');
      return;
    }
    setShouldRunReport(true);
  };

  const handleSaveReport = () => {
    if (!reportName.trim()) {
      toast.error('Please enter a report name');
      return;
    }

    saveReport.mutate({
      name: reportName,
      reportType: 'CUSTOM',
      config: {
        dataSource,
        columns: selectedColumns,
        filters,
        sortBy: sortField,
        sortDirection,
      },
      sortBy: sortField || undefined,
      sortOrder: sortDirection,
    });
  };

  const handleExport = (format: 'PDF' | 'CSV' | 'EXCEL') => {
    exportReport.mutate({
      reportType: 'CUSTOM',
      format,
      parameters: {
        dataSource,
        columns: selectedColumns,
        filters,
        sortBy: sortField,
        sortDirection,
        dateRange: dateRange
          ? {
              startDate: dateRange.from?.toISOString(),
              endDate: dateRange.to?.toISOString(),
            }
          : undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TableProperties className="h-5 w-5" />
            Custom Report Builder
          </CardTitle>
          <CardDescription>
            Build custom reports by selecting data source, columns, and filters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Data Source and Date Range */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label>Data Source</Label>
              <Select value={dataSource} onValueChange={(v) => setDataSource(v as DataSourceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_SOURCES.map((source) => (
                    <SelectItem key={source.value} value={source.value}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Date Range</Label>
              <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
            </div>
          </div>

          {/* Column Selection */}
          <div>
            <Label className="mb-2 block">Select Columns</Label>
            {columnsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 border rounded-md max-h-48 overflow-y-auto">
                {availableColumns?.map((column) => (
                  <div key={column.field} className="flex items-center space-x-2">
                    <Checkbox
                      id={column.field}
                      checked={selectedColumns.includes(column.field)}
                      onCheckedChange={() => handleColumnToggle(column.field)}
                    />
                    <label
                      htmlFor={column.field}
                      className="text-sm cursor-pointer"
                    >
                      {column.label}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </Label>
              <Button variant="outline" size="sm" onClick={handleAddFilter}>
                <Plus className="h-4 w-4 mr-1" />
                Add Filter
              </Button>
            </div>
            {filters.length > 0 && (
              <div className="space-y-2">
                {filters.map((filter, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Select
                      value={filter.field}
                      onValueChange={(v) => handleFilterChange(index, 'field', v)}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableColumns?.map((col) => (
                          <SelectItem key={col.field} value={col.field}>
                            {col.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={filter.operator}
                      onValueChange={(v) => handleFilterChange(index, 'operator', v)}
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={filter.value}
                      onChange={(e) => handleFilterChange(index, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveFilter(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sorting */}
          <div className="flex gap-4">
            <div className="flex-1">
              <Label>Sort By</Label>
              <Select value={sortField} onValueChange={setSortField}>
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {selectedColumns.map((col) => {
                    const column = availableColumns?.find((c) => c.field === col);
                    return (
                      <SelectItem key={col} value={col}>
                        {column?.label || col}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Direction</Label>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                {sortDirection === 'asc' ? (
                  <SortAsc className="h-4 w-4 mr-2" />
                ) : (
                  <SortDesc className="h-4 w-4 mr-2" />
                )}
                {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setSaveDialogOpen(true)}>
              <Save className="h-4 w-4 mr-2" />
              Save Report
            </Button>
            <Button
              onClick={handleRunReport}
              disabled={isRunningReport || selectedColumns.length === 0}
            >
              <Play className="h-4 w-4 mr-2" />
              {isRunningReport ? 'Running...' : 'Run Report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Results ({results.rowCount} rows)</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExport('CSV')}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport('EXCEL')}>
                  <Download className="h-4 w-4 mr-2" />
                  Excel
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {results.columns.map((col: any) => (
                      <TableHead key={col.field}>{col.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.rows.slice(0, 100).map((row: any, i: number) => (
                    <TableRow key={i}>
                      {results.columns.map((col: any) => (
                        <TableCell key={col.field}>
                          {formatCellValue(row[col.field], col.type)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {results.rows.length > 100 && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  Showing first 100 of {results.rows.length} rows. Export for full data.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Report</DialogTitle>
            <DialogDescription>
              Save this report configuration for future use
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reportName">Report Name</Label>
            <Input
              id="reportName"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="My Custom Report"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveReport} disabled={saveReport.isPending}>
              {saveReport.isPending ? 'Saving...' : 'Save Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatCellValue(value: any, type: string): string {
  if (value === null || value === undefined) return '-';
  if (type === 'currency') return `$${Number(value).toFixed(2)}`;
  if (type === 'date') return new Date(value).toLocaleDateString();
  if (type === 'datetime') return new Date(value).toLocaleString();
  if (type === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
