import React, { useRef, useEffect } from 'react';
import { ThermalDetectionObject } from '../../types/schema';

interface TacticalRadarProps {
  detections: ThermalDetectionObject[];
  width?: number;
  height?: number;
}

export const TacticalRadar: React.FC<TacticalRadarProps> = ({ detections, width = 300, height = 300 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrame: number;
    let sweepAngle = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(centerX, centerY) - 16;

      // Outer radar border ring
      ctx.strokeStyle = 'rgba(85, 217, 245, 0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Concentric range rings
      [0.33, 0.66].forEach((scale) => {
        ctx.strokeStyle = 'rgba(85, 217, 245, 0.10)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Axis crosshairs
      ctx.strokeStyle = 'rgba(120, 160, 200, 0.08)';
      ctx.beginPath();
      ctx.moveTo(centerX - radius, centerY); ctx.lineTo(centerX + radius, centerY);
      ctx.moveTo(centerX, centerY - radius); ctx.lineTo(centerX, centerY + radius);
      ctx.stroke();

      // Cardinal N / S / E / W direction labels
      ctx.fillStyle = 'rgba(120, 160, 200, 0.7)';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillText('N', centerX - 3, centerY - radius + 14);
      ctx.fillText('S', centerX - 3, centerY + radius - 4);
      ctx.fillText('E', centerX + radius - 12, centerY + 3);
      ctx.fillText('W', centerX - radius + 4, centerY + 3);

      // Rotating Conic Radar Sweep
      sweepAngle = (sweepAngle + 0.018) % (Math.PI * 2);

      const sweepGradient = ctx.createConicGradient(sweepAngle - Math.PI / 2, centerX, centerY);
      sweepGradient.addColorStop(0, 'rgba(85, 217, 245, 0.25)');
      sweepGradient.addColorStop(0.12, 'rgba(85, 217, 245, 0.04)');
      sweepGradient.addColorStop(0.25, 'transparent');
      sweepGradient.addColorStop(1, 'transparent');

      ctx.fillStyle = sweepGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();

      // Sharp Leading Sweep Line
      ctx.strokeStyle = 'rgba(85, 217, 245, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(sweepAngle) * radius,
        centerY + Math.sin(sweepAngle) * radius
      );
      ctx.stroke();

      // Render Target Blips & Reaction to Sweep Line
      detections.forEach((det) => {
        const normX = (det.bbox[0] + det.bbox[2]) / 2;
        const normY = (det.bbox[1] + det.bbox[3]) / 2;

        const relX = (normX - 0.5) * 2;
        const relY = (normY - 0.5) * 2;

        const targetX = centerX + relX * (radius * 0.82);
        const targetY = centerY + relY * (radius * 0.82);

        // Calculate Target Polar Angle relative to center
        let targetAngle = Math.atan2(targetY - centerY, targetX - centerX);
        if (targetAngle < 0) targetAngle += Math.PI * 2;

        // Angular difference from current sweep angle
        let angleDiff = Math.abs(sweepAngle - targetAngle);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

        // Sweep beam pass detection (within ~15 degrees)
        const isSwept = angleDiff < 0.26;

        const isThreat = det.threat;
        const detClass = (det.class || '').toLowerCase();
        let blipColor = isSwept ? '#FFFFFF' : '#55D9F5'; // Brightens on sweep
        let bgGlow = isSwept ? 'rgba(85, 217, 245, 0.55)' : 'rgba(85, 217, 245, 0.20)';

        if (isThreat || detClass === 'vehicle') {
          blipColor = isSwept ? '#FFD4D8' : '#F27786';
          bgGlow = isSwept ? 'rgba(242, 119, 134, 0.60)' : 'rgba(242, 119, 134, 0.25)';
        } else if (detClass === 'drone') {
          blipColor = isSwept ? '#E0E4FF' : '#8C9BFF';
          bgGlow = isSwept ? 'rgba(140, 155, 255, 0.55)' : 'rgba(140, 155, 255, 0.22)';
        }

        // Outward Expanding Pulse Ring on Sweep Pass
        if (isSwept) {
          const pulseR = 6 + (1 - angleDiff / 0.26) * 8;
          ctx.strokeStyle = bgGlow;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(targetX, targetY, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Blip Outer Soft Aura
        ctx.fillStyle = bgGlow;
        ctx.beginPath();
        ctx.arc(targetX, targetY, isSwept ? (isThreat ? 9 : 7) : (isThreat ? 7 : 5), 0, Math.PI * 2);
        ctx.fill();

        // Blip Core Point
        ctx.fillStyle = blipColor;
        ctx.beginPath();
        ctx.arc(targetX, targetY, isThreat ? 2.5 : 2, 0, Math.PI * 2);
        ctx.fill();

        // Target Tag
        ctx.fillStyle = isSwept ? '#F3F6FA' : 'rgba(154, 167, 184, 0.85)';
        ctx.font = '500 9px "JetBrains Mono", monospace';
        ctx.fillText(`#${det.track_id}`, targetX + 6, targetY + 3);
      });

      animFrame = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animFrame);
  }, [detections, width, height]);

  return (
    <div className="relative w-full max-w-full rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface-secondary)] p-2 flex flex-col items-center justify-center">
      <canvas ref={canvasRef} width={width} height={height} className="w-full max-w-[290px] h-auto aspect-square block" />
      <div className="absolute top-2.5 left-2.5 bg-[var(--bg-surface)]/90 px-2.5 py-0.5 rounded-full border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--thermal-cyan)] flex items-center gap-1.5 z-10 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--thermal-cyan)] animate-pulse" />
        <span>360° SECTOR</span>
      </div>
    </div>
  );
};
