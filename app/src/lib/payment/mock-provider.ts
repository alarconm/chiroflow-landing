/**
 * Mock Payment Provider
 * Epic 10: Payment Processing
 *
 * For development and testing. Simulates Stripe-like behavior.
 */

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
} from './types';

// Simulated delay for realistic behavior
const simulateDelay = (ms: number = 500) => new Promise((resolve) => setTimeout(resolve, ms));

// Generate mock IDs
const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Test card numbers for simulating different scenarios
const TEST_CARDS = {
  SUCCESS: '4242424242424242',
  DECLINE_GENERIC: '4000000000000002',
  DECLINE_INSUFFICIENT_FUNDS: '4000000000009995',
  DECLINE_LOST_CARD: '4000000000009987',
  DECLINE_STOLEN_CARD: '4000000000009979',
  DECLINE_EXPIRED_CARD: '4000000000000069',
  DECLINE_CVC_FAIL: '4000000000000127',
  DECLINE_PROCESSING_ERROR: '4000000000000119',
  HSA_CARD: '4000056655665556', // Simulated HSA
  FSA_CARD: '4000058260000005', // Simulated FSA
};

// Detect card brand from number
function detectCardBrand(cardNumber: string): CardBrand {
  const firstDigit = cardNumber.charAt(0);
  const firstTwo = cardNumber.substring(0, 2);

  if (cardNumber.startsWith('4')) return 'VISA';
  if (['51', '52', '53', '54', '55'].includes(firstTwo)) return 'MASTERCARD';
  if (['34', '37'].includes(firstTwo)) return 'AMEX';
  if (cardNumber.startsWith('6011') || cardNumber.startsWith('65')) return 'DISCOVER';
  return 'OTHER';
}

export class MockPaymentProvider extends BasePaymentProvider {
  readonly name = 'MockPaymentProvider';
  readonly version = '1.0.0';

  // In-memory storage for mock data
  private customers: Map<string, { id: string; email: string; name: string }> = new Map();
  private paymentMethods: Map<
    string,
    { token: string; customerId?: string; last4: string; brand: CardBrand }
  > = new Map();
  private transactions: Map<
    string,
    { id: string; amount: number; status: PaymentTransactionStatus; paymentToken: string }
  > = new Map();
  private refunds: Map<string, { id: string; transactionId: string; amount: number }> = new Map();

  async initialize(config: PaymentProviderConfig): Promise<void> {
    await super.initialize(config);
    console.log(`[${this.name}] Initialized in ${config.environment} mode`);
  }

  // ============================================
  // Card Tokenization
  // ============================================

  async tokenizeCard(request: TokenizeCardRequest): Promise<TokenizeCardResult> {
    this.ensureInitialized();
    await simulateDelay(300);

    const { card, customerId } = request;

    // Validate card number (basic Luhn check simulation)
    const cleanNumber = card.number.replace(/\s/g, '');
    if (cleanNumber.length < 15 || cleanNumber.length > 16) {
      return {
        success: false,
        errorCode: 'invalid_card_number',
        errorMessage: 'Card number is invalid',
      };
    }

    // Check for test decline cards
    if (cleanNumber === TEST_CARDS.DECLINE_EXPIRED_CARD) {
      return {
        success: false,
        errorCode: 'expired_card',
        errorMessage: 'The card has expired',
      };
    }

    const token = generateId('pm');
    const last4 = cleanNumber.slice(-4);
    const brand = detectCardBrand(cleanNumber);

    // Determine card type (simulate HSA/FSA detection)
    let cardType: CardType = 'CREDIT';
    if (cleanNumber === TEST_CARDS.HSA_CARD) {
      cardType = 'HSA';
    } else if (cleanNumber === TEST_CARDS.FSA_CARD) {
      cardType = 'FSA';
    } else if (cleanNumber.startsWith('4000') && cleanNumber.endsWith('1')) {
      cardType = 'DEBIT';
    }

    // Store the payment method
    this.paymentMethods.set(token, {
      token,
      customerId,
      last4,
      brand,
    });

    return {
      success: true,
      token: {
        paymentToken: token,
        last4,
        cardBrand: brand,
        cardType,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cardholderName: card.cardholderName,
        billingZip: card.billingZip,
      },
    };
  }

  async deletePaymentMethod(
    paymentToken: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();
    await simulateDelay(200);

    if (!this.paymentMethods.has(paymentToken)) {
      return {
        success: false,
        errorMessage: 'Payment method not found',
      };
    }

    this.paymentMethods.delete(paymentToken);
    return { success: true };
  }

  // ============================================
  // Customer Management
  // ============================================

  async createCustomer(request: CreateCustomerRequest): Promise<CustomerResult> {
    this.ensureInitialized();
    await simulateDelay(300);

    const customerId = generateId('cus');
    this.customers.set(customerId, {
      id: customerId,
      email: request.email,
      name: request.name,
    });

    return {
      success: true,
      customerId,
    };
  }

  async deleteCustomer(
    customerId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();
    await simulateDelay(200);

    if (!this.customers.has(customerId)) {
      return {
        success: false,
        errorMessage: 'Customer not found',
      };
    }

    this.customers.delete(customerId);
    return { success: true };
  }

  async attachPaymentMethod(
    paymentToken: string,
    customerId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();
    await simulateDelay(200);

    const method = this.paymentMethods.get(paymentToken);
    if (!method) {
      return {
        success: false,
        errorMessage: 'Payment method not found',
      };
    }

    if (!this.customers.has(customerId)) {
      return {
        success: false,
        errorMessage: 'Customer not found',
      };
    }

    method.customerId = customerId;
    return { success: true };
  }

  // ============================================
  // Payments
  // ============================================

  async processPayment(request: CreatePaymentRequest): Promise<PaymentResult> {
    this.ensureInitialized();
    await simulateDelay(800); // Simulate network latency

    const { amount, currency = 'USD', paymentToken, description, idempotencyKey } = request;

    // Check if payment method exists
    const method = this.paymentMethods.get(paymentToken);
    if (!method) {
      return {
        success: false,
        status: PaymentTransactionStatus.FAILED,
        amount,
        currency,
        errorCode: 'invalid_payment_method',
        errorMessage: 'Payment method not found or invalid',
      };
    }

    // Simulate various decline scenarios based on the card number's last4
    // In production, this would come from the processor
    const transactionId = generateId('ch');

    // Simulate decline scenarios
    const declineScenarios: Record<string, { code: string; message: string; decline?: string }> = {
      '0002': { code: 'card_declined', message: 'Your card was declined', decline: 'generic_decline' },
      '9995': { code: 'card_declined', message: 'Your card has insufficient funds', decline: 'insufficient_funds' },
      '9987': { code: 'card_declined', message: 'Your card was reported lost', decline: 'lost_card' },
      '9979': { code: 'card_declined', message: 'Your card was reported stolen', decline: 'stolen_card' },
      '0127': { code: 'incorrect_cvc', message: 'Your card\'s security code is incorrect', decline: 'cvc_check_fail' },
      '0119': { code: 'processing_error', message: 'An error occurred while processing your card', decline: 'processing_error' },
    };

    const declineInfo = declineScenarios[method.last4];
    if (declineInfo) {
      const result: PaymentResult = {
        success: false,
        transactionId,
        status: PaymentTransactionStatus.FAILED,
        amount,
        currency,
        errorCode: declineInfo.code,
        errorMessage: declineInfo.message,
        declineCode: declineInfo.decline,
        rawResponse: {
          id: transactionId,
          object: 'charge',
          amount,
          currency,
          status: 'failed',
          failure_code: declineInfo.code,
          failure_message: declineInfo.message,
        },
      };

      this.transactions.set(transactionId, {
        id: transactionId,
        amount,
        status: PaymentTransactionStatus.FAILED,
        paymentToken,
      });

      return result;
    }

    // Successful payment
    this.transactions.set(transactionId, {
      id: transactionId,
      amount,
      status: PaymentTransactionStatus.COMPLETED,
      paymentToken,
    });

    return {
      success: true,
      transactionId,
      status: PaymentTransactionStatus.COMPLETED,
      amount,
      currency,
      rawResponse: {
        id: transactionId,
        object: 'charge',
        amount,
        currency,
        status: 'succeeded',
        description,
        metadata: request.metadata,
        receipt_url: `https://mock-receipts.example.com/${transactionId}`,
      },
    };
  }

  async processRefund(request: RefundRequest): Promise<RefundResult> {
    this.ensureInitialized();
    await simulateDelay(600);

    const { transactionId, amount, reason } = request;

    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return {
        success: false,
        status: PaymentTransactionStatus.FAILED,
        amount: amount ?? 0,
        errorCode: 'charge_not_found',
        errorMessage: 'Original transaction not found',
      };
    }

    if (transaction.status === PaymentTransactionStatus.REFUNDED) {
      return {
        success: false,
        status: PaymentTransactionStatus.FAILED,
        amount: amount ?? 0,
        errorCode: 'charge_already_refunded',
        errorMessage: 'This charge has already been fully refunded',
      };
    }

    const refundAmount = amount ?? transaction.amount;
    if (refundAmount > transaction.amount) {
      return {
        success: false,
        status: PaymentTransactionStatus.FAILED,
        amount: refundAmount,
        errorCode: 'refund_exceeds_charge',
        errorMessage: 'Refund amount exceeds original charge',
      };
    }

    const refundId = generateId('re');

    // Update transaction status
    transaction.status =
      refundAmount === transaction.amount
        ? PaymentTransactionStatus.REFUNDED
        : PaymentTransactionStatus.PARTIALLY_REFUNDED;

    this.refunds.set(refundId, {
      id: refundId,
      transactionId,
      amount: refundAmount,
    });

    return {
      success: true,
      refundId,
      status: PaymentTransactionStatus.REFUNDED,
      amount: refundAmount,
      rawResponse: {
        id: refundId,
        object: 'refund',
        amount: refundAmount,
        charge: transactionId,
        reason: reason ?? 'requested_by_customer',
        status: 'succeeded',
      },
    };
  }

  async getTransactionStatus(transactionId: string): Promise<PaymentResult> {
    this.ensureInitialized();
    await simulateDelay(200);

    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return {
        success: false,
        status: PaymentTransactionStatus.FAILED,
        amount: 0,
        currency: 'USD',
        errorCode: 'transaction_not_found',
        errorMessage: 'Transaction not found',
      };
    }

    return {
      success: transaction.status === PaymentTransactionStatus.COMPLETED,
      transactionId: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      currency: 'USD',
    };
  }

  async cancelPayment(
    transactionId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();
    await simulateDelay(300);

    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return {
        success: false,
        errorMessage: 'Transaction not found',
      };
    }

    if (transaction.status !== PaymentTransactionStatus.PENDING) {
      return {
        success: false,
        errorMessage: 'Only pending transactions can be cancelled',
      };
    }

    transaction.status = PaymentTransactionStatus.VOIDED;
    return { success: true };
  }

  // ============================================
  // HSA/FSA Support
  // ============================================

  async verifyHSAFSA(cardToken: string): Promise<HSAFSAVerificationResult> {
    this.ensureInitialized();
    await simulateDelay(400);

    const method = this.paymentMethods.get(cardToken);
    if (!method) {
      return {
        isEligible: false,
        cardType: 'STANDARD',
      };
    }

    // Simulate HSA/FSA detection based on last4
    // In production, this would come from the processor or BIN lookup
    if (method.last4 === '5556') {
      return {
        isEligible: true,
        cardType: 'HSA',
        requiresIIAS: true,
        merchantCategoryCode: '8099', // Medical services
      };
    }

    if (method.last4 === '0005') {
      return {
        isEligible: true,
        cardType: 'FSA',
        requiresIIAS: true,
        merchantCategoryCode: '8099',
      };
    }

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

    // In mock provider, we accept any webhook with a valid-looking signature
    if (!signature || signature.length < 10) {
      return {
        valid: false,
        errorMessage: 'Invalid webhook signature',
      };
    }

    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());
      return {
        valid: true,
        event: {
          id: data.id ?? generateId('evt'),
          type: data.type ?? 'unknown',
          data: data.data ?? {},
          createdAt: new Date(data.created ?? Date.now()),
        },
      };
    } catch {
      return {
        valid: false,
        errorMessage: 'Failed to parse webhook payload',
      };
    }
  }

  getSupportedWebhookEvents(): string[] {
    return [
      'payment.succeeded',
      'payment.failed',
      'payment.refunded',
      'payment_method.attached',
      'payment_method.detached',
      'customer.created',
      'customer.deleted',
    ];
  }
}
