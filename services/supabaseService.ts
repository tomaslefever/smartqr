import { supabase } from './supabaseClient.ts';
import { Product } from '../types.ts';

const BUCKET_NAME = 'product-images';

// A placeholder function to return a default image URL if Supabase is not configured
const getPlaceholderImageUrl = () => {
    return `https://placehold.co/600x400/E2E8F0/4A5568?text=Product+Image`;
};

// --- Product Functions ---

export const getProducts = async (): Promise<Product[]> => {
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error("No user logged in to get products");
        return [];
    }
    
    const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', user.id) // Filter by current user
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching products:', error);
        return [];
    }
    return products as Product[];
};

export const getProductsByUserId = async (userId: string): Promise<Product[]> => {
    if (!supabase) return [];

    const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching products by user ID:', error);
        return [];
    }
    return products as Product[];
};


export const addProduct = async (product: Omit<Product, 'id' | 'created_at'>): Promise<Product | null> => {
    if (!supabase) return null;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error("No user logged in to add product");
        return null;
    }

    const newProduct = { ...product, user_id: user.id };

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

export const getCategories = async (): Promise<string[]> => {
    if (!supabase) return ['Sample Category 1', 'Sample Category 2'];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error("No user logged in to get categories");
        return [];
    }

    const { data, error } = await supabase
        .from('products')
        .select('category')
        .eq('user_id', user.id);

    if (error) {
        console.error('Error fetching categories:', error);
        return [];
    }
    
    // Get unique categories
    // FIX: The `data.map` operation can result in an `unknown[]` type because the type from Supabase
    // is not strictly defined. Using a type guard `(c): c is string` in the filter ensures the array
    // is correctly typed as `string[]`, matching the function's return type, and also filters out any falsy values.
    const categories = Array.from(new Set(data.map(item => item.category).filter((c): c is string => !!c)));
    return categories;
};

// --- Image Upload Function ---

export const uploadImage = async (file: File): Promise<string> => {
    if (!supabase) {
        // If Supabase isn't configured, return a placeholder and log a warning.
        console.warn("Supabase not configured. Using placeholder image.");
        return getPlaceholderImageUrl();
    }
    
    // Create a unique file name
    const fileName = `${Date.now()}-${file.name}`;
    
    const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file);

    if (uploadError) {
        console.error('Error uploading image:', uploadError);
        throw new Error('Image upload failed.');
    }

    // Get the public URL of the uploaded image
    const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);
        
    if (!publicUrl) {
        console.error('Error getting public URL for image');
        throw new Error('Could not get image URL.');
    }
    
    return publicUrl;
};