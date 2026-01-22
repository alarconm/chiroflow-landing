/**
 * Barcode Utilities
 * Epic 17: Inventory & POS
 *
 * Handles barcode validation, parsing, and generation.
 */

import type { BarcodeValidation, BarcodeResult } from './types';
import { getProductByBarcode } from './product-service';

// ============================================
// Barcode Validation
// ============================================

/**
 * Validate a barcode string and determine its type
 */
export function validateBarcode(barcode: string): BarcodeValidation {
  // Remove any whitespace
  const cleaned = barcode.trim().replace(/\s/g, '');

  if (!cleaned) {
    return { valid: false, error: 'Barcode cannot be empty' };
  }

  // Check for UPC-A (12 digits)
  if (/^\d{12}$/.test(cleaned)) {
    const isValid = validateUPCACheckDigit(cleaned);
    return {
      valid: isValid,
      type: 'UPC-A',
      formatted: cleaned,
      error: isValid ? undefined : 'Invalid UPC-A check digit',
    };
  }

  // Check for UPC-E (8 digits, starts with 0 or 1)
  if (/^[01]\d{7}$/.test(cleaned)) {
    const expanded = expandUPCE(cleaned);
    const isValid = validateUPCACheckDigit(expanded);
    return {
      valid: isValid,
      type: 'UPC-E',
      formatted: cleaned,
      error: isValid ? undefined : 'Invalid UPC-E check digit',
    };
  }

  // Check for EAN-13 (13 digits)
  if (/^\d{13}$/.test(cleaned)) {
    const isValid = validateEAN13CheckDigit(cleaned);
    return {
      valid: isValid,
      type: 'EAN-13',
      formatted: cleaned,
      error: isValid ? undefined : 'Invalid EAN-13 check digit',
    };
  }

  // Check for EAN-8 (8 digits)
  if (/^\d{8}$/.test(cleaned)) {
    const isValid = validateEAN8CheckDigit(cleaned);
    return {
      valid: isValid,
      type: 'EAN-8',
      formatted: cleaned,
      error: isValid ? undefined : 'Invalid EAN-8 check digit',
    };
  }

  // Check for CODE-128 (alphanumeric, variable length)
  if (/^[A-Za-z0-9\-\.\/\+%\$\s]+$/.test(cleaned) && cleaned.length >= 1 && cleaned.length <= 48) {
    return {
      valid: true,
      type: 'CODE-128',
      formatted: cleaned,
    };
  }

  // Unknown format but might still be a valid internal code
  if (cleaned.length >= 1 && cleaned.length <= 48) {
    return {
      valid: true,
      type: 'UNKNOWN',
      formatted: cleaned,
    };
  }

  return {
    valid: false,
    error: 'Invalid barcode format',
  };
}

/**
 * Validate UPC-A check digit (12 digits)
 */
function validateUPCACheckDigit(upc: string): boolean {
  if (upc.length !== 12) return false;

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(upc[i], 10);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(upc[11], 10);
}

/**
 * Calculate UPC-A check digit
 */
export function calculateUPCACheckDigit(upc11: string): string {
  if (upc11.length !== 11) {
    throw new Error('UPC-A requires 11 digits (without check digit)');
  }

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(upc11[i], 10);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return upc11 + checkDigit;
}

/**
 * Expand UPC-E to UPC-A
 */
function expandUPCE(upce: string): string {
  if (upce.length !== 8) return '';

  const numberSystem = upce[0];
  const manufacturer = upce.substring(1, 7);
  const check = upce[7];
  const lastDigit = manufacturer[5];

  let expanded = '';
  switch (lastDigit) {
    case '0':
    case '1':
    case '2':
      expanded = manufacturer.substring(0, 2) + lastDigit + '0000' + manufacturer.substring(2, 5);
      break;
    case '3':
      expanded = manufacturer.substring(0, 3) + '00000' + manufacturer.substring(3, 5);
      break;
    case '4':
      expanded = manufacturer.substring(0, 4) + '00000' + manufacturer[4];
      break;
    default:
      expanded = manufacturer.substring(0, 5) + '0000' + lastDigit;
  }

  return numberSystem + expanded + check;
}

/**
 * Validate EAN-13 check digit
 */
function validateEAN13CheckDigit(ean: string): boolean {
  if (ean.length !== 13) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(ean[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(ean[12], 10);
}

/**
 * Validate EAN-8 check digit
 */
function validateEAN8CheckDigit(ean: string): boolean {
  if (ean.length !== 8) return false;

  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const digit = parseInt(ean[i], 10);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(ean[7], 10);
}

// ============================================
// Barcode Lookup
// ============================================

/**
 * Look up a product by barcode
 */
export async function lookupBarcode(
  barcode: string,
  organizationId: string
): Promise<BarcodeResult> {
  // Validate barcode format first
  const validation = validateBarcode(barcode);
  if (!validation.valid) {
    return {
      found: false,
      message: validation.error,
    };
  }

  // Search for product
  const product = await getProductByBarcode(validation.formatted!, organizationId);

  if (!product) {
    return {
      found: false,
      message: 'Product not found',
    };
  }

  return {
    found: true,
    product,
  };
}

// ============================================
// Barcode Generation
// ============================================

/**
 * Generate an internal barcode/SKU
 * Format: ORG-YYYYMMDD-NNNN
 */
export function generateInternalBarcode(prefix: string, sequence: number): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seq = String(sequence).padStart(4, '0');

  return `${prefix}-${year}${month}${day}-${seq}`;
}

/**
 * Generate a UPC-A barcode from a manufacturer and product code
 */
export function generateUPCA(manufacturerCode: string, productCode: string): string {
  if (manufacturerCode.length + productCode.length !== 11) {
    throw new Error('Manufacturer code + product code must equal 11 digits');
  }

  const upc11 = manufacturerCode + productCode;
  return calculateUPCACheckDigit(upc11);
}

// ============================================
// Barcode Formatting
// ============================================

/**
 * Format barcode for display with dashes
 */
export function formatBarcodeForDisplay(barcode: string): string {
  const validation = validateBarcode(barcode);
  if (!validation.valid) return barcode;

  switch (validation.type) {
    case 'UPC-A':
      // Format: X-XXXXX-XXXXX-X
      return `${barcode[0]}-${barcode.slice(1, 6)}-${barcode.slice(6, 11)}-${barcode[11]}`;
    case 'EAN-13':
      // Format: X-XXXXXX-XXXXXX
      return `${barcode[0]}-${barcode.slice(1, 7)}-${barcode.slice(7)}`;
    case 'EAN-8':
      // Format: XXXX-XXXX
      return `${barcode.slice(0, 4)}-${barcode.slice(4)}`;
    default:
      return barcode;
  }
}

/**
 * Parse barcode input (handles common scanner output formats)
 */
export function parseBarcodeInput(input: string): string {
  // Remove common prefix/suffix from scanners
  let cleaned = input.trim();

  // Remove carriage return and line feed
  cleaned = cleaned.replace(/[\r\n]/g, '');

  // Remove leading/trailing brackets (some scanners add these)
  cleaned = cleaned.replace(/^\[|\]$/g, '');

  // Remove common scanner prefixes
  cleaned = cleaned.replace(/^(]C1|]d2|]E0|]e0)/i, '');

  return cleaned;
}
