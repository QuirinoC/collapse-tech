"use client";

import { useState } from "react";
import CollapseSignal from "./collapse-signal";

const projects = [
  {
    index: "01",
    name: "Infinite Pixelboard",
    description: "An infinite shared mural. Everyone paints, one pixel at a time.",
    status: "Live",
    mark: "pixel",
    links: [
      { label: "Open the board", href: "https://pixelboard.collapsetechnologies.com" },
      { label: "App Store", href: "https://apps.apple.com/app/infinite-pixelboard/id6804066543" },
    ],
  },
  {
    index: "02",
    name: "Trust Circle",
    description:
      "Adult-peer location for iPhone. Hidden until someone looks. Not on the App Store yet.",
    status: "Coming soon",
    mark: "seal",
    links: [
      { label: "jointrust.app", href: "https://jointrust.app" },
      { label: "Notes", href: "/trust" },
    ],
  },
  {
    index: "03",
    name: "The Fly",
    description: "One housefly in the browser, driven by the FlyWire connectome.",
    status: "Live",
    mark: "fly",
    links: [{ label: "Open the fly", href: "https://fly.collapsetechnologies.com" }],
  },
  {
    index: "04",
    name: "Asymmetric Challenge",
    description: "A 256-bit key and a public commitment. Guesses are checked against it.",
    status: "Live",
    mark: "key",
    links: [{ label: "Open the challenge", href: "https://challenge.collapsetechnologies.com" }],
  },
  {
    index: "05",
    name: "CoachGG",
    description: "Smash Ultimate records from a start.gg tag, streamed into win rates.",
    status: "Live",
    mark: "bracket",
    links: [{ label: "Open CoachGG", href: "https://coach.collapsetechnologies.com" }],
  },
];

const bench = [
  {
    name: "Dress Like Me",
    description: "Outfit posts turned into garment notes and shopping matches. The domain is up. The product is still pre-launch.",
    status: "Pre-launch",
    href: "https://dresslikeme.collapsetechnologies.com",
  },
  {
    name: "iPhone Rover",
    description: "An indoor rover prototype: iPhone camera and vision, ESP32 motion. No public site.",
    status: "Prototype",
    href: null,
  },
  {
    name: "Collapse Health",
    description: "A concept preview only. Not operating, and not medical care.",
    status: "Not operating",
    href: "https://health.collapsetechnologies.com",
  },
];

const pixelOn = new Set([0, 3, 5, 6, 9, 10, 12, 15]);

function ProjectMark({ kind }) {
  if (kind === "pixel") {
    return (
      <span className="mark mark-pixel" aria-hidden="true">
        {Array.from({ length: 16 }, (_, cell) => (
          <i key={cell} data-on={pixelOn.has(cell) ? "" : undefined} />
        ))}
      </span>
    );
  }

  if (kind === "seal") {
    return (
      <span className="mark mark-seal" aria-hidden="true">
        <i />
      </span>
    );
  }

  if (kind === "fly") {
    return (
      <span className="mark mark-fly" aria-hidden="true">
        <i />
        <b />
        <i />
      </span>
    );
  }

  if (kind === "key") {
    return (
      <span className="mark mark-key" aria-hidden="true">
        256
      </span>
    );
  }

  return <span className="mark mark-bracket" aria-hidden="true" />;
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");

  function closeMenu() {
    setMenuOpen(false);
  }

  function sendMessage(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name");
    const email = formData.get("email");
    const note = formData.get("message");
    const subject = encodeURIComponent(`Collapse Technologies / ${name}`);
    const body = encodeURIComponent(`From: ${name} <${email}>\n\n${note}`);

    setMessage("Opening your email client.");
    window.location.href = `mailto:hello@collapsetechnologies.com?subject=${subject}&body=${body}`;
  }

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" onClick={closeMenu}>
          Collapse
          <span>Technologies</span>
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="site-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span>{menuOpen ? "Close" : "Menu"}</span>
          <i aria-hidden="true" />
        </button>
        <nav
          className={menuOpen ? "site-nav open" : "site-nav"}
          id="site-navigation"
          aria-label="Primary navigation"
        >
          <a href="#work" onClick={closeMenu}>Work</a>
          <a href="#bench" onClick={closeMenu}>Bench</a>
          <a href="#about" onClick={closeMenu}>About</a>
          <a href="#contact" onClick={closeMenu}>Contact</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy reveal">
          <p className="eyebrow">Independent technology studio</p>
          <h1>Software<br />you can open.</h1>
          <p className="lede">
            Collapse Technologies builds software, games, and experiments.
            The list below is the pitch: a real name, one line, and a link that opens.
          </p>
          <div className="hero-actions">
            <a className="button" href="#work">See the work <span>↘</span></a>
            <a className="text-link" href="#contact">Write to us <span>↘</span></a>
          </div>
        </div>
        <CollapseSignal />
      </section>

      <section className="section work-section" id="work" aria-labelledby="work-heading">
        <div className="section-heading work-heading reveal">
          <p className="eyebrow">The work</p>
          <h2 id="work-heading">Open these.</h2>
        </div>
        <div className="work-sheet">
          {projects.map((project) => (
            <article className="work-row reveal" key={project.name}>
              <div className="work-index">
                <span>{project.index}</span>
                <ProjectMark kind={project.mark} />
              </div>
              <div className="work-copy">
                <h3>{project.name}</h3>
                <p>{project.description}</p>
              </div>
              <div className="work-links">
                <span className="work-status">{project.status}</span>
                {project.links.map((link) => (
                  <a key={link.href} href={link.href}>
                    {link.label} <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section bench-section" id="bench" aria-labelledby="bench-heading">
        <div className="section-heading work-heading">
          <p className="eyebrow">On the bench</p>
          <h2 id="bench-heading">Not shipped.</h2>
        </div>
        <div className="bench-grid">
          {bench.map((item) => (
            <article key={item.name}>
              <p className="work-status">{item.status}</p>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              {item.href ? (
                <a className="text-link" href={item.href}>
                  Open the preview <span>↗</span>
                </a>
              ) : (
                <p className="bench-quiet">No public link.</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="about" id="about">
        <p className="eyebrow">About Collapse</p>
        <h2>Small team.<br />Named work.</h2>
        <div>
          <p>
            Collapse Technologies is a small, independent studio. The public
            products are the ones linked above.
          </p>
          <p>No deck. No theater. If it is not linked, it is not a public product.</p>
        </div>
      </section>

      <section className="contact" id="contact">
        <div className="contact-heading">
          <p className="eyebrow">Contact</p>
          <h2>Have an<br />idea?</h2>
          <p>Send it over. We read the interesting ones.</p>
        </div>
        <form className="contact-form" onSubmit={sendMessage}>
          <label>
            Name
            <input name="name" autoComplete="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Message
            <textarea name="message" rows="4" required />
          </label>
          <button className="button" type="submit">Send message <span>↗</span></button>
          <p className="form-status" aria-live="polite">{message}</p>
        </form>
      </section>

      <footer className="site-footer">
        <div className="wordmark">Collapse<span>Technologies</span></div>
        <p>Independent studio.</p>
        <div className="footer-links">
          <a href="#work">Work</a>
          <a href="#bench">Bench</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
        <p>© 2026 Collapse Technologies. All rights reserved.</p>
      </footer>
    </main>
  );
}
