'use client';

/**
 * Epic 14: Patient Portal - Documents List Component
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import {
  FolderOpen,
  FileText,
  Download,
  Eye,
  Image,
  FileCheck,
  GraduationCap,
  Receipt,
  Shield,
  File,
} from 'lucide-react';

const categoryConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  VISIT_SUMMARY: { label: 'Visit Summaries', icon: FileText, color: 'text-[#053e67]' },
  TREATMENT_PLAN: { label: 'Treatment Plans', icon: FileCheck, color: 'text-green-600' },
  LAB_RESULTS: { label: 'Lab Results', icon: FileText, color: 'text-purple-600' },
  IMAGING: { label: 'Imaging', icon: Image, color: 'text-[#053e67]' },
  CONSENT_FORM: { label: 'Consent Forms', icon: FileCheck, color: 'text-orange-600' },
  EDUCATION: { label: 'Education Materials', icon: GraduationCap, color: 'text-[#053e67]' },
  BILLING: { label: 'Billing Documents', icon: Receipt, color: 'text-emerald-600' },
  INSURANCE: { label: 'Insurance', icon: Shield, color: 'text-indigo-600' },
  OTHER: { label: 'Other', icon: File, color: 'text-gray-600' },
};

export function DocumentsList() {
  const [token, setToken] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const { data: documentsData, isLoading } = trpc.portal.listDocuments.useQuery(
    { sessionToken: token!, category: selectedCategory as never, limit: 50 },
    { enabled: !!token }
  );

  const { data: newCount } = trpc.portal.getNewDocumentsCount.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const { data: downloadData, isFetching: isDownloading } = trpc.portal.downloadDocument.useQuery(
    { sessionToken: token!, documentId: downloadingDocId! },
    {
      enabled: !!token && !!downloadingDocId,
      staleTime: 0,
    }
  );

  // Open download when URL is ready
  useEffect(() => {
    if (downloadData?.downloadUrl && downloadingDocId) {
      window.open(downloadData.downloadUrl, '_blank');
      setDownloadingDocId(null);
    }
  }, [downloadData, downloadingDocId]);

  const handleDownload = (documentId: string) => {
    if (!token) return;
    setDownloadingDocId(documentId);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!token) return null;

  const categories = Object.entries(categoryConfig);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-gray-600">
            View and download your health documents
            {newCount && newCount.count > 0 && (
              <Badge variant="secondary" className="ml-2">
                {newCount.count} new
              </Badge>
            )}
          </p>
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs
        defaultValue="all"
        onValueChange={(v) => setSelectedCategory(v === 'all' ? undefined : v)}
      >
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All</TabsTrigger>
          {categories.map(([key, config]) => (
            <TabsTrigger key={key} value={key} className="flex items-center gap-1">
              <config.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{config.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="mt-6">
          {renderDocuments()}
        </TabsContent>
        {categories.map(([key]) => (
          <TabsContent key={key} value={key} className="mt-6">
            {renderDocuments()}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );

  function renderDocuments() {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      );
    }

    if (!documentsData || documentsData.documents.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No documents available</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {documentsData.documents.map((doc) => {
          const config = categoryConfig[doc.category] || categoryConfig.OTHER;
          const Icon = config.icon;
          const isNew = !doc.lastViewedAt;

          return (
            <Card key={doc.id} className={isNew ? 'border-primary/50 bg-primary/5' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg bg-gray-100`}>
                    <Icon className={`h-6 w-6 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{doc.title}</h3>
                      {isNew && (
                        <Badge variant="default" className="bg-primary">
                          New
                        </Badge>
                      )}
                    </div>
                    {doc.description && (
                      <p className="text-sm text-gray-500 truncate">{doc.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                      <span>{format(new Date(doc.createdAt), 'MMM d, yyyy')}</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      <span>{doc.fileName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(doc.id)}
                      disabled={isDownloading && downloadingDocId === doc.id}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }
}
