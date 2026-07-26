# SuperBeto · Panel del celular — Cómo publicarlo

App web para controlar el negocio desde el teléfono. Se conecta a Supabase
(la nube). Lo que editás acá baja a la compu del local en la próxima sync.

## Antes que nada (1 sola vez)
1. En Supabase → SQL Editor → pegá y corré **`supabase_rls.sql`** (está en la
   carpeta SUPERBETO). Sin esto, el panel no ve ningún dato.

## Probar en la compu (opcional)
```
cd mobile
npm install
npm run dev
```
Abrí http://localhost:5173 y entrá con tu email + contraseña.

## Publicar en Vercel (para usarlo desde el celu)

### Opción rápida — Vercel CLI
1. Instalá la CLI (una vez):  `npm i -g vercel`
2. Entrá a la carpeta:        `cd mobile`
3. Ejecutá:                   `vercel`
   - Login con tu cuenta (GitHub/email)
   - "Set up and deploy?" → Yes
   - "In which directory is your code?" → `./` (ya estás en mobile)
   - Framework → Vite (lo detecta solo)
4. Cargá las variables de entorno (Settings → Environment Variables del
   proyecto en vercel.com), o cuando la CLI te pregunte:
   - `VITE_SUPABASE_URL`      = https://ppgjabrcicgemosfemnq.supabase.co
   - `VITE_SUPABASE_ANON_KEY` = sb_publishable_xtQdVd-p7orc5DcFrf4R9Q_siJRh0Et
5. Redeploy:                  `vercel --prod`
6. Te da una URL (ej. https://superbeto-mobile.vercel.app). Abrila en el celu.

### Opción con GitHub
1. Subí la carpeta `mobile` a un repo de GitHub.
2. En vercel.com → "Add New Project" → importá el repo.
3. **Root Directory** = `mobile` (si subiste todo SUPERBETO).
4. Agregá las 2 variables de entorno de arriba.
5. Deploy.

## En el celular
- Abrí la URL de Vercel en Chrome.
- Menú de Chrome → "Agregar a pantalla de inicio" → queda como una app con ícono.
- Entrás con tu email y contraseña.

## Notas
- La `VITE_SUPABASE_ANON_KEY` es pública: no es secreta porque la seguridad
  real la da el login + las políticas RLS.
- El panel muestra ventas de los **últimos 3 meses** (lo que hay en la nube).
  El historial completo y eterno está en la compu del local.
- El stock se sigue cargando en la compu (por fardos/tandas). Desde el celu
  agregás productos y cambiás precios; el stock lo ponés en el local.
