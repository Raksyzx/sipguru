import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TeacherHistoryHeaderProps {
  active: "attendance" | "leave";
}

const TeacherHistoryHeader = ({ active }: TeacherHistoryHeaderProps) => {
  const navigate = useNavigate();
  const buttonClass = (selected: boolean) =>
    `min-h-11 min-w-0 rounded-xl px-2 py-2 text-xs font-semibold leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 motion-reduce:transition-none dark:focus-visible:ring-offset-stone-900 min-[400px]:text-sm sm:px-3 sm:text-base ${
      selected
        ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-600"
        : "text-gray-600 hover:bg-white/80 hover:text-emerald-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-emerald-300"
    }`;

  return (
    <header className="glass-card-light p-3 sm:p-4">
      <h1 className="sr-only">{active === "attendance" ? "Riwayat Presensi" : "Riwayat Izin"}</h1>
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => navigate("/teacher/dashboard")}
          aria-label="Kembali ke Beranda"
          title="Kembali ke Beranda"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-emerald-600 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
        >
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <div role="group" aria-label="Jenis riwayat" className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-2xl bg-gray-100/80 p-1 dark:bg-white/5 sm:gap-2">
          <button type="button" aria-pressed={active === "attendance"} onClick={() => navigate("/teacher/history")} className={buttonClass(active === "attendance")}>
            Riwayat Presensi
          </button>
          <button type="button" aria-pressed={active === "leave"} onClick={() => navigate("/teacher/history/leave")} className={buttonClass(active === "leave")}>
            Riwayat Izin
          </button>
        </div>
      </div>
    </header>
  );
};

export default TeacherHistoryHeader;
