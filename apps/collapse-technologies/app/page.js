"use client";

import { useState } from "react";
import CollapseSignal from "./collapse-signal";

const projects = [
  {
    id: "pixelboard",
    mark: "01",
    name: "Infinite Pixelboard",
    status: "Web and App Store",
    description:
      "A shared mural. Everyone paints the same canvas, and anyone can paint over a pixel. The board is on the web and on iPhone.",
    links: [
      {
        label: "Open the board",
        href: "https://pixelboard.collapsetechnologies.com",
      },
      {
        label: "App Store",
        href: "https://apps.apple.com/app/infinite-pixelboard/id6804066543",
      },
    ],
    plate: "pixels",
  },
  {
    id: "trust",
    mark: "02",
    name: "Trust",
    status: "iPhone, not listed yet",
    description:
      "A circle of people you choose. Location stays sealed until someone looks, and the person being looked at gets a quiet receipt. The public site is up. The App Store listing is not.",
    links: [
      { label: "jointrust.app", href: "https://jointrust.app" },
      { label: "Studio page", href: "/trust" },
    ],
    plate: "trust",
  },
  {
    id: "coach",
    mark: "03",
    name: "CoachGG",
    status: "Live",
    description:
      "Super Smash Bros. Ultimate scouting. Enter a start.gg tag and watch stage and character win rates stream in as the set history loads.",
    links: [
      { label: "Open CoachGG", href: "https://coach.collapsetechnologies.com" },
    ],
    plate: "coach",
  },
  {
    id: "fly",
    mark: "04",
    name: "The Fly",
    status: "Live",
    description:
      "One cartoon housefly in the browser. Movement is driven by a published fruit-fly brain map, FlyWire FAFB v783, not a wander script. It is not a conscious fly.",
    links: [{ label: "Watch the fly", href: "https://fly.collapsetechnologies.com" }],
    plate: "fly",
  },
  {
    id: "challenge",
    mark: "05",
    name: "Asymmetric Challenge",
    status: "Live",
    description:
      "A public SHA-256 commitment to a 256-bit key. Guesses are checked against it. The server keeps attempt totals, not a trail of guesses. The challenge page calls the prize a demo, not a real offering.",
    links: [
      {
        label: "Open the challenge",
        href: "https://challenge.collapsetechnologies.com",
      },
    ],
    plate: "key",
  },
];

const pixelMap = [
  "            ",
  "  kk     r  ",
  " k  k   rr  ",
  " k  k  r  r ",
  " kkk    rr  ",
  " k  k   r   ",
  " k  k       ",
  "        bb  ",
];

function PixelPlate() {
  const color = { k: "#11110f", r: "#9a3b24", b: "#243f45" };
  return (
    <div className="plate plate-pixels" aria-hidden="true">
      <div className="pixel-grid">
        {pixelMap.flatMap((row, y) =>
          [...row].map((cell, x) => (
            <i
              key={`${x}-${y}`}
              style={cell.trim() ? { background: color[cell] } : undefined}
            />
          )),
        )}
      </div>
      <p>Same board for everyone.</p>
    </div>
  );
}

function TrustPlate() {
  return (
    <div className="plate plate-trust" aria-hidden="true">
      <p className="plate-kicker">Until they look</p>
      <p className="plate-word">Sealed</p>
      <span className="trust-rule" />
      <p>A look sends a receipt.</p>
    </div>
  );
}

function CoachPlate() {
  return (
    <div className="plate plate-coach" aria-hidden="true">
      <p className="plate-kicker">start.gg</p>
      <ul>
        <li>
          <span>Stages</span>
          <b />
        </li>
        <li>
          <span>Characters</span>
          <b />
        </li>
        <li>
          <span>Counterpick</span>
          <b />
        </li>
      </ul>
      <p>Paste a tag. The live site fills these in.</p>
    </div>
  );
}

function FlyPlate() {
  return (
    <div className="plate plate-fly" aria-hidden="true">
      <svg viewBox="0 0 280 150" role="presentation">
        <path
          d="M18 118 C 70 108, 96 46, 150 58 S 230 96, 262 42"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <circle cx="168" cy="70" r="4.5" fill="currentColor" />
        <ellipse
          cx="168"
          cy="70"
          rx="22"
          ry="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          transform="rotate(-18 168 70)"
        />
      </svg>
      <p className="plate-kicker">FlyWire FAFB v783</p>
      <p>Connectome in. Wander script out.</p>
    </div>
  );
}

function KeyPlate() {
  return (
    <div className="plate plate-key" aria-hidden="true">
      <p className="plate-kicker">Public commitment</p>
      <p className="key-line">256-bit key</p>
      <p className="key-line key-dim">SHA-256</p>
      <p>Attempt totals only.</p>
    </div>
  );
}

const plates = {
  pixels: PixelPlate,
  trust: TrustPlate,
  coach: CoachPlate,
  fly: FlyPlate,
  key: KeyPlate,
};

function ProjectLink({ href, className, children }) {
  const external = href.startsWith("http");
  return (
    <a
      className={className}
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
      <span aria-hidden="true">{external ? "↗" : "→"}</span>
    </a>
  );
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
          <a href="#work" onClick={closeMenu}>
            Work
          </a>
          <a href="#about" onClick={closeMenu}>
            About
          </a>
          <a href="#contact" onClick={closeMenu}>
            Contact
          </a>
        </nav>
      </header>

      <div className="frame">
        <nav className="index-rail" aria-label="Projects">
          <p>Index</p>
          <ol>
            {projects.map((project) => (
              <li key={project.id}>
                <a href={`#${project.id}`}>
                  <span>{project.mark}</span>
                  {project.name}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <section className="hero" id="top">
          <p className="eyebrow">Independent studio / Est. 2026</p>
          <h1>The public work.</h1>
          <p className="lede">
            Collapse Technologies ships its own software and leaves it running.
            If a project is on this page, there is a real URL. No client roster
            and no imaginary launches.
          </p>
        </section>

        <section className="work" id="work" aria-labelledby="work-heading">
          <div className="work-heading">
            <p className="eyebrow">Five projects</p>
            <h2 id="work-heading">Open one.</h2>
          </div>
          <div className="folio-list">
            {projects.map((project) => {
              const Plate = plates[project.plate];
              return (
                <article className="folio" id={project.id} key={project.id}>
                  <div className="folio-copy">
                    <p className="folio-mark">
                      <span>{project.mark}</span>
                      {project.status}
                    </p>
                    <h3>{project.name}</h3>
                    <p>{project.description}</p>
                    <div className="link-row">
                      {project.links.map((link, index) => (
                        <ProjectLink
                          className={index === 0 ? "button" : "button button-ghost"}
                          href={link.href}
                          key={link.href}
                        >
                          {link.label}
                        </ProjectLink>
                      ))}
                    </div>
                  </div>
                  <Plate />
                </article>
              );
            })}
          </div>
        </section>

        <section className="about" id="about">
          <div className="about-copy">
            <p className="eyebrow">About</p>
            <h2>A small studio with the lights on.</h2>
            <p>
              We build software, games, and the occasional experiment that is
              strange enough to keep. The list above is the public one.
            </p>
            <p>
              Prototypes that are not on the internet stay off this page.
            </p>
          </div>
          <CollapseSignal />
        </section>

        <section className="contact" id="contact">
          <div className="contact-heading">
            <p className="eyebrow">Contact</p>
            <h2>Write to the studio.</h2>
            <p>
              The form opens your email client. We do not keep a copy.
              Direct mail goes to <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a>.
            </p>
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
            <button className="button" type="submit">
              Send message <span aria-hidden="true">↗</span>
            </button>
            <p className="form-status" aria-live="polite">
              {message}
            </p>
          </form>
        </section>
      </div>

      <footer className="site-footer">
        <div className="wordmark">
          Collapse<span>Technologies</span>
        </div>
        <p>Independent studio. The work above is the work.</p>
        <div className="footer-links">
          {projects.map((project) => (
            <a href={`#${project.id}`} key={project.id}>
              {project.name}
            </a>
          ))}
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
        <p>© 2026 Collapse Technologies.</p>
      </footer>
    </main>
  );
}
