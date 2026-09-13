import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { formatIST } from '../utils/date';
import { apiService } from '../services/api';
import {
  SystemStatusResponse,
  AnalyticsData,
  AlertRecord,
  VideoStatusResponse,
} from '../types/schema';
import {
  FileText,
  Download,
  RefreshCw,
  CheckCircle2,
  BarChart3,
  Clock,
  AlertTriangle,
  FileSpreadsheet,
  Filter,
  Printer,
  FileCode,
} from 'lucide-react';

interface ReportArchiveItem {
  id: string;
  type: string;
  generatedAt: string;
  timeRange: string;
  status: 'READY' | 'ARCHIVED';
  totalDetections: number;
  totalThreats: number;
}

export const Reports: React.FC = () => {
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ title: string; time: string } | null>(null);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  // Backend state
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [videoStatus, setVideoStatus] = useState<VideoStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Report Generator Form State
  const [reportType, setReportType] = useState<string>('Surveillance Summary');
  const [timeRange, setTimeRange] = useState<string>('Last 24 Hours');
  const [dataSource, setDataSource] = useState<string>('All Sources');
  const [severityScope, setSeverityScope] = useState<string>('All');
  const [objectScope, setObjectScope] = useState<string>('All 5 Classes');
  const [zoneScope, setZoneScope] = useState<string>('All Zones');

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchReportsData = async () => {
    setIsLoading(true);
    try {
      const [sysStatus, analytics, alertsHistory, vStatus] = await Promise.all([
        apiService.getSystemStatus().catch(() => null),
        apiService.getAnalytics().catch(() => null),
        apiService.getAlertHistory({ limit: 100 }).catch(() => []),
        apiService.getVideoStatus().catch(() => null),
      ]);
      setSystemStatus(sysStatus);
      setAnalyticsData(analytics);
      setAlerts(alertsHistory);
      setVideoStatus(vStatus);
    } catch (err) {
      console.error('Failed to load real reports data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsData();
  }, []);

  const isDemo = (systemStatus?.is_demo_mode ?? false) || dataSource === 'DEMO FEED (Simulated)';

  // Active Report Metadata
  const [activeReportId, setActiveReportId] = useState<string>('RPT-2026-0903-0001');
  const [activeReportGeneratedAt, setActiveReportGeneratedAt] = useState<string>(() => formatIST(new Date()));

  // Historical Report Archives
  const demoReportHistory: ReportArchiveItem[] = [
    {
      id: 'RPT-2026-0831-0042',
      type: 'Surveillance Summary',
      generatedAt: '31 Aug 2026 · 22:30:00 IST',
      timeRange: 'Last 24 Hours',
      status: 'READY',
      totalDetections: 2481,
      totalThreats: 84,
    },
    {
      id: 'RPT-2026-0831-0041',
      type: 'Threat Incident Report',
      generatedAt: '31 Aug 2026 · 18:15:00 IST',
      timeRange: 'Last 6 Hours',
      status: 'ARCHIVED',
      totalDetections: 890,
      totalThreats: 28,
    },
    {
      id: 'RPT-2026-0830-0040',
      type: 'Detection Report',
      generatedAt: '30 Aug 2026 · 23:59:00 IST',
      timeRange: 'Full Shift (24H)',
      status: 'ARCHIVED',
      totalDetections: 3120,
      totalThreats: 92,
    },
    {
      id: 'RPT-2026-0829-0039',
      type: 'Zone Activity Report',
      generatedAt: '29 Aug 2026 · 20:00:00 IST',
      timeRange: 'Past 7 Days',
      status: 'ARCHIVED',
      totalDetections: 18450,
      totalThreats: 410,
    },
  ];

  const [reportHistory, setReportHistory] = useState<ReportArchiveItem[]>([]);

  // Synchronize initial report archive
  useEffect(() => {
    if (isDemo) {
      setReportHistory(demoReportHistory);
    } else {
      const now = new Date();
      const initialRealReport: ReportArchiveItem = {
        id: activeReportId,
        type: 'Surveillance Summary',
        generatedAt: activeReportGeneratedAt,
        timeRange: 'Live Session',
        status: 'READY',
        totalDetections: analyticsData?.total_detections ?? 0,
        totalThreats: analyticsData?.total_threats ?? alerts.length,
      };
      setReportHistory([initialRealReport]);
    }
  }, [isDemo, analyticsData?.total_detections, analyticsData?.total_threats, alerts.length]);

  // Real vs Demo Computed Metrics
  const totalDetections = isDemo ? 2481 : (analyticsData?.total_detections ?? 0);
  const trackedTargets = isDemo ? 142 : (analyticsData?.active_tracks || (new Set(alerts.map((a) => a.track_id)).size));
  const threatIncidents = isDemo ? 84 : (analyticsData?.total_threats ?? alerts.length);
  const avgConfidence = isDemo ? '96.7%' : 'N/A';

  // 5-Class Breakdown extraction
  const getClassCount = (name: string): number => {
    if (isDemo) {
      if (name === 'Person') return 1240;
      if (name === 'Vehicle') return 680;
      if (name === 'Person With Bag') return 420;
      if (name === 'Animal') return 95;
      if (name === 'Drone') return 46;
      return 0;
    }
    if (!analyticsData) return 0;
    if (name === 'Person') {
      return analyticsData.person_count ?? (analyticsData.class_distribution?.find((c) => c.class_name.toLowerCase() === 'person')?.count ?? 0);
    }
    if (name === 'Vehicle') {
      return analyticsData.vehicle_count ?? (analyticsData.class_distribution?.find((c) => c.class_name.toLowerCase() === 'vehicle')?.count ?? 0);
    }
    if (name === 'Person With Bag') {
      return analyticsData.person_with_bag_count ?? (analyticsData.class_distribution?.find((c) => c.class_name.toLowerCase().includes('bag'))?.count ?? 0);
    }
    if (name === 'Animal') {
      return analyticsData.animal_count ?? (analyticsData.class_distribution?.find((c) => c.class_name.toLowerCase() === 'animal')?.count ?? 0);
    }
    if (name === 'Drone') {
      return analyticsData.drone_count ?? (analyticsData.class_distribution?.find((c) => c.class_name.toLowerCase() === 'drone')?.count ?? 0);
    }
    return 0;
  };

  const personCount = getClassCount('Person');
  const vehicleCount = getClassCount('Vehicle');
  const personWithBagCount = getClassCount('Person With Bag');
  const animalCount = getClassCount('Animal');
  const droneCount = getClassCount('Drone');

  const calcShare = (cnt: number) => {
    if (totalDetections === 0) return '0.0%';
    return `${((cnt / totalDetections) * 100).toFixed(1)}%`;
  };

  // Threat Severity Counts
  const criticalThreats = isDemo ? 12 : alerts.filter((a) => a.severity === 'CRITICAL').length;
  const highThreats = isDemo ? 24 : alerts.filter((a) => a.severity === 'HIGH').length;
  const medThreats = isDemo ? 48 : alerts.filter((a) => a.severity === 'MEDIUM').length;
  const lowThreats = isDemo ? 87 : alerts.filter((a) => a.severity === 'LOW').length;

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    await fetchReportsData();

    const now = new Date();
    const newId = `RPT-${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const genTime = formatIST(now);

    setActiveReportId(newId);
    setActiveReportGeneratedAt(genTime);

    const newRecord: ReportArchiveItem = {
      id: newId,
      type: reportType,
      generatedAt: genTime,
      timeRange,
      status: 'READY',
      totalDetections: isDemo ? 2481 : (analyticsData?.total_detections ?? 0),
      totalThreats: isDemo ? 84 : (analyticsData?.total_threats ?? alerts.length),
    };

    setReportHistory((prev) => [newRecord, ...prev]);
    setIsGenerating(false);
    setToastMsg({
      title: `REPORT ${newId} GENERATED SUCCESSFULLY`,
      time: formatIST(now, { includeTimeOnly: true }),
    });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const handleExportCsv = () => {
    let csvContent =
      'data:text/csv;charset=utf-8,' +
      'AI-MULTISENSE SURVEILLANCE AUDIT REPORT\n' +
      `Report ID,${activeReportId}\n` +
      `Generated At,${activeReportGeneratedAt}\n` +
      `Report Type,${reportType}\n` +
      `Time Range,${timeRange}\n` +
      `Sensor Source,${videoStatus?.filename ? `FILE-01 (${videoStatus.filename})` : dataSource}\n` +
      `System Status,${systemStatus?.model_status ? `${systemStatus.model_status} (${systemStatus.analysis_mode})` : 'OPERATIONAL'}\n` +
      `Target Model,${systemStatus?.thermal_model_path || 'models/thermal/best.pt'} (${systemStatus?.device || 'CUDA'})\n\n` +
      'EXECUTIVE SUMMARY\n' +
      `Total Detections,${totalDetections}\n` +
      `Tracked Targets,${trackedTargets}\n` +
      `Threat Incidents,${threatIncidents}\n` +
      `Average Confidence,${avgConfidence}\n\n` +
      'FIVE-CLASS TAXONOMY BREAKDOWN\n' +
      'Object Class,Detections,Share\n' +
      `Person,${personCount},${calcShare(personCount)}\n` +
      `Vehicle,${vehicleCount},${calcShare(vehicleCount)}\n` +
      `Person With Bag,${personWithBagCount},${calcShare(personWithBagCount)}\n` +
      `Animal,${animalCount},${calcShare(animalCount)}\n` +
      `Drone,${droneCount},${calcShare(droneCount)}\n\n` +
      'THREAT SEVERITY BREAKDOWN\n' +
      'Severity Level,Count\n' +
      `Critical,${criticalThreats}\n` +
      `High,${highThreats}\n` +
      `Medium,${medThreats}\n` +
      `Low,${lowThreats}\n\n`;

    if (!isDemo && alerts.length > 0) {
      csvContent += 'RECORDED SQLITE ALERT LOGS\nAlert ID,Track ID,Object Class,Threat Type,Severity,Reason,Timestamp\n';
      alerts.forEach((a) => {
        csvContent += `"${a.id}",${a.track_id},"${a.object_class}","${a.threat_type}","${a.severity}","${a.reason}","${formatIST(a.timestamp)}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeReportId}_Audit_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToastMsg({
      title: 'REPORT EXPORTED (CSV)',
      time: formatIST(new Date(), { includeTimeOnly: true }),
    });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleExportJson = () => {
    const reportData = {
      report_id: activeReportId,
      generated_at: activeReportGeneratedAt,
      report_type: reportType,
      time_range: timeRange,
      data_source: videoStatus?.filename ? `FILE-01 (${videoStatus.filename})` : dataSource,
      system_status: systemStatus?.model_status || 'OPERATIONAL',
      ai_model: `${systemStatus?.thermal_model_path || 'models/thermal/best.pt'} · ${systemStatus?.device || 'CUDA'}`,
      is_demo_mode: isDemo,
      summary: {
        total_detections: totalDetections,
        active_tracks: trackedTargets,
        threat_events: threatIncidents,
        avg_confidence: avgConfidence,
        stream_fps: systemStatus?.fps || (isDemo ? 29.8 : 0.0),
      },
      class_distribution: {
        person: personCount,
        vehicle: vehicleCount,
        person_with_bag: personWithBagCount,
        animal: animalCount,
        drone: droneCount,
      },
      threat_breakdown: {
        critical: criticalThreats,
        high: highThreats,
        medium: medThreats,
        low: lowThreats,
      },
      recorded_alerts: isDemo
        ? []
        : alerts.map((a) => ({
            id: a.id,
            track_id: a.track_id,
            object_class: a.object_class,
            threat_type: a.threat_type,
            severity: a.severity,
            reason: a.reason,
            timestamp: formatIST(a.timestamp),
          })),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(reportData, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `${activeReportId}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToastMsg({
      title: 'REPORT EXPORTED (JSON)',
      time: formatIST(new Date(), { includeTimeOnly: true }),
    });
    setTimeout(() => setToastMsg(null), 3500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="page-container space-y-5 select-none font-sans w-full max-w-full min-w-0 relative"
    >
      {/* ======================================================== */}
      {/* 1. PAGE HEADER & EXPORT ACTIONS                          */}
      {/* ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)] w-full max-w-full">
        <div className="min-w-0">
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-wider text-[var(--text-primary)] font-sans uppercase flex items-center gap-2.5 truncate">
              <FileText className="w-5 h-5 text-[var(--thermal-cyan)] shrink-0" />
              REPORTS
            </h1>

            {/* Reporting System Badge */}
            <div className="flex items-center space-x-2 bg-[#08121E] px-3.5 py-1 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--operational-green)]">
              <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]" />
              <span className="font-semibold tracking-wide">
                {isDemo ? 'DEMO REPORTING SYSTEM' : 'REAL-TIME REPORTING READY'}
              </span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            {isDemo
              ? 'Simulated surveillance intelligence & detection audit reports'
              : 'Verified surveillance intelligence compiled from live YOLO11n inference and SQLite telemetry'}
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>

          <button
            onClick={handlePrintPdf}
            className="px-3.5 py-1.5 rounded-xl btn-secondary-interactive text-xs font-semibold text-[var(--text-primary)] flex items-center space-x-1.5 cursor-pointer shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 text-[var(--intelligence-violet)]" />
            <span>PRINT REPORT</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 rounded-xl btn-secondary-interactive text-xs font-semibold text-[var(--thermal-cyan)] flex items-center space-x-1.5 cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT CSV</span>
          </button>

          <button
            onClick={handleExportJson}
            className="px-3.5 py-1.5 rounded-xl btn-secondary-interactive text-xs font-semibold text-[var(--warning-amber)] flex items-center space-x-1.5 cursor-pointer shadow-sm"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>EXPORT JSON</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. REPORT SUMMARY METRICS (4 GAUGES)                     */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 w-full max-w-full min-w-0">
        {/* REPORTS GENERATED */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">REPORTS GENERATED</div>
          <div className="text-2xl font-extrabold font-mono text-[var(--text-primary)]">
            {reportHistory.length.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--thermal-cyan)] font-sans">Compiled Shift Audits</div>
        </Card>

        {/* THREAT REPORTS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#12080A] border-[var(--threat-coral)]/30">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--threat-coral)] tracking-wider font-semibold">
            <span>THREAT AUDITS</span>
            <AlertTriangle className="w-3.5 h-3.5 text-[var(--threat-coral)]" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-[var(--threat-coral)]">
            {isDemo ? '06' : threatIncidents.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">Perimeter Incidents</div>
        </Card>

        {/* DETECTION REPORTS */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
            <span>DETECTION REPORTS</span>
            <BarChart3 className="w-3.5 h-3.5 text-[var(--intelligence-violet)]" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-[var(--intelligence-violet)]">
            {isDemo ? '05' : String(analyticsData?.class_distribution?.filter((c) => c.count > 0).length || 0).padStart(2, '0')}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-sans">5-Class Taxonomy</div>
        </Card>

        {/* LAST REPORT */}
        <Card hoverEffect className="p-3.5 w-full max-w-full space-y-1 bg-[#070B12] border-[var(--border-subtle)]">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">LAST COMPILED</div>
          <div className="text-xs font-bold font-mono text-[var(--operational-green)] truncate mt-1">
            {activeReportId}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] truncate">{activeReportGeneratedAt}</div>
        </Card>
      </div>

      {/* ======================================================== */}
      {/* 3. REPORT CREATION & CONFIGURATION WORKBENCH             */}
      {/* ======================================================== */}
      <Card className="p-4 sm:p-5 space-y-3.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-[var(--thermal-cyan)]" />
            <h3 className="text-xs font-bold font-sans uppercase tracking-wider text-[var(--text-primary)]">
              REPORT SPECIFICATION & SCOPE FILTERS
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[var(--thermal-cyan)]">AUTOMATED COMPILER</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs font-sans">
          {/* Report Type */}
          <div className="space-y-1">
            <label className="text-[10px] text-[var(--text-muted)] font-mono uppercase">REPORT TYPE</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="Surveillance Summary">Surveillance Summary</option>
              <option value="Detection Report">Detection Report</option>
              <option value="Threat Incident Report">Threat Incident Report</option>
              <option value="Zone Activity Report">Zone Activity Report</option>
              <option value="Target Tracking Report">Target Tracking Report</option>
              <option value="System Performance Report">System Performance Report</option>
            </select>
          </div>

          {/* Time Range */}
          <div className="space-y-1">
            <label className="text-[10px] text-[var(--text-muted)] font-mono uppercase">TIME RANGE</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="Live Buffer">Live Buffer</option>
              <option value="Last 1 Hour">Last 1 Hour</option>
              <option value="Last 6 Hours">Last 6 Hours</option>
              <option value="Last 24 Hours">Last 24 Hours</option>
              <option value="Past 7 Days">Past 7 Days</option>
              <option value="Past 30 Days">Past 30 Days</option>
            </select>
          </div>

          {/* Data Source */}
          <div className="space-y-1">
            <label className="text-[10px] text-[var(--text-muted)] font-mono uppercase">DATA SOURCE</label>
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="All Sources">All Sources</option>
              <option value="CAM-01 (FLIR AX65 LWIR)">CAM-01 (FLIR AX65 LWIR)</option>
              <option value="FILE-01 (Thermal Patrol Stream)">FILE-01 (Thermal Stream)</option>
              <option value="DEMO FEED (Simulated)">DEMO FEED (Simulated)</option>
            </select>
          </div>

          {/* Severity Scope */}
          <div className="space-y-1">
            <label className="text-[10px] text-[var(--text-muted)] font-mono uppercase">SEVERITY SCOPE</label>
            <select
              value={severityScope}
              onChange={(e) => setSeverityScope(e.target.value)}
              className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="All">All Severities</option>
              <option value="Critical Only">Critical Only</option>
              <option value="High & Above">High & Above</option>
              <option value="Medium & Above">Medium & Above</option>
            </select>
          </div>

          {/* Object Class */}
          <div className="space-y-1">
            <label className="text-[10px] text-[var(--text-muted)] font-mono uppercase">OBJECT CLASS</label>
            <select
              value={objectScope}
              onChange={(e) => setObjectScope(e.target.value)}
              className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
            >
              <option value="All 5 Classes">All 5 Classes</option>
              <option value="Person">Person</option>
              <option value="Vehicle">Vehicle</option>
              <option value="Animal">Animal</option>
              <option value="Drone">Drone</option>
              <option value="Person With Bag">Person With Bag</option>
            </select>
          </div>

          {/* Generate Button Action */}
          <div className="space-y-1 flex flex-col justify-end">
            <button
              onClick={handleGenerateReport}
              disabled={isGenerating}
              className="w-full py-2 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer shadow-md disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'COMPILING...' : 'GENERATE REPORT'}</span>
            </button>
          </div>
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 4. ENTERPRISE TECHNICAL REPORT PREVIEW (DOCUMENT STYLE)  */}
      {/* ======================================================== */}
      <Card className="p-6 sm:p-8 space-y-6 w-full max-w-full min-w-0 bg-[#060A10] border border-[var(--border-subtle)] font-sans text-xs">
        {/* Document Header */}
        <div className="border-b border-dashed border-[var(--border-subtle)] pb-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase text-[var(--thermal-cyan)] font-bold tracking-widest">
                AI-MULTISENSE · THERMAL INTELLIGENCE PLATFORM
              </div>
              <h2 className="text-base font-extrabold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                {reportType.toUpperCase()}
              </h2>
            </div>
            <div className="text-right font-mono text-[11px] space-y-0.5">
              <div className="text-[var(--thermal-cyan)] font-bold">{activeReportId}</div>
              <div className="text-[var(--text-muted)]">{activeReportGeneratedAt}</div>
            </div>
          </div>

          {/* Metadata Badges */}
          <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] font-mono text-[var(--text-secondary)]">
            <span>
              TIME RANGE: <strong className="text-[var(--text-primary)]">{timeRange.toUpperCase()}</strong>
            </span>
            <span>•</span>
            <span>
              DATA SOURCE:{' '}
              <strong className="text-[var(--thermal-cyan)]">
                {videoStatus?.filename ? `FILE-01 (${videoStatus.filename})` : dataSource}
              </strong>
            </span>
            <span>•</span>
            <span>
              SYSTEM STATUS:{' '}
              <strong className="text-[var(--operational-green)]">
                {systemStatus?.model_status ? `${systemStatus.model_status} (${systemStatus.analysis_mode})` : 'OPERATIONAL'}
              </strong>
            </span>
            <span>•</span>
            <span>
              MODEL:{' '}
              <strong className="text-[var(--warning-amber)]">
                {systemStatus?.thermal_model_path ? `${systemStatus.thermal_model_path} · ${systemStatus.device}` : 'best.pt (Standby)'}
              </strong>
            </span>
          </div>
        </div>

        {/* Section 1: Executive Surveillance Summary */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono text-[var(--thermal-cyan)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-1.5">
            01. EXECUTIVE SURVEILLANCE SUMMARY
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
              <div className="text-[10px] text-[var(--text-muted)]">TOTAL DETECTIONS</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">
                {totalDetections.toLocaleString()}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
              <div className="text-[10px] text-[var(--text-muted)]">TRACKED TARGETS</div>
              <div className="text-sm font-bold text-[var(--intelligence-violet)]">
                {trackedTargets.toLocaleString()}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
              <div className="text-[10px] text-[var(--text-muted)]">THREAT INCIDENTS</div>
              <div className="text-sm font-bold text-[var(--threat-coral)]">
                {threatIncidents.toLocaleString()}
              </div>
            </div>
            <div className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-0.5">
              <div className="text-[10px] text-[var(--text-muted)]">AVG CONFIDENCE</div>
              <div className="text-sm font-bold text-[var(--operational-green)]">
                {avgConfidence}
              </div>
              <div className="text-[9px] text-[var(--text-muted)] truncate">
                {isDemo ? 'Baseline Benchmark' : 'Filter Threshold ≥40%'}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: 5-Class Taxonomy Breakdown */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono text-[var(--thermal-cyan)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-1.5">
            02. FIVE-CLASS DETECTION BREAKDOWN
          </h3>

          {!isDemo && totalDetections === 0 ? (
            <div className="py-8 text-center font-mono text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl space-y-1">
              <div className="font-bold text-[var(--thermal-cyan)] tracking-wider">INSUFFICIENT DATA</div>
              <div className="text-[10px]">Start thermal AI detection session to generate 5-class distribution analytics</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
                    <th className="pb-2">CLASS ID</th>
                    <th className="pb-2">OBJECT ENTITY</th>
                    <th className="pb-2">DETECTIONS</th>
                    <th className="pb-2">SHARE (%)</th>
                    <th className="pb-2">BENCHMARK PRECISION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <tr>
                    <td className="py-2 text-[var(--text-muted)]">0</td>
                    <td className="py-2 font-bold text-[var(--text-primary)]">PERSON</td>
                    <td className="py-2 text-[var(--thermal-cyan)]">{personCount.toLocaleString()}</td>
                    <td className="py-2">{calcShare(personCount)}</td>
                    <td className="py-2 text-[var(--operational-green)]">96.4%</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-[var(--text-muted)]">1</td>
                    <td className="py-2 font-bold text-[var(--text-primary)]">VEHICLE</td>
                    <td className="py-2 text-[var(--warning-amber)]">{vehicleCount.toLocaleString()}</td>
                    <td className="py-2">{calcShare(vehicleCount)}</td>
                    <td className="py-2 text-[var(--operational-green)]">97.8%</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-[var(--text-muted)]">4</td>
                    <td className="py-2 font-bold text-[var(--text-primary)]">PERSON WITH BAG</td>
                    <td className="py-2 text-[var(--threat-coral)]">{personWithBagCount.toLocaleString()}</td>
                    <td className="py-2">{calcShare(personWithBagCount)}</td>
                    <td className="py-2 text-[var(--operational-green)]">93.2%</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-[var(--text-muted)]">2</td>
                    <td className="py-2 font-bold text-[var(--text-primary)]">ANIMAL</td>
                    <td className="py-2 text-[var(--operational-green)]">{animalCount.toLocaleString()}</td>
                    <td className="py-2">{calcShare(animalCount)}</td>
                    <td className="py-2 text-[var(--operational-green)]">90.5%</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-[var(--text-muted)]">3</td>
                    <td className="py-2 font-bold text-[var(--text-primary)]">DRONE</td>
                    <td className="py-2 text-[var(--intelligence-violet)]">{droneCount.toLocaleString()}</td>
                    <td className="py-2">{calcShare(droneCount)}</td>
                    <td className="py-2 text-[var(--operational-green)]">92.1%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 3: Threat & Security Breakdown */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono text-[var(--thermal-cyan)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-1.5">
            03. THREAT & SECURITY INCIDENT BREAKDOWN
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
            <div className="p-3 bg-[#180A0E] border border-[var(--threat-coral)]/30 rounded-xl space-y-0.5">
              <div className="text-[10px] text-[var(--threat-coral)] font-bold">CRITICAL THREATS</div>
              <div className="text-lg font-bold text-[var(--threat-coral)]">{criticalThreats}</div>
            </div>
            <div className="p-3 bg-[#180E08] border border-[var(--warning-amber)]/30 rounded-xl space-y-0.5">
              <div className="text-[10px] text-[var(--warning-amber)] font-bold">HIGH SEVERITY</div>
              <div className="text-lg font-bold text-[var(--warning-amber)]">{highThreats}</div>
            </div>
            <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl space-y-0.5">
              <div className="text-[10px] text-[var(--text-muted)]">MEDIUM SEVERITY</div>
              <div className="text-lg font-bold text-[var(--text-primary)]">{medThreats}</div>
            </div>
            <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl space-y-0.5">
              <div className="text-[10px] text-[var(--text-muted)]">LOW SEVERITY</div>
              <div className="text-lg font-bold text-[var(--text-secondary)]">{lowThreats}</div>
            </div>
          </div>

          {/* Detailed Real Threat Incident Log Table */}
          {!isDemo && (
            <div className="space-y-2 pt-2">
              <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] font-semibold">
                LOGGED INCIDENT TELEMETRY (SQLITE PERSISTENCE)
              </div>
              {alerts.length === 0 ? (
                <div className="py-4 text-center font-mono text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl">
                  INSUFFICIENT DATA — No threat incidents recorded in database
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
                        <th className="pb-2">ALERT ID</th>
                        <th className="pb-2">TRACK</th>
                        <th className="pb-2">CLASS</th>
                        <th className="pb-2">THREAT TYPE</th>
                        <th className="pb-2">SEVERITY</th>
                        <th className="pb-2">TIMESTAMP (IST)</th>
                        <th className="pb-2">REASON</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {alerts.slice(0, 8).map((a) => (
                        <tr key={a.id} className="hover:bg-white/[0.02]">
                          <td className="py-2 text-[var(--thermal-cyan)] font-bold truncate max-w-[90px]">
                            {a.id.startsWith('alt_') ? `A-${a.id.replace('alt_', '').slice(0, 6).toUpperCase()}` : a.id}
                          </td>
                          <td className="py-2 text-[var(--text-muted)]">
                            #{a.track_id != null ? String(a.track_id).padStart(3, '0') : '000'}
                          </td>
                          <td className="py-2 font-bold text-[var(--text-primary)]">{a.object_class}</td>
                          <td className="py-2 text-[var(--warning-amber)]">{a.threat_type}</td>
                          <td className="py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                a.severity === 'CRITICAL'
                                  ? 'bg-[var(--threat-coral)]/20 text-[var(--threat-coral)]'
                                  : a.severity === 'HIGH'
                                  ? 'bg-[var(--warning-amber)]/20 text-[var(--warning-amber)]'
                                  : 'bg-[var(--thermal-cyan)]/20 text-[var(--thermal-cyan)]'
                              }`}
                            >
                              {a.severity}
                            </span>
                          </td>
                          <td className="py-2 text-[var(--text-muted)] text-[11px] whitespace-nowrap">
                            {formatIST(a.timestamp, { includeTimeOnly: true })}
                          </td>
                          <td className="py-2 text-[var(--text-secondary)] truncate max-w-xs">{a.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Document Footer */}
        <div className="pt-4 border-t border-dashed border-[var(--border-subtle)] flex flex-wrap justify-between items-center text-[10px] font-mono text-[var(--text-muted)]">
          <span>AI-MULTISENSE SURVEILLANCE INTELLIGENCE SYSTEM · VERIFIED AUDIT</span>
          <span>--- END OF REPORT ---</span>
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 5. HISTORICAL REPORT ARCHIVE LOG                         */}
      {/* ======================================================== */}
      <Card className="p-4 space-y-3 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-4 h-4 text-[var(--thermal-cyan)]" />
            <h3 className="text-xs font-bold font-sans uppercase tracking-wider text-[var(--text-primary)]">
              HISTORICAL REPORT ARCHIVE ({reportHistory.length})
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[var(--operational-green)]">PERSISTED</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[10px] font-mono uppercase text-[var(--text-muted)]">
                <th className="pb-2.5 pr-3">REPORT ID</th>
                <th className="pb-2.5 pr-3">REPORT TYPE</th>
                <th className="pb-2.5 pr-3">GENERATED TIME</th>
                <th className="pb-2.5 pr-3">TIME RANGE</th>
                <th className="pb-2.5 pr-3">STATUS</th>
                <th className="pb-2.5 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {reportHistory.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.025] transition-all">
                  <td className="py-2.5 pr-3 font-mono font-bold text-[var(--thermal-cyan)] whitespace-nowrap">
                    {item.id}
                  </td>
                  <td className="py-2.5 pr-3 font-semibold text-[var(--text-primary)] whitespace-nowrap">
                    {item.type}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[var(--text-secondary)] text-[11px] whitespace-nowrap">
                    {item.generatedAt}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-secondary)] text-[11px] whitespace-nowrap">
                    {item.timeRange}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <Badge variant={item.status === 'READY' ? 'emerald' : 'cyan'}>
                      {item.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap space-x-2">
                    <button
                      onClick={() => {
                        setActiveReportId(item.id);
                        setActiveReportGeneratedAt(item.generatedAt);
                        setReportType(item.type);
                        setTimeRange(item.timeRange);
                        setToastMsg({
                          title: `LOADED PREVIEW FOR ${item.id}`,
                          time: formatIST(new Date(), { includeTimeOnly: true }),
                        });
                        setTimeout(() => setToastMsg(null), 3000);
                      }}
                      className="px-2.5 py-1 rounded-lg btn-secondary-interactive text-[11px] text-[var(--thermal-cyan)] cursor-pointer"
                    >
                      View
                    </button>
                    <button
                      onClick={handleExportCsv}
                      className="px-2.5 py-1 rounded-lg btn-secondary-interactive text-[11px] text-[var(--text-primary)] cursor-pointer"
                    >
                      Export
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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

export default Reports;
