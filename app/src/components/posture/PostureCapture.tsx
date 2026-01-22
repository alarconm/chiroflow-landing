'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Camera,
  Upload,
  X,
  RotateCcw,
  Check,
  Image as ImageIcon,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PosturePositioningGuide } from './PosturePositioningGuide';

const POSTURE_VIEWS = [
  {
    value: 'ANTERIOR',
    label: 'Anterior (Front)',
    description: 'Front-facing view',
  },
  {
    value: 'POSTERIOR',
    label: 'Posterior (Back)',
    description: 'Back view',
  },
  {
    value: 'LATERAL_LEFT',
    label: 'Left Lateral',
    description: 'Left side view',
  },
  {
    value: 'LATERAL_RIGHT',
    label: 'Right Lateral',
    description: 'Right side view',
  },
] as const;

type PostureView = typeof POSTURE_VIEWS[number]['value'];

interface CapturedImage {
  id: string;
  file?: File;
  preview: string;
  view: PostureView;
  notes: string;
  isUploaded: boolean;
  isUploading: boolean;
  uploadedId?: string;
}

interface PostureCaptureProps {
  patientId: string;
  assessmentId?: string;
  encounterId?: string;
  onComplete?: (assessmentId: string) => void;
  onCancel?: () => void;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

export function PostureCapture({
  patientId,
  assessmentId,
  encounterId,
  onComplete,
  onCancel,
}: PostureCaptureProps) {
  const [mode, setMode] = useState<'select' | 'camera' | 'upload'>('select');
  const [selectedView, setSelectedView] = useState<PostureView>('ANTERIOR');
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAssessmentId, setCurrentAssessmentId] = useState<string | undefined>(assessmentId);
  const [showGuide, setShowGuide] = useState(true);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraReady(true);
      }
    } catch (error) {
      console.error('Camera access error:', error);
      setCameraError(
        'Unable to access camera. Please ensure camera permissions are granted.'
      );
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraReady(false);
  }, []);

  // Capture photo from camera
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Set canvas size to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    canvas.toBlob(
      (blob) => {
        if (!blob) return;

        const file = new File([blob], `posture_${selectedView}_${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });

        const newImage: CapturedImage = {
          id: `img_${Date.now()}`,
          file,
          preview: URL.createObjectURL(blob),
          view: selectedView,
          notes: '',
          isUploaded: false,
          isUploading: false,
        };

        setCapturedImages((prev) => [...prev, newImage]);
        toast.success(`${POSTURE_VIEWS.find(v => v.value === selectedView)?.label} captured`);

        // Auto-advance to next view if applicable
        const currentIndex = POSTURE_VIEWS.findIndex(v => v.value === selectedView);
        const nextView = POSTURE_VIEWS[currentIndex + 1];
        if (nextView) {
          setSelectedView(nextView.value);
        }
      },
      'image/jpeg',
      0.9
    );
  }, [selectedView]);

  // Handle file drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newImages: CapturedImage[] = acceptedFiles.map((file) => ({
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        preview: URL.createObjectURL(file),
        view: selectedView,
        notes: '',
        isUploaded: false,
        isUploading: false,
      }));

      setCapturedImages((prev) => [...prev, ...newImages]);

      if (newImages.length > 1) {
        toast.info(`${newImages.length} images added. Please assign views to each.`);
      }
    },
    [selectedView]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    onDropRejected: (rejections) => {
      rejections.forEach((rejection) => {
        rejection.errors.forEach((error) => {
          if (error.code === 'file-too-large') {
            toast.error(`${rejection.file.name} is too large. Max size is 20MB.`);
          } else if (error.code === 'file-invalid-type') {
            toast.error(`${rejection.file.name} is not an allowed file type.`);
          }
        });
      });
    },
  });

  // Update image view
  const updateImageView = (imageId: string, view: PostureView) => {
    setCapturedImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, view } : img))
    );
  };

  // Update image notes
  const updateImageNotes = (imageId: string, notes: string) => {
    setCapturedImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, notes } : img))
    );
  };

  // Remove image
  const removeImage = (imageId: string) => {
    setCapturedImages((prev) => {
      const img = prev.find((i) => i.id === imageId);
      if (img?.preview) {
        URL.revokeObjectURL(img.preview);
      }
      return prev.filter((i) => i.id !== imageId);
    });
  };

  // Upload all images
  const uploadImages = async () => {
    const imagesToUpload = capturedImages.filter((img) => !img.isUploaded && img.file);

    if (imagesToUpload.length === 0) {
      toast.error('No images to upload');
      return;
    }

    setIsProcessing(true);
    let successCount = 0;
    let errorCount = 0;
    let newAssessmentId = currentAssessmentId;

    for (const image of imagesToUpload) {
      // Mark as uploading
      setCapturedImages((prev) =>
        prev.map((img) =>
          img.id === image.id ? { ...img, isUploading: true } : img
        )
      );

      const formData = new FormData();
      formData.append('file', image.file!);
      formData.append('patientId', patientId);
      formData.append('view', image.view);
      formData.append('notes', image.notes);

      if (newAssessmentId) {
        formData.append('assessmentId', newAssessmentId);
      } else {
        formData.append('createAssessment', 'true');
      }

      if (encounterId) {
        formData.append('encounterId', encounterId);
      }

      try {
        const response = await fetch('/api/posture/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Upload failed');
        }

        const data = await response.json();

        // Update assessment ID if this was a new one
        if (!newAssessmentId && data.assessment?.id) {
          newAssessmentId = data.assessment.id;
          setCurrentAssessmentId(newAssessmentId);
        }

        // Mark as uploaded
        setCapturedImages((prev) =>
          prev.map((img) =>
            img.id === image.id
              ? { ...img, isUploading: false, isUploaded: true, uploadedId: data.image.id }
              : img
          )
        );

        successCount++;
      } catch (error) {
        console.error('Upload error:', error);
        toast.error(`Failed to upload ${image.view}: ${(error as Error).message}`);

        // Mark upload failed
        setCapturedImages((prev) =>
          prev.map((img) =>
            img.id === image.id ? { ...img, isUploading: false } : img
          )
        );

        errorCount++;
      }
    }

    setIsProcessing(false);

    if (successCount > 0) {
      toast.success(`Successfully uploaded ${successCount} image(s)`);
    }

    if (errorCount > 0 && successCount === 0) {
      toast.error(`Failed to upload ${errorCount} image(s)`);
    }
  };

  // Complete session
  const handleComplete = () => {
    if (currentAssessmentId) {
      onComplete?.(currentAssessmentId);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      // Revoke all preview URLs
      capturedImages.forEach((img) => {
        if (img.preview) {
          URL.revokeObjectURL(img.preview);
        }
      });
    };
  }, [stopCamera, capturedImages]);

  // Effect to start/stop camera based on mode
  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
  }, [mode, startCamera, stopCamera]);

  const hasUnuploadedImages = capturedImages.some((img) => !img.isUploaded);
  const allImagesUploaded = capturedImages.length > 0 && capturedImages.every((img) => img.isUploaded);

  return (
    <div className="space-y-6">
      {/* Mode Selection */}
      {mode === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Capture Posture Photos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose how you want to capture posture photos for analysis.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="outline"
                size="lg"
                className="h-24 flex-col gap-2"
                onClick={() => setMode('camera')}
              >
                <Camera className="h-8 w-8" />
                <span>Use Camera</span>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-24 flex-col gap-2"
                onClick={() => setMode('upload')}
              >
                <Upload className="h-8 w-8" />
                <span>Upload Files</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Camera Mode */}
      {mode === 'camera' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Camera Capture
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedView}
                  onValueChange={(v) => setSelectedView(v as PostureView)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POSTURE_VIEWS.map((view) => (
                      <SelectItem key={view.value} value={view.value}>
                        {view.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowGuide(!showGuide)}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {showGuide ? 'Hide' : 'Show'} positioning guide
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {cameraError ? (
              <div className="bg-red-50 text-red-700 p-4 rounded-lg text-center">
                <p>{cameraError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={startCamera}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : (
              <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
                {showGuide && isCameraReady && (
                  <PosturePositioningGuide view={selectedView} />
                )}
                <canvas ref={canvasRef} className="hidden" />

                {!isCameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setMode('select')}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                size="lg"
                onClick={capturePhoto}
                disabled={!isCameraReady}
                className="px-8"
              >
                <Camera className="h-5 w-5 mr-2" />
                Capture {POSTURE_VIEWS.find(v => v.value === selectedView)?.label}
              </Button>
              <Button
                variant="outline"
                onClick={() => setMode('upload')}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Mode */}
      {mode === 'upload' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Photos
              </CardTitle>
              <Select
                value={selectedView}
                onValueChange={(v) => setSelectedView(v as PostureView)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSTURE_VIEWS.map((view) => (
                    <SelectItem key={view.value} value={view.value}>
                      {view.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              {isDragActive ? (
                <p className="text-primary font-medium">Drop files here...</p>
              ) : (
                <>
                  <p className="font-medium">Drag & drop posture photos here</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to select files
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Supported: JPEG, PNG, WebP (max 20MB)
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setMode('select')}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button variant="outline" onClick={() => setMode('camera')}>
                <Camera className="h-4 w-4 mr-2" />
                Use Camera
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Captured Images Grid */}
      {capturedImages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              Captured Images ({capturedImages.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {capturedImages.map((image) => (
                <div
                  key={image.id}
                  className={cn(
                    'relative border rounded-lg overflow-hidden',
                    image.isUploaded && 'ring-2 ring-green-500',
                    image.isUploading && 'opacity-50'
                  )}
                >
                  <img
                    src={image.preview}
                    alt={`Posture ${image.view}`}
                    className="w-full aspect-[3/4] object-cover"
                  />

                  {/* View selector overlay */}
                  <div className="absolute top-0 left-0 right-0 p-1 bg-gradient-to-b from-black/50 to-transparent">
                    <Select
                      value={image.view}
                      onValueChange={(v) => updateImageView(image.id, v as PostureView)}
                      disabled={image.isUploaded || image.isUploading}
                    >
                      <SelectTrigger className="h-7 text-xs bg-white/90">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POSTURE_VIEWS.map((view) => (
                          <SelectItem key={view.value} value={view.value}>
                            {view.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status indicators */}
                  <div className="absolute bottom-2 right-2 flex gap-1">
                    {image.isUploading && (
                      <div className="bg-blue-500 text-white rounded-full p-1">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                    {image.isUploaded && (
                      <div className="bg-green-500 text-white rounded-full p-1">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  {/* Delete button */}
                  {!image.isUploaded && !image.isUploading && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => removeImage(image.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Notes for each image (expandable) */}
            <div className="mt-4 space-y-2">
              {capturedImages.map((image) => (
                <div key={`notes-${image.id}`} className="flex items-start gap-2">
                  <Label className="text-sm w-32 pt-2">
                    {POSTURE_VIEWS.find(v => v.value === image.view)?.label}:
                  </Label>
                  <Textarea
                    placeholder="Add notes for this image..."
                    value={image.notes}
                    onChange={(e) => updateImageNotes(image.id, e.target.value)}
                    disabled={image.isUploaded}
                    className="flex-1 text-sm h-16"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex gap-2">
          {hasUnuploadedImages && (
            <Button onClick={uploadImages} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload {capturedImages.filter((i) => !i.isUploaded).length} Images
                </>
              )}
            </Button>
          )}
          {allImagesUploaded && (
            <Button onClick={handleComplete}>
              <Check className="h-4 w-4 mr-2" />
              Complete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
