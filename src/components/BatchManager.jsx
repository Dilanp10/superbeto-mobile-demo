import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { formatNum, nowLocalAR, newUuid } from "../utils";
import { useConfirm } from "./Confirm";

// Gestión de tandas (fardos) de un producto, enlazadas por product_uuid.
// unit: "u" (unidades) | "kg".  step: "1" | "0.1"
export default function BatchManager({ productUuid, productSource, unit = "u", step = "1", onTotalChange }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ quantity: "", expiry_date: "" });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ quantity: "", expiry_date: "" });
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("product_batches")
      .select("*")
      .eq("product_uuid", productUuid)
      .eq("is_deleted", 0)
      .order("expiry_date", { ascending: true });
    const list = data || [];
    setBatches(list);
    setLoading(false);
    onTotalChange?.(list.reduce((a, b) => a + Number(b.quantity || 0), 0));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [productUuid]);

  async function addFardo() {
    const qty = parseFloat(addForm.quantity);
    if (!qty || qty <= 0) return;
    if (!(await confirm({ title: "Sumar fardo", message: `¿Agregar ${formatNum(qty, qty % 1 === 0 ? 0 : 2)} ${unit} al stock?`, confirmText: "Sumar" }))) return;
    await supabase.from("product_batches").insert({
      uuid: newUuid(),
      product_uuid: productUuid,
      product_source: productSource,
      quantity: qty,
      expiry_date: addForm.expiry_date || null,
      entry_date: nowLocalAR(),
      is_deleted: 0,
      created_at: nowLocalAR(),
      updated_at: nowLocalAR(),
    });
    setAdding(false);
    setAddForm({ quantity: "", expiry_date: "" });
    await load();
  }

  async function saveEdit(b) {
    const qty = parseFloat(editForm.quantity);
    if (isNaN(qty) || qty < 0) return;
    if (!(await confirm({ title: "Guardar fardo", message: "¿Guardar los cambios de este fardo?", confirmText: "Guardar" }))) return;
    await supabase.from("product_batches").update({
      quantity: qty,
      expiry_date: editForm.expiry_date || null,
      updated_at: nowLocalAR(),
    }).eq("uuid", b.uuid);
    setEditId(null);
    await load();
  }

  async function removeBatch(b) {
    if (!(await confirm({ title: "Borrar fardo", message: `¿Borrar el fardo de ${formatNum(b.quantity, b.quantity % 1 === 0 ? 0 : 2)} ${unit}? Se descontará del stock.`, confirmText: "Borrar", danger: true }))) return;
    await supabase.from("product_batches").update({
      is_deleted: 1, quantity: 0, updated_at: nowLocalAR(),
    }).eq("uuid", b.uuid);
    await load();
  }

  const today = nowLocalAR().slice(0, 10);

  return (
    <div className="bg-[#f8f9fb] rounded-xl p-3 border border-[#e2e8f0]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-[#1e293b]">Fardos / tandas ({batches.length})</span>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs bg-[#10b981] text-white px-3 py-1.5 rounded-lg font-semibold">+ Sumar fardo</button>
        )}
      </div>

      {adding && (
        <div className="bg-white rounded-lg p-3 mb-2 border border-[#e2e8f0] space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-[#64748b] mb-1">Cantidad ({unit})</label>
              <input type="number" inputMode="decimal" step={step} value={addForm.quantity}
                onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                className="w-full px-2 py-1.5 border border-[#0040a1] rounded-lg text-sm" autoFocus />
            </div>
            <div>
              <label className="block text-[10px] text-[#64748b] mb-1">Vencimiento</label>
              <input type="date" value={addForm.expiry_date}
                onChange={(e) => setAddForm({ ...addForm, expiry_date: e.target.value })}
                className="w-full px-2 py-1.5 border border-[#0040a1] rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addFardo} className="flex-1 py-2 bg-[#10b981] text-white rounded-lg text-sm font-semibold">Agregar</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 bg-[#e2e8f0] rounded-lg text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-[#94a3b8] py-2">Cargando...</p>
      ) : batches.length === 0 ? (
        <p className="text-xs text-[#94a3b8] py-2">Sin fardos cargados.</p>
      ) : (
        <div className="space-y-1.5">
          {batches.map((b, i) => {
            const expired = b.expiry_date && b.expiry_date < today;
            return (
              <div key={b.uuid} className="bg-white border border-[#e2e8f0] rounded-lg p-2">
                {editId === b.uuid ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#64748b] mb-1">Cantidad ({unit})</label>
                        <input type="number" inputMode="decimal" step={step} value={editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                          className="w-full px-2 py-1.5 border border-[#0040a1] rounded-lg text-sm bg-white" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#64748b] mb-1">Vencimiento</label>
                        {/* min-height: el input date vacío colapsa/queda invisible en algunos celulares */}
                        <input type="date" value={editForm.expiry_date}
                          onChange={(e) => setEditForm({ ...editForm, expiry_date: e.target.value })}
                          className="w-full px-2 py-1.5 border border-[#0040a1] rounded-lg text-sm bg-white"
                          style={{ minHeight: 36 }} />
                      </div>
                    </div>
                    {editForm.expiry_date && (
                      <button onClick={() => setEditForm({ ...editForm, expiry_date: "" })}
                        className="text-[11px] text-[#64748b] underline">Quitar vencimiento</button>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(b)} className="flex-1 py-1.5 bg-[#10b981] text-white rounded text-xs font-semibold">OK</button>
                      <button onClick={() => setEditId(null)} className="px-3 py-1.5 bg-[#e2e8f0] rounded text-xs">✕</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    {/* Tocar el fardo también abre la edición (el lápiz era muy chico) */}
                    <button
                      onClick={() => { setEditId(b.uuid); setEditForm({ quantity: String(b.quantity), expiry_date: b.expiry_date ? b.expiry_date.slice(0, 10) : "" }); }}
                      className="flex-1 text-left text-sm"
                    >
                      <span className="font-mono text-[10px] text-[#94a3b8] mr-2">#{i + 1}</span>
                      <b className="text-[#1e293b]">{formatNum(b.quantity, b.quantity % 1 === 0 ? 0 : 2)} {unit}</b>
                      <span className={`ml-2 text-xs ${expired ? "text-[#ef4444] font-semibold" : "text-[#64748b]"}`}>
                        {b.expiry_date ? `vence ${b.expiry_date}${expired ? " ⚠️" : ""}` : "sin venc. — tocá para agregar"}
                      </span>
                    </button>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditId(b.uuid); setEditForm({ quantity: String(b.quantity), expiry_date: b.expiry_date ? b.expiry_date.slice(0, 10) : "" }); }}
                        className="p-1"><span className="material-symbols-outlined text-[18px] text-[#0040a1]">edit</span></button>
                      <button onClick={() => removeBatch(b)} className="p-1"><span className="material-symbols-outlined text-[18px] text-[#ef4444]">delete</span></button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
