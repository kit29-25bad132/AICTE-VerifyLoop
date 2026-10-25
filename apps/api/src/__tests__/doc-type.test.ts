import assert from 'node:assert/strict';
import test from 'node:test';
import { SUPPORTED_DOCUMENT_TYPES } from '@aicte-verifyloop/shared-types';
import { validateDocumentType } from '../documents/doc-type.js';

test('every supported document type is accepted unchanged', () => {
  for (const docType of SUPPORTED_DOCUMENT_TYPES) {
    const result = validateDocumentType(docType);
    assert.equal(result.ok, true, `${docType} should be accepted`);
    if (result.ok) assert.equal(result.docType, docType);
  }
});

test('unsupported document types are rejected with a safe error and the supported list', () => {
  for (const value of ['PAN_CARD', 'faculty_list', 'AFFIDAVIT', ' FACULTY_LIST', '']) {
    const result = validateDocumentType(value);
    assert.equal(result.ok, false, `${JSON.stringify(value)} should be rejected`);
    if (!result.ok) {
      assert.match(result.error, /Unsupported document type|docType is required/);
      assert.deepEqual([...result.supported], [...SUPPORTED_DOCUMENT_TYPES]);
      assert.equal(/stack|at |Error:/i.test(result.error), false, 'error text must not leak internals');
    }
  }
});

test('non-string document types are rejected', () => {
  for (const value of [undefined, null, 42, {}, ['FACULTY_LIST']]) {
    assert.equal(validateDocumentType(value).ok, false);
  }
});
