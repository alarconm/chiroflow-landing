'use client';

import { useState } from 'react';
import {
  FileText,
  Image,
  File,
  Download,
  Eye,
  Trash2,
  MoreVertical,
  Shield,
  Loader2,
  Plus,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { DocumentUpload } from './DocumentUpload';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  INSURANCE_CARD_FRONT: 'Insurance Card (Front)',
  INSURANCE_CARD_BACK: 'Insurance Card (Back)',
  PHOTO_ID: 'Photo ID',
  CONSENT_FORM: 'Consent Form',
  INTAKE_FORM: 'Intake Form',
  CLINICAL_NOTE: 'Clinical Note',
  LAB_RESULT: 'Lab Result',
  IMAGING: 'Imaging/X-Ray',
  REFERRAL: 'Referral',
  OTHER: 'Other',
};

interface DocumentListProps {
  patientId: string;
  canDelete?: boolean;
}

export function DocumentList({ patientId, canDelete = false }: DocumentListProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{
    id: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    fileName: string;
  } | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, refetch } = trpc.patient.listDocuments.useQuery({
    patientId,
    type: typeFilter !== 'all' ? typeFilter as 'INSURANCE_CARD_FRONT' | 'INSURANCE_CARD_BACK' | 'PHOTO_ID' | 'CONSENT_FORM' | 'INTAKE_FORM' | 'CLINICAL_NOTE' | 'LAB_RESULT' | 'IMAGING' | 'REFERRAL' | 'OTHER' : undefined,
    limit: 50,
  });

  const documents = data?.documents ?? [];

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/documents/${deleteConfirm.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Delete failed');
      }

      toast.success('Document deleted successfully');
      refetch();
    } catch (error) {
      toast.error(`Failed to delete: ${(error as Error).message}`);
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <Image className="h-8 w-8 text-blue-500" />;
    }
    if (mimeType === 'application/pdf') {
      return <FileText className="h-8 w-8 text-red-500" />;
    }
    return <File className="h-8 w-8 text-gray-500" />;
  };

  const isPreviewable = (mimeType: string): boolean => {
    return mimeType.startsWith('image/') || mimeType === 'application/pdf';
  };

  return (
    <div className="space-y-4">
      {/* Header with filter and upload button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Documents</SelectItem>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && documents.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <File className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No documents found</p>
          <Button
            variant="link"
            className="mt-2"
            onClick={() => setShowUpload(true)}
          >
            Upload your first document
          </Button>
        </div>
      )}

      {/* Document grid */}
      {!isLoading && documents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Thumbnail or icon */}
                <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-muted rounded">
                  {doc.mimeType.startsWith('image/') ? (
                    <img
                      src={`/api/documents/${doc.id}?view=true`}
                      alt={doc.fileName}
                      className="w-12 h-12 object-cover rounded"
                      loading="lazy"
                    />
                  ) : (
                    getFileIcon(doc.mimeType)
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" title={doc.fileName}>
                    {doc.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(doc.fileSize)} • {format(new Date(doc.uploadedAt), 'MMM d, yyyy')}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {DOCUMENT_TYPE_LABELS[doc.type] || doc.type}
                    </Badge>
                    {doc.isConfidential && (
                      <span title="Confidential">
                        <Shield className="h-3 w-3 text-blue-500" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="flex-shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isPreviewable(doc.mimeType) && (
                      <DropdownMenuItem
                        onClick={() =>
                          setPreviewDoc({
                            id: doc.id,
                            fileName: doc.fileName,
                            mimeType: doc.mimeType,
                          })
                        }
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <a href={`/api/documents/${doc.id}`} download={doc.fileName}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </a>
                    </DropdownMenuItem>
                    {canDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            setDeleteConfirm({ id: doc.id, fileName: doc.fileName })
                          }
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Description if present */}
              {doc.description && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {doc.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload documents for this patient. Supported formats: images, PDFs, and Word documents.
            </DialogDescription>
          </DialogHeader>
          <DocumentUpload
            patientId={patientId}
            onUploadComplete={() => {
              setShowUpload(false);
              refetch();
            }}
            onCancel={() => setShowUpload(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewDoc?.fileName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {previewDoc?.mimeType.startsWith('image/') ? (
              <img
                src={`/api/documents/${previewDoc.id}?view=true`}
                alt={previewDoc.fileName}
                className="w-full h-auto"
              />
            ) : previewDoc?.mimeType === 'application/pdf' ? (
              <iframe
                src={`/api/documents/${previewDoc.id}?view=true`}
                className="w-full h-[70vh]"
                title={previewDoc.fileName}
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>
              Close
            </Button>
            <Button asChild>
              <a href={`/api/documents/${previewDoc?.id}`} download={previewDoc?.fileName}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => !deleting && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteConfirm?.fileName}&quot;? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
