'use client';

import { formatMinutes, formatDate, classificationBadge, classificationLabel } from '@/lib/utils';
import type { DailyRecord } from '@/lib/api';

interface RecordsTableProps {
  records: DailyRecord[];
  showEmployee?: boolean;
  showLeader?: boolean;
  onEdit?: (record: DailyRecord) => void;
}

export default function RecordsTable({ records, showEmployee = true, showLeader = false, onEdit }: RecordsTableProps) {
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
              {onEdit && <th className="text-left px-2 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider w-10"></th>}
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
                {onEdit && (
                  <td className="px-2 py-3">
                    <button
                      onClick={() => onEdit(record)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Editar registro"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  </td>
                )}
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
                <td className="px-4 py-3 text-text-secondary text-xs max-w-[180px]">
                  {record.justification_reason ? (
                    <span className="flex items-center gap-1.5">
                      {record.justification_status === 'approved' && (
                        <span className="text-green-500 flex-shrink-0" title="Aprovada">✓</span>
                      )}
                      {record.justification_status === 'rejected' && (
                        <span className="text-red-500 flex-shrink-0" title="Rejeitada">✗</span>
                      )}
                      {record.justification_status === 'pending' && (
                        <span className="text-yellow-500 flex-shrink-0" title="Pendente">⏳</span>
                      )}
                      {!record.justification_status && (
                        <span className="text-yellow-500 flex-shrink-0" title="Pendente">⏳</span>
                      )}
                      <span className="truncate">{record.justification_reason}</span>
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
