'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NoShowRiskLevel } from '@prisma/client';

interface NoShowRiskBadgeProps {
  riskLevel: NoShowRiskLevel;
  probability?: number;
  showProbability?: boolean;
  className?: string;
}

const riskLevelStyles: Record<NoShowRiskLevel, { bg: string; text: string; label: string }> = {
  LOW: {
    bg: 'bg-green-100 hover:bg-green-200',
    text: 'text-green-800',
    label: 'Low Risk',
  },
  MODERATE: {
    bg: 'bg-yellow-100 hover:bg-yellow-200',
    text: 'text-yellow-800',
    label: 'Moderate',
  },
  HIGH: {
    bg: 'bg-orange-100 hover:bg-orange-200',
    text: 'text-orange-800',
    label: 'High Risk',
  },
  VERY_HIGH: {
    bg: 'bg-red-100 hover:bg-red-200',
    text: 'text-red-800',
    label: 'Very High',
  },
};

export function NoShowRiskBadge({
  riskLevel,
  probability,
  showProbability = false,
  className,
}: NoShowRiskBadgeProps) {
  const style = riskLevelStyles[riskLevel];

  return (
    <Badge
      variant="outline"
      className={cn(style.bg, style.text, 'border-0', className)}
    >
      {style.label}
      {showProbability && probability !== undefined && (
        <span className="ml-1 opacity-75">
          ({Math.round(probability * 100)}%)
        </span>
      )}
    </Badge>
  );
}
