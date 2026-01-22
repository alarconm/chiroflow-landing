'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import {
  Search,
  Send,
  Download,
  Upload,
  Eye,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  MoreHorizontal,
  Filter,
  RefreshCw,
  FileDown,
  Zap,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EnhancedClaimsTabProps {
  dateRange: DateRange | undefined;
}

// Demo claims data with enhanced details
const demoClaims = [
  {
    id: '1',
    claimNumber: 'CLM-2025-0001',
    patientName: '[DEMO] Johnson, Robert',
    patientId: 'PT-001',
    payerName: 'Blue Cross Blue Shield',
    payerId: 'BCBS-001',
    serviceDate: new Date('2025-01-15'),
    submittedDate: new Date('2025-01-16'),
    totalCharges: 185.00,
    allowedAmount: 148.00,
    paidAmount: 118.40,
    adjustmentAmount: 37.00,
    patientResponsibility: 29.60,
    status: 'PAID',
    claimType: 'PROFESSIONAL',
    diagnoses: ['M54.5', 'M99.03'],
    procedures: ['98941', '97140'],
  },
  {
    id: '2',
    claimNumber: 'CLM-2025-0002',
    patientName: '[DEMO] Smith, Maria',
    patientId: 'PT-002',
    payerName: 'Aetna',
    payerId: 'AETNA-001',
    serviceDate: new Date('2025-01-16'),
    submittedDate: new Date('2025-01-17'),
    totalCharges: 145.00,
    allowedAmount: null,
    paidAmount: 0,
    adjustmentAmount: 0,
    patientResponsibility: 0,
    status: 'SUBMITTED',
    claimType: 'PROFESSIONAL',
    diagnoses: ['M54.2'],
    procedures: ['98940', '97112'],
  },
  {
    id: '3',
    claimNumber: 'CLM-2025-0003',
    patientName: '[DEMO] Williams, James',
    patientId: 'PT-003',
    payerName: 'United Healthcare',
    payerId: 'UHC-001',
    serviceDate: new Date('2025-01-17'),
    submittedDate: null,
    totalCharges: 225.00,
    allowedAmount: null,
    paidAmount: 0,
    adjustmentAmount: 0,
    patientResponsibility: 0,
    status: 'READY',
    claimType: 'PROFESSIONAL',
    diagnoses: ['M47.812', 'M54.5'],
    procedures: ['98942', '97140', '97530'],
  },
  {
    id: '4',
    claimNumber: 'CLM-2025-0004',
    patientName: '[DEMO] Brown, Lisa',
    patientId: 'PT-004',
    payerName: 'Cigna',
    payerId: 'CIGNA-001',
    serviceDate: new Date('2025-01-12'),
    submittedDate: new Date('2025-01-13'),
    totalCharges: 165.00,
    allowedAmount: 132.00,
    paidAmount: 0,
    adjustmentAmount: 33.00,
    patientResponsibility: 132.00,
    status: 'DENIED',
    claimType: 'PROFESSIONAL',
    diagnoses: ['M99.01'],
    procedures: ['98941', '97140'],
    denialReason: 'Authorization required for this service',
  },
  {
    id: '5',
    claimNumber: 'CLM-2025-0005',
    patientName: '[DEMO] Garcia, Carlos',
    patientId: 'PT-005',
    payerName: 'Blue Cross Blue Shield',
    payerId: 'BCBS-001',
    serviceDate: new Date('2025-01-10'),
    submittedDate: new Date('2025-01-11'),
    totalCharges: 285.00,
    allowedAmount: 228.00,
    paidAmount: 160.00,
    adjustmentAmount: 57.00,
    patientResponsibility: 68.00,
    status: 'PARTIAL',
    claimType: 'PROFESSIONAL',
    diagnoses: ['M54.5', 'M99.03', 'M99.04'],
    procedures: ['98942', '97140', '97110'],
  },
];

// Demo ERA data
const demoERAFiles = [
  {
    id: '1',
    fileName: 'ERA_BCBS_20250118.835',
    receivedDate: new Date('2025-01-18'),
    payerName: 'Blue Cross Blue Shield',
    claimCount: 12,
    totalPaid: 1850.00,
    status: 'PROCESSED',
  },
  {
    id: '2',
    fileName: 'ERA_AETNA_20250117.835',
    receivedDate: new Date('2025-01-17'),
    payerName: 'Aetna',
    claimCount: 8,
    totalPaid: 1240.00,
    status: 'PROCESSED',
  },
  {
    id: '3',
    fileName: 'ERA_UHC_20250116.835',
    receivedDate: new Date('2025-01-16'),
    payerName: 'United Healthcare',
    claimCount: 5,
    totalPaid: 680.00,
    status: 'PENDING_REVIEW',
  },
];

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800', icon: FileText },
  READY: { label: 'Ready', color: 'bg-blue-100 text-blue-800', icon: Zap },
  SUBMITTED: { label: 'Submitted', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  ACCEPTED: { label: 'Accepted', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
  DENIED: { label: 'Denied', color: 'bg-red-100 text-red-800', icon: XCircle },
  PAID: { label: 'Paid', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  PARTIAL: { label: 'Partial', color: 'bg-orange-100 text-orange-800', icon: AlertCircle },
  APPEALED: { label: 'Appealed', color: 'bg-purple-100 text-purple-800', icon: RefreshCw },
};

export function EnhancedClaimsTab({ dateRange }: EnhancedClaimsTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [payerFilter, setPayerFilter] = useState<string>('all');
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('claims');
  const [showBatchSubmitDialog, setShowBatchSubmitDialog] = useState(false);
  const [showImportERADialog, setShowImportERADialog] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredClaims = demoClaims.filter((claim) => {
    const matchesSearch = claim.patientName.toLowerCase().includes(search.toLowerCase()) ||
      claim.claimNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || claim.status === statusFilter;
    const matchesPayer = payerFilter === 'all' || claim.payerId === payerFilter;
    return matchesSearch && matchesStatus && matchesPayer;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedClaims(filteredClaims.map((c) => c.id));
    } else {
      setSelectedClaims([]);
    }
  };

  const handleSelectClaim = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedClaims((prev) => [...prev, id]);
    } else {
      setSelectedClaims((prev) => prev.filter((cId) => cId !== id));
    }
  };

  const handleBatchSubmit = () => {
    setIsSubmitting(true);
    setBatchProgress(0);
    const interval = setInterval(() => {
      setBatchProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsSubmitting(false);
          setShowBatchSubmitDialog(false);
          return 100;
        }
        return prev + 10;
      });
    }, 300);
  };

  const readyClaims = demoClaims.filter((c) => c.status === 'READY').length;
  const pendingClaims = demoClaims.filter((c) => ['SUBMITTED', 'ACCEPTED'].includes(c.status)).length;
  const deniedClaims = demoClaims.filter((c) => c.status === 'DENIED').length;
  const paidClaims = demoClaims.filter((c) => ['PAID', 'PARTIAL'].includes(c.status)).length;

  const uniquePayers = [...new Set(demoClaims.map((c) => ({ id: c.payerId, name: c.payerName })))];

  return (
    <div className="space-y-4">
      {/* Status Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ready to Submit</p>
                <p className="text-2xl font-bold">{readyClaims}</p>
              </div>
              <Zap className="h-8 w-8 text-[#053e67]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Response</p>
                <p className="text-2xl font-bold">{pendingClaims}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card className={deniedClaims > 0 ? 'border-red-200' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Denied</p>
                <p className="text-2xl font-bold">{deniedClaims}</p>
              </div>
              <XCircle className={`h-8 w-8 ${deniedClaims > 0 ? 'text-red-600' : 'text-gray-400'}`} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Paid This Period</p>
                <p className="text-2xl font-bold">{paidClaims}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="claims">
            <FileText className="mr-2 h-4 w-4" />
            Claims List
          </TabsTrigger>
          <TabsTrigger value="batch">
            <Send className="mr-2 h-4 w-4" />
            Batch Submission
          </TabsTrigger>
          <TabsTrigger value="era">
            <Download className="mr-2 h-4 w-4" />
            ERA Import
          </TabsTrigger>
        </TabsList>

        {/* Claims List Tab */}
        <TabsContent value="claims">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Claims Management</CardTitle>
                  <CardDescription>Track and manage insurance claims</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {selectedClaims.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setActiveTab('batch');
                        setShowBatchSubmitDialog(true);
                      }}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Submit Selected ({selectedClaims.length})
                    </Button>
                  )}
                  <Button variant="outline">
                    <FileDown className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex items-center gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by claim number or patient..."
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
                    <SelectItem value="READY">Ready</SelectItem>
                    <SelectItem value="SUBMITTED">Submitted</SelectItem>
                    <SelectItem value="ACCEPTED">Accepted</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="PARTIAL">Partial</SelectItem>
                    <SelectItem value="DENIED">Denied</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={payerFilter} onValueChange={setPayerFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Payers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payers</SelectItem>
                    {uniquePayers.map((payer) => (
                      <SelectItem key={payer.id} value={payer.id}>{payer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Claims Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedClaims.length === filteredClaims.length && filteredClaims.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Service Date</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Charges</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClaims.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No claims found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClaims.map((claim) => {
                      const status = statusConfig[claim.status] || statusConfig.DRAFT;
                      const StatusIcon = status.icon;
                      const balance = claim.totalCharges - claim.paidAmount - claim.adjustmentAmount;

                      return (
                        <TableRow key={claim.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedClaims.includes(claim.id)}
                              onCheckedChange={(checked) =>
                                handleSelectClaim(claim.id, checked as boolean)
                              }
                            />
                          </TableCell>
                          <TableCell className="font-mono font-medium">{claim.claimNumber}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{claim.patientName}</p>
                              <p className="text-sm text-muted-foreground">{claim.patientId}</p>
                            </div>
                          </TableCell>
                          <TableCell>{format(claim.serviceDate, 'MMM d, yyyy')}</TableCell>
                          <TableCell>{claim.payerName}</TableCell>
                          <TableCell>
                            <Badge className={status.color}>
                              <StatusIcon className="mr-1 h-3 w-3" />
                              {status.label}
                            </Badge>
                            {claim.denialReason && (
                              <p className="text-xs text-red-600 mt-1 max-w-32 truncate">
                                {claim.denialReason}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right">${claim.totalCharges.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-green-600">
                            ${claim.paidAmount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
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
                                  View CMS-1500
                                </DropdownMenuItem>
                                {claim.status === 'READY' && (
                                  <DropdownMenuItem>
                                    <Send className="mr-2 h-4 w-4" />
                                    Submit Claim
                                  </DropdownMenuItem>
                                )}
                                {claim.status === 'DENIED' && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>
                                      <RefreshCw className="mr-2 h-4 w-4" />
                                      Appeal Claim
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Send className="mr-2 h-4 w-4" />
                                      Resubmit
                                    </DropdownMenuItem>
                                  </>
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Batch Submission Tab */}
        <TabsContent value="batch">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Batch Claim Submission</CardTitle>
                  <CardDescription>Submit multiple claims to clearinghouse at once</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Ready Claims */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Zap className="h-5 w-5 text-[#053e67]" />
                    Claims Ready for Submission ({demoClaims.filter((c) => c.status === 'READY').length})
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox />
                        </TableHead>
                        <TableHead>Claim #</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Payer</TableHead>
                        <TableHead className="text-right">Charges</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {demoClaims.filter((c) => c.status === 'READY').map((claim) => (
                        <TableRow key={claim.id}>
                          <TableCell>
                            <Checkbox defaultChecked />
                          </TableCell>
                          <TableCell className="font-mono">{claim.claimNumber}</TableCell>
                          <TableCell>{claim.patientName}</TableCell>
                          <TableCell>{claim.payerName}</TableCell>
                          <TableCell className="text-right">${claim.totalCharges.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      {demoClaims.filter((c) => c.status === 'READY').length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                            No claims ready for submission
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Submission Options */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="border rounded-lg p-4">
                    <h3 className="font-medium mb-3">Submission Options</h3>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="validate" defaultChecked />
                        <Label htmlFor="validate">Validate claims before submission</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="secondary" />
                        <Label htmlFor="secondary">Include secondary claims</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="attachments" />
                        <Label htmlFor="attachments">Attach supporting documents</Label>
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h3 className="font-medium mb-3">Clearinghouse Settings</h3>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Clearinghouse</Label>
                        <Select defaultValue="availity">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="availity">Availity</SelectItem>
                            <SelectItem value="waystar">Waystar</SelectItem>
                            <SelectItem value="change">Change Healthcare</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Submission Mode</Label>
                        <Select defaultValue="production">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="production">Production</SelectItem>
                            <SelectItem value="test">Test/Validation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                <Dialog open={showBatchSubmitDialog} onOpenChange={setShowBatchSubmitDialog}>
                  <DialogTrigger asChild>
                    <Button className="w-full bg-[#053e67] hover:bg-[#053e67]">
                      <Send className="mr-2 h-4 w-4" />
                      Submit All Ready Claims
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirm Batch Submission</DialogTitle>
                      <DialogDescription>
                        You are about to submit {demoClaims.filter((c) => c.status === 'READY').length} claims to the clearinghouse.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      {isSubmitting ? (
                        <div className="space-y-2">
                          <Progress value={batchProgress} />
                          <p className="text-sm text-center text-muted-foreground">
                            Submitting claims... {batchProgress}%
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-muted rounded-lg">
                          <div className="flex justify-between text-sm mb-2">
                            <span>Total Claims:</span>
                            <span className="font-medium">{demoClaims.filter((c) => c.status === 'READY').length}</span>
                          </div>
                          <div className="flex justify-between text-sm mb-2">
                            <span>Total Charges:</span>
                            <span className="font-medium">
                              ${demoClaims.filter((c) => c.status === 'READY').reduce((sum, c) => sum + c.totalCharges, 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Clearinghouse:</span>
                            <span className="font-medium">Availity</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowBatchSubmitDialog(false)} disabled={isSubmitting}>
                        Cancel
                      </Button>
                      <Button
                        className="bg-[#053e67] hover:bg-[#053e67]"
                        onClick={handleBatchSubmit}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Submitting...' : 'Submit Claims'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ERA Import Tab */}
        <TabsContent value="era">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>ERA/835 Import</CardTitle>
                  <CardDescription>Import and process Electronic Remittance Advice files</CardDescription>
                </div>
                <Dialog open={showImportERADialog} onOpenChange={setShowImportERADialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-[#053e67] hover:bg-[#053e67]">
                      <Upload className="mr-2 h-4 w-4" />
                      Import ERA File
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Import ERA/835 File</DialogTitle>
                      <DialogDescription>
                        Upload an Electronic Remittance Advice file to process payments
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="border-2 border-dashed rounded-lg p-8 text-center">
                        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-sm text-muted-foreground mb-2">
                          Drag and drop your ERA file here, or click to browse
                        </p>
                        <Input type="file" accept=".835,.edi" className="max-w-xs mx-auto" />
                      </div>
                      <div className="space-y-2">
                        <Label>Processing Options</Label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox id="auto-post" defaultChecked />
                            <Label htmlFor="auto-post">Auto-post payments</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox id="auto-adjust" defaultChecked />
                            <Label htmlFor="auto-adjust">Auto-apply adjustments</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox id="transfer-patient" defaultChecked />
                            <Label htmlFor="transfer-patient">Transfer patient responsibility to ledger</Label>
                          </div>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowImportERADialog(false)}>
                        Cancel
                      </Button>
                      <Button className="bg-[#053e67] hover:bg-[#053e67]">
                        Process ERA
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {/* ERA Files Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead className="text-right">Claims</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoERAFiles.map((era) => (
                    <TableRow key={era.id}>
                      <TableCell className="font-mono">{era.fileName}</TableCell>
                      <TableCell>{format(era.receivedDate, 'MMM d, yyyy')}</TableCell>
                      <TableCell>{era.payerName}</TableCell>
                      <TableCell className="text-right">{era.claimCount}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        ${era.totalPaid.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={era.status === 'PROCESSED' ? 'default' : 'secondary'}>
                          {era.status === 'PROCESSED' ? (
                            <>
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Processed
                            </>
                          ) : (
                            <>
                              <Clock className="mr-1 h-3 w-3" />
                              Pending Review
                            </>
                          )}
                        </Badge>
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
                              <FileDown className="mr-2 h-4 w-4" />
                              Download Original
                            </DropdownMenuItem>
                            {era.status === 'PENDING_REVIEW' && (
                              <DropdownMenuItem>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Process Now
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
