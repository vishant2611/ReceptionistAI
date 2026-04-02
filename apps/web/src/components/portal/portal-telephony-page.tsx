"use client";

import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

type TelephonySettings = {
  provider?: string;
  connectionMode?: string;
  twilioNumber?: string;
  fallbackNumber?: string;
  handoffEnabled?: boolean;
  voicemailFallbackEnabled?: boolean;
  consentMessage?: string;
  postCallSmsEnabled?: boolean;
};

export function PortalTelephonyPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading telephony workspace...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!portal.business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  const business = portal.business;
  const telephony =
    business.telephonySettings && typeof business.telephonySettings === "object" && !Array.isArray(business.telephonySettings)
      ? (business.telephonySettings as TelephonySettings)
      : {};

  const defaults = {
    provider: telephony.provider || "TWILIO",
    connectionMode: telephony.connectionMode || "DIRECT_TO_AI",
    twilioNumber: telephony.twilioNumber || "",
    fallbackNumber: telephony.fallbackNumber || business.phoneNumber || "",
    handoffEnabled: telephony.handoffEnabled ?? true,
    voicemailFallbackEnabled: telephony.voicemailFallbackEnabled ?? true,
    consentMessage:
      telephony.consentMessage || "This call may be recorded and transcribed for service quality and follow-up.",
    postCallSmsEnabled: telephony.postCallSmsEnabled ?? false,
  };
  const inboundWebhookUrl = `${apiBaseUrl}/api/telephony/twilio/voice/${business.id}/inbound`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      provider: String(formData.get("provider") ?? "TWILIO"),
      connectionMode: String(formData.get("connectionMode") ?? "DIRECT_TO_AI"),
      twilioNumber: String(formData.get("twilioNumber") ?? ""),
      fallbackNumber: String(formData.get("fallbackNumber") ?? ""),
      handoffEnabled: formData.get("handoffEnabled") === "on",
      voicemailFallbackEnabled: formData.get("voicemailFallbackEnabled") === "on",
      consentMessage: String(formData.get("consentMessage") ?? ""),
      postCallSmsEnabled: formData.get("postCallSmsEnabled") === "on",
    };

    try {
      const response = await apiRequest<{ message: string }>(`/api/businesses/${business.id}/telephony-settings`, {
        method: "PATCH",
        body: payload,
      });
      await portal.refreshBusiness();
      setSuccess(response.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save telephony settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell
      active="telephony"
      portal={portal}
      subtitle="Prepare the business for Twilio-based inbound calls, AI routing, fallback handoff, and consent handling."
      title="Telephony"
    >
      {!portal.canManageTelephony ? (
        <div className="status-banner neutral">Your role does not have access to telephony setup.</div>
      ) : (
        <section className="grid-2">
          <form className="surface-card stack-md" onSubmit={onSubmit}>
            <div className="page-intro">
              <span className="eyebrow">Connection</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Telephony preparation</h2>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="provider">Provider</label>
                <select defaultValue={defaults.provider} id="provider" name="provider">
                  <option value="TWILIO">Twilio</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="connection-mode">Inbound routing mode</label>
                <select defaultValue={defaults.connectionMode} id="connection-mode" name="connectionMode">
                  <option value="DIRECT_TO_AI">Directly to AI</option>
                  <option value="AI_AFTER_MISSED_RINGS">AI after missed rings</option>
                  <option value="BUSINESS_HOURS_ONLY">AI during business hours only</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="twilio-number">Twilio phone number</label>
                <input defaultValue={defaults.twilioNumber} id="twilio-number" name="twilioNumber" placeholder="+1 555-555-0100" type="text" />
              </div>

              <div className="field">
                <label htmlFor="fallback-number">Fallback / handoff number</label>
                <input defaultValue={defaults.fallbackNumber} id="fallback-number" name="fallbackNumber" placeholder="+1 555-555-0199" type="text" />
              </div>

              <div className="field">
                <label htmlFor="consent-message">Recording consent message</label>
                <textarea defaultValue={defaults.consentMessage} id="consent-message" name="consentMessage" />
              </div>

              <div className="form-grid two-col">
                <div className="field-toggle compact">
                  <div>
                    <strong>Human handoff</strong>
                    <p>Route difficult calls to staff when AI should escalate.</p>
                  </div>
                  <label className="switch">
                    <input defaultChecked={defaults.handoffEnabled} name="handoffEnabled" type="checkbox" />
                    <span className="switch-slider" />
                  </label>
                </div>

                <div className="field-toggle compact">
                  <div>
                    <strong>Voicemail fallback</strong>
                    <p>Send calls to voicemail if AI and staff routing both fail.</p>
                  </div>
                  <label className="switch">
                    <input defaultChecked={defaults.voicemailFallbackEnabled} name="voicemailFallbackEnabled" type="checkbox" />
                    <span className="switch-slider" />
                  </label>
                </div>
              </div>

              <div className="field-toggle compact">
                <div>
                  <strong>Post-call SMS follow-up</strong>
                  <p>Prepare the workflow for future text confirmations after AI-handled calls.</p>
                </div>
                <label className="switch">
                  <input defaultChecked={defaults.postCallSmsEnabled} name="postCallSmsEnabled" type="checkbox" />
                  <span className="switch-slider" />
                </label>
              </div>
            </div>

            {success ? <div className="status-banner success">{success}</div> : null}
            {error ? <div className="status-banner error">{error}</div> : null}

            <div className="button-row">
              <button className="button" disabled={saving} type="submit">
                {saving ? "Saving telephony prep..." : "Save telephony settings"}
              </button>
            </div>
          </form>

          <div className="surface-card stack-md">
            <div className="page-intro">
              <span className="eyebrow">Readiness</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Integration checklist</h2>
            </div>

            <div className="detail-block">
              <h3>What this unlocks</h3>
              <p>Twilio number mapping, inbound webhook routing, AI call pickup rules, escalation paths, and recording consent handling.</p>
            </div>

            <div className="detail-block">
              <h3>Inbound webhook URL</h3>
              <p className="code-inline">{inboundWebhookUrl}</p>
            </div>

            <div className="detail-list">
              <div className="detail-row"><span>Provider</span><strong>{defaults.provider}</strong></div>
              <div className="detail-row"><span>Routing mode</span><strong>{defaults.connectionMode.replaceAll("_", " ")}</strong></div>
              <div className="detail-row"><span>Twilio number</span><strong>{defaults.twilioNumber || "Not added yet"}</strong></div>
              <div className="detail-row"><span>Fallback number</span><strong>{defaults.fallbackNumber || "Not added yet"}</strong></div>
            </div>

            <div className="detail-block">
              <h3>Next integration step</h3>
              <p>Once your Twilio account is ready, we’ll connect inbound webhooks and route live calls into the AI call engine.</p>
            </div>
          </div>
        </section>
      )}
    </PortalShell>
  );
}
