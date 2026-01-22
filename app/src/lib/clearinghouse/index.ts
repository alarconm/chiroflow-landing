/**
 * Epic 08: Clearinghouse Integration - Module Index
 *
 * Factory function and exports for clearinghouse provider management.
 */

import { ClearinghouseProvider } from '@prisma/client';
import { IClearinghouseProvider, ClearinghouseConfigData } from './types';
import { MockClearinghouseProvider } from './mock-provider';
import { ChangeHealthcareProvider } from './change-healthcare';

// Re-export types
export * from './types';
export { MockClearinghouseProvider } from './mock-provider';
export { ChangeHealthcareProvider } from './change-healthcare';

/**
 * Factory function to create clearinghouse provider instances.
 *
 * @param config - The clearinghouse configuration from the database
 * @returns Configured provider instance
 * @throws Error if provider type is not supported
 */
export async function createClearinghouseProvider(
  config: ClearinghouseConfigData
): Promise<IClearinghouseProvider> {
  let provider: IClearinghouseProvider;

  switch (config.provider) {
    case ClearinghouseProvider.MOCK:
      provider = new MockClearinghouseProvider();
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
        `Clearinghouse provider '${config.provider}' is not yet implemented. ` +
          `Using Mock provider for testing.`
      );
      provider = new MockClearinghouseProvider();
      break;

    default:
      throw new Error(`Unsupported clearinghouse provider: ${config.provider}`);
  }

  // Configure the provider with the organization's settings
  await provider.configure(config);

  return provider;
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
