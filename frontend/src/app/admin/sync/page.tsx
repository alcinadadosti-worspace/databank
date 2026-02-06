'use client';

import { useState } from 'react';
import { syncPunchesRange, SyncRangeResult } from '@/lib/api';
import { daysAgo, todayISO } from '@/lib/utils';

export default function AdminSync() {
  const [start, setStart] = useState(daysAgo(7));
  const [end, setEnd] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncRangeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await syncPunchesRange(start, end);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Sincronizar Pontos</h2>
        <p className="text-sm text-text-tertiary mt-1">Sincronizar registros de ponto da Solides Tangerino para um período específico</p>
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
        <p className="text-2xs text-text-muted">Máximo de 90 dias por sincronização</p>
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

      {result && (
        <div className="card max-w-md space-y-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${result.success ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <p className="text-sm font-medium text-text-primary">{result.message}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-text-muted text-xs">Período</p>
              <p className="text-text-secondary">{result.details.startDate} a {result.details.endDate}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Total de dias</p>
              <p className="text-text-secondary">{result.details.totalDays}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Sincronizados</p>
              <p className="text-green-400">{result.details.synced}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs">Erros</p>
              <p className={result.details.errors > 0 ? 'text-red-400' : 'text-text-secondary'}>{result.details.errors}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
