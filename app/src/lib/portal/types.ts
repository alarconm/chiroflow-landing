/**
 * Epic 14: Patient Portal - Type Definitions
 */

// Portal user status
export type PortalUserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'LOCKED';

// Document visibility
export type PortalDocumentVisibility = 'ALWAYS' | 'AFTER_REVIEW' | 'HIDDEN';

// Document categories
export type PortalDocumentCategory =
  | 'VISIT_SUMMARY'
  | 'TREATMENT_PLAN'
  | 'LAB_RESULTS'
  | 'IMAGING'
  | 'CONSENT_FORM'
  | 'EDUCATION'
  | 'BILLING'
  | 'INSURANCE'
  | 'OTHER';

// Message status and priority
export type SecureMessageStatus = 'UNREAD' | 'READ' | 'ARCHIVED' | 'DELETED';
export type SecureMessagePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

// Appointment request status
export type AppointmentRequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED' | 'EXPIRED';

// Portal session
export interface PortalSession {
  id: string;
  token: string;
  portalUserId: string;
  userAgent?: string;
  ipAddress?: string;
  deviceType?: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
}

// Portal user (simplified for client)
export interface PortalUserInfo {
  id: string;
  email: string;
  status: PortalUserStatus;
  emailVerified: boolean;
  lastLoginAt?: Date;
  patientId: string;
  organizationId: string;
  patient: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    preferredName?: string;
    dateOfBirth?: Date;
  };
}

// Login response
export interface PortalLoginResponse {
  success: boolean;
  token?: string;
  user?: PortalUserInfo;
  error?: string;
  requiresVerification?: boolean;
}

// Portal profile (patient info accessible via portal)
export interface PortalProfile {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  dateOfBirth: Date;
  gender?: string;
  email?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
}

// Appointment for portal view
export interface PortalAppointment {
  id: string;
  startTime: Date;
  endTime: Date;
  status: string;
  appointmentType?: {
    id: string;
    name: string;
    duration: number;
  };
  provider?: {
    id: string;
    firstName: string;
    lastName: string;
    title?: string;
  };
  notes?: string;
  chiefComplaint?: string;
  canCancel: boolean;
}

// Form for portal view
export interface PortalForm {
  id: string;
  templateId: string;
  templateName: string;
  status: string;
  dueDate?: Date;
  completedAt?: Date;
  accessToken: string;
}

// Statement for portal view
export interface PortalStatement {
  id: string;
  statementNumber: string;
  statementDate: Date;
  periodStart: Date;
  periodEnd: Date;
  previousBalance: number;
  newCharges: number;
  payments: number;
  adjustments: number;
  totalDue: number;
  dueDate: Date;
  status: string;
  pdfUrl?: string;
}

// Secure message for portal view
export interface PortalMessage {
  id: string;
  subject: string;
  body: string;
  isFromPatient: boolean;
  senderName?: string;
  status: SecureMessageStatus;
  priority: SecureMessagePriority;
  createdAt: Date;
  readAt?: Date;
  attachments?: Array<{
    fileName: string;
    fileSize: number;
  }>;
  replyCount?: number;
  parentMessageId?: string;
}

// Document for portal view
export interface PortalDocument {
  id: string;
  title: string;
  description?: string;
  category: PortalDocumentCategory;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
  lastViewedAt?: Date;
}

// Treatment plan for portal view
export interface PortalTreatmentPlan {
  id: string;
  name: string;
  description?: string;
  status: string;
  startDate: Date;
  endDate?: Date;
  plannedVisits?: number;
  completedVisits: number;
  frequency?: string;
  duration?: string;
  shortTermGoals?: string;
  longTermGoals?: string;
  provider?: {
    firstName: string;
    lastName: string;
    title?: string;
  };
  goals?: Array<{
    id: string;
    description: string;
    status: string;
    progress: number;
    targetDate?: Date;
  }>;
}

// Appointment request input
export interface AppointmentRequestInput {
  requestedDate?: Date;
  preferredDates?: Array<{
    date: Date;
    timePreference?: 'morning' | 'afternoon' | 'evening' | 'any';
  }>;
  appointmentTypeId?: string;
  providerId?: string;
  reason?: string;
  patientNotes?: string;
  isUrgent?: boolean;
}

// Portal preferences
export interface PortalPreferences {
  emailNotifications: boolean;
  smsNotifications: boolean;
  notifyAppointmentReminders: boolean;
  notifyAppointmentChanges: boolean;
  notifyNewMessages: boolean;
  notifyNewDocuments: boolean;
  notifyBillingStatements: boolean;
  notifyFormRequests: boolean;
  preferredLanguage: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
}

// Payment input for portal
export interface PortalPaymentInput {
  amount: number;
  paymentMethodId?: string; // Stored payment method
  // OR new payment method
  cardNumber?: string;
  expiryMonth?: string;
  expiryYear?: string;
  cvv?: string;
  cardholderName?: string;
  billingAddress?: {
    line1: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  savePaymentMethod?: boolean;
}

// Profile update input
export interface ProfileUpdateInput {
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  preferredName?: string;
}

// Password change input
export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// Portal dashboard summary
export interface PortalDashboardSummary {
  upcomingAppointments: number;
  pendingForms: number;
  unreadMessages: number;
  outstandingBalance: number;
  newDocuments: number;
  nextAppointment?: PortalAppointment;
}

// Audit action types for portal
export type PortalAuditAction =
  | 'PORTAL_LOGIN'
  | 'PORTAL_LOGOUT'
  | 'PORTAL_LOGIN_FAILED'
  | 'PORTAL_VIEW_APPOINTMENTS'
  | 'PORTAL_VIEW_APPOINTMENT'
  | 'PORTAL_REQUEST_APPOINTMENT'
  | 'PORTAL_CANCEL_APPOINTMENT'
  | 'PORTAL_VIEW_FORMS'
  | 'PORTAL_SUBMIT_FORM'
  | 'PORTAL_VIEW_STATEMENTS'
  | 'PORTAL_VIEW_STATEMENT'
  | 'PORTAL_MAKE_PAYMENT'
  | 'PORTAL_VIEW_MESSAGES'
  | 'PORTAL_VIEW_MESSAGE'
  | 'PORTAL_SEND_MESSAGE'
  | 'PORTAL_VIEW_DOCUMENTS'
  | 'PORTAL_DOWNLOAD_DOCUMENT'
  | 'PORTAL_VIEW_TREATMENT_PLAN'
  | 'PORTAL_UPDATE_PROFILE'
  | 'PORTAL_UPDATE_PREFERENCES'
  | 'PORTAL_CHANGE_PASSWORD';
