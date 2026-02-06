'use client';

import { useState } from 'react';
import DateRangePicker from '@/components/DateRangePicker';
import { getLeaderRecords, type DailyRecord } from '@/lib/api';
import { formatDate, classificationBadge, classificationLabel, formatMinutes } from '@/lib/utils';
import { useManagerAuth } from '../ManagerAuthContext';

export default function ManagerJustifications() {
  const { manager } = useManagerAuth();
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadRecords(start: string, end: string) {
    if (!manager) return;
    setLoading(true);
    try {
      const data = await getLeaderRecords(manager.id, start, end);
      // Only show records with alerts (late/overtime >= 11 min)
      const alertRecords = data.records.filter(
        r => r.classification && r.classification !== 'normal' && Math.abs(r.difference_minutes || 0) >= 11
      );
      setRecords(alertRecords);
    } catch (error) {
      console.error('Failed to load records:', error);
    } finally {
      setLoading(false);
    }
  }

  if (!manager) {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Justificativas da Equipe</h2>
        <p className="text-sm text-text-tertiary mt-1">Alertas e justificativas dos colaboradores</p>
      </div>

      <DateRangePicker onRangeChange={loadRecords} />

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : records.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-text-tertiary text-sm">Nenhum alerta encontrado no periodo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <div key={record.id} className="card flex items-center justify-between animate-slide-up">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-text-primary font-medium">{record.employee_name}</span>
                  <span className={classificationBadge(record.classification)}>
                    {classificationLabel(record.classification)}
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  {formatDate(record.date)} - {formatMinutes(Math.abs(record.difference_minutes || 0))}
                </p>
              </div>
              <div className="text-right">
                {record.justification_reason ? (
                  <span className="text-sm text-status-success">{record.justification_reason}</span>
                ) : (
                  <span className="text-xs text-status-danger">Sem justificativa</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
