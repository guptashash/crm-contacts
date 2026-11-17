import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { contactKeys, contactsApi } from '../api/contacts';
import type { ContactListParams } from '../api/types';

/**
 * - The `signal` cancels the previous request when params change, so a slow,
 *   stale response can never overwrite newer results.
 * - `keepPreviousData` keeps the old rows on screen while the next page or
 *   filter loads, instead of flashing a spinner.
 */
export function useContactsQuery(params: ContactListParams) {
  return useQuery({
    queryKey: contactKeys.list(params),
    queryFn: ({ signal }) => contactsApi.list(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useTagsQuery() {
  return useQuery({
    queryKey: contactKeys.tags,
    queryFn: ({ signal }) => contactsApi.tags(signal),
    staleTime: 5 * 60_000,
  });
}

export function useCompaniesQuery() {
  return useQuery({
    queryKey: contactKeys.companies,
    queryFn: ({ signal }) => contactsApi.companies(signal),
    staleTime: 5 * 60_000,
  });
}
