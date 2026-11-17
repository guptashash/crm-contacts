import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Protects unsaved edits:
 * - in-app navigation (links, Back button) is paused so the UI can ask first
 * - closing or refreshing the tab shows the browser's own "Leave site?" prompt
 *
 * Returns the blocker: when `state === 'blocked'`, show a dialog and call
 * `proceed()` or `reset()`.
 */
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // required by some browsers to show the prompt
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

  return blocker;
}
