import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// ── Resend API ───────────────────────────────────────────────────────────────
// We send via HTTPS to Resend's REST API directly (no SDK needed).
const RESEND_API_URL = "https://api.resend.com/emails";

type ResendSendPayload = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  // In-memory cache so we don't send duplicate business summary emails when
  // both the WebSocket "stop" event AND the Twilio recording-complete webhook
  // trigger for the same call. Cleared on server restart (acceptable trade-off).
  private readonly sentBusinessSummaryCalls = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  // ── Generic send ──────────────────────────────────────────────────────────
  async send(payload: ResendSendPayload): Promise<{ ok: boolean; id?: string; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn("[EMAIL] RESEND_API_KEY not set — skipping send.");
      return { ok: false, error: "missing_api_key" };
    }

    try {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        this.logger.warn(`[EMAIL] Resend send failed: status=${response.status} body=${text}`);
        return { ok: false, error: text || `status_${response.status}` };
      }

      const data = (await response.json()) as { id?: string };
      this.logger.log(`[EMAIL] ✅ Sent email to=${Array.isArray(payload.to) ? payload.to.join(",") : payload.to} subject="${payload.subject}" id=${data.id}`);
      return { ok: true, id: data.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[EMAIL] Resend threw: ${message}`);
      return { ok: false, error: message };
    }
  }

  // ── Business Notification: After every call ──────────────────────────────
  async sendBusinessCallSummary(callId: string) {
    if (this.sentBusinessSummaryCalls.has(callId)) {
      this.logger.log(`[EMAIL] Business summary already sent for callId=${callId} — skipping duplicate.`);
      return;
    }
    this.sentBusinessSummaryCalls.add(callId);

    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { business: true, appointments: true },
    });

    if (!call) {
      this.logger.warn(`[EMAIL] Call not found for callId=${callId}`);
      return;
    }

    const business = call.business;
    // EMAIL_BUSINESS_NOTIFICATION_DEFAULT (env var) takes priority as a
    // platform-level override. Falls back to business.email if env not set.
    const toEmail = process.env.EMAIL_BUSINESS_NOTIFICATION_DEFAULT || business.email;

    if (!toEmail) {
      this.logger.warn(`[EMAIL] No business email configured for businessId=${business.id}`);
      return;
    }

    this.logger.log(`[EMAIL] Preparing business summary to=${toEmail} businessId=${business.id} callId=${call.id}`);

    const fromAddress = process.env.EMAIL_FROM_ADDRESS || "Receptionist AI <onboarding@resend.dev>";
    const subject = `New AI call: ${call.callerName || "Unknown caller"} ${call.callerNumber ? `(${call.callerNumber})` : ""}`;

    const recordingUrl = call.recordingUrl
      ? `${process.env.PUBLIC_API_BASE_URL || ""}/api/telephony/recordings/${call.id}`
      : null;

    const html = renderBusinessSummaryHtml({
      businessName: business.name,
      timezone: business.timezone || "America/Toronto",
      callerName: call.callerName,
      callerNumber: call.callerNumber,
      callerEmail: call.callerEmail,
      summary: call.summary,
      transcript: call.transcript,
      recordingUrl,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      appointments: call.appointments.map((a) => ({
        title: a.title,
        startTime: a.startTime,
        durationMinutes: a.durationMinutes,
        externalEventLink: a.externalEventLink,
      })),
    });

    await this.send({
      from: fromAddress,
      to: toEmail,
      subject,
      html,
    });
  }

  // ── Customer Confirmation: When AI books an appointment ───────────────────
  async sendCustomerAppointmentConfirmation(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { business: true },
    });

    if (!appointment) {
      this.logger.warn(`[EMAIL] Appointment not found for appointmentId=${appointmentId}`);
      return;
    }

    const customerEmail = appointment.customerEmail;
    if (!customerEmail) {
      this.logger.log(`[EMAIL] No customer email for appointment id=${appointmentId} — skipping confirmation.`);
      return;
    }

    const business = appointment.business;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS || "Receptionist AI <onboarding@resend.dev>";
    const subject = `Your appointment with ${business.name} is confirmed`;

    const html = renderCustomerConfirmationHtml({
      businessName: business.name,
      businessPhone: business.phoneNumber,
      businessAddress: business.address,
      businessTimezone: business.timezone || "America/Toronto",
      customerName: appointment.customerName,
      title: appointment.title,
      startTime: appointment.startTime,
      durationMinutes: appointment.durationMinutes,
      notes: appointment.notes,
    });

    const ics = buildIcsString({
      title: appointment.title,
      startTime: appointment.startTime,
      durationMinutes: appointment.durationMinutes,
      description: appointment.notes || "",
      businessName: business.name,
    });

    // Resend supports attachments
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    try {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: customerEmail,
          subject,
          html,
          attachments: [
            {
              filename: "invite.ics",
              content: Buffer.from(ics).toString("base64"),
            },
          ],
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        this.logger.warn(`[EMAIL] Customer confirmation send failed: status=${response.status} body=${text}`);
        return;
      }
      const data = (await response.json()) as { id?: string };
      this.logger.log(`[EMAIL] ✅ Customer confirmation sent to=${customerEmail} appointmentId=${appointmentId} id=${data.id}`);
    } catch (err) {
      this.logger.warn(`[EMAIL] Customer confirmation threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ── HTML Templates ───────────────────────────────────────────────────────────

function renderBusinessSummaryHtml(data: {
  businessName: string;
  timezone: string;
  callerName: string | null;
  callerNumber: string | null;
  callerEmail: string | null;
  summary: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  startedAt: Date;
  endedAt: Date | null;
  appointments: Array<{ title: string; startTime: Date; durationMinutes: number; externalEventLink: string | null }>;
}): string {
  const transcriptHtml = (data.transcript || "")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `<p style="margin: 6px 0; line-height: 1.55;">${escapeHtml(line)}</p>`)
    .join("");

  const appointmentBlock = data.appointments.length
    ? `
      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 16px; margin: 16px 0;">
        <strong style="color: #065f46; font-size: 14px;">📅 ${data.appointments.length} appointment(s) booked during this call</strong>
        ${data.appointments
          .map(
            (a) => `
          <div style="margin-top: 10px; padding: 10px; background: #fff; border-radius: 8px;">
            <strong>${escapeHtml(a.title)}</strong><br/>
            <span style="color: #6b7280; font-size: 13px;">${formatDateTime(a.startTime, data.timezone)} · ${a.durationMinutes} min</span>
            ${a.externalEventLink ? `<br/><a href="${a.externalEventLink}" style="color: #2f55d4; font-size: 13px;">View in Outlook →</a>` : ""}
          </div>`,
          )
          .join("")}
      </div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>New Call</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f7fb; margin: 0; padding: 24px;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
    <div style="background: linear-gradient(135deg, #2f55d4, #1e3a8a); color: #fff; padding: 24px;">
      <div style="font-size: 12px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(data.businessName)} — Receptionist AI</div>
      <h1 style="margin: 8px 0 0; font-size: 22px;">📞 New call summary</h1>
    </div>
    <div style="padding: 24px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Caller</td>
          <td style="padding: 6px 0; font-weight: 600; text-align: right;">${escapeHtml(data.callerName || "Unknown")}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Phone</td>
          <td style="padding: 6px 0; font-weight: 600; text-align: right;">${escapeHtml(data.callerNumber || "—")}</td>
        </tr>
        ${data.callerEmail ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Email</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${escapeHtml(data.callerEmail)}</td></tr>` : ""}
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Started</td>
          <td style="padding: 6px 0; font-weight: 600; text-align: right;">${formatDateTime(data.startedAt, data.timezone)}</td>
        </tr>
      </table>

      ${appointmentBlock}

      ${
        data.summary
          ? `
        <h3 style="margin: 20px 0 8px; font-size: 15px; color: #111827;">AI Summary</h3>
        <div style="background: #f9fafb; border-left: 3px solid #2f55d4; padding: 12px 14px; border-radius: 6px; color: #374151; line-height: 1.6;">
          ${escapeHtml(data.summary)}
        </div>`
          : ""
      }

      ${
        data.recordingUrl
          ? `
        <h3 style="margin: 20px 0 8px; font-size: 15px; color: #111827;">🎙️ Recording</h3>
        <p style="margin: 0;">
          <a href="${data.recordingUrl}" style="color: #fff; background: #2f55d4; padding: 10px 18px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600;">Listen to recording</a>
        </p>`
          : ""
      }

      ${
        transcriptHtml
          ? `
        <h3 style="margin: 24px 0 8px; font-size: 15px; color: #111827;">Full transcript</h3>
        <div style="background: #f9fafb; padding: 14px; border-radius: 8px; color: #374151; font-size: 14px;">
          ${transcriptHtml}
        </div>`
          : ""
      }
    </div>
    <div style="background: #f9fafb; padding: 16px 24px; color: #6b7280; font-size: 12px; text-align: center;">
      Sent by Receptionist AI on behalf of ${escapeHtml(data.businessName)}
    </div>
  </div>
</body>
</html>`;
}

function renderCustomerConfirmationHtml(data: {
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  businessTimezone: string;
  customerName: string | null;
  title: string;
  startTime: Date;
  durationMinutes: number;
  notes: string | null;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Appointment Confirmed</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f7fb; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
    <div style="background: linear-gradient(135deg, #16a34a, #065f46); color: #fff; padding: 32px 24px; text-align: center;">
      <div style="font-size: 38px; line-height: 1;">✅</div>
      <h1 style="margin: 10px 0 4px; font-size: 22px;">Your appointment is confirmed</h1>
      <p style="margin: 0; opacity: 0.95;">with ${escapeHtml(data.businessName)}</p>
    </div>
    <div style="padding: 26px 24px;">
      <p style="margin: 0 0 18px; color: #374151;">${data.customerName ? `Hi ${escapeHtml(data.customerName)}, here's your appointment summary:` : "Here's your appointment summary:"}</p>

      <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; background: #fafbfd;">
        <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Appointment</div>
        <div style="font-size: 18px; font-weight: 700; color: #111827; margin: 4px 0 12px;">${escapeHtml(data.title)}</div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">📅 Date & Time</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right;">${formatDateTime(data.startTime, data.businessTimezone)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">⏱️ Duration</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.durationMinutes} minutes</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">🌐 Timezone</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right;">${escapeHtml(friendlyTimezoneName(data.businessTimezone))}</td>
          </tr>
        </table>
        ${data.notes ? `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;"><div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Notes</div><p style="margin: 4px 0 0; color: #374151; line-height: 1.55;">${escapeHtml(data.notes)}</p></div>` : ""}
      </div>

      <p style="margin: 20px 0 6px; color: #374151;">An invite (.ics) is attached — open it to add this to your calendar automatically.</p>

      <h3 style="margin: 24px 0 6px; font-size: 14px; color: #111827;">Contact information</h3>
      <p style="margin: 0; color: #374151; line-height: 1.7;">
        <strong>${escapeHtml(data.businessName)}</strong><br/>
        ${data.businessPhone ? `📞 ${escapeHtml(data.businessPhone)}<br/>` : ""}
        ${data.businessAddress ? `📍 ${escapeHtml(data.businessAddress)}` : ""}
      </p>

      <p style="margin: 24px 0 0; color: #6b7280; font-size: 13px;">Need to reschedule or cancel? Just reply to this email or give us a call.</p>
    </div>
    <div style="background: #f9fafb; padding: 14px 24px; color: #6b7280; font-size: 12px; text-align: center;">
      Booked via Receptionist AI · Powered by ${escapeHtml(data.businessName)}
    </div>
  </div>
</body>
</html>`;
}

function buildIcsString(data: {
  title: string;
  startTime: Date;
  durationMinutes: number;
  description: string;
  businessName: string;
}): string {
  const start = data.startTime;
  const end = new Date(start.getTime() + data.durationMinutes * 60 * 1000);
  const format = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Receptionist AI//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@receptionist-ai`,
    `DTSTAMP:${format(new Date())}`,
    `DTSTART:${format(start)}`,
    `DTEND:${format(end)}`,
    `SUMMARY:${escapeIcs(data.title)}`,
    `DESCRIPTION:${escapeIcs(data.description)}`,
    `ORGANIZER;CN=${escapeIcs(data.businessName)}:mailto:noreply@${getDomainFromSender()}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function getDomainFromSender(): string {
  const from = process.env.EMAIL_FROM_ADDRESS || "";
  const m = from.match(/@([^\s>]+)/);
  return m ? m[1] : "vivratech.ca";
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Maps IANA timezone identifiers to friendly display names for emails.
function friendlyTimezoneName(timezone: string): string {
  const map: Record<string, string> = {
    "America/Toronto": "Eastern Time",
    "America/New_York": "Eastern Time",
    "America/Detroit": "Eastern Time",
    "America/Montreal": "Eastern Time",
    "America/Chicago": "Central Time",
    "America/Winnipeg": "Central Time",
    "America/Denver": "Mountain Time",
    "America/Edmonton": "Mountain Time",
    "America/Phoenix": "Mountain Time (Arizona)",
    "America/Los_Angeles": "Pacific Time",
    "America/Vancouver": "Pacific Time",
    "America/Halifax": "Atlantic Time",
    "America/St_Johns": "Newfoundland Time",
    "America/Anchorage": "Alaska Time",
    "Pacific/Honolulu": "Hawaii Time",
    "Europe/London": "UK Time",
    "Asia/Kolkata": "India Time",
  };
  return map[timezone] || timezone;
}

function formatDateTime(d: Date, timezone: string = "America/Toronto"): string {
  return new Date(d).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
    timeZoneName: "short",
  });
}
