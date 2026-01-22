import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

// Max file size: 20MB for high-quality posture photos
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// Allowed MIME types for posture images
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

// Posture view types matching Prisma enum
const POSTURE_VIEWS = ['ANTERIOR', 'POSTERIOR', 'LATERAL_LEFT', 'LATERAL_RIGHT'] as const;

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user with organization
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, organizationId: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const assessmentId = formData.get('assessmentId') as string | null;
    const patientId = formData.get('patientId') as string | null;
    const view = formData.get('view') as string | null;
    const notes = formData.get('notes') as string | null;
    const encounterId = formData.get('encounterId') as string | null;

    // For batch uploads - if no assessmentId provided, create one
    const createNewAssessment = formData.get('createAssessment') === 'true';

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!patientId) {
      return NextResponse.json({ error: 'Patient ID is required' }, { status: 400 });
    }

    if (!view || !POSTURE_VIEWS.includes(view as typeof POSTURE_VIEWS[number])) {
      return NextResponse.json({
        error: 'Valid view type is required (ANTERIOR, POSTERIOR, LATERAL_LEFT, LATERAL_RIGHT)'
      }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 20MB limit' },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not allowed. Allowed types: JPEG, PNG, WebP' },
        { status: 400 }
      );
    }

    // Verify patient belongs to organization
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        organizationId: user.organizationId,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Get or create assessment
    let assessment;
    if (assessmentId) {
      // Verify assessment exists and belongs to the patient
      assessment = await prisma.postureAssessment.findFirst({
        where: {
          id: assessmentId,
          patientId,
          organizationId: user.organizationId,
        },
      });

      if (!assessment) {
        return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
      }
    } else if (createNewAssessment) {
      // Create a new assessment for this upload session
      assessment = await prisma.postureAssessment.create({
        data: {
          patientId,
          organizationId: user.organizationId,
          encounterId: encounterId || null,
          notes: 'Auto-created for image upload',
        },
      });
    } else {
      // Find the most recent incomplete assessment or create one
      assessment = await prisma.postureAssessment.findFirst({
        where: {
          patientId,
          organizationId: user.organizationId,
          isComplete: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!assessment) {
        assessment = await prisma.postureAssessment.create({
          data: {
            patientId,
            organizationId: user.organizationId,
            encounterId: encounterId || null,
          },
        });
      }
    }

    // Generate unique filename
    const fileExtension = getExtensionFromMime(file.type);
    const uniqueFilename = `${randomUUID()}${fileExtension}`;
    const thumbnailFilename = `${randomUUID()}_thumb${fileExtension}`;

    // Create storage directory structure: uploads/{orgId}/posture/{patientId}/
    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      user.organizationId,
      'posture',
      patientId
    );

    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Process image - auto-orient based on EXIF data
    const buffer = Buffer.from(await file.arrayBuffer());

    // Get image metadata
    const metadata = await sharp(buffer).metadata();

    // Auto-orient and convert to optimized JPEG
    const processedBuffer = await sharp(buffer)
      .rotate() // Auto-orient based on EXIF
      .jpeg({ quality: 85 })
      .toBuffer();

    // Create thumbnail (300px width)
    const thumbnailBuffer = await sharp(buffer)
      .rotate()
      .resize(300, null, { fit: 'inside' })
      .jpeg({ quality: 70 })
      .toBuffer();

    // Write files to disk
    const filePath = path.join(uploadDir, uniqueFilename);
    const thumbnailPath = path.join(uploadDir, thumbnailFilename);

    await writeFile(filePath, processedBuffer);
    await writeFile(thumbnailPath, thumbnailBuffer);

    // Create storage keys (relative paths for retrieval)
    const storageKey = `${user.organizationId}/posture/${patientId}/${uniqueFilename}`;
    const thumbnailKey = `${user.organizationId}/posture/${patientId}/${thumbnailFilename}`;

    // Create posture image record in database
    const postureImage = await prisma.postureImage.create({
      data: {
        assessmentId: assessment.id,
        imageUrl: `/api/posture/images/${storageKey}`,
        thumbnailUrl: `/api/posture/images/${thumbnailKey}`,
        view: view as typeof POSTURE_VIEWS[number],
        captureDate: new Date(),
        notes: notes || null,
        width: metadata.width || null,
        height: metadata.height || null,
        fileSize: processedBuffer.length,
        mimeType: 'image/jpeg',
      },
    });

    // Log image upload
    await auditLog('POSTURE_IMAGE_UPLOAD', 'PostureImage', {
      entityId: postureImage.id,
      changes: {
        view,
        fileSize: processedBuffer.length,
        patientId,
        assessmentId: assessment.id,
      },
      userId: user.id,
      organizationId: user.organizationId,
    });

    return NextResponse.json({
      success: true,
      image: {
        id: postureImage.id,
        view: postureImage.view,
        imageUrl: postureImage.imageUrl,
        thumbnailUrl: postureImage.thumbnailUrl,
        width: postureImage.width,
        height: postureImage.height,
        captureDate: postureImage.captureDate,
      },
      assessment: {
        id: assessment.id,
        isNew: !assessmentId && createNewAssessment,
      },
    });
  } catch (error) {
    console.error('Posture image upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload posture image' },
      { status: 500 }
    );
  }
}

function getExtensionFromMime(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return mimeToExt[mimeType] || '.jpg';
}
