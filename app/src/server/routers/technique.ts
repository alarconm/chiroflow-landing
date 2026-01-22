import { z } from 'zod';
import { router, protectedProcedure, providerProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { TechniqueCategory } from '@prisma/client';

// Validation schemas
const techniqueCategorySchema = z.enum(['MANUAL', 'INSTRUMENT', 'TABLE_ASSISTED', 'LOW_FORCE']);

export const techniqueRouter = router({
  // List all techniques with filtering by category
  list: protectedProcedure
    .input(
      z.object({
        category: techniqueCategorySchema.optional(),
        search: z.string().optional(),
        includeInactive: z.boolean().default(false),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { category, search, includeInactive, limit, offset } = input ?? {};

      const where: Record<string, unknown> = {
        OR: [
          { isSystem: true }, // System techniques available to all
          { organizationId: ctx.user.organizationId }, // Org-specific techniques
        ],
      };

      if (category) {
        where.category = category;
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      if (!includeInactive) {
        where.isActive = true;
      }

      const [techniques, total] = await Promise.all([
        ctx.prisma.technique.findMany({
          where,
          orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.technique.count({ where }),
      ]);

      // Group by category
      const byCategory = techniques.reduce(
        (acc, tech) => {
          if (!acc[tech.category]) {
            acc[tech.category] = [];
          }
          acc[tech.category].push(tech);
          return acc;
        },
        {} as Record<TechniqueCategory, typeof techniques>
      );

      return {
        techniques,
        byCategory,
        total,
        limit: limit ?? 50,
        offset: offset ?? 0,
        hasMore: (offset ?? 0) + techniques.length < total,
      };
    }),

  // Get technique details with contraindications
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const technique = await ctx.prisma.technique.findFirst({
        where: {
          id: input.id,
          OR: [
            { isSystem: true },
            { organizationId: ctx.user.organizationId },
          ],
        },
        include: {
          _count: {
            select: {
              adjustments: true,
              providerFavorites: true,
            },
          },
        },
      });

      if (!technique) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Technique not found',
        });
      }

      return technique;
    }),

  // Add custom technique (admin only)
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Name is required'),
        category: techniqueCategorySchema,
        description: z.string().optional(),
        indications: z.array(z.string()).default([]),
        contraindications: z.array(z.string()).default([]),
        instructions: z.string().optional(),
        imageUrl: z.string().url().optional().nullable(),
        videoUrl: z.string().url().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        name,
        category,
        description,
        indications,
        contraindications,
        instructions,
        imageUrl,
        videoUrl,
      } = input;

      // Check for duplicate name within organization
      const existing = await ctx.prisma.technique.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          organizationId: ctx.user.organizationId,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A technique with this name already exists',
        });
      }

      const technique = await ctx.prisma.technique.create({
        data: {
          name,
          category,
          description,
          indications,
          contraindications,
          instructions,
          imageUrl,
          videoUrl,
          isSystem: false,
          isActive: true,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'Technique', {
        entityId: technique.id,
        changes: { name, category },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return technique;
    }),

  // Update technique (admin only, can only update org-specific techniques)
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        category: techniqueCategorySchema.optional(),
        description: z.string().nullable().optional(),
        indications: z.array(z.string()).optional(),
        contraindications: z.array(z.string()).optional(),
        instructions: z.string().nullable().optional(),
        imageUrl: z.string().url().nullable().optional(),
        videoUrl: z.string().url().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify technique exists and is org-specific (can't edit system techniques)
      const existing = await ctx.prisma.technique.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
          isSystem: false,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Technique not found or cannot be modified (system technique)',
        });
      }

      // Check for duplicate name if updating name
      if (updateData.name && updateData.name !== existing.name) {
        const duplicate = await ctx.prisma.technique.findFirst({
          where: {
            name: { equals: updateData.name, mode: 'insensitive' },
            organizationId: ctx.user.organizationId,
            id: { not: id },
          },
        });

        if (duplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A technique with this name already exists',
          });
        }
      }

      const technique = await ctx.prisma.technique.update({
        where: { id },
        data: updateData,
      });

      await auditLog('UPDATE', 'Technique', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return technique;
    }),

  // Delete technique (admin only, can only delete org-specific techniques)
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.technique.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
          isSystem: false,
        },
        include: {
          _count: {
            select: { adjustments: true },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Technique not found or cannot be deleted (system technique)',
        });
      }

      // Check if technique is in use
      if (existing._count.adjustments > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete technique that has been used in ${existing._count.adjustments} adjustment(s). Deactivate it instead.`,
        });
      }

      await auditLog('DELETE', 'Technique', {
        entityId: input.id,
        changes: { name: existing.name, category: existing.category },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await ctx.prisma.technique.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // Get categories with counts
  getCategories: protectedProcedure.query(async ({ ctx }) => {
    const categories = await ctx.prisma.technique.groupBy({
      by: ['category'],
      where: {
        isActive: true,
        OR: [
          { isSystem: true },
          { organizationId: ctx.user.organizationId },
        ],
      },
      _count: { category: true },
    });

    const categoryLabels: Record<TechniqueCategory, string> = {
      MANUAL: 'Manual',
      INSTRUMENT: 'Instrument-assisted',
      TABLE_ASSISTED: 'Table-assisted',
      LOW_FORCE: 'Low-force',
    };

    return categories.map((c) => ({
      category: c.category,
      label: categoryLabels[c.category],
      count: c._count.category,
    }));
  }),

  // Provider favorites management
  favorites: router({
    // Get provider's favorite techniques
    list: providerProcedure.query(async ({ ctx }) => {
      // Get provider record
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        return [];
      }

      const favorites = await ctx.prisma.techniqueFavorite.findMany({
        where: { providerId: provider.id },
        orderBy: { displayOrder: 'asc' },
        include: {
          technique: true,
        },
      });

      return favorites.map((f) => ({
        ...f.technique,
        displayOrder: f.displayOrder,
        favoriteId: f.id,
      }));
    }),

    // Add technique to favorites
    add: providerProcedure
      .input(
        z.object({
          techniqueId: z.string(),
          displayOrder: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const provider = await ctx.prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider record not found',
          });
        }

        // Verify technique exists and is accessible
        const technique = await ctx.prisma.technique.findFirst({
          where: {
            id: input.techniqueId,
            isActive: true,
            OR: [
              { isSystem: true },
              { organizationId: ctx.user.organizationId },
            ],
          },
        });

        if (!technique) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Technique not found',
          });
        }

        // Check if already favorited
        const existing = await ctx.prisma.techniqueFavorite.findUnique({
          where: {
            providerId_techniqueId: {
              providerId: provider.id,
              techniqueId: input.techniqueId,
            },
          },
        });

        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Technique is already in favorites',
          });
        }

        // Get next display order if not provided
        let displayOrder = input.displayOrder;
        if (displayOrder === undefined) {
          const lastFavorite = await ctx.prisma.techniqueFavorite.findFirst({
            where: { providerId: provider.id },
            orderBy: { displayOrder: 'desc' },
          });
          displayOrder = (lastFavorite?.displayOrder ?? -1) + 1;
        }

        const favorite = await ctx.prisma.techniqueFavorite.create({
          data: {
            providerId: provider.id,
            techniqueId: input.techniqueId,
            displayOrder,
          },
          include: { technique: true },
        });

        return favorite;
      }),

    // Remove technique from favorites
    remove: providerProcedure
      .input(z.object({ techniqueId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const provider = await ctx.prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider record not found',
          });
        }

        const favorite = await ctx.prisma.techniqueFavorite.findUnique({
          where: {
            providerId_techniqueId: {
              providerId: provider.id,
              techniqueId: input.techniqueId,
            },
          },
        });

        if (!favorite) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Technique is not in favorites',
          });
        }

        await ctx.prisma.techniqueFavorite.delete({
          where: { id: favorite.id },
        });

        return { success: true };
      }),

    // Reorder favorites
    reorder: providerProcedure
      .input(
        z.object({
          orders: z.array(
            z.object({
              techniqueId: z.string(),
              displayOrder: z.number(),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const provider = await ctx.prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider record not found',
          });
        }

        await ctx.prisma.$transaction(
          input.orders.map((order) =>
            ctx.prisma.techniqueFavorite.updateMany({
              where: {
                providerId: provider.id,
                techniqueId: order.techniqueId,
              },
              data: { displayOrder: order.displayOrder },
            })
          )
        );

        return { success: true };
      }),
  }),

  // Seed standard techniques (admin only, idempotent)
  seedStandard: adminProcedure.mutation(async ({ ctx }) => {
    const standardTechniques = [
      // Manual techniques
      {
        name: 'Diversified',
        category: 'MANUAL' as TechniqueCategory,
        description: 'The most commonly used chiropractic technique, involving high-velocity, low-amplitude (HVLA) thrusts to restore proper movement and alignment.',
        indications: [
          'Joint fixation/subluxation',
          'Restricted range of motion',
          'Spinal misalignment',
          'Facet joint dysfunction',
        ],
        contraindications: [
          'Osteoporosis',
          'Bone cancer or metastasis',
          'Fracture',
          'Severe disc herniation',
          'Vertebral artery insufficiency',
          'Anticoagulant therapy',
        ],
        instructions: 'Patient positioning varies by segment. Apply HVLA thrust with specific line of drive based on listing.',
      },
      {
        name: 'Gonstead',
        category: 'MANUAL' as TechniqueCategory,
        description: 'A precise, specific technique using detailed analysis (X-ray, instrumentation, palpation) to identify subluxations and deliver specific adjustments.',
        indications: [
          'Specific vertebral subluxation',
          'Disc pathology',
          'Lower back pain',
          'Sciatica',
        ],
        contraindications: [
          'Osteoporosis',
          'Bone pathology',
          'Fracture',
          'Advanced degenerative changes',
          'Vascular compromise',
        ],
        instructions: 'Use cervical chair, knee-chest table, or side posture positions. Specific contact points and vectors based on listing.',
      },
      {
        name: 'Toggle Recoil',
        category: 'MANUAL' as TechniqueCategory,
        description: 'Upper cervical specific technique using a quick toggle thrust with immediate release.',
        indications: [
          'Atlas (C1) subluxation',
          'Axis (C2) subluxation',
          'Upper cervical syndrome',
          'Headaches',
        ],
        contraindications: [
          'Upper cervical instability',
          'Rheumatoid arthritis with C1-C2 involvement',
          'Down syndrome',
          'Vertebral artery pathology',
        ],
        instructions: 'Patient side-lying with head supported. Apply quick toggle thrust with immediate recoil (no follow-through).',
      },
      // Instrument-assisted techniques
      {
        name: 'Activator Methods',
        category: 'INSTRUMENT' as TechniqueCategory,
        description: 'Uses a spring-loaded, handheld instrument to deliver gentle, low-force impulses to the spine.',
        indications: [
          'Elderly patients',
          'Pediatric patients',
          'Acute pain',
          'Osteoporosis (mild)',
          'Patient preference for gentle care',
        ],
        contraindications: [
          'Severe osteoporosis',
          'Active infection at treatment site',
          'Unstable fracture',
        ],
        instructions: 'Use leg length analysis and isolation tests to identify subluxations. Apply Activator at specific contact point with appropriate force setting.',
      },
      {
        name: 'Impulse Adjusting',
        category: 'INSTRUMENT' as TechniqueCategory,
        description: 'Electronic instrument-assisted adjusting that delivers multiple rapid impulses for joint correction.',
        indications: [
          'Joint dysfunction',
          'Soft tissue conditions',
          'Elderly patients',
          'Post-surgical spine',
        ],
        contraindications: [
          'Pacemaker (near device)',
          'Active infection',
          'Unstable fracture',
        ],
        instructions: 'Select appropriate force setting. Apply to contact point with proper angle. Multiple impulse settings available.',
      },
      // Table-assisted techniques
      {
        name: 'Thompson Drop',
        category: 'TABLE_ASSISTED' as TechniqueCategory,
        description: 'Uses a segmented drop table that "drops" a short distance when the adjustment is delivered, reducing force needed.',
        indications: [
          'Full spine adjusting',
          'Pelvic dysfunction',
          'Lower back pain',
          'Patients sensitive to rotational positions',
        ],
        contraindications: [
          'Severe osteoporosis',
          'Pregnancy (certain positions)',
          'Recent abdominal surgery',
        ],
        instructions: 'Set appropriate drop tension. Patient prone. Apply thrust synchronized with table drop mechanism.',
      },
      {
        name: 'Cox Flexion-Distraction',
        category: 'TABLE_ASSISTED' as TechniqueCategory,
        description: 'A gentle, non-thrusting technique that uses a specialized table to flex and distract the spine, particularly effective for disc conditions.',
        indications: [
          'Disc herniation',
          'Disc bulge',
          'Spinal stenosis',
          'Facet syndrome',
          'Scoliosis',
          'Post-surgical disc',
        ],
        contraindications: [
          'Cauda equina syndrome',
          'Severe spondylolisthesis',
          'Abdominal aortic aneurysm',
          'Recent spinal fracture',
        ],
        instructions: 'Patient prone on flexion-distraction table. Apply slow, rhythmic flexion and lateral bending movements. Typical protocol: 20 seconds per level, 3-5 repetitions.',
      },
      // Low-force techniques
      {
        name: 'Sacro-Occipital Technique (SOT)',
        category: 'LOW_FORCE' as TechniqueCategory,
        description: 'Uses body positioning with padded blocks under the pelvis to normalize craniosacral mechanism and pelvic function.',
        indications: [
          'Pelvic torsion',
          'Cranial dysfunction',
          'TMJ disorders',
          'Chronic pain syndromes',
        ],
        contraindications: [
          'Hip replacement (certain positions)',
          'Active pelvic fracture',
          'Severe hip pathology',
        ],
        instructions: 'Identify category (I, II, or III) based on indicators. Position blocks according to category. Patient breathing assists correction.',
      },
      {
        name: 'Craniosacral Therapy',
        category: 'LOW_FORCE' as TechniqueCategory,
        description: 'Light-touch technique focusing on the craniosacral system to release restrictions and improve central nervous system function.',
        indications: [
          'Headaches/migraines',
          'TMJ dysfunction',
          'Stress-related conditions',
          'Post-concussion syndrome',
        ],
        contraindications: [
          'Acute intracranial hemorrhage',
          'Intracranial aneurysm',
          'Recent skull fracture',
        ],
        instructions: 'Apply 5 grams of pressure or less. Follow tissue release through craniosacral rhythm. Hold positions until release occurs.',
      },
      {
        name: 'Network Spinal Analysis',
        category: 'LOW_FORCE' as TechniqueCategory,
        description: 'Very light touches at specific spinal gateway points to assist the body in developing new strategies for tension release.',
        indications: [
          'Chronic stress patterns',
          'Postural distortions',
          'Wellness care',
          'Mind-body integration',
        ],
        contraindications: [
          'Patient unable to participate in care',
          'Acute trauma requiring immediate intervention',
        ],
        instructions: 'Light contacts at spinal gateway areas. Observe and follow respiratory wave. Allow body to self-organize and release tension patterns.',
      },
    ];

    let created = 0;
    let skipped = 0;

    for (const technique of standardTechniques) {
      const existing = await ctx.prisma.technique.findFirst({
        where: {
          name: technique.name,
          isSystem: true,
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.prisma.technique.create({
        data: {
          ...technique,
          isSystem: true,
          isActive: true,
          organizationId: null, // System techniques have no org
        },
      });
      created++;
    }

    await auditLog('CREATE', 'Technique', {
      changes: { action: 'seed_standard', created, skipped },
      userId: ctx.user.id,
      organizationId: ctx.user.organizationId,
    });

    return {
      success: true,
      created,
      skipped,
      total: standardTechniques.length,
    };
  }),
});
