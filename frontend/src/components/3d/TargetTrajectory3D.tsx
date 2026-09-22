import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  User,
  Car,
  Bird,
  Plane,
  Briefcase,
  Navigation,
  Activity,
  ChevronDown,
  Check,
} from 'lucide-react';

export interface TrajectoryTarget {
  track_id: number;
  class: string;
  confidence: number;
  speed?: number | null;
  direction?: string;
  threat?: boolean;
  threat_level?: string;
  zone?: string;
  bbox?: [number, number, number, number];
  trajectory?: [number, number][];
  is_demo?: boolean;
}

interface TargetTrajectory3DProps {
  target?: TrajectoryTarget | null;
  className?: string;
}

type ViewAngle = 'ISOMETRIC' | 'TOP' | 'SIDE';

export const TargetTrajectory3D: React.FC<TargetTrajectory3DProps> = ({
  target,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pulsePhase, setPulsePhase] = useState<number>(0);
  const [viewAngle, setViewAngle] = useState<ViewAngle>('ISOMETRIC');
  const [isAngleMenuOpen, setIsAngleMenuOpen] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(true);

  // Persistent track history map across frame updates: track_id -> array of { x: number; y: number } in SVG space (280x180)
  const trackHistoryRef = useRef<Map<number, { x: number; y: number }[]>>(new Map());
  const [historyPoints, setHistoryPoints] = useState<{ x: number; y: number }[]>([]);

  // Update history points whenever the selected target's position/bbox/trajectory updates
  useEffect(() => {
    if (!target) {
      setHistoryPoints([]);
      return;
    }

    const tid = target.track_id;

    // 1. If target comes with pre-recorded real ByteTrack trajectory points, use them directly!
    if (target.trajectory && Array.isArray(target.trajectory) && target.trajectory.length > 0) {
      const mapped = target.trajectory.map((pt: any) => {
        const cx = Array.isArray(pt) ? pt[0] : (typeof pt?.x === 'number' ? pt.x : 0.5);
        const cy = Array.isArray(pt) ? pt[1] : (typeof pt?.y === 'number' ? pt.y : 0.5);
        return {
          x: Math.round(35 + Math.max(0, Math.min(1, cx)) * 210),
          y: Math.round(25 + Math.max(0, Math.min(1, cy)) * 130),
        };
      });
      trackHistoryRef.current.set(tid, mapped);
      setHistoryPoints(mapped);
      return;
    }

    // 2. Otherwise calculate current center from bbox
    let cx = 0.5;
    let cy = 0.5;
    if (target.bbox && target.bbox.length === 4) {
      cx = (target.bbox[0] + target.bbox[2]) / 2;
      cy = (target.bbox[1] + target.bbox[3]) / 2;
    }

    // Map normalized bounding box center to SVG coordinates (viewBox 280 x 180)
    // Usable grid coordinate bounds: X in [35..245], Y in [25..155]
    const svgX = Math.round(35 + Math.max(0, Math.min(1, cx)) * 210);
    const svgY = Math.round(25 + Math.max(0, Math.min(1, cy)) * 130);

    const existing = trackHistoryRef.current.get(tid) || [];
    const last = existing[existing.length - 1];

    let updated = existing;
    if (!last || Math.hypot(last.x - svgX, last.y - svgY) >= 3) {
      updated = [...existing, { x: svgX, y: svgY }].slice(-25);
      trackHistoryRef.current.set(tid, updated);
    }

    setHistoryPoints(updated);
  }, [target?.track_id, target?.bbox, target?.trajectory]);

  // Micro-parallax on mouse move (Desktop only)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!viewportRef.current || window.innerWidth < 768) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setTilt({
      x: -y * 2.0,
      y: x * 2.0,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  // IntersectionObserver to pause loop when scrolled out of view
  useEffect(() => {
    if (!containerRef.current || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Pulse animation using requestAnimationFrame
  useEffect(() => {
    if (!isVisible || !target) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let animId: number;
    let start = performance.now();

    const animate = (time: number) => {
      const elapsed = (time - start) / 1000;
      setPulsePhase((elapsed % 2) / 2);
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [isVisible, target]);

  // Target Class Normalization & Theme Colors
  const normClass = (target?.class || 'PERSON').toUpperCase();
  const isThreat = !!target?.threat || (target?.threat_level && target.threat_level !== 'LOW');
  const isDrone = normClass.includes('DRONE');
  const isVehicle = normClass.includes('VEHICLE');
  const isBag = normClass.includes('BAG');

  const themeColor = isThreat
    ? 'var(--threat-coral)'
    : isDrone
    ? 'var(--intelligence-violet)'
    : isVehicle
    ? 'var(--warning-amber)'
    : 'var(--thermal-cyan)';

  const elevationPx = isDrone ? 30 : isVehicle ? 14 : 20;

  // Camera Pitch based on selected viewing angle
  const getCameraRotation = () => {
    switch (viewAngle) {
      case 'TOP':
        return { rx: 0 + tilt.x, ry: tilt.y, scale: 0.95 };
      case 'SIDE':
        return { rx: 72 + tilt.x, ry: tilt.y, scale: 1.05 };
      case 'ISOMETRIC':
      default:
        return { rx: 50 + tilt.x, ry: tilt.y, scale: 1.0 };
    }
  };

  const { rx, ry, scale } = getCameraRotation();

  // Class icon selector
  const getClassIcon = () => {
    if (isDrone) return <Plane className="w-3.5 h-3.5" />;
    if (isVehicle) return <Car className="w-3.5 h-3.5" />;
    if (isBag) return <Briefcase className="w-3.5 h-3.5" />;
    if (normClass.includes('ANIMAL')) return <Bird className="w-3.5 h-3.5" />;
    return <User className="w-3.5 h-3.5" />;
  };

  const angleOptions: { id: ViewAngle; label: string }[] = [
    { id: 'ISOMETRIC', label: '3D ISOMETRIC 55°' },
    { id: 'TOP', label: 'TOP-DOWN 90°' },
    { id: 'SIDE', label: 'ELEVATION 25°' },
  ];

  // Latest track position for marker and vector calculations
  const latestPt =
    historyPoints.length > 0
      ? historyPoints[historyPoints.length - 1]
      : { x: 140, y: 95 };

  // Trajectory path SVG string from real history
  const pathD =
    historyPoints.length >= 2
      ? historyPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ')
      : '';

  // Forward trajectory vector calculation if >= 2 points
  let forwardVector: { x2: number; y2: number; arrowPoints: string } | null = null;
  if (historyPoints.length >= 2) {
    const pPrev = historyPoints[historyPoints.length - 2];
    const pLast = historyPoints[historyPoints.length - 1];
    const dx = pLast.x - pPrev.x;
    const dy = pLast.y - pPrev.y;
    const len = Math.hypot(dx, dy);
    if (len >= 2) {
      const ux = dx / len;
      const uy = dy / len;
      const x2 = pLast.x + ux * 22;
      const y2 = pLast.y + uy * 22;

      // Arrowhead points
      const perpX = -uy * 4;
      const perpY = ux * 4;
      const tipX = x2;
      const tipY = y2;
      const baseLeftX = tipX - ux * 8 + perpX;
      const baseLeftY = tipY - uy * 8 + perpY;
      const baseRightX = tipX - ux * 8 - perpX;
      const baseRightY = tipY - uy * 8 - perpY;
      forwardVector = {
        x2,
        y2,
        arrowPoints: `${tipX},${tipY} ${baseLeftX},${baseLeftY} ${baseRightX},${baseRightY}`,
      };
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-w-full min-w-0 rounded-2xl bg-[#070B12] border border-[var(--border-subtle)] p-3.5 sm:p-4 select-none overflow-hidden font-sans box-border ${className}`}
      role="region"
      aria-label="3D Target Trajectory Visualizer"
    >
      {/* Screen reader summary */}
      <span className="sr-only">
        {target
          ? `Target T-${target.track_id}, Class ${target.class}, Detection Confidence ${(target.confidence * 100).toFixed(1)}%`
          : 'No active target track selected.'}
      </span>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)] mb-2">
        <div className="min-w-0">
          <div className="flex items-center space-x-2 min-w-0 flex-wrap gap-1">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                target ? 'bg-[var(--operational-green)] pulse-live' : 'bg-[var(--text-muted)]'
              }`}
            />
            <h4 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
              3D TARGET TRAJECTORY
            </h4>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] text-[var(--thermal-cyan)] font-semibold">
              REAL BYTE TRACK MOVEMENT
            </span>
          </div>
          <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
            IMAGE-BASED TRACK POSITION
          </div>
        </div>

        {/* View Angle Selector Dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setIsAngleMenuOpen(!isAngleMenuOpen)}
            className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[10px] font-mono text-[var(--text-primary)] flex items-center space-x-1.5 cursor-pointer transition-colors"
          >
            <span>{angleOptions.find((a) => a.id === viewAngle)?.label}</span>
            <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
          </button>

          {isAngleMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-[#0A121E] border border-[var(--border-subtle)] rounded-xl shadow-2xl p-1 z-30 font-mono text-[10px] space-y-0.5">
              {angleOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setViewAngle(opt.id);
                    setIsAngleMenuOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                    viewAngle === opt.id
                      ? 'bg-[var(--thermal-cyan)]/15 text-[var(--thermal-cyan)] font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {viewAngle === opt.id && <Check className="w-3 h-3 text-[var(--thermal-cyan)]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3D Coordinate Viewport */}
      <div
        ref={viewportRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative w-full max-w-full min-w-0 h-48 sm:h-56 md:h-60 flex items-center justify-center overflow-hidden rounded-xl bg-[#05080D]/80 border border-[var(--border-subtle)]/40"
      >
        {/* Subtle Ambient Radial Glow */}
        <div
          style={{
            background: `radial-gradient(ellipse at center, ${target ? themeColor : 'rgba(85,217,245,0.05)'} 0%, transparent 70%)`,
            opacity: 0.12,
          }}
          className="absolute inset-0 pointer-events-none"
        />

        {/* 3D Tilted Plane Canvas */}
        <div
          style={{
            transform: `perspective(750px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`,
            transformStyle: 'preserve-3d',
            transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          className="relative w-full max-w-[290px] h-[190px] shrink-0 flex items-center justify-center pointer-events-none"
        >
          {/* Ground Coordinate Plane Grid (280x180 SVG) */}
          <svg viewBox="0 0 280 180" className="absolute inset-0 w-full h-full">
            <defs>
              <linearGradient id="trajRealGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#667386" stopOpacity="0.25" />
                <stop offset="100%" stopColor={themeColor} stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* Grid Outer Bounding Box */}
            <rect
              x="10"
              y="10"
              width="260"
              height="160"
              fill="none"
              stroke="rgba(120, 160, 200, 0.15)"
              strokeWidth="1"
              rx="8"
            />

            {/* Coordinate Grid Crossings */}
            {[50, 95, 140, 185, 230].map((x) => (
              <line
                key={`gx-${x}`}
                x1={x}
                y1="10"
                x2={x}
                y2="170"
                stroke="rgba(120, 160, 200, 0.07)"
                strokeWidth="1"
              />
            ))}
            {[35, 65, 95, 125, 155].map((y) => (
              <line
                key={`gy-${y}`}
                x1="10"
                y1={y}
                x2="270"
                y2={y}
                stroke="rgba(120, 160, 200, 0.07)"
                strokeWidth="1"
              />
            ))}

            {/* Range Rings from Center Position (140, 95) */}
            <circle
              cx="140"
              cy="95"
              r="38"
              fill="none"
              stroke="rgba(85, 217, 245, 0.14)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle
              cx="140"
              cy="95"
              r="74"
              fill="none"
              stroke="rgba(85, 217, 245, 0.08)"
              strokeWidth="1"
            />

            {/* Real Target Trajectory Rendering */}
            {target && historyPoints.length >= 2 && pathD && (
              <>
                {/* Past Trajectory Path */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="url(#trajRealGrad)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Past Waypoint Dots */}
                {historyPoints.slice(0, -1).map((pt, idx) => (
                  <circle
                    key={`past-pt-${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r="2.5"
                    fill="#667386"
                    opacity="0.6"
                    stroke={themeColor}
                    strokeWidth="0.5"
                  />
                ))}

                {/* Forward Vector / Trajectory Arrow */}
                {forwardVector && (
                  <>
                    <line
                      x1={latestPt.x}
                      y1={latestPt.y}
                      x2={forwardVector.x2}
                      y2={forwardVector.y2}
                      stroke={themeColor}
                      strokeWidth="1.8"
                      strokeDasharray="3 2"
                      strokeOpacity="0.85"
                    />
                    <polygon
                      points={forwardVector.arrowPoints}
                      fill={themeColor}
                      opacity="0.95"
                    />
                  </>
                )}
              </>
            )}

            {/* Informative Position / Track History Indicator */}
            {target && historyPoints.length < 2 && (
              <g>
                <text
                  x="140"
                  y="120"
                  fill="rgba(154, 167, 184, 0.85)"
                  fontSize="7.5"
                  fontFamily="JetBrains Mono, monospace"
                  textAnchor="middle"
                  fontWeight="bold"
                  letterSpacing="0.5px"
                >
                  {historyPoints.length === 1 ? '1 POSITION RECORDED' : `${historyPoints.length} POSITIONS RECORDED`}
                </text>
                <text
                  x="140"
                  y="132"
                  fill="rgba(154, 167, 184, 0.65)"
                  fontSize="6.5"
                  fontFamily="JetBrains Mono, monospace"
                  textAnchor="middle"
                  letterSpacing="0.2px"
                >
                  Trajectory requires 2+ movement points.
                </text>
              </g>
            )}

            {/* Image Coordinate Axis Labels (Normalized 2D Projection) */}
            <text x="140" y="22" fill="rgba(85, 217, 245, 0.75)" fontSize="7" fontFamily="JetBrains Mono" textAnchor="middle" fontWeight="bold">-Y (UP)</text>
            <text x="250" y="98" fill="rgba(154, 167, 184, 0.55)" fontSize="7" fontFamily="JetBrains Mono" textAnchor="middle">+X (RIGHT)</text>
            <text x="140" y="166" fill="rgba(154, 167, 184, 0.55)" fontSize="7" fontFamily="JetBrains Mono" textAnchor="middle">+Y (DOWN)</text>
            <text x="30" y="98" fill="rgba(154, 167, 184, 0.55)" fontSize="7" fontFamily="JetBrains Mono" textAnchor="middle">-X (LEFT)</text>
          </svg>

          {/* CURRENT TARGET POSITION WITH 3D ELEVATION STEM & PULSE */}
          {target ? (
            <div
              style={{
                left: `${(latestPt.x / 280) * 100}%`,
                top: `${(latestPt.y / 180) * 100}%`,
                transform: 'translate(-50%, -50%)',
                transition: 'left 0.25s ease-out, top 0.25s ease-out',
              }}
              className="absolute z-20 pointer-events-none"
            >
              {/* Inner Static Ground Footprint Ring */}
              <div
                style={{
                  borderColor: themeColor,
                  boxShadow: `0 0 10px ${themeColor}40`,
                }}
                className="w-6 h-6 -ml-3 -mt-3 rounded-full border-2 opacity-80"
              />

              {/* Medium Pulsing Range Ring */}
              <div
                style={{
                  borderColor: themeColor,
                  transform: `scale(${1 + pulsePhase * 0.45})`,
                  opacity: 0.8 - pulsePhase * 0.5,
                }}
                className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border pointer-events-none"
              />

              {/* Large Dynamic Expanding Pulse Ring */}
              <div
                style={{
                  borderColor: themeColor,
                  transform: `scale(${1 + pulsePhase * 0.9})`,
                  opacity: 1 - pulsePhase,
                }}
                className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border pointer-events-none"
              />

              {/* Vertical 3D Height Stem (Hidden in TOP-DOWN view) */}
              {viewAngle !== 'TOP' && (
                <div
                  style={{
                    height: `${elevationPx}px`,
                    backgroundColor: themeColor,
                    bottom: '12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                  className="absolute w-0.5 opacity-75 pointer-events-none"
                />
              )}

              {/* Elevated 3D Floating Target Label */}
              <div
                style={{
                  bottom: viewAngle === 'TOP' ? '0px' : `${12 + elevationPx}px`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#070B12',
                  borderColor: themeColor,
                  boxShadow: `0 0 14px ${themeColor}40`,
                }}
                className="absolute px-2 py-0.5 rounded-lg border flex flex-col items-center justify-center font-mono whitespace-nowrap shadow-2xl space-y-0.5 pointer-events-none"
              >
                <div className="flex items-center space-x-1 text-[8px] font-bold tracking-wider uppercase text-[var(--text-secondary)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--operational-green)] pulse-live" />
                  <span>{target.class}</span>
                </div>
                <div className="flex items-center space-x-1 text-[9px] font-extrabold" style={{ color: themeColor }}>
                  <span>T-{target.track_id}</span>
                  <span className="text-[var(--text-muted)] opacity-60">·</span>
                  <span className="text-[var(--operational-green)] font-semibold">
                    {(target.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 space-y-1">
              <Navigation className="w-6 h-6 text-[var(--text-muted)] opacity-35 mb-1" />
              <span className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                NO ACTIVE TRACK
              </span>
              <span className="text-[11px] font-sans text-[var(--text-muted)]">
                Waiting for ByteTrack data...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3D Visualization Legend */}
      <div className="flex items-center justify-center space-x-4 py-1.5 text-[10px] font-mono text-[var(--text-muted)] border-t border-[var(--border-subtle)]/40 mt-2">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] inline-block" />
          <span>CURRENT POSITION</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[var(--thermal-cyan)] inline-block" />
          <span>TRAJECTORY</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full border border-[var(--text-muted)] inline-block" />
          <span>PAST POSITION</span>
        </span>
      </div>

      {/* Trajectory Telemetry Strip */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs font-mono">
        {/* DIRECTION VECTOR */}
        <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5 min-w-0 transition-colors hover:bg-[var(--bg-elevated)]">
          <div className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider flex items-center justify-between">
            <span title="Calculated from consecutive pixel coordinates">DIRECTION · IMAGE-BASED MOVEMENT</span>
            <Navigation className="w-3 h-3 text-[var(--thermal-cyan)] transform rotate-45" />
          </div>
          <div className="text-xs font-bold text-[var(--thermal-cyan)] truncate">
            {target?.direction && target.direction !== 'N/A' ? target.direction : 'STATIONARY'}
          </div>
        </div>

        {/* ESTIMATED SPEED */}
        <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5 min-w-0 transition-colors hover:bg-[var(--bg-elevated)]">
          <div className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider flex items-center justify-between">
            <span>ESTIMATED SPEED</span>
            <Activity className="w-3 h-3 text-[var(--warning-amber)]" />
          </div>
          <div className="text-xs font-bold text-[var(--warning-amber)] truncate">
            {target?.speed && target.speed > 0 ? `${target.speed.toFixed(1)} km/h` : 'N/A'}
          </div>
        </div>

        {/* AI CONFIDENCE */}
        <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5 min-w-0 transition-colors hover:bg-[var(--bg-elevated)]">
          <div className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider flex items-center justify-between">
            <span>AI CONFIDENCE</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--operational-green)]" />
          </div>
          <div className="text-xs font-bold text-[var(--operational-green)] truncate">
            {target ? `${(target.confidence * 100).toFixed(1)}%` : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TargetTrajectory3D;
