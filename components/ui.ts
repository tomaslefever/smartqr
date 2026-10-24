// Shared class names for the panel's controls, so buttons, inputs and cards look the same everywhere

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
    'disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-primary-fg hover:bg-primary/90 shadow-soft',
    secondary: 'bg-surface text-fg border border-line hover:bg-muted shadow-soft',
    ghost: 'text-fg-muted hover:text-fg hover:bg-muted',
    danger: 'bg-surface text-danger border border-line hover:bg-danger/10',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
};

export const buttonClass = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md') =>
    `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;

export const iconButtonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-muted hover:text-fg ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

export const inputClass =
    'block w-full h-10 rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle shadow-soft ' +
    'transition-colors focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

export const textareaClass = inputClass.replace('h-10', 'py-2');

export const labelClass = 'block text-sm font-medium text-fg';

export const hintClass = 'text-xs text-fg-subtle';

export const cardClass = 'rounded-xl border border-line bg-surface shadow-soft';

export const errorBoxClass = 'rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger';

export const successBoxClass = 'rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm text-success';
