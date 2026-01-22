import { router, protectedProcedure } from '../trpc';

export const dashboardRouter = router({
  // Get dashboard stats
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get today's appointments count
    const todayAppointments = await ctx.prisma.appointment.count({
      where: {
        organizationId: ctx.user.organizationId,
        startTime: { gte: today, lt: tomorrow },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
    });

    // Get pending claims count (DRAFT, READY, SUBMITTED, ACCEPTED - anything not PAID/DENIED/VOID/REJECTED)
    const pendingClaims = await ctx.prisma.claim.count({
      where: {
        organizationId: ctx.user.organizationId,
        status: { in: ['DRAFT', 'READY', 'SUBMITTED', 'ACCEPTED'] },
      },
    });

    // Get outstanding balance (sum of unpaid charges)
    const chargesResult = await ctx.prisma.charge.aggregate({
      where: {
        organizationId: ctx.user.organizationId,
        status: { in: ['PENDING', 'BILLED'] },
      },
      _sum: {
        balance: true,
      },
    });
    const outstandingBalance = chargesResult._sum.balance?.toNumber() || 0;

    // Get patient count from last 30 days
    const recentPatients = await ctx.prisma.patient.count({
      where: {
        organizationId: ctx.user.organizationId,
        createdAt: { gte: thirtyDaysAgo },
        status: { not: 'ARCHIVED' },
      },
    });

    // Get total active patients for context
    const totalPatients = await ctx.prisma.patient.count({
      where: {
        organizationId: ctx.user.organizationId,
        status: { not: 'ARCHIVED' },
      },
    });

    return {
      todayAppointments,
      pendingClaims,
      outstandingBalance,
      recentPatients,
      totalPatients,
    };
  }),

  // Get upcoming appointments
  getUpcomingAppointments: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await ctx.prisma.appointment.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        startTime: { gte: now, lte: endOfDay },
        status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
      },
      include: {
        patient: {
          include: {
            demographics: {
              select: {
                firstName: true,
                lastName: true,
                preferredName: true,
              },
            },
          },
        },
        appointmentType: {
          select: {
            name: true,
            color: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
      take: 10,
    });

    return appointments.map((apt) => {
      const firstName = apt.patient.demographics?.firstName || 'Unknown';
      const lastName = apt.patient.demographics?.lastName || 'Patient';
      const patientName = firstName.startsWith('[DEMO]')
        ? firstName + ' ' + lastName
        : firstName + ' ' + lastName;

      return {
        id: apt.id,
        time: apt.startTime,
        patientName,
        type: apt.appointmentType?.name || 'Appointment',
        status: apt.status.toLowerCase(),
        color: apt.appointmentType?.color || '#10B981',
      };
    });
  }),
});
