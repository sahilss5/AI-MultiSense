import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SystemSettings } from '../types/schema';
import { apiService } from '../services/api';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { formatIST } from '../utils/date';
import { useTheme } from '../context/ThemeContext';
import {
  Settings as SettingsIcon,
  Save,
  CheckCircle2,
  Camera,
  Sliders,
  Sun,
  Moon,
  Globe,
  Monitor,
  Crosshair,
  ShieldAlert,
  Server,
  Clock,
  RotateCcw,
  Bell,
  Cpu,
  Shield,
  X,
  Zap,
} from 'lucide-react';
import { PageId } from '../components/common/Sidebar';

type SettingsCategory =
  | 'general'
  | 'ai_detection'
  | 'tracking_threats'
  | 'display'
  | 'thermal'
  | 'notifications'
  | 'system';

interface SettingsProps {
  onNavigate?: (page: PageId) => void;
}

const DEFAULT_SETTINGS: SystemSettings = {
  speed_threshold_kmh: 80.0,
  confidence_threshold: 0.50,
  tracking_iou_threshold: 0.45,
  thermal_camera_enabled: true,
  alert_sound_enabled: true,
  timezone: 'Asia/Kolkata',
  units: 'metric',
  tracker_algorithm: 'bytetrack',
  track_persistence_frames: 30,
  rule_zone_intrusion: true,
  rule_overspeed: true,
  backend_endpoint: 'http://127.0.0.1:8000/api',
  logging_level: 'INFO',
  data_retention_days: 30,
};

export const Settings: React.FC<SettingsProps> = ({ onNavigate }) => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsCategory>('general');
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<{ title: string; time: string } | null>(null);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Form State
  const [form, setForm] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [initialForm, setInitialForm] = useState<SystemSettings>(DEFAULT_SETTINGS);

  // UI Display Toggles (Persisted in localStorage)
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(() => {
    return localStorage.getItem('pref_showBoundingBoxes') !== 'false';
  });
  const [showConfidenceLabels, setShowConfidenceLabels] = useState<boolean>(() => {
    return localStorage.getItem('pref_showConfidenceLabels') !== 'false';
  });
  const [showTrackIds, setShowTrackIds] = useState<boolean>(() => {
    return localStorage.getItem('pref_showTrackIds') !== 'false';
  });
  const [showTrackTrails, setShowTrackTrails] = useState<boolean>(() => {
    return localStorage.getItem('pref_showTrackTrails') !== 'false';
  });

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch real settings from backend on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await apiService.getSettings();
        if (data) {
          const loaded: SystemSettings = {
            ...DEFAULT_SETTINGS,
            ...data,
            units: (localStorage.getItem('pref_units') as any) || data.units || 'metric',
            logging_level: (localStorage.getItem('pref_logging') as any) || data.logging_level || 'INFO',
          };
          setForm(loaded);
          setInitialForm(loaded);
        }
      } catch (err) {
        console.error('Failed to load backend settings:', err);
      }
    }
    loadSettings();
  }, []);

  // Save changes handler
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);

    try {
      // Save display preferences to localStorage
      localStorage.setItem('pref_showBoundingBoxes', String(showBoundingBoxes));
      localStorage.setItem('pref_showConfidenceLabels', String(showConfidenceLabels));
      localStorage.setItem('pref_showTrackIds', String(showTrackIds));
      localStorage.setItem('pref_showTrackTrails', String(showTrackTrails));
      if (form.units) localStorage.setItem('pref_units', form.units);
      if (form.logging_level) localStorage.setItem('pref_logging', form.logging_level);

      // Save core settings to backend SQLite database
      const updated = await apiService.updateSettings({
        speed_threshold_kmh: Number(form.speed_threshold_kmh),
        confidence_threshold: Number(form.confidence_threshold),
        tracking_iou_threshold: Number(form.tracking_iou_threshold),
        thermal_camera_enabled: Boolean(form.thermal_camera_enabled),
        alert_sound_enabled: Boolean(form.alert_sound_enabled),
        units: form.units,
        logging_level: form.logging_level,
        timezone: form.timezone,
      });

      setForm((prev) => ({ ...prev, ...updated }));
      setInitialForm((prev) => ({ ...prev, ...updated }));

      setToastMsg({
        title: 'Settings saved successfully.',
        time: formatIST(new Date(), { includeTimeOnly: true }),
      });
      setTimeout(() => setToastMsg(null), 3500);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setToastMsg({
        title: 'Failed to save settings.',
        time: formatIST(new Date(), { includeTimeOnly: true }),
      });
      setTimeout(() => setToastMsg(null), 3500);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to operational defaults
  const handleResetDefaults = async () => {
    try {
      let resetBackend = DEFAULT_SETTINGS;
      try {
        resetBackend = await apiService.resetSettings();
      } catch (err) {
        // Fallback update
        resetBackend = await apiService.updateSettings(DEFAULT_SETTINGS);
      }

      // Reset local preferences
      setShowBoundingBoxes(true);
      setShowConfidenceLabels(true);
      setShowTrackIds(true);
      setShowTrackTrails(true);
      localStorage.setItem('pref_showBoundingBoxes', 'true');
      localStorage.setItem('pref_showConfidenceLabels', 'true');
      localStorage.setItem('pref_showTrackIds', 'true');
      localStorage.setItem('pref_showTrackTrails', 'true');
      localStorage.setItem('pref_units', 'metric');
      localStorage.setItem('pref_logging', 'INFO');

      const restored: SystemSettings = { ...DEFAULT_SETTINGS, ...resetBackend };
      setForm(restored);
      setInitialForm(restored);
      setShowResetModal(false);

      setToastMsg({
        title: 'Settings restored to default values.',
        time: formatIST(new Date(), { includeTimeOnly: true }),
      });
      setTimeout(() => setToastMsg(null), 3500);
    } catch (err) {
      console.error('Failed to reset settings:', err);
      setShowResetModal(false);
    }
  };

  // 7 Clean Settings Categories
  const categories: { id: SettingsCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Globe className="w-4 h-4" /> },
    { id: 'ai_detection', label: 'AI & Detection', icon: <Cpu className="w-4 h-4" /> },
    { id: 'tracking_threats', label: 'Tracking & Threats', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'display', label: 'Display & Overlays', icon: <Monitor className="w-4 h-4" /> },
    { id: 'thermal', label: 'Thermal Input', icon: <Camera className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'system', label: 'System & Storage', icon: <Server className="w-4 h-4" /> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="page-container space-y-5 select-none font-sans w-full max-w-full min-w-0 relative"
    >
      {/* ======================================================== */}
      {/* 1. PAGE HEADER & SAVE ACTION                             */}
      {/* ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)] w-full max-w-full">
        <div className="min-w-0">
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-wider text-[var(--text-primary)] font-sans uppercase flex items-center gap-2.5 truncate">
              <SettingsIcon className="w-5 h-5 text-[var(--thermal-cyan)] shrink-0" />
              SETTINGS
            </h1>

            {/* Status Badge */}
            <div className="flex items-center space-x-2 bg-[#08121E] px-3.5 py-1 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--operational-green)]">
              <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]" />
              <span className="font-semibold tracking-wide">SYSTEM PREFERENCES</span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            Configure application preferences, detection thresholds, tracking parameters and storage options
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>

          <button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shadow-md disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'SAVING...' : 'SAVE CHANGES'}</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. MAIN LAYOUT: CATEGORY NAV (3 Cols) / FORM (9 Cols)    */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full max-w-full min-w-0 items-start">
        {/* Left Column: Category Navigation Strip (3 Cols / 25% Width) */}
        <div className="lg:col-span-3 space-y-2 w-full max-w-full min-w-0">
          <Card className="p-2 space-y-1 bg-[#070B12] border-[var(--border-subtle)] w-full">
            {categories.map((cat) => {
              const isActive = activeTab === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`w-full p-2.5 rounded-xl text-xs font-sans font-medium flex items-center space-x-2.5 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[var(--thermal-cyan)]/15 text-[var(--thermal-cyan)] border border-[var(--thermal-cyan)]/30 font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  <span className={isActive ? 'text-[var(--thermal-cyan)]' : 'text-[var(--text-muted)]'}>
                    {cat.icon}
                  </span>
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </Card>

          {/* Quick Action: Reset Defaults */}
          <button
            onClick={() => setShowResetModal(true)}
            className="w-full py-2 px-3 rounded-xl border border-[var(--threat-coral)]/30 bg-[var(--threat-coral)]/10 text-[var(--threat-coral)] text-xs font-semibold flex items-center justify-center space-x-1.5 hover:bg-[var(--threat-coral)]/20 cursor-pointer transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET TO DEFAULTS</span>
          </button>
        </div>

        {/* Right Column: Settings Content (9 Cols / 75% Width) */}
        <div className="lg:col-span-9 space-y-4 w-full max-w-full min-w-0">
          {/* ======================================================== */}
          {/* 1. GENERAL SETTINGS                                      */}
          {/* ======================================================== */}
          {activeTab === 'general' && (
            <Card className="p-5 sm:p-6 space-y-5 bg-[#070B12] border-[var(--border-subtle)] w-full">
              <div className="border-b border-[var(--border-subtle)] pb-3 flex justify-between items-center">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                  GENERAL APPLICATION PREFERENCES
                </h2>
                <span className="text-[10px] font-mono text-[var(--operational-green)]">SYSTEM IDENTITY</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-[var(--text-muted)]">APPLICATION</label>
                  <input
                    type="text"
                    value="AI-MULTISENSE"
                    disabled
                    className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2 text-xs font-mono text-[var(--thermal-cyan)] font-bold opacity-90 cursor-not-allowed"
                  />
                  <div className="text-[10px] text-[var(--text-muted)]">Multi-Modal Thermal Surveillance System</div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-[var(--text-muted)]">TIMEZONE</label>
                  <input
                    type="text"
                    value="Asia/Kolkata (IST • UTC+05:30)"
                    disabled
                    className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2 text-xs font-mono text-[var(--text-primary)] opacity-90 cursor-not-allowed"
                  />
                  <div className="text-[10px] text-[var(--text-muted)]">Indian Standard Time reference</div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-[var(--text-muted)]">UNITS</label>
                  <select
                    value={form.units || 'metric'}
                    onChange={(e: any) => setForm({ ...form, units: e.target.value })}
                    className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
                  >
                    <option value="metric">Metric (km/h, meters, °C)</option>
                    <option value="imperial">Imperial (mph, feet, °F)</option>
                  </select>
                  <div className="text-[10px] text-[var(--text-muted)]">Measurement standard for speed and distance</div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-[var(--text-muted)]">LOGGING</label>
                  <select
                    value={form.logging_level || 'INFO'}
                    onChange={(e: any) => setForm({ ...form, logging_level: e.target.value })}
                    className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
                  >
                    <option value="INFO">Standard system logging (INFO)</option>
                    <option value="DEBUG">Detailed debugging telemetry (DEBUG)</option>
                    <option value="WARNING">Warnings and errors only (WARNING)</option>
                  </select>
                  <div className="text-[10px] text-[var(--text-muted)]">Terminal and audit log verbosity level</div>
                </div>
              </div>
            </Card>
          )}

          {/* ======================================================== */}
          {/* 2. AI & DETECTION                                        */}
          {/* ======================================================== */}
          {activeTab === 'ai_detection' && (
            <Card className="p-5 sm:p-6 space-y-5 bg-[#070B12] border-[var(--border-subtle)] w-full">
              <div className="border-b border-[var(--border-subtle)] pb-3 flex justify-between items-center">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                  AI & DETECTION CONFIGURATION
                </h2>
                <Badge variant="emerald">READY (Loaded & Verified)</Badge>
              </div>

              {/* Model Info Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">TARGET MODEL</div>
                  <div className="text-xs font-bold font-mono text-[var(--thermal-cyan)]">YOLO11n Thermal</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">Ultralytics YOLO Architecture</div>
                </div>

                <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">MODEL FILE</div>
                  <div className="text-xs font-bold font-mono text-[var(--operational-green)]">models/thermal/best.pt</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">Custom Trained Weights</div>
                </div>

                <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">MODEL STATUS</div>
                  <div className="text-xs font-bold font-mono text-[var(--operational-green)]">READY</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">Verified & Deployed</div>
                </div>
              </div>

              {/* Confidence Threshold Slider */}
              <div className="p-4 bg-[var(--bg-surface-secondary)] rounded-2xl border border-[var(--border-subtle)] space-y-2.5">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-xs font-bold uppercase text-[var(--text-primary)] font-mono">
                      CONFIDENCE THRESHOLD
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Minimum confidence required before an object is reported.
                    </div>
                  </div>
                  <span className="font-mono text-base text-[var(--thermal-cyan)] font-extrabold px-2.5 py-0.5 rounded-lg bg-[#070B12] border border-[var(--thermal-cyan)]/30">
                    {(form.confidence_threshold * 100).toFixed(0)}%
                  </span>
                </div>

                <input
                  type="range"
                  min="0.10"
                  max="0.95"
                  step="0.05"
                  value={form.confidence_threshold}
                  onChange={(e) => setForm({ ...form, confidence_threshold: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-[#070B12] rounded-lg appearance-none cursor-pointer accent-[var(--thermal-cyan)]"
                />

                <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)]">
                  <span>10% — High Recall (Detect more, possible false positives)</span>
                  <span>95% — High Precision (Strict detection lock)</span>
                </div>
              </div>

              {/* 5 Project Detection Classes */}
              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider font-bold">
                  5 PROJECT DETECTION CLASSES (YOLO11n TAXONOMY)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs font-mono">
                  <div className="p-2 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)]">
                    <div className="text-[10px] text-[var(--text-muted)]">CLASS #0</div>
                    <div className="font-bold text-[#55D9F5]">Person</div>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)]">
                    <div className="text-[10px] text-[var(--text-muted)]">CLASS #1</div>
                    <div className="font-bold text-[#E7B85C]">Vehicle</div>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)]">
                    <div className="text-[10px] text-[var(--text-muted)]">CLASS #2</div>
                    <div className="font-bold text-[#4FD1A5]">Animal</div>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)]">
                    <div className="text-[10px] text-[var(--text-muted)]">CLASS #3</div>
                    <div className="font-bold text-[#8C9BFF]">Drone</div>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)]">
                    <div className="text-[10px] text-[var(--text-muted)]">CLASS #4</div>
                    <div className="font-bold text-[#F27786]">Person With Bag</div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] leading-relaxed">
                <span className="font-bold text-[var(--text-primary)]">Model Configuration Note: </span>
                The model architecture is fixed by the trained <span className="font-mono text-[var(--operational-green)]">best.pt</span> weights. Adjusting the confidence threshold changes the detection acceptance cutoff without retraining the model.
              </div>
            </Card>
          )}

          {/* ======================================================== */}
          {/* 3. TRACKING & THREAT SETTINGS                            */}
          {/* ======================================================== */}
          {activeTab === 'tracking_threats' && (
            <Card className="p-5 sm:p-6 space-y-5 bg-[#070B12] border-[var(--border-subtle)] w-full">
              <div className="border-b border-[var(--border-subtle)] pb-3 flex justify-between items-center">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                  TRACKING & THREAT MONITORING CONFIGURATION
                </h2>
                <span className="text-[10px] font-mono text-[var(--operational-green)]">BYTETRACK + THREAT ENGINE ACTIVE</span>
              </div>

              {/* Tracking Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">TRACKING ENGINE</div>
                  <div className="font-bold text-xs font-mono text-[var(--intelligence-violet)]">ByteTrack</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    Associates detections across video frames to maintain object IDs.
                  </div>
                </div>

                <div className="space-y-1.5 p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)]">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono uppercase text-[var(--text-muted)]">IOU THRESHOLD</label>
                    <span className="font-mono text-[var(--thermal-cyan)] font-bold">{form.tracking_iou_threshold.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.10"
                    max="0.80"
                    step="0.05"
                    value={form.tracking_iou_threshold}
                    onChange={(e) => setForm({ ...form, tracking_iou_threshold: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-[#070B12] rounded-lg appearance-none cursor-pointer accent-[var(--thermal-cyan)]"
                  />
                  <div className="text-[10px] text-[var(--text-muted)]">
                    Bounding box overlap threshold for frame-to-frame association.
                  </div>
                </div>
              </div>

              {/* Threat Engine Rules & Thresholds */}
              <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)] text-xs font-sans">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider font-bold">
                    PERIMETER THREAT EVALUATION RULES
                  </div>
                  <span className="text-[10px] font-mono text-[var(--threat-coral)] font-bold">THREAT ENGINE ARMED</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-[var(--text-primary)]">Drone</span>
                      <span className="text-[var(--threat-coral)] font-mono font-bold text-[10px]">High Threat</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Unauthorized airspace / aerial perimeter intrusion</div>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-[var(--text-primary)]">Person With Bag</span>
                      <span className="text-[var(--threat-coral)] font-mono font-bold text-[10px]">High Threat</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Suspicious payload / unattended object near perimeter</div>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-[var(--text-primary)]">Vehicle</span>
                      <span className="text-[var(--warning-amber)] font-mono font-bold text-[10px]">Speed Rule</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Threat only when configured speed threshold is exceeded</div>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-[var(--text-primary)]">Person & Animal</span>
                      <span className="text-[var(--operational-green)] font-mono font-bold text-[10px]">Normal</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Monitored entities (Threat only if inside restricted geofence)</div>
                  </div>
                </div>

                {/* Configurable Speed Limit */}
                <div className="p-3.5 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">VEHICLE SPEED THRESHOLD</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">Vehicles exceeding this speed trigger an overspeed violation.</div>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="number"
                        min="20"
                        max="160"
                        step="5"
                        value={form.speed_threshold_kmh}
                        onChange={(e) => setForm({ ...form, speed_threshold_kmh: parseFloat(e.target.value) || 80 })}
                        className="w-20 bg-[#070B12] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1 text-xs font-mono text-[var(--warning-amber)] font-bold text-center focus:outline-none focus:border-[var(--warning-amber)]"
                      />
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">km/h</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* ======================================================== */}
          {/* 4. DISPLAY & OVERLAYS                                    */}
          {/* ======================================================== */}
          {activeTab === 'display' && (
            <Card className="p-5 sm:p-6 space-y-5 bg-[#070B12] border-[var(--border-subtle)] w-full">
              <div className="border-b border-[var(--border-subtle)] pb-3 flex justify-between items-center">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                  DISPLAY & HUD OVERLAYS
                </h2>
                <span className="text-[10px] font-mono text-[var(--thermal-cyan)]">CANVAS CONTROLS</span>
              </div>

              {/* Theme Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`p-3.5 rounded-2xl border flex items-center space-x-3 cursor-pointer transition-all ${
                    theme === 'dark'
                      ? 'bg-[var(--thermal-cyan)]/10 border-[var(--thermal-cyan)] text-[var(--text-primary)] font-semibold shadow-sm'
                      : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <Moon className="w-5 h-5 text-[var(--intelligence-violet)] shrink-0" />
                  <div className="text-left min-w-0">
                    <div className="text-xs font-semibold truncate">Industrial Dark Mode (Primary)</div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate">High-contrast surveillance dark palette</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`p-3.5 rounded-2xl border flex items-center space-x-3 cursor-pointer transition-all ${
                    theme === 'light'
                      ? 'bg-[var(--thermal-cyan)]/10 border-[var(--thermal-cyan)] text-[var(--text-primary)] font-semibold shadow-sm'
                      : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <Sun className="w-5 h-5 text-[var(--warning-amber)] shrink-0" />
                  <div className="text-left min-w-0">
                    <div className="text-xs font-semibold truncate">Professional Light Mode (Secondary)</div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate">Clear daylight inspection palette</div>
                  </div>
                </button>
              </div>

              {/* Canvas HUD Toggles */}
              <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)] text-xs font-sans">
                <label className="flex items-center justify-between p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] cursor-pointer">
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">BOUNDING BOXES</div>
                    <div className="text-[11px] text-[var(--text-muted)]">Show detected object boundaries on the video.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showBoundingBoxes}
                    onChange={(e) => setShowBoundingBoxes(e.target.checked)}
                    className="w-4 h-4 rounded text-[var(--thermal-cyan)] cursor-pointer accent-[var(--thermal-cyan)]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] cursor-pointer">
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">TRACKING TRAILS</div>
                    <div className="text-[11px] text-[var(--text-muted)]">Show movement history for tracked objects.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showTrackTrails}
                    onChange={(e) => setShowTrackTrails(e.target.checked)}
                    className="w-4 h-4 rounded text-[var(--thermal-cyan)] cursor-pointer accent-[var(--thermal-cyan)]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] cursor-pointer">
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">CONFIDENCE LABELS</div>
                    <div className="text-[11px] text-[var(--text-muted)]">Display confidence score tags on detected objects.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showConfidenceLabels}
                    onChange={(e) => setShowConfidenceLabels(e.target.checked)}
                    className="w-4 h-4 rounded text-[var(--thermal-cyan)] cursor-pointer accent-[var(--thermal-cyan)]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] cursor-pointer">
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">TRACK IDENTIFIERS</div>
                    <div className="text-[11px] text-[var(--text-muted)]">Display persistent tracking ID tags on targets.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showTrackIds}
                    onChange={(e) => setShowTrackIds(e.target.checked)}
                    className="w-4 h-4 rounded text-[var(--thermal-cyan)] cursor-pointer accent-[var(--thermal-cyan)]"
                  />
                </label>
              </div>
            </Card>
          )}

          {/* ======================================================== */}
          {/* 5. THERMAL INPUT                                         */}
          {/* ======================================================== */}
          {activeTab === 'thermal' && (
            <Card className="p-5 sm:p-6 space-y-5 bg-[#070B12] border-[var(--border-subtle)] w-full">
              <div className="border-b border-[var(--border-subtle)] pb-3 flex justify-between items-center">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                  THERMAL VIDEO INPUT SOURCE
                </h2>
                <Badge variant="emerald">● Video Input Ready</Badge>
              </div>

              <div className="space-y-3.5 text-xs font-sans">
                <div className="p-4 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">INPUT SOURCE</div>
                  <div className="font-bold text-sm text-[var(--thermal-cyan)]">Recorded Thermal Video</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Primary demonstrated input for this project. Uploaded thermal MP4 files are processed by YOLO11n.
                  </div>
                </div>

                <div className="p-4 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">DEMO FEED MODE</div>
                  <div className="font-bold text-xs text-[var(--text-primary)]">Simulated Demonstration Input</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Provides baseline surveillance playback when no user video has been uploaded.
                  </div>
                </div>

                <div className="p-4 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">HARDWARE SENSOR</div>
                  <div className="font-bold text-xs text-[var(--text-secondary)]">Offline / Not Connected</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    College demonstration utilizes recorded thermal video files. No physical FLIR sensor hardware is required or claimed.
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* ======================================================== */}
          {/* 6. NOTIFICATIONS                                         */}
          {/* ======================================================== */}
          {activeTab === 'notifications' && (
            <Card className="p-5 sm:p-6 space-y-5 bg-[#070B12] border-[var(--border-subtle)] w-full">
              <div className="border-b border-[var(--border-subtle)] pb-3 flex justify-between items-center">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                  SECURITY NOTIFICATIONS & AUDIO ALERTS
                </h2>
                <span className="text-[10px] font-mono text-[var(--thermal-cyan)]">LOCAL ALERTS</span>
              </div>

              <div className="space-y-3 text-xs font-sans">
                <div className="p-4 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">SECURITY ALERTS</div>
                  <div className="font-bold text-xs text-[var(--operational-green)]">Enabled & Active</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Threat events are recorded in Alert History and broadcast live to active browser sessions.
                  </div>
                </div>

                <label className="flex items-center justify-between p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] cursor-pointer">
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">AUDIBLE ALARM SIREN</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Play audible siren tone on CRITICAL / HIGH perimeter breaches.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(form.alert_sound_enabled)}
                    onChange={(e) => setForm({ ...form, alert_sound_enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-[var(--threat-coral)] cursor-pointer accent-[var(--threat-coral)]"
                  />
                </label>
              </div>
            </Card>
          )}

          {/* ======================================================== */}
          {/* 7. SYSTEM & STORAGE                                      */}
          {/* ======================================================== */}
          {activeTab === 'system' && (
            <Card className="p-5 sm:p-6 space-y-5 bg-[#070B12] border-[var(--border-subtle)] w-full">
              <div className="border-b border-[var(--border-subtle)] pb-3 flex justify-between items-center">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                  SYSTEM STORAGE & PERSISTENCE
                </h2>
                <span className="text-[10px] font-mono text-[var(--operational-green)]">SQLITE LOCAL</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">MODEL WEIGHTS PATH</div>
                  <div className="font-bold text-[var(--operational-green)] font-mono">models/thermal/best.pt</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">Trained YOLO11n weights</div>
                </div>

                <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">ALERT DATABASE</div>
                  <div className="font-bold text-[var(--text-primary)] font-mono">SQLite (ai_multisense.db)</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">Persistent local threat storage</div>
                </div>

                <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">SNAPSHOT STORAGE</div>
                  <div className="font-bold text-[var(--text-primary)] font-mono">data/snapshots/</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">Evidence captures and PNG images</div>
                </div>

                <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                  <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">VIDEO UPLOADS</div>
                  <div className="font-bold text-[var(--text-primary)] font-mono">data/uploads/</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">User uploaded thermal videos</div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* RESET TO DEFAULTS CONFIRMATION MODAL                     */}
      {/* ======================================================== */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="bg-[#0A1018] border border-[var(--threat-coral)]/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 font-sans text-xs"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-[var(--threat-coral)]/15 text-[var(--threat-coral)] shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                    RESET SETTINGS?
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Restore application preferences
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs leading-relaxed space-y-2">
                <p>
                  This will restore configurable application settings to their default values.
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Alerts, snapshots, videos, zones, and model weights will not be deleted.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 rounded-xl btn-secondary-interactive text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleResetDefaults}
                  className="px-4 py-2 rounded-xl bg-[var(--threat-coral)] hover:bg-[var(--threat-coral)]/90 text-white text-xs font-bold font-mono tracking-wide flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-[var(--threat-coral)]/20 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RESET SETTINGS</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Bottom Feedback Toast */}
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

export default Settings;
