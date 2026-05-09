"use client";

import { FormEvent, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";

type MemberItem = {
  id: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    fullName?: string | null;
  };
};

type TeamManagementProps = {
  businessId: string;
  initialMembers: MemberItem[];
};

type MembersResponse = {
  members: MemberItem[];
};

const roleDescriptions: Record<string, string> = {
  BUSINESS_OWNER: "Full control of portal settings, team management, and business configuration.",
  MANAGER: "Operational control for day-to-day settings, call reviews, and workflow updates.",
  STAFF: "Limited access for business activity, customer requests, and selected operational views.",
  BILLING_ADMIN: "Focused access for plans, billing cycle, invoices, and payment details.",
};

export function TeamManagement({ businessId, initialMembers }: TeamManagementProps) {
  const [members, setMembers] = useState<MemberItem[]>(initialMembers);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const roles = useMemo(() => Object.keys(roleDescriptions), []);

  async function refreshMembers() {
    const response = await apiRequest<MembersResponse>(`/api/businesses/${businessId}/members`);
    setMembers(response.members);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      role: String(formData.get("role") ?? "STAFF"),
    };

    try {
      const response = await apiRequest<{ message: string }>(`/api/businesses/${businessId}/members`, {
        method: "PATCH",
        body: payload,
      });

      setSuccess(response.message);
      event.currentTarget.reset();
      await refreshMembers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add team member.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid-2">
      <div className="surface-card stack-md">
        <h3 className="card-section-title">User management</h3>

        <div className="detail-block">
          <h3>How this works</h3>
          <p>Add sub-users for operations, staff visibility, or billing access while owner controls stay protected.</p>
        </div>

        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="team-full-name">Full name</label>
            <input id="team-full-name" name="fullName" placeholder="Operations Manager" type="text" />
          </div>

          <div className="field">
            <label htmlFor="team-email">Email address</label>
            <input id="team-email" name="email" placeholder="manager@company.com" type="email" />
          </div>

          <div className="field">
            <label htmlFor="team-password">Temporary password</label>
            <input id="team-password" name="password" placeholder="Set an initial password" type="password" />
          </div>

          <div className="field">
            <label htmlFor="team-role">Role</label>
            <select defaultValue="STAFF" id="team-role" name="role">
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          {error ? <div className="status-banner error">{error}</div> : null}
          {success ? <div className="status-banner success">{success}</div> : null}

          <button className="button" disabled={submitting} type="submit">
            {submitting ? "Adding user..." : "Add sub-user"}
          </button>
        </form>
      </div>

      <div className="surface-card stack-md">
        <h3 className="card-section-title">Current team</h3>

        <div className="detail-list">
          {members.length === 0 ? (
            <div className="status-banner neutral">No sub-users have been added yet.</div>
          ) : (
            members.map((member) => (
              <div key={member.id} className="member-card">
                <div className="member-head">
                  <div>
                    <strong>{member.user.fullName || "Unnamed user"}</strong>
                    <span>{member.user.email}</span>
                  </div>
                  <span className="inline-badge">{member.role.replaceAll("_", " ")}</span>
                </div>
                <p>{roleDescriptions[member.role] || "Custom role access will be expanded in future slices."}</p>
              </div>
            ))
          )}
        </div>

        <div className="role-guide">
          <p className="role-guide-label">Role guide</p>
          {Object.entries(roleDescriptions).map(([role, desc]) => (
            <div key={role} className="role-guide-row">
              <span className="inline-badge">{role.replaceAll("_", " ")}</span>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
