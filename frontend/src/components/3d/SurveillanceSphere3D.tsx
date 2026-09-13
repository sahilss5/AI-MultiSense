import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

interface SurveillanceSphere3DProps {
  className?: string;
}

interface SectorInfo {
  name: string;
  lat: number;
  lon: number;
  status: 'ONLINE' | 'THREAT' | 'ACTIVE';
  sensor: string;
}

export const SurveillanceSphere3D: React.FC<SurveillanceSphere3DProps> = ({
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeSector, setActiveSector] = useState<SectorInfo | null>({
    name: 'SECTOR ALPHA-4',
    lat: 34.05,
    lon: -118.25,
    status: 'ONLINE',
    sensor: 'FLIR AX65 LWIR Array',
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let animFrameId: number;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 280;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 7.5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Colors
    const colCyan = new THREE.Color('#55D9F5');
    const colViolet = new THREE.Color('#8C9BFF');
    const colCoral = new THREE.Color('#F27786');
    const colGreen = new THREE.Color('#4FD1A5');

    const sphereGroup = new THREE.Group();
    scene.add(sphereGroup);

    // 1. Dark Globe Core
    const coreGeo = new THREE.SphereGeometry(2.3, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x050a12,
      transparent: true,
      opacity: 0.85,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    sphereGroup.add(coreMesh);

    // 2. Latitude & Longitude Wireframe Rings
    const wireGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(2.32, 18, 18));
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x1a2e46,
      transparent: true,
      opacity: 0.45,
    });
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    sphereGroup.add(wireMesh);

    // 3. Equator and Major Meridian Glowing Accent Rings
    const equatorGeo = new THREE.RingGeometry(2.34, 2.38, 64);
    const equatorMat = new THREE.MeshBasicMaterial({ color: colCyan, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
    const equator = new THREE.Mesh(equatorGeo, equatorMat);
    equator.rotation.x = Math.PI / 2;
    sphereGroup.add(equator);

    // 4. Surveillance Sector Markers (Pins)
    const sectors: SectorInfo[] = [
      { name: 'SECTOR ALPHA-4', lat: 34.05, lon: -118.25, status: 'ONLINE', sensor: 'FLIR AX65 Primary Array' },
      { name: 'PERIMETER NORTH', lat: 51.50, lon: -0.12, status: 'ONLINE', sensor: 'Optical Array 02' },
      { name: 'APPROACH GATE WEST', lat: 35.68, lon: 139.76, status: 'THREAT', sensor: 'Radar Speed Seam' },
      { name: 'CRITICAL FACILITY', lat: 28.61, lon: 77.20, status: 'ACTIVE', sensor: 'Multi-Sensor Hub' },
    ];

    const pinMeshes: { mesh: THREE.Mesh; sector: SectorInfo }[] = [];
    const pinGeo = new THREE.SphereGeometry(0.1, 12, 12);

    sectors.forEach((sec) => {
      const phi = (90 - sec.lat) * (Math.PI / 180);
      const theta = (sec.lon + 180) * (Math.PI / 180);

      const r = 2.38;
      const x = -(r * Math.sin(phi) * Math.cos(theta));
      const z = r * Math.sin(phi) * Math.sin(theta);
      const y = r * Math.cos(phi);

      const pinMat = new THREE.MeshBasicMaterial({
        color: sec.status === 'THREAT' ? colCoral : sec.status === 'ONLINE' ? colCyan : colViolet,
      });
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(x, y, z);
      sphereGroup.add(pin);
      pinMeshes.push({ mesh: pin, sector: sec });
    });

    // 5. Interactive Mouse Drag Orbit
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let rotationVelocityX = 0;
    let rotationVelocityY = 0.003;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        rotationVelocityY = deltaX * 0.005;
        rotationVelocityX = deltaY * 0.005;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Animation Loop
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        sphereGroup.rotation.y += rotationVelocityY;
        sphereGroup.rotation.x += rotationVelocityX;

        // Damping
        if (!isDragging) {
          rotationVelocityY = THREE.MathUtils.lerp(rotationVelocityY, 0.002, 0.03);
          rotationVelocityX = THREE.MathUtils.lerp(rotationVelocityX, 0, 0.03);
        }

        // Pulse pin scales
        pinMeshes.forEach((p, idx) => {
          const scale = 1 + Math.sin(time * 3 + idx) * 0.25;
          p.mesh.scale.set(scale, scale, scale);
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container || !canvas) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-72 rounded-2xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center select-none ${className}`}
    >
      <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* Top Header Badge */}
      <div className="absolute top-3 left-3 bg-[var(--bg-surface)]/85 backdrop-blur-md px-3 py-1 rounded-full border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--thermal-cyan)] flex items-center gap-2 pointer-events-none shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--thermal-cyan)] pulse-live" />
        <span>3D SURVEILLANCE SPHERE</span>
      </div>

      <div className="absolute top-3 right-3 text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface)]/80 px-2 py-0.5 rounded border border-[var(--border-subtle)] pointer-events-none">
        INTERACTIVE DRAG
      </div>

      {/* Active Sector Summary Panel */}
      {activeSector && (
        <div className="absolute bottom-3 left-3 right-3 bg-[var(--bg-surface)]/90 backdrop-blur-xl border border-[var(--border-subtle)] p-2.5 rounded-xl flex items-center justify-between text-xs font-sans pointer-events-none">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[var(--operational-green)] pulse-live" />
            <span className="font-semibold text-[var(--text-primary)] font-mono">{activeSector.name}</span>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] font-mono">{activeSector.sensor}</span>
          <span className="text-[10px] text-[var(--operational-green)] font-mono font-semibold px-2 py-0.5 rounded bg-[var(--operational-green)]/10 border border-[var(--operational-green)]/20">
            {activeSector.status}
          </span>
        </div>
      )}
    </div>
  );
};
