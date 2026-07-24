'use client';

import { useState, useEffect, useCallback } from 'react';
import { getUnitRecords, getEmployeesByLeader, fixLeaderDayRecord, type UnitData, type UnitEmployee } from '@/lib/api';
import { todayISO, formatDate } from '@/lib/utils';
import { useManagerAuth } from '../ManagerAuthContext';

interface AbsentRow {
  unitName: string;
  employee: UnitEmployee;
  canFix: boolean;
}

export default function ManagerAbsences() {
  const { manager } = useManagerAuth();
  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AbsentRow[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [isHoliday, setIsHoliday] = useState(false);

  // Fix modal state
  const [fixingEmployee, setFixingEmployee] = useState<UnitEmployee | null>(null);
  const [fixForm, setFixForm] = useState({
    punch_1: '',
    punch_2: '',
    punch_3: '',
    punch_4: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadAbsences = useCallback(async (targetDate: string) => {
    if (!manager) return;
    setLoading(true);
    try {
      const [unitsData, teamData] = await Promise.all([
        getUnitRecords(targetDate),
        getEmployeesByLeader(manager.id),
      ]);
      setIsHoliday(unitsData.is_holiday);

      // Only employees the manager can actually edit (same rule as the backend check)
      const teamIds = new Set(teamData.employees.map(e => e.id));

      const myUnits = unitsData.units.filter((u: UnitData) => u.leader_id === manager.id);
      const absentRows: AbsentRow[] = [];
      let total = 0;
      for (const unit of myUnits) {
        total += unit.total_count;
        for (const emp of unit.employees) {
          if (!emp.present) {
            absentRows.push({ unitName: unit.unit_name, employee: emp, canFix: teamIds.has(emp.id) });
          }
        }
      }
      setRows(absentRows);
      setTotalEmployees(total);
    } catch (err) {
      console.error('Failed to load absences:', err);
    } finally {
      setLoading(false);
    }
  }, [manager]);

  useEffect(() => {
    loadAbsences(date);
  }, [date, loadAbsences]);

  function isSunday(dateStr: string): boolean {
    return new Date(dateStr + 'T12:00:00').getDay() === 0;
  }

  function openFixModal(employee: UnitEmployee) {
    setFixingEmployee(employee);
    setFixForm({ punch_1: '', punch_2: '', punch_3: '', punch_4: '', reason: '' });
    setError('');
  }

  function closeFixModal() {
    setFixingEmployee(null);
    setError('');
  }

  async function handleSaveFix() {
    if (!fixingEmployee || !manager) return;

    if (!fixForm.punch_1 && !fixForm.punch_2 && !fixForm.punch_3 && !fixForm.punch_4) {
      setError('Informe pelo menos um horário');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await fixLeaderDayRecord(manager.id, fixingEmployee.id, date, {
        punch_1: fixForm.punch_1 || null,
        punch_2: fixForm.punch_2 || null,
        punch_3: fixForm.punch_3 || null,
        punch_4: fixForm.punch_4 || null,
        editedBy: manager.name,
        reason: fixForm.reason || 'Lançamento manual de ponto',
      });

      closeFixModal();
      await loadAbsences(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (!manager) {
    return null;
  }

  // Group rows by unit for display
  const units = Array.from(new Set(rows.map(r => r.unitName)));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Ausências</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Colaboradores sem nenhum ponto no dia — clique em Lançar Ponto para corrigir
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted">Dia:</label>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="input max-w-[150px]"
          />
        </div>
      </div>

      {(isHoliday || isSunday(date)) && (
        <div className="card p-3 border-l-4 border-status-warning">
          <p className="text-sm text-text-secondary">
            {isHoliday ? 'Este dia é feriado' : 'Este dia é domingo'} — ausências aqui normalmente não são falta.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : rows.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-status-success text-sm font-medium">
            Todos os colaboradores registraram ponto em {formatDate(date)}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-text-muted">
            {rows.length} de {totalEmployees} colaboradores sem registro em {formatDate(date)}
          </p>

          {units.map(unitName => (
            <div key={unitName} className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-text-primary">{unitName}</h3>
              </div>
              <div className="divide-y divide-border-subtle">
                {rows.filter(r => r.unitName === unitName).map(({ employee, canFix }) => (
                  <div key={employee.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-bg-hover transition-colors">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-status-danger" title="Sem registro" />
                    <span className="text-sm flex-1 min-w-0 truncate text-text-primary">{employee.name}</span>
                    {employee.is_on_folga && employee.folga_type === 'partial' && (
                      <span className="text-2xs font-medium text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded flex-shrink-0">
                        Folga parcial
                      </span>
                    )}
                    {canFix ? (
                      <button
                        onClick={() => openFixModal(employee)}
                        className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 flex-shrink-0"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        Lançar Ponto
                      </button>
                    ) : (
                      <span className="text-2xs text-text-muted flex-shrink-0" title="Colaborador de outra equipe exibido nesta unidade">
                        Gerenciado pelo RH
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Fix Modal */}
      {fixingEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Lançar Ponto
            </h3>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">
                  <strong>Colaborador:</strong> {fixingEmployee.name}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Data:</strong> {formatDate(date)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entrada
                  </label>
                  <input
                    type="time"
                    value={fixForm.punch_1}
                    onChange={(e) => setFixForm(prev => ({ ...prev, punch_1: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Saída Almoço
                  </label>
                  <input
                    type="time"
                    value={fixForm.punch_2}
                    onChange={(e) => setFixForm(prev => ({ ...prev, punch_2: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Retorno Almoço
                  </label>
                  <input
                    type="time"
                    value={fixForm.punch_3}
                    onChange={(e) => setFixForm(prev => ({ ...prev, punch_3: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Saída
                  </label>
                  <input
                    type="time"
                    value={fixForm.punch_4}
                    onChange={(e) => setFixForm(prev => ({ ...prev, punch_4: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Jornadas de 2 pontos (sábado, colaborador sem intervalo, Loja Sustentável):
                preencha apenas Entrada e Saída Almoço — o segundo horário vale como saída.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo
                </label>
                <textarea
                  value={fixForm.reason}
                  onChange={(e) => setFixForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Ex: Aparelho de ponto indisponível"
                  rows={2}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={closeFixModal}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveFix}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
