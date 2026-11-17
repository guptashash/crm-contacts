import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import type { Contact } from '../api/types';
import { LocationProbe } from './LocationProbe';


/**
 * Renders `ui` at `route` inside a real data router (needed for useBlocker),
 * plus a catch-all route so navigating away can be asserted.
 */
export function renderWithProviders(ui: ReactNode, { route = '/', path = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path, element: <>{ui}<LocationProbe /></> },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [route] },
  );
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

type Handler = (url: URL, init?: RequestInit) => { status?: number; body: unknown } | undefined;

/**
 * Replaces global fetch. The handler gets the parsed URL and returns a response;
 * returning undefined means "not handled" and fails loudly.
 */
export function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const res = handler(url, init);
    if (!res) throw new Error(`Unhandled request: ${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
    return new Response(JSON.stringify(res.body), {
      status: res.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** The URLs of all /api/contacts list requests made so far. */
export const listCalls = (fn: ReturnType<typeof mockFetch>) =>
  fn.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((u) => u.pathname === '/api/contacts');

let nextId = 1;
export function makeContact(overrides: Partial<Contact> = {}): Contact {
  const id = nextId++;
  return {
    id,
    firstName: `First${id}`,
    lastName: `Last${id}`,
    email: `person${id}@example.com`,
    phone: '+1 555 0100',
    company: 'Acme',
    tags: [],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
