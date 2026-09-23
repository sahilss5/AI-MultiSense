import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ThermalDetectionObject, Zone } from '../../types/schema';

interface ThermalCanvasProps {
  detections: ThermalDetectionObject[];
  zones: Zone[];
  width?: number;
  height?: number;
  videoStream?: MediaStream | null;
  videoUrl?: string | null;
  isPlaying?: boolean;
  isPaused?: boolean;
  isCameraConnected?: boolean;
  sourceMode?: 'thermal_camera' | 'video_file' | 'demo_feed';
  onSwitchToDemo?: () => void;
  onConnectCamera?: () => void;
  onVideoEnded?: () => void;
  onVideoDimensionsLoaded?: (dims: { width: number; height: number }) => void;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  recordingCanvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  isRecording?: boolean;
  playbackRate?: number;
  snapshotFnRef?: React.MutableRefObject<(() => string | null) | null>;
  status?: string;
  selectedTrackId?: number | null;
  onSelectTrack?: (trackId: number) => void;
}

interface TargetAnimState {
  currentBbox: [number, number, number, number];
  opacity: number;
  scale: number;
  entryTime: number;
  displayConf: number;
}

export const ThermalCanvas: React.FC<ThermalCanvasProps> = ({
  detections,
  zones,
  width = 800,
  height = 450,
  videoStream = null,
  videoUrl = null,
  isPlaying = false,
  isPaused = false,
  isCameraConnected = false,
  sourceMode = 'demo_feed',
  onSwitchToDemo,
  onConnectCamera,
  onVideoEnded,
  onVideoDimensionsLoaded,
  videoRef,
  canvasRef: externalCanvasRef,
  recordingCanvasRef,
  playbackRate = 1,
  snapshotFnRef,
  status,
  selectedTrackId = null,
  onSelectTrack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const internalRecordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const targetStateMapRef = useRef<Map<number, TargetAnimState>>(new Map());
  const historyMapRef = useRef<Map<number, Array<{ x: number; y: number; nx: number; ny: number }>>>(new Map());
  const renderCleanSurveillanceFrameRef = useRef<((targetCtx: CanvasRenderingContext2D, targetW: number, targetH: number, videoSource?: HTMLVideoElement | null) => void) | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const hoveredTrackIdRef = useRef<number | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<number | null>(null);
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const selectedTrackIdRef = useRef<number | null>(selectedTrackId);
  useEffect(() => {
    selectedTrackIdRef.current = selectedTrackId;
  }, [selectedTrackId]);

  // Draw area reference for coordinate mapping
  const drawAreaRef = useRef<{ x: number; y: number; w: number; h: number }>({
    x: 0,
    y: 0,
    w: width,
    h: height,
  });

  // Expose video ref to parent if requested
  useEffect(() => {
    if (videoRef) {
      videoRef.current = internalVideoRef.current;
    }
  }, [videoRef]);

  // Expose canvas ref to parent if requested
  useEffect(() => {
    if (externalCanvasRef) {
      externalCanvasRef.current = canvasRef.current;
    }
  }, [externalCanvasRef]);

  // Expose dedicated clean recording canvas ref to parent if requested
  useEffect(() => {
    if (recordingCanvasRef) {
      recordingCanvasRef.current = internalRecordingCanvasRef.current;
    }
  }, [recordingCanvasRef]);

  // Bind live MediaStream or Video File URL to video element
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    if (sourceMode === 'thermal_camera') {
      if (videoStream && isCameraConnected) {
        video.removeAttribute('src');
        video.srcObject = videoStream;
        video.play().catch((err) => console.warn('Camera video playback warning:', err));
      } else {
        video.srcObject = null;
      }
    } else if (sourceMode === 'video_file') {
      video.srcObject = null;
      if (videoUrl) {
        const curSrc = video.src || '';
        if (!curSrc || (!curSrc.endsWith(videoUrl) && curSrc !== videoUrl)) {
          video.src = videoUrl;
          video.load();
        }
      } else {
        video.removeAttribute('src');
        video.load();
      }
    } else {
      video.srcObject = null;
      video.removeAttribute('src');
    }
  }, [sourceMode, videoStream, isCameraConnected, videoUrl]);

  // Handle video metadata, frame loading, and ended events
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      video.playbackRate = playbackRate;
      if (onVideoDimensionsLoaded && video.videoWidth && video.videoHeight) {
        onVideoDimensionsLoaded({
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
      if (isPlaying && !isPaused && video.paused) {
        video.play().catch((err) => console.warn('Play after metadata error:', err));
      }
    };

    const handleCanPlay = () => {
      if (isPlaying && !isPaused && video.paused) {
        video.play().catch((err) => console.warn('Play on canplay error:', err));
      }
    };

    const handleEnded = () => {
      if (onVideoEnded) {
        onVideoEnded();
      }
    };

    const handleError = () => {
      if (video.error) {
        console.warn('Thermal video element error:', video.error.code, video.error.message);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [onVideoDimensionsLoaded, onVideoEnded, playbackRate, isPlaying, isPaused]);

  // Set playbackRate on HTML5 video element
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  // Sync isPlaying / isPaused state to video element
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video || sourceMode !== 'video_file' || !videoUrl) return;

    if (isPlaying && !isPaused) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('Video playback warning:', err);
          }
        });
      }
    } else {
      video.pause();
    }
  }, [isPlaying, isPaused, sourceMode, videoUrl]);

  // Sync ref with state for hover checks
  useEffect(() => {
    hoveredTrackIdRef.current = hoveredTrackId;
  }, [hoveredTrackId]);

  // Handle Mouse Move for Target Hover Detection & Micro-Parallax
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * height;

    const normX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const normY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setTilt({
      x: -normY * 1.0,
      y: normX * 1.0,
    });

    let foundTrackId: number | null = null;
    const { x: drawX, y: drawY, w: drawW, h: drawH } = drawAreaRef.current;

    for (const det of detections) {
      const state = targetStateMapRef.current.get(det.track_id);
      const currentBbox = state?.currentBbox || det.bbox;
      const [x1, y1, x2, y2] = currentBbox;
      const bx = drawX + x1 * drawW;
      const by = drawY + y1 * drawH;
      const bw = (x2 - x1) * drawW;
      const bh = (y2 - y1) * drawH;

      if (mouseX >= bx - 10 && mouseX <= bx + bw + 10 && mouseY >= by - 10 && mouseY <= by + bh + 10) {
        foundTrackId = det.track_id;
        break;
      }
    }

    if (foundTrackId !== hoveredTrackIdRef.current) {
      setHoveredTrackId(foundTrackId);
    }
  };

  // Handle Canvas Click to Select Target from Bounding Box
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * height;
    const { x: drawX, y: drawY, w: drawW, h: drawH } = drawAreaRef.current;

    for (const det of detections) {
      const state = targetStateMapRef.current.get(det.track_id);
      const currentBbox = state?.currentBbox || det.bbox;
      const [x1, y1, x2, y2] = currentBbox;
      const bx = drawX + x1 * drawW;
      const by = drawY + y1 * drawH;
      const bw = (x2 - x1) * drawW;
      const bh = (y2 - y1) * drawH;

      if (mouseX >= bx - 10 && mouseX <= bx + bw + 10 && mouseY >= by - 10 && mouseY <= by + bh + 10) {
        if (det.track_id != null && det.track_id > 0) {
          onSelectTrack?.(det.track_id);
        }
        break;
      }
    }
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    if (hoveredTrackIdRef.current !== null) {
      setHoveredTrackId(null);
    }
  };

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const lerp = (start: number, end: number, amt: number) => start + (end - start) * amt;

    const renderLoop = () => {
      const time = performance.now() / 1000;
      const activeHoveredId = hoveredTrackIdRef.current;
      const video = internalVideoRef.current;

      ctx.clearRect(0, 0, width, height);

      // 1. Layer 1: Live Hardware Video Frame OR Video File Frame (Base Layer)
      const isVideoFile = sourceMode === 'video_file' && Boolean(videoUrl);
      const isCamera = sourceMode === 'thermal_camera' && isCameraConnected;
      const hasActiveVideo = isVideoFile || isCamera;

      const vW = (video && video.videoWidth > 0) ? video.videoWidth : 1280;
      const vH = (video && video.videoHeight > 0) ? video.videoHeight : 720;

      let drawX = 0;
      let drawY = 0;
      let drawW = width;
      let drawH = height;

      if (hasActiveVideo) {
        // Calculate aspect-ratio-preserving rect (Letterbox / Pillarbox fit) matching object-contain
        const videoAspect = vW / vH;
        const canvasAspect = width / height;

        if (videoAspect > canvasAspect) {
          // Video is wider than canvas -> bars top & bottom
          drawW = width;
          drawH = width / videoAspect;
          drawY = (height - drawH) / 2;
        } else {
          // Video is taller than canvas -> bars left & right
          drawH = height;
          drawW = height * videoAspect;
          drawX = (width - drawW) / 2;
        }

        drawAreaRef.current = { x: drawX, y: drawY, w: drawW, h: drawH };

        // Draw original video frame to canvas buffer if ready (for snapshot exports and filter processing)
        if (video && video.readyState >= 2) {
          try {
            ctx.drawImage(video, drawX, drawY, drawW, drawH);
          } catch (e) {
            // Security or readyState transient error
          }
        }

        // For thermal camera hardware, apply false-color LWIR tint; for video files, preserve original pixels
        if (isCamera) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const thermalTint = ctx.createLinearGradient(0, 0, width, height);
          thermalTint.addColorStop(0, 'rgba(10, 25, 45, 0.4)');
          thermalTint.addColorStop(0.5, 'rgba(85, 217, 245, 0.15)');
          thermalTint.addColorStop(1, 'rgba(140, 155, 255, 0.25)');
          ctx.fillStyle = thermalTint;
          ctx.fillRect(drawX, drawY, drawW, drawH);
          ctx.restore();
        }

        // Layer 2: Transparent Technical Tactical Grid Overlay (48px spacing, non-obscuring)
        ctx.strokeStyle = 'rgba(85, 217, 245, 0.035)';
        ctx.lineWidth = 1;
        const gridSize = 48;
        for (let x = 0; x < width; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 0; y < height; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }
      } else {
        drawAreaRef.current = { x: 0, y: 0, w: width, h: height };

        // Synthetic / Demo Tactical Thermal Surface (shown only when NO video is selected)
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#05080D');
        gradient.addColorStop(0.5, '#0B1018');
        gradient.addColorStop(1, '#05080D');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Technical Grid (48px spacing)
        ctx.strokeStyle = 'rgba(85, 217, 245, 0.035)';
        ctx.lineWidth = 1;
        const gridSize = 48;
        for (let x = 0; x < width; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 0; y < height; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }
      }

      // Corner Framing Markers (┌ ┐ └ ┘)
      const cornerLen = 16;
      ctx.strokeStyle = 'rgba(85, 217, 245, 0.4)';
      ctx.lineWidth = 1.5;
      // Top-Left
      ctx.beginPath(); ctx.moveTo(14, 14 + cornerLen); ctx.lineTo(14, 14); ctx.lineTo(14 + cornerLen, 14); ctx.stroke();
      // Top-Right
      ctx.beginPath(); ctx.moveTo(width - 14 - cornerLen, 14); ctx.lineTo(width - 14, 14); ctx.lineTo(width - 14, 14 + cornerLen); ctx.stroke();
      // Bottom-Left
      ctx.beginPath(); ctx.moveTo(14, height - 14 - cornerLen); ctx.lineTo(14, height - 14); ctx.lineTo(14 + cornerLen, height - 14); ctx.stroke();
      // Bottom-Right
      ctx.beginPath(); ctx.moveTo(width - 14 - cornerLen, height - 14); ctx.lineTo(width - 14, height - 14); ctx.lineTo(width - 14, height - 14 - cornerLen); ctx.stroke();

      // 2. Layer 2: Restricted Zones
      zones.forEach((zone) => {
        if (!zone.enabled || !zone.polygon || zone.polygon.length < 3) return;

        ctx.beginPath();
        const firstPt = zone.polygon[0];
        ctx.moveTo(drawX + firstPt[0] * drawW, drawY + firstPt[1] * drawH);

        for (let i = 1; i < zone.polygon.length; i++) {
          const pt = zone.polygon[i];
          ctx.lineTo(drawX + pt[0] * drawW, drawY + pt[1] * drawH);
        }
        ctx.closePath();

        ctx.fillStyle = 'rgba(242, 119, 134, 0.06)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(242, 119, 134, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = (time * 12) % 10;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // 3. Layer 3: Vertical Thermal Scan Line
      const scanY = ((time % 5) / 5) * height;
      const scanGrad = ctx.createLinearGradient(0, scanY - 6, 0, scanY + 6);
      scanGrad.addColorStop(0, 'rgba(85, 217, 245, 0)');
      scanGrad.addColorStop(0.5, 'rgba(85, 217, 245, 0.20)');
      scanGrad.addColorStop(1, 'rgba(85, 217, 245, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 6, width, 12);

      // 4. Layer 4: Object Detection Bounding Boxes & Trajectory
      if (detections.length === 0) {
        targetStateMapRef.current.clear();
        historyMapRef.current.clear();
      }

      detections.forEach((det) => {
        const trackId = det.track_id;
        const targetBbox = det.bbox;
        const targetConf = det.confidence;
        const isHovered = activeHoveredId === trackId;
        const hasActiveHover = activeHoveredId !== null;
        const isSelected = selectedTrackIdRef.current != null && Number(selectedTrackIdRef.current) === Number(trackId);

        let animState = targetStateMapRef.current.get(trackId);
        if (!animState) {
          animState = {
            currentBbox: [...targetBbox],
            opacity: 0,
            scale: 0.96,
            entryTime: time,
            displayConf: Math.max(0.4, targetConf - 0.12),
          };
        } else {
          // Smooth responsive interpolation
          animState.currentBbox = [
            lerp(animState.currentBbox[0], targetBbox[0], 0.35),
            lerp(animState.currentBbox[1], targetBbox[1], 0.35),
            lerp(animState.currentBbox[2], targetBbox[2], 0.35),
            lerp(animState.currentBbox[3], targetBbox[3], 0.35),
          ];

          const age = time - animState.entryTime;
          animState.opacity = Math.min(1.0, age / 0.15);
          animState.scale = lerp(animState.scale, 1.0, 0.2);
          animState.displayConf = lerp(animState.displayConf, targetConf, 0.2);
        }
        targetStateMapRef.current.set(trackId, animState);

        // Map normalized coordinates [0, 1] to drawn video rectangle
        let [x1, y1, x2, y2] = animState.currentBbox;
        let bx = drawX + x1 * drawW;
        let by = drawY + y1 * drawH;
        let bw = (x2 - x1) * drawW;
        let bh = (y2 - y1) * drawH;

        if (isHovered) {
          const scale = 1.04;
          const dw = bw * (scale - 1);
          const dh = bh * (scale - 1);
          bx -= dw / 2;
          by -= dh / 2;
          bw *= scale;
          bh *= scale;
        }

        const cx = bx + bw / 2;
        const cy = by + bh / 2;

        const detClass = (det.class || '').toLowerCase();

        // Threat coloring takes precedence when an active threat is flagged
        let rGba = '85, 217, 245'; // default cyan
        let hexColor = '#55D9F5';

        if (det.threat) {
          rGba = '242, 119, 134'; // Threat Coral (#F27786)
          hexColor = '#F27786';
        } else {
          if (detClass === 'vehicle') {
            rGba = '56, 189, 248'; // Sky Blue (#38BDF8)
            hexColor = '#38BDF8';
          } else if (detClass === 'animal') {
            rGba = '34, 197, 94'; // Operational Green (#22C55E)
            hexColor = '#22C55E';
          } else if (detClass === 'drone') {
            rGba = '140, 155, 255'; // Intelligence Violet (#8C9BFF)
            hexColor = '#8C9BFF';
          } else if (detClass.includes('bag')) {
            rGba = '245, 158, 11'; // Warning Amber (#F59E0B)
            hexColor = '#F59E0B';
          } else {
            // Person: Thermal Cyan
            rGba = '85, 217, 245';
            hexColor = '#55D9F5';
          }
        }

        const finalAlpha = animState.opacity * (hasActiveHover && !isHovered ? 0.75 : 1.0);
        ctx.globalAlpha = finalAlpha;

        // Position history for trajectory trail
        let history = historyMapRef.current.get(trackId) || [];
        const ncx = (animState.currentBbox[0] + animState.currentBbox[2]) / 2;
        const ncy = (animState.currentBbox[1] + animState.currentBbox[3]) / 2;
        history.push({ x: cx, y: cy, nx: ncx, ny: ncy });
        if (history.length > 16) history.shift();
        historyMapRef.current.set(trackId, history);

        const isMoving = history.length > 2 && Math.hypot(history[history.length - 1].x - history[0].x, history[history.length - 1].y - history[0].y) > 4;

        if (isMoving && history.length > 1) {
          for (let i = 0; i < history.length - 1; i++) {
            const opacity = ((i + 1) / history.length) * 0.4 * finalAlpha;
            ctx.fillStyle = `rgba(${rGba}, ${opacity})`;
            ctx.beginPath();
            ctx.arc(history[i].x, history[i].y, isHovered ? 2.5 : 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (!isMoving) {
          const pulseR = 3 + Math.sin(time * 3) * 1.5;
          ctx.strokeStyle = `rgba(${rGba}, 0.4)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Thermal Heat Field Bloom
        const heatRadius = Math.max(bw, bh) * (isHovered ? 0.95 : 0.85);
        const heatGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, heatRadius);
        heatGrad.addColorStop(0, `rgba(${rGba}, ${isHovered ? 0.22 : 0.12})`);
        heatGrad.addColorStop(1, `rgba(${rGba}, 0)`);
        ctx.fillStyle = heatGrad;
        ctx.fillRect(bx - 20, by - 20, bw + 40, bh + 40);

        // Tactical Selection Reticle & Halo for Selected Target
        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = '#55D9F5';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.lineDashOffset = -(time * 15) % 8;
          ctx.strokeRect(bx - 5, by - 5, bw + 10, bh + 10);
          ctx.setLineDash([]);

          // Corner brackets
          const selLen = Math.min(10, Math.min(bw, bh) * 0.3);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#55D9F5';
          // Top-Left
          ctx.beginPath(); ctx.moveTo(bx - 7, by - 7 + selLen); ctx.lineTo(bx - 7, by - 7); ctx.lineTo(bx - 7 + selLen, by - 7); ctx.stroke();
          // Top-Right
          ctx.beginPath(); ctx.moveTo(bx + bw + 7 - selLen, by - 7); ctx.lineTo(bx + bw + 7, by - 7); ctx.lineTo(bx + bw + 7, by - 7 + selLen); ctx.stroke();
          // Bottom-Left
          ctx.beginPath(); ctx.moveTo(bx - 7, by + bh + 7 - selLen); ctx.lineTo(bx - 7, by + bh + 7); ctx.lineTo(bx - 7 + selLen, by + bh + 7); ctx.stroke();
          // Bottom-Right
          ctx.beginPath(); ctx.moveTo(bx + bw + 7 - selLen, by + bh + 7); ctx.lineTo(bx + bw + 7, by + bh + 7); ctx.lineTo(bx + bw + 7, by + bh + 7 - selLen); ctx.stroke();
          ctx.restore();
        }

        // Bounding Box
        const lineOpacity = isSelected ? 1.0 : isHovered ? 0.95 : 0.8;
        const fillOpacity = isSelected ? 0.22 : isHovered ? 0.14 : 0.05;

        ctx.fillStyle = isSelected ? 'rgba(85, 217, 245, 0.18)' : `rgba(${rGba}, ${fillOpacity})`;
        ctx.fillRect(bx, by, bw, bh);

        ctx.strokeStyle = isSelected ? '#55D9F5' : `rgba(${rGba}, ${lineOpacity})`;
        ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5;

        const cLen = Math.min(bw, bh) * 0.25;
        ctx.beginPath(); ctx.moveTo(bx, by + cLen); ctx.lineTo(bx, by); ctx.lineTo(bx + cLen, by); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + bw - cLen, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cLen); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, by + bh - cLen); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + cLen, by + bh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + bw - cLen, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - cLen); ctx.stroke();

        // Label Pill
        const confPercent = (animState.displayConf * 100).toFixed(1);
        const threatBadge = det.threat ? '⚠ THREAT: ' : '';
        const selectedIndicator = isSelected ? '⦿ ' : '';
        const labelText = `${selectedIndicator}${threatBadge}TRACK #${det.track_id}  ${(det.class || 'OBJECT').toUpperCase()}  ${confPercent}%`;
        ctx.font = '600 10px "JetBrains Mono", monospace';
        const textMetrics = ctx.measureText(labelText);
        const textW = textMetrics.width + 14;
        const textH = 18;

        const labelX = bx;
        const labelY = Math.max(by - textH - 4, 16);

        ctx.fillStyle = det.threat ? 'rgba(32, 10, 16, 0.92)' : isHovered ? 'rgba(11, 16, 24, 0.95)' : 'rgba(7, 10, 16, 0.85)';
        ctx.strokeStyle = `rgba(${rGba}, ${det.threat ? 0.8 : isHovered ? 0.6 : 0.25})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, textW, textH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = det.threat ? '#F27786' : isHovered ? '#FFFFFF' : hexColor;
        ctx.fillText(labelText, labelX + 7, labelY + 12);

        ctx.globalAlpha = 1.0;
      });

      // 5. Dedicated Clean Surveillance Frame (Pure thermal video + YOLO11n AI overlays only, matching source video aspect ratio)
      const renderCleanSurveillanceFrame = (
        targetCtx: CanvasRenderingContext2D,
        targetW: number,
        targetH: number,
        videoSource?: HTMLVideoElement | null
      ) => {
        targetCtx.clearRect(0, 0, targetW, targetH);

        // STEP 1: Draw actual thermal video frame
        if (videoSource && videoSource.readyState >= 2) {
          try {
            targetCtx.drawImage(videoSource, 0, 0, targetW, targetH);
          } catch (e) {}
        }

        if (isCamera) {
          targetCtx.save();
          targetCtx.globalCompositeOperation = 'screen';
          const thermalTint = targetCtx.createLinearGradient(0, 0, targetW, targetH);
          thermalTint.addColorStop(0, 'rgba(10, 25, 45, 0.4)');
          thermalTint.addColorStop(0.5, 'rgba(85, 217, 245, 0.15)');
          thermalTint.addColorStop(1, 'rgba(140, 155, 255, 0.25)');
          targetCtx.fillStyle = thermalTint;
          targetCtx.fillRect(0, 0, targetW, targetH);
          targetCtx.restore();
        }

        // STEP 2: Draw restricted-zone overlays (if part of existing surveillance visualization)
        zones.forEach((zone) => {
          if (!zone.enabled || !zone.polygon || zone.polygon.length < 3) return;

          targetCtx.beginPath();
          const firstPt = zone.polygon[0];
          targetCtx.moveTo(firstPt[0] * targetW, firstPt[1] * targetH);

          for (let i = 1; i < zone.polygon.length; i++) {
            const pt = zone.polygon[i];
            targetCtx.lineTo(pt[0] * targetW, pt[1] * targetH);
          }
          targetCtx.closePath();

          targetCtx.fillStyle = 'rgba(242, 119, 134, 0.08)';
          targetCtx.fill();
          targetCtx.strokeStyle = 'rgba(242, 119, 134, 0.45)';
          targetCtx.lineWidth = Math.max(1.5, Math.round(targetW * 0.002));
          targetCtx.setLineDash([6, 6]);
          targetCtx.stroke();
          targetCtx.setLineDash([]);
        });

        // STEP 3: Draw tracking trails using existing ByteTrack movement history
        detections.forEach((det) => {
          const trackId = det.track_id;
          const history = historyMapRef.current.get(trackId);
          if (!history || history.length < 2) return;

          const detClass = (det.class || '').toLowerCase();
          let rGba = '85, 217, 245';
          if (det.threat) rGba = '242, 119, 134';
          else if (detClass === 'vehicle') rGba = '56, 189, 248';
          else if (detClass === 'animal') rGba = '34, 197, 94';
          else if (detClass === 'drone') rGba = '140, 155, 255';
          else if (detClass.includes('bag')) rGba = '245, 158, 11';

          // Trajectory path
          targetCtx.beginPath();
          targetCtx.moveTo(history[0].nx * targetW, history[0].ny * targetH);
          for (let i = 1; i < history.length; i++) {
            targetCtx.lineTo(history[i].nx * targetW, history[i].ny * targetH);
          }
          targetCtx.strokeStyle = `rgba(${rGba}, 0.5)`;
          targetCtx.lineWidth = Math.max(1.5, Math.round(targetW * 0.003));
          targetCtx.stroke();

          // Progressive alpha fading points
          for (let i = 0; i < history.length; i++) {
            const opacity = ((i + 1) / history.length) * 0.65;
            targetCtx.fillStyle = `rgba(${rGba}, ${opacity})`;
            targetCtx.beginPath();
            targetCtx.arc(history[i].nx * targetW, history[i].ny * targetH, Math.max(2, Math.round(targetW * 0.004)), 0, Math.PI * 2);
            targetCtx.fill();
          }
        });

        // STEPS 4 - 7: Bounding boxes, Class name, Confidence, Track ID, Threat label
        detections.forEach((det) => {
          const trackId = det.track_id;
          const animState = targetStateMapRef.current.get(trackId);
          const bbox = animState ? animState.currentBbox : det.bbox;

          let [x1, y1, x2, y2] = bbox;
          x1 = Math.max(0, Math.min(1, x1));
          y1 = Math.max(0, Math.min(1, y1));
          x2 = Math.max(0, Math.min(1, x2));
          y2 = Math.max(0, Math.min(1, y2));

          const bx = x1 * targetW;
          const by = y1 * targetH;
          const bw = (x2 - x1) * targetW;
          const bh = (y2 - y1) * targetH;
          const cx = bx + bw / 2;
          const cy = by + bh / 2;

          const detClass = (det.class || '').toLowerCase();
          let rGba = '85, 217, 245';
          let hexColor = '#55D9F5';
          if (det.threat) {
            rGba = '242, 119, 134';
            hexColor = '#F27786';
          } else if (detClass === 'vehicle') {
            rGba = '56, 189, 248';
            hexColor = '#38BDF8';
          } else if (detClass === 'animal') {
            rGba = '34, 197, 94';
            hexColor = '#22C55E';
          } else if (detClass === 'drone') {
            rGba = '140, 155, 255';
            hexColor = '#8C9BFF';
          } else if (detClass.includes('bag')) {
            rGba = '245, 158, 11';
            hexColor = '#F59E0B';
          }

          // Target Heat Field Bloom
          const heatRadius = Math.max(bw, bh) * 0.85;
          const heatGrad = targetCtx.createRadialGradient(cx, cy, 0, cx, cy, heatRadius);
          heatGrad.addColorStop(0, `rgba(${rGba}, ${det.threat ? 0.22 : 0.12})`);
          heatGrad.addColorStop(1, `rgba(${rGba}, 0)`);
          targetCtx.fillStyle = heatGrad;
          targetCtx.fillRect(bx - 20, by - 20, bw + 40, bh + 40);

          // STEP 4: Bounding Box Fill & Corner Accents
          targetCtx.fillStyle = `rgba(${rGba}, ${det.threat ? 0.08 : 0.04})`;
          targetCtx.fillRect(bx, by, bw, bh);

          targetCtx.strokeStyle = `rgba(${rGba}, 0.95)`;
          targetCtx.lineWidth = Math.max(1.5, Math.min(3.5, targetW * 0.003));

          const cLen = Math.min(bw, bh) * 0.25;
          targetCtx.beginPath(); targetCtx.moveTo(bx, by + cLen); targetCtx.lineTo(bx, by); targetCtx.lineTo(bx + cLen, by); targetCtx.stroke();
          targetCtx.beginPath(); targetCtx.moveTo(bx + bw - cLen, by); targetCtx.lineTo(bx + bw, by); targetCtx.lineTo(bx + bw, by + cLen); targetCtx.stroke();
          targetCtx.beginPath(); targetCtx.moveTo(bx, by + bh - cLen); targetCtx.lineTo(bx, by + bh); targetCtx.lineTo(bx + cLen, by + bh); targetCtx.stroke();
          targetCtx.beginPath(); targetCtx.moveTo(bx + bw - cLen, by + bh); targetCtx.lineTo(bx + bw, by + bh); targetCtx.lineTo(bx + bw, by + bh - cLen); targetCtx.stroke();

          // Selection Halo if focused in Target Inspector
          if (selectedTrackId != null && Number(det.track_id) === Number(selectedTrackId)) {
            targetCtx.save();
            targetCtx.strokeStyle = '#55D9F5';
            targetCtx.lineWidth = 2.5;
            targetCtx.setLineDash([4, 4]);
            targetCtx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
            targetCtx.fillStyle = 'rgba(85, 217, 245, 0.12)';
            targetCtx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
            targetCtx.setLineDash([]);
            targetCtx.restore();
          }

          // STEPS 5, 6, 7: Label Pill (Track ID + Class + Confidence + Threat Level/Status)
          const confVal = animState ? animState.displayConf : (det.confidence || 0.85);
          const confPercent = (confVal * 100).toFixed(1);
          const threatBadge = det.threat ? `⚠ THREAT${det.threat_level ? ` [${det.threat_level}]` : ''}: ` : '';
          const labelText = `${threatBadge}TRACK #${det.track_id}  ${(det.class || 'OBJECT').toUpperCase()}  ${confPercent}%`;

          const fontSize = Math.max(11, Math.min(22, Math.round(targetW * 0.022)));
          targetCtx.font = `600 ${fontSize}px "JetBrains Mono", monospace, sans-serif`;
          const textMetrics = targetCtx.measureText(labelText);
          const textW = textMetrics.width + 14;
          const textH = fontSize + 8;

          const labelX = bx;
          const labelY = Math.max(by - textH - 3, 4);

          targetCtx.fillStyle = det.threat ? 'rgba(32, 10, 16, 0.92)' : 'rgba(7, 10, 16, 0.88)';
          targetCtx.strokeStyle = `rgba(${rGba}, ${det.threat ? 0.85 : 0.4})`;
          targetCtx.lineWidth = 1;
          targetCtx.beginPath();
          targetCtx.roundRect(labelX, labelY, textW, textH, 4);
          targetCtx.fill();
          targetCtx.stroke();

          targetCtx.fillStyle = det.threat ? '#F27786' : hexColor;
          targetCtx.fillText(labelText, labelX + 6, labelY + fontSize * 0.85);
        });
      };

      renderCleanSurveillanceFrameRef.current = renderCleanSurveillanceFrame;

      const recCanvas = internalRecordingCanvasRef.current;
      if (recCanvas && hasActiveVideo) {
        if (recCanvas.width !== vW || recCanvas.height !== vH) {
          recCanvas.width = vW;
          recCanvas.height = vH;
        }
        const recCtx = recCanvas.getContext('2d');
        if (recCtx) {
          renderCleanSurveillanceFrame(recCtx, vW, vH, video);
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [detections, zones, width, height, sourceMode, isCameraConnected, videoUrl]);

  const hasActiveVideo = (sourceMode === 'video_file' && Boolean(videoUrl)) || (sourceMode === 'thermal_camera' && isCameraConnected);

  // Synchronous, high-fidelity AI surveillance snapshot capture
  const captureAISnapshot = useCallback((): string | null => {
    const video = internalVideoRef.current || (videoRef ? videoRef.current : null);
    const vW = (video && video.videoWidth > 0) ? video.videoWidth : 1280;
    const vH = (video && video.videoHeight > 0) ? video.videoHeight : 720;

    const isVideoFile = sourceMode === 'video_file' && Boolean(videoUrl);
    const isCamera = sourceMode === 'thermal_camera' && isCameraConnected;
    const activeVideoPresent = isVideoFile || isCamera;

    if (activeVideoPresent && video && video.readyState >= 2) {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = vW;
      snapCanvas.height = vH;
      const snapCtx = snapCanvas.getContext('2d');
      if (snapCtx) {
        if (renderCleanSurveillanceFrameRef.current) {
          renderCleanSurveillanceFrameRef.current(snapCtx, vW, vH, video);
        } else {
          snapCtx.drawImage(video, 0, 0, vW, vH);
        }
        return snapCanvas.toDataURL('image/png');
      }
    }

    // Fallback to recording canvas if ready
    if (internalRecordingCanvasRef.current && activeVideoPresent) {
      return internalRecordingCanvasRef.current.toDataURL('image/png');
    }

    // Fallback to viewport canvas (e.g. for synthetic demo mode)
    if (canvasRef.current) {
      return canvasRef.current.toDataURL('image/png');
    }

    return null;
  }, [sourceMode, videoUrl, isCameraConnected, videoRef]);

  useEffect(() => {
    if (snapshotFnRef) {
      snapshotFnRef.current = captureAISnapshot;
    }
    return () => {
      if (snapshotFnRef) {
        snapshotFnRef.current = null;
      }
    };
  }, [captureAISnapshot, snapshotFnRef]);

  return (
    <div
      style={{
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 0.18s ease-out',
      }}
      className="relative rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[#05080D] shadow-2xl group select-none"
    >
      {/* LAYER 1: Actual uploaded thermal video as base layer */}
      <video
        ref={internalVideoRef}
        preload="auto"
        playsInline
        muted
        loop
        crossOrigin="anonymous"
        className={`absolute inset-0 w-full h-full object-contain z-0 transition-opacity duration-300 ${
          hasActiveVideo ? 'opacity-100 pointer-events-none' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* LAYER 2 - LAYER 7: Tactical Overlays, Zones, Bounding Boxes, HUD Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleCanvasClick}
        className="relative z-10 w-full h-auto block cursor-crosshair"
      />

      {/* Clean Dedicated Recording Surface: 1:1 pixel match with source video, thermal frames + AI overlays only */}
      <canvas
        ref={internalRecordingCanvasRef}
        style={{
          position: 'fixed',
          left: '-99999px',
          top: '-99999px',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -100,
        }}
        aria-hidden="true"
      />

      {/* Standby / Disconnected Camera Overlay */}
      {sourceMode === 'thermal_camera' && !isCameraConnected && (
        <div className="absolute inset-0 bg-[#05080D]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4 z-30">
          <div className="w-14 h-14 rounded-2xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)]">
            <span className="w-4 h-4 rounded-full bg-[var(--warning-amber)] pulse-threat" />
          </div>

          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm font-bold font-sans text-[var(--text-primary)] uppercase tracking-wider">
              THERMAL CAMERA NOT DETECTED
            </h3>
            <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed">
              Waiting for thermal imaging device link (e.g. FLIR LWIR sensor or USB video capture).
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {onConnectCamera && (
              <button
                onClick={onConnectCamera}
                className="px-4 py-2 rounded-xl btn-primary-interactive text-xs font-semibold font-sans cursor-pointer shadow-md"
              >
                Connect Camera
              </button>
            )}

            {onSwitchToDemo && (
              <button
                onClick={onSwitchToDemo}
                className="px-4 py-2 rounded-xl btn-secondary-interactive text-xs font-semibold font-sans text-[var(--thermal-cyan)] cursor-pointer"
              >
                Continue With Demo Feed →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Standby / No Video Selected Overlay for Video File mode */}
      {sourceMode === 'video_file' && !videoUrl && (
        <div className="absolute inset-0 bg-[#05080D]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4 z-30">
          <div className="w-14 h-14 rounded-2xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)]">
            <span className="w-4 h-4 rounded-full bg-[var(--warning-amber)] pulse-threat" />
          </div>

          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm font-bold font-sans text-[var(--text-primary)] uppercase tracking-wider">
              NO VIDEO / SELECT THERMAL VIDEO
            </h3>
            <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed">
              No thermal surveillance file loaded. Click "SELECT THERMAL VIDEO" to upload and analyze infrared footage.
            </p>
          </div>
        </div>
      )}

      {/* Subtle Vignette Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_60%,rgba(5,8,13,0.75)_100%)] pointer-events-none" />

      {/* Top Floating Status Pill */}
      <div className="absolute top-3.5 left-4 bg-[#0B1018]/85 backdrop-blur-xl px-3 py-1 rounded-full text-[11px] font-sans text-[var(--thermal-cyan)] border border-white/10 flex items-center space-x-2 z-20 shadow-md">
        <span
          className={`w-2 h-2 rounded-full ${
            sourceMode === 'thermal_camera'
              ? isCameraConnected
                ? 'bg-[var(--operational-green)] pulse-live'
                : 'bg-[var(--warning-amber)]'
              : status === 'completed'
              ? 'bg-[var(--operational-green)]'
              : isPlaying || status === 'processing'
              ? 'bg-[var(--operational-green)] pulse-live'
              : 'bg-[var(--warning-amber)]'
          }`}
        />
        <span className="font-mono text-[10px] tracking-wide">
          {sourceMode === 'thermal_camera'
            ? isCameraConnected
              ? 'LIVE THERMAL CAMERA • CAM-01 • Sector Alpha-4'
              : 'STANDBY • WAITING FOR CAMERA DEVICE'
            : status === 'completed'
            ? 'VIDEO FILE SURVEILLANCE • COMPLETED'
            : isPlaying || status === 'processing'
            ? 'VIDEO FILE SURVEILLANCE • ACTIVE'
            : isPaused || status === 'paused'
            ? 'VIDEO FILE PLAYBACK • PAUSED'
            : sourceMode === 'video_file' && Boolean(videoUrl) && status !== 'no_video_selected'
            ? 'VIDEO FILE SURVEILLANCE • ACTIVE'
            : 'THERMAL FEED • STANDBY'}
        </span>
      </div>

      {/* Bottom Floating Telemetry Bar */}
      <div className="absolute bottom-3.5 left-4 right-4 bg-[#0B1018]/90 backdrop-blur-xl px-3.5 py-1.5 rounded-xl border border-white/10 text-[10px] font-mono text-[#9AA7B8] flex flex-wrap items-center justify-between gap-2 z-20 shadow-md">
        <div>FOV: 72° │ EMISSIVITY: 0.95 │ RANGE: 22.4°C - 38.6°C</div>
        <div className="flex items-center space-x-3">
          <span>
            MODE:{' '}
            <span className="text-[var(--thermal-cyan)] font-semibold uppercase">
              {sourceMode === 'thermal_camera'
                ? isCameraConnected
                  ? 'LIVE SENSOR'
                  : 'STANDBY'
                : sourceMode === 'video_file' && Boolean(videoUrl) && status !== 'no_video_selected'
                ? 'FILE STREAM'
                : 'STANDBY'}
            </span>
          </span>
          <span className="text-white/20">│</span>
          <span>
            TRACKS: <span className="text-[var(--intelligence-violet)] font-semibold">{detections.length}</span>
          </span>
          <span className="text-white/20">│</span>
          <span>
            STATUS:{' '}
            <span className={isPlaying || status === 'processing' || status === 'completed' ? 'text-[var(--operational-green)] font-semibold' : 'text-[var(--warning-amber)]'}>
              {isPlaying || status === 'processing' ? 'ACTIVE' : status === 'completed' ? 'COMPLETED' : 'STANDBY'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
