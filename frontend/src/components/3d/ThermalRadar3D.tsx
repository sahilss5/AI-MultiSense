import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ThermalDetectionObject } from '../../types/schema';

interface ThermalRadar3DProps {
  detections?: ThermalDetectionObject[];
  isDemo?: boolean;
  className?: string;
}

interface TacticalTrack {
  id: string;
  trackId: number;
  trackCode: string;
  category: string;
  confidence: number;
  threat: boolean;
  threatLevel: string;
  baseX: number; // normalized -1 to 1 relative to camera
  baseY: number; // normalized -1 to 1 relative to camera
  elevationPx: number;
  bearingDeg: number;
  relDistPercent: number;
  isDemo?: boolean;
}

export const ThermalRadar3D: React.FC<ThermalRadar3DProps> = ({
  detections = [],
  isDemo = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<TacticalTrack | null>(null);
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Standardized Category Formatter
  const formatCategory = (cls: string = 'Target'): string => {
    const norm = cls.replace(/_/g, ' ').toUpperCase().trim();
    if (norm.includes('DRONE')) return 'DRONE';
    if (norm.includes('VEHICLE') || norm.includes('CAR') || norm.includes('TRUCK')) return 'VEHICLE';
    if (norm.includes('ANIMAL') || norm.includes('DOG') || norm.includes('CAT')) return 'ANIMAL';
    if (norm.includes('BAG')) return 'PERSON WITH BAG';
    if (norm.includes('PERSON')) return 'PERSON';
    return norm || 'TARGET';
  };

  // Elevation by category for 3D depth
  const getElevationPx = (cat: string): number => {
    if (cat === 'DRONE') return 36;
    if (cat === 'PERSON WITH BAG') return 22;
    if (cat === 'PERSON') return 20;
    if (cat === 'VEHICLE') return 16;
    if (cat === 'ANIMAL') return 12;
    return 18;
  };

  // Default demo tracks for Demo Simulation mode only
  const demoTracks: TacticalTrack[] = [
    {
      id: 'demo-trk-1',
      trackId: 24,
      trackCode: 'T-24',
      category: 'PERSON',
      confidence: 0.974,
      threat: false,
      threatLevel: 'NORMAL',
      baseX: 0.32,
      baseY: -0.35,
      elevationPx: 20,
      bearingDeg: 42,
      relDistPercent: 47,
      isDemo: true,
    },
    {
      id: 'demo-trk-2',
      trackId: 82,
      trackCode: 'T-82',
      category: 'DRONE',
      confidence: 0.991,
      threat: true,
      threatLevel: 'HIGH',
      baseX: -0.46,
      baseY: -0.38,
      elevationPx: 36,
      bearingDeg: 310,
      relDistPercent: 60,
      isDemo: true,
    },
    {
      id: 'demo-trk-3',
      trackId: 18,
      trackCode: 'T-18',
      category: 'VEHICLE',
      confidence: 0.942,
      threat: true,
      threatLevel: 'HIGH',
      baseX: 0.42,
      baseY: 0.48,
      elevationPx: 16,
      bearingDeg: 139,
      relDistPercent: 64,
      isDemo: true,
    },
  ];

  // Track persistence ref to stabilize Track IDs across frame jitter
  const prevTracksRef = useRef<Map<string, { trackId: number; baseX: number; baseY: number }>>(new Map());

  // Map real ByteTrack detections whenever present
  const tracks: TacticalTrack[] =
    detections.length > 0
      ? detections.map((d, idx) => {
          const cx = (d.bbox[0] + d.bbox[2]) / 2;
          const cy = (d.bbox[1] + d.bbox[3]) / 2;
          // Scale camera relative coordinates to fit radar grid comfortably
          const normX = Math.max(-0.9, Math.min(0.9, (cx - 0.5) * 1.7));
          const normY = Math.max(-0.9, Math.min(0.9, (cy - 0.5) * 1.7));

          const cat = formatCategory(d.class);
          const brg = Math.round(((Math.atan2(normX, -normY) * 180) / Math.PI + 360) % 360);
          const relDist = Math.round(Math.min(100, Math.sqrt(normX * normX + normY * normY) * 100));

          // Determine stable track ID
          let assignedTrackId = d.track_id;
          if (assignedTrackId == null || assignedTrackId <= 0) {
            // Check if matches previous frame track by category & spatial proximity
            const cached = prevTracksRef.current.get(cat);
            if (cached) {
              const dist = Math.sqrt((normX - cached.baseX) ** 2 + (normY - cached.baseY) ** 2);
              if (dist < 0.45) {
                assignedTrackId = cached.trackId;
              }
            }
          }
          if (assignedTrackId == null || assignedTrackId <= 0) {
            assignedTrackId = idx + 1;
          }

          // Update cache
          prevTracksRef.current.set(cat, {
            trackId: assignedTrackId,
            baseX: normX,
            baseY: normY,
          });

          return {
            id: d.id || `trk-${assignedTrackId}-${idx}`,
            trackId: assignedTrackId,
            trackCode: `T-${assignedTrackId}`,
            category: cat,
            confidence: d.confidence || 0.90,
            threat: !!d.threat,
            threatLevel: d.threat_level || (d.threat ? 'HIGH' : 'NORMAL'),
            baseX: normX,
            baseY: normY,
            elevationPx: getElevationPx(cat),
            bearingDeg: brg,
            relDistPercent: relDist,
            isDemo: false,
          };
        })
      : isDemo
      ? demoTracks
      : [];

  // Parallax on mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!viewportRef.current || window.innerWidth < 768) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setTilt({
      x: -y * 1.5,
      y: x * 1.5,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setHoveredTrack(null);
  }, []);

  // Visual color distinction: Threat = Coral Red, Normal = Cyan / Blue / Green
  const getTrackHex = (t: TacticalTrack) => {
    if (t.threat) return '#F27786'; // Threat Coral
    if (t.category === 'DRONE') return '#8C9BFF'; // Intelligence Violet
    if (t.category === 'VEHICLE') return '#FBBF24'; // Warning Amber
    if (t.category === 'ANIMAL') return '#34D399'; // Operational Green
    return '#55D9F5'; // Thermal Cyan
  };

  // Azimuth markings
  const azimuthTicks = [
    { deg: 0, label: 'N' },
    { deg: 30, label: '030°' },
    { deg: 60, label: '060°' },
    { deg: 90, label: 'E' },
    { deg: 120, label: '120°' },
    { deg: 150, label: '150°' },
    { deg: 180, label: 'S' },
    { deg: 210, label: '210°' },
    { deg: 240, label: '240°' },
    { deg: 270, label: 'W' },
    { deg: 300, label: '300°' },
    { deg: 330, label: '330°' },
  ];

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-w-full min-w-0 rounded-2xl bg-[#070B12] border border-[var(--border-subtle)] overflow-hidden flex flex-col justify-between p-3.5 sm:p-4 select-none font-sans box-border ${className}`}
      role="region"
      aria-label="3D Tactical Target Map"
    >
      {/* 1. COMPONENT HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)] z-20">
        <div className="flex items-center space-x-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full ${
              tracks.length > 0
                ? 'bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]'
                : 'bg-slate-500'
            } shrink-0`}
          />
          <h3 className="text-xs font-bold font-sans tracking-wide text-[var(--text-primary)] uppercase truncate">
            TACTICAL TARGET MAP
          </h3>
          <span className="text-[10px] font-mono text-[var(--text-secondary)]">
            {tracks.length > 0 && tracks[0].isDemo ? 'DEMO SIMULATION' : 'THERMAL FOV'}
          </span>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-[var(--thermal-cyan)]/10 text-[var(--thermal-cyan)] border border-[var(--thermal-cyan)]/25">
            RELATIVE POSITION
          </span>
        </div>
      </div>

      {/* 2. MAIN 3D ISOMETRIC RADAR CANVAS / HIGH-RES SVG VIEWPORT */}
      <div
        ref={viewportRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative w-full max-w-full min-w-0 h-64 sm:h-72 my-1.5 flex items-center justify-center overflow-hidden rounded-xl bg-[#05080D]/90"
      >
        {/* Crisp 3D Isometric Platform (Depth & Tilt Layer) */}
        <div
          style={{
            transform: `perspective(700px) rotateX(${50 + tilt.x}deg) rotateY(${tilt.y}deg)`,
            transformStyle: 'preserve-3d',
            transition: 'transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center shrink-0"
        >
          {/* Physical Bottom Platform Rim Layer */}
          <div
            style={{ transform: 'translateZ(-12px)' }}
            className="absolute inset-0 rounded-full border border-black bg-[#030508] shadow-[0_20px_35px_rgba(0,0,0,0.9)] pointer-events-none"
          />

          {/* Physical Platform Rim Bevel */}
          <div
            style={{ transform: 'translateZ(-6px)' }}
            className="absolute inset-0 rounded-full border border-[var(--border-subtle)] bg-[#070A10] pointer-events-none"
          />

          {/* Top Radar Surface Plane (Crisp High-DPI Vector Canvas) */}
          <svg
            viewBox="0 0 600 600"
            shapeRendering="geometricPrecision"
            textRendering="geometricPrecision"
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          >
            {/* Outer Perimeter Rim */}
            <circle
              cx="300"
              cy="300"
              r="285"
              fill="none"
              stroke="rgba(85, 217, 245, 0.40)"
              strokeWidth="2"
            />
            <circle
              cx="300"
              cy="300"
              r="292"
              fill="none"
              stroke="rgba(120, 160, 200, 0.15)"
              strokeWidth="1"
            />

            {/* Concentric Relative Range Rings (25%, 50%, 75%, MAX FOV) */}
            {[
              { r: 75, label: '25%' },
              { r: 145, label: '50%' },
              { r: 215, label: '75%' },
              { r: 285, label: 'MAX FOV' },
            ].map((ring, idx) => (
              <g key={idx}>
                <circle
                  cx="300"
                  cy="300"
                  r={ring.r}
                  fill="none"
                  stroke={idx === 3 ? 'rgba(85, 217, 245, 0.40)' : 'rgba(120, 160, 200, 0.18)'}
                  strokeWidth={idx === 3 ? '2' : '1.2'}
                  strokeDasharray={idx === 1 ? '4 4' : 'none'}
                />
                {/* Distance Markings */}
                <text
                  x="305"
                  y={300 - ring.r + 14}
                  fill="rgba(154, 167, 184, 0.70)"
                  fontSize="12"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  {ring.label}
                </text>
              </g>
            ))}

            {/* Radial Azimuth Grid Lines */}
            {azimuthTicks.map((tick) => {
              const rad = ((tick.deg - 90) * Math.PI) / 180;
              const x2 = 300 + Math.cos(rad) * 285;
              const y2 = 300 + Math.sin(rad) * 285;
              const isMajor = tick.deg % 90 === 0;

              return (
                <g key={tick.deg}>
                  <line
                    x1="300"
                    y1="300"
                    x2={x2}
                    y2={y2}
                    stroke={isMajor ? 'rgba(85, 217, 245, 0.28)' : 'rgba(120, 160, 200, 0.12)'}
                    strokeWidth={isMajor ? '1.5' : '1'}
                    strokeDasharray={isMajor ? 'none' : '3 4'}
                  />
                  {!isMajor && (
                    <text
                      x={300 + Math.cos(rad) * 260}
                      y={300 + Math.sin(rad) * 260 + 4}
                      fill="rgba(154, 167, 184, 0.50)"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {tick.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Cardinal Direction Markers */}
            <text x="300" y="30" fill="#55D9F5" fontSize="16" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">N</text>
            <text x="575" y="305" fill="#9AA7B8" fontSize="14" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">E</text>
            <text x="300" y="580" fill="#9AA7B8" fontSize="14" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">S</text>
            <text x="25" y="305" fill="#9AA7B8" fontSize="14" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">W</text>

            {/* CENTRAL THERMAL CAMERA MARKER */}
            <g transform="translate(300, 300)">
              <circle r="7" fill="#55D9F5" />
              <circle r="14" fill="none" stroke="#55D9F5" strokeWidth="1.5" strokeOpacity="0.4" />
              <text y="22" fill="#55D9F5" fontSize="11" fontFamily="JetBrains Mono, monospace" fontWeight="bold" textAnchor="middle">
                ● CAMERA
              </text>
            </g>
          </svg>

          {/* 3D TRACKED TARGET OBJECTS */}
          {tracks.map((trk, idx) => {
            const isHovered = hoveredTrack?.id === trk.id;
            const hex = trk.threat ? '#FF5C5C' : '#55D9F5';

            // Coordinated position relative to camera center (300, 300)
            const groundX = 300 + trk.baseX * 165;
            const groundY = 300 + trk.baseY * 165;

            return (
              <div
                key={`${trk.id}-${idx}`}
                style={{
                  left: `${(groundX / 600) * 100}%`,
                  top: `${(groundY / 600) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  transition: 'left 0.2s cubic-bezier(0.2, 0, 0, 1), top 0.2s cubic-bezier(0.2, 0, 0, 1)',
                }}
                onMouseEnter={() => setHoveredTrack(trk)}
                onMouseLeave={() => setHoveredTrack(null)}
                className="absolute z-30 cursor-pointer group pointer-events-auto"
              >
                {/* 1. Ground Surface Footprint Ring (◎) */}
                <div
                  style={{
                    borderColor: hex,
                    boxShadow: `0 0 10px ${hex}80`,
                  }}
                  className={`w-6 h-6 -ml-3 -mt-3 rounded-full border-2 transition-all duration-150 ${
                    isHovered ? 'scale-125 opacity-100' : 'opacity-70 scale-100'
                  }`}
                />

                {/* 2. Vertical 3D Height Stem (│) */}
                <div
                  style={{
                    height: `${trk.elevationPx}px`,
                    backgroundColor: hex,
                    bottom: '12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                  className="absolute w-0.5 opacity-80 pointer-events-none"
                />

                {/* 3. Elevated Target Core Marker Dot (●) */}
                <div
                  style={{
                    bottom: `${12 + trk.elevationPx}px`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: hex,
                    boxShadow: `0 0 12px ${hex}`,
                  }}
                  className={`absolute w-3.5 h-3.5 rounded-full flex items-center justify-center transition-transform duration-150 ${
                    isHovered ? 'scale-125' : 'scale-100'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#05080D]" />
                </div>

                {/* 4. Target Label Badge: TRACK ID + CLASS + THREAT */}
                <div
                  style={{
                    bottom: `${26 + trk.elevationPx}px`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                  className={`absolute whitespace-nowrap px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-tight pointer-events-none shadow-xl flex flex-col items-center ${
                    trk.threat
                      ? 'bg-[#180A0E]/95 border border-[var(--threat-coral)] text-[var(--threat-coral)]'
                      : 'bg-[#070B12]/95 border border-[var(--thermal-cyan)] text-[var(--thermal-cyan)]'
                  }`}
                >
                  <span className="leading-tight">{trk.trackCode} · {trk.category}</span>
                  {trk.threat ? (
                    <span className="text-[7.5px] font-extrabold text-[var(--threat-coral)] tracking-wider">
                      ● THREAT ({trk.threatLevel})
                    </span>
                  ) : (
                    <span className="text-[7.5px] text-[var(--operational-green)] font-semibold">
                      NORMAL
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* EMPTY STATE (When no tracks are detected in real mode) */}
        {tracks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-35 bg-[#05080D]/40 backdrop-blur-[1px]">
            <div className="px-3.5 py-2 rounded-xl bg-[#080D16]/90 border border-[var(--border-subtle)] text-center space-y-1 shadow-lg">
              <div className="text-xs font-mono font-bold text-[var(--text-secondary)] tracking-wide">
                NO ACTIVE TARGETS
              </div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">
                Waiting for thermal detections...
              </div>
            </div>
          </div>
        )}

        {/* FLOATING HOVER TELEMETRY HUD TOOLTIP */}
        {hoveredTrack && (
          <div className="absolute top-2 left-2 z-40 bg-[#0B1018]/95 backdrop-blur-md border border-[var(--thermal-cyan)]/50 p-2.5 rounded-xl shadow-2xl space-y-1 text-left w-48 pointer-events-none animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1">
              <span className="font-mono text-xs font-bold text-[var(--thermal-cyan)]">
                {hoveredTrack.trackCode}
              </span>
              <span
                className={`text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded ${
                  hoveredTrack.threat
                    ? 'bg-[var(--threat-coral)]/20 text-[var(--threat-coral)]'
                    : 'bg-[var(--operational-green)]/20 text-[var(--operational-green)]'
                }`}
              >
                {hoveredTrack.threat ? `THREAT (${hoveredTrack.threatLevel})` : 'NORMAL'}
              </span>
            </div>

            <div className="text-[11px] font-semibold text-[var(--text-primary)]">
              {hoveredTrack.category}
            </div>

            <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-[var(--text-secondary)]">
              <div>
                CONF: <span className="text-[var(--operational-green)]">{(hoveredTrack.confidence * 100).toFixed(1)}%</span>
              </div>
              <div>
                BRG: <span className="text-[var(--intelligence-violet)]">{hoveredTrack.bearingDeg}°</span>
              </div>
              <div className="col-span-2">
                REL DIST: <span className="text-[var(--text-primary)]">{hoveredTrack.relDistPercent}% of Max FOV</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. ACTIVE TARGETS MINI-LEGEND */}
      <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5 font-mono">
        <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
          <span>ACTIVE TARGETS ({tracks.length})</span>
          <span className="text-[9px] text-[var(--text-secondary)]">TRACK POSITION</span>
        </div>

        {tracks.length === 0 ? (
          <div className="text-[10px] font-mono text-[var(--text-muted)] italic py-0.5">
            No active targets detected
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-24 overflow-y-auto pr-1">
            {tracks.map((t, idx) => (
              <div
                key={`${t.id}-${idx}`}
                onMouseEnter={() => setHoveredTrack(t)}
                onMouseLeave={() => setHoveredTrack(null)}
                className={`px-2 py-1 rounded-lg border flex items-center justify-between text-[10px] transition-colors cursor-pointer ${
                  t.threat
                    ? 'bg-[var(--threat-coral)]/10 border-[var(--threat-coral)]/30 text-[var(--threat-coral)] hover:bg-[var(--threat-coral)]/20'
                    : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <span className="font-bold font-mono">{t.trackCode}</span>
                <span className="text-[9px] uppercase font-sans font-medium text-[var(--text-secondary)] truncate mx-1">
                  {t.category}
                </span>
                <span
                  className={`text-[8.5px] font-bold px-1 rounded shrink-0 ${
                    t.threat
                      ? 'bg-[var(--threat-coral)]/20 text-[var(--threat-coral)]'
                      : 'bg-[var(--operational-green)]/15 text-[var(--operational-green)]'
                  }`}
                >
                  {t.threat ? (t.threatLevel || 'HIGH') : 'NORMAL'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. BOTTOM TELEMETRY STATUS STRIP */}
      <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between text-[10px] font-mono text-[var(--text-secondary)] gap-1.5 z-20">
        <div className="flex items-center space-x-2">
          {tracks.length > 0 ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_6px_var(--operational-green)] shrink-0" />
              <span className="text-[var(--operational-green)] font-bold">TRACKING ACTIVE</span>
              <span>•</span>
              <span className="text-[var(--text-primary)] font-semibold">
                {tracks.length} ACTIVE TARGET{tracks.length > 1 ? 'S' : ''}
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />
              <span className="text-[var(--text-muted)] font-semibold">NO ACTIVE TRACKS</span>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2 shrink-0 text-[9px] text-[var(--text-muted)]">
          <span>RELATIVE POSITION</span>
          <span>•</span>
          <span>THERMAL SENSOR</span>
        </div>
      </div>
    </div>
  );
};

export const TacticalRadar3D = ThermalRadar3D;
export default ThermalRadar3D;
