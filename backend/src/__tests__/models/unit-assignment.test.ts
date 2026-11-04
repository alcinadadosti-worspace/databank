// Pure helpers only — nothing here touches Firestore
import {
  legacyUnitNameFor, resolveUnitName, unitChoicesForLeader, UNIT_CARD_LEADER, computeMissingPunchesForRecord,
  explicitUnitNameFor,
} from '../../models/queries';

describe('legacy card routing (mirrors getUnitRecords)', () => {
  it('stores of gestores with several cards come from the name lists', () => {
    expect(legacyUnitNameFor({ name: 'Rayanne Maria dos Santos Moca', leader_id: 11 })).toBe('Loja Coruripe');
    expect(legacyUnitNameFor({ name: 'Jayane da Silva Dias', leader_id: 11 })).toBe('Loja Teotonio Vilela');
    expect(legacyUnitNameFor({ name: 'Bruna Soares Siqueira', leader_id: 18 })).toBe('Loja Palmeira dos Indios');
    expect(legacyUnitNameFor({ name: 'Eduarda Pereira Costa Silva', leader_id: 18 })).toBe('Loja Sustentável Palmeira');
    expect(legacyUnitNameFor({ name: 'Nayara Soares Kimura', leader_id: 10 })).toBe('Loja Sao Sebastiao');
  });

  it('someone of those gestores missing from the lists has no card', () => {
    expect(legacyUnitNameFor({ name: 'Nova Pessoa', leader_id: 11 })).toBeNull();
    expect(legacyUnitNameFor({ name: 'Nova Pessoa', leader_id: 18 })).toBeNull();
  });

  it('Logística splits by list; the default is Penedo', () => {
    expect(legacyUnitNameFor({ name: 'Hugo Castro Lopes', leader_id: 2 })).toBe('Logistica Palmeira dos Indios');
    expect(legacyUnitNameFor({ name: 'Nova Pessoa', leader_id: 2 })).toBe('Logistica Penedo');
  });

  it('store and VD gestores registered under the channels go to their own card', () => {
    expect(legacyUnitNameFor({ name: 'Mariane Santos Sousa', leader_id: 6 })).toBe('Loja Penedo');
    expect(legacyUnitNameFor({ name: 'Erick Café Santos Júnior', leader_id: 1 })).toBe('Supervisoras Penedo');
    expect(legacyUnitNameFor({ name: 'Leidiane Souza', leader_id: 6 })).toBeNull();
  });

  it('everyone else follows the gestor', () => {
    expect(legacyUnitNameFor({ name: 'Vitoria Regina Lúcio da Silva', leader_id: 12 })).toBe('Loja Penedo');
    expect(legacyUnitNameFor({ name: 'Qualquer', leader_id: 15 })).toBe('Marketing');
    expect(legacyUnitNameFor({ name: 'Qualquer', leader_id: null })).toBeNull();
  });

  it('a valid unit_name wins; an unknown one is ignored', () => {
    expect(resolveUnitName({ name: 'Nova Pessoa', leader_id: 11, unit_name: 'Loja Teotonio Vilela' })).toBe('Loja Teotonio Vilela');
    expect(resolveUnitName({ name: 'Rayanne Maria dos Santos Moca', leader_id: 11, unit_name: 'Loja Inexistente' })).toBe('Loja Coruripe');
  });
});

describe('unit_name only counts while it belongs to the current gestor', () => {
  it('a transfer by leader_id alone makes the old store stop counting', () => {
    // Moved from Taciane (11) to Mariane (12) without touching unit_name
    expect(explicitUnitNameFor({ leader_id: 12, unit_name: 'Loja Coruripe' })).toBeNull();
    expect(resolveUnitName({ name: 'Nova Pessoa', leader_id: 12, unit_name: 'Loja Coruripe' })).toBe('Loja Penedo');
    // Moved to Keliany (18): needs her store chosen; until then no card (pendências shows it)
    expect(resolveUnitName({ name: 'Nova Pessoa', leader_id: 18, unit_name: 'Loja Coruripe' })).toBeNull();
  });

  it('own cards and the channel heads keep their unit_name', () => {
    expect(explicitUnitNameFor({ leader_id: 11, unit_name: 'Loja Coruripe' })).toBe('Loja Coruripe');
    expect(explicitUnitNameFor({ leader_id: 12, unit_name: 'Loja Penedo' })).toBe('Loja Penedo');
    expect(explicitUnitNameFor({ leader_id: 6, unit_name: 'Loja Penedo' })).toBe('Loja Penedo');   // Mariane
    expect(explicitUnitNameFor({ leader_id: 1, unit_name: 'Supervisoras Penedo' })).toBe('Supervisoras Penedo'); // Erick
    expect(explicitUnitNameFor({ leader_id: 11, unit_name: null })).toBeNull();
  });
});

describe('cards the RH can choose', () => {
  it('gestores with several cards require the choice', () => {
    expect(unitChoicesForLeader(11)).toEqual({ required: true, options: ['Loja Coruripe', 'Loja Teotonio Vilela'] });
    expect(unitChoicesForLeader(18).options).toEqual(['Loja Palmeira dos Indios', 'Loja Sustentável Palmeira']);
    expect(unitChoicesForLeader(10)).toEqual({ required: true, options: ['Loja Sao Sebastiao'] });
  });

  it('gestores with their own card need no choice', () => {
    expect(unitChoicesForLeader(12)).toEqual({ required: false, options: [] });
    expect(unitChoicesForLeader(17)).toEqual({ required: false, options: [] });
  });

  it('channel heads (no card of their own) choose any card', () => {
    const choice = unitChoicesForLeader(6);
    expect(choice.required).toBe(true);
    expect(choice.options).toContain('Loja Penedo');
  });

  it('ambiguous card names (two leaders) are not choosable', () => {
    expect(UNIT_CARD_LEADER.has('Financeiro/Administrativo')).toBe(false);
    expect(UNIT_CARD_LEADER.get('Loja Teotonio Vilela')).toBe(11);
  });
});

describe('missing punches use the registration fields', () => {
  it('a no-lunch employee from schedule_type needs only entry and exit', () => {
    const record = { date: '2026-11-04', punch_1: '08:00', punch_2: null };
    expect(computeMissingPunchesForRecord(record, { name: 'Nova Pessoa', schedule_type: 'sem_almoco' })).toEqual(['Saída']);
    expect(computeMissingPunchesForRecord(record, { name: 'Nova Pessoa', schedule_type: 'padrao' })).toEqual(['Intervalo', 'Retorno', 'Saída']);
  });
});
