// Cuaderno (mobile): log de productos cargados hoy y ayer.
// Lee de Supabase (la nube). No registra nada nuevo — filtra por las fechas
// que ya existen en products.created_at, weighted_products.created_at y
// product_batches.entry_date. Pasados 2 días deja de mostrarse aquí.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { formatMoney, formatNum } from "../utils";
import { Loader } from "./Products";
import Proveedores from "./Proveedores";

function toDate(s) {
  if (!s) return new Date(0);
  return new Date(String(s).replace(" ", "T"));
}

function dayLabel(d) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (d >= startToday) return "Hoy";
  if (d >= yesterday) return "Ayer";
  return d.toLocaleDateString("es-AR");
}

function timeOf(d) {
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export default function Cuaderno() {
  const [products, setProducts] = useState([]);
  const [weighted, setWeighted] = useState([]);
  const [batches, setBatches] = useState([]);
  // Nombres de productos padre de los fardos (productos viejos que aún tienen movimientos)
  const [parentNames, setParentNames] = useState({}); // { uuid: { name, source } }
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("movimientos"); // "movimientos" | "proveedores"

  async function load() {
    setLoading(true);
    // Solo traemos lo de los últimos 2 días (más liviano que traer todo)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 2);
    cutoff.setHours(0, 0, 0, 0);
    const sinceISO = cutoff.toISOString().slice(0, 19).replace("T", " ");

    const [p, w, b] = await Promise.all([
      supabase.from("products").select("*").eq("is_deleted", 0).gte("created_at", sinceISO),
      supabase.from("weighted_products").select("*").eq("is_deleted", 0).gte("created_at", sinceISO),
      supabase.from("product_batches").select("*").eq("is_deleted", 0).gte("entry_date", sinceISO),
    ]);
    const prodList = p.data || [];
    const wpList = w.data || [];
    const batchList = b.data || [];
    setProducts(prodList);
    setWeighted(wpList);
    setBatches(batchList);

    // Resolver nombres de productos padre que NO estén en la lista de "nuevos"
    // (porque pueden ser productos viejos a los que les estás sumando un fardo hoy)
    const knownUuids = new Set([...prodList.map((x) => x.uuid), ...wpList.map((x) => x.uuid)]);
    const missingCommon = [];
    const missingWeighted = [];
    for (const bt of batchList) {
      if (!bt.product_uuid || knownUuids.has(bt.product_uuid)) continue;
      if (bt.product_source === "weighted_products") missingWeighted.push(bt.product_uuid);
      else missingCommon.push(bt.product_uuid);
    }

    const names = {};
    if (missingCommon.length) {
      const { data } = await supabase
        .from("products")
        .select("uuid, name")
        .in("uuid", [...new Set(missingCommon)]);
      for (const r of data || []) names[r.uuid] = { name: r.name, source: "products" };
    }
    if (missingWeighted.length) {
      const { data } = await supabase
        .from("weighted_products")
        .select("uuid, name")
        .in("uuid", [...new Set(missingWeighted)]);
      for (const r of data || []) names[r.uuid] = { name: r.name, source: "weighted_products" };
    }
    setParentNames(names);

    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const events = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 2);
    cutoff.setHours(0, 0, 0, 0);
    const items = [];

    // Productos comunes nuevos
    for (const p of products) {
      const d = toDate(p.created_at);
      if (d < cutoff) continue;
      items.push({
        id: `prod-${p.uuid}`,
        when: d,
        type: "product_new",
        title: p.name,
        subtitle: p.category || "Sin categoría",
        detail: `${formatMoney(p.cost_price)} → ${formatMoney(p.unit_price)}`,
        unit: `${p.quantity || 0} u`,
        icon: "inventory_2",
        color: "#0040a1",
      });
    }

    // Productos por peso nuevos
    for (const w of weighted) {
      const d = toDate(w.created_at);
      if (d < cutoff) continue;
      items.push({
        id: `wp-${w.uuid}`,
        when: d,
        type: "weighted_new",
        title: w.name,
        subtitle: w.category || "Sin categoría",
        detail: `${formatMoney(w.cost_price_kg)}/kg → ${formatMoney(w.price_kg)}/kg`,
        unit: `${formatNum(w.stock || 0)} kg`,
        icon: "scale",
        color: "#10b981",
      });
    }

    // Fardos sumados — saltamos la tanda inicial (ya aparece como producto nuevo)
    for (const b of batches) {
      const d = toDate(b.entry_date || b.created_at);
      if (d < cutoff) continue;

      const isWeighted = b.product_source === "weighted_products";
      const parent = (isWeighted ? weighted : products).find((x) => x.uuid === b.product_uuid);

      // No mostrar si el padre se creó casi al mismo tiempo (es la tanda inicial)
      if (parent) {
        const parentDate = toDate(parent.created_at);
        if (Math.abs(d - parentDate) < 5000) continue;
      }

      items.push({
        id: `batch-${b.uuid}`,
        when: d,
        type: "batch",
        title: parent?.name || "Producto",
        subtitle: isWeighted ? "Fardo (por peso)" : "Fardo (común)",
        detail: b.expiry_date ? `Vence ${b.expiry_date}` : "Sin vencimiento",
        unit: `+${isWeighted ? formatNum(b.quantity) + " kg" : b.quantity + " u"}`,
        icon: isWeighted ? "scale" : "inventory_2",
        color: "#f59e0b",
      });
    }

    items.sort((a, b) => b.when - a.when);
    return items;
  }, [products, weighted, batches]);

  // Agrupar por Hoy / Ayer
  const groups = useMemo(() => {
    const m = new Map();
    for (const ev of events) {
      const k = dayLabel(ev.when);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(ev);
    }
    return [...m.entries()];
  }, [events]);

  const totalNuevos = events.filter((e) => e.type !== "batch").length;
  const totalFardos = events.filter((e) => e.type === "batch").length;

  return (
    <div className="space-y-3">
      {/* Intro */}
      <div className="bg-white rounded-2xl p-4 border border-[#e2e8f0]">
        <p className="text-sm text-[#64748b]">
          Lo que cargaste <b className="text-[#1e293b]">hoy y ayer</b>. Después de 2 días deja de mostrarse acá (el producto sigue en el inventario).
        </p>
      </div>

      {/* Tabs: Movimientos (timeline de hoy/ayer) vs Proveedores (deuda) */}
      <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-[#e2e8f0]">
        <button
          onClick={() => setTab("movimientos")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === "movimientos" ? "bg-[#0040a1] text-white" : "text-[#64748b]"
          }`}
        >
          📋 Movimientos
        </button>
        <button
          onClick={() => setTab("proveedores")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tab === "proveedores" ? "bg-[#0040a1] text-white" : "text-[#64748b]"
          }`}
        >
          🚚 Proveedores
        </button>
      </div>

      {tab === "proveedores" ? (
        <Proveedores />
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-[#e2e8f0]">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[#0040a1] text-[18px]">inventory_2</span>
                <span className="text-xs text-[#64748b]">Productos nuevos</span>
              </div>
              <p className="text-2xl font-extrabold text-[#0040a1]">{totalNuevos}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-[#e2e8f0]">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[#f59e0b] text-[18px]">inbox</span>
                <span className="text-xs text-[#64748b]">Fardos sumados</span>
              </div>
              <p className="text-2xl font-extrabold text-[#f59e0b]">{totalFardos}</p>
            </div>
          </div>

          {/* Acción */}
          <button
            onClick={load}
            className="w-full py-2 bg-white border border-[#e2e8f0] rounded-xl text-sm text-[#0040a1] font-semibold flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Actualizar
          </button>

          {loading ? <Loader /> : events.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 border border-[#e2e8f0] text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#0040a1]/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl text-[#0040a1]">menu_book</span>
              </div>
              <p className="font-semibold text-[#1e293b]">No cargaste nada en los últimos 2 días</p>
              <p className="text-sm text-[#94a3b8] mt-1">Cuando agregues productos o sumes fardos, van a aparecer acá.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(([day, items]) => (
                <div key={day}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base font-bold text-[#1e293b]">{day}</h3>
                    <span className="text-xs text-[#94a3b8]">{items.length} {items.length === 1 ? "mov." : "movs."}</span>
                    <div className="flex-1 h-px bg-[#e2e8f0]" />
                  </div>
                  <div className="space-y-2">
                    {items.map((ev) => (
                      <div key={ev.id} className="bg-white border border-[#e2e8f0] rounded-2xl p-3 flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${ev.color}15` }}
                        >
                          <span className="material-symbols-outlined text-[20px]" style={{ color: ev.color }}>
                            {ev.icon}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-[#1e293b] text-sm truncate">{ev.title}</p>
                            <span className="text-[9px] text-[#94a3b8] shrink-0">{timeOf(ev.when)}</span>
                          </div>
                          <p className="text-xs text-[#64748b] truncate">
                            {ev.type === "batch" ? ev.subtitle : ev.subtitle}
                          </p>
                          <p className="text-[11px] text-[#94a3b8] truncate">{ev.detail}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-extrabold" style={{ color: ev.color }}>{ev.unit}</p>
                          <p className="text-[9px] text-[#94a3b8] uppercase font-semibold">
                            {ev.type === "batch" ? "Fardo" : "Nuevo"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
