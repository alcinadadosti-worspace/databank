'use client';

import { cn } from '@/lib/utils';

interface StatsCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

export default function StatsCard({ label, value, sublabel, variant = 'default' }: StatsCardProps) {
  const valueColor = {
    default: 'text-text-primary',
    success: 'text-status-success',
    danger: 'text-status-danger',
    warning: 'text-status-warning',
  }[variant];

  return (
    <div className="card animate-fade-in">
      <p className="text-xs text-text-tertiary font-medium uppercase tracking-wider">{label}</p>
      <p className={cn('text-2xl font-semibold mt-1', valueColor)}>{value}</p>
      {sublabel && <p className="text-xs text-text-muted mt-1">{sublabel}</p>}
    </div>
  );
}
