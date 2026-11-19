import { useEffect, useState, useCallback } from "react";
import { CalendarCheck, CalendarDays, Clock, FileText, LogOut, Sun, Moon, RotateCw, Menu, Camera, MapPin, CheckCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAuthStore } from "../stores";
import { useTheme } from "../contexts/ThemeContext";
import { LogoutConfirmModal } from "../components/LogoutConfirmModal";
import { LeaveSection } from "../components/LeaveSection";
import {
  SkeletonStatsGrid,
  SkeletonScheduleList,
} from "../components/SkeletonLoaders";
import api from "../lib/api";
import { getFromCache, setInCache } from "../lib/cache";
import { useAttendance } from "../contexts/AttendanceContext";

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

const CACHE_TTL = 2 * 60 * 1000; // 2 menit - balance antara performa & data freshness
const CACHE_TTL_SCHEDULE = 30 * 1000; // 30 detik untuk schedule (sering berubah)

const TeacherDashboard = () => {
  const { user } = useAuth();
  const { attendanceRevision } = useAttendance();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesList, setSchedulesList] = useState<GradeSchedule[]>([]);
  const [day, setDay] = useState("");
  const [history, setHistory] = useState<AttendanceLog[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayStats, setTodayStats] = useState<{ submitted: boolean; count: number } | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const reloadLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Browser tidak mendukung lokasi GPS.");
      setLocationLoading(false);
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
        setLocationLoading(false);
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Izin lokasi ditolak. Aktifkan akses lokasi."
          : error.code === error.TIMEOUT
            ? "Permintaan lokasi timeout."
            : "Lokasi tidak dapat ditentukan.";
        setLocationError(message);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);

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
    try {
      const res = await api.get("/teacher/history");
      setHistory(res.data.history || []);
    } catch (err) {
      console.error("Failed to load attendance summary:", err);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, attendanceRevision]);

  useEffect(() => {
    let cancelled = false;
    api.get("/attendance/today").then((res) => {
      if (!cancelled) {
        setTodayStats({
          submitted: Boolean(res.data?.submitted),
          count: res.data?.logs?.length || 0,
        });
      }
    }).catch(() => {
      if (!cancelled) setTodayStats(null);
    });
    reloadLocation();
    return () => { cancelled = true; };
  }, [reloadLocation, attendanceRevision]);

  const handleRefresh = async () => {
    setRefreshing(true);
    localStorage.removeItem("sipguru_cache_todays_schedule");
    localStorage.removeItem("sipguru_cache_schedule_day");
    localStorage.removeItem("sipguru_cache_my_schedules");
    await Promise.all([
      loadData(true),
      loadHistory(),
      api.get("/attendance/today").then((res) => setTodayStats({
        submitted: Boolean(res.data?.submitted),
        count: res.data?.logs?.length || 0,
      })).catch(() => setTodayStats(null)),
    ]);
    reloadLocation();
    setRefreshing(false);
  };

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

      setInCache("todays_schedule", schedulesData, CACHE_TTL_SCHEDULE);
      setInCache("schedule_day", dayData, CACHE_TTL_SCHEDULE);
      setInCache("teacher_rooms", roomsData, CACHE_TTL);
      setInCache("teacher_leaves", leavesData, CACHE_TTL);
      setInCache("my_schedules", schedulesListData, CACHE_TTL_SCHEDULE);
    } catch {
      // Tampilkan kosong, user tetap bisa presensi
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let animationFrame = 0;
    const handleScroll = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        setScrollProgress(Math.min(scrollTop / 240, 1));
        animationFrame = 0;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  const avatarSize = `${Math.max(40, 56 - scrollProgress * 16)}px`;
  const headerWidthPct = 100 - scrollProgress * 89.33;  // 100% → ~10.67% (40px on 375px screen)
  const headerMaxWidthPx = 640 - scrollProgress * 600;  // 640px → 40px (perfect square with avatar)
  const headerPadding = Math.max(0, 16 - scrollProgress * 16);  // 16px → 0px (exact, no extra padding)
  const gapSize = Math.max(0, 16 - scrollProgress * 16);  // 16px → 0px

  const roomName = (id: string) =>
    rooms.find((r) => r.id === id)?.name || `Ruangan ${id.slice(0, 8)}…`;

  const thisMonth = history.length;
  const onTime = history.filter((h) => h.status === "on_time").length;
  const late = history.filter((h) => h.status === "late").length;

  const pendingLeaves = leaves.filter((l) => l.status === "pending");

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 dark:from-stone-950 dark:to-emerald-950/20 px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-4 md:pb-8 md:pl-24 lg:pl-64">
      {/* Sticky Profile Header - floating, animates on scroll */}
      <div className="sticky top-0 z-50 -mx-3 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:-mx-4 sm:px-4 sm:pt-[calc(env(safe-area-inset-top,0px)+1rem)] md:mx-0 md:px-0 md:pt-4">
        <div
          className="glass-card-light mx-auto overflow-hidden border transition-[width,max-width,padding] duration-300 ease-out motion-reduce:transition-none"
          style={{
            width: `${headerWidthPct}%`,
            maxWidth: `${headerMaxWidthPx}px`,
            minWidth: "40px",
            padding: `${headerPadding}px`,
          }}
        >
          <div
            className="flex items-center justify-center transition-[gap] duration-300 ease-out motion-reduce:transition-none"
            style={{ justifyContent: scrollProgress > 0.98 ? "center" : "space-between", gap: `${gapSize}px` }}
          >
            {/* Avatar with photo support - maintains circular aspect ratio */}
            <div
              className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full"
              style={{ width: avatarSize, height: avatarSize, minWidth: avatarSize, flexBasis: avatarSize, aspectRatio: "1 / 1" }}
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user?.name || "User"}
                  className="block h-full w-full rounded-full object-cover"
                  style={{ aspectRatio: "1 / 1" }}
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center rounded-full bg-emerald-700 font-bold text-white"
                  style={{ fontSize: `${Math.max(20, 24 - scrollProgress * 4)}px`, aspectRatio: "1 / 1" }}
                >
                  {user?.name?.charAt(0) || "G"}
                </div>
              )}
            </div>

            {/* Profile text and actions compact away as the avatar centers */}
            <div
              className="min-w-0 flex-1 overflow-hidden transition-[max-width,opacity] duration-300 ease-out motion-reduce:transition-none"
              style={{ maxWidth: `${320 * (1 - scrollProgress)}px`, opacity: 1 - scrollProgress }}
              aria-hidden={scrollProgress > 0.98}
              tabIndex={scrollProgress > 0.98 ? -1 : 0}
            >
              <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white sm:text-base">{user?.name}</h2>
              <p className="truncate text-xs text-gray-600 dark:text-gray-400 sm:text-sm">{user?.email}</p>
            </div>

            <div
              className="flex flex-shrink-0 items-center gap-1 overflow-hidden transition-[max-width,opacity] duration-300 ease-out motion-reduce:transition-none"
              style={{ maxWidth: `${96 * (1 - scrollProgress)}px`, opacity: 1 - scrollProgress }}
              aria-hidden={scrollProgress > 0.98}
            >
              <div className={scrollProgress > 0.98 ? "pointer-events-none" : "contents"} aria-hidden={scrollProgress > 0.98}>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  aria-label="Refresh dashboard"
                  tabIndex={scrollProgress > 0.98 ? -1 : 0}
                  title="Refresh"
                >
                  <RotateCw className={`h-5 w-5 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowMenu(!showMenu)}
                  aria-label="Buka menu"
                  aria-expanded={showMenu}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-gray-300 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300 ${scrollProgress > 0.98 ? "pointer-events-none opacity-0" : ""}`}
                  tabIndex={scrollProgress > 0.98 ? -1 : 0}
                  title="Menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keep fixed menu elements outside the content spacing group. */}
      {showMenu && (
        <>
          <div
            className="fixed right-4 top-20 w-40 bg-white dark:bg-stone-800 rounded-xl shadow-2xl border-2 border-gray-200 dark:border-stone-700 py-1"
            style={{ zIndex: 99999 }}
          >
            <button
              onClick={() => {
                setShowMenu(false);
                toggleTheme();
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-stone-700 flex items-center gap-2"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === "dark" ? "Mode Terang" : "Mode Gelap"}
            </button>
            <hr className="my-1 border-gray-200 dark:border-stone-700" />
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-stone-700 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Keluar
            </button>
          </div>
          <div
            className="fixed inset-0"
            style={{ zIndex: 99998 }}
            onClick={() => setShowMenu(false)}
            aria-hidden="true"
          />
        </>
      )}

      <div className="max-w-sm sm:max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto space-y-3 sm:space-y-4 md:space-y-5 pt-4">
        {/* Attendance and location status */}
        <div className="grid grid-cols-1 gap-3 animate-stagger-3 sm:grid-cols-2 sm:gap-4">
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
                  {todayStats.submitted ? <CheckCircle className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {todayStats.submitted ? "Sudah Absen Hari Ini" : "Belum Absen Hari Ini"}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{todayStats.count} kali presensi hari ini</p>
                </div>
              </div>
            </div>
          )}
          <div className="glass-card-light p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  location
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                    : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                }`}>
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Status Lokasi</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {locationLoading ? "Memuat lokasi..." : location ? "Lokasi aktif" : locationError || "Lokasi tidak tersedia"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={reloadLocation}
                disabled={locationLoading}
                aria-label="Perbarui lokasi"
                className="flex-shrink-0 p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              >
                <RotateCw className={`w-5 h-5 ${locationLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

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

        {/* Jadwal Hari Ini */}
        {loading ? (
          <SkeletonScheduleList />
        ) : (
          <div id="today-schedule" className="glass-card-light p-4 sm:p-5 animate-stagger-4 scroll-mt-6">
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

        {/* Pengajuan Izin */}
        {loading ? (
          <div role="status" aria-label="Memuat pengajuan izin" className="h-14 animate-pulse rounded-2xl bg-gray-200 motion-reduce:animate-none dark:bg-stone-800" />
        ) : (
          <LeaveSection
            schedulesList={schedulesList}
            hasPending={pendingLeaves.length > 0}
            onSubmit={async (leaveData) => {
              try {
                const res = await api.post<{ leave_id: string }>("/teacher/leave", leaveData);
                const schedInfo = schedulesList.find((s) => s.id === leaveData.schedule_id);
                setLeaves((prev) => [
                  {
                    id: res.data.leave_id,
                    teacher_id: user?.id || "",
                    start_date: leaveData.start_date,
                    end_date: leaveData.end_date,
                    reason: leaveData.reason,
                    status: "pending",
                    schedule_id: leaveData.schedule_id || undefined,
                    grade_name: schedInfo?.grade_name,
                    subject_name: schedInfo?.subject_name,
                    day_of_week: schedInfo?.day_of_week,
                    start_time: schedInfo?.start_time,
                    end_time: schedInfo?.end_time,
                  },
                  ...prev,
                ]);
                localStorage.removeItem("sipguru_cache_teacher_leaves");
                return { success: true };
              } catch (err: any) {
                const errorMsg = err?.response?.data?.detail || err?.message || "Gagal mengajukan izin";
                console.error("[Leave Submit Error]", err);
                return { success: false, error: errorMsg };
              }
            }}
          />
        )}

        {/* Riwayat Izin */}
        {!loading && leaves.length > 0 && (
          <div className="glass-card-light p-4 sm:p-5 animate-stagger-5">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4">Riwayat Izin</h3>
            <div className="space-y-2 sm:space-y-3">
              {leaves.map((l) => (
                <div key={l.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">{l.start_date} - {l.end_date}</p>
                    {l.subject_name && <p className="text-[10px] sm:text-xs font-medium text-emerald-600 dark:text-emerald-400 truncate">{l.grade_name} - {l.subject_name}</p>}
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">{l.reason}</p>
                  </div>
                  <span className={`px-2 py-1 text-[10px] sm:text-xs rounded-full font-medium flex-shrink-0 ml-2 ${l.status === "pending" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" : l.status === "approved" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}>
                    {l.status === "pending" ? "Menunggu" : l.status === "approved" ? "Disetujui" : "Ditolak"}
                  </span>
                </div>
              ))}
            </div>
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
