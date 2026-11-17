import { useQuery } from '@tanstack/react-query';
import { contactKeys, contactsApi } from '../api/contacts';

export function useContact(id: number) {
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: ({ signal }) => contactsApi.get(id, signal),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function useActivities(id: number) {
  return useQuery({
    queryKey: contactKeys.activities(id),
    queryFn: ({ signal }) => contactsApi.activities(id, signal),
  });
}
