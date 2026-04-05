"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Props = {
  businessId?: string;
};

type CallItem = {
  id: string;
  status: string;
  direction: string;
  callerName?: string | null;
  callerNumber?: string | null;
  callerEmail?: string | null;
  summary?: string | null;
  transcript?: string | null;
  recordingUrl?: string | null;
  startedAt: string;
  endedAt?: string | null;
};

type CallsResponse = {
  calls: CallItem[];
};

function formatCallTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getPlaybackUrl(callId: string, recordingUrl?: string | null) {
  if (!recordingUrl) {
    return "";
  }

  return `${API_URL}/api/telephony/recordings/${callId}`;
}

export function PortalCallLogsPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [callsError, setCallsError] = useState("");

  useEffect(() => {
    if (!portal.business?.id || !portal.canViewCallLogs) {
      setCallsLoading(false);
      return;
    }

    setCallsLoading(true);
    setCallsError("");

    apiRequest<CallsResponse>(`/api/businesses/${portal.business.id}/calls`)
      .then((response) => {
        setCalls(response.calls);
      })
      .catch((requestError) => {
        setCallsError(requestError instanceof Error ? requestError.message : "Unable to load call logs.");
      })
      .finally(() => {
        setCallsLoading(false);
      });
  }, [portal.business?.id, portal.canViewCallLogs]);

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading call logs...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!portal.business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  return (
    <PortalShell
      active="calls"
      portal={portal}
      subtitle="Review AI-handled calls, caller details, summaries, transcripts, and recordings in one operational log."
      title="Call Logs"
    >
      {!portal.canViewCallLogs ? (
        <div className="status-banner neutral">Your role does not have access to call logs.</div>
      ) : callsLoading ? (
        <div className="status-banner neutral">Loading call records...</div>
      ) : callsError ? (
        <div className="status-banner error">{callsError}</div>
      ) : (
        <section className="surface-card stack-md">
          <div className="page-intro">
            <span className="eyebrow">Operations</span>
            <h2 className="section-title" style={{ marginTop: 14 }}>Recent AI-handled calls</h2>
            <p className="lead" style={{ marginTop: 10 }}>
              Review the latest caller intent, the assistant reply, and the transcript captured during the conversation.
            </p>
          </div>

          <div className="call-log-table">
            <div className="call-log-head">
              <span>Timestamp</span>
              <span>Caller</span>
              <span>Contact</span>
              <span>Status</span>
              <span>Summary</span>
              <span>Transcript</span>
            </div>

            {calls.length === 0 ? (
              <div className="status-banner neutral">No call records available yet.</div>
            ) : (
              calls.map((call) => (
                <article key={call.id} className="call-log-row">
                  <div>
                    <strong>{formatCallTime(call.startedAt)}</strong>
                    <span>{call.direction}</span>
                  </div>
                  <div>
                    <strong>{call.callerName || "Unknown caller"}</strong>
                    <span>{call.callerEmail || "No email captured"}</span>
                  </div>
                  <div>
                    <strong>{call.callerNumber || "No phone captured"}</strong>
                    {call.recordingUrl ? (
                      <div className="call-recording-block">
                        <a
                          className="call-recording-link"
                          href={getPlaybackUrl(call.id, call.recordingUrl)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Listen to recording
                        </a>
                        <audio controls preload="none" src={getPlaybackUrl(call.id, call.recordingUrl)}>
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    ) : (
                      <span>No recording link</span>
                    )}
                  </div>
                  <div>
                    <span className="inline-badge">{formatStatusLabel(call.status)}</span>
                  </div>
                  <div>
                    <p>{call.summary || "No summary recorded."}</p>
                  </div>
                  <div>
                    <p className="transcript-text">{call.transcript || "No transcript recorded."}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </PortalShell>
  );
}
