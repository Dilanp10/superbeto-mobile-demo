import { useEffect, useRef, useState } from "react";

const SUGGESTIONS = [
  "¿Cuánto vendí hoy?",
  "¿Qué se está por vencer?",
  "¿Cuáles son los más vendidos?",
  "¿Cuánto me debe María?",
];

const WELCOME = {
  role: "assistant",
  text: "¡Hola! Soy Beto, el asistente del negocio. En la app real respondo por chat sobre ventas, ganancias, fiado, stock y vencimientos, y hasta modifico productos por vos.",
};

// Conversación de muestra (estática) para que se vea qué hace Beto.
const EXAMPLES = [
  { role: "user", text: "¿Cuánto vendí hoy?" },
  { role: "assistant", text: "Hoy llevás $35.000 en 7 ventas, con una ganancia de $13.150 (margen 37,6%)." },
  { role: "user", text: "¿Qué se está por vencer?" },
  { role: "assistant", text: "Ojo 👀 la Mayonesa venció hace 2 días y la Sprite vence en 3. Hay 6 productos por vencer en total." },
];

// En esta demo el asistente en vivo está desactivado: respondemos con un aviso + contacto.
const DEMO_REPLY =
  "🔒 En esta demo Beto es solo una muestra. La versión que responde y modifica en vivo corre en la app completa. ¿Querés verla funcionando? Escribime: dilanperea10@gmail.com · 3834697224.";

export default function Chat() {
  const [messages, setMessages] = useState([WELCOME, ...EXAMPLES]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    // scroll al final cuando llega un mensaje
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending) return;

    setError("");
    setInput("");
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setSending(true);

    // Demo: el asistente en vivo está desactivado. Respondemos con el aviso + contacto.
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", text: DEMO_REPLY }]);
      setSending(false);
    }, 550);
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 130px)" }}>
      {/* Encabezado del asistente */}
      <div className="bg-white rounded-2xl p-3 border border-[#e2e8f0] flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-full bg-[#0040a1] flex items-center justify-center">
          <span className="material-symbols-outlined text-white">smart_toy</span>
        </div>
        <div>
          <p className="font-bold text-[#1e293b] leading-tight">Beto — Asistente</p>
          <p className="text-xs text-[#64748b]">Demo — así funciona el asistente</p>
        </div>
      </div>

      {/* Historial */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}
        {sending && <Bubble role="assistant" text="…" typing />}
        {error && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-sm p-3 rounded-xl">
            {error}
          </div>
        )}
      </div>

      {/* Sugerencias (al inicio) */}
      {messages.length <= EXAMPLES.length + 1 && !sending && (
        <div className="mb-2 -mx-1 pb-1">
          <p className="text-xs text-[#64748b] px-1 mb-1">Probá con:</p>
          <div className="flex gap-2 overflow-x-auto pb-1 px-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="whitespace-nowrap bg-white border border-[#e2e8f0] text-[#0040a1] text-xs font-semibold px-3 py-2 rounded-full active:bg-[#f1f5f9]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Aviso de demo */}
      <div className="mb-2 text-[11px] leading-snug text-[#475569] bg-[#0040a1]/5 border border-[#0040a1]/15 rounded-xl px-3 py-2">
        🔒 <b>Demo:</b> el asistente en vivo está desactivado. En la app real Beto responde y edita productos por chat. Escribime para verlo funcionando.
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-[#e2e8f0]"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Preguntá algo del negocio…"
          disabled={sending}
          className="flex-1 px-3 py-2 outline-none text-sm bg-transparent"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#0040a1] text-white disabled:bg-[#94a3b8] active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">
            {sending ? "hourglass" : "send"}
          </span>
        </button>
      </form>
    </div>
  );
}

function Bubble({ role, text, typing }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-[#0040a1] flex items-center justify-center mr-2 shrink-0">
          <span className="material-symbols-outlined text-white text-[18px]">smart_toy</span>
        </div>
      )}
      <div
        className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-[#0040a1] text-white rounded-br-sm"
            : "bg-white border border-[#e2e8f0] text-[#1e293b] rounded-bl-sm"
        }`}
      >
        {typing ? (
          <span className="inline-flex items-center gap-1">
            <Dot delay={0} />
            <Dot delay={0.15} />
            <Dot delay={0.3} />
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

function Dot({ delay }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-[#94a3b8] animate-bounce"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}
