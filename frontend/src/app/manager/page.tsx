'use client';

import { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import RecordsTable from '@/components/RecordsTable';
import { getLeaderRecords, getEmployeesByLeader, type DailyRecord, type Employee } from '@/lib/api';
import { daysAgo, todayISO } from '@/lib/utils';
import { useManagerAuth } from './ManagerAuthContext';

export default function ManagerDashboard() {
  const { manager } = useManagerAuth();
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!manager) return;

    async function loadData() {
      setLoading(true);
      try {
        const [recData, empData] = await Promise.all([
          getLeaderRecords(manager!.id, daysAgo(7), todayISO()),
          getEmployeesByLeader(manager!.id),
        ]);
        setRecords(recData.records);
        setEmployees(empData.employees);
      } catch (error) {
        console.error('Failed to load:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [manager]);

  const lateCount = records.filter(r => r.classification === 'late').length;
  const overtimeCount = records.filter(r => r.classification === 'overtime').length;
  const normalCount = records.filter(r => r.classification === 'normal').length;

  if (!manager) {
    return null; // Layout handles the login
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h2 className="text-lg font-semibold text-text-primary">Painel Gestor</h2>
        <p className="text-sm text-text-tertiary mt-1">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Painel Gestor</h2>
        <p className="text-sm text-text-tertiary mt-1">
          Bem-vindo, {manager.name}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard label="Colaboradores" value={employees.length} />
        <StatsCard label="Registros (7d)" value={records.length} />
        <StatsCard label="Normal" value={normalCount} variant="success" />
        <StatsCard label="Atrasos" value={lateCount} variant={lateCount > 0 ? 'danger' : 'default'} />
        <StatsCard label="Horas Extras" value={overtimeCount} variant={overtimeCount > 0 ? 'warning' : 'default'} />
      </div>

      {/* Team members */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">
          Sua equipe ({employees.length} colaboradores)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {employees.map((emp) => {
            const empRecords = records.filter(r => r.employee_id === emp.id);
            const empLate = empRecords.filter(r => r.classification === 'late').length;
            const empOvertime = empRecords.filter(r => r.classification === 'overtime').length;
            const empNormal = empRecords.filter(r => r.classification === 'normal').length;
            return (
              <div key={emp.id} className="card">
                <p className="text-sm font-medium text-text-primary">{emp.name}</p>
                <div className="flex gap-3 mt-2 text-xs">
                  <span className="text-status-success">{empNormal} normal</span>
                  <span className="text-status-danger">{empLate} atraso{empLate !== 1 ? 's' : ''}</span>
                  <span className="text-status-warning">{empOvertime} extra{empOvertime !== 1 ? 's' : ''}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">{empRecords.length} registros em 7 dias</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Records table */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">Registros - ultimos 7 dias</h3>
        <RecordsTable records={records} showEmployee />
      </div>
    </div>
  );
}
