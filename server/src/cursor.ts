import { AppError } from './errors.js';

/**
 * A cursor marks the last row of the previous page: its sort value plus its id.
 * The id breaks ties, so rows with the same name are never skipped or repeated.
 * It's base64url-encoded so the client treats it as an opaque string.
 */
export type Cursor = { v: string; id: number };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof c?.v === 'string' && Number.isInteger(c?.id)) return c;
  } catch {
    // fall through
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor', { cursor: 'Invalid cursor' });
}
