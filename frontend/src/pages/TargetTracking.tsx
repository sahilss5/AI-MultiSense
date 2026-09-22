import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { ThermalDetectionObject, VideoStatusResponse, SessionSummary, SessionTrack } from '../types/schema';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { SeverityIndicator } from '../components/common/SeverityIndicator';
import { TargetTrajectory3D } from '../components/3d/TargetTrajectory3D';
import { formatIST } from '../utils/date';
import { apiService } from '../services/api';
import {
  Crosshair,
  User,
  Car,
  Bird,
  Plane,
  Briefcase,
  Navigation,
  Clock,
  Search,
  X,
  ArrowUpDown,
  AlertTriangle,
  ArrowUpRight,
  Activity,
  Layers,
  CheckCircle2,
} from 'lucide-react';

interface TargetTrackingProps {
  detections?: ThermalDetectionObject[];
  isSessionActive?: boolean;
  videoStatus?: VideoStatusResponse;
  selectedTrackId?: number | null;
  onSelectTrackId?: (trackId: number | null) => void;
}

export interface TargetItem {
  track_id: number;
  trackCode: string;
  class: string;
  confidence: number;
  speed: number | null;
  direction: string;
  duration_seconds: number;
  duration_formatted: string;
  zone: string;
  status: 'TRACKING' | 'ALERT' | 'MONITORED';
  threat: boolean;
  threat_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  threat_reason?: string | null;
  bbox: [number, number, number, number];
  first_detected: string;
  last_seen: string;
  history: { time: string; text: string }[];
  posX: number;
  posY: number;
  trajectory?: [number, number][];
}

export const TargetTracking: React.FC<TargetTrackingProps> = ({
  detections = [],
  isSessionActive,
  videoStatus,
  selectedTrackId: propSelectedTrackId,
  onSelectTrackId,
}) => {
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [filterThreat, setFilterThreat] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'confidence' | 'speed' | 'threat'>('confidence');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(propSelectedTrackId ?? null);
  const [userSelected, setUserSelected] = useState<boolean>(propSelectedTrackId != null);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  const [activeTargets, setActiveTargets] = useState<TargetItem[]>([]);
  const activeTargetsMapRef = useRef<Map<number, TargetItem & { lastSeenMs: number }>>(new Map());
  const sessionTargetsHistoryRef = useRef<Map<number, TargetItem>>(new Map());

  // Session Summary state for post-video / completed session experience
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);

  const isCompletedSession = videoStatus?.status === 'completed';
  const isSurveillanceActive = isSessionActive ?? (videoStatus?.status === 'processing' || videoStatus?.status === 'paused');

  // Synchronize incoming selectedTrackId prop
  useEffect(() => {
    if (propSelectedTrackId != null) {
      setSelectedTrackId(propSelectedTrackId);
      setUserSelected(true);
    }
  }, [propSelectedTrackId]);

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch session summary when video completes
  useEffect(() => {
    if (isCompletedSession) {
      setIsLoadingSummary(true);
      apiService
        .getSessionSummary(videoStatus?.video_id || undefined)
        .then((summary) => {
          setSessionSummary(summary);
          // Auto-select first threat or first track if not selected
          if (!selectedTrackId && summary?.tracks && summary.tracks.length > 0) {
            const firstThreat = summary.tracks.find((t) => t.threat);
            const defaultTrack = firstThreat || summary.tracks[0];
            setSelectedTrackId(defaultTrack.track_id);
          }
        })
        .catch((err) => {
          console.error('Failed to load session summary for completed video:', err);
        })
        .finally(() => {
          setIsLoadingSummary(false);
        });
    } else if (videoStatus?.status === 'processing' || videoStatus?.status === 'no_video_selected') {
      setSessionSummary(null);
    }
  }, [isCompletedSession, videoStatus?.video_id, videoStatus?.status]);

  // Load recorded session threats from backend so past threats remain inspectable
  useEffect(() => {
    apiService
      .getSessionThreats()
      .then((sessionThreats) => {
        if (sessionThreats && Array.isArray(sessionThreats)) {
          sessionThreats.forEach((st: any) => {
            const tid = st.track_id || 1;
            const timeStr = st.timestamp ? formatIST(st.timestamp, { includeTimeOnly: true }) : formatIST(new Date(), { includeTimeOnly: true });
            const className = (st.class || st.object_class || 'Target').replace(/_/g, ' ');
            const durSec = st.duration_seconds || 0;
            const m = Math.floor(durSec / 60).toString().padStart(2, '0');
            const s = (durSec % 60).toString().padStart(2, '0');
            sessionTargetsHistoryRef.current.set(tid, {
              track_id: tid,
              trackCode: `T-${tid}`,
              class: className,
              confidence: st.confidence ?? 0.92,
              speed: st.speed || null,
              direction: st.direction || 'STATIONARY',
              duration_seconds: durSec,
              duration_formatted: `${m}:${s}`,
              zone: st.zone || 'N/A',
              status: 'ALERT',
              threat: true,
              threat_level: (st.threat_level as any) || 'HIGH',
              threat_reason: st.threat_reason,
              bbox: st.bbox || [0.35, 0.35, 0.65, 0.65],
              first_detected: timeStr,
              last_seen: timeStr,
              posX: 0,
              posY: 0,
              history: [{ time: timeStr, text: st.threat_reason || 'Threat detected by Threat Engine' }],
              trajectory: st.trajectory || [],
            });
          });
        }
      })
      .catch((err) => {
        console.warn('Failed to load session threats for target tracking:', err);
      });

    apiService
      .getAlertHistory({ video_id: videoStatus?.video_id || undefined, limit: 50 })
      .then((alerts) => {
        if (alerts && Array.isArray(alerts)) {
          alerts.forEach((a) => {
            const tid = a.track_id != null && a.track_id > 0 ? a.track_id : null;
            if (!tid) return;
            if (!sessionTargetsHistoryRef.current.has(tid)) {
              const timeStr = formatIST(a.timestamp, { includeTimeOnly: true });
              const className = (a.object_class || 'Target').replace(/_/g, ' ');
              sessionTargetsHistoryRef.current.set(tid, {
                track_id: tid,
                trackCode: `T-${tid}`,
                class: className,
                confidence: a.confidence ?? 0.92,
                speed: a.speed || null,
                direction: 'STATIONARY',
                duration_seconds: 15,
                duration_formatted: '00:15',
                zone: a.zone || 'N/A',
                status: 'ALERT',
                threat: true,
                threat_level: (a.severity as any) || 'HIGH',
                threat_reason: a.reason,
                bbox: [0.35, 0.35, 0.65, 0.65],
                first_detected: timeStr,
                last_seen: timeStr,
                posX: 0,
                posY: 0,
                history: [{ time: timeStr, text: a.reason }],
                trajectory: [],
              });
            }
          });
        }
      })
      .catch((err) => {
        console.warn('Failed to load alert history for target tracking:', err);
      });
  }, [videoStatus?.video_id, videoStatus?.status]);

  // Synchronize live ByteTrack detections into active targets map
  useEffect(() => {
    if (!isSurveillanceActive) {
      activeTargetsMapRef.current.clear();
      setActiveTargets([]);
      return;
    }

    const now = Date.now();
    const map = activeTargetsMapRef.current;
    const timeStr = formatIST(new Date(), { includeTimeOnly: true });

    if (detections && detections.length > 0) {
      detections.forEach((d) => {
        const tid = d.track_id != null && d.track_id > 0 ? d.track_id : null;
        if (!tid) return;
        const cx = (d.bbox[0] + d.bbox[2]) / 2;
        const cy = (d.bbox[1] + d.bbox[3]) / 2;
        const normX = Math.max(-0.9, Math.min(0.9, (cx - 0.5) * 1.6));
        const normY = Math.max(-0.9, Math.min(0.9, (cy - 0.5) * 1.6));

        const durSec = d.duration_seconds || 0;
        const m = Math.floor(durSec / 60).toString().padStart(2, '0');
        const s = (durSec % 60).toString().padStart(2, '0');

        const className = (d.class || 'Person').replace(/_/g, ' ');
        const isThreat = !!d.threat;
        const threatLevel = d.threat_level || (isThreat ? 'HIGH' : 'LOW');
        const threatReason = d.threat_reason || (isThreat ? 'Unauthorized target detected' : null);

        const existing = map.get(tid);
        if (existing) {
          existing.confidence = d.confidence ?? existing.confidence;
          existing.class = className;
          existing.bbox = d.bbox;
          existing.posX = normX;
          existing.posY = normY;
          existing.status = isThreat ? 'ALERT' : 'TRACKING';
          existing.threat = isThreat;
          existing.threat_level = threatLevel;
          existing.threat_reason = threatReason;
          if (d.zone) existing.zone = d.zone;
          existing.speed = d.speed && d.speed > 0 ? (d.speed > 20 ? d.speed : d.speed * 3.6) : null;
          existing.direction = d.direction || 'N/A';
          existing.duration_seconds = durSec || existing.duration_seconds;
          existing.duration_formatted = `${m}:${s}`;
          existing.last_seen = timeStr;
          existing.lastSeenMs = now;
          if (d.trajectory && d.trajectory.length > 0) {
            existing.trajectory = d.trajectory;
          }

          if (isThreat && (!existing.history.length || existing.history[0]?.text !== threatReason)) {
            existing.history = [
              { time: timeStr, text: threatReason || 'Threat detected by Threat Engine' },
              ...existing.history.slice(0, 19),
            ];
          }
          sessionTargetsHistoryRef.current.set(tid, existing);
        } else {
          const newItem: TargetItem & { lastSeenMs: number } = {
            track_id: tid,
            trackCode: `T-${tid}`,
            class: className,
            confidence: d.confidence ?? 0.92,
            speed: d.speed && d.speed > 0 ? (d.speed > 20 ? d.speed : d.speed * 3.6) : null,
            direction: d.direction || 'N/A',
            duration_seconds: durSec,
            duration_formatted: `${m}:${s}`,
            zone: d.zone || 'N/A',
            status: isThreat ? 'ALERT' : 'TRACKING',
            threat: isThreat,
            threat_level: threatLevel,
            threat_reason: threatReason,
            bbox: d.bbox,
            first_detected: timeStr,
            last_seen: timeStr,
            posX: normX,
            posY: normY,
            lastSeenMs: now,
            trajectory: d.trajectory || [[cx, cy]],
            history: [
              {
                time: timeStr,
                text: isThreat
                  ? (threatReason || 'Threat detected by Threat Engine')
                  : `Active ByteTrack tracking acquired${d.zone ? ` in ${d.zone}` : ''}`,
              },
            ],
          };
          map.set(tid, newItem);
          sessionTargetsHistoryRef.current.set(tid, newItem);
        }
      });
    }

    // Prune tracks expired beyond ByteTrack expiration window (2.5s)
    const EXPIRATION_MS = 2500;
    for (const [tid, item] of map.entries()) {
      if (now - item.lastSeenMs > EXPIRATION_MS) {
        map.delete(tid);
      }
    }

    setActiveTargets(Array.from(map.values()));
  }, [detections, isSurveillanceActive]);

  // Periodic expiration cleanup timer when surveillance is active
  useEffect(() => {
    if (!isSurveillanceActive) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const map = activeTargetsMapRef.current;
      let hasDeletions = false;
      const EXPIRATION_MS = 2500;
      for (const [tid, item] of map.entries()) {
        if (now - item.lastSeenMs > EXPIRATION_MS) {
          map.delete(tid);
          hasDeletions = true;
        }
      }
      if (hasDeletions) {
        setActiveTargets(Array.from(map.values()));
      }
    }, 400);
    return () => clearInterval(interval);
  }, [isSurveillanceActive]);

  // Live Class Counts for Top Summary Cards from REAL active tracking data
  const countTotal = activeTargets.length;
  const countPerson = activeTargets.filter((t) => t.class.toUpperCase() === 'PERSON').length;
  const countVehicle = activeTargets.filter((t) => t.class.toUpperCase() === 'VEHICLE').length;
  const countAnimal = activeTargets.filter((t) => t.class.toUpperCase() === 'ANIMAL').length;
  const countDrone = activeTargets.filter((t) => t.class.toUpperCase() === 'DRONE').length;
  const countBag = activeTargets.filter((t) => t.class.toUpperCase().includes('BAG')).length;

  // Filter & Search Logic for Live Targets
  const filteredLiveTargets = useMemo(() => {
    return activeTargets
      .filter((t) => {
        // Class filter
        if (filterClass !== 'ALL') {
          const normFilter = filterClass.toUpperCase().replace(/\s+/g, '_');
          const normClass = t.class.toUpperCase().replace(/\s+/g, '_');
          if (normFilter !== normClass) return false;
        }

        // Threat filter
        if (filterThreat === 'THREAT_ONLY' && !t.threat) return false;
        if (filterThreat === 'NORMAL_ONLY' && t.threat) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchId = `t-${t.track_id}`.includes(q) || t.track_id.toString().includes(q);
          const matchClass = t.class.toLowerCase().includes(q);
          const matchZone = t.zone.toLowerCase().includes(q);
          if (!matchId && !matchClass && !matchZone) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === 'confidence') diff = b.confidence - a.confidence;
        else if (sortBy === 'speed') diff = (b.speed || 0) - (a.speed || 0);
        else if (sortBy === 'threat') {
          const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          diff = (rank[b.threat_level] || 1) - (rank[a.threat_level] || 1);
        }
        return sortAsc ? -diff : diff;
      });
  }, [activeTargets, filterClass, filterThreat, searchQuery, sortBy, sortAsc]);

  // Filter & Search Logic for Completed Session Tracks
  const sessionTracks = useMemo(() => {
    return sessionSummary?.tracks || [];
  }, [sessionSummary]);

  const filteredSessionTracks = useMemo(() => {
    if (!sessionTracks.length) return [];
    return sessionTracks
      .filter((t) => {
        // Class filter
        if (filterClass !== 'ALL') {
          const normFilter = filterClass.toUpperCase().replace(/\s+/g, '_');
          const normClass = t.class_name.toUpperCase().replace(/\s+/g, '_');
          if (normFilter !== normClass) return false;
        }

        // Threat filter
        if (filterThreat === 'THREAT_ONLY' && !t.threat) return false;
        if (filterThreat === 'NORMAL_ONLY' && t.threat) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchId = `t-${t.track_id}`.includes(q) || t.track_id.toString().includes(q);
          const matchClass = t.class_name.toLowerCase().includes(q);
          const matchZone = (t.zone || '').toLowerCase().includes(q);
          if (!matchId && !matchClass && !matchZone) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === 'confidence') diff = b.average_confidence - a.average_confidence;
        else if (sortBy === 'speed') diff = (b.speed || 0) - (a.speed || 0);
        else if (sortBy === 'threat') {
          const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          diff = (rank[b.threat_level] || 1) - (rank[a.threat_level] || 1);
        }
        return sortAsc ? -diff : diff;
      });
  }, [sessionTracks, filterClass, filterThreat, searchQuery, sortBy, sortAsc]);

  // Selected Session Track in Completed mode
  const selectedSessionTrack = useMemo<SessionTrack | null>(() => {
    if (!sessionTracks.length) return null;
    const effectiveTid = selectedTrackId ?? propSelectedTrackId;
    if (effectiveTid != null) {
      const match = sessionTracks.find((t) => t.track_id === effectiveTid);
      if (match) return match;
    }
    return filteredSessionTracks[0] || sessionTracks.find((t) => t.threat) || sessionTracks[0] || null;
  }, [sessionTracks, filteredSessionTracks, selectedTrackId, propSelectedTrackId]);

  // Selected Target in Live mode
  const selectedLiveTarget = useMemo(() => {
    const effectiveTid = selectedTrackId ?? propSelectedTrackId;
    if (effectiveTid != null) {
      const activeFound = activeTargets.find((t) => t.track_id === effectiveTid);
      if (activeFound) return activeFound;
      const historyFound = sessionTargetsHistoryRef.current.get(effectiveTid);
      if (historyFound) return historyFound;
    }
    if (activeTargets.length > 0) {
      return filteredLiveTargets[0] || activeTargets[0] || null;
    }
    if (effectiveTid != null) {
      return sessionTargetsHistoryRef.current.get(effectiveTid) || null;
    }
    return null;
  }, [activeTargets, filteredLiveTargets, selectedTrackId, propSelectedTrackId]);

  const isTargetActive = useMemo(() => {
    if (!selectedLiveTarget) return false;
    return activeTargets.some((t) => t.track_id === selectedLiveTarget.track_id);
  }, [activeTargets, selectedLiveTarget]);

  // Target object formatted for TargetTrajectory3D
  const trajectoryTargetFor3D = useMemo(() => {
    if (isCompletedSession && selectedSessionTrack) {
      const realTrajectory: [number, number][] =
        selectedSessionTrack.trajectory && selectedSessionTrack.trajectory.length > 0
          ? selectedSessionTrack.trajectory
          : selectedSessionTrack.movement_points && selectedSessionTrack.movement_points.length > 0
          ? selectedSessionTrack.movement_points.map((p) => [p.x, p.y] as [number, number])
          : selectedSessionTrack.last_position
          ? [[selectedSessionTrack.last_position.x, selectedSessionTrack.last_position.y]]
          : [];

      return {
        track_id: selectedSessionTrack.track_id,
        class: selectedSessionTrack.class_name,
        confidence: selectedSessionTrack.average_confidence,
        speed: selectedSessionTrack.speed,
        direction: selectedSessionTrack.direction || 'STATIONARY',
        threat: selectedSessionTrack.threat,
        threat_level: selectedSessionTrack.threat_level,
        zone: selectedSessionTrack.zone || 'N/A',
        trajectory: realTrajectory,
      };
    }
    return selectedLiveTarget;
  }, [isCompletedSession, selectedSessionTrack, selectedLiveTarget]);

  const getClassIcon = (cls: string) => {
    const norm = (cls || '').toUpperCase();
    if (norm.includes('DRONE')) return <Plane className="w-3.5 h-3.5 text-[var(--intelligence-violet)]" />;
    if (norm.includes('VEHICLE')) return <Car className="w-3.5 h-3.5 text-[var(--warning-amber)]" />;
    if (norm.includes('ANIMAL')) return <Bird className="w-3.5 h-3.5 text-[var(--operational-green)]" />;
    if (norm.includes('BAG')) return <Briefcase className="w-3.5 h-3.5 text-[var(--threat-coral)]" />;
    return <User className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />;
  };

  const handleSelectTrack = (trackId: number) => {
    setSelectedTrackId(trackId);
    setUserSelected(true);
    onSelectTrackId?.(trackId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="page-container space-y-5 select-none font-sans w-full max-w-full min-w-0"
    >
      {/* ======================================================== */}
      {/* 1. PAGE HEADER                                           */}
      {/* ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)] w-full max-w-full">
        <div className="min-w-0">
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-wider text-[var(--text-primary)] font-sans uppercase flex items-center gap-2.5 truncate">
              <Crosshair className="w-5 h-5 text-[var(--thermal-cyan)] shrink-0" />
              TARGET TRACKING
            </h1>

            {/* Tracking Status Badge */}
            {isCompletedSession ? (
              <div className="flex items-center space-x-2 bg-[#081814] px-3.5 py-1 rounded-full border border-emerald-500/30 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]" />
                <span className="font-semibold tracking-wide text-[var(--operational-green)]">
                  SESSION COMPLETE
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 bg-[#08121E] px-3.5 py-1 rounded-full border border-[var(--border-subtle)] text-xs font-mono">
                <span
                  className={`w-2 h-2 rounded-full ${
                    countTotal > 0
                      ? 'bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]'
                      : 'bg-[var(--text-muted)]'
                  }`}
                />
                <span
                  className={`font-semibold tracking-wide ${
                    countTotal > 0 ? 'text-[var(--operational-green)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {countTotal > 0 ? 'TRACKING ACTIVE' : 'IDLE / WAITING'}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            {isCompletedSession
              ? 'Completed video session track history & forensic movement trajectory'
              : 'Real-time object tracking and target movement visualization'}
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
          {/* Tracks Count Badge */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3.5 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--thermal-cyan)]">
            <span className="text-[var(--text-muted)]">
              {isCompletedSession ? 'RECORDED TRACKS:' : 'ACTIVE TRACKS:'}
            </span>
            <span className="font-bold">
              {isCompletedSession ? (sessionSummary?.unique_tracks ?? 0) : countTotal}
            </span>
          </div>

          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. TOP METRICS GRIDS                                     */}
      {/* ======================================================== */}
      {isCompletedSession ? (
        /* --- SESSION COMPLETE SUMMARY VIEW --- */
        <div className="space-y-4">
          {/* A. 7-Card Session Summary Metrics Grid */}
          <div className="space-y-2">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
              <span>SESSION SUMMARY</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 w-full max-w-full min-w-0">
              {/* 1. Total Detections */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">TOTAL DETECTIONS</div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono text-[var(--thermal-cyan)]">
                  {sessionSummary?.total_detections ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">Frame-level Detections</div>
              </Card>

              {/* 2. Unique Tracks */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">UNIQUE TRACKS</div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono text-[var(--text-primary)]">
                  {sessionSummary?.unique_tracks ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">ByteTrack IDs</div>
              </Card>

              {/* 3. Threats */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
                  <span>THREATS</span>
                  <AlertTriangle className="w-3 h-3 text-[var(--threat-coral)]" />
                </div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono text-[var(--threat-coral)]">
                  {sessionSummary?.total_threats ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">Threat Incidents</div>
              </Card>

              {/* 4. High Threats */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">HIGH THREATS</div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono text-[var(--threat-coral)]">
                  {sessionSummary?.high_threats ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">High Severity</div>
              </Card>

              {/* 5. Frames Processed */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">FRAMES</div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono text-[var(--operational-green)]">
                  {sessionSummary?.frames_processed ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">
                  / {sessionSummary?.total_video_frames ?? sessionSummary?.frames_processed ?? 0} (100%)
                </div>
              </Card>

              {/* 6. Average Confidence */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">AVG CONFIDENCE</div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono text-[var(--operational-green)]">
                  {sessionSummary ? `${(sessionSummary.average_confidence * 100).toFixed(1)}%` : '0.0%'}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">YOLO11n Mean</div>
              </Card>

              {/* 7. Video Duration */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">DURATION</div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono text-[var(--intelligence-violet)]">
                  {sessionSummary ? `${sessionSummary.video_duration.toFixed(1)}s` : '0.0s'}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">Analyzed Runtime</div>
              </Card>
            </div>
          </div>

          {/* B. 5-Card Dynamic Class Summary Cards */}
          <div className="space-y-2">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
              <span>DYNAMIC CLASS SUMMARY (UNIQUE TRACKS)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full max-w-full min-w-0">
              {/* PERSON */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
                  <span>PERSON</span>
                  <User className="w-3 h-3 text-[var(--thermal-cyan)]" />
                </div>
                <div className="text-2xl font-extrabold font-mono text-[var(--thermal-cyan)]">
                  {sessionSummary?.class_counts?.Person ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">Unique Tracks</div>
              </Card>

              {/* VEHICLE */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
                  <span>VEHICLE</span>
                  <Car className="w-3 h-3 text-[var(--warning-amber)]" />
                </div>
                <div className="text-2xl font-extrabold font-mono text-[var(--warning-amber)]">
                  {sessionSummary?.class_counts?.Vehicle ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">Unique Tracks</div>
              </Card>

              {/* ANIMAL */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
                  <span>ANIMAL</span>
                  <Bird className="w-3 h-3 text-[var(--operational-green)]" />
                </div>
                <div className="text-2xl font-extrabold font-mono text-[var(--operational-green)]">
                  {sessionSummary?.class_counts?.Animal ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">Unique Tracks</div>
              </Card>

              {/* DRONE */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
                  <span>DRONE</span>
                  <Plane className="w-3 h-3 text-[var(--intelligence-violet)]" />
                </div>
                <div className="text-2xl font-extrabold font-mono text-[var(--intelligence-violet)]">
                  {sessionSummary?.class_counts?.Drone ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">Unique Tracks</div>
              </Card>

              {/* PERSON WITH BAG */}
              <Card hoverEffect className="p-3 space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
                  <span>PERSON WITH BAG</span>
                  <Briefcase className="w-3 h-3 text-[var(--threat-coral)]" />
                </div>
                <div className="text-2xl font-extrabold font-mono text-[var(--threat-coral)]">
                  {sessionSummary?.class_counts?.['Person With Bag'] ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-sans">Unique Tracks</div>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        /* --- LIVE SURVEILLANCE SUMMARY VIEW --- */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 w-full max-w-full min-w-0">
          {/* ACTIVE TRACKS */}
          <Card hoverEffect className="p-3 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">ACTIVE TRACKS</div>
            <div className="text-2xl font-extrabold font-mono text-[var(--text-primary)]">{countTotal}</div>
            <div className="text-[10px] text-[var(--thermal-cyan)] font-sans">ByteTrack</div>
          </Card>

          {/* PERSON */}
          <Card hoverEffect className="p-3 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
              <span>PERSON</span>
              <User className="w-3 h-3 text-[var(--thermal-cyan)]" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-[var(--thermal-cyan)]">{countPerson}</div>
            <div className="text-[10px] text-[var(--text-secondary)] font-sans">Tracked</div>
          </Card>

          {/* VEHICLE */}
          <Card hoverEffect className="p-3 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
              <span>VEHICLE</span>
              <Car className="w-3 h-3 text-[var(--warning-amber)]" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-[var(--warning-amber)]">{countVehicle}</div>
            <div className="text-[10px] text-[var(--text-secondary)] font-sans">Tracked</div>
          </Card>

          {/* ANIMAL */}
          <Card hoverEffect className="p-3 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
              <span>ANIMAL</span>
              <Bird className="w-3 h-3 text-[var(--operational-green)]" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-[var(--operational-green)]">{countAnimal}</div>
            <div className="text-[10px] text-[var(--text-secondary)] font-sans">Tracked</div>
          </Card>

          {/* DRONE */}
          <Card hoverEffect className="p-3 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
              <span>DRONE</span>
              <Plane className="w-3 h-3 text-[var(--intelligence-violet)]" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-[var(--intelligence-violet)]">{countDrone}</div>
            <div className="text-[10px] text-[var(--text-secondary)] font-sans">Tracked</div>
          </Card>

          {/* PERSON WITH BAG */}
          <Card hoverEffect className="p-3 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
              <span>PERSON WITH BAG</span>
              <Briefcase className="w-3 h-3 text-[var(--threat-coral)]" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-[var(--threat-coral)]">{countBag}</div>
            <div className="text-[10px] text-[var(--text-secondary)] font-sans">Tracked</div>
          </Card>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. SEARCH & FILTER BAR                                   */}
      {/* ======================================================== */}
      <Card className="p-3.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
          {/* Search Box */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] flex-1 min-w-[220px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              placeholder="Search by Track ID, Class or Zone"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none font-sans"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[var(--text-muted)] hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter & Sort Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Object Class Filter */}
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="ALL">All Classes</option>
              <option value="PERSON">Person</option>
              <option value="VEHICLE">Vehicle</option>
              <option value="ANIMAL">Animal</option>
              <option value="DRONE">Drone</option>
              <option value="PERSON_WITH_BAG">Person With Bag</option>
            </select>

            {/* Threat Level Filter */}
            <select
              value={filterThreat}
              onChange={(e) => setFilterThreat(e.target.value)}
              className="bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="ALL">All Threat Levels</option>
              <option value="THREAT_ONLY">Threats Only</option>
              <option value="NORMAL_ONLY">Normal Only</option>
            </select>

            {/* Sort Control */}
            <div className="flex items-center space-x-1.5 bg-[var(--bg-surface-secondary)] px-2.5 py-1 rounded-xl border border-[var(--border-subtle)]">
              <span className="text-[11px] text-[var(--text-muted)]">Sort:</span>
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer"
              >
                <option value="confidence">Sort by Confidence</option>
                <option value="speed">Sort by Estimated Speed</option>
                <option value="threat">Sort by Threat Level</option>
              </select>
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className="p-1 rounded hover:bg-white/[0.05] text-[var(--thermal-cyan)] cursor-pointer"
                title={sortAsc ? 'Ascending' : 'Descending'}
              >
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 4. MAIN WORKSPACE: DIRECTORY (65%) / INSPECTOR (35%)    */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-full min-w-0 items-start">
        {/* LEFT COLUMN: TARGET DIRECTORY / SESSION HISTORY (8 Cols) */}
        <div className="lg:col-span-8 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-4 space-y-3 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center space-x-2 min-w-0">
                <Crosshair className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  {isCompletedSession
                    ? `SESSION TRACK HISTORY (${sessionSummary?.unique_tracks ?? 0} TRACKS RECORDED)`
                    : `ACTIVE TARGET DIRECTORY (${countTotal})`}
                </h3>
              </div>
              <div className="flex items-center space-x-1.5 text-[10px] font-mono">
                {isCompletedSession ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--operational-green)]" />
                    <span className="text-[var(--operational-green)] font-semibold">
                      COMPLETE · {sessionSummary?.unique_tracks ?? 0} TRACKS STORED
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        countTotal > 0 ? 'bg-[var(--operational-green)] pulse-live' : 'bg-[var(--text-muted)]'
                      }`}
                    />
                    <span className={countTotal > 0 ? 'text-[var(--operational-green)] font-semibold' : 'text-[var(--text-muted)]'}>
                      {countTotal > 0 ? 'LIVE TRACKS' : 'NO ACTIVE TRACKS'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="table-wrapper overflow-x-auto">
              {isCompletedSession ? (
                /* --- COMPLETED SESSION TRACKS TABLE --- */
                <table className="w-full text-left text-xs font-sans border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[10px] font-mono uppercase text-[var(--text-muted)]">
                      <th className="pb-2.5 pr-3 font-semibold">TRACK ID</th>
                      <th className="pb-2.5 pr-3 font-semibold">OBJECT</th>
                      <th className="pb-2.5 pr-3 font-semibold">DETECTIONS</th>
                      <th className="pb-2.5 pr-3 font-semibold">AVG CONF</th>
                      <th className="pb-2.5 pr-3 font-semibold">STATUS</th>
                      <th className="pb-2.5 pr-3 font-semibold">THREAT</th>
                      <th className="pb-2.5 pr-3 font-semibold">ZONE</th>
                      <th className="pb-2.5 pr-3 font-semibold">DIRECTION</th>
                      <th className="pb-2.5 pr-3 font-semibold">FIRST SEEN</th>
                      <th className="pb-2.5 pr-3 font-semibold">LAST SEEN</th>
                      <th className="pb-2.5 text-right font-semibold">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredSessionTracks.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center">
                          <div className="flex flex-col items-center justify-center space-y-1.5 font-sans">
                            <Crosshair className="w-7 h-7 text-[var(--text-muted)] opacity-30 mb-1" />
                            <div className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                              {isLoadingSummary ? 'LOADING SESSION TRACKS...' : 'NO TRACKS MATCH FILTER'}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              {isLoadingSummary ? 'Fetching recorded ByteTrack tracks...' : 'Try clearing your search or filter options.'}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredSessionTracks.map((track) => {
                        const isSelected = selectedSessionTrack?.track_id === track.track_id;
                        return (
                          <tr
                            key={track.track_id}
                            onClick={() => handleSelectTrack(track.track_id)}
                            className={`transition-all cursor-pointer group ${
                              isSelected
                                ? 'bg-[var(--thermal-cyan)]/10 font-medium'
                                : 'hover:bg-white/[0.025]'
                            }`}
                          >
                            {/* Track ID */}
                            <td className="py-3 pr-3 font-mono font-bold text-[var(--thermal-cyan)] whitespace-nowrap">
                              T-{track.track_id}
                            </td>

                            {/* Object */}
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                <span className="p-1 rounded bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)]">
                                  {getClassIcon(track.class_name)}
                                </span>
                                <span className="text-[var(--text-primary)] font-semibold">{track.class_name}</span>
                              </div>
                            </td>

                            {/* Detections */}
                            <td className="py-3 pr-3 font-mono text-[var(--text-primary)] font-bold whitespace-nowrap">
                              {track.detection_count}
                            </td>

                            {/* Confidence */}
                            <td className="py-3 pr-3 font-mono text-[var(--operational-green)] font-semibold whitespace-nowrap">
                              {(track.average_confidence * 100).toFixed(1)}%
                            </td>

                            {/* Status */}
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                COMPLETED
                              </span>
                            </td>

                            {/* Threat */}
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <Badge variant={track.threat ? 'red' : 'cyan'}>
                                {track.threat ? `THREAT · ${track.threat_level}` : 'NORMAL'}
                              </Badge>
                            </td>

                            {/* Zone */}
                            <td className="py-3 pr-3 text-[var(--text-secondary)] text-[11px] max-w-[120px] truncate">
                              {track.zone || 'N/A'}
                            </td>

                            {/* Direction */}
                            <td className="py-3 pr-3 font-mono text-[var(--text-secondary)] text-[11px] whitespace-nowrap">
                              {track.direction || 'N/A'}
                            </td>

                            {/* First Seen */}
                            <td className="py-3 pr-3 font-mono text-[var(--text-secondary)] text-[10px] whitespace-nowrap">
                              {track.first_seen ? formatIST(track.first_seen, { includeTimeOnly: true }) : 'N/A'}
                            </td>

                            {/* Last Seen */}
                            <td className="py-3 pr-3 font-mono text-[var(--text-secondary)] text-[10px] whitespace-nowrap">
                              {track.last_seen ? formatIST(track.last_seen, { includeTimeOnly: true }) : 'N/A'}
                            </td>

                            {/* Action */}
                            <td className="py-3 text-right whitespace-nowrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectTrack(track.track_id);
                                }}
                                className="px-2.5 py-1 rounded-lg btn-secondary-interactive text-[11px] font-sans text-[var(--thermal-cyan)] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>Inspect</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              ) : (
                /* --- LIVE ACTIVE TARGETS TABLE --- */
                <table className="w-full text-left text-xs font-sans border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[10px] font-mono uppercase text-[var(--text-muted)]">
                      <th className="pb-2.5 pr-3 font-semibold">TRACK ID</th>
                      <th className="pb-2.5 pr-3 font-semibold">OBJECT</th>
                      <th className="pb-2.5 pr-3 font-semibold">CONFIDENCE</th>
                      <th className="pb-2.5 pr-3 font-semibold">STATUS</th>
                      <th className="pb-2.5 pr-3 font-semibold">ZONE</th>
                      <th className="pb-2.5 pr-3 font-semibold">DIRECTION</th>
                      <th className="pb-2.5 pr-3 font-semibold">SPEED</th>
                      <th className="pb-2.5 pr-3 font-semibold">LAST SEEN</th>
                      <th className="pb-2.5 text-right font-semibold">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredLiveTargets.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center">
                          <div className="flex flex-col items-center justify-center space-y-1.5 font-sans">
                            <Crosshair className="w-7 h-7 text-[var(--text-muted)] opacity-30 mb-1" />
                            <div className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                              NO ACTIVE TRACKS
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              Start a thermal video to begin tracking.
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredLiveTargets.map((target) => {
                        const isSelected = selectedLiveTarget?.track_id === target.track_id;
                        return (
                          <tr
                            key={target.track_id}
                            onClick={() => handleSelectTrack(target.track_id)}
                            className={`transition-all cursor-pointer group ${
                              isSelected
                                ? 'bg-[var(--thermal-cyan)]/10 font-medium'
                                : 'hover:bg-white/[0.025]'
                            }`}
                          >
                            {/* Track ID */}
                            <td className="py-3 pr-3 font-mono font-bold text-[var(--thermal-cyan)] whitespace-nowrap">
                              T-{target.track_id}
                            </td>

                            {/* Object */}
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                <span className="p-1 rounded bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)]">
                                  {getClassIcon(target.class)}
                                </span>
                                <span className="text-[var(--text-primary)] font-semibold">{target.class}</span>
                              </div>
                            </td>

                            {/* Confidence */}
                            <td className="py-3 pr-3 font-mono text-[var(--operational-green)] font-semibold whitespace-nowrap">
                              {(target.confidence * 100).toFixed(1)}%
                            </td>

                            {/* Status */}
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <Badge variant={target.threat ? 'red' : 'cyan'}>
                                {target.threat ? 'THREAT' : 'NORMAL'}
                              </Badge>
                            </td>

                            {/* Zone */}
                            <td className="py-3 pr-3 text-[var(--text-secondary)] text-[11px] max-w-[130px] truncate">
                              {target.zone && target.zone !== 'N/A' ? target.zone : 'N/A'}
                            </td>

                            {/* Direction */}
                            <td className="py-3 pr-3 font-mono text-[var(--text-secondary)] text-[11px] whitespace-nowrap">
                              {target.direction && target.direction !== 'N/A' ? target.direction : 'N/A'}
                            </td>

                            {/* Speed */}
                            <td className="py-3 pr-3 font-mono text-[var(--warning-amber)] font-semibold whitespace-nowrap">
                              {target.speed && target.speed > 0 ? `${target.speed.toFixed(1)} km/h` : 'N/A'}
                            </td>

                            {/* Last Seen */}
                            <td className="py-3 pr-3 font-mono text-[var(--text-secondary)] text-[10px] whitespace-nowrap">
                              {target.last_seen || 'N/A'}
                            </td>

                            {/* Action */}
                            <td className="py-3 text-right whitespace-nowrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectTrack(target.track_id);
                                }}
                                className="px-2.5 py-1 rounded-lg btn-secondary-interactive text-[11px] font-sans text-[var(--thermal-cyan)] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>Inspect</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: TARGET INSPECTOR (4 Cols) */}
        <div className="lg:col-span-4 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-4 sm:p-5 space-y-4 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] sticky top-20">
            {/* Inspector Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-2 min-w-0">
                <Navigation className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  TARGET INSPECTOR
                </h3>
              </div>
              {isCompletedSession && selectedSessionTrack ? (
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-xs text-[var(--thermal-cyan)] bg-[var(--thermal-cyan)]/10 px-2 py-0.5 rounded-full border border-[var(--thermal-cyan)]/25">
                    T-{selectedSessionTrack.track_id} · {selectedSessionTrack.class_name.toUpperCase()}
                  </span>
                  <Badge variant={selectedSessionTrack.threat ? 'red' : 'cyan'}>
                    {selectedSessionTrack.threat ? `THREAT · ${selectedSessionTrack.threat_level}` : 'NORMAL · LOW'}
                  </Badge>
                </div>
              ) : selectedLiveTarget ? (
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-xs text-[var(--thermal-cyan)] bg-[var(--thermal-cyan)]/10 px-2 py-0.5 rounded-full border border-[var(--thermal-cyan)]/25">
                    T-{selectedLiveTarget.track_id} · {selectedLiveTarget.class.toUpperCase()}
                  </span>
                  {isTargetActive ? (
                    <Badge variant={selectedLiveTarget.threat ? 'red' : 'cyan'}>
                      {selectedLiveTarget.threat ? `THREAT · ${selectedLiveTarget.threat_level}` : 'NORMAL · LOW'}
                    </Badge>
                  ) : (
                    <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                        TRACK NO LONGER ACTIVE
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* 3D Target Trajectory Visualization */}
            <TargetTrajectory3D target={trajectoryTargetFor3D} className="w-full" />

            {/* Target Details Content */}
            {isCompletedSession && selectedSessionTrack ? (
              /* --- COMPLETED TRACK INSPECTOR --- */
              <div className="space-y-3 font-sans text-xs">
                {/* Status Badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold">
                    STATUS: COMPLETED
                  </span>
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-white/10 text-white/80 border border-white/20">
                    LAST KNOWN POSITION
                  </span>
                </div>

                {/* Structured Metrics Grid */}
                <div className="space-y-2">
                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">TRACK ID:</span>
                    <span className="font-mono font-bold text-[var(--thermal-cyan)]">
                      T-{selectedSessionTrack.track_id}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">OBJECT CLASS:</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {selectedSessionTrack.class_name}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">DETECTIONS:</span>
                    <span className="font-mono font-bold text-[var(--text-primary)]">
                      {selectedSessionTrack.detection_count} frames
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">AVG CONFIDENCE:</span>
                    <span className="font-mono font-bold text-[var(--operational-green)]">
                      {(selectedSessionTrack.average_confidence * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">CONFIDENCE RANGE:</span>
                    <span className="font-mono text-[var(--text-secondary)] text-[11px]">
                      {(selectedSessionTrack.minimum_confidence * 100).toFixed(1)}% - {(selectedSessionTrack.maximum_confidence * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">THREAT LEVEL:</span>
                    <SeverityIndicator level={selectedSessionTrack.threat_level} />
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">THREAT REASON:</span>
                    <span className="font-sans text-[var(--text-secondary)] text-[11px] truncate max-w-[180px]">
                      {selectedSessionTrack.threat_reason || (selectedSessionTrack.threat ? 'Restricted perimeter intrusion' : 'Standard tracking')}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">ZONE:</span>
                    <span className="font-sans text-[var(--text-secondary)] truncate">
                      {selectedSessionTrack.zone || 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">ESTIMATED SPEED:</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {selectedSessionTrack.speed && selectedSessionTrack.speed > 0 ? `${selectedSessionTrack.speed.toFixed(1)} km/h` : 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">DIRECTION:</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {selectedSessionTrack.direction || 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">FIRST SEEN:</span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      {selectedSessionTrack.first_seen ? formatIST(selectedSessionTrack.first_seen, { includeTimeOnly: true }) : 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">LAST KNOWN POSITION:</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {selectedSessionTrack.last_position
                        ? `X: ${selectedSessionTrack.last_position.x.toFixed(2)}, Y: ${selectedSessionTrack.last_position.y.toFixed(2)}`
                        : 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">LAST SEEN:</span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      {selectedSessionTrack.last_seen ? formatIST(selectedSessionTrack.last_seen, { includeTimeOnly: true }) : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Threat Banner if Alert */}
                {selectedSessionTrack.threat && (
                  <div className="p-3 rounded-xl bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/30 text-[var(--threat-coral)] text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>THREAT INCIDENT RECORDED</span>
                    </div>
                    <p className="text-[11px] text-[var(--threat-coral)] leading-relaxed">
                      {selectedSessionTrack.threat_reason || 'Target triggered automated threat detection.'}
                    </p>
                  </div>
                )}

                {/* Track History Audit Timeline */}
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider flex justify-between">
                    <span>TRACK HISTORY AUDIT</span>
                    <span className="text-[var(--thermal-cyan)]">BYTE TRACK RECORD</span>
                  </div>

                  <div data-lenis-prevent className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] space-y-0.5 text-xs font-sans">
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">
                        {selectedSessionTrack.first_seen ? formatIST(selectedSessionTrack.first_seen, { includeTimeOnly: true }) : 'SESSION START'}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        Track T-{selectedSessionTrack.track_id} initialized by ByteTrack tracker
                      </div>
                    </div>
                    <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] space-y-0.5 text-xs font-sans">
                      <div className="text-[10px] font-mono text-[var(--thermal-cyan)]">
                        RECORDED ACROSS {selectedSessionTrack.detection_count} FRAMES
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        Real ByteTrack points: {selectedSessionTrack.movement_points?.length || 1} movement vectors recorded
                      </div>
                    </div>
                    {selectedSessionTrack.threat && (
                      <div className="p-2 bg-[var(--threat-coral)]/10 rounded-lg border border-[var(--threat-coral)]/20 space-y-0.5 text-xs font-sans">
                        <div className="text-[10px] font-mono text-[var(--threat-coral)]">
                          THREAT ENGINE TRIGGERED
                        </div>
                        <div className="text-[11px] text-[var(--threat-coral)]">
                          {selectedSessionTrack.threat_reason || 'Perimeter intrusion violation'}
                        </div>
                      </div>
                    )}
                    <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] space-y-0.5 text-xs font-sans">
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">
                        {selectedSessionTrack.last_seen ? formatIST(selectedSessionTrack.last_seen, { includeTimeOnly: true }) : 'SESSION END'}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        Last known position recorded at {selectedSessionTrack.last_position ? `X: ${selectedSessionTrack.last_position.x.toFixed(2)}, Y: ${selectedSessionTrack.last_position.y.toFixed(2)}` : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedLiveTarget ? (
              /* --- LIVE TARGET INSPECTOR --- */
              <div className="space-y-3 font-sans text-xs">
                {/* Structured Metrics Grid */}
                <div className="space-y-2">
                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">TRACK ID:</span>
                    <span className="font-mono font-bold text-[var(--thermal-cyan)]">
                      T-{selectedLiveTarget.track_id}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">OBJECT CLASS:</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {selectedLiveTarget.class}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">AI CONFIDENCE:</span>
                    <span className="font-mono font-bold text-[var(--operational-green)]">
                      {(selectedLiveTarget.confidence * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">STATUS:</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {isTargetActive ? 'ACTIVE' : (selectedLiveTarget.threat ? 'RECORDED THREAT / TRACK NO LONGER ACTIVE' : 'TRACK NO LONGER ACTIVE')}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">THREAT LEVEL:</span>
                    <SeverityIndicator level={selectedLiveTarget.threat_level} />
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">THREAT REASON:</span>
                    <span className="font-sans text-[var(--text-secondary)] text-[11px] truncate max-w-[180px]">
                      {selectedLiveTarget.threat_reason || (selectedLiveTarget.threat ? 'Restricted perimeter boundary alert' : 'Routine thermal tracking')}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">ZONE:</span>
                    <span className="font-sans text-[var(--text-secondary)] truncate">
                      {selectedLiveTarget.zone && selectedLiveTarget.zone !== 'N/A' ? selectedLiveTarget.zone : 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">ESTIMATED SPEED:</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {selectedLiveTarget.speed && selectedLiveTarget.speed > 0 ? `${selectedLiveTarget.speed.toFixed(1)} km/h` : 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">DIRECTION:</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {selectedLiveTarget.direction && selectedLiveTarget.direction !== 'N/A' ? selectedLiveTarget.direction : 'N/A'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">LAST SEEN:</span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      {selectedLiveTarget.last_seen || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Threat Banner if Alert Active */}
                {selectedLiveTarget.threat && (
                  <div className="p-3 rounded-xl bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/30 text-[var(--threat-coral)] text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>THREAT ALERT</span>
                    </div>
                    <p className="text-[11px] text-[var(--threat-coral)] leading-relaxed">
                      {selectedLiveTarget.threat_reason || 'Target breached restricted perimeter boundary.'}
                    </p>
                  </div>
                )}

                {/* Track History Audit Timeline */}
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider flex justify-between">
                    <span>TRACK HISTORY AUDIT</span>
                    <span className="text-[var(--thermal-cyan)]">BYTE TRACK SYNC</span>
                  </div>

                  <div data-lenis-prevent className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {selectedLiveTarget.history.map((h, i) => (
                      <div
                        key={i}
                        className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] space-y-0.5 text-xs font-sans"
                      >
                        <div className="text-[10px] font-mono text-[var(--text-muted)]">{h.time}</div>
                        <div className="text-[11px] text-[var(--text-secondary)]">{h.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : userSelected && selectedTrackId != null ? (
              <div className="text-center py-10 px-4 font-sans space-y-1.5 border border-dashed border-[var(--threat-coral)]/30 rounded-xl bg-[var(--threat-coral)]/5">
                <Navigation className="w-7 h-7 text-[var(--threat-coral)] mx-auto opacity-70 mb-1" />
                <div className="text-xs font-bold font-mono text-[var(--threat-coral)] uppercase tracking-wider">
                  TRACK T-{selectedTrackId} NO LONGER ACTIVE
                </div>
                <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                  Target has exited the frame or track has expired. Select another active track to inspect.
                </p>
              </div>
            ) : (
              <div className="text-center py-10 px-4 font-sans space-y-1.5 border border-dashed border-[var(--border-subtle)] rounded-xl bg-black/20">
                <Navigation className="w-7 h-7 text-[var(--text-muted)] mx-auto opacity-30 mb-1" />
                <div className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                  SELECT A TARGET
                </div>
                <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                  Choose an active track to inspect.
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </motion.div>
  );
};

export default TargetTracking;
