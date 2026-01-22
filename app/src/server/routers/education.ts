import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { ReadingLevel } from '@prisma/client';

// Validation schemas
const readingLevelSchema = z.enum(['SIMPLE', 'STANDARD', 'DETAILED']);
const languageSchema = z.string().min(2).max(10).default('en');

// Article categories for condition-specific content
const ARTICLE_CATEGORIES = {
  CONDITION_OVERVIEW: 'Condition Overview',
  TREATMENT_OPTIONS: 'Treatment Options',
  RECOVERY_TIMELINE: 'Recovery Timeline',
  LIFESTYLE_MODIFICATIONS: 'Lifestyle Modifications',
  FAQ: 'FAQ',
  PREVENTION: 'Prevention',
  SELF_CARE: 'Self Care',
  WHEN_TO_SEEK_HELP: 'When to Seek Help',
} as const;

// Common chiropractic conditions with ICD-10 codes
const COMMON_CONDITIONS: Record<string, { name: string; icd10Codes: string[]; keywords: string[] }> = {
  'low-back-pain': {
    name: 'Low Back Pain',
    icd10Codes: ['M54.5', 'M54.50', 'M54.51', 'M54.52'],
    keywords: ['lumbar', 'lower back', 'lumbago', 'back pain'],
  },
  'neck-pain': {
    name: 'Neck Pain',
    icd10Codes: ['M54.2', 'M54.20', 'M54.21', 'M54.22'],
    keywords: ['cervical', 'neck', 'cervicalgia'],
  },
  'sciatica': {
    name: 'Sciatica',
    icd10Codes: ['M54.3', 'M54.30', 'M54.31', 'M54.32'],
    keywords: ['sciatic', 'leg pain', 'radiculopathy', 'radiating pain'],
  },
  'headache': {
    name: 'Headache & Migraine',
    icd10Codes: ['G43', 'G43.9', 'R51', 'R51.0', 'R51.9'],
    keywords: ['headache', 'migraine', 'tension headache', 'cervicogenic headache'],
  },
  'herniated-disc': {
    name: 'Herniated Disc',
    icd10Codes: ['M51.0', 'M51.1', 'M51.2', 'M50.0', 'M50.1'],
    keywords: ['disc', 'herniation', 'bulging disc', 'slipped disc', 'disc protrusion'],
  },
  'whiplash': {
    name: 'Whiplash',
    icd10Codes: ['S13.4', 'S13.4XXA', 'S13.4XXD'],
    keywords: ['whiplash', 'neck sprain', 'car accident', 'cervical strain'],
  },
  'scoliosis': {
    name: 'Scoliosis',
    icd10Codes: ['M41', 'M41.0', 'M41.1', 'M41.2'],
    keywords: ['scoliosis', 'curved spine', 'spinal curvature'],
  },
  'shoulder-pain': {
    name: 'Shoulder Pain',
    icd10Codes: ['M25.51', 'M75', 'M75.1', 'M75.4'],
    keywords: ['shoulder', 'rotator cuff', 'frozen shoulder', 'shoulder impingement'],
  },
  'carpal-tunnel': {
    name: 'Carpal Tunnel Syndrome',
    icd10Codes: ['G56.0', 'G56.00', 'G56.01', 'G56.02'],
    keywords: ['carpal tunnel', 'wrist pain', 'hand numbness', 'median nerve'],
  },
  'fibromyalgia': {
    name: 'Fibromyalgia',
    icd10Codes: ['M79.7'],
    keywords: ['fibromyalgia', 'chronic pain', 'widespread pain', 'tender points'],
  },
};

export const educationRouter = router({
  // Get education content by condition (ICD-10 code or condition name)
  getByCondition: protectedProcedure
    .input(
      z.object({
        condition: z.string().min(1, 'Condition is required'), // ICD-10 code or condition slug
        category: z.string().optional(), // Filter by specific category
        readingLevel: readingLevelSchema.optional(),
        language: languageSchema.optional(),
        includeRelated: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const { condition, category, readingLevel, language, includeRelated } = input;

      // Find matching condition by ICD-10 code or slug
      let matchedCondition: (typeof COMMON_CONDITIONS)[string] | undefined;
      let conditionKey: string | undefined;

      // First try exact ICD-10 code match
      for (const [key, cond] of Object.entries(COMMON_CONDITIONS)) {
        if (cond.icd10Codes.some((code) => code.toLowerCase() === condition.toLowerCase())) {
          matchedCondition = cond;
          conditionKey = key;
          break;
        }
      }

      // If no ICD-10 match, try slug match
      if (!matchedCondition) {
        const normalizedSlug = condition.toLowerCase().replace(/\s+/g, '-');
        if (COMMON_CONDITIONS[normalizedSlug]) {
          matchedCondition = COMMON_CONDITIONS[normalizedSlug];
          conditionKey = normalizedSlug;
        }
      }

      // If still no match, try keyword match
      if (!matchedCondition) {
        const normalizedCondition = condition.toLowerCase();
        for (const [key, cond] of Object.entries(COMMON_CONDITIONS)) {
          if (
            cond.keywords.some((kw) => normalizedCondition.includes(kw)) ||
            cond.name.toLowerCase().includes(normalizedCondition)
          ) {
            matchedCondition = cond;
            conditionKey = key;
            break;
          }
        }
      }

      // Build search criteria for articles
      const searchTerms: string[] = [];
      if (matchedCondition) {
        searchTerms.push(...matchedCondition.icd10Codes);
        searchTerms.push(...matchedCondition.keywords);
        searchTerms.push(matchedCondition.name.toLowerCase());
      } else {
        // Use the condition as-is for search
        searchTerms.push(condition.toLowerCase());
      }

      // Build where clause
      const where: Record<string, unknown> = {
        isPublished: true,
        OR: [
          { relatedConditions: { hasSome: searchTerms } },
          { keywords: { hasSome: searchTerms } },
          { title: { contains: condition, mode: 'insensitive' } },
          { content: { contains: condition, mode: 'insensitive' } },
        ],
      };

      if (category) {
        where.category = category;
      }

      if (readingLevel) {
        where.readingLevel = readingLevel;
      }

      if (language) {
        where.language = language;
      }

      // Fetch articles
      const articles = await ctx.prisma.educationArticle.findMany({
        where,
        orderBy: [{ category: 'asc' }, { viewCount: 'desc' }, { publishedAt: 'desc' }],
      });

      // Group articles by category
      const articlesByCategory = articles.reduce(
        (acc, article) => {
          if (!acc[article.category]) {
            acc[article.category] = [];
          }
          acc[article.category].push(article);
          return acc;
        },
        {} as Record<string, typeof articles>
      );

      // Get related articles if requested
      let relatedArticles: typeof articles = [];
      if (includeRelated && matchedCondition) {
        // Find articles that might be related but not directly about the condition
        const relatedKeywords = matchedCondition.keywords.slice(0, 3);
        relatedArticles = await ctx.prisma.educationArticle.findMany({
          where: {
            isPublished: true,
            id: { notIn: articles.map((a) => a.id) },
            OR: [
              { tags: { hasSome: relatedKeywords } },
              { category: { in: ['Prevention', 'Self Care', 'Lifestyle Modifications'] } },
            ],
          },
          take: 5,
          orderBy: { viewCount: 'desc' },
        });
      }

      return {
        condition: matchedCondition
          ? {
              key: conditionKey,
              name: matchedCondition.name,
              icd10Codes: matchedCondition.icd10Codes,
            }
          : {
              key: condition,
              name: condition,
              icd10Codes: [],
            },
        articles,
        articlesByCategory,
        relatedArticles,
        totalCount: articles.length,
        categories: Object.keys(articlesByCategory),
        availableLanguages: [...new Set(articles.map((a) => a.language))],
        availableReadingLevels: [...new Set(articles.map((a) => a.readingLevel))],
      };
    }),

  // List all articles with filtering and pagination
  list: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        readingLevel: readingLevelSchema.optional(),
        language: languageSchema.optional(),
        search: z.string().optional(),
        publishedOnly: z.boolean().default(true),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const {
        category,
        readingLevel,
        language,
        search,
        publishedOnly,
        limit,
        offset,
      } = input ?? {};

      const where: Record<string, unknown> = {};

      if (publishedOnly !== false) {
        where.isPublished = true;
      }

      if (category) {
        where.category = category;
      }

      if (readingLevel) {
        where.readingLevel = readingLevel;
      }

      if (language) {
        where.language = language;
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { summary: { contains: search, mode: 'insensitive' } },
              { keywords: { hasSome: [search.toLowerCase()] } },
              { tags: { hasSome: [search.toLowerCase()] } },
            ],
          },
        ];
      }

      const [articles, total] = await Promise.all([
        ctx.prisma.educationArticle.findMany({
          where,
          orderBy: [{ category: 'asc' }, { title: 'asc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.educationArticle.count({ where }),
      ]);

      return {
        articles,
        total,
        limit: limit ?? 20,
        offset: offset ?? 0,
        hasMore: (offset ?? 0) + articles.length < total,
      };
    }),

  // Get a single article by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const article = await ctx.prisma.educationArticle.findFirst({
        where: {
          id: input.id,
          isPublished: true,
        },
      });

      if (!article) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Article not found',
        });
      }

      // Increment view count
      await ctx.prisma.educationArticle.update({
        where: { id: input.id },
        data: { viewCount: { increment: 1 } },
      });

      return article;
    }),

  // Get available categories
  getCategories: protectedProcedure.query(async ({ ctx }) => {
    const categoryCounts = await ctx.prisma.educationArticle.groupBy({
      by: ['category'],
      where: { isPublished: true },
      _count: { category: true },
    });

    return Object.entries(ARTICLE_CATEGORIES).map(([key, label]) => {
      const found = categoryCounts.find((c) => c.category === label);
      return {
        key,
        label,
        count: found?._count?.category ?? 0,
      };
    });
  }),

  // Get available languages
  getLanguages: protectedProcedure.query(async ({ ctx }) => {
    const languages = await ctx.prisma.educationArticle.groupBy({
      by: ['language'],
      where: { isPublished: true },
      _count: { language: true },
    });

    const languageLabels: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      zh: 'Chinese',
      vi: 'Vietnamese',
      ko: 'Korean',
      ru: 'Russian',
      ar: 'Arabic',
      pt: 'Portuguese',
      fr: 'French',
      de: 'German',
    };

    return languages.map((l) => ({
      code: l.language,
      name: languageLabels[l.language] ?? l.language,
      count: l._count.language,
    }));
  }),

  // Get common conditions list
  getConditions: protectedProcedure.query(async () => {
    return Object.entries(COMMON_CONDITIONS).map(([key, cond]) => ({
      key,
      name: cond.name,
      icd10Codes: cond.icd10Codes,
      keywords: cond.keywords,
    }));
  }),

  // Get FAQ for a condition
  getFAQ: protectedProcedure
    .input(
      z.object({
        condition: z.string().min(1),
        language: languageSchema.optional(),
        readingLevel: readingLevelSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { condition, language, readingLevel } = input;

      const where: Record<string, unknown> = {
        isPublished: true,
        category: ARTICLE_CATEGORIES.FAQ,
        OR: [
          { relatedConditions: { has: condition } },
          { keywords: { has: condition.toLowerCase() } },
          { title: { contains: condition, mode: 'insensitive' } },
        ],
      };

      if (language) {
        where.language = language;
      }

      if (readingLevel) {
        where.readingLevel = readingLevel;
      }

      const faqArticles = await ctx.prisma.educationArticle.findMany({
        where,
        orderBy: { viewCount: 'desc' },
      });

      return faqArticles;
    }),

  // Get recovery timeline for a condition
  getRecoveryTimeline: protectedProcedure
    .input(
      z.object({
        condition: z.string().min(1),
        language: languageSchema.optional(),
        readingLevel: readingLevelSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { condition, language, readingLevel } = input;

      const where: Record<string, unknown> = {
        isPublished: true,
        category: ARTICLE_CATEGORIES.RECOVERY_TIMELINE,
        OR: [
          { relatedConditions: { has: condition } },
          { keywords: { has: condition.toLowerCase() } },
          { title: { contains: condition, mode: 'insensitive' } },
        ],
      };

      if (language) {
        where.language = language;
      }

      if (readingLevel) {
        where.readingLevel = readingLevel;
      }

      const timelineArticles = await ctx.prisma.educationArticle.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: 1,
      });

      return timelineArticles[0] ?? null;
    }),

  // Get lifestyle modifications for a condition
  getLifestyleGuidance: protectedProcedure
    .input(
      z.object({
        condition: z.string().min(1),
        language: languageSchema.optional(),
        readingLevel: readingLevelSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { condition, language, readingLevel } = input;

      const where: Record<string, unknown> = {
        isPublished: true,
        category: ARTICLE_CATEGORIES.LIFESTYLE_MODIFICATIONS,
        OR: [
          { relatedConditions: { has: condition } },
          { keywords: { has: condition.toLowerCase() } },
          { title: { contains: condition, mode: 'insensitive' } },
        ],
      };

      if (language) {
        where.language = language;
      }

      if (readingLevel) {
        where.readingLevel = readingLevel;
      }

      const lifestyleArticles = await ctx.prisma.educationArticle.findMany({
        where,
        orderBy: { viewCount: 'desc' },
      });

      return lifestyleArticles;
    }),

  // Prescribe an article to a patient
  prescribeArticle: protectedProcedure
    .input(
      z.object({
        articleId: z.string(),
        patientId: z.string(),
        encounterId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { articleId, patientId, encounterId } = input;

      // Verify article exists
      const article = await ctx.prisma.educationArticle.findUnique({
        where: { id: articleId },
      });

      if (!article) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Article not found',
        });
      }

      // Verify patient exists and belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Verify encounter if provided
      if (encounterId) {
        const encounter = await ctx.prisma.encounter.findFirst({
          where: {
            id: encounterId,
            patientId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!encounter) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Encounter not found',
          });
        }
      }

      // Get provider
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only providers can prescribe education articles',
        });
      }

      // Check if already prescribed
      const existing = await ctx.prisma.prescribedArticle.findFirst({
        where: {
          articleId,
          patientId,
          isRead: false,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Article already prescribed to this patient',
        });
      }

      const prescribedArticle = await ctx.prisma.prescribedArticle.create({
        data: {
          articleId,
          patientId,
          prescriberId: provider.id,
          encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          article: true,
          patient: {
            include: {
              demographics: true,
            },
          },
        },
      });

      await auditLog('CREATE', 'PrescribedArticle', {
        entityId: prescribedArticle.id,
        changes: { articleId, patientId, encounterId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return prescribedArticle;
    }),

  // Get prescribed articles for a patient
  getPatientArticles: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        unreadOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, unreadOnly } = input;

      const where: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (unreadOnly) {
        where.isRead = false;
      }

      const prescribedArticles = await ctx.prisma.prescribedArticle.findMany({
        where,
        include: {
          article: true,
          prescriber: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { assignedAt: 'desc' },
      });

      return prescribedArticles;
    }),

  // Mark article as read (for patient portal)
  markArticleRead: protectedProcedure
    .input(z.object({ prescribedArticleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { prescribedArticleId } = input;

      const prescribedArticle = await ctx.prisma.prescribedArticle.findFirst({
        where: {
          id: prescribedArticleId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!prescribedArticle) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prescribed article not found',
        });
      }

      const updated = await ctx.prisma.prescribedArticle.update({
        where: { id: prescribedArticleId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
        include: {
          article: true,
        },
      });

      return updated;
    }),

  // Create education article (admin only)
  create: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, 'Title is required'),
        content: z.string().min(1, 'Content is required'),
        summary: z.string().optional(),
        category: z.string().min(1, 'Category is required'),
        readingLevel: readingLevelSchema.default('STANDARD'),
        language: languageSchema.default('en'),
        relatedConditions: z.array(z.string()).default([]),
        keywords: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
        featuredImageUrl: z.string().url().optional().nullable(),
        attachments: z.any().optional(),
        authorName: z.string().optional(),
        isPublished: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        title,
        content,
        summary,
        category,
        readingLevel,
        language,
        relatedConditions,
        keywords,
        tags,
        featuredImageUrl,
        attachments,
        authorName,
        isPublished,
      } = input;

      const article = await ctx.prisma.educationArticle.create({
        data: {
          title,
          content,
          summary,
          category,
          readingLevel,
          language,
          relatedConditions,
          keywords: keywords.map((k) => k.toLowerCase()),
          tags: tags.map((t) => t.toLowerCase()),
          featuredImageUrl,
          attachments,
          authorName,
          isPublished,
          publishedAt: isPublished ? new Date() : null,
        },
      });

      await auditLog('CREATE', 'EducationArticle', {
        entityId: article.id,
        changes: { title, category, language, readingLevel },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return article;
    }),

  // Update education article (admin only)
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        summary: z.string().nullable().optional(),
        category: z.string().optional(),
        readingLevel: readingLevelSchema.optional(),
        language: languageSchema.optional(),
        relatedConditions: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        featuredImageUrl: z.string().url().nullable().optional(),
        attachments: z.any().optional(),
        authorName: z.string().nullable().optional(),
        isPublished: z.boolean().optional(),
        lastReviewedAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, keywords, tags, isPublished, ...updateData } = input;

      const existing = await ctx.prisma.educationArticle.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Article not found',
        });
      }

      // Prepare update data
      const data: Record<string, unknown> = { ...updateData };

      if (keywords !== undefined) {
        data.keywords = keywords.map((k) => k.toLowerCase());
      }

      if (tags !== undefined) {
        data.tags = tags.map((t) => t.toLowerCase());
      }

      if (isPublished !== undefined) {
        data.isPublished = isPublished;
        if (isPublished && !existing.publishedAt) {
          data.publishedAt = new Date();
        }
      }

      const article = await ctx.prisma.educationArticle.update({
        where: { id },
        data,
      });

      await auditLog('UPDATE', 'EducationArticle', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return article;
    }),

  // Delete education article (admin only)
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.educationArticle.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: { prescribedArticles: true },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Article not found',
        });
      }

      // Check if article is in use
      if (existing._count.prescribedArticles > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete article that has been prescribed ${existing._count.prescribedArticles} time(s). Unpublish it instead.`,
        });
      }

      await auditLog('DELETE', 'EducationArticle', {
        entityId: input.id,
        changes: { title: existing.title },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await ctx.prisma.educationArticle.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // Seed common chiropractic education content (admin only)
  seedContent: adminProcedure.mutation(async ({ ctx }) => {
    const standardArticles = [
      // Low Back Pain
      {
        title: 'Understanding Low Back Pain',
        category: ARTICLE_CATEGORIES.CONDITION_OVERVIEW,
        summary: 'An overview of low back pain, its causes, and how chiropractic care can help.',
        content: `
# Understanding Low Back Pain

Low back pain is one of the most common reasons people seek chiropractic care. It affects approximately 80% of adults at some point in their lives.

## What Causes Low Back Pain?

Low back pain can result from many factors:

- **Muscle or ligament strain** from heavy lifting or awkward movements
- **Bulging or herniated discs** that press on nerves
- **Arthritis** that affects the spine
- **Skeletal irregularities** like scoliosis
- **Osteoporosis** causing compression fractures
- **Poor posture** over time

## Common Symptoms

- Dull, aching pain in the lower back
- Pain that radiates down the leg (sciatica)
- Stiffness and decreased range of motion
- Muscle spasms
- Difficulty standing straight

## How Chiropractic Care Helps

Chiropractic treatment focuses on the relationship between the spine and nervous system. Treatment may include:

1. **Spinal adjustments** to restore proper alignment
2. **Soft tissue therapy** to relax tight muscles
3. **Exercise prescription** to strengthen supporting muscles
4. **Posture and ergonomic advice** to prevent recurrence
5. **Lifestyle modifications** for long-term management

## When to Seek Help

Consult your chiropractor if you experience:
- Pain lasting more than a few days
- Pain that interrupts sleep
- Numbness or tingling in legs
- Weakness in legs or feet
- Loss of bladder or bowel control (emergency)
        `.trim(),
        relatedConditions: ['M54.5', 'M54.50', 'M54.51', 'M54.52', 'low back pain', 'lumbar'],
        keywords: ['low back', 'lumbar', 'back pain', 'lumbago', 'spine'],
        tags: ['back pain', 'spine', 'chiropractic'],
        readingLevel: 'STANDARD' as ReadingLevel,
        language: 'en',
      },
      {
        title: 'Recovery Timeline for Low Back Pain',
        category: ARTICLE_CATEGORIES.RECOVERY_TIMELINE,
        summary: 'What to expect during your recovery from low back pain.',
        content: `
# Recovery Timeline for Low Back Pain

Recovery time varies based on the cause and severity of your condition. Here's a general timeline for what to expect.

## Acute Low Back Pain (Recent Onset)

**Week 1-2:**
- Focus on pain management and reducing inflammation
- Light activity as tolerated
- Ice/heat therapy as recommended
- Initial chiropractic adjustments

**Week 2-4:**
- Gradual improvement in pain levels
- Begin gentle exercises and stretches
- Continue regular chiropractic care
- Return to light daily activities

**Week 4-8:**
- Significant improvement expected
- Progressive strengthening exercises
- Return to most normal activities
- Preventive care and maintenance

## Chronic Low Back Pain

For pain lasting more than 3 months, recovery may take longer:

**Month 1-3:**
- Comprehensive evaluation and treatment plan
- Regular chiropractic care
- Exercise rehabilitation program
- Lifestyle modifications

**Month 3-6:**
- Continued progress with treatment
- Building core strength and flexibility
- Learning self-management techniques
- Gradually spacing out treatment visits

**Ongoing:**
- Maintenance care as needed
- Continued exercise program
- Ergonomic improvements at work/home
- Periodic check-ups

## Factors Affecting Recovery

- Overall health and fitness level
- Compliance with treatment plan
- Work and activity demands
- Presence of other health conditions
- Psychological factors (stress, mood)

## Tips for Faster Recovery

1. Follow your treatment plan consistently
2. Stay active within pain limits
3. Complete prescribed exercises
4. Maintain good posture
5. Get adequate sleep
6. Manage stress
7. Avoid prolonged sitting
        `.trim(),
        relatedConditions: ['M54.5', 'M54.50', 'M54.51', 'M54.52', 'low back pain'],
        keywords: ['recovery', 'timeline', 'low back', 'healing'],
        tags: ['recovery', 'timeline', 'back pain'],
        readingLevel: 'STANDARD' as ReadingLevel,
        language: 'en',
      },
      {
        title: 'Lifestyle Changes for Low Back Pain',
        category: ARTICLE_CATEGORIES.LIFESTYLE_MODIFICATIONS,
        summary: 'Simple lifestyle changes that can help manage and prevent low back pain.',
        content: `
# Lifestyle Changes for Low Back Pain

Making simple changes to your daily routine can significantly impact your back health.

## Ergonomic Improvements

### At Work
- Adjust chair height so feet are flat on floor
- Keep computer monitor at eye level
- Use a lumbar support cushion
- Take breaks every 30-45 minutes
- Consider a standing desk option

### At Home
- Choose a supportive mattress
- Use pillows to support your spine while sleeping
- Avoid soft, sagging furniture
- Keep frequently used items at waist height

## Exercise and Movement

### Daily Habits
- Walk for at least 20-30 minutes daily
- Stretch in the morning and evening
- Avoid prolonged sitting or standing
- Practice good lifting technique

### Recommended Activities
- Swimming
- Walking
- Yoga
- Pilates
- Cycling (with proper posture)

### Activities to Modify
- High-impact sports
- Heavy weightlifting
- Repetitive bending
- Long car rides (take breaks)

## Nutrition and Weight

- Maintain a healthy weight
- Eat anti-inflammatory foods
- Stay hydrated
- Consider supplements (consult your provider)

## Stress Management

Stress can worsen back pain. Try:
- Deep breathing exercises
- Meditation or mindfulness
- Regular exercise
- Adequate sleep
- Social connection

## Sleep Habits

- Aim for 7-9 hours of sleep
- Sleep on your side with pillow between knees
- Or on your back with pillow under knees
- Avoid sleeping on your stomach
- Keep a consistent sleep schedule
        `.trim(),
        relatedConditions: ['M54.5', 'M54.50', 'M54.51', 'M54.52', 'low back pain'],
        keywords: ['lifestyle', 'ergonomic', 'posture', 'exercise', 'prevention'],
        tags: ['lifestyle', 'prevention', 'self-care'],
        readingLevel: 'STANDARD' as ReadingLevel,
        language: 'en',
      },
      {
        title: 'Frequently Asked Questions: Low Back Pain',
        category: ARTICLE_CATEGORIES.FAQ,
        summary: 'Common questions about low back pain answered.',
        content: `
# Frequently Asked Questions: Low Back Pain

## General Questions

**Q: Is it normal for my back to crack during an adjustment?**
A: Yes, the popping or cracking sound is simply gas being released from the joints, similar to cracking your knuckles. It's harmless and often indicates a successful adjustment.

**Q: How often should I see my chiropractor for back pain?**
A: Treatment frequency depends on your condition. Initially, 2-3 visits per week may be recommended. As you improve, visits typically decrease to once weekly, then monthly for maintenance.

**Q: Can I exercise with back pain?**
A: Generally, staying active is better than complete rest. However, avoid high-impact activities and heavy lifting. Walking, swimming, and gentle stretching are usually safe. Follow your provider's specific recommendations.

**Q: Should I use ice or heat on my back?**
A: For acute pain (first 48-72 hours), ice helps reduce inflammation. After that, heat can help relax muscles. Your provider can give specific recommendations for your situation.

## Treatment Questions

**Q: How long until I feel better?**
A: Many patients notice improvement within the first few treatments. However, complete resolution depends on the cause and severity of your condition. Most acute cases improve significantly within 4-6 weeks.

**Q: Is chiropractic care safe?**
A: Yes, when performed by a licensed chiropractor, spinal adjustments are very safe. Serious complications are extremely rare. Your chiropractor will screen for any conditions that might require modified treatment.

**Q: Do I need X-rays?**
A: Not always. Your chiropractor will determine if imaging is necessary based on your history and examination. X-rays are typically recommended for trauma, certain symptoms, or chronic conditions.

## Prevention Questions

**Q: How can I prevent my back pain from returning?**
A: Maintain regular exercise, practice good posture, use proper lifting techniques, manage your weight, and consider periodic chiropractic maintenance care.

**Q: Is sitting bad for my back?**
A: Prolonged sitting can contribute to back problems. If you have a desk job, take regular breaks, use ergonomic furniture, and maintain good posture.
        `.trim(),
        relatedConditions: ['M54.5', 'M54.50', 'M54.51', 'M54.52', 'low back pain'],
        keywords: ['faq', 'questions', 'low back', 'answers'],
        tags: ['faq', 'questions', 'back pain'],
        readingLevel: 'STANDARD' as ReadingLevel,
        language: 'en',
      },

      // Neck Pain
      {
        title: 'Understanding Neck Pain',
        category: ARTICLE_CATEGORIES.CONDITION_OVERVIEW,
        summary: 'An overview of neck pain, its causes, and treatment options.',
        content: `
# Understanding Neck Pain

Neck pain is extremely common and can significantly impact daily life. Most neck pain responds well to conservative care.

## What Causes Neck Pain?

Common causes include:

- **Poor posture** especially from computer or phone use
- **Muscle strain** from sleeping position or repetitive movements
- **Degenerative disc disease** age-related changes
- **Herniated cervical disc** disc pressing on nerves
- **Whiplash** from car accidents or sports
- **Arthritis** in the neck joints
- **Pinched nerve** from bone spurs or disc problems

## Common Symptoms

- Stiff neck
- Sharp or aching pain
- Headaches starting at the base of skull
- Radiating pain into shoulders or arms
- Numbness or tingling in arms or hands
- Muscle tightness and spasms
- Difficulty turning head

## How Chiropractic Care Helps

Treatment approaches include:

1. **Cervical adjustments** to restore proper motion
2. **Soft tissue therapy** for tight muscles
3. **Stretching and strengthening exercises**
4. **Posture correction and ergonomic advice**
5. **Lifestyle modifications**

## Red Flags - Seek Immediate Care If:

- Severe pain after injury
- Pain with fever
- Numbness or weakness in arms
- Loss of bladder or bowel control
- Pain with unexplained weight loss
        `.trim(),
        relatedConditions: ['M54.2', 'M54.20', 'M54.21', 'M54.22', 'neck pain', 'cervical'],
        keywords: ['neck', 'cervical', 'neck pain', 'stiff neck'],
        tags: ['neck pain', 'cervical', 'chiropractic'],
        readingLevel: 'STANDARD' as ReadingLevel,
        language: 'en',
      },

      // Sciatica
      {
        title: 'Understanding Sciatica',
        category: ARTICLE_CATEGORIES.CONDITION_OVERVIEW,
        summary: 'Learn about sciatica - causes, symptoms, and treatment options.',
        content: `
# Understanding Sciatica

Sciatica refers to pain that travels along the path of the sciatic nerve, which runs from the lower back through the hips and down each leg.

## What Causes Sciatica?

Sciatica occurs when the sciatic nerve is compressed. Common causes include:

- **Herniated disc** most common cause
- **Bone spurs** from spinal arthritis
- **Spinal stenosis** narrowing of the spinal canal
- **Piriformis syndrome** muscle compressing the nerve
- **Spondylolisthesis** vertebra slipping forward

## Symptoms of Sciatica

- Pain radiating from lower back to buttock and down leg
- Usually affects only one side
- Sharp, burning, or shooting pain
- Numbness or tingling in the leg or foot
- Weakness in the affected leg
- Pain worse with sitting
- Difficulty moving the leg or foot

## How Chiropractic Care Helps

Treatment focuses on relieving nerve pressure:

1. **Spinal adjustments** to reduce disc pressure
2. **Flexion-distraction technique** gentle stretching
3. **Soft tissue therapy** for muscle tension
4. **Specific exercises** for disc and nerve problems
5. **Ice/heat therapy** for inflammation

## Self-Care Tips

- Avoid prolonged sitting
- Use ice for acute flare-ups
- Gentle walking as tolerated
- Avoid bending and lifting
- Sleep with pillow under knees

## When to Get Emergency Care

- Sudden severe weakness in leg
- Loss of bladder or bowel control
- Numbness in groin area ("saddle anesthesia")
        `.trim(),
        relatedConditions: ['M54.3', 'M54.30', 'M54.31', 'M54.32', 'sciatica'],
        keywords: ['sciatica', 'leg pain', 'radiculopathy', 'nerve pain', 'sciatic'],
        tags: ['sciatica', 'nerve pain', 'leg pain'],
        readingLevel: 'STANDARD' as ReadingLevel,
        language: 'en',
      },

      // Headache
      {
        title: 'Chiropractic Care for Headaches',
        category: ARTICLE_CATEGORIES.CONDITION_OVERVIEW,
        summary: 'How chiropractic treatment can help manage headaches and migraines.',
        content: `
# Chiropractic Care for Headaches

Many headaches originate from problems in the neck and can be effectively treated with chiropractic care.

## Types of Headaches We Treat

### Cervicogenic Headaches
- Originate from the neck
- Pain starts at base of skull
- May spread to forehead, temples, or around eyes
- Often worse with neck movement
- Very responsive to chiropractic care

### Tension Headaches
- Most common headache type
- Band-like pressure around head
- Associated with muscle tension in neck/shoulders
- Often related to stress and posture

### Migraines
- Intense, throbbing pain
- Usually one-sided
- May include nausea, light/sound sensitivity
- Chiropractic can help reduce frequency and intensity

## How Chiropractic Helps

1. **Spinal manipulation** to improve neck function
2. **Soft tissue therapy** for tight muscles
3. **Posture correction** to reduce strain
4. **Lifestyle advice** to identify triggers
5. **Exercise prescription** to prevent recurrence

## Common Headache Triggers

- Poor posture (forward head position)
- Stress and tension
- Prolonged screen time
- Dehydration
- Poor sleep
- Skipping meals
- Certain foods
- Weather changes

## Prevention Tips

- Maintain good posture
- Take regular breaks from screens
- Stay hydrated
- Exercise regularly
- Manage stress
- Get adequate sleep
- Limit alcohol and caffeine
        `.trim(),
        relatedConditions: ['G43', 'G43.9', 'R51', 'R51.0', 'R51.9', 'headache', 'migraine'],
        keywords: ['headache', 'migraine', 'tension headache', 'cervicogenic'],
        tags: ['headache', 'migraine', 'neck'],
        readingLevel: 'STANDARD' as ReadingLevel,
        language: 'en',
      },

      // Simple reading level example
      {
        title: 'Low Back Pain - Easy to Read',
        category: ARTICLE_CATEGORIES.CONDITION_OVERVIEW,
        summary: 'Simple explanation of low back pain.',
        content: `
# Low Back Pain

## What is it?
Pain in your lower back. Most people get it at some point.

## Why does it happen?
- Lifting heavy things the wrong way
- Sitting too long
- Bad posture
- Getting older
- Injury

## What does it feel like?
- Aching or stiff back
- Hard to stand up straight
- Hard to move
- Sometimes pain goes down your leg

## How we help
- Adjust your spine
- Work on tight muscles
- Teach you exercises
- Show you how to sit and stand better

## What you can do
- Keep moving
- Use ice or heat
- Do your exercises
- Sit and stand with good posture
- See us regularly

## When to call us right away
- Very bad pain
- Numbness in legs
- Can't control bladder or bowels
        `.trim(),
        relatedConditions: ['M54.5', 'M54.50', 'M54.51', 'M54.52', 'low back pain'],
        keywords: ['low back', 'simple', 'easy'],
        tags: ['simple', 'back pain'],
        readingLevel: 'SIMPLE' as ReadingLevel,
        language: 'en',
      },

      // Spanish translation example
      {
        title: 'Entendiendo el Dolor de Espalda Baja',
        category: ARTICLE_CATEGORIES.CONDITION_OVERVIEW,
        summary: 'Una descripción del dolor de espalda baja y cómo la quiropráctica puede ayudar.',
        content: `
# Entendiendo el Dolor de Espalda Baja

El dolor de espalda baja es una de las razones más comunes por las que las personas buscan atención quiropráctica.

## ¿Qué Causa el Dolor de Espalda Baja?

- Distensión muscular o de ligamentos
- Discos herniados o abultados
- Artritis en la columna
- Mala postura
- Lesiones

## Síntomas Comunes

- Dolor sordo y persistente en la espalda baja
- Dolor que se irradia hacia la pierna
- Rigidez y dificultad para moverse
- Espasmos musculares
- Dificultad para mantenerse erguido

## Cómo Ayuda la Quiropráctica

1. Ajustes espinales para restaurar la alineación
2. Terapia de tejidos blandos
3. Ejercicios recetados
4. Consejos de postura y ergonomía
5. Modificaciones del estilo de vida

## Cuándo Buscar Ayuda

Consulte a su quiropráctico si experimenta:
- Dolor que dura más de unos días
- Dolor que interrumpe el sueño
- Entumecimiento u hormigueo en las piernas
- Debilidad en piernas o pies
        `.trim(),
        relatedConditions: ['M54.5', 'M54.50', 'M54.51', 'M54.52', 'low back pain'],
        keywords: ['espalda', 'lumbar', 'dolor', 'spanish'],
        tags: ['spanish', 'back pain', 'espalda'],
        readingLevel: 'STANDARD' as ReadingLevel,
        language: 'es',
      },
    ];

    let created = 0;
    let skipped = 0;

    for (const article of standardArticles) {
      // Check if already exists
      const existing = await ctx.prisma.educationArticle.findFirst({
        where: {
          title: article.title,
          language: article.language,
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.prisma.educationArticle.create({
        data: {
          ...article,
          isPublished: true,
          publishedAt: new Date(),
          authorName: 'ChiroFlow Team',
        },
      });
      created++;
    }

    await auditLog('CREATE', 'EducationArticle', {
      changes: {
        action: 'seed_content',
        created,
        skipped,
        total: standardArticles.length,
      },
      userId: ctx.user.id,
      organizationId: ctx.user.organizationId,
    });

    return {
      success: true,
      created,
      skipped,
      total: standardArticles.length,
    };
  }),
});
