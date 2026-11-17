import type { Activity } from '../../api/types';
import { errorMessage } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Feedback';
import { useActivities } from '../../hooks/useContact';
import { formatDateTime } from '../../lib/format';
import { FIELD_LABELS, type EditableField } from '../../lib/merge';
import s from './detail.module.less';

const display = (v: unknown) => (v === null || v === undefined || v === '' ? '(empty)' : String(v));

function describe(a: Activity): string {
  switch (a.type) {
    case 'TAG_ADDED':
      return `Tag “${a.payload.tag}” added${a.payload.bulk ? ' (bulk)' : ''}`;
    case 'TAG_REMOVED':
      return `Tag “${a.payload.tag}” removed`;
    case 'CONTACT_UPDATED': {
      const changes = Object.entries(a.payload.changes ?? {});
      if (!changes.length) return 'Contact updated';
      return changes
        .map(([f, c]) => `${FIELD_LABELS[f as EditableField] ?? f}: ${display(c.from)} → ${display(c.to)}`)
        .join('; ');
    }
  }
}

const TYPE_LABEL: Record<Activity['type'], string> = {
  CONTACT_UPDATED: 'Updated',
  TAG_ADDED: 'Tag added',
  TAG_REMOVED: 'Tag removed',
};

export function ActivityList({ contactId }: { contactId: number }) {
  const activities = useActivities(contactId);

  return (
    <section className={s.card} aria-labelledby="activity-heading">
      <h2 id="activity-heading" className={s.cardTitle}>
        Recent activity
      </h2>

      {activities.isPending ? (
        <Spinner label="Loading activity" />
      ) : activities.isError ? (
        <div className={s.inlineError} role="alert">
          <span>Couldn't load activity: {errorMessage(activities.error)}</span>
          <Button size="sm" onClick={() => activities.refetch()}>
            Try again
          </Button>
        </div>
      ) : activities.data.length === 0 ? (
        <p className={s.muted}>No changes yet.</p>
      ) : (
        <ol className={s.activity}>
          {activities.data.map((a) => (
            <li key={a.id} className={s[a.type]}>
              <span className={s.activityType}>{TYPE_LABEL[a.type]}</span>
              <span className={s.activityText}>{describe(a)}</span>
              <time className={s.activityTime} dateTime={a.createdAt}>
                {formatDateTime(a.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
