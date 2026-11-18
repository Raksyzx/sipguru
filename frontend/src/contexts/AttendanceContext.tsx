import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import AttendanceDialog from "../components/AttendanceDialog";

interface AttendanceContextValue {
  openAttendance: () => void;
  isAttendanceOpen: boolean;
  attendanceRevision: number;
}

const AttendanceContext = createContext<AttendanceContextValue | null>(null);

export const useAttendance = () => {
  const context = useContext(AttendanceContext);
  if (!context) throw new Error("useAttendance requires AttendanceProvider");
  return context;
};

export const AttendanceProvider = ({ children }: { children?: ReactNode }) => {
  const [isAttendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceRevision, setAttendanceRevision] = useState(0);
  const openAttendance = useCallback(() => setAttendanceOpen(true), []);
  const closeAttendance = useCallback(() => setAttendanceOpen(false), []);
  const attendanceSubmitted = useCallback(() => setAttendanceRevision((value) => value + 1), []);

  return (
    <AttendanceContext.Provider value={{ openAttendance, isAttendanceOpen, attendanceRevision }}>
      {children ?? <Outlet />}
      {isAttendanceOpen && (
        <AttendanceDialog onClose={closeAttendance} onSuccess={attendanceSubmitted} />
      )}
    </AttendanceContext.Provider>
  );
};
