import React, { useRef, useEffect, useState } from 'react';
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
  playbackRate?: number;
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
  playbackRate = 1,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const targetStateMapRef = useRef<Map<number, TargetAnimState>>(new Map());
  const historyMapRef = useRef<Map<number, Array<{ x: number; y: number }>>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const hoveredTrackIdRef = useRef<number | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<number | null>(null);
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // Bind live MediaStream or Video File URL to hidden video element
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    if (sourceMode === 'thermal_camera') {
      if (videoStream && isCameraConnected) {
        video.src = '';
        video.srcObject = videoStream;
        video.play().catch((err) => console.warn('Camera video playback warning:', err));
      } else {
        video.srcObject = null;
      }
    } else if (sourceMode === 'video_file') {
      video.srcObject = null;
      if (videoUrl) {
        if (video.src !== videoUrl) {
          video.src = videoUrl;
          video.load();
        }
      } else {
        video.src = '';
      }
    } else {
      video.srcObject = null;
      video.src = '';
    }
  }, [sourceMode, videoStream, isCameraConnected, videoUrl]);

  // Handle video metadata and ended events
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
    };

    const handleEnded = () => {
      if (onVideoEnded) {
        onVideoEnded();
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onVideoDimensionsLoaded, onVideoEnded, playbackRate]);

  // Set playbackRate on HTML5 video element
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  // Sync isPlaying / isPaused state to video element
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video || sourceMode !== 'video_file') return;

    if (isPlaying && !isPaused) {
      video.play().catch((err) => console.warn('Video playback warning:', err));
    } else if (isPaused || !isPlaying) {
      video.pause();
    }
  }, [isPlaying, isPaused, sourceMode]);

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

      // 1. Layer 1: Live Hardware Video Frame OR Video File Frame OR Synthetic Deep Thermal Background
      const isVideoFile = sourceMode === 'video_file' && video && video.readyState >= 2;
      const isCamera = sourceMode === 'thermal_camera' && isCameraConnected && video && video.readyState >= 2;

      let drawX = 0;
      let drawY = 0;
      let drawW = width;
      let drawH = height;

      if (isVideoFile || isCamera) {
        // Calculate aspect-ratio-preserving rect (Letterbox / Pillarbox fit)
        const vW = video.videoWidth || width;
        const vH = video.videoHeight || height;
        const videoAspect = vW / vH;
        const canvasAspect = width / height;

        if (videoAspect > canvasAspect) {
          // Video is wider than canvas -> black bars top & bottom
          drawW = width;
          drawH = width / videoAspect;
          drawY = (height - drawH) / 2;
        } else {
          // Video is taller than canvas -> black bars left & right
          drawH = height;
          drawW = height * videoAspect;
          drawX = (width - drawW) / 2;
        }

        drawAreaRef.current = { x: drawX, y: drawY, w: drawW, h: drawH };

        // Draw cinema dark background
        ctx.fillStyle = '#05080D';
        ctx.fillRect(0, 0, width, height);

        // Draw original video frame preserving aspect ratio
        ctx.drawImage(video, drawX, drawY, drawW, drawH);

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
      } else {
        drawAreaRef.current = { x: 0, y: 0, w: width, h: height };

        // Synthetic / Demo Tactical Thermal Surface
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
        let rGba = '85, 217, 245';
        let hexColor = '#55D9F5';

        if (det.threat || detClass === 'vehicle') {
          rGba = '242, 119, 134';
          hexColor = '#F27786';
        } else if (detClass === 'drone') {
          rGba = '140, 155, 255';
          hexColor = '#8C9BFF';
        }

        const finalAlpha = animState.opacity * (hasActiveHover && !isHovered ? 0.75 : 1.0);
        ctx.globalAlpha = finalAlpha;

        // Position history for trajectory trail
        let history = historyMapRef.current.get(trackId) || [];
        history.push({ x: cx, y: cy });
        if (history.length > 12) history.shift();
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

        // Bounding Box
        const lineOpacity = isHovered ? 0.95 : 0.8;
        const fillOpacity = isHovered ? 0.14 : 0.05;

        ctx.fillStyle = `rgba(${rGba}, ${fillOpacity})`;
        ctx.fillRect(bx, by, bw, bh);

        ctx.strokeStyle = `rgba(${rGba}, ${lineOpacity})`;
        ctx.lineWidth = isHovered ? 2 : 1.5;

        const cLen = Math.min(bw, bh) * 0.25;
        ctx.beginPath(); ctx.moveTo(bx, by + cLen); ctx.lineTo(bx, by); ctx.lineTo(bx + cLen, by); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + bw - cLen, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cLen); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, by + bh - cLen); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + cLen, by + bh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + bw - cLen, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - cLen); ctx.stroke();

        // Label Pill
        const confPercent = (animState.displayConf * 100).toFixed(1);
        const threatBadge = det.threat ? '⚠ THREAT: ' : '';
        const labelText = `${threatBadge}TRACK #${det.track_id}  ${(det.class || 'OBJECT').toUpperCase()}  ${confPercent}%`;
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

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [detections, zones, width, height, sourceMode, isCameraConnected]);

  return (
    <div
      style={{
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 0.18s ease-out',
      }}
      className="relative rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[#05080D] shadow-2xl group select-none"
    >
      {/* Active Video element for Camera stream and Video File playback */}
      <video
        ref={internalVideoRef}
        playsInline
        muted
        loop
        crossOrigin="anonymous"
        className="absolute -top-[9999px] -left-[9999px] w-1 h-1 opacity-0 pointer-events-none"
      />

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full h-auto block cursor-crosshair"
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
                ? 'bg-[var(--operational-green)] pulse-live shadow-[0_0_8px_var(--operational-green)]'
                : 'bg-[var(--warning-amber)]'
              : sourceMode === 'video_file'
              ? Boolean(videoUrl)
                ? 'bg-[var(--operational-green)] pulse-live'
                : 'bg-[var(--warning-amber)]'
              : 'bg-[var(--operational-green)] pulse-live'
          }`}
        />
        <span className="font-mono text-[10px] tracking-wide">
          {sourceMode === 'thermal_camera'
            ? isCameraConnected
              ? 'LIVE THERMAL CAMERA • CAM-01 • Sector Alpha-4'
              : 'STANDBY • WAITING FOR CAMERA DEVICE'
            : sourceMode === 'video_file'
            ? Boolean(videoUrl)
              ? isPlaying
                ? 'VIDEO FILE SURVEILLANCE • ACTIVE'
                : isPaused
                ? 'VIDEO FILE PLAYBACK • PAUSED'
                : 'VIDEO FILE LOADED • READY'
              : 'VIDEO FILE SURVEILLANCE • NO VIDEO SELECTED'
            : 'DEMO THERMAL FEED • SYNTHETIC TEST SIM'}
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
                : sourceMode === 'video_file'
                ? 'FILE STREAM'
                : 'DEMO MODE'}
            </span>
          </span>
          <span className="text-white/20">│</span>
          <span>
            TRACKS: <span className="text-[var(--intelligence-violet)] font-semibold">{detections.length}</span>
          </span>
          <span className="text-white/20">│</span>
          <span>
            STATUS:{' '}
            <span className={isCameraConnected || sourceMode !== 'thermal_camera' ? 'text-[var(--operational-green)] font-semibold' : 'text-[var(--warning-amber)]'}>
              {isCameraConnected || sourceMode !== 'thermal_camera' ? 'NOMINAL' : 'WAITING'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
