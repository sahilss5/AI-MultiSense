import React, { useRef, useState } from 'react';
import { Camera, RefreshCw, Power, Radio, Film, Play, Square, CircleDot, Download, AlertTriangle, Upload, Loader2, Activity } from 'lucide-react';
import { CameraDevice, VideoSourceMode } from '../../hooks/useThermalCamera';
import { VideoStatusResponse } from '../../types/schema';
import { apiService } from '../../services/api';
import { Badge } from '../common/Badge';

interface ThermalCameraControlsProps {
  sourceMode: VideoSourceMode;
  onSourceModeChange: (mode: VideoSourceMode) => void;
  devices: CameraDevice[];
  selectedDeviceId: string;
  onSelectDeviceId: (id: string) => void;
  isConnected: boolean;
  isConnecting: boolean;
  isScanning: boolean;
  error: string | null;
  resolution: { width: number; height: number };
  fps: number;
  isRecording: boolean;
  recordingSeconds: number;
  isDetectionActive: boolean;
  videoStatus: VideoStatusResponse;
  onStatusChange: () => void;
  onScanCameras: () => void;
  onConnectCamera: () => void;
  onDisconnectCamera: () => void;
  onToggleDetection: () => void;
  onTakeSnapshot: () => void;
  onToggleRecording: () => void;
}

export const ThermalCameraControls: React.FC<ThermalCameraControlsProps> = ({
  sourceMode,
  onSourceModeChange,
  devices,
  selectedDeviceId,
  onSelectDeviceId,
  isConnected,
  isConnecting,
  isScanning,
  error,
  resolution,
  fps,
  isRecording,
  recordingSeconds,
  isDetectionActive,
  videoStatus,
  onStatusChange,
  onScanCameras,
  onConnectCamera,
  onDisconnectCamera,
  onToggleDetection,
  onTakeSnapshot,
  onToggleRecording,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);

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
    setFileError(null);

    try {
      await apiService.uploadVideo(file);
      onStatusChange();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to upload video file.';
      setFileError(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleStartFileAnalysis = async () => {
    if (!videoId) return;
    setIsActionPending(true);
    try {
      await apiService.startVideoAnalysis(videoId);
      onStatusChange();
    } catch (err: any) {
      setFileError('Failed to start analysis loop.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleStopFileAnalysis = async () => {
    if (!videoId) return;
    setIsActionPending(true);
    try {
      await apiService.stopVideoAnalysis(videoId);
      onStatusChange();
    } catch (err: any) {
      setFileError('Failed to stop analysis loop.');
    } finally {
      setIsActionPending(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border-subtle)] shadow-[var(--card-shadow)] space-y-4 font-sans select-none transition-colors w-full max-w-full min-w-0">
      {/* 1. TOP BAR: VIDEO SOURCE SELECTOR (ORDER: 1. VIDEO FILE, 2. THERMAL CAMERA, 3. DEMO FEED) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center space-x-2.5 min-w-0">
          <Film className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
          <span className="text-xs font-bold font-sans uppercase text-[var(--text-primary)] tracking-wide">
            VIDEO SOURCE
          </span>
        </div>

        {/* Source Mode Toggle Pills */}
        <div className="flex items-center space-x-1.5 p-1 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex-wrap gap-1">
          {/* 1. VIDEO FILE (Default) */}
          <button
            onClick={() => onSourceModeChange('video_file')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all cursor-pointer flex items-center space-x-1.5 ${
              sourceMode === 'video_file'
                ? 'bg-[var(--thermal-cyan)] text-[#05080D] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>VIDEO FILE</span>
          </button>

          {/* 2. THERMAL CAMERA */}
          <button
            onClick={() => onSourceModeChange('thermal_camera')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all cursor-pointer flex items-center space-x-1.5 ${
              sourceMode === 'thermal_camera'
                ? 'bg-[var(--thermal-cyan)] text-[#05080D] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>THERMAL CAMERA</span>
          </button>

          {/* 3. DEMO FEED */}
          <button
            onClick={() => onSourceModeChange('demo_feed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all cursor-pointer flex items-center space-x-1.5 ${
              sourceMode === 'demo_feed'
                ? 'bg-[var(--thermal-cyan)] text-[#05080D] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>DEMO FEED</span>
          </button>
        </div>
      </div>

      {/* 2A. MODE 1: VIDEO FILE CONTROLS (DEFAULT DEMO SOURCE) */}
      {sourceMode === 'video_file' && (
        <div className="space-y-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".mp4,.avi,.mov"
            className="hidden"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-xs font-sans">
              <span className="text-[var(--text-muted)]">FILE STREAM STATUS:</span>
              <Badge variant={status === 'processing' ? 'emerald' : status === 'ready' ? 'cyan' : 'amber'}>
                {status.toUpperCase().replace(/_/g, ' ')}
              </Badge>
              {videoStatus.filename && (
                <span className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-surface-secondary)] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] truncate max-w-xs">
                  {videoStatus.filename}
                </span>
              )}
            </div>

            <div className="text-xs font-mono text-[var(--text-muted)]">
              YOLO INFERENCE PIPELINE
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {/* Upload Thermal Video */}
            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center space-x-2 disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
            >
              {isUploading ? <Loader2 className="w-4 h-4 text-[var(--thermal-cyan)] animate-spin" /> : <Upload className="w-4 h-4 text-[var(--thermal-cyan)]" />}
              <span>{isUploading ? 'Uploading Video...' : 'Upload Thermal Video'}</span>
            </button>

            {/* Start Analysis */}
            <button
              onClick={handleStartFileAnalysis}
              disabled={!canStart}
              className="px-4 py-2 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center space-x-2 shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              {isActionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              <span>{status === 'processing' ? 'Analysis Active' : 'Start Analysis'}</span>
            </button>

            {/* Stop Analysis */}
            <button
              onClick={handleStopFileAnalysis}
              disabled={!canStop}
              className="px-4 py-2 rounded-xl bg-[var(--threat-coral)]/15 hover:bg-[var(--threat-coral)]/25 text-[var(--threat-coral)] border border-[var(--threat-coral)]/30 font-semibold text-xs transition-all flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              {isActionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
              <span>Stop Analysis</span>
            </button>
          </div>

          {fileError && (
            <div className="p-3 bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/30 rounded-xl text-[var(--threat-coral)] text-xs flex items-center space-x-2 font-sans">
              <AlertTriangle className="w-4 h-4 text-[var(--threat-coral)] shrink-0" />
              <span>{fileError}</span>
            </div>
          )}
        </div>
      )}

      {/* 2B. MODE 2: THERMAL CAMERA CONTROLS (REAL-TIME HARDWARE LINK) */}
      {sourceMode === 'thermal_camera' && (
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Device Selector Dropdown */}
            <div className="flex items-center space-x-2.5 flex-1 min-w-[240px] max-w-md">
              <Camera className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
              <select
                value={selectedDeviceId}
                onChange={(e) => onSelectDeviceId(e.target.value)}
                disabled={isConnected || isConnecting}
                className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] disabled:opacity-60 cursor-pointer"
              >
                {devices.length === 0 ? (
                  <option value="">No thermal/video devices detected</option>
                ) : (
                  devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Status Telemetry Badge */}
            <div className="flex items-center space-x-2 shrink-0">
              {isConnected ? (
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[var(--operational-green)]/15 border border-[var(--operational-green)]/30 text-[var(--operational-green)] text-xs font-mono font-semibold">
                  <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_6px_var(--operational-green)]" />
                  <span>● THERMAL CAMERA ONLINE</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-xs font-mono">
                  <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]" />
                  <span>○ CAMERA DISCONNECTED</span>
                </div>
              )}

              {isConnected && resolution.width > 0 && (
                <span className="text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg-surface-secondary)] px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)]">
                  {resolution.width}x{resolution.height} @ {fps} FPS
                </span>
              )}
            </div>
          </div>

          {/* Action Control Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {/* Scan For Cameras */}
            <button
              onClick={onScanCameras}
              disabled={isScanning || isConnected}
              className="px-3.5 py-2 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center space-x-2 disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[var(--thermal-cyan)] ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning Devices...' : 'Scan For Cameras'}</span>
            </button>

            {/* Connect / Disconnect Camera */}
            {!isConnected ? (
              <button
                onClick={onConnectCamera}
                disabled={isConnecting}
                className="px-4 py-2 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center space-x-2 disabled:opacity-50 cursor-pointer shadow-md shrink-0"
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isConnecting ? 'Initializing Link...' : 'Connect Camera'}</span>
              </button>
            ) : (
              <button
                onClick={onDisconnectCamera}
                className="px-4 py-2 rounded-xl bg-[var(--threat-coral)]/15 hover:bg-[var(--threat-coral)]/25 text-[var(--threat-coral)] border border-[var(--threat-coral)]/30 text-xs font-semibold flex items-center space-x-2 cursor-pointer shrink-0"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Disconnect Camera</span>
              </button>
            )}

            {/* Start / Stop YOLO Detection */}
            <button
              onClick={onToggleDetection}
              disabled={!isConnected}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 ${
                isDetectionActive
                  ? 'bg-[var(--operational-green)]/15 text-[var(--operational-green)] border border-[var(--operational-green)]/30'
                  : 'btn-secondary-interactive'
              }`}
            >
              {isDetectionActive ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isDetectionActive ? 'Stop AI Detection' : 'Start AI Detection'}</span>
            </button>

            {/* Record Stream */}
            <button
              onClick={onToggleRecording}
              disabled={!isConnected}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 ${
                isRecording
                  ? 'bg-[var(--threat-coral)] text-[#05080D] shadow-[0_0_12px_rgba(242,119,134,0.4)] animate-pulse'
                  : 'btn-secondary-interactive text-[var(--threat-coral)]'
              }`}
            >
              <CircleDot className="w-3.5 h-3.5" />
              <span>{isRecording ? `REC ${formatTime(recordingSeconds)}` : 'Record Stream'}</span>
            </button>

            {/* Snapshot */}
            <button
              onClick={onTakeSnapshot}
              disabled={!isConnected}
              className="px-3.5 py-2 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center space-x-2 text-[var(--thermal-cyan)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Snapshot</span>
            </button>
          </div>

          {error && (
            <div className="p-3 bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/30 rounded-xl text-[var(--threat-coral)] text-xs flex items-center space-x-2 font-sans">
              <AlertTriangle className="w-4 h-4 text-[var(--threat-coral)] shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* 2C. MODE 3: DEMO FEED CONTROLS */}
      {sourceMode === 'demo_feed' && (
        <div className="p-3.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
          <div className="flex items-center space-x-2.5">
            <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live" />
            <span className="font-semibold text-[var(--text-primary)]">
              SYNTHETIC DEMO SIMULATION ACTIVE
            </span>
            <span className="text-[var(--text-muted)]">• Pre-recorded multi-target thermal test loop</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onSourceModeChange('video_file')}
              className="px-3 py-1 rounded-lg btn-secondary-interactive text-xs text-[var(--thermal-cyan)] cursor-pointer"
            >
              Switch to Video File →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
