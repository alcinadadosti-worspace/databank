'use client';

import { useEffect, useState } from 'react';
import {
  getTransferOptions, transferEmployee,
  type TransferOptions, type ImportJourney, type ImportSaturday,
} from '@/lib/api';

const SATURDAY_LABELS: Record<ImportSaturday, string> = {
  ate_12: 'Trabalha sábado até 12h',
  ate_14: 'Trabalha sábado até 14h',
  nao_trabalha: 'Não trabalha sábado',
};

const SATURDAY_SHORT: Record<ImportSaturday, string> = {
  ate_12: 'até 12h',
  ate_14: 'até 14h',
  nao_trabalha: 'não trabalha',
};

const JOURNEY_SHORT: Record<ImportJourney, string> = {
  padrao: 'padrão (8h)',
  aprendiz: 'jovem aprendiz (4h)',
  loja_sustentavel: 'rodízio da Loja Sustentável',
  sem_almoco: 'sem almoço (8h corridas)',
};

/**
 * RH moves someone to another gestor (and store, when the gestor has several).
 * Alerts, approvals, pending requests and the card in Unidades follow right away.
 * Journey and Slack don't change here; nothing is sent to anyone.
 */
export default function TransferEmployeeModal({ employee, onClose, onSaved }: {
  employee: { id: number; name: string };
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [options, setOptions] = useState<TransferOptions | null>(null);
  const [leaderId, setLeaderId] = useState(0);
  const [unitName, setUnitName] = useState('');
  const [secondaryId, setSecondaryId] = useState(0);
  const [saturday, setSaturday] = useState<ImportSaturday>('ate_12');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getTransferOptions(employee.id)
      .then(data => {
        setOptions(data);
        const current = data.employee;
        setLeaderId(current.leader_id ?? 0); // no gestor yet (old registrations) → "Selecione"
        const currentLeader = data.leaders.find(l => l.id === current.leader_id);
        setUnitName(currentLeader?.units.required && current.card && currentLeader.units.options.includes(current.card) ? current.card : '');
        setSecondaryId(current.secondary_approver_id ?? 0);
        setSaturday(current.saturday);
      })
      .catch(err => setError((err as Error).message || 'Erro ao carregar os dados'));
  }, [employee.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const current = options?.employee ?? null;
  const leaders = options?.leaders ?? [];
  const pending = options?.pending ?? { adjustments: 0, justifications: 0 };
  const leader = leaders.find(l => l.id === leaderId) ?? null;
  const leaderChanged = !!current && leaderId !== (current.leader_id ?? 0);
  // Hidden (dismissed/merged) gestores only show as the person's current gestor/substitute
  const leaderChoices = leaders.filter(l => !l.hidden || l.id === current?.leader_id);
  const secondaryChoices = leaders.filter(l => l.id !== leaderId && (!l.hidden || l.id === current?.secondary_approver_id));
  const needsUnit = !!leader?.units.required && !current?.no_punch_required;
  const cardAfter = leader ? (leader.units.required ? (unitName || null) : leader.own_card) : null;
  const defaults = cardAfter ? options?.card_defaults[cardAfter] : undefined;
  const saturdayLocked = current?.journey === 'loja_sustentavel';
  const leaderName = (id: number) => leaders.find(l => l.id === id)?.name ?? null;

  // A new gestor: their single store, and the substitute their team already shares;
  // back to the current gestor: what the person has today
  function changeLeader(id: number) {
    setLeaderId(id);
    const next = leaders.find(l => l.id === id);
    if (!current || !next) return;
    if (id === current.leader_id) {
      setUnitName(next.units.required && current.card && next.units.options.includes(current.card) ? current.card : '');
      setSecondaryId(current.secondary_approver_id ?? 0);
    } else {
      setUnitName(next.units.required && next.units.options.length === 1 ? next.units.options[0] : '');
      setSecondaryId(next.default_secondary_approver_id ?? 0);
    }
  }

  const changed = !!current && (
    leaderChanged
    || (cardAfter ?? null) !== (current.card ?? null)
    || (secondaryId || null) !== (current.secondary_approver_id ?? null)
    || saturday !== current.saturday
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    setError('');
    if (!leaderId) { setError('Escolha o gestor'); return; }
    if (needsUnit && !unitName) { setError('Escolha a loja/unidade'); return; }
    setSaving(true);
    try {
      const { message } = await transferEmployee(employee.id, {
        leader_id: leaderId,
        unit_name: leader?.units.required ? (unitName || null) : null,
        secondary_approver_id: secondaryId || null,
        saturday,
        from: {
          leader_id: current.leader_id,
          secondary_approver_id: current.secondary_approver_id,
          unit_name: current.unit_name,
          saturday: current.saturday,
          alert_cover_leader_id: current.alert_cover_leader_id,
        },
      });
      onSaved(message);
    } catch (err) {
      setError((err as Error).message || 'Erro ao salvar');
      setSaving(false);
    }
  }

  const saturdayOptions = (Object.keys(SATURDAY_LABELS) as ImportSaturday[])
    .filter(s => current?.journey !== 'aprendiz' || s !== 'ate_14');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Trocar gestor"
      >
        <h3 className="text-lg font-semibold text-text-primary">Trocar gestor</h3>
        <p className="text-sm text-text-secondary mt-1">{employee.name} (id {employee.id})</p>
        <p className="text-xs text-text-muted mt-1 mb-4">
          Vale na hora para alertas, aprovações e o card em Unidades. Nenhuma mensagem é enviada no Slack.
        </p>

        {!options && !error && <p className="text-sm text-text-tertiary">Carregando...</p>}

        {current && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="card-elevated p-3 text-sm text-text-secondary space-y-0.5">
              <p>Hoje: <span className="text-text-primary">{current.leader_name ?? '—'}</span>{current.card ? ` · ${current.card}` : ''}</p>
              <p className="text-xs text-text-muted">
                Substituto: {current.secondary_approver_id ? leaderName(current.secondary_approver_id) ?? `gestor ${current.secondary_approver_id}` : 'nenhum'}
                {' · '}Sábado: {SATURDAY_SHORT[current.saturday]}
                {' · '}Jornada: {JOURNEY_SHORT[current.journey]}
                {current.no_punch_required ? ' · não bate ponto' : ''}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Novo gestor</label>
              <select value={leaderId} onChange={e => changeLeader(Number(e.target.value))} className="input w-full" required>
                {!leader && <option value={leaderId}>Selecione o gestor...</option>}
                {leaderChoices.map(l => (
                  <option key={l.id} value={l.id}>{l.name}{l.hidden ? ' (atual, fora da lista)' : l.sector ? ` — ${l.sector}` : ''}</option>
                ))}
              </select>
              {leader?.alert_cover_name && (
                <p className="text-xs text-amber-500 mt-1">
                  Os alertas do time de {leader.name} estão indo para {leader.alert_cover_name} (cobertura).
                </p>
              )}
            </div>

            {leader?.units.required && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Loja / unidade{current.no_punch_required ? ' (opcional: não bate ponto)' : ''}
                </label>
                <select value={unitName} onChange={e => setUnitName(e.target.value)} className="input w-full" required={needsUnit}>
                  <option value="">Selecione a loja...</option>
                  {leader.units.options.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <p className="text-xs text-text-muted mt-1">
                  {leader.kind === 'channel'
                    ? 'Esse gestor é um canal e não tem unidade própria: escolha o card onde a pessoa aparece.'
                    : 'Esse gestor tem mais de uma unidade: é o card onde a pessoa vai aparecer.'}
                </p>
              </div>
            )}

            {leaderId > 0 && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Gestor substituto (opcional)</label>
                <select value={secondaryId} onChange={e => setSecondaryId(Number(e.target.value))} className="input w-full">
                  <option value={0}>Nenhum</option>
                  {secondaryChoices.map(l => <option key={l.id} value={l.id}>{l.name}{l.hidden ? ' (atual, fora da lista)' : ''}</option>)}
                </select>
                <p className="text-xs text-text-muted mt-1">Também vê e aprova os ajustes dessa pessoa.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Sábado</label>
              {saturdayLocked ? (
                <p className="text-xs text-text-muted">No rodízio da Loja Sustentável o sábado faz parte da escala de 12h.</p>
              ) : (
                <select value={saturday} onChange={e => setSaturday(e.target.value as ImportSaturday)} className="input w-full">
                  {saturdayOptions.map(s => <option key={s} value={s}>{SATURDAY_LABELS[s]}</option>)}
                </select>
              )}
              {!saturdayLocked && defaults && defaults.saturday !== saturday && (
                <p className="text-xs text-amber-500 mt-1">
                  A maioria de {cardAfter} {defaults.saturday === 'nao_trabalha' ? 'não trabalha sábado' : `trabalha sábado ${SATURDAY_SHORT[defaults.saturday]}`}. Confira antes de salvar.
                </p>
              )}
            </div>

            {defaults && defaults.journey !== current.journey && current.journey !== 'aprendiz' && (
              <p className="text-xs text-amber-500">
                A maioria de {cardAfter} tem jornada {JOURNEY_SHORT[defaults.journey]}, e essa pessoa tem {JOURNEY_SHORT[current.journey]}.
                A jornada não muda por aqui: se precisar, fale com o TI.
              </p>
            )}

            {leaderChanged && (pending.adjustments > 0 || pending.justifications > 0) && (
              <p className="text-xs text-text-secondary">
                {pending.adjustments} ajuste(s) e {pending.justifications} justificativa(s) pendentes passam para {leader?.name ?? 'o novo gestor'}.
              </p>
            )}
            {leaderChanged && current.alert_cover_name && (
              <p className="text-xs text-amber-500">
                Hoje os alertas dessa pessoa vão para {current.alert_cover_name}. Com a troca, esse desvio sai e os alertas vão para {leader?.name ?? 'o novo gestor'}.
              </p>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} disabled={saving} className="btn-secondary px-4 py-2 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={saving || !changed} className="btn-primary px-4 py-2 text-sm">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        )}

        {!current && error && (
          <>
            <p className="text-xs text-red-500">{error}</p>
            <div className="flex justify-end pt-4">
              <button type="button" onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
