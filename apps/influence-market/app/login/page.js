import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import AuthForm from "@/components/auth-form";

export const metadata = { title: "Log in — Influence.Market" };

export default function LoginPage() {
  return (
    <main>
      <SiteHeader />
      <div className="page-head auth-head">
        <p className="eyebrow">Welcome back</p>
        <h1>Log in</h1>
      </div>
      <div className="page-body auth-body">
        <div className="auth-layout">
          <div>
            <AuthForm mode="login" />
            <p className="auth-switch">
              New here?{" "}
              <a href="/signup" className="text-link">
                Create an account <span>→</span>
              </a>
            </p>
          </div>
          <aside className="auth-proof-card">
            <span>One calm workspace</span>
            <strong>Briefs, creators, approvals and payouts.</strong>
            <p>Pick up exactly where your last campaign left off.</p>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
