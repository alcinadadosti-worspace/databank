'use client';

import { useEffect, useState } from 'react';
import RecordsTable from '@/components/RecordsTable';
import { getLeaderRecords, getUnitRecords, type DailyRecord, type UnitData } from '@/lib/api';
import { daysAgo, todayISO } from '@/lib/utils';
import { useManagerAuth } from './ManagerAuthContext';

export default function ManagerDashboard() {
  const { manager } = useManagerAuth();
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [unitData, setUnitData] = useState<UnitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(daysAgo(30));
  const [endDate, setEndDate] = useState(todayISO());
  const [unitDate, setUnitDate] = useState(todayISO());

  useEffect(() => {
    if (!manager) return;

    async function loadData() {
      setLoading(true);
      try {
        const [recData, unitsData] = await Promise.all([
          getLeaderRecords(manager!.id, startDate, endDate),
          getUnitRecords(unitDate),
        ]);
        setRecords(recData.records);

        // Find this manager's unit
        const myUnit = unitsData.units.find(u => u.leader_id === manager!.id);
        setUnitData(myUnit || null);
      } catch (error) {
        console.error('Failed to load:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [manager, startDate, endDate, unitDate]);

  if (!manager) {
    return null;
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h2 className="text-lg font-semibold text-text-primary">Painel Gestor</h2>
        <p className="text-sm text-text-tertiary mt-1">Carregando...</p>
      </div>
    );
  }

  const presentCount = unitData?.present_count ?? 0;
  const totalCount = unitData?.total_count ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Painel Gestor</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Bem-vindo, {manager.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted">Presenca:</label>
          <input
            type="date"
            value={unitDate}
            onChange={(e) => setUnitDate(e.target.value)}
            className="input max-w-[150px]"
          />
        </div>
      </div>

      {/* Unit Card - Similar to Funcionamento */}
      {unitData ? (
        <div className="card p-0 overflow-hidden">
          {/* Unit header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{unitData.unit_name}</h3>
              <p className="text-xs text-text-tertiary">Sua equipe</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-semibold ${presentCount === totalCount ? 'text-status-success' : 'text-status-warning'}`}>
                {presentCount}/{totalCount} presentes
              </span>
            </div>
          </div>

          {/* Employee list */}
          <div className="divide-y divide-border-subtle">
            {unitData.employees.length === 0 ? (
              <p className="px-4 py-3 text-xs text-text-tertiary">Nenhum colaborador</p>
            ) : (
              unitData.employees.map((emp) => (
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
      ) : (
        <div className="card text-center py-8">
          <p className="text-text-tertiary">Nenhuma unidade encontrada para este gestor</p>
        </div>
      )}

      {/* Records table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-sm font-medium text-text-secondary">Banco de Horas da Equipe</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-text-muted">De:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input max-w-[150px]"
            />
            <label className="text-xs text-text-muted">Ate:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input max-w-[150px]"
            />
          </div>
        </div>
        <p className="text-xs text-text-muted">{records.length} registros encontrados</p>
        <RecordsTable records={records} showEmployee />
      </div>
    </div>
  );
}
