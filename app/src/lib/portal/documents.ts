/**
 * Epic 14: Patient Portal - Document Access Service
 * Manages patient access to documents through the portal
 */

import { prisma } from '@/lib/prisma';
import { logPortalAccess } from './auth';
import type { PortalDocument, PortalDocumentCategory, PortalDocumentVisibility } from './types';

/**
 * Get documents available to patient
 */
export async function getPatientDocuments(
  patientId: string,
  organizationId: string,
  options: {
    category?: PortalDocumentCategory;
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'title' | 'category';
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ documents: PortalDocument[]; total: number }> {
  const {
    category,
    limit = 20,
    offset = 0,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = options;

  // Build where clause - only show visible documents
  const fullWhere: Record<string, unknown> = {
    patientId,
    organizationId,
    visibility: { not: 'HIDDEN' },
    AND: [
      {
        OR: [
          { visibility: 'ALWAYS' },
          {
            visibility: 'AFTER_REVIEW',
            reviewedAt: { not: null },
          },
        ],
      },
      {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    ],
  };

  if (category) {
    Object.assign(fullWhere, { category });
  }

  const [documents, total] = await Promise.all([
    prisma.portalDocument.findMany({
      where: fullWhere,
      orderBy: { [sortBy]: sortOrder },
      take: limit,
      skip: offset,
    }),
    prisma.portalDocument.count({ where: fullWhere }),
  ]);

  return {
    documents: documents.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description ?? undefined,
      category: d.category as PortalDocumentCategory,
      fileName: d.fileName,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      createdAt: d.createdAt,
      lastViewedAt: d.lastViewedAt ?? undefined,
    })),
    total,
  };
}

/**
 * Get document by ID (for download)
 */
export async function getDocument(
  documentId: string,
  patientId: string,
  organizationId: string,
  portalUserId: string,
  ipAddress?: string
): Promise<{
  success: boolean;
  document?: PortalDocument & { storageKey: string };
  error?: string;
}> {
  const document = await prisma.portalDocument.findFirst({
    where: {
      id: documentId,
      patientId,
      organizationId,
      visibility: { not: 'HIDDEN' },
      AND: [
        {
          OR: [
            { visibility: 'ALWAYS' },
            {
              visibility: 'AFTER_REVIEW',
              reviewedAt: { not: null },
            },
          ],
        },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      ],
    },
  });

  if (!document) {
    return { success: false, error: 'Document not found or not accessible' };
  }

  // Update view count and last viewed
  await prisma.portalDocument.update({
    where: { id: documentId },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: new Date(),
    },
  });

  // Log access
  await logPortalAccess({
    action: 'PORTAL_VIEW_DOCUMENT',
    portalUserId,
    organizationId,
    resource: 'PortalDocument',
    resourceId: document.id,
    ipAddress,
    success: true,
    metadata: { title: document.title, category: document.category },
  });

  return {
    success: true,
    document: {
      id: document.id,
      title: document.title,
      description: document.description ?? undefined,
      category: document.category as PortalDocumentCategory,
      fileName: document.fileName,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      storageKey: document.storageKey,
      createdAt: document.createdAt,
      lastViewedAt: document.lastViewedAt ?? undefined,
    },
  };
}

/**
 * Record document download
 */
export async function recordDocumentDownload(
  documentId: string,
  patientId: string,
  organizationId: string,
  portalUserId: string,
  ipAddress?: string
): Promise<void> {
  await prisma.portalDocument.update({
    where: { id: documentId },
    data: {
      downloadCount: { increment: 1 },
      lastDownloadedAt: new Date(),
    },
  });

  // Log download
  await logPortalAccess({
    action: 'PORTAL_DOWNLOAD_DOCUMENT',
    portalUserId,
    organizationId,
    resource: 'PortalDocument',
    resourceId: documentId,
    ipAddress,
    success: true,
  });
}

/**
 * Get new document count (documents not yet viewed)
 */
export async function getNewDocumentCount(
  patientId: string,
  organizationId: string
): Promise<number> {
  const count = await prisma.portalDocument.count({
    where: {
      patientId,
      organizationId,
      visibility: { not: 'HIDDEN' },
      lastViewedAt: null, // Never viewed
      AND: [
        {
          OR: [
            { visibility: 'ALWAYS' },
            {
              visibility: 'AFTER_REVIEW',
              reviewedAt: { not: null },
            },
          ],
        },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      ],
    },
  });

  return count;
}

/**
 * Get documents by category summary
 */
export async function getDocumentsSummary(
  patientId: string,
  organizationId: string
): Promise<Array<{ category: PortalDocumentCategory; count: number }>> {
  const results = await prisma.portalDocument.groupBy({
    by: ['category'],
    where: {
      patientId,
      organizationId,
      visibility: { not: 'HIDDEN' },
      AND: [
        {
          OR: [
            { visibility: 'ALWAYS' },
            {
              visibility: 'AFTER_REVIEW',
              reviewedAt: { not: null },
            },
          ],
        },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      ],
    },
    _count: { id: true },
  });

  return results.map((r) => ({
    category: r.category as PortalDocumentCategory,
    count: r._count.id,
  }));
}

// Admin functions for staff to manage portal documents

/**
 * Upload a document for patient portal (staff use)
 */
export async function uploadPortalDocument(
  patientId: string,
  organizationId: string,
  data: {
    title: string;
    description?: string;
    category: PortalDocumentCategory;
    fileName: string;
    fileSize: number;
    mimeType: string;
    storageKey: string;
    visibility?: PortalDocumentVisibility;
    encounterId?: string;
    treatmentPlanId?: string;
    uploadedBy: string;
  }
): Promise<{ success: boolean; documentId?: string; error?: string }> {
  const {
    title,
    description,
    category,
    fileName,
    fileSize,
    mimeType,
    storageKey,
    visibility = 'AFTER_REVIEW',
    encounterId,
    treatmentPlanId,
    uploadedBy,
  } = data;

  // Verify patient exists
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId },
  });

  if (!patient) {
    return { success: false, error: 'Patient not found' };
  }

  const document = await prisma.portalDocument.create({
    data: {
      title,
      description,
      category,
      fileName,
      fileSize,
      mimeType,
      storageKey,
      visibility,
      encounterId,
      treatmentPlanId,
      uploadedBy,
      patientId,
      organizationId,
      // If visibility is ALWAYS, make it visible immediately
      visibleAt: visibility === 'ALWAYS' ? new Date() : undefined,
      reviewedAt: visibility === 'ALWAYS' ? new Date() : undefined,
      reviewedBy: visibility === 'ALWAYS' ? uploadedBy : undefined,
    },
  });

  return { success: true, documentId: document.id };
}

/**
 * Review and approve a document for patient visibility (staff use)
 */
export async function reviewDocument(
  documentId: string,
  organizationId: string,
  reviewedBy: string,
  approve: boolean
): Promise<{ success: boolean; error?: string }> {
  const document = await prisma.portalDocument.findFirst({
    where: { id: documentId, organizationId },
  });

  if (!document) {
    return { success: false, error: 'Document not found' };
  }

  if (approve) {
    await prisma.portalDocument.update({
      where: { id: documentId },
      data: {
        reviewedAt: new Date(),
        reviewedBy,
        visibleAt: new Date(),
      },
    });
  } else {
    await prisma.portalDocument.update({
      where: { id: documentId },
      data: {
        visibility: 'HIDDEN',
        reviewedAt: new Date(),
        reviewedBy,
      },
    });
  }

  return { success: true };
}
