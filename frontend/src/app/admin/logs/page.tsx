'use client';

import { useEffect, useState } from 'react';
import { getAuditLogs, type AuditLog } from '@/lib/api';

export default function AdminLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAuditLogs(200);
        setLogs(data.logs);
      } catch (error) {
        console.error('Failed to load logs:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Logs de Auditoria</h2>
        <p className="text-sm text-text-tertiary mt-1">Registro de todas as acoes do sistema</p>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : logs.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-text-tertiary text-sm">Nenhum log encontrado</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Data/Hora</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Acao</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Entidade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-text-muted font-mono text-xs whitespace-nowrap">{log.created_at}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-accent/10 text-accent text-xs">{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{log.entity_type}</td>
                  <td className="px-4 py-3 text-text-muted text-xs max-w-[400px] truncate">{log.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
