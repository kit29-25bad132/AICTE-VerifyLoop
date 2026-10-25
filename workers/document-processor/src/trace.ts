/**
 * Safe structured operation tracing.
 *
 * Emits one JSON line per operation with a fixed, whitelisted shape. It never
 * includes document text, quotations, extracted values, personal data (for
 * example PAN numbers), request bodies, provider payloads, credentials, or raw
 * database errors — only operation metadata and a category string.
 *
 * LangSmith (`langsmith`) is declared in this package's dependencies but is not
 * used anywhere in the codebase, and no tracing backend is configured for local
 * development. This module therefore records trace metadata to the process log
 * only. Nothing here requires a network service, so pipeline behaviour cannot
 * depend on an unavailable tracing backend.
 */

export type OperationOutcome = 'success' | 'failure';

export interface OperationTrace {
  /** Stable operation name, e.g. "document.extract". */
  operation: string;
  documentType?: string;
  outcome: OperationOutcome;
  durationMs: number;
  /** Sanitized failure category; never a provider message or document content. */
  category?: string;
  evidenceTotal?: number;
  evidenceGrounded?: number;
}

/** Emits a single sanitized trace line. Never throws. */
export function logOperation(trace: OperationTrace): void {
  try {
    const record = {
      trace: 'operation',
      operation: trace.operation,
      documentType: trace.documentType,
      outcome: trace.outcome,
      durationMs: Math.max(0, Math.round(trace.durationMs)),
      category: trace.category,
      evidenceTotal: trace.evidenceTotal,
      evidenceGrounded: trace.evidenceGrounded,
      at: new Date().toISOString(),
    };
    const line = JSON.stringify(Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)));
    if (trace.outcome === 'failure') console.error(line);
    else console.info(line);
  } catch {
    // Tracing must never break document processing.
  }
}
