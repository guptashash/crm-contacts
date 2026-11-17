import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ContactListParams, SortField, SortOrder } from '../api/types';

const SORTS: SortField[] = ['name', 'createdAt'];
const ORDERS: SortOrder[] = ['asc', 'desc'];

/** Reads list state from the URL, falling back to defaults for missing or invalid values. */
export function parseListParams(s: URLSearchParams): ContactListParams {
  const sort = s.get('sort') as SortField;
  const order = s.get('order') as SortOrder;
  return {
    q: s.get('q')?.trim() ?? '',
    tags: (s.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    company: s.get('company') ?? '',
    sort: SORTS.includes(sort) ? sort : 'name',
    order: ORDERS.includes(order) ? order : 'asc',
    cursor: s.get('cursor') || null,
  };
}

/** Identifies a result set (everything except the page). Used to key cursor history and selection. */
export const filterSignature = (p: ContactListParams) =>
  JSON.stringify([p.q, [...p.tags].sort(), p.company, p.sort, p.order]);

/**
 * The URL is the single source of truth for search, filters, sort and page,
 * so any view can be shared, bookmarked, refreshed or reached with Back.
 * Every filter change drops the cursor, which sends the user back to page 1.
 */
export function useContactListParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => parseListParams(searchParams), [searchParams]);

  const update = useCallback(
    (changes: Record<string, string | null>, opts: { resetPage?: boolean; replace?: boolean } = {}) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (opts.resetPage ?? true) next.delete('cursor');
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setSearchParams],
  );

  const actions = useMemo(
    () => ({
      // replace: typing shouldn't add a history entry per search
      setQuery: (q: string) => update({ q: q.trim() || null }, { replace: true }),
      setCompany: (company: string) => update({ company: company || null }),
      setTags: (tags: string[]) => update({ tags: tags.length ? tags.join(',') : null }),
      setSort: (sort: SortField, order: SortOrder) => update({ sort, order }),
      goToCursor: (cursor: string | null) => update({ cursor }, { resetPage: false }),
      clearFilters: () => update({ q: null, tags: null, company: null }),
    }),
    [update],
  );

  const hasFilters = Boolean(params.q || params.tags.length || params.company);
  return { params, hasFilters, ...actions };
}
