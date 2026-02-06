'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authenticateAdmin } from '@/lib/api';

interface AdminAuthContextType {
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

const STORAGE_KEY = 'databank_admin_auth';

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      setAuthenticated(true);
    }
    setLoading(false);
  }, []);

  async function login(password: string): Promise<boolean> {
    setError(null);
    setLoading(true);
    try {
      const result = await authenticateAdmin(password);
      if (result.success && result.admin?.authenticated) {
        setAuthenticated(true);
        localStorage.setItem(STORAGE_KEY, 'true');
        return true;
      }
      setError('Senha incorreta');
      return false;
    } catch (err: any) {
      setError(err.message || 'Erro ao autenticar');
      return false;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setAuthenticated(false);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <AdminAuthContext.Provider value={{ authenticated, loading, error, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}
