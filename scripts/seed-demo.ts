import 'dotenv/config';
import {
  ApplicationStatus,
  PrismaClient,
  SLAStatus,
  Severity,
  TrustState,
  UserRole,
} from '@aicte/database';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo data...');
  const instTN = await prisma.institution.upsert({
    where: { aicteId: 'AICTE-TN-0001' },
    update: {},
    create: { aicteId: 'AICTE-TN-0001', name: 'Sri Venkateswara College of Engineering', state: 'Tamil Nadu' },
  });
  const instAP = await prisma.institution.upsert({
    where: { aicteId: 'AICTE-AP-0001' },
    update: {},
    create: { aicteId: 'AICTE-AP-0001', name: 'Andhra University College of Engineering', state: 'Andhra Pradesh' },
  });
  const hash = await bcrypt.hash('Demo@1234', 12);
  const officer = await prisma.user.upsert({
    where: { email: 'officer@aicte.gov.in' },
    update: { passwordHash: hash },
    create: { email: 'officer@aicte.gov.in', passwordHash: hash, role: UserRole.SCRUTINY_OFFICER },
  });
  const applicant1 = await prisma.user.upsert({
    where: { email: 'principal@svce.ac.in' },
    update: { passwordHash: hash, institutionId: instTN.id },
    create: { email: 'principal@svce.ac.in', passwordHash: hash, role: UserRole.APPLICANT, institutionId: instTN.id },
  });
  await prisma.user.upsert({
    where: { email: 'principal@auce.ac.in' },
    update: { passwordHash: hash, institutionId: instAP.id },
    create: { email: 'principal@auce.ac.in', passwordHash: hash, role: UserRole.APPLICANT, institutionId: instAP.id },
  });
  const app1 = await prisma.application.create({
    data: {
      institutionId: instTN.id,
      category: 'Extension of Approval 2025-26',
      status: ApplicationStatus.REVIEW_READY,
      slaStatus: SLAStatus.AT_RISK,
      reviewerDeadline: new Date(Date.now() + 4 * 86400000),
      assignedReviewerId: officer.id,
    },
  });
  const doc1 = await prisma.document.create({
    data: {
      applicationId: app1.id,
      docType: 'FACULTY_LIST',
      fileHash: crypto.randomBytes(32).toString('hex'),
      storageUrl: `/uploads/${instTN.id}/${app1.id}/FACULTY_LIST.pdf`,
      pageCount: 12,
    },
  });
  await prisma.finding.createMany({
    data: [
      { applicationId: app1.id, documentId: doc1.id, ruleId: 'APH-2024-F.3.1', severity: Severity.CRITICAL, trustState: TrustState.MISMATCH_DETECTED, explanation: 'Faculty member appears on two institution rolls in the same academic year.', suggestion: 'Cross-check PAN hash against the FacultyHash registry.', quote: 'Dr. Rajan Kumar, PAN: ABCPK1234E', pageNumber: 3, boundingCoords: { page: 3, x: 120, y: 340, width: 400, height: 24 } },
      { applicationId: app1.id, documentId: doc1.id, ruleId: 'APH-2024-F.5.2', severity: Severity.CRITICAL, trustState: TrustState.SOURCE_UNAVAILABLE, explanation: 'State Government NOC is expired.', suggestion: 'Upload a renewed NOC.', pageNumber: 7 },
      { applicationId: app1.id, ruleId: 'APH-2024-I.2.1', severity: Severity.WARNING, trustState: TrustState.UNGROUNDED_NEEDS_REVIEW, explanation: 'Declared laboratory area is below the stated minimum.', suggestion: 'Provide an updated certified floor plan.' },
      { applicationId: app1.id, ruleId: 'APH-2024-D.1.3', severity: Severity.WARNING, trustState: TrustState.MANUAL_REVIEW_REQUIRED, explanation: 'Mandatory Form-F was not found.', suggestion: 'Upload signed Form-F for AY 2025-26.' },
    ],
  });
  const ghostPAN = crypto.createHash('sha256').update('ABCPK1234E').digest('hex');
  await prisma.facultyHash.createMany({
    data: [
      { institutionId: instTN.id, panHash: ghostPAN, academicYear: '2025-26' },
      { institutionId: instAP.id, panHash: ghostPAN, academicYear: '2025-26' },
    ],
  });
  await prisma.auditLog.create({
    data: {
      applicationId: app1.id,
      action: 'DOCUMENT_PROCESSED',
      actor: 'system',
      actorRole: UserRole.ADMIN,
      detail: { documentId: doc1.id, findingsGenerated: 4 },
      previousHash: crypto.randomBytes(32).toString('hex'),
      currentHash: crypto.randomBytes(32).toString('hex'),
    },
  });
  console.log('Seed complete.');
  console.log('Scrutiny Officer: officer@aicte.gov.in / Demo@1234');
  console.log('Applicant (TN): principal@svce.ac.in / Demo@1234');
  console.log('Applicant (AP): principal@auce.ac.in / Demo@1234');
  console.log(`Application ID: ${app1.id} (status: REVIEW_READY, 4 findings)`);
  void applicant1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
