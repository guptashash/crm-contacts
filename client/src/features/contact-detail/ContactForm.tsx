import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { contactKeys, contactsApi, type ContactUpdate } from '../../api/contacts';
import { errorMessage, isApiError } from '../../api/client';
import type { Contact } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Banner } from '../../components/ui/Feedback';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input } from '../../components/ui/Field';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import {
  EDITABLE_FIELDS,
  changedFields,
  threeWayMerge,
  toFormValues,
  type ContactFormValues,
  type EditableField,
  type MergeResult,
} from '../../lib/merge';
import { ConflictDialog } from './ConflictDialog';
import { contactFormSchema } from './contactSchema';
import s from './detail.module.less';

type ConflictState = { latest: Contact; result: MergeResult; draft: ContactFormValues };

const FIELDS: { name: EditableField; label: string; type?: string; autoComplete: string; required?: boolean }[] = [
  { name: 'firstName', label: 'First name', autoComplete: 'given-name', required: true },
  { name: 'lastName', label: 'Last name', autoComplete: 'family-name' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
  { name: 'company', label: 'Company', autoComplete: 'organization' },
];

/** Only the fields that changed, plus the version the edit is based on. */
function buildUpdate(from: Contact, values: ContactFormValues): ContactUpdate {
  const update: ContactUpdate = { version: from.version };
  for (const f of changedFields(toFormValues(from), values)) update[f] = values[f].trim();
  return update;
}

export function ContactForm({ contact }: { contact: Contact }) {
  const queryClient = useQueryClient();
  // The server record this draft started from. Its `version` is sent with every save.
  const [base, setBase] = useState(contact);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: toFormValues(contact),
    mode: 'onTouched', // validate a field once the user leaves it, then as they type
  });

  const mutation = useMutation({
    mutationFn: (update: ContactUpdate) => contactsApi.update(contact.id, update),
  });

  const blocker = useUnsavedChangesGuard(isDirty && !isSubmitting);

  const applySaved = (saved: Contact) => {
    queryClient.setQueryData(contactKeys.detail(saved.id), saved);
    queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
    queryClient.invalidateQueries({ queryKey: contactKeys.activities(saved.id) });
    setBase(saved);
    reset(toFormValues(saved));
    setConflict(null);
  };

  /** Saves `values` as an edit of `from`. Handles conflicts and server validation errors. */
  const save = async (values: ContactFormValues, from: Contact) => {
    setStatus(null);
    const update = buildUpdate(from, values);
    if (Object.keys(update).length === 1) {
      // nothing differs from the server version
      applySaved(from);
      return;
    }
    try {
      applySaved(await mutation.mutateAsync(update));
      setStatus({ tone: 'success', text: 'Changes saved.' });
    } catch (e) {
      if (isApiError(e) && e.code === 'VERSION_CONFLICT' && e.current) {
        const latest = e.current as Contact;
        queryClient.setQueryData(contactKeys.detail(latest.id), latest);
        setConflict({
          latest,
          draft: values,
          result: threeWayMerge(toFormValues(from), values, toFormValues(latest)),
        });
        return;
      }
      if (isApiError(e) && e.fields) {
        let shown = false;
        for (const [field, message] of Object.entries(e.fields)) {
          if ((EDITABLE_FIELDS as readonly string[]).includes(field)) {
            setError(field as EditableField, { type: 'server', message }, { shouldFocus: !shown });
            shown = true;
          }
        }
        if (shown) return;
      }
      setStatus({ tone: 'error', text: `Couldn't save: ${errorMessage(e)}` });
    }
  };

  return (
    <section className={s.card} aria-labelledby="details-heading">
      <h2 id="details-heading" className={s.cardTitle}>
        Details
      </h2>

      {status && (
        <Banner tone={status.tone} onDismiss={() => setStatus(null)}>
          {status.text}
        </Banner>
      )}

      <form className={s.form} onSubmit={handleSubmit((values) => save(values, base))} noValidate>
        {FIELDS.map((f) => (
          <Field key={f.name} id={`contact-${f.name}`} label={f.label} required={f.required} error={errors[f.name]?.message}>
            {(p) => (
              <Input
                {...p}
                {...register(f.name, { onChange: () => status?.tone === 'success' && setStatus(null) })}
                type={f.type ?? 'text'}
                autoComplete={f.autoComplete}
              />
            )}
          </Field>
        ))}

        <div className={s.formActions}>
          <Button
            variant="ghost"
            onClick={() => {
              reset(toFormValues(base));
              setStatus(null);
            }}
            disabled={!isDirty || isSubmitting}
          >
            Undo changes
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
            Save changes
          </Button>
        </div>
        {isDirty && !isSubmitting && (
          <output className={s.unsavedNote}>You have unsaved changes</output>
        )}
      </form>

      {conflict && (
        <ConflictDialog
          result={conflict.result}
          latest={conflict.latest}
          draft={conflict.draft}
          saving={mutation.isPending}
          onSave={(values) => save(values, conflict.latest)}
          onDiscardMine={() => {
            applySaved(conflict.latest);
            setStatus({ tone: 'success', text: 'Your changes were discarded. Showing the latest version.' });
          }}
          onCancel={() => {
            // Keep the draft untouched. `base` stays the old version, so the next
            // save hits the conflict again and nothing is ever overwritten silently.
            setConflict(null);
            setStatus({
              tone: 'warning',
              text: 'Someone else changed this contact. When you save, you will be asked to resolve the differences.',
            });
          }}
        />
      )}

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title="Discard unsaved changes?"
        description="You've edited this contact but haven't saved. If you leave now, your changes will be lost."
        footer={
          <>
            <Button onClick={() => blocker.reset?.()}>Stay and keep editing</Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard and leave
            </Button>
          </>
        }
      />
    </section>
  );
}
