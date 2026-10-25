import dotenv from 'dotenv';
import { Worker } from 'bullmq';
import path from 'node:path';
import { PrismaClient } from '@aicte/database';
import { connection } from './redis.js';
import { ocrWithTesseract, parseDocument } from './parser-client.js';
import { ocrWithGemini } from './ocr-fallback.js';
import { extractWithAI } from './ai-extractor.js';
import { applyGroundingGate } from './finding-trust.js';
import { logOperation } from './trace.js';
import {
  evaluateFacultyRatio,
  evaluateLandArea,
  evaluateComputerLab,
  evaluateLibrary,
  evaluateFireSafety,
  evaluateNoc,
  detectGhostFaculty,
} from '@aicte/rules-engine';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
const prisma = new PrismaClient();
interface JobData { documentId: string; applicationId: string; storagePath: string; docType: string; }
const worker = new Worker<JobData>('document-processing', async (job) => {
  const startedAt = Date.now();
  const { documentId, applicationId, storagePath, docType } = job.data;
  console.info(`[worker] job=${job.id} started attempt=${job.attemptsMade + 1}`);
  await prisma.document.update({ where: { id: documentId }, data: { status: 'PROCESSING' } });
  await job.updateProgress(10);
  const parsed = await parseDocument(storagePath);
  // Keep page boundaries: evidence page numbers are validated against these
  // per-page texts by the grounding verifier, so flattening here would make
  // page verification impossible.
  const pageTexts: string[] = parsed.pages.map((spans) => spans.map((span) => span.text).join(' '));
  await prisma.document.update({ where: { id: documentId }, data: { pageCount: parsed.page_count } });
  await job.updateProgress(30);
  if (parsed.needs_ocr) {
    const ocrPages: string[] = [];
    for (const image of parsed.page_images) {
      try {
        ocrPages.push(await ocrWithGemini(image));
      } catch {
        ocrPages.push(await ocrWithTesseract(image));
      }
    }
    ocrPages.forEach((ocrText, index) => {
      if (ocrText.trim().length > (pageTexts[index] ?? '').trim().length) pageTexts[index] = ocrText;
    });
    if (pageTexts.length === 0 && ocrPages.length > 0) pageTexts.push(...ocrPages);
    await prisma.document.update({ where: { id: documentId }, data: { ocrUsed: true } });
  }
  await job.updateProgress(50);
  const { facts, grounding } = await extractWithAI(pageTexts, docType);
  await prisma.document.update({ where: { id: documentId }, data: { extractedData: facts as object } });
  await job.updateProgress(80);
  const groundedFields = new Set(grounding.groundedFields);
  const rules = docType === 'FACULTY_LIST' ? [evaluateFacultyRatio(facts), ...(await detectGhostFaculty((facts.faculty_members as Array<{name: string; pan_number?: string}> ?? []), (await prisma.application.findUniqueOrThrow({ where: { id: applicationId } })).institutionId, `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, prisma)) as never[]] : docType === 'LAND_DEED' ? [evaluateLandArea(facts)] : docType === 'FLOOR_PLAN' ? [evaluateComputerLab(facts), evaluateLibrary(facts)] : docType === 'FIRE_SAFETY' ? [evaluateFireSafety(facts)] : docType === 'NOC' ? [evaluateNoc(facts)] : [];
  // The rules engine decides PASS/FAIL and severity. The gate can only
  // withdraw an unearned VERIFIED_OFFICIAL claim; it never upgrades.
  const findings = rules
    .filter((rule) => 'ruleId' in rule)
    .map((rule) => applyGroundingGate(rule, groundedFields))
    .map((gated) => ({ applicationId, documentId, ruleId: gated.ruleId, severity: gated.severity, trustState: gated.trustState as never, explanation: gated.explanation, suggestion: gated.suggestion, pageNumber: gated.pageNumber, quote: gated.quote }));
  // Findings are derived from this document's extraction, so a retry, a stalled
  // job replay or a duplicate enqueue must not accumulate copies. Replacing them
  // and advancing the statuses in one transaction keeps re-processing idempotent:
  // either the new findings and the PROCESSED status both land, or neither does.
  await prisma.$transaction([
    prisma.finding.deleteMany({ where: { documentId } }),
    ...findings.map((data) => prisma.finding.create({ data })),
    prisma.document.update({ where: { id: documentId }, data: { status: 'PROCESSED' } }),
    prisma.application.update({ where: { id: applicationId }, data: { status: 'REVIEW_READY' } }),
  ]);
  await job.updateProgress(100);
  const durationMs = Date.now() - startedAt;
  console.info(`[worker] job=${job.id} document=${documentId} completed elapsed_ms=${durationMs}`);
  logOperation({
    operation: 'document.process',
    documentType: docType,
    outcome: 'success',
    durationMs,
    evidenceTotal: grounding.total,
    evidenceGrounded: grounding.grounded,
  });
}, {
  connection,
  concurrency: 1,
  lockDuration: 360000,
  stalledInterval: 60000,
  maxStalledCount: 1,
});
worker.on('failed', (job, error) => {
  const terminal = Boolean(job && job.attemptsMade >= (job.opts.attempts ?? 1));
  console.error(`[worker] job=${job?.id ?? 'unknown'} failed attempt=${job?.attemptsMade ?? 'unknown'} terminal=${terminal}: ${error.message}`);
  logOperation({
    operation: 'document.process',
    documentType: job?.data?.docType,
    outcome: 'failure',
    durationMs: 0,
    category: terminal ? 'terminal_failure' : 'retryable_failure',
  });
  if (job && terminal) {
    void prisma.document.update({
      where: { id: job.data.documentId },
      data: { status: 'PROCESSING_FAILED' },
    }).catch((updateError) => console.error(`[worker] failed to persist processing failure: ${updateError instanceof Error ? updateError.message : 'unknown error'}`));
  }
});
console.log('[worker] Document processor started');
