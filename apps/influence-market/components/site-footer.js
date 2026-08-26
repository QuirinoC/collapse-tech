import Link from "next/link";

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="footer-lead">
        <Link href="/" className="wordmark" aria-label="Influence.Market home">
          <span className="wordmark-icon" aria-hidden="true">✦</span>
          <span>influence<em>.market</em></span>
        </Link>
        <p>Put your brand in the feeds that shape what people want next.</p>
      </div>
      <div className="footer-cta">
        <p>Ready to own the scroll?</p>
        <Link href="/signup" className="button button-light">
          Start a campaign <span>↗</span>
        </Link>
      </div>
      <div className="footer-bottom">
        <p>© {year} Influence.Market. A Collapse Technologies venture.</p>
        <div className="footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="https://collapsetechnologies.com">Collapse Technologies ↗</a>
        </div>
      </div>
    </footer>
  );
}
