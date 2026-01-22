/**
 * Stripe Payment Provider
 * Epic 10: Payment Processing - US-086
 *
 * Production implementation for Stripe payment processing.
 * Handles card tokenization, payments, refunds, and webhook verification.
 */

import Stripe from 'stripe';
import { PaymentTransactionStatus, CardBrand, CardType } from '@prisma/client';
import { BasePaymentProvider } from './provider';
import type {
  TokenizeCardRequest,
  TokenizeCardResult,
  CreatePaymentRequest,
  PaymentResult,
  RefundRequest,
  RefundResult,
  CreateCustomerRequest,
  CustomerResult,
  HSAFSAVerificationResult,
  WebhookVerificationResult,
  PaymentProviderConfig,
  WebhookEventType,
} from './types';

/**
 * Map Stripe card brand to our enum
 */
function mapStripeCardBrand(brand: string | null): CardBrand {
  switch (brand?.toLowerCase()) {
    case 'visa':
      return 'VISA';
    case 'mastercard':
      return 'MASTERCARD';
    case 'amex':
    case 'american_express':
      return 'AMEX';
    case 'discover':
      return 'DISCOVER';
    default:
      return 'OTHER';
  }
}

/**
 * Map Stripe payment intent status to our enum
 */
function mapStripeStatus(
  status: Stripe.PaymentIntent.Status | string
): PaymentTransactionStatus {
  switch (status) {
    case 'succeeded':
      return PaymentTransactionStatus.COMPLETED;
    case 'processing':
      return PaymentTransactionStatus.PROCESSING;
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'requires_capture':
      return PaymentTransactionStatus.PENDING;
    case 'canceled':
      return PaymentTransactionStatus.VOIDED;
    default:
      return PaymentTransactionStatus.FAILED;
  }
}

/**
 * Map Stripe refund status to our enum
 */
function mapStripeRefundStatus(
  status: string | null
): PaymentTransactionStatus {
  switch (status) {
    case 'succeeded':
      return PaymentTransactionStatus.REFUNDED;
    case 'pending':
      return PaymentTransactionStatus.PROCESSING;
    case 'failed':
    case 'canceled':
      return PaymentTransactionStatus.FAILED;
    default:
      return PaymentTransactionStatus.PENDING;
  }
}

/**
 * Stripe Payment Provider
 *
 * Full production implementation for Stripe payment processing.
 *
 * IMPORTANT: For client-side card entry, use Stripe.js and Stripe Elements.
 * This provider handles server-side operations with tokenized payment methods.
 *
 * Configuration:
 * - PAYMENT_PROVIDER=stripe (or call with 'stripe' provider type)
 * - STRIPE_SECRET_KEY=sk_xxx (secret key for API calls)
 * - STRIPE_PUBLISHABLE_KEY=pk_xxx (for client-side)
 * - STRIPE_WEBHOOK_SECRET=whsec_xxx (for webhook verification)
 */
export class StripePaymentProvider extends BasePaymentProvider {
  readonly name = 'StripePaymentProvider';
  readonly version = '1.0.0';

  private stripe: Stripe | null = null;

  async initialize(config: PaymentProviderConfig): Promise<void> {
    await super.initialize(config);

    if (!config.secretKey) {
      throw new Error('Stripe secret key is required');
    }

    // Initialize Stripe SDK
    this.stripe = new Stripe(config.secretKey);

    console.log(
      `[${this.name}] Initialized in ${config.environment} mode`
    );
  }

  private getStripe(): Stripe {
    if (!this.stripe) {
      throw new Error('Stripe not initialized. Call initialize() first.');
    }
    return this.stripe;
  }

  // ============================================
  // Card Tokenization
  // ============================================

  /**
   * Tokenize a card
   *
   * NOTE: In production, cards should be tokenized client-side with Stripe.js.
   * This method is for specific use cases like card migration or testing.
   * Use Stripe Elements on the frontend for PCI compliance.
   */
  async tokenizeCard(request: TokenizeCardRequest): Promise<TokenizeCardResult> {
    this.ensureInitialized();
    const stripe = this.getStripe();

    try {
      // Create a payment method (server-side tokenization)
      // In production, this token typically comes from Stripe.js on the client
      const paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: {
          number: request.card.number,
          exp_month: request.card.expiryMonth,
          exp_year: request.card.expiryYear,
          cvc: request.card.cvc,
        },
        billing_details: {
          name: request.card.cardholderName,
          address: request.card.billingZip
            ? { postal_code: request.card.billingZip }
            : undefined,
        },
      });

      // If a customer ID was provided, attach the payment method
      if (request.customerId) {
        await stripe.paymentMethods.attach(paymentMethod.id, {
          customer: request.customerId,
        });
      }

      const card = paymentMethod.card!;

      // Determine card type (HSA/FSA detection requires BIN lookup service)
      // Stripe provides funding type for debit detection
      let cardType: CardType = 'CREDIT';
      if (card.funding === 'debit') {
        cardType = 'DEBIT';
      }

      return {
        success: true,
        token: {
          paymentToken: paymentMethod.id,
          last4: card.last4,
          cardBrand: mapStripeCardBrand(card.brand),
          cardType,
          expiryMonth: card.exp_month,
          expiryYear: card.exp_year,
          cardholderName: request.card.cardholderName,
          billingZip: request.card.billingZip,
        },
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        errorCode: stripeError.code ?? 'tokenization_error',
        errorMessage: stripeError.message ?? 'Failed to tokenize card',
      };
    }
  }

  async deletePaymentMethod(
    paymentToken: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();
    const stripe = this.getStripe();

    try {
      await stripe.paymentMethods.detach(paymentToken);
      return { success: true };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        errorMessage: stripeError.message ?? 'Failed to delete payment method',
      };
    }
  }

  // ============================================
  // Customer Management
  // ============================================

  async createCustomer(request: CreateCustomerRequest): Promise<CustomerResult> {
    this.ensureInitialized();
    const stripe = this.getStripe();

    try {
      const customer = await stripe.customers.create({
        email: request.email,
        name: request.name,
        metadata: request.metadata,
      });

      return {
        success: true,
        customerId: customer.id,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        errorCode: stripeError.code ?? 'customer_creation_error',
        errorMessage: stripeError.message ?? 'Failed to create customer',
      };
    }
  }

  async deleteCustomer(
    customerId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();
    const stripe = this.getStripe();

    try {
      await stripe.customers.del(customerId);
      return { success: true };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        errorMessage: stripeError.message ?? 'Failed to delete customer',
      };
    }
  }

  async attachPaymentMethod(
    paymentToken: string,
    customerId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();
    const stripe = this.getStripe();

    try {
      await stripe.paymentMethods.attach(paymentToken, {
        customer: customerId,
      });
      return { success: true };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        errorMessage: stripeError.message ?? 'Failed to attach payment method',
      };
    }
  }

  // ============================================
  // Payments
  // ============================================

  async processPayment(request: CreatePaymentRequest): Promise<PaymentResult> {
    this.ensureInitialized();
    const stripe = this.getStripe();

    try {
      // Create and confirm payment intent
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: request.amount,
          currency: (request.currency ?? 'usd').toLowerCase(),
          payment_method: request.paymentToken,
          confirm: true,
          description: request.description,
          metadata: request.metadata,
          automatic_payment_methods: {
            enabled: false,
          },
          // Enable automatic return for 3D Secure if needed
          return_url: undefined, // Set this if 3DS is needed
        },
        {
          idempotencyKey: request.idempotencyKey,
        }
      );

      const status = mapStripeStatus(paymentIntent.status);
      const success = status === PaymentTransactionStatus.COMPLETED;

      const result: PaymentResult = {
        success,
        transactionId: paymentIntent.id,
        status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase(),
        rawResponse: {
          id: paymentIntent.id,
          object: paymentIntent.object,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
          client_secret: paymentIntent.client_secret,
        },
      };

      // Include error info if payment failed
      if (!success && paymentIntent.last_payment_error) {
        result.errorCode = paymentIntent.last_payment_error.code ?? undefined;
        result.errorMessage = paymentIntent.last_payment_error.message ?? undefined;
        result.declineCode = paymentIntent.last_payment_error.decline_code ?? undefined;
      }

      return result;
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        status: PaymentTransactionStatus.FAILED,
        amount: request.amount,
        currency: request.currency ?? 'USD',
        errorCode: stripeError.code ?? 'payment_error',
        errorMessage: stripeError.message ?? 'Payment processing failed',
        declineCode: (stripeError as unknown as Record<string, unknown>).decline_code as string | undefined,
      };
    }
  }

  async processRefund(request: RefundRequest): Promise<RefundResult> {
    this.ensureInitialized();
    const stripe = this.getStripe();

    try {
      // Map reason to Stripe refund reasons
      let stripeReason: Stripe.RefundCreateParams.Reason | undefined;
      if (request.reason) {
        const reasonLower = request.reason.toLowerCase();
        if (reasonLower.includes('duplicate')) {
          stripeReason = 'duplicate';
        } else if (reasonLower.includes('fraud')) {
          stripeReason = 'fraudulent';
        } else {
          stripeReason = 'requested_by_customer';
        }
      }

      const refund = await stripe.refunds.create({
        payment_intent: request.transactionId,
        amount: request.amount, // undefined for full refund
        reason: stripeReason,
      });

      const status = mapStripeRefundStatus(refund.status);

      return {
        success: status === PaymentTransactionStatus.REFUNDED,
        refundId: refund.id,
        status,
        amount: refund.amount,
        rawResponse: {
          id: refund.id,
          object: refund.object,
          amount: refund.amount,
          currency: refund.currency,
          status: refund.status,
          payment_intent: refund.payment_intent,
        },
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        status: PaymentTransactionStatus.FAILED,
        amount: request.amount ?? 0,
        errorCode: stripeError.code ?? 'refund_error',
        errorMessage: stripeError.message ?? 'Refund processing failed',
      };
    }
  }

  async getTransactionStatus(transactionId: string): Promise<PaymentResult> {
    this.ensureInitialized();
    const stripe = this.getStripe();

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(transactionId);

      const status = mapStripeStatus(paymentIntent.status);

      return {
        success: status === PaymentTransactionStatus.COMPLETED,
        transactionId: paymentIntent.id,
        status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase(),
        rawResponse: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
        },
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        status: PaymentTransactionStatus.FAILED,
        amount: 0,
        currency: 'USD',
        errorCode: stripeError.code ?? 'retrieval_error',
        errorMessage: stripeError.message ?? 'Failed to retrieve transaction',
      };
    }
  }

  async cancelPayment(
    transactionId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();
    const stripe = this.getStripe();

    try {
      await stripe.paymentIntents.cancel(transactionId);
      return { success: true };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        errorMessage: stripeError.message ?? 'Failed to cancel payment',
      };
    }
  }

  // ============================================
  // HSA/FSA Support
  // ============================================

  /**
   * Verify if a card is HSA/FSA eligible
   *
   * Note: Stripe doesn't directly provide HSA/FSA verification.
   * This would require integration with a BIN database service.
   * Healthcare merchants typically rely on the card network and
   * Inventory Information Approval System (IIAS).
   */
  async verifyHSAFSA(_cardToken: string): Promise<HSAFSAVerificationResult> {
    this.ensureInitialized();

    // Stripe doesn't provide direct HSA/FSA verification
    // You would need to use:
    // 1. A BIN lookup service (e.g., BINList, BIN Database)
    // 2. The card network's healthcare card identification
    // 3. IIAS (Inventory Information Approval System) for eligible items

    return {
      isEligible: false,
      cardType: 'STANDARD',
    };
  }

  // ============================================
  // Webhooks
  // ============================================

  async verifyWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<WebhookVerificationResult> {
    this.ensureInitialized();
    const stripe = this.getStripe();

    if (!this.config?.webhookSecret) {
      return {
        valid: false,
        errorMessage: 'Webhook secret not configured',
      };
    }

    try {
      const payloadString =
        typeof payload === 'string' ? payload : payload.toString();

      const event = stripe.webhooks.constructEvent(
        payloadString,
        signature,
        this.config.webhookSecret
      );

      // Map Stripe event type to our internal type
      const eventTypeMap: Record<string, WebhookEventType> = {
        'payment_intent.succeeded': 'payment.succeeded',
        'payment_intent.payment_failed': 'payment.failed',
        'charge.refunded': 'payment.refunded',
        'payment_method.attached': 'payment_method.attached',
        'payment_method.detached': 'payment_method.detached',
        'customer.created': 'customer.created',
        'customer.deleted': 'customer.deleted',
      };

      const mappedType = eventTypeMap[event.type] ?? ('payment.succeeded' as WebhookEventType);

      return {
        valid: true,
        event: {
          id: event.id,
          type: mappedType,
          data: event.data.object as unknown as Record<string, unknown>,
          createdAt: new Date(event.created * 1000),
        },
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        valid: false,
        errorMessage: stripeError.message ?? 'Webhook verification failed',
      };
    }
  }

  getSupportedWebhookEvents(): string[] {
    return [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'charge.refunded',
      'charge.dispute.created',
      'charge.dispute.closed',
      'payment_method.attached',
      'payment_method.detached',
      'payment_method.updated',
      'customer.created',
      'customer.deleted',
      'customer.updated',
    ];
  }
}
