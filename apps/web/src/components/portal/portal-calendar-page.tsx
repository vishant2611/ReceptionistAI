"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
  connectedProvider?: string;
  errorMessage?: string;
};

type ConnectionStatus = {
  connected: boolean;
  provider: string;
  accountEmail?: string;
  accountName?: string;
  connectedAt?: string;
};

export function PortalCalendarPage({
  businessId = "",
  connectedProvider,
  errorMessage,
}: Props) {
  const portal = usePortalData(businessId);
  const business = portal.business;

  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(errorMessage || "");
  const [success, setSuccess] = useState(
    connectedProvider === "microsoft"
      ? "Microsoft Calendar connected successfully!"
      : "",
  );

  const refreshStatus = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const resp = await apiRequest<ConnectionStatus>(
        `/api/calendar/${business.id}/status`,
      );
      setStatus(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status.");
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => {
    if (business) void refreshStatus();
  }, [business, refreshStatus]);

  async function onConnect() {
    if (!business) return;
    setError("");
    setSuccess("");
    try {
      const resp = await apiRequest<{ url: string }>(
        `/api/calendar/microsoft/auth?businessId=${business.id}`,
      );
      // Redirect the entire window to Microsoft for login
      window.location.href = resp.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start connect.");
    }
  }

  async function onDisconnect() {
    if (!business) return;
    if (!confirm("Disconnect Microsoft Calendar? Future bookings won't be pushed to your calendar.")) return;
    setError("");
    setSuccess("");
    try {
      await apiRequest(`/api/calendar/${business.id}/microsoft`, { method: "DELETE" });
      setSuccess("Microsoft Calendar disconnected.");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    }
  }

  if (portal.loading) {
    return (
      <main className="app-shell">
        <section className="container">
          <div className="status-banner neutral">Loading calendar settings...</div>
        </section>
      </main>
    );
  }
  if (!business) {
    return (
      <main className="app-shell">
        <section className="container">
          <div className="status-banner neutral">No business data found.</div>
        </section>
      </main>
    );
  }

  const connected = status?.connected;

  return (
    <PortalShell
      active="calendar-integration"
      title="Calendar Integration"
      subtitle="Connect your Outlook / Microsoft 365 calendar so AI-booked appointments appear there automatically and so the AI respects your existing meetings."
      portal={portal}
    >
      <section className="portal-section">
        <div className="portal-section-header">
          <h2 className="portal-section-title">Microsoft Outlook / Teams Calendar</h2>
          <p className="portal-section-desc">
            Connect one Microsoft account. Every appointment the AI books will be added to this
            calendar with full details. Existing meetings in your calendar will also block the AI
            from double-booking.
          </p>
        </div>

        {error && <div className="status-banner error">{error}</div>}
        {success && <div className="status-banner success">{success}</div>}

        <div className="calendar-card">
          <div className="calendar-card-row">
            <div className="calendar-card-icon">📧</div>
            <div className="calendar-card-text">
              <strong>Microsoft Outlook</strong>
              {loading ? (
                <span>Checking status...</span>
              ) : connected ? (
                <span className="calendar-connected-badge">
                  ✓ Connected as <strong>{status?.accountEmail}</strong>
                </span>
              ) : (
                <span>Not connected</span>
              )}
            </div>
            <div className="calendar-card-actions">
              {connected ? (
                <button type="button" className="button-secondary" onClick={onDisconnect}>
                  Disconnect
                </button>
              ) : (
                <button type="button" className="button-primary" onClick={onConnect}>
                  Connect with Microsoft
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="detail-block" style={{ marginTop: 12 }}>
          <h3>How it works</h3>
          <p>
            When you click <strong>Connect with Microsoft</strong>, you&apos;ll be redirected to log
            in with your Microsoft account. Grant calendar permissions and you&apos;ll be returned
            here. Once connected, every appointment the AI books on a call will show in your
            Outlook / Teams calendar within seconds — with the caller&apos;s name, phone, notes, and
            (when available) a link to the call recording.
          </p>
        </div>

        <div className="detail-block">
          <h3>What you grant access to</h3>
          <p>
            <strong>Calendars.ReadWrite</strong> — Read your busy/free times so the AI doesn&apos;t
            double-book; create, update, and delete events on your behalf.
          </p>
          <p>
            <strong>offline_access</strong> — Allows Receptionist AI to refresh access tokens so you
            don&apos;t have to reconnect every hour.
          </p>
          <p>
            <strong>User.Read</strong> — Read your basic profile (so we can display which account is
            connected).
          </p>
        </div>
      </section>
    </PortalShell>
  );
}
