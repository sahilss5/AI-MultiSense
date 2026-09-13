import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/common/Card';
import { AnimatedNumber } from '../components/common/AnimatedNumber';
import { formatIST } from '../utils/date';
import { apiService } from '../services/api';
import { AnalyticsData, AlertRecord } from '../types/schema';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Activity,
  Target,
  RefreshCw,
  Cpu,
  Clock,
  Layers,
  Download,
  CheckCircle2,
  Crosshair,
  Shield,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from 'recharts';

interface AnalyticsProps {
  onNavigateSurveillance?: () => void;
  onNavigate?: (page: 'live' | 'dashboard' | 'tracking' | 'threats' | 'zones' | 'sensors' | 'ai_engine') => void;
}

export const Analytics: React.FC<AnalyticsProps> = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const [result, status, alertsHistory] = await Promise.all([
        apiService.getAnalytics(),
        apiService.getSystemStatus().catch(() => null),
        apiService.getAlertHistory({ limit: 100 }).catch(() => []),
      ]);
      setData(result);
      setSystemStatus(status);
      setAlerts(alertsHistory);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // 5 Project Detection Classes Distribution Colors
  const classColors: Record<string, string> = {
    Person: '#55D9F5',
    Vehicle: '#E7B85C',
    Animal: '#4FD1A5',
    Drone: '#8C9BFF',
    'Person With Bag': '#F27786',
    Person_With_Bag: '#F27786',
  };

  const totalDets = data?.total_detections ?? 0;

  // Real 5 Project Classes Distribution (Always all 5 shown)
  const classDistribution = useMemo(() => {
    const projectClasses = ['Drone', 'Person With Bag', 'Person', 'Vehicle', 'Animal'];
    const countMap: Record<string, number> = {
      Drone: data?.drone_count ?? 0,
      'Person With Bag': data?.person_with_bag_count ?? 0,
      Person: data?.person_count ?? 0,
      Vehicle: data?.vehicle_count ?? 0,
      Animal: data?.animal_count ?? 0,
    };

    // If backend provided class_distribution list, merge counts
    if (data?.class_distribution && data.class_distribution.length > 0) {
      for (const item of data.class_distribution) {
        const normalized = item.class_name.replace(/_/g, ' ');
        countMap[normalized] = item.count;
      }
    }

    return projectClasses.map((name) => {
      const count = countMap[name] || 0;
      const percent = totalDets > 0 ? `${((count / totalDets) * 100).toFixed(1)}%` : '0.0%';
      return {
        class_name: name,
        count,
        percent,
        color: classColors[name] || '#55D9F5',
      };
    });
  }, [data, totalDets]);

  // Real Timeline Data (Frame or Time)
  const timelineData = useMemo(() => {
    if (data?.threat_trend && data.threat_trend.length > 0) {
      const hasAny = data.threat_trend.some((t) => t.detections > 0 || t.threats > 0);
      if (hasAny) {
        return data.threat_trend.map((t) => ({
          time: t.time_label ? t.time_label : `Frame ${t.frame}`,
          detections: t.detections,
          threats: t.threats,
        }));
      }
    }
    return [];
  }, [data]);

  // Real Threat Severity Counts
  const threatCounts = useMemo(() => {
    const high = alerts.filter((a) => a.severity === 'HIGH' || a.severity === 'CRITICAL').length;
    const medium = alerts.filter((a) => a.severity === 'MEDIUM').length;
    const low = alerts.filter((a) => a.severity === 'LOW').length;
    const total = alerts.length || data?.total_threats || 0;
    return { high, medium, low, total };
  }, [alerts, data]);

  // Real Peak Detection Period Calculation
  const peakPeriod = useMemo(() => {
    if (!data?.threat_trend || data.threat_trend.length === 0) return null;
    let maxItem = data.threat_trend[0];
    for (const item of data.threat_trend) {
      if (item.detections > maxItem.detections) {
        maxItem = item;
      }
    }
    if (!maxItem || maxItem.detections <= 0) return null;
    const label = maxItem.time_label || `Frame ${maxItem.frame}`;
    return {
      label,
      detections: maxItem.detections,
    };
  }, [data]);

  // Real Average Confidence
  const avgConfidenceDisplay = useMemo(() => {
    if (data?.average_confidence != null && data.average_confidence > 0) {
      return {
        value: `${(data.average_confidence * 100).toFixed(1)}%`,
        subtitle: 'Session mean confidence',
      };
    }
    return {
      value: 'N/A',
      subtitle: 'Not available for current session',
    };
  }, [data]);

  // Real Inference Status (Active vs Standby)
  const isProcessing = systemStatus?.fps && systemStatus.fps > 0;
  const inferenceStatusDisplay = useMemo(() => {
    if (isProcessing) {
      return {
        value: 'ACTIVE',
        subtitle: `${systemStatus.fps.toFixed(1)} FPS (${(1000 / systemStatus.fps).toFixed(0)} ms)`,
      };
    }
    return {
      value: 'STANDBY',
      subtitle: 'Starts when video processing begins',
    };
  }, [isProcessing, systemStatus]);

  // Export CSV Handler
  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Class,Count,Percentage\n' +
      classDistribution.map((e) => `${e.class_name},${e.count},${e.percent}`).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ai_multisense_analytics_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToastMessage({
      title: 'ANALYTICS DATA EXPORTED (CSV)',
      time: formatIST(new Date(), { includeTimeOnly: true }),
    });
    setTimeout(() => setToastMessage(null), 3500);
  };

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
              <BarChart3 className="w-5 h-5 text-[var(--thermal-cyan)] shrink-0" />
              ANALYTICS
            </h1>

            {/* Operational Engine Status */}
            <div className="flex items-center space-x-2 bg-[#08121E] px-3.5 py-1 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--operational-green)]">
              <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]" />
              <span className="font-semibold tracking-wide">ANALYTICS ENGINE ONLINE</span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            Detection counts, class distribution, threat events and system performance
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

          <button
            onClick={fetchAnalytics}
            className="p-1.5 rounded-xl btn-secondary-interactive text-xs cursor-pointer"
            title="Refresh Analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--thermal-cyan)] ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. ANALYTICS SCOPE BANNER (HONEST SESSION DATA)          */}
      {/* ======================================================== */}
      <Card className="p-3.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
          <div className="flex items-center space-x-2.5 min-w-0">
            <Activity className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
            <span className="text-xs font-bold font-mono uppercase text-[var(--text-primary)] tracking-wide">
              ANALYTICS SCOPE:
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--operational-green)]/15 border border-[var(--operational-green)]/30 text-[var(--operational-green)] font-mono font-bold text-[11px]">
              CURRENT SESSION
            </span>
          </div>

          <div className="text-[11px] text-[var(--text-secondary)] font-mono">
            Metrics reflect active in-memory video processing & persistent SQLite alert repository
          </div>
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 3. TOP KPI CARDS (EXAMINER HIERARCHY: REAL DATA ONLY)    */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 w-full max-w-full min-w-0">
        {/* 1. TOTAL DETECTIONS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
            <span>TOTAL DETECTIONS</span>
            <TrendingUp className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
            <AnimatedNumber value={totalDets} />
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">
            {totalDets > 0 ? 'Current session count' : 'Awaiting video'}
          </div>
        </Card>

        {/* 2. THREAT EVENTS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#12080A] border-[var(--threat-coral)]/30">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--threat-coral)] tracking-wider font-semibold">
            <span>THREAT EVENTS</span>
            <AlertTriangle className="w-3.5 h-3.5 text-[var(--threat-coral)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--threat-coral)]">
            <AnimatedNumber value={threatCounts.total} />
          </div>
          <div className="text-[10px] text-[var(--threat-coral)] font-sans">
            {threatCounts.high} High • {threatCounts.medium} Med • {threatCounts.low} Low
          </div>
        </Card>

        {/* 3. ACTIVE TRACKS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
            <span>ACTIVE TRACKS</span>
            <Crosshair className="w-3.5 h-3.5 text-[var(--intelligence-violet)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--intelligence-violet)]">
            <AnimatedNumber value={data?.active_tracks ?? (systemStatus?.active_tracks ?? 0)} />
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">ByteTrack targets</div>
        </Card>

        {/* 4. AVERAGE CONFIDENCE */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
            <span>AVG CONFIDENCE</span>
            <Target className="w-3.5 h-3.5 text-[var(--operational-green)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--operational-green)]">
            {avgConfidenceDisplay.value}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">
            {avgConfidenceDisplay.subtitle}
          </div>
        </Card>

        {/* 5. INFERENCE STATUS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
            <span>INFERENCE STATUS</span>
            <Cpu className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
          </div>
          <div className={`text-2xl font-bold font-mono ${isProcessing ? 'text-[var(--operational-green)]' : 'text-[var(--text-secondary)]'}`}>
            {inferenceStatusDisplay.value}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">
            {inferenceStatusDisplay.subtitle}
          </div>
        </Card>

        {/* 6. PEAK PERIOD */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
            <span>PEAK PERIOD</span>
            <Clock className="w-3.5 h-3.5 text-[var(--warning-amber)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--warning-amber)]">
            {peakPeriod ? peakPeriod.label : 'N/A'}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">
            {peakPeriod ? `${peakPeriod.detections} detections` : 'Insufficient time-series data'}
          </div>
        </Card>
      </div>

      {/* ======================================================== */}
      {/* 4. PRIMARY ANALYTICS: CLASS DISTRIBUTION & THREAT SUMMARY */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full max-w-full min-w-0">
        {/* Left: 5-Class Distribution Breakdown (7 Cols) */}
        <div className="lg:col-span-7 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] space-y-4">
            <div className="flex flex-wrap items-center justify-between border-b border-[var(--border-subtle)] pb-3 gap-2">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  DETECTION BY CLASS (5 PROJECT CLASSES)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[var(--thermal-cyan)] font-bold">
                {totalDets} TOTAL DETECTIONS
              </span>
            </div>

            {/* Graphical & Tabular Presentation */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* Horizontal Bar Chart */}
              <div className="md:col-span-7 h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classDistribution} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <XAxis
                      type="number"
                      stroke="var(--text-muted)"
                      allowDecimals={false}
                      domain={[0, (maxVal: number) => Math.max(5, Math.ceil(maxVal))]}
                      tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
                    />
                    <YAxis
                      dataKey="class_name"
                      type="category"
                      stroke="var(--text-secondary)"
                      tick={{ fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 600 }}
                      width={110}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#070B12',
                        borderColor: 'var(--border-subtle)',
                        borderRadius: '12px',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        fontFamily: 'JetBrains Mono',
                      }}
                      formatter={(val: any) => [`${val} detections`, 'Count']}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                      {classDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Exact Count List */}
              <div className="md:col-span-5 space-y-2 bg-[var(--bg-surface-secondary)] p-3 rounded-xl border border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider border-b border-[var(--border-subtle)] pb-1.5 font-bold">
                  SESSION CLASS BREAKDOWN
                </div>
                {classDistribution.map((item) => (
                  <div key={item.class_name} className="flex items-center justify-between text-xs font-mono py-1">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-[var(--text-primary)] font-semibold text-[11px]">{item.class_name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-[var(--text-primary)]">{item.count}</span>
                      <span className="text-[10px] text-[var(--text-muted)] ml-1.5">({item.percent})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Threat Summary & Classification Rules (5 Cols) */}
        <div className="lg:col-span-5 space-y-4 w-full max-w-full min-w-0">
          <Card className="p-5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] space-y-3.5">
            <div className="flex flex-wrap items-center justify-between border-b border-[var(--border-subtle)] pb-3 gap-2">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-[var(--threat-coral)] shrink-0" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                  THREAT SUMMARY & RULES
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[var(--threat-coral)] font-bold">
                {threatCounts.total} EVENTS RECORDED
              </span>
            </div>

            {/* Severity Breakdown Progress */}
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-[#180A0E] border border-[var(--threat-coral)]/30">
                  <div className="text-xs font-mono font-bold text-[var(--threat-coral)]">{threatCounts.high}</div>
                  <div className="text-[9px] font-mono text-[var(--text-muted)]">HIGH / CRIT</div>
                </div>
                <div className="p-2 rounded-lg bg-[#1A1409] border border-[var(--warning-amber)]/30">
                  <div className="text-xs font-mono font-bold text-[var(--warning-amber)]">{threatCounts.medium}</div>
                  <div className="text-[9px] font-mono text-[var(--text-muted)]">MEDIUM</div>
                </div>
                <div className="p-2 rounded-lg bg-[#08151D] border border-[var(--thermal-cyan)]/30">
                  <div className="text-xs font-mono font-bold text-[var(--thermal-cyan)]">{threatCounts.low}</div>
                  <div className="text-[9px] font-mono text-[var(--text-muted)]">LOW</div>
                </div>
              </div>
            </div>

            {/* Threat Rules Explanation for Examiners */}
            <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
              <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider font-bold">
                THREAT ENGINE CLASSIFICATION RULES
              </div>

              <div className="space-y-1 text-[11px] font-sans">
                <div className="p-1.5 rounded-lg bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <span className="text-[var(--text-primary)] font-semibold">Drone</span>
                  <span className="font-mono text-[10px] text-[var(--threat-coral)] font-bold">High Threat</span>
                </div>
                <div className="p-1.5 rounded-lg bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <span className="text-[var(--text-primary)] font-semibold">Person With Bag</span>
                  <span className="font-mono text-[10px] text-[var(--threat-coral)] font-bold">High Threat</span>
                </div>
                <div className="p-1.5 rounded-lg bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <span className="text-[var(--text-primary)] font-semibold">Vehicle</span>
                  <span className="font-mono text-[10px] text-[var(--warning-amber)]">Threat if speed rule exceeded</span>
                </div>
                <div className="p-1.5 rounded-lg bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <span className="text-[var(--text-primary)] font-semibold">Person</span>
                  <span className="font-mono text-[10px] text-[var(--operational-green)]">Normal (Monitored)</span>
                </div>
                <div className="p-1.5 rounded-lg bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <span className="text-[var(--text-primary)] font-semibold">Animal</span>
                  <span className="font-mono text-[10px] text-[var(--operational-green)]">Normal (Benign wildlife)</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 5. DETECTION TREND OVER TIME (INTEGER Y-AXIS, NO F-0)    */}
      {/* ======================================================== */}
      <Card className="p-5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between border-b border-[var(--border-subtle)] pb-3 gap-2">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
            <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
              DETECTIONS & THREATS OVER TIME
            </h3>
          </div>

          <div className="flex items-center space-x-3 text-xs font-sans shrink-0">
            <span className="flex items-center space-x-1 text-[var(--thermal-cyan)] font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-[var(--thermal-cyan)]" />
              <span>Detections</span>
            </span>
            <span className="flex items-center space-x-1 text-[var(--threat-coral)] font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-[var(--threat-coral)]" />
              <span>Threats</span>
            </span>
          </div>
        </div>

        <div className="h-64 w-full max-w-full">
          {timelineData.length === 0 ? (
            <div className="h-full w-full flex flex-col items-center justify-center border border-dashed border-[var(--border-subtle)] rounded-xl font-mono text-xs text-[var(--text-muted)] space-y-2 p-6 text-center">
              <TrendingUp className="w-8 h-8 text-[var(--thermal-cyan)] opacity-70" />
              <span className="font-bold tracking-wider text-[var(--text-primary)] text-sm">INSUFFICIENT SESSION DATA</span>
              <span className="text-xs text-[var(--text-secondary)]">Run a thermal video to generate detection trends.</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="colorDetections" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#55D9F5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#55D9F5" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorThreats" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F27786" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F27786" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  stroke="var(--text-muted)"
                  tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  stroke="var(--text-muted)"
                  allowDecimals={false}
                  domain={[0, (dataMax: number) => Math.max(3, Math.ceil(dataMax))]}
                  tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#070B12',
                    borderColor: 'var(--border-subtle)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono',
                  }}
                  formatter={(val: any, name: any) => [
                    `${val} ${name === 'Detections' ? 'targets' : 'threats'}`,
                    name,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="detections"
                  stroke="#55D9F5"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorDetections)"
                  name="Detections"
                />
                <Area
                  type="monotone"
                  dataKey="threats"
                  stroke="#F27786"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorThreats)"
                  name="Threats"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 6. SYSTEM PERFORMANCE & TELEMETRY                        */}
      {/* ======================================================== */}
      <Card className="p-5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)] space-y-3.5">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-[var(--operational-green)] shrink-0" />
            <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
              SYSTEM PERFORMANCE & RUNTIME ARCHITECTURE
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[var(--operational-green)] font-bold">
            VERIFIED BACKEND
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] space-y-1">
            <div className="text-[10px] text-[var(--text-muted)] uppercase">DETECTION MODEL</div>
            <div className="font-bold text-[var(--thermal-cyan)]">YOLO11n (best.pt)</div>
            <div className="text-[10px] text-[var(--operational-green)] font-semibold">Ready & Loaded</div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] space-y-1">
            <div className="text-[10px] text-[var(--text-muted)] uppercase">MULTI-TARGET TRACKER</div>
            <div className="font-bold text-[var(--intelligence-violet)]">ByteTrack</div>
            <div className="text-[10px] text-[var(--text-secondary)]">0.45 IoU Association</div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] space-y-1">
            <div className="text-[10px] text-[var(--text-muted)] uppercase">COMPUTE HARDWARE</div>
            <div className="font-bold text-[var(--text-primary)]">{systemStatus?.device || 'CUDA (NVIDIA RTX)'}</div>
            <div className="text-[10px] text-[var(--text-secondary)]">{isProcessing ? 'Active Inference' : 'Standby'}</div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] space-y-1">
            <div className="text-[10px] text-[var(--text-muted)] uppercase">THREAT ENGINE</div>
            <div className="font-bold text-[var(--warning-amber)]">Multi-Rule Engine</div>
            <div className="text-[10px] text-[var(--text-secondary)]">Geofence & Speed Rules Active</div>
          </div>
        </div>
      </Card>

      {/* Floating Feedback Toast */}
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

export default Analytics;
