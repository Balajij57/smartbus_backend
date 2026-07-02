import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role, User } from './api';

type AuthState = {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  refreshUser: (user: User) => void;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('sb-auth');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setUser(parsed.user);
        setToken(parsed.token);
      } catch {}
    }
  }, []);

  const login = (u: User, t: string) => {
    setUser(u);
    setToken(t);
    localStorage.setItem('sb-auth', JSON.stringify({ user: u, token: t }));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('sb-auth');
  };

  const refreshUser = (u: User) => {
    setUser(u);
    localStorage.setItem('sb-auth', JSON.stringify({ user: u, token }));
  };

  return <AuthCtx.Provider value={{ user, token, login, logout, refreshUser }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useRequireRole(role: Role) {
  const { user } = useAuth();
  return user?.role === role ? user : null;
}
