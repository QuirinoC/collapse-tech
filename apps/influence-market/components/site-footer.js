export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <p>
        © {year} Influence.Market. A collapse technologies venture.
        <br />
        One contract. Many creators. Funds held until work ships.
      </p>
      <div className="footer-links">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="https://collapsetechnologies.com">Collapse Technologies ↗</a>
      </div>
    </footer>
  );
}
