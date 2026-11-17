import { Link } from 'react-router-dom';
import type { Contact } from '../../api/types';
import { TagChip } from '../../components/ui/TagChip';
import { formatDate, fullName } from '../../lib/format';
import s from './contacts.module.less';

type Props = {
  contacts: Contact[];
  selectedIds: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: number[], select: boolean) => void;
  busy: boolean;
  /** Current list URL query, so the detail page can link back to the same view. */
  listSearch: string;
};

/**
 * A real <table> on wide screens. On phones the same markup is restyled
 * into cards (see contacts.module.less), so there's only one DOM to keep in sync.
 */
export function ContactTable({ contacts, selectedIds, onToggle, onToggleAll, busy, listSearch }: Props) {
  const pageIds = contacts.map((c) => c.id);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = selectedOnPage === pageIds.length && pageIds.length > 0;

  return (
    <table className={s.table} aria-busy={busy}>
      <caption className="sr-only">Contacts</caption>
      <thead>
        <tr>
          <th scope="col" className={s.checkCell}>
            <input
              type="checkbox"
              aria-label={allSelected ? 'Deselect all on this page' : 'Select all on this page'}
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = selectedOnPage > 0 && !allSelected;
              }}
              onChange={() => onToggleAll(pageIds, !allSelected)}
            />
          </th>
          <th scope="col">Name</th>
          <th scope="col">Email</th>
          <th scope="col">Phone</th>
          <th scope="col">Company</th>
          <th scope="col">Tags</th>
          <th scope="col">Created</th>
        </tr>
      </thead>
      <tbody>
        {contacts.map((c) => {
          const name = fullName(c);
          const selected = selectedIds.has(c.id);
          return (
            <tr key={c.id} className={selected ? s.selectedRow : undefined}>
              <td className={s.checkCell}>
                <input
                  type="checkbox"
                  aria-label={`Select ${name}`}
                  checked={selected}
                  onChange={() => onToggle(c.id)}
                />
              </td>
              <th scope="row" className={s.nameCell}>
                <Link to={`/contacts/${c.id}`} state={{ listSearch }}>
                  {name}
                </Link>
              </th>
              <td data-label="Email" className={s.truncate}>
                {c.email ?? <span className={s.muted}>—</span>}
              </td>
              <td data-label="Phone">{c.phone ?? <span className={s.muted}>—</span>}</td>
              <td data-label="Company" className={s.truncate}>
                {c.company ?? <span className={s.muted}>—</span>}
              </td>
              <td data-label="Tags">
                {c.tags.length ? (
                  <span className={s.chips}>
                    {c.tags.map((t) => (
                      <TagChip key={t.id} name={t.name} />
                    ))}
                  </span>
                ) : (
                  <span className={s.muted}>—</span>
                )}
              </td>
              <td data-label="Created">
                <time dateTime={c.createdAt}>{formatDate(c.createdAt)}</time>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
