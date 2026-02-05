'use client';

import { useEffect, useState, useCallback } from 'react';
import { getUnitRecords, resyncPunches, type UnitData } from '@/lib/api';
import { todayISO } from '@/lib/utils';

export default function FuncionamentoUnidade() {
  const [units, setUnits] = useState<UnitData[]>([]);
  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUnitRecords(date);
      setUnits(data.units);
    } catch (error) {
      console.error('Failed to load unit records:', error);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleResync() {
    setSyncing(true);
    try {
      await resyncPunches(date);
      await loadData();
    } catch (error) {
      console.error('Failed to resync:', error);
    } finally {
      setSyncing(false);
    }
  }

  const totalPresent = units.reduce((sum, u) => sum + u.present_count, 0);
  const totalEmployees = units.reduce((sum, u) => sum + u.total_count, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Funcionamento de Unidade</h2>
          <p className="text-sm text-text-tertiary mt-1">
            {totalPresent} de {totalEmployees} colaboradores presentes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResync}
            disabled={syncing}
            className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={syncing ? 'animate-spin' : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
              <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
            </svg>
            {syncing ? 'Atualizando...' : 'Atualizar Pontos'}
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input max-w-[180px]"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {units.map((unit) => (
            <div key={unit.leader_id} className="card p-0 overflow-hidden">
              {/* Unit header */}
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">{unit.unit_name}</h3>
                  <p className="text-xs text-text-tertiary">{unit.leader_name}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${unit.present_count === unit.total_count ? 'text-status-success' : 'text-status-warning'}`}>
                    {unit.present_count}/{unit.total_count}
                  </span>
                </div>
              </div>

              {/* Employee list */}
              <div className="divide-y divide-border-subtle">
                {unit.employees.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-text-tertiary">Nenhum colaborador</p>
                ) : (
                  unit.employees.map((emp) => (
                    <div key={emp.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-bg-hover transition-colors">
                      {/* Status indicator */}
                      <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          emp.present ? 'bg-status-success' : 'bg-status-danger'
                        }`}
                        title={emp.present ? 'Presente' : 'Ausente'}
                      />

                      {/* Name */}
                      <span className={`text-sm flex-1 min-w-0 truncate ${
                        emp.present ? 'text-text-primary' : 'text-text-muted'
                      }`}>
                        {emp.name}
                      </span>

                      {/* Punches */}
                      <div className="flex items-center gap-2 text-xs font-mono text-text-muted flex-shrink-0">
                        {emp.no_punch_required ? (
                          <span className="text-2xs font-sans font-medium text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded" title="Colaborador nao bate ponto">Sem ponto</span>
                        ) : emp.is_apprentice ? (
                          <>
                            <span className="text-2xs font-sans font-medium text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded" title="Jovem Aprendiz - 4h/dia">JA</span>
                            {emp.punch_1 && <span title="Entrada">{emp.punch_1}</span>}
                            {emp.punch_2 && <span title="Saida">{emp.punch_2}</span>}
                            {!emp.punch_1 && <span className="text-status-danger">Sem registro</span>}
                          </>
                        ) : (
                          <>
                            {emp.punch_1 && <span title="Entrada">{emp.punch_1}</span>}
                            {emp.punch_2 && <span title="Saida almoco">{emp.punch_2}</span>}
                            {emp.punch_3 && <span title="Retorno almoco">{emp.punch_3}</span>}
                            {emp.punch_4 && <span title="Saida">{emp.punch_4}</span>}
                            {!emp.punch_1 && (
                              <span className="text-status-danger">Sem registro</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
