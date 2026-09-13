import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThreatLevel, ThermalDetectionObject, VideoStatusResponse, Zone } from '../types/schema';
import { apiService } from '../services/api';
import { Card } from '../components/common/Card';
import { SeverityIndicator } from '../components/common/SeverityIndicator';
import { formatIST } from '../utils/date';
import {
  ShieldAlert,
  Clock,
  User,
  Car,
  Plane,
  Briefcase,
  Bird,
  CheckCircle2,
  RefreshCw,
  Search,
  Radio,
  X,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Map,
  AlertTriangle,
  Crosshair,
} from 'lucide-react';

export interface ThreatItem {
  id: string;
  threatCode: string;
  track_id: number;
  object_class: string;
  threat_type: string;
  severity: ThreatLevel;
  reason: string;
  rule_name: string;
  zone: string;
  speed?: number;
  confidence: number | null;
  timestamp: string;
  duration_seconds: number;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  resolved_at?: string;
  posX: number; // -1 to 1 for tactical map
  posY: number; // -1 to 1 for tactical map
  timeline: { time: string; text: string }[];
}

interface ThreatMonitoringProps {
  detections?: ThermalDetectionObject[];
  zones?: Zone[];
  videoStatus?: VideoStatusResponse;
  sessionStartTime?: number | null;
}

export const ThreatMonitoring: React.FC<ThreatMonitoringProps> = ({
  detections = [],
  zones: propZones,
  videoStatus,
  sessionStartTime = null,
}) => {
  const [zones, setZones] = useState<Zone[]>(propZones || []);
  const [threats, setThreats] = useState<ThreatItem[]>([]);
  const seenThreatsRef = useRef<Map<string, ThreatItem>>(new window.Map());

  // Keep zones synced with propZones or load from backend SQLite
  useEffect(() => {
    if (propZones && propZones.length > 0) {
      setZones(propZones);
    } else {
      apiService
        .getZones()
        .then((data) => {
          if (Array.isArray(data)) setZones(data);
        })
        .catch((err) => {
          console.error('Failed to load zones for ThreatMonitoring:', err);
        });
    }
  }, [propZones]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedThreatId, setSelectedThreatId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ title: string; time: string; type: 'success' | 'alert' } | null>(null);

  // Collapsible sections inside drawer
  const [isTimelineExpanded, setIsTimelineExpanded] = useState<boolean>(true);
  const [isRulesExpanded, setIsRulesExpanded] = useState<boolean>(false);

  // Determine whether there is an active surveillance session
  const effectiveSessionStartTime =
    sessionStartTime ||
    (videoStatus?.session_start_time ? new Date(videoStatus.session_start_time).getTime() : null);
  const isSessionActive =
    (videoStatus?.status === 'processing' || videoStatus?.status === 'paused') &&
    effectiveSessionStartTime !== null;

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // When no surveillance session is active, strictly clear all current threats
  useEffect(() => {
    if (!isSessionActive) {
      setThreats([]);
      seenThreatsRef.current.clear();
      setSelectedThreatId(null);
      setIsDrawerOpen(false);
    }
  }, [isSessionActive]);

  // Sync real-time detections generated during the active session
  useEffect(() => {
    if (!isSessionActive) return;

    let hasUpdates = false;
    const currentMap = seenThreatsRef.current;

    detections.forEach((d) => {
      if (d.threat) {
        const trackId = d.track_id != null && d.track_id > 0 ? d.track_id : 1;
        const key = `trk-${trackId}-${d.class}`;
        const cx = (d.bbox[0] + d.bbox[2]) / 2;
        const cy = (d.bbox[1] + d.bbox[3]) / 2;
        const normX = Math.max(-0.9, Math.min(0.9, (cx - 0.5) * 1.6));
        const normY = Math.max(-0.9, Math.min(0.9, (cy - 0.5) * 1.6));
        const timeStr = formatIST(new Date(), { includeTimeOnly: true });

        const existing = currentMap.get(key);
        if (existing) {
          existing.posX = normX;
          existing.posY = normY;
          if (d.confidence != null) existing.confidence = d.confidence;
          if (d.speed != null) existing.speed = d.speed;
          hasUpdates = true;
        } else {
          const newThreat: ThreatItem = {
            id: `thr-${trackId}-${Date.now()}`,
            threatCode: `THREAT #T-${trackId}`,
            track_id: trackId,
            object_class: (d.class || 'Target').replace(/_/g, ' '),
            threat_type: d.threat_reason || 'Perimeter Intrusion',
            severity: (d.threat_level as any) || 'HIGH',
            reason: d.threat_reason || 'Unauthorized thermal target detected',
            rule_name: d.threat_reason ? 'Automated Threat Rule' : 'Restricted Geo-Perimeter Intrusion',
            zone: d.zone || 'Surveillance Area',
            speed: d.speed || undefined,
            confidence: d.confidence != null ? d.confidence : null,
            timestamp: timeStr,
            duration_seconds: 0,
            status: 'ACTIVE',
            posX: normX,
            posY: normY,
            timeline: [
              { time: timeStr, text: d.threat_reason || 'Threat detected by Threat Engine' },
            ],
          };
          currentMap.set(key, newThreat);
          hasUpdates = true;
        }
      }
    });

    if (hasUpdates || currentMap.size !== threats.length) {
      setThreats(Array.from(currentMap.values()));
    }
  }, [detections, isSessionActive, threats.length]);

  // Synchronize backend alerts belonging exclusively to the current active session
  const fetchThreats = async () => {
    if (!isSessionActive || !effectiveSessionStartTime) {
      setThreats([]);
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiService.getAlertHistory({ limit: 50 });
      if (data && data.length > 0) {
        // Filter strictly for alerts generated during this active surveillance session
        const sessionAlerts = data.filter(
          (a) => new Date(a.timestamp).getTime() >= effectiveSessionStartTime - 2000
        );

        const currentMap = seenThreatsRef.current;
        sessionAlerts.forEach((a) => {
          const trackId = a.track_id != null ? a.track_id : 1;
          const key = `trk-${trackId}-${a.object_class || 'Target'}`;
          const existing = currentMap.get(key);
          if (existing) {
            existing.id = a.id;
            if (a.status === 'ACKNOWLEDGED' || a.status === 'RESOLVED') {
              existing.status = a.status;
            }
          } else {
            const newThreat: ThreatItem = {
              id: a.id,
              threatCode: `THREAT #T-${trackId}`,
              track_id: trackId,
              object_class: (a.object_class || 'Target').replace(/_/g, ' '),
              threat_type: a.threat_type || 'Perimeter Alert',
              severity: a.severity || 'HIGH',
              reason: a.reason || 'Threat rule violation triggered by thermal engine.',
              rule_name: a.threat_type || 'Automated Threat Rule',
              zone: a.zone || 'Surveillance Area',
              speed: a.speed || undefined,
              confidence: a.confidence != null ? a.confidence : null,
              timestamp: formatIST(a.timestamp, { includeTimeOnly: true }),
              duration_seconds: 15,
              status: (a.status as any) || 'ACTIVE',
              posX: 0,
              posY: 0,
              timeline: [
                { time: formatIST(a.timestamp, { includeTimeOnly: true }), text: 'Incident acquired by thermal engine' },
                { time: 'Active', text: a.reason },
              ],
            };
            currentMap.set(key, newThreat);
          }
        });
        setThreats(Array.from(currentMap.values()));
      }
    } catch (err) {
      console.error('Failed to sync session alerts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSessionActive) {
      fetchThreats();
    }
  }, [isSessionActive, effectiveSessionStartTime]);

  // Filter & Search Logic (strictly over current session threats)
  const filteredThreats = useMemo(() => {
    if (!isSessionActive) return [];

    return threats.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mCode = t.threatCode.toLowerCase().includes(q);
        const mClass = t.object_class.toLowerCase().includes(q);
        const mType = t.threat_type.toLowerCase().includes(q);
        const mZone = t.zone.toLowerCase().includes(q);
        const mTrack = t.track_id != null ? t.track_id.toString().includes(q) : false;
        if (!mCode && !mClass && !mType && !mZone && !mTrack) return false;
      }

      return true;
    });
  }, [threats, statusFilter, searchQuery, isSessionActive]);

  const selectedThreat = useMemo(() => {
    if (!isSessionActive || threats.length === 0) return null;
    return threats.find((t) => t.id === selectedThreatId) || filteredThreats[0] || threats[0] || null;
  }, [threats, filteredThreats, selectedThreatId, isSessionActive]);

  // Current Session Threat Counters (Strictly 0 when no active session)
  const countCritical = isSessionActive ? threats.filter((t) => t.severity === 'CRITICAL' && t.status === 'ACTIVE').length : 0;
  const countHigh = isSessionActive ? threats.filter((t) => t.severity === 'HIGH' && t.status === 'ACTIVE').length : 0;
  const countMedium = isSessionActive ? threats.filter((t) => t.severity === 'MEDIUM' && t.status === 'ACTIVE').length : 0;
  const countLow = isSessionActive ? threats.filter((t) => t.severity === 'LOW' && t.status === 'ACTIVE').length : 0;
  const countActiveTotal = isSessionActive ? threats.filter((t) => t.status === 'ACTIVE').length : 0;
  const lastEventTime = isSessionActive && threats.length > 0 ? threats[0]?.timestamp : 'NO CURRENT EVENTS';

  // Active detections & targets strictly for the current session
  const currentActiveTargets = useMemo(() => {
    if (!isSessionActive) return [];
    return detections;
  }, [detections, isSessionActive]);

  const currentThreatDetections = useMemo(() => {
    if (!isSessionActive) return [];
    return detections.filter((d) => d.threat);
  }, [detections, isSessionActive]);

  const activeIntrusions = useMemo(() => {
    if (!isSessionActive) return [];
    return detections.filter((d) => d.threat && d.zone);
  }, [detections, isSessionActive]);

  // Surveillance Zone Map Header Status strictly from current data
  const mapHeaderStatus = useMemo(() => {
    if (!isSessionActive) return 'SECTOR SECURE';
    if (activeIntrusions.length > 0) return 'ZONE INTRUSION';
    if (currentThreatDetections.length > 0 || threats.some((t) => t.status === 'ACTIVE')) return 'THREAT DETECTED';
    return 'SECTOR SECURE';
  }, [isSessionActive, activeIntrusions.length, currentThreatDetections.length, threats]);

  // Empty state condition helpers for the map
  const isVideoRunning = isSessionActive;
  const isNoTargets = isVideoRunning && currentActiveTargets.length === 0;
  const isNoThreats = isVideoRunning && currentActiveTargets.length > 0 && currentThreatDetections.length === 0;

  // Active map threats (for linking to drawer)
  const activeMapThreats = isSessionActive ? threats.filter((t) => t.status === 'ACTIVE') : [];

  // Actions: Acknowledge & Resolve (Persisting to SQLite for Alert History)
  const handleAcknowledge = async (id: string) => {
    try {
      if (id.startsWith('alt_')) {
        await apiService.updateAlertStatus(id, 'ACKNOWLEDGED');
      }
    } catch (e) {
      console.error('Failed to persist alert status:', e);
    }
    setThreats((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'ACKNOWLEDGED' as const } : t))
    );
    setToastMessage({
      title: 'THREAT INCIDENT ACKNOWLEDGED',
      time: formatIST(new Date(), { includeTimeOnly: true }),
      type: 'success',
    });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleResolve = async (id: string) => {
    const resolvedTime = formatIST(new Date(), { includeTimeOnly: true });
    try {
      if (id.startsWith('alt_')) {
        await apiService.updateAlertStatus(id, 'RESOLVED');
      }
    } catch (e) {
      console.error('Failed to persist alert status:', e);
    }
    setThreats((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: 'RESOLVED' as const,
              resolved_at: resolvedTime,
              timeline: [...t.timeline, { time: resolvedTime, text: 'Threat marked as RESOLVED by security operator' }],
            }
          : t
      )
    );
    setToastMessage({
      title: 'THREAT INCIDENT RESOLVED & ARCHIVED',
      time: resolvedTime,
      type: 'success',
    });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const getClassIcon = (cls: string) => {
    const norm = (cls || '').toUpperCase();
    if (norm.includes('DRONE')) return <Plane className="w-3.5 h-3.5" />;
    if (norm.includes('VEHICLE')) return <Car className="w-3.5 h-3.5" />;
    if (norm.includes('BAG')) return <Briefcase className="w-3.5 h-3.5" />;
    if (norm.includes('ANIMAL')) return <Bird className="w-3.5 h-3.5" />;
    return <User className="w-3.5 h-3.5" />;
  };

  const handleSelectThreat = (threat: ThreatItem) => {
    setSelectedThreatId(threat.id);
    setIsDrawerOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="page-container space-y-4 select-none font-sans w-full max-w-full min-w-0 relative"
    >
      {/* ======================================================== */}
      {/* LEVEL 1: PAGE HEADER                                     */}
      {/* ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)] w-full max-w-full">
        <div className="min-w-0">
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <h1 className="text-base sm:text-lg font-extrabold tracking-wider text-[var(--text-primary)] font-sans uppercase flex items-center gap-2 truncate">
              <ShieldAlert className="w-4.5 h-4.5 text-[var(--threat-coral)] shrink-0" />
              THREAT MONITORING
            </h1>

            {/* Threat Engine Service Status */}
            <div className="flex items-center space-x-1.5 bg-[#170A0E] px-3 py-0.5 rounded-full border border-[var(--threat-coral)]/30 text-[11px] font-mono text-[var(--threat-coral)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--threat-coral)] pulse-threat shadow-[0_0_6px_var(--threat-coral)]" />
              <span className="font-semibold tracking-wide uppercase">THREAT ENGINE ACTIVE</span>
            </div>

            {/* Session Live Status Indicator */}
            <div className="flex items-center space-x-1.5 bg-[#08121E] px-3 py-0.5 rounded-full border border-[var(--border-subtle)] text-[11px] font-mono">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isSessionActive && countActiveTotal > 0
                    ? 'bg-[var(--threat-coral)] pulse-threat'
                    : isSessionActive
                    ? 'bg-[var(--operational-green)] pulse-live'
                    : 'bg-[var(--text-muted)]'
                }`}
              />
              <span
                className={
                  isSessionActive && countActiveTotal > 0
                    ? 'text-[var(--threat-coral)] font-bold'
                    : isSessionActive
                    ? 'text-[var(--operational-green)] font-semibold'
                    : 'text-[var(--text-muted)] font-semibold'
                }
              >
                {isSessionActive ? 'SURVEILLANCE ACTIVE' : 'SURVEILLANCE IDLE'}
              </span>
            </div>

            {isSessionActive && countActiveTotal > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--threat-coral)]/10 text-[var(--threat-coral)] border border-[var(--threat-coral)]/30 font-bold">
                {countActiveTotal.toString().padStart(2, '0')} THREAT{countActiveTotal > 1 ? 'S' : ''} DETECTED
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            Current surveillance session threat evaluation · real-time thermal incidents
          </p>
        </div>

        <div className="flex items-center space-x-2.5 shrink-0">
          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>

          <button
            onClick={fetchThreats}
            className="p-1.5 rounded-xl btn-secondary-interactive text-xs cursor-pointer"
            title="Refresh session threat feed"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--thermal-cyan)] ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* LEVEL 2: COMPACT OPERATIONAL STATUS RAIL                 */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 w-full max-w-full min-w-0">
        {/* ACTIVE THREATS (Primary Metric) */}
        <div className="p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between space-y-0.5">
          <span className="text-[9px] font-mono uppercase text-[var(--text-muted)] tracking-wider">ACTIVE THREATS</span>
          <span className="text-xl font-mono font-extrabold text-[var(--threat-coral)]">
            {countActiveTotal.toString().padStart(2, '0')}
          </span>
        </div>

        {/* CRITICAL */}
        <div className="p-3 bg-[#12080A] rounded-xl border border-[var(--threat-coral)]/25 flex flex-col justify-between space-y-0.5">
          <div className="flex items-center justify-between text-[9px] font-mono uppercase text-[var(--threat-coral)] tracking-wider">
            <span>CRITICAL</span>
            {countCritical > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[var(--threat-coral)] pulse-threat" />}
          </div>
          <span className="text-xl font-mono font-extrabold text-[var(--threat-coral)]">
            {countCritical.toString().padStart(2, '0')}
          </span>
        </div>

        {/* HIGH */}
        <div className="p-3 bg-[#120A08] rounded-xl border border-[#F28B55]/25 flex flex-col justify-between space-y-0.5">
          <span className="text-[9px] font-mono uppercase text-[#F28B55] tracking-wider">HIGH</span>
          <span className="text-xl font-mono font-extrabold text-[#F28B55]">
            {countHigh.toString().padStart(2, '0')}
          </span>
        </div>

        {/* MEDIUM */}
        <div className="p-3 bg-[#100E08] rounded-xl border border-[var(--warning-amber)]/25 flex flex-col justify-between space-y-0.5">
          <span className="text-[9px] font-mono uppercase text-[var(--warning-amber)] tracking-wider">MEDIUM</span>
          <span className="text-xl font-mono font-extrabold text-[var(--warning-amber)]">
            {countMedium.toString().padStart(2, '0')}
          </span>
        </div>

        {/* LOW */}
        <div className="p-3 bg-[#080E14] rounded-xl border border-[var(--thermal-cyan)]/20 flex flex-col justify-between space-y-0.5">
          <span className="text-[9px] font-mono uppercase text-[var(--thermal-cyan)] tracking-wider">LOW</span>
          <span className="text-xl font-mono font-extrabold text-[var(--thermal-cyan)]">
            {countLow.toString().padStart(2, '0')}
          </span>
        </div>

        {/* LAST EVENT */}
        <div className="p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between space-y-0.5">
          <span className="text-[9px] font-mono uppercase text-[var(--text-muted)] tracking-wider">LAST EVENT</span>
          <span className="text-xs font-mono font-bold text-[var(--text-primary)] truncate">
            {lastEventTime}
          </span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* LEVEL 3: MAIN WORKSPACE (THREAT QUEUE 40% | MAP 60%)     */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 w-full max-w-full min-w-0 items-start">
        {/* LEFT PANEL: THREAT QUEUE (5 Cols / 40% Width) */}
        <div className="lg:col-span-5 space-y-3 w-full max-w-full min-w-0">
          <Card className="p-3.5 space-y-3 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            {/* Queue Header & Filters */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center space-x-2 min-w-0">
                <ShieldAlert className="w-3.5 h-3.5 text-[var(--threat-coral)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  THREAT QUEUE ({filteredThreats.length.toString().padStart(2, '0')} EVENTS)
                </h3>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center space-x-0.5 p-0.5 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] text-[10px]">
                {(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'ALL'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2 py-0.5 rounded font-sans transition-colors cursor-pointer ${
                      statusFilter === st
                        ? 'bg-[var(--thermal-cyan)] text-[#05080D] font-bold shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Compact Search Box */}
            <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)]">
              <Search className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
              <input
                type="text"
                placeholder="Search Threat, Track, Zone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none font-sans"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-[var(--text-muted)] hover:text-white cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Threat Queue Incident Rows */}
            <div data-lenis-prevent className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {!isSessionActive ? (
                <div className="text-center py-12 space-y-2 border border-dashed border-[var(--border-subtle)] rounded-xl">
                  <ShieldAlert className="w-7 h-7 text-[var(--text-muted)] opacity-30 mx-auto" />
                  <div className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                    NO ACTIVE THREATS
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Start thermal surveillance to begin threat monitoring.
                  </div>
                </div>
              ) : filteredThreats.length === 0 ? (
                <div className="text-center py-12 space-y-2 border border-dashed border-[var(--border-subtle)] rounded-xl">
                  <CheckCircle2 className="w-6 h-6 text-[var(--operational-green)] mx-auto" />
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    NO {statusFilter === 'ALL' ? 'THREATS' : statusFilter} IN CURRENT SESSION
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">All monitored perimeter sectors clear.</div>
                </div>
              ) : (
                filteredThreats.map((threat) => {
                  const isSelected = selectedThreat?.id === threat.id;
                  const isCritical = threat.severity === 'CRITICAL';
                  const isHigh = threat.severity === 'HIGH';

                  return (
                    <motion.div
                      key={threat.id}
                      onClick={() => handleSelectThreat(threat)}
                      whileHover={{ x: 2 }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                        isSelected
                          ? isCritical
                            ? 'bg-[#180A0E] border-[var(--threat-coral)] shadow-sm'
                            : isHigh
                            ? 'bg-[#160D08] border-[#F28B55] shadow-sm'
                            : 'bg-[#0A121E] border-[var(--thermal-cyan)] shadow-sm'
                          : threat.status === 'RESOLVED'
                          ? 'bg-[var(--bg-surface-secondary)]/40 border-[var(--border-subtle)] opacity-70'
                          : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
                      }`}
                    >
                      {/* Top Row: Severity + Threat Code + Track ID */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isCritical ? 'bg-[var(--threat-coral)] pulse-threat' : isHigh ? 'bg-[#F28B55]' : 'bg-[var(--warning-amber)]'
                            }`}
                          />
                          <span className="font-mono font-bold text-xs text-[var(--text-primary)] truncate">
                            {threat.threatCode}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">TRACK T-{threat.track_id}</span>
                          <SeverityIndicator level={threat.severity} />
                        </div>
                      </div>

                      {/* Middle Row: Entity Class */}
                      <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                        <span className="p-0.5 rounded bg-[var(--bg-surface)] text-[var(--thermal-cyan)]">
                          {getClassIcon(threat.object_class)}
                        </span>
                        <span className="truncate">{threat.object_class}</span>
                      </div>

                      {/* Event Description */}
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1 leading-snug">
                        {threat.reason}
                      </p>

                      {/* Bottom Row: Location & Timestamp */}
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] pt-1 border-t border-white/[0.04]">
                        <span className="truncate text-[var(--text-secondary)]">{threat.zone}</span>
                        <span>{threat.timestamp}</span>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT PANEL: SURVEILLANCE ZONE MAP (7 Cols / 60% Width - HERO) */}
        <div className="lg:col-span-7 space-y-3 w-full max-w-full min-w-0">
          <Card className="p-3.5 space-y-3 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            {/* Header: Title, Subtitle, and Dynamic Status Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--border-subtle)] pb-2.5 gap-2">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center space-x-2 min-w-0">
                  <Map className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
                  <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                    ● SURVEILLANCE ZONE MAP
                  </h3>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-sans mt-0.5">
                  Thermal targets and restricted-zone overview
                </span>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider uppercase border transition-colors ${
                    mapHeaderStatus === 'ZONE INTRUSION'
                      ? 'bg-[var(--threat-coral)]/15 border-[var(--threat-coral)] text-[var(--threat-coral)] shadow-[0_0_8px_rgba(242,119,134,0.3)] animate-pulse'
                      : mapHeaderStatus === 'THREAT DETECTED'
                      ? 'bg-[#F28B55]/15 border-[#F28B55] text-[#F28B55]'
                      : 'bg-[var(--operational-green)]/15 border-[var(--operational-green)]/40 text-[var(--operational-green)]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      mapHeaderStatus === 'ZONE INTRUSION'
                        ? 'bg-[var(--threat-coral)]'
                        : mapHeaderStatus === 'THREAT DETECTED'
                        ? 'bg-[#F28B55]'
                        : 'bg-[var(--operational-green)]'
                    }`}
                  />
                  {mapHeaderStatus}
                </span>
              </div>
            </div>

            {/* Map Compact Legend & Coordinate Reference Label */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[9.5px] font-mono text-[var(--text-muted)] border-b border-[var(--border-subtle)]/50 pb-2">
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] inline-block" />
                  NORMAL TARGET
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--threat-coral)] inline-block" />
                  THREAT TARGET
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2 border border-[var(--threat-coral)] bg-[var(--threat-coral)]/20 inline-block rounded-sm" />
                  RESTRICTED ZONE
                </span>
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 text-[var(--threat-coral)]" />
                  INTRUSION
                </span>
              </div>
              <span className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                [ RELATIVE / IMAGE-BASED POSITION ]
              </span>
            </div>

            {/* Active Intrusion Alert Banner (When intrusion is occurring) */}
            {activeIntrusions.length > 0 && (
              <div className="px-3 py-1.5 rounded-lg bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/40 flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 text-[11px] font-mono text-[var(--threat-coral)] font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 animate-bounce" />
                  <span>ZONE INTRUSION:</span>
                  <span className="text-[var(--text-primary)] font-normal">
                    {activeIntrusions.map((d) => `T-${d.track_id != null ? d.track_id : 1} · ${(d.class || 'Target').toUpperCase()} (${d.zone || 'Restricted Zone'})`).join(', ')}
                  </span>
                </div>
              </div>
            )}

            {/* 2D Surveillance Plane Viewport (Clean Top-Down Image Plane) */}
            <div className="relative w-full max-w-full min-w-0 h-[460px] sm:h-[480px] rounded-xl bg-[#03060B] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden">
              {/* Clean Subtle Grid Lines (50px interval) */}
              <div
                className="absolute inset-0 pointer-events-none opacity-25"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(85,217,245,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(85,217,245,0.06) 1px, transparent 1px)',
                  backgroundSize: '50px 50px',
                }}
              />

              {/* EMPTY STATES */}
              {!isVideoRunning ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-2 z-20 pointer-events-none bg-[#03060B]/85 backdrop-blur-[2px]">
                  <Crosshair className="w-8 h-8 text-[var(--text-muted)] opacity-30 mb-1" />
                  <div className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                    NO ACTIVE SURVEILLANCE
                  </div>
                  <div className="text-[11px] font-sans text-[var(--text-muted)] max-w-xs">
                    Upload and start a thermal video to begin monitoring.
                  </div>
                </div>
              ) : isNoTargets ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-2 z-20 pointer-events-none bg-[#03060B]/60">
                  <ShieldCheck className="w-8 h-8 text-[var(--operational-green)] opacity-50 mb-1" />
                  <div className="text-xs font-bold font-mono text-[var(--operational-green)] uppercase tracking-wider">
                    NO ACTIVE TARGETS
                  </div>
                  <div className="text-[11px] font-sans text-[var(--text-muted)] max-w-xs">
                    Monitoring thermal video...
                  </div>
                </div>
              ) : isNoThreats ? (
                <div className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded bg-[var(--bg-surface-secondary)]/90 border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--operational-green)] flex items-center gap-1.5 shadow-md">
                  <CheckCircle2 className="w-3 h-3 text-[var(--operational-green)]" />
                  <span>NO ACTIVE THREATS · Sector Secured</span>
                </div>
              ) : null}

              {/* 2D Surveillance Canvas SVG (500x500 normalized coordinate space) */}
              <svg
                viewBox="0 0 500 500"
                shapeRendering="geometricPrecision"
                textRendering="geometricPrecision"
                className="w-full h-full absolute inset-0 select-none"
              >
                {/* Real Geofence Polygons from Database */}
                {zones.map((zone) => {
                  const zoneType = (zone.zone_type || 'RESTRICTED').toUpperCase();
                  const isRestricted = zoneType === 'RESTRICTED';
                  const zoneColor = isRestricted ? '#F27786' : '#55D9F5';
                  const zoneFill = isRestricted ? 'rgba(242, 119, 134, 0.12)' : 'rgba(85, 217, 245, 0.08)';
                  const hasIntrusion = activeIntrusions.some(
                    (d) => (d.zone || '').toLowerCase() === zone.name.toLowerCase()
                  );

                  // Convert normalized polygon points (0..1) to SVG 500x500 space
                  const pointsStr = zone.polygon
                    .map((pt) => `${Math.round(pt[0] * 500)},${Math.round(pt[1] * 500)}`)
                    .join(' ');

                  // Center of polygon for label positioning
                  const avgX =
                    zone.polygon.reduce((acc, pt) => acc + pt[0], 0) / (zone.polygon.length || 1);
                  const avgY =
                    zone.polygon.reduce((acc, pt) => acc + pt[1], 0) / (zone.polygon.length || 1);

                  return (
                    <g
                      key={zone.id}
                      className="cursor-pointer transition-opacity hover:opacity-100 opacity-90"
                      onClick={() => {
                        setToastMessage({
                          title: `${zone.name.toUpperCase()} (${isRestricted ? 'RESTRICTED' : 'MONITORING'})`,
                          time: `Status: ${zone.enabled ? 'Armed' : 'Disarmed'} · Severity: ${zone.severity || 'HIGH'}`,
                          type: isRestricted ? 'alert' : 'success',
                        });
                        setTimeout(() => setToastMessage(null), 3000);
                      }}
                    >
                      <polygon
                        points={pointsStr}
                        fill={hasIntrusion ? 'rgba(242, 119, 134, 0.25)' : zoneFill}
                        stroke={zoneColor}
                        strokeWidth={hasIntrusion ? 2.5 : 1.5}
                        strokeDasharray={isRestricted ? 'none' : '4 3'}
                      />
                      {/* Zone Name Label */}
                      <text
                        x={Math.max(25, Math.min(475, Math.round(avgX * 500)))}
                        y={Math.max(25, Math.min(475, Math.round(avgY * 500)))}
                        fill={zoneColor}
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {zone.name.toUpperCase()}
                      </text>
                      {/* Zone Type Tag */}
                      <text
                        x={Math.max(25, Math.min(475, Math.round(avgX * 500)))}
                        y={Math.max(38, Math.min(488, Math.round(avgY * 500) + 13))}
                        fill={zoneColor}
                        fontSize="8"
                        fontFamily="JetBrains Mono, monospace"
                        opacity="0.8"
                        textAnchor="middle"
                      >
                        [{isRestricted ? 'RESTRICTED' : 'MONITORING'}]
                      </text>
                    </g>
                  );
                })}

                {/* Real Active ByteTrack Targets (Strictly Current Session) */}
                {isSessionActive &&
                  currentActiveTargets.map((d, index) => {
                    const trackId = d.track_id != null && d.track_id > 0 ? d.track_id : index + 1;
                    const isThreat = Boolean(d.threat);
                    const isIntrusion = Boolean(d.threat && d.zone);

                    // Compute normalized center position from bounding box
                    const cx = Math.max(0.05, Math.min(0.95, (d.bbox[0] + d.bbox[2]) / 2));
                    const cy = Math.max(0.05, Math.min(0.95, (d.bbox[1] + d.bbox[3]) / 2));
                    const posX = cx * 500;
                    const posY = cy * 500;

                    const markerColor = isThreat ? '#F27786' : '#55D9F5';
                    const targetClass = (d.class || 'Target').toUpperCase();

                    return (
                      <g
                        key={`target-${trackId}-${index}`}
                        data-testid="map-active-target"
                        className="cursor-pointer transition-transform group"
                        onClick={() => {
                          const matchedThreat = threats.find((t) => t.track_id === trackId);
                          if (matchedThreat) {
                            handleSelectThreat(matchedThreat);
                          } else {
                            setToastMessage({
                              title: `TARGET T-${trackId} · ${targetClass}`,
                              time: isThreat ? 'CLASSIFIED AS THREAT' : 'NORMAL STATUS',
                              type: isThreat ? 'alert' : 'success',
                            });
                            setTimeout(() => setToastMessage(null), 3000);
                          }
                        }}
                      >
                        {/* Outer Glow / Halo */}
                        <circle
                          cx={posX}
                          cy={posY}
                          r={isThreat ? 14 : 9}
                          fill={markerColor}
                          fillOpacity={isThreat ? 0.25 : 0.15}
                          stroke={markerColor}
                          strokeWidth={isThreat ? 1.5 : 1}
                          strokeDasharray={isThreat ? 'none' : '2 2'}
                        />

                        {/* Center Target Core Point */}
                        <circle
                          cx={posX}
                          cy={posY}
                          r={isThreat ? 4 : 3}
                          fill={markerColor}
                        />

                        {/* Target Label Card (Clean, Top-Down Annotation) */}
                        <g transform={`translate(${posX}, ${posY - 18})`}>
                          <rect
                            x="-38"
                            y="-14"
                            width="76"
                            height="15"
                            rx="3"
                            fill="#070B12"
                            fillOpacity="0.95"
                            stroke={markerColor}
                            strokeWidth="0.8"
                          />
                          <text
                            x="0"
                            y="-3"
                            fill="#FFFFFF"
                            fontSize="8"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            T-{trackId} {targetClass}
                          </text>

                          {/* Threat Status Pill */}
                          <rect
                            x="-24"
                            y="2"
                            width="48"
                            height="10"
                            rx="2"
                            fill={isThreat ? '#F27786' : '#22C55E'}
                          />
                          <text
                            x="0"
                            y="10"
                            fill="#070B12"
                            fontSize="7"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {isThreat ? (isIntrusion ? 'INTRUSION' : 'THREAT') : 'NORMAL'}
                          </text>
                        </g>
                      </g>
                    );
                  })}
              </svg>
            </div>

            {/* Bottom Summary: 5 Real Current Values */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono text-[var(--text-secondary)] pt-1">
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between">
                <span className="text-[9px] text-[var(--text-muted)] uppercase">SECTOR</span>
                <span className="text-[var(--thermal-cyan)] font-semibold text-xs mt-0.5">Alpha-4</span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between">
                <span className="text-[9px] text-[var(--text-muted)] uppercase">GEO-FENCES</span>
                <span className="text-[var(--operational-green)] font-semibold text-xs mt-0.5">
                  {zones.length} Armed
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between">
                <span className="text-[9px] text-[var(--text-muted)] uppercase">ACTIVE TARGETS</span>
                <span className="text-[var(--text-primary)] font-semibold text-xs mt-0.5">
                  {currentActiveTargets.length}
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between">
                <span className="text-[9px] text-[var(--text-muted)] uppercase">INTRUSIONS</span>
                <span
                  className={`font-semibold text-xs mt-0.5 ${
                    activeIntrusions.length > 0 ? 'text-[var(--threat-coral)]' : 'text-[var(--operational-green)]'
                  }`}
                >
                  {activeIntrusions.length}
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between col-span-2 sm:col-span-1">
                <span className="text-[9px] text-[var(--text-muted)] uppercase">THREATS</span>
                <span
                  className={`font-semibold text-xs mt-0.5 ${
                    currentThreatDetections.length > 0
                      ? 'text-[var(--threat-coral)]'
                      : 'text-[var(--operational-green)]'
                  }`}
                >
                  {currentThreatDetections.length}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ======================================================== */}
      {/* LEVEL 4: INCIDENT INSPECTOR DRAWER                       */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isDrawerOpen && selectedThreat && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-[4px]">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[460px] bg-[#070B12] border-l border-[var(--border-subtle)] h-[100dvh] max-h-[100dvh] shadow-2xl flex flex-col overflow-hidden font-sans select-none"
            >
              {/* FIXED DRAWER HEADER */}
              <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[#070B12] z-20">
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="p-2 rounded-xl bg-[var(--threat-coral)]/10 text-[var(--threat-coral)] border border-[var(--threat-coral)]/20 shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <h3 className="font-mono font-bold text-xs sm:text-sm text-[var(--text-primary)] truncate">
                        {selectedThreat.threatCode}
                      </h3>
                      <SeverityIndicator level={selectedThreat.severity} />
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide uppercase">
                      INCIDENT INVESTIGATOR
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 rounded-lg btn-secondary-interactive text-[var(--text-secondary)] hover:text-white cursor-pointer shrink-0 ml-2"
                  aria-label="Close Threat Inspector"
                  title="Close Inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* SCROLLABLE INCIDENT CONTENT BODY */}
              <div
                data-lenis-prevent
                className="p-4 sm:p-5 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain"
              >
                {/* 2x2 Telemetry Matrix */}
                <div className="grid grid-cols-2 gap-2.5 text-xs font-sans">
                  <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
                    <span className="text-[9px] font-mono uppercase text-[var(--text-muted)] tracking-wider">ENTITY CLASS</span>
                    <div className="font-semibold text-[var(--text-primary)] flex items-center space-x-1.5 truncate">
                      {getClassIcon(selectedThreat.object_class)}
                      <span className="truncate">{selectedThreat.object_class}</span>
                    </div>
                    <span className="text-[9px] font-mono text-[var(--text-muted)]">TRACK T-{selectedThreat.track_id}</span>
                  </div>

                  <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
                    <span className="text-[9px] font-mono uppercase text-[var(--text-muted)] tracking-wider">AI CONFIDENCE</span>
                    <div className="font-bold text-sm font-mono text-[var(--operational-green)]">
                      {selectedThreat.confidence != null ? `${(selectedThreat.confidence * 100).toFixed(1)}%` : 'N/A'}
                    </div>
                    <span className="text-[9px] font-mono text-[var(--text-muted)]">YOLO Inference</span>
                  </div>

                  <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
                    <span className="text-[9px] font-mono uppercase text-[var(--text-muted)] tracking-wider">LOCATION / ZONE</span>
                    <div className="font-semibold text-[var(--text-primary)] truncate text-[11px]">{selectedThreat.zone}</div>
                    <span className="text-[9px] font-mono text-[var(--thermal-cyan)]">Sector Alpha-4</span>
                  </div>

                  <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
                    <span className="text-[9px] font-mono uppercase text-[var(--text-muted)] tracking-wider">TIMESTAMP</span>
                    <div className="font-mono font-semibold text-[var(--text-primary)] text-[11px]">{selectedThreat.timestamp}</div>
                    <span className="text-[9px] font-mono text-[var(--text-muted)]">Current Session</span>
                  </div>
                </div>

                {/* Incident Summary Card */}
                <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border-l-2 border-l-[var(--threat-coral)] border-y border-r border-[var(--border-subtle)] space-y-1">
                  <span className="text-[9px] font-mono uppercase text-[var(--text-muted)] tracking-wider">INCIDENT SUMMARY</span>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                    {selectedThreat.reason}
                  </p>
                </div>

                {/* Collapsible Incident Timeline */}
                <div className="border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-surface-secondary)] overflow-hidden">
                  <button
                    onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
                    className="w-full p-3 flex items-center justify-between text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-wide">INCIDENT TIMELINE ({selectedThreat.timeline.length})</span>
                    {isTimelineExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                  </button>

                  {isTimelineExpanded && (
                    <div className="px-3.5 pb-3.5 space-y-2.5 text-xs border-t border-[var(--border-subtle)] pt-3">
                      {selectedThreat.timeline.map((item, idx) => (
                        <div key={idx} className="flex items-start space-x-2.5 text-xs relative">
                          {idx !== selectedThreat.timeline.length - 1 && (
                            <span className="absolute left-[3px] top-[14px] bottom-[-10px] w-[1px] bg-[var(--border-subtle)]" />
                          )}
                          <span className="w-2 h-2 rounded-full bg-[var(--thermal-cyan)] mt-1 shrink-0 z-10" />
                          <div className="min-w-0">
                            <div className="text-[10px] font-mono text-[var(--text-muted)]">{item.time}</div>
                            <div className="text-[11px] text-[var(--text-secondary)] leading-snug">{item.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Collapsible Security Rule Matrix */}
                <div className="border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-surface-secondary)] overflow-hidden">
                  <button
                    onClick={() => setIsRulesExpanded(!isRulesExpanded)}
                    className="w-full p-3 flex items-center justify-between text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-wide">SECURITY RULE DETAILS</span>
                    {isRulesExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                  </button>

                  {isRulesExpanded && (
                    <div className="px-3.5 pb-3.5 space-y-2 text-xs border-t border-[var(--border-subtle)] pt-3">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Rule Policy:</span>
                        <span className="font-semibold text-[var(--text-primary)] text-right">{selectedThreat.rule_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Enforcement:</span>
                        <span className="text-[var(--operational-green)] font-semibold font-mono">AUTOMATIC DISPATCH</span>
                      </div>
                      {selectedThreat.speed && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Observed Velocity:</span>
                          <span className="font-mono font-bold text-[var(--warning-amber)]">{selectedThreat.speed.toFixed(1)} km/h</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* FIXED BOTTOM ACTION FOOTER */}
              <div className="p-4 sm:p-5 border-t border-[var(--border-subtle)] bg-[#070B12]/98 shrink-0 z-20 grid grid-cols-2 gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  onClick={() => handleAcknowledge(selectedThreat.id)}
                  disabled={selectedThreat.status !== 'ACTIVE'}
                  className="h-11 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-40"
                >
                  <CheckCircle2 className="w-4 h-4 text-[var(--operational-green)]" />
                  <span>ACKNOWLEDGE</span>
                </button>

                <button
                  onClick={() => handleResolve(selectedThreat.id)}
                  disabled={selectedThreat.status === 'RESOLVED'}
                  className="h-11 rounded-xl btn-primary-interactive text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-40 shadow-md"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>RESOLVE THREAT</span>
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

export default ThreatMonitoring;
