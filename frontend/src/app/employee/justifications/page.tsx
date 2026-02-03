'use client';

import { useEffect, useState } from 'react';
import { getEmployeeJustifications, type Justification } from '@/lib/api';
import { formatDate, classificationBadge } from '@/lib/utils';

const DEMO_EMPLOYEE_ID = 1;

export default function EmployeeJustifications() {
  const [justifications, setJustifications] = useState<Justification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getEmployeeJustifications(DEMO_EMPLOYEE_ID);
        setJustifications(data.justifications);
      } catch (error) {
        console.error('Failed to load justifications:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Minhas Justificativas</h2>
        <p className="text-sm text-text-tertiary mt-1">Justificativas enviadas</p>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : justifications.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-text-tertiary text-sm">Nenhuma justificativa enviada</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Data</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Motivo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Enviada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {justifications.map((j) => (
                <tr key={j.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-text-secondary font-mono text-xs">{formatDate(j.date)}</td>
                  <td className="px-4 py-3">
                    <span className={classificationBadge(j.type)}>
                      {j.type === 'late' ? 'Atraso' : 'Hora Extra'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-primary">{j.reason}</td>
                  <td className="px-4 py-3 text-text-muted text-xs">{j.submitted_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
