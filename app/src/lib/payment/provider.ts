/**
 * Payment Provider Interface
 * Epic 10: Payment Processing
 *
 * Abstract interface for payment processors (Stripe, Square, etc.)
 */

import type {
  CardDetails,
  TokenizeCardRequest,
  TokenizeCardResult,
  CreatePaymentRequest,
  PaymentResult,
  RefundRequest,
  RefundResult,
  CreateCustomerRequest,
  CustomerResult,
  HSAFSAVerificationResult,
  WebhookEvent,
  WebhookVerificationResult,
  PaymentProviderConfig,
} from './types';

/**
 * PaymentProvider interface
 *
 * All payment processors must implement this interface.
 * This allows swapping between Stripe, Square, or any other processor.
 */
export interface PaymentProvider {
  /**
   * Provider identification
   */
  readonly name: string;
  readonly version: string;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: PaymentProviderConfig): Promise<void>;

  /**
   * Check if the provider is properly configured and ready
   */
  isReady(): boolean;

  // ============================================
  // Card Tokenization
  // ============================================

  /**
   * Tokenize a card for secure storage
   * This is typically done client-side with Stripe.js or similar
   * For server-side, this creates a payment method
   */
  tokenizeCard(request: TokenizeCardRequest): Promise<TokenizeCardResult>;

  /**
   * Delete a stored payment method
   */
  deletePaymentMethod(paymentToken: string): Promise<{ success: boolean; errorMessage?: string }>;

  // ============================================
  // Customer Management
  // ============================================

  /**
   * Create a customer in the payment processor
   * Required for storing payment methods with some providers
   */
  createCustomer(request: CreateCustomerRequest): Promise<CustomerResult>;

  /**
   * Delete a customer from the payment processor
   */
  deleteCustomer(customerId: string): Promise<{ success: boolean; errorMessage?: string }>;

  /**
   * Attach a payment method to a customer
   */
  attachPaymentMethod(
    paymentToken: string,
    customerId: string
  ): Promise<{ success: boolean; errorMessage?: string }>;

  // ============================================
  // Payments
  // ============================================

  /**
   * Process a payment
   */
  processPayment(request: CreatePaymentRequest): Promise<PaymentResult>;

  /**
   * Process a refund (full or partial)
   */
  processRefund(request: RefundRequest): Promise<RefundResult>;

  /**
   * Get the status of a transaction
   */
  getTransactionStatus(transactionId: string): Promise<PaymentResult>;

  /**
   * Cancel/void a pending payment (if not yet captured)
   */
  cancelPayment(transactionId: string): Promise<{ success: boolean; errorMessage?: string }>;

  // ============================================
  // HSA/FSA Support
  // ============================================

  /**
   * Verify if a card is HSA/FSA eligible
   * Note: Not all processors support this
   */
  verifyHSAFSA?(cardToken: string): Promise<HSAFSAVerificationResult>;

  // ============================================
  // Webhooks
  // ============================================

  /**
   * Verify webhook signature and parse event
   */
  verifyWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<WebhookVerificationResult>;

  /**
   * Get supported webhook event types
   */
  getSupportedWebhookEvents(): string[];
}

/**
 * Base class with common functionality
 */
export abstract class BasePaymentProvider implements PaymentProvider {
  abstract readonly name: string;
  abstract readonly version: string;

  protected config: PaymentProviderConfig | null = null;
  protected initialized = false;

  async initialize(config: PaymentProviderConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && this.config !== null;
  }

  protected ensureInitialized(): void {
    if (!this.isReady()) {
      throw new Error(`${this.name} provider is not initialized. Call initialize() first.`);
    }
  }

  // Abstract methods that must be implemented
  abstract tokenizeCard(request: TokenizeCardRequest): Promise<TokenizeCardResult>;
  abstract deletePaymentMethod(
    paymentToken: string
  ): Promise<{ success: boolean; errorMessage?: string }>;
  abstract createCustomer(request: CreateCustomerRequest): Promise<CustomerResult>;
  abstract deleteCustomer(
    customerId: string
  ): Promise<{ success: boolean; errorMessage?: string }>;
  abstract attachPaymentMethod(
    paymentToken: string,
    customerId: string
  ): Promise<{ success: boolean; errorMessage?: string }>;
  abstract processPayment(request: CreatePaymentRequest): Promise<PaymentResult>;
  abstract processRefund(request: RefundRequest): Promise<RefundResult>;
  abstract getTransactionStatus(transactionId: string): Promise<PaymentResult>;
  abstract cancelPayment(
    transactionId: string
  ): Promise<{ success: boolean; errorMessage?: string }>;
  abstract verifyWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<WebhookVerificationResult>;
  abstract getSupportedWebhookEvents(): string[];
}
