import type { RuleResult } from '@aicte/rules-engine';

/**
 * Phase 4 trust gate.
 *
 * The deterministic rules engine decides PASS/FAIL and severity. This gate only
 * prevents an *unsupported* PASS from being labelled `VERIFIED_OFFICIAL`:
 *
 * - It can never upgrade a trust state, and it never touches PASS/FAIL or
 *   severity, so compliance logic stays entirely in `packages/rules-engine`.
 * - A rule result may claim `VERIFIED_OFFICIAL` only when every fact the rule
 *   consumed has at least one quotation that the grounding verifier matched
 *   against the source page.
 * - Otherwise the result is downgraded to `UNGROUNDED_NEEDS_REVIEW`, which is
 *   the existing "automated evidence is insufficient, a human must look" state.
 *
 * `MISMATCH_DETECTED` and `SOURCE_UNAVAILABLE` results are left untouched: a
 * detected mismatch needs no grounding support to be worth reporting, and this
 * gate never invents a mismatch.
 */

/** Facts each deterministic rule consumes, used to decide evidentiary support. */
export const RULE_FACT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'APH_2024_CH2_R2.1': ['faculty_total', 'student_intake_total'],
  'APH_2024_CH2_R3.1': ['land_area_acres'],
  'APH_2024_CH2_R1.1': ['stamp_purchase_date', 'deed_execution_date'],
  'APH_2024_CH2_R4.1': ['computer_lab_area_sqm'],
  'APH_2024_CH2_R4.2': ['library_area_sqm'],
  'APH_2024_CH5_R1.1': ['expiry_date'],
  'APH_2024_CH5_R1.2': ['noc_date'],
  CROSS_DOC_NAME_MISMATCH: ['institution_name'],
};

/** Fields a rule depends on; unknown rules fall back to "any grounded evidence". */
export function requiredFieldsForRule(ruleId: string): readonly string[] | null {
  return RULE_FACT_FIELDS[ruleId] ?? null;
}

/**
 * Applies the grounding gate to one deterministic rule result.
 *
 * @param result rule output from the deterministic engine (never mutated)
 * @param groundedFields fact fields with at least one verified quotation
 */
export function applyGroundingGate(result: RuleResult, groundedFields: ReadonlySet<string>): RuleResult {
  if (result.trustState !== 'VERIFIED_OFFICIAL') return result;

  const required = requiredFieldsForRule(result.ruleId);
  const supported =
    required === null
      ? groundedFields.size > 0
      : required.length > 0 && required.every((field) => groundedFields.has(field));

  return supported ? result : { ...result, trustState: 'UNGROUNDED_NEEDS_REVIEW' };
}
