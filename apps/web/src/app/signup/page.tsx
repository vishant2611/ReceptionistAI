import Link from "next/link";
import { SignupForm } from "../../components/auth/signup-form";
import { SiteHeader } from "../../components/site-header";

export default function SignUpPage() {
  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="container auth-shell">
        <div className="surface-card auth-panel stack-md">
          <div>
            <span className="eyebrow">New company setup</span>
            <h1 className="display-title" style={{ fontSize: "clamp(2.4rem, 4vw, 4.2rem)" }}>
              Create the business account before the AI receptionist goes live.
            </h1>
            <p className="lead">
              This sign-up step captures the company identity first, then hands the user into the detailed onboarding
              flow for services, hours, voices, and billing.
            </p>
          </div>

          <div className="inline-badges">
            <span className="inline-badge">Business name</span>
            <span className="inline-badge">Industry type</span>
            <span className="inline-badge">Address and contact</span>
            <span className="inline-badge">Email access</span>
          </div>
        </div>

        <div className="auth-card stack-md">
          <div>
            <h2 className="auth-title">Create account</h2>
            <p className="muted">We&apos;ll use these details to start the company workspace and tenant record.</p>
          </div>

          <SignupForm />

          <div className="helper-row">
            <span className="muted">Already registered?</span>
            <Link className="button-ghost" href="/signin">
              Go to sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
