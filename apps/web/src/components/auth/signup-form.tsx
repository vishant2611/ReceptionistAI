"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";

const categories = ["Restaurant", "Cafe", "Salon", "Clinic", "Doctor", "Dental", "Legal", "Real Estate", "Repair", "Other"];

type SignUpResponse = {
  message: string;
  business: {
    id: string;
    medicalModeEnabled: boolean;
  };
};

export function SignupForm() {
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
      businessName: String(formData.get("businessName") ?? ""),
      industryType: String(formData.get("industryType") ?? ""),
      address: String(formData.get("address") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    try {
      const response = await apiRequest<SignUpResponse>("/api/auth/signup", {
        method: "POST",
        body: payload,
      });

      setSuccess(response.message);
      router.push(`/onboarding?businessId=${response.business.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create the business account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="business-name">Business name</label>
        <input id="business-name" name="businessName" placeholder="Receptionist AI Clinic" type="text" />
      </div>

      <div className="field">
        <label htmlFor="industry-type">Industry type</label>
        <select defaultValue="" id="industry-type" name="industryType">
          <option disabled value="">
            Select one
          </option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="business-address">Address</label>
        <input id="business-address" name="address" placeholder="123 Main Street, Toronto" type="text" />
      </div>

      <div className="field">
        <label htmlFor="contact-number">Contact number</label>
        <input id="contact-number" name="phone" placeholder="+1 (555) 123-4567" type="tel" />
      </div>

      <div className="field">
        <label htmlFor="business-email">Email address</label>
        <input id="business-email" name="email" placeholder="owner@company.com" type="email" />
      </div>

      <div className="field">
        <label htmlFor="signup-password">Password</label>
        <input id="signup-password" name="password" placeholder="Create a strong password" type="password" />
      </div>

      {error ? <div className="status-banner error">{error}</div> : null}
      {success ? <div className="status-banner success">{success}</div> : null}

      <button className="button" disabled={submitting} type="submit">
        {submitting ? "Creating account..." : "Create company account"}
      </button>
    </form>
  );
}
