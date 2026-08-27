"use client";

import Link from "next/link";
import { useState } from "react";

const LINKS = [
  { href: "/creators", label: "Creators" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#fees", label: "Fees" },
];

export default function SiteHeader({ variant = "absolute" }) {
  const [open, setOpen] = useState(false);

  return (
    <header className={`site-header ${variant === "static" ? "header-static" : ""}`}>
      <Link href="/" className="wordmark" aria-label="Influence.Market home">
        <span className="wordmark-icon" aria-hidden="true">✦</span>
        <span>influence<em>.market</em></span>
      </Link>
      <button
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="site-navigation"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? "Close" : "Menu"}</span>
        <i />
      </button>
      <nav id="site-navigation" className={`site-nav ${open ? "open" : ""}`}>
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </a>
        ))}
        <a href="/login" className="nav-login" onClick={() => setOpen(false)}>Log in</a>
        <a href="/signup" className="button button-small" onClick={() => setOpen(false)}>
          Start a campaign <span>↗</span>
        </a>
      </nav>
    </header>
  );
}
