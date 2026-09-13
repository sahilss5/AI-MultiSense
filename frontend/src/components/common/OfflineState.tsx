import React from 'react';
import { Radio, RefreshCw } from 'lucide-react';

interface OfflineStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  onDemoMode?: () => void;
  isRetrying?: boolean;
}

export const OfflineState: React.FC<OfflineStateProps> = ({
  title = 'Backend link offline',
  description = 'Sensor acquisition link disconnected. Verify backend FastAPI server connection or operate in Demo Mode.',
  onRetry,
  onDemoMode,
  isRetrying = false,
}) => {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0B0F16]/90 backdrop-blur-md p-10 text-center flex flex-col items-center justify-center space-y-4 relative overflow-hidden font-sans select-none">
      <div className="w-12 h-12 rounded-2xl bg-[#E6B866]/10 border border-[#E6B866]/20 flex items-center justify-center text-[#E6B866] relative">
        <Radio className="w-6 h-6 animate-pulse" />
      </div>

      <div className="space-y-1.5 max-w-sm relative z-10">
        <h3 className="text-sm font-semibold text-[#F5F7FA] font-sans">{title}</h3>
        <p className="text-xs text-[#8D98AA] font-sans leading-relaxed">{description}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="px-4 py-2 bg-[#63D8E6] hover:bg-[#7AE3EF] text-[#05070B] font-sans font-semibold text-xs rounded-xl transition-all flex items-center space-x-2 shadow-[0_4px_20px_rgba(99,216,230,0.2)] cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Reconnecting backend...' : 'Retry Connection'}</span>
          </button>
        )}

        {onDemoMode && (
          <button
            onClick={onDemoMode}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-[#8D98AA] hover:text-[#F5F7FA] border border-white/10 font-sans font-medium text-xs rounded-xl transition-colors cursor-pointer"
          >
            Continue in Demo Mode
          </button>
        )}
      </div>
    </div>
  );
};
