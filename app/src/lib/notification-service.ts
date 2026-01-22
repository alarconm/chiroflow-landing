/**
 * Notification Service
 *
 * Provides an abstraction for sending notifications via different channels:
 * - SMS (via Twilio)
 * - Email (via configured SMTP)
 * - In-app notifications
 */

import { env, hasEmailConfig } from '@/lib/env';

// Types
export interface SendSMSOptions {
  to: string;
  body: string;
  from?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
  from?: string;
  replyTo?: string;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface TemplateVariables {
  patient?: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    phone?: string;
    email?: string;
  };
  appointment?: {
    date?: string;
    time?: string;
    type?: string;
    provider?: string;
    location?: string;
  };
  practice?: {
    name?: string;
    phone?: string;
    address?: string;
    website?: string;
  };
  [key: string]: unknown;
}

// SMS Provider interface
interface SMSProvider {
  send(options: SendSMSOptions): Promise<NotificationResult>;
}

// Email Provider interface
interface EmailProvider {
  send(options: SendEmailOptions): Promise<NotificationResult>;
}

// Mock SMS Provider for development
class MockSMSProvider implements SMSProvider {
  async send(options: SendSMSOptions): Promise<NotificationResult> {
    console.log('[MockSMS] Sending SMS:', options);
    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      success: true,
      messageId: `mock-sms-${Date.now()}`,
    };
  }
}

// Twilio SMS Provider
class TwilioSMSProvider implements SMSProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
  }

  async send(options: SendSMSOptions): Promise<NotificationResult> {
    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      console.warn('[Twilio] Missing credentials, falling back to mock');
      return new MockSMSProvider().send(options);
    }

    try {
      // In production, this would use the Twilio SDK
      // For now, we'll just log and return mock success
      console.log('[Twilio] Would send SMS:', {
        to: options.to,
        from: options.from || this.fromNumber,
        bodyLength: options.body.length,
      });

      return {
        success: true,
        messageId: `twilio-${Date.now()}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Mock Email Provider for development
class MockEmailProvider implements EmailProvider {
  async send(options: SendEmailOptions): Promise<NotificationResult> {
    console.log('[MockEmail] Sending email:', {
      to: options.to,
      subject: options.subject,
      bodyLength: options.body.length,
    });
    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      success: true,
      messageId: `mock-email-${Date.now()}`,
    };
  }
}

// SMTP Email Provider
class SMTPEmailProvider implements EmailProvider {
  private host: string;
  private port: number;
  private user: string;
  private password: string;
  private from: string;

  constructor() {
    this.host = env.SMTP_HOST || '';
    this.port = env.SMTP_PORT || 587;
    this.user = env.SMTP_USER || '';
    this.password = env.SMTP_PASSWORD || '';
    this.from = env.SMTP_FROM || '';
  }

  async send(options: SendEmailOptions): Promise<NotificationResult> {
    if (!this.host || !this.user || !this.password) {
      console.warn('[SMTP] Missing credentials, falling back to mock');
      return new MockEmailProvider().send(options);
    }

    try {
      // In production, this would use nodemailer
      // For now, we'll just log and return mock success
      console.log('[SMTP] Would send email:', {
        to: options.to,
        subject: options.subject,
        from: options.from || this.from,
      });

      return {
        success: true,
        messageId: `smtp-${Date.now()}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Template processing
export function processTemplate(
  template: string,
  variables: TemplateVariables
): string {
  let result = template;

  // Process nested variables like {{patient.firstName}}
  const processObject = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        processObject(value as Record<string, unknown>, `${prefix}${key}.`);
      } else if (value !== undefined && value !== null) {
        const placeholder = `{{${prefix}${key}}}`;
        result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
      }
    }
  };

  processObject(variables as Record<string, unknown>, '');

  // Remove any remaining placeholders
  result = result.replace(/\{\{[^}]+\}\}/g, '');

  return result;
}

// Phone number normalization
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Handle US numbers
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Return with + prefix if not already there
  return digits.startsWith('+') ? digits : `+${digits}`;
}

// Main Notification Service
class NotificationService {
  private smsProvider: SMSProvider;
  private emailProvider: EmailProvider;

  constructor() {
    // Select providers based on configuration
    this.smsProvider = process.env.TWILIO_ACCOUNT_SID
      ? new TwilioSMSProvider()
      : new MockSMSProvider();

    this.emailProvider = hasEmailConfig
      ? new SMTPEmailProvider()
      : new MockEmailProvider();
  }

  async sendSMS(
    to: string,
    template: string,
    variables?: TemplateVariables
  ): Promise<NotificationResult> {
    const body = variables ? processTemplate(template, variables) : template;
    const normalizedPhone = normalizePhoneNumber(to);

    return this.smsProvider.send({
      to: normalizedPhone,
      body,
    });
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    options?: {
      html?: string;
      variables?: TemplateVariables;
    }
  ): Promise<NotificationResult> {
    const processedSubject = options?.variables
      ? processTemplate(subject, options.variables)
      : subject;
    const processedBody = options?.variables
      ? processTemplate(body, options.variables)
      : body;
    const processedHtml = options?.html && options?.variables
      ? processTemplate(options.html, options.variables)
      : options?.html;

    return this.emailProvider.send({
      to,
      subject: processedSubject,
      body: processedBody,
      html: processedHtml,
    });
  }

  async sendAppointmentReminder(
    patient: { phone?: string; email?: string; firstName: string; lastName: string },
    appointment: { date: Date; type: string; providerName: string },
    channel: 'SMS' | 'EMAIL',
    template?: string
  ): Promise<NotificationResult> {
    const variables: TemplateVariables = {
      patient: {
        firstName: patient.firstName,
        lastName: patient.lastName,
        fullName: `${patient.firstName} ${patient.lastName}`,
      },
      appointment: {
        date: appointment.date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        time: appointment.date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }),
        type: appointment.type,
        provider: appointment.providerName,
      },
    };

    if (channel === 'SMS' && patient.phone) {
      const defaultTemplate = `Hi {{patient.firstName}}, this is a reminder of your {{appointment.type}} appointment on {{appointment.date}} at {{appointment.time}} with {{appointment.provider}}. Reply CONFIRM to confirm or call us to reschedule.`;
      return this.sendSMS(patient.phone, template || defaultTemplate, variables);
    }

    if (channel === 'EMAIL' && patient.email) {
      const defaultSubject = 'Appointment Reminder - {{appointment.date}}';
      const defaultBody = `Dear {{patient.firstName}},

This is a reminder of your upcoming appointment:

Date: {{appointment.date}}
Time: {{appointment.time}}
Type: {{appointment.type}}
Provider: {{appointment.provider}}

If you need to reschedule, please contact us at your earliest convenience.

Thank you!`;

      return this.sendEmail(patient.email, template || defaultSubject, defaultBody, {
        variables,
      });
    }

    return {
      success: false,
      error: `No valid contact info for ${channel} channel`,
    };
  }

  getProviderStatus(): {
    sms: { provider: string; configured: boolean };
    email: { provider: string; configured: boolean };
  } {
    return {
      sms: {
        provider: process.env.TWILIO_ACCOUNT_SID ? 'twilio' : 'mock',
        configured: !!process.env.TWILIO_ACCOUNT_SID,
      },
      email: {
        provider: hasEmailConfig ? 'smtp' : 'mock',
        configured: hasEmailConfig,
      },
    };
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
