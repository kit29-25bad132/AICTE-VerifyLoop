import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discardUploadedFiles } from '../documents/upload-cleanup.js';

/** Isolated temp workspace; nothing outside it is ever touched. */
function withTempDir(run: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifyloop-cleanup-'));
  try {
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function write(dir: string, name: string): string {
  const target = path.join(dir, name);
  fs.writeFileSync(target, 'synthetic upload bytes');
  return target;
}

test('rejected uploads remove their own temporary files', () => {
  withTempDir((dir) => {
    const files = [write(dir, '1700000000000-a.pdf'), write(dir, '1700000000001-b.pdf')];
    discardUploadedFiles(files.map((filePath) => ({ path: filePath })));
    for (const file of files) assert.equal(fs.existsSync(file), false, `${file} should be removed`);
  });
});

test('another request\u2019s files are never removed', () => {
  withTempDir((dir) => {
    const mine = [write(dir, 'mine-1.pdf'), write(dir, 'mine-2.pdf')];
    const theirs = [write(dir, 'theirs-1.pdf'), write(dir, 'theirs-2.pdf')];
    discardUploadedFiles(mine.map((filePath) => ({ path: filePath })));
    for (const file of mine) assert.equal(fs.existsSync(file), false);
    for (const file of theirs) assert.equal(fs.existsSync(file), true, 'files outside the rejected request must survive');
  });
});

test('duplicate uploads in one request each disappear exactly once', () => {
  withTempDir((dir) => {
    const single = write(dir, 'single.pdf');
    discardUploadedFiles([{ path: single }, { path: single }]);
    assert.equal(fs.existsSync(single), false);
  });
});

test('cleanup tolerates missing, malformed and absent file entries', () => {
  withTempDir((dir) => {
    const survivor = write(dir, 'survivor.pdf');
    assert.doesNotThrow(() =>
      discardUploadedFiles([
        { path: path.join(dir, 'already-gone.pdf') },
        { path: '' },
        {},
        { path: '   ' },
        { path: undefined },
      ]),
    );
    assert.equal(fs.existsSync(survivor), true, 'unrelated entries must not trigger broad deletion');
    assert.doesNotThrow(() => discardUploadedFiles(undefined));
    assert.doesNotThrow(() => discardUploadedFiles(null));
    assert.doesNotThrow(() => discardUploadedFiles([]));
  });
});

test('cleanup is best effort when the filesystem refuses', () => {
  withTempDir((dir) => {
    const directoryAsFile = path.join(dir, 'a-directory');
    fs.mkdirSync(directoryAsFile);
    // rmSync on a non-empty directory without recursive fails; the helper must
    // swallow that rather than turning a 4xx into a 500.
    write(directoryAsFile, 'child.bin');
    assert.doesNotThrow(() => discardUploadedFiles([{ path: directoryAsFile }]));
    assert.equal(fs.existsSync(directoryAsFile), true);
  });
});
