import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThreatLevel, ThermalDetectionObject, VideoStatusResponse, Zone } from '../types/schema';
import { apiService } from '../services/api';
import { Card } from '../components/common/Card';
import { SeverityIndicator } from '../components/common/SeverityIndicator';
import { formatIST } from '../utils/date';
import { TargetTrajectory3D } from '../components/3d/TargetTrajectory3D';
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
  Map as MapIcon,
  AlertTriangle,
  Crosshair,
  ArrowUpRight,
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
  direction?: string;
  bbox?: [number, number, number, number];
  confidence: number | null;
  timestamp: string;
  duration_seconds: number;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  resolved_at?: string;
  posX: number; // -1 to 1 for tactical map
  posY: number; // -1 to 1 for tactical map
  timeline: { time: string; text: string }[];
  trajectory?: [number, number][];
}

interface ThreatMonitoringProps {
  detections?: ThermalDetectionObject[];
  zones?: Zone[];
  videoStatus?: VideoStatusResponse;
  sessionStartTime?: number | null;
  isSessionActive?: boolean;
  selectedTrackId?: number | null;
  onSelectTrackId?: (trackId: number | null) => void;
  onNavigate?: (page: any) => void;
}

export interface ActiveMapTarget {
  track_id: number;
  trackCode: string;
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
  posX: number;
  posY: number;
  threat: boolean;
  threat_level: ThreatLevel;
  threat_reason: string | null;
  zone: string | null;
  speed?: number | null;
  direction?: string | null;
  timestamp: string;
  lastSeenMs: number;
}

export const ThreatMonitoring: React.FC<ThreatMonitoringProps> = ({
  detections = [],
  zones: propZones,
  videoStatus,
  sessionStartTime = null,
  isSessionActive: isSessionActiveProp,
  selectedTrackId,
  onSelectTrackId,
  onNavigate,
}) => {
  const [zones, setZones] = useState<Zone[]>(propZones || []);
  const [threats, setThreats] = useState<ThreatItem[]>([]);
  const seenThreatsRef = useRef<Map<string, ThreatItem>>(new window.Map());

  const activeTargetsMapRef = useRef<Map<number, ActiveMapTarget>>(new window.Map());
  const [activeTargets, setActiveTargets] = useState<ActiveMapTarget[]>([]);

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
  const isSurveillanceActive =
    isSessionActiveProp ??
    (videoStatus?.status === 'processing' || videoStatus?.status === 'paused');
  const isSessionActive = isSurveillanceActive;

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Synchronize incoming selectedTrackId prop if provided
  useEffect(() => {
    if (selectedTrackId != null && threats.length > 0) {
      const match = threats.find((t) => t.track_id === selectedTrackId);
      if (match) {
        setSelectedThreatId(match.id);
      }
    }
  }, [selectedTrackId, threats]);

  // When active surveillance ends, is idle, or video completes, clear active map targets immediately
  useEffect(() => {
    if (!isSessionActive || videoStatus?.status === 'completed' || videoStatus?.status === 'stopped') {
      activeTargetsMapRef.current.clear();
      setActiveTargets([]);
      // Do NOT clear threats or drawer here! Recorded threat events remain visible in Threat Monitoring.
    }
  }, [isSessionActive, videoStatus?.status]);

  const currentVideoId = videoStatus?.video_id || null;
  const prevVideoIdRef = useRef<string | null>(null);
  const trackTrajectoryMapRef = useRef<Map<number, [number, number][]>>(new Map());

  // Clear threat events and trajectories only when video changes or session is cleared
  useEffect(() => {
    if (videoStatus?.status === 'no_video_selected') {
      prevVideoIdRef.current = null;
      seenThreatsRef.current.clear();
      trackTrajectoryMapRef.current.clear();
      setThreats([]);
      setSelectedThreatId(null);
      setIsDrawerOpen(false);
      return;
    }

    if (currentVideoId && currentVideoId !== prevVideoIdRef.current) {
      prevVideoIdRef.current = currentVideoId;
      seenThreatsRef.current.clear();
      trackTrajectoryMapRef.current.clear();
      setThreats([]);
      setSelectedThreatId(null);
      setIsDrawerOpen(false);
    }
  }, [currentVideoId, videoStatus?.status]);

  // Synchronize live ByteTrack detections into active targets map (2500ms sliding buffer)
  useEffect(() => {
    if (!isSessionActive || videoStatus?.status === 'completed' || videoStatus?.status === 'stopped') {
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

        const rawClass = d.class || (d as any).class_name || 'Target';
        const className = rawClass.replace(/_/g, ' ');
        const isThreat = Boolean(d.threat);
        const threatLevel = (d.threat_level as ThreatLevel) || (isThreat ? 'HIGH' : 'LOW');
        const threatReason = d.threat_reason || (isThreat ? 'Unauthorized target detected' : null);

        const existing = map.get(tid);
        if (existing) {
          existing.confidence = d.confidence ?? existing.confidence;
          existing.class = className;
          existing.bbox = d.bbox;
          existing.posX = normX;
          existing.posY = normY;
          existing.threat = isThreat;
          existing.threat_level = threatLevel;
          existing.threat_reason = threatReason;
          if (d.zone) existing.zone = d.zone;
          if (d.speed != null) existing.speed = d.speed;
          if (d.direction) existing.direction = d.direction;
          existing.timestamp = timeStr;
          existing.lastSeenMs = now;
        } else {
          map.set(tid, {
            track_id: tid,
            trackCode: `T-${tid}`,
            class: className,
            confidence: d.confidence ?? 0.92,
            bbox: d.bbox,
            posX: normX,
            posY: normY,
            threat: isThreat,
            threat_level: threatLevel,
            threat_reason: threatReason,
            zone: d.zone || null,
            speed: d.speed,
            direction: d.direction,
            timestamp: timeStr,
            lastSeenMs: now,
          });
        }
      });
    }

    // Prune tracks expired beyond ByteTrack sliding window (2500ms)
    const EXPIRATION_MS = 2500;
    for (const [tid, item] of map.entries()) {
      if (now - item.lastSeenMs > EXPIRATION_MS) {
        map.delete(tid);
      }
    }

    setActiveTargets(Array.from(map.values()));
  }, [detections, isSessionActive]);

  // Periodic expiration cleanup timer when surveillance is active (400ms)
  useEffect(() => {
    if (!isSessionActive || videoStatus?.status === 'completed' || videoStatus?.status === 'stopped') return;
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
  }, [isSessionActive]);

  // Sync real-time detections generated during the active session into Threat Queue
  useEffect(() => {
    let hasUpdates = false;
    const currentMap = seenThreatsRef.current;

    if (detections && detections.length > 0) {
      detections.forEach((d) => {
        const trackId = d.track_id != null && d.track_id > 0 ? d.track_id : null;
        if (!trackId) return;
        const cx = (d.bbox[0] + d.bbox[2]) / 2;
        const cy = (d.bbox[1] + d.bbox[3]) / 2;

        // Record real ByteTrack trajectory points
        if (d.trajectory && d.trajectory.length > 0) {
          trackTrajectoryMapRef.current.set(trackId, d.trajectory);
        } else {
          const traj = trackTrajectoryMapRef.current.get(trackId) || [];
          const last = traj[traj.length - 1];
          if (!last || Math.hypot(last[0] - cx, last[1] - cy) >= 0.003) {
            const updated = [...traj, [cx, cy] as [number, number]].slice(-100);
            trackTrajectoryMapRef.current.set(trackId, updated);
          }
        }

        if (d.threat) {
          const key = `trk-${trackId}`;
          const normX = Math.max(-0.9, Math.min(0.9, (cx - 0.5) * 1.6));
          const normY = Math.max(-0.9, Math.min(0.9, (cy - 0.5) * 1.6));
          const timeStr = formatIST(new Date(), { includeTimeOnly: true });
          const rawClass = d.class || (d as any).class_name || 'Target';
          const className = rawClass.replace(/_/g, ' ');

          const fullTraj = d.trajectory && d.trajectory.length > 0
            ? d.trajectory
            : (trackTrajectoryMapRef.current.get(trackId) || [[cx, cy]]);

          const existing = currentMap.get(key);
          if (existing) {
            existing.posX = normX;
            existing.posY = normY;
            existing.object_class = className;
            if (d.confidence != null) existing.confidence = d.confidence;
            if (d.speed != null) existing.speed = d.speed;
            if (d.direction) existing.direction = d.direction;
            if (d.bbox) existing.bbox = d.bbox;
            if (d.zone) existing.zone = d.zone;
            if (d.threat_reason) {
              existing.reason = d.threat_reason;
              existing.threat_type = d.threat_reason;
            }
            if (d.threat_level) existing.severity = d.threat_level as ThreatLevel;
            existing.trajectory = fullTraj;
            hasUpdates = true;
          } else {
            const threatReason = d.threat_reason || `${className} threat detected by Threat Engine`;
            const newThreat: ThreatItem = {
              id: `thr-${trackId}-${Date.now()}`,
              threatCode: `THREAT #T-${trackId}`,
              track_id: trackId,
              object_class: className,
              threat_type: threatReason,
              severity: (d.threat_level as ThreatLevel) || 'HIGH',
              reason: threatReason,
              rule_name: d.threat_reason ? 'Automated Threat Rule' : 'Restricted Geo-Perimeter Intrusion',
              zone: d.zone || 'Surveillance Area',
              speed: d.speed || undefined,
              direction: d.direction || 'STATIONARY',
              bbox: d.bbox,
              confidence: d.confidence != null ? d.confidence : null,
              timestamp: timeStr,
              duration_seconds: d.duration_seconds || 0,
              status: 'ACTIVE',
              posX: normX,
              posY: normY,
              timeline: [
                { time: timeStr, text: threatReason },
              ],
              trajectory: fullTraj,
            };
            currentMap.set(key, newThreat);
            hasUpdates = true;
          }
        }
      });
    }

    if (hasUpdates || currentMap.size !== threats.length) {
      setThreats(Array.from(currentMap.values()));
    }
  }, [detections, threats.length]);

  // Synchronize backend alerts belonging to the current session
  const fetchThreats = async () => {
    const vid = videoStatus?.video_id;
    if (!vid && videoStatus?.status === 'no_video_selected') {
      setThreats([]);
      return;
    }

    setIsLoading(true);
    try {
      // 1. Fetch live session threats from backend
      const sessionThreats = await apiService.getSessionThreats();
      const currentMap = seenThreatsRef.current;

      if (sessionThreats && sessionThreats.length > 0) {
        sessionThreats.forEach((st: any) => {
          const trackId = st.track_id != null && st.track_id > 0 ? st.track_id : 1;
          const key = `trk-${trackId}`;
          const rawClass = st.class || st.object_class || 'Target';
          const className = rawClass.replace(/_/g, ' ');
          const cx = st.bbox ? (st.bbox[0] + st.bbox[2]) / 2 : 0.5;
          const cy = st.bbox ? (st.bbox[1] + st.bbox[3]) / 2 : 0.5;
          const normX = Math.max(-0.9, Math.min(0.9, (cx - 0.5) * 1.6));
          const normY = Math.max(-0.9, Math.min(0.9, (cy - 0.5) * 1.6));

          if (st.trajectory && st.trajectory.length > 0) {
            trackTrajectoryMapRef.current.set(trackId, st.trajectory);
          }

          const existing = currentMap.get(key);
          if (existing) {
            if (st.confidence != null) existing.confidence = st.confidence;
            if (st.direction) existing.direction = st.direction;
            if (st.trajectory) existing.trajectory = st.trajectory;
            if (st.bbox) existing.bbox = st.bbox;
            if (st.zone) existing.zone = st.zone;
          } else {
            const threatReason = st.threat_reason || `${className} threat detected by Threat Engine`;
            const timeStr = st.timestamp ? formatIST(st.timestamp, { includeTimeOnly: true }) : formatIST(new Date(), { includeTimeOnly: true });
            const item: ThreatItem = {
              id: `thr-${trackId}-${Date.now()}`,
              threatCode: `THREAT #T-${trackId}`,
              track_id: trackId,
              object_class: className,
              threat_type: threatReason,
              severity: (st.threat_level as ThreatLevel) || 'HIGH',
              reason: threatReason,
              rule_name: 'Automated Threat Rule',
              zone: st.zone || 'Surveillance Area',
              speed: st.speed || undefined,
              direction: st.direction || 'STATIONARY',
              bbox: st.bbox,
              confidence: st.confidence != null ? st.confidence : null,
              timestamp: timeStr,
              duration_seconds: st.duration_seconds || 0,
              status: 'ACTIVE',
              posX: normX,
              posY: normY,
              timeline: [{ time: timeStr, text: threatReason }],
              trajectory: st.trajectory || [],
            };
            currentMap.set(key, item);
          }
        });
      }

      // 2. Fetch SQLite alert history for this specific video
      const dbAlerts = await apiService.getAlertHistory({ video_id: vid || undefined, limit: 50 });
      if (dbAlerts && dbAlerts.length > 0) {
        dbAlerts.forEach((a) => {
          const trackId = a.track_id != null && a.track_id > 0 ? a.track_id : null;
          if (!trackId) return;
          const key = `trk-${trackId}`;
          const existing = currentMap.get(key);
          if (existing) {
            existing.id = a.id;
            if (a.status === 'ACKNOWLEDGED' || a.status === 'RESOLVED') {
              existing.status = a.status;
            }
          } else {
            const rawClass = a.object_class || 'Target';
            const className = rawClass.replace(/_/g, ' ');
            const newThreat: ThreatItem = {
              id: a.id,
              threatCode: `THREAT #T-${trackId}`,
              track_id: trackId,
              object_class: className,
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
              direction: 'STATIONARY',
              trajectory: trackTrajectoryMapRef.current.get(trackId) || [],
            };
            currentMap.set(key, newThreat);
          }
        });
      }

      setThreats(Array.from(currentMap.values()));
    } catch (err) {
      console.error('Failed to sync session alerts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchThreats();
  }, [currentVideoId, videoStatus?.status]);

  // Filter & Search Logic (strictly over current session threats)
  const filteredThreats = useMemo(() => {
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
  }, [threats, statusFilter, searchQuery]);

  const selectedThreat = useMemo(() => {
    if (threats.length === 0) return null;
    if (selectedThreatId) {
      const match = threats.find((t) => t.id === selectedThreatId || (t.track_id != null && `trk-${t.track_id}` === selectedThreatId));
      if (match) return match;
    }
    if (selectedTrackId != null) {
      const match = threats.find((t) => t.track_id === selectedTrackId);
      if (match) return match;
    }
    return filteredThreats[0] || threats[0] || null;
  }, [threats, filteredThreats, selectedThreatId, selectedTrackId]);

  // Session completed flag (historical session state when completed or not actively playing)
  const isCompletedSession =
    videoStatus?.status === 'completed' ||
    videoStatus?.status === 'stopped' ||
    (!isSessionActive && videoStatus?.status !== 'processing' && videoStatus?.status !== 'paused');

  // Current Session Threat Counters
  const countCritical = threats.filter((t) => t.severity === 'CRITICAL' && (isCompletedSession || t.status === 'ACTIVE')).length;
  const countHigh = threats.filter((t) => t.severity === 'HIGH' && (isCompletedSession || t.status === 'ACTIVE')).length;
  const countMedium = threats.filter((t) => t.severity === 'MEDIUM' && (isCompletedSession || t.status === 'ACTIVE')).length;
  const countLow = threats.filter((t) => t.severity === 'LOW' && (isCompletedSession || t.status === 'ACTIVE')).length;
  const countActiveTotal = threats.filter((t) => t.status === 'ACTIVE').length;
  const lastEventTime = threats.length > 0 ? threats[0]?.timestamp : 'NO CURRENT EVENTS';

  // Active targets strictly from current real-time tracking session (with ByteTrack 2500ms sliding buffer)
  const currentActiveTargets = activeTargets;

  const activeThreatsCount = useMemo(() => {
    if (!isSessionActive) return 0;
    return activeTargets.filter((t) => t.threat).length;
  }, [activeTargets, isSessionActive]);

  const currentThreatDetections = useMemo(() => {
    if (!isSessionActive) return [];
    return activeTargets.filter((t) => t.threat);
  }, [activeTargets, isSessionActive]);

  const activeIntrusions = useMemo(() => {
    if (!isSessionActive) return [];
    return activeTargets.filter((t) => {
      if (!t.threat || !t.zone) return false;
      const zName = t.zone.trim().toLowerCase();
      if (zName === '' || zName === 'n/a' || zName === 'surveillance area') return false;
      if (zones && zones.length > 0) {
        return zones.some(
          (z) => z.name.toLowerCase() === zName && (z.zone_type || 'RESTRICTED').toUpperCase() === 'RESTRICTED'
        );
      }
      return (t.threat_reason || '').toLowerCase().includes('zone') || (t.threat_reason || '').toLowerCase().includes('restricted');
    });
  }, [activeTargets, isSessionActive, zones]);

  // Real ByteTrack Trajectory for the selected threat mapped to 500x500 SVG coordinate space
  const selectedThreatTrajectory = useMemo(() => {
    if (!selectedThreat) return [];
    let rawTraj = selectedThreat.trajectory;
    if ((!rawTraj || rawTraj.length === 0) && selectedThreat.track_id != null) {
      rawTraj = trackTrajectoryMapRef.current.get(selectedThreat.track_id);
    }
    if (!rawTraj || !Array.isArray(rawTraj) || rawTraj.length === 0) {
      if (selectedThreat.bbox && selectedThreat.bbox.length === 4) {
        const cx = (selectedThreat.bbox[0] + selectedThreat.bbox[2]) / 2;
        const cy = (selectedThreat.bbox[1] + selectedThreat.bbox[3]) / 2;
        return [[Math.max(0.05, Math.min(0.95, cx)) * 500, Math.max(0.05, Math.min(0.95, cy)) * 500]];
      }
      return [];
    }
    return rawTraj.map((pt: any) => {
      const x = Array.isArray(pt) ? pt[0] : (typeof pt?.x === 'number' ? pt.x : 0.5);
      const y = Array.isArray(pt) ? pt[1] : (typeof pt?.y === 'number' ? pt.y : 0.5);
      return [
        Math.max(0.05, Math.min(0.95, x)) * 500,
        Math.max(0.05, Math.min(0.95, y)) * 500,
      ];
    });
  }, [selectedThreat]);

  // Last known position of the selected threat (exact final point in stored ByteTrack movement history)
  const selectedThreatLastPos = useMemo(() => {
    if (!selectedThreat) return null;
    if (selectedThreatTrajectory.length > 0) {
      const last = selectedThreatTrajectory[selectedThreatTrajectory.length - 1];
      return { posX: last[0], posY: last[1] };
    }
    if (selectedThreat.bbox && selectedThreat.bbox.length === 4) {
      const cx = (selectedThreat.bbox[0] + selectedThreat.bbox[2]) / 2;
      const cy = (selectedThreat.bbox[1] + selectedThreat.bbox[3]) / 2;
      return {
        posX: Math.max(0.05, Math.min(0.95, cx)) * 500,
        posY: Math.max(0.05, Math.min(0.95, cy)) * 500,
      };
    }
    return null;
  }, [selectedThreat, selectedThreatTrajectory]);

  // Surveillance Zone Map Header Status
  const mapHeaderStatus = useMemo(() => {
    if (selectedThreat) {
      const isActive = isSessionActive && videoStatus?.status !== 'completed' && activeTargets.some((t) => t.track_id === selectedThreat.track_id);
      if (isActive) return 'THREAT DETECTED';
      return 'HISTORICAL THREAT';
    }
    if (!isSessionActive || videoStatus?.status === 'completed') {
      if (threats.length > 0) return 'ANALYSIS COMPLETED';
      return 'SECTOR SECURE';
    }
    if (activeIntrusions.length > 0) return 'ZONE INTRUSION';
    if (activeThreatsCount > 0 || threats.some((t) => t.status === 'ACTIVE')) return 'THREAT DETECTED';
    return 'SECTOR SECURE';
  }, [isSessionActive, videoStatus?.status, activeIntrusions.length, activeThreatsCount, threats, selectedThreat, activeTargets]);

  // Empty state condition helpers for the map
  const isVideoRunning = isSessionActive;
  const isNoTargets = isVideoRunning && activeTargets.length === 0;
  const isNoThreats = isVideoRunning && activeTargets.length > 0 && activeThreatsCount === 0;

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
    if (threat.track_id != null && onSelectTrackId) {
      onSelectTrackId(threat.track_id);
    }
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
        {/* ACTIVE / SESSION THREATS (Primary Metric) */}
        <div className="p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between space-y-0.5">
          <span className="text-[9px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
            {isCompletedSession ? 'SESSION THREATS' : 'ACTIVE THREATS'}
          </span>
          <span className="text-xl font-mono font-extrabold text-[var(--threat-coral)]">
            {(isCompletedSession ? threats.length : countActiveTotal).toString().padStart(2, '0')}
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
                  {isCompletedSession ? 'RECORDED THREATS' : 'THREAT QUEUE'} ({filteredThreats.length.toString().padStart(2, '0')} EVENTS)
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
                    {st === 'ACTIVE' && isCompletedSession ? 'RECORDED' : st}
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
              {threats.length === 0 ? (
                <div className="text-center py-12 space-y-2 border border-dashed border-[var(--border-subtle)] rounded-xl">
                  <ShieldAlert className="w-7 h-7 text-[var(--text-muted)] opacity-30 mx-auto" />
                  <div className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                    {isCompletedSession ? 'NO RECORDED THREATS' : 'NO ACTIVE THREATS'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {isCompletedSession ? 'No threats detected in this recorded session.' : 'Start thermal surveillance to begin threat monitoring.'}
                  </div>
                </div>
              ) : filteredThreats.length === 0 ? (
                <div className="text-center py-12 space-y-2 border border-dashed border-[var(--border-subtle)] rounded-xl">
                  <CheckCircle2 className="w-6 h-6 text-[var(--operational-green)] mx-auto" />
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    NO {statusFilter === 'ALL' ? 'THREATS' : (statusFilter === 'ACTIVE' && isCompletedSession ? 'RECORDED THREATS' : statusFilter)} IN CURRENT SESSION
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
                      data-testid="threat-card"
                      data-track-id={threat.track_id}
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

                      {/* Bottom Row: Location, Timestamp & Inspect Link */}
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] pt-1 border-t border-white/[0.04]">
                        <span className="truncate text-[var(--text-secondary)]">{threat.zone}</span>
                        <div className="flex items-center space-x-2 shrink-0">
                          <span>{threat.timestamp}</span>
                          <span className="text-[10px] text-[var(--thermal-cyan)] font-sans inline-flex items-center gap-0.5 font-bold hover:underline">
                            Inspect <ArrowUpRight className="w-3 h-3" />
                          </span>
                        </div>
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
                  <MapIcon className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
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

            {/* Selected Threat Target Focus Bar */}
            {selectedThreat && (
              <div className="px-3 py-2 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center space-x-2 min-w-0 flex-wrap gap-y-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--threat-coral)] pulse-threat shrink-0" />
                  <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                    SELECTED TARGET:
                  </span>
                  <span className="text-xs font-mono font-bold text-[var(--text-primary)]">
                    T-{selectedThreat.track_id} · {selectedThreat.object_class.toUpperCase()}
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[var(--threat-coral)]/20 text-[var(--threat-coral)] font-bold border border-[var(--threat-coral)]/30">
                    THREAT · {selectedThreat.severity}
                  </span>
                  {isSessionActive && videoStatus?.status !== 'completed' && activeTargets.some((t) => t.track_id === selectedThreat.track_id) ? (
                    <span className="text-[9px] font-mono text-[var(--operational-green)] font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--operational-green)] pulse-live" />
                      TRACKING ACTIVE
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-amber-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      HISTORICAL TRACK · LAST KNOWN POSITION
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsDrawerOpen(true)}
                  className="text-[10px] font-mono text-[var(--thermal-cyan)] hover:underline flex items-center gap-1 cursor-pointer font-bold shrink-0"
                  title="Open Target Inspector"
                >
                  <span>TARGET INSPECTOR</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* 2D Surveillance Plane Viewport (Clean Top-Down Image Plane) */}
            <div className="relative w-full max-w-full min-w-0 h-[460px] sm:h-[480px] rounded-xl bg-[#03060B] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden">
              {/* Selected Historical Threat Map State Badge */}
              {selectedThreat && (!isSessionActive || videoStatus?.status === 'completed' || !activeTargets.some((t) => t.track_id === selectedThreat.track_id)) && (
                <div className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded bg-[#070B12]/90 border border-amber-500/40 text-[10px] font-mono text-amber-400 flex items-center gap-1.5 shadow-md backdrop-blur-sm pointer-events-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="font-bold">HISTORICAL TRACK</span>
                  <span className="text-white/40">·</span>
                  <span>LAST KNOWN POSITION</span>
                </div>
              )}

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
              {selectedThreat ? (
                // STATE C: A threat is selected (either historical or active).
                // Never block the map with "NO ACTIVE SURVEILLANCE"!
                // Trajectory and Last Known Position are rendered directly on the SVG map.
                null
              ) : !isSessionActive && threats.length > 0 ? (
                // STATE B: Video analysis completed, threats recorded, but none selected yet
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-2 z-20 pointer-events-none bg-[#03060B]/70 backdrop-blur-[1px]">
                  <Crosshair className="w-8 h-8 text-[var(--thermal-cyan)] opacity-40 mb-1" />
                  <div className="text-xs font-bold font-mono text-[var(--text-primary)] uppercase tracking-wider">
                    VIDEO ANALYSIS COMPLETED
                  </div>
                  <div className="text-[11px] font-sans text-[var(--text-muted)] max-w-xs">
                    Select any threat from the Threat Queue to inspect its recorded track and 3D trajectory.
                  </div>
                </div>
              ) : !isVideoRunning ? (
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
                          title: `GEO-FENCE: ${zone.name.toUpperCase()}`,
                          time: `Type: ${zoneType} | Vertices: ${zone.polygon.length}`,
                          type: isRestricted ? 'alert' : 'success',
                        });
                        setTimeout(() => setToastMessage(null), 3000);
                      }}
                    >
                      <polygon
                        points={pointsStr}
                        fill={zoneFill}
                        stroke={zoneColor}
                        strokeWidth={hasIntrusion ? '2.5' : '1.5'}
                        strokeDasharray={isRestricted ? 'none' : '4 3'}
                        className={hasIntrusion ? 'animate-pulse' : ''}
                      />
                      {/* Zone Name Label */}
                      <text
                        x={Math.max(25, Math.min(475, Math.round(avgX * 500)))}
                        y={Math.max(25, Math.min(475, Math.round(avgY * 500)))}
                        fill={zoneColor}
                        fontSize="9"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="bold"
                        letterSpacing="1px"
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

                {/* Real ByteTrack Trajectory for Selected Threat (Active or Historical) */}
                {selectedThreat && selectedThreatTrajectory.length >= 1 && (
                  <g className="selected-trajectory-group" data-testid="map-selected-trajectory">
                    <defs>
                      <linearGradient id="selectedThreatTrajGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#55D9F5" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#F27786" stopOpacity="0.95" />
                      </linearGradient>
                    </defs>
                    {/* Shadow / Glow Line */}
                    <polyline
                      points={(selectedThreatTrajectory.length === 1
                        ? [selectedThreatTrajectory[0], selectedThreatTrajectory[0]]
                        : selectedThreatTrajectory
                      ).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}
                      fill="none"
                      stroke="#F27786"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeOpacity="0.25"
                    />
                    {/* Core Trajectory Path */}
                    <polyline
                      points={(selectedThreatTrajectory.length === 1
                        ? [selectedThreatTrajectory[0], selectedThreatTrajectory[0]]
                        : selectedThreatTrajectory
                      ).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}
                      fill="none"
                      stroke="url(#selectedThreatTrajGrad)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Historical Position Breadcrumbs */}
                    {selectedThreatTrajectory.map((p, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === selectedThreatTrajectory.length - 1;
                      const step = Math.max(1, Math.floor(selectedThreatTrajectory.length / 8));
                      if (!isFirst && !isLast && idx % step !== 0) return null;
                      if (isLast) return null;
                      return (
                        <g key={`traj-dot-${idx}`}>
                          <circle
                            cx={p[0]}
                            cy={p[1]}
                            r={isFirst ? 3.5 : 2}
                            fill={isFirst ? '#55D9F5' : '#F27786'}
                            stroke="#070B12"
                            strokeWidth="1"
                            opacity={isFirst ? 0.9 : 0.65}
                          />
                          {isFirst && (
                            <text
                              x={p[0]}
                              y={p[1] - 6}
                              fill="#55D9F5"
                              fontSize="7"
                              fontFamily="JetBrains Mono, monospace"
                              fontWeight="bold"
                              textAnchor="middle"
                            >
                              START
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* Real Active ByteTrack Targets (Strictly Current Session) */}
                {isSessionActive &&
                  activeTargets.map((t) => {
                    const trackId = t.track_id;
                    const isThreat = t.threat;
                    const isIntrusion = Boolean(
                      t.threat &&
                      t.zone &&
                      t.zone.trim().toLowerCase() !== 'n/a' &&
                      t.zone.trim().toLowerCase() !== 'surveillance area'
                    );

                    // Compute normalized center position from bounding box
                    const cx = Math.max(0.05, Math.min(0.95, (t.bbox[0] + t.bbox[2]) / 2));
                    const cy = Math.max(0.05, Math.min(0.95, (t.bbox[1] + t.bbox[3]) / 2));
                    const posX = cx * 500;
                    const posY = cy * 500;

                    const isSelected = selectedThreat?.track_id === trackId || selectedTrackId === trackId;
                    const markerColor = isThreat ? '#F27786' : '#55D9F5';
                    const targetClass = (t.class || 'Target').toUpperCase();

                    return (
                      <g
                        key={`target-${trackId}`}
                        data-testid="map-active-target"
                        className="cursor-pointer transition-transform group"
                        onClick={() => {
                          const matchedThreat = threats.find((th) => th.track_id === trackId);
                          if (matchedThreat) {
                            handleSelectThreat(matchedThreat);
                          } else {
                            if (onSelectTrackId) onSelectTrackId(trackId);
                            setToastMessage({
                              title: `TARGET T-${trackId} · ${targetClass}`,
                              time: isThreat ? 'CLASSIFIED AS THREAT' : 'NORMAL STATUS',
                              type: isThreat ? 'alert' : 'success',
                            });
                            setTimeout(() => setToastMessage(null), 3000);
                          }
                        }}
                      >
                        {/* Selection Halo if focused in inspector */}
                        {isSelected && (
                          <circle
                            cx={posX}
                            cy={posY}
                            r={24}
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="2"
                            strokeDasharray="4 3"
                            className="animate-spin"
                            style={{ transformOrigin: `${posX}px ${posY}px`, animationDuration: '6s' }}
                          />
                        )}

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
                            x="-45"
                            y="-14"
                            width="90"
                            height="15"
                            rx="3"
                            fill="#070B12"
                            fillOpacity="0.95"
                            stroke={isSelected ? '#FFFFFF' : markerColor}
                            strokeWidth={isSelected ? '1.5' : '0.8'}
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
                            x={isSelected ? "-36" : "-24"}
                            y="2"
                            width={isSelected ? "72" : "48"}
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
                            {isSelected
                              ? (isThreat ? 'THREAT · SELECTED' : 'SELECTED')
                              : (isThreat ? (isIntrusion ? 'INTRUSION' : 'THREAT') : 'NORMAL')}
                          </text>
                        </g>
                      </g>
                    );
                  })}

                {/* Historical Selected Threat Target Marker (When Track is Inactive / Video Completed) */}
                {selectedThreat && selectedThreatLastPos && (!isSessionActive || videoStatus?.status === 'completed' || !activeTargets.some((t) => t.track_id === selectedThreat.track_id)) && (
                  (() => {
                    const posX = selectedThreatLastPos.posX;
                    const posY = selectedThreatLastPos.posY;
                    const targetClass = (selectedThreat.object_class || 'Target').toUpperCase();
                    const direction = selectedThreat.direction || 'STATIONARY';
                    return (
                      <g
                        key={`last-known-${selectedThreat.track_id}`}
                        data-testid="map-selected-historical-target"
                        className="cursor-pointer"
                        onClick={() => setIsDrawerOpen(true)}
                      >
                        {/* Outer Pulsing Selection Halo */}
                        <circle
                          cx={posX}
                          cy={posY}
                          r={26}
                          fill="none"
                          stroke="#F27786"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                          className="animate-spin"
                          style={{ transformOrigin: `${posX}px ${posY}px`, animationDuration: '8s' }}
                        />

                        {/* Outer Glow Target Circle */}
                        <circle
                          cx={posX}
                          cy={posY}
                          r={16}
                          fill="#F27786"
                          fillOpacity="0.22"
                          stroke="#F59E0B"
                          strokeWidth="1.5"
                        />

                        {/* Inner Target Core Point */}
                        <circle cx={posX} cy={posY} r={4.5} fill="#F27786" />
                        <circle cx={posX} cy={posY} r={1.5} fill="#FFFFFF" />

                        {/* Target Annotation Card */}
                        <g transform={`translate(${posX}, ${posY - 20})`}>
                          <rect
                            x="-65"
                            y="-26"
                            width="130"
                            height="24"
                            rx="4"
                            fill="#070B12"
                            fillOpacity="0.95"
                            stroke="#F27786"
                            strokeWidth="1.2"
                          />
                          <text
                            x="0"
                            y="-14"
                            fill="#FFFFFF"
                            fontSize="8"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            T-{selectedThreat.track_id} {targetClass}
                          </text>
                          <rect x="-65" y="-8" width="130" height="11" rx="2" fill="#F59E0B" />
                          <text
                            x="0"
                            y="0.5"
                            fill="#070B12"
                            fontSize="6.5"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            HISTORICAL TRACK · LAST KNOWN POSITION
                          </text>
                        </g>
                      </g>
                    );
                  })()
                )}
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
                  {activeTargets.length}
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
                    activeThreatsCount > 0
                      ? 'text-[var(--threat-coral)]'
                      : 'text-[var(--operational-green)]'
                  }`}
                >
                  {activeThreatsCount}
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
          <div
            className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[1px]"
            onClick={() => setIsDrawerOpen(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[460px] bg-[#070B12] border-l border-[var(--border-subtle)] h-[100dvh] max-h-[100dvh] shadow-2xl flex flex-col overflow-hidden font-sans select-none"
            >
              {/* FIXED DRAWER HEADER */}
              <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[#070B12] z-20">
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="p-2 rounded-xl bg-[var(--threat-coral)]/10 text-[var(--threat-coral)] border border-[var(--threat-coral)]/20 shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide uppercase block">
                      TARGET INSPECTOR · INCIDENT INVESTIGATOR
                    </span>
                    <div className="flex items-center space-x-2 flex-wrap mt-0.5">
                      <h3 className="font-mono font-bold text-xs sm:text-sm text-[var(--text-primary)] truncate">
                        T-{selectedThreat.track_id} · {selectedThreat.object_class.toUpperCase()}
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--threat-coral)]/20 text-[var(--threat-coral)] border border-[var(--threat-coral)]/40 font-bold">
                        THREAT · {selectedThreat.severity}
                      </span>
                    </div>
                    {/* Active vs Inactive Track Status */}
                    <div className="flex items-center space-x-1.5 mt-1 flex-wrap gap-1">
                      {activeTargets.some((t) => t.track_id === selectedThreat.track_id) ? (
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[var(--operational-green)]/15 text-[var(--operational-green)] border border-[var(--operational-green)]/30 font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--operational-green)] pulse-live" />
                          TRACKING ACTIVE
                        </span>
                      ) : (
                        <>
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                            RECORDED THREAT / TRACK NO LONGER ACTIVE
                          </span>
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/20">
                            LAST KNOWN TRACK POSITION
                          </span>
                        </>
                      )}
                    </div>
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

                {/* 3D Target Trajectory & Direct Navigation to Target Tracking */}
                <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
                      BYTE TRACK 3D TRAJECTORY
                    </span>
                    {onNavigate && (
                      <button
                        onClick={() => {
                          if (selectedThreat?.track_id != null && onSelectTrackId) {
                            onSelectTrackId(selectedThreat.track_id);
                          }
                          onNavigate('tracking');
                        }}
                        className="text-[11px] font-mono text-[var(--thermal-cyan)] hover:underline inline-flex items-center gap-1 cursor-pointer font-bold"
                        title="Inspect in Target Tracking Page"
                      >
                        <span>INSPECT IN TARGET TRACKING</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <TargetTrajectory3D
                    target={{
                      track_id: selectedThreat.track_id,
                      class: selectedThreat.object_class,
                      confidence: activeTargets.find((t) => t.track_id === selectedThreat.track_id)?.confidence ?? selectedThreat.confidence ?? 0.92,
                      speed: activeTargets.find((t) => t.track_id === selectedThreat.track_id)?.speed ?? selectedThreat.speed,
                      direction: activeTargets.find((t) => t.track_id === selectedThreat.track_id)?.direction || selectedThreat.direction || 'STATIONARY',
                      threat: true,
                      threat_level: selectedThreat.severity,
                      zone: selectedThreat.zone,
                      bbox: activeTargets.find((t) => t.track_id === selectedThreat.track_id)?.bbox || selectedThreat.bbox || [
                        Math.max(0, (selectedThreat.posX / 1.6) + 0.5 - 0.05),
                        Math.max(0, (selectedThreat.posY / 1.6) + 0.5 - 0.05),
                        Math.min(1, (selectedThreat.posX / 1.6) + 0.5 + 0.05),
                        Math.min(1, (selectedThreat.posY / 1.6) + 0.5 + 0.05),
                      ],
                      trajectory: (selectedThreat.trajectory && selectedThreat.trajectory.length > 0)
                        ? selectedThreat.trajectory
                        : (trackTrajectoryMapRef.current.get(selectedThreat.track_id) || []),
                    }}
                    className="w-full"
                  />
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
