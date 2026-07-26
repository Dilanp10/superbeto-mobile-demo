// Proveedores: saldo que le debemos a cada proveedor.
// El saldo (total_owed/total_paid) vive en la fila del proveedor y NUNCA se
// borra solo, aunque sea una deuda recurrente mes a mes. Lo único que se
// limpia cada 3 meses es el detalle de movimientos (provider_movements),
// que es solo historial/auditoría — el saldo no depende de él.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { formatMoney, stampNew, stampUpdate } from "../utils";
import { SearchBar, Field, Fab, Modal, Loader, Toast } from "./Products";
import { useConfirm } from "../components/Confirm";

const EMPTY = { name: "", phone: "" };

// > 0 = le debemos, < 0 = nos debe a nosotros (pagamos de más), 0 = al día
function balanceInfo(p) {
  const resta = Number(p.total_owed || 0) - Number(p.total_paid || 0);
  if (resta > 0.009) return { resta, label: "Resta", text: formatMoney(resta), color: "#ef4444" };
  if (resta < -0.009) return { resta, label: "A favor", text: formatMoney(Math.abs(resta)), color: "#3b82f6" };
  return { resta: 0, label: "Al día", text: "✓", color: "#10b981" };
}

export default function Proveedores() {
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
    const { data } = await supabase.from("providers").select("*").eq("is_deleted", 0).order("name");
    setItems(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  function flash(m) { setToast(m); setTimeout(() => setToast(""), 2500); }

  async function addProvider() {
    if (!addForm.name.trim()) return flash("Poné un nombre");
    if (!(await confirm({ title: "Nuevo proveedor", message: `¿Agregar a "${addForm.name.trim()}"?`, confirmText: "Agregar" }))) return;
    const { error } = await supabase.from("providers").insert({
      name: addForm.name.trim(),
      phone: addForm.phone || null,
      total_owed: 0,
      total_paid: 0,
      ...stampNew(),
    });
    if (error) return flash("Error: " + error.message);
    setShowAdd(false); setAddForm(EMPTY); await load();
    flash("Proveedor agregado ✓");
  }

  async function doDelete(p) {
    const { resta } = balanceInfo(p);
    const warn = resta > 0 ? ` Todavía le debés ${formatMoney(resta)}.` : "";
    if (!(await confirm({ title: "Dar de baja", message: `¿Ocultar a "${p.name}"?${warn} El historial se conserva.`, confirmText: "Dar de baja", danger: true }))) return;
    const { error } = await supabase.from("providers").update({ is_deleted: 1, ...stampUpdate() }).eq("uuid", p.uuid);
    if (error) return flash("Error: " + error.message);
    setDetail(null); await load();
    flash("Proveedor dado de baja");
  }

  const filtered = useMemo(() => {
    const t = search.toLowerCase().trim();
    return t ? items.filter((p) => `${p.name} ${p.phone || ""}`.toLowerCase().includes(t)) : items;
  }, [items, search]);

  const totalAPagar = filtered.reduce((a, p) => a + Math.max(0, balanceInfo(p).resta), 0);

  return (
    <div className="space-y-3">
      <div className="bg-[#0040a1]/5 border border-[#0040a1]/20 rounded-2xl p-4 flex items-center justify-between">
        <span className="text-sm text-[#64748b]">Total a pagar (todos)</span>
        <span className="text-xl font-extrabold text-[#0040a1]">{formatMoney(totalAPagar)}</span>
      </div>

      <SearchBar value={search} onChange={setSearch} count={filtered.length} />

      {loading ? <Loader /> : filtered.length === 0 ? (
        <p className="text-center text-[#94a3b8] py-10">No hay proveedores cargados</p>
      ) : filtered.map((p) => {
        const bal = balanceInfo(p);
        return (
          <button key={p.uuid} onClick={() => setDetail(p)} className="w-full text-left bg-white rounded-2xl p-4 border border-[#e2e8f0] active:bg-[#f8f9fb]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#1e293b] truncate">{p.name}</p>
                {p.phone && <p className="text-xs text-[#64748b]">{p.phone}</p>}
                <div className="mt-2 flex gap-4 flex-wrap">
                  <span className="text-sm"><span className="text-[#64748b]">Total </span><b className="text-[#1e293b]">{formatMoney(p.total_owed)}</b></span>
                  <span className="text-sm"><span className="text-[#64748b]">Pagado </span><b className="text-[#10b981]">{formatMoney(p.total_paid)}</b></span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-[#94a3b8] uppercase font-semibold">{bal.label}</p>
                <p className="text-lg font-extrabold" style={{ color: bal.color }}>{bal.text}</p>
              </div>
            </div>
          </button>
        );
      })}

      <Fab onClick={() => { setAddForm(EMPTY); setShowAdd(true); }} />

      {showAdd && (
        <Modal title="Nuevo proveedor" onClose={() => setShowAdd(false)}>
          <Field label="Nombre *" value={addForm.name} onChange={(v) => setAddForm({ ...addForm, name: v })} text />
          <Field label="Teléfono" value={addForm.phone} onChange={(v) => setAddForm({ ...addForm, phone: v })} text />
          <button onClick={addProvider} className="w-full py-3 bg-[#0040a1] text-white rounded-xl font-bold">Agregar</button>
        </Modal>
      )}

      {detail && (
        <ProviderDetail
          provider={detail}
          onClose={() => setDetail(null)}
          onSaved={(m) => { flash(m); load(); }}
          onDelete={doDelete}
        />
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}

function ProviderDetail({ provider, onClose, onSaved, onDelete }) {
  const [p, setP] = useState(provider);
  const [movs, setMovs] = useState([]);
  const [loadingMovs, setLoadingMovs] = useState(true);
  const [mode, setMode] = useState(null); // 'cargo' | 'pago' | null
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const confirm = useConfirm();

  async function loadMovs() {
    setLoadingMovs(true);
    const { data } = await supabase
      .from("provider_movements")
      .select("*")
      .eq("provider_uuid", provider.uuid)
      .order("created_at", { ascending: false })
      .limit(20);
    setMovs(data || []);
    setLoadingMovs(false);
  }
  useEffect(() => { loadMovs(); /* eslint-disable-next-line */ }, [provider.uuid]);

  const bal = balanceInfo(p);

  async function submit() {
    const v = parseFloat(amount);
    if (!v || v <= 0) { setErr("Poné un monto mayor a 0"); return; }
    const label = mode === "cargo" ? "un cargo (nueva deuda)" : "un pago";
    if (!(await confirm({
      title: mode === "cargo" ? "Registrar cargo" : "Registrar pago",
      message: `¿Confirmás ${label} de ${formatMoney(v)} para "${p.name}"?`,
      confirmText: "Confirmar",
    }))) return;

    setSaving(true);
    setErr("");
    const { error } = await supabase.rpc("provider_add_movement", {
      p_provider_uuid: provider.uuid,
      p_type: mode,
      p_amount: v,
      p_note: note.trim() || null,
    });
    if (error) {
      setSaving(false);
      setErr(error.message);
      return;
    }

    const { data } = await supabase.from("providers").select("*").eq("uuid", provider.uuid).single();
    if (data) setP(data);
    setSaving(false);
    setMode(null); setAmount(""); setNote("");
    await loadMovs();
    onSaved(mode === "cargo" ? "Cargo registrado ✓" : "Pago registrado ✓");
  }

  return (
    <Modal title={p.name} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-[#f8f9fb] rounded-xl p-2">
          <p className="text-[10px] text-[#64748b]">Total</p>
          <p className="font-bold text-[#1e293b] text-sm">{formatMoney(p.total_owed)}</p>
        </div>
        <div className="bg-[#f8f9fb] rounded-xl p-2">
          <p className="text-[10px] text-[#64748b]">Pagado</p>
          <p className="font-bold text-[#10b981] text-sm">{formatMoney(p.total_paid)}</p>
        </div>
        <div className="bg-[#f8f9fb] rounded-xl p-2">
          <p className="text-[10px] text-[#64748b]">{bal.label}</p>
          <p className="font-bold text-sm" style={{ color: bal.color }}>{bal.text}</p>
        </div>
      </div>

      {mode ? (
        <div className="bg-white border border-[#0040a1] rounded-xl p-3 space-y-2">
          <p className="text-sm font-bold text-[#1e293b]">
            {mode === "cargo" ? "Nuevo cargo (le debemos más)" : "Registrar pago"}
          </p>
          <Field label="Monto $" value={amount} onChange={setAmount} />
          <Field label="Nota (opcional)" value={note} onChange={setNote} text />
          {err && <p className="text-xs text-[#ef4444]">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={saving}
              className={`flex-1 py-2 rounded-lg text-white font-semibold ${mode === "cargo" ? "bg-[#ef4444]" : "bg-[#10b981]"}`}
            >
              {saving ? "Guardando..." : "Confirmar"}
            </button>
            <button onClick={() => { setMode(null); setAmount(""); setNote(""); setErr(""); }} className="px-4 py-2 bg-[#e2e8f0] rounded-lg text-sm">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setMode("cargo")} className="flex-1 py-2.5 bg-[#ef4444]/10 text-[#ef4444] rounded-xl font-semibold text-sm">
            + Cargo
          </button>
          <button onClick={() => setMode("pago")} className="flex-1 py-2.5 bg-[#10b981]/10 text-[#10b981] rounded-xl font-semibold text-sm">
            + Pago
          </button>
        </div>
      )}

      <div>
        <p className="text-xs font-bold text-[#64748b] mb-2">Movimientos recientes (últimos 3 meses)</p>
        {loadingMovs ? <Loader /> : movs.length === 0 ? (
          <p className="text-xs text-[#94a3b8] py-2">Sin movimientos registrados.</p>
        ) : (
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {movs.map((m) => (
              <div key={m.uuid} className="flex items-center justify-between bg-[#f8f9fb] rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <span className={`text-xs font-semibold ${m.type === "cargo" ? "text-[#ef4444]" : "text-[#10b981]"}`}>
                    {m.type === "cargo" ? "Cargo" : "Pago"}
                  </span>
                  {m.note && <span className="text-xs text-[#64748b]"> · {m.note}</span>}
                  <p className="text-[10px] text-[#94a3b8]">{(m.created_at || "").slice(0, 16)}</p>
                </div>
                <b className={`text-sm shrink-0 ${m.type === "cargo" ? "text-[#ef4444]" : "text-[#10b981]"}`}>
                  {m.type === "cargo" ? "+" : "-"}{formatMoney(m.amount)}
                </b>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => onDelete(p)} className="w-full py-2.5 bg-white border border-[#ef4444] text-[#ef4444] rounded-xl font-semibold">
        Dar de baja el proveedor
      </button>
    </Modal>
  );
}
