"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const LINKS = [
  { href: "/creators", label: "Creators" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#fees", label: "Fees" },
];

export default function SiteHeader({ variant = "absolute" }) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    const dots = Array.from({ length: 26 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) / 90,
      vy: (Math.random() - 0.5) / 90,
    }));

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (const dot of dots) {
        dot.x = (dot.x + dot.vx + 1) % 1;
        dot.y = (dot.y + dot.vy + 1) % 1;
        for (const other of dots) {
          if (other === dot) continue;
          const dx = (dot.x - other.x) * w;
          const dy = (dot.y - other.y) * h;
          const dist = Math.hypot(dx, dy);
          if (dist < w * 0.16) {
            ctx.globalAlpha = 1 - dist / (w * 0.16);
            ctx.strokeStyle = "rgba(17,17,15,.5)";
            ctx.beginPath();
            ctx.moveTo(dot.x * w, dot.y * h);
            ctx.lineTo(other.x * w, other.y * h);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#11110f";
        ctx.beginPath();
        ctx.arc(dot.x * w, dot.y * h, 2.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  return (
    <header className={`site-header ${variant === "static" ? "header-static" : ""}`}>
      <Link href="/" className="wordmark" aria-label="Influence.Market home">
        Influence
        <span>Market</span>
      </Link>
      <button
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Menu <i />
      </button>
      <nav className={`site-nav ${open ? "open" : ""}`}>
        <canvas ref={canvasRef} className="orbit-canvas" style={{ opacity: open ? 0.14 : 0 }} />
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </a>
        ))}
        <a href="/login" onClick={() => setOpen(false)}>Log in</a>
        <a href="/signup" className="button" onClick={() => setOpen(false)}>
          Get started <span>↗</span>
        </a>
      </nav>
    </header>
  );
}
