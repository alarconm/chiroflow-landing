'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import {
  Shield,
  AlertTriangle,
  FileText,
  Clock,
  Building2,
  Plus,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle,
  XCircle,
  Calendar,
  Edit,
  Trash2,
  ExternalLink,
  ClipboardCheck,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

// Status badge configuration
const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  PENDING_SIGNATURE: { label: 'Pending Signature', color: 'bg-yellow-100 text-yellow-800' },
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-800' },
  EXPIRED: { label: 'Expired', color: 'bg-red-100 text-red-800' },
  TERMINATED: { label: 'Terminated', color: 'bg-gray-100 text-gray-800' },
};

// Risk level badge configuration
const riskConfig: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Low', color: 'bg-green-100 text-green-800' },
  MEDIUM: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  HIGH: { label: 'High', color: 'bg-orange-100 text-orange-800' },
  CRITICAL: { label: 'Critical', color: 'bg-red-100 text-red-800' },
};

export default function BAACompliancePage() {
  const { isAtLeast, isLoading: permissionsLoading } = usePermissions();
  const isAdmin = isAtLeast('ADMIN');

  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRiskAssessmentOpen, setIsRiskAssessmentOpen] = useState(false);
  const [selectedBaa, setSelectedBaa] = useState<string | null>(null);

  // Form state for create/edit
  const [formData, setFormData] = useState({
    vendorName: '',
    vendorContact: '',
    vendorEmail: '',
    vendorPhone: '',
    vendorAddress: '',
    documentUrl: '',
    version: '',
    expirationDate: '',
    renewalDate: '',
    riskLevel: '',
    riskNotes: '',
    servicesCovered: '',
    notes: '',
  });

  // Risk assessment form state
  const [riskAssessmentData, setRiskAssessmentData] = useState({
    riskLevel: '',
    riskNotes: '',
  });

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.baa.getDashboardStats.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  // Fetch BAAs
  const { data: baasData, isLoading: baasLoading, refetch: refetchBaas } = trpc.baa.list.useQuery(
    {
      status: statusFilter !== 'all' ? statusFilter as 'DRAFT' | 'PENDING_SIGNATURE' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' : undefined,
      riskLevel: riskFilter !== 'all' ? riskFilter as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' : undefined,
      search: searchFilter || undefined,
      limit: 100,
    },
    { enabled: isAdmin }
  );

  // Fetch compliance alerts
  const { data: alerts, refetch: refetchAlerts } = trpc.baa.getComplianceAlerts.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  // Create mutation
  const createMutation = trpc.baa.create.useMutation({
    onSuccess: () => {
      toast.success('BAA created successfully');
      setIsCreateDialogOpen(false);
      resetForm();
      refetchBaas();
      refetchStats();
      refetchAlerts();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create BAA');
    },
  });

  // Update mutation
  const updateMutation = trpc.baa.update.useMutation({
    onSuccess: () => {
      toast.success('BAA updated successfully');
      setIsEditDialogOpen(false);
      setSelectedBaa(null);
      resetForm();
      refetchBaas();
      refetchStats();
      refetchAlerts();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update BAA');
    },
  });

  // Update status mutation
  const updateStatusMutation = trpc.baa.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('BAA status updated');
      refetchBaas();
      refetchStats();
      refetchAlerts();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  // Risk assessment mutation
  const riskAssessmentMutation = trpc.baa.performRiskAssessment.useMutation({
    onSuccess: () => {
      toast.success('Risk assessment recorded');
      setIsRiskAssessmentOpen(false);
      setSelectedBaa(null);
      setRiskAssessmentData({ riskLevel: '', riskNotes: '' });
      refetchBaas();
      refetchStats();
      refetchAlerts();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to record risk assessment');
    },
  });

  // Delete mutation
  const deleteMutation = trpc.baa.delete.useMutation({
    onSuccess: () => {
      toast.success('BAA deleted');
      refetchBaas();
      refetchStats();
      refetchAlerts();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete BAA');
    },
  });

  const resetForm = () => {
    setFormData({
      vendorName: '',
      vendorContact: '',
      vendorEmail: '',
      vendorPhone: '',
      vendorAddress: '',
      documentUrl: '',
      version: '',
      expirationDate: '',
      renewalDate: '',
      riskLevel: '',
      riskNotes: '',
      servicesCovered: '',
      notes: '',
    });
  };

  const handleCreateSubmit = () => {
    createMutation.mutate({
      vendorName: formData.vendorName,
      vendorContact: formData.vendorContact || undefined,
      vendorEmail: formData.vendorEmail || undefined,
      vendorPhone: formData.vendorPhone || undefined,
      vendorAddress: formData.vendorAddress || undefined,
      documentUrl: formData.documentUrl || undefined,
      version: formData.version || undefined,
      expirationDate: formData.expirationDate ? new Date(formData.expirationDate) : undefined,
      renewalDate: formData.renewalDate ? new Date(formData.renewalDate) : undefined,
      riskLevel: formData.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
      riskNotes: formData.riskNotes || undefined,
      servicesCovered: formData.servicesCovered ? formData.servicesCovered.split(',').map(s => s.trim()) : [],
      notes: formData.notes || undefined,
    });
  };

  const handleUpdateSubmit = () => {
    if (!selectedBaa) return;
    updateMutation.mutate({
      id: selectedBaa,
      vendorName: formData.vendorName,
      vendorContact: formData.vendorContact || undefined,
      vendorEmail: formData.vendorEmail || undefined,
      vendorPhone: formData.vendorPhone || undefined,
      vendorAddress: formData.vendorAddress || undefined,
      documentUrl: formData.documentUrl || undefined,
      version: formData.version || undefined,
      expirationDate: formData.expirationDate ? new Date(formData.expirationDate) : undefined,
      renewalDate: formData.renewalDate ? new Date(formData.renewalDate) : undefined,
      riskLevel: formData.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
      riskNotes: formData.riskNotes || undefined,
      notes: formData.notes || undefined,
    });
  };

  const handleRiskAssessmentSubmit = () => {
    if (!selectedBaa || !riskAssessmentData.riskLevel) return;
    riskAssessmentMutation.mutate({
      id: selectedBaa,
      riskLevel: riskAssessmentData.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      riskNotes: riskAssessmentData.riskNotes || undefined,
    });
  };

  const handleRefresh = () => {
    refetchStats();
    refetchBaas();
    refetchAlerts();
  };

  const openEditDialog = (baa: NonNullable<typeof baasData>['baas'][0]) => {
    setSelectedBaa(baa.id);
    setFormData({
      vendorName: baa.vendorName,
      vendorContact: baa.vendorContact || '',
      vendorEmail: baa.vendorEmail || '',
      vendorPhone: baa.vendorPhone || '',
      vendorAddress: baa.vendorAddress || '',
      documentUrl: baa.documentUrl || '',
      version: baa.version || '',
      expirationDate: baa.expirationDate ? format(new Date(baa.expirationDate), 'yyyy-MM-dd') : '',
      renewalDate: baa.renewalDate ? format(new Date(baa.renewalDate), 'yyyy-MM-dd') : '',
      riskLevel: baa.riskLevel || '',
      riskNotes: baa.riskNotes || '',
      servicesCovered: baa.servicesCovered?.join(', ') || '',
      notes: baa.notes || '',
    });
    setIsEditDialogOpen(true);
  };

  const openRiskAssessment = (baaId: string) => {
    setSelectedBaa(baaId);
    setRiskAssessmentData({ riskLevel: '', riskNotes: '' });
    setIsRiskAssessmentOpen(true);
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#053e67]/50"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
              <p>You don&apos;t have permission to view BAA compliance settings.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-[#053e67]" />
            BAA Compliance Dashboard
          </h1>
          <p className="text-gray-500 mt-1">Manage Business Associate Agreements for HIPAA compliance.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New BAA
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New BAA</DialogTitle>
                <DialogDescription>
                  Record a new Business Associate Agreement for HIPAA compliance tracking.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vendorName">Vendor Name *</Label>
                    <Input
                      id="vendorName"
                      value={formData.vendorName}
                      onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
                      placeholder="Enter vendor name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendorContact">Contact Name</Label>
                    <Input
                      id="vendorContact"
                      value={formData.vendorContact}
                      onChange={(e) => setFormData({ ...formData, vendorContact: e.target.value })}
                      placeholder="Enter contact name"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vendorEmail">Email</Label>
                    <Input
                      id="vendorEmail"
                      type="email"
                      value={formData.vendorEmail}
                      onChange={(e) => setFormData({ ...formData, vendorEmail: e.target.value })}
                      placeholder="vendor@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendorPhone">Phone</Label>
                    <Input
                      id="vendorPhone"
                      value={formData.vendorPhone}
                      onChange={(e) => setFormData({ ...formData, vendorPhone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendorAddress">Address</Label>
                  <Textarea
                    id="vendorAddress"
                    value={formData.vendorAddress}
                    onChange={(e) => setFormData({ ...formData, vendorAddress: e.target.value })}
                    placeholder="Enter vendor address"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="documentUrl">Document URL</Label>
                    <Input
                      id="documentUrl"
                      value={formData.documentUrl}
                      onChange={(e) => setFormData({ ...formData, documentUrl: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="version">Document Version</Label>
                    <Input
                      id="version"
                      value={formData.version}
                      onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                      placeholder="e.g., 1.0"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expirationDate">Expiration Date</Label>
                    <Input
                      id="expirationDate"
                      type="date"
                      value={formData.expirationDate}
                      onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="renewalDate">Renewal Reminder Date</Label>
                    <Input
                      id="renewalDate"
                      type="date"
                      value={formData.renewalDate}
                      onChange={(e) => setFormData({ ...formData, renewalDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="riskLevel">Initial Risk Level</Label>
                  <Select
                    value={formData.riskLevel}
                    onValueChange={(value) => setFormData({ ...formData, riskLevel: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select risk level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="servicesCovered">Services Covered (comma-separated)</Label>
                  <Input
                    id="servicesCovered"
                    value={formData.servicesCovered}
                    onChange={(e) => setFormData({ ...formData, servicesCovered: e.target.value })}
                    placeholder="e.g., Data Storage, Email, Analytics"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes about this BAA"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateSubmit} disabled={!formData.vendorName || createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create BAA'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Alert Banner */}
      {alerts && alerts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-800 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Compliance Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.slice(0, 5).map((alert, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg ${
                    alert.severity === 'CRITICAL' ? 'bg-red-100' : 'bg-yellow-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Badge className={alert.severity === 'CRITICAL' ? 'bg-red-600' : 'bg-yellow-600'}>
                      {alert.severity}
                    </Badge>
                    <span className="font-medium">{alert.type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-sm mt-1 text-gray-700">{alert.message}</p>
                </div>
              ))}
              {alerts.length > 5 && (
                <p className="text-sm text-gray-600">
                  And {alerts.length - 5} more alerts...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Compliance Score</CardDescription>
            <CardTitle className={`text-3xl ${
              (stats?.complianceScore ?? 0) >= 80 ? 'text-green-600' :
              (stats?.complianceScore ?? 0) >= 60 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {statsLoading ? '...' : `${stats?.complianceScore ?? 0}%`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Shield className="h-4 w-4" />
              <span>Overall health</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active BAAs</CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {statsLoading ? '...' : stats?.byStatus.active ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <CheckCircle className="h-4 w-4" />
              <span>{stats?.byStatus.pending ?? 0} pending</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expired</CardDescription>
            <CardTitle className="text-3xl text-red-600">
              {statsLoading ? '...' : stats?.expirations.expiredCount ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <XCircle className="h-4 w-4" />
              <span>Needs attention</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expiring Soon</CardDescription>
            <CardTitle className="text-3xl text-orange-600">
              {statsLoading ? '...' : stats?.expirations.expiringIn30Days ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              <span>Within 30 days</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High/Critical Risk</CardDescription>
            <CardTitle className="text-3xl text-red-600">
              {statsLoading ? '...' : (stats?.riskSummary.highRisk ?? 0) + (stats?.riskSummary.criticalRisk ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <AlertTriangle className="h-4 w-4" />
              <span>{stats?.riskSummary.needsAssessment ?? 0} need review</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">
            <FileText className="h-4 w-4 mr-2" />
            All BAAs
          </TabsTrigger>
          <TabsTrigger value="expiring">
            <Clock className="h-4 w-4 mr-2" />
            Expiring Soon
          </TabsTrigger>
          <TabsTrigger value="risk">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Risk Assessment
          </TabsTrigger>
        </TabsList>

        {/* All BAAs Tab */}
        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Business Associate Agreements</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search BAAs..."
                      className="pl-10 w-[200px]"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="PENDING_SIGNATURE">Pending</SelectItem>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="EXPIRED">Expired</SelectItem>
                      <SelectItem value="TERMINATED">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Risk Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Risks</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {baasLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#053e67]/50"></div>
                </div>
              ) : baasData?.baas.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No BAAs found</p>
                  <p className="text-sm">Create your first BAA to start tracking compliance.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {baasData?.baas.map((baa) => {
                    const status = statusConfig[baa.status] || { label: baa.status, color: 'bg-gray-100' };
                    const risk = baa.riskLevel ? riskConfig[baa.riskLevel] : null;

                    return (
                      <div
                        key={baa.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded-lg bg-blue-100 text-blue-800">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{baa.vendorName}</span>
                              <Badge className={status.color}>{status.label}</Badge>
                              {risk && <Badge className={risk.color}>{risk.label} Risk</Badge>}
                            </div>
                            <div className="text-sm text-gray-500 flex items-center gap-3 mt-1">
                              {baa.vendorEmail && <span>{baa.vendorEmail}</span>}
                              {baa.expirationDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Expires: {format(new Date(baa.expirationDate), 'MMM d, yyyy')}
                                  {baa.daysUntilExpiration !== null && baa.daysUntilExpiration <= 30 && (
                                    <Badge variant="destructive" className="ml-1 text-xs">
                                      {baa.daysUntilExpiration <= 0 ? 'Expired' : `${baa.daysUntilExpiration}d left`}
                                    </Badge>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {baa.documentUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(baa.documentUrl!, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openRiskAssessment(baa.id)}
                          >
                            <ClipboardCheck className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(baa)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {baa.status !== 'ACTIVE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => updateStatusMutation.mutate({ id: baa.id, status: 'ACTIVE' })}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this BAA?')) {
                                deleteMutation.mutate({ id: baa.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expiring Soon Tab */}
        <TabsContent value="expiring" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Expiring Within 30 Days</CardTitle>
                <CardDescription>BAAs requiring immediate attention</CardDescription>
              </CardHeader>
              <CardContent>
                {baasData?.baas
                  .filter((baa) => baa.daysUntilExpiration !== null && baa.daysUntilExpiration <= 30 && baa.daysUntilExpiration > 0)
                  .map((baa) => (
                    <div key={baa.id} className="p-3 border-b last:border-b-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{baa.vendorName}</span>
                        <Badge variant="destructive">{baa.daysUntilExpiration} days</Badge>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        Expires: {baa.expirationDate && format(new Date(baa.expirationDate), 'MMM d, yyyy')}
                      </div>
                    </div>
                  )) || (
                    <div className="text-center py-4 text-gray-500">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      No BAAs expiring within 30 days
                    </div>
                  )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Renewal Reminders</CardTitle>
                <CardDescription>BAAs due for renewal process</CardDescription>
              </CardHeader>
              <CardContent>
                {baasData?.baas
                  .filter((baa) => baa.daysUntilRenewal !== null && baa.daysUntilRenewal <= 30 && baa.daysUntilRenewal > 0)
                  .map((baa) => (
                    <div key={baa.id} className="p-3 border-b last:border-b-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{baa.vendorName}</span>
                        <Badge className="bg-yellow-100 text-yellow-800">{baa.daysUntilRenewal} days</Badge>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        Renewal date: {baa.renewalDate && format(new Date(baa.renewalDate), 'MMM d, yyyy')}
                      </div>
                    </div>
                  )) || (
                    <div className="text-center py-4 text-gray-500">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      No renewal reminders due
                    </div>
                  )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Risk Assessment Tab */}
        <TabsContent value="risk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk Assessment Overview</CardTitle>
              <CardDescription>Vendor risk levels and assessment status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {baasData?.baas.filter((b) => b.riskLevel === 'LOW').length || 0}
                  </div>
                  <div className="text-sm text-gray-500">Low Risk</div>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {baasData?.baas.filter((b) => b.riskLevel === 'MEDIUM').length || 0}
                  </div>
                  <div className="text-sm text-gray-500">Medium Risk</div>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {baasData?.baas.filter((b) => b.riskLevel === 'HIGH').length || 0}
                  </div>
                  <div className="text-sm text-gray-500">High Risk</div>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {baasData?.baas.filter((b) => b.riskLevel === 'CRITICAL').length || 0}
                  </div>
                  <div className="text-sm text-gray-500">Critical Risk</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Needs Assessment</h4>
                {baasData?.baas
                  .filter((baa) => !baa.riskLevel || !baa.lastRiskAssessment)
                  .map((baa) => (
                    <div key={baa.id} className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50">
                      <div>
                        <span className="font-medium">{baa.vendorName}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          {baa.riskLevel ? 'Assessment outdated' : 'No assessment'}
                        </span>
                      </div>
                      <Button size="sm" onClick={() => openRiskAssessment(baa.id)}>
                        <ClipboardCheck className="h-4 w-4 mr-2" />
                        Assess
                      </Button>
                    </div>
                  ))}
                {baasData?.baas.filter((baa) => !baa.riskLevel || !baa.lastRiskAssessment).length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    All BAAs have been assessed
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit BAA</DialogTitle>
            <DialogDescription>
              Update Business Associate Agreement details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-vendorName">Vendor Name *</Label>
                <Input
                  id="edit-vendorName"
                  value={formData.vendorName}
                  onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-vendorContact">Contact Name</Label>
                <Input
                  id="edit-vendorContact"
                  value={formData.vendorContact}
                  onChange={(e) => setFormData({ ...formData, vendorContact: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-vendorEmail">Email</Label>
                <Input
                  id="edit-vendorEmail"
                  type="email"
                  value={formData.vendorEmail}
                  onChange={(e) => setFormData({ ...formData, vendorEmail: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-vendorPhone">Phone</Label>
                <Input
                  id="edit-vendorPhone"
                  value={formData.vendorPhone}
                  onChange={(e) => setFormData({ ...formData, vendorPhone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-expirationDate">Expiration Date</Label>
                <Input
                  id="edit-expirationDate"
                  type="date"
                  value={formData.expirationDate}
                  onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-renewalDate">Renewal Reminder Date</Label>
                <Input
                  id="edit-renewalDate"
                  type="date"
                  value={formData.renewalDate}
                  onChange={(e) => setFormData({ ...formData, renewalDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateSubmit} disabled={!formData.vendorName || updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Risk Assessment Dialog */}
      <Dialog open={isRiskAssessmentOpen} onOpenChange={setIsRiskAssessmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vendor Risk Assessment</DialogTitle>
            <DialogDescription>
              Evaluate and document the vendor&apos;s risk level.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="assessment-riskLevel">Risk Level *</Label>
              <Select
                value={riskAssessmentData.riskLevel}
                onValueChange={(value) => setRiskAssessmentData({ ...riskAssessmentData, riskLevel: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select risk level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low - Minimal PHI access, strong security</SelectItem>
                  <SelectItem value="MEDIUM">Medium - Moderate PHI access</SelectItem>
                  <SelectItem value="HIGH">High - Significant PHI access</SelectItem>
                  <SelectItem value="CRITICAL">Critical - Extensive PHI access, key dependency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assessment-notes">Assessment Notes</Label>
              <Textarea
                id="assessment-notes"
                value={riskAssessmentData.riskNotes}
                onChange={(e) => setRiskAssessmentData({ ...riskAssessmentData, riskNotes: e.target.value })}
                placeholder="Document your risk assessment rationale..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRiskAssessmentOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRiskAssessmentSubmit}
              disabled={!riskAssessmentData.riskLevel || riskAssessmentMutation.isPending}
            >
              {riskAssessmentMutation.isPending ? 'Saving...' : 'Save Assessment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
