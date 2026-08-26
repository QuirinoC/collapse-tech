import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import AuthForm from "@/components/auth-form";

export const metadata = { title: "Sign up — Influence.Market" };

export default function SignupPage() {
  return (
    <main>
      <SiteHeader />
      <div className="page-head">
        <p className="eyebrow">Join the market</p>
        <h1>Create account</h1>
      </div>
      <div className="page-body">
        <AuthForm mode="signup" />
        <p style={{ marginTop: 28, color: "var(--muted)", fontSize: ".9rem" }}>
          Already registered?{" "}
          <a href="/login" className="text-link">
            Log in <span>→</span>
          </a>
        </p>
      </div>
      <SiteFooter />
    </main>
  );
}
