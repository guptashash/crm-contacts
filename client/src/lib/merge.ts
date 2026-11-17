import type { Contact } from '../api/types';

/**
 * Three-way merge used when a save hits a version conflict.
 *
 *   base   = the record the user started editing from
 *   mine   = the user's draft
 *   theirs = the latest record on the server
 *
 * For each field:
 *   - only they changed it    → take theirs (automatically)
 *   - only I changed it       → keep mine
 *   - both changed it, same   → no conflict
 *   - both changed it, differ → conflict: the user must choose
 *
 * Pure function, no React: easy to unit-test and to explain.
 */

export const EDITABLE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'company'] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** Form values are always strings; '' means "empty" (stored as null on the server). */
export type ContactFormValues = Record<EditableField, string>;

export const FIELD_LABELS: Record<EditableField, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  company: 'Company',
};

export function toFormValues(c: Contact): ContactFormValues {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email ?? '',
    phone: c.phone ?? '',
    company: c.company ?? '',
  };
}

/** Same normalisation as the server, so "A@x.com " and "a@x.com" count as equal. */
export function normalize(field: EditableField, value: string): string {
  const v = value.trim();
  return field === 'email' ? v.toLowerCase() : v;
}

const same = (field: EditableField, a: string, b: string) => normalize(field, a) === normalize(field, b);

/** Fields whose value differs between two versions. */
export function changedFields(from: ContactFormValues, to: ContactFormValues): EditableField[] {
  return EDITABLE_FIELDS.filter((f) => !same(f, from[f], to[f]));
}

export type Conflict = { field: EditableField; base: string; mine: string; theirs: string };

export type MergeResult = {
  /** Draft with their non-conflicting changes applied; conflicting fields still hold my value. */
  merged: ContactFormValues;
  /** Fields only the other user changed (already applied to `merged`). */
  theirChanges: { field: EditableField; from: string; to: string }[];
  /** Fields only I changed (kept). */
  myChanges: EditableField[];
  /** Fields we both changed to different values. */
  conflicts: Conflict[];
};

export function threeWayMerge(
  base: ContactFormValues,
  mine: ContactFormValues,
  theirs: ContactFormValues,
): MergeResult {
  const merged = { ...mine };
  const result: MergeResult = { merged, theirChanges: [], myChanges: [], conflicts: [] };

  for (const f of EDITABLE_FIELDS) {
    const iChanged = !same(f, base[f], mine[f]);
    const theyChanged = !same(f, base[f], theirs[f]);

    if (!iChanged) {
      merged[f] = theirs[f];
      if (theyChanged) result.theirChanges.push({ field: f, from: base[f], to: theirs[f] });
    } else if (!theyChanged || same(f, mine[f], theirs[f])) {
      result.myChanges.push(f);
    } else {
      result.conflicts.push({ field: f, base: base[f], mine: mine[f], theirs: theirs[f] });
    }
  }
  return result;
}

export type Choice = 'mine' | 'theirs';

/** Applies the user's choice for each conflicting field. */
export function resolveMerge(result: MergeResult, choices: Partial<Record<EditableField, Choice>>) {
  const values = { ...result.merged };
  for (const c of result.conflicts) {
    values[c.field] = choices[c.field] === 'theirs' ? c.theirs : c.mine;
  }
  return values;
}
