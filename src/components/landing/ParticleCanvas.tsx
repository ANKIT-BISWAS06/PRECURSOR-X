import React, { useEffect, useRef } from 'react';

export const ParticleCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = window.devicePixelRatio || 1;
    let animationFrameId: number;

    // Mouse State
    const mouse = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      radius: 140,
      isActive: false
    };

    // Scanner line state
    let scannerY = -50;
    let scannerSpeed = 1.2;

    function resize() {
      if (!canvas) return;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx!.scale(dpr, dpr);
    }

    // Data Packet Class for traveling signals
    class DataPacket {
      p1: Particle;
      p2: Particle;
      progress: number;
      speed: number;
      color: string;
      alive: boolean;

      constructor(p1: Particle, p2: Particle, color?: string) {
        this.p1 = p1;
        this.p2 = p2;
        this.progress = 0;
        this.speed = 0.015 + Math.random() * 0.02;
        this.color = color || '#38bdf8';
        this.alive = true;
      }
      update() {
        this.progress += this.speed;
        if (this.progress >= 1) {
          this.alive = false;
        }
      }
      draw(c: CanvasRenderingContext2D) {
        const x = this.p1.x + (this.p2.x - this.p1.x) * this.progress;
        const y = this.p1.y + (this.p2.y - this.p1.y) * this.progress;
        c.beginPath();
        c.arc(x, y, 2.5, 0, Math.PI * 2);
        c.fillStyle = this.color;
        c.shadowColor = this.color;
        c.shadowBlur = 8;
        c.fill();
        c.shadowBlur = 0;
      }
    }

    // Particle Node Class
    class Particle {
      x = 0;
      y = 0;
      depth = 1;
      baseRadius = 1;
      speedFactor = 1;
      alpha = 0.5;
      type: 'normal' | 'warning' | 'hazard' = 'normal';
      color = '#38bdf8';
      isKeyNode = false;
      vx = 0;
      vy = 0;
      pulsePhase = 0;
      pulseSpeed = 0.02;

      constructor() {
        this.reset(true);
      }

      reset(initial = false) {
        this.x = Math.random() * width;
        // Bias particle concentration slightly toward upper hero region
        if (initial) {
          this.y = Math.random() < 0.6 ? Math.random() * (height * 0.55) : Math.random() * height;
        } else {
          this.y = Math.random() * height;
        }

        // Depth layer (1 = bg, 2 = mid, 3 = fg)
        const depthRand = Math.random();
        if (depthRand < 0.55) {
          this.depth = 1; // background
          this.baseRadius = 1.0 + Math.random() * 0.8;
          this.speedFactor = 0.45;
          this.alpha = 0.18 + Math.random() * 0.15;
        } else if (depthRand < 0.88) {
          this.depth = 2; // midground
          this.baseRadius = 1.8 + Math.random() * 1.0;
          this.speedFactor = 0.85;
          this.alpha = 0.35 + Math.random() * 0.25;
        } else {
          this.depth = 3; // foreground
          this.baseRadius = 2.6 + Math.random() * 1.4;
          this.speedFactor = 1.25;
          this.alpha = 0.65 + Math.random() * 0.25;
        }

        // Types: normal (92%), amber risk (5%), red hazard (3%)
        const typeRand = Math.random();
        if (typeRand > 0.97) {
          this.type = 'hazard'; // red
          this.color = '#ef4444';
        } else if (typeRand > 0.92) {
          this.type = 'warning'; // amber
          this.color = '#f59e0b';
        } else {
          this.type = 'normal'; // cyan/blue
          this.color = Math.random() > 0.3 ? '#38bdf8' : '#60a5fa';
        }

        // Intelligence Node Flag (a few distinct larger nodes representing PRECURSOR, HAZARD, BARRIER)
        this.isKeyNode = Math.random() < 0.05;
        if (this.isKeyNode) {
          this.baseRadius *= 1.8;
          this.alpha = Math.min(1, this.alpha + 0.3);
        }

        this.vx = (Math.random() - 0.5) * 0.35 * this.speedFactor;
        this.vy = (Math.random() - 0.5) * 0.35 * this.speedFactor;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.pulseSpeed = 0.02 + Math.random() * 0.02;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.pulsePhase += this.pulseSpeed;

        // Screen Wrap
        if (this.x < -20) this.x = width + 20;
        if (this.x > width + 20) this.x = -20;
        if (this.y < -20) this.y = height + 20;
        if (this.y > height + 20) this.y = -20;

        // Mouse gentle deflection & brightening
        if (mouse.isActive) {
          const dx = this.x - mouse.x;
          const dy = this.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius) {
            const force = (1 - dist / mouse.radius) * 0.5;
            this.x += (dx / dist) * force * 1.5;
            this.y += (dy / dist) * force * 1.5;
          }
        }
      }

      draw(c: CanvasRenderingContext2D) {
        const currentRadius = this.baseRadius + Math.sin(this.pulsePhase) * 0.4;
        let currentAlpha = this.alpha;

        // Proximity boost when near mouse
        if (mouse.isActive) {
          const dx = this.x - mouse.x;
          const dy = this.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius) {
            currentAlpha = Math.min(1, currentAlpha + (1 - dist / mouse.radius) * 0.4);
          }
        }

        c.beginPath();
        c.arc(this.x, this.y, Math.max(0.5, currentRadius), 0, Math.PI * 2);
        c.fillStyle = this.color;
        c.globalAlpha = currentAlpha;
        c.fill();

        // Outer halo ring for Key Intelligence Nodes
        if (this.isKeyNode) {
          c.beginPath();
          c.arc(this.x, this.y, currentRadius * 2.4, 0, Math.PI * 2);
          c.strokeStyle = this.color;
          c.lineWidth = 0.8;
          c.globalAlpha = currentAlpha * 0.4;
          c.stroke();
        }

        c.globalAlpha = 1;
      }
    }

    let particles: Particle[] = [];
    let packets: DataPacket[] = [];
    const isMobile = window.innerWidth < 768;
    const PARTICLE_COUNT = isMobile ? 80 : 180;
    const MAX_CONNECTION_DIST = isMobile ? 85 : 120;

    function initParticles() {
      particles = [];
      packets = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle());
      }
    }

    resize();
    initParticles();

    const onResize = () => {
      resize();
      initParticles();
    };

    const onMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.isActive = true;
    };

    const onMouseLeave = () => {
      mouse.isActive = false;
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);

    // Main Render Loop
    function animate() {
      if (!ctx) return;
      // Smooth mouse lerp
      if (mouse.isActive) {
        mouse.x += (mouse.targetX - mouse.x) * 0.12;
        mouse.y += (mouse.targetY - mouse.y) * 0.12;
      }

      ctx.clearRect(0, 0, width, height);

      // Ambient subtle background gradient orbs
      const heroGradient = ctx.createRadialGradient(width * 0.5, height * 0.25, 10, width * 0.5, height * 0.25, 450);
      heroGradient.addColorStop(0, 'rgba(56, 189, 248, 0.045)');
      heroGradient.addColorStop(1, 'rgba(9, 13, 22, 0)');
      ctx.fillStyle = heroGradient;
      ctx.fillRect(0, 0, width, height);

      // Update and draw particles
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw(ctx);
      }

      // Draw dynamic network connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i];
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < MAX_CONNECTION_DIST) {
            const baseOpacity = (1 - dist / MAX_CONNECTION_DIST) * 0.22;
            let lineAlpha = baseOpacity;

            // Proximity to mouse enhances link visibility
            if (mouse.isActive) {
              const midX = (p1.x + p2.x) * 0.5;
              const midY = (p1.y + p2.y) * 0.5;
              const mDist = Math.sqrt((midX - mouse.x) ** 2 + (midY - mouse.y) ** 2);
              if (mDist < mouse.radius) {
                lineAlpha += (1 - mDist / mouse.radius) * 0.25;
              }
            }

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);

            // If either node is warning/hazard, link carries the state
            if (p1.type === 'hazard' || p2.type === 'hazard') {
              ctx.strokeStyle = `rgba(239, 68, 68, ${Math.min(0.5, lineAlpha * 1.5)})`;
            } else if (p1.type === 'warning' || p2.type === 'warning') {
              ctx.strokeStyle = `rgba(245, 158, 11, ${Math.min(0.45, lineAlpha * 1.3)})`;
            } else {
              ctx.strokeStyle = `rgba(56, 189, 248, ${lineAlpha})`;
            }

            ctx.lineWidth = 0.75;
            ctx.stroke();

            // Random chance to spawn a traveling data signal packet
            if (Math.random() < 0.00035 && packets.length < 16) {
              const packetColor =
                p1.type === 'hazard' || p2.type === 'hazard'
                  ? '#ef4444'
                  : p1.type === 'warning' || p2.type === 'warning'
                  ? '#f59e0b'
                  : '#38bdf8';
              packets.push(new DataPacket(p1, p2, packetColor));
            }
          }
        }
      }

      // Update and draw traveling data packets
      for (let i = packets.length - 1; i >= 0; i--) {
        const packet = packets[i];
        packet.update();
        packet.draw(ctx);
        if (!packet.alive) {
          packets.splice(i, 1);
        }
      }

      // Faint horizontal telemetry scanner line
      scannerY += scannerSpeed;
      if (scannerY > height + 80) {
        scannerY = -50;
      }
      ctx.beginPath();
      ctx.moveTo(0, scannerY);
      ctx.lineTo(width, scannerY);
      const scannerGrad = ctx.createLinearGradient(0, scannerY, width, scannerY);
      scannerGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      scannerGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.08)');
      scannerGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.strokeStyle = scannerGrad;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      animationFrameId = requestAnimationFrame(animate);
    }

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return <canvas id="particle-canvas" ref={canvasRef} />;
};
