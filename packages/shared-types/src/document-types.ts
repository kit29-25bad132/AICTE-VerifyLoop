/**
 * Authoritative list of document types the ingestion pipeline can extract.
 *
 * This is the single source of truth shared by the API (which rejects
 * unsupported types before they are queued) and the document worker (which
 * maps each type to its extraction schema). Adding a document type requires
 * updating this list, the worker's schema map, and the API contract together.
 */
export const SUPPORTED_DOCUMENT_TYPES = [
  'FACULTY_LIST',
  'LAND_DEED',
  'FLOOR_PLAN',
  'FIRE_SAFETY',
  'NOC',
] as const;

export type SupportedDocumentType = (typeof SUPPORTED_DOCUMENT_TYPES)[number];

/** True only for the exact supported document-type identifiers. */
export function isSupportedDocumentType(value: unknown): value is SupportedDocumentType {
  return typeof value === 'string' && (SUPPORTED_DOCUMENT_TYPES as readonly string[]).includes(value);
}
