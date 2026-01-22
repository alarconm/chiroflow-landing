import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { headers } from 'next/headers';

export type AuditAction =
  // Auth actions
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_FAILED_LOGIN'
  | 'AUTH_PASSWORD_CHANGE'
  // User actions
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'USER_ROLE_CHANGE'
  // Organization actions
  | 'ORG_UPDATE'
  | 'ORG_SETTINGS_CHANGE'
  // Patient actions
  | 'PATIENT_CREATE'
  | 'PATIENT_UPDATE'
  | 'PATIENT_DELETE'
  | 'PATIENT_VIEW'
  // Appointment actions
  | 'APPOINTMENT_CREATE'
  | 'APPOINTMENT_UPDATE'
  | 'APPOINTMENT_DELETE'
  | 'APPOINTMENT_CANCEL'
  // Billing actions
  | 'BILLING_CREATE'
  | 'BILLING_UPDATE'
  | 'BILLING_DELETE'
  | 'PAYMENT_RECEIVED'
  // Claim actions
  | 'CLAIM_CREATE'
  | 'CLAIM_UPDATE'
  | 'CLAIM_SUBMIT'
  | 'CLAIM_VOID'
  | 'CLAIM_STATUS_UPDATE'
  | 'CMS1500_GENERATE'
  // Charge actions
  | 'CHARGE_CREATE'
  | 'CHARGE_CREATE_FROM_ENCOUNTER'
  | 'CHARGE_UPDATE'
  | 'CHARGE_VOID'
  | 'CHARGE_ADJUST'
  // Payment actions (extended)
  | 'PAYMENT_CREATE'
  | 'PAYMENT_UPDATE'
  | 'PAYMENT_VOID'
  | 'PAYMENT_APPLY'
  | 'PAYMENT_UNAPPLY'
  // Fee Schedule actions
  | 'FEE_SCHEDULE_CREATE'
  | 'FEE_SCHEDULE_UPDATE'
  | 'FEE_SCHEDULE_DELETE'
  | 'FEE_SCHEDULE_SET_DEFAULT'
  | 'FEE_SCHEDULE_ITEM_UPSERT'
  | 'FEE_SCHEDULE_ITEM_DELETE'
  | 'FEE_SCHEDULE_BULK_IMPORT'
  | 'FEE_SCHEDULE_COPY'
  // Insurance actions
  | 'INSURANCE_CREATE'
  | 'INSURANCE_UPDATE'
  | 'INSURANCE_DEACTIVATE'
  | 'INSURANCE_REORDER'
  | 'INSURANCE_VERIFY'
  // Insurance Payer actions
  | 'PAYER_CREATE'
  | 'PAYER_UPDATE'
  | 'PAYER_DEACTIVATE'
  | 'PAYER_REACTIVATE'
  // Statement/Superbill actions
  | 'STATEMENT_GENERATE'
  | 'SUPERBILL_GENERATE'
  | 'SUPERBILL_PDF_GENERATE'
  // Document actions
  | 'DOCUMENT_CREATE'
  | 'DOCUMENT_UPDATE'
  | 'DOCUMENT_DELETE'
  | 'DOCUMENT_VIEW'
  | 'DOCUMENT_DOWNLOAD'
  | 'DOCUMENT_LIST'
  // Merge actions
  | 'PATIENT_MERGE'
  // Encounter/Clinical actions
  | 'ENCOUNTER_CREATE'
  | 'ENCOUNTER_UPDATE'
  | 'ENCOUNTER_DELETE'
  | 'ENCOUNTER_VIEW'
  | 'ENCOUNTER_SIGN'
  | 'SOAP_NOTE_CREATE'
  | 'SOAP_NOTE_UPDATE'
  | 'SOAP_NOTE_LOCK'
  | 'ADDENDUM_CREATE'
  | 'DIAGNOSIS_ADD'
  | 'DIAGNOSIS_UPDATE'
  | 'DIAGNOSIS_REMOVE'
  | 'PROCEDURE_ADD'
  | 'PROCEDURE_UPDATE'
  | 'PROCEDURE_REMOVE'
  | 'TREATMENT_PLAN_CREATE'
  | 'TREATMENT_PLAN_UPDATE'
  | 'ASSESSMENT_SUBMIT'
  // AI Documentation actions
  | 'AI_TRANSCRIPTION'
  | 'AI_SOAP_GENERATION'
  | 'AI_CODE_SUGGESTION'
  | 'AI_COMPLIANCE_CHECK'
  | 'AI_AUTOFILL'
  | 'AI_MEDICAL_NECESSITY'
  // AI Billing actions (Epic 09)
  | 'AI_BILLING_SCRUB'
  | 'AI_BILLING_BATCH_SCRUB'
  | 'AI_BILLING_PREDICT'
  | 'AI_BILLING_APPEAL'
  | 'AI_BILLING_MATCH'
  | 'AI_BILLING_UNDERPAYMENT'
  | 'AI_BILLING_BATCH_JOB'
  // AI Insights actions (Epic 10)
  | 'AI_INSIGHT_STATUS_UPDATE'
  | 'AI_NL_QUERY'
  | 'AI_FULL_ANALYSIS'
  // Clearinghouse actions (Epic 08)
  | 'CLEARINGHOUSE_CONFIG_CREATE'
  | 'CLEARINGHOUSE_CONFIG_UPDATE'
  | 'CLEARINGHOUSE_CONFIG_DELETE'
  | 'CLAIM_SUBMIT_TO_CLEARINGHOUSE'
  | 'CLAIM_SUBMISSION_RETRY'
  | 'ELIGIBILITY_CHECK'
  | 'CLAIM_STATUS_CHECK'
  | 'CLAIM_STATUS_POLL'
  | 'REMITTANCE_RECEIVE'
  | 'REMITTANCE_PROCESS'
  | 'REMITTANCE_POST'
  | 'DENIAL_CREATE'
  | 'DENIAL_UPDATE'
  | 'DENIAL_APPEAL'
  | 'DENIAL_RESOLVE'
  | 'EDI_837_GENERATE'
  // Reporting actions (Epic 11/15)
  | 'SAVED_REPORT_CREATE'
  | 'SAVED_REPORT_UPDATE'
  | 'SAVED_REPORT_DELETE'
  | 'REPORT_SCHEDULE_CREATE'
  | 'REPORT_SCHEDULE_UPDATE'
  | 'REPORT_SCHEDULE_TOGGLE'
  | 'REPORT_SCHEDULE_DELETE'
  | 'REPORT_SCHEDULE_EXECUTE'
  | 'REPORT_EXPORT_REQUEST'
  // Report Service actions (Epic 15)
  | 'REPORT_GENERATE'
  | 'REPORT_DELETE'
  | 'REPORT_CACHE_INVALIDATE'
  | 'REPORT_CLEANUP'
  // Generic CRUD
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VIEW';

export type AuditLogInput = {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  userId?: string;
  organizationId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

// Get request metadata (IP and user agent)
export async function getRequestMetadata(): Promise<{ ipAddress: string; userAgent: string }> {
  try {
    const headersList = await headers();
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');
    const ipAddress = forwardedFor?.split(',')[0] ?? realIp ?? 'unknown';
    const userAgent = headersList.get('user-agent') ?? 'unknown';
    return { ipAddress, userAgent };
  } catch {
    return { ipAddress: 'unknown', userAgent: 'unknown' };
  }
}

// Create an audit log entry
export async function createAuditLog(input: AuditLogInput): Promise<void> {
  const { action, entityType, entityId, changes, userId, organizationId, ipAddress, userAgent, metadata } =
    input;

  // Get request metadata if not provided
  let finalIpAddress = ipAddress;
  let finalUserAgent = userAgent;

  if (!finalIpAddress || !finalUserAgent) {
    const requestMeta = await getRequestMetadata();
    finalIpAddress = finalIpAddress ?? requestMeta.ipAddress;
    finalUserAgent = finalUserAgent ?? requestMeta.userAgent;
  }

  await prisma.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      changes: changes
        ? ({ ...changes, ...(metadata ?? {}) } as Prisma.InputJsonValue)
        : metadata
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      userId,
      organizationId,
      ipAddress: finalIpAddress,
      userAgent: finalUserAgent,
    },
  });
}

// Convenience function for logging with auth user context
export async function auditLog(
  action: AuditAction,
  entityType: string,
  options: {
    entityId?: string;
    changes?: Record<string, unknown>;
    userId: string;
    organizationId: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { entityId, changes, userId, organizationId, metadata } = options;
  const { ipAddress, userAgent } = await getRequestMetadata();

  await createAuditLog({
    action,
    entityType,
    entityId,
    changes,
    userId,
    organizationId,
    ipAddress,
    userAgent,
    metadata,
  });
}

// Log authentication events
export async function logAuthEvent(
  action: 'AUTH_LOGIN' | 'AUTH_LOGOUT' | 'AUTH_FAILED_LOGIN' | 'AUTH_PASSWORD_CHANGE',
  userId: string | undefined,
  organizationId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    action,
    entityType: 'Auth',
    entityId: userId,
    userId,
    organizationId,
    metadata,
  });
}

// Query audit logs
export type AuditLogFilter = {
  organizationId: string;
  userId?: string;
  action?: AuditAction | AuditAction[];
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
};

export async function queryAuditLogs(filter: AuditLogFilter) {
  const { organizationId, userId, action, entityType, entityId, startDate, endDate, limit = 50, offset = 0 } =
    filter;

  const where: Record<string, unknown> = {
    organizationId,
  };

  if (userId) {
    where.userId = userId;
  }

  if (action) {
    where.action = Array.isArray(action) ? { in: action } : action;
  }

  if (entityType) {
    where.entityType = entityType;
  }

  if (entityId) {
    where.entityId = entityId;
  }

  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate && { gte: startDate }),
      ...(endDate && { lte: endDate }),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    total,
    limit,
    offset,
    hasMore: offset + logs.length < total,
  };
}

// Get audit log for a specific entity
export async function getEntityAuditHistory(
  organizationId: string,
  entityType: string,
  entityId: string,
  limit = 20
) {
  return prisma.auditLog.findMany({
    where: {
      organizationId,
      entityType,
      entityId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}
