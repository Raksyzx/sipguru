import { CalendarCheck, CalendarDays, FileText, QrCode, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAttendance } from "../contexts/AttendanceContext";

const TeacherNavigation = () => {
  const { openAttendance, isAttendanceOpen } = useAttendance();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex min-w-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-2.5 py-1.5 transition-[color,background-color,box-shadow,transform] duration-200 ease-out active:scale-95 motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 lg:min-h-12 lg:w-full lg:min-w-0 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:py-2.5 lg:text-sm ${
      isActive
        ? "bg-white/75 text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_4px_18px_rgba(16,185,129,0.24)] ring-1 ring-emerald-200/80 backdrop-blur-xl dark:bg-white/10 dark:text-emerald-300 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_4px_14px_rgba(16,185,129,0.12)] dark:ring-0"
        : "text-gray-600 hover:bg-white/25 hover:text-emerald-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-emerald-300"
    }`;

  return (
    <nav
      aria-label="Navigasi guru"
      className="fixed bottom-0 left-0 right-0 z-[100] border-t border-white/45 bg-white/35 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-stone-950/35 dark:shadow-[0_-8px_30px_rgba(0,0,0,0.28)] md:bottom-4 md:left-4 md:right-auto md:w-20 md:rounded-3xl md:border md:shadow-[0_8px_30px_rgba(15,23,42,0.12)] md:backdrop-blur-xl lg:top-1/2 lg:bottom-auto lg:w-56 lg:-translate-y-1/2 lg:rounded-2xl lg:p-2"
    >
      <div className="mx-auto flex max-w-md items-center justify-around gap-1 px-2 py-2 md:flex-col md:gap-2 md:p-3 md:max-w-none lg:gap-1.5 lg:p-2">
        <NavLink to="/teacher/dashboard" className={navClass}>
          {() => (
            <>
              <CalendarCheck className="h-5 w-5" />
              <span className="text-[10px] font-medium">Beranda</span>
            </>
          )}
        </NavLink>
        <NavLink to="/teacher/schedule" className={navClass}>
          {() => (
            <>
              <CalendarDays className="h-5 w-5" />
              <span className="text-[10px] font-medium">Jadwal</span>
            </>
          )}
        </NavLink>
        <button
          type="button"
          onClick={openAttendance}
          aria-haspopup="dialog"
          aria-expanded={isAttendanceOpen}
          aria-controls={isAttendanceOpen ? "attendance-dialog" : undefined}
          className={`relative flex min-w-[3.9rem] flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/50 bg-emerald-500/85 px-3 py-2 text-white shadow-[0_8px_22px_rgba(16,185,129,0.35),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl transition-[color,background-color,box-shadow,transform] duration-200 ease-out active:scale-95 motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-white/15 dark:bg-emerald-600/80 lg:mt-0 lg:min-h-12 lg:w-full lg:min-w-0 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:py-2.5 lg:text-sm ${isAttendanceOpen ? "ring-2 ring-emerald-300/80 ring-offset-2 ring-offset-transparent dark:ring-emerald-400/60" : ""}`}
        >
          <QrCode className="h-6 w-6" />
          <span className="text-[10px] font-semibold lg:text-sm">Presensi</span>
        </button>
        <NavLink to="/teacher/history" className={navClass}>
          {() => (
            <>
              <FileText className="h-5 w-5" />
              <span className="text-[10px] font-medium">Riwayat</span>
            </>
          )}
        </NavLink>
        <NavLink to="/teacher/profile" className={navClass}>
          {() => (
            <>
              <User className="h-5 w-5" />
              <span className="text-[10px] font-medium">Profil</span>
            </>
          )}
        </NavLink>
      </div>
    </nav>
  );
};

export default TeacherNavigation;