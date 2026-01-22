/**
 * Epic 08: Clearinghouse Integration - Module Index
 *
 * Factory function and exports for clearinghouse provider management.
 * Includes environment-based provider selection, credential encryption,
 * and resilient API operations with retry logic.
 */

import { ClearinghouseProvider } from '@prisma/client';
import { IClearinghouseProvider, ClearinghouseConfigData, ClearinghouseCredentials } from './types';
import { MockClearinghouseProvider } from './mock-provider';
import { ChangeHealthcareProvider } from './change-healthcare';
import { isDevelopment } from '../env';
import { safeDecryptCredentials, encryptCredentials, EncryptedData } from './crypto';
import { CircuitBreaker, withRetry, DEFAULT_RETRY_CONFIG, RetryConfig } from './retry';

// Re-export types
export * from './types';
export { MockClearinghouseProvider } from './mock-provider';
export { ChangeHealthcareProvider } from './change-healthcare';

// Re-export crypto utilities
export {
  encryptCredential,
  decryptCredential,
  encryptCredentials,
  decryptCredentials,
  safeDecryptCredentials,
  isEncrypted,
  maskCredential,
  rotateEncryption,
  type EncryptedData,
} from './crypto';

// Re-export retry utilities
export {
  ClearinghouseError,
  classifyError,
  withRetry,
  calculateRetryDelay,
  sleep,
  CircuitBreaker,
  createErrorResponse,
  withResilience,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type ErrorCategory,
  type RetryConfig,
  type CircuitBreakerConfig,
} from './retry';

// Re-export EDI 837P utilities
export {
  EDI837Generator,
  createEDI837Generator,
  generate837P,
  validateClaim,
  DEFAULT_DELIMITERS,
  CLAIM_FREQUENCY,
  PLACE_OF_SERVICE,
  ENTITY_IDENTIFIER,
  ENTITY_TYPE,
  REFERENCE_QUALIFIER,
  type EDI837Config,
  type EDI837Result,
  type ValidationResult,
} from './edi-837';

// Re-export EDI 835 ERA/Remittance utilities
export {
  EDI835Parser,
  parseERA,
  isERAContent,
  generatePostingReport,
  CAS_GROUP_CODES,
  CARC_CODES,
  type EDI835ParseResult,
  type ParsedSegment,
  type Adjustment,
  type MatchResult,
  type AutoPostResult,
  type PostingReport,
} from './edi-835';

// Provider-specific circuit breakers (shared across instances)
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for a provider.
 */
function getCircuitBreaker(providerId: string): CircuitBreaker {
  if (!circuitBreakers.has(providerId)) {
    circuitBreakers.set(providerId, new CircuitBreaker());
  }
  return circuitBreakers.get(providerId)!;
}

/**
 * Options for creating a clearinghouse provider.
 */
export interface CreateProviderOptions {
  /** Force use of mock provider (useful for testing) */
  forceMock?: boolean;
  /** Enable retry logic with circuit breaker */
  enableResilience?: boolean;
  /** Custom retry configuration */
  retryConfig?: Partial<RetryConfig>;
  /** Decrypt credentials before configuring */
  decryptCredentials?: boolean;
}

/**
 * Factory function to create clearinghouse provider instances.
 *
 * Supports environment-based provider selection:
 * - In development, can use CLEARINGHOUSE_USE_MOCK_IN_DEV=true to force mock
 * - Can be overridden with forceMock option
 *
 * @param config - The clearinghouse configuration from the database
 * @param options - Additional options for provider creation
 * @returns Configured provider instance
 * @throws Error if provider type is not supported
 */
export async function createClearinghouseProvider(
  config: ClearinghouseConfigData,
  options: CreateProviderOptions = {}
): Promise<IClearinghouseProvider> {
  const {
    forceMock = false,
    enableResilience = true,
    retryConfig = {},
    decryptCredentials: shouldDecrypt = true,
  } = options;

  let provider: IClearinghouseProvider;
  let effectiveConfig = { ...config };

  // Environment-based mock override
  const useMock =
    forceMock ||
    (isDevelopment && process.env.CLEARINGHOUSE_USE_MOCK_IN_DEV === 'true');

  // Decrypt credentials if needed
  if (shouldDecrypt && effectiveConfig.credentials) {
    const decrypted = safeDecryptCredentials<ClearinghouseCredentials>(
      effectiveConfig.credentials as unknown
    );
    if (decrypted) {
      effectiveConfig = {
        ...effectiveConfig,
        credentials: decrypted,
      };
    }
  }

  // Select provider based on configuration (with mock override)
  const providerType = useMock ? ClearinghouseProvider.MOCK : effectiveConfig.provider;

  switch (providerType) {
    case ClearinghouseProvider.MOCK:
      provider = new MockClearinghouseProvider();
      if (useMock && config.provider !== ClearinghouseProvider.MOCK) {
        console.info(
          `[Clearinghouse] Using Mock provider instead of ${config.provider} ` +
            `(forceMock=${forceMock}, dev=${isDevelopment})`
        );
      }
      break;

    case ClearinghouseProvider.CHANGE_HEALTHCARE:
      provider = new ChangeHealthcareProvider();
      break;

    case ClearinghouseProvider.TRIZETTO:
    case ClearinghouseProvider.AVAILITY:
    case ClearinghouseProvider.OFFICE_ALLY:
      // These providers are not yet implemented
      // Fall back to mock provider with a warning
      console.warn(
        `Clearinghouse provider '${providerType}' is not yet implemented. ` +
          `Using Mock provider for testing.`
      );
      provider = new MockClearinghouseProvider();
      break;

    default:
      throw new Error(`Unsupported clearinghouse provider: ${providerType}`);
  }

  // Configure the provider with the organization's settings
  await provider.configure(effectiveConfig);

  // Wrap with resilience if enabled (circuit breaker + retry)
  if (enableResilience && providerType !== ClearinghouseProvider.MOCK) {
    const circuitBreaker = getCircuitBreaker(effectiveConfig.id);
    return wrapProviderWithResilience(provider, circuitBreaker, retryConfig);
  }

  return provider;
}

/**
 * Create a provider instance for a specific environment.
 * Useful for explicit control over which provider to use.
 *
 * @param providerType - The type of provider to create
 * @param config - Optional configuration to apply
 * @returns Unconfigured or configured provider instance
 */
export async function createProviderByType(
  providerType: ClearinghouseProvider,
  config?: ClearinghouseConfigData
): Promise<IClearinghouseProvider> {
  let provider: IClearinghouseProvider;

  switch (providerType) {
    case ClearinghouseProvider.MOCK:
      provider = new MockClearinghouseProvider();
      break;
    case ClearinghouseProvider.CHANGE_HEALTHCARE:
      provider = new ChangeHealthcareProvider();
      break;
    default:
      // Fall back to mock for unimplemented providers
      provider = new MockClearinghouseProvider();
  }

  if (config) {
    await provider.configure(config);
  }

  return provider;
}

/**
 * Wrap a provider with retry and circuit breaker logic.
 */
function wrapProviderWithResilience(
  provider: IClearinghouseProvider,
  circuitBreaker: CircuitBreaker,
  retryConfig: Partial<RetryConfig>
): IClearinghouseProvider {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

  // Create a proxy that wraps each async method with resilience
  return new Proxy(provider, {
    get(target, prop) {
      const value = target[prop as keyof IClearinghouseProvider];

      // Only wrap async methods (not configure or providerType)
      if (
        typeof value === 'function' &&
        prop !== 'configure' &&
        prop !== 'providerType'
      ) {
        return async (...args: unknown[]) => {
          return circuitBreaker.execute(() =>
            withRetry(() => (value as Function).apply(target, args), mergedConfig)
          );
        };
      }

      return value;
    },
  });
}

/**
 * Reset the circuit breaker for a provider.
 */
export function resetCircuitBreaker(providerId: string): void {
  const breaker = circuitBreakers.get(providerId);
  if (breaker) {
    breaker.reset();
  }
}

/**
 * Get the circuit breaker status for a provider.
 */
export function getCircuitBreakerStatus(
  providerId: string
): { state: 'closed' | 'open' | 'half-open'; exists: boolean } {
  const breaker = circuitBreakers.get(providerId);
  if (!breaker) {
    return { state: 'closed', exists: false };
  }
  return { state: breaker.getState(), exists: true };
}

/**
 * Get the display name for a clearinghouse provider.
 */
export function getClearinghouseProviderName(provider: ClearinghouseProvider): string {
  const names: Record<ClearinghouseProvider, string> = {
    [ClearinghouseProvider.MOCK]: 'Mock (Testing)',
    [ClearinghouseProvider.CHANGE_HEALTHCARE]: 'Change Healthcare',
    [ClearinghouseProvider.TRIZETTO]: 'Trizetto',
    [ClearinghouseProvider.AVAILITY]: 'Availity',
    [ClearinghouseProvider.OFFICE_ALLY]: 'Office Ally',
  };

  return names[provider] || provider;
}

/**
 * Get available clearinghouse providers with their implementation status.
 */
export function getAvailableProviders(): Array<{
  provider: ClearinghouseProvider;
  name: string;
  status: 'available' | 'coming_soon' | 'testing_only';
  description: string;
}> {
  return [
    {
      provider: ClearinghouseProvider.MOCK,
      name: 'Mock (Testing)',
      status: 'testing_only',
      description: 'Simulated clearinghouse for development and testing',
    },
    {
      provider: ClearinghouseProvider.CHANGE_HEALTHCARE,
      name: 'Change Healthcare',
      status: 'coming_soon',
      description: 'Full-service EDI clearinghouse with extensive payer network',
    },
    {
      provider: ClearinghouseProvider.TRIZETTO,
      name: 'Trizetto',
      status: 'coming_soon',
      description: 'Comprehensive healthcare connectivity solutions',
    },
    {
      provider: ClearinghouseProvider.AVAILITY,
      name: 'Availity',
      status: 'coming_soon',
      description: 'Real-time health information network',
    },
    {
      provider: ClearinghouseProvider.OFFICE_ALLY,
      name: 'Office Ally',
      status: 'coming_soon',
      description: 'Cost-effective clearinghouse for small practices',
    },
  ];
}

/**
 * Validate clearinghouse configuration credentials.
 */
export function validateClearinghouseConfig(
  config: Partial<ClearinghouseConfigData>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push('Provider type is required');
  }

  if (!config.name) {
    errors.push('Configuration name is required');
  }

  // Provider-specific validation
  switch (config.provider) {
    case ClearinghouseProvider.CHANGE_HEALTHCARE:
      if (!config.credentials?.apiKey) {
        errors.push('Change Healthcare requires an API key');
      }
      break;

    case ClearinghouseProvider.TRIZETTO:
      if (!config.credentials?.username || !config.credentials?.password) {
        errors.push('Trizetto requires username and password');
      }
      break;

    case ClearinghouseProvider.AVAILITY:
      if (!config.credentials?.apiKey) {
        errors.push('Availity requires an API key');
      }
      break;

    case ClearinghouseProvider.OFFICE_ALLY:
      if (!config.credentials?.username || !config.credentials?.password) {
        errors.push('Office Ally requires username and password');
      }
      if (!config.credentials?.siteId) {
        errors.push('Office Ally requires a site ID');
      }
      break;

    case ClearinghouseProvider.MOCK:
      // Mock provider doesn't require credentials
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Common CARC (Claim Adjustment Reason Codes) for denials.
 */
export const COMMON_CARC_CODES: Record<string, { description: string; category: string }> = {
  '1': { description: 'Deductible amount', category: 'Patient Responsibility' },
  '2': { description: 'Coinsurance amount', category: 'Patient Responsibility' },
  '3': { description: 'Copayment amount', category: 'Patient Responsibility' },
  '4': { description: 'Procedure code inconsistent with modifier', category: 'Coding' },
  '5': { description: 'Procedure code inconsistent with diagnosis code', category: 'Coding' },
  '16': { description: 'Claim lacks information or submitted late', category: 'Administrative' },
  '18': { description: 'Duplicate claim/service', category: 'Administrative' },
  '22': { description: 'Care not authorized by network/primary care provider', category: 'Authorization' },
  '27': { description: 'Expenses incurred after coverage terminated', category: 'Eligibility' },
  '29': { description: 'Time limit for filing expired', category: 'Administrative' },
  '45': { description: 'Charges exceed fee schedule/max allowable', category: 'Contractual' },
  '50': { description: 'Non-covered services', category: 'Coverage' },
  '96': { description: 'Non-covered charge(s)', category: 'Coverage' },
  '97': { description: 'Payment included in allowance for another service', category: 'Bundling' },
  '151': { description: 'Prior authorization was not obtained', category: 'Authorization' },
  '181': { description: 'Procedure code was invalid on date of service', category: 'Coding' },
  '182': { description: 'Procedure modifier invalid on date of service', category: 'Coding' },
  '197': { description: 'Precertification/authorization/notification absent', category: 'Authorization' },
  '204': { description: 'Service not covered unless specific conditions met', category: 'Medical Necessity' },
  '226': { description: 'Information requested from patient not provided', category: 'Administrative' },
  '227': { description: 'Information requested from provider not provided', category: 'Administrative' },
  'B7': { description: 'This provider was not certified for this procedure', category: 'Provider' },
  'B15': { description: 'Payment adjusted because provider is not primary care', category: 'Provider' },
  'CO-4': { description: 'Code inconsistent with modifier', category: 'Coding' },
  'CO-45': { description: 'Contractual adjustment', category: 'Contractual' },
  'PR-1': { description: 'Deductible', category: 'Patient Responsibility' },
  'PR-2': { description: 'Coinsurance', category: 'Patient Responsibility' },
  'PR-3': { description: 'Copay', category: 'Patient Responsibility' },
};

/**
 * Common RARC (Remittance Advice Remark Codes) for additional context.
 */
export const COMMON_RARC_CODES: Record<string, string> = {
  'M1': 'X-ray not taken within the past 12 months or near enough to the start of treatment',
  'M15': 'Separately billed services/tests denied because they are part of another service',
  'M20': 'Missing/incomplete/invalid HCPCS',
  'M21': 'Missing/incomplete/invalid place of service',
  'M51': 'Missing/incomplete/invalid procedure code(s)',
  'M76': 'Missing/incomplete/invalid diagnosis or condition',
  'N130': 'Consult your payer for coverage limitations',
  'N362': 'Services performed must have prior authorization',
  'N381': 'Alert: Consult applicable guidelines for billing',
  'N386': 'This decision was based on a local coverage determination',
  'N432': 'Alert: Concurrent or subsequent resubmission not allowed',
  'N479': 'Missing Referring Provider Primary Identifier',
  'N522': 'Duplicate of a previously processed claim/service',
};
