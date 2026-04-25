"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { clearSession, getSession } from "../../lib/session";
import { PasswordChangeForm } from "../auth/password-change-form";

type AdminBusiness = {
  id: string;
  name: string;
  category: string;
  businessEmail: string;
  ownerEmail: string;
  ownerName: string;
  phoneNumber: string;
  address: string;
  timezone: string;
  twilioNumber: string;
  selectedPlan: string;
  billingCycle: string;
  billingStatus: string;
  includedMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
  overageMinutes: number;
  overageRatePerMinute: number;
  aiEnabled: boolean;
  medicalModeEnabled: boolean;
  onboardingCompleted: boolean;
  memberCount: number;
  members: Array<{
    id: string;
    email: string;
    fullName: string;
    role: string;
  }>;
  createdAt: string;
};

type AdminOverviewResponse = {
  businesses: AdminBusiness[];
};

function formatAdminDate(value: string) {
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

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function AdminDashboardPage() {
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null);
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingBilling, setSavingBilling] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [error, setError] = useState("");
  const [billingSuccess, setBillingSuccess] = useState("");
  const [passwordResetSuccess, setPasswordResetSuccess] = useState("");
  const [passwordDraftEmail, setPasswordDraftEmail] = useState("");

  useEffect(() => {
    setSession(getSession());
  }, []);

  async function loadOverview() {
    const response = await apiRequest<AdminOverviewResponse>("/api/businesses/admin/overview");
    setData(response);

    if (!selectedBusinessId && response.businesses[0]) {
      setSelectedBusinessId(response.businesses[0].id);
    }
  }

  useEffect(() => {
    if (session === null) {
      return;
    }

    if (!session.admin) {
      window.location.href = "/signin";
      return;
    }

    loadOverview()
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load admin portal.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [session]);

  const selectedBusiness = useMemo(
    () => data?.businesses.find((business) => business.id === selectedBusinessId) || data?.businesses[0] || null,
    [data, selectedBusinessId],
  );

  useEffect(() => {
    setPasswordDraftEmail(selectedBusiness?.ownerEmail || "");
  }, [selectedBusiness?.id, selectedBusiness?.ownerEmail]);

  const billingFormKey = selectedBusiness
    ? [
        selectedBusiness.id,
        selectedBusiness.selectedPlan,
        selectedBusiness.billingCycle,
        selectedBusiness.billingStatus,
        selectedBusiness.includedMinutes,
        selectedBusiness.overageRatePerMinute,
      ].join(":")
    : "no-business";

  const resetFormKey = selectedBusiness
    ? `${selectedBusiness.id}:${selectedBusiness.ownerEmail}`
    : "no-reset-target";

  const usagePercent =
    selectedBusiness && selectedBusiness.includedMinutes > 0
      ? Math.min(100, Math.round((selectedBusiness.usedMinutes / selectedBusiness.includedMinutes) * 100))
      : 0;

  async function onSubmitBilling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedBusiness) {
      return;
    }

    setSavingBilling(true);
    setError("");
    setBillingSuccess("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      planName: String(formData.get("planName") ?? selectedBusiness.selectedPlan),
      billingCycle: String(formData.get("billingCycle") ?? selectedBusiness.billingCycle),
      status: String(formData.get("billingStatus") ?? selectedBusiness.billingStatus),
      includedMinutesPerMonth: Number(formData.get("includedMinutesPerMonth") ?? selectedBusiness.includedMinutes),
      overageRatePerMinute: Number(formData.get("overageRatePerMinute") ?? selectedBusiness.overageRatePerMinute),
    };

    try {
      const response = await apiRequest<{ message: string }>(`/api/businesses/${selectedBusiness.id}/billing-settings`, {
        method: "PATCH",
        body: payload,
      });
      await loadOverview();
      setBillingSuccess(response.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save admin billing settings.");
    } finally {
      setSavingBilling(false);
    }
  }

  async function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedBusiness) {
      return;
    }

    setResettingPassword(true);
    setError("");
    setPasswordResetSuccess("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String((formData.get("email") ?? passwordDraftEmail) || selectedBusiness.ownerEmail),
      newPassword: String(formData.get("newPassword") ?? ""),
    };

    try {
      const response = await apiRequest<{ message: string }>("/api/auth/admin/reset-password", {
        method: "POST",
        body: payload,
      });
      setPasswordResetSuccess(response.message);
      event.currentTarget.reset();
      setPasswordDraftEmail(selectedBusiness.ownerEmail || "");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to reset user password.");
    } finally {
      setResettingPassword(false);
    }
  }

  if (session === null) {
    return (
      <main className="app-shell">
        <section className="container stack-lg admin-shell">
          <div className="status-banner neutral">Loading admin portal...</div>
        </section>
      </main>
    );
  }

  if (!session.admin) {
    return null;
  }

  return (
    <main className="app-shell">
      <section className="container stack-lg admin-shell">
        <section className="surface-card stack-md admin-hero-card">
          <div className="helper-row">
            <div>
              <span className="eyebrow">Admin portal</span>
              <h1 className="display-title admin-display-title">Business control center</h1>
              <p className="lead admin-hero-copy">
                Review one workspace at a time, update billing, and help customers without opening each business portal.
              </p>
            </div>

            <div className="button-row">
              <button
                className="button-ghost"
                onClick={() => {
                  clearSession();
                  window.location.href = "/signin";
                }}
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>
        </section>

        {loading ? <div className="status-banner neutral">Loading admin portal...</div> : null}
        {error ? <div className="status-banner error">{error}</div> : null}

        {data ? (
          <section className="admin-layout">
            <aside className="surface-card stack-md admin-sidebar">
              <div className="page-intro admin-page-intro compact">
                <span className="eyebrow">Selector</span>
                <h2 className="section-title admin-section-title">Choose workspace</h2>
                <p className="lead admin-lead">Pick one business to review and manage.</p>
              </div>

              <div className="field admin-field">
                <label htmlFor="admin-business-select">Jump to business</label>
                <select
                  id="admin-business-select"
                  onChange={(event) => setSelectedBusinessId(event.target.value)}
                  value={selectedBusiness?.id || ""}
                >
                  {data.businesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name} - {business.category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="stack-sm admin-selector-list">
                {data.businesses.map((business) => {
                  const selected = business.id === selectedBusiness?.id;

                  return (
                    <button
                      key={business.id}
                      className={selected ? "admin-business-chip selected" : "admin-business-chip"}
                      onClick={() => setSelectedBusinessId(business.id)}
                      type="button"
                    >
                      <span className="admin-business-chip-body">
                        <strong>{business.name}</strong>
                        <span>{business.category} - {statusLabel(business.billingStatus)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="detail-list admin-detail-list compact">
                <div className="detail-row"><span>Total businesses</span><strong>{data.businesses.length}</strong></div>
                <div className="detail-row"><span>Admin email</span><strong>{session.admin.email}</strong></div>
                <div className="detail-row"><span>Admin role</span><strong>{statusLabel(session.admin.role)}</strong></div>
              </div>
            </aside>

            {selectedBusiness ? (
              <div className="stack-lg admin-main-column">
                <section className="surface-card stack-md admin-overview-card">
                  <div className="admin-overview-head">
                    <div>
                      <span className="eyebrow">Selected business</span>
                      <h2 className="section-title admin-section-title">{selectedBusiness.name}</h2>
                      <p className="lead admin-lead">
                        {selectedBusiness.category} business managed by {selectedBusiness.ownerName || selectedBusiness.ownerEmail || "no owner"}.
                      </p>
                    </div>

                    <div className="admin-usage-meter">
                      <div className="admin-usage-track">
                        <div
                          className="admin-usage-fill"
                          style={{
                            background: selectedBusiness.overageMinutes > 0 ? "#d66a5f" : "#2f55d4",
                            width: `${usagePercent}%`,
                          }}
                        />
                      </div>
                      <p className="lead admin-meter-copy">
                        {selectedBusiness.usedMinutes} / {selectedBusiness.includedMinutes} minutes used this cycle
                      </p>
                    </div>
                  </div>

                  <div className="grid-3 admin-stats-grid">
                    <div className="surface-muted stack-sm admin-stat-card">
                      <span className="eyebrow">Usage</span>
                      <h3 className="section-title admin-stat-value">{selectedBusiness.usedMinutes}</h3>
                      <p className="lead admin-stat-copy">Minutes used this cycle</p>
                    </div>
                    <div className="surface-muted stack-sm admin-stat-card">
                      <span className="eyebrow">Remaining</span>
                      <h3 className="section-title admin-stat-value">{selectedBusiness.remainingMinutes}</h3>
                      <p className="lead admin-stat-copy">Minutes before overage</p>
                    </div>
                    <div className="surface-muted stack-sm admin-stat-card">
                      <span className="eyebrow">Overage</span>
                      <h3 className="section-title admin-stat-value">{selectedBusiness.overageMinutes}</h3>
                      <p className="lead admin-stat-copy">Minutes over the limit</p>
                    </div>
                  </div>
                </section>

                <section className="grid-2 admin-detail-grid">
                  <div className="surface-card stack-md admin-panel-card">
                    <div className="page-intro admin-page-intro compact">
                      <span className="eyebrow">Business details</span>
                      <h2 className="section-title admin-section-title">Account profile</h2>
                    </div>

                    <div className="detail-list admin-detail-list">
                      <div className="detail-row"><span>Business name</span><strong>{selectedBusiness.name}</strong></div>
                      <div className="detail-row"><span>Business type</span><strong>{selectedBusiness.category}</strong></div>
                      <div className="detail-row"><span>Business email</span><strong>{selectedBusiness.businessEmail || "-"}</strong></div>
                      <div className="detail-row"><span>Owner name</span><strong>{selectedBusiness.ownerName || "-"}</strong></div>
                      <div className="detail-row"><span>Owner email</span><strong>{selectedBusiness.ownerEmail || "-"}</strong></div>
                      <div className="detail-row"><span>Business phone</span><strong>{selectedBusiness.phoneNumber || "-"}</strong></div>
                      <div className="detail-row"><span>Address</span><strong>{selectedBusiness.address || "-"}</strong></div>
                      <div className="detail-row"><span>Timezone</span><strong>{selectedBusiness.timezone || "-"}</strong></div>
                      <div className="detail-row"><span>Created</span><strong>{formatAdminDate(selectedBusiness.createdAt)}</strong></div>
                    </div>
                  </div>

                  <div className="surface-card stack-md admin-panel-card">
                    <div className="page-intro admin-page-intro compact">
                      <span className="eyebrow">Operational</span>
                      <h2 className="section-title admin-section-title">System status</h2>
                    </div>

                    <div className="detail-list admin-detail-list">
                      <div className="detail-row"><span>Twilio number</span><strong>{selectedBusiness.twilioNumber || "-"}</strong></div>
                      <div className="detail-row"><span>Plan</span><strong>{selectedBusiness.selectedPlan || "-"}</strong></div>
                      <div className="detail-row"><span>Billing cycle</span><strong>{selectedBusiness.billingCycle || "-"}</strong></div>
                      <div className="detail-row"><span>Billing status</span><strong>{statusLabel(selectedBusiness.billingStatus)}</strong></div>
                      <div className="detail-row"><span>AI enabled</span><strong>{selectedBusiness.aiEnabled ? "Yes" : "No"}</strong></div>
                      <div className="detail-row"><span>Medical mode</span><strong>{selectedBusiness.medicalModeEnabled ? "Yes" : "No"}</strong></div>
                      <div className="detail-row"><span>Onboarding done</span><strong>{selectedBusiness.onboardingCompleted ? "Yes" : "No"}</strong></div>
                      <div className="detail-row"><span>Team members</span><strong>{selectedBusiness.memberCount}</strong></div>
                    </div>
                  </div>
                </section>

                <section className="grid-2 admin-control-grid">
                  <form key={billingFormKey} className="surface-card stack-md admin-panel-card" onSubmit={onSubmitBilling}>
                    <div className="page-intro admin-page-intro compact">
                      <span className="eyebrow">Billing controls</span>
                      <h2 className="section-title admin-section-title">Manage billing</h2>
                      <p className="lead admin-lead">Update the commercial settings for {selectedBusiness.name}.</p>
                    </div>

                    {billingSuccess ? <div className="status-banner success">{billingSuccess}</div> : null}

                    <div className="form-grid two-col admin-form-grid">
                      <div className="field admin-field">
                        <label htmlFor="admin-plan-name">Plan name</label>
                        <select defaultValue={selectedBusiness.selectedPlan} id="admin-plan-name" name="planName">
                          <option value="Free Trial">Free Trial</option>
                          <option value="Starter">Starter</option>
                          <option value="Growth">Growth</option>
                          <option value="Pro">Pro</option>
                          <option value="Custom">Custom</option>
                        </select>
                      </div>

                      <div className="field admin-field">
                        <label htmlFor="admin-billing-cycle">Billing cycle</label>
                        <select defaultValue={selectedBusiness.billingCycle} id="admin-billing-cycle" name="billingCycle">
                          <option value="Monthly">Monthly</option>
                          <option value="Yearly">Yearly</option>
                        </select>
                      </div>

                      <div className="field admin-field">
                        <label htmlFor="admin-billing-status">Billing status</label>
                        <select defaultValue={selectedBusiness.billingStatus} id="admin-billing-status" name="billingStatus">
                          <option value="TRIAL">Trial</option>
                          <option value="ACTIVE">Active</option>
                          <option value="PAUSED">Paused</option>
                          <option value="PAST_DUE">Past due</option>
                          <option value="CANCELED">Canceled</option>
                        </select>
                      </div>

                      <div className="field admin-field">
                        <label htmlFor="admin-included-minutes">Included minutes per month</label>
                        <input defaultValue={selectedBusiness.includedMinutes} id="admin-included-minutes" min="0" name="includedMinutesPerMonth" step="1" type="number" />
                      </div>

                      <div className="field admin-field admin-field-full">
                        <label htmlFor="admin-overage-rate">Overage rate per minute</label>
                        <input defaultValue={selectedBusiness.overageRatePerMinute} id="admin-overage-rate" min="0" name="overageRatePerMinute" step="0.01" type="number" />
                      </div>
                    </div>

                    <div className="button-row admin-action-row">
                      <button className="button" disabled={savingBilling} type="submit">
                        {savingBilling ? "Saving billing settings..." : "Save billing settings"}
                      </button>
                    </div>
                  </form>

                  <form key={resetFormKey} className="surface-card stack-md admin-panel-card" onSubmit={onResetPassword}>
                    <div className="page-intro admin-page-intro compact">
                      <span className="eyebrow">Access controls</span>
                      <h2 className="section-title admin-section-title">Reset user password</h2>
                      <p className="lead admin-lead">
                        Choose any member in this business and reset their password safely from admin.
                      </p>
                    </div>

                    {passwordResetSuccess ? <div className="status-banner success">{passwordResetSuccess}</div> : null}

                    <div className="detail-block admin-team-block">
                      <div className="helper-row admin-team-header">
                        <div>
                          <span className="eyebrow">Members</span>
                          <p className="lead admin-team-copy">
                            Admin can see member names, emails, and roles. Existing passwords are never shown, but you can reset them.
                          </p>
                        </div>
                      </div>

                      <div className="stack-sm admin-member-list">
                        {selectedBusiness.members.map((member) => (
                          <div className="member-card admin-member-card" key={member.id}>
                            <div className="member-head">
                              <div>
                                <strong>{member.fullName || member.email}</strong>
                                <span>{member.email}</span>
                              </div>
                              <span className="inline-badge">{statusLabel(member.role)}</span>
                            </div>

                            <div className="button-row admin-member-actions">
                              <button
                                className="button-ghost"
                                onClick={() => setPasswordDraftEmail(member.email)}
                                type="button"
                              >
                                Use this email
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="form-grid admin-form-grid">
                      <div className="field admin-field">
                        <label htmlFor="admin-reset-email">User email</label>
                        <input id="admin-reset-email" name="email" onChange={(event) => setPasswordDraftEmail(event.target.value)} type="email" value={passwordDraftEmail} />
                      </div>

                      <div className="field admin-field">
                        <label htmlFor="admin-reset-password">New password</label>
                        <input id="admin-reset-password" minLength={8} name="newPassword" type="password" />
                      </div>
                    </div>

                    <div className="button-row admin-action-row">
                      <button className="button-secondary" disabled={resettingPassword} type="submit">
                        {resettingPassword ? "Resetting password..." : "Reset password"}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            ) : null}
          </section>
        ) : null}

        <PasswordChangeForm email={session.admin.email} eyebrow="Admin security" title="Change admin password" />
      </section>
    </main>
  );
}
