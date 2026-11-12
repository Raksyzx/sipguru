import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CalendarDays, Clock, FileText, LogOut, QrCode, User, CalendarX, Sun, Moon } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAuthStore } from "../stores";
import { useTheme } from "../contexts/ThemeContext";
import { LogoutConfirmModal } from "../components/LogoutConfirmModal";
import {
  SkeletonCard,
  SkeletonStatsGrid,
  SkeletonLeaveForm,
  SkeletonScheduleList,
  SkeletonHistoryList,
  SkeletonFullSchedule,
} from "../components/SkeletonLoaders";
import api from "../lib/api";
import { getFromCache, setInCache } from "../lib/cache";

interface Schedule {
  id: string;
  room_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

interface AttendanceLog {
  id: string;
  room_id: string;
  status: string;
  created_at: string;
  lateness_minutes?: number | null;
}

interface LeaveRequest {
  id: string;
  teacher_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  schedule_id?: string;
  grade_name?: string;
  subject_name?: string;
  day_of_week?: string;
  start_time?: string;
  end_time?: string;
}

interface GradeSchedule {
  id: string;
  grade_name: string;
  subject_name: string;
  teacher_name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room_name?: string;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 menit untuk data jadwal

const TeacherDashboard = () => {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesList, setSchedulesList] = useState<GradeSchedule[]>([]);
  const [day, setDay] = useState("");
  const [history, setHistory] = useState<AttendanceLog[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLeave, setNewLeave] = useState({
    startDate: "",
    endDate: "",
    reason: "",
    schedule_id: "",
  });

  // Logout confirmation state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    console.log("Logout clicked, showing modal");
    setShowLogoutConfirm(true);
  };
  const confirmLogout = () => {
    console.log("Logout confirmed");
    useAuthStore.getState().logout();
    setShowLogoutConfirm(false);
    window.location.href = "/login";
  };

  // Theme
  const { theme, toggleTheme } = useTheme();

  // Load data dengan parallel fetching + caching + error handling
  const loadData = useCallback(async (forceRefresh = false) => {
    // Coba load dari cache dulu (kecuali force refresh)
    if (!forceRefresh) {
      const cachedSchedules = getFromCache<Schedule[]>("todays_schedule");
      const cachedDay = getFromCache<string>("schedule_day");
      const cachedHistory = getFromCache<AttendanceLog[]>("attendance_history");
      const cachedRooms = getFromCache<{ id: string; name: string }[]>("teacher_rooms");
      const cachedLeaves = getFromCache<LeaveRequest[]>("teacher_leaves");
      const cachedSchedulesList = getFromCache<GradeSchedule[]>("my_schedules");

      if (cachedSchedules && cachedHistory && cachedRooms) {
        setSchedules(cachedSchedules);
        setDay(cachedDay || "");
        setHistory(cachedHistory);
        setRooms(cachedRooms);
        setLeaves(cachedLeaves || []);
        setSchedulesList(cachedSchedulesList || []);
        setLoading(false);
        return;
      }
    }

    try {
      console.log("[TeacherDashboard] Loading data for user:", user?.id, user?.email);
      
      // Parallel API calls with error logging
      const [schedRes, histRes, rmRes, leavesRes, mySchedRes] = await Promise.all([
        api.get("/teacher/todays-schedule").catch(err => {
          console.error("[TeacherDashboard] Failed to load todays-schedule:", err.response?.status, err.response?.data);
          return { data: { schedules: [], day: "" } };
        }),
        api.get("/teacher/history").catch(err => {
          console.error("[TeacherDashboard] Failed to load history:", err.response?.status, err.response?.data);
          return { data: { history: [] } };
        }),
        api.get("/teacher/rooms").catch(err => {
          console.error("[TeacherDashboard] Failed to load rooms:", err.response?.status, err.response?.data);
          return { data: { rooms: [] } };
        }),
        api.get("/teacher/leave").catch(err => {
          console.error("[TeacherDashboard] Failed to load leaves:", err.response?.status, err.response?.data);
          return { data: { leaves: [] } };
        }),
        api.get("/teacher/my-schedules").catch(err => {
          console.error("[TeacherDashboard] Failed to load my-schedules:", err.response?.status, err.response?.data);
          return { data: { schedules: [] } };
        }),
      ]);

      console.log("[TeacherDashboard] API Responses:", {
        schedules: schedRes.data?.schedules?.length || 0,
        history: histRes.data?.history?.length || 0,
        rooms: rmRes.data?.rooms?.length || 0,
        leaves: leavesRes.data?.leaves?.length || 0,
        mySchedules: mySchedRes.data?.schedules?.length || 0,
      });

      const schedulesData = schedRes.data?.schedules || [];
      const dayData = schedRes.data?.day || "";
      const historyData = histRes.data?.history || [];
      const roomsData = rmRes.data?.rooms || [];
      const leavesData = leavesRes.data?.leaves || [];
      const schedulesListData = mySchedRes.data?.schedules || [];

      // Update state
      setSchedules(schedulesData);
      setDay(dayData);
      setHistory(historyData);
      setRooms(roomsData);
      setLeaves(leavesData);
      setSchedulesList(schedulesListData);

      // Simpan ke cache
      setInCache("todays_schedule", schedulesData, CACHE_TTL);
      setInCache("schedule_day", dayData, CACHE_TTL);
      setInCache("attendance_history", historyData, CACHE_TTL);
      setInCache("teacher_rooms", roomsData, CACHE_TTL);
      setInCache("teacher_leaves", leavesData, CACHE_TTL);
      setInCache("my_schedules", schedulesListData, CACHE_TTL);
    } catch (err: any) {
      console.error("[TeacherDashboard] Critical error:", err);
      // Tampilkan kosong, user tetap bisa presensi
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const roomName = (id: string) =>
    rooms.find((r) => r.id === id)?.name || `Ruangan ${id.slice(0, 8)}…`;

  const thisMonth = history.length;
  const onTime = history.filter((h) => h.status === "on_time").length;
  const late = history.filter((h) => h.status === "late").length;

  const sendLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeave.startDate || !newLeave.endDate || !newLeave.reason) {
      alert("Semua field harus diisi");
      return;
    }
    try {
      await api.post("/teacher/leave", {
        start_date: newLeave.startDate,
        end_date: newLeave.endDate,
        reason: newLeave.reason,
        schedule_id: newLeave.schedule_id || null,
      });
      const schedInfo = schedulesList.find((s) => s.id === newLeave.schedule_id);
      
      // Optimistic update
      setLeaves((prev) => [
        {
          id: "",
          teacher_id: (user as unknown as { id?: string })?.id || "",
          start_date: newLeave.startDate,
          end_date: newLeave.endDate,
          reason: newLeave.reason,
          status: "pending",
          schedule_id: newLeave.schedule_id || undefined,
          grade_name: schedInfo?.grade_name,
          subject_name: schedInfo?.subject_name,
          day_of_week: schedInfo?.day_of_week,
          start_time: schedInfo?.start_time,
          end_time: schedInfo?.end_time,
        },
        ...prev,
      ]);
      
      setNewLeave({ startDate: "", endDate: "", reason: "", schedule_id: "" });
      alert("Izin berhasil diajukan");
      
      // Invalidate cache leaves
      localStorage.removeItem("sipguru_cache_teacher_leaves");
    } catch {
      alert("Gagal mengajukan izin");
    }
  };

  const pendingLeaves = leaves.filter((l) => l.status === "pending");

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 dark:from-stone-950 dark:to-emerald-950/20 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
        {/* Profile Card */}
        {loading ? (
          <SkeletonCard className="animate-stagger-1" />
        ) : (
          <div className="glass-card-light p-6 animate-stagger-1">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-tr from-emerald-600 to-emerald-500 rounded-full flex items-center justify-center text-white shadow-[0_8px_25px_rgba(16,185,129,0.25)]">
                <span className="text-2xl font-bold">{user?.name?.charAt(0) || "G"}</span>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
                  <User className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  {user?.name}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                title="Keluar"
              >
                <LogOut className="w-5 h-5" />
              </button>
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition-colors"
                title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        )}

        {/* CTA Presensi */}
        <Link
          to="/attendance"
          className="block animate-stagger-2"
        >
          <div className="btn-primary w-full py-4 text-lg tracking-wide justify-center shadow-[0_8px_25px_rgba(16,185,129,0.3)] hover:shadow-[0_12px_35px_rgba(16,185,129,0.4)]">
            <QrCode className="w-6 h-6" />
            Presensi Sekarang
          </div>
        </Link>

        {/* Stats Grid */}
        {loading ? (
          <SkeletonStatsGrid />
        ) : (
          <div className="grid grid-cols-3 gap-4 animate-stagger-3">
            {[
              { label: "Bulan ini", value: thisMonth, icon: CalendarDays, color: "emerald" },
              { label: "Tepat waktu", value: onTime, icon: Clock, color: "green" },
              { label: "Terlambat", value: late, icon: FileText, color: "amber" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="glass-card-light p-4 text-center transition-all duration-300 hover:-translate-y-1">
                <Icon className={`w-6 h-6 mx-auto mb-2 text-${color}-600 dark:text-${color}-400`} />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Pengajuan Izin */}
        {loading ? (
          <SkeletonLeaveForm />
        ) : (
          <div className="glass-card-light p-6 animate-stagger-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <CalendarX className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Ajukan Izin
            </h3>
            <form onSubmit={sendLeave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    required
                    value={newLeave.startDate}
                    onChange={(e) => setNewLeave({ ...newLeave, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    required
                    value={newLeave.endDate}
                    onChange={(e) => setNewLeave({ ...newLeave, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Jadwal Mapel (opsional)
                </label>
                <select
                  value={newLeave.schedule_id}
                  onChange={(e) => setNewLeave({ ...newLeave, schedule_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">Pilih jadwal mapel</option>
                  {schedulesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.grade_name} - {s.subject_name} ({s.day_of_week} {s.start_time}-{s.end_time})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Alasan
                </label>
                <textarea
                  required
                  rows={2}
                  value={newLeave.reason}
                  onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Isi alasan izin..."
                />
              </div>
              <button
                type="submit"
                disabled={pendingLeaves.length > 0}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                  pendingLeaves.length > 0
                    ? "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_4px_10px_rgba(16,185,129,0.25)]"
                }`}
              >
                {pendingLeaves.length > 0 ? "Izin sedang diproses" : "Kirim Permohonan Izin"}
              </button>
            </form>
          </div>
        )}

        {/* Riwayat Izin */}
        {!loading && leaves.length > 0 && (
          <div className="glass-card-light p-6 animate-stagger-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Riwayat Izin</h3>
            <div className="space-y-3">
              {leaves.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {l.start_date} - {l.end_date}
                    </p>
                    {l.subject_name && (
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {l.grade_name} - {l.subject_name} ({l.day_of_week} {l.start_time}-{l.end_time})
                      </p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400">{l.reason}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded-full font-medium ${
                      l.status === "pending"
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                        : l.status === "approved"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                    }`}
                  >
                    {l.status === "pending" ? "Menunggu" : l.status === "approved" ? "Disetujui" : "Ditolak"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Jadwal Hari Ini */}
        {loading ? (
          <SkeletonScheduleList />
        ) : (
          <div className="glass-card-light p-6 animate-stagger-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Jadwal Hari Ini {day && <span className="text-gray-500 dark:text-gray-400 font-normal">({day})</span>}
            </h3>
            {schedules.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada jadwal hari ini.</p>
            ) : (
              <div className="space-y-3">
                {schedules.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-white">{roomName(s.room_id)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{s.day_of_week}</p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {s.start_time} – {s.end_time}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Riwayat Presensi */}
        {loading ? (
          <SkeletonHistoryList />
        ) : (
          <div className="glass-card-light p-6 animate-stagger-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Riwayat Presensi</h3>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada riwayat bulan ini.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {history.slice(0, 10).map((h) => (
                  <div key={h.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {new Date(h.created_at).toLocaleDateString("id-ID", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                      {h.lateness_minutes ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Terlambat {h.lateness_minutes} mnt
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`px-3 py-1 text-xs rounded-full font-medium ${
                        h.status === "on_time"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                      }`}
                    >
                      {h.status === "on_time" ? "Tepat waktu" : h.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Jadwal Mengajar Lengkap */}
        {loading ? (
          <SkeletonFullSchedule />
        ) : (
          <div className="glass-card-light p-6 animate-stagger-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Jadwal Mengajar Lengkap
            </h3>
            {schedulesList.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada jadwal mengajar.</p>
            ) : (
              <div className="space-y-3">
                {schedulesList.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {s.grade_name} - {s.subject_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {s.day_of_week} • {s.start_time} – {s.end_time} • {s.room_name || "Ruangan TBA"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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

export default TeacherDashboard;
