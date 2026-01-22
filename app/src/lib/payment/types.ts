/**
 * Payment Processing Types
 * Epic 10: Payment Processing
 */

import type { CardType, CardBrand, PaymentTransactionStatus } from '@prisma/client';

// ============================================
// Payment Method Types
// ============================================

export interface CardDetails {
  number: string;  // Will be tokenized, never stored
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
  cardholderName: string;
  billingZip?: string;
}

export interface TokenizedCard {
  paymentToken: string;
  last4: string;
  cardBrand: CardBrand;
  cardType: CardType;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  billingZip?: string;
}

export interface StoredPaymentMethodInfo {
  id: string;
  paymentToken: string;
  last4: string;
  cardBrand: CardBrand;
  cardType: CardType;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  billingZip?: string;
  isDefault: boolean;
  nickname?: string;
}

// ============================================
// Payment Transaction Types
// ============================================

export interface CreatePaymentRequest {
  amount: number;       // In cents
  currency?: string;    // Default: USD
  paymentToken: string; // From stored payment method
  description?: string;
  metadata?: Record<string, string>;

  // For idempotency
  idempotencyKey?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;      // Processor transaction ID
  status: PaymentTransactionStatus;
  amount: number;
  currency: string;

  // Error info (if failed)
  errorCode?: string;
  errorMessage?: string;
  declineCode?: string;

  // Raw response for debugging
  rawResponse?: Record<string, unknown>;
}

export interface RefundRequest {
  transactionId: string;  // Original transaction ID
  amount?: number;        // Partial refund amount (in cents), undefined = full refund
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  status: PaymentTransactionStatus;
  amount: number;

  errorCode?: string;
  errorMessage?: string;

  rawResponse?: Record<string, unknown>;
}

// ============================================
// Tokenization Types
// ============================================

export interface TokenizeCardRequest {
  card: CardDetails;
  customerId?: string;  // External customer ID (Stripe customer, etc.)
}

export interface TokenizeCardResult {
  success: boolean;
  token?: TokenizedCard;

  errorCode?: string;
  errorMessage?: string;
}

// ============================================
// Customer Management Types
// ============================================

export interface CreateCustomerRequest {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}

export interface CustomerResult {
  success: boolean;
  customerId?: string;

  errorCode?: string;
  errorMessage?: string;
}

// ============================================
// Payment Plan Types
// ============================================

export interface PaymentPlanConfig {
  totalAmount: number;      // Total amount in cents
  downPayment?: number;     // Optional down payment in cents
  numberOfInstallments: number;
  frequency: 'weekly' | 'bi_weekly' | 'monthly';
  startDate: Date;
  interestRate?: number;    // Annual percentage (e.g., 0.05 for 5%)
  setupFee?: number;        // In cents
}

export interface PaymentPlanSchedule {
  installments: Array<{
    number: number;
    amount: number;
    dueDate: Date;
  }>;
  totalAmount: number;
  totalWithInterest: number;
}

// ============================================
// Statement Types
// ============================================

export interface StatementLineItem {
  date: Date;
  description: string;
  serviceCode?: string;
  charges: number;
  payments: number;
  adjustments: number;
  balance: number;
}

export interface StatementData {
  patientName: string;
  patientId: string;
  accountNumber: string;

  statementDate: Date;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;

  previousBalance: number;
  newCharges: number;
  payments: number;
  adjustments: number;
  totalDue: number;
  minimumDue?: number;

  lineItems: StatementLineItem[];

  organizationName: string;
  organizationAddress: string;
  organizationPhone: string;

  messageToPatient?: string;
}

// ============================================
// QuickBooks Sync Types
// ============================================

export interface QuickBooksSyncResult {
  success: boolean;
  syncedAt?: Date;
  transactionId?: string;  // QB transaction ID

  errorCode?: string;
  errorMessage?: string;
}

export interface QuickBooksPaymentData {
  paymentId: string;
  patientId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: string;
  referenceNumber?: string;
  memo?: string;
}

// ============================================
// Provider Configuration
// ============================================

export interface PaymentProviderConfig {
  apiKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  environment: 'sandbox' | 'production';

  // Optional feature flags
  features?: {
    supportsHSA?: boolean;
    supportsFSA?: boolean;
    supportsACH?: boolean;
    supportsPartialRefunds?: boolean;
  };
}

// ============================================
// HSA/FSA Specific Types
// ============================================

export interface HSAFSAVerificationResult {
  isEligible: boolean;
  cardType: 'HSA' | 'FSA' | 'STANDARD';
  maxEligibleAmount?: number;
  requiresIIAS?: boolean;  // Inventory Information Approval System
  merchantCategoryCode?: string;
}

// ============================================
// Webhook Types
// ============================================

export type WebhookEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment_method.attached'
  | 'payment_method.detached'
  | 'customer.created'
  | 'customer.deleted';

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface WebhookVerificationResult {
  valid: boolean;
  event?: WebhookEvent;
  errorMessage?: string;
}

// ============================================
// Webhook Handler Types (US-091)
// ============================================

export type StripeWebhookEventType =
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'payment_intent.canceled'
  | 'charge.refunded'
  | 'charge.refund.updated'
  | 'charge.dispute.created'
  | 'charge.dispute.updated'
  | 'charge.dispute.closed'
  | 'payment_method.attached'
  | 'payment_method.detached'
  | 'customer.created'
  | 'customer.deleted';

export interface WebhookHandlerResult {
  success: boolean;
  eventId: string;
  eventType: string;
  processed: boolean;
  skipped?: boolean;  // True if already processed (idempotent)
  actions?: WebhookAction[];
  error?: string;
}

export interface WebhookAction {
  type: 'transaction_updated' | 'ledger_updated' | 'email_sent' | 'alert_created' | 'dispute_created';
  entityId?: string;
  entityType?: string;
  details?: Record<string, unknown>;
}

export interface DisputeInfo {
  disputeId: string;
  transactionId: string;
  amount: number;
  reason: string;
  status: 'needs_response' | 'under_review' | 'won' | 'lost' | 'warning_closed' | 'warning_needs_response';
  evidenceDueDate?: Date;
  createdAt: Date;
}
