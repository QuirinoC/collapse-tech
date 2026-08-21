"use client";

import { useEffect, useRef } from "react";

const COLUMNS = 17;
const ROWS = 12;
const CYCLE_MS = 12800;
const TAU = Math.PI * 2;

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

function easeIn(value) {
  const amount = clamp(value);
  return amount * amount * amount;
}

function easeOut(value) {
  return 1 - Math.pow(1 - clamp(value), 3);
}

function phaseAmount(progress, start, end) {
  return smoothstep((progress - start) / (end - start));
}

function drawLine(context, from, to) {
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
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

    function drawBackdrop(progress, centerX, centerY, impact) {
      const pulse = 0.5 + Math.sin(progress * TAU * 3) * 0.5;

      context.save();
      context.strokeStyle = "rgba(17, 17, 15, 0.075)";
      context.lineWidth = 0.7;
      for (let ring = 1; ring <= 4; ring += 1) {
        context.beginPath();
        context.arc(centerX, centerY, ring * Math.min(width, height) * 0.105, 0, TAU);
        context.stroke();
      }

      context.setLineDash([2, 8]);
      context.beginPath();
      context.moveTo(centerX, height * 0.08);
      context.lineTo(centerX, height * 0.9);
      context.moveTo(width * 0.08, centerY);
      context.lineTo(width * 0.92, centerY);
      context.stroke();
      context.setLineDash([]);

      if (impact > 0) {
        for (let ring = 0; ring < 3; ring += 1) {
          const age = clamp(impact - ring * 0.16);
          const radius = width * (0.05 + easeOut(age) * (0.38 + ring * 0.05));
          context.strokeStyle = `rgba(17, 17, 15, ${0.28 * (1 - age)})`;
          context.lineWidth = 0.8 + (1 - age) * 1.2;
          context.beginPath();
          context.ellipse(centerX, centerY, radius, radius * 0.28, 0, 0, TAU);
          context.stroke();
        }
      }

      context.fillStyle = `rgba(17, 17, 15, ${0.025 + pulse * 0.02})`;
      context.beginPath();
      context.arc(centerX, centerY, Math.min(width, height) * 0.018, 0, TAU);
      context.fill();
      context.restore();
    }

    function buildPoints(progress, timestamp, cycleSeed) {
      const centerX = width * 0.5;
      const top = height * 0.105;
      const structureHeight = height * 0.61;
      const structureWidth = width * 0.57;
      const impactY = height * 0.73;
      const stress = phaseAmount(progress, 0.17, 0.29) * (1 - phaseAmount(progress, 0.34, 0.46));
      const rebuild = phaseAmount(progress, 0.79, 0.98);
      const points = [];

      for (let row = 0; row < ROWS; row += 1) {
        const yRatio = row / (ROWS - 1);
        const taper = 0.7 + yRatio * 0.3;
        for (let column = 0; column < COLUMNS; column += 1) {
          const index = row * COLUMNS + column;
          const xRatio = column / (COLUMNS - 1);
          const normalizedX = xRatio * 2 - 1;
          const baseX = centerX + normalizedX * structureWidth * 0.5 * taper;
          const baseY = top + yRatio * structureHeight;
          const wave = Math.sin(yRatio * 9 + timestamp * 0.006) * stress;
          const side = Math.sign(normalizedX) || 1;
          const buckledX = baseX + wave * width * 0.025 * (0.25 + yRatio);
          const buckledY = baseY + Math.abs(wave) * height * 0.01;
          const failureOrder = 0.285 + (1 - yRatio) * 0.16
            + noise(index + 20 + cycleSeed) * 0.035;
          const collapse = easeIn((progress - failureOrder) / 0.2);
          const angle = noise(index + 80 + cycleSeed) * TAU + normalizedX * 0.8;
          const pileRadius = width * (0.02 + noise(index + 120 + cycleSeed) * 0.21);
          const pileX = centerX + Math.cos(angle) * pileRadius;
          const pileY = impactY - noise(index + 180 + cycleSeed) * height * 0.045;
          const vortex = Math.sin(collapse * Math.PI) * width * 0.14;
          const aftershock = Math.sin(timestamp * 0.018 + index)
            * (1 - phaseAmount(progress, 0.52, 0.73))
            * phaseAmount(progress, 0.45, 0.52);
          const fallingX = buckledX + (pileX - buckledX) * collapse
            + side * vortex * noise(index + 220 + cycleSeed)
            + aftershock * width * 0.006;
          const fallingY = buckledY + (pileY - buckledY) * collapse
            - Math.sin(collapse * Math.PI) * height * 0.08
            + Math.abs(aftershock) * height * 0.004;
          const reconstructArc = Math.sin(rebuild * Math.PI) * width * 0.11;
          const reconstructedX = fallingX + (baseX - fallingX) * rebuild
            + Math.sin(angle + rebuild * TAU) * reconstructArc;
          const reconstructedY = fallingY + (baseY - fallingY) * rebuild
            - Math.cos(angle + rebuild * TAU) * reconstructArc * 0.45;

          points.push({
            x: reconstructedX,
            y: reconstructedY,
            baseX,
            baseY,
            collapse: collapse * (1 - rebuild),
            rotation: collapse * (noise(index + 300 + cycleSeed) - 0.5) * 8 + rebuild * TAU,
            size: 1.1 + noise(index + 360) * 2.2,
            row,
            column,
          });
        }
      }

      return { points, centerX, impactY, stress, rebuild };
    }

    function drawStructure(points, stress) {
      context.save();
      context.strokeStyle = `rgba(17, 17, 15, ${0.17 + stress * 0.16})`;
      context.lineWidth = 0.72;

      for (let row = 0; row < ROWS; row += 1) {
        context.beginPath();
        for (let column = 0; column < COLUMNS - 1; column += 1) {
          const current = points[row * COLUMNS + column];
          const next = points[row * COLUMNS + column + 1];
          if (Math.max(current.collapse, next.collapse) < 0.72) {
            drawLine(context, current, next);
          }
        }
        context.stroke();
      }

      for (let column = 0; column < COLUMNS; column += 1) {
        context.beginPath();
        for (let row = 0; row < ROWS - 1; row += 1) {
          const current = points[row * COLUMNS + column];
          const next = points[(row + 1) * COLUMNS + column];
          if (Math.max(current.collapse, next.collapse) < 0.68) {
            drawLine(context, current, next);
          }
        }
        context.stroke();
      }

      context.strokeStyle = `rgba(17, 17, 15, ${0.1 + stress * 0.15})`;
      for (let row = 0; row < ROWS - 1; row += 2) {
        context.beginPath();
        for (let column = 0; column < COLUMNS - 1; column += 2) {
          const current = points[row * COLUMNS + column];
          const diagonal = points[(row + 1) * COLUMNS + column + 1];
          if (Math.max(current.collapse, diagonal.collapse) < 0.55) {
            drawLine(context, current, diagonal);
          }
        }
        context.stroke();
      }
      context.restore();
    }

    function drawFractures(progress, points, stress, cycleSeed) {
      if (stress <= 0.05 && progress < 0.27) return;

      const fracture = phaseAmount(progress, 0.2, 0.32) * (1 - phaseAmount(progress, 0.5, 0.58));
      context.save();
      context.strokeStyle = `rgba(17, 17, 15, ${fracture * 0.85})`;
      context.lineWidth = 1.1;
      context.shadowColor = "rgba(17, 17, 15, 0.3)";
      context.shadowBlur = fracture * 5;

      [4, 8, 12].forEach((startColumn, fractureIndex) => {
        context.beginPath();
        for (let row = 2; row < ROWS - 1; row += 1) {
          const column = Math.max(
            1,
            Math.min(
              COLUMNS - 2,
              startColumn + Math.round((noise(row + fractureIndex * 31 + cycleSeed) - 0.5) * 3),
            ),
          );
          const point = points[row * COLUMNS + column];
          if (row === 2) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.stroke();
      });
      context.restore();
    }

    function drawDebris(progress, centerX, impactY, cycleSeed) {
      const burst = phaseAmount(progress, 0.43, 0.51) * (1 - phaseAmount(progress, 0.7, 0.79));
      if (burst <= 0) return;

      context.save();
      for (let index = 0; index < 54; index += 1) {
        const angle = noise(index + 900 + cycleSeed) * Math.PI + Math.PI;
        const distance = easeOut(burst) * width
          * (0.08 + noise(index + 940 + cycleSeed) * 0.43);
        const gravity = burst * burst * height * 0.24;
        const x = centerX + Math.cos(angle) * distance;
        const y = impactY + Math.sin(angle) * distance * 0.48 + gravity;
        const alpha = (1 - smoothstep((burst - 0.62) / 0.38)) * (0.18 + noise(index) * 0.54);
        const size = 0.7 + noise(index + 980 + cycleSeed) * 2.8;

        context.fillStyle = `rgba(17, 17, 15, ${alpha})`;
        context.save();
        context.translate(x, y);
        context.rotate(angle + burst * 8);
        context.fillRect(-size, -size * 0.35, size * 2, size * 0.7);
        context.restore();
      }
      context.restore();
    }

    function drawNodes(points) {
      context.fillStyle = "#11110f";
      points.forEach((point) => {
        context.save();
        context.translate(point.x, point.y);
        context.rotate(point.rotation);
        const size = point.size + point.collapse * 2.2;
        context.fillRect(-size / 2, -size / 2, size, size);
        context.restore();
      });
    }

    function drawCore(progress, centerX, impactY) {
      const compression = phaseAmount(progress, 0.35, 0.5) * (1 - phaseAmount(progress, 0.77, 0.9));
      const flare = clamp(1 - Math.abs(progress - 0.49) / 0.065);
      const radius = Math.min(width, height) * (0.008 + compression * 0.065 + flare * 0.035);
      const glow = context.createRadialGradient(centerX, impactY, 0, centerX, impactY, radius * 4.8);
      glow.addColorStop(0, `rgba(17, 17, 15, ${0.35 * compression})`);
      glow.addColorStop(0.35, `rgba(17, 17, 15, ${0.13 * compression})`);
      glow.addColorStop(1, "rgba(17, 17, 15, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(centerX, impactY, radius * 4.8, 0, TAU);
      context.fill();

      context.fillStyle = "#11110f";
      context.beginPath();
      context.arc(centerX, impactY, radius, 0, TAU);
      context.fill();

      if (flare > 0) {
        context.strokeStyle = `rgba(17, 17, 15, ${flare * 0.55})`;
        context.lineWidth = 0.7;
        for (let ray = 0; ray < 16; ray += 1) {
          const angle = noise(ray + 700) * TAU;
          const inner = radius * 1.4;
          const outer = radius * (2.5 + noise(ray + 730) * 5);
          context.beginPath();
          context.moveTo(centerX + Math.cos(angle) * inner, impactY + Math.sin(angle) * inner);
          context.lineTo(centerX + Math.cos(angle) * outer, impactY + Math.sin(angle) * outer);
          context.stroke();
        }
      }
    }

    function drawTelemetry(progress, stress, rebuild) {
      let phase = "NOMINAL";
      if (progress >= 0.17 && progress < 0.29) phase = "LOAD CRITICAL";
      else if (progress >= 0.29 && progress < 0.5) phase = "CASCADE FAILURE";
      else if (progress >= 0.5 && progress < 0.79) phase = "TOTAL COLLAPSE";
      else if (progress >= 0.79) phase = "RECONSTRUCTION";

      context.save();
      context.font = "9px monospace";
      context.fillStyle = "rgba(17, 17, 15, 0.55)";
      context.textAlign = "left";
      context.fillText(phase, width * 0.055, height * 0.91);
      context.textAlign = "right";
      const load = Math.round(18 + stress * 81 + (1 - rebuild) * phaseAmount(progress, 0.29, 0.5) * 67);
      context.fillText(`LOAD ${Math.min(load, 99).toString().padStart(2, "0")}%`, width * 0.945, height * 0.91);
      context.restore();
    }

    function draw(timestamp, staticProgress) {
      const progress = staticProgress ?? (timestamp % CYCLE_MS) / CYCLE_MS;
      const cycleSeed = staticProgress === undefined ? Math.floor(timestamp / CYCLE_MS) * 1009 : 0;
      const { points, centerX, impactY, stress, rebuild } = buildPoints(
        progress,
        timestamp,
        cycleSeed,
      );
      const impact = phaseAmount(progress, 0.47, 0.54)
        * (1 - phaseAmount(progress, 0.68, 0.76));

      context.clearRect(0, 0, width, height);
      context.lineCap = "round";
      context.lineJoin = "round";
      drawBackdrop(progress, centerX, impactY, impact);
      drawStructure(points, stress);
      drawFractures(progress, points, stress, cycleSeed);
      drawDebris(progress, centerX, impactY, cycleSeed);
      drawNodes(points);
      drawCore(progress, centerX, impactY);
      drawTelemetry(progress, stress, rebuild);
    }

    function animate(timestamp) {
      if (visible && !document.hidden && !reducedMotion) draw(timestamp);
      frame = window.requestAnimationFrame(animate);
    }

    function handleMotion(event) {
      reducedMotion = event.matches;
      if (reducedMotion) draw(0, 0.43);
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reducedMotion) draw(0, 0.43);
    });
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });

    resizeObserver.observe(canvas);
    visibilityObserver.observe(canvas);
    media.addEventListener("change", handleMotion);
    resize();
    if (reducedMotion) draw(0, 0.43);
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
      <div className="collapse-index">CT / COLLAPSE ENGINE</div>
      <p>Structural event<br />No two failures identical</p>
    </div>
  );
}
