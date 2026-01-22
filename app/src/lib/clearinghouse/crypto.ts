/**
 * Epic 08: Clearinghouse Integration - Credential Encryption Utilities
 *
 * Provides AES-256-GCM encryption/decryption for sensitive clearinghouse credentials.
 * Uses Node.js crypto module with secure key derivation.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;

/**
 * Get the encryption key from environment or generate a consistent one.
 * In production, this should always come from environment variables.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.CLEARINGHOUSE_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error(
      'No encryption key available. Set CLEARINGHOUSE_ENCRYPTION_KEY or NEXTAUTH_SECRET.'
    );
  }

  // Use a fixed salt for deterministic key derivation (stored key must be the same)
  const salt = 'chiroflow-clearinghouse-v1';
  return scryptSync(secret, salt, KEY_LENGTH);
}

/**
 * Encrypted data structure.
 */
export interface EncryptedData {
  /** Encrypted ciphertext (base64) */
  ciphertext: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Authentication tag (base64) */
  authTag: string;
  /** Version for future-proofing */
  version: number;
}

/**
 * Encrypt sensitive credential data.
 *
 * @param plaintext - The credential string to encrypt
 * @returns Encrypted data object
 */
export function encryptCredential(plaintext: string): EncryptedData {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty string');
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
 * Decrypt encrypted credential data.
 *
 * @param encryptedData - The encrypted data object
 * @returns Decrypted plaintext string
 */
export function decryptCredential(encryptedData: EncryptedData): string {
  if (!encryptedData || !encryptedData.ciphertext) {
    throw new Error('Invalid encrypted data');
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
 * Encrypt a credentials object (JSON serializable).
 *
 * @param credentials - Object containing credentials to encrypt
 * @returns Encrypted data object
 */
export function encryptCredentials<T extends object>(credentials: T): EncryptedData {
  const plaintext = JSON.stringify(credentials);
  return encryptCredential(plaintext);
}

/**
 * Decrypt a credentials object.
 *
 * @param encryptedData - The encrypted data object
 * @returns Decrypted credentials object
 */
export function decryptCredentials<T extends object>(encryptedData: EncryptedData): T {
  const plaintext = decryptCredential(encryptedData);
  return JSON.parse(plaintext) as T;
}

/**
 * Check if a string looks like encrypted data (for migration purposes).
 *
 * @param value - String to check
 * @returns True if the string appears to be encrypted JSON
 */
export function isEncrypted(value: unknown): value is EncryptedData {
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
 * Safely decrypt credentials, returning null if decryption fails.
 * Useful for handling potentially corrupted or invalid data.
 *
 * @param encryptedData - The encrypted data object
 * @returns Decrypted credentials or null on failure
 */
export function safeDecryptCredentials<T extends object>(encryptedData: unknown): T | null {
  if (!isEncrypted(encryptedData)) {
    // If it's a plain object, return it as-is (for backward compatibility)
    if (encryptedData && typeof encryptedData === 'object' && !Array.isArray(encryptedData)) {
      return encryptedData as T;
    }
    return null;
  }

  try {
    return decryptCredentials<T>(encryptedData);
  } catch (error) {
    console.error('Failed to decrypt credentials:', error);
    return null;
  }
}

/**
 * Rotate encryption by re-encrypting with new IV.
 * Useful for key rotation policies.
 *
 * @param encryptedData - Current encrypted data
 * @returns Newly encrypted data with fresh IV
 */
export function rotateEncryption(encryptedData: EncryptedData): EncryptedData {
  const plaintext = decryptCredential(encryptedData);
  return encryptCredential(plaintext);
}

/**
 * Mask a credential for display purposes.
 *
 * @param value - The credential value to mask
 * @param showChars - Number of characters to show at start and end
 * @returns Masked string (e.g., "abc...xyz")
 */
export function maskCredential(value: string, showChars = 3): string {
  if (!value) return '';
  if (value.length <= showChars * 2) {
    return '*'.repeat(value.length);
  }
  return `${value.substring(0, showChars)}...${value.substring(value.length - showChars)}`;
}
