import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';

// Custom user type with our fields
export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organizationId: string;
  organizationName: string;
};

// Extend the session types
declare module 'next-auth' {
  interface User extends AuthUser {}

  interface Session {
    user: AuthUser;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        tenantId: { label: 'Tenant ID', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const email = credentials.email as string;
        const password = credentials.password as string;
        const tenantId = credentials.tenantId as string | undefined;

        // Find user by email - if tenantId provided, scope to that tenant
        const whereClause = tenantId ? { email, organizationId: tenantId } : { email };

        const user = await prisma.user.findFirst({
          where: whereClause,
          include: {
            organization: true,
          },
        });

        if (!user) {
          throw new Error('Invalid email or password');
        }

        if (!user.isActive) {
          throw new Error('Account is disabled');
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          throw new Error('Invalid email or password');
        }

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email as string;
        token.firstName = (user as AuthUser).firstName;
        token.lastName = (user as AuthUser).lastName;
        token.role = (user as AuthUser).role;
        token.organizationId = (user as AuthUser).organizationId;
        token.organizationName = (user as AuthUser).organizationName;
      }
      return token;
    },
    async session({ session, token }) {
      // Override session.user with our custom fields
      (session.user as AuthUser) = {
        id: token.id as string,
        email: token.email as string,
        firstName: token.firstName as string,
        lastName: token.lastName as string,
        role: token.role as Role,
        organizationId: token.organizationId as string,
        organizationName: token.organizationName as string,
      };
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
});
