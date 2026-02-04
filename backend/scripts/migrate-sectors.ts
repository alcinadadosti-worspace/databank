/**
 * Migration script: Set sector and parent_leader_id for all leaders.
 *
 * Run: npx tsx scripts/migrate-sectors.ts
 */

import * as queries from '../src/models/queries';

const SECTOR_MAP: Record<number, { sector: string; parent_leader_id: number | null }> = {
  // Alta Lideranca
  1:  { sector: 'Alta Lideranca', parent_leader_id: null },       // Romulo Lisboa - Gerente Canal VD

  // Logistica
  2:  { sector: 'Logistica', parent_leader_id: null },            // Alberto Luiz Marinho Batista

  // VD Penedo
  3:  { sector: 'VD Penedo', parent_leader_id: 1 },              // Joao Antonio Tavares Santos

  // VD Palmeira dos Indios
  4:  { sector: 'VD Palmeira dos Indios', parent_leader_id: 1 }, // Jonathan Henrique da Conceicao Silva

  // Dados TI
  5:  { sector: 'Dados TI', parent_leader_id: null },            // Carlos Oliveira

  // Canal Loja
  6:  { sector: 'Canal Loja', parent_leader_id: null },           // Leidiane Souza - Gerente Canal Loja
  7:  { sector: 'Canal Loja', parent_leader_id: 6 },             // Erick Cafe Santos Junior (Loja Teotonio Vilela)
  8:  { sector: 'Canal Loja', parent_leader_id: null },           // Leidiane Souza (duplicate)
  9:  { sector: 'Canal Loja', parent_leader_id: 6 },             // Ana Clara de Matos Chagas (Loja Penedo)
  10: { sector: 'Canal Loja', parent_leader_id: 6 },             // Kemilly Rafaelly Souza Silva (Loja Sao Sebastiao)
  11: { sector: 'Canal Loja', parent_leader_id: 6 },             // Maria Taciane Pereira Barbosa (Loja Coruripe)
  12: { sector: 'Canal Loja', parent_leader_id: 6 },             // Mariane Santos Sousa (Loja Digital)

  // Financeiro/Administrativo
  13: { sector: 'Financeiro/Administrativo', parent_leader_id: null }, // Michaell Jean Nunes De Carvalho

  // Gente e Cultura
  14: { sector: 'Gente e Cultura', parent_leader_id: null },     // Rafaela Mendes

  // Marketing
  15: { sector: 'Marketing', parent_leader_id: null },            // Suzana Tavares
  16: { sector: 'Marketing', parent_leader_id: 15 },             // Ravy Thiago Vieira Da Silva (sub-lider)
};

async function migrateSectors(): Promise<void> {
  console.log('[migrate-sectors] Starting sector migration...');
  const leaders = await queries.getAllLeaders();
  let updated = 0;

  for (const leader of leaders) {
    const mapping = SECTOR_MAP[leader.id];
    if (mapping) {
      if (leader.sector !== mapping.sector || leader.parent_leader_id !== mapping.parent_leader_id) {
        await queries.updateLeaderSector(leader.id, mapping.sector, mapping.parent_leader_id);
        console.log(`[migrate-sectors] Leader #${leader.id} "${leader.name}" -> sector="${mapping.sector}", parent=${mapping.parent_leader_id}`);
        updated++;
      }
    } else {
      console.warn(`[migrate-sectors] No sector mapping for leader #${leader.id} "${leader.name}"`);
    }
  }

  if (updated > 0) {
    await queries.logAudit('MIGRATION', 'system', undefined,
      `Sector migration: ${updated} leaders updated with sector data`);
  }
  console.log(`[migrate-sectors] Done! ${updated} leaders updated.`);
}

migrateSectors().catch(err => {
  console.error('[migrate-sectors] Fatal error:', err);
  process.exit(1);
});
