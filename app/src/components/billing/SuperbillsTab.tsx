'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import {
  Search,
  FileText,
  Printer,
  Download,
  Plus,
  Eye,
  MoreHorizontal,
  Receipt,
  Settings,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SuperbillsTabProps {
  dateRange: DateRange | undefined;
}

// Demo superbill data
const demoSuperbills = [
  {
    id: '1',
    superbillNumber: 'SB-2025-0001',
    patientName: '[DEMO] Johnson, Robert',
    visitDate: new Date('2025-01-15'),
    provider: 'Dr. Sarah Chen',
    totalCharges: 185.00,
    diagnoses: ['M54.5', 'M99.03'],
    procedures: ['98941', '97140'],
    status: 'COMPLETED',
    createdAt: new Date('2025-01-15'),
  },
  {
    id: '2',
    superbillNumber: 'SB-2025-0002',
    patientName: '[DEMO] Smith, Maria',
    visitDate: new Date('2025-01-16'),
    provider: 'Dr. Sarah Chen',
    totalCharges: 145.00,
    diagnoses: ['M54.2'],
    procedures: ['98940', '97112'],
    status: 'PENDING',
    createdAt: new Date('2025-01-16'),
  },
  {
    id: '3',
    superbillNumber: 'SB-2025-0003',
    patientName: '[DEMO] Williams, James',
    visitDate: new Date('2025-01-17'),
    provider: 'Dr. Michael Roberts',
    totalCharges: 225.00,
    diagnoses: ['M47.812', 'M54.5'],
    procedures: ['98942', '97140', '97530'],
    status: 'COMPLETED',
    createdAt: new Date('2025-01-17'),
  },
  {
    id: '4',
    superbillNumber: 'SB-2025-0004',
    patientName: '[DEMO] Brown, Lisa',
    visitDate: new Date('2025-01-18'),
    provider: 'Dr. Sarah Chen',
    totalCharges: 95.00,
    diagnoses: ['M99.01'],
    procedures: ['98940'],
    status: 'DRAFT',
    createdAt: new Date('2025-01-18'),
  },
];

// Demo superbill templates
const demoTemplates = [
  { id: '1', name: 'Initial Evaluation', description: 'Full evaluation with X-rays', procedures: ['99203', '72020'] },
  { id: '2', name: 'Standard Adjustment', description: 'Spinal manipulation 3-4 regions', procedures: ['98941', '97140'] },
  { id: '3', name: 'Re-evaluation', description: 'Progress evaluation', procedures: ['99213', '98940'] },
  { id: '4', name: 'Therapeutic Exercise', description: 'Adjustment with therapy', procedures: ['98941', '97110', '97140'] },
];

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-green-100 text-green-800',
  VOIDED: 'bg-red-100 text-red-800',
};

export function SuperbillsTab({ dateRange }: SuperbillsTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSuperbills, setSelectedSuperbills] = useState<string[]>([]);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  const filteredSuperbills = demoSuperbills.filter((sb) => {
    const matchesSearch = sb.patientName.toLowerCase().includes(search.toLowerCase()) ||
      sb.superbillNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sb.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSuperbills(filteredSuperbills.map((sb) => sb.id));
    } else {
      setSelectedSuperbills([]);
    }
  };

  const handleSelectSuperbill = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedSuperbills((prev) => [...prev, id]);
    } else {
      setSelectedSuperbills((prev) => prev.filter((sbId) => sbId !== id));
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Superbills</p>
                <p className="text-2xl font-bold">{demoSuperbills.length}</p>
              </div>
              <Receipt className="h-8 w-8 text-[#053e67]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold">
                  {demoSuperbills.filter((sb) => sb.status === 'PENDING').length}
                </p>
              </div>
              <FileText className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Drafts</p>
                <p className="text-2xl font-bold">
                  {demoSuperbills.filter((sb) => sb.status === 'DRAFT').length}
                </p>
              </div>
              <FileText className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Charges</p>
                <p className="text-2xl font-bold">
                  ${demoSuperbills.reduce((sum, sb) => sum + sb.totalCharges, 0).toFixed(2)}
                </p>
              </div>
              <Receipt className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Superbills List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Superbills</CardTitle>
              <CardDescription>Generate and manage patient superbills</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={showTemplatesDialog} onOpenChange={setShowTemplatesDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Settings className="mr-2 h-4 w-4" />
                    Templates
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Superbill Templates</DialogTitle>
                    <DialogDescription>
                      Manage templates for quick superbill generation
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {demoTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{template.name}</p>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                          <div className="flex gap-1 mt-2">
                            {template.procedures.map((proc) => (
                              <Badge key={proc} variant="secondary">{proc}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">Edit</Button>
                          <Button variant="ghost" size="sm" className="text-destructive">Delete</Button>
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Create New Template
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-[#053e67] hover:bg-[#053e67]">
                    <Plus className="mr-2 h-4 w-4" />
                    Generate Superbill
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate Superbill</DialogTitle>
                    <DialogDescription>
                      Create a superbill for a patient visit
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Select Patient</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Search patients..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="p1">[DEMO] Johnson, Robert</SelectItem>
                          <SelectItem value="p2">[DEMO] Smith, Maria</SelectItem>
                          <SelectItem value="p3">[DEMO] Williams, James</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Visit Date</Label>
                      <Input type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Use Template</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select template (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {demoTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Provider</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dr-chen">Dr. Sarah Chen</SelectItem>
                          <SelectItem value="dr-roberts">Dr. Michael Roberts</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
                      Cancel
                    </Button>
                    <Button className="bg-[#053e67] hover:bg-[#053e67]">
                      Generate
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by patient or superbill number..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="VOIDED">Voided</SelectItem>
              </SelectContent>
            </Select>
            {selectedSuperbills.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Printer className="mr-2 h-4 w-4" />
                  Print ({selectedSuperbills.length})
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            )}
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedSuperbills.length === filteredSuperbills.length && filteredSuperbills.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Superbill #</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Visit Date</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Diagnoses</TableHead>
                <TableHead>Procedures</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuperbills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No superbills found
                  </TableCell>
                </TableRow>
              ) : (
                filteredSuperbills.map((superbill) => (
                  <TableRow key={superbill.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedSuperbills.includes(superbill.id)}
                        onCheckedChange={(checked) =>
                          handleSelectSuperbill(superbill.id, checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">{superbill.superbillNumber}</TableCell>
                    <TableCell>{superbill.patientName}</TableCell>
                    <TableCell>{format(superbill.visitDate, 'MMM d, yyyy')}</TableCell>
                    <TableCell>{superbill.provider}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {superbill.diagnoses.slice(0, 2).map((dx) => (
                          <Badge key={dx} variant="outline" className="text-xs">{dx}</Badge>
                        ))}
                        {superbill.diagnoses.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{superbill.diagnoses.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {superbill.procedures.slice(0, 2).map((proc) => (
                          <Badge key={proc} variant="secondary" className="text-xs">{proc}</Badge>
                        ))}
                        {superbill.procedures.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{superbill.procedures.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[superbill.status]}>{superbill.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${superbill.totalCharges.toFixed(2)}
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
                            <Printer className="mr-2 h-4 w-4" />
                            Print
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Download className="mr-2 h-4 w-4" />
                            Export PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <FileText className="mr-2 h-4 w-4" />
                            Create Claim
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
