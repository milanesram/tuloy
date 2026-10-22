"use client";
import { useEffect, useState } from 'react';
import { preparationCounts } from '@/lib/preparation.mjs';

export function PreparationStats() {
  const [counts, setCounts] = useState<ReturnType<typeof preparationCounts> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/ops/preparation', { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (active) { setCounts(preparationCounts(result.records)); setError(false); }
      } catch { if (active) setError(true); }
    };
    void load(); window.addEventListener('co-preparation-changed', load);
    return () => { active = false; window.removeEventListener('co-preparation-changed', load); };
  }, []);
  if (error) return <p className="mt-6 text-sm text-muted">Saved preparation totals are unavailable. Application totals remain separate.</p>;
  if (!counts || !Object.values(counts).some(Boolean)) return null;
  return <section className="mt-8 border-t border-border pt-5"><h2 className="text-sm font-medium">Saved preparation notes</h2><p className="mt-1 text-xs text-muted">User-recorded stages across saved notes, including historical applications. “Ready” is a preparation label; eligibility and submission remain separate.</p><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{[['Selected', counts.selected], ['Preparing', counts.preparing], ['Ready', counts.ready], ['Career Project returns', counts.returned]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-lg tabular-nums">{value}</dd></div>)}</dl></section>;
}
