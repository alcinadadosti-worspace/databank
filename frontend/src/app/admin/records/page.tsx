'use client';

import { useState } from 'react';
import DateRangePicker from '@/components/DateRangePicker';
import RecordsTable from '@/components/RecordsTable';
import { getAllRecords, type DailyRecord } from '@/lib/api';
import { daysAgo, todayISO } from '@/lib/utils';

export default function AdminRecords() {
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadRecords(start: string, end: string) {
    setLoading(true);
    try {
      const data = await getAllRecords(start, end);
      setRecords(data.records);
    } catch (error) {
      console.error('Failed to load records:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Registros</h2>
        <p className="text-sm text-text-tertiary mt-1">Todos os registros de ponto</p>
      </div>

      <DateRangePicker onRangeChange={loadRecords} />

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : (
        <RecordsTable records={records} showEmployee showLeader />
      )}
    </div>
  );
}
