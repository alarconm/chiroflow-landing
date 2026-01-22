'use client';

/**
 * CategoryManager Component
 * Epic 17: Inventory & POS
 *
 * Manages product categories with hierarchical structure.
 */

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface CategoryFormData {
  name: string;
  description: string;
  parentId?: string;
  isActive: boolean;
}

export function CategoryManager() {
  const utils = trpc.useUtils();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
    parentId: undefined,
    isActive: true,
  });

  const { data: categories, isLoading } = trpc.inventory.listCategories.useQuery({
    includeInactive: true,
    asTree: false,
  });

  const createMutation = trpc.inventory.createCategory.useMutation({
    onSuccess: () => {
      toast.success('Category created successfully');
      utils.inventory.listCategories.invalidate();
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.inventory.updateCategory.useMutation({
    onSuccess: () => {
      toast.success('Category updated successfully');
      utils.inventory.listCategories.invalidate();
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.inventory.deleteCategory.useMutation({
    onSuccess: () => {
      toast.success('Category deleted successfully');
      utils.inventory.listCategories.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      parentId: undefined,
      isActive: true,
    });
    setEditingCategory(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (category: NonNullable<typeof categories>[number]) => {
    setEditingCategory(category.id);
    setFormData({
      name: category.name,
      description: category.description || '',
      parentId: ('parentId' in category ? category.parentId : undefined) || undefined,
      isActive: category.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    if (editingCategory) {
      updateMutation.mutate({
        id: editingCategory,
        name: formData.name,
        description: formData.description || undefined,
        parentId: formData.parentId,
        isActive: formData.isActive,
      });
    } else {
      // Generate a slug from the name
      const slug = formData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      createMutation.mutate({
        name: formData.name,
        slug,
        description: formData.description || undefined,
        parentId: formData.parentId,
      });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this category?')) {
      deleteMutation.mutate({ id });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Get parent category name
  const getParentName = (parentId: string | null) => {
    if (!parentId || !categories) return null;
    const parent = categories.find((c) => c.id === parentId);
    return parent?.name || null;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Product Categories</CardTitle>
          <CardDescription>Organize products into categories</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>Add Category</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Category name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Optional description"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parentId">Parent Category</Label>
                <Select
                  value={formData.parentId || 'none'}
                  onValueChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      parentId: v === 'none' ? undefined : v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Parent (Root)</SelectItem>
                    {Array.isArray(categories) &&
                      categories
                        .filter((c) => c.id !== editingCategory)
                        .map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
              {editingCategory && (
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, isActive: checked }))
                    }
                  />
                  <Label htmlFor="isActive">Active</Label>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? 'Saving...'
                    : editingCategory
                    ? 'Update'
                    : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">
            Loading categories...
          </div>
        ) : !categories?.length ? (
          <div className="text-center text-muted-foreground py-8">
            No categories yet. Create your first category to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {category.name}
                      {!category.isActive && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    {category.description && (
                      <div className="text-sm text-muted-foreground">
                        {category.description}
                      </div>
                    )}
                    {'parentId' in category && category.parentId && (
                      <div className="text-xs text-muted-foreground">
                        Parent: {getParentName(category.parentId)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {('productCount' in category ? category.productCount : (category as { _count?: { products: number } })._count?.products) || 0} products
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(category)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(category.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
