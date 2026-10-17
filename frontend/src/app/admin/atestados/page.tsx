'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import DateRangePicker from '@/components/DateRangePicker';
import { CertificateViewer, formatFileSize } from '@/components/MedicalCertificates';
import {
  getMedicalCertificates, deleteMedicalCertificate, sendMedicalCertificateTest, type MedicalCertificate,
} from '@/lib/api';
import { formatDate, formatDateTime, daysAgo, todayISO } from '@/lib/utils';

const FLOW_LABEL: Record<MedicalCertificate['flow'], string> = {
  late: 'Atraso',
  full_day: 'Falta do dia',
  test: 'Teste',
};

export default function AdminAtestados() {
  const [range, setRange] = useState({ start: daysAgo(30), end: todayISO() });
  const [certificates, setCertificates] = useState<MedicalCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<MedicalCertificate | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [testSlackId, setTestSlackId] = useState('');
  const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { certificates } = await getMedicalCertificates(range.start, range.end, 'admin');
      setCertificates(certificates);
    } catch (err) {
      setError((err as Error).message || 'Erro ao carregar atestados');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // Stable list for the viewer: a new array each render would re-download the files
  const viewingList = useMemo(() => (viewing ? [viewing] : []), [viewing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? certificates.filter(c => c.employee_name.toLowerCase().includes(q)) : certificates;
  }, [certificates, search]);

  async function handleDelete(c: MedicalCertificate) {
    if (!window.confirm(`Excluir o atestado "${c.filename}" de ${c.employee_name} (${formatDate(c.date)})? Não dá para desfazer.`)) return;
    setDeleting(c.id);
    try {
      await deleteMedicalCertificate(c.id);
      setCertificates(prev => prev.filter(x => x.id !== c.id));
    } catch (err) {
      window.alert((err as Error).message || 'Erro ao excluir');
    } finally {
      setDeleting(null);
    }
  }

  async function handleSendTest(e: React.FormEvent) {
    e.preventDefault();
    setSendingTest(true);
    setTestStatus(null);
    try {
      const res = await sendMedicalCertificateTest(testSlackId.trim());
      setTestStatus({ ok: true, message: res.message });
    } catch (err) {
      setTestStatus({ ok: false, message: (err as Error).message || 'Erro ao enviar teste' });
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Atestados</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Enviados pelos colaboradores no Slack. Só o RH e o gestor de cada colaborador abrem os arquivos.
          </p>
        </div>
        <button onClick={load} className="btn-secondary text-sm flex-shrink-0" disabled={loading}>
          Atualizar
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <DateRangePicker onRangeChange={(start, end) => start && end && setRange({ start, end })} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar colaborador..."
          className="input w-full sm:w-64"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-text-tertiary text-sm">Nenhum atestado neste período</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {filtered.map(c => (
              <div key={c.id} className="card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-text-secondary">{formatDate(c.date)}</span>
                  <FlowBadge flow={c.flow} />
                </div>
                <p className="text-sm font-medium text-text-primary truncate">{c.employee_name}</p>
                {c.leader_name && <p className="text-xs text-text-secondary">Gestor: {c.leader_name}</p>}
                <p className="text-xs text-text-muted break-all">
                  {c.filename} · {formatFileSize(c.size)} · enviado em {formatDateTime(c.uploaded_at)}
                </p>
                <RowActions c={c} deleting={deleting === c.id} onView={() => setViewing(c)} onDelete={() => handleDelete(c)} />
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block card p-0 overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border">
                    {['Data', 'Colaborador', 'Gestor', 'Origem', 'Arquivo', 'Enviado em', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider bg-bg-secondary">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-bg-hover transition-colors">
                      <td className="px-4 py-3 text-text-secondary font-mono text-xs">{formatDate(c.date)}</td>
                      <td className="px-4 py-3 text-text-primary">{c.employee_name}</td>
                      <td className="px-4 py-3 text-text-secondary">{c.leader_name || '—'}</td>
                      <td className="px-4 py-3"><FlowBadge flow={c.flow} /></td>
                      <td className="px-4 py-3 text-text-secondary text-xs max-w-[240px]">
                        <span className="block truncate" title={c.filename}>{c.filename}</span>
                        <span className="text-text-muted">{formatFileSize(c.size)}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">{formatDateTime(c.uploaded_at)}</td>
                      <td className="px-4 py-3">
                        <RowActions c={c} deleting={deleting === c.id} onView={() => setViewing(c)} onDelete={() => handleDelete(c)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="card space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Testar no Slack</h3>
          <p className="text-xs text-text-tertiary mt-1">
            Envia a mensagem de teste do atestado só para o Slack ID informado. Nenhum colaborador recebe nada e nenhum ponto é alterado.
          </p>
        </div>
        <form onSubmit={handleSendTest} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={testSlackId}
            onChange={e => setTestSlackId(e.target.value)}
            placeholder="Seu Slack ID (ex.: U0123ABCD)"
            className="input w-full sm:w-64 font-mono"
            required
          />
          <button type="submit" className="btn-secondary text-sm" disabled={sendingTest || !testSlackId.trim()}>
            {sendingTest ? 'Enviando...' : 'Enviar teste'}
          </button>
        </form>
        {testStatus && (
          <p className={`text-xs ${testStatus.ok ? 'text-green-500' : 'text-red-500'}`}>{testStatus.message}</p>
        )}
      </div>

      {viewing && <CertificateViewer certificates={viewingList} authType="admin" onClose={() => setViewing(null)} />}
    </div>
  );
}

function FlowBadge({ flow }: { flow: MedicalCertificate['flow'] }) {
  const color = flow === 'test' ? 'bg-purple-500/10 text-purple-500' : flow === 'full_day' ? 'bg-teal-600/10 text-teal-600' : 'bg-red-600/10 text-red-600';
  return <span className={`badge ${color}`}>{FLOW_LABEL[flow]}</span>;
}

function RowActions({ c, deleting, onView, onDelete }: {
  c: MedicalCertificate; deleting: boolean; onView: () => void; onDelete: () => void;
}) {
  return (
    <div className="flex gap-2 justify-end">
      <button onClick={onView} className="btn-secondary text-xs">Ver</button>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="px-3 py-1.5 text-xs font-medium rounded-md text-red-600 hover:bg-red-600/10 transition-colors disabled:opacity-50"
        title={`Excluir ${c.filename}`}
      >
        {deleting ? '...' : 'Excluir'}
      </button>
    </div>
  );
}
