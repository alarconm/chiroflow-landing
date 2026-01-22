'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Save,
  Undo,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';

interface MobileBodyDiagramProps {
  encounterId: string;
  onSaved?: () => void;
}

type DiagramType =
  | 'body_front'
  | 'body_back'
  | 'spine'
  | 'cervical'
  | 'thoracic'
  | 'lumbar';

type MarkingType =
  | 'pain'
  | 'tenderness'
  | 'subluxation'
  | 'adjustment'
  | 'inflammation'
  | 'spasm';

interface Marking {
  id: string;
  x: number;
  y: number;
  type: MarkingType;
  label?: string;
  intensity?: number;
  notes?: string;
}

const diagramTypes: Array<{ type: DiagramType; label: string }> = [
  { type: 'body_front', label: 'Front' },
  { type: 'body_back', label: 'Back' },
  { type: 'spine', label: 'Spine' },
  { type: 'cervical', label: 'Cervical' },
  { type: 'thoracic', label: 'Thoracic' },
  { type: 'lumbar', label: 'Lumbar' },
];

const markingTypes: Array<{ type: MarkingType; label: string; color: string }> = [
  { type: 'pain', label: 'Pain', color: '#ef4444' },
  { type: 'tenderness', label: 'Tender', color: '#f97316' },
  { type: 'subluxation', label: 'Sublux', color: '#8b5cf6' },
  { type: 'adjustment', label: 'Adjust', color: '#22c55e' },
  { type: 'inflammation', label: 'Inflam', color: '#f59e0b' },
  { type: 'spasm', label: 'Spasm', color: '#ec4899' },
];

export function MobileBodyDiagram({ encounterId, onSaved }: MobileBodyDiagramProps) {
  const [activeDiagram, setActiveDiagram] = useState<DiagramType>('body_back');
  const [activeMarkingType, setActiveMarkingType] = useState<MarkingType>('pain');
  const [markings, setMarkings] = useState<Marking[]>([]);
  const [history, setHistory] = useState<Marking[][]>([]);
  const diagramRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  // Fetch existing diagrams
  const { data: diagramsData, isLoading } = trpc.mobileCharting.getBodyDiagrams.useQuery(
    { encounterId }
  );

  // Populate markings when data loads
  useEffect(() => {
    if (diagramsData?.diagrams) {
      const currentDiagram = diagramsData.diagrams.find((d) => d.diagramType === activeDiagram);
      if (currentDiagram) {
        setMarkings(currentDiagram.markings as Marking[]);
      }
    }
  }, [diagramsData, activeDiagram]);

  // Save mutation
  const saveMutation = trpc.mobileCharting.saveBodyDiagram.useMutation({
    onSuccess: () => {
      toast.success('Body diagram saved');
      utils.mobileCharting.getBodyDiagrams.invalidate({ encounterId });
      onSaved?.();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save');
    },
  });

  const handleDiagramChange = useCallback(
    (type: DiagramType) => {
      // Save current markings to cache
      const currentDiagram = diagramsData?.diagrams.find((d) => d.diagramType === type);
      setActiveDiagram(type);
      if (currentDiagram) {
        setMarkings(currentDiagram.markings as Marking[]);
      } else {
        setMarkings([]);
      }
      setHistory([]);
    },
    [diagramsData]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!diagramRef.current) return;

      const rect = diagramRef.current.getBoundingClientRect();
      let clientX: number;
      let clientY: number;

      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;

      // Add new marking
      const newMarking: Marking = {
        id: `marking_${Date.now()}`,
        x,
        y,
        type: activeMarkingType,
      };

      setHistory((prev) => [...prev, markings]);
      setMarkings((prev) => [...prev, newMarking]);
    },
    [activeMarkingType, markings]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setMarkings(previousState);
    setHistory((prev) => prev.slice(0, -1));
  }, [history]);

  const handleClear = useCallback(() => {
    setHistory((prev) => [...prev, markings]);
    setMarkings([]);
  }, [markings]);

  const handleSave = useCallback(() => {
    saveMutation.mutate({
      encounterId,
      diagramType: activeDiagram,
      markings: markings.map((m) => ({
        id: m.id,
        x: m.x,
        y: m.y,
        type: m.type,
        label: m.label,
        intensity: m.intensity,
        notes: m.notes,
      })),
    });
  }, [encounterId, activeDiagram, markings, saveMutation]);

  const getMarkingColor = (type: MarkingType) => {
    return markingTypes.find((m) => m.type === type)?.color || '#ef4444';
  };

  if (isLoading) {
    return (
      <Card className="m-4">
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#053e67]" />
          <p className="mt-2 text-stone-500">Loading diagram...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full bg-stone-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#053e67] text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Body Diagram</h1>
          <Badge className="bg-white/20">
            {markings.length} marking{markings.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* Diagram Type Selector */}
      <ScrollArea className="w-full border-b bg-white">
        <div className="flex gap-2 p-3">
          {diagramTypes.map((dt) => (
            <Button
              key={dt.type}
              variant={activeDiagram === dt.type ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleDiagramChange(dt.type)}
              className={cn(
                'whitespace-nowrap',
                activeDiagram === dt.type && 'bg-[#053e67] hover:bg-[#053e67]/90'
              )}
            >
              {dt.label}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Marking Type Selector */}
      <ScrollArea className="w-full bg-white border-b">
        <div className="flex gap-2 p-3">
          {markingTypes.map((mt) => (
            <Button
              key={mt.type}
              variant="outline"
              size="sm"
              onClick={() => setActiveMarkingType(mt.type)}
              className={cn(
                'whitespace-nowrap border-2',
                activeMarkingType === mt.type && 'ring-2 ring-offset-1'
              )}
              style={{
                borderColor: mt.color,
                backgroundColor: activeMarkingType === mt.type ? mt.color + '20' : 'transparent',
              }}
            >
              <div
                className="w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: mt.color }}
              />
              {mt.label}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Diagram Canvas */}
      <div className="flex-1 p-4 flex items-center justify-center">
        <Card className="w-full max-w-[300px] aspect-[1/2] overflow-hidden">
          <div
            ref={diagramRef}
            className="relative w-full h-full bg-stone-100 cursor-crosshair touch-none"
            onTouchStart={handleTouchStart}
            onMouseDown={handleTouchStart}
          >
            {/* Body outline SVG placeholder */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 100 200"
              preserveAspectRatio="xMidYMid meet"
            >
              {activeDiagram === 'body_back' && (
                <g stroke="#d1d5db" strokeWidth="0.5" fill="none">
                  {/* Head */}
                  <ellipse cx="50" cy="12" rx="10" ry="10" />
                  {/* Neck */}
                  <line x1="50" y1="22" x2="50" y2="28" />
                  {/* Shoulders */}
                  <line x1="25" y1="35" x2="75" y2="35" />
                  {/* Torso */}
                  <rect x="30" y="30" width="40" height="50" rx="5" />
                  {/* Arms */}
                  <line x1="25" y1="35" x2="15" y2="70" />
                  <line x1="75" y1="35" x2="85" y2="70" />
                  {/* Spine indicator */}
                  <line x1="50" y1="30" x2="50" y2="80" strokeDasharray="2" />
                  {/* Legs */}
                  <line x1="40" y1="80" x2="35" y2="140" />
                  <line x1="60" y1="80" x2="65" y2="140" />
                  {/* Lower legs */}
                  <line x1="35" y1="140" x2="30" y2="190" />
                  <line x1="65" y1="140" x2="70" y2="190" />
                </g>
              )}
              {activeDiagram === 'body_front' && (
                <g stroke="#d1d5db" strokeWidth="0.5" fill="none">
                  {/* Head */}
                  <ellipse cx="50" cy="12" rx="10" ry="10" />
                  {/* Neck */}
                  <line x1="50" y1="22" x2="50" y2="28" />
                  {/* Shoulders */}
                  <line x1="25" y1="35" x2="75" y2="35" />
                  {/* Torso */}
                  <rect x="30" y="30" width="40" height="50" rx="5" />
                  {/* Arms */}
                  <line x1="25" y1="35" x2="15" y2="70" />
                  <line x1="75" y1="35" x2="85" y2="70" />
                  {/* Legs */}
                  <line x1="40" y1="80" x2="35" y2="140" />
                  <line x1="60" y1="80" x2="65" y2="140" />
                  {/* Lower legs */}
                  <line x1="35" y1="140" x2="30" y2="190" />
                  <line x1="65" y1="140" x2="70" y2="190" />
                </g>
              )}
              {(activeDiagram === 'spine' ||
                activeDiagram === 'cervical' ||
                activeDiagram === 'thoracic' ||
                activeDiagram === 'lumbar') && (
                <g stroke="#d1d5db" strokeWidth="0.5" fill="none">
                  {/* Spine representation */}
                  <rect x="40" y="10" width="20" height="180" rx="5" />
                  {/* Vertebrae markers */}
                  {Array.from({ length: 24 }, (_, i) => (
                    <line
                      key={i}
                      x1="40"
                      y1={15 + i * 7}
                      x2="60"
                      y2={15 + i * 7}
                      strokeWidth="0.3"
                    />
                  ))}
                  {/* Labels */}
                  <text x="70" y="20" fontSize="4" fill="#9ca3af">
                    C1
                  </text>
                  <text x="70" y="55" fontSize="4" fill="#9ca3af">
                    T1
                  </text>
                  <text x="70" y="130" fontSize="4" fill="#9ca3af">
                    L1
                  </text>
                  <text x="70" y="165" fontSize="4" fill="#9ca3af">
                    S1
                  </text>
                </g>
              )}
            </svg>

            {/* Markings */}
            {markings.map((marking) => (
              <div
                key={marking.id}
                className="absolute w-4 h-4 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-white shadow-md"
                style={{
                  left: `${marking.x}%`,
                  top: `${marking.y}%`,
                  backgroundColor: getMarkingColor(marking.type),
                }}
              />
            ))}

            {/* Touch instruction */}
            {markings.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-stone-400 text-sm text-center px-8">
                  Tap to add markings
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div className="sticky bottom-0 bg-white border-t p-4">
        <div className="flex gap-2 mb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex-1"
          >
            <Undo className="h-4 w-4 mr-1" />
            Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={markings.length === 0}
            className="flex-1 text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
        <Button
          className="w-full bg-[#053e67] hover:bg-[#053e67]/90"
          onClick={handleSave}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Diagram
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default MobileBodyDiagram;
