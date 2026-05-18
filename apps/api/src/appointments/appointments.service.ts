import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AppointmentCreateInput,
  AppointmentListQuery,
  AppointmentUpdateInput,
} from "./appointments.schemas";

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAppointments(businessId: string, query: AppointmentListQuery) {
    const where: Record<string, unknown> = { businessId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.start || query.end) {
      const startTimeFilter: Record<string, Date> = {};
      if (query.start) startTimeFilter.gte = new Date(query.start);
      if (query.end) startTimeFilter.lte = new Date(query.end);
      where.startTime = startTimeFilter;
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      orderBy: { startTime: "asc" },
      include: {
        call: {
          select: {
            id: true,
            recordingUrl: true,
            transcript: true,
            summary: true,
            startedAt: true,
          },
        },
      },
    });

    return { appointments };
  }

  async getAppointment(businessId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      include: {
        call: {
          select: {
            id: true,
            recordingUrl: true,
            transcript: true,
            summary: true,
            startedAt: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found.");
    }

    return { appointment };
  }

  async createAppointment(businessId: string, input: AppointmentCreateInput) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException("Business not found.");
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        businessId,
        title: input.title.trim(),
        customerName: (input.customerName || "").trim() || null,
        customerPhone: (input.customerPhone || "").trim() || null,
        customerEmail: (input.customerEmail || "").trim() || null,
        serviceName: (input.serviceName || "").trim() || null,
        notes: (input.notes || "").trim() || null,
        startTime: new Date(input.startTime),
        durationMinutes: input.durationMinutes,
        status: input.status,
        callId: input.callId || null,
      },
    });

    return { message: "Appointment created successfully.", appointment };
  }

  async updateAppointment(
    businessId: string,
    appointmentId: string,
    input: AppointmentUpdateInput,
  ) {
    const existing = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
    });
    if (!existing) {
      throw new NotFoundException("Appointment not found.");
    }

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.customerName !== undefined) data.customerName = input.customerName.trim() || null;
    if (input.customerPhone !== undefined) data.customerPhone = input.customerPhone.trim() || null;
    if (input.customerEmail !== undefined) data.customerEmail = input.customerEmail.trim() || null;
    if (input.serviceName !== undefined) data.serviceName = input.serviceName.trim() || null;
    if (input.notes !== undefined) data.notes = input.notes.trim() || null;
    if (input.startTime !== undefined) data.startTime = new Date(input.startTime);
    if (input.durationMinutes !== undefined) data.durationMinutes = input.durationMinutes;
    if (input.status !== undefined) data.status = input.status;
    if (input.callId !== undefined) data.callId = input.callId || null;

    const appointment = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data,
    });

    return { message: "Appointment updated successfully.", appointment };
  }

  async deleteAppointment(businessId: string, appointmentId: string) {
    const existing = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
    });
    if (!existing) {
      throw new NotFoundException("Appointment not found.");
    }

    await this.prisma.appointment.delete({ where: { id: appointmentId } });

    return { message: "Appointment cancelled successfully." };
  }
}
