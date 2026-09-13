import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { apiService } from '../../services/api';
import { SystemCore3D } from '../3d/SystemCore3D';

interface LoadingScreenProps {
  onComplete: () => void;
}

interface ServiceNode {
  id: string;
  code: string;
  label: string;
  statusText: string;
  angle: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState<number>(0);
  const [isSystemReady, setIsSystemReady] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // 6 Fixed Subsystem Nodes around the 360° Ring
  const serviceNodes: ServiceNode[] = [
    { id: 'sensor', code: '01', label: 'SENSOR', statusText: 'INITIALIZING SENSOR', angle: -90 },
    { id: 'stream', code: '02', label: 'STREAM', statusText: 'CONNECTING STREAM', angle: -150 },
    { id: 'inference', code: '03', label: 'INFERENCE', statusText: 'LOADING YOLO INFERENCE ENGINE', angle: -30 },
    { id: 'tracker', code: '04', label: 'TRACKER', statusText: 'STARTING TRACKER', angle: -210 },
    { id: 'threats', code: '05', label: 'THREAT', statusText: 'ACTIVATING THREAT ENGINE', angle: 30 },
    { id: 'sync', code: '06', label: 'SYNC', statusText: 'SYNCHRONIZING COMMAND CENTER', angle: 90 },
  ];

  // Smooth & Throttled Boot Sequence (~2.0s)
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const startTime = Date.now();

    // Silent background probe
    apiService.getSystemStatus().catch(() => {});
    apiService.getZones().catch(() => {});

    const bootDuration = 2000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / bootDuration) * 100));
      setProgress(pct);

      const step = Math.min(5, Math.floor((pct / 100) * 6));
      setActiveStepIndex(step);

      if (pct >= 100) {
        clearInterval(interval);
        setIsSystemReady(true);

        timer = setTimeout(() => {
          onCompleteRef.current();
        }, 350);
      }
    }, 40);

    return () => {
      clearInterval(interval);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const outerRadius = 180;
  const circumference = 2 * Math.PI * outerRadius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const currentStatusText = isSystemReady
    ? 'SYSTEM READY • ACCESSING COMMAND CENTER'
    : serviceNodes[activeStepIndex]?.statusText || 'INITIALIZING SENSOR';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 bg-[#05080D] flex flex-col justify-between p-6 sm:p-8 select-none font-sans overflow-hidden"
    >
      {/* Ambient Grid Background */}
      <div className="absolute inset-0 bg-soft-grid opacity-50 pointer-events-none" />

      {/* Top Header Bar */}
      <div className="relative z-10 w-full flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-[#0B1018] border border-[#55D9F5]/30 flex items-center justify-center text-[#55D9F5] shadow-lg">
            <Radio className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[#F3F6FA] font-sans tracking-tight">AI-MULTISENSE</span>
            <span className="text-[10px] font-mono text-[#9AA7B8]">REAL-TIME THERMAL SURVEILLANCE</span>
          </div>
        </div>

        <div className="px-3.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10px] font-mono flex items-center space-x-2 text-[#55D9F5]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#55D9F5]" />
          <span>SYSTEM BOOT v1.0</span>
        </div>
      </div>

      {/* CENTRAL HERO VISUALIZATION (420px container) */}
      <div className="relative z-10 max-w-xl w-full mx-auto text-center my-auto flex flex-col items-center justify-center space-y-4">
        {/* Title Block */}
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold font-sans text-[#F3F6FA] tracking-tight uppercase">
            SYSTEM INITIALIZATION
          </h1>
          <p className="text-xs font-sans text-[#9AA7B8] max-w-sm mx-auto">
            Establishing secure sensor link, inference pipeline and tracking services.
          </p>
        </div>

        {/* 2.5D HOLOGRAPHIC CORE & ORBITAL NODES CONTAINER */}
        <div className="relative w-[380px] h-[380px] sm:w-[420px] sm:h-[420px] flex items-center justify-center shrink-0 my-1">
          {/* Lightweight 2.5D Holographic Sensor Core */}
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <SystemCore3D progress={progress} currentStepIndex={activeStepIndex} isComplete={isSystemReady} />
          </div>

          {/* SVG Radial Progress Arc */}
          <svg
            width="420"
            height="420"
            viewBox="0 0 420 420"
            className="absolute inset-0 pointer-events-none rotate-[-90deg] w-full h-full z-15"
          >
            {/* Background Outer Ring Base */}
            <circle
              cx="210"
              cy="210"
              r="180"
              fill="none"
              stroke="rgba(255, 255, 255, 0.04)"
              strokeWidth="2"
            />

            {/* Dynamic Radial Progress Arc with hardware transition */}
            <circle
              cx="210"
              cy="210"
              r="180"
              fill="none"
              stroke={isSystemReady ? '#4FD1A5' : '#55D9F5'}
              strokeWidth="2.5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-150 ease-out"
            />
          </svg>

          {/* 6 FIXED SUBSYSTEM NODES (Opacity & Scale Transitions) */}
          <div className="absolute inset-0 pointer-events-none z-20">
            {serviceNodes.map((node, idx) => {
              const rad = (node.angle * Math.PI) / 180;
              const orbitR = 180;
              const nx = 210 + Math.cos(rad) * orbitR;
              const ny = 210 + Math.sin(rad) * orbitR;

              const isNodeReady = progress >= (idx + 1) * 16.6 || isSystemReady;
              const isNodeActive = activeStepIndex === idx && !isSystemReady;

              return (
                <div
                  key={node.id}
                  style={{
                    left: `${(nx / 420) * 100}%`,
                    top: `${(ny / 420) * 100}%`,
                    transform: 'translate(-50%, -50%) translateZ(0)',
                  }}
                  className={`absolute flex flex-col items-center z-20 transition-all duration-300 ${
                    isNodeReady
                      ? 'opacity-100 scale-100'
                      : isNodeActive
                      ? 'opacity-100 scale-100'
                      : 'opacity-40 scale-95'
                  }`}
                >
                  {/* Node Status Dot */}
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all duration-300 ${
                      isNodeReady
                        ? 'bg-[#4FD1A5] border-[#4FD1A5] shadow-[0_0_8px_#4FD1A5]'
                        : isNodeActive
                        ? 'bg-[#55D9F5] border-[#55D9F5] shadow-[0_0_8px_#55D9F5]'
                        : 'bg-[#0B1018] border-[#667386]'
                    }`}
                  >
                    {isNodeReady && <span className="w-1.5 h-1.5 rounded-full bg-[#05080D]" />}
                  </div>

                  {/* Subsystem Text Label */}
                  <span
                    className={`mt-1.5 text-[9px] sm:text-[10px] font-mono tracking-wider font-semibold whitespace-nowrap transition-colors duration-300 ${
                      isNodeReady
                        ? 'text-[#4FD1A5]'
                        : isNodeActive
                        ? 'text-[#55D9F5]'
                        : 'text-[#667386]'
                    }`}
                  >
                    {node.code} {node.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* DYNAMIC SYSTEM STATUS READOUT & PERCENTAGE */}
        <div className="space-y-1">
          <div
            className={`text-xs font-mono font-semibold tracking-wider transition-colors duration-200 ${
              isSystemReady ? 'text-[#4FD1A5]' : 'text-[#55D9F5]'
            }`}
          >
            {currentStatusText}
          </div>

          <div className="text-sm font-mono text-[#9AA7B8] font-medium">
            {progress}%
          </div>
        </div>
      </div>

      {/* Technical Metadata Footer Bar */}
      <div className="relative z-10 w-full border-t border-white/[0.05] pt-3 flex flex-wrap items-center justify-between text-[10px] font-mono text-[#667386] gap-2">
        <div>AI-MULTISENSE v1.0 // SENSOR LINK OK</div>
        <div className="flex items-center space-x-3 sm:space-x-4">
          <span>SENSOR: <span className="text-[#9AA7B8]">FLIR AX65</span></span>
          <span>MODEL: <span className="text-[#8C9BFF]">YOLO THERMAL</span></span>
          <span>TRACKER: <span className="text-[#9AA7B8]">BYTETRACK</span></span>
          <span>STATUS: <span className={isSystemReady ? 'text-[#4FD1A5] font-semibold' : 'text-[#55D9F5]'}>{isSystemReady ? 'READY' : 'INITIALIZING'}</span></span>
        </div>
      </div>
    </motion.div>
  );
};
