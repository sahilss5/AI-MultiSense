import { useState, useEffect, useCallback } from 'react';
import { VideoStatusResponse, SystemStatusResponse } from '../types/schema';
import { apiService } from '../services/api';

export function useVideoStatus(intervalMs = 2000) {
  const [videoStatus, setVideoStatus] = useState<VideoStatusResponse>({
    status: 'no_video_selected',
    analysis_mode: 'Demo Mode',
  });
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshStatus = useCallback(async () => {
    try {
      const [vStat, sStat] = await Promise.all([
        apiService.getVideoStatus(),
        apiService.getSystemStatus(),
      ]);
      setVideoStatus(vStat);
      setSystemStatus(sStat);
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const timer = setInterval(refreshStatus, intervalMs);
    return () => clearInterval(timer);
  }, [refreshStatus, intervalMs]);

  return { videoStatus, systemStatus, isLoading, refreshStatus };
}
