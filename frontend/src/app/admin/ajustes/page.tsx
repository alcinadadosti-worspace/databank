'use client';

import { useState, useEffect } from 'react';
import { getReviewedJustifications, type JustificationFull } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';

export default function AdminAjustes() {
  const [justifications, setJustifications] = useState<JustificationFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUnit, setFilterUnit] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  async function loadJustifications() {
    setLoading(true);
    try {
      const data = await getReviewedJustifications();
      setJustifications(data.justifications);
    } catch (error) {
      console.error('Failed to load justifications:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJustifications();
  }, []);

  // Get unique units for filter
  const units = [...new Set(justifications.map(j => j.unit_name || 'Outro'))].sort();

  // Filter justifications
  const filtered = justifications.filter(j => {
    if (filterUnit !== 'all' && j.unit_name !== filterUnit) return false;
    if (filterStatus !== 'all' && j.status !== filterStatus) return false;
    return true;
  });

  // Group by unit
  const groupedByUnit = filtered.reduce((acc, j) => {
    const unit = j.unit_name || 'Outro';
    if (!acc[unit]) acc[unit] = [];
    acc[unit].push(j);
    return acc;
  }, {} as Record<string, JustificationFull[]>);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Ajustes</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Justificativas revisadas pelos gestores
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={filterUnit}
            onChange={(e) => setFilterUnit(e.target.value)}
            className="input text-sm"
          >
            <option value="all">Todas as Unidades</option>
            {units.map(unit => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input text-sm"
          >
            <option value="all">Todos os Status</option>
            <option value="approved">Aprovadas</option>
            <option value="rejected">Reprovadas</option>
          </select>
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
        <div className="space-y-6">
          {Object.entries(groupedByUnit).sort(([a], [b]) => a.localeCompare(b)).map(([unit, items]) => (
            <div key={unit} className="space-y-3">
              {/* Unit Header */}
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-text-primary">{unit}</h3>
                <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-full">
                  {items.length} justificativa{items.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Justifications */}
              <div className="space-y-2">
                {items.map((j) => (
                  <div key={j.id} className="card">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      {/* Left side - Employee info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-text-primary font-medium">{j.employee_name}</span>
                          <span className={`badge ${j.type === 'late' ? 'badge-danger' : 'badge-info'}`}>
                            {j.type === 'late' ? 'Atraso' : 'Hora Extra'}
                          </span>
                          <span className={`badge ${j.status === 'approved' ? 'badge-success' : 'badge-danger'}`}>
                            {j.status === 'approved' ? 'Aprovada' : 'Reprovada'}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-1">
                          {formatDate(j.date)} | Gestor: {j.leader_name}
                        </p>

                        {/* Employee justification */}
                        <div className="mt-3 bg-bg-secondary rounded-md p-3">
                          <p className="text-xs font-medium text-text-muted mb-1">Justificativa do Colaborador:</p>
                          <p className="text-sm text-text-secondary">{j.reason}</p>
                          {j.custom_note && (
                            <p className="text-sm text-text-tertiary mt-1 italic">{j.custom_note}</p>
                          )}
                        </div>

                        {/* Manager comment */}
                        {j.manager_comment && (
                          <div className="mt-2 bg-bg-tertiary rounded-md p-3 border-l-2 border-accent-primary">
                            <p className="text-xs font-medium text-text-muted mb-1">Comentario do Gestor:</p>
                            <p className="text-sm text-text-secondary">{j.manager_comment}</p>
                          </div>
                        )}
                      </div>

                      {/* Right side - Review info */}
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-text-muted">Revisado por:</p>
                        <p className="text-sm text-text-secondary font-medium">{j.reviewed_by}</p>
                        {j.reviewed_at && (
                          <p className="text-xs text-text-tertiary mt-1">
                            {formatDateTime(j.reviewed_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
