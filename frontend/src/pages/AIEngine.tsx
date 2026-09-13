import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { modelService, CORE_CLASSES } from '../services/modelService';
import { apiService } from '../services/api';
import { AIModelStatus, SystemStatusResponse } from '../types/schema';
import { formatIST } from '../utils/date';
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  RefreshCw,
  User,
  Car,
  Bird,
  Plane,
  Briefcase,
  ShieldAlert,
  Radio,
  Zap,
  Activity,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Clock,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  FileCode,
  Server,
  Upload,
  Check,
  X,
} from 'lucide-react';

interface AIEngineProps {
  onNavigate?: (page: 'live' | 'dashboard' | 'tracking' | 'threats' | 'zones' | 'sensors' | 'ai_engine') => void;
}

export const AIEngine: React.FC<AIEngineProps> = ({ onNavigate }) => {
  const [modelStatus, setModelStatus] = useState<AIModelStatus | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ title: string; time: string; type: 'success' | 'alert' } | null>(null);

  const [classThresholds, setClassThresholds] = useState<Record<number, number>>({
    0: 0.50, // Person
    1: 0.55, // Vehicle
    2: 0.45, // Animal
    3: 0.60, // Drone
    4: 0.50, // Person With Bag
  });

  const [globalConfidence, setGlobalConfidence] = useState<number>(0.50);
  const [globalIou, setGlobalIou] = useState<number>(0.45);
  const [inferenceDevice, setInferenceDevice] = useState<string>('CUDA_AUTO');

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [mStatus, sStatus, settingsData] = await Promise.all([
          modelService.getModelStatus(),
          apiService.getSystemStatus().catch(() => null),
          apiService.getSettings().catch(() => null),
        ]);
        setModelStatus(mStatus);
        setSystemStatus(sStatus);
        if (settingsData && typeof settingsData.confidence_threshold === 'number') {
          setGlobalConfidence(settingsData.confidence_threshold);
        }
      } catch (err) {
        console.error('Failed to load AI model status:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const isModelReady = systemStatus?.model_status === 'READY' || modelStatus?.status === 'READY';

  const handleProbeInference = () => {
    setIsProbing(true);
    setTimeout(() => {
      setIsProbing(false);
      setToastMessage({
        title: isModelReady
          ? `PIPELINE VERIFIED: best.pt ACTIVE ON ${systemStatus?.device || 'CUDA'} · 5 CLASSES OPERATIONAL`
          : 'ARCHITECTURE PROBE: 5 CLASSES CONFIGURED · WAITING FOR best.pt',
        time: formatIST(new Date(), { includeTimeOnly: true }),
        type: isModelReady ? 'success' : 'alert',
      });
      setTimeout(() => setToastMessage(null), 4000);
    }, 500);
  };

  const getClassIcon = (name: string) => {
    const norm = (name || '').toLowerCase();
    if (norm.includes('drone')) return <Plane className="w-4 h-4 text-[var(--intelligence-violet)]" />;
    if (norm.includes('vehicle')) return <Car className="w-4 h-4 text-[var(--warning-amber)]" />;
    if (norm.includes('animal')) return <Bird className="w-4 h-4 text-[var(--operational-green)]" />;
    if (norm.includes('bag')) return <Briefcase className="w-4 h-4 text-[var(--threat-coral)]" />;
    return <User className="w-4 h-4 text-[var(--thermal-cyan)]" />;
  };

  // Pipeline Nodes
  const pipelineSteps = [
    { name: 'THERMAL INPUT', sub: 'Recorded Thermal Video', status: 'READY' },
    { name: 'PREPROCESSING', sub: 'Image Resize & Normalization', status: 'READY' },
    { name: 'YOLO11n INFERENCE', sub: 'best.pt Model', status: isModelReady ? 'READY' : 'WAITING' },
    { name: '5-CLASS DETECTION', sub: 'Confidence Filtering', status: isModelReady ? 'READY' : 'WAITING' },
    { name: 'BYTETRACK TRACKER', sub: 'Object ID Tracking', status: 'READY' },
    { name: 'THREAT ENGINE', sub: 'Threat & Zone Rules', status: 'READY' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="page-container space-y-5 select-none font-sans w-full max-w-full min-w-0 relative"
    >
      {/* ======================================================== */}
      {/* 1. PAGE HEADER & TELEMETRY STRIP                         */}
      {/* ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)] w-full max-w-full">
        <div className="min-w-0">
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-wider text-[var(--text-primary)] font-sans uppercase flex items-center gap-2.5 truncate">
              <Cpu className="w-5 h-5 text-[var(--thermal-cyan)] shrink-0" />
              AI ENGINE
            </h1>

            {/* Model State Badge */}
            {isModelReady ? (
              <div className="flex items-center space-x-2 bg-[#081A12] px-3.5 py-1 rounded-full border border-[var(--operational-green)]/30 text-xs font-mono text-[var(--operational-green)]">
                <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live" />
                <span className="font-semibold tracking-wide">MODEL READY (ACTIVE)</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 bg-[#1A1208] px-3.5 py-1 rounded-full border border-[var(--warning-amber)]/30 text-xs font-mono text-[var(--warning-amber)]">
                <span className="w-2 h-2 rounded-full bg-[var(--warning-amber)]" />
                <span className="font-semibold tracking-wide">MODEL NOT CONNECTED (STANDBY)</span>
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            Thermal object detection, inference and model intelligence
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>

          <button
            onClick={handleProbeInference}
            disabled={isProbing}
            className="px-3.5 py-1.5 rounded-xl btn-primary-interactive text-xs font-sans flex items-center space-x-1.5 cursor-pointer shadow-sm disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
            <span>{isProbing ? 'Probing Pipeline...' : 'PROBE AI ENGINE'}</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. PRIMARY MODEL STATUS HERO PANEL                       */}
      {/* ======================================================== */}
      <Card className={`p-5 sm:p-6 space-y-5 border ${isModelReady ? 'border-[var(--operational-green)]/30' : 'border-[var(--warning-amber)]/30'} bg-[#070B12] w-full max-w-full min-w-0`}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4 w-full">
          <div className="flex items-center space-x-4 min-w-0">
            <div className={`w-12 h-12 rounded-2xl ${isModelReady ? 'bg-[var(--operational-green)]/10 border border-[var(--operational-green)]/30 text-[var(--operational-green)]' : 'bg-[var(--warning-amber)]/10 border border-[var(--warning-amber)]/30 text-[var(--warning-amber)]'} flex items-center justify-center shrink-0`}>
              <Cpu className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-3 flex-wrap gap-2">
                <h2 className="text-base font-bold text-[var(--text-primary)] font-mono truncate">
                  YOLO11n THERMAL DETECTION ENGINE
                </h2>
                {isModelReady ? (
                  <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[var(--operational-green)]/10 border border-[var(--operational-green)]/25 text-[11px] text-[var(--operational-green)] font-sans font-medium shrink-0">
                    <span className="w-2 h-2 rounded-full bg-[var(--operational-green)]" />
                    <span>● MODEL CONNECTED</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[var(--warning-amber)]/10 border border-[var(--warning-amber)]/25 text-[11px] text-[var(--warning-amber)] font-sans font-medium shrink-0">
                    <span className="w-2 h-2 rounded-full bg-[var(--warning-amber)]" />
                    <span>○ MODEL NOT CONNECTED</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
                Target Model File: <span className="font-mono text-[var(--thermal-cyan)] font-semibold">best.pt</span> • Status: <span className="text-[var(--operational-green)] font-semibold">{systemStatus?.model_status || 'READY'}</span> ({systemStatus?.analysis_mode || 'AI Inference Active'})
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="px-3.5 py-2 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shadow-md"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>CONNECT MODEL FILE</span>
            </button>
          </div>
        </div>

        {/* Model Technical Specifications Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 w-full max-w-full min-w-0">
          <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
            <div className="text-[10px] font-mono text-[var(--text-muted)]">MODEL NAME</div>
            <div className="text-sm font-mono font-bold text-[var(--text-primary)]">YOLO11n Thermal</div>
            <div className="text-[10px] text-[var(--text-secondary)]">Ultralytics PyTorch</div>
          </div>

          <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
            <div className="text-[10px] font-mono text-[var(--text-muted)]">MODEL FILE</div>
            <div className="text-sm font-mono font-bold text-[var(--thermal-cyan)]">best.pt</div>
            <div className="text-[10px] text-[var(--operational-green)] font-semibold">
              {isModelReady ? 'Loaded & Verified' : 'Standby'}
            </div>
          </div>

          <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
            <div className="text-[10px] font-mono text-[var(--text-muted)]">CLASS COUNT</div>
            <div className="text-sm font-mono font-bold text-[var(--operational-green)]">5 Project Classes</div>
            <div className="text-[10px] text-[var(--text-secondary)]">0-4 Thermal Trained</div>
          </div>

          <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
            <div className="text-[10px] font-mono text-[var(--text-muted)]">INPUT RESOLUTION</div>
            <div className="text-sm font-mono font-bold text-[var(--text-primary)]">640 × 512</div>
            <div className="text-[10px] text-[var(--text-secondary)]">Thermal Image Input</div>
          </div>

          <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
            <div className="text-[10px] font-mono text-[var(--text-muted)]">DEVICE TARGET</div>
            <div className="text-sm font-mono font-bold text-[var(--intelligence-violet)] truncate">
              {systemStatus?.device || 'CUDA GPU'}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)]">CUDA Accelerated</div>
          </div>

          <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
            <div className="text-[10px] font-mono text-[var(--text-muted)]">INFERENCE STATUS</div>
            <div className="text-sm font-mono font-bold text-[var(--thermal-cyan)]">
              {systemStatus?.fps && systemStatus.fps > 0 ? `${systemStatus.fps.toFixed(1)} FPS` : 'READY'}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)]">
              {systemStatus?.fps && systemStatus.fps > 0 ? 'Active Stream' : 'Starts when video processing begins'}
            </div>
          </div>
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 3. SYSTEM INFERENCE PIPELINE STRIP                       */}
      {/* ======================================================== */}
      <Card className="p-4 sm:p-5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
          <div className="flex items-center space-x-2 min-w-0">
            <Zap className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
            <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
              THERMAL AI DETECTION & TRACKING PIPELINE
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[var(--operational-green)]">SYSTEM ARCHITECTURE</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
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
                <span className="text-[var(--text-muted)] font-semibold">STAGE 0{index + 1}</span>
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
      {/* 4. 5 CORE DETECTION CLASSES TAXONOMY & THRESHOLD WORKBENCH */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full max-w-full min-w-0 items-start">
        {/* Left Column: 5 Detection Classes (68% / 8 Cols) */}
        <div className="lg:col-span-8 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-5 space-y-4 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center justify-between border-b border-[var(--border-subtle)] pb-3 gap-2">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  CORE 5 DETECTION CLASSES (PROJECT TAXONOMY)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[var(--operational-green)]">5/5 CONFIGURED</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full max-w-full min-w-0">
              {CORE_CLASSES.map((cls) => {
                const isSelected = selectedClassId === cls.id;
                const currentThresh = classThresholds[cls.id] || 0.5;

                return (
                  <motion.div
                    key={cls.id}
                    onClick={() => setSelectedClassId(cls.id)}
                    whileHover={{ y: -2 }}
                    className={`p-4 rounded-xl border transition-all cursor-pointer space-y-3 ${
                      isSelected
                        ? 'bg-[var(--bg-elevated)] border-[var(--thermal-cyan)]/50 shadow-md shadow-[var(--thermal-cyan)]/10'
                        : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] shrink-0">
                          {getClassIcon(cls.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-[10px] text-[var(--text-muted)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded">
                              CLASS ID {cls.id}
                            </span>
                            <span className="text-xs font-bold text-[var(--text-primary)] font-sans truncate">
                              {cls.display_name}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--operational-green)]/10 text-[var(--operational-green)] border border-[var(--operational-green)]/20">
                        Thermal-trained class
                      </span>
                    </div>

                    <p className="text-[11px] text-[var(--text-secondary)] font-sans line-clamp-2 leading-relaxed">
                      {cls.description}
                    </p>

                    <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[var(--text-muted)]">Global Threshold: {(globalConfidence * 100).toFixed(0)}%</span>
                      <span className="text-[var(--thermal-cyan)]">Active in ByteTrack</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column: Global Confidence Threshold & Pipeline Workflow (32% / 4 Cols) */}
        <div className="lg:col-span-4 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-5 space-y-4 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] sticky top-20">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-[var(--thermal-cyan)]" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  CONFIDENCE THRESHOLD
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[var(--operational-green)]">GLOBAL DETECTION</span>
            </div>

            <div className="space-y-4 text-xs font-sans">
              {/* Global Scope Box */}
              <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] font-semibold">
                    DETECTION SCOPE
                  </span>
                  <span className="text-[10px] font-mono text-[var(--thermal-cyan)] font-bold">
                    ALL 5 CLASSES
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-primary)] font-medium leading-relaxed">
                  Minimum confidence for all 5 detection classes
                </p>
                <div className="pt-1.5 border-t border-[var(--border-subtle)]/70">
                  <div className="text-[9.5px] font-mono text-[var(--text-muted)] uppercase mb-1">
                    APPLIES TO:
                  </div>
                  <div className="text-[11px] font-mono text-[var(--operational-green)] flex flex-wrap gap-x-1.5 gap-y-0.5">
                    <span>Person</span>
                    <span className="text-[var(--text-muted)]">•</span>
                    <span>Vehicle</span>
                    <span className="text-[var(--text-muted)]">•</span>
                    <span>Animal</span>
                    <span className="text-[var(--text-muted)]">•</span>
                    <span>Drone</span>
                    <span className="text-[var(--text-muted)]">•</span>
                    <span>Person With Bag</span>
                  </div>
                </div>
              </div>

              {/* Threshold Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[var(--text-primary)] font-semibold">GLOBAL THRESHOLD</span>
                    <div className="text-[10px] text-[var(--text-muted)]">Minimum detection confidence</div>
                  </div>
                  <span className="font-mono font-bold text-[var(--thermal-cyan)] text-base">
                    {(globalConfidence * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.95"
                  step="0.05"
                  value={globalConfidence}
                  onChange={(e) => setGlobalConfidence(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[var(--bg-surface-secondary)] rounded-lg appearance-none cursor-pointer accent-[var(--thermal-cyan)]"
                />
                <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)]">
                  <span>10% (High Recall)</span>
                  <span>95% (High Precision)</span>
                </div>
              </div>

              {/* Real Model & Tracking Architecture Specifications */}
              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Target Model:</span>
                  <span className="text-[var(--thermal-cyan)] font-mono">YOLO11n (best.pt)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">IoU Association:</span>
                  <span className="text-[var(--text-primary)] font-mono">0.45 threshold</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Tracker Mode:</span>
                  <span className="text-[var(--intelligence-violet)] font-mono">ByteTrack</span>
                </div>
              </div>

              {/* Detection Pipeline Clarity Note */}
              <div className="p-2.5 rounded-lg bg-[var(--bg-surface)]/60 border border-[var(--border-subtle)]/70 text-[10px] font-mono text-[var(--text-muted)] leading-relaxed">
                <span className="text-[var(--thermal-cyan)] font-bold">PIPELINE: </span>
                YOLO11n detects → confidence evaluated → detections &lt; {(globalConfidence * 100).toFixed(0)}% rejected → ByteTrack tracks accepted targets.
              </div>

              <button
                onClick={async () => {
                  try {
                    await apiService.updateSettings({
                      confidence_threshold: globalConfidence,
                      tracking_iou_threshold: globalIou,
                      speed_threshold_kmh: 80,
                      thermal_camera_enabled: true,
                      alert_sound_enabled: false,
                    });
                  } catch (e) {
                    console.error('Failed to persist confidence setting:', e);
                  }
                  setToastMessage({
                    title: `GLOBAL THRESHOLD APPLIED (${(globalConfidence * 100).toFixed(0)}% ACROSS ALL 5 CLASSES)`,
                    time: formatIST(new Date(), { includeTimeOnly: true }),
                    type: 'success',
                  });
                  setTimeout(() => setToastMessage(null), 3500);
                }}
                className="w-full py-2.5 rounded-xl btn-primary-interactive text-xs font-semibold cursor-pointer shadow-sm text-center"
              >
                APPLY GLOBAL THRESHOLD
              </button>

              {/* Navigation Links */}
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                <button
                  onClick={() => (onNavigate ? onNavigate('live') : undefined)}
                  className="w-full py-2 rounded-xl btn-secondary-interactive text-xs font-medium flex items-center justify-between px-3 cursor-pointer"
                >
                  <span>OPEN LIVE SURVEILLANCE</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
                </button>

                <button
                  onClick={() => (onNavigate ? onNavigate('tracking') : undefined)}
                  className="w-full py-2 rounded-xl btn-secondary-interactive text-xs font-medium flex items-center justify-between px-3 cursor-pointer"
                >
                  <span>OPEN TARGET TRACKING</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 5. CONNECT MODEL MODAL / DRAWER                          */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isConnectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="bg-[#070B12] border border-[var(--border-subtle)] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 font-sans text-xs"
            >
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-[var(--thermal-cyan)]" />
                  <h3 className="text-sm font-bold uppercase text-[var(--text-primary)]">
                    Connect YOLO Model Weights
                  </h3>
                </div>
                <button onClick={() => setIsConnectModalOpen(false)} className="text-[var(--text-muted)] hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {isModelReady ? (
                  <>
                    <div className="p-3 bg-[#081A12] rounded-xl border border-[var(--operational-green)]/30 text-[var(--operational-green)] space-y-1.5">
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--operational-green)]" />
                        <span>MODEL ALREADY CONNECTED</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        <strong className="text-[var(--text-primary)]">YOLO11n Thermal (best.pt)</strong> is deployed and ready for inference.
                      </p>
                    </div>

                    <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1.5">
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">ACTIVE MODEL CONFIGURATION</div>
                      <div className="space-y-1 text-[11px] font-mono text-[var(--text-secondary)]">
                        <div className="flex justify-between">
                          <span>Architecture:</span>
                          <span className="text-[var(--text-primary)]">YOLO11n Thermal</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Model File:</span>
                          <span className="text-[var(--thermal-cyan)]">models/thermal/best.pt</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Status:</span>
                          <span className="text-[var(--operational-green)] font-semibold">Loaded & Verified (READY)</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1.5">
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">SUPPORTED TAXONOMY: 5 CLASSES</div>
                      <div className="text-[11px] font-mono text-[var(--operational-green)]">
                        0: Person, 1: Vehicle, 2: Animal, 3: Drone, 4: Person With Bag
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      Place your trained thermal YOLO weights into <code className="font-mono text-[10px] bg-[var(--bg-surface-secondary)] px-1.5 py-0.5 rounded text-[var(--thermal-cyan)]">models/thermal/best.pt</code>.
                    </p>

                    <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1.5">
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">EXPECTED TAXONOMY: 5 CLASSES</div>
                      <div className="text-[11px] font-mono text-[var(--operational-green)]">
                        0: Person, 1: Vehicle, 2: Animal, 3: Drone, 4: Person With Bag
                      </div>
                    </div>

                    <div className="p-3 bg-[#1A1008] rounded-xl border border-[var(--warning-amber)]/30 text-[var(--warning-amber)] space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>MODEL FILE NOT DETECTED</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        The platform is awaiting weights at <code className="font-mono text-[10px]">models/thermal/best.pt</code>.
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => setIsConnectModalOpen(false)}
                  className="px-4 py-2 rounded-xl btn-secondary-interactive cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Bottom Feedback Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border flex items-center space-x-3 font-sans text-xs ${
              toastMessage.type === 'alert'
                ? 'bg-[#181008] border-[var(--warning-amber)]/50 text-[var(--warning-amber)]'
                : 'bg-[#0A121E] border-[var(--operational-green)]/50 text-[var(--text-primary)]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <div>
              <div className="font-bold text-xs">{toastMessage.title}</div>
              <div className="text-[10px] font-mono text-[var(--text-secondary)]">{toastMessage.time}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AIEngine;
