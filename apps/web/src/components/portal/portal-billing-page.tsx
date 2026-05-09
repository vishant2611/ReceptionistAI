"use client";

import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

function formatBillingDate(value?: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PortalBillingPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading billing workspace...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!portal.business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  const billing = portal.business.billingOverview;
  const canManageBilling = portal.role === "BUSINESS_OWNER";
  const usagePercent = billing && billing.includedMinutes > 0
    ? Math.min(100, Math.round((billing.usedMinutes / billing.includedMinutes) * 100))
    : 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portal.business) {
      return;
    }
    setSaving(true);
    setSuccess("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      planName: String(formData.get("planName") ?? billing?.planName ?? portal.business?.selectedPlan ?? "Free Trial"),
      billingCycle: String(formData.get("billingCycle") ?? billing?.billingCycle ?? portal.business?.billingCycle ?? "Monthly"),
      status: String(formData.get("status") ?? billing?.status ?? "TRIAL"),
      includedMinutesPerMonth: Number(formData.get("includedMinutesPerMonth") ?? billing?.includedMinutes ?? 100),
      overageRatePerMinute: Number(formData.get("overageRatePerMinute") ?? billing?.overageRatePerMinute ?? 0.5),
    };

    try {
      const response = await apiRequest<{ message: string }>(`/api/businesses/${portal.business.id}/billing-settings`, {
        method: "PATCH",
        body: payload,
      });
      await portal.refreshBusiness();
      setSuccess(response.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save billing settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell
      active="billing"
      portal={portal}
      subtitle="Track plan minutes, current-cycle usage, and estimated overage before the invoice surprises anyone."
      title="Billing"
    >
      {portal.canViewBilling ? (
        <section className="grid-2">
          <div className="surface-card stack-md">
            <h3 className="card-section-title">Current billing cycle</h3>

            <div className="detail-list">
              <div className="detail-row"><span>Plan</span><strong>{billing?.planName || portal.business.selectedPlan || "Free Trial"}</strong></div>
              <div className="detail-row"><span>Status</span><strong>{billing?.status?.replaceAll("_", " ") || "TRIAL"}</strong></div>
              <div className="detail-row"><span>Billing cycle</span><strong>{billing?.billingCycle || portal.business.billingCycle || "Monthly"}</strong></div>
              <div className="detail-row"><span>Cycle dates</span><strong>{billing ? `${formatBillingDate(billing.cycleStart)} - ${formatBillingDate(billing.cycleEnd)}` : "-"}</strong></div>
              <div className="detail-row"><span>Portal role</span><strong>{portal.role.replaceAll("_", " ")}</strong></div>
            </div>

            <div className="detail-block">
              <h3>Minutes used</h3>
              <p style={{ marginBottom: 12 }}>
                {billing ? `${billing.usedMinutes} / ${billing.includedMinutes} minutes used this cycle.` : "Usage data is not available yet."}
              </p>
              <div style={{ background: "#eef1f7", borderRadius: 999, height: 14, overflow: "hidden" }}>
                <div
                  style={{
                    background: billing && billing.overageMinutes > 0 ? "#d66a5f" : "#2f55d4",
                    height: "100%",
                    transition: "width 180ms ease",
                    width: `${usagePercent}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="surface-card stack-md">
            <h3 className="card-section-title">Usage breakdown</h3>

            <div className="detail-list">
              <div className="detail-row"><span>Included minutes</span><strong>{billing?.includedMinutes ?? 0}</strong></div>
              <div className="detail-row"><span>Used minutes</span><strong>{billing?.usedMinutes ?? 0}</strong></div>
              <div className="detail-row"><span>Remaining minutes</span><strong>{billing?.remainingMinutes ?? 0}</strong></div>
              <div className="detail-row"><span>Overage minutes</span><strong>{billing?.overageMinutes ?? 0}</strong></div>
              <div className="detail-row"><span>Overage rate</span><strong>{billing ? `$${billing.overageRatePerMinute.toFixed(2)}/min` : "-"}</strong></div>
              <div className="detail-row"><span>Estimated overage</span><strong>{billing ? `$${billing.estimatedOverageCharge.toFixed(2)}` : "-"}</strong></div>
            </div>
          </div>

          {canManageBilling ? (
            <form className="surface-card stack-md" onSubmit={onSubmit}>
              <h3 className="card-section-title">Billing settings</h3>

              <div className="form-grid two-col">
                <div className="field">
                  <label htmlFor="billing-plan-name">Plan name</label>
                  <select defaultValue={billing?.planName || portal.business.selectedPlan || "Free Trial"} id="billing-plan-name" name="planName">
                    <option value="Free Trial">Free Trial</option>
                    <option value="Starter">Starter</option>
                    <option value="Growth">Growth</option>
                    <option value="Pro">Pro</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="billing-cycle">Billing cycle</label>
                  <select defaultValue={billing?.billingCycle || portal.business.billingCycle || "Monthly"} id="billing-cycle" name="billingCycle">
                    <option value="Monthly">Monthly</option>
                    <option value="Yearly">Yearly</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="billing-status">Billing status</label>
                  <select defaultValue={billing?.status || "TRIAL"} id="billing-status" name="status">
                    <option value="TRIAL">Trial</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                    <option value="PAST_DUE">Past due</option>
                    <option value="CANCELED">Canceled</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="included-minutes">Included minutes per month</label>
                  <input defaultValue={billing?.includedMinutes ?? 100} id="included-minutes" name="includedMinutesPerMonth" min="0" step="1" type="number" />
                </div>

                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="overage-rate">Overage rate per minute</label>
                  <input defaultValue={billing?.overageRatePerMinute ?? 0.5} id="overage-rate" min="0" name="overageRatePerMinute" step="0.01" type="number" />
                </div>
              </div>

              {success ? <div className="status-banner success">{success}</div> : null}
              {error ? <div className="status-banner error">{error}</div> : null}

              <div className="button-row">
                <button className="button" disabled={saving} type="submit">
                  {saving ? "Saving billing..." : "Save billing settings"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="surface-card stack-md" style={{ gridColumn: "1 / -1" }}>
            <h3 className="card-section-title">What these numbers mean</h3>
            <div className="detail-block">
              <h3>Minute tracking</h3>
              <p>We total completed call time within the current billing cycle, compare it against your included plan minutes, and estimate any overage using the current per-minute rate.</p>
            </div>
            <div className="detail-block">
              <h3>What comes next</h3>
              <p>This first billing view gives every business visibility into usage. The next billing phase can add admin controls, manual plan overrides, invoices, and payment automation.</p>
            </div>
          </div>
        </section>
      ) : (
        <div className="status-banner neutral">Your role does not have access to billing.</div>
      )}
    </PortalShell>
  );
}
