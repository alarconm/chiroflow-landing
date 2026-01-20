import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Document type enum values
const DOCUMENT_TYPES = [
  'INSURANCE_CARD_FRONT',
  'INSURANCE_CARD_BACK',
  'PHOTO_ID',
  'CONSENT_FORM',
  'INTAKE_FORM',
  'CLINICAL_NOTE',
  'LAB_RESULT',
  'IMAGING',
  'REFERRAL',
  'OTHER',
] as const;

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
    const patientId = formData.get('patientId') as string | null;
    const documentType = formData.get('type') as string | null;
    const description = formData.get('description') as string | null;
    const isConfidential = formData.get('isConfidential') === 'true';

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!patientId) {
      return NextResponse.json({ error: 'Patient ID is required' }, { status: 400 });
    }

    if (!documentType || !DOCUMENT_TYPES.includes(documentType as typeof DOCUMENT_TYPES[number])) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not allowed. Allowed types: JPEG, PNG, GIF, WebP, PDF, DOC, DOCX' },
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

    // Generate unique filename
    const fileExtension = path.extname(file.name) || getExtensionFromMime(file.type);
    const uniqueFilename = `${randomUUID()}${fileExtension}`;

    // Create storage directory structure: uploads/{orgId}/{patientId}/
    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      user.organizationId,
      patientId
    );

    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Write file to disk
    const filePath = path.join(uploadDir, uniqueFilename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Create storage key (relative path for retrieval)
    const storageKey = `${user.organizationId}/${patientId}/${uniqueFilename}`;

    // Create document record in database
    const document = await prisma.patientDocument.create({
      data: {
        patientId,
        type: documentType as typeof DOCUMENT_TYPES[number],
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        storageKey,
        description: description || null,
        isConfidential,
        uploadedById: user.id,
      },
    });

    // Log document upload
    await auditLog('DOCUMENT_CREATE', 'PatientDocument', {
      entityId: document.id,
      changes: {
        fileName: file.name,
        type: documentType,
        fileSize: file.size,
        patientId,
      },
      userId: user.id,
      organizationId: user.organizationId,
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        type: document.type,
        fileName: document.fileName,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        uploadedAt: document.uploadedAt,
      },
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}

function getExtensionFromMime(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  };
  return mimeToExt[mimeType] || '';
}
