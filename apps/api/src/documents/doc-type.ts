import {
  SUPPORTED_DOCUMENT_TYPES,
  isSupportedDocumentType,
  type SupportedDocumentType,
} from '@aicte-verifyloop/shared-types';

/**
 * Validates an uploaded document type against the authoritative supported list.
 *
 * Rejecting here keeps the queue free of jobs that could never succeed: only
 * supported types have an extraction schema and a deterministic rule set. The
 * worker still verifies independently, so a direct queue write cannot bypass it.
 */
export type DocumentTypeValidation =
  | { ok: true; docType: SupportedDocumentType }
  | { ok: false; error: string; supported: readonly string[] };

export function validateDocumentType(value: unknown): DocumentTypeValidation {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, error: 'docType is required', supported: SUPPORTED_DOCUMENT_TYPES };
  }
  if (!isSupportedDocumentType(value)) {
    return { ok: false, error: 'Unsupported document type', supported: SUPPORTED_DOCUMENT_TYPES };
  }
  return { ok: true, docType: value };
}
