// Base application error class
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    options: {
      code?: string;
      statusCode?: number;
      details?: Record<string, unknown>;
      isOperational?: boolean;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.code = options.code ?? 'APP_ERROR';
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// Authentication errors
export class AuthError extends AppError {
  constructor(
    message: string,
    options: { code?: string; details?: Record<string, unknown> } = {}
  ) {
    super(message, {
      code: options.code ?? 'AUTH_ERROR',
      statusCode: 401,
      details: options.details,
    });
    this.name = 'AuthError';
  }
}

// Validation errors
export class ValidationError extends AppError {
  public readonly fieldErrors: Record<string, string[]>;

  constructor(
    message: string,
    options: {
      code?: string;
      fieldErrors?: Record<string, string[]>;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message, {
      code: options.code ?? 'VALIDATION_ERROR',
      statusCode: 400,
      details: {
        ...options.details,
        fieldErrors: options.fieldErrors,
      },
    });
    this.name = 'ValidationError';
    this.fieldErrors = options.fieldErrors ?? {};
  }
}

// Not found errors
export class NotFoundError extends AppError {
  constructor(
    resource: string,
    options: { code?: string; details?: Record<string, unknown> } = {}
  ) {
    super(`${resource} not found`, {
      code: options.code ?? 'NOT_FOUND',
      statusCode: 404,
      details: {
        resource,
        ...options.details,
      },
    });
    this.name = 'NotFoundError';
  }
}

// Forbidden errors (authorization)
export class ForbiddenError extends AppError {
  constructor(
    message = 'You do not have permission to perform this action',
    options: { code?: string; details?: Record<string, unknown> } = {}
  ) {
    super(message, {
      code: options.code ?? 'FORBIDDEN',
      statusCode: 403,
      details: options.details,
    });
    this.name = 'ForbiddenError';
  }
}

// Conflict errors (e.g., duplicate entries)
export class ConflictError extends AppError {
  constructor(
    message: string,
    options: { code?: string; details?: Record<string, unknown> } = {}
  ) {
    super(message, {
      code: options.code ?? 'CONFLICT',
      statusCode: 409,
      details: options.details,
    });
    this.name = 'ConflictError';
  }
}

// Rate limit errors
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(
    options: {
      message?: string;
      retryAfter?: number;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(options.message ?? 'Too many requests. Please try again later.', {
      code: 'RATE_LIMIT',
      statusCode: 429,
      details: {
        ...options.details,
        retryAfter: options.retryAfter,
      },
    });
    this.name = 'RateLimitError';
    this.retryAfter = options.retryAfter;
  }
}

// Internal server errors
export class InternalError extends AppError {
  constructor(
    message = 'An unexpected error occurred',
    options: { code?: string; details?: Record<string, unknown> } = {}
  ) {
    super(message, {
      code: options.code ?? 'INTERNAL_ERROR',
      statusCode: 500,
      details: options.details,
      isOperational: false,
    });
    this.name = 'InternalError';
  }
}

// Check if error is an operational error (vs programming error)
export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

// Format error for API response
export function formatErrorResponse(error: unknown): {
  statusCode: number;
  body: { error: { code: string; message: string; details?: Record<string, unknown> } };
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: error.toJSON(),
    };
  }

  // Log unexpected errors in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Unexpected error:', error);
  }

  // Return generic error for non-operational errors
  return {
    statusCode: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    },
  };
}

// Log error (can be extended to send to monitoring service)
export function logError(error: unknown, context?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();

  if (error instanceof AppError) {
    if (error.isOperational) {
      // Operational errors - log for debugging but not critical
      console.warn(`[${timestamp}] Operational Error:`, {
        name: error.name,
        code: error.code,
        message: error.message,
        details: error.details,
        context,
      });
    } else {
      // Non-operational errors - these are programming errors
      console.error(`[${timestamp}] Critical Error:`, {
        name: error.name,
        code: error.code,
        message: error.message,
        stack: error.stack,
        details: error.details,
        context,
      });
    }
  } else if (error instanceof Error) {
    // Unknown errors - treat as critical
    console.error(`[${timestamp}] Unhandled Error:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
    });
  } else {
    // Non-error throws
    console.error(`[${timestamp}] Unknown Error:`, {
      error,
      context,
    });
  }
}
