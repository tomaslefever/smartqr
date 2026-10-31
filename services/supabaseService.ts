import { supabase } from './supabaseClient.ts';
import { Category, Product, Profile, Theme, ThemeStyle } from '../types.ts';

const BUCKET_NAME = 'product-images';

// --- Product Functions ---

// Errors for a column, table or relationship that does not exist yet, i.e. a migration in supabase/
// that has not run: queries then fall back to what the previous schema had
const MISSING_SCHEMA_ERRORS = new Set(['42703', '42P01', 'PGRST200', 'PGRST204', 'PGRST205']);
const isMissingSchema = (error: { code?: string } | null) => !!error?.code && MISSING_SCHEMA_ERRORS.has(error.code);

type ProductRow = Product & { category_ref?: { name: string } | null };

// A business's products in their manual order (newest first for any without a position), with the
// category name taken from the categories table
const fetchProductsInOrder = async (userId: string): Promise<Product[]> => {
    if (!supabase) return [];

    const attempts = [
        { select: '*, category_ref:categories(name)', byPosition: true },
        { select: '*', byPosition: true },   // before supabase/categories.sql
        { select: '*', byPosition: false },  // before supabase/products-position.sql
    ];
    for (const { select, byPosition } of attempts) {
        let query = supabase.from('products').select(select).eq('user_id', userId);
        if (byPosition) query = query.order('position', { ascending: true, nullsFirst: false });
        const { data, error } = await query.order('created_at', { ascending: false });

        if (!error) {
            const withCategoryTable = select.includes('category_ref');
            return (data as unknown as ProductRow[]).map(({ category_ref, ...product }) => ({
                ...product,
                category: withCategoryTable ? category_ref?.name ?? '' : product.category ?? '',
            }));
        }
        if (!isMissingSchema(error)) {
            console.error('Error fetching products:', error);
            return [];
        }
    }
    return [];
};

export const getProducts = async (): Promise<Product[]> => {
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error("No user logged in to get products");
        return [];
    }
    return fetchProductsInOrder(user.id);
};

export const getProductsByUserId = async (userId: string): Promise<Product[]> => fetchProductsInOrder(userId);

// Saves a full order in one call: ids in the order they should appear
export const reorderProducts = async (productIds: number[]): Promise<boolean> => {
    if (!supabase) return false;

    const { error } = await supabase.rpc('reorder_products', { product_ids: productIds });
    if (error) {
        console.error('Error reordering products:', error);
        return false;
    }
    return true;
};


export const addProduct = async (product: Omit<Product, 'id' | 'created_at'>): Promise<Product | null> => {
    if (!supabase) return null;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error("No user logged in to add product");
        return null;
    }

    // New products go to the end of the menu
    const { data: last, error: positionError } = await supabase
        .from('products')
        .select('position')
        .eq('user_id', user.id)
        .order('position', { ascending: false, nullsFirst: false })
        .limit(1);
    const position = positionError ? undefined : (last?.[0]?.position ?? 0) + 1;

    const newProduct = { ...product, user_id: user.id, ...(position !== undefined && { position }) };

    const { data, error } = await supabase
        .from('products')
        .insert([newProduct])
        .select()
        .single();
        
    if (error) {
        console.error('Error adding product:', error);
        return null;
    }
    return data as Product;
};

export const updateProduct = async (id: number, product: Partial<Product>): Promise<Product | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('products')
        .update(product)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating product:', error);
        return null;
    }
    return data as Product;
};

export const deleteProduct = async (id: number): Promise<boolean> => {
    if (!supabase) return false;

    const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting product:', error);
        return false;
    }
    return true;
};

// --- Category Functions ---

const fetchCategories = async (userId: string): Promise<Category[]> => {
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', userId)
        .order('position', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });

    if (error) {
        // Before supabase/categories.sql there is no table: the store groups by the products' text category
        if (!isMissingSchema(error)) console.error('Error fetching categories:', error);
        return [];
    }
    return data as Category[];
};

// The logged-in business's categories, in menu order
export const getCategoryList = async (): Promise<Category[]> => {
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    return fetchCategories(user.id);
};

export const getCategoriesByUserId = async (userId: string): Promise<Category[]> => fetchCategories(userId);

// New categories go to the end of the menu
export const createCategory = async (name: string): Promise<Category | null> => {
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const existing = await fetchCategories(user.id);
    const position = Math.max(0, ...existing.map(c => c.position ?? 0)) + 1;

    const { data, error } = await supabase
        .from('categories')
        .insert([{ user_id: user.id, name: name.trim(), position }])
        .select()
        .single();

    if (error) {
        console.error('Error creating category:', error);
        return null;
    }
    return data as Category;
};

export const renameCategory = async (id: number, name: string): Promise<Category | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('categories')
        .update({ name: name.trim() })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error renaming category:', error);
        return null;
    }
    return data as Category;
};

// Its products are left without a category (on delete set null)
export const deleteCategory = async (id: number): Promise<boolean> => {
    if (!supabase) return false;

    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
        console.error('Error deleting category:', error);
        return false;
    }
    return true;
};

export const reorderCategories = async (categoryIds: number[]): Promise<boolean> => {
    if (!supabase) return false;

    const { error } = await supabase.rpc('reorder_categories', { category_ids: categoryIds });
    if (error) {
        console.error('Error reordering categories:', error);
        return false;
    }
    return true;
};

// --- Image Upload Function ---

export const uploadImage = async (file: File): Promise<string> => {
    if (!supabase) {
        throw new Error('No se pueden subir imágenes: Supabase no está configurado.');
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error('Debes iniciar sesión para subir imágenes.');
    }

    // Create a unique file name inside the user's folder: the storage policy only allows
    // uploads under "<user id>/". The original name is not reused because Storage rejects
    // keys with characters like accents, ñ or some symbols (e.g. "piña.jpg").
    const rawExtension = file.name.includes('.') ? file.name.split('.').pop() ?? '' : '';
    const extension = rawExtension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const fileName = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    
    const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file);

    if (uploadError) {
        console.error('Error uploading image:', uploadError);
        throw new Error('No se pudo subir la imagen. Inténtalo de nuevo.');
    }

    // Get the public URL of the uploaded image
    const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);
        
    if (!publicUrl) {
        console.error('Error getting public URL for image');
        throw new Error('No se pudo obtener la URL de la imagen.');
    }
    
    return publicUrl;
};

// --- Profile/Business Settings Functions ---

// NOTE: This assumes a 'profiles' table exists with RLS policies set up.
// The primary key 'id' of 'profiles' should be a foreign key to 'auth.users.id'.

export const getProfile = async (): Promise<Profile | null> => {
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error fetching profile:', error);
    }

    return data as Profile | null;
};

export const getPublicProfileByUserId = async (userId: string): Promise<Profile | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching public profile:', error);
    }
    
    return data as Profile | null;
};

export const updateProfile = async (profileData: Omit<Profile, 'email'>): Promise<Profile | null> => {
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const updateData = {
        ...profileData,
        id: user.id, // Ensure the ID is set for upsert
        updated_at: new Date(),
    };

    const { data, error } = await supabase
        .from('profiles')
        .upsert(updateData)
        .select()
        .single();

    if (error) {
        console.error('Error updating profile:', error);
        return null;
    }
    return data as Profile;
};

// --- Theme Functions ---

// Predefined themes first (in their gallery order), then the user's own themes
export const getThemes = async (): Promise<Theme[]> => {
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('themes')
        .select('*')
        .or(`owner_id.is.null,owner_id.eq.${user.id}`)
        .order('owner_id', { ascending: true, nullsFirst: true })
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching themes:', error);
        return [];
    }
    return data as Theme[];
};

export const getTheme = async (id: string): Promise<Theme | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('themes')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        console.error('Error fetching theme:', error);
        return null;
    }
    return data as Theme | null;
};

export const createTheme = async (name: string, style: ThemeStyle): Promise<Theme | null> => {
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('themes')
        .insert([{ ...style, name, owner_id: user.id }])
        .select()
        .single();

    if (error) {
        console.error('Error creating theme:', error);
        return null;
    }
    return data as Theme;
};

export const updateTheme = async (id: string, name: string, style: ThemeStyle): Promise<Theme | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('themes')
        .update({ ...style, name, updated_at: new Date() })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating theme:', error);
        return null;
    }
    return data as Theme;
};

export const deleteTheme = async (id: string): Promise<boolean> => {
    if (!supabase) return false;

    const { error } = await supabase
        .from('themes')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting theme:', error);
        return false;
    }
    return true;
};

export const setActiveTheme = async (themeId: string | null): Promise<boolean> => {
    if (!supabase) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Upsert with only these columns, so the business details in the profile are left as they are
    const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, theme_id: themeId });

    if (error) {
        console.error('Error setting active theme:', error);
        return false;
    }
    return true;
};

// --- WhatsApp agent (supabase/whatsapp-agent.sql) ---

export interface WhatsAppLink {
    phone: string;
    created_at: string;
}

// Thrown when supabase/whatsapp-agent.sql has not run, so the page can say so instead of failing
export class WhatsAppAgentUnavailable extends Error {}

// A missing table (PGRST205, 42P01) or function (PGRST202, 42883)
const isMissingAgentSchema = (error: { code?: string } | null) =>
    isMissingSchema(error) || error?.code === 'PGRST202' || error?.code === '42883';

// A one-time code, valid 10 minutes, that the business sends to the WhatsApp agent to link its number
export const createWhatsAppLinkCode = async (): Promise<{ code: string; expires_at: string }> => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.rpc('create_whatsapp_link_code');
    if (isMissingAgentSchema(error)) throw new WhatsAppAgentUnavailable();
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as { code: string; expires_at: string };
};

export const getWhatsAppLinks = async (): Promise<WhatsAppLink[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('whatsapp_links').select('phone, created_at').order('created_at', { ascending: false });
    if (isMissingAgentSchema(error)) throw new WhatsAppAgentUnavailable();
    if (error) throw new Error(error.message);
    return data as WhatsAppLink[];
};

export const removeWhatsAppLink = async (phone: string): Promise<void> => {
    if (!supabase) return;
    const { error } = await supabase.from('whatsapp_links').delete().eq('phone', phone);
    if (error) throw new Error(error.message);
};
