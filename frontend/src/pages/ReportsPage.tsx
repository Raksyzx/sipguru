import { useState, useEffect } from "react";
import { Download, FileSpreadsheet, FileText, FileOutput, Filter, Loader2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

interface AttendanceRecord {
  id: string;
  teacher_id: string;
  teacher_name: string;
  nip: string;
  room_id: string;
  room_name: string;
  room_code: string;
  status: string;
  lateness_minutes: number;
  created_at: string;
}

interface ReportSummary {
  total: number;
  on_time: number;
  late: number;
  attendance_rate: number;
  avg_lateness_minutes: number;
}

type Period = "daily" | "weekly" | "monthly";

const ReportsPage = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("daily");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [week, setWeek] = useState(1);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period,
        year: year.toString(),
        month: month.toString(),
      });
      if (period === "weekly") {
        params.append("week", week.toString());
      }
      
      const res = await api.get(`/reports/attendance?${params.toString()}`);
      setRecords(res.data.records || []);
      setSummary(res.data.summary || null);
    } catch (err) {
      console.error("Failed to load report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [period, year, month, week]);

  const exportData = async (format: "csv" | "excel" | "pdf") => {
    setExporting(format);
    try {
      const params = new URLSearchParams({
        period,
        year: year.toString(),
        month: month.toString(),
      });
      if (period === "weekly") {
        params.append("week", week.toString());
      }

      const response = await api.get(`/reports/attendance/${format}?${params.toString()}`, {
        responseType: "blob",
      });

      // Create download link
      const blob = new Blob([response.data], {
        type: format === "csv" ? "text/csv" : format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `laporan_absensi_${year}-${month}.${format}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-stone-950 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Laporan Absensi</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Export laporan harian, mingguan, atau bulanan</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card-light p-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Filter Laporan</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Period Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Periode
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="daily">Harian</option>
                <option value="weekly">Mingguan</option>
                <option value="monthly">Bulanan</option>
              </select>
            </div>

            {/* Year */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tahun
              </label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Month */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Bulan
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {[
                  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
                  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
                ].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>

            {/* Week (only for weekly) */}
            {period === "weekly" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Minggu ke-
                </label>
                <select
                  value={week}
                  onChange={(e) => setWeek(parseInt(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {[1, 2, 3, 4].map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { label: "Total Absensi", value: summary.total, color: "bg-emerald-500" },
              { label: "Tepat Waktu", value: summary.on_time, color: "bg-green-500" },
              { label: "Terlambat", value: summary.late, color: "bg-amber-500" },
              { label: "Rate Kehadiran", value: `${summary.attendance_rate}%`, color: "bg-blue-500" },
              { label: "Rata-rata Telat", value: `${summary.avg_lateness_minutes} mnt`, color: "bg-red-500" },
            ].map((stat) => (
              <div key={stat.label} className="glass-card-light p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{stat.label}</p>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${stat.color}`} />
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Export Buttons */}
        <div className="glass-card-light p-6">
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Export Laporan</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => exportData("csv")}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {exporting === "csv" ? (
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              ) : (
                <FileOutput className="w-6 h-6 text-emerald-600" />
              )}
              <div className="text-left">
                <p className="font-semibold text-gray-900 dark:text-white">CSV</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Format spreadsheet</p>
              </div>
            </button>

            <button
              onClick={() => exportData("excel")}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {exporting === "excel" ? (
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              ) : (
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              )}
              <div className="text-left">
                <p className="font-semibold text-gray-900 dark:text-white">Excel</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">.xlsx format</p>
              </div>
            </button>

            <button
              onClick={() => exportData("pdf")}
              disabled={exporting !== null}
              className="flex items-center justify-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {exporting === "pdf" ? (
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              ) : (
                <FileText className="w-6 h-6 text-emerald-600" />
              )}
              <div className="text-left">
                <p className="font-semibold text-gray-900 dark:text-white">PDF</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Dokumen cetak</p>
              </div>
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="glass-card-light overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Detail Absensi</h3>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Memuat data...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Tidak ada data absensi untuk periode yang dipilih.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tanggal</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Waktu</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">NIP</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nama Guru</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ruangan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Telat (mnt)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatDate(record.created_at)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatTime(record.created_at)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{record.nip}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{record.teacher_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{record.room_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                          record.status === "on_time"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                        }`}>
                          {record.status === "on_time" ? "Tepat Waktu" : "Terlambat"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {record.lateness_minutes || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
