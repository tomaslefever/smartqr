import React from 'react';

// Shared bits of the WhatsApp and loyalty pages. Kept in a .tsx file so Tailwind sees the class names.

export const warningBoxClass = 'rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300';

export const StatusDot: React.FC<{ ok: boolean }> = ({ ok }) => (
    <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${ok ? 'bg-success' : 'bg-amber-500'}`} aria-hidden="true" />
);

export const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
