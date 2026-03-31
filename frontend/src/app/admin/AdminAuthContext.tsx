'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authenticateAdmin, verifyAdminToken, getAuthToken, removeAuthToken } from '@/lib/api';

interface AdminAuthContextType {
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, validate token against the backend — never trust localStorage alone
  useEffect(() => {
    const token = getAuthToken('admin');
    if (!token) {
      setLoading(false);
      return;
    }
    verifyAdminToken().then(valid => {
      if (valid) {
        setAuthenticated(true);
      } else {
        // Token expired or invalid — clear it so the login form is shown
        removeAuthToken('admin');
      }
      setLoading(false);
    });
  }, []);

  async function login(password: string): Promise<boolean> {
    setError(null);
    setLoading(true);
    try {
      const result = await authenticateAdmin(password);
      if (result.success && result.admin?.authenticated) {
        setAuthenticated(true);
        // Token is stored automatically by authenticateAdmin
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
    removeAuthToken('admin');
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
