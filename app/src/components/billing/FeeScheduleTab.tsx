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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  DollarSign,
  Building2,
  User,
  MoreHorizontal,
  Copy,
  Download,
  Upload,
  Settings,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Demo fee schedule data
const demoFeeSchedule = [
  {
    id: '1',
    cptCode: '99203',
    description: 'Office Visit - New Patient (30 min)',
    standardFee: 150.00,
    selfPayFee: 125.00,
    category: 'EVALUATION',
    active: true,
  },
  {
    id: '2',
    cptCode: '99213',
    description: 'Office Visit - Established Patient (15 min)',
    standardFee: 85.00,
    selfPayFee: 70.00,
    category: 'EVALUATION',
    active: true,
  },
  {
    id: '3',
    cptCode: '98940',
    description: 'Chiropractic Manipulative Treatment, 1-2 Regions',
    standardFee: 65.00,
    selfPayFee: 55.00,
    category: 'MANIPULATION',
    active: true,
  },
  {
    id: '4',
    cptCode: '98941',
    description: 'Chiropractic Manipulative Treatment, 3-4 Regions',
    standardFee: 85.00,
    selfPayFee: 70.00,
    category: 'MANIPULATION',
    active: true,
  },
  {
    id: '5',
    cptCode: '98942',
    description: 'Chiropractic Manipulative Treatment, 5+ Regions',
    standardFee: 105.00,
    selfPayFee: 90.00,
    category: 'MANIPULATION',
    active: true,
  },
  {
    id: '6',
    cptCode: '97110',
    description: 'Therapeutic Exercises (15 min)',
    standardFee: 45.00,
    selfPayFee: 38.00,
    category: 'THERAPY',
    active: true,
  },
  {
    id: '7',
    cptCode: '97140',
    description: 'Manual Therapy Techniques (15 min)',
    standardFee: 50.00,
    selfPayFee: 42.00,
    category: 'THERAPY',
    active: true,
  },
  {
    id: '8',
    cptCode: '97530',
    description: 'Therapeutic Activities (15 min)',
    standardFee: 48.00,
    selfPayFee: 40.00,
    category: 'THERAPY',
    active: true,
  },
  {
    id: '9',
    cptCode: '72020',
    description: 'Spine X-ray, 1 View',
    standardFee: 75.00,
    selfPayFee: 60.00,
    category: 'IMAGING',
    active: true,
  },
  {
    id: '10',
    cptCode: '72040',
    description: 'Cervical Spine X-ray, 2-3 Views',
    standardFee: 95.00,
    selfPayFee: 80.00,
    category: 'IMAGING',
    active: false,
  },
];

// Demo insurance contracted rates
const demoInsuranceRates = [
  {
    id: '1',
    payerName: '[DEMO] Blue Cross Blue Shield',
    payerId: 'BCBS-001',
    effectiveDate: new Date('2024-01-01'),
    expirationDate: new Date('2024-12-31'),
    rates: [
      { cptCode: '98940', allowedAmount: 52.00 },
      { cptCode: '98941', allowedAmount: 68.00 },
      { cptCode: '98942', allowedAmount: 84.00 },
      { cptCode: '97110', allowedAmount: 36.00 },
      { cptCode: '97140', allowedAmount: 40.00 },
    ],
  },
  {
    id: '2',
    payerName: '[DEMO] Aetna',
    payerId: 'AETNA-001',
    effectiveDate: new Date('2024-01-01'),
    expirationDate: new Date('2024-12-31'),
    rates: [
      { cptCode: '98940', allowedAmount: 55.00 },
      { cptCode: '98941', allowedAmount: 72.00 },
      { cptCode: '98942', allowedAmount: 88.00 },
      { cptCode: '97110', allowedAmount: 38.00 },
      { cptCode: '97140', allowedAmount: 42.00 },
    ],
  },
  {
    id: '3',
    payerName: '[DEMO] United Healthcare',
    payerId: 'UHC-001',
    effectiveDate: new Date('2024-01-01'),
    expirationDate: new Date('2024-12-31'),
    rates: [
      { cptCode: '98940', allowedAmount: 50.00 },
      { cptCode: '98941', allowedAmount: 65.00 },
      { cptCode: '98942', allowedAmount: 80.00 },
      { cptCode: '97110', allowedAmount: 35.00 },
      { cptCode: '97140', allowedAmount: 38.00 },
    ],
  },
];

const categoryLabels: Record<string, { label: string; color: string }> = {
  EVALUATION: { label: 'Evaluation', color: 'bg-blue-100 text-blue-800' },
  MANIPULATION: { label: 'Manipulation', color: 'bg-blue-100 text-blue-800' },
  THERAPY: { label: 'Therapy', color: 'bg-green-100 text-green-800' },
  IMAGING: { label: 'Imaging', color: 'bg-purple-100 text-purple-800' },
  SUPPLIES: { label: 'Supplies', color: 'bg-gray-100 text-gray-800' },
  OTHER: { label: 'Other', color: 'bg-gray-100 text-gray-800' },
};

export function FeeScheduleTab() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('standard');
  const [showAddFeeDialog, setShowAddFeeDialog] = useState(false);
  const [showEditFeeDialog, setShowEditFeeDialog] = useState(false);
  const [showInsuranceRateDialog, setShowInsuranceRateDialog] = useState(false);
  const [selectedFee, setSelectedFee] = useState<typeof demoFeeSchedule[0] | null>(null);
  const [selectedInsurance, setSelectedInsurance] = useState<typeof demoInsuranceRates[0] | null>(null);

  const filteredFees = demoFeeSchedule.filter((fee) => {
    const matchesSearch = fee.cptCode.toLowerCase().includes(search.toLowerCase()) ||
      fee.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || fee.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="standard">
            <DollarSign className="mr-2 h-4 w-4" />
            Standard Fees
          </TabsTrigger>
          <TabsTrigger value="selfpay">
            <User className="mr-2 h-4 w-4" />
            Self-Pay Rates
          </TabsTrigger>
          <TabsTrigger value="insurance">
            <Building2 className="mr-2 h-4 w-4" />
            Insurance Contracted Rates
          </TabsTrigger>
        </TabsList>

        {/* Standard Fees Tab */}
        <TabsContent value="standard">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Fee Schedule</CardTitle>
                  <CardDescription>Manage service fees and pricing</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" />
                    Import
                  </Button>
                  <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                  <Dialog open={showAddFeeDialog} onOpenChange={setShowAddFeeDialog}>
                    <DialogTrigger asChild>
                      <Button className="bg-[#053e67] hover:bg-[#053e67]">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Service
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Service Fee</DialogTitle>
                        <DialogDescription>Add a new service to the fee schedule</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>CPT Code</Label>
                          <Input placeholder="e.g., 98941" />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input placeholder="Service description..." />
                        </div>
                        <div className="space-y-2">
                          <Label>Category</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EVALUATION">Evaluation</SelectItem>
                              <SelectItem value="MANIPULATION">Manipulation</SelectItem>
                              <SelectItem value="THERAPY">Therapy</SelectItem>
                              <SelectItem value="IMAGING">Imaging</SelectItem>
                              <SelectItem value="SUPPLIES">Supplies</SelectItem>
                              <SelectItem value="OTHER">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Standard Fee</Label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input type="number" className="pl-8" placeholder="0.00" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Self-Pay Fee</Label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input type="number" className="pl-8" placeholder="0.00" />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch id="active" defaultChecked />
                          <Label htmlFor="active">Active</Label>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddFeeDialog(false)}>
                          Cancel
                        </Button>
                        <Button className="bg-[#053e67] hover:bg-[#053e67]">Add Service</Button>
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
                    placeholder="Search by CPT code or description..."
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="EVALUATION">Evaluation</SelectItem>
                    <SelectItem value="MANIPULATION">Manipulation</SelectItem>
                    <SelectItem value="THERAPY">Therapy</SelectItem>
                    <SelectItem value="IMAGING">Imaging</SelectItem>
                    <SelectItem value="SUPPLIES">Supplies</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fees Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CPT Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Standard Fee</TableHead>
                    <TableHead className="text-right">Self-Pay Fee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No services found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFees.map((fee) => {
                      const category = categoryLabels[fee.category] || categoryLabels.OTHER;
                      return (
                        <TableRow key={fee.id} className={!fee.active ? 'opacity-50' : ''}>
                          <TableCell className="font-mono font-medium">{fee.cptCode}</TableCell>
                          <TableCell className="max-w-xs truncate">{fee.description}</TableCell>
                          <TableCell>
                            <Badge className={category.color}>{category.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${fee.standardFee.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            ${fee.selfPayFee.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={fee.active ? 'default' : 'secondary'}>
                              {fee.active ? 'Active' : 'Inactive'}
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
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedFee(fee);
                                    setShowEditFeeDialog(true);
                                  }}
                                >
                                  <Edit2 className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Copy className="mr-2 h-4 w-4" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
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

        {/* Self-Pay Rates Tab */}
        <TabsContent value="selfpay">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Self-Pay Rates</CardTitle>
                  <CardDescription>Discounted rates for cash-pay patients</CardDescription>
                </div>
                <Button variant="outline">
                  <Settings className="mr-2 h-4 w-4" />
                  Bulk Discount Settings
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Self-Pay Discount:</strong> 15% off standard fees (automatically applied)
                </p>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CPT Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Standard Fee</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Self-Pay Rate</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoFeeSchedule.filter((f) => f.active).map((fee) => {
                    const discount = fee.standardFee - fee.selfPayFee;
                    const discountPercent = (discount / fee.standardFee) * 100;
                    return (
                      <TableRow key={fee.id}>
                        <TableCell className="font-mono font-medium">{fee.cptCode}</TableCell>
                        <TableCell className="max-w-xs truncate">{fee.description}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          ${fee.standardFee.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          -{discountPercent.toFixed(0)}% (${discount.toFixed(2)})
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${fee.selfPayFee.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insurance Contracted Rates Tab */}
        <TabsContent value="insurance">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Insurance Contracted Rates</CardTitle>
                  <CardDescription>Manage payer-specific fee schedules</CardDescription>
                </div>
                <Dialog open={showInsuranceRateDialog} onOpenChange={setShowInsuranceRateDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-[#053e67] hover:bg-[#053e67]">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Payer Contract
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add Insurance Contract</DialogTitle>
                      <DialogDescription>Set up contracted rates for an insurance payer</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Payer Name</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Select payer..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bcbs">[DEMO] Blue Cross Blue Shield</SelectItem>
                              <SelectItem value="aetna">[DEMO] Aetna</SelectItem>
                              <SelectItem value="uhc">[DEMO] United Healthcare</SelectItem>
                              <SelectItem value="cigna">[DEMO] Cigna</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Payer ID</Label>
                          <Input placeholder="Payer ID" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Effective Date</Label>
                          <Input type="date" />
                        </div>
                        <div className="space-y-2">
                          <Label>Expiration Date</Label>
                          <Input type="date" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Contracted Rates</Label>
                        <p className="text-sm text-muted-foreground">
                          Enter the allowed amounts for each CPT code
                        </p>
                        <div className="border rounded-lg max-h-64 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>CPT Code</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Standard Fee</TableHead>
                                <TableHead className="text-right">Allowed Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {demoFeeSchedule.slice(0, 5).map((fee) => (
                                <TableRow key={fee.id}>
                                  <TableCell className="font-mono">{fee.cptCode}</TableCell>
                                  <TableCell className="text-sm truncate max-w-32">
                                    {fee.description}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    ${fee.standardFee.toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="relative w-24 ml-auto">
                                      <DollarSign className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                                      <Input
                                        type="number"
                                        className="pl-7 h-8"
                                        placeholder="0.00"
                                      />
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowInsuranceRateDialog(false)}>
                        Cancel
                      </Button>
                      <Button className="bg-[#053e67] hover:bg-[#053e67]">Save Contract</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {demoInsuranceRates.map((contract) => (
                  <Card key={contract.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Building2 className="h-5 w-5 text-[#053e67]" />
                          <div>
                            <CardTitle className="text-lg">{contract.payerName}</CardTitle>
                            <CardDescription>
                              ID: {contract.payerId} | Effective: {contract.effectiveDate.toLocaleDateString()} - {contract.expirationDate.toLocaleDateString()}
                            </CardDescription>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Edit2 className="mr-2 h-4 w-4" />
                              Edit Contract
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>CPT Code</TableHead>
                            <TableHead className="text-right">Allowed Amount</TableHead>
                            <TableHead className="text-right">vs Standard</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contract.rates.map((rate) => {
                            const standardFee = demoFeeSchedule.find((f) => f.cptCode === rate.cptCode)?.standardFee || 0;
                            const difference = standardFee - rate.allowedAmount;
                            const percentDiff = standardFee > 0 ? (difference / standardFee) * 100 : 0;
                            return (
                              <TableRow key={rate.cptCode}>
                                <TableCell className="font-mono">{rate.cptCode}</TableCell>
                                <TableCell className="text-right font-medium">
                                  ${rate.allowedAmount.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right text-red-600">
                                  -{percentDiff.toFixed(0)}% (${difference.toFixed(2)})
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Fee Dialog */}
      <Dialog open={showEditFeeDialog} onOpenChange={setShowEditFeeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Service Fee</DialogTitle>
            <DialogDescription>Update the fee for {selectedFee?.cptCode}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>CPT Code</Label>
              <Input defaultValue={selectedFee?.cptCode} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input defaultValue={selectedFee?.description} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select defaultValue={selectedFee?.category}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EVALUATION">Evaluation</SelectItem>
                  <SelectItem value="MANIPULATION">Manipulation</SelectItem>
                  <SelectItem value="THERAPY">Therapy</SelectItem>
                  <SelectItem value="IMAGING">Imaging</SelectItem>
                  <SelectItem value="SUPPLIES">Supplies</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Standard Fee</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    className="pl-8"
                    defaultValue={selectedFee?.standardFee}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Self-Pay Fee</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    className="pl-8"
                    defaultValue={selectedFee?.selfPayFee}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="edit-active" defaultChecked={selectedFee?.active} />
              <Label htmlFor="edit-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditFeeDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-[#053e67] hover:bg-[#053e67]">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
