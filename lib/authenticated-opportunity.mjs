// Canonicalization/deduplication handoff for authenticated discovery.
// No browser context, cookies, headers or storage are accepted here: the only
// inputs are extracted public job metadata and public URLs.

import { checkLivenessViaApi, resolveAtsApi } from '../liveness-api.mjs';
import {
  companyRoleDedupKey,
  normalizeUrlForDedup,
} from '../scan.mjs';

function stableAtsId(resolved) {
  if (!resolved?.parts) return '';
  for (const key of ['id', 'jobId', 'jobPath', 'refnr', 'slug']) {
    const value = resolved.parts[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function authenticatedOpportunityIdentity(record, canonicalization = {}) {
  const provider = canonicalization.provider || '';
  const providerJobId = canonicalization.providerJobId || '';
  if (provider && providerJobId) return `ats:${provider}:${providerJobId}`;
  if (canonicalization.canonicalUrl) return `url:${normalizeUrlForDedup(canonicalization.canonicalUrl)}`;
  if (record?.employer && record?.title) {
    return `role:${companyRoleDedupKey(record.employer, record.title, undefined, record.rawLocation)}`;
  }
  if (record?.source && record?.sourcePostingId) {
    return `source:${String(record.source).toLowerCase()}:${record.sourcePostingId}`;
  }
  return `url:${normalizeUrlForDedup(record?.url || '')}`;
}

export async function canonicalizeAuthenticatedOpportunity(record, {
  livenessCheck = checkLivenessViaApi,
} = {}) {
  const employerUrl = typeof record?.employerUrl === 'string' ? record.employerUrl : '';
  const resolved = employerUrl ? resolveAtsApi(employerUrl) : null;
  let canonicalization;

  if (resolved) {
    const liveness = await livenessCheck(employerUrl).catch(() => null);
    canonicalization = {
      state: 'PUBLIC_ATS_CANONICAL_FOUND',
      canonicalUrl: employerUrl,
      provider: resolved.ats,
      providerJobId: stableAtsId(resolved),
      liveness: liveness?.result?.toUpperCase?.() || 'UNCLEAR',
      livenessCode: liveness?.code || '',
    };
  } else if (employerUrl) {
    canonicalization = {
      state: 'PUBLIC_EMPLOYER_LINK_FOUND',
      canonicalUrl: employerUrl,
      provider: 'employer-site',
      providerJobId: '',
      liveness: 'UNCLEAR',
      livenessCode: '',
    };
  } else {
    canonicalization = {
      state: 'SOURCE ONLY / CANONICAL NOT FOUND',
      canonicalUrl: '',
      provider: '',
      providerJobId: '',
      liveness: 'SOURCE ONLY / CANONICAL NOT FOUND',
      livenessCode: '',
    };
  }

  return {
    ...record,
    canonicalization,
    identity: authenticatedOpportunityIdentity(record, canonicalization),
    sourceOccurrences: [{
      source: record.source,
      sourcePostingId: record.sourcePostingId || '',
      sourceUrl: record.url,
    }],
    // Phase 1 Greater Chicago normalization is intentionally not reimplemented
    // here. The authenticated layer preserves rawLocation until the shared
    // normalizer exists and can be consumed without semantic drift.
    normalizedLocation: null,
    locationNormalization: 'DEFERRED_TO_SHARED_NORMALIZER',
  };
}

