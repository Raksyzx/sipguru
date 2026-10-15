import { useEffect, useState, useMemo } from "react";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Clock,
  CheckCircle,
  QrCode,
  LogOut,
  Copy,
  Check,
  BookOpen,
  GraduationCap,
  CalendarDays,
  Briefcase,
  FileOutput,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAuthStore } from "../stores";
import api from "../lib/api";

// Jurusan dihapus — belum ada endpoint backend, tab dinonaktifkan sementara

interface Teacher {
  id: string;
  name: string;
  email: string;
  nip: string;
  phone?: string;
}

interface Room {
  id: string;
  name: string;
  room_code: string;
}

interface Leave {
  id: string;
  teacher_id: string;
  teacher_name?: string;
  teacher_nip?: string;
  teacher_email?: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
}

interface Subject {
  id: string;
  name: string;
  code: string;
  description?: string;
  school_id?: string;
  jurusan_id?: string;
}

interface Grade {
  id: string;
  name: string;
  grade_level: number;
  school_id: string;
  jurusan_id?: string;
  jurusan_name?: string;
}

interface Jurusan {
  id: string;
  name: string;
  code: string;
  description?: string;
}

interface GradeSchedule {
  id: string;
  grade_id: string;
  subject_id: string;
  teacher_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room_id?: string;
  grade_name?: string;
  subject_name?: string;
  teacher_name?: string;
  jurusan_name?: string;
  room_name?: string;
}

type Tab = "dashboard" | "guru" | "qr" | "izin" | "jurusan" | "mapel" | "kelas" | "jadwal" | "laporan";

interface ResetPasswordModal {
  open: boolean;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
}

const AdminDashboard = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [jurusanList, setJurusanList] = useState<Jurusan[]>([]);
  const [gradeSchedules, setGradeSchedules] = useState<GradeSchedule[]>([]);
  const [stats, setStats] = useState({ total: 0, on_time: 0, late: 0 });
  const [qrToken, setQrToken] = useState("");
  const [qrRoom, setQrRoom] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Form states
  const [newSubject, setNewSubject] = useState({ name: "", code: "", description: "", jurusan_id: "" });
  const [newGrade, setNewGrade] = useState({ name: "", grade_level: 1, jurusan_id: "" });
  const [newJurusan, setNewJurusan] = useState({ name: "", code: "", description: "" });
  const [newSchedule, setNewSchedule] = useState({
    grade_id: "",
    subject_id: "",
    teacher_id: "",
    day_of_week: "Monday",
    start_time: "07:00",
    end_time: "12:00",
    room_id: "",
  });

  // Add Room Modal State
  const [addRoomModal, setAddRoomModal] = useState({ open: false, name: "", room_code: "", geofence_radius: 150 });
  const [addRoomLoading, setAddRoomLoading] = useState(false);

  // Reset Password Modal State
  const [resetPasswordModal, setResetPasswordModal] = useState<ResetPasswordModal>({
    open: false,
    teacherId: "",
    teacherName: "",
    teacherEmail: "",
  });
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Edit Teacher Modal State
  const [editTeacherModal, setEditTeacherModal] = useState<ResetPasswordModal & { teacherNip: string; newPassword: string; confirmNewPassword: string }>({
    open: false,
    teacherId: "",
    teacherName: "",
    teacherEmail: "",
    teacherNip: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [editTeacherLoading, setEditTeacherLoading] = useState(false);

  // Add Teacher Form State
  const [newTeacherForm, setNewTeacherForm] = useState({
    name: "",
    nip: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [addTeacherLoading, setAddTeacherLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [t, r, l, s, subj, grd, sched, jur] = await Promise.all([
          api.get("/admin/teachers"),
          api.get("/admin/rooms"),
          api.get("/admin/leaves"),
          api.get("/admin/stats/daily"),
          api.get("/admin/subjects"),
          api.get("/admin/grades"),
          api.get("/admin/grade-schedules"),
          api.get("/admin/jurusan"),
        ]);
        setTeachers(t.data?.teachers || []);
        setRooms(r.data?.rooms || []);
        setLeaves(l.data?.leaves || []);
        setStats(s.data?.stats || { total: 0, on_time: 0, late: 0 });
        setSubjects(subj.data?.subjects || []);
        setGrades(grd.data?.grades || []);
        setGradeSchedules(sched.data?.grade_schedules || []);
        setJurusanList(jur.data?.jurusan || []);
      } catch {
        setMsg("Gagal memuat data dashboard");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const generateQR = async (scheduleId: string) => {
    try {
      const res = await api.post("/qr/generate", { schedule_id: scheduleId });
      setQrToken(res.data.token);
      const schedule = gradeSchedules.find((x) => x.id === scheduleId);
      if (schedule) {
        setQrRoom(`${schedule.grade_name} - ${schedule.subject_name} (${schedule.jurusan_name || 'Jurusan TBA'})`);
      } else {
        setQrRoom("QR Token");
      }
      setCopied(false);
      setMsg(""); // Clear success
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || "Gagal generate QR token";
      setMsg(errorMsg);
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(qrToken);
      setCopied(true);
    } catch {
      // clipboard tidak tersedia
    }
  };

  const decideLeave = async (id: string, approve: boolean) => {
    try {
      await api.post(`/admin/leaves/approve?leave_id=${id}&approve=${approve}`);
      setLeaves((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: approve ? "approved" : "rejected" } : l))
      );
    } catch {
      setMsg("Gagal memproses izin");
    }
  };

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.name || !newSubject.code) return;
    if (!newSubject.jurusan_id) { setMsg("Pilih jurusan dulu untuk mapel ini"); return; }
    try {
      await api.post("/admin/subjects", newSubject);
      const res = await api.get("/admin/subjects");
      setSubjects(res.data?.subjects || []);
      setNewSubject({ name: "", code: "", description: "", jurusan_id: "" });
      setMsg("Mata pelajaran berhasil ditambah!");
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg("Gagal menambah mata pelajaran");
    }
  };

  const addGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGrade.name) return;
    if (!newGrade.jurusan_id) { setMsg("Pilih jurusan dulu untuk kelas ini"); return; }
    try {
      // school_id diambil dari jurusan (jurusan sudah punya school_id)
      const jurDetail = await api.get(`/admin/jurusan/${newGrade.jurusan_id}`);
      const school_id = jurDetail.data?.jurusan?.school_id;
      await api.post("/admin/grades", { ...newGrade, school_id });
      const res = await api.get("/admin/grades");
      setGrades(res.data?.grades || []);
      setNewGrade({ name: "", grade_level: 1, jurusan_id: "" });
      setMsg("Kelas berhasil ditambah!");
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg("Gagal menambah kelas");
    }
  };

  const addJurusan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJurusan.name || !newJurusan.code) return;
    try {
      // school_id default: ambil dari jurusan pertama yang ada
      let school_id: string | undefined = undefined;
      if (jurusanList[0]) {
        const jurDetail = await api.get(`/admin/jurusan/${jurusanList[0].id}`);
        school_id = jurDetail.data?.jurusan?.school_id;
      }
      await api.post("/admin/jurusan", { ...newJurusan, school_id });
      const res = await api.get("/admin/jurusan");
      setJurusanList(res.data?.jurusan || []);
      setNewJurusan({ name: "", code: "", description: "" });
      setMsg("Jurusan berhasil ditambah!");
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg("Gagal menambah jurusan");
    }
  };

  const addRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addRoomModal.name || !addRoomModal.room_code) return;
    setAddRoomLoading(true);
    try {
      await api.post("/admin/rooms", {
        name: addRoomModal.name,
        room_code: addRoomModal.room_code,
        geofence_radius: addRoomModal.geofence_radius,
        school_id: "00000000-0000-0000-0000-000000000001",
      });
      const res = await api.get("/admin/rooms");
      setRooms(res.data?.rooms || []);
      setAddRoomModal({ open: false, name: "", room_code: "", geofence_radius: 150 });
      setMsg("Ruangan berhasil ditambah!");
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg("Gagal menambah ruangan");
    } finally {
      setAddRoomLoading(false);
    }
  };

  const deleteJurusan = async (id: string) => {
    try {
      await api.delete(`/admin/jurusan/${id}`);
      const res = await api.get("/admin/jurusan");
      setJurusanList(res.data?.jurusan || []);
      setMsg("Jurusan berhasil dihapus!");
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg("Gagal menghapus jurusan");
    }
  };

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchedule.grade_id || !newSchedule.subject_id || !newSchedule.teacher_id) return;
    
    // Validate: Mapel dan Kelas harus satu jurusan
    const grade = grades.find(g => g.id === newSchedule.grade_id);
    const subject = subjects.find(s => s.id === newSchedule.subject_id);
    if (grade?.jurusan_id && subject?.jurusan_id && grade.jurusan_id !== subject.jurusan_id) {
      setMsg("Mapel dan kelas harus satu jurusan!");
      return;
    }
    
    try {
      await api.post("/admin/grade-schedules", newSchedule);
      const res = await api.get("/admin/grade-schedules");
      setGradeSchedules(res.data?.grade_schedules || []);
      setNewSchedule({
        grade_id: "",
        subject_id: "",
        teacher_id: "",
        day_of_week: "Monday",
        start_time: "07:00",
        end_time: "12:00",
        room_id: "",
      });
      setMsg("Jadwal kelas berhasil ditambah!");
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg("Gagal menambah jadwal kelas");
    }
  };

  const deleteSubject = async (id: string) => {
    try {
      await api.delete(`/admin/subjects/${id}`);
      const res = await api.get("/admin/subjects");
      setSubjects(res.data?.subjects || []);
      setMsg("Mata pelajaran berhasil dihapus!");
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg("Gagal menghapus mata pelajaran");
    }
  };

  const deleteGrade = async (id: string) => {
    try {
      await api.delete(`/admin/grades/${id}`);
      const res = await api.get("/admin/grades");
      setGrades(res.data?.grades || []);
      setMsg("Kelas berhasil dihapus!");
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg("Gagal menghapus kelas");
    }
  };

  const deleteSchedule = async (id: string) => {
    try {
      await api.delete(`/admin/grade-schedules/${id}`);
      const res = await api.get("/admin/grade-schedules");
      setGradeSchedules(res.data?.grade_schedules || []);
      setMsg("Jadwal kelas berhasil dihapus!");
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg("Gagal menghapus jadwal");
    }
  };

  const openResetPassword = (teacher: Teacher) => {
    setResetPasswordModal({
      open: true,
      teacherId: teacher.id,
      teacherName: teacher.name,
      teacherEmail: teacher.email,
    });
    setNewPassword("");
    setConfirmPassword("");
  };

  const openEditTeacher = (teacher: Teacher) => {
    setEditTeacherModal({
      open: true,
      teacherId: teacher.id,
      teacherName: teacher.name,
      teacherEmail: teacher.email,
      teacherNip: teacher.nip,
      newPassword: "",
      confirmNewPassword: "",
    });
  };

  const handleEditTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditTeacherLoading(true);
    try {
      const updateData: any = {
        name: editTeacherModal.teacherName,
        email: editTeacherModal.teacherEmail,
        nip: editTeacherModal.teacherNip,
      };
      
      // Only include password if changed
      if (editTeacherModal.newPassword && editTeacherModal.newPassword.length >= 6) {
        if (editTeacherModal.newPassword !== editTeacherModal.confirmNewPassword) {
          setMsg("Konfirmasi password tidak cocok");
          setEditTeacherLoading(false);
          return;
        }
        updateData.password = editTeacherModal.newPassword;
      }
      
      await api.put(`/admin/teachers/${editTeacherModal.teacherId}`, updateData);
      setMsg(`Data guru ${editTeacherModal.teacherName} berhasil diupdate`);
      setTimeout(() => setMsg(""), 3000);
      setEditTeacherModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "", teacherNip: "", newPassword: "", confirmNewPassword: "" });
      // Reload teachers
      const res = await api.get("/admin/teachers");
      setTeachers(res.data?.teachers || []);
    } catch (err: any) {
      setMsg(err.response?.data?.detail || "Gagal mengupdate data guru");
    } finally {
      setEditTeacherLoading(false);
    }
  };

  const handleDeleteTeacher = async (teacherId: string, teacherName: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus guru ${teacherName}?`)) {
      return;
    }
    try {
      await api.delete(`/admin/teachers/${teacherId}`);
      setMsg(`Guru ${teacherName} berhasil dihapus`);
      setTimeout(() => setMsg(""), 3000);
      // Reload teachers
      const res = await api.get("/admin/teachers");
      setTeachers(res.data?.teachers || []);
    } catch (err: any) {
      setMsg(err.response?.data?.detail || "Gagal menghapus guru");
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherForm.name || !newTeacherForm.nip || !newTeacherForm.email) {
      setMsg("Nama, NIP, dan Email wajib diisi");
      return;
    }
    if (newTeacherForm.password.length < 6) {
      setMsg("Password minimal 6 karakter");
      return;
    }
    if (newTeacherForm.password !== newTeacherForm.confirmPassword) {
      setMsg("Password tidak cocok");
      return;
    }

    setAddTeacherLoading(true);
    try {
      await api.post("/admin/teachers", {
        name: newTeacherForm.name,
        nip: newTeacherForm.nip,
        email: newTeacherForm.email,
        phone: newTeacherForm.phone || undefined,
        password: newTeacherForm.password,
      });
      setMsg(`Guru ${newTeacherForm.name} berhasil ditambahkan`);
      setTimeout(() => setMsg(""), 3000);
      setNewTeacherForm({ name: "", nip: "", email: "", phone: "", password: "", confirmPassword: "" });
      // Reload teachers
      const res = await api.get("/admin/teachers");
      setTeachers(res.data?.teachers || []);
    } catch (err: any) {
      setMsg(err.response?.data?.detail || "Gagal menambah guru");
    } finally {
      setAddTeacherLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setMsg("Password minimal 6 karakter");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg("Password tidak cocok");
      return;
    }

    setResetPasswordLoading(true);
    try {
      await api.post("/admin/teachers/reset-password", {
        teacher_id: resetPasswordModal.teacherId,
        new_password: newPassword,
      });
      setMsg(`Password guru ${resetPasswordModal.teacherName} berhasil direset`);
      setTimeout(() => setMsg(""), 3000);
      setResetPasswordModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "" });
    } catch (err: any) {
      setMsg(err.response?.data?.detail || "Gagal mereset password");
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const pending = useMemo(() => leaves.filter((l) => l.status === "pending"), [leaves]);

  const nav = (id: Tab, label: string, Icon: typeof LayoutDashboard) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
        tab === id
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold"
          : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-stone-950">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-64 bg-white dark:bg-stone-900 border-r border-gray-200 dark:border-stone-800 hidden md:flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none">
          <div className="p-6 border-b border-gray-200 dark:border-stone-800">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
              SIPGURU
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">Admin Dashboard</p>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
            {nav("dashboard", "Dashboard", LayoutDashboard)}
            {nav("guru", "Guru", Users)}
            {nav("qr", "QR Ruangan", QrCode)}
            {nav("izin", "Izin", CheckCircle)}
            {nav("jurusan", "Jurusan", Briefcase)}
            {nav("mapel", "Mata Pelajaran", BookOpen)}
            {nav("kelas", "Kelas", GraduationCap)}
            {nav("jadwal", "Jadwal Kelas", CalendarDays)}
            {nav("laporan", "Laporan", FileOutput)}
          </nav>
          <div className="p-4 border-t border-gray-200 dark:border-stone-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-emerald-600 to-emerald-500 rounded-full flex items-center justify-center text-white shadow-[0_6px_15px_rgba(16,185,129,0.25)]">
                <span className="font-bold">{user?.name?.charAt(0) || "A"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => useAuthStore.getState().logout()}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-950/30"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="md:hidden bg-white dark:bg-stone-900 border-b border-gray-200 dark:border-stone-800 p-2 flex gap-2 overflow-x-auto sticky top-0 z-10 shadow-sm">
            {(["dashboard", "guru", "qr", "izin", "jurusan", "mapel", "kelas", "jadwal", "laporan"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t
                    ? "bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white"
                    : "bg-gray-100 text-gray-700 dark:bg-stone-800 dark:text-gray-300"
                }`}
              >
                {t === "dashboard" ? "Dashboard" : t === "guru" ? "Guru" : t === "qr" ? "QR" : t === "izin" ? "Izin" : t === "jurusan" ? "Jurusan" : t === "mapel" ? "Mapel" : t === "kelas" ? "Kelas" : t === "jadwal" ? "Jadwal" : "Laporan"}
              </button>
            ))}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-stone-950/50 p-4 md:p-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-6 md:mb-8">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                {tab === "dashboard" ? "Dashboard" : tab === "guru" ? "Data Guru" : tab === "qr" ? "QR Ruangan" : tab === "izin" ? "Permohonan Izin" : tab === "mapel" ? "Mata Pelajaran" : tab === "kelas" ? "Kelas" : tab === "jurusan" ? "Jurusan" : "Jadwal Kelas"}
              </h2>
              <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
                {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>

            {msg && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 rounded-xl text-sm border border-red-100 dark:border-red-900/30">
                {msg}
              </div>
            )}

            {tab === "dashboard" && (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8 animate-in slide-in-from-bottom-4 duration-500">
                  {[
                    { label: "Total Guru", value: teachers.length, icon: Users, bg: "bg-emerald-500" },
                    { label: "Hari Ini Presensi", value: stats.total, icon: CheckCircle, bg: "bg-green-500" },
                    { label: "Terlambat", value: stats.late, icon: Clock, bg: "bg-amber-500" },
                    { label: "Izin Pending", value: pending.length, icon: Calendar, bg: "bg-blue-500" },
                  ].map(({ label, value, icon: Icon, bg }) => (
                    <div key={label} className="glass-card-light p-6 transition-all duration-300 hover:-translate-y-1">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${bg} text-white shadow-lg`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? "…" : value}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Teachers List */}
                <div className="glass-card-light overflow-hidden animate-in slide-in-from-bottom-4 duration-500 delay-100">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daftar Guru</h3>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {teachers.length === 0 && (
                      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                        {loading ? "Memuat..." : "Belum ada data guru."}
                      </p>
                    )}
                    {teachers.map((t) => (
                      <div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                            <span className="font-bold text-gray-600 dark:text-gray-300">{t.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{t.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{t.nip} • {t.email}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === "guru" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                {/* Add Teacher Form */}
                <div className="glass-card-light p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tambah Guru</h3>
                  <form onSubmit={handleAddTeacher} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Nama Lengkap"
                        value={newTeacherForm.name}
                        onChange={(e) => setNewTeacherForm({ ...newTeacherForm, name: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      <input
                        type="text"
                        placeholder="NIP"
                        value={newTeacherForm.nip}
                        onChange={(e) => setNewTeacherForm({ ...newTeacherForm, nip: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <input
                      type="email"
                      placeholder="Email (untuk login)"
                      value={newTeacherForm.email}
                      onChange={(e) => setNewTeacherForm({ ...newTeacherForm, email: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Telepon (opsional)"
                      value={newTeacherForm.phone}
                      onChange={(e) => setNewTeacherForm({ ...newTeacherForm, phone: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="password"
                        placeholder="Password (min. 6 karakter)"
                        value={newTeacherForm.password}
                        onChange={(e) => setNewTeacherForm({ ...newTeacherForm, password: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      <input
                        type="password"
                        placeholder="Konfirmasi Password"
                        value={newTeacherForm.confirmPassword}
                        onChange={(e) => setNewTeacherForm({ ...newTeacherForm, confirmPassword: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={addTeacherLoading}
                      className="btn-primary w-full py-2 text-sm disabled:opacity-50"
                    >
                      {addTeacherLoading ? (
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        "Tambah Guru"
                      )}
                    </button>
                  </form>
                </div>
                {/* Teachers List */}
                <div className="glass-card-light overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daftar Guru</h3>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {teachers.length === 0 && (
                      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                        {loading ? "Memuat..." : "Belum ada data guru."}
                      </p>
                    )}
                    {teachers.map((t) => (
                      <div key={t.id} className="p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                              <span className="font-bold text-gray-600 dark:text-gray-300">{t.name.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{t.name}</p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">{t.nip} • {t.email}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openResetPassword(t)}
                              className="px-3 py-1 text-sm bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-950/50 transition-colors"
                            >
                              Reset Password
                            </button>
                            <button
                              onClick={() => openEditTeacher(t)}
                              className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-950/50 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteTeacher(t.id, t.name)}
                              className="px-3 py-1 text-sm bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-950/50 transition-colors"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "qr" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <div className="glass-card-light p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Generate QR Absensi</h3>
                    <button
                      onClick={() => setAddRoomModal({ open: true, name: "", room_code: "", geofence_radius: 150 })}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <QrCode className="w-4 h-4 inline mr-1" />
                      Tambah Ruangan
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Pilih jadwal kelas untuk generate token QR. Token berlaku 30 detik.
                  </p>
                  <div className="grid gap-3 max-h-96 overflow-y-auto">
                    {gradeSchedules.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {s.grade_name} - {s.subject_name} - {s.teacher_name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {s.jurusan_name ? `Jurusan: ${s.jurusan_name}` : ''} | Hari: {s.day_of_week} | {s.start_time}-{s.end_time} | Ruang: {s.room_name || 'TBA'}
                          </p>
                        </div>
                        <button
                          onClick={() => generateQR(s.id)}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-[0_6px_15px_rgba(16,185,129,0.25)]"
                        >
                          Generate
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                {qrToken && (
                  <div className="glass-card-light p-6 border-emerald-200/50 dark:border-emerald-900/50">
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">{qrRoom}</p>
                    <p className="text-xs font-mono break-all bg-gray-50 dark:bg-white/10 p-3 rounded-lg mt-2 text-gray-700 dark:text-gray-300">
                      {qrToken}
                    </p>
                    <button
                      onClick={copyToken}
                      className="mt-3 flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-white/10 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Tersalin!" : "Salin token"}
                    </button>
                  </div>
                )}
                
                {/* Add Room Modal */}
                {addRoomModal.open && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onClick={() => setAddRoomModal({ open: false, name: "", room_code: "", geofence_radius: 150 })}
                  >
                    <div
                      className="bg-white dark:bg-stone-900 rounded-2xl p-6 w-full max-w-md mx-4 animate-in zoom-in-95 duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Tambah Ruangan</h3>
                        <button
                          onClick={() => setAddRoomModal({ open: false, name: "", room_code: "", geofence_radius: 150 })}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          ✕
                        </button>
                      </div>
                      <form onSubmit={addRoom} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Ruangan</label>
                          <input
                            type="text"
                            placeholder="Contoh: Ruang Komputer 1"
                            value={addRoomModal.name}
                            onChange={(e) => setAddRoomModal({ ...addRoomModal, name: e.target.value })}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kode Ruangan</label>
                          <input
                            type="text"
                            placeholder="Contoh: RK01"
                            value={addRoomModal.room_code}
                            onChange={(e) => setAddRoomModal({ ...addRoomModal, room_code: e.target.value })}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Radius Geofence (meter)</label>
                          <input
                            type="number"
                            placeholder="150"
                            value={addRoomModal.geofence_radius}
                            onChange={(e) => setAddRoomModal({ ...addRoomModal, geofence_radius: parseInt(e.target.value) || 150 })}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                            min="1"
                            max="1000"
                          />
                        </div>
                        <div className="flex gap-3 pt-4">
                          <button
                            type="button"
                            onClick={() => setAddRoomModal({ open: false, name: "", room_code: "", geofence_radius: 150 })}
                            className="flex-1 px-4 py-2 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            disabled={addRoomLoading}
                            className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            {addRoomLoading ? "Menyimpan..." : "Simpan Ruangan"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "izin" && (
              <div className="glass-card-light overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {leaves.length === 0 && (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Tidak ada pengajuan izin.</p>
                  )}
                  {leaves.map((l) => (
                    <div key={l.id} className="p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-medium text-gray-900 dark:text-white">{l.teacher_name || l.teacher_id.slice(0, 8)}…</span>
                        <span
                          className={`px-2 py-1 text-xs rounded-full font-medium ${
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
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{l.start_date} – {l.end_date}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{l.reason}</p>
                      {l.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => decideLeave(l.id, true)}
                            className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-[0_4px_10px_rgba(16,185,129,0.2)]"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => decideLeave(l.id, false)}
                            className="px-3 py-1 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-950/50 transition-colors"
                          >
                            Tolak
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "mapel" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <div className="glass-card-light p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tambah Mata Pelajaran</h3>
                  <form onSubmit={addSubject} className="space-y-3">
                    <div className="space-y-3">
                      <select
                        value={newSubject.jurusan_id}
                        onChange={(e) => setNewSubject({ ...newSubject, jurusan_id: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option value="">Pilih Jurusan*</option>
                        {jurusanList.map((j) => (
                          <option key={j.id} value={j.id}>{j.name} ({j.code})</option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Nama Mapel"
                          value={newSubject.name}
                          onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                        <input
                          type="text"
                          placeholder="Kode Mapel"
                          value={newSubject.code}
                          onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })}
                          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Deskripsi (opsional)"
                        value={newSubject.description}
                        onChange={(e) => setNewSubject({ ...newSubject, description: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <button type="submit" className="btn-primary w-full py-2 text-sm">
                      Tambah Mata Pelajaran
                    </button>
                  </form>
                </div>
                <div className="glass-card-light overflow-hidden">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daftar Mata Pelajaran</h3>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {subjects.length === 0 && (
                      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Belum ada mata pelajaran.</p>
                    )}
                    {subjects.map((s) => {
                      // Find related grade schedules to show class and teacher info
                      const relatedSchedules = gradeSchedules.filter(gs => gs.subject_id === s.id);
                      const uniqueClasses = Array.from(new Set(relatedSchedules.map(gs => gs.grade_name))).filter(Boolean);
                      const uniqueTeachers = Array.from(new Set(relatedSchedules.map(gs => gs.teacher_name))).filter(Boolean);
                      
                      return (
                        <div key={s.id} className="p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{s.name}</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {s.code} {s.description && `• ${s.description}`}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteSubject(s.id)}
                              className="px-3 py-1 text-sm bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-950/50 transition-colors"
                            >
                              Hapus
                            </button>
                          </div>
                          
                          {/* Enhanced info display */}
                          <div className="mt-3 space-y-2">
                            {s.jurusan_id && (
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <GraduationCap className="w-3 h-3" />
                                <span>Jurusan: {jurusanList.find(j => j.id === s.jurusan_id)?.name || 'N/A'}</span>
                              </div>
                            )}
                            {uniqueClasses.length > 0 && (
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <BookOpen className="w-3 h-3" />
                                <span>Kelas: {uniqueClasses.join(', ')}</span>
                              </div>
                            )}
                            {uniqueTeachers.length > 0 && (
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <Users className="w-3 h-3" />
                                <span>Guru: {uniqueTeachers.join(', ')}</span>
                              </div>
                            )}
                            {uniqueClasses.length === 0 && uniqueTeachers.length === 0 && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                                Belum dijadwalkan - Tambahkan ke jadwal kelas untuk menampilkan info lengkap
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab === "kelas" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <div className="glass-card-light p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tambah Kelas</h3>
                  <form onSubmit={addGrade} className="space-y-3">
                    <div className="space-y-3">
                      <select
                        value={newGrade.jurusan_id}
                        onChange={(e) => setNewGrade({ ...newGrade, jurusan_id: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option value="">Pilih Jurusan*</option>
                        {jurusanList.map((j) => (
                          <option key={j.id} value={j.id}>{j.name} ({j.code})</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Nama Kelas (e.g., 10A)"
                        value={newGrade.name}
                        onChange={(e) => setNewGrade({ ...newGrade, name: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      <input
                        type="number"
                        placeholder="Tingkat (e.g., 10)"
                        value={newGrade.grade_level}
                        onChange={(e) => setNewGrade({ ...newGrade, grade_level: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <button type="submit" className="btn-primary w-full py-2 text-sm">
                      Tambah Kelas
                    </button>
                  </form>
                </div>
                <div className="glass-card-light overflow-hidden">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daftar Kelas</h3>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {grades.length === 0 && (
                      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Belum ada kelas.</p>
                    )}
                    {grades.map((g) => (
                      <div key={g.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{g.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Jurusan: {g.jurusan_name || "N/A"} • Tingkat {g.grade_level}</p>
                        </div>
                        <button
                          onClick={() => deleteGrade(g.id)}
                          className="px-3 py-1 text-sm bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-950/50 transition-colors"
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "jurusan" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <div className="glass-card-light p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tambah Jurusan</h3>
                  <form onSubmit={addJurusan} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Nama Jurusan"
                        value={newJurusan.name}
                        onChange={(e) => setNewJurusan({ ...newJurusan, name: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Kode Jurusan"
                        value={newJurusan.code}
                        onChange={(e) => setNewJurusan({ ...newJurusan, code: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Deskripsi (opsional)"
                      value={newJurusan.description}
                      onChange={(e) => setNewJurusan({ ...newJurusan, description: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <button type="submit" className="btn-primary w-full py-2 text-sm">
                      Tambah Jurusan
                    </button>
                  </form>
                </div>
                <div className="glass-card-light overflow-hidden">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daftar Jurusan</h3>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {jurusanList.length === 0 && (
                      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Belum ada jurusan.</p>
                    )}
                    {jurusanList.map((j) => (
                      <div key={j.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{j.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{j.code} {j.description && `• ${j.description}`}</p>
                        </div>
                        <button
                          onClick={() => deleteJurusan(j.id)}
                          className="px-3 py-1 text-sm bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-950/50 transition-colors"
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "jadwal" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <div className="glass-card-light p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tambah Jadwal Kelas</h3>
                  <form onSubmit={addSchedule} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={newSchedule.grade_id}
                        onChange={(e) => setNewSchedule({ ...newSchedule, grade_id: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option value="">Pilih Kelas</option>
                        {grades.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      <select
                        value={newSchedule.subject_id}
                        onChange={(e) => setNewSchedule({ ...newSchedule, subject_id: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option value="">Pilih Mapel</option>
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <select
                      value={newSchedule.teacher_id}
                      onChange={(e) => setNewSchedule({ ...newSchedule, teacher_id: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="">Pilih Guru</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-3 gap-3">
                      <select
                        value={newSchedule.day_of_week}
                        onChange={(e) => setNewSchedule({ ...newSchedule, day_of_week: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option value="Monday">Senin</option>
                        <option value="Tuesday">Selasa</option>
                        <option value="Wednesday">Rabu</option>
                        <option value="Thursday">Kamis</option>
                        <option value="Friday">Jumat</option>
                      </select>
                      <input
                        type="time"
                        value={newSchedule.start_time}
                        onChange={(e) => setNewSchedule({ ...newSchedule, start_time: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      <input
                        type="time"
                        value={newSchedule.end_time}
                        onChange={(e) => setNewSchedule({ ...newSchedule, end_time: e.target.value })}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <select
                      value={newSchedule.room_id}
                      onChange={(e) => setNewSchedule({ ...newSchedule, room_id: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="">Pilih Ruangan (opsional)</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <button type="submit" className="btn-primary w-full py-2 text-sm">
                      Tambah Jadwal
                    </button>
                  </form>
                </div>
                <div className="glass-card-light overflow-hidden">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daftar Jadwal Kelas</h3>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {gradeSchedules.length === 0 && (
                      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Belum ada jadwal kelas.</p>
                    )}
                    {gradeSchedules.map((s) => (
                      <div key={s.id} className="p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {s.grade_name || "Kelas"} • {s.subject_name || "Mapel"}
                          </p>
                          <button
                            onClick={() => deleteSchedule(s.id)}
                            className="px-3 py-1 text-sm bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-950/50 transition-colors"
                          >
                            Hapus
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {s.day_of_week === "Monday" ? "Senin" : s.day_of_week === "Tuesday" ? "Selasa" : s.day_of_week === "Wednesday" ? "Rabu" : s.day_of_week === "Thursday" ? "Kamis" : "Jumat"} • {s.start_time} – {s.end_time}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Guru: {s.teacher_name || "N/A"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "laporan" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <div className="glass-card-light p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Laporan Absensi</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Akses halaman laporan lengkap dengan fitur export PDF/Excel/CSV
                  </p>
                  <a
                    href="/admin/reports"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-[0_6px_15px_rgba(16,185,129,0.25)]"
                  >
                    <FileOutput className="w-5 h-5" />
                    Buka Halaman Laporan
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
            </div>
              {/* Reset Password Modal */}
              {resetPasswordModal.open && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                  onClick={() => setResetPasswordModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "" })}
                >
                  <div
                    className="bg-white dark:bg-stone-900 rounded-2xl p-6 w-full max-w-md mx-4 animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Reset Password Guru</h3>
                      <button
                        onClick={() => setResetPasswordModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "" })}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="mb-4 p-4 bg-gray-50 dark:bg-stone-800 rounded-xl">
                      <p className="font-medium text-gray-900 dark:text-white">{resetPasswordModal.teacherName}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{resetPasswordModal.teacherEmail}</p>
                    </div>
                    <form onSubmit={handleResetPassword} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Password Baru (min. 6 karakter)
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Konfirmasi Password
                        </label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setResetPasswordModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "" })}
                          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={resetPasswordLoading}
                          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          {resetPasswordLoading ? (
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            "Reset Password"
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Edit Teacher Modal */}
              {editTeacherModal.open && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                  onClick={() => setEditTeacherModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "", teacherNip: "", newPassword: "", confirmNewPassword: "" })}
                >
                  <div
                    className="bg-white dark:bg-stone-900 rounded-2xl p-6 w-full max-w-md mx-4 animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Data Guru</h3>
                      <button
                        onClick={() => setEditTeacherModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "", teacherNip: "", newPassword: "", confirmNewPassword: "" })}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <form onSubmit={handleEditTeacher} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Nama Lengkap
                        </label>
                        <input
                          type="text"
                          value={editTeacherModal.teacherName}
                          onChange={(e) => setEditTeacherModal({ ...editTeacherModal, teacherName: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Email (Username Login)
                        </label>
                        <input
                          type="email"
                          value={editTeacherModal.teacherEmail}
                          onChange={(e) => setEditTeacherModal({ ...editTeacherModal, teacherEmail: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          NIP
                        </label>
                        <input
                          type="text"
                          value={editTeacherModal.teacherNip}
                          onChange={(e) => setEditTeacherModal({ ...editTeacherModal, teacherNip: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Password Baru (opsional, min. 6 karakter)
                        </label>
                        <input
                          type="password"
                          value={editTeacherModal.newPassword}
                          onChange={(e) => setEditTeacherModal({ ...editTeacherModal, newPassword: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Konfirmasi Password Baru
                        </label>
                        <input
                          type="password"
                          value={editTeacherModal.confirmNewPassword}
                          onChange={(e) => setEditTeacherModal({ ...editTeacherModal, confirmNewPassword: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setEditTeacherModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "", teacherNip: "", newPassword: "", confirmNewPassword: "" })}
                          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={editTeacherLoading}
                          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {editTeacherLoading ? (
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            "Simpan Perubahan"
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          );
        };

        export default AdminDashboard;