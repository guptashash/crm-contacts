import type { ContactListParams, SortField, SortOrder } from '../../api/types';
import { Field, Select } from '../../components/ui/Field';
import { useCompaniesQuery, useTagsQuery } from '../../hooks/useContactsQuery';
import s from './contacts.module.less';

const SORT_OPTIONS: { value: `${SortField}:${SortOrder}`; label: string }[] = [
  { value: 'name:asc', label: 'Name (A–Z)' },
  { value: 'name:desc', label: 'Name (Z–A)' },
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
];

type Props = {
  params: ContactListParams;
  onCompanyChange: (company: string) => void;
  onTagsChange: (tags: string[]) => void;
  onSortChange: (sort: SortField, order: SortOrder) => void;
};

export function Filters({ params, onCompanyChange, onTagsChange, onSortChange }: Props) {
  const tags = useTagsQuery();
  const companies = useCompaniesQuery();

  const toggleTag = (name: string) => {
    const active = params.tags.some((t) => t.toLowerCase() === name.toLowerCase());
    onTagsChange(
      active ? params.tags.filter((t) => t.toLowerCase() !== name.toLowerCase()) : [...params.tags, name],
    );
  };

  return (
    <div className={s.filters}>
      <div className={s.selects}>
        <Field id="filter-company" label="Company">
          {(p) => (
            <Select
              {...p}
              value={params.company}
              onChange={(e) => onCompanyChange(e.target.value)}
              disabled={companies.isPending}
            >
              <option value="">All companies</option>
              {/* keep a company from the URL selectable even if it's not in the list */}
              {params.company && !companies.data?.includes(params.company) && (
                <option value={params.company}>{params.company}</option>
              )}
              {companies.data?.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id="sort" label="Sort by">
          {(p) => (
            <Select
              {...p}
              value={`${params.sort}:${params.order}`}
              onChange={(e) => {
                const [sort, order] = e.target.value.split(':') as [SortField, SortOrder];
                onSortChange(sort, order);
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <fieldset className={s.tagFilter}>
        <legend>Tags</legend>
        {tags.isError && <span className={s.muted}>Couldn't load tags</span>}
        {tags.data?.map((t) => {
          const pressed = params.tags.some((x) => x.toLowerCase() === t.name.toLowerCase());
          return (
            <button
              key={t.id}
              type="button"
              className={s.tagToggle}
              aria-pressed={pressed}
              onClick={() => toggleTag(t.name)}
            >
              {t.name}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
