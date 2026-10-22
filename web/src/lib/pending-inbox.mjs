import { normalizeUrl } from './core/url-key.mjs';

/** A discovery already represented by a tracker URL belongs in the tracker.
 * This is a read-only projection: never mark pipeline rows done or infer a
 * submission. Match only canonical URL keys; a shared company/title is not
 * enough to hide a distinct requisition. Missing URLs remain visible.
 * @template {{url?: string, done?: boolean}} T
 * @param {T[]} inbox
 * @param {{url?: string}[]} applications
 * @returns {T[]}
 */
export function pendingInboxJobs(inbox, applications) {
  const tracked = new Set(applications.map(row => normalizeUrl(row.url)).filter(Boolean));
  const seen = new Set();
  return inbox.filter(job => {
    if (job.done) return false;
    const key = normalizeUrl(job.url);
    if (!key) return true;
    if (tracked.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
