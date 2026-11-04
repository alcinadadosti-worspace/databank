'use client';

import { useState } from 'react';
import { getSolidesPendencias, type SolidesPendencias as Pendencias, type PendenciaEmployee } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const VINCULO_LABELS = {
  sem_id: 'sem ID da Sólides no cadastro',
  nao_encontrado: 'o ID do cadastro não existe na Sólides',
  id_antigo: 'o cadastro aponta para um ID antigo (demitido) da Sólides',
} as const;

function Section({ title, hint, count, children }: { title: string; hint: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-sm font-medium text-text-primary">
          {title} <span className={count > 0 ? 'text-amber-500' : 'text-text-muted'}>({count})</span>
        </h4>
        <p className="text-xs text-text-muted">{hint}</p>
      </div>
      {count > 0 && <ul className="divide-y divide-border-subtle border border-border rounded">{children}</ul>}
    </div>
  );
}

function EmployeeRow({ e, extra, action }: { e: PendenciaEmployee; extra?: string; action?: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm text-text-primary truncate">{e.name}</span>
        <span className="block text-xs text-text-muted">
          id {e.id}{e.leader_name ? ` · ${e.leader_name}` : ''}{e.solides_id ? ` · Sólides ${e.solides_id}` : ''}{extra ? ` · ${extra}` : ''}
        </span>
      </span>
      {action}
    </li>
  );
}

/**
 * Sólides × Databank differences, read on demand: who to import, who to remove,
 * and registrations whose punches can't arrive. Only reads Sólides.
 */
export default function SolidesPendencias({ onImport, onRemove }: {
  onImport: (solidesId: string) => void;
  onRemove: (employee: { id: number; name: string }) => void;
}) {
  const [data, setData] = useState<Pendencias | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onlyPunch, setOnlyPunch] = useState(true);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await getSolidesPendencias());
    } catch (err) {
      setError((err as Error).message || 'Erro ao consultar a Sólides');
    } finally {
      setLoading(false);
    }
  }

  const naoCadastrados = data ? data.nao_cadastrados.filter(p => !onlyPunch || p.records_punch) : [];

  return (
    <div className="card space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Pendências Sólides × Databank</h3>
          <p className="text-xs text-text-muted">Compara o cadastro daqui com a Sólides (só leitura).</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="btn-secondary px-4 py-2 text-sm">
          {loading ? 'Consultando...' : data ? 'Verificar de novo' : 'Verificar pendências'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {data && (
        <div className="space-y-5">
          <Section
            title="Demitidos na Sólides que ainda estão aqui"
            hint="Podem ser removidos: o histórico de ponto fica guardado."
            count={data.demitidos_no_databank.length}
          >
            {data.demitidos_no_databank.map(e => (
              <EmployeeRow key={e.id} e={e} action={
                <button type="button" onClick={() => onRemove(e)} className="text-xs text-red-500 hover:text-red-600 shrink-0">Remover</button>
              } />
            ))}
          </Section>

          <Section
            title="Ativos na Sólides que não estão aqui"
            hint="Admissões mais recentes primeiro. Gestores (que já entram como gestor) não aparecem."
            count={naoCadastrados.length}
          >
            {naoCadastrados.map(p => (
              <li key={p.solides_id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm text-text-primary truncate">{p.name}</span>
                  <span className="block text-xs text-text-muted">
                    Sólides {p.solides_id}{p.admission_date ? ` · admissão ${formatDate(p.admission_date)}` : ''}
                    {!p.records_punch ? ' · não registra ponto' : ''}
                  </span>
                </span>
                <button type="button" onClick={() => onImport(p.solides_id)} className="text-xs text-accent-primary hover:underline shrink-0">
                  Importar
                </button>
              </li>
            ))}
          </Section>
          <label className="flex items-center gap-2 text-xs text-text-secondary -mt-3">
            <input type="checkbox" checked={onlyPunch} onChange={e => setOnlyPunch(e.target.checked)} />
            Mostrar só quem registra ponto na Sólides
          </label>

          <Section
            title="Bate ponto aqui, mas a Sólides diz que não registra"
            hint={'As batidas não chegam: o RH precisa ligar "registra ponto" no cadastro da Sólides.'}
            count={data.divergencia_ponto.length}
          >
            {data.divergencia_ponto.map(e => <EmployeeRow key={e.id} e={e} />)}
          </Section>

          <Section
            title="Cadastro sem vínculo com a Sólides"
            hint="Bate ponto, mas as batidas não têm como chegar. Fale com o TI."
            count={data.sem_vinculo.length}
          >
            {data.sem_vinculo.map(e => (
              <EmployeeRow key={e.id} e={e} extra={`${VINCULO_LABELS[e.motivo]}${e.solides_atual ? ` (atual: ${e.solides_atual})` : ''}`} />
            ))}
          </Section>

          <Section
            title="Bate ponto, mas não aparece em nenhuma unidade"
            hint="Não está em nenhum card da aba Unidades nem no painel do gestor. Fale com o TI."
            count={data.sem_unidade.length}
          >
            {data.sem_unidade.map(e => <EmployeeRow key={e.id} e={e} />)}
          </Section>
        </div>
      )}
    </div>
  );
}
