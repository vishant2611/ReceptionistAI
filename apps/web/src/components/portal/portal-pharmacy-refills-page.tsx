"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

type RefillRequest = {
  id: string;
  patientName: string;
  phoneNumber: string;
  medicationName: string;
  prescriptionNumber?: string;
  requestedOn: string;
  preferredPickupTime?: string;
  notes?: string;
  assignedTo?: string;
  status: string;
};

type RefillResponse = {
  requests: RefillRequest[];
  message?: string;
};

const refillStatuses = [
  "NEW",
  "UNDER_REVIEW",
  "APPROVED",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "REJECTED",
  "NEED_CALLBACK",
] as const;

function createEmptyRefillRequest(): RefillRequest {
  return {
    id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    patientName: "",
    phoneNumber: "",
    medicationName: "",
    prescriptionNumber: "",
    requestedOn: new Date().toISOString().slice(0, 10),
    preferredPickupTime: "",
    notes: "",
    assignedTo: "",
    status: "NEW",
  };
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function PortalPharmacyRefillsPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const [requests, setRequests] = useState<RefillRequest[]>([]);
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

    apiRequest<RefillResponse>(`/api/businesses/${portal.business.id}/pharmacy/refill-requests`)
      .then((response) => {
        setRequests(response.requests);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load refill requests.");
      })
      .finally(() => {
        setLoadingRequests(false);
      });
  }, [portal.business?.id, portal.isPharmacyBusiness]);

  const requestCounts = useMemo(
    () =>
      refillStatuses.map((status) => ({
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
        request.medicationName,
        request.prescriptionNumber,
        request.notes,
        request.assignedTo,
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
      const response = await apiRequest<RefillResponse>(`/api/businesses/${portal.business.id}/pharmacy/refill-requests`, {
        method: "PATCH",
        body: {
          requests,
        },
      });

      setRequests(response.requests);
      setSuccess(response.message || "Refill requests updated successfully.");
      await portal.refreshBusiness();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save refill requests.");
    } finally {
      setSaving(false);
    }
  }

  function updateRequest(id: string, field: keyof RefillRequest, value: string) {
    setRequests((current) =>
      current.map((request) => (request.id === id ? { ...request, [field]: value } : request)),
    );
  }

  function removeRequest(id: string) {
    setRequests((current) => current.filter((request) => request.id !== id));
  }

  function clearCompletedRequests() {
    setRequests((current) => current.filter((request) => request.status !== "COMPLETED"));
    setSuccess("Completed refill requests removed from the queue. Save to keep the cleanup.");
    setError("");
  }

  return (
    <PortalShell
      active="refills"
      portal={portal}
      subtitle="Patient refill requests should land here after AI calls so staff can review, approve, and mark pickup readiness without relying on raw call transcripts."
      title="Refill Requests"
    >
      {!portal.isPharmacyBusiness ? (
        <div className="status-banner neutral">This workflow appears only for pharmacy businesses.</div>
      ) : loadingRequests ? (
        <div className="status-banner neutral">Loading refill requests...</div>
      ) : (
        <section className="profile-layout">
          <div className="surface-card stack-md profile-editor-card">
            <div className="page-intro">
              <span className="eyebrow">Pharmacy mode</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Refill queue</h2>
              <p className="lead" style={{ marginTop: 10 }}>
                AI-created refill requests should appear here after patient calls. The team can then review each request and update the operational status.
              </p>
            </div>

            <div className="button-row">
              <button className="button-secondary" onClick={() => setRequests((current) => [...current, createEmptyRefillRequest()])} type="button">
                Add manual fallback request
              </button>
              <button className="button-ghost" onClick={clearCompletedRequests} type="button">
                Clear completed
              </button>
              <button className="button" disabled={saving || !portal.canManagePharmacyWorkflows} onClick={saveRequests} type="button">
                {saving ? "Saving refill queue..." : "Save refill queue"}
              </button>
            </div>

            <div className="form-grid two-col workflow-grid">
              <div className="field">
                <label htmlFor="refill-filter-status">Filter by status</label>
                <select id="refill-filter-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="ALL">All statuses</option>
                  {refillStatuses.map((status) => (
                    <option key={status} value={status}>
                      {formatStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="refill-filter-search">Search requests</label>
                <input
                  id="refill-filter-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search patient, phone, medicine, or note"
                  type="text"
                />
              </div>
            </div>

            {success ? <div className="status-banner success">{success}</div> : null}
            {error ? <div className="status-banner error">{error}</div> : null}

            <div className="workflow-list">
              {requests.length === 0 ? (
                <div className="status-banner neutral">No refill requests yet. After a patient talks to the AI about a refill, the request should appear here automatically.</div>
              ) : visibleRequests.length === 0 ? (
                <div className="status-banner neutral">No refill requests match the current filter.</div>
              ) : (
                visibleRequests.map((request) => (
                  <article key={request.id} className="workflow-card">
                    <div className="helper-row">
                      <span className="inline-badge">{formatStatusLabel(request.status)}</span>
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
                        <label>Medication name</label>
                        <input value={request.medicationName} onChange={(event) => updateRequest(request.id, "medicationName", event.target.value)} type="text" />
                      </div>
                      <div className="field">
                        <label>Prescription number</label>
                        <input value={request.prescriptionNumber || ""} onChange={(event) => updateRequest(request.id, "prescriptionNumber", event.target.value)} type="text" />
                      </div>
                      <div className="field">
                        <label>Requested on</label>
                        <input value={request.requestedOn} onChange={(event) => updateRequest(request.id, "requestedOn", event.target.value)} type="date" />
                      </div>
                      <div className="field">
                        <label>Preferred pickup time</label>
                        <input
                          value={request.preferredPickupTime || ""}
                          onChange={(event) => updateRequest(request.id, "preferredPickupTime", event.target.value)}
                          placeholder="Today after 5 PM"
                          type="text"
                        />
                      </div>
                      <div className="field">
                        <label>Assigned staff or pharmacist</label>
                        <input value={request.assignedTo || ""} onChange={(event) => updateRequest(request.id, "assignedTo", event.target.value)} type="text" />
                      </div>
                      <div className="field">
                        <label>Status</label>
                        <select value={request.status} onChange={(event) => updateRequest(request.id, "status", event.target.value)}>
                          {refillStatuses.map((status) => (
                            <option key={status} value={status}>
                              {formatStatusLabel(status)}
                            </option>
                          ))}
                        </select>
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
              <h2 className="section-title" style={{ marginTop: 14 }}>Queue snapshot</h2>
            </div>

            <section className="workflow-stats">
              {requestCounts.map((entry) => (
                <div key={entry.status} className="workflow-stat-card">
                  <span>{formatStatusLabel(entry.status)}</span>
                  <strong>{entry.count}</strong>
                </div>
              ))}
            </section>

            <div className="detail-block">
              <h3>How this helps the pharmacy team</h3>
              <p>
                Staff can tell whether a request is new, under review, approved, or ready for pickup without reopening the full call transcript.
              </p>
            </div>

            <div className="detail-block">
              <h3>How records should arrive</h3>
              <p>
                The normal flow is patient call first, then AI creates the refill request record, and staff only edits the status here afterward.
              </p>
            </div>
          </div>
        </section>
      )}
    </PortalShell>
  );
}
