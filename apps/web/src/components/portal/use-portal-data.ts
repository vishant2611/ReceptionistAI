"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { AuthSession, getSession } from "../../lib/session";

type BusinessData = {
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
    officeHours?: unknown;
    answeringRules?: unknown;
    telephonySettings?: unknown;
    menuItems?: Array<{
      name: string;
      category: string;
      description?: string;
      price?: string;
      available?: boolean;
    }>;
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

export type PortalData = {
  session: AuthSession | null;
  business: BusinessData["business"] | null;
  members: MembersResponse["members"];
  loading: boolean;
  error: string;
  role: string;
  canManageTeam: boolean;
  canViewBilling: boolean;
  canViewCallLogs: boolean;
  canManageTelephony: boolean;
  canEditConfiguration: boolean;
  refreshBusiness: () => Promise<void>;
  refreshMembers: () => Promise<void>;
};

export function usePortalData(businessId = ""): PortalData {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [business, setBusiness] = useState<BusinessData["business"] | null>(null);
  const [members, setMembers] = useState<MembersResponse["members"]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const activeRole = session?.business.role ?? "STAFF";

  async function refreshBusiness() {
    const activeBusinessId = businessId || getSession()?.business.id;
    if (!activeBusinessId) return;
    const businessResponse = await apiRequest<BusinessData>(`/api/businesses/${activeBusinessId}`);
    setBusiness(businessResponse.business);
  }

  async function refreshMembers() {
    const activeBusinessId = businessId || getSession()?.business.id;
    if (!activeBusinessId) return;
    const membersResponse = await apiRequest<MembersResponse>(`/api/businesses/${activeBusinessId}/members`);
    setMembers(membersResponse.members);
  }

  useEffect(() => {
    const activeSession = getSession();
    setSession(activeSession);

    const activeBusinessId = businessId || activeSession?.business.id;
    if (!activeBusinessId) {
      setError("No business session found. Please sign in first.");
      setLoading(false);
      return;
    }

    Promise.all([
      apiRequest<BusinessData>(`/api/businesses/${activeBusinessId}`),
      apiRequest<MembersResponse>(`/api/businesses/${activeBusinessId}/members`),
    ])
      .then(([businessResponse, membersResponse]) => {
        setBusiness(businessResponse.business);
        setMembers(membersResponse.members);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load portal data.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [businessId]);

  return useMemo(
    () => ({
      session,
      business,
      members,
      loading,
      error,
      role: activeRole,
      canManageTeam: activeRole === "BUSINESS_OWNER",
      canViewBilling: activeRole === "BUSINESS_OWNER" || activeRole === "BILLING_ADMIN",
      canViewCallLogs: activeRole === "BUSINESS_OWNER" || activeRole === "MANAGER" || activeRole === "STAFF",
      canManageTelephony: activeRole === "BUSINESS_OWNER" || activeRole === "MANAGER",
      canEditConfiguration: activeRole === "BUSINESS_OWNER" || activeRole === "MANAGER",
      refreshBusiness,
      refreshMembers,
    }),
    [session, business, members, loading, error, activeRole],
  );
}
