import { createContext, useCallback, useContext, useRef, useState } from "react";

const ConfirmContext = createContext(null);

// Hook: const confirm = useConfirm();
// Uso: if (!(await confirm({ title, message, danger }))) return;
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmText, cancelText, danger }
  const resolver = useRef(null);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({
        title: opts.title || "¿Confirmar?",
        message: opts.message || "",
        confirmText: opts.confirmText || "Confirmar",
        cancelText: opts.cancelText || "Cancelar",
        danger: !!opts.danger,
      });
    });
  }, []);

  const close = (result) => {
    setState(null);
    if (resolver.current) {
      resolver.current(result);
      resolver.current = null;
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center"
          onClick={(e) => e.target === e.currentTarget && close(false)}
        >
          <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
            <div className="flex flex-col items-center text-center gap-2">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: state.danger ? "#ef444418" : "#0040a118" }}
              >
                <span
                  className="material-symbols-outlined text-3xl"
                  style={{ color: state.danger ? "#ef4444" : "#0040a1" }}
                >
                  {state.danger ? "warning" : "help"}
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#1e293b]">{state.title}</h2>
              {state.message && <p className="text-sm text-[#64748b]">{state.message}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => close(false)}
                className="flex-1 py-3 bg-[#e2e8f0] text-[#1e293b] rounded-xl font-semibold active:scale-95 transition-transform"
              >
                {state.cancelText}
              </button>
              <button
                onClick={() => close(true)}
                className="flex-1 py-3 text-white rounded-xl font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: state.danger ? "#ef4444" : "#0040a1" }}
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
