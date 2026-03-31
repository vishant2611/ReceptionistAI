"use client";

import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

export function PortalSettingsPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const business = portal.business;

  const answeringRules =
    business?.answeringRules && typeof business.answeringRules === "object" && !Array.isArray(business.answeringRules)
      ? (business.answeringRules as Record<string, unknown>)
      : {};

  const settingsDefaults = {
    aiEnabled: business?.aiEnabled ?? false,
    answerMode: String(answeringRules.primaryMode ?? "ALL_CALLS"),
    ringCount: Number(answeringRules.ringCount ?? 3),
    greetingMessage:
      business?.greetingMessage ||
      `Thank you for calling ${business?.name || "your business"}. How can I help you today?`,
    voicePreference: business?.voicePreference || "American Female - Professional",
    afterHoursEnabled: Boolean(answeringRules.afterHoursEnabled ?? true),
    afterHoursMessage:
      String(answeringRules.afterHoursMessage ?? "") ||
      "We are currently outside operating hours, but your request has been recorded and our team will follow up soon.",
    emergencyMessage:
      String(answeringRules.emergencyMessage ?? "") ||
      (business?.medicalModeEnabled ? "If this is a medical emergency, please call 911." : ""),
    recordCalls: Boolean(answeringRules.recordCalls ?? true),
    sendSummaryEmail: Boolean(answeringRules.sendSummaryEmail ?? true),
  };

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading AI settings...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      aiEnabled: formData.get("aiEnabled") === "on",
      answerMode: String(formData.get("answerMode") ?? "ALL_CALLS"),
      ringCount: Number(formData.get("ringCount") ?? 3),
      greetingMessage: String(formData.get("greetingMessage") ?? ""),
      voicePreference: String(formData.get("voicePreference") ?? ""),
      afterHoursEnabled: formData.get("afterHoursEnabled") === "on",
      afterHoursMessage: String(formData.get("afterHoursMessage") ?? ""),
      emergencyMessage: String(formData.get("emergencyMessage") ?? ""),
      recordCalls: formData.get("recordCalls") === "on",
      sendSummaryEmail: formData.get("sendSummaryEmail") === "on",
    };

    try {
      if (!business) {
        throw new Error("No business session found.");
      }

      const activeBusinessId = business.id;
      const response = await apiRequest<{ message: string }>(`/api/businesses/${activeBusinessId}/ai-settings`, {
        method: "PATCH",
        body: payload,
      });
      await portal.refreshBusiness();
      setSuccess(response.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save AI settings.");
    } finally {
      setSaving(false);
    }
  }

  if (!portal.canEditConfiguration) {
    return (
      <PortalShell
        active="settings"
        portal={portal}
        subtitle="This area is restricted to owners and managers."
        title="AI Settings"
      >
        <div className="status-banner neutral">Your role does not have permission to edit AI settings.</div>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      active="settings"
      portal={portal}
      subtitle="Define when AI answers, how it greets callers, which voice it uses, and what happens after hours."
      title="AI Settings"
    >
      <section className="grid-2">
        <form className="surface-card stack-md" onSubmit={onSubmit}>
          <div className="page-intro">
            <span className="eyebrow">Controls</span>
            <h2 className="section-title" style={{ marginTop: 14 }}>Live AI configuration</h2>
          </div>

          <div className="field-toggle">
            <div>
              <strong>Enable AI receptionist</strong>
              <p>When this is on, the AI can handle calls using the business rules below.</p>
            </div>
            <label className="switch">
              <input defaultChecked={settingsDefaults.aiEnabled} name="aiEnabled" type="checkbox" />
              <span className="switch-slider" />
            </label>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="answer-mode">When should AI answer?</label>
              <select defaultValue={settingsDefaults.answerMode} id="answer-mode" name="answerMode">
                <option value="ALL_CALLS">Answer all calls</option>
                <option value="BUSINESS_HOURS">Only during business hours</option>
                <option value="AFTER_MISSED_RINGS">Only after staff misses the call</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="ring-count">Ring count before takeover</label>
              <select defaultValue={String(settingsDefaults.ringCount)} id="ring-count" name="ringCount">
                <option value="2">2 rings</option>
                <option value="3">3 rings</option>
                <option value="4">4 rings</option>
                <option value="5">5 rings</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="voice-preference">Voice preference</label>
              <select defaultValue={settingsDefaults.voicePreference} id="voice-preference" name="voicePreference">
                <option>American Female - Professional</option>
                <option>American Female - Warm</option>
                <option>British Female - Polite</option>
                <option>American Male - Professional</option>
                <option>British Male - Formal</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="greeting-message">Custom greeting</label>
              <textarea defaultValue={settingsDefaults.greetingMessage} id="greeting-message" name="greetingMessage" />
            </div>

            <div className="field-toggle">
              <div>
                <strong>After-hours handling</strong>
                <p>Let the AI collect requests outside office hours and explain follow-up expectations.</p>
              </div>
              <label className="switch">
                <input defaultChecked={settingsDefaults.afterHoursEnabled} name="afterHoursEnabled" type="checkbox" />
                <span className="switch-slider" />
              </label>
            </div>

            <div className="field">
              <label htmlFor="after-hours-message">After-hours message</label>
              <textarea defaultValue={settingsDefaults.afterHoursMessage} id="after-hours-message" name="afterHoursMessage" />
            </div>

            {business.medicalModeEnabled ? (
              <div className="field">
                <label htmlFor="emergency-message">Medical emergency guidance</label>
                <textarea defaultValue={settingsDefaults.emergencyMessage} id="emergency-message" name="emergencyMessage" />
              </div>
            ) : (
              <input name="emergencyMessage" type="hidden" value={settingsDefaults.emergencyMessage} />
            )}

            <div className="form-grid two-col">
              <div className="field-toggle compact">
                <div>
                  <strong>Record AI calls</strong>
                  <p>Keep recordings for call review and audit history.</p>
                </div>
                <label className="switch">
                  <input defaultChecked={settingsDefaults.recordCalls} name="recordCalls" type="checkbox" />
                  <span className="switch-slider" />
                </label>
              </div>

              <div className="field-toggle compact">
                <div>
                  <strong>Email summary</strong>
                  <p>Send a summary and transcript after each AI-handled call.</p>
                </div>
                <label className="switch">
                  <input defaultChecked={settingsDefaults.sendSummaryEmail} name="sendSummaryEmail" type="checkbox" />
                  <span className="switch-slider" />
                </label>
              </div>
            </div>
          </div>

          {success ? <div className="status-banner success">{success}</div> : null}
          {error ? <div className="status-banner error">{error}</div> : null}

          <div className="button-row">
            <button className="button" disabled={saving} type="submit">
              {saving ? "Saving AI settings..." : "Save AI settings"}
            </button>
          </div>
        </form>

        <div className="surface-card stack-md">
          <div className="page-intro">
            <span className="eyebrow">Preview</span>
            <h2 className="section-title" style={{ marginTop: 14 }}>Current behavior</h2>
          </div>
          <div className="detail-block">
            <h3>Answer mode</h3>
            <p>
              {settingsDefaults.answerMode === "ALL_CALLS"
                ? "AI answers all incoming calls."
                : settingsDefaults.answerMode === "BUSINESS_HOURS"
                  ? "AI answers only during defined office hours."
                  : `AI steps in after approximately ${settingsDefaults.ringCount} rings if staff does not answer.`}
            </p>
          </div>
          <div className="detail-block">
            <h3>Voice and greeting</h3>
            <p>{settingsDefaults.voicePreference}. Greeting is currently prepared for live caller intake.</p>
          </div>
          <div className="detail-block">
            <h3>After-hours flow</h3>
            <p>
              {settingsDefaults.afterHoursEnabled
                ? "AI will continue capturing requests after hours and set expectations for later fulfillment."
                : "After-hours handling is currently disabled."}
            </p>
          </div>
          <div className="detail-block">
            <h3>Medical Mode</h3>
            <p>
              {business.medicalModeEnabled
                ? settingsDefaults.emergencyMessage || "Medical safety guidance is active."
                : "Standard business handling is active. Medical emergency messaging is not required for this category."}
            </p>
          </div>
        </div>
      </section>
    </PortalShell>
  );
}
