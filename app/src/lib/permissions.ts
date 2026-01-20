import type { Role } from '@prisma/client';

// Define all possible actions in the system
export type Action =
  // Organization
  | 'organization:read'
  | 'organization:update'
  | 'organization:delete'
  // Users
  | 'users:list'
  | 'users:read'
  | 'users:create'
  | 'users:update'
  | 'users:delete'
  // Patients
  | 'patients:list'
  | 'patients:read'
  | 'patients:create'
  | 'patients:update'
  | 'patients:delete'
  // Appointments
  | 'appointments:list'
  | 'appointments:read'
  | 'appointments:create'
  | 'appointments:update'
  | 'appointments:delete'
  // Billing
  | 'billing:list'
  | 'billing:read'
  | 'billing:create'
  | 'billing:update'
  | 'billing:delete'
  // Claims
  | 'claims:list'
  | 'claims:read'
  | 'claims:create'
  | 'claims:update'
  | 'claims:submit'
  // Reports
  | 'reports:view'
  | 'reports:export'
  // Settings
  | 'settings:read'
  | 'settings:update'
  // Audit Logs
  | 'audit:view';

// Permission matrix: which roles can perform which actions
const permissionMatrix: Record<Role, Action[]> = {
  OWNER: [
    // Organization
    'organization:read',
    'organization:update',
    'organization:delete',
    // Users
    'users:list',
    'users:read',
    'users:create',
    'users:update',
    'users:delete',
    // Patients
    'patients:list',
    'patients:read',
    'patients:create',
    'patients:update',
    'patients:delete',
    // Appointments
    'appointments:list',
    'appointments:read',
    'appointments:create',
    'appointments:update',
    'appointments:delete',
    // Billing
    'billing:list',
    'billing:read',
    'billing:create',
    'billing:update',
    'billing:delete',
    // Claims
    'claims:list',
    'claims:read',
    'claims:create',
    'claims:update',
    'claims:submit',
    // Reports
    'reports:view',
    'reports:export',
    // Settings
    'settings:read',
    'settings:update',
    // Audit
    'audit:view',
  ],
  ADMIN: [
    // Organization
    'organization:read',
    'organization:update',
    // Users
    'users:list',
    'users:read',
    'users:create',
    'users:update',
    // Patients
    'patients:list',
    'patients:read',
    'patients:create',
    'patients:update',
    'patients:delete',
    // Appointments
    'appointments:list',
    'appointments:read',
    'appointments:create',
    'appointments:update',
    'appointments:delete',
    // Billing
    'billing:list',
    'billing:read',
    'billing:create',
    'billing:update',
    'billing:delete',
    // Claims
    'claims:list',
    'claims:read',
    'claims:create',
    'claims:update',
    'claims:submit',
    // Reports
    'reports:view',
    'reports:export',
    // Settings
    'settings:read',
    'settings:update',
    // Audit
    'audit:view',
  ],
  PROVIDER: [
    // Organization
    'organization:read',
    // Patients
    'patients:list',
    'patients:read',
    'patients:create',
    'patients:update',
    // Appointments
    'appointments:list',
    'appointments:read',
    'appointments:create',
    'appointments:update',
    // Billing
    'billing:list',
    'billing:read',
    // Claims
    'claims:list',
    'claims:read',
    // Reports
    'reports:view',
    // Settings
    'settings:read',
  ],
  STAFF: [
    // Organization
    'organization:read',
    // Patients
    'patients:list',
    'patients:read',
    'patients:create',
    'patients:update',
    // Appointments
    'appointments:list',
    'appointments:read',
    'appointments:create',
    'appointments:update',
    // Settings
    'settings:read',
  ],
  BILLER: [
    // Organization
    'organization:read',
    // Patients
    'patients:list',
    'patients:read',
    // Billing
    'billing:list',
    'billing:read',
    'billing:create',
    'billing:update',
    'billing:delete',
    // Claims
    'claims:list',
    'claims:read',
    'claims:create',
    'claims:update',
    'claims:submit',
    // Reports
    'reports:view',
    'reports:export',
    // Settings
    'settings:read',
  ],
};

// Check if a role has a specific permission
export function hasPermission(role: Role, action: Action): boolean {
  return permissionMatrix[role]?.includes(action) ?? false;
}

// Check if a role has any of the specified permissions
export function hasAnyPermission(role: Role, actions: Action[]): boolean {
  return actions.some((action) => hasPermission(role, action));
}

// Check if a role has all of the specified permissions
export function hasAllPermissions(role: Role, actions: Action[]): boolean {
  return actions.every((action) => hasPermission(role, action));
}

// Get all permissions for a role
export function getPermissions(role: Role): Action[] {
  return permissionMatrix[role] ?? [];
}

// Check if a role is at least a certain level
const roleHierarchy: Role[] = ['STAFF', 'BILLER', 'PROVIDER', 'ADMIN', 'OWNER'];

export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  const userLevel = roleHierarchy.indexOf(userRole);
  const requiredLevel = roleHierarchy.indexOf(requiredRole);
  return userLevel >= requiredLevel;
}

// Role display names
export const roleDisplayNames: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Administrator',
  PROVIDER: 'Provider',
  STAFF: 'Staff',
  BILLER: 'Biller',
};

// Role descriptions
export const roleDescriptions: Record<Role, string> = {
  OWNER: 'Full access to all features and settings. Can delete the organization.',
  ADMIN: 'Can manage users, settings, and view all data. Cannot delete the organization.',
  PROVIDER: 'Can manage patients, appointments, and view billing. Limited settings access.',
  STAFF: 'Can manage patients and appointments. No billing or settings access.',
  BILLER: 'Specialized access for billing and claims. Limited patient access.',
};
