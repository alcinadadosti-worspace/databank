'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getVacations,
  getEmployees,
  createVacation,
  updateVacation,
  deleteVacation,
  type Vacation,
  type Employee
} from '@/lib/api';
import { formatDate } from '@/lib/utils';

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

function calculateDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

export default function AdminFerias() {
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    employee_id: 0,
    start_date: '',
    end_date: '',
    days: 0,
    notes: '',
  });

  // Filter state
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'scheduled' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const [vacData, empData] = await Promise.all([
        getVacations(),
        getEmployees()
      ]);
      setVacations(vacData.vacations);
      setEmployees(empData.employees);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Auto-calculate days when dates change
  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      const days = calculateDays(formData.start_date, formData.end_date);
      setFormData(prev => ({ ...prev, days }));
    }
  }, [formData.start_date, formData.end_date]);

  function resetForm() {
    setFormData({
      employee_id: 0,
      start_date: '',
      end_date: '',
      days: 0,
      notes: '',
    });
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  function handleEdit(vacation: Vacation) {
    setFormData({
      employee_id: vacation.employee_id,
      start_date: vacation.start_date,
      end_date: vacation.end_date,
      days: vacation.days,
      notes: vacation.notes || '',
    });
    setEditingId(vacation.id);
    setShowForm(true);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    if (formData.employee_id === 0) {
      setError('Selecione um colaborador');
      setSaving(false);
      return;
    }

    if (formData.start_date > formData.end_date) {
      setError('Data de inicio deve ser anterior ou igual a data de fim');
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        await updateVacation(editingId, {
          start_date: formData.start_date,
          end_date: formData.end_date,
          days: formData.days,
          notes: formData.notes || undefined,
        });
      } else {
        await createVacation({
          employee_id: formData.employee_id,
          start_date: formData.start_date,
          end_date: formData.end_date,
          days: formData.days,
          notes: formData.notes || undefined,
        });
      }
      await loadData();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar ferias');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Tem certeza que deseja excluir este registro de ferias?')) return;

    try {
      await deleteVacation(id);
      setVacations(prev => prev.filter(v => v.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir ferias');
    }
  }

  // Filter vacations
  const filteredVacations = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    return vacations.filter(v => {
      // Status filter
      if (filterStatus === 'active' && !(today >= v.start_date && today <= v.end_date)) return false;
      if (filterStatus === 'scheduled' && !(today < v.start_date)) return false;
      if (filterStatus === 'completed' && !(today > v.end_date)) return false;

      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const empName = v.employee_name?.toLowerCase() || '';
        const notes = v.notes?.toLowerCase() || '';
        if (!empName.includes(search) && !notes.includes(search)) return false;
      }

      return true;
    }).sort((a, b) => b.start_date.localeCompare(a.start_date));
  }, [vacations, filterStatus, searchTerm]);

  // Group employees by leader for the select
  const employeesByLeader = useMemo(() => {
    const grouped = new Map<string, Employee[]>();
    for (const emp of employees) {
      const leader = emp.leader_name || 'Sem Gestor';
      if (!grouped.has(leader)) grouped.set(leader, []);
      grouped.get(leader)!.push(emp);
    }
    // Sort employees within each group
    for (const group of grouped.values()) {
      group.sort((a, b) => a.name.localeCompare(b.name));
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [employees]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Ferias</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Gerencie as ferias dos colaboradores
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary px-4 py-2 text-sm"
        >
          + Registrar Ferias
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {editingId ? 'Editar Ferias' : 'Registrar Ferias'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Colaborador
                </label>
                <select
                  value={formData.employee_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, employee_id: Number(e.target.value) }))}
                  required
                  disabled={!!editingId}
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
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Data Inicio
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    required
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                    required
                    className="input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Dias de Ferias
                </label>
                <input
                  type="number"
                  value={formData.days}
                  onChange={(e) => setFormData(prev => ({ ...prev, days: Number(e.target.value) }))}
                  min={1}
                  required
                  className="input w-full"
                />
                <p className="text-xs text-text-muted mt-1">
                  Calculado automaticamente com base nas datas
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Observacoes (opcional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ex: Ferias coletivas, ferias vencidas..."
                  rows={2}
                  className="input w-full"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="btn-secondary px-4 py-2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  {saving ? 'Salvando...' : (editingId ? 'Atualizar' : 'Registrar')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vacations List */}
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
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-accent-primary hover:underline text-sm"
            >
              Registrar primeiras ferias
            </button>
          )}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
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
                        <p className="text-sm text-text-primary font-medium">
                          {vacation.employee_name}
                        </p>
                        {vacation.notes && (
                          <p className="text-xs text-text-muted truncate max-w-48" title={vacation.notes}>
                            {vacation.notes}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {vacation.leader_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-text-secondary">
                      {formatDate(vacation.start_date)} - {formatDate(vacation.end_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary font-medium">
                      {vacation.days} {vacation.days === 1 ? 'dia' : 'dias'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(vacation)}
                          className="text-text-muted hover:text-accent-primary transition-colors"
                          title="Editar"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(vacation.id)}
                          className="text-text-muted hover:text-red-400 transition-colors"
                          title="Excluir"
                        >
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
      )}

      {/* Summary */}
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
                {vacations.filter(v => {
                  const today = new Date().toISOString().split('T')[0];
                  return today < v.start_date;
                }).length} agendados
              </span>
              <span className="text-text-primary font-medium">
                {vacations.length} total
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
