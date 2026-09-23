import { useEffect, useState, useRef } from 'react';
import { ThermalDetectionObject } from '../types/schema';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000/ws/live';

export function useLiveFeed() {
  const [detections, setDetections] = useState<ThermalDetectionObject[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(0.0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTimeRef = useRef<number>(0);
  const intervalsRef = useRef<number[]>([]);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function connect() {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;
        (window as any).__liveWs = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data: ThermalDetectionObject[] = JSON.parse(event.data);
            setDetections(data);

            const now = performance.now();
            if (lastTimeRef.current > 0) {
              const diff = now - lastTimeRef.current;
              // Accept valid frame arrival intervals between 10ms and 1500ms
              if (diff >= 10 && diff <= 1500) {
                intervalsRef.current.push(diff);
                if (intervalsRef.current.length > 8) {
                  intervalsRef.current.shift();
                }
                const avgMs =
                  intervalsRef.current.reduce((a, b) => a + b, 0) / intervalsRef.current.length;
                const computedFps = Math.min(60, Math.round((1000 / avgMs) * 10) / 10);
                setFps(computedFps);
              }
            }
            lastTimeRef.current = now;

            // Reset idle timeout - if no frame received within 1200ms, reset FPS to 0.0
            if (idleTimeoutRef.current) {
              clearTimeout(idleTimeoutRef.current);
            }
            idleTimeoutRef.current = setTimeout(() => {
              setFps(0.0);
              intervalsRef.current = [];
              lastTimeRef.current = 0;
            }, 1200);
          } catch (err) {
            console.error('Error parsing WebSocket frame data:', err);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          setFps(0.0);
          intervalsRef.current = [];
          lastTimeRef.current = 0;
          if (idleTimeoutRef.current) {
            clearTimeout(idleTimeoutRef.current);
          }
          // Auto reconnect after 2 seconds
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        ws.onerror = (err) => {
          if (ws.readyState === WebSocket.OPEN) {
            console.warn('WebSocket error observed:', err);
            try {
              ws.close();
            } catch {
              // Ignore close errors
            }
          }
        };
      } catch (err) {
        console.warn('WebSocket connection setup failed:', err);
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      const ws = wsRef.current;
      if (ws) {
        ws.onerror = null;
        ws.onclose = null;
        ws.onmessage = null;
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.close();
          } catch {
            // Ignore close error
          }
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => {
            try {
              ws.close();
            } catch {
              // Ignore close error
            }
          };
        }
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  return { detections, isConnected, fps };
}
