'use client';

/**
 * Mobile Progress Photos Component (US-269)
 *
 * Allows patients to upload and view progress photos
 * with baseline comparisons for visual tracking.
 */

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Image,
  Plus,
  Upload,
  X,
  ZoomIn,
  Grid,
  Columns,
  Star,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface ProgressPhoto {
  id: string;
  photoUrl: string;
  thumbnailUrl?: string;
  photoType: string;
  caption?: string;
  angle?: string;
  bodyArea?: string;
  isBaseline: boolean;
  takenAt: string;
  notes?: string;
}

interface ComparisonData {
  baseline: ProgressPhoto | null;
  current: ProgressPhoto | null;
  hasComparison: boolean;
}

interface PhotoType {
  value: string;
  label: string;
}

interface MobileProgressPhotosProps {
  photos: ProgressPhoto[];
  comparison: ComparisonData | null;
  photoTypes: PhotoType[];
  bodyLocations: Array<{ value: string; label: string }>;
  onUpload: (data: {
    photoUrl: string;
    photoType: string;
    caption?: string;
    bodyArea?: string;
    isBaseline: boolean;
    notes?: string;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onViewPhoto: (id: string) => void;
  isLoading?: boolean;
}

export function MobileProgressPhotos({
  photos,
  comparison,
  photoTypes,
  bodyLocations,
  onUpload,
  onDelete,
  onViewPhoto,
  isLoading = false,
}: MobileProgressPhotosProps) {
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoType, setPhotoType] = useState('');
  const [caption, setCaption] = useState('');
  const [bodyArea, setBodyArea] = useState('');
  const [isBaseline, setIsBaseline] = useState(false);
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setPhotoUrl('');
    setPhotoType('');
    setCaption('');
    setBodyArea('');
    setIsBaseline(false);
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!photoUrl || !photoType) return;

    setIsSubmitting(true);
    try {
      await onUpload({
        photoUrl,
        photoType,
        caption: caption || undefined,
        bodyArea: bodyArea || undefined,
        isBaseline,
        notes: notes || undefined,
      });
      setShowUploadDialog(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhotoClick = (photo: ProgressPhoto) => {
    setSelectedPhoto(photo);
    setShowPhotoViewer(true);
  };

  const getPhotoTypeLabel = (value: string) => {
    const type = photoTypes.find((t) => t.value === value);
    return type?.label || value;
  };

  const getBodyAreaLabel = (value: string) => {
    const area = bodyLocations.find((l) => l.value === value);
    return area?.label || value;
  };

  return (
    <div className="space-y-4 px-4 pb-4">
      {/* Comparison Card */}
      {comparison?.hasComparison && (
        <Card
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setShowCompareDialog(true)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Progress Comparison</CardTitle>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Compare
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                  {comparison.baseline && (
                    <img
                      src={comparison.baseline.thumbnailUrl || comparison.baseline.photoUrl}
                      alt="Baseline"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <p className="text-xs text-center text-gray-500 mt-1">Baseline</p>
              </div>
              <div className="flex items-center">
                <ChevronRight className="w-6 h-6 text-gray-400" />
              </div>
              <div className="flex-1">
                <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                  {comparison.current && (
                    <img
                      src={comparison.current.thumbnailUrl || comparison.current.photoUrl}
                      alt="Current"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <p className="text-xs text-center text-gray-500 mt-1">Current</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Button */}
      <Button
        onClick={() => setShowUploadDialog(true)}
        className="w-full bg-[#053e67] hover:bg-[#042e4e] text-white"
        size="lg"
      >
        <Camera className="w-5 h-5 mr-2" />
        Add Progress Photo
      </Button>

      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          All Photos ({photos.length})
        </h3>
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="p-2"
          >
            <Grid className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="p-2"
          >
            <Columns className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Photos Grid/List */}
      {photos.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Image className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Photos Yet</h3>
            <p className="text-gray-500 text-sm">
              Upload progress photos to track your visual improvements over time.
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer group"
              onClick={() => handlePhotoClick(photo)}
            >
              <img
                src={photo.thumbnailUrl || photo.photoUrl}
                alt={photo.caption || 'Progress photo'}
                className="w-full h-full object-cover"
              />
              {photo.isBaseline && (
                <div className="absolute top-1 left-1">
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-xs truncate">
                  {format(new Date(photo.takenAt), 'MMM d')}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {photos.map((photo) => (
            <Card
              key={photo.id}
              className="cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => handlePhotoClick(photo)}
            >
              <CardContent className="py-3 px-3">
                <div className="flex gap-3">
                  <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={photo.thumbnailUrl || photo.photoUrl}
                      alt={photo.caption || 'Progress photo'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 text-sm">
                        {getPhotoTypeLabel(photo.photoType)}
                      </span>
                      {photo.isBaseline && (
                        <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                          Baseline
                        </Badge>
                      )}
                    </div>
                    {photo.bodyArea && (
                      <p className="text-xs text-gray-500 mb-1">
                        {getBodyAreaLabel(photo.bodyArea)}
                      </p>
                    )}
                    {photo.caption && (
                      <p className="text-sm text-gray-600 truncate">{photo.caption}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(photo.takenAt), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Progress Photo</DialogTitle>
            <DialogDescription>
              Upload a photo to track your visual progress.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Photo URL Input (In real app, would be file upload) */}
            <div className="space-y-2">
              <Label>Photo URL</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter photo URL or upload"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                />
                <Button variant="outline" size="icon">
                  <Upload className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                In the mobile app, you can take a photo or upload from gallery
              </p>
            </div>

            {/* Photo Type */}
            <div className="space-y-2">
              <Label>Photo Type</Label>
              <Select value={photoType} onValueChange={setPhotoType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {photoTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Body Area */}
            <div className="space-y-2">
              <Label>Body Area (optional)</Label>
              <Select value={bodyArea} onValueChange={setBodyArea}>
                <SelectTrigger>
                  <SelectValue placeholder="Select area" />
                </SelectTrigger>
                <SelectContent>
                  {bodyLocations.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <Label>Caption (optional)</Label>
              <Input
                placeholder="Add a description"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>

            {/* Baseline Checkbox */}
            <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <Checkbox
                checked={isBaseline}
                onCheckedChange={(checked) => setIsBaseline(checked === true)}
              />
              <div>
                <div className="font-medium text-sm">Mark as Baseline</div>
                <div className="text-xs text-gray-500">
                  Baseline photos are used for before/after comparisons
                </div>
              </div>
            </label>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!photoUrl || !photoType || isSubmitting}
              className="bg-[#053e67] hover:bg-[#042e4e]"
            >
              {isSubmitting ? 'Uploading...' : 'Save Photo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Viewer Dialog */}
      <Dialog open={showPhotoViewer} onOpenChange={setShowPhotoViewer}>
        <DialogContent className="max-w-lg">
          {selectedPhoto && (
            <>
              <div className="relative">
                <img
                  src={selectedPhoto.photoUrl}
                  alt={selectedPhoto.caption || 'Progress photo'}
                  className="w-full rounded-lg"
                />
                {selectedPhoto.isBaseline && (
                  <Badge className="absolute top-2 left-2 bg-yellow-500">
                    Baseline
                  </Badge>
                )}
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{getPhotoTypeLabel(selectedPhoto.photoType)}</span>
                  <span className="text-sm text-gray-500">
                    {format(new Date(selectedPhoto.takenAt), 'MMM d, yyyy')}
                  </span>
                </div>
                {selectedPhoto.bodyArea && (
                  <p className="text-sm text-gray-600">
                    Area: {getBodyAreaLabel(selectedPhoto.bodyArea)}
                  </p>
                )}
                {selectedPhoto.caption && (
                  <p className="text-gray-700">{selectedPhoto.caption}</p>
                )}
                {selectedPhoto.notes && (
                  <p className="text-sm text-gray-500">{selectedPhoto.notes}</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Comparison Dialog */}
      <Dialog open={showCompareDialog} onOpenChange={setShowCompareDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Progress Comparison</DialogTitle>
          </DialogHeader>
          {comparison?.hasComparison && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                  {comparison.baseline && (
                    <img
                      src={comparison.baseline.photoUrl}
                      alt="Baseline"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p className="font-medium">Baseline</p>
                  {comparison.baseline && (
                    <p className="text-sm text-gray-500">
                      {format(new Date(comparison.baseline.takenAt), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                  {comparison.current && (
                    <img
                      src={comparison.current.photoUrl}
                      alt="Current"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p className="font-medium">Current</p>
                  {comparison.current && (
                    <p className="text-sm text-gray-500">
                      {format(new Date(comparison.current.takenAt), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
