import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, Clock, Loader2, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useGeolocation } from "../hooks/useGeolocation";
import { QRScanner } from "./QRScanner";
import api from "../lib/api";

interface LCDDisplay {
  teacher_name: string;
  teacher_nip: string;
  room_name: string;
  timestamp: string;
  status_text: string;
  status_color: string;
  distance_m?: number | null;
}

interface AttendanceDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

const AttendanceDialog = ({ onClose, onSuccess }: AttendanceDialogProps) => {
  const { user } = useAuth();
  const { location, loading: locationLoading, error: locationError, reload: reloadLocation } = useGeolocation();
  const [scanning, setScanning] = useState(true);
  const [closing, setClosing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<{ token: string; roomId: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [lcdDisplay, setLcdDisplay] = useState<LCDDisplay | null>(null);
  const submittingRef = useRef(false);
  const scannedRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const deviceFingerprint = useMemo(() => {
    const data = `${navigator.userAgent}:${window.screen.width}x${window.screen.height}`;
    return btoa(data).substring(0, 32);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const submitAttendance = useCallback(async (
    token: string,
    roomId: string,
    coordinates: NonNullable<typeof location>,
  ) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setMessage("Mengirim presensi...");

    try {
      const res = await api.post("/attendance/submit", {
        room_id: roomId,
        geolocation: coordinates,
        device_fingerprint: deviceFingerprint,
        qr_token: token,
      });
      setStatus("success");
      setMessage(res.data.message || "Presensi berhasil dikirim.");
      if (res.data.display) {
        setLcdDisplay({ ...res.data.display, distance_m: res.data.distance_m });
        void api.post("/telegram/notify/attendance", {
          teacher_id: user?.id || "",
          teacher_name: res.data.display.teacher_name,
          teacher_nip: res.data.display.teacher_nip,
          room_name: res.data.display.room_name,
          status: res.data.status,
          lateness_minutes: res.data.lateness_minutes,
          timestamp: res.data.display.timestamp,
        }).catch(() => console.warn("Notifikasi presensi gagal dikirim."));
      }
      localStorage.removeItem("sipguru_cache_todays_schedule");
      localStorage.removeItem("sipguru_cache_schedule_day");
      localStorage.removeItem("sipguru_cache_my_schedules");
      onSuccess();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status: number; data?: { detail?: { reasons?: string[] } | string } };
        code?: string;
      };
      const detail = axiosErr.response?.data?.detail;
      let errorMsg = "Presensi gagal. Periksa koneksi.";
      if (axiosErr.response?.status === 401) {
        errorMsg = "Sesi login expired. Silakan login ulang.";
      } else if (typeof detail === "string") {
        errorMsg = detail;
      } else if (detail?.reasons?.length) {
        errorMsg = detail.reasons.join(". ");
      } else if (axiosErr.code === "ERR_NETWORK") {
        errorMsg = "Gagal terhubung ke server. Periksa koneksi internet.";
      }
      setStatus("error");
      setMessage(errorMsg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [deviceFingerprint, onSuccess, user?.id]);

  const handleScan = (token: string) => {
    if (closing || scannedRef.current) return;
    scannedRef.current = true;
    setScanning(false);
    setStatus("idle");
    setLcdDisplay(null);
    const parts = token.split(":");
    if (parts.length < 5 || !parts[0]) {
      setStatus("error");
      setMessage("QR tidak valid. Scan QR ruangan yang benar.");
      return;
    }
    setMessage("Mengambil lokasi GPS...");
    setPendingSubmission({ token, roomId: parts[0] });
  };

  useEffect(() => {
    if (closing || !pendingSubmission || submittingRef.current) return;
    if (location) {
      setPendingSubmission(null);
      void submitAttendance(pendingSubmission.token, pendingSubmission.roomId, location);
    } else if (!locationLoading) {
      setStatus("error");
      setMessage(locationError || "Lokasi tidak tersedia. Aktifkan akses GPS lalu scan ulang.");
      setPendingSubmission(null);
    }
  }, [closing, location, locationError, locationLoading, pendingSubmission, submitAttendance]);

  const close = () => {
    if (!submittingRef.current) setClosing(true);
  };

  useEffect(() => {
    if (!closing) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160;
    const timer = window.setTimeout(onClose, delay);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  const retry = () => {
    scannedRef.current = false;
    setStatus("idle");
    setMessage("");
    setLcdDisplay(null);
    setPendingSubmission(null);
    if (!location) reloadLocation();
    setScanning(true);
  };

  const title = scanning ? "Scan QR Code" : submitting || pendingSubmission
    ? "Memproses presensi" : status === "success" ? "Presensi Berhasil" : "Presensi Gagal";

  return createPortal(
    <dialog
      ref={dialogRef}
      id="attendance-dialog"
      data-closing={closing || undefined}
      aria-labelledby="attendance-dialog-title"
      aria-modal="true"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className="attendance-dialog m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900 dark:text-white"
    >
      <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-stone-700">
        <h2 id="attendance-dialog-title" className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={close} disabled={submitting} autoFocus aria-label="Tutup presensi" className="rounded-xl p-3 text-gray-500 hover:bg-gray-100 focus-visible:outline-emerald-600 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-stone-800">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-4 p-4">
        {scanning ? (
          <QRScanner onScan={handleScan} onError={setMessage} />
        ) : (
          <>
            <div role={status === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${status === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
              {(submitting || pendingSubmission) && <Loader2 className="h-5 w-5 shrink-0 animate-spin" />}
              <p>{message}</p>
            </div>
            {lcdDisplay && (
              <section aria-label="Hasil presensi" className={`rounded-xl p-4 ${lcdDisplay.status_color === "green" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-amber-50 dark:bg-amber-950/30"}`}>
                <div className="mb-3 flex items-center gap-3">
                  {lcdDisplay.status_color === "green" ? <CheckCircle className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <Clock className="h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />}
                  <div>
                    <p className="font-bold">{lcdDisplay.status_text}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{lcdDisplay.timestamp}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{lcdDisplay.distance_m != null ? `Jarak GPS: ${Math.round(lcdDisplay.distance_m)} m` : "Lokasi terverifikasi"}</p>
                  </div>
                </div>
                <dl className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                  <div className="flex justify-between gap-4"><dt className="text-xs text-gray-500 dark:text-gray-400">Nama Guru</dt><dd className="break-words text-right text-sm font-medium">{lcdDisplay.teacher_name}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-xs text-gray-500 dark:text-gray-400">NIP</dt><dd className="break-all text-right text-sm font-medium">{lcdDisplay.teacher_nip}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-xs text-gray-500 dark:text-gray-400">Ruangan</dt><dd className="break-words text-right text-sm font-medium">{lcdDisplay.room_name}</dd></div>
                </dl>
              </section>
            )}
          </>
        )}
      </div>
      <div className="flex gap-3 border-t border-gray-200 p-4 dark:border-stone-700">
        {status === "error" && !scanning && <button type="button" onClick={retry} className="btn-primary flex-1 justify-center py-3">Scan ulang</button>}
        <button type="button" onClick={close} disabled={submitting} className="btn-ghost flex-1 py-3 disabled:opacity-40">
          {status === "success" ? "Selesai" : submitting ? "Mengirim..." : scanning || pendingSubmission ? "Batal" : "Tutup"}
        </button>
      </div>
    </dialog>,
    document.body,
  );
};

export default AttendanceDialog;
