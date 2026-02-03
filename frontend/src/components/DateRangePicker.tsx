'use client';

import { useState } from 'react';
import { todayISO, daysAgo } from '@/lib/utils';

interface DateRangePickerProps {
  onRangeChange: (start: string, end: string) => void;
}

export default function DateRangePicker({ onRangeChange }: DateRangePickerProps) {
  const [start, setStart] = useState(daysAgo(30));
  const [end, setEnd] = useState(todayISO());

  const presets = [
    { label: '7 dias', days: 7 },
    { label: '15 dias', days: 15 },
    { label: '30 dias', days: 30 },
    { label: '60 dias', days: 60 },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={start}
          onChange={(e) => { setStart(e.target.value); onRangeChange(e.target.value, end); }}
          className="input w-auto"
        />
        <span className="text-text-muted text-xs">ate</span>
        <input
          type="date"
          value={end}
          onChange={(e) => { setEnd(e.target.value); onRangeChange(start, e.target.value); }}
          className="input w-auto"
        />
      </div>
      <div className="flex items-center gap-1">
        {presets.map((p) => (
          <button
            key={p.days}
            onClick={() => {
              const s = daysAgo(p.days);
              const e = todayISO();
              setStart(s);
              setEnd(e);
              onRangeChange(s, e);
            }}
            className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary bg-bg-tertiary hover:bg-bg-hover border border-border rounded transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
