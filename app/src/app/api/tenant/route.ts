import { NextResponse } from 'next/server';
import { getCurrentTenant } from '@/lib/tenant';

export async function GET() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Tenant not found',
        code: 'TENANT_NOT_FOUND',
      },
      { status: 401 }
    );
  }

  return NextResponse.json(tenant);
}
