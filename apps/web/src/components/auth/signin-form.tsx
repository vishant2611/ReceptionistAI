"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";
import { saveSession } from "../../lib/session";

type SignInResponse = {
  message: string;
  businesses: Array<{
    id: string;
    name: string;
    role: string;
    onboardingCompleted: boolean;
  }>;
};

export function SigninForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      identity: String(formData.get("identity") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    try {
      const response = await apiRequest<SignInResponse>("/api/auth/signin", {
        method: "POST",
        body: payload,
      });

      const firstBusiness = response.businesses[0];

      if (!firstBusiness) {
        setSuccess(response.message);
        return;
      }

      saveSession({
        email: payload.identity,
        business: {
          id: firstBusiness.id,
          name: firstBusiness.name,
          role: firstBusiness.role,
          onboardingCompleted: firstBusiness.onboardingCompleted,
        },
      });

      const businessLabel = ` First business: ${firstBusiness.name}.`;
      setSuccess(`${response.message}${businessLabel}`);

      router.push(`/dashboard?businessId=${firstBusiness.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="signin-identity">Username or email</label>
        <input id="signin-identity" name="identity" placeholder="company@example.com" type="text" />
      </div>
      <div className="field">
        <label htmlFor="signin-password">Password</label>
        <input id="signin-password" name="password" placeholder="Enter your password" type="password" />
      </div>
      {error ? <div className="status-banner error">{error}</div> : null}
      {success ? <div className="status-banner success">{success}</div> : null}
      <button className="button" disabled={submitting} type="submit">
        {submitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
