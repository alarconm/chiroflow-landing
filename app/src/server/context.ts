import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { AuthUser } from '@/lib/auth';

export async function createContext() {
  const session = await auth();

  return {
    prisma,
    session,
    user: session?.user as AuthUser | undefined,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
