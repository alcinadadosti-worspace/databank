'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authenticateAdmin, getAuthToken, removeAuthToken } from '@/lib/api';

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

  // Load from localStorage on mount - check for JWT token
  useEffect(() => {
    const token = getAuthToken('admin');
    if (token) {
      // Token exists - consider authenticated
      // In a production app, you'd validate the token here
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
