// Función serverless de Vercel: /api/chat
// Recibe { message, history, supabase_token } y devuelve la respuesta del asistente.
// Usa Gemini con "function calling" para consultar Supabase.
// Modo: consulta + modificación de PRODUCTOS (precio, costo, nombre, categoría,
// stock por fardos). Las ventas y cuentas siguen siendo solo consulta.
// SEGURIDAD: requiere sesión válida de Supabase (el endpoint es público en
// Vercel; sin este chequeo cualquiera con la URL podría leer/modificar datos).

import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// Modelos en orden de preferencia: si uno está saturado (503) o rate-limited
// (429), probamos el siguiente.
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

const SYSTEM_INSTRUCTION = `Sos "Beto", el asistente del negocio SuperBeto (una despensa/almacén argentino).
El dueño te habla en español (rioplatense) para consultar información del negocio.

Reglas:
- Sé breve y directo. Nada de introducciones largas.
- Usá los formatos argentinos: precios con $ y coma decimal (ej: $1.250,50), kg con coma.
- Si te preguntan algo que no podés responder con las herramientas, decilo con naturalidad.
- Si preguntan por una persona por nombre, buscá en las cuentas (podés buscar aunque el nombre esté incompleto).
- Cuando muestres listas, priorizá lo más importante (top 5, no más).
- Si algo no aparece en los datos (ej: producto sin ventas hoy), decilo claro y no inventes números.

MODO DEMO (solo consulta):
- Esta es una demostración pública: NO podés modificar nada (ni precios, ni costos, ni stock, ni ventas, ni cuentas). Solo consultás información.
- Si te piden cambiar algo, aclará con simpatía que esta demo es de solo lectura, y que en la app real Beto también puede modificar precio, costo, nombre, categoría y stock de los productos.
- Para responder consultas de productos usá search_product. NUNCA muestres el product_uuid al usuario (es un dato interno).

UNIDADES (muy importante):
- Los productos COMUNES (tipo "comun") se venden y se cuentan POR UNIDAD: decí "40 unidades" o "40 u", NUNCA "40 kg".
- Los productos POR PESO (tipo "por_peso") se venden POR KILO: ahí sí decí "40 kg".
- Cada resultado de herramienta trae el campo "unidad_stock" o el tipo del producto: respetalo siempre.

BÚSQUEDA DE PRODUCTOS:
- Si search_product devuelve "sugerencias" (no hubo coincidencia exacta), decile al usuario que no encontraste ese nombre exacto y listale las opciones parecidas numeradas para que elija cuál quiso decir. NO asumas una por tu cuenta.
- Si el usuario responde con un número ("1", "2", "la 1", "el primero") o con el nombre de una opción después de que ofreciste sugerencias, eso significa que ELIGIÓ esa opción: llamá a search_product con el nombre exacto de esa opción y respondé la pregunta original que tenía pendiente (ej: el stock que había preguntado). Nunca le pidas que reformule.
- Si una respuesta corta del usuario no se entiende, mirá los mensajes anteriores de la conversación para deducir a qué se refiere antes de pedir aclaración.`;

// Cliente de Supabase. Preferimos service_role (bypass de RLS, acceso total) si
// está configurado; si no, caemos al JWT del usuario (respeta RLS).
function makeSupabase(token) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════

function cutoffIso(offsetHours) {
  // Marca de tiempo Argentina (UTC-3) en formato 'YYYY-MM-DD HH:MM:SS'
  const d = new Date(Date.now() - offsetHours * 3600e3 - 3 * 3600e3);
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function startOfTodayIso() {
  const d = new Date(Date.now() - 3 * 3600e3);
  return d.toISOString().slice(0, 10) + " 00:00:00";
}
function startOfPeriodIso(period) {
  const now = new Date(Date.now() - 3 * 3600e3);
  if (period === "hoy") return startOfTodayIso();
  if (period === "ayer") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return y.toISOString().slice(0, 10) + " 00:00:00";
  }
  if (period === "semana") {
    const c = new Date(now);
    c.setDate(c.getDate() - 6);
    return c.toISOString().slice(0, 10) + " 00:00:00";
  }
  if (period === "mes") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10) + " 00:00:00";
  }
  if (period === "mes_anterior") {
    return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10) + " 00:00:00";
  }
  return "1970-01-01 00:00:00";
}
// Normaliza para comparar: minúsculas y sin tildes ("Azúcar" -> "azucar")
function normalizeText(s) {
  // Minusculas + NFD, y filtramos las marcas diacriticas (code points 0x300-0x36F)
  // caracter por caracter para no depender de regex con literales Unicode.
  const decomposed = String(s || "").toLowerCase().normalize("NFD");
  let out = "";
  for (const ch of decomposed) {
    const c = ch.codePointAt(0);
    if (c >= 0x300 && c <= 0x36f) continue; // tilde, dieresis, virgulilla, etc.
    out += ch;
  }
  return out.replace(/\s+/g, " ").trim(); // colapsa espacios dobles
}

// Distancia de Levenshtein (cantidad de letras de diferencia)
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[n];
}

// Similitud 0..1 entre dos textos ya normalizados
function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
}

// Marca de tiempo AR ('YYYY-MM-DD HH:MM:SS'), igual que el resto de la app,
// para que el sync de la compu aplique bien los cambios hechos por el chat.
function nowAR() {
  return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
}

// Stock total actual de un producto (suma de fardos vivos)
async function batchTotal(supabase, productUuid) {
  const { data } = await supabase
    .from("product_batches")
    .select("quantity")
    .eq("product_uuid", productUuid)
    .eq("is_deleted", 0);
  return (data || []).reduce((a, b) => a + Number(b.quantity || 0), 0);
}

function endOfPeriodIso(period) {
  const now = new Date(Date.now() - 3 * 3600e3);
  if (period === "ayer") return startOfTodayIso();
  if (period === "mes_anterior") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10) + " 00:00:00";
  }
  return null; // sin límite superior
}

// ═══════════════════════════════════════════════════════════════════════
//  DEFINICIÓN DE HERRAMIENTAS PARA GEMINI
// ═══════════════════════════════════════════════════════════════════════

const tools = [
  {
    functionDeclarations: [
      {
        name: "get_recent_sales",
        description: "Devuelve las ventas de las últimas N horas. Útil para 'qué se vendió en la última hora', 'qué vendí hoy', etc.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            hours: { type: Type.NUMBER, description: "Cantidad de horas hacia atrás (1, 2, 24, etc.). Si el usuario dice 'hoy' usá 24, si dice 'última hora' usá 1." },
          },
          required: ["hours"],
        },
      },
      {
        name: "get_sales_summary",
        description: "Resumen de ventas: total vendido, cantidad de ventas, ganancia, ticket promedio. Para un período: hoy, ayer, semana, mes, mes_anterior.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            period: { type: Type.STRING, description: "hoy | ayer | semana | mes | mes_anterior" },
          },
          required: ["period"],
        },
      },
      {
        name: "get_top_selling",
        description: "Productos más vendidos en un período. Devuelve top 5.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            period: { type: Type.STRING, description: "hoy | semana | mes | mes_anterior | todo" },
          },
          required: ["period"],
        },
      },
      {
        name: "search_account",
        description: "Busca una cuenta (cliente que compra a fiado) por nombre parcial. Devuelve la lista de coincidencias con id.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "Nombre o parte del nombre a buscar." },
          },
          required: ["query"],
        },
      },
      {
        name: "get_account_balance",
        description: "Cuánto debe una cuenta (saldo pendiente). Primero buscá con search_account para conseguir el account_id.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            account_id: { type: Type.STRING, description: "id de la cuenta (obtenido de search_account)" },
          },
          required: ["account_id"],
        },
      },
      {
        name: "get_account_sales",
        description: "Movimientos de una cuenta (últimas compras y cierres).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            account_id: { type: Type.STRING },
            limit: { type: Type.NUMBER, description: "Cantidad de últimos movimientos a devolver (default 10)" },
          },
          required: ["account_id"],
        },
      },
      {
        name: "search_product",
        description: "Busca un producto por nombre (tolera errores de tipeo y tildes). Devuelve 'encontrados' con tipo, precio, costo, stock y unidad_stock ('unidades' para comunes, 'kg' para por peso). Si no hay coincidencia exacta devuelve 'sugerencias' con nombres parecidos: en ese caso ofrecé las opciones al usuario para que elija.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "Nombre o parte del nombre del producto." },
          },
          required: ["query"],
        },
      },
      {
        name: "get_low_stock",
        description: "Productos con stock bajo (menos o igual a 10 unidades o kg).",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "get_expiring_products",
        description: "Productos que vencen en los próximos N días.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            days: { type: Type.NUMBER, description: "Cantidad de días hacia adelante (default 14)" },
          },
        },
      },
      {
        name: "get_inventory_value",
        description: "Valor total del inventario al costo y al precio de venta.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  EJECUCIÓN DE HERRAMIENTAS (consultas a Supabase)
// ═══════════════════════════════════════════════════════════════════════

async function runTool(name, args, supabase) {
  try {
    // Modo demo: solo lectura. Bloqueamos cualquier herramienta de modificación
    // aunque, por diseño, ya no se declaran para el modelo.
    if (["update_product_info", "add_stock_batch", "set_stock"].includes(name)) {
      return { error: "Demo de solo lectura: en esta demostración no se pueden modificar productos." };
    }

    if (name === "get_recent_sales") {
      const since = cutoffIso(Number(args.hours || 1));
      const { data, error } = await supabase
        .from("sales")
        .select("product_name, quantity, total_price, product_type, payment_method, account_id, created_at")
        .gte("created_at", since)
        .eq("is_deleted", 0)
        .neq("product_type", "account_close")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return { error: error.message };
      const total = (data || []).reduce((a, s) => a + Number(s.total_price || 0), 0);
      return { since, count: data?.length || 0, total, sales: data || [] };
    }

    if (name === "get_sales_summary") {
      const from = startOfPeriodIso(args.period);
      const to = endOfPeriodIso(args.period);
      let q = supabase
        .from("sales")
        .select("total_price, quantity, product_type, product_id, product_name, sale_group_id, uuid, account_id")
        .gte("created_at", from)
        .eq("is_deleted", 0)
        .neq("product_type", "account_close");
      if (to) q = q.lt("created_at", to);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const list = data || [];

      const [{ data: prods }, { data: wps }] = await Promise.all([
        supabase.from("products").select("id, uuid, name, cost_price"),
        supabase.from("weighted_products").select("id, uuid, name, cost_price_kg"),
      ]);

      const findCost = (s) => {
        if (s.product_type === "custom") return 0;
        const arr = s.product_type === "peso" ? (wps || []) : (prods || []);
        const byId = s.product_id != null ? arr.find((p) => String(p.id) === String(s.product_id)) : null;
        const byName = s.product_name ? arr.find((p) => p.name === s.product_name) : null;
        const p = byId || byName;
        return Number((s.product_type === "peso" ? p?.cost_price_kg : p?.cost_price) || 0);
      };

      const total = list.reduce((a, s) => a + Number(s.total_price || 0), 0);
      const costo = list.reduce((a, s) => a + Number(s.quantity || 0) * findCost(s), 0);
      const ganancia = total - costo;
      const ventas = new Set(list.map((s) => s.sale_group_id || s.uuid)).size;
      const ticket = ventas ? total / ventas : 0;
      const caja = list.filter((s) => !s.account_id).reduce((a, s) => a + Number(s.total_price || 0), 0);
      const cuentas = total - caja;
      const margen = total ? (ganancia / total) * 100 : 0;
      return { period: args.period, total, costo, ganancia, ventas, ticket, caja, cuentas, margen };
    }

    if (name === "get_top_selling") {
      const from = startOfPeriodIso(args.period);
      const to = endOfPeriodIso(args.period);
      let q = supabase
        .from("sales")
        .select("product_name, quantity, product_type")
        .gte("created_at", from)
        .eq("is_deleted", 0)
        .neq("product_type", "account_close")
        .neq("product_type", "custom");
      if (to) q = q.lt("created_at", to);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const map = {};
      for (const s of data || []) {
        const k = `${s.product_name}||${s.product_type === "peso" ? "kg" : "u"}`;
        if (!map[k]) map[k] = { name: s.product_name, unit: s.product_type === "peso" ? "kg" : "u", qty: 0 };
        map[k].qty += Number(s.quantity || 0);
      }
      const top = Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
      return { period: args.period, top };
    }

    if (name === "search_account") {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, uuid, name, last_name, phone, gmail")
        .eq("is_deleted", 0)
        .or(`name.ilike.%${args.query}%,last_name.ilike.%${args.query}%`)
        .limit(10);
      if (error) return { error: error.message };
      return { accounts: data || [] };
    }

    if (name === "get_account_balance") {
      const { data: sales, error } = await supabase
        .from("sales")
        .select("total_price, product_type")
        .eq("account_id", String(args.account_id))
        .eq("is_deleted", 0)
        .order("created_at", { ascending: false });
      if (error) return { error: error.message };
      const compras = (sales || [])
        .filter((s) => s.product_type !== "account_close")
        .reduce((a, s) => a + Number(s.total_price || 0), 0);
      const pagos = (sales || [])
        .filter((s) => s.product_type === "account_close")
        .reduce((a, s) => a + Number(s.total_price || 0), 0);
      return { compras, pagos, saldo: compras - pagos };
    }

    if (name === "get_account_sales") {
      const { data, error } = await supabase
        .from("sales")
        .select("created_at, product_name, quantity, total_price, product_type, payment_method")
        .eq("account_id", String(args.account_id))
        .eq("is_deleted", 0)
        .order("created_at", { ascending: false })
        .limit(Number(args.limit || 10));
      if (error) return { error: error.message };
      return { sales: data || [] };
    }

    if (name === "search_product") {
      const [{ data: prods, error: e1 }, { data: wps, error: e2 }] = await Promise.all([
        supabase
          .from("products")
          .select("id, uuid, name, category, cost_price, unit_price, quantity, barcode")
          .eq("is_deleted", 0),
        supabase
          .from("weighted_products")
          .select("id, uuid, name, category, cost_price_kg, price_kg, stock, barcode")
          .eq("is_deleted", 0),
      ]);
      if (e1 || e2) return { error: e1?.message || e2?.message };

      // Unificamos con el tipo y la unidad EXPLÍCITOS para que el modelo no confunda u con kg
      const all = [
        ...(prods || []).map((p) => ({
          tipo: "comun", se_vende_por: "unidad",
          product_uuid: p.uuid, // interno: para update_product_info / add_stock_batch / set_stock
          name: p.name, category: p.category,
          precio_venta: p.unit_price, costo: p.cost_price,
          stock: p.quantity, unidad_stock: "unidades",
          barcode: p.barcode,
        })),
        ...(wps || []).map((w) => ({
          tipo: "por_peso", se_vende_por: "kg",
          product_uuid: w.uuid,
          name: w.name, category: w.category,
          precio_venta_kg: w.price_kg, costo_kg: w.cost_price_kg,
          stock: w.stock, unidad_stock: "kg",
          barcode: w.barcode,
        })),
      ];

      const q = normalizeText(args.query);
      const qWords = q.split(" ").filter(Boolean);

      // 1) Coincidencia: el nombre contiene la frase completa O todas las palabras
      //    de la consulta (en cualquier orden). Sin tildes ni mayúsculas.
      const contains = all.filter((p) => {
        const n = normalizeText(p.name);
        return n.includes(q) || qWords.every((w) => n.includes(w));
      });
      if (contains.length > 0) return { encontrados: contains.slice(0, 10) };

      // 2) Búsqueda difusa: tolera errores de tipeo ("hairna" -> "harina")
      const scored = all
        .map((p) => {
          const n = normalizeText(p.name);
          let score = similarity(n, q);
          for (const w of n.split(/\s+/)) score = Math.max(score, similarity(w, q));
          return { p, score };
        })
        .filter((x) => x.score >= 0.55)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (scored.length === 0) {
        return { encontrados: [], mensaje: "No hay ningún producto con ese nombre ni con nombre parecido." };
      }
      return {
        encontrados: [],
        sin_coincidencia_exacta: true,
        sugerencias: scored.map((x) => x.p),
        instruccion: "Decile al usuario que no encontraste ese nombre exacto y ofrecele estas opciones parecidas para que elija.",
      };
    }

    if (name === "get_low_stock") {
      const [{ data: prods }, { data: wps }] = await Promise.all([
        supabase.from("products").select("name, quantity, unit_price").eq("is_deleted", 0).lte("quantity", 10),
        supabase.from("weighted_products").select("name, stock, price_kg").eq("is_deleted", 0).lte("stock", 10),
      ]);
      return {
        productos: (prods || []).map((p) => ({ name: p.name, stock: p.quantity, unidad: "u", precio: p.unit_price })),
        por_peso: (wps || []).map((p) => ({ name: p.name, stock: p.stock, unidad: "kg", precio: p.price_kg })),
      };
    }

    if (name === "get_expiring_products") {
      const days = Number(args.days || 14);
      const limit = new Date(Date.now() + days * 86400e3).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("product_batches")
        .select("product_uuid, product_source, quantity, expiry_date")
        .eq("is_deleted", 0)
        .not("expiry_date", "is", null)
        .lte("expiry_date", limit)
        .order("expiry_date", { ascending: true });
      if (error) return { error: error.message };
      const list = data || [];
      const uuids = [...new Set(list.map((b) => b.product_uuid))];
      const [{ data: prods }, { data: wps }] = await Promise.all([
        supabase.from("products").select("uuid, name").in("uuid", uuids),
        supabase.from("weighted_products").select("uuid, name").in("uuid", uuids),
      ]);
      const nameOf = (uuid) => (prods?.find((p) => p.uuid === uuid) || wps?.find((p) => p.uuid === uuid))?.name || "—";
      const items = list.slice(0, 20).map((b) => ({
        producto: nameOf(b.product_uuid),
        cantidad: b.quantity,
        vence: b.expiry_date,
      }));
      return { items, total: list.length };
    }

    if (name === "get_inventory_value") {
      const [{ data: prods }, { data: wps }] = await Promise.all([
        supabase.from("products").select("cost_price, unit_price, quantity").eq("is_deleted", 0),
        supabase.from("weighted_products").select("cost_price_kg, price_kg, stock").eq("is_deleted", 0),
      ]);
      const costo =
        (prods || []).reduce((a, p) => a + Number(p.cost_price || 0) * Number(p.quantity || 0), 0) +
        (wps || []).reduce((a, w) => a + Number(w.cost_price_kg || 0) * Number(w.stock || 0), 0);
      const venta =
        (prods || []).reduce((a, p) => a + Number(p.unit_price || 0) * Number(p.quantity || 0), 0) +
        (wps || []).reduce((a, w) => a + Number(w.price_kg || 0) * Number(w.stock || 0), 0);
      return { valor_al_costo: costo, valor_al_precio_venta: venta, ganancia_potencial: venta - costo };
    }

    // ─── HERRAMIENTAS DE MODIFICACIÓN (solo productos) ────────────────────
    // Nota de conflicto: si la compu tiene ese registro con cambios sin subir,
    // el sync de la compu pisa lo de la nube ("la compu gana") — igual que las
    // ediciones hechas desde las pantallas del celu.

    if (name === "update_product_info") {
      const table = args.tipo === "por_peso" ? "weighted_products" : "products";
      const updates = {};
      if (args.new_name != null && String(args.new_name).trim()) updates.name = String(args.new_name).trim();
      if (args.category != null && String(args.category).trim()) updates.category = String(args.category).trim();
      if (args.sale_price != null) {
        const v = Number(args.sale_price);
        if (isNaN(v) || v < 0) return { error: "Precio de venta inválido" };
        updates[table === "products" ? "unit_price" : "price_kg"] = v;
      }
      if (args.cost_price != null) {
        const v = Number(args.cost_price);
        if (isNaN(v) || v < 0) return { error: "Costo inválido" };
        updates[table === "products" ? "cost_price" : "cost_price_kg"] = v;
      }
      if (Object.keys(updates).length === 0) return { error: "No se indicó ningún cambio" };
      updates.updated_at = nowAR();

      const { data, error } = await supabase
        .from(table)
        .update(updates)
        .eq("uuid", args.product_uuid)
        .eq("is_deleted", 0)
        .select();
      if (error) return { error: error.message };
      if (!data || data.length === 0) return { error: "Producto no encontrado (¿el uuid es el que devolvió search_product?)" };
      const p = data[0];
      return {
        ok: true,
        producto: p.name,
        valores_actuales: table === "products"
          ? { precio_venta: p.unit_price, costo: p.cost_price, category: p.category }
          : { precio_venta_kg: p.price_kg, costo_kg: p.cost_price_kg, category: p.category },
      };
    }

    if (name === "add_stock_batch") {
      const source = args.tipo === "por_peso" ? "weighted_products" : "products";
      const qty = Number(args.quantity);
      if (!qty || qty <= 0) return { error: "La cantidad a sumar debe ser mayor a 0" };

      const { data: prods, error: pe } = await supabase
        .from(source).select("uuid, name").eq("uuid", args.product_uuid).eq("is_deleted", 0);
      if (pe) return { error: pe.message };
      if (!prods || prods.length === 0) return { error: "Producto no encontrado" };

      const { error } = await supabase.from("product_batches").insert({
        uuid: crypto.randomUUID(),
        product_uuid: args.product_uuid,
        product_source: source,
        quantity: qty,
        expiry_date: args.expiry_date || null,
        entry_date: nowAR(),
        is_deleted: 0,
        created_at: nowAR(),
        updated_at: nowAR(),
      });
      if (error) return { error: error.message };

      const total = await batchTotal(supabase, args.product_uuid);
      return {
        ok: true, producto: prods[0].name, sumado: qty,
        stock_total: total, unidad: source === "products" ? "unidades" : "kg",
        vencimiento: args.expiry_date || "sin vencimiento",
      };
    }

    if (name === "set_stock") {
      const source = args.tipo === "por_peso" ? "weighted_products" : "products";
      const target = Number(args.new_total);
      if (isNaN(target) || target < 0) return { error: "El stock nuevo debe ser 0 o más" };

      const { data: prods, error: pe } = await supabase
        .from(source).select("uuid, name").eq("uuid", args.product_uuid).eq("is_deleted", 0);
      if (pe) return { error: pe.message };
      if (!prods || prods.length === 0) return { error: "Producto no encontrado" };

      // Fardos vivos en orden FIFO (vence antes primero, sin vencimiento al final)
      const { data: batches, error: be } = await supabase
        .from("product_batches")
        .select("uuid, quantity, expiry_date, entry_date")
        .eq("product_uuid", args.product_uuid)
        .eq("is_deleted", 0)
        .gt("quantity", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .order("entry_date", { ascending: true });
      if (be) return { error: be.message };

      const current = (batches || []).reduce((a, b) => a + Number(b.quantity || 0), 0);
      const delta = target - current;

      if (Math.abs(delta) < 1e-9) {
        return { ok: true, producto: prods[0].name, mensaje: "El stock ya estaba en ese valor", stock_total: current };
      }

      if (delta > 0) {
        // Subir: la diferencia entra como fardo nuevo sin vencimiento
        const { error } = await supabase.from("product_batches").insert({
          uuid: crypto.randomUUID(),
          product_uuid: args.product_uuid,
          product_source: source,
          quantity: delta,
          expiry_date: null,
          entry_date: nowAR(),
          is_deleted: 0,
          created_at: nowAR(),
          updated_at: nowAR(),
        });
        if (error) return { error: error.message };
      } else {
        // Bajar: descontar FIFO de los fardos más viejos
        let remaining = -delta;
        for (const b of batches) {
          if (remaining <= 1e-9) break;
          const take = Math.min(Number(b.quantity), remaining);
          const { error } = await supabase
            .from("product_batches")
            .update({ quantity: Number(b.quantity) - take, updated_at: nowAR() })
            .eq("uuid", b.uuid);
          if (error) return { error: error.message };
          remaining -= take;
        }
      }

      return {
        ok: true, producto: prods[0].name,
        stock_anterior: current, stock_total: target,
        unidad: source === "products" ? "unidades" : "kg",
      };
    }

    return { error: `Herramienta desconocida: ${name}` };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta GEMINI_API_KEY en las variables de entorno de Vercel." });
  }

  try {
    const { message, history = [], supabase_token } = req.body || {};
    if (!message?.trim()) {
      return res.status(400).json({ error: "Falta el mensaje." });
    }

    // ─── AUTENTICACIÓN OBLIGATORIA ──────────────────────────────────────
    // Solo usuarios logueados en la app pueden usar el asistente. Sin esto,
    // cualquiera que descubra la URL podría consultar ventas/cuentas de
    // clientes y modificar productos (y gastar la cuota de Gemini).
    if (!supabase_token) {
      return res.status(401).json({ error: "Tenés que iniciar sesión para usar el asistente." });
    }
    const authUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const authAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const authClient = createClient(authUrl, authAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(supabase_token);
    if (authError || !authData?.user) {
      return res.status(401).json({ error: "Sesión vencida o inválida. Cerrá sesión y volvé a entrar." });
    }

    const supabase = makeSupabase(supabase_token);
    const ai = new GoogleGenAI({ apiKey });

    // Historial -> formato de contenidos de Gemini
    const contents = [];
    for (const m of history.slice(-10)) {
      contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] });
    }
    contents.push({ role: "user", parts: [{ text: message }] });

    // Llama a Gemini probando modelos alternativos si el principal está
    // saturado (503) o rate-limited (429).
    async function callGemini() {
      let lastErr;
      for (const model of MODELS) {
        try {
          return await ai.models.generateContent({
            model,
            contents,
            config: { systemInstruction: SYSTEM_INSTRUCTION, tools },
          });
        } catch (e) {
          lastErr = e;
          const msg = String(e?.message || e);
          // Si es saturación o rate limit, probamos el siguiente modelo
          if (/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(msg)) continue;
          throw e; // otros errores (clave inválida, etc.) se propagan directo
        }
      }
      throw lastErr;
    }

    // Loop: llamar a Gemini, si pide tools ejecutarlas y volver a preguntar.
    let finalText = "";
    for (let step = 0; step < 6; step++) {
      const response = await callGemini();

      const cand = response?.candidates?.[0];
      const parts = cand?.content?.parts || [];
      const fnCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

      if (fnCalls.length === 0) {
        finalText = response.text || parts.map((p) => p.text || "").join("").trim();
        break;
      }

      // Agregar el turno del modelo (con las llamadas a funciones) al historial
      contents.push({ role: "model", parts });

      // Ejecutar cada tool y armar el turno de respuesta
      const toolResponseParts = [];
      for (const call of fnCalls) {
        const result = await runTool(call.name, call.args || {}, supabase);
        toolResponseParts.push({
          functionResponse: { name: call.name, response: result },
        });
      }
      contents.push({ role: "user", parts: toolResponseParts });
    }

    if (!finalText) {
      finalText = "No pude generar una respuesta. Probá reformulando la pregunta.";
    }

    return res.status(200).json({ reply: finalText });
  } catch (e) {
    console.error("chat error:", e);
    const msg = String(e?.message || e);
    if (/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(msg)) {
      return res.status(503).json({
        error: "El asistente está saturado en este momento (mucha demanda en Google). Esperá unos minutos y probá de nuevo.",
      });
    }
    return res.status(500).json({ error: msg });
  }
}
