import { useCallback, useState } from 'react';

const STORAGE_KEY = 'contacts.cursorHistory';
const MAX_SAVED_QUERIES = 20;

/** For each filter signature: the cursors of the pages visited, in order. Page 1 is `null`. */
type History = Record<string, (string | null)[]>;

function load(): History {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {}; // storage blocked or corrupted: start fresh
  }
}

function save(h: History) {
  try {
    const keys = Object.keys(h);
    // keep only the most recent queries so storage can't grow forever
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SAVED_QUERIES))) delete h[k];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(h));
  } catch {
    // storage full or blocked: history just won't survive a reload
  }
}

/**
 * Cursor pagination only knows "next", so we remember the cursors we've walked
 * through. Stored in sessionStorage so Previous still works after a page refresh.
 */
export function useCursorHistory(signature: string, currentCursor: string | null) {
  const [history, setHistory] = useState<History>(load);

  const stack = history[signature] ?? [null];
  const index = stack.indexOf(currentCursor);
  // index -1: we arrived via a shared link to a deep page, so the earlier cursors are unknown.

  const rememberNext = useCallback(
    (nextCursor: string) => {
      setHistory((prev) => {
        const s = prev[signature] ?? [null];
        const i = s.indexOf(currentCursor);
        const base = i >= 0 ? s.slice(0, i + 1) : [null, currentCursor];
        const next = { ...prev, [signature]: [...base, nextCursor] };
        save(next);
        return next;
      });
    },
    [signature, currentCursor],
  );

  return {
    /** 1-based page number, or null when unknown (deep link). */
    pageNumber: index >= 0 ? index + 1 : null,
    hasPrevious: currentCursor !== null,
    /** Cursor for the previous page; falls back to page 1 when history is unknown. */
    previousCursor: index > 0 ? stack[index - 1] : null,
    rememberNext,
  };
}
