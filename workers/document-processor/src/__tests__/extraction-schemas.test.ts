import assert from 'node:assert/strict';
import test from 'node:test';
import { SUPPORTED_DOCUMENT_TYPES } from '@aicte-verifyloop/shared-types';
import {
  FACT_FIELDS_BY_DOCUMENT_TYPE,
  SCHEMAS_BY_DOCUMENT_TYPE,
  getSchemaForDocumentType,
} from '../extraction-schemas.js';

const validFaculty = {
  institution_name: 'Synthetic Institute',
  faculty_total: 12,
  student_intake_total: 480,
  faculty_members: [
    { name: 'Test Kumar', designation: 'Professor', qualification: 'Ph.D', pan_number: 'ABCDE1234F' },
    { name: 'Test Rao' },
  ],
  evidence: [
    { field: 'faculty_total', page: 1, quote: 'Total faculty strength: 12' },
    { field: 'student_intake_total', page: 1, quote: 'Total sanctioned student intake: 480' },
  ],
};

const validLand = {
  institution_name: 'Synthetic Institute',
  land_area_acres: 5.5,
  land_area_sq_meters: 22257,
  survey_number: 'SYN/123',
  lessor_name: 'Test Lessor',
  stamp_purchase_date: '2026-01-10',
  deed_execution_date: '2026-02-01',
  evidence: [{ field: 'land_area_acres', page: 1, quote: 'Total land area: 5.5 acres' }],
};

test('every supported document type has a schema, a field list and a prompt-visible mapping', () => {
  for (const docType of SUPPORTED_DOCUMENT_TYPES) {
    const schema = getSchemaForDocumentType(docType);
    assert.ok(schema, `schema missing for ${docType}`);
    assert.ok(Array.isArray(FACT_FIELDS_BY_DOCUMENT_TYPE[docType]));
    assert.ok((FACT_FIELDS_BY_DOCUMENT_TYPE[docType] as readonly string[]).includes('institution_name'));
  }
});

test('schema map is exactly the shared supported-type list (no drift)', () => {
  assert.deepEqual(
    Object.keys(SCHEMAS_BY_DOCUMENT_TYPE).sort(),
    [...SUPPORTED_DOCUMENT_TYPES].sort(),
  );
});

test('unsupported document types resolve to no schema', () => {
  for (const value of ['PAN_CARD', 'faculty_list', '', 'UNSUPPORTED_TYPE']) {
    assert.equal(getSchemaForDocumentType(value), null, `expected null for ${JSON.stringify(value)}`);
  }
});

test('valid faculty-list output passes validation', () => {
  const parsed = getSchemaForDocumentType('FACULTY_LIST')!.safeParse(validFaculty);
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues));
});

test('valid land-deed output passes validation', () => {
  const parsed = getSchemaForDocumentType('LAND_DEED')!.safeParse(validLand);
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues));
});

test('wrong field types are rejected', () => {
  const schema = getSchemaForDocumentType('FACULTY_LIST')!;
  assert.equal(schema.safeParse({ ...validFaculty, faculty_total: '12' }).success, false);
  assert.equal(schema.safeParse({ ...validFaculty, faculty_total: 12.5 }).success, false);
  assert.equal(schema.safeParse({ ...validFaculty, faculty_members: [{ pan_number: 'X' }] }).success, false);
});

test('missing and empty evidence are rejected', () => {
  const schema = getSchemaForDocumentType('NOC')!;
  assert.equal(schema.safeParse({ institution_name: 'X' }).success, false);
  assert.equal(schema.safeParse({ institution_name: 'X', evidence: [] }).success, false);
});

test('malformed evidence records are rejected', () => {
  const schema = getSchemaForDocumentType('NOC')!;
  assert.equal(schema.safeParse({ evidence: [{ field: 'noc_date', page: 1, quote: '' }] }).success, false);
  assert.equal(schema.safeParse({ evidence: [{ field: '', page: 1, quote: 'x' }] }).success, false);
  assert.equal(schema.safeParse({ evidence: [{ field: 'noc_date', page: 0, quote: 'x' }] }).success, false);
  assert.equal(schema.safeParse({ evidence: [{ field: 'noc_date', page: 1.5, quote: 'x' }] }).success, false);
});

test('dates must be real ISO calendar dates', () => {
  const schema = getSchemaForDocumentType('LAND_DEED')!;
  const withDate = (date: string) => ({ ...validLand, stamp_purchase_date: date });
  assert.equal(schema.safeParse(withDate('2026-01-10')).success, true);
  assert.equal(schema.safeParse(withDate('31/03/2028')).success, false, 'non-ISO format must be rejected');
  assert.equal(schema.safeParse(withDate('2028-02-31')).success, false, 'impossible date must be rejected');
  assert.equal(schema.safeParse(withDate('not-a-date')).success, false);
});

test('areas must be positive numbers', () => {
  const schema = getSchemaForDocumentType('LAND_DEED')!;
  assert.equal(schema.safeParse({ ...validLand, land_area_acres: 0 }).success, false);
  assert.equal(schema.safeParse({ ...validLand, land_area_acres: -2 }).success, false);
  assert.equal(schema.safeParse({ ...validLand, land_area_acres: '5.5' }).success, false);
});

test('unknown keys are stripped, so extraction cannot inject fields into persistence', () => {
  const parsed = getSchemaForDocumentType('FACULTY_LIST')!.safeParse({
    ...validFaculty,
    compliance_status: 'PASS',
    trust_state: 'VERIFIED_OFFICIAL',
  });
  assert.equal(parsed.success, true);
  const facts = parsed.data as Record<string, unknown>;
  assert.equal('compliance_status' in facts, false);
  assert.equal('trust_state' in facts, false);
});

test('fact fields are optional but never coerced from absent to zero', () => {
  const parsed = getSchemaForDocumentType('FIRE_SAFETY')!.safeParse({
    evidence: [{ field: 'institution_name', page: 1, quote: 'Synthetic Institute' }],
  });
  assert.equal(parsed.success, true);
  assert.equal((parsed.data as Record<string, unknown>).expiry_date, undefined);
});
