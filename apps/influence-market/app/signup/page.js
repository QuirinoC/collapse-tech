import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import AuthForm from "@/components/auth-form";

export const metadata = { title: "Sign up — Influence.Market" };

export default function SignupPage() {
  return (
    <main>
      <SiteHeader />
      <div className="page-head auth-head">
        <p className="eyebrow">Join the market</p>
        <h1>Create account</h1>
      </div>
      <div className="page-body auth-body">
        <div className="auth-layout">
          <div>
            <AuthForm mode="signup" />
            <p className="auth-switch">
              Already registered?{" "}
              <a href="/login" className="text-link">
                Log in <span>→</span>
              </a>
            </p>
          </div>
          <aside className="auth-proof-card signup-proof-card">
            <span>Built for both sides</span>
            <strong>Brands get reach. Creators get clarity.</strong>
            <p>No subscriptions for brands. No fees or exclusivity for creators.</p>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
