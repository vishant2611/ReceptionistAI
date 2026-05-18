"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PasswordChangeForm } from "../auth/password-change-form";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

type ProfileResponse = {
  message: string;
};

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type DayHours = { closed: boolean; open: string; close: string };

type WeeklySchedule = Record<DayKey, DayHours>;

type Holiday = { date: string; label: string };

const DAY_KEYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

// Build 30-min time slots from 00:00 to 23:30
const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
})();

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const COMMON_TIMEZONES = [
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Halifax",
  "America/St_Johns",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

const defaultSchedule: WeeklySchedule = {
  monday: { closed: false, open: "09:00", close: "18:00" },
  tuesday: { closed: false, open: "09:00", close: "18:00" },
  wednesday: { closed: false, open: "09:00", close: "18:00" },
  thursday: { closed: false, open: "09:00", close: "18:00" },
  friday: { closed: false, open: "09:00", close: "18:00" },
  saturday: { closed: true, open: "", close: "" },
  sunday: { closed: true, open: "", close: "" },
};

export function PortalProfilePage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const business = portal.business;
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const [schedule, setSchedule] = useState<WeeklySchedule>(defaultSchedule);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [scheduleTimezone, setScheduleTimezone] = useState("America/Toronto");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayLabel, setNewHolidayLabel] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Sync schedule state once portal data loads
  useEffect(() => {
    if (business && !initialized) {
      const incoming = business.officeSchedule;
      if (incoming && incoming.days && Object.keys(incoming.days).length > 0) {
        const next: WeeklySchedule = { ...defaultSchedule };
        for (const day of DAY_KEYS) {
          const d = incoming.days[day];
          if (d) {
            next[day] = { closed: d.closed, open: d.open, close: d.close };
          }
        }
        setSchedule(next);
        setHolidays(incoming.holidays ?? []);
        setScheduleTimezone(incoming.timezone || business.timezone || "America/Toronto");
      } else {
        setScheduleTimezone(business.timezone || "America/Toronto");
      }
      setInitialized(true);
    }
  }, [business, initialized]);

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading business profile...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  function updateDay(day: DayKey, patch: Partial<DayHours>) {
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  function toggleClosed(day: DayKey) {
    setSchedule((prev) => ({
      ...prev,
      [day]: prev[day].closed
        ? { closed: false, open: "09:00", close: "18:00" }
        : { closed: true, open: "", close: "" },
    }));
  }

  function addHoliday() {
    if (!newHolidayDate) return;
    if (holidays.some((h) => h.date === newHolidayDate)) return;
    setHolidays([...holidays, { date: newHolidayDate, label: newHolidayLabel.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewHolidayDate("");
    setNewHolidayLabel("");
  }

  function removeHoliday(date: string) {
    setHolidays(holidays.filter((h) => h.date !== date));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      businessName: String(formData.get("businessName") ?? ""),
      phoneNumber: String(formData.get("phoneNumber") ?? ""),
      timezone: scheduleTimezone,
      address: String(formData.get("address") ?? ""),
      description: String(formData.get("description") ?? ""),
      servicesSummary: String(formData.get("servicesSummary") ?? ""),
      priceListSummary: String(formData.get("priceListSummary") ?? ""),
      officeHours: [] as string[], // ignored — backend will regenerate from schedule
      officeSchedule: {
        timezone: scheduleTimezone,
        days: schedule,
        holidays,
      },
    };

    try {
      if (!business) throw new Error("No business session found.");
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
          <h3 className="card-section-title">Business details the AI uses</h3>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.9rem" }}>
            These fields directly influence how the live AI receptionist answers callers.
          </p>

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
              <label htmlFor="profile-address">Address</label>
              <input defaultValue={business.address || ""} id="profile-address" name="address" type="text" />
            </div>
            <div className="field">
              <label htmlFor="profile-timezone-select">Business timezone</label>
              <select
                id="profile-timezone-select"
                value={scheduleTimezone}
                onChange={(e) => setScheduleTimezone(e.target.value)}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
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
          </div>

          {/* ── Office Hours (Structured) ──────────────────────────────────── */}
          <div className="hours-section">
            <div className="hours-section-header">
              <h4>Weekly schedule</h4>
              <p>Set when the AI can book appointments. The AI will refuse times outside these hours.</p>
            </div>
            <div className="hours-list">
              {DAY_KEYS.map((day) => {
                const d = schedule[day];
                return (
                  <div key={day} className={`hours-row${d.closed ? " closed" : ""}`}>
                    <div className="hours-day-label">{DAY_LABELS[day]}</div>
                    <label className="hours-toggle">
                      <input
                        type="checkbox"
                        checked={!d.closed}
                        onChange={() => toggleClosed(day)}
                      />
                      <span>{d.closed ? "Closed" : "Open"}</span>
                    </label>
                    {!d.closed && (
                      <>
                        <select
                          className="hours-time-select"
                          value={d.open}
                          onChange={(e) => updateDay(day, { open: e.target.value })}
                        >
                          {TIME_SLOTS.map((t) => (
                            <option key={t} value={t}>{formatTimeLabel(t)}</option>
                          ))}
                        </select>
                        <span className="hours-dash">to</span>
                        <select
                          className="hours-time-select"
                          value={d.close}
                          onChange={(e) => updateDay(day, { close: e.target.value })}
                        >
                          {TIME_SLOTS.map((t) => (
                            <option key={t} value={t}>{formatTimeLabel(t)}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Holidays ────────────────────────────────────────────────────── */}
          <div className="hours-section">
            <div className="hours-section-header">
              <h4>Holidays &amp; closed dates</h4>
              <p>Specific dates when the office is closed. The AI will refuse to book on these days.</p>
            </div>
            <div className="holidays-list">
              {holidays.length === 0 && <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.9rem" }}>No holidays added yet.</p>}
              {holidays.map((h) => (
                <div key={h.date} className="holiday-row">
                  <span className="holiday-date">{h.date}</span>
                  <span className="holiday-label">{h.label || "Holiday"}</span>
                  <button type="button" className="kb-remove-btn" onClick={() => removeHoliday(h.date)}>Remove</button>
                </div>
              ))}
            </div>
            <div className="holiday-add">
              <input
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="holiday-add-date"
              />
              <input
                type="text"
                placeholder="Label (e.g. Christmas Day)"
                value={newHolidayLabel}
                onChange={(e) => setNewHolidayLabel(e.target.value)}
                className="holiday-add-label"
              />
              <button type="button" className="button-secondary" onClick={addHoliday} disabled={!newHolidayDate}>
                + Add Holiday
              </button>
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
          <h3 className="card-section-title">What the AI can currently reference</h3>

          <div className="detail-list">
            <div className="detail-row"><span>Category</span><strong>{business.category}</strong></div>
            <div className="detail-row"><span>Medical Mode</span><strong>{business.medicalModeEnabled ? "Enabled" : "Disabled"}</strong></div>
            <div className="detail-row"><span>Email</span><strong>{business.email || "-"}</strong></div>
            <div className="detail-row"><span>Plan</span><strong>{business.selectedPlan || "-"}</strong></div>
            <div className="detail-row"><span>Billing cycle</span><strong>{business.billingCycle || "-"}</strong></div>
            <div className="detail-row"><span>Timezone</span><strong>{business.timezone || "-"}</strong></div>
          </div>

          {business.medicalModeEnabled ? (
            <div className="status-banner success">
              Medical mode is active for this business. Emergency-safe messaging and medical handling rules are enabled automatically.
            </div>
          ) : null}

          <div className="detail-block">
            <h3>Business summary</h3>
            <p>{business.description || "No summary added yet."}</p>
          </div>
          <div className="detail-block">
            <h3>Services summary</h3>
            <p>{business.servicesSummary || "No services summary added yet."}</p>
          </div>
          <div className="detail-block">
            <h3>Office hours</h3>
            <div className="stack-sm">
              {DAY_KEYS.map((day) => {
                const d = schedule[day];
                return (
                  <p key={day}>
                    {DAY_LABELS[day]}: {d.closed ? "Closed" : `${formatTimeLabel(d.open)} – ${formatTimeLabel(d.close)}`}
                  </p>
                );
              })}
              {holidays.length > 0 && (
                <>
                  <p style={{ fontWeight: 600, marginTop: 8 }}>Closed holidays:</p>
                  {holidays.map((h) => (
                    <p key={h.date}>{h.date}{h.label ? ` — ${h.label}` : ""}</p>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <PasswordChangeForm />
    </PortalShell>
  );
}
