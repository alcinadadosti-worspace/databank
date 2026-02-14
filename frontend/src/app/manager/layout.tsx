'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useManagerAuth, ManagerAuthProvider } from './ManagerAuthContext';
import ManagerLogin from './ManagerLogin';
import Sidebar from '@/components/Sidebar';
import { getPendingJustifications, getPendingPunchAdjustments } from '@/lib/api';

function ManagerContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { manager, loading, logout } = useManagerAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingAdjustments, setPendingAdjustments] = useState(0);

  useEffect(() => {
    if (manager?.id) {
      // Load initial counts
      getPendingJustifications(manager.id)
        .then((res) => setPendingCount(res.justifications.length))
        .catch(() => setPendingCount(0));

      getPendingPunchAdjustments(manager.id)
        .then((res) => setPendingAdjustments(res.adjustments.length))
        .catch(() => setPendingAdjustments(0));

      // Refresh counts every 60 seconds
      const interval = setInterval(() => {
        getPendingJustifications(manager.id)
          .then((res) => setPendingCount(res.justifications.length))
          .catch(() => setPendingCount(0));

        getPendingPunchAdjustments(manager.id)
          .then((res) => setPendingAdjustments(res.adjustments.length))
          .catch(() => setPendingAdjustments(0));
      }, 60000);

      return () => clearInterval(interval);
    }
  }, [manager?.id]);

  function handleLogout() {
    logout();
    router.push('/');
  }

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
      <Sidebar role="manager" managerName={manager.name} onLogout={handleLogout} pendingJustifications={pendingCount} pendingAdjustments={pendingAdjustments} />
      <main className="flex-1 min-h-screen p-4 pt-[72px] lg:pt-8 lg:ml-56 lg:p-8">
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
