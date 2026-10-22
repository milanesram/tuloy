// Explore and Queue project the same evidence through the same evaluator.
import { classifyLiteOpportunity } from './lite-recommendation.mjs';
import { dailyReviewEligible } from './fresh-posting.mjs';
export function qualifyDiscoveredOffer(offer, { candidateLocation='', candidateEvidence={}, daily=false, now=Date.now() }={}) {
  const qualification=classifyLiteOpportunity({ ...offer, title:offer.title,
    jd:offer.description || '', jdQuality:offer.descriptionComplete === true ? 'COMPLETE' : offer.description ? 'PARTIAL' : 'MISSING',
    candidateLocation, candidateEvidence });
  const fresh=dailyReviewEligible(offer,daily,now);
  return { ...qualification, manualReviewEligible:qualification.applicationReadiness !== 'NOT_ACTIONABLE', queueEligible:fresh && qualification.applicationReadiness === 'READY_FOR_REVIEW',
    queueEligibilityReasons:[...qualification.readinessReasons,...(!fresh ? ['DAILY_FRESHNESS_UNVERIFIED: retain in discovery; original publication is not verified in the daily window'] : [])] };
}
