import React, { useState, useEffect, useRef } from 'react';
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

  const { detections, isConnected } = useLiveFeed();
  const { videoStatus, systemStatus, refreshStatus } = useVideoStatus(2000);

  const [zones, setZones] = useState<Zone[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<AlertRecord[]>([]);

  // Current surveillance session state & activity tracking
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [currentSessionEvents, setCurrentSessionEvents] = useState<CurrentSessionActivity[]>([]);
  const seenSessionThreatsRef = useRef<Set<string>>(new Set());

  // Watch videoStatus to start or reset the current surveillance session
  useEffect(() => {
    if (videoStatus.status === 'processing' || videoStatus.status === 'paused') {
      const backendStartTime = videoStatus.session_start_time
        ? new Date(videoStatus.session_start_time).getTime()
        : null;

      setSessionStartTime((prev) => {
        if (backendStartTime) {
          return backendStartTime;
        }
        if (!prev) {
          seenSessionThreatsRef.current.clear();
          setCurrentSessionEvents([]);
          return Date.now();
        }
        return prev;
      });
    } else if (videoStatus.status === 'stopped' || videoStatus.status === 'no_video_selected') {
      setSessionStartTime(null);
      seenSessionThreatsRef.current.clear();
      setCurrentSessionEvents([]);
    }
  }, [videoStatus.status, videoStatus.session_start_time]);

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

  const isSessionActive = (videoStatus.status === 'processing' || videoStatus.status === 'paused') && !!sessionStartTime;
  const activeThreatCount = isSessionActive
    ? (detections.filter((d) => d.threat).length || (systemStatus?.active_threats ?? 0))
    : 0;

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

                      {currentPage === 'tracking' && <TargetTracking detections={detections} />}

                      {currentPage === 'threats' && (
                        <ThreatMonitoring
                          detections={detections}
                          zones={zones}
                          videoStatus={videoStatus}
                          sessionStartTime={sessionStartTime}
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

