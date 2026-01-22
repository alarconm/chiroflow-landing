import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { SpinalRegion } from '@prisma/client';

// ===============================
// Reference Data & Constants
// ===============================

// Muscle grading scale (MRC scale)
const MUSCLE_GRADES = [
  { grade: 0, label: 'No contraction', description: 'No visible or palpable contraction' },
  { grade: 1, label: 'Flicker', description: 'Visible/palpable contraction, no movement' },
  { grade: 2, label: 'Poor', description: 'Movement with gravity eliminated' },
  { grade: 3, label: 'Fair', description: 'Movement against gravity only' },
  { grade: 4, label: 'Good', description: 'Movement against gravity with some resistance' },
  { grade: 5, label: 'Normal', description: 'Full strength against full resistance' },
];

// Deep Tendon Reflex grading scale
const DTR_GRADES = [
  { grade: '0', label: 'Absent', description: 'No response' },
  { grade: '1+', label: 'Diminished', description: 'Sluggish or diminished' },
  { grade: '2+', label: 'Normal', description: 'Normal response' },
  { grade: '3+', label: 'Brisk', description: 'Brisker than normal' },
  { grade: '4+', label: 'Clonus', description: 'Clonus present' },
];

// Common muscles for testing
const MUSCLE_TESTING_OPTIONS = [
  // Upper extremity
  { muscle: 'Deltoid', myotome: 'C5', region: 'Upper Extremity' },
  { muscle: 'Biceps', myotome: 'C5-C6', region: 'Upper Extremity' },
  { muscle: 'Wrist Extensors', myotome: 'C6', region: 'Upper Extremity' },
  { muscle: 'Triceps', myotome: 'C7', region: 'Upper Extremity' },
  { muscle: 'Wrist Flexors', myotome: 'C7', region: 'Upper Extremity' },
  { muscle: 'Finger Flexors', myotome: 'C8', region: 'Upper Extremity' },
  { muscle: 'Interossei', myotome: 'T1', region: 'Upper Extremity' },
  // Lower extremity
  { muscle: 'Iliopsoas', myotome: 'L1-L2', region: 'Lower Extremity' },
  { muscle: 'Quadriceps', myotome: 'L2-L4', region: 'Lower Extremity' },
  { muscle: 'Hip Adductors', myotome: 'L2-L4', region: 'Lower Extremity' },
  { muscle: 'Tibialis Anterior', myotome: 'L4', region: 'Lower Extremity' },
  { muscle: 'Extensor Hallucis Longus', myotome: 'L5', region: 'Lower Extremity' },
  { muscle: 'Gastrocnemius', myotome: 'S1', region: 'Lower Extremity' },
  { muscle: 'Gluteus Maximus', myotome: 'S1', region: 'Lower Extremity' },
];

// Deep Tendon Reflexes
const DTR_OPTIONS = [
  { reflex: 'Biceps', level: 'C5-C6' },
  { reflex: 'Brachioradialis', level: 'C5-C6' },
  { reflex: 'Triceps', level: 'C7' },
  { reflex: 'Patellar', level: 'L3-L4' },
  { reflex: 'Achilles', level: 'S1' },
];

// Dermatomes for sensory testing
const DERMATOME_OPTIONS = [
  { dermatome: 'C2', area: 'Occiput' },
  { dermatome: 'C3', area: 'Lateral neck' },
  { dermatome: 'C4', area: 'Supraclavicular' },
  { dermatome: 'C5', area: 'Lateral arm' },
  { dermatome: 'C6', area: 'Thumb, radial forearm' },
  { dermatome: 'C7', area: 'Middle finger' },
  { dermatome: 'C8', area: 'Ring/little finger, ulnar forearm' },
  { dermatome: 'T1', area: 'Medial forearm' },
  { dermatome: 'L1', area: 'Inguinal region' },
  { dermatome: 'L2', area: 'Upper anterior thigh' },
  { dermatome: 'L3', area: 'Lower anterior thigh, knee' },
  { dermatome: 'L4', area: 'Medial lower leg, medial foot' },
  { dermatome: 'L5', area: 'Lateral lower leg, dorsum of foot' },
  { dermatome: 'S1', area: 'Lateral foot, posterior leg' },
  { dermatome: 'S2', area: 'Posterior thigh' },
];

// Common orthopedic tests
const ORTHOPEDIC_TESTS = [
  // Cervical
  { name: 'Cervical Compression', region: 'Cervical', purpose: 'Disc/facet pathology' },
  { name: 'Cervical Distraction', region: 'Cervical', purpose: 'Disc/nerve root relief' },
  { name: "Spurling's Test", region: 'Cervical', purpose: 'Cervical radiculopathy' },
  { name: "Jackson's Test", region: 'Cervical', purpose: 'Cervical radiculopathy' },
  { name: "Bakody's Sign", region: 'Cervical', purpose: 'Nerve root compression' },
  { name: 'Maximum Cervical Compression', region: 'Cervical', purpose: 'Facet syndrome' },
  // Shoulder
  { name: "Neer's Test", region: 'Shoulder', purpose: 'Supraspinatus impingement' },
  { name: "Hawkins-Kennedy Test", region: 'Shoulder', purpose: 'Rotator cuff impingement' },
  { name: 'Empty Can Test', region: 'Shoulder', purpose: 'Supraspinatus tear' },
  { name: "Speed's Test", region: 'Shoulder', purpose: 'Biceps tendon' },
  // Thoracic
  { name: 'Rib Spring Test', region: 'Thoracic', purpose: 'Rib dysfunction' },
  { name: 'Adam\'s Test', region: 'Thoracic', purpose: 'Scoliosis' },
  // Lumbar
  { name: 'Straight Leg Raise', region: 'Lumbar', purpose: 'Sciatic nerve tension' },
  { name: 'Crossed SLR', region: 'Lumbar', purpose: 'Central disc herniation' },
  { name: 'Braggard\'s Test', region: 'Lumbar', purpose: 'Sciatic nerve tension' },
  { name: 'Femoral Nerve Stretch', region: 'Lumbar', purpose: 'Upper lumbar radiculopathy' },
  { name: 'Slump Test', region: 'Lumbar', purpose: 'Neural tension' },
  { name: "Kemp's Test", region: 'Lumbar', purpose: 'Facet syndrome/disc' },
  { name: 'Milgram\'s Test', region: 'Lumbar', purpose: 'Intrathecal pathology' },
  { name: "Minor's Sign", region: 'Lumbar', purpose: 'Sciatica' },
  // SI Joint
  { name: 'SI Compression', region: 'SI Joint', purpose: 'SI joint dysfunction' },
  { name: 'SI Distraction', region: 'SI Joint', purpose: 'SI joint dysfunction' },
  { name: 'FABER Test', region: 'SI Joint', purpose: 'SI joint/hip pathology' },
  { name: 'Gaenslen\'s Test', region: 'SI Joint', purpose: 'SI joint dysfunction' },
  { name: 'Yeoman\'s Test', region: 'SI Joint', purpose: 'SI joint/anterior ligament' },
  // Hip
  { name: 'Thomas Test', region: 'Hip', purpose: 'Hip flexor tightness' },
  { name: 'Trendelenburg Test', region: 'Hip', purpose: 'Gluteus medius weakness' },
  { name: 'Ober\'s Test', region: 'Hip', purpose: 'IT band tightness' },
  { name: 'Piriformis Test', region: 'Hip', purpose: 'Piriformis syndrome' },
];

// Normal ROM values (in degrees)
const NORMAL_ROM = {
  cervical: {
    flexion: { normal: 45, description: 'Chin to chest' },
    extension: { normal: 45, description: 'Looking up' },
    leftLateralFlexion: { normal: 45, description: 'Ear to shoulder' },
    rightLateralFlexion: { normal: 45, description: 'Ear to shoulder' },
    leftRotation: { normal: 80, description: 'Chin to shoulder' },
    rightRotation: { normal: 80, description: 'Chin to shoulder' },
  },
  thoracic: {
    flexion: { normal: 30, description: 'Forward bending' },
    extension: { normal: 20, description: 'Backward bending' },
    leftLateralFlexion: { normal: 30, description: 'Side bending' },
    rightLateralFlexion: { normal: 30, description: 'Side bending' },
    leftRotation: { normal: 30, description: 'Trunk rotation' },
    rightRotation: { normal: 30, description: 'Trunk rotation' },
  },
  lumbar: {
    flexion: { normal: 60, description: 'Forward bending' },
    extension: { normal: 25, description: 'Backward bending' },
    leftLateralFlexion: { normal: 25, description: 'Side bending' },
    rightLateralFlexion: { normal: 25, description: 'Side bending' },
    leftRotation: { normal: 30, description: 'Trunk rotation' },
    rightRotation: { normal: 30, description: 'Trunk rotation' },
  },
};

// Postural analysis checkpoints
const POSTURAL_CHECKPOINTS = {
  anterior: [
    'Head position (tilt/rotation)',
    'Shoulder level',
    'Arm swing space',
    'Hip level (ASIS)',
    'Knee position (valgus/varus)',
    'Foot position (pronation/supination)',
  ],
  lateral: [
    'Head forward posture',
    'Cervical lordosis',
    'Shoulder position (rounded)',
    'Thoracic kyphosis',
    'Lumbar lordosis',
    'Pelvic tilt (anterior/posterior)',
    'Knee position (hyperextension)',
  ],
  posterior: [
    'Head position',
    'Shoulder level',
    'Scapular position (winging)',
    'Spinal alignment',
    'Hip level (PSIS)',
    'Gluteal fold level',
    'Knee position',
    'Achilles alignment',
  ],
};

// Palpation finding types
const PALPATION_FINDINGS = [
  'Tenderness',
  'Muscle spasm',
  'Hypertonicity',
  'Trigger point',
  'Edema',
  'Temperature change',
  'Fixation',
  'Hypermobility',
  'Crepitus',
];

// Motion palpation restrictions
const MOTION_RESTRICTIONS = [
  'Flexion restriction',
  'Extension restriction',
  'Left lateral flexion restriction',
  'Right lateral flexion restriction',
  'Left rotation restriction',
  'Right rotation restriction',
  'Global restriction',
  'Hypermobile',
];

// ===============================
// Zod Schemas
// ===============================

// Leg length assessment schema
const legLengthSchema = z.object({
  prone: z.string().optional(),
  supine: z.string().optional(),
  seated: z.string().optional(),
  notes: z.string().optional(),
});

// Muscle testing data schema
const muscleTestEntrySchema = z.object({
  muscle: z.string(),
  grade: z.number().min(0).max(5),
  side: z.enum(['left', 'right', 'bilateral']).optional(),
  notes: z.string().optional(),
});

// DTR entry schema
const dtrEntrySchema = z.object({
  reflex: z.string(),
  left: z.string().optional(),
  right: z.string().optional(),
  notes: z.string().optional(),
});

// Dermatome entry schema
const dermatomeEntrySchema = z.object({
  dermatome: z.string(),
  left: z.enum(['normal', 'diminished', 'absent', 'hyperesthetic']).optional(),
  right: z.enum(['normal', 'diminished', 'absent', 'hyperesthetic']).optional(),
  notes: z.string().optional(),
});

// Myotome entry schema (same as muscle testing essentially)
const myotomeEntrySchema = z.object({
  level: z.string(),
  leftGrade: z.number().min(0).max(5).optional(),
  rightGrade: z.number().min(0).max(5).optional(),
  notes: z.string().optional(),
});

// Orthopedic test result schema
const orthopedicTestResultSchema = z.object({
  testName: z.string(),
  result: z.enum(['positive', 'negative', 'equivocal']),
  side: z.enum(['left', 'right', 'bilateral', 'central']).optional(),
  notes: z.string().optional(),
});

// Static palpation finding schema
const staticPalpationFindingSchema = z.object({
  segment: z.string(),
  findings: z.array(z.string()),
  severity: z.enum(['mild', 'moderate', 'marked']).optional(),
  notes: z.string().optional(),
});

// Motion palpation finding schema
const motionPalpationFindingSchema = z.object({
  segment: z.string(),
  restrictions: z.array(z.string()),
  notes: z.string().optional(),
});

// Postural finding schema
const posturalFindingSchema = z.object({
  view: z.enum(['anterior', 'lateral', 'posterior']),
  findings: z.array(z.object({
    checkpoint: z.string(),
    deviation: z.string(),
    severity: z.enum(['mild', 'moderate', 'marked']).optional(),
  })),
  notes: z.string().optional(),
});

// ROM entry schema
const romEntrySchema = z.object({
  flexion: z.number().optional(),
  extension: z.number().optional(),
  leftLateralFlexion: z.number().optional(),
  rightLateralFlexion: z.number().optional(),
  leftRotation: z.number().optional(),
  rightRotation: z.number().optional(),
  painOnMovement: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

// Vital signs schema
const vitalSignsSchema = z.object({
  bloodPressure: z.string().optional(),
  pulse: z.number().optional(),
  respiration: z.number().optional(),
  temperature: z.number().optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  notes: z.string().optional(),
});

// ===============================
// Router
// ===============================

export const chiropracticExamRouter = router({
  // Create a new chiropractic exam
  create: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string(),
        // Leg length assessment
        legLengthProne: z.string().optional(),
        legLengthSupine: z.string().optional(),
        legLengthSeated: z.string().optional(),
        legLengthNotes: z.string().optional(),
        // Muscle testing
        muscleTestingData: z.array(muscleTestEntrySchema).optional(),
        muscleTestingNotes: z.string().optional(),
        // Static palpation
        staticPalpationFindings: z.array(staticPalpationFindingSchema).optional(),
        staticPalpationNotes: z.string().optional(),
        // Motion palpation
        motionPalpationFindings: z.array(motionPalpationFindingSchema).optional(),
        motionPalpationNotes: z.string().optional(),
        // Postural analysis
        posturalFindings: z.array(posturalFindingSchema).optional(),
        posturalNotes: z.string().optional(),
        // Orthopedic tests
        orthopedicTests: z.array(orthopedicTestResultSchema).optional(),
        // Neurological screening
        dtrFindings: z.array(dtrEntrySchema).optional(),
        dermatomeFindings: z.array(dermatomeEntrySchema).optional(),
        myotomeFindings: z.array(myotomeEntrySchema).optional(),
        neurologicalNotes: z.string().optional(),
        // Range of motion
        cervicalROM: romEntrySchema.optional(),
        thoracicROM: romEntrySchema.optional(),
        lumbarROM: romEntrySchema.optional(),
        romNotes: z.string().optional(),
        // Additional
        vitalSigns: vitalSignsSchema.optional(),
        generalObservations: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, encounterId, ...examData } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Verify encounter exists and belongs to patient
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

      // Check if exam already exists for this encounter
      const existingExam = await ctx.prisma.chiropracticExam.findUnique({
        where: { encounterId },
      });

      if (existingExam) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A chiropractic exam already exists for this encounter. Use update instead.',
        });
      }

      // Generate summary from exam findings
      const summary = generateExamSummary(examData);

      // Create exam record
      const exam = await ctx.prisma.chiropracticExam.create({
        data: {
          patientId,
          encounterId,
          organizationId: ctx.user.organizationId,
          legLengthProne: examData.legLengthProne,
          legLengthSupine: examData.legLengthSupine,
          legLengthSeated: examData.legLengthSeated,
          legLengthNotes: examData.legLengthNotes,
          muscleTestingData: examData.muscleTestingData || undefined,
          muscleTestingNotes: examData.muscleTestingNotes,
          staticPalpationFindings: examData.staticPalpationFindings || undefined,
          staticPalpationNotes: examData.staticPalpationNotes,
          motionPalpationFindings: examData.motionPalpationFindings || undefined,
          motionPalpationNotes: examData.motionPalpationNotes,
          posturalFindings: examData.posturalFindings || undefined,
          posturalNotes: examData.posturalNotes,
          orthopedicTests: examData.orthopedicTests || undefined,
          dtrFindings: examData.dtrFindings || undefined,
          dermatomeFindings: examData.dermatomeFindings || undefined,
          myotomeFindings: examData.myotomeFindings || undefined,
          neurologicalNotes: examData.neurologicalNotes,
          cervicalROM: examData.cervicalROM || undefined,
          thoracicROM: examData.thoracicROM || undefined,
          lumbarROM: examData.lumbarROM || undefined,
          romNotes: examData.romNotes,
          vitalSigns: examData.vitalSigns || undefined,
          generalObservations: examData.generalObservations,
          summary,
        },
        include: {
          patient: {
            select: {
              id: true,
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          encounter: {
            select: {
              id: true,
              encounterDate: true,
            },
          },
        },
      });

      await auditLog('CHIROPRACTIC_EXAM_CREATE', 'ChiropracticExam', {
        entityId: exam.id,
        changes: { encounterId, patientId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return exam;
    }),

  // Update an existing exam
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        // All fields are optional for partial updates
        legLengthProne: z.string().optional().nullable(),
        legLengthSupine: z.string().optional().nullable(),
        legLengthSeated: z.string().optional().nullable(),
        legLengthNotes: z.string().optional().nullable(),
        muscleTestingData: z.array(muscleTestEntrySchema).optional().nullable(),
        muscleTestingNotes: z.string().optional().nullable(),
        staticPalpationFindings: z.array(staticPalpationFindingSchema).optional().nullable(),
        staticPalpationNotes: z.string().optional().nullable(),
        motionPalpationFindings: z.array(motionPalpationFindingSchema).optional().nullable(),
        motionPalpationNotes: z.string().optional().nullable(),
        posturalFindings: z.array(posturalFindingSchema).optional().nullable(),
        posturalNotes: z.string().optional().nullable(),
        orthopedicTests: z.array(orthopedicTestResultSchema).optional().nullable(),
        dtrFindings: z.array(dtrEntrySchema).optional().nullable(),
        dermatomeFindings: z.array(dermatomeEntrySchema).optional().nullable(),
        myotomeFindings: z.array(myotomeEntrySchema).optional().nullable(),
        neurologicalNotes: z.string().optional().nullable(),
        cervicalROM: romEntrySchema.optional().nullable(),
        thoracicROM: romEntrySchema.optional().nullable(),
        lumbarROM: romEntrySchema.optional().nullable(),
        romNotes: z.string().optional().nullable(),
        vitalSigns: vitalSignsSchema.optional().nullable(),
        generalObservations: z.string().optional().nullable(),
        regenerateSummary: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, regenerateSummary, ...updateData } = input;

      // Get existing exam
      const existing = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Chiropractic exam not found',
        });
      }

      // Check if encounter is signed
      if (existing.encounter.status === 'SIGNED' || existing.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot update exam for a signed encounter',
        });
      }

      // Build update object, filtering out undefined values
      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updateData)) {
        if (value !== undefined) {
          data[key] = value;
        }
      }

      // Regenerate summary if requested or if significant fields changed
      if (regenerateSummary) {
        const mergedData = { ...existing, ...data };
        data.summary = generateExamSummary(mergedData);
      }

      const exam = await ctx.prisma.chiropracticExam.update({
        where: { id },
        data,
        include: {
          patient: {
            select: {
              id: true,
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          encounter: {
            select: {
              id: true,
              encounterDate: true,
            },
          },
        },
      });

      await auditLog('CHIROPRACTIC_EXAM_UPDATE', 'ChiropracticExam', {
        entityId: id,
        changes: { fields: Object.keys(data) },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return exam;
    }),

  // Get exam by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            select: {
              id: true,
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  dateOfBirth: true,
                },
              },
            },
          },
          encounter: {
            select: {
              id: true,
              encounterDate: true,
              status: true,
              provider: {
                select: {
                  id: true,
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!exam) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Chiropractic exam not found',
        });
      }

      return exam;
    }),

  // Get exam by encounter ID
  getByEncounter: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          encounterId: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            select: {
              id: true,
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  dateOfBirth: true,
                },
              },
            },
          },
          encounter: {
            select: {
              id: true,
              encounterDate: true,
              status: true,
            },
          },
        },
      });

      return exam; // May be null if no exam exists
    }),

  // List exams for a patient
  listByPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, limit, offset } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const [exams, total] = await Promise.all([
        ctx.prisma.chiropracticExam.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            encounter: {
              select: {
                id: true,
                encounterDate: true,
                status: true,
                provider: {
                  select: {
                    user: {
                      select: {
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        ctx.prisma.chiropracticExam.count({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
          },
        }),
      ]);

      return {
        exams,
        total,
        limit,
        offset,
        hasMore: offset + exams.length < total,
      };
    }),

  // Delete exam (only for unsigned encounters)
  delete: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Chiropractic exam not found',
        });
      }

      if (exam.encounter.status === 'SIGNED' || exam.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete exam from a signed encounter',
        });
      }

      await auditLog('CHIROPRACTIC_EXAM_DELETE', 'ChiropracticExam', {
        entityId: input.id,
        changes: { encounterId: exam.encounterId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await ctx.prisma.chiropracticExam.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // ===============================
  // Leg Length Assessment
  // ===============================

  updateLegLength: providerProcedure
    .input(
      z.object({
        examId: z.string(),
        prone: z.string().optional().nullable(),
        supine: z.string().optional().nullable(),
        seated: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { examId, ...legLengthData } = input;

      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: examId,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      if (exam.encounter.status === 'SIGNED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update signed encounter' });
      }

      return ctx.prisma.chiropracticExam.update({
        where: { id: examId },
        data: {
          legLengthProne: legLengthData.prone,
          legLengthSupine: legLengthData.supine,
          legLengthSeated: legLengthData.seated,
          legLengthNotes: legLengthData.notes,
        },
      });
    }),

  // ===============================
  // Muscle Testing
  // ===============================

  updateMuscleTesting: providerProcedure
    .input(
      z.object({
        examId: z.string(),
        data: z.array(muscleTestEntrySchema),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: input.examId,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      if (exam.encounter.status === 'SIGNED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update signed encounter' });
      }

      return ctx.prisma.chiropracticExam.update({
        where: { id: input.examId },
        data: {
          muscleTestingData: input.data,
          muscleTestingNotes: input.notes,
        },
      });
    }),

  getMuscleGrades: protectedProcedure.query(() => MUSCLE_GRADES),

  getMuscleOptions: protectedProcedure.query(() => MUSCLE_TESTING_OPTIONS),

  // ===============================
  // Palpation Findings
  // ===============================

  updateStaticPalpation: providerProcedure
    .input(
      z.object({
        examId: z.string(),
        findings: z.array(staticPalpationFindingSchema),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: input.examId,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      if (exam.encounter.status === 'SIGNED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update signed encounter' });
      }

      return ctx.prisma.chiropracticExam.update({
        where: { id: input.examId },
        data: {
          staticPalpationFindings: input.findings,
          staticPalpationNotes: input.notes,
        },
      });
    }),

  updateMotionPalpation: providerProcedure
    .input(
      z.object({
        examId: z.string(),
        findings: z.array(motionPalpationFindingSchema),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: input.examId,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      if (exam.encounter.status === 'SIGNED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update signed encounter' });
      }

      return ctx.prisma.chiropracticExam.update({
        where: { id: input.examId },
        data: {
          motionPalpationFindings: input.findings,
          motionPalpationNotes: input.notes,
        },
      });
    }),

  getPalpationOptions: protectedProcedure.query(() => ({
    staticFindings: PALPATION_FINDINGS,
    motionRestrictions: MOTION_RESTRICTIONS,
  })),

  // ===============================
  // Postural Analysis
  // ===============================

  updatePosturalAnalysis: providerProcedure
    .input(
      z.object({
        examId: z.string(),
        findings: z.array(posturalFindingSchema),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: input.examId,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      if (exam.encounter.status === 'SIGNED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update signed encounter' });
      }

      return ctx.prisma.chiropracticExam.update({
        where: { id: input.examId },
        data: {
          posturalFindings: input.findings,
          posturalNotes: input.notes,
        },
      });
    }),

  getPosturalCheckpoints: protectedProcedure.query(() => POSTURAL_CHECKPOINTS),

  // ===============================
  // Orthopedic Tests
  // ===============================

  updateOrthopedicTests: providerProcedure
    .input(
      z.object({
        examId: z.string(),
        tests: z.array(orthopedicTestResultSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: input.examId,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      if (exam.encounter.status === 'SIGNED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update signed encounter' });
      }

      return ctx.prisma.chiropracticExam.update({
        where: { id: input.examId },
        data: {
          orthopedicTests: input.tests,
        },
      });
    }),

  getOrthopedicTestOptions: protectedProcedure
    .input(z.object({ region: z.string().optional() }))
    .query(({ input }) => {
      if (input.region) {
        return ORTHOPEDIC_TESTS.filter((t) => t.region === input.region);
      }
      return ORTHOPEDIC_TESTS;
    }),

  // ===============================
  // Neurological Screening
  // ===============================

  updateNeurologicalScreening: providerProcedure
    .input(
      z.object({
        examId: z.string(),
        dtrFindings: z.array(dtrEntrySchema).optional().nullable(),
        dermatomeFindings: z.array(dermatomeEntrySchema).optional().nullable(),
        myotomeFindings: z.array(myotomeEntrySchema).optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { examId, ...neuroData } = input;

      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: examId,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      if (exam.encounter.status === 'SIGNED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update signed encounter' });
      }

      return ctx.prisma.chiropracticExam.update({
        where: { id: examId },
        data: {
          dtrFindings: neuroData.dtrFindings ?? undefined,
          dermatomeFindings: neuroData.dermatomeFindings ?? undefined,
          myotomeFindings: neuroData.myotomeFindings ?? undefined,
          neurologicalNotes: neuroData.notes,
        },
      });
    }),

  getDTROptions: protectedProcedure.query(() => ({
    reflexes: DTR_OPTIONS,
    grades: DTR_GRADES,
  })),

  getDermatomeOptions: protectedProcedure.query(() => DERMATOME_OPTIONS),

  getMyotomeOptions: protectedProcedure.query(() => MUSCLE_TESTING_OPTIONS),

  // ===============================
  // Range of Motion
  // ===============================

  updateROM: providerProcedure
    .input(
      z.object({
        examId: z.string(),
        region: z.enum(['cervical', 'thoracic', 'lumbar']),
        rom: romEntrySchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: input.examId,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      if (exam.encounter.status === 'SIGNED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update signed encounter' });
      }

      const fieldMap: Record<string, string> = {
        cervical: 'cervicalROM',
        thoracic: 'thoracicROM',
        lumbar: 'lumbarROM',
      };

      return ctx.prisma.chiropracticExam.update({
        where: { id: input.examId },
        data: {
          [fieldMap[input.region]]: input.rom,
        },
      });
    }),

  updateAllROM: providerProcedure
    .input(
      z.object({
        examId: z.string(),
        cervicalROM: romEntrySchema.optional().nullable(),
        thoracicROM: romEntrySchema.optional().nullable(),
        lumbarROM: romEntrySchema.optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { examId, ...romData } = input;

      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: examId,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      if (exam.encounter.status === 'SIGNED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update signed encounter' });
      }

      return ctx.prisma.chiropracticExam.update({
        where: { id: examId },
        data: {
          cervicalROM: romData.cervicalROM ?? undefined,
          thoracicROM: romData.thoracicROM ?? undefined,
          lumbarROM: romData.lumbarROM ?? undefined,
          romNotes: romData.notes,
        },
      });
    }),

  getNormalROM: protectedProcedure.query(() => NORMAL_ROM),

  // ===============================
  // Summary Generation
  // ===============================

  regenerateSummary: providerProcedure
    .input(z.object({ examId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: input.examId,
          organizationId: ctx.user.organizationId,
        },
        include: { encounter: true },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      if (exam.encounter.status === 'SIGNED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot update signed encounter' });
      }

      const summary = generateExamSummary(exam);

      return ctx.prisma.chiropracticExam.update({
        where: { id: input.examId },
        data: { summary },
      });
    }),

  getSummary: protectedProcedure
    .input(z.object({ examId: z.string() }))
    .query(async ({ ctx, input }) => {
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          id: input.examId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!exam) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exam not found' });
      }

      // If summary exists, return it; otherwise generate fresh
      if (exam.summary) {
        return { summary: exam.summary, generated: false };
      }

      const summary = generateExamSummary(exam);
      return { summary, generated: true };
    }),

  // ===============================
  // Comparison Tools
  // ===============================

  compareExams: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        exam1Id: z.string(),
        exam2Id: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, exam1Id, exam2Id } = input;

      // Verify patient
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      }

      // Get both exams
      const [exam1, exam2] = await Promise.all([
        ctx.prisma.chiropracticExam.findFirst({
          where: { id: exam1Id, patientId, organizationId: ctx.user.organizationId },
          include: { encounter: { select: { encounterDate: true } } },
        }),
        ctx.prisma.chiropracticExam.findFirst({
          where: { id: exam2Id, patientId, organizationId: ctx.user.organizationId },
          include: { encounter: { select: { encounterDate: true } } },
        }),
      ]);

      if (!exam1 || !exam2) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'One or both exams not found' });
      }

      // Build comparison
      const comparison = {
        exam1: {
          id: exam1.id,
          date: exam1.encounter.encounterDate,
        },
        exam2: {
          id: exam2.id,
          date: exam2.encounter.encounterDate,
        },
        legLength: {
          exam1: {
            prone: exam1.legLengthProne,
            supine: exam1.legLengthSupine,
            seated: exam1.legLengthSeated,
          },
          exam2: {
            prone: exam2.legLengthProne,
            supine: exam2.legLengthSupine,
            seated: exam2.legLengthSeated,
          },
          changed: exam1.legLengthProne !== exam2.legLengthProne ||
                   exam1.legLengthSupine !== exam2.legLengthSupine ||
                   exam1.legLengthSeated !== exam2.legLengthSeated,
        },
        rom: {
          cervical: compareROM(exam1.cervicalROM as Record<string, number> | null, exam2.cervicalROM as Record<string, number> | null),
          thoracic: compareROM(exam1.thoracicROM as Record<string, number> | null, exam2.thoracicROM as Record<string, number> | null),
          lumbar: compareROM(exam1.lumbarROM as Record<string, number> | null, exam2.lumbarROM as Record<string, number> | null),
        },
        orthopedicTests: compareOrthopedicTests(
          exam1.orthopedicTests as Array<{ testName: string; result: string }> | null,
          exam2.orthopedicTests as Array<{ testName: string; result: string }> | null
        ),
      };

      return comparison;
    }),
});

// ===============================
// Helper Functions
// ===============================

function generateExamSummary(exam: Record<string, unknown>): string {
  const sections: string[] = [];

  // Leg length
  if (exam.legLengthProne || exam.legLengthSupine || exam.legLengthSeated) {
    const legLength: string[] = [];
    if (exam.legLengthProne) legLength.push(`Prone: ${exam.legLengthProne}`);
    if (exam.legLengthSupine) legLength.push(`Supine: ${exam.legLengthSupine}`);
    if (exam.legLengthSeated) legLength.push(`Seated: ${exam.legLengthSeated}`);
    sections.push(`LEG LENGTH: ${legLength.join('; ')}`);
  }

  // Muscle testing
  const muscleData = exam.muscleTestingData as Array<{ muscle: string; grade: number; side?: string }> | null;
  if (muscleData && Array.isArray(muscleData) && muscleData.length > 0) {
    const abnormal = muscleData.filter((m) => m.grade < 5);
    if (abnormal.length > 0) {
      const findings = abnormal.map((m) =>
        `${m.muscle}${m.side ? ` (${m.side})` : ''}: ${m.grade}/5`
      );
      sections.push(`MUSCLE TESTING: ${findings.join('; ')}`);
    } else {
      sections.push('MUSCLE TESTING: All tested muscles 5/5');
    }
  }

  // Static palpation
  const staticFindings = exam.staticPalpationFindings as Array<{ segment: string; findings: string[] }> | null;
  if (staticFindings && Array.isArray(staticFindings) && staticFindings.length > 0) {
    const findings = staticFindings.map((f) => `${f.segment}: ${f.findings.join(', ')}`);
    sections.push(`STATIC PALPATION: ${findings.join('; ')}`);
  }

  // Motion palpation
  const motionFindings = exam.motionPalpationFindings as Array<{ segment: string; restrictions: string[] }> | null;
  if (motionFindings && Array.isArray(motionFindings) && motionFindings.length > 0) {
    const findings = motionFindings.map((f) => `${f.segment}: ${f.restrictions.join(', ')}`);
    sections.push(`MOTION PALPATION: ${findings.join('; ')}`);
  }

  // Postural analysis
  const posturalFindings = exam.posturalFindings as Array<{ view: string; findings: Array<{ checkpoint: string; deviation: string }> }> | null;
  if (posturalFindings && Array.isArray(posturalFindings) && posturalFindings.length > 0) {
    const findings: string[] = [];
    for (const view of posturalFindings) {
      if (view.findings.length > 0) {
        const deviations = view.findings.map((f) => f.deviation);
        findings.push(`${view.view}: ${deviations.join(', ')}`);
      }
    }
    if (findings.length > 0) {
      sections.push(`POSTURAL ANALYSIS: ${findings.join('; ')}`);
    }
  }

  // Orthopedic tests
  const orthoTests = exam.orthopedicTests as Array<{ testName: string; result: string; side?: string }> | null;
  if (orthoTests && Array.isArray(orthoTests) && orthoTests.length > 0) {
    const positive = orthoTests.filter((t) => t.result === 'positive');
    const negative = orthoTests.filter((t) => t.result === 'negative');
    const parts: string[] = [];
    if (positive.length > 0) {
      parts.push(`Positive: ${positive.map((t) => `${t.testName}${t.side ? ` (${t.side})` : ''}`).join(', ')}`);
    }
    if (negative.length > 0) {
      parts.push(`Negative: ${negative.map((t) => t.testName).join(', ')}`);
    }
    if (parts.length > 0) {
      sections.push(`ORTHOPEDIC TESTS: ${parts.join('; ')}`);
    }
  }

  // Neurological
  const neuroFindings: string[] = [];

  const dtrData = exam.dtrFindings as Array<{ reflex: string; left?: string; right?: string }> | null;
  if (dtrData && Array.isArray(dtrData) && dtrData.length > 0) {
    const abnormal = dtrData.filter((d) =>
      (d.left && d.left !== '2+') || (d.right && d.right !== '2+')
    );
    if (abnormal.length > 0) {
      const findings = abnormal.map((d) => {
        const parts: string[] = [];
        if (d.left && d.left !== '2+') parts.push(`L ${d.left}`);
        if (d.right && d.right !== '2+') parts.push(`R ${d.right}`);
        return `${d.reflex}: ${parts.join(', ')}`;
      });
      neuroFindings.push(`DTRs: ${findings.join('; ')}`);
    } else {
      neuroFindings.push('DTRs: 2+ bilateral');
    }
  }

  const dermatomeData = exam.dermatomeFindings as Array<{ dermatome: string; left?: string; right?: string }> | null;
  if (dermatomeData && Array.isArray(dermatomeData) && dermatomeData.length > 0) {
    const abnormal = dermatomeData.filter((d) =>
      (d.left && d.left !== 'normal') || (d.right && d.right !== 'normal')
    );
    if (abnormal.length > 0) {
      const findings = abnormal.map((d) => {
        const parts: string[] = [];
        if (d.left && d.left !== 'normal') parts.push(`L ${d.left}`);
        if (d.right && d.right !== 'normal') parts.push(`R ${d.right}`);
        return `${d.dermatome}: ${parts.join(', ')}`;
      });
      neuroFindings.push(`Dermatomes: ${findings.join('; ')}`);
    } else {
      neuroFindings.push('Dermatomes: intact bilateral');
    }
  }

  if (neuroFindings.length > 0) {
    sections.push(`NEUROLOGICAL: ${neuroFindings.join('; ')}`);
  }

  // Range of motion
  const romSummary: string[] = [];
  for (const region of ['cervical', 'thoracic', 'lumbar'] as const) {
    const romData = exam[`${region}ROM`] as Record<string, number> | null;
    if (romData) {
      const restrictions: string[] = [];
      const normalValues = NORMAL_ROM[region];
      for (const [movement, value] of Object.entries(romData)) {
        if (typeof value === 'number' && movement in normalValues) {
          const normal = (normalValues as Record<string, { normal: number }>)[movement]?.normal;
          if (normal && value < normal * 0.75) {
            restrictions.push(`${movement} ${value}°`);
          }
        }
      }
      if (restrictions.length > 0) {
        romSummary.push(`${region.charAt(0).toUpperCase() + region.slice(1)}: restricted ${restrictions.join(', ')}`);
      }
    }
  }
  if (romSummary.length > 0) {
    sections.push(`RANGE OF MOTION: ${romSummary.join('; ')}`);
  }

  // General observations
  if (exam.generalObservations) {
    sections.push(`OBSERVATIONS: ${exam.generalObservations}`);
  }

  return sections.join('\n\n');
}

function compareROM(
  rom1: Record<string, number> | null,
  rom2: Record<string, number> | null
): { movement: string; value1: number | null; value2: number | null; change: number | null }[] {
  const movements = ['flexion', 'extension', 'leftLateralFlexion', 'rightLateralFlexion', 'leftRotation', 'rightRotation'];

  return movements.map((m) => {
    const v1 = rom1?.[m] ?? null;
    const v2 = rom2?.[m] ?? null;
    return {
      movement: m,
      value1: v1,
      value2: v2,
      change: v1 !== null && v2 !== null ? v2 - v1 : null,
    };
  });
}

function compareOrthopedicTests(
  tests1: Array<{ testName: string; result: string }> | null,
  tests2: Array<{ testName: string; result: string }> | null
): { testName: string; result1: string | null; result2: string | null; changed: boolean }[] {
  const allTests = new Set<string>();
  tests1?.forEach((t) => allTests.add(t.testName));
  tests2?.forEach((t) => allTests.add(t.testName));

  return Array.from(allTests).map((testName) => {
    const t1 = tests1?.find((t) => t.testName === testName);
    const t2 = tests2?.find((t) => t.testName === testName);
    return {
      testName,
      result1: t1?.result ?? null,
      result2: t2?.result ?? null,
      changed: t1?.result !== t2?.result,
    };
  });
}
