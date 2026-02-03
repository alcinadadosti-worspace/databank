'use client';

import { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import RecordsTable from '@/components/RecordsTable';
import { getDashboardStats, getRecordsByDate, type DashboardStats, type DailyRecord } from '@/lib/api';
import { todayISO, daysAgo } from '@/lib/utils';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayRecords, setTodayRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, recordsData] = await Promise.all([
          getDashboardStats(),
          getRecordsByDate(daysAgo(1)),
        ]);
        setStats(statsData);
        setTodayRecords(recordsData.records);
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h2 className="text-lg font-semibold text-text-primary">Dashboard</h2>
        <p className="text-sm text-text-tertiary mt-1">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Dashboard</h2>
        <p className="text-sm text-text-tertiary mt-1">Visao geral do sistema de banco de horas</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard label="Colaboradores" value={stats?.total_employees ?? 0} />
        <StatsCard label="Gestores" value={stats?.total_leaders ?? 0} />
        <StatsCard label="Registros Hoje" value={stats?.today_records ?? 0} />
        <StatsCard
          label="Alertas Hoje"
          value={stats?.today_alerts ?? 0}
          variant={stats?.today_alerts ? 'danger' : 'default'}
        />
        <StatsCard
          label="Sem Justificativa"
          value={stats?.pending_justifications ?? 0}
          variant={stats?.pending_justifications ? 'warning' : 'default'}
        />
      </div>

      {/* Yesterday's Records */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">Registros do dia anterior</h3>
        <RecordsTable records={todayRecords} showEmployee showLeader />
      </div>
    </div>
  );
}
