'use client';

import { useState, useEffect, useRef } from 'react';
import { getReports, uploadReport, deleteReport, type Report } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminRelatorios() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Upload form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadReports() {
    try {
      const data = await getReports();
      setReports(data.reports);
    } catch (err) {
      console.error('Failed to load reports:', err);
      setError('Falha ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Selecione um arquivo PDF');
      return;
    }

    if (!title.trim()) {
      setError('Digite um título para o relatório');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('weekStart', weekStart);
      formData.append('weekEnd', weekEnd);

      const result = await uploadReport(formData);
      setReports(prev => [result.report, ...prev]);
      setSuccess('Relatório enviado com sucesso!');

      // Reset form
      setTitle('');
      setDescription('');
      setWeekStart('');
      setWeekEnd('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar relatório');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Tem certeza que deseja excluir este relatório?')) return;

    setDeleting(id);
    setError('');

    try {
      await deleteReport(id);
      setReports(prev => prev.filter(r => r.id !== id));
      setSuccess('Relatório excluído');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Relatorios Semanais</h2>
        <p className="text-sm text-text-tertiary mt-1">
          Envie relatorios em PDF para disponibilizar aos gestores
        </p>
      </div>

      {/* Upload Form */}
      <div className="card">
        <h3 className="text-sm font-medium text-text-primary mb-4">Enviar Novo Relatorio</h3>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-tertiary mb-1">
                Titulo *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Relatorio Semanal - Semana 07"
                className="input w-full"
                disabled={uploading}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-tertiary mb-1">
                Arquivo PDF *
              </label>
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,application/pdf"
                className="input w-full text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-accent-primary file:text-white hover:file:bg-accent-primary/90"
                disabled={uploading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-tertiary mb-1">
                Semana Inicio
              </label>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="input w-full"
                disabled={uploading}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-tertiary mb-1">
                Semana Fim
              </label>
              <input
                type="date"
                value={weekEnd}
                onChange={(e) => setWeekEnd(e.target.value)}
                className="input w-full"
                disabled={uploading}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-tertiary mb-1">
                Descricao (opcional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Observacoes..."
                className="input w-full"
                disabled={uploading}
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-status-danger bg-status-danger/10 px-3 py-2 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-status-success bg-status-success/10 px-3 py-2 rounded">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={uploading}
            className="btn-primary px-4 py-2 flex items-center gap-2"
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Enviando...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Enviar Relatorio
              </>
            )}
          </button>
        </form>
      </div>

      {/* Reports List */}
      <div className="card">
        <h3 className="text-sm font-medium text-text-primary mb-4">
          Relatorios Disponiveis ({reports.length})
        </h3>

        {loading ? (
          <p className="text-sm text-text-tertiary">Carregando...</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhum relatorio enviado ainda</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {reports.map((report) => (
              <div key={report.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 flex-shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-text-primary truncate">
                        {report.title}
                      </p>
                      <p className="text-xs text-text-muted">
                        {report.weekStart && report.weekEnd
                          ? `${report.weekStart} a ${report.weekEnd}`
                          : formatDateTime(report.uploadedAt)}
                        {' · '}{formatFileSize(report.fileSize)}
                      </p>
                    </div>
                  </div>
                  {report.description && (
                    <p className="text-xs text-text-tertiary mt-1 ml-7">
                      {report.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={report.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Baixar
                  </a>
                  <button
                    onClick={() => handleDelete(report.id)}
                    disabled={deleting === report.id}
                    className="text-status-danger hover:text-status-danger/80 p-1.5"
                    title="Excluir"
                  >
                    {deleting === report.id ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
