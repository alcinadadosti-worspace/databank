'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getFolgasByLeader,
  getEmployees,
  createFolga,
  createFolgaRange,
  updateFolga,
  deleteFolga,
  type Folga,
  type Employee,
} from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useManagerAuth } from '../ManagerAuthContext';

export default function ManagerFolgas() {
  const { manager } = useManagerAuth();
  const [folgas, setFolgas] = useState<Folga[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeResult, setRangeResult] = useState<{ created: number; skipped_dates: { date: string; reason: string }[] } | null>(null);
  const [form, setForm] = useState({
    employee_id: 0,
    date: '',
    start_date: '',
    end_date: '',
    type: 'integral' as 'integral' | 'partial',
    hours_off: 1,
    notes: '',
  });
  const [search, setSearch] = useState('');

  async function loadData() {
    if (!manager) return;
    setLoading(true);
    try {
      const [folgaData, empData] = await Promise.all([
        getFolgasByLeader(manager.id),
        getEmployees(),
      ]);
      setFolgas(folgaData.folgas);
      // Only show employees from this manager's team
      setEmployees(empData.employees.filter(e => e.leader_id === manager.id));
    } catch {
      setError('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [manager]);

  function resetForm() {
    setForm({ employee_id: 0, date: '', start_date: '', end_date: '', type: 'integral', hours_off: 1, notes: '' });
    setEditingId(null);
    setRangeMode(false);
    setRangeResult(null);
    setShowForm(false);
    setError('');
  }

  function handleEdit(folga: Folga) {
    setForm({
      employee_id: folga.employee_id,
      date: folga.date,
      start_date: '',
      end_date: '',
      type: folga.type,
      hours_off: folga.hours_off,
      notes: folga.notes || '',
    });
    setEditingId(folga.id);
    setShowForm(true);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manager) return;
    setSaving(true);
    setError('');

    if (form.employee_id === 0) {
      setError('Selecione um colaborador');
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        await updateFolga(editingId, {
          date: form.date,
          type: form.type,
          hours_off: form.type === 'integral' ? undefined : form.hours_off,
          notes: form.notes || undefined,
        });
        await loadData();
        resetForm();
      } else if (rangeMode) {
        const result = await createFolgaRange({
          employee_id: form.employee_id,
          leader_id: manager.id,
          start_date: form.start_date,
          end_date: form.end_date,
          type: form.type,
          hours_off: form.type === 'integral' ? undefined : form.hours_off,
          notes: form.notes || undefined,
        });
        await loadData();
        setRangeResult({ created: result.created, skipped_dates: result.skipped_dates });
      } else {
        await createFolga({
          employee_id: form.employee_id,
          leader_id: manager.id,
          date: form.date,
          type: form.type,
          hours_off: form.type === 'integral' ? undefined : form.hours_off,
          notes: form.notes || undefined,
        });
        await loadData();
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar folga');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Tem certeza que deseja excluir esta folga?')) return;
    try {
      await deleteFolga(id);
      setFolgas(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir folga');
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return folgas;
    const s = search.toLowerCase();
    return folgas.filter(f => f.employee_name?.toLowerCase().includes(s));
  }, [folgas, search]);

  if (!manager) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Folgas</h2>
        <p className="text-sm text-text-tertiary mt-1">Agende folgas integrais ou parciais para sua equipe</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <input
          type="text"
          placeholder="Buscar por colaborador..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1"
        />
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="btn-primary text-sm whitespace-nowrap"
        >
          + Nova Folga
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">
              {editingId ? 'Editar Folga' : 'Nova Folga'}
            </h3>
            {!editingId && (
              <div className="flex items-center gap-1 bg-bg-secondary rounded p-1">
                <button
                  type="button"
                  onClick={() => { setRangeMode(false); setRangeResult(null); }}
                  className={`text-xs px-3 py-1 rounded transition-colors ${!rangeMode ? 'bg-accent-primary text-white' : 'text-text-muted hover:text-text-primary'}`}
                >
                  Dia único
                </button>
                <button
                  type="button"
                  onClick={() => { setRangeMode(true); setRangeResult(null); }}
                  className={`text-xs px-3 py-1 rounded transition-colors ${rangeMode ? 'bg-accent-primary text-white' : 'text-text-muted hover:text-text-primary'}`}
                >
                  Período
                </button>
              </div>
            )}
          </div>

          {rangeResult ? (
            <div className="space-y-3">
              <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded text-sm">
                {rangeResult.created} folga(s) registrada(s) com sucesso.
              </div>
              {rangeResult.skipped_dates.length > 0 && (
                <div className="bg-bg-secondary rounded p-3">
                  <p className="text-xs text-text-muted mb-2">{rangeResult.skipped_dates.length} dia(s) ignorado(s):</p>
                  <ul className="space-y-1">
                    {rangeResult.skipped_dates.map(s => (
                      <li key={s.date} className="text-xs text-text-secondary">
                        {s.date.split('-').reverse().join('/')} — {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <button type="button" onClick={resetForm} className="btn-primary text-sm">Fechar</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Colaborador</label>
                  <select
                    value={form.employee_id}
                    onChange={(e) => setForm(prev => ({ ...prev, employee_id: parseInt(e.target.value) }))}
                    className="input w-full"
                    disabled={!!editingId}
                    required
                  >
                    <option value={0}>Selecione...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                {rangeMode ? (
                  <>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Data início</label>
                      <input
                        type="date"
                        value={form.start_date}
                        onChange={(e) => setForm(prev => ({ ...prev, start_date: e.target.value }))}
                        className="input w-full"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Data fim</label>
                      <input
                        type="date"
                        value={form.end_date}
                        min={form.start_date}
                        onChange={(e) => setForm(prev => ({ ...prev, end_date: e.target.value }))}
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
                      value={form.date}
                      onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
                      className="input w-full"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-text-muted mb-1">Tipo</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value as 'integral' | 'partial' }))}
                    className="input w-full"
                  >
                    <option value="integral">Integral (dia todo)</option>
                    <option value="partial">Parcial (horas)</option>
                  </select>
                </div>
                {form.type === 'partial' && (
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Horas de folga</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={form.hours_off}
                      onChange={(e) => setForm(prev => ({ ...prev, hours_off: parseInt(e.target.value) }))}
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
                    value={form.notes}
                    onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="input w-full"
                    placeholder="Ex: compensação de hora extra..."
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={resetForm} className="btn-secondary text-sm">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary text-sm">
                  {saving ? 'Salvando...' : editingId ? 'Salvar' : rangeMode ? 'Registrar período' : 'Registrar'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-text-tertiary">Nenhuma folga registrada para sua equipe</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Colaborador</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Observações</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((folga) => (
                <tr key={folga.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{folga.employee_name}</td>
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
                      <button onClick={() => handleEdit(folga)} className="text-text-muted hover:text-accent-primary transition-colors" title="Editar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(folga.id)} className="text-text-muted hover:text-red-400 transition-colors" title="Excluir">
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
      )}
    </div>
  );
}
