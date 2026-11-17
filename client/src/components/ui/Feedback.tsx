import type { ReactNode } from 'react';
import s from './Feedback.module.less';
import { Button } from './Button';

export function Spinner({ size = 'md', label = 'Loading' }: { size?: 'sm' | 'md'; label?: string }) {
  return (
    <span className={s.spinnerWrap} role={label ? 'status' : undefined}>
      <span className={[s.spinner, s[size]].join(' ')} aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={s.state}>
      <p className={s.title}>{title}</p>
      {children}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className={[s.state, s.errorState].join(' ')} role="alert">
      <p className={s.title}>{title}</p>
      <p className={s.message}>{message}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Inline banner for success / error messages after an action. */
export function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: 'success' | 'error' | 'warning';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={[s.banner, s[tone]].join(' ')} role={tone === 'error' ? 'alert' : 'status'}>
      <div>{children}</div>
      {onDismiss && (
        <button type="button" className={s.dismiss} onClick={onDismiss} aria-label="Dismiss message">
          ×
        </button>
      )}
    </div>
  );
}
