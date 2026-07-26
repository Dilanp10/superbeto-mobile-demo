import { useState } from "react";
import { supabase, configMissing } from "../supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();

    // Si faltan las variables de entorno, avisamos claro (no es problema de la clave)
    if (configMissing) {
      setError("⚙️ La app no está conectada a la base. Faltan las variables de entorno en Vercel (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY). Cargalas y volvé a desplegar.");
      return;
    }

    await doSignIn(email.trim(), password);
  }

  // Login de la DEMO: entra directo con la cuenta de ejemplo (datos inventados).
  async function demoLogin() {
    setEmail("demo@superbeto.app");
    setPassword("demo1234");
    await doSignIn("demo@superbeto.app", "demo1234");
  }

  async function doSignIn(mail, pass) {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password: pass });
    if (error) {
      if (/email not confirmed/i.test(error.message)) setError("El email no está confirmado.");
      else if (/invalid/i.test(error.message)) setError("Email o contraseña incorrectos.");
      else setError("No se pudo entrar: " + error.message);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-[#0040a1] to-[#002b6b]">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-[#0040a1] flex items-center justify-center mb-3">
            <span className="text-white text-2xl font-extrabold">SB</span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">SuperBeto</h1>
          <p className="text-sm text-[#64748b]">Control del negocio</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-[#64748b] mb-1">Email</label>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-[#e2e8f0] rounded-xl focus:outline-none focus:border-[#0040a1] text-base"
              placeholder="tucorreo@gmail.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-[#64748b] mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-[#e2e8f0] rounded-xl focus:outline-none focus:border-[#0040a1] text-base"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-sm text-[#ef4444] font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#0040a1] text-white rounded-xl font-bold text-base hover:bg-[#003080] disabled:bg-[#94a3b8] transition-all"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {/* Acceso rápido para la DEMO */}
        <div className="mt-5 pt-5 border-t border-[#e2e8f0]">
          <button
            type="button"
            onClick={demoLogin}
            disabled={loading}
            className="w-full py-3 bg-[#10b981] text-white rounded-xl font-bold text-base hover:bg-[#059669] disabled:bg-[#94a3b8] transition-all"
          >
            👉 Entrar a la demo
          </button>
          <p className="text-xs text-[#94a3b8] text-center mt-2">
            Datos de ejemplo · demo@superbeto.app / demo1234
          </p>
        </div>
      </div>
      <p className="text-white/60 text-xs mt-6">Demo de portafolio · datos inventados</p>
    </div>
  );
}
