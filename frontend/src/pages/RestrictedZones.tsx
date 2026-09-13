import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zone, ThreatLevel } from '../types/schema';
import { apiService } from '../services/api';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { SeverityIndicator } from '../components/common/SeverityIndicator';
import { formatIST } from '../utils/date';
import {
  Map,
  ShieldAlert,
  Shield,
  Plus,
  Trash2,
  Power,
  Check,
  X,
  Edit2,
  Sliders,
  Clock,
  Crosshair,
  User,
  Car,
  Plane,
  Briefcase,
  Bird,
  AlertTriangle,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Eye,
  Camera,
  Search,
  CheckCircle2,
  Radio,
  FileText,
  Navigation,
} from 'lucide-react';

export type ZoneType = 'RESTRICTED' | 'MONITORING' | 'PERIMETER' | 'VEHICLE_CONTROL';

export interface EnhancedZone extends Zone {
  type: ZoneType;
  severity: ThreatLevel;
  speedLimit?: number;
  monitoredClasses: string[];
  targetsInside: {
    track_id: number;
    class: string;
    threat: boolean;
    threat_level: ThreatLevel;
    speed: number;
    entered_at: string;
  }[];
  history: { time: string; text: string; threat?: boolean }[];
}

export const RestrictedZones: React.FC = () => {
  const [zones, setZones] = useState<EnhancedZone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<string>('zone-1');
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ title: string; time: string; isThreat?: boolean } | null>(null);

  // Map Layer Visibility Toggles
  const [showTargets, setShowTargets] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showCameras, setShowCameras] = useState<boolean>(true);
  const [showTrajectories, setShowTrajectories] = useState<boolean>(true);
  const [mapZoom, setMapZoom] = useState<number>(1);

  // Create Form State
  const [formName, setFormName] = useState<string>('Restricted Zone Bravo');
  const [formType, setFormType] = useState<ZoneType>('RESTRICTED');
  const [formSeverity, setFormSeverity] = useState<ThreatLevel>('HIGH');
  const [formSpeedLimit, setFormSpeedLimit] = useState<number>(40);
  const [formClasses, setFormClasses] = useState<string[]>(['Person', 'Drone', 'Person With Bag']);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Baseline Demo Zones
  const demoZones: EnhancedZone[] = useMemo(
    () => [
      {
        id: 'zone-1',
        name: 'Restricted Storage Bravo',
        type: 'RESTRICTED',
        severity: 'CRITICAL',
        enabled: true,
        speedLimit: 15,
        polygon: [
          [0.48, 0.45],
          [0.88, 0.42],
          [0.92, 0.88],
          [0.54, 0.92],
        ],
        monitoredClasses: ['Person', 'Drone', 'Person With Bag'],
        targetsInside: [
          {
            track_id: 31,
            class: 'Person With Bag',
            threat: true,
            threat_level: 'CRITICAL',
            speed: 3.8,
            entered_at: '20:42:18 IST',
          },
        ],
        history: [
          { time: '20:42:18 IST', text: 'T-031 Person With Bag breached perimeter (Intrusion Alarm)', threat: true },
          { time: '20:39:10 IST', text: 'Zone armed by Automated Rule Engine', threat: false },
          { time: '20:35:00 IST', text: 'Baseline perimeter calibrated at 100% sensitivity', threat: false },
        ],
      },
      {
        id: 'zone-2',
        name: 'Perimeter Access Road',
        type: 'VEHICLE_CONTROL',
        severity: 'HIGH',
        enabled: true,
        speedLimit: 40,
        polygon: [
          [0.38, 0.12],
          [0.48, 0.12],
          [0.48, 0.88],
          [0.38, 0.88],
        ],
        monitoredClasses: ['Vehicle'],
        targetsInside: [
          {
            track_id: 18,
            class: 'Vehicle',
            threat: true,
            threat_level: 'HIGH',
            speed: 65.0,
            entered_at: '20:41:52 IST',
          },
        ],
        history: [
          { time: '20:41:52 IST', text: 'T-018 Vehicle exceeded speed limit (65 km/h vs 40 km/h)', threat: true },
          { time: '20:40:00 IST', text: 'Speed radar enforcement loop active', threat: false },
        ],
      },
      {
        id: 'zone-3',
        name: 'Sector Alpha-4 Buffer',
        type: 'MONITORING',
        severity: 'LOW',
        enabled: true,
        speedLimit: 60,
        polygon: [
          [0.10, 0.15],
          [0.34, 0.12],
          [0.36, 0.55],
          [0.12, 0.58],
        ],
        monitoredClasses: ['Person', 'Animal', 'Drone'],
        targetsInside: [
          {
            track_id: 24,
            class: 'Person',
            threat: false,
            threat_level: 'LOW',
            speed: 4.2,
            entered_at: '20:41:54 IST',
          },
        ],
        history: [
          { time: '20:41:54 IST', text: 'T-024 Person entered monitoring buffer', threat: false },
          { time: '20:30:00 IST', text: 'Buffer sector clear and operational', threat: false },
        ],
      },
    ],
    []
  );

  // Fetch or Load Baseline
  const fetchZones = async () => {
    try {
      const data = await apiService.getZones();
      if (Array.isArray(data)) {
        const mapped: EnhancedZone[] = data.map((z, idx) => ({
          ...z,
          enabled: z.enabled !== undefined ? z.enabled : true,
          type: (z as any).type || (idx === 0 ? 'RESTRICTED' : (idx === 1 ? 'PERIMETER' : 'MONITORING')),
          severity: (z as any).severity || (idx === 0 ? 'CRITICAL' : (idx === 1 ? 'HIGH' : 'LOW')),
          monitoredClasses: (z as any).monitoredClasses || (idx === 1 ? ['Vehicle'] : ['Person', 'Drone']),
          targetsInside: [],
          history: [{ time: formatIST(new Date(), { includeTimeOnly: true }), text: 'Zone geofence synchronized with backend' }],
        }));
        setZones(mapped);
      } else {
        setZones(demoZones);
      }
    } catch (err) {
      console.error('Failed to fetch zones from backend:', err);
      setZones(demoZones);
    }
  };

  useEffect(() => {
    fetchZones();
  }, []);

  // Filtered Zones List
  const filteredZones = useMemo(() => {
    return zones.filter((z) => {
      if (filterType !== 'ALL' && z.type !== filterType) return false;
      if (filterStatus === 'ACTIVE' && !z.enabled) return false;
      if (filterStatus === 'DISABLED' && z.enabled) return false;
      if (filterStatus === 'INTRUSION' && (!z.targetsInside || z.targetsInside.filter((t) => t.threat).length === 0))
        return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mName = z.name.toLowerCase().includes(q);
        const mType = z.type.toLowerCase().includes(q);
        if (!mName && !mType) return false;
      }

      return true;
    });
  }, [zones, filterType, filterStatus, searchQuery]);

  const selectedZone =
    zones.find((z) => z.id === activeZoneId) ||
    filteredZones[0] ||
    zones[0];

  // Global Statistics
  const totalZonesCount = zones.length;
  const activeZonesCount = zones.filter((z) => z.enabled).length;
  const totalTargetsInside = zones.reduce((acc, z) => acc + (z.targetsInside?.length || 0), 0);
  const totalIntrusions = zones.reduce(
    (acc, z) => acc + (z.targetsInside?.filter((t) => t.threat).length || 0),
    0
  );

  // Canvas Drawing Handlers
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000;

    setDrawingPoints((prev) => [...prev, [x, y]]);
  };

  const handleStartDrawing = () => {
    setIsDrawingMode(true);
    setDrawingPoints([]);
  };

  const handleCompleteDrawing = () => {
    if (drawingPoints.length < 3) return;
    setIsDrawingMode(false);
    setIsCreateModalOpen(true);
  };

  const handleCancelDrawing = () => {
    setIsDrawingMode(false);
    setDrawingPoints([]);
  };

  const handleSaveZone = async () => {
    if (drawingPoints.length < 3) return;

    try {
      const created = await apiService.createZone({
        name: formName,
        polygon: drawingPoints,
        enabled: true,
      });

      const newZone: EnhancedZone = {
        id: created.id,
        name: created.name || formName,
        type: formType,
        severity: formSeverity,
        speedLimit: formSpeedLimit,
        polygon: created.polygon || drawingPoints,
        enabled: created.enabled !== undefined ? created.enabled : true,
        monitoredClasses: formClasses,
        targetsInside: [],
        history: [{ time: formatIST(new Date(), { includeTimeOnly: true }), text: 'Zone created and armed in database' }],
      };

      setZones((prev) => [...prev, newZone]);
      setActiveZoneId(newZone.id);
      setDrawingPoints([]);
      setIsCreateModalOpen(false);

      setToastMessage({
        title: `GEOFENCE ARMED: ${formName.toUpperCase()}`,
        time: formatIST(new Date(), { includeTimeOnly: true }),
        isThreat: false,
      });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (e) {
      console.error('Failed to create zone on backend:', e);
      setToastMessage({
        title: 'Failed to create zone. Please try again.',
        time: formatIST(new Date(), { includeTimeOnly: true }),
        isThreat: true,
      });
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  const handleToggleEnable = async (zone: EnhancedZone) => {
    const nextEnabled = !zone.enabled;
    try {
      await apiService.updateZone(zone.id, { enabled: nextEnabled });
      setZones((prev) =>
        prev.map((z) =>
          z.id === zone.id
            ? {
                ...z,
                enabled: nextEnabled,
                history: [
                  {
                    time: formatIST(new Date(), { includeTimeOnly: true }),
                    text: nextEnabled ? 'Zone armed and active' : 'Zone deactivated by operator',
                  },
                  ...z.history,
                ],
              }
            : z
        )
      );
      setToastMessage({
        title: `${zone.name.toUpperCase()} ${nextEnabled ? 'ARMED' : 'DEACTIVATED'}`,
        time: formatIST(new Date(), { includeTimeOnly: true }),
        isThreat: false,
      });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (e) {
      console.error('Failed to persist zone toggle to backend:', e);
      setToastMessage({
        title: 'Failed to update zone status. Please try again.',
        time: formatIST(new Date(), { includeTimeOnly: true }),
        isThreat: true,
      });
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  const handleDeleteZone = async (id: string) => {
    try {
      await apiService.deleteZone(id);

      setZones((prev) => {
        const remaining = prev.filter((z) => z.id !== id);
        if (activeZoneId === id) {
          setActiveZoneId(remaining.length > 0 ? remaining[0].id : '');
        }
        return remaining;
      });

      setToastMessage({
        title: 'SURVEILLANCE GEOFENCE DELETED',
        time: formatIST(new Date(), { includeTimeOnly: true }),
        isThreat: false,
      });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (e) {
      console.error('Failed to persist zone deletion to backend:', e);
      setToastMessage({
        title: 'Failed to delete zone. Please try again.',
        time: formatIST(new Date(), { includeTimeOnly: true }),
        isThreat: true,
      });
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Canvas Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background
    ctx.fillStyle = '#05080D';
    ctx.fillRect(0, 0, width, height);

    // Subtle Grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(85, 217, 245, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // Render Saved Zones
    zones.forEach((zone) => {
      if (!zone.polygon || zone.polygon.length < 3) return;
      const isSelected = zone.id === selectedZone?.id;
      const hasIntrusion = zone.targetsInside?.some((t) => t.threat);

      ctx.beginPath();
      const first = zone.polygon[0];
      ctx.moveTo(first[0] * width, first[1] * height);
      for (let i = 1; i < zone.polygon.length; i++) {
        const pt = zone.polygon[i];
        ctx.lineTo(pt[0] * width, pt[1] * height);
      }
      ctx.closePath();

      // Translucent Fills
      if (hasIntrusion) {
        ctx.fillStyle = 'rgba(242, 119, 134, 0.18)';
        ctx.strokeStyle = '#F27786';
      } else if (isSelected) {
        ctx.fillStyle = 'rgba(85, 217, 245, 0.14)';
        ctx.strokeStyle = '#55D9F5';
      } else if (zone.type === 'VEHICLE_CONTROL') {
        ctx.fillStyle = 'rgba(231, 184, 92, 0.12)';
        ctx.strokeStyle = '#E7B85C';
      } else {
        ctx.fillStyle = 'rgba(85, 217, 245, 0.06)';
        ctx.strokeStyle = zone.enabled ? 'rgba(85, 217, 245, 0.5)' : '#4B5563';
      }

      ctx.fill();
      ctx.lineWidth = isSelected || hasIntrusion ? 2.5 : 1.5;
      if (!zone.enabled) ctx.setLineDash([5, 4]);
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertices
      zone.polygon.forEach(([px, py]) => {
        ctx.fillStyle = hasIntrusion ? '#F27786' : isSelected ? '#55D9F5' : '#9AA7B8';
        ctx.beginPath();
        ctx.arc(px * width, py * height, isSelected ? 4 : 3, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Name & Status Tag
      ctx.fillStyle = hasIntrusion ? '#F27786' : '#FFFFFF';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText(
        `${zone.name.toUpperCase()} [${hasIntrusion ? '⚠ INTRUSION' : zone.enabled ? 'ACTIVE' : 'DISABLED'}]`,
        first[0] * width + 10,
        first[1] * height + 20
      );
    });

    // Render In-Progress Drawing Points
    if (drawingPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(drawingPoints[0][0] * width, drawingPoints[0][1] * height);
      for (let i = 1; i < drawingPoints.length; i++) {
        ctx.lineTo(drawingPoints[i][0] * width, drawingPoints[i][1] * height);
      }
      ctx.strokeStyle = '#E7B85C';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      drawingPoints.forEach(([px, py], idx) => {
        ctx.fillStyle = '#E7B85C';
        ctx.beginPath();
        ctx.arc(px * width, py * height, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`P${idx + 1}`, px * width + 8, py * height - 4);
      });
    }

    // Render Thermal Target Markers on Map
    if (showTargets) {
      const targets = [
        { track_id: 31, cls: 'Person With Bag', x: 0.68, y: 0.66, threat: true },
        { track_id: 18, cls: 'Vehicle', x: 0.43, y: 0.52, threat: true },
        { track_id: 24, cls: 'Person', x: 0.22, y: 0.36, threat: false },
        { track_id: 7, cls: 'Drone', x: 0.76, y: 0.22, threat: false },
      ];

      targets.forEach((t) => {
        const tx = t.x * width;
        const ty = t.y * height;

        // Breadcrumb Trail
        if (showTrajectories) {
          ctx.strokeStyle = t.threat ? 'rgba(242, 119, 134, 0.4)' : 'rgba(85, 217, 245, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(tx - 24, ty + 18);
          ctx.lineTo(tx - 12, ty + 9);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }

        // Marker Point
        ctx.fillStyle = t.threat ? '#F27786' : '#55D9F5';
        ctx.beginPath();
        ctx.arc(tx, ty, 6, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(`T-${t.track_id != null ? t.track_id.toString().padStart(3, '0') : '000'} (${t.cls})`, tx + 10, ty + 4);
      });
    }

    // Render Camera Marker
    if (showCameras) {
      const cx = 0.08 * width;
      const cy = 0.08 * height;
      ctx.fillStyle = '#55D9F5';
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#05080D';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('CAM', cx - 8, cy + 3);

      ctx.fillStyle = '#55D9F5';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText('CAM-01 [FLIR LWIR]', cx + 12, cy + 4);
    }
  }, [zones, selectedZone, drawingPoints, showTargets, showGrid, showCameras, showTrajectories]);

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
              <Map className="w-5 h-5 text-[var(--thermal-cyan)] shrink-0" />
              RESTRICTED ZONES
            </h1>

            {/* Status Badge */}
            <div className="flex items-center space-x-2 bg-[#08121E] px-3.5 py-1 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--operational-green)]">
              <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]" />
              <span className="font-semibold tracking-wide">ZONE MONITORING ACTIVE</span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            Define and monitor intelligent surveillance boundaries
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>

          <button
            onClick={fetchZones}
            className="p-1.5 rounded-xl btn-secondary-interactive text-xs cursor-pointer"
            title="Refresh zones"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. COMPACT ZONE SUMMARY KPI STRIP                        */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 w-full max-w-full min-w-0">
        {/* TOTAL ZONES */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">TOTAL GEOFENCES</div>
          <div className="text-2xl font-extrabold font-mono text-[var(--text-primary)]">
            {totalZonesCount.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--thermal-cyan)] font-sans">Polygon Boundaries</div>
        </Card>

        {/* ACTIVE ARMED */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">ACTIVE ZONES</div>
          <div className="text-2xl font-extrabold font-mono text-[var(--operational-green)]">
            {activeZonesCount.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Rule Enforcement On</div>
        </Card>

        {/* TARGETS INSIDE */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">TARGETS INSIDE</div>
          <div className="text-2xl font-extrabold font-mono text-[var(--intelligence-violet)]">
            {totalTargetsInside.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Under Inspection</div>
        </Card>

        {/* ACTIVE INTRUSIONS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#12080A] border-[var(--threat-coral)]/30">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--threat-coral)] tracking-wider font-semibold">
            <span>ACTIVE INTRUSIONS</span>
            <span className="w-2 h-2 rounded-full bg-[var(--threat-coral)] pulse-threat shadow-[0_0_8px_var(--threat-coral)]" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-[var(--threat-coral)]">
            {totalIntrusions.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Immediate Breach Alert</div>
        </Card>
      </div>

      {/* ======================================================== */}
      {/* 3. MAIN TRI-PANEL GEOFENCING WORKSTATION                 */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full max-w-full min-w-0 items-start">
        {/* ======================================================== */}
        {/* LEFT COLUMN: ZONE DIRECTORY (3.5 COLS - ~30%)            */}
        {/* ======================================================== */}
        <div className="lg:col-span-4 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-4 space-y-3.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center space-x-2 min-w-0">
                <Map className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  ARMED GEOFENCES ({filteredZones.length})
                </h3>
              </div>

              <button
                onClick={handleStartDrawing}
                disabled={isDrawingMode}
                className="px-3 py-1.5 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center space-x-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>DRAW ZONE</span>
              </button>
            </div>

            {/* Search & Filters */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)]">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <input
                  type="text"
                  placeholder="Search geofences..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none font-sans"
                />
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-2.5 py-1 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer flex-1"
                >
                  <option value="ALL">All Types</option>
                  <option value="RESTRICTED">Restricted</option>
                  <option value="MONITORING">Monitoring</option>
                  <option value="PERIMETER">Perimeter</option>
                  <option value="VEHICLE_CONTROL">Vehicle Control</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-2.5 py-1 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer flex-1"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active Armed</option>
                  <option value="DISABLED">Disabled</option>
                  <option value="INTRUSION">Intrusions Only</option>
                </select>
              </div>
            </div>

            {/* Zone List */}
            <div data-lenis-prevent className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredZones.length === 0 ? (
                <div className="text-center py-10 text-xs font-mono text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl">
                  No geofences match filter.
                </div>
              ) : (
                filteredZones.map((zone) => {
                  const isSelected = selectedZone?.id === zone.id;
                  const hasIntrusion = zone.targetsInside?.some((t) => t.threat);

                  return (
                    <motion.div
                      key={zone.id}
                      onClick={() => setActiveZoneId(zone.id)}
                      whileHover={{ x: 2 }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                        isSelected
                          ? hasIntrusion
                            ? 'bg-[#1D0A0F] border-[var(--threat-coral)] shadow-md shadow-[var(--threat-coral)]/20'
                            : 'bg-[#0A1422] border-[var(--thermal-cyan)] shadow-md'
                          : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[var(--text-primary)] font-sans truncate">{zone.name}</span>
                        <Badge variant={hasIntrusion ? 'red' : zone.enabled ? 'emerald' : 'slate'}>
                          {hasIntrusion ? '⚠ Intrusion' : zone.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[var(--text-secondary)]">
                        <div className="p-1.5 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[var(--text-muted)]">TYPE: </span>
                          <span>{zone.type}</span>
                        </div>
                        <div className="p-1.5 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[var(--text-muted)]">INSIDE: </span>
                          <span className={hasIntrusion ? 'text-[var(--threat-coral)] font-bold' : ''}>
                            {zone.targetsInside?.length || 0} Target(s)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[11px] font-sans">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleEnable(zone);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                            zone.enabled
                              ? 'text-[var(--warning-amber)] hover:bg-[var(--warning-amber)]/10'
                              : 'text-[var(--operational-green)] hover:bg-[var(--operational-green)]/10'
                          }`}
                        >
                          {zone.enabled ? 'Deactivate' : 'Arm Zone'}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteZone(zone.id);
                          }}
                          className="text-[var(--threat-coral)] hover:bg-[var(--threat-coral)]/10 px-2 py-0.5 rounded text-[10px] font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* ======================================================== */}
        {/* CENTER COLUMN: GEOFENCE SURVEILLANCE CANVAS (4.5 COLS)   */}
        {/* ======================================================== */}
        <div className="lg:col-span-5 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-4 space-y-3 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] relative">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center space-x-2 min-w-0">
                <Crosshair className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  SURVEILLANCE GEOFENCE CANVAS
                </h3>
              </div>

              {/* Drawing Mode Banner / Controls */}
              {isDrawingMode ? (
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-mono text-[var(--warning-amber)] animate-pulse">
                    DRAWING ({drawingPoints.length} vertices)
                  </span>
                  <button
                    onClick={handleCompleteDrawing}
                    disabled={drawingPoints.length < 3}
                    className="px-2.5 py-1 rounded-lg bg-[var(--operational-green)] text-[#05080D] text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                  >
                    Save Polygon
                  </button>
                  <button
                    onClick={handleCancelDrawing}
                    className="px-2.5 py-1 rounded-lg btn-secondary-interactive text-[11px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 text-xs">
                  <button
                    onClick={() => setShowTargets(!showTargets)}
                    className={`p-1.5 rounded-lg border text-[10px] font-mono cursor-pointer transition-all ${
                      showTargets
                        ? 'bg-[var(--thermal-cyan)]/15 border-[var(--thermal-cyan)]/30 text-[var(--thermal-cyan)]'
                        : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                    }`}
                    title="Toggle Targets"
                  >
                    TARGETS
                  </button>
                  <button
                    onClick={() => setShowTrajectories(!showTrajectories)}
                    className={`p-1.5 rounded-lg border text-[10px] font-mono cursor-pointer transition-all ${
                      showTrajectories
                        ? 'bg-[var(--thermal-cyan)]/15 border-[var(--thermal-cyan)]/30 text-[var(--thermal-cyan)]'
                        : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                    }`}
                    title="Toggle Trails"
                  >
                    TRAILS
                  </button>
                  <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={`p-1.5 rounded-lg border text-[10px] font-mono cursor-pointer transition-all ${
                      showGrid
                        ? 'bg-[var(--thermal-cyan)]/15 border-[var(--thermal-cyan)]/30 text-[var(--thermal-cyan)]'
                        : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                    }`}
                    title="Toggle Grid"
                  >
                    GRID
                  </button>
                </div>
              )}
            </div>

            {/* Interactive Canvas Viewport */}
            <div className="relative rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[#05080D]">
              <canvas
                ref={canvasRef}
                width={800}
                height={500}
                onClick={handleCanvasClick}
                className={`w-full h-auto block ${isDrawingMode ? 'cursor-crosshair' : 'cursor-default'}`}
              />

              {isDrawingMode && (
                <div className="absolute bottom-3 left-3 bg-[#05080D]/90 backdrop-blur px-3 py-1.5 rounded-xl text-xs font-mono text-[var(--warning-amber)] border border-[var(--warning-amber)]/30">
                  Click canvas to place boundary coordinates (min 3 points required)
                </div>
              )}
            </div>

            {/* Canvas Telemetry Strip */}
            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-[var(--text-secondary)] pt-1">
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] flex justify-between">
                <span>ACTIVE ZONE:</span>
                <span className="text-[var(--thermal-cyan)] font-semibold truncate max-w-[100px]">
                  {selectedZone?.name || 'NONE'}
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] flex justify-between">
                <span>INTRUSION ALERTS:</span>
                <span className="text-[var(--threat-coral)] font-semibold">{totalIntrusions} DETECTED</span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] flex justify-between">
                <span>COORDINATES:</span>
                <span className="text-[var(--operational-green)] font-semibold">[0.0 - 1.0] NORMALIZED</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: ZONE INSPECTOR & RULES MATRIX (3.5 COLS)   */}
        {/* ======================================================== */}
        <div className="lg:col-span-3 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-4 sm:p-5 space-y-4 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] sticky top-20">
            {/* Inspector Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-2 min-w-0">
                <Shield className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  ZONE INSPECTOR
                </h3>
              </div>
              {selectedZone && (
                <Badge variant={selectedZone.targetsInside?.some((t) => t.threat) ? 'red' : 'emerald'}>
                  {selectedZone.targetsInside?.some((t) => t.threat) ? '⚠ INTRUSION' : 'ACTIVE'}
                </Badge>
              )}
            </div>

            {selectedZone ? (
              <div className="space-y-3.5 font-sans text-xs">
                {/* Primary Overview Box */}
                <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-2xl border border-[var(--border-subtle)] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">Geofence Name:</span>
                    <span className="font-bold text-[var(--text-primary)]">{selectedZone.name}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">Zone Type:</span>
                    <span className="text-[var(--thermal-cyan)] font-mono font-semibold">{selectedZone.type}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">Alarm Severity:</span>
                    <SeverityIndicator level={selectedZone.severity} />
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">Speed Limit:</span>
                    <span className="font-mono text-[var(--warning-amber)]">{selectedZone.speedLimit || 40} km/h</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">Vertices:</span>
                    <span className="font-mono text-[var(--text-secondary)]">{selectedZone.polygon?.length || 0} Points</span>
                  </div>
                </div>

                {/* Monitored Object Classes (5 Project Classes) */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    MONITORED OBJECT CLASSES
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] font-sans">
                    {['Person', 'Vehicle', 'Animal', 'Drone', 'Person With Bag'].map((cls) => {
                      const isMonitored = selectedZone.monitoredClasses?.includes(cls);
                      return (
                        <div
                          key={cls}
                          className={`p-2 rounded-lg border flex items-center justify-between ${
                            isMonitored
                              ? 'bg-[var(--bg-surface-secondary)] border-[var(--thermal-cyan)]/30 text-[var(--text-primary)]'
                              : 'bg-[var(--bg-surface-secondary)]/50 border-[var(--border-subtle)] text-[var(--text-muted)] opacity-60'
                          }`}
                        >
                          <span className="truncate">{cls}</span>
                          <span className={`text-[10px] font-mono ${isMonitored ? 'text-[var(--operational-green)]' : ''}`}>
                            {isMonitored ? '✓' : '○'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Targets Inside Geofence */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider flex justify-between">
                    <span>TARGETS CURRENTLY INSIDE</span>
                    <span className="text-[var(--thermal-cyan)]">{selectedZone.targetsInside?.length || 0}</span>
                  </div>

                  {selectedZone.targetsInside?.length === 0 ? (
                    <div className="text-center py-4 text-xs font-mono text-[var(--text-muted)] italic">
                      No targets inside boundary.
                    </div>
                  ) : (
                    selectedZone.targetsInside?.map((t) => (
                      <div
                        key={t.track_id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          t.threat
                            ? 'bg-[#1E0B10] border-[var(--threat-coral)] text-[var(--threat-coral)]'
                            : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--text-primary)]'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold">#{t.track_id}</span>
                          <span>{t.class}</span>
                        </div>
                        <span className="text-[10px] font-mono">{t.speed.toFixed(1)} km/h</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Zone Event History Timeline */}
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    GEOFENCE EVENT TIMELINE
                  </div>

                  <div data-lenis-prevent className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {selectedZone.history?.map((h, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] space-y-0.5 text-xs font-sans"
                      >
                        <div className="text-[10px] font-mono text-[var(--text-muted)]">{h.time}</div>
                        <div className={`text-[11px] ${h.threat ? 'text-[var(--threat-coral)] font-semibold' : 'text-[var(--text-secondary)]'}`}>
                          {h.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-xs font-mono text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl">
                SELECT A GEOFENCE TO INSPECT
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. CREATE GEOFENCE MODAL / DRAWER                        */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="bg-[#070B12] border border-[var(--border-subtle)] rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 font-sans text-xs"
            >
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center space-x-2">
                  <Plus className="w-4 h-4 text-[var(--thermal-cyan)]" />
                  <h3 className="text-sm font-bold uppercase text-[var(--text-primary)]">
                    Configure New Surveillance Geofence
                  </h3>
                </div>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-[var(--text-muted)] hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-[var(--text-muted)]">GEOFENCE NAME</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[var(--text-muted)]">ZONE TYPE</label>
                    <select
                      value={formType}
                      onChange={(e: any) => setFormType(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
                    >
                      <option value="RESTRICTED">Restricted (No Entry)</option>
                      <option value="PERIMETER">Perimeter Boundary</option>
                      <option value="MONITORING">Monitoring Buffer</option>
                      <option value="VEHICLE_CONTROL">Vehicle Control</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[var(--text-muted)]">ALARM SEVERITY</label>
                    <select
                      value={formSeverity}
                      onChange={(e: any) => setFormSeverity(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
                    >
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-[var(--text-muted)]">SPEED LIMIT THRESHOLD (KM/H)</label>
                  <input
                    type="number"
                    value={formSpeedLimit}
                    onChange={(e) => setFormSpeedLimit(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)]"
                  />
                </div>

                <div className="space-y-1 pt-1">
                  <label className="text-[10px] font-mono text-[var(--text-muted)]">MONITORED OBJECTS</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Person', 'Vehicle', 'Animal', 'Drone', 'Person With Bag'].map((cls) => {
                      const isSelected = formClasses.includes(cls);
                      return (
                        <button
                          key={cls}
                          type="button"
                          onClick={() => {
                            if (isSelected) setFormClasses(formClasses.filter((c) => c !== cls));
                            else setFormClasses([...formClasses, cls]);
                          }}
                          className={`p-2 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-[var(--thermal-cyan)]/15 border-[var(--thermal-cyan)]/40 text-[var(--text-primary)]'
                              : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                          }`}
                        >
                          <span>{cls}</span>
                          <span className="font-mono text-xs">{isSelected ? '✓' : '+'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl btn-secondary-interactive cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveZone}
                  className="px-4 py-2 rounded-xl btn-primary-interactive font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>ARM GEOFENCE</span>
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
            className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border ${
              toastMessage.isThreat
                ? 'bg-[#1E0B10] border-[var(--threat-coral)]/60 text-[var(--threat-coral)]'
                : 'bg-[#0A121E] border-[var(--operational-green)]/50 text-[var(--text-primary)]'
            } flex items-center space-x-3 font-sans text-xs`}
          >
            {toastMessage.isThreat ? (
              <AlertTriangle className="w-4 h-4 text-[var(--threat-coral)] shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[var(--operational-green)] shrink-0" />
            )}
            <div>
              <div className={`font-bold text-xs ${toastMessage.isThreat ? 'text-[var(--threat-coral)]' : ''}`}>{toastMessage.title}</div>
              <div className="text-[10px] font-mono text-[var(--text-secondary)]">{toastMessage.time}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RestrictedZones;
