'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Crosshair,
  RefreshCw,
  Plus,
  Trash2,
  Undo,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  Loader2,
  CheckCircle,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  LANDMARK_DEFINITIONS,
  LANDMARK_GROUPS,
  getLandmarksForView,
  type LandmarkName,
  type PostureView,
} from '@/lib/services/landmarkDetection';
import { trpc } from '@/trpc/client';

interface Landmark {
  id: string;
  name: string;
  x: number;
  y: number;
  confidence: number | null;
  isManual: boolean;
  originalX: number | null;
  originalY: number | null;
}

interface LandmarkEditorProps {
  imageId: string;
  imageUrl: string;
  view: PostureView;
  onSave?: () => void;
}

export function LandmarkEditor({
  imageId,
  imageUrl,
  view,
  onSave,
}: LandmarkEditorProps) {
  // State
  const [selectedLandmark, setSelectedLandmark] = useState<string | null>(null);
  const [isAddingLandmark, setIsAddingLandmark] = useState(false);
  const [newLandmarkType, setNewLandmarkType] = useState<LandmarkName | null>(null);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggedLandmark, setDraggedLandmark] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // tRPC queries and mutations
  const utils = trpc.useUtils();

  const {
    data: landmarkData,
    isLoading: isLoadingLandmarks,
    refetch: refetchLandmarks,
  } = trpc.posture.getLandmarks.useQuery({ imageId });

  const { data: definitions } = trpc.posture.getLandmarkDefinitions.useQuery({ view });

  const analyzeMutation = trpc.posture.analyzeLandmarks.useMutation({
    onSuccess: (data: { message: string }) => {
      toast.success(data.message);
      refetchLandmarks();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  const updateLandmarkMutation = trpc.posture.updateLandmark.useMutation({
    onSuccess: () => {
      setHasUnsavedChanges(false);
      refetchLandmarks();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  const addLandmarkMutation = trpc.posture.addLandmark.useMutation({
    onSuccess: () => {
      setIsAddingLandmark(false);
      setNewLandmarkType(null);
      refetchLandmarks();
      toast.success('Landmark added');
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  const deleteLandmarkMutation = trpc.posture.deleteLandmark.useMutation({
    onSuccess: () => {
      setSelectedLandmark(null);
      refetchLandmarks();
      toast.success('Landmark deleted');
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  const resetLandmarkMutation = trpc.posture.resetLandmark.useMutation({
    onSuccess: () => {
      refetchLandmarks();
      toast.success('Landmark reset to AI position');
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  const landmarks: Landmark[] = landmarkData?.landmarks || [];
  const applicableLandmarks = getLandmarksForView(view);

  // Get missing landmarks (not yet placed)
  const placedLandmarkNames = new Set(landmarks.map((l) => l.name));
  const missingLandmarks = applicableLandmarks.filter(
    (name) => !placedLandmarkNames.has(name)
  );

  // Convert normalized coordinates to pixel coordinates
  const getPixelCoords = useCallback(
    (x: number, y: number) => {
      if (!imageRef.current) return { px: 0, py: 0 };
      const rect = imageRef.current.getBoundingClientRect();
      return {
        px: x * rect.width,
        py: y * rect.height,
      };
    },
    []
  );

  // Convert pixel coordinates to normalized coordinates
  const getNormalizedCoords = useCallback(
    (px: number, py: number) => {
      if (!imageRef.current) return { x: 0, y: 0 };
      const rect = imageRef.current.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, px / rect.width)),
        y: Math.max(0, Math.min(1, py / rect.height)),
      };
    },
    []
  );

  // Handle landmark drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, landmarkId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggedLandmark(landmarkId);
      setSelectedLandmark(landmarkId);
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggedLandmark || !imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { x, y } = getNormalizedCoords(px, py);

      // Update local state for visual feedback (will be saved on mouse up)
      setHasUnsavedChanges(true);
    },
    [draggedLandmark, getNormalizedCoords]
  );

  const handleMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      if (!draggedLandmark || !imageRef.current) {
        setDraggedLandmark(null);
        return;
      }

      const rect = imageRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { x, y } = getNormalizedCoords(px, py);

      // Save the new position
      updateLandmarkMutation.mutate({
        landmarkId: draggedLandmark,
        x,
        y,
      });

      setDraggedLandmark(null);
    },
    [draggedLandmark, getNormalizedCoords, updateLandmarkMutation]
  );

  // Handle adding new landmark
  const handleImageClick = useCallback(
    async (e: React.MouseEvent) => {
      if (!isAddingLandmark || !newLandmarkType || !imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { x, y } = getNormalizedCoords(px, py);

      addLandmarkMutation.mutate({
        imageId,
        name: newLandmarkType,
        x,
        y,
      });
    },
    [isAddingLandmark, newLandmarkType, imageId, getNormalizedCoords, addLandmarkMutation]
  );

  // Run AI analysis
  const runAnalysis = useCallback(
    (forceReanalyze = false) => {
      analyzeMutation.mutate({ imageId, forceReanalyze });
    },
    [analyzeMutation, imageId]
  );

  // Get landmark color based on group
  const getLandmarkColor = (name: string): string => {
    const def = LANDMARK_DEFINITIONS[name as LandmarkName];
    if (!def) return '#888888';
    const group = LANDMARK_GROUPS[def.group];
    return group?.color || '#888888';
  };

  // Get confidence badge variant
  const getConfidenceBadge = (confidence: number | null) => {
    if (confidence === null) return null;
    if (confidence >= 0.8) return { variant: 'default' as const, label: 'High' };
    if (confidence >= 0.5) return { variant: 'secondary' as const, label: 'Medium' };
    return { variant: 'destructive' as const, label: 'Low' };
  };

  const selectedLandmarkData = landmarks.find((l) => l.id === selectedLandmark);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Analysis Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => runAnalysis(false)}
                    disabled={analyzeMutation.isPending}
                  >
                    {analyzeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Crosshair className="h-4 w-4 mr-2" />
                    )}
                    Detect Landmarks
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Run AI landmark detection</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {landmarks.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAnalysis(true)}
                      disabled={analyzeMutation.isPending}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Re-analyze
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Re-run detection (replaces existing)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <div className="h-6 w-px bg-border mx-1" />

            {/* Add Landmark */}
            {missingLandmarks.length > 0 && (
              <div className="flex items-center gap-2">
                <Select
                  value={newLandmarkType || ''}
                  onValueChange={(v) => {
                    setNewLandmarkType(v as LandmarkName);
                    setIsAddingLandmark(true);
                  }}
                >
                  <SelectTrigger className="h-8 w-[200px]">
                    <Plus className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Add landmark..." />
                  </SelectTrigger>
                  <SelectContent>
                    {missingLandmarks.map((name) => {
                      const def = LANDMARK_DEFINITIONS[name];
                      return (
                        <SelectItem key={name} value={name}>
                          {def.name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {isAddingLandmark && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsAddingLandmark(false);
                      setNewLandmarkType(null);
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            )}

            <div className="flex-1" />

            {/* View Controls */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setShowLandmarks(!showLandmarks)}
                  >
                    {showLandmarks ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showLandmarks ? 'Hide' : 'Show'} landmarks
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setZoom(Math.min(zoom + 0.25, 3))}
                    disabled={zoom >= 3}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom in</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setZoom(Math.max(zoom - 0.25, 0.5))}
                    disabled={zoom <= 0.5}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom out</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Adding landmark instruction */}
          {isAddingLandmark && newLandmarkType && (
            <div className="mt-3 p-2 bg-blue-50 rounded-md text-sm text-blue-700 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Click on the image to place{' '}
              <strong>{LANDMARK_DEFINITIONS[newLandmarkType].name}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image and Landmarks */}
      <div className="grid grid-cols-[1fr_300px] gap-4">
        {/* Image Container */}
        <Card>
          <CardContent className="p-0 overflow-hidden">
            <div
              ref={containerRef}
              className={cn(
                'relative bg-gray-900 overflow-auto',
                isAddingLandmark && 'cursor-crosshair'
              )}
              style={{ maxHeight: '600px' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => setDraggedLandmark(null)}
            >
              <div
                style={{
                  transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                  transformOrigin: 'top left',
                }}
              >
                <div className="relative inline-block">
                  <img
                    ref={imageRef}
                    src={imageUrl}
                    alt="Posture analysis"
                    className="max-w-full"
                    onClick={handleImageClick}
                    draggable={false}
                  />

                  {/* Landmark markers */}
                  {showLandmarks &&
                    !isLoadingLandmarks &&
                    landmarks.map((landmark) => {
                      const color = getLandmarkColor(landmark.name);
                      const def = LANDMARK_DEFINITIONS[landmark.name as LandmarkName];
                      const isSelected = selectedLandmark === landmark.id;

                      return (
                        <div
                          key={landmark.id}
                          className={cn(
                            'absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 cursor-move transition-all',
                            isSelected
                              ? 'ring-2 ring-white ring-offset-2 z-20'
                              : 'hover:scale-125 z-10'
                          )}
                          style={{
                            left: `${landmark.x * 100}%`,
                            top: `${landmark.y * 100}%`,
                            backgroundColor: color,
                            borderColor: landmark.isManual ? '#ffffff' : color,
                          }}
                          onMouseDown={(e) => handleMouseDown(e, landmark.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLandmark(landmark.id);
                          }}
                          title={def?.name || landmark.name}
                        >
                          {/* Confidence indicator */}
                          {landmark.confidence !== null && landmark.confidence < 0.5 && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" />
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {isLoadingLandmarks && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Landmark List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Landmarks ({landmarks.length})</span>
              {landmarkData?.isAnalyzed && (
                <Badge variant="outline" className="text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Analyzed
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              {/* Group by body region */}
              {Object.entries(LANDMARK_GROUPS).map(([groupKey, group]) => {
                const groupLandmarks = landmarks.filter((l) => {
                  const def = LANDMARK_DEFINITIONS[l.name as LandmarkName];
                  return def?.group === groupKey;
                });

                if (groupLandmarks.length === 0) return null;

                return (
                  <div key={groupKey}>
                    <div
                      className="px-3 py-1.5 text-xs font-medium bg-muted border-y"
                      style={{ borderLeftColor: group.color, borderLeftWidth: 3 }}
                    >
                      {group.label}
                    </div>
                    {groupLandmarks.map((landmark) => {
                      const def = LANDMARK_DEFINITIONS[landmark.name as LandmarkName];
                      const isSelected = selectedLandmark === landmark.id;
                      const confidence = getConfidenceBadge(landmark.confidence);

                      return (
                        <div
                          key={landmark.id}
                          className={cn(
                            'px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-muted/50 border-b',
                            isSelected && 'bg-muted'
                          )}
                          onClick={() => setSelectedLandmark(landmark.id)}
                        >
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getLandmarkColor(landmark.name) }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {def?.name || landmark.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {landmark.isManual ? 'Manual' : 'AI detected'}
                            </div>
                          </div>
                          {confidence && (
                            <Badge variant={confidence.variant} className="text-xs">
                              {confidence.label}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {landmarks.length === 0 && !isLoadingLandmarks && (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No landmarks detected.
                  <br />
                  Click &quot;Detect Landmarks&quot; to analyze.
                </div>
              )}
            </div>

            {/* Selected landmark actions */}
            {selectedLandmarkData && (
              <div className="border-t p-3 space-y-2">
                <div className="text-sm font-medium">
                  {LANDMARK_DEFINITIONS[selectedLandmarkData.name as LandmarkName]?.name ||
                    selectedLandmarkData.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  Position: ({(selectedLandmarkData.x * 100).toFixed(1)}%,{' '}
                  {(selectedLandmarkData.y * 100).toFixed(1)}%)
                </div>
                <div className="flex gap-2">
                  {selectedLandmarkData.isManual &&
                    selectedLandmarkData.originalX !== null && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          resetLandmarkMutation.mutate({
                            landmarkId: selectedLandmarkData.id,
                          })
                        }
                        disabled={resetLandmarkMutation.isPending}
                      >
                        <Undo className="h-3 w-3 mr-1" />
                        Reset
                      </Button>
                    )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      deleteLandmarkMutation.mutate({
                        landmarkId: selectedLandmarkData.id,
                      })
                    }
                    disabled={deleteLandmarkMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          {landmarks.filter((l) => l.isManual).length} manually adjusted •{' '}
          {missingLandmarks.length} landmarks remaining
        </div>
        <div>
          Drag landmarks to reposition • Click to select • Use toolbar to add new
        </div>
      </div>
    </div>
  );
}
