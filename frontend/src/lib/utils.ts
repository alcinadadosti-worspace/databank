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

export function formatDateTime(isoStr: string): string {
  const date = new Date(isoStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function classificationColor(c: string | null): string {
  switch (c) {
    case 'late': return 'text-status-danger';
    case 'overtime': return 'text-status-warning';
    case 'normal': return 'text-status-success';
    case 'ajuste': return 'text-orange-500';
    case 'sem_registro': return 'text-purple-500';
    case 'folga': return 'text-blue-500';
    case 'falta': return 'text-red-600';
    default: return 'text-text-tertiary';
  }
}

export function classificationBadge(c: string | null): string {
  switch (c) {
    case 'late': return 'badge-late';
    case 'overtime': return 'badge-overtime';
    case 'normal': return 'badge-normal';
    case 'ajuste': return 'badge bg-orange-500/10 text-orange-500';
    case 'sem_registro': return 'badge bg-purple-500/10 text-purple-500';
    case 'folga': return 'badge bg-blue-500/10 text-blue-500';
    case 'falta': return 'badge bg-red-600/10 text-red-600';
    default: return 'badge bg-bg-hover text-text-tertiary';
  }
}

export function classificationLabel(c: string | null): string {
  switch (c) {
    case 'late': return 'Atraso';
    case 'overtime': return 'Hora Extra';
    case 'normal': return 'Normal';
    case 'ajuste': return 'Ajuste';
    case 'sem_registro': return 'Sem Registro';
    case 'folga': return 'Folga';
    case 'falta': return 'Falta';
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
