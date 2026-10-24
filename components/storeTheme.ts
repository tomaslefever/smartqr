import type React from 'react';
import { StoreTheme } from '../types.ts';
import { supabaseUrl } from '../services/supabaseClient.ts';

export const DEFAULT_STORE_THEME: StoreTheme = {
    backgroundType: 'color',
    backgroundColor: '#F9F9F0',
    backgroundImageUrl: '',
    backgroundImageSize: 200,
    cardColor: '#FFFFFF',
    textColor: '#3D3D3D',
    accentColor: '#4A7C59',
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

// The theme is read from a public profile row, so any malformed value falls back to the default
export const normalizeStoreTheme = (raw: unknown): StoreTheme => {
    const theme = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const d = DEFAULT_STORE_THEME;
    const imageUrl = isStorageImageUrl(theme.backgroundImageUrl) ? theme.backgroundImageUrl : '';
    const size = typeof theme.backgroundImageSize === 'number' && Number.isFinite(theme.backgroundImageSize)
        ? Math.min(PATTERN_SIZE_MAX, Math.max(PATTERN_SIZE_MIN, Math.round(theme.backgroundImageSize)))
        : d.backgroundImageSize;

    return {
        backgroundType: theme.backgroundType === 'image' && imageUrl ? 'image' : 'color',
        backgroundColor: isHexColor(theme.backgroundColor) ? theme.backgroundColor : d.backgroundColor,
        backgroundImageUrl: imageUrl,
        backgroundImageSize: size,
        cardColor: isHexColor(theme.cardColor) ? theme.cardColor : d.cardColor,
        textColor: isHexColor(theme.textColor) ? theme.textColor : d.textColor,
        accentColor: isHexColor(theme.accentColor) ? theme.accentColor : d.accentColor,
    };
};

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

// CSS variables consumed by the store markup (classes like text-[color:var(--store-accent)])
export const storeThemeStyle = (theme: StoreTheme): React.CSSProperties => ({
    '--store-card': theme.cardColor,
    '--store-text': theme.textColor,
    '--store-muted': `color-mix(in srgb, ${theme.textColor} 70%, transparent)`,
    '--store-subtle': `color-mix(in srgb, ${theme.textColor} 8%, transparent)`,
    '--store-border': `color-mix(in srgb, ${theme.textColor} 18%, transparent)`,
    '--store-accent': theme.accentColor,
    '--store-accent-soft': `color-mix(in srgb, ${theme.accentColor} 25%, transparent)`,
    '--store-on-accent': readableOn(theme.accentColor),
    backgroundColor: theme.backgroundColor,
    ...(theme.backgroundType === 'image'
        ? {
            backgroundImage: `url("${theme.backgroundImageUrl}")`,
            backgroundRepeat: 'repeat',
            backgroundSize: `${theme.backgroundImageSize}px auto`,
        }
        : {}),
} as React.CSSProperties);
