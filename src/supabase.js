import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// true si faltan las variables de entorno (típico: deploy sin configurarlas)
export const configMissing = !url || !anonKey;

if (configMissing) {
  console.error(
    "⚠️ Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
    "Cargalas en Vercel (Settings → Environment Variables) y volvé a desplegar."
  );
}

export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder", {
  auth: { persistSession: true, autoRefreshToken: true },
});
