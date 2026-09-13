import React from 'react';
import { clsx } from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className, hoverEffect = false, ...props }) => {
  return (
    <div
      className={clsx(
        'w-full max-w-full min-w-0 bg-[var(--bg-surface)] rounded-2xl p-5 border border-[var(--border-subtle)] shadow-[var(--card-shadow)] relative overflow-hidden transition-colors duration-250',
        hoverEffect && 'transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-hover)] hover:-translate-y-0.5 hover:shadow-[var(--card-shadow-hover)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
