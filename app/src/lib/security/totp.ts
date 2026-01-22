import crypto from 'crypto';

// TOTP configuration
const TOTP_STEP = 30; // 30 seconds
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // Allow 1 step before/after for clock drift

// Generate a random secret for TOTP
export function generateTOTPSecret(): string {
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

// Generate TOTP code
export function generateTOTP(secret: string, time?: number): string {
  let counter = Math.floor((time || Date.now() / 1000) / TOTP_STEP);
  const decodedSecret = base32Decode(secret);
  const buffer = Buffer.alloc(8);

  // Write counter as big-endian 64-bit integer
  for (let i = 7; i >= 0; i--) {
    buffer[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }

  const hmac = crypto.createHmac('sha1', decodedSecret);
  hmac.update(buffer);
  const hash = hmac.digest();

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const code = (
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  ) % Math.pow(10, TOTP_DIGITS);

  return code.toString().padStart(TOTP_DIGITS, '0');
}

// Verify TOTP code with window
export function verifyTOTP(secret: string, code: string, time?: number): boolean {
  const currentTime = time || Date.now() / 1000;

  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const testTime = currentTime + (i * TOTP_STEP);
    const expectedCode = generateTOTP(secret, testTime);
    if (timingSafeEqual(code, expectedCode)) {
      return true;
    }
  }

  return false;
}

// Generate backup codes
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

// Hash backup code for storage
export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

// Verify backup code
export function verifyBackupCode(code: string, hashedCodes: string[]): number {
  const hashedInput = hashBackupCode(code);
  return hashedCodes.findIndex(hc => timingSafeEqual(hc, hashedInput));
}

// Generate OTP for SMS/Email
export function generateOTP(): string {
  const code = crypto.randomInt(100000, 999999);
  return code.toString();
}

// Generate QR code URL for authenticator apps
export function generateTOTPUri(secret: string, email: string, issuer: string = 'ChiroFlow'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
}

// Base32 encoding/decoding utilities
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer {
  const cleanInput = input.replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleanInput.length; i++) {
    const index = BASE32_ALPHABET.indexOf(cleanInput[i]);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

// Timing-safe string comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do the comparison to prevent timing attacks
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Generate device fingerprint
export function generateDeviceFingerprint(userAgent: string, ipAddress: string): string {
  const data = `${userAgent}|${ipAddress}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

// Generate session token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Hash session token for storage
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
