import { SiteHeader } from "../../components/site-header";

const steps = [
  {
    title: "Company profile",
    body: "Business name, industry type, address, contact number, timezone, and medical-mode detection.",
  },
  {
    title: "Services and pricing",
    body: "Products or services, consultation fees, menu pricing, and business FAQs the AI can use in calls.",
  },
  {
    title: "Hours and answering logic",
    body: "Office hours, after-hours policy, all-calls mode, or missed-ring takeover conditions.",
  },
  {
    title: "Greeting and voice",
    body: "Custom greeting, voice type, accent, and sample playback review before activation.",
  },
  {
    title: "Package and billing",
    body: "Choose free trial or paid plan, set billing cycle, card details, and auto-pay preference.",
  },
];

const industryRules = [
  "Medical businesses should auto-enable Medical Mode and show the emergency message.",
  "Restaurants and bakeries should be able to capture menu orders and quote pricing.",
  "Service businesses should capture callback requests, lead details, and consultation preferences.",
];

export default function OnboardingPage() {
  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="container stack-lg">
        <div className="hero-card">
          <span className="eyebrow">Onboarding preview</span>
          <h1 className="display-title" style={{ fontSize: "clamp(2.5rem, 4vw, 4.5rem)" }}>
            A structured setup flow before any company turns the AI switch on.
          </h1>
          <p className="lead">
            This page establishes the first pass of the onboarding experience: profile, services, hours, answering
            rules, voice setup, and billing.
          </p>
        </div>

        <section className="grid-2">
          <div className="surface-card stack-md">
            <div className="page-intro">
              <span className="eyebrow">Step map</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>
                Setup flow
              </h2>
            </div>
            <div className="steps-grid">
              {steps.map((step, index) => (
                <article key={step.title} className={`step-card${index === 0 ? " active" : ""}`}>
                  <div className="step-number">{index + 1}</div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="surface-card stack-md">
            <div className="page-intro">
              <span className="eyebrow">First step details</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>
                Business profile draft
              </h2>
            </div>

            <form className="form-grid two-col">
              <div className="field">
                <label htmlFor="onboard-business-name">Business name</label>
                <input id="onboard-business-name" placeholder="Receptionist AI Dental" type="text" />
              </div>
              <div className="field">
                <label htmlFor="onboard-industry">Industry type</label>
                <select defaultValue="" id="onboard-industry">
                  <option disabled value="">
                    Select industry
                  </option>
                  <option>Clinic</option>
                  <option>Doctor</option>
                  <option>Dental</option>
                  <option>Restaurant</option>
                  <option>Salon</option>
                  <option>Legal</option>
                  <option>Real Estate</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="onboard-phone">Contact number</label>
                <input id="onboard-phone" placeholder="+1 (555) 222-7788" type="tel" />
              </div>
              <div className="field">
                <label htmlFor="onboard-timezone">Timezone</label>
                <select defaultValue="America/Toronto" id="onboard-timezone">
                  <option>America/Toronto</option>
                  <option>America/New_York</option>
                  <option>America/Chicago</option>
                  <option>America/Los_Angeles</option>
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="onboard-address">Address</label>
                <input id="onboard-address" placeholder="456 Premium Avenue, Toronto, ON" type="text" />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="onboard-services">Business summary</label>
                <textarea
                  id="onboard-services"
                  placeholder="Describe the services, products, and what the AI should know when speaking to callers."
                />
              </div>
            </form>

            <div className="auth-note">
              <strong>Medical Mode rule:</strong> if the selected industry is doctor, clinic, dental, pharmacy,
              physiotherapy, or another medical category, the onboarding flow should auto-enable medical safety logic.
            </div>
          </div>
        </section>

        <section className="dark-card stack-md" style={{ padding: 28 }}>
          <h2 className="section-title">Industry-specific behavior we’ll support in the next slices</h2>
          <div className="check-list">
            {industryRules.map((rule) => (
              <div key={rule} className="check-item" style={{ color: "rgba(255, 250, 245, 0.82)" }}>
                <span className="check-dot" />
                <span>{rule}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
