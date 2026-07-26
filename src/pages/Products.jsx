import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { formatMoney, stampUpdate, stampNew, newUuid, nowLocalAR } from "../utils";
import BatchManager from "../components/BatchManager";
import BarcodeScanner from "../components/BarcodeScanner";
import { useConfirm } from "../components/Confirm";

const CATEGORIAS = ["Alimentos", "Limpieza", "Bazar", "Bebidas", "Perfumería"];
const EMPTY = { name: "", category: "", cost_price: "", unit_price: "", margin: "", barcode: "", stock: "", expiry_date: "" };

// Helpers de margen (compartidos con Weighted)
export const calcMargin = (cost, price) => {
  const c = Number(cost);
  const p = Number(price);
  if (!c || isNaN(c) || isNaN(p)) return "";
  return (((p - c) / c) * 100).toFixed(2);
};
export const calcPriceFromMargin = (cost, margin) => {
  const c = Number(cost);
  const m = Number(margin);
  if (!c || isNaN(c) || isNaN(m)) return "";
  return (c * (1 + m / 100)).toFixed(2);
};

export default function Products() {
  const [items, setItems] = useState([]);
  const [stockMap, setStockMap] = useState({}); // product_uuid -> total
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState("");
  const [scanning, setScanning] = useState(false);
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    const [{ data: prods }, { data: batches }] = await Promise.all([
      supabase.from("products").select("*").eq("is_deleted", 0).order("name"),
      supabase.from("product_batches").select("product_uuid, quantity").eq("product_source", "products").eq("is_deleted", 0),
    ]);
    const map = {};
    for (const b of batches || []) map[b.product_uuid] = (map[b.product_uuid] || 0) + Number(b.quantity || 0);
    setItems(prods || []);
    setStockMap(map);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  function flash(m) { setToast(m); setTimeout(() => setToast(""), 2500); }

  async function addProduct() {
    if (!addForm.name.trim()) return flash("Poné un nombre");
    if (!(await confirm({ title: "Agregar producto", message: `¿Guardar "${addForm.name.trim()}"?`, confirmText: "Agregar" }))) return;
    const stock = parseFloat(addForm.stock) || 0;
    const prod = stampNew();
    const { error } = await supabase.from("products").insert({
      name: addForm.name.trim(),
      category: addForm.category || null,
      cost_price: Number(addForm.cost_price) || 0,
      unit_price: Number(addForm.unit_price) || 0,
      quantity: Math.round(stock),
      barcode: addForm.barcode || null,
      expiry_date: addForm.expiry_date || null,
      ...prod,
    });
    if (error) return flash("Error: " + error.message);
    if (stock > 0) {
      await supabase.from("product_batches").insert({
        uuid: newUuid(), product_uuid: prod.uuid, product_source: "products",
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
        <p className="text-center text-[#94a3b8] py-10">No hay productos</p>
      ) : filtered.map((p) => (
        <button key={p.uuid} onClick={() => setDetail(p)} className="w-full text-left bg-white rounded-2xl p-4 border border-[#e2e8f0] active:bg-[#f8f9fb]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="font-bold text-[#1e293b]">{p.name}</p>
              <p className="text-xs text-[#64748b]">{p.category || "Sin categoría"} · Stock: {stockMap[p.uuid] || 0} u</p>
              <div className="mt-2 flex gap-4">
                <span className="text-sm"><span className="text-[#64748b]">Costo </span><b className="text-[#ef4444]">{formatMoney(p.cost_price)}</b></span>
                <span className="text-sm"><span className="text-[#64748b]">Venta </span><b className="text-[#10b981]">{formatMoney(p.unit_price)}</b></span>
              </div>
            </div>
            <span className="material-symbols-outlined text-[#94a3b8]">chevron_right</span>
          </div>
        </button>
      ))}

      <Fab onClick={() => { setAddForm(EMPTY); setShowAdd(true); }} />

      {showAdd && (
        <Modal title="Nuevo producto" onClose={() => setShowAdd(false)}>
          <Field label="Nombre *" value={addForm.name} onChange={(v) => setAddForm({ ...addForm, name: v })} text />
          <div>
            <label className="block text-xs text-[#64748b] mb-1">Categoría</label>
            <select value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-xl bg-white">
              <option value="">Seleccionar</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field
              label="Costo $"
              value={addForm.cost_price}
              onChange={(v) => {
                const newMargin = v && addForm.unit_price ? calcMargin(v, addForm.unit_price) : addForm.margin;
                setAddForm({ ...addForm, cost_price: v, margin: newMargin });
              }}
            />
            <Field
              label="Venta $"
              value={addForm.unit_price}
              onChange={(v) => {
                const newMargin = addForm.cost_price && v ? calcMargin(addForm.cost_price, v) : "";
                setAddForm({ ...addForm, unit_price: v, margin: newMargin });
              }}
            />
            <Field
              label="Margen %"
              value={addForm.margin}
              onChange={(v) => {
                const newPrice = addForm.cost_price && v !== "" ? calcPriceFromMargin(addForm.cost_price, v) : addForm.unit_price;
                setAddForm({ ...addForm, margin: v, unit_price: newPrice });
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Stock inicial (u)" value={addForm.stock} onChange={(v) => setAddForm({ ...addForm, stock: v })} />
            <div>
              <label className="block text-xs text-[#64748b] mb-1">Vencimiento</label>
              <input type="date" value={addForm.expiry_date} onChange={(e) => setAddForm({ ...addForm, expiry_date: e.target.value })}
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-xl" />
            </div>
          </div>
          <FieldWithScan
            label="Código de barras"
            value={addForm.barcode}
            onChange={(v) => setAddForm({ ...addForm, barcode: v })}
            onScan={() => setScanning(true)}
          />
          <p className="text-xs text-[#94a3b8]">El stock inicial se carga como el primer fardo. Después podés sumar más.</p>
          <button onClick={addProduct} className="w-full py-3 bg-[#0040a1] text-white rounded-xl font-bold">Agregar</button>
        </Modal>
      )}

      {detail && <ProductDetail product={detail} onClose={() => setDetail(null)} onSaved={(m) => { flash(m); load(); }} />}
      {scanning && (
        <BarcodeScanner
          onScan={(code) => { setAddForm((f) => ({ ...f, barcode: code })); setScanning(false); flash("Código leído ✓"); }}
          onClose={() => setScanning(false)}
        />
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}

function ProductDetail({ product, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: product.name || "", category: product.category || "",
    cost_price: String(product.cost_price ?? ""), unit_price: String(product.unit_price ?? ""),
    margin: calcMargin(product.cost_price, product.unit_price),
    barcode: product.barcode || "",
  });
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const confirm = useConfirm();

  async function saveFields() {
    if (!form.name.trim()) return;
    if (!(await confirm({ title: "Guardar cambios", message: `¿Actualizar "${form.name.trim()}"?`, confirmText: "Guardar" }))) return;
    setSaving(true);
    await supabase.from("products").update({
      name: form.name.trim(),
      category: form.category || null,
      cost_price: Number(form.cost_price) || 0,
      unit_price: Number(form.unit_price) || 0,
      barcode: form.barcode || null,
      ...stampUpdate(),
    }).eq("uuid", product.uuid);
    setSaving(false);
    onSaved("Producto actualizado ✓");
    onClose();
  }

  async function darDeBaja() {
    if (!(await confirm({ title: "Dar de baja", message: `¿Dar de baja "${product.name}"? El historial se conserva.`, confirmText: "Dar de baja", danger: true }))) return;
    await supabase.from("products").update({ is_deleted: 1, ...stampUpdate() }).eq("uuid", product.uuid);
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
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field
          label="Costo $"
          value={form.cost_price}
          onChange={(v) => {
            const newMargin = v && form.unit_price ? calcMargin(v, form.unit_price) : form.margin;
            setForm({ ...form, cost_price: v, margin: newMargin });
          }}
        />
        <Field
          label="Venta $"
          value={form.unit_price}
          onChange={(v) => {
            const newMargin = form.cost_price && v ? calcMargin(form.cost_price, v) : "";
            setForm({ ...form, unit_price: v, margin: newMargin });
          }}
        />
        <Field
          label="Margen %"
          value={form.margin}
          onChange={(v) => {
            const newPrice = form.cost_price && v !== "" ? calcPriceFromMargin(form.cost_price, v) : form.unit_price;
            setForm({ ...form, margin: v, unit_price: newPrice });
          }}
        />
      </div>
      <FieldWithScan
        label="Código de barras"
        value={form.barcode}
        onChange={(v) => setForm({ ...form, barcode: v })}
        onScan={() => setScanning(true)}
      />
      <button onClick={saveFields} disabled={saving} className="w-full py-2.5 bg-[#0040a1] text-white rounded-xl font-bold">
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>

      <BatchManager productUuid={product.uuid} productSource="products" unit="u" step="1" />

      <button onClick={darDeBaja} className="w-full py-2.5 bg-white border border-[#ef4444] text-[#ef4444] rounded-xl font-semibold">
        Dar de baja el producto
      </button>

      {scanning && (
        <BarcodeScanner
          onScan={(code) => { setForm((f) => ({ ...f, barcode: code })); setScanning(false); }}
          onClose={() => setScanning(false)}
        />
      )}
    </Modal>
  );
}

/* ── UI helpers compartidos (los usan Weighted, Accounts, History) ── */
export function SearchBar({ value, onChange, count }) {
  return (
    <div className="relative">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">search</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Buscar..."
        className="w-full pl-10 pr-4 py-3 bg-white border border-[#e2e8f0] rounded-xl focus:outline-none focus:border-[#0040a1]" />
      {count != null && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#94a3b8]">{count}</span>}
    </div>
  );
}
export function Field({ label, value, onChange, text }) {
  return (
    <div>
      <label className="block text-xs text-[#64748b] mb-1">{label}</label>
      <input type={text ? "text" : "number"} inputMode={text ? "text" : "decimal"} value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-[#e2e8f0] rounded-xl focus:outline-none focus:border-[#0040a1]" />
    </div>
  );
}
export function FieldWithScan({ label, value, onChange, onScan }) {
  return (
    <div>
      <label className="block text-xs text-[#64748b] mb-1">{label}</label>
      <div className="flex gap-2">
        <input type="text" inputMode="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 border border-[#e2e8f0] rounded-xl focus:outline-none focus:border-[#0040a1]" />
        <button type="button" onClick={onScan}
          className="px-3 py-2 bg-[#0040a1] text-white rounded-xl flex items-center justify-center active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
        </button>
      </div>
    </div>
  );
}
export function IconBtn({ icon, color, onClick }) {
  return (
    <button onClick={onClick} className="p-2 rounded-lg active:bg-[#f1f5f9]">
      <span className="material-symbols-outlined text-[20px]" style={{ color }}>{icon}</span>
    </button>
  );
}
export function Fab({ onClick }) {
  return (
    <button onClick={onClick}
      className="fixed right-5 bottom-24 z-30 w-14 h-14 rounded-full bg-[#0040a1] text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform">
      <span className="material-symbols-outlined text-[28px]">add</span>
    </button>
  );
}
export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between sticky -top-5 bg-white pt-1 pb-2 -mt-1">
          <h2 className="text-lg font-bold text-[#1e293b]">{title}</h2>
          <button onClick={onClose}><span className="material-symbols-outlined text-[#64748b]">close</span></button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Loader() {
  return <div className="flex justify-center py-16 text-[#64748b]"><span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span></div>;
}
export function Toast({ text }) {
  return <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-[#1e293b] text-white text-sm px-4 py-2 rounded-full shadow-lg">{text}</div>;
}
