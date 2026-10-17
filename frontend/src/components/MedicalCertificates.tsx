'use client';

import { useEffect, useMemo, useState } from 'react';
import { getMedicalCertificates, fetchMedicalCertificateFile, type MedicalCertificate } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';

type AuthType = 'admin' | 'manager';

export function certificateKey(employeeId: number, date: string): string {
  return `${employeeId}|${date}`;
}

export function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Atestados for the days on screen (one request for the whole date range),
 * indexed by employee + day. No authType = feature off for that screen.
 */
export function useMedicalCertificates(authType: AuthType | undefined, dates: string[]) {
  const [start, end] = useMemo(() => {
    if (dates.length === 0) return ['', ''];
    let min = dates[0];
    let max = dates[0];
    for (const d of dates) {
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return [min, max];
  }, [dates]);

  const [byDay, setByDay] = useState<Map<string, MedicalCertificate[]>>(new Map());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!authType || !start) {
      setByDay(new Map());
      return;
    }
    let cancelled = false;
    getMedicalCertificates(start, end, authType)
      .then(({ certificates }) => {
        if (cancelled) return;
        const map = new Map<string, MedicalCertificate[]>();
        for (const c of certificates) {
          const key = certificateKey(c.employee_id, c.date);
          map.set(key, [...(map.get(key) ?? []), c]);
        }
        setByDay(map);
      })
      .catch(error => console.error('Failed to load medical certificates:', error));
    return () => { cancelled = true; };
  }, [authType, start, end, version]);

  return { byDay, reload: () => setVersion(v => v + 1) };
}

/** 📎 next to a justification/record; opens the files in a modal. */
export function CertificateButton({ certificates, authType }: { certificates?: MedicalCertificate[]; authType: AuthType }) {
  const [open, setOpen] = useState(false);
  if (!certificates || certificates.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-accent hover:underline flex-shrink-0 whitespace-nowrap"
        title="Ver atestado enviado pelo colaborador"
      >
        <span aria-hidden>📎</span>
        Atestado{certificates.length > 1 ? ` (${certificates.length})` : ''}
      </button>
      {open && <CertificateViewer certificates={certificates} authType={authType} onClose={() => setOpen(false)} />}
    </>
  );
}

type FileState = { url?: string; error?: string };

export function CertificateViewer({
  certificates, authType, onClose,
}: { certificates: MedicalCertificate[]; authType: AuthType; onClose: () => void }) {
  const [files, setFiles] = useState<Record<string, FileState>>({});

  // Files come with the login token as blobs; object URLs are freed on close
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    for (const c of certificates) {
      fetchMedicalCertificateFile(c.id, authType)
        .then(blob => {
          const url = URL.createObjectURL(blob);
          if (cancelled) { URL.revokeObjectURL(url); return; }
          urls.push(url);
          setFiles(prev => ({ ...prev, [c.id]: { url } }));
        })
        .catch(err => {
          if (!cancelled) setFiles(prev => ({ ...prev, [c.id]: { error: err.message || 'Erro ao abrir o arquivo' } }));
        });
    }
    return () => {
      cancelled = true;
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  }, [certificates, authType]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const first = certificates[0];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl max-w-3xl w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Atestado médico"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-text-primary">Atestado médico</h3>
            <p className="text-sm text-text-tertiary truncate">
              {first.employee_name} · {formatDate(first.date)}
              {first.is_test && <span className="ml-2 badge bg-purple-500/10 text-purple-500">Teste</span>}
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary text-sm flex-shrink-0">Fechar</button>
        </div>

        <div className="space-y-4">
          {certificates.map(c => {
            const state = files[c.id];
            const isHeic = c.mimetype === 'image/heic';
            return (
              <div key={c.id} className="border border-border rounded-md p-3 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary break-all">{c.filename}</p>
                    <p className="text-xs text-text-muted">
                      {formatFileSize(c.size)} · enviado em {formatDateTime(c.uploaded_at)}
                      {c.uploaded_by === 'manager' && ' pelo gestor'}
                    </p>
                  </div>
                  {state?.url && (
                    <div className="flex gap-2 flex-shrink-0">
                      {!isHeic && (
                        <a href={state.url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">Abrir</a>
                      )}
                      <a href={state.url} download={c.filename} className="btn-secondary text-xs">Baixar</a>
                    </div>
                  )}
                </div>

                {!state && <p className="text-xs text-text-tertiary">Carregando...</p>}
                {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
                {state?.url && c.mimetype.startsWith('image/') && !isHeic && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={state.url} alt={`Atestado de ${c.employee_name}`} className="max-h-[60vh] w-full object-contain rounded bg-bg-primary" />
                )}
                {state?.url && isHeic && (
                  <p className="text-xs text-text-tertiary">
                    Foto de iPhone (HEIC): a maioria dos navegadores não mostra esse formato. Clique em Baixar para abrir no computador.
                  </p>
                )}
                {state?.url && c.mimetype === 'application/pdf' && (
                  <iframe src={state.url} title={c.filename} className="w-full h-[60vh] rounded border border-border bg-white" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
