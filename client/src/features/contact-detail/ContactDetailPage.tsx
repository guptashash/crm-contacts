import { Link, useLocation, useParams } from 'react-router-dom';
import { errorMessage, isApiError } from '../../api/client';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback';
import { useContact } from '../../hooks/useContact';
import { formatDateTime, fullName } from '../../lib/format';
import { ActivityList } from './ActivityList';
import { ContactForm } from './ContactForm';
import { TagEditor } from './TagEditor';
import s from './detail.module.less';

export function ContactDetailPage() {
  const id = Number(useParams().id);
  const location = useLocation();
  // Return to the exact list view (search, filters, page) the user came from.
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? '';
  const query = useContact(id);

  const backLink = (
    <Link to={`/${listSearch}`} className={s.back}>
      ← Back to contacts
    </Link>
  );

  if (!Number.isInteger(id) || id <= 0 || (query.isError && isApiError(query.error) && query.error.status === 404)) {
    return (
      <div className={s.page}>
        {backLink}
        <EmptyState title="Contact not found">
          <p>It may have been deleted, or the link is wrong.</p>
        </EmptyState>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className={s.page}>
        {backLink}
        <div className={s.center}>
          <Spinner label="Loading contact" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className={s.page}>
        {backLink}
        <ErrorState title="Couldn't load contact" message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      </div>
    );
  }

  const contact = query.data;
  return (
    <div className={s.page}>
      {backLink}
      <header className={s.header}>
        <h1>{fullName(contact)}</h1>
        <p className={s.meta}>
          Created {formatDateTime(contact.createdAt)} · Updated {formatDateTime(contact.updatedAt)}
        </p>
      </header>

      <div className={s.grid}>
        {/* key: a different contact gets a fresh form, never a stale draft */}
        <ContactForm key={contact.id} contact={contact} />
        <div className={s.side}>
          <TagEditor contact={contact} />
          <ActivityList contactId={contact.id} />
        </div>
      </div>
    </div>
  );
}
