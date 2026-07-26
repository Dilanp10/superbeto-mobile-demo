// Formato de moneda/numeros argentino: 27.540,00
const AR = (d) => ({ minimumFractionDigits: d, maximumFractionDigits: d });
export const formatNum = (v, d = 2) => Number(v || 0).toLocaleString("es-AR", AR(d));
export const formatMoney = (v) => `$${formatNum(v)}`;

// Marca de tiempo en hora local de Argentina (UTC-3) con el MISMO formato que
// usa la compu ('YYYY-MM-DD HH:MM:SS'), para que el sync compare bien.
export function nowLocalAR() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// uuid v4 (para altas nuevas desde el celu)
export function newUuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Estampa para escrituras que van a sincronizarse hacia la compu
export const stampUpdate = () => ({ updated_at: nowLocalAR() });
export const stampNew = () => ({
  uuid: newUuid(),
  is_deleted: 0,
  created_at: nowLocalAR(),
  updated_at: nowLocalAR(),
});
