import React, { useRef, useEffect } from 'react';

interface SystemCore3DProps {
  progress: number; // 0 to 100
  currentStepIndex: number; // 0 to 5
  isComplete?: boolean;
}

export const SystemCore3D: React.FC<SystemCore3DProps> = ({
  progress,
  currentStepIndex,
  isComplete = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Single lightweight canvas for 8 ambient floating holographic dust motes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const width = 280;
    const height = 280;
    canvas.width = width;
    canvas.height = height;

    // 8 fixed lightweight particles
    const particles = Array.from({ length: 8 }, (_, i) => ({
      angle: (i / 8) * Math.PI * 2,
      radius: 50 + (i % 3) * 35,
      speed: 0.006 * (i % 2 === 0 ? 1 : -1),
      size: 1.2 + (i % 2) * 0.8,
      alpha: 0.3 + (i % 3) * 0.2,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;

      particles.forEach((p) => {
        p.angle += p.speed;
        const x = cx + Math.cos(p.angle) * p.radius;
        const y = cy + Math.sin(p.angle) * p.radius;

        ctx.fillStyle = isComplete ? `rgba(79, 209, 165, ${p.alpha})` : `rgba(85, 217, 245, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isComplete]);

  return (
    <div className="relative w-64 h-64 sm:w-72 sm:h-72 mx-auto flex items-center justify-center pointer-events-none select-none">
      {/* 1. Subtle Ambient Radial Holographic Glow (Static GPU Backdrop) */}
      <div
        className={`absolute inset-0 rounded-full blur-2xl transition-colors duration-500 pointer-events-none ${
          isComplete ? 'bg-[var(--operational-green)]/15' : 'bg-[var(--thermal-cyan)]/10'
        }`}
      />

      {/* 2. Floating Ambient Dust Canvas (8 Motes) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none block z-0"
      />

      {/* 3. Primary SVG 2.5D Holographic Rings */}
      <svg
        viewBox="0 0 280 280"
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      >
        <defs>
          <radialGradient id="holoCoreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={isComplete ? '#4FD1A5' : '#55D9F5'} stopOpacity="0.4" />
            <stop offset="70%" stopColor={isComplete ? '#4FD1A5' : '#8C9BFF'} stopOpacity="0.08" />
            <stop offset="100%" stopColor="#05080D" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="scanBeamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isComplete ? '#4FD1A5' : '#55D9F5'} stopOpacity="0.45" />
            <stop offset="60%" stopColor={isComplete ? '#4FD1A5' : '#55D9F5'} stopOpacity="0.08" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Outer Segmented Technical Ring (Slow Clockwise Rotation via GPU) */}
        <g className="holo-spin-slow" style={{ transformOrigin: '140px 140px' }}>
          <circle
            cx="140"
            cy="140"
            r="128"
            fill="none"
            stroke={isComplete ? '#4FD1A5' : '#55D9F5'}
            strokeWidth="1"
            strokeDasharray="4 8 16 8"
            strokeOpacity={isComplete ? '0.7' : '0.35'}
          />
          <circle
            cx="140"
            cy="140"
            r="118"
            fill="none"
            stroke="rgba(140, 155, 255, 0.2)"
            strokeWidth="1"
            strokeDasharray="1 6"
          />
        </g>

        {/* Middle Hexagonal/Segmented Ring (Slow Counter-Rotation via GPU) */}
        <g className="holo-spin-counter" style={{ transformOrigin: '140px 140px' }}>
          <polygon
            points="140,46 221,93 221,187 140,234 59,187 59,93"
            fill="none"
            stroke={isComplete ? '#4FD1A5' : '#8C9BFF'}
            strokeWidth="1.2"
            strokeDasharray="12 12"
            strokeOpacity={currentStepIndex >= 2 ? '0.6' : '0.25'}
            className="transition-all duration-300"
          />
          <circle
            cx="140"
            cy="140"
            r="92"
            fill="none"
            stroke={isComplete ? '#4FD1A5' : '#55D9F5'}
            strokeWidth="1"
            strokeDasharray="8 16"
            strokeOpacity={currentStepIndex >= 3 ? '0.65' : '0.2'}
          />
        </g>

        {/* 360° Scanning Laser Arc Wedge (Smooth Linear GPU Rotation) */}
        <g className="holo-scan-beam" style={{ transformOrigin: '140px 140px' }}>
          <path
            d="M 140 140 L 268 140 A 128 128 0 0 0 230 49 Z"
            fill="url(#scanBeamGrad)"
          />
          <line
            x1="140"
            y1="140"
            x2="268"
            y2="140"
            stroke={isComplete ? '#4FD1A5' : '#55D9F5'}
            strokeWidth="1.5"
            strokeOpacity="0.85"
          />
        </g>

        {/* Inner Solid Coordinate Reticle Ring */}
        <circle
          cx="140"
          cy="140"
          r="64"
          fill="none"
          stroke={isComplete ? '#4FD1A5' : '#55D9F5'}
          strokeWidth="1.5"
          strokeOpacity="0.45"
        />

        {/* Crosshair Lines */}
        <line x1="72" y1="140" x2="208" y2="140" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1="140" y1="72" x2="140" y2="208" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      </svg>

      {/* 4. Central Glowing AI Core (Subtle GPU Breathing Pulse) */}
      <div
        className={`holo-core-pulse relative z-20 w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center transition-all duration-300 ${
          isComplete
            ? 'bg-[#0B1018] border border-[#4FD1A5]/60 shadow-[0_0_25px_rgba(79,209,165,0.35)]'
            : 'bg-[#0B1018] border border-[#55D9F5]/45 shadow-[0_0_20px_rgba(85,217,245,0.2)]'
        }`}
      >
        {/* Inner Radial Glow Layer */}
        <div className="absolute inset-2 rounded-full bg-[radial-gradient(circle,rgba(85,217,245,0.25)_0%,transparent_70%)]" />

        {/* Inner Diamond Reticle */}
        <div
          className={`w-10 h-10 border transition-all duration-300 rotate-45 flex items-center justify-center ${
            isComplete ? 'border-[#4FD1A5] bg-[#4FD1A5]/15' : 'border-[#55D9F5] bg-[#55D9F5]/10'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              isComplete ? 'bg-[#4FD1A5] shadow-[0_0_8px_#4FD1A5]' : 'bg-[#55D9F5] shadow-[0_0_8px_#55D9F5]'
            }`}
          />
        </div>
      </div>
    </div>
  );
};
