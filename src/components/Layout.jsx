import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { useAlerts } from "../pages/Alerts";

const TABS = [
  { to: "/dashboard", icon: "dashboard", label: "Inicio" },
  { to: "/productos", icon: "inventory_2", label: "Productos" },
  { to: "/peso", icon: "scale", label: "Peso" },
  { to: "/cuaderno", icon: "menu_book", label: "Cuaderno" },
  { to: "/cuentas", icon: "account_circle", label: "Cuentas" },
  { to: "/historial", icon: "receipt_long", label: "Historial" },
];

const TITLES = {
  "/dashboard": "Resumen",
  "/productos": "Productos",
  "/peso": "Productos por peso",
  "/cuaderno": "Cuaderno",
  "/cuentas": "Cuentas",
  "/historial": "Historial",
  "/avisos": "Avisos",
  "/asistente": "Asistente",
};

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { lowStock, expiring } = useAlerts();
  const total = lowStock.length + expiring.length;
  const title = TITLES[pathname] || "SuperBeto";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#0040a1] text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <span className="text-sm font-extrabold">SB</span>
          </div>
          <h1 className="text-lg font-bold">{title}</h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/asistente")}
            className="text-white/90 hover:text-white p-1"
            title="Asistente"
          >
            <span className="material-symbols-outlined">smart_toy</span>
          </button>
          <button
            onClick={() => navigate("/avisos")}
            className="relative text-white/90 hover:text-white p-1"
            title="Avisos"
          >
            <span className="material-symbols-outlined">notifications</span>
            {total > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-[#ef4444] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#0040a1]">
                {total > 99 ? "99+" : total}
              </span>
            )}
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-white/80 hover:text-white p-1"
            title="Salir"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 px-4 py-4 pb-24 max-w-2xl w-full mx-auto">{children}</main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-[#e2e8f0] flex justify-around"
           style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 min-w-0 ${
                isActive ? "text-[#0040a1]" : "text-[#94a3b8]"
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">{t.icon}</span>
            <span className="text-[9px] font-medium truncate">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
