'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authenticateManager, getAuthToken, removeAuthToken, type ManagerAuth } from '@/lib/api';

interface ManagerAuthContextType {
  manager: ManagerAuth | null;
  loading: boolean;
  error: string | null;
  login: (email: string) => Promise<boolean>;
  logout: () => void;
}

const ManagerAuthContext = createContext<ManagerAuthContextType | undefined>(undefined);

const MANAGER_DATA_KEY = 'databank_manager_data';

export function ManagerAuthProvider({ children }: { children: ReactNode }) {
  const [manager, setManager] = useState<ManagerAuth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load from localStorage on mount - check for JWT token
  useEffect(() => {
    const token = getAuthToken('manager');
    const storedData = localStorage.getItem(MANAGER_DATA_KEY);

    if (token && storedData) {
      try {
        setManager(JSON.parse(storedData));
      } catch {
        localStorage.removeItem(MANAGER_DATA_KEY);
        removeAuthToken('manager');
      }
    }
    setLoading(false);
  }, []);

  async function login(email: string): Promise<boolean> {
    setError(null);
    setLoading(true);
    try {
      const result = await authenticateManager(email);
      if (result.success && result.leader) {
        setManager(result.leader);
        // Store manager data separately (token is stored by authenticateManager)
        localStorage.setItem(MANAGER_DATA_KEY, JSON.stringify(result.leader));
        return true;
      }
      setError('Email não autorizado');
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
    removeAuthToken('manager');
    localStorage.removeItem(MANAGER_DATA_KEY);
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
