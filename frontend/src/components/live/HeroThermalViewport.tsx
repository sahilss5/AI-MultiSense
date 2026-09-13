import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Radio, Cpu, User } from 'lucide-react';

export const HeroThermalViewport: React.FC = () => {
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [frameTick, setFrameTick] = useState<number>(0);
  const [liveFps, setLiveFps] = useState<number>(29.8);
  const [liveConfidence, setLiveConfidence] = useState<number>(96.7);
  const [acqPhase, setAcqPhase] = useState<number>(5); // 1: point, 2: brackets, 3: box, 4: track, 5: full lock
  const containerRef = useRef<HTMLDivElement | null>(null);

  // RequestAnimationFrame loop for continuous trajectory motion
  useEffect(() => {
    let animId: number;
    let t = 0;

    const tick = () => {
      t += 0.012;
      setFrameTick(t);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Believable subtle micro-updates for telemetry
  useEffect(() => {
    const fpsTimer = setInterval(() => {
      const fpsOffsets = [29.8, 30.0, 30.1, 29.9, 30.2, 29.7];
      const nextFps = fpsOffsets[Math.floor(Math.random() * fpsOffsets.length)];
      setLiveFps(nextFps);

      const confOffsets = [96.7, 96.8, 96.6, 96.9, 96.7, 97.1];
      const nextConf = confOffsets[Math.floor(Math.random() * confOffsets.length)];
      setLiveConfidence(nextConf);
    }, 1800);

    return () => clearInterval(fpsTimer);
  }, []);

  // Re-trigger target acquisition sequence periodically for demonstration
  useEffect(() => {
    const phaseTimer = setInterval(() => {
      setAcqPhase(1);
      setTimeout(() => setAcqPhase(2), 250);
      setTimeout(() => setAcqPhase(3), 500);
      setTimeout(() => setAcqPhase(4), 750);
      setTimeout(() => setAcqPhase(5), 1000);
    }, 12000);

    return () => clearInterval(phaseTimer);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  // Target 1: PERSON (Thermal Cyan #55D9F5)
  const target1 = {
    x: 24 + Math.sin(frameTick * 0.7) * 9,
    y: 32 + Math.cos(frameTick * 0.5) * 6,
  };

  // Target 2: DRONE (Intelligence Violet #8C9BFF)
  const target2 = {
    x: 54 + Math.sin(frameTick * 0.9) * 12,
    y: 20 + Math.cos(frameTick * 0.7) * 5,
  };

  // Target 3: VEHICLE (Threat Coral #F27786)
  const target3 = {
    x: 63 + Math.cos(frameTick * 0.5) * 10,
    y: 54 + Math.sin(frameTick * 0.4) * 8,
  };

  // Calculate current scan line position Y % (0 -> 100)
  const scanLineY = ((frameTick * 18) % 100);

  // Check if scan line is currently passing near target 1
  const isScanOverTarget1 = Math.abs(scanLineY - target1.y) < 12;

  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative select-none group"
    >
      {/* Background Radial Glow */}
      <div
        className="absolute inset-0 ambient-glow-cyan pointer-events-none opacity-40 transform transition-transform duration-500 ease-out scale-110"
        style={{
          transform: `translate3d(${mousePos.x * 10}px, ${mousePos.y * 10}px, 0) scale(1.1)`,
        }}
      />

      {/* Main Thermal Intelligence Window */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        style={{
          transform: `translate3d(${mousePos.x * 5}px, ${mousePos.y * 5}px, 0)`,
        }}
        className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl bg-[#0B0F16] p-3 backdrop-blur-xl transition-all duration-300 group-hover:border-[#55D9F5]/30 group-hover:shadow-[#55D9F5]/10"
      >
        {/* Outer Corner Precision Markers */}
        <div className="absolute top-2.5 left-2.5 text-[#55D9F5]/40 text-xs font-mono z-30">┌</div>
        <div className="absolute top-2.5 right-2.5 text-[#55D9F5]/40 text-xs font-mono z-30">┐</div>
        <div className="absolute bottom-2.5 left-2.5 text-[#55D9F5]/40 text-xs font-mono z-30">└</div>
        <div className="absolute bottom-2.5 right-2.5 text-[#55D9F5]/40 text-xs font-mono z-30">┘</div>

        {/* Viewport Thermal Stream Canvas Surface */}
        <div className="relative aspect-video rounded-xl bg-[#05070B] overflow-hidden border border-white/[0.06]">
          {/* Simulated Dark Thermal Spectrum Background */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0D1524] via-[#080D17] to-[#05070B]" />

          {/* Environmental Thermal Noise & Vignette Overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(5,7,11,0.88)_100%)] pointer-events-none z-10" />

          {/* Atmospheric Thermal Heat Blooms */}
          <div
            className={`absolute w-44 h-44 rounded-full blur-2xl transition-opacity duration-300 bg-[#55D9F5] pointer-events-none ${
              isScanOverTarget1 || hoveredTarget === 'target1' ? 'opacity-40 scale-110' : 'opacity-18'
            }`}
            style={{ left: `${target1.x - 8}%`, top: `${target1.y - 8}%` }}
          />
          <div
            className={`absolute w-40 h-40 rounded-full blur-2xl bg-[#8C9BFF] pointer-events-none transition-all duration-300 ${
              hoveredTarget === 'target2' ? 'opacity-40 scale-110' : 'opacity-18'
            }`}
            style={{ left: `${target2.x - 8}%`, top: `${target2.y - 8}%` }}
          />
          <div
            className={`absolute w-48 h-48 rounded-full blur-2xl bg-[#F27786] pointer-events-none transition-all duration-300 ${
              hoveredTarget === 'target3' ? 'opacity-40 scale-110' : 'opacity-18'
            }`}
            style={{ left: `${target3.x - 10}%`, top: `${target3.y - 10}%` }}
          />

          {/* Horizontal Thermal Scanning Beam (4-6s Loop) */}
          <div
            className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#55D9F5]/45 to-transparent z-20 pointer-events-none transition-all duration-75 shadow-[0_0_8px_rgba(85,217,245,0.35)]"
            style={{ top: `${scanLineY}%` }}
          />

          {/* TARGET 1: PERSON (Thermal Cyan #55D9F5) */}
          <div
            onMouseEnter={() => setHoveredTarget('target1')}
            onMouseLeave={() => setHoveredTarget(null)}
            className={`absolute border rounded-md p-1.5 backdrop-blur-[2px] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] z-20 cursor-pointer origin-center ${
              hoveredTarget === 'target1'
                ? 'scale-[1.04] border-[#55D9F5] bg-[#55D9F5]/[0.18] shadow-[0_0_20px_rgba(85,217,245,0.4)] z-30 opacity-100'
                : hoveredTarget !== null
                ? 'opacity-70 border-[#55D9F5]/50 bg-[#55D9F5]/[0.04]'
                : isScanOverTarget1
                ? 'border-[#55D9F5] bg-[#55D9F5]/[0.10] shadow-[0_0_14px_rgba(85,217,245,0.25)]'
                : 'border-[#55D9F5]/75 bg-[#55D9F5]/[0.05] shadow-md shadow-[#55D9F5]/10 animate-box-breath'
            }`}
            style={{
              left: `${target1.x}%`,
              top: `${target1.y}%`,
              width: '25%',
              height: '36%',
            }}
          >
            {/* Target Lock Background Pulse when Hovered */}
            {hoveredTarget === 'target1' && (
              <span className="absolute -inset-1 rounded-lg border border-[#55D9F5]/60 animate-ping pointer-events-none opacity-40" />
            )}

            {/* Corner Lock Brackets */}
            {acqPhase >= 2 && (
              <>
                <span className={`absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 ${hoveredTarget === 'target1' ? 'border-[#55D9F5] scale-110' : 'border-[#55D9F5]'}`} />
                <span className={`absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 ${hoveredTarget === 'target1' ? 'border-[#55D9F5] scale-110' : 'border-[#55D9F5]'}`} />
                <span className={`absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 ${hoveredTarget === 'target1' ? 'border-[#55D9F5] scale-110' : 'border-[#55D9F5]'}`} />
                <span className={`absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 ${hoveredTarget === 'target1' ? 'border-[#55D9F5] scale-110' : 'border-[#55D9F5]'}`} />
              </>
            )}

            {/* Tiny Detection Center Marker */}
            {acqPhase === 1 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-[#55D9F5] animate-ping" />
              </div>
            )}

            {/* Track ID, Class & Confidence Label */}
            {acqPhase >= 4 && (
              <div className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded inline-flex items-center space-x-1.5 border shadow-sm backdrop-blur-md transition-all duration-180 ${
                hoveredTarget === 'target1'
                  ? 'bg-[#05070B] text-white border-[#55D9F5]/60 shadow-[0_0_10px_rgba(85,217,245,0.3)] -translate-y-0.5'
                  : 'bg-[#05070B]/90 text-[#F5F7FA] border-white/10'
              }`}>
                <User className="w-3 h-3 text-[#55D9F5]" />
                <span>TRACK #024 · PERSON {acqPhase >= 5 ? '97.4%' : '...'}</span>
              </div>
            )}
          </div>

          {/* TARGET 2: DRONE (Intelligence Violet #8C9BFF) */}
          <div
            onMouseEnter={() => setHoveredTarget('target2')}
            onMouseLeave={() => setHoveredTarget(null)}
            className={`absolute border rounded-md p-1.5 backdrop-blur-[2px] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] z-20 cursor-pointer origin-center ${
              hoveredTarget === 'target2'
                ? 'scale-[1.04] border-[#8C9BFF] bg-[#8C9BFF]/[0.18] shadow-[0_0_20px_rgba(140,155,255,0.4)] z-30 opacity-100'
                : hoveredTarget !== null
                ? 'opacity-70 border-[#8C9BFF]/50 bg-[#8C9BFF]/[0.04]'
                : 'border-[#8C9BFF]/75 bg-[#8C9BFF]/[0.05] shadow-md shadow-[#8C9BFF]/10'
            }`}
            style={{
              left: `${target2.x}%`,
              top: `${target2.y}%`,
              width: '23%',
              height: '28%',
            }}
          >
            {/* Target Lock Background Pulse when Hovered */}
            {hoveredTarget === 'target2' && (
              <span className="absolute -inset-1 rounded-lg border border-[#8C9BFF]/60 animate-ping pointer-events-none opacity-40" />
            )}

            <span className={`absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 ${hoveredTarget === 'target2' ? 'border-[#8C9BFF] scale-110' : 'border-[#8C9BFF]'}`} />
            <span className={`absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 ${hoveredTarget === 'target2' ? 'border-[#8C9BFF] scale-110' : 'border-[#8C9BFF]'}`} />
            <span className={`absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 ${hoveredTarget === 'target2' ? 'border-[#8C9BFF] scale-110' : 'border-[#8C9BFF]'}`} />
            <span className={`absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 ${hoveredTarget === 'target2' ? 'border-[#8C9BFF] scale-110' : 'border-[#8C9BFF]'}`} />

            <div className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded inline-flex items-center space-x-1.5 border shadow-sm backdrop-blur-md transition-all duration-180 ${
              hoveredTarget === 'target2'
                ? 'bg-[#05070B] text-white border-[#8C9BFF]/60 shadow-[0_0_10px_rgba(140,155,255,0.3)] -translate-y-0.5'
                : 'bg-[#05070B]/90 text-[#F5F7FA] border-white/10'
            }`}>
              <Cpu className="w-3 h-3 text-[#8C9BFF]" />
              <span>TRACK #007 · DRONE 99.1%</span>
            </div>
          </div>

          {/* TARGET 3: VEHICLE (Threat Coral #F27786) */}
          <div
            onMouseEnter={() => setHoveredTarget('target3')}
            onMouseLeave={() => setHoveredTarget(null)}
            className={`absolute border rounded-md p-1.5 backdrop-blur-[2px] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] z-20 cursor-pointer origin-center ${
              hoveredTarget === 'target3'
                ? 'scale-[1.04] border-[#F27786] bg-[#F27786]/[0.18] shadow-[0_0_20px_rgba(242,119,134,0.4)] z-30 opacity-100'
                : hoveredTarget !== null
                ? 'opacity-70 border-[#F27786]/50 bg-[#F27786]/[0.04]'
                : 'border-[#F27786]/75 bg-[#F27786]/[0.05] shadow-md shadow-[#F27786]/10'
            }`}
            style={{
              left: `${target3.x}%`,
              top: `${target3.y}%`,
              width: '27%',
              height: '32%',
            }}
          >
            {/* Target Lock Background Pulse when Hovered */}
            {hoveredTarget === 'target3' && (
              <span className="absolute -inset-1 rounded-lg border border-[#F27786]/60 animate-ping pointer-events-none opacity-40" />
            )}

            <span className={`absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 ${hoveredTarget === 'target3' ? 'border-[#F27786] scale-110' : 'border-[#F27786]'}`} />
            <span className={`absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 ${hoveredTarget === 'target3' ? 'border-[#F27786] scale-110' : 'border-[#F27786]'}`} />
            <span className={`absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 ${hoveredTarget === 'target3' ? 'border-[#F27786] scale-110' : 'border-[#F27786]'}`} />
            <span className={`absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 ${hoveredTarget === 'target3' ? 'border-[#F27786] scale-110' : 'border-[#F27786]'}`} />

            <div className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded inline-flex items-center space-x-1.5 border shadow-sm backdrop-blur-md transition-all duration-180 ${
              hoveredTarget === 'target3'
                ? 'bg-[#05070B] text-white border-[#F27786]/60 shadow-[0_0_10px_rgba(242,119,134,0.3)] -translate-y-0.5'
                : 'bg-[#05070B]/90 text-[#F5F7FA] border-white/10'
            }`}>
              <ShieldAlert className="w-3 h-3 text-[#F27786]" />
              <span>TRACK #018 · VEHICLE 94.2%</span>
            </div>
          </div>

          {/* Header Telemetry Overlay */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-30 font-sans">
            <div className="bg-[#05070B]/85 px-3 py-1 rounded-full border border-white/10 text-[11px] text-[#55D9F5] flex items-center space-x-2 backdrop-blur-xl">
              <span className="w-2 h-2 rounded-full bg-[#4FD1A5] pulse-live shadow-[0_0_8px_#4FD1A5]" />
              <span>LIVE THERMAL FEED · CAM 01 · FOV 72°</span>
            </div>

            <div className="hidden sm:flex items-center space-x-2 bg-[#05070B]/85 px-3 py-1 rounded-full border border-white/10 text-[10px] font-mono text-[#4FD1A5] backdrop-blur-xl">
              <Radio className="w-3 h-3 text-[#4FD1A5] pulse-live" />
              <span>SENSOR ONLINE</span>
            </div>
          </div>

          {/* Telemetry Strip (Bottom Section) in JetBrains Mono */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none z-30 text-[10px] font-mono text-[#8D98AA]">
            <div className="bg-[#05070B]/85 px-3 py-1 rounded-full border border-white/10 backdrop-blur-2xl text-[#8D98AA]">
              LAT: 34° 03' 08" N &nbsp;|&nbsp; LON: 118° 14' 34" W
            </div>

            <div className="hidden sm:flex items-center space-x-3 bg-[#05070B]/85 px-3 py-1 rounded-full border border-white/10 backdrop-blur-2xl">
              <span>THERMAL <span className="text-[#F5F5F5]">{liveFps.toFixed(1)}</span> FPS</span>
              <span className="text-white/20">|</span>
              <span>TRACKS <span className="text-[#F5F5F5]">03</span></span>
              <span className="text-white/20">|</span>
              <span className="text-[#55D9F5] font-semibold">CONFIDENCE {liveConfidence.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
