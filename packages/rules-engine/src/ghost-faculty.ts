import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
export async function detectGhostFaculty(members: Array<{ name: string; pan_number?: string }>, institutionId: string, academicYear: string, prisma: PrismaClient) {
  const alerts: Array<{ facultyName: string; panHash: string; conflictingInstitution: string; conflictingState: string; severity: 'CRITICAL' }> = [];
  for (const member of members) {
    if (!member.pan_number) continue;
    const panHash = crypto.createHash('sha256').update(member.pan_number.toUpperCase()).digest('hex');
    await prisma.facultyHash.upsert({ where: { institutionId_panHash: { institutionId, panHash } }, create: { institutionId, panHash, academicYear }, update: {} });
    const collision = await prisma.facultyHash.findFirst({ where: { panHash, academicYear, NOT: { institutionId } }, include: { institution: true } });
    if (collision) alerts.push({ facultyName: member.name, panHash, conflictingInstitution: collision.institution.name, conflictingState: collision.institution.state, severity: 'CRITICAL' });
  }
  return alerts;
}
