'use client';

import { useEffect, useState } from 'react';
import { getEmployees, type Employee } from '@/lib/api';

export default function AdminEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getEmployees();
        setEmployees(data.employees);
      } catch (error) {
        console.error('Failed to load employees:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.leader_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Colaboradores</h2>
        <p className="text-sm text-text-tertiary mt-1">{employees.length} colaboradores cadastrados</p>
      </div>

      <input
        type="text"
        placeholder="Buscar por nome ou gestor..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input max-w-sm"
      />

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Gestor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Slack ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-text-primary">{emp.name}</td>
                  <td className="px-4 py-3 text-text-secondary">{emp.leader_name || '—'}</td>
                  <td className="px-4 py-3 text-text-muted font-mono text-xs">{emp.slack_id || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
