'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getPendingJustifications, approveJustification, rejectJustification,
  getUnjustifiedRecords, forceReviewRecord, reinforceAlert,
  type JustificationFull, type UnjustifiedRecord,
} from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useManagerAuth } from '../ManagerAuthContext';

function formatMins(abs: number) {
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}h${m > 0 ? m + 'min' : ''}` : `${m}min`;
}

function PunchRow({ r }: { r: Pick<UnjustifiedRecord, 'punch_1' | 'punch_2' | 'punch_3' | 'punch_4' | 'difference_minutes' | 'type'> }) {
  return (
    <div className="bg-bg-secondary rounded-md p-3 space-y-2">
      {(r.punch_1 || r.punch_2 || r.punch_3 || r.punch_4) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {r.punch_1 && <span><span className="text-text-muted font-medium">Entrada:</span> {r.punch_1}</span>}
          {r.punch_2 && <span><span className="text-text-muted font-medium">Intervalo:</span> {r.punch_2}</span>}
          {r.punch_3 && <span><span className="text-text-muted font-medium">Retorno:</span> {r.punch_3}</span>}
          {r.punch_4 && <span><span className="text-text-muted font-medium">Saída:</span> {r.punch_4}</span>}
        </div>
      )}
      <p className="text-sm">
        <span className="text-text-muted font-medium">{r.type === 'late' ? 'Atraso:' : 'Hora extra:'}</span>{' '}
        <span className={r.type === 'late' ? 'text-red-500' : 'text-blue-500'}>
          {formatMins(Math.abs(r.difference_minutes))}
        </span>
      </p>
    </div>
  );
}

export default function ManagerJustifications() {
  const { manager } = useManagerAuth();

  // ── Pending justifications (submitted by employee) ──
  const [justifications, setJustifications] = useState<JustificationFull[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  // ── Unjustified records (no submission yet) ──
  const [unjustified, setUnjustified] = useState<UnjustifiedRecord[]>([]);
  const [loadingUnjustified, setLoadingUnjustified] = useState(true);
  const [uComments, setUComments] = useState<Record<number, string>>({});
  const [uErrors, setUErrors] = useState<Record<number, string>>({});
  const [uActionLoading, setUActionLoading] = useState<number | null>(null);
  const [reinforcing, setReinforcing] = useState<Set<number>>(new Set());
  const [reinforced, setReinforced] = useState<Set<number>>(new Set());

  const loadAll = useCallback(async () => {
    if (!manager) return;
    setLoadingPending(true);
    setLoadingUnjustified(true);
    try {
      const [pData, uData] = await Promise.all([
        getPendingJustifications(manager.id),
        getUnjustifiedRecords(manager.id),
      ]);
      setJustifications(pData.justifications);
      setUnjustified(uData.records);
    } catch (error) {
      console.error('Failed to load justifications:', error);
    } finally {
      setLoadingPending(false);
      setLoadingUnjustified(false);
    }
  }, [manager]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Pending handlers ──
  function handleCommentChange(id: number, value: string) {
    setComments(prev => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors(prev => ({ ...prev, [id]: '' }));
  }

  async function handleApprove(id: number) {
    if (!manager) return;
    const comment = comments[id]?.trim();
    if (!comment) { setErrors(prev => ({ ...prev, [id]: 'Comentario obrigatorio ao aprovar' })); return; }
    setActionLoading(id);
    try {
      await approveJustification(id, manager.name, comment);
      setJustifications(prev => prev.filter(j => j.id !== id));
      setComments(prev => { const u = { ...prev }; delete u[id]; return u; });
    } catch { setErrors(prev => ({ ...prev, [id]: 'Erro ao aprovar' })); }
    finally { setActionLoading(null); }
  }

  async function handleReject(id: number) {
    if (!manager) return;
    const comment = comments[id]?.trim();
    if (!comment) { setErrors(prev => ({ ...prev, [id]: 'Comentario obrigatorio ao reprovar' })); return; }
    setActionLoading(id);
    try {
      await rejectJustification(id, manager.name, comment);
      setJustifications(prev => prev.filter(j => j.id !== id));
      setComments(prev => { const u = { ...prev }; delete u[id]; return u; });
    } catch { setErrors(prev => ({ ...prev, [id]: 'Erro ao reprovar' })); }
    finally { setActionLoading(null); }
  }

  // ── Unjustified handlers ──
  function handleUCommentChange(recordId: number, value: string) {
    setUComments(prev => ({ ...prev, [recordId]: value }));
    if (uErrors[recordId]) setUErrors(prev => ({ ...prev, [recordId]: '' }));
  }

  async function handleForceReview(rec: UnjustifiedRecord, action: 'approve' | 'reject') {
    if (!manager) return;
    const comment = uComments[rec.daily_record_id]?.trim();
    if (!comment) {
      setUErrors(prev => ({ ...prev, [rec.daily_record_id]: 'Comentario obrigatorio' }));
      return;
    }
    setUActionLoading(rec.daily_record_id);
    try {
      await forceReviewRecord(rec.daily_record_id, action, manager.name, comment, rec.employee_id, rec.type);
      setUnjustified(prev => prev.filter(r => r.daily_record_id !== rec.daily_record_id));
      setUComments(prev => { const u = { ...prev }; delete u[rec.daily_record_id]; return u; });
    } catch {
      setUErrors(prev => ({ ...prev, [rec.daily_record_id]: `Erro ao ${action === 'approve' ? 'aprovar' : 'reprovar'}` }));
    } finally {
      setUActionLoading(null);
    }
  }

  async function handleReinforce(recordId: number) {
    setReinforcing(prev => new Set(prev).add(recordId));
    try {
      await reinforceAlert([recordId]);
      setReinforced(prev => new Set(prev).add(recordId));
    } catch {
      // silent — user can retry
    } finally {
      setReinforcing(prev => { const s = new Set(prev); s.delete(recordId); return s; });
    }
  }

  if (!manager) return null;

  const loading = loadingPending && loadingUnjustified;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Justificativas</h2>
          <p className="text-sm text-text-tertiary mt-1">Gerencie atrasos e horas extras da sua equipe</p>
        </div>
        <button onClick={loadAll} className="btn-secondary text-sm" disabled={loading}>
          Atualizar
        </button>
      </div>

      {/* ── Seção 1: Justificativas enviadas pelo colaborador ── */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-text-primary">
          Justificativas Pendentes
          {justifications.length > 0 && (
            <span className="ml-2 text-xs font-normal bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5">
              {justifications.length}
            </span>
          )}
        </h3>

        {loadingPending ? (
          <p className="text-sm text-text-tertiary">Carregando...</p>
        ) : justifications.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-text-tertiary text-sm">Nenhuma justificativa pendente</p>
          </div>
        ) : (
          <div className="space-y-4">
            {justifications.map((j) => (
              <div key={j.id} className="card animate-slide-up">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-text-primary font-medium">{j.employee_name}</span>
                        <span className={`badge ${j.type === 'late' ? 'badge-danger' : 'badge-info'}`}>
                          {j.type === 'late' ? 'Atraso' : 'Hora Extra'}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-1">{formatDate(j.date)}</p>
                    </div>
                  </div>

                  <PunchRow r={j as any} />

                  <div className="bg-bg-secondary rounded-md p-3">
                    <p className="text-sm text-text-secondary">
                      <span className="text-text-muted font-medium">Motivo:</span> {j.reason}
                    </p>
                    {j.custom_note && (
                      <p className="text-sm text-text-tertiary mt-1">
                        <span className="text-text-muted font-medium">Observacao:</span> {j.custom_note}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">
                      Comentario do Gestor (obrigatorio)
                    </label>
                    <textarea
                      value={comments[j.id] || ''}
                      onChange={(e) => handleCommentChange(j.id, e.target.value)}
                      placeholder="Explique o motivo da aprovacao ou reprovacao..."
                      className="input w-full text-sm"
                      rows={2}
                    />
                    {errors[j.id] && <p className="text-xs text-red-500 mt-1">{errors[j.id]}</p>}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 justify-end">
                    <button
                      onClick={() => handleApprove(j.id)}
                      disabled={actionLoading === j.id}
                      className="px-4 py-2 text-sm font-medium rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
                    >
                      {actionLoading === j.id ? '...' : 'Aprovar'}
                    </button>
                    <button
                      onClick={() => handleReject(j.id)}
                      disabled={actionLoading === j.id}
                      className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                    >
                      {actionLoading === j.id ? '...' : 'Reprovar'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Seção 2: Registros sem justificativa ── */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-text-primary">
          Registros sem Justificativa
          {unjustified.length > 0 && (
            <span className="ml-2 text-xs font-normal bg-red-100 text-red-700 rounded-full px-2 py-0.5">
              {unjustified.length}
            </span>
          )}
        </h3>
        <p className="text-xs text-text-tertiary -mt-2">Últimos 30 dias · colaboradores que ainda não justificaram</p>

        {loadingUnjustified ? (
          <p className="text-sm text-text-tertiary">Carregando...</p>
        ) : unjustified.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-text-tertiary text-sm">Nenhum registro pendente de justificativa</p>
          </div>
        ) : (
          <div className="space-y-4">
            {unjustified.map((r) => (
              <div key={r.daily_record_id} className="card animate-slide-up border-l-4 border-l-orange-400">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-text-primary font-medium">{r.employee_name}</span>
                        <span className={`badge ${r.type === 'late' ? 'badge-danger' : 'badge-info'}`}>
                          {r.type === 'late' ? 'Atraso' : 'Hora Extra'}
                        </span>
                        <span className="text-xs text-orange-600 font-medium">Sem justificativa</span>
                      </div>
                      <p className="text-xs text-text-muted mt-1">{formatDate(r.date)}</p>
                    </div>
                  </div>

                  <PunchRow r={r} />

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
