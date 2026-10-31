// Access to one business's menu, signed in as its owner: Supabase's row level security only lets this
// session read and change that business's rows, exactly like the SmartQR panel.
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalize } from './text.js';
import type { Category, Menu, Product } from './types.js';

const BUCKET = 'product-images';
const PRODUCT_COLUMNS = 'id, name, description, price, unit, category, category_id, image_url, active, out_of_stock, track_stock, stock, position';
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
// Same limit as the bucket (supabase/storage-policies.sql)
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface Config {
    email: string;
    password: string;
    siteUrl: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
}

export const configFromEnv = (env = process.env): Config => {
    const email = env.SMARTQR_EMAIL;
    const password = env.SMARTQR_PASSWORD;
    if (!email || !password) {
        throw new Error('Faltan SMARTQR_EMAIL y SMARTQR_PASSWORD: las credenciales de la cuenta del negocio en SmartQR.');
    }
    return {
        email, password,
        siteUrl: (env.SMARTQR_URL || 'https://smartqr.cl').replace(/\/+$/, ''),
        supabaseUrl: env.SMARTQR_SUPABASE_URL,
        supabaseAnonKey: env.SMARTQR_SUPABASE_ANON_KEY,
    };
};

export class NotFoundError extends Error {}

export interface ProductInput {
    nombre: string;
    descripcion?: string;
    precio?: number;
    unidad?: 'unit' | 'kg';
    categoria?: string | number;
    activo?: boolean;
}

export interface ProductPatch {
    nombre?: string;
    descripcion?: string;
    precio?: number;
    unidad?: 'unit' | 'kg';
    categoria?: string | number | null;
}

export class SmartQR {
    private client: SupabaseClient | null = null;
    private userId = '';
    constructor(private readonly config: Config) {}

    // Signs in lazily, on the first tool call, so the server starts even without network
    private async session() {
        if (this.client) return { client: this.client, userId: this.userId };
        let { supabaseUrl, supabaseAnonKey } = this.config;
        if (!supabaseUrl || !supabaseAnonKey) {
            // The same public values the site gives every visitor in /config.js
            const response = await fetch(`${this.config.siteUrl}/config.js`);
            if (!response.ok) throw new Error(`No se pudo leer la configuración de ${this.config.siteUrl} (HTTP ${response.status}).`);
            const js = await response.text();
            const runtime = JSON.parse(js.slice(js.indexOf('{'), js.lastIndexOf('}') + 1)) as { supabaseUrl?: string; supabaseAnonKey?: string };
            supabaseUrl = runtime.supabaseUrl;
            supabaseAnonKey = runtime.supabaseAnonKey;
        }
        if (!supabaseUrl || !supabaseAnonKey) throw new Error('El sitio no entregó la configuración de Supabase.');
        const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: true } });
        const { data, error } = await client.auth.signInWithPassword({ email: this.config.email, password: this.config.password });
        if (error || !data.user) throw new Error(`No se pudo iniciar sesión en SmartQR: ${error?.message ?? 'sin usuario'}`);
        this.client = client;
        this.userId = data.user.id;
        return { client, userId: this.userId };
    }

    storeUrl() {
        return `${this.config.siteUrl}/#/store/${this.userId}`;
    }

    async profile() {
        const { client, userId } = await this.session();
        const { data, error } = await client.from('profiles').select('business_name, phone, address, opening_hours').eq('id', userId).maybeSingle();
        if (error) throw error;
        return { ...data, tienda: this.storeUrl() };
    }

    // Categories and products in menu order, the same order the store shows
    async menu(): Promise<Menu> {
        const { client, userId } = await this.session();
        const [categories, products] = await Promise.all([
            client.from('categories').select('id, name, position').eq('user_id', userId)
                .order('position', { ascending: true, nullsFirst: false }).order('id'),
            client.from('products').select(PRODUCT_COLUMNS).eq('user_id', userId)
                .order('position', { ascending: true, nullsFirst: false }).order('id'),
        ]);
        if (categories.error) throw categories.error;
        if (products.error) throw products.error;
        const rank = new Map((categories.data as Category[]).map((c, i) => [c.id, i]));
        const ordered = (products.data as Product[]).map((p, i) => ({ p, i }))
            .sort((a, b) => (rank.get(a.p.category_id ?? -1) ?? -1) - (rank.get(b.p.category_id ?? -1) ?? -1) || a.i - b.i)
            .map(({ p }) => p);
        return { categories: categories.data as Category[], products: ordered };
    }

    async findCategory(nameOrId: string | number): Promise<Category> {
        const { categories } = await this.menu();
        const wanted = normalize(String(nameOrId).trim());
        const found = categories.find(c => String(c.id) === wanted || normalize(c.name) === wanted);
        if (!found) throw new NotFoundError(`No existe la categoría "${nameOrId}". Categorías: ${categories.map(c => c.name).join(', ')}`);
        return found;
    }

    async createCategory(name: string): Promise<Category> {
        const { client, userId } = await this.session();
        const { categories } = await this.menu();
        if (categories.some(c => normalize(c.name) === normalize(name.trim()))) throw new Error(`Ya existe la categoría "${name}".`);
        const position = Math.max(0, ...categories.map(c => c.position ?? 0)) + 1;
        const { data, error } = await client.from('categories').insert([{ user_id: userId, name: name.trim(), position }]).select('id, name, position').single();
        if (error) throw error;
        return data as Category;
    }

    async renameCategory(nameOrId: string | number, newName: string): Promise<Category> {
        const { client } = await this.session();
        const category = await this.findCategory(nameOrId);
        const { data, error } = await client.from('categories').update({ name: newName.trim() }).eq('id', category.id).select('id, name, position').single();
        if (error) throw error;
        // products.category is kept in sync with the category name for compatibility, as the app does
        const { error: syncError } = await client.from('products').update({ category: newName.trim() }).eq('category_id', category.id);
        if (syncError) throw syncError;
        return data as Category;
    }

    // Puts the given categories first, in that order; the rest keep their order after them
    async reorderCategories(order: (string | number)[]) {
        const { client } = await this.session();
        const { categories } = await this.menu();
        const first = await Promise.all(order.map(item => this.findCategory(item)));
        const ids = [...new Set([...first.map(c => c.id), ...categories.map(c => c.id)])];
        const { error } = await client.rpc('reorder_categories', { category_ids: ids });
        if (error) throw error;
        return (await this.menu()).categories.map(c => c.name);
    }

    // Puts the given products first within their category, in that order; the rest of the category
    // keeps its order after them. Product positions are global, so the whole menu is renumbered.
    async reorderProducts(categoryNameOrId: string | number, productIds: number[]) {
        const { client } = await this.session();
        const category = await this.findCategory(categoryNameOrId);
        const { products } = await this.menu();
        const inCategory = products.filter(p => p.category_id === category.id);
        const stray = productIds.filter(id => !inCategory.some(p => p.id === id));
        if (stray.length) throw new NotFoundError(`Estos productos no están en "${category.name}": ${stray.join(', ')}`);
        await this.saveOrder(products, category.id, productIds);
        return (await this.menu()).products.filter(p => p.category_id === category.id).map(p => ({ id: p.id, nombre: p.name }));
    }

    // Renumbers the whole menu with the given products first among those of categoryId (null = the
    // products without a category), keeping everything else in place
    private async saveOrder(products: Product[], categoryId: number | null, first: number[]) {
        const { client } = await this.session();
        const inGroup = products.filter(p => p.category_id === categoryId);
        const newOrder = [...new Set([...first, ...inGroup.map(p => p.id)])];
        let next = 0;
        const ids = products.map(p => (p.category_id === categoryId ? newOrder[next++] : p.id) as number);
        const { error } = await client.rpc('reorder_products', { product_ids: ids });
        if (error) throw error;
    }

    private async categoryFields(name: string | number | null | undefined) {
        if (name === undefined) return {};
        if (name === null || String(name).trim() === '') return { category_id: null, category: '' };
        const category = await this.findCategory(name);
        return { category_id: category.id, category: category.name };
    }

    async addProduct(input: ProductInput): Promise<Product> {
        const { client, userId } = await this.session();
        const { products } = await this.menu();
        // Inserted at the end of the menu, then moved to the start of its category (below)
        const position = Math.max(0, ...products.map(p => p.position ?? 0)) + 1;
        const { data, error } = await client.from('products').insert([{
            user_id: userId,
            name: input.nombre.trim(),
            description: (input.descripcion ?? '').trim(),
            price: input.precio ?? 0,
            unit: input.unidad ?? 'unit',
            active: input.activo ?? true,
            out_of_stock: false, track_stock: false, stock: 0, image_url: '',
            position,
            // Without a category the panel saves category = '' (the column does not allow null)
            ...(await this.categoryFields(input.categoria ?? null)),
        }]).select(PRODUCT_COLUMNS).single();
        if (error) throw error;
        const product = data as Product;
        // New products go first in their category, where the business sees them right away
        await this.saveOrder((await this.menu()).products, product.category_id, [product.id]);
        return this.product(product.id);
    }

    async updateProduct(id: number, patch: ProductPatch): Promise<Product> {
        const fields: Record<string, unknown> = { ...(await this.categoryFields(patch.categoria)) };
        if (patch.nombre !== undefined) fields.name = patch.nombre.trim();
        if (patch.descripcion !== undefined) fields.description = patch.descripcion.trim();
        if (patch.precio !== undefined) fields.price = patch.precio;
        if (patch.unidad !== undefined) fields.unit = patch.unidad;
        return this.update(id, fields);
    }

    // Updates one product and fails clearly if it does not exist or belongs to another business
    async update(id: number, fields: Record<string, unknown>): Promise<Product> {
        const { client, userId } = await this.session();
        const { data, error } = await client.from('products').update(fields).eq('id', id).eq('user_id', userId).select(PRODUCT_COLUMNS);
        if (error) throw error;
        if (!data?.length) throw new NotFoundError(`No existe el producto ${id} en esta carta.`);
        return data[0] as Product;
    }

    // Downloads an image (http/https URL or local file), uploads it under the user's folder, as the
    // storage policy requires, and sets it as the product's image
    async setImage(id: number, source: string): Promise<Product> {
        const { client, userId } = await this.session();
        let bytes: Buffer;
        let type: string;
        if (/^https?:\/\//i.test(source)) {
            const response = await fetch(source);
            if (!response.ok) throw new Error(`No se pudo descargar la imagen (HTTP ${response.status}).`);
            const length = Number(response.headers.get('content-length') ?? 0);
            if (length > MAX_IMAGE_BYTES) throw new Error('La imagen pesa más de 10 MB.');
            bytes = Buffer.from(await response.arrayBuffer());
            type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
        } else {
            const { readFile } = await import('node:fs/promises');
            bytes = await readFile(source);
            type = '';
        }
        type = IMAGE_TYPES[type] ? type : sniffImageType(bytes);
        if (!IMAGE_TYPES[type]) throw new Error('El archivo no es una imagen JPG, PNG, WebP o GIF.');
        if (bytes.length > MAX_IMAGE_BYTES) throw new Error('La imagen pesa más de 10 MB.');
        // Check the product before uploading, so a wrong id does not leave an orphan file
        await this.product(id);
        const path = `${userId}/${Date.now()}-${randomUUID()}.${IMAGE_TYPES[type]}`;
        const { error } = await client.storage.from(BUCKET).upload(path, bytes, { contentType: type });
        if (error) throw error;
        const url = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        return this.update(id, { image_url: url });
    }

    async product(id: number): Promise<Product> {
        const { client, userId } = await this.session();
        const { data, error } = await client.from('products').select(PRODUCT_COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (!data) throw new NotFoundError(`No existe el producto ${id} en esta carta.`);
        return data as Product;
    }
}

const sniffImageType = (bytes: Buffer) => {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    if (bytes.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
    return '';
};
