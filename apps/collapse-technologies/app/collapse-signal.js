"use client";

import { useEffect, useRef } from "react";

const CYCLE_MS = 14800;
const TAU = Math.PI * 2;
const PLANETS = [
  { radius: 0.105, speed: 1.42, size: 2.2, tilt: -0.18, phase: 0.4 },
  { radius: 0.175, speed: 1.03, size: 3.2, tilt: 0.13, phase: 2.8, moon: true },
  { radius: 0.255, speed: 0.78, size: 4.5, tilt: -0.08, phase: 4.5 },
  { radius: 0.345, speed: 0.59, size: 3.6, tilt: 0.2, phase: 1.7, moon: true },
  { radius: 0.43, speed: 0.44, size: 6.4, tilt: -0.12, phase: 5.35, ring: true },
];

function noise(index) {
  const value = Math.sin(index * 91.173 + 17.37) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const amount = clamp(value);
  return amount * amount * (3 - 2 * amount);
}

function easeOut(value) {
  return 1 - Math.pow(1 - clamp(value), 3);
}

function phaseAmount(progress, start, end) {
  return smoothstep((progress - start) / (end - start));
}

function collapseAmount(progress) {
  if (progress < 0.34) return 0;
  if (progress < 0.66) return smoothstep((progress - 0.34) / 0.32);
  if (progress < 0.76) return 1;
  return 1 - smoothstep((progress - 0.76) / 0.23);
}

export default function CollapseSignal() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let reducedMotion = media.matches;

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.75);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function orbitPoint(planet, time, collapse, trailOffset = 0) {
      const centerX = width * 0.5;
      const centerY = height * 0.49;
      const scale = Math.min(width, height);
      const decay = Math.pow(1 - collapse, 1.65);
      const minimumRadius = scale * (0.012 + planet.radius * 0.018);
      const orbitRadius = minimumRadius + scale * planet.radius * decay;
      const acceleration = collapse * collapse * (7.5 + planet.radius * 13);
      const angle = planet.phase + time * planet.speed + acceleration - trailOffset;
      const precession = planet.tilt + Math.sin(time * 0.22 + planet.phase) * 0.025;
      const ellipseY = 0.38 + planet.radius * 0.2;
      const localX = Math.cos(angle) * orbitRadius;
      const localY = Math.sin(angle) * orbitRadius * ellipseY;
      const cosTilt = Math.cos(precession);
      const sinTilt = Math.sin(precession);

      return {
        x: centerX + localX * cosTilt - localY * sinTilt,
        y: centerY + localX * sinTilt + localY * cosTilt,
        angle,
        radius: orbitRadius,
      };
    }

    function drawField(time, collapse) {
      const centerX = width * 0.5;
      const centerY = height * 0.49;
      const scale = Math.min(width, height);
      const stars = width < 440 ? 38 : 62;

      context.save();
      for (let index = 0; index < stars; index += 1) {
        const angle = noise(index) * TAU;
        const distance = scale * (0.12 + noise(index + 100) * 0.55);
        const parallax = 1 - collapse * (0.08 + noise(index + 200) * 0.2);
        const x = centerX + Math.cos(angle) * distance * parallax;
        const y = centerY + Math.sin(angle) * distance * 0.72 * parallax;
        const pulse = 0.45 + Math.sin(time * (0.7 + noise(index + 300)) + index) * 0.3;

        context.fillStyle = `rgba(17, 17, 15, ${0.09 + pulse * 0.13})`;
        context.beginPath();
        context.arc(x, y, 0.35 + noise(index + 400) * 0.7, 0, TAU);
        context.fill();
      }
      context.restore();
    }

    function drawOrbits(time, collapse) {
      const centerX = width * 0.5;
      const centerY = height * 0.49;
      const scale = Math.min(width, height);
      const visibility = 1 - smoothstep(collapse * 1.3);

      context.save();
      context.strokeStyle = `rgba(17, 17, 15, ${0.13 * visibility})`;
      context.lineWidth = 0.7;
      PLANETS.forEach((planet) => {
        const radius = scale * planet.radius;
        context.beginPath();
        context.ellipse(
          centerX,
          centerY,
          radius,
          radius * (0.38 + planet.radius * 0.2),
          planet.tilt + Math.sin(time * 0.22 + planet.phase) * 0.025,
          0,
          TAU,
        );
        context.stroke();
      });
      context.restore();
    }

    function drawTrails(time, collapse) {
      const trailLength = 6 + Math.round(collapse * 15);

      context.save();
      context.lineCap = "round";
      PLANETS.forEach((planet) => {
        for (let index = trailLength; index > 0; index -= 1) {
          const position = orbitPoint(planet, time, collapse, index * (0.018 + collapse * 0.035));
          const opacity = (1 - index / trailLength) * (0.04 + collapse * 0.19);
          const size = planet.size * (0.3 + (1 - index / trailLength) * 0.35);

          context.fillStyle = `rgba(17, 17, 15, ${opacity})`;
          context.beginPath();
          context.arc(position.x, position.y, size, 0, TAU);
          context.fill();
        }
      });
      context.restore();
    }

    function drawPlanet(planet, index, time, collapse) {
      const position = orbitPoint(planet, time, collapse);
      const tidal = phaseAmount(collapse, 0.58, 0.96);
      const stretch = 1 + tidal * (1.5 + index * 0.18);
      const alpha = 1 - phaseAmount(collapse, 0.91, 1);

      context.save();
      context.translate(position.x, position.y);
      context.rotate(position.angle + Math.PI / 2);
      context.scale(stretch, 1 / Math.sqrt(stretch));
      context.fillStyle = `rgba(17, 17, 15, ${alpha})`;
      context.beginPath();
      context.arc(0, 0, planet.size, 0, TAU);
      context.fill();

      if (planet.ring) {
        context.strokeStyle = `rgba(17, 17, 15, ${alpha * 0.5})`;
        context.lineWidth = 0.75;
        context.beginPath();
        context.ellipse(0, 0, planet.size * 1.85, planet.size * 0.55, 0, 0, TAU);
        context.stroke();
      }
      context.restore();

      if (planet.moon && collapse < 0.8) {
        const moonAngle = time * (2.8 + index * 0.2) + index;
        const moonRadius = planet.size * 2.7 * (1 - collapse * 0.7);
        context.fillStyle = `rgba(17, 17, 15, ${0.65 * alpha})`;
        context.beginPath();
        context.arc(
          position.x + Math.cos(moonAngle) * moonRadius,
          position.y + Math.sin(moonAngle) * moonRadius * 0.55,
          1.05,
          0,
          TAU,
        );
        context.fill();
      }
    }

    function drawAccretion(progress, time, collapse, seed) {
      const centerX = width * 0.5;
      const centerY = height * 0.49;
      const scale = Math.min(width, height);
      const disk = phaseAmount(progress, 0.49, 0.67)
        * (1 - phaseAmount(progress, 0.78, 0.92));

      if (disk <= 0) return;

      context.save();
      context.globalCompositeOperation = "multiply";
      for (let index = 0; index < 84; index += 1) {
        const depth = noise(index + 500 + seed);
        const angle = noise(index + 600 + seed) * TAU + time * (1.8 + depth * 4.2);
        const radius = scale * (0.025 + depth * 0.2) * (0.5 + collapse * 0.5);
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius * 0.19;
        const size = 0.45 + noise(index + 700 + seed) * 1.6;
        const alpha = disk * (0.08 + (1 - depth) * 0.42);

        context.fillStyle = `rgba(17, 17, 15, ${alpha})`;
        context.beginPath();
        context.ellipse(x, y, size * (1 + collapse), size, angle, 0, TAU);
        context.fill();
      }
      context.restore();
    }

    function drawSingularity(progress, time, collapse) {
      const centerX = width * 0.5;
      const centerY = height * 0.49;
      const scale = Math.min(width, height);
      const compression = phaseAmount(progress, 0.42, 0.66);
      const release = phaseAmount(progress, 0.77, 0.95);
      const eventHorizon = compression * (1 - release);
      const starRadius = scale * (0.028 * (1 - compression) + 0.008);
      const horizonRadius = scale * (0.012 + eventHorizon * 0.04);
      const lens = clamp(1 - Math.abs(progress - 0.67) / 0.12);

      context.save();
      if (collapse < 0.8) {
        const corona = context.createRadialGradient(
          centerX,
          centerY,
          starRadius * 0.2,
          centerX,
          centerY,
          starRadius * 4,
        );
        corona.addColorStop(0, `rgba(17, 17, 15, ${0.22 * (1 - collapse)})`);
        corona.addColorStop(1, "rgba(17, 17, 15, 0)");
        context.fillStyle = corona;
        context.beginPath();
        context.arc(centerX, centerY, starRadius * 4, 0, TAU);
        context.fill();
      }

      context.fillStyle = "#11110f";
      context.beginPath();
      context.arc(centerX, centerY, Math.max(starRadius, horizonRadius), 0, TAU);
      context.fill();

      if (eventHorizon > 0.05) {
        context.strokeStyle = `rgba(17, 17, 15, ${0.24 + lens * 0.48})`;
        context.lineWidth = 0.7 + lens * 1.5;
        context.beginPath();
        context.ellipse(
          centerX,
          centerY,
          horizonRadius * (1.65 + lens * 1.4),
          horizonRadius * (0.7 + lens * 0.22),
          Math.sin(time * 0.17) * 0.08,
          0,
          TAU,
        );
        context.stroke();
      }

      if (lens > 0) {
        for (let ring = 0; ring < 3; ring += 1) {
          const radius = horizonRadius * (2.5 + ring * 1.6 + easeOut(lens) * 2.4);
          context.strokeStyle = `rgba(17, 17, 15, ${lens * (0.2 - ring * 0.045)})`;
          context.lineWidth = 0.8;
          context.beginPath();
          context.arc(centerX, centerY, radius, -0.9 + ring * 0.3, 1.6 + ring * 0.35);
          context.stroke();
          context.beginPath();
          context.arc(centerX, centerY, radius, 2.2 + ring * 0.3, 4.7 + ring * 0.35);
          context.stroke();
        }
      }
      context.restore();
    }

    function draw(timestamp, staticProgress) {
      const progress = staticProgress ?? (timestamp % CYCLE_MS) / CYCLE_MS;
      const time = timestamp / 1000;
      const collapse = collapseAmount(progress);
      const seed = staticProgress === undefined ? Math.floor(timestamp / CYCLE_MS) * 997 : 0;

      context.clearRect(0, 0, width, height);
      drawField(time, collapse);
      drawOrbits(time, collapse);
      drawTrails(time, collapse);
      PLANETS.forEach((planet, index) => drawPlanet(planet, index, time, collapse));
      drawAccretion(progress, time, collapse, seed);
      drawSingularity(progress, time, collapse);
    }

    function animate(timestamp) {
      if (visible && !document.hidden && !reducedMotion) draw(timestamp);
      frame = window.requestAnimationFrame(animate);
    }

    function handleMotion(event) {
      reducedMotion = event.matches;
      if (reducedMotion) draw(0, 0.18);
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reducedMotion) draw(0, 0.18);
    });
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });

    resizeObserver.observe(canvas);
    visibilityObserver.observe(canvas);
    media.addEventListener("change", handleMotion);
    resize();
    if (reducedMotion) draw(0, 0.18);
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      media.removeEventListener("change", handleMotion);
    };
  }, []);

  return (
    <div className="signal-field" aria-hidden="true">
      <canvas className="collapse-canvas" ref={canvasRef} />
    </div>
  );
}
