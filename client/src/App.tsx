import { Link, Route, Routes } from 'react-router-dom';
import { ContactsPage } from './features/contacts/ContactsPage';
import { ContactDetailPage } from './features/contact-detail/ContactDetailPage';
import { EmptyState } from './components/ui/Feedback';
import s from './App.module.less';

export default function App() {
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
        <Routes>
          <Route path="/" element={<ContactsPage />} />
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
          <Route
            path="*"
            element={
              <EmptyState title="Page not found">
                <Link to="/">Go to contacts</Link>
              </EmptyState>
            }
          />
        </Routes>
      </main>
    </>
  );
}
