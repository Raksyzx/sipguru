import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { SkeletonFullSchedule } from "../components/SkeletonLoaders";

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

const TeacherSchedulePage = () => {
  const navigate = useNavigate();
  const [schedulesList, setSchedulesList] = useState<GradeSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const daysOfWeek = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

  const loadSchedules = useCallback(async () => {
    try {
      const res = await api.get("/teacher/my-schedules");
      setSchedulesList(res.data.schedules || []);
    } catch (err) {
      console.error("Failed to load schedules:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const filteredSchedules = schedulesList.filter((s) => {
    const matchSearch =
      search === "" ||
      s.grade_name.toLowerCase().includes(search.toLowerCase()) ||
      s.subject_name.toLowerCase().includes(search.toLowerCase()) ||
      s.teacher_name.toLowerCase().includes(search.toLowerCase());
    const matchDay = dayFilter === "" || s.day_of_week === dayFilter;
    return matchSearch && matchDay;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 dark:from-stone-950 dark:to-emerald-950/20 pt-6 pb-6 md:pb-8 px-3 sm:pt-8 sm:px-4 md:pl-24 lg:pl-64">
      <div className="max-w-sm sm:max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto space-y-4 sm:space-y-5 md:space-y-6 teacher-page-content">
        {/* Header */}
        <div className="glass-card-light p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/teacher/dashboard")}
              aria-label="Kembali ke Beranda"
              title="Kembali ke Beranda"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-emerald-600 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="min-w-0 text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">
              Jadwal Mengajar Lengkap
            </h1>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card-light p-3.5 sm:p-5">
          <div className="flex items-center gap-2.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari kelas, mapel, atau guru..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Cari jadwal mengajar"
                className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-stone-800 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              aria-label={showFilters ? "Sembunyikan filter" : "Tampilkan filter"}
              aria-expanded={showFilters}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-emerald-600 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              {showFilters ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </div>

          {showFilters && (
            <div className="mt-3 p-3 sm:p-4 bg-gray-50 dark:bg-white/5 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Filter Hari
                  </label>
                  <select
                    value={dayFilter}
                    onChange={(e) => setDayFilter(e.target.value)}
                    className="w-full h-[38px] px-3 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-shadow"
                  >
                    <option value="">Semua Hari</option>
                    {daysOfWeek.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {filteredSchedules.length} jadwal
                </span>
                <button
                  onClick={() => {
                    setSearch("");
                    setDayFilter("");
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Schedule List */}
        {loading ? (
          <SkeletonFullSchedule />
        ) : filteredSchedules.length === 0 ? (
          <div className="glass-card-light p-4 sm:p-5 text-center text-sm text-gray-500 dark:text-gray-400">
            Tidak ada jadwal mengajar.
          </div>
        ) : (
          <div className="glass-card-light p-4 sm:p-5 space-y-2 sm:space-y-3">
            {filteredSchedules.map((s) => (
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
    </div>
  );
};

export default TeacherSchedulePage;
