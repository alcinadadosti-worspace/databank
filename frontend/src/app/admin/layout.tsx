'use client';

import { useAdminAuth, AdminAuthProvider } from './AdminAuthContext';
import AdminLogin from './AdminLogin';
import Sidebar from '@/components/Sidebar';

function AdminContent({ children }: { children: React.ReactNode }) {
  const { authenticated, loading, logout } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <p className="text-text-tertiary">Carregando...</p>
      </div>
    );
  }

  if (!authenticated) {
    return <AdminLogin />;
  }

  return (
    <div className="flex">
      <Sidebar role="admin" onLogout={logout} />
      <main className="ml-56 flex-1 min-h-screen p-8">
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminContent>{children}</AdminContent>
    </AdminAuthProvider>
  );
}
