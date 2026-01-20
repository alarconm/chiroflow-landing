/**
 * Form Field Validation Library
 *
 * Validates form field values against their configured rules.
 * Supports all field types defined in FormFieldType enum.
 */

import { FormFieldType } from '@prisma/client';

// ============================================
// TYPES
// ============================================

export interface FormFieldDefinition {
  id: string;
  fieldType: FormFieldType;
  label: string;
  name: string;
  isRequired: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | string | null; // Decimal in Prisma
  maxValue?: number | string | null;
  pattern?: string | null;
  patternMessage?: string | null;
  options?: Array<{ value: string; label: string }> | null;
  conditionalOn?: string | null;
  conditionalValue?: string | null;
  conditionalOp?: string | null;
}

export interface ValidationError {
  fieldId: string;
  fieldName: string;
  fieldLabel: string;
  message: string;
  code: ValidationErrorCode;
}

export type ValidationErrorCode =
  | 'REQUIRED'
  | 'MIN_LENGTH'
  | 'MAX_LENGTH'
  | 'MIN_VALUE'
  | 'MAX_VALUE'
  | 'PATTERN'
  | 'INVALID_EMAIL'
  | 'INVALID_PHONE'
  | 'INVALID_SSN'
  | 'INVALID_DATE'
  | 'DATE_OUT_OF_RANGE'
  | 'INVALID_TIME'
  | 'INVALID_OPTION'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'SIGNATURE_REQUIRED'
  | 'INVALID_FORMAT';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface FormValues {
  [fieldName: string]: unknown;
}

// ============================================
// VALIDATION PATTERNS
// ============================================

const PATTERNS = {
  // Email: RFC 5322 simplified
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // Phone: North American format with optional country code
  // Accepts: (555) 123-4567, 555-123-4567, 5551234567, +1-555-123-4567
  PHONE: /^(\+?1[-.\s]?)?(\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/,

  // SSN: XXX-XX-XXXX format (with or without dashes)
  SSN: /^(?!000|666|9\d{2})\d{3}[-]?(?!00)\d{2}[-]?(?!0000)\d{4}$/,

  // Date: YYYY-MM-DD format
  DATE: /^\d{4}-\d{2}-\d{2}$/,

  // Time: HH:MM format (24-hour)
  TIME: /^([01]\d|2[0-3]):([0-5]\d)$/,

  // DateTime: YYYY-MM-DDTHH:MM format
  DATETIME: /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):([0-5]\d)$/,
};

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate a single field value
 */
export function validateField(
  field: FormFieldDefinition,
  value: unknown,
  allValues: FormValues = {}
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check conditional visibility - skip validation if field should be hidden
  if (field.conditionalOn && !isFieldVisible(field, allValues)) {
    return errors;
  }

  const isEmpty = isEmptyValue(value);

  // Required validation
  if (field.isRequired && isEmpty) {
    errors.push(createError(field, 'REQUIRED', `${field.label} is required`));
    return errors; // Don't continue validation if required field is empty
  }

  // Skip further validation if value is empty (and not required)
  if (isEmpty) {
    return errors;
  }

  // Type-specific validation
  switch (field.fieldType) {
    case 'TEXT':
      errors.push(...validateText(field, value));
      break;

    case 'TEXTAREA':
      errors.push(...validateTextarea(field, value));
      break;

    case 'EMAIL':
      errors.push(...validateEmail(field, value));
      break;

    case 'PHONE':
      errors.push(...validatePhone(field, value));
      break;

    case 'SSN':
      errors.push(...validateSSN(field, value));
      break;

    case 'DATE':
      errors.push(...validateDate(field, value));
      break;

    case 'TIME':
      errors.push(...validateTime(field, value));
      break;

    case 'DATETIME':
      errors.push(...validateDateTime(field, value));
      break;

    case 'NUMBER':
    case 'CURRENCY':
      errors.push(...validateNumber(field, value));
      break;

    case 'SELECT':
    case 'RADIO':
      errors.push(...validateSelect(field, value));
      break;

    case 'CHECKBOX':
      errors.push(...validateCheckbox(field, value));
      break;

    case 'CHECKBOX_GROUP':
      errors.push(...validateCheckboxGroup(field, value));
      break;

    case 'SIGNATURE':
      errors.push(...validateSignature(field, value));
      break;

    case 'FILE':
      errors.push(...validateFile(field, value));
      break;

    // Display-only fields - no validation needed
    case 'HEADING':
    case 'PARAGRAPH':
    case 'DIVIDER':
      break;
  }

  return errors;
}

/**
 * Validate all fields in a form
 */
export function validateForm(
  fields: FormFieldDefinition[],
  values: FormValues
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of fields) {
    const value = values[field.name];
    const fieldErrors = validateField(field, value, values);
    errors.push(...fieldErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// TYPE-SPECIFIC VALIDATORS
// ============================================

function validateText(field: FormFieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const stringValue = String(value);

  // Min length
  if (field.minLength != null && stringValue.length < field.minLength) {
    errors.push(
      createError(
        field,
        'MIN_LENGTH',
        `${field.label} must be at least ${field.minLength} characters`
      )
    );
  }

  // Max length
  if (field.maxLength != null && stringValue.length > field.maxLength) {
    errors.push(
      createError(
        field,
        'MAX_LENGTH',
        `${field.label} must be no more than ${field.maxLength} characters`
      )
    );
  }

  // Pattern (regex)
  if (field.pattern) {
    try {
      const regex = new RegExp(field.pattern);
      if (!regex.test(stringValue)) {
        errors.push(
          createError(
            field,
            'PATTERN',
            field.patternMessage || `${field.label} format is invalid`
          )
        );
      }
    } catch (e) {
      // Invalid regex pattern - skip validation
      console.error(`Invalid regex pattern for field ${field.name}:`, field.pattern);
    }
  }

  return errors;
}

function validateTextarea(field: FormFieldDefinition, value: unknown): ValidationError[] {
  // Same as text validation
  return validateText(field, value);
}

function validateEmail(field: FormFieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const stringValue = String(value).trim();

  if (!PATTERNS.EMAIL.test(stringValue)) {
    errors.push(
      createError(field, 'INVALID_EMAIL', 'Please enter a valid email address')
    );
  }

  return errors;
}

function validatePhone(field: FormFieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const stringValue = String(value).replace(/\s/g, '');

  if (!PATTERNS.PHONE.test(stringValue)) {
    errors.push(
      createError(
        field,
        'INVALID_PHONE',
        'Please enter a valid phone number (e.g., (555) 123-4567)'
      )
    );
  }

  return errors;
}

function validateSSN(field: FormFieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const stringValue = String(value).replace(/\s/g, '');

  if (!PATTERNS.SSN.test(stringValue)) {
    errors.push(
      createError(
        field,
        'INVALID_SSN',
        'Please enter a valid Social Security Number'
      )
    );
  }

  return errors;
}

function validateDate(field: FormFieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const stringValue = String(value);

  if (!PATTERNS.DATE.test(stringValue)) {
    errors.push(
      createError(field, 'INVALID_DATE', 'Please enter a valid date (YYYY-MM-DD)')
    );
    return errors;
  }

  const date = new Date(stringValue);
  if (isNaN(date.getTime())) {
    errors.push(createError(field, 'INVALID_DATE', 'Please enter a valid date'));
    return errors;
  }

  // Min/max date validation
  if (field.minValue) {
    const minDate = new Date(String(field.minValue));
    if (date < minDate) {
      errors.push(
        createError(
          field,
          'DATE_OUT_OF_RANGE',
          `${field.label} must be on or after ${formatDate(minDate)}`
        )
      );
    }
  }

  if (field.maxValue) {
    const maxDate = new Date(String(field.maxValue));
    if (date > maxDate) {
      errors.push(
        createError(
          field,
          'DATE_OUT_OF_RANGE',
          `${field.label} must be on or before ${formatDate(maxDate)}`
        )
      );
    }
  }

  return errors;
}

function validateTime(field: FormFieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const stringValue = String(value);

  if (!PATTERNS.TIME.test(stringValue)) {
    errors.push(
      createError(field, 'INVALID_TIME', 'Please enter a valid time (HH:MM)')
    );
  }

  return errors;
}

function validateDateTime(
  field: FormFieldDefinition,
  value: unknown
): ValidationError[] {
  const errors: ValidationError[] = [];
  const stringValue = String(value);

  if (!PATTERNS.DATETIME.test(stringValue)) {
    errors.push(
      createError(
        field,
        'INVALID_FORMAT',
        'Please enter a valid date and time'
      )
    );
    return errors;
  }

  const date = new Date(stringValue);
  if (isNaN(date.getTime())) {
    errors.push(
      createError(field, 'INVALID_FORMAT', 'Please enter a valid date and time')
    );
  }

  return errors;
}

function validateNumber(field: FormFieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const numValue = Number(value);

  if (isNaN(numValue)) {
    errors.push(
      createError(field, 'INVALID_FORMAT', `${field.label} must be a valid number`)
    );
    return errors;
  }

  // Min value
  if (field.minValue != null) {
    const min = Number(field.minValue);
    if (numValue < min) {
      errors.push(
        createError(field, 'MIN_VALUE', `${field.label} must be at least ${min}`)
      );
    }
  }

  // Max value
  if (field.maxValue != null) {
    const max = Number(field.maxValue);
    if (numValue > max) {
      errors.push(
        createError(field, 'MAX_VALUE', `${field.label} must be no more than ${max}`)
      );
    }
  }

  return errors;
}

function validateSelect(field: FormFieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const stringValue = String(value);

  // Validate against options
  if (field.options && Array.isArray(field.options)) {
    const validValues = field.options.map((opt) => opt.value);
    if (!validValues.includes(stringValue)) {
      errors.push(
        createError(field, 'INVALID_OPTION', 'Please select a valid option')
      );
    }
  }

  return errors;
}

function validateCheckbox(
  field: FormFieldDefinition,
  value: unknown
): ValidationError[] {
  const errors: ValidationError[] = [];

  // For a single checkbox, just validate it's a boolean
  if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
    // Try to coerce to boolean
    const boolValue = Boolean(value);
    if (field.isRequired && !boolValue) {
      errors.push(
        createError(field, 'REQUIRED', `${field.label} must be checked`)
      );
    }
  }

  return errors;
}

function validateCheckboxGroup(
  field: FormFieldDefinition,
  value: unknown
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Checkbox group should be an array of selected values
  if (!Array.isArray(value)) {
    if (field.isRequired) {
      errors.push(
        createError(field, 'REQUIRED', `Please select at least one option`)
      );
    }
    return errors;
  }

  if (field.isRequired && value.length === 0) {
    errors.push(
      createError(field, 'REQUIRED', 'Please select at least one option')
    );
    return errors;
  }

  // Validate each selected value against options
  if (field.options && Array.isArray(field.options)) {
    const validValues = field.options.map((opt) => opt.value);
    for (const selected of value) {
      if (!validValues.includes(String(selected))) {
        errors.push(
          createError(field, 'INVALID_OPTION', `Invalid option: ${selected}`)
        );
      }
    }
  }

  return errors;
}

function validateSignature(
  field: FormFieldDefinition,
  value: unknown
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Signature should be a non-empty base64 string or data URL
  if (typeof value !== 'string' || value.trim() === '') {
    if (field.isRequired) {
      errors.push(
        createError(field, 'SIGNATURE_REQUIRED', 'Signature is required')
      );
    }
    return errors;
  }

  // Validate it looks like a data URL or base64
  const stringValue = String(value);
  if (
    !stringValue.startsWith('data:image/') &&
    !isBase64(stringValue)
  ) {
    errors.push(
      createError(field, 'INVALID_FORMAT', 'Invalid signature format')
    );
  }

  return errors;
}

function validateFile(field: FormFieldDefinition, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  // File value could be a file object or file metadata
  if (value === null || value === undefined) {
    if (field.isRequired) {
      errors.push(createError(field, 'REQUIRED', 'Please upload a file'));
    }
    return errors;
  }

  // Check if it's file metadata with type and size
  if (typeof value === 'object' && value !== null) {
    const file = value as { name?: string; type?: string; size?: number };

    // Validate file type if options specify allowed types
    if (field.options && Array.isArray(field.options) && file.type) {
      const allowedTypes = field.options.map((opt) => opt.value.toLowerCase());
      const fileExtension = file.name?.split('.').pop()?.toLowerCase();
      const mimeType = file.type.toLowerCase();

      const isAllowed = allowedTypes.some(
        (allowed) =>
          mimeType.includes(allowed) ||
          (fileExtension && allowed.includes(fileExtension))
      );

      if (!isAllowed) {
        errors.push(
          createError(
            field,
            'INVALID_FILE_TYPE',
            `File type not allowed. Accepted: ${allowedTypes.join(', ')}`
          )
        );
      }
    }

    // Validate file size (maxValue is in bytes)
    if (field.maxValue && file.size) {
      const maxSize = Number(field.maxValue);
      if (file.size > maxSize) {
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
        errors.push(
          createError(
            field,
            'FILE_TOO_LARGE',
            `File is too large. Maximum size: ${maxSizeMB} MB`
          )
        );
      }
    }
  }

  return errors;
}

// ============================================
// CONDITIONAL VISIBILITY
// ============================================

/**
 * Determine if a field should be visible based on conditional rules
 */
export function isFieldVisible(
  field: FormFieldDefinition,
  allValues: FormValues
): boolean {
  // No conditional - always visible
  if (!field.conditionalOn) {
    return true;
  }

  const conditionValue = allValues[field.conditionalOn];
  const targetValue = field.conditionalValue;
  const operator = field.conditionalOp || 'equals';

  switch (operator) {
    case 'equals':
      return String(conditionValue) === targetValue;

    case 'not_equals':
      return String(conditionValue) !== targetValue;

    case 'contains':
      return targetValue
        ? String(conditionValue).includes(targetValue)
        : false;

    case 'greater_than':
      return Number(conditionValue) > Number(targetValue);

    case 'less_than':
      return Number(conditionValue) < Number(targetValue);

    case 'is_empty':
      return isEmptyValue(conditionValue);

    case 'is_not_empty':
      return !isEmptyValue(conditionValue);

    default:
      return true;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function createError(
  field: FormFieldDefinition,
  code: ValidationErrorCode,
  message: string
): ValidationError {
  return {
    fieldId: field.id,
    fieldName: field.name,
    fieldLabel: field.label,
    code,
    message,
  };
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

function isBase64(str: string): boolean {
  try {
    // Check if string is valid base64
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    return base64Regex.test(str) && str.length % 4 === 0;
  } catch {
    return false;
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ============================================
// SSN MASKING
// ============================================

/**
 * Mask SSN to show only last 4 digits
 * Input: 123-45-6789 or 123456789
 * Output: ***-**-6789
 */
export function maskSSN(ssn: string): string {
  const digits = ssn.replace(/\D/g, '');
  if (digits.length !== 9) {
    return ssn; // Return as-is if not valid SSN
  }

  const lastFour = digits.slice(-4);
  return `***-**-${lastFour}`;
}

/**
 * Format phone number for display
 * Input: 5551234567
 * Output: (555) 123-4567
 */
export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone; // Return as-is if not standard format
}

/**
 * Parse currency input to number
 * Input: "$1,234.56" or "1234.56"
 * Output: 1234.56
 */
export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Format number as currency
 * Input: 1234.56
 * Output: "$1,234.56"
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}
