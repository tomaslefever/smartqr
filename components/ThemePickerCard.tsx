import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Theme } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import ThemeSwatch from './ThemeSwatch.tsx';

// Quick theme selector for the dashboard: one click applies a theme to the store
const ThemePickerCard: React.FC = () => {
    const [themes, setThemes] = useState<Theme[]>([]);
    const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const load = async () => {
            const [themesData, profile] = await Promise.all([
                supabaseService.getThemes(),
                supabaseService.getProfile(),
            ]);
            // The user's own themes first, then the predefined ones
            setThemes([...themesData.filter(t => t.owner_id !== null), ...themesData.filter(t => t.owner_id === null)]);
            setActiveThemeId(profile?.theme_id ?? null);
            setLoading(false);
        };
        load();
    }, []);

    // Once loaded, scroll the list (not the page) so the theme in use is visible
    useEffect(() => {
        const list = listRef.current;
        const active = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (list && active) list.scrollTop = active.offsetTop - list.offsetTop - 4;
    }, [loading]);

    const handleApply = async (theme: Theme) => {
        if (theme.id === activeThemeId || savingId) return;
        const previous = activeThemeId;
        setActiveThemeId(theme.id);
        setSavingId(theme.id);
        setError(null);
        const ok = await supabaseService.setActiveTheme(theme.id);
        setSavingId(null);
        if (!ok) {
            setActiveThemeId(previous);
            setError('No se pudo aplicar el tema. Inténtalo de nuevo.');
        }
    };

    const activeTheme = themes.find(t => t.id === activeThemeId);

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between gap-4 mb-1">
                <h2 className="text-xl font-semibold text-brand-text">Estilo de la carta</h2>
                <Link to="/estilo" className="text-sm font-medium text-brand-primary hover:underline whitespace-nowrap">Personalizar</Link>
            </div>
            <p className="text-sm text-gray-600 mb-4">
                {loading ? 'Cargando temas...' : <>En uso: <span className="font-medium text-brand-text">{activeTheme?.name ?? 'Estilo por defecto'}</span>{savingId && ' · aplicando...'}</>}
            </p>
            {error && <p className="bg-red-100 text-red-700 p-3 rounded-md mb-4 text-sm">{error}</p>}
            {!loading && themes.length === 0 ? (
                <p className="text-sm text-gray-500">No hay temas disponibles.</p>
            ) : (
                <div ref={listRef} className="grid grid-cols-4 gap-3 max-h-80 overflow-y-auto p-1 -m-1">
                    {themes.map(theme => {
                        const active = theme.id === activeThemeId;
                        return (
                            <button
                                key={theme.id}
                                type="button"
                                onClick={() => handleApply(theme)}
                                disabled={savingId !== null}
                                title={active ? `${theme.name} (en uso)` : `Usar ${theme.name}`}
                                aria-pressed={active}
                                className={`text-left rounded-md p-1 border-2 transition-colors disabled:cursor-wait ${active ? 'border-brand-primary' : 'border-transparent hover:border-gray-300'}`}
                            >
                                <ThemeSwatch style={theme} className="h-12 p-1.5" />
                                <span className={`mt-1 block text-xs truncate ${active ? 'font-semibold text-brand-primary' : 'text-gray-600'}`}>
                                    {theme.owner_id !== null && '★ '}{theme.name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ThemePickerCard;
