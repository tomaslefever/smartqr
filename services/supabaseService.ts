import { Product } from '../types.ts';

// --- MOCK DATABASE ---
// In a real application, this data would come from your Supabase database.
let products: Product[] = [
  { id: 1, name: 'Pan de Masa Madre Artesanal', description: 'Recién horneado usando métodos tradicionales y harina orgánica.', price: 7.50, category: 'Panadería', imageUrl: 'https://picsum.photos/seed/sourdough/400/300', stock: 15, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 2, name: 'Tomates Heirloom Orgánicos', description: 'Una mezcla de variedades heirloom coloridas y sabrosas.', price: 4.99, category: 'Frutas y Verduras', imageUrl: 'https://picsum.photos/seed/tomatoes/400/300', stock: 30, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 3, name: 'Huevos de Gallinas Libres', description: 'Una docena de huevos de gallinas criadas en pastizales.', price: 6.00, category: 'Lácteos y Huevos', imageUrl: 'https://picsum.photos/seed/eggs/400/300', stock: 25, createdAt: new Date().toISOString() },
  { id: 4, name: 'Miel Cruda', description: 'Miel sin procesar de flores silvestres locales.', price: 12.00, category: 'Despensa', imageUrl: 'https://picsum.photos/seed/honey/400/300', stock: 40, createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 5, name: 'Selección de Quesos Gourmet', description: 'Una selección curada de quesos locales.', price: 18.50, category: 'Lácteos y Huevos', imageUrl: 'https://picsum.photos/seed/cheese/400/300', stock: 12, createdAt: new Date().toISOString() },
  { id: 6, name: 'Mermelada de Fresa Casera', description: 'Mermelada dulce y ácida hecha con fresas frescas.', price: 8.25, category: 'Despensa', imageUrl: 'https://picsum.photos/seed/jam/400/300', stock: 22, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 7, name: 'Croissants de Mantequilla', description: 'Croissants hojaldrados y mantecosos, perfectos para el desayuno.', price: 3.50, category: 'Panadería', imageUrl: 'https://picsum.photos/seed/croissant/400/300', stock: 20, createdAt: new Date().toISOString() },
  { id: 8, name: 'Manzanas Honeycrisp', description: 'Manzanas crujientes y jugosas, recién cosechadas.', price: 3.99, category: 'Frutas y Verduras', imageUrl: 'https://picsum.photos/seed/apples/400/300', stock: 50, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 9, name: 'Leche Entera Orgánica', description: 'Un galón de leche entera fresca de vacas alimentadas con pasto.', price: 5.50, category: 'Lácteos y Huevos', imageUrl: 'https://picsum.photos/seed/milk/400/300', stock: 18, createdAt: new Date().toISOString() },

];

let nextId = 10;

// --- MOCK SUPABASE CLIENT ---
// Replace these mock functions with actual calls to the Supabase client library.
// e.g., import { createClient } from '@supabase/supabase-js';
// const supabase = createClient('YOUR_SUPABASE_URL', 'YOUR_SUPABASE_ANON_KEY');

const delay = <T,>(data: T, ms = 500): Promise<T> => 
  new Promise(resolve => setTimeout(() => resolve(data), ms));

export const getProducts = async (): Promise<Product[]> => {
  console.log('Fetching products...');
  // Real implementation: const { data, error } = await supabase.from('products').select('*');
  return delay([...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
};

export const addProduct = async (productData: Omit<Product, 'id' | 'createdAt'>): Promise<Product> => {
  console.log('Adding product:', productData);
  const newProduct: Product = {
    ...productData,
    id: nextId++,
    createdAt: new Date().toISOString(),
  };
  products.push(newProduct);
  // Real implementation: const { data, error } = await supabase.from('products').insert([newProduct]).select();
  return delay(newProduct);
};

export const updateProduct = async (id: number, updates: Partial<Product>): Promise<Product> => {
  console.log(`Updating product ${id} with:`, updates);
  let updatedProduct: Product | undefined;
  products = products.map(p => {
    if (p.id === id) {
      updatedProduct = { ...p, ...updates };
      return updatedProduct;
    }
    return p;
  });
  if (!updatedProduct) throw new Error('Product not found');
  // Real implementation: const { data, error } = await supabase.from('products').update(updates).eq('id', id).select();
  return delay(updatedProduct);
};

export const deleteProduct = async (id: number): Promise<{ id: number }> => {
  console.log('Deleting product:', id);
  products = products.filter(p => p.id !== id);
  // Real implementation: const { error } = await supabase.from('products').delete().eq('id', id);
  return delay({ id });
};

// This simulates uploading an image file and getting a public URL.
export const uploadImage = async (file: File): Promise<string> => {
  console.log(`Uploading image: ${file.name}`);
  // In a real app, you would upload to Supabase Storage and return the public URL.
  // const { data, error } = await supabase.storage.from('product-images').upload(`public/${Date.now()}_${file.name}`, file);
  // return supabase.storage.from('product-images').getPublicUrl(data.path).publicURL;
  const randomSeed = Math.random().toString(36).substring(7);
  return delay(`https://picsum.photos/seed/${randomSeed}/400/300`, 1000);
};