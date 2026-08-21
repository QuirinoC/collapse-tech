"use client";

import { useState } from "react";
import CollapseSignal from "./collapse-signal";

const projects = [
  {
    name: "Asymmetric Challenge",
    description: "A 256-bit key, a public commitment, and no easy way out.",
    category: "Experiment",
    status: "Live",
    href: "https://challenge.collapsetechnologies.com",
    mark: "01",
  },
  {
    name: "Infinite Pixelboard",
    description: "An endless shared canvas. One pixel at a time.",
    category: "Platform",
    status: "Live beta",
    href: "https://pixelboard.collapsetechnologies.com",
    mark: "02",
  },
  {
    name: "CoachGG",
    description: "Smash Ultimate data rebuilt into player scouting and matchup signal.",
    category: "Software",
    status: "In deployment",
    href: null,
    mark: "03",
  },
];

const disciplines = [
  ["Software", "Tools, systems, and products that earn their place."],
  ["Games", "Systems with a pulse, built to be played more than once."],
  ["Experiments", "Loose threads pulled until they become something real."],
];

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
        <nav className={menuOpen ? "site-nav open" : "site-nav"} id="site-navigation">
          <a href="#work" onClick={closeMenu}>Work</a>
          <a href="#about" onClick={closeMenu}>About</a>
          <a href="#contact" onClick={closeMenu}>Contact</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy reveal">
          <p className="eyebrow">Independent technology studio / Est. 2026</p>
          <h1>We build<br />what&apos;s next.</h1>
          <p className="lede">
            Software, games, and platforms for whatever comes after the obvious.
          </p>
          <div className="hero-actions">
            <a className="button" href="#work">Explore the work <span>↘</span></a>
            <a className="text-link" href="#about">About Collapse <span>↘</span></a>
          </div>
        </div>
        <CollapseSignal />
      </section>

      <section className="section" id="work">
        <div className="section-heading reveal">
          <p className="eyebrow">What we make</p>
          <h2>Things with<br />their own gravity.</h2>
        </div>
        <div className="discipline-grid">
          {disciplines.map(([title, description], index) => (
            <article className="discipline-card reveal" key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <i aria-hidden="true">↗</i>
            </article>
          ))}
        </div>
      </section>

      <section className="manifesto">
        <p className="eyebrow">Operating principle</p>
        <p>Think big.<br />Build fast.<br /><em>Ship.</em></p>
      </section>

      <section className="section projects" aria-labelledby="projects-heading">
        <div className="section-heading reveal">
          <p className="eyebrow">Selected work</p>
          <h2 id="projects-heading">In motion.</h2>
        </div>
        <div className="project-list">
          {projects.map((project) => {
            const ProjectCard = project.href ? "a" : "article";
            return (
              <ProjectCard
                className="project-card reveal"
                href={project.href || undefined}
                data-unlinked={!project.href || undefined}
                key={project.name}
              >
                <div className="project-visual">
                  <span>{project.mark}</span>
                  <div className={`project-shape shape-${project.mark}`} />
                </div>
                <div className="project-info">
                  <div>
                    <h3>{project.name}</h3>
                    <p>{project.description}</p>
                  </div>
                  <div className="project-meta">
                    <span>{project.category}</span>
                    <span>{project.status}</span>
                    {project.href && <i aria-hidden="true">↗</i>}
                  </div>
                </div>
              </ProjectCard>
            );
          })}
        </div>
      </section>

      <section className="about" id="about">
        <p className="eyebrow">About Collapse</p>
        <h2>Small team.<br />Big ambition.</h2>
        <div>
          <p>
            Collapse Technologies is a small, independent outfit making software,
            games, and long-term platforms.
          </p>
          <p>
            No deck. No theater. Just ideas worth giving a real shot.
          </p>
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
        <p>Building what comes next.</p>
        <div className="footer-links">
          <a href="#work">Work</a>
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
