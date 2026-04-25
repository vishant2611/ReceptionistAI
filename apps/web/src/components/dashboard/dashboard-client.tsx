"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { AuthSession, clearSession, getSession } from "../../lib/session";
import { TeamManagement } from "./team-management";

type DashboardData = {
  business: {
    id: string;
    name: string;
    category: string;
    email?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
    description?: string | null;
    servicesSummary?: string | null;
    priceListSummary?: string | null;
    greetingMessage?: string | null;
    voicePreference?: string | null;
    selectedPlan?: string | null;
    billingCycle?: string | null;
    onboardingCompleted: boolean;
    medicalModeEnabled: boolean;
    aiEnabled: boolean;
    timezone: string;
  };
};

type MembersResponse = {
  members: Array<{
    id: string;
    role: string;
    createdAt: string;
    user: {
      id: string;
      email: string;
      fullName?: string | null;
    };
  }>;
};

type DashboardClientProps = {
  businessId?: string;
};

const overviewCards = [
  {
    title: "AI answering",
    body: "Control when the AI answers calls, after-hours logic, and missed-ring takeover behavior.",
  },
  {
    title: "Call records",
    body: "Store summaries, transcripts, caller details, and recordings inside the business workspace.",
  },
  {
    title: "Billing and plans",
    body: "Track package, billing cycle, and later connect invoices, auto-pay, and payment status.",
  },
];

export function DashboardClient({ businessId = "" }: DashboardClientProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [members, setMembers] = useState<MembersResponse["members"]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const activeSession = getSession();
    setSession(activeSession);

    const activeBusinessId = businessId || activeSession?.business?.id;
    if (!activeBusinessId) {
      setError("No business session found. Please sign in first.");
      setLoading(false);
      return;
    }

    Promise.all([
      apiRequest<DashboardData>(`/api/businesses/${activeBusinessId}`),
      apiRequest<MembersResponse>(`/api/businesses/${activeBusinessId}/members`),
    ])
      .then(([businessResponse, membersResponse]) => {
        setData(businessResponse);
        setMembers(membersResponse.members);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard data.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [businessId]);

  const readiness = useMemo(() => {
    if (!data?.business) {
      return [];
    }

    return [
      { label: "Onboarding", value: data.business.onboardingCompleted ? "Completed" : "Pending" },
      { label: "Medical Mode", value: data.business.medicalModeEnabled ? "Enabled" : "Disabled" },
      { label: "AI Status", value: data.business.aiEnabled ? "Live" : "Not live yet" },
    ];
  }, [data]);

  const activeRole = session?.business?.role ?? "STAFF";
  const canManageTeam = activeRole === "BUSINESS_OWNER";
  const canViewBilling = activeRole === "BUSINESS_OWNER" || activeRole === "BILLING_ADMIN";
  const canEditConfiguration = activeRole === "BUSINESS_OWNER" || activeRole === "MANAGER";

  if (loading) {
    return <div className="status-banner neutral">Loading business portal...</div>;
  }

  if (error) {
    return <div className="status-banner error">{error}</div>;
  }

  if (!data?.business) {
    return <div className="status-banner neutral">No business data found yet.</div>;
  }

  return (
    <div className="stack-lg">
      <section className="hero-card">
        <div className="helper-row">
          <div>
            <span className="eyebrow">Business portal</span>
            <h1 className="display-title" style={{ fontSize: "clamp(2.1rem, 4vw, 3.8rem)", marginBottom: 12 }}>
              {data.business.name}
            </h1>
            <p className="lead" style={{ maxWidth: 680 }}>
              {data.business.description ||
                "Your first dashboard is live. From here we can keep layering call settings, logs, billing, and admin tools."}
            </p>
          </div>
          <div className="button-row">
            {canEditConfiguration ? (
              <Link className="button-secondary" href={`/onboarding?businessId=${data.business.id}`}>
                Edit onboarding
              </Link>
            ) : null}
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

      <section className="stats-row">
        {readiness.map((item) => (
          <div key={item.label} className="stat-card">
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
        <div className="stat-card">
          <strong>{members.length}</strong>
          <span>Team members</span>
        </div>
      </section>

      <section className="grid-3">
        {overviewCards
          .filter((card) => {
            if (card.title === "Billing and plans") {
              return canViewBilling;
            }

            return true;
          })
          .map((card) => (
          <article key={card.title} className="feature-card">
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
          ))}
      </section>

      <section className="grid-2">
        <div className="surface-card stack-md">
          <div className="page-intro">
            <span className="eyebrow">Profile</span>
            <h2 className="section-title" style={{ marginTop: 14 }}>
              Business details
            </h2>
          </div>
          <div className="detail-list">
            <div className="detail-row">
              <span>Category</span>
              <strong>{data.business.category}</strong>
            </div>
            <div className="detail-row">
              <span>Email</span>
              <strong>{data.business.email || "-"}</strong>
            </div>
            <div className="detail-row">
              <span>Phone</span>
              <strong>{data.business.phoneNumber || "-"}</strong>
            </div>
            <div className="detail-row">
              <span>Timezone</span>
              <strong>{data.business.timezone}</strong>
            </div>
            <div className="detail-row">
              <span>Address</span>
              <strong>{data.business.address || "-"}</strong>
            </div>
          </div>
        </div>

        <div className="surface-card stack-md">
          <div className="page-intro">
            <span className="eyebrow">Configuration</span>
            <h2 className="section-title" style={{ marginTop: 14 }}>
              Current setup
            </h2>
          </div>
          <div className="detail-list">
            <div className="detail-row">
              <span>Voice</span>
              <strong>{data.business.voicePreference || "Not set"}</strong>
            </div>
            <div className="detail-row">
              <span>Plan</span>
              <strong>{data.business.selectedPlan || "Free Trial"}</strong>
            </div>
            <div className="detail-row">
              <span>Billing cycle</span>
              <strong>{data.business.billingCycle || "Monthly"}</strong>
            </div>
            <div className="detail-row">
              <span>Greeting</span>
              <strong>{data.business.greetingMessage || "Not set yet"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-card stack-md">
        <div className="page-intro">
          <span className="eyebrow">Signed in</span>
          <h2 className="section-title" style={{ marginTop: 14 }}>
            Active session
          </h2>
        </div>
        <div className="detail-list">
          <div className="detail-row">
            <span>Portal email</span>
            <strong>{session?.email || "-"}</strong>
          </div>
          <div className="detail-row">
            <span>Role</span>
            <strong>{activeRole.replaceAll("_", " ")}</strong>
          </div>
          <div className="detail-row">
            <span>Business</span>
            <strong>{session?.business?.name || data.business.name}</strong>
          </div>
        </div>
      </section>

      {canManageTeam ? (
        <TeamManagement businessId={data.business.id} initialMembers={members} />
      ) : (
        <section className="surface-card stack-md">
          <div className="page-intro">
            <span className="eyebrow">Access</span>
            <h2 className="section-title" style={{ marginTop: 14 }}>
              Limited workspace
            </h2>
          </div>
          <div className="status-banner neutral">
            Your role is <strong>{activeRole.replaceAll("_", " ")}</strong>. Team management is reserved for the
            business owner. We will keep expanding limited-access views for each role in the next slices.
          </div>
        </section>
      )}
    </div>
  );
}
