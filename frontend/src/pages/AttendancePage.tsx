import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Loader2, MapPin, Camera, RotateCw, LayoutDashboard, CheckCircle, Monitor } from "lucide-react";
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

  const roomId = qrToken ? parseRoomId(qrToken) : null;

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
        setLcdDisplay(res.data.display);
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
    } catch (err: unknown) {
      setStatus("error");
      const reasons =
        (err as { response?: { data?: { detail?: { reasons?: string[] } | string } } })
          .response?.data?.detail;
      if (typeof reasons === "string") setMessage(reasons);
      else if (reasons?.reasons) setMessage(reasons.reasons.join(", "));
      else setMessage("Presensi gagal. Periksa koneksi.");
    } finally {
      setSubmitting(false);
    }
  };

  // Generate simple device fingerprint
  const deviceFingerprint = useMemo(() => {
    const data = `${navigator.userAgent}:${window.screen.width}x${window.screen.height}`;
    return btoa(data).substring(0, 32);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 dark:from-stone-950 dark:to-emerald-950/20 py-8 px-4">
      <div className="max-w-md mx-auto space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="text-center space-y-2 animate-stagger-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            SIPGURU
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Sistem Presensi Guru</p>
        </div>

        {/* User Profile Card */}
        <div className="glass-card-light p-6 animate-stagger-2">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-tr from-emerald-600 to-emerald-500 rounded-full flex items-center justify-center text-white shadow-[0_8px_25px_rgba(16,185,129,0.25)]">
              <span className="text-2xl font-bold">{user?.name?.charAt(0) || "G"}</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{user?.name || "Guru"}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{user?.email || "Not logged in"}</p>
            </div>
          </div>
        </div>

        {/* Location Status */}
        <div className="glass-card-light p-6 animate-stagger-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${location ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"}`}>
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Status Lokasi</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{location ? "Lokasi aktif" : "Memuat lokasi..."}</p>
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

        {/* Nav to Dashboard */}
        <Link to="/teacher/dashboard" className="animate-stagger-3">
          <button className="btn-secondary w-full py-3 flex items-center justify-center gap-2">
            <LayoutDashboard className="w-5 h-5" />
            Lihat Dashboard & Izin
          </button>
        </Link>

        {/* QR Scanner Section */}
        <div className="glass-card-light p-6 animate-stagger-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Scan QR Code
          </h3>

          {!scanning && !qrToken && (
            <button
              onClick={() => setScanning(true)}
              className="btn-primary w-full py-4"
            >
              Mulai Scan QR Code
            </button>
          )}

          {scanning && (
            <div className="space-y-4">
              <QRScanner onScan={handleScan} onError={(e) => setMessage(e)} />
              <button
                onClick={() => setScanning(false)}
                className="btn-ghost w-full py-3"
              >
                Batal
              </button>
            </div>
          )}

          {qrToken && (
            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/50 dark:bg-emerald-950/20 dark:border-emerald-800/50">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">QR Code Ditemukan!</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-mono break-all">
                {qrToken.substring(0, 50)}...
              </p>
              <button
                onClick={() => setQrToken("")}
                className="mt-2 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:underline transition-colors"
              >
                Scan ulang
              </button>
            </div>
          )}
        </div>

        {/* Submit Button */}
        {qrToken && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary w-full py-4 text-lg tracking-wide animate-stagger-5"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                Mengirim...
              </span>
            ) : (
              "Kirim Presensi"
            )}
          </button>
        )}

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-xl border ${status === "error" ? "bg-red-50/50 border-red-200/50 text-red-700 dark:bg-red-950/20 dark:border-red-800/50 dark:text-red-300" : "bg-emerald-50/50 border-emerald-200/50 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800/50 dark:text-emerald-300"}`}>
            <p className="font-medium">{message}</p>
          </div>
        )}

        {/* LCD Display Notification */}
        {lcdDisplay && (
          <div className="glass-card p-6 border-2 border-emerald-500/50 dark:border-emerald-400/50 animate-in zoom-in duration-300">
            <div className="flex items-center gap-3 mb-4">
              <Monitor className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Notifikasi LCD</h3>
            </div>
            
            <div className={`rounded-xl p-6 ${
              lcdDisplay.status_color === "green" 
                ? "bg-gradient-to-br from-emerald-500 to-emerald-600" 
                : "bg-gradient-to-br from-amber-500 to-amber-600"
            } text-white shadow-2xl`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-white/20 rounded-full">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm opacity-90">Presensi Berhasil</p>
                    <p className="text-2xl font-bold">{lcdDisplay.status_text}</p>
                  </div>
                </div>
                <p className="text-3xl font-mono font-bold">{lcdDisplay.timestamp}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
                <div>
                  <p className="text-xs opacity-75">Nama Guru</p>
                  <p className="font-semibold text-lg">{lcdDisplay.teacher_name}</p>
                </div>
                <div>
                  <p className="text-xs opacity-75">NIP</p>
                  <p className="font-semibold text-lg">{lcdDisplay.teacher_nip}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs opacity-75">Ruangan</p>
                  <p className="font-semibold text-lg">{lcdDisplay.room_name}</p>
                </div>
              </div>
            </div>
            
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-3">
              Tampilan ini dapat ditampilkan di layar LCD untuk monitoring real-time
            </p>
          </div>
        )}

        {/* Logout */}
        <div className="text-center">
          <button
            onClick={() => useAuthStore.getState().logout()}
            className="btn-ghost text-sm"
          >
            Keluar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttendancePage;
