"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

type CallbackRequest = {
  id: string;
  patientName: string;
  phoneNumber: string;
  reason: string;
  notes?: string;
  requestedOn: string;
  priority: string;
  assignedTo?: string;
  lastAttemptAt?: string;
  status: string;
};

type CallbackResponse = {
  requests: CallbackRequest[];
  message?: string;
};

const callbackStatuses = ["NEW", "ASSIGNED", "PENDING_CALLBACK", "CALLED", "COMPLETED", "UNABLE_TO_REACH"] as const;
const callbackPriorities = ["NORMAL", "URGENT"] as const;

function createEmptyCallbackRequest(): CallbackRequest {
  return {
    id: `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    patientName: "",
    phoneNumber: "",
    reason: "",
    notes: "",
    requestedOn: new Date().toISOString().slice(0, 10),
    priority: "NORMAL",
    assignedTo: "",
    lastAttemptAt: "",
    status: "NEW",
  };
}

function formatLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function PortalPharmacyCallbacksPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const [requests, setRequests] = useState<CallbackRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!portal.business?.id || !portal.isPharmacyBusiness) {
      setLoadingRequests(false);
      return;
    }

    setLoadingRequests(true);
    setError("");

    apiRequest<CallbackResponse>(`/api/businesses/${portal.business.id}/pharmacy/callback-requests`)
      .then((response) => {
        setRequests(response.requests);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load callback requests.");
      })
      .finally(() => {
        setLoadingRequests(false);
      });
  }, [portal.business?.id, portal.isPharmacyBusiness]);

  const requestCounts = useMemo(
    () =>
      callbackStatuses.map((status) => ({
        status,
        count: requests.filter((request) => request.status === status).length,
      })),
    [requests],
  );

  const visibleRequests = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesStatus = statusFilter === "ALL" || request.status === statusFilter;
      const haystack = [
        request.patientName,
        request.phoneNumber,
        request.reason,
        request.notes,
        request.assignedTo,
        request.lastAttemptAt,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [requests, searchTerm, statusFilter]);

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading pharmacy portal...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!portal.business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  async function saveRequests() {
    if (!portal.business?.id) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await apiRequest<CallbackResponse>(`/api/businesses/${portal.business.id}/pharmacy/callback-requests`, {
        method: "PATCH",
        body: {
          requests,
        },
      });

      setRequests(response.requests);
      setSuccess(response.message || "Callback requests updated successfully.");
      await portal.refreshBusiness();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save callback requests.");
    } finally {
      setSaving(false);
    }
  }

  function updateRequest(id: string, field: keyof CallbackRequest, value: string) {
    setRequests((current) =>
      current.map((request) => (request.id === id ? { ...request, [field]: value } : request)),
    );
  }

  function removeRequest(id: string) {
    setRequests((current) => current.filter((request) => request.id !== id));
  }

  function clearCompletedRequests() {
    setRequests((current) => current.filter((request) => request.status !== "COMPLETED"));
    setSuccess("Completed callback requests removed from the queue. Save to keep the cleanup.");
    setError("");
  }

  return (
    <PortalShell
      active="callbacks"
      portal={portal}
      subtitle="Patient callback requests should land here after AI calls so staff always know who still needs a pharmacist response and which requests are urgent."
      title="Callback Requests"
    >
      {!portal.isPharmacyBusiness ? (
        <div className="status-banner neutral">This workflow appears only for pharmacy businesses.</div>
      ) : loadingRequests ? (
        <div className="status-banner neutral">Loading callback requests...</div>
      ) : (
        <section className="profile-layout">
          <div className="surface-card stack-md profile-editor-card">
            <div className="page-intro">
              <span className="eyebrow">Pharmacy mode</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Pharmacist callback queue</h2>
              <p className="lead" style={{ marginTop: 10 }}>
                AI-created callback requests should appear here after patient calls. The team can then track who still needs a response and whether follow-up happened.
              </p>
            </div>

            <div className="button-row">
              <button className="button-secondary" onClick={() => setRequests((current) => [...current, createEmptyCallbackRequest()])} type="button">
                Add manual fallback request
              </button>
              <button className="button-ghost" onClick={clearCompletedRequests} type="button">
                Clear completed
              </button>
              <button className="button" disabled={saving || !portal.canManagePharmacyWorkflows} onClick={saveRequests} type="button">
                {saving ? "Saving callback queue..." : "Save callback queue"}
              </button>
            </div>

            <div className="form-grid two-col workflow-grid">
              <div className="field">
                <label htmlFor="callback-filter-status">Filter by status</label>
                <select id="callback-filter-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="ALL">All statuses</option>
                  {callbackStatuses.map((status) => (
                    <option key={status} value={status}>
                      {formatLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="callback-filter-search">Search requests</label>
                <input
                  id="callback-filter-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search patient, phone, reason, or note"
                  type="text"
                />
              </div>
            </div>

            {success ? <div className="status-banner success">{success}</div> : null}
            {error ? <div className="status-banner error">{error}</div> : null}

            <div className="workflow-list">
              {requests.length === 0 ? (
                <div className="status-banner neutral">No callback requests yet. After a patient asks the AI for a pharmacist callback, the request should appear here automatically.</div>
              ) : visibleRequests.length === 0 ? (
                <div className="status-banner neutral">No callback requests match the current filter.</div>
              ) : (
                visibleRequests.map((request) => (
                  <article key={request.id} className="workflow-card">
                    <div className="helper-row">
                      <div className="inline-badges">
                        <span className="inline-badge">{formatLabel(request.status)}</span>
                        <span className="inline-badge">{formatLabel(request.priority)}</span>
                      </div>
                      <button className="button-ghost" onClick={() => removeRequest(request.id)} type="button">
                        Remove
                      </button>
                    </div>

                    <div className="form-grid two-col workflow-grid">
                      <div className="field">
                        <label>Patient name</label>
                        <input value={request.patientName} onChange={(event) => updateRequest(request.id, "patientName", event.target.value)} type="text" />
                      </div>
                      <div className="field">
                        <label>Phone number</label>
                        <input value={request.phoneNumber} onChange={(event) => updateRequest(request.id, "phoneNumber", event.target.value)} type="tel" />
                      </div>
                      <div className="field">
                        <label>Requested on</label>
                        <input value={request.requestedOn} onChange={(event) => updateRequest(request.id, "requestedOn", event.target.value)} type="date" />
                      </div>
                      <div className="field">
                        <label>Assigned pharmacist</label>
                        <input value={request.assignedTo || ""} onChange={(event) => updateRequest(request.id, "assignedTo", event.target.value)} type="text" />
                      </div>
                      <div className="field">
                        <label>Priority</label>
                        <select value={request.priority} onChange={(event) => updateRequest(request.id, "priority", event.target.value)}>
                          {callbackPriorities.map((priority) => (
                            <option key={priority} value={priority}>
                              {formatLabel(priority)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Status</label>
                        <select value={request.status} onChange={(event) => updateRequest(request.id, "status", event.target.value)}>
                          {callbackStatuses.map((status) => (
                            <option key={status} value={status}>
                              {formatLabel(status)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Last callback attempt</label>
                        <input
                          value={request.lastAttemptAt || ""}
                          onChange={(event) => updateRequest(request.id, "lastAttemptAt", event.target.value)}
                          placeholder="Apr 11, 4:30 PM"
                          type="text"
                        />
                      </div>
                      <div className="field" style={{ gridColumn: "1 / -1" }}>
                        <label>Reason for callback</label>
                        <input value={request.reason} onChange={(event) => updateRequest(request.id, "reason", event.target.value)} type="text" />
                      </div>
                      <div className="field" style={{ gridColumn: "1 / -1" }}>
                        <label>Notes</label>
                        <textarea value={request.notes || ""} onChange={(event) => updateRequest(request.id, "notes", event.target.value)} />
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="surface-card stack-md profile-snapshot-card">
            <div className="page-intro">
              <span className="eyebrow">Live status</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Callback snapshot</h2>
            </div>

            <section className="workflow-stats">
              {requestCounts.map((entry) => (
                <div key={entry.status} className="workflow-stat-card">
                  <span>{formatLabel(entry.status)}</span>
                  <strong>{entry.count}</strong>
                </div>
              ))}
            </section>

            <div className="detail-block">
              <h3>What this solves</h3>
              <p>
                When a patient calls back, the team can immediately see whether the pharmacist has already called, whether the request is still pending, or whether nobody has tried yet.
              </p>
            </div>

            <div className="detail-block">
              <h3>Next safety step</h3>
              <p>
                The normal flow is patient call first, then AI creates the callback request record, and staff updates the status here after follow-up.
              </p>
            </div>
          </div>
        </section>
      )}
    </PortalShell>
  );
}
