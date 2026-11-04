/**
 * Cadastro pelo painel do RH: importar da Sólides, sugerir o Slack, remover demitidos
 * e listar as pendências Sólides × Databank.
 *
 * Sólides and Slack are only READ here: the Sólides roster goes through the GET-only
 * readOnlyFetch and Slack through users.list. Nothing in this module sends a message.
 */
import { env } from '../config/env';
import { fetchEmployeeRoster, type SolidesRosterEntry } from './solides-api';
import {
  getSaturdayMinutes, isLojaSustentavelEmployee, isNoLunchEmployee, WORK_SCHEDULE, type ScheduleType,
} from '../config/constants';
import type { Employee, Leader, PanelEmployeeInput } from '../models/queries';

// ─── Sólides roster (short cache: the panel opens it, then imports) ─────────

const ROSTER_TTL_MS = 60 * 1000;
const rosterCache = new Map<boolean, { at: number; data: SolidesRosterEntry[] }>();

/** showFired=false → active people; true → dismissed. `fresh` skips the cache. */
export async function getSolidesRoster(showFired: boolean, fresh = false): Promise<SolidesRosterEntry[]> {
  const hit = rosterCache.get(showFired);
  if (!fresh && hit && Date.now() - hit.at < ROSTER_TTL_MS) return hit.data;
  const data = await fetchEmployeeRoster(showFired);
  rosterCache.set(showFired, { at: Date.now(), data });
  return data;
}

export function clearSolidesRosterCache(): void {
  rosterCache.clear();
}

// ─── Slack directory (read-only users.list) ─────────────────────────────────

export interface SlackDirectoryUser {
  id: string;
  name: string;
  display_name: string;
  email: string | null;
}

const SLACK_TTL_MS = 10 * 60 * 1000;
let slackCache: { at: number; users: SlackDirectoryUser[] } | null = null;

/** Who is in the Slack workspace (users.list — reading only, no message is sent) */
export async function listSlackUsers(): Promise<SlackDirectoryUser[]> {
  if (slackCache && Date.now() - slackCache.at < SLACK_TTL_MS) return slackCache.users;
  const token = env.SLACK_BOT_TOKEN;
  if (!token) return [];

  const users: SlackDirectoryUser[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL('https://slack.com/api/users.list');
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const data: any = await res.json();
    if (!data.ok) throw new Error(`Slack users.list: ${data.error}`);
    for (const m of data.members || []) {
      if (m.deleted || m.is_bot || m.id === 'USLACKBOT') continue;
      users.push({
        id: String(m.id),
        name: String(m.real_name || m.profile?.real_name || m.name || ''),
        display_name: String(m.profile?.display_name || ''),
        email: m.profile?.email ? String(m.profile.email).trim().toLowerCase() : null,
      });
    }
    cursor = data.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  slackCache = { at: Date.now(), users };
  return users;
}

export function clearSlackDirectoryCache(): void {
  slackCache = null;
}

// ─── Names ──────────────────────────────────────────────────────────────────

const NAME_STOPWORDS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** Lowercase, no accents, single spaces — to compare names across Sólides, Slack and Databank */
export function normalizePersonName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(name: string | null | undefined): string[] {
  return normalizePersonName(name).split(' ').filter(t => t.length > 1 && !NAME_STOPWORDS.has(t));
}

// ─── Slack suggestions ──────────────────────────────────────────────────────

export interface SlackSuggestion {
  slack_id: string;
  name: string;
  display_name: string;
  /** email = same e-mail as in Sólides; nome = every Slack name word is in the Sólides name; parcial = same first name */
  match: 'email' | 'nome' | 'parcial';
  /** Already linked to this employee — can't be reused */
  in_use_by: { id: number; name: string } | null;
}

export function suggestSlackAccounts(
  person: { name: string; email: string | null },
  users: SlackDirectoryUser[],
  employees: Pick<Employee, 'id' | 'name' | 'slack_id'>[],
  limit = 5,
): SlackSuggestion[] {
  const inUse = new Map<string, { id: number; name: string }>();
  for (const e of employees) if (e.slack_id) inUse.set(e.slack_id, { id: e.id, name: e.name });
  const personTokens = nameTokens(person.name);
  const personSet = new Set(personTokens);
  const personFirst = personTokens[0];

  const scored: { s: SlackSuggestion; score: number }[] = [];
  for (const u of users) {
    let match: SlackSuggestion['match'] | null = null;
    let score = 0;
    if (person.email && u.email && u.email === person.email) {
      match = 'email';
      score = 100;
    } else {
      const own = nameTokens(u.name);
      const tokens = own.length > 0 ? own : nameTokens(u.display_name);
      if (tokens.length > 0 && personFirst && tokens[0] === personFirst) {
        const hits = tokens.filter(t => personSet.has(t)).length;
        if (tokens.length >= 2 && hits === tokens.length) { match = 'nome'; score = 50 + hits; }
        else { match = 'parcial'; score = 10 + hits; }
      }
    }
    if (match) {
      scored.push({
        s: { slack_id: u.id, name: u.name, display_name: u.display_name, match, in_use_by: inUse.get(u.id) ?? null },
        score,
      });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map(x => x.s);
}

// ─── Roster view for the import screen ──────────────────────────────────────

export interface RosterPersonView {
  solides_id: string;
  name: string;
  admission_date: string | null;
  records_punch: boolean;
  /**
   * Already in the Databank: linked to this Sólides ID, or same name in a registration
   * without a live link (no ID / a dismissed one) — most likely the same person
   */
  registered_as: { id: number; name: string } | null;
  /** Same name as someone linked to ANOTHER active Sólides ID: a different person (homônimo) */
  homonym_of: { id: number; name: string } | null;
}

type NamedLink = Pick<Employee, 'id' | 'name' | 'solides_employee_id'>;

/** Registrations whose Sólides ID is not active there (missing, dismissed, unknown) */
function hasLiveLink(e: NamedLink, activeIds: Set<string>): boolean {
  return !!e.solides_employee_id && activeIds.has(String(e.solides_employee_id));
}

export function buildRosterView(active: SolidesRosterEntry[], employees: NamedLink[]): RosterPersonView[] {
  const activeIds = new Set(active.map(p => p.id));
  const bySolides = new Map<string, { id: number; name: string }>();
  const unlinkedByName = new Map<string, { id: number; name: string }>();
  const linkedByName = new Map<string, { id: number; name: string; solides: string }>();
  for (const e of employees) {
    const ref = { id: e.id, name: e.name };
    if (e.solides_employee_id) bySolides.set(String(e.solides_employee_id), ref);
    const norm = normalizePersonName(e.name);
    if (hasLiveLink(e, activeIds)) linkedByName.set(norm, { ...ref, solides: String(e.solides_employee_id) });
    else unlinkedByName.set(norm, ref);
  }
  return active
    .map(p => {
      const norm = normalizePersonName(p.name);
      const registered = bySolides.get(p.id) ?? unlinkedByName.get(norm) ?? null;
      const homonym = !registered ? linkedByName.get(norm) : undefined;
      return {
        solides_id: p.id,
        name: p.name,
        admission_date: p.admissionDate,
        records_punch: p.recordsPunch,
        registered_as: registered,
        homonym_of: homonym && homonym.solides !== p.id ? { id: homonym.id, name: homonym.name } : null,
      };
    })
    .sort((a, b) => (b.admission_date ?? '').localeCompare(a.admission_date ?? '') || a.name.localeCompare(b.name));
}

/** Journey and Saturday most people of a card already have — the import form's starting point */
export interface CardDefaults {
  journey: Journey;
  saturday: SaturdayOption;
}

type DefaultsEmployee = Pick<Employee, 'name' | 'leader_id' | 'no_punch_required' | 'is_apprentice' | 'works_saturday' | 'saturday_minutes' | 'schedule_type' | 'unit_name'>;

export function computeCardDefaults(
  employees: DefaultsEmployee[],
  resolveUnit: (emp: DefaultsEmployee) => string | null,
): Record<string, CardDefaults> {
  const counts = new Map<string, { journey: Map<Journey, number>; saturday: Map<SaturdayOption, number> }>();
  for (const e of employees) {
    // Apprentices are a per-person choice (4h, no Saturday): they don't describe the card
    if (e.no_punch_required === true || e.is_apprentice) continue;
    const card = resolveUnit(e);
    if (!card) continue;
    const journey: Journey = isLojaSustentavelEmployee(e) ? 'loja_sustentavel'
      : isNoLunchEmployee(e) ? 'sem_almoco' : 'padrao';
    const saturday: SaturdayOption = e.works_saturday === false ? 'nao_trabalha'
      : getSaturdayMinutes(e) > WORK_SCHEDULE.EXPECTED_SATURDAY_MINUTES ? 'ate_14' : 'ate_12';
    if (!counts.has(card)) counts.set(card, { journey: new Map(), saturday: new Map() });
    const c = counts.get(card)!;
    c.journey.set(journey, (c.journey.get(journey) ?? 0) + 1);
    c.saturday.set(saturday, (c.saturday.get(saturday) ?? 0) + 1);
  }
  // Majority; ties go to the first option (padrão / até 12h)
  const pick = <T extends string>(options: readonly T[], m: Map<T, number>): T =>
    options.reduce((best, o) => ((m.get(o) ?? 0) > (m.get(best) ?? 0) ? o : best), options[0]);
  const result: Record<string, CardDefaults> = {};
  for (const [card, c] of counts) {
    result[card] = { journey: pick(JOURNEYS, c.journey), saturday: pick(SATURDAYS, c.saturday) };
  }
  return result;
}

/** The secondary approver everyone already in this gestor's team shares (e.g. Kemilly for team 11), if any */
export function defaultSecondaryApprover(leaderId: number, employees: Pick<Employee, 'leader_id' | 'secondary_approver_id'>[]): number | null {
  const team = employees.filter(e => e.leader_id === leaderId);
  if (team.length === 0) return null;
  const first = team[0].secondary_approver_id ?? null;
  return first !== null && team.every(e => (e.secondary_approver_id ?? null) === first) ? first : null;
}

// ─── Import validation ──────────────────────────────────────────────────────

/** Journey options of the import form */
export const JOURNEYS = ['padrao', 'aprendiz', 'loja_sustentavel', 'sem_almoco'] as const;
export type Journey = typeof JOURNEYS[number];
export const SATURDAYS = ['ate_12', 'ate_14', 'nao_trabalha'] as const;
export type SaturdayOption = typeof SATURDAYS[number];

const SLACK_ID_PATTERN = /^[UW][A-Z0-9]{6,14}$/;

export interface ImportContext {
  roster: SolidesRosterEntry[];
  employees: Pick<Employee, 'id' | 'name' | 'slack_id' | 'solides_employee_id'>[];
  leaders: Pick<Leader, 'id' | 'name'>[];
  unitChoices: (leaderId: number) => { required: boolean; options: string[] };
}

export type ImportCheck =
  | { ok: true; input: PanelEmployeeInput }
  | { ok: false; status: number; error: string };

function fail(status: number, error: string): ImportCheck {
  return { ok: false, status, error };
}

/**
 * Turns the import form into the registration, re-checking everything server-side.
 * The name and admission date always come from Sólides, never from the browser.
 */
export function buildPanelEmployee(body: any, ctx: ImportContext): ImportCheck {
  const solidesId = typeof body?.solides_employee_id === 'string' || typeof body?.solides_employee_id === 'number'
    ? String(body.solides_employee_id).trim() : '';
  if (!/^\d+$/.test(solidesId)) return fail(400, 'Escolha a pessoa da Sólides');

  const person = ctx.roster.find(p => p.id === solidesId);
  if (!person || person.fired) return fail(404, 'Essa pessoa não está entre os ativos da Sólides');

  const sameSolides = ctx.employees.find(e => String(e.solides_employee_id ?? '') === solidesId);
  if (sameSolides) return fail(409, `Essa pessoa já está cadastrada no Databank (${sameSolides.name}, id ${sameSolides.id})`);
  const activeIds = new Set(ctx.roster.map(p => p.id));
  const sameName = ctx.employees.filter(e => normalizePersonName(e.name) === normalizePersonName(person.name));
  const unlinkedSame = sameName.find(e => !hasLiveLink(e, activeIds));
  if (unlinkedSame) {
    return fail(409, `Já existe no Databank um cadastro com esse nome sem vínculo ativo com a Sólides (${unlinkedSame.name}, id ${unlinkedSame.id}). ` +
      'Provavelmente é a mesma pessoa: fale com o TI para religar esse cadastro em vez de criar outro.');
  }
  if (sameName.length > 0 && body?.confirm_homonym !== true) {
    return fail(409, `Já existe outra pessoa com esse mesmo nome (${sameName[0].name}, id ${sameName[0].id}). ` +
      'Se for mesmo outra pessoa, marque a confirmação de homônimo.');
  }

  const leaderId = Number(body?.leader_id);
  if (!Number.isInteger(leaderId) || !ctx.leaders.some(l => l.id === leaderId)) return fail(400, 'Escolha o gestor');

  let secondary: number | null = null;
  if (body?.secondary_approver_id !== null && body?.secondary_approver_id !== undefined && body?.secondary_approver_id !== '') {
    secondary = Number(body.secondary_approver_id);
    if (!Number.isInteger(secondary) || !ctx.leaders.some(l => l.id === secondary)) return fail(400, 'Gestor substituto inválido');
    if (secondary === leaderId) return fail(400, 'O gestor substituto deve ser outra pessoa');
  }

  const noPunch = typeof body?.no_punch_required === 'boolean' ? body.no_punch_required : !person.recordsPunch;

  const unitRaw = typeof body?.unit_name === 'string' ? body.unit_name.trim() : '';
  const choices = ctx.unitChoices(leaderId);
  let unitName: string | null = null;
  if (choices.required) {
    if (unitRaw && choices.options.includes(unitRaw)) unitName = unitRaw;
    else if (!noPunch) return fail(400, 'Escolha a loja/unidade');
  }

  const journey: Journey = (JOURNEYS as readonly string[]).includes(body?.journey) ? body.journey : 'padrao';
  const saturday: SaturdayOption = (SATURDAYS as readonly string[]).includes(body?.saturday) ? body.saturday
    : journey === 'aprendiz' ? 'nao_trabalha' : 'ate_12';
  // Apprentices are capped at 4h on Saturday by the sync; "until 14:00" would contradict it
  if (journey === 'aprendiz' && saturday === 'ate_14') return fail(400, 'Jovem aprendiz não trabalha sábado até 14h');
  const scheduleType: ScheduleType = journey === 'loja_sustentavel' ? 'loja_sustentavel'
    : journey === 'sem_almoco' ? 'sem_almoco' : 'padrao';
  // Loja Sustentável: Saturday is part of the 12h rotation (no 12:00/14:00 Saturday)
  const worksSaturday = journey === 'loja_sustentavel' ? true : saturday !== 'nao_trabalha';
  const saturdayMinutes = journey !== 'loja_sustentavel' && saturday === 'ate_14' ? 360 : 240;

  let slackId: string | null = null;
  if (typeof body?.slack_id === 'string' && body.slack_id.trim()) {
    slackId = body.slack_id.trim().toUpperCase();
    if (!SLACK_ID_PATTERN.test(slackId!)) return fail(400, 'Slack ID inválido (ex.: U0CC48K97EX)');
    const sameSlack = ctx.employees.find(e => e.slack_id === slackId);
    if (sameSlack) return fail(409, `Esse Slack já é de ${sameSlack.name} (id ${sameSlack.id})`);
  }

  return {
    ok: true,
    input: {
      name: person.name,
      slack_id: slackId,
      leader_id: leaderId,
      secondary_approver_id: secondary,
      solides_employee_id: solidesId,
      is_apprentice: journey === 'aprendiz',
      expected_daily_minutes: journey === 'aprendiz' ? 240 : 480,
      no_punch_required: noPunch,
      works_saturday: worksSaturday,
      saturday_minutes: saturdayMinutes,
      schedule_type: scheduleType,
      unit_name: unitName,
      admission_date: person.admissionDate,
    },
  };
}

// ─── Pendências Sólides × Databank ──────────────────────────────────────────

interface EmployeeRef { id: number; name: string; leader_name: string; solides_id: string | null }

export interface Pendencias {
  /** Active in Sólides, not in the Databank (gestores registered as leaders are left out) */
  nao_cadastrados: { solides_id: string; name: string; admission_date: string | null; records_punch: boolean }[];
  /** Dismissed in Sólides, still registered here */
  demitidos_no_databank: EmployeeRef[];
  /** The Databank expects punches, but Sólides says the person doesn't register them (Mariane, Oct/2026) */
  divergencia_ponto: EmployeeRef[];
  /**
   * They punch, but their punches can't sync: no Sólides ID, an ID Sólides doesn't know,
   * or an old (dismissed) ID while the same name is active under another one (rehired).
   * solides_atual = the active ID with the same name, when there is one.
   */
  sem_vinculo: (EmployeeRef & { motivo: 'sem_id' | 'nao_encontrado' | 'id_antigo'; solides_atual: string | null })[];
  /** They punch, but no card in Unidades shows them */
  sem_unidade: EmployeeRef[];
}

type PendenciaEmployee = Pick<Employee, 'id' | 'name' | 'leader_id' | 'solides_employee_id' | 'no_punch_required' | 'unit_name'> & { leader_name?: string };

export function computePendencias(
  active: SolidesRosterEntry[],
  fired: SolidesRosterEntry[],
  employees: PendenciaEmployee[],
  leaders: Pick<Leader, 'name'>[],
  resolveUnit: (emp: PendenciaEmployee) => string | null,
): Pendencias {
  const activeById = new Map(active.map(p => [p.id, p]));
  const activeByName = new Map<string, SolidesRosterEntry[]>();
  for (const p of active) {
    const norm = normalizePersonName(p.name);
    if (!activeByName.has(norm)) activeByName.set(norm, []);
    activeByName.get(norm)!.push(p);
  }
  const firedIds = new Set(fired.map(p => p.id));
  const activeIds = new Set(active.map(p => p.id));
  const linkedIds = new Set(employees.map(e => String(e.solides_employee_id ?? '')).filter(Boolean));
  // Same name only counts as "already here" for registrations without a live link
  // (most likely the same person); someone linked to another active ID is a homonym
  const unlinkedNames = new Set(employees.filter(e => !hasLiveLink(e, activeIds)).map(e => normalizePersonName(e.name)));
  const leaderNames = new Set(leaders.map(l => normalizePersonName(l.name)));
  const ref = (e: PendenciaEmployee): EmployeeRef => ({
    id: e.id, name: e.name, leader_name: e.leader_name ?? '', solides_id: e.solides_employee_id ? String(e.solides_employee_id) : null,
  });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  const result: Pendencias = { nao_cadastrados: [], demitidos_no_databank: [], divergencia_ponto: [], sem_vinculo: [], sem_unidade: [] };

  for (const p of active) {
    const norm = normalizePersonName(p.name);
    if (linkedIds.has(p.id) || unlinkedNames.has(norm) || leaderNames.has(norm)) continue;
    result.nao_cadastrados.push({ solides_id: p.id, name: p.name, admission_date: p.admissionDate, records_punch: p.recordsPunch });
  }
  result.nao_cadastrados.sort((a, b) => (b.admission_date ?? '').localeCompare(a.admission_date ?? '') || a.name.localeCompare(b.name));

  for (const e of employees) {
    const sid = e.solides_employee_id ? String(e.solides_employee_id) : '';
    const person = sid ? activeById.get(sid) : undefined;
    const punches = e.no_punch_required !== true;
    if (person) {
      if (punches && person.recordsPunch === false) result.divergencia_ponto.push(ref(e));
    } else {
      // Same name active under another ID nobody else is linked to: rehired, not dismissed
      // (an ID already linked to someone else belongs to a homonym)
      const current = activeByName.get(normalizePersonName(e.name))?.find(p => p.id !== sid && !linkedIds.has(p.id)) ?? null;
      if (sid && firedIds.has(sid) && !current) {
        result.demitidos_no_databank.push(ref(e));
      } else if (punches) {
        const motivo = !sid ? 'sem_id' : current ? 'id_antigo' : 'nao_encontrado';
        result.sem_vinculo.push({ ...ref(e), motivo, solides_atual: current?.id ?? null });
      }
    }
    if (punches && resolveUnit(e) === null) result.sem_unidade.push(ref(e));
  }
  result.demitidos_no_databank.sort(byName);
  result.divergencia_ponto.sort(byName);
  result.sem_vinculo.sort(byName);
  result.sem_unidade.sort(byName);
  return result;
}
