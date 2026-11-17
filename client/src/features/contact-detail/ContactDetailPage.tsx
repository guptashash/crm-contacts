import { Link, useParams } from 'react-router-dom';

/** Placeholder until part 2 (form, tags, activity, conflict handling). */
export function ContactDetailPage() {
  const { id } = useParams();
  return (
    <div>
      <p>
        <Link to="/">← Back to contacts</Link>
      </p>
      <h1>Contact #{id}</h1>
      <p>Detail page coming in part 2.</p>
    </div>
  );
}
