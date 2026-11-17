import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactsPage } from './ContactsPage';
import { listCalls, makeContact, mockFetch, renderWithProviders } from '../../test/utils';
import { parseListParams } from '../../hooks/useContactListParams';

const alice = makeContact({ firstName: 'Alice', lastName: 'Ng', tags: [{ id: 1, name: 'VIP' }] });
const bob = makeContact({ firstName: 'Bob', lastName: 'Ray' });

/** Default backend: tags, companies, and a list handler you can override. */
function backend(list: (url: URL) => { status?: number; body: unknown }) {
  return mockFetch((url, init) => {
    if (url.pathname === '/api/tags') return { body: { items: [{ id: 1, name: 'VIP' }, { id: 2, name: 'Lead' }] } };
    if (url.pathname === '/api/companies') return { body: { items: ['Acme', 'Globex'] } };
    if (url.pathname === '/api/contacts') return list(url);
    if (url.pathname === '/api/contacts/bulk/tags' && init?.method === 'POST') {
      const { contactIds, tagName } = JSON.parse(String(init.body));
      return { body: { tag: { id: 9, name: tagName }, added: contactIds.length, alreadyTagged: 0, notFound: [] } };
    }
    return undefined;
  });
}

const location = () => screen.getByTestId('location').textContent ?? '';

describe('parseListParams', () => {
  it('falls back to defaults for missing or invalid values', () => {
    const p = parseListParams(new URLSearchParams('sort=bogus&order=sideways&tags=VIP,,Lead'));
    expect(p).toEqual({ q: '', tags: ['VIP', 'Lead'], company: '', sort: 'name', order: 'asc', cursor: null });
  });
});

describe('ContactsPage', () => {
  it('shows contacts returned by the API', async () => {
    backend(() => ({ body: { items: [alice, bob], nextCursor: null } }));
    renderWithProviders(<ContactsPage />);

    expect(await screen.findByRole('link', { name: 'Alice Ng' })).toHaveAttribute('href', `/contacts/${alice.id}`);
    expect(screen.getByRole('link', { name: 'Bob Ray' })).toBeInTheDocument();
    expect(screen.getByText('2 contacts on this page')).toBeInTheDocument();
  });

  it('restores filters from the URL and sends them to the API', async () => {
    const fetch = backend(() => ({ body: { items: [alice], nextCursor: null } }));
    renderWithProviders(<ContactsPage />, { route: '/?q=ali&tags=VIP&company=Acme&sort=createdAt&order=desc' });

    await screen.findByRole('link', { name: 'Alice Ng' });
    const sent = listCalls(fetch)[0].searchParams;
    expect(Object.fromEntries(sent)).toMatchObject({
      q: 'ali', tags: 'VIP', company: 'Acme', sort: 'createdAt', order: 'desc',
    });
    expect(screen.getByRole('searchbox', { name: 'Search contacts' })).toHaveValue('ali');
    expect(screen.getByRole('button', { name: 'VIP' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('waits for 2+ characters and a pause before searching', async () => {
    const user = userEvent.setup();
    const fetch = backend(() => ({ body: { items: [alice], nextCursor: null } }));
    renderWithProviders(<ContactsPage />);
    await screen.findByRole('link', { name: 'Alice Ng' });

    const box = screen.getByRole('searchbox', { name: 'Search contacts' });
    await user.type(box, 'a');
    expect(screen.getByText('Type at least 2 characters to search')).toBeInTheDocument();

    await user.type(box, 'li');
    // Debounced: the URL and request update once, with the full term.
    await waitFor(() => expect(location()).toBe('/?q=ali'));
    const searches = listCalls(fetch).map((u) => u.searchParams.get('q'));
    expect(searches).toEqual([null, 'ali']);
  });

  it('shows an empty state and clears filters', async () => {
    const user = userEvent.setup();
    backend((url) => ({ body: { items: url.searchParams.get('q') ? [] : [alice], nextCursor: null } }));
    renderWithProviders(<ContactsPage />, { route: '/?q=zzz' });

    expect(await screen.findByText('No contacts match')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);

    expect(await screen.findByRole('link', { name: 'Alice Ng' })).toBeInTheDocument();
    expect(location()).toBe('/');
    expect(screen.getByRole('searchbox', { name: 'Search contacts' })).toHaveValue('');
  });

  it('shows an error with a working retry', async () => {
    const user = userEvent.setup();
    let fail = true;
    backend(() =>
      fail
        ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Database is down' } } }
        : { body: { items: [alice], nextCursor: null } },
    );
    renderWithProviders(<ContactsPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Database is down')).toBeInTheDocument();

    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Alice Ng' })).toBeInTheDocument();
  });

  it('pages forward and back with cursors, and a filter change returns to page 1', async () => {
    const user = userEvent.setup();
    const fetch = backend((url) =>
      url.searchParams.get('cursor') === 'c2'
        ? { body: { items: [bob], nextCursor: null } }
        : { body: { items: [alice], nextCursor: 'c2' } },
    );
    renderWithProviders(<ContactsPage />);
    await screen.findByRole('link', { name: 'Alice Ng' });
    expect(screen.getByText('Page 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByRole('link', { name: 'Bob Ray' })).toBeInTheDocument();
    expect(location()).toContain('cursor=c2');
    expect(screen.getByText('Page 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(await screen.findByRole('link', { name: 'Alice Ng' })).toBeInTheDocument();
    expect(location()).not.toContain('cursor');

    // Go to page 2 again, then change a filter: cursor must be dropped.
    await user.click(screen.getByRole('button', { name: /next/i }));
    await screen.findByRole('link', { name: 'Bob Ray' });
    await user.click(screen.getByRole('button', { name: 'Lead' }));
    await waitFor(() => expect(location()).toBe('/?tags=Lead'));
    expect(listCalls(fetch).at(-1)!.searchParams.get('cursor')).toBeNull();
  });

  it('bulk-assigns a tag to the selected contacts', async () => {
    const user = userEvent.setup();
    const fetch = backend(() => ({ body: { items: [alice, bob], nextCursor: null } }));
    renderWithProviders(<ContactsPage />);
    await screen.findByRole('link', { name: 'Alice Ng' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all on this page' }));
    expect(screen.getByText('selected').textContent).toContain('2');

    await user.type(screen.getByRole('combobox', { name: 'Tag to add' }), 'Webinar');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));

    expect(await screen.findByText(/Tag “Webinar” added to 2 contacts/)).toBeInTheDocument();
    const post = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ contactIds: [alice.id, bob.id], tagName: 'Webinar' });
    // selection is cleared afterwards
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
  });

  it('requires a tag name before bulk-assigning', async () => {
    const user = userEvent.setup();
    backend(() => ({ body: { items: [alice], nextCursor: null } }));
    renderWithProviders(<ContactsPage />);
    await user.click(await screen.findByRole('checkbox', { name: 'Select Alice Ng' }));
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    expect(screen.getByText('Enter a tag name')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tag to add' })).toHaveAttribute('aria-invalid', 'true');
  });
});
