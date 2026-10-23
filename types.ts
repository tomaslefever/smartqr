
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  stock: number;
  // When false the product has no stock control and `stock` is ignored
  track_stock: boolean;
  created_at: string;
  unit: 'unit' | 'kg';
}

export interface Profile {
  id: string; // Corresponds to user_id
  business_name: string | null;
  phone: string | null;
  address: string | null;
  opening_hours: string | null;
  email: string | null;
}
