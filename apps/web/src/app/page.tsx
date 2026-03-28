const highlights = [
  "Control when AI answers: all calls, after-hours, or after missed rings.",
  "Configure custom greetings, voice selection, and industry-specific call behavior.",
  "Track call logs, transcripts, recordings, bookings, and billing in one portal.",
];

const pillars = [
  {
    title: "Business Portal",
    body: "Responsive setup and management experience for desktop, laptop, tablet, and mobile.",
  },
  {
    title: "AI Call Control",
    body: "Answering rules, call summaries, recordings, and future calendar-based booking flows.",
  },
  {
    title: "Admin Command Center",
    body: "Global visibility across businesses, plans, invoices, uptime, and support actions.",
  },
];

export default function HomePage() {
  return (
    <main
      style={{
        padding: "48px 24px 72px",
      }}
    >
      <section
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "grid",
          gap: 24,
        }}
      >
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 28,
            boxShadow: "var(--shadow)",
            padding: "32px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              padding: "8px 14px",
              borderRadius: 999,
              background: "var(--brand-soft)",
              color: "var(--brand)",
              fontSize: 14,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
            }}
          >
            Foundation Build
          </div>
          <h1
            style={{
              margin: "18px 0 16px",
              fontSize: "clamp(2.5rem, 4vw, 4.8rem)",
              lineHeight: 0.95,
              maxWidth: 780,
            }}
          >
            Receptionist AI starts here.
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 20,
              lineHeight: 1.7,
              maxWidth: 760,
              color: "var(--muted)",
            }}
          >
            We have the first application shell in place so the business portal,
            admin tools, and AI call infrastructure can grow on top of a clean
            architecture.
          </p>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
          }}
        >
          {pillars.map((pillar) => (
            <article
              key={pillar.title}
              style={{
                background: "var(--panel-strong)",
                border: "1px solid var(--line)",
                borderRadius: 24,
                padding: 24,
                boxShadow: "var(--shadow)",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 28 }}>
                {pillar.title}
              </h2>
              <p
                style={{
                  margin: 0,
                  color: "var(--muted)",
                  lineHeight: 1.7,
                }}
              >
                {pillar.body}
              </p>
            </article>
          ))}
        </section>

        <section
          style={{
            background: "#142430",
            color: "#fdf9f3",
            borderRadius: 28,
            padding: 32,
            display: "grid",
            gap: 18,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 30 }}>Initial build priorities</h2>
          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            {highlights.map((item) => (
              <div
                key={item}
                style={{
                  padding: "18px 20px",
                  borderRadius: 18,
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  lineHeight: 1.6,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
