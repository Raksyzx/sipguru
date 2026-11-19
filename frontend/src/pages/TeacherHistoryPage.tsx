import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, X, ChevronDown, ChevronUp } from "lucide-react";
import TeacherHistoryHeader from "../components/TeacherHistoryHeader";
import api from "../lib/api";
import { SkeletonHistoryList } from "../components/SkeletonLoaders";
import { useAttendance } from "../contexts/AttendanceContext";

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
  grade_name?: string;
  subject_name?: string;
  jurusan_name?: string;
  jurusan_code?: string;
}

const TeacherHistoryPage = () => {
  const { attendanceRevision } = useAttendance();
  const [history, setHistory] = useState<AttendanceLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyDayFilter, setHistoryDayFilter] = useState("");
  const [historyRoomFilter, setHistoryRoomFilter] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("");
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);

  const daysOfWeek = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
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
      setHistoryError("Gagal memuat riwayat presensi. Silakan coba lagi.");
    } finally {
      setHistoryLoading(false);
    }
  }, [historySearch, historyDayFilter, historyRoomFilter, historyStatusFilter]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, attendanceRevision]);

  const roomOptions = useMemo(() => {
    const uniqueRooms = new Map();
    history.forEach((h) => {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 dark:from-stone-950 dark:to-emerald-950/20 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] px-3 sm:pt-8 sm:px-4 md:pb-8 md:pl-24 lg:pl-64">
      <div className="max-w-sm sm:max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto space-y-4 sm:space-y-5 md:space-y-6 teacher-page-content">
        <TeacherHistoryHeader active="attendance" />

        {/* Filters */}
        <div className="glass-card-light p-3.5 sm:p-5">
          <div className="flex items-center gap-2.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari hari atau ruangan..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                aria-label="Cari riwayat presensi"
                className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-stone-800 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowHistoryFilters(!showHistoryFilters)}
              aria-label={showHistoryFilters ? "Sembunyikan filter" : "Tampilkan filter"}
              aria-expanded={showHistoryFilters}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-emerald-600 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              {showHistoryFilters ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </div>

          {showHistoryFilters && (
            <div className="mt-3 p-3 sm:p-4 bg-gray-50 dark:bg-white/5 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Hari
                  </label>
                  <select
                    value={historyDayFilter}
                    onChange={(e) => setHistoryDayFilter(e.target.value)}
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
                <div>
                  <label className="block text-[11px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Status
                  </label>
                  <select
                    value={historyStatusFilter}
                    onChange={(e) => setHistoryStatusFilter(e.target.value)}
                    className="w-full h-[38px] px-3 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-shadow"
                  >
                    <option value="">Semua Status</option>
                    <option value="on_time">Tepat Waktu</option>
                    <option value="late">Terlambat</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Ruangan
                  </label>
                  <select
                    value={historyRoomFilter}
                    onChange={(e) => setHistoryRoomFilter(e.target.value)}
                    className="w-full h-[38px] px-3 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-shadow"
                  >
                    <option value="">Semua Ruangan</option>
                    {roomOptions.map((room: { id: string; name: string }) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {history.length} hasil
                </span>
                <button
                  onClick={clearHistoryFilters}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* History List */}
        {historyError ? (
          <div role="alert" className="glass-card-light space-y-3 p-4 text-center text-sm text-red-700 dark:text-red-300 sm:p-5">
            <p>{historyError}</p>
            <button type="button" onClick={loadHistory} className="min-h-11 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">Coba lagi</button>
          </div>
        ) : historyLoading ? (
          <SkeletonHistoryList />
        ) : history.length === 0 ? (
          <div className="glass-card-light p-4 sm:p-5 text-center text-sm text-gray-500 dark:text-gray-400">
            {historySearch || historyDayFilter || historyRoomFilter || historyStatusFilter
              ? "Tidak ada hasil yang sesuai filter."
              : "Belum ada riwayat bulan ini."}
          </div>
        ) : (
          <div className="glass-card-light p-4 sm:p-5 space-y-2 sm:space-y-3">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                      {h.day_name || "N/A"},{" "}
                      {h.date_str
                        ? new Date(h.date_str).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                          })
                        : "N/A"}
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
                  {(h.subject_name || h.grade_name) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] sm:text-xs">
                      {h.subject_name && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 font-medium">
                          {h.subject_name}
                        </span>
                      )}
                      {(h.grade_name || h.jurusan_code) && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 font-medium">
                          {h.grade_name && (
                            <span>{h.grade_name}</span>
                          )}
                          {h.jurusan_code && (
                            <span className="text-[9px] uppercase tracking-tight opacity-75">{h.jurusan_code}</span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
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
    </div>
  );
};

export default TeacherHistoryPage;
