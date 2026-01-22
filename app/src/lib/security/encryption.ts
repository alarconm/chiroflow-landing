import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

// Key identifier prefix for encrypted data
const ENCRYPTED_PREFIX = 'enc:v1:';

// Encryption key purposes
export type EncryptionKeyPurpose =
  | 'PHI_ENCRYPTION'
  | 'SSN_ENCRYPTION'
  | 'PAYMENT_CREDENTIAL_ENCRYPTION'
  | 'API_KEY_ENCRYPTION'
  | 'SECRET_ENCRYPTION';

// Encrypted field format: enc:v1:keyId:iv:authTag:ciphertext
interface EncryptedData {
  version: string;
  keyId: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

// Key derivation from master key
export function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    masterKey,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

// Generate a new encryption key
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}

// Generate a unique key identifier
export function generateKeyIdentifier(purpose: EncryptionKeyPurpose): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${purpose.toLowerCase()}_${timestamp}_${random}`;
}

/**
 * Encrypt a plaintext value using AES-256-GCM
 * @param plaintext The value to encrypt
 * @param encryptionKey The base64-encoded encryption key
 * @param keyId The key identifier for tracking
 * @returns Encrypted string in format: enc:v1:keyId:iv:authTag:ciphertext
 */
export function encrypt(
  plaintext: string,
  encryptionKey: string,
  keyId: string
): string {
  if (!plaintext) {
    return plaintext;
  }

  // Decode the key
  const key = Buffer.from(encryptionKey, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error('Invalid encryption key length');
  }

  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // Encrypt
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Format: enc:v1:keyId:iv:authTag:ciphertext
  return `${ENCRYPTED_PREFIX}${keyId}:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
}

/**
 * Decrypt an encrypted value
 * @param encryptedValue The encrypted string
 * @param encryptionKey The base64-encoded encryption key
 * @returns Decrypted plaintext
 */
export function decrypt(
  encryptedValue: string,
  encryptionKey: string
): string {
  if (!encryptedValue) {
    return encryptedValue;
  }

  // Check if it's actually encrypted
  if (!encryptedValue.startsWith(ENCRYPTED_PREFIX)) {
    // Return as-is if not encrypted (backward compatibility)
    return encryptedValue;
  }

  // Parse encrypted data
  const parts = encryptedValue.slice(ENCRYPTED_PREFIX.length).split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }

  const [_keyId, ivBase64, authTagBase64, ciphertext] = parts;

  // Decode components
  const key = Buffer.from(encryptionKey, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  if (key.length !== KEY_LENGTH) {
    throw new Error('Invalid encryption key length');
  }

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  // Decrypt
  let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Check if a value is encrypted
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Extract the key ID from an encrypted value
 */
export function extractKeyId(encryptedValue: string): string | null {
  if (!isEncrypted(encryptedValue)) {
    return null;
  }

  const parts = encryptedValue.slice(ENCRYPTED_PREFIX.length).split(':');
  return parts[0] || null;
}

/**
 * Parse encrypted data into components
 */
export function parseEncryptedData(encryptedValue: string): EncryptedData | null {
  if (!isEncrypted(encryptedValue)) {
    return null;
  }

  const parts = encryptedValue.slice(ENCRYPTED_PREFIX.length).split(':');
  if (parts.length !== 4) {
    return null;
  }

  return {
    version: 'v1',
    keyId: parts[0],
    iv: parts[1],
    authTag: parts[2],
    ciphertext: parts[3],
  };
}

/**
 * Re-encrypt data with a new key (for key rotation)
 * @param encryptedValue Current encrypted value
 * @param oldKey The current encryption key
 * @param newKey The new encryption key
 * @param newKeyId The new key identifier
 * @returns Re-encrypted value with new key
 */
export function reencrypt(
  encryptedValue: string,
  oldKey: string,
  newKey: string,
  newKeyId: string
): string {
  const plaintext = decrypt(encryptedValue, oldKey);
  return encrypt(plaintext, newKey, newKeyId);
}

/**
 * Encrypt sensitive fields in an object
 * @param data Object with fields to encrypt
 * @param fieldsToEncrypt Array of field names to encrypt
 * @param encryptionKey The encryption key
 * @param keyId The key identifier
 * @returns Object with specified fields encrypted
 */
export function encryptFields<T extends Record<string, unknown>>(
  data: T,
  fieldsToEncrypt: (keyof T)[],
  encryptionKey: string,
  keyId: string
): T {
  const result = { ...data };

  for (const field of fieldsToEncrypt) {
    const value = result[field];
    if (typeof value === 'string' && value && !isEncrypted(value)) {
      (result as Record<string, unknown>)[field as string] = encrypt(value, encryptionKey, keyId);
    }
  }

  return result;
}

/**
 * Decrypt sensitive fields in an object
 * @param data Object with encrypted fields
 * @param fieldsToDecrypt Array of field names to decrypt
 * @param encryptionKey The encryption key
 * @returns Object with specified fields decrypted
 */
export function decryptFields<T extends Record<string, unknown>>(
  data: T,
  fieldsToDecrypt: (keyof T)[],
  encryptionKey: string
): T {
  const result = { ...data };

  for (const field of fieldsToDecrypt) {
    const value = result[field];
    if (typeof value === 'string' && isEncrypted(value)) {
      (result as Record<string, unknown>)[field as string] = decrypt(value, encryptionKey);
    }
  }

  return result;
}

/**
 * Hash a value for display (e.g., showing last 4 of SSN)
 */
export function hashForDisplay(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').substring(0, 16);
}

/**
 * Mask a value for display (show last N characters)
 */
export function maskForDisplay(
  value: string,
  showLast: number = 4,
  maskChar: string = '*'
): string {
  if (!value || value.length <= showLast) {
    return value;
  }

  const masked = maskChar.repeat(value.length - showLast);
  const visible = value.slice(-showLast);
  return masked + visible;
}

/**
 * Extract last N characters from a value before encryption
 * Useful for storing SSN last 4 separately for display
 */
export function extractLastN(value: string, n: number = 4): string {
  if (!value || value.length < n) {
    return value;
  }
  return value.slice(-n);
}

// ============================================
// Key Management Functions
// ============================================

/**
 * Validate an encryption key
 */
export function validateEncryptionKey(key: string): boolean {
  try {
    const buffer = Buffer.from(key, 'base64');
    return buffer.length === KEY_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Generate a wrapped (encrypted) key for storage
 * Uses a master key to encrypt the data encryption key
 */
export function wrapKey(
  dataEncryptionKey: string,
  masterKey: string,
  keyId: string
): string {
  return encrypt(dataEncryptionKey, masterKey, keyId);
}

/**
 * Unwrap (decrypt) a wrapped key
 */
export function unwrapKey(wrappedKey: string, masterKey: string): string {
  return decrypt(wrappedKey, masterKey);
}

/**
 * Calculate key fingerprint for verification
 */
export function keyFingerprint(key: string): string {
  return crypto
    .createHash('sha256')
    .update(key)
    .digest('hex')
    .substring(0, 16);
}

// ============================================
// Secure Comparison
// ============================================

/**
 * Timing-safe comparison for encrypted values
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still perform comparison to prevent timing attacks
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ============================================
// PHI-Specific Encryption Helpers
// ============================================

/**
 * Encrypt SSN and return both encrypted value and last 4 for display
 */
export function encryptSSN(
  ssn: string,
  encryptionKey: string,
  keyId: string
): { encrypted: string; last4: string } {
  // Remove any formatting (dashes, spaces)
  const cleanSSN = ssn.replace(/[\s-]/g, '');

  return {
    encrypted: encrypt(cleanSSN, encryptionKey, keyId),
    last4: extractLastN(cleanSSN, 4),
  };
}

/**
 * Encrypt payment credentials
 */
export function encryptPaymentCredential(
  credential: string,
  encryptionKey: string,
  keyId: string
): string {
  return encrypt(credential, encryptionKey, keyId);
}

/**
 * Encrypt API key or secret
 */
export function encryptApiSecret(
  secret: string,
  encryptionKey: string,
  keyId: string
): string {
  return encrypt(secret, encryptionKey, keyId);
}

// ============================================
// Batch Operations
// ============================================

/**
 * Batch encrypt multiple values
 */
export function batchEncrypt(
  values: string[],
  encryptionKey: string,
  keyId: string
): string[] {
  return values.map((v) => (v ? encrypt(v, encryptionKey, keyId) : v));
}

/**
 * Batch decrypt multiple values
 */
export function batchDecrypt(values: string[], encryptionKey: string): string[] {
  return values.map((v) => (v && isEncrypted(v) ? decrypt(v, encryptionKey) : v));
}

/**
 * Batch re-encrypt for key rotation
 */
export function batchReencrypt(
  values: string[],
  oldKey: string,
  newKey: string,
  newKeyId: string
): string[] {
  return values.map((v) =>
    v && isEncrypted(v) ? reencrypt(v, oldKey, newKey, newKeyId) : v
  );
}
