import Link from "next/link";
import { SiteHeader } from "../../components/site-header";

const categories = ["Restaurant", "Salon", "Clinic", "Dental", "Legal", "Real Estate", "Repair", "Other"];

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
            <p className="muted">We’ll use these details to start the company workspace and tenant record.</p>
          </div>

          <form className="form-grid">
            <div className="field">
              <label htmlFor="business-name">Business name</label>
              <input id="business-name" name="businessName" placeholder="Receptionist AI Clinic" type="text" />
            </div>

            <div className="field">
              <label htmlFor="industry-type">Industry type</label>
              <select defaultValue="" id="industry-type" name="industryType">
                <option disabled value="">
                  Select one
                </option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="business-address">Address</label>
              <input id="business-address" name="address" placeholder="123 Main Street, Toronto" type="text" />
            </div>

            <div className="field">
              <label htmlFor="contact-number">Contact number</label>
              <input id="contact-number" name="phone" placeholder="+1 (555) 123-4567" type="tel" />
            </div>

            <div className="field">
              <label htmlFor="business-email">Email address</label>
              <input id="business-email" name="email" placeholder="owner@company.com" type="email" />
            </div>

            <div className="field">
              <label htmlFor="signup-password">Password</label>
              <input id="signup-password" name="password" placeholder="Create a strong password" type="password" />
            </div>

            <button className="button" type="button">
              Create company account
            </button>
          </form>

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
