import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'L', description: 'Navigate to Live Surveillance Workstation' },
    { key: 'D', description: 'Navigate to Command Overview Dashboard' },
    { key: 'K', description: 'Navigate to Target Tracking Workstation' },
    { key: 'T', description: 'Navigate to Threat Monitoring Console' },
    { key: 'E', description: 'Navigate to AI Engine & Model Workbench' },
    { key: 'H', description: 'Navigate to System Health & Diagnostics' },
    { key: 'A', description: 'Navigate to Analytics & Telemetry' },
    { key: 'S', description: 'Navigate to System Settings' },
    { key: '?', description: 'Toggle Keyboard Shortcuts Menu' },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--thermal-cyan)]/10 border border-[var(--thermal-cyan)]/25 flex items-center justify-center text-[var(--thermal-cyan)]">
                <Keyboard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Keyboard Shortcuts</h3>
                <p className="text-xs text-[var(--text-secondary)]">Quick navigation hotkeys</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl btn-secondary-interactive text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {shortcuts.map((sc, idx) => (
              <div
                key={idx}
                className="p-3 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center text-xs"
              >
                <span className="text-[var(--text-secondary)] font-medium">{sc.description}</span>
                <kbd className="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--thermal-cyan)] font-mono font-semibold text-[11px] shadow-sm">
                  {sc.key}
                </kbd>
              </div>
            ))}
          </div>

          <div className="pt-2 text-center text-[11px] text-[var(--text-muted)]">
            Press <kbd className="text-[var(--text-secondary)] font-mono">Esc</kbd> or <kbd className="text-[var(--text-secondary)] font-mono">?</kbd> to close.
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
