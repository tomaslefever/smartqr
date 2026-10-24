import React from 'react';
import { ThemeStyle } from '../types.ts';
import { normalizeThemeStyle, themeStyleVars } from './storeTheme.ts';

// Miniature of a theme: page background with a card showing the text and accent colors
const ThemeSwatch: React.FC<{ style: ThemeStyle; className?: string }> = ({ style, className = 'h-20 p-3' }) => (
    <div className={`rounded-md border border-line flex items-end ${className}`} style={themeStyleVars(normalizeThemeStyle(style))}>
        <div className="w-full rounded bg-[color:var(--store-card)] p-2 shadow-sm">
            <div className="h-1.5 w-1/2 rounded-full bg-[color:var(--store-text)]" />
            <div className="mt-1.5 h-1.5 w-1/4 rounded-full bg-[color:var(--store-accent)]" />
        </div>
    </div>
);

// Small version for lists and buttons: same layers, sized to sit next to a line of text
export const ThemeChip: React.FC<{ style: ThemeStyle }> = ({ style }) => (
    <span className="flex h-7 w-10 flex-shrink-0 items-center justify-center rounded-md border border-line" style={themeStyleVars(normalizeThemeStyle(style))} aria-hidden="true">
        <span className="flex h-4 w-7 flex-col justify-center gap-[3px] rounded-sm bg-[color:var(--store-card)] px-1 shadow-sm">
            <span className="h-[3px] w-full rounded-full bg-[color:var(--store-text)]" />
            <span className="h-[3px] w-1/2 rounded-full bg-[color:var(--store-accent)]" />
        </span>
    </span>
);

export default ThemeSwatch;
