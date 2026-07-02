import { useState, type ReactNode, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Button, Input, Modal } from './ui';
import { cn } from '../utils/cn';
import { useSocketStatus } from '../lib/socket';

type NavItem = { id: string; label: string; icon: ReactNode };

export default function DashboardLayout({
  title,
  subtitle,
  nav,
  active,
  onChangeTab,
  children,
}: {
  title: string;
  subtitle: string;
  nav: NavItem[];
  active: string;
  onChangeTab: (id: string) => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const [showPwdModal, setShowPwdModal] = useState(false);
  const socketConnected = useSocketStatus();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="fixed inset-x-0 top-0 z-50 h-2 bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900" />
      <div className="flex min-h-screen pt-2">
        {/* Sidebar */}
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-6 lg:flex lg:flex-col">
          <button onClick={() => navigate('/')} className="mb-8 flex items-center gap-3 text-left">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7"><path d="M3 17h18M5 17V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9" /></svg>
            </span>
            <div>
              <p className="text-base font-black">SafeRide</p>
              <p className="text-xs font-medium text-slate-500">Tracking System</p>
            </div>
          </button>

          <nav className="flex-1 space-y-1.5">
            {nav.map((item) => (
              <button
                key={item.id}
                onClick={() => onChangeTab(item.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition',
                  active === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <button
              onClick={() => setShowPwdModal(true)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              Change Password
            </button>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              Logout
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <header className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600">{subtitle}</p>
              <h1 className="text-2xl font-black md:text-3xl">{title}</h1>
            </div>
            <div className="flex items-center gap-4">
              {/* Connection Status Badge */}
              <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold bg-slate-100 border border-slate-200">
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", socketConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
                <span className={socketConnected ? "text-emerald-700" : "text-amber-700"}>
                  {socketConnected ? "Live" : "Offline"}
                </span>
              </div>
              <div className="hidden text-right md:block">
                <p className="text-sm font-bold">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.username}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 font-black text-white">
                {user?.name?.[0] || 'U'}
              </div>
            </div>
          </header>

          {/* Mobile nav */}
          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            {nav.map((item) => (
              <button
                key={item.id}
                onClick={() => onChangeTab(item.id)}
                className={cn(
                  'shrink-0 rounded-xl px-4 py-2 text-sm font-bold',
                  active === item.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700',
                )}
              >
                {item.label}
              </button>
            ))}
            <button onClick={() => setShowPwdModal(true)} className="shrink-0 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
              Password
            </button>
            <button onClick={handleLogout} className="shrink-0 rounded-xl bg-rose-100 px-4 py-2 text-sm font-bold text-rose-700">
              Logout
            </button>
          </div>

          <div className="p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      <ChangePasswordModal
        open={showPwdModal}
        onClose={() => setShowPwdModal(false)}
        onSuccess={(newPwd) => {
          if (user) refreshUser({ ...user });
          setShowPwdModal(false);
          alert(`Password changed successfully. Use your new password next time. (${newPwd.length} chars)`);
        }}
      />
    </div>
  );
}

function ChangePasswordModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: (newPwd: string) => void }) {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPwd.length < 4) {
      setError('New password must be at least 4 characters');
      return;
    }
    if (newPwd !== confirmPwd) {
      setError('New passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(user!.role, username.trim() || user!.username, currentPwd, newPwd);
      onSuccess(newPwd);
      setUsername('');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change Password" maxWidth="max-w-md">
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Username</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={user?.username} />
          <p className="mt-1 text-xs text-slate-400">Leave blank to use your current username</p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Current Password</label>
          <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">New Password</label>
          <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Confirm New Password</label>
          <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} required />
        </div>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={loading}>{loading ? 'Changing...' : 'Change Password'}</Button>
        </div>
      </form>
    </Modal>
  );
}
