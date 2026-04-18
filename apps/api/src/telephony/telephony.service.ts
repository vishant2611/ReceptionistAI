import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { CallStatus } from "@prisma/client";
import { URL } from "node:url";
import { PrismaService } from "../prisma/prisma.service";
import WebSocket from "ws";

type TwilioInboundPayload = {
  CallSid?: string;
  From?: string;
  To?: string;
  CallerName?: string;
};

type TwilioRecordingPayload = {
  CallSid?: string;
  From?: string;
  RecordingUrl?: string;
  RecordingDuration?: string;
  Digits?: string;
  TranscriptionText?: string;
  TranscriptionStatus?: string;
};

type TwilioSpeechPayload = {
  CallSid?: string;
  From?: string;
  SpeechResult?: string;
  Confidence?: string;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function readRules(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readTelephonySettings(value: unknown) {
  const rules = readRules(value);
  const telephony = rules.telephony;
  return telephony && typeof telephony === "object" && !Array.isArray(telephony)
    ? (telephony as Record<string, unknown>)
    : {};
}

function inferBaseUrl(headers: Record<string, string | string[] | undefined>) {
  const protoHeader = headers["x-forwarded-proto"];
  const hostHeader = headers["x-forwarded-host"] ?? headers.host;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto || "http"}://${host}`;
}

function getTwilioPlaybackUrls(recordingUrl: string) {
  const trimmed = recordingUrl.trim();

  if (!trimmed) {
    return [];
  }

  if (/^https:\/\/api\.twilio\.com\/.+\/Recordings\/[^./?]+$/i.test(trimmed)) {
    return [`${trimmed}.mp3`, `${trimmed}.wav`, trimmed];
  }

  return [trimmed];
}

async function fetchTwilioRecordingWithRedirects(url: string, authHeader: string, redirectCount = 0): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${authHeader}`,
    },
    redirect: "manual",
  });

  if (![301, 302, 303, 307, 308].includes(response.status) || redirectCount >= 3) {
    return response;
  }

  const location = response.headers.get("location");

  if (!location) {
    return response;
  }

  const nextUrl = new URL(location, url).toString();
  const currentHost = new URL(url).host;
  const nextHost = new URL(nextUrl).host;

  if (currentHost !== nextHost) {
    return fetch(nextUrl, {
      redirect: "manual",
    });
  }

  return fetchTwilioRecordingWithRedirects(nextUrl, authHeader, redirectCount + 1);
}

function normalizeText(value: string) {
  return value.toLowerCase();
}

function mapVoicePreferenceToRealtimeVoice(voicePreference: string | null | undefined) {
  const value = normalizeText(voicePreference || "");

  if (value.includes("male")) {
    return "ash";
  }

  if (value.includes("british")) {
    return "verse";
  }

  if (value.includes("professional")) {
    return "coral";
  }

  return "coral";
}

function formatCurrentBusinessDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date());
}

function formatOfficeHours(officeHours: unknown) {
  if (!Array.isArray(officeHours)) {
    return "";
  }

  return officeHours
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .join(", ");
}

function buildRealtimeSummary(callerTurns: string[], assistantTurns: string[] = []) {
  const structuredSummary = extractStructuredSummary(callerTurns, assistantTurns);

  if (structuredSummary) {
    return structuredSummary;
  }

  const meaningfulTurns = callerTurns.filter((turn) => !isLowQualityEnglishTranscript(turn));
  const summaryTurns = meaningfulTurns.filter(isHighSignalSummaryTurn);
  const activeTurns = summaryTurns.length > 0 ? summaryTurns : meaningfulTurns;

  if (activeTurns.length === 0) {
    return "Realtime AI handled the inbound call.";
  }

  if (activeTurns.length === 1) {
    return `Caller asked about: ${activeTurns[0].slice(0, 140)}.`;
  }

  return `Caller discussed ${activeTurns.length} topics, including: ${activeTurns
    .slice(-2)
    .map((turn) => turn.slice(0, 70))
    .join(" | ")}.`;
}

function extractCallerTranscriptLines(transcript: string | null | undefined) {
  return String(transcript ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("Caller:"))
    .map((line) => line.replace(/^Caller:\s*/i, "").trim())
    .filter(Boolean);
}

function firstMatchingCallerLine(lines: string[], expression: RegExp) {
  return lines.find((line) => expression.test(line)) || "";
}

function findMedicationCallerLine(lines: string[]) {
  return (
    lines.find((line) => /\b\d+\s*(?:mg|mcg|ml)\b/i.test(line) && /(order|refill|prescription|medicine|medication|it'?s|it is)/i.test(line)) ||
    lines.find((line) => /(order|refill)\s+(?:a|an|my)?\s*[A-Za-z]/i.test(line) && !/\b(?:medicine|medication|prescription)\b$/i.test(line.trim())) ||
    firstMatchingCallerLine(lines, /(?:it'?s|it is|order|refill|prescription|medicine|medication)/i)
  );
}

function findPickupCallerLine(lines: string[]) {
  return (
    lines.find((line) => /(tomorrow|today|\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|am|pm))/i.test(line) && /(pickup|pick up|at|after|around|for)/i.test(line)) ||
    firstMatchingCallerLine(lines, /(?:pickup|pick up|a\.m\.|p\.m\.|am|pm|tomorrow|today)/i)
  );
}

function extractPatientName(source: string, fallbackName?: string | null) {
  const match =
    source.match(/(?:my full name is|my name is|this is)\s+([A-Za-z][A-Za-z\s'-]{1,80})/i) ||
    source.match(/name[:\s]+([A-Za-z][A-Za-z\s'-]{1,80})/i);

  return match?.[1]?.trim() || fallbackName?.trim() || "Not provided";
}

function extractSpokenPhoneNumber(source: string, fallbackPhone?: string | null) {
  const match =
    source.match(/(?:phone number is|reach me at|it's|it is|call me at|yeah[, ]*)\s*([0-9()\-\s+]{7,25})/i) ||
    source.match(/\b([0-9][0-9()\-\s+]{8,24})\b/);

  if (match?.[1]) {
    const raw = match[1].trim().replace(/\s+/g, " ");
    const digits = raw.replace(/\D/g, "");

    if (digits.length === 10) {
      return digits;
    }

    if (digits.length === 11 && digits.startsWith("1")) {
      return digits.slice(1);
    }

    return raw;
  }

  return String(fallbackPhone ?? "").trim();
}

function extractMedicationName(source: string) {
  const explicitMatch =
    source.match(/(?:it'?s|it is)\s+([A-Za-z][A-Za-z0-9\s/-]{1,60}(?:mg|mcg|ml)?)\.?/i) ||
    source.match(/(?:want|would like)(?:\s+to)?\s+(?:order|refill)\s+(?:a|an|my)?\s*([A-Za-z][A-Za-z0-9/-]*(?:\s+[A-Za-z0-9/-]+){0,4})/i) ||
    source.match(/(?:order|refill)\s+(?:a|an|my)?\s*([A-Za-z][A-Za-z0-9/-]*(?:\s+[A-Za-z0-9/-]+){0,4})/i) ||
    source.match(/(?:refill(?: my)? prescription for|refill(?: my)? medication for|prescription for|medication for)\s+([A-Za-z0-9][A-Za-z0-9\s/-]{1,80})/i);

  if (explicitMatch?.[1]) {
    const cleaned = explicitMatch[1]
      .trim()
      .replace(/[.,]$/, "")
      .replace(/^(?:a|an|my)\s+/i, "");

    if (!/^(medicine|medication|prescription)$/i.test(cleaned)) {
      return cleaned;
    }
  }

  const genericMatch = source.match(/(?:refill|prescription|medication|medicine)\s+([A-Za-z0-9][A-Za-z0-9\s/-]{1,80})/i);
  const genericValue = genericMatch?.[1]?.trim().replace(/[.,]$/, "") || "";

  if (genericValue && !/^(my medicine|my medication|my prescription|medicine|medication|prescription)$/i.test(genericValue)) {
    return genericValue;
  }

  return "Medication request captured by AI";
}

function extractPickupPreference(source: string) {
  const explicitTime =
    source.match(/(?:pickup|pick up).{0,20}\b(at|after|around|for)\s+([^.!?\n]{2,40})/i) ||
    source.match(/\b(at|after|around|for)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|am|pm)|tomorrow|today[^.!?\n]*)/i);

  if (explicitTime?.[2]) {
    return explicitTime[2].trim().replace(/[.,]$/, "");
  }

  return /\bpickup|pick up\b/i.test(source) ? "pickup" : "";
}

function buildRefillNotes(medicationName: string, pickupTime: string) {
  if (pickupTime) {
    return `Patient requested a refill for ${medicationName} and asked for pickup ${pickupTime}. Team should confirm prescription details.`;
  }

  return `Patient requested a refill for ${medicationName}. Team should confirm prescription details and pickup timing.`;
}

function buildCallbackNotes(reason: string) {
  return `Patient requested a pharmacist callback regarding: ${reason}.`;
}

function buildPharmacyRefillSummary(request: {
  medicationName: string;
  preferredPickupTime: string;
  phoneNumber: string;
}) {
  const parts = [`Patient requested a prescription refill for ${request.medicationName}.`];

  if (request.preferredPickupTime) {
    parts.push(`Preferred pickup time: ${request.preferredPickupTime}.`);
  }

  if (request.phoneNumber) {
    parts.push("Contact number was provided for follow-up.");
  }

  return parts.join(" ");
}

function buildPharmacyCallbackSummary(request: {
  reason: string;
  phoneNumber: string;
}) {
  const parts = [`Patient requested a pharmacist callback regarding ${request.reason}.`];

  if (request.phoneNumber) {
    parts.push("Contact number was provided for follow-up.");
  }

  return parts.join(" ");
}

function extractSavedPharmacyRefillRequests(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const rules = value as Record<string, unknown>;
  const pharmacy = rules.pharmacy;

  if (!pharmacy || typeof pharmacy !== "object" || Array.isArray(pharmacy)) {
    return [];
  }

  const requests = (pharmacy as Record<string, unknown>).refillRequests;

  if (!Array.isArray(requests)) {
    return [];
  }

  return requests
    .filter((request) => request && typeof request === "object" && !Array.isArray(request))
    .map((request) => {
      const record = request as Record<string, unknown>;

      return {
        id: String(record.id ?? "").trim(),
        patientName: String(record.patientName ?? "").trim(),
        phoneNumber: String(record.phoneNumber ?? "").trim(),
        medicationName: String(record.medicationName ?? "").trim(),
        prescriptionNumber: String(record.prescriptionNumber ?? "").trim(),
        requestedOn: String(record.requestedOn ?? "").trim(),
        preferredPickupTime: String(record.preferredPickupTime ?? "").trim(),
        notes: String(record.notes ?? "").trim(),
        assignedTo: String(record.assignedTo ?? "").trim(),
        status: String(record.status ?? "NEW").trim() || "NEW",
      };
    })
    .filter((request) => request.id && request.patientName && request.phoneNumber && request.medicationName);
}

function extractSavedPharmacyCallbackRequests(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const rules = value as Record<string, unknown>;
  const pharmacy = rules.pharmacy;

  if (!pharmacy || typeof pharmacy !== "object" || Array.isArray(pharmacy)) {
    return [];
  }

  const requests = (pharmacy as Record<string, unknown>).callbackRequests;

  if (!Array.isArray(requests)) {
    return [];
  }

  return requests
    .filter((request) => request && typeof request === "object" && !Array.isArray(request))
    .map((request) => {
      const record = request as Record<string, unknown>;

      return {
        id: String(record.id ?? "").trim(),
        patientName: String(record.patientName ?? "").trim(),
        phoneNumber: String(record.phoneNumber ?? "").trim(),
        reason: String(record.reason ?? "").trim(),
        notes: String(record.notes ?? "").trim(),
        requestedOn: String(record.requestedOn ?? "").trim(),
        priority: String(record.priority ?? "NORMAL").trim() || "NORMAL",
        assignedTo: String(record.assignedTo ?? "").trim(),
        lastAttemptAt: String(record.lastAttemptAt ?? "").trim(),
        status: String(record.status ?? "NEW").trim() || "NEW",
      };
    })
    .filter((request) => request.id && request.patientName && request.phoneNumber && request.reason);
}

function derivePharmacyRefillRequestFromCall(call: {
  id: string;
  callerName: string | null;
  callerNumber: string | null;
  summary: string | null;
  transcript: string | null;
  startedAt: Date;
}) {
  const source = `${call.summary || ""}\n${call.transcript || ""}`.trim();
  const callerLines = extractCallerTranscriptLines(call.transcript);
  const callerSource = callerLines.join(" ");

  if (!/(refill|prescription|pickup|medication|medicine)/i.test(source)) {
    return null;
  }

  const patientLine = firstMatchingCallerLine(callerLines, /(?:my full name is|my name is|this is|name[:\s]+)/i);
  const phoneLine = firstMatchingCallerLine(callerLines, /(?:phone number|reach me|it'?s|it is|call me at|yeah[, ]*|^\d[\d\s()+-]{8,})/i);
  const medicationLine = findMedicationCallerLine(callerLines);
  const pickupLine = findPickupCallerLine(callerLines);

  const patientName = extractPatientName(patientLine || callerSource, call.callerName);
  const phoneNumber = extractSpokenPhoneNumber(phoneLine || callerSource, call.callerNumber);
  const medicationName = extractMedicationName(medicationLine || callerSource || source);
  const preferredPickupTime = extractPickupPreference(pickupLine || callerSource);

  return {
    id: `call-${call.id}`,
    patientName,
    phoneNumber,
    medicationName,
    prescriptionNumber: "",
    requestedOn: call.startedAt.toISOString().slice(0, 10),
    preferredPickupTime,
    notes: buildRefillNotes(medicationName, preferredPickupTime),
    assignedTo: "",
    status: "NEW",
  };
}

function derivePharmacyCallbackRequestFromCall(call: {
  id: string;
  callerName: string | null;
  callerNumber: string | null;
  summary: string | null;
  transcript: string | null;
  startedAt: Date;
}) {
  const source = `${call.summary || ""}\n${call.transcript || ""}`.trim();
  const callerLines = extractCallerTranscriptLines(call.transcript);
  const callerSource = callerLines.join(" ");

  if (!/(callback|call back|speak with pharmacist|pharmacist call)/i.test(source)) {
    return null;
  }

  const reasonMatch =
    callerSource.match(/(?:callback(?: request)?|call back(?: request)?|reason(?: for callback)?)[\s:]+([A-Za-z0-9][A-Za-z0-9\s,.'/-]{3,120})/i) ||
    callerSource.match(/^(.{8,180})$/i);
  const patientLine = firstMatchingCallerLine(callerLines, /(?:my full name is|my name is|this is|name[:\s]+)/i);
  const phoneLine = firstMatchingCallerLine(callerLines, /(?:phone number|reach me|it'?s|it is|call me at|yeah[, ]*|^\d[\d\s()+-]{8,})/i);
  const patientName = extractPatientName(patientLine || callerSource, call.callerName);
  const phoneNumber = extractSpokenPhoneNumber(phoneLine || callerSource, call.callerNumber);
  const reason = reasonMatch?.[1]?.trim() || "Patient requested a pharmacist callback.";

  return {
    id: `call-${call.id}`,
    patientName,
    phoneNumber,
    reason,
    notes: buildCallbackNotes(reason),
    requestedOn: call.startedAt.toISOString().slice(0, 10),
    priority: /(urgent|as soon as possible|right away)/i.test(source) ? "URGENT" : "NORMAL",
    assignedTo: "",
    lastAttemptAt: "",
    status: "NEW",
  };
}

function isInternalTranscriptArtifact(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.length === 0 ||
    normalized.startsWith("receptionist call for ") ||
    normalized.startsWith("expect english words related to ")
  );
}

function countMatches(value: string, expression: RegExp) {
  const matches = value.match(expression);
  return matches ? matches.length : 0;
}

function isLowQualityEnglishTranscript(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  if (trimmed.length <= 2) {
    return true;
  }

  if (trimmed.length <= 4 && !/\d/.test(trimmed) && !/\s/.test(trimmed)) {
    return true;
  }

  const latinLetters = countMatches(trimmed, /[A-Za-z]/g);
  const nonLatinLetters = countMatches(trimmed, /[^\u0000-\u007F]/g);
  const digits = countMatches(trimmed, /[0-9]/g);

  if (digits > 0 && latinLetters === 0 && nonLatinLetters === 0) {
    return false;
  }

  if (latinLetters === 0 && nonLatinLetters > 0) {
    return true;
  }

  if (nonLatinLetters > latinLetters && latinLetters < 6) {
    return true;
  }

  return false;
}

function isHighSignalSummaryTurn(value: string) {
  const normalized = normalizeText(value);

  if (normalized.length < 4) {
    return false;
  }

  if (/^[\d\s\-()+]+$/.test(normalized)) {
    return false;
  }

  return [
    "hour",
    "open",
    "close",
    "service",
    "menu",
    "salad",
    "soup",
    "price",
    "cost",
    "book",
    "reservation",
    "catering",
    "manager",
    "call me",
    "callback",
    "pickup",
    "order",
  ].some((keyword) => normalized.includes(keyword));
}

function toSentenceCase(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function extractRequestedCategory(callerTurns: string[]) {
  const categories = [
    "salad",
    "salads",
    "soup",
    "soups",
    "pasta",
    "vegan salad",
    "dessert",
    "desserts",
    "reservation",
    "appointment",
    "callback",
  ];

  for (const turn of [...callerTurns].reverse()) {
    const normalized = normalizeText(turn);

    for (const category of categories) {
      if (normalized.includes(category)) {
        return category;
      }
    }
  }

  return "";
}

function extractQuantityPhrase(callerTurns: string[]) {
  const patterns = [
    /\b(\d+)\s+(plate|plates|portion|portions|order|orders|salad|salads|soup|soups|pasta|pastas)\b/i,
    /\bfor\s+(\d+)\s+(people|person)\b/i,
  ];

  for (const turn of [...callerTurns].reverse()) {
    for (const pattern of patterns) {
      const match = turn.match(pattern);

      if (match) {
        return match[0];
      }
    }
  }

  return "";
}

function extractPickupTime(callerTurns: string[]) {
  const patterns = [
    /\b\d{1,2}\s*(?::\d{2})?\s*(a\.m\.|p\.m\.|am|pm)\b/i,
    /\btoday\b/i,
    /\btomorrow\b/i,
  ];

  const parts: string[] = [];

  for (const turn of [...callerTurns].reverse()) {
    for (const pattern of patterns) {
      const match = turn.match(pattern);

      if (match) {
        const value = match[0].toLowerCase();

        if (!parts.includes(value)) {
          parts.push(value);
        }
      }
    }

    if (parts.length >= 2) {
      break;
    }
  }

  return parts.join(" ");
}

function extractRequestedItem(callerTurns: string[]) {
  const patterns = [
    /\b(?:order|want to order|like to order)\s+([A-Za-z][A-Za-z0-9\s'-]{2,80})/i,
    /\b([A-Za-z][A-Za-z0-9\s'-]{2,80})\s+for\s+\d+\s+(?:people|person|orders|plates|portions)\b/i,
  ];

  for (const turn of [...callerTurns].reverse()) {
    for (const pattern of patterns) {
      const match = turn.match(pattern);

      if (!match?.[1]) {
        continue;
      }

      const candidate = match[1]
        .trim()
        .replace(/^(?:a|an|the)\s+/i, "")
        .replace(/[.?,]$/, "");

      if (!/^(medicine|medication|prescription|something|anything)$/i.test(candidate)) {
        return candidate;
      }
    }
  }

  return "";
}

function hasHoursQuestion(callerTurns: string[]) {
  return callerTurns.some((turn) => /(hours|open|close|closing|opening|what time)/i.test(turn));
}

function hasAddressQuestion(callerTurns: string[]) {
  return callerTurns.some((turn) => /(address|location|where are you|where is the store)/i.test(turn));
}

function hasCallbackRequest(callerTurns: string[]) {
  return callerTurns.some((turn) => /(call me|callback|call back|reach me)/i.test(turn));
}

function hasPhoneCaptured(callerTurns: string[]) {
  return callerTurns.some((turn) => /(phone number|reach me|call me at|\b\d{7,}\b|\d{3}[-)\s]?\d{3}[-\s]?\d{4})/i.test(turn));
}

function extractConfirmedOrderPhrase(assistantTurns: string[]) {
  const patterns = [
    /(?:your order for|i['’]ve got your order for|we['’]ve got your order for)\s+(.+?)(?:\s+is set|\s+for pickup|,?\s+ready|\.|$)/i,
    /(?:i['’]ve got)\s+(.+?)(?:\s+for pickup|\.|$)/i,
  ];

  for (const turn of [...assistantTurns].reverse()) {
    for (const pattern of patterns) {
      const match = turn.match(pattern);

      if (match?.[1]) {
        return match[1].trim().replace(/[.?,]$/, "");
      }
    }
  }

  return "";
}

function extractStructuredSummary(callerTurns: string[], assistantTurns: string[] = []) {
  const meaningfulTurns = callerTurns.filter((turn) => !isLowQualityEnglishTranscript(turn));

  if (meaningfulTurns.length === 0) {
    return "";
  }

  const requestedItem = extractRequestedItem(meaningfulTurns);
  const latestOrderTurn = [...meaningfulTurns]
    .reverse()
    .find((turn) => /(order|pickup|deliver|delivery|for\s+\d+|today|tomorrow|p\.m\.|a\.m\.)/i.test(turn));
  const latestCallbackTurn = [...meaningfulTurns]
    .reverse()
    .find((turn) => /(call me|callback|manager|phone number|reach me)/i.test(turn));
  const askedForHours = hasHoursQuestion(meaningfulTurns);
  const askedForAddress = hasAddressQuestion(meaningfulTurns);
  const requestedCallback = hasCallbackRequest(meaningfulTurns);
  const phoneCaptured = hasPhoneCaptured(meaningfulTurns);
  const confirmedOrderPhrase = extractConfirmedOrderPhrase(assistantTurns);

  if (latestOrderTurn) {
    const itemCategory = extractRequestedCategory(meaningfulTurns);
    const quantityPhrase = extractQuantityPhrase(meaningfulTurns);
    const pickupTime = extractPickupTime(meaningfulTurns);
    const parts = [
      "Caller placed a pending order request",
      confirmedOrderPhrase
        ? `for ${confirmedOrderPhrase}`
        : quantityPhrase
          ? `for ${quantityPhrase}` : "",
      !confirmedOrderPhrase && requestedItem
        ? `${quantityPhrase ? "of" : "for"} ${requestedItem}`
        : !confirmedOrderPhrase && itemCategory
          ? `${quantityPhrase ? "of" : "for"} ${itemCategory}`
          : "",
      pickupTime ? `for ${pickupTime}` : "",
    ].filter(Boolean);
    const extraNotes = [
      phoneCaptured ? "Contact details were also discussed for follow-up." : "Phone number was not captured.",
      askedForHours ? "Store hours were also discussed." : "",
      askedForAddress ? "Address details were also discussed." : "",
    ].filter(Boolean);
    const callbackSuffix = extraNotes.length > 0 ? ` ${extraNotes.join(" ")}` : "";

    if (parts.length > 1) {
      return `${toSentenceCase(parts.join(" ").replace(/\s+/g, " ").trim())}.${callbackSuffix}`.replace("..", ".");
    }

    return `Caller placed a pending order request: ${latestOrderTurn.slice(0, 180)}.${callbackSuffix}`.replace("..", ".");
  }

  if (requestedCallback && askedForHours && askedForAddress) {
    return "Caller requested a callback and also asked about the business address and store hours.";
  }

  if (requestedCallback && askedForHours) {
    return "Caller requested a callback and also asked about store hours.";
  }

  if (requestedCallback && askedForAddress) {
    return "Caller requested a callback and also asked about the business address.";
  }

  if (askedForHours && askedForAddress) {
    return "Caller asked about the business address and store hours.";
  }

  if (askedForHours) {
    return "Caller asked about store hours.";
  }

  if (askedForAddress) {
    return "Caller asked about the business address.";
  }

  if (latestCallbackTurn || requestedCallback) {
    const callbackDetail = latestCallbackTurn?.slice(0, 180) || "Caller requested a callback or follow-up.";
    return `Caller requested follow-up: ${callbackDetail}.`;
  }

  return "";
}

function extractMenuCatalog(rules: Record<string, unknown>) {
  const menu = rules.menu;

  if (!menu || typeof menu !== "object" || Array.isArray(menu)) {
    return "";
  }

  const items = (menu as Record<string, unknown>).items;

  if (!Array.isArray(items)) {
    return "";
  }

  const normalizedItems = items
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({
      name: String(item.name ?? "").trim(),
      category: String(item.category ?? "").trim(),
      description: String(item.description ?? "").trim(),
      price: String(item.price ?? "").trim(),
      available: item.available !== false,
      availabilityMode:
        item.availabilityMode === "DISABLED_TODAY" || item.availabilityMode === "DISABLED_UNTIL"
          ? item.availabilityMode
          : "AVAILABLE",
      disabledUntil: String(item.disabledUntil ?? "").trim(),
    }))
    .filter((item) => item.name.length > 0 && item.category.length > 0);

  if (normalizedItems.length === 0) {
    return "";
  }

  return normalizedItems
    .map((item) =>
      `${item.name} (${item.category})${item.price ? ` - ${item.price}` : ""}${item.availabilityMode === "AVAILABLE" ? " - available now" : item.availabilityMode === "DISABLED_TODAY" ? " - unavailable today" : ` - unavailable until ${item.disabledUntil || "later"}`}${item.description ? `: ${item.description}` : ""}`,
    )
    .join("; ");
}

function buildOpeningGreeting(greeting: string, consentMessage: string, emergencyPrompt: string) {
  return [consentMessage.trim(), greeting.trim(), emergencyPrompt.trim()].filter(Boolean).join(" ");
}

function collectTranscriptText(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTranscriptText(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return [
      ...collectTranscriptText(record.transcript),
      ...collectTranscriptText(record.text),
      ...collectTranscriptText(record.audio_transcript),
      ...collectTranscriptText(record.content),
      ...collectTranscriptText(record.arguments),
    ];
  }

  return [];
}

function extractResponseText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }

  const output = record.output;

  if (!Array.isArray(output)) {
    return "";
  }

  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const content = (item as Record<string, unknown>).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const entry of content) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const textValue = (entry as Record<string, unknown>).text;

      if (typeof textValue === "string" && textValue.trim()) {
        parts.push(textValue);
      }
    }
  }

  return parts.join("\n").trim();
}

function extractTurnsFromTranscript(transcript: string | null | undefined) {
  const callerTurns: string[] = [];
  const assistantTurns: string[] = [];

  for (const line of String(transcript ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed.startsWith("Caller:")) {
      const value = trimmed.replace(/^Caller:\s*/i, "").trim();
      if (value) {
        callerTurns.push(value);
      }
      continue;
    }

    if (trimmed.startsWith("Assistant:")) {
      const value = trimmed.replace(/^Assistant:\s*/i, "").trim();
      if (value) {
        assistantTurns.push(value);
      }
    }
  }

  return { callerTurns, assistantTurns };
}

function defaultServiceSummary(category: string) {
  const value = normalizeText(category);

  if (value.includes("restaurant") || value.includes("cafe")) {
    return "food orders, menu questions, pickup timing, and general customer inquiries";
  }

  if (value.includes("clinic") || value.includes("doctor") || value.includes("dental") || value.includes("physio")) {
    return "appointment requests, clinic information, callback requests, and general patient intake support";
  }

  if (value.includes("salon")) {
    return "appointment booking, service questions, pricing guidance, and callback requests";
  }

  if (value.includes("repair")) {
    return "repair inquiries, service booking, quote requests, and callback scheduling";
  }

  if (value.includes("legal")) {
    return "consultation requests, callback scheduling, and general service inquiries";
  }

  return "general customer inquiries, booking requests, order capture, and callback messages";
}

function isFoodBusinessCategory(category: string) {
  const value = normalizeText(category);
  return value.includes("restaurant") || value.includes("cafe") || value.includes("bakery");
}

@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);

  constructor(private readonly prisma: PrismaService) {}

  private resolveTwilioCredentials(telephonySettings: unknown) {
    const telephony = readTelephonySettings(telephonySettings);
    const accountSid =
      (typeof telephony.twilioAccountSid === "string" ? telephony.twilioAccountSid.trim() : "") ||
      process.env.TWILIO_ACCOUNT_SID?.trim() ||
      "";
    const authToken =
      (typeof telephony.twilioAuthToken === "string" ? telephony.twilioAuthToken.trim() : "") ||
      process.env.TWILIO_AUTH_TOKEN?.trim() ||
      "";
    const phoneNumber =
      (typeof telephony.twilioNumber === "string" ? telephony.twilioNumber.trim() : "") ||
      process.env.TWILIO_PHONE_NUMBER?.trim() ||
      "";

    return { accountSid, authToken, phoneNumber };
  }

  private async generateStructuredCallSummary(callId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        business: true,
      },
    });

    if (!call) {
      return;
    }

    const { callerTurns, assistantTurns } = extractTurnsFromTranscript(call.transcript);
    const fallbackSummary = buildRealtimeSummary(callerTurns, assistantTurns);
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey || !(call.transcript || "").trim()) {
      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          summary: fallbackSummary,
        },
      });
      return;
    }

    const prompt = [
      `Business name: ${call.business.name}`,
      `Business category: ${call.business.category}`,
      "Task: Write one concise, professional operational summary of this call for the business owner.",
      "Requirements:",
      "- Use only facts clearly stated in the transcript.",
      "- Make it useful enough that the owner does not need to open the transcript.",
      "- If this is an order or booking request, include exact item/service, quantity, pickup/delivery/timing, and whether name/phone were captured.",
      "- If this is a callback request, include callback intent and whether contact details were captured.",
      "- If the caller asked about address or store hours, mention that clearly.",
      "- If important details are missing, explicitly say what is missing.",
      "- Do not mention recording URLs, stream IDs, or internal system details.",
      "- Keep it to 1-2 sentences maximum.",
      "",
      "Transcript:",
      call.transcript || "",
    ].join("\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: "You write short, highly accurate operational call summaries for businesses.",
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: prompt,
                },
              ],
            },
          ],
        }),
      });

      const payload = (await response.json()) as {
        output_text?: string;
        output?: unknown;
        error?: { message?: string };
      };

      if (!response.ok) {
        this.logger.warn(
          `Structured call summary generation failed for callId=${call.id}: ${payload.error?.message || response.statusText}`,
        );
        await this.prisma.call.update({
          where: { id: call.id },
          data: {
            summary: fallbackSummary,
          },
        });
        return;
      }

      const summary = extractResponseText(payload).trim() || fallbackSummary;

      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          summary,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Structured call summary generation threw for callId=${call.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          summary: fallbackSummary,
        },
      });
    }
  }

  private buildRealtimeInstructions(
    business: {
      name: string;
      category: string;
      description: string | null;
      servicesSummary: string | null;
      priceListSummary: string | null;
      officeHours: unknown;
      address: string | null;
      phoneNumber: string | null;
      greetingMessage: string | null;
      medicalModeEnabled: boolean;
      voicePreference: string | null;
      timezone: string;
    },
    rules: Record<string, unknown>,
  ) {
    const telephony =
      rules.telephony && typeof rules.telephony === "object" && !Array.isArray(rules.telephony)
        ? (rules.telephony as Record<string, unknown>)
        : {};
    const officeHours = formatOfficeHours(business.officeHours) || "";
    const businessDate = formatCurrentBusinessDate(business.timezone || "America/Toronto");
    const officeHoursInstruction = officeHours
      ? officeHours
      : "The exact operating hours are still being finalized in the portal, so offer to capture a callback request if needed";
    const emergencyMessage =
      typeof rules.emergencyMessage === "string" && rules.emergencyMessage.trim().length > 0
        ? rules.emergencyMessage.trim()
        : business.medicalModeEnabled
          ? "If this is a medical emergency, please call 911."
          : "No emergency instruction is required for this business category.";
    const afterHoursMessage =
      typeof rules.afterHoursMessage === "string" && rules.afterHoursMessage.trim().length > 0
        ? rules.afterHoursMessage.trim()
        : "If the business is closed, capture the caller's details and explain that the team will follow up later.";
    const callHandlingMode =
      typeof rules.callHandlingMode === "string" ? rules.callHandlingMode : "LIVE_AI";
    const answerMode =
      typeof rules.primaryMode === "string" ? rules.primaryMode : "ALL_CALLS";
    const menuCatalog = extractMenuCatalog(rules);
    const foodBusiness = isFoodBusinessCategory(business.category);
    const consentMessage =
      typeof telephony.consentMessage === "string" && telephony.consentMessage.trim().length > 0
        ? telephony.consentMessage.trim()
        : "Calls may be recorded and transcribed for service quality and follow-up.";

    return [
      `You are the live AI receptionist for ${business.name}.`,
      `Business category: ${business.category}.`,
      `Greeting to use: ${business.greetingMessage || `Thank you for calling ${business.name}. How can I help you today?`}`,
      `Business summary: ${business.description || "No detailed summary provided yet."}`,
      `Services: ${business.servicesSummary || business.description || defaultServiceSummary(business.category)}`,
      `Structured menu items: ${menuCatalog || "No structured menu items saved yet."}`,
      `Pricing or fees: ${business.priceListSummary || "If explicit pricing is missing, say the team will confirm the exact amount."}`,
      `Operating hours: ${officeHoursInstruction}.`,
      `Address: ${business.address || "No address configured yet."}`,
      `Phone number: ${business.phoneNumber || "No phone number configured yet."}`,
      `Current local business date: ${businessDate}.`,
      `Business timezone: ${business.timezone || "America/Toronto"}.`,
      `Call handling mode: ${callHandlingMode}.`,
      `Answer mode: ${answerMode}.`,
      `After-hours behavior: ${afterHoursMessage}`,
      `Emergency guidance: ${emergencyMessage}`,
      `Telephony consent message: ${consentMessage}`,
      "Speak only in clear, natural English.",
      "Use short, natural spoken sentences that sound like a real receptionist.",
      "Sound like a polished, professional front-desk sales and service representative.",
      "Your tone should be calm, confident, warm, and conversion-focused.",
      "Your goal is to convert interest into a clear next step such as an order request, booking request, callback request, or confirmed follow-up.",
      "Be helpful and persuasive, but never pushy, robotic, or misleading.",
      "When appropriate, guide the caller toward the best next action using only the saved business data.",
      "Answer quickly after the caller finishes, without long pauses.",
      "Keep your first response concise, then ask one focused follow-up question.",
      "Do not speak twice in a row unless the caller has clearly responded.",
      "Do not add filler like repeated thank-yous or extra closing lines unless the call is ending.",
      "Use professional sales language when appropriate, such as offering the next suitable option, helping the caller choose, or moving toward a booking, order, or callback.",
      "If you cannot fully complete the request from saved data, still move the conversation toward a high-conversion next step like capturing a callback, pending request, or staff follow-up.",
      "Do not switch languages unless the caller clearly asks for another language.",
      "Use only the information provided by the business configuration.",
      "Never invent operating hours, prices, or appointment availability.",
      "Never name a specific menu item, dish, soup, salad, dessert, or drink unless that exact item is present in the saved business summary, services summary, or pricing data.",
      "If structured menu items are present, prefer those exact items over broad summary text.",
      "Treat menu availability as a hard rule.",
      "If a structured menu item is marked available now, you may treat it as currently available.",
      "If a structured menu item is marked unavailable today, do not offer it as available.",
      "If a structured menu item is marked unavailable until a specific time, do not offer it before that time.",
      "When a caller asks about a specific saved menu item, check that item's current availability state before answering.",
      "Do not reuse a previous availability answer from an earlier call if the current saved menu state is different.",
      "If a caller asks for an unavailable item, explain that it is currently unavailable and offer another saved available item from the same category if one exists.",
      "Never ignore saved availability states in the structured menu.",
      "If the caller asks about menu categories like soups or salads and exact items are not stored, mention only the saved category or price range and say the exact item list is not loaded yet.",
      "For restaurant or bakery calls, treat the conversation as an order request unless the exact item list, quantities, fulfillment method, and contact details are explicitly confirmed by the caller.",
      "Do not claim that an order is fully confirmed unless those details are clearly collected.",
      "If the caller mentions an item that is not present in saved business data, say you can note the request for staff review instead of pretending it is available.",
      "Never repeat or summarize a caller name, quantity, phone number, pickup time, or order item unless the caller explicitly said it clearly in the conversation.",
      "If a caller gives only partial order details, explicitly ask for the missing fields instead of guessing.",
      "If you are uncertain about a name, phone number, quantity, or item, say that you did not catch it clearly and ask the caller to repeat it.",
      ...(foodBusiness
        ? [
            "For restaurant, cafe, and bakery pickup or delivery orders, do not end the order flow until you have captured the exact item, quantity, fulfillment method, pickup or delivery timing, customer name, and customer phone number.",
            "If phone number is missing, you must ask for it before closing the order.",
            "If the caller refuses or does not provide a phone number, clearly state that the order request is incomplete without a callback number and ask once more before ending the call.",
          ]
        : []),
      "When discussing dates or weekdays, rely on the current local business date provided above.",
      "If the caller asks for services and the services summary is sparse, use the business summary as fallback before saying details are still being confirmed.",
      "If the caller asks about hours and the office hours are not configured, say the hours are still being finalized in the portal and offer to capture a callback request.",
      "If the caller asks for pricing or services and the portal data is incomplete, say that the team will confirm the details.",
      "If this is a medical business and the caller describes an emergency, deliver the emergency guidance immediately and do not continue normal intake.",
      "Let the caller finish speaking before you answer. Do not interrupt unless they clearly stop.",
      "Capture caller intent, contact details, and any order or booking information clearly.",
      "At the end of an order-related call, summarize the request cautiously as a pending request for staff unless it is fully confirmed from the saved data.",
      "Be conservative. It is better to ask one extra clarifying question than to guess a missing detail.",
    ].join("\n");
  }

  private buildBusinessAwareReply(
    business: {
      name: string;
      category: string;
      description: string | null;
      servicesSummary: string | null;
      priceListSummary: string | null;
      officeHours: unknown;
      medicalModeEnabled: boolean;
      phoneNumber: string | null;
      address: string | null;
    },
    rules: Record<string, unknown>,
    callerSpeech: string,
  ) {
    const speech = normalizeText(callerSpeech);
    const emergencyMessage =
      typeof rules.emergencyMessage === "string" && rules.emergencyMessage.trim().length > 0
        ? rules.emergencyMessage.trim()
        : business.medicalModeEnabled
          ? "If this is a medical emergency, please call 911."
          : "";

    if (
      business.medicalModeEnabled &&
      ["emergency", "urgent", "chest pain", "bleeding", "unconscious", "911"].some((keyword) => speech.includes(keyword))
    ) {
      return emergencyMessage || "If this is a medical emergency, please call 911.";
    }

    if (speech.includes("hour") || speech.includes("open") || speech.includes("close")) {
      if (Array.isArray(business.officeHours) && business.officeHours.length > 0) {
        return `${business.name} currently lists these hours: ${business.officeHours.join(", ")}.`;
      }

      return `I do not have the exact operating hours confirmed yet, but I can capture your request and have the team follow up with the correct timing.`;
    }

    if (speech.includes("price") || speech.includes("cost") || speech.includes("fee") || speech.includes("how much")) {
      if (business.priceListSummary?.trim()) {
        return `${business.name} currently lists pricing like this: ${business.priceListSummary.trim()}`;
      }

      return `Pricing details are not fully configured yet, but I can note your request for a follow-up.`;
    }

    if (
      speech.includes("service") ||
      speech.includes("offer") ||
      speech.includes("menu") ||
      speech.includes("do you") ||
      speech.includes("provide")
    ) {
      if (business.servicesSummary?.trim()) {
        return `${business.name} currently offers: ${business.servicesSummary.trim()}`;
      }

      return `${business.name} can help with ${business.description?.trim() || defaultServiceSummary(business.category)}. I can also capture your specific request and pass it to the team.`;
    }

    if (speech.includes("book") || speech.includes("appointment") || speech.includes("consultation") || speech.includes("schedule")) {
      return `I can help note your booking request for ${business.name}. The next step is to capture your preferred date, time, and contact details in the live AI workflow.`;
    }

    if (speech.includes("address") || speech.includes("location") || speech.includes("where are you")) {
      if (business.address?.trim()) {
        return `${business.name} is located at ${business.address.trim()}.`;
      }

      return `The business address has not been fully configured yet.`;
    }

    if (speech.includes("phone") || speech.includes("call back") || speech.includes("callback")) {
      if (business.phoneNumber?.trim()) {
        return `The best contact number currently on file is ${business.phoneNumber.trim()}.`;
      }

      return `A callback number has not been configured yet, but I can still capture a callback request.`;
    }

    if (business.description?.trim()) {
      return `${business.name} is described in the portal as: ${business.description.trim()} If you would like, I can also help capture a more specific request for the team.`;
    }

    return `I heard your request and ${business.name} can review it. The live AI conversation engine is being expanded next, so this call can already use the portal information for basic guidance.`;
  }

  private async findCallForTwilioEvent(businessId: string, payload: TwilioRecordingPayload) {
    if (payload.CallSid) {
      const byCallSid = await this.prisma.call.findFirst({
        where: {
          businessId,
          transcript: {
            contains: payload.CallSid,
            mode: "insensitive",
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (byCallSid) {
        return byCallSid;
      }
    }

    const byCaller = await this.prisma.call.findFirst({
      where: {
        businessId,
        callerNumber: payload.From?.trim() || undefined,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (byCaller) {
      return byCaller;
    }

    return this.prisma.call.findFirst({
      where: {
        businessId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async handleTwilioInboundCall(businessId: string, payload: TwilioInboundPayload) {
    return this.handleTwilioInboundCallWithBaseUrl(businessId, payload, "");
  }

  async handleTwilioInboundCallWithBaseUrl(businessId: string, payload: TwilioInboundPayload, baseUrl: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException("Business not found.");
    }

    const rules = readRules(business.answeringRules);
    const telephony =
      rules.telephony && typeof rules.telephony === "object" && !Array.isArray(rules.telephony)
        ? (rules.telephony as Record<string, unknown>)
        : {};

    const callerNumber = payload.From?.trim() || null;
    const callerName = payload.CallerName?.trim() || null;
    const twilioNumber = payload.To?.trim() || null;
    const emergencyMessage =
      typeof rules.emergencyMessage === "string" && rules.emergencyMessage.trim().length > 0
        ? rules.emergencyMessage.trim()
        : business.medicalModeEnabled
          ? "If this is a medical emergency, please call 911."
          : "";

    await this.prisma.call.create({
      data: {
        businessId,
        status: CallStatus.ANSWERED_BY_AI,
        callerName,
        callerNumber,
        summary: "Inbound Twilio webhook stub received the call and returned placeholder TwiML.",
        transcript: `Stub call received. CallSid=${payload.CallSid || "unknown"}, From=${callerNumber || "unknown"}, To=${twilioNumber || "unknown"}.`,
      },
    });

    const greeting =
      business.greetingMessage?.trim() || `Thank you for calling ${business.name}.`;
    const routingMode =
      typeof telephony.connectionMode === "string" ? telephony.connectionMode.replaceAll("_", " ").toLowerCase() : "direct to ai";
    const fallbackNumber =
      typeof telephony.fallbackNumber === "string" && telephony.fallbackNumber.trim().length > 0
        ? telephony.fallbackNumber.trim()
        : business.phoneNumber?.trim() || "";
    const consentMessage =
      typeof telephony.consentMessage === "string" && telephony.consentMessage.trim().length > 0
        ? telephony.consentMessage.trim()
        : "This call may be recorded and transcribed for service quality and follow-up.";
    const callHandlingMode =
      typeof rules.callHandlingMode === "string" ? rules.callHandlingMode : "LIVE_AI";
    const routingPreference = typeof telephony.routingMode === "string" ? telephony.routingMode : "AI_IMMEDIATELY";
    const aiReceptionistEnabled = telephony.aiReceptionistEnabled !== false && business.aiEnabled !== false;

    if (!aiReceptionistEnabled || routingPreference === "STAFF_ONLY") {
      if (fallbackNumber) {
        return `<Response><Dial>${escapeXml(fallbackNumber)}</Dial></Response>`;
      }

      return `<Response><Say voice="alice">The AI receptionist is currently disabled. Please call back later.</Say><Hangup/></Response>`;
    }

    if (callHandlingMode === "MESSAGE_CAPTURE") {
      const recordAction = `${baseUrl}/api/telephony/twilio/voice/${businessId}/recording-complete`;
      const transcribeCallback = `${baseUrl}/api/telephony/twilio/voice/${businessId}/transcription`;
      const messagePrompt = [
        greeting,
        consentMessage,
        "Please leave your message after the beep. Press star when you are finished.",
        emergencyMessage,
      ].filter(Boolean);

      return `<Response>${messagePrompt
        .map((line) => `<Say voice="alice">${escapeXml(line)}</Say>`)
        .join("")}<Record action="${escapeXml(recordAction)}" method="POST" maxLength="120" finishOnKey="*" playBeep="true" transcribe="true" transcribeCallback="${escapeXml(transcribeCallback)}" /></Response>`;
    }

    if (callHandlingMode === "LIVE_AI" || callHandlingMode === "HYBRID") {
      const wsBaseUrl = baseUrl.replace(/^http/i, "ws");
      const streamUrl = `${wsBaseUrl}/ws/twilio-media?businessId=${encodeURIComponent(businessId)}`;
      const recordingCallbackUrl = `${baseUrl}/api/telephony/twilio/voice/${businessId}/recording-complete`;
      const recordingEnabled = telephony.recordingEnabled !== false;
      const recordingStart = recordingEnabled
        ? `<Start><Recording recordingStatusCallback="${escapeXml(recordingCallbackUrl)}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed" channels="dual" track="both" /></Start>`
        : "";

      return `<Response>${recordingStart}<Connect><Stream url="${escapeXml(streamUrl)}"><Parameter name="businessId" value="${escapeXml(businessId)}" /><Parameter name="recordingCallbackUrl" value="${escapeXml(recordingCallbackUrl)}" /></Stream></Connect></Response>`;
    }

    const lines = [
      greeting,
      consentMessage,
      business.aiEnabled
        ? `Your inbound call reached the Twilio webhook stub successfully. The current routing mode is ${routingMode}.`
        : "The AI receptionist is not fully enabled yet, but the inbound call webhook is now connected.",
      emergencyMessage,
      "Live AI conversation streaming will be attached in the next step. Goodbye for now.",
    ].filter(Boolean);

    const twiml = `<Response>${lines
      .map((line) => `<Say voice="alice">${escapeXml(line)}</Say>`)
      .join("")}</Response>`;

    return twiml;
  }

  async handleRecordingComplete(businessId: string, payload: TwilioRecordingPayload) {
    this.logger.log(
      `Twilio recording callback received for businessId=${businessId}, CallSid=${payload.CallSid || "unknown"}, RecordingUrl=${payload.RecordingUrl || "missing"}.`,
    );
    const call = await this.findCallForTwilioEvent(businessId, payload);

    if (call) {
      const recordingSummary = payload.RecordingDuration
        ? `Caller left a recorded message (${payload.RecordingDuration} seconds).`
        : "Caller left a recorded message.";

      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          recordingUrl: payload.RecordingUrl?.trim() || call.recordingUrl,
          summary: call.summary?.trim() ? call.summary : recordingSummary,
          transcript: `${call.transcript || ""}\nRecording complete. RecordingUrl=${payload.RecordingUrl || "unknown"}, Duration=${payload.RecordingDuration || "unknown"}, EndedBy=${payload.Digits || "timeout"}.`.trim(),
        },
      });
      await this.syncPharmacyWorkflowsFromCall(call.id);
      await this.generateStructuredCallSummary(call.id);
      this.logger.log(`Saved recording URL for callId=${call.id}.`);
    } else {
      this.logger.warn(
        `Twilio recording callback could not find a matching call for businessId=${businessId}, CallSid=${payload.CallSid || "unknown"}.`,
      );
    }

    return `<Response><Say voice="alice">Thank you. Your message has been recorded and will be reviewed by the team.</Say><Hangup/></Response>`;
  }

  async handleTranscriptionCallback(businessId: string, payload: TwilioRecordingPayload) {
    const call = await this.findCallForTwilioEvent(businessId, payload);

    if (call) {
      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          transcript: payload.TranscriptionText?.trim() || call.transcript,
          summary: payload.TranscriptionText?.trim()
            ? `Captured caller message: ${payload.TranscriptionText.trim().slice(0, 120)}`
            : call.summary,
        },
      });
      await this.syncPharmacyWorkflowsFromCall(call.id);
      await this.generateStructuredCallSummary(call.id);
    }

    return { ok: true };
  }

  private async syncPharmacyWorkflowsFromCall(callId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        business: true,
      },
    });

    if (!call || call.business.category !== "PHARMACY") {
      return;
    }

    const previousRules = readRules(call.business.answeringRules);
    const previousPharmacy =
      previousRules.pharmacy && typeof previousRules.pharmacy === "object" && !Array.isArray(previousRules.pharmacy)
        ? (previousRules.pharmacy as Record<string, unknown>)
        : {};

    const savedRefillRequests = extractSavedPharmacyRefillRequests(call.business.answeringRules);
    const savedCallbackRequests = extractSavedPharmacyCallbackRequests(call.business.answeringRules);

    const derivedRefill = derivePharmacyRefillRequestFromCall(call);
    const derivedCallback = derivePharmacyCallbackRequestFromCall(call);

    const nextRefillRequests = derivedRefill
      ? [
          derivedRefill,
          ...savedRefillRequests.filter((request) => request.id !== derivedRefill.id),
        ].map((request) => {
          const existing = savedRefillRequests.find((entry) => entry.id === request.id);

          return existing
            ? {
                ...request,
                prescriptionNumber: existing.prescriptionNumber || request.prescriptionNumber,
                assignedTo: existing.assignedTo || request.assignedTo,
                status: existing.status || request.status,
              }
            : request;
        })
      : savedRefillRequests;

    const nextCallbackRequests = derivedCallback
      ? [
          derivedCallback,
          ...savedCallbackRequests.filter((request) => request.id !== derivedCallback.id),
        ].map((request) => {
          const existing = savedCallbackRequests.find((entry) => entry.id === request.id);

          return existing
            ? {
                ...request,
                assignedTo: existing.assignedTo || request.assignedTo,
                lastAttemptAt: existing.lastAttemptAt || request.lastAttemptAt,
                priority: existing.priority || request.priority,
                status: existing.status || request.status,
              }
            : request;
        })
      : savedCallbackRequests;

    if (!derivedRefill && !derivedCallback) {
      return;
    }

    await this.prisma.business.update({
      where: { id: call.businessId },
      data: {
        answeringRules: {
          ...previousRules,
          pharmacy: {
            ...previousPharmacy,
            refillRequests: nextRefillRequests,
            callbackRequests: nextCallbackRequests,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });

    if (derivedRefill || derivedCallback) {
      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          summary: derivedRefill
            ? buildPharmacyRefillSummary(derivedRefill)
            : derivedCallback
              ? buildPharmacyCallbackSummary(derivedCallback)
              : call.summary,
        },
      });
    }
  }

  async getRecordingStream(callId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        business: true,
      },
    });

    if (!call?.recordingUrl) {
      throw new NotFoundException("Recording not found.");
    }

    const { accountSid, authToken } = this.resolveTwilioCredentials(call.business?.answeringRules);

    if (!accountSid || !authToken) {
      throw new ServiceUnavailableException("Twilio credentials are not configured yet.");
    }

    const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const playbackUrls = getTwilioPlaybackUrls(call.recordingUrl);
    let lastFailure = "unknown";

    for (const playbackUrl of playbackUrls) {
      const response = await fetchTwilioRecordingWithRedirects(playbackUrl, authHeader);

      if (response.ok && response.body) {
        const arrayBuffer = await response.arrayBuffer();

        return {
          contentType: response.headers.get("content-type") || "audio/mpeg",
          body: Buffer.from(arrayBuffer),
        };
      }

      lastFailure = `${response.status} ${response.statusText}`.trim();
      this.logger.warn(
        `Twilio recording playback fetch failed for callId=${call.id}, url=${playbackUrl}, status=${lastFailure}.`,
      );
    }

    throw new ServiceUnavailableException(
      `Unable to load recording audio from Twilio. Upstream status: ${lastFailure}.`,
    );
  }

  async handleLiveAiTurn(businessId: string, payload: TwilioSpeechPayload) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException("Business not found.");
    }

    const callerSpeech = payload.SpeechResult?.trim() || "";
    const rules = readRules(business.answeringRules);
    const reply = callerSpeech
      ? this.buildBusinessAwareReply(business, rules, callerSpeech)
      : "I did not catch that clearly. Please try calling again, and we will continue improving the live AI assistant.";

    const call = await this.findCallForTwilioEvent(businessId, {
      CallSid: payload.CallSid,
      From: payload.From,
    });

    if (call) {
      const priorTranscript = call.transcript || "";
      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          summary: callerSpeech
            ? `Live AI intake handled caller question: ${callerSpeech.slice(0, 120)}`
            : "Live AI intake could not detect a caller question clearly.",
          transcript: `${priorTranscript}\nCaller said: ${callerSpeech || "[no speech captured]"}\nAssistant replied: ${reply}`.trim(),
        },
      });
    }

    return `<Response><Say voice="alice">${escapeXml(reply)}</Say><Say voice="alice">This is the first live AI foundation step. The next upgrade will keep the conversation going naturally.</Say><Hangup/></Response>`;
  }

  async getRealtimeSessionBlueprint(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException("Business not found.");
    }

    const rules = readRules(business.answeringRules);
    const instructions = this.buildRealtimeInstructions(business, rules);
    const voice = mapVoicePreferenceToRealtimeVoice(business.voicePreference);

    return {
      businessId: business.id,
      model: "gpt-realtime",
      voice,
      instructions,
      aiEnabled: business.aiEnabled,
      callHandlingMode: typeof rules.callHandlingMode === "string" ? rules.callHandlingMode : "LIVE_AI",
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    };
  }

  async handleTwilioMediaStream(twilioSocket: WebSocket, url: URL) {
    const urlBusinessId = url.searchParams.get("businessId") || "";
    let streamSid = "";
    let businessId = urlBusinessId;
    let openAiSocket: WebSocket | null = null;
    let currentCallId = "";
    let activeBusinessName = "The business";
    let activeGreeting = "Thank you for calling. How can I help you today?";
    let activeConsentMessage = "Calls may be recorded and transcribed for service quality and follow-up.";
    let activeEmergencyPrompt = "";
    let introSent = false;
    let responseInFlight = false;
    let callerSpeechPending = false;
    let responseRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let latestCallerTranscript = "";
    let latestAssistantTranscript = "";
    const callerTurns: string[] = [];
    const assistantTurns: string[] = [];
    const transcriptLines: string[] = [];
    const seenCallerTurns = new Set<string>();
    const seenAssistantTurns = new Set<string>();

    const persistTranscript = async (summary?: string, endedAt?: Date) => {
      if (!currentCallId) {
        return;
      }

      await this.prisma.call.update({
        where: { id: currentCallId },
        data: {
          summary: summary || buildRealtimeSummary(callerTurns, assistantTurns),
          transcript: transcriptLines.join("\n\n"),
          endedAt: endedAt || undefined,
        },
      });

      if (endedAt) {
        await this.syncPharmacyWorkflowsFromCall(currentCallId);
        await this.generateStructuredCallSummary(currentCallId);
      }
    };

    const clearResponseRecoveryTimer = () => {
      if (responseRecoveryTimer) {
        clearTimeout(responseRecoveryTimer);
        responseRecoveryTimer = null;
      }
    };

    const triggerAssistantResponse = (forceFallbackPrompt = false) => {
      if (!openAiSocket || openAiSocket.readyState !== WebSocket.OPEN || responseInFlight || !introSent) {
        return;
      }

      responseInFlight = true;
      callerSpeechPending = false;
      clearResponseRecoveryTimer();
      openAiSocket.send(
        JSON.stringify({
          type: "response.create",
          response: forceFallbackPrompt
            ? {
                output_modalities: ["audio"],
                instructions:
                  "The caller spoke but the transcript may be unclear. Politely say you did not catch that clearly and ask them to repeat it.",
              }
            : {
                output_modalities: ["audio"],
              },
        }),
      );
    };

    const scheduleResponseRecovery = () => {
      clearResponseRecoveryTimer();

      responseRecoveryTimer = setTimeout(() => {
        if (callerSpeechPending && !responseInFlight) {
          triggerAssistantResponse(true);
        }
      }, 1800);
    };

    const sendOpeningGreeting = () => {
      if (!openAiSocket || openAiSocket.readyState !== WebSocket.OPEN || introSent) {
        return;
      }

      introSent = true;
      responseInFlight = true;
      const openingGreeting = buildOpeningGreeting(activeGreeting, activeConsentMessage, activeEmergencyPrompt);
      openAiSocket.send(
        JSON.stringify({
          type: "response.create",
          response: {
            output_modalities: ["audio"],
            instructions: `Speak only in English. Say exactly this message and nothing else: "${openingGreeting.replaceAll('"', '\\"')}"`,
          },
        }),
      );
    };

    const initializeOpenAiBridge = async (activeBusinessId: string) => {
      const business = await this.prisma.business.findUnique({
        where: { id: activeBusinessId },
      });

      if (!business) {
        this.logger.warn(`Twilio media stream received unknown businessId=${activeBusinessId}.`);
        twilioSocket.close();
        return;
      }

      activeBusinessName = business.name;
      const rules = readRules(business.answeringRules);
      const telephony =
        rules.telephony && typeof rules.telephony === "object" && !Array.isArray(rules.telephony)
          ? (rules.telephony as Record<string, unknown>)
          : {};
      activeGreeting = business.greetingMessage?.trim() || `Thank you for calling ${business.name}. How can I help you today?`;
      activeConsentMessage =
        typeof telephony.consentMessage === "string" && telephony.consentMessage.trim().length > 0
          ? telephony.consentMessage.trim()
          : "This call may be recorded and transcribed for service quality and follow-up.";
      activeEmergencyPrompt =
        typeof rules.emergencyMessage === "string" && rules.emergencyMessage.trim().length > 0
          ? rules.emergencyMessage.trim()
          : business.medicalModeEnabled
            ? "If this is a medical emergency, please call 911 immediately."
            : "";
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        this.logger.error(`OPENAI_API_KEY is missing for businessId=${activeBusinessId}.`);
        twilioSocket.close();
        return;
      }

      const session = await this.getRealtimeSessionBlueprint(activeBusinessId);
      this.logger.log(`Opening Twilio media bridge for businessId=${activeBusinessId}, model=${session.model}, voice=${session.voice}.`);
      openAiSocket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      openAiSocket.on("open", () => {
        this.logger.log(`OpenAI realtime socket opened for businessId=${activeBusinessId}.`);
        openAiSocket?.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              model: session.model,
              instructions: session.instructions,
              output_modalities: ["audio"],
              audio: {
                input: {
                  format: {
                    type: "audio/pcmu",
                  },
                  noise_reduction: {
                    type: "near_field",
                  },
                  transcription: {
                    model: "gpt-4o-mini-transcribe",
                    language: "en",
                  },
                  turn_detection: {
                    type: "semantic_vad",
                    eagerness: "high",
                    interrupt_response: false,
                    create_response: false,
                  },
                },
                output: {
                  format: {
                    type: "audio/pcmu",
                  },
                  voice: session.voice,
                  speed: 1.0,
                },
              },
            },
          }),
        );
      });

      openAiSocket.on("message", async (message) => {
        const raw = message.toString();
        let event: Record<string, unknown>;
        const appendCallerTranscript = async (transcriptValue: string) => {
          const cleaned = transcriptValue.trim();

          if (
            !cleaned ||
            isInternalTranscriptArtifact(cleaned) ||
            isLowQualityEnglishTranscript(cleaned) ||
            seenCallerTurns.has(cleaned)
          ) {
            return "";
          }

          latestCallerTranscript = cleaned;
          seenCallerTurns.add(cleaned);
          callerTurns.push(cleaned);
          transcriptLines.push(`Caller: ${cleaned}`);
          await persistTranscript(buildRealtimeSummary(callerTurns, assistantTurns));
          return cleaned;
        };

        try {
          event = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          this.logger.warn(`Received non-JSON OpenAI realtime event for businessId=${activeBusinessId}.`);
          return;
        }

        if (typeof event.type === "string") {
          this.logger.debug(`OpenAI realtime event for businessId=${activeBusinessId}: ${event.type}`);
        }

        if (event.type === "error") {
          responseInFlight = false;
          clearResponseRecoveryTimer();
          this.logger.error(
            `OpenAI realtime error for businessId=${activeBusinessId}: ${JSON.stringify(event)}`,
          );
        }

        if (event.type === "session.updated" && !introSent) {
          setTimeout(() => sendOpeningGreeting(), 250);
        }

        if (event.type === "conversation.item.input_audio_transcription.completed" && typeof event.transcript === "string") {
          const capturedTranscript = await appendCallerTranscript(event.transcript);

          if (capturedTranscript) {
            triggerAssistantResponse();
          }
        }

        if (event.type === "response.output_audio_transcript.done" && typeof event.transcript === "string") {
          latestAssistantTranscript = event.transcript.trim();
          if (latestAssistantTranscript && !seenAssistantTurns.has(latestAssistantTranscript)) {
            seenAssistantTurns.add(latestAssistantTranscript);
            assistantTurns.push(latestAssistantTranscript);
            transcriptLines.push(`Assistant: ${latestAssistantTranscript}`);
          }
          await persistTranscript(
            buildRealtimeSummary(callerTurns, assistantTurns),
          );
        }

        if (event.type === "response.done") {
          responseInFlight = false;
          clearResponseRecoveryTimer();
          callerSpeechPending = false;
        }

        if (event.type === "input_audio_buffer.speech_started") {
          callerSpeechPending = true;
        }

        if (event.type === "input_audio_buffer.committed") {
          callerSpeechPending = true;
          scheduleResponseRecovery();
        }

        if (
          event.type === "conversation.item.done" ||
          event.type === "conversation.item.created" ||
          event.type === "conversation.item.input_audio_transcription.delta"
        ) {
          const transcriptCandidates = collectTranscriptText(event);

          for (const candidate of transcriptCandidates) {
            await appendCallerTranscript(candidate);
          }
        }

        if ((event.type === "response.output_audio.delta" || event.type === "response.audio.delta") && typeof event.delta === "string" && streamSid) {
          twilioSocket.send(
            JSON.stringify({
              event: "media",
              streamSid,
              media: {
                payload: event.delta,
              },
            }),
          );
        }

      });

      openAiSocket.on("close", (code, reason) => {
        this.logger.warn(`OpenAI realtime socket closed for businessId=${activeBusinessId}. code=${code} reason=${reason.toString() || "none"}`);
        safeClose();
      });
      openAiSocket.on("error", (error) => {
        this.logger.error(`OpenAI realtime socket error for businessId=${activeBusinessId}: ${error instanceof Error ? error.message : String(error)}`);
        safeClose();
      });
    };

    const safeClose = () => {
      clearResponseRecoveryTimer();
      this.logger.log(`Closing media bridge for businessId=${businessId || "unknown"}, streamSid=${streamSid || "unknown"}.`);
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.close();
      }

      if (openAiSocket && (openAiSocket.readyState === WebSocket.OPEN || openAiSocket.readyState === WebSocket.CONNECTING)) {
        openAiSocket.close();
      }
    };

    twilioSocket.on("close", () => {
      this.logger.warn(`Twilio media socket closed for businessId=${businessId || "unknown"}, streamSid=${streamSid || "unknown"}.`);
      safeClose();
    });
    twilioSocket.on("error", (error) => {
      this.logger.error(`Twilio media socket error for businessId=${businessId || "unknown"}: ${error instanceof Error ? error.message : String(error)}`);
      safeClose();
    });

    twilioSocket.on("message", async (data) => {
      let event: Record<string, unknown>;

      try {
        event = JSON.parse(data.toString()) as Record<string, unknown>;
      } catch {
        this.logger.warn(`Received non-JSON Twilio media event for businessId=${businessId}.`);
        return;
      }

      if (event.event === "start") {
        const start = event.start as Record<string, unknown> | undefined;
        streamSid = typeof event.streamSid === "string" ? event.streamSid : "";
        const callSid = start && typeof start.callSid === "string" ? start.callSid : "unknown";
        const customParameters =
          start && start.customParameters && typeof start.customParameters === "object"
            ? (start.customParameters as Record<string, unknown>)
            : {};
        businessId =
          (typeof customParameters.businessId === "string" ? customParameters.businessId : "") || businessId;
        if (!businessId) {
          this.logger.warn("Twilio media stream started without a businessId in URL or custom parameters.");
          safeClose();
          return;
        }

        if (!openAiSocket) {
          await initializeOpenAiBridge(businessId);
        }

        this.logger.log(`Twilio media stream started for businessId=${businessId}, callSid=${callSid}, streamSid=${streamSid || "unknown"}.`);
        const latestCall = await this.prisma.call.findFirst({
          where: { businessId },
          orderBy: { createdAt: "desc" },
        });

        if (latestCall) {
          currentCallId = latestCall.id;
          transcriptLines.push(`${activeBusinessName} live AI session started. CallSid=${callSid}, StreamSid=${streamSid || "unknown"}.`);
          await this.prisma.call.update({
            where: { id: latestCall.id },
            data: {
              transcript: `${latestCall.transcript || ""}\n${transcriptLines[0]}`.trim(),
              summary: "Live AI call started.",
            },
          });
        }

        return;
      }

      if (event.event === "media") {
        const media = event.media as Record<string, unknown> | undefined;
        const payload = media && typeof media.payload === "string" ? media.payload : "";

        if (payload && openAiSocket && openAiSocket.readyState === WebSocket.OPEN) {
          openAiSocket.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: payload,
            }),
          );
        }
        return;
      }

      if (event.event === "stop") {
        this.logger.log(`Twilio media stream stop received for businessId=${businessId}, streamSid=${streamSid || "unknown"}.`);
        await persistTranscript(undefined, new Date());
        safeClose();
      }
    });
  }

  async createRealtimeSessionFromSdp(businessId: string, sdp: string) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new ServiceUnavailableException("OPENAI_API_KEY is not configured yet.");
    }

    const session = await this.getRealtimeSessionBlueprint(businessId);
    const formData = new FormData();

    formData.set("sdp", sdp);
    formData.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model: session.model,
        instructions: session.instructions,
        audio: {
          output: {
            voice: session.voice,
          },
        },
      }),
    );

    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const answerSdp = await response.text();

    if (!response.ok) {
      throw new ServiceUnavailableException(`OpenAI realtime session failed: ${answerSdp}`);
    }

    return answerSdp;
  }

  buildBaseUrlFromHeaders(headers: Record<string, string | string[] | undefined>) {
    return inferBaseUrl(headers);
  }
}
