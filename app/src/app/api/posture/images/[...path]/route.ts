import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
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

    const resolvedParams = await params;
    const pathSegments = resolvedParams.path;

    // Expected format: orgId/posture/patientId/filename
    if (pathSegments.length < 4) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const [orgId, , patientId] = pathSegments;

    // Verify org access - users can only access their own org's files
    if (orgId !== user.organizationId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify patient belongs to organization
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        organizationId: user.organizationId,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Construct file path
    const filePath = path.join(process.cwd(), 'uploads', ...pathSegments);

    // Security: Prevent path traversal
    const normalizedPath = path.normalize(filePath);
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!normalizedPath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Check if file exists
    if (!existsSync(normalizedPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Read and serve the file
    const buffer = await readFile(normalizedPath);

    // Determine content type from extension
    const ext = path.extname(normalizedPath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Return the image with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=31536000', // Cache for 1 year (HIPAA secure)
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Image retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve image' },
      { status: 500 }
    );
  }
}
