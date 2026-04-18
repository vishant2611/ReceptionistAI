import { All, Body, Controller, Header, Param, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { TelephonyService } from "./telephony.service";

@Controller("telephony")
export class TelephonyController {
  constructor(private readonly telephonyService: TelephonyService) {}

  @All("twilio/voice/inbound")
  @Header("Content-Type", "text/xml")
  async handleTwilioInboundByNumber(
    @Req() req: Request,
    @Body() body: Record<string, string | undefined>,
  ) {
    const baseUrl = this.telephonyService.buildBaseUrlFromHeaders(req.headers);
    return this.telephonyService.handleTwilioInboundCallByNumberWithBaseUrl(body, baseUrl);
  }

  @All("twilio/voice/:businessId/inbound")
  @Header("Content-Type", "text/xml")
  async handleTwilioInbound(
    @Param("businessId") businessId: string,
    @Req() req: Request,
    @Body() body: Record<string, string | undefined>,
  ) {
    const baseUrl = this.telephonyService.buildBaseUrlFromHeaders(req.headers);
    return this.telephonyService.handleTwilioInboundCallWithBaseUrl(businessId, body, baseUrl);
  }

  @All("twilio/voice/:businessId/recording-complete")
  @Header("Content-Type", "text/xml")
  async handleRecordingComplete(
    @Param("businessId") businessId: string,
    @Body() body: Record<string, string | undefined>,
  ) {
    return this.telephonyService.handleRecordingComplete(businessId, body);
  }

  @All("twilio/voice/:businessId/transcription")
  async handleTranscription(
    @Param("businessId") businessId: string,
    @Body() body: Record<string, string | undefined>,
  ) {
    return this.telephonyService.handleTranscriptionCallback(businessId, body);
  }

  @All("twilio/voice/:businessId/live-ai-turn")
  @Header("Content-Type", "text/xml")
  async handleLiveAiTurn(
    @Param("businessId") businessId: string,
    @Body() body: Record<string, string | undefined>,
  ) {
    return this.telephonyService.handleLiveAiTurn(businessId, body);
  }

  @All("ai-session/:businessId")
  async getRealtimeBlueprint(@Param("businessId") businessId: string) {
    return this.telephonyService.getRealtimeSessionBlueprint(businessId);
  }

  @All("realtime/:businessId/session")
  @Header("Content-Type", "application/sdp")
  async createRealtimeSession(
    @Param("businessId") businessId: string,
    @Body() body: string,
  ) {
    return this.telephonyService.createRealtimeSessionFromSdp(businessId, body);
  }

  @All("recordings/:callId")
  async streamRecording(
    @Param("callId") callId: string,
    @Res() res: Response,
  ) {
    const recording = await this.telephonyService.getRecordingStream(callId);
    res.setHeader("Content-Type", recording.contentType);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.send(recording.body);
  }
}
