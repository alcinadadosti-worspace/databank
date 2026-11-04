'use client';

import { useCallback, useEffect, useState } from 'react';
import { getEmployees, getLeaders, type Employee } from '@/lib/api';
import SolidesImportModal from '@/components/SolidesImportModal';
import RemoveEmployeeModal from '@/components/RemoveEmployeeModal';
import SolidesPendencias from '@/components/SolidesPendencias';

export default function AdminEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [selectedSector, setSelectedSector] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // undefined = closed; '' = open with search; an id = open on that Sólides person
  const [importing, setImporting] = useState<string | undefined>(undefined);
  const [removing, setRemoving] = useState<{ id: number; name: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [pendenciasKey, setPendenciasKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const [empData, leaderData] = await Promise.all([
        getEmployees(),
        getLeaders(),
      ]);
      setEmployees(empData.employees);
      setSectors(leaderData.sectors || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function afterChange(message: string) {
    setImporting(undefined);
    setRemoving(null);
    setNotice(message);
    setPendenciasKey(k => k + 1); // the pendências changed: ask to verify again
    load();
  }

  const filtered = employees.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.leader_name || '').toLowerCase().includes(search.toLowerCase());
    const matchSector = !selectedSector || e.sector === selectedSector;
    return matchSearch && matchSector;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Colaboradores</h2>
          <p className="text-sm text-text-tertiary mt-1">
            {filtered.length} de {employees.length} colaboradores
            {selectedSector && ` no setor ${selectedSector}`}
          </p>
        </div>
        <button type="button" onClick={() => { setNotice(''); setImporting(''); }} className="btn-primary px-4 py-2 text-sm">
          Importar da Sólides
        </button>
      </div>

      {notice && (
        <div className="card-elevated p-3 flex items-start justify-between gap-3">
          <p className="text-sm text-green-500">{notice}</p>
          <button type="button" onClick={() => setNotice('')} className="text-xs text-text-muted hover:text-text-secondary">Fechar</button>
        </div>
      )}

      <SolidesPendencias
        key={pendenciasKey}
        onImport={id => { setNotice(''); setImporting(id); }}
        onRemove={e => { setNotice(''); setRemoving(e); }}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar por nome ou gestor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input max-w-sm"
        />
        <select
          value={selectedSector}
          onChange={(e) => setSelectedSector(e.target.value)}
          className="input max-w-xs"
        >
          <option value="">Todos os setores</option>
          {sectors.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : (
        <>
          {/* Mobile Cards View */}
          <div className="lg:hidden space-y-3">
            {filtered.map((emp) => (
              <div key={emp.id} className="card p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-text-primary">{emp.name}</p>
                  <button
                    type="button"
                    onClick={() => { setNotice(''); setRemoving({ id: emp.id, name: emp.name }); }}
                    className="text-xs text-red-500 hover:text-red-600 shrink-0"
                  >
                    Remover
                  </button>
                </div>
                <p className="text-xs text-text-secondary">Gestor: {emp.leader_name || '—'}</p>
                <p className="text-xs text-text-muted">Setor: {emp.sector || '—'}</p>
                {emp.slack_id && (
                  <p className="text-xs text-text-muted font-mono">Slack: {emp.slack_id}</p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Gestor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Setor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Slack ID</th>
                  <th className="px-4 py-3"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3 text-text-primary">{emp.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{emp.leader_name || '—'}</td>
                    <td className="px-4 py-3 text-text-muted text-xs">{emp.sector || '—'}</td>
                    <td className="px-4 py-3 text-text-muted font-mono text-xs">{emp.slack_id || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => { setNotice(''); setRemoving({ id: emp.id, name: emp.name }); }}
                        className="text-xs text-red-500 hover:text-red-600"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {importing !== undefined && (
        <SolidesImportModal
          initialSolidesId={importing || undefined}
          onClose={() => setImporting(undefined)}
          onSaved={afterChange}
        />
      )}
      {removing && (
        <RemoveEmployeeModal
          employee={removing}
          onClose={() => setRemoving(null)}
          onRemoved={afterChange}
        />
      )}
    </div>
  );
}
