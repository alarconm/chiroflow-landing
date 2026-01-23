'use client';

import { useState, useRef } from 'react';
import { FileText, Upload, Search, Filter, FolderOpen, File, MoreVertical, Download, Eye, Pencil, Trash2, X, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Placeholder document data
const documents = [
  { id: '1', name: 'Patient Intake Form Template', type: 'PDF', size: '245 KB', modified: '2024-01-15', category: 'Forms' },
  { id: '2', name: 'HIPAA Authorization', type: 'PDF', size: '128 KB', modified: '2024-01-14', category: 'Legal' },
  { id: '3', name: 'Treatment Consent Form', type: 'PDF', size: '156 KB', modified: '2024-01-12', category: 'Legal' },
  { id: '4', name: 'Insurance Verification Checklist', type: 'DOCX', size: '89 KB', modified: '2024-01-10', category: 'Insurance' },
  { id: '5', name: 'New Patient Welcome Packet', type: 'PDF', size: '512 KB', modified: '2024-01-08', category: 'Forms' },
];

const categories = ['All', 'Forms', 'Legal', 'Insurance', 'Clinical', 'Marketing'];

type Document = {
  id: string;
  name: string;
  type: string;
  size: string;
  modified: string;
  category: string;
};

export default function DocumentsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleViewDocument = (doc: Document) => {
    setSelectedDocument(doc);
    setIsViewDialogOpen(true);
  };

  const handleOpenUploadDialog = () => {
    setSelectedFile(null);
    setUploadCategory('');
    setUploadSuccess(false);
    setIsUploadDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadCategory) return;

    setIsUploading(true);

    // Simulate upload process
    await new Promise(resolve => setTimeout(resolve, 1500));

    setIsUploading(false);
    setUploadSuccess(true);

    // Reset after showing success
    setTimeout(() => {
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadCategory('');
      setUploadSuccess(false);
    }, 1500);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownloadDocument = (doc: Document) => {
    // In a real app, this would trigger a download
    alert(`Downloading ${doc.name}...`);
  };

  const handleEditDocument = (doc: Document) => {
    // In a real app, this would open an edit dialog
    alert(`Editing ${doc.name}...`);
  };

  const handleDeleteDocument = (doc: Document) => {
    // In a real app, this would show a confirmation dialog and delete
    if (confirm(`Are you sure you want to delete "${doc.name}"?`)) {
      alert(`Deleted ${doc.name}`);
    }
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Documents</h1>
          <p className="text-stone-500 mt-1">Manage practice documents and templates</p>
        </div>
        <Button
          className="bg-[#053e67] hover:bg-blue-800 text-white"
          onClick={handleOpenUploadDialog}
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 border-stone-200 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Documents Grid */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-stone-50 border-b border-stone-200 text-xs font-medium text-stone-500 uppercase tracking-wider">
          <div className="col-span-6">Name</div>
          <div className="col-span-2 hidden sm:block">Category</div>
          <div className="col-span-2 hidden sm:block">Modified</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {filteredDocuments.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FolderOpen className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-500">No documents found</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-stone-50 transition-colors cursor-pointer"
                onClick={() => handleViewDocument(doc)}
              >
                <div className="col-span-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <File className="w-5 h-5 text-[#053e67]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-900">{doc.name}</p>
                    <p className="text-xs text-stone-500">{doc.type} • {doc.size}</p>
                  </div>
                </div>
                <div className="col-span-2 hidden sm:block">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-700">
                    {doc.category}
                  </span>
                </div>
                <div className="col-span-2 hidden sm:block text-sm text-stone-500">
                  {doc.modified}
                </div>
                <div className="col-span-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-stone-400 hover:text-stone-600">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleViewDocument(doc)}>
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadDocument(doc)}>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEditDocument(doc)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteDocument(doc)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Document Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <File className="w-5 h-5 text-[#053e67]" />
              </div>
              <span>{selectedDocument?.name}</span>
            </DialogTitle>
            <DialogDescription>
              Document details and preview
            </DialogDescription>
          </DialogHeader>

          {selectedDocument && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-stone-500">Type</p>
                  <p className="font-medium">{selectedDocument.type}</p>
                </div>
                <div>
                  <p className="text-stone-500">Size</p>
                  <p className="font-medium">{selectedDocument.size}</p>
                </div>
                <div>
                  <p className="text-stone-500">Category</p>
                  <p className="font-medium">{selectedDocument.category}</p>
                </div>
                <div>
                  <p className="text-stone-500">Modified</p>
                  <p className="font-medium">{selectedDocument.modified}</p>
                </div>
              </div>

              {/* Preview placeholder */}
              <div className="border border-stone-200 rounded-lg p-8 bg-stone-50 text-center">
                <FileText className="w-16 h-16 text-stone-300 mx-auto mb-4" />
                <p className="text-stone-500 text-sm">Document preview would appear here</p>
                <p className="text-stone-400 text-xs mt-1">Connect to a document storage service to enable previews</p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
                <Button
                  className="bg-[#053e67] hover:bg-blue-800"
                  onClick={() => handleDownloadDocument(selectedDocument)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Upload className="w-5 h-5 text-[#053e67]" />
              </div>
              <span>Upload Document</span>
            </DialogTitle>
            <DialogDescription>
              Upload a new document to your practice library
            </DialogDescription>
          </DialogHeader>

          {uploadSuccess ? (
            <div className="py-8 text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium text-stone-900">Upload Successful!</p>
              <p className="text-stone-500 text-sm mt-1">Your document has been added</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                  selectedFile
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-stone-200 hover:border-blue-300 hover:bg-stone-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                  onChange={handleFileSelect}
                />
                {selectedFile ? (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mx-auto">
                      <File className="w-6 h-6 text-[#053e67]" />
                    </div>
                    <p className="font-medium text-stone-900">{selectedFile.name}</p>
                    <p className="text-sm text-stone-500">{formatFileSize(selectedFile.size)}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="text-stone-500 hover:text-stone-700"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-10 h-10 text-stone-300 mx-auto" />
                    <p className="text-stone-600">Click to select a file</p>
                    <p className="text-xs text-stone-400">
                      PDF, DOC, DOCX, XLS, XLSX, TXT, PNG, JPG up to 10MB
                    </p>
                  </div>
                )}
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Forms">Forms</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                    <SelectItem value="Insurance">Insurance</SelectItem>
                    <SelectItem value="Clinical">Clinical</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!uploadSuccess && (
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setIsUploadDialogOpen(false)}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                className="bg-[#053e67] hover:bg-blue-800"
                onClick={handleUpload}
                disabled={!selectedFile || !uploadCategory || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
