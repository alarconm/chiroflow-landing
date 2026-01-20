import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create test organization
  const organization = await prisma.organization.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      name: 'Demo Chiropractic',
      subdomain: 'demo',
      settings: {
        timezone: 'America/Los_Angeles',
        currency: 'USD',
        appointmentDuration: 30,
      },
    },
  });

  console.log(`✅ Created organization: ${organization.name}`);

  // Hash password for admin user
  const passwordHash = await bcrypt.hash('admin123', 10);

  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: {
      email_organizationId: {
        email: 'admin@demo.chiroflow.app',
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      email: 'admin@demo.chiroflow.app',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: Role.OWNER,
      organizationId: organization.id,
    },
  });

  console.log(`✅ Created admin user: ${adminUser.email}`);

  // Create a provider user
  const providerUser = await prisma.user.upsert({
    where: {
      email_organizationId: {
        email: 'provider@demo.chiroflow.app',
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      email: 'provider@demo.chiroflow.app',
      passwordHash: await bcrypt.hash('provider123', 10),
      firstName: 'Dr. Jane',
      lastName: 'Smith',
      role: Role.PROVIDER,
      organizationId: organization.id,
    },
  });

  console.log(`✅ Created provider user: ${providerUser.email}`);

  // Create a staff user
  const staffUser = await prisma.user.upsert({
    where: {
      email_organizationId: {
        email: 'staff@demo.chiroflow.app',
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      email: 'staff@demo.chiroflow.app',
      passwordHash: await bcrypt.hash('staff123', 10),
      firstName: 'John',
      lastName: 'Doe',
      role: Role.STAFF,
      organizationId: organization.id,
    },
  });

  console.log(`✅ Created staff user: ${staffUser.email}`);

  // Create initial audit log entry
  await prisma.auditLog.create({
    data: {
      action: 'SEED',
      entityType: 'System',
      entityId: null,
      changes: {
        description: 'Database seeded with initial data',
      },
      userId: adminUser.id,
      organizationId: organization.id,
    },
  });

  console.log('✅ Created initial audit log');

  console.log('🎉 Seed completed successfully!');
  console.log('\n📋 Test credentials:');
  console.log('   Admin: admin@demo.chiroflow.app / admin123');
  console.log('   Provider: provider@demo.chiroflow.app / provider123');
  console.log('   Staff: staff@demo.chiroflow.app / staff123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
