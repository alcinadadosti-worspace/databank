'use client';

import { useEffect, useState } from 'react';
import { getLeaders, type Leader } from '@/lib/api';

export default function AdminLeaders() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getLeaders();
        setLeaders(data.leaders);
      } catch (error) {
        console.error('Failed to load leaders:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Gestores</h2>
        <p className="text-sm text-text-tertiary mt-1">{leaders.length} gestores cadastrados</p>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Slack ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {leaders.map((leader) => (
                <tr key={leader.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-text-muted font-mono text-xs">{leader.id}</td>
                  <td className="px-4 py-3 text-text-primary">{leader.name}</td>
                  <td className="px-4 py-3 text-text-muted font-mono text-xs">{leader.slack_id || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
