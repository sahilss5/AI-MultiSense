import React from 'react';
import { EyeOff, Lock } from 'lucide-react';

export const DisabledRgbCard: React.FC = () => {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 opacity-75 relative overflow-hidden select-none font-sans shadow-sm transition-colors">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-4">
        <div className="flex items-center space-x-2 text-[var(--text-muted)]">
          <EyeOff className="w-4 h-4" />
          <span className="text-xs font-semibold font-sans">
            Auxiliary RGB stream (Extension Point)
          </span>
        </div>
        <span className="px-2.5 py-0.5 text-[10px] font-mono bg-[var(--bg-surface-secondary)] text-[var(--text-muted)] rounded-full border border-[var(--border-subtle)] flex items-center gap-1">
          <Lock className="w-3 h-3" /> Reserved
        </span>
      </div>

      <div className="h-32 bg-[var(--bg-surface-secondary)] rounded-xl border border-dashed border-[var(--border-subtle)] flex flex-col items-center justify-center text-center p-6 space-y-2">
        <div className="w-8 h-8 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)]">
          <EyeOff className="w-4 h-4" />
        </div>
        <h4 className="text-xs font-semibold text-[var(--text-primary)] font-sans">
          RGB Sensor Channel Not Instantiated
        </h4>
        <p className="text-[11px] text-[var(--text-secondary)] max-w-md font-sans">
          Primary surveillance pipeline operates on FLIR thermal spectrum. Dual-channel RGB integration point reserved in schema.
        </p>
      </div>
    </div>
  );
};
