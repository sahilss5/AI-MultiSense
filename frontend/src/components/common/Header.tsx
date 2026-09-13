import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SystemStatusResponse } from '../../types/schema';
import { Badge } from './Badge';
import { BrandMark } from './BrandMark';
import { Activity, ShieldAlert, Crosshair, Globe, Home, Sun, Moon } from 'lucide-react';
import { formatIST } from '../../utils/date';
import { useTheme } from '../../context/ThemeContext';

interface HeaderProps {
  systemStatus: SystemStatusResponse | null;
  isConnected: boolean;
  onNavigateHome: () => void;
}

export const Header: React.FC<HeaderProps> = ({ systemStatus, isConnected, onNavigateHome }) => {
  const [istTime, setIstTime] = useState<string>('');
  const { theme, toggleTheme } = useTheme();
  const analysisMode = systemStatus?.analysis_mode || 'Demo Mode';
  const isDemo = systemStatus?.is_demo_mode ?? true;

  useEffect(() => {
    const updateTime = () => {
      setIstTime(formatIST(new Date()));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 w-full max-w-full border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-2xl px-3 sm:px-6 flex items-center justify-between sticky top-0 z-40 select-none font-sans overflow-hidden transition-colors duration-250">
      {/* LEFT: LOGO + BRAND + HOME PORTAL BUTTON */}
      <div className="flex items-center space-x-2 sm:space-x-3 relative z-10 shrink-0">
        <BrandMark onClick={onNavigateHome} showVersion={true} />

        <button
          onClick={onNavigateHome}
          className="hidden md:flex items-center space-x-1.5 text-xs font-sans px-2.5 py-1 rounded-lg btn-secondary-interactive cursor-pointer shrink-0"
        >
          <Home className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
          <span>Home portal</span>
        </button>
      </div>

      {/* CENTER: SYSTEM STATUS • OPERATIONAL & DEMO MODE */}
      <div className="hidden xl:flex items-center space-x-2.5 h-8 px-3.5 rounded-full bg-[var(--operational-green)]/[0.08] border border-[var(--operational-green)]/25 text-xs font-sans relative z-10 shrink-0">
        <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]" />
        <span className="text-[var(--text-secondary)] text-[11px] font-mono tracking-wide">
          SYSTEM STATUS <span className="text-[var(--operational-green)] font-semibold">• OPERATIONAL</span>
        </span>
        <span className="text-[var(--text-muted)] opacity-40">|</span>
        <Badge variant={isDemo ? 'amber' : 'emerald'} size="sm">
          {analysisMode}
        </Badge>
      </div>

      {/* RIGHT: TELEMETRY READOUTS, CLOCK, THEME TOGGLE & LIVE STATUS */}
      <div className="flex items-center space-x-2 sm:space-x-3 text-xs font-sans relative z-10 shrink-0">
        <div className="hidden md:flex items-center space-x-1.5 text-[var(--text-secondary)] font-mono text-[11px] shrink-0">
          <Activity className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
          <span>FPS:</span>
          <span className="text-[var(--text-primary)] font-semibold">{systemStatus?.fps?.toFixed(1) || '29.8'}</span>
        </div>

        <div className="hidden lg:flex items-center space-x-1.5 text-[var(--text-secondary)] font-mono text-[11px] shrink-0">
          <Crosshair className="w-3.5 h-3.5 text-[var(--operational-green)]" />
          <span>Tracks:</span>
          <span className="text-[var(--text-primary)] font-semibold">{systemStatus?.active_tracks ?? 24}</span>
        </div>

        <div className="hidden sm:flex items-center space-x-1.5 text-[var(--text-secondary)] font-mono text-[11px] shrink-0">
          <ShieldAlert className="w-3.5 h-3.5 text-[var(--threat-coral)]" />
          <span>Threats:</span>
          <span className={`font-semibold ${(systemStatus?.active_threats || 0) > 0 ? 'text-[var(--threat-coral)]' : 'text-[var(--text-secondary)]'}`}>
            {systemStatus?.active_threats ?? 3}
          </span>
        </div>

        <div className="hidden lg:flex items-center space-x-1.5 text-[var(--text-secondary)] text-[11px] font-mono border-l border-[var(--border-subtle)] pl-2.5 shrink-0">
          <Globe className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <span>{istTime}</span>
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg btn-secondary-interactive text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-[var(--warning-amber)]" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-[var(--intelligence-violet)]" />
          )}
        </button>

        {/* Live Status Indicator Pill */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 bg-[var(--bg-surface-secondary)] px-2 sm:px-3 py-1 rounded-full border border-[var(--border-subtle)] shrink-0">
          <span
            className={`w-2 h-2 rounded-full transition-all ${
              isConnected ? 'bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]' : 'bg-[var(--threat-coral)] pulse-threat'
            }`}
          />
          <span className={isConnected ? 'text-[var(--operational-green)] font-semibold text-[10px] sm:text-[11px] font-mono' : 'text-[var(--threat-coral)] font-semibold text-[10px] sm:text-[11px] font-mono'}>
            {isConnected ? 'LIVE ●' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* BOTTOM ACCENT: RECURRING FAINT SCAN LINE */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--border-subtle)] overflow-hidden pointer-events-none">
        <motion.div
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
          className="w-1/3 h-full bg-gradient-to-r from-transparent via-[var(--thermal-cyan)]/40 to-transparent"
        />
      </div>
    </header>
  );
};
