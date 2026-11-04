'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getSolidesRoster, getSlackSuggestions, importEmployeeFromSolides,
  type SolidesPerson, type ImportLeader, type SlackSuggestion, type ImportJourney, type ImportSaturday,
} from '@/lib/api';
import { formatDate } from '@/lib/utils';

const JOURNEY_LABELS: Record<ImportJourney, string> = {
  padrao: 'Padrão — 8h de segunda a sexta',
  aprendiz: 'Jovem aprendiz — 4h por dia',
  loja_sustentavel: 'Loja Sustentável — rodízio de 12h (2 batidas)',
  sem_almoco: 'Sem almoço — 8h corridas (2 batidas)',
};

const SATURDAY_LABELS: Record<ImportSaturday, string> = {
  ate_12: 'Trabalha sábado até 12h',
  ate_14: 'Trabalha sábado até 14h',
  nao_trabalha: 'Não trabalha sábado',
};

const MATCH_LABELS: Record<SlackSuggestion['match'], string> = {
  email: 'mesmo e-mail da Sólides',
  nome: 'mesmo nome',
  parcial: 'mesmo primeiro nome',
};

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * RH imports someone already registered in Sólides: picks the person, the gestor
 * (and the store, when the gestor has several), the Slack account and the journey.
 * Sólides and Slack are only read; nothing is sent to anyone.
 */
export default function SolidesImportModal({ initialSolidesId, onClose, onSaved }: {
  initialSolidesId?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [people, setPeople] = useState<SolidesPerson[]>([]);
  const [leaders, setLeaders] = useState<ImportLeader[]>([]);
  const [cardDefaults, setCardDefaults] = useState<Record<string, { journey: ImportJourney; saturday: ImportSaturday }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(initialSolidesId ?? '');

  const [leaderId, setLeaderId] = useState(0);
  const [unitName, setUnitName] = useState('');
  const [secondaryId, setSecondaryId] = useState(0);
  const [suggestions, setSuggestions] = useState<SlackSuggestion[]>([]);
  const [slackWarning, setSlackWarning] = useState('');
  const [slackChoice, setSlackChoice] = useState(''); // a suggested id, 'manual' or '' (no Slack)
  const [manualSlack, setManualSlack] = useState('');
  const [journey, setJourney] = useState<ImportJourney>('padrao');
  const [saturday, setSaturday] = useState<ImportSaturday>('ate_12');
  const [noPunch, setNoPunch] = useState(false);
  const [confirmHomonym, setConfirmHomonym] = useState(false);
  // Once the RH picks the journey or the Saturday, changing gestor/loja must not undo it
  const [scheduleTouched, setScheduleTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSolidesRoster()
      .then(data => { setPeople(data.people); setLeaders(data.leaders); setCardDefaults(data.card_defaults ?? {}); })
      .catch(err => setError((err as Error).message || 'Não consegui consultar a Sólides'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const person = people.find(p => p.solides_id === selectedId) ?? null;
  const leader = leaders.find(l => l.id === leaderId) ?? null;
  const needsUnit = !!leader?.units.required && !noPunch;
  // The card the person will show in: drives the journey/Saturday defaults
  const card = leader ? (leader.units.required ? unitName : leader.own_card) : null;

  // A new person: reset the form and look up the Slack account
  useEffect(() => {
    if (!person) return;
    setNoPunch(!person.records_punch);
    setConfirmHomonym(false);
    setScheduleTouched(false);
    setSuggestions([]);
    setSlackWarning('');
    setSlackChoice('');
    setManualSlack('');
    if (person.registered_as) return;
    let cancelled = false;
    getSlackSuggestions(person.solides_id)
      .then(data => {
        if (cancelled) return;
        setSuggestions(data.suggestions);
        setSlackWarning(data.warning ?? '');
        const byEmail = data.suggestions.find(s => s.match === 'email' && !s.in_use_by);
        if (byEmail) setSlackChoice(byEmail.slack_id);
      })
      .catch(() => { if (!cancelled) setSlackWarning('Não consegui consultar o Slack; informe o Slack ID manualmente.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.solides_id]);

  // A new gestor: suggest their store (when there's a single one) and the team's substitute
  useEffect(() => {
    if (!leader) return;
    setUnitName(leader.units.required && leader.units.options.length === 1 ? leader.units.options[0] : '');
    setSecondaryId(leader.default_secondary_approver_id ?? 0);
  }, [leader]);

  // A new card: start from the journey and Saturday most of its people have
  // (e.g. Loja Penedo/Palmeira until 14h, Loja Sustentável in the 12h rotation) —
  // only while the RH hasn't chosen them herself
  useEffect(() => {
    if (scheduleTouched) return;
    const d = card ? cardDefaults[card] : undefined;
    setJourney(d?.journey ?? 'padrao');
    setSaturday(d?.saturday ?? 'ate_12');
  }, [card, cardDefaults, scheduleTouched]);

  // Only entering/leaving "jovem aprendiz" moves the Saturday (apprentices don't work it);
  // any other journey change keeps what the RH chose
  function changeJourney(next: ImportJourney) {
    setScheduleTouched(true);
    if (next === 'aprendiz') {
      setSaturday('nao_trabalha');
    } else if (journey === 'aprendiz') {
      const d = card ? cardDefaults[card] : undefined;
      setSaturday(d && d.saturday !== 'nao_trabalha' ? d.saturday : 'ate_12');
    }
    setJourney(next);
  }

  const saturdayOptions = (Object.keys(SATURDAY_LABELS) as ImportSaturday[])
    .filter(s => journey !== 'aprendiz' || s !== 'ate_14');

  const filtered = useMemo(() => {
    const key = normalize(search);
    const list = key ? people.filter(p => normalize(p.name).includes(key)) : people;
    return list.slice(0, 50);
  }, [people, search]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!person) { setError('Escolha a pessoa da Sólides'); return; }
    if (!leaderId) { setError('Escolha o gestor'); return; }
    if (needsUnit && !unitName) { setError('Escolha a loja/unidade'); return; }
    const slackId = slackChoice === 'manual' ? manualSlack.trim() : slackChoice;
    if (slackChoice === 'manual' && !slackId) { setError('Informe o Slack ID ou escolha "Sem Slack"'); return; }
    if (person.homonym_of && !confirmHomonym) { setError('Confirme que é outra pessoa (homônimo)'); return; }

    setSaving(true);
    try {
      const { employee } = await importEmployeeFromSolides({
        solides_employee_id: person.solides_id,
        leader_id: leaderId,
        unit_name: needsUnit ? unitName : null,
        secondary_approver_id: secondaryId || null,
        slack_id: slackId || null,
        journey,
        saturday,
        no_punch_required: noPunch,
        confirm_homonym: confirmHomonym,
      });
      onSaved(`${employee.name} cadastrado(a) (id ${employee.id}).`);
    } catch (err) {
      setError((err as Error).message || 'Erro ao cadastrar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Importar da Sólides"
      >
        <h3 className="text-lg font-semibold text-text-primary">Importar da Sólides</h3>
        <p className="text-xs text-text-muted mt-1 mb-4">
          A pessoa precisa estar cadastrada na Sólides. Nada é alterado na Sólides e nenhuma mensagem é enviada no Slack.
        </p>

        {loading ? (
          <p className="text-sm text-text-tertiary">Consultando a Sólides...</p>
        ) : !person ? (
          <div className="space-y-3">
            <input
              type="text"
              autoFocus
              placeholder="Buscar na Sólides pelo nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input"
            />
            <div className="border border-border rounded max-h-80 overflow-y-auto divide-y divide-border-subtle">
              {filtered.length === 0 && <p className="text-sm text-text-tertiary p-3">Ninguém encontrado entre os ativos da Sólides.</p>}
              {filtered.map(p => (
                <button
                  key={p.solides_id}
                  type="button"
                  disabled={!!p.registered_as}
                  onClick={() => setSelectedId(p.solides_id)}
                  className="w-full text-left px-3 py-2 hover:bg-bg-hover disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="block text-sm text-text-primary">{p.name}</span>
                  <span className="block text-xs text-text-muted">
                    {p.admission_date ? `Admissão ${formatDate(p.admission_date)}` : 'Sem data de admissão'}
                    {p.registered_as ? ` · já no Databank (id ${p.registered_as.id})` : ''}
                    {!p.records_punch ? ' · não registra ponto na Sólides' : ''}
                  </span>
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end pt-2">
              <button type="button" onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Fechar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="card-elevated p-3">
              <p className="text-sm font-medium text-text-primary">{person.name}</p>
              <p className="text-xs text-text-muted">
                Sólides {person.solides_id}{person.admission_date ? ` · admissão ${formatDate(person.admission_date)}` : ''}
              </p>
              {!initialSolidesId && (
                <button type="button" onClick={() => setSelectedId('')} className="text-xs text-accent-primary hover:underline mt-1">
                  Trocar pessoa
                </button>
              )}
            </div>

            {person.registered_as ? (
              <p className="text-sm text-red-500">Essa pessoa já está no Databank (id {person.registered_as.id}).</p>
            ) : (
              <>
                {person.homonym_of && (
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={confirmHomonym} onChange={e => setConfirmHomonym(e.target.checked)} />
                    <span className="text-amber-500">
                      Já existe outra pessoa com esse mesmo nome ({person.homonym_of.name}, id {person.homonym_of.id}).
                      Confirmo que é outra pessoa.
                    </span>
                  </label>
                )}

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Gestor</label>
                  <select value={leaderId} onChange={e => setLeaderId(Number(e.target.value))} className="input w-full" required>
                    <option value={0}>Selecione o gestor...</option>
                    {leaders.map(l => <option key={l.id} value={l.id}>{l.name}{l.sector ? ` — ${l.sector}` : ''}</option>)}
                  </select>
                </div>

                {needsUnit && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Loja / unidade</label>
                    <select value={unitName} onChange={e => setUnitName(e.target.value)} className="input w-full" required>
                      <option value="">Selecione a loja...</option>
                      {leader!.units.options.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <p className="text-xs text-text-muted mt-1">
                      {leader!.kind === 'channel'
                        ? 'Esse gestor é um canal e não tem unidade própria: escolha o card onde a pessoa aparece (em geral, a unidade que ela gerencia).'
                        : 'Esse gestor tem mais de uma unidade: é o card onde a pessoa vai aparecer.'}
                    </p>
                  </div>
                )}

                {leaderId > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Gestor substituto (opcional)</label>
                    <select value={secondaryId} onChange={e => setSecondaryId(Number(e.target.value))} className="input w-full">
                      <option value={0}>Nenhum</option>
                      {leaders.filter(l => l.id !== leaderId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <p className="text-xs text-text-muted mt-1">Também vê e aprova os ajustes dessa pessoa.</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Slack</label>
                  <div className="space-y-1.5">
                    {suggestions.map(s => (
                      <label key={s.slack_id} className={`flex items-start gap-2 text-sm ${s.in_use_by ? 'opacity-60' : ''}`}>
                        <input
                          type="radio"
                          name="slack"
                          className="mt-1"
                          disabled={!!s.in_use_by}
                          checked={slackChoice === s.slack_id}
                          onChange={() => setSlackChoice(s.slack_id)}
                        />
                        <span>
                          <span className="text-text-primary">{s.name || s.display_name}</span>
                          <span className="text-xs text-text-muted"> · {MATCH_LABELS[s.match]} · {s.slack_id}</span>
                          {s.in_use_by && <span className="block text-xs text-red-500">já é de {s.in_use_by.name} (id {s.in_use_by.id})</span>}
                        </span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="slack" checked={slackChoice === 'manual'} onChange={() => setSlackChoice('manual')} />
                      <span className="text-text-secondary">Informar o Slack ID</span>
                    </label>
                    {slackChoice === 'manual' && (
                      <input
                        type="text"
                        value={manualSlack}
                        onChange={e => setManualSlack(e.target.value)}
                        placeholder="Ex.: U0CC48K97EX"
                        className="input font-mono"
                      />
                    )}
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="slack" checked={slackChoice === ''} onChange={() => setSlackChoice('')} />
                      <span className="text-text-secondary">Sem Slack por enquanto (não recebe alertas)</span>
                    </label>
                  </div>
                  {slackWarning && <p className="text-xs text-amber-500 mt-1">{slackWarning}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Jornada</label>
                    <select value={journey} onChange={e => changeJourney(e.target.value as ImportJourney)} className="input w-full">
                      {(Object.keys(JOURNEY_LABELS) as ImportJourney[]).map(j => <option key={j} value={j}>{JOURNEY_LABELS[j]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Sábado</label>
                    {journey === 'loja_sustentavel' ? (
                      <p className="text-xs text-text-muted mt-2">No rodízio da Loja Sustentável o sábado faz parte da escala de 12h.</p>
                    ) : (
                      <select
                        value={saturday}
                        onChange={e => { setScheduleTouched(true); setSaturday(e.target.value as ImportSaturday); }}
                        className="input w-full"
                      >
                        {saturdayOptions.map(s => <option key={s} value={s}>{SATURDAY_LABELS[s]}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                {!scheduleTouched && card && cardDefaults[card] && (
                  <p className="text-xs text-text-muted -mt-2">Jornada e sábado vieram do que a maioria de {card} já tem; confira antes de cadastrar.</p>
                )}

                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={noPunch} onChange={e => setNoPunch(e.target.checked)} />
                  <span className="text-text-secondary">
                    Não bate ponto
                    <span className="block text-xs text-text-muted">Fica em &quot;Sem Ponto&quot; e não recebe nenhum alerta.</span>
                  </span>
                </label>
                {!person.records_punch && !noPunch && (
                  <p className="text-xs text-amber-500">
                    Na Sólides essa pessoa está como &quot;não registra ponto&quot;: as batidas não vão chegar até o RH ligar essa opção lá.
                  </p>
                )}
              </>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} disabled={saving} className="btn-secondary px-4 py-2 text-sm">
                Cancelar
              </button>
              {!person.registered_as && (
                <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">
                  {saving ? 'Cadastrando...' : 'Cadastrar'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
