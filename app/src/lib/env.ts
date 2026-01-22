import { z } from 'zod';

// Define the schema for environment variables
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // NextAuth
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),

  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('ChiroFlow'),
  APP_URL: z.string().url().optional(),

  // Optional: Email (for password reset, notifications)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),

  // Optional: Storage (for file uploads)
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Optional: Analytics/Monitoring
  SENTRY_DSN: z.string().url().optional(),
  ANALYTICS_ID: z.string().optional(),

  // Optional: AI/ML features
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),

  // Optional: Clearinghouse Integration
  CLEARINGHOUSE_ENCRYPTION_KEY: z.string().min(32).optional(),
  CLEARINGHOUSE_DEFAULT_PROVIDER: z
    .enum(['MOCK', 'CHANGE_HEALTHCARE', 'TRIZETTO', 'AVAILITY', 'OFFICE_ALLY'])
    .optional(),
  CLEARINGHOUSE_USE_MOCK_IN_DEV: z.string().transform((v) => v === 'true').optional(),
});

// Parse and validate environment variables
function validateEnv() {
  const result = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    APP_NAME: process.env.APP_NAME,
    APP_URL: process.env.APP_URL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_FROM: process.env.SMTP_FROM,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    ANALYTICS_ID: process.env.ANALYTICS_ID,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    CLEARINGHOUSE_ENCRYPTION_KEY: process.env.CLEARINGHOUSE_ENCRYPTION_KEY,
    CLEARINGHOUSE_DEFAULT_PROVIDER: process.env.CLEARINGHOUSE_DEFAULT_PROVIDER,
    CLEARINGHOUSE_USE_MOCK_IN_DEV: process.env.CLEARINGHOUSE_USE_MOCK_IN_DEV,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}

// Export validated environment variables
export const env = validateEnv();

// Type-safe environment variable access
export type Env = z.infer<typeof envSchema>;

// Helper to check if we're in production
export const isProduction = env.NODE_ENV === 'production';

// Helper to check if we're in development
export const isDevelopment = env.NODE_ENV === 'development';

// Helper to check if we're in test
export const isTest = env.NODE_ENV === 'test';

// Helper to check if email is configured
export const hasEmailConfig = Boolean(
  env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD
);

// Helper to check if S3 is configured
export const hasS3Config = Boolean(
  env.S3_BUCKET && env.S3_REGION && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
);

// Helper to check if AI features are enabled
export const hasAIConfig = Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.GOOGLE_AI_API_KEY);

// Helper to check which AI provider is available (priority: Claude > Gemini > OpenAI)
export const getAIProvider = (): 'anthropic' | 'google' | 'openai' | 'mock' => {
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.GOOGLE_AI_API_KEY) return 'google';
  if (env.OPENAI_API_KEY) return 'openai';
  return 'mock';
};

// Helper to get clearinghouse provider based on environment
export const getClearinghouseProvider = ():
  | 'MOCK'
  | 'CHANGE_HEALTHCARE'
  | 'TRIZETTO'
  | 'AVAILITY'
  | 'OFFICE_ALLY' => {
  // In development, optionally use mock provider
  if (isDevelopment && env.CLEARINGHOUSE_USE_MOCK_IN_DEV) {
    return 'MOCK';
  }

  // Use configured default provider, or fall back to MOCK
  return env.CLEARINGHOUSE_DEFAULT_PROVIDER || 'MOCK';
};

// Helper to check if clearinghouse encryption is configured
export const hasClearinghouseEncryption = Boolean(
  env.CLEARINGHOUSE_ENCRYPTION_KEY || env.NEXTAUTH_SECRET
);
