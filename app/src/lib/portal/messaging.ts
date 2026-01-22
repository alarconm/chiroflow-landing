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
