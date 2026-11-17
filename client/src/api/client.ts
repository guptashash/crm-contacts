/**
 * Small fetch wrapper. Every failed request becomes an ApiError with the
 * backend's error code, field errors and (for conflicts) the latest record,
 * so components never have to parse responses themselves.
 */

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'VERSION_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  fields?: Record<string, string>;
  current?: unknown;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string>,
    current?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.current = current;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal; // lets TanStack Query cancel stale requests
};

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e; // cancelled on purpose, not a failure
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? `Request failed (${res.status})`,
      err?.fields,
      err?.current,
    );
  }
  return data as T;
}

/** A user-facing message for any error. */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return 'Something went wrong. Please try again.';
}
