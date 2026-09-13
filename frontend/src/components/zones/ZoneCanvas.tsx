import React, { useRef, useState, useEffect } from 'react';
import { Zone } from '../../types/schema';

interface ZoneCanvasProps {
  zones: Zone[];
  activeZoneId?: string | null;
  onPolygonCreated?: (points: [number, number][]) => void;
  width?: number;
  height?: number;
}

export const ZoneCanvas: React.FC<ZoneCanvasProps> = ({
  zones,
  activeZoneId,
  onPolygonCreated,
  width = 800,
  height = 450,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const newPts: [number, number][] = [...drawingPoints, [roundCoord(x), roundCoord(y)]];
    setDrawingPoints(newPts);
  };

  const roundCoord = (val: number) => Math.round(val * 1000) / 1000;

  const handleFinishPolygon = () => {
    if (drawingPoints.length >= 3 && onPolygonCreated) {
      onPolygonCreated(drawingPoints);
      setDrawingPoints([]);
    }
  };

  const handleClearDrawing = () => {
    setDrawingPoints([]);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Render Saved Zones
    zones.forEach((zone) => {
      if (!zone.polygon || zone.polygon.length < 3) return;
      const isActive = zone.id === activeZoneId;

      ctx.beginPath();
      const first = zone.polygon[0];
      ctx.moveTo(first[0] * width, first[1] * height);

      for (let i = 1; i < zone.polygon.length; i++) {
        const pt = zone.polygon[i];
        ctx.lineTo(pt[0] * width, pt[1] * height);
      }
      ctx.closePath();

      ctx.fillStyle = isActive ? 'rgba(6, 182, 212, 0.25)' : 'rgba(244, 63, 94, 0.12)';
      ctx.fill();

      ctx.strokeStyle = isActive ? '#06b6d4' : zone.enabled ? '#f43f5e' : '#64748b';
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.setLineDash(zone.enabled ? [] : [6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw vertices
      zone.polygon.forEach(([px, py]) => {
        ctx.fillStyle = isActive ? '#06b6d4' : '#f43f5e';
        ctx.beginPath();
        ctx.arc(px * width, py * height, 4, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Name Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.fillText(`${zone.name} (${zone.enabled ? 'ENABLED' : 'DISABLED'})`, first[0] * width + 8, first[1] * height + 18);
    });

    // Render In-Progress Drawing Points
    if (drawingPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(drawingPoints[0][0] * width, drawingPoints[0][1] * height);

      for (let i = 1; i < drawingPoints.length; i++) {
        ctx.lineTo(drawingPoints[i][0] * width, drawingPoints[i][1] * height);
      }

      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw active drawing vertices
      drawingPoints.forEach(([px, py], idx) => {
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(px * width, py * height, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`P${idx + 1}`, px * width + 8, py * height - 4);
      });
    }
  }, [zones, activeZoneId, drawingPoints, width, height]);

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onClick={handleCanvasClick}
          className="w-full h-auto block cursor-crosshair"
        />
        <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded text-[11px] font-mono text-amber-400 border border-slate-800">
          CLICK CANVAS TO DRAW POLYGON VERTICES ({drawingPoints.length} POINTS)
        </div>
      </div>

      {drawingPoints.length > 0 && (
        <div className="flex items-center space-x-3 bg-slate-900 p-3 rounded-lg border border-amber-500/30">
          <span className="text-xs font-mono text-amber-400 font-semibold">
            Drawing Zone ({drawingPoints.length} vertices placed)
          </span>
          <button
            onClick={handleFinishPolygon}
            disabled={drawingPoints.length < 3}
            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40"
          >
            Complete Polygon
          </button>
          <button
            onClick={handleClearDrawing}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Clear Vertices
          </button>
        </div>
      )}
    </div>
  );
};
