import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { formatMoney, formatNum, stampUpdate, stampNew, newUuid, nowLocalAR } from "../utils";
import { SearchBar, Field, Fab, Modal, Loader, Toast, calcMargin, calcPriceFromMargin } from "./Products";
import BatchManager from "../components/BatchManager";
import { useConfirm } from "../components/Confirm";

const CATS = [
  { key: "frutas", label: "🍎 Frutas" },
  { key: "verduras", label: "🥬 Verduras" },
  { key: "carnes", label: "🥩 Carnes" },
  { key: "panaderia", label: "🥖 Panadería" },
  { key: "otros", label: "📦 Otros" },
];
const EMPTY = { name: "", category: "", cost_price_kg: "", price_kg: "", margin: "", stock: "", expiry_date: "" };

export default function Weighted() {
  const [items, setItems] = useState([]);
  const [stockMap, setStockMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState("");
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    const [{ data: prods }, { data: batches }] = await Promise.all([
      supabase.from("weighted_products").select("*").eq("is_deleted", 0).order("name"),
      supabase.from("product_batches").select("product_uuid, quantity").eq("product_source", "weighted_products").eq("is_deleted", 0),
    ]);
    const map = {};
    for (const b of batches || []) map[b.product_uuid] = (map[b.product_uuid] || 0) + Number(b.quantity || 0);
    setItems(prods || []);
    setStockMap(map);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  function flash(m) { setToast(m); setTimeout(() => setToast(""), 2500); }

  async function addItem() {
    if (!addForm.name.trim()) return flash("Poné un nombre");
    if (!(await confirm({ title: "Agregar producto", message: `¿Guardar "${addForm.name.trim()}"?`, confirmText: "Agregar" }))) return;
    const stock = parseFloat(addForm.stock) || 0;
    const prod = stampNew();
    const { error } = await supabase.from("weighted_products").insert({
      name: addForm.name.trim(),
      category: addForm.category || null,
      cost_price_kg: Number(addForm.cost_price_kg) || 0,
      price_kg: Number(addForm.price_kg) || 0,
      stock,
      ...prod,
    });
    if (error) return flash("Error: " + error.message);
    if (stock > 0) {
      await supabase.from("product_batches").insert({
        uuid: newUuid(), product_uuid: prod.uuid, product_source: "weighted_products",
        quantity: stock, expiry_date: addForm.expiry_date || null, entry_date: nowLocalAR(),
        is_deleted: 0, created_at: nowLocalAR(), updated_at: nowLocalAR(),
      });
    }
    setShowAdd(false); setAddForm(EMPTY); await load();
    flash("Producto agregado ✓");
  }

  const filtered = useMemo(() => {
    const t = search.toLowerCase().trim();
    return t ? items.filter((p) => p.name.toLowerCase().includes(t)) : items;
  }, [items, search]);

  return (
    <div className="space-y-3">
      <SearchBar value={search} onChange={setSearch} count={filtered.length} />

      {loading ? <Loader /> : filtered.length === 0 ? (
        <p className="text-center text-[#94a3b8] py-10">No hay productos por peso</p>
      ) : filtered.map((p) => (
        <button key={p.uuid} onClick={() => setDetail(p)} className="w-full text-left bg-white rounded-2xl p-4 border border-[#e2e8f0] active:bg-[#f8f9fb]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="font-bold text-[#1e293b]">{p.name}</p>
              <p className="text-xs text-[#64748b]">{p.category || "Sin categoría"} · Stock: {formatNum(stockMap[p.uuid] || 0)} kg</p>
              <div className="mt-2 flex gap-4">
                <span className="text-sm"><span className="text-[#64748b]">Costo/kg </span><b className="text-[#ef4444]">{formatMoney(p.cost_price_kg)}</b></span>
                <span className="text-sm"><span className="text-[#64748b]">Venta/kg </span><b className="text-[#10b981]">{formatMoney(p.price_kg)}</b></span>
              </div>
            </div>
            <span className="material-symbols-outlined text-[#94a3b8]">chevron_right</span>
          </div>
        </button>
      ))}

      <Fab onClick={() => { setAddForm(EMPTY); setShowAdd(true); }} />

      {showAdd && (
        <Modal title="Nuevo producto por peso" onClose={() => setShowAdd(false)}>
          <Field label="Nombre *" value={addForm.name} onChange={(v) => setAddForm({ ...addForm, name: v })} text />
          <div>
            <label className="block text-xs text-[#64748b] mb-1">Categoría</label>
            <select value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-xl bg-white">
              <option value="">Seleccionar</option>
              {CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field
              label="Costo/kg $"
              value={addForm.cost_price_kg}
              onChange={(v) => {
                const newMargin = v && addForm.price_kg ? calcMargin(v, addForm.price_kg) : addForm.margin;
                setAddForm({ ...addForm, cost_price_kg: v, margin: newMargin });
              }}
            />
            <Field
              label="Venta/kg $"
              value={addForm.price_kg}
              onChange={(v) => {
                const newMargin = addForm.cost_price_kg && v ? calcMargin(addForm.cost_price_kg, v) : "";
                setAddForm({ ...addForm, price_kg: v, margin: newMargin });
              }}
            />
            <Field
              label="Margen %"
              value={addForm.margin}
              onChange={(v) => {
                const newPrice = addForm.cost_price_kg && v !== "" ? calcPriceFromMargin(addForm.cost_price_kg, v) : addForm.price_kg;
                setAddForm({ ...addForm, margin: v, price_kg: newPrice });
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Stock inicial (kg)" value={addForm.stock} onChange={(v) => setAddForm({ ...addForm, stock: v })} />
            <div>
              <label className="block text-xs text-[#64748b] mb-1">Vencimiento</label>
              <input type="date" value={addForm.expiry_date} onChange={(e) => setAddForm({ ...addForm, expiry_date: e.target.value })}
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-xl" />
            </div>
          </div>
          <p className="text-xs text-[#94a3b8]">El stock inicial se carga como la primera tanda.</p>
          <button onClick={addItem} className="w-full py-3 bg-[#0040a1] text-white rounded-xl font-bold">Agregar</button>
        </Modal>
      )}

      {detail && <WeightedDetail product={detail} onClose={() => setDetail(null)} onSaved={(m) => { flash(m); load(); }} />}
      {toast && <Toast text={toast} />}
    </div>
  );
}

function WeightedDetail({ product, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: product.name || "", category: product.category || "",
    cost_price_kg: String(product.cost_price_kg ?? ""), price_kg: String(product.price_kg ?? ""),
    margin: calcMargin(product.cost_price_kg, product.price_kg),
  });
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  async function saveFields() {
    if (!form.name.trim()) return;
    if (!(await confirm({ title: "Guardar cambios", message: `¿Actualizar "${form.name.trim()}"?`, confirmText: "Guardar" }))) return;
    setSaving(true);
    await supabase.from("weighted_products").update({
      name: form.name.trim(),
      category: form.category || null,
      cost_price_kg: Number(form.cost_price_kg) || 0,
      price_kg: Number(form.price_kg) || 0,
      ...stampUpdate(),
    }).eq("uuid", product.uuid);
    setSaving(false);
    onSaved("Producto actualizado ✓");
    onClose();
  }

  async function darDeBaja() {
    if (!(await confirm({ title: "Dar de baja", message: `¿Dar de baja "${product.name}"? El historial se conserva.`, confirmText: "Dar de baja", danger: true }))) return;
    await supabase.from("weighted_products").update({ is_deleted: 1, ...stampUpdate() }).eq("uuid", product.uuid);
    onSaved("Producto dado de baja");
    onClose();
  }

  return (
    <Modal title={product.name} onClose={onClose}>
      <Field label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} text />
      <div>
        <label className="block text-xs text-[#64748b] mb-1">Categoría</label>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="w-full px-3 py-2 border border-[#e2e8f0] rounded-xl bg-white">
          <option value="">Sin categoría</option>
          {CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field
          label="Costo/kg $"
          value={form.cost_price_kg}
          onChange={(v) => {
            const newMargin = v && form.price_kg ? calcMargin(v, form.price_kg) : form.margin;
            setForm({ ...form, cost_price_kg: v, margin: newMargin });
          }}
        />
        <Field
          label="Venta/kg $"
          value={form.price_kg}
          onChange={(v) => {
            const newMargin = form.cost_price_kg && v ? calcMargin(form.cost_price_kg, v) : "";
            setForm({ ...form, price_kg: v, margin: newMargin });
          }}
        />
        <Field
          label="Margen %"
          value={form.margin}
          onChange={(v) => {
            const newPrice = form.cost_price_kg && v !== "" ? calcPriceFromMargin(form.cost_price_kg, v) : form.price_kg;
            setForm({ ...form, margin: v, price_kg: newPrice });
          }}
        />
      </div>
      <button onClick={saveFields} disabled={saving} className="w-full py-2.5 bg-[#0040a1] text-white rounded-xl font-bold">
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>

      <BatchManager productUuid={product.uuid} productSource="weighted_products" unit="kg" step="0.1" />

      <button onClick={darDeBaja} className="w-full py-2.5 bg-white border border-[#ef4444] text-[#ef4444] rounded-xl font-semibold">
        Dar de baja el producto
      </button>
    </Modal>
  );
}
