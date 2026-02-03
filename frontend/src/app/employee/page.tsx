'use client';

import { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import RecordsTable from '@/components/RecordsTable';
import { getEmployeeRecords, type DailyRecord } from '@/lib/api';
import { daysAgo, todayISO, formatMinutes } from '@/lib/utils';

// For demo, using employee ID 1. In production, this comes from auth.
const DEMO_EMPLOYEE_ID = 1;

export default function EmployeeDashboard() {
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getEmployeeRecords(DEMO_EMPLOYEE_ID, daysAgo(30), todayISO());
        setRecords(data.records);
      } catch (error) {
        console.error('Failed to load records:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const lateCount = records.filter(r => r.classification === 'late').length;
  const overtimeCount = records.filter(r => r.classification === 'overtime').length;
  const totalDiff = records.reduce((sum, r) => sum + (r.difference_minutes || 0), 0);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Meu Resumo</h2>
        <p className="text-sm text-text-tertiary mt-1">Ultimos 30 dias</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Registros" value={records.length} />
        <StatsCard label="Atrasos" value={lateCount} variant={lateCount > 0 ? 'danger' : 'default'} />
        <StatsCard label="Horas Extras" value={overtimeCount} variant={overtimeCount > 0 ? 'warning' : 'default'} />
        <StatsCard
          label="Saldo"
          value={`${totalDiff >= 0 ? '+' : ''}${formatMinutes(totalDiff)}`}
          variant={totalDiff < 0 ? 'danger' : totalDiff > 0 ? 'warning' : 'success'}
        />
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : (
        <RecordsTable records={records} showEmployee={false} />
      )}
    </div>
  );
}
