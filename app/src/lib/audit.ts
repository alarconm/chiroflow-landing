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
  // AI Documentation Agent actions (Epic 32)
  | 'AI_TRANSCRIPTION_START'
  | 'AI_TRANSCRIPTION_STOP'
  | 'AI_TRANSCRIPTION_EDIT'
  | 'AI_AMBIENT_MODE_START'
  | 'AI_AMBIENT_MODE_STOP'
  // AI SOAP Generation actions (Epic 32 - US-317)
  | 'AI_SOAP_GENERATE'
  | 'AI_SOAP_EDIT'
  | 'AI_SOAP_APPROVE'
  | 'AI_SOAP_REJECT'
  | 'AI_SOAP_APPLY'
  | 'AI_SOAP_REGENERATE'
  // AI Code Suggestion actions (Epic 32 - US-318)
  | 'AI_CODE_SUGGEST'
  | 'AI_CODE_ACCEPT'
  | 'AI_CODE_REJECT'
  | 'AI_CODE_MODIFY'
  | 'AI_CODE_ACCEPT_ALL'
  | 'AI_CODE_FLAG'
  // AI Compliance actions (Epic 32 - US-319)
  | 'AI_COMPLIANCE_RESOLVE'
  | 'AI_COMPLIANCE_AUTOFIX'
  // AI Provider Preference Learning actions (Epic 32 - US-320)
  | 'AI_PREFERENCE_LEARN'
  | 'AI_PREFERENCE_SET'
  | 'AI_PREFERENCE_REMOVE'
  | 'AI_STYLE_ANALYSIS'
  // AI Template and Macro actions (Epic 32 - US-321)
  | 'AI_TEMPLATE_SUGGEST'
  | 'AI_TEMPLATE_ACCEPT'
  | 'AI_TEMPLATE_REJECT'
  | 'AI_TEMPLATE_PULL_FORWARD'
  | 'AI_MACRO_CREATE'
  | 'AI_MACRO_UPDATE'
  | 'AI_MACRO_DELETE'
  | 'AI_MACRO_EXPAND'
  | 'AI_MACRO_LEARN'
  | 'AI_AUTOCOMPLETE'
  | 'AI_QUICK_NORMAL'
  // AI Billing actions (Epic 09)
  | 'AI_BILLING_SCRUB'
  | 'AI_BILLING_BATCH_SCRUB'
  | 'AI_BILLING_PREDICT'
  | 'AI_BILLING_APPEAL'
  | 'AI_BILLING_MATCH'
  | 'AI_BILLING_UNDERPAYMENT'
  | 'AI_BILLING_BATCH_JOB'
  // AI Billing Agent actions (Epic 31)
  | 'AI_BILLING_SUBMIT'
  | 'AI_BILLING_ANALYZE_DENIAL'
  | 'AI_BILLING_ROUTE_DENIAL'
  | 'AI_BILLING_DENIAL_OUTCOME'
  // AI Automated Appeal actions (Epic 31 - US-310)
  | 'AI_BILLING_GENERATE_APPEAL'
  | 'AI_BILLING_SUBMIT_APPEAL'
  | 'AI_BILLING_APPEAL_OUTCOME'
  | 'AI_BILLING_BATCH_APPEALS'
  // AI Claim Follow-Up actions (Epic 31 - US-311)
  | 'AI_BILLING_FOLLOW_UP'
  | 'AI_BILLING_BATCH_FOLLOW_UP'
  | 'AI_BILLING_ESCALATE_CLAIMS'
  | 'AI_BILLING_GET_AR_AGING'
  // AI Smart Payment Posting actions (Epic 31 - US-312)
  | 'AI_BILLING_PROCESS_ERA'
  | 'AI_BILLING_MATCH_PAYMENT'
  | 'AI_BILLING_MANUAL_POST'
  | 'AI_BILLING_PARTIAL_PAYMENT'
  | 'AI_BILLING_SECONDARY_CLAIM'
  // AI Billing Optimization actions (Epic 31 - US-313)
  | 'AI_BILLING_GET_RECOMMENDATIONS'
  | 'AI_BILLING_REVIEW_RECOMMENDATION'
  | 'AI_BILLING_APPLY_RECOMMENDATION'
  | 'AI_BILLING_DISMISS_RECOMMENDATION'
  | 'AI_BILLING_FEE_SCHEDULE_ANALYSIS'
  | 'AI_BILLING_CONTRACT_INSIGHTS'
  | 'AI_BILLING_REVENUE_LEAKAGE'
  // AI Billing Agent Dashboard actions (Epic 31 - US-314)
  | 'AI_BILLING_UPDATE_RULE'
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
  // Chiropractic Clinical actions (Epic 19)
  | 'TECHNIQUE_CREATE'
  | 'TECHNIQUE_UPDATE'
  | 'TECHNIQUE_DELETE'
  | 'TECHNIQUE_SEED'
  | 'TECHNIQUE_FAVORITE_ADD'
  | 'TECHNIQUE_FAVORITE_REMOVE'
  | 'SUBLUXATION_CREATE'
  | 'SUBLUXATION_UPDATE'
  | 'SUBLUXATION_DELETE'
  | 'SUBLUXATION_RESOLVE'
  | 'ADJUSTMENT_CREATE'
  | 'ADJUSTMENT_UPDATE'
  | 'ADJUSTMENT_DELETE'
  | 'VERTEBRAL_LISTING_CREATE'
  | 'VERTEBRAL_LISTING_UPDATE'
  | 'VERTEBRAL_LISTING_DELETE'
  | 'CHIROPRACTIC_EXAM_CREATE'
  | 'CHIROPRACTIC_EXAM_UPDATE'
  | 'CHIROPRACTIC_EXAM_DELETE'
  // AI Posture & Movement Analysis actions (Epic 20)
  | 'POSTURE_IMAGE_UPLOAD'
  | 'POSTURE_ASSESSMENT_CREATE'
  | 'POSTURE_ASSESSMENT_UPDATE'
  | 'POSTURE_ASSESSMENT_DELETE'
  | 'POSTURE_ASSESSMENT_COMPLETE'
  // AI Imaging Analysis actions (Epic 22)
  | 'IMAGING_AI_ANALYZE'
  | 'IMAGING_AI_MEASUREMENT_APPLY'
  | 'IMAGING_AI_ABNORMALITY_APPLY'
  | 'IMAGING_AI_REPORT_DRAFT'
  // Multi-Location Management (Epic 25)
  | 'LOCATION_CREATE'
  | 'LOCATION_UPDATE'
  | 'LOCATION_DEACTIVATE'
  | 'LOCATION_REACTIVATE'
  | 'LOCATION_HOURS_UPDATE'
  | 'LOCATION_BRANDING_UPDATE'
  | 'LOCATION_STAFF_ASSIGN'
  | 'LOCATION_STAFF_REMOVE'
  // Cross-Location Patient Access (Epic 25 - US-251)
  | 'PATIENT_HOME_LOCATION_SET'
  | 'PATIENT_HOME_LOCATION_CHANGE'
  | 'PATIENT_CROSS_LOCATION_CONSENT'
  | 'PATIENT_CROSS_LOCATION_ACCESS'
  | 'PATIENT_CROSS_LOCATION_VIEW'
  | 'PATIENT_CROSS_LOCATION_ENCOUNTER'
  | 'PATIENT_BALANCE_BY_LOCATION_UPDATE'
  // Cross-Location Scheduling (Epic 25 - US-252)
  | 'APPOINTMENT_TRANSFER_LOCATION'
  | 'APPOINTMENT_TYPE_LOCATION_UPDATE'
  | 'ROOM_LOCATION_ASSIGN'
  | 'RESOURCE_LOCATION_ASSIGN'
  // Enterprise Reporting (Epic 25 - US-253)
  | 'ENTERPRISE_REPORT_VIEW'
  | 'ENTERPRISE_REPORT_EXPORT'
  | 'ENTERPRISE_LOCATION_COMPARE'
  // Inter-Location Inventory (Epic 25 - US-254)
  | 'INVENTORY_TRANSFER_CREATE'
  | 'INVENTORY_TRANSFER_APPROVE'
  | 'INVENTORY_TRANSFER_REJECT'
  | 'INVENTORY_TRANSFER_SHIP'
  | 'INVENTORY_TRANSFER_RECEIVE'
  | 'INVENTORY_TRANSFER_CANCEL'
  | 'INVENTORY_TRANSFER_UPDATE'
  | 'INVENTORY_LOW_STOCK_ALERT_CREATE'
  | 'INVENTORY_LOW_STOCK_ALERT_RESOLVE'
  | 'INVENTORY_VALUE_REPORT_VIEW'
  // Push Notifications (Epic 27 - US-265)
  | 'NOTIFICATION_DEVICE_REGISTERED'
  | 'NOTIFICATION_DEVICE_UNREGISTERED'
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_BULK_SENT'
  | 'NOTIFICATION_PREFERENCES_UPDATED'
  | 'NOTIFICATION_CLEANUP'
  // Offline Mode (Epic 27 - US-270)
  | 'OFFLINE_SYNC_PUSH'
  | 'OFFLINE_SYNC_MANUAL'
  | 'OFFLINE_SYNC_RETRY'
  | 'OFFLINE_CONFLICT_RESOLVED'
  | 'OFFLINE_CACHE_CLEARED'
  | 'OFFLINE_FULL_SYNC'
  | 'OFFLINE_CLEANUP'
  // AI Care Coordinator (Epic 33)
  | 'AI_CARE_MONITOR_PLAN'
  | 'AI_CARE_RISK_NOTIFICATION'
  | 'AI_CARE_OUTREACH_RECOMMEND'
  | 'AI_CARE_GAP_IDENTIFY'
  | 'AI_CARE_ENGAGEMENT_CALCULATE'
  | 'AI_CARE_JOURNEY_UPDATE'
  // AI Quality Assurance Agent (Epic 36)
  | 'AI_QA_DOCUMENTATION_AUDIT'
  | 'AI_QA_CODING_AUDIT'
  | 'AI_QA_COMPLIANCE_AUDIT'
  | 'AI_QA_COMPLIANCE_MONITORING'
  | 'AI_QA_CLINICAL_AUDIT'
  | 'AI_QA_CLINICAL_QUALITY'
  | 'AI_QA_FINDING_RESOLVED'
  | 'AI_QA_FINDING_DISMISSED'
  | 'AI_QA_METRIC_UPDATE'
  | 'AI_QA_ALERT_CREATED'
  | 'AI_QA_ALERT_ACKNOWLEDGED'
  | 'AI_QA_ALERT_RESOLVED'
  | 'AI_QA_ALERT_ESCALATED'
  | 'AI_QA_COMPLIANCE_ALERT_ACKNOWLEDGED'
  | 'AI_QA_COMPLIANCE_ALERT_RESOLVED'
  | 'AI_QA_COMPLIANCE_ALERT_ESCALATED'
  // AI QA Risk Identification (US-352)
  | 'AI_QA_RISK_IDENTIFICATION'
  | 'AI_QA_RISK_MITIGATION_STARTED'
  | 'AI_QA_RISK_MITIGATION_COMPLETED'
  // AI QA Audit Preparation (US-353)
  | 'AI_QA_AUDIT_PREPARATION'
  | 'AI_QA_MOCK_AUDIT'
  | 'AI_QA_RESPONSE_GENERATED'
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
