import React, { useEffect, useState } from 'react';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import { Category, Product } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { PageHeader } from './AppShell.tsx';
import { DeleteIcon, GripIcon, PlusIcon, TagIcon } from './Icons.tsx';
import { buttonClass, cardClass, errorBoxClass, iconButtonClass, inputClass } from './ui.ts';

const NAME_MAX_LENGTH = 60;

const CategoryRow: React.FC<{
    category: Category;
    productCount: number;
    onRename: (category: Category, name: string) => Promise<boolean>;
    onDelete: (category: Category) => void;
}> = ({ category, productCount, onRename, onDelete }) => {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(category.name);

    useEffect(() => setName(category.name), [category.name]);

    const save = async () => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === category.name) {
            setName(category.name);
            setEditing(false);
            return;
        }
        if (await onRename(category, trimmed)) setEditing(false);
    };

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={`flex items-center gap-2 border-b border-line px-3 py-2.5 last:border-0 ${isDragging ? 'relative z-10 bg-surface shadow-pop' : 'hover:bg-muted/50'}`}
        >
            <button
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                type="button"
                className={`${iconButtonClass} h-7 w-6 touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                title="Arrastra para reordenar"
                aria-label={`Reordenar ${category.name}`}
            >
                <GripIcon />
            </button>
            <div className="min-w-0 flex-1">
                {editing ? (
                    <input
                        autoFocus
                        value={name}
                        maxLength={NAME_MAX_LENGTH}
                        onChange={e => setName(e.target.value)}
                        onBlur={save}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); save(); }
                            if (e.key === 'Escape') { setName(category.name); setEditing(false); }
                        }}
                        aria-label={`Nuevo nombre para ${category.name}`}
                        className={`${inputClass} h-9`}
                    />
                ) : (
                    <button type="button" onClick={() => setEditing(true)} className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm font-medium text-fg hover:bg-muted" title="Clic para renombrar">
                        {category.name}
                    </button>
                )}
            </div>
            <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs text-fg-muted tabular-nums">
                {productCount} {productCount === 1 ? 'producto' : 'productos'}
            </span>
            <button type="button" onClick={() => onDelete(category)} className={`${iconButtonClass} hover:!bg-danger/10 hover:!text-danger`} title="Eliminar" aria-label={`Eliminar ${category.name}`}>
                <DeleteIcon />
            </button>
        </li>
    );
};

const CategoriesPage: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            const [categoriesData, productsData] = await Promise.all([
                supabaseService.getCategoryList(),
                supabaseService.getProducts(),
            ]);
            setCategories(categoriesData);
            setProducts(productsData);
            setLoading(false);
        };
        load();
    }, []);

    const countFor = (category: Category) => products.filter(p => p.category_id === category.id).length;
    const uncategorized = products.filter(p => !p.category_id).length;
    const nameTaken = (name: string, exceptId?: number) =>
        categories.some(c => c.id !== exceptId && c.name.toLowerCase() === name.trim().toLowerCase());

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) return;
        if (nameTaken(name)) {
            setError(`Ya tienes una categoría llamada "${name}".`);
            return;
        }
        setCreating(true);
        setError(null);
        const created = await supabaseService.createCategory(name);
        setCreating(false);
        if (!created) {
            setError('No se pudo crear la categoría. Si el problema sigue, revisa que se haya ejecutado supabase/categories.sql.');
            return;
        }
        setCategories(prev => [...prev, created]);
        setNewName('');
    };

    const handleRename = async (category: Category, name: string) => {
        if (nameTaken(name, category.id)) {
            setError(`Ya tienes una categoría llamada "${name}".`);
            return false;
        }
        setError(null);
        const renamed = await supabaseService.renameCategory(category.id, name);
        if (!renamed) {
            setError('No se pudo renombrar la categoría. Inténtalo de nuevo.');
            return false;
        }
        setCategories(prev => prev.map(c => (c.id === renamed.id ? renamed : c)));
        setProducts(prev => prev.map(p => (p.category_id === renamed.id ? { ...p, category: renamed.name } : p)));
        return true;
    };

    const handleDelete = async (category: Category) => {
        const count = countFor(category);
        const detail = count > 0 ? ` ${count === 1 ? 'Su producto quedará' : `Sus ${count} productos quedarán`} sin categoría.` : '';
        if (!window.confirm(`¿Eliminar la categoría "${category.name}"?${detail}`)) return;
        setError(null);
        if (!(await supabaseService.deleteCategory(category.id))) {
            setError('No se pudo eliminar la categoría. Inténtalo de nuevo.');
            return;
        }
        setCategories(prev => prev.filter(c => c.id !== category.id));
        setProducts(prev => prev.map(p => (p.category_id === category.id ? { ...p, category_id: null, category: '' } : p)));
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const categoryName = (id: string | number) => categories.find(c => c.id === id)?.name ?? 'Categoría';
    const accessibility = {
        screenReaderInstructions: { draggable: 'Para reordenar, presiona espacio, muévela con las flechas y presiona espacio de nuevo para soltarla. Escape cancela.' },
        announcements: {
            onDragStart: ({ active }: { active: { id: string | number } }) => `Moviendo ${categoryName(active.id)}.`,
            onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => over ? `${categoryName(active.id)} sobre ${categoryName(over.id)}.` : undefined,
            onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => over ? `${categoryName(active.id)} quedó en la posición de ${categoryName(over.id)}.` : undefined,
            onDragCancel: ({ active }: { active: { id: string | number } }) => `Se canceló mover ${categoryName(active.id)}.`,
        },
    };

    const handleDragEnd = async ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const ids = categories.map(c => c.id);
        const reordered = arrayMove<Category>(categories, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)));
        const previous = categories;
        setCategories(reordered);
        if (!(await supabaseService.reorderCategories(reordered.map(c => c.id)))) {
            setCategories(previous);
            setError('No se pudo guardar el nuevo orden. Inténtalo de nuevo.');
        }
    };

    return (
        <>
            <PageHeader title="Categorías" description="Organiza tu carta. Tu tienda muestra las categorías en este orden." />

            <div className="max-w-2xl space-y-4">
                <form onSubmit={handleCreate} className="flex gap-2">
                    <input
                        value={newName}
                        onChange={e => { setNewName(e.target.value); setError(null); }}
                        maxLength={NAME_MAX_LENGTH}
                        placeholder="Nueva categoría, por ejemplo Postres"
                        aria-label="Nombre de la nueva categoría"
                        className={inputClass}
                    />
                    <button type="submit" disabled={creating || !newName.trim()} className={buttonClass('primary')}>
                        <PlusIcon />
                        {creating ? 'Agregando...' : 'Agregar'}
                    </button>
                </form>

                {error && <p className={errorBoxClass}>{error}</p>}

                <section className={`${cardClass} overflow-hidden`}>
                    {loading ? (
                        <div className="space-y-px">
                            {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-14 animate-pulse bg-muted/60" />)}
                        </div>
                    ) : categories.length === 0 ? (
                        <div className="px-5 py-14 text-center">
                            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-fg-subtle"><TagIcon /></div>
                            <p className="text-sm font-medium text-fg">Aún no tienes categorías</p>
                            <p className="mt-1 text-sm text-fg-muted">Crea la primera arriba para agrupar los productos de tu carta.</p>
                        </div>
                    ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} accessibility={accessibility}>
                            <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                                <ul>
                                    {categories.map(category => (
                                        <CategoryRow key={category.id} category={category} productCount={countFor(category)} onRename={handleRename} onDelete={handleDelete} />
                                    ))}
                                </ul>
                            </SortableContext>
                        </DndContext>
                    )}
                    {!loading && (
                        <p className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs text-fg-subtle">
                            <span>
                                {uncategorized > 0
                                    ? <>{uncategorized} {uncategorized === 1 ? 'producto' : 'productos'} sin categoría · <Link to="/productos?estado=sin-categoria" className="text-primary hover:underline">ver</Link></>
                                    : 'Todos tus productos tienen categoría.'}
                            </span>
                            {categories.length > 1 && <span className="flex items-center gap-1">Arrastra <span className="[&_svg]:h-3.5 [&_svg]:w-3.5"><GripIcon /></span> para cambiar el orden.</span>}
                        </p>
                    )}
                </section>
            </div>
        </>
    );
};

export default CategoriesPage;
