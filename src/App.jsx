import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabase";
import Login from "./components/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Weighted from "./pages/Weighted";
import Accounts from "./pages/Accounts";
import History from "./pages/History";
import Cuaderno from "./pages/Cuaderno";
import Alerts from "./pages/Alerts";
import Chat from "./pages/Chat";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando

  useEffect(() => {
    let resolved = false;

    // Si en 6 s no resolvió, asumimos que no hay sesión y mostramos Login
    const t = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setSession(null);
      }
    }, 6000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(t);
        setSession(data.session ?? null);
      })
      .catch(() => {
        if (resolved) return;
        resolved = true;
        clearTimeout(t);
        setSession(null);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-[#64748b] gap-3 px-6">
        <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
        <p className="text-xs text-center">Conectando…</p>
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/productos" element={<Products />} />
        <Route path="/peso" element={<Weighted />} />
        <Route path="/cuentas" element={<Accounts />} />
        <Route path="/cuaderno" element={<Cuaderno />} />
        <Route path="/historial" element={<History />} />
        <Route path="/avisos" element={<Alerts />} />
        <Route path="/asistente" element={<Chat />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}
