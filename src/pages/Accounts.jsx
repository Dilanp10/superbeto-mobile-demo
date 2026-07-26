import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { formatMoney, formatNum, stampUpdate, stampNew } from "../utils";
import { SearchBar, Field, IconBtn, Fab, Modal, Loader, Toast } from "./Products";
import { useConfirm } from "../components/Confirm";

const EMPTY = { name: "", last_name: "", phone: "", gmail: "" };

export default function Accounts() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState("");
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("accounts").select("*").eq("is_deleted", 0).order("name");
    setItems(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  function flash(m) { setToast(m); setTimeout(() => setToast(""), 2500); }

  async function addAccount() {
    if (!addForm.name.trim() || !addForm.last_name.trim()) return flash("Nombre y apellido obligatorios");
    if (!(await confirm({ title: "Crear cuenta", message: `¿Crear la cuenta de "${addForm.name.trim()} ${addForm.last_name.trim()}"?`, confirmText: "Crear" }))) return;
    const { error } = await supabase.from("accounts").insert({
      name: addForm.name.trim(),
      last_name: addForm.last_name.trim(),
      phone: addForm.phone || null,
      gmail: addForm.gmail || null,
      ...stampNew(),
    });
    if (error) return flash("Error: " + error.message);
    setShowAdd(false); setAddForm(EMPTY); await load(); flash("Cuenta creada ✓");
  }

  async function doDelete(a) {
    if (!(await confirm({ title: "Dar de baja", message: `¿Ocultar la cuenta de "${a.name} ${a.last_name}"? El historial se conserva.`, confirmText: "Dar de baja", danger: true }))) return;
    const { error } = await supabase.from("accounts").update({ is_deleted: 1, ...stampUpdate() }).eq("uuid", a.uuid);
    if (error) return flash("Error: " + error.message);
    await load(); flash("Cuenta dada de baja");
  }

  const filtered = useMemo(() => {
    const t = search.toLowerCase().trim();
    if (!t) return items;
    return items.filter((a) => `${a.name} ${a.last_name} ${a.phone || ""} ${a.gmail || ""}`.toLowerCase().includes(t));
  }, [items, search]);

  return (
    <div className="space-y-3">
      <SearchBar value={search} onChange={setSearch} count={filtered.length} />

      {loading ? <Loader /> : filtered.length === 0 ? (
        <p className="text-center text-[#94a3b8] py-10">No hay cuentas</p>
      ) : filtered.map((a) => (
        <div key={a.uuid} className="bg-white rounded-2xl p-4 border border-[#e2e8f0] flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-[#0040a1]/10 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#0040a1]">person</span>
          </div>
          <button className="flex-1 text-left" onClick={() => setDetail(a)}>
            <p className="font-bold text-[#1e293b]">{a.name} {a.last_name}</p>
            <p className="text-xs text-[#64748b]">{a.phone || a.gmail || "Sin datos"}</p>
          </button>
          <IconBtn icon="chevron_right" color="#94a3b8" onClick={() => setDetail(a)} />
          <IconBtn icon="delete" color="#ef4444" onClick={() => doDelete(a)} />
        </div>
      ))}

      <Fab onClick={() => { setAddForm(EMPTY); setShowAdd(true); }} />

      {showAdd && (
        <Modal title="Nueva cuenta" onClose={() => setShowAdd(false)}>
          <Field label="Nombre *" value={addForm.name} onChange={(v) => setAddForm({ ...addForm, name: v })} text />
          <Field label="Apellido *" value={addForm.last_name} onChange={(v) => setAddForm({ ...addForm, last_name: v })} text />
          <Field label="Teléfono" value={addForm.phone} onChange={(v) => setAddForm({ ...addForm, phone: v })} text />
          <Field label="Email" value={addForm.gmail} onChange={(v) => setAddForm({ ...addForm, gmail: v })} text />
          <button onClick={addAccount} className="w-full py-3 bg-[#0040a1] text-white rounded-xl font-bold">Crear cuenta</button>
        </Modal>
      )}

      {detail && <AccountDetail account={detail} onClose={() => setDetail(null)} />}
      {toast && <Toast text={toast} />}
    </div>
  );
}

function AccountDetail({ account, onClose }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("sales").select("*").eq("account_id", String(account.id)).eq("is_deleted", 0).order("created_at", { ascending: false });
      setSales(data || []);
      setLoading(false);
    })();
  }, [account]);

  const total = sales
    .filter((s) => s.product_type !== "account_close")
    .reduce((a, s) => a + Number(s.total_price || 0), 0);

  // Agrupar por sale_group_id
  const groups = useMemo(() => {
    const m = new Map();
    for (const s of sales) {
      const g = s.sale_group_id || s.uuid;
      if (!m.has(g)) m.set(g, { fecha: s.created_at, items: [] });
      m.get(g).items.push(s);
    }
    return [...m.values()];
  }, [sales]);

  return (
    <Modal title={`${account.name} ${account.last_name}`} onClose={onClose}>
      <div className="bg-[#0040a1]/5 rounded-xl p-3 flex items-center justify-between">
        <span className="text-sm text-[#64748b]">Total gastado (últ. 3 meses)</span>
        <span className="text-xl font-extrabold text-[#0040a1]">{formatMoney(total)}</span>
      </div>
      {loading ? <Loader /> : groups.length === 0 ? (
        <p className="text-center text-[#94a3b8] py-6">Sin movimientos en la nube</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => (
            <div key={i} className="border border-[#e2e8f0] rounded-xl p-3">
              <p className="text-xs text-[#94a3b8] mb-1">{(g.fecha || "").slice(0, 16)}</p>
              {g.items.map((it) => (
                <div key={it.uuid} className="flex justify-between text-sm py-0.5">
                  <span className="text-[#1e293b]">
                    {it.product_type === "account_close" ? "🔒 Cierre" : it.product_name}
                    {it.product_type !== "account_close" && it.product_type !== "custom" &&
                      <span className="text-[#94a3b8]"> ×{formatNum(it.quantity, it.quantity % 1 === 0 ? 0 : 2)}</span>}
                  </span>
                  <b className="text-[#1e293b]">{formatMoney(it.total_price)}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
