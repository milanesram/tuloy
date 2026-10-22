import { normalizeUrl } from './core/url-key.mjs';
import { opportunityIdentityMatches } from './ops.mjs';

// Posting identities only: never suppress an employer or a similar role title.
// Keep functional query parameters (gh_jid, etc.) and the existing requisition
// safeguards; normalize tracking parameters before using the shared matcher.
export function sameDismissedPosting(left, right) {
  const leftUrl = normalizeUrl(left?.url);
  const rightUrl = normalizeUrl(right?.url);
  if (!leftUrl || !rightUrl) return false;
  // An employer conflict blocks application association, but the user can
  // still dismiss that exact posting. Alias matching stays conservative.
  if (leftUrl === rightUrl) return true;
  return opportunityIdentityMatches({ ...left, url: leftUrl }, { ...right, url: rightUrl });
}

export function isDismissed(offer, dismissals) {
  return dismissals.some(entry => sameDismissedPosting(offer, entry.offer));
}

export function activeOffers(offers, dismissals) {
  return offers.filter(offer => !isDismissed(offer, dismissals));
}
