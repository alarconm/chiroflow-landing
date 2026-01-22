import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import {
  ExerciseDifficulty,
  BodyRegion,
  ExerciseCategoryType,
} from '@prisma/client';

// Validation schemas
const exerciseDifficultySchema = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
const bodyRegionSchema = z.enum([
  'CERVICAL',
  'THORACIC',
  'LUMBAR',
  'SACRAL',
  'UPPER_EXTREMITY',
  'LOWER_EXTREMITY',
  'CORE',
  'FULL_BODY',
]);
const exerciseCategoryTypeSchema = z.enum([
  'STRETCHING',
  'STRENGTHENING',
  'MOBILITY',
  'POSTURE',
  'BALANCE',
  'STABILITY',
  'REHABILITATION',
]);

export const exerciseRouter = router({
  // List exercises with filtering by category, body region, difficulty
  list: protectedProcedure
    .input(
      z
        .object({
          categoryId: z.string().optional(),
          categoryType: exerciseCategoryTypeSchema.optional(),
          bodyRegion: bodyRegionSchema.optional(),
          difficulty: exerciseDifficultySchema.optional(),
          search: z.string().optional(),
          condition: z.string().optional(),
          includeInactive: z.boolean().default(false),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const {
        categoryId,
        categoryType,
        bodyRegion,
        difficulty,
        search,
        condition,
        includeInactive,
        limit,
        offset,
      } = input ?? {};

      const where: Record<string, unknown> = {};

      if (categoryId) {
        where.categoryId = categoryId;
      }

      if (categoryType) {
        where.category = { type: categoryType };
      }

      if (bodyRegion) {
        where.bodyRegion = bodyRegion;
      }

      if (difficulty) {
        where.difficulty = difficulty;
      }

      if (condition) {
        where.conditions = { has: condition };
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { targetMuscles: { hasSome: [search] } },
              { conditions: { hasSome: [search] } },
            ],
          },
        ];
      }

      if (!includeInactive) {
        where.isActive = true;
      }

      const [exercises, total] = await Promise.all([
        ctx.prisma.exercise.findMany({
          where,
          include: {
            category: true,
            _count: {
              select: {
                prescriptions: true,
              },
            },
          },
          orderBy: [{ name: 'asc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.exercise.count({ where }),
      ]);

      // Group by body region
      const byBodyRegion = exercises.reduce(
        (acc, exercise) => {
          if (!acc[exercise.bodyRegion]) {
            acc[exercise.bodyRegion] = [];
          }
          acc[exercise.bodyRegion].push(exercise);
          return acc;
        },
        {} as Record<BodyRegion, typeof exercises>
      );

      // Group by category
      const byCategory = exercises.reduce(
        (acc, exercise) => {
          const categoryName = exercise.category.name;
          if (!acc[categoryName]) {
            acc[categoryName] = [];
          }
          acc[categoryName].push(exercise);
          return acc;
        },
        {} as Record<string, typeof exercises>
      );

      return {
        exercises,
        byBodyRegion,
        byCategory,
        total,
        limit: limit ?? 50,
        offset: offset ?? 0,
        hasMore: (offset ?? 0) + exercises.length < total,
      };
    }),

  // Get exercise details with video and instructions
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const exercise = await ctx.prisma.exercise.findFirst({
        where: {
          id: input.id,
          isActive: true,
        },
        include: {
          category: true,
          _count: {
            select: {
              prescriptions: true,
              progressLogs: true,
            },
          },
        },
      });

      if (!exercise) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Exercise not found',
        });
      }

      return exercise;
    }),

  // Create custom exercise (admin only)
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Name is required'),
        description: z.string().min(1, 'Description is required'),
        instructions: z.string().min(1, 'Instructions are required'),
        videoUrl: z.string().url().optional().nullable(),
        imageUrl: z.string().url().optional().nullable(),
        thumbnailUrl: z.string().url().optional().nullable(),
        difficulty: exerciseDifficultySchema.default('BEGINNER'),
        bodyRegion: bodyRegionSchema,
        targetMuscles: z.array(z.string()).default([]),
        conditions: z.array(z.string()).default([]),
        defaultSets: z.number().int().positive().optional().nullable(),
        defaultReps: z.number().int().positive().optional().nullable(),
        defaultHoldTime: z.number().int().positive().optional().nullable(),
        defaultFrequency: z.string().optional().nullable(),
        equipmentRequired: z.array(z.string()).default([]),
        modifications: z.string().optional().nullable(),
        contraindications: z.string().optional().nullable(),
        precautions: z.string().optional().nullable(),
        categoryId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        name,
        description,
        instructions,
        videoUrl,
        imageUrl,
        thumbnailUrl,
        difficulty,
        bodyRegion,
        targetMuscles,
        conditions,
        defaultSets,
        defaultReps,
        defaultHoldTime,
        defaultFrequency,
        equipmentRequired,
        modifications,
        contraindications,
        precautions,
        categoryId,
      } = input;

      // Verify category exists
      const category = await ctx.prisma.exerciseCategory.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Exercise category not found',
        });
      }

      // Check for duplicate name
      const existing = await ctx.prisma.exercise.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An exercise with this name already exists',
        });
      }

      const exercise = await ctx.prisma.exercise.create({
        data: {
          name,
          description,
          instructions,
          videoUrl,
          imageUrl,
          thumbnailUrl,
          difficulty,
          bodyRegion,
          targetMuscles,
          conditions,
          defaultSets,
          defaultReps,
          defaultHoldTime,
          defaultFrequency,
          equipmentRequired,
          modifications,
          contraindications,
          precautions,
          categoryId,
          isCustom: true,
          isActive: true,
          createdBy: ctx.user.id,
        },
        include: {
          category: true,
        },
      });

      await auditLog('CREATE', 'Exercise', {
        entityId: exercise.id,
        changes: { name, difficulty, bodyRegion },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return exercise;
    }),

  // Update exercise (admin only)
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        instructions: z.string().optional(),
        videoUrl: z.string().url().nullable().optional(),
        imageUrl: z.string().url().nullable().optional(),
        thumbnailUrl: z.string().url().nullable().optional(),
        difficulty: exerciseDifficultySchema.optional(),
        bodyRegion: bodyRegionSchema.optional(),
        targetMuscles: z.array(z.string()).optional(),
        conditions: z.array(z.string()).optional(),
        defaultSets: z.number().int().positive().nullable().optional(),
        defaultReps: z.number().int().positive().nullable().optional(),
        defaultHoldTime: z.number().int().positive().nullable().optional(),
        defaultFrequency: z.string().nullable().optional(),
        equipmentRequired: z.array(z.string()).optional(),
        modifications: z.string().nullable().optional(),
        contraindications: z.string().nullable().optional(),
        precautions: z.string().nullable().optional(),
        categoryId: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify exercise exists
      const existing = await ctx.prisma.exercise.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Exercise not found',
        });
      }

      // Check for duplicate name if updating name
      if (updateData.name && updateData.name !== existing.name) {
        const duplicate = await ctx.prisma.exercise.findFirst({
          where: {
            name: { equals: updateData.name, mode: 'insensitive' },
            id: { not: id },
          },
        });

        if (duplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'An exercise with this name already exists',
          });
        }
      }

      // Verify category exists if updating
      if (updateData.categoryId) {
        const category = await ctx.prisma.exerciseCategory.findUnique({
          where: { id: updateData.categoryId },
        });

        if (!category) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Exercise category not found',
          });
        }
      }

      const exercise = await ctx.prisma.exercise.update({
        where: { id },
        data: updateData,
        include: {
          category: true,
        },
      });

      await auditLog('UPDATE', 'Exercise', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return exercise;
    }),

  // Delete exercise (admin only)
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.exercise.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: { prescriptions: true },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Exercise not found',
        });
      }

      // Check if exercise is in use
      if (existing._count.prescriptions > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete exercise that has been prescribed ${existing._count.prescriptions} time(s). Deactivate it instead.`,
        });
      }

      await auditLog('DELETE', 'Exercise', {
        entityId: input.id,
        changes: { name: existing.name },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await ctx.prisma.exercise.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // Search exercises by name or condition
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        bodyRegion: bodyRegionSchema.optional(),
        difficulty: exerciseDifficultySchema.optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, bodyRegion, difficulty, limit } = input;

      const where: Record<string, unknown> = {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { conditions: { hasSome: [query] } },
          { targetMuscles: { hasSome: [query] } },
        ],
      };

      if (bodyRegion) {
        where.bodyRegion = bodyRegion;
      }

      if (difficulty) {
        where.difficulty = difficulty;
      }

      const exercises = await ctx.prisma.exercise.findMany({
        where,
        include: {
          category: true,
        },
        orderBy: [{ name: 'asc' }],
        take: limit,
      });

      return exercises;
    }),

  // Get categories with counts
  getCategories: protectedProcedure.query(async ({ ctx }) => {
    const categories = await ctx.prisma.exerciseCategory.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { exercises: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      description: c.description,
      iconUrl: c.iconUrl,
      exerciseCount: c._count.exercises,
    }));
  }),

  // Get body regions with counts
  getBodyRegions: protectedProcedure.query(async ({ ctx }) => {
    const regions = await ctx.prisma.exercise.groupBy({
      by: ['bodyRegion'],
      where: { isActive: true },
      _count: { bodyRegion: true },
    });

    const regionLabels: Record<BodyRegion, string> = {
      CERVICAL: 'Cervical (Neck)',
      THORACIC: 'Thoracic (Mid-Back)',
      LUMBAR: 'Lumbar (Low-Back)',
      SACRAL: 'Sacral (Pelvis)',
      UPPER_EXTREMITY: 'Upper Extremity',
      LOWER_EXTREMITY: 'Lower Extremity',
      CORE: 'Core',
      FULL_BODY: 'Full Body',
    };

    return regions.map((r) => ({
      region: r.bodyRegion,
      label: regionLabels[r.bodyRegion],
      count: r._count.bodyRegion,
    }));
  }),

  // Get difficulty levels with counts
  getDifficultyLevels: protectedProcedure.query(async ({ ctx }) => {
    const levels = await ctx.prisma.exercise.groupBy({
      by: ['difficulty'],
      where: { isActive: true },
      _count: { difficulty: true },
    });

    const difficultyLabels: Record<ExerciseDifficulty, string> = {
      BEGINNER: 'Beginner',
      INTERMEDIATE: 'Intermediate',
      ADVANCED: 'Advanced',
    };

    return levels.map((l) => ({
      difficulty: l.difficulty,
      label: difficultyLabels[l.difficulty],
      count: l._count.difficulty,
    }));
  }),

  // Create exercise category (admin only)
  createCategory: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Name is required'),
        type: exerciseCategoryTypeSchema,
        description: z.string().optional(),
        iconUrl: z.string().url().optional().nullable(),
        sortOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { name, type, description, iconUrl, sortOrder } = input;

      // Check for duplicate name
      const existing = await ctx.prisma.exerciseCategory.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A category with this name already exists',
        });
      }

      const category = await ctx.prisma.exerciseCategory.create({
        data: {
          name,
          type,
          description,
          iconUrl,
          sortOrder,
          isActive: true,
        },
      });

      await auditLog('CREATE', 'ExerciseCategory', {
        entityId: category.id,
        changes: { name, type },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return category;
    }),

  // Seed standard exercise library (admin only, idempotent)
  seedLibrary: adminProcedure.mutation(async ({ ctx }) => {
    // First, seed categories
    const standardCategories = [
      {
        name: 'Cervical Stretches',
        type: 'STRETCHING' as ExerciseCategoryType,
        description: 'Stretching exercises for the neck and upper spine',
        sortOrder: 1,
      },
      {
        name: 'Cervical Strengthening',
        type: 'STRENGTHENING' as ExerciseCategoryType,
        description: 'Strengthening exercises for the neck muscles',
        sortOrder: 2,
      },
      {
        name: 'Lumbar Stretches',
        type: 'STRETCHING' as ExerciseCategoryType,
        description: 'Stretching exercises for the lower back',
        sortOrder: 3,
      },
      {
        name: 'Lumbar Strengthening',
        type: 'STRENGTHENING' as ExerciseCategoryType,
        description: 'Strengthening exercises for the lower back and core',
        sortOrder: 4,
      },
      {
        name: 'Core Stability',
        type: 'STABILITY' as ExerciseCategoryType,
        description: 'Exercises to improve core stability and support the spine',
        sortOrder: 5,
      },
      {
        name: 'Posture Correction',
        type: 'POSTURE' as ExerciseCategoryType,
        description: 'Exercises to improve posture and alignment',
        sortOrder: 6,
      },
      {
        name: 'Thoracic Mobility',
        type: 'MOBILITY' as ExerciseCategoryType,
        description: 'Exercises to improve mid-back mobility',
        sortOrder: 7,
      },
      {
        name: 'Hip & Pelvis',
        type: 'MOBILITY' as ExerciseCategoryType,
        description: 'Exercises for hip and pelvic mobility',
        sortOrder: 8,
      },
      {
        name: 'Shoulder Rehabilitation',
        type: 'REHABILITATION' as ExerciseCategoryType,
        description: 'Rehabilitation exercises for shoulder conditions',
        sortOrder: 9,
      },
      {
        name: 'Balance & Proprioception',
        type: 'BALANCE' as ExerciseCategoryType,
        description: 'Exercises to improve balance and body awareness',
        sortOrder: 10,
      },
    ];

    let categoriesCreated = 0;
    let categoriesSkipped = 0;
    const categoryMap: Record<string, string> = {};

    for (const cat of standardCategories) {
      const existing = await ctx.prisma.exerciseCategory.findFirst({
        where: { name: cat.name },
      });

      if (existing) {
        categoryMap[cat.name] = existing.id;
        categoriesSkipped++;
        continue;
      }

      const created = await ctx.prisma.exerciseCategory.create({
        data: { ...cat, isActive: true },
      });
      categoryMap[cat.name] = created.id;
      categoriesCreated++;
    }

    // Now seed exercises
    const standardExercises = [
      // Cervical Stretches
      {
        name: 'Chin Tucks',
        categoryName: 'Cervical Stretches',
        description:
          'A fundamental exercise to strengthen deep neck flexors and improve cervical posture.',
        instructions: `1. Sit or stand with good posture, looking straight ahead.
2. Without tilting your head up or down, gently draw your chin backward as if making a "double chin."
3. Hold this position for 5-10 seconds while feeling a gentle stretch at the base of your skull.
4. Return to the starting position.
5. Repeat as prescribed.

Tips:
- Keep your eyes level with the horizon
- Think of sliding your head backward, not tilting it
- You should feel the muscles at the front of your neck working`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'CERVICAL' as BodyRegion,
        targetMuscles: ['Deep Neck Flexors', 'Longus Colli', 'Longus Capitis'],
        conditions: ['Neck Pain', 'Forward Head Posture', 'Cervical Disc Issues', 'Text Neck'],
        defaultSets: 3,
        defaultReps: 10,
        defaultHoldTime: 5,
        defaultFrequency: '3x daily',
        equipmentRequired: [],
        contraindications: 'Avoid if experiencing dizziness or severe neck pain.',
        precautions: 'Perform slowly and avoid jutting the chin forward.',
      },
      {
        name: 'Upper Trapezius Stretch',
        categoryName: 'Cervical Stretches',
        description:
          'Stretches the upper trapezius muscle to relieve neck and shoulder tension.',
        instructions: `1. Sit or stand with good posture.
2. Gently tilt your head to the right, bringing your right ear toward your right shoulder.
3. To increase the stretch, gently place your right hand on top of your head.
4. Hold for 20-30 seconds, feeling a stretch along the left side of your neck.
5. Return to center and repeat on the other side.

Tips:
- Keep both shoulders relaxed and level
- Don't rotate your head, keep facing forward
- Breathe deeply throughout the stretch`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'CERVICAL' as BodyRegion,
        targetMuscles: ['Upper Trapezius', 'Levator Scapulae'],
        conditions: ['Neck Pain', 'Tension Headaches', 'Shoulder Tension'],
        defaultSets: 2,
        defaultReps: 1,
        defaultHoldTime: 30,
        defaultFrequency: '2-3x daily',
        equipmentRequired: [],
        contraindications: null,
        precautions: 'Apply gentle pressure only. Never force the stretch.',
      },
      {
        name: 'Levator Scapulae Stretch',
        categoryName: 'Cervical Stretches',
        description:
          'Targets the levator scapulae muscle that runs from the neck to the shoulder blade.',
        instructions: `1. Sit or stand with good posture.
2. Turn your head 45 degrees to the right.
3. Gently drop your chin toward your right armpit.
4. Use your right hand to gently add pressure to increase the stretch.
5. Hold for 20-30 seconds, feeling the stretch in the left side of your neck near the shoulder blade.
6. Return to neutral and repeat on the other side.

Tips:
- Look toward your armpit, not straight down
- Keep breathing steadily
- The stretch should be felt deep in the neck`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'CERVICAL' as BodyRegion,
        targetMuscles: ['Levator Scapulae'],
        conditions: ['Neck Pain', 'Stiff Neck', 'Shoulder Blade Pain'],
        defaultSets: 2,
        defaultReps: 1,
        defaultHoldTime: 30,
        defaultFrequency: '2-3x daily',
        equipmentRequired: [],
        contraindications: null,
        precautions: 'Use gentle pressure. Stop if you feel any nerve symptoms (tingling, numbness).',
      },
      // Cervical Strengthening
      {
        name: 'Isometric Neck Flexion',
        categoryName: 'Cervical Strengthening',
        description:
          'Strengthens the front neck muscles without movement.',
        instructions: `1. Sit or stand with good posture.
2. Place your palm on your forehead.
3. Push your head forward against your hand while your hand resists.
4. Your head should not actually move - this is an isometric exercise.
5. Hold for 5-10 seconds.
6. Relax and repeat.

Tips:
- Start with light pressure and gradually increase
- Keep breathing normally
- Maintain good posture throughout`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'CERVICAL' as BodyRegion,
        targetMuscles: ['Sternocleidomastoid', 'Deep Neck Flexors'],
        conditions: ['Neck Weakness', 'Whiplash Recovery', 'Cervical Instability'],
        defaultSets: 3,
        defaultReps: 5,
        defaultHoldTime: 5,
        defaultFrequency: '2x daily',
        equipmentRequired: [],
        contraindications: 'Avoid during acute neck pain or injury.',
        precautions: 'Use submaximal effort, especially when starting.',
      },
      // Lumbar Stretches
      {
        name: 'Knee to Chest Stretch',
        categoryName: 'Lumbar Stretches',
        description:
          'Gently stretches the lower back and helps relieve tension.',
        instructions: `1. Lie on your back with knees bent and feet flat on the floor.
2. Slowly bring one knee toward your chest.
3. Grasp behind your knee or thigh (not the kneecap).
4. Gently pull your knee closer to your chest until you feel a comfortable stretch in your lower back.
5. Hold for 20-30 seconds.
6. Slowly return to starting position and repeat with the other leg.
7. You can also try both knees at once.

Tips:
- Keep your head and shoulders relaxed on the floor
- Breathe deeply and relax into the stretch
- Don't pull so hard that your tailbone lifts off the floor`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'LUMBAR' as BodyRegion,
        targetMuscles: ['Erector Spinae', 'Gluteus Maximus', 'Quadratus Lumborum'],
        conditions: ['Low Back Pain', 'Sciatica', 'Muscle Spasm', 'Stiffness'],
        defaultSets: 2,
        defaultReps: 1,
        defaultHoldTime: 30,
        defaultFrequency: '2-3x daily',
        equipmentRequired: [],
        contraindications: null,
        precautions: 'Stop if you experience increased pain or radiating symptoms.',
      },
      {
        name: 'Cat-Cow Stretch',
        categoryName: 'Lumbar Stretches',
        description:
          'A dynamic spinal mobility exercise that alternates between flexion and extension.',
        instructions: `1. Start on your hands and knees with wrists under shoulders and knees under hips.
2. CAT: Exhale, round your spine toward the ceiling, tuck your chin to chest, and tuck your tailbone under.
3. COW: Inhale, arch your back, lift your head and tailbone toward the ceiling.
4. Move slowly and smoothly between positions.
5. Repeat as prescribed.

Tips:
- Move with your breath - exhale into cat, inhale into cow
- Keep the movement gentle and controlled
- The movement should come from your spine, not just your head`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'FULL_BODY' as BodyRegion,
        targetMuscles: ['Erector Spinae', 'Rectus Abdominis', 'Multifidus'],
        conditions: ['Low Back Pain', 'Spinal Stiffness', 'General Mobility'],
        defaultSets: 2,
        defaultReps: 10,
        defaultHoldTime: null,
        defaultFrequency: '2x daily',
        equipmentRequired: ['Exercise Mat'],
        contraindications: null,
        precautions: 'Move within a pain-free range. Avoid if wrist pain is present.',
      },
      {
        name: 'Piriformis Stretch',
        categoryName: 'Lumbar Stretches',
        description:
          'Stretches the piriformis muscle, which can contribute to sciatic-type symptoms.',
        instructions: `1. Lie on your back with both knees bent.
2. Cross your right ankle over your left knee, creating a figure-4 shape.
3. Reach through and grasp behind your left thigh.
4. Gently pull your left thigh toward your chest.
5. Hold for 20-30 seconds, feeling the stretch in your right buttock.
6. Repeat on the other side.

Tips:
- Keep your head and shoulders relaxed on the floor
- Push your right knee away from you slightly to increase the stretch
- Keep both hips on the floor`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'LUMBAR' as BodyRegion,
        targetMuscles: ['Piriformis', 'Gluteus Medius', 'Hip External Rotators'],
        conditions: ['Sciatica', 'Piriformis Syndrome', 'Hip Pain', 'Low Back Pain'],
        defaultSets: 2,
        defaultReps: 1,
        defaultHoldTime: 30,
        defaultFrequency: '2-3x daily',
        equipmentRequired: [],
        contraindications: 'Avoid if you have had recent hip surgery.',
        precautions: 'Stop if you experience numbness or tingling.',
      },
      // Core Stability
      {
        name: 'Dead Bug',
        categoryName: 'Core Stability',
        description:
          'An excellent core stability exercise that teaches proper spinal control during movement.',
        instructions: `1. Lie on your back with arms pointing toward the ceiling and knees bent at 90 degrees (tabletop position).
2. Press your lower back firmly into the floor - this is your neutral spine position.
3. Slowly lower your right arm overhead while extending your left leg, keeping your back pressed into the floor.
4. Return to starting position.
5. Repeat with left arm and right leg.
6. Alternate sides as prescribed.

Tips:
- If your lower back arches off the floor, you've gone too far
- Move slowly and with control
- Breathe out as you extend your limbs`,
        difficulty: 'INTERMEDIATE' as ExerciseDifficulty,
        bodyRegion: 'CORE' as BodyRegion,
        targetMuscles: ['Transverse Abdominis', 'Rectus Abdominis', 'Internal Obliques'],
        conditions: ['Low Back Pain', 'Core Weakness', 'Postural Problems'],
        defaultSets: 3,
        defaultReps: 10,
        defaultHoldTime: null,
        defaultFrequency: '1x daily',
        equipmentRequired: ['Exercise Mat'],
        contraindications: null,
        precautions: 'Maintain the lower back connection to the floor throughout.',
      },
      {
        name: 'Bird Dog',
        categoryName: 'Core Stability',
        description:
          'Builds core stability and coordination while challenging balance.',
        instructions: `1. Start on hands and knees with wrists under shoulders and knees under hips.
2. Keep your spine neutral (flat back) and engage your core.
3. Slowly extend your right arm forward and left leg backward.
4. Keep your hips and shoulders level - don't rotate.
5. Hold for 5-10 seconds.
6. Return to starting position.
7. Repeat with left arm and right leg.

Tips:
- Imagine balancing a glass of water on your lower back
- Don't let your lower back sag or arch
- Reach through your fingertips and heel`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'CORE' as BodyRegion,
        targetMuscles: ['Multifidus', 'Erector Spinae', 'Gluteus Maximus', 'Transverse Abdominis'],
        conditions: ['Low Back Pain', 'Core Weakness', 'Balance Issues'],
        defaultSets: 3,
        defaultReps: 10,
        defaultHoldTime: 5,
        defaultFrequency: '1x daily',
        equipmentRequired: ['Exercise Mat'],
        contraindications: null,
        precautions: 'Maintain neutral spine. Do not extend beyond your control.',
      },
      {
        name: 'Plank',
        categoryName: 'Core Stability',
        description:
          'A foundational exercise for overall core strength and endurance.',
        instructions: `1. Start in a push-up position with forearms on the ground.
2. Keep your body in a straight line from head to heels.
3. Engage your core by drawing your belly button toward your spine.
4. Keep your hips level - don't let them sag or pike up.
5. Hold this position for the prescribed time.
6. Rest and repeat.

Modifications:
- Easier: Perform on knees
- Harder: Lift one foot off the ground

Tips:
- Don't hold your breath
- Keep your neck neutral (look at the floor)
- Squeeze your glutes to help maintain position`,
        difficulty: 'INTERMEDIATE' as ExerciseDifficulty,
        bodyRegion: 'CORE' as BodyRegion,
        targetMuscles: ['Transverse Abdominis', 'Rectus Abdominis', 'Obliques', 'Erector Spinae'],
        conditions: ['Core Weakness', 'Low Back Pain Prevention', 'General Fitness'],
        defaultSets: 3,
        defaultReps: 1,
        defaultHoldTime: 30,
        defaultFrequency: '1x daily',
        equipmentRequired: ['Exercise Mat'],
        modifications: 'Perform on knees for an easier version. Add leg lifts for progression.',
        contraindications: 'Avoid during pregnancy or with diastasis recti. May not be suitable for shoulder injuries.',
        precautions: 'Stop if you experience lower back pain or shoulder discomfort.',
      },
      // Posture Correction
      {
        name: 'Wall Angels',
        categoryName: 'Posture Correction',
        description:
          'Improves thoracic mobility and scapular control while reinforcing good posture.',
        instructions: `1. Stand with your back against a wall, feet about 6 inches away.
2. Press your head, upper back, and lower back against the wall.
3. Start with arms bent at 90 degrees, elbows and backs of hands against the wall.
4. Slowly slide your arms up the wall, keeping contact with the wall.
5. Go as high as you can while maintaining contact.
6. Slowly lower back to starting position.
7. Repeat as prescribed.

Tips:
- If you can't keep your lower back on the wall, step feet further out
- Keep your chin tucked
- Move slowly and controlled`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'THORACIC' as BodyRegion,
        targetMuscles: ['Lower Trapezius', 'Rhomboids', 'Serratus Anterior'],
        conditions: ['Forward Head Posture', 'Rounded Shoulders', 'Thoracic Kyphosis'],
        defaultSets: 3,
        defaultReps: 10,
        defaultHoldTime: null,
        defaultFrequency: '2x daily',
        equipmentRequired: ['Wall'],
        contraindications: null,
        precautions: 'Only move through a range where you can maintain wall contact.',
      },
      {
        name: 'Bruegger\'s Relief Position',
        categoryName: 'Posture Correction',
        description:
          'A quick postural reset exercise, especially helpful for desk workers.',
        instructions: `1. Sit on the edge of a chair with feet wide and slightly turned out.
2. Sit tall, creating a small arch in your lower back.
3. Turn your palms to face forward with thumbs pointing out.
4. Draw your shoulder blades back and down.
5. Tuck your chin slightly.
6. Take 3-5 deep breaths in this position.
7. Relax and repeat several times throughout the day.

Tips:
- Imagine someone pulling a string from the top of your head
- Feel your chest open up
- This is a great "microbreak" exercise`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'FULL_BODY' as BodyRegion,
        targetMuscles: ['Postural Muscles', 'Rhomboids', 'Lower Trapezius'],
        conditions: ['Desk Worker Syndrome', 'Poor Posture', 'Upper Back Pain'],
        defaultSets: 5,
        defaultReps: 1,
        defaultHoldTime: 15,
        defaultFrequency: 'Every 30-60 minutes while sitting',
        equipmentRequired: ['Chair'],
        contraindications: null,
        precautions: 'None - this is a gentle postural exercise.',
      },
      // Thoracic Mobility
      {
        name: 'Thoracic Extension on Foam Roller',
        categoryName: 'Thoracic Mobility',
        description:
          'Improves thoracic spine extension using a foam roller.',
        instructions: `1. Lie on a foam roller placed horizontally under your mid-back.
2. Support your head with your hands, fingers interlaced behind your head.
3. Keep your knees bent and feet flat on the floor.
4. Slowly extend backward over the roller.
5. Hold for a breath, then return to neutral.
6. Move the roller up or down slightly and repeat at different levels.

Tips:
- Don't arch from your lower back
- Keep your ribs down
- Move the roller between shoulder blades and mid-back`,
        difficulty: 'INTERMEDIATE' as ExerciseDifficulty,
        bodyRegion: 'THORACIC' as BodyRegion,
        targetMuscles: ['Thoracic Erector Spinae', 'Thoracic Paraspinals'],
        conditions: ['Thoracic Kyphosis', 'Upper Back Stiffness', 'Poor Posture'],
        defaultSets: 2,
        defaultReps: 10,
        defaultHoldTime: null,
        defaultFrequency: '1x daily',
        equipmentRequired: ['Foam Roller'],
        contraindications: 'Avoid with osteoporosis or spinal fractures.',
        precautions: 'Keep the movement in your mid-back, not your lower back.',
      },
      // Hip & Pelvis
      {
        name: 'Hip Flexor Stretch (Kneeling)',
        categoryName: 'Hip & Pelvis',
        description:
          'Stretches the hip flexors which can contribute to lower back pain when tight.',
        instructions: `1. Kneel on your right knee with your left foot flat on the floor in front.
2. Keep your torso upright and engage your core.
3. Tuck your tailbone under slightly (posterior pelvic tilt).
4. Shift your weight forward until you feel a stretch in the front of your right hip.
5. Hold for 20-30 seconds.
6. Switch sides and repeat.

Tips:
- Don't lean forward at the waist
- The stretch should be felt in the front of the back leg's hip
- Keep your core engaged throughout`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'LOWER_EXTREMITY' as BodyRegion,
        targetMuscles: ['Iliopsoas', 'Rectus Femoris', 'Hip Flexors'],
        conditions: ['Low Back Pain', 'Hip Pain', 'Anterior Pelvic Tilt'],
        defaultSets: 2,
        defaultReps: 1,
        defaultHoldTime: 30,
        defaultFrequency: '2-3x daily',
        equipmentRequired: ['Exercise Mat', 'Pillow (optional for knee)'],
        contraindications: null,
        precautions: 'Use a pillow under the knee if needed for comfort.',
      },
      // Balance
      {
        name: 'Single Leg Balance',
        categoryName: 'Balance & Proprioception',
        description:
          'Basic balance exercise to improve proprioception and stability.',
        instructions: `1. Stand near a wall or sturdy surface for support if needed.
2. Shift your weight to one leg.
3. Lift the other foot off the ground, bending the knee.
4. Try to balance for 30 seconds.
5. Switch legs and repeat.

Progressions:
- Eyes closed
- Unstable surface (pillow, balance pad)
- Head movements while balancing
- Arm movements while balancing

Tips:
- Start with fingertips touching the wall, then progress to no support
- Focus on a point at eye level
- Keep your standing knee slightly soft, not locked`,
        difficulty: 'BEGINNER' as ExerciseDifficulty,
        bodyRegion: 'LOWER_EXTREMITY' as BodyRegion,
        targetMuscles: ['Ankle Stabilizers', 'Hip Stabilizers', 'Core'],
        conditions: ['Balance Issues', 'Fall Prevention', 'Ankle Instability', 'Post-Injury Rehabilitation'],
        defaultSets: 3,
        defaultReps: 1,
        defaultHoldTime: 30,
        defaultFrequency: '1x daily',
        equipmentRequired: [],
        modifications: 'Progress to eyes closed or standing on an unstable surface.',
        contraindications: null,
        precautions: 'Use support as needed to prevent falls.',
      },
    ];

    let exercisesCreated = 0;
    let exercisesSkipped = 0;

    for (const exercise of standardExercises) {
      const { categoryName, ...exerciseData } = exercise;
      const categoryId = categoryMap[categoryName];

      if (!categoryId) {
        console.warn(`Category not found: ${categoryName}`);
        continue;
      }

      const existing = await ctx.prisma.exercise.findFirst({
        where: { name: exerciseData.name },
      });

      if (existing) {
        exercisesSkipped++;
        continue;
      }

      await ctx.prisma.exercise.create({
        data: {
          ...exerciseData,
          categoryId,
          isCustom: false,
          isActive: true,
        },
      });
      exercisesCreated++;
    }

    await auditLog('CREATE', 'Exercise', {
      changes: {
        action: 'seed_library',
        categoriesCreated,
        categoriesSkipped,
        exercisesCreated,
        exercisesSkipped,
      },
      userId: ctx.user.id,
      organizationId: ctx.user.organizationId,
    });

    return {
      success: true,
      categories: {
        created: categoriesCreated,
        skipped: categoriesSkipped,
        total: standardCategories.length,
      },
      exercises: {
        created: exercisesCreated,
        skipped: exercisesSkipped,
        total: standardExercises.length,
      },
    };
  }),
});
