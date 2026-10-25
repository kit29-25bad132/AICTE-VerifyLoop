import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyGroundingFlags,
  normalizeWhitespace,
  rootFieldName,
  verifyEvidenceGrounding,
  verifyEvidenceRecord,
} from '../grounding.js';

const PAGES = [
  'SYNTHETIC PILOT INSTITUTE. Total faculty strength: 9. Total sanctioned student intake: 480.',
  'Fire Safety Certificate. Expiry date: 31 March 2028.',
];
const ALLOWED = ['institution_name', 'faculty_total', 'student_intake_total', 'expiry_date'];

test('an exact source quotation is grounded', () => {
  const result = verifyEvidenceRecord(
    { field: 'faculty_total', page: 1, quote: 'Total faculty strength: 9.' },
    PAGES,
    ALLOWED,
  );
  assert.equal(result.grounded, true);
  assert.equal(result.reason, 'exact_match');
});

test('whitespace-only differences are grounded; nothing else is normalized', () => {
  const spaced = verifyEvidenceRecord(
    { field: 'student_intake_total', page: 1, quote: 'Total   sanctioned student\n intake: 480.' },
    PAGES,
    ALLOWED,
  );
  assert.equal(spaced.grounded, true);
  assert.equal(spaced.reason, 'whitespace_normalized_match');

  const caseDifference = verifyEvidenceRecord(
    { field: 'faculty_total', page: 1, quote: 'total faculty strength: 9.' },
    PAGES,
    ALLOWED,
  );
  assert.equal(caseDifference.grounded, false, 'case differences must not be normalized away');

  assert.equal(normalizeWhitespace(' a \n b\tc '), 'a b c');
});

test('an invented quotation is not grounded', () => {
  const result = verifyEvidenceRecord(
    { field: 'faculty_total', page: 1, quote: 'Total faculty strength: 250' },
    PAGES,
    ALLOWED,
  );
  assert.equal(result.grounded, false);
  assert.equal(result.reason, 'quote_not_found');
});

test('a correct quotation attributed to the wrong page is not grounded', () => {
  const result = verifyEvidenceRecord(
    { field: 'expiry_date', page: 1, quote: 'Expiry date: 31 March 2028.' },
    PAGES,
    ALLOWED,
  );
  assert.equal(result.grounded, false);
  assert.equal(result.reason, 'quote_not_found');
});

test('page numbers outside the parsed document are rejected', () => {
  const beyond = verifyEvidenceRecord(
    { field: 'faculty_total', page: 5, quote: 'Total faculty strength: 9.' },
    PAGES,
    ALLOWED,
  );
  assert.equal(beyond.grounded, false);
  assert.equal(beyond.reason, 'page_out_of_range');

  const zero = verifyEvidenceRecord({ field: 'faculty_total', page: 0, quote: 'x' }, PAGES, ALLOWED);
  assert.equal(zero.grounded, false);
  assert.equal(zero.reason, 'page_out_of_range');
});

test('empty, malformed and unknown-field evidence cannot be grounded', () => {
  assert.equal(verifyEvidenceRecord({ field: 'faculty_total', page: 1, quote: '   ' }, PAGES, ALLOWED).reason, 'empty_quote');
  assert.equal(verifyEvidenceRecord({ field: 'faculty_total', page: 1 }, PAGES, ALLOWED).reason, 'malformed_record');
  assert.equal(verifyEvidenceRecord({ page: 1, quote: 'x' }, PAGES, ALLOWED).reason, 'malformed_record');
  assert.equal(verifyEvidenceRecord({ field: 'faculty_total', page: '1', quote: 'x' }, PAGES, ALLOWED).reason, 'malformed_record');
  assert.equal(
    verifyEvidenceRecord({ field: 'compliance_status', page: 1, quote: 'Total faculty strength: 9.' }, PAGES, ALLOWED).reason,
    'unknown_field',
  );
});

test('nested field paths are valid when their root is a declared field', () => {
  const allowed = [...ALLOWED, 'faculty_members'];
  const pageText = 'Faculty member one: Anil Test Kumar, Professor, Ph.D';
  for (const field of ['faculty_members.0.name', 'faculty_members[0].designation', 'faculty_members']) {
    const result = verifyEvidenceRecord({ field, page: 1, quote: pageText }, [pageText], allowed);
    assert.equal(result.grounded, true, `${field} should ground`);
  }
  assert.equal(
    verifyEvidenceRecord({ field: 'compliance.0.status', page: 1, quote: pageText }, [pageText], allowed).reason,
    'unknown_field',
    'an undeclared root must still be rejected',
  );
  assert.equal(
    verifyEvidenceRecord({ field: 'faculty_members[abc].name', page: 1, quote: pageText }, [pageText], allowed).reason,
    'unknown_field',
  );
  assert.equal(rootFieldName('faculty_members[2].qualification'), 'faculty_members');
});

test('report groups nested references under their top-level field', () => {
  const allowed = [...ALLOWED, 'faculty_members'];
  const pageText = 'Faculty member one: Anil Test Kumar, Professor, Ph.D';
  const report = verifyEvidenceGrounding(
    [
      { field: 'faculty_members.0.name', page: 1, quote: pageText },
      { field: 'faculty_members.1.name', page: 1, quote: 'Faculty member two: Bina Test Rao' },
    ],
    [pageText],
    allowed,
  );
  assert.equal(report.grounded, 1);
  assert.deepEqual(report.groundedFields, ['faculty_members']);
  assert.deepEqual(report.ungroundedFields, ['faculty_members']);
});

test('missing page text is never treated as grounded', () => {
  const noPages = verifyEvidenceRecord({ field: 'faculty_total', page: 1, quote: 'anything' }, [], ALLOWED);
  assert.equal(noPages.grounded, false);
  assert.equal(noPages.reason, 'no_page_text');

  const blankPage = verifyEvidenceRecord(
    { field: 'faculty_total', page: 1, quote: 'anything' },
    ['   '],
    ALLOWED,
  );
  assert.equal(blankPage.grounded, false);
  assert.equal(blankPage.reason, 'no_page_text');
});

test('report aggregates grounded and ungrounded fields without leaking quotations', () => {
  const report = verifyEvidenceGrounding(
    [
      { field: 'faculty_total', page: 1, quote: 'Total faculty strength: 9.' },
      { field: 'student_intake_total', page: 1, quote: 'Total sanctioned student intake: 999' },
      { field: 'institution_name', page: 1, quote: 'SYNTHETIC PILOT INSTITUTE.' },
    ],
    PAGES,
    ALLOWED,
  );
  assert.equal(report.total, 3);
  assert.equal(report.grounded, 2);
  assert.equal(report.ungrounded, 1);
  assert.deepEqual(report.groundedFields, ['faculty_total', 'institution_name']);
  assert.deepEqual(report.ungroundedFields, ['student_intake_total']);
  assert.equal(report.hasGroundedEvidence, true);
  // Diagnostics must not carry the quotation text itself.
  for (const entry of report.results) {
    assert.equal('quote' in entry, false);
    assert.equal(entry.quoteLength > 0, true);
  }
});

test('grounding flags are derived only from the verifier result', () => {
  const evidence = [
    { field: 'faculty_total', page: 1, quote: 'Total faculty strength: 9.', grounded: true },
    { field: 'faculty_total', page: 1, quote: 'Total faculty strength: 250', grounded: true },
  ];
  const report = verifyEvidenceGrounding(evidence, PAGES, ALLOWED);
  const flagged = applyGroundingFlags(evidence, report);
  assert.equal(flagged[0].grounded, true);
  assert.equal(flagged[1].grounded, false, 'a pre-asserted grounded flag must be overwritten by the verifier');
});

const UNICODE_PAGES = [
  'संस्थान का नाम: परीक्षण प्रौद्योगिकी संस्थान। कुल संकाय संख्या: 9.',
  'Institution: Université de Test — München. Größe: 12.000 m² (naïve résumé).',
];

const UNICODE_ALLOWED = ['institution_name', 'faculty_total', 'total_built_area_sqm'];

test('non-Latin and accented text grounds byte-for-byte', () => {
  const devanagari = verifyEvidenceRecord(
    { field: 'faculty_total', page: 1, quote: 'कुल संकाय संख्या: 9.' },
    UNICODE_PAGES,
    UNICODE_ALLOWED,
  );
  assert.equal(devanagari.grounded, true);
  assert.equal(devanagari.reason, 'exact_match');

  const accented = verifyEvidenceRecord(
    { field: 'institution_name', page: 2, quote: 'Université de Test — München.' },
    UNICODE_PAGES,
    UNICODE_ALLOWED,
  );
  assert.equal(accented.grounded, true);
});

test('unicode compatibility forms are not silently normalized', () => {
  // NFC vs NFD differ in bytes; the verifier is exact, so a differently
  // composed quotation is reported ungrounded rather than fuzzy-matched.
  const composed = verifyEvidenceRecord(
    { field: 'institution_name', page: 2, quote: 'Universit\u00e9' },
    UNICODE_PAGES,
    UNICODE_ALLOWED,
  );
  assert.equal(composed.grounded, true);
  const decomposed = verifyEvidenceRecord(
    { field: 'institution_name', page: 2, quote: 'Universite\u0301' },
    UNICODE_PAGES,
    UNICODE_ALLOWED,
  );
  assert.equal(decomposed.grounded, false, 'no unicode normalization is performed');
});

test('punctuation and case remain significant', () => {
  const pages = ['Survey No. 45/2A, area 2.60 acres (registered).'];
  const allowed = ['survey_number', 'land_area_acres'];

  assert.equal(verifyEvidenceRecord({ field: 'land_area_acres', page: 1, quote: 'area 2.60 acres' }, pages, allowed).grounded, true);
  for (const quote of ['area 2.60 acres.', 'area 260 acres', 'Area 2.60 Acres', 'area 2,60 acres']) {
    assert.equal(
      verifyEvidenceRecord({ field: 'land_area_acres', page: 1, quote }, pages, allowed).grounded,
      false,
      `"${quote}" must not match without exact punctuation and case`,
    );
  }
});

test('a repeated quotation grounds on each page that actually contains it', () => {
  const pages = [
    'Resolution passed. Approved by the governing body.',
    'Annexure. Approved by the governing body.',
  ];
  const allowed = ['institution_name'];
  const quote = 'Approved by the governing body.';
  assert.equal(verifyEvidenceRecord({ field: 'institution_name', page: 1, quote }, pages, allowed).grounded, true);
  assert.equal(verifyEvidenceRecord({ field: 'institution_name', page: 2, quote }, pages, allowed).grounded, true);

  const report = verifyEvidenceGrounding(
    [
      { field: 'institution_name', page: 1, quote },
      { field: 'institution_name', page: 2, quote },
    ],
    pages,
    allowed,
  );
  assert.equal(report.grounded, 2, 'each verified record counts once');
  assert.deepEqual(report.groundedFields, ['institution_name']);
});

test('pages are validated at both boundaries of the parsed range', () => {
  const pages = ['first page: 10 faculty', 'middle page: 11 faculty', 'last page: 12 faculty'];
  const allowed = ['faculty_total'];
  assert.equal(verifyEvidenceRecord({ field: 'faculty_total', page: 1, quote: '10 faculty' }, pages, allowed).grounded, true);
  assert.equal(verifyEvidenceRecord({ field: 'faculty_total', page: 3, quote: '12 faculty' }, pages, allowed).grounded, true);
  assert.equal(
    verifyEvidenceRecord({ field: 'faculty_total', page: 4, quote: '12 faculty' }, pages, allowed).reason,
    'page_out_of_range',
  );
});

test('a quotation that spans a page boundary is not grounded', () => {
  const pages = ['Computer lab area is 70', 'sq.m as certified.'];
  const result = verifyEvidenceRecord(
    { field: 'total_built_area_sqm', page: 1, quote: 'Computer lab area is 70 sq.m' },
    pages,
    ['total_built_area_sqm'],
  );
  assert.equal(result.grounded, false, 'cross-page text must not be stitched together');
  assert.equal(result.reason, 'quote_not_found');
});

test('very long quotations are checked exactly and diagnostics stay length-only', () => {
  const longSentence = 'Faculty of Engineering and Technology, Department of Computer Science. '.repeat(40);
  const pages = [longSentence];
  const grounded = verifyEvidenceRecord(
    { field: 'institution_name', page: 1, quote: longSentence },
    pages,
    ['institution_name'],
  );
  assert.equal(grounded.grounded, true);
  assert.equal(grounded.quoteLength, longSentence.trim().length);
  assert.equal('quote' in grounded, false);
});

test('empty evidence lists never report support', () => {
  const report = verifyEvidenceGrounding([], PAGES, ALLOWED);
  assert.equal(report.total, 0);
  assert.equal(report.hasGroundedEvidence, false);
  assert.deepEqual(report.groundedFields, []);
});
