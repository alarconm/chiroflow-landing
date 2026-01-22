/**
 * Stripe Payment Provider (Stub)
 * Epic 10: Payment Processing
 *
 * Production implementation for Stripe.
 * This is a stub - full implementation requires Stripe SDK.
 */

import { PaymentTransactionStatus } from '@prisma/client';
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
} from './types';

/**
 * Stripe Payment Provider
 *
 * IMPORTANT: This is a stub implementation.
 * For production use, you need to:
 * 1. Install Stripe SDK: npm install stripe
 * 2. Implement client-side card tokenization with Stripe.js
 * 3. Configure webhook endpoints
 * 4. Set up proper error handling
 *
 * See: https://stripe.com/docs
 */
export class StripePaymentProvider extends BasePaymentProvider {
  readonly name = 'StripePaymentProvider';
  readonly version = '1.0.0';

  // private stripe: Stripe | null = null; // Uncomment when implementing

  async initialize(config: PaymentProviderConfig): Promise<void> {
    await super.initialize(config);

    // TODO: Initialize Stripe SDK
    // const Stripe = require('stripe');
    // this.stripe = new Stripe(config.secretKey, { apiVersion: '2023-10-16' });

    console.log(`[${this.name}] Stripe provider initialized (STUB)`);
  }

  // ============================================
  // Card Tokenization
  // ============================================

  async tokenizeCard(request: TokenizeCardRequest): Promise<TokenizeCardResult> {
    this.ensureInitialized();

    // STUB: In production, cards should be tokenized client-side with Stripe.js
    // Server-side tokenization is only for specific use cases (e.g., card migration)

    // TODO: Implement with Stripe SDK
    // const paymentMethod = await this.stripe!.paymentMethods.create({
    //   type: 'card',
    //   card: {
    //     number: request.card.number,
    //     exp_month: request.card.expiryMonth,
    //     exp_year: request.card.expiryYear,
    //     cvc: request.card.cvc,
    //   },
    //   billing_details: {
    //     name: request.card.cardholderName,
    //     address: { postal_code: request.card.billingZip },
    //   },
    // });

    return {
      success: false,
      errorCode: 'not_implemented',
      errorMessage: 'Stripe tokenization not implemented. Use Stripe.js on the client side.',
    };
  }

  async deletePaymentMethod(
    paymentToken: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();

    // TODO: Implement with Stripe SDK
    // await this.stripe!.paymentMethods.detach(paymentToken);

    return {
      success: false,
      errorMessage: 'Stripe deletePaymentMethod not implemented',
    };
  }

  // ============================================
  // Customer Management
  // ============================================

  async createCustomer(request: CreateCustomerRequest): Promise<CustomerResult> {
    this.ensureInitialized();

    // TODO: Implement with Stripe SDK
    // const customer = await this.stripe!.customers.create({
    //   email: request.email,
    //   name: request.name,
    //   metadata: request.metadata,
    // });
    // return { success: true, customerId: customer.id };

    return {
      success: false,
      errorCode: 'not_implemented',
      errorMessage: 'Stripe createCustomer not implemented',
    };
  }

  async deleteCustomer(
    customerId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();

    // TODO: Implement with Stripe SDK
    // await this.stripe!.customers.del(customerId);

    return {
      success: false,
      errorMessage: 'Stripe deleteCustomer not implemented',
    };
  }

  async attachPaymentMethod(
    paymentToken: string,
    customerId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();

    // TODO: Implement with Stripe SDK
    // await this.stripe!.paymentMethods.attach(paymentToken, { customer: customerId });

    return {
      success: false,
      errorMessage: 'Stripe attachPaymentMethod not implemented',
    };
  }

  // ============================================
  // Payments
  // ============================================

  async processPayment(request: CreatePaymentRequest): Promise<PaymentResult> {
    this.ensureInitialized();

    // TODO: Implement with Stripe SDK
    // const paymentIntent = await this.stripe!.paymentIntents.create({
    //   amount: request.amount,
    //   currency: request.currency ?? 'usd',
    //   payment_method: request.paymentToken,
    //   confirm: true,
    //   description: request.description,
    //   metadata: request.metadata,
    // }, {
    //   idempotencyKey: request.idempotencyKey,
    // });
    //
    // return {
    //   success: paymentIntent.status === 'succeeded',
    //   transactionId: paymentIntent.id,
    //   status: mapStripeStatus(paymentIntent.status),
    //   amount: paymentIntent.amount,
    //   currency: paymentIntent.currency,
    //   rawResponse: paymentIntent,
    // };

    return {
      success: false,
      status: PaymentTransactionStatus.FAILED,
      amount: request.amount,
      currency: request.currency ?? 'USD',
      errorCode: 'not_implemented',
      errorMessage: 'Stripe processPayment not implemented',
    };
  }

  async processRefund(request: RefundRequest): Promise<RefundResult> {
    this.ensureInitialized();

    // TODO: Implement with Stripe SDK
    // const refund = await this.stripe!.refunds.create({
    //   payment_intent: request.transactionId,
    //   amount: request.amount, // undefined for full refund
    //   reason: request.reason as Stripe.RefundCreateParams.Reason,
    // });

    return {
      success: false,
      status: PaymentTransactionStatus.FAILED,
      amount: request.amount ?? 0,
      errorCode: 'not_implemented',
      errorMessage: 'Stripe processRefund not implemented',
    };
  }

  async getTransactionStatus(transactionId: string): Promise<PaymentResult> {
    this.ensureInitialized();

    // TODO: Implement with Stripe SDK
    // const paymentIntent = await this.stripe!.paymentIntents.retrieve(transactionId);

    return {
      success: false,
      status: PaymentTransactionStatus.FAILED,
      amount: 0,
      currency: 'USD',
      errorCode: 'not_implemented',
      errorMessage: 'Stripe getTransactionStatus not implemented',
    };
  }

  async cancelPayment(
    transactionId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();

    // TODO: Implement with Stripe SDK
    // const paymentIntent = await this.stripe!.paymentIntents.cancel(transactionId);

    return {
      success: false,
      errorMessage: 'Stripe cancelPayment not implemented',
    };
  }

  // ============================================
  // HSA/FSA Support
  // ============================================

  async verifyHSAFSA(cardToken: string): Promise<HSAFSAVerificationResult> {
    this.ensureInitialized();

    // Stripe doesn't directly verify HSA/FSA
    // You would need to use a BIN database or third-party service
    // The card type is typically determined during checkout

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

    // TODO: Implement with Stripe SDK
    // try {
    //   const event = this.stripe!.webhooks.constructEvent(
    //     payload,
    //     signature,
    //     this.config!.webhookSecret!
    //   );
    //   return {
    //     valid: true,
    //     event: {
    //       id: event.id,
    //       type: event.type as WebhookEventType,
    //       data: event.data.object,
    //       createdAt: new Date(event.created * 1000),
    //     },
    //   };
    // } catch (err) {
    //   return {
    //     valid: false,
    //     errorMessage: err.message,
    //   };
    // }

    return {
      valid: false,
      errorMessage: 'Stripe webhook verification not implemented',
    };
  }

  getSupportedWebhookEvents(): string[] {
    return [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'charge.refunded',
      'payment_method.attached',
      'payment_method.detached',
      'customer.created',
      'customer.deleted',
    ];
  }
}

// Helper function to map Stripe status to our enum
// function mapStripeStatus(stripeStatus: string): PaymentTransactionStatus {
//   switch (stripeStatus) {
//     case 'succeeded':
//       return PaymentTransactionStatus.COMPLETED;
//     case 'processing':
//       return PaymentTransactionStatus.PROCESSING;
//     case 'requires_payment_method':
//     case 'requires_confirmation':
//     case 'requires_action':
//       return PaymentTransactionStatus.PENDING;
//     case 'canceled':
//       return PaymentTransactionStatus.VOIDED;
//     default:
//       return PaymentTransactionStatus.FAILED;
//   }
// }
