import { createClient } from '@supabase/supabase-js';

declare global {
    interface Window {
        __SMARTQR_CONFIG__?: {
            supabaseUrl?: string;
            supabaseAnonKey?: string;
        };
    }
}

// La configuración se resuelve en este orden:
// 1. window.__SMARTQR_CONFIG__, que server.js genera en /config.js a partir de las variables de entorno
//    SUPABASE_URL y SUPABASE_ANON_KEY al momento de ejecutar (Docker / Easypanel).
// 2. VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY, leídas al compilar (útil con `npm run dev` y .env.local).
const runtimeConfig = window.__SMARTQR_CONFIG__ ?? {};
const supabaseUrl = runtimeConfig.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = runtimeConfig.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// NOTA DE CONFIGURACIÓN IMPORTANTE:
// 1. Asegúrate de haber creado un "bucket" de almacenamiento en tu panel de Supabase llamado 'product-images'.
// 2. Asegúrate de que el bucket sea PÚBLICO. Ve a Storage > Policies y crea una nueva política para 'product-images' que permita el acceso público de lectura (SELECT).
//    Una política simple para empezar podría ser:
//    - Policy Name: Public Read Access
//    - Allowed operations: SELECT
//    - Target roles: anon, authenticated

function initializeSupabaseClient() {
    if (!supabaseUrl || !supabaseAnonKey) {
        console.warn(`
      **********************************************************************************
      * ADVERTENCIA: Las credenciales de Supabase no están configuradas.                 *
      * Define SUPABASE_URL y SUPABASE_ANON_KEY en el entorno del servidor, o           *
      * VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local para desarrollo.       *
      **********************************************************************************
    `);
        return null;
    }
    return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = initializeSupabaseClient();
