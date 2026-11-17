import { describe, expect, it } from 'vitest';
import { resolveMerge, threeWayMerge, type ContactFormValues } from './merge';

const base: ContactFormValues = {
  firstName: 'Ana',
  lastName: 'Lee',
  email: 'ana@x.com',
  phone: '',
  company: 'Acme',
};

describe('threeWayMerge', () => {
  it('takes their change when only they changed a field', () => {
    const r = threeWayMerge(base, base, { ...base, company: 'Globex' });
    expect(r.merged.company).toBe('Globex');
    expect(r.theirChanges).toEqual([{ field: 'company', from: 'Acme', to: 'Globex' }]);
    expect(r.conflicts).toEqual([]);
  });

  it('keeps my change when only I changed a field', () => {
    const r = threeWayMerge(base, { ...base, phone: '+1 555 0100' }, base);
    expect(r.merged.phone).toBe('+1 555 0100');
    expect(r.myChanges).toEqual(['phone']);
  });

  it('merges independent changes to different fields with no conflict', () => {
    const r = threeWayMerge(base, { ...base, firstName: 'Anna' }, { ...base, company: 'Globex' });
    expect(r.merged).toMatchObject({ firstName: 'Anna', company: 'Globex' });
    expect(r.conflicts).toEqual([]);
  });

  it('reports a conflict when both changed the same field differently', () => {
    const r = threeWayMerge(base, { ...base, email: 'mine@x.com' }, { ...base, email: 'theirs@x.com' });
    expect(r.conflicts).toEqual([{ field: 'email', base: 'ana@x.com', mine: 'mine@x.com', theirs: 'theirs@x.com' }]);
  });

  it('is not a conflict when both made the same change (ignoring case/whitespace for email)', () => {
    const r = threeWayMerge(base, { ...base, email: ' NEW@x.com ' }, { ...base, email: 'new@x.com' });
    expect(r.conflicts).toEqual([]);
  });

  it('applies the chosen side for each conflict', () => {
    const r = threeWayMerge(
      base,
      { ...base, firstName: 'Mine', lastName: 'MineLast' },
      { ...base, firstName: 'Theirs', lastName: 'TheirsLast', company: 'Globex' },
    );
    const values = resolveMerge(r, { firstName: 'mine', lastName: 'theirs' });
    expect(values).toMatchObject({ firstName: 'Mine', lastName: 'TheirsLast', company: 'Globex' });
  });
});
