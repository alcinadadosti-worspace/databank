'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import StatsCard from '@/components/StatsCard';
import RecordsTable from '@/components/RecordsTable';
import { getDashboardStats, getRecordsByDate, getLeaders, syncPunchesRange, getSyncStatus, testSlackMessage, testPunchReminder, type DashboardStats, type DailyRecord, type Leader, type SyncStatus } from '@/lib/api';
import { daysAgo, todayISO } from '@/lib/utils';
import { useDebounce } from '@/lib/hooks';

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

  // Debounce the date to avoid multiple API calls when rapidly changing dates
  const debouncedDate = useDebounce(selectedDate, 300);

  // Sync states
  const [syncStart, setSyncStart] = useState(daysAgo(30));
  const [syncEnd, setSyncEnd] = useState(todayISO());
  const [syncing, setSyncing] = useState(false);
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Slack test states
  const [testingSlack, setTestingSlack] = useState<'employee' | 'manager' | null>(null);
  const [slackTestResult, setSlackTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Reminder test states
  const [testingReminder, setTestingReminder] = useState<'entry' | 'lunch_return' | 'exit' | null>(null);
  const [reminderTestResult, setReminderTestResult] = useState<{ success: boolean; message: string } | null>(null);

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

  // Reload records when debounced date changes (avoids multiple API calls)
  useEffect(() => {
    if (!loading) {
      loadRecords(debouncedDate);
    }
  }, [debouncedDate]);

  // Poll for sync status
  useEffect(() => {
    if (!syncJobId) return;

    async function pollSyncStatus() {
      try {
        const data = await getSyncStatus(syncJobId!);
        setSyncStatus(data);

        if (data.status === 'completed' || data.status === 'error') {
          if (syncPollingRef.current) {
            clearInterval(syncPollingRef.current);
            syncPollingRef.current = null;
          }
          setSyncing(false);
          // Reload records after sync completes
          if (data.status === 'completed') {
            loadRecords(selectedDate);
          }
        }
      } catch (err) {
        console.error('Failed to get sync status:', err);
      }
    }

    pollSyncStatus();
    syncPollingRef.current = setInterval(pollSyncStatus, 2000);

    return () => {
      if (syncPollingRef.current) {
        clearInterval(syncPollingRef.current);
      }
    };
  }, [syncJobId, selectedDate, loadRecords]);

  async function handleSync() {
    setSyncing(true);
    setSyncStatus(null);
    setSyncError(null);
    setSyncJobId(null);

    try {
      const data = await syncPunchesRange(syncStart, syncEnd);
      setSyncJobId(data.jobId);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Erro ao iniciar sincronizacao');
      setSyncing(false);
    }
  }

  async function handleTestSlack(type: 'employee' | 'manager') {
    setTestingSlack(type);
    setSlackTestResult(null);

    try {
      const result = await testSlackMessage(type);
      setSlackTestResult(result);
    } catch (err) {
      setSlackTestResult({ success: false, message: err instanceof Error ? err.message : 'Erro ao enviar teste' });
    } finally {
      setTestingSlack(null);
    }
  }

  async function handleTestReminder(type: 'entry' | 'lunch_return' | 'exit') {
    setTestingReminder(type);
    setReminderTestResult(null);

    try {
      const result = await testPunchReminder(type);
      setReminderTestResult(result);
    } catch (err) {
      setReminderTestResult({ success: false, message: err instanceof Error ? err.message : 'Erro ao enviar teste' });
    } finally {
      setTestingReminder(null);
    }
  }

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

      {/* Sync Section */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-tertiary font-medium">Sincronizar Pontos</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={syncStart}
                onChange={(e) => setSyncStart(e.target.value)}
                className="input max-w-[140px]"
                disabled={syncing}
              />
              <span className="text-xs text-text-muted">ate</span>
              <input
                type="date"
                value={syncEnd}
                onChange={(e) => setSyncEnd(e.target.value)}
                className="input max-w-[140px]"
                disabled={syncing}
              />
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-primary px-4 py-2 text-sm"
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          {syncStatus && (
            <div className="flex items-center gap-2">
              {syncStatus.status === 'running' && (
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              )}
              {syncStatus.status === 'completed' && (
                <div className="w-2 h-2 rounded-full bg-green-500" />
              )}
              <span className="text-xs text-text-secondary">
                {syncStatus.status === 'running' && `${syncStatus.synced}/${syncStatus.totalDays} dias`}
                {syncStatus.status === 'completed' && `Concluido! ${syncStatus.synced} dias sincronizados`}
              </span>
            </div>
          )}
          {syncError && (
            <span className="text-xs text-red-400">{syncError}</span>
          )}
        </div>
      </div>

      {/* Slack Test Section */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <label className="text-xs text-text-tertiary font-medium">Testar Alertas do Slack</label>
            <p className="text-xs text-text-muted mt-1">Envia mensagens de teste para o usuario configurado em SLACK_TEST_USER_ID</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleTestSlack('employee')}
              disabled={testingSlack !== null}
              className="btn-secondary px-4 py-2 text-sm"
            >
              {testingSlack === 'employee' ? 'Enviando...' : 'Teste Colaborador'}
            </button>
            <button
              onClick={() => handleTestSlack('manager')}
              disabled={testingSlack !== null}
              className="btn-secondary px-4 py-2 text-sm"
            >
              {testingSlack === 'manager' ? 'Enviando...' : 'Teste Gestor'}
            </button>
          </div>
          {slackTestResult && (
            <span className={`text-xs ${slackTestResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {slackTestResult.message}
            </span>
          )}
        </div>
      </div>

      {/* Reminder Test Section */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <label className="text-xs text-text-tertiary font-medium">Testar Lembretes de Ponto</label>
            <p className="text-xs text-text-muted mt-1">Envia lembretes de teste (entrada 7:50, retorno almoco, saida 17:50)</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleTestReminder('entry')}
              disabled={testingReminder !== null}
              className="btn-secondary px-3 py-2 text-sm"
            >
              {testingReminder === 'entry' ? '...' : 'Entrada'}
            </button>
            <button
              onClick={() => handleTestReminder('lunch_return')}
              disabled={testingReminder !== null}
              className="btn-secondary px-3 py-2 text-sm"
            >
              {testingReminder === 'lunch_return' ? '...' : 'Retorno Almoco'}
            </button>
            <button
              onClick={() => handleTestReminder('exit')}
              disabled={testingReminder !== null}
              className="btn-secondary px-3 py-2 text-sm"
            >
              {testingReminder === 'exit' ? '...' : 'Saida'}
            </button>
          </div>
          {reminderTestResult && (
            <span className={`text-xs ${reminderTestResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {reminderTestResult.message}
            </span>
          )}
        </div>
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
