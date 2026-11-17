import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from 'react';
import s from './Field.module.less';

/** Props a Field hands to its control so the label, hint and error are wired up for screen readers. */
export type ControlProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  hideLabel?: boolean;
  className?: string;
  children: (control: ControlProps) => ReactNode;
};

/**
 * Label + control + hint + error in one place.
 * Usage: <Field id="email" label="Email" error={err}>{(p) => <Input {...p} />}</Field>
 */
export function Field({ id, label, hint, error, required, hideLabel, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={[s.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : s.label}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <p id={errorId} className={s.error}>
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className={s.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

export function Input({ className, ...rest }: InputProps) {
  return <input className={[s.control, className].filter(Boolean).join(' ')} {...rest} />;
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

export function Select({ className, ...rest }: SelectProps) {
  return <select className={[s.control, s.select, className].filter(Boolean).join(' ')} {...rest} />;
}
