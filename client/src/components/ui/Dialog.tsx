import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import s from './Dialog.module.less';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'lg';
};

/**
 * Radix handles the hard accessibility parts: focus is trapped inside,
 * Escape closes, focus returns to the trigger, and the page behind is inert.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'sm' }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={s.overlay} />
        <RadixDialog.Content className={[s.content, s[size]].join(' ')}>
          <RadixDialog.Title className={s.title}>{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className={s.description}>{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          {children && <div className={s.body}>{children}</div>}
          {footer && <div className={s.footer}>{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
