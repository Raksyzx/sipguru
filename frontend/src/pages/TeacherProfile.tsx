import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Mail, Hash, Lock, Save, LogOut, Camera } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAuthStore } from "../stores";
import { LogoutConfirmModal } from "../components/LogoutConfirmModal";
import { useToast, ToastContainer } from "../components/Toast";
import api from "../lib/api";

interface UserProfile {
  name: string;
  email: string;
  nip: string;
  phone?: string;
  avatar_url?: string;
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
    avatar_url: "",
  });

  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const { success, error, toasts, removeToast } = useToast("top-center");

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await api.get("/teacher/profile");
      // Backend returns {user: {...}}, so access res.data.user
      const userData = res.data.user || res.data;
      setProfile({
        name: userData.name || "",
        email: userData.email || "",
        nip: userData.nip || "",
        phone: userData.phone || "",
        avatar_url: userData.avatar_url || "",
      });
    } catch (err) {
      console.error("Failed to load profile:", err);
      error("Gagal memuat profil");
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      error("Ukuran foto maksimal 2MB");
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      error("File harus berupa gambar");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await api.post("/teacher/upload-avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.avatar_url) {
        setProfile({ ...profile, avatar_url: res.data.avatar_url });
        success("Foto profil berhasil diperbarui");
        
        // Refresh user in auth store
        const userRes = await api.get("/teacher/profile");
        refreshUser(userRes.data.user);
      }
    } catch (err: any) {
      error(err.response?.data?.detail || "Gagal mengunggah foto");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await api.patch("/teacher/profile", {
        name: profile.name,
        nip: profile.nip,
        phone: profile.phone,
      });

      success("Profil berhasil diperbarui");
      // Fetch updated user
      const res = await api.get("/teacher/profile");
      refreshUser(res.data.user);
    } catch (err: any) {
      error(err.response?.data?.detail || "Gagal memperbarui profil");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPassword(true);

    if (passwords.new !== passwords.confirm) {
      error("Password baru tidak cocok");
      setChangingPassword(false);
      return;
    }

    if (passwords.new.length < 6) {
      error("Password minimal 6 karakter");
      setChangingPassword(false);
      return;
    }

    try {
      await api.post("/teacher/change-password", {
        current_password: passwords.current,
        new_password: passwords.new,
      });

      success("Password berhasil diubah");
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (err: any) {
      error(err.response?.data?.detail || "Gagal mengubah password");
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
      <ToastContainer toasts={toasts} remove={removeToast} position="top-center" />
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

        {/* Profile Info Card - Centered Avatar Layout */}
        <div className="glass-card p-5">
          {/* Centered Avatar Section */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-24 h-24">
              {/* Avatar Display */}
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.name}
                  className="w-24 h-24 rounded-full object-cover shadow-[0_8px_25px_rgba(16,185,129,0.3)] border-4 border-white dark:border-stone-800"
                />
              ) : (
                <div className="w-24 h-24 bg-gradient-to-tr from-emerald-600 to-emerald-500 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-[0_8px_25px_rgba(16,185,129,0.3)] border-4 border-white dark:border-stone-800">
                  {profile.name?.charAt(0).toUpperCase() || "G"}
                </div>
              )}
              
              {/* Camera Upload Overlay Button */}
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:bg-emerald-700 transition-colors"
                title="Ganti foto profil"
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="sr-only"
                />
                <Camera className="w-4 h-4 text-white" />
              </label>
            </div>
            
            {/* Name & Email below avatar */}
            <div className="text-center mt-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{profile.name}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{profile.email}</p>
              {profile.phone && (
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  📱 {profile.phone}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                NIP: {profile.nip || "-"}
              </p>
            </div>
          </div>

          {/* Divider */}
          <hr className="my-6 border-gray-200 dark:border-stone-700" />

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
              <Lock className="w-4 h-4" />
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

        {/* Logout Confirmation Modal */}
        <LogoutConfirmModal
          open={showLogoutConfirm}
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      </div>
    </div>
  );
};

export default TeacherProfile;