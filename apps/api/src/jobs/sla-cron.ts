import cron from 'node-cron';
import { PrismaClient } from '@aicte/database';
import { updateSLAStatuses } from '@aicte/rules-engine';
const prisma = new PrismaClient();
export function startSLACron(): void {
  cron.schedule('0 * * * *', async () => {
    console.log('[sla-cron] Running SLA update...');
    await updateSLAStatuses(prisma);
    console.log('[sla-cron] Done.');
  });
  console.log('[sla-cron] SLA cron scheduled (hourly)');
}
