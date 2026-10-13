import { useEffect, useRef, useState } from "react";
import { Camera, Keyboard, CheckCircle } from "lucide-react";

interface QRScannerProps {
  onScan: (data: string) => void;
  onError: (error: string) => void;
}

export const QRScanner = ({ onScan, onError }: QRScannerProps) => {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState("");
  const [lastScan, setLastScan] = useState<{ data: string; time: string } | null>(null);
  const scannerRef = useRef<{ clear: () => void | Promise<void> } | null>(null);
  const firedRef = useRef(false);
  const divId = useRef(`qr-reader-sipguru`);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  onScanRef.current = onScan;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(divId.current);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded: string) => {
            if (firedRef.current) return;
            firedRef.current = true;
            const now = new Date().toLocaleTimeString("id-ID");
            setLastScan({ data: decoded, time: now });
            onScanRef.current(decoded);
          },
          () => {
            // frame tanpa QR — abaikan
          }
        );
        if (!cancelled) setStarting(false);
      } catch {
        if (!cancelled) {
          setError("Gagal mengakses kamera. Izinkan akses kamera atau input manual.");
          onErrorRef.current("Camera access denied");
          setStarting(false);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      try {
        const p = scannerRef.current?.clear();
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => undefined);
        }
      } catch {
        // ignore cleanup errors
      }
      scannerRef.current = null;
      firedRef.current = false;
    };
  }, []);

  const submitManual = () => {
    const token = manual.trim();
    if (!token) {
      setError("Tempel token QR terlebih dahulu");
      return;
    }
    const now = new Date().toLocaleTimeString("id-ID");
    setLastScan({ data: token, time: now });
    onScan(token);
  };

  const resetScan = () => {
    setLastScan(null);
    firedRef.current = false;
    setManual("");
    setShowManual(false);
  };

  return (
    <div className="relative w-full max-w-md mx-auto space-y-4">
      {!showManual && (
        <>
          <div className="relative bg-black rounded-xl overflow-hidden">
            <div id={divId.current} className="w-full [&_video]:w-full [&_video]:h-[320px] [&_video]:object-cover" />
            {starting && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center p-8">
                  <Camera className="w-10 h-10 text-white/50 mx-auto mb-2" />
                  <p className="text-white">Mengakses kamera...</p>
                </div>
              </div>
            )}
            {error && (
              <div className="p-4 bg-black text-white text-center text-sm">{error}</div>
            )}
            <button
              onClick={() => setShowManual(true)}
              className="absolute bottom-4 left-4 flex items-center gap-2 bg-white/90 text-gray-800 px-4 py-2 rounded-full text-sm font-medium shadow-lg hover:bg-white transition"
            >
              <Keyboard className="w-4 h-4" />
              Input manual
            </button>
          </div>
        </>
      )}

      {showManual && (
        <div className="p-4 bg-white dark:bg-stone-900 rounded-xl space-y-3 border border-gray-200 dark:border-stone-800">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tempel token QR dari admin</p>
          <textarea
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            rows={3}
            placeholder="room_id:timestamp:expiry:nonce:signature"
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowManual(false)}
              className="flex-1 py-2 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/20 transition"
            >
              Kamera
            </button>
            <button
              onClick={submitManual}
              className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Gunakan token
            </button>
          </div>
        </div>
      )}

      {/* Hasil Scan Section */}
      {lastScan && (
        <div className="glass-card-light p-4 border-l-4 border-emerald-500 animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
              <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900 dark:text-white">QR Code Terdeteksi!</h4>
                <span className="text-xs text-gray-500 dark:text-gray-400">{lastScan.time}</span>
              </div>
              <p className="text-xs font-mono text-gray-600 dark:text-gray-400 break-all bg-gray-50 dark:bg-white/5 p-2 rounded mb-2">
                {lastScan.data.substring(0, 80)}...
              </p>
              <div className="flex gap-2">
                <button
                  onClick={resetScan}
                  className="px-3 py-1.5 text-xs bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-950/50 transition-colors flex items-center gap-1"
                >
                  <Camera className="w-3 h-3" />
                  Scan Ulang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
