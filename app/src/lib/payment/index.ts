/**
 * Payment Processing Module
 * Epic 10: Payment Processing
 *
 * Central export for payment-related functionality.
 */

import type { PaymentProvider } from './provider';
import type { PaymentProviderConfig, PaymentPlanConfig, PaymentPlanSchedule } from './types';
import { MockPaymentProvider } from './mock-provider';
import { StripePaymentProvider } from './stripe-provider';
import { QuickBooksSyncService, getQuickBooksService } from './quickbooks';

// Re-export types
export * from './types';
export type { PaymentProvider } from './provider';
export { BasePaymentProvider } from './provider';
export { MockPaymentProvider } from './mock-provider';
export { StripePaymentProvider } from './stripe-provider';
export { QuickBooksSyncService, getQuickBooksService } from './quickbooks';

// Payment Plan Billing Scheduler (US-090)
export {
  processDueInstallments,
  getBillingConfig,
  updateBillingConfig,
  type BillingJobConfig,
  type BillingJobResult,
  type InstallmentProcessResult,
} from './plan-billing-scheduler';

// Credential encryption utilities
export {
  encryptPaymentCredential,
  decryptPaymentCredential,
  isEncryptedCredential,
  safeDecryptPaymentCredential,
  maskCredential,
  validateStripeKeyFormat,
  encryptProcessorCredentials,
  decryptProcessorCredentials,
  type EncryptedCredential,
  type PaymentProcessorCredentials,
} from './crypto';

/**
 * Available payment provider types
 */
export type PaymentProviderType = 'mock' | 'stripe';

/**
 * Create a payment provider instance
 */
export function createPaymentProvider(type: PaymentProviderType): PaymentProvider {
  switch (type) {
    case 'mock':
      return new MockPaymentProvider();
    case 'stripe':
      return new StripePaymentProvider();
    default:
      throw new Error(`Unknown payment provider type: ${type}`);
  }
}

/**
 * Singleton payment provider instance
 */
let paymentProviderInstance: PaymentProvider | null = null;
let providerInitialized = false;

/**
 * Get or create the payment provider
 *
 * @param forceProvider - Force a specific provider type (useful for testing)
 */
export async function getPaymentProvider(
  forceProvider?: PaymentProviderType
): Promise<PaymentProvider> {
  const providerType =
    forceProvider ??
    ((process.env.PAYMENT_PROVIDER as PaymentProviderType) || 'mock');

  // If we already have an initialized provider of the right type, return it
  if (
    paymentProviderInstance &&
    providerInitialized &&
    paymentProviderInstance.name ===
      (providerType === 'mock' ? 'MockPaymentProvider' : 'StripePaymentProvider')
  ) {
    return paymentProviderInstance;
  }

  // Create new provider
  paymentProviderInstance = createPaymentProvider(providerType);

  // Initialize with config
  const config: PaymentProviderConfig = {
    apiKey: process.env.PAYMENT_API_KEY,
    secretKey: process.env.PAYMENT_SECRET_KEY,
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
    environment:
      process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
    features: {
      supportsHSA: true,
      supportsFSA: true,
      supportsACH: false,
      supportsPartialRefunds: true,
    },
  };

  await paymentProviderInstance.initialize(config);
  providerInitialized = true;

  return paymentProviderInstance;
}

/**
 * Reset the payment provider (useful for testing)
 */
export function resetPaymentProvider(): void {
  paymentProviderInstance = null;
  providerInitialized = false;
}

// ============================================
// Payment Plan Utilities
// ============================================

/**
 * Calculate payment plan schedule
 */
export function calculatePaymentPlanSchedule(
  config: PaymentPlanConfig
): PaymentPlanSchedule {
  const {
    totalAmount,
    downPayment = 0,
    numberOfInstallments,
    frequency,
    startDate,
    interestRate = 0,
    setupFee = 0,
  } = config;

  // Calculate amount to finance
  const amountToFinance = totalAmount - downPayment + setupFee;

  // Calculate total with interest (simple interest for now)
  const interestAmount = amountToFinance * interestRate;
  const totalWithInterest = amountToFinance + interestAmount;

  // Calculate installment amount
  const installmentAmount = Math.ceil(totalWithInterest / numberOfInstallments);

  // Generate schedule
  const installments: PaymentPlanSchedule['installments'] = [];
  let currentDate = new Date(startDate);

  for (let i = 0; i < numberOfInstallments; i++) {
    // Calculate due date based on frequency
    if (i > 0) {
      switch (frequency) {
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + 7);
          break;
        case 'bi_weekly':
          currentDate.setDate(currentDate.getDate() + 14);
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
      }
    }

    // Last installment might be different to avoid rounding issues
    const isLastInstallment = i === numberOfInstallments - 1;
    const previousTotal = installments.reduce((sum, inst) => sum + inst.amount, 0);
    const amount = isLastInstallment
      ? totalWithInterest - previousTotal
      : installmentAmount;

    installments.push({
      number: i + 1,
      amount,
      dueDate: new Date(currentDate),
    });
  }

  return {
    installments,
    totalAmount,
    totalWithInterest,
  };
}

/**
 * Format currency amount for display
 */
export function formatCurrency(
  amountInCents: number,
  currency = 'USD'
): string {
  const amount = amountInCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Convert dollars to cents
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars
 */
export function toDollars(cents: number): number {
  return cents / 100;
}

// ============================================
// Card Utilities
// ============================================

/**
 * Mask a card number for display (show last 4)
 */
export function maskCardNumber(last4: string): string {
  return `**** **** **** ${last4}`;
}

/**
 * Get card brand display name
 */
export function getCardBrandDisplayName(brand: string): string {
  const brands: Record<string, string> = {
    VISA: 'Visa',
    MASTERCARD: 'Mastercard',
    AMEX: 'American Express',
    DISCOVER: 'Discover',
    OTHER: 'Card',
  };
  return brands[brand] ?? 'Card';
}

/**
 * Check if card is expired
 */
export function isCardExpired(expiryMonth: number, expiryYear: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (expiryYear < currentYear) return true;
  if (expiryYear === currentYear && expiryMonth < currentMonth) return true;
  return false;
}

/**
 * Format expiry date for display
 */
export function formatExpiryDate(month: number, year: number): string {
  const monthStr = month.toString().padStart(2, '0');
  const yearStr = year.toString().slice(-2);
  return `${monthStr}/${yearStr}`;
}

// ============================================
// Validation Utilities
// ============================================

/**
 * Basic Luhn algorithm check for card numbers
 */
export function isValidCardNumber(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');

  if (digits.length < 15 || digits.length > 16) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Validate expiry date
 */
export function isValidExpiryDate(month: number, year: number): boolean {
  if (month < 1 || month > 12) return false;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Year should be reasonable (within next 20 years)
  if (year < currentYear || year > currentYear + 20) return false;

  // If same year, month should be current or future
  if (year === currentYear && month < currentMonth) return false;

  return true;
}

/**
 * Validate CVC
 */
export function isValidCVC(cvc: string, cardBrand?: string): boolean {
  const digits = cvc.replace(/\D/g, '');

  // AMEX uses 4-digit CVC
  if (cardBrand === 'AMEX') {
    return digits.length === 4;
  }

  // Others use 3-digit
  return digits.length === 3;
}
