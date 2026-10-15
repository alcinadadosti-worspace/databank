'use client';

import { useState } from 'react';
import { downloadExportCsv } from '@/lib/api';
import { daysAgo, todayISO } from '@/lib/utils';

export default function AdminExport() {
  const [start, setStart] = useState(daysAgo(30));
  const [end, setEnd] = useState(todayISO());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      await downloadExportCsv(start, end);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Exportar Dados</h2>
        <p className="text-sm text-text-tertiary mt-1">Exportar registros de banco de horas em CSV</p>
      </div>

      <div className="card max-w-md space-y-4">
        <div>
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider">Data Inicial</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="input mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider">Data Final</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="input mt-1"
          />
        </div>
        {error && <p className="text-sm text-status-danger">{error}</p>}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-primary w-full text-center disabled:opacity-50"
        >
          {exporting ? 'Exportando...' : 'Exportar CSV'}
        </button>
      </div>
    </div>
  );
}
