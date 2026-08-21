"use client";

import { useEffect, useRef } from "react";

const COLUMNS = 13;
const ROWS = 9;
const CYCLE_MS = 9200;

function noise(index) {
  const value = Math.sin(index * 91.173) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const amount = clamp(value);
  return amount * amount * (3 - 2 * amount);
}

function collapseAt(progress, delay) {
  if (progress < 0.23) return 0;
  if (progress < 0.58) {
    return smoothstep((progress - 0.23 - delay) / (0.35 - delay));
  }
  if (progress < 0.72) return 1;
  return 1 - smoothstep((progress - 0.72) / 0.28);
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

    function draw(timestamp, staticProgress) {
      const progress = staticProgress ?? (timestamp % CYCLE_MS) / CYCLE_MS;
      const left = width * 0.14;
      const top = height * 0.14;
      const fieldWidth = width * 0.72;
      const fieldHeight = height * 0.59;
      const centerX = width * 0.5;
      const groundY = height * 0.78;
      const points = [];

      context.clearRect(0, 0, width, height);
      context.lineCap = "round";

      for (let row = 0; row < ROWS; row += 1) {
        for (let column = 0; column < COLUMNS; column += 1) {
          const index = row * COLUMNS + column;
          const xRatio = column / (COLUMNS - 1);
          const yRatio = row / (ROWS - 1);
          const baseX = left + xRatio * fieldWidth;
          const baseY = top + yRatio * fieldHeight;
          const delay = (1 - yRatio) * 0.105 + Math.abs(xRatio - 0.5) * 0.035;
          const amount = collapseAt(progress, delay);
          const scatter = (noise(index) - 0.5) * width * 0.17;
          const targetX = centerX + (baseX - centerX) * 0.08 + scatter;
          const targetY = groundY - noise(index + 200) * height * 0.055;
          const bend = Math.sin(xRatio * Math.PI) * amount * (1 - amount) * height * 0.18;

          points.push({
            amount,
            x: baseX + (targetX - baseX) * amount,
            y: baseY + (targetY - baseY) * amount + bend,
            size: 1.2 + noise(index + 400) * 1.7,
          });
        }
      }

      context.strokeStyle = "rgba(17, 17, 15, 0.16)";
      context.lineWidth = 0.8;
      for (let row = 0; row < ROWS; row += 1) {
        context.beginPath();
        for (let column = 0; column < COLUMNS; column += 1) {
          const point = points[row * COLUMNS + column];
          if (column === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.stroke();
      }
      for (let column = 0; column < COLUMNS; column += 1) {
        context.beginPath();
        for (let row = 0; row < ROWS; row += 1) {
          const point = points[row * COLUMNS + column];
          if (row === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.stroke();
      }

      context.fillStyle = "#11110f";
      points.forEach((point, index) => {
        context.save();
        context.translate(point.x, point.y);
        context.rotate(point.amount * (noise(index + 600) - 0.5) * 3);
        const size = point.size + point.amount * 1.2;
        context.fillRect(-size / 2, -size / 2, size, size);
        context.restore();
      });

      const overallCollapse = points[Math.floor(points.length / 2)].amount;
      const coreRadius = 3 + overallCollapse * Math.min(width, height) * 0.075;
      const glow = context.createRadialGradient(
        centerX,
        groundY - height * 0.02,
        0,
        centerX,
        groundY - height * 0.02,
        coreRadius * 3.4,
      );
      glow.addColorStop(0, `rgba(17, 17, 15, ${0.18 * overallCollapse})`);
      glow.addColorStop(1, "rgba(17, 17, 15, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(centerX, groundY - height * 0.02, coreRadius * 3.4, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#11110f";
      context.beginPath();
      context.arc(centerX, groundY - height * 0.02, coreRadius, 0, Math.PI * 2);
      context.fill();

      const impact = clamp(1 - Math.abs(progress - 0.64) / 0.09);
      if (impact > 0) {
        context.strokeStyle = `rgba(17, 17, 15, ${impact * 0.22})`;
        context.lineWidth = 1;
        context.beginPath();
        context.ellipse(
          centerX,
          groundY,
          width * (0.08 + (1 - impact) * 0.28),
          height * (0.015 + (1 - impact) * 0.045),
          0,
          0,
          Math.PI * 2,
        );
        context.stroke();
      }
    }

    function animate(timestamp) {
      if (visible && !document.hidden && !reducedMotion) draw(timestamp);
      frame = window.requestAnimationFrame(animate);
    }

    function handleMotion(event) {
      reducedMotion = event.matches;
      if (reducedMotion) draw(0, 0.62);
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reducedMotion) draw(0, 0.62);
    });
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });

    resizeObserver.observe(canvas);
    visibilityObserver.observe(canvas);
    media.addEventListener("change", handleMotion);
    resize();
    if (reducedMotion) draw(0, 0.62);
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
      <div className="collapse-index">CT / 001</div>
      <p>Controlled collapse<br />repeats indefinitely</p>
    </div>
  );
}
