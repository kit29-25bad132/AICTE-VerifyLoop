import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuleResult } from '@aicte/rules-engine';
import { applyGroundingGate, requiredFieldsForRule } from '../finding-trust.js';

const pass = (ruleId: string): RuleResult => ({
  ruleId,
  status: 'PASS',
  severity: 'INFO',
  trustState: 'VERIFIED_OFFICIAL',
  explanation: 'within limits',
  suggestion: '',
});

test('a PASS whose consumed facts are all grounded keeps VERIFIED_OFFICIAL', () => {
  const gated = applyGroundingGate(
    pass('APH_2024_CH2_R2.1'),
    new Set(['faculty_total', 'student_intake_total']),
  );
  assert.equal(gated.trustState, 'VERIFIED_OFFICIAL');
  assert.equal(gated.status, 'PASS');
  assert.equal(gated.severity, 'INFO');
});

test('a PASS with no grounded evidence cannot claim VERIFIED_OFFICIAL', () => {
  const gated = applyGroundingGate(pass('APH_2024_CH2_R2.1'), new Set());
  assert.equal(gated.trustState, 'UNGROUNDED_NEEDS_REVIEW');
  // Compliance verdict and severity stay exactly as the deterministic engine produced them.
  assert.equal(gated.status, 'PASS');
  assert.equal(gated.severity, 'INFO');
  assert.equal(gated.explanation, 'within limits');
});

test('a PASS grounded only for unrelated fields is still downgraded', () => {
  const gated = applyGroundingGate(pass('APH_2024_CH2_R2.1'), new Set(['institution_name']));
  assert.equal(gated.trustState, 'UNGROUNDED_NEEDS_REVIEW');
});

test('partially grounded rule inputs are not enough', () => {
  const gated = applyGroundingGate(pass('APH_2024_CH2_R2.1'), new Set(['faculty_total']));
  assert.equal(gated.trustState, 'UNGROUNDED_NEEDS_REVIEW');
});

test('the gate never upgrades and never rewrites failures', () => {
  const mismatch: RuleResult = {
    ruleId: 'APH_2024_CH2_R3.1',
    status: 'FAIL',
    severity: 'CRITICAL',
    trustState: 'MISMATCH_DETECTED',
    explanation: 'Land area is 1 acres; minimum is 2.5 acres.',
    suggestion: 'Acquire additional land.',
  };
  const gated = applyGroundingGate(mismatch, new Set());
  assert.deepEqual(gated, mismatch, 'non-VERIFIED_OFFICIAL results pass through untouched');

  const ungrounded: RuleResult = { ...mismatch, trustState: 'UNGROUNDED_NEEDS_REVIEW' };
  assert.deepEqual(applyGroundingGate(ungrounded, new Set(['land_area_acres'])), ungrounded);
});

test('unknown rule ids require at least one grounded field', () => {
  const result = pass('CUSTOM_UNMAPPED_RULE');
  assert.equal(requiredFieldsForRule('CUSTOM_UNMAPPED_RULE'), null);
  assert.equal(applyGroundingGate(result, new Set()).trustState, 'UNGROUNDED_NEEDS_REVIEW');
  assert.equal(applyGroundingGate(result, new Set(['institution_name'])).trustState, 'VERIFIED_OFFICIAL');
});

test('every mapped rule field belongs to a known fact vocabulary', () => {
  const known = new Set([
    'institution_name',
    'faculty_total',
    'student_intake_total',
    'land_area_acres',
    'stamp_purchase_date',
    'deed_execution_date',
    'computer_lab_area_sqm',
    'library_area_sqm',
    'expiry_date',
    'noc_date',
  ]);
  for (const ruleId of ['APH_2024_CH2_R2.1', 'APH_2024_CH2_R3.1', 'APH_2024_CH5_R1.1', 'CROSS_DOC_NAME_MISMATCH']) {
    const fields = requiredFieldsForRule(ruleId);
    assert.ok(fields && fields.length > 0, `missing mapping for ${ruleId}`);
    for (const field of fields) assert.ok(known.has(field), `${ruleId} references unknown field ${field}`);
  }
});
