import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { VideoStatusResponse } from '../../types/schema';
import { apiService } from '../../services/api';
import { Badge } from '../common/Badge';
import { Upload, Play, Square, Film, AlertCircle, Loader2 } from 'lucide-react';

interface AnalysisControlsProps {
  videoStatus: VideoStatusResponse;
  onStatusChange: () => void;
}

export const AnalysisControls: React.FC<AnalysisControlsProps> = ({ videoStatus, onStatusChange }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const status = videoStatus.status;
  const videoId = videoStatus.video_id;

  const canStart = (status === 'ready' || status === 'stopped' || status === 'completed') && !isActionPending;
  const canStop = status === 'processing' && !isActionPending;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      await apiService.uploadVideo(file);
      onStatusChange();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to upload video file.';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleStart = async () => {
    if (!videoId) return;
    setIsActionPending(true);
    try {
      await apiService.startVideoAnalysis(videoId);
      onStatusChange();
    } catch (err: any) {
      setErrorMessage('Failed to start analysis loop.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleStop = async () => {
    if (!videoId) return;
    setIsActionPending(true);
    try {
      await apiService.stopVideoAnalysis(videoId);
      onStatusChange();
    } catch (err: any) {
      setErrorMessage('Failed to stop analysis loop.');
    } finally {
      setIsActionPending(false);
    }
  };

  const getStatusVariant = (s: string) => {
    switch (s) {
      case 'processing': return 'emerald';
      case 'ready': return 'cyan';
      case 'stopped': return 'amber';
      case 'completed': return 'violet';
      case 'error': return 'red';
      default: return 'slate';
    }
  };

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border-subtle)] shadow-[var(--card-shadow)] space-y-4 font-sans select-none transition-colors w-full max-w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--thermal-cyan)]/10 border border-[var(--thermal-cyan)]/25 flex items-center justify-center text-[var(--thermal-cyan)] shrink-0">
            <Film className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-[var(--text-primary)] font-sans tracking-wide uppercase truncate">
              THERMAL STREAM CONTROL
            </h3>
            <p className="text-xs text-[var(--text-secondary)] font-sans truncate">Configure and control the active thermal surveillance stream.</p>
          </div>
        </div>

        {/* Status Telemetry Pills */}
        <div className="flex items-center space-x-3 text-xs font-sans flex-wrap gap-2">
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="text-[var(--text-muted)]">STREAM STATUS:</span>
            <Badge variant={getStatusVariant(status)}>
              {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')}
            </Badge>
          </div>
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="text-[var(--text-muted)]">MODE:</span>
            <Badge variant={videoStatus.analysis_mode === 'AI Inference Active' ? 'emerald' : 'amber'}>
              {videoStatus.analysis_mode}
            </Badge>
          </div>
        </div>
      </div>

      {/* Hierarchical Controls */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".mp4,.avi,.mov"
          className="hidden"
        />

        {/* Secondary: Upload Thermal Video */}
        <button
          onClick={handleUploadClick}
          disabled={isUploading}
          className="px-4 py-2.5 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center space-x-2 disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
        >
          {isUploading ? <Loader2 className="w-4 h-4 text-[var(--thermal-cyan)] animate-spin" /> : <Upload className="w-4 h-4 text-[var(--thermal-cyan)]" />}
          <span>{isUploading ? 'Uploading Video...' : 'Upload Thermal Video'}</span>
        </button>

        {/* Primary: Start Analysis */}
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="px-5 py-2.5 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center space-x-2 shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          {isActionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
          <span>{status === 'processing' ? 'Analysis Active' : 'Start Analysis'}</span>
        </button>

        {/* Danger: Stop Analysis */}
        <button
          onClick={handleStop}
          disabled={!canStop}
          className="px-4 py-2.5 rounded-xl bg-[var(--threat-coral)]/15 hover:bg-[var(--threat-coral)]/25 text-[var(--threat-coral)] border border-[var(--threat-coral)]/30 font-semibold text-xs transition-all flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          {isActionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
          <span>{status === 'stopped' ? 'Analysis Stopped' : 'Stop Analysis'}</span>
        </button>

        {videoStatus.filename && (
          <span className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-surface-secondary)] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] truncate max-w-xs">
            FILE: <span className="text-[var(--thermal-cyan)] font-semibold">{videoStatus.filename}</span>
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="p-3 bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/30 rounded-xl text-[var(--threat-coral)] text-xs flex items-center space-x-2 font-sans">
          <AlertCircle className="w-4 h-4 text-[var(--threat-coral)] shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
