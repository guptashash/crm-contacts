import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { contactKeys, contactsApi } from '../../api/contacts';
import { errorMessage } from '../../api/client';
import type { Contact, Tag } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { TagChip } from '../../components/ui/TagChip';
import { useTagsQuery } from '../../hooks/useContactsQuery';
import s from './detail.module.less';

/**
 * Tags are saved immediately and independently of the details form.
 * They don't change the contact's version, so editing tags never causes
 * a false conflict for someone editing the name or email.
 */
export function TagEditor({ contact }: { contact: Contact }) {
  const queryClient = useQueryClient();
  const allTags = useTagsQuery();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();

  const onTagsChanged = (tags: Tag[]) => {
    queryClient.setQueryData<Contact>(contactKeys.detail(contact.id), (old) => (old ? { ...old, tags } : old));
    queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
    queryClient.invalidateQueries({ queryKey: contactKeys.activities(contact.id) });
    queryClient.invalidateQueries({ queryKey: contactKeys.tags });
  };

  const add = useMutation({
    mutationFn: (tagName: string) => contactsApi.addTag(contact.id, tagName),
    onSuccess: (r) => {
      onTagsChanged(r.tags);
      setName('');
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (tagId: number) => contactsApi.removeTag(contact.id, tagId),
    onSuccess: (r) => onTagsChanged(r.tags),
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const tagName = name.trim();
    if (!tagName) return setError('Enter a tag name');
    if (tagName.length > 50) return setError('Tag names can be at most 50 characters');
    if (contact.tags.some((t) => t.name.toLowerCase() === tagName.toLowerCase())) {
      return setError(`Already tagged “${tagName}”`);
    }
    setError(undefined);
    add.mutate(tagName);
  };

  const suggestions = allTags.data?.filter((t) => !contact.tags.some((ct) => ct.id === t.id)) ?? [];

  return (
    <section className={s.card} aria-labelledby="tags-heading">
      <h2 id="tags-heading" className={s.cardTitle}>
        Tags
      </h2>

      {contact.tags.length ? (
        <ul className={s.tagList} aria-label="Assigned tags">
          {contact.tags.map((t) => (
            <li key={t.id}>
              <TagChip
                name={t.name}
                onRemove={() => remove.mutate(t.id)}
                removing={remove.isPending && remove.variables === t.id}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.muted}>No tags yet.</p>
      )}

      <form className={s.tagForm} onSubmit={submit} noValidate>
        <Field id="add-tag" label="Add a tag" hideLabel error={error}>
          {(p) => (
            <Input
              {...p}
              list="tag-suggestions"
              placeholder="Add a tag, e.g. Customer"
              value={name}
              maxLength={50}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(undefined);
              }}
            />
          )}
        </Field>
        <datalist id="tag-suggestions">
          {suggestions.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </datalist>
        <Button type="submit" loading={add.isPending}>
          Add
        </Button>
      </form>
    </section>
  );
}
