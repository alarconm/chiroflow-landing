import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// GET /api/documents/[id] - Download document
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Get document with patient to verify organization
    const document = await prisma.patientDocument.findFirst({
      where: {
        id,
        patient: { organizationId: user.organizationId },
      },
      include: {
        patient: {
          select: { id: true, mrn: true },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Check access for confidential documents
    if (document.isConfidential) {
      const allowedRoles = ['OWNER', 'ADMIN', 'PROVIDER'];
      if (!allowedRoles.includes(user.role)) {
        return NextResponse.json(
          { error: 'Access denied to confidential document' },
          { status: 403 }
        );
      }
    }

    // Build file path
    const filePath = path.join(process.cwd(), 'uploads', document.storageKey);

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found on server' }, { status: 404 });
    }

    // Read file
    const fileBuffer = await readFile(filePath);

    // Log document access
    await auditLog('DOCUMENT_VIEW', 'PatientDocument', {
      entityId: document.id,
      changes: {
        fileName: document.fileName,
        type: document.type,
        action: 'download',
      },
      userId: user.id,
      organizationId: user.organizationId,
    });

    // Determine if we should inline (view) or attachment (download)
    const viewParam = request.nextUrl.searchParams.get('view');
    const isInline = viewParam === 'true';

    // Return file with appropriate headers
    const headers = new Headers();
    headers.set('Content-Type', document.mimeType);
    headers.set('Content-Length', document.fileSize.toString());

    if (isInline && document.mimeType.startsWith('image/') || document.mimeType === 'application/pdf') {
      headers.set('Content-Disposition', `inline; filename="${document.fileName}"`);
    } else {
      headers.set('Content-Disposition', `attachment; filename="${document.fileName}"`);
    }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Document download error:', error);
    return NextResponse.json(
      { error: 'Failed to download document' },
      { status: 500 }
    );
  }
}

// DELETE /api/documents/[id] - Delete document (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Check admin permission
    const adminRoles = ['OWNER', 'ADMIN'];
    if (!adminRoles.includes(user.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get document to verify organization
    const document = await prisma.patientDocument.findFirst({
      where: {
        id,
        patient: { organizationId: user.organizationId },
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Log deletion before removing
    await auditLog('DOCUMENT_DELETE', 'PatientDocument', {
      entityId: id,
      changes: {
        fileName: document.fileName,
        type: document.type,
        storageKey: document.storageKey,
      },
      userId: user.id,
      organizationId: user.organizationId,
    });

    // Delete document record (file remains in storage for audit)
    await prisma.patientDocument.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Document delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}
