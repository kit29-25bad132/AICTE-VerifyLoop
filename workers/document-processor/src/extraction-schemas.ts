import { z } from 'zod';
import { SUPPORTED_DOCUMENT_TYPES, type SupportedDocumentType } from '@aicte-verifyloop/shared-types';

/**
 * Document-type-specific extraction schemas.
 *
 * These schemas describe *facts only*. They intentionally contain no
 * regulatory thresholds, pass/fail logic, severity, trust state, or
 * authenticity markers: compliance is decided exclusively by the deterministic
 * rules engine in `packages/rules-engine`.
 *
 * Strictness policy:
 * - Types, ranges and date shape are enforced, so malformed model output fails
 *   validation instead of being persisted.
 * - Unknown keys are stripped (not persisted), so a model cannot smuggle extra
 *   fields into `extractedData` via prompt injection.
 * - Fact fields are optional because an honest extraction may legitimately not
 *   find a value; the prompt tells the model to omit rather than guess. The
 *   deterministic rules engine already handles absent facts by reporting
 *   `UNGROUNDED_NEEDS_REVIEW`.
 * - Evidence is required (at least one record) so a "successful" extraction can
 *   never be an unsupported claim with no source reference.
 */

/** Maximum evidence quotation length, matching the parser's span granularity. */
export const MAX_QUOTE_LENGTH = 300;

/** Calendar-accurate ISO date, e.g. 2028-03-31. Rejects 2028-02-31 and free text. */
const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'must be a real calendar date');

export const EvidenceSchema = z.object({
  field: z.string().trim().min(1).max(80),
  page: z.number().int().min(1),
  quote: z.string().trim().min(1).max(MAX_QUOTE_LENGTH),
  grounded: z.boolean().optional(),
});

export const FacultyMemberSchema = z.object({
  name: z.string().trim().min(1).max(160),
  designation: z.string().trim().min(1).max(120).optional(),
  qualification: z.string().trim().min(1).max(120).optional(),
  pan_number: z.string().trim().min(1).max(20).optional(),
});

export const FacultyListSchema = z.object({
  institution_name: z.string().trim().min(1).max(200).optional(),
  faculty_total: z.number().int().nonnegative().optional(),
  student_intake_total: z.number().int().nonnegative().optional(),
  faculty_members: z.array(FacultyMemberSchema).optional(),
  evidence: z.array(EvidenceSchema).min(1),
});

export const LandDeedSchema = z.object({
  institution_name: z.string().trim().min(1).max(200).optional(),
  land_area_acres: z.number().positive().optional(),
  land_area_sq_meters: z.number().positive().optional(),
  survey_number: z.string().trim().min(1).max(80).optional(),
  lessor_name: z.string().trim().min(1).max(200).optional(),
  stamp_purchase_date: IsoDate.optional(),
  deed_execution_date: IsoDate.optional(),
  evidence: z.array(EvidenceSchema).min(1),
});

export const FloorPlanSchema = z.object({
  institution_name: z.string().trim().min(1).max(200).optional(),
  total_built_area_sqm: z.number().positive().optional(),
  computer_lab_area_sqm: z.number().positive().optional(),
  library_area_sqm: z.number().positive().optional(),
  evidence: z.array(EvidenceSchema).min(1),
});

export const FireSafetySchema = z.object({
  institution_name: z.string().trim().min(1).max(200).optional(),
  expiry_date: IsoDate.optional(),
  evidence: z.array(EvidenceSchema).min(1),
});

export const NocSchema = z.object({
  institution_name: z.string().trim().min(1).max(200).optional(),
  noc_date: IsoDate.optional(),
  evidence: z.array(EvidenceSchema).min(1),
});

/** Fact fields per document type: evidence `field` values must come from here. */
export const FACT_FIELDS_BY_DOCUMENT_TYPE = {
  FACULTY_LIST: ['institution_name', 'faculty_total', 'student_intake_total', 'faculty_members'],
  LAND_DEED: [
    'institution_name',
    'land_area_acres',
    'land_area_sq_meters',
    'survey_number',
    'lessor_name',
    'stamp_purchase_date',
    'deed_execution_date',
  ],
  FLOOR_PLAN: ['institution_name', 'total_built_area_sqm', 'computer_lab_area_sqm', 'library_area_sqm'],
  FIRE_SAFETY: ['institution_name', 'expiry_date'],
  NOC: ['institution_name', 'noc_date'],
} as const satisfies Record<SupportedDocumentType, readonly string[]>;

/**
 * Schema per supported document type. `satisfies Record<SupportedDocumentType, …>`
 * makes a missing or misspelled type a compile-time error, keeping this map in
 * lockstep with the shared `SUPPORTED_DOCUMENT_TYPES` list.
 */
export const SCHEMAS_BY_DOCUMENT_TYPE = {
  FACULTY_LIST: FacultyListSchema,
  LAND_DEED: LandDeedSchema,
  FLOOR_PLAN: FloorPlanSchema,
  FIRE_SAFETY: FireSafetySchema,
  NOC: NocSchema,
} satisfies Record<SupportedDocumentType, z.ZodTypeAny>;

export type DocumentExtractionSchema = (typeof SCHEMAS_BY_DOCUMENT_TYPE)[SupportedDocumentType];
export type ExtractedEvidence = z.infer<typeof EvidenceSchema>;
export type ExtractedFacultyMember = z.infer<typeof FacultyMemberSchema>;

/** Returns the schema for a document type, or `null` for unsupported types. */
export function getSchemaForDocumentType(
  docType: string,
): (typeof SCHEMAS_BY_DOCUMENT_TYPE)[SupportedDocumentType] | null {
  if (!(SUPPORTED_DOCUMENT_TYPES as readonly string[]).includes(docType)) return null;
  return SCHEMAS_BY_DOCUMENT_TYPE[docType as SupportedDocumentType];
}
