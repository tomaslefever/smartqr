import { createClient } from '@supabase/supabase-js';

// TODO: Reemplaza los siguientes valores con la URL y la clave anónima (anon key) de tu proyecto de Supabase.
// Puedes encontrar esta información en la configuración de tu proyecto de Supabase en "Project Settings" > "API".
const supabaseUrl = 'https://tcvvnnphgwzxstzxytik.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjdnZubnBoZ3d6eHN0enh5dGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMzA4MzksImV4cCI6MjA3NTcwNjgzOX0.y0vrMGc4CY_PW1s43wkaoqGrascPvB95QpK9WrsaXfc';

// NOTA DE CONFIGURACIÓN IMPORTANTE:
// 1. Asegúrate de haber creado un "bucket" de almacenamiento en tu panel de Supabase llamado 'product-images'.
// 2. Asegúrate de que el bucket sea PÚBLICO. Ve a Storage > Policies y crea una nueva política para 'product-images' que permita el acceso público de lectura (SELECT).
//    Una política simple para empezar podría ser:
//    - Policy Name: Public Read Access
//    - Allowed operations: SELECT
//    - Target roles: anon, authenticated

function initializeSupabaseClient() {
    // FIX: The comparison was changed from `===` to `includes()` to avoid a TypeScript error.
    // When constants with literal string values are compared to other literal strings, TypeScript
    // correctly identifies that the comparison will always be false, which it flags as an error.
    // Using `includes()` preserves the intent of checking for placeholder values without causing this error.
    if (supabaseUrl.includes('YOUR_SUPABASE_URL') || supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY')) {
        console.warn(`
      **********************************************************************************
      * ADVERTENCIA: Las credenciales de Supabase no están configuradas.                   *
      * Por favor, actualiza los valores en 'services/supabaseClient.ts' para habilitar  *
      * la subida de imágenes. La funcionalidad de subida usará imágenes de marcador de posición. *
      **********************************************************************************
    `);
        return null;
    }
    return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = initializeSupabaseClient();
