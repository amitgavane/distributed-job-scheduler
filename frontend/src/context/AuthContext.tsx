import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../lib/api';
import { IS_DEMO } from '../lib/isDemo';
import { DEMO_USER } from '../demo/fixtures';

const DEMO_TOKEN = 'demo-token-visual-mode';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (IS_DEMO) return DEMO_USER;
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() =>
    IS_DEMO ? DEMO_TOKEN : localStorage.getItem('token')
  );

  useEffect(() => {
    if (!IS_DEMO) return;
    localStorage.setItem('token', DEMO_TOKEN);
    localStorage.setItem('user', JSON.stringify(DEMO_USER));
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    if (!IS_DEMO) {
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
    }
    setToken(result.token);
    setUser(result.user);
  };

  const logout = () => {
    if (!IS_DEMO) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('scheduler-context');
    }
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
