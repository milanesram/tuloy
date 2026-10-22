import { normalizeUrl } from './core/url-key.mjs';

export const PREPARATION_STAGES = ['reviewing', 'selected', 'preparing', 'ready', 'on_hold'];
export const REVIEW_DECISIONS = ['undecided', 'pursue', 'hold', 'pass'];
export function preparationKey(url) {
  try { const u = new URL(url); if (u.username || u.password) return ''; }
  catch { return ''; }
  return normalizeUrl(url);
}

export function emptyPreparation(url) {
  return { url: preparationKey(url), revision: 0, stage: 'reviewing', decision: 'undecided', resumeVersion: '', documentReferences: '', nextAction: '', chatgptSummary: '', evidence: [], updatedAt: null };
}

/** Research tasks are derived from current evidence, not a new eligibility engine.
 * Saving a research note never changes classifier output or tracker status. */
export function evidenceReviewTasks(job) {
  const reasons = [...(job.readinessReasons || []), ...(job.gateReasons || [])].join('\n');
  const tasks = [];
  const add = (id, label, instruction, evidence) => tasks.push({ id, label, instruction, basis: JSON.stringify(evidence) });
  if (['AMBIGUOUS', 'CONFLICT'].includes(job.employerIdentityStatus))
    add('identity', 'Confirm the employer', 'Compare the source listing with the employer careers page. Record what agrees or remains unclear.', [job.employerIdentityStatus, job.employerIdentityEvidence]);
  if (job.postingStatus !== 'ACTIVE')
    add('posting', 'Check whether the employer is still hiring', 'Open the employer posting and note the date and evidence you checked.', [job.postingStatus, job.url]);
  if (job.jdQuality !== 'COMPLETE')
    add('jd', 'Retrieve the complete requirements', 'Review the full employer job description. Record a reference or what is still missing.', [job.jdQuality, job.jd]);
  if (/LOCATION|REMOTE_STATE|TRAVEL|WORK_ARRANGEMENT/i.test(reasons))
    add('location', 'Check location and work arrangement', 'Confirm eligible locations, onsite expectations and travel from employer evidence. A Remote label alone is insufficient.', [job.location, job.workArrangement, job.workArrangementReasons, reasons.match(/[^\n]*(?:LOCATION|REMOTE_STATE|TRAVEL|WORK_ARRANGEMENT)[^\n]*/gi)]);
  if ((job.materialRequirements || []).some(r => r.importance !== 'PREFERRED' && r.candidateEvidence !== 'SUPPORTED'))
    add('requirements', 'Compare mandatory qualifications', 'Record which requirements your approved experience supports and which remain unresolved. Do not infer credentials or authorization.', job.materialRequirements);
  if (/CLASSIFICATION_UNRESOLVED/.test(reasons))
    add('scope', 'Review role scope and resume route', 'Read the responsibilities and select the appropriate approved resume base.', [job.careerLaneCode, job.seniorityClassification, job.jd]);
  return tasks;
}

export function preparationCounts(records) {
  return {
    selected: records.filter(r => r.stage === 'selected').length,
    preparing: records.filter(r => r.stage === 'preparing').length,
    ready: records.filter(r => r.stage === 'ready').length,
    returned: records.filter(r => r.chatgptSummary?.trim()).length,
  };
}
