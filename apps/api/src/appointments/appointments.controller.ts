import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AppointmentsService } from "./appointments.service";
import {
  appointmentCreateSchema,
  appointmentListQuerySchema,
  appointmentUpdateSchema,
} from "./appointments.schemas";

@Controller("businesses/:businessId/appointments")
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  async listAppointments(
    @Param("businessId") businessId: string,
    @Query() query: unknown,
  ) {
    const parsed = appointmentListQuerySchema.parse(query);
    return this.appointmentsService.listAppointments(businessId, parsed);
  }

  @Get(":appointmentId")
  async getAppointment(
    @Param("businessId") businessId: string,
    @Param("appointmentId") appointmentId: string,
  ) {
    return this.appointmentsService.getAppointment(businessId, appointmentId);
  }

  @Post()
  async createAppointment(@Param("businessId") businessId: string, @Body() body: unknown) {
    const input = appointmentCreateSchema.parse(body);
    return this.appointmentsService.createAppointment(businessId, input);
  }

  @Patch(":appointmentId")
  async updateAppointment(
    @Param("businessId") businessId: string,
    @Param("appointmentId") appointmentId: string,
    @Body() body: unknown,
  ) {
    const input = appointmentUpdateSchema.parse(body);
    return this.appointmentsService.updateAppointment(businessId, appointmentId, input);
  }

  @Delete(":appointmentId")
  async deleteAppointment(
    @Param("businessId") businessId: string,
    @Param("appointmentId") appointmentId: string,
  ) {
    return this.appointmentsService.deleteAppointment(businessId, appointmentId);
  }
}
