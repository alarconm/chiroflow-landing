'use client';

/**
 * VendorList Component
 * Epic 17: Inventory & POS
 *
 * Displays and manages vendors/suppliers.
 */

import { useState, useEffect } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface VendorFormData {
  name: string;
  code: string;
  email: string;
  phone: string;
  addressLine1: string;
  contactName: string;
  website: string;
  notes: string;
  paymentTerms: string;
  taxId: string;
  isActive: boolean;
}

const defaultFormData: VendorFormData = {
  name: '',
  code: '',
  email: '',
  phone: '',
  addressLine1: '',
  contactName: '',
  website: '',
  notes: '',
  paymentTerms: 'Net 30',
  taxId: '',
  isActive: true,
};

interface VendorListProps {
  onSelectVendor?: (vendorId: string) => void;
  onCreatePurchaseOrder?: (vendorId: string) => void;
}

export function VendorList({ onSelectVendor, onCreatePurchaseOrder }: VendorListProps) {
  const utils = trpc.useUtils();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<string | null>(null);
  const [formData, setFormData] = useState<VendorFormData>(defaultFormData);
  const [showInactive, setShowInactive] = useState(false);

  const { data, isLoading } = trpc.inventory.listVendors.useQuery({
    isActive: showInactive ? undefined : true,
  });

  const createMutation = trpc.inventory.createVendor.useMutation({
    onSuccess: () => {
      toast.success('Vendor created successfully');
      utils.inventory.listVendors.invalidate();
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.inventory.updateVendor.useMutation({
    onSuccess: () => {
      toast.success('Vendor updated successfully');
      utils.inventory.listVendors.invalidate();
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.inventory.deleteVendor.useMutation({
    onSuccess: () => {
      toast.success('Vendor deleted successfully');
      utils.inventory.listVendors.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData(defaultFormData);
    setEditingVendor(null);
    setIsDialogOpen(false);
  };

  const { data: vendorDetail } = trpc.inventory.getVendor.useQuery(
    { id: editingVendor || '' },
    { enabled: !!editingVendor }
  );

  // Populate form when vendor data loads
  useEffect(() => {
    if (vendorDetail && editingVendor) {
      setFormData({
        name: vendorDetail.name,
        code: vendorDetail.code || '',
        email: vendorDetail.email || '',
        phone: vendorDetail.phone || '',
        addressLine1: vendorDetail.addressLine1 || '',
        contactName: vendorDetail.contactName || '',
        website: vendorDetail.website || '',
        notes: vendorDetail.notes || '',
        paymentTerms: vendorDetail.paymentTerms || 'Net 30',
        taxId: vendorDetail.taxId || '',
        isActive: vendorDetail.isActive,
      });
    }
  }, [vendorDetail, editingVendor]);

  const handleEdit = (vendorId: string) => {
    setEditingVendor(vendorId);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Vendor name is required');
      return;
    }

    const submitData = {
      name: formData.name,
      code: formData.code || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      addressLine1: formData.addressLine1 || undefined,
      contactName: formData.contactName || undefined,
      website: formData.website || undefined,
      notes: formData.notes || undefined,
      paymentTerms: formData.paymentTerms || undefined,
      taxId: formData.taxId || undefined,
    };

    if (editingVendor) {
      updateMutation.mutate({
        id: editingVendor,
        ...submitData,
        isActive: formData.isActive,
      });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this vendor?')) {
      deleteMutation.mutate({ id });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Vendors</CardTitle>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="showInactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="showInactive">Show Inactive</Label>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>Add Vendor</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingVendor ? 'Edit Vendor' : 'Add Vendor'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Vendor Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="Company name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Vendor Code</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, code: e.target.value }))
                      }
                      placeholder="e.g., VND-001"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contactName">Contact Name</Label>
                    <Input
                      id="contactName"
                      value={formData.contactName}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          contactName: e.target.value,
                        }))
                      }
                      placeholder="Primary contact"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, email: e.target.value }))
                      }
                      placeholder="vendor@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={formData.website}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, website: e.target.value }))
                      }
                      placeholder="https://vendor.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="addressLine1">Address</Label>
                  <Textarea
                    id="addressLine1"
                    value={formData.addressLine1}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, addressLine1: e.target.value }))
                    }
                    placeholder="Full address"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="paymentTerms">Payment Terms</Label>
                    <Input
                      id="paymentTerms"
                      value={formData.paymentTerms}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          paymentTerms: e.target.value,
                        }))
                      }
                      placeholder="Net 30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxId">Tax ID</Label>
                    <Input
                      id="taxId"
                      value={formData.taxId}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, taxId: e.target.value }))
                      }
                      placeholder="Tax identification number"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Internal notes about this vendor"
                    rows={2}
                  />
                </div>

                {editingVendor && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, isActive: checked }))
                      }
                    />
                    <Label htmlFor="isActive">Active Vendor</Label>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? 'Saving...'
                      : editingVendor
                      ? 'Update Vendor'
                      : 'Create Vendor'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : !data?.vendors.length ? (
          <div className="text-center text-muted-foreground py-8">
            No vendors found. Add your first vendor to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {data.vendors.map((vendor) => (
              <div
                key={vendor.id}
                className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                onClick={() => onSelectVendor?.(vendor.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{vendor.name}</span>
                      {vendor.code && (
                        <Badge variant="outline">{vendor.code}</Badge>
                      )}
                      {!vendor.isActive && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {vendor.contactName && (
                        <span className="mr-4">{vendor.contactName}</span>
                      )}
                      {vendor.email && <span className="mr-4">{vendor.email}</span>}
                      {vendor.phone && <span>{vendor.phone}</span>}
                    </div>
                    {vendor.paymentTerms && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Payment: {vendor.paymentTerms}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {vendor.productCount || 0} products
                    </Badge>
                    {onCreatePurchaseOrder && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreatePurchaseOrder(vendor.id);
                        }}
                      >
                        Create PO
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(vendor.id);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(vendor.id);
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
