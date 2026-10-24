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

export default ThemeSwatch;
