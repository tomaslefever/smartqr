import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Product, StoreTheme } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { ProductCard } from './Store.tsx';
import { UploadIcon } from './Icons.tsx';
import {
    DEFAULT_STORE_THEME,
    PATTERN_SIZE_MAX,
    PATTERN_SIZE_MIN,
    isHexColor,
    normalizeStoreTheme,
    storeThemeStyle,
} from './storeTheme.ts';

const SAMPLE_PRODUCTS: Product[] = [
    { id: -1, name: 'Producto de ejemplo', description: 'Así se ve la descripción de un producto.', price: 2900, category: 'Categoría', image_url: supabaseService.getPlaceholderImageUrl(), stock: 0, created_at: '', unit: 'unit', track_stock: false, out_of_stock: false },
    { id: -2, name: 'Otro producto', description: 'Este aparece como no disponible.', price: 3500, category: 'Categoría', image_url: supabaseService.getPlaceholderImageUrl(), stock: 0, created_at: '', unit: 'unit', track_stock: false, out_of_stock: true },
];

const ColorField: React.FC<{ id: string; label: string; hint?: string; value: string; onChange: (value: string) => void }> = ({ id, label, hint, value, onChange }) => {
    // The text field can hold an incomplete value while typing; only valid colors reach the theme
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);

    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>
            {hint && <p className="text-xs text-gray-500">{hint}</p>}
            <div className="mt-1 flex items-center gap-2">
                <input
                    type="color"
                    aria-label={label}
                    value={value}
                    onChange={(e) => onChange(e.target.value.toUpperCase())}
                    className="h-10 w-12 cursor-pointer rounded border border-gray-300 bg-white p-1"
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
                    className="block w-28 bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 font-mono text-sm text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
                />
            </div>
        </div>
    );
};

const StorePreview: React.FC<{ theme: StoreTheme; businessName: string; products: Product[] }> = ({ theme, businessName, products }) => {
    const categories = Array.from(new Set(products.map(p => p.category))).slice(0, 3);
    const accent = 'text-[color:var(--store-accent)]';

    return (
        <div className="rounded-lg overflow-hidden border border-gray-200 text-[color:var(--store-text)]" style={storeThemeStyle(theme)}>
            <div className="bg-[color:var(--store-card)] shadow-md py-5 px-4 text-center">
                <p className={`text-2xl font-bold ${accent}`}>{businessName || 'Bienvenido a la Tienda'}</p>
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
    const [theme, setTheme] = useState<StoreTheme>(DEFAULT_STORE_THEME);
    const [businessName, setBusinessName] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const load = async () => {
            const [profile, productsData] = await Promise.all([
                supabaseService.getProfile(),
                supabaseService.getProducts(),
            ]);
            setTheme(normalizeStoreTheme(profile?.store_theme));
            setBusinessName(profile?.business_name || '');
            setProducts(productsData);
            setLoading(false);
        };
        load();
    }, []);

    // What the store will actually render (e.g. "image" without an uploaded image falls back to the color)
    const previewTheme = useMemo(() => normalizeStoreTheme(theme), [theme]);
    const previewProducts = products.length > 0 ? products : SAMPLE_PRODUCTS;

    const update = (changes: Partial<StoreTheme>) => {
        setTheme(prev => ({ ...prev, ...changes }));
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
            update({ backgroundType: 'image', backgroundImageUrl: url });
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo subir la imagen.' });
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        if (theme.backgroundType === 'image' && !theme.backgroundImageUrl) {
            setMessage({ type: 'error', text: 'Sube una imagen para el fondo o elige un color.' });
            return;
        }
        setSaving(true);
        const saved = await supabaseService.updateStoreTheme(previewTheme);
        setSaving(false);
        setMessage(saved
            ? { type: 'success', text: 'Estilo guardado. Ya se ve en tu tienda.' }
            : { type: 'error', text: 'No se pudo guardar el estilo. Inténtalo de nuevo.' });
    };

    const tabClass = (active: boolean) =>
        `flex-1 py-2 text-sm font-medium rounded-md transition-colors ${active ? 'bg-white text-brand-primary shadow' : 'text-gray-600 hover:text-gray-800'}`;

    return (
        <div className="min-h-screen bg-brand-light">
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center gap-4">
                    <div>
                        <Link to="/" className="text-sm text-brand-primary hover:underline">← Volver al panel</Link>
                        <h1 className="text-2xl font-bold text-brand-primary">Estilo de la carta</h1>
                    </div>
                    <Link to={`/store/${user?.id}`} target="_blank" rel="noopener noreferrer" className="bg-white text-brand-primary border border-brand-primary px-4 py-2 rounded-lg shadow-sm hover:bg-brand-primary/5 transition-colors text-sm">
                        Ver tienda
                    </Link>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {loading ? (
                    <p className="text-center text-gray-500 py-12">Cargando estilo...</p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-8 items-start">
                        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-gray-700">Fondo de la página</p>
                                <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                                    <button type="button" className={tabClass(theme.backgroundType === 'color')} onClick={() => update({ backgroundType: 'color' })}>Color</button>
                                    <button type="button" className={tabClass(theme.backgroundType === 'image')} onClick={() => update({ backgroundType: 'image' })}>Imagen (patrón)</button>
                                </div>

                                {theme.backgroundType === 'image' && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            {theme.backgroundImageUrl ? (
                                                <div className="h-16 w-16 rounded-md border border-gray-300" style={{ backgroundImage: `url("${previewTheme.backgroundImageUrl}")`, backgroundRepeat: 'repeat', backgroundSize: '32px auto' }} />
                                            ) : (
                                                <div className="h-16 w-16 flex items-center justify-center rounded-md border-2 border-dashed border-gray-300"><UploadIcon /></div>
                                            )}
                                            <label className={`cursor-pointer text-sm font-medium text-brand-primary hover:text-brand-primary/80 ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
                                                {uploading ? 'Subiendo...' : theme.backgroundImageUrl ? 'Cambiar imagen' : 'Subir imagen'}
                                                <input type="file" className="sr-only" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleImageChange} disabled={uploading} />
                                            </label>
                                        </div>
                                        <p className="text-xs text-gray-500">La imagen se repite en mosaico. Funcionan mejor las imágenes pensadas como patrón. PNG, JPG, GIF o WEBP hasta 10MB.</p>
                                        <div>
                                            <label htmlFor="pattern-size" className="flex justify-between text-sm font-medium text-gray-700">
                                                <span>Tamaño del patrón</span>
                                                <span className="text-gray-500 font-normal">{theme.backgroundImageSize}px</span>
                                            </label>
                                            <input
                                                id="pattern-size"
                                                type="range"
                                                min={PATTERN_SIZE_MIN}
                                                max={PATTERN_SIZE_MAX}
                                                step={10}
                                                value={theme.backgroundImageSize}
                                                onChange={(e) => update({ backgroundImageSize: Number(e.target.value) })}
                                                className="mt-1 w-full accent-brand-primary"
                                            />
                                        </div>
                                    </div>
                                )}

                                <ColorField
                                    id="background-color"
                                    label="Color de fondo"
                                    hint={theme.backgroundType === 'image' ? 'Se ve detrás de las partes transparentes de la imagen.' : undefined}
                                    value={theme.backgroundColor}
                                    onChange={(backgroundColor) => update({ backgroundColor })}
                                />
                            </div>

                            <hr />

                            <ColorField id="card-color" label="Color de las tarjetas" hint="También el encabezado, el buscador y el pie de página." value={theme.cardColor} onChange={(cardColor) => update({ cardColor })} />
                            <ColorField id="text-color" label="Color del texto" value={theme.textColor} onChange={(textColor) => update({ textColor })} />
                            <ColorField id="accent-color" label="Color de acento" hint="Nombre del negocio, categorías, precios y categoría seleccionada." value={theme.accentColor} onChange={(accentColor) => update({ accentColor })} />

                            {message && (
                                <p className={`p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{message.text}</p>
                            )}

                            <div className="flex justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() => update(DEFAULT_STORE_THEME)}
                                    className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Restablecer
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving || uploading}
                                    className="bg-brand-primary text-white py-2 px-4 rounded-md shadow-sm text-sm font-medium hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
                                >
                                    {saving ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </div>
                        </div>

                        <div className="lg:sticky lg:top-8">
                            <p className="text-sm font-medium text-gray-700 mb-2">Vista previa</p>
                            <StorePreview theme={previewTheme} businessName={businessName} products={previewProducts} />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default StoreStylePage;
