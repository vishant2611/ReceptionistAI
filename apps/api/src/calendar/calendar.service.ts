import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// ── Microsoft OAuth Endpoints ───────────────────────────────────────────────
// We use the multi-tenant endpoint ("common") so any Microsoft account works:
// personal Outlook accounts, work/school Office 365 accounts, etc.
const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const MS_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Calendars.ReadWrite",
];

type MicrosoftTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

type MicrosoftUserInfo = {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── OAuth — initiate ──────────────────────────────────────────────────────
  buildMicrosoftAuthUrl(businessId: string): string {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const redirectUri = this.getRedirectUri();

    if (!clientId) {
      throw new Error("MICROSOFT_CLIENT_ID is not configured on the server.");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: MS_SCOPES.join(" "),
      state: businessId,
      prompt: "select_account",
    });

    return `${MS_AUTH_URL}?${params.toString()}`;
  }

  // ── OAuth — handle callback ───────────────────────────────────────────────
  async handleMicrosoftCallback(code: string, businessId: string) {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirectUri = this.getRedirectUri();

    if (!clientId || !clientSecret) {
      throw new Error("Microsoft OAuth credentials are not configured.");
    }
    if (!businessId) {
      throw new Error("Missing business context (state).");
    }

    // Exchange code for tokens
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenResponse = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      this.logger.error(`Microsoft token exchange failed: ${errText}`);
      throw new Error("Failed to exchange code for token.");
    }

    const tokens = (await tokenResponse.json()) as MicrosoftTokenResponse;

    // Fetch user info
    const userInfo = await this.fetchMicrosoftUserInfo(tokens.access_token);
    const accountEmail = userInfo.mail || userInfo.userPrincipalName || "";
    const accountName = userInfo.displayName || "";

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Upsert connection
    await this.prisma.calendarConnection.upsert({
      where: {
        businessId_provider: { businessId, provider: "MICROSOFT" },
      },
      update: {
        accountEmail,
        accountName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt,
        scope: tokens.scope || null,
      },
      create: {
        businessId,
        provider: "MICROSOFT",
        accountEmail,
        accountName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt,
        scope: tokens.scope || null,
      },
    });

    this.logger.log(
      `Microsoft calendar connected for businessId=${businessId} account=${accountEmail}`,
    );

    return { businessId, accountEmail, accountName };
  }

  private async fetchMicrosoftUserInfo(accessToken: string): Promise<MicrosoftUserInfo> {
    const response = await fetch(`${MS_GRAPH_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return {};
    return (await response.json()) as MicrosoftUserInfo;
  }

  // ── Status & Disconnect ───────────────────────────────────────────────────
  async getConnectionStatus(businessId: string) {
    const connection = await this.prisma.calendarConnection.findUnique({
      where: { businessId_provider: { businessId, provider: "MICROSOFT" } },
    });
    if (!connection) return { connected: false, provider: "MICROSOFT" };
    return {
      connected: true,
      provider: "MICROSOFT",
      accountEmail: connection.accountEmail,
      accountName: connection.accountName,
      connectedAt: connection.createdAt,
    };
  }

  async disconnect(businessId: string) {
    await this.prisma.calendarConnection.deleteMany({
      where: { businessId, provider: "MICROSOFT" },
    });
    return { message: "Microsoft calendar disconnected." };
  }

  // ── Token refresh ─────────────────────────────────────────────────────────
  private async getValidAccessToken(businessId: string): Promise<string | null> {
    const conn = await this.prisma.calendarConnection.findUnique({
      where: { businessId_provider: { businessId, provider: "MICROSOFT" } },
    });
    if (!conn) {
      this.logger.warn(`[CAL] No Microsoft connection found for businessId=${businessId}`);
      return null;
    }

    // If token is still valid for > 2 minutes, use it
    if (conn.expiresAt.getTime() > Date.now() + 2 * 60 * 1000) {
      return conn.accessToken;
    }

    // Refresh
    if (!conn.refreshToken) {
      this.logger.warn(`No refresh token for businessId=${businessId}`);
      return null;
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
      scope: MS_SCOPES.join(" "),
    });

    const response = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      this.logger.error(`Microsoft token refresh failed for businessId=${businessId}: ${await response.text()}`);
      return null;
    }

    const tokens = (await response.json()) as MicrosoftTokenResponse;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await this.prisma.calendarConnection.update({
      where: { businessId_provider: { businessId, provider: "MICROSOFT" } },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || conn.refreshToken,
        expiresAt,
      },
    });

    return tokens.access_token;
  }

  // ── Create calendar event ─────────────────────────────────────────────────
  async createEvent(
    businessId: string,
    appointment: {
      title: string;
      startTime: Date;
      durationMinutes: number;
      customerName?: string | null;
      customerPhone?: string | null;
      customerEmail?: string | null;
      notes?: string | null;
      serviceName?: string | null;
      recordingUrl?: string | null;
    },
    timezone: string,
  ): Promise<{ eventId: string; webLink: string } | null> {
    const accessToken = await this.getValidAccessToken(businessId);
    if (!accessToken) return null;

    const endTime = new Date(
      appointment.startTime.getTime() + appointment.durationMinutes * 60 * 1000,
    );

    const bodyLines: string[] = [];
    if (appointment.customerName) bodyLines.push(`Customer: ${appointment.customerName}`);
    if (appointment.customerPhone) bodyLines.push(`Phone: ${appointment.customerPhone}`);
    if (appointment.customerEmail) bodyLines.push(`Email: ${appointment.customerEmail}`);
    if (appointment.serviceName) bodyLines.push(`Service: ${appointment.serviceName}`);
    if (appointment.notes) bodyLines.push(`Notes: ${appointment.notes}`);
    if (appointment.recordingUrl) bodyLines.push(`Recording: ${appointment.recordingUrl}`);
    bodyLines.push("");
    bodyLines.push("Booked via Receptionist AI.");

    const event = {
      subject: appointment.title,
      body: {
        contentType: "text",
        content: bodyLines.join("\n"),
      },
      start: {
        dateTime: appointment.startTime.toISOString().replace("Z", ""),
        timeZone: "UTC",
      },
      end: {
        dateTime: endTime.toISOString().replace("Z", ""),
        timeZone: "UTC",
      },
      attendees: appointment.customerEmail
        ? [
            {
              emailAddress: { address: appointment.customerEmail, name: appointment.customerName || "" },
              type: "required",
            },
          ]
        : [],
    };

    this.logger.log(`[CAL] Creating Microsoft event for businessId=${businessId}, subject="${event.subject}"`);
    const response = await fetch(`${MS_GRAPH_BASE}/me/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.error(`[CAL] Microsoft event create failed: status=${response.status} body=${text}`);
      return null;
    }

    const created = (await response.json()) as { id: string; webLink: string };
    this.logger.log(`[CAL] ✅ Microsoft event created: id=${created.id}`);
    return { eventId: created.id, webLink: created.webLink };
  }

  // ── Delete calendar event ─────────────────────────────────────────────────
  async deleteEvent(businessId: string, eventId: string): Promise<boolean> {
    this.logger.log(`[CAL] Deleting event eventId=${eventId} for businessId=${businessId}`);
    const accessToken = await this.getValidAccessToken(businessId);
    if (!accessToken) {
      this.logger.warn(`[CAL] Cannot delete event — no access token.`);
      return false;
    }

    // Microsoft event IDs are base64-like and need URL encoding
    const encodedId = encodeURIComponent(eventId);
    const response = await fetch(`${MS_GRAPH_BASE}/me/events/${encodedId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.warn(`[CAL] Delete event failed: status=${response.status} body=${text}`);
      return false;
    }
    this.logger.log(`[CAL] ✅ Deleted event eventId=${eventId} from Outlook.`);
    return true;
  }

  // ── Check busy times in external calendar ─────────────────────────────────
  async isTimeBusy(
    businessId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<boolean> {
    const accessToken = await this.getValidAccessToken(businessId);
    if (!accessToken) return false;

    // Use Microsoft Graph's calendar/getSchedule for availability
    const userEmail = await this.getUserEmail(businessId);
    if (!userEmail) return false;

    const requestBody = {
      schedules: [userEmail],
      startTime: { dateTime: startTime.toISOString(), timeZone: "UTC" },
      endTime: { dateTime: endTime.toISOString(), timeZone: "UTC" },
      availabilityViewInterval: 15,
    };

    const response = await fetch(`${MS_GRAPH_BASE}/me/calendar/getSchedule`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      this.logger.warn(`getSchedule failed: ${await response.text()}`);
      return false;
    }

    const data = (await response.json()) as {
      value?: Array<{ availabilityView?: string }>;
    };

    const view = data.value?.[0]?.availabilityView || "";
    // availabilityView is a string of chars: 0=free, 1=tentative, 2=busy, 3=oof, 4=working elsewhere
    return /[234]/.test(view);
  }

  private getRedirectUri(): string {
    const explicit = process.env.MICROSOFT_REDIRECT_URI;
    if (explicit) return explicit;
    const baseUrl =
      process.env.PUBLIC_API_BASE_URL ||
      process.env.RAILWAY_PUBLIC_DOMAIN_API ||
      "http://localhost:4000";
    const cleaned = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
    return `${cleaned}/api/calendar/microsoft/callback`;
  }

  private async getUserEmail(businessId: string): Promise<string | null> {
    const conn = await this.prisma.calendarConnection.findUnique({
      where: { businessId_provider: { businessId, provider: "MICROSOFT" } },
    });
    return conn?.accountEmail || null;
  }
}
