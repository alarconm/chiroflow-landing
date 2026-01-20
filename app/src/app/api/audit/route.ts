import { NextRequest, NextResponse } from 'next/server';
import { withApiRole, forbiddenResponse } from '@/lib/api-auth';
import { queryAuditLogs, type AuditAction } from '@/lib/audit';

// GET /api/audit - Query audit logs
export const GET = withApiRole(
  async (req: NextRequest, { user }) => {
    const { searchParams } = new URL(req.url);

    // Parse query parameters
    const userId = searchParams.get('userId') ?? undefined;
    const action = searchParams.get('action') as AuditAction | undefined;
    const entityType = searchParams.get('entityType') ?? undefined;
    const entityId = searchParams.get('entityId') ?? undefined;
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

    // Query audit logs
    const result = await queryAuditLogs({
      organizationId: user.organizationId,
      userId,
      action,
      entityType,
      entityId,
      startDate,
      endDate,
      limit: Math.min(limit, 100), // Cap at 100
      offset,
    });

    return NextResponse.json(result);
  },
  { permissions: ['audit:view'] }
);

// POST /api/audit - Not allowed (audit logs are auto-generated)
export async function POST() {
  return forbiddenResponse('Audit logs cannot be created manually');
}

// PUT /api/audit - Not allowed (audit logs are immutable)
export async function PUT() {
  return forbiddenResponse('Audit logs are immutable and cannot be modified');
}

// DELETE /api/audit - Not allowed (audit logs are immutable)
export async function DELETE() {
  return forbiddenResponse('Audit logs are immutable and cannot be deleted');
}
