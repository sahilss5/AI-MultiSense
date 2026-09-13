import React from 'react';
import { ThreatLevel } from '../../types/schema';
import { Badge } from './Badge';

interface SeverityIndicatorProps {
  level?: ThreatLevel | null;
}

export const SeverityIndicator: React.FC<SeverityIndicatorProps> = ({ level }) => {
  if (!level) {
    return <Badge variant="slate">None</Badge>;
  }

  const map = {
    LOW: { variant: 'cyan' as const, label: 'Low', dotColor: 'bg-[var(--thermal-cyan)]' },
    MEDIUM: { variant: 'amber' as const, label: 'Medium', dotColor: 'bg-[var(--warning-amber)]' },
    HIGH: { variant: 'red' as const, label: 'High', dotColor: 'bg-[var(--threat-coral)]' },
    CRITICAL: { variant: 'violet' as const, label: 'Critical', dotColor: 'bg-[var(--intelligence-violet)]' },
  };

  const item = map[level] || { variant: 'slate' as const, label: level, dotColor: 'bg-[var(--text-secondary)]' };

  return (
    <Badge variant={item.variant} className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${item.dotColor}`} />
      <span>{item.label}</span>
    </Badge>
  );
};
