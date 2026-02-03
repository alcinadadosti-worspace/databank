'use client';

import { formatMinutes, formatDate, classificationBadge, classificationLabel } from '@/lib/utils';
import type { DailyRecord } from '@/lib/api';

interface RecordsTableProps {
  records: DailyRecord[];
  showEmployee?: boolean;
  showLeader?: boolean;
}

export default function RecordsTable({ records, showEmployee = true, showLeader = false }: RecordsTableProps) {
  if (records.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-text-tertiary text-sm">Nenhum registro encontrado</p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Data</th>
              {showEmployee && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Colaborador</th>}
              {showLeader && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Gestor</th>}
              <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Entrada</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Almoco</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Retorno</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Saida</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Total</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Dif.</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Justificativa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {records.map((record) => (
              <tr key={record.id} className="hover:bg-bg-hover transition-colors">
                <td className="px-4 py-3 text-text-secondary font-mono text-xs">{formatDate(record.date)}</td>
                {showEmployee && <td className="px-4 py-3 text-text-primary">{record.employee_name || '—'}</td>}
                {showLeader && <td className="px-4 py-3 text-text-secondary">{record.leader_name || '—'}</td>}
                <td className="px-4 py-3 text-text-secondary font-mono text-xs">{record.punch_1 || '—'}</td>
                <td className="px-4 py-3 text-text-secondary font-mono text-xs">{record.punch_2 || '—'}</td>
                <td className="px-4 py-3 text-text-secondary font-mono text-xs">{record.punch_3 || '—'}</td>
                <td className="px-4 py-3 text-text-secondary font-mono text-xs">{record.punch_4 || '—'}</td>
                <td className="px-4 py-3 text-text-primary font-mono text-xs font-medium">
                  {record.total_worked_minutes ? formatMinutes(record.total_worked_minutes) : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs font-medium">
                  {record.difference_minutes !== null ? (
                    <span className={record.difference_minutes < 0 ? 'text-status-danger' : record.difference_minutes > 0 ? 'text-status-warning' : 'text-status-success'}>
                      {record.difference_minutes > 0 ? '+' : ''}{formatMinutes(record.difference_minutes)}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={classificationBadge(record.classification)}>
                    {classificationLabel(record.classification)}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary text-xs max-w-[180px] truncate">
                  {record.justification_reason || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
