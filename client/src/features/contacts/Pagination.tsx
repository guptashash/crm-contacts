import { Button } from '../../components/ui/Button';
import s from './contacts.module.less';

type Props = {
  pageNumber: number | null;
  hasPrevious: boolean;
  hasNext: boolean;
  disabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function Pagination({ pageNumber, hasPrevious, hasNext, disabled, onPrevious, onNext }: Props) {
  if (!hasPrevious && !hasNext) return null;
  return (
    <nav className={s.pagination} aria-label="Pagination">
      <Button onClick={onPrevious} disabled={!hasPrevious || disabled}>
        ← Previous
      </Button>
      <span className={s.pageLabel}>{pageNumber ? `Page ${pageNumber}` : 'Page'}</span>
      <Button onClick={onNext} disabled={!hasNext || disabled}>
        Next →
      </Button>
    </nav>
  );
}
