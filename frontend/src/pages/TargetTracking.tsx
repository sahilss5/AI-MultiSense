import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ThermalDetectionObject } from '../types/schema';
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
} from 'lucide-react';

interface TargetTrackingProps {
  detections?: ThermalDetectionObject[];
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
}

export const TargetTracking: React.FC<TargetTrackingProps> = ({ detections = [] }) => {
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [filterThreat, setFilterThreat] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'confidence' | 'speed' | 'threat'>('confidence');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [systemStatus, setSystemStatus] = useState<any>(null);

  useEffect(() => {
    apiService.getSystemStatus().then(setSystemStatus).catch(() => null);
  }, []);

  const isDemo = systemStatus?.is_demo_mode ?? false;

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Demo fallback targets (strictly isolated to Demo Mode only)
  const demoTargets: TargetItem[] = useMemo(() => [
    {
      track_id: 1,
      trackCode: 'T-1',
      class: 'Drone',
      confidence: 0.924,
      speed: null,
      direction: 'NE',
      duration_seconds: 42,
      duration_formatted: '00:42',
      zone: 'Sector Alpha-4',
      status: 'ALERT',
      threat: true,
      threat_level: 'HIGH',
      threat_reason: 'Unauthorized drone detected',
      bbox: [0.54, 0.20, 0.77, 0.48],
      first_detected: 'N/A',
      last_seen: currentTimeStr || '18:02:49',
      posX: 0.28,
      posY: -0.32,
      history: [
        { time: currentTimeStr || '18:02:40', text: 'Thermal signature acquired in Sector Alpha-4' },
        { time: currentTimeStr || '18:02:49', text: 'Unauthorized drone detected' },
      ],
    },
    {
      track_id: 2,
      trackCode: 'T-2',
      class: 'Person',
      confidence: 0.974,
      speed: null,
      direction: 'NW',
      duration_seconds: 68,
      duration_formatted: '01:08',
      zone: 'Perimeter Approach Alpha',
      status: 'TRACKING',
      threat: false,
      threat_level: 'LOW',
      bbox: [0.24, 0.32, 0.49, 0.68],
      first_detected: 'N/A',
      last_seen: currentTimeStr || '18:02:49',
      posX: -0.42,
      posY: -0.18,
      history: [
        { time: currentTimeStr || '18:02:30', text: 'ByteTrack target acquired' },
        { time: currentTimeStr || '18:02:49', text: 'Routine thermal tracking' },
      ],
    },
    {
      track_id: 3,
      trackCode: 'T-3',
      class: 'Vehicle',
      confidence: 0.942,
      speed: null,
      direction: 'E',
      duration_seconds: 24,
      duration_formatted: '00:24',
      zone: 'Access Road',
      status: 'TRACKING',
      threat: false,
      threat_level: 'LOW',
      bbox: [0.63, 0.54, 0.90, 0.86],
      first_detected: 'N/A',
      last_seen: currentTimeStr || '18:02:49',
      posX: 0.44,
      posY: 0.62,
      history: [
        { time: currentTimeStr || '18:02:35', text: 'Vehicle thermal signature tracked' },
      ],
    },
  ], [currentTimeStr]);

  // Merge live detections if available; strictly empty if no video playing
  const allTargets: TargetItem[] = useMemo(() => {
    if (detections.length === 0) return isDemo ? demoTargets : [];

    return detections.map((d, index) => {
      const tid = d.track_id != null && d.track_id > 0 ? d.track_id : index + 1;
      const cx = (d.bbox[0] + d.bbox[2]) / 2;
      const cy = (d.bbox[1] + d.bbox[3]) / 2;
      const normX = Math.max(-0.9, Math.min(0.9, (cx - 0.5) * 1.6));
      const normY = Math.max(-0.9, Math.min(0.9, (cy - 0.5) * 1.6));

      const durSec = d.duration_seconds || 0;
      const m = Math.floor(durSec / 60).toString().padStart(2, '0');
      const s = (durSec % 60).toString().padStart(2, '0');

      return {
        track_id: tid,
        trackCode: `T-${tid}`,
        class: (d.class || 'Person').replace(/_/g, ' '),
        confidence: d.confidence || 0.92,
        speed: d.speed && d.speed > 0 ? (d.speed > 20 ? d.speed : d.speed * 3.6) : null,
        direction: d.direction || 'N/A',
        duration_seconds: durSec,
        duration_formatted: `${m}:${s}`,
        zone: d.zone || 'Sector Alpha-4',
        status: d.threat ? 'ALERT' : 'TRACKING',
        threat: !!d.threat,
        threat_level: d.threat_level || (d.threat ? 'HIGH' : 'LOW'),
        threat_reason: d.threat_reason || (d.threat ? 'Unauthorized target detected' : null),
        bbox: d.bbox,
        first_detected: 'N/A',
        last_seen: formatIST(new Date(), { includeTimeOnly: true }),
        posX: normX,
        posY: normY,
        history: [
          {
            time: formatIST(new Date(), { includeTimeOnly: true }),
            text: d.threat
              ? (d.threat_reason || 'Threat detected by Threat Engine')
              : `Active ByteTrack tracking in ${d.zone || 'Sector Alpha-4'}`,
          },
        ],
      };
    });
  }, [detections, isDemo, demoTargets]);

  // Class Counts for Top Summary Cards from REAL tracking data
  const countTotal = allTargets.length;
  const countPerson = allTargets.filter((t) => t.class.toUpperCase() === 'PERSON').length;
  const countVehicle = allTargets.filter((t) => t.class.toUpperCase() === 'VEHICLE').length;
  const countAnimal = allTargets.filter((t) => t.class.toUpperCase() === 'ANIMAL').length;
  const countDrone = allTargets.filter((t) => t.class.toUpperCase() === 'DRONE').length;
  const countBag = allTargets.filter((t) => t.class.toUpperCase().includes('BAG')).length;

  // Filter & Search Logic
  const filteredTargets = useMemo(() => {
    return allTargets
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
  }, [allTargets, filterClass, filterThreat, searchQuery, sortBy, sortAsc]);

  // Selected Target: strictly null if no targets exist
  const selectedTarget = useMemo(() => {
    if (allTargets.length === 0) return null;
    if (selectedTrackId != null) {
      const found = allTargets.find((t) => t.track_id === selectedTrackId);
      if (found) return found;
    }
    return filteredTargets[0] || allTargets[0] || null;
  }, [allTargets, filteredTargets, selectedTrackId]);

  const getClassIcon = (cls: string) => {
    const norm = (cls || '').toUpperCase();
    if (norm.includes('DRONE')) return <Plane className="w-3.5 h-3.5 text-[var(--intelligence-violet)]" />;
    if (norm.includes('VEHICLE')) return <Car className="w-3.5 h-3.5 text-[var(--warning-amber)]" />;
    if (norm.includes('ANIMAL')) return <Bird className="w-3.5 h-3.5 text-[var(--operational-green)]" />;
    if (norm.includes('BAG')) return <Briefcase className="w-3.5 h-3.5 text-[var(--threat-coral)]" />;
    return <User className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />;
  };

  const handleSelectTarget = (trackId: number) => {
    setSelectedTrackId(trackId);
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
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            Real-time object tracking and target movement visualization
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
          {/* Active Tracks Count */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3.5 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--thermal-cyan)]">
            <span className="text-[var(--text-muted)]">ACTIVE TRACKS:</span>
            <span className="font-bold">{countTotal}</span>
          </div>

          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. TOP SUMMARY CARDS                                     */}
      {/* ======================================================== */}
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
      {/* 4. MAIN WORKSPACE: ACTIVE DIRECTORY (65%) / INSPECTOR (35%) */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-full min-w-0 items-start">
        {/* LEFT COLUMN: ACTIVE TARGET DIRECTORY (8 Cols) */}
        <div className="lg:col-span-8 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-4 space-y-3 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center space-x-2 min-w-0">
                <Crosshair className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  ACTIVE TARGET DIRECTORY ({filteredTargets.length})
                </h3>
              </div>
              <div className="flex items-center space-x-1.5 text-[10px] font-mono">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    allTargets.length > 0 ? 'bg-[var(--operational-green)] pulse-live' : 'bg-[var(--text-muted)]'
                  }`}
                />
                <span className={allTargets.length > 0 ? 'text-[var(--operational-green)] font-semibold' : 'text-[var(--text-muted)]'}>
                  {allTargets.length > 0 ? 'LIVE TRACKS' : 'NO ACTIVE TRACKS'}
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="table-wrapper overflow-x-auto">
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
                  {filteredTargets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-1.5 font-sans">
                          <Crosshair className="w-7 h-7 text-[var(--text-muted)] opacity-30 mb-1" />
                          <div className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-wider">
                            NO ACTIVE TARGETS
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Start a thermal video to begin tracking.
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredTargets.map((target) => {
                      const isSelected = selectedTarget?.track_id === target.track_id;
                      return (
                        <tr
                          key={target.track_id}
                          onClick={() => handleSelectTarget(target.track_id)}
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
                              {target.threat ? 'THREAT' : 'TRACKING'}
                            </Badge>
                          </td>

                          {/* Zone */}
                          <td className="py-3 pr-3 text-[var(--text-secondary)] text-[11px] max-w-[130px] truncate">
                            {target.zone}
                          </td>

                          {/* Direction */}
                          <td className="py-3 pr-3 font-mono text-[var(--text-secondary)] text-[11px] whitespace-nowrap">
                            {target.direction || 'N/A'}
                          </td>

                          {/* Speed */}
                          <td className="py-3 pr-3 font-mono text-[var(--warning-amber)] font-semibold whitespace-nowrap">
                            {target.speed && target.speed > 0 ? `${target.speed.toFixed(1)} km/h` : 'N/A'}
                          </td>

                          {/* Last Seen */}
                          <td className="py-3 pr-3 font-mono text-[var(--text-secondary)] text-[10px] whitespace-nowrap">
                            {target.last_seen}
                          </td>

                          {/* Action */}
                          <td className="py-3 text-right whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectTarget(target.track_id);
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
              {selectedTarget && (
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-xs text-[var(--thermal-cyan)] bg-[var(--thermal-cyan)]/10 px-2 py-0.5 rounded-full border border-[var(--thermal-cyan)]/25">
                    T-{selectedTarget.track_id} · {selectedTarget.class.toUpperCase()}
                  </span>
                  <Badge variant={selectedTarget.threat ? 'red' : 'cyan'}>
                    {selectedTarget.threat ? `THREAT · ${selectedTarget.threat_level}` : 'NORMAL · LOW'}
                  </Badge>
                </div>
              )}
            </div>

            {/* 3D Target Trajectory Visualization */}
            <TargetTrajectory3D target={selectedTarget} className="w-full" />

            {/* Target Details / Empty State */}
            {selectedTarget ? (
              <div className="space-y-3 font-sans text-xs">
                {/* Structured Metrics Grid */}
                <div className="space-y-2">
                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">AI CONFIDENCE:</span>
                    <span className="font-mono font-bold text-[var(--operational-green)]">
                      {(selectedTarget.confidence * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">STATUS:</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {selectedTarget.threat ? 'THREAT' : 'TRACKING'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">THREAT LEVEL:</span>
                    <SeverityIndicator level={selectedTarget.threat_level} />
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">ZONE:</span>
                    <span className="font-sans text-[var(--text-secondary)] truncate">
                      {selectedTarget.zone}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">REASON:</span>
                    <span className="font-sans text-[var(--text-secondary)] text-[11px] truncate max-w-[180px]">
                      {selectedTarget.threat_reason || (selectedTarget.threat ? 'Restricted perimeter boundary alert' : 'Routine thermal tracking')}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">ESTIMATED SPEED:</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {selectedTarget.speed && selectedTarget.speed > 0 ? `${selectedTarget.speed.toFixed(1)} km/h` : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Threat Banner if Alert Active */}
                {selectedTarget.threat && (
                  <div className="p-3 rounded-xl bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/30 text-[var(--threat-coral)] text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>THREAT ALERT</span>
                    </div>
                    <p className="text-[11px] text-[var(--threat-coral)] leading-relaxed">
                      {selectedTarget.threat_reason || 'Target breached restricted perimeter boundary.'}
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
                    {selectedTarget.history.map((h, i) => (
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
