'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getVacations,
  getEmployees,
  createVacation,
  updateVacation,
  deleteVacation,
  getVacationSchedules,
  createVacationSchedule,
  updateVacationSchedule,
  deleteVacationSchedule,
  getFolgas,
  createFolga,
  createFolgaRange,
  updateFolga,
  deleteFolga,
  type Vacation,
  type Employee,
  type VacationSchedule,
  type Folga,
} from '@/lib/api';
import { formatDate } from '@/lib/utils';

type Tab = 'ferias' | 'vencimentos' | 'folgas';

function getStatusColor(startDate: string, endDate: string): { bg: string; text: string; label: string } {
  const today = new Date().toISOString().split('T')[0];
  if (today < startDate) {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Agendado' };
  } else if (today >= startDate && today <= endDate) {
    return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Em Ferias' };
  } else {
    return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Concluido' };
  }
}

function getScheduleStatus(date: string): { bg: string; text: string; label: string } {
  const today = new Date().toISOString().split('T')[0];
  const diffDays = Math.ceil(
    (new Date(date + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)
  );
  const label = formatDate(date);

  if (diffDays < 0) {
    return { bg: 'bg-red-500/20', text: 'text-red-400', label };
  } else if (diffDays <= 30) {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label };
  } else if (diffDays <= 90) {
    return { bg: 'bg-orange-500/20', text: 'text-orange-400', label };
  } else {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', label };
  }
}

function getPeriodStatus(periodDate: string, employeeVacations: Vacation[]): { bg: string; text: string; label: string; covered: boolean } {
  const isCovered = employeeVacations.some(v => v.start_date <= periodDate);
  if (isCovered) {
    return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Concluido', covered: true };
  }
  return { ...getScheduleStatus(periodDate), covered: false };
}

function calculateDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export default function AdminFerias() {
  const [activeTab, setActiveTab] = useState<Tab>('ferias');
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [schedules, setSchedules] = useState<VacationSchedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Vacation form state
  const [showVacationForm, setShowVacationForm] = useState(false);
  const [editingVacationId, setEditingVacationId] = useState<number | null>(null);
  const [vacationForm, setVacationForm] = useState({
    employee_id: 0,
    start_date: '',
    end_date: '',
    days: 0,
    notes: '',
  });

  // Schedule form state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    employee_id: 0,
    period_1_date: '',
    period_2_date: '',
    notes: '',
  });

  // Folga state
  const [folgas, setFolgas] = useState<Folga[]>([]);
  const [showFolgaForm, setShowFolgaForm] = useState(false);
  const [editingFolgaId, setEditingFolgaId] = useState<number | null>(null);
  const [folgaRangeMode, setFolgaRangeMode] = useState(false);
  const [folgaRangeResult, setFolgaRangeResult] = useState<{ created: number; skipped_dates: { date: string; reason: string }[] } | null>(null);
  const [folgaForm, setFolgaForm] = useState({
    employee_id: 0,
    date: '',
    start_date: '',
    end_date: '',
    type: 'integral' as 'integral' | 'partial',
    hours_off: 1,
    notes: '',
  });
  const [folgaSearch, setFolgaSearch] = useState('');

  // Filter states
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'scheduled' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [scheduleSearch, setScheduleSearch] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const [vacData, schData, empData, folgaData] = await Promise.all([
        getVacations(),
        getVacationSchedules(),
        getEmployees(),
        getFolgas(),
      ]);
      setVacations(vacData.vacations);
      setSchedules(schData.schedules);
      setEmployees(empData.employees);
      setFolgas(folgaData.folgas);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // Auto-calculate vacation days when dates change
  useEffect(() => {
    if (vacationForm.start_date && vacationForm.end_date) {
      const days = calculateDays(vacationForm.start_date, vacationForm.end_date);
      setVacationForm(prev => ({ ...prev, days }));
    }
  }, [vacationForm.start_date, vacationForm.end_date]);

  // ─── Vacation CRUD ────────────────────────────────────────────

  function resetVacationForm() {
    setVacationForm({ employee_id: 0, start_date: '', end_date: '', days: 0, notes: '' });
    setEditingVacationId(null);
    setShowVacationForm(false);
    setError('');
  }

  function handleEditVacation(vacation: Vacation) {
    setVacationForm({
      employee_id: vacation.employee_id,
      start_date: vacation.start_date,
      end_date: vacation.end_date,
      days: vacation.days,
      notes: vacation.notes || '',
    });
    setEditingVacationId(vacation.id);
    setShowVacationForm(true);
    setError('');
  }

  async function handleSubmitVacation(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    if (vacationForm.employee_id === 0) {
      setError('Selecione um colaborador');
      setSaving(false);
      return;
    }
    if (vacationForm.start_date > vacationForm.end_date) {
      setError('Data de inicio deve ser anterior ou igual a data de fim');
      setSaving(false);
      return;
    }

    try {
      if (editingVacationId) {
        await updateVacation(editingVacationId, {
          start_date: vacationForm.start_date,
          end_date: vacationForm.end_date,
          days: vacationForm.days,
          notes: vacationForm.notes || undefined,
        });
      } else {
        await createVacation({
          employee_id: vacationForm.employee_id,
          start_date: vacationForm.start_date,
          end_date: vacationForm.end_date,
          days: vacationForm.days,
          notes: vacationForm.notes || undefined,
        });
      }
      await loadData();
      resetVacationForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar ferias');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteVacation(id: number) {
    if (!confirm('Tem certeza que deseja excluir este registro de ferias?')) return;
    try {
      await deleteVacation(id);
      setVacations(prev => prev.filter(v => v.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir ferias');
    }
  }

  // ─── Schedule CRUD ────────────────────────────────────────────

  function resetScheduleForm() {
    setScheduleForm({ employee_id: 0, period_1_date: '', period_2_date: '', notes: '' });
    setEditingScheduleId(null);
    setShowScheduleForm(false);
    setError('');
  }

  function handleEditSchedule(schedule: VacationSchedule) {
    setScheduleForm({
      employee_id: schedule.employee_id,
      period_1_date: schedule.period_1_date,
      period_2_date: schedule.period_2_date || '',
      notes: schedule.notes || '',
    });
    setEditingScheduleId(schedule.id);
    setShowScheduleForm(true);
    setError('');
  }

  async function handleSubmitSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    if (scheduleForm.employee_id === 0) {
      setError('Selecione um colaborador');
      setSaving(false);
      return;
    }
    if (!scheduleForm.period_1_date) {
      setError('Informe a data do 1º período');
      setSaving(false);
      return;
    }

    try {
      if (editingScheduleId) {
        await updateVacationSchedule(editingScheduleId, {
          period_1_date: scheduleForm.period_1_date,
          period_2_date: scheduleForm.period_2_date || null,
          notes: scheduleForm.notes || undefined,
        });
      } else {
        await createVacationSchedule({
          employee_id: scheduleForm.employee_id,
          period_1_date: scheduleForm.period_1_date,
          period_2_date: scheduleForm.period_2_date || null,
          notes: scheduleForm.notes || undefined,
        });
      }
      await loadData();
      resetScheduleForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar vencimento');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSchedule(id: number) {
    if (!confirm('Tem certeza que deseja excluir este vencimento?')) return;
    try {
      await deleteVacationSchedule(id);
      setSchedules(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir vencimento');
    }
  }

  // ─── Folga CRUD ───────────────────────────────────────────────

  function resetFolgaForm() {
    setFolgaForm({ employee_id: 0, date: '', start_date: '', end_date: '', type: 'integral', hours_off: 1, notes: '' });
    setEditingFolgaId(null);
    setFolgaRangeMode(false);
    setFolgaRangeResult(null);
    setShowFolgaForm(false);
    setError('');
  }

  function handleEditFolga(folga: Folga) {
    setFolgaForm({
      employee_id: folga.employee_id,
      date: folga.date,
      start_date: '',
      end_date: '',
      type: folga.type,
      hours_off: folga.hours_off,
      notes: folga.notes || '',
    });
    setEditingFolgaId(folga.id);
    setShowFolgaForm(true);
    setError('');
  }

  async function handleSubmitFolga(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    if (folgaForm.employee_id === 0) {
      setError('Selecione um colaborador');
      setSaving(false);
      return;
    }

    const employee = employees.find(e => e.id === folgaForm.employee_id);
    const leaderId = employee?.leader_id ?? 0;

    try {
      if (editingFolgaId) {
        await updateFolga(editingFolgaId, {
          date: folgaForm.date,
          type: folgaForm.type,
          hours_off: folgaForm.type === 'integral' ? undefined : folgaForm.hours_off,
          notes: folgaForm.notes || undefined,
        });
        await loadData();
        resetFolgaForm();
      } else if (folgaRangeMode) {
        const result = await createFolgaRange({
          employee_id: folgaForm.employee_id,
          leader_id: leaderId,
          start_date: folgaForm.start_date,
          end_date: folgaForm.end_date,
          type: folgaForm.type,
          hours_off: folgaForm.type === 'integral' ? undefined : folgaForm.hours_off,
          notes: folgaForm.notes || undefined,
        });
        await loadData();
        setFolgaRangeResult({ created: result.created, skipped_dates: result.skipped_dates });
      } else {
        await createFolga({
          employee_id: folgaForm.employee_id,
          leader_id: leaderId,
          date: folgaForm.date,
          type: folgaForm.type,
          hours_off: folgaForm.type === 'integral' ? undefined : folgaForm.hours_off,
          notes: folgaForm.notes || undefined,
        });
        await loadData();
        resetFolgaForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar folga');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteFolga(id: number) {
    if (!confirm('Tem certeza que deseja excluir esta folga?')) return;
    try {
      await deleteFolga(id);
      setFolgas(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir folga');
    }
  }

  // ─── Derived data ─────────────────────────────────────────────

  const filteredVacations = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return vacations.filter(v => {
      if (filterStatus === 'active' && !(today >= v.start_date && today <= v.end_date)) return false;
      if (filterStatus === 'scheduled' && !(today < v.start_date)) return false;
      if (filterStatus === 'completed' && !(today > v.end_date)) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        if (!v.employee_name?.toLowerCase().includes(s) && !v.notes?.toLowerCase().includes(s)) return false;
      }
      return true;
    }).sort((a, b) => b.start_date.localeCompare(a.start_date));
  }, [vacations, filterStatus, searchTerm]);

  const filteredSchedules = useMemo(() => {
    if (!scheduleSearch.trim()) return schedules;
    const s = scheduleSearch.toLowerCase();
    return schedules.filter(sc =>
      sc.employee_name?.toLowerCase().includes(s) ||
      sc.leader_name?.toLowerCase().includes(s)
    );
  }, [schedules, scheduleSearch]);

  const filteredFolgas = useMemo(() => {
    if (!folgaSearch.trim()) return folgas;
    const s = folgaSearch.toLowerCase();
    return folgas.filter(f =>
      f.employee_name?.toLowerCase().includes(s) ||
      f.leader_name?.toLowerCase().includes(s)
    );
  }, [folgas, folgaSearch]);

  const employeesByLeader = useMemo(() => {
    const grouped = new Map<string, Employee[]>();
    for (const emp of employees) {
      const leader = emp.leader_name || 'Sem Gestor';
      if (!grouped.has(leader)) grouped.set(leader, []);
      grouped.get(leader)!.push(emp);
    }
    for (const group of grouped.values()) {
      group.sort((a, b) => a.name.localeCompare(b.name));
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [employees]);

  // Employees that don't have a schedule yet (for the add form)
  const employeesWithoutSchedule = useMemo(() => {
    const scheduledIds = new Set(schedules.map(s => s.employee_id));
    return employees.filter(e => !scheduledIds.has(e.id));
  }, [employees, schedules]);

  const employeesWithoutScheduleByLeader = useMemo(() => {
    const grouped = new Map<string, Employee[]>();
    for (const emp of employeesWithoutSchedule) {
      const leader = emp.leader_name || 'Sem Gestor';
      if (!grouped.has(leader)) grouped.set(leader, []);
      grouped.get(leader)!.push(emp);
    }
    for (const group of grouped.values()) {
      group.sort((a, b) => a.name.localeCompare(b.name));
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [employeesWithoutSchedule]);

  // Map employee_id -> their vacations (for period coverage check)
  const vacationsByEmployee = useMemo(() => {
    const map = new Map<number, Vacation[]>();
    for (const v of vacations) {
      if (!map.has(v.employee_id)) map.set(v.employee_id, []);
      map.get(v.employee_id)!.push(v);
    }
    return map;
  }, [vacations]);

  // Schedule summary counters — exclude covered periods
  const scheduleSummary = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    let vencido = 0, proximo = 0, ok = 0;

    for (const s of schedules) {
      const empVacations = vacationsByEmployee.get(s.employee_id) || [];
      const dates = [s.period_1_date, s.period_2_date].filter(Boolean) as string[];
      const uncovered = dates.filter(d => !empVacations.some(v => v.start_date <= d));
      const nearest = uncovered.sort()[0];
      if (!nearest) continue;
      const diff = Math.ceil(
        (new Date(nearest + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diff < 0) vencido++;
      else if (diff <= 30) proximo++;
      else ok++;
    }
    return { vencido, proximo, ok };
  }, [schedules, vacationsByEmployee]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Ferias</h2>
        <p className="text-sm text-text-tertiary mt-1">Gerencie as ferias e vencimentos dos colaboradores</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => { setActiveTab('ferias'); setError(''); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'ferias'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Ferias
        </button>
        <button
          onClick={() => { setActiveTab('vencimentos'); setError(''); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 ${
            activeTab === 'vencimentos'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Vencimentos
          {scheduleSummary.vencido > 0 && (
            <span className="text-2xs bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full">
              {scheduleSummary.vencido}
            </span>
          )}
          {scheduleSummary.vencido === 0 && scheduleSummary.proximo > 0 && (
            <span className="text-2xs bg-yellow-500 text-white font-bold px-1.5 py-0.5 rounded-full">
              {scheduleSummary.proximo}
            </span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('folgas'); setError(''); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'folgas'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Folgas
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* ─── TAB: FÉRIAS ─────────────────────────────────────────── */}
      {activeTab === 'ferias' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <input
                type="text"
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input flex-1"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="input w-full sm:w-40"
              >
                <option value="all">Todos</option>
                <option value="active">Em Ferias</option>
                <option value="scheduled">Agendados</option>
                <option value="completed">Concluidos</option>
              </select>
            </div>
            <button
              onClick={() => setShowVacationForm(true)}
              className="btn-primary px-4 py-2 text-sm whitespace-nowrap"
            >
              + Registrar Ferias
            </button>
          </div>

          {/* Vacation Form Modal */}
          {showVacationForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-bg-secondary border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  {editingVacationId ? 'Editar Ferias' : 'Registrar Ferias'}
                </h3>
                <form onSubmit={handleSubmitVacation} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Colaborador</label>
                    <select
                      value={vacationForm.employee_id}
                      onChange={(e) => setVacationForm(prev => ({ ...prev, employee_id: Number(e.target.value) }))}
                      required
                      disabled={!!editingVacationId}
                      className="input w-full"
                    >
                      <option value={0}>Selecione um colaborador...</option>
                      {employeesByLeader.map(([leader, emps]) => (
                        <optgroup key={leader} label={leader}>
                          {emps.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Data Inicio</label>
                      <input
                        type="date"
                        value={vacationForm.start_date}
                        onChange={(e) => setVacationForm(prev => ({ ...prev, start_date: e.target.value }))}
                        required
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Data Fim</label>
                      <input
                        type="date"
                        value={vacationForm.end_date}
                        onChange={(e) => setVacationForm(prev => ({ ...prev, end_date: e.target.value }))}
                        required
                        className="input w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Dias de Ferias</label>
                    <input
                      type="number"
                      value={vacationForm.days}
                      onChange={(e) => setVacationForm(prev => ({ ...prev, days: Number(e.target.value) }))}
                      min={1}
                      required
                      className="input w-full"
                    />
                    <p className="text-xs text-text-muted mt-1">Calculado automaticamente com base nas datas</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Observacoes (opcional)</label>
                    <textarea
                      value={vacationForm.notes}
                      onChange={(e) => setVacationForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Ex: Ferias coletivas, ferias vencidas..."
                      rows={2}
                      className="input w-full"
                    />
                  </div>
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={resetVacationForm} disabled={saving} className="btn-secondary px-4 py-2 text-sm">
                      Cancelar
                    </button>
                    <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">
                      {saving ? 'Salvando...' : (editingVacationId ? 'Atualizar' : 'Registrar')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-text-tertiary">Carregando...</p>
          ) : filteredVacations.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-text-tertiary">
                {searchTerm || filterStatus !== 'all'
                  ? 'Nenhum registro encontrado com os filtros aplicados'
                  : 'Nenhum registro de ferias cadastrado'}
              </p>
              {!searchTerm && filterStatus === 'all' && (
                <button onClick={() => setShowVacationForm(true)} className="mt-4 text-accent-primary hover:underline text-sm">
                  Registrar primeiras ferias
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Cards View */}
              <div className="lg:hidden space-y-3">
                {filteredVacations.map((vacation) => {
                  const status = getStatusColor(vacation.start_date, vacation.end_date);
                  return (
                    <div key={vacation.id} className="card p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-text-primary">{vacation.employee_name}</p>
                        <span className={`text-xs px-2 py-1 rounded ${status.bg} ${status.text}`}>{status.label}</span>
                      </div>
                      <p className="text-xs text-text-secondary">Gestor: {vacation.leader_name || '—'}</p>
                      <p className="text-xs font-mono text-text-secondary">
                        {formatDate(vacation.start_date)} — {formatDate(vacation.end_date)} ({vacation.days} {vacation.days === 1 ? 'dia' : 'dias'})
                      </p>
                      {vacation.notes && (
                        <p className="text-xs text-text-muted truncate">{vacation.notes}</p>
                      )}
                      <div className="flex items-center gap-3 pt-1">
                        <button onClick={() => handleEditVacation(vacation)} className="text-text-muted hover:text-accent-primary transition-colors p-1" title="Editar">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDeleteVacation(vacation.id)} className="text-text-muted hover:text-red-400 transition-colors p-1" title="Excluir">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block card p-0 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-bg-tertiary text-left text-xs text-text-muted">
                      <th className="px-4 py-3 font-medium">Colaborador</th>
                      <th className="px-4 py-3 font-medium">Gestor</th>
                      <th className="px-4 py-3 font-medium">Periodo</th>
                      <th className="px-4 py-3 font-medium">Dias</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium w-24">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filteredVacations.map((vacation) => {
                      const status = getStatusColor(vacation.start_date, vacation.end_date);
                      return (
                        <tr key={vacation.id} className="hover:bg-bg-hover transition-colors">
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm text-text-primary font-medium">{vacation.employee_name}</p>
                              {vacation.notes && (
                                <p className="text-xs text-text-muted truncate max-w-48" title={vacation.notes}>{vacation.notes}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary">{vacation.leader_name || '-'}</td>
                          <td className="px-4 py-3 text-sm font-mono text-text-secondary">
                            {formatDate(vacation.start_date)} - {formatDate(vacation.end_date)}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-primary font-medium">
                            {vacation.days} {vacation.days === 1 ? 'dia' : 'dias'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded ${status.bg} ${status.text}`}>{status.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleEditVacation(vacation)} className="text-text-muted hover:text-accent-primary transition-colors" title="Editar">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button onClick={() => handleDeleteVacation(vacation.id)} className="text-text-muted hover:text-red-400 transition-colors" title="Excluir">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!loading && vacations.length > 0 && (
            <div className="card bg-bg-secondary">
              <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
                <span className="text-text-muted">Resumo:</span>
                <div className="flex items-center gap-4">
                  <span className="text-green-400">
                    {vacations.filter(v => {
                      const today = new Date().toISOString().split('T')[0];
                      return today >= v.start_date && today <= v.end_date;
                    }).length} em ferias
                  </span>
                  <span className="text-blue-400">
                    {vacations.filter(v => new Date().toISOString().split('T')[0] < v.start_date).length} agendados
                  </span>
                  <span className="text-text-primary font-medium">{vacations.length} total</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── TAB: VENCIMENTOS ────────────────────────────────────── */}
      {activeTab === 'vencimentos' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <input
              type="text"
              placeholder="Buscar por nome ou gestor..."
              value={scheduleSearch}
              onChange={(e) => setScheduleSearch(e.target.value)}
              className="input flex-1"
            />
            <button
              onClick={() => setShowScheduleForm(true)}
              className="btn-primary px-4 py-2 text-sm whitespace-nowrap"
            >
              + Cadastrar Vencimento
            </button>
          </div>

          {/* Summary badges */}
          {!loading && schedules.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {scheduleSummary.vencido > 0 && (
                <span className="text-xs bg-red-500/20 text-red-400 px-3 py-1.5 rounded-full font-medium">
                  {scheduleSummary.vencido} vencido{scheduleSummary.vencido !== 1 ? 's' : ''}
                </span>
              )}
              {scheduleSummary.proximo > 0 && (
                <span className="text-xs bg-yellow-500/20 text-yellow-400 px-3 py-1.5 rounded-full font-medium">
                  {scheduleSummary.proximo} vence em ate 30 dias
                </span>
              )}
              <span className="text-xs bg-bg-tertiary text-text-muted px-3 py-1.5 rounded-full">
                {schedules.length} colaboradores cadastrados
              </span>
            </div>
          )}

          {/* Schedule Form Modal */}
          {showScheduleForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-bg-secondary border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  {editingScheduleId ? 'Editar Vencimento' : 'Cadastrar Vencimento de Ferias'}
                </h3>
                <p className="text-xs text-text-muted mb-4">
                  Informe as datas a partir das quais o colaborador pode solicitar ferias de cada periodo.
                </p>
                <form onSubmit={handleSubmitSchedule} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Colaborador</label>
                    <select
                      value={scheduleForm.employee_id}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, employee_id: Number(e.target.value) }))}
                      required
                      disabled={!!editingScheduleId}
                      className="input w-full"
                    >
                      <option value={0}>Selecione um colaborador...</option>
                      {editingScheduleId
                        ? employeesByLeader.map(([leader, emps]) => (
                            <optgroup key={leader} label={leader}>
                              {emps.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                              ))}
                            </optgroup>
                          ))
                        : employeesWithoutScheduleByLeader.map(([leader, emps]) => (
                            <optgroup key={leader} label={leader}>
                              {emps.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                              ))}
                            </optgroup>
                          ))
                      }
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      1º Periodo — Data de Vencimento
                    </label>
                    <input
                      type="date"
                      value={scheduleForm.period_1_date}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, period_1_date: e.target.value }))}
                      required
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      2º Periodo — Data de Vencimento <span className="text-text-muted font-normal">(opcional)</span>
                    </label>
                    <input
                      type="date"
                      value={scheduleForm.period_2_date}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, period_2_date: e.target.value }))}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Observacoes <span className="text-text-muted font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={scheduleForm.notes}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Ex: admitido em 01/2024..."
                      className="input w-full"
                    />
                  </div>
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={resetScheduleForm} disabled={saving} className="btn-secondary px-4 py-2 text-sm">
                      Cancelar
                    </button>
                    <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">
                      {saving ? 'Salvando...' : (editingScheduleId ? 'Atualizar' : 'Cadastrar')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-text-tertiary">Carregando...</p>
          ) : filteredSchedules.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-text-tertiary">
                {scheduleSearch
                  ? 'Nenhum colaborador encontrado'
                  : 'Nenhum vencimento cadastrado'}
              </p>
              {!scheduleSearch && (
                <button onClick={() => setShowScheduleForm(true)} className="mt-4 text-accent-primary hover:underline text-sm">
                  Cadastrar primeiro vencimento
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Cards View */}
              <div className="lg:hidden space-y-3">
                {filteredSchedules.map((schedule) => {
                  const empVacations = vacationsByEmployee.get(schedule.employee_id) || [];
                  const p1 = getPeriodStatus(schedule.period_1_date, empVacations);
                  const p2 = schedule.period_2_date ? getPeriodStatus(schedule.period_2_date, empVacations) : null;
                  return (
                    <div key={schedule.id} className="card p-3 space-y-1.5">
                      <p className="text-sm font-medium text-text-primary">{schedule.employee_name}</p>
                      <p className="text-xs text-text-secondary">Gestor: {schedule.leader_name || '—'}</p>
                      {schedule.notes && <p className="text-xs text-text-muted">{schedule.notes}</p>}
                      <div className="flex flex-wrap gap-2">
                        <div>
                          <span className="text-xs text-text-muted mr-1">1º:</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${p1.bg} ${p1.text}`}>
                            {p1.covered ? '✓ Concluido' : p1.label}
                          </span>
                        </div>
                        {p2 && (
                          <div>
                            <span className="text-xs text-text-muted mr-1">2º:</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${p2.bg} ${p2.text}`}>
                              {p2.covered ? '✓ Concluido' : p2.label}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 pt-1">
                        <button onClick={() => handleEditSchedule(schedule)} className="text-text-muted hover:text-accent-primary transition-colors p-1" title="Editar">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDeleteSchedule(schedule.id)} className="text-text-muted hover:text-red-400 transition-colors p-1" title="Excluir">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block card p-0 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-bg-tertiary text-left text-xs text-text-muted">
                      <th className="px-4 py-3 font-medium">Colaborador</th>
                      <th className="px-4 py-3 font-medium">Gestor</th>
                      <th className="px-4 py-3 font-medium">1º Periodo</th>
                      <th className="px-4 py-3 font-medium">2º Periodo</th>
                      <th className="px-4 py-3 font-medium w-24">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filteredSchedules.map((schedule) => {
                      const empVacations = vacationsByEmployee.get(schedule.employee_id) || [];
                      const p1 = getPeriodStatus(schedule.period_1_date, empVacations);
                      const p2 = schedule.period_2_date ? getPeriodStatus(schedule.period_2_date, empVacations) : null;
                      return (
                        <tr key={schedule.id} className="hover:bg-bg-hover transition-colors">
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm text-text-primary font-medium">{schedule.employee_name}</p>
                              {schedule.notes && (
                                <p className="text-xs text-text-muted">{schedule.notes}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary">{schedule.leader_name || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className={`text-xs px-2 py-1 rounded ${p1.bg} ${p1.text}`}>
                                {p1.covered ? '✓ Concluido' : p1.label}
                              </span>
                              {!p1.covered && (
                                <span className="text-xs text-text-muted">{formatDate(schedule.period_1_date)}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {p2 ? (
                              <div className="flex flex-col gap-1">
                                <span className={`text-xs px-2 py-1 rounded ${p2.bg} ${p2.text}`}>
                                  {p2.covered ? '✓ Concluido' : p2.label}
                                </span>
                                {!p2.covered && schedule.period_2_date && (
                                  <span className="text-xs text-text-muted">{formatDate(schedule.period_2_date)}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleEditSchedule(schedule)} className="text-text-muted hover:text-accent-primary transition-colors" title="Editar">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button onClick={() => handleDeleteSchedule(schedule.id)} className="text-text-muted hover:text-red-400 transition-colors" title="Excluir">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── TAB: FOLGAS ─────────────────────────────────────────── */}
      {activeTab === 'folgas' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <input
              type="text"
              placeholder="Buscar por colaborador ou gestor..."
              value={folgaSearch}
              onChange={(e) => setFolgaSearch(e.target.value)}
              className="input flex-1"
            />
            <button
              onClick={() => { resetFolgaForm(); setShowFolgaForm(true); }}
              className="btn-primary text-sm whitespace-nowrap"
            >
              + Nova Folga
            </button>
          </div>

          {showFolgaForm && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text-primary">
                  {editingFolgaId ? 'Editar Folga' : 'Nova Folga'}
                </h3>
                {!editingFolgaId && (
                  <div className="flex items-center gap-1 bg-bg-elevated border border-border rounded p-1">
                    <button
                      type="button"
                      onClick={() => { setFolgaRangeMode(false); setFolgaRangeResult(null); }}
                      className={`text-xs px-3 py-1 rounded transition-colors ${!folgaRangeMode ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                      Dia único
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFolgaRangeMode(true); setFolgaRangeResult(null); }}
                      className={`text-xs px-3 py-1 rounded transition-colors ${folgaRangeMode ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                      Período
                    </button>
                  </div>
                )}
              </div>

              {folgaRangeResult ? (
                <div className="space-y-3">
                  <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded text-sm">
                    {folgaRangeResult.created} folga(s) registrada(s) com sucesso.
                  </div>
                  {folgaRangeResult.skipped_dates.length > 0 && (
                    <div className="bg-bg-secondary rounded p-3">
                      <p className="text-xs text-text-muted mb-2">{folgaRangeResult.skipped_dates.length} dia(s) ignorado(s):</p>
                      <ul className="space-y-1">
                        {folgaRangeResult.skipped_dates.map(s => (
                          <li key={s.date} className="text-xs text-text-secondary">
                            {s.date.split('-').reverse().join('/')} — {s.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button type="button" onClick={resetFolgaForm} className="btn-primary text-sm">Fechar</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitFolga} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Colaborador</label>
                      <select
                        value={folgaForm.employee_id}
                        onChange={(e) => setFolgaForm(prev => ({ ...prev, employee_id: parseInt(e.target.value) }))}
                        className="input w-full"
                        disabled={!!editingFolgaId}
                        required
                      >
                        <option value={0}>Selecione...</option>
                        {employeesByLeader.map(([leader, emps]) => (
                          <optgroup key={leader} label={leader}>
                            {emps.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {folgaRangeMode ? (
                      <>
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Data início</label>
                          <input
                            type="date"
                            value={folgaForm.start_date}
                            onChange={(e) => setFolgaForm(prev => ({ ...prev, start_date: e.target.value }))}
                            className="input w-full"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Data fim</label>
                          <input
                            type="date"
                            value={folgaForm.end_date}
                            min={folgaForm.start_date}
                            onChange={(e) => setFolgaForm(prev => ({ ...prev, end_date: e.target.value }))}
                            className="input w-full"
                            required
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Data</label>
                        <input
                          type="date"
                          value={folgaForm.date}
                          onChange={(e) => setFolgaForm(prev => ({ ...prev, date: e.target.value }))}
                          className="input w-full"
                          required
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-text-muted mb-1">Tipo</label>
                      <select
                        value={folgaForm.type}
                        onChange={(e) => setFolgaForm(prev => ({ ...prev, type: e.target.value as 'integral' | 'partial' }))}
                        className="input w-full"
                      >
                        <option value="integral">Integral (dia todo)</option>
                        <option value="partial">Parcial (horas)</option>
                      </select>
                    </div>
                    {folgaForm.type === 'partial' && (
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Horas de folga</label>
                        <input
                          type="number"
                          min={1}
                          max={7}
                          value={folgaForm.hours_off}
                          onChange={(e) => setFolgaForm(prev => ({ ...prev, hours_off: parseInt(e.target.value) }))}
                          className="input w-full"
                          required
                        />
                        <p className="text-2xs text-text-muted mt-1">Horas descontadas da jornada (1–7h)</p>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-text-muted mb-1">Observações (opcional)</label>
                      <input
                        type="text"
                        value={folgaForm.notes}
                        onChange={(e) => setFolgaForm(prev => ({ ...prev, notes: e.target.value }))}
                        className="input w-full"
                        placeholder="Ex: compensação de hora extra..."
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={resetFolgaForm} className="btn-secondary text-sm">Cancelar</button>
                    <button type="submit" disabled={saving} className="btn-primary text-sm">
                      {saving ? 'Salvando...' : editingFolgaId ? 'Salvar' : folgaRangeMode ? 'Registrar período' : 'Registrar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-text-muted">Carregando...</p>
          ) : filteredFolgas.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-text-tertiary">Nenhuma folga registrada</p>
            </div>
          ) : (
            <>
              {/* Mobile Cards View */}
              <div className="lg:hidden space-y-3">
                {filteredFolgas.map((folga) => (
                  <div key={folga.id} className="card p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-text-primary">{folga.employee_name}</p>
                      {folga.type === 'integral' ? (
                        <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400">Integral</span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-400">{folga.hours_off}h parcial</span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary">Gestor: {folga.leader_name || '—'}</p>
                    <p className="text-xs font-mono text-text-secondary">{formatDate(folga.date)}</p>
                    {folga.notes && <p className="text-xs text-text-muted">{folga.notes}</p>}
                    <div className="flex items-center gap-3 pt-1">
                      <button onClick={() => handleEditFolga(folga)} className="text-text-muted hover:text-accent-primary transition-colors p-1" title="Editar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDeleteFolga(folga.id)} className="text-text-muted hover:text-red-400 transition-colors p-1" title="Excluir">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Colaborador</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Gestor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Data</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Observações</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filteredFolgas.map((folga) => (
                      <tr key={folga.id} className="hover:bg-bg-hover transition-colors">
                        <td className="px-4 py-3 text-sm text-text-primary font-medium">{folga.employee_name}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{folga.leader_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(folga.date)}</td>
                        <td className="px-4 py-3">
                          {folga.type === 'integral' ? (
                            <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400">Integral</span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-400">{folga.hours_off}h parcial</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-muted">{folga.notes || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleEditFolga(folga)} className="text-text-muted hover:text-accent-primary transition-colors" title="Editar">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button onClick={() => handleDeleteFolga(folga.id)} className="text-text-muted hover:text-red-400 transition-colors" title="Excluir">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
