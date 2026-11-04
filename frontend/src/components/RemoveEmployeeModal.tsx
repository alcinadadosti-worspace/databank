'use client';

import { useEffect, useState } from 'react';
import { getEmployeeRemovalInfo, removeEmployee, type EmployeeRemovalInfo } from '@/lib/api';

const SOLIDES_STATUS: Record<EmployeeRemovalInfo['solides']['status'], { text: string; tone: 'ok' | 'warn' }> = {
  demitido: { text: 'Na Sólides consta como demitido(a).', tone: 'ok' },
  ativo: { text: 'Atenção: na Sólides essa pessoa ainda está ATIVA.', tone: 'warn' },
  nao_encontrado: { text: 'Essa pessoa não foi encontrada na Sólides.', tone: 'warn' },
  sem_id: { text: 'Esse cadastro não tem vínculo com a Sólides.', tone: 'warn' },
  indisponivel: { text: 'Não consegui consultar a Sólides agora.', tone: 'warn' },
};

/**
 * Removes a dismissed employee: the registration and the vacation due dates go,
 * the history (ponto, folgas, justificativas, ajustes) stays. Nothing is sent to anyone.
 */
export default function RemoveEmployeeModal({ employee, onClose, onRemoved }: {
  employee: { id: number; name: string };
  onClose: () => void;
  onRemoved: (message: string) => void;
}) {
  const [info, setInfo] = useState<EmployeeRemovalInfo | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getEmployeeRemovalInfo(employee.id)
      .then(setInfo)
      .catch(err => setError((err as Error).message || 'Erro ao carregar os dados'));
  }, [employee.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // Sólides doesn't confirm the dismissal (still active, not found, unreachable):
  // the RH types the name, so nobody is removed by a misclick
  const needsTypedName = !!info && info.solides.status !== 'demitido';
  const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const typedOk = !needsTypedName || normalize(typedName) === normalize(employee.name);

  async function handleRemove() {
    setError('');
    setSaving(true);
    try {
      await removeEmployee(employee.id, info?.solides.status === 'ativo');
      onRemoved(`${employee.name} removido(a). O histórico de ponto continua guardado.`);
    } catch (err) {
      setError((err as Error).message || 'Erro ao remover');
      setSaving(false);
    }
  }

  const status = info ? SOLIDES_STATUS[info.solides.status] : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Remover colaborador"
      >
        <h3 className="text-lg font-semibold text-text-primary">Remover colaborador</h3>
        <p className="text-sm text-text-secondary mt-1">{employee.name} (id {employee.id})</p>

        {!info && !error && <p className="text-sm text-text-tertiary mt-4">Carregando...</p>}

        {info && status && (
          <div className="mt-4 space-y-3 text-sm">
            <p className={status.tone === 'ok' ? 'text-green-500' : 'text-amber-500'}>{status.text}</p>

            <div className="card-elevated p-3 space-y-1 text-text-secondary">
              <p>Sai do Databank: o cadastro e {info.summary.vacation_schedules} vencimento(s) de férias.</p>
              <p>Continua guardado: {info.summary.daily_records} dia(s) de ponto e {info.summary.folgas} folga(s).</p>
            </div>

            {(info.summary.pending_adjustments > 0 || info.summary.pending_justifications > 0) && (
              <p className="text-amber-500">
                Há {info.summary.pending_adjustments} ajuste(s) e {info.summary.pending_justifications} justificativa(s) pendentes:
                depois da remoção eles somem das telas dos gestores. Se precisar acertar algum dia para a rescisão, faça antes.
              </p>
            )}
            {info.summary.also_leader && (
              <p className="text-amber-500">
                Essa pessoa também é gestora ({info.summary.also_leader.name}). O acesso de gestora não muda — só o cadastro de colaboradora sai.
              </p>
            )}

            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
              <span className="text-text-secondary">Confirmo que {employee.name} foi demitido(a) e deve sair do Databank.</span>
            </label>

            {needsTypedName && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  Como a Sólides não confirma a demissão, digite o nome completo para remover:
                </label>
                <input
                  type="text"
                  value={typedName}
                  onChange={e => setTypedName(e.target.value)}
                  placeholder={employee.name}
                  className="input"
                />
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={!info || !confirmed || !typedOk || saving}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Removendo...' : 'Remover'}
          </button>
        </div>
      </div>
    </div>
  );
}
