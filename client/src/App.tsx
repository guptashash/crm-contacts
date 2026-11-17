import { Link, Outlet } from 'react-router-dom';
import { EmptyState } from './components/ui/Feedback';
import s from './App.module.less';

/** Shared page frame: skip link, top bar, main content area. */
export function Layout() {
  return (
    <>
      <a href="#main" className={s.skipLink}>
        Skip to content
      </a>
      <header className={s.topbar}>
        <Link to="/" className={s.brand}>
          CRM <span>Contacts</span>
        </Link>
      </header>
      <main id="main" className={s.main}>
        <Outlet />
      </main>
    </>
  );
}

export function NotFound() {
  return (
    <EmptyState title="Page not found">
      <Link to="/">Go to contacts</Link>
    </EmptyState>
  );
}
