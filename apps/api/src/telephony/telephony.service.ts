import { Injectable, NotFoundException } from "@nestjs/common";
import { CallStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

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

function inferBaseUrl(headers: Record<string, string | string[] | undefined>) {
  const protoHeader = headers["x-forwarded-proto"];
  const hostHeader = headers["x-forwarded-host"] ?? headers.host;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto || "http"}://${host}`;
}

function normalizeText(value: string) {
  return value.toLowerCase();
}

@Injectable()
export class TelephonyService {
  constructor(private readonly prisma: PrismaService) {}

  private buildBusinessAwareReply(
    business: {
      name: string;
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

      return `I can help with that, but the current operating hours have not been fully configured in the portal yet.`;
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

      return `The service summary is still being updated, but I can capture what you need and pass it to the team.`;
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
      const gatherAction = `${baseUrl}/api/telephony/twilio/voice/${businessId}/live-ai-turn`;
      const intro = [
        greeting,
        consentMessage,
        "Please briefly tell me how I can help you today after the tone.",
        emergencyMessage,
      ].filter(Boolean);

      return `<Response>${intro
        .map((line) => `<Say voice="alice">${escapeXml(line)}</Say>`)
        .join("")}<Gather input="speech" action="${escapeXml(gatherAction)}" method="POST" speechTimeout="auto" speechModel="phone_call" /><Say voice="alice">I did not hear anything, so I will end the call for now. Goodbye.</Say><Hangup/></Response>`;
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

  buildBaseUrlFromHeaders(headers: Record<string, string | string[] | undefined>) {
    return inferBaseUrl(headers);
  }
}
