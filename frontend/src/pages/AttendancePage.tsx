import { useState, useMemo, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Loader2, MapPin, Camera, RotateCw, LayoutDashboard, CheckCircle, Clock, X } from "lucide-react";
import { useAuthStore } from "../stores";
import { useAuth } from "../hooks/useAuth";
import { useGeolocation } from "../hooks/useGeolocation";
import { QRScanner } from "../components/QRScanner";
import api from "../lib/api";

/** QR token format: room_id:timestamp:expiry:nonce:signature */
const parseRoomId = (token: string): string | null => {
  const parts = token.split(":");
  return parts.length >= 5 ? parts[0] : null;
};

interface LCDDisplay {
  success: boolean;
  teacher_name: string;
  teacher_nip: string;
  room_name: string;
  timestamp: string;
  status_text: string;
  status_color: string;
  date?: string;
  distance_m?: number | null;
}

const AttendancePage = () => {
  const { user } = useAuth();
  const { location, loading: locationLoading, reload: reloadLocation } = useGeolocation();

  const [qrToken, setQrToken] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [lcdDisplay, setLcdDisplay] = useState<LCDDisplay | null>(null);
  const [, setRoomInfo] = useState<{ room_code: string; name: string } | null>(null);
  const [todayStats, setTodayStats] = useState<{ submitted: boolean; count: number } | null>(null);

  const roomId = qrToken ? parseRoomId(qrToken) : null;

  // Fetch today's attendance status
  const fetchTodayStats = useCallback(async () => {
    try {
      const res = await api.get("/attendance/today");
      setTodayStats({
        submitted: res.data.submitted,
        count: res.data.logs?.length || 0,
      });
    } catch (err) {
      console.error("Failed to fetch today's stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchTodayStats();
  }, [fetchTodayStats]);

  const handleScan = async (token: string) => {
    setQrToken(token);
    setScanning(false);
    setRoomInfo(null);
    const rid = parseRoomId(token);
    if (rid) {
      try {
        const res = await api.post("/qr/validate", { token, room_id: rid });
        if (res.data?.valid) {
          const rooms = await api.get("/teacher/rooms").catch(() => null);
          const room = rooms?.data?.rooms?.find((r: { id: string }) => r.id === rid);
          if (room) setRoomInfo({ room_code: room.room_code, name: room.name });
        }
      } catch {
        // validation detail shown on submit; keep token
      }
    }
  };

  const handleSubmit = async () => {
    if (!location) {
      setMessage("Perlu lokasi GPS untuk presensi");
      setStatus("error");
      return;
    }

    if (!qrToken || !roomId) {
      setMessage("Scan QR code ruangan yang valid terlebih dahulu");
      setStatus("error");
      return;
    }

    setSubmitting(true);
    setMessage("");
    setLcdDisplay(null);

    try {
      const res = await api.post("/attendance/submit", {
        room_id: roomId,
        geolocation: location,
        device_fingerprint: deviceFingerprint,
        qr_token: qrToken,
      });

      setStatus("success");
      setMessage(res.data.message || "Presensi berhasil!");

      // Set LCD display data
      if (res.data.display) {
        setLcdDisplay({
          ...res.data.display,
          date: new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" }),
          distance_m: res.data.distance_m,
        });
      }

      // Send Telegram notification (optional)
      if (res.data.display) {
        try {
          await api.post("/telegram/notify/attendance", {
            teacher_id: user?.id || "",
            teacher_name: res.data.display.teacher_name,
            teacher_nip: res.data.display.teacher_nip,
            room_name: res.data.display.room_name,
            status: res.data.status,
            lateness_minutes: res.data.lateness_minutes,
            timestamp: res.data.display.timestamp,
          });
        } catch (err) {
          console.warn("Telegram notification failed:", err);
        }
      }

      setQrToken("");
      setRoomInfo(null);

      // Refresh today's stats after successful submission
      await fetchTodayStats();
    } catch (err: unknown) {
      console.error("[Attendance] Submit error:", err);

      // Extract detailed error message
      let errorMsg = "Presensi gagal. Periksa koneksi";

      const axiosErr = err as { response?: { status: number; data?: { detail?: { reasons?: string[] } | string } }; code?: string };

      if (axiosErr.response?.status === 401) {
        errorMsg = "Sesi login expired. Silakan login ulang.";
        // Auto logout dan redirect
        useAuthStore.getState().logout();
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } else if (axiosErr.response?.status === 400) {
        const reasons = axiosErr.response?.data?.detail;
        if (typeof reasons === "string") {
          errorMsg = reasons;
        } else if (reasons?.reasons && Array.isArray(reasons.reasons)) {
          errorMsg = reasons.reasons.join(". ");
        }
      } else if (axiosErr.code === "ERR_NETWORK") {
        errorMsg = "Gagal koneksi ke server. Pastikan internet stabil.";
      }

      setStatus("error");
      setMessage(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // Generate simple device fingerprint
  const deviceFingerprint = useMemo(() => {
    const data = `${navigator.userAgent}:${window.screen.width}x${window.screen.height}`;
    return btoa(data).substring(0, 32);
  }, []);

  const openScannerModal = () => setScanning(true);
  const closeScannerModal = () => {
    setScanning(false);
    setMessage("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 dark:from-stone-950 dark:to-emerald-950/20 py-6 px-3 sm:py-8 sm:px-4">
      <div className="max-w-sm sm:max-w-md mx-auto space-y-4 sm:space-y-5 animate-in fade-in duration-400">
        {/* Header - compact */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            SIPGURU
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Sistem Presensi Guru</p>
        </div>

        {/* User Profile Card - compact */}
        <div className="glass-card-light p-4 sm:p-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-tr from-emerald-600 to-emerald-500 rounded-full flex items-center justify-center text-white shadow-[0_6px_20px_rgba(16,185,129,0.25)] flex-shrink-0">
              <span className="text-xl sm:text-2xl font-bold">{user?.name?.charAt(0) || "G"}</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white truncate">{user?.name || "Guru"}</h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">{user?.email || "Not logged in"}</p>
            </div>
          </div>
        </div>

        {/* Today's Attendance Status - NEW */}
        {todayStats && (
          <div className={`glass-card-light p-4 sm:p-5 border-l-4 ${
            todayStats.submitted ? "border-emerald-500" : "border-amber-500"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${
                todayStats.submitted 
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" 
                  : "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
              }`}>
                {todayStats.submitted ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <Camera className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {todayStats.submitted ? "Sudah Absen Hari Ini" : "Belum Absen Hari Ini"}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {todayStats.count} kali presensi hari ini
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Location Status - compact */}
        <div className="glass-card-light p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${
                location 
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" 
                  : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
              }`}>
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Status Lokasi</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {location ? "Lokasi aktif" : "Memuat lokasi..."}
                </p>
              </div>
            </div>
            <button
              onClick={reloadLocation}
              disabled={locationLoading}
              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Nav to Dashboard - compact */}
        <Link to="/teacher/dashboard" className="block animate-stagger-2">
          <button className="btn-secondary w-full py-3 flex items-center justify-center gap-2">
            <LayoutDashboard className="w-5 h-5" />
            Lihat Dashboard & Izin
          </button>
        </Link>

        {/* QR Scanner Section */}
        <div className="glass-card-light p-4 sm:p-5">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Scan QR Code
          </h3>

          {!scanning && !qrToken && (
            <button
              onClick={openScannerModal}
              className="btn-primary w-full py-4 sm:py-4.5"
            >
              Mulai Scan QR Code
            </button>
          )}

          {qrToken && (
            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/50 dark:bg-emerald-950/20 dark:border-emerald-800/50">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">QR Code Ditemukan!</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-mono break-all">
                {qrToken.substring(0, 60)}...
              </p>
              <button
                onClick={() => setQrToken("")}
                className="mt-2 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:underline transition-colors"
              >
                Scan ulang
              </button>
            </div>
          )}

          {/* Submit Button */}
          {qrToken && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary w-full py-4 sm:py-4.5 text-base sm:text-lg tracking-wide mt-4"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Mengirim...
                </span>
              ) : (
                "Kirim Presensi"
              )}
            </button>
          )}
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-xl border ${
            status === "error" 
              ? "bg-red-50/50 border-red-200/50 text-red-700 dark:bg-red-950/20 dark:border-red-800/50 dark:text-red-300" 
              : "bg-emerald-50/50 border-emerald-200/50 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800/50 dark:text-emerald-300"
          }`}>
            <p className="font-medium text-sm">{message}</p>
          </div>
        )}

        {/* Notifikasi Presensi - Success Card */}
                {lcdDisplay && (
                  <div className="glass-card p-4 border border-emerald-200 dark:border-emerald-800 animate-in slide-in-from-bottom duration-300">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Presensi Berhasil</h3>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{lcdDisplay.timestamp}</span>
                    </div>
                    <div className={`rounded-xl p-4 ${
                      lcdDisplay.status_color === "green"
                        ? "bg-emerald-50 dark:bg-emerald-950/30"
                        : "bg-amber-50 dark:bg-amber-950/30"
                    }`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-xl ${
                          lcdDisplay.status_color === "green"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                        }`}>
                          {lcdDisplay.status_color === "green" ? (
                            <CheckCircle className="w-6 h-6" />
                          ) : (
                            <Clock className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <p className={`text-lg font-bold ${
                            lcdDisplay.status_color === "green"
                              ? "text-emerald-800 dark:text-emerald-200"
                              : "text-amber-800 dark:text-amber-200"
                          }`}>
                            {lcdDisplay.status_text}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {lcdDisplay.distance_m !== undefined && lcdDisplay.distance_m !== null
                              ? `Jarak GPS: ${Math.round(lcdDisplay.distance_m)} m`
                              : "Lokasi terverifikasi"}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Nama Guru</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate ml-4">{lcdDisplay.teacher_name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 dark:text-gray-400">NIP</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate ml-4">{lcdDisplay.teacher_nip}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Ruangan</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate ml-4">{lcdDisplay.room_name}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

        {/* Logout */}
        <div className="text-center pt-2">
          <button
            onClick={() => useAuthStore.getState().logout()}
            className="btn-ghost text-sm"
          >
            Keluar
          </button>
        </div>
      </div>

      {/* Scanner Modal - centered on mobile */}
      {scanning && (
        <div 
          className="modal-fixed-overlay flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm"
          onClick={closeScannerModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="scanner-title"
        >
          <div 
            className="w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-stone-700">
              <h2 id="scanner-title" className="text-lg font-semibold text-gray-900 dark:text-white">Scan QR Code</h2>
              <button
                onClick={closeScannerModal}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-stone-800 rounded-xl transition-colors"
                aria-label="Tutup scanner"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Scanner Content */}
            <div className="p-4">
              <QRScanner 
                onScan={handleScan} 
                onError={(e) => setMessage(e)} 
              />
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-stone-700">
              <button
                onClick={closeScannerModal}
                className="btn-ghost w-full py-3"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendancePage;