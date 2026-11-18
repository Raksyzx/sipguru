import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import TeacherHistoryHeader from "../components/TeacherHistoryHeader";
import { SkeletonHistoryList } from "../components/SkeletonLoaders";
import api from "../lib/api";

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  grade_name?: string | null;
  subject_name?: string | null;
  day_of_week?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

const leaveStatuses: Record<string, { label: string; className: string }> = {
  pending: { label: "Menunggu", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" },
  approved: { label: "Disetujui", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" },
  rejected: { label: "Ditolak", className: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" },
};

const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
  });
};

const TeacherLeaveHistoryPage = () => {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<{ leaves: LeaveRequest[] }>("/teacher/leave");
      setLeaves(res.data.leaves || []);
    } catch {
      setError("Gagal memuat riwayat izin. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadLeaves(); }, [loadLeaves]);

  const filteredLeaves = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return leaves.filter((leave) => {
      if (statusFilter && leave.status !== statusFilter) return false;
      const text = [leave.reason, leave.start_date, leave.end_date, formatDate(leave.start_date), formatDate(leave.end_date), leave.grade_name, leave.subject_name, leave.day_of_week].filter(Boolean).join(" ").toLocaleLowerCase("id-ID");
      return !query || text.includes(query);
    });
  }, [leaves, search, statusFilter]);

  const clearFilters = () => { setSearch(""); setStatusFilter(""); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 px-3 pt-6 pb-6 md:pb-8 dark:from-stone-950 dark:to-emerald-950/20 sm:px-4 sm:pt-8 md:pl-24">
      <div className="teacher-page-content mx-auto max-w-sm space-y-4 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl sm:space-y-5 md:space-y-6">
        <TeacherHistoryHeader active="leave" />

        <div className="glass-card-light p-3.5 sm:p-5">
          <div className="flex items-center gap-2.5">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" placeholder="Cari alasan, tanggal, atau mapel..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cari riwayat izin" className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-stone-800 dark:text-white" />
            </div>
            <button type="button" onClick={() => setShowFilters(!showFilters)} aria-label={showFilters ? "Sembunyikan filter" : "Tampilkan filter"} aria-expanded={showFilters} aria-controls="leave-history-filters" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-emerald-600 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/30">
              {showFilters ? <ChevronUp aria-hidden="true" className="h-5 w-5" /> : <ChevronDown aria-hidden="true" className="h-5 w-5" />}
            </button>
          </div>
          {showFilters && (
            <div id="leave-history-filters" className="mt-3 space-y-3 rounded-xl bg-gray-50 p-3 dark:bg-white/5 sm:p-4">
              <div>
                <label htmlFor="leave-history-status" className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Status</label>
                <select id="leave-history-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-stone-800 dark:text-white">
                  <option value="">Semua Status</option>
                  <option value="pending">Menunggu</option>
                  <option value="approved">Disetujui</option>
                  <option value="rejected">Ditolak</option>
                </select>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
                <span role="status" className="text-xs text-gray-500 dark:text-gray-400">{filteredLeaves.length} hasil</span>
                <button type="button" onClick={clearFilters} className="flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/30"><X aria-hidden="true" className="h-3.5 w-3.5" />Reset</button>
              </div>
            </div>
          )}
        </div>

        <section aria-label="Daftar riwayat izin" aria-busy={loading}>
          {loading ? <SkeletonHistoryList /> : error ? (
            <div role="alert" className="glass-card-light space-y-3 p-4 text-center text-sm text-red-700 dark:text-red-300 sm:p-5">
              <p>{error}</p>
              <button type="button" onClick={loadLeaves} className="min-h-11 rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">Coba lagi</button>
            </div>
          ) : filteredLeaves.length === 0 ? (
            <p role="status" className="glass-card-light p-4 text-center text-sm text-gray-500 dark:text-gray-400 sm:p-5">{search.trim() || statusFilter ? "Tidak ada hasil yang sesuai filter." : "Belum ada riwayat izin."}</p>
          ) : (
            <ul className="glass-card-light divide-y divide-gray-100 px-4 dark:divide-gray-800 sm:px-5">
              {filteredLeaves.map((leave) => {
                const status = leaveStatuses[leave.status] || { label: "Status belum tersedia", className: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" };
                return (
                  <li key={leave.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 text-xs font-semibold leading-relaxed text-gray-900 dark:text-white sm:text-sm">{formatDate(leave.start_date)}{leave.end_date !== leave.start_date && <> – {formatDate(leave.end_date)}</>}</p>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium sm:text-xs ${status.className}`}>{status.label}</span>
                    </div>
                    {(leave.grade_name || leave.subject_name) && <p className="break-words text-xs font-medium text-emerald-700 dark:text-emerald-400">{[leave.grade_name, leave.subject_name].filter(Boolean).join(" · ")}</p>}
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600 [overflow-wrap:anywhere] dark:text-gray-400">{leave.reason}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default TeacherLeaveHistoryPage;
