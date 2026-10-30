'use client';

import { useEffect, useMemo, useState } from 'react';
import { getEmployees, getEmployeesByLeader, createMedicalLeave, type Employee } from '@/lib/api';
import { formatDate, todayInSaoPaulo } from '@/lib/utils';
import { formatFileSize } from '@/components/MedicalCertificates';

/** Same limits as the backend (routes/medical-certificates.ts) */
const MAX_DAYS = 365;
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Registers an atestado: whole days (calendar days, counting the first) or hours
 * on a single day, with the scanned document. RH picks anyone and the file is
 * optional; a gestor (leaderId) picks from their team and must attach the file.
 */
export default function MedicalLeaveForm({ authType, leaderId, onClose, onSaved }: {
  authType: 'admin' | 'manager';
  leaderId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isManager = authType === 'manager';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState(0);
  const [kind, setKind] = useState<'days' | 'hours'>('days');
  const [startDate, setStartDate] = useState(todayInSaoPaulo());
  const [days, setDays] = useState('1');
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Same team the backend accepts: direct reports + secondary approvals
    if (isManager && !leaderId) return;
    (isManager ? getEmployeesByLeader(leaderId!) : getEmployees())
      .then(data => setEmployees(data.employees))
      .catch(() => setError('Não foi possível carregar os colaboradores'));
  }, [isManager, leaderId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const employeesByLeader = useMemo(() => {
    const grouped = new Map<string, Employee[]>();
    for (const emp of employees) {
      const leader = emp.leader_name || 'Sem gestor';
      if (!grouped.has(leader)) grouped.set(leader, []);
      grouped.get(leader)!.push(emp);
    }
    for (const group of grouped.values()) group.sort((a, b) => a.name.localeCompare(b.name));
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [employees]);

  const daysNumber = Number(days);
  const daysValid = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= MAX_DAYS;
  const endDate = kind === 'days' && daysValid && startDate ? addDays(startDate, daysNumber - 1) : null;
  const totalHours = hours + minutes / 60;

  function handleFiles(input: HTMLInputElement) {
    const picked = Array.from(input.files ?? []);
    const problem = picked.length > MAX_FILES
      ? `Escolha no máximo ${MAX_FILES} arquivos`
      : picked.find(f => f.size > MAX_FILE_BYTES)?.name;
    if (problem) {
      setError(picked.length > MAX_FILES ? problem : `"${problem}" passa de 10 MB`);
      // Clear the picker too: otherwise it still shows the refused files and the
      // atestado would be launched without any of them
      input.value = '';
      setFiles([]);
      return;
    }
    setError('');
    setFiles(picked);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!employeeId) { setError('Escolha o colaborador'); return; }
    if (!startDate) { setError('Informe a data'); return; }
    if (kind === 'days' && !daysValid) { setError(`A quantidade de dias deve ser de 1 a ${MAX_DAYS}`); return; }
    if (kind === 'hours' && totalHours <= 0) { setError('Informe as horas do atestado'); return; }
    if (isManager && files.length === 0) { setError('Anexe o arquivo do atestado (PDF ou foto)'); return; }

    const form = new FormData();
    form.append('employee_id', String(employeeId));
    form.append('kind', kind);
    form.append('start_date', startDate);
    if (kind === 'days') form.append('days', String(daysNumber));
    else form.append('hours', String(totalHours));
    if (notes.trim()) form.append('notes', notes.trim());
    for (const f of files) form.append('files', f);

    setSaving(true);
    try {
      await createMedicalLeave(form, authType);
      onSaved();
    } catch (err) {
      setError((err as Error).message || 'Erro ao lançar o atestado');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Lançar atestado"
      >
        <h3 className="text-lg font-semibold text-text-primary mb-4">Lançar atestado</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Colaborador</label>
            <select
              value={employeeId}
              onChange={e => setEmployeeId(Number(e.target.value))}
              required
              className="input w-full"
            >
              <option value={0}>Selecione um colaborador...</option>
              {employeesByLeader.map(([leader, emps]) => (
                <optgroup key={leader} label={leader}>
                  {emps.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">O atestado é de</label>
            <div className="grid grid-cols-2 gap-2">
              {(['days', 'hours'] as const).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`px-3 py-2 text-sm rounded-md border transition-colors ${kind === k
                    ? 'border-accent-primary bg-accent-primary/10 text-text-primary font-medium'
                    : 'border-border text-text-secondary hover:bg-bg-hover'}`}
                >
                  {k === 'days' ? 'Dias' : 'Horas'}
                </button>
              ))}
            </div>
          </div>

          {kind === 'days' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Primeiro dia</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Quantidade de dias</label>
                <input
                  type="number"
                  value={days}
                  onChange={e => setDays(e.target.value)}
                  min={1}
                  max={MAX_DAYS}
                  step={1}
                  required
                  className="input w-full"
                />
              </div>
              <p className="col-span-2 text-xs text-text-muted -mt-2">
                {endDate
                  ? `Até ${formatDate(endDate)} — ${daysNumber} dia${daysNumber > 1 ? 's' : ''} corrido${daysNumber > 1 ? 's' : ''}, contando o primeiro.`
                  : `De 1 a ${MAX_DAYS} dias corridos, contando o primeiro.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Dia</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Horas</label>
                <select
                  value={hours}
                  onChange={e => {
                    const h = Number(e.target.value);
                    setHours(h);
                    if (h === 12) setMinutes(0); // 12h is the most the backend takes
                  }}
                  className="input w-full"
                >
                  {Array.from({ length: 13 }, (_, h) => <option key={h} value={h}>{h}h</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Minutos</label>
                <select value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="input w-full">
                  {[0, 15, 30, 45].map(m => <option key={m} value={m} disabled={hours === 12 && m > 0}>{m} min</option>)}
                </select>
              </div>
              <p className="col-span-3 text-xs text-text-muted -mt-2">
                Essas horas saem da jornada do dia: não contam como atraso nem geram alerta.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Arquivo do atestado{isManager ? '' : ' (opcional)'}
            </label>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*"
              onChange={e => handleFiles(e.target)}
              className="block w-full text-sm text-text-secondary file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-bg-tertiary file:text-text-primary"
            />
            {files.length > 0 && (
              <ul className="mt-1 text-xs text-text-muted space-y-0.5">
                {files.map(f => <li key={f.name} className="break-all">{f.name} · {formatFileSize(f.size)}</li>)}
              </ul>
            )}
            <p className="text-xs text-text-muted mt-1">PDF ou foto, até {MAX_FILES} arquivos de 10 MB.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Observação (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Não coloque CID nem diagnóstico"
              className="input w-full"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary px-4 py-2 text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">
              {saving ? 'Salvando...' : 'Lançar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
