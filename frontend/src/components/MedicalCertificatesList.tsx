'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import DateRangePicker from '@/components/DateRangePicker';
import MedicalLeaveForm from '@/components/MedicalLeaveForm';
import { CertificateViewer, formatFileSize } from '@/components/MedicalCertificates';
import {
  getMedicalCertificates, getMedicalLeaves, deleteMedicalCertificate, deleteMedicalLeave,
  type MedicalCertificate, type MedicalLeave,
} from '@/lib/api';
import { formatDate, formatDateTime, daysAgo, todayISO, todayInSaoPaulo } from '@/lib/utils';

const FLOW_LABEL: Record<MedicalCertificate['flow'], string> = {
  late: 'Atraso',
  full_day: 'Falta do dia',
  adjustment: 'Ajuste de ponto',
  test: 'Teste',
  rh: 'Lançado no painel',
};

const NO_LEADER = 'Sem gestor';

function leaderOf(name: string | null, isTest = false): string {
  return isTest ? 'Teste' : name || NO_LEADER;
}

function leaveDuration(l: MedicalLeave): string {
  if (l.kind === 'days') return `${l.days} dia${l.days === 1 ? '' : 's'}`;
  const total = Math.round((l.hours ?? 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function leavePeriod(l: MedicalLeave): string {
  return l.start_date === l.end_date ? formatDate(l.start_date) : `${formatDate(l.start_date)} a ${formatDate(l.end_date)}`;
}

interface LeaderGroup {
  leader: string;
  leaves: MedicalLeave[];
  certificates: MedicalCertificate[];
}

/**
 * Atestados page, split by gestor: atestados registered in the panel (whole days
 * or hours) and files received through Slack. RH (admin) sees everyone, registers
 * and deletes; a gestor (manager, leaderId) gets only their team from the backend,
 * registers for it and deletes only what they registered.
 */
export default function MedicalCertificatesList({ authType, leaderId }: { authType: 'admin' | 'manager'; leaderId?: number }) {
  const isAdmin = authType === 'admin';
  const [range, setRange] = useState({ start: daysAgo(30), end: todayISO() });
  const [certificates, setCertificates] = useState<MedicalCertificate[]>([]);
  const [leaves, setLeaves] = useState<MedicalLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [leaderFilter, setLeaderFilter] = useState('');
  // Kept in state so the viewer gets a stable list (a new array would re-download the files)
  const [viewing, setViewing] = useState<MedicalCertificate[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // While the period reaches today, atestados still running or starting later stay on screen
      const leavesEnd = range.end >= todayInSaoPaulo() ? '9999-12-31' : range.end;
      const [certData, leaveData] = await Promise.all([
        getMedicalCertificates(range.start, range.end, authType),
        getMedicalLeaves(range.start, leavesEnd, authType),
      ]);
      // Files of panel atestados open from their atestado's row
      setCertificates(certData.certificates.filter(c => c.flow !== 'rh'));
      setLeaves(leaveData.leaves);
    } catch (err) {
      setError((err as Error).message || 'Erro ao carregar atestados');
    } finally {
      setLoading(false);
    }
  }, [range, authType]);

  useEffect(() => { load(); }, [load]);

  const leaderNames = useMemo(() => {
    const names = new Set<string>();
    leaves.forEach(l => names.add(leaderOf(l.leader_name)));
    certificates.forEach(c => names.add(leaderOf(c.leader_name, c.is_test)));
    // Keep the chosen gestor listed when the new period has nothing for them,
    // otherwise the select shows "Todos" while the filter still hides everyone else
    if (leaderFilter) names.add(leaderFilter);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [leaves, certificates, leaderFilter]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const keep = (employeeName: string, leader: string) =>
      (!q || employeeName.toLowerCase().includes(q)) && (!leaderFilter || leader === leaderFilter);

    const map = new Map<string, LeaderGroup>();
    const group = (leader: string) => {
      if (!map.has(leader)) map.set(leader, { leader, leaves: [], certificates: [] });
      return map.get(leader)!;
    };
    for (const l of leaves) {
      const leader = leaderOf(l.leader_name);
      if (keep(l.employee_name, leader)) group(leader).leaves.push(l);
    }
    for (const c of certificates) {
      const leader = leaderOf(c.leader_name, c.is_test);
      if (keep(c.employee_name, leader)) group(leader).certificates.push(c);
    }
    return [...map.values()].sort((a, b) => a.leader.localeCompare(b.leader));
  }, [leaves, certificates, search, leaderFilter]);

  // A gestor covering another leader's store sees more than one group
  const showGroupHeaders = isAdmin || groups.length > 1;

  async function handleDeleteCertificate(c: MedicalCertificate) {
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

  async function handleDeleteLeave(l: MedicalLeave) {
    const files = l.certificates.length > 0 ? ' O arquivo anexado também é apagado.' : '';
    if (!window.confirm(
      `Excluir o atestado de ${l.employee_name} (${leaveDuration(l)}, ${leavePeriod(l)})? `
      + `Os dias voltam a ser cobrados pelo ponto.${files} Não dá para desfazer.`
    )) return;
    setDeleting(l.id);
    try {
      await deleteMedicalLeave(l.id, authType);
      setLeaves(prev => prev.filter(x => x.id !== l.id));
    } catch (err) {
      window.alert((err as Error).message || 'Erro ao excluir');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Atestados</h2>
          <p className="text-sm text-text-tertiary mt-1">
            {isAdmin
              ? 'Lançados pelo RH ou pelo gestor, ou enviados pelo Slack, separados por gestor. Só o RH e o gestor de cada colaborador abrem os arquivos.'
              : 'Atestados da sua equipe, lançados por você ou pelo RH, ou enviados pelo Slack. Só você e o RH abrem os arquivos. Você exclui os que lançou; para os outros, fale com o RH.'}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
            Lançar atestado
          </button>
          <button onClick={load} className="btn-secondary text-sm" disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
        <DateRangePicker onRangeChange={(start, end) => start && end && setRange({ start, end })} />
        {isAdmin && (
          <select value={leaderFilter} onChange={e => setLeaderFilter(e.target.value)} className="input w-full sm:w-56">
            <option value="">Todos os gestores</option>
            {leaderNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
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
      ) : groups.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-text-tertiary text-sm">Nenhum atestado neste período</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(g => (
            <section key={g.leader} className="space-y-3">
              {showGroupHeaders && (
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">{g.leader}</h3>
                  <span className="text-xs text-text-tertiary bg-bg-secondary px-2 py-0.5 rounded-full">
                    {g.leaves.length + g.certificates.length}
                  </span>
                </div>
              )}
              {g.leaves.length > 0 && (
                <LeavesTable
                  leaves={g.leaves}
                  deleting={deleting}
                  onView={l => setViewing(l.certificates)}
                  onDelete={handleDeleteLeave}
                />
              )}
              {g.certificates.length > 0 && (
                <CertificatesTable
                  certificates={g.certificates}
                  deleting={deleting}
                  onView={c => setViewing([c])}
                  onDelete={isAdmin ? handleDeleteCertificate : undefined}
                />
              )}
            </section>
          ))}
        </div>
      )}

      {viewing && <CertificateViewer certificates={viewing} authType={authType} onClose={() => setViewing(null)} />}
      {showForm && (
        <MedicalLeaveForm
          authType={authType}
          leaderId={leaderId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

const TH = 'text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider bg-bg-secondary';

function LeavesTable({ leaves, deleting, onView, onDelete }: {
  leaves: MedicalLeave[]; deleting: string | null; onView: (l: MedicalLeave) => void; onDelete: (l: MedicalLeave) => void;
}) {
  const actions = (l: MedicalLeave) => (
    <div className="flex gap-2 justify-end">
      {l.certificates.length > 0 && (
        <button onClick={() => onView(l)} className="btn-secondary text-xs">
          Ver{l.certificates.length > 1 ? ` (${l.certificates.length})` : ''}
        </button>
      )}
      {l.can_delete && <DeleteButton busy={deleting === l.id} onClick={() => onDelete(l)} title={`Excluir atestado de ${l.employee_name}`} />}
    </div>
  );
  const author = (l: MedicalLeave) => l.created_by_role === 'manager' ? `${l.created_by} (gestor)` : l.created_by;
  const launched = (l: MedicalLeave) => `${formatDateTime(l.created_at)} por ${author(l)}`;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text-tertiary">Lançados no painel</p>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {leaves.map(l => (
          <div key={l.id} className="card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-text-secondary">{leavePeriod(l)}</span>
              <LeaveStatus leave={l} />
            </div>
            <p className="text-sm font-medium text-text-primary truncate">{l.employee_name}</p>
            <p className="text-xs text-text-secondary">{leaveDuration(l)}{l.notes ? ` · ${l.notes}` : ''}</p>
            <p className="text-xs text-text-muted">Lançado em {launched(l)}</p>
            {actions(l)}
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Colaborador', 'Período', 'Duração', 'Situação', 'Observação', 'Lançado em', ''].map(h => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {leaves.map(l => (
                <tr key={l.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-text-primary">{l.employee_name}</td>
                  <td className="px-4 py-3 text-text-secondary font-mono text-xs whitespace-nowrap">{leavePeriod(l)}</td>
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{leaveDuration(l)}</td>
                  <td className="px-4 py-3"><LeaveStatus leave={l} /></td>
                  <td className="px-4 py-3 text-text-secondary text-xs max-w-[220px]">
                    <span className="block truncate" title={l.notes ?? ''}>{l.notes || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">
                    {formatDateTime(l.created_at)}
                    <span className="block text-text-muted">por {author(l)}</span>
                  </td>
                  <td className="px-4 py-3">{actions(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CertificatesTable({ certificates, deleting, onView, onDelete }: {
  certificates: MedicalCertificate[]; deleting: string | null;
  onView: (c: MedicalCertificate) => void; onDelete?: (c: MedicalCertificate) => void;
}) {
  const actions = (c: MedicalCertificate) => (
    <div className="flex gap-2 justify-end">
      <button onClick={() => onView(c)} className="btn-secondary text-xs">Ver</button>
      {onDelete && <DeleteButton busy={deleting === c.id} onClick={() => onDelete(c)} title={`Excluir ${c.filename}`} />}
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text-tertiary">Recebidos pelo Slack</p>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {certificates.map(c => (
          <div key={c.id} className="card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-text-secondary">{formatDate(c.date)}</span>
              <FlowBadge flow={c.flow} />
            </div>
            <p className="text-sm font-medium text-text-primary truncate">{c.employee_name}</p>
            <p className="text-xs text-text-muted break-all">
              {c.filename} · {formatFileSize(c.size)} · enviado em {formatDateTime(c.uploaded_at)}{c.uploaded_by === 'manager' ? ' pelo gestor' : ''}
            </p>
            {actions(c)}
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block card p-0 overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border">
                {['Data', 'Colaborador', 'Origem', 'Arquivo', 'Enviado em', ''].map(h => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {certificates.map(c => (
                <tr key={c.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-text-secondary font-mono text-xs">{formatDate(c.date)}</td>
                  <td className="px-4 py-3 text-text-primary">{c.employee_name}</td>
                  <td className="px-4 py-3"><FlowBadge flow={c.flow} /></td>
                  <td className="px-4 py-3 text-text-secondary text-xs max-w-[240px]">
                    <span className="block truncate" title={c.filename}>{c.filename}</span>
                    <span className="text-text-muted">{formatFileSize(c.size)}</span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">
                    {formatDateTime(c.uploaded_at)}
                    {c.uploaded_by === 'manager' && <span className="block text-text-muted">pelo gestor</span>}
                  </td>
                  <td className="px-4 py-3">{actions(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LeaveStatus({ leave }: { leave: MedicalLeave }) {
  const today = todayInSaoPaulo();
  const [label, color] = leave.end_date < today
    ? ['Encerrado', 'bg-bg-tertiary text-text-tertiary']
    : leave.start_date > today
      ? ['Agendado', 'bg-blue-500/10 text-blue-500']
      : ['Em andamento', 'bg-teal-600/10 text-teal-600'];
  return <span className={`badge ${color}`}>{label}</span>;
}

function FlowBadge({ flow }: { flow: MedicalCertificate['flow'] }) {
  const color = {
    test: 'bg-purple-500/10 text-purple-500',
    full_day: 'bg-teal-600/10 text-teal-600',
    adjustment: 'bg-orange-500/10 text-orange-500',
    late: 'bg-red-600/10 text-red-600',
    rh: 'bg-blue-500/10 text-blue-500',
  }[flow];
  return <span className={`badge ${color}`}>{FLOW_LABEL[flow]}</span>;
}

function DeleteButton({ busy, onClick, title }: { busy: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="px-3 py-1.5 text-xs font-medium rounded-md text-red-600 hover:bg-red-600/10 transition-colors disabled:opacity-50"
      title={title}
    >
      {busy ? '...' : 'Excluir'}
    </button>
  );
}
