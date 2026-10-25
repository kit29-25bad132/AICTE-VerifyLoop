import 'dotenv/config';
import { Worker } from 'bullmq';
import { PrismaClient } from '@aicte/database';
import { connection } from './redis.js';
import { ocrWithTesseract, parseDocument } from './parser-client.js';
import { ocrWithGemini } from './ocr-fallback.js';
import { extractWithAI } from './ai-extractor.js';
import { evaluateFacultyRatio, evaluateLandArea, evaluateComputerLab, evaluateLibrary, evaluateFireSafety, evaluateNoc, detectGhostFaculty } from '@aicte/rules-engine';
const prisma = new PrismaClient();
interface JobData { documentId: string; applicationId: string; storagePath: string; docType: string; }
const worker = new Worker<JobData>('document-processing', async (job) => {
  const { documentId, applicationId, storagePath, docType } = job.data;
  await prisma.document.update({ where: { id: documentId }, data: { status: 'PROCESSING' } });
  await job.updateProgress(10);
  const parsed = await parseDocument(storagePath);
  let text = parsed.pages.flat().map((span) => span.text).join(' ');
  await prisma.document.update({ where: { id: documentId }, data: { pageCount: parsed.page_count } });
  await job.updateProgress(30);
  if (parsed.needs_ocr) {
    const pages: string[] = [];
    for (const image of parsed.page_images) {
      try {
        pages.push(await ocrWithGemini(image));
      } catch {
        pages.push(await ocrWithTesseract(image));
      }
    }
    const ocr = pages.join('\n');
    if (ocr.length > text.length) text = ocr;
    await prisma.document.update({ where: { id: documentId }, data: { ocrUsed: true } });
  }
  await job.updateProgress(50);
  const facts = await extractWithAI(text, docType);
  if (facts) await prisma.document.update({ where: { id: documentId }, data: { extractedData: facts as object } });
  await job.updateProgress(80);
  if (facts) {
    const rules = docType === 'FACULTY_LIST' ? [evaluateFacultyRatio(facts), ...(await detectGhostFaculty((facts.faculty_members as Array<{name: string; pan_number?: string}> ?? []), (await prisma.application.findUniqueOrThrow({ where: { id: applicationId } })).institutionId, `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, prisma)) as never[]] : docType === 'LAND_DEED' ? [evaluateLandArea(facts)] : docType === 'FLOOR_PLAN' ? [evaluateComputerLab(facts), evaluateLibrary(facts)] : docType === 'FIRE_SAFETY' ? [evaluateFireSafety(facts)] : docType === 'NOC' ? [evaluateNoc(facts)] : [];
    for (const rule of rules) if ('ruleId' in rule) await prisma.finding.create({ data: { applicationId, documentId, ruleId: rule.ruleId, severity: rule.severity, trustState: rule.trustState as never, explanation: rule.explanation, suggestion: rule.suggestion, pageNumber: rule.pageNumber, quote: rule.quote } });
  }
  await prisma.document.update({ where: { id: documentId }, data: { status: 'PROCESSED' } });
  await prisma.application.update({ where: { id: applicationId }, data: { status: 'REVIEW_READY' } });
  await job.updateProgress(100);
}, { connection, concurrency: 3 });
worker.on('failed', (job, error) => {
  console.error(`[worker] ${job?.id} failed`, error.message);
  if (job) {
    void prisma.document.update({
      where: { id: job.data.documentId },
      data: { status: 'PROCESSING_FAILED' },
    }).catch((updateError) => console.error('[worker] failed to persist processing failure', updateError));
  }
});
console.log('[worker] Document processor started');
