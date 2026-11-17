import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { contactKeys, contactsApi } from '../../api/contacts';
import { errorMessage } from '../../api/client';
import type { BulkTagResult } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useTagsQuery } from '../../hooks/useContactsQuery';
import s from './contacts.module.less';

type Props = {
  selectedIds: ReadonlySet<number>;
  onClearSelection: () => void;
  onDone: (result: BulkTagResult) => void;
};

export const MAX_BULK = 500;

export function BulkTagBar({ selectedIds, onClearSelection, onDone }: Props) {
  const [tagName, setTagName] = useState('');
  const [error, setError] = useState<string>();
  const queryClient = useQueryClient();
  const tags = useTagsQuery();

  const mutation = useMutation({
    mutationFn: (vars: { ids: number[]; tag: string }) => contactsApi.bulkAddTag(vars.ids, vars.tag),
    onSuccess: (result) => {
      // Lists and details now show the new tag; a brand-new tag appears in the filter.
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
      queryClient.invalidateQueries({ queryKey: contactKeys.tags });
      setTagName('');
      onDone(result);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const count = selectedIds.size;
  const tooMany = count > MAX_BULK;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = tagName.trim();
    if (!name) return setError('Enter a tag name');
    if (name.length > 50) return setError('Tag names can be at most 50 characters');
    setError(undefined);
    mutation.mutate({ ids: [...selectedIds], tag: name });
  };

  return (
    <section className={s.bulkBar} aria-label="Bulk actions">
      <p className={s.bulkCount} aria-live="polite">
        <strong>{count}</strong> selected
        {tooMany && <span className={s.bulkWarn}> — select at most {MAX_BULK}</span>}
      </p>
      <form className={s.bulkForm} onSubmit={submit} noValidate>
        <Field id="bulk-tag" label="Tag to add" hideLabel error={error}>
          {(p) => (
            <Input
              {...p}
              list="bulk-tag-options"
              placeholder="Tag to add, e.g. VIP"
              value={tagName}
              maxLength={50}
              onChange={(e) => {
                setTagName(e.target.value);
                if (error) setError(undefined);
              }}
            />
          )}
        </Field>
        <datalist id="bulk-tag-options">
          {tags.data?.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </datalist>
        <Button type="submit" variant="primary" loading={mutation.isPending} disabled={tooMany}>
          Add tag
        </Button>
        <Button variant="ghost" onClick={onClearSelection} disabled={mutation.isPending}>
          Clear selection
        </Button>
      </form>
    </section>
  );
}
