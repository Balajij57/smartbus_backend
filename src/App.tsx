import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Home from './pages/Home';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import ParentDashboard from './pages/ParentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import DriverDashboard from './pages/DriverDashboard';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login/:role" element={<Login />} />
          <Route path="/dashboard/student" element={<RoleGuard role="student"><StudentDashboard /></RoleGuard>} />
          <Route path="/dashboard/parent" element={<RoleGuard role="parent"><ParentDashboard /></RoleGuard>} />
          <Route path="/dashboard/admin" element={<RoleGuard role="admin"><AdminDashboard /></RoleGuard>} />
          <Route path="/dashboard/driver" element={<RoleGuard role="driver"><DriverDashboard /></RoleGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function RoleGuard({ role, children }: { role: 'student' | 'parent' | 'admin' | 'driver'; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={`/login/${role}`} replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}
