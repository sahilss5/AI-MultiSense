import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Video,
  Crosshair,
  ShieldAlert,
  Map,
  Radio,
  Cpu,
  BarChart3,
  History,
  FileText,
  Activity,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export type PageId =
  | 'dashboard'
  | 'live'
  | 'tracking'
  | 'threats'
  | 'zones'
  | 'sensors'
  | 'ai_engine'
  | 'analytics'
  | 'alerts'
  | 'reports'
  | 'system_health'
  | 'settings';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
  activeThreatCount: number;
  onNavigateLanding?: () => void;
  systemStatus?: any;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  activeThreatCount,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [hoveredItem, setHoveredItem] = useState<PageId | null>(null);

  // Auto-collapse sidebar on smaller tablet / mobile screens to maximize main viewport width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navItems: Array<{ id: PageId; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'dashboard', label: 'Command Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'live', label: 'Live Surveillance', icon: <Video className="w-4 h-4" /> },
    { id: 'tracking', label: 'Target Tracking', icon: <Crosshair className="w-4 h-4" /> },
    { id: 'threats', label: 'Threat Monitoring', icon: <ShieldAlert className="w-4 h-4" />, badge: activeThreatCount },
    { id: 'zones', label: 'Restricted Zones', icon: <Map className="w-4 h-4" /> },
    { id: 'sensors', label: 'Sensor Management', icon: <Radio className="w-4 h-4" /> },
    { id: 'ai_engine', label: 'AI Engine', icon: <Cpu className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'alerts', label: 'Alert History', icon: <History className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports', icon: <FileText className="w-4 h-4" /> },
    { id: 'system_health', label: 'System Health', icon: <Activity className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="w-4 h-4" /> },
  ];

  return (
    <aside
      className={`border-r border-[var(--border-subtle)] bg-[var(--bg-surface-secondary)] p-2.5 sm:p-3 flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-16 select-none transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] z-30 shrink-0 ${
        isCollapsed ? 'w-16 sm:w-20' : 'w-56 lg:w-64'
      }`}
    >
      <div className="space-y-3 min-w-0 flex-1 overflow-y-auto pr-1" data-lenis-prevent>
        {/* COMMAND CENTER HEADER BLOCK */}
        <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)] min-w-0">
          {!isCollapsed ? (
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-2 h-2 rounded-full bg-[var(--thermal-cyan)] pulse-live shadow-[0_0_8px_var(--thermal-cyan)] shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-bold tracking-wider text-[var(--text-primary)] font-sans uppercase truncate">
                  COMMAND CENTER
                </span>
                <span className="text-[9px] font-mono text-[var(--text-muted)] truncate">INTELLIGENCE NAV RAIL</span>
              </div>
            </div>
          ) : (
            <div className="w-2 h-2 rounded-full bg-[var(--thermal-cyan)] pulse-live mx-auto shadow-[0_0_8px_var(--thermal-cyan)] shrink-0" title="Command Center Active" />
          )}

          {/* Collapse Toggle Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg btn-secondary-interactive text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0 ml-1"
            title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* MODULES LIST */}
        <div className="space-y-1 min-w-0">
          {!isCollapsed && (
            <div className="px-3 pt-0.5 pb-1 text-[10px] font-mono font-semibold tracking-wider text-[var(--text-muted)] uppercase truncate">
              MODULES ({navItems.length})
            </div>
          )}

          <nav className="space-y-0.5 min-w-0">
            {navItems.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <div key={item.id} className="relative min-w-0">
                  <button
                    data-page-id={item.id}
                    title={item.label}
                    aria-label={item.label}
                    onClick={() => onSelectPage(item.id)}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={`w-full relative flex items-center ${
                      isCollapsed ? 'justify-center px-0' : 'justify-between px-3'
                    } h-9 rounded-lg text-xs font-sans transition-all duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer overflow-hidden ${
                      isActive
                        ? 'bg-[var(--thermal-cyan)]/12 border-l-2 border-[var(--thermal-cyan)] text-[var(--text-primary)] font-semibold shadow-sm'
                        : 'bg-transparent border-l-2 border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <div className="relative z-10 flex items-center space-x-2.5 min-w-0">
                      {/* Active Glowing Dot Indicator */}
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--thermal-cyan)] pulse-live shadow-[0_0_6px_var(--thermal-cyan)] shrink-0" />
                      )}

                      <span
                        className={`transition-colors duration-180 shrink-0 ${
                          isActive ? 'text-[var(--thermal-cyan)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--thermal-cyan)]'
                        }`}
                      >
                        {item.icon}
                      </span>

                      {!isCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </div>

                    {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                      <span className="relative z-10 px-1.5 py-0.5 text-[10px] font-mono font-medium bg-[var(--threat-coral)]/15 text-[var(--threat-coral)] rounded-full border border-[var(--threat-coral)]/25 shadow-sm shrink-0 ml-1.5">
                        {item.badge}
                      </span>
                    )}
                  </button>

                  {/* Collapsed Tooltip Overlay */}
                  <AnimatePresence>
                    {isCollapsed && hoveredItem === item.id && (
                      <motion.div
                        initial={{ opacity: 0, x: 4, scale: 0.96 }}
                        animate={{ opacity: 1, x: 10, scale: 1 }}
                        exit={{ opacity: 0, x: 4, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute left-full top-1/2 -translate-y-1/2 z-50 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-sans text-[var(--text-primary)] whitespace-nowrap shadow-xl pointer-events-none"
                      >
                        {item.label}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>
        </div>
      </div>

      {/* SIDEBAR FOOTER DIAGNOSTICS PANELS */}
      {!isCollapsed ? (
        <div className="space-y-2.5 pt-2.5 border-t border-[var(--border-subtle)] min-w-0 shrink-0">
          {/* SYSTEM HEALTH DIAGNOSTIC MODULE */}
          <div
            onClick={() => onSelectPage('system_health')}
            className="p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border-hover)] cursor-pointer transition-colors space-y-2 text-[11px] font-sans shadow-sm min-w-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase font-medium truncate">SYSTEM HEALTH</span>
              <span className="font-mono font-semibold text-[var(--operational-green)] text-[10px] shrink-0">OPERATIONAL</span>
            </div>

            <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[10px] pt-1.5 border-t border-[var(--border-subtle)]">
              <div className="flex items-center space-x-1.5 text-[var(--text-secondary)] min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--operational-green)] pulse-live shrink-0" />
                <span className="truncate">Sensor</span>
              </div>
              <span className="text-[var(--operational-green)] font-mono text-right font-semibold">ONLINE</span>

              <div className="flex items-center space-x-1.5 text-[var(--text-secondary)] min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--operational-green)] shrink-0" />
                <span className="truncate">Inference</span>
              </div>
              <span className="text-[var(--operational-green)] font-mono text-right font-semibold">READY</span>

              <div className="flex items-center space-x-1.5 text-[var(--text-secondary)] min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--operational-green)] shrink-0" />
                <span className="truncate">Tracker</span>
              </div>
              <span className="text-[var(--operational-green)] font-mono text-right font-semibold">ACTIVE</span>

              <div className="flex items-center space-x-1.5 text-[var(--text-secondary)] min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--operational-green)] shrink-0" />
                <span className="truncate">Threat</span>
              </div>
              <span className="text-[var(--operational-green)] font-mono text-right font-semibold">READY</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-3 pt-3 border-t border-[var(--border-subtle)] shrink-0">
          <div
            onClick={() => onSelectPage('system_health')}
            className="w-2.5 h-2.5 rounded-full bg-[var(--operational-green)] pulse-live cursor-pointer"
            title="System Health: OPERATIONAL - Click to open System Health"
          />
        </div>
      )}
    </aside>
  );
};

