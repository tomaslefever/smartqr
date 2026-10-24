// React Bits components (components/reactbits/) set up for the panel's look, so pages use them the same way
import React from 'react';
import { useColorMode } from '../context/ColorModeContext.tsx';
import AnimatedContent, { AnimatedContentProps } from './reactbits/AnimatedContent.tsx';
import SpotlightCard, { SpotlightCardProps } from './reactbits/SpotlightCard.tsx';

// Same values as the tokens in index.css, as hex: canvas and WebGL effects cannot read CSS variables
const PANEL_COLORS = {
    light: { primary: '#3D6B4C', fg: '#18181B', fgMuted: '#52525B', surface: '#FFFFFF', line: '#E4E4E7', success: '#16803D' },
    dark: { primary: '#84B896', fg: '#F4F4F5', fgMuted: '#A1A1AA', surface: '#131315', line: '#27272C', success: '#4ADE80' },
};

export const usePanelColors = () => {
    const { resolved } = useColorMode();
    return { mode: resolved, ...PANEL_COLORS[resolved] };
};

// Content that slides up and fades in, on mount by default. stagger animates each child in turn.
export const Reveal: React.FC<AnimatedContentProps> = ({ children, ...props }) => (
    <AnimatedContent trigger="mount" distance={16} duration={0.5} ease="power2.out" {...props}>
        {children}
    </AnimatedContent>
);

// Panel card whose border and background light up around the pointer. Size and padding come from
// className; ! is needed because SpotlightCard sets its own radius and padding.
export const SpotlightPanel: React.FC<SpotlightCardProps> = ({ className = '', style, children, ...props }) => {
    const { mode } = usePanelColors();
    return (
        <SpotlightCard
            theme={mode}
            spotlightColor="rgb(var(--primary))"
            intensity={mode === 'dark' ? 0.12 : 0.5}
            spotlightSize={220}
            proximity={40}
            className={`!rounded-xl ${className}`}
            style={{
                '--spotlight-card-surface': 'rgb(var(--surface))',
                '--spotlight-card-border': 'rgb(var(--line))',
                '--spotlight-card-shadow': '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.04)',
                ...style,
            } as React.CSSProperties}
            {...props}
        >
            {children}
        </SpotlightCard>
    );
};
