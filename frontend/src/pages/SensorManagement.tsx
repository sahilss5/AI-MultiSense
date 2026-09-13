import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { useThermalCamera } from '../hooks/useThermalCamera';
import { formatIST } from '../utils/date';
import { apiService } from '../services/api';
import {
  Radio,
  Camera,
  Cpu,
  RefreshCw,
  CheckCircle2,
  Thermometer,
  AlertTriangle,
  ShieldCheck,
  Activity,
  Film,
  Zap,
  ArrowRight,
  Clock,
  Layers,
  Settings,
  Server,
  Power,
  RotateCcw,
  Check,
  X,
  ExternalLink,
  Sliders,
  Maximize2,
  Eye,
} from 'lucide-react';

interface SensorManagementProps {
  onNavigate?: (page: any) => void;
}

export const SensorManagement: React.FC<SensorManagementProps> = ({ onNavigate }) => {
  const [autoReconnect, setAutoReconnect] = useState<boolean>(true);
  const [streamTimeout, setStreamTimeout] = useState<number>(5000);
  const [resolutionMode, setResolutionMode] = useState<string>('1280x720');
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ title: string; time: string } | null>(null);
  const [systemStatus, setSystemStatus] = useState<any>(null);

  useEffect(() => {
    apiService.getSystemStatus().then(setSystemStatus).catch(() => null);
  }, []);

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Real Hardware Hook
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    isScanning,
    isConnected: isCameraConnected,
    isConnecting,
    error: cameraError,
    resolution: cameraResolution,
    fps: cameraFps,
    scanCameras,
    connectCamera,
    disconnectCamera,
  } = useThermalCamera();

  const handleScan = async () => {
    await scanCameras();
    setToastMessage({
      title: 'SENSOR HARDWARE PROBE COMPLETED',
      time: formatIST(new Date(), { includeTimeOnly: true }),
    });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleToggleConnect = async () => {
    if (isCameraConnected) {
      disconnectCamera();
      setToastMessage({
        title: 'THERMAL SENSOR DISCONNECTED',
        time: formatIST(new Date(), { includeTimeOnly: true }),
      });
    } else {
      await connectCamera();
      setToastMessage({
        title: 'THERMAL SENSOR LINK ESTABLISHED',
        time: formatIST(new Date(), { includeTimeOnly: true }),
      });
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Pipeline Node Configuration
  const pipelineNodes = [
    {
      id: 'sensor',
      name: 'THERMAL SENSOR',
      sub: isCameraConnected ? 'CAM-01 Connected' : 'FLIR LWIR Standby',
      status: isCameraConnected ? 'ACTIVE' : 'STANDBY',
      type: 'hardware',
    },
    {
      id: 'stream',
      name: 'CAMERA STREAM',
      sub: '30 FPS Target Stream',
      status: 'ACTIVE',
      type: 'input',
    },
    {
      id: 'processor',
      name: 'FRAME PROCESSOR',
      sub: '1280 × 720 Buffer (Configured)',
      status: 'ACTIVE',
      type: 'processing',
    },
    {
      id: 'ai',
      name: 'AI ENGINE',
      sub: systemStatus?.model_status === 'READY' ? `YOLO11n (${systemStatus.device || 'CUDA'})` : 'best.pt Pending Link',
      status: systemStatus?.model_status === 'READY' ? 'ACTIVE' : 'STANDBY',
      type: 'inference',
    },
    {
      id: 'tracking',
      name: 'BYTETRACK MOTION TRACKER',
      sub: 'ByteTrack Association Active',
      status: 'ACTIVE',
      type: 'tracking',
    },
    {
      id: 'threat',
      name: 'THREAT ENGINE',
      sub: 'Geo-Perimeters Armed',
      status: 'ACTIVE',
      type: 'threat',
    },
  ];

  // Sensor Event Log
  const sensorActivity: { time: string; text: string }[] = [];

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
              <Radio className="w-5 h-5 text-[var(--thermal-cyan)] shrink-0" />
              SENSOR MANAGEMENT
            </h1>

            {/* Status Badge */}
            <div className="flex items-center space-x-2 bg-[#08121E] px-3.5 py-1 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--operational-green)]">
              <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]" />
              <span className="font-semibold tracking-wide">SENSOR SYSTEM READY</span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            Thermal imaging devices, camera inputs and system connectivity
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>

          <button
            onClick={handleScan}
            disabled={isScanning}
            className="px-3.5 py-1.5 rounded-xl btn-secondary-interactive text-xs font-sans text-[var(--thermal-cyan)] flex items-center space-x-1.5 cursor-pointer shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning Hardware...' : 'SCAN FOR DEVICES'}</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. COMPACT SENSOR STATUS METRIC STRIP                    */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 w-full max-w-full min-w-0">
        {/* HARDWARE CAMERAS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">HARDWARE CAMERAS</div>
          <div className="text-2xl font-extrabold font-mono text-[var(--text-primary)]">
            {isCameraConnected ? '01 / 01' : '00 / 01'}
          </div>
          <div className="text-[10px] text-[var(--operational-green)] font-sans">
            {isCameraConnected ? 'FLIR LWIR Online' : 'Hardware Standby'}
          </div>
        </Card>

        {/* ACTIVE STREAMS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">ACTIVE STREAMS</div>
          <div className="text-2xl font-extrabold font-mono text-[var(--thermal-cyan)]">
            01
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Video File Feed</div>
        </Card>

        {/* INPUT FPS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">STREAM FPS</div>
          <div className="text-2xl font-extrabold font-mono text-[var(--operational-green)]">
            {isCameraConnected ? `${cameraFps || 30.0} FPS` : '30 FPS'}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Target Stream Rate</div>
        </Card>

        {/* SIGNAL LATENCY */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">FRAME LATENCY</div>
          <div className="text-2xl font-extrabold font-mono text-[var(--warning-amber)]">
            18 ms
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Reference Latency</div>
        </Card>
      </div>

      {/* ======================================================== */}
      {/* 3. ARCHITECTURAL SYSTEM CONNECTION MAP (KEY PIPELINE)    */}
      {/* ======================================================== */}
      <Card className="p-4 sm:p-5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
          <div className="flex items-center space-x-2 min-w-0">
            <Zap className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
            <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
              SYSTEM SENSOR & INFERENCE DATA PIPELINE
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[var(--operational-green)]">REAL-TIME FLOW</span>
        </div>

        {/* Pipeline Nodes Strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
          {pipelineNodes.map((node, index) => (
            <div
              key={node.id}
              className={`p-3 rounded-xl border space-y-1.5 relative transition-all ${
                node.status === 'ACTIVE'
                  ? 'bg-[var(--bg-surface-secondary)] border-[var(--thermal-cyan)]/30'
                  : 'bg-[var(--bg-surface-secondary)]/50 border-[var(--border-subtle)] opacity-75'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-[var(--text-muted)] font-semibold">0{index + 1}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    node.status === 'ACTIVE' ? 'bg-[var(--operational-green)] pulse-live' : 'bg-[var(--warning-amber)]'
                  }`}
                />
              </div>

              <div className="text-xs font-bold font-mono text-[var(--text-primary)] truncate">{node.name}</div>
              <div className="text-[10px] text-[var(--text-secondary)] truncate">{node.sub}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 4. MAIN WORKSPACE: SENSORS (68%) / DIAGNOSTICS (32%)     */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full max-w-full min-w-0 items-start">
        {/* LEFT COLUMN: SENSOR INPUT SOURCES (68% / 8 Cols) */}
        <div className="lg:col-span-8 space-y-4 w-full max-w-full min-w-0">
          {/* Card 1: Primary Hardware Thermal Sensor */}
          <Card className="p-5 space-y-4 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--thermal-cyan)]/10 border border-[var(--thermal-cyan)]/30 flex items-center justify-center text-[var(--thermal-cyan)] shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2.5 flex-wrap">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] font-mono truncate">
                      CAM-01 · FLIR AX65 LWIR ARRAY
                    </h3>
                    <Badge variant={isCameraConnected ? 'emerald' : 'amber'}>
                      {isCameraConnected ? '● Online' : '○ Standby / Disconnected'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                    Long-Wave Infrared Optical Array • 7.5 - 13.0 μm Spectrum • USB 3.0 / GigE Vision Link
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={handleToggleConnect}
                  disabled={isConnecting}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-all ${
                    isCameraConnected
                      ? 'bg-[var(--threat-coral)]/15 text-[var(--threat-coral)] border border-[var(--threat-coral)]/30 hover:bg-[var(--threat-coral)]/25'
                      : 'btn-primary-interactive shadow-md'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isCameraConnected ? 'DISCONNECT' : 'CONNECT SENSOR'}</span>
                </button>

                <button
                  onClick={() => (onNavigate ? onNavigate('live') : undefined)}
                  className="px-3.5 py-1.5 rounded-xl btn-secondary-interactive text-xs font-semibold text-[var(--thermal-cyan)] flex items-center space-x-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>VIEW LIVE</span>
                </button>
              </div>
            </div>

            {/* Hardware Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-sans">
              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">NATIVE RESOLUTION</div>
                <div className="text-sm font-mono font-bold text-[var(--text-primary)]">
                  {isCameraConnected && cameraResolution.width > 0
                    ? `${cameraResolution.width} × ${cameraResolution.height}`
                    : '640 × 512 (Native LWIR)'}
                </div>
              </div>

              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">STREAM FRAME RATE</div>
                <div className="text-sm font-mono font-bold text-[var(--thermal-cyan)]">
                  {isCameraConnected ? `${cameraFps || 30.0} FPS` : '30 FPS Locked'}
                </div>
              </div>

              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">PHYSICAL INTERFACE</div>
                <div className="text-sm font-mono font-bold text-[var(--operational-green)]">
                  GigE / Direct USB
                </div>
              </div>

              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">CORE TEMPERATURE</div>
                <div className="text-sm font-mono font-bold text-[var(--warning-amber)]">
                  34.2 °C (Nominal)
                </div>
              </div>
            </div>

            {!isCameraConnected && (
              <div className="p-3 bg-[#0A121E] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-secondary)] flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-semibold text-[var(--text-primary)]">THERMAL SENSOR IN HARDWARE STANDBY</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    No physical FLIR camera attached. AI-MULTISENSE is streaming from primary Video File input.
                  </div>
                </div>

                <button
                  onClick={handleScan}
                  className="px-3 py-1 rounded-lg btn-secondary-interactive text-xs font-semibold text-[var(--thermal-cyan)] cursor-pointer"
                >
                  SCAN HARDWARE
                </button>
              </div>
            )}
          </Card>

          {/* Card 2: Video File Input */}
          <Card className="p-5 space-y-3.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--intelligence-violet)]/10 border border-[var(--intelligence-violet)]/30 flex items-center justify-center text-[var(--intelligence-violet)] shrink-0">
                  <Film className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2.5">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] font-mono truncate">
                      PRIMARY VIDEO FILE INPUT
                    </h3>
                    <Badge variant="emerald">● Stream Available</Badge>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                    Synchronized thermal patrol recording for YOLO inference and target tracking
                  </p>
                </div>
              </div>

              <button
                onClick={() => (onNavigate ? onNavigate('live') : undefined)}
                className="px-3.5 py-1.5 rounded-xl btn-primary-interactive text-xs font-semibold shadow-md flex items-center space-x-1.5 cursor-pointer"
              >
                <span>OPEN IN LIVE SURVEILLANCE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-sans">
              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">ACTIVE FILE</div>
                <div className="text-xs font-mono font-bold text-[var(--text-primary)] truncate">THERMAL_PATROL_01.MP4</div>
              </div>
              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">RESOLUTION</div>
                <div className="text-xs font-mono font-bold text-[var(--thermal-cyan)]">1280 × 720</div>
              </div>
              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">DURATION</div>
                <div className="text-xs font-mono font-bold text-[var(--text-primary)]">02:14 (Loop)</div>
              </div>
              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">STATUS</div>
                <div className="text-xs font-mono font-bold text-[var(--operational-green)]">YOLO Inference Ready</div>
              </div>
            </div>
          </Card>

          {/* Card 3: Demo Thermal Sensor */}
          <Card className="p-5 space-y-3.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--thermal-cyan)]/10 border border-[var(--thermal-cyan)]/30 flex items-center justify-center text-[var(--thermal-cyan)] shrink-0">
                  <Radio className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2.5">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] font-mono truncate">
                      SIMULATED DEMO THERMAL FEED
                    </h3>
                    <Badge variant="cyan">● Demo Mode</Badge>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                    High-fidelity synthetic LWIR thermal stream for automated testing and perimeter validation
                  </p>
                </div>
              </div>

              <button
                onClick={() => (onNavigate ? onNavigate('live') : undefined)}
                className="px-3.5 py-1.5 rounded-xl btn-secondary-interactive text-xs font-semibold text-[var(--thermal-cyan)] flex items-center space-x-1.5 cursor-pointer"
              >
                <span>OPEN DEMO FEED</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: SENSOR SETTINGS & HEALTH DIAGNOSTICS (32% / 4 Cols) */}
        <div className="lg:col-span-4 space-y-4 w-full max-w-full min-w-0">
          {/* Sensor Configuration Panel */}
          <Card className="p-4 sm:p-5 space-y-4 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] sticky top-20">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-2 min-w-0">
                <Settings className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  SENSOR CONFIGURATION
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[var(--operational-green)]">NOMINAL</span>
            </div>

            <div className="space-y-3 font-sans text-xs">
              {/* Auto Reconnect Toggle */}
              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  <div className="font-bold text-[var(--text-primary)]">Auto Reconnect</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Attempt auto-link on hardware drop</div>
                </div>
                <button
                  onClick={() => setAutoReconnect(!autoReconnect)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer p-0.5 ${
                    autoReconnect ? 'bg-[var(--operational-green)]' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      autoReconnect ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Stream Resolution Option */}
              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1.5">
                <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase">CAPTURE RESOLUTION</label>
                <select
                  value={resolutionMode}
                  onChange={(e) => setResolutionMode(e.target.value)}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
                >
                  <option value="1280x720">1280 × 720 (Native HD Capture)</option>
                  <option value="640x512">640 × 512 (Native LWIR Microbolometer)</option>
                </select>
              </div>

              {/* Stream Timeout Slider */}
              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-[var(--text-muted)]">STREAM TIMEOUT:</span>
                  <span className="text-[var(--thermal-cyan)] font-bold">{streamTimeout} ms</span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="10000"
                  step="500"
                  value={streamTimeout}
                  onChange={(e) => setStreamTimeout(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-[var(--bg-elevated)] rounded-lg appearance-none cursor-pointer accent-[var(--thermal-cyan)]"
                />
              </div>

              {/* Optical Health Specs */}
              <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                  OPTICAL SPECTRUM CALIBRATION
                </div>
                <div className="space-y-1 text-[11px] font-sans">
                  <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] flex justify-between">
                    <span className="text-[var(--text-secondary)]">Spectral Band:</span>
                    <span className="font-mono text-[var(--text-primary)]">7.5 - 13.0 μm (LWIR)</span>
                  </div>
                  <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] flex justify-between">
                    <span className="text-[var(--text-secondary)]">Thermal NETD:</span>
                    <span className="font-mono text-[var(--thermal-cyan)]">&lt; 50 mK</span>
                  </div>
                  <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] flex justify-between">
                    <span className="text-[var(--text-secondary)]">NUC Auto-Offset:</span>
                    <span className="font-mono text-[var(--operational-green)]">0.0 ms (Locked)</span>
                  </div>
                </div>
              </div>

              {/* Activity Log */}
              <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                  SENSOR EVENT LOG
                </div>
                <div data-lenis-prevent className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {sensorActivity.length === 0 ? (
                    <div className="p-3 text-center text-xs font-mono text-[var(--text-muted)] italic">
                      No recent sensor events
                    </div>
                  ) : (
                    sensorActivity.map((act, i) => (
                      <div key={i} className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] space-y-0.5">
                        <div className="text-[10px] font-mono text-[var(--text-muted)]">{act.time}</div>
                        <div className="text-[11px] text-[var(--text-secondary)]">{act.text}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Floating Bottom Feedback Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border bg-[#0A121E] border-[var(--operational-green)]/50 text-[var(--text-primary)] flex items-center space-x-3 font-sans text-xs"
          >
            <CheckCircle2 className="w-4 h-4 text-[var(--operational-green)] shrink-0" />
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

export default SensorManagement;
