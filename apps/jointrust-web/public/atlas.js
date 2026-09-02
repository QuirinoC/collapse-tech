(() => {
  const canvas = document.getElementById("atlas");
  if (!canvas) return;

  // Stroke/density matched to apps/trust-ios LoginAtlasBackground (quiet paper wash).
  const paper = "#ffffff";
  const ink = "#000000";
  const accent = "#e10600";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const ctx = canvas.getContext("2d", { alpha: true });
  let width = 0;
  let height = 0;
  let dpr = 1;
  let lw = 1;
  let raf = 0;
  let last = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lw = Math.max(0.55, width / 1400);
  }

  function stroke(path, alpha, widthMul = 1) {
    ctx.strokeStyle = hexAlpha(ink, alpha);
    ctx.lineWidth = lw * widthMul;
    ctx.stroke(path);
  }

  function drawMeridians(phase) {
    const count = 4;
    const cx = width * 0.5;
    const path = new Path2D();
    for (let i = 0; i <= count; i += 1) {
      const base = width * (i / count);
      const drift = Math.sin(phase + i * 0.55) * (width * 0.012);
      path.moveTo(base + drift, 0);
      path.quadraticCurveTo(base + (base - cx) * 0.14, height * 0.48, base - drift * 0.4, height);
    }
    stroke(path, 0.034, 0.8);
  }

  function drawParallels(phase) {
    const count = 5;
    const cy = height * 0.4;
    const path = new Path2D();
    for (let j = 0; j <= count; j += 1) {
      const y = height * (j / count);
      const bulge = (y - cy) * 0.04 + Math.sin(phase * 0.8 + j * 0.35) * (height * 0.006);
      path.moveTo(0, y);
      path.quadraticCurveTo(width * 0.5, y + bulge, width, y);
    }
    stroke(path, 0.028, 0.7);
  }

  function drawGlobe(phase) {
    const cx = width * 0.5;
    const cy = height * 0.4;
    const rw = width * 0.46;
    const rh = height * 0.24;
    ctx.save();
    ctx.strokeStyle = hexAlpha(ink, 0.045);
    ctx.lineWidth = lw * 0.9;
    ctx.setLineDash([lw * 3.2, lw * 9]);
    ctx.lineDashOffset = -(phase * 16);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let k = -1; k <= 1; k += 1) {
      if (k === 0) continue;
      ctx.strokeStyle = hexAlpha(ink, 0.024);
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw - Math.abs(k) * width * 0.07, rh + height * 0.012 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawContours(phase) {
    const cx = width * 0.5;
    const cy = height * 0.4;
    const bands = [
      [0.2, 0.11, 0],
      [0.3, 0.16, 1.1],
    ];
    bands.forEach((band, index) => {
      const ox = cx + Math.sin(phase * 0.65 + band[2]) * (width * 0.018);
      const oy = cy + Math.cos(phase * 0.45 + band[2]) * (height * 0.014);
      const path = new Path2D();
      const steps = 48;
      for (let step = 0; step <= steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2;
        const wobble = 1 + 0.07 * Math.sin(angle * 3 + phase + index);
        const x = ox + Math.cos(angle) * width * band[0] * wobble;
        const y = oy + Math.sin(angle) * height * band[1] * wobble;
        if (step === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.closePath();
      stroke(path, 0.042, 0.9);
    });
  }

  function drawFix(time) {
    const pulse = 0.45 + (0.35 * (Math.sin(time * 1.15) + 1)) / 2;
    const x = width * 0.72;
    const y = height * 0.33;
    const arm = Math.max(8, width * 0.008);
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y + arm);
    ctx.strokeStyle = hexAlpha(accent, 0.12 + 0.14 * pulse);
    ctx.lineWidth = lw * 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, arm * 2.1, 0, Math.PI * 2);
    ctx.strokeStyle = hexAlpha(ink, 0.048);
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
    const dot = Math.max(2.5, lw * 1.6);
    ctx.fillStyle = hexAlpha(accent, 0.22 + 0.12 * pulse);
    ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
  }

  function drawCoordinates() {
    const size = Math.max(10, Math.round(width / 130));
    ctx.fillStyle = hexAlpha(ink, 0.12);
    ctx.font = `500 ${size}px 'IBM Plex Mono', ui-monospace, monospace`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("40°42′ N", varPad(), height * 0.18);
    ctx.fillText("+00.00", varPad(), height * 0.62);
    ctx.textAlign = "right";
    ctx.fillText("074°00′ W", width - varPad(), height * 0.5);
  }

  function varPad() {
    return Math.max(28, width * 0.04);
  }

  function drawWash() {
    const cx = width * 0.5;
    const cy = height * 0.4;
    const radialEnd = Math.min(width, height) * 0.42;
    const radial = ctx.createRadialGradient(cx, cy, 16, cx, cy, radialEnd);
    radial.addColorStop(0, hexAlpha(paper, 0.9));
    radial.addColorStop(1, hexAlpha(paper, 0));
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);

    const topH = Math.max(96, height * 0.12);
    const top = ctx.createLinearGradient(0, 0, 0, topH);
    top.addColorStop(0, hexAlpha(paper, 1));
    top.addColorStop(1, hexAlpha(paper, 0));
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, width, topH);

    const bottomH = Math.max(220, height * 0.28);
    const bottom = ctx.createLinearGradient(0, height - bottomH, 0, height);
    bottom.addColorStop(0, hexAlpha(paper, 0));
    bottom.addColorStop(0.55, hexAlpha(paper, 0.8));
    bottom.addColorStop(1, hexAlpha(paper, 1));
    ctx.fillStyle = bottom;
    ctx.fillRect(0, height - bottomH, width, bottomH);
  }

  function frame(timeSeconds) {
    ctx.clearRect(0, 0, width, height);
    const phase = timeSeconds * 0.07;
    drawMeridians(phase);
    drawParallels(phase);
    drawGlobe(phase);
    drawContours(phase);
    drawFix(timeSeconds);
    drawCoordinates();
    drawWash();
  }

  function loop(now) {
    if (now - last >= 1000 / 24) {
      last = now;
      frame(now / 1000);
    }
    raf = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(raf);
    resize();
    if (reduceMotion.matches) {
      frame(0);
      return;
    }
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function hexAlpha(hex, alpha) {
    const value = hex.replace("#", "");
    const n = parseInt(value, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion.matches) frame(0);
  });
  reduceMotion.addEventListener("change", start);
  start();
})();
