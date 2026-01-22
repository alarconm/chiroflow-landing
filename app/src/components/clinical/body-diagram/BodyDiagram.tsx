'use client';

import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DiagramType,
  Marking,
  MarkingType,
  MARKING_COLORS,
  MARKING_TYPES,
  DIAGRAM_TYPES,
} from './types';

interface BodyDiagramProps {
  diagramType: DiagramType;
  markings: Marking[];
  onMarkingsChange: (markings: Marking[]) => void;
  previousMarkings?: Marking[]; // Show previous visit markings as ghost
  readOnly?: boolean;
  className?: string;
}

export function BodyDiagram({
  diagramType,
  markings,
  onMarkingsChange,
  previousMarkings,
  readOnly = false,
  className,
}: BodyDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedMarkingType, setSelectedMarkingType] = useState<MarkingType>('pain');
  const [selectedMarking, setSelectedMarking] = useState<string | null>(null);
  const [editingMarking, setEditingMarking] = useState<Marking | null>(null);

  const diagramInfo = DIAGRAM_TYPES.find((d) => d.type === diagramType);
  const aspectRatio = diagramInfo ? diagramInfo.width / diagramInfo.height : 0.5;

  // Handle click on diagram to add new marking
  const handleDiagramClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (readOnly || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      // Don't add if click is too close to edge
      if (x < 2 || x > 98 || y < 2 || y > 98) return;

      const newMarking: Marking = {
        id: `marking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        x,
        y,
        type: selectedMarkingType,
      };

      onMarkingsChange([...markings, newMarking]);
      setSelectedMarking(newMarking.id);
    },
    [readOnly, markings, selectedMarkingType, onMarkingsChange]
  );

  // Handle marker click (select for editing)
  const handleMarkerClick = useCallback(
    (e: React.MouseEvent, marking: Marking) => {
      e.stopPropagation();
      if (readOnly) return;
      setSelectedMarking(marking.id);
      setEditingMarking(marking);
    },
    [readOnly]
  );

  // Handle marker drag
  const handleMarkerDrag = useCallback(
    (markingId: string, e: React.MouseEvent) => {
      if (readOnly || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();

      const onMouseMove = (moveEvent: MouseEvent) => {
        const x = Math.min(98, Math.max(2, ((moveEvent.clientX - rect.left) / rect.width) * 100));
        const y = Math.min(98, Math.max(2, ((moveEvent.clientY - rect.top) / rect.height) * 100));

        onMarkingsChange(
          markings.map((m) => (m.id === markingId ? { ...m, x, y } : m))
        );
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [readOnly, markings, onMarkingsChange]
  );

  // Delete a marking
  const handleDeleteMarking = useCallback(
    (markingId: string) => {
      onMarkingsChange(markings.filter((m) => m.id !== markingId));
      setSelectedMarking(null);
      setEditingMarking(null);
    },
    [markings, onMarkingsChange]
  );

  // Update marking details
  const handleUpdateMarking = useCallback(
    (updates: Partial<Marking>) => {
      if (!editingMarking) return;
      onMarkingsChange(
        markings.map((m) => (m.id === editingMarking.id ? { ...m, ...updates } : m))
      );
      setEditingMarking({ ...editingMarking, ...updates });
    },
    [editingMarking, markings, onMarkingsChange]
  );

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Marking Type Selector */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {MARKING_TYPES.map((mt) => (
            <Button
              key={mt.type}
              variant={selectedMarkingType === mt.type ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedMarkingType(mt.type)}
              style={{
                borderColor: selectedMarkingType === mt.type ? mt.color : undefined,
                backgroundColor: selectedMarkingType === mt.type ? mt.color : undefined,
              }}
            >
              <span
                className="mr-2 h-3 w-3 rounded-full"
                style={{ backgroundColor: mt.color }}
              />
              {mt.name}
            </Button>
          ))}
        </div>
      )}

      {/* Diagram Container */}
      <div className="flex gap-4">
        <div
          ref={containerRef}
          className={cn(
            'relative border-2 border-gray-200 rounded-lg bg-white cursor-crosshair overflow-hidden',
            readOnly && 'cursor-default'
          )}
          style={{
            aspectRatio,
            maxWidth: diagramInfo?.width ?? 300,
          }}
          onClick={handleDiagramClick}
        >
          {/* Background Image Placeholder */}
          <div
            className="absolute inset-0 flex items-center justify-center text-gray-300"
            style={{
              backgroundImage: `url(/diagrams/${diagramType}.svg)`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          >
            {/* Fallback text if no image */}
            <span className="text-xs opacity-50">{diagramInfo?.name}</span>
          </div>

          {/* Previous Visit Markings (Ghost) */}
          {previousMarkings?.map((marking) => (
            <TooltipProvider key={`prev-${marking.id}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="absolute w-4 h-4 rounded-full border-2 border-dashed opacity-30 pointer-events-none"
                    style={{
                      left: `${marking.x}%`,
                      top: `${marking.y}%`,
                      transform: 'translate(-50%, -50%)',
                      borderColor: marking.color ?? MARKING_COLORS[marking.type],
                      backgroundColor: `${marking.color ?? MARKING_COLORS[marking.type]}20`,
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Previous: {marking.type}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}

          {/* Current Markings */}
          {markings.map((marking) => (
            <TooltipProvider key={marking.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'absolute w-5 h-5 rounded-full border-2 cursor-pointer transition-transform hover:scale-125',
                      selectedMarking === marking.id && 'ring-2 ring-offset-2 ring-blue-500 scale-125',
                      !readOnly && 'cursor-move'
                    )}
                    style={{
                      left: `${marking.x}%`,
                      top: `${marking.y}%`,
                      transform: 'translate(-50%, -50%)',
                      borderColor: marking.color ?? MARKING_COLORS[marking.type],
                      backgroundColor: marking.color ?? MARKING_COLORS[marking.type],
                    }}
                    onClick={(e) => handleMarkerClick(e, marking)}
                    onMouseDown={(e) => {
                      if (!readOnly) handleMarkerDrag(marking.id, e);
                    }}
                  >
                    {marking.intensity && (
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">
                        {marking.intensity}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    <p className="font-medium">
                      {MARKING_TYPES.find((mt) => mt.type === marking.type)?.name}
                    </p>
                    {marking.label && <p>{marking.label}</p>}
                    {marking.intensity && <p>Intensity: {marking.intensity}/10</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>

        {/* Marking Editor Panel */}
        {!readOnly && editingMarking && (
          <Popover open={!!editingMarking} onOpenChange={() => setEditingMarking(null)}>
            <PopoverTrigger asChild>
              <div className="hidden" />
            </PopoverTrigger>
            <PopoverContent className="w-72" side="right">
              <div className="space-y-4">
                <div>
                  <Label>Type</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: MARKING_COLORS[editingMarking.type] }}
                    />
                    <span className="text-sm">
                      {MARKING_TYPES.find((mt) => mt.type === editingMarking.type)?.name}
                    </span>
                  </div>
                </div>

                <div>
                  <Label htmlFor="label">Label</Label>
                  <Input
                    id="label"
                    placeholder="e.g., L5-S1"
                    value={editingMarking.label ?? ''}
                    onChange={(e) => handleUpdateMarking({ label: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="intensity">Intensity (1-10)</Label>
                  <Input
                    id="intensity"
                    type="number"
                    min={1}
                    max={10}
                    value={editingMarking.intensity ?? ''}
                    onChange={(e) =>
                      handleUpdateMarking({ intensity: parseInt(e.target.value) || undefined })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Additional notes..."
                    value={editingMarking.notes ?? ''}
                    onChange={(e) => handleUpdateMarking({ notes: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteMarking(editingMarking.id)}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingMarking(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        {MARKING_TYPES.filter((mt) =>
          markings.some((m) => m.type === mt.type)
        ).map((mt) => (
          <div key={mt.type} className="flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: mt.color }}
            />
            <span>
              {mt.name} ({markings.filter((m) => m.type === mt.type).length})
            </span>
          </div>
        ))}
        {previousMarkings && previousMarkings.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-full border-2 border-dashed border-gray-400 opacity-30" />
            <span>Previous ({previousMarkings.length})</span>
          </div>
        )}
      </div>
    </div>
  );
}
