'use client';

import { useState, useEffect } from 'react';
import { getPendingPunchAdjustments, approvePunchAdjustment, rejectPunchAdjustment, type PunchAdjustmentFull } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useManagerAuth } from '../ManagerAuthContext';

export default function ManagerAjustes() {
  const { manager } = useManagerAuth();
  const [adjustments, setAdjustments] = useState<PunchAdjustmentFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [correctedTimes, setCorrectedTimes] = useState<Record<number, {
    punch_1: string;
    punch_2: string;
    punch_3: string;
    punch_4: string;
  }>>({});

  async function loadAdjustments() {
    if (!manager) return;
    setLoading(true);
    try {
      const data = await getPendingPunchAdjustments(manager.id);
      setAdjustments(data.adjustments);

      // Initialize corrected times with current values
      const initialTimes: typeof correctedTimes = {};
      data.adjustments.forEach(adj => {
        initialTimes[adj.id] = {
          punch_1: adj.current_punch_1 || '',
          punch_2: adj.current_punch_2 || '',
          punch_3: adj.current_punch_3 || '',
          punch_4: adj.current_punch_4 || '',
        };
      });
      setCorrectedTimes(initialTimes);
    } catch (error) {
      console.error('Failed to load adjustments:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdjustments();
  }, [manager]);

  function handleCommentChange(id: number, value: string) {
    setComments(prev => ({ ...prev, [id]: value }));
    if (errors[id]) {
      setErrors(prev => ({ ...prev, [id]: '' }));
    }
  }

  function handleTimeChange(id: number, field: 'punch_1' | 'punch_2' | 'punch_3' | 'punch_4', value: string) {
    setCorrectedTimes(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  }

  async function handleApprove(id: number) {
    if (!manager) return;

    const times = correctedTimes[id];
    const comment = comments[id]?.trim() || '';

    // Check if at least one time is provided
    const hasTimes = times && (times.punch_1 || times.punch_2 || times.punch_3 || times.punch_4);
    if (!hasTimes) {
      setErrors(prev => ({ ...prev, [id]: 'Informe pelo menos um horario corrigido' }));
      return;
    }

    setActionLoading(id);
    try {
      await approvePunchAdjustment(id, manager.name, comment, {
        corrected_punch_1: times.punch_1 || null,
        corrected_punch_2: times.punch_2 || null,
        corrected_punch_3: times.punch_3 || null,
        corrected_punch_4: times.punch_4 || null,
      });
      setAdjustments(prev => prev.filter(a => a.id !== id));
      setComments(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      setCorrectedTimes(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
    } catch (error) {
      console.error('Failed to approve:', error);
      setErrors(prev => ({ ...prev, [id]: 'Erro ao aprovar' }));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: number) {
    if (!manager) return;

    const comment = comments[id]?.trim();
    if (!comment) {
      setErrors(prev => ({ ...prev, [id]: 'Comentario obrigatorio ao rejeitar' }));
      return;
    }

    setActionLoading(id);
    try {
      await rejectPunchAdjustment(id, manager.name, comment);
      setAdjustments(prev => prev.filter(a => a.id !== id));
      setComments(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
    } catch (error) {
      console.error('Failed to reject:', error);
      setErrors(prev => ({ ...prev, [id]: 'Erro ao rejeitar' }));
    } finally {
      setActionLoading(null);
    }
  }

  if (!manager) {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Ajustes de Ponto Pendentes</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Revise e corrija os horarios de ponto da sua equipe
          </p>
        </div>
        <button
          onClick={loadAdjustments}
          className="btn-secondary text-sm"
          disabled={loading}
        >
          Atualizar
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : adjustments.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-text-tertiary text-sm">Nenhum ajuste de ponto pendente</p>
        </div>
      ) : (
        <div className="space-y-4">
          {adjustments.map((adj) => (
            <div key={adj.id} className="card animate-slide-up">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-text-primary font-medium">{adj.employee_name}</span>
                      <span className="badge bg-orange-500/10 text-orange-500">
                        {adj.type === 'missing_punch' ? 'Ponto Incompleto' : 'Entrada Tardia'}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {formatDate(adj.date)}
                    </p>
                  </div>
                </div>

                {/* Current punches and missing info */}
                <div className="bg-bg-secondary rounded-md p-3 space-y-2">
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <span className="text-text-muted text-xs">Entrada</span>
                      <p className="text-text-secondary">{adj.current_punch_1 || '-'}</p>
                    </div>
                    <div>
                      <span className="text-text-muted text-xs">Intervalo</span>
                      <p className="text-text-secondary">{adj.current_punch_2 || '-'}</p>
                    </div>
                    <div>
                      <span className="text-text-muted text-xs">Retorno</span>
                      <p className="text-text-secondary">{adj.current_punch_3 || '-'}</p>
                    </div>
                    <div>
                      <span className="text-text-muted text-xs">Saida</span>
                      <p className="text-text-secondary">{adj.current_punch_4 || '-'}</p>
                    </div>
                  </div>

                  {adj.missing_punches.length > 0 && (
                    <p className="text-sm text-orange-500">
                      Pontos faltando: {adj.missing_punches.join(', ')}
                    </p>
                  )}

                  <p className="text-sm text-text-secondary">
                    <span className="text-text-muted font-medium">Motivo do colaborador:</span> {adj.reason}
                  </p>
                </div>

                {/* Corrected times input */}
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-2">
                    Horarios Corrigidos
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-xs text-text-tertiary mb-1">Entrada</label>
                      <input
                        type="time"
                        value={correctedTimes[adj.id]?.punch_1 || ''}
                        onChange={(e) => handleTimeChange(adj.id, 'punch_1', e.target.value)}
                        className="input w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-tertiary mb-1">Intervalo</label>
                      <input
                        type="time"
                        value={correctedTimes[adj.id]?.punch_2 || ''}
                        onChange={(e) => handleTimeChange(adj.id, 'punch_2', e.target.value)}
                        className="input w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-tertiary mb-1">Retorno</label>
                      <input
                        type="time"
                        value={correctedTimes[adj.id]?.punch_3 || ''}
                        onChange={(e) => handleTimeChange(adj.id, 'punch_3', e.target.value)}
                        className="input w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-tertiary mb-1">Saida</label>
                      <input
                        type="time"
                        value={correctedTimes[adj.id]?.punch_4 || ''}
                        onChange={(e) => handleTimeChange(adj.id, 'punch_4', e.target.value)}
                        className="input w-full text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Comment input */}
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">
                    Comentario do Gestor (opcional para aprovar, obrigatorio para rejeitar)
                  </label>
                  <textarea
                    value={comments[adj.id] || ''}
                    onChange={(e) => handleCommentChange(adj.id, e.target.value)}
                    placeholder="Observacoes sobre o ajuste..."
                    className="input w-full text-sm"
                    rows={2}
                  />
                  {errors[adj.id] && (
                    <p className="text-xs text-red-500 mt-1">{errors[adj.id]}</p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => handleApprove(adj.id)}
                    disabled={actionLoading === adj.id}
                    className="px-4 py-2 text-sm font-medium rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
                  >
                    {actionLoading === adj.id ? '...' : 'Aprovar'}
                  </button>
                  <button
                    onClick={() => handleReject(adj.id)}
                    disabled={actionLoading === adj.id}
                    className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                  >
                    {actionLoading === adj.id ? '...' : 'Rejeitar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
