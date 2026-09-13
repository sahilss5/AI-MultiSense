import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertRecord, ThermalDetectionObject } from '../../types/schema';
import { ShieldAlert, Crosshair, Clock } from 'lucide-react';
import { formatIST } from '../../utils/date';

interface ActivityTimelineProps {
  recentAlerts: AlertRecord[];
  latestDetections: ThermalDetectionObject[];
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ recentAlerts, latestDetections }) => {
  const events = [
    ...recentAlerts.map((a) => ({
      id: a.id,
      timestamp: formatIST(a.timestamp, { includeTimeOnly: true }),
      type: 'ALERT' as const,
      title: a.threat_type,
      description: a.reason,
      trackId: a.track_id,
      severity: a.severity,
    })),
    ...latestDetections.map((d) => ({
      id: `det-${d.id}`,
      timestamp: formatIST(new Date(), { includeTimeOnly: true }),
      type: d.threat ? ('THREAT' as const) : ('DETECTION' as const),
      title: `${d.class} target acquired`,
      description: `Confidence ${(d.confidence * 100).toFixed(1)}% ${d.zone ? `in ${d.zone}` : ''}`,
      trackId: d.track_id,
      severity: d.threat_level || 'LOW',
    })),
  ].slice(0, 6);

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
        <div className="flex items-center space-x-2 text-xs font-semibold text-[#F1F3F5]">
          <Clock className="w-4 h-4 text-[#76C7D9]" />
          <span>Live telemetry timeline</span>
        </div>
        <span className="text-xs text-[#76C7D9] font-medium">Stream active</span>
      </div>

      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
        <AnimatePresence>
          {events.length === 0 ? (
            <div className="text-center py-6 text-[#6F7888] text-xs italic font-sans">
              Awaiting telemetry events...
            </div>
          ) : (
            events.map((evt) => (
              <motion.div
                key={evt.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.2 }}
                className={`p-3 rounded-xl border text-xs font-sans transition-all flex items-start space-x-3 ${
                  evt.type === 'ALERT' || evt.type === 'THREAT'
                    ? 'bg-[#D98282]/10 border-[#D98282]/20'
                    : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {evt.type === 'ALERT' || evt.type === 'THREAT' ? (
                    <ShieldAlert className="w-4 h-4 text-[#D98282]" />
                  ) : (
                    <Crosshair className="w-4 h-4 text-[#76C7D9]" />
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#F1F3F5]">
                      Track #{evt.trackId} • {evt.title}
                    </span>
                    <span className="text-[10px] text-[#6F7888] font-mono">{evt.timestamp}</span>
                  </div>
                  <p className="text-[#A5ADBB] text-xs leading-relaxed">{evt.description}</p>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
