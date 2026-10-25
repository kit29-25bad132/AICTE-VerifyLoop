import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@aicte/database';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { documentQueue } from '../queues/document-queue.js';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(process.cwd(), 'uploads', 'tmp');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { files: 10, fileSize: 50 * 1024 * 1024 },
});
const magic: Record<string, Buffer> = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]),
  docx: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
};
function validMagic(filePath: string, ext: string): boolean {
  const expected = magic[ext];
  if (!expected) return false;
  const fd = fs.openSync(filePath, 'r');
  const actual = Buffer.alloc(expected.length);
  fs.readSync(fd, actual, 0, expected.length, 0);
  fs.closeSync(fd);
  return actual.equals(expected);
}
function hash(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

router.post('/upload', requireAuth, upload.array('files', 10), async (req: Request, res: Response) => {
  const { applicationId, docType } = req.body as { applicationId?: string; docType?: string };
  if (!applicationId || !docType) {
    res.status(400).json({ error: 'applicationId and docType are required' });
    return;
  }
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { institution: { include: { users: { where: { id: req.user!.userId } } } } },
  });
  if (!application) { res.status(404).json({ error: 'Application not found' }); return; }
  if (req.user!.role === 'APPLICANT' && application.institution.users.length === 0) {
    res.status(403).json({ error: 'Forbidden: not your institution' }); return;
  }
  const files = (req.files ?? []) as Express.Multer.File[];
  if (!files.length) { res.status(400).json({ error: 'No files uploaded' }); return; }
  const results: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!validMagic(file.path, ext)) {
      fs.unlinkSync(file.path);
      results.push({ originalName: file.originalname, error: 'Magic byte mismatch — file rejected' });
      continue;
    }
    const fileHash = hash(file.path);
    const existing = await prisma.document.findFirst({ where: { applicationId, fileHash } });
    if (existing) {
      fs.unlinkSync(file.path);
      results.push({ originalName: file.originalname, documentId: existing.id, duplicate: true });
      continue;
    }
    const storageDir = path.join(process.cwd(), 'uploads', application.institutionId, applicationId, 'v1');
    fs.mkdirSync(storageDir, { recursive: true });
    const fileName = `${docType}_${Date.now()}.${ext}`;
    const storagePath = path.join(storageDir, fileName);
    fs.renameSync(file.path, storagePath);
    const doc = await prisma.document.create({
      data: { applicationId, docType, fileHash, storageUrl: `/uploads/${application.institutionId}/${applicationId}/v1/${fileName}` },
    });
    await documentQueue.add('process-document-job', { documentId: doc.id, applicationId, storagePath, docType });
    await prisma.auditLog.create({
      data: { applicationId, action: 'DOCUMENT_UPLOADED', actor: req.user!.userId, actorRole: req.user!.role as never, detail: { documentId: doc.id }, previousHash: '', currentHash: fileHash },
    });
    results.push({ originalName: file.originalname, documentId: doc.id, queued: true });
  }
  res.status(207).json({ results });
});

router.get('/:id/status', requireAuth, async (req: Request, res: Response) => {
  const document = await prisma.document.findUnique({
    where: { id: String(req.params.id) },
    include: { application: { select: { status: true, institutionId: true } } },
  });
  if (!document) { res.status(404).json({ error: 'Document not found' }); return; }
  if (req.user!.role === 'APPLICANT' && req.user!.institutionId !== document.application.institutionId) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  res.json({ id: document.id, status: document.application.status, pageCount: document.pageCount, ocrUsed: document.ocrUsed, extractedData: document.extractedData });
});

export default router;
