"use client";

import { FormEvent, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

type ProfileResponse = {
  message: string;
};

function formatOfficeHours(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

const defaultOfficeHours = ["Mon-Fri: 9:00 AM - 6:00 PM", "Saturday: 10:00 AM - 3:00 PM"];

export function PortalProfilePage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const officeHours = formatOfficeHours(portal.business?.officeHours);
  const officeHoursValue = useMemo(
    () => (officeHours.length > 0 ? officeHours.join("\n") : defaultOfficeHours.join("\n")),
    [officeHours],
  );

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading business profile...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!portal.business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;
  const business = portal.business;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      businessName: String(formData.get("businessName") ?? ""),
      phoneNumber: String(formData.get("phoneNumber") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
      address: String(formData.get("address") ?? ""),
      description: String(formData.get("description") ?? ""),
      servicesSummary: String(formData.get("servicesSummary") ?? ""),
      priceListSummary: String(formData.get("priceListSummary") ?? ""),
      officeHours: String(formData.get("officeHours") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };

    try {
      const response = await apiRequest<ProfileResponse>(`/api/businesses/${business.id}/profile`, {
        method: "PATCH",
        body: payload,
      });
      await portal.refreshBusiness();
      setSuccess(response.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update the business profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell
      active="profile"
      portal={portal}
      subtitle="Keep your business details, services, pricing, and operating hours accurate so the AI receptionist can answer correctly."
      title="Business Profile"
    >
      <section className="profile-layout">
        <form className="surface-card stack-md profile-editor-card" onSubmit={onSubmit}>
          <div className="page-intro">
            <span className="eyebrow">Knowledge base</span>
            <h2 className="section-title" style={{ marginTop: 14 }}>Business details the AI uses</h2>
            <p className="lead" style={{ marginTop: 10 }}>
              These fields directly influence how the live AI receptionist answers callers.
            </p>
          </div>

          <div className="form-grid two-col profile-form-grid">
            <div className="field">
              <label htmlFor="profile-business-name">Business name</label>
              <input defaultValue={business.name} id="profile-business-name" name="businessName" type="text" />
            </div>
            <div className="field">
              <label htmlFor="profile-phone">Phone number</label>
              <input defaultValue={business.phoneNumber || ""} id="profile-phone" name="phoneNumber" type="tel" />
            </div>
            <div className="field">
              <label htmlFor="profile-timezone">Timezone</label>
              <select defaultValue={business.timezone} id="profile-timezone" name="timezone">
                <option>America/Toronto</option>
                <option>America/New_York</option>
                <option>America/Chicago</option>
                <option>America/Los_Angeles</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="profile-address">Address</label>
              <input defaultValue={business.address || ""} id="profile-address" name="address" type="text" />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="profile-description">Business summary</label>
              <textarea
                defaultValue={business.description || ""}
                id="profile-description"
                name="description"
                placeholder="Describe what the business does and how the receptionist should explain it to callers."
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="profile-services">Services summary</label>
              <textarea
                defaultValue={business.servicesSummary || ""}
                id="profile-services"
                name="servicesSummary"
                placeholder="List the services, products, or request types the AI should mention clearly."
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="profile-pricing">Price or fee summary</label>
              <textarea
                defaultValue={business.priceListSummary || ""}
                id="profile-pricing"
                name="priceListSummary"
                placeholder="Add price examples or fee guidance the AI can safely quote."
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="profile-hours">Office hours</label>
              <textarea defaultValue={officeHoursValue} id="profile-hours" name="officeHours" />
            </div>
          </div>

          {success ? <div className="status-banner success">{success}</div> : null}
          {error ? <div className="status-banner error">{error}</div> : null}

          <div className="button-row">
            <button className="button" disabled={saving || !portal.canEditConfiguration} type="submit">
              {saving ? "Saving business profile..." : "Save business profile"}
            </button>
          </div>
        </form>

        <div className="surface-card stack-md profile-snapshot-card">
          <div className="page-intro">
            <span className="eyebrow">Current snapshot</span>
            <h2 className="section-title" style={{ marginTop: 14 }}>What the AI can currently reference</h2>
          </div>

          <div className="detail-list">
            <div className="detail-row"><span>Category</span><strong>{business.category}</strong></div>
            <div className="detail-row"><span>Email</span><strong>{business.email || "-"}</strong></div>
            <div className="detail-row"><span>Plan</span><strong>{business.selectedPlan || "-"}</strong></div>
            <div className="detail-row"><span>Billing cycle</span><strong>{business.billingCycle || "-"}</strong></div>
          </div>

          <div className="detail-block">
            <h3>Business summary</h3>
            <p>{business.description || "No summary added yet."}</p>
          </div>
          <div className="detail-block">
            <h3>Services summary</h3>
            <p>{business.servicesSummary || "No services summary added yet."}</p>
          </div>
          <div className="detail-block">
            <h3>Price summary</h3>
            <p>{business.priceListSummary || "No pricing summary added yet."}</p>
          </div>
          <div className="detail-block">
            <h3>Office hours</h3>
            {officeHours.length > 0 ? (
              <div className="stack-sm">
                {officeHours.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : (
              <p>No office hours added yet.</p>
            )}
          </div>
        </div>
      </section>
    </PortalShell>
  );
}
