import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import AuthForm from "@/components/auth-form";

export const metadata = { title: "Log in — Influence.Market" };

export default function LoginPage() {
  return (
    <main>
      <SiteHeader />
      <div className="page-head">
        <p className="eyebrow">Welcome back</p>
        <h1>Log in</h1>
      </div>
      <div className="page-body">
        <AuthForm mode="login" />
        <p style={{ marginTop: 28, color: "var(--muted)", fontSize: ".9rem" }}>
          New here?{" "}
          <a href="/signup" className="text-link">
            Create an account <span>→</span>
          </a>
        </p>
      </div>
      <SiteFooter />
    </main>
  );
}
