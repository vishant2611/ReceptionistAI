"use client";

import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = { businessId?: string };

type KbFaq = { id: string; question: string; answer: string; isActive: boolean };
type KbObjection = { id: string; objection: string; response: string; isActive: boolean };
type KbLeadQuestion = { id: string; question: string; fieldName: string; order: number; isRequired: boolean };
type KbService = { id: string; serviceName: string; description: string; whoItsFor: string; problemItSolves: string; defaultDurationMinutes: number; isActive: boolean };

const FIELD_NAME_OPTIONS = [
  { value: "name", label: "Caller Name" },
  { value: "phone", label: "Phone Number" },
  { value: "businessName", label: "Business Name" },
  { value: "industry", label: "Industry" },
  { value: "requirement", label: "Requirement / Problem" },
];

const GOAL_OPTIONS = [
  { value: "TAKE_MESSAGES", label: "Take Messages", desc: "Capture name, number, and reason for calling" },
  { value: "TAKE_ORDERS", label: "Take Orders", desc: "Guide caller to place a specific order" },
  { value: "BOOK_APPOINTMENTS", label: "Book Appointments", desc: "Guide caller to schedule a time" },
  { value: "CAPTURE_LEADS", label: "Capture Leads", desc: "Qualify caller and collect all lead details (sales mode)" },
];

function uid() {
  return typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function PortalKnowledgeBasePage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const business = portal.business;

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const kb = business?.knowledgeBase;

  const [conversationGoal, setConversationGoal] = useState(business?.conversationGoal ?? "TAKE_MESSAGES");
  const [faqs, setFaqs] = useState<KbFaq[]>(kb?.faqs ?? []);
  const [objections, setObjections] = useState<KbObjection[]>(kb?.objections ?? []);
  const [leadCapture, setLeadCapture] = useState<KbLeadQuestion[]>(kb?.leadCaptureFlow ?? []);
  const [services, setServices] = useState<KbService[]>(kb?.services ?? []);
  const [differentiators, setDifferentiators] = useState(kb?.differentiators ?? "");

  // sync state once business loads
  const [initialized, setInitialized] = useState(false);
  if (business && !initialized) {
    setConversationGoal(business.conversationGoal ?? "TAKE_MESSAGES");
    setFaqs(business.knowledgeBase?.faqs ?? []);
    setObjections(business.knowledgeBase?.objections ?? []);
    setLeadCapture(business.knowledgeBase?.leadCaptureFlow ?? []);
    setServices(business.knowledgeBase?.services ?? []);
    setDifferentiators(business.knowledgeBase?.differentiators ?? "");
    setInitialized(true);
  }

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading knowledge base...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found.</div></section></main>;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const response = await apiRequest<{ message: string }>(`/api/businesses/${business!.id}/knowledge-base`, {
        method: "PATCH",
        body: {
          conversationGoal,
          faqs,
          objections,
          leadCaptureFlow: leadCapture,
          services,
          differentiators,
        },
      });
      await portal.refreshBusiness();
      setSuccess(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save knowledge base.");
    } finally {
      setSaving(false);
    }
  }

  // ── FAQ helpers ─────────────────────────────────────────────────────────────
  function addFaq() {
    setFaqs([...faqs, { id: uid(), question: "", answer: "", isActive: true }]);
  }
  function updateFaq(id: string, field: keyof KbFaq, value: string | boolean) {
    setFaqs(faqs.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  }
  function removeFaq(id: string) {
    setFaqs(faqs.filter((f) => f.id !== id));
  }

  // ── Objection helpers ────────────────────────────────────────────────────────
  function addObjection() {
    setObjections([...objections, { id: uid(), objection: "", response: "", isActive: true }]);
  }
  function updateObjection(id: string, field: keyof KbObjection, value: string | boolean) {
    setObjections(objections.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
  }
  function removeObjection(id: string) {
    setObjections(objections.filter((o) => o.id !== id));
  }

  // ── Lead Capture helpers ─────────────────────────────────────────────────────
  function addLeadQuestion() {
    const nextOrder = leadCapture.length > 0 ? Math.max(...leadCapture.map((q) => q.order)) + 1 : 1;
    setLeadCapture([...leadCapture, { id: uid(), question: "", fieldName: "name", order: nextOrder, isRequired: true }]);
  }
  function updateLeadQuestion(id: string, field: keyof KbLeadQuestion, value: string | number | boolean) {
    setLeadCapture(leadCapture.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  }
  function removeLeadQuestion(id: string) {
    setLeadCapture(leadCapture.filter((q) => q.id !== id));
  }

  // ── Service helpers ──────────────────────────────────────────────────────────
  function addService() {
    setServices([...services, { id: uid(), serviceName: "", description: "", whoItsFor: "", problemItSolves: "", defaultDurationMinutes: 30, isActive: true }]);
  }
  function updateService(id: string, field: keyof KbService, value: string | boolean | number) {
    setServices(services.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }
  function removeService(id: string) {
    setServices(services.filter((s) => s.id !== id));
  }

  return (
    <PortalShell
      active="knowledge-base"
      title="Knowledge Base"
      subtitle="Train your AI receptionist — define what it knows, how it handles objections, and how it captures leads."
      portal={portal}
    >
      <form onSubmit={onSave}>

        {/* ── Conversation Goal ──────────────────────────────────────────────── */}
        <section className="portal-section">
          <div className="portal-section-header">
            <h2 className="portal-section-title">Conversation Goal</h2>
            <p className="portal-section-desc">Set the primary objective for your AI on every call. This controls how the AI behaves and what it prioritises.</p>
          </div>
          <div className="goal-cards">
            {GOAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`goal-card${conversationGoal === opt.value ? " selected" : ""}`}
                onClick={() => setConversationGoal(opt.value)}
              >
                <div className="goal-card-radio" />
                <div className="goal-card-text">
                  <strong>{opt.label}</strong>
                  <span>{opt.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Services Detail ────────────────────────────────────────────────── */}
        <section className="portal-section">
          <div className="portal-section-header">
            <h2 className="portal-section-title">Services Detail</h2>
            <p className="portal-section-desc">Add structured service cards so the AI can explain what you offer clearly and specifically to callers.</p>
          </div>
          {services.map((s) => (
            <div key={s.id} className="kb-card">
              <div className="kb-card-row">
                <div className="form-group kb-field-grow">
                  <label className="form-label">Service Name</label>
                  <input className="form-input" placeholder="e.g. AI Call Handling" value={s.serviceName} onChange={(e) => updateService(s.id, "serviceName", e.target.value)} />
                </div>
                <div className="kb-card-actions">
                  <label className="form-label kb-toggle-label">
                    <input type="checkbox" checked={s.isActive} onChange={(e) => updateService(s.id, "isActive", e.target.checked)} /> Active
                  </label>
                  <button type="button" className="button-ghost kb-remove-btn" onClick={() => removeService(s.id)}>Remove</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" rows={2} placeholder="What does this service do?" value={s.description} onChange={(e) => updateService(s.id, "description", e.target.value)} />
              </div>
              <div className="kb-two-col">
                <div className="form-group">
                  <label className="form-label">Who It&apos;s For</label>
                  <input className="form-input" placeholder="e.g. Small businesses that miss calls" value={s.whoItsFor} onChange={(e) => updateService(s.id, "whoItsFor", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Problem It Solves</label>
                  <input className="form-input" placeholder="e.g. Missed calls losing leads 24/7" value={s.problemItSolves} onChange={(e) => updateService(s.id, "problemItSolves", e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Typical Appointment Duration (minutes)</label>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  max={720}
                  placeholder="30"
                  value={s.defaultDurationMinutes || ""}
                  onChange={(e) => updateService(s.id, "defaultDurationMinutes", Number(e.target.value) || 0)}
                  style={{ maxWidth: 180 }}
                />
                <small style={{ color: "var(--muted)", fontSize: "0.8rem" }}>The AI uses this to know how long to block for callers asking about this service. Leave blank or 0 to use the business default.</small>
              </div>
            </div>
          ))}
          <button type="button" className="kb-add-btn" onClick={addService}>+ Add Service</button>
        </section>

        {/* ── Company Differentiators ────────────────────────────────────────── */}
        <section className="portal-section">
          <div className="portal-section-header">
            <h2 className="portal-section-title">Why Choose Us</h2>
            <p className="portal-section-desc">Tell the AI why callers should choose your business. Used when callers ask what makes you different.</p>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="differentiators">Differentiators</label>
            <textarea
              id="differentiators"
              className="form-textarea"
              rows={5}
              placeholder="e.g. We are a full-service AI agency. We build custom applications, not off-the-shelf tools. We use our own products. Fast setup — most clients go live within days. Local Windsor, Ontario company..."
              value={differentiators}
              onChange={(e) => setDifferentiators(e.target.value)}
            />
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <section className="portal-section">
          <div className="portal-section-header">
            <h2 className="portal-section-title">FAQ — Questions &amp; Answers</h2>
            <p className="portal-section-desc">Define exact answers for common caller questions. The AI will use these verbatim instead of guessing.</p>
          </div>
          {faqs.map((f) => (
            <div key={f.id} className="kb-card">
              <div className="kb-card-row">
                <div className="form-group kb-field-grow">
                  <label className="form-label">Question</label>
                  <input className="form-input" placeholder="e.g. Do you work with restaurants?" value={f.question} onChange={(e) => updateFaq(f.id, "question", e.target.value)} />
                </div>
                <div className="kb-card-actions">
                  <label className="form-label kb-toggle-label">
                    <input type="checkbox" checked={f.isActive} onChange={(e) => updateFaq(f.id, "isActive", e.target.checked)} /> Active
                  </label>
                  <button type="button" className="button-ghost kb-remove-btn" onClick={() => removeFaq(f.id)}>Remove</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Answer</label>
                <textarea className="form-textarea" rows={2} placeholder="e.g. Yes, we work with all types of restaurants — AI call handling, WhatsApp automation, and digital marketing." value={f.answer} onChange={(e) => updateFaq(f.id, "answer", e.target.value)} />
              </div>
            </div>
          ))}
          <button type="button" className="kb-add-btn" onClick={addFaq}>+ Add FAQ</button>
        </section>

        {/* ── Objection Handling ────────────────────────────────────────────── */}
        <section className="portal-section">
          <div className="portal-section-header">
            <h2 className="portal-section-title">Objection Handling</h2>
            <p className="portal-section-desc">Tell the AI how to respond when callers hesitate, push back, or raise concerns.</p>
          </div>
          {objections.map((o) => (
            <div key={o.id} className="kb-card">
              <div className="kb-card-row">
                <div className="form-group kb-field-grow">
                  <label className="form-label">Objection</label>
                  <input className="form-input" placeholder="e.g. I already have someone doing my marketing" value={o.objection} onChange={(e) => updateObjection(o.id, "objection", e.target.value)} />
                </div>
                <div className="kb-card-actions">
                  <label className="form-label kb-toggle-label">
                    <input type="checkbox" checked={o.isActive} onChange={(e) => updateObjection(o.id, "isActive", e.target.checked)} /> Active
                  </label>
                  <button type="button" className="button-ghost kb-remove-btn" onClick={() => removeObjection(o.id)}>Remove</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">AI Response</label>
                <textarea className="form-textarea" rows={2} placeholder="e.g. That's great! We actually work alongside existing teams — we handle the AI side so your team can focus on higher value work." value={o.response} onChange={(e) => updateObjection(o.id, "response", e.target.value)} />
              </div>
            </div>
          ))}
          <button type="button" className="kb-add-btn" onClick={addObjection}>+ Add Objection</button>
        </section>

        {/* ── Lead Capture Flow ─────────────────────────────────────────────── */}
        <section className="portal-section">
          <div className="portal-section-header">
            <h2 className="portal-section-title">Lead Capture Flow</h2>
            <p className="portal-section-desc">Define the exact questions the AI asks every caller, in order. Used when Conversation Goal is set to Capture Leads.</p>
          </div>
          {leadCapture
            .sort((a, b) => a.order - b.order)
            .map((q) => (
            <div key={q.id} className="kb-card">
              <div className="kb-card-row">
                <div className="form-group" style={{ width: "60px" }}>
                  <label className="form-label">Order</label>
                  <input className="form-input" type="number" min={1} value={q.order} onChange={(e) => updateLeadQuestion(q.id, "order", Number(e.target.value))} />
                </div>
                <div className="form-group kb-field-grow">
                  <label className="form-label">Question</label>
                  <input className="form-input" placeholder="e.g. May I get your full name?" value={q.question} onChange={(e) => updateLeadQuestion(q.id, "question", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Captures</label>
                  <select className="form-select" value={q.fieldName} onChange={(e) => updateLeadQuestion(q.id, "fieldName", e.target.value)}>
                    {FIELD_NAME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="kb-card-actions">
                  <label className="form-label kb-toggle-label">
                    <input type="checkbox" checked={q.isRequired} onChange={(e) => updateLeadQuestion(q.id, "isRequired", e.target.checked)} /> Required
                  </label>
                  <button type="button" className="button-ghost kb-remove-btn" onClick={() => removeLeadQuestion(q.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="kb-add-btn" onClick={addLeadQuestion}>+ Add Question</button>
        </section>

        {/* ── Save ─────────────────────────────────────────────────────────── */}
        {error && <div className="status-banner error">{error}</div>}
        {success && <div className="status-banner success">{success}</div>}
        <div className="portal-form-actions">
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Knowledge Base"}
          </button>
        </div>

      </form>
    </PortalShell>
  );
}
