import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type BtnVariant = 'default' | 'primary' | 'ghost' | 'danger';

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8.5 px-3 text-[13px]',
        variant === 'primary' && 'bg-accent text-accent-ink hover:bg-accent-hover shadow-sm',
        variant === 'default' && 'bg-surface text-ink border border-line hover:bg-surface-2 hover:border-line-strong',
        variant === 'ghost' && 'text-muted hover:text-ink hover:bg-surface-3',
        variant === 'danger' && 'text-danger hover:bg-surface-3',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors',
        'hover:bg-surface-3 hover:text-ink disabled:opacity-35 disabled:pointer-events-none',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        active && 'bg-accent-soft text-accent',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  help?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 py-1.5 select-none">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-5 text-ink">{label}</span>
        {help && <span className="block text-xs leading-4 text-muted">{help}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          className={cx(
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {hint && <span className="text-xs text-faint tabular-nums">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function SelectInput({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8.5 w-full appearance-none rounded-lg border border-line bg-surface pr-8 pl-2.5 text-[13px] text-ink hover:border-line-strong focus:border-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex rounded-lg bg-surface-3 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex h-7 flex-1 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
            'focus-visible:outline-2 focus-visible:outline-accent',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => String(v),
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <Field label={label} hint={format(value)}>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  onBlur?: () => void;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={cx(
        'h-8.5 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-faint',
        'hover:border-line-strong focus:border-accent focus:outline-none',
        className,
      )}
    />
  );
}

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('border-b border-line px-4 py-3 last:border-b-0', className)}>
      {(title || actions) && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {title && <h3 className="text-[11px] font-semibold tracking-wider text-faint uppercase">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'hl' }: { children: ReactNode; tone?: 'hl' | 'muted' | 'accent' }) {
  return (
    <span
      className={cx(
        'inline-flex h-4.5 items-center rounded px-1.5 text-[10px] font-semibold tracking-wide',
        tone === 'hl' && 'bg-hl-soft text-hl',
        tone === 'muted' && 'bg-surface-3 text-muted',
        tone === 'accent' && 'bg-accent-soft text-accent',
      )}
    >
      {children}
    </span>
  );
}
