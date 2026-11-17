import type { RouteObject } from 'react-router-dom';
import { Layout, NotFound } from './App';
import { Spinner } from './components/ui/Feedback';
import { ContactsPage } from './features/contacts/ContactsPage';

// A "data router" (createBrowserRouter) is needed for useBlocker (unsaved-changes guard).
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    // shown while a lazy route loads on first visit
    hydrateFallbackElement: <Spinner label="Loading" />,
    children: [
      { index: true, element: <ContactsPage /> },
      {
        path: 'contacts/:id',
        // Route-level code splitting: the form, merge logic and dialog load only when needed.
        lazy: async () => ({
          Component: (await import('./features/contact-detail/ContactDetailPage')).ContactDetailPage,
        }),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
