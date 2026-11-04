import {
  buildPanelEmployee, suggestSlackAccounts, computePendencias, buildRosterView, defaultSecondaryApprover,
  normalizePersonName, computeCardDefaults, type ImportContext,
} from '../../services/employee-admin';
import type { SolidesRosterEntry } from '../../services/solides-api';

function person(overrides: Partial<SolidesRosterEntry> = {}): SolidesRosterEntry {
  return { id: '7187482', name: 'Vitoria Regina Lúcio da Silva', email: 'vitoria@x.com', admissionDate: '2026-10-27', fired: false, recordsPunch: true, ...overrides };
}

const LEADERS = [{ id: 10, name: 'Kemilly' }, { id: 11, name: 'Maria Taciane' }, { id: 12, name: 'Mariane' }];

function ctx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    roster: [person()],
    employees: [{ id: 64, name: 'Anny Karoline Andrade Santos', slack_id: 'U08JFCGBFSA', solides_employee_id: '4798744' }],
    leaders: LEADERS,
    unitChoices: (leaderId: number) => leaderId === 11
      ? { required: true, options: ['Loja Coruripe', 'Loja Teotonio Vilela'] }
      : { required: false, options: [] },
    ...overrides,
  };
}

describe('buildPanelEmployee', () => {
  it('builds the registration with name and admission from Sólides', () => {
    const check = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, slack_id: 'u0cc48k97ex', saturday: 'ate_14', name: 'Nome do navegador' }, ctx());
    expect(check).toEqual({
      ok: true,
      input: {
        name: 'Vitoria Regina Lúcio da Silva', slack_id: 'U0CC48K97EX', leader_id: 12, secondary_approver_id: null,
        solides_employee_id: '7187482', is_apprentice: false, expected_daily_minutes: 480, no_punch_required: false,
        works_saturday: true, saturday_minutes: 360, schedule_type: 'padrao', unit_name: null, admission_date: '2026-10-27',
      },
    });
  });

  it('defaults: Saturday until 12:00, standard journey, punches as Sólides says', () => {
    const check = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12 }, ctx());
    expect(check.ok && check.input).toMatchObject({ saturday_minutes: 240, works_saturday: true, schedule_type: 'padrao', no_punch_required: false, slack_id: null });
    const noPunch = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12 }, ctx({ roster: [person({ recordsPunch: false })] }));
    expect(noPunch.ok && noPunch.input.no_punch_required).toBe(true);
  });

  it('journeys and Saturdays map to the registration fields', () => {
    const apprentice = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, journey: 'aprendiz', saturday: 'nao_trabalha' }, ctx());
    expect(apprentice.ok && apprentice.input).toMatchObject({ is_apprentice: true, expected_daily_minutes: 240, works_saturday: false });
    const rotation = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, journey: 'loja_sustentavel' }, ctx());
    expect(rotation.ok && rotation.input.schedule_type).toBe('loja_sustentavel');
    const noLunch = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, journey: 'sem_almoco' }, ctx());
    expect(noLunch.ok && noLunch.input).toMatchObject({ schedule_type: 'sem_almoco', expected_daily_minutes: 480 });
  });

  it('a gestor with several stores needs the store; it must be one of theirs', () => {
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 11 }, ctx())).toMatchObject({ ok: false, status: 400 });
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 11, unit_name: 'Loja Penedo' }, ctx())).toMatchObject({ ok: false, status: 400 });
    const ok = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 11, unit_name: 'Loja Teotonio Vilela', secondary_approver_id: 10 }, ctx());
    expect(ok.ok && ok.input).toMatchObject({ unit_name: 'Loja Teotonio Vilela', secondary_approver_id: 10 });
  });

  it('someone who does not punch needs no store (goes to "Sem Ponto")', () => {
    const check = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 11, no_punch_required: true }, ctx());
    expect(check.ok && check.input).toMatchObject({ no_punch_required: true, unit_name: null });
  });

  it('a store is ignored for a gestor with a single card', () => {
    const check = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, unit_name: 'Loja Coruripe' }, ctx());
    expect(check.ok && check.input.unit_name).toBeNull();
  });

  it('refuses people not active in Sólides', () => {
    expect(buildPanelEmployee({ solides_employee_id: '999', leader_id: 12 }, ctx())).toMatchObject({ ok: false, status: 404 });
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12 }, ctx({ roster: [person({ fired: true })] }))).toMatchObject({ ok: false, status: 404 });
    expect(buildPanelEmployee({ leader_id: 12 }, ctx())).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses duplicates: same Sólides ID, same name (accents ignored), same Slack', () => {
    const employees = [{ id: 130, name: 'Outra', slack_id: null, solides_employee_id: '7187482' }];
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12 }, ctx({ employees }))).toMatchObject({ ok: false, status: 409 });
    const homonym = [{ id: 7, name: 'VITORIA REGINA LUCIO DA SILVA', slack_id: null, solides_employee_id: '1' }];
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12 }, ctx({ employees: homonym }))).toMatchObject({ ok: false, status: 409 });
    const slackTaken = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, slack_id: 'U08JFCGBFSA' }, ctx());
    expect(slackTaken).toMatchObject({ ok: false, status: 409 });
    expect(!slackTaken.ok && slackTaken.error).toContain('Anny');
  });

  it('a homonym linked to another active Sólides ID needs an explicit confirmation', () => {
    const roster = [person(), person({ id: '555', name: 'Vitoria Regina Lucio da Silva' })];
    const employees = [{ id: 7, name: 'Vitoria Regina Lúcio da Silva', slack_id: null, solides_employee_id: '555' }];
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12 }, ctx({ roster, employees }))).toMatchObject({ ok: false, status: 409 });
    const ok = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, confirm_homonym: true }, ctx({ roster, employees }));
    expect(ok.ok).toBe(true);
  });

  it('same name without a live link is most likely the same person: always refused', () => {
    const employees = [{ id: 7, name: 'Vitoria Regina Lucio da Silva', slack_id: null, solides_employee_id: '999' }];
    const check = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, confirm_homonym: true }, ctx({ employees }));
    expect(check).toMatchObject({ ok: false, status: 409 });
    expect(!check.ok && check.error).toContain('religar');
  });

  it('contradictory journeys are refused or normalized', () => {
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, journey: 'aprendiz', saturday: 'ate_14' }, ctx()))
      .toMatchObject({ ok: false, status: 400 });
    const apprentice = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, journey: 'aprendiz' }, ctx());
    expect(apprentice.ok && apprentice.input).toMatchObject({ works_saturday: false, saturday_minutes: 240 });
    // Loja Sustentável: Saturday is part of the rotation, never "until 14h" / "off"
    const rotation = buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, journey: 'loja_sustentavel', saturday: 'ate_14' }, ctx());
    expect(rotation.ok && rotation.input).toMatchObject({ saturday_minutes: 240, works_saturday: true });
  });

  it('validates gestor, substitute and Slack format', () => {
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 99 }, ctx())).toMatchObject({ ok: false, status: 400 });
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, secondary_approver_id: 12 }, ctx())).toMatchObject({ ok: false, status: 400 });
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, secondary_approver_id: 99 }, ctx())).toMatchObject({ ok: false, status: 400 });
    expect(buildPanelEmployee({ solides_employee_id: '7187482', leader_id: 12, slack_id: 'vitoria' }, ctx())).toMatchObject({ ok: false, status: 400 });
  });
});

describe('suggestSlackAccounts', () => {
  const users = [
    { id: 'U1', name: 'Vitoria Regina', display_name: '', email: null },
    { id: 'U2', name: 'Vitoria Santos', display_name: '', email: null },
    { id: 'U3', name: 'Outra Pessoa', display_name: '', email: 'vitoria@x.com' },
    { id: 'U4', name: 'Regina Costa', display_name: '', email: null },
  ];

  it('same e-mail first, then full name, then same first name', () => {
    const s = suggestSlackAccounts({ name: 'Vitoria Regina Lúcio da Silva', email: 'vitoria@x.com' }, users, []);
    expect(s.map(x => [x.slack_id, x.match])).toEqual([['U3', 'email'], ['U1', 'nome'], ['U2', 'parcial']]);
  });

  it('flags accounts already linked to someone', () => {
    const s = suggestSlackAccounts({ name: 'Vitoria Regina', email: null }, users, [{ id: 130, name: 'Vitoria', slack_id: 'U1' }]);
    expect(s[0]).toMatchObject({ slack_id: 'U1', in_use_by: { id: 130, name: 'Vitoria' } });
  });
});

describe('roster view and defaults', () => {
  it('marks who is already registered, by Sólides ID or by name; newest admissions first', () => {
    const view = buildRosterView(
      [person(), person({ id: '1', name: 'Anny Karoline Andrade Santos', admissionDate: '2025-02-21' }), person({ id: '2', name: 'Nova', admissionDate: '2026-11-04' })],
      [{ id: 130, name: 'X', solides_employee_id: '7187482' }, { id: 64, name: 'ANNY KAROLINE ANDRADE SANTOS', solides_employee_id: null }],
    );
    expect(view.map(v => [v.solides_id, v.registered_as?.id ?? null])).toEqual([['2', null], ['7187482', 130], ['1', 64]]);
  });

  it('a same-name employee linked to another active ID is a homonym, not "already registered"', () => {
    const view = buildRosterView(
      [person(), person({ id: '555', name: 'Outra Pessoa' }), person({ id: '556', name: 'Vitoria Regina Lucio da Silva' })],
      [{ id: 7, name: 'Vitoria Regina Lúcio da Silva', solides_employee_id: '556' }],
    );
    const vitoria = view.find(v => v.solides_id === '7187482')!;
    expect(vitoria).toMatchObject({ registered_as: null, homonym_of: { id: 7 } });
    expect(view.find(v => v.solides_id === '556')).toMatchObject({ registered_as: { id: 7 }, homonym_of: null });
  });

  it('card defaults come from what most of the card already has', () => {
    const emp = (o: any) => ({ name: 'X', leader_id: 12, no_punch_required: false, is_apprentice: false, works_saturday: true, unit_name: null, ...o });
    const defaults = computeCardDefaults([
      emp({ saturday_minutes: 360 }), emp({ saturday_minutes: 360 }), emp({ is_apprentice: true, works_saturday: false }),
      emp({ leader_id: 18, schedule_type: 'loja_sustentavel' }),
      emp({ leader_id: 15, works_saturday: false, is_apprentice: true }),   // apprentices don't describe the card
      emp({ leader_id: 14, works_saturday: false }), emp({ leader_id: 14, works_saturday: false }), emp({ leader_id: 14 }),
      emp({ leader_id: 5, no_punch_required: true, saturday_minutes: 360 }), // no-punch people don't count
    ], (e: any) => ({ 12: 'Loja Penedo', 18: 'Loja Sustentável Palmeira', 15: 'Marketing', 14: 'Gente e Cultura', 5: 'Dados TI' } as any)[e.leader_id]);
    expect(defaults['Loja Penedo']).toEqual({ journey: 'padrao', saturday: 'ate_14' });
    expect(defaults['Loja Sustentável Palmeira']).toEqual({ journey: 'loja_sustentavel', saturday: 'ate_12' });
    expect(defaults['Gente e Cultura']).toEqual({ journey: 'padrao', saturday: 'nao_trabalha' });
    expect(defaults['Marketing']).toBeUndefined();
    expect(defaults['Dados TI']).toBeUndefined();
  });

  it('suggests the substitute the whole team already has', () => {
    expect(defaultSecondaryApprover(11, [{ leader_id: 11, secondary_approver_id: 10 }, { leader_id: 11, secondary_approver_id: 10 }])).toBe(10);
    expect(defaultSecondaryApprover(11, [{ leader_id: 11, secondary_approver_id: 10 }, { leader_id: 11, secondary_approver_id: null }])).toBeNull();
    expect(defaultSecondaryApprover(12, [{ leader_id: 11, secondary_approver_id: 10 }])).toBeNull();
  });

  it('normalizes names for comparison', () => {
    expect(normalizePersonName('  Vitória  Regina LÚCIO ')).toBe('vitoria regina lucio');
  });
});

describe('computePendencias', () => {
  const emp = (overrides: any) => ({ id: 1, name: 'X', leader_id: 12, leader_name: 'Mariane', solides_employee_id: '1', no_punch_required: false, unit_name: null, ...overrides });
  const resolve = (e: any) => (e.leader_id === 11 && !e.unit_name ? null : 'Card');

  it('lists the five kinds of pendência', () => {
    const active = [
      person({ id: '10', name: 'Nova Contratada', admissionDate: '2026-11-04' }),  // not registered
      person({ id: '11', name: 'Leidiane Souza' }),                                // a gestor, not an employee
      person({ id: '20', name: 'Mariane Santos Sousa', recordsPunch: false }),     // divergence
      person({ id: '30', name: 'Reconstratada Silva' }),                           // rehired under a new ID
      person({ id: '40', name: 'Sem Loja' }),
    ];
    const fired = [person({ id: '50', name: 'Demitido Fulano', fired: true }), person({ id: '31', name: 'Reconstratada Silva', fired: true })];
    const employees = [
      emp({ id: 48, name: 'Mariane Santos Sousa', solides_employee_id: '20' }),
      emp({ id: 105, name: 'Demitido Fulano', solides_employee_id: '50' }),
      emp({ id: 7, name: 'Reconstratada Silva', solides_employee_id: '31' }),
      emp({ id: 8, name: 'Sem Id', solides_employee_id: null }),
      emp({ id: 9, name: 'Sem Id Sem Ponto', solides_employee_id: null, no_punch_required: true }),
      emp({ id: 40, name: 'Sem Loja', solides_employee_id: '40', leader_id: 11 }),
    ];
    const p = computePendencias(active, fired, employees, [{ name: 'Leidiane Souza' }], resolve);
    expect(p.nao_cadastrados.map(x => x.solides_id)).toEqual(['10']);
    expect(p.divergencia_ponto.map(x => x.id)).toEqual([48]);
    expect(p.demitidos_no_databank.map(x => x.id)).toEqual([105]);
    expect(p.sem_vinculo.map(x => [x.id, x.motivo, x.solides_atual])).toEqual([[7, 'id_antigo', '30'], [8, 'sem_id', null]]);
    expect(p.sem_unidade.map(x => x.id)).toEqual([40]);
  });

  it('homonyms: a new hire with the name of someone already here is listed to import', () => {
    const active = [person({ id: '60', name: 'Maria Souza' }), person({ id: '61', name: 'Maria Souza' })];
    const p = computePendencias(active, [], [emp({ id: 70, name: 'Maria Souza', solides_employee_id: '60' })], [], resolve);
    expect(p.nao_cadastrados.map(x => x.solides_id)).toEqual(['61']);
  });

  it('homonyms: a dismissed person whose homonym is active (and registered) stays "demitido"', () => {
    const p = computePendencias(
      [person({ id: '60', name: 'Maria Souza' })],
      [person({ id: '62', name: 'Maria Souza', fired: true })],
      [emp({ id: 70, name: 'Maria Souza', solides_employee_id: '60' }), emp({ id: 71, name: 'Maria Souza', solides_employee_id: '62' })],
      [], resolve,
    );
    expect(p.demitidos_no_databank.map(x => x.id)).toEqual([71]);
    expect(p.sem_vinculo).toEqual([]);
  });

  it('a dismissed person still registered shows even if they did not punch', () => {
    const p = computePendencias([], [person({ id: '50', name: 'Gestora Sem Ponto', fired: true })],
      [emp({ id: 129, name: 'Gestora Sem Ponto', solides_employee_id: '50', no_punch_required: true })], [], resolve);
    expect(p.demitidos_no_databank.map(x => x.id)).toEqual([129]);
    expect(p.sem_vinculo).toEqual([]);
  });
});
