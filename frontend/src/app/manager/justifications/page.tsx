'use client';

import { useState, useEffect } from 'react';
import { getPendingJustifications, approveJustification, rejectJustification, uploadJustificationAtestado, type JustificationFull } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useManagerAuth } from '../ManagerAuthContext';

export default function ManagerJustifications() {
  const { manager } = useManagerAuth();
  const [justifications, setJustifications] = useState<JustificationFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [uploadingAtestado, setUploadingAtestado] = useState<number | null>(null);
  const [atestadoErrors, setAtestadoErrors] = useState<Record<number, string>>({});

  async function loadJustifications() {
    if (!manager) return;
    setLoading(true);
    try {
      const data = await getPendingJustifications(manager.id);
      setJustifications(data.justifications);
    } catch (error) {
      console.error('Failed to load justifications:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJustifications();
  }, [manager]);

  function handleCommentChange(id: number, value: string) {
    setComments(prev => ({ ...prev, [id]: value }));
    // Clear error when user starts typing
    if (errors[id]) {
      setErrors(prev => ({ ...prev, [id]: '' }));
    }
  }

  async function handleApprove(id: number) {
    if (!manager) return;

    const comment = comments[id]?.trim();
    if (!comment) {
      setErrors(prev => ({ ...prev, [id]: 'Comentario obrigatorio ao aprovar' }));
      return;
    }

    setActionLoading(id);
    try {
      await approveJustification(id, manager.name, comment);
      setJustifications(prev => prev.filter(j => j.id !== id));
      setComments(prev => {
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

  async function handleAtestadoUpload(id: number, file: File) {
    setUploadingAtestado(id);
    setAtestadoErrors(prev => ({ ...prev, [id]: '' }));
    try {
      const result = await uploadJustificationAtestado(id, file);
      setJustifications(prev => prev.map(j =>
        j.id === id ? { ...j, attachment_url: result.attachment_url, attachment_name: result.attachment_name } : j
      ));
    } catch (err: any) {
      setAtestadoErrors(prev => ({ ...prev, [id]: err.message || 'Erro ao enviar atestado' }));
    } finally {
      setUploadingAtestado(null);
    }
  }

  async function handleReject(id: number) {
    if (!manager) return;

    const comment = comments[id]?.trim();
    if (!comment) {
      setErrors(prev => ({ ...prev, [id]: 'Comentario obrigatorio ao reprovar' }));
      return;
    }

    setActionLoading(id);
    try {
      await rejectJustification(id, manager.name, comment);
      setJustifications(prev => prev.filter(j => j.id !== id));
      setComments(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
    } catch (error) {
      console.error('Failed to reject:', error);
      setErrors(prev => ({ ...prev, [id]: 'Erro ao reprovar' }));
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
          <h2 className="text-lg font-semibold text-text-primary">Justificativas Pendentes</h2>
          <p className="text-sm text-text-tertiary mt-1">Aprove ou rejeite as justificativas da sua equipe</p>
        </div>
        <button
          onClick={loadJustifications}
          className="btn-secondary text-sm"
          disabled={loading}
        >
          Atualizar
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : justifications.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-text-tertiary text-sm">Nenhuma justificativa pendente</p>
        </div>
      ) : (
        <div className="space-y-4">
          {justifications.map((j) => (
            <div key={j.id} className="card animate-slide-up">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-text-primary font-medium">{j.employee_name}</span>
                      <span className={`badge ${j.type === 'late' ? 'badge-danger' : 'badge-info'}`}>
                        {j.type === 'late' ? 'Atraso' : 'Hora Extra'}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {formatDate(j.date)}
                    </p>
                  </div>
                </div>

                {/* Justification details */}
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

                {/* Atestado attachment */}
                {j.reason === 'Atestado Médico' && (
                  <div className="bg-bg-secondary rounded-md p-3 space-y-2">
                    <p className="text-xs font-medium text-text-muted">Atestado Médico</p>
                    {j.attachment_url ? (
                      <a
                        href={j.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-accent-primary hover:underline"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        {j.attachment_name || 'Ver atestado'}
                      </a>
                    ) : (
                      <div>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-accent-primary hover:underline">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          {uploadingAtestado === j.id ? 'Enviando...' : 'Anexar atestado (PDF, JPG, PNG)'}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            disabled={uploadingAtestado === j.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleAtestadoUpload(j.id, file);
                            }}
                          />
                        </label>
                        {atestadoErrors[j.id] && (
                          <p className="text-xs text-red-500 mt-1">{atestadoErrors[j.id]}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Comment input */}
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
                  {errors[j.id] && (
                    <p className="text-xs text-red-500 mt-1">{errors[j.id]}</p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 justify-end">
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
    </div>
  );
}
