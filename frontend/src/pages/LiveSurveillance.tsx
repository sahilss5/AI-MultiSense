import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThermalDetectionObject, Zone, VideoStatusResponse, SessionTrack } from '../types/schema';
import { ThermalCanvas } from '../components/live/ThermalCanvas';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { useThermalCamera, VideoSourceMode } from '../hooks/useThermalCamera';
import { formatIST } from '../utils/date';
import { apiService } from '../services/api';
import {
  Film,
  Camera,
  Radio,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Square,
  Activity,
  Layers,
  Palette,
  Sliders,
  ShieldAlert,
  Clock,
  CircleDot,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Gauge,
  Trash2,
  Server,
  Zap,
  Check,
  Download,
} from 'lucide-react';

export const CANONICAL_MODEL_CLASSES = [
  { key: 'person', label: 'PERSON' },
  { key: 'vehicle', label: 'VEHICLE' },
  { key: 'animal', label: 'ANIMAL' },
  { key: 'drone', label: 'DRONE' },
  { key: 'person_with_bag', label: 'PERSON WITH BAG' },
] as const;

export const normalizeCanonicalClass = (raw?: string | null): string => {
  if (!raw) return '';
  const s = String(raw).toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (s === 'person_with_bag' || s === 'bag' || s.includes('bag')) return 'person_with_bag';
  if (s === 'person' || s === 'human') return 'person';
  if (s === 'vehicle' || s === 'car' || s === 'truck' || s === 'bus') return 'vehicle';
  if (s === 'animal' || s === 'dog' || s === 'cat') return 'animal';
  if (s === 'drone' || s === 'uav') return 'drone';
  return s;
};

interface ActivityEvent {
  id: string;
  time: string;
  title: string;
  sub: string;
  threat: boolean;
}

interface LiveSurveillanceProps {
  detections: ThermalDetectionObject[];
  zones: Zone[];
  videoStatus: VideoStatusResponse;
  onRefreshStatus: () => void;
  selectedTrackId?: number | null;
  onSelectTrackId?: (trackId: number | null) => void;
}

export const parseCanonicalTrackId = (raw: any): number | null => {
  if (raw == null) return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  const str = String(raw).trim();
  const stripped = str.replace(/^T-?/i, '');
  const parsed = parseInt(stripped, 10);
  return isNaN(parsed) ? null : parsed;
};

export const LiveSurveillance: React.FC<LiveSurveillanceProps> = ({
  detections,
  zones,
  videoStatus,
  onRefreshStatus,
  selectedTrackId: propSelectedTrackId,
  onSelectTrackId,
}) => {
  // 1. Source selector order: 1. VIDEO FILE (Default), 2. THERMAL CAMERA, 3. DEMO FEED
  const [sourceMode, setSourceMode] = useState<VideoSourceMode>('video_file');
  const [isDetectionActive, setIsDetectionActive] = useState<boolean>(true);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [showTrackingIds, setShowTrackingIds] = useState<boolean>(true);
  const [thermalPalette, setThermalPalette] = useState<'ironbow' | 'white_hot' | 'black_hot' | 'rainbow'>('ironbow');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.5);
  
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(() => parseCanonicalTrackId(propSelectedTrackId));

  // Synchronize when parent passes updated selectedTrackId
  useEffect(() => {
    if (propSelectedTrackId !== undefined) {
      setSelectedTrackId(parseCanonicalTrackId(propSelectedTrackId));
    }
  }, [propSelectedTrackId]);

  const currentCanonicalTrackId = parseCanonicalTrackId(selectedTrackId);

  const handleSelectTrack = useCallback((trackId: any) => {
    const tid = parseCanonicalTrackId(trackId);
    setSelectedTrackId(tid);
    onSelectTrackId?.(tid);
  }, [onSelectTrackId]);

  // Historical session tracks persistence for Session Targets and completed session summary
  const [sessionHistoricalTracks, setSessionHistoricalTracks] = useState<SessionTrack[]>([]);

  // Synchronize live incoming ByteTrack detections into sessionHistoricalTracks
  useEffect(() => {
    if (!detections || detections.length === 0) return;

    setSessionHistoricalTracks((prev) => {
      const map = new Map<number, any>();
      prev.forEach((t) => {
        const id = parseCanonicalTrackId(t.track_id);
        if (id != null) map.set(id, t);
      });
      detections.forEach((det) => {
        const tid = parseCanonicalTrackId(det.track_id);
        if (tid != null && tid > 0) {
          const existing = map.get(tid);
          map.set(tid, {
            ...existing,
            ...det,
            track_id: tid,
            class: det.class || (det as any).class_name || existing?.class || 'Target',
            class_name: (det as any).class_name || det.class || existing?.class_name || 'Target',
            confidence: det.confidence ?? existing?.confidence ?? 0.9,
            average_confidence: det.confidence ?? existing?.average_confidence ?? existing?.confidence ?? 0.9,
            threat: Boolean(det.threat ?? existing?.threat),
            threat_level: det.threat_level || existing?.threat_level || 'HIGH',
            threat_reason: det.threat_reason || existing?.threat_reason || null,
            speed: det.speed ?? existing?.speed ?? null,
            zone: det.zone || existing?.zone || null,
            direction: det.direction || existing?.direction || null,
            bbox: det.bbox || existing?.bbox,
            last_position: det.bbox
              ? { x: (det.bbox[0] + det.bbox[2]) / 2, y: (det.bbox[1] + det.bbox[3]) / 2 }
              : existing?.last_position || null,
            timestamp: det.timestamp || existing?.timestamp || new Date().toISOString(),
          });
        }
      });
      return Array.from(map.values()).sort(
        (a, b) => (parseCanonicalTrackId(a.track_id) || 0) - (parseCanonicalTrackId(b.track_id) || 0)
      );
    });
  }, [detections]);

  // Hydrate authentic completed session tracks from backend when video is completed or stopped
  useEffect(() => {
    if (videoStatus.status === 'completed' || videoStatus.status === 'stopped') {
      const vid = videoStatus.video_id || undefined;
      apiService
        .getSessionSummary(vid)
        .then((summary) => {
          if (summary && summary.tracks && summary.tracks.length > 0) {
            setSessionHistoricalTracks((prev) => {
              const map = new Map<number, any>();
              summary.tracks.forEach((t) => {
                const tid = parseCanonicalTrackId(t.track_id);
                if (tid != null && tid > 0) {
                  const item = {
                    ...t,
                    track_id: tid,
                    class: t.class || t.class_name || 'Target',
                    class_name: t.class_name || t.class || 'Target',
                  };
                  map.set(tid, item);
                }
              });
              // Keep any live accumulated tracks not yet committed
              prev.forEach((t) => {
                const tid = parseCanonicalTrackId(t.track_id);
                if (tid != null && !map.has(tid)) {
                  map.set(tid, t);
                }
              });
              return Array.from(map.values()).sort(
                (a, b) => (parseCanonicalTrackId(a.track_id) || 0) - (parseCanonicalTrackId(b.track_id) || 0)
              );
            });
          }
        })
        .catch((err) => {
          console.error('Failed to load session summary in LiveSurveillance:', err);
        });
    }
  }, [videoStatus.status, videoStatus.video_id]);

  // Session isolation: reset selection and historical tracks when session/video changes
  const lastSessionKeyRef = useRef<string>('');
  useEffect(() => {
    const currentSessionKey = `${videoStatus.video_id || ''}-${videoStatus.session_start_time || ''}`;
    if (lastSessionKeyRef.current && lastSessionKeyRef.current !== currentSessionKey) {
      handleSelectTrack(null);
      seenTracksRef.current.clear();
      setSessionHistoricalTracks([]);
    }
    lastSessionKeyRef.current = currentSessionKey;
  }, [videoStatus.video_id, videoStatus.session_start_time, handleSelectTrack]);
  const [isFeedPaused, setIsFeedPaused] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ title: string; time: string; isThreat?: boolean } | null>(null);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [videoDims, setVideoDims] = useState<{ width: number; height: number }>({ width: 1280, height: 720 });
  const videoElemRef = useRef<HTMLVideoElement | null>(null);
  const canvasElemRef = useRef<HTMLCanvasElement | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const handlePlaybackSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoElemRef.current) {
      videoElemRef.current.playbackRate = speed;
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);
  const [isExplicitlyCleared, setIsExplicitlyCleared] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Live Activity Stream State (Authentic session & telemetry events)
  const [liveEvents, setLiveEvents] = useState<ActivityEvent[]>([]);
  const seenTracksRef = useRef<Map<number, { class: string; threat: boolean }>>(new Map());

  const addLiveEvent = useCallback((title: string, sub: string, threat: boolean = false) => {
    const time = formatIST(new Date(), { includeTimeOnly: true });
    setLiveEvents((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, time, title, sub, threat },
      ...prev.slice(0, 19),
    ]);
  }, []);

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimeStr(formatIST(new Date(), { includeTimeOnly: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Real-time Thermal Camera Hardware Hook
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    isScanning,
    isConnected: isCameraConnected,
    isConnecting,
    error: cameraError,
    stream: cameraStream,
    resolution: cameraResolution,
    fps: cameraFps,
    scanCameras,
    connectCamera,
    disconnectCamera,
    takeSnapshot,
  } = useThermalCamera();

  // Viewport Surveillance Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const recordingMimeTypeRef = useRef<string>('video/webm');
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotFnRef = useRef<(() => string | null) | null>(null);

  const filteredDetections = detections.filter((d) => {
    const tid = parseCanonicalTrackId(d.track_id);
    return tid != null && tid > 0 && d.confidence >= confidenceThreshold;
  });

  // Live Detection Summary Calculations
  const isStreamingLive = filteredDetections.length > 0;
  const isSessionFinished = !isStreamingLive && sessionHistoricalTracks.length > 0;
  const hasLiveOrSessionData = isStreamingLive || isSessionFinished;

  // Active items: currently streaming detections or final completed session tracks
  const summarySourceItems = isStreamingLive
    ? filteredDetections
    : isSessionFinished
    ? sessionHistoricalTracks
    : [];

  const classCounts = CANONICAL_MODEL_CLASSES.reduce((acc, cls) => {
    if (isStreamingLive) {
      const classDets = filteredDetections.filter(
        (d) => normalizeCanonicalClass(d.class || (d as any).class_name) === cls.key
      );
      const uniqueTracks = new Set(
        classDets
          .map((d) => parseCanonicalTrackId(d.track_id))
          .filter((id): id is number => id != null && id > 0)
      );
      acc[cls.key] = {
        detections: classDets.length,
        tracks: uniqueTracks.size,
      };
    } else if (isSessionFinished) {
      const classTracks = sessionHistoricalTracks.filter(
        (t) => normalizeCanonicalClass(t.class || (t as any).class_name) === cls.key
      );
      acc[cls.key] = {
        detections: classTracks.length,
        tracks: classTracks.length,
      };
    } else {
      acc[cls.key] = { detections: 0, tracks: 0 };
    }
    return acc;
  }, {} as Record<string, { detections: number; tracks: number }>);

  const totalDetectionsCount = isStreamingLive
    ? filteredDetections.length
    : isSessionFinished
    ? sessionHistoricalTracks.length
    : 0;

  const activeTracksCount = isStreamingLive
    ? new Set(
        filteredDetections
          .map((d) => parseCanonicalTrackId(d.track_id))
          .filter((id): id is number => id != null && id > 0)
      ).size
    : isSessionFinished
    ? sessionHistoricalTracks.length
    : 0;

  const totalThreatsCount = summarySourceItems.filter((item) => Boolean(item.threat)).length;

  const highThreatsCount = summarySourceItems.filter(
    (item) => Boolean(item.threat) && (item.threat_level === 'HIGH' || !item.threat_level)
  ).length;

  const normalTargetsCount = summarySourceItems.filter((item) => !item.threat).length;

  // Fullscreen Handler
  const toggleFullscreen = () => {
    if (!viewportRef.current) return;
    if (!document.fullscreenElement) {
      viewportRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch((err) => console.error(err));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch((err) => console.error(err));
    }
  };

  // Snapshot with Backend Storage & Feedback
  const handleSnapshot = async () => {
    try {
      let dataUrl: string | null = null;

      // 1. Capture dedicated AI surveillance snapshot (Clean thermal video + AI overlays, native video aspect ratio)
      if (snapshotFnRef.current) {
        dataUrl = snapshotFnRef.current();
      } else if (recordingCanvasRef.current) {
        dataUrl = recordingCanvasRef.current.toDataURL('image/png');
      }

      // 2. Fallback to main canvas (e.g. for Demo Mode or synthetic stream)
      if (!dataUrl && canvasElemRef.current) {
        dataUrl = canvasElemRef.current.toDataURL('image/png');
      }

      // 3. Fallback to raw video element if canvas not ready
      if (!dataUrl && videoElemRef.current && videoElemRef.current.readyState >= 2) {
        const vid = videoElemRef.current;
        const offscreen = document.createElement('canvas');
        offscreen.width = vid.videoWidth || 1280;
        offscreen.height = vid.videoHeight || 720;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.drawImage(vid, 0, 0, offscreen.width, offscreen.height);
          dataUrl = offscreen.toDataURL('image/png');
        }
      }

      if (!dataUrl) {
        throw new Error('Video stream or canvas not ready.');
      }

      // 4. Send to FastAPI backend for permanent storage in data/snapshots/
      const res = await apiService.saveSnapshot(dataUrl, 'thermal_ai_snapshot_');

      // 5. Trigger browser download with formatted timestamp filename
      try {
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const downloadFilename = res.filename || `thermal_ai_snapshot_${ts}.png`;

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = downloadFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (dlErr) {
        console.warn('Browser download trigger warning:', dlErr);
      }

      // 6. Show confirmation only after successful backend save
      const nowTime = formatIST(new Date(), { includeTimeOnly: true });
      addLiveEvent('SNAPSHOT CAPTURED', 'Thermal AI detection frame saved to data/snapshots', false);
      setToastMessage({
        title: 'AI SURVEILLANCE SNAPSHOT SAVED',
        time: nowTime,
        isThreat: false,
      });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      console.error('Snapshot capture failed:', err);
      const nowTime = formatIST(new Date(), { includeTimeOnly: true });
      const errorDetail = err?.response?.data?.detail || err?.message || 'Snapshot save failed.';
      setToastMessage({
        title: `SNAPSHOT FAILED: ${errorDetail}`,
        time: nowTime,
        isThreat: true,
      });
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Viewport Recording Implementation (Captures live thermal canvas + bounding boxes + tracking + threat overlays)
  const getSupportedVideoMimeType = (): string => {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1',
      'video/mp4',
    ];
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  };

  const startSurveillanceRecording = () => {
    if (isRecording || (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive')) {
      console.warn('Surveillance recording is already running.');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setFileError('Recording is not supported by this browser.');
      setToastMessage({
        title: 'RECORDING UNSUPPORTED',
        time: formatIST(new Date(), { includeTimeOnly: true }),
        isThreat: true,
      });
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }

    const mimeType = getSupportedVideoMimeType();
    if (!mimeType) {
      setFileError('Recording is not supported by this browser.');
      return;
    }
    recordingMimeTypeRef.current = mimeType;

    const canvas = recordingCanvasRef.current || canvasElemRef.current;
    if (!canvas) {
      setFileError('Surveillance canvas viewport not initialized.');
      return;
    }

    try {
      const stream: MediaStream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
      if (!stream) {
        setFileError('Recording is not supported by this browser.');
        return;
      }

      recordedChunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        try {
          stream.getTracks().forEach((track) => track.stop());
        } catch (e) {
          console.warn('Error stopping stream tracks:', e);
        }

        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];

        if (!chunks || chunks.length === 0) {
          console.warn('No recording chunks captured.');
          return;
        }

        const blob = new Blob(chunks, { type: recordingMimeTypeRef.current || 'video/webm' });

        if (blob.size === 0) {
          console.warn('Recorded blob is empty (0 bytes).');
          return;
        }

        const ext = (recordingMimeTypeRef.current && recordingMimeTypeRef.current.includes('mp4')) ? 'mp4' : 'webm';
        const d = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        const mm = pad(d.getMonth() + 1);
        const dd = pad(d.getDate());
        const hh = pad(d.getHours());
        const mi = pad(d.getMinutes());
        const ss = pad(d.getSeconds());
        const filename = `AI-MULTISENSE_Record_${yyyy}${mm}${dd}_${hh}${mi}${ss}.${ext}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1000);

        const sizeMb = (blob.size / (1024 * 1024)).toFixed(2);
        addLiveEvent('RECORDING SAVED', `${filename} (${sizeMb} MB)`, false);
        setToastMessage({
          title: `RECORDING DOWNLOADED: ${filename}`,
          time: formatIST(new Date(), { includeTimeOnly: true }),
          isThreat: false,
        });
        setTimeout(() => setToastMessage(null), 4000);
      };

      recorder.onerror = (event: any) => {
        console.error('MediaRecorder error:', event);
        setFileError('Recording error encountered.');
        stopSurveillanceRecording();
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      addLiveEvent('RECORDING STARTED', `Surveillance viewport capture (30 FPS, ${mimeType.split(';')[0]})`, false);
      setToastMessage({
        title: 'RECORDING ENGAGED',
        time: formatIST(new Date(), { includeTimeOnly: true }),
        isThreat: false,
      });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to start surveillance recording:', err);
      setFileError(err?.message || 'Recording is not supported by this browser.');
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const stopSurveillanceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.requestData();
        }
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        console.warn('Error stopping MediaRecorder:', e);
      }
      mediaRecorderRef.current = null;
    }

    setIsRecording(false);
  };

  // Recording Toggle Handler
  const handleToggleRecording = () => {
    if (isRecording) {
      stopSurveillanceRecording();
    } else {
      startSurveillanceRecording();
    }
  };

  // Clean up recording on component unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  // Video File Handlers
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isRecording || (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive')) {
      stopSurveillanceRecording();
    }

    setIsExplicitlyCleared(false);
    const objUrl = URL.createObjectURL(file);
    setLocalVideoUrl(objUrl);
    setIsUploading(true);
    setFileError(null);
    setIsFeedPaused(false);
    setPlaybackSpeed(1);
    if (videoElemRef.current) {
      videoElemRef.current.playbackRate = 1;
    }

    try {
      const uploadRes = await apiService.uploadVideo(file);
      if (uploadRes?.video_id) {
        const serverUrl = apiService.getVideoFileUrl(uploadRes.video_id);
        setLocalVideoUrl(serverUrl);
        try {
          URL.revokeObjectURL(objUrl);
        } catch (e) {
          // ignore
        }
      }
      onRefreshStatus();
      addLiveEvent('VIDEO LOADED', `Source: ${file.name.toUpperCase()}`, false);
      setToastMessage({
        title: `VIDEO LOADED: ${file.name.toUpperCase()}`,
        time: formatIST(new Date(), { includeTimeOnly: true }),
        isThreat: false,
      });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to upload video file.';
      setFileError(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (videoStatus.status === 'no_video_selected' && !videoStatus.video_id) {
      setIsExplicitlyCleared(false);
    }
  }, [videoStatus.status, videoStatus.video_id]);

  const status = videoStatus.status;
  const videoId = videoStatus.video_id;
  const isVideoLoaded = !isExplicitlyCleared && (Boolean(localVideoUrl) || (Boolean(videoId) && status !== 'no_video_selected'));
  const canStart = isVideoLoaded && (status === 'ready' || status === 'stopped' || status === 'completed') && !isActionPending;
  const canStop = isVideoLoaded && (status === 'processing' || status === 'paused') && !isActionPending;

  const activeVideoUrl = !isExplicitlyCleared ? (localVideoUrl || (videoId && status !== 'no_video_selected' ? apiService.getVideoFileUrl(videoId) : null)) : null;
  const isVideoPlaying = isVideoLoaded && status === 'processing';

  const handleClearVideo = async () => {
    if (isRecording || (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive')) {
      stopSurveillanceRecording();
    }
    setIsActionPending(true);
    setIsExplicitlyCleared(true);
    try {
      // 1. If video is playing, pause it first
      if (videoElemRef.current) {
        videoElemRef.current.pause();
        videoElemRef.current.currentTime = 0;
      }
      setIsFeedPaused(false);

      // 2. Stop active AI processing & clear backend active video
      if (videoId) {
        try {
          await apiService.deleteVideo(videoId);
        } catch (err) {
          console.warn('Backend video deletion warning:', err);
        }
      } else {
        try {
          await apiService.clearActiveVideo();
        } catch (err) {
          console.warn('Backend clear warning:', err);
        }
      }

      // 3. Release HTML5 video/object URL
      if (localVideoUrl) {
        try {
          URL.revokeObjectURL(localVideoUrl);
        } catch (e) {
          console.warn('Revoke object URL warning:', e);
        }
      }

      // 4. Clear selected file from frontend state
      setLocalVideoUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // 5. Clear video element source and reset dimensions
      if (videoElemRef.current) {
        videoElemRef.current.pause();
        videoElemRef.current.removeAttribute('src');
        videoElemRef.current.load();
      }
      setVideoDims({ width: 1280, height: 720 });

      // 6. Reset playback speed to 1x
      setPlaybackSpeed(1);

      // 7. Clear active track selection & error messages
      seenTracksRef.current.clear();
      setSessionHistoricalTracks([]);
      handleSelectTrack(null);
      setFileError(null);
      addLiveEvent('VIDEO CLEARED', 'Surveillance feed reset', false);

      // 8. Refresh status from backend
      if (onRefreshStatus) {
        try {
          await onRefreshStatus();
        } catch (e) {
          console.warn('Status refresh warning:', e);
        }
      }

      setToastMessage({
        title: 'VIDEO REMOVED & VIEWPORT RESET',
        time: formatIST(new Date(), { includeTimeOnly: true }),
        isThreat: false,
      });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to clear video:', err);
      setFileError('Failed to clear video.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleStartFileAnalysis = async () => {
    if (!videoId) return;
    setIsActionPending(true);
    setIsFeedPaused(false);
    try {
      if (videoElemRef.current) {
        videoElemRef.current.currentTime = 0;
      }
      await apiService.startVideoAnalysis(videoId);
      seenTracksRef.current.clear();
      setSessionHistoricalTracks([]);
      handleSelectTrack(null);
      addLiveEvent('VIDEO STARTED', 'Thermal analysis pipeline engaged', false);
      if (videoElemRef.current) {
        videoElemRef.current.playbackRate = playbackSpeed;
        videoElemRef.current.play().catch((err) => console.warn('Video play error:', err));
      }
      onRefreshStatus();
    } catch (err: any) {
      setFileError('Failed to start AI detection loop.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleStopFileAnalysis = async () => {
    if (!videoId) return;
    setIsActionPending(true);
    setIsFeedPaused(false);
    try {
      if (videoElemRef.current) {
        videoElemRef.current.pause();
        videoElemRef.current.currentTime = 0;
      }
      await apiService.stopVideoAnalysis(videoId);
      seenTracksRef.current.clear();
      addLiveEvent('VIDEO STOPPED', 'Analysis stopped by operator', false);
      onRefreshStatus();
    } catch (err: any) {
      setFileError('Failed to stop analysis.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handlePauseToggle = async () => {
    if (!isFeedPaused) {
      setIsFeedPaused(true);
      addLiveEvent('VIDEO PAUSED', 'Surveillance pipeline paused', false);
      if (videoElemRef.current) {
        videoElemRef.current.pause();
      }
      if (videoId && status === 'processing') {
        try {
          await apiService.pauseVideoAnalysis(videoId);
          onRefreshStatus();
        } catch (e) {
          console.warn('Pause backend error:', e);
        }
      }
    } else {
      setIsFeedPaused(false);
      addLiveEvent('VIDEO RESUMED', 'Surveillance pipeline resumed', false);
      if (videoElemRef.current) {
        videoElemRef.current.playbackRate = playbackSpeed;
        videoElemRef.current.play().catch((err) => console.warn('Resume play error:', err));
      }
      if (videoId && (status === 'paused' || status === 'processing')) {
        try {
          await apiService.resumeVideoAnalysis(videoId);
          onRefreshStatus();
        } catch (e) {
          console.warn('Resume backend error:', e);
        }
      }
    }
  };

  const handleRestart = async () => {
    setPlaybackSpeed(1);
    if (videoElemRef.current) {
      videoElemRef.current.playbackRate = 1;
    }
    if (!videoId) return;
    setIsActionPending(true);
    setIsFeedPaused(false);
    try {
      if (videoElemRef.current) {
        videoElemRef.current.pause();
        videoElemRef.current.currentTime = 0;
      }
      await apiService.startVideoAnalysis(videoId);
      seenTracksRef.current.clear();
      handleSelectTrack(null);
      addLiveEvent('VIDEO RESTARTED', 'Analysis restarted from beginning', false);
      if (videoElemRef.current) {
        videoElemRef.current.playbackRate = 1;
        videoElemRef.current.play().catch((err) => console.warn('Restart play error:', err));
      }
      onRefreshStatus();
    } catch (err: any) {
      setFileError('Failed to restart analysis.');
    } finally {
      setIsActionPending(false);
    }
  };

  const formatSecs = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Stream authentic ByteTrack detection and threat events into Live Activity
  useEffect(() => {
    if (sourceMode === 'video_file' && !isVideoLoaded) {
      return;
    }
    filteredDetections.forEach((det) => {
      const existing = seenTracksRef.current.get(det.track_id);
      if (!existing) {
        seenTracksRef.current.set(det.track_id, { class: det.class, threat: det.threat });
        if (det.threat) {
          addLiveEvent(
            `${det.class.toUpperCase()} T-${det.track_id} DETECTED`,
            det.threat_reason || 'Threat detected',
            true
          );
        } else {
          addLiveEvent(
            `${det.class.toUpperCase()} T-${det.track_id} TRACKED`,
            `Confidence ${(det.confidence * 100).toFixed(1)}%`,
            false
          );
        }
      } else if (!existing.threat && det.threat) {
        existing.threat = true;
        addLiveEvent(
          `${det.class.toUpperCase()} T-${det.track_id} THREAT DETECTED`,
          det.threat_reason || 'Threat detected',
          true
        );
      }
    });
  }, [filteredDetections, sourceMode, isVideoLoaded, addLiveEvent]);

  // Track source mode transitions for activity stream
  const prevSourceModeRef = useRef<VideoSourceMode>(sourceMode);
  useEffect(() => {
    if (prevSourceModeRef.current !== sourceMode) {
      if (sourceMode === 'demo_feed') {
        addLiveEvent('DEMO MODE ACTIVE', 'Simulated synthetic thermal feed engaged', false);
      } else if (sourceMode === 'thermal_camera') {
        addLiveEvent('HARDWARE SENSOR MODE', 'Hardware camera interface active', false);
      } else if (sourceMode === 'video_file') {
        addLiveEvent('VIDEO FILE MODE', 'Thermal video input mode active', false);
      }
      prevSourceModeRef.current = sourceMode;
    }
  }, [sourceMode, addLiveEvent]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="page-container space-y-5 select-none font-sans w-full max-w-full min-w-0 relative"
    >
      {/* ======================================================== */}
      {/* 1. PAGE HEADER                                           */}
      {/* ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)] w-full max-w-full">
        <div className="min-w-0">
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-wider text-[var(--text-primary)] font-sans uppercase flex items-center gap-2.5 truncate">
              <Film className="w-5 h-5 text-[var(--thermal-cyan)] shrink-0" />
              LIVE SURVEILLANCE
            </h1>

            {/* Live Operational Badge */}
            <div className="flex items-center space-x-2 bg-[#08121E] px-3.5 py-1 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--operational-green)]">
              <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]" />
              <span className="font-semibold tracking-wide">SYSTEM OPERATIONAL</span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-0.5 truncate">
            Real-time thermal intelligence and object detection
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
          {/* Active Source Indicator */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3.5 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--thermal-cyan)]">
            <span className="text-[var(--text-muted)]">INPUT:</span>
            <span className="font-bold">
              {sourceMode === 'video_file'
                ? 'VIDEO FILE'
                : sourceMode === 'thermal_camera'
                ? 'THERMAL CAMERA'
                : 'DEMO FEED'}
            </span>
          </div>

          {/* Live IST Clock */}
          <div className="flex items-center space-x-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]">
            <Clock className="w-3.5 h-3.5 text-[var(--thermal-cyan)] shrink-0" />
            <span>{currentTimeStr || '00:00:00 IST'}</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. SOURCE SELECTOR & CONFIGURATION CONSOLE              */}
      {/* ======================================================== */}
      <Card className="p-4 sm:p-5 w-full max-w-full min-w-0 space-y-4 bg-[#070B12] border-[var(--border-subtle)]">
        {/* Source Switcher Header (Strict Order: 1. VIDEO FILE, 2. THERMAL CAMERA, 3. DEMO FEED) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center space-x-2.5 min-w-0">
            <Film className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
            <span className="text-xs font-bold font-sans uppercase text-[var(--text-primary)] tracking-wide">
              SURVEILLANCE INPUT SOURCE
            </span>
          </div>

          {/* Segmented Source Selector */}
          <div className="flex items-center space-x-1.5 p-1 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex-wrap gap-1">
            {/* 1. VIDEO FILE (Default) */}
            <button
              onClick={() => setSourceMode('video_file')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all duration-200 cursor-pointer flex items-center space-x-2 ${
                sourceMode === 'video_file'
                  ? 'bg-[var(--thermal-cyan)] text-[#05080D] shadow-md shadow-[var(--thermal-cyan)]/20 font-bold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>1. VIDEO FILE</span>
            </button>

            {/* 2. THERMAL CAMERA */}
            <button
              onClick={() => setSourceMode('thermal_camera')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all duration-200 cursor-pointer flex items-center space-x-2 ${
                sourceMode === 'thermal_camera'
                  ? 'bg-[var(--thermal-cyan)] text-[#05080D] shadow-md shadow-[var(--thermal-cyan)]/20 font-bold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>2. THERMAL CAMERA</span>
            </button>

            {/* 3. DEMO FEED */}
            <button
              onClick={() => setSourceMode('demo_feed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all duration-200 cursor-pointer flex items-center space-x-2 ${
                sourceMode === 'demo_feed'
                  ? 'bg-[var(--thermal-cyan)] text-[#05080D] shadow-md shadow-[var(--thermal-cyan)]/20 font-bold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>3. DEMO FEED</span>
            </button>
          </div>
        </div>

        {/* 2A. MODE 1: VIDEO FILE WORKSTATION */}
        {sourceMode === 'video_file' && (
          <div className="space-y-3.5">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".mp4,.avi,.mov,.mkv"
              className="hidden"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
              <div className="flex items-center space-x-2">
                <span className="text-[var(--text-muted)] font-mono">FILE:</span>
                <span className="font-mono font-semibold text-[var(--text-primary)] bg-[var(--bg-surface-secondary)] px-3 py-1 rounded-lg border border-[var(--border-subtle)] truncate max-w-sm">
                  {isVideoLoaded ? (videoStatus.filename || 'THERMAL_PATROL_01.MP4') : 'NO VIDEO SELECTED'}
                </span>
                {isVideoLoaded && (
                  <span className="text-[var(--text-muted)] font-mono">
                    {videoDims.width} × {videoDims.height}
                  </span>
                )}
              </div>

              <Badge variant={!isVideoLoaded ? 'amber' : status === 'processing' ? 'emerald' : status === 'paused' ? 'amber' : status === 'ready' ? 'cyan' : 'amber'}>
                {!isVideoLoaded ? 'NO VIDEO SELECTED' : status === 'processing' ? 'AI INFERENCE ACTIVE' : status === 'paused' ? 'PLAYBACK PAUSED' : status === 'ready' ? 'FILE LOADED & READY' : status.toUpperCase()}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                onClick={handleUploadClick}
                disabled={isUploading}
                className="px-4 py-2 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center space-x-2 disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
              >
                {isUploading ? <Loader2 className="w-4 h-4 text-[var(--thermal-cyan)] animate-spin" /> : <Upload className="w-4 h-4 text-[var(--thermal-cyan)]" />}
                <span>{isUploading ? 'Uploading Video...' : 'SELECT THERMAL VIDEO'}</span>
              </button>

              <button
                onClick={handleStartFileAnalysis}
                disabled={!canStart}
                className="px-4 py-2 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center space-x-2 shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                {isActionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{status === 'processing' ? 'DETECTION IN PROGRESS' : 'START AI DETECTION'}</span>
              </button>

              <button
                onClick={handlePauseToggle}
                disabled={status !== 'processing' && status !== 'paused'}
                className="px-3.5 py-2 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm shrink-0"
              >
                {isFeedPaused || status === 'paused' ? (
                  <>
                    <Play className="w-3.5 h-3.5 text-[var(--operational-green)]" />
                    <span>RESUME</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5 text-[var(--warning-amber)]" />
                    <span>PAUSE</span>
                  </>
                )}
              </button>

              <button
                onClick={handleStopFileAnalysis}
                disabled={!canStop}
                className="px-4 py-2 rounded-xl bg-[var(--threat-coral)]/15 hover:bg-[var(--threat-coral)]/25 text-[var(--threat-coral)] border border-[var(--threat-coral)]/30 font-semibold text-xs transition-all flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                {isActionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                <span>STOP</span>
              </button>

              <button
                onClick={handleRestart}
                disabled={!videoId && !localVideoUrl}
                className="px-3.5 py-2 rounded-xl btn-secondary-interactive text-xs font-sans flex items-center space-x-1.5 cursor-pointer text-[var(--text-secondary)] disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>RESTART</span>
              </button>

              {/* CLEAR VIDEO - Visible only when a video file is currently loaded */}
              {isVideoLoaded && (
                <button
                  onClick={handleClearVideo}
                  disabled={isActionPending}
                  className="px-3.5 py-2 rounded-xl bg-[var(--threat-coral)]/10 hover:bg-[var(--threat-coral)]/20 text-[var(--threat-coral)] border border-[var(--threat-coral)]/25 hover:border-[var(--threat-coral)]/40 font-semibold text-xs transition-all flex items-center space-x-1.5 cursor-pointer shadow-sm shrink-0 disabled:opacity-40"
                  title="Remove loaded video and reset viewport"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>CLEAR VIDEO</span>
                </button>
              )}

              {/* Compact Playback Speed Selector */}
              <div className="flex items-center space-x-1 bg-[var(--bg-surface-secondary)] px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] shrink-0 shadow-xs">
                <div className="flex items-center space-x-1 text-[11px] font-mono text-[var(--text-muted)] pr-1.5 border-r border-[var(--border-subtle)]">
                  <Gauge className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
                  <span className="font-medium">SPEED</span>
                </div>
                <div className="flex items-center space-x-0.5">
                  {([0.25, 0.5, 1, 1.5, 2] as const).map((spd) => {
                    const isSelected = playbackSpeed === spd;
                    return (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => handlePlaybackSpeedChange(spd)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--thermal-cyan)] text-[#05080D] font-bold shadow-xs'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] font-medium'
                        }`}
                        title={`Set playback speed to ${spd}×`}
                      >
                        {spd}×
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {fileError && (
              <div className="p-3 bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/30 rounded-xl text-[var(--threat-coral)] text-xs flex items-center space-x-2 font-sans">
                <AlertTriangle className="w-4 h-4 text-[var(--threat-coral)] shrink-0" />
                <span>{fileError}</span>
              </div>
            )}
          </div>
        )}

        {/* 2B. MODE 2: THERMAL CAMERA HARDWARE LINK */}
        {sourceMode === 'thermal_camera' && (
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5 flex-1 min-w-[240px] max-w-md">
                <Camera className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  disabled={isCameraConnected || isConnecting}
                  className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] disabled:opacity-60 cursor-pointer"
                >
                  {devices.length === 0 ? (
                    <option value="">CAM-01 (FLIR AX65 Long-Wave Infrared Array)</option>
                  ) : (
                    devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {isCameraConnected ? (
                  <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[var(--operational-green)]/15 border border-[var(--operational-green)]/30 text-[var(--operational-green)] text-xs font-mono font-semibold">
                    <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live shadow-[0_0_6px_var(--operational-green)]" />
                    <span>● THERMAL CAMERA ONLINE (STREAM ACTIVE)</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] text-[var(--warning-amber)] text-xs font-mono">
                    <span className="w-2 h-2 rounded-full bg-[var(--warning-amber)]" />
                    <span>○ NOT DETECTED (HARDWARE STANDBY)</span>
                  </div>
                )}
              </div>
            </div>

            {!isCameraConnected && (
              <div className="p-3.5 bg-[#0D1420] border border-[var(--border-subtle)] rounded-xl text-xs font-sans text-[var(--text-secondary)] flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-[var(--text-primary)]">THERMAL CAMERA NOT DETECTED</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Waiting for compatible thermal imaging device (FLIR LWIR or USB capture card). You can also use Video File mode or Demo Feed.
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => scanCameras()}
                    disabled={isScanning}
                    className="px-3 py-1.5 rounded-lg btn-secondary-interactive text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
                  >
                    {isScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />}
                    <span>SCAN AGAIN</span>
                  </button>
                  <button
                    onClick={() => setSourceMode('video_file')}
                    className="px-3 py-1.5 rounded-lg bg-[var(--thermal-cyan)]/15 text-[var(--thermal-cyan)] border border-[var(--thermal-cyan)]/30 text-xs font-semibold cursor-pointer"
                  >
                    USE VIDEO FILE
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                onClick={() => scanCameras()}
                disabled={isScanning || isCameraConnected}
                className="px-3.5 py-2 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center space-x-2 disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
              >
                {isScanning ? <Loader2 className="w-4 h-4 animate-spin text-[var(--thermal-cyan)]" /> : <Camera className="w-4 h-4 text-[var(--thermal-cyan)]" />}
                <span>SCAN FOR CAMERAS</span>
              </button>

              {!isCameraConnected ? (
                <button
                  onClick={() => connectCamera()}
                  disabled={isConnecting}
                  className="px-4 py-2 rounded-xl btn-primary-interactive text-xs font-semibold flex items-center space-x-2 shadow-md disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                  <span>CONNECT CAMERA</span>
                </button>
              ) : (
                <button
                  onClick={disconnectCamera}
                  className="px-4 py-2 rounded-xl bg-[var(--threat-coral)]/15 hover:bg-[var(--threat-coral)]/25 text-[var(--threat-coral)] border border-[var(--threat-coral)]/30 font-semibold text-xs transition-all flex items-center space-x-2 cursor-pointer shrink-0"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>DISCONNECT CAMERA</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2C. MODE 3: DEMO FEED SIMULATION */}
        {sourceMode === 'demo_feed' && (
          <div className="p-3.5 bg-[#0D1420] border border-[var(--thermal-cyan)]/25 rounded-xl text-xs font-sans text-[var(--text-secondary)] flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="font-semibold text-[var(--thermal-cyan)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--thermal-cyan)] pulse-live" />
                <span>● DEMO MODE ACTIVE</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Displaying high-fidelity simulated thermal patrol feed for workstation verification and rule testing.
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => setSourceMode('video_file')}
                className="px-3.5 py-1.5 rounded-lg btn-primary-interactive text-xs font-semibold cursor-pointer"
              >
                SWITCH TO VIDEO FILE
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ======================================================== */}
      {/* 3. WORKSTATION CONTROL & OVERLAY BAR                     */}
      {/* ======================================================== */}
      <Card className="p-3.5 w-full max-w-full min-w-0 bg-[#070B12]">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePauseToggle}
              className="px-3 py-1.5 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              {isFeedPaused ? <Play className="w-3.5 h-3.5 text-[var(--operational-green)]" /> : <Pause className="w-3.5 h-3.5 text-[var(--warning-amber)]" />}
              <span>{isFeedPaused ? 'RESUME' : 'PAUSE'}</span>
            </button>

            <button
              onClick={handleSnapshot}
              className="px-3 py-1.5 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Capture instantaneous frame"
            >
              <Camera className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />
              <span>SNAPSHOT</span>
            </button>

            <button
              onClick={handleToggleRecording}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                isRecording
                  ? 'bg-[var(--threat-coral)] text-white shadow-lg animate-pulse'
                  : 'btn-secondary-interactive text-[var(--threat-coral)]'
              }`}
              title={isRecording ? 'Click to stop recording and download video' : 'Record surveillance view'}
            >
              <CircleDot className={`w-3.5 h-3.5 ${isRecording ? 'animate-spin' : ''}`} />
              <span>{isRecording ? `● STOP RECORDING (${formatSecs(recordingSeconds)})` : 'RECORD'}</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="px-3 py-1.5 rounded-xl btn-secondary-interactive text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5 text-[var(--thermal-cyan)]" />}
              <span>{isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}</span>
            </button>
          </div>

          {/* Secondary Overlays & Palette */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showBoundingBoxes}
                onChange={(e) => setShowBoundingBoxes(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--thermal-cyan)]"
              />
              <span className="text-[11px] text-[var(--text-primary)]">Bounding Boxes</span>
            </label>

            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showTrackingIds}
                onChange={(e) => setShowTrackingIds(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--thermal-cyan)]"
              />
              <span className="text-[11px] text-[var(--text-primary)]">Tracking Trails</span>
            </label>

            {/* Palette */}
            <div className="flex items-center space-x-1.5">
              <Palette className="w-3.5 h-3.5 text-[var(--intelligence-violet)]" />
              <select
                value={thermalPalette}
                onChange={(e: any) => setThermalPalette(e.target.value)}
                className="bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-[11px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--thermal-cyan)] cursor-pointer"
              >
                <option value="ironbow">Ironbow (LWIR)</option>
                <option value="white_hot">White Hot</option>
                <option value="black_hot">Black Hot</option>
                <option value="rainbow">Rainbow Dynamic</option>
              </select>
            </div>

            {/* Min Conf Slider */}
            <div className="flex items-center space-x-2">
              <Sliders className="w-3.5 h-3.5 text-[var(--warning-amber)]" />
              <input
                type="range"
                min="0.2"
                max="0.9"
                step="0.05"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                className="w-20 h-1.5 bg-[var(--bg-surface-secondary)] rounded-lg appearance-none cursor-pointer accent-[var(--thermal-cyan)]"
              />
              <span className="font-mono text-[11px] font-semibold text-[var(--thermal-cyan)] w-8">
                {(confidenceThreshold * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* ======================================================== */}
      {/* 4. MAIN WORKSPACE GRID: HERO VIEWPORT (72%) / TELEMETRY (28%) */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-full min-w-0 items-start">
        {/* HERO THERMAL SURVEILLANCE VIEWPORT (72% / 8 Cols) */}
        <div className="lg:col-span-8 space-y-4 w-full max-w-full min-w-0">
          <div
            ref={viewportRef}
            className={`rounded-2xl border border-[var(--border-subtle)] bg-[#05080D] p-3.5 sm:p-4 shadow-2xl relative overflow-hidden transition-colors w-full max-w-full min-w-0 ${
              isFullscreen ? 'fixed inset-0 z-50 rounded-none p-6 bg-[#05080D]' : ''
            }`}
          >
            {/* Viewport Top HUD Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5 mb-2.5 z-20 relative">
              <div className="flex items-center space-x-3 text-xs font-sans">
                <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[var(--operational-green)]/15 border border-[var(--operational-green)]/30 text-[var(--operational-green)] font-mono font-bold text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--operational-green)] pulse-live" />
                  <span>LIVE</span>
                </span>
                <span className="text-[var(--text-primary)] font-mono font-bold text-xs">
                  CAM-01 • SECTOR ALPHA-4
                </span>
                <span className="hidden sm:inline text-[var(--text-muted)]">|</span>
                <span className="hidden sm:inline text-[var(--text-secondary)] text-[11px]">
                  {sourceMode === 'video_file'
                    ? 'RECORDED THERMAL VIDEO'
                    : sourceMode === 'thermal_camera'
                    ? (isCameraConnected ? 'FLIR AX65 LWIR' : 'HARDWARE SENSOR (OFFLINE)')
                    : 'SIMULATED DEMO FEED'}
                </span>
              </div>

              <div className="flex items-center space-x-2 text-xs font-mono text-[var(--text-secondary)]">
                <span className="text-[var(--thermal-cyan)] font-semibold">
                  FPS {sourceMode === 'thermal_camera' && isCameraConnected ? (cameraFps || 30.0).toFixed(1) : sourceMode === 'video_file' ? (status === 'processing' ? '30.0' : '0.0') : '29.8'}
                </span>
                <span>•</span>
                <span>{sourceMode === 'video_file' ? `${videoDims.width} × ${videoDims.height}` : '1280 × 720'}</span>
              </div>
            </div>

            {/* Thermal Canvas Hero Video Display */}
            <div className="w-full max-w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] relative">
              <ThermalCanvas
                detections={!isDetectionActive || !showBoundingBoxes || (sourceMode === 'video_file' && !isVideoLoaded) ? [] : filteredDetections}
                zones={zones}
                width={800}
                height={450}
                videoStream={cameraStream}
                videoUrl={activeVideoUrl}
                isPlaying={isVideoPlaying}
                isPaused={isFeedPaused || status === 'paused'}
                isCameraConnected={isCameraConnected}
                sourceMode={sourceMode}
                onSwitchToDemo={() => setSourceMode('demo_feed')}
                onConnectCamera={() => connectCamera()}
                onVideoEnded={() => onRefreshStatus()}
                onVideoDimensionsLoaded={(dims) => setVideoDims(dims)}
                videoRef={videoElemRef}
                canvasRef={canvasElemRef}
                recordingCanvasRef={recordingCanvasRef}
                snapshotFnRef={snapshotFnRef}
                isRecording={isRecording}
                playbackRate={playbackSpeed}
                status={status}
                selectedTrackId={selectedTrackId}
                onSelectTrack={(trackId) => handleSelectTrack(trackId)}
              />
            </div>

            {/* Viewport Bottom Overlay Telemetry Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 text-[10px] font-mono text-[var(--text-secondary)]">
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                <span>ACTIVE TRACKS:</span>
                <span className="text-[var(--thermal-cyan)] font-bold">
                  {(sourceMode === 'video_file' && !isVideoLoaded ? 0 : filteredDetections.length).toString().padStart(2, '0')}
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                <span>DETECTIONS:</span>
                <span className="text-[var(--intelligence-violet)] font-bold">
                  {(sourceMode === 'video_file' && !isVideoLoaded ? 0 : filteredDetections.length).toString().padStart(2, '0')}
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                <span>INFERENCE LATENCY:</span>
                <span className="text-[var(--operational-green)] font-bold">14.2ms</span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex justify-between items-center">
                <span>SPECTRUM:</span>
                <span className="text-[var(--text-primary)] uppercase">{thermalPalette.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: TARGET INTELLIGENCE & TELEMETRY PANEL (28% / 4 Cols) */}
        <div className="lg:col-span-4 space-y-4 w-full max-w-full min-w-0">
          {/* 1. Live Detection Summary Panel */}
          <Card id="live-detection-summary-panel" className="p-4 space-y-3.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center space-x-2 min-w-0">
                <Activity className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)] font-sans uppercase tracking-wider truncate">
                    LIVE DETECTION SUMMARY
                  </h3>
                  <div className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
                    {hasLiveOrSessionData ? (
                      <>
                        <span className={`w-1.5 h-1.5 rounded-full ${isStreamingLive ? 'bg-[var(--operational-green)] pulse-live' : 'bg-[var(--thermal-cyan)]'}`} />
                        <span className={isStreamingLive ? 'text-[var(--operational-green)] font-semibold' : 'text-[var(--thermal-cyan)] font-semibold'}>
                          REAL-TIME AI INFERENCE
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                        <span>WAITING FOR THERMAL DETECTIONS</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] shrink-0">
                YOLOv8 + ByteTrack
              </span>
            </div>

            {/* Model Class Breakdown (Canonical 5 Classes) */}
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] uppercase px-2.5 pb-0.5 border-b border-[var(--border-subtle)]/60">
                <span>CLASS</span>
                <div className="flex items-center space-x-6">
                  <span title="Detections in current frame / session">DETECTIONS</span>
                  <span title="Active ByteTrack tracks">ACTIVE TRACKS</span>
                </div>
              </div>

              {CANONICAL_MODEL_CLASSES.map((cls) => {
                const detCount = classCounts[cls.key]?.detections ?? 0;
                const trkCount = classCounts[cls.key]?.tracks ?? 0;
                const hasAny = detCount > 0 || trkCount > 0;
                return (
                  <div
                    key={cls.key}
                    id={`summary-class-${cls.key}`}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all ${
                      hasAny
                        ? 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-surface-secondary)]/30 border-[var(--border-subtle)]/30 text-[var(--text-muted)]'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasAny
                            ? cls.key === 'person_with_bag'
                              ? 'bg-[var(--threat-coral)]'
                              : 'bg-[var(--thermal-cyan)]'
                            : 'bg-[var(--text-muted)]/30'
                        }`}
                      />
                      <span className="font-sans font-semibold text-xs tracking-wide">{cls.label}</span>
                    </div>
                    <div className="flex items-center space-x-6">
                      <span className={`font-bold ${detCount > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                        {detCount.toString().padStart(2, '0')}
                      </span>
                      <span className={`font-bold ${trkCount > 0 ? 'text-[var(--thermal-cyan)]' : 'text-[var(--text-muted)]'}`}>
                        {trkCount.toString().padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals Summary */}
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-xs">
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase">TOTAL DETECTIONS</span>
                <span className="text-base font-bold text-[var(--intelligence-violet)] mt-0.5">
                  {totalDetectionsCount.toString().padStart(2, '0')}
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase">ACTIVE TRACKS</span>
                <span className="text-base font-bold text-[var(--thermal-cyan)] mt-0.5">
                  {activeTracksCount.toString().padStart(2, '0')}
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase">THREATS</span>
                <span className={`text-base font-bold mt-0.5 ${totalThreatsCount > 0 ? 'text-[var(--threat-coral)]' : 'text-[var(--operational-green)]'}`}>
                  {totalThreatsCount.toString().padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* 3. Threat Status Summary */}
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between text-xs font-sans">
                <span className="font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-[var(--threat-coral)]" />
                  THREAT STATUS
                </span>
                {totalThreatsCount > 0 ? (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--threat-coral)]/15 text-[var(--threat-coral)] border border-[var(--threat-coral)]/30 font-bold">
                    ALERT ACTIVE
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--operational-green)]/15 text-[var(--operational-green)] border border-[var(--operational-green)]/30 font-bold">
                    ALL CLEAR
                  </span>
                )}
              </div>

              {totalThreatsCount === 0 ? (
                <div className="p-2.5 bg-[var(--operational-green)]/10 border border-[var(--operational-green)]/30 rounded-xl flex items-center justify-between text-xs font-mono">
                  <span className="text-[var(--operational-green)] font-bold tracking-wide flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--operational-green)]" />
                    NO ACTIVE THREATS
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">PERIMETER SECURE</span>
                </div>
              ) : (
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="p-2 bg-[var(--threat-coral)]/10 border border-[var(--threat-coral)]/30 rounded-xl flex items-center justify-between">
                    <span className="text-[var(--threat-coral)] font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--threat-coral)] pulse-live" />
                      HIGH THREATS
                    </span>
                    <span className="text-[var(--threat-coral)] font-bold text-sm">
                      {highThreatsCount.toString().padStart(2, '0')}
                    </span>
                  </div>
                  <div className="p-2 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">NORMAL TARGETS</span>
                    <span className="text-[var(--operational-green)] font-bold text-sm">
                      {normalTargetsCount.toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* 2. Active Targets Buffer */}
          <Card className="p-4 space-y-2.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 text-xs font-sans">
              <span className="font-bold text-[var(--text-primary)] uppercase tracking-wider">
                ACTIVE TARGETS ({sourceMode === 'video_file' && !isVideoLoaded ? 0 : filteredDetections.length})
              </span>
              <span className="text-[10px] font-mono text-[var(--thermal-cyan)]">TRACKING: ByteTrack</span>
            </div>

            <div data-lenis-prevent className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {(sourceMode === 'video_file' && !isVideoLoaded) || filteredDetections.length === 0 ? (
                <div className="text-center py-6 px-4 border border-dashed border-[var(--border-subtle)] rounded-xl space-y-1">
                  <div className="text-xs font-mono font-bold text-[var(--text-secondary)]">NO ACTIVE TARGETS</div>
                  <div className="text-[11px] text-[var(--text-muted)]">Waiting for thermal detections...</div>
                </div>
              ) : (
                filteredDetections.map((det) => {
                  const cTid = parseCanonicalTrackId(det.track_id);
                  const isSelected = currentCanonicalTrackId != null && cTid === currentCanonicalTrackId;
                  const displayClass = (det.class || (det as any).class_name || 'TARGET').replace(/_/g, ' ');
                  return (
                    <div
                      key={`active-track-${cTid ?? det.id}`}
                      id={`active-target-${cTid}`}
                      onClick={() => handleSelectTrack(cTid ?? det.track_id)}
                      onPointerDown={() => handleSelectTrack(cTid ?? det.track_id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectTrack(cTid ?? det.track_id);
                        }
                      }}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs font-sans ${
                        isSelected
                          ? 'bg-[var(--thermal-cyan)]/15 border-[var(--thermal-cyan)]/60 text-[var(--text-primary)] shadow-[0_0_12px_rgba(85,217,245,0.2)]'
                          : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${det.threat ? 'bg-[var(--threat-coral)] pulse-live' : 'bg-[var(--operational-green)]'}`} />
                        <span className="font-mono font-bold text-[var(--thermal-cyan)] shrink-0">T-{cTid}</span>
                        <span className="truncate font-semibold text-[var(--text-primary)] uppercase">{displayClass}</span>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          det.threat
                            ? 'bg-[var(--threat-coral)]/15 text-[var(--threat-coral)] border border-[var(--threat-coral)]/30'
                            : 'bg-[var(--operational-green)]/15 text-[var(--operational-green)] border border-[var(--operational-green)]/30'
                        }`}>
                          {det.threat ? `THREAT · ${det.threat_level || 'HIGH'}` : 'NORMAL'}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">
                          {((det.confidence ?? 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* 2b. Session Historical Targets */}
          {(videoStatus.status === 'completed' || videoStatus.status === 'stopped' || sessionHistoricalTracks.length > 0) && (
            <Card id="session-targets-panel" className="p-4 space-y-2.5 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 text-xs font-sans">
                <span className="font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--warning-amber)]" />
                  SESSION TARGETS ({sessionHistoricalTracks.length})
                </span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {videoStatus.status === 'completed' ? 'COMPLETED SESSION' : 'HISTORICAL TRACKS'}
                </span>
              </div>

              <div data-lenis-prevent className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {sessionHistoricalTracks.length === 0 ? (
                  <div className="text-center py-6 px-4 border border-dashed border-[var(--border-subtle)] rounded-xl space-y-1">
                    <div className="text-xs font-mono font-bold text-[var(--text-secondary)]">NO SESSION TARGETS</div>
                    <div className="text-[11px] text-[var(--text-muted)]">No historical tracks recorded for this session.</div>
                  </div>
                ) : (
                  sessionHistoricalTracks.map((trk) => {
                    const cTid = parseCanonicalTrackId(trk.track_id);
                    const isSelected = currentCanonicalTrackId != null && cTid === currentCanonicalTrackId;
                    const displayClass = (trk.class || (trk as any).class_name || 'TARGET').replace(/_/g, ' ');
                    const conf = trk.confidence ?? (trk as any).average_confidence ?? 0;
                    return (
                      <div
                        key={`session-track-${cTid ?? trk.track_id}`}
                        id={`session-target-${cTid}`}
                        onClick={() => handleSelectTrack(cTid ?? trk.track_id)}
                        onPointerDown={() => handleSelectTrack(cTid ?? trk.track_id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectTrack(cTid ?? trk.track_id);
                          }
                        }}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs font-sans ${
                          isSelected
                            ? 'bg-[var(--thermal-cyan)]/15 border-[var(--thermal-cyan)]/60 text-[var(--text-primary)] shadow-[0_0_12px_rgba(85,217,245,0.2)]'
                            : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${trk.threat ? 'bg-[var(--threat-coral)]' : 'bg-[var(--operational-green)]'}`} />
                          <span className="font-mono font-bold text-[var(--thermal-cyan)] shrink-0">T-{cTid}</span>
                          <span className="truncate font-semibold text-[var(--text-primary)] uppercase">{displayClass}</span>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            trk.threat
                              ? 'bg-[var(--threat-coral)]/15 text-[var(--threat-coral)] border border-[var(--threat-coral)]/30'
                              : 'bg-[var(--operational-green)]/15 text-[var(--operational-green)] border border-[var(--operational-green)]/30'
                          }`}>
                            {trk.threat ? `THREAT · ${trk.threat_level || 'HIGH'}` : 'NORMAL'}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            {(conf * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          )}

          {/* 3. Live Activity Stream */}
          <Card className="p-4 space-y-3 w-full max-w-full min-w-0 bg-[#070B12] border-[var(--border-subtle)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 text-xs font-sans">
              <span className="font-bold text-[var(--text-primary)] uppercase tracking-wider">
                LIVE ACTIVITY STREAM
              </span>
              <span className="text-[10px] font-mono text-[var(--operational-green)]">REAL-TIME</span>
            </div>

            <div data-lenis-prevent className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {liveEvents.length === 0 ? (
                <div className="text-center py-6 px-4 border border-dashed border-[var(--border-subtle)] rounded-xl space-y-1">
                  <div className="text-xs font-mono font-bold text-[var(--text-secondary)]">NO RECENT ACTIVITY</div>
                  <div className="text-[11px] text-[var(--text-muted)]">Waiting for thermal security events...</div>
                </div>
              ) : (
                liveEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-2.5 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-subtle)] space-y-1 text-xs font-sans"
                  >
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className={`font-bold ${evt.threat ? 'text-[var(--threat-coral)]' : 'text-[var(--text-primary)]'}`}>
                        {evt.title}
                      </span>
                      <span className="text-[var(--text-muted)]">{evt.time}</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] truncate">
                      {evt.sub}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 5. FLOATING BOTTOM TOAST FEEDBACK                         */}
      {/* ======================================================== */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border flex items-center space-x-3 font-sans text-xs ${
              toastMessage.isThreat
                ? 'bg-[#180A0E] border-[var(--threat-coral)]/50 text-[var(--threat-coral)]'
                : 'bg-[#0A121E] border-[var(--thermal-cyan)]/50 text-[var(--text-primary)]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-[var(--thermal-cyan)] shrink-0" />
            <div>
              <div className="font-bold text-xs">{toastMessage.title}</div>
              <div className="text-[10px] font-mono text-[var(--text-secondary)]">{toastMessage.time}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default LiveSurveillance;
