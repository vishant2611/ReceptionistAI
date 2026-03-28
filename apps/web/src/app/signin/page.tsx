import Link from "next/link";
import { SiteHeader } from "../../components/site-header";

const signInNotes = [
  "Access business dashboards, call logs, transcripts, and billing in one place.",
  "Support role-based access for owners, managers, staff, and billing admins.",
  "Keep account access ready for future multi-location and admin controls.",
];

export default function SignInPage() {
  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="container auth-shell">
        <div className="dark-card auth-panel stack-md">
          <div>
            <span className="eyebrow">Business access</span>
            <h1 className="display-title" style={{ fontSize: "clamp(2.4rem, 4vw, 4.2rem)" }}>
              Sign in to manage calls, orders, and AI settings.
            </h1>
            <p className="lead" style={{ color: "rgba(255, 250, 245, 0.76)", maxWidth: 620 }}>
              This screen is the gateway for business users to return to their own secure portal.
            </p>
          </div>

          <div className="check-list">
            {signInNotes.map((note) => (
              <div key={note} className="check-item" style={{ color: "rgba(255, 250, 245, 0.82)" }}>
                <span className="check-dot" />
                <span>{note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-card stack-md">
          <div>
            <h2 className="auth-title">Welcome back</h2>
            <p className="muted">Use your username or email and password to open your company portal.</p>
          </div>

          <form className="form-grid">
            <div className="field">
              <label htmlFor="signin-identity">Username or email</label>
              <input id="signin-identity" name="identity" placeholder="company@example.com" type="text" />
            </div>
            <div className="field">
              <label htmlFor="signin-password">Password</label>
              <input id="signin-password" name="password" placeholder="Enter your password" type="password" />
            </div>
            <div className="helper-row">
              <span className="inline-badge">Tenant-safe portal access</span>
              <Link className="muted" href="/signup">
                Need an account?
              </Link>
            </div>
            <button className="button" type="button">
              Sign in
            </button>
          </form>

          <div className="subtle-divider" />

          <div className="auth-note">
            <strong>Next implementation step:</strong> wire this form to the business auth flow and role-based session
            handling.
          </div>
        </div>
      </section>
    </main>
  );
}
