import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldAlert, MapPin, Gauge, Target } from 'lucide-react';
import { AlertRecord } from '../../types/schema';
import { SeverityIndicator } from './SeverityIndicator';
import { formatIST } from '../../utils/date';

interface SlideDrawerProps {
  alert: AlertRecord | null;
  onClose: () => void;
}

export const SlideDrawer: React.FC<SlideDrawerProps> = ({ alert, onClose }) => {
  return (
    <AnimatePresence>
      {alert && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Drawer Panel */}
          <motion.div
            data-lenis-prevent
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] shadow-2xl p-6 flex flex-col justify-between select-none font-sans overflow-y-auto"
          >
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
                <div className="flex items-center space-x-2.5">
                  <ShieldAlert className="w-5 h-5 text-[var(--threat-coral)]" />
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    Event details
                  </h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-xl btn-secondary-interactive text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Event Summary Card */}
              <div className="p-4 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Alert ID</span>
                  <span className="font-mono font-medium text-[var(--thermal-cyan)]">{alert.id}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Severity level</span>
                  <SeverityIndicator level={alert.severity} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Timestamp</span>
                  <span className="font-mono text-[var(--text-primary)]">{formatIST(alert.timestamp)}</span>
                </div>
              </div>

              {/* Technical Breakdown */}
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <span className="text-[var(--text-muted)] text-[11px] font-sans">Classification</span>
                  <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium">
                    {alert.threat_type}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[var(--text-muted)] text-[11px] font-sans">Target entity</span>
                  <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] text-[var(--thermal-cyan)] flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-[var(--thermal-cyan)]" />
                      Track #{alert.track_id} ({alert.object_class})
                    </span>
                    <span className="text-[var(--text-muted)] text-[11px]">Monitored</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[var(--text-muted)] text-[11px] font-sans">Description</span>
                  <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] leading-relaxed">
                    {alert.reason}
                  </div>
                </div>

                {alert.zone && (
                  <div className="space-y-1">
                    <span className="text-[var(--text-muted)] text-[11px] font-sans">Zone violated</span>
                    <div className="p-3.5 bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/20 rounded-xl text-[var(--threat-coral)] flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[var(--threat-coral)]" />
                      <span>{alert.zone}</span>
                    </div>
                  </div>
                )}

                {alert.speed && (
                  <div className="space-y-1">
                    <span className="text-[var(--text-muted)] text-[11px] font-sans">Speed metric</span>
                    <div className="p-3.5 bg-[var(--warning-amber)]/10 border border-[var(--warning-amber)]/20 rounded-xl text-[var(--warning-amber)] flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-[var(--warning-amber)]" />
                      <span>{alert.speed.toFixed(1)} km/h</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-[var(--border-subtle)]">
              <button
                onClick={onClose}
                className="w-full py-3 btn-secondary-interactive font-sans text-xs font-semibold rounded-xl cursor-pointer"
              >
                Dismiss inspector
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
