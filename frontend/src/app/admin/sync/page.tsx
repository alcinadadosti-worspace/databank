'use client';

import { useState, useEffect, useRef } from 'react';
import { syncPunchesRange, getSyncStatus, SyncStatus } from '@/lib/api';
import { daysAgo, todayISO } from '@/lib/utils';

export default function AdminSync() {
  const [start, setStart] = useState(daysAgo(30));
  const [end, setEnd] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for status updates
  useEffect(() => {
    if (!jobId) return;

    async function pollStatus() {
      try {
        const data = await getSyncStatus(jobId!);
        setStatus(data);

        if (data.status === 'completed' || data.status === 'error') {
          // Stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to get status:', err);
      }
    }

    // Poll every 2 seconds
    pollStatus();
    pollingRef.current = setInterval(pollStatus, 2000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [jobId]);

  async function handleSync() {
    setLoading(true);
    setStatus(null);
    setError(null);
    setJobId(null);

    try {
      const data = await syncPunchesRange(start, end);
      setJobId(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar sincronizacao');
      setLoading(false);
    }
  }

  const progress = status ? Math.round((status.synced / status.totalDays) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Sincronizar Pontos</h2>
        <p className="text-sm text-text-tertiary mt-1">Sincronizar registros de ponto da Solides Tangerino para um periodo especifico</p>
      </div>

      <div className="card max-w-md space-y-4">
        <div>
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider">Data Inicial</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="input mt-1"
            disabled={loading}
          />
        </div>
        <div>
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider">Data Final</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="input mt-1"
            disabled={loading}
          />
        </div>
        <p className="text-2xs text-text-muted">Maximo de 90 dias por sincronizacao</p>
        <button
          onClick={handleSync}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Sincronizando...' : 'Sincronizar Pontos'}
        </button>
      </div>

      {error && (
        <div className="card max-w-md bg-red-500/10 border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {status && (
        <div className="card max-w-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {status.status === 'running' && (
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              )}
              {status.status === 'completed' && (
                <div className="w-2 h-2 rounded-full bg-green-500" />
              )}
              {status.status === 'error' && (
                <div className="w-2 h-2 rounded-full bg-red-500" />
              )}
              <p className="text-sm font-medium text-text-primary">
                {status.status === 'running' && 'Sincronizando...'}
                {status.status === 'completed' && 'Sincronizacao concluida!'}
                {status.status === 'error' && 'Erro na sincronizacao'}
              </p>
            </div>
            <span className="text-sm text-text-secondary">{progress}%</span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-bg-tertiary rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {status.status === 'running' && status.currentDate && (
            <p className="text-xs text-text-muted">
              Sincronizando: {status.currentDate}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-text-muted text-xs">Periodo</p>
              <p className="text-text-secondary">{status.startDate} a {status.endDate}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Total de dias</p>
              <p className="text-text-secondary">{status.totalDays}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Sincronizados</p>
              <p className="text-green-400">{status.synced}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Erros</p>
              <p className={status.errors > 0 ? 'text-red-400' : 'text-text-secondary'}>{status.errors}</p>
            </div>
          </div>

          {status.status === 'completed' && (
            <p className="text-xs text-text-muted">
              Concluido em {new Date(status.completedAt!).toLocaleTimeString('pt-BR')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
