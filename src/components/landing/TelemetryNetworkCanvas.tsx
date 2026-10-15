import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  color: string;
  type: 'telemetry' | 'nominal' | 'drift' | 'sif_trigger';
  isKeyNode: boolean;
  pulsePhase: number;
  nodeLabel?: string;
}

interface PulsePacket {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  speed: number;
  color: string;
}

export const TelemetryNetworkCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Mouse coordinates
    let mouse = { x: -9999, y: -9999, radius: 150 };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    // Responsive particle count
    const getParticleCount = () => {
      const area = width * height;
      if (area < 500000) return 40;
      if (area < 1200000) return 65;
      return 95;
    };

    const keyNodeLabels = [
      'BARRIER-01 [PRESSURE]',
      'SIF-VECTOR [LSR-03]',
      'ONTOLOGY-CORE',
      'CORROSION-DECAY',
      'GAS-SNIFF-TELEMETRY'
    ];

    let particles: Particle[] = [];
    let pulsePackets: PulsePacket[] = [];

    const initParticles = () => {
      const count = getParticleCount();
      particles = [];
      for (let i = 0; i < count; i++) {
        const isKeyNode = i < 5;
        let color = 'rgba(56, 189, 248, 0.7)'; // Cyan
        let type: Particle['type'] = 'telemetry';

        if (isKeyNode) {
          color = i === 1 ? 'rgba(248, 113, 113, 0.9)' : 'rgba(56, 189, 248, 0.9)';
          type = i === 1 ? 'sif_trigger' : 'telemetry';
        } else {
          const rand = Math.random();
          if (rand > 0.88) {
            color = 'rgba(248, 113, 113, 0.7)'; // SIF warning ruby
            type = 'sif_trigger';
          } else if (rand > 0.75) {
            color = 'rgba(251, 191, 36, 0.7)'; // Drift amber
            type = 'drift';
          } else if (rand > 0.55) {
            color = 'rgba(52, 211, 153, 0.7)'; // Nominal barrier emerald
            type = 'nominal';
          }
        }

        const baseRadius = isKeyNode ? 3.5 : Math.random() * 1.8 + 1.2;
        const speedMultiplier = prefersReducedMotion ? 0.08 : 0.45;

        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * speedMultiplier,
          vy: (Math.random() - 0.5) * speedMultiplier,
          radius: baseRadius,
          baseRadius,
          color,
          type,
          isKeyNode,
          pulsePhase: Math.random() * Math.PI * 2,
          nodeLabel: isKeyNode ? keyNodeLabels[i] : undefined
        });
      }
    };

    initParticles();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initParticles();
    };

    window.addEventListener('resize', handleResize);

    let lastPacketSpawn = 0;

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      // Draw subtle background coordinate markers
      ctx.strokeStyle = 'rgba(38, 42, 51, 0.35)';
      ctx.lineWidth = 1;

      // Draw grid
      const gridSize = 120;
      const startX = 0;
      const startY = 0;

      ctx.beginPath();
      for (let x = startX; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = startY; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Connect nearby particles
      const maxDistance = 140;
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];

        // Move particles
        p1.x += p1.vx;
        p1.y += p1.vy;

        // Bounce on boundaries
        if (p1.x < 0 || p1.x > width) p1.vx *= -1;
        if (p1.y < 0 || p1.y > height) p1.vy *= -1;

        // Cursor interaction
        const dxMouse = mouse.x - p1.x;
        const dyMouse = mouse.y - p1.y;
        const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
        if (distMouse < mouse.radius && !prefersReducedMotion) {
          const force = (1 - distMouse / mouse.radius) * 0.8;
          p1.x -= (dxMouse / distMouse) * force * 2;
          p1.y -= (dyMouse / distMouse) * force * 2;
        }

        // Draw connections
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDistance) {
            const alpha = (1 - dist / maxDistance) * 0.22;
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
            ctx.lineWidth = p1.isKeyNode || p2.isKeyNode ? 1.2 : 0.7;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Occasionally spawn a travelling packet along an edge
            if (
              !prefersReducedMotion &&
              time - lastPacketSpawn > 180 &&
              (p1.isKeyNode || p2.isKeyNode) &&
              Math.random() < 0.04 &&
              pulsePackets.length < 12
            ) {
              pulsePackets.push({
                fromX: p1.x,
                fromY: p1.y,
                toX: p2.x,
                toY: p2.y,
                progress: 0,
                speed: 0.015 + Math.random() * 0.02,
                color: p1.isKeyNode ? p1.color : 'rgba(56, 189, 248, 0.9)'
              });
              lastPacketSpawn = time;
            }
          }
        }

        // Draw particle dot
        p1.pulsePhase += 0.02;
        const pulse = Math.sin(p1.pulsePhase);

        ctx.fillStyle = p1.color;
        ctx.beginPath();
        const currentRadius = p1.baseRadius + (p1.isKeyNode ? pulse * 0.8 : 0);
        ctx.arc(p1.x, p1.y, Math.max(1, currentRadius), 0, Math.PI * 2);
        ctx.fill();

        // Draw pulse halos for Intelligence Nodes
        if (p1.isKeyNode) {
          const haloRadius = p1.baseRadius * 3.5 + pulse * 4;
          ctx.strokeStyle = p1.color.replace('0.9)', '0.35)').replace('0.7)', '0.25)');
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p1.x, p1.y, Math.max(2, haloRadius), 0, Math.PI * 2);
          ctx.stroke();

          // Technical label
          if (p1.nodeLabel && width > 768) {
            ctx.font = '9px "IBM Plex Mono", monospace';
            ctx.fillStyle = 'rgba(142, 213, 255, 0.65)';
            ctx.fillText(p1.nodeLabel, p1.x + 8, p1.y - 6);
          }
        }
      }

      // Draw travelling pulse packets
      if (!prefersReducedMotion) {
        for (let k = pulsePackets.length - 1; k >= 0; k--) {
          const packet = pulsePackets[k];
          packet.progress += packet.speed;

          if (packet.progress >= 1) {
            pulsePackets.splice(k, 1);
            continue;
          }

          const curX = packet.fromX + (packet.toX - packet.fromX) * packet.progress;
          const curY = packet.fromY + (packet.toY - packet.fromY) * packet.progress;

          ctx.fillStyle = packet.color;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(curX, curY, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <canvas ref={canvasRef} className="w-full h-full block" />
      {/* Decorative Telemetry Disclaimer Tag */}
      <div className="absolute bottom-3 right-4 z-10 hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-[#0a0e16]/80 border border-[#262a33]/60 backdrop-blur-sm text-[9px] font-label-code-sm text-[#87929a] tracking-wider pointer-events-auto">
        <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
        <span>DECORATIVE TELEMETRY VISUALIZATION • NOT OPERATIONAL TELEMETRY</span>
      </div>
    </div>
  );
};
