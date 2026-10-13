import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Mail, Shield, Eye, EyeOff, Lock } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import api from "../lib/api";

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Email dan password harus diisi");
      return;
    }

    setIsLoading(true);

    try {
      const { data } = await api.post("/auth/login", { email, password });

      let name = email.split("@")[0];
      try {
        const profile = await api.get("/teacher/profile", {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (profile.data?.user?.name) name = profile.data.user.name;
      } catch {
        // fall back to email prefix
      }

      login(
        { id: data.user_id, email: email, name, role: data.role },
        data.access_token,
        data.refresh_token
      );

      if (data.role === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/teacher/dashboard");
      }
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail || "Gagal menghubungi server. Periksa koneksi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 dark:from-stone-950 dark:to-emerald-950/20 flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-md animate-in fade-in duration-500">
        {/* Brand Header */}
        <div className="text-center mb-8 space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-500 shadow-[0_10px_30px_rgba(16,185,129,0.3)] dark:shadow-[0_10px_30px_rgba(16,185,129,0.4)]">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            SIPGURU
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Sistem Presensi Guru Terpercaya
          </p>
        </div>

        {/* Glass Card */}
        <div className="glass-card p-8 md:p-10 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="label-field">
              Alamat Email
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-11"
                placeholder="admin@sipguru.com"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="label-field">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-11 pr-11"
                placeholder="••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50/50 border border-red-200/50 dark:bg-red-950/20 dark:border-red-800/50">
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                {error}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-4 text-lg tracking-wide"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Memproses...
              </span>
            ) : (
              "Masuk ke Akun"
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Belum punya akun?{" "}
            <a href="#" className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-semibold transition-colors">
              Hubungi admin
            </a>
          </p>
        </div>
        </div>

        <p className="text-center text-xs text-gray-500 dark:text-gray-500 mt-6">
          Aman dan Terenkripsi
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
