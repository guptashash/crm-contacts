import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Returns a function that runs `fn` only after `delay` ms without new calls.
 * Pending calls are cancelled on unmount, so nothing runs after the component is gone.
 */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay: number) {
  const fnRef = useRef(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Always call the latest `fn` without restarting the timer when it changes.
  useLayoutEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => () => clearTimeout(timer.current), []);

  const debounced = useCallback(
    (...args: A) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );

  const cancel = useCallback(() => clearTimeout(timer.current), []);

  return { debounced, cancel };
}
