"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = { businessId?: string };

type AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

type Appointment = {
  id: string;
  businessId: string;
  callId: string | null;
  title: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceName: string | null;
  notes: string | null;
  startTime: string;
  durationMinutes: number;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
  call?: {
    id: string;
    recordingUrl: string | null;
    transcript: string | null;
    summary: string | null;
    startedAt: string;
  } | null;
};

type ViewMode = "month" | "list";

const STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NO_SHOW", label: "No Show" },
];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDateLocalInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

function formatTime12(date: Date) {
  let hours = date.getHours();
  const mins = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${mins} ${ampm}`;
}

function formatDateLong(date: Date) {
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const cells: { date: Date; inMonth: boolean }[] = [];

  // Previous month days to fill first row
  if (startDayOfWeek > 0) {
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        inMonth: false,
      });
    }
  }

  // This month days
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }

  // Fill to complete the last row (multiple of 7)
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({
      date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
      inMonth: false,
    });
  }

  return cells;
}

function statusBadgeClass(status: AppointmentStatus) {
  return `appt-status appt-status-${status.toLowerCase()}`;
}

function emptyDraft(startDate: Date): AppointmentFormState {
  return {
    title: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    serviceName: "",
    notes: "",
    startTime: formatDateLocalInput(startDate),
    durationMinutes: 30,
    status: "SCHEDULED",
  };
}

type AppointmentFormState = {
  title: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceName: string;
  notes: string;
  startTime: string;
  durationMinutes: number;
  status: AppointmentStatus;
};

export function PortalAppointmentsPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const business = portal.business;

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [draft, setDraft] = useState<AppointmentFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const refreshAppointments = useCallback(async () => {
    if (!business) return;
    setLoadingAppts(true);
    setLoadError("");
    try {
      // Load a wide range — 3 months back and forward
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0, 23, 59, 59);
      const params = new URLSearchParams({
        start: monthStart.toISOString(),
        end: monthEnd.toISOString(),
      });
      const response = await apiRequest<{ appointments: Appointment[] }>(
        `/api/businesses/${business.id}/appointments?${params.toString()}`,
      );
      setAppointments(response.appointments);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load appointments.");
    } finally {
      setLoadingAppts(false);
    }
  }, [business, cursor]);

  useEffect(() => {
    if (business) {
      void refreshAppointments();
    }
  }, [business, refreshAppointments]);

  // ── Memoized derived data (must come BEFORE early returns) ────────────────────
  const apptsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const d = new Date(a.startTime);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [appointments]);

  const monthCells = useMemo(
    () => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );

  const sortedAppts = useMemo(() => {
    return [...appointments].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }, [appointments]);

  if (portal.loading)
    return (
      <main className="app-shell">
        <section className="container">
          <div className="status-banner neutral">Loading appointments...</div>
        </section>
      </main>
    );
  if (portal.error)
    return (
      <main className="app-shell">
        <section className="container">
          <div className="status-banner error">{portal.error}</div>
        </section>
      </main>
    );
  if (!business)
    return (
      <main className="app-shell">
        <section className="container">
          <div className="status-banner neutral">No business data found.</div>
        </section>
      </main>
    );

  // ── Date Helpers ─────────────────────────────────────────────────────────────
  function prevMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  }
  function goToday() {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  function openCreate(forDate?: Date) {
    const target = forDate ?? new Date();
    // Default to top of next hour
    target.setMinutes(0, 0, 0);
    target.setHours(target.getHours() + (forDate ? 9 : 1));
    if (forDate) {
      target.setHours(9, 0, 0, 0);
    }
    setEditingAppt(null);
    setDraft(emptyDraft(target));
    setFormError("");
    setFormSuccess("");
  }

  function openEdit(appt: Appointment) {
    setEditingAppt(appt);
    setDraft({
      title: appt.title,
      customerName: appt.customerName ?? "",
      customerPhone: appt.customerPhone ?? "",
      customerEmail: appt.customerEmail ?? "",
      serviceName: appt.serviceName ?? "",
      notes: appt.notes ?? "",
      startTime: formatDateLocalInput(new Date(appt.startTime)),
      durationMinutes: appt.durationMinutes,
      status: appt.status,
    });
    setFormError("");
    setFormSuccess("");
  }

  function closeModal() {
    setDraft(null);
    setEditingAppt(null);
    setFormError("");
    setFormSuccess("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !business) return;
    setSaving(true);
    setFormError("");
    setFormSuccess("");
    try {
      const payload = {
        title: draft.title.trim(),
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        customerEmail: draft.customerEmail,
        serviceName: draft.serviceName,
        notes: draft.notes,
        startTime: new Date(draft.startTime).toISOString(),
        durationMinutes: draft.durationMinutes,
        status: draft.status,
      };
      if (editingAppt) {
        await apiRequest(`/api/businesses/${business.id}/appointments/${editingAppt.id}`, {
          method: "PATCH",
          body: payload,
        });
        setFormSuccess("Appointment updated.");
      } else {
        await apiRequest(`/api/businesses/${business.id}/appointments`, {
          method: "POST",
          body: payload,
        });
        setFormSuccess("Appointment created.");
      }
      await refreshAppointments();
      setTimeout(() => closeModal(), 700);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function onCancelAppt() {
    if (!editingAppt || !business) return;
    if (!confirm("Cancel this appointment? This cannot be undone.")) return;
    setSaving(true);
    try {
      await apiRequest(`/api/businesses/${business.id}/appointments/${editingAppt.id}`, {
        method: "DELETE",
      });
      await refreshAppointments();
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return (
    <PortalShell
      active="appointments"
      title="Appointments"
      subtitle="View, create, and manage every appointment your AI books — plus manual ones you add."
      portal={portal}
    >
      {/* Toolbar */}
      <div className="appt-toolbar">
        <div className="appt-toolbar-left">
          <button type="button" className="appt-nav-btn" onClick={prevMonth} aria-label="Previous month">&lsaquo;</button>
          <h2 className="appt-month-label">{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</h2>
          <button type="button" className="appt-nav-btn" onClick={nextMonth} aria-label="Next month">&rsaquo;</button>
          <button type="button" className="appt-today-btn" onClick={goToday}>Today</button>
        </div>
        <div className="appt-toolbar-right">
          <div className="appt-view-toggle">
            <button type="button" className={`appt-view-btn${view === "month" ? " active" : ""}`} onClick={() => setView("month")}>Month</button>
            <button type="button" className={`appt-view-btn${view === "list" ? " active" : ""}`} onClick={() => setView("list")}>List</button>
          </div>
          <button type="button" className="button-primary" onClick={() => openCreate()}>+ New Appointment</button>
        </div>
      </div>

      {loadError && <div className="status-banner error">{loadError}</div>}

      {/* MONTH VIEW */}
      {view === "month" && (
        <div className="appt-calendar">
          <div className="appt-week-header">
            {DAY_LABELS.map((d) => (
              <div key={d} className="appt-week-day-label">{d}</div>
            ))}
          </div>
          <div className="appt-month-grid">
            {monthCells.map((cell, idx) => {
              const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
              const dayAppts = apptsByDate.get(key) ?? [];
              const isToday = isSameDay(cell.date, today);
              return (
                <div
                  key={idx}
                  className={`appt-day-cell${cell.inMonth ? "" : " out-of-month"}${isToday ? " today" : ""}`}
                  onClick={() => openCreate(new Date(cell.date))}
                >
                  <div className="appt-day-number">{cell.date.getDate()}</div>
                  <div className="appt-day-events">
                    {dayAppts.slice(0, 3).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={`appt-day-event ${statusBadgeClass(a.status)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(a);
                        }}
                      >
                        <span className="appt-day-event-time">{formatTime12(new Date(a.startTime))}</span>
                        <span className="appt-day-event-title">{a.title}</span>
                      </button>
                    ))}
                    {dayAppts.length > 3 && (
                      <span className="appt-day-event-more">+{dayAppts.length - 3} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {view === "list" && (
        <div className="appt-list">
          {loadingAppts && <div className="status-banner neutral">Loading appointments...</div>}
          {!loadingAppts && sortedAppts.length === 0 && (
            <div className="status-banner neutral">No appointments yet. Click &quot;+ New Appointment&quot; to create one.</div>
          )}
          {sortedAppts.map((a) => {
            const d = new Date(a.startTime);
            return (
              <button key={a.id} type="button" className="appt-list-row" onClick={() => openEdit(a)}>
                <div className="appt-list-date">
                  <strong>{d.toLocaleDateString("en-CA", { day: "numeric" })}</strong>
                  <span>{d.toLocaleDateString("en-CA", { month: "short" }).toUpperCase()}</span>
                </div>
                <div className="appt-list-main">
                  <h4>{a.title}</h4>
                  <p>{formatTime12(d)} · {a.durationMinutes} min · {a.customerName || "—"} {a.customerPhone ? `· ${a.customerPhone}` : ""}</p>
                </div>
                <span className={statusBadgeClass(a.status)}>{a.status.replace("_", " ")}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* MODAL */}
      {draft && (
        <div className="appt-modal-backdrop" onClick={closeModal}>
          <div className="appt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="appt-modal-header">
              <h2 className="card-section-title">{editingAppt ? "Edit appointment" : "New appointment"}</h2>
              <button type="button" className="appt-modal-close" onClick={closeModal} aria-label="Close">×</button>
            </div>
            <form onSubmit={onSubmit} className="appt-modal-body">
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input
                  className="form-input"
                  required
                  placeholder="e.g. Consultation with John Smith"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>

              <div className="kb-two-col">
                <div className="form-group">
                  <label className="form-label">Date & Time *</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    required
                    value={draft.startTime}
                    onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Duration (min)</label>
                  <div className="appt-duration-row">
                    {DURATION_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`appt-duration-chip${draft.durationMinutes === preset ? " selected" : ""}`}
                        onClick={() => setDraft({ ...draft, durationMinutes: preset })}
                      >
                        {preset}
                      </button>
                    ))}
                    <input
                      type="number"
                      className="form-input appt-duration-custom"
                      min={5}
                      max={720}
                      value={draft.durationMinutes}
                      onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="kb-two-col">
                <div className="form-group">
                  <label className="form-label">Customer name</label>
                  <input
                    className="form-input"
                    placeholder="John Smith"
                    value={draft.customerName}
                    onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Customer phone</label>
                  <input
                    className="form-input"
                    placeholder="+1 555 123 4567"
                    value={draft.customerPhone}
                    onChange={(e) => setDraft({ ...draft, customerPhone: e.target.value })}
                  />
                </div>
              </div>

              <div className="kb-two-col">
                <div className="form-group">
                  <label className="form-label">Customer email</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="customer@example.com"
                    value={draft.customerEmail}
                    onChange={(e) => setDraft({ ...draft, customerEmail: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Service / Type</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Strategy Session"
                    value={draft.serviceName}
                    onChange={(e) => setDraft({ ...draft, serviceName: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as AppointmentStatus })}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Anything important about the appointment..."
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </div>

              {editingAppt?.call && (
                <div className="appt-call-info">
                  <strong>📞 Linked Call</strong>
                  {editingAppt.call.summary && <p><em>Summary:</em> {editingAppt.call.summary}</p>}
                  {editingAppt.call.recordingUrl && (
                    <p>
                      <a href={editingAppt.call.recordingUrl} target="_blank" rel="noopener noreferrer">
                        🎙️ Play recording
                      </a>
                    </p>
                  )}
                </div>
              )}

              {formError && <div className="status-banner error">{formError}</div>}
              {formSuccess && <div className="status-banner success">{formSuccess}</div>}

              <div className="appt-modal-footer">
                {editingAppt && (
                  <button type="button" className="kb-remove-btn" onClick={onCancelAppt} disabled={saving}>
                    Delete
                  </button>
                )}
                <button type="button" className="button-secondary" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="button-primary" disabled={saving}>
                  {saving ? "Saving..." : editingAppt ? "Save changes" : "Create appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
