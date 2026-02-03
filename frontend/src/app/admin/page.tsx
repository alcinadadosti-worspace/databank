'use client';

import { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import RecordsTable from '@/components/RecordsTable';
import { getDashboardStats, getRecordsByDate, getAllRecords, type DashboardStats, type DailyRecord } from '@/lib/api';
import { todayISO, daysAgo, classificationLabel } from '@/lib/utils';

type Filter = 'all' | 'late' | 'overtime' | 'normal' | 'pending';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayRecords, setTodayRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Filter | null>(null);
  const [filteredRecords, setFilteredRecords] = useState<DailyRecord[]>([]);

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

  function handleFilterClick(filter: Filter) {
    if (activeFilter === filter) {
      setActiveFilter(null);
      setFilteredRecords([]);
      return;
    }
    setActiveFilter(filter);
    switch (filter) {
      case 'late':
        setFilteredRecords(todayRecords.filter(r => r.classification === 'late'));
        break;
      case 'overtime':
        setFilteredRecords(todayRecords.filter(r => r.classification === 'overtime'));
        break;
      case 'normal':
        setFilteredRecords(todayRecords.filter(r => r.classification === 'normal'));
        break;
      case 'pending':
        setFilteredRecords(todayRecords.filter(r => (r.classification === 'late' || r.classification === 'overtime') && !r.justification_reason));
        break;
      default:
        setFilteredRecords(todayRecords);
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h2 className="text-lg font-semibold text-text-primary">Dashboard</h2>
        <p className="text-sm text-text-tertiary mt-1">Carregando...</p>
      </div>
    );
  }

  const displayRecords = activeFilter ? filteredRecords : todayRecords;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Dashboard</h2>
        <p className="text-sm text-text-tertiary mt-1">Visao geral do sistema de banco de horas</p>
      </div>

      {/* Stats Grid - Clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <button onClick={() => handleFilterClick('all')} className="text-left">
          <StatsCard
            label="Colaboradores"
            value={stats?.total_employees ?? 0}
            sublabel={activeFilter === 'all' ? '← clique para fechar' : undefined}
          />
        </button>
        <StatsCard label="Gestores" value={stats?.total_leaders ?? 0} />
        <button onClick={() => handleFilterClick('normal')} className="text-left">
          <StatsCard
            label="Registros Ontem"
            value={todayRecords.length}
            sublabel={activeFilter === 'normal' ? '← filtrando normais' : 'Clique para filtrar'}
          />
        </button>
        <button onClick={() => handleFilterClick('late')} className="text-left">
          <StatsCard
            label="Atrasos Ontem"
            value={todayRecords.filter(r => r.classification === 'late').length}
            variant={todayRecords.filter(r => r.classification === 'late').length > 0 ? 'danger' : 'default'}
            sublabel={activeFilter === 'late' ? '← filtrando atrasos' : 'Clique para filtrar'}
          />
        </button>
        <button onClick={() => handleFilterClick('overtime')} className="text-left">
          <StatsCard
            label="Horas Extras Ontem"
            value={todayRecords.filter(r => r.classification === 'overtime').length}
            variant={todayRecords.filter(r => r.classification === 'overtime').length > 0 ? 'warning' : 'default'}
            sublabel={activeFilter === 'overtime' ? '← filtrando extras' : 'Clique para filtrar'}
          />
        </button>
      </div>

      {/* Active filter indicator */}
      {activeFilter && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">
            Filtrando: <span className="text-text-primary font-medium">
              {activeFilter === 'all' ? 'Todos' : activeFilter === 'late' ? 'Atrasos' : activeFilter === 'overtime' ? 'Horas Extras' : activeFilter === 'normal' ? 'Normais' : 'Sem Justificativa'}
            </span>
            {' '}({displayRecords.length} registros)
          </span>
          <button
            onClick={() => { setActiveFilter(null); setFilteredRecords([]); }}
            className="text-xs text-accent hover:text-accent-hover"
          >
            Limpar filtro
          </button>
        </div>
      )}

      {/* Records */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">
          {activeFilter ? 'Registros filtrados' : 'Registros do dia anterior'}
        </h3>
        <RecordsTable records={displayRecords} showEmployee showLeader />
      </div>
    </div>
  );
}
