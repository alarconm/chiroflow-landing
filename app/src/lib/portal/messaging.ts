/**
 * Epic 14: Patient Portal - Secure Messaging Service
 * HIPAA-compliant messaging between patients and practice
 */

import { prisma } from '@/lib/prisma';
import { logPortalAccess } from './auth';
import type { PortalMessage, SecureMessageStatus, SecureMessagePriority } from './types';

/**
 * Get messages for a patient (inbox view)
 */
export async function getPatientMessages(
  patientId: string,
  organizationId: string,
  options: {
    status?: SecureMessageStatus;
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
    parentOnly?: boolean; // Only get top-level messages (not replies)
  } = {}
): Promise<{ messages: PortalMessage[]; total: number }> {
  const {
    status,
    includeArchived = false,
    limit = 20,
    offset = 0,
    parentOnly = true,
  } = options;

  const where: Record<string, unknown> = {
    patientId,
    organizationId,
  };

  if (parentOnly) {
    where.parentMessageId = null;
  }

  if (status) {
    where.status = status;
  }

  if (!includeArchived) {
    where.status = { not: 'ARCHIVED' };
    where.deletedAt = null;
  }

  const [messages, total] = await Promise.all([
    prisma.secureMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        _count: {
          select: { replies: true },
        },
      },
    }),
    prisma.secureMessage.count({ where }),
  ]);

  return {
    messages: messages.map((m) => ({
      id: m.id,
      subject: m.subject,
      body: m.body,
      isFromPatient: m.isFromPatient,
      senderName: m.senderName ?? undefined,
      status: m.status as SecureMessageStatus,
      priority: m.priority as SecureMessagePriority,
      createdAt: m.createdAt,
      readAt: m.readAt ?? undefined,
      attachments: m.attachments as PortalMessage['attachments'],
      replyCount: m._count.replies,
      parentMessageId: m.parentMessageId ?? undefined,
    })),
    total,
  };
}

/**
 * Get a single message with its thread
 */
export async function getMessageThread(
  messageId: string,
  patientId: string,
  organizationId: string,
  portalUserId: string,
  ipAddress?: string
): Promise<{ message: PortalMessage | null; replies: PortalMessage[] }> {
  const message = await prisma.secureMessage.findFirst({
    where: {
      id: messageId,
      patientId,
      organizationId,
      deletedAt: null,
    },
    include: {
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!message) {
    return { message: null, replies: [] };
  }

  // Mark as read if unread and not from patient
  if (message.status === 'UNREAD' && !message.isFromPatient) {
    await prisma.secureMessage.update({
      where: { id: message.id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  // Log access
  await logPortalAccess({
    action: 'PORTAL_VIEW_MESSAGE',
    portalUserId,
    organizationId,
    resource: 'SecureMessage',
    resourceId: message.id,
    ipAddress,
    success: true,
  });

  return {
    message: {
      id: message.id,
      subject: message.subject,
      body: message.body,
      isFromPatient: message.isFromPatient,
      senderName: message.senderName ?? undefined,
      status: message.status as SecureMessageStatus,
      priority: message.priority as SecureMessagePriority,
      createdAt: message.createdAt,
      readAt: message.readAt ?? undefined,
      attachments: message.attachments as PortalMessage['attachments'],
      parentMessageId: message.parentMessageId ?? undefined,
    },
    replies: message.replies.map((r) => ({
      id: r.id,
      subject: r.subject,
      body: r.body,
      isFromPatient: r.isFromPatient,
      senderName: r.senderName ?? undefined,
      status: r.status as SecureMessageStatus,
      priority: r.priority as SecureMessagePriority,
      createdAt: r.createdAt,
      readAt: r.readAt ?? undefined,
      attachments: r.attachments as PortalMessage['attachments'],
      parentMessageId: r.parentMessageId ?? undefined,
    })),
  };
}

/**
 * Send a new message from patient
 */
export async function sendPatientMessage(
  patientId: string,
  organizationId: string,
  subject: string,
  body: string,
  options: {
    priority?: SecureMessagePriority;
    parentMessageId?: string; // For replies
    attachments?: Array<{ fileName: string; fileSize: number; storageKey: string }>;
    portalUserId: string;
    senderName: string;
    ipAddress?: string;
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const {
    priority = 'NORMAL',
    parentMessageId,
    attachments,
    portalUserId,
    senderName,
    ipAddress,
  } = options;

  // If this is a reply, verify parent message belongs to patient
  if (parentMessageId) {
    const parentMessage = await prisma.secureMessage.findFirst({
      where: {
        id: parentMessageId,
        patientId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!parentMessage) {
      return { success: false, error: 'Parent message not found' };
    }
  }

  const message = await prisma.secureMessage.create({
    data: {
      subject,
      body,
      isFromPatient: true,
      senderName,
      priority,
      status: 'UNREAD', // Staff hasn't read it yet
      parentMessageId,
      attachments: attachments ? JSON.parse(JSON.stringify(attachments)) : undefined,
      patientId,
      organizationId,
    },
  });

  // Log the action
  await logPortalAccess({
    action: 'PORTAL_SEND_MESSAGE',
    portalUserId,
    organizationId,
    resource: 'SecureMessage',
    resourceId: message.id,
    ipAddress,
    success: true,
    metadata: { subject, isReply: !!parentMessageId },
  });

  // TODO: Notify practice staff about new message

  return { success: true, messageId: message.id };
}

/**
 * Archive a message
 */
export async function archiveMessage(
  messageId: string,
  patientId: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  const message = await prisma.secureMessage.findFirst({
    where: {
      id: messageId,
      patientId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!message) {
    return { success: false, error: 'Message not found' };
  }

  await prisma.secureMessage.update({
    where: { id: messageId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });

  return { success: true };
}

/**
 * Delete a message (soft delete)
 */
export async function deleteMessage(
  messageId: string,
  patientId: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  const message = await prisma.secureMessage.findFirst({
    where: {
      id: messageId,
      patientId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!message) {
    return { success: false, error: 'Message not found' };
  }

  await prisma.secureMessage.update({
    where: { id: messageId },
    data: { status: 'DELETED', deletedAt: new Date() },
  });

  return { success: true };
}

/**
 * Get unread message count for patient
 */
export async function getUnreadMessageCount(
  patientId: string,
  organizationId: string
): Promise<number> {
  const count = await prisma.secureMessage.count({
    where: {
      patientId,
      organizationId,
      status: 'UNREAD',
      isFromPatient: false, // Only count messages FROM practice
      deletedAt: null,
    },
  });

  return count;
}

/**
 * Mark all messages as read
 */
export async function markAllAsRead(
  patientId: string,
  organizationId: string
): Promise<{ count: number }> {
  const result = await prisma.secureMessage.updateMany({
    where: {
      patientId,
      organizationId,
      status: 'UNREAD',
      isFromPatient: false,
      deletedAt: null,
    },
    data: {
      status: 'READ',
      readAt: new Date(),
    },
  });

  return { count: result.count };
}

/**
 * Mark a specific message as read and record the read receipt
 */
export async function markMessageAsRead(
  messageId: string,
  patientId: string,
  organizationId: string,
  portalUserId: string,
  ipAddress?: string
): Promise<{ success: boolean; readAt?: Date; error?: string }> {
  const message = await prisma.secureMessage.findFirst({
    where: {
      id: messageId,
      patientId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!message) {
    return { success: false, error: 'Message not found' };
  }

  // Only mark as read if it's from staff (not patient's own message)
  // and currently unread
  if (!message.isFromPatient && message.status === 'UNREAD') {
    const updated = await prisma.secureMessage.update({
      where: { id: messageId },
      data: { status: 'READ', readAt: new Date() },
    });

    // Log the read receipt action
    await logPortalAccess({
      action: 'PORTAL_VIEW_MESSAGE',
      portalUserId,
      organizationId,
      resource: 'SecureMessage',
      resourceId: messageId,
      ipAddress,
      success: true,
      metadata: { action: 'read_receipt' },
    });

    return { success: true, readAt: updated.readAt || undefined };
  }

  return { success: true, readAt: message.readAt || undefined };
}

/**
 * Check if current time is within business hours for auto-response
 */
export function isAfterHours(
  businessHours?: { open: string; close: string; timezone?: string; closedDays?: number[] }
): boolean {
  const hours = businessHours || {
    open: '08:00',
    close: '17:00',
    timezone: 'America/Los_Angeles',
    closedDays: [0, 6], // Sunday, Saturday
  };

  const now = new Date();

  // Get current time in the business timezone
  const timeStr = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    timeZone: hours.timezone || 'America/Los_Angeles',
  });

  const dayOfWeek = parseInt(
    now.toLocaleDateString('en-US', {
      weekday: 'narrow',
      timeZone: hours.timezone || 'America/Los_Angeles',
    }),
    10
  ) || now.getDay();

  // Check if it's a closed day
  if (hours.closedDays && hours.closedDays.includes(dayOfWeek)) {
    return true;
  }

  // Parse times
  const [currentHour, currentMin] = timeStr.split(':').map(Number);
  const [openHour, openMin] = hours.open.split(':').map(Number);
  const [closeHour, closeMin] = hours.close.split(':').map(Number);

  const currentMins = currentHour * 60 + currentMin;
  const openMins = openHour * 60 + openMin;
  const closeMins = closeHour * 60 + closeMin;

  return currentMins < openMins || currentMins >= closeMins;
}

/**
 * Send auto-response for after-hours messages
 */
export async function sendAfterHoursAutoResponse(
  originalMessageId: string,
  patientId: string,
  organizationId: string
): Promise<{ success: boolean; responseId?: string }> {
  // Get organization settings for custom auto-response message
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, settings: true },
  });

  // Extract phone from settings if available
  const settings = org?.settings as { phone?: string } | null;

  const autoResponseBody = `Thank you for your message. You've reached us outside of our regular business hours.

Our team typically responds to messages within 1-2 business days during normal hours (Monday-Friday, 8:00 AM - 5:00 PM).

If you have an urgent medical concern, please:
- Call 911 for emergencies
- Contact our office at ${settings?.phone || 'the number on file'} (leave a voicemail)
- Visit your nearest urgent care facility

We appreciate your patience and will respond to your message as soon as possible.

Best regards,
${org?.name || 'Your Care Team'}

---
This is an automated response.`;

  const autoResponse = await prisma.secureMessage.create({
    data: {
      subject: 'Auto-Reply: Message Received',
      body: autoResponseBody,
      isFromPatient: false,
      senderName: 'Automated Response',
      priority: 'NORMAL',
      status: 'UNREAD',
      parentMessageId: originalMessageId,
      patientId,
      organizationId,
    },
  });

  return { success: true, responseId: autoResponse.id };
}

/**
 * Upload message attachment
 */
export async function uploadMessageAttachment(
  file: {
    name: string;
    size: number;
    type: string;
    buffer: Buffer;
  },
  organizationId: string,
  portalUserId: string
): Promise<{ success: boolean; attachment?: { fileName: string; fileSize: number; storageKey: string; mimeType: string }; error?: string }> {
  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return { success: false, error: 'File size exceeds 10MB limit' };
  }

  // Validate file type
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];

  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: 'File type not allowed. Allowed types: JPEG, PNG, GIF, PDF, DOC, DOCX, TXT' };
  }

  // Generate storage key
  const storageKey = `messages/${organizationId}/${portalUserId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  // In production, this would upload to cloud storage (S3, GCS, etc.)
  // For now, we'll just return the metadata
  // TODO: Implement actual file storage

  return {
    success: true,
    attachment: {
      fileName: file.name,
      fileSize: file.size,
      storageKey,
      mimeType: file.type,
    },
  };
}

/**
 * Get attachment download URL
 */
export async function getAttachmentDownloadUrl(
  storageKey: string,
  organizationId: string,
  _portalUserId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  // Verify the storageKey belongs to this organization
  if (!storageKey.startsWith(`messages/${organizationId}/`)) {
    return { success: false, error: 'Unauthorized access to attachment' };
  }

  // In production, this would generate a signed URL from cloud storage
  // For now, return a placeholder URL
  // TODO: Implement actual file download URL generation

  return {
    success: true,
    url: `/api/portal/attachments/${encodeURIComponent(storageKey)}`,
  };
}

/**
 * Send email notification about new message
 */
export async function notifyNewMessage(
  messageId: string,
  recipientType: 'PATIENT' | 'STAFF',
  organizationId: string
): Promise<{ success: boolean; notificationSent: boolean }> {
  const message = await prisma.secureMessage.findUnique({
    where: { id: messageId },
    include: {
      patient: {
        include: {
          portalUser: true,
        },
      },
      organization: true,
    },
  });

  if (!message) {
    return { success: false, notificationSent: false };
  }

  // Import notification service dynamically to avoid circular deps
  const { notificationService } = await import('@/lib/notification-service');

  if (recipientType === 'PATIENT' && message.patient?.portalUser?.email) {
    // Check if patient has message notifications enabled
    // For now, assume enabled by default
    const patientEmail = message.patient.portalUser.email;

    await notificationService.sendEmail(
      patientEmail,
      `New Message from ${message.organization.name}`,
      `You have received a new secure message.\n\nSubject: ${message.subject}\n\nPlease log in to your patient portal to view and respond to this message.\n\nThis is a secure message. Please do not reply to this email.`,
      {
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #053e67;">New Secure Message</h2>
            <p>You have received a new secure message from ${message.organization.name}.</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Subject:</strong> ${message.subject}</p>
            </div>
            <p>Please <a href="${process.env.NEXT_PUBLIC_APP_URL || ''}/portal/messages" style="color: #053e67;">log in to your patient portal</a> to view and respond to this message.</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
            <p style="color: #666; font-size: 12px;">This is a secure message notification. Please do not reply to this email. For your privacy, message content is only available within the secure patient portal.</p>
          </div>
        `,
      }
    );

    return { success: true, notificationSent: true };
  }

  // TODO: Implement staff notification when patient sends a message

  return { success: true, notificationSent: false };
}
