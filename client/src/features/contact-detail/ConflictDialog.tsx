import { useState } from 'react';
import type { Contact } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { formatDateTime } from '../../lib/format';
import {
  FIELD_LABELS,
  resolveMerge,
  type Choice,
  type ContactFormValues,
  type EditableField,
  type MergeResult,
} from '../../lib/merge';
import s from './detail.module.less';

type Props = {
  result: MergeResult;
  latest: Contact;
  draft: ContactFormValues;
  saving: boolean;
  onSave: (values: ContactFormValues) => void;
  onDiscardMine: () => void;
  onCancel: () => void;
};

const show = (v: string) => (v.trim() === '' ? <em className={s.empty}>(empty)</em> : v);

/**
 * Shown when someone else saved this contact while the user was editing.
 * Nothing is lost: their non-overlapping changes are merged in, the user's
 * edits are kept, and each true conflict needs an explicit choice.
 */
export function ConflictDialog({ result, latest, draft, saving, onSave, onDiscardMine, onCancel }: Props) {
  const [choices, setChoices] = useState<Partial<Record<EditableField, Choice>>>({});
  const unresolved = result.conflicts.filter((c) => !choices[c.field]).length;

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(open) => !open && onCancel()}
      title="This contact was changed by someone else"
      description={`It was updated ${formatDateTime(latest.updatedAt)}, after you opened it. Review the changes below — your edits are still here.`}
      footer={
        <>
          <Button variant="ghost" onClick={onDiscardMine} disabled={saving}>
            Discard my changes
          </Button>
          <Button onClick={onCancel} disabled={saving}>
            Keep editing
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={unresolved > 0}
            onClick={() => onSave(resolveMerge(result, choices))}
          >
            {unresolved > 0 ? `Resolve ${unresolved} conflict${unresolved > 1 ? 's' : ''}` : 'Save merged version'}
          </Button>
        </>
      }
    >
      <div className={s.mergeSections}>
        {result.conflicts.length > 0 && (
          <section aria-labelledby="conflicts-heading">
            <h3 id="conflicts-heading" className={s.mergeHeading}>
              Conflicts — you both changed these
            </h3>
            {result.conflicts.map((c) => (
              <fieldset key={c.field} className={s.conflict}>
                <legend>{FIELD_LABELS[c.field]}</legend>
                {(['mine', 'theirs'] as const).map((choice) => (
                  <label key={choice} className={s.choice}>
                    <input
                      type="radio"
                      name={`conflict-${c.field}`}
                      checked={choices[c.field] === choice}
                      onChange={() => setChoices((prev) => ({ ...prev, [c.field]: choice }))}
                    />
                    <span>
                      <span className={s.choiceLabel}>{choice === 'mine' ? 'Keep mine' : 'Use theirs'}</span>
                      {show(choice === 'mine' ? c.mine : c.theirs)}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </section>
        )}

        {result.theirChanges.length > 0 && (
          <section aria-labelledby="theirs-heading">
            <h3 id="theirs-heading" className={s.mergeHeading}>
              Changed by someone else — will be kept
            </h3>
            <ul className={s.changeList}>
              {result.theirChanges.map((c) => (
                <li key={c.field}>
                  <strong>{FIELD_LABELS[c.field]}:</strong> {show(c.from)} → {show(c.to)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {result.myChanges.length > 0 && (
          <section aria-labelledby="mine-heading">
            <h3 id="mine-heading" className={s.mergeHeading}>
              Your changes — will be kept
            </h3>
            <ul className={s.changeList}>
              {result.myChanges.map((f) => (
                <li key={f}>
                  <strong>{FIELD_LABELS[f]}:</strong> {show(draft[f])}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
