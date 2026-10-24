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
export const supabaseUrl = runtimeConfig.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = runtimeConfig.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// NOTA DE CONFIGURACIÓN IMPORTANTE:
// Las imágenes se guardan en un bucket PÚBLICO llamado 'product-images'. Las políticas de
// subida y los límites del bucket están en supabase/storage-policies.sql.

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
