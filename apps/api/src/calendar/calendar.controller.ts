import { Controller, Delete, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CalendarService } from "./calendar.service";

@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  // Returns the Microsoft OAuth URL the frontend should redirect the user to.
  @Get("microsoft/auth")
  async startMicrosoftAuth(@Query("businessId") businessId: string) {
    if (!businessId) {
      return { error: "businessId is required." };
    }
    const url = this.calendarService.buildMicrosoftAuthUrl(businessId);
    return { url };
  }

  // OAuth callback — Microsoft redirects here with ?code=... &state=businessId
  @Get("microsoft/callback")
  async handleMicrosoftCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Query("error_description") errorDescription: string,
    @Res() res: Response,
  ) {
    const portalBase = process.env.PUBLIC_WEB_BASE_URL || "";
    const redirectBase = portalBase
      ? `${portalBase}/portal/calendar`
      : `/portal/calendar`;

    if (error) {
      return res.redirect(
        `${redirectBase}?error=${encodeURIComponent(errorDescription || error)}`,
      );
    }
    if (!code || !state) {
      return res.redirect(`${redirectBase}?error=missing_params`);
    }

    try {
      const result = await this.calendarService.handleMicrosoftCallback(code, state);
      return res.redirect(
        `${redirectBase}?businessId=${result.businessId}&connected=microsoft`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.redirect(
        `${redirectBase}?error=${encodeURIComponent(message)}`,
      );
    }
  }

  @Get(":businessId/status")
  async getStatus(@Param("businessId") businessId: string) {
    return this.calendarService.getConnectionStatus(businessId);
  }

  @Delete(":businessId/microsoft")
  async disconnect(@Param("businessId") businessId: string) {
    return this.calendarService.disconnect(businessId);
  }
}
