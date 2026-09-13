import { useEffect, useState, useRef } from 'react';
import { ThermalDetectionObject } from '../types/schema';

const WS_URL = 'ws://127.0.0.1:8000/ws/live';

export function useLiveFeed() {
  const [detections, setDetections] = useState<ThermalDetectionObject[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function connect() {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data: ThermalDetectionObject[] = JSON.parse(event.data);
            setDetections(data);
          } catch (err) {
            console.error('Error parsing WebSocket frame data:', err);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          // Auto reconnect after 2 seconds
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        ws.onerror = (err) => {
          if (ws.readyState === WebSocket.OPEN) {
            console.warn('WebSocket error observed:', err);
          }
          try {
            ws.close();
          } catch {
            // Ignore close errors on already-closing socket
          }
        };
      } catch (err) {
        console.warn('WebSocket connection setup failed:', err);
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return { detections, isConnected };
}
