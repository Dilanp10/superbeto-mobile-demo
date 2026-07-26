# SuperBeto — App móvil (demo)

Sistema de gestión para comercios de barrio (almacén / mercadito): **caja, stock,
vencimientos, fiado, ganancias y proveedores**, con un asistente de IA ("Beto")
que responde por chat. La computadora del local y el celular se mantienen
**siempre sincronizados**.

## 🔗 Demo en vivo

**https://superbeto-mobile-demo.vercel.app** — entrá con el botón **"Entrar a la demo"** (datos de ejemplo inventados).

> **Nota:** esto es solo la **app móvil** con datos de demostración. La app de
> escritorio (la "caja" que usa el comercio) corre localmente y no está publicada.
> El **asistente Beto está desactivado en la demo** (se muestra como vitrina);
> en la versión real responde y modifica productos en vivo.
> ¿Querés verla completa? **Escribime:** dilanperea10@gmail.com · 3834697224.

## ✨ Qué incluye

- **Dashboard** de ganancias: vendido, ganancia, margen, ticket promedio, caja vs. fiado, por período (hoy / semana / mes).
- **Productos** comunes y **por peso** (por kg).
- **Alertas** de vencimientos (por tandas/fardos) y stock bajo.
- **Cuentas** de fiado por cliente, con historial.
- **Proveedores** con saldos (deuda / pagos) y limpieza automática.
- **Beto**, asistente de IA con *function calling*: consulta ventas, stock,
  cuentas y vencimientos, y —en la app real— modifica precios, costos y stock por chat.
- **PWA**: se instala como app y funciona desde el navegador del celular.

## 🛠️ Stack

- **React** + **Vite** + **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + RLS) como backend en la nube
- **Vercel** (hosting + funciones serverless para el asistente)
- **Gemini** (Google) para el asistente con *function calling*
- Sincronización con una app de escritorio (Node.js/Express + SQLite) que es la autoridad de las ventas

## 🚀 Correr en local

```bash
npm install
cp .env.example .env   # completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:5174
```

Para el asistente (opcional), la función `api/chat.js` necesita en el entorno:
`GEMINI_API_KEY`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

---

Hecho por **Dilan Perea** · [portafolio](https://github.com/Dilanp10)
