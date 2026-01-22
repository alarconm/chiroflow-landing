// Natural Language Query Engine - AI Insights Agent
// Parses natural language questions and returns data

import { prisma } from '@/lib/prisma';
import type { QueryIntent, ParsedQuery, ParsedEntity, ParsedFilter, QueryResponse } from './types';

// Intent patterns - map keywords to intents
const INTENT_PATTERNS: Record<QueryIntent, RegExp[]> = {
  revenue_query: [
    /revenue|income|earnings|sales|billing|charged|collected/i,
    /how much (did we|have we|did i|have i) (make|earn|collect|bill)/i,
    /total (revenue|income|sales|collections)/i,
  ],
  visit_query: [
    /visit|appointment|patient\s*visits?|seen|scheduled/i,
    /how many (patients|visits|appointments)/i,
    /patient count|visit count/i,
  ],
  patient_query: [
    /patient|patients|new patient|active patient/i,
    /how many (new )?patients/i,
  ],
  provider_query: [
    /provider|doctor|dr\.|chiropractor/i,
    /provider production|provider performance/i,
  ],
  payment_query: [
    /payment|paid|collected|reimbursement/i,
    /how much (was|were|have been) paid/i,
  ],
  claim_query: [
    /claim|claims|denial|rejected|submitted/i,
    /claim status|denial rate/i,
  ],
  trend_query: [
    /trend|trending|over time|comparison|compared to/i,
    /increasing|decreasing|growing|declining/i,
  ],
  comparison_query: [
    /compare|versus|vs\.?|difference between/i,
    /better|worse|more|less than/i,
  ],
  forecast_query: [
    /forecast|predict|projection|expected|estimate/i,
    /will we|what will/i,
  ],
  unknown: [],
};

// Time period patterns
const TIME_PATTERNS = [
  { pattern: /today/i, getDates: () => getToday() },
  { pattern: /yesterday/i, getDates: () => getYesterday() },
  { pattern: /this week/i, getDates: () => getThisWeek() },
  { pattern: /last week/i, getDates: () => getLastWeek() },
  { pattern: /this month/i, getDates: () => getThisMonth() },
  { pattern: /last month/i, getDates: () => getLastMonth() },
  { pattern: /this quarter/i, getDates: () => getThisQuarter() },
  { pattern: /last quarter/i, getDates: () => getLastQuarter() },
  { pattern: /this year/i, getDates: () => getThisYear() },
  { pattern: /last year/i, getDates: () => getLastYear() },
  { pattern: /ytd|year to date/i, getDates: () => getThisYear() },
  { pattern: /mtd|month to date/i, getDates: () => getThisMonth() },
  { pattern: /past (\d+) days?/i, getDates: (m: RegExpMatchArray) => getPastDays(parseInt(m[1])) },
  { pattern: /last (\d+) days?/i, getDates: (m: RegExpMatchArray) => getPastDays(parseInt(m[1])) },
  { pattern: /past (\d+) weeks?/i, getDates: (m: RegExpMatchArray) => getPastWeeks(parseInt(m[1])) },
  { pattern: /past (\d+) months?/i, getDates: (m: RegExpMatchArray) => getPastMonths(parseInt(m[1])) },
];

// Metric patterns
const METRIC_PATTERNS = [
  { pattern: /revenue|income|earnings/i, metric: 'revenue', field: 'amount' },
  { pattern: /visits?|appointments?/i, metric: 'visits', field: 'count' },
  { pattern: /new patients?/i, metric: 'newPatients', field: 'count' },
  { pattern: /no.?shows?/i, metric: 'noShows', field: 'count' },
  { pattern: /cancellations?|cancelled/i, metric: 'cancellations', field: 'count' },
  { pattern: /collection rate/i, metric: 'collectionRate', field: 'percentage' },
  { pattern: /denial rate/i, metric: 'denialRate', field: 'percentage' },
  { pattern: /ar|accounts receivable/i, metric: 'ar', field: 'amount' },
  { pattern: /average visit value/i, metric: 'avgVisitValue', field: 'amount' },
  { pattern: /charges?|billed/i, metric: 'charges', field: 'amount' },
  { pattern: /payments?|collected/i, metric: 'payments', field: 'amount' },
  { pattern: /claims?/i, metric: 'claims', field: 'count' },
];

// Date helper functions
function getToday(): { start: Date; end: Date; preset: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end, preset: 'today' };
}

function getYesterday(): { start: Date; end: Date; preset: string } {
  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end, preset: 'yesterday' };
}

function getThisWeek(): { start: Date; end: Date; preset: string } {
  const start = new Date();
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  return { start, end, preset: 'thisWeek' };
}

function getLastWeek(): { start: Date; end: Date; preset: string } {
  const end = new Date();
  end.setDate(end.getDate() - end.getDay());
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end, preset: 'lastWeek' };
}

function getThisMonth(): { start: Date; end: Date; preset: string } {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  return { start, end, preset: 'thisMonth' };
}

function getLastMonth(): { start: Date; end: Date; preset: string } {
  const end = new Date();
  end.setDate(0);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return { start, end, preset: 'lastMonth' };
}

function getThisQuarter(): { start: Date; end: Date; preset: string } {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), quarter * 3, 1);
  const end = new Date();
  return { start, end, preset: 'thisQuarter' };
}

function getLastQuarter(): { start: Date; end: Date; preset: string } {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const end = new Date(now.getFullYear(), quarter * 3, 0);
  const start = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
  return { start, end, preset: 'lastQuarter' };
}

function getThisYear(): { start: Date; end: Date; preset: string } {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const end = new Date();
  return { start, end, preset: 'thisYear' };
}

function getLastYear(): { start: Date; end: Date; preset: string } {
  const year = new Date().getFullYear() - 1;
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end, preset: 'lastYear' };
}

function getPastDays(days: number): { start: Date; end: Date; preset: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { start, end, preset: `past${days}Days` };
}

function getPastWeeks(weeks: number): { start: Date; end: Date; preset: string } {
  return getPastDays(weeks * 7);
}

function getPastMonths(months: number): { start: Date; end: Date; preset: string } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  start.setHours(0, 0, 0, 0);
  return { start, end, preset: `past${months}Months` };
}

/**
 * Detect intent from query
 */
function detectIntent(query: string): QueryIntent {
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        return intent as QueryIntent;
      }
    }
  }
  return 'unknown';
}

/**
 * Extract time range from query
 */
function extractTimeRange(query: string): { start: Date; end: Date; preset?: string } | undefined {
  for (const { pattern, getDates } of TIME_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      return getDates(match);
    }
  }
  // Default to this month if no time specified
  return getThisMonth();
}

/**
 * Extract entities from query
 */
function extractEntities(query: string): ParsedEntity[] {
  const entities: ParsedEntity[] = [];

  // Extract metrics
  for (const { pattern, metric } of METRIC_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      entities.push({
        type: 'metric',
        value: metric,
        originalText: match[0],
        confidence: 0.9,
      });
    }
  }

  // Extract provider names (basic pattern)
  const providerPattern = /(?:dr\.?|doctor|provider)\s+([a-z]+)/i;
  const providerMatch = query.match(providerPattern);
  if (providerMatch) {
    entities.push({
      type: 'provider',
      value: providerMatch[1],
      originalText: providerMatch[0],
      confidence: 0.7,
    });
  }

  return entities;
}

/**
 * Parse natural language query
 */
export function parseQuery(query: string): ParsedQuery {
  const intent = detectIntent(query);
  const timeRange = extractTimeRange(query);
  const entities = extractEntities(query);

  return {
    originalQuery: query,
    intent,
    entities,
    timeRange,
  };
}

/**
 * Execute revenue query
 */
async function executeRevenueQuery(
  organizationId: string,
  parsedQuery: ParsedQuery
): Promise<QueryResponse> {
  const startTime = Date.now();
  const { start, end } = parsedQuery.timeRange || getThisMonth();

  const payments = await prisma.payment.aggregate({
    where: {
      organizationId,
      paymentDate: { gte: start, lte: end },
      isVoid: false,
    },
    _sum: { amount: true },
    _count: true,
  });

  const totalRevenue = Number(payments._sum.amount || 0);

  return {
    query: parsedQuery.originalQuery,
    intent: parsedQuery.intent,
    responseType: 'number',
    data: {
      value: totalRevenue,
      formatted: `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      count: payments._count,
      period: parsedQuery.timeRange?.preset || 'custom',
    },
    explanation: `Total revenue from ${start.toLocaleDateString()} to ${end.toLocaleDateString()} is $${totalRevenue.toFixed(2)} from ${payments._count} payments.`,
    suggestedFollowUps: [
      'How does this compare to last month?',
      'What was our revenue by provider?',
      'Show me the revenue trend over time',
    ],
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Execute visits query
 */
async function executeVisitsQuery(
  organizationId: string,
  parsedQuery: ParsedQuery
): Promise<QueryResponse> {
  const startTime = Date.now();
  const { start, end } = parsedQuery.timeRange || getThisMonth();

  const appointments = await prisma.appointment.count({
    where: {
      organizationId,
      startTime: { gte: start, lte: end },
      status: { in: ['COMPLETED', 'CHECKED_IN'] },
    },
  });

  return {
    query: parsedQuery.originalQuery,
    intent: parsedQuery.intent,
    responseType: 'number',
    data: {
      value: appointments,
      formatted: appointments.toLocaleString(),
      period: parsedQuery.timeRange?.preset || 'custom',
    },
    explanation: `There were ${appointments} patient visits from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}.`,
    suggestedFollowUps: [
      'How many no-shows were there?',
      'What is the breakdown by provider?',
      'Show visit trends over time',
    ],
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Execute patient query
 */
async function executePatientQuery(
  organizationId: string,
  parsedQuery: ParsedQuery
): Promise<QueryResponse> {
  const startTime = Date.now();
  const { start, end } = parsedQuery.timeRange || getThisMonth();

  const isNewPatientQuery = /new patient/i.test(parsedQuery.originalQuery);

  if (isNewPatientQuery) {
    const newPatients = await prisma.patient.count({
      where: {
        organizationId,
        createdAt: { gte: start, lte: end },
      },
    });

    return {
      query: parsedQuery.originalQuery,
      intent: parsedQuery.intent,
      responseType: 'number',
      data: {
        value: newPatients,
        formatted: newPatients.toLocaleString(),
        period: parsedQuery.timeRange?.preset || 'custom',
      },
      explanation: `There were ${newPatients} new patients from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}.`,
      suggestedFollowUps: [
        'How does this compare to last month?',
        'What is our patient retention rate?',
        'Show new patient trends',
      ],
      executionTimeMs: Date.now() - startTime,
    };
  }

  const totalPatients = await prisma.patient.count({
    where: { organizationId, status: 'ACTIVE' },
  });

  return {
    query: parsedQuery.originalQuery,
    intent: parsedQuery.intent,
    responseType: 'number',
    data: {
      value: totalPatients,
      formatted: totalPatients.toLocaleString(),
    },
    explanation: `You have ${totalPatients} active patients.`,
    suggestedFollowUps: [
      'How many new patients this month?',
      'Which patients are at risk of churning?',
      'Show patient growth over time',
    ],
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Execute claims query
 */
async function executeClaimsQuery(
  organizationId: string,
  parsedQuery: ParsedQuery
): Promise<QueryResponse> {
  const startTime = Date.now();
  const { start, end } = parsedQuery.timeRange || getThisMonth();

  const isDenialQuery = /denial|rejected|denied/i.test(parsedQuery.originalQuery);

  if (isDenialQuery) {
    const [total, denied] = await Promise.all([
      prisma.claim.count({
        where: {
          organizationId,
          submittedDate: { gte: start, lte: end },
          status: { in: ['SUBMITTED', 'ACCEPTED', 'PAID', 'DENIED'] },
        },
      }),
      prisma.claim.count({
        where: {
          organizationId,
          submittedDate: { gte: start, lte: end },
          status: 'DENIED',
        },
      }),
    ]);

    const denialRate = total > 0 ? (denied / total) * 100 : 0;

    return {
      query: parsedQuery.originalQuery,
      intent: parsedQuery.intent,
      responseType: 'number',
      data: {
        value: denialRate,
        formatted: `${denialRate.toFixed(1)}%`,
        denied,
        total,
        period: parsedQuery.timeRange?.preset || 'custom',
      },
      explanation: `The denial rate is ${denialRate.toFixed(1)}% (${denied} denied out of ${total} claims) from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}.`,
      suggestedFollowUps: [
        'What are the top denial reasons?',
        'Which payers have the highest denial rates?',
        'How has the denial rate changed over time?',
      ],
      executionTimeMs: Date.now() - startTime,
    };
  }

  const claims = await prisma.claim.groupBy({
    by: ['status'],
    where: {
      organizationId,
      submittedDate: { gte: start, lte: end },
    },
    _count: true,
  });

  const breakdown = Object.fromEntries(claims.map((c) => [c.status, c._count]));
  const total = claims.reduce((sum, c) => sum + c._count, 0);

  return {
    query: parsedQuery.originalQuery,
    intent: parsedQuery.intent,
    responseType: 'table',
    data: {
      total,
      breakdown,
      period: parsedQuery.timeRange?.preset || 'custom',
    },
    explanation: `There were ${total} claims from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}.`,
    suggestedFollowUps: [
      'What is the denial rate?',
      'Which claims are pending?',
      'Show claims by payer',
    ],
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Execute unknown/fallback query
 */
async function executeUnknownQuery(parsedQuery: ParsedQuery): Promise<QueryResponse> {
  return {
    query: parsedQuery.originalQuery,
    intent: 'unknown',
    responseType: 'text',
    data: null,
    explanation: "I'm not sure how to answer that question. Try asking about revenue, visits, patients, or claims.",
    suggestedFollowUps: [
      'How much revenue did we make this month?',
      'How many patients did we see today?',
      'What is our denial rate?',
      'Show me our collection rate',
    ],
    executionTimeMs: 0,
  };
}

/**
 * Execute natural language query
 */
export async function executeNLQuery(
  organizationId: string,
  query: string
): Promise<QueryResponse> {
  const parsedQuery = parseQuery(query);
  let response: QueryResponse;

  switch (parsedQuery.intent) {
    case 'revenue_query':
    case 'payment_query':
      response = await executeRevenueQuery(organizationId, parsedQuery);
      break;
    case 'visit_query':
      response = await executeVisitsQuery(organizationId, parsedQuery);
      break;
    case 'patient_query':
      response = await executePatientQuery(organizationId, parsedQuery);
      break;
    case 'claim_query':
      response = await executeClaimsQuery(organizationId, parsedQuery);
      break;
    default:
      response = await executeUnknownQuery(parsedQuery);
  }

  // Save query to history
  await prisma.nLQueryHistory.create({
    data: {
      organizationId,
      userId: 'system', // Will be updated from context
      query,
      parsedIntent: parsedQuery.intent,
      parsedEntities: parsedQuery.entities as unknown as object,
      successful: response.responseType !== 'text' || response.data !== null,
      responseType: response.responseType,
      responseData: response.data as object,
      executionTimeMs: response.executionTimeMs,
    },
  });

  return response;
}

/**
 * Get suggested queries based on context
 */
export function getSuggestedQueries(): string[] {
  return [
    'How much revenue did we make this month?',
    'How many patients did we see today?',
    'What is our no-show rate?',
    'How does this week compare to last week?',
    'What is our collection rate?',
    'How many new patients this month?',
    'What is our denial rate?',
    'Show me revenue for the past 30 days',
  ];
}

/**
 * Get query history
 */
export async function getQueryHistory(
  organizationId: string,
  userId?: string,
  limit = 20
): Promise<{ query: string; intent: string; createdAt: Date }[]> {
  const queries = await prisma.nLQueryHistory.findMany({
    where: {
      organizationId,
      ...(userId ? { userId } : {}),
      successful: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      query: true,
      parsedIntent: true,
      createdAt: true,
    },
  });

  return queries.map((q) => ({
    query: q.query,
    intent: q.parsedIntent || 'unknown',
    createdAt: q.createdAt,
  }));
}
