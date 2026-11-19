# CRM Contact Workspace

Browse, search, filter, sort and edit contacts, manage their tags (one at a time or in bulk), and see each contact's recent activity. React + TypeScript frontend, Node + Express backend, SQLite storage.

## Live demo

**https://crm-contacts.onrender.com** (replace with your Render URL)

Hosted on Render's free tier as one Node service: Express serves the API at `/api` and the built React app for every other path. The free instance sleeps after 15 minutes idle, so the **first load can take about a minute**. Its disk is temporary, so the server re-seeds the same 5,000 demo contacts whenever it starts with an empty database; edits made in the demo don't persist across restarts.

## Running it

Requires **Node 20+**.

```bash
npm install            # installs client + server (npm workspaces)
npm run seed           # creates server/data/crm.db with 5,000 deterministic contacts
npm run dev:server     # API  → http://localhost:4000/api
npm run dev:client     # UI   → http://localhost:5173  (second terminal)
```

Vite proxies `/api` to the backend, so no CORS setup is needed in development. Re-run `npm run seed` at any time to reset the data.

| Command | What it does |
|---|---|
| `npm test` | Server API tests + client component/unit tests (46 tests) |
| `npm run lint` | ESLint with React Hooks and jsx-a11y rules |
| `npm run typecheck` | TypeScript for server and client |
| `npm run build` | Production build of the client |
| `npm start` | Production mode: one server on port 4000 serving the API and the built client (run `npm run build` first) |

CI (`.github/workflows/ci.yml`) runs lint, type check, tests and build on every push and pull request.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | Strongest framework for me; TypeScript throughout |
| Server state | TanStack Query | Caching, request cancellation, `keepPreviousData`, targeted invalidation |
| Routing | React Router (data router) | URL-driven list state; `useBlocker` for the unsaved-changes guard |
| Forms | React Hook Form + Zod | Schema validation that mirrors the server's rules |
| Dialogs | Radix Dialog | Focus trap, Escape, focus return, inert background |
| Styling | LESS CSS Modules + shared tokens | Scoped styles, one place for colours/spacing; a stack I know well |
| Backend | Express 5, Zod | Small, explicit; Zod gives per-field validation errors |
| Database | SQLite via `better-sqlite3` | File-based, survives restarts, synchronous transactions, real indexes |
| Tests | Vitest, Testing Library, Supertest | One runner for both apps |

## Project structure

```
server/src
  db.ts             schema, indexes, pragmas (created on startup)
  schemas.ts        Zod request validation
  repo/contacts.ts  all SQL: search, keyset pagination, optimistic locking, tags, activity
  routes.ts         thin HTTP layer: validate → repo → JSON
  errors.ts         one error shape for every failure
  seed.ts           deterministic seed data
client/src
  api/              fetch wrapper (ApiError), endpoints, query keys
  hooks/            URL state, cursor history, debouncing, queries, unsaved-changes guard
  components/ui/    Button, Field/Input/Select, Dialog, Banner, Spinner, Empty/Error states, TagChip
  features/contacts/        list page: search, filters, table/cards, pagination, bulk tagging
  features/contact-detail/  detail page: form, conflict dialog, tag editor, activity
  lib/merge.ts      three-way merge used for conflict resolution (pure, unit-tested)
```

Pages only wire things together; data access lives in `api/` and hooks, reusable UI in `components/ui/`, and pure logic (merge, formatting) in `lib/`.

## Data model

```
contacts      id, first_name, last_name, email, phone, company,
              email_norm (UNIQUE), name_sort, last_name_lc, phone_digits, company_lc,
              version, created_at, updated_at
tags          id, name (UNIQUE, case-insensitive)
contact_tags  contact_id, tag_id, created_at        PK (contact_id, tag_id)
activities    id, contact_id, type, payload (JSON), created_at
```

- **Derived columns** (`email_norm`, `name_sort`, `phone_digits`, …) are written with every insert and update, so search and sort hit plain indexed columns instead of calling functions per row.
- **Indexes:** `(name_sort, id)` and `(created_at, id)` for the two sorts; `last_name_lc`, `phone_digits` and `company_lc` for search and filters; `contact_tags(tag_id, contact_id)` for tag filters; `activities(contact_id, created_at)` for history.
- **Tags** are a separate table, so they can be renamed or listed, and filtering uses an indexed `EXISTS`.
- **Activity** stores a JSON payload: field-level `from → to` for `CONTACT_UPDATED`, and the tag name for `TAG_ADDED` / `TAG_REMOVED`.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/contacts?q=&tags=VIP,Lead&company=&sort=name\|createdAt&order=asc\|desc&limit=25&cursor=` | `{ items, nextCursor }` |
| GET | `/api/contacts/:id` | includes tags and `version` |
| PATCH | `/api/contacts/:id` | `{ version, ...changedFields }` |
| POST | `/api/contacts/:id/tags` | `{ name }`; idempotent |
| DELETE | `/api/contacts/:id/tags/:tagId` | |
| POST | `/api/contacts/bulk/tags` | `{ contactIds (≤500), tagName }` → `{ added, alreadyTagged, notFound }` |
| GET | `/api/contacts/:id/activities` | newest first |
| GET | `/api/tags`, `/api/companies` | filter options |

Every error has the same shape: `{ error: { code, message, fields?, current? } }`. Codes are `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `EMAIL_TAKEN` (409) and `VERSION_CONFLICT` (409, with `current` = latest record).

## Important technical decisions

**Keyset (cursor) pagination, not OFFSET.** `OFFSET 100000` makes the database walk and discard 100k rows; a cursor (`last sort value + id`) jumps straight there using the index, so page 4,000 is as fast as page 1. The `id` tie-breaker guarantees no row is skipped or repeated when many contacts share a name; the tests walk every page in all four sort orders to prove it. Trade-off: no "jump to page N" and no total count, both deliberate at millions of rows.

**Search is prefix matching on indexed columns.** `name_sort LIKE 'smi%'` (with `case_sensitive_like` on lowercased columns) can use an index, whereas `'%smi%'` cannot. It matches full name, last name, email and phone digits. The trade-off is that "mith" won't find "Smith". At scale this moves to a search engine (see below).

**The database enforces email uniqueness.** A "check, then save" query can race with a parallel request; the `UNIQUE` index on `email_norm` (lower-cased and trimmed) can't. The constraint error is mapped to `409 EMAIL_TAKEN` with a field error.

**The URL is the source of truth for the list.** Search, tags, company, sort and cursor live in the query string, so views can be shared, bookmarked, refreshed and reached with Back. Any filter change drops the cursor, which returns to page 1. Visited cursors are kept in `sessionStorage` per filter combination, so **Previous** still works after a refresh.

**Requests can't race.** TanStack Query passes an `AbortSignal` into `fetch`, so a newer search cancels the older request. `keepPreviousData` keeps the old rows on screen (dimmed) while the next page loads. Search is debounced (300 ms) and needs at least 2 characters, with a hint below the box.

**Validation runs on both sides.** Zod schemas on the client give instant, per-field feedback; the server validates again with matching rules and returns `fields`, which the form shows next to the right input.

**Tag changes don't bump `version`.** Tags are independent, idempotent operations. Bumping the version would make a colleague's unrelated name edit fail with a false conflict.

**Small things done on purpose:** selection on the list resets when the search changes, without an effect (the selection is stored with the filter signature); `Button` defaults to `type="button"`; the detail page is lazy-loaded as its own bundle; 4xx errors are not retried.

## Concurrent updates

Optimistic locking with a `version` column.

1. Loading a contact returns its `version`.
2. Saving sends that version with **only the changed fields**.
3. The server runs `UPDATE … SET …, version = version + 1 WHERE id = ? AND version = ?` inside a transaction. If no row changed, someone else saved first, so it returns **409 `VERSION_CONFLICT` with the latest record**.

The UI never silently drops either person's work. On a 409 it runs a **three-way merge** (`lib/merge.ts`) between the version the draft started from, the user's draft and the latest record:

| Only they changed it | Only I changed it | Both changed it, same value | Both changed it, different values |
|---|---|---|---|
| applied automatically | kept | fine | **conflict: user chooses "Keep mine" or "Use theirs"** |

The dialog lists all three groups. **Save merged version** stays disabled until every conflict has a choice, then saves against the *latest* version. **Discard my changes** loads the latest record. **Keep editing** closes the dialog without touching the draft; the next save detects the conflict again, so nothing is overwritten silently.

Unsaved edits are also protected from navigation: in-app links and Back are paused by `useBlocker` with a confirm dialog, and refresh/close triggers the browser's `beforeunload` prompt.

## Accessibility and responsive design

- Every input has a label; hints and errors are linked with `aria-describedby`, and invalid fields get `aria-invalid`.
- Result counts, loading and save status are announced through live regions.
- Visible `:focus-visible` outlines; a skip link; dialogs trap and restore focus.
- Tag filters are toggle buttons with `aria-pressed`; row checkboxes are labelled "Select {name}".
- On phones, the same `<table>` markup is restyled into cards (below 768px); controls are at least 40px tall.
- ESLint runs `jsx-a11y` and React Hooks rules in CI.

## Testing

Tests focus on the highest-risk behaviour:

- **Server (23, Supertest against an in-memory SQLite):** every page in all four sort orders with no duplicates or gaps (including duplicate names), search by name/email/phone, combined filters, invalid cursors, 409 on a stale version, case-insensitive duplicate email, validation errors, unknown fields, idempotent tags, bulk results, activity entries.
- **Client (23, Testing Library with a mocked `fetch`):** URL ↔ filters, debounced search with minimum length, empty and error states with retry, Next/Previous cursors, filter change resets to page 1, bulk tagging, client and server validation, saving only changed fields, the full conflict flow (merge, choose, save), discarding after a conflict, the unsaved-changes guard, tag add/remove, not found. `lib/merge.ts` has its own unit tests.

## Known issues and incomplete functionality

- No create or delete for contacts (not in scope), and no authentication, so activity doesn't record *who* made a change.
- Search is prefix-only (see decisions), and phone search needs at least 3 digits.
- No total result count or page count, by design.
- Opening a shared link to a deep page: Previous goes to page 1, because earlier cursors aren't known.
- The tag filter matches contacts with **any** selected tag (OR); there's no "all of" option.
- The company filter lists at most 200 companies.
- Bulk tagging is limited to 500 selected contacts per request, and there's no "select all matching results".
- The browser console shows the 409 response during a conflict; that's the browser logging an expected status, not an app error.

## Scale considerations

What I'd change for production scale (not implemented):

**Millions of contacts per account**
- Postgres instead of SQLite, with `account_id` leading every index, e.g. `(account_id, name_sort, id)`, and possibly partitioning by account.
- Search moves to Postgres full-text/trigram indexes or a search service (OpenSearch/Elasticsearch) fed from a change stream. That enables substring and fuzzy matching.
- Keep cursor pagination and drop exact counts (or show cached, approximate ones).

**Millions of updates per day**
- Write activity through an outbox table or queue instead of in the request transaction; partition the activity table by month and archive old partitions.
- Keep updates small (only changed fields) and indexes few on hot columns.
- Run bulk operations over a few hundred contacts as background jobs with progress reporting.

**Frequent searches and filters**
- Read replicas for list queries; cache tag/company lists and popular result pages briefly (Redis), invalidated by change events.
- On the client, the existing TanStack Query cache, debouncing and request cancellation already avoid redundant calls; prefetch the next page.

**Many simultaneous users**
- Stateless API servers behind a load balancer; optimistic locking already works across instances because the check is in the database.
- Push changes (WebSocket/SSE) so an open contact shows "updated by someone else" before the user saves.
- Rate limiting per user/account; connection pooling (PgBouncer).

## AI usage

> Edit this section so it's in your own words and accurate to how you worked.

- **Tool:** Claude (claude.ai).
- **Used for:** analysing the assignment and guidance PDFs into a plan, scaffolding commands, drafting backend and frontend code and tests, and reviewing the result. I ran, tested and reviewed each part myself.
- **Suggestions I changed or rejected:**
  - Claude initially proposed **Tailwind**; I switched to **LESS CSS Modules** with shared tokens because it's the styling approach I know best and can maintain confidently.
  - An early version of the conflict dialog's **"Keep editing"** button re-based the draft on the latest server version. That would have let the next save silently overwrite the other user's non-conflicting changes. It was changed so the draft stays based on the original version and the conflict is shown again on the next save.
  - **msw** was planned for mocking the API in tests. It was dropped in favour of a small `fetch` mock (`src/test/utils.tsx`) once it caused a TypeScript version clash that broke ESLint.
