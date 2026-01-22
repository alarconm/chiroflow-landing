/**
 * Payment Credential Encryption Utilities
 * Epic 10: Payment Processing - US-086
 *
 * Provides AES-256-GCM encryption/decryption for sensitive payment credentials.
 * Uses Node.js crypto module with secure key derivation.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the encryption key from environment or derive from secret.
 * In production, this should always come from environment variables.
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.PAYMENT_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error(
      'No encryption key available. Set PAYMENT_ENCRYPTION_KEY or NEXTAUTH_SECRET environment variable.'
    );
  }

  // Use a fixed salt for deterministic key derivation
  const salt = 'chiroflow-payment-v1';
  return scryptSync(secret, salt, KEY_LENGTH);
}

/**
 * Encrypted data structure stored in database
 */
export interface EncryptedCredential {
  /** Encrypted ciphertext (base64) */
  ciphertext: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Authentication tag (base64) */
  authTag: string;
  /** Version for future-proofing migrations */
  version: number;
}

/**
 * Encrypt a sensitive credential (API key, secret key, etc.)
 *
 * @param plaintext - The credential string to encrypt
 * @returns Encrypted credential object to store in database
 */
export function encryptPaymentCredential(plaintext: string): EncryptedCredential {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty credential');
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    version: 1,
  };
}

/**
 * Decrypt an encrypted credential
 *
 * @param encryptedData - The encrypted credential object from database
 * @returns Decrypted plaintext string
 */
export function decryptPaymentCredential(encryptedData: EncryptedCredential): string {
  if (!encryptedData || !encryptedData.ciphertext) {
    throw new Error('Invalid encrypted credential data');
  }

  // Version check for future compatibility
  if (encryptedData.version !== 1) {
    throw new Error(`Unsupported encryption version: ${encryptedData.version}`);
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(encryptedData.ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Check if a value looks like encrypted credential data
 *
 * @param value - Value to check (from JSON field in database)
 * @returns True if the value appears to be an encrypted credential
 */
export function isEncryptedCredential(value: unknown): value is EncryptedCredential {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.ciphertext === 'string' &&
    typeof obj.iv === 'string' &&
    typeof obj.authTag === 'string' &&
    typeof obj.version === 'number'
  );
}

/**
 * Safely decrypt a credential, returning null on failure.
 * Useful for handling potentially corrupted or invalid data.
 *
 * @param encryptedData - The encrypted credential object
 * @returns Decrypted string or null on failure
 */
export function safeDecryptPaymentCredential(encryptedData: unknown): string | null {
  if (!isEncryptedCredential(encryptedData)) {
    // If it's a plain string, might be legacy unencrypted data
    if (typeof encryptedData === 'string') {
      console.warn('Found unencrypted credential - should be migrated');
      return encryptedData;
    }
    return null;
  }

  try {
    return decryptPaymentCredential(encryptedData);
  } catch (error) {
    console.error('Failed to decrypt payment credential:', error);
    return null;
  }
}

/**
 * Mask a credential for display purposes
 *
 * @param value - The credential value to mask
 * @param showChars - Number of characters to show at start and end
 * @returns Masked string (e.g., "sk_...xyz")
 */
export function maskCredential(value: string, showChars = 4): string {
  if (!value) return '';
  if (value.length <= showChars * 2) {
    return '*'.repeat(value.length);
  }
  return `${value.substring(0, showChars)}...${value.substring(value.length - showChars)}`;
}

/**
 * Validate that an API key has the expected format
 * Stripe keys start with sk_, pk_, rk_, etc.
 */
export function validateStripeKeyFormat(key: string, type: 'secret' | 'publishable' | 'webhook'): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  switch (type) {
    case 'secret':
      // Secret keys start with sk_live_ or sk_test_
      return /^sk_(live|test)_[a-zA-Z0-9]+$/.test(key);
    case 'publishable':
      // Publishable keys start with pk_live_ or pk_test_
      return /^pk_(live|test)_[a-zA-Z0-9]+$/.test(key);
    case 'webhook':
      // Webhook secrets start with whsec_
      return /^whsec_[a-zA-Z0-9]+$/.test(key);
    default:
      return false;
  }
}

/**
 * Encrypt payment processor credentials for database storage
 */
export interface PaymentProcessorCredentials {
  apiKey?: string;
  secretKey?: string;
  webhookSecret?: string;
}

/**
 * Encrypt all credentials for a payment processor
 */
export function encryptProcessorCredentials(
  credentials: PaymentProcessorCredentials
): {
  apiKeyEncrypted: string | null;
  secretKeyEncrypted: string | null;
  webhookSecretEncrypted: string | null;
} {
  return {
    apiKeyEncrypted: credentials.apiKey
      ? JSON.stringify(encryptPaymentCredential(credentials.apiKey))
      : null,
    secretKeyEncrypted: credentials.secretKey
      ? JSON.stringify(encryptPaymentCredential(credentials.secretKey))
      : null,
    webhookSecretEncrypted: credentials.webhookSecret
      ? JSON.stringify(encryptPaymentCredential(credentials.webhookSecret))
      : null,
  };
}

/**
 * Decrypt all credentials for a payment processor
 */
export function decryptProcessorCredentials(encryptedData: {
  apiKeyEncrypted?: string | null;
  secretKeyEncrypted?: string | null;
  webhookSecretEncrypted?: string | null;
}): PaymentProcessorCredentials {
  const result: PaymentProcessorCredentials = {};

  if (encryptedData.apiKeyEncrypted) {
    try {
      const parsed = JSON.parse(encryptedData.apiKeyEncrypted);
      result.apiKey = safeDecryptPaymentCredential(parsed) ?? undefined;
    } catch {
      // If JSON parse fails, might be legacy unencrypted data
      result.apiKey = encryptedData.apiKeyEncrypted;
    }
  }

  if (encryptedData.secretKeyEncrypted) {
    try {
      const parsed = JSON.parse(encryptedData.secretKeyEncrypted);
      result.secretKey = safeDecryptPaymentCredential(parsed) ?? undefined;
    } catch {
      result.secretKey = encryptedData.secretKeyEncrypted;
    }
  }

  if (encryptedData.webhookSecretEncrypted) {
    try {
      const parsed = JSON.parse(encryptedData.webhookSecretEncrypted);
      result.webhookSecret = safeDecryptPaymentCredential(parsed) ?? undefined;
    } catch {
      result.webhookSecret = encryptedData.webhookSecretEncrypted;
    }
  }

  return result;
}
