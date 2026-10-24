import type React from 'react';
import { ThemeStyle } from '../types.ts';
import { supabaseUrl } from '../services/supabaseClient.ts';

// Same values as the predefined "Clásico" theme
export const DEFAULT_THEME_STYLE: ThemeStyle = {
    background_type: 'color',
    background_color: '#F9F9F0',
    background_image_url: null,
    background_image_size: 200,
    card_color: '#FFFFFF',
    text_color: '#3D3D3D',
    accent_color: '#4A7C59',
};

export const PATTERN_SIZE_MIN = 40;
export const PATTERN_SIZE_MAX = 600;

export const isHexColor = (value: unknown): value is string =>
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

// Only images uploaded to this project's public storage, and nothing that could break out of url("...")
const isStorageImageUrl = (value: unknown): value is string =>
    typeof value === 'string' &&
    supabaseUrl !== '' &&
    value.startsWith(`${supabaseUrl}/storage/v1/object/public/`) &&
    !/["'()\\\s]/.test(value);

export const pickThemeStyle = (theme: ThemeStyle): ThemeStyle => ({
    background_type: theme.background_type,
    background_color: theme.background_color,
    background_image_url: theme.background_image_url,
    background_image_size: theme.background_image_size,
    card_color: theme.card_color,
    text_color: theme.text_color,
    accent_color: theme.accent_color,
});

// Themes are public rows, so any malformed value falls back to the default instead of reaching the CSS
export const normalizeThemeStyle = (raw: unknown): ThemeStyle => {
    const theme = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const d = DEFAULT_THEME_STYLE;
    const imageUrl = isStorageImageUrl(theme.background_image_url) ? theme.background_image_url : null;
    const size = typeof theme.background_image_size === 'number' && Number.isFinite(theme.background_image_size)
        ? Math.min(PATTERN_SIZE_MAX, Math.max(PATTERN_SIZE_MIN, Math.round(theme.background_image_size)))
        : d.background_image_size;

    return {
        background_type: theme.background_type === 'image' && imageUrl ? 'image' : 'color',
        background_color: isHexColor(theme.background_color) ? theme.background_color : d.background_color,
        background_image_url: imageUrl,
        background_image_size: size,
        card_color: isHexColor(theme.card_color) ? theme.card_color : d.card_color,
        text_color: isHexColor(theme.text_color) ? theme.text_color : d.text_color,
        accent_color: isHexColor(theme.accent_color) ? theme.accent_color : d.accent_color,
    };
};

export const sameThemeStyle = (a: ThemeStyle, b: ThemeStyle) =>
    JSON.stringify(pickThemeStyle(a)) === JSON.stringify(pickThemeStyle(b));

const relativeLuminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
        .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Text color for content placed on top of the accent (e.g. the selected category chip)
const readableOn = (hex: string) => {
    const luminance = relativeLuminance(hex);
    const contrastWithWhite = 1.05 / (luminance + 0.05);
    const contrastWithDark = (luminance + 0.05) / (relativeLuminance('#1F1F1F') + 0.05);
    return contrastWithWhite >= contrastWithDark ? '#FFFFFF' : '#1F1F1F';
};

// CSS variables consumed by the store markup (classes like text-[color:var(--store-accent)]).
// Expects a normalized style.
export const themeStyleVars = (theme: ThemeStyle): React.CSSProperties => ({
    '--store-card': theme.card_color,
    '--store-text': theme.text_color,
    '--store-muted': `color-mix(in srgb, ${theme.text_color} 75%, transparent)`,
    '--store-subtle': `color-mix(in srgb, ${theme.text_color} 8%, transparent)`,
    '--store-border': `color-mix(in srgb, ${theme.text_color} 18%, transparent)`,
    '--store-accent': theme.accent_color,
    '--store-accent-soft': `color-mix(in srgb, ${theme.accent_color} 25%, transparent)`,
    '--store-on-accent': readableOn(theme.accent_color),
    // Native controls and scrollbars follow the store's theme, not the panel's light/dark mode
    colorScheme: relativeLuminance(theme.background_color) < 0.2 ? 'dark' : 'light',
    backgroundColor: theme.background_color,
    ...(theme.background_type === 'image' && theme.background_image_url
        ? {
            backgroundImage: `url("${theme.background_image_url}")`,
            backgroundRepeat: 'repeat',
            backgroundSize: `${theme.background_image_size}px auto`,
        }
        : {}),
} as React.CSSProperties);
