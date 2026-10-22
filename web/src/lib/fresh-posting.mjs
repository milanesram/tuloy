// Strict publication evidence shared by the scanner and the daily review view.
// Creation, last publication, scan time, relative labels and date-only values
// never establish an original posting timestamp.
export const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCES = new Set(['greenhouse:first_published', 'builtin:JobPosting.datePosted']);
export function originalPostingMs(evidence) {
  if (!evidence || !SOURCES.has(evidence.source) || typeof evidence.value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(evidence.value)) return null;
  let url;
  try { url = new URL(evidence.url); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (evidence.source === 'greenhouse:first_published' && url.hostname !== 'boards-api.greenhouse.io') return null;
  if (evidence.source === 'builtin:JobPosting.datePosted' && url.hostname !== 'www.builtinchicago.org') return null;
  const ms = Date.parse(evidence.value);
  return Number.isFinite(ms) && !Number.isNaN(Date.parse(evidence.value.slice(0, 10)))
    && new Date(Date.parse(evidence.value.slice(0, 10))).toISOString().slice(0, 10) === evidence.value.slice(0, 10) ? ms : null;
}
export function freshPostingVerdict(evidence, now = Date.now()) {
  const ms = originalPostingMs(evidence);
  if (ms === null) return 'missing_date';
  if (ms > now) return 'future_date';
  return ms >= now - DAY_MS ? 'fresh' : 'older';
}
export function evidenceFromPipelineLine(line) {
  const labels = Object.fromEntries(line.split('|').slice(3).map(part => {
    const match = part.trim().match(/^(original_posted(?:_source|_url)?):\s*(.*)$/);
    return match ? [match[1], match[2]] : [];
  }).filter(pair => pair.length));
  return { value: labels.original_posted, source: labels.original_posted_source, url: labels.original_posted_url };
}

export function dailyDiscoveryCategory(evidence, previouslySeen, now = Date.now()) {
  const verdict = freshPostingVerdict(evidence, now);
  if (verdict === 'fresh') return 'VERIFIED_FRESH';
  if (verdict === 'older') return 'CONFIRMED_OLDER';
  if (verdict === 'future_date') return 'INVALID_DATE';
  return previouslySeen ? 'PREVIOUSLY_SEEN' : 'NEWLY_DISCOVERED';
}
export function dailyReviewEligible(job, enabled, now = Date.now()) {
  if (job.done) return false;
  if (!enabled) return true;
  const verdict = freshPostingVerdict(job.originalPosting, now);
  if (verdict === 'fresh') return true;
  const discovered = typeof job.discoveredAt === 'string' ? Date.parse(job.discoveredAt) : NaN;
  return verdict === 'missing_date' && job.discoveryCategory === 'NEWLY_DISCOVERED'
    && Number.isFinite(discovered) && discovered <= now && discovered >= now - DAY_MS;
}

// Explicit user selections remain visible separately from the daily feed.
export function reviewQueueVisible(job, enabled, now=Date.now()) {
  return !job.done && (job.manualReview === true || dailyReviewEligible(job, enabled, now));
}

// Source-reported, first-seen, updated and repost dates never become original
// publication claims on Explore cards, including restored browser sessions.
export function postingFreshnessLabel(job, now=Date.now()) {
  const verdict=freshPostingVerdict(job?.originalPosting,now);
  if(verdict==='fresh') return `Verified original publication: ${job.originalPosting.value}`;
  if(verdict==='older') return `Original publication outside 24 hours: ${job.originalPosting.value}`;
  if(verdict==='future_date') return 'Original publication date invalid (future)';
  if(job?.discoveryCategory==='STRATEGY_REASSESSMENT') return 'V5 reassessment — original publication unverified';
  if(job?.discoveryCategory==='NEWLY_DISCOVERED' && dailyReviewEligible(job,true,now)) return 'Newly discovered — original publication unverified';
  return 'Original publication unverified';
}
