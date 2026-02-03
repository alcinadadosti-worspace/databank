'use client';

import { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import RecordsTable from '@/components/RecordsTable';
import { getLeaderRecords, getEmployeesByLeader, type DailyRecord, type Employee } from '@/lib/api';
import { daysAgo, todayISO, formatMinutes } from '@/lib/utils';

// For demo, using leader ID 1. In production, from auth.
const DEMO_LEADER_ID = 1;

export default function ManagerDashboard() {
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [recData, empData] = await Promise.all([
          getLeaderRecords(DEMO_LEADER_ID, daysAgo(7), todayISO()),
          getEmployeesByLeader(DEMO_LEADER_ID),
        ]);
        setRecords(recData.records);
        setEmployees(empData.employees);
      } catch (error) {
        console.error('Failed to load:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const lateCount = records.filter(r => r.classification === 'late').length;
  const overtimeCount = records.filter(r => r.classification === 'overtime').length;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Visao Geral</h2>
        <p className="text-sm text-text-tertiary mt-1">Resumo da equipe — ultimos 7 dias</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Colaboradores" value={employees.length} />
        <StatsCard label="Registros" value={records.length} />
        <StatsCard label="Atrasos" value={lateCount} variant={lateCount > 0 ? 'danger' : 'default'} />
        <StatsCard label="Horas Extras" value={overtimeCount} variant={overtimeCount > 0 ? 'warning' : 'default'} />
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : (
        <RecordsTable records={records} showEmployee />
      )}
    </div>
  );
}
