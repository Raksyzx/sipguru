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
  Sun,
  Moon,
  MapPin,
  Menu,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../hooks/useAuth";
import { useAuthStore } from "../stores";
import { useTheme } from "../contexts/ThemeContext";
import { MapPicker } from "../components/MapPicker";
import { LogoutConfirmModal } from "../components/LogoutConfirmModal";
import { ToastContainer, useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import api from "../lib/api";

// Jurusan dihapus — belum ada endpoint backend, tab dinonaktifkan sementara

  const tabs: { id: Tab; label: string; Icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { id: "guru", label: "Guru", Icon: Users },
    { id: "qr", label: "QR Ruangan", Icon: QrCode },
    { id: "izin", label: "Izin", Icon: CheckCircle },
    { id: "jurusan", label: "Jurusan", Icon: Briefcase },
    { id: "mapel", label: "Mata Pelajaran", Icon: BookOpen },
    { id: "kelas", label: "Kelas", Icon: GraduationCap },
    { id: "jadwal", label: "Jadwal Kelas", Icon: CalendarDays },
    { id: "laporan", label: "Laporan", Icon: FileOutput },
  ];

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
  geofence_radius?: number;
  geolocation?: string;
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
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Realtime clock update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sipguru-active-tab");
      if (saved && ["dashboard", "guru", "qr", "izin", "jurusan", "mapel", "kelas", "jadwal", "laporan"].includes(saved)) {
        return saved as Tab;
      }
    }
    return "dashboard";
  });
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
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Mobile sidebar/drawer state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Form states
  const [newSubject, setNewSubject] = useState({ name: "", code: "", description: "", jurusan_id: "" });
  const [newGrade, setNewGrade] = useState({ name: "", grade_level: 1, jurusan_id: "" });
  const [newJurusan, setNewJurusan] = useState({ name: "", code: "", description: "" });
  const [newSchedule, setNewSchedule] = useState({
    grade_id: "",
    subject_id: "",
    teacher_id: "",
    day_of_week: "Senin",
    start_time: "07:00",
    end_time: "12:00",
    room_id: "",
  });

  // Add Room Modal State
  const [addRoomModal, setAddRoomModal] = useState({ open: false, name: "", room_code: "", geofence_radius: 150, geolocation: "" });
  const [editRoomModal, setEditRoomModal] = useState({ open: false, id: "", name: "", room_code: "", geofence_radius: 150, geolocation: "" });
  const [addRoomLoading, setAddRoomLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapMode, setMapMode] = useState<'add' | 'edit'>('add');
  const [tempLocation, setTempLocation] = useState<{ lat: number; lng: number } | null>(null);

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

  // Theme
  const { theme, toggleTheme } = useTheme();

  // Animated Confirmation Modals
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; type: 'jurusan' | 'subject' | 'grade' | 'teacher' | 'room' | 'schedule' | 'leave' } | null>(null);
  const [confirmEdit, setConfirmEdit] = useState<{ id: string; name: string; type: string; onConfirm: () => void } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { toasts, success, error } = useToast();

  const showDeleteConfirm = (id: string, name: string, type: 'jurusan' | 'subject' | 'grade' | 'teacher' | 'room' | 'schedule' | 'leave') => {
    setConfirmDelete({ id, name, type });
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    if (type === 'success') success(message);
    else error(message);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    try {
      console.log('[DELETE] Attempting to delete:', confirmDelete.type, confirmDelete.id);
      // Map type to correct endpoint
      const endpointMap: Record<string, string> = {
        jurusan: 'jurusan',
        subject: 'subjects',
        grade: 'grades',
        teacher: 'teachers',
        room: 'rooms',
        schedule: 'grade-schedules',
        leave: 'leaves',
      };
      const endpoint = endpointMap[confirmDelete.type] || confirmDelete.type;
      await api.delete(`/admin/${endpoint}/${confirmDelete.id}`);
      console.log('[DELETE] Success:', confirmDelete.type, confirmDelete.id);
      // Refresh data
      if (confirmDelete.type === 'jurusan') {
        const res = await api.get("/admin/jurusan");
        setJurusanList(res.data?.jurusan || []);
      } else if (confirmDelete.type === 'subject') {
        const res = await api.get("/admin/subjects");
        setSubjects(res.data?.subjects || []);
      } else if (confirmDelete.type === 'grade') {
        const res = await api.get("/admin/grades");
        setGrades(res.data?.grades || []);
      } else if (confirmDelete.type === 'teacher') {
        const res = await api.get("/admin/teachers");
        setTeachers(res.data?.teachers || []);
      } else if (confirmDelete.type === 'room') {
        const res = await api.get("/admin/rooms");
        setRooms(res.data?.rooms || []);
      } else if (confirmDelete.type === 'schedule') {
        const res = await api.get("/admin/grade-schedules");
        setGradeSchedules(res.data?.grade_schedules || []);
      } else if (confirmDelete.type === 'leave') {
        const res = await api.get("/admin/leaves");
        setLeaves(res.data?.leaves || []);
      }
      showToast(`${confirmDelete.name} berhasil dihapus!`, 'success');
    } catch (err: any) {
      console.error('[DELETE] Error:', err.response?.status, err.response?.data, err.message);
      const detail = err?.response?.data?.detail || err?.message || 'Gagal menghapus data';
      showToast(detail, 'error');
    }
    setConfirmDelete(null);
  };

  const handleEditConfirm = () => {
    if (!confirmEdit) return;
    confirmEdit.onConfirm();
    showToast(`${confirmEdit.name} berhasil diperbarui!`, 'success');
    setConfirmEdit(null);
  };

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
      } catch (err: any) {
        const detail = err?.response?.data?.detail || err?.message || err?.code || "Unknown error";
        setMsg(`Gagal memuat data dashboard: ${detail}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const generateQR = async (scheduleId: string) => {
    setGeneratingId(scheduleId);
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
      setQrModalOpen(true);
      showToast("QR token berhasil digenerate!", "success");
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || "Gagal generate QR token";
      showToast(errorMsg, "error");
    } finally {
      setGeneratingId(null);
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
      console.log('[DECIDE LEAVE] ID:', id, 'Approve:', approve);
      await api.post(`/admin/leaves/approve?leave_id=${id}&approve=${approve}`);
      setLeaves((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: approve ? "approved" : "rejected" } : l))
      );
      showToast(`Izin ${approve ? "disetujui" : "ditolak"}!`, "success");
    } catch (err: any) {
      console.error('[DECIDE LEAVE] Error:', err.response?.status, err.response?.data);
      showToast(err?.response?.data?.detail || "Gagal memproses izin", "error");
    }
  };

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.name || !newSubject.code) return;
    if (!newSubject.jurusan_id) { showToast("Pilih jurusan dulu untuk mapel ini", "error"); return; }
    try {
      console.log('[ADD SUBJECT] Payload:', newSubject);
      await api.post("/admin/subjects", newSubject);
      const res = await api.get("/admin/subjects");
      setSubjects(res.data?.subjects || []);
      setNewSubject({ name: "", code: "", description: "", jurusan_id: "" });
      showToast("Mata pelajaran berhasil ditambahkan!", "success");
    } catch (err: any) {
      console.error('[ADD SUBJECT] Error:', err.response?.status, err.response?.data);
      showToast(err?.response?.data?.detail || "Gagal menambah mata pelajaran", "error");
    }
  };

  const addGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGrade.name) return;
    if (!newGrade.jurusan_id) { showToast("Pilih jurusan dulu untuk kelas ini", "error"); return; }
    try {
      console.log('[ADD GRADE] Payload:', newGrade);
      const jurDetail = await api.get(`/admin/jurusan/${newGrade.jurusan_id}`);
      const school_id = jurDetail.data?.jurusan?.school_id;
      console.log('[ADD GRADE] school_id:', school_id);
      await api.post("/admin/grades", { ...newGrade, school_id });
      const res = await api.get("/admin/grades");
      setGrades(res.data?.grades || []);
      setNewGrade({ name: "", grade_level: 1, jurusan_id: "" });
      showToast("Kelas berhasil ditambahkan!", "success");
    } catch (err: any) {
      console.error('[ADD GRADE] Error:', err.response?.status, err.response?.data);
      showToast(err?.response?.data?.detail || "Gagal menambah kelas", "error");
    }
  };

  const addJurusan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJurusan.name || !newJurusan.code) return;
    try {
      console.log('[ADD JURUSAN] Payload:', newJurusan);
      // school_id default: ambil dari jurusan pertama yang ada
      let school_id: string | undefined = undefined;
      if (jurusanList[0]) {
        const jurDetail = await api.get(`/admin/jurusan/${jurusanList[0].id}`);
        school_id = jurDetail.data?.jurusan?.school_id;
        console.log('[ADD JURUSAN] school_id from first jurusan:', school_id);
      }
      const payload = { ...newJurusan, school_id };
      console.log('[ADD JURUSAN] Final payload:', payload);
      await api.post("/admin/jurusan", payload);
      const res = await api.get("/admin/jurusan");
      setJurusanList(res.data?.jurusan || []);
      setNewJurusan({ name: "", code: "", description: "" });
      showToast("Jurusan berhasil ditambahkan!", "success");
    } catch (err: any) {
      console.error('[ADD JURUSAN] Error:', err.response?.status, err.response?.data);
      showToast(err?.response?.data?.detail || "Gagal menambah jurusan", "error");
    }
  };

  const addRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addRoomModal.name || !addRoomModal.room_code) return;
    setAddRoomLoading(true);
    try {
      console.log('[ADD ROOM] Payload:', addRoomModal);
      // Get valid school_id from first jurusan
      let school_id = "3e647ebf-beb7-476b-912b-4560e049f7cc"; // default school_id
      if (jurusanList[0]) {
        const jurDetail = await api.get(`/admin/jurusan/${jurusanList[0].id}`);
        school_id = jurDetail.data?.jurusan?.school_id || school_id;
      }
      console.log('[ADD ROOM] Using school_id:', school_id);
      await api.post("/admin/rooms", {
        name: addRoomModal.name,
        room_code: addRoomModal.room_code,
        geofence_radius: addRoomModal.geofence_radius,
        geolocation: addRoomModal.geolocation,
        school_id,
      });
      const res = await api.get("/admin/rooms");
      setRooms(res.data?.rooms || []);
      setAddRoomModal({ open: false, name: "", room_code: "", geofence_radius: 150, geolocation: "" });
      showToast("Ruangan berhasil ditambah!", 'success');
    } catch (err: any) {
      console.error('[ADD ROOM] Error:', err.response?.status, err.response?.data);
      showToast(err?.response?.data?.detail || "Gagal menambah ruangan", 'error');
    } finally {
      setAddRoomLoading(false);
    }
  };

  const updateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRoomModal.id) return;
    try {
      console.log('[UPDATE ROOM] ID:', editRoomModal.id, 'Payload:', editRoomModal);
      await api.put(`/admin/rooms/${editRoomModal.id}`, {
        name: editRoomModal.name,
        room_code: editRoomModal.room_code,
        geofence_radius: editRoomModal.geofence_radius,
        geolocation: editRoomModal.geolocation,
      });
      const res = await api.get("/admin/rooms");
      setRooms(res.data?.rooms || []);
      setEditRoomModal({ open: false, id: "", name: "", room_code: "", geofence_radius: 150, geolocation: "" });
      showToast("Ruangan berhasil diupdate!", 'success');
    } catch (err: any) {
      console.error('[UPDATE ROOM] Error:', err.response?.status, err.response?.data);
      showToast(err?.response?.data?.detail || "Gagal mengupdate ruangan", 'error');
    }
  };

  const deleteRoom = async (id: string, name: string) => {
    showDeleteConfirm(id, name, 'room');
  };

  const deleteJurusan = async (id: string, name: string) => {
    showDeleteConfirm(id, name, 'jurusan');
  };

  const deleteSubject = async (id: string, name: string) => {
    showDeleteConfirm(id, name, 'subject');
  };

  const deleteGrade = async (id: string, name: string) => {
    showDeleteConfirm(id, name, 'grade');
  };

  const deleteSchedule = async (id: string) => {
    console.log('[DELETE SCHEDULE] ID:', id);
    const schedule = gradeSchedules.find(s => s.id === id);
    const name = schedule 
      ? `${schedule.grade_name || 'Kelas'} - ${schedule.subject_name || 'Mapel'} (${schedule.day_of_week} ${schedule.start_time}-${schedule.end_time})`
      : 'Jadwal';
    showDeleteConfirm(id, name, 'schedule');
  };

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchedule.grade_id || !newSchedule.subject_id || !newSchedule.teacher_id) return;
    
    // Validate: Mapel dan Kelas harus satu jurusan
    const grade = grades.find(g => g.id === newSchedule.grade_id);
    const subject = subjects.find(s => s.id === newSchedule.subject_id);
    if (grade?.jurusan_id && subject?.jurusan_id && grade.jurusan_id !== subject.jurusan_id) {
      showToast("Mapel dan kelas harus satu jurusan!", 'error');
      return;
    }
    
    try {
      console.log('[ADD SCHEDULE] Payload:', newSchedule);
      await api.post("/admin/grade-schedules", newSchedule);
      const res = await api.get("/admin/grade-schedules");
      setGradeSchedules(res.data?.grade_schedules || []);
      setNewSchedule({
        grade_id: "",
        subject_id: "",
        teacher_id: "",
        day_of_week: "Senin",
        start_time: "07:00",
        end_time: "12:00",
        room_id: "",
      });
      showToast("Jadwal kelas berhasil ditambah!", 'success');
    } catch (err: any) {
      console.error('[ADD SCHEDULE] Error:', err.response?.status, err.response?.data);
      showToast(err?.response?.data?.detail || "Gagal menambah jadwal kelas", 'error');
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
      console.log('[EDIT TEACHER] ID:', editTeacherModal.teacherId, 'Payload:', editTeacherModal);
      const updateData: any = {
        name: editTeacherModal.teacherName,
        email: editTeacherModal.teacherEmail,
        nip: editTeacherModal.teacherNip,
      };
      
      // Only include password if changed
      if (editTeacherModal.newPassword && editTeacherModal.newPassword.length >= 6) {
        if (editTeacherModal.newPassword !== editTeacherModal.confirmNewPassword) {
          showToast("Konfirmasi password tidak cocok", 'error');
          setEditTeacherLoading(false);
          return;
        }
        updateData.password = editTeacherModal.newPassword;
      }
      
      await api.put(`/admin/teachers/${editTeacherModal.teacherId}`, updateData);
      showToast(`${editTeacherModal.teacherName} berhasil diperbarui!`, 'success');
      setEditTeacherModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "", teacherNip: "", newPassword: "", confirmNewPassword: "" });
      // Reload teachers
      const res = await api.get("/admin/teachers");
      setTeachers(res.data?.teachers || []);
    } catch (err: any) {
      console.error('[EDIT TEACHER] Error:', err.response?.status, err.response?.data);
      showToast(err.response?.data?.detail || "Gagal mengupdate data guru", 'error');
    } finally {
      setEditTeacherLoading(false);
    }
  };

  const handleDeleteTeacher = async (teacherId: string, teacherName: string) => {
    showDeleteConfirm(teacherId, teacherName, 'teacher');
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherForm.name || !newTeacherForm.nip || !newTeacherForm.email) {
      showToast("Nama, NIP, dan Email wajib diisi", "error");
      return;
    }
    if (newTeacherForm.password.length < 6) {
      showToast("Password minimal 6 karakter", "error");
      return;
    }
    if (newTeacherForm.password !== newTeacherForm.confirmPassword) {
      showToast("Password tidak cocok", "error");
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
      showToast(`Guru ${newTeacherForm.name} berhasil ditambahkan`, 'success');
      setNewTeacherForm({ name: "", nip: "", email: "", phone: "", password: "", confirmPassword: "" });
      // Reload teachers
      const res = await api.get("/admin/teachers");
      setTeachers(res.data?.teachers || []);
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Gagal menambah guru", 'error');
    } finally {
      setAddTeacherLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast("Password minimal 6 karakter", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Password tidak cocok", "error");
      return;
    }

    setResetPasswordLoading(true);
    try {
      await api.post("/admin/teachers/reset-password", {
        teacher_id: resetPasswordModal.teacherId,
        new_password: newPassword,
      });
      showToast(`Password guru ${resetPasswordModal.teacherName} berhasil direset`, "success");
      setResetPasswordModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "" });
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Gagal mereset password", "error");
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const pending = useMemo(() => leaves.filter((l) => l.status === "pending"), [leaves]);

  const nav = (id: Tab, label: string, Icon: typeof LayoutDashboard) => (
    <button
      key={id}
      onClick={() => {
        setTab(id);
        localStorage.setItem("sipguru-active-tab", id);
        setMobileSidebarOpen(false);
      }}
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
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-stone-900 border-r border-gray-200 dark:border-stone-800 shadow-xl transform transition-transform duration-300 ease-in-out lg:hidden ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Mobile navigation"
      >
        <div className="flex flex-col h-full">
          {/* Header with logo and close button */}
          <div className="p-6 border-b border-gray-200 dark:border-stone-800 flex items-center justify-between">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
              SIPGURU
            </h1>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation tabs */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  localStorage.setItem("sipguru-active-tab", id);
                  setMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
                  tab === id
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </nav>

          {/* Profile section at bottom */}
          <div className="p-4 border-t border-gray-200 dark:border-stone-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-emerald-600 to-emerald-500 rounded-full flex items-center justify-center text-white shadow-emerald-glow">
                <span className="font-bold">{user?.name?.charAt(0) || "A"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-stone-800">
              <button
                onClick={toggleTheme}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-stone-800 rounded-lg hover:bg-gray-200 dark:hover:bg-stone-700 transition-colors"
                title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{theme === "dark" ? "Mode Terang" : "Mode Gelap"}</span>
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(true); setMobileSidebarOpen(false); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex h-screen lg:flex">
        {/* Desktop Sidebar */}
        <div className="w-64 bg-white dark:bg-stone-900 border-r border-gray-200 dark:border-stone-800 hidden lg:flex flex-col shadow-card dark:shadow-none">
          <div className="p-6 border-b border-gray-200 dark:border-stone-800">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
              SIPGURU
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">Admin Dashboard</p>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
            {tabs.map(({ id, label, Icon }) => nav(id, label, Icon))}
          </nav>
          <div className="p-4 border-t border-gray-200 dark:border-stone-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-emerald-600 to-emerald-500 rounded-full flex items-center justify-center text-white shadow-emerald-glow">
                <span className="font-bold">{user?.name?.charAt(0) || "A"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-950/30"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors dark:hover:bg-emerald-950/30"
                title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden lg:overflow-y-auto">
          {/* Mobile Top Bar with Burger Menu */}
          <header className="lg:hidden bg-white dark:bg-stone-900 border-b border-gray-200 dark:border-stone-800 p-4 sticky top-0 z-30 shadow-sm">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Buka menu"
                aria-expanded={mobileSidebarOpen}
              >
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
                SIPGURU
              </h1>
              <div className="w-10" /> {/* spacer for centering */}
            </div>
          </header>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-stone-950/50 p-4 lg:p-8 animate-in fade-in duration-500 motion-reduce:animate-none">
            <div className="flex justify-between items-center mb-6 md:mb-8">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                {tab === "dashboard" ? "Dashboard" : tab === "guru" ? "Data Guru" : tab === "qr" ? "QR Ruangan" : tab === "izin" ? "Permohonan Izin" : tab === "mapel" ? "Mata Pelajaran" : tab === "kelas" ? "Kelas" : tab === "jurusan" ? "Jurusan" : "Jadwal Kelas"}
              </h2>
              <div className="text-xs lg:text-sm text-gray-600 dark:text-gray-400 flex flex-col items-end gap-1 hidden sm:block">
                <div>{currentTime.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
                <div className="text-xs font-mono text-gray-500 dark:text-gray-500">
                  {currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>
            </div>

            {msg && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 rounded-xl text-sm border border-red-100 dark:border-red-900/30">
                {msg}
              </div>
            )}

            {tab === "dashboard" && (
              <>
                {/* Stats Grid - Responsive: 1 col mobile, 2 col tablet (sm), 4 col desktop (lg) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8 animate-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
                  {[
                    { label: "Total Guru", value: teachers.length, icon: Users, bg: "bg-emerald-500" },
                    { label: "Hari Ini Presensi", value: stats.total, icon: CheckCircle, bg: "bg-green-500" },
                    { label: "Terlambat", value: stats.late, icon: Clock, bg: "bg-amber-500" },
                    { label: "Izin Pending", value: pending.length, icon: Calendar, bg: "bg-blue-500" },
                  ].map(({ label, value, icon: Icon, bg }) => (
                    <div key={label} className="glass-card-light p-4 lg:p-6 transition-colors duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none">
                      <div className="flex items-center gap-3 lg:gap-4">
                        <div className={`p-3 rounded-xl ${bg} text-white shadow-lg`}>
                          <Icon className="w-5 h-5 lg:w-6 lg:h-6" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{label}</p>
                          <p className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{loading ? "…" : value}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Teachers List */}
                <div className="glass-card-light overflow-hidden animate-in slide-in-from-bottom-4 duration-500 delay-100 motion-reduce:animate-none">
                  <div className="p-4 lg:p-6 border-b border-gray-100 dark:border-gray-800">
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
                        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                          <div className="w-10 h-10 flex-shrink-0 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                            <span className="font-bold text-gray-600 dark:text-gray-300">{t.name.charAt(0)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{t.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{t.nip} • {t.email}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === "guru" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
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
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline" fill="none" viewBox="0 0 24 24" aria-hidden="true">
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
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
                <div className="glass-card-light p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Generate QR Absensi</h3>
                    <button
                      onClick={() => setAddRoomModal({ open: true, name: "", room_code: "", geofence_radius: 150, geolocation: "" })}
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
                          disabled={generatingId === s.id}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-emerald-glow disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {generatingId === s.id ? (
                            <span className="flex items-center gap-2">
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                              Loading...
                            </span>
                          ) : (
                            'Generate'
                          )}
                        </button>
                      </div>
                    ))}

                    {/* QR Token Display - Inline under the generated schedule */}
                    {qrToken && qrRoom && (
                      <div className="glass-card-light p-4 border-emerald-200/50 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 animate-in slide-in-from-top-2 duration-300">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-emerald-800 dark:text-emerald-300 truncate">{qrRoom}</p>
                            <p className="text-xs font-mono break-all bg-gray-100 dark:bg-white/10 p-2 rounded-lg mt-1 text-gray-700 dark:text-gray-300">{qrToken}</p>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <button
                              onClick={copyToken}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap"
                            >
                              {copied ? '✓ Tersalin!' : 'Salin Token'}
                            </button>
                            <button
                              onClick={() => { setQrToken(""); setQrRoom(""); }}
                              className="px-3 py-1.5 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/20 transition-colors whitespace-nowrap"
                            >
                              Tutup
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Room List with Geofence Customization */}
                <div className="glass-card-light overflow-hidden mt-6">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daftar Ruangan</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Kustomisasi radius geofence per ruangan</p>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {rooms.length === 0 && (
                      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Belum ada ruangan. Klik tombol "Tambah Ruangan" untuk memulai.</p>
                    )}
                    {rooms.map((r) => (
                      <div key={r.id} className="p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{r.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Kode: {r.room_code}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="px-3 py-1 text-xs font-medium bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 rounded-full">
                              Radius: {r.geofence_radius || 150}m
                            </span>
                            <button
                              onClick={() => setEditRoomModal({ open: true, id: r.id, name: r.name, room_code: r.room_code, geofence_radius: r.geofence_radius || 150, geolocation: r.geolocation || "" })}
                              className="px-3 py-1 text-xs bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-950/50 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteRoom(r.id, r.name)}
                              className="px-3 py-1 text-xs bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-950/50 transition-colors"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-xs text-gray-500 dark:text-gray-400">
                          <span>Geofence aktif: <span className="font-medium text-emerald-600 dark:text-emerald-400">{r.geofence_radius || 150}m</span></span>
                          <span>Lokasi: {r.geolocation || 'Belum diset'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Room Modal */}
                <Modal
                  isOpen={addRoomModal.open}
                  onClose={() => setAddRoomModal({ open: false, name: "", room_code: "", geofence_radius: 150, geolocation: "" })}
                  title="Tambah Ruangan"
                  size="md"
                >
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
                    
                    {/* Geolocation with Map Picker */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-emerald-600" />
                        Lokasi Geofence
                      </label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          placeholder="Lat, Lng (klik peta atau ketik manual)"
                          value={addRoomModal.geolocation}
                          onChange={(e) => setAddRoomModal({ ...addRoomModal, geolocation: e.target.value })}
                          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setMapMode('add');
                            const [lat, lng] = addRoomModal.geolocation ? addRoomModal.geolocation.split(',').map(Number) : [-6.2088, 106.8456];
                            setTempLocation({ lat, lng });
                            setShowMapPicker(true);
                          }}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap"
                        >
                          Pilih di Peta
                        </button>
                      </div>
                      {addRoomModal.geolocation && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Koordinat: {addRoomModal.geolocation}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setAddRoomModal({ open: false, name: "", room_code: "", geofence_radius: 150, geolocation: "" })}
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
                </Modal>

                {/* Edit Room Modal */}
                <Modal
                  isOpen={editRoomModal.open}
                  onClose={() => setEditRoomModal({ open: false, id: "", name: "", room_code: "", geofence_radius: 150, geolocation: "" })}
                  title="Edit Ruangan"
                  size="md"
                >
                  <form onSubmit={updateRoom} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Ruangan</label>
                      <input
                        type="text"
                        placeholder="Contoh: Ruang Komputer 1"
                        value={editRoomModal.name}
                        onChange={(e) => setEditRoomModal({ ...editRoomModal, name: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kode Ruangan</label>
                      <input
                        type="text"
                        placeholder="Contoh: RK01"
                        value={editRoomModal.room_code}
                        onChange={(e) => setEditRoomModal({ ...editRoomModal, room_code: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Radius Geofence (meter)</label>
                      <input
                        type="number"
                        placeholder="150"
                        value={editRoomModal.geofence_radius}
                        onChange={(e) => setEditRoomModal({ ...editRoomModal, geofence_radius: parseInt(e.target.value) || 150 })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        min="1"
                        max="1000"
                      />
                    </div>
                    
                    {/* Geolocation with Map Picker */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-emerald-600" />
                        Lokasi Geofence
                      </label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          placeholder="Lat, Lng (klik peta atau ketik manual)"
                          value={editRoomModal.geolocation}
                          onChange={(e) => setEditRoomModal({ ...editRoomModal, geolocation: e.target.value })}
                          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-stone-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setMapMode('edit');
                            const [lat, lng] = editRoomModal.geolocation ? editRoomModal.geolocation.split(',').map(Number) : [-6.2088, 106.8456];
                            setTempLocation({ lat, lng });
                            setShowMapPicker(true);
                          }}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap"
                        >
                          Pilih di Peta
                        </button>
                      </div>
                      {editRoomModal.geolocation && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Koordinat: {editRoomModal.geolocation}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setEditRoomModal({ open: false, id: "", name: "", room_code: "", geofence_radius: 150, geolocation: "" })}
                        className="flex-1 px-4 py-2 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        Simpan Perubahan
                      </button>
                    </div>
                  </form>
                </Modal>
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
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{l.start_date} sampai {l.end_date}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{l.reason}</p>
                      {l.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => decideLeave(l.id, true)}
                            className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-emerald-btn"
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
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
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
                              onClick={() => deleteSubject(s.id, s.name)}
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
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
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
                    {grades.map((g) => {
                      // Get jurusan name from multiple sources
                      const jurusanName = g.jurusan_name || 
                                         (g.jurusan_id ? jurusanList.find(j => j.id === g.jurusan_id)?.name : null) || 
                                         'N/A';
                      
                      // Get related schedules info
                      const relatedSchedules = gradeSchedules.filter(gs => gs.grade_id === g.id);
                      const uniqueSubjects = Array.from(new Set(relatedSchedules.map(gs => gs.subject_name))).filter(Boolean);
                      const uniqueTeachers = Array.from(new Set(relatedSchedules.map(gs => gs.teacher_name))).filter(Boolean);
                      
                      return (
                        <div key={g.id} className="p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{g.name}</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Tingkat {g.grade_level}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteGrade(g.id, g.name)}
                              className="px-3 py-1 text-sm bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-950/50 transition-colors"
                            >
                              Hapus
                            </button>
                          </div>
                          
                          {/* Enhanced info display */}
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <GraduationCap className="w-3 h-3" />
                              <span>Jurusan: {jurusanName}</span>
                            </div>
                            {uniqueSubjects.length > 0 && (
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <BookOpen className="w-3 h-3" />
                                <span>Mapel: {uniqueSubjects.join(', ')}</span>
                              </div>
                            )}
                            {uniqueTeachers.length > 0 && (
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <Users className="w-3 h-3" />
                                <span>Guru: {uniqueTeachers.join(', ')}</span>
                              </div>
                            )}
                            {uniqueSubjects.length === 0 && uniqueTeachers.length === 0 && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                                Belum ada jadwal - Tambahkan ke jadwal kelas untuk menampilkan info lengkap
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

            {tab === "jurusan" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
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
                          onClick={() => deleteJurusan(j.id, j.name)}
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

            {/* Map Picker Modal - rendered at top level for all tabs */}
            <Modal
              isOpen={showMapPicker && tempLocation !== null}
              onClose={() => setShowMapPicker(false)}
              title="Pilih Lokasi Geofence"
              size="xl"
            >
              <MapPicker
                initialLat={tempLocation?.lat ?? -6.2088}
                initialLng={tempLocation?.lng ?? 106.8456}
                radius={mapMode === 'add' ? addRoomModal.geofence_radius : editRoomModal.geofence_radius}
                onLocationSelect={(lat, lng) => {
                  const locationStr = `${lat}, ${lng}`;
                  if (mapMode === 'add') {
                    setAddRoomModal({ ...addRoomModal, geolocation: locationStr });
                  } else {
                    setEditRoomModal({ ...editRoomModal, geolocation: locationStr });
                  }
                  setTempLocation({ lat, lng });
                }}
              />
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowMapPicker(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => setShowMapPicker(false)}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
                >
                  Gunakan Lokasi Ini
                </button>
              </div>
            </Modal>

            {tab === "jadwal" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
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
                        <option value="Senin">Senin</option>
                        <option value="Selasa">Selasa</option>
                        <option value="Rabu">Rabu</option>
                        <option value="Kamis">Kamis</option>
                        <option value="Jumat">Jumat</option>
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
                          {s.day_of_week} • {s.start_time} sampai {s.end_time}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Guru: {s.teacher_name || "N/A"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "laporan" && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
                <div className="glass-card-light p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Laporan Absensi</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Akses halaman laporan lengkap dengan fitur export PDF/Excel/CSV
                  </p>
                  <a
                    href="/admin/reports"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-emerald-glow"
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
              <Modal
                isOpen={resetPasswordModal.open}
                onClose={() => setResetPasswordModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "" })}
                title="Reset Password Guru"
                size="md"
              >
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
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        "Reset Password"
                      )}
                    </button>
                  </div>
                </form>
              </Modal>

              {/* Edit Teacher Modal */}
              <Modal
                isOpen={editTeacherModal.open}
                onClose={() => setEditTeacherModal({ open: false, teacherId: "", teacherName: "", teacherEmail: "", teacherNip: "", newPassword: "", confirmNewPassword: "" })}
                title="Edit Data Guru"
                size="md"
              >
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
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        "Simpan Perubahan"
                      )}
                    </button>
                  </div>
                </form>
              </Modal>

              {/* Animated Delete Confirmation Modal */}
              {confirmDelete && (
                <div
                  className="modal-fixed-overlay flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                >
                  <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl dark:shadow-emerald-glow max-w-md w-full p-6 animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-stone-800">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Hapus Data?</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Tindakan ini tidak dapat dibatalkan</p>
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-stone-800 rounded-lg p-4 mb-6">
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Anda akan menghapus <span className="font-semibold text-emerald-600 dark:text-emerald-400">{confirmDelete.type}</span>:
                      </p>
                      <p className="text-base font-medium text-gray-900 dark:text-white mt-1">"{confirmDelete.name}"</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleDeleteConfirm}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shadow-emerald-btn"
                      >
                        Ya, Hapus
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Animated Edit Confirmation Modal */}
              {confirmEdit && (
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
                  className="flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                >
                  <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl dark:shadow-emerald-glow max-w-md w-full p-6 animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-stone-800">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/30 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Simpan Perubahan?</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Pastikan data sudah benar</p>
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-stone-800 rounded-lg p-4 mb-6">
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Update data <span className="font-semibold text-emerald-600 dark:text-emerald-400">{confirmEdit.type}</span>:
                      </p>
                      <p className="text-base font-medium text-gray-900 dark:text-white mt-1">"{confirmEdit.name}"</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmEdit(null)}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleEditConfirm}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-emerald-btn"
                      >
                        Ya, Simpan
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Toast Container */}
              <ToastContainer toasts={toasts} remove={error} />

              {/* Logout Confirmation Modal */}
              <LogoutConfirmModal
                open={showLogoutConfirm}
                onConfirm={() => {
                  setShowLogoutConfirm(false);
                  useAuthStore.getState().logout();
                }}
                onCancel={() => setShowLogoutConfirm(false)}
              />

              {/* QR Token Modal - True Center (outside scrollable) */}
              {qrModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center min-h-screen bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="glass-card-light p-6 max-w-md w-full mx-auto border-emerald-200/50 dark:border-emerald-900/50 bg-white/95 dark:bg-stone-900/95 animate-in zoom-in-95 duration-200 shadow-2xl">
                    <div className="text-center mb-4">
                      <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/30 rounded-full flex items-center justify-center mx-auto mb-3">
                        <QrCode className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">QR Token Generated</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{qrRoom}</p>
                    </div>
                    
                    <div className="bg-white dark:bg-stone-800 rounded-xl p-6 mb-4 flex items-center justify-center">
                      <QRCodeSVG value={qrToken} size={180} level="M" includeMargin={true} />
                    </div>
                    
                    <div className="bg-gray-50 dark:bg-white/10 rounded-xl p-3 mb-4 text-center">
                      <p className="text-xs font-mono break-all text-gray-700 dark:text-gray-300">{qrToken}</p>
                    </div>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={copyToken}
                        className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4" />
                            Tersalin!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Salin Token
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => { setQrToken(""); setQrRoom(""); setQrModalOpen(false); }}
                        className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                      >
                        Tutup
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        };

        export default AdminDashboard;