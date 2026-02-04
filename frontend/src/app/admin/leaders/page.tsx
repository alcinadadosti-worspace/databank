'use client';

import { useEffect, useState } from 'react';
import { getLeaders, type Leader } from '@/lib/api';

export default function AdminLeaders() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getLeaders();
        setLeaders(data.leaders);
        setSectors(data.sectors || []);
      } catch (error) {
        console.error('Failed to load leaders:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Group leaders by sector
  const grouped = new Map<string, Leader[]>();
  const sectorOrder = sectors.length > 0 ? sectors : [];

  for (const leader of leaders) {
    const key = leader.sector || 'Sem Setor';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(leader);
  }

  // Sort: known sectors first (in order), then "Sem Setor" at the end
  const sortedSectors = [
    ...sectorOrder.filter(s => grouped.has(s)),
    ...[...grouped.keys()].filter(k => !sectorOrder.includes(k)),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Gestores</h2>
        <p className="text-sm text-text-tertiary mt-1">
          {leaders.length} gestores em {sectors.length} setores
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : (
        <div className="space-y-6">
          {sortedSectors.map((sector) => {
            const sectorLeaders = grouped.get(sector) || [];
            // Sort: main leaders first (no parent), then sub-leaders
            const sorted = [...sectorLeaders].sort((a, b) => {
              if (a.parent_leader_id && !b.parent_leader_id) return 1;
              if (!a.parent_leader_id && b.parent_leader_id) return -1;
              return a.name.localeCompare(b.name);
            });

            return (
              <div key={sector}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                    {sector}
                  </h3>
                  <span className="text-xs text-text-tertiary bg-bg-secondary px-2 py-0.5 rounded-full">
                    {sectorLeaders.length}
                  </span>
                </div>
                <div className="card p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">ID</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Nome</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Slack ID</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Hierarquia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {sorted.map((leader) => {
                        const parentName = leader.parent_leader_id
                          ? leaders.find(l => l.id === leader.parent_leader_id)?.name
                          : null;

                        return (
                          <tr key={leader.id} className="hover:bg-bg-hover transition-colors">
                            <td className="px-4 py-3 text-text-muted font-mono text-xs">{leader.id}</td>
                            <td className="px-4 py-3 text-text-primary">
                              {leader.parent_leader_id && (
                                <span className="text-text-muted mr-1">&nbsp;&nbsp;&#x2514;</span>
                              )}
                              {leader.name}
                            </td>
                            <td className="px-4 py-3 text-text-muted font-mono text-xs">{leader.slack_id || '—'}</td>
                            <td className="px-4 py-3 text-text-muted text-xs">
                              {parentName ? `Sub-líder de ${parentName}` : 'Líder principal'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
