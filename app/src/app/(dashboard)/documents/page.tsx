'use client';

import { useState } from 'react';
import { FileText, Upload, Search, Filter, FolderOpen, File, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Placeholder document data
const documents = [
  { id: '1', name: 'Patient Intake Form Template', type: 'PDF', size: '245 KB', modified: '2024-01-15', category: 'Forms' },
  { id: '2', name: 'HIPAA Authorization', type: 'PDF', size: '128 KB', modified: '2024-01-14', category: 'Legal' },
  { id: '3', name: 'Treatment Consent Form', type: 'PDF', size: '156 KB', modified: '2024-01-12', category: 'Legal' },
  { id: '4', name: 'Insurance Verification Checklist', type: 'DOCX', size: '89 KB', modified: '2024-01-10', category: 'Insurance' },
  { id: '5', name: 'New Patient Welcome Packet', type: 'PDF', size: '512 KB', modified: '2024-01-08', category: 'Forms' },
];

const categories = ['All', 'Forms', 'Legal', 'Insurance', 'Clinical', 'Marketing'];

export default function DocumentsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

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
        <Button className="bg-[#053e67] hover:bg-blue-800 text-white">
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
              <div key={doc.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-stone-50 transition-colors">
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
                <div className="col-span-2 flex justify-end">
                  <Button variant="ghost" size="icon" className="text-stone-400 hover:text-stone-600">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
