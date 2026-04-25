"use client";

import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";

type Props = {
  email: string;
  title?: string;
  eyebrow?: string;
};

export function PasswordChangeForm({
  email,
  title = "Change password",
  eyebrow = "Security",
}: Props) {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password must match.");
      setSaving(false);
      return;
    }

    try {
      const response = await apiRequest<{ message: string }>("/api/auth/change-password", {
        method: "POST",
        body: {
          email,
          currentPassword,
          newPassword,
        },
      });
      setSuccess(response.message);
      (event.currentTarget as HTMLFormElement).reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to change password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="surface-card stack-md" onSubmit={onSubmit}>
      <div className="page-intro">
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="section-title" style={{ marginTop: 14 }}>{title}</h2>
      </div>

      <div className="form-grid two-col">
        <div className="field">
          <label htmlFor="current-password">Current password</label>
          <input id="current-password" name="currentPassword" type="password" />
        </div>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input id="new-password" name="newPassword" minLength={8} type="password" />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" name="confirmPassword" minLength={8} type="password" />
        </div>
      </div>

      {success ? <div className="status-banner success">{success}</div> : null}
      {error ? <div className="status-banner error">{error}</div> : null}

      <div className="button-row">
        <button className="button" disabled={saving} type="submit">
          {saving ? "Updating password..." : "Update password"}
        </button>
      </div>
    </form>
  );
}
