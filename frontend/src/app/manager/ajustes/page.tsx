'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getPendingPunchAdjustments, approvePunchAdjustment, rejectPunchAdjustment,
  getRecordsWithoutAdjustment, reinforcePunchAdjustmentAlert, forceReviewPunchAdjustment,
  type PunchAdjustmentFull, type RecordWithoutAdjustment,
} from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useManagerAuth } from '../ManagerAuthContext';

export default function ManagerAjustes() {
  const { manager } = useManagerAuth();

  // ── Pending punch adjustments (submitted by employee) ──
  const [adjustments, setAdjustments] = useState<PunchAdjustmentFull[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [correctedTimes, setCorrectedTimes] = useState<Record<number, {
    punch_1: string;
    punch_2: string;
    punch_3: string;
    punch_4: string;
  }>>({});

  // ── Records without adjustment (no submission yet) ──
  const [unadjusted, setUnadjusted] = useState<RecordWithoutAdjustment[]>([]);
  const [loadingUnadjusted, setLoadingUnadjusted] = useState(true);
  const [uComments, setUComments] = useState<Record<number, string>>({});
  const [uErrors, setUErrors] = useState<Record<number, string>>({});
  const [uActionLoading, setUActionLoading] = useState<number | null>(null);
  const [uCorrectedTimes, setUCorrectedTimes] = useState<Record<number, {
    punch_1: string;
    punch_2: string;
    punch_3: string;
    punch_4: string;
  }>>({});
  const [reinforcing, setReinforcing] = useState<Set<number>>(new Set());
  const [reinforced, setReinforced] = useState<Set<number>>(new Set());

  const loadAll = useCallback(async () => {
    if (!manager) return;
    setLoadingPending(true);
    setLoadingUnadjusted(true);
    try {
      const [pData, uData] = await Promise.all([
        getPendingPunchAdjustments(manager.id),
        getRecordsWithoutAdjustment(manager.id),
      ]);
      setAdjustments(pData.adjustments);
      const initialTimes: typeof correctedTimes = {};
      pData.adjustments.forEach(adj => {
        initialTimes[adj.id] = {
          punch_1: adj.current_punch_1 || '',
          punch_2: adj.current_punch_2 || '',
          punch_3: adj.current_punch_3 || '',
          punch_4: adj.current_punch_4 || '',
        };
      });
      setCorrectedTimes(initialTimes);

      setUnadjusted(uData.records);
      const initialUTimes: typeof uCorrectedTimes = {};
      uData.records.forEach(r => {
        initialUTimes[r.daily_record_id] = {
          punch_1: r.punch_1 || '',
          punch_2: r.punch_2 || '',
          punch_3: r.punch_3 || '',
          punch_4: r.punch_4 || '',
        };
      });
      setUCorrectedTimes(initialUTimes);
    } catch (error) {
      console.error('Failed to load ajustes:', error);
    } finally {
      setLoadingPending(false);
      setLoadingUnadjusted(false);
    }
  }, [manager]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Pending (submitted) handlers ──
  function handleCommentChange(id: number, value: string) {
    setComments(prev => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors(prev => ({ ...prev, [id]: '' }));
  }

  function handleTimeChange(id: number, field: 'punch_1' | 'punch_2' | 'punch_3' | 'punch_4', value: string) {
    setCorrectedTimes(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function handleApprove(id: number) {
    if (!manager) return;
    const times = correctedTimes[id];
    const comment = comments[id]?.trim() || '';
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
      setComments(prev => { const u = { ...prev }; delete u[id]; return u; });
      setCorrectedTimes(prev => { const u = { ...prev }; delete u[id]; return u; });
    } catch {
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
      setComments(prev => { const u = { ...prev }; delete u[id]; return u; });
    } catch {
      setErrors(prev => ({ ...prev, [id]: 'Erro ao rejeitar' }));
    } finally {
      setActionLoading(null);
    }
  }

  // ── Unadjusted (no submission yet) handlers ──
  function handleUCommentChange(recordId: number, value: string) {
    setUComments(prev => ({ ...prev, [recordId]: value }));
    if (uErrors[recordId]) setUErrors(prev => ({ ...prev, [recordId]: '' }));
  }

  function handleUTimeChange(recordId: number, field: 'punch_1' | 'punch_2' | 'punch_3' | 'punch_4', value: string) {
    setUCorrectedTimes(prev => ({ ...prev, [recordId]: { ...prev[recordId], [field]: value } }));
  }

  async function handleReinforce(recordId: number) {
    setReinforcing(prev => new Set(prev).add(recordId));
    try {
      await reinforcePunchAdjustmentAlert([recordId]);
      setReinforced(prev => new Set(prev).add(recordId));
    } catch {
      // silent — user can retry
    } finally {
      setReinforcing(prev => { const s = new Set(prev); s.delete(recordId); return s; });
    }
  }

  async function handleForceReview(rec: RecordWithoutAdjustment, action: 'approve' | 'reject') {
    if (!manager) return;
    const comment = uComments[rec.daily_record_id]?.trim();
    if (!comment) {
      setUErrors(prev => ({ ...prev, [rec.daily_record_id]: 'Comentario obrigatorio' }));
      return;
    }
    if (action === 'approve') {
      const t = uCorrectedTimes[rec.daily_record_id];
      const hasAny = t && (t.punch_1 || t.punch_2 || t.punch_3 || t.punch_4);
      if (!hasAny) {
        setUErrors(prev => ({ ...prev, [rec.daily_record_id]: 'Informe pelo menos um horario corrigido' }));
        return;
      }
    }
    setUActionLoading(rec.daily_record_id);
    try {
      const t = uCorrectedTimes[rec.daily_record_id];
      await forceReviewPunchAdjustment(
        rec.daily_record_id,
        action,
        manager.name,
        comment,
        rec.employee_id,
        action === 'approve' ? {
          corrected_punch_1: t?.punch_1 || null,
          corrected_punch_2: t?.punch_2 || null,
          corrected_punch_3: t?.punch_3 || null,
          corrected_punch_4: t?.punch_4 || null,
        } : undefined,
      );
      setUnadjusted(prev => prev.filter(r => r.daily_record_id !== rec.daily_record_id));
      setUComments(prev => { const u = { ...prev }; delete u[rec.daily_record_id]; return u; });
      setUCorrectedTimes(prev => { const u = { ...prev }; delete u[rec.daily_record_id]; return u; });
    } catch {
      setUErrors(prev => ({ ...prev, [rec.daily_record_id]: `Erro ao ${action === 'approve' ? 'aprovar' : 'reprovar'}` }));
    } finally {
      setUActionLoading(null);
    }
  }

  if (!manager) return null;

  const loading = loadingPending && loadingUnadjusted;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Ajustes de Ponto</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Revise e corrija os horarios de ponto da sua equipe
          </p>
        </div>
        <button onClick={loadAll} className="btn-secondary text-sm" disabled={loading}>
          Atualizar
        </button>
      </div>

      {/* ── Seção 1: Ajustes enviados pelo colaborador ── */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-text-primary">
          Ajustes Pendentes
          {adjustments.length > 0 && (
            <span className="ml-2 text-xs font-normal bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5">
              {adjustments.length}
            </span>
          )}
        </h3>

        {loadingPending ? (
          <p className="text-sm text-text-tertiary">Carregando...</p>
        ) : adjustments.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-text-tertiary text-sm">Nenhum ajuste de ponto pendente</p>
          </div>
        ) : (
          <div className="space-y-4">
            {adjustments.map((adj) => (
              <div key={adj.id} className="card animate-slide-up">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-text-primary font-medium">{adj.employee_name}</span>
                        <span className="badge bg-orange-500/10 text-orange-500">
                          {adj.type === 'missing_punch' ? 'Ponto Incompleto' : 'Entrada Tardia'}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-1">{formatDate(adj.date)}</p>
                    </div>
                  </div>

                  <div className="bg-bg-secondary rounded-md p-3 space-y-2">
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div><span className="text-text-muted text-xs">Entrada</span><p className="text-text-secondary">{adj.current_punch_1 || '-'}</p></div>
                      <div><span className="text-text-muted text-xs">Intervalo</span><p className="text-text-secondary">{adj.current_punch_2 || '-'}</p></div>
                      <div><span className="text-text-muted text-xs">Retorno</span><p className="text-text-secondary">{adj.current_punch_3 || '-'}</p></div>
                      <div><span className="text-text-muted text-xs">Saida</span><p className="text-text-secondary">{adj.current_punch_4 || '-'}</p></div>
                    </div>
                    {adj.missing_punches.length > 0 && (
                      <p className="text-sm text-orange-500">Pontos faltando: {adj.missing_punches.join(', ')}</p>
                    )}
                    <p className="text-sm text-text-secondary">
                      <span className="text-text-muted font-medium">Motivo do colaborador:</span> {adj.reason}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-2">Horarios Corrigidos</label>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Entrada</label>
                        <input type="time" value={correctedTimes[adj.id]?.punch_1 || ''} onChange={(e) => handleTimeChange(adj.id, 'punch_1', e.target.value)} className="input w-full text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Intervalo</label>
                        <input type="time" value={correctedTimes[adj.id]?.punch_2 || ''} onChange={(e) => handleTimeChange(adj.id, 'punch_2', e.target.value)} className="input w-full text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Retorno</label>
                        <input type="time" value={correctedTimes[adj.id]?.punch_3 || ''} onChange={(e) => handleTimeChange(adj.id, 'punch_3', e.target.value)} className="input w-full text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Saida</label>
                        <input type="time" value={correctedTimes[adj.id]?.punch_4 || ''} onChange={(e) => handleTimeChange(adj.id, 'punch_4', e.target.value)} className="input w-full text-sm" />
                      </div>
                    </div>
                  </div>

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
                    {errors[adj.id] && <p className="text-xs text-red-500 mt-1">{errors[adj.id]}</p>}
                  </div>

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
      </section>

      {/* ── Seção 2: Registros sem ajuste enviado ── */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-text-primary">
          Registros sem Ajuste
          {unadjusted.length > 0 && (
            <span className="ml-2 text-xs font-normal bg-red-100 text-red-700 rounded-full px-2 py-0.5">
              {unadjusted.length}
            </span>
          )}
        </h3>
        <p className="text-xs text-text-tertiary -mt-2">Últimos 30 dias · colaboradores que esqueceram de bater ponto e ainda não solicitaram ajuste</p>

        {loadingUnadjusted ? (
          <p className="text-sm text-text-tertiary">Carregando...</p>
        ) : unadjusted.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-text-tertiary text-sm">Nenhum registro pendente de ajuste</p>
          </div>
        ) : (
          <div className="space-y-4">
            {unadjusted.map((r) => (
              <div key={r.daily_record_id} className="card animate-slide-up border-l-4 border-l-orange-400">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-text-primary font-medium">{r.employee_name}</span>
                        <span className="badge bg-orange-500/10 text-orange-500">Ponto Incompleto</span>
                        <span className="text-xs text-orange-600 font-medium">Sem ajuste</span>
                      </div>
                      <p className="text-xs text-text-muted mt-1">{formatDate(r.date)}</p>
                    </div>
                  </div>

                  <div className="bg-bg-secondary rounded-md p-3 space-y-2">
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div><span className="text-text-muted text-xs">Entrada</span><p className="text-text-secondary">{r.punch_1 || '-'}</p></div>
                      <div><span className="text-text-muted text-xs">Intervalo</span><p className="text-text-secondary">{r.punch_2 || '-'}</p></div>
                      <div><span className="text-text-muted text-xs">Retorno</span><p className="text-text-secondary">{r.punch_3 || '-'}</p></div>
                      <div><span className="text-text-muted text-xs">Saida</span><p className="text-text-secondary">{r.punch_4 || '-'}</p></div>
                    </div>
                    {r.missing_punches.length > 0 && (
                      <p className="text-sm text-orange-500">Pontos faltando: {r.missing_punches.join(', ')}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-2">Horarios Corrigidos (necessário para aprovar)</label>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Entrada</label>
                        <input type="time" value={uCorrectedTimes[r.daily_record_id]?.punch_1 || ''} onChange={(e) => handleUTimeChange(r.daily_record_id, 'punch_1', e.target.value)} className="input w-full text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Intervalo</label>
                        <input type="time" value={uCorrectedTimes[r.daily_record_id]?.punch_2 || ''} onChange={(e) => handleUTimeChange(r.daily_record_id, 'punch_2', e.target.value)} className="input w-full text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Retorno</label>
                        <input type="time" value={uCorrectedTimes[r.daily_record_id]?.punch_3 || ''} onChange={(e) => handleUTimeChange(r.daily_record_id, 'punch_3', e.target.value)} className="input w-full text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">Saida</label>
                        <input type="time" value={uCorrectedTimes[r.daily_record_id]?.punch_4 || ''} onChange={(e) => handleUTimeChange(r.daily_record_id, 'punch_4', e.target.value)} className="input w-full text-sm" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">
                      Comentario do Gestor (obrigatorio para aprovar/reprovar)
                    </label>
                    <textarea
                      value={uComments[r.daily_record_id] || ''}
                      onChange={(e) => handleUCommentChange(r.daily_record_id, e.target.value)}
                      placeholder="Registre uma observacao antes de aprovar ou reprovar..."
                      className="input w-full text-sm"
                      rows={2}
                    />
                    {uErrors[r.daily_record_id] && (
                      <p className="text-xs text-red-500 mt-1">{uErrors[r.daily_record_id]}</p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 justify-end">
                    <button
                      onClick={() => handleReinforce(r.daily_record_id)}
                      disabled={reinforcing.has(r.daily_record_id)}
                      className="px-4 py-2 text-sm font-medium rounded-md bg-yellow-500 hover:bg-yellow-600 text-white transition-colors disabled:opacity-50"
                    >
                      {reinforcing.has(r.daily_record_id)
                        ? '...'
                        : reinforced.has(r.daily_record_id)
                        ? 'Alerta enviado!'
                        : 'Reforcar Alerta'}
                    </button>
                    <button
                      onClick={() => handleForceReview(r, 'approve')}
                      disabled={uActionLoading === r.daily_record_id}
                      className="px-4 py-2 text-sm font-medium rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
                    >
                      {uActionLoading === r.daily_record_id ? '...' : 'Aprovar'}
                    </button>
                    <button
                      onClick={() => handleForceReview(r, 'reject')}
                      disabled={uActionLoading === r.daily_record_id}
                      className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                    >
                      {uActionLoading === r.daily_record_id ? '...' : 'Reprovar'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
