// Optional evidence in the existing pipeline row, not a second JD store.
// The small text fingerprint detects stale structural offsets, not authenticity.
export function textFingerprint(value = '') {
  let n = 2166136261;
  for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return (n >>> 0).toString(16);
}
export function postingEvidence(job = {}) {
  const result = {};
  for (const key of ['employerRequisitionId','providerInternalJobId','sourceBoard','sourceWorkArrangement','rawLocation','employmentType','jdTextFingerprint']) {
    if (typeof job[key] === 'string' && job[key].trim() && job[key].length <= 1000) result[key] = job[key].trim();
  }
  if (Array.isArray(job.descriptionBreaks) && job.descriptionBreaks.length <= 5000 && job.descriptionBreaks.every(n => Number.isSafeInteger(n) && n > 0)) result.descriptionBreaks = [...new Set(job.descriptionBreaks)].sort((a,b) => a-b);
  return result;
}
export function encodePostingEvidence(job) { return Buffer.from(JSON.stringify(postingEvidence(job))).toString('base64url'); }
export function decodePostingEvidence(raw) {
  if (!raw) return {};
  try { if (!/^[\w-]+$/.test(raw) || raw.length > 100000) return {}; return postingEvidence(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))); } catch { return {}; }
}
export function structuredQualificationText(jd, evidence = {}) {
  if (textFingerprint(jd) !== evidence.jdTextFingerprint || !Array.isArray(evidence.descriptionBreaks)) return jd;
  let value = jd;
  for (const offset of [...evidence.descriptionBreaks].sort((a,b) => b-a)) {
    if (offset > 0 && offset < value.length && jd[offset-1] === ' ') value = value.slice(0,offset-1) + '\n' + value.slice(offset);
  }
  return value;
}
/** Explicit employer/board-scoped evidence only. Never text/title similarity.
 * This key groups display variants; it does NOT authorize tracker association. */
export function employerRequisitionKey(job = {}) {
  if (!['CONSISTENT','CONFIRMED'].includes(job.employerIdentityStatus) || job.identityMetadataInvalid) return null;
  const parts = [job.sourceProvider,job.sourceBoard,job.company,job.employerRequisitionId];
  if (!parts.every(v => typeof v === 'string' && v.trim() && v !== 'Not captured')) return null;
  if (!['greenhouse','lever','ashby','workday'].includes(job.sourceProvider.toLowerCase())) return null;
  const internal = job.providerInternalJobId === 'Not captured' ? '' : job.providerInternalJobId || '';
  return JSON.stringify([job.sourceProvider.toLowerCase(),job.sourceBoard.trim(),job.company.trim().normalize('NFKC').toLowerCase(),job.employerRequisitionId.trim(),internal]);
}
export function trackedRequisitionVariant(job, inbox = [], applications = []) {
  const key = employerRequisitionKey(job);
  if (!key) return null;
  const aliases = inbox.filter(r => r.url !== job.url && employerRequisitionKey(r) === key);
  // This only blocks a new write for human resolution. A changed historical
  // title/employer label must not bypass a strong alias-URL collision, and
  // never becomes permission to attach to or modify that historical row.
  return applications.find(app => aliases.some(alias => alias.url === app.url)) || null;
}
