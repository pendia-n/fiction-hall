import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface User {
  id: number;
  username: string;
  publicName: string;
  display: string;
  introduction?: string;
  contact?: string;
  contact_on?: boolean;
  totp_enabled?: boolean;
  admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, display: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API = '/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch(`${API}/auth/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setUser(await res.json());
      else { setToken(null); localStorage.removeItem('token'); }
    } catch { setToken(null); localStorage.removeItem('token'); }
    setLoading(false);
  }, [token]);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = async (username: string, password: string) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Login failed');
    const data = await res.json();
    setToken(data.token);
    setUser({ id: data.userId, username: data.username, publicName: data.publicName, display: data.publicName });
    localStorage.setItem('token', data.token);
  };

  const register = async (username: string, display: string, password: string) => {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, display, password }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Registration failed');
    const data = await res.json();
    setToken(data.token);
    setUser({ id: data.userId, username: data.username, publicName: data.publicName, display: data.publicName });
    localStorage.setItem('token', data.token);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function authHeaders(token: string | null): Record<string, string> {
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
}
