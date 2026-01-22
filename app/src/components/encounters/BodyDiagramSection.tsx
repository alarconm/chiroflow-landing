'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Loader2, Save, Undo, Trash2 } from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BodyDiagramSectionProps {
  encounterId: string;
  patientId: string;
  readOnly?: boolean;
}

type DiagramType = 'body_front' | 'body_back' | 'spine';
type MarkingType = 'pain' | 'tenderness' | 'subluxation' | 'adjustment' | 'inflammation' | 'spasm' | 'numbness' | 'radiculopathy';

// Marking interface matching API schema
interface Marking {
  id: string;
  x: number;
  y: number;
  type: MarkingType;
  label?: string;
  intensity?: number;
  color?: string;
  notes?: string;
}

const DIAGRAM_TABS: { key: DiagramType; label: string }[] = [
  { key: 'body_front', label: 'Front' },
  { key: 'body_back', label: 'Back' },
  { key: 'spine', label: 'Spine' },
];

const MARKING_COLORS: Record<MarkingType, string> = {
  pain: '#ef4444',
  tenderness: '#f97316',
  subluxation: '#8b5cf6',
  adjustment: '#22c55e',
  inflammation: '#f59e0b',
  spasm: '#ec4899',
  numbness: '#6366f1',
  radiculopathy: '#14b8a6',
};

export function BodyDiagramSection({
  encounterId,
  patientId,
  readOnly = false,
}: BodyDiagramSectionProps) {
  const [activeTab, setActiveTab] = useState<DiagramType>('body_front');
  const [markingType, setMarkingType] = useState<MarkingType>('pain');
  const [markings, setMarkings] = useState<Record<DiagramType, Marking[]>>({
    body_front: [],
    body_back: [],
    spine: [],
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: savedDiagrams, refetch } = trpc.bodyDiagram.listByEncounter.useQuery({
    encounterId,
  });

  const saveMutation = trpc.bodyDiagram.save.useMutation({
    onSuccess: () => {
      setHasUnsavedChanges(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  // Load saved diagrams into state
  useEffect(() => {
    if (!savedDiagrams) return;

    const loaded: Record<DiagramType, Marking[]> = {
      body_front: [],
      body_back: [],
      spine: [],
    };

    savedDiagrams.forEach((diagram) => {
      const diagramType = diagram.diagramType as DiagramType;
      if (loaded[diagramType] !== undefined) {
        loaded[diagramType] = (diagram.markings as unknown as Marking[]) || [];
      }
    });

    setMarkings(loaded);
  }, [savedDiagrams]);

  const handleDiagramClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (readOnly) return;

      const svg = event.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;

      const newMarking: Marking = {
        id: `mark-${Date.now()}`,
        x,
        y,
        type: markingType,
        color: MARKING_COLORS[markingType],
      };

      setMarkings((prev) => ({
        ...prev,
        [activeTab]: [...prev[activeTab], newMarking],
      }));
      setHasUnsavedChanges(true);
    },
    [readOnly, markingType, activeTab]
  );

  const handleRemoveMarking = useCallback(
    (markingId: string) => {
      if (readOnly) return;
      setMarkings((prev) => ({
        ...prev,
        [activeTab]: prev[activeTab].filter((m) => m.id !== markingId),
      }));
      setHasUnsavedChanges(true);
    },
    [readOnly, activeTab]
  );

  const handleSave = useCallback(async () => {
    let savedCount = 0;

    for (const [diagramType, diagramMarkings] of Object.entries(markings)) {
      if (diagramMarkings.length > 0) {
        try {
          await saveMutation.mutateAsync({
            encounterId,
            diagramType: diagramType as DiagramType,
            markings: diagramMarkings,
          });
          savedCount++;
        } catch {
          // Error handled by mutation
        }
      }
    }

    if (savedCount > 0) {
      toast.success(`Saved ${savedCount} diagram(s)`);
    } else {
      toast.info('No markings to save');
    }
  }, [encounterId, markings, saveMutation]);

  const handleUndo = useCallback(() => {
    // Reload from saved data
    if (!savedDiagrams) {
      setMarkings({
        body_front: [],
        body_back: [],
        spine: [],
      });
    } else {
      const loaded: Record<DiagramType, Marking[]> = {
        body_front: [],
        body_back: [],
        spine: [],
      };

      savedDiagrams.forEach((diagram) => {
        const diagramType = diagram.diagramType as DiagramType;
        if (loaded[diagramType] !== undefined) {
          loaded[diagramType] = (diagram.markings as unknown as Marking[]) || [];
        }
      });

      setMarkings(loaded);
    }
    setHasUnsavedChanges(false);
  }, [savedDiagrams]);

  const totalMarkings = Object.values(markings).reduce(
    (sum, marks) => sum + marks.length,
    0
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-[#053e67]/50" />
              Body Diagrams
            </CardTitle>
            <CardDescription>
              Click to mark areas of pain, tenderness, or subluxation
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {totalMarkings > 0 && (
              <Badge variant="secondary">{totalMarkings} markings</Badge>
            )}
            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-[#053e67] border-blue-300">
                Unsaved
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toolbar */}
        {!readOnly && (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Marking type:</span>
              <Select
                value={markingType}
                onValueChange={(value) => setMarkingType(value as MarkingType)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pain">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-red-500" />
                      Pain
                    </div>
                  </SelectItem>
                  <SelectItem value="tenderness">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-orange-500" />
                      Tenderness
                    </div>
                  </SelectItem>
                  <SelectItem value="subluxation">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-purple-500" />
                      Subluxation
                    </div>
                  </SelectItem>
                  <SelectItem value="adjustment">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-green-500" />
                      Adjustment
                    </div>
                  </SelectItem>
                  <SelectItem value="spasm">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-pink-500" />
                      Muscle Spasm
                    </div>
                  </SelectItem>
                  <SelectItem value="numbness">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-indigo-500" />
                      Numbness
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <>
                  <Button variant="outline" size="sm" onClick={handleUndo}>
                    <Undo className="h-4 w-4 mr-2" />
                    Undo
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Diagram Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DiagramType)}>
          <TabsList className="grid w-full grid-cols-3">
            {DIAGRAM_TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
                {markings[tab.key]?.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {markings[tab.key].length}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {DIAGRAM_TABS.map((tab) => (
            <TabsContent key={tab.key} value={tab.key} className="mt-4">
              <div className="border rounded-lg p-4 bg-white">
                <div className="relative mx-auto" style={{ maxWidth: tab.key === 'spine' ? '200px' : '300px' }}>
                  {/* Simple SVG body outline */}
                  <svg
                    viewBox="0 0 100 100"
                    className={cn(
                      'w-full cursor-crosshair',
                      readOnly && 'cursor-default'
                    )}
                    onClick={handleDiagramClick}
                    style={{
                      aspectRatio: tab.key === 'spine' ? '1/3' : '1/2',
                      background: '#fafafa',
                      borderRadius: '8px'
                    }}
                  >
                    {/* Body outline based on diagram type */}
                    {tab.key === 'body_front' && (
                      <g stroke="#ddd" strokeWidth="0.5" fill="none">
                        {/* Head */}
                        <circle cx="50" cy="10" r="8" />
                        {/* Torso */}
                        <path d="M42,18 L42,55 L58,55 L58,18" />
                        {/* Arms */}
                        <path d="M42,22 L25,50 L28,52" />
                        <path d="M58,22 L75,50 L72,52" />
                        {/* Legs */}
                        <path d="M42,55 L38,95" />
                        <path d="M58,55 L62,95" />
                      </g>
                    )}
                    {tab.key === 'body_back' && (
                      <g stroke="#ddd" strokeWidth="0.5" fill="none">
                        {/* Head */}
                        <circle cx="50" cy="10" r="8" />
                        {/* Torso with spine line */}
                        <path d="M42,18 L42,55 L58,55 L58,18" />
                        <line x1="50" y1="18" x2="50" y2="55" strokeDasharray="2,2" />
                        {/* Arms */}
                        <path d="M42,22 L25,50 L28,52" />
                        <path d="M58,22 L75,50 L72,52" />
                        {/* Legs */}
                        <path d="M42,55 L38,95" />
                        <path d="M58,55 L62,95" />
                      </g>
                    )}
                    {tab.key === 'spine' && (
                      <g stroke="#ddd" strokeWidth="0.5" fill="none">
                        {/* Cervical */}
                        <text x="10" y="8" fontSize="3" fill="#999">C1-C7</text>
                        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                          <rect key={`c${i}`} x="45" y={5 + i * 3} width="10" height="2.5" rx="1" />
                        ))}
                        {/* Thoracic */}
                        <text x="10" y="30" fontSize="3" fill="#999">T1-T12</text>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
                          <rect key={`t${i}`} x="45" y={27 + i * 3} width="10" height="2.5" rx="1" />
                        ))}
                        {/* Lumbar */}
                        <text x="10" y="68" fontSize="3" fill="#999">L1-L5</text>
                        {[0, 1, 2, 3, 4].map((i) => (
                          <rect key={`l${i}`} x="44" y={65 + i * 4} width="12" height="3.5" rx="1" />
                        ))}
                        {/* Sacrum */}
                        <text x="10" y="88" fontSize="3" fill="#999">Sacrum</text>
                        <path d="M44,86 L56,86 L52,96 L48,96 Z" />
                      </g>
                    )}

                    {/* Render markings */}
                    {markings[tab.key]?.map((marking) => (
                      <g key={marking.id}>
                        <circle
                          cx={marking.x}
                          cy={marking.y}
                          r="3"
                          fill={marking.color || MARKING_COLORS[marking.type as MarkingType] || '#ef4444'}
                          opacity="0.8"
                          className="cursor-pointer hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!readOnly) {
                              handleRemoveMarking(marking.id);
                            }
                          }}
                        />
                        <circle
                          cx={marking.x}
                          cy={marking.y}
                          r="4"
                          fill="none"
                          stroke={marking.color || MARKING_COLORS[marking.type as MarkingType] || '#ef4444'}
                          strokeWidth="0.5"
                          opacity="0.5"
                        />
                      </g>
                    ))}
                  </svg>

                  {/* Legend */}
                  <div className="mt-4 flex flex-wrap gap-2 justify-center text-xs">
                    {markings[tab.key]?.length > 0 && (
                      <span className="text-gray-500">Click marking to remove</span>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* Markings List */}
        {markings[activeTab]?.length > 0 && (
          <div className="border rounded-lg p-3">
            <p className="text-sm font-medium text-gray-500 mb-2">
              Current Markings ({markings[activeTab].length})
            </p>
            <div className="space-y-1">
              {markings[activeTab].map((marking) => (
                <div
                  key={marking.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: marking.color || MARKING_COLORS[marking.type as MarkingType] }}
                    />
                    <span className="capitalize">{marking.type}</span>
                    <span className="text-gray-400">
                      ({marking.x.toFixed(0)}%, {marking.y.toFixed(0)}%)
                    </span>
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-red-500"
                      onClick={() => handleRemoveMarking(marking.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
