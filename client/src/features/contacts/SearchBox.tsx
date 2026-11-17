import { useState } from 'react';
import { Field, Input } from '../../components/ui/Field';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';

export const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 300;

type Props = {
  /** The committed search from the URL. */
  value: string;
  onCommit: (q: string) => void;
};

/**
 * Keeps what the user is typing locally and only sends it to the URL
 * (and therefore the API) after they pause, and only once it's long enough.
 */
export function SearchBox({ value, onCommit }: Props) {
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const { debounced, cancel } = useDebouncedCallback(onCommit, DEBOUNCE_MS);

  // The URL changed from outside (Back button, "Clear filters"): show it in the box.
  // Adjusting state during render avoids an extra effect + re-render.
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== text.trim()) setText(value);
  }

  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_SEARCH_LENGTH;

  const handleChange = (next: string) => {
    setText(next);
    const t = next.trim();
    if (t.length === 0 || t.length >= MIN_SEARCH_LENGTH) debounced(t);
    else cancel(); // too short: keep current results, don't send a request
  };

  return (
    <Field
      id="contact-search"
      label="Search contacts"
      hint={
        tooShort
          ? `Type at least ${MIN_SEARCH_LENGTH} characters to search`
          : 'Search by name, email or phone'
      }
    >
      {(p) => (
        <Input
          {...p}
          type="search"
          placeholder="Search name, email or phone…"
          autoComplete="off"
          value={text}
          maxLength={100}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !tooShort) {
              cancel();
              onCommit(trimmed); // search now, don't wait for the debounce
            }
          }}
        />
      )}
    </Field>
  );
}
