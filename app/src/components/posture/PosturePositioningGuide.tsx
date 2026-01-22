'use client';

import { cn } from '@/lib/utils';

type PostureView = 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT';

interface PosturePositioningGuideProps {
  view: PostureView;
  className?: string;
}

const VIEW_GUIDES: Record<PostureView, {
  title: string;
  instructions: string[];
  silhouette: 'front' | 'back' | 'side-left' | 'side-right';
}> = {
  ANTERIOR: {
    title: 'Front View',
    instructions: [
      'Face the camera directly',
      'Feet shoulder-width apart on marks',
      'Arms relaxed at sides',
      'Eyes looking straight ahead',
    ],
    silhouette: 'front',
  },
  POSTERIOR: {
    title: 'Back View',
    instructions: [
      'Face away from camera',
      'Feet shoulder-width apart on marks',
      'Arms relaxed at sides',
      'Head in neutral position',
    ],
    silhouette: 'back',
  },
  LATERAL_LEFT: {
    title: 'Left Side View',
    instructions: [
      'Left side facing camera',
      'Feet together on marks',
      'Arms relaxed at sides',
      'Look straight ahead',
    ],
    silhouette: 'side-left',
  },
  LATERAL_RIGHT: {
    title: 'Right Side View',
    instructions: [
      'Right side facing camera',
      'Feet together on marks',
      'Arms relaxed at sides',
      'Look straight ahead',
    ],
    silhouette: 'side-right',
  },
};

export function PosturePositioningGuide({ view, className }: PosturePositioningGuideProps) {
  const guide = VIEW_GUIDES[view];

  return (
    <div className={cn('absolute inset-0 pointer-events-none', className)}>
      {/* Grid lines for alignment */}
      <div className="absolute inset-0">
        {/* Vertical center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400/40 -translate-x-1/2" />

        {/* Horizontal lines for body landmarks */}
        <div className="absolute left-0 right-0 top-[15%] h-px bg-cyan-400/30" /> {/* Eye level */}
        <div className="absolute left-0 right-0 top-[25%] h-px bg-cyan-400/30" /> {/* Shoulder level */}
        <div className="absolute left-0 right-0 top-[50%] h-px bg-cyan-400/30" /> {/* Hip level */}
        <div className="absolute left-0 right-0 top-[75%] h-px bg-cyan-400/30" /> {/* Knee level */}
        <div className="absolute left-0 right-0 bottom-[5%] h-px bg-cyan-400/40" /> {/* Foot line */}
      </div>

      {/* Body silhouette outline */}
      <div className="absolute inset-0 flex items-center justify-center">
        <BodySilhouette type={guide.silhouette} />
      </div>

      {/* Foot positioning marks */}
      <div className="absolute bottom-[5%] left-1/2 -translate-x-1/2 flex gap-8">
        <div className="w-8 h-2 border-2 border-cyan-400/60 rounded" />
        <div className="w-8 h-2 border-2 border-cyan-400/60 rounded" />
      </div>

      {/* Instructions panel */}
      <div className="absolute top-4 left-4 bg-black/60 text-white p-3 rounded-lg max-w-[200px]">
        <p className="font-semibold text-sm text-cyan-300">{guide.title}</p>
        <ul className="mt-2 space-y-1">
          {guide.instructions.map((instruction, i) => (
            <li key={i} className="text-xs text-gray-300 flex items-start gap-1">
              <span className="text-cyan-400">•</span>
              {instruction}
            </li>
          ))}
        </ul>
      </div>

      {/* Landmark labels */}
      <div className="absolute right-4 top-[15%] text-xs text-cyan-300 bg-black/50 px-1 rounded">
        Eyes
      </div>
      <div className="absolute right-4 top-[25%] text-xs text-cyan-300 bg-black/50 px-1 rounded">
        Shoulders
      </div>
      <div className="absolute right-4 top-[50%] text-xs text-cyan-300 bg-black/50 px-1 rounded">
        Hips
      </div>
      <div className="absolute right-4 top-[75%] text-xs text-cyan-300 bg-black/50 px-1 rounded">
        Knees
      </div>
    </div>
  );
}

// SVG body silhouettes for different views
function BodySilhouette({ type }: { type: 'front' | 'back' | 'side-left' | 'side-right' }) {
  const commonProps = {
    className: 'h-[80%] w-auto opacity-30',
    fill: 'none',
    stroke: 'cyan',
    strokeWidth: 2,
    viewBox: '0 0 100 200',
  };

  if (type === 'front' || type === 'back') {
    return (
      <svg {...commonProps}>
        {/* Head */}
        <ellipse cx="50" cy="20" rx="12" ry="15" />

        {/* Neck */}
        <line x1="50" y1="35" x2="50" y2="45" />

        {/* Shoulders */}
        <line x1="25" y1="50" x2="75" y2="50" />

        {/* Torso */}
        <line x1="25" y1="50" x2="30" y2="100" />
        <line x1="75" y1="50" x2="70" y2="100" />
        <line x1="30" y1="100" x2="70" y2="100" />

        {/* Arms */}
        <line x1="25" y1="50" x2="15" y2="90" />
        <line x1="75" y1="50" x2="85" y2="90" />

        {/* Hips/Pelvis */}
        <ellipse cx="50" cy="105" rx="22" ry="8" />

        {/* Legs */}
        <line x1="35" y1="110" x2="35" y2="170" />
        <line x1="65" y1="110" x2="65" y2="170" />

        {/* Feet */}
        <ellipse cx="35" cy="175" rx="8" ry="5" />
        <ellipse cx="65" cy="175" rx="8" ry="5" />

        {/* Spine indicator (back view only) */}
        {type === 'back' && (
          <line x1="50" y1="45" x2="50" y2="100" strokeDasharray="3,3" />
        )}
      </svg>
    );
  }

  // Side view
  const isLeft = type === 'side-left';
  return (
    <svg {...commonProps}>
      {/* Head */}
      <ellipse cx="50" cy="20" rx="10" ry="15" />

      {/* Neck */}
      <line x1="50" y1="35" x2="50" y2="45" />

      {/* Torso - side view shows depth */}
      <path d={isLeft
        ? "M 45 45 Q 35 70 40 100 L 60 100 Q 65 70 55 45 Z"
        : "M 55 45 Q 65 70 60 100 L 40 100 Q 35 70 45 45 Z"
      } />

      {/* Arm */}
      <line x1="50" y1="50" x2={isLeft ? "40" : "60"} y2="90" />

      {/* Spine curvature indicator */}
      <path
        d={isLeft
          ? "M 55 45 Q 60 70 55 100"
          : "M 45 45 Q 40 70 45 100"
        }
        strokeDasharray="3,3"
      />

      {/* Legs */}
      <line x1="50" y1="105" x2="50" y2="170" />

      {/* Feet */}
      <ellipse cx="50" cy="175" rx="12" ry="5" />

      {/* Ear marker for forward head posture reference */}
      <circle cx={isLeft ? "60" : "40"} cy="20" r="3" fill="cyan" opacity="0.5" />

      {/* Plumb line reference (should align ear-shoulder-hip-ankle) */}
      <line
        x1={isLeft ? "60" : "40"}
        y1="10"
        x2={isLeft ? "60" : "40"}
        y2="180"
        strokeDasharray="5,5"
        stroke="yellow"
        opacity="0.4"
      />
    </svg>
  );
}

export default PosturePositioningGuide;
