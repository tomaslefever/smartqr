import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ColorMode = 'light' | 'dark' | 'system';

interface ColorModeContextType {
    mode: ColorMode;
    // What is actually shown once "system" is resolved
    resolved: 'light' | 'dark';
    setMode: (mode: ColorMode) => void;
}

// Same key as the inline script in index.html that applies the mode before the first paint
const STORAGE_KEY = 'smartqr-color-mode';

const readStoredMode = (): ColorMode => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
        return 'system';
    }
};

const systemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

const ColorModeContext = createContext<ColorModeContextType | undefined>(undefined);

export const ColorModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [mode, setModeState] = useState<ColorMode>(readStoredMode);
    const [systemDark, setSystemDark] = useState(systemPrefersDark);

    useEffect(() => {
        const query = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);

    const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

    useEffect(() => {
        document.documentElement.classList.toggle('dark', resolved === 'dark');
    }, [resolved]);

    const setMode = (next: ColorMode) => {
        setModeState(next);
        try {
            if (next === 'system') localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Storage can be unavailable (private mode); the choice then lasts for this visit only
        }
    };

    return <ColorModeContext.Provider value={{ mode, resolved, setMode }}>{children}</ColorModeContext.Provider>;
};

export const useColorMode = () => {
    const context = useContext(ColorModeContext);
    if (context === undefined) {
        throw new Error('useColorMode must be used within a ColorModeProvider');
    }
    return context;
};
