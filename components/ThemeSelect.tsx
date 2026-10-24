import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Theme, ThemeStyle } from '../types.ts';
import { ThemeChip } from './ThemeSwatch.tsx';
import { inputClass } from './ui.ts';

export const NEW_THEME = 'new';

interface ThemeSelectProps {
    id?: string;
    // A theme id, or NEW_THEME while creating one
    value: string;
    ownThemes: Theme[];
    predefinedThemes: Theme[];
    activeThemeId: string | null;
    // Colors on screen right now, shown on the button (they follow unsaved edits)
    currentStyle: ThemeStyle;
    onChange: (value: string) => void;
}

interface Option {
    value: string;
    label: string;
    style: ThemeStyle | null;
    inUse: boolean;
    group: string | null;
}

// A select whose options show each theme's colors, which a native <select> cannot draw.
// Listbox pattern: focus stays on the button and aria-activedescendant points at the highlighted
// option. The list is rendered in <body> so animated or clipped ancestors cannot hide it.
const ThemeSelect: React.FC<ThemeSelectProps> = ({ id, value, ownThemes, predefinedThemes, activeThemeId, currentStyle, onChange }) => {
    const listId = useId();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(value);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
    const typeahead = useRef({ text: '', timer: 0 });
    const lastPointer = useRef({ x: -1, y: -1 });

    const options = useMemo<Option[]>(() => {
        const toOption = (group: string) => (theme: Theme): Option => ({ value: theme.id, label: theme.name, style: theme, inUse: theme.id === activeThemeId, group });
        const creating = value === NEW_THEME;
        return [
            ...(creating ? [{ value: NEW_THEME, label: 'Nuevo tema (sin guardar)', style: currentStyle, inUse: false, group: null }] : []),
            ...ownThemes.map(toOption('Mis temas')),
            ...predefinedThemes.map(toOption(`Predefinidos (${predefinedThemes.length})`)),
            ...(!creating ? [{ value: NEW_THEME, label: '+ Nuevo tema', style: null, inUse: false, group: null }] : []),
        ];
    }, [ownThemes, predefinedThemes, activeThemeId, value, currentStyle]);

    const selected = options.find(o => o.value === value);
    const optionId = (optionValue: string) => `${listId}-${optionValue}`;

    // Place the list under the button, or above it when there is no room below
    const placeList = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        const below = window.innerHeight - rect.bottom - 12;
        const above = rect.top - 12;
        const openUp = below < 240 && above > below;
        const maxHeight = Math.min(360, openUp ? above : below);
        setPosition({ top: openUp ? rect.top - maxHeight - 4 : rect.bottom + 4, left: rect.left, width: rect.width, maxHeight });
    };

    const openList = () => {
        placeList();
        setHighlighted(value);
        setOpen(true);
    };

    const choose = (optionValue: string) => {
        setOpen(false);
        buttonRef.current?.focus();
        if (optionValue !== value) onChange(optionValue);
    };

    useLayoutEffect(() => {
        if (!open) return;
        listRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(optionId(highlighted))}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [open, highlighted]);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!buttonRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
        };
        const reposition = (e: Event) => {
            // Scrolling inside the list itself must not move it
            if (e.target !== listRef.current) placeList();
        };
        document.addEventListener('mousedown', close);
        window.addEventListener('resize', placeList);
        window.addEventListener('scroll', reposition, true);
        return () => {
            document.removeEventListener('mousedown', close);
            window.removeEventListener('resize', placeList);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [open]);

    const move = (delta: number) => {
        const index = options.findIndex(o => o.value === highlighted);
        const next = Math.min(options.length - 1, Math.max(0, (index === -1 ? 0 : index) + delta));
        setHighlighted(options[next].value);
    };

    // Typing letters jumps to the first theme whose name starts with them
    const jumpTo = (key: string) => {
        window.clearTimeout(typeahead.current.timer);
        typeahead.current.text += key.toLowerCase();
        typeahead.current.timer = window.setTimeout(() => { typeahead.current.text = ''; }, 600);
        const match = options.find(o => o.style && o.label.toLowerCase().startsWith(typeahead.current.text));
        if (match) setHighlighted(match.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!open) {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
                e.preventDefault();
                openList();
            }
            return;
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'Home') { e.preventDefault(); setHighlighted(options[0].value); }
        else if (e.key === 'End') { e.preventDefault(); setHighlighted(options[options.length - 1].value); }
        else if (e.key === 'Enter' || (e.key === ' ' && !typeahead.current.text)) { e.preventDefault(); choose(highlighted); }
        else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
        else if (e.key === 'Tab') setOpen(false);
        else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) jumpTo(e.key);
    };

    return (
        <>
            <button
                ref={buttonRef}
                id={id}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={open ? optionId(highlighted) : undefined}
                onClick={() => (open ? setOpen(false) : openList())}
                onKeyDown={handleKeyDown}
                className={`${inputClass} flex items-center gap-2.5 pl-1.5 pr-2 text-left`}
            >
                <ThemeChip style={currentStyle} />
                <span className="min-w-0 flex-1 truncate">{selected?.label ?? 'Elige un tema'}</span>
                {selected?.inUse && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">En uso</span>}
                <svg className={`h-4 w-4 flex-shrink-0 text-fg-subtle transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
            </button>

            {open && createPortal(
                <ul
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    aria-label="Temas"
                    style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
                    className="z-[60] overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-pop"
                >
                    {options.map((option, index) => {
                        const showGroup = option.group && option.group !== options[index - 1]?.group;
                        const isSelected = option.value === value;
                        const isHighlighted = option.value === highlighted;
                        return (
                            <React.Fragment key={`${option.group}-${option.value}`}>
                                {showGroup && (
                                    <li role="presentation" className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{option.group}</li>
                                )}
                                {option.style === null && <li role="presentation" className="my-1 border-t border-line" />}
                                <li
                                    id={optionId(option.value)}
                                    role="option"
                                    aria-selected={isSelected}
                                    onMouseMove={e => {
                                        // Only a real pointer move highlights: when the list scrolls under a
                                        // still pointer (e.g. keyboard navigation) the browser fires hover
                                        // events at the same coordinates, which must not steal the highlight
                                        if (e.clientX === lastPointer.current.x && e.clientY === lastPointer.current.y) return;
                                        lastPointer.current = { x: e.clientX, y: e.clientY };
                                        setHighlighted(option.value);
                                    }}
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => choose(option.value)}
                                    className={`flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm ${isHighlighted ? 'bg-muted text-fg' : 'text-fg-muted'}`}
                                >
                                    {option.style
                                        ? <ThemeChip style={option.style} />
                                        : <span className="flex h-7 w-10 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-control text-base text-fg-subtle" aria-hidden="true">+</span>}
                                    <span className={`min-w-0 flex-1 truncate ${isSelected ? 'font-medium text-fg' : ''}`}>{option.style ? option.label : 'Nuevo tema'}</span>
                                    {option.inUse && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">En uso</span>}
                                    {isSelected && (
                                        <svg className="h-4 w-4 flex-shrink-0 text-primary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </li>
                            </React.Fragment>
                        );
                    })}
                </ul>,
                document.body,
            )}
        </>
    );
};

export default ThemeSelect;
