'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { BodyDiagram } from './BodyDiagram';
import { Marking, DiagramType } from './types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SpineDiagramProps {
  markings: Marking[];
  onMarkingsChange: (markings: Marking[]) => void;
  previousMarkings?: Marking[];
  readOnly?: boolean;
  showSegments?: boolean; // Show cervical, thoracic, lumbar as separate tabs
  className?: string;
}

// Vertebrae labels with approximate Y positions (percentage)
const VERTEBRAE_POSITIONS = {
  spine: [
    { label: 'C1', y: 5 },
    { label: 'C2', y: 7 },
    { label: 'C3', y: 9 },
    { label: 'C4', y: 11 },
    { label: 'C5', y: 13 },
    { label: 'C6', y: 15 },
    { label: 'C7', y: 17 },
    { label: 'T1', y: 20 },
    { label: 'T2', y: 24 },
    { label: 'T3', y: 28 },
    { label: 'T4', y: 32 },
    { label: 'T5', y: 36 },
    { label: 'T6', y: 40 },
    { label: 'T7', y: 44 },
    { label: 'T8', y: 48 },
    { label: 'T9', y: 52 },
    { label: 'T10', y: 56 },
    { label: 'T11', y: 60 },
    { label: 'T12', y: 64 },
    { label: 'L1', y: 70 },
    { label: 'L2', y: 76 },
    { label: 'L3', y: 82 },
    { label: 'L4', y: 88 },
    { label: 'L5', y: 94 },
    { label: 'S1', y: 98 },
  ],
  cervical: [
    { label: 'C1', y: 10 },
    { label: 'C2', y: 24 },
    { label: 'C3', y: 38 },
    { label: 'C4', y: 52 },
    { label: 'C5', y: 66 },
    { label: 'C6', y: 80 },
    { label: 'C7', y: 94 },
  ],
  thoracic: [
    { label: 'T1', y: 5 },
    { label: 'T2', y: 13 },
    { label: 'T3', y: 21 },
    { label: 'T4', y: 29 },
    { label: 'T5', y: 37 },
    { label: 'T6', y: 45 },
    { label: 'T7', y: 53 },
    { label: 'T8', y: 61 },
    { label: 'T9', y: 69 },
    { label: 'T10', y: 77 },
    { label: 'T11', y: 85 },
    { label: 'T12', y: 93 },
  ],
  lumbar: [
    { label: 'L1', y: 10 },
    { label: 'L2', y: 28 },
    { label: 'L3', y: 46 },
    { label: 'L4', y: 64 },
    { label: 'L5', y: 82 },
    { label: 'S1', y: 95 },
  ],
};

export function SpineDiagram({
  markings,
  onMarkingsChange,
  previousMarkings,
  readOnly = false,
  showSegments = false,
  className,
}: SpineDiagramProps) {
  // Group markings by region
  const markingsByRegion = useMemo(() => {
    const cervical: Marking[] = [];
    const thoracic: Marking[] = [];
    const lumbar: Marking[] = [];
    const other: Marking[] = [];

    markings.forEach((m) => {
      const label = m.label?.toUpperCase() ?? '';
      if (label.startsWith('C')) cervical.push(m);
      else if (label.startsWith('T')) thoracic.push(m);
      else if (label.startsWith('L') || label.startsWith('S')) lumbar.push(m);
      else other.push(m);
    });

    return { cervical, thoracic, lumbar, other };
  }, [markings]);

  // Count subluxations and issues by region
  const regionSummary = useMemo(() => ({
    cervical: markingsByRegion.cervical.filter((m) => m.type === 'subluxation').length,
    thoracic: markingsByRegion.thoracic.filter((m) => m.type === 'subluxation').length,
    lumbar: markingsByRegion.lumbar.filter((m) => m.type === 'subluxation').length,
  }), [markingsByRegion]);

  if (showSegments) {
    return (
      <div className={cn('flex flex-col gap-4', className)}>
        <Tabs defaultValue="full" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="full">
              Full Spine
            </TabsTrigger>
            <TabsTrigger value="cervical">
              Cervical {regionSummary.cervical > 0 && `(${regionSummary.cervical})`}
            </TabsTrigger>
            <TabsTrigger value="thoracic">
              Thoracic {regionSummary.thoracic > 0 && `(${regionSummary.thoracic})`}
            </TabsTrigger>
            <TabsTrigger value="lumbar">
              Lumbar {regionSummary.lumbar > 0 && `(${regionSummary.lumbar})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="full">
            <SpineDiagramWithLabels
              diagramType="spine"
              markings={markings}
              onMarkingsChange={onMarkingsChange}
              previousMarkings={previousMarkings}
              readOnly={readOnly}
              vertebraePositions={VERTEBRAE_POSITIONS.spine}
            />
          </TabsContent>

          <TabsContent value="cervical">
            <SpineDiagramWithLabels
              diagramType="cervical"
              markings={markingsByRegion.cervical}
              onMarkingsChange={(newMarkings) => {
                // Merge with other regions
                onMarkingsChange([
                  ...newMarkings,
                  ...markingsByRegion.thoracic,
                  ...markingsByRegion.lumbar,
                  ...markingsByRegion.other,
                ]);
              }}
              previousMarkings={previousMarkings?.filter((m) =>
                m.label?.toUpperCase().startsWith('C')
              )}
              readOnly={readOnly}
              vertebraePositions={VERTEBRAE_POSITIONS.cervical}
            />
          </TabsContent>

          <TabsContent value="thoracic">
            <SpineDiagramWithLabels
              diagramType="thoracic"
              markings={markingsByRegion.thoracic}
              onMarkingsChange={(newMarkings) => {
                onMarkingsChange([
                  ...markingsByRegion.cervical,
                  ...newMarkings,
                  ...markingsByRegion.lumbar,
                  ...markingsByRegion.other,
                ]);
              }}
              previousMarkings={previousMarkings?.filter((m) =>
                m.label?.toUpperCase().startsWith('T')
              )}
              readOnly={readOnly}
              vertebraePositions={VERTEBRAE_POSITIONS.thoracic}
            />
          </TabsContent>

          <TabsContent value="lumbar">
            <SpineDiagramWithLabels
              diagramType="lumbar"
              markings={markingsByRegion.lumbar}
              onMarkingsChange={(newMarkings) => {
                onMarkingsChange([
                  ...markingsByRegion.cervical,
                  ...markingsByRegion.thoracic,
                  ...newMarkings,
                  ...markingsByRegion.other,
                ]);
              }}
              previousMarkings={previousMarkings?.filter((m) =>
                m.label?.toUpperCase().startsWith('L') || m.label?.toUpperCase().startsWith('S')
              )}
              readOnly={readOnly}
              vertebraePositions={VERTEBRAE_POSITIONS.lumbar}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <SpineDiagramWithLabels
      diagramType="spine"
      markings={markings}
      onMarkingsChange={onMarkingsChange}
      previousMarkings={previousMarkings}
      readOnly={readOnly}
      vertebraePositions={VERTEBRAE_POSITIONS.spine}
      className={className}
    />
  );
}

interface SpineDiagramWithLabelsProps {
  diagramType: DiagramType;
  markings: Marking[];
  onMarkingsChange: (markings: Marking[]) => void;
  previousMarkings?: Marking[];
  readOnly?: boolean;
  vertebraePositions: { label: string; y: number }[];
  className?: string;
}

function SpineDiagramWithLabels({
  diagramType,
  markings,
  onMarkingsChange,
  previousMarkings,
  readOnly,
  vertebraePositions,
  className,
}: SpineDiagramWithLabelsProps) {
  return (
    <div className={cn('flex gap-2', className)}>
      {/* Vertebrae Labels */}
      <div className="relative w-8 flex flex-col justify-between text-[10px] text-gray-500">
        {vertebraePositions.map((v) => (
          <div
            key={v.label}
            className="absolute right-0 transform -translate-y-1/2"
            style={{ top: `${v.y}%` }}
          >
            {v.label}
          </div>
        ))}
      </div>

      {/* Diagram */}
      <div className="flex-1">
        <BodyDiagram
          diagramType={diagramType}
          markings={markings}
          onMarkingsChange={onMarkingsChange}
          previousMarkings={previousMarkings}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
