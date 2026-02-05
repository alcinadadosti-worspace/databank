'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import StatsCard from '@/components/StatsCard';
import RecordsTable from '@/components/RecordsTable';
import { getDashboardStats, getRecordsByDate, getLeaders, type DashboardStats, type DailyRecord, type Leader } from '@/lib/api';
import { daysAgo } from '@/lib/utils';

type Filter = 'all' | 'late' | 'overtime' | 'normal' | 'pending';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [allRecords, setAllRecords] = useState<DailyRecord[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Filter | null>(null);

  // Filter states
  const [selectedDate, setSelectedDate] = useState(daysAgo(1));
  const [selectedLeader, setSelectedLeader] = useState<string>('');
  const [searchName, setSearchName] = useState('');

  const loadRecords = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const recordsData = await getRecordsByDate(date);
      setAllRecords(recordsData.records);
    } catch (error) {
      console.error('Failed to load records:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadInitial() {
      try {
        const [statsData, recordsData, leadersData] = await Promise.all([
          getDashboardStats(),
          getRecordsByDate(selectedDate),
          getLeaders(),
        ]);
        setStats(statsData);
        setAllRecords(recordsData.records);
        setLeaders(leadersData.leaders);
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, []);

  // Reload records when date changes
  useEffect(() => {
    if (!loading) {
      loadRecords(selectedDate);
    }
  }, [selectedDate]);

  // Apply all filters (classification, leader, name search)
  const filteredRecords = useMemo(() => {
    let records = allRecords;

    // Filter by classification
    if (activeFilter) {
      switch (activeFilter) {
        case 'late':
          records = records.filter(r => r.classification === 'late');
          break;
        case 'overtime':
          records = records.filter(r => r.classification === 'overtime');
          break;
        case 'normal':
          records = records.filter(r => r.classification === 'normal');
          break;
        case 'pending':
          records = records.filter(r => (r.classification === 'late' || r.classification === 'overtime') && !r.justification_reason);
          break;
      }
    }

    // Filter by leader
    if (selectedLeader) {
      records = records.filter(r => r.leader_name === selectedLeader);
    }

    // Filter by name search
    if (searchName.trim()) {
      const search = searchName.toLowerCase().trim();
      records = records.filter(r => r.employee_name?.toLowerCase().includes(search));
    }

    return records;
  }, [allRecords, activeFilter, selectedLeader, searchName]);

  function handleFilterClick(filter: Filter) {
    if (activeFilter === filter) {
      setActiveFilter(null);
      return;
    }
    setActiveFilter(filter);
  }

  // Get unique leader names for dropdown
  const leaderNames = useMemo(() => {
    const names = new Set(allRecords.map(r => r.leader_name).filter(Boolean));
    return Array.from(names).sort();
  }, [allRecords]);

  const isInitialLoading = loading && allRecords.length === 0;

  if (isInitialLoading) {
    return (
      <div className="animate-fade-in">
        <h2 className="text-lg font-semibold text-text-primary">Dashboard</h2>
        <p className="text-sm text-text-tertiary mt-1">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
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
            label="Registros"
            value={allRecords.length}
            sublabel={activeFilter === 'normal' ? '← filtrando normais' : 'Clique para filtrar'}
          />
        </button>
        <button onClick={() => handleFilterClick('late')} className="text-left">
          <StatsCard
            label="Atrasos"
            value={allRecords.filter(r => r.classification === 'late').length}
            variant={allRecords.filter(r => r.classification === 'late').length > 0 ? 'danger' : 'default'}
            sublabel={activeFilter === 'late' ? '← filtrando atrasos' : 'Clique para filtrar'}
          />
        </button>
        <button onClick={() => handleFilterClick('overtime')} className="text-left">
          <StatsCard
            label="Horas Extras"
            value={allRecords.filter(r => r.classification === 'overtime').length}
            variant={allRecords.filter(r => r.classification === 'overtime').length > 0 ? 'warning' : 'default'}
            sublabel={activeFilter === 'overtime' ? '← filtrando extras' : 'Clique para filtrar'}
          />
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Date picker */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-tertiary">Data</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input max-w-[160px]"
            />
          </div>

          {/* Leader filter */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-tertiary">Gestor</label>
            <select
              value={selectedLeader}
              onChange={(e) => setSelectedLeader(e.target.value)}
              className="input max-w-[200px]"
            >
              <option value="">Todos os gestores</option>
              {leaderNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Name search */}
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-text-tertiary">Buscar por nome</label>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Digite o nome do colaborador..."
              className="input"
            />
          </div>

          {/* Clear filters */}
          {(activeFilter || selectedLeader || searchName) && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setActiveFilter(null);
                  setSelectedLeader('');
                  setSearchName('');
                }}
                className="btn-secondary text-sm px-3 py-2"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Active filter indicator */}
      {(activeFilter || selectedLeader || searchName) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-tertiary">Filtros ativos:</span>
          {activeFilter && (
            <span className="text-xs bg-bg-tertiary text-text-primary px-2 py-1 rounded">
              {activeFilter === 'all' ? 'Todos' : activeFilter === 'late' ? 'Atrasos' : activeFilter === 'overtime' ? 'Horas Extras' : activeFilter === 'normal' ? 'Normais' : 'Sem Justificativa'}
            </span>
          )}
          {selectedLeader && (
            <span className="text-xs bg-bg-tertiary text-text-primary px-2 py-1 rounded">
              Gestor: {selectedLeader}
            </span>
          )}
          {searchName && (
            <span className="text-xs bg-bg-tertiary text-text-primary px-2 py-1 rounded">
              Nome: {searchName}
            </span>
          )}
          <span className="text-xs text-text-tertiary">({filteredRecords.length} registros)</span>
        </div>
      )}

      {/* Records */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">
          {loading ? 'Carregando...' : `Registros de ${selectedDate.split('-').reverse().join('/')}`}
        </h3>
        <RecordsTable records={filteredRecords} showEmployee showLeader />
      </div>
    </div>
  );
}
