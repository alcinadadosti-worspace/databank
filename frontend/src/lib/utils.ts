import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '—';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function classificationColor(c: string | null): string {
  switch (c) {
    case 'late': return 'text-status-danger';
    case 'overtime': return 'text-status-warning';
    case 'normal': return 'text-status-success';
    default: return 'text-text-tertiary';
  }
}

export function classificationBadge(c: string | null): string {
  switch (c) {
    case 'late': return 'badge-late';
    case 'overtime': return 'badge-overtime';
    case 'normal': return 'badge-normal';
    default: return 'badge bg-bg-hover text-text-tertiary';
  }
}

export function classificationLabel(c: string | null): string {
  switch (c) {
    case 'late': return 'Atraso';
    case 'overtime': return 'Hora Extra';
    case 'normal': return 'Normal';
    default: return 'Pendente';
  }
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
