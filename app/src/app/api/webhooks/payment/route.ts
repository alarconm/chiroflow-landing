/**
 * Payment Webhook Endpoint
 * Epic 10: Payment Processing - US-091
 *
 * Handles incoming webhooks from payment processors (Stripe, Square).
 * Implements signature verification and idempotent processing.
 *
 * IMPORTANT: This endpoint must NOT use standard body parsing.
 * We need the raw body for signature verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlePaymentWebhook } from '@/lib/payment/webhook-handler';
import { PaymentProcessorType } from '@prisma/client';

// Disable body parsing - we need raw body for signature verification
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/payment
 *
 * Receives webhooks from payment processors.
 *
 * Headers expected:
 * - Stripe: stripe-signature
 * - Square: x-square-signature (future)
 *
 * Query params:
 * - processor: 'stripe' | 'square' (optional, defaults to stripe)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get the raw body as text for signature verification
    const rawBody = await request.text();

    // Determine processor type from query param or default to Stripe
    const processorParam = request.nextUrl.searchParams.get('processor')?.toUpperCase();
    let processorType: PaymentProcessorType = 'STRIPE';

    if (processorParam === 'SQUARE') {
      processorType = 'SQUARE';
    } else if (processorParam === 'MOCK') {
      processorType = 'MOCK';
    }

    // Get signature header based on processor
    let signature: string | null = null;

    switch (processorType) {
      case 'STRIPE':
        signature = request.headers.get('stripe-signature');
        break;
      case 'SQUARE':
        signature = request.headers.get('x-square-signature');
        break;
      case 'MOCK':
        // Mock provider uses a simple signature for testing
        signature = request.headers.get('x-webhook-signature') || 'mock-signature';
        break;
      default:
        signature = request.headers.get('stripe-signature');
    }

    if (!signature) {
      console.error('[PaymentWebhook] Missing signature header');
      return NextResponse.json(
        { error: 'Missing webhook signature' },
        { status: 400 }
      );
    }

    // Process the webhook
    const result = await handlePaymentWebhook(rawBody, signature, processorType);

    const duration = Date.now() - startTime;

    if (!result.success) {
      console.error('[PaymentWebhook] Processing failed:', {
        eventId: result.eventId,
        eventType: result.eventType,
        error: result.error,
        duration: `${duration}ms`,
      });

      // Return 400 for verification failures, 200 for processing failures
      // (Stripe will retry on non-2xx responses)
      if (result.error?.includes('verification')) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      // For processing errors, we still return 200 to prevent retries
      // (we've recorded the failure and can handle it manually)
      return NextResponse.json({
        received: true,
        processed: false,
        error: result.error,
      });
    }

    // Log successful processing
    console.log('[PaymentWebhook] Processed successfully:', {
      eventId: result.eventId,
      eventType: result.eventType,
      skipped: result.skipped,
      actionsCount: result.actions?.length || 0,
      duration: `${duration}ms`,
    });

    return NextResponse.json({
      received: true,
      processed: result.processed,
      skipped: result.skipped,
      eventId: result.eventId,
      eventType: result.eventType,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[PaymentWebhook] Unexpected error:', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    // Return 500 for unexpected errors (Stripe will retry)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/payment
 *
 * Health check endpoint for webhook configuration verification.
 * Returns basic info about the webhook endpoint status.
 */
export async function GET(request: NextRequest) {
  // Basic auth check - only allow in development or with secret
  const authHeader = request.headers.get('authorization');
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;

  // In production, require auth to prevent info disclosure
  if (process.env.NODE_ENV === 'production') {
    if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/payment',
    supportedProcessors: ['stripe', 'square', 'mock'],
    supportedEvents: [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'charge.refunded',
      'charge.refund.updated',
      'charge.dispute.created',
      'charge.dispute.updated',
      'charge.dispute.closed',
      'payment_method.attached',
      'payment_method.detached',
    ],
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handle unsupported methods
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'POST, GET, OPTIONS',
    },
  });
}
