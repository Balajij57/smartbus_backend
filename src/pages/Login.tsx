import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type Role } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Input } from '../components/ui';

const ROLE_LABELS: Record<Role, { title: string; hint: string; usernameLabel: string; placeholder: string; demoUser: string; demoPass: string }> = {
  student: {
    title: 'Student Login',
    hint: 'Use your roll number as username.',
    usernameLabel: 'Roll Number',
    placeholder: 'e.g. 22B91A0501',
    demoUser: '22B91A0501',
    demoPass: 'veera123',
  },
  parent: {
    title: 'Parent Login',
    hint: "Use your child's roll number as username.",
    usernameLabel: 'Student Roll Number',
    placeholder: 'e.g. 22B91A0501',
    demoUser: '22B91A0501',
    demoPass: 'parent123',
  },
  admin: {
    title: 'Admin Login',
    hint: 'Use the admin account provided to you.',
    usernameLabel: 'Admin Username',
    placeholder: 'admin',
    demoUser: 'admin',
    demoPass: 'admin123',
  },
  driver: {
    title: 'Driver Login',
    hint: 'Use your driver ID as username.',
    usernameLabel: 'Driver ID',
    placeholder: 'DRV001',
    demoUser: 'DRV001',
    demoPass: 'rajan123',
  },
};

import { useEffect } from 'react';

export default function Login() {
  const { role } = useParams<{ role: Role }>();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [demoCreds, setDemoCreds] = useState<Record<Role, { username: string; password: string }>>({
    student: { username: '22B91A0501', password: 'veera123' },
    parent: { username: '22B91A0501', password: 'parent123' },
    driver: { username: 'DRV001', password: 'rajan123' },
    admin: { username: 'admin', password: 'admin123' },
  });

  const safeRole: Role = (role as Role) || 'student';
  const meta = ROLE_LABELS[safeRole];

  useEffect(() => {
    fetch('/api/auth/demo-credentials')
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (data && data[safeRole]) {
          setDemoCreds(data);
        }
      })
      .catch(() => {
        // Ignore and use local fallbacks
      });
  }, [safeRole]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(safeRole, username.trim(), password);
      login(res.user, res.token);
      navigate(`/dashboard/${safeRole}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo() {
    const cred = demoCreds[safeRole];
    setUsername(cred.username);
    setPassword(cred.password);
    setError('');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="fixed inset-x-0 top-0 h-2 bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900" />
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl">
        <button onClick={() => navigate('/')} className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          Back to home
        </button>

        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8">
              <path d="M3 17h18M5 17V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9M7 13h10M7 21v-4M17 21v-4" />
            </svg>
          </div>
          <h1 className="text-2xl font-black">{meta.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{meta.hint}</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{meta.usernameLabel}</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={meta.placeholder} required />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
          </div>
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </Button>
        </form>
      </div>
    </div>
  );
}
