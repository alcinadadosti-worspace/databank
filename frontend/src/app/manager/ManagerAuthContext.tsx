'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authenticateManager, type ManagerAuth } from '@/lib/api';

interface ManagerAuthContextType {
  manager: ManagerAuth | null;
  loading: boolean;
  error: string | null;
  login: (email?: string, password?: string) => Promise<boolean>;
  logout: () => void;
}

const ManagerAuthContext = createContext<ManagerAuthContextType | undefined>(undefined);

const STORAGE_KEY = 'databank_manager_auth';

export function ManagerAuthProvider({ children }: { children: ReactNode }) {
  const [manager, setManager] = useState<ManagerAuth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setManager(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  async function login(email?: string, password?: string): Promise<boolean> {
    setError(null);
    setLoading(true);
    try {
      const result = await authenticateManager(email, password);
      if (result.success && result.leader) {
        setManager(result.leader);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.leader));
        return true;
      }
      setError('Credenciais inválidas');
      return false;
    } catch (err: any) {
      setError(err.message || 'Erro ao autenticar');
      return false;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setManager(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <ManagerAuthContext.Provider value={{ manager, loading, error, login, logout }}>
      {children}
    </ManagerAuthContext.Provider>
  );
}

export function useManagerAuth() {
  const context = useContext(ManagerAuthContext);
  if (context === undefined) {
    throw new Error('useManagerAuth must be used within a ManagerAuthProvider');
  }
  return context;
}
