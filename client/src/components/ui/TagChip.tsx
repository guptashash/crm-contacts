import s from './TagChip.module.less';

type Props = {
  name: string;
  onRemove?: () => void;
  removing?: boolean;
};

export function TagChip({ name, onRemove, removing }: Props) {
  return (
    <span className={s.chip}>
      {name}
      {onRemove && (
        <button
          type="button"
          className={s.remove}
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove tag ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
