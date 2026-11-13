import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Mail, Hash, Lock, Save, CheckCircle, AlertCircle, LogOut } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAuthStore } from "../stores";
import { LogoutConfirmModal } from "../components/LogoutConfirmModal";
import api from "../lib/api";

interface UserProfile {
  name: string;
  email: string;
  nip: string;
  phone?: string;
}

const TeacherProfile = () => {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [profile, setProfile] = useState<UserProfile>({
    name: "",
    email: "",
    nip: "",
    phone: "",
  });

  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await api.get("/teacher/profile");
      setProfile({
        name: res.data.name || "",
        email: res.data.email || "",
        nip: res.data.nip || "",
        phone: res.data.phone || "",
      });
    } catch (err) {
      console.error("Failed to load profile:", err);
      setMsg({ type: "error", text: "Gagal memuat profil" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    try {
      await api.patch("/teacher/profile", {
        name: profile.name,
        nip: profile.nip,
        phone: profile.phone,
      });

      setMsg({ type: "success", text: "Profil berhasil diperbarui" });
      // Fetch updated user
      const res = await api.get("/teacher/profile");
      refreshUser(res.data.user);
    } catch (err: any) {
      setMsg({
        type: "error",
        text: err.response?.data?.detail || "Gagal memperbarui profil",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPassword(true);
    setMsg(null);

    if (passwords.new !== passwords.confirm) {
      setMsg({ type: "error", text: "Password baru tidak cocok" });
      setChangingPassword(false);
      return;
    }

    if (passwords.new.length < 6) {
      setMsg({ type: "error", text: "Password minimal 6 karakter" });
      setChangingPassword(false);
      return;
    }

    try {
      await api.post("/teacher/change-password", {
        current_password: passwords.current,
        new_password: passwords.new,
      });

      setMsg({ type: "success", text: "Password berhasil diubah" });
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (err: any) {
      setMsg({
        type: "error",
        text: err.response?.data?.detail || "Gagal mengubah password",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    useAuthStore.getState().logout();
    setShowLogoutConfirm(false);
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 dark:from-stone-950 dark:to-emerald-950/20 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-4"></div>
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-32 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 dark:from-stone-950 dark:to-emerald-950/20 py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigate("/teacher/dashboard")}
            className="p-2 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 dark:text-gray-400 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/30 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Profil Guru</h1>
          <div className="w-9" /> {/* Spacer */}
        </div>

        {/* Message */}
        {msg && (
          <div
            className={`p-4 rounded-xl border flex items-center gap-2 ${
              msg.type === "success"
                ? "bg-emerald-50/50 border-emerald-200/50 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800/50 dark:text-emerald-300"
                : "bg-red-50/50 border-red-200/50 text-red-700 dark:bg-red-950/20 dark:border-red-800/50 dark:text-red-300"
            }`}
          >
            {msg.type === "success" ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <p className="text-sm font-medium">{msg.text}</p>
          </div>
        )}

        {/* Profile Info Card */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-tr from-emerald-600 to-emerald-500 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-[0_6px_20px_rgba(16,185,129,0.25)]">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{profile.name}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{profile.email}</p>
            </div>
          </div>

          {/* Edit Profile Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Nama Lengkap
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                NIP
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={profile.nip}
                  onChange={(e) => setProfile({ ...profile, nip: e.target.value })}
                  className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Nomor Induk Pegawai"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Nomor Telepon
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={profile.phone || ""}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="08xxxxxxxxxx"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                saving
                  ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_4px_10px_rgba(16,185,129,0.25)]"
              }`}
            >
              <Save className="w-4 h-4" />
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="glass-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Ubah Password
          </h3>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Password Saat Ini
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={passwords.current}
                  onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                  className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Password Baru
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={passwords.new}
                  onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                  className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Minimal 6 karakter"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Konfirmasi Password Baru
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                  className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Ulangi password baru"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={changingPassword}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                changingPassword
                  ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_4px_10px_rgba(16,185,129,0.25)]"
              }`}
            >
              <Save className="w-4 h-4" />
              {changingPassword ? "Mengubah..." : "Ubah Password"}
            </button>
          </form>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center justify-center gap-2 font-medium"
        >
          <LogOut className="w-5 h-5" />
          Keluar dari Akun
        </button>
      </div>

      {/* Logout Confirmation Modal */}
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
};

export default TeacherProfile;
