import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { AttendanceProvider } from "./contexts/AttendanceContext";
import TeacherLayout from "./components/TeacherLayout";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherProfile from "./pages/TeacherProfile";
import TeacherSchedulePage from "./pages/TeacherSchedulePage";
import TeacherHistoryPage from "./pages/TeacherHistoryPage";
import TeacherLeaveHistoryPage from "./pages/TeacherLeaveHistoryPage";
import ReportsPage from "./pages/ReportsPage";

const HomeRedirect = () => {
  const { isAuthenticated, role } = useAuth();
  const destination = !isAuthenticated ? "/login"
    : role === "admin" ? "/admin/dashboard"
    : role === "teacher" ? "/teacher/dashboard" : "/login";
  return <Navigate to={destination} replace />;
};

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(role || "")) return <HomeRedirect />;
  return <>{children}</>;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin/dashboard"
        element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>}
      />
      <Route
        path="/admin/reports"
        element={<ProtectedRoute allowedRoles={["admin"]}><ReportsPage /></ProtectedRoute>}
      />
      <Route element={<ProtectedRoute allowedRoles={["teacher"]}><AttendanceProvider><TeacherLayout /></AttendanceProvider></ProtectedRoute>}>
        <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
        <Route path="/teacher/schedule" element={<TeacherSchedulePage />} />
        <Route path="/teacher/history" element={<TeacherHistoryPage />} />
        <Route path="/teacher/history/leave" element={<TeacherLeaveHistoryPage />} />
        <Route path="/teacher/profile" element={<TeacherProfile />} />
      </Route>
      <Route path="/attendance" element={<HomeRedirect />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default App;
