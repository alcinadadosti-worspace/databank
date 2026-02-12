'use client';

import { useState, useEffect } from 'react';
import { getHolidays, createHoliday, updateHoliday, deleteHoliday, type Holiday } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const HOLIDAY_TYPES = [
  { value: 'national', label: 'Nacional' },
  { value: 'state', label: 'Estadual' },
  { value: 'municipal', label: 'Municipal' },
  { value: 'company', label: 'Empresa' },
] as const;

function getTypeLabel(type: Holiday['type']): string {
  return HOLIDAY_TYPES.find(t => t.value === type)?.label || type;
}

function getTypeColor(type: Holiday['type']): string {
  switch (type) {
    case 'national': return 'bg-red-500/20 text-red-400';
    case 'state': return 'bg-blue-500/20 text-blue-400';
    case 'municipal': return 'bg-green-500/20 text-green-400';
    case 'company': return 'bg-purple-500/20 text-purple-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

export default function AdminHolidays() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    date: '',
    name: '',
    type: 'company' as Holiday['type'],
    recurring: false,
  });

  // Filter state
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  async function loadHolidays() {
    setLoading(true);
    try {
      const data = await getHolidays();
      setHolidays(data.holidays);
    } catch (err) {
      console.error('Failed to load holidays:', err);
      setError('Erro ao carregar feriados');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHolidays();
  }, []);

  function resetForm() {
    setFormData({
      date: '',
      name: '',
      type: 'company',
      recurring: false,
    });
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  function handleEdit(holiday: Holiday) {
    setFormData({
      date: holiday.date,
      name: holiday.name,
      type: holiday.type,
      recurring: holiday.recurring,
    });
    setEditingId(holiday.id);
    setShowForm(true);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (editingId) {
        await updateHoliday(editingId, formData);
      } else {
        await createHoliday(formData);
      }
      await loadHolidays();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar feriado');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Tem certeza que deseja excluir este feriado?')) return;

    try {
      await deleteHoliday(id);
      setHolidays(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir feriado');
    }
  }

  // Filter holidays by year (considering recurring)
  const filteredHolidays = holidays.filter(h => {
    if (h.recurring) return true;
    return h.date.startsWith(String(filterYear));
  }).map(h => {
    if (h.recurring) {
      const [, month, day] = h.date.split('-');
      return { ...h, displayDate: `${filterYear}-${month}-${day}` };
    }
    return { ...h, displayDate: h.date };
  }).sort((a, b) => a.displayDate.localeCompare(b.displayDate));

  // Generate year options
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Feriados</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Cadastre feriados e folgas da empresa
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(Number(e.target.value))}
            className="input text-sm"
          >
            {yearOptions.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary px-4 py-2 text-sm"
          >
            + Novo Feriado
          </button>
        </div>
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
              {editingId ? 'Editar Feriado' : 'Novo Feriado'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Data
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  required
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Natal, Aniversario da Empresa..."
                  required
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Tipo
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as Holiday['type'] }))}
                  className="input w-full"
                >
                  {HOLIDAY_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={formData.recurring}
                  onChange={(e) => setFormData(prev => ({ ...prev, recurring: e.target.checked }))}
                  className="w-4 h-4 rounded border-border text-accent-primary focus:ring-accent-primary"
                />
                <label htmlFor="recurring" className="text-sm text-text-secondary">
                  Repetir todo ano (feriado fixo)
                </label>
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
                  {saving ? 'Salvando...' : (editingId ? 'Atualizar' : 'Criar')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Holidays List */}
      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : filteredHolidays.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-text-tertiary">Nenhum feriado cadastrado para {filterYear}</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 text-accent-primary hover:underline text-sm"
          >
            Cadastrar primeiro feriado
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary text-left text-xs text-text-muted">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Recorrente</th>
                <th className="px-4 py-3 font-medium w-24">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredHolidays.map((holiday) => (
                <tr key={holiday.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-text-secondary">
                    {formatDate(holiday.displayDate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">
                    {holiday.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${getTypeColor(holiday.type)}`}>
                      {getTypeLabel(holiday.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {holiday.recurring ? (
                      <span className="text-green-400">Sim</span>
                    ) : (
                      <span className="text-text-muted">Nao</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(holiday)}
                        className="text-text-muted hover:text-accent-primary transition-colors"
                        title="Editar"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(holiday.id)}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {!loading && filteredHolidays.length > 0 && (
        <div className="card bg-bg-secondary">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Total em {filterYear}:</span>
            <div className="flex items-center gap-4">
              <span className="text-text-primary font-medium">
                {filteredHolidays.length} feriado{filteredHolidays.length !== 1 ? 's' : ''}
              </span>
              <span className="text-text-muted">
                ({filteredHolidays.filter(h => h.recurring).length} recorrentes)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
