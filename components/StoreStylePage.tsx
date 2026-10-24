import React, { useState, useEffect, useMemo } from 'react';
import { PageHeader } from './AppShell.tsx';
import { Product, Theme, ThemeStyle } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { ProductCard } from './Store.tsx';
import { PlusIcon, UploadIcon } from './Icons.tsx';
import ThemeSwatch from './ThemeSwatch.tsx';
import { buttonClass, cardClass, errorBoxClass, hintClass, inputClass, labelClass, successBoxClass } from './ui.ts';
import {
    DEFAULT_THEME_STYLE,
    PATTERN_SIZE_MAX,
    PATTERN_SIZE_MIN,
    isHexColor,
    normalizeThemeStyle,
    pickThemeStyle,
    sameThemeStyle,
    themeStyleVars,
} from './storeTheme.ts';

const SAMPLE_PRODUCTS: Product[] = [
    { id: -1, name: 'Producto de ejemplo', description: 'Así se ve la descripción de un producto.', price: 2900, category: 'Categoría', image_url: supabaseService.getPlaceholderImageUrl(), stock: 0, created_at: '', unit: 'unit', track_stock: false, out_of_stock: false },
    { id: -2, name: 'Otro producto', description: 'Este aparece como no disponible.', price: 3500, category: 'Categoría', image_url: supabaseService.getPlaceholderImageUrl(), stock: 0, created_at: '', unit: 'unit', track_stock: false, out_of_stock: true },
];

// Predefined themes shown before expanding the gallery
const COLLAPSED_PREDEFINED_COUNT = 10;

// What the editor is working on: an existing theme or one that has not been created yet
type Selection = { kind: 'theme'; id: string } | { kind: 'new' };

const ColorField: React.FC<{ id: string; label: string; hint?: string; value: string; onChange: (value: string) => void }> = ({ id, label, hint, value, onChange }) => {
    // The text field can hold an incomplete value while typing; only valid colors reach the theme
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);

    return (
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>
            {hint && <p className={hintClass}>{hint}</p>}
            <div className="mt-1 flex items-center gap-2">
                <input
                    type="color"
                    aria-label={label}
                    value={value}
                    onChange={(e) => onChange(e.target.value.toUpperCase())}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1"
                />
                <input
                    type="text"
                    id={id}
                    value={text}
                    maxLength={7}
                    onChange={(e) => {
                        const next = e.target.value.trim();
                        setText(next);
                        if (isHexColor(next)) onChange(next.toUpperCase());
                    }}
                    onBlur={() => setText(value)}
                    className={`${inputClass} w-28 font-mono uppercase`}
                />
            </div>
        </div>
    );
};

const ThemeOption: React.FC<{ name: string; style: ThemeStyle; selected: boolean; active: boolean; onClick: () => void }> = ({ name, style, selected, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`text-left rounded-xl border bg-surface p-2 shadow-soft ring-2 transition focus:outline-none focus-visible:ring-primary/40 ${selected ? 'border-transparent ring-primary' : 'border-line ring-transparent hover:border-control'}`}
    >
        <ThemeSwatch style={style} />
        <div className="mt-2 flex items-center justify-between gap-2 px-1">
            <span className="text-sm font-medium text-fg truncate">{name}</span>
            {active && <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap">En uso</span>}
        </div>
    </button>
);

const StorePreview: React.FC<{ style: ThemeStyle; businessName: string; products: Product[] }> = ({ style, businessName, products }) => {
    const categories = Array.from(new Set(products.map(p => p.category))).slice(0, 3);

    return (
        <div className="rounded-xl overflow-hidden border border-line shadow-soft text-[color:var(--store-text)]" style={themeStyleVars(style)}>
            <div className="bg-[color:var(--store-card)] shadow-md py-5 px-4 text-center">
                <p className="text-2xl font-bold text-[color:var(--store-accent)]">{businessName || 'Bienvenido a la Tienda'}</p>
                <p className="mt-1 text-[color:var(--store-muted)]">Productos de calidad, a tu alcance.</p>
            </div>
            <div className="p-4 sm:p-6 space-y-6">
                <div className="bg-[color:var(--store-card)] rounded-lg shadow-sm p-3 flex flex-wrap gap-2">
                    {['Todos', ...categories].map((category, index) => (
                        <span
                            key={category}
                            className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap ${index === 0
                                ? 'bg-[color:var(--store-accent)] text-[color:var(--store-on-accent)] shadow'
                                : 'bg-[color:var(--store-subtle)] text-[color:var(--store-text)]'}`}
                        >
                            {category}
                        </span>
                    ))}
                </div>
                <h2 className="text-2xl font-bold border-b-2 border-[color:var(--store-accent-soft)] pb-2">{products[0]?.category}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {products.slice(0, 2).map(product => (
                        <ProductCard key={product.id} product={product} onClick={() => {}} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const StoreStylePage: React.FC = () => {
    const { user } = useAuth();
    const [themes, setThemes] = useState<Theme[]>([]);
    const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
    const [selection, setSelection] = useState<Selection>({ kind: 'new' });
    const [name, setName] = useState('');
    const [draft, setDraft] = useState<ThemeStyle>(DEFAULT_THEME_STYLE);
    // Name and style when the current theme was opened, to know whether there are unsaved changes
    const [baseline, setBaseline] = useState<{ name: string; style: ThemeStyle }>({ name: '', style: DEFAULT_THEME_STYLE });
    const [businessName, setBusinessName] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAllPredefined, setShowAllPredefined] = useState(false);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const selectedTheme = selection.kind === 'theme' ? themes.find(t => t.id === selection.id) ?? null : null;
    const isPredefined = selectedTheme !== null && selectedTheme.owner_id === null;
    const isDirty = name !== baseline.name || !sameThemeStyle(draft, baseline.style);

    const open = (nextSelection: Selection, nextName: string, style: ThemeStyle) => {
        setSelection(nextSelection);
        setName(nextName);
        setDraft(style);
        setBaseline({ name: nextName, style });
        setMessage(null);
    };

    const select = (theme: Theme) => open({ kind: 'theme', id: theme.id }, theme.name, pickThemeStyle(theme));

    useEffect(() => {
        const load = async () => {
            const [profile, themesData, productsData] = await Promise.all([
                supabaseService.getProfile(),
                supabaseService.getThemes(),
                supabaseService.getProducts(),
            ]);
            const activeId = profile?.theme_id ?? null;
            setThemes(themesData);
            setActiveThemeId(activeId);
            setBusinessName(profile?.business_name || '');
            setProducts(productsData);

            // Start on the theme in use, or the first predefined one ("Clásico")
            const initial = themesData.find(t => t.id === activeId) ?? themesData[0];
            if (initial) select(initial);
            setLoading(false);
        };
        load();
    }, []);

    // What the store would actually render (e.g. "image" without an uploaded image falls back to the color)
    const previewStyle = useMemo(() => normalizeThemeStyle(draft), [draft]);
    const previewProducts = products.length > 0 ? products : SAMPLE_PRODUCTS;
    const predefinedThemes = themes.filter(t => t.owner_id === null);
    const ownThemes = themes.filter(t => t.owner_id !== null);
    // The collapsed gallery always keeps the theme in use and the one being edited visible
    const visiblePredefined = showAllPredefined
        ? predefinedThemes
        : predefinedThemes.filter((t, index) =>
            index < COLLAPSED_PREDEFINED_COUNT || t.id === activeThemeId || (selection.kind === 'theme' && selection.id === t.id));

    const confirmDiscard = () =>
        !isDirty || window.confirm('Tienes cambios sin guardar en este tema. ¿Descartarlos?');

    const handleSelect = (theme: Theme) => {
        if (selection.kind === 'theme' && selection.id === theme.id) return;
        if (confirmDiscard()) select(theme);
    };

    const handleNew = () => {
        // Start from what is on screen, so a tweaked theme can be saved as a new one
        open({ kind: 'new' }, 'Mi tema', pickThemeStyle(draft));
    };

    const updateDraft = (changes: Partial<ThemeStyle>) => {
        setDraft(prev => ({ ...prev, ...changes }));
        setMessage(null);
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploading(true);
        setMessage(null);
        try {
            const url = await supabaseService.uploadImage(file);
            updateDraft({ background_type: 'image', background_image_url: url });
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo subir la imagen.' });
        } finally {
            setUploading(false);
        }
    };

    const validate = () => {
        if (draft.background_type === 'image' && !draft.background_image_url) {
            setMessage({ type: 'error', text: 'Sube una imagen para el fondo o elige un color.' });
            return false;
        }
        if (!name.trim()) {
            setMessage({ type: 'error', text: 'Ponle un nombre al tema.' });
            return false;
        }
        return true;
    };

    const run = async (action: () => Promise<string | null>) => {
        setBusy(true);
        setMessage(null);
        const error = await action();
        setBusy(false);
        if (error) setMessage({ type: 'error', text: error });
    };

    // Creates a theme of the user's own: a new one, or a copy of a predefined theme with the edits
    const handleCreate = () => {
        if (!validate()) return;
        const themeName = isPredefined ? `${selectedTheme.name} (copia)` : name.trim();
        run(async () => {
            const created = await supabaseService.createTheme(themeName, previewStyle);
            if (!created) return 'No se pudo crear el tema. Inténtalo de nuevo.';
            setThemes(prev => [...prev, created]);
            select(created);
            setMessage({ type: 'success', text: `Tema "${created.name}" creado. Usa "Usar en mi tienda" para aplicarlo.` });
            return null;
        });
    };

    const handleUpdate = () => {
        if (!selectedTheme || !validate()) return;
        run(async () => {
            const updated = await supabaseService.updateTheme(selectedTheme.id, name.trim(), previewStyle);
            if (!updated) return 'No se pudieron guardar los cambios. Inténtalo de nuevo.';
            setThemes(prev => prev.map(t => (t.id === updated.id ? updated : t)));
            select(updated);
            setMessage({
                type: 'success',
                text: updated.id === activeThemeId ? 'Cambios guardados. Ya se ven en tu tienda.' : 'Cambios guardados.',
            });
            return null;
        });
    };

    const handleActivate = () => {
        if (!selectedTheme) return;
        run(async () => {
            const ok = await supabaseService.setActiveTheme(selectedTheme.id);
            if (!ok) return 'No se pudo aplicar el tema. Inténtalo de nuevo.';
            setActiveThemeId(selectedTheme.id);
            setMessage({ type: 'success', text: `Tu tienda ahora usa "${selectedTheme.name}".` });
            return null;
        });
    };

    const handleDelete = () => {
        if (!selectedTheme || isPredefined) return;
        const inUse = selectedTheme.id === activeThemeId;
        const warning = inUse ? ' Tu tienda lo está usando y volverá al estilo por defecto.' : '';
        if (!window.confirm(`¿Eliminar el tema "${selectedTheme.name}"?${warning}`)) return;
        run(async () => {
            const ok = await supabaseService.deleteTheme(selectedTheme.id);
            if (!ok) return 'No se pudo eliminar el tema. Inténtalo de nuevo.';
            const remaining = themes.filter(t => t.id !== selectedTheme.id);
            setThemes(remaining);
            if (inUse) setActiveThemeId(null);
            const next = remaining.find(t => t.id === activeThemeId) ?? remaining[0];
            if (next) select(next); else open({ kind: 'new' }, 'Mi tema', DEFAULT_THEME_STYLE);
            setMessage({ type: 'success', text: 'Tema eliminado.' });
            return null;
        });
    };

    const handleDiscard = () => {
        if (selectedTheme) select(selectedTheme);
        else if (themes[0]) select(themes[0]);
    };

    const tabClass = (active: boolean) =>
        `flex-1 h-8 text-sm font-medium rounded-md transition-colors ${active ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg'}`;
    const primaryButton = buttonClass('primary');
    const secondaryButton = buttonClass('secondary');
    const dangerButton = buttonClass('danger');
    const disabled = busy || uploading;

    const editorTitle = selection.kind === 'new'
        ? 'Nuevo tema'
        : isPredefined ? `${selectedTheme?.name} (predefinido)` : 'Editar tema';

    return (
        <>
            <PageHeader
                title="Estilo de la carta"
                description="Elige un tema para tu carta pública o crea el tuyo."
                actions={<a href={`#/store/${user?.id}`} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary')}>Ver tienda</a>}
            />

            <div className="space-y-10">
                {loading ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                        {Array.from({ length: 10 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />)}
                    </div>
                ) : (
                    <>
                        <section className="space-y-4">
                            <div>
                                <div className="flex items-baseline justify-between gap-4">
                                    <h2 className="text-sm font-semibold text-fg">Temas predefinidos</h2>
                                    {predefinedThemes.length > COLLAPSED_PREDEFINED_COUNT && (
                                        <button type="button" onClick={() => setShowAllPredefined(!showAllPredefined)} className="text-sm font-medium text-primary hover:underline">
                                            {showAllPredefined ? 'Ver menos' : `Ver los ${predefinedThemes.length} temas`}
                                        </button>
                                    )}
                                </div>
                                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                                    {visiblePredefined.map(theme => (
                                        <ThemeOption key={theme.id} name={theme.name} style={theme} selected={selection.kind === 'theme' && selection.id === theme.id} active={theme.id === activeThemeId} onClick={() => handleSelect(theme)} />
                                    ))}
                                </div>
                                {predefinedThemes.length === 0 && (
                                    <p className="text-sm text-fg-subtle">No hay temas predefinidos. ¿Se ejecutó la migración supabase/themes.sql?</p>
                                )}
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold text-fg">Mis temas</h2>
                                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                                    {ownThemes.map(theme => (
                                        <ThemeOption key={theme.id} name={theme.name} style={theme} selected={selection.kind === 'theme' && selection.id === theme.id} active={theme.id === activeThemeId} onClick={() => handleSelect(theme)} />
                                    ))}
                                    <button
                                        type="button"
                                        onClick={handleNew}
                                        className={`rounded-lg border-2 border-dashed p-2 min-h-[8rem] flex flex-col items-center justify-center gap-1 text-sm font-medium transition-colors ${selection.kind === 'new' ? 'border-primary text-primary' : 'border-control text-fg-subtle hover:border-primary hover:text-primary'}`}
                                    >
                                        <PlusIcon />
                                        Nuevo tema
                                    </button>
                                </div>
                            </div>
                        </section>

                        <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-8 items-start">
                            <div className={`${cardClass} p-6 space-y-6`}>
                                <h2 className="text-base font-semibold text-fg">{editorTitle}</h2>
                                {isPredefined ? (
                                    <p className="text-xs text-fg-subtle -mt-4">Puedes probar cambios: se guardan como un tema tuyo, sin modificar el predefinido.</p>
                                ) : (
                                    <div className="-mt-2">
                                        <label htmlFor="theme-name" className="block text-sm font-medium text-fg">Nombre</label>
                                        <input id="theme-name" type="text" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setMessage(null); }} className={`${inputClass} mt-1.5`} />
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <p className="text-sm font-medium text-fg">Fondo de la página</p>
                                    <div className="flex gap-1 rounded-lg bg-muted p-1">
                                        <button type="button" className={tabClass(draft.background_type === 'color')} onClick={() => updateDraft({ background_type: 'color' })}>Color</button>
                                        <button type="button" className={tabClass(draft.background_type === 'image')} onClick={() => updateDraft({ background_type: 'image' })}>Imagen (patrón)</button>
                                    </div>

                                    {draft.background_type === 'image' && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3">
                                                {previewStyle.background_image_url ? (
                                                    <div className="h-16 w-16 rounded-md border border-control" style={{ backgroundImage: `url("${previewStyle.background_image_url}")`, backgroundRepeat: 'repeat', backgroundSize: '32px auto' }} />
                                                ) : (
                                                    <div className="h-16 w-16 flex items-center justify-center rounded-md border-2 border-dashed border-control"><UploadIcon /></div>
                                                )}
                                                <label className={`cursor-pointer text-sm font-medium text-primary hover:text-primary/80 ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
                                                    {uploading ? 'Subiendo...' : draft.background_image_url ? 'Cambiar imagen' : 'Subir imagen'}
                                                    <input type="file" className="sr-only" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleImageChange} disabled={uploading} />
                                                </label>
                                            </div>
                                            <p className="text-xs text-fg-subtle">La imagen se repite en mosaico. Funcionan mejor las imágenes pensadas como patrón. PNG, JPG, GIF o WEBP hasta 10MB.</p>
                                            <div>
                                                <label htmlFor="pattern-size" className="flex justify-between text-sm font-medium text-fg">
                                                    <span>Tamaño del patrón</span>
                                                    <span className="text-fg-subtle font-normal">{draft.background_image_size}px</span>
                                                </label>
                                                <input
                                                    id="pattern-size"
                                                    type="range"
                                                    min={PATTERN_SIZE_MIN}
                                                    max={PATTERN_SIZE_MAX}
                                                    step={10}
                                                    value={draft.background_image_size}
                                                    onChange={(e) => updateDraft({ background_image_size: Number(e.target.value) })}
                                                    className="mt-1 w-full accent-primary"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <ColorField
                                        id="background-color"
                                        label="Color de fondo"
                                        hint={draft.background_type === 'image' ? 'Se ve detrás de las partes transparentes de la imagen.' : undefined}
                                        value={draft.background_color}
                                        onChange={(background_color) => updateDraft({ background_color })}
                                    />
                                </div>

                                <hr />

                                <ColorField id="card-color" label="Color de las tarjetas" hint="También el encabezado, el buscador y el pie de página." value={draft.card_color} onChange={(card_color) => updateDraft({ card_color })} />
                                <ColorField id="text-color" label="Color del texto" value={draft.text_color} onChange={(text_color) => updateDraft({ text_color })} />
                                <ColorField id="accent-color" label="Color de acento" hint="Nombre del negocio, categorías, precios y categoría seleccionada." value={draft.accent_color} onChange={(accent_color) => updateDraft({ accent_color })} />

                                {message && (
                                    <p className={message.type === 'success' ? successBoxClass : errorBoxClass}>{message.text}</p>
                                )}

                                <div className="flex flex-wrap justify-end gap-3">
                                    {selection.kind === 'new' ? (
                                        <>
                                            {themes.length > 0 && <button type="button" onClick={handleDiscard} disabled={disabled} className={secondaryButton}>Cancelar</button>}
                                            <button type="button" onClick={handleCreate} disabled={disabled} className={primaryButton}>{busy ? 'Creando...' : 'Crear tema'}</button>
                                        </>
                                    ) : isDirty ? (
                                        <>
                                            <button type="button" onClick={handleDiscard} disabled={disabled} className={secondaryButton}>Descartar cambios</button>
                                            {isPredefined ? (
                                                <button type="button" onClick={handleCreate} disabled={disabled} className={primaryButton}>{busy ? 'Guardando...' : 'Guardar como mi tema'}</button>
                                            ) : (
                                                <button type="button" onClick={handleUpdate} disabled={disabled} className={primaryButton}>{busy ? 'Guardando...' : 'Guardar cambios'}</button>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {!isPredefined && <button type="button" onClick={handleDelete} disabled={disabled} className={dangerButton}>Eliminar</button>}
                                            {selectedTheme?.id === activeThemeId ? (
                                                <span className="inline-flex h-10 items-center px-2 text-sm font-medium text-success">✓ En uso en tu tienda</span>
                                            ) : (
                                                <button type="button" onClick={handleActivate} disabled={disabled} className={primaryButton}>{busy ? 'Aplicando...' : 'Usar en mi tienda'}</button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="lg:sticky lg:top-8">
                                <p className="text-sm font-medium text-fg mb-2">Vista previa en tiempo real</p>
                                <StorePreview style={previewStyle} businessName={businessName} products={previewProducts} />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
};

export default StoreStylePage;
