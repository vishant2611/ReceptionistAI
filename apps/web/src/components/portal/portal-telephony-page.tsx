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
  businessNumber?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioNumber?: string;
  fallbackNumber?: string;
  aiReceptionistEnabled?: boolean;
  routingMode?: string;
  aiTakeoverDelaySeconds?: number;
  afterHoursRouting?: string;
  handoffEnabled?: boolean;
  voicemailFallbackEnabled?: boolean;
  recordingEnabled?: boolean;
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
    businessNumber: telephony.businessNumber || business.phoneNumber || "",
    twilioAccountSid: telephony.twilioAccountSid || "",
    twilioAuthToken: telephony.twilioAuthToken || "",
    twilioNumber: telephony.twilioNumber || "",
    fallbackNumber: telephony.fallbackNumber || business.phoneNumber || "",
    aiReceptionistEnabled: telephony.aiReceptionistEnabled ?? business.aiEnabled ?? true,
    routingMode: telephony.routingMode || "AI_IMMEDIATELY",
    aiTakeoverDelaySeconds: Number(telephony.aiTakeoverDelaySeconds ?? 15),
    afterHoursRouting: telephony.afterHoursRouting || "AI",
    handoffEnabled: telephony.handoffEnabled ?? true,
    voicemailFallbackEnabled: telephony.voicemailFallbackEnabled ?? true,
    recordingEnabled: telephony.recordingEnabled ?? true,
    consentMessage:
      telephony.consentMessage || "This call may be recorded and transcribed for service quality and follow-up.",
    postCallSmsEnabled: telephony.postCallSmsEnabled ?? false,
  };
  const inboundWebhookUrl = `${apiBaseUrl}/api/telephony/twilio/voice/${business.id}/inbound`;
  const sharedInboundWebhookUrl = `${apiBaseUrl}/api/telephony/twilio/voice/inbound`;
  const openAiRealtimeUrl = `${apiBaseUrl}/api/telephony/realtime/${business.id}/session`;
  const twilioMediaBridgeUrl = apiBaseUrl.replace(/^http/i, "ws") + `/ws/twilio-media?businessId=${business.id}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      provider: String(formData.get("provider") ?? "TWILIO"),
      connectionMode: String(formData.get("connectionMode") ?? "DIRECT_TO_AI"),
      businessNumber: String(formData.get("businessNumber") ?? ""),
      twilioAccountSid: String(formData.get("twilioAccountSid") ?? ""),
      twilioAuthToken: String(formData.get("twilioAuthToken") ?? ""),
      twilioNumber: String(formData.get("twilioNumber") ?? ""),
      fallbackNumber: String(formData.get("fallbackNumber") ?? ""),
      aiReceptionistEnabled: formData.get("aiReceptionistEnabled") === "on",
      routingMode: String(formData.get("routingMode") ?? "AI_IMMEDIATELY"),
      aiTakeoverDelaySeconds: Number(formData.get("aiTakeoverDelaySeconds") ?? 15),
      afterHoursRouting: String(formData.get("afterHoursRouting") ?? "AI"),
      handoffEnabled: formData.get("handoffEnabled") === "on",
      voicemailFallbackEnabled: formData.get("voicemailFallbackEnabled") === "on",
      recordingEnabled: formData.get("recordingEnabled") === "on",
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
      subtitle="Set up your business number, choose who answers first, and control how calls flow between staff and the AI receptionist."
      title="Telephony"
    >
      {!portal.canManageTelephony ? (
        <div className="status-banner neutral">Your role does not have access to telephony setup.</div>
      ) : (
        <section className="grid-2">
          <form className="surface-card stack-md" onSubmit={onSubmit}>
            <div className="page-intro">
              <span className="eyebrow">Call routing</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Phone system setup made simple</h2>
            </div>

            <div className="form-grid">
              <div className="detail-block">
                <h3>1. Main phone numbers</h3>
                <p>Add the real business number your customers already call, then add the Twilio number used behind the scenes.</p>
                <div className="form-grid two-col" style={{ marginTop: 14 }}>
                  <div className="field">
                    <label htmlFor="business-number">Business phone number</label>
                    <input defaultValue={defaults.businessNumber} id="business-number" name="businessNumber" placeholder="+1 555-555-0123" type="text" />
                  </div>

                  <div className="field">
                    <label htmlFor="twilio-account-sid">Twilio Account SID</label>
                    <input
                      defaultValue={defaults.twilioAccountSid}
                      id="twilio-account-sid"
                      name="twilioAccountSid"
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      type="text"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="twilio-auth-token">Twilio Auth Token</label>
                    <input
                      defaultValue={defaults.twilioAuthToken}
                      id="twilio-auth-token"
                      name="twilioAuthToken"
                      placeholder="Enter the Twilio auth token for this business"
                      type="password"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="twilio-number">Twilio phone number</label>
                    <input defaultValue={defaults.twilioNumber} id="twilio-number" name="twilioNumber" placeholder="+1 555-555-0100" type="text" />
                  </div>

                  <div className="field">
                    <label htmlFor="provider">Provider</label>
                    <select defaultValue={defaults.provider} id="provider" name="provider">
                      <option value="TWILIO">Twilio</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="connection-mode">Connection method</label>
                    <select defaultValue={defaults.connectionMode} id="connection-mode" name="connectionMode">
                      <option value="DIRECT_TO_AI">Forwarded or direct to AI</option>
                      <option value="AI_AFTER_MISSED_RINGS">AI after missed rings</option>
                      <option value="BUSINESS_HOURS_ONLY">AI during business hours only</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="detail-block">
                <h3>2. Who should answer the call?</h3>
                <p>Choose whether the AI answers right away, staff gets the first chance, or the AI stays off completely.</p>
                <div className="stack-md" style={{ marginTop: 14 }}>
                  <div className="field-toggle">
                    <div>
                      <strong>Enable AI receptionist</strong>
                      <p>Turn the AI on when you want it to handle calls, or off when your staff should answer instead.</p>
                    </div>
                    <label className="switch">
                      <input defaultChecked={defaults.aiReceptionistEnabled} name="aiReceptionistEnabled" type="checkbox" />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="form-grid two-col">
                    <div className="field">
                      <label htmlFor="routing-mode">Who answers first?</label>
                      <select defaultValue={defaults.routingMode} id="routing-mode" name="routingMode">
                        <option value="AI_IMMEDIATELY">AI answers immediately</option>
                        <option value="STAFF_FIRST_THEN_AI">Staff first, then AI</option>
                        <option value="STAFF_ONLY">Staff only</option>
                      </select>
                    </div>

                    <div className="field">
                      <label htmlFor="ai-takeover-delay">If staff does not answer in</label>
                      <select defaultValue={String(defaults.aiTakeoverDelaySeconds)} id="ai-takeover-delay" name="aiTakeoverDelaySeconds">
                        <option value="0">0 seconds</option>
                        <option value="5">5 seconds</option>
                        <option value="10">10 seconds</option>
                        <option value="15">15 seconds</option>
                        <option value="20">20 seconds</option>
                        <option value="30">30 seconds</option>
                      </select>
                    </div>

                    <div className="field" style={{ gridColumn: "1 / -1" }}>
                      <label htmlFor="fallback-number">Fallback or handoff number</label>
                      <input defaultValue={defaults.fallbackNumber} id="fallback-number" name="fallbackNumber" placeholder="+1 555-555-0199" type="text" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-block">
                <h3>3. After-hours handling</h3>
                <p>Decide what should happen when the business is closed or your team is unavailable.</p>
                <div className="form-grid two-col" style={{ marginTop: 14 }}>
                  <div className="field">
                    <label htmlFor="after-hours-routing">After-hours behavior</label>
                    <select defaultValue={defaults.afterHoursRouting} id="after-hours-routing" name="afterHoursRouting">
                      <option value="AI">AI answers after hours</option>
                      <option value="VOICEMAIL">Send to voicemail</option>
                      <option value="MISSED_CALL_CAPTURE">Capture callback request</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="consent-message">Recording consent message</label>
                    <textarea defaultValue={defaults.consentMessage} id="consent-message" name="consentMessage" />
                  </div>
                </div>
              </div>

              <div className="detail-block">
                <h3>4. Fallbacks and follow-up</h3>
                <p>These options control recording, escalation, voicemail, and later follow-up workflows.</p>
                <div className="form-grid two-col" style={{ marginTop: 14 }}>
                  <div className="field-toggle compact">
                    <div>
                      <strong>Call recording</strong>
                      <p>Keep audio recordings available from the portal for review and training.</p>
                    </div>
                    <label className="switch">
                      <input defaultChecked={defaults.recordingEnabled} name="recordingEnabled" type="checkbox" />
                      <span className="switch-slider" />
                    </label>
                  </div>

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
              <h2 className="section-title" style={{ marginTop: 14 }}>Current phone behavior</h2>
            </div>

            <div className="detail-block">
              <h3>Main number strategy</h3>
              <p>
                {defaults.businessNumber
                  ? `Your public business number is set as ${defaults.businessNumber}. Twilio can stay behind the scenes for forwarding, routing, or future number porting.`
                  : "Add the public business number your customers already call so the routing plan is clear for your team."}
              </p>
            </div>

            <div className="detail-block">
              <h3>Who answers first</h3>
              <p>
                {defaults.routingMode === "AI_IMMEDIATELY"
                  ? "AI is set to answer right away."
                  : defaults.routingMode === "STAFF_FIRST_THEN_AI"
                    ? `Staff gets the first chance to answer. If they do not pick up within about ${defaults.aiTakeoverDelaySeconds} seconds, AI should take over.`
                    : "Staff-only mode is selected, so the AI should stay out of the way unless you change the routing mode."}
              </p>
            </div>

            <div className="detail-block">
              <h3>After-hours behavior</h3>
              <p>
                {defaults.afterHoursRouting === "AI"
                  ? "AI is prepared to answer after hours."
                  : defaults.afterHoursRouting === "VOICEMAIL"
                    ? "Calls should go to voicemail after hours."
                    : "After-hours calls should be captured as callback requests for the team."}
              </p>
            </div>

            <div className="detail-block">
              <h3>Inbound webhook URL</h3>
              <p className="code-inline">{inboundWebhookUrl}</p>
            </div>

            <div className="detail-block">
              <h3>Shared inbound webhook URL</h3>
              <p className="code-inline">{sharedInboundWebhookUrl}</p>
              <p>Use this shared URL when you want Twilio to route calls automatically by the called Twilio number saved on this page.</p>
            </div>

            <div className="detail-block">
              <h3>OpenAI realtime session endpoint</h3>
              <p className="code-inline">{openAiRealtimeUrl}</p>
            </div>

            <div className="detail-block">
              <h3>Twilio media bridge URL</h3>
              <p className="code-inline">{twilioMediaBridgeUrl}</p>
            </div>

            <div className="detail-list">
              <div className="detail-row"><span>AI receptionist</span><strong>{defaults.aiReceptionistEnabled ? "Enabled" : "Disabled"}</strong></div>
              <div className="detail-row"><span>Business number</span><strong>{defaults.businessNumber || "Not added yet"}</strong></div>
              <div className="detail-row"><span>Provider</span><strong>{defaults.provider}</strong></div>
              <div className="detail-row"><span>Routing mode</span><strong>{defaults.connectionMode.replaceAll("_", " ")}</strong></div>
              <div className="detail-row"><span>Twilio number</span><strong>{defaults.twilioNumber || "Not added yet"}</strong></div>
              <div className="detail-row"><span>Fallback number</span><strong>{defaults.fallbackNumber || "Not added yet"}</strong></div>
              <div className="detail-row"><span>AI takeover delay</span><strong>{`${defaults.aiTakeoverDelaySeconds} seconds`}</strong></div>
            </div>

            <div className="detail-block">
              <h3>Next integration step</h3>
              <p>Once your Twilio account is ready, we'll connect inbound webhooks and then wire staff-first routing more directly into the live call engine.</p>
            </div>

            <div className="detail-block">
              <h3>How this setup works</h3>
              <p>For the current MVP, customers keep their existing business number and forward calls to the Twilio number. Twilio then routes those calls into the AI receptionist using the rules you set on this page.</p>
            </div>
          </div>
        </section>
      )}
    </PortalShell>
  );
}
