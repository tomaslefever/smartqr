import React from 'react';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    id?: string;
    // Accessible name when there is no <label htmlFor={id}>
    label?: string;
    disabled?: boolean;
}

const Switch: React.FC<SwitchProps> = ({ checked, onChange, id, label, disabled }) => (
    <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-control'}`}
    >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
);

export default Switch;
