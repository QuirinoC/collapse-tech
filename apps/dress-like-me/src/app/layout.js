import { Analytics } from "@vercel/analytics/next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      "https://dresslikeme.collapsetechnologies.com",
  ),
  title: {
    default: "Dress Like Me",
    template: "%s — Dress Like Me",
  },
  description:
    "Find the pieces behind the people whose style you actually want to wear.",
  openGraph: {
    title: "Dress Like Me",
    description:
      "Search a person or paste a public post. We break down the outfit and find similar pieces.",
    siteName: "Dress Like Me",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${plexMono.variable}`}>
        <header className="site-header">
          <Link className="wordmark" href="/" aria-label="Dress Like Me home">
            DRESS
            <span>LIKE ME</span>
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/explore">Explore</Link>
            <Link href="/about">How it works</Link>
          </nav>
          <span className="header-tag">AI outfit finder / 001</span>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <p>Style is reference, not a rulebook.</p>
          <div>
            <Link href="/about">Method</Link>
            <a href="mailto:hello@collapsetechnologies.com">Takedowns</a>
            <a href="https://collapsetechnologies.com">Collapse Technologies</a>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
