"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { getSession } from "../../lib/session";

type OnboardingResponse = {
  message: string;
  business: {
    id: string;
    onboardingCompleted: boolean;
    medicalModeEnabled: boolean;
  };
};

type BusinessResponse = {
  business: {
    id: string;
    name: string;
    category: string;
    phoneNumber?: string | null;
    address?: string | null;
    description?: string | null;
    servicesSummary?: string | null;
    priceListSummary?: string | null;
    officeHours?: unknown;
    greetingMessage?: string | null;
    voicePreference?: string | null;
    selectedPlan?: string | null;
    billingCycle?: string | null;
    timezone: string;
  };
};

type OnboardingFormProps = {
  businessId?: string;
};

export function OnboardingForm({ businessId = "" }: OnboardingFormProps) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialValues, setInitialValues] = useState({
    businessName: "",
    industryType: "",
    phone: "",
    timezone: "America/Toronto",
    address: "",
    businessSummary: "",
    servicesSummary: "",
    priceListSummary: "",
    officeHours: "",
    answeringRule: "Answer all calls",
    greetingMessage: "",
    voicePreference: "Professional female",
    selectedPlan: "Free Trial",
    billingCycle: "Monthly",
  });

  const activeBusinessId = businessId || getSession()?.business?.id || "";

  useEffect(() => {
    if (!activeBusinessId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    apiRequest<BusinessResponse>(`/api/businesses/${activeBusinessId}`)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const business = response.business;
        const officeHours = Array.isArray(business.officeHours)
          ? business.officeHours.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          : [];

        setInitialValues({
          businessName: business.name || "",
          industryType: business.category ? business.category.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) : "",
          phone: business.phoneNumber || "",
          timezone: business.timezone || "America/Toronto",
          address: business.address || "",
          businessSummary: business.description || "",
          servicesSummary: business.servicesSummary || "",
          priceListSummary: business.priceListSummary || "",
          officeHours: officeHours.join("\n"),
          answeringRule: "Answer all calls",
          greetingMessage: business.greetingMessage || "",
          voicePreference: business.voicePreference || "Professional female",
          selectedPlan: business.selectedPlan || "Free Trial",
          billingCycle: business.billingCycle || "Monthly",
        });
      })
      .catch((requestError) => {
        if (cancelled) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Unable to load onboarding details.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeBusinessId]);

  const guidance = useMemo(() => {
    if (!activeBusinessId) {
      return "Create the company account first so we know which business record to update during onboarding.";
    }

    return `Updating business record: ${activeBusinessId}`;
  }, [activeBusinessId]);

  const formKey = useMemo(
    () =>
      [
        activeBusinessId,
        initialValues.businessName,
        initialValues.industryType,
        initialValues.phone,
        initialValues.address,
      ].join(":"),
    [activeBusinessId, initialValues.address, initialValues.businessName, initialValues.industryType, initialValues.phone],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!activeBusinessId) {
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
      const response = await apiRequest<OnboardingResponse>(`/api/businesses/${activeBusinessId}/onboarding`, {
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

      {loading ? <div className="status-banner neutral">Loading saved business details...</div> : null}

      {loading ? null : (
      <form key={formKey} className="form-grid two-col" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="onboard-business-name">Business name</label>
          <input defaultValue={initialValues.businessName} id="onboard-business-name" name="businessName" placeholder="Healthcare Pharmacy" type="text" />
        </div>
        <div className="field">
          <label htmlFor="onboard-industry">Industry type</label>
          <select defaultValue={initialValues.industryType} id="onboard-industry" name="industryType">
            <option disabled value="">
              Select industry
            </option>
            <option>Clinic</option>
            <option>Doctor</option>
            <option>Dental</option>
            <option>Pharmacy</option>
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
          <input defaultValue={initialValues.phone} id="onboard-phone" name="phone" placeholder="+1 (555) 222-7788" type="tel" />
        </div>
        <div className="field">
          <label htmlFor="onboard-timezone">Timezone</label>
          <select defaultValue={initialValues.timezone} id="onboard-timezone" name="timezone">
            <option>America/Toronto</option>
            <option>America/New_York</option>
            <option>America/Chicago</option>
            <option>America/Los_Angeles</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-address">Address</label>
          <input defaultValue={initialValues.address} id="onboard-address" name="address" placeholder="456 Premium Avenue, Toronto, ON" type="text" />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-summary">Business summary</label>
          <textarea
            defaultValue={initialValues.businessSummary}
            id="onboard-summary"
            name="businessSummary"
            placeholder="Describe the services, products, and what the AI should know when speaking to callers."
          />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-services">Services summary</label>
          <textarea
            defaultValue={initialValues.servicesSummary}
            id="onboard-services"
            name="servicesSummary"
            placeholder="Prescription refill requests, pharmacist callback requests, pickup questions, store hours, and general pharmacy support."
          />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-pricing">Price or fee summary</label>
          <textarea
            defaultValue={initialValues.priceListSummary}
            id="onboard-pricing"
            name="priceListSummary"
            placeholder="List any consultation fees, delivery fees, blister pack fees, or other pharmacy service charges if applicable."
          />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-hours">Office hours</label>
          <textarea defaultValue={initialValues.officeHours} id="onboard-hours" name="officeHours" placeholder="Leave blank if you haven't added office hours yet." />
        </div>
        <div className="field">
          <label htmlFor="onboard-answer-rule">Primary answering rule</label>
          <select defaultValue={initialValues.answeringRule} id="onboard-answer-rule" name="answeringRule">
            <option>Answer all calls</option>
            <option>Answer only after-hours</option>
            <option>Answer after 3 to 4 missed rings</option>
            <option>Answer only overflow calls</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="onboard-voice">Voice preference</label>
          <select defaultValue={initialValues.voicePreference} id="onboard-voice" name="voicePreference">
            <option>Professional female</option>
            <option>Warm female</option>
            <option>Professional male</option>
            <option>British female</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="onboard-greeting">Greeting message</label>
          <textarea
            defaultValue={initialValues.greetingMessage}
            id="onboard-greeting"
            name="greetingMessage"
            placeholder="Thank you for calling Receptionist AI Clinic. How may I help you today?"
          />
        </div>
        <div className="field">
          <label htmlFor="onboard-plan">Selected plan</label>
          <select defaultValue={initialValues.selectedPlan} id="onboard-plan" name="selectedPlan">
            <option>Free Trial</option>
            <option>Basic</option>
            <option>Silver</option>
            <option>Gold</option>
            <option>Platinum</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="onboard-cycle">Billing cycle</label>
          <select defaultValue={initialValues.billingCycle} id="onboard-cycle" name="billingCycle">
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
      )}
    </div>
  );
}
