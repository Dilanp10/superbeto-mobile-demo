import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

const SCANNER_ID = "barcode-scanner-region";

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    const html5 = new Html5Qrcode(SCANNER_ID, { verbose: false });
    scannerRef.current = html5;
    let cancelled = false;

    (async () => {
      try {
        await html5.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 }, aspectRatio: 1.7777 },
          (decoded) => {
            if (cancelled) return;
            cancelled = true;
            html5.stop().then(() => html5.clear()).catch(() => {});
            onScan(decoded);
          },
          () => {}
        );
        if (!cancelled) setStarting(false);
      } catch (e) {
        setError(typeof e === "string" ? e : e?.message || "No se pudo abrir la cámara");
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      if (html5.isScanning) {
        html5.stop().then(() => html5.clear()).catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-semibold">Escanear código</span>
        <button onClick={onClose} className="p-1">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-3">
        <div id={SCANNER_ID} className="w-full max-w-md rounded-2xl overflow-hidden bg-black" />
      </div>

      {starting && !error && (
        <p className="text-center text-white/80 text-sm pb-3">Iniciando cámara...</p>
      )}
      {error && (
        <p className="text-center text-red-300 text-sm pb-4 px-4">
          {error}. Permití el acceso a la cámara en el navegador y volvé a intentar.
        </p>
      )}
      {!starting && !error && (
        <p className="text-center text-white/80 text-sm pb-4">
          Apuntá el código dentro del recuadro
        </p>
      )}
    </div>
  );
}
