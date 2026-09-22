import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageId, Sidebar } from './components/common/Sidebar';
import { Header } from './components/common/Header';
import { LoadingScreen } from './components/common/LoadingScreen';
import { KeyboardShortcutsModal } from './components/common/KeyboardShortcutsModal';
import { LandingPage } from './pages/LandingPage';
import { Dashboard, CurrentSessionActivity } from './pages/Dashboard';
import { LiveSurveillance } from './pages/LiveSurveillance';
import { TargetTracking } from './pages/TargetTracking';
import { ThreatMonitoring } from './pages/ThreatMonitoring';
import { RestrictedZones } from './pages/RestrictedZones';
import { SensorManagement } from './pages/SensorManagement';
import { AIEngine } from './pages/AIEngine';
import { Analytics } from './pages/Analytics';
import { AlertHistory } from './pages/AlertHistory';
import { Reports } from './pages/Reports';
import { SystemHealth } from './pages/SystemHealth';
import { Settings } from './pages/Settings';
import { useLiveFeed } from './hooks/useLiveFeed';
import { useVideoStatus } from './hooks/useVideoStatus';
import { useSmoothScroll } from './hooks/useSmoothScroll';
import { Zone, AlertRecord } from './types/schema';
import { apiService } from './services/api';
import { formatIST } from './utils/date';

export function App() {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLandingPage, setIsLandingPage] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // Initialize Global Lenis Buttery-Smooth Momentum Scroll Engine
  const { scrollTo } = useSmoothScroll(!isLoading);

  const { detections, isConnected, fps: liveFps } = useLiveFeed();
  const { videoStatus, systemStatus, refreshStatus } = useVideoStatus(2000);

  const [zones, setZones] = useState<Zone[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<AlertRecord[]>([]);

  // Current surveillance session state & activity tracking
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [currentSessionEvents, setCurrentSessionEvents] = useState<CurrentSessionActivity[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const seenSessionThreatsRef = useRef<Set<string>>(new Set());

  const currentVideoIdRef = useRef<string | null>(null);

  // Watch videoStatus to start or reset the current surveillance session
  useEffect(() => {
    // If video ID changed to a new video, clear previous video threats
    if (videoStatus.video_id && currentVideoIdRef.current && videoStatus.video_id !== currentVideoIdRef.current) {
      currentVideoIdRef.current = videoStatus.video_id;
      seenSessionThreatsRef.current.clear();
      setCurrentSessionEvents([]);
      setSelectedTrackId(null);
    } else if (videoStatus.video_id && !currentVideoIdRef.current) {
      currentVideoIdRef.current = videoStatus.video_id;
    }

    if (videoStatus.status === 'processing' || videoStatus.status === 'paused') {
      const backendStartTime = videoStatus.session_start_time
        ? new Date(videoStatus.session_start_time).getTime()
        : null;

      setSessionStartTime((prev) => {
        if (backendStartTime) {
          return backendStartTime;
        }
        if (!prev) {
          return Date.now();
        }
        return prev;
      });
    } else if (videoStatus.status === 'no_video_selected') {
      currentVideoIdRef.current = null;
      setSessionStartTime(null);
      seenSessionThreatsRef.current.clear();
      setCurrentSessionEvents([]);
      setSelectedTrackId(null);
    }
    // Note: when videoStatus.status === 'completed' or 'stopped', we DO NOT clear sessionStartTime or events
    // so the recorded threats and activities from that video session remain available for the examiner to inspect!
  }, [videoStatus.status, videoStatus.video_id, videoStatus.session_start_time]);

  // Capture real threat events generated during this session from live detections
  useEffect(() => {
    if (!sessionStartTime || (videoStatus.status !== 'processing' && videoStatus.status !== 'paused')) {
      return;
    }

    detections.forEach((d) => {
      if (d.threat) {
        const threatKey = `${d.track_id}-${d.class}`;
        if (!seenSessionThreatsRef.current.has(threatKey)) {
          seenSessionThreatsRef.current.add(threatKey);
          const time = formatIST(new Date(), { includeTimeOnly: true });
          const newEvt: CurrentSessionActivity = {
            id: `sess-${Date.now()}-${d.track_id}`,
            time,
            track: `${d.class.replace(/_/g, ' ').toUpperCase()} T-${d.track_id != null ? d.track_id : 1} DETECTED`,
            desc: d.threat_reason || 'Unauthorized threat detected',
            type: 'THREAT',
            severity: (d.threat_level as any) || 'HIGH',
          };
          setCurrentSessionEvents((prev) => [newEvt, ...prev.slice(0, 9)]);
        }
      }
    });
  }, [detections, sessionStartTime, videoStatus.status]);

  // Also merge any alerts from backend that were generated during this active session
  useEffect(() => {
    if (!sessionStartTime) return;
    const sessionAlerts = recentAlerts.filter(
      (a) => new Date(a.timestamp).getTime() >= sessionStartTime - 3000
    );
    sessionAlerts.forEach((a) => {
      const alertKey = `db-${a.id}`;
      if (!seenSessionThreatsRef.current.has(alertKey)) {
        seenSessionThreatsRef.current.add(alertKey);
        const time = formatIST(a.timestamp, { includeTimeOnly: true });
        const newEvt: CurrentSessionActivity = {
          id: alertKey,
          time,
          track: `${(a.object_class || a.threat_type || 'TARGET').replace(/_/g, ' ').toUpperCase()} T-${a.track_id || 1} DETECTED`,
          desc: a.reason,
          type: 'THREAT',
          severity: (a.severity as any) || 'HIGH',
        };
        setCurrentSessionEvents((prev) => [newEvt, ...prev.slice(0, 9)]);
      }
    });
  }, [recentAlerts, sessionStartTime]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [zData, aData] = await Promise.all([
          apiService.getZones(),
          apiService.getAlertHistory({ limit: 10 }),
        ]);
        setZones(zData);
        setRecentAlerts(aData);
      } catch (err) {
        console.error('Error fetching initial app data:', err);
      }
    }
    loadInitialData();
  }, [currentPage, isLandingPage]);

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === '?') {
        setShowShortcutsModal((prev) => !prev);
      } else if (e.key.toLowerCase() === 'l') {
        setIsLandingPage(false);
        setCurrentPage('live');
        scrollTo(0, { immediate: true });
      } else if (e.key.toLowerCase() === 'd') {
        setIsLandingPage(false);
        setCurrentPage('dashboard');
        scrollTo(0, { immediate: true });
      } else if (e.key.toLowerCase() === 'k') {
        setIsLandingPage(false);
        setCurrentPage('tracking');
        scrollTo(0, { immediate: true });
      } else if (e.key.toLowerCase() === 't') {
        setIsLandingPage(false);
        setCurrentPage('threats');
        scrollTo(0, { immediate: true });
      } else if (e.key.toLowerCase() === 'e') {
        setIsLandingPage(false);
        setCurrentPage('ai_engine');
        scrollTo(0, { immediate: true });
      } else if (e.key.toLowerCase() === 'h') {
        setIsLandingPage(false);
        setCurrentPage('system_health');
        scrollTo(0, { immediate: true });
      } else if (e.key.toLowerCase() === 'a') {
        setIsLandingPage(false);
        setCurrentPage('analytics');
        scrollTo(0, { immediate: true });
      } else if (e.key.toLowerCase() === 's') {
        setIsLandingPage(false);
        setCurrentPage('settings');
        scrollTo(0, { immediate: true });
      } else if (e.key.toLowerCase() === 'r') {
        setIsLandingPage(false);
        setCurrentPage('reports');
        scrollTo(0, { immediate: true });
      } else if (e.key.toLowerCase() === 'x') {
        setIsLandingPage(false);
        setCurrentPage('alerts');
        scrollTo(0, { immediate: true });
      } else if (e.key === 'Escape') {
        setShowShortcutsModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scrollTo]);

  const isSessionActive = videoStatus.status === 'processing' || videoStatus.status === 'paused';

  const [activeTracksCount, setActiveTracksCount] = useState<number>(0);
  const activeTracksMapRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    if (!isSessionActive) {
      activeTracksMapRef.current.clear();
      setActiveTracksCount(0);
      return;
    }
    const now = Date.now();
    const map = activeTracksMapRef.current;
    if (detections && detections.length > 0) {
      detections.forEach((d, idx) => {
        const tid = d.track_id != null && d.track_id > 0 ? d.track_id : idx + 1;
        map.set(tid, now);
      });
    }
    const EXPIRATION_MS = 2500;
    for (const [tid, lastSeen] of map.entries()) {
      if (now - lastSeen > EXPIRATION_MS) {
        map.delete(tid);
      }
    }
    setActiveTracksCount(map.size);
  }, [detections, isSessionActive]);

  useEffect(() => {
    if (!isSessionActive) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const map = activeTracksMapRef.current;
      let changed = false;
      const EXPIRATION_MS = 2500;
      for (const [tid, lastSeen] of map.entries()) {
        if (now - lastSeen > EXPIRATION_MS) {
          map.delete(tid);
          changed = true;
        }
      }
      if (changed) {
        setActiveTracksCount(map.size);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [isSessionActive]);

  const activeThreatCount = isSessionActive
    ? Math.max(
        detections.filter((d) => d.threat).length,
        seenSessionThreatsRef.current.size,
        systemStatus?.active_threats ?? 0
      )
    : 0;

  const effectiveFps = isSessionActive
    ? (liveFps > 0 ? liveFps : (systemStatus?.fps ?? 0.0))
    : 0.0;

  const handlePageSelect = (page: PageId) => {
    setCurrentPage(page);
    scrollTo(0, { immediate: true });
  };

  const handleEnterCommandCenter = () => {
    setIsLandingPage(false);
    setCurrentPage('dashboard');
    scrollTo(0, { immediate: true });
  };

  const handleNavigateLanding = () => {
    setIsLandingPage(true);
    scrollTo(0, { immediate: true });
  };

  const handleLoadingComplete = React.useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div className="min-h-screen w-full max-w-full bg-[var(--bg-main)] text-[var(--text-primary)] flex flex-col font-sans selection:bg-[var(--thermal-cyan)]/20 selection:text-[var(--thermal-cyan)] transition-colors duration-250">
      {/* Initial Boot Sequence Loading Overlay */}
      <AnimatePresence>
        {isLoading && <LoadingScreen onComplete={handleLoadingComplete} />}
      </AnimatePresence>

      {/* Global Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {!isLoading && (
        <>
          {isLandingPage ? (
            <LandingPage onEnterCommandCenter={handleEnterCommandCenter} />
          ) : (
            <div className="flex flex-col min-h-screen w-full max-w-full">
              <Header
                systemStatus={systemStatus}
                isConnected={isConnected}
                onNavigateHome={handleNavigateLanding}
                fps={effectiveFps}
                activeTracks={activeTracksCount}
                activeThreats={activeThreatCount}
                isSessionActive={isSessionActive}
              />

              <div className="main-layout-container flex flex-1 w-full max-w-full min-w-0 relative">
                <Sidebar
                  currentPage={currentPage}
                  onSelectPage={handlePageSelect}
                  activeThreatCount={activeThreatCount}
                  onNavigateLanding={handleNavigateLanding}
                  systemStatus={systemStatus}
                />

                <main className="app-main-content flex-1 min-w-0 p-3 sm:p-5 lg:p-6 w-full max-w-full min-h-[calc(100vh-4rem)]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentPage}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="page-container w-full max-w-full min-w-0"
                    >
                      {currentPage === 'dashboard' && (
                        <Dashboard
                          systemStatus={systemStatus}
                          latestDetections={detections}
                          recentAlerts={recentAlerts}
                          onNavigate={handlePageSelect}
                          videoStatus={videoStatus}
                          currentSessionEvents={currentSessionEvents}
                        />
                      )}

                      {currentPage === 'live' && (
                        <LiveSurveillance
                          detections={detections}
                          zones={zones}
                          videoStatus={videoStatus}
                          onRefreshStatus={refreshStatus}
                        />
                      )}

                      {currentPage === 'tracking' && (
                        <TargetTracking
                          detections={detections}
                          isSessionActive={isSessionActive}
                          videoStatus={videoStatus}
                          selectedTrackId={selectedTrackId}
                          onSelectTrackId={setSelectedTrackId}
                        />
                      )}

                      {currentPage === 'threats' && (
                        <ThreatMonitoring
                          detections={detections}
                          zones={zones}
                          videoStatus={videoStatus}
                          sessionStartTime={sessionStartTime}
                          isSessionActive={isSessionActive}
                          selectedTrackId={selectedTrackId}
                          onSelectTrackId={setSelectedTrackId}
                          onNavigate={handlePageSelect}
                        />
                      )}

                      {currentPage === 'zones' && <RestrictedZones />}

                      {currentPage === 'sensors' && <SensorManagement onNavigate={handlePageSelect} />}

                      {currentPage === 'ai_engine' && <AIEngine onNavigate={handlePageSelect} />}

                      {currentPage === 'analytics' && <Analytics onNavigateSurveillance={() => handlePageSelect('live')} />}

                      {currentPage === 'alerts' && <AlertHistory onNavigate={handlePageSelect} />}

                      {currentPage === 'reports' && <Reports />}

                      {currentPage === 'system_health' && <SystemHealth onNavigate={handlePageSelect} />}

                      {currentPage === 'settings' && <Settings onNavigate={handlePageSelect} />}
                    </motion.div>
                  </AnimatePresence>
                </main>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;

