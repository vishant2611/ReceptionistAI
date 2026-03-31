"use client";

import { FormEvent, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";

type OnboardingResponse = {
  message: string;
  business: {
    id: string;
    onboardingCompleted: boolean;
    medicalModeEnabled: boolean;
  };
};

const officeHourDefaults = [
  "Mon-Fri: 9:00 AM - 6:00 PM",
  "Saturday: 10:00 AM - 3:00 PM",
];

type OnboardingFormProps = {
  businessId?: string;
};

export function OnboardingForm({ businessId = "" }: OnboardingFormProps) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const guidance = useMemo(() => {
    if (!businessId) {
      return "Create the company account first so we know which business record to update during onboarding.";
    }

    return `Updating business record: ${businessId}`;
  }, [businessId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!businessId) {
      setError("Missing business ID. Please create the account first from the signup page.");
      return;
    }

    setSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const payload = {
      businessName: String(formData.get("businessName") ?? ""),
      industryType: String(formData.get("industryType") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
      address: String(formData.get("address") ?? ""),
      businessSummary: String(formData.get("businessSummary") ?? ""),
      servicesSummary: String(formData.get("servicesSummary") ?? ""),
      priceListSummary: String(formData.get("priceListSummary") ?? ""),
      officeHours: String(formData.get("officeHours") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      answeringRule: String(formData.get("answeringRule") ?? ""),
      greetingMessage: String(formData.get("greetingMessage") ?? ""),
      voicePreference: String(formData.get("voicePreference") ?? ""),
      selectedPlan: String(formData.get("selectedPlan") ?? ""),
      billingCycle: String(formData.get("billingCycle") ?? ""),
    };

    try {
      const response = await apiRequest<OnboardingResponse>(`/api/businesses/${businessId}/onboarding`, {
        method: "PATCH",
        body: payload,
      });

      setSuccess(
        `${response.message}${response.business.medicalModeEnabled ? " Medical Mode has been enabled automatically." : ""}`,
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save onboarding details.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack-md">
      <div className="status-banner neutral">{guidance}</div>

      <form className="form-grid two-col" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="onboard-business-name">Business name</label>
          <input id="onboard-business-name" name="businessName" placeholder="Receptionist AI Dental" type="text" />
        </div>
        <div className="field">
          <label htmlFor="onboard-industry">Industry type</label>
          <select defaultValue="" id="onboard-industry" name="industryType">
            <option disabled value="">
              Select industry
            </option>
            <option>Clinic</option>
            <option>Doctor</option>
            <option>Dental</option>
            <option>Restaurant</option>
            <option>Cafe</option>
            <option>Salon</option>
            <option>Legal</option>
            <option>Real Estate</option>
            <option>Repair</option>
            <option>Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="onboard-phone">Contact number</label>
          <input id="onboard-phone" name="phone" placeholder="+1 (555) 222-7788" type="tel" />
        </div>
        <div className="field">
          <label htmlFor="onboard-timezone">Timezone</label>
          <select defaultValue="America/Toronto" id="onboard-timezone" name="timezone">
            <option>America/Toronto</option>
            <option>America/New_York</option>
            <option>America/Chicago</option>
            <option>America/Los_Angeles</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-address">Address</label>
          <input id="onboard-address" name="address" placeholder="456 Premium Avenue, Toronto, ON" type="text" />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-summary">Business summary</label>
          <textarea
            id="onboard-summary"
            name="businessSummary"
            placeholder="Describe the services, products, and what the AI should know when speaking to callers."
          />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-services">Services summary</label>
          <textarea
            id="onboard-services"
            name="servicesSummary"
            placeholder="Haircuts, color treatments, consultations, callback requests, order handling, and FAQs."
          />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-pricing">Price or fee summary</label>
          <textarea
            id="onboard-pricing"
            name="priceListSummary"
            placeholder="Consultation: $50. Haircut: $35. Emergency visit: call clinic directly."
          />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-hours">Office hours</label>
          <textarea defaultValue={officeHourDefaults.join("\n")} id="onboard-hours" name="officeHours" />
        </div>
        <div className="field">
          <label htmlFor="onboard-answer-rule">Primary answering rule</label>
          <select defaultValue="Answer all calls" id="onboard-answer-rule" name="answeringRule">
            <option>Answer all calls</option>
            <option>Answer only after-hours</option>
            <option>Answer after 3 to 4 missed rings</option>
            <option>Answer only overflow calls</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="onboard-voice">Voice preference</label>
          <select defaultValue="Professional female" id="onboard-voice" name="voicePreference">
            <option>Professional female</option>
            <option>Warm female</option>
            <option>Professional male</option>
            <option>British female</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-greeting">Greeting message</label>
          <textarea
            id="onboard-greeting"
            name="greetingMessage"
            placeholder="Thank you for calling Receptionist AI Clinic. How may I help you today?"
          />
        </div>
        <div className="field">
          <label htmlFor="onboard-plan">Selected plan</label>
          <select defaultValue="Free Trial" id="onboard-plan" name="selectedPlan">
            <option>Free Trial</option>
            <option>Basic</option>
            <option>Silver</option>
            <option>Gold</option>
            <option>Platinum</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="onboard-cycle">Billing cycle</label>
          <select defaultValue="Monthly" id="onboard-cycle" name="billingCycle">
            <option>Monthly</option>
            <option>Quarterly</option>
            <option>Yearly</option>
          </select>
        </div>

        {error ? <div className="status-banner error" style={{ gridColumn: "1 / -1" }}>{error}</div> : null}
        {success ? <div className="status-banner success" style={{ gridColumn: "1 / -1" }}>{success}</div> : null}

        <button className="button" disabled={submitting} style={{ gridColumn: "1 / -1" }} type="submit">
          {submitting ? "Saving onboarding..." : "Save onboarding details"}
        </button>
      </form>
    </div>
  );
}
