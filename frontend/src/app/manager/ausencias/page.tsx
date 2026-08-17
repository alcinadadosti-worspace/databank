'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getUnitRecords, getEmployeesByLeader, fixLeaderDayRecord, type UnitData, type UnitEmployee } from '@/lib/api';
import { todayISO, daysAgo, formatDate } from '@/lib/utils';
import { useManagerAuth } from '../ManagerAuthContext';

interface AbsentRow {
  unitName: string;
  employee: UnitEmployee;
  canFix: boolean;
}

interface DayAbsences {
  date: string;
  isHoliday: boolean;
  rows: AbsentRow[];
  totalEmployees: number;
}

const MAX_RANGE_DAYS = 31;
const FETCH_CHUNK_SIZE = 10;

function isSunday(dateStr: string): boolean {
  return new Date(dateStr + 'T12:00:00').getDay() === 0;
}

function weekdayLabel(dateStr: string): string {
  return ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][new Date(dateStr + 'T12:00:00').getDay()];
}

function listDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(start + 'T12:00:00');
  const last = new Date(end + 'T12:00:00');
  while (cursor <= last) {
    dates.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export default function ManagerAbsences() {
  const { manager } = useManagerAuth();
  const [startDate, setStartDate] = useState(daysAgo(6));
  const [endDate, setEndDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DayAbsences[]>([]);
  // Ignore responses from a superseded fetch when the range changes mid-flight
  const requestSeq = useRef(0);

  // Fix modal state
  const [fixingEmployee, setFixingEmployee] = useState<UnitEmployee | null>(null);
  const [fixingDate, setFixingDate] = useState('');
  const [fixForm, setFixForm] = useState({
    punch_1: '',
    punch_2: '',
    punch_3: '',
    punch_4: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const rangeError = (() => {
    if (!startDate || !endDate) return 'Informe as duas datas';
    if (startDate > endDate) return 'A data inicial deve ser anterior à final';
    if (listDates(startDate, endDate).length > MAX_RANGE_DAYS) return `Intervalo máximo de ${MAX_RANGE_DAYS} dias`;
    return '';
  })();

  const loadAbsences = useCallback(async (start: string, end: string) => {
    if (!manager) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const dates = listDates(start, end);
      const teamData = await getEmployeesByLeader(manager.id);
      // Only employees the manager can actually edit (same rule as the backend check)
      const teamIds = new Set(teamData.employees.map(e => e.id));

      const results: DayAbsences[] = [];
      for (let i = 0; i < dates.length; i += FETCH_CHUNK_SIZE) {
        const chunk = dates.slice(i, i + FETCH_CHUNK_SIZE);
        const chunkData = await Promise.all(chunk.map(d => getUnitRecords(d)));
        chunkData.forEach((unitsData, idx) => {
          const myUnits = unitsData.units.filter((u: UnitData) => u.leader_id === manager.id);
          const rows: AbsentRow[] = [];
          let total = 0;
          for (const unit of myUnits) {
            total += unit.total_count;
            for (const emp of unit.employees) {
              if (!emp.present) {
                rows.push({ unitName: unit.unit_name, employee: emp, canFix: teamIds.has(emp.id) });
              }
            }
          }
          results.push({ date: chunk[idx], isHoliday: unitsData.is_holiday, rows, totalEmployees: total });
        });
      }

      if (seq !== requestSeq.current) return;
      results.sort((a, b) => b.date.localeCompare(a.date));
      setDays(results);
    } catch (err) {
      console.error('Failed to load absences:', err);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [manager]);

  useEffect(() => {
    if (rangeError) return;
    loadAbsences(startDate, endDate);
  }, [startDate, endDate, rangeError, loadAbsences]);

  function openFixModal(employee: UnitEmployee, date: string) {
    setFixingEmployee(employee);
    setFixingDate(date);
    setFixForm({ punch_1: '', punch_2: '', punch_3: '', punch_4: '', reason: '' });
    setError('');
  }

  function closeFixModal() {
    setFixingEmployee(null);
    setFixingDate('');
    setError('');
  }

  async function handleSaveFix() {
    if (!fixingEmployee || !fixingDate || !manager) return;

    if (!fixForm.punch_1 && !fixForm.punch_2 && !fixForm.punch_3 && !fixForm.punch_4) {
      setError('Informe pelo menos um horário');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await fixLeaderDayRecord(manager.id, fixingEmployee.id, fixingDate, {
        punch_1: fixForm.punch_1 || null,
        punch_2: fixForm.punch_2 || null,
        punch_3: fixForm.punch_3 || null,
        punch_4: fixForm.punch_4 || null,
        editedBy: manager.name,
        reason: fixForm.reason || 'Lançamento manual de ponto',
      });

      closeFixModal();
      await loadAbsences(startDate, endDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (!manager) {
    return null;
  }

  const singleDay = startDate === endDate;
  // In a multi-day range, Sundays and holidays would flood the list with false
  // absences (whole team "absent"), so they are only shown when picked alone.
  const visibleDays = singleDay ? days : days.filter(d => !d.isHoliday && !isSunday(d.date));
  const daysWithAbsences = visibleDays.filter(d => d.rows.length > 0);
  const totalAbsences = daysWithAbsences.reduce((sum, d) => sum + d.rows.length, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Ausências</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Colaboradores sem nenhum ponto no dia — clique em Lançar Ponto para corrigir
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-text-muted">De:</label>
          <input
            type="date"
            value={startDate}
            max={todayISO()}
            onChange={(e) => setStartDate(e.target.value)}
            className="input max-w-[150px]"
          />
          <label className="text-xs text-text-muted">Até:</label>
          <input
            type="date"
            value={endDate}
            max={todayISO()}
            onChange={(e) => setEndDate(e.target.value)}
            className="input max-w-[150px]"
          />
        </div>
      </div>

      {rangeError ? (
        <div className="card p-3 border-l-4 border-status-warning">
          <p className="text-sm text-text-secondary">{rangeError}</p>
        </div>
      ) : (
        <>
          {singleDay && days.length > 0 && (days[0].isHoliday || isSunday(days[0].date)) && (
            <div className="card p-3 border-l-4 border-status-warning">
              <p className="text-sm text-text-secondary">
                {days[0].isHoliday ? 'Este dia é feriado' : 'Este dia é domingo'} — ausências aqui normalmente não são falta.
              </p>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-text-tertiary">Carregando...</p>
          ) : totalAbsences === 0 ? (
            <div className="card text-center py-12">
              <p className="text-status-success text-sm font-medium">
                {singleDay
                  ? `Todos os colaboradores registraram ponto em ${formatDate(startDate)}`
                  : `Nenhuma ausência entre ${formatDate(startDate)} e ${formatDate(endDate)}`}
              </p>
              {!singleDay && (
                <p className="text-xs text-text-muted mt-2">Domingos e feriados não entram na lista</p>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-text-muted">
                {totalAbsences} {totalAbsences === 1 ? 'ausência' : 'ausências'}
                {singleDay
                  ? ` em ${formatDate(startDate)}`
                  : ` entre ${formatDate(startDate)} e ${formatDate(endDate)} — domingos e feriados não entram na lista`}
              </p>

              {daysWithAbsences.map(day => {
                const units = Array.from(new Set(day.rows.map(r => r.unitName)));
                return (
                  <div key={day.date} className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-text-primary">
                        {weekdayLabel(day.date)}, {formatDate(day.date)}
                      </h3>
                      <span className="text-xs text-text-muted">
                        {day.rows.length} de {day.totalEmployees} sem registro
                      </span>
                      {day.isHoliday && (
                        <span className="text-2xs font-medium text-status-warning bg-status-warning/10 px-1.5 py-0.5 rounded">
                          Feriado
                        </span>
                      )}
                      {isSunday(day.date) && (
                        <span className="text-2xs font-medium text-status-warning bg-status-warning/10 px-1.5 py-0.5 rounded">
                          Domingo
                        </span>
                      )}
                    </div>

                    {units.map(unitName => (
                      <div key={unitName} className="card p-0 overflow-hidden">
                        <div className="px-4 py-3 border-b border-border">
                          <h4 className="text-sm font-semibold text-text-primary">{unitName}</h4>
                        </div>
                        <div className="divide-y divide-border-subtle">
                          {day.rows.filter(r => r.unitName === unitName).map(({ employee, canFix }) => (
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
                                  onClick={() => openFixModal(employee, day.date)}
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
                  </div>
                );
              })}
            </>
          )}
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
                  <strong>Data:</strong> {formatDate(fixingDate)}
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
