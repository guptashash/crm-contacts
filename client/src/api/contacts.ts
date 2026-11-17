import { api } from './client';
import type { BulkTagResult, ContactListParams, ContactPage, Tag } from './types';

/** Builds the query string; empty values are left out so URLs stay short. */
export function toSearchParams(p: ContactListParams, limit = 25): string {
  const s = new URLSearchParams();
  if (p.q) s.set('q', p.q);
  if (p.tags.length) s.set('tags', p.tags.join(','));
  if (p.company) s.set('company', p.company);
  s.set('sort', p.sort);
  s.set('order', p.order);
  s.set('limit', String(limit));
  if (p.cursor) s.set('cursor', p.cursor);
  return s.toString();
}

export const contactsApi = {
  list: (p: ContactListParams, signal?: AbortSignal) =>
    api<ContactPage>(`/contacts?${toSearchParams(p)}`, { signal }),

  tags: (signal?: AbortSignal) =>
    api<{ items: Tag[] }>('/tags', { signal }).then((r) => r.items),

  companies: (signal?: AbortSignal) =>
    api<{ items: string[] }>('/companies', { signal }).then((r) => r.items),

  bulkAddTag: (contactIds: number[], tagName: string) =>
    api<BulkTagResult>('/contacts/bulk/tags', {
      method: 'POST',
      body: { contactIds, tagName },
    }),
};

/**
 * Query keys in one place, so invalidation can't drift out of sync.
 * Invalidating `contactKeys.all` refreshes every list and detail query.
 */
export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (p: ContactListParams) => [...contactKeys.lists(), p] as const,
  detail: (id: number) => [...contactKeys.all, 'detail', id] as const,
  activities: (id: number) => [...contactKeys.all, 'activities', id] as const,
  tags: ['tags'] as const,
  companies: ['companies'] as const,
};
