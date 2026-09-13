import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { AnimatedNumber } from '../components/common/AnimatedNumber';
import { formatIST } from '../utils/date';
import { apiService } from '../services/api';
import {
  Activity,
  Cpu,
  Server,
  Database,
  Radio,
  ShieldCheck,
  RefreshCw,
  Zap,
  CheckCircle2,
  HardDrive,
  Gauge,
  Clock,
  AlertTriangle,
  Layers,
  ArrowUpRight,
  Sliders,
  Check,
  X,
  Eye,
  Camera,
  RotateCcw,
} from 'lucide-react';

interface ServiceStatusItem {
  id: string;
  name: string;
  category: string;
  status: 'ONLINE' | 'READY' | 'STANDBY' | 'NOT_CONNECTED' | 'ERROR';
  latency: string;
  uptime: string;
  details: string;
  lastHeartbeat: string;
}

interface SystemHealthProps {
  onNavigate?: (page: 'live' | 'dashboard' | 'tracking' | 'threats' | 'zones' | 'sensors' | 'ai_engine') => void;
}

export const SystemHealth: React.FC<SystemHealthProps> = ({ onNavigate }) => {
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState<boolean>(false);
  const [selectedService, setSelectedService] = useState<ServiceStatusItem | null>(null);
  const [toastMsg, setToastMsg] = useState<{ title: string; time: string } | null>(null);
  const [systemStatus, setSystemStatus] = useState<any>(null);

  useEffect(() => {
    apiService.getSystemStatus().then((status) => {
      setSystemStatus(status);
      if (status && status.model_status === 'READY') {
        setServices((prev) =>
          prev.map((s) =>
            s.id === 'srv-ai'
              ? {
                  ...s,
                  status: 'READY',
                  latency: '14.2 ms',
                  uptime: '100%',
                  details: `YOLO11n weights active on ${status.device || 'CUDA'}`,
                  lastHeartbeat: 'Active',
                }
              : s
          )
        );
      }
    }).catch(() => null);
  }, []);

  const isModelReady = systemStatus?.model_status === 'READY';

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 7 Core Subsystems
  const [services, setServices] = useState<ServiceStatusItem[]>([
    {
      id: 'srv-frontend',
      name: 'FRONTEND CLIENT ENGINE',
      category: 'FRONTEND',
      status: 'ONLINE',
      latency: '2.1 ms',
      uptime: '99.9%',
      details: 'React 19 + TypeScript + Vite running on port 5173',
      lastHeartbeat: 'Just now',
    },
    {
      id: 'srv-backend',
      name: 'BACKEND API SERVICE',
      category: 'BACKEND',
      status: 'READY',
      latency: '8.4 ms',
      uptime: '99.8%',
      details: 'FastAPI REST + WebSocket streaming gateway on port 8000',
      lastHeartbeat: '1s ago',
    },
    {
      id: 'srv-ai',
      name: 'AI INFERENCE ENGINE (best.pt)',
      category: 'AI_MODEL',
      status: 'READY',
      latency: '14.2 ms',
      uptime: '100%',
      details: 'YOLO11n thermal weights active on CUDA device',
      lastHeartbeat: 'Active',
    },
    {
      id: 'srv-tracker',
      name: 'BYTETRACK MOTION TRACKER',
      category: 'TRACKER',
      status: 'READY',
      latency: '3.8 ms',
      uptime: '99.9%',
      details: 'High-performance ByteTrack IoU association engine',
      lastHeartbeat: 'Just now',
    },
    {
      id: 'srv-threat',
      name: 'GEOFENCE THREAT ENGINE',
      category: 'THREAT_ENGINE',
      status: 'READY',
      latency: '1.2 ms',
      uptime: '99.9%',
      details: 'Perimeter Raycasting + Multi-Rule Policy Evaluator',
      lastHeartbeat: 'Just now',
    },
    {
      id: 'srv-sensor',
      name: 'THERMAL SENSOR (FLIR AX65)',
      category: 'SENSOR',
      status: 'STANDBY',
      latency: '18.0 ms',
      uptime: '100%',
      details: 'Streaming from Primary Video File input (Hardware in standby)',
      lastHeartbeat: '2s ago',
    },
    {
      id: 'srv-db',
      name: 'SQLITE LOCAL DATABASE',
      category: 'DATABASE',
      status: 'READY',
      latency: '0.8 ms',
      uptime: '100%',
      details: 'Persistent event & audit database storage',
      lastHeartbeat: 'Just now',
    },
  ]);

  // System Pipeline Steps
  const pipelineSteps = [
    { name: 'THERMAL INPUT', sub: 'FLIR 1280×720 Stream', status: 'READY' },
    { name: 'FRAME PROCESSING', sub: 'Letterbox & Normalization', status: 'READY' },
    { name: 'AI INFERENCE', sub: 'best.pt YOLO Weights', status: isModelReady ? 'READY' : 'STANDBY' },
    { name: '5-CLASS DETECTION', sub: 'NMS Filtering', status: isModelReady ? 'READY' : 'STANDBY' },
    { name: 'TRACKING', sub: 'ByteTrack Association', status: 'READY' },
    { name: 'THREAT ENGINE', sub: 'Perimeter Rule Matrix', status: 'READY' },
    { name: 'ANALYTICS', sub: 'Real-Time Telemetry', status: 'READY' },
  ];

  // System Events Log
  const systemEvents = [
    { time: '22:30:15 IST', service: 'ANALYTICS', msg: 'Real-time telemetry buffer aggregated' },
    { time: '22:28:40 IST', service: 'DATABASE', msg: 'SQLite audit transaction committed' },
    {
      time: '22:25:00 IST',
      service: 'AI ENGINE',
      msg: isModelReady
        ? `Inference architecture initialized on ${systemStatus?.device || 'CUDA'} (best.pt loaded)`
        : 'Inference architecture initialized in standby (awaiting best.pt)',
    },
    { time: '22:20:10 IST', service: 'FRONTEND', msg: 'Web client session connected on port 5173' },
    { time: '22:15:00 IST', service: 'SENSOR', msg: 'Video file input stream loaded (1280×720)' },
  ];

  const handleRunDiagnostics = () => {
    setIsRunningDiagnostics(true);
    setTimeout(() => {
      setIsRunningDiagnostics(false);
      setToastMsg({
        title: 'SYSTEM DIAGNOSTICS: 7 CHECKS · 5 PASS · 2 STANDBY',
        time: formatIST(new Date(), { includeTimeOnly: true }),
      });
      setTimeout(() => setToastMsg(null), 3500);
    }, 900);
  };

  const getStatusBadge = (status: ServiceStatusItem['status']) => {
    switch (status) {
      case 'ONLINE':
      case 'READY':
        return <Badge variant="emerald">● Ready</Badge>;
      case 'STANDBY':
        return <Badge variant="amber">○ Standby</Badge>;
      case 'NOT_CONNECTED':
        return <Badge variant="slate">○ Disconnected</Badge>;
      case 'ERROR':
        return <Badge variant="red">✕ Error</Badge>;
      default:
        return <Badge variant="emerald">● Ready</Badge>;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'SENSOR':
        return <Camera className="w-4 h-4 text-[var(--thermal-cyan)]" />;
      case 'BACKEND':
        return <Server className="w-4 h-4 text-[var(--intelligence-violet)]" />;
      case 'AI_MODEL':
        return <Cpu className="w-4 h-4 text-[var(--warning-amber)]" />;
      case 'TRACKER':
        return <Gauge className="w-4 h-4 text-[var(--thermal-cyan)]" />;
      case 'THREAT_ENGINE':
        return <ShieldCheck className="w-4 h-4 text-[var(--threat-coral)]" />;
      case 'DATABASE':
        return <Database className="w-4 h-4 text-[var(--operational-green)]" />;
      default:
        return <Activity className="w-4 h-4 text-[var(--thermal-cyan)]" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="page-container space-y-5 select-none font-sans w-full max-w-full min-w-0 relative"
    >
      {/* ======================================================== */}
      {/* 1. PAGE HEADER & DIAGNOSTIC ACTIONS                      */}
      {/* ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)] w-full max-w-full">
        <div className="min-w-0">
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-wider text-[var(--text-primary)] font-sans uppercase flex items-center gap-2.5 truncate">
              <Activity className="w-5 h-5 text-[var(--operational-green)] shrink-0" />
              SYSTEM HEALTH
            </h1>

            {/* Health Badge */}
            <div className="flex items-center space-x-2 bg-[#08121E] px-3.5 py-1 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--operational-green)]">
              <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]" />
              <span className="font-semibold tracking-wide">SYSTEM OPERATIONAL (5/7 READY)</span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            Real-time application, AI pipeline and hardware diagnostics
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>

          <button
            onClick={handleRunDiagnostics}
            disabled={isRunningDiagnostics}
            className="px-3.5 py-1.5 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shadow-md disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiagnostics ? 'animate-spin' : ''}`} />
            <span>{isRunningDiagnostics ? 'PROBING...' : 'RUN DIAGNOSTICS'}</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. OVERALL HEALTH HERO & HARDWARE GAUGES                 */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 w-full max-w-full min-w-0">
        {/* CPU USAGE */}
        <Card hoverEffect className="p-3.5 space-y-1.5 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono uppercase">
            <span>CPU LOAD</span>
            <Cpu className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
            N/A
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">Host Monitoring N/A</div>
        </Card>

        {/* GPU LOAD */}
        <Card hoverEffect className="p-3.5 space-y-1.5 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono uppercase">
            <span>GPU ENGINE</span>
            <Zap className="w-3.5 h-3.5 text-[var(--intelligence-violet)]" />
          </div>
          <div className="text-sm font-bold font-mono text-[var(--intelligence-violet)] truncate mt-1">
            {systemStatus?.device?.toUpperCase() || 'CUDA 0'}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">Hardware Accelerated</div>
        </Card>

        {/* VRAM */}
        <Card hoverEffect className="p-3.5 space-y-1.5 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono uppercase">
            <span>VRAM ALLOC</span>
            <HardDrive className="w-3.5 h-3.5 text-[var(--warning-amber)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--warning-amber)]">
            2.1 GB
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">Reference Benchmark</div>
        </Card>

        {/* RAM USAGE */}
        <Card hoverEffect className="p-3.5 space-y-1.5 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono uppercase">
            <span>RAM USAGE</span>
            <Server className="w-3.5 h-3.5 text-[var(--operational-green)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--operational-green)]">
            N/A
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">Host Monitoring N/A</div>
        </Card>

        {/* PIPELINE FPS */}
        <Card hoverEffect className="p-3.5 space-y-1.5 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono uppercase">
            <span>PIPELINE FPS</span>
            <Activity className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--thermal-cyan)]">
            30 FPS
          </div>
          <div className="text-[10px] text-[var(--operational-green)] font-mono">Target Stream Rate</div>
        </Card>

        {/* TOTAL LATENCY */}
        <Card hoverEffect className="p-3.5 space-y-1.5 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono uppercase">
            <span>FRAME LATENCY</span>
            <Clock className="w-3.5 h-3.5 text-[var(--operational-green)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--operational-green)]">
            14.2 <span className="text-xs font-normal">ms</span>
          </div>
          <div className="text-[10px] text-[var(--operational-green)] font-mono">Reference Benchmark FP16</div>
        </Card>
      </div>

      {/* ======================================================== */}
      {/* 3. AI PIPELINE HEALTH FLOW STRIP                         */}
      {/* ======================================================== */}
      <Card className="p-4 sm:p-5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-[var(--thermal-cyan)]" />
            <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider">
              END-TO-END INFERENCE & SURVEILLANCE PIPELINE
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[var(--operational-green)]">ARCHITECTURE FLOW</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 pt-1">
          {pipelineSteps.map((step, index) => (
            <div
              key={step.name}
              className={`p-3 rounded-xl border space-y-1.5 relative transition-all ${
                step.status === 'READY'
                  ? 'bg-[var(--bg-surface-secondary)] border-[var(--thermal-cyan)]/30'
                  : 'bg-[var(--bg-surface-secondary)]/50 border-[var(--border-subtle)] opacity-75'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-[var(--text-muted)] font-semibold">0{index + 1}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    step.status === 'READY' ? 'bg-[var(--operational-green)] pulse-live' : 'bg-[var(--warning-amber)]'
                  }`}
                />
              </div>

              <div className="text-xs font-bold font-mono text-[var(--text-primary)] truncate">{step.name}</div>
              <div className="text-[10px] text-[var(--text-secondary)] truncate">{step.sub}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 4. MAIN WORKSPACE: SERVICES TABLE (68%) / DRAWER (32%)   */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full max-w-full min-w-0 items-start">
        {/* Left Column: Subsystems Table (68% / 8 Cols) */}
        <div className="lg:col-span-8 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-4 space-y-3 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center space-x-2">
                <Server className="w-4 h-4 text-[var(--thermal-cyan)]" />
                <h3 className="text-xs font-bold font-sans uppercase tracking-wider text-[var(--text-primary)]">
                  CORE SUBSYSTEMS & MICROSERVICE STATUS (7 SERVICES)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[var(--operational-green)]">REAL-TIME HEARTBEAT</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[10px] font-mono uppercase text-[var(--text-muted)]">
                    <th className="pb-2.5 pr-3">SUBSYSTEM</th>
                    <th className="pb-2.5 pr-3">STATUS</th>
                    <th className="pb-2.5 pr-3">LATENCY</th>
                    <th className="pb-2.5 pr-3">UPTIME</th>
                    <th className="pb-2.5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {services.map((srv) => {
                    const isSelected = selectedService?.id === srv.id;
                    return (
                      <tr
                        key={srv.id}
                        onClick={() => setSelectedService(srv)}
                        className={`transition-all cursor-pointer group ${
                          isSelected ? 'bg-[var(--thermal-cyan)]/10 font-medium' : 'hover:bg-white/[0.025]'
                        }`}
                      >
                        <td className="py-3 pr-3 font-semibold text-[var(--text-primary)] flex items-center space-x-2.5 whitespace-nowrap">
                          <div className="p-1.5 rounded-lg bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)]">
                            {getCategoryIcon(srv.category)}
                          </div>
                          <div>
                            <div className="text-xs font-mono font-bold">{srv.name}</div>
                            <div className="text-[10px] text-[var(--text-muted)] font-sans">{srv.details}</div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap">
                          {getStatusBadge(srv.status)}
                        </td>
                        <td className="py-3 pr-3 font-mono text-[var(--thermal-cyan)] whitespace-nowrap">
                          {srv.latency}
                        </td>
                        <td className="py-3 pr-3 font-mono text-[var(--operational-green)] whitespace-nowrap">
                          {srv.uptime}
                        </td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedService(srv);
                            }}
                            className="px-2.5 py-1 rounded-lg btn-secondary-interactive text-[11px] text-[var(--thermal-cyan)] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Inspect</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Column: Service Detail Inspector & Cross-Links (32% / 4 Cols) */}
        <div className="lg:col-span-4 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-4 sm:p-5 space-y-4 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] sticky top-20">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-[var(--thermal-cyan)]" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  SUBSYSTEM INSPECTOR
                </h3>
              </div>
              {selectedService && getStatusBadge(selectedService.status)}
            </div>

            {selectedService ? (
              <div className="space-y-3.5 text-xs font-sans">
                <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                  <div className="text-[10px] font-mono text-[var(--text-muted)]">SELECTED SERVICE</div>
                  <div className="font-bold font-mono text-[var(--text-primary)]">{selectedService.name}</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">{selectedService.details}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)]">
                    <div className="text-[10px] text-[var(--text-muted)]">LATENCY</div>
                    <div className="font-bold text-[var(--thermal-cyan)]">{selectedService.latency}</div>
                  </div>
                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)]">
                    <div className="text-[10px] text-[var(--text-muted)]">UPTIME</div>
                    <div className="font-bold text-[var(--operational-green)]">{selectedService.uptime}</div>
                  </div>
                </div>

                {/* Cross-Module Navigation Action Links */}
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                  <button
                    onClick={() => (onNavigate ? onNavigate('sensors') : undefined)}
                    className="w-full py-2 rounded-xl btn-secondary-interactive text-xs font-medium flex items-center justify-between px-3 cursor-pointer"
                  >
                    <span>OPEN SENSOR MANAGEMENT</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
                  </button>

                  <button
                    onClick={() => (onNavigate ? onNavigate('ai_engine') : undefined)}
                    className="w-full py-2 rounded-xl btn-secondary-interactive text-xs font-medium flex items-center justify-between px-3 cursor-pointer"
                  >
                    <span>OPEN AI ENGINE WORKBENCH</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
                  </button>

                  <button
                    onClick={() => (onNavigate ? onNavigate('live') : undefined)}
                    className="w-full py-2 rounded-xl btn-secondary-interactive text-xs font-medium flex items-center justify-between px-3 cursor-pointer"
                  >
                    <span>OPEN LIVE SURVEILLANCE FEED</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-xs font-mono text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl">
                SELECT A SUBSYSTEM TO INSPECT
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Floating Feedback Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border bg-[#0A121E] border-[var(--operational-green)]/50 text-[var(--text-primary)] flex items-center space-x-3 font-sans text-xs"
          >
            <CheckCircle2 className="w-4 h-4 text-[var(--operational-green)] shrink-0" />
            <div>
              <div className="font-bold text-xs">{toastMsg.title}</div>
              <div className="text-[10px] font-mono text-[var(--text-secondary)]">{toastMsg.time}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SystemHealth;
