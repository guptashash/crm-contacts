import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import type { BulkTagResult } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Banner, EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback';
import { filterSignature, useContactListParams } from '../../hooks/useContactListParams';
import { useContactsQuery } from '../../hooks/useContactsQuery';
import { useCursorHistory } from '../../hooks/useCursorHistory';
import { BulkTagBar } from './BulkTagBar';
import { ContactTable } from './ContactTable';
import { Filters } from './Filters';
import { Pagination } from './Pagination';
import { SearchBox } from './SearchBox';
import s from './contacts.module.less';

const NO_SELECTION: ReadonlySet<number> = new Set();

/** Page component: wires URL state, data and child components together. No business logic here. */
export function ContactsPage() {
  const location = useLocation();
  const list = useContactListParams();
  const { params } = list;
  const signature = filterSignature(params);

  const query = useContactsQuery(params);
  const history = useCursorHistory(signature, params.cursor);

  // Selection belongs to one result set. Storing the signature with it means a new
  // search/filter automatically starts with nothing selected — no effect needed.
  const [selection, setSelection] = useState({ signature, ids: NO_SELECTION });
  const selectedIds = selection.signature === signature ? selection.ids : NO_SELECTION;
  const setSelectedIds = (ids: ReadonlySet<number>) => setSelection({ signature, ids });

  const [bulkResult, setBulkResult] = useState<BulkTagResult | null>(null);

  const toggle = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const toggleAll = (ids: number[], select: boolean) => {
    const next = new Set(selectedIds);
    for (const id of ids) {
      if (select) next.add(id);
      else next.delete(id);
    }
    setSelectedIds(next);
  };

  const goNext = () => {
    const next = query.data?.nextCursor;
    if (!next) return;
    history.rememberNext(next);
    list.goToCursor(next);
    window.scrollTo({ top: 0 });
  };
  const goPrevious = () => {
    list.goToCursor(history.previousCursor);
    window.scrollTo({ top: 0 });
  };

  const items = query.data?.items ?? [];
  const showingStale = query.isPlaceholderData && query.isFetching;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1>Contacts</h1>
      </header>

      <section className={s.toolbar} aria-label="Search and filters">
        <SearchBox value={params.q} onCommit={list.setQuery} />
        <Filters
          params={params}
          onCompanyChange={list.setCompany}
          onTagsChange={list.setTags}
          onSortChange={list.setSort}
        />
        {list.hasFilters && (
          <Button variant="ghost" size="sm" className={s.clearBtn} onClick={list.clearFilters}>
            Clear filters
          </Button>
        )}
      </section>

      {bulkResult && (
        <Banner tone="success" onDismiss={() => setBulkResult(null)}>
          Tag “{bulkResult.tag.name}” added to {bulkResult.added}{' '}
          {bulkResult.added === 1 ? 'contact' : 'contacts'}
          {bulkResult.alreadyTagged > 0 && ` (${bulkResult.alreadyTagged} already had it)`}
          {bulkResult.notFound.length > 0 && `. ${bulkResult.notFound.length} no longer exist.`}
        </Banner>
      )}

      {selectedIds.size > 0 && (
        <BulkTagBar
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds(NO_SELECTION)}
          onDone={(result) => {
            setBulkResult(result);
            setSelectedIds(NO_SELECTION);
          }}
        />
      )}

      {/* Announces result changes to screen-reader users */}
      <output className={s.status} aria-live="polite">
        {query.isPending
          ? 'Loading contacts…'
          : showingStale
            ? 'Updating results…'
            : query.isSuccess
              ? `${items.length} ${items.length === 1 ? 'contact' : 'contacts'} on this page`
              : ''}
        {showingStale && <Spinner size="sm" label="" />}
      </output>

      <div className={s.results}>
        {query.isPending ? (
          <div className={s.center}>
            <Spinner label="Loading contacts" />
          </div>
        ) : query.isError ? (
          <ErrorState
            title="Couldn't load contacts"
            message={errorMessage(query.error)}
            onRetry={() => query.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState title={list.hasFilters ? 'No contacts match' : 'No contacts yet'}>
            {list.hasFilters && (
              <>
                <p>Try a different search or remove some filters.</p>
                <Button onClick={list.clearFilters}>Clear filters</Button>
              </>
            )}
          </EmptyState>
        ) : (
          <div className={showingStale ? s.stale : undefined}>
            <ContactTable
              contacts={items}
              selectedIds={selectedIds}
              onToggle={toggle}
              onToggleAll={toggleAll}
              busy={showingStale}
              listSearch={location.search}
            />
          </div>
        )}
      </div>

      <Pagination
        pageNumber={history.pageNumber}
        hasPrevious={history.hasPrevious}
        hasNext={Boolean(query.data?.nextCursor)}
        disabled={query.isFetching}
        onPrevious={goPrevious}
        onNext={goNext}
      />
    </div>
  );
}
