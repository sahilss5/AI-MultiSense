import { useState, useEffect, useRef, useCallback } from 'react';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export type VideoSourceMode = 'thermal_camera' | 'video_file' | 'demo_feed';

export function useThermalCamera() {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [resolution, setResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [fps, setFps] = useState<number>(0);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fpsFrameCountRef = useRef<number>(0);
  const fpsLastTimeRef = useRef<number>(performance.now());
  const fpsAnimRef = useRef<number | null>(null);

  // Scan available video input devices
  const scanCameras = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        throw new Error('MediaDevices API not supported on this browser.');
      }

      // Initial enumerate
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Thermal / Video Camera ${idx + 1}`,
        }));

      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err: any) {
      console.warn('Camera scan warning:', err);
      setError(err.message || 'Unable to scan video input devices.');
    } finally {
      setIsScanning(false);
    }
  }, [selectedDeviceId]);

  // Initial scan on mount
  useEffect(() => {
    scanCameras();
  }, []);

  // Connect to selected camera
  const connectCamera = useCallback(async (deviceIdOverride?: string) => {
    const targetId = deviceIdOverride || selectedDeviceId;
    setIsConnecting(true);
    setError(null);

    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: targetId
          ? { deviceId: { exact: targetId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setIsConnected(true);

      const track = newStream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings();
        setResolution({
          width: settings.width || 1280,
          height: settings.height || 720,
        });
        setFps(Math.round(settings.frameRate || 30));
      }

      // Re-scan to populate labels if granted
      scanCameras();
    } catch (err: any) {
      console.error('Camera connection error:', err);
      setIsConnected(false);
      setStream(null);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission was denied. Please allow camera access in your browser.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No compatible thermal/video camera was found.');
      } else {
        setError(err.message || 'Failed to connect to camera device.');
      }
    } finally {
      setIsConnecting(false);
    }
  }, [selectedDeviceId, stream, scanCameras]);

  // Disconnect camera
  const disconnectCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
    setIsConnected(false);
    setResolution({ width: 0, height: 0 });
    setFps(0);
    if (isRecording) {
      stopRecording();
    }
  }, [stream, isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (fpsAnimRef.current) {
        cancelAnimationFrame(fpsAnimRef.current);
      }
    };
  }, [stream]);

  // Take frame snapshot
  const takeSnapshot = useCallback((customCanvas?: HTMLCanvasElement) => {
    let sourceCanvas = customCanvas;

    if (!sourceCanvas && videoRef.current) {
      const vid = videoRef.current;
      const offscreen = document.createElement('canvas');
      offscreen.width = vid.videoWidth || 1280;
      offscreen.height = vid.videoHeight || 720;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.drawImage(vid, 0, 0, offscreen.width, offscreen.height);
        sourceCanvas = offscreen;
      }
    }

    if (sourceCanvas) {
      const dataUrl = sourceCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `thermal_snapshot_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    }
    return false;
  }, []);

  // Start recording stream
  const startRecording = useCallback(() => {
    if (!stream) return;
    recordedChunksRef.current = [];

    try {
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thermal_recording_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Recording initialization error:', err);
    }
  }, [stream]);

  // Stop recording stream
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  }, [isRecording]);

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    isScanning,
    isConnected,
    isConnecting,
    error,
    stream,
    resolution,
    fps,
    isRecording,
    recordingSeconds,
    videoRef,
    scanCameras,
    connectCamera,
    disconnectCamera,
    takeSnapshot,
    startRecording,
    stopRecording,
  };
}
