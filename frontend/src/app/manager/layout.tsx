'use client';

import { useManagerAuth, ManagerAuthProvider } from './ManagerAuthContext';
import ManagerLogin from './ManagerLogin';
import Sidebar from '@/components/Sidebar';

function ManagerContent({ children }: { children: React.ReactNode }) {
  const { manager, loading, logout } = useManagerAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <p className="text-text-tertiary">Carregando...</p>
      </div>
    );
  }

  if (!manager) {
    return <ManagerLogin />;
  }

  return (
    <div className="flex">
      <Sidebar role="manager" managerName={manager.name} onLogout={logout} />
      <main className="ml-56 flex-1 min-h-screen p-8">
        {children}
      </main>
    </div>
  );
}

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ManagerAuthProvider>
      <ManagerContent>{children}</ManagerContent>
    </ManagerAuthProvider>
  );
}
