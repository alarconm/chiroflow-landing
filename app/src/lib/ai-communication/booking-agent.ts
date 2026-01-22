/**
 * Epic 12: AI Communication Agent - Natural Language Booking Agent
 *
 * Handles natural language appointment booking requests.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  BookingRequest,
  BookingResponse,
  PendingBooking,
  TimeSlot,
  ChatContext,
} from './types';
import { mockLLM } from './mock-llm';

/**
 * Natural Language Booking Agent
 */
export class BookingAgent {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Process a natural language booking request
   */
  async processBookingRequest(request: BookingRequest): Promise<BookingResponse> {
    const { userMessage, context, organizationId } = request;
    const pendingBooking = context.pendingBooking || { step: 'type' };

    // Detect intent and entities from the message
    const { intent, entities } = mockLLM.detectIntent(userMessage);

    // Handle based on current booking step
    switch (pendingBooking.step) {
      case 'type':
        return this.handleTypeSelection(userMessage, pendingBooking, organizationId);

      case 'provider':
        return this.handleProviderSelection(userMessage, pendingBooking, organizationId);

      case 'date':
        return this.handleDateSelection(userMessage, pendingBooking, organizationId, entities);

      case 'time':
        return this.handleTimeSelection(userMessage, pendingBooking);

      case 'confirm':
        return this.handleConfirmation(userMessage, pendingBooking, organizationId, context);

      default:
        return this.handleInitialRequest(userMessage, organizationId);
    }
  }

  /**
   * Handle initial booking request
   */
  private async handleInitialRequest(
    message: string,
    organizationId: string
  ): Promise<BookingResponse> {
    // Get available appointment types
    const appointmentTypes = await this.prisma.appointmentType.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
      take: 5,
    });

    const typeOptions = appointmentTypes
      .map(t => `- ${t.name} (${t.duration} minutes)`)
      .join('\n');

    return {
      message: `I'd be happy to help you schedule an appointment! What type of visit do you need?\n\n${typeOptions}`,
      updatedBooking: {
        step: 'type',
      },
    };
  }

  /**
   * Handle appointment type selection
   */
  private async handleTypeSelection(
    message: string,
    booking: PendingBooking,
    organizationId: string
  ): Promise<BookingResponse> {
    const lowerMessage = message.toLowerCase();

    // Find matching appointment type
    const appointmentTypes = await this.prisma.appointmentType.findMany({
      where: {
        organizationId,
        isActive: true,
      },
    });

    let selectedType = appointmentTypes.find(t =>
      lowerMessage.includes(t.name.toLowerCase()) ||
      (t.code && lowerMessage.includes(t.code.toLowerCase()))
    );

    // Try fuzzy matching
    if (!selectedType) {
      if (lowerMessage.includes('new') || lowerMessage.includes('first')) {
        selectedType = appointmentTypes.find(t =>
          t.name.toLowerCase().includes('new patient')
        );
      } else if (lowerMessage.includes('follow') || lowerMessage.includes('return')) {
        selectedType = appointmentTypes.find(t =>
          t.name.toLowerCase().includes('follow') ||
          t.name.toLowerCase().includes('return')
        );
      } else if (lowerMessage.includes('adjust') || lowerMessage.includes('regular')) {
        selectedType = appointmentTypes.find(t =>
          t.name.toLowerCase().includes('adjustment') ||
          t.name.toLowerCase().includes('regular')
        );
      }
    }

    if (!selectedType) {
      const typeOptions = appointmentTypes
        .map(t => `- ${t.name}`)
        .join('\n');
      return {
        message: `I couldn't determine the appointment type. Please choose from:\n\n${typeOptions}`,
        updatedBooking: booking,
      };
    }

    // Get available providers for this type
    const providers = await this.prisma.provider.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      include: {
        user: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const updatedBooking: PendingBooking = {
      ...booking,
      appointmentTypeId: selectedType.id,
      appointmentTypeName: selectedType.name,
      step: 'provider',
    };

    if (providers.length === 1) {
      // Only one provider, auto-select
      const provider = providers[0];
      updatedBooking.providerId = provider.id;
      updatedBooking.providerName = `${provider.title || ''} ${provider.user.firstName} ${provider.user.lastName}`.trim();
      updatedBooking.step = 'date';

      return {
        message: `Great! I've selected ${selectedType.name} with ${updatedBooking.providerName}. When would you like to come in?`,
        updatedBooking,
      };
    }

    const providerOptions = providers
      .map(p => `- ${p.title || ''} ${p.user.firstName} ${p.user.lastName}`.trim())
      .join('\n');

    return {
      message: `Perfect! You've selected ${selectedType.name}. Which provider would you prefer?\n\n${providerOptions}\n\nOr say "any provider" if you don't have a preference.`,
      updatedBooking,
    };
  }

  /**
   * Handle provider selection
   */
  private async handleProviderSelection(
    message: string,
    booking: PendingBooking,
    organizationId: string
  ): Promise<BookingResponse> {
    const lowerMessage = message.toLowerCase();

    // Check for "any provider"
    if (lowerMessage.includes('any') || lowerMessage.includes("don't have") || lowerMessage.includes('no preference')) {
      const provider = await this.prisma.provider.findFirst({
        where: {
          organizationId,
          isActive: true,
        },
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { sortOrder: 'asc' },
      });

      if (!provider) {
        return {
          message: `I couldn't find any available providers. Please contact the office directly.`,
          updatedBooking: booking,
        };
      }

      const updatedBooking: PendingBooking = {
        ...booking,
        providerId: provider.id,
        providerName: `${provider.title || ''} ${provider.user.firstName} ${provider.user.lastName}`.trim(),
        step: 'date',
      };

      return {
        message: `I'll find the first available appointment. When would you like to come in? You can say things like "tomorrow", "next week", or a specific date.`,
        updatedBooking,
      };
    }

    // Find matching provider
    const providers = await this.prisma.provider.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    const selectedProvider = providers.find(p => {
      const fullName = `${p.user.firstName} ${p.user.lastName}`.toLowerCase();
      return lowerMessage.includes(p.user.firstName.toLowerCase()) ||
        lowerMessage.includes(p.user.lastName.toLowerCase()) ||
        lowerMessage.includes(fullName);
    });

    if (!selectedProvider) {
      const providerOptions = providers
        .map(p => `- ${p.title || ''} ${p.user.firstName} ${p.user.lastName}`.trim())
        .join('\n');
      return {
        message: `I couldn't find that provider. Please choose from:\n\n${providerOptions}`,
        updatedBooking: booking,
      };
    }

    const updatedBooking: PendingBooking = {
      ...booking,
      providerId: selectedProvider.id,
      providerName: `${selectedProvider.title || ''} ${selectedProvider.user.firstName} ${selectedProvider.user.lastName}`.trim(),
      step: 'date',
    };

    return {
      message: `Great choice! When would you like to see ${updatedBooking.providerName}? You can say "tomorrow", "next Monday", or a specific date.`,
      updatedBooking,
    };
  }

  /**
   * Handle date selection
   */
  private async handleDateSelection(
    message: string,
    booking: PendingBooking,
    organizationId: string,
    entities?: { date?: string; time?: string }
  ): Promise<BookingResponse> {
    // Parse the date from the message
    const preferredDate = this.parseDate(message, entities?.date);

    if (!preferredDate) {
      return {
        message: `I couldn't understand that date. Please try again with something like "tomorrow", "next Tuesday", or "January 15th".`,
        updatedBooking: booking,
      };
    }

    // Get available time slots for that date
    const slots = await this.getAvailableSlots(
      organizationId,
      booking.providerId!,
      booking.appointmentTypeId!,
      preferredDate
    );

    if (slots.length === 0) {
      // Check next available date
      const nextDate = new Date(preferredDate);
      nextDate.setDate(nextDate.getDate() + 1);

      return {
        message: `Unfortunately, there are no available appointments on ${preferredDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}. Would you like me to check ${nextDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}?`,
        updatedBooking: {
          ...booking,
          preferredDate,
        },
      };
    }

    const updatedBooking: PendingBooking = {
      ...booking,
      preferredDate,
      availableSlots: slots,
      step: 'time',
    };

    const timeOptions = slots
      .slice(0, 6)
      .map(s => `- ${s.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)
      .join('\n');

    return {
      message: `I found ${slots.length} available time${slots.length > 1 ? 's' : ''} on ${preferredDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}:\n\n${timeOptions}\n\nWhat time works best for you?`,
      updatedBooking,
      suggestedSlots: slots.slice(0, 6),
    };
  }

  /**
   * Handle time selection
   */
  private async handleTimeSelection(
    message: string,
    booking: PendingBooking
  ): Promise<BookingResponse> {
    const slots = booking.availableSlots || [];

    // Parse the time from the message
    const selectedSlot = this.findMatchingSlot(message, slots);

    if (!selectedSlot) {
      const timeOptions = slots
        .slice(0, 6)
        .map(s => `- ${s.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)
        .join('\n');
      return {
        message: `I couldn't match that time. Please choose from the available times:\n\n${timeOptions}`,
        updatedBooking: booking,
      };
    }

    const updatedBooking: PendingBooking = {
      ...booking,
      selectedSlot,
      step: 'confirm',
    };

    const appointmentSummary = `
**Appointment Summary:**
- Type: ${booking.appointmentTypeName}
- Provider: ${booking.providerName}
- Date: ${selectedSlot.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
- Time: ${selectedSlot.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
    `.trim();

    return {
      message: `${appointmentSummary}\n\nWould you like me to confirm this appointment?`,
      updatedBooking,
    };
  }

  /**
   * Handle booking confirmation
   */
  private async handleConfirmation(
    message: string,
    booking: PendingBooking,
    organizationId: string,
    context: ChatContext
  ): Promise<BookingResponse> {
    const lowerMessage = message.toLowerCase();

    // Check for negative response
    if (lowerMessage.includes('no') || lowerMessage.includes('cancel') || lowerMessage.includes('change')) {
      return {
        message: `No problem! What would you like to change?`,
        updatedBooking: {
          ...booking,
          step: 'date',
        },
      };
    }

    // Check for positive response
    if (
      lowerMessage.includes('yes') ||
      lowerMessage.includes('confirm') ||
      lowerMessage.includes('book') ||
      lowerMessage.includes('correct') ||
      lowerMessage.includes('looks good')
    ) {
      if (!booking.selectedSlot || !booking.appointmentTypeId || !booking.providerId) {
        return {
          message: `Something went wrong with the booking. Let's start over. What type of appointment do you need?`,
          updatedBooking: { step: 'type' },
        };
      }

      // In a real implementation, this would create the appointment
      // For now, we'll simulate a successful booking
      const appointmentId = `apt_${Date.now()}`;

      return {
        message: `Excellent! Your appointment has been confirmed!\n\n**Confirmation Details:**\n- Confirmation #: ${appointmentId}\n- ${booking.appointmentTypeName} with ${booking.providerName}\n- ${booking.selectedSlot.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${booking.selectedSlot.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}\n\nYou'll receive a confirmation email shortly. Is there anything else I can help you with?`,
        updatedBooking: undefined,
        bookingComplete: true,
        appointmentId,
      };
    }

    return {
      message: `I didn't catch that. Please say "yes" to confirm or "no" to make changes.`,
      updatedBooking: booking,
    };
  }

  /**
   * Parse date from message
   */
  private parseDate(message: string, entityDate?: string): Date | null {
    const lower = (entityDate || message).toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (lower.includes('today')) {
      return today;
    }

    if (lower.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    // Handle day names
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const isNext = lower.includes('next');

    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i])) {
        const targetDay = i;
        const currentDay = today.getDay();
        let daysUntil = (targetDay - currentDay + 7) % 7;

        if (daysUntil === 0 && !lower.includes('this')) {
          daysUntil = 7;
        }
        if (isNext) {
          daysUntil += 7;
        }

        const result = new Date(today);
        result.setDate(result.getDate() + daysUntil);
        return result;
      }
    }

    // Try parsing as a date
    const parsed = new Date(lower);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // Handle "next week"
    if (lower.includes('next week')) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }

    return null;
  }

  /**
   * Find matching time slot from message
   */
  private findMatchingSlot(message: string, slots: TimeSlot[]): TimeSlot | null {
    const lower = message.toLowerCase();

    // Try to extract time
    const timeMatch = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2] || '0', 10);
      const period = (timeMatch[3] || '').toLowerCase();

      if (period === 'pm' && hour < 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;

      // If no AM/PM specified, assume reasonable hours
      if (!period && hour < 7) hour += 12;

      return slots.find(s => {
        const slotHour = s.startTime.getHours();
        const slotMinute = s.startTime.getMinutes();
        return slotHour === hour && Math.abs(slotMinute - minute) < 15;
      }) || null;
    }

    // Handle relative times
    if (lower.includes('first') || lower.includes('earliest')) {
      return slots[0] || null;
    }
    if (lower.includes('last') || lower.includes('latest')) {
      return slots[slots.length - 1] || null;
    }
    if (lower.includes('morning')) {
      return slots.find(s => s.startTime.getHours() < 12) || null;
    }
    if (lower.includes('afternoon')) {
      return slots.find(s => s.startTime.getHours() >= 12 && s.startTime.getHours() < 17) || null;
    }
    if (lower.includes('evening') || lower.includes('late')) {
      return slots.find(s => s.startTime.getHours() >= 17) || null;
    }

    return null;
  }

  /**
   * Get available appointment slots
   */
  private async getAvailableSlots(
    organizationId: string,
    providerId: string,
    appointmentTypeId: string,
    date: Date
  ): Promise<TimeSlot[]> {
    // Get appointment type duration
    const appointmentType = await this.prisma.appointmentType.findUnique({
      where: { id: appointmentTypeId },
    });

    if (!appointmentType) return [];

    const duration = appointmentType.duration;

    // Get provider schedule for this day
    const dayOfWeek = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][date.getDay()];

    const schedule = await this.prisma.providerSchedule.findFirst({
      where: {
        providerId,
        dayOfWeek: dayOfWeek as any,
        isActive: true,
      },
    });

    if (!schedule) return [];

    // Check for exceptions
    const exception = await this.prisma.providerException.findFirst({
      where: {
        providerId,
        date: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
    });

    if (exception && !exception.isAvailable) return [];

    // Get existing appointments for this day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        providerId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          notIn: ['CANCELLED', 'NO_SHOW'],
        },
      },
    });

    // Parse schedule times
    const [startHour, startMin] = schedule.startTime.split(':').map(Number);
    const [endHour, endMin] = schedule.endTime.split(':').map(Number);

    const scheduleStart = new Date(date);
    scheduleStart.setHours(startHour, startMin, 0, 0);

    const scheduleEnd = new Date(date);
    scheduleEnd.setHours(endHour, endMin, 0, 0);

    // Generate available slots
    const slots: TimeSlot[] = [];
    const slotStart = new Date(scheduleStart);

    while (slotStart < scheduleEnd) {
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);

      // Check if slot overlaps with existing appointments
      const hasConflict = existingAppointments.some(apt => {
        const aptStart = new Date(apt.startTime).getTime();
        const aptEnd = new Date(apt.endTime).getTime();
        const thisStart = slotStart.getTime();
        const thisEnd = slotEnd.getTime();

        return (thisStart < aptEnd && thisEnd > aptStart);
      });

      // Don't include past times
      const now = new Date();
      if (!hasConflict && slotEnd <= scheduleEnd && slotStart > now) {
        slots.push({
          startTime: new Date(slotStart),
          endTime: slotEnd,
          providerId,
          providerName: '', // Would be filled in from context
        });
      }

      slotStart.setMinutes(slotStart.getMinutes() + duration);
    }

    return slots;
  }
}

/**
 * Create a booking agent instance
 */
export function createBookingAgent(prisma: PrismaClient): BookingAgent {
  return new BookingAgent(prisma);
}

export default BookingAgent;
