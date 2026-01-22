/**
 * Epic 30: AI Receptionist Agent - Scheduling Agent
 * US-302: Appointment scheduling agent
 *
 * AI agent that books, reschedules, and cancels appointments through
 * natural language conversation understanding.
 */

import type { PrismaClient } from '@prisma/client';
import type { AIActionResult, AIActionType } from '@prisma/client';
import type {
  CallState,
  CallContext,
  AppointmentContext,
  AvailableSlot,
} from './types';

// ==================== Types ====================

export interface SchedulingRequest {
  type: 'book' | 'reschedule' | 'cancel';
  patientId?: string;
  appointmentId?: string;
  appointmentTypeId?: string;
  appointmentTypeName?: string;
  providerId?: string;
  providerName?: string;
  preferredDate?: Date;
  preferredTimeStart?: string;
  preferredTimeEnd?: string;
  notes?: string;
}

export interface SchedulingResponse {
  success: boolean;
  message: string;
  appointmentId?: string;
  suggestedSlots?: AvailableSlot[];
  needsInfo?: ('patient' | 'type' | 'provider' | 'date' | 'time' | 'confirm' | 'insurance')[];
  actionResult: AIActionResult; // SUCCESS, PARTIAL, FAILED, PENDING
}

export interface PatientInfo {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  phone?: string;
  email?: string;
  insuranceProvider?: string;
  insuranceMemberId?: string;
  isNewPatient: boolean;
}

export interface SchedulingAgentConfig {
  organizationId: string;
  maxSuggestions?: number;
  defaultDuration?: number;
  allowSameDayBooking?: boolean;
  advanceBookingDays?: number;
  confirmationMethod?: 'sms' | 'email' | 'both' | 'ask';
}

// ==================== Scheduling Agent ====================

export class SchedulingAgent {
  private prisma: PrismaClient;
  private config: SchedulingAgentConfig;

  constructor(prisma: PrismaClient, config: SchedulingAgentConfig) {
    this.prisma = prisma;
    this.config = {
      maxSuggestions: config.maxSuggestions ?? 5,
      defaultDuration: config.defaultDuration ?? 30,
      allowSameDayBooking: config.allowSameDayBooking ?? true,
      advanceBookingDays: config.advanceBookingDays ?? 60,
      confirmationMethod: config.confirmationMethod ?? 'ask',
      ...config,
    };
  }

  // ==================== Natural Language Understanding ====================

  /**
   * Parse natural language scheduling request
   */
  parseSchedulingRequest(
    userInput: string,
    context: CallContext
  ): SchedulingRequest {
    const lowerInput = userInput.toLowerCase();
    const request: SchedulingRequest = { type: 'book' };

    // Determine request type
    if (lowerInput.match(/\b(reschedule|change|move|different)\b/)) {
      request.type = 'reschedule';
    } else if (lowerInput.match(/\b(cancel|remove|delete)\b/)) {
      request.type = 'cancel';
    }

    // Extract appointment type mentions
    const typePatterns: Record<string, string[]> = {
      'new_patient': ['new patient', 'first time', 'first visit', 'initial'],
      'adjustment': ['adjustment', 'regular', 'routine'],
      'follow_up': ['follow up', 'followup', 'follow-up', 'check'],
      'consultation': ['consultation', 'consult'],
      'exam': ['exam', 'examination', 'evaluation'],
      'therapy': ['therapy', 'physical therapy', 'pt'],
    };

    for (const [typeKey, patterns] of Object.entries(typePatterns)) {
      if (patterns.some(p => lowerInput.includes(p))) {
        request.appointmentTypeName = typeKey;
        break;
      }
    }

    // Extract date mentions
    const dateInfo = this.extractDateFromText(userInput);
    if (dateInfo) {
      request.preferredDate = dateInfo;
    }

    // Extract time preferences
    const timeInfo = this.extractTimeFromText(userInput);
    if (timeInfo) {
      request.preferredTimeStart = timeInfo.start;
      request.preferredTimeEnd = timeInfo.end;
    }

    // Extract provider preference
    const providerMatch = lowerInput.match(/(?:dr\.?|doctor)\s+(\w+)/i);
    if (providerMatch) {
      request.providerName = providerMatch[1];
    }

    // Use context if available
    if (context.appointmentContext) {
      const apptCtx = context.appointmentContext;
      if (apptCtx.appointmentTypeId) {
        request.appointmentTypeId = apptCtx.appointmentTypeId;
      }
      if (apptCtx.providerId) {
        request.providerId = apptCtx.providerId;
      }
    }

    return request;
  }

  /**
   * Extract date from natural language
   */
  private extractDateFromText(text: string): Date | null {
    const lowerText = text.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Today/tomorrow
    if (lowerText.includes('today')) {
      return today;
    }
    if (lowerText.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    // Day of week
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (lowerText.includes(days[i])) {
        const targetDay = i;
        const currentDay = today.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7; // Next week if today or past

        // Check for "next" modifier
        if (lowerText.includes('next ' + days[i])) {
          daysUntil += 7;
        }

        const result = new Date(today);
        result.setDate(result.getDate() + daysUntil);
        return result;
      }
    }

    // This week / next week
    if (lowerText.includes('next week')) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }
    if (lowerText.includes('this week')) {
      return today;
    }

    // Specific date patterns (e.g., "January 15", "1/15", "the 15th")
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'];

    for (let i = 0; i < monthNames.length; i++) {
      const monthPattern = new RegExp(`${monthNames[i]}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i');
      const match = lowerText.match(monthPattern);
      if (match) {
        const day = parseInt(match[1], 10);
        const result = new Date(today.getFullYear(), i, day);
        if (result < today) {
          result.setFullYear(result.getFullYear() + 1);
        }
        return result;
      }
    }

    // MM/DD pattern
    const slashPattern = /(\d{1,2})\/(\d{1,2})/;
    const slashMatch = text.match(slashPattern);
    if (slashMatch) {
      const month = parseInt(slashMatch[1], 10) - 1;
      const day = parseInt(slashMatch[2], 10);
      const result = new Date(today.getFullYear(), month, day);
      if (result < today) {
        result.setFullYear(result.getFullYear() + 1);
      }
      return result;
    }

    return null;
  }

  /**
   * Extract time preference from natural language
   */
  private extractTimeFromText(text: string): { start: string; end: string } | null {
    const lowerText = text.toLowerCase();

    // Morning/afternoon/evening
    if (lowerText.includes('morning') || lowerText.includes('am')) {
      return { start: '08:00', end: '12:00' };
    }
    if (lowerText.includes('afternoon')) {
      return { start: '12:00', end: '17:00' };
    }
    if (lowerText.includes('evening') || lowerText.includes('late')) {
      return { start: '17:00', end: '19:00' };
    }

    // Specific time patterns
    const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
    const matches = Array.from(text.matchAll(timePattern));

    if (matches.length > 0) {
      const match = matches[0];
      let hour = parseInt(match[1], 10);
      const minute = match[2] ? parseInt(match[2], 10) : 0;
      const period = match[3]?.toLowerCase();

      if (period === 'pm' && hour < 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;

      const start = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const endHour = hour + 2;
      const end = `${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

      return { start, end };
    }

    return null;
  }

  // ==================== Booking Operations ====================

  /**
   * Book an appointment from conversation
   */
  async bookAppointment(
    request: SchedulingRequest,
    callState: CallState
  ): Promise<SchedulingResponse> {
    const { patientId } = callState;

    // Check what info we're missing
    const missingInfo: SchedulingResponse['needsInfo'] = [];

    if (!patientId) {
      missingInfo.push('patient');
    }

    if (!request.appointmentTypeId && !request.appointmentTypeName) {
      missingInfo.push('type');
    }

    if (!request.preferredDate) {
      missingInfo.push('date');
    }

    if (!request.preferredTimeStart) {
      missingInfo.push('time');
    }

    // If we have enough info, find available slots
    if (missingInfo.length <= 1 && patientId) {
      // Get or resolve appointment type
      let appointmentTypeId = request.appointmentTypeId;
      let appointmentType: { id: string; name: string; duration: number } | null = null;

      if (!appointmentTypeId && request.appointmentTypeName) {
        appointmentType = await this.resolveAppointmentType(request.appointmentTypeName);
        if (appointmentType) {
          appointmentTypeId = appointmentType.id;
        }
      } else if (appointmentTypeId) {
        appointmentType = await this.prisma.appointmentType.findFirst({
          where: { id: appointmentTypeId, organizationId: this.config.organizationId },
        });
      }

      if (!appointmentType) {
        // List available appointment types
        const types = await this.prisma.appointmentType.findMany({
          where: { organizationId: this.config.organizationId, isActive: true },
          take: 5,
        });

        return {
          success: false,
          message: `What type of appointment do you need? We offer ${types.map(t => t.name).join(', ')}.`,
          needsInfo: ['type'],
          actionResult: 'PENDING',
        };
      }

      // Resolve provider if specified
      let providerId = request.providerId;
      if (!providerId && request.providerName) {
        const provider = await this.resolveProvider(request.providerName);
        if (provider) {
          providerId = provider.id;
        }
      }

      // Find available slots
      const slots = await this.findAvailableSlots({
        appointmentTypeId: appointmentType.id,
        duration: appointmentType.duration,
        providerId,
        preferredDate: request.preferredDate,
        preferredTimeStart: request.preferredTimeStart,
        preferredTimeEnd: request.preferredTimeEnd,
      });

      if (slots.length === 0) {
        // No slots available, suggest alternatives
        const alternativeSlots = await this.findAlternativeSlots({
          appointmentTypeId: appointmentType.id,
          duration: appointmentType.duration,
          providerId,
          preferredDate: request.preferredDate,
        });

        if (alternativeSlots.length > 0) {
          return {
            success: false,
            message: this.formatAlternativeSlotMessage(alternativeSlots),
            suggestedSlots: alternativeSlots,
            needsInfo: ['time'],
            actionResult: 'PARTIAL',
          };
        }

        return {
          success: false,
          message: "I couldn't find any available appointments in that timeframe. Would you like to try a different date or be added to our waitlist?",
          actionResult: 'FAILED',
        };
      }

      // If we have a specific slot, confirm it
      if (slots.length === 1 || (request.preferredTimeStart && slots.length > 0)) {
        const selectedSlot = slots[0];

        // If this is awaiting confirmation, create the appointment
        if (callState.context.pendingAction?.awaitingConfirmation) {
          const appointment = await this.createAppointment({
            patientId,
            providerId: selectedSlot.providerId,
            appointmentTypeId: appointmentType.id,
            startTime: selectedSlot.startTime,
            endTime: selectedSlot.endTime,
            roomId: selectedSlot.roomId,
            notes: request.notes,
          });

          return {
            success: true,
            message: this.formatConfirmationMessage(appointment, selectedSlot),
            appointmentId: appointment.id,
            actionResult: 'SUCCESS',
          };
        }

        // Ask for confirmation
        return {
          success: false,
          message: this.formatSlotConfirmationMessage(selectedSlot, appointmentType.name),
          suggestedSlots: [selectedSlot],
          needsInfo: ['confirm'],
          actionResult: 'PENDING',
        };
      }

      // Multiple slots available, present options
      return {
        success: false,
        message: this.formatSlotOptionsMessage(slots.slice(0, this.config.maxSuggestions!)),
        suggestedSlots: slots.slice(0, this.config.maxSuggestions!),
        needsInfo: ['time'],
        actionResult: 'PARTIAL',
      };
    }

    // Need more information
    return {
      success: false,
      message: this.getNextQuestionMessage(missingInfo),
      needsInfo: missingInfo,
      actionResult: 'PENDING',
    };
  }

  /**
   * Reschedule an existing appointment
   */
  async rescheduleAppointment(
    request: SchedulingRequest,
    callState: CallState
  ): Promise<SchedulingResponse> {
    const { patientId } = callState;

    if (!patientId) {
      return {
        success: false,
        message: "I'd be happy to help you reschedule. Can you confirm your name and date of birth?",
        needsInfo: ['patient'],
        actionResult: 'PENDING',
      };
    }

    // Find the patient's upcoming appointments
    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId,
        organizationId: this.config.organizationId,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startTime: { gte: new Date() },
      },
      include: {
        appointmentType: true,
        provider: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { startTime: 'asc' },
      take: 5,
    });

    if (appointments.length === 0) {
      return {
        success: false,
        message: "I don't see any upcoming appointments on your account. Would you like to schedule a new appointment?",
        actionResult: 'FAILED',
      };
    }

    const appointment = appointments[0];
    const appointmentDate = appointment.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    // If they haven't specified a new date/time yet
    if (!request.preferredDate) {
      return {
        success: false,
        message: `I see your ${appointment.appointmentType.name} appointment scheduled for ${appointmentDate}. What date and time would work better for you?`,
        needsInfo: ['date', 'time'],
        actionResult: 'PENDING',
      };
    }

    // Find available slots for the new time
    const slots = await this.findAvailableSlots({
      appointmentTypeId: appointment.appointmentTypeId,
      duration: appointment.appointmentType.duration,
      providerId: appointment.providerId,
      preferredDate: request.preferredDate,
      preferredTimeStart: request.preferredTimeStart,
      preferredTimeEnd: request.preferredTimeEnd,
    });

    if (slots.length === 0) {
      const alternativeSlots = await this.findAlternativeSlots({
        appointmentTypeId: appointment.appointmentTypeId,
        duration: appointment.appointmentType.duration,
        providerId: appointment.providerId,
        preferredDate: request.preferredDate,
      });

      if (alternativeSlots.length > 0) {
        return {
          success: false,
          message: `That time isn't available, but I found these alternatives: ${this.formatAlternativeSlotMessage(alternativeSlots)}`,
          suggestedSlots: alternativeSlots,
          needsInfo: ['time'],
          actionResult: 'PARTIAL',
        };
      }

      return {
        success: false,
        message: "I couldn't find availability around that time. Would you like to try a different date?",
        actionResult: 'FAILED',
      };
    }

    const selectedSlot = slots[0];

    // Confirm reschedule
    if (callState.context.pendingAction?.awaitingConfirmation) {
      // Update the appointment
      const updated = await this.prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          providerId: selectedSlot.providerId,
          roomId: selectedSlot.roomId,
          status: 'SCHEDULED',
        },
      });

      const newDate = selectedSlot.startTime.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      return {
        success: true,
        message: `Great! I've rescheduled your appointment to ${newDate} with ${selectedSlot.providerName}. You'll receive a confirmation shortly.`,
        appointmentId: updated.id,
        actionResult: 'SUCCESS',
      };
    }

    const newDate = selectedSlot.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return {
      success: false,
      message: `I can reschedule you to ${newDate} with ${selectedSlot.providerName}. Should I book that for you?`,
      suggestedSlots: [selectedSlot],
      needsInfo: ['confirm'],
      actionResult: 'PENDING',
    };
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(
    request: SchedulingRequest,
    callState: CallState
  ): Promise<SchedulingResponse> {
    const { patientId } = callState;

    if (!patientId) {
      return {
        success: false,
        message: 'I can help you cancel your appointment. Can you confirm your name and date of birth?',
        needsInfo: ['patient'],
        actionResult: 'PENDING',
      };
    }

    // Find upcoming appointments
    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId,
        organizationId: this.config.organizationId,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startTime: { gte: new Date() },
      },
      include: {
        appointmentType: true,
      },
      orderBy: { startTime: 'asc' },
      take: 1,
    });

    if (appointments.length === 0) {
      return {
        success: false,
        message: "I don't see any upcoming appointments to cancel. Is there anything else I can help you with?",
        actionResult: 'FAILED',
      };
    }

    const appointment = appointments[0];
    const appointmentDate = appointment.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    // Confirm cancellation
    if (callState.context.pendingAction?.awaitingConfirmation) {
      await this.prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: 'Patient cancelled via AI receptionist',
        },
      });

      return {
        success: true,
        message: `Your ${appointment.appointmentType.name} appointment on ${appointmentDate} has been cancelled. Would you like to reschedule?`,
        appointmentId: appointment.id,
        actionResult: 'SUCCESS',
      };
    }

    return {
      success: false,
      message: `I see your ${appointment.appointmentType.name} appointment on ${appointmentDate}. Are you sure you'd like to cancel this appointment?`,
      needsInfo: ['confirm'],
      actionResult: 'PENDING',
    };
  }

  // ==================== Availability Checking ====================

  /**
   * Find available appointment slots
   */
  async findAvailableSlots(params: {
    appointmentTypeId: string;
    duration: number;
    providerId?: string;
    preferredDate?: Date;
    preferredTimeStart?: string;
    preferredTimeEnd?: string;
  }): Promise<AvailableSlot[]> {
    const {
      appointmentTypeId,
      duration,
      providerId,
      preferredDate,
      preferredTimeStart,
      preferredTimeEnd,
    } = params;

    const startDate = preferredDate || new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7); // Look ahead 7 days

    // Get providers
    const providers = providerId
      ? await this.prisma.provider.findMany({
          where: { id: providerId, organizationId: this.config.organizationId, isActive: true },
          include: {
            user: { select: { firstName: true, lastName: true } },
            schedules: { where: { isActive: true } },
            exceptions: { where: { date: { gte: startDate, lte: endDate } } },
          },
        })
      : await this.prisma.provider.findMany({
          where: { organizationId: this.config.organizationId, isActive: true },
          include: {
            user: { select: { firstName: true, lastName: true } },
            schedules: { where: { isActive: true } },
            exceptions: { where: { date: { gte: startDate, lte: endDate } } },
          },
        });

    const availableSlots: AvailableSlot[] = [];
    const daysOfWeek = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

    for (const provider of providers) {
      // Check each day in the range
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dayOfWeek = daysOfWeek[currentDate.getDay()];
        const schedule = provider.schedules.find(s => s.dayOfWeek === dayOfWeek);

        if (!schedule) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Check for exceptions
        const exception = provider.exceptions.find(e =>
          e.date.toDateString() === currentDate.toDateString()
        );

        if (exception && !exception.isAvailable) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Get existing appointments for this provider on this day
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);

        const existingAppointments = await this.prisma.appointment.findMany({
          where: {
            providerId: provider.id,
            startTime: { gte: dayStart, lte: dayEnd },
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          },
          orderBy: { startTime: 'asc' },
        });

        // Parse schedule times
        const [schedStartHour, schedStartMin] = schedule.startTime.split(':').map(Number);
        const [schedEndHour, schedEndMin] = schedule.endTime.split(':').map(Number);

        // Apply time preference filter
        let effectiveStartHour = schedStartHour;
        let effectiveStartMin = schedStartMin;
        let effectiveEndHour = schedEndHour;
        let effectiveEndMin = schedEndMin;

        if (preferredTimeStart) {
          const [prefStartHour, prefStartMin] = preferredTimeStart.split(':').map(Number);
          if (prefStartHour > effectiveStartHour || (prefStartHour === effectiveStartHour && prefStartMin > effectiveStartMin)) {
            effectiveStartHour = prefStartHour;
            effectiveStartMin = prefStartMin;
          }
        }

        if (preferredTimeEnd) {
          const [prefEndHour, prefEndMin] = preferredTimeEnd.split(':').map(Number);
          if (prefEndHour < effectiveEndHour || (prefEndHour === effectiveEndHour && prefEndMin < effectiveEndMin)) {
            effectiveEndHour = prefEndHour;
            effectiveEndMin = prefEndMin;
          }
        }

        // Find available slots
        const slotStart = new Date(currentDate);
        slotStart.setHours(effectiveStartHour, effectiveStartMin, 0, 0);

        const scheduleEnd = new Date(currentDate);
        scheduleEnd.setHours(effectiveEndHour, effectiveEndMin, 0, 0);

        while (slotStart.getTime() + duration * 60000 <= scheduleEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);

          // Check if slot conflicts with existing appointments
          const hasConflict = existingAppointments.some(appt => {
            return slotStart < appt.endTime && slotEnd > appt.startTime;
          });

          // Check if slot is in the past
          const isPast = slotStart <= new Date();

          if (!hasConflict && !isPast) {
            availableSlots.push({
              startTime: new Date(slotStart),
              endTime: slotEnd,
              providerId: provider.id,
              providerName: `Dr. ${provider.user?.lastName || 'Unknown'}`,
            });

            if (availableSlots.length >= (this.config.maxSuggestions! * 2)) {
              break;
            }
          }

          // Move to next slot (30-minute increments)
          slotStart.setMinutes(slotStart.getMinutes() + 30);
        }

        if (availableSlots.length >= (this.config.maxSuggestions! * 2)) {
          break;
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (availableSlots.length >= (this.config.maxSuggestions! * 2)) {
        break;
      }
    }

    return availableSlots;
  }

  /**
   * Find alternative slots when preferred time is unavailable
   */
  async findAlternativeSlots(params: {
    appointmentTypeId: string;
    duration: number;
    providerId?: string;
    preferredDate?: Date;
  }): Promise<AvailableSlot[]> {
    const { appointmentTypeId, duration, providerId, preferredDate } = params;

    // Try different time ranges
    const alternatives: AvailableSlot[] = [];

    // Same day, any time
    if (preferredDate) {
      const sameDaySlots = await this.findAvailableSlots({
        appointmentTypeId,
        duration,
        providerId,
        preferredDate,
      });
      alternatives.push(...sameDaySlots.slice(0, 2));
    }

    // Next few days
    for (let i = 1; i <= 3; i++) {
      const nextDate = new Date(preferredDate || new Date());
      nextDate.setDate(nextDate.getDate() + i);

      const slots = await this.findAvailableSlots({
        appointmentTypeId,
        duration,
        providerId,
        preferredDate: nextDate,
      });

      alternatives.push(...slots.slice(0, 2));

      if (alternatives.length >= this.config.maxSuggestions!) {
        break;
      }
    }

    return alternatives.slice(0, this.config.maxSuggestions!);
  }

  // ==================== Helper Methods ====================

  /**
   * Resolve appointment type from name/keyword
   */
  private async resolveAppointmentType(
    typeName: string
  ): Promise<{ id: string; name: string; duration: number } | null> {
    const types = await this.prisma.appointmentType.findMany({
      where: { organizationId: this.config.organizationId, isActive: true },
    });

    const lowerName = typeName.toLowerCase();

    // Direct name match
    const directMatch = types.find(t =>
      t.name.toLowerCase().includes(lowerName) ||
      t.code?.toLowerCase() === lowerName
    );

    if (directMatch) {
      return { id: directMatch.id, name: directMatch.name, duration: directMatch.duration };
    }

    // Keyword mapping
    const keywordMap: Record<string, string[]> = {
      'new_patient': ['new patient', 'initial', 'first'],
      'adjustment': ['adjustment', 'regular', 'routine'],
      'follow_up': ['follow', 'check'],
      'consultation': ['consult'],
      'exam': ['exam', 'evaluation'],
    };

    for (const [key, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(k => lowerName.includes(k))) {
        const match = types.find(t =>
          t.name.toLowerCase().includes(key.replace('_', ' ')) ||
          t.code?.toLowerCase() === key
        );
        if (match) {
          return { id: match.id, name: match.name, duration: match.duration };
        }
      }
    }

    return null;
  }

  /**
   * Resolve provider from name
   */
  private async resolveProvider(
    providerName: string
  ): Promise<{ id: string; name: string } | null> {
    const providers = await this.prisma.provider.findMany({
      where: { organizationId: this.config.organizationId, isActive: true },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const lowerName = providerName.toLowerCase();

    const match = providers.find(p =>
      p.user?.lastName?.toLowerCase().includes(lowerName) ||
      p.user?.firstName?.toLowerCase().includes(lowerName)
    );

    if (match && match.user) {
      return {
        id: match.id,
        name: `Dr. ${match.user.lastName}`,
      };
    }

    return null;
  }

  /**
   * Create appointment
   */
  private async createAppointment(params: {
    patientId: string;
    providerId: string;
    appointmentTypeId: string;
    startTime: Date;
    endTime: Date;
    roomId?: string;
    notes?: string;
  }) {
    return this.prisma.appointment.create({
      data: {
        organizationId: this.config.organizationId,
        patientId: params.patientId,
        providerId: params.providerId,
        appointmentTypeId: params.appointmentTypeId,
        startTime: params.startTime,
        endTime: params.endTime,
        roomId: params.roomId,
        notes: params.notes,
        status: 'SCHEDULED',
      },
      include: {
        appointmentType: true,
        provider: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  // ==================== Message Formatting ====================

  private formatSlotConfirmationMessage(slot: AvailableSlot, typeName: string): string {
    const dateStr = slot.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = slot.startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    return `I can book you a ${typeName} appointment on ${dateStr} at ${timeStr} with ${slot.providerName}. Should I book this for you?`;
  }

  private formatSlotOptionsMessage(slots: AvailableSlot[]): string {
    if (slots.length === 0) return "I couldn't find any available slots.";

    const options = slots.map((slot, i) => {
      const dateStr = slot.startTime.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const timeStr = slot.startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      return `${dateStr} at ${timeStr}`;
    });

    return `I found several available times: ${options.join(', ')}. Which works best for you?`;
  }

  private formatAlternativeSlotMessage(slots: AvailableSlot[]): string {
    if (slots.length === 0) return '';

    const options = slots.map(slot => {
      const dateStr = slot.startTime.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const timeStr = slot.startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      return `${dateStr} at ${timeStr}`;
    });

    return `How about ${options.join(' or ')}?`;
  }

  private formatConfirmationMessage(
    appointment: { id: string; startTime: Date; provider?: { user?: { firstName: string | null; lastName: string | null } | null } | null },
    slot: AvailableSlot
  ): string {
    const dateStr = appointment.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = appointment.startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    return `Perfect! I've booked your appointment for ${dateStr} at ${timeStr} with ${slot.providerName}. You'll receive a confirmation shortly. Is there anything else I can help you with?`;
  }

  private getNextQuestionMessage(missingInfo: string[]): string {
    if (missingInfo.includes('patient')) {
      return "I'd be happy to help you schedule an appointment. Can you confirm your name and date of birth?";
    }
    if (missingInfo.includes('type')) {
      return 'What type of appointment are you looking for today?';
    }
    if (missingInfo.includes('date')) {
      return 'What date works best for you?';
    }
    if (missingInfo.includes('time')) {
      return 'What time of day works best? Morning, afternoon, or do you have a specific time in mind?';
    }
    if (missingInfo.includes('insurance')) {
      return 'Could you provide your insurance information?';
    }
    return 'How can I help you with scheduling today?';
  }

  // ==================== Patient Information Collection ====================

  /**
   * Collect new patient information from conversation
   */
  async collectPatientInfo(
    userInput: string,
    currentInfo: Partial<PatientInfo>
  ): Promise<{ info: Partial<PatientInfo>; nextQuestion?: string; complete: boolean }> {
    const info = { ...currentInfo };
    let nextQuestion: string | undefined;

    // Try to extract information from the input
    const nameMatch = userInput.match(/(?:my name is|i'm|i am)\s+(\w+)\s+(\w+)/i);
    if (nameMatch) {
      info.firstName = nameMatch[1];
      info.lastName = nameMatch[2];
    }

    const dobMatch = userInput.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dobMatch) {
      const month = parseInt(dobMatch[1], 10) - 1;
      const day = parseInt(dobMatch[2], 10);
      let year = parseInt(dobMatch[3], 10);
      if (year < 100) year += year > 30 ? 1900 : 2000;
      info.dateOfBirth = new Date(year, month, day);
    }

    const phoneMatch = userInput.match(/(\d{3})[.\-\s]?(\d{3})[.\-\s]?(\d{4})/);
    if (phoneMatch) {
      info.phone = `${phoneMatch[1]}-${phoneMatch[2]}-${phoneMatch[3]}`;
    }

    const emailMatch = userInput.match(/[\w.-]+@[\w.-]+\.\w+/i);
    if (emailMatch) {
      info.email = emailMatch[0];
    }

    // Determine what's still missing
    if (!info.firstName || !info.lastName) {
      nextQuestion = 'Could you please tell me your full name?';
    } else if (!info.dateOfBirth) {
      nextQuestion = 'What is your date of birth?';
    } else if (!info.phone) {
      nextQuestion = 'What is the best phone number to reach you?';
    }

    const complete = !!(info.firstName && info.lastName && info.dateOfBirth && info.phone);

    return { info, nextQuestion, complete };
  }

  /**
   * Confirm insurance information
   */
  async confirmInsurance(
    patientId: string,
    userInput: string
  ): Promise<{ confirmed: boolean; message: string }> {
    // Get patient's insurance on file
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId: this.config.organizationId },
      include: { insurances: { where: { type: 'PRIMARY', isActive: true }, take: 1 } },
    });

    if (!patient) {
      return {
        confirmed: false,
        message: "I couldn't find your patient record. Let me transfer you to our team.",
      };
    }

    const lowerInput = userInput.toLowerCase();
    const insurance = patient.insurances[0];

    if (insurance) {
      // Ask if insurance is still current
      if (lowerInput.includes('yes') || lowerInput.includes('same') || lowerInput.includes('correct')) {
        return {
          confirmed: true,
          message: `Great, I've confirmed your ${insurance.payerName} insurance is still on file.`,
        };
      }

      if (lowerInput.includes('no') || lowerInput.includes('changed') || lowerInput.includes('new')) {
        return {
          confirmed: false,
          message: 'No problem. Please bring your new insurance card to your appointment and our front desk will update your information.',
        };
      }

      return {
        confirmed: false,
        message: `I have ${insurance.payerName} on file for your insurance. Is this still current?`,
      };
    }

    // No insurance on file
    return {
      confirmed: true,
      message: "I don't have insurance information on file. If you have insurance, please bring your card to your appointment.",
    };
  }

  // ==================== Confirmation Sending ====================

  /**
   * Send appointment confirmation
   */
  async sendConfirmation(params: {
    appointmentId: string;
    patientId: string;
    method: 'sms' | 'email' | 'both';
  }): Promise<{ success: boolean; methods: string[] }> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: params.appointmentId, organizationId: this.config.organizationId },
      include: {
        patient: {
          include: {
            demographics: true,
            contacts: { where: { isPrimary: true }, take: 1 },
          },
        },
        appointmentType: true,
        provider: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!appointment) {
      return { success: false, methods: [] };
    }

    const methods: string[] = [];
    const dateStr = appointment.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = appointment.startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    const contact = appointment.patient?.contacts[0];
    const demographics = appointment.patient?.demographics;
    const patientName = demographics?.firstName || 'Valued Patient';

    const message = `Hi ${patientName}! Your ${appointment.appointmentType.name} appointment is confirmed for ${dateStr} at ${timeStr}. Please arrive 15 minutes early. Reply CANCEL to cancel.`;

    // In a real implementation, this would send via SMS/email services
    // For now, we'll just log and record the attempt
    if ((params.method === 'sms' || params.method === 'both') && contact?.mobilePhone) {
      // await sendSMS(contact.mobilePhone, message);
      methods.push('sms');
    }

    if ((params.method === 'email' || params.method === 'both') && contact?.email) {
      // await sendEmail(contact.email, 'Appointment Confirmation', message);
      methods.push('email');
    }

    return { success: methods.length > 0, methods };
  }
}

// ==================== Factory ====================

export function createSchedulingAgent(
  prisma: PrismaClient,
  config: SchedulingAgentConfig
): SchedulingAgent {
  return new SchedulingAgent(prisma, config);
}
