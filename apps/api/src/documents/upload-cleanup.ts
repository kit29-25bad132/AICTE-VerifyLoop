import fs from 'node:fs';

/**
 * Temporary-file cleanup for rejected uploads.
 *
 * Multer writes each uploaded file to `uploads/tmp` before the route decides
 * whether the request is acceptable. Every rejection path must remove exactly
 * the files that arrived with *that* request, and nothing else:
 *
 * - Only the paths handed in are touched, so files stored for other requests
 *   (or for accepted uploads that were already moved into permanent storage)
 *   can never be removed by a later rejection.
 * - Cleanup is best effort. A leftover temp file must never turn a 4xx response
 *   into a 500, so filesystem errors are swallowed.
 */

export interface TemporaryUpload {
  path?: string;
}

/** Removes this request's temporary upload files. Never throws. */
export function discardUploadedFiles(files: readonly TemporaryUpload[] | undefined | null): void {
  if (!files) return;
  for (const file of files) {
    const target = typeof file?.path === 'string' ? file.path.trim() : '';
    if (target.length === 0) continue;
    try {
      fs.rmSync(target, { force: true });
    } catch {
      // Best effort: see the module comment.
    }
  }
}
