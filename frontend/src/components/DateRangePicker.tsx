'use client';

import { useState, useEffect, useRef } from 'react';
import { todayISO, daysAgo } from '@/lib/utils';

interface DateRangePickerProps {
  onRangeChange: (start: string, end: string) => void;
}

export default function DateRangePicker({ onRangeChange }: DateRangePickerProps) {
  const [start, setStart] = useState(daysAgo(30));
  const [end, setEnd] = useState(todayISO());

  // Debounce the API call to avoid multiple requests when dates change rapidly
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip the initial mount - only trigger on subsequent changes
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce the callback by 300ms
    timeoutRef.current = setTimeout(() => {
      onRangeChange(start, end);
    }, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [start, end]);

  const presets = [
    { label: '7 dias', days: 7 },
    { label: '15 dias', days: 15 },
    { label: '30 dias', days: 30 },
    { label: '60 dias', days: 60 },
  ];

  // For presets, trigger immediately (no debounce)
  function handlePreset(days: number) {
    const s = daysAgo(days);
    const e = todayISO();
    setStart(s);
    setEnd(e);
    // Clear any pending debounce and trigger immediately
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onRangeChange(s, e);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="input w-auto"
        />
        <span className="text-text-muted text-xs">ate</span>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="input w-auto"
        />
      </div>
      <div className="flex items-center gap-1">
        {presets.map((p) => (
          <button
            key={p.days}
            onClick={() => handlePreset(p.days)}
            className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary bg-bg-tertiary hover:bg-bg-hover border border-border rounded transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
