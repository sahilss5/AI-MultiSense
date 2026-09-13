import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface BrandMarkProps {
  status?: 'LIVE' | 'DEMO' | 'INITIALIZING' | 'OFFLINE' | 'ERROR';
  onClick?: () => void;
  showVersion?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  status = 'LIVE',
  onClick,
  showVersion = true,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isBooted, setIsBooted] = useState<boolean>(false);
  const [idlePulseCount, setIdlePulseCount] = useState<number>(0);

  // Status Accent Colors
  const getStatusAccent = () => {
    switch (status) {
      case 'LIVE':
        return '#4FD1A5'; // Muted Emerald
      case 'DEMO':
        return '#E7B85C'; // Warning Amber
      case 'INITIALIZING':
        return '#8C9BFF'; // Intelligence Violet
      case 'OFFLINE':
        return '#667386'; // Muted Gray
      case 'ERROR':
        return '#F27786'; // Threat Coral
      default:
        return '#4FD1A5';
    }
  };

  const statusColor = getStatusAccent();

  // Page Load Initial Sensor Activation Sequence
  useEffect(() => {
    const bootTimer = setTimeout(() => {
      setIsBooted(true);
    }, 1200);
    return () => clearTimeout(bootTimer);
  }, []);

  // Periodic Idle Sensor Pulse (Every 12 Seconds)
  useEffect(() => {
    const idleInterval = setInterval(() => {
      setIdlePulseCount((prev) => prev + 1);
    }, 12000);
    return () => clearInterval(idleInterval);
  }, []);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="inline-flex items-center space-x-3 cursor-pointer group select-none transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02]"
      title="AI-MULTISENSE Real-Time Thermal Intelligence Platform"
    >
      {/* Sensor Icon Container with Ambient Micro-Glow */}
      <div className="relative">
        {/* Soft Ambient Radial Glow */}
        <motion.div
          animate={{
            opacity: isHovered ? 0.45 : isBooted ? 0.2 : 0.1,
            scale: isHovered ? 1.15 : 1,
          }}
          transition={{ duration: 0.3 }}
          className="absolute -inset-1 rounded-full blur-md pointer-events-none"
          style={{ background: `radial-gradient(circle, #55D9F5 0%, #8C9BFF 100%)` }}
        />

        {/* Precision Sensor Geometric Container */}
        <div
          className={`w-9 h-9 rounded-xl bg-[var(--bg-surface-secondary)] border flex items-center justify-center relative shadow-md overflow-hidden transition-colors duration-200 ${
            isHovered
              ? 'border-[var(--thermal-cyan)] shadow-[0_0_12px_rgba(85,217,245,0.25)]'
              : 'border-[var(--border-subtle)]'
          }`}
        >
          {/* Inner Surface Highlight */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />

          {/* Central Sensor Node + Signal Rings + Targeting Geometry SVG */}
          <svg
            width="22"
            height="22"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="relative z-10"
          >
            {/* Outer Concentric Sensor Arc */}
            <motion.path
              d="M 6 16 A 10 10 0 0 1 26 16"
              stroke="#55D9F5"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeOpacity="0.85"
              initial={shouldReduceMotion ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* Inner Signal Arc */}
            <motion.path
              d="M 10 16 A 6 6 0 0 1 22 16"
              stroke="#8C9BFF"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeOpacity="0.9"
              initial={shouldReduceMotion ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* Precision Targeting Ticks */}
            <line x1="16" y1="4" x2="16" y2="7" stroke="#55D9F5" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
            <line x1="16" y1="25" x2="16" y2="28" stroke="#55D9F5" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
            <line x1="4" y1="16" x2="7" y2="16" stroke="#55D9F5" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
            <line x1="25" y1="16" x2="28" y2="16" stroke="#55D9F5" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />

            {/* Rotating Sensor Radar Sweep Line */}
            <motion.line
              key={idlePulseCount}
              x1="16"
              y1="16"
              x2="26"
              y2="16"
              stroke="#55D9F5"
              strokeWidth="1.5"
              strokeLinecap="round"
              initial={{ rotate: 0, opacity: 0 }}
              animate={
                isHovered
                  ? { rotate: 180, opacity: [0, 1, 0] }
                  : { rotate: [0, 180], opacity: [0, 0.9, 0] }
              }
              transition={{
                duration: isHovered ? 0.35 : 1.2,
                delay: isHovered ? 0 : 0.3,
                ease: 'linear',
              }}
              style={{ transformOrigin: '16px 16px' }}
            />

            {/* Central Sensor Core Node */}
            <motion.circle
              cx="16"
              cy="16"
              r="3"
              fill="#55D9F5"
              animate={{
                scale: isHovered ? [1, 1.2, 1] : [1, 1.08, 1],
              }}
              transition={{ duration: 0.4 }}
            />
            <circle cx="16" cy="16" r="1.2" fill="var(--bg-surface)" />

            {/* Target Lock Pulse Ring */}
            <motion.circle
              cx="16"
              cy="16"
              r="10"
              stroke={statusColor}
              strokeWidth="1"
              fill="none"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={
                isHovered
                  ? { scale: [0.6, 1.2], opacity: [0.9, 0] }
                  : { scale: [0.6, 1.2], opacity: [0.7, 0] }
              }
              transition={{
                duration: isHovered ? 0.5 : 2.5,
                repeat: isHovered ? 1 : Infinity,
                ease: 'easeOut',
              }}
            />
          </svg>

          {/* Status Indicator Dot */}
          <motion.span
            animate={{
              scale: isHovered ? 1.2 : [1, 1.15, 1],
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute bottom-1 right-1 w-2 h-2 rounded-full border border-[var(--bg-surface)] transition-colors duration-300"
            style={{ backgroundColor: statusColor }}
          />
        </div>
      </div>

      {/* Brand Text & Technical Version Badge */}
      <div className="flex items-center space-x-2">
        <span className="text-[14px] font-bold tracking-tight text-[var(--text-primary)] font-sans transition-colors">
          AI-MULTISENSE
        </span>

        {showVersion && (
          <span className="font-mono text-[9px] bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] text-[var(--thermal-cyan)] px-1.5 py-0.5 rounded-md">
            v1.0
          </span>
        )}
      </div>
    </div>
  );
};
