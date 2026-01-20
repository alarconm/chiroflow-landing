import { Prisma, PrismaClient } from '@prisma/client';

// Models that should be audited
const AUDITED_MODELS = ['User', 'Organization', 'Patient', 'Appointment', 'Billing', 'Claim'];

// Context for passing user and org info through the audit
type AuditContext = {
  userId?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
};

// Global context storage (for the current request)
let currentAuditContext: AuditContext | null = null;

export function setAuditContext(context: AuditContext) {
  currentAuditContext = context;
}

export function clearAuditContext() {
  currentAuditContext = null;
}

export function getAuditContext(): AuditContext | null {
  return currentAuditContext;
}

// Create Prisma client with audit logging extension
export function createAuditedPrismaClient() {
  const prisma = new PrismaClient();

  return prisma.$extends({
    query: {
      $allModels: {
        async create({ model, args, query }) {
          const result = await query(args);

          // Log the create action
          if (AUDITED_MODELS.includes(model) && currentAuditContext?.organizationId) {
            const entityId = (result as { id?: string }).id;
            await prisma.auditLog.create({
              data: {
                action: 'CREATE',
                entityType: model,
                entityId: entityId ?? undefined,
                changes: args.data as Prisma.JsonObject,
                userId: currentAuditContext.userId,
                organizationId: currentAuditContext.organizationId,
                ipAddress: currentAuditContext.ipAddress ?? 'unknown',
                userAgent: currentAuditContext.userAgent ?? 'unknown',
              },
            });
          }

          return result;
        },
        async update({ model, args, query }) {
          // Get the old data before update
          let oldData: unknown = null;
          if (AUDITED_MODELS.includes(model) && currentAuditContext?.organizationId) {
            try {
              // @ts-expect-error - dynamic model access
              oldData = await prisma[model.toLowerCase()].findUnique({
                where: args.where,
              });
            } catch {
              // Ignore errors getting old data
            }
          }

          const result = await query(args);

          // Log the update action
          if (AUDITED_MODELS.includes(model) && currentAuditContext?.organizationId) {
            const entityId = (result as { id?: string }).id;
            await prisma.auditLog.create({
              data: {
                action: 'UPDATE',
                entityType: model,
                entityId: entityId ?? undefined,
                changes: {
                  before: oldData as Prisma.JsonValue,
                  after: args.data as Prisma.JsonValue,
                } as Prisma.JsonObject,
                userId: currentAuditContext.userId,
                organizationId: currentAuditContext.organizationId,
                ipAddress: currentAuditContext.ipAddress ?? 'unknown',
                userAgent: currentAuditContext.userAgent ?? 'unknown',
              },
            });
          }

          return result;
        },
        async delete({ model, args, query }) {
          // Get the data before delete
          let oldData: unknown = null;
          if (AUDITED_MODELS.includes(model) && currentAuditContext?.organizationId) {
            try {
              // @ts-expect-error - dynamic model access
              oldData = await prisma[model.toLowerCase()].findUnique({
                where: args.where,
              });
            } catch {
              // Ignore errors getting old data
            }
          }

          const result = await query(args);

          // Log the delete action
          if (AUDITED_MODELS.includes(model) && currentAuditContext?.organizationId) {
            const entityId =
              (oldData as { id?: string })?.id ?? (args.where as { id?: string })?.id;
            await prisma.auditLog.create({
              data: {
                action: 'DELETE',
                entityType: model,
                entityId: entityId ?? undefined,
                changes: { deleted: oldData as Prisma.JsonValue } as Prisma.JsonObject,
                userId: currentAuditContext.userId,
                organizationId: currentAuditContext.organizationId,
                ipAddress: currentAuditContext.ipAddress ?? 'unknown',
                userAgent: currentAuditContext.userAgent ?? 'unknown',
              },
            });
          }

          return result;
        },
      },
      // Prevent modifications to AuditLog (immutable)
      auditLog: {
        async update() {
          throw new Error('Audit logs are immutable and cannot be updated');
        },
        async updateMany() {
          throw new Error('Audit logs are immutable and cannot be updated');
        },
        async delete() {
          throw new Error('Audit logs are immutable and cannot be deleted');
        },
        async deleteMany() {
          throw new Error('Audit logs are immutable and cannot be deleted');
        },
      },
    },
  });
}

export type AuditedPrismaClient = ReturnType<typeof createAuditedPrismaClient>;
