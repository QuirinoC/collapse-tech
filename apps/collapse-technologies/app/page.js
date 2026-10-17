"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const projects = [
  {
    id: "pixelboard",
    number: "I",
    category: "A shared canvas",
    name: "Infinite Pixelboard",
    status: "Web & iPhone",
    kind: "mosaic",
    description:
      "One canvas, made by everyone. Place a pixel, leave a mark, and see what the next person makes of it.",
    links: [
      {
        label: "Enter the canvas",
        href: "https://pixelboard.collapsetechnologies.com",
      },
      {
        label: "App Store",
        href: "https://apps.apple.com/app/infinite-pixelboard/id6804066543",
      },
    ],
  },
  {
    id: "trust",
    number: "II",
    category: "Considered connections",
    name: "Trust",
    status: "In development · iPhone",
    kind: "seal",
    description:
      "Location sharing, on your terms. Choose your people and decide when to share. Public TestFlight access is not open yet.",
    links: [{ label: "Discover Trust", href: "https://jointrust.app" }],
  },
  {
    id: "coach",
    number: "III",
    category: "A clearer view of the game",
    name: "CoachGG",
    status: "Web",
    kind: "columns",
    description:
      "Turn a competitive history into a better next move. Super Smash Bros. Ultimate scouting, with stage and character results from start.gg.",
    links: [
      {
        label: "Explore CoachGG",
        href: "https://coach.collapsetechnologies.com",
      },
    ],
  },
  {
    id: "fly",
    number: "IV",
    category: "A small experiment in life",
    name: "The Fly",
    status: "Browser experiment",
    kind: "flight",
    description:
      "A housefly in your browser, with movement driven by the FlyWire fruit-fly brain map. A small experiment at the meeting of biology and software.",
    links: [
      { label: "Meet the fly", href: "https://fly.collapsetechnologies.com" },
    ],
  },
  {
    id: "challenge",
    number: "V",
    category: "An exercise in possibility",
    name: "Asymmetric Challenge",
    status: "Web experiment",
    kind: "cipher",
    description:
      "One 256-bit key. A public SHA-256 commitment. An open invitation to try the improbable, in an interactive demonstration with no prize offering.",
    links: [
      {
        label: "Try the challenge",
        href: "https://challenge.collapsetechnologies.com",
      },
    ],
  },
];

function Arrow({ diagonal = false }) {
  return (
    <span className="arrow" aria-hidden="true">
      {diagonal ? "↗" : "↘"}
    </span>
  );
}

function ProjectRelief({ kind }) {
  return (
    <div className={`project-relief relief-${kind}`} aria-hidden="true">
      {kind === "mosaic" && (
        <div className="mosaic">
          {Array.from({ length: 49 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      )}
      {kind === "seal" && (
        <div className="seal">
          <i />
          <i />
          <span>T</span>
        </div>
      )}
      {kind === "columns" && (
        <div className="column-study">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      {kind === "flight" && (
        <svg viewBox="0 0 260 150">
          <path d="M8 125C70 145 51 24 128 42s-31 104 34 82 55-81 87-96" />
          <g transform="translate(132 43) rotate(18)">
            <ellipse rx="4" ry="9" />
            <ellipse cx="-9" cy="-2" rx="10" ry="5" />
            <ellipse cx="9" cy="-2" rx="10" ry="5" />
          </g>
        </svg>
      )}
      {kind === "cipher" && (
        <div className="cipher">
          <span>
            2<sup>256</sup>
          </span>
          <i />
          <small>THE POSSIBLE / THE IMPROBABLE</small>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const elements = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header" id="top">
        <a
          className="wordmark collapse-wordmark"
          href="#top"
          aria-label="Collapse Technologies home"
          onClick={closeMenu}
        >
          <span>Collapse</span>
          <span>Technologies</span>
        </a>
        <p className="header-note">
          Independent in thought.
          <br />
          Deliberate in craft.
        </p>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="site-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? "Close" : "Menu"}
          <span aria-hidden="true">{menuOpen ? "−" : "+"}</span>
        </button>
        <nav
          className={`site-nav${menuOpen ? " is-open" : ""}`}
          id="site-navigation"
          aria-label="Primary navigation"
        >
          <a href="#work" onClick={closeMenu}>
            The work <span>01</span>
          </a>
          <a href="#studio" onClick={closeMenu}>
            The studio <span>02</span>
          </a>
          <a href="#contact" onClick={closeMenu}>
            Get in touch <Arrow diagonal />
          </a>
        </nav>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow hero-eyebrow">
              <span />
              An independent technology studio
            </p>
            <h1 id="hero-title">
              Ideas take
              <br />
              <span>lasting form.</span>
            </h1>
            <p className="hero-intro">
              We turn curiosity into software, games, and experiments you can
              put your hands on.
            </p>
            <a className="text-link hero-link" href="#work">
              Explore the work <Arrow />
            </a>
          </div>
          <figure className="hero-architecture">
            <div className="architecture-orbit" />
            <Image
              src="/images/portico.svg"
              alt=""
              width={700}
              height={850}
              loading="eager"
              fetchPriority="high"
              className="portico"
            />
            <figcaption>
              <span>Form follows curiosity.</span>
              <span>Study no. 001</span>
            </figcaption>
          </figure>
          <div className="hero-foot">
            <span>Software · Games · Experiments</span>
            <span>Built to be used. Made to endure.</span>
            <a href="#work" aria-label="Scroll to the work">
              ↓
            </a>
          </div>
        </section>

        <section
          className="work section-shell"
          id="work"
          aria-labelledby="work-title"
        >
          <div className="section-heading" data-reveal>
            <p className="eyebrow">
              <span className="section-index">01 /</span> The work
            </p>
            <h2 id="work-title">
              A few things
              <br />
              we&apos;ve put into the world.
            </h2>
            <p className="section-aside">
              Different questions.
              <br />
              The same care in the making.
            </p>
          </div>
          <div className="project-register">
            {projects.map((project) => (
              <article
                className="project"
                id={project.id}
                key={project.id}
                data-reveal
              >
                <span className="project-number" aria-hidden="true">
                  {project.number}
                </span>
                <div className="project-copy">
                  <p className="eyebrow project-category">{project.category}</p>
                  <h3>{project.name}</h3>
                  <p className="project-description">{project.description}</p>
                  <div className="project-links">
                    {project.links.map((link) => (
                      <a
                        className="text-link"
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        key={link.href}
                      >
                        {link.label}
                        <Arrow diagonal />
                      </a>
                    ))}
                  </div>
                </div>
                <div className="project-object">
                  <span className="project-status">{project.status}</span>
                  <ProjectRelief kind={project.kind} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="studio" id="studio" aria-labelledby="studio-title">
          <div className="studio-inscription" aria-hidden="true">
            <span>Curiosity.</span>
            <span>Craft.</span>
            <span>Continuity.</span>
          </div>
          <div className="studio-inner section-shell" data-reveal>
            <p className="eyebrow">
              <span className="section-index">02 /</span> The studio
            </p>
            <div className="studio-copy">
              <h2 id="studio-title">
                Small by design.
                <br />
                Open in possibility.
              </h2>
              <p>
                Collapse Technologies is an independent studio building its own
                software. Some projects are useful. Some are playful. All begin
                with a question worth following.
              </p>
              <p>
                We care about the way things are made: the details you notice,
                the decisions you don&apos;t, and what happens long after the
                first launch.
              </p>
              <a
                className="text-link"
                href="https://github.com/QuirinoC/collapse-tech"
                target="_blank"
                rel="noreferrer"
              >
                Look inside the workshop <Arrow diagonal />
              </a>
            </div>
          </div>
          <div className="studio-frieze" aria-hidden="true">
            THOUGHT &nbsp; · &nbsp; FORM &nbsp; · &nbsp; FUNCTION
          </div>
        </section>

        <section
          className="contact section-shell"
          id="contact"
          aria-labelledby="contact-title"
          data-reveal
        >
          <p className="eyebrow">
            <span className="section-index">03 /</span> Correspondence
          </p>
          <div className="contact-body">
            <h2 id="contact-title">
              Good things begin
              <br />
              with a conversation.
            </h2>
            <a
              className="contact-link"
              href="mailto:hello@collapsetechnologies.com"
            >
              Write to the studio <Arrow diagonal />
            </a>
            <p>
              Ideas, questions, or simply a hello.
              <br />
              <a href="mailto:hello@collapsetechnologies.com">
                hello@collapsetechnologies.com
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="footer-wordmark" href="#top">
          Collapse<span>Technologies</span>
        </a>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Collapse Technologies</p>
          <span>Independent thought. Lasting form.</span>
          <nav aria-label="Legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="#top">Back to top ↑</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
