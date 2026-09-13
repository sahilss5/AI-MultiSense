import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertRecord, ThreatLevel } from '../types/schema';
import { apiService } from '../services/api';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { SeverityIndicator } from '../components/common/SeverityIndicator';
import { formatIST } from '../utils/date';
import {
  History,
  Search,
  Eye,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Car,
  Plane,
  Briefcase,
  Bird,
  Download,
  Check,
  ArrowUpRight,
  X,
} from 'lucide-react';

export interface EnhancedAlertRecord extends AlertRecord {
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledged_at?: string;
  resolved_at?: string;
  confidence?: number | null;
  rawId?: string;
  timeline?: { time: string; text: string }[];
}

interface AlertHistoryProps {
  onNavigate?: (page: 'live' | 'dashboard' | 'tracking' | 'threats' | 'zones' | 'sensors' | 'ai_engine') => void;
}

export const AlertHistory: React.FC<AlertHistoryProps> = ({ onNavigate }) => {
  const [alerts, setAlerts] = useState<EnhancedAlertRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedAlert, setSelectedAlert] = useState<EnhancedAlertRecord | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [objectFilter, setObjectFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'timestamp_desc' | 'timestamp_asc' | 'severity'>('timestamp_desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Clear modal & feedback
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ title: string; time: string } | null>(null);

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const data = await apiService.getAlertHistory({ limit: 100 });
      if (data && data.length > 0) {
        const mapped: EnhancedAlertRecord[] = data.map((a) => ({
          ...a,
          id: a.id.startsWith('A-') ? a.id : `A-${a.id.replace(/^alt_/, '').toUpperCase()}`,
          rawId: a.id,
          object_class: (a.object_class || 'Target').replace(/_/g, ' '),
          status: (a.status as any) || 'ACTIVE',
          confidence: a.confidence != null ? a.confidence : null,
          timeline: [
            { time: formatIST(a.timestamp, { includeTimeOnly: true }), text: 'Incident acquired by YOLO inference' },
            { time: 'Active', text: a.reason },
          ],
        }));
        setAlerts(mapped);
      } else {
        setAlerts([]);
      }
    } catch (err) {
      console.error('Failed to load alert history:', err);
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  // Filter & Search Pipeline
  const filteredAlerts = useMemo(() => {
    return alerts
      .filter((item) => {
        const q = searchQuery.toLowerCase().trim();
        if (q) {
          const matchId = item.id.toLowerCase().includes(q);
          const matchClass = item.object_class.toLowerCase().includes(q);
          const matchType = item.threat_type.toLowerCase().includes(q);
          const matchReason = item.reason.toLowerCase().includes(q);
          const matchZone = item.zone && item.zone.toLowerCase().includes(q);
          const matchTrack = item.track_id != null ? item.track_id.toString().includes(q) : false;
          if (!matchId && !matchClass && !matchType && !matchReason && !matchZone && !matchTrack) return false;
        }

        if (severityFilter !== 'ALL' && item.severity !== severityFilter) return false;
        if (objectFilter !== 'ALL' && item.object_class.toUpperCase().replace(/\s+/g, '_') !== objectFilter) return false;
        if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
        if (zoneFilter !== 'ALL' && item.zone !== zoneFilter) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'timestamp_desc') {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        } else if (sortBy === 'timestamp_asc') {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        } else if (sortBy === 'severity') {
          const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          return (rank[b.severity] || 0) - (rank[a.severity] || 0);
        }
        return 0;
      });
  }, [alerts, searchQuery, severityFilter, objectFilter, statusFilter, zoneFilter, sortBy]);

  const totalPages = Math.ceil(filteredAlerts.length / pageSize) || 1;
  const paginatedAlerts = filteredAlerts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Summary Metrics
  const totalCount = alerts.length;
  const activeCount = alerts.filter((a) => a.status === 'ACTIVE').length;
  const acknowledgedCount = alerts.filter((a) => a.status === 'ACKNOWLEDGED').length;
  const resolvedCount = alerts.filter((a) => a.status === 'RESOLVED').length;

  const handleClearFilters = () => {
    setSearchQuery('');
    setSeverityFilter('ALL');
    setObjectFilter('ALL');
    setStatusFilter('ALL');
    setZoneFilter('ALL');
    setSortBy('timestamp_desc');
    setCurrentPage(1);
  };

  // Real Database Deletion Handler
  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      const res = await apiService.clearAlertHistory();
      await fetchAlerts();
      setSelectedAlert(null);
      setShowConfirmModal(false);
      setToastMessage({
        title: `ALERT HISTORY CLEARED (${res.deleted_count} DELETED)`,
        time: formatIST(new Date(), { includeTimeOnly: true }),
      });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      console.error('Failed to clear alert history:', err);
      setToastMessage({
        title: 'FAILED TO CLEAR ALERT HISTORY',
        time: formatIST(new Date(), { includeTimeOnly: true }),
      });
      setTimeout(() => setToastMessage(null), 3500);
    } finally {
      setIsClearing(false);
    }
  };

  const handleAcknowledgeAlert = async (id: string) => {
    const ackTime = formatIST(new Date(), { includeTimeOnly: true });
    const target = alerts.find((a) => a.id === id);
    if (target) {
      try {
        await apiService.updateAlertStatus(target.rawId || target.id, 'ACKNOWLEDGED');
      } catch (e) {
        console.error('Failed to persist alert status:', e);
      }
    }
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              status: 'ACKNOWLEDGED' as const,
              acknowledged_at: ackTime,
              timeline: [...(a.timeline || []), { time: ackTime, text: 'Operator acknowledged incident' }],
            }
          : a
      )
    );
    if (selectedAlert?.id === id) {
      setSelectedAlert((prev) => (prev ? { ...prev, status: 'ACKNOWLEDGED', acknowledged_at: ackTime } : null));
    }
    setToastMessage({
      title: 'ALERT INCIDENT ACKNOWLEDGED',
      time: ackTime,
    });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleResolveAlert = async (id: string) => {
    const resTime = formatIST(new Date(), { includeTimeOnly: true });
    const target = alerts.find((a) => a.id === id);
    if (target) {
      try {
        await apiService.updateAlertStatus(target.rawId || target.id, 'RESOLVED');
      } catch (e) {
        console.error('Failed to persist alert status:', e);
      }
    }
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              status: 'RESOLVED' as const,
              resolved_at: resTime,
              timeline: [...(a.timeline || []), { time: resTime, text: 'Alert verified and resolved by operator' }],
            }
          : a
      )
    );
    if (selectedAlert?.id === id) {
      setSelectedAlert((prev) => (prev ? { ...prev, status: 'RESOLVED', resolved_at: resTime } : null));
    }
    setToastMessage({
      title: 'ALERT INCIDENT RESOLVED & ARCHIVED',
      time: resTime,
    });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Alert ID,Timestamp,Severity,Event,Target,Zone,Status,Reason\n' +
      alerts
        .map((a) => `${a.id},${a.timestamp},${a.severity},${a.threat_type},#${a.track_id} ${a.object_class},${a.zone || ''},${a.status},"${a.reason}"`)
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `alert_audit_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToastMessage({
      title: 'SECURITY AUDIT LOG EXPORTED (CSV)',
      time: formatIST(new Date(), { includeTimeOnly: true }),
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="page-container space-y-5 select-none font-sans w-full max-w-full min-w-0 relative"
    >
      {/* ======================================================== */}
      {/* 1. PAGE HEADER & AUDIT ACTIONS                           */}
      {/* ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)] w-full max-w-full">
        <div className="min-w-0">
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-wider text-[var(--text-primary)] font-sans uppercase flex items-center gap-2.5 truncate">
              <History className="w-5 h-5 text-[var(--thermal-cyan)] shrink-0" />
              ALERT HISTORY
            </h1>

            {/* Operational Event Log Badge */}
            <div className="flex items-center space-x-2 bg-[#08121E] px-3.5 py-1 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--operational-green)]">
              <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]" />
              <span className="font-semibold tracking-wide">EVENT LOG ACTIVE</span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            Historical threat events, detections and security incidents
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-1.5 rounded-xl btn-secondary-interactive text-xs font-semibold text-[var(--thermal-cyan)] flex items-center space-x-1.5 cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT CSV</span>
          </button>

          {/* CLEAR HISTORY BUTTON (Primary Action in Header) */}
          <button
            onClick={() => setShowConfirmModal(true)}
            className="px-3.5 py-1.5 rounded-xl border border-[var(--threat-coral)]/40 hover:border-[var(--threat-coral)] text-xs font-semibold text-[var(--threat-coral)] hover:bg-[var(--threat-coral)]/10 flex items-center space-x-1.5 cursor-pointer transition-all shadow-sm"
            title="Clear stored alert history from database"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>CLEAR HISTORY</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. ALERT SUMMARY METRIC STRIP (4 GAUGES)                 */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 w-full max-w-full min-w-0">
        {/* TOTAL ALERTS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">TOTAL LOGGED ALERTS</div>
          <div className="text-2xl font-extrabold font-mono text-[var(--text-primary)]">
            {totalCount.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--thermal-cyan)] font-sans">SQLite Audit Database</div>
        </Card>

        {/* ACTIVE */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#12080A] border-[var(--threat-coral)]/30">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--threat-coral)] tracking-wider font-semibold">
            <span>ACTIVE INCIDENTS</span>
            <span className="w-2 h-2 rounded-full bg-[var(--threat-coral)] pulse-threat shadow-[0_0_8px_var(--threat-coral)]" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-[var(--threat-coral)]">
            {activeCount.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Action Required</div>
        </Card>

        {/* ACKNOWLEDGED */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#120F08] border-[var(--warning-amber)]/30">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--warning-amber)] tracking-wider font-semibold">
            <span>ACKNOWLEDGED</span>
            <span className="w-2 h-2 rounded-full bg-[var(--warning-amber)]" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-[var(--warning-amber)]">
            {acknowledgedCount.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Under Inspection</div>
        </Card>

        {/* RESOLVED */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#081210] border-[var(--operational-green)]/30">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--operational-green)] tracking-wider font-semibold">
            <span>RESOLVED & ARCHIVED</span>
            <span className="w-2 h-2 rounded-full bg-[var(--operational-green)]" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-[var(--operational-green)]">
            {resolvedCount.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Cleared & Verified</div>
        </Card>
      </div>

      {/* ======================================================== */}
      {/* 3. SEARCH & MULTI-CRITERIA FILTER BAR                    */}
      {/* ======================================================== */}
      <Card className="p-3.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
          {/* Search Box */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              placeholder="Search alert ID, target, zone or event..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none font-sans"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[var(--text-muted)] hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-[var(--text-muted)]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="timestamp_desc">Newest First</option>
              <option value="timestamp_asc">Oldest First</option>
              <option value="severity">Highest Severity</option>
            </select>
          </div>
        </div>

        {/* Filter Dropdowns Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            {/* Object Class Filter */}
            <select
              value={objectFilter}
              onChange={(e) => {
                setObjectFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="ALL">All Objects (5)</option>
              <option value="PERSON">Person</option>
              <option value="VEHICLE">Vehicle</option>
              <option value="ANIMAL">Animal</option>
              <option value="DRONE">Drone</option>
              <option value="PERSON_WITH_BAG">Person With Bag</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="RESOLVED">Resolved</option>
            </select>

            <button
              onClick={handleClearFilters}
              className="px-2.5 py-1 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              CLEAR FILTERS
            </button>
          </div>

          <span className="text-[11px] font-mono text-[var(--text-muted)]">
            Matching: <span className="text-[var(--thermal-cyan)] font-bold">{filteredAlerts.length}</span> / {totalCount}
          </span>
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 4. MAIN WORKSPACE: ALERT TABLE (68%) / DRAWER (32%)      */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full max-w-full min-w-0 items-start">
        {/* Left Column: Alert Records Table (68% / 8 Cols) */}
        <div className="lg:col-span-8 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-4 space-y-3 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center space-x-2 min-w-0">
                <History className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  HISTORICAL SECURITY EVENT LOG ({filteredAlerts.length})
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[var(--operational-green)]">SQLITE AUDIT PERSISTED</span>
            </div>

            <div className="table-wrapper overflow-x-auto">
              <table className="w-full text-left text-xs font-sans border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[10px] font-mono uppercase text-[var(--text-muted)]">
                    <th className="pb-2.5 pr-3 font-semibold">ALERT ID</th>
                    <th className="pb-2.5 pr-3 font-semibold">TIME</th>
                    <th className="pb-2.5 pr-3 font-semibold">SEVERITY</th>
                    <th className="pb-2.5 pr-3 font-semibold">OBJECT</th>
                    <th className="pb-2.5 pr-3 font-semibold">EVENT</th>
                    <th className="pb-2.5 pr-3 font-semibold">ZONE</th>
                    <th className="pb-2.5 pr-3 font-semibold">STATUS</th>
                    <th className="pb-2.5 text-right font-semibold">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {paginatedAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-xs font-mono text-[var(--text-muted)] space-y-1.5">
                        <div className="font-bold tracking-wider text-[var(--text-primary)] text-sm">NO ALERT HISTORY</div>
                        <div className="text-xs text-[var(--text-secondary)]">No security events have been recorded in this session.</div>
                      </td>
                    </tr>
                  ) : (
                    paginatedAlerts.map((alert) => {
                      const isSelected = selectedAlert?.id === alert.id;
                      return (
                        <tr
                          key={alert.id}
                          onClick={() => setSelectedAlert(alert)}
                          className={`transition-all cursor-pointer group ${
                            isSelected ? 'bg-[var(--thermal-cyan)]/10 font-medium' : 'hover:bg-white/[0.025]'
                          }`}
                        >
                          <td className="py-3 pr-3 font-mono font-bold text-[var(--thermal-cyan)] whitespace-nowrap">
                            #{alert.id}
                          </td>
                          <td className="py-3 pr-3 font-mono text-[var(--text-secondary)] text-[11px] whitespace-nowrap">
                            {formatIST(alert.timestamp, { includeTimeOnly: true })}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <SeverityIndicator level={alert.severity} />
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <div className="flex items-center space-x-1.5">
                              <span className="p-1 rounded bg-[var(--bg-surface-secondary)] text-[var(--thermal-cyan)]">
                                {getClassIcon(alert.object_class)}
                              </span>
                              <span className="text-[var(--text-secondary)] font-medium">
                                #{alert.track_id} {alert.object_class}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-3 font-semibold text-[var(--text-primary)] max-w-[140px] truncate">
                            {alert.threat_type}
                          </td>
                          <td className="py-3 pr-3 text-[var(--text-secondary)] text-[11px] max-w-[120px] truncate">
                            {alert.zone || '—'}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <Badge
                              variant={
                                alert.status === 'ACTIVE'
                                  ? 'red'
                                  : alert.status === 'ACKNOWLEDGED'
                                  ? 'amber'
                                  : 'emerald'
                              }
                            >
                              {alert.status === 'ACTIVE'
                                ? '● Active'
                                : alert.status === 'ACKNOWLEDGED'
                                ? '◐ Acknowledged'
                                : '✓ Resolved'}
                            </Badge>
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAlert(alert);
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] text-xs font-mono">
                <span className="text-[var(--text-muted)] text-[11px]">
                  Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredAlerts.length)} of{' '}
                  {filteredAlerts.length}
                </span>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg btn-secondary-interactive disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 font-bold text-[var(--thermal-cyan)]">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg btn-secondary-interactive disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Alert Detail Inspector Drawer (32% / 4 Cols) */}
        <div className="lg:col-span-4 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-4 sm:p-5 space-y-4 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] sticky top-20">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-2 min-w-0">
                <Eye className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  INCIDENT INVESTIGATOR
                </h3>
              </div>
              {selectedAlert && (
                <div className="flex items-center space-x-1.5">
                  <span className="font-mono font-bold text-xs text-[var(--thermal-cyan)] bg-[var(--thermal-cyan)]/10 px-2 py-0.5 rounded-full border border-[var(--thermal-cyan)]/25">
                    #{selectedAlert.id}
                  </span>
                  <SeverityIndicator level={selectedAlert.severity} />
                </div>
              )}
            </div>

            {selectedAlert ? (
              <div className="space-y-3.5 font-sans text-xs">
                {/* Event Overview Box */}
                <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-2xl border border-[var(--border-subtle)] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">Event Classification:</span>
                    <span className="font-bold text-[var(--text-primary)] text-right">{selectedAlert.threat_type}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">Target Entity:</span>
                    <span className="font-mono text-[var(--thermal-cyan)] font-semibold flex items-center gap-1">
                      {getClassIcon(selectedAlert.object_class)}
                      <span>#{selectedAlert.track_id} ({selectedAlert.object_class})</span>
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">AI Detection Confidence:</span>
                    <span className="text-[var(--operational-green)] font-mono font-bold">
                      {selectedAlert.confidence != null ? `${(selectedAlert.confidence * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">Perimeter Zone:</span>
                    <span className="text-[var(--text-primary)] font-mono truncate">{selectedAlert.zone || 'Sector Alpha-4'}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">Logged Timestamp:</span>
                    <span className="text-[var(--text-secondary)] font-mono">{formatIST(selectedAlert.timestamp)}</span>
                  </div>
                </div>

                {/* Reason Banner */}
                <div className="p-3 rounded-xl bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/30 text-[var(--threat-coral)] text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>TRIGGER REASON</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--threat-coral)]">{selectedAlert.reason}</p>
                </div>

                {/* Investigation Workflow Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {selectedAlert.status === 'ACTIVE' && (
                    <button
                      onClick={() => handleAcknowledgeAlert(selectedAlert.id)}
                      className="px-3 py-2 rounded-xl bg-[var(--warning-amber)]/15 hover:bg-[var(--warning-amber)]/25 text-[var(--warning-amber)] border border-[var(--warning-amber)]/30 font-semibold text-xs transition-all flex items-center space-x-1.5 cursor-pointer flex-1 justify-center"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>ACKNOWLEDGE</span>
                    </button>
                  )}

                  {selectedAlert.status !== 'RESOLVED' ? (
                    <button
                      onClick={() => handleResolveAlert(selectedAlert.id)}
                      className="px-3 py-2 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center space-x-1.5 cursor-pointer flex-1 justify-center shadow-md"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>RESOLVE ALERT</span>
                    </button>
                  ) : (
                    <div className="w-full p-2 bg-[var(--operational-green)]/15 border border-[var(--operational-green)]/30 rounded-xl text-[var(--operational-green)] text-center text-xs font-bold font-mono">
                      ✓ RESOLVED ({selectedAlert.resolved_at || 'ARCHIVED'})
                    </div>
                  )}
                </div>

                {/* Cross-Module Navigation Links */}
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                  <button
                    onClick={() => (onNavigate ? onNavigate('live') : undefined)}
                    className="w-full py-2 rounded-xl btn-secondary-interactive text-xs font-medium flex items-center justify-between px-3 cursor-pointer"
                  >
                    <span>VIEW LIVE SURVEILLANCE FEED</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
                  </button>

                  <button
                    onClick={() => (onNavigate ? onNavigate('tracking') : undefined)}
                    className="w-full py-2 rounded-xl btn-secondary-interactive text-xs font-medium flex items-center justify-between px-3 cursor-pointer"
                  >
                    <span>INSPECT TARGET #{selectedAlert.track_id}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
                  </button>

                  <button
                    onClick={() => (onNavigate ? onNavigate('zones') : undefined)}
                    className="w-full py-2 rounded-xl btn-secondary-interactive text-xs font-medium flex items-center justify-between px-3 cursor-pointer"
                  >
                    <span>VIEW GEOFENCE PERIMETER</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
                  </button>
                </div>

                {/* Incident Timeline */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider flex justify-between">
                    <span>INCIDENT AUDIT TIMELINE</span>
                    <span className="text-[var(--thermal-cyan)]">SQLITE LOG</span>
                  </div>

                  <div data-lenis-prevent className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {(selectedAlert.timeline || [
                      { time: formatIST(selectedAlert.timestamp, { includeTimeOnly: true }), text: selectedAlert.reason },
                    ]).map((h, i) => (
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
              <div className="text-center py-12 text-xs font-mono text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl">
                SELECT AN ALERT RECORD TO INSPECT
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 5. DATABASE STORAGE & CLEAR-HISTORY INFORMATION BAR       */}
      {/* ======================================================== */}
      <Card className="p-3.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
          <div className="flex items-center space-x-2.5 min-w-0">
            <History className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
            <span className="text-xs font-bold font-mono uppercase text-[var(--text-primary)] tracking-wide">
              ALERT HISTORY:
            </span>
            <span className="text-[11px] text-[var(--text-secondary)]">
              Stored security alerts can be permanently cleared from the local database.
            </span>
          </div>

          <button
            onClick={() => setShowConfirmModal(true)}
            className="px-3 py-1.5 rounded-xl border border-[var(--threat-coral)]/40 hover:border-[var(--threat-coral)] text-xs font-semibold text-[var(--threat-coral)] hover:bg-[var(--threat-coral)]/10 flex items-center space-x-1.5 cursor-pointer transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>CLEAR HISTORY</span>
          </button>
        </div>
      </Card>

      {/* ======================================================== */}
      {/* CLEAR ALERT HISTORY CONFIRMATION MODAL                   */}
      {/* ======================================================== */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-md bg-[#0A1018] border border-[var(--threat-coral)]/40 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 font-sans text-xs"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-[var(--threat-coral)]/15 text-[var(--threat-coral)] shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                    CLEAR ALERT HISTORY?
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Permanent SQLite database action
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs leading-relaxed space-y-2">
                <p>
                  This will <span className="text-[var(--threat-coral)] font-semibold">permanently remove all stored alert records</span>.
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Active detection and AI processing will not be affected.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isClearing}
                  className="px-4 py-2 rounded-xl btn-secondary-interactive text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleClearHistory}
                  disabled={isClearing}
                  className="px-4 py-2 rounded-xl bg-[var(--threat-coral)] hover:bg-[var(--threat-coral)]/90 text-white text-xs font-bold font-mono tracking-wide flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-[var(--threat-coral)]/20 transition-all disabled:opacity-50"
                >
                  {isClearing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>CLEARING...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>CLEAR HISTORY</span>
                    </>
                  )}
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

export default AlertHistory;
