import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { businessMemberCreateSchema } from "./business-members.schemas";
import { BusinessesService } from "./businesses.service";
import {
  businessAiSettingsSchema,
  businessMenuUpdateSchema,
  businessOnboardingSchema,
  businessProfileUpdateSchema,
  businessTelephonySettingsSchema,
} from "./businesses.schemas";

@Controller("businesses")
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Get(":businessId")
  async getBusiness(@Param("businessId") businessId: string) {
    return this.businessesService.getBusinessById(businessId);
  }

  @Patch(":businessId/profile")
  async updateProfile(@Param("businessId") businessId: string, @Body() body: unknown) {
    const input = businessProfileUpdateSchema.parse(body);
    return this.businessesService.updateProfile(businessId, input);
  }

  @Patch(":businessId/menu")
  async updateMenu(@Param("businessId") businessId: string, @Body() body: unknown) {
    const input = businessMenuUpdateSchema.parse(body);
    return this.businessesService.updateMenu(businessId, input);
  }

  @Get(":businessId/members")
  async listMembers(@Param("businessId") businessId: string) {
    return this.businessesService.listMembers(businessId);
  }

  @Get(":businessId/calls")
  async listCalls(@Param("businessId") businessId: string) {
    return this.businessesService.listCalls(businessId);
  }

  @Patch(":businessId/members")
  async addMember(@Param("businessId") businessId: string, @Body() body: unknown) {
    const input = businessMemberCreateSchema.parse(body);
    return this.businessesService.addMember(businessId, input);
  }

  @Patch(":businessId/onboarding")
  async updateOnboarding(@Param("businessId") businessId: string, @Body() body: unknown) {
    const input = businessOnboardingSchema.parse(body);
    return this.businessesService.updateOnboarding(businessId, input);
  }

  @Patch(":businessId/ai-settings")
  async updateAiSettings(@Param("businessId") businessId: string, @Body() body: unknown) {
    const input = businessAiSettingsSchema.parse(body);
    return this.businessesService.updateAiSettings(businessId, input);
  }

  @Patch(":businessId/telephony-settings")
  async updateTelephonySettings(@Param("businessId") businessId: string, @Body() body: unknown) {
    const input = businessTelephonySettingsSchema.parse(body);
    return this.businessesService.updateTelephonySettings(businessId, input);
  }
}
