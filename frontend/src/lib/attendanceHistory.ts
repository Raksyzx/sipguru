export type HistoryFilterType = "day" | "week" | "month" | "year";
export type HistoryExportFormat = "csv" | "excel" | "pdf";

export interface AttendanceHistoryFilters {
  filterType: HistoryFilterType;
  year: number;
  month: number;
  day: number;
  week: number;
  teacherId: string;
  jurusanId: string;
  gradeId: string;
  subjectId: string;
}

export interface AttendanceHistoryRow {
  teacher_id: string;
  teacher_name: string;
  nip: string | null;
  total: number;
  on_time: number;
  late: number;
  avg_lateness: number;
  jurusan_id?: string | null;
  jurusan_name?: string | null;
  grade_id?: string | null;
  grade_name?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
}

export interface AttendanceSession {
  date: string;
  time: string;
  teacher_id: string;
  teacher_name: string;
  nip: string | null;
  jurusan_id?: string | null;
  jurusan_name?: string | null;
  grade_id?: string | null;
  grade_name?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
  room_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status: string;
  lateness_minutes: number;
}

export interface AttendanceHistoryResponse {
  history: { date: string; teachers: AttendanceHistoryRow[] }[];
  summary: {
    total: number;
    on_time: number;
    late: number;
    attendance_rate: number;
  };
}

export interface AttendanceSessionsResponse {
  sessions: AttendanceSession[];
  summary: {
    total: number;
    on_time: number;
    late: number;
    attendance_rate: number;
  };
}

export function getHistoryMonthDays(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function normalizeHistoryCalendar(filters: AttendanceHistoryFilters): AttendanceHistoryFilters {
  const days = getHistoryMonthDays(filters.year, filters.month);
  return {
    ...filters,
    day: Math.min(Math.max(filters.day, 1), days),
    week: Math.min(Math.max(filters.week, 1), Math.ceil(days / 7)),
  };
}

export function createHistoryFilters(now = new Date()): AttendanceHistoryFilters {
  return {
    filterType: "week",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    week: Math.ceil(now.getDate() / 7),
    teacherId: "",
    jurusanId: "",
    gradeId: "",
    subjectId: "",
  };
}

export function changeHistoryJurusan(
  filters: AttendanceHistoryFilters,
  jurusanId: string,
  grades: { id: string; jurusan_id?: string | null }[],
  subjects: { id: string; jurusan_id?: string | null }[],
): AttendanceHistoryFilters {
  return {
    ...filters,
    jurusanId,
    gradeId: !jurusanId || grades.some((grade) => grade.id === filters.gradeId && grade.jurusan_id === jurusanId)
      ? filters.gradeId : "",
    subjectId: !jurusanId || subjects.some((subject) => subject.id === filters.subjectId && subject.jurusan_id === jurusanId)
      ? filters.subjectId : "",
  };
}

export function buildHistoryQuery(filters: AttendanceHistoryFilters): string {
  const normalized = normalizeHistoryCalendar(filters);
  const params = new URLSearchParams({
    filter_type: normalized.filterType,
    year: normalized.year.toString(),
  });
  if (normalized.filterType !== "year") params.set("month", normalized.month.toString());
  if (normalized.filterType === "day") params.set("day", normalized.day.toString());
  if (normalized.filterType === "week") params.set("week", normalized.week.toString());
  for (const [key, value] of [
    ["teacher_id", normalized.teacherId],
    ["jurusan_id", normalized.jurusanId],
    ["grade_id", normalized.gradeId],
    ["subject_id", normalized.subjectId],
  ]) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function historyRowKey(date: string, row: AttendanceHistoryRow): string {
  return JSON.stringify([date, row.teacher_id, row.jurusan_id ?? null, row.grade_id ?? null, row.subject_id ?? null]);
}
