import React from 'react';
import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'amber' | 'red' | 'cyan' | 'violet' | 'slate';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'cyan', size = 'md', className }) => {
  const variantStyles = {
    emerald: 'bg-[var(--operational-green)]/12 text-[var(--operational-green)] border-[var(--operational-green)]/30',
    amber: 'bg-[var(--warning-amber)]/12 text-[var(--warning-amber)] border-[var(--warning-amber)]/30',
    red: 'bg-[var(--threat-coral)]/12 text-[var(--threat-coral)] border-[var(--threat-coral)]/30',
    cyan: 'bg-[var(--thermal-cyan)]/12 text-[var(--thermal-cyan)] border-[var(--thermal-cyan)]/30',
    violet: 'bg-[var(--intelligence-violet)]/12 text-[var(--intelligence-violet)] border-[var(--intelligence-violet)]/30',
    slate: 'bg-[var(--text-secondary)]/10 text-[var(--text-secondary)] border-[var(--border-subtle)]',
  };

  const sizeStyles = {
    sm: 'px-2.5 py-0.5 text-[11px] font-sans font-medium',
    md: 'px-3 py-1 text-xs font-sans font-medium',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border tracking-normal select-none transition-colors duration-200',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
};
