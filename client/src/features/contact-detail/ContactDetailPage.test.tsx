import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Contact, Tag } from '../../api/types';
import { ContactDetailPage } from './ContactDetailPage';
import { makeContact, mockFetch, renderWithProviders } from '../../test/utils';

type PatchResponse = { status?: number; body: unknown };

/**
 * Fake backend for one contact. `onPatch` decides what a save returns,
 * so each test can simulate success, validation errors or conflicts.
 */
function setup(contact: Contact, onPatch?: (body: Record<string, unknown>) => PatchResponse) {
  let tags: Tag[] = [...contact.tags];
  const fetch = mockFetch((url, init) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.pathname === '/api/tags') return { body: { items: [{ id: 1, name: 'VIP' }, { id: 2, name: 'Lead' }] } };
    if (url.pathname === `/api/contacts/${contact.id}/activities`) return { body: { items: [] } };
    if (url.pathname === `/api/contacts/${contact.id}` && method === 'GET') return { body: { ...contact, tags } };
    if (url.pathname === `/api/contacts/${contact.id}` && method === 'PATCH') {
      return onPatch ? onPatch(body) : { body: { ...contact, ...body, tags, version: contact.version + 1 } };
    }
    if (url.pathname === `/api/contacts/${contact.id}/tags` && method === 'POST') {
      tags = [...tags, { id: 2, name: body.name }];
      return { status: 201, body: { tags } };
    }
    const del = url.pathname.match(/\/tags\/(\d+)$/);
    if (del && method === 'DELETE') {
      tags = tags.filter((t) => t.id !== Number(del[1]));
      return { body: { tags } };
    }
    return undefined;
  });
  const result = renderWithProviders(<ContactDetailPage />, {
    route: `/contacts/${contact.id}`,
    path: '/contacts/:id',
  });
  return { fetch, ...result };
}

const patches = (fetch: ReturnType<typeof mockFetch>) =>
  fetch.mock.calls
    .filter(([, init]) => init?.method === 'PATCH')
    .map(([, init]) => JSON.parse(String(init!.body)));

const field = (name: string) => screen.getByRole('textbox', { name: new RegExp(`^${name}`) });

describe('ContactDetailPage', () => {
  it('validates on the client and shows errors next to the field', async () => {
    const user = userEvent.setup();
    const contact = makeContact({ firstName: 'Ana', lastName: 'Lee' });
    const { fetch } = setup(contact);
    await screen.findByRole('heading', { name: 'Ana Lee' });

    await user.clear(field('Email'));
    await user.type(field('Email'), 'not-an-email');
    await user.clear(field('First name'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(field('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(patches(fetch)).toEqual([]); // nothing sent
  });

  it('sends only changed fields plus the version, then confirms', async () => {
    const user = userEvent.setup();
    const contact = makeContact({ firstName: 'Ana', lastName: 'Lee', version: 3 });
    const { fetch } = setup(contact);
    await screen.findByRole('heading', { name: 'Ana Lee' });

    await user.clear(field('Company'));
    await user.type(field('Company'), '  Globex  ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
    expect(patches(fetch)).toEqual([{ version: 3, company: 'Globex' }]);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled(); // form is clean again
  });

  it('shows a server error (duplicate email) on the email field', async () => {
    const user = userEvent.setup();
    const contact = makeContact({ firstName: 'Ana', lastName: 'Lee' });
    setup(contact, () => ({
      status: 409,
      body: {
        error: {
          code: 'EMAIL_TAKEN',
          message: 'Email is already used by another contact',
          fields: { email: 'This email is already used by another contact' },
        },
      },
    }));
    await screen.findByRole('heading', { name: 'Ana Lee' });

    await user.clear(field('Email'));
    await user.type(field('Email'), 'taken@example.com');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('This email is already used by another contact')).toBeInTheDocument();
    expect(field('Email')).toHaveValue('taken@example.com'); // draft kept
  });

  it('on a version conflict, shows what changed and saves the merged result', async () => {
    const user = userEvent.setup();
    const contact = makeContact({ firstName: 'Ana', lastName: 'Lee', company: 'Acme', version: 1 });
    // Someone else changed firstName and company (now version 2).
    const latest = { ...contact, firstName: 'Anne', company: 'Globex', version: 2 };
    const { fetch } = setup(contact, (body) =>
      body.version === 1
        ? { status: 409, body: { error: { code: 'VERSION_CONFLICT', message: 'Changed', current: latest } } }
        : { body: { ...latest, ...body, version: 3 } },
    );
    await screen.findByRole('heading', { name: 'Ana Lee' });

    // I change firstName (conflict) and phone (only mine).
    await user.clear(field('First name'));
    await user.type(field('First name'), 'Annie');
    await user.clear(field('Phone'));
    await user.type(field('Phone'), '+1 555 0199');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialog = await screen.findByRole('dialog', { name: 'This contact was changed by someone else' });
    // their non-conflicting change is listed and kept
    expect(within(dialog).getByText(/Changed by someone else/).nextElementSibling).toHaveTextContent('Company: Acme → Globex');
    // my non-conflicting change is listed and kept
    expect(within(dialog).getByText(/Your changes/).nextElementSibling).toHaveTextContent('Phone: +1 555 0199');

    // Must choose for the conflict before saving
    const save = within(dialog).getByRole('button', { name: 'Resolve 1 conflict' });
    expect(save).toBeDisabled();
    const conflict = within(dialog).getByRole('group', { name: 'First name' });
    await user.click(within(conflict).getByRole('radio', { name: /Keep mine/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save merged version' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Second save is based on the latest version and keeps their company.
    expect(patches(fetch).at(-1)).toEqual({ version: 2, firstName: 'Annie', phone: '+1 555 0199' });
    expect(field('First name')).toHaveValue('Annie');
    expect(field('Company')).toHaveValue('Globex');
  });

  it('can discard my changes after a conflict and show the latest version', async () => {
    const user = userEvent.setup();
    const contact = makeContact({ firstName: 'Ana', lastName: 'Lee', version: 1 });
    const latest = { ...contact, firstName: 'Anne', version: 2 };
    setup(contact, () => ({
      status: 409,
      body: { error: { code: 'VERSION_CONFLICT', message: 'Changed', current: latest } },
    }));
    await screen.findByRole('heading', { name: 'Ana Lee' });

    await user.clear(field('First name'));
    await user.type(field('First name'), 'Annie');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(await screen.findByRole('button', { name: 'Discard my changes' }));

    expect(field('First name')).toHaveValue('Anne');
    expect(screen.getByText(/Your changes were discarded/)).toBeInTheDocument();
  });

  it('asks before leaving with unsaved changes', async () => {
    const user = userEvent.setup();
    const contact = makeContact({ firstName: 'Ana', lastName: 'Lee' });
    setup(contact);
    await screen.findByRole('heading', { name: 'Ana Lee' });

    await user.type(field('Company'), 'X');
    await user.click(screen.getByRole('link', { name: /Back to contacts/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Stay and keep editing' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/contacts/${contact.id}`);
    expect(field('Company')).toHaveValue(`${contact.company}X`);

    await user.click(screen.getByRole('link', { name: /Back to contacts/ }));
    await user.click(await screen.findByRole('button', { name: 'Discard and leave' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  });

  it('adds and removes tags', async () => {
    const user = userEvent.setup();
    const contact = makeContact({ firstName: 'Ana', lastName: 'Lee', tags: [{ id: 1, name: 'VIP' }] });
    setup(contact);
    await screen.findByRole('heading', { name: 'Ana Lee' });

    const tagInput = screen.getByRole('combobox', { name: 'Add a tag' });
    await user.type(tagInput, 'vip');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Already tagged “vip”')).toBeInTheDocument();

    await user.clear(tagInput);
    await user.type(tagInput, 'Lead');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const list = await screen.findByRole('list', { name: 'Assigned tags' });
    expect(await within(list).findByText('Lead')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove tag VIP' }));
    await waitFor(() => expect(within(list).queryByText('VIP')).not.toBeInTheDocument());
  });

  it('shows not found for a missing contact', async () => {
    mockFetch((url) =>
      url.pathname === '/api/contacts/999'
        ? { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Contact not found' } } }
        : undefined,
    );
    renderWithProviders(<ContactDetailPage />, { route: '/contacts/999', path: '/contacts/:id' });
    expect(await screen.findByText('Contact not found')).toBeInTheDocument();
  });
});
