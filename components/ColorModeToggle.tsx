import React from 'react';
import { ColorMode, useColorMode } from '../context/ColorModeContext.tsx';
import { MonitorIcon, MoonIcon, SunIcon } from './Icons.tsx';

const OPTIONS: { mode: ColorMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'light', label: 'Modo claro', icon: <SunIcon /> },
    { mode: 'dark', label: 'Modo oscuro', icon: <MoonIcon /> },
    { mode: 'system', label: 'Usar el modo del sistema', icon: <MonitorIcon /> },
];

const ColorModeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { mode, setMode } = useColorMode();

    return (
        <div role="radiogroup" aria-label="Apariencia" className={`inline-flex rounded-lg border border-line bg-muted p-0.5 ${className}`}>
            {OPTIONS.map(option => (
                <button
                    key={option.mode}
                    type="button"
                    role="radio"
                    aria-checked={mode === option.mode}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => setMode(option.mode)}
                    className={`flex h-7 flex-1 items-center justify-center rounded-md px-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${mode === option.mode ? 'bg-surface text-fg shadow-soft' : 'text-fg-subtle hover:text-fg'}`}
                >
                    {option.icon}
                </button>
            ))}
        </div>
    );
};

export default ColorModeToggle;
