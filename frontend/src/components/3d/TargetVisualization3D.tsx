import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface TargetVisualization3DProps {
  targetClass?: string;
  threat?: boolean;
  confidence?: number;
  speed?: number;
  className?: string;
}

export const TargetVisualization3D: React.FC<TargetVisualization3DProps> = ({
  targetClass = 'PERSON',
  threat = false,
  confidence = 0.97,
  speed = 4.2,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let animFrameId: number;
    const width = container.clientWidth || 320;
    const height = container.clientHeight || 200;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 2.5, 6.5);
    camera.lookAt(0, 0.2, 0);

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
    const colCoral = new THREE.Color('#F27786');
    const colViolet = new THREE.Color('#8C9BFF');
    const colAmber = new THREE.Color('#E7B85C');

    const primaryColor = threat ? colCoral : (targetClass.toUpperCase() === 'DRONE' ? colViolet : colCyan);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    // 1. Pedestal Base Grid & Ring
    const baseRingGeo = new THREE.RingGeometry(1.6, 1.7, 48);
    const baseRingMat = new THREE.MeshBasicMaterial({ color: primaryColor, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
    const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = -1.2;
    scene.add(baseRing);

    const baseGrid = new THREE.GridHelper(3.4, 8, primaryColor, 0x1d2e42);
    (baseGrid.material as THREE.Material).transparent = true;
    (baseGrid.material as THREE.Material).opacity = 0.25;
    baseGrid.position.y = -1.2;
    scene.add(baseGrid);

    // 2. Class-Specific 3D Wireframe Mesh
    const entityGroup = new THREE.Group();
    modelGroup.add(entityGroup);

    const upperClass = targetClass.toUpperCase();

    if (upperClass === 'DRONE') {
      // Drone Quadrotor Frame
      const centerBodyGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.18, 8);
      const centerBodyMat = new THREE.MeshBasicMaterial({ color: primaryColor, wireframe: true });
      const centerBody = new THREE.Mesh(centerBodyGeo, centerBodyMat);
      entityGroup.add(centerBody);

      // 4 Arms
      const armGeo = new THREE.BoxGeometry(1.8, 0.04, 0.04);
      const armMat = new THREE.MeshBasicMaterial({ color: primaryColor });
      const arm1 = new THREE.Mesh(armGeo, armMat);
      const arm2 = new THREE.Mesh(armGeo, armMat);
      arm2.rotation.y = Math.PI / 2;
      entityGroup.add(arm1);
      entityGroup.add(arm2);

      // 4 Rotor Discs
      [
        [-0.9, 0.1, 0],
        [0.9, 0.1, 0],
        [0, 0.1, -0.9],
        [0, 0.1, 0.9],
      ].forEach(([rx, ry, rz]) => {
        const rotorGeo = new THREE.RingGeometry(0.2, 0.28, 16);
        const rotorMat = new THREE.MeshBasicMaterial({ color: primaryColor, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        const rotor = new THREE.Mesh(rotorGeo, rotorMat);
        rotor.rotation.x = Math.PI / 2;
        rotor.position.set(rx, ry, rz);
        entityGroup.add(rotor);
      });
    } else if (upperClass === 'VEHICLE') {
      // Vehicle Chassis Box & Cabin Wireframe
      const chassisGeo = new THREE.BoxGeometry(2.2, 0.5, 1.1);
      const chassisMat = new THREE.MeshBasicMaterial({ color: primaryColor, wireframe: true });
      const chassis = new THREE.Mesh(chassisGeo, chassisMat);
      chassis.position.y = -0.3;
      entityGroup.add(chassis);

      const cabinGeo = new THREE.BoxGeometry(1.2, 0.45, 0.95);
      const cabinMat = new THREE.MeshBasicMaterial({ color: primaryColor, wireframe: true });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(-0.1, 0.18, 0);
      entityGroup.add(cabin);
    } else {
      // Person Holographic Humanoid Silhouette
      const headGeo = new THREE.SphereGeometry(0.28, 12, 12);
      const headMat = new THREE.MeshBasicMaterial({ color: primaryColor, wireframe: true });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.9;
      entityGroup.add(head);

      const torsoGeo = new THREE.CylinderGeometry(0.35, 0.25, 0.9, 8);
      const torsoMat = new THREE.MeshBasicMaterial({ color: primaryColor, wireframe: true });
      const torso = new THREE.Mesh(torsoGeo, torsoMat);
      torso.position.y = 0.15;
      entityGroup.add(torso);

      const limbGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6);
      const limbMat = new THREE.MeshBasicMaterial({ color: primaryColor, wireframe: true });

      const legL = new THREE.Mesh(limbGeo, limbMat);
      legL.position.set(-0.2, -0.7, 0);
      const legR = new THREE.Mesh(limbGeo, limbMat);
      legR.position.set(0.2, -0.7, 0);
      entityGroup.add(legL);
      entityGroup.add(legR);
    }

    // 3. Holographic Bounding Box Cage with Corner Accents
    const bboxGeo = new THREE.BoxGeometry(2.6, 2.4, 1.6);
    const bboxMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    });
    const bbox = new THREE.Mesh(bboxGeo, bboxMat);
    modelGroup.add(bbox);

    // 4. Vertical Scan Beam Plane
    const scanPlaneGeo = new THREE.PlaneGeometry(2.6, 0.04);
    const scanPlaneMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const scanPlane = new THREE.Mesh(scanPlaneGeo, scanPlaneMat);
    modelGroup.add(scanPlane);

    // Animation Loop
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        // Slow holographic rotation
        modelGroup.rotation.y += delta * 0.7;

        // Vertical scanning laser motion
        scanPlane.position.y = Math.sin(time * 2.5) * 1.1;

        // Breathing bounding cage
        const bScale = 1 + Math.sin(time * 3) * 0.03;
        bbox.scale.set(bScale, bScale, bScale);
      }

      baseRing.rotation.z += delta * 0.3;

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
      renderer.dispose();
    };
  }, [targetClass, threat]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-video rounded-xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center select-none ${className}`}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* 3D Holographic Corner Reticle Brackets */}
      <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-[var(--thermal-cyan)] pointer-events-none" />
      <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[var(--thermal-cyan)] pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-[var(--thermal-cyan)] pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-[var(--thermal-cyan)] pointer-events-none" />

      {/* Live Telemetry Tag Overlay */}
      <div className="absolute top-2.5 left-6 bg-[var(--bg-surface)]/85 backdrop-blur-md px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--thermal-cyan)] pointer-events-none">
        3D WIREFRAME // {targetClass.toUpperCase()}
      </div>

      <div className="absolute bottom-2.5 right-6 bg-[var(--bg-surface)]/85 backdrop-blur-md px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--operational-green)] pointer-events-none">
        CONF {(confidence * 100).toFixed(0)}% • {speed.toFixed(1)}kph
      </div>
    </div>
  );
};
