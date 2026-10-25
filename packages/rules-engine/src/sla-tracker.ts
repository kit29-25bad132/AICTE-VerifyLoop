import type { PrismaClient } from '@prisma/client';
export async function updateSLAStatuses(prisma: PrismaClient): Promise<void> {
  const apps = await prisma.application.findMany({ where: { status: { notIn: ['APPROVED', 'REJECTED'] } } });
  for (const app of apps) {
    const days = Math.ceil((app.reviewerDeadline.getTime() - Date.now()) / 86400000);
    const status = days > 7 ? 'ON_TRACK' : days > 2 ? 'AT_RISK' : 'BREACHED';
    if (status !== app.slaStatus) await prisma.application.update({ where: { id: app.id }, data: { slaStatus: status } });
  }
}
