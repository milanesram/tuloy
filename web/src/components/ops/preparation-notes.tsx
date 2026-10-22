"use client";

import { useEffect, useMemo, useState } from 'react';
import type { OpsOpportunity } from '@/lib/career-ops';
import { emptyPreparation, evidenceReviewTasks, preparationKey } from '@/lib/preparation.mjs';

type EvidenceNote = { id: string; status: string; note: string; sourceUrl: string; basis: string };
type Preparation = {
  url: string; revision: number; stage: string; decision: string; resumeVersion: string;
  documentReferences: string; nextAction: string; chatgptSummary: string;
  evidence: EvidenceNote[]; updatedAt: string | null;
};
type Task = { id: string; label: string; instruction: string; basis: string };
const stages = [['reviewing', 'Reviewing'], ['selected', 'Selected for application'], ['preparing', 'Preparing documents'], ['ready', 'Ready for manual submission'], ['on_hold', 'On hold']];
const inputClass = 'mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand';

export function PreparationNotes({ job, onStage, onDirty }: { job: OpsOpportunity; onStage: (url: string, stage: string) => void; onDirty: (dirty: boolean) => void }) {
  const tasks = useMemo(() => evidenceReviewTasks(job) as Task[], [job]);
  const [form, setForm] = useState<Preparation>(emptyPreparation(job.url));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const safe = Boolean(preparationKey(job.url));
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false); setDirty(false); setMessage('');
    if (!safe) { setLoading(false); setFailed(true); return; }
    fetch(`/api/ops/preparation?url=${encodeURIComponent(job.url)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load preparation notes.');
        setForm(result.record);
        onStage(result.record.url, result.record.stage);
      })
      .catch(error => { if (error.name !== 'AbortError') { setFailed(true); setMessage(error.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [job.url, safe, reload, onStage]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function change(field: keyof Preparation, value: string) {
    setForm(current => ({ ...current, [field]: value })); setDirty(true); setMessage('');
  }
  function evidenceFor(task: Task): EvidenceNote {
    const prior = form.evidence.find(note => note.id === task.id);
    return { id: task.id, status: prior?.basis === task.basis ? prior.status : 'pending', note: prior?.note || '', sourceUrl: prior?.sourceUrl || '', basis: task.basis };
  }
  function changeEvidence(task: Task, field: keyof EvidenceNote, value: string) {
    const note = { ...evidenceFor(task), [field]: value };
    setForm(current => ({ ...current, evidence: [...current.evidence.filter(item => item.id !== task.id), note] }));
    setDirty(true); setMessage('');
  }
  async function save() {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/ops/preparation', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: job.url, expectedRevision: form.revision, patch: {
          stage: form.stage, decision: form.decision, resumeVersion: form.resumeVersion,
          documentReferences: form.documentReferences, nextAction: form.nextAction, chatgptSummary: form.chatgptSummary,
          evidence: [...form.evidence.filter(note => !tasks.some(task => task.id === note.id)), ...tasks.map(evidenceFor)],
        } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save preparation notes.');
      setForm(result.record); setDirty(false); onStage(result.record.url, result.record.stage);
      setMessage('Preparation saved locally. Eligibility and application status are unchanged.');
      window.dispatchEvent(new Event('co-preparation-changed'));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save preparation notes.'); }
    finally { setSaving(false); }
  }

  return (
    <section id="preparation-notes" aria-labelledby="preparation-heading" className="rounded-xl border border-border bg-background/50 p-4">
      <h3 id="preparation-heading" className="font-medium">Preparation and Career Project return</h3>
      <p className="mt-1 text-xs leading-5 text-muted">Save your stage, documents and reviewed decision here after working in ChatGPT. These private notes persist across refreshes; they do not confirm eligibility or record a submission.</p>
      {message && <p role="status" className="mt-3 whitespace-pre-wrap text-sm text-muted">{message}</p>}
      {loading ? <p className="mt-3 text-sm text-muted">Loading saved preparation…</p> : failed ? (
        <div className="mt-3 text-sm text-muted"><p>{safe ? 'Notes are unavailable. Saving is disabled to protect existing records.' : 'A valid posting URL is needed to save preparation.'}</p>
          {safe && <button type="button" onClick={() => setReload(n => n + 1)} className="mt-2 underline">Retry loading</button>}</div>
      ) : (
        <form onSubmit={event => { event.preventDefault(); void save(); }} className="mt-4 space-y-4">
          <fieldset disabled={saving} className="space-y-4 disabled:opacity-60">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-muted">Preparation stage<select value={form.stage} onChange={event => change('stage', event.target.value)} className={inputClass}>{stages.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="text-xs text-muted">Reviewed decision<select value={form.decision} onChange={event => change('decision', event.target.value)} className={inputClass}><option value="undecided">Undecided</option><option value="pursue">Pursue</option><option value="hold">Hold for more evidence</option><option value="pass">Pass — keep this note</option></select></label>
            </div>
            <label className="block text-xs text-muted">Resume version<input value={form.resumeVersion} maxLength={300} onChange={event => change('resumeVersion', event.target.value)} placeholder="Approved resume filename or version" className={inputClass} /></label>
            <label className="block text-xs text-muted">Prepared document references<textarea value={form.documentReferences} maxLength={4000} rows={2} onChange={event => change('documentReferences', event.target.value)} placeholder="Filenames or references; no files are uploaded" className={inputClass} /></label>
            <label className="block text-xs text-muted">Next action<textarea value={form.nextAction} maxLength={4000} rows={2} onChange={event => change('nextAction', event.target.value)} className={inputClass} /></label>
            <label className="block text-xs text-muted">Decision returned from ChatGPT<textarea value={form.chatgptSummary} maxLength={12000} rows={4} onChange={event => change('chatgptSummary', event.target.value)} placeholder="Paste the reviewed conclusion, rationale and outstanding questions. This does not add facts to your CV." className={inputClass} /></label>
            {tasks.length > 0 && <div className="space-y-3"><h4 className="text-sm font-medium">Evidence tasks</h4><p className="text-xs text-muted">Record your research without changing the automated assessment. “Could not confirm” keeps uncertainty explicit.</p>
              {tasks.map(task => {
                const note = evidenceFor(task);
                const changed = form.evidence.some(item => item.id === task.id && item.basis !== task.basis);
                return <fieldset key={task.id} className="space-y-2 rounded-lg border border-border p-3"><legend className="px-1 text-sm font-medium">{task.label}</legend><p className="text-xs leading-5 text-muted">{task.instruction}</p>
                  {changed && <p className="text-xs text-muted">The posting evidence changed since this note. Review it again before saving.</p>}
                  <label className="block text-xs text-muted">{task.label}: research status<select value={note.status} onChange={event => changeEvidence(task, 'status', event.target.value)} className={inputClass}><option value="pending">Needs checking</option><option value="reviewed">Reviewed — see my note</option><option value="cannot_confirm">Could not confirm</option></select></label>
                  <label className="block text-xs text-muted">{task.label}: evidence note<textarea value={note.note} maxLength={4000} rows={2} onChange={event => changeEvidence(task, 'note', event.target.value)} className={inputClass} /></label>
                  <label className="block text-xs text-muted">{task.label}: source URL<input type="url" value={note.sourceUrl} maxLength={2000} onChange={event => changeEvidence(task, 'sourceUrl', event.target.value)} className={inputClass} /></label>
                </fieldset>;
              })}
            </div>}
            {form.evidence.some(note => !tasks.some(task => task.id === note.id)) && <details className="text-xs text-muted"><summary className="cursor-pointer">Previous evidence notes — retained</summary>{form.evidence.filter(note => !tasks.some(task => task.id === note.id)).map(note => <p key={note.id} className="mt-2 whitespace-pre-wrap">{note.id}: {note.status.replaceAll('_', ' ')} — {note.note}{note.sourceUrl ? ` (${note.sourceUrl})` : ''}</p>)}</details>}
            <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={!dirty || !safe} className="min-h-10 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50">{saving ? 'Saving preparation…' : 'Save preparation'}</button>
              <button type="button" onClick={() => { if (!dirty || window.confirm('Discard unsaved edits and load the latest saved notes?')) setReload(n => n + 1); }} className="min-h-10 px-2 text-xs text-muted underline">Reload saved notes</button>
              <span className="text-xs text-muted">{dirty ? 'Unsaved changes' : form.updatedAt ? `Saved ${new Date(form.updatedAt).toLocaleString()}` : 'No saved preparation yet'}</span>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
