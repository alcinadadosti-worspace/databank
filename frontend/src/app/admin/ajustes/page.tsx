'use client';

import { useState, useEffect } from 'react';
import { getReviewedJustifications, type JustificationFull } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';

export default function AdminAjustes() {
  const [justifications, setJustifications] = useState<JustificationFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set());

  async function loadJustifications() {
    setLoading(true);
    try {
      const data = await getReviewedJustifications();
      setJustifications(data.justifications);
      // Expand all managers by default
      const managers = new Set(data.justifications.map(j => j.leader_name || 'Sem Gestor'));
      setExpandedManagers(managers);
    } catch (error) {
      console.error('Failed to load justifications:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJustifications();
  }, []);

  // Filter justifications
  const filtered = justifications.filter(j => {
    if (filterStatus !== 'all' && j.status !== filterStatus) return false;
    return true;
  });

  // Group by manager, then by employee
  const groupedByManager = filtered.reduce((acc, j) => {
    const manager = j.leader_name || 'Sem Gestor';
    if (!acc[manager]) acc[manager] = {};

    const employee = j.employee_name;
    if (!acc[manager][employee]) acc[manager][employee] = [];
    acc[manager][employee].push(j);

    return acc;
  }, {} as Record<string, Record<string, JustificationFull[]>>);

  function toggleManager(manager: string) {
    const newExpanded = new Set(expandedManagers);
    if (newExpanded.has(manager)) {
      newExpanded.delete(manager);
    } else {
      newExpanded.add(manager);
    }
    setExpandedManagers(newExpanded);
  }

  function expandAll() {
    setExpandedManagers(new Set(Object.keys(groupedByManager)));
  }

  function collapseAll() {
    setExpandedManagers(new Set());
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Ajustes</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Justificativas revisadas pelos gestores
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input text-sm"
          >
            <option value="all">Todos os Status</option>
            <option value="approved">Aprovadas</option>
            <option value="rejected">Reprovadas</option>
          </select>
          <button onClick={expandAll} className="btn-secondary text-xs px-2 py-1">
            Expandir
          </button>
          <button onClick={collapseAll} className="btn-secondary text-xs px-2 py-1">
            Recolher
          </button>
          <button
            onClick={loadJustifications}
            className="btn-secondary text-sm"
            disabled={loading}
          >
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-text-tertiary text-sm">Nenhuma justificativa revisada encontrada</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByManager).sort(([a], [b]) => a.localeCompare(b)).map(([manager, employees]) => {
            const isExpanded = expandedManagers.has(manager);
            const totalForManager = Object.values(employees).flat().length;
            const approvedCount = Object.values(employees).flat().filter(j => j.status === 'approved').length;
            const rejectedCount = Object.values(employees).flat().filter(j => j.status === 'rejected').length;

            return (
              <div key={manager} className="card p-0 overflow-hidden">
                {/* Manager Header */}
                <button
                  onClick={() => toggleManager(manager)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-bg-secondary hover:bg-bg-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <span className="font-semibold text-text-primary">{manager}</span>
                    <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-full">
                      {Object.keys(employees).length} colaborador{Object.keys(employees).length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-green-500">{approvedCount} ✓</span>
                    <span className="text-red-500">{rejectedCount} ✗</span>
                    <span className="text-text-muted">{totalForManager} total</span>
                  </div>
                </button>

                {/* Employees under this manager */}
                {isExpanded && (
                  <div className="divide-y divide-border-subtle">
                    {Object.entries(employees).sort(([a], [b]) => a.localeCompare(b)).map(([employee, items]) => (
                      <div key={employee} className="px-4 py-3">
                        {/* Employee name */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-text-primary">{employee}</span>
                          <span className="text-xs text-text-muted">
                            ({items.length} justificativa{items.length !== 1 ? 's' : ''})
                          </span>
                        </div>

                        {/* Justifications list - compact */}
                        <div className="space-y-2 pl-3 border-l-2 border-border-subtle">
                          {items.map((j) => (
                            <div key={j.id} className="flex items-start gap-3 text-sm">
                              {/* Status indicator */}
                              <span className={`flex-shrink-0 mt-0.5 ${j.status === 'approved' ? 'text-green-500' : 'text-red-500'}`}>
                                {j.status === 'approved' ? '✓' : '✗'}
                              </span>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-text-muted font-mono">{formatDate(j.date)}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${j.type === 'late' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                    {j.type === 'late' ? 'Atraso' : 'H.Extra'}
                                  </span>
                                </div>
                                <p className="text-text-secondary mt-0.5">{j.reason}</p>
                                {j.custom_note && (
                                  <p className="text-text-tertiary text-xs italic mt-0.5">{j.custom_note}</p>
                                )}
                                {j.manager_comment && (
                                  <p className="text-xs text-accent-primary mt-1">
                                    <span className="font-medium">Gestor:</span> {j.manager_comment}
                                  </p>
                                )}
                              </div>

                              {/* Review info */}
                              <div className="flex-shrink-0 text-right text-xs text-text-muted">
                                {j.reviewed_at && (
                                  <span>{formatDateTime(j.reviewed_at)}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary stats */}
      {!loading && filtered.length > 0 && (
        <div className="card bg-bg-secondary">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Total:</span>
            <div className="flex items-center gap-4">
              <span className="text-green-500">
                {filtered.filter(j => j.status === 'approved').length} aprovadas
              </span>
              <span className="text-red-500">
                {filtered.filter(j => j.status === 'rejected').length} reprovadas
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
