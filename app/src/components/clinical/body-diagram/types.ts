// Body diagram types

export type DiagramType =
  | 'body_front'
  | 'body_back'
  | 'spine'
  | 'cervical'
  | 'thoracic'
  | 'lumbar'
  | 'hand_left'
  | 'hand_right'
  | 'foot_left'
  | 'foot_right';

export type MarkingType =
  | 'pain'
  | 'tenderness'
  | 'subluxation'
  | 'adjustment'
  | 'inflammation'
  | 'spasm'
  | 'numbness'
  | 'radiculopathy';

export interface Marking {
  id: string;
  x: number; // Percentage coordinates (0-100)
  y: number;
  type: MarkingType;
  label?: string;
  intensity?: number; // 1-10
  color?: string;
  notes?: string;
}

export interface DiagramTypeInfo {
  type: DiagramType;
  name: string;
  description: string;
  width: number;
  height: number;
}

export interface MarkingTypeInfo {
  type: MarkingType;
  name: string;
  color: string;
  icon: string;
}

// Default marking colors
export const MARKING_COLORS: Record<MarkingType, string> = {
  pain: '#ef4444',
  tenderness: '#f97316',
  subluxation: '#8b5cf6',
  adjustment: '#22c55e',
  inflammation: '#f59e0b',
  spasm: '#ec4899',
  numbness: '#6366f1',
  radiculopathy: '#14b8a6',
};

// Marking type display info
export const MARKING_TYPES: MarkingTypeInfo[] = [
  { type: 'pain', name: 'Pain', color: '#ef4444', icon: 'flame' },
  { type: 'tenderness', name: 'Tenderness', color: '#f97316', icon: 'hand' },
  { type: 'subluxation', name: 'Subluxation', color: '#8b5cf6', icon: 'circle-x' },
  { type: 'adjustment', name: 'Adjustment', color: '#22c55e', icon: 'check-circle' },
  { type: 'inflammation', name: 'Inflammation', color: '#f59e0b', icon: 'flame' },
  { type: 'spasm', name: 'Muscle Spasm', color: '#ec4899', icon: 'zap' },
  { type: 'numbness', name: 'Numbness/Tingling', color: '#6366f1', icon: 'circle-dot' },
  { type: 'radiculopathy', name: 'Radiculopathy', color: '#14b8a6', icon: 'arrow-down' },
];

// Diagram type display info
export const DIAGRAM_TYPES: DiagramTypeInfo[] = [
  {
    type: 'body_front',
    name: 'Body (Anterior)',
    description: 'Front view of full body',
    width: 300,
    height: 600,
  },
  {
    type: 'body_back',
    name: 'Body (Posterior)',
    description: 'Back view of full body',
    width: 300,
    height: 600,
  },
  {
    type: 'spine',
    name: 'Full Spine',
    description: 'Complete spinal column view',
    width: 200,
    height: 600,
  },
  {
    type: 'cervical',
    name: 'Cervical Spine',
    description: 'C1-C7 vertebrae detail',
    width: 200,
    height: 250,
  },
  {
    type: 'thoracic',
    name: 'Thoracic Spine',
    description: 'T1-T12 vertebrae detail',
    width: 200,
    height: 350,
  },
  {
    type: 'lumbar',
    name: 'Lumbar Spine',
    description: 'L1-L5 and sacral detail',
    width: 200,
    height: 250,
  },
  {
    type: 'hand_left',
    name: 'Left Hand',
    description: 'Left hand/wrist detail',
    width: 200,
    height: 250,
  },
  {
    type: 'hand_right',
    name: 'Right Hand',
    description: 'Right hand/wrist detail',
    width: 200,
    height: 250,
  },
  {
    type: 'foot_left',
    name: 'Left Foot',
    description: 'Left foot/ankle detail',
    width: 200,
    height: 250,
  },
  {
    type: 'foot_right',
    name: 'Right Foot',
    description: 'Right foot/ankle detail',
    width: 200,
    height: 250,
  },
];
