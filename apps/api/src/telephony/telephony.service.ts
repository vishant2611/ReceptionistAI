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

type LiveRecordingContext = {
  callbackUrl?: string;
  started: boolean;
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

function inferBaseUrl(headers: Record<string, string | string[] | undefined>) {
  const protoHeader = headers["x-forwarded-proto"];
  const hostHeader = headers["x-forwarded-host"] ?? headers.host;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto || "http"}://${host}`;
}

function encodeFormBody(values: Record<string, string>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    params.set(key, value);
  }

  return params.toString();
}

function getTwilioPlaybackUrl(recordingUrl: string) {
  return /^https:\/\/api\.twilio\.com\/.+\/Recordings\/[^./?]+$/i.test(recordingUrl) ? `${recordingUrl}.mp3` : recordingUrl;
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

function buildRealtimeSummary(callerTurns: string[]) {
  const structuredSummary = extractStructuredSummary(callerTurns);

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

function extractStructuredSummary(callerTurns: string[]) {
  const meaningfulTurns = callerTurns.filter((turn) => !isLowQualityEnglishTranscript(turn));

  if (meaningfulTurns.length === 0) {
    return "";
  }

  const latestOrderTurn = [...meaningfulTurns]
    .reverse()
    .find((turn) => /(order|pickup|deliver|delivery|for\s+\d+|today|tomorrow|p\.m\.|a\.m\.)/i.test(turn));
  const latestCallbackTurn = [...meaningfulTurns]
    .reverse()
    .find((turn) => /(call me|callback|manager|phone number|reach me)/i.test(turn));

  if (latestOrderTurn) {
    const callbackSuffix = latestCallbackTurn ? " Contact details were also discussed for follow-up." : "";
    return `Caller placed a pending order request: ${latestOrderTurn.slice(0, 180)}.${callbackSuffix}`.replace("..", ".");
  }

  if (latestCallbackTurn) {
    return `Caller requested follow-up: ${latestCallbackTurn.slice(0, 180)}.`;
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
    }))
    .filter((item) => item.name.length > 0 && item.category.length > 0);

  if (normalizedItems.length === 0) {
    return "";
  }

  return normalizedItems
    .map((item) =>
      `${item.name} (${item.category})${item.price ? ` - ${item.price}` : ""}${item.available ? "" : " - unavailable"}${item.description ? `: ${item.description}` : ""}`,
    )
    .join("; ");
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

@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      "If the caller asks about menu categories like soups or salads and exact items are not stored, mention only the saved category or price range and say the exact item list is not loaded yet.",
      "For restaurant or bakery calls, treat the conversation as an order request unless the exact item list, quantities, fulfillment method, and contact details are explicitly confirmed by the caller.",
      "Do not claim that an order is fully confirmed unless those details are clearly collected.",
      "If the caller mentions an item that is not present in saved business data, say you can note the request for staff review instead of pretending it is available.",
      "Never repeat or summarize a caller name, quantity, phone number, pickup time, or order item unless the caller explicitly said it clearly in the conversation.",
      "If a caller gives only partial order details, explicitly ask for the missing fields instead of guessing.",
      "If you are uncertain about a name, phone number, quantity, or item, say that you did not catch it clearly and ask the caller to repeat it.",
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

    return this.prisma.call.findFirst({
      where: {
        businessId,
        callerNumber: payload.From?.trim() || undefined,
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
    const consentMessage =
      typeof telephony.consentMessage === "string" && telephony.consentMessage.trim().length > 0
        ? telephony.consentMessage.trim()
        : "This call may be recorded and transcribed for service quality and follow-up.";
    const callHandlingMode =
      typeof rules.callHandlingMode === "string" ? rules.callHandlingMode : "LIVE_AI";

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

      return `<Response><Connect><Stream url="${escapeXml(streamUrl)}"><Parameter name="businessId" value="${escapeXml(businessId)}" /><Parameter name="recordingCallbackUrl" value="${escapeXml(recordingCallbackUrl)}" /></Stream></Connect></Response>`;
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
    const call = await this.findCallForTwilioEvent(businessId, payload);

    if (call) {
      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          recordingUrl: payload.RecordingUrl?.trim() || call.recordingUrl,
          summary: payload.RecordingDuration
            ? `Caller left a recorded message (${payload.RecordingDuration} seconds).`
            : "Caller left a recorded message.",
          transcript: `${call.transcript || ""}\nRecording complete. RecordingUrl=${payload.RecordingUrl || "unknown"}, Duration=${payload.RecordingDuration || "unknown"}, EndedBy=${payload.Digits || "timeout"}.`.trim(),
        },
      });
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
    }

    return { ok: true };
  }

  async getRecordingStream(callId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
    });

    if (!call?.recordingUrl) {
      throw new NotFoundException("Recording not found.");
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

    if (!accountSid || !authToken) {
      throw new ServiceUnavailableException("Twilio credentials are not configured yet.");
    }

    const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(getTwilioPlaybackUrl(call.recordingUrl), {
      headers: {
        Authorization: `Basic ${authHeader}`,
      },
    });

    if (!response.ok || !response.body) {
      throw new ServiceUnavailableException("Unable to load recording audio from Twilio.");
    }

    const arrayBuffer = await response.arrayBuffer();

    return {
      contentType: response.headers.get("content-type") || "audio/mpeg",
      body: Buffer.from(arrayBuffer),
    };
  }

  private async startTwilioLiveRecording(callSid: string, context: LiveRecordingContext) {
    if (context.started || !context.callbackUrl) {
      return;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

    if (!accountSid || !authToken) {
      this.logger.warn(`Twilio live recording skipped for CallSid=${callSid} because credentials are not configured.`);
      return;
    }

    const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls/${encodeURIComponent(callSid)}/Recordings.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: encodeFormBody({
          RecordingStatusCallback: context.callbackUrl,
          RecordingStatusCallbackMethod: "POST",
          RecordingChannels: "mono",
          RecordingTrack: "both",
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Twilio live recording start failed for CallSid=${callSid}: ${errorText}`);
      return;
    }

    context.started = true;
    this.logger.log(`Twilio live recording started for CallSid=${callSid}.`);
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
    let latestCallerTranscript = "";
    let latestAssistantTranscript = "";
    const liveRecordingContext: LiveRecordingContext = {
      callbackUrl: "",
      started: false,
    };
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
          summary: summary || buildRealtimeSummary(callerTurns),
          transcript: transcriptLines.join("\n\n"),
          endedAt: endedAt || undefined,
        },
      });
    };

    const sendOpeningGreeting = () => {
      if (!openAiSocket || openAiSocket.readyState !== WebSocket.OPEN || introSent) {
        return;
      }

      introSent = true;
      responseInFlight = true;
      openAiSocket.send(
        JSON.stringify({
          type: "response.create",
          response: {
            output_modalities: ["audio"],
            instructions: [
              activeGreeting,
              activeConsentMessage,
              activeEmergencyPrompt,
              "Start speaking now with a smooth professional receptionist greeting.",
              "End with: How can I help you today?",
              "Do not wait for the caller before saying this opening greeting.",
            ]
              .filter(Boolean)
              .join(" "),
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
      activeEmergencyPrompt = business.medicalModeEnabled ? "If this is a medical emergency, please call 911 immediately." : "";

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
          await persistTranscript(buildRealtimeSummary(callerTurns));
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
          this.logger.error(
            `OpenAI realtime error for businessId=${activeBusinessId}: ${JSON.stringify(event)}`,
          );
        }

        if (event.type === "session.updated" && !introSent) {
          setTimeout(() => sendOpeningGreeting(), 250);
        }

        if (event.type === "conversation.item.input_audio_transcription.completed" && typeof event.transcript === "string") {
          const capturedTranscript = await appendCallerTranscript(event.transcript);

          if (capturedTranscript && introSent && !responseInFlight) {
            responseInFlight = true;
            openAiSocket?.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  output_modalities: ["audio"],
                },
              }),
            );
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
            buildRealtimeSummary(callerTurns),
          );
        }

        if (event.type === "response.done") {
          responseInFlight = false;
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
        liveRecordingContext.callbackUrl =
          typeof customParameters.recordingCallbackUrl === "string" ? customParameters.recordingCallbackUrl : "";

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

        await this.startTwilioLiveRecording(callSid, liveRecordingContext);
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
