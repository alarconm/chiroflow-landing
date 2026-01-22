'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import {
  FileText,
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Copy,
  Archive,
  ArchiveRestore,
  Eye,
  CheckCircle,
  Clock,
} from 'lucide-react';

export default function FormsPage() {
  const { isAtLeast } = usePermissions();
  const canEdit = isAtLeast('ADMIN');

  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [templateToArchive, setTemplateToArchive] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: templates, isLoading } = trpc.formTemplate.list.useQuery({
    includeInactive: showArchived,
  });

  const duplicateMutation = trpc.formTemplate.duplicate.useMutation({
    onSuccess: () => {
      toast.success('Template duplicated successfully');
      utils.formTemplate.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to duplicate template');
    },
  });

  const archiveMutation = trpc.formTemplate.archive.useMutation({
    onSuccess: () => {
      toast.success('Template archived');
      utils.formTemplate.list.invalidate();
      setTemplateToArchive(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to archive template');
    },
  });

  const restoreMutation = trpc.formTemplate.restore.useMutation({
    onSuccess: () => {
      toast.success('Template restored');
      utils.formTemplate.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to restore template');
    },
  });

  const filteredTemplates = templates?.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#053e67]/50"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Intake Forms</h1>
          <p className="text-gray-500 mt-1">
            Create and manage patient intake forms for paperless onboarding.
          </p>
        </div>
        {canEdit && (
          <Button asChild className="bg-gradient-to-r from-[#053e67]/50 to-[#053e67] hover:from-[#053e67] hover:to-[#053e67]/90">
            <Link href="/settings/forms/new">
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Link>
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant={showArchived ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowArchived(!showArchived)}
        >
          <Archive className="h-4 w-4 mr-2" />
          {showArchived ? 'Showing Archived' : 'Show Archived'}
        </Button>
      </div>

      {/* Template List */}
      {filteredTemplates?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {searchQuery ? 'No templates found' : 'No templates yet'}
            </h3>
            <p className="text-gray-500 text-center max-w-sm">
              {searchQuery
                ? 'Try adjusting your search terms.'
                : 'Create your first intake form template to start collecting patient information digitally.'}
            </p>
            {!searchQuery && canEdit && (
              <Button asChild className="mt-4">
                <Link href="/settings/forms/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates?.map((template) => (
            <Card
              key={template.id}
              className={`relative group hover:shadow-md transition-shadow ${
                !template.isActive ? 'opacity-60' : ''
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-[#053e67]/50" />
                    <CardTitle className="text-base">{template.name}</CardTitle>
                  </div>
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/settings/forms/${template.id}`}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/settings/forms/${template.id}/preview`}>
                            <Eye className="h-4 w-4 mr-2" />
                            Preview
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => duplicateMutation.mutate({ id: template.id })}
                          disabled={duplicateMutation.isPending}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {template.isActive ? (
                          <DropdownMenuItem
                            onClick={() => setTemplateToArchive(template.id)}
                            className="text-red-600"
                            disabled={template.isSystem}
                          >
                            <Archive className="h-4 w-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => restoreMutation.mutate({ id: template.id })}
                            disabled={restoreMutation.isPending}
                          >
                            <ArchiveRestore className="h-4 w-4 mr-2" />
                            Restore
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <CardDescription className="line-clamp-2">
                  {template.description || 'No description'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {template.publishedAt ? (
                      <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Published
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        Draft
                      </Badge>
                    )}
                    {template.isSystem && (
                      <Badge variant="outline" className="text-[#053e67] border-[#053e67]/30">
                        System
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">v{template.version}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
                  <span>
                    {template.fields?.length || 0} field{(template.fields?.length || 0) !== 1 ? 's' : ''}
                  </span>
                  <span>
                    {template.sections?.length || 0} section{(template.sections?.length || 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={!!templateToArchive} onOpenChange={() => setTemplateToArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the template from active use. Existing submissions will be preserved.
              You can restore it later from the archived templates.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => templateToArchive && archiveMutation.mutate({ id: templateToArchive })}
              className="bg-red-600 hover:bg-red-700"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
