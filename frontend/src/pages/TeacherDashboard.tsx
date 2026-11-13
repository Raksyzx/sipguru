import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CalendarDays, Clock, FileText, LogOut, QrCode, User, CalendarX, Sun, Moon, Search, X, ChevronDown, ChevronUp } from "lucide-react";
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
  room_name?: string;
  status: string;
  created_at: string;
  day_name?: string;
  date_str?: string;
  time_str?: string;
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

const CACHE_TTL = 10 * 60 * 1000;

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

  // History filters
  const [historySearch, setHistorySearch] = useState("");
  const [historyDayFilter, setHistoryDayFilter] = useState("");
  const [historyRoomFilter, setHistoryRoomFilter] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("");
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };
  const confirmLogout = () => {
    useAuthStore.getState().logout();
    setShowLogoutConfirm(false);
    window.location.href = "/login";
  };

  const { theme, toggleTheme } = useTheme();

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (historySearch) params.append("search", historySearch);
      if (historyDayFilter) params.append("day", historyDayFilter);
      if (historyRoomFilter) params.append("room_id", historyRoomFilter);
      if (historyStatusFilter) params.append("status", historyStatusFilter);
      
      const res = await api.get(`/teacher/history?${params.toString()}`);
      setHistory(res.data.history || []);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [historySearch, historyDayFilter, historyRoomFilter, historyStatusFilter]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const loadData = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cachedSchedules = getFromCache<Schedule[]>("todays_schedule");
      const cachedDay = getFromCache<string>("schedule_day");
      const cachedRooms = getFromCache<{ id: string; name: string }[]>("teacher_rooms");
      const cachedLeaves = getFromCache<LeaveRequest[]>("teacher_leaves");
      const cachedSchedulesList = getFromCache<GradeSchedule[]>("my_schedules");

      if (cachedSchedules && cachedRooms) {
        setSchedules(cachedSchedules);
        setDay(cachedDay || "");
        setRooms(cachedRooms);
        setLeaves(cachedLeaves || []);
        setSchedulesList(cachedSchedulesList || []);
        setLoading(false);
        return;
      }
    }

    try {
      const [schedRes, rmRes, leavesRes, mySchedRes] = await Promise.all([
        api.get("/teacher/todays-schedule").catch(() => ({ data: { schedules: [], day: "" } })),
        api.get("/teacher/rooms").catch(() => ({ data: { rooms: [] } })),
        api.get("/teacher/leave").catch(() => ({ data: { leaves: [] } })),
        api.get("/teacher/my-schedules").catch(() => ({ data: { schedules: [] } })),
      ]);

      const schedulesData = schedRes.data?.schedules || [];
      const dayData = schedRes.data?.day || "";
      const roomsData = rmRes.data?.rooms || [];
      const leavesData = leavesRes.data?.leaves || [];
      const schedulesListData = mySchedRes.data?.schedules || [];

      setSchedules(schedulesData);
      setDay(dayData);
      setRooms(roomsData);
      setLeaves(leavesData);
      setSchedulesList(schedulesListData);

      setInCache("todays_schedule", schedulesData, CACHE_TTL);
      setInCache("schedule_day", dayData, CACHE_TTL);
      setInCache("teacher_rooms", roomsData, CACHE_TTL);
      setInCache("teacher_leaves", leavesData, CACHE_TTL);
      setInCache("my_schedules", schedulesListData, CACHE_TTL);
    } catch {
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

  const daysOfWeek = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const roomOptions = useMemo(() => {
    const uniqueRooms = new Map();
    history.forEach(h => {
      if (h.room_id && h.room_name) {
        uniqueRooms.set(h.room_id, h.room_name);
      }
    });
    return Array.from(uniqueRooms.entries()).map(([id, name]) => ({ id, name }));
  }, [history]);

  const clearHistoryFilters = () => {
    setHistorySearch("");
    setHistoryDayFilter("");
    setHistoryRoomFilter("");
    setHistoryStatusFilter("");
  };

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
      
      setLeaves((prev) => [
        {
          id: "",
          teacher_id: user?.id || "",
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
      localStorage.removeItem("sipguru_cache_teacher_leaves");
    } catch {
      alert("Gagal mengajukan izin");
    }
  };

  const pendingLeaves = leaves.filter((l) => l.status === "pending");

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 dark:from-stone-950 dark:to-emerald-950/20 py-6 px-3 sm:py-8 sm:px-4">
      <div className="max-w-sm sm:max-w-2xl mx-auto space-y-4 sm:space-y-5 animate-in fade-in duration-400">
        {/* Profile Card - compact */}
        {loading ? (
          <SkeletonCard className="animate-stagger-1" />
        ) : (
          <div className="glass-card-light p-4 sm:p-5 animate-stagger-1">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-tr from-emerald-600 to-emerald-500 rounded-full flex items-center justify-center text-white shadow-[0_6px_20px_rgba(16,185,129,0.25)] flex-shrink-0">
                <span className="text-xl sm:text-2xl font-bold">{user?.name?.charAt(0) || "G"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-white truncate">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <span className="truncate">{user?.name}</span>
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">{user?.email}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                  title="Keluar"
                >
                  <LogOut className="w-5 h-5" />
                </button>
                <button
                  onClick={toggleTheme}
                  className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition-colors"
                  title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
                >
                  {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CTA Presensi - full width prominent */}
        <Link to="/attendance" className="block animate-stagger-2">
          <div className="btn-primary w-full py-4 text-base sm:text-lg tracking-wide justify-center shadow-[0_8px_25px_rgba(16,185,129,0.3)] hover:shadow-[0_12px_35px_rgba(16,185,129,0.4)]">
            <QrCode className="w-5 h-5 sm:w-6 sm:h-6" />
            Presensi Sekarang
          </div>
        </Link>

        {/* Stats Grid - responsive */}
        {loading ? (
          <SkeletonStatsGrid />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:gap-4 animate-stagger-3">
            {[
              { label: "Bulan ini", value: thisMonth, icon: CalendarDays, color: "emerald" },
              { label: "Tepat waktu", value: onTime, icon: Clock, color: "green" },
              { label: "Terlambat", value: late, icon: FileText, color: "amber" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="glass-card-light p-3 sm:p-4 text-center transition-all duration-300 hover:-translate-y-0.5">
                <Icon className={`w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 text-${color}-600 dark:text-${color}-400`} />
                <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Pengajuan Izin - compact form */}
        {loading ? (
          <SkeletonLeaveForm />
        ) : (
          <div className="glass-card-light p-4 sm:p-5 animate-stagger-4">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <CalendarX className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Ajukan Izin
            </h3>
            <form onSubmit={sendLeave} className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    required
                    value={newLeave.startDate}
                    onChange={(e) => setNewLeave({ ...newLeave, startDate: e.target.value })}
                    className="w-full px-2.5 sm:px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    required
                    value={newLeave.endDate}
                    onChange={(e) => setNewLeave({ ...newLeave, endDate: e.target.value })}
                    className="w-full px-2.5 sm:px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Jadwal Mapel (opsional)
                </label>
                <select
                  value={newLeave.schedule_id}
                  onChange={(e) => setNewLeave({ ...newLeave, schedule_id: e.target.value })}
                  className="w-full px-2.5 sm:px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">Pilih jadwal mapel</option>
                  {schedulesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.grade_name} - {s.subject_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Alasan
                </label>
                <textarea
                  required
                  rows={2}
                  value={newLeave.reason}
                  onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                  className="w-full px-2.5 sm:px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="Isi alasan izin..."
                />
              </div>
              <button
                type="submit"
                disabled={pendingLeaves.length > 0}
                className={`w-full py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
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
          <div className="glass-card-light p-4 sm:p-5 animate-stagger-5">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4">Riwayat Izin</h3>
            <div className="space-y-2 sm:space-y-3">
              {leaves.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">
                      {l.start_date} - {l.end_date}
                    </p>
                    {l.subject_name && (
                      <p className="text-[10px] sm:text-xs font-medium text-emerald-600 dark:text-emerald-400 truncate">
                        {l.grade_name} - {l.subject_name}
                      </p>
                    )}
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">{l.reason}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-[10px] sm:text-xs rounded-full font-medium flex-shrink-0 ml-2 ${
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
          <div className="glass-card-light p-4 sm:p-5 animate-stagger-4">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Jadwal Hari Ini {day && <span className="text-gray-500 dark:text-gray-400 font-normal text-xs sm:text-sm">({day})</span>}
            </h3>
            {schedules.length === 0 ? (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Tidak ada jadwal hari ini.</p>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {schedules.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white truncate">{roomName(s.room_id)}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{s.day_of_week}</p>
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex-shrink-0 ml-2">
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
          <div className="glass-card-light p-4 sm:p-5 animate-stagger-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Riwayat Presensi</h3>
              <button
                onClick={() => setShowHistoryFilters(!showHistoryFilters)}
                className="p-2 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 rounded-lg transition-colors"
                title={showHistoryFilters ? "Sembunyikan filter" : "Tampilkan filter"}
              >
                {showHistoryFilters ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>
            
            {/* Filter Section */}
            {showHistoryFilters && (
              <div className="mb-4 p-3 sm:p-4 bg-gray-50 dark:bg-white/5 rounded-xl space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cari hari atau ruangan..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <select
                    value={historyDayFilter}
                    onChange={(e) => setHistoryDayFilter(e.target.value)}
                    className="px-2.5 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">Semua Hari</option>
                    {daysOfWeek.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                  <select
                    value={historyStatusFilter}
                    onChange={(e) => setHistoryStatusFilter(e.target.value)}
                    className="px-2.5 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">Semua Status</option>
                    <option value="on_time">Tepat Waktu</option>
                    <option value="late">Terlambat</option>
                  </select>
                  <select
                    value={historyRoomFilter}
                    onChange={(e) => setHistoryRoomFilter(e.target.value)}
                    className="px-2.5 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">Semua Ruangan</option>
                    {roomOptions.map((room: { id: string; name: string }) => (
                      <option key={room.id} value={room.id}>{room.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {history.length} hasil
                  </span>
                  <button
                    onClick={clearHistoryFilters}
                    className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <X className="w-3 h-3" />
                    Reset Filter
                  </button>
                </div>
              </div>
            )}
            
            {historyLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse flex items-center justify-between py-3">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                    </div>
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                  </div>
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {historySearch || historyDayFilter || historyRoomFilter || historyStatusFilter 
                  ? "Tidak ada hasil yang sesuai filter." 
                  : "Belum ada riwayat bulan ini."}
              </p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="py-2.5 sm:py-3 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">
                          {h.day_name || "N/A"}, {h.date_str ? new Date(h.date_str).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "N/A"}
                        </p>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">•</span>
                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                          {h.room_name || "Unknown"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                          {h.time_str || "N/A"}
                        </p>
                        {h.lateness_minutes ? (
                          <>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">•</span>
                            <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400">
                              Terlambat {h.lateness_minutes} mnt
                            </p>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 text-[10px] sm:text-xs rounded-full font-medium flex-shrink-0 ml-2 ${
                        h.status === "on_time"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                      }`}
                    >
                      {h.status === "on_time" ? "Tepat waktu" : "Terlambat"}
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
          <div className="glass-card-light p-4 sm:p-5 animate-stagger-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Jadwal Mengajar Lengkap
            </h3>
            {schedulesList.length === 0 ? (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Belum ada jadwal mengajar.</p>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {schedulesList.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                        {s.grade_name} - {s.subject_name}
                      </p>
                      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
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
